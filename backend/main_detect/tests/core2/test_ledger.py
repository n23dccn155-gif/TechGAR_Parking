from dataclasses import replace

import pytest

from techgar.core2.config import Core2Config, M4Config
from techgar.core2.ledger import (
    Birth, ExitEvidence, IdentityEdge, Ledger, MergeEvidence, ObservationEdge, binder_polygons_world,
    Proposal, TrackUpdate,
)
from techgar.core2.types import State


def birth(track, t, xy=(0., 0.), zone='entry', sigma=1.):
    return Birth(track, t, xy, zone, t, xy, t, sigma)


def step(ledger, t, **kwargs):
    plan = ledger.adjudicate(Proposal(ledger.version, t, **kwargs))
    return plan, ledger.commit(plan)


def setup_ledger(config=None, polygons=None):
    ledger = Ledger(config or Core2Config(), parking_polygons=polygons)
    step(ledger, 0.)
    return ledger


def test_binder_pixel_polygon_projects_to_world():
    slots = {'cam1': {'slots': [{'id': 'S1', 'polygon': [
        {'x': 0, 'y': 0}, {'x': 2, 'y': 0}, {'x': 2, 'y': 2}]}]}}
    transforms = {'cam1': ((2, 0, 10), (0, 3, -4), (0, 0, 1))}
    assert binder_polygons_world(slots, transforms)['S1'] == ((10., -4.), (14., -4.), (14., 2.))


def test_parked_wake_does_not_reclaim_lost():
    polygon = {'S1': ((0., 0.), (8., 0.), (8., 8.), (0., 8.))}
    ledger = setup_ledger(replace(Core2Config(), r_wake_cm=5.64), polygons=polygon)
    _, new = step(ledger, .1, births=(birth(1, .1, (-1., 2.)),))
    gid = new[1]
    step(ledger, .2, updates=(TrackUpdate(gid, 1, State.LOST, (-1., 2.), .1, 1.),))
    plan, created = step(ledger, .3, births=(birth(2, .3, (1., 2.), 'lot'),),
                         identity_edges=(IdentityEdge(gid, 2, .01),))
    assert plan.transfers == () and created[2] != gid
    assert ledger.counters['parked_wake_births'] == 1
    assert ledger.counters['orphan_births'] == 0


def test_slot_stopped_wake_keeps_gid_and_cannot_be_stolen():
    polygon = {'S1': ((0., 0.), (8., 0.), (8., 8.), (0., 8.))}
    ledger = setup_ledger(replace(Core2Config(), r_wake_cm=5.64), polygons=polygon)
    _, created = step(ledger, .1, births=(birth(1, .1, (1., 1.), 'lot'),))
    gid = created[1]
    step(ledger, .2, updates=(TrackUpdate(gid, 1, State.STOPPED, (1., 1.), .1, 1.),))
    plan, created = step(ledger, .3, births=(birth(2, .3, (1.2, 1.), 'lot'),),
                         identity_edges=(IdentityEdge(gid, 2, .1, True),))
    assert plan.transfers == ((gid, 1, 2),) and created == {}
    assert ledger.snapshot()[0].track_id == 2 and ledger.live_gids() == {gid}


def test_global_ambiguous_identity_edges_defer_without_orphan():
    ledger = setup_ledger()
    _, created = step(ledger, .1, births=(birth(1, .1), birth(2, .1)))
    g1, g2 = created[1], created[2]
    step(ledger, .2, updates=(TrackUpdate(g1, 1, State.LOST, (0., 0.), .1, 1.),
                              TrackUpdate(g2, 2, State.LOST, (0., 0.), .1, 1.)))
    edges = tuple(IdentityEdge(gid, track, .1) for gid in (g1, g2) for track in (3, 4))
    plan, new = step(ledger, .3, births=(birth(3, .3, zone='lot'), birth(4, .3, zone='lot')),
                     identity_edges=edges)
    assert set(plan.deferred) == {3, 4} and not plan.transfers and new == {}
    assert ledger.counters['orphan_births'] == 0


def test_defer_capacity_discards_oldest_without_orphan():
    ledger = setup_ledger(replace(Core2Config(), m4=replace(M4Config(), defer_capacity=1)))
    plan, created = step(ledger, 10., births=(birth(1, 10., zone='lot'), birth(2, 10., zone='lot')))
    assert not created and plan.discarded == (1,) and plan.deferred == (2,)
    assert ledger.counters['defer_dropped'] == 1 and ledger.counters['orphan_births'] == 0


def test_orphan_timer_resets_when_candidate_returns():
    ledger = setup_ledger()
    _, owned = step(ledger, .1, births=(birth(1, .1),))
    gid = owned[1]
    step(ledger, .2, updates=(TrackUpdate(gid, 1, State.LOST, (0., 0.), .1, 1.),))
    b = birth(2, 10., zone='lot')
    step(ledger, 10., births=(b,))
    plan, _ = step(ledger, 11., births=(b,), identity_edges=(IdentityEdge(gid, 2, .9),))
    assert plan.deferred == (2,)
    step(ledger, 12., births=(b,))
    _, made = step(ledger, 14., births=(b,))
    assert 2 in made and ledger.counters['orphan_births'] == 1


def test_exit_retry_expiry_and_live_gids():
    cfg = replace(Core2Config(), m4=replace(M4Config(), t_lost_max_s=2.))
    ledger = setup_ledger(cfg)
    _, made = step(ledger, .1, births=(birth(1, .1), birth(2, .1)))
    g1, g2 = made[1], made[2]
    step(ledger, .2, updates=(TrackUpdate(g2, 2, State.LOST, (0., 0.), .1, 1.),))
    exit = ExitEvidence((1, 1), 1, g1, .1, .1, .3, 'exit', True)
    step(ledger, .3, exits=(exit,))
    assert ledger.live_gids() == {g2}
    step(ledger, .4, exits=(exit,))
    step(ledger, 2.2)
    assert ledger.live_gids() == set() and ledger.counters['lost_expired'] == 1
    events = ledger.drain_events()
    assert sum(e['type'] == 'exited' for e in events) == 1
    assert sum(e['type'] == 'lost_expired' for e in events) == 1
    assert ledger.drain_events() == []


def test_confirmed_merge_keeps_older_gid():
    ledger = setup_ledger()
    _, first = step(ledger, .1, births=(birth(1, .1),))
    _, second = step(ledger, .2, births=(birth(2, .2),))
    step(ledger, .3, merges=(MergeEvidence(first[1], second[2], True),))
    assert ledger.live_gids() == {first[1]}
    assert any(e['type'] == 'merge' and e['retired_gid'] == second[2] for e in ledger.drain_events())


def test_stale_and_failed_commit_are_atomic():
    ledger = setup_ledger()
    old = ledger.adjudicate(Proposal(ledger.version, .1, births=(birth(1, .1),)))
    ledger.commit(old)
    snapshot = ledger.snapshot()
    with pytest.raises(ValueError): ledger.commit(old)
    assert ledger.snapshot() == snapshot
    malformed = ledger.adjudicate(Proposal(ledger.version, .2,
        updates=(TrackUpdate(snapshot[0].gid, 999, State.LOST, (0., 0.), .1, 1.),)))
    with pytest.raises(ValueError): ledger.commit(malformed)
    assert ledger.snapshot() == snapshot


def test_owner_priority_and_ambiguous_observation_assignment():
    ledger = setup_ledger()
    _, made = step(ledger, .1, births=(birth(1, .1),))
    gid = made[1]
    plan, _ = step(ledger, .2, obs_edges=(ObservationEdge(1, 1, gid, .4), ObservationEdge(1, 2, None, 0.)))
    assert plan.assignments == ((1, 1),)


def test_event_queue_full_fails_atomically_until_drained():
    cfg = replace(Core2Config(), m4=replace(M4Config(), event_capacity=1))
    ledger = setup_ledger(cfg)
    step(ledger, .1, births=(birth(1, .1),))
    plan = ledger.adjudicate(Proposal(ledger.version, .2, births=(birth(2, .2),)))
    with pytest.raises(OverflowError): ledger.commit(plan)
    assert len(ledger.live_gids()) == 1
    ledger.drain_events()
    ledger.commit(plan)
    assert len(ledger.live_gids()) == 2
