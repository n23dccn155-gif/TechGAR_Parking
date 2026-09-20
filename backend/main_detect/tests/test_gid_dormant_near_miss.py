"""GID continuity: allocation checks dormant near-miss candidates.

``_new_global_id_ready`` counts *detection* frames, while the ReID passes
need tracklet/trajectory evidence that accrues more slowly.  A fragment
can therefore become allocatable while still immature for safe ReID; if a
plausible dormant identity sits within the match corridor with compatible
appearance, minting a fresh Global ID at that moment is how ghost
duplicates are born.  Allocation must defer on the same near-miss
machinery instead.
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


def _seed_parked_identity(manager, histogram, *, x=560, y=260):
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


def test_immature_fragment_near_reserved_identity_defers_then_binds():
    # The parked owner sits at the cam1/cam2 boundary.  A cam2 fragment at
    # the same world spot is allocatable (count >= 5) but too immature to
    # prove origin membership; minting a fresh GID here is the duplicate
    # factory (vd_16 ghost IDs next to a held reservation).
    manager = make_manager()
    histogram = one_hot_histogram(0)
    _seed_parked_identity(manager, histogram)

    for step, (frame_idx, local_x) in enumerate(
        ((5, 60), (6, 62))
    ):
        fragment = attach_tracklet(
            DummyTrack(
                local_x,
                260,
                h=40,
                history=[(local_x - 4, 260), (local_x - 2, 260), (local_x, 260)],
                appearance=histogram,
                fragment_visible_count=6,
            ),
            histogram,
        )
        manager.update_all_tracks(
            {"cam2": {9: fragment}}, frame_idx, {"cam2": (frame_idx - 1) * 0.1}
        )
        assert manager.get_global_id("cam2", 9) is None

    assert any(
        event["type"] == "new_global_id_deferred_dormant_near_miss"
        for event in manager.to_json({})["recent_events"]
    )

    # With the third trail sample the inside-slot proof holds, the parked
    # owner competes and the fragment binds -- one vehicle, one Global ID.
    fragment = attach_tracklet(
        DummyTrack(
            64,
            260,
            h=40,
            history=[(60, 260), (62, 260), (64, 260)],
            appearance=histogram,
            fragment_visible_count=7,
        ),
        histogram,
    )
    ids = manager.update_all_tracks(
        {"cam2": {9: fragment}}, 7, {"cam2": 0.6}
    )
    assert ids["cam2"][9] == 1


def test_dormant_near_miss_does_not_suppress_different_car():
    # A visually different fragment next to a reserved identity is a new
    # vehicle: the near-miss check must not starve it.
    manager = make_manager()
    owner_histogram = one_hot_histogram(0)
    _seed_parked_identity(manager, owner_histogram)

    different = one_hot_histogram(8)
    fragment = attach_tracklet(
        DummyTrack(
            60,
            260,
            h=40,
            history=[(56, 260), (58, 260), (60, 260)],
            appearance=different,
            fragment_visible_count=6,
        ),
        different,
        different,
    )
    ids = manager.update_all_tracks(
        {"cam2": {9: fragment}}, 5, {"cam2": 0.4}
    )

    assert ids["cam2"][9] == 2
    assert not any(
        event["type"] == "new_global_id_deferred_dormant_near_miss"
        for event in manager.to_json({})["recent_events"]
    )
