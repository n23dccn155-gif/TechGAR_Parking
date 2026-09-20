"""GID continuity: provisional trails survive a brief detector gap.

``observe_trajectories`` only marks keys live when the local track is
present in that call's ``all_tracks``.  ``remove_missing_provisionals``
then erased the fragment's whole trail during a one-frame LOST/coasting
gap, so a starved fragment could never accumulate the three samples the
ReID passes require -- and allocation minted a duplicate instead.
Retention is bounded by ``trajectory_history_seconds`` (~2 s), matching
the rolling window every trail already keeps.
"""
from dataclasses import dataclass

import numpy as np

from techgar.cross_camera_manager import CrossCameraManager
from techgar.tracklet_descriptor import AppearanceTracklet
from techgar.trajectory_memory import TrajectorySample, WorldTrajectoryMemory


def test_remove_missing_provisionals_retains_recent_coasting_keys():
    memory = WorldTrajectoryMemory(history_seconds=2.0)
    key = ("cam1", 7)
    for frame_idx in (1, 2):
        memory.append_provisional(
            key,
            TrajectorySample(
                frame_idx=frame_idx,
                timestamp_s=frame_idx * 0.1,
                camera_id="cam1",
                local_track_id=7,
                world=(100.0 + frame_idx * 10, 200.0),
                bbox_size=(42, 24),
            ),
        )

    # One missed frame (~0.1 s): the coasting fragment keeps its trail.
    memory.remove_missing_provisionals(set(), now_s=0.2)
    assert len(memory.provisional_samples(key)) == 2

    # Past the rolling history window the dead fragment is forgotten.
    memory.remove_missing_provisionals(set(), now_s=5.0)
    assert memory.provisional_samples(key) == ()


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


def test_observe_trajectories_keeps_trail_through_one_frame_gap():
    manager = make_manager()
    key = ("cam1", 7)

    for frame_idx, x in ((1, 100), (2, 110)):
        track = DummyTrack(x, 200)
        manager.observe_trajectories(
            {"cam1": {7: track}}, frame_idx, {"cam1": frame_idx * 0.1}
        )
    # Frame 3: the tracker starves this fragment (coasting, absent from
    # all_tracks).  The provisional trail must not be erased.
    manager.observe_trajectories({"cam1": {}}, 3, {"cam1": 0.3})
    assert len(manager.trajectory.provisional_samples(key)) == 2

    # Frame 4: detection returns; the fragment now owns the three samples
    # the ReID passes require instead of restarting from zero.
    manager.observe_trajectories(
        {"cam1": {7: DummyTrack(120, 200)}}, 4, {"cam1": 0.4}
    )
    assert len(manager.trajectory.provisional_samples(key)) == 3


def test_observe_trajectories_forgets_long_dead_fragment():
    manager = make_manager()
    key = ("cam1", 7)

    for frame_idx, x in ((1, 100), (2, 110)):
        track = DummyTrack(x, 200)
        manager.observe_trajectories(
            {"cam1": {7: track}}, frame_idx, {"cam1": frame_idx * 0.1}
        )

    # ~3 s absent: well past the 2 s history window, the trail is dropped.
    manager.observe_trajectories({"cam1": {}}, 32, {"cam1": 3.2})
    assert manager.trajectory.provisional_samples(key) == ()
    # Dropping ReID evidence must never be silent.
    assert any(
        event["type"] == "provisional_trajectory_forgotten"
        and event["camera"] == "cam1"
        and event["local_track_id"] == 7
        for event in manager.to_json({})["recent_events"]
    )
