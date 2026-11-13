"""CORE2 M5 engine: xac nhan vet, dung/thuc day GID, parked_wake, entry, overrun, tat dinh.

Chi dung luong blob tong hop (1 camera, xe 86x36 px, 5 cm/s, 25 fps) nen khong can runtime.
"""
from dataclasses import replace
from pathlib import Path

import pytest

from techgar.core2.engine import Core2Engine, EngineParams
from techgar.core2.track import Track, TrackParams
from techgar.core2.types import Blob, State

DT = 0.04
SPEED = 5.0  # cm/s, ~ toc do GT (p50 5,2)
T0 = 1000.0


def blob(xy, t, frame, cam=0):
    return Blob(cam=cam, frame=frame, t=t, bbox=(100, 100, 86, 36), xy=(float(xy[0]), float(xy[1])),
                area_px=2500, roi_clipped=False, roi_support=1.0, desc=None)


def run(engine, script, steps):
    """script(i, t) -> list[(x, y)] ; tra (outputs moi buoc, events moi buoc)."""
    outs, evs = [], []
    for i in range(steps):
        t = round(T0 + i * DT, 6)
        blobs = {0: [blob(p, t, i) for p in script(i, t)]}
        outs.append(engine.step(t, i, blobs))
        evs.append(engine.drain_events())
    return outs, evs


def gids(outputs):
    return {o.gid for step in outputs for o in step}


def mover(x0, y0=0.0, vx=SPEED, start=0, stop=None):
    """Xe chay doc truc x tu buoc `start`; neu `stop` thi dung hang (van co blob) tu buoc do."""
    def pos(i):
        n = min(i, stop) if stop is not None else i
        return (x0 + vx * DT * max(n - start, 0), y0)
    return pos


# ---------------------------------------------------------------- xac nhan vet
def test_static_noise_never_confirmed():
    eng = Core2Engine()
    outs, _ = run(eng, lambda i, t: [(0.0, 0.0)], 100)
    assert gids(outs) == set()
    assert eng.stats()["births"] == 0


def test_moving_blob_confirmed_and_gets_gid():
    eng = Core2Engine()
    car = mover(0.0)
    outs, evs = run(eng, lambda i, t: [car(i)], 60)
    assert not outs[0]                                  # TENTATIVE khong xuat
    first = next(i for i, o in enumerate(outs) if o)
    assert 0.4 <= first * DT <= 1.2                     # t_confirm 0,4 s, D_confirm 1,5 cm
    assert gids(outs) == {1}
    last = outs[-1][0]
    assert last.state is State.MOVING and last.source == "measured"
    assert sum(e["type"] == "gid_created" for step in evs for e in step) == 1


def test_entry_zone_birth_is_entry_not_orphan():
    zone = ((-20.0, -10.0), (20.0, -10.0), (20.0, 10.0), (-20.0, 10.0))
    eng = Core2Engine(EngineParams(entry_zones=(zone,)))
    car = mover(-10.0)
    run(eng, lambda i, t: [car(i)], 40)
    assert eng.stats()["entry"] == 1 and eng.stats().get("orphan", 0) == 0


def test_orphan_birth_outside_zones():
    eng = Core2Engine()
    car = mover(200.0)
    run(eng, lambda i, t: [car(i)], 40)
    assert eng.stats().get("orphan", 0) == 1 and eng.stats().get("entry", 0) == 0


def test_parked_wake_birth_in_slot():
    slot = ((-6.0, -6.0), (6.0, -6.0), (6.0, 6.0), (-6.0, 6.0))
    eng = Core2Engine(EngineParams(slots=(slot,)))
    car = mover(0.0)
    outs, evs = run(eng, lambda i, t: [car(i)], 60)
    assert eng.stats()["parked_wake"] == 1
    assert gids(outs) == {1}
    assert not outs[0]
    assert 0.4 <= next(i for i, o in enumerate(outs) if o) * DT <= 1.2
    assert sum(event['type'] == 'gid_created' for step in evs for event in step) == 1


# ---------------------------------------------------------------- dung / thuc day
def test_stops_holds_gid_and_wakes_same_gid():
    eng = Core2Engine()
    car = mover(0.0, stop=60)                           # chay 2,4 s roi dung
    outs, evs = run(eng, lambda i, t: [car(i)], 140)    # dung them 3,2 s
    held = [o for o in outs[-1] if o.gid == 1][0]
    assert held.state is State.STOPPED and held.source == "held"
    anchor = held.xy
    wake_car = mover(car(139)[0], start=0)
    outs2, evs2 = run(eng, lambda i, t: [wake_car(i)], 60)  # chay lai
    assert gids(outs2) == {1}                           # cung GID, khong sinh moi
    assert any(e["type"] == "wake" and e["gid"] == 1 for step in evs2 for e in step)
    assert outs2[-1][0].state is State.MOVING
    assert outs2[-1][0].xy[0] > anchor[0] + 2.5
    assert eng.stats()["births"] == 1


def test_stopped_track_ignores_jitter_inside_footprint():
    eng = Core2Engine()
    car = mover(0.0, stop=50)
    run(eng, lambda i, t: [car(i)], 120)
    ax = car(50)[0]
    outs, evs = run(eng, lambda i, t: [(ax + (0.8 if i % 2 else -0.8), 0.3)], 40)
    assert [o.state for o in outs[-1]] == [State.STOPPED]
    assert not any(e["type"] == "wake" for step in evs for e in step)
    assert eng.stats()["births"] == 1


# ---------------------------------------------------------------- overrun (L4)
def test_overrun_marks_stopped_track_lost_and_keeps_runner_gid():
    eng = Core2Engine()
    a = mover(0.0, stop=40)
    run(eng, lambda i, t: [a(i)], 100)                  # A dung, GID 1 -> STOPPED
    ax = a(40)[0]
    b = mover(ax - 40.0, y0=0.0)                         # B chay xuyen qua neo cua A (A khong con blob)
    outs, evs = run(eng, lambda i, t: [b(i)], 220)
    over = [e for step in evs for e in step if e["type"] == "overrun"]
    assert [e["gid"] for e in over] == [1]
    assert gids(outs[-1:]) == {2}                       # chi B con xuat; A (LOST) khong xuat
    states = {tr.gid: tr.state for tr in eng.tracks if tr.gid}
    assert states[1] is State.LOST and states[2] is State.MOVING
    lost = next(tr for tr in eng.tracks if tr.gid == 1)
    assert lost.lost_since_t is not None
    assert eng.stats()["lost_total"] == 1


def test_lost_ttl_counts_once_and_uses_overrun_time_not_last_measurement():
    eng = Core2Engine(EngineParams(track=TrackParams(t_lost_max_s=2.0)))
    lost = Track(tid=1, xy=(0.0, 0.0), t=10.0, state=State.LOST,
                 gid=7, last_meas_t=1.0, last_meas_xy=(0.0, 0.0),
                 lost_since_t=10.0)
    eng.tracks.append(lost)
    assert eng.live_gids() == {7}

    eng.step(12.0, 1, {})  # bang T: chua qua han
    assert eng.tracks == [lost]
    assert eng.stats()["lost_expired"] == 0
    assert eng.drain_events() == []

    eng.step(12.04, 2, {})  # qua T: xoa vinh vien, giu so dem
    assert eng.tracks == []
    assert eng.live_gids() == set()
    assert eng.stats()["lost_expired"] == 1
    assert eng.drain_events() == [{"type": "lost_expired", "gid": 7, "t": 12.04}]
    eng.step(14.0, 3, {})
    assert eng.stats()["lost_expired"] == 1
    assert eng.drain_events() == []


def test_lost_is_never_a_spatial_reid_candidate_before_ttl():
    eng = Core2Engine(EngineParams(track=TrackParams(t_lost_max_s=10.0)))
    old = Track(tid=1, xy=(1.0, 0.0), t=10.0, state=State.LOST,
                gid=7, last_meas_t=9.0, last_meas_xy=(1.0, 0.0),
                lost_since_t=10.0)
    newborn = Track(tid=2, xy=(1.0, 0.0), t=11.0, state=State.TENTATIVE,
                    born_t=11.0, born_xy=(1.0, 0.0), first_t=11.0,
                    first_xy=(1.0, 0.0), last_meas_t=11.0,
                    last_meas_xy=(1.0, 0.0))
    eng._next_gid = 8
    eng.tracks = [old, newborn]
    eng._confirm(newborn, 11.0)
    assert old.gid == 7 and old.state is State.LOST
    assert newborn.gid == 8 and newborn.state is State.MOVING
    assert eng.stats()["reid"] == 0


# ---------------------------------------------------------------- tat dinh
def _two_car_script(i, t):
    a, b = mover(0.0, y0=0.0, stop=70), mover(120.0, y0=-9.6, vx=-SPEED)
    out = [a(i)]
    if i % 7 != 3:                                       # b co mat do ngat quang
        out.append(b(i))
    return out


def _snapshot(outs, evs):
    return ([[(o.gid, o.xy, o.v, o.state.name, o.source, tuple(sorted(o.bbox_by_cam.items()))) for o in step]
             for step in outs], evs)


def test_two_runs_identical():
    z = ((-30.0, -20.0), (30.0, -20.0), (30.0, 20.0), (-30.0, 20.0))
    params = EngineParams(entry_zones=(z,))
    r1 = _snapshot(*run(Core2Engine(params), _two_car_script, 160))
    r2 = _snapshot(*run(Core2Engine(params), _two_car_script, 160))
    assert r1 == r2
    assert gids([[o for o in step] for step in run(Core2Engine(params), _two_car_script, 160)[0]]) == {1, 2}


DUMP = Path(__file__).resolve().parents[4] / ".orca/core2/b0_windows_attempt2/toi2100_s2_legacy.jsonl.gz"


@pytest.mark.skipif(not DUMP.exists(), reason="dump B0 khong co tren may")
def test_dump_replay_deterministic():
    from techgar.core2.dump import read_dump

    def go():
        _, steps = read_dump(str(DUMP))
        eng = Core2Engine()
        log = []
        for k, st in enumerate(steps):
            if k >= 250:
                break
            outs = eng.step(st["t"], st["frame_idx"], st["blobs_by_cam"])
            log.append([(o.gid, o.xy, o.state.name, o.source) for o in outs])
        return log, eng.drain_events(), eng.stats()
    assert go() == go()
