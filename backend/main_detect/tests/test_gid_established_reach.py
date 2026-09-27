"""GID continuity: established moving identities may travel further.

vd_16 r1: 12306 ``dormant_reid_rejected`` events, rejected-distance
p50=59 cm -- cars that legitimately moved 30-90 cm between fragments
outran the ``min(2*dormant, max(dormant, margin+1.5*v*min(elapsed,2s)))``
same-camera ceiling and minted ghost GIDs (45 in one session).

For ``_identity_is_established`` identities only, the reachable term may
look back ~5 s and the hard cap rises to 3x the calibrated radius; the
appearance/size/direction gates downstream remain the anti-jump
defense.  A stationary identity keeps the tight radius unchanged.
"""
from dataclasses import dataclass

import numpy as np
import pytest

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
    # Same tight-radius stand-in as the dormant-radius tests: 2x cap = 40.
    manager.dormant_match_distance = 20.0
    manager.reid_reachable_margin = 4.0
    manager.reid_reachable_speed_scale = 1.5
    return manager


def _lose_identity_at_speed(manager, *, px_per_second):
    start = DummyTrack(300, 260, history=[(280, 260), (290, 260), (300, 260)])
    assert manager.update_all_tracks(
        {"cam1": {1: start}}, 1, {"cam1": 1.0}
    )["cam1"][1] == 1
    moved_x = 300 + int(round(px_per_second * 0.2))
    moving = DummyTrack(
        moved_x,
        260,
        history=[(moved_x - 20, 260), (moved_x - 10, 260), (moved_x, 260)],
    )
    assert manager.update_all_tracks(
        {"cam1": {1: moving}}, 2, {"cam1": 1.2}
    )["cam1"][1] == 1
    manager.notify_track_lost("cam1", 1, moving, 3, timestamp_s=1.3)
    manager.notify_track_expired(
        "cam1", 1, moving.cx, moving.cy, moving.w, moving.h,
        moving.appearance, 4, timestamp_s=1.5,
    )
    return moving


def _mark_established(manager, gid=1):
    """Give the dormant identity the long dual-camera history vd_16 cars had."""
    identity = manager._identities[gid]
    manager._global_created_frames[gid] = 1
    identity.last_seen_frame = 300
    identity.camera_appearance_samples["cam2"] = (
        identity.camera_appearance_samples["cam1"]
    )
    assert manager._identity_is_established(identity)


def _reappear(manager, at_x, *, frame_idx=5, timestamp_s=2.2):
    fragment = DummyTrack(
        at_x,
        260,
        history=[(at_x - 20, 260), (at_x - 10, 260), (at_x, 260)],
    )
    return manager.update_all_tracks(
        {"cam1": {9: fragment}}, frame_idx, {"cam1": timestamp_s}
    )


def test_established_moving_identity_recovers_beyond_2x_cap():
    manager = make_manager()
    lost = _lose_identity_at_speed(manager, px_per_second=100.0)
    assert manager._identities[1].velocity_world_per_second[0] == pytest.approx(
        65.0, abs=1.0
    )
    _mark_established(manager)

    # +45 px is past the 2x calibrated cap that a one-minute-old identity
    # is held to -- but well inside what a 65 px/s car covers in 0.7 s.
    ids = _reappear(manager, at_x=lost.cx + 45)

    assert ids["cam1"][9] == 1


def test_unestablished_identity_keeps_the_2x_cap():
    # The same geometry for a young identity must still read as a
    # different car -- the relaxation is earned, not global.
    manager = make_manager()
    lost = _lose_identity_at_speed(manager, px_per_second=100.0)

    ids = _reappear(manager, at_x=lost.cx + 45)

    assert ids["cam1"][9] != 1


def test_established_stationary_identity_keeps_tight_radius():
    # v=0 makes the reachable term collapse regardless of the wider cap:
    # an established parked car must not jump to a different car a few
    # slots away.
    manager = make_manager()
    lost = _lose_identity_at_speed(manager, px_per_second=0.0)
    _mark_established(manager)

    ids = _reappear(manager, at_x=lost.cx + 30)

    assert ids["cam1"][9] != 1
