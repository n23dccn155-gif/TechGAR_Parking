"""GID continuity: handoff probation deferrals are sticky.

``handoff_candidate_deferred`` / ``handoff_assignment_ambiguous`` used to
protect a fragment for exactly one frame: the deferred key lived only in
the per-call return set.  When the source handoff expired or the LAPJV
pairing changed before the probation evidence accumulated, the same
fragment reached ``_allocate_global_id`` on the next frame with enough
observations and was minted a duplicate Global ID.

The deferral must persist in ``_handoff_deferred_since`` until the claim
resolves (bind) or expires, exactly like ``_world_trajectory_deferred_since``.
"""
from dataclasses import dataclass

import cv2
import numpy as np

from techgar.cross_camera_manager import CrossCameraManager, HandoffEntry
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


def bounded_cross_view_histogram(primary_weight: float) -> np.ndarray:
    histogram = np.zeros((16, 16), dtype=np.float32)
    histogram.flat[0] = float(primary_weight)
    histogram.flat[1] = float(1.0 - primary_weight)
    return cv2.normalize(histogram, histogram)


def attach_tracklet(track, *histograms):
    descriptor = AppearanceTracklet(max_samples=8, sample_interval=1)
    for frame_idx, histogram in enumerate(histograms, start=1):
        descriptor.update(histogram, frame_idx)
    track.appearance_tracklet = descriptor
    return track


def _target_track(status="tentative", count=None):
    target_view = one_hot_histogram(0)
    return attach_tracklet(
        DummyTrack(
            60,
            240,
            h=80,
            status=status,
            appearance=target_view,
            fragment_visible_count=count,
        ),
        target_view,
        target_view,
    )


def _handoff_entry(global_id: int = 1) -> HandoffEntry:
    first_view = bounded_cross_view_histogram(0.70)
    return HandoffEntry(
        global_id=global_id,
        source_cam="cam1",
        source_local_track_id=global_id,
        target_cam="cam2",
        exit_edge="overlap",
        last_world=(560.0, 200.0),
        velocity_world=(0.0, 0.0),
        bbox_size=(42, 80),
        appearance=first_view,
        appearance_samples=(first_view,),
        created_at_frame=1,
        updated_at_frame=1,
    )


def test_handoff_probation_survives_entry_disappearing_next_frame():
    manager = make_manager()
    target = _target_track()

    manager._handoffs = [_handoff_entry(1)]
    assert manager._match_pending_handoffs({"cam2": {9: target}}, 1) == {
        ("cam2", 9)
    }
    assert ("cam2", 9) in manager._handoff_deferred_since

    # The handoff entry vanished before the second evidence frame.  The
    # fragment must still be quarantined instead of reaching allocation.
    manager._handoffs.clear()
    assert manager._match_pending_handoffs({"cam2": {9: target}}, 2) == {
        ("cam2", 9)
    }


def test_sticky_deferral_blocks_new_gid_until_expiry_then_releases():
    manager = make_manager()
    target = _target_track()

    manager._handoffs = [_handoff_entry(1)]
    assert manager._match_pending_handoffs({"cam2": {9: target}}, 1) == {
        ("cam2", 9)
    }
    manager._handoffs.clear()

    # A now-mature, confirmed fragment must still not mint a duplicate GID
    # while the handoff probation window is open.
    mature_target = _target_track(status="confirmed", count=10)
    ids = manager.update_all_tracks({"cam2": {9: mature_target}}, 2)
    assert manager.get_global_id("cam2", 9) is None
    assert ("cam2", 9) in manager._handoff_deferred_since
    assert 9 not in ids.get("cam2", {})

    # After the bounded window the claim expires and the fragment may
    # finally receive its own identity.
    ids = manager.update_all_tracks({"cam2": {9: mature_target}}, 100)
    assert manager.get_global_id("cam2", 9) is not None
    assert ("cam2", 9) not in manager._handoff_deferred_since
    assert any(
        event["type"] == "handoff_deferral_expired"
        for event in manager.to_json({})["recent_events"]
    )


def test_resolved_handoff_clears_sticky_deferral():
    # When probation resolves by binding, no stale quarantine may linger.
    manager = make_manager()
    target = _target_track()

    manager._handoffs = [_handoff_entry(1)]
    assert manager._match_pending_handoffs({"cam2": {9: target}}, 1) == {
        ("cam2", 9)
    }
    manager._handoffs = [_handoff_entry(1)]
    assert manager._match_pending_handoffs({"cam2": {9: target}}, 2) == {
        ("cam2", 9)
    }

    # The third consecutive selected frame completes the medium-overlap
    # probation and binds -- clearing the sticky claim immediately.
    manager._handoffs = [_handoff_entry(1)]
    assert manager._match_pending_handoffs({"cam2": {9: target}}, 3) == set()
    assert manager.get_global_id("cam2", 9) == 1
    assert ("cam2", 9) not in manager._handoff_deferred_since
