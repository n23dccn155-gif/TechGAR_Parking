"""GID continuity: turnaround exemption in world-trajectory matching.

The dormant ReID pass already relaxes the direction veto when
``_has_durable_turnaround_proof`` holds (established identity, destination
camera gallery >= 2, appearance <= 0.25, size <= 0.65, inside the distance
limit).  The world-trajectory pass hardcoded ``min_direction_cosine=-0.35``
so a vehicle that legitimately reversed while unobserved was hard-rejected
as ``stable_wrong_direction`` and minted a duplicate Global ID.
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


def attach_tracklet(track, *histograms):
    descriptor = AppearanceTracklet(max_samples=8, sample_interval=1)
    for frame_idx, histogram in enumerate(histograms, start=1):
        descriptor.update(histogram, frame_idx)
    track.appearance_tracklet = descriptor
    return track


def _seed_identity(manager, histogram, *, cam1_frames=30):
    """Gid 1 travels +x through cam1 then +x inside cam2's overlap view."""
    # The durable-turnaround proof requires >= 2 *distinct* gallery nodes;
    # near-identical histograms collapse under gallery dedup, so the second
    # sample carries a tiny (0.07 Bhattacharyya) variation.
    variant = np.zeros((16, 16), dtype=np.float32)
    variant.flat[0] = 0.99
    variant.flat[1] = 0.01
    for frame_idx in range(1, cam1_frames + 1):
        track = attach_tracklet(
            DummyTrack(100 + frame_idx * 3, 220, appearance=histogram),
            histogram,
            variant,
        )
        manager.update_all_tracks(
            {"cam1": {1: track}}, frame_idx, {"cam1": frame_idx * 0.1}
        )
    manager._bind("cam2", 5, 1)
    for frame_idx, local_x in (
        (cam1_frames + 1, 100),
        (cam1_frames + 2, 110),
        (cam1_frames + 3, 120),
    ):
        track = attach_tracklet(
            DummyTrack(local_x, 240, h=80, appearance=histogram),
            histogram,
            variant,
        )
        manager.update_all_tracks(
            {"cam2": {5: track}}, frame_idx, {"cam2": frame_idx * 0.1}
        )
    lost_frame = cam1_frames + 4
    manager.notify_track_expired(
        "cam2", 5, 120, 240, 42, 80, histogram, lost_frame,
        timestamp_s=lost_frame * 0.1,
    )
    return lost_frame


def _reversing_fragment(manager, histogram, first_frame):
    # World trail moves -x back across the cam2 view: the same physical
    # vehicle turned around while unobserved.
    variant = np.zeros((16, 16), dtype=np.float32)
    variant.flat[0] = 0.99
    variant.flat[1] = 0.01
    for step, frame_idx in enumerate(
        (first_frame + 1, first_frame + 2, first_frame + 3)
    ):
        local_x = 115 - step * 10
        fragment = attach_tracklet(
            DummyTrack(local_x, 240, h=80, appearance=histogram),
            histogram,
            variant,
        )
        manager.observe_trajectories(
            {"cam2": {9: fragment}}, frame_idx, {"cam2": frame_idx * 0.1}
        )
    return attach_tracklet(
        DummyTrack(95, 240, h=80, appearance=histogram),
        histogram,
        variant,
    )


def test_world_trajectory_turnaround_proof_relaxes_direction_veto():
    # Established identity + matching cam2 gallery: the -1.0 direction
    # cosine must not veto the recovery.
    manager = make_manager()
    histogram = one_hot_histogram(0)
    lost_frame = _seed_identity(manager, histogram)
    fragment = _reversing_fragment(manager, histogram, lost_frame)

    deferred = manager._match_world_trajectory_identities(
        {"cam2": {9: fragment}}, lost_frame + 3
    )

    assert manager.get_global_id("cam2", 9) == 1
    assert ("cam2", 9) not in deferred
    assert any(
        event["type"] == "world_trajectory_reid_matched"
        and event["global_id"] == 1
        for event in manager.to_json({})["recent_events"]
    )
    assert any(
        event["type"] == "world_trajectory_turnaround_matched"
        and event["global_id"] == 1
        for event in manager.to_json({})["recent_events"]
    )


def test_world_trajectory_direction_veto_still_holds_without_proof():
    # A young identity has no durable turnaround proof: the same reversal
    # must remain a hard rejection, not a relaxed match.
    manager = make_manager()
    histogram = one_hot_histogram(0)
    lost_frame = _seed_identity(manager, histogram, cam1_frames=10)
    fragment = _reversing_fragment(manager, histogram, lost_frame)

    manager._match_world_trajectory_identities(
        {"cam2": {9: fragment}}, lost_frame + 3
    )

    assert manager.get_global_id("cam2", 9) is None
    diagnostics = manager._last_world_reid_diagnostics.get(("cam2", 9), [])
    assert any(
        entry["global_id"] == 1
        and entry["reason"] == "trajectory_stable_wrong_direction"
        for entry in diagnostics
    )
