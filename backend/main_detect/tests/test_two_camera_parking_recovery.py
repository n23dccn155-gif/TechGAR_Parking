from types import SimpleNamespace

import numpy as np

from techgar.slot_vehicle_binder import RecoveryBatchResult
from techgar.trajectory_memory import TrajectorySample, WorldTrajectoryMemory
from two_camera import (
    _project_points_between_cameras,
    build_recovery_track_payload,
    build_recovery_priority_regions,
    cancel_observed_recovery_tokens,
    collect_binder_global_tracks,
    recover_departing_vehicle_ids,
)


class FakeManager:
    def __init__(self):
        self.bindings = {}

    def get_global_id(self, camera_id, local_id):
        return self.bindings.get((camera_id, local_id))

    def bind_external_id(
        self,
        camera_id,
        local_id,
        global_id,
        frame_idx,
        source,
        **_proof,
    ):
        self.bindings[(camera_id, local_id)] = global_id

    @staticmethod
    def canonical_global_id(global_id):
        return int(global_id)


class FakeBinder:
    def __init__(self, token, result=None):
        self.token = token
        self.result = result or RecoveryBatchResult()
        self.received = None
        self.cancelled = []
        self.false_empty_grace_seconds = 1.25

    def export_recovery_tokens(self, _timestamp_s):
        return [self.token] if self.token is not None else []

    def batch_recover_ids(self, candidates, *_args, **_kwargs):
        self.received = dict(candidates)
        return self.result

    def cancel_recovery_for_global_id(self, global_id, reason):
        self.cancelled.append((global_id, reason))
        self.token = None

    def recovery_priority_regions(self, _timestamp_s):
        return [] if self.token is None else [self.token["polygon"]]


class EvaluatingBinder(FakeBinder):
    """Production evaluate/consume contract without hiding runner routing."""

    def __init__(self, token_value, eligible=False):
        super().__init__(token_value)
        self.eligible = bool(eligible)
        self.recovery_retention_seconds = 5.0
        self.recovery_ambiguity_margin = 0.15
        self.allowed_token_slots = None

    def batch_recover_ids(self, candidates, *_args, **kwargs):
        self.received = dict(candidates)
        self.allowed_token_slots = kwargs.get("allowed_token_slots")
        result = RecoveryBatchResult()
        if not self.eligible or not candidates:
            return result
        local_key = next(iter(candidates))
        result.eligible_pairs = [{
            "local_key": local_key,
            "slot_id": self.token["slot_id"],
            "global_id": self.token["global_id"],
            "token_slot_id": self.token["slot_id"],
            "token_global_id": self.token["global_id"],
            "token_camera_id": self.token.get("camera_id"),
            "cost": 0.12,
            "evidence_frames": 4,
        }]
        return result

    def consume_recovery_match(self, slot_id, local_key, _timestamp_s, details):
        assert slot_id == self.token["slot_id"]
        assert int(details["global_id"]) == int(self.token["global_id"])
        self.token = None
        return int(details["global_id"])


def token(slot_id="E07", global_id=30, center=(50.0, 50.0)):
    return {
        "slot_id": slot_id,
        "global_id": global_id,
        "polygon": np.asarray(
            [[20, 20], [80, 20], [80, 80], [20, 80]], dtype=np.float32
        ),
        "center": center,
    }


def track_at(x=40, y=35):
    hist = np.zeros((32, 32), dtype=np.float32)
    hist[0, 0] = 1.0
    value = SimpleNamespace(
        bbox=(x, y, 20, 30),
        appearance=hist,
        first_observation_bbox=(x, y, 20, 30),
        first_observation_timestamp_s=8.5,
    )
    return value


def test_camera_projection_round_trip_uses_shared_world_plane():
    transforms = {
        "cam1": np.eye(3, dtype=np.float64),
        "cam2": np.asarray([[1, 0, 100], [0, 1, 0], [0, 0, 1]], dtype=np.float64),
    }

    in_cam1 = _project_points_between_cameras(
        [(120, 40)], "cam2", "cam1", transforms
    )
    round_trip = _project_points_between_cameras(
        in_cam1, "cam1", "cam2", transforms
    )

    assert np.allclose(in_cam1[0], (220, 40))
    assert np.allclose(round_trip[0], (120, 40))


def test_cross_camera_payload_contains_transformed_recovery_geometry():
    transforms = {
        "cam1": np.eye(3, dtype=np.float64),
        "cam2": np.asarray([[1, 0, 100], [0, 1, 0], [0, 0, 1]], dtype=np.float64),
    }

    payload = build_recovery_track_payload(
        track_at(10, 20),
        "cam2",
        "cam1",
        transforms,
        shared_map_anchor="bbox_center",
    )

    assert payload["camera_id"] == "cam2"
    assert np.allclose(payload["recovery_position"], (120, 35))
    assert payload["recovery_bbox"][0] == 110
    assert payload["recovery_first_bbox"] is None
    assert payload["recovery_size_ratio"] == 1.0
    assert payload["recovery_first_timestamp_s"] == 8.5
    assert payload["recovery_anchor"] == "bbox_center"


def test_same_camera_payload_uses_one_explicit_anchor_for_point_and_bbox():
    transforms = {"cam1": np.eye(3, dtype=np.float64)}
    value = SimpleNamespace(
        bbox=(40, 30, 20, 30),
        first_observation_bbox=(30, 20, 16, 24),
        appearance=None,
    )

    payload = build_recovery_track_payload(
        value,
        "cam1",
        "cam1",
        transforms,
        shared_map_anchor="bbox_center",
    )

    assert payload["recovery_bbox"] == (40.0, 30.0, 20.0, 30.0)
    assert payload["recovery_first_bbox"] == (30, 20, 16, 24)
    assert np.allclose(payload["recovery_position"], (50, 45))
    assert np.allclose(payload["recovery_first_position"], (38, 32))


def test_projective_payload_projects_anchor_from_each_matching_bbox():
    transforms = {
        "cam1": np.eye(3, dtype=np.float64),
        "cam2": np.asarray(
            [[1.0, 0.08, 25.0], [0.03, 1.0, 12.0], [0.001, 0.0004, 1.0]],
            dtype=np.float64,
        ),
    }
    value = SimpleNamespace(
        bbox=(80, 40, 30, 50),
        first_observation_bbox=(55, 35, 24, 42),
        appearance=None,
    )

    payload = build_recovery_track_payload(
        value, "cam2", "cam1", transforms, shared_map_anchor="bbox_center"
    )
    expected = _project_points_between_cameras(
        [(95, 65), (67, 56)], "cam2", "cam1", transforms
    )

    assert np.allclose(payload["recovery_position"], expected[0])
    assert np.allclose(payload["recovery_first_position"], expected[1])
    point = payload["recovery_position"]
    x, y, width, height = payload["recovery_bbox"]
    assert x <= point[0] <= x + width
    assert y <= point[1] <= y + height
    # Image-box corners are not ground-plane points.  Keep the projected
    # anchor/history, but do not treat a projected historical rectangle as a
    # metrically meaningful cross-camera size constraint.
    assert payload["recovery_first_bbox"] is None
    assert payload["recovery_size_ratio"] == 1.0


def test_bottom_center_anchor_is_available_for_ground_contact_calibration():
    transforms = {"cam1": np.eye(3, dtype=np.float64)}

    payload = build_recovery_track_payload(
        track_at(10, 20),
        "cam1",
        "cam1",
        transforms,
        shared_map_anchor="bottom_center",
    )

    assert payload["recovery_anchor"] == "bottom_center"
    assert np.allclose(payload["recovery_position"], (20, 50))
    assert np.allclose(payload["recovery_first_position"], (20, 50))


def test_unknown_recovery_anchor_is_rejected():
    transforms = {"cam1": np.eye(3, dtype=np.float64)}

    try:
        build_recovery_track_payload(
            track_at(), "cam1", "cam1", transforms, shared_map_anchor="centroid"
        )
    except ValueError as exc:
        assert "bbox_center" in str(exc)
    else:
        raise AssertionError("unknown recovery anchor should be rejected")


def test_verified_batch_recovery_binds_external_id_before_manager_allocation():
    manager = FakeManager()
    recovered = RecoveryBatchResult(recovered_ids={("cam1", 7): 30})
    binder = FakeBinder(token(), recovered)
    binders = {"cam1": binder, "cam2": FakeBinder(None)}
    transforms = {camera_id: np.eye(3) for camera_id in binders}

    protected, _diagnostics = recover_departing_vehicle_ids(
        {"cam1": {7: track_at()}, "cam2": {}},
        manager,
        binders,
        transforms,
        100,
        {"cam1": 10.0, "cam2": 10.0},
        0.45,
    )

    assert manager.bindings[("cam1", 7)] == 30
    assert protected == set()
    assert binder.received is not None


def test_recovery_pipeline_passes_calibration_anchor_to_binder_payload():
    manager = FakeManager()
    binder = FakeBinder(token())
    binders = {"cam1": binder, "cam2": FakeBinder(None)}
    transforms = {camera_id: np.eye(3) for camera_id in binders}

    recover_departing_vehicle_ids(
        {"cam1": {7: track_at()}, "cam2": {}},
        manager,
        binders,
        transforms,
        100,
        {"cam1": 10.0, "cam2": 10.0},
        0.45,
        shared_map_anchor="bottom_center",
    )

    assert binder.received is not None
    payload = binder.received[("cam1", 7)]
    assert payload["recovery_anchor"] == "bottom_center"
    assert np.allclose(payload["recovery_position"], (50, 65))


def test_dispatcher_routes_fast_fragment_using_saved_token_continuation():
    manager = FakeManager()
    saved_token = token()
    saved_token["continuation_evidence"] = [
        {
            "local_key": ("cam1", 69),
            "last_center": (75.0, 65.0),
            "last_seen_s": 9.0,
            "qualified_predeparture": False,
            "originated_in_slot": True,
        }
    ]
    binder = FakeBinder(saved_token)
    binders = {"cam1": binder, "cam2": FakeBinder(None)}
    transforms = {camera_id: np.eye(3) for camera_id in binders}

    # Bottom center (210, 65) is outside the ordinary 45%-diagonal token
    # radius, but is a plausible continuation of the one fragment observed
    # inside the slot before a fast dropout.
    recover_departing_vehicle_ids(
        {"cam1": {70: track_at(200, 35)}, "cam2": {}},
        manager,
        binders,
        transforms,
        100,
        {"cam1": 10.0, "cam2": 10.0},
        0.45,
    )

    assert binder.received is not None
    assert ("cam1", 70) in binder.received


def test_candidate_between_two_token_owners_stays_protected_and_unbound():
    manager = FakeManager()
    binders = {
        "cam1": FakeBinder(token("E07", 30)),
        "cam2": FakeBinder(token("C08", 31)),
    }
    transforms = {camera_id: np.eye(3) for camera_id in binders}

    protected, diagnostics = recover_departing_vehicle_ids(
        {"cam1": {7: track_at()}, "cam2": {}},
        manager,
        binders,
        transforms,
        100,
        {"cam1": 10.0, "cam2": 10.0},
        0.45,
    )

    assert protected == {("cam1", 7)}
    assert manager.bindings == {}
    assert diagnostics[0]["type"] == "slot_recovery_owner_ambiguous"
    assert all(binder.received is None for binder in binders.values())


def test_global_recovery_uses_eligible_token_not_nearest_owner_camera():
    manager = FakeManager()
    wrong_nearby = token("C01", 30, center=(50.0, 50.0))
    wrong_nearby.update({
        "camera_id": "cam1",
        "confirmed_empty": False,
        "created_at_s": 9.0,
    })
    correct = token("D01", 31, center=(500.0, 500.0))
    correct.update({
        "camera_id": "cam2",
        "confirmed_empty": True,
        "created_at_s": 9.0,
    })
    cam1 = EvaluatingBinder(wrong_nearby, eligible=False)
    cam2 = EvaluatingBinder(correct, eligible=True)

    protected, diagnostics = recover_departing_vehicle_ids(
        {"cam1": {7: track_at()}, "cam2": {}},
        manager,
        {"cam1": cam1, "cam2": cam2},
        {"cam1": np.eye(3), "cam2": np.eye(3)},
        100,
        {"cam1": 10.0, "cam2": 10.0},
        0.45,
    )

    assert manager.bindings[("cam1", 7)] == 31
    assert cam1.token is wrong_nearby
    assert cam2.token is None
    assert cam1.allowed_token_slots == {"C01"}
    assert cam2.allowed_token_slots == {"D01"}
    assert protected == set()
    assert any(
        item["type"] == "slot_recovery_global_match_applied"
        and item["token_slot_id"] == "D01"
        for item in diagnostics
    )


def test_token_gid_already_visible_cannot_be_given_to_second_local_track():
    manager = FakeManager()
    manager.bindings[("cam1", 3)] = 30
    binder = FakeBinder(
        token(),
        RecoveryBatchResult(recovered_ids={("cam1", 7): 30}),
    )
    binders = {"cam1": binder, "cam2": FakeBinder(None)}
    transforms = {camera_id: np.eye(3) for camera_id in binders}

    protected, diagnostics = recover_departing_vehicle_ids(
        {"cam1": {3: track_at(10, 10), 7: track_at()}, "cam2": {}},
        manager,
        binders,
        transforms,
        100,
        {"cam1": 10.0, "cam2": 10.0},
        0.45,
    )

    assert manager.bindings == {("cam1", 3): 30}
    assert binder.received is None
    assert protected == set()
    assert diagnostics == []


def test_duplicate_cross_camera_tokens_keep_only_newest_owner():
    manager = FakeManager()
    older = token("E07", 30)
    older.update({"created_at_s": 8.0, "confirmed_empty": True})
    newer = token("C08", 30)
    newer.update({"created_at_s": 9.0, "confirmed_empty": True})
    cam1_binder = FakeBinder(older)
    cam2_binder = FakeBinder(
        newer,
        RecoveryBatchResult(recovered_ids={("cam1", 7): 30}),
    )
    binders = {"cam1": cam1_binder, "cam2": cam2_binder}
    transforms = {camera_id: np.eye(3) for camera_id in binders}

    protected, diagnostics = recover_departing_vehicle_ids(
        {"cam1": {7: track_at()}, "cam2": {}},
        manager,
        binders,
        transforms,
        100,
        {"cam1": 10.0, "cam2": 10.0},
        0.45,
        shared_map_anchor="bbox_center",
    )

    assert manager.bindings[("cam1", 7)] == 30
    assert protected == set()
    assert cam1_binder.received is None
    assert cam1_binder.cancelled == [(30, "duplicate_cross_camera_token")]
    assert cam2_binder.received is not None
    assert diagnostics[0]["type"] == "slot_recovery_duplicate_token_cancelled"


def test_priority_region_from_other_camera_is_projected_into_target_view():
    binders = {
        "cam1": FakeBinder(token(center=(50.0, 50.0))),
        "cam2": FakeBinder(token("C08", 31, center=(25.0, 25.0))),
    }
    transforms = {
        "cam1": np.eye(3),
        "cam2": np.asarray([[1, 0, 100], [0, 1, 0], [0, 0, 1]], dtype=float),
    }

    regions = build_recovery_priority_regions(
        "cam1",
        binders,
        transforms,
        {"cam1": 10.0, "cam2": 10.0},
    )

    own = next(item for item in regions if item["source_camera"] == "cam1")
    cross = next(item for item in regions if item["source_camera"] == "cam2")
    assert np.allclose(own["polygon"][0], (20, 20))
    assert np.allclose(cross["polygon"][0], (120, 20))


def test_binder_receives_retained_confirmed_track_after_current_detection_is_lost():
    manager = FakeManager()
    manager.bindings[("cam1", 4)] = 30
    stale = track_at()
    stale.consecutive_invisible_count = 4
    stale.last_seen_frame = 96
    fresh = track_at(50, 40)
    fresh.consecutive_invisible_count = 0
    fresh.last_seen_frame = 100
    manager.bindings[("cam1", 5)] = 30
    tracker = SimpleNamespace(confirmed_tracks={4: stale, 5: fresh})

    selected = collect_binder_global_tracks("cam1", tracker, manager)

    assert selected == {30: fresh}


def test_observed_identity_cancels_mature_same_camera_and_cross_camera_tokens():
    manager = FakeManager()
    same_token = token()
    same_token.update({"confirmed_empty": True, "age_ms": 1300})
    cross_token = token("E08", 31)
    cross_token.update({"confirmed_empty": False, "age_ms": 100})
    same = FakeBinder(same_token)
    cross = FakeBinder(cross_token)

    cancel_observed_recovery_tokens(
        {"cam1": {7: 30}, "cam2": {8: 31}},
        {"cam1": same, "cam2": cross},
        manager,
        {"cam1": 10.0, "cam2": 10.0},
    )

    assert same.cancelled == [(30, "identity_still_tracked_after_empty_grace")]
    # Token owner is cam2 and GID31 is only visible there, so provisional
    # evidence remains available for false-empty restoration.
    assert cross.cancelled == []

    cross.token = cross_token
    cancel_observed_recovery_tokens(
        {"cam1": {9: 31}, "cam2": {}},
        {"cam1": same, "cam2": cross},
        manager,
        {"cam1": 10.1, "cam2": 10.1},
    )
    assert cross.cancelled == [(31, "identity_observed_cross_camera")]


class LateReconciliationFakeManager(FakeManager):
    """FakeManager + merge/GID-allocation metadata for reconciliation tests."""

    def __init__(self):
        super().__init__()
        self.merges = []
        self.completed = []
        self._global_created_frames = {}
        self._parked_reservations = {}
        self.dormant_match_distance = 160.0
        self.recovery_retention_seconds = 5.0
        self.merge_should_accept = True

    def complete_late_departure_recovery(
        self, canonical_id, cam_id, local_track_id, frame_idx, **_proof
    ):
        self.completed.append((int(canonical_id), cam_id, int(local_track_id)))
        self.bindings[(cam_id, int(local_track_id))] = int(canonical_id)

    def reconcile_departure_identity(self, cam_id, local_track_id, track, frame_idx, *, token, binder, timestamp_s):
        # Runner orchestration only; test_departure_transaction exercises the real manager.
        result = self._merge_global_ids(token["global_id"], self.bindings[(cam_id, local_track_id)],
                                        frame_idx, "late_departure_token_reconciliation")
        if result.accepted:
            self.complete_late_departure_recovery(result.canonical_id, cam_id, local_track_id, frame_idx)
        return result

    def parking_recovery_trajectory_evidence(
        self, global_id, camera_id, local_track_id, track, *, recent_window_s,
        candidate_global_id=None,
    ):
        raise AssertionError("test must stub this attribute")

    def _merge_global_ids(
        self, canonical_id, duplicate_id, frame_idx, reason, **_kwargs
    ):
        self.merges.append(
            (int(canonical_id), int(duplicate_id), reason)
        )
        from techgar.cross_camera_manager import MergeResult

        if not self.merge_should_accept:
            return MergeResult(
                accepted=False,
                canonical_id=int(canonical_id),
                retired_id=int(duplicate_id),
                reason=reason,
                rejection_reason="independently_observed_vehicles",
            )
        return MergeResult(
            accepted=True,
            canonical_id=int(canonical_id),
            retired_id=int(duplicate_id),
            reason=reason,
        )


def _reconciliation_rig(
    manager, *, confirmed=True, created_frames=None, token_camera=None
):
    """Common rig: departing track bound to wrong G#4 on cam1, owner G#2."""
    manager.bindings[("cam1", 9)] = 4
    manager._global_created_frames = created_frames or {2: 167, 4: 1181}
    manager._parked_reservations = {
        2: {
            "global_id": 2,
            "slot_id": "D01",
            "camera_id": token_camera or "cam1",
            "state": "recovery_pending",
        }
    }
    confirmed_token = token("D01", 2)
    confirmed_token.update({"confirmed_empty": confirmed, "created_at_s": 9.0})
    if token_camera is not None:
        confirmed_token["camera_id"] = token_camera
    binder = FakeBinder(confirmed_token)
    binder.recovery_appearance_threshold = 0.55
    return binder


def _passing_reconciliation_evidence():
    return {
        "hard_reject_reason": None,
        "origin_distance_cm": 12.0,
        "score": 0.92,
        "observations": 4,
        "stable": True,
        "appearance_distance": 0.20,
        "appearance_support": 3.0,
        "topology_score": 1.0,
    }


def test_late_reconciliation_restores_owner_and_retires_wrong_gid():
    # hiep2/D01 regression: vision confirmed the slot empty only after the
    # departing car was minted a wrong new Global ID.  The wrong ID must be
    # reconciled back to the parked owner, never merged unconditionally.
    manager = LateReconciliationFakeManager()
    binder = _reconciliation_rig(manager)  # departing car carries wrong G#4
    manager.parking_recovery_trajectory_evidence = (
        lambda global_id, camera_id, local_track_id, track, *, recent_window_s,
        candidate_global_id=None: _passing_reconciliation_evidence()
    )
    binders = {"cam1": binder, "cam2": FakeBinder(None)}
    transforms = {camera_id: np.eye(3) for camera_id in binders}

    protected, diagnostics = recover_departing_vehicle_ids(
        {"cam1": {9: track_at()}, "cam2": {}},
        manager,
        binders,
        transforms,
        1197,
        {"cam1": 10.0, "cam2": 10.0},
        0.45,
    )

    # Owner G#2 re-bound onto the leaving track, wrong G#4 retired via merge.
    assert manager.bindings[("cam1", 9)] == 2
    assert manager.completed == [(2, "cam1", 9)]
    assert manager.merges == [(2, 4, "late_departure_token_reconciliation")]
    assert binder.cancelled == [(2, "late_departure_token_reconciled")]
    assert protected == {("cam1", 9)}
    assert any(
        item["type"] == "slot_recovery_late_reconciliation_applied"
        for item in diagnostics
    )


def test_late_reconciliation_waits_when_evidence_fails():
    manager = LateReconciliationFakeManager()
    binder = _reconciliation_rig(manager)
    weak = _passing_reconciliation_evidence()
    weak["score"] = 0.31  # trajectory evidence insufficient -> wait, no merge
    manager.parking_recovery_trajectory_evidence = (
        lambda global_id, camera_id, local_track_id, track, *, recent_window_s,
        candidate_global_id=None: weak
    )
    binders = {"cam1": binder, "cam2": FakeBinder(None)}
    transforms = {camera_id: np.eye(3) for camera_id in binders}

    protected, diagnostics = recover_departing_vehicle_ids(
        {"cam1": {9: track_at()}, "cam2": {}},
        manager,
        binders,
        transforms,
        1197,
        {"cam1": 10.0, "cam2": 10.0},
        0.45,
    )

    assert manager.bindings[("cam1", 9)] == 4  # untouched
    assert manager.merges == []
    assert binder.cancelled == []  # token stays alive for retry
    assert protected == set()
    assert diagnostics == [
        {
            "type": "slot_recovery_late_reconciliation_pending",
            "reason": "trajectory_not_qualified",
            "frame": 1197,
            "camera": "cam1",
            "local_track_id": 9,
            "token_slot_id": "D01",
            "token_global_id": 2,
            "current_global_id": 4,
        }
    ]


def test_late_reconciliation_never_touches_unconfirmed_or_younger_ids():
    # Fail closed: a wrong ID minted BEFORE the owner identity existed can
    # never be reconciled (it is not the departing car), and unconfirmed
    # tokens grant no reconciliation right at all.
    manager = LateReconciliationFakeManager()
    binder = _reconciliation_rig(manager, created_frames={2: 1200, 4: 1181})
    manager.parking_recovery_trajectory_evidence = (
        lambda global_id, camera_id, local_track_id, track, *, recent_window_s,
        candidate_global_id=None: _passing_reconciliation_evidence()
    )
    binders = {"cam1": binder, "cam2": FakeBinder(None)}
    transforms = {camera_id: np.eye(3) for camera_id in binders}

    protected, diagnostics = recover_departing_vehicle_ids(
        {"cam1": {9: track_at()}, "cam2": {}},
        manager,
        binders,
        transforms,
        1210,
        {"cam1": 10.0, "cam2": 10.0},
        0.45,
    )

    assert manager.bindings[("cam1", 9)] == 4
    assert manager.merges == []
    assert binder.cancelled == []
    assert protected == set()
    assert diagnostics == []

    # Unconfirmed token: no reconciliation even with perfect evidence.
    manager2 = LateReconciliationFakeManager()
    binder2 = _reconciliation_rig(manager2, confirmed=False)
    manager2.parking_recovery_trajectory_evidence = (
        lambda global_id, camera_id, local_track_id, track, *, recent_window_s,
        candidate_global_id=None: _passing_reconciliation_evidence()
    )
    binders2 = {"cam1": binder2, "cam2": FakeBinder(None)}

    protected2, diagnostics2 = recover_departing_vehicle_ids(
        {"cam1": {9: track_at()}, "cam2": {}},
        manager2,
        binders2,
        transforms,
        1197,
        {"cam1": 10.0, "cam2": 10.0},
        0.45,
    )
    assert manager2.bindings[("cam1", 9)] == 4
    assert manager2.merges == []
    assert binder2.cancelled == []
    assert protected2 == set()
    assert diagnostics2 == []


def test_late_reconciliation_rejected_merge_leaves_everything_unchanged():
    # Transaction guarantee: when the merge guard rejects (e.g. the two IDs
    # were independently observed vehicles), mapping, token and reservation
    # must all stay exactly as they were. The token retries next frame.
    manager = LateReconciliationFakeManager()
    binder = _reconciliation_rig(manager)
    manager.merge_should_accept = False
    manager.parking_recovery_trajectory_evidence = (
        lambda global_id, camera_id, local_track_id, track, *, recent_window_s,
        candidate_global_id=None: _passing_reconciliation_evidence()
    )
    binders = {"cam1": binder, "cam2": FakeBinder(None)}
    transforms = {camera_id: np.eye(3) for camera_id in binders}

    protected, diagnostics = recover_departing_vehicle_ids(
        {"cam1": {9: track_at()}, "cam2": {}},
        manager,
        binders,
        transforms,
        1197,
        {"cam1": 10.0, "cam2": 10.0},
        0.45,
    )

    assert manager.bindings[("cam1", 9)] == 4  # wrong ID untouched
    assert manager.completed == []  # no departure bookkeeping ran
    assert binder.token is not None  # token NOT consumed on rejection
    assert binder.cancelled == []
    assert protected == set()
    blocked = [
        item
        for item in diagnostics
        if item["type"] == "slot_recovery_late_reconciliation_blocked"
    ]
    assert blocked and blocked[0]["reason"] == "independently_observed_vehicles"
    assert not any(
        item["type"] == "slot_recovery_late_reconciliation_applied"
        for item in diagnostics
    )


def test_late_reconciliation_waits_when_reservation_does_not_match_token():
    # Token proof must agree with the durable reservation (slot AND camera),
    # not just the caller's source chain. A mismatch waits, never merges.
    manager = LateReconciliationFakeManager()
    binder = _reconciliation_rig(manager)
    # Reservation says the owner parked on cam2; the token was exported by
    # the cam1 binder and carries no camera_id -> token camera resolves cam1.
    manager._parked_reservations[2]["camera_id"] = "cam2"
    manager.parking_recovery_trajectory_evidence = (
        lambda global_id, camera_id, local_track_id, track, *, recent_window_s,
        candidate_global_id=None: _passing_reconciliation_evidence()
    )
    binders = {"cam1": binder, "cam2": FakeBinder(None)}
    transforms = {camera_id: np.eye(3) for camera_id in binders}

    protected, diagnostics = recover_departing_vehicle_ids(
        {"cam1": {9: track_at()}, "cam2": {}},
        manager,
        binders,
        transforms,
        1197,
        {"cam1": 10.0, "cam2": 10.0},
        0.45,
    )

    assert manager.bindings[("cam1", 9)] == 4
    assert manager.merges == []
    assert manager.completed == []
    assert binder.token is not None
    assert binder.cancelled == []
    assert protected == set()
    assert diagnostics == [
        {
            "type": "slot_recovery_late_reconciliation_pending",
            "reason": "token_reservation_mismatch",
            "frame": 1197,
            "camera": "cam1",
            "local_track_id": 9,
            "token_slot_id": "D01",
            "token_global_id": 2,
            "current_global_id": 4,
        }
    ]


def test_match_departure_uses_promoted_global_trail_when_provisional_empty():
    # hiep7 regression: once the departing fragment was minted a wrong GID,
    # its trail moved from the provisional store into the global store, and
    # late reconciliation reported trajectory_missing. The promoted trail
    # must remain usable as departure evidence.
    memory = WorldTrajectoryMemory()
    memory.set_parked(2, True, origin=(100.0, 100.0))
    samples = [
        TrajectorySample(
            frame_idx=1181 + index,
            timestamp_s=10.0 + 0.2 * index,
            camera_id="cam1",
            local_track_id=9,
            world=(102.0 + 8.0 * index, 100.0),
            bbox_size=(20, 12),
        )
        for index in range(4)
    ]
    for sample in samples:
        memory.append_global(4, sample)

    # Without the promoted trail there is nothing to match.
    assert (
        memory.match_departure(
            2,
            ("cam1", 9),
            prediction_radius=160.0,
            recent_window_s=5.0,
            appearance_score=0.8,
            size_score=0.8,
            topology_score=1.0,
        )
        is None
    )

    evidence = memory.match_departure(
        2,
        ("cam1", 9),
        prediction_radius=160.0,
        recent_window_s=5.0,
        appearance_score=0.8,
        size_score=0.8,
        topology_score=1.0,
        fragment_samples=tuple(samples),
    )
    assert evidence is not None
    assert evidence.hard_reject_reason is None
    assert evidence.stable
    assert evidence.observations == 4
    assert evidence.corridor_distance <= 160.0
    assert evidence.direction_cosine is None or evidence.direction_cosine > 0.0
