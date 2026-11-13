"""World-first, measurement-only identity association on the parking ground plane.

Coordinates are centimetres and time is seconds. This module deliberately has no
dependency on camera images, OpenCV, the legacy global ID registry, or frame rate.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from math import hypot, isfinite
from typing import Iterable, Mapping, Sequence

import lap
import numpy as np

Point = tuple[float, float]
Polygon = tuple[Point, ...]


def _distance(a: Point, b: Point) -> float:
    return hypot(a[0] - b[0], a[1] - b[1])


def _inside(point: Point, polygon: Polygon) -> bool:
    """Ray-casting against a real config polygon; boundary counts as inside."""
    x, y = point
    inside = False
    for a, b in zip(polygon, polygon[1:] + polygon[:1]):
        ax, ay = a
        bx, by = b
        cross = (x - ax) * (by - ay) - (y - ay) * (bx - ax)
        if abs(cross) < 1e-7 and min(ax, bx) - 1e-7 <= x <= max(ax, bx) + 1e-7 and min(ay, by) - 1e-7 <= y <= max(ay, by) + 1e-7:
            return True
        if (ay > y) != (by > y) and x < ax + (y - ay) * (bx - ax) / (by - ay):
            inside = not inside
    return inside


def _segment_distance(p: Point, a: Point, b: Point) -> float:
    dx, dy = b[0] - a[0], b[1] - a[1]
    scale = dx * dx + dy * dy
    u = max(0.0, min(1.0, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / scale)) if scale else 0.0
    return _distance(p, (a[0] + u * dx, a[1] + u * dy))


@dataclass(frozen=True)
class GroundGeometry:
    """Gate segments and parking polygons sourced from calibration/config files."""

    entrance: tuple[Point, Point]
    exit: tuple[Point, Point]
    slots: Mapping[str, Polygon] = field(default_factory=dict)
    entrance_direction: str = "positive"
    # Camera coverage bounds determine the ingress corridor beyond the gate.
    coverage_x: tuple[float, float] | None = None
    coverage_y: tuple[float, float] | None = None

    @classmethod
    def from_config(cls, calibration: Mapping, gates: Mapping) -> GroundGeometry:
        def endpoint(gate: Mapping, key: str) -> Point:
            point = gate[key]
            return (float(point["x"]), float(point["y"]))

        slots: dict[str, Polygon] = {}
        for slot_list in calibration.get("parking_slots_world", {}).values():
            for slot in slot_list:
                poly = tuple((float(p[0]), float(p[1])) for p in slot["polygon"])
                slots[str(slot["id"])] = poly
        coverage = calibration.get("camera_coverage_world", {})
        coverage_x = [float(p["x"]) for poly in coverage.values() for p in poly]
        coverage_y = [float(p["y"]) for poly in coverage.values() for p in poly]
        enter, leave = gates["entry_gate"], gates["exit_gate"]
        return cls(
            (endpoint(enter, "p1"), endpoint(enter, "p2")),
            (endpoint(leave, "p1"), endpoint(leave, "p2")),
            slots,
            str(enter.get("direction", "positive")),
            (min(coverage_x), max(coverage_x)) if coverage_x else None,
            (min(coverage_y), max(coverage_y)) if coverage_y else None,
        )

    def is_entrance(self, point: Point, margin_cm: float) -> bool:
        a, b = self.entrance
        if _segment_distance(point, a, b) <= margin_cm:
            return True
        # The approach lane extends from the configured entry gate towards the
        # camera coverage edge. The direction of travel is toward the gate.
        lo_y, hi_y = sorted((a[1], b[1]))
        if not lo_y - margin_cm <= point[1] <= hi_y + margin_cm:
            return False
        if self.coverage_x is None:
            return False
        gate_x = (a[0] + b[0]) / 2.0
        if self.entrance_direction == "positive":
            return gate_x - margin_cm <= point[0] <= self.coverage_x[1] + margin_cm
        return self.coverage_x[0] - margin_cm <= point[0] <= gate_x + margin_cm

    def is_departing_at_exit(self, point: Point, velocity: Point, margin_cm: float) -> bool:
        """A missing car may leave only near the configured exit, moving outward."""
        outward = 1.0 if sum(p[0] for p in self.exit) > sum(p[0] for p in self.entrance) else -1.0
        return velocity[0] * outward > 1.0 and _segment_distance(point, *self.exit) <= margin_cm

    def slot_at(self, point: Point, occupied_slots: Iterable[str] | None = None) -> str | None:
        occupied = None if occupied_slots is None else set(occupied_slots)
        for name, polygon in self.slots.items():
            if (occupied is None or name in occupied) and _inside(point, polygon):
                return name
        return None


@dataclass(frozen=True)
class Measurement:
    camera_id: str
    world_xy_cm: Point
    bbox: tuple[float, float, float, float]
    local_track_id: int | str | None = None
    color: str | None = None
    # Kept for adapter/dump compatibility; association remains T4d baseline.
    roi_clipped: bool = False
    roi_support_ratio: float = 1.0
    local_age_frames: int = 0
    local_age_s: float = 0.0

    def __post_init__(self) -> None:
        if not all(isfinite(v) for v in self.world_xy_cm):
            raise ValueError("Nonfinite world coordinates")


@dataclass
class WorldTrack:
    """One physical vehicle; provisional tracks carry no public GID."""

    internal_id: int
    gid: int | None
    xy: Point
    velocity: Point
    last_seen_s: float
    first_seen_s: float
    last_ids: dict[str, int | str] = field(default_factory=dict)
    last_color: str | None = None
    hits: int = 1
    cameras: set[str] = field(default_factory=set)
    retired: bool = False
    # L3': evidence collected while the vehicle has no public identity.
    first_xy: Point | None = None
    measurement_count: int = 1
    jointly_seen: bool = False

    def predicted(self, now_s: float, coast_s: float) -> Point:
        dt = min(max(0.0, now_s - self.last_seen_s), coast_s)
        return (self.xy[0] + self.velocity[0] * dt, self.xy[1] + self.velocity[1] * dt)


@dataclass(frozen=True)
class AssignedMeasurement:
    measurement: Measurement
    gid: int | None
    reason: str = "measurement"
    # Allows an offline consumer to backfill provisional measurements after
    # this internal identity is promoted. Runtime must use `gid` only.
    internal_track_id: int | None = None


@dataclass(frozen=True)
class HeldVehicle:
    gid: int
    xy_cm: Point
    prediction_source: str = "held"


@dataclass
class KernelResult:
    measurements: list[AssignedMeasurement]
    held: list[HeldVehicle]
    newly_created_gids: list[int]
    promoted_tracks: dict[int, int] = field(default_factory=dict)


@dataclass
class _Group:
    members: list[int]
    xy: Point
    cameras: set[str]
    fragments: set[int] = field(default_factory=set)


def _lap_pairs(cost: np.ndarray, limit: float = 1e5) -> list[tuple[int, int]]:
    if not cost.shape[0] or not cost.shape[1]:
        return []
    _, assignment, _ = lap.lapjv(np.asarray(cost, dtype=np.float64), extend_cost=True, cost_limit=limit)
    return [(i, int(j)) for i, j in enumerate(assignment) if j >= 0 and cost[i, j] < limit]


class WorldIdentityKernel:
    """Sequential, deterministic world identity engine (L1-L5).

    `step` must be called with strictly increasing source timestamps. In the
    first two seconds of a recording can bootstrap a mid-run inventory after
    shorter evidence thresholds. Normal births outside the entrance/slots
    become provisional identities until their motion is corroborated.
    """

    def __init__(
        self,
        geometry: GroundGeometry,
        *,
        max_speed_cm_s: float = 26.0,
        localization_error_cm: float = 3.0,
        cross_camera_gate_cm: float = 4.2,
        entrance_margin_cm: float = 3.5,
        body_length_cm: float = 9.4,
        body_width_cm: float = 4.2,
        coast_seconds: float = 0.4,
        max_accel_cm_s2: float = 45.0,
        bootstrap_first_frame: bool = False,
    ) -> None:
        if max_speed_cm_s <= 0 or localization_error_cm <= 0 or coast_seconds < 0 or max_accel_cm_s2 <= 0:
            raise ValueError("Physical thresholds must be positive")
        self.geometry = geometry
        self.max_speed = max_speed_cm_s
        self.error = localization_error_cm
        self.cross_camera_gate = cross_camera_gate_cm
        self.entrance_margin = entrance_margin_cm
        self.body_length = body_length_cm
        self.body_width = body_width_cm
        self.coast = coast_seconds
        self.max_accel = max_accel_cm_s2
        self.bootstrap = bootstrap_first_frame
        self.tracks: list[WorldTrack] = []
        self._gid = 0
        self._internal_id = 0
        self._time_s: float | None = None
        self._started_at_s: float | None = None

    def _local_owners(self, observations: Sequence[Measurement]) -> dict[int, int]:
        """Preserve distinct local owners for vehicles in nearby opposing lanes."""
        now = self._time_s
        if now is None:
            return {}
        owners: dict[int, int] = {}
        for index, observation in enumerate(observations):
            nearby: list[tuple[float, WorldTrack]] = []
            local_candidates: list[tuple[float, int]] = []
            for track in self.tracks:
                if track.retired:
                    continue
                dt = now - track.last_seen_s
                if dt < 0 or dt > max(self.coast, 0.4):
                    continue
                distance = _distance(track.predicted(now, self.coast), observation.world_xy_cm)
                nearby.append((distance, track))
                if (observation.local_track_id is not None
                        and track.last_ids.get(observation.camera_id) == observation.local_track_id
                        and distance <= max(self.body_length * 1.2, self.max_speed * dt + self.error)):
                    local_candidates.append((distance, track.internal_id))
            nearby.sort(key=lambda pair: (pair[0], pair[1].internal_id))
            if nearby:
                distance, track = nearby[0]
                runner_up = nearby[1][0] if len(nearby) > 1 else float("inf")
                if (hypot(*track.velocity) >= 4.0
                        and distance <= self.error
                        and runner_up - distance > self.body_width * 0.5):
                    owners[index] = track.internal_id
                    continue
            if local_candidates:
                owners[index] = min(local_candidates)[1]
        return owners

    def _groups(self, observations: Sequence[Measurement]) -> list[_Group]:
        """First pair cameras with LAP, before deciding vehicle identities."""
        owners = self._local_owners(observations)
        cam1 = [i for i, o in enumerate(observations) if o.camera_id == "cam1"]
        cam2 = [i for i, o in enumerate(observations) if o.camera_id == "cam2"]
        if cam1 and cam2:
            costs = np.full((len(cam1), len(cam2)), 1e6, dtype=np.float64)
            for i, a in enumerate(cam1):
                for j, b in enumerate(cam2):
                    d = _distance(observations[a].world_xy_cm, observations[b].world_xy_cm)
                    distinct_owners = (a in owners and b in owners
                                       and owners[a] != owners[b])
                    if d <= self.cross_camera_gate and not distinct_owners:
                        costs[i, j] = d
            pairs = _lap_pairs(costs)
        else:
            pairs = []
        used: set[int] = set()
        groups: list[_Group] = []
        for i, j in pairs:
            a, b = cam1[i], cam2[j]
            used.update((a, b))
            x = (observations[a].world_xy_cm[0] + observations[b].world_xy_cm[0]) / 2
            y = (observations[a].world_xy_cm[1] + observations[b].world_xy_cm[1]) / 2
            groups.append(_Group([a, b], (x, y), {"cam1", "cam2"}))
        for i, obs in enumerate(observations):
            if i not in used:
                groups.append(_Group([i], obs.world_xy_cm, {obs.camera_id}))
        # A vehicle that MOG splits into 2 longitudinal blobs can have centres
        # 6-8 cm apart (the measured 9.4 cm body length). Fuse fragments BEFORE
        # assigning tracks; otherwise both existing GIDs survive as live rivals.
        # Prefer the cross-camera measurement and the largest single-camera
        # blob; each camera still contributes at most one primary measurement.
        groups.sort(key=lambda group: -len(group.cameras))
        kept: list[_Group] = []
        for group in groups:
            candidate = min(
                ((_distance(group.xy, existing.xy), existing) for existing in kept),
                key=lambda pair: pair[0], default=None,
            )
            can_fuse = (candidate is not None
                        and candidate[0] <= self.body_length * 0.87
                        and (len(group.cameras) == 1 or len(candidate[1].cameras) == 1))
            if can_fuse:
                a_owners = {owners[i] for i in group.members if i in owners}
                b_owners = {owners[i] for i in candidate[1].members if i in owners}
                if a_owners and b_owners and a_owners.isdisjoint(b_owners):
                    can_fuse = False
            if not can_fuse:
                kept.append(group)
                continue
            target = candidate[1]
            originals = target.members + group.members
            primary: dict[str, int] = {}
            for i in originals:
                cam = observations[i].camera_id
                area = observations[i].bbox[2] * observations[i].bbox[3]
                if cam not in primary or area > observations[primary[cam]].bbox[2] * observations[primary[cam]].bbox[3]:
                    primary[cam] = i
            target.members = originals
            target.fragments = set(originals) - set(primary.values())
            target.cameras = set(primary)
            # Cross-camera centre is the most robust geometry; if only one
            # camera exists, use the midpoint of the split object.
            points = [observations[i].world_xy_cm for i in primary.values()]
            if len(points) == 1 and len(originals) > 1:
                points = [observations[i].world_xy_cm for i in originals]
            target.xy = (sum(p[0] for p in points) / len(points),
                         sum(p[1] for p in points) / len(points))
        return kept

    def _cost(self, track: WorldTrack, group: _Group, obs: Sequence[Measurement], now: float) -> float:
        elapsed = max(0.0, now - track.last_seen_s)
        # Never recycle a distant silent identity once its last reliable motion
        # would have carried it well outside both camera coverages. The usual
        # short-gap coast still allows a car to stop and resume in place.
        if elapsed > 2.0 and hypot(*track.velocity) > 4.0:
            projected = (track.xy[0] + track.velocity[0] * elapsed,
                         track.xy[1] + track.velocity[1] * elapsed)
            for value, limits in ((projected[0], self.geometry.coverage_x),
                                  (projected[1], self.geometry.coverage_y)):
                if limits is not None and (value < limits[0] - self.body_length
                                           or value > limits[1] + self.body_length):
                    return 1e6
        # A silent track can be recovered by physics, but incurs a substantial
        # penalty so an actually observed moving car wins a conflict.
        # The world anchor of a MOG blob can jump to the opposite end of the
        # same 9.4 cm vehicle when its *local track id* changes. This is a
        # localization discontinuity, not movement at an impossible speed.
        # Keep this exception below one source stride-4 interval (0.16 s);
        # long gaps and small split blobs still use the normal physical gate.
        same_local = any(
            obs[i].local_track_id is not None
            and track.last_ids.get(obs[i].camera_id) == obs[i].local_track_id
            for i in group.members
        )
        raw_distance = _distance(group.xy, track.xy)
        anchor_handoff = (
            0.0 < elapsed <= 0.14 and not same_local
            and self.body_length * 0.86 <= raw_distance <= self.body_length * 1.2
        )
        # A continuing local track gives direct evidence for a slightly wider
        # localization allowance. Do not give it to stale, unrelated blobs.
        local_error = max(self.error, 8.0) if (
            anchor_handoff or (0.0 < elapsed <= 0.4 and same_local)
        ) else self.error
        reach = self.max_speed * elapsed + local_error
        d = _distance(group.xy, track.predicted(now, self.coast))
        if d > reach:
            return 1e6
        velocity_norm = hypot(*track.velocity)
        if elapsed > self.coast and d > self.body_length * 1.05:
            # A recently moving vehicle may cover a second body length while
            # occluded. Beyond this, the detector provides too little evidence
            # to claim that a distant blob is the same physical vehicle.
            if d > self.body_length * 2.1 or velocity_norm <= 1.0:
                return 1e6
            dx = group.xy[0] - track.xy[0]
            dy = group.xy[1] - track.xy[1]
            displacement = hypot(dx, dy)
            # A slow or stopped vehicle cannot suddenly travel an entire
            # long-gap search radius. Limit the reachable displacement using
            # the last observed speed plus a physical acceleration allowance.
            accel_reach = velocity_norm * elapsed + 0.5 * self.max_accel * elapsed * elapsed
            if displacement > min(self.max_speed * elapsed, accel_reach) + self.error:
                return 1e6
            if displacement > 1e-6 and (dx * track.velocity[0] + dy * track.velocity[1]) < 0.5 * displacement * velocity_norm:
                return 1e6
        penalty = 0.0
        if velocity_norm > 1.0:
            dx, dy = group.xy[0] - track.xy[0], group.xy[1] - track.xy[1]
            displacement = hypot(dx, dy)
            if displacement > 1.2:
                cosine = (dx * track.velocity[0] + dy * track.velocity[1]) / (displacement * velocity_norm)
                # Prefer physically continuous heading, but allow turns at slow speed.
                penalty += max(0.0, 0.5 - cosine) * min(4.0, velocity_norm / 3.0)
        penalty += min(7.0, max(0.0, elapsed - self.coast) * 2.5)
        if track.gid is None:
            penalty += 1.0
        for i in group.members:
            m = obs[i]
            if m.local_track_id is not None and track.last_ids.get(m.camera_id) == m.local_track_id:
                # A persistent local track corroborates a physical trajectory
                # when a silent ghost sits closer to the new measurement.
                penalty -= min(self.error, 3.0)
            if m.color and track.last_color and m.color != track.last_color:
                penalty += 0.15  # color is only a tie-breaker
        return max(0.0, d + penalty)

    def _birth(self, group: _Group, obs: Sequence[Measurement], now: float, occupied_slots: Iterable[str] | None, initial: bool) -> WorldTrack:
        at_entrance = self.geometry.is_entrance(group.xy, self.entrance_margin)
        at_occupied_slot = self.geometry.slot_at(group.xy, occupied_slots) is not None
        gid: int | None = None
        if at_entrance or at_occupied_slot:
            self._gid += 1
            gid = self._gid
        self._internal_id += 1
        track = WorldTrack(self._internal_id, gid, group.xy, (0.0, 0.0), now, now)
        track.first_xy = group.xy
        track.measurement_count = len(group.cameras)
        track.jointly_seen = len(group.cameras) > 1
        self.tracks.append(track)
        return track

    def _update(self, track: WorldTrack, group: _Group, obs: Sequence[Measurement], now: float) -> None:
        elapsed = now - track.last_seen_s
        if elapsed > 1e-4:
            speed = ((group.xy[0] - track.xy[0]) / elapsed, (group.xy[1] - track.xy[1]) / elapsed)
            if elapsed > self.coast * 2:
                # A long-silent stationary car can move again; don't infer an
                # instantaneous velocity from the entire missed interval.
                track.velocity = (0.0, 0.0)
            else:
                alpha = min(0.72, max(0.35, elapsed / 0.14))
                track.velocity = (
                    (1 - alpha) * track.velocity[0] + alpha * speed[0],
                    (1 - alpha) * track.velocity[1] + alpha * speed[1],
                )
        track.xy = group.xy
        track.last_seen_s = now
        track.hits += 1
        track.measurement_count += len(group.cameras)
        track.jointly_seen |= len(group.cameras) > 1
        track.cameras.update(group.cameras)
        for i in group.members:
            m = obs[i]
            if m.local_track_id is not None:
                track.last_ids[m.camera_id] = m.local_track_id
            if m.color:
                track.last_color = m.color

    def _may_promote(self, track: WorldTrack, group: _Group,
                     observations: Sequence[Measurement], now: float,
                     updated_tracks: set[int]) -> bool:
        """L3': a provisional car earns a GID only after sustained evidence.

        A silent registered car always takes priority if it can physically
        reach this location, including after another provisional track was
        matched here. Source seconds and *actual camera measurements* count.
        """
        if track.gid is not None or track.retired:
            return False
        bootstrap = (self.bootstrap and self._started_at_s is not None
                     and now - self._started_at_s <= 2.0 + 1e-9)
        min_age = 0.4 if bootstrap else 0.8
        min_measurements = 3 if bootstrap else 6
        if now - track.first_seen_s + 1e-9 < min_age or track.measurement_count < min_measurements:
            return False
        start = track.first_xy if track.first_xy is not None else track.xy
        if _distance(start, track.xy) < 5.0 and not track.jointly_seen:
            return False
        for other in self.tracks:
            if (other is track or other.retired or other.gid is None
                    or other.internal_id in updated_tracks):
                continue
            if self._cost(other, group, observations, now) < 1e5:
                return False
        return True

    def _retire_ghosts(self, updated: set[int], now: float) -> None:
        active = [t for t in self.tracks if not t.retired and t.internal_id in updated and t.gid is not None]
        for track in self.tracks:
            if track.retired or track.internal_id in updated or track.gid is None:
                continue
            if now - track.last_seen_s <= self.coast:
                continue
            if self.geometry.is_departing_at_exit(track.xy, track.velocity, self.entrance_margin + self.body_length):
                track.retired = True
                continue
            # Two car centres at the same measured position cannot occupy the
            # same vehicle footprint. Only remove the unobserved contender.
            if any(_distance(track.xy, other.xy) < self.body_length * 0.87 for other in active):
                track.retired = True

    def step(
        self,
        observations: Sequence[Measurement],
        timestamp_s: float,
        *,
        occupied_slots: Iterable[str] | None = None,
        emit_held: bool = False,
    ) -> KernelResult:
        """Associate a simultaneous camera pair; never return fake detections."""
        if not isfinite(timestamp_s) or (self._time_s is not None and timestamp_s <= self._time_s):
            raise ValueError("Source timestamps must be finite and strictly increasing")
        initial = self._time_s is None
        if initial:
            self._started_at_s = timestamp_s
        self._time_s = timestamp_s
        groups = self._groups(observations)
        tracks = [t for t in self.tracks if not t.retired]
        costs = np.full((len(tracks), len(groups)), 1e6, dtype=np.float64)
        for i, track in enumerate(tracks):
            for j, group in enumerate(groups):
                costs[i, j] = self._cost(track, group, observations, timestamp_s)
        assigned_groups: dict[int, WorldTrack] = {}
        updated_tracks: set[int] = set()
        created: list[int] = []
        # Preserve a physically reachable, already registered identity before
        # matching tentative tracks. A single LAP over both classes maximizes
        # the number of matches: a nearby tentative car can take the registered
        # car's exact measurement while that car is moved onto a stray blob.
        # The tentative car has no public identity and can safely go unmatched.
        for has_gid in (True, False):
            track_indices = [i for i, track in enumerate(tracks) if (track.gid is not None) == has_gid]
            group_indices = [j for j in range(len(groups)) if j not in assigned_groups]
            if not track_indices or not group_indices:
                continue
            for ti, gi in _lap_pairs(costs[np.ix_(track_indices, group_indices)]):
                track, group = tracks[track_indices[ti]], groups[group_indices[gi]]
                actual_group = group_indices[gi]
                assigned_groups[actual_group] = track
                self._update(track, group, observations, timestamp_s)
                updated_tracks.add(track.internal_id)

        # Split blobs: if an extra group falls in the same body footprint as
        # an already-measured car, don't mint a second ID. Its observations
        # stay unassigned (one measurement per camera per identity).
        fragments: set[int] = set()
        for gi, group in enumerate(groups):
            if gi in assigned_groups:
                continue
            nearest = sorted(
                ((_distance(group.xy, groups[other].xy), other) for other in assigned_groups),
            )
            if nearest and nearest[0][0] <= self.body_length * 0.56:
                fragments.add(gi)

        for gi in sorted(range(len(groups)), key=lambda index: (-len(groups[index].members), index)):
            group = groups[gi]
            if gi in assigned_groups or gi in fragments:
                continue
            # The same-frame two-camera cluster is stronger evidence than an
            # isolated same-camera fragment. This also covers first births.
            nearest = sorted(
                ((_distance(group.xy, groups[other].xy), other) for other in assigned_groups),
            )
            if nearest and nearest[0][0] <= self.body_length * 0.56 and len(group.members) == 1:
                fragments.add(gi)
                continue
            # Also refuse births at a silent vehicle's physical location.
            if any(
                not t.retired and (
                    _distance(t.xy, group.xy) <= self.body_width * 0.7
                    or (timestamp_s - t.last_seen_s <= self.coast
                        and _distance(t.xy, group.xy) <= self.body_length * 0.87)
                )
                for t in tracks
            ):
                fragments.add(gi)
                continue
            track = self._birth(group, observations, timestamp_s, occupied_slots, initial)
            assigned_groups[gi] = track
            updated_tracks.add(track.internal_id)
            for i in group.members:
                m = observations[i]
                if m.local_track_id is not None:
                    track.last_ids[m.camera_id] = m.local_track_id
                if m.color:
                    track.last_color = m.color
            track.cameras.update(group.cameras)
            if track.gid is not None:
                created.append(track.gid)

        # Promote after all confirmed identities have had first refusal on
        # every observation. Each group counts at most one measurement per cam.
        promoted: dict[int, int] = {}
        for gi, track in assigned_groups.items():
            if (track.gid is None and self._may_promote(
                    track, groups[gi], observations, timestamp_s, updated_tracks)):
                self._gid += 1
                track.gid = self._gid
                created.append(track.gid)
                promoted[track.internal_id] = track.gid

        self._retire_ghosts(updated_tracks, timestamp_s)
        result: list[AssignedMeasurement | None] = [None] * len(observations)
        for gi, group in enumerate(groups):
            track = assigned_groups.get(gi)
            for i in group.members:
                result[i] = AssignedMeasurement(
                    observations[i],
                    track.gid if track is not None and not track.retired and i not in group.fragments else None,
                    "unassigned_fragment" if i in group.fragments or track is None else "measurement",
                    track.internal_id if track is not None and i not in group.fragments else None,
                )
        held = []
        if emit_held:
            for track in self.tracks:
                if track.retired or track.internal_id in updated_tracks or track.gid is None:
                    continue
                held.append(HeldVehicle(track.gid, track.predicted(timestamp_s, self.coast)))
        return KernelResult([r for r in result if r is not None], held, created, promoted)


__all__ = ["GroundGeometry", "Measurement", "WorldTrack", "AssignedMeasurement", "HeldVehicle", "KernelResult", "WorldIdentityKernel"]
