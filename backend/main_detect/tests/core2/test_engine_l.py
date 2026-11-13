"""Deterministic oracle-like regressions for the separate ENGINE_L prototype."""
import random

import numpy as np
import pytest

from techgar.core2.engine_l import Core2EngineL
from techgar.core2.types import Blob, State


def point(x, y, frame, clipped=False, cam=0, pixel_x=None):
    pixel_x = x + 100 if pixel_x is None else pixel_x
    return Blob(cam=cam, frame=frame, t=frame / 25.0,
                bbox=(pixel_x - 42.5, y - 17.5, 85, 35), xy=(x, y),
                area_px=2975, roi_clipped=clipped,
                roi_support=0.5 if clipped else 1.0, desc=None)


def test_parked_anchor_and_bbox_reprojection_reject_noise():
    rng = random.Random(901)
    engine = Core2EngineL(camera_transforms={0: np.eye(3)})
    for frame in range(160):
        blob = point(30 + rng.gauss(0, 1.5), 40 + rng.gauss(0, 1.5), frame)
        out = engine.step(frame / 25.0, frame, {0: [blob]})
        assert [o.gid for o in out] == [1]
        assert abs(out[0].bbox_by_cam[0][0] + 42.5 - out[0].xy[0]) < 1e-8
    assert abs(out[0].xy[0] - 30) < 1.0
    assert abs(out[0].xy[1] - 40) < 1.0


def test_stationary_gap_two_seconds_retains_gid():
    engine = Core2EngineL()
    for frame in range(110):
        blobs = [] if 10 <= frame < 60 else [point(30, 40, frame)]
        out = engine.step(frame / 25.0, frame, {0: blobs})
        if blobs:
            assert {o.gid for o in out} == {1}
    assert engine.stats()["births"] == 1


def test_confirmed_track_is_held_through_t_occ_then_lost_until_expiry():
    engine = Core2EngineL(camera_transforms={0: np.eye(3)})
    first = engine.step(0.0, 0, {0: [point(30, 40, 0)]})
    assert [(o.gid, o.source) for o in first] == [(1, "measured")]
    created = engine.drain_events()
    assert [event["type"] for event in created] == ["gid_created"]
    assert created[0]["gid"] == 1
    assert engine.live_gids() == frozenset({1})

    held = engine.step(1 / 25.0, 1, {0: []})
    assert [(o.gid, o.source, o.state) for o in held] == [
        (1, "held", State.OCCLUDED)
    ]
    assert held[0].xy == first[0].xy
    assert 0 in held[0].bbox_by_cam

    view = engine.snapshot()[0]
    assert view["gid"] == 1
    assert view["state"].name == "OCCLUDED"
    assert view["xy"] == first[0].xy
    assert view["last_meas_xy"] == (30, 40)
    assert view["source"] == "held"
    assert view["held"] is True
    assert view["bbox_by_cam"] == held[0].bbox_by_cam
    with pytest.raises(TypeError):
        view["gid"] = 2
    with pytest.raises(TypeError):
        view["bbox_by_cam"][0] = (0, 0, 1, 1)

    for frame in range(2, 81):
        held = engine.step(frame / 25.0, frame, {0: []})
    assert held[0].source == "held"  # age == T_OCC is still held

    expired_hold = engine.step(81 / 25.0, 81, {0: []})
    assert expired_hold == []
    lost_view = engine.snapshot()[0]
    assert lost_view["state"].name == "LOST"
    assert lost_view["source"] is None
    assert lost_view["held"] is False
    assert dict(lost_view["bbox_by_cam"]) == {}
    assert engine.live_gids() == frozenset({1})

    for frame in range(82, 114):
        engine.step(frame / 25.0, frame, {0: []})
    assert engine.snapshot() == ()
    assert engine.live_gids() == frozenset()
    destroyed = engine.drain_events()
    assert [event["type"] for event in destroyed] == ["gid_destroyed"]
    assert destroyed[0]["gid"] == 1
    assert engine.drain_events() == ()


def test_closed_world_rejects_interior_ghosts_and_confirms_edge_entry():
    engine = Core2EngineL()
    # S9 (startup window, first 50 frames) may recover a parked car missed at
    # frame 0. Closed-world behaviour is asserted AFTER that window.
    for frame in range(60):
        out = engine.step(frame / 25.0, frame, {0: [point(10, 10, frame)]})
    for frame in range(60, 90):
        # Interior phantom remains present for >3 frames; never a GID.
        out = engine.step(frame / 25.0, frame,
                          {0: [point(10, 10, frame), point(90, 90, frame)]})
        assert {o.gid for o in out} == {1}
    assert engine.stats()["rejected_interior_births"] > 0
    for frame in range(90, 96):
        out = engine.step(frame / 25.0, frame,
                          {0: [point(10, 10, frame), point(90, 90, frame, clipped=True)]})
    assert {o.gid for o in out} == {1}
    for frame in range(96, 99):
        out = engine.step(frame / 25.0, frame,
                          {0: [point(10, 10, frame), point(90, 90, frame)]})
    assert {o.gid for o in out} == {1, 2}


def test_interior_camera_roi_can_still_be_the_entrance_lane():
    engine = Core2EngineL(entry_gate=((46.0, -4.0), (46.0, -15.0)))
    engine.step(0, 0, {0: [point(0, 20, 0)]})
    for frame in range(1, 5):
        out = engine.step(frame / 25.0, frame, {0: [
            point(0, 20, frame),
            point(82.0 - frame * .25, -9.5, frame),
            point(30, -9.5, frame),  # Interior ghost cannot start a GID.
        ]})
        assert {o.gid for o in out} == ({1, 2} if frame >= 3 else {1})
    assert engine.stats()["rejected_interior_births"] >= 4


def test_tentative_needs_consecutive_frames():
    engine = Core2EngineL()
    engine.step(0, 0, {0: []})
    events = {1: True, 2: False, 3: True, 4: True, 5: False,
              6: True, 7: True, 8: True}
    for frame, present in events.items():
        out = engine.step(frame / 25.0, frame,
                          {0: [point(80, 0, frame, clipped=True, pixel_x=10+frame)] if present else []})
        assert (len(out) == 1) == (frame == 8)


def test_moving_gap_recovery_and_noise():
    engine = Core2EngineL()
    rng = random.Random(44)
    for frame in range(170):
        xy = (10 + frame * 0.18, 20)
        blobs = [] if 60 <= frame < 105 else [point(xy[0] + rng.gauss(0, .7),
                                                   xy[1] + rng.gauss(0, .7), frame)]
        out = engine.step(frame / 25.0, frame, {0: blobs})
        if blobs:
            assert len(out) == 1 and out[0].gid == 1
    assert engine.stats()["births"] == 1


@pytest.mark.parametrize('cam,edge,direction', [(0, 795, -1), (1, 5, 1)])
def test_edge_ghost_is_absorbed_and_standalone_requires_inward(cam, edge, direction):
    engine = Core2EngineL()
    assert engine.step(0, 0, {cam: [point(50, 20, 0)]})[0].gid == 1
    for frame in range(1, 20):
        real = point(50, 20, frame)
        ghost = point(56, 20, frame, clipped=True, cam=cam, pixel_x=edge)
        real = point(50, 20, frame, cam=cam)
        assert [o.gid for o in engine.step(frame / 25, frame, {cam: [real, ghost]})] == [1]
    for frame in range(20, 40):
        ghost = point(100, 20, frame, clipped=True, cam=cam, pixel_x=edge)
        assert {o.gid for o in engine.step(frame / 25, frame, {cam: [point(50,20,frame,cam=cam), ghost]})} == {1}
    for frame in range(40, 44):
        ghost = point(100 + (frame-40)*.2, 20, frame, clipped=True, cam=cam,
                      pixel_x=edge + direction * 2 * (frame-39))
        out = engine.step(frame / 25, frame, {cam: [point(50,20,frame,cam=cam), ghost]})
    assert {o.gid for o in out} == {1, 2}


def test_lone_first_frame_edge_blob_does_not_create_gid():
    engine=Core2EngineL()
    for frame in range(20):
        assert engine.step(frame/25, frame, {0:[point(50, 20, frame, True, pixel_x=795)]}) == []
    assert engine.stats()['births'] == 0
    assert engine.drain_events() == ()
