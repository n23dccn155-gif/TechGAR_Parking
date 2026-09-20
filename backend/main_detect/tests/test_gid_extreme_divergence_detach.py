"""GID continuity: extreme cross-camera divergence detaches instantly.

hiep7 f1791: gid1 owned live members on cam1#50 and cam2#50 whose world
anchors sat ~60 cm apart -- two different physical cars.  The ownership
resolver required two consecutive divergent frames, so the split stayed
visible for one full frame before the stale member was detached.

A separation beyond ``3 * cross_camera_duplicate_distance`` is
physically impossible for one vehicle (anchor jitter is ~1-3 cm and a
car is only ~10-20 cm long), so extreme pairs now skip the
consecutive-evidence requirement and detach on the first frame.  The
2x-3x band keeps the two-frame requirement, and co-located overlap
co-observations still never trigger.
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


def _detach_events(manager):
    return [
        event
        for event in manager.to_json({})["recent_events"]
        if event["type"] == "cross_camera_global_conflict_detached"
    ]


def test_extreme_divergence_detaches_on_first_frame():
    # cam1#50 -> world 500, cam2#50 -> world 560: 60 units apart >
    # 3 * cross_camera_duplicate_distance (27).  Physically impossible
    # for one car, so the weaker member detaches on the FIRST update.
    manager = make_manager()
    white = one_hot_histogram(0)
    black = one_hot_histogram(8)
    gid = _seed_gid_on_cam2(manager, white)
    _inject_stale_member(manager, "cam1", 50, gid)

    cam1_car = attach_tracklet(
        DummyTrack(500, 260, h=40, appearance=black), black, black
    )
    cam2_car = attach_tracklet(
        DummyTrack(60, 260, h=40, appearance=white), white, white
    )
    manager.update_all_tracks(
        {"cam1": {50: cam1_car}, "cam2": {50: cam2_car}},
        2,
        {"cam1": 0.2, "cam2": 0.2},
    )

    # Exactly one member loses its binding: the cam1 member is weaker by
    # member_rank (black track vs the white owner gallery).
    assert manager.get_global_id("cam2", 50) == gid
    assert manager.get_global_id("cam1", 50) is None
    events = _detach_events(manager)
    assert len(events) == 1
    event = events[0]
    assert event["global_id"] == gid
    assert event["camera"] == "cam1"
    assert event["detached_local_id"] == 50
    assert event["kept_camera"] == "cam2"
    assert event["instant"] is True
    assert event["reason"] == "one_gid_divergent_live_members_extreme"
    # Extreme pairs need no consecutive evidence, so nothing accumulates.
    assert manager._cross_camera_conflict_evidence == {}


def test_moderate_divergence_still_requires_two_frames():
    # cam1#50 -> world 540, cam2#50 -> world 560: 20 units apart, inside
    # the 2x-3x band (18 < 20 <= 27).  The first frame only records
    # evidence; the detach lands on the second consecutive frame.
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
        if frame_idx == 2:
            assert manager.get_global_id("cam1", 50) == gid
            assert manager.get_global_id("cam2", 50) == gid
            assert _detach_events(manager) == []

    assert manager.get_global_id("cam1", 50) is None
    assert manager.get_global_id("cam2", 50) == gid
    events = _detach_events(manager)
    assert len(events) == 1
    assert events[0]["global_id"] == gid
    assert events[0]["camera"] == "cam1"
    assert events[0]["instant"] is False
    assert events[0]["reason"] == "one_gid_divergent_live_members"


def test_colocated_pair_never_detaches():
    # cam1#50 -> world 557, cam2#50 -> world 560: 3 units apart, the
    # legitimate same-car overlap co-observation.  Never divergent.
    manager = make_manager()
    white = one_hot_histogram(0)
    gid = _seed_gid_on_cam2(manager, white)
    _inject_stale_member(manager, "cam1", 50, gid)

    for frame_idx in (2, 3, 4):
        cam1_view = attach_tracklet(
            DummyTrack(557, 260, h=40, appearance=white), white, white
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
    assert _detach_events(manager) == []
