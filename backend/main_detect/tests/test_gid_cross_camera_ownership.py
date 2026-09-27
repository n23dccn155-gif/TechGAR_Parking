"""GID continuity: one Global ID must not own divergent live members.

hiep7 f1791-1794: gid1 was simultaneously bound to cam1#50 and cam2#50
whose world anchors sat 60-67 cm apart -- frame inspection proved two
different physical cars.  ``_bind`` adds members without evicting
conflicting ones and the same-camera resolver only groups *within* one
camera, so a stale cross-camera member kept the GID on the wrong car.

A cross-camera ownership resolver must, after consecutive divergent
frames, keep the member best supported by the owner gallery and detach
the loser so it can be recovered as a different vehicle.  Legitimate
same-car co-observations in the calibrated overlap (anchors a few cm
apart) must never trigger.
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


def _seed_gid_on_cam2(manager, histogram):
    """gid1 legitimately owns a white car observed on cam2."""
    track = attach_tracklet(
        DummyTrack(60, 260, h=40, appearance=histogram),
        histogram,
        histogram,
    )
    gid = manager.update_all_tracks(
        {"cam2": {50: track}}, 1, {"cam2": 0.0}
    )["cam2"][50]
    assert gid == 1
    return gid


def _inject_stale_member(manager, cam_id, local_id, gid):
    """Leave a stale binding behind, as the buggy _bind path did."""
    manager._local_to_global[(cam_id, local_id)] = gid
    manager._gid_members.setdefault(gid, set()).add((cam_id, local_id))


def test_divergent_cross_camera_members_detach_the_weaker_one():
    # gid1's cam2#50 member is real; a stale cam1#50 member now sits on a
    # different physical car.  The pair sits 20 units apart in shared-map
    # space -- inside the 2x-3x duplicate-distance band -- so the
    # two-consecutive-frame evidence requirement still applies.  (Beyond
    # 3x the resolver detaches on the first frame; see
    # test_gid_extreme_divergence_detach.py.)
    manager = make_manager()
    white = one_hot_histogram(0)
    black = one_hot_histogram(8)
    gid = _seed_gid_on_cam2(manager, white)
    _inject_stale_member(manager, "cam1", 50, gid)

    for frame_idx in (2, 3):
        cam1_car = attach_tracklet(
            DummyTrack(540, 260, h=40, appearance=black), black, black
        )
        cam2_car = attach_tracklet(
            DummyTrack(60, 260, h=40, appearance=white), white, white
        )
        manager.update_all_tracks(
            {"cam1": {50: cam1_car}, "cam2": {50: cam2_car}},
            frame_idx,
            {"cam1": frame_idx * 0.1, "cam2": frame_idx * 0.1},
        )

    # One physical car keeps gid1; the divergent member is detached and can
    # be recovered as a different vehicle on the next pass.
    assert manager.get_global_id("cam2", 50) == gid
    assert manager.get_global_id("cam1", 50) is None
    assert any(
        event["type"] == "cross_camera_global_conflict_detached"
        and event["global_id"] == gid
        for event in manager.to_json({})["recent_events"]
    )


def test_overlap_co_observation_never_triggers_detach():
    # Both cameras legitimately see the SAME car at the same shared-map
    # anchor -- the normal overlap case must keep both members.
    manager = make_manager()
    white = one_hot_histogram(0)
    gid = _seed_gid_on_cam2(manager, white)
    _inject_stale_member(manager, "cam1", 50, gid)

    for frame_idx in (2, 3, 4):
        cam1_view = attach_tracklet(
            DummyTrack(560, 260, h=40, appearance=white), white, white
        )
        cam2_view = attach_tracklet(
            DummyTrack(60, 260, h=40, appearance=white), white, white
        )
        manager.update_all_tracks(
            {"cam1": {50: cam1_view}, "cam2": {50: cam2_view}},
            frame_idx,
            {"cam1": frame_idx * 0.1, "cam2": frame_idx * 0.1},
        )

    assert manager.get_global_id("cam1", 50) == gid
    assert manager.get_global_id("cam2", 50) == gid
    assert not any(
        event["type"] == "cross_camera_global_conflict_detached"
        for event in manager.to_json({})["recent_events"]
    )
