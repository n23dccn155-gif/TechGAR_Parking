"""GID continuity: parked/reserved identities may compete for departures.

A parked identity used to be reacquirable only through the fragile parking
departure token: the dormant matcher filtered states to ``dormant``/
``handoff`` and the world-trajectory matcher skipped every
``_parked_reservations`` member.  Once the token lapsed the same physical
vehicle minted a fresh Global ID (live15 gid16, vd_16 ghost IDs).

The reservation origin is itself strong evidence: a fragment whose
provisional trail starts inside the reserved slot may let the parked
identity compete under all the normal distance/appearance/size gates.
"""
from dataclasses import dataclass

import numpy as np

from techgar.cross_camera_manager import CrossCameraManager
from techgar.tracklet_descriptor import AppearanceTracklet


@dataclass
class DummyTrack:
    cx: int
    cy: int
    w: int = 42
    h: int = 24
    history: list = None
    status: str = "confirmed"
    appearance: object = None
    fragment_visible_count: int = None

    def __post_init__(self):
        if self.history is None:
            self.history = [(self.cx, self.cy)]
        if self.appearance is None:
            self.appearance = np.ones((16, 16), dtype=np.float32)

    @property
    def x(self):
        return self.cx - self.w // 2

    @property
    def y(self):
        return self.cy - self.h


def make_manager():
    # cam2 pixels are translated into cam1/world pixels after calibration.
    return CrossCameraManager(
        camera_sizes={"cam1": (640, 480), "cam2": (640, 480)},
        camera_crops={"cam1": (0, 0, 640, 480), "cam2": (0, 0, 640, 480)},
        camera_transforms={
            "cam1": np.eye(3),
            "cam2": np.array(
                [[1.0, 0.0, 500.0], [0.0, 1.0, 0.0], [0.0, 0.0, 1.0]]
            ),
        },
        edge_adjacency={("cam1", "right"): "cam2", ("cam2", "left"): "cam1"},
        overlap_regions={
            ("cam1", "cam2"): np.array(
                [[500, 0], [640, 0], [640, 480], [500, 480]],
                dtype=np.float32,
            )
        },
        match_distance=15.0,
        lookahead_frames=16,
        prediction_radius=90,
        appearance_threshold=0.45,
        min_direction_cosine=0.25,
    )


def one_hot_histogram(bin_index: int) -> np.ndarray:
    histogram = np.zeros((16, 16), dtype=np.float32)
    histogram.flat[bin_index] = 1.0
    return histogram


def attach_tracklet(track, *histograms):
    descriptor = AppearanceTracklet(max_samples=8, sample_interval=1)
    for frame_idx, histogram in enumerate(histograms, start=1):
        descriptor.update(histogram, frame_idx)
    track.appearance_tracklet = descriptor
    return track


def _seed_parked_identity(manager, histogram, *, x=300, y=260):
    """Observe gid 1 for a few frames in cam1, then reserve slot A01."""
    for frame_idx, offset in ((1, -10), (2, 0), (3, 0)):
        track = attach_tracklet(
            DummyTrack(x + offset, y, appearance=histogram),
            histogram,
            histogram,
        )
        gid = manager.update_all_tracks(
            {"cam1": {1: track}}, frame_idx, {"cam1": (frame_idx - 1) * 0.1}
        )["cam1"][1]
    manager.sync_parked_reservations(
        [
            {
                "global_id": gid,
                "slot_id": "A01",
                "camera_id": "cam1",
                "state": "recovery_pending",
                "center": (x, y),
            }
        ],
        4,
    )
    manager.detach_parked_local_tracks(4)
    return gid


def test_parked_identity_competes_for_fragment_leaving_its_slot():
    # The departure token is gone: the only recovery path left is the
    # matching pipeline.  A fragment that starts inside the reserved slot
    # must let the parked owner compete like any dormant identity -- even
    # when the car sat parked far longer than the retention window, because
    # the live reservation is itself proof of where the vehicle is.
    manager = make_manager()
    histogram = one_hot_histogram(0)
    _seed_parked_identity(manager, histogram)
    assert manager._identities[1].state == "recovery_pending"

    for frame_idx, x in ((1005, 310), (1006, 320), (1007, 330)):
        fragment = attach_tracklet(
            DummyTrack(
                x,
                260,
                history=[(x - 10, 260), (x - 5, 260), (x, 260)],
                appearance=histogram,
                # An immature fragment must not mint its own GID while the
                # reservation evidence is still accumulating.
                fragment_visible_count=3,
            ),
            histogram,
            histogram,
        )
        ids = manager.update_all_tracks(
            {"cam1": {9: fragment}},
            frame_idx,
            {"cam1": (frame_idx - 1) * 0.1},
        )

    assert ids["cam1"][9] == 1
    assert any(
        event["type"] == "dormant_global_id_recovered"
        and event["global_id"] == 1
        for event in manager.to_json({})["recent_events"]
    )


def test_parked_identity_does_not_compete_for_unrelated_fragment():
    # A fragment whose trail starts far from the reserved slot must never
    # hand the parked identity to a different car -- but a genuinely new
    # vehicle must still be allocated once it is mature.
    manager = make_manager()
    histogram = one_hot_histogram(0)
    _seed_parked_identity(manager, histogram)

    for frame_idx, x, count in (
        (5, 30, 3),
        (6, 45, 3),
        (7, 60, 3),
        (8, 75, 6),
    ):
        fragment = attach_tracklet(
            DummyTrack(
                x,
                260,
                history=[(x - 10, 260), (x - 5, 260), (x, 260)],
                appearance=histogram,
                fragment_visible_count=count,
            ),
            histogram,
            histogram,
        )
        ids = manager.update_all_tracks(
            {"cam1": {9: fragment}}, frame_idx, {"cam1": (frame_idx - 1) * 0.1}
        )

    assert manager.get_global_id("cam1", 9) == 2
    assert not any(
        event["type"] == "dormant_global_id_recovered"
        and event["global_id"] == 1
        for event in manager.to_json({})["recent_events"]
    )


def test_parked_identity_competes_in_world_trajectory_pass():
    # Same admission rule one pass later: the parked owner's frozen slot
    # origin is evaluated with departure semantics (radially outward),
    # never with the pre-parking inbound velocity.
    manager = make_manager()
    histogram = one_hot_histogram(0)
    _seed_parked_identity(manager, histogram)

    for frame_idx, x in ((5, 310), (6, 320), (7, 330)):
        fragment = attach_tracklet(
            DummyTrack(x, 260, appearance=histogram),
            histogram,
            histogram,
        )
        manager.observe_trajectories(
            {"cam1": {9: fragment}}, frame_idx, {"cam1": (frame_idx - 1) * 0.1}
        )

    deferred = manager._match_world_trajectory_identities(
        {"cam1": {9: fragment}}, 7
    )

    assert manager.get_global_id("cam1", 9) == 1
    assert ("cam1", 9) not in deferred
    assert any(
        event["type"] == "world_trajectory_reid_matched"
        and event["global_id"] == 1
        for event in manager.to_json({})["recent_events"]
    )


def test_world_trajectory_pass_reports_filtered_parked_owner():
    # Diagnostics attached to ``global_id_created`` must explain why the
    # parked owner was *not* evaluated for an unrelated fragment.
    manager = make_manager()
    histogram = one_hot_histogram(0)
    _seed_parked_identity(manager, histogram)

    for frame_idx, x in ((5, 30), (6, 45), (7, 60)):
        fragment = attach_tracklet(
            DummyTrack(x, 260, appearance=histogram),
            histogram,
            histogram,
        )
        manager.observe_trajectories(
            {"cam1": {9: fragment}}, frame_idx, {"cam1": (frame_idx - 1) * 0.1}
        )

    manager._match_world_trajectory_identities({"cam1": {9: fragment}}, 7)

    diagnostics = manager._last_world_reid_diagnostics.get(("cam1", 9), [])
    assert any(
        entry["global_id"] == 1
        and entry["reason"] == "parked_reservation_origin_miss"
        for entry in diagnostics
    )


def test_group_allocation_defers_pair_leaving_reserved_slot():
    # Simultaneous cam1+cam2 grouping used to mint a fresh GID for a car
    # driving out of a live reservation (live15 gid16 while D01 was held).
    manager = make_manager()
    histogram = one_hot_histogram(0)
    manager.sync_parked_reservations(
        [
            {
                "global_id": 1,
                "slot_id": "D01",
                "camera_id": "cam1",
                "state": "recovery_pending",
                "center": (560, 220),
            }
        ],
        0,
    )

    # Three observed frames so each fragment owns a real provisional trail
    # that starts inside the reserved slot and moves away from it.
    for frame_idx, offset in ((1, 0), (2, 10), (3, 20)):
        cam1_moving = attach_tracklet(
            DummyTrack(560 + offset, 220, h=40, appearance=histogram),
            histogram,
            histogram,
        )
        cam2_moving = attach_tracklet(
            DummyTrack(60 + offset, 220, h=80, appearance=histogram),
            histogram,
            histogram,
        )
        manager.observe_trajectories(
            {"cam1": {7: cam1_moving}, "cam2": {8: cam2_moving}},
            frame_idx,
            {"cam1": frame_idx * 0.1, "cam2": frame_idx * 0.1},
        )

    cam1_track = attach_tracklet(
        DummyTrack(590, 220, h=40, appearance=histogram), histogram, histogram
    )
    cam2_track = attach_tracklet(
        DummyTrack(90, 220, h=80, appearance=histogram), histogram, histogram
    )
    manager._match_unbound_cross_camera_pairs(
        {"cam1": {7: cam1_track}, "cam2": {8: cam2_track}}, 4
    )

    assert manager.get_global_id("cam1", 7) is None
    assert manager.get_global_id("cam2", 8) is None
    assert ("cam1", 7) in manager._departure_deferred_since
    assert any(
        event["type"] == "new_global_id_deferred_insufficient_fragment_evidence"
        and event.get("reason") == "leaving_reserved_slot"
        for event in manager.to_json({})["recent_events"]
    )


def test_group_allocation_still_pairs_unrelated_fragments():
    # The guard must not starve genuinely new vehicles: a pair whose trails
    # do not start inside any reservation groups normally.
    manager = make_manager()
    histogram = one_hot_histogram(0)
    cam1_track = attach_tracklet(
        DummyTrack(560, 220, h=40, appearance=histogram), histogram, histogram
    )
    cam2_track = attach_tracklet(
        DummyTrack(60, 220, h=80, appearance=histogram), histogram, histogram
    )

    manager._match_unbound_cross_camera_pairs(
        {"cam1": {7: cam1_track}, "cam2": {8: cam2_track}}, 1
    )

    assert manager.get_global_id("cam1", 7) == 1
    assert manager.get_global_id("cam2", 8) == 1
