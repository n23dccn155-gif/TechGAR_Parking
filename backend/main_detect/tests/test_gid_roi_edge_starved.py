"""GID continuity: rejected-detection starvation marks a dead-zone vanish.

droidcam_shared_bt f973-f996: gid1's cam2 track went LOST while its car
drifted into an ROI-edge dead zone.  From f988 every detection of the car
was rejected (``anchor_outside_roi`` / ``insufficient_strict_roi_support``)
so nothing reached association and the track starved silently until it
expired at f996.  The last *accepted* detection's ``roi_clipped`` /
``roi_support_ratio`` were mid-ROI, so ``vanished_near_roi_edge`` stayed
False and the same-camera stale veto rejected revival at 14-17 s
(moving limit 12 s), minting duplicate gid4 at f1070.

The tracker flags this starvation as ``track.roi_edge_starved`` (an
ROI-rejected anchor kept landing near the coasting track's prediction).
``notify_track_expired`` must carry it into
``identity.vanished_near_roi_edge`` so the bounded 2x stale-window
extension applies -- the LOST-time flag cannot see it because the
rejections only begin *after* the track is already lost.
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
    roi_edge_starved: bool = False

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


def _lose_then_expire(manager, *, roi_edge_starved):
    """Allocate gid1, lose it mid-ROI, then expire the starved fragment.

    The LOST transition happens before any rejection (the car was still
    detected at f973), so ``notify_track_lost`` sees ordinary mid-ROI
    flags; the starvation signal only exists at expiry.
    """
    start = DummyTrack(300, 260, history=[(280, 260), (290, 260), (300, 260)])
    assert manager.update_all_tracks(
        {"cam1": {1: start}}, 1, {"cam1": 1.0}
    )["cam1"][1] == 1
    lost = DummyTrack(
        305,
        260,
        history=[(285, 260), (295, 260), (305, 260)],
    )
    manager.notify_track_lost("cam1", 1, lost, 2, timestamp_s=1.3)
    manager.notify_track_expired(
        "cam1", 1, lost.cx, lost.cy, lost.w, lost.h,
        lost.appearance, 3, timestamp_s=1.5,
        roi_edge_starved=roi_edge_starved,
    )
    return lost


def test_expired_starved_track_marks_roi_edge_vanish():
    manager = make_manager()
    lost = _lose_then_expire(manager, roi_edge_starved=True)

    identity = manager._identities[1]
    assert identity.vanished_near_roi_edge is True

    # 15 s after the last observation: beyond the ordinary 12 s moving
    # limit that used to veto this revival, inside the bounded 2x window.
    assert manager._same_camera_recovery_is_stale(
        identity, "cam1", 15.0, True
    ) is False
    # Still bounded: past 24 s the 'different car' prior applies again.
    assert manager._same_camera_recovery_is_stale(
        identity, "cam1", 26.0, True
    ) is True

    # End-to-end: the same-camera revival that minted gid4 now recovers gid1.
    fragment = DummyTrack(
        lost.cx + 15,
        260,
        history=[(lost.cx + 5, 260), (lost.cx + 10, 260), (lost.cx + 15, 260)],
    )
    ids = manager.update_all_tracks(
        {"cam1": {9: fragment}}, 5, {"cam1": 21.5}
    )
    assert ids["cam1"][9] == 1


def test_expired_unflagged_track_keeps_tight_stale_window():
    manager = make_manager()
    _lose_then_expire(manager, roi_edge_starved=False)

    identity = manager._identities[1]
    assert identity.vanished_near_roi_edge is False

    # Nothing about the stale prior changes: 15 s > 12 s moving limit.
    assert manager._same_camera_recovery_is_stale(
        identity, "cam1", 15.0, True
    ) is True
    # A quick same-camera reappearance is still recoverable.
    assert manager._same_camera_recovery_is_stale(
        identity, "cam1", 11.0, True
    ) is False
