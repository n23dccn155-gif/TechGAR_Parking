"""Experimental point-detector tracker (ENGINE_L). Does not change the M1 engine.

Each M1L blob represents one vehicle centre. No within-camera fragment merge,
group-blob suppression, stopped wake, footprint absorption, or LOST state.
"""
from __future__ import annotations

from collections import deque
from dataclasses import dataclass, field
import math
from statistics import median
from types import MappingProxyType
import warnings

import lap
import numpy as np

from .types import Blob, Core2Engine as EngineContract, Output, State


# A replay may create thousands of engine instances in one process.  Keep the
# warning process-wide; each instance still counts every legacy fallback.
_WARNED_MISSING_WIDTH_CAMS: set[int] = set()


@dataclass(frozen=True)
class EngineLParams:
    fuse_cross_cm: float = 3.5
    gate_base_cm: float = 6.5
    v_max_cm_s: float = 8.0
    reid_speed_cm_s: float = 5.5
    reid_margin_cm: float = 8.0
    t_out_s: float = 4.5
    t_occ_s: float = 3.2
    tentative_frames: int = 3
    tentative_s: float = 0.6
    max_tentative: int = 128
    stop_speed_cm_s: float = 2.0
    initial_parked_at_frame0: bool = True
    stopped_gate_cm: float = 5.8
    moving_gate_cm: float = 5.8
    wake_cm: float = 3.0
    recent_s: float = 0.9
    edge_merge_cm: float = 8.0  # director: approximate; validate against oracle/VAL
    edge_margin_px: float = 30.0
    edge_inward_frames: int = 3  # assumption: preserve existing entry confirmation latency
    edge_inward_px: float = 1.0  # assumption: reject stationary edge artefacts

    # ---------------------------------------------------------------- DOT SUA
    # S1 uses supplied image dimensions; an absent dimension warns once/camera
    # and counts legacy 800-px fallbacks for default-off parity.
    s1_frame_width: dict[str, tuple[int, int]] | None = None   # {"cam1": (w,h), ...}
    # S2: xac nhan tentative o mep khi blob DUNG YEN tai cho >= n frame.
    # 25 frame (1 s) vi ma tai cho M1L v2 tren VAL keo dai toi 18 frame.
    s2_stationary_frames: int = 25
    s2_stationary_cm: float = 1.5     # ban kinh "dung yen tai cho"
    s2_require_no_gid_cm: float = 8.0  # KHONG co track co GID trong 8 cm
    s2_enabled: bool = True
    # S3: tai nhan GID cu cho tentative, khop DUY NHAT 2 CHIEU + margin.
    s3_reid_max_age_s: float = 4.5
    s3_min_missing_s: float = 8 / 25  # seconds; independent of source frame rate
    s3_margin_ratio: float = 1.5      # ung vien 2 phai xa hon >= 1.5x
    s3_margin_cm: float = 6.0         # hoac cach >= +6 cm
    s3_enabled: bool = True
    # S4: STOPPED theo vi tri DA LOC + thuc day giu GID khi blob doi cung huong.
    s4_stop_speed_cm_s: float = 1.4
    s4_stop_frames: int = 16
    s4_push_cm: float = 3.0
    s4_enabled: bool = False
    # S5a: reset filter on re-acquisition after >= s3_min_missing_s.
    s5_reset_on_reacquire: bool = True
    # S5b: khi OCCLUDED/LOST qua 0.5 s, khong ngoai suy van toc nua
    s5_no_extrapolation: bool = False

    # S6 (world cm): embedded from .orca/core2/oov/oov_zones_proposal_v2.json,
    # SHA256 F6D7BA02072EF3CFBD569F058FAF270551B2BB29560E20DE4C07F6E6C28E16C6.
    # Production must not load a .orca file at runtime.
    # Director L002: corridor has a real exit; closed-world OOV re-ID can MIX
    # V051/V008. Keep implementation for diagnosis, disable by default.
    s6_enabled: bool = False
    s6_oov_polygon: tuple[tuple[float, float], ...] = (
        (-64.0, -53.0), (-75.0, -53.0), (-75.0, -31.0),
        (-67.0, -31.0), (-64.0, -42.0),
    )
    s6_t_oov_s: float = 7.2
    s6_mouth_margin_cm: float = 3.0
    s6_fifo: bool = False  # reserved; only enable after GT confirms FIFO

    # S7 (D2 narrow): deferred STOPPED/short-occlusion GID handover.
    s7_handover: bool = False
    s7_anchor_radius_cm: float = 12.0
    s7_recent_occlusion_s: float = 0.5

    # S7b (director-approved, separate from legacy S7): same-camera jump
    # recovery for an otherwise unmatched STOPPED GID. Disabled by default.
    s7b_jump_reattach: bool = False
    s7b_radius_cm: float = 12.0
    s7b_wake_frames: int = 3
    s7b_wake_speed_cm_s: float = 3.0
    s7b_follow_gate_cm: float = 5.8

    # S7c: within-camera extra peak beside a *matched* STOPPED GID.
    # Two independent branches (director decision B): a 3.6 cm circle, or a
    # reliable-body-axis rectangle.  GT L_min=7.25 cm among 121901 pairs with
    # |lateral|<=2 cm; 0.7 * L_min = 5.07 cm.  Never widen the lateral bound.
    s7c_dup_peak: bool = True
    s7c_dup_cm: float = 3.6
    s7c_dup_long_cm: float = 5.07
    s7c_dup_lat_cm: float = 2.0

    # S8: confirmed GIDs own the first per-camera LAP; tentatives get leftovers.
    s8_two_tier: bool = False

    # S9: only the first 50 source frames may recover a parked car whose
    # detector missed the first image. Never open interior births later on.
    s9_startup_window: bool = True
    s9_startup_frames: int = 50
    s9_stationary_frames: int = 25
    s9_stationary_cm: float = 1.5
    s9_no_track_cm: float = 3.6


@dataclass
class _Vehicle:
    tid: int
    xy: tuple[float, float]
    t: float
    first_t: float
    last_t: float
    gid: int | None = None
    state: State = State.TENTATIVE
    v: tuple[float, float] = (0.0, 0.0)
    hits: int = 1
    measured: bool = True
    blobs: tuple[Blob, ...] = ()
    history: deque = field(default_factory=lambda: deque(maxlen=16))
    filtered_xy: tuple[float, float] | None = None
    raw_history: deque = field(default_factory=lambda: deque(maxlen=48))
    anchor: tuple[float, float] | None = None
    resume_state: State | None = None
    bbox_cache: dict[int, tuple[Blob, float]] = field(default_factory=dict)
    edge_origins: dict[int, tuple[float, float]] = field(default_factory=dict)
    oov_timed_out: bool = False
    s7_donor_tid: int | None = None
    s7_blocked: bool = False
    s7b_last_cam_frame: dict[int, int] = field(default_factory=dict)
    s7b_trail: dict[int, list[tuple[int, float, tuple[float, float]]]] = field(default_factory=dict)
    s7b_duration: dict[int, int] = field(default_factory=dict)
    s7c_motion_axis: tuple[float, float] | None = None
    s7c_observed_axis: tuple[float, float] | None = None  # independent motion witness
    s7c_slot_axis: tuple[float, float] | None = None  # only when a slot is assigned

    def predict(self, t: float) -> tuple[float, float]:
        dt = max(0.0, t - self.last_t)
        # Keep the association anchor filtered; noisy measurements should not
        # send an identity across an adjacent stationary vehicle's slot.
        base = self.filtered_xy if self.filtered_xy is not None else self.xy
        if self.state in (State.STOPPED, State.OCCLUDED, State.LOST):
            return base
        return base[0] + self.v[0] * dt, base[1] + self.v[1] * dt

    def predict_for_state(self, t: float, s5b: bool) -> tuple[float, float]:
        """Nhu `predict` nhung co S5b: khi dang OCCLUDED/LOST thi KHONG ngoai suy
        van toc qua 0.5 s (giu vi tri cuoi + van toc giam ve 0).

        Van de do duoc (V047): `predict` cua track dang MOVING truot sang LOST van
        ngoai suy `v * dt` voi dt lon => diem du doan troi xa blob that, gate khong
        bat lai duoc. S5b chi anh huong DUONG SO KHOP trong luc mat do.
        """
        if not s5b or self.state not in (State.OCCLUDED, State.LOST):
            return self.predict(t)
        dt = max(0.0, t - self.last_t)
        base = self.filtered_xy if self.filtered_xy is not None else self.xy
        if dt <= 0.5:
            return base[0] + self.v[0] * dt, base[1] + self.v[1] * dt
        # qua 0.5 s: dung o vi tri cuoi + phan con lai voi van toc giam tuyen tinh ve 0
        ramp = 0.5 / dt
        return (base[0] + self.v[0] * 0.5 * ramp * dt,
                base[1] + self.v[1] * 0.5 * ramp * dt)


@dataclass
class _StartupParked:
    xy: tuple[float, float]
    first_frame: int
    last_frame: int
    hits: int = 1


def _centre(positions) -> tuple[float, float]:
    return median(p[0] for p in positions), median(p[1] for p in positions)


def _pairs(cost: np.ndarray, limit: float) -> list[tuple[int, int]]:
    if not cost.size:
        return []
    big = 1e6
    masked = np.where(cost <= limit, cost, big)
    _, assigned, _ = lap.lapjv(masked, extend_cost=True, cost_limit=big / 2)
    return [(i, int(j)) for i, j in enumerate(assigned) if j >= 0 and masked[i, j] < big / 2]


def _fuse_points(blobs_by_cam: dict[int, list[Blob]], radius: float) -> list[tuple[tuple[float, float], tuple[Blob, ...]]]:
    """Cross-camera LAP only. Distinct points in one camera are never merged."""
    cams = sorted(blobs_by_cam)
    if len(cams) != 2:
        out = [((b.xy[0], b.xy[1]), (b,)) for cam in cams for b in blobs_by_cam[cam]]
        return sorted(out, key=lambda ob: ob[0])
    a, b = blobs_by_cam[cams[0]], blobs_by_cam[cams[1]]
    d = np.asarray([[math.dist(x.xy, y.xy) for y in b] for x in a], dtype=np.float64)
    if not a or not b:
        d = np.empty((len(a), len(b)), dtype=np.float64)
    pairs = _pairs(d, radius)
    ai, bi = {i for i, _ in pairs}, {j for _, j in pairs}
    out = []
    for i, j in pairs:
        out.append(((0.5 * (a[i].xy[0] + b[j].xy[0]),
                     0.5 * (a[i].xy[1] + b[j].xy[1])), (a[i], b[j])))
    out.extend((x.xy, (x,)) for i, x in enumerate(a) if i not in ai)
    out.extend((x.xy, (x,)) for j, x in enumerate(b) if j not in bi)
    return sorted(out, key=lambda ob: (ob[0][0], ob[0][1]))


class EngineLEngine(EngineContract):
    """One world track per centre with LAP association and finite occlusion."""

    def __init__(self, params: EngineLParams | None = None,
                 camera_transforms: dict[int, np.ndarray] | None = None,
                 entry_gate: tuple[tuple[float, float], tuple[float, float]] | None = None):
        self.p = params or EngineLParams()
        # The count line is INSIDE the lot. New arrivals first become visible
        # farther out along the entrance lane, often inside the camera ROI.
        self.entry_gate = entry_gate
        self.camera_inverses = {cam: np.linalg.inv(np.asarray(h, dtype=np.float64))
                                for cam, h in (camera_transforms or {}).items()}
        self.tracks: list[_Vehicle] = []
        self._next_tid = 1
        self._next_gid = 1
        self._first_step = True
        self._now: float | None = None
        self._events: deque = deque()
        self._s6_polygon = self._load_s6_polygon() if self.p.s6_enabled else ()
        self._s6_bounds = ((min(x for x, _ in self._s6_polygon),
                            max(x for x, _ in self._s6_polygon),
                            min(y for _, y in self._s6_polygon),
                            max(y for _, y in self._s6_polygon))
                           if self._s6_polygon else None)
        self._s6_pending_reid: list[_Vehicle] = []
        self._s7_pending_confirm: list[_Vehicle] = []
        self._prev_frame: int | None = None
        self._s9_first_frame: int | None = None
        self._s9_parked: list[_StartupParked] = []
        self.counters = {"births": 0, "initial_parked_births": 0,
                         "tentative_expired": 0, "exited": 0, "reacquired": 0,
                         "rejected_interior_births": 0, "rejected_gate": 0}

    def stats(self) -> dict:
        states = {s.name: sum(tr.state is s for tr in self.tracks) for s in State}
        return {**self.counters, "tracks": states,
                "live_gids": sum(t.gid is not None for t in self.tracks)}

    def snapshot(self) -> tuple[MappingProxyType, ...]:
        """Return immutable public views of all retained, confirmed GIDs."""
        now = self._now if self._now is not None else 0.0
        result = []
        for tr in self.tracks:
            if tr.gid is None:
                continue
            age = max(0.0, now - tr.last_t)
            if tr.measured:
                source = "measured"
                xy = tuple(tr.filtered_xy or tr.xy)
                boxes = {b.cam: self._bbox_at(b, xy) for b in tr.blobs}
            elif tr.state is State.OCCLUDED and age <= self.p.t_occ_s:
                source = "held"
                xy = tuple(tr.filtered_xy or tr.xy)
                boxes = self._cached_boxes(tr, xy, now)
            else:
                source = None
                xy = tuple(tr.filtered_xy or tr.xy)
                boxes = {}
            result.append(MappingProxyType({
                "gid": tr.gid,
                "state": tr.state,
                "xy": xy,
                "bbox_by_cam": MappingProxyType(boxes),
                "last_meas_xy": tuple(tr.xy),
                "last_meas_t": tr.last_t,
                "v": tuple(tr.v),
                "bbox_times": MappingProxyType({cam: seen for cam, (_, seen) in tr.bbox_cache.items()}),
                "source": source,
                "held": source == "held",
            }))
        return tuple(result)

    @property
    def next_gid(self) -> int:
        return self._next_gid

    def live_gids(self) -> frozenset[int]:
        """GIDs retained by the engine, including temporarily LOST tracks."""
        return frozenset(tr.gid for tr in self.tracks if tr.gid is not None)

    def drain_events(self) -> tuple[MappingProxyType, ...]:
        """Drain immutable GID creation/destruction events."""
        events = tuple(self._events)
        self._events.clear()
        return events

    def _emit_event(self, **event) -> None:
        self._events.append(MappingProxyType(event))

    def _new(self, ob, t: float, initial: bool) -> None:
        xy, blobs = ob
        tr = _Vehicle(tid=self._next_tid, xy=xy, t=t, first_t=t,
                      last_t=t, blobs=blobs, filtered_xy=xy)
        tr.history.append((t, xy))
        tr.raw_history.append((t, xy))
        tr.anchor = xy
        tr.bbox_cache = {b.cam: (b, t) for b in blobs}
        tr.s7b_last_cam_frame = {b.cam: self._frame for b in blobs}
        tr.edge_origins = {b.cam: self._pixel_centre(b) for b in blobs if self._edge_blob(b)}
        self._next_tid += 1
        if initial:
            self._confirm(tr, initial=True, t=t)
        self.tracks.append(tr)

    def _s9_startup_birth(self, ob, t: float, frame: int) -> bool:
        """Recover a stable missing-at-start parked car, never an interior arrival.

        Only raw, unmatched interior leftovers reach this method. Observations
        must occur in distinct frames inside the initial 50-frame window.
        """
        p = self.p
        first = self._s9_first_frame
        # A cropped replay beginning at f6400 is not a new video startup.
        if (not p.s9_startup_window or first is None or first > 1
                or not 0 <= frame - first < p.s9_startup_frames):
            return False
        xy, blobs = ob
        # Protect both measured and unmeasured owners, including tentatives.
        if any(math.dist(xy, tr.filtered_xy or tr.xy) <= p.s9_no_track_cm
               or math.dist(xy, tr.xy) <= p.s9_no_track_cm
               for tr in self.tracks):
            return False
        nearby = [candidate for candidate in self._s9_parked
                  if math.dist(xy, candidate.xy) <= p.s9_stationary_cm]
        if len(nearby) > 1:
            return False  # Ambiguous peak; never merge two candidate cars.
        if not nearby:
            self._s9_parked.append(_StartupParked(xy, frame, frame))
            return False
        candidate = nearby[0]
        if candidate.last_frame == frame:
            return False  # Two camera peaks in the same frame count once.
        candidate.hits += 1
        candidate.last_frame = frame
        if candidate.hits < p.s9_stationary_frames:
            return False
        # A second independently seen startup point would make identity
        # ambiguous. Do not create a fresh GID in that situation.
        if any(other is not candidate
               and math.dist(other.xy, candidate.xy) <= p.s9_no_track_cm
               for other in self._s9_parked):
            return False
        self._s9_parked.remove(candidate)
        self._new(ob, t, initial=True)
        gid = self.tracks[-1].gid
        self.counters["s9_startup_births"] = self.counters.get("s9_startup_births", 0) + 1
        self._emit_event(type="s9_startup_birth", frame=frame, gid=gid,
                         first_frame=candidate.first_frame, hits=candidate.hits,
                         cam=tuple(sorted(b.cam for b in blobs)), xy=xy)
        return True

    @staticmethod
    def _pixel_centre(blob: Blob) -> tuple[float, float]:
        x, y, w, h = blob.bbox
        return x + w / 2.0, y + h / 2.0

    def _frame_width(self, cam: int) -> float:
        """Use configured camera width; explicitly report legacy fallback."""
        widths = self.p.s1_frame_width or {}
        for key in (f"cam{cam + 1}", str(cam), cam):
            if key in widths:
                value = widths[key]
                if isinstance(value, (tuple, list)):
                    value = value[0]
                width = float(value)
                if not math.isfinite(width) or width <= 0:
                    raise ValueError(f"Invalid width for camera {cam}: {value!r}")
                return width
        self.counters["s1_missing_width_calls"] = self.counters.get("s1_missing_width_calls", 0) + 1
        if cam not in _WARNED_MISSING_WIDTH_CAMS:
            _WARNED_MISSING_WIDTH_CAMS.add(cam)
            warnings.warn(f"Missing S1 image width for camera {cam}; using legacy 800 px fallback",
                          RuntimeWarning, stacklevel=2)
        return 800.0

    def _load_s6_polygon(self) -> tuple[tuple[float, float], ...]:
        # Default OOV region lives in EngineLParams, independent of deployment path.
        polygon = tuple(tuple(map(float, point)) for point in self.p.s6_oov_polygon)
        if len(polygon) < 3 or any(not all(math.isfinite(v) for v in pt) for pt in polygon):
            raise ValueError("S6 OOV polygon must contain at least three finite world points")
        if self.p.s6_t_oov_s <= self.p.t_out_s:
            raise ValueError("s6_t_oov_s must exceed t_out_s")
        if self.p.s6_fifo:
            raise ValueError("S6 FIFO requires GT approval and an explicit implementation")
        return polygon

    def _s6_distance_to_zone(self, xy: tuple[float, float]) -> float:
        """Distance to corridor BOX derived from proposal polygon, in world cm.

        The independently checked OOV coverage uses the bounding rectangle;
        the five-sided proposal polygon has not been separately validated.
        """
        if self._s6_bounds is None:
            return math.inf
        x, y = xy
        min_x, max_x, min_y, max_y = self._s6_bounds
        return math.hypot(max(min_x - x, x - max_x, 0.0),
                          max(min_y - y, y - max_y, 0.0))

    def _s6_within_zone(self, tr: _Vehicle, now: float) -> bool:
        base = tr.filtered_xy or tr.xy
        age = max(0.0, now - tr.last_t)
        projected = (base[0] + tr.v[0] * min(age, self.p.t_occ_s),
                     base[1] + tr.v[1] * min(age, self.p.t_occ_s))
        return (self._s6_distance_to_zone(tr.xy) == 0
                or self._s6_distance_to_zone(tr.predict(now)) == 0
                or self._s6_distance_to_zone(projected) == 0)

    def _s6_oov_track(self, tr: _Vehicle, now: float) -> bool:
        if not self.p.s6_enabled or tr.gid is None or tr.oov_timed_out:
            return False
        age = now - tr.last_t
        return 0 < age <= self.p.s6_t_oov_s and self._s6_within_zone(tr, now)

    def _s6_at_mouth(self, xy: tuple[float, float]) -> bool:
        return (self.p.s6_enabled
                and self._s6_distance_to_zone(xy) <= self.p.s6_mouth_margin_cm)

    def _s6_closed_mouth(self, xy: tuple[float, float], now: float) -> bool:
        return (self._s6_at_mouth(xy)
                and any(self._s6_oov_track(tr, now) for tr in self.tracks))

    def _s6_resolve_pending(self, now: float) -> None:
        """Evaluate all S6 proposals before removing any donor from tracks.

        This prevents an early adoption from silently eliminating a competing
        OOV candidate for the next tentative in the same camera frame.
        """
        if not self._s6_pending_reid:
            return
        proposals = [(tr, self._reid_target(tr, only_oov=True))
                     for tr in self._s6_pending_reid
                     if any(other is tr for other in self.tracks) and tr.gid is None]
        for tr, donor in proposals:
            if donor is None:
                continue
            if sum(other is donor for _, other in proposals) != 1:
                continue
            if any(other is donor for other in self.tracks) and donor.gid is not None:
                self._adopt(tr, donor, t=now)
        self._s6_pending_reid.clear()

    def _s7_anchor(self, tr: _Vehicle) -> tuple[float, float]:
        return tr.anchor or tr.filtered_xy or tr.xy

    def _s7_donors_at_confirm(self, candidate: _Vehicle, now: float) -> list[_Vehicle]:
        """Find short-missing STOPPED identities when a legal tentative confirms.

        A donor must have received no blob since the tentative appeared. In
        particular, a nearby measured parked car cannot hand over its GID.
        """
        radius = self.p.s7_anchor_radius_cm
        return [tr for tr in self.tracks
                if tr is not candidate and tr.gid is not None and not tr.measured
                # A short OCCLUDED/LOST track qualifies even if it was moving;
                # a still-STOPPED track also qualifies when its blob went missing.
                and tr.state in (State.STOPPED, State.OCCLUDED, State.LOST)
                and tr.last_t < candidate.first_t - 1e-9
                and 0 < now - tr.last_t <= self.p.s7_recent_occlusion_s + 1e-9
                and math.dist(self._s7_anchor(tr), candidate.xy) <= radius]

    def _s7_can_adopt(self, tr: _Vehicle, donor: _Vehicle, now: float) -> bool:
        """Handover only if donor stayed unmatched throughout the wait.

        Only other missing identities and tentatives can compete. Parked cars
        currently matched to their own blobs are never contenders.
        """
        if donor not in self._s7_donors_at_confirm(tr, now):
            return False
        anchor = self._s7_anchor(donor)
        best_gap = math.dist(anchor, tr.xy)
        for other in self.tracks:
            if other is tr or other is donor or (other.gid is not None and other.measured):
                continue
            pos = self._s7_anchor(other) if other.gid is not None else other.xy
            second_gap = math.dist(pos, tr.xy)
            if second_gap <= self.p.s7_anchor_radius_cm:
                return False
            # Keep S3's margin principle even for a second possible donor
            # just outside the 12 cm eligibility radius.
            if (other.gid is not None
                    and second_gap <= 2 * self.p.s7_anchor_radius_cm
                    and not (second_gap >= self.p.s3_margin_ratio * best_gap
                             or second_gap - best_gap >= self.p.s3_margin_cm)):
                return False
        return True

    def _s7_resolve_pending(self, now: float) -> None:
        """Resolve after all camera assignments and new births for the frame."""
        if not self._s7_pending_confirm:
            return
        pending = list(self._s7_pending_confirm)
        self._s7_pending_confirm.clear()
        # Evaluate the entire batch against the same collection of tracks.
        proposals = []
        for tr in pending:
            donors = self._s7_donors_at_confirm(tr, now)
            donor = donors[0] if len(donors) == 1 else None
            proposals.append((tr, donor, donor is not None and self._s7_can_adopt(tr, donor, now)))
        for tr, donor, allowed in proposals:
            if tr.gid is not None or not any(other is tr for other in self.tracks):
                continue
            if (allowed and donor is not None
                    and sum(other is donor and ok for _, other, ok in proposals) == 1
                    and any(other is donor for other in self.tracks)):
                gid, tid, distance, state = (donor.gid, tr.tid,
                                              math.dist(self._s7_anchor(donor), tr.xy),
                                              donor.state.name)
                tr.s7_donor_tid = donor.tid
                self._adopt(tr, donor, t=now)
                self.counters['s7_handover_adopted'] = self.counters.get('s7_handover_adopted', 0) + 1
                self._emit_event(type='s7_handover', frame=self._frame,
                                 gid_donor=gid, tid_tentative=tid,
                                 distance_cm=distance, donor_state=state)
            else:
                if donor is not None:
                    self.counters['s7_handover_rejected'] = self.counters.get('s7_handover_rejected', 0) + 1
                # Preserve the existing S3 policy outside the entry lane.
                reid = (self._reid_target(tr) if self.p.s3_enabled
                        and not self._at_entry(tr.xy) else None)
                if reid is not None:
                    self._adopt(tr, reid, t=now)
                else:
                    self._confirm(tr, t=now)

    def _edge_blob(self, blob: Blob) -> bool:
        u, _ = self._pixel_centre(blob)
        width = self._frame_width(blob.cam)
        return (blob.roi_clipped or u <= self.p.edge_margin_px
                or u >= width - self.p.edge_margin_px)

    def _inward_edge(self, tr: _Vehicle, blobs: tuple[Blob, ...]) -> bool:
        if tr.hits < self.p.edge_inward_frames:
            return False
        for blob in blobs:
            origin = tr.edge_origins.get(blob.cam)
            if origin is None:
                continue
            u, _ = self._pixel_centre(blob)
            width = self._frame_width(blob.cam)
            if origin[0] <= self.p.edge_margin_px and u - origin[0] >= self.p.edge_inward_px:
                return True
            if origin[0] >= width - self.p.edge_margin_px and origin[0] - u >= self.p.edge_inward_px:
                return True
            if self._at_entry(tr.xy) and tr.xy[0] < tr.history[0][1][0] - 0.1:
                return True
        return False

    def _stationary_at_edge(self, tr: _Vehicle, blobs: tuple[Blob, ...]) -> bool:
        """S2: blob o mep nhung DUNG YEN tai cho >= s2_stationary_frames frame.

        Dieu kien director:
          (1) >= 25 frame on dinh (1 s) — KHONG phai tentative_frames=3, vi ma tai cho
              tren M1L v2 keo dai toi 18 frame;
          (2) KHONG co track CO GID nao trong s2_require_no_gid_cm (8 cm) — neu co thi
              luat (a) gop vao track do, khong sinh track moi.
        """
        if tr.hits < self.p.s2_stationary_frames:
            return False
        recent = list(tr.raw_history)[-self.p.s2_stationary_frames:]
        if len(recent) < self.p.s2_stationary_frames:
            return False
        centre = _centre([pos for _, pos in recent])
        if any(math.dist(pos, centre) > self.p.s2_stationary_cm for _, pos in recent):
            return False
        # khong duoc co track CO GID khac trong 8 cm
        for other in self.tracks:
            if other is tr or other.gid is None:
                continue
            if math.dist(other.predict(tr.t), centre) <= self.p.s2_require_no_gid_cm:
                return False
        return True

    def _reid_target(self, tr: _Vehicle, only_oov: bool = False) -> _Vehicle | None:
        """S3: tim track CO GID dang OCCLUDED/LOST de TAI NHAN, khop DUY NHAT 2 CHIEU.

        Diep kien director:
          - tentative chi co DUNG 1 track ung vien, VA track do chi co DUNG 1 tentative
            ung vien (khop 1-1);
          - phai co MARGIN so voi ung vien thu 2 (xa hon >= 1.5x HOAC >= +6 cm);
          - mo ho => KHONG trao GID (tha FRAG hon MIX);
          - KHONG ap dung cho tentative sinh o LAN VAO (khi track mat o cho khac/huong
            khac) => caller phai kiem `_at_entry`.
        """
        p = self.p
        now = tr.t
        candidates = []
        for other in self.tracks:
            if other is tr or other.gid is None:
                continue
            if other.state not in (State.OCCLUDED, State.LOST):
                continue
            age = now - other.last_t
            is_oov = self._s6_oov_track(other, now)
            if only_oov and not is_oov:
                continue
            max_age = p.s6_t_oov_s if is_oov else p.s3_reid_max_age_s
            if age <= 0 or age > max_age:
                continue
            # CHI trao GID cho track DA MAT THAT SU (>= s3_min_missing_s giay
            # khong do). Track vua truot 1 frame roi co blob moi ngay tai do la
            # "xe van o day", trao GID se cat doi danh tinh (da do: GID 39 hits 3911
            # bi trao o frame 5363 chi vi 1 frame trong).
            if age < p.s3_min_missing_s:
                continue
            gap = math.dist(other.predict(now), tr.xy)
            limit = p.reid_margin_cm + p.reid_speed_cm_s * age
            if gap > limit:
                continue
            candidates.append((gap, other))
        if not candidates:
            return None
        candidates.sort(key=lambda item: item[0])
        best_gap, best = candidates[0]
        # margin so voi ung vien thu 2
        if len(candidates) > 1:
            second_gap = candidates[1][0]
            if not (second_gap >= p.s3_margin_ratio * best_gap
                    or second_gap - best_gap >= p.s3_margin_cm):
                return None
        # khop 1-1: track `best` chi duoc co DUNG 1 tentative trong ban kinh nay
        rivals = [t for t in self.tracks
                  if t is not best and t.gid is None and t is not tr
                  and math.dist(best.predict(now), t.xy) <= best_gap]
        if rivals:
            return None
        return best

    def _remove_edge_duplicates(self, blobs_by_cam, t):
        """Discard edge extras close to a live track or an unclipped point."""
        all_blobs = [b for blobs in blobs_by_cam.values() for b in blobs]
        clean = [b for b in all_blobs if not self._edge_blob(b)]
        live = [tr.predict(t) for tr in self.tracks if tr.gid is not None
                and not (self._s6_oov_track(tr, t)
                         and t - tr.last_t >= self.p.s3_min_missing_s)]
        kept = {}
        for cam, blobs in blobs_by_cam.items():
            kept[cam] = [b for b in blobs if not self._edge_blob(b) or
                         not any(math.dist(b.xy, xy) <= self.p.edge_merge_cm
                                 for xy in live + [c.xy for c in clean])]
        return kept

    def _confirm(self, tr: _Vehicle, initial: bool = False,
                 t: float | None = None) -> None:
        tr.gid = self._next_gid
        self._next_gid += 1
        tr.state = State.STOPPED if initial else State.MOVING
        self.counters["births"] += 1
        if initial:
            self.counters["initial_parked_births"] += 1
        self._emit_event(type="gid_created", gid=tr.gid, t=t,
                         state=tr.state.name)

    def _adopt(self, tr: _Vehicle, donor: _Vehicle, t: float | None = None) -> None:
        """S3: TRAO GID tu `donor` (dang OCCLUDED/LOST) sang `tr`, khong tao GID moi."""
        gid = donor.gid
        from_state = donor.state
        tr.gid = gid
        tr.state = donor.resume_state or from_state
        if tr.state in (State.OCCLUDED, State.LOST):
            tr.state = State.MOVING
        tr.resume_state = None
        tr.anchor = donor.anchor
        self.counters["reacquired"] += 1
        self.counters["gid_adopted"] = self.counters.get("gid_adopted", 0) + 1
        donor.gid = None
        donor.state = State.EXITED
        # IMPORTANT: this is called while step() processes camera assignments.
        # Remove by identity immediately; a donor left as gid=None may match
        # new detections and confirm a second, spurious identity.
        self.tracks = [other for other in self.tracks if other is not donor]
        self._emit_event(type="gid_adopted", gid=gid, t=t,
                         from_state=from_state.name)

    def _s7b_reattach(self, t: float, frame: int, eligible_tids: set[int],
                      matched: dict[int, list[Blob]],
                      leftovers: dict[int, list[Blob]],
                      frame_blobs: dict[int, list[Blob]] | None = None) -> None:
        """S7b: recover one unassigned camera blob for a STOPPED identity.

        This executes AFTER the regular per-camera LAP assignments. In
        particular, an already matched blob, or one matched to a tentative,
        cannot be taken away by S7b. The STOPPED world anchor remains fixed
        until continuous motion proves that the vehicle actually departed.
        """
        if not self.p.s7b_jump_reattach:
            return
        p = self.p
        if p.s7b_wake_frames < 1 or p.s7b_radius_cm <= 0 or p.s7b_follow_gate_cm <= 0:
            raise ValueError("invalid S7b radius/follow gate/wake frame count")
        if self._prev_frame != frame - 1:
            for tr in self.tracks:
                tr.s7b_trail.clear()
                tr.s7b_duration.clear()
            return
        if frame_blobs is None:
            # Direct unit-test calls can omit raw input. Production passes all
            # detections so a second car matched to ANOTHER GID is visible.
            frame_blobs = {cam: list(blobs) for cam, blobs in leftovers.items()}
            for own in matched.values():
                for blob in own:
                    frame_blobs.setdefault(blob.cam, []).append(blob)

        # Resolve proposals first, so two STOPPED GIDs cannot claim the same
        # leftover in sequence. Other measured/assigned parked cars are not
        # competing donors; unmatched GIDs and all tentatives are.
        proposals = []
        for i, tr in enumerate(self.tracks):
            if tr.gid is None or tr.tid not in eligible_tids:
                continue
            anchor = tr.anchor or tr.filtered_xy or tr.xy
            own_matches = matched.get(i, [])
            own_cams = {b.cam for b in own_matches}
            for cam, available in leftovers.items():
                if cam in own_cams or tr.s7b_last_cam_frame.get(cam) != frame - 1:
                    continue
                trail = tr.s7b_trail.get(cam, [])
                continued = bool(trail and trail[-1][0] == frame - 1)

                def close(b: Blob) -> bool:
                    return (math.dist(b.xy, anchor) <= p.s7b_radius_cm
                            or (continued and math.dist(b.xy, trail[-1][2])
                                <= p.s7b_follow_gate_cm))

                near = [b for b in available if close(b)]
                if len(near) != 1:
                    continue
                b = near[0]
                distance = math.dist(b.xy, anchor)
                # The S3 margin is evaluated against real competitors. A
                # stable parked GID already matched to its own blob is inert.
                rival_distances = []
                for j, other in enumerate(self.tracks):
                    if j == i or (other.gid is not None and j in matched):
                        continue
                    pos = other.anchor or other.filtered_xy or other.xy
                    gap = math.dist(pos, b.xy)
                    if gap <= p.s7b_radius_cm:
                        rival_distances.append(gap)
                if rival_distances:
                    # Presence inside the 12 cm handover region is ambiguous;
                    # even a numerical S3 margin must not swallow this car.
                    continue
                # Other camera sees TWO detections: A at the anchor and B
                # near this jump. Include detections already matched to a
                # different track; looking only at leftovers would miss B.
                two_car_cross_cam = any(
                    math.dist(anchor, parked.xy) <= p.stopped_gate_cm
                    and any(jumped is not parked
                            and math.dist(b.xy, jumped.xy) <= p.fuse_cross_cm
                            for jumped in blobs)
                    for other_cam, blobs in frame_blobs.items() if other_cam != cam
                    for parked in blobs)
                if two_car_cross_cam:
                    self.counters["s7b_cross_cam_veto"] = (
                        self.counters.get("s7b_cross_cam_veto", 0) + 1)
                    continue
                proposals.append((i, cam, b, distance))

        # A track may take one leftover per camera, but the two camera
        # proposals must describe the SAME car. Incompatible jumps are
        # ambiguous: leave both observations to the ordinary pipeline.
        incompatible = {i for i, cam, b, _ in proposals
                        if any(j == i and other_cam != cam
                               and math.dist(b.xy, other_blob.xy) > p.fuse_cross_cm
                               for j, other_cam, other_blob, _ in proposals)}
        used_blobs: set[int] = set()
        used_track_cams: set[tuple[int, int]] = set()
        woken_this_frame: set[int] = set()
        for i, cam, b, distance in sorted(proposals, key=lambda row: row[3]):
            tr = self.tracks[i]
            if i in incompatible or (i, cam) in used_track_cams or id(b) in used_blobs:
                continue
            # A second STOPPED claimant in the radius needs S3 1-to-1 margin.
            competing = [gap for j, other_cam, other_blob, gap in proposals
                         if j != i and id(other_blob) == id(b)]
            if competing and not all(
                    gap >= p.s3_margin_ratio * distance
                    or gap - distance >= p.s3_margin_cm for gap in competing):
                continue
            prior = tr.s7b_trail.get(cam, [])
            trail = prior + [(frame, t, b.xy)] if prior and prior[-1][0] == frame - 1 else [
                (frame, t, b.xy)]
            trail = trail[-(p.s7b_wake_frames + 1):]
            duration = tr.s7b_duration.get(cam, 0) + 1 if len(trail) > 1 else 1
            tr.s7b_trail[cam] = trail
            tr.s7b_duration[cam] = duration
            k = p.s7b_wake_frames
            outside = (len(trail) >= k and all(
                math.dist(pos, tr.anchor or tr.filtered_xy or tr.xy) > p.s7b_radius_cm
                for _, _, pos in trail[-k:]))
            motion = False
            if len(trail) >= k + 1:
                tail = trail[-(k + 1):]
                moves = [(tail[j + 1][2][0] - tail[j][2][0],
                          tail[j + 1][2][1] - tail[j][2][1]) for j in range(k)]
                speeds = [math.hypot(*move) / max(tail[j + 1][1] - tail[j][1], 1e-9)
                          for j, move in enumerate(moves)]
                motion = (all(v >= p.s7b_wake_speed_cm_s for v in speeds)
                          and all(moves[j][0] * moves[j + 1][0]
                                  + moves[j][1] * moves[j + 1][1] > 0
                                  for j in range(k - 1)))
            wake = outside or motion
            other_camera_at_anchor = any(
                mb.cam != cam and math.dist(mb.xy, tr.anchor or tr.filtered_xy or tr.xy)
                <= p.stopped_gate_cm for mb in matched.get(i, []))
            if wake and other_camera_at_anchor:
                # Another camera still proves A is parked; release B into the
                # tentative pipeline, including when B is inside the lot.
                # This exception is only allowed after K coherent motion
                # samples and independent observation of the parked A.
                tr.s7b_trail.pop(cam, None)
                tr.s7b_duration.pop(cam, None)
                if sum(other.gid is None for other in self.tracks) < p.max_tentative:
                    self._new((b.xy, (b,)), t, initial=False)
                    leftovers[cam] = [other for other in leftovers[cam] if other is not b]
                self.counters["s7b_released"] = self.counters.get("s7b_released", 0) + 1
                self._emit_event(type="s7b_released", frame=frame,
                                 cam=cam, gid=tr.gid, duration_frames=duration)
                continue

            leftovers[cam] = [other for other in leftovers[cam] if other is not b]
            used_track_cams.add((i, cam))
            used_blobs.add(id(b))
            if wake and i not in woken_this_frame:
                # One camera keeps observing the same departing vehicle.
                # Wake while retaining its GID, resetting its stopped filter
                # to the real blob instead of the former parked anchor.
                tr.state = State.MOVING
                tr.resume_state = None
                tr.filtered_xy = b.xy
                tr.anchor = b.xy
                tr.history.clear()
                tr.raw_history.clear()
                tr.v = (0.0, 0.0)
                self._update(tr, (b.xy, (b,)), t)
                woken_this_frame.add(i)
                tr.s7b_trail.pop(cam, None)
                tr.s7b_duration.pop(cam, None)
                self.counters["s7b_woken"] = self.counters.get("s7b_woken", 0) + 1
                self._emit_event(type="s7b_woken", frame=frame, cam=cam,
                                 gid=tr.gid, duration_frames=duration)
            else:
                if i in woken_this_frame:
                    # A different camera woke this GID earlier in this same
                    # frame. Keep its MOVING state, and attach the second
                    # observation without a second state/filter update.
                    tr.blobs += (b,)
                elif not matched.get(i):
                    tr.state = State.STOPPED
                    tr.resume_state = None
                    tr.t = tr.last_t = t
                    tr.measured = True
                    tr.blobs = (b,)
                    tr.hits += 1
                else:
                    tr.blobs += (b,)
                tr.bbox_cache[cam] = (b, t)
                tr.s7b_last_cam_frame[cam] = frame
            self.counters["s7b_jump_reattached"] = (
                self.counters.get("s7b_jump_reattached", 0) + 1)
            self._emit_event(type="s7b_jump_reattach", frame=frame,
                             cam=cam, gid=tr.gid, distance_cm=round(distance, 4),
                             duration_frames=duration)

        for i, tr in enumerate(self.tracks):
            regular_cams = {blob.cam for blob in matched.get(i, ())}
            for cam in list(tr.s7b_trail):
                if (tr.state is not State.STOPPED or cam in regular_cams
                        or tr.s7b_last_cam_frame.get(cam) != frame):
                    tr.s7b_trail.pop(cam, None)
                    tr.s7b_duration.pop(cam, None)

    def _coherent_push(self, tr: _Vehicle, positions) -> bool:
        """S4: blob roi khoi neo theo MOT HUONG nhat quan (khong phai jitter).

        Yeu cau: trung binh 5 mau cuoi lech khoi neo >= s4_push_cm VA do lech do
        cung huong voi 5 mau cuoi cung (cos > 0.7).
        """
        anchor = tr.anchor or tr.filtered_xy or tr.xy
        tail = positions[-5:]
        centre = _centre(tail)
        offset = (centre[0] - anchor[0], centre[1] - anchor[1])
        distance = math.hypot(*offset)
        if distance < self.p.s4_push_cm:
            return False
        head = _centre(tail[:2])
        move = (centre[0] - head[0], centre[1] - head[1])
        norm = math.hypot(*move)
        if norm < 1e-6:
            return False
        cos = ((offset[0] * move[0] + offset[1] * move[1]) / (distance * norm))
        return cos > 0.7

    def _at_entry(self, xy: tuple[float, float]) -> bool:
        """Admit an arrival upstream of the calibrated entrance count line."""
        if self.entry_gate is None:
            return False
        a, b = self.entry_gate
        # TechGar's calibrated entrance line is vertical; x grows towards
        # the exterior. Limit the corridor in y so parking-lot ghost points
        # do not become identities merely because their x is large.
        if abs(a[0] - b[0]) > 2.0:
            return False
        return (xy[0] >= a[0] + 8.0
                and min(a[1], b[1]) - 6.0 <= xy[1] <= max(a[1], b[1]) + 6.0)

    def _update(self, tr: _Vehicle, ob, t: float) -> None:
        xy, blobs = ob
        # S5a: when an OCCLUDED/LOST track reappears after >= s3_min_missing_s,
        # reset its filter. Ly do do duoc (V047, sang_10p):
        # alpha=0.8 tron voi du doan da troi 4.6 cm => filtered_xy lech 8.17 cm >
        # gate 5.8 => khong bao gio bat lai, du blob van o do.
        s5_reset = False
        if tr.state in (State.OCCLUDED, State.LOST):
            missing_s = max(0.0, t - tr.last_t)
            if self.p.s5_reset_on_reacquire and missing_s >= self.p.s3_min_missing_s:
                tr.filtered_xy = xy
                tr.v = (0.0, 0.0)
                tr.history.clear()
                tr.history.append((t, xy))
                s5_reset = True
                self.counters["s5_reset"] = self.counters.get("s5_reset", 0) + 1
                # Director: frame reset KHONG duoc gay STOPPED som. Track vua nhan lai
                # blob o vi tri khac cho thay no DA DOI CHO => khong ke thua STOPPED
                # tu `resume_state`; dat MOVING va de S4 tu quyet dinh STOPPED sau
                # >= s4_stop_frames frame vị tri loc dung yen.
                moved = math.dist(xy, tr.xy) > self.p.s2_stationary_cm
                if moved and tr.resume_state is State.STOPPED:
                    tr.resume_state = State.MOVING
            tr.state = tr.resume_state or State.MOVING
            tr.resume_state = None
        delta = t - tr.last_t
        predicted = tr.predict(t)
        tr.raw_history.append((t, xy))
        recent = [(tt, pos) for tt, pos in tr.raw_history
                  if t - tt <= self.p.recent_s]
        positions = [pos for _, pos in recent]

        # The parked identity is fixed to a robust anchor, not the latest
        # noisy detection. A real departure produces coherent displacement
        # between two groups of samples, unlike independent Gaussian jitter.
        if tr.state is State.STOPPED:
            if (len(recent) >= 14 and recent[-1][0] - recent[0][0] >= 0.48
                    and math.dist(_centre(positions[:5]),
                                  _centre(positions[-5:])) > self.p.wake_cm):
                tr.state = State.MOVING
            elif (self.p.s4_enabled and len(positions) >= 5
                    and self._coherent_push(tr, positions)):
                # S4: blob doi CUNG HUONG va du xa => day ngay, GIU GID
                # (khong cho du 14 frame/0.48 s nhu nhanh tren, va khong dong bang
                #  anchor cu lam mat dau vet).
                tr.state = State.MOVING
            else:
                tr.anchor = _centre(positions)
                tr.filtered_xy = tr.anchor
                tr.v = (0.0, 0.0)

        if tr.state is not State.STOPPED:
            # Robust linear fit to the last ~0.9s of measurements. Fitted
            # position is evaluated at the CURRENT timestamp, without the
            # half-window lag of a simple moving median.
            if len(recent) >= 5 and recent[-1][0] - recent[0][0] >= 0.12:
                def fit(samples):
                    ts = [tt - t for tt, _ in samples]
                    mean_t = sum(ts) / len(ts)
                    denom = sum((tt - mean_t) ** 2 for tt in ts)
                    if denom <= 1e-8:
                        return xy, (0.0, 0.0)
                    means = tuple(sum(pos[k] for _, pos in samples) / len(samples)
                                  for k in (0, 1))
                    vel = tuple(sum((tt - mean_t) * (pos[k] - means[k])
                                    for tt, pos in zip(ts, [p for _, p in samples])) / denom
                                for k in (0, 1))
                    return tuple(means[k] - vel[k] * mean_t for k in (0, 1)), vel

                location, vel = fit(recent)
                # A single erroneous camera assignment must not move a track.
                trimmed = [(tt, pos) for tt, pos in recent
                           if math.dist(pos, (location[0] + vel[0] * (tt - t),
                                              location[1] + vel[1] * (tt - t))) <= 4.5]
                if len(trimmed) >= 5:
                    location, vel = fit(trimmed)
                speed = math.hypot(*vel)
                if speed > self.p.v_max_cm_s:
                    vel = tuple(v * self.p.v_max_cm_s / speed for v in vel)
                tr.filtered_xy, tr.v = location, vel
            else:
                # S5a: frame RESET khong duoc tron alpha voi du doan da troi
                # (director: reset khong duoc gay STOPPED som / vi tri sai).
                if s5_reset:
                    tr.filtered_xy = xy
                else:
                    alpha = 0.8 if delta > 0.16 else 0.35
                    tr.filtered_xy = tuple(predicted[k] + alpha * (xy[k] - predicted[k])
                                           for k in (0, 1))
            if (not s5_reset and tr.gid is not None and len(recent) >= 16
                    and recent[-1][0] - recent[0][0] >= 0.55
                    and math.hypot(*tr.v) < 1.4
                    and math.dist(_centre(positions[:5]),
                                  _centre(positions[-5:])) < 1.5):
                tr.state = State.STOPPED
                tr.anchor = _centre(positions)
                tr.filtered_xy = tr.anchor
                tr.v = (0.0, 0.0)
            elif (self.p.s4_enabled and tr.gid is not None
                    and tr.state is not State.STOPPED
                    and len(recent) >= self.p.s4_stop_frames
                    and math.hypot(*tr.v) < self.p.s4_stop_speed_cm_s):
                # S4 TOPI THIEU: vao STOPPED theo VI TRI DA LOC (filtered_xy), khong
                # phai blob tho. Dieu kien: toc do ~0 tren du s4_stop_frames frame VA
                # vi tri loc on dinh tai cho.
                recent_filtered = [pos for _, pos in list(tr.history)[-self.p.s4_stop_frames:]]
                if (len(recent_filtered) >= self.p.s4_stop_frames
                        and math.dist(_centre(recent_filtered), tr.filtered_xy)
                        <= self.p.s2_stationary_cm):
                    tr.state = State.STOPPED
                    tr.anchor = tr.filtered_xy
                    tr.v = (0.0, 0.0)
        tr.xy = xy
        if tr.state is State.MOVING and math.hypot(*tr.v) >= 2.0:
            speed = math.hypot(*tr.v)
            tr.s7c_motion_axis = (tr.v[0] / speed, tr.v[1] / speed)
            tr.s7c_observed_axis = tr.s7c_motion_axis
        tr.t = tr.last_t = t
        tr.hits += 1
        tr.measured = True
        tr.blobs = blobs
        tr.bbox_cache.update({b.cam: (b, t) for b in blobs})
        if hasattr(self, "_frame"):
            tr.s7b_last_cam_frame.update({b.cam: self._frame for b in blobs})
        tr.history.append((t, tr.filtered_xy))
        if tr.gid is None:
            confirm = (tr.hits >= self.p.tentative_frames and
                       (any(not self._edge_blob(b) for b in blobs)
                        or self._inward_edge(tr, blobs)))
            if not confirm and self.p.s2_enabled and self._stationary_at_edge(tr, blobs):
                confirm = True
            if confirm:
                # S3: tai nhan GID cu neu khop duy nhat 2 chieu + co margin.
                # KHONG ap dung cho tentative sinh o LAN VAO (director).
                adopted = None
                closed_oov = self._s6_closed_mouth(tr.xy, t)
                if closed_oov:
                    self._s6_pending_reid.append(tr)
                elif self.p.s7_handover:
                    # Keep the tentative without a GID until *confirmation*.
                    # A newly recovered original can still veto the transfer.
                    self._s7_pending_confirm.append(tr)
                else:
                    if self.p.s3_enabled and not self._at_entry(tr.xy):
                        adopted = self._reid_target(tr)
                    if adopted is not None:
                        self._adopt(tr, adopted, t=t)
                    else:
                        self._confirm(tr, t=t)

    def _s7c_axis(self, tr: _Vehicle, blob: Blob) -> tuple[tuple[float, float] | None, str]:
        """Use measured pre-stop movement or an explicitly assigned slot axis.

        A detector bbox is not a reliable vehicle heading.  When neither
        trusted source exists, only the circular S7c branch is allowed.
        """
        for vector, source in ((tr.s7c_slot_axis, "assigned_slot"),
                               (tr.s7c_motion_axis, "pre_stop_motion")):
            if vector is None:
                continue
            norm = math.hypot(*vector)
            if math.isfinite(norm) and norm > 1e-9:
                unit = (vector[0] / norm, vector[1] / norm)
                # An estimated motion heading that conflicts with the track's
                # own observed pre-stop velocity is not trustworthy.  This
                # protects a side-by-side parked car from a rotated heading.
                if source == "pre_stop_motion" and tr.s7c_observed_axis is not None:
                    witness = tr.s7c_observed_axis
                    witness_len = math.hypot(*witness)
                    if (not math.isfinite(witness_len) or witness_len < 1e-9
                            or abs(sum(unit[k] * witness[k] for k in (0, 1))
                                   / witness_len) < math.cos(math.radians(30))):
                        continue
                return unit, source
        return None, "unknown"

    def _s7c_observe_leftovers(self, matched: dict[int, list[Blob]],
                              leftovers: dict[int, list[Blob]], frame: int) -> None:
        """Read-only full-VAL sample hook; does not change assignments/births."""
        sink = getattr(self, "s7c_leftover_sink", None)
        if sink is None:
            return
        for cam, remaining in leftovers.items():
            for blob in remaining:
                sink.start_blob(frame, cam)
                for i, tr in enumerate(self.tracks):
                    if tr.gid is None:
                        continue
                    own = next((b for b in matched.get(i, ()) if b.cam == cam), None)
                    reference = own.xy if own is not None else (tr.filtered_xy or tr.xy)
                    delta = (blob.xy[0] - reference[0], blob.xy[1] - reference[1])
                    d = math.hypot(*delta)
                    if d > 8.0:
                        continue
                    axis, source = self._s7c_axis(tr, own or blob)
                    longitudinal = (sum(delta[k] * axis[k] for k in (0, 1))
                                    if axis is not None else None)
                    lateral = (abs(delta[0] * axis[1] - delta[1] * axis[0])
                               if axis is not None else None)
                    state = tr.resume_state if tr.state in (State.OCCLUDED, State.LOST) else tr.state
                    sink.sample(frame, cam, tr.gid, state.name if state else "UNKNOWN",
                                d, longitudinal, lateral, source)

    def _s7c_drop_peaks(self, matched: dict[int, list[Blob]],
                        leftovers: dict[int, list[Blob]], frame: int) -> None:
        """Suppress only unassigned peaks beside an already matched STOPPED GID."""
        if not self.p.s7c_dup_peak:
            return
        if not 0 < self.p.s7c_dup_cm <= 3.64:
            raise ValueError("S7c threshold must be >0 and <= 3.64 cm (0.7 * GT min 5.20)")
        if not 0 < self.p.s7c_dup_long_cm <= 5.07 or not 0 < self.p.s7c_dup_lat_cm <= 2.0:
            raise ValueError("S7c directional limits must be <= GT bounds (5.07, 2.0) cm")
        rival_radius = max(self.p.s7c_dup_cm,
                           math.hypot(self.p.s7c_dup_long_cm, self.p.s7c_dup_lat_cm))
        for cam, remaining in leftovers.items():
            stopped, moving = [], []
            for i, blist in matched.items():
                tr = self.tracks[i]
                own = next((b for b in blist if b.cam == cam), None)
                if own is None or tr.gid is None:
                    continue
                if tr.state is State.STOPPED or tr.resume_state is State.STOPPED:
                    stopped.append((tr, own))
                elif tr.state is State.MOVING or tr.resume_state is State.MOVING:
                    moving.append((tr, own))
            kept = []
            for blob in remaining:
                near_moving = any(min(math.dist(blob.xy, own.xy),
                                      math.dist(blob.xy, tr.anchor or tr.filtered_xy or tr.xy))
                                  <= rival_radius for tr, own in moving)
                if near_moving:
                    self.counters["s7c_dup_moving_seen"] = (
                        self.counters.get("s7c_dup_moving_seen", 0) + 1)
                    kept.append(blob)  # Never suppress a possible moving car.
                    continue
                candidates = []
                for tr, own in stopped:
                    d = math.dist(blob.xy, own.xy)
                    axis, axis_source = self._s7c_axis(tr, own)
                    delta = (blob.xy[0] - own.xy[0], blob.xy[1] - own.xy[1])
                    longitudinal = sum(delta[k] * axis[k] for k in (0, 1)) if axis else None
                    lateral = abs(delta[0] * axis[1] - delta[1] * axis[0]) if axis else None
                    circle = min(d, math.dist(blob.xy, tr.anchor or tr.filtered_xy or tr.xy)) <= self.p.s7c_dup_cm
                    directed = (axis is not None
                                and abs(longitudinal) <= self.p.s7c_dup_long_cm
                                and lateral <= self.p.s7c_dup_lat_cm)
                    if not (circle or directed):
                        continue
                    candidates.append((tr, d, longitudinal, lateral, axis_source,
                                       "circle" if circle else "directed"))
                # Do not swallow a potential second car when several STOPPED
                # owners or another unmatched track can plausibly own the peak.
                if len(candidates) != 1:
                    kept.append(blob)
                    continue
                tr, d, longitudinal, lateral, source, branch = candidates[0]
                if any(other is not tr and
                       math.dist(blob.xy, other.filtered_xy or other.xy) <= rival_radius
                       for other in self.tracks if other.gid is None or other.gid != tr.gid):
                    kept.append(blob)
                    continue
                self.counters["s7c_dup_dropped"] = self.counters.get("s7c_dup_dropped", 0) + 1
                self._emit_event(type="s7c_dup_peak", frame=frame, cam=cam, gid=tr.gid,
                                 distance_cm=round(d, 4), direction=(
                                     "unknown" if longitudinal is None else
                                     "forward" if longitudinal >= 0 else "backward"),
                                 longitudinal_cm=(round(longitudinal, 4) if longitudinal is not None else None),
                                 lateral_cm=(round(lateral, 4) if lateral is not None else None),
                                 axis_source=source, branch=branch)
            leftovers[cam] = kept

    def step(self, t: float, frame: int, blobs_by_cam: dict[int, list[Blob]]) -> list[Output]:
        p = self.p
        if self._s9_first_frame is None:
            self._s9_first_frame = frame
        elif (self._s9_parked and frame - self._s9_first_frame >= p.s9_startup_frames):
            self._s9_parked.clear()
        self._now = t
        self._frame = frame
        self._s6_pending_reid.clear()
        self._s7_pending_confirm.clear()
        retained = []
        for tr in self.tracks:
            age = t - tr.last_t
            if tr.gid is None and age > p.tentative_s:
                self.counters["tentative_expired"] += 1
            elif tr.gid is not None and age > p.t_out_s:
                if (p.s6_enabled and self._s6_within_zone(tr, t)
                        and age <= p.s6_t_oov_s + p.tentative_s):
                    # Retain a confirmed blind-corridor identity for 7.2 s.
                    # After expiry, emit once and keep it LOST briefly so the
                    # timeout is observable; it is no longer eligible for re-ID.
                    if age > p.s6_t_oov_s and not tr.oov_timed_out:
                        tr.oov_timed_out = True
                        tr.state = State.LOST
                        self.counters["oov_timeout"] = self.counters.get("oov_timeout", 0) + 1
                        self._emit_event(type="oov_timeout", gid=tr.gid, t=t)
                    retained.append(tr)
                else:
                    self.counters["exited"] += 1
                    tr.state = State.EXITED
                    self._emit_event(type="gid_destroyed", gid=tr.gid, t=t,
                                     reason="timeout")
            else:
                retained.append(tr)
        self.tracks = retained
        for tr in self.tracks:
            tr.measured = False
            if tr.gid is not None:
                age = t - tr.last_t
                if age > 0:
                    if tr.state not in (State.OCCLUDED, State.LOST):
                        tr.resume_state = tr.state
                    tr.state = State.LOST if age > p.t_occ_s else State.OCCLUDED

        if self._first_step and p.initial_parked_at_frame0:
            for ob in _fuse_points(self._remove_edge_duplicates(blobs_by_cam, t), p.fuse_cross_cm):
                self._new(ob, t, initial=any(not self._edge_blob(b) for b in ob[1]))
            self._first_step = False
            self._prev_frame = frame
            return self._outputs(t)
        self._first_step = False

        # Associate EACH camera to the existing vehicle tracks first. A noisy
        # two-camera pair must not be pre-fused with the point of a NEIGHBOUR:
        # that pre-fusion caused identity swaps even at sigma=0.9 cm. A track
        # may receive one point from each camera, never two from one camera.
        matched_blobs: dict[int, list[Blob]] = {}
        leftovers: dict[int, list[Blob]] = {}
        s8_changed = False
        for cam in sorted(blobs_by_cam):
            blobs = blobs_by_cam[cam]
            if self.tracks and blobs:
                cost = np.full((len(self.tracks), len(blobs)), 1e6, dtype=np.float64)
                for i, tr in enumerate(self.tracks):
                    dt = max(0.0, t - tr.last_t)
                    if tr.oov_timed_out or (self._s6_oov_track(tr, t)
                                            and dt >= p.s3_min_missing_s):
                        # Long OOV gaps must use S3's bidirectional/margin
                        # tests, not arbitrary nearest-neighbour LAP matches.
                        continue
                    base = p.stopped_gate_cm if tr.state is State.STOPPED else p.moving_gate_cm
                    gate = (base + 0.5 * p.v_max_cm_s * dt) if dt <= 0.16 else min(
                        base + p.v_max_cm_s * dt, 40.0)
                    predicted = tr.predict_for_state(t, p.s5_no_extrapolation)
                    for j, b in enumerate(blobs):
                        d = math.dist(predicted, b.xy)
                        if d <= gate:
                            cost[i, j] = d + 0.7 * dt + (0.2 if tr.gid is None else 0.0)
                if p.s8_two_tier:
                    baseline_pairs = _pairs(cost, 1e5)
                    gid_rows = [i for i, tr in enumerate(self.tracks) if tr.gid is not None]
                    tentative_rows = [i for i, tr in enumerate(self.tracks) if tr.gid is None]
                    pairs = [(gid_rows[i], j)
                             for i, j in _pairs(cost[gid_rows, :], 1e5)]
                    remaining_cols = [j for j in range(len(blobs))
                                      if j not in {b for _, b in pairs}]
                    pairs.extend((tentative_rows[i], remaining_cols[j]) for i, j in
                                 _pairs(cost[np.ix_(tentative_rows, remaining_cols)], 1e5))
                    if set(pairs) != set(baseline_pairs):
                        s8_changed = True
                else:
                    pairs = _pairs(cost, 1e5)
            else:
                pairs = []
            consumed = {j for _, j in pairs}
            for i, j in pairs:
                matched_blobs.setdefault(i, []).append(blobs[j])
            leftovers[cam] = [b for j, b in enumerate(blobs) if j not in consumed]

        if s8_changed:
            self.counters["s8_assignment_changed_frames"] = (
                self.counters.get("s8_assignment_changed_frames", 0) + 1)
        self._s7c_observe_leftovers(matched_blobs, leftovers, frame)
        self._s7c_drop_peaks(matched_blobs, leftovers, frame)

        s7b_eligible = {tr.tid for tr in self.tracks
                        if tr.gid is not None and tr.resume_state is State.STOPPED}
        assignments = [(self.tracks[i], matched) for i, matched in matched_blobs.items()]
        for tr, matched in assignments:
            if not any(other is tr for other in self.tracks):
                continue  # _adopt may have removed this donor this step.
            if t - tr.last_t > 0.16:
                self.counters["reacquired"] += 1
            centre = (sum(b.xy[0] for b in matched) / len(matched),
                      sum(b.xy[1] for b in matched) / len(matched))
            self._update(tr, (centre, tuple(matched)), t)

        self._s7b_reattach(t, frame, s7b_eligible, matched_blobs, leftovers,
                           blobs_by_cam)

        for ob in _fuse_points(self._remove_edge_duplicates(leftovers, t), p.fuse_cross_cm):
            # Closed-world policy: interior outliers can only update an
            # existing track; mouth detections may form a tentative so S3 can
            # adopt the hidden OOV identity, but cannot create a new GID.
            if (not any(self._edge_blob(b) for b in ob[1])
                    and not self._at_entry(ob[0])
                    and not self._s6_closed_mouth(ob[0], t)):
                if self._s9_startup_birth(ob, t, frame):
                    continue
                self.counters["rejected_interior_births"] += 1
                continue
            if sum(tr.gid is None for tr in self.tracks) >= p.max_tentative:
                continue
            self._new(ob, t, initial=False)
        self._s6_resolve_pending(t)
        self._s7_resolve_pending(t)
        for tr in self.tracks:
            if not tr.measured:
                if tr.gid is None:
                    # Confirmation requires consecutive measurements.
                    tr.hits = 0
        self._prev_frame = frame
        return self._outputs(t)

    def _bbox_at(self, blob: Blob, xy: tuple[float, float]):
        box = blob.bbox
        inv = self.camera_inverses.get(blob.cam)
        if inv is not None:
            point = inv @ np.asarray([*xy, 1.0])
            u, v = point[0] / point[2], point[1] / point[2]
            return (float(u - box[2] / 2), float(v - box[3] / 2),
                    box[2], box[3])
        return box

    def _cached_boxes(self, tr: _Vehicle, xy: tuple[float, float],
                      t: float) -> dict[int, tuple[float, float, float, float]]:
        if xy is None:
            return {}
        return {cam: self._bbox_at(blob, xy)
                for cam, (blob, seen_t) in sorted(tr.bbox_cache.items())
                if t - seen_t <= self.p.t_occ_s}

    def _outputs(self, t: float) -> list[Output]:
        result = []
        for tr in self.tracks:
            if tr.gid is None:
                continue
            if tr.measured:
                source = "measured"
                xy = tr.filtered_xy or tr.xy
                bboxes = {b.cam: self._bbox_at(b, xy) for b in tr.blobs}
            elif tr.state is State.OCCLUDED and t - tr.last_t <= self.p.t_occ_s:
                # Keep a confirmed identity visible through short detector
                # dropouts, anchored at its last filtered position.
                source = "held"
                xy = tr.filtered_xy or tr.xy
                bboxes = self._cached_boxes(tr, xy, t)
            else:
                continue
            result.append(Output(gid=tr.gid, xy=xy, v=tr.v,
                                 state=tr.state, source=source,
                                 bbox_by_cam=bboxes, quality=1.0))
        return sorted(result, key=lambda x: x.gid)


# A separate, explicit name avoids accidentally wiring the experimental tracker
# into the production adapter that imports engine.Core2Engine.
Core2EngineL = EngineLEngine
