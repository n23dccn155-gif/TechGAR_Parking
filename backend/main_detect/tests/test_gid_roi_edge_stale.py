"""GID continuity: ROI-edge vanishing weakens the 'different car' prior.

bt f1070: gid4 was minted because gid1 was ``same_camera_stale`` after
its last fragment starved at the cam2 ROI right edge (``roi_clipped``).
A car that disappears INTO a blind/dead zone did not 'fail to appear' --
it left the observable area, so the short moving window overstates how
surprising a same-camera reappearance is.

The stale veto must extend the moving limit in a bounded way (2x) for
identities whose last fragment vanished ROI-edge-clipped.  Every
downstream gate (position, appearance, size) still applies -- a
different car in that spot still fails position.
"""
from dataclasses import dataclass

import numpy as np

from techgar.cross_camera_manager import CrossCameraManager


@dataclass
class DummyTrack:
    cx: int
    cy: int
    w: int = 42
    h: int = 24
    history: list = None
    status: str = "confirmed"
    appearance: object = None
    roi_clipped: bool = False
    roi_support_ratio: float = 1.0

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
    manager = CrossCameraManager(
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
    # Same tight-radius stand-in the other stale tests use.
    manager.dormant_match_distance = 20.0
    manager.reid_reachable_margin = 4.0
    manager.reid_reachable_speed_scale = 1.5
    return manager


def _lose_identity(manager, *, roi_clipped, roi_support_ratio=1.0):
    start = DummyTrack(300, 260, history=[(280, 260), (290, 260), (300, 260)])
    assert manager.update_all_tracks(
        {"cam1": {1: start}}, 1, {"cam1": 1.0}
    )["cam1"][1] == 1
    lost = DummyTrack(
        305,
        260,
        history=[(285, 260), (295, 260), (305, 260)],
        roi_clipped=roi_clipped,
        roi_support_ratio=roi_support_ratio,
    )
    manager.notify_track_lost("cam1", 1, lost, 2, timestamp_s=1.3)
    manager.notify_track_expired(
        "cam1", 1, lost.cx, lost.cy, lost.w, lost.h,
        lost.appearance, 3, timestamp_s=1.5,
    )
    return lost


def _reappear(manager, at_x, *, frame_idx=5, timestamp_s):
    fragment = DummyTrack(
        at_x,
        260,
        history=[(at_x - 10, 260), (at_x - 5, 260), (at_x, 260)],
    )
    ids = manager.update_all_tracks(
        {"cam1": {9: fragment}}, frame_idx, {"cam1": timestamp_s}
    )
    return ids


def test_roi_edge_vanish_extends_same_camera_stale_window():
    manager = make_manager()
    lost = _lose_identity(manager, roi_clipped=True, roi_support_ratio=0.4)

    # 20 s after the last observation: beyond the 12 s moving limit that
    # used to veto this revival, inside the bounded 2x ROI-edge window.
    ids = _reappear(manager, lost.cx + 15, timestamp_s=21.5)

    assert ids["cam1"][9] == 1


def test_roi_edge_extension_is_bounded():
    manager = make_manager()
    lost = _lose_identity(manager, roi_clipped=True, roi_support_ratio=0.4)

    # 30 s: even the extended window has lapsed; this is a different car.
    ids = _reappear(manager, lost.cx + 15, timestamp_s=31.5)

    assert ids["cam1"][9] != 1


def test_mid_roi_vanish_keeps_the_tight_stale_window():
    manager = make_manager()
    lost = _lose_identity(manager, roi_clipped=False)

    # Identical geometry, but the fragment vanished mid-ROI: the ordinary
    # 12 s 'different car' prior still applies.
    ids = _reappear(manager, lost.cx + 15, timestamp_s=21.5)

    assert ids["cam1"][9] != 1
