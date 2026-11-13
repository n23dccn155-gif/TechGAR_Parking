"""M4 closed-world identity ledger; M5 commits its plan with the M3 draft.

`adjudicate` is side-effect free. `commit` validates a version and swaps a
fully checked ledger draft; M5 must stage and publish its M3 draft in the same
transaction. Camera observations/track history remain owned by M3.
"""
from __future__ import annotations

from dataclasses import dataclass, replace
import math
from typing import Mapping

from .config import Core2Config
from .gating import reachable
from .types import State

Point = tuple[float, float]


def binder_polygons_world(slot_configs: Mapping[str, dict], transforms: Mapping[str, object]) -> dict[str, tuple[Point, ...]]:
    """Convert binder pixel polygons to world cm; first camera wins per slot.

    M5 supplies the same adapted pixel-to-world transforms used at runtime.
    Camera ordering is stable; cross-camera polygon discrepancy needs M2 QA.
    """
    result = {}
    for cam in sorted(slot_configs):
        matrix = transforms[cam]
        for slot in slot_configs[cam].get('slots', ()):
            slot_id = str(slot['id'])
            if slot_id in result:
                continue
            points = []
            for point in slot['polygon']:
                x, y = float(point['x']), float(point['y'])
                projected = [float(row[0])*x + float(row[1])*y + float(row[2]) for row in matrix]
                if len(projected) != 3 or not all(math.isfinite(v) for v in projected) or projected[2] == 0:
                    raise ValueError('invalid binder polygon projection')
                points.append((projected[0]/projected[2], projected[1]/projected[2]))
            if len(points) < 3:
                raise ValueError('parking polygon must have at least three vertices')
            result[slot_id] = tuple(points)
    return result


@dataclass(frozen=True)
class Birth:
    track_id: int
    birth_t: float
    birth_xy: Point
    birth_zone: str | None
    confirmed_t: float
    xy: Point
    last_t: float
    sigma_cm: float
    first_cams: tuple[int, ...] = ()


@dataclass(frozen=True)
class ObservationEdge:
    obs_id: int
    track_id: int
    gid: int | None
    cost: float
    wake_evidence: bool = False


@dataclass(frozen=True)
class IdentityEdge:
    gid: int
    new_track_id: int
    cost: float
    wake_evidence: bool = False


@dataclass(frozen=True)
class TrackUpdate:
    gid: int
    track_id: int
    state: State
    xy: Point
    last_t: float
    sigma_cm: float


@dataclass(frozen=True)
class ExitEvidence:
    event_id: tuple[int, int]
    track_id: int
    gid: int
    crossed_t: float
    last_seen_t: float
    missing_t: float
    zone: str
    outward: bool


@dataclass(frozen=True)
class MergeEvidence:
    first_gid: int
    second_gid: int
    independently_confirmed: bool


@dataclass(frozen=True)
class Proposal:
    version: int
    t: float
    obs_edges: tuple[ObservationEdge, ...] = ()
    identity_edges: tuple[IdentityEdge, ...] = ()
    births: tuple[Birth, ...] = ()
    updates: tuple[TrackUpdate, ...] = ()
    exits: tuple[ExitEvidence, ...] = ()
    merges: tuple[MergeEvidence, ...] = ()


@dataclass(frozen=True)
class LedgerRecord:
    gid: int
    track_id: int
    state: State
    xy: Point
    last_t: float
    sigma_cm: float
    born_t: float


@dataclass(frozen=True)
class Pending:
    birth: Birth
    since_t: float
    no_candidate_since: float | None


@dataclass(frozen=True)
class Decision:
    version: int
    t: float
    assignments: tuple[tuple[int, int], ...]
    transfers: tuple[tuple[int, int, int], ...]  # gid, old track, new track
    births: tuple[Birth, ...]
    creates: tuple[tuple[Birth, str], ...]
    deferred: tuple[int, ...]
    discarded: tuple[int, ...]  # M3 must retire these unowned tracks
    updates: tuple[TrackUpdate, ...]
    exits: tuple[ExitEvidence, ...]
    merges: tuple[MergeEvidence, ...]
    expired: tuple[int, ...]
    pending: tuple[tuple[int, Pending], ...]


def _inside(point: Point, polygon: tuple[Point, ...]) -> bool:
    """Boundary is inside; polygon points are in the common cm frame."""
    x, y = point
    inside = False
    if len(polygon) < 3:
        raise ValueError('parking polygon must have at least three vertices')
    for (ax, ay), (bx, by) in zip(polygon, polygon[1:] + polygon[:1]):
        cross = (x-ax)*(by-ay) - (y-ay)*(bx-ax)
        if cross == 0 and min(ax, bx) <= x <= max(ax, bx) and min(ay, by) <= y <= max(ay, by):
            return True
        if (ay > y) != (by > y) and x < (bx-ax)*(y-ay)/(by-ay) + ax:
            inside = not inside
    return inside


def _components(edges):
    """Connected bipartite components, stable for repeatable LAP."""
    remaining = set(edges)
    while remaining:
        first = min(remaining)
        left, right = {first[0]}, {first[1]}
        changed = True
        while changed:
            changed = False
            for a, b in tuple(remaining):
                if a in left or b in right:
                    if a not in left or b not in right:
                        left.add(a); right.add(b); changed = True
        component = {(a, b) for a, b in remaining if a in left and b in right}
        remaining.difference_update(component)
        yield sorted(left), sorted(right), component


def _assignment(left, right, edges, *, forbid=None, owner_priority=False):
    """LAP with unmatched dummies: owner count, then cardinality, then cost."""
    import lap
    import numpy as np
    maximum = max((value[0] for value in edges.values()), default=0.0)
    cardinality_weight = (maximum + 1.0) * (len(left) + len(right) + 1)
    owner_weight = cardinality_weight * (len(left) + 1)
    invalid = owner_weight * (len(left) + len(right) + 1) + cardinality_weight
    matrix = np.full((len(left), len(right) + len(left)), invalid, dtype=np.float64)
    matrix[:, len(right):] = 0.0
    for i, a in enumerate(left):
        for j, b in enumerate(right):
            pair = (a, b)
            if pair == forbid or pair not in edges:
                continue
            cost, owner = edges[pair]
            matrix[i, j] = cost - cardinality_weight - (owner_weight if owner_priority and owner else 0.0)
    _, columns, _ = lap.lapjv(matrix, extend_cost=True)
    chosen = [(left[i], right[j]) for i, j in enumerate(columns)
              if 0 <= j < len(right) and (left[i], right[j]) in edges and (left[i], right[j]) != forbid]
    owners = sum(bool(edges[pair][1]) for pair in chosen) if owner_priority else 0
    return chosen, (owners, len(chosen)), sum(edges[pair][0] for pair in chosen)


def _resolve(edges, delta, *, owner_priority=False):
    """Defer an entire ambiguous component; never claim a partial result."""
    result, deferred_left, deferred_right = [], set(), set()
    for left, right, pairs in _components(edges):
        costs = {p: edges[p] for p in pairs}
        chosen, objective, best = _assignment(left, right, costs, owner_priority=owner_priority)
        ambiguous = False
        for pair in chosen:
            _, alternate_objective, alternate = _assignment(left, right, costs, forbid=pair, owner_priority=owner_priority)
            if alternate_objective == objective and alternate - best < delta:
                ambiguous = True
                break
        if ambiguous:
            deferred_left.update(left); deferred_right.update(right)
        else:
            result.extend(chosen)
    return result, deferred_left, deferred_right


class Ledger:
    def __init__(self, config: Core2Config, *, parking_polygons: Mapping[str, tuple[Point, ...]] | None = None):
        self.config = config
        self.polygons = {str(key): tuple(tuple(point) for point in value)
                         for key, value in (parking_polygons or {}).items()}
        if config.m4.defer_capacity <= 0 or config.m4.event_capacity <= 0 or config.m4.t_lost_max_s <= 0:
            raise ValueError('ledger limits must be positive')
        self.version = 0
        self._records: dict[int, LedgerRecord] = {}
        self._owners: dict[int, int] = {}
        self._pending: dict[int, Pending] = {}
        self._next_gid = 1
        self._event_seq = 0
        self._events: list[dict] = []
        self._t0: float | None = None
        self._last_t: float | None = None
        self.counters = {'orphan_births': 0, 'parked_wake_births': 0,
                         'lost_expired': 0, 'defer_dropped': 0}

    def snapshot(self) -> tuple[LedgerRecord, ...]:
        return tuple(self._records[key] for key in sorted(self._records))

    def live_gids(self) -> set[int]:
        return set(self._records)

    def drain_events(self) -> list[dict]:
        events, self._events = self._events, []
        return events

    def _slot(self, xy: Point) -> str | None:
        found = [key for key in sorted(self.polygons) if _inside(xy, self.polygons[key])]
        return found[0] if found else None

    def adjudicate(self, proposal: Proposal) -> Decision:
        if proposal.version != self.version:
            raise ValueError('stale ledger proposal')
        if not math.isfinite(proposal.t) or (self._last_t is not None and proposal.t <= self._last_t):
            raise ValueError('proposal time must increase')
        births = {birth.track_id: birth for birth in proposal.births}
        if len(births) != len(proposal.births):
            raise ValueError('duplicate birth track')
        for b in births.values():
            if (not all(math.isfinite(v) for v in (b.birth_t, *b.birth_xy, b.confirmed_t, *b.xy, b.last_t, b.sigma_cm))
                    or not b.birth_t <= b.confirmed_t <= proposal.t or b.last_t > proposal.t or b.sigma_cm < 0):
                raise ValueError('invalid confirmed birth')
            if b.track_id in self._owners:
                raise ValueError('birth already owns a gid')
        obs_costs = {}
        for edge in proposal.obs_edges:
            if not math.isfinite(edge.cost) or edge.cost < 0:
                raise ValueError('invalid observation edge cost')
            if edge.gid is not None and self._owners.get(edge.track_id) != edge.gid:
                raise ValueError('observation edge has stale owner')
            pair = (edge.obs_id, edge.track_id)
            if pair in obs_costs:
                raise ValueError('duplicate observation edge')
            if edge.gid is not None and self._records[edge.gid].state == State.STOPPED and not edge.wake_evidence:
                continue
            obs_costs[pair] = (edge.cost, edge.gid is not None)
        assignments, _, deferred_tracks = _resolve(obs_costs, self.config.m4.ambiguity_delta, owner_priority=True)
        assigned_tracks = {track_id for _, track_id in assignments}
        if len({obs for obs, _ in assignments}) != len(assignments) or len(assigned_tracks) != len(assignments):
            raise AssertionError('nonexclusive observation assignment')

        slots = {track_id: self._slot(b.birth_xy) for track_id, b in births.items()}
        stopped_by_slot = {slot: {gid for gid, record in self._records.items()
                                  if record.state == State.STOPPED and self._slot(record.xy) == slot}
                           for slot in set(slots.values()) if slot is not None}
        eligible = {}
        feasible: set[int] = set()
        for edge in proposal.identity_edges:
            if edge.gid not in self._records or edge.new_track_id not in births:
                raise ValueError('identity edge references absent gid or birth')
            if not math.isfinite(edge.cost) or edge.cost < 0:
                raise ValueError('invalid identity edge cost')
            record = self._records[edge.gid]
            birth = births[edge.new_track_id]
            slot = slots[edge.new_track_id]
            # G1-J: births inside a slot cannot reclaim unrelated LOST/OCCLUDED.
            if slot is not None and edge.gid not in stopped_by_slot[slot]:
                continue
            if slot is not None and not stopped_by_slot[slot]:
                continue
            if record.state not in (State.STOPPED, State.OCCLUDED, State.LOST):
                continue
            if record.track_id in assigned_tracks:
                continue
            if not reachable(record.xy, record.last_t, record.sigma_cm,
                             birth.xy, birth.last_t, birth.sigma_cm, self.config):
                continue
            if record.state == State.STOPPED and (
                    not edge.wake_evidence or self.config.r_wake_cm <= 0
                    or math.dist(record.xy, birth.xy) > self.config.r_wake_cm):
                feasible.add(edge.new_track_id)
                continue
            feasible.add(edge.new_track_id)
            pair = (edge.new_track_id, edge.gid)
            if pair in eligible:
                raise ValueError('duplicate identity edge')
            if edge.cost <= self.config.m4.cost_max:
                eligible[pair] = (edge.cost, True)
        matched, waiting, _ = _resolve(eligible, self.config.m4.ambiguity_delta)
        transfers = [(gid, self._records[gid].track_id, track_id) for track_id, gid in matched]
        transferred_gids = {gid for gid, _, _ in transfers}
        claimed = {track_id for track_id, _ in matched}
        pending = dict(self._pending)
        creates = []
        t0 = proposal.t if self._t0 is None else self._t0
        for track_id, birth in sorted(births.items()):
            if track_id in claimed:
                pending.pop(track_id, None)
                continue
            slot = slots[track_id]
            stopped = stopped_by_slot.get(slot, set()) if slot is not None else set()
            if slot is not None and not stopped:
                creates.append((birth, 'parked_wake')); pending.pop(track_id, None); continue
            prev = pending.get(track_id, Pending(birth, proposal.t, None))
            if track_id in feasible or track_id in waiting or track_id in deferred_tracks or stopped:
                pending[track_id] = replace(prev, birth=birth, no_candidate_since=None)
            elif birth.birth_zone == 'entry':
                creates.append((birth, 'entry')); pending.pop(track_id, None)
            elif birth.birth_zone is None:
                pending[track_id] = replace(prev, birth=birth, no_candidate_since=None)
            elif t0 <= birth.birth_t <= t0 + self.config.t_boot_s:
                creates.append((birth, 'boot')); pending.pop(track_id, None)
            else:
                start = proposal.t if prev.no_candidate_since is None else prev.no_candidate_since
                if proposal.t - start >= self.config.t_defer_s:
                    creates.append((birth, 'orphan')); pending.pop(track_id, None)
                else:
                    pending[track_id] = replace(prev, birth=birth, no_candidate_since=start)
        discarded = []
        while len(pending) > self.config.m4.defer_capacity:
            track_id = min(pending, key=lambda key: (pending[key].since_t, key))
            pending.pop(track_id); discarded.append(track_id)
        valid_exits = []
        for exit in proposal.exits:
            record = self._records.get(exit.gid)
            if record is None:
                continue  # retry of already closed gid
            if record.track_id != exit.track_id:
                raise ValueError('exit has stale owner')
            if (exit.gid not in transferred_gids and exit.track_id not in assigned_tracks and exit.zone == 'exit' and exit.outward
                    and exit.crossed_t <= exit.last_seen_t < exit.missing_t <= proposal.t):
                valid_exits.append(exit)
        exit_gids = {e.gid for e in valid_exits}
        if len(exit_gids) != len(valid_exits):
            raise ValueError('duplicate exit gid')
        update_gids = {update.gid for update in proposal.updates}
        if len(update_gids) != len(proposal.updates):
            raise ValueError('duplicate track update')
        merge_gids = set()
        for merge in proposal.merges:
            gids = {merge.first_gid, merge.second_gid}
            if (len(gids) != 2 or not merge.independently_confirmed or not gids <= self._records.keys()
                    or gids & (merge_gids | transferred_gids | exit_gids)):
                raise ValueError('invalid or conflicting merge')
            merge_gids.update(gids)
        updates_by_gid = {update.gid: update for update in proposal.updates}
        expired = [gid for gid, record in self._records.items()
                   if (updates_by_gid[gid].state if gid in updates_by_gid else record.state) == State.LOST
                   and gid not in (exit_gids | transferred_gids | merge_gids)
                   and proposal.t - (updates_by_gid[gid].last_t if gid in updates_by_gid else record.last_t)
                   > self.config.m4.t_lost_max_s]
        return Decision(self.version, proposal.t, tuple(sorted(assignments)), tuple(sorted(transfers)),
                        tuple(sorted(births.values(), key=lambda b: b.track_id)),
                        tuple(creates), tuple(sorted(pending)), tuple(discarded), proposal.updates,
                        tuple(valid_exits), proposal.merges, tuple(sorted(expired)), tuple(sorted(pending.items())))

    def commit(self, decision: Decision) -> dict[int, int]:
        if decision.version != self.version:
            raise ValueError('stale ledger decision')
        records, owners = dict(self._records), dict(self._owners)
        events, counters = list(self._events), dict(self.counters)
        next_gid, seq = self._next_gid, self._event_seq

        def event(kind, gid, **payload):
            nonlocal seq
            seq += 1
            events.append({'event_id': seq, 't': decision.t, 'gid': gid, 'type': kind, **payload})

        for update in decision.updates:
            old = records.get(update.gid)
            if (old is None or old.track_id != update.track_id or update.last_t > decision.t
                    or update.last_t < old.last_t or update.sigma_cm < 0
                    or not all(math.isfinite(v) for v in (*update.xy, update.last_t, update.sigma_cm))):
                raise ValueError('invalid track update owner/time')
            if update.state in (State.TENTATIVE, State.EXITED):
                raise ValueError('invalid owner state update')
            if update.state == State.LOST and old.state != State.LOST:
                event('lost', update.gid)
            records[update.gid] = replace(old, state=update.state, xy=update.xy,
                                          last_t=update.last_t, sigma_cm=update.sigma_cm)
        for gid, old_track, new_track in decision.transfers:
            record = records.get(gid)
            if record is None or record.track_id != old_track or new_track in owners:
                raise ValueError('invalid identity transfer')
            candidates = [birth for birth in decision.births if birth.track_id == new_track]
            if len(candidates) != 1:
                raise ValueError('transfer requires exactly one confirmed birth')
            birth = candidates[0]
            del owners[old_track]; owners[new_track] = gid
            records[gid] = replace(record, track_id=new_track, state=State.MOVING,
                                   xy=birth.xy, last_t=birth.last_t, sigma_cm=birth.sigma_cm)
        created = {}
        for birth, reason in decision.creates:
            if birth.track_id in owners:
                raise ValueError('track already owns gid')
            gid = next_gid; next_gid += 1
            records[gid] = LedgerRecord(gid, birth.track_id, State.MOVING,
                                        birth.xy, birth.last_t, birth.sigma_cm, decision.t)
            owners[birth.track_id] = gid; created[birth.track_id] = gid
            event('gid_created', gid, birth_reason=reason)
            if reason == 'orphan':
                counters['orphan_births'] += 1; event('orphan_birth', gid)
            elif reason == 'parked_wake':
                counters['parked_wake_births'] += 1
        for merge in decision.merges:
            first, second = records.get(merge.first_gid), records.get(merge.second_gid)
            if first is None or second is None or not merge.independently_confirmed:
                raise ValueError('invalid merge')
            survivor, retired = sorted((first, second), key=lambda record: (record.born_t, record.gid))
            del owners[retired.track_id]; del records[retired.gid]
            event('merge', survivor.gid, retired_gid=retired.gid, retired_track_id=retired.track_id)
        for evidence in decision.exits:
            record = records.get(evidence.gid)
            if record is None or record.track_id != evidence.track_id:
                raise ValueError('invalid exit owner')
            del owners[record.track_id]; del records[evidence.gid]
            event('exited', evidence.gid, evidence_id=evidence.event_id)
        for gid in decision.expired:
            record = records.get(gid)
            if record is None or record.state != State.LOST:
                raise ValueError('invalid lost expiry')
            del owners[record.track_id]; del records[gid]
            counters['lost_expired'] += 1; event('lost_expired', gid)
        counters['defer_dropped'] += len(decision.discarded)
        if len(events) > self.config.m4.event_capacity:
            raise OverflowError('ledger event queue full; drain before retry')
        if len(owners) != len(records) or any(owners.get(record.track_id) != gid for gid, record in records.items()):
            raise AssertionError('gid ownership invariant failed')
        self._records, self._owners = records, owners
        self._pending = dict(decision.pending)
        self._events, self.counters = events, counters
        self._next_gid, self._event_seq = next_gid, seq
        if self._t0 is None:
            self._t0 = decision.t
        self._last_t = decision.t
        self.version += 1
        return created
