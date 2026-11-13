"""Event-driven parking sampling; advisory only, never changes slot evidence.

All clocks in this scheduler are monotonic wall seconds. The parking detector
continues to see a complete camera frame and owns all occupancy decisions.
"""

from __future__ import annotations

from dataclasses import dataclass
import math
from typing import Mapping


@dataclass(frozen=True)
class _LocalObservation:
    x: float
    y: float
    time_s: float
    stopped: bool | None
    near: frozenset[str]


class ParkingEventScheduler:
    """Coalesce local-track/binder events and sample both cameras at idle rate."""

    BINDER_TYPES = frozenset({
        "vehicle_stopped_in_slot", "vehicle_left_slot", "tracking_occupied_override",
    })

    def __init__(self, detectors: Mapping, *, idle_period_s: float = 5.0,
                 debounce_s: float = 0.4, started_at_s: float = 0.0):
        if not math.isfinite(idle_period_s) or idle_period_s <= 0:
            raise ValueError("--parking-idle-period must be positive and finite")
        self.idle_period_s = float(idle_period_s)
        self.debounce_s = max(0.0, float(debounce_s))
        self.started_at_s = float(started_at_s)
        self.cameras = tuple(detectors)
        self._slots = {}
        for camera, detector in detectors.items():
            w = max(1.0, float(detector._img_w_ref))
            h = max(1.0, float(detector._img_h_ref))
            rectangles = {}
            for slot in detector._slot_polygons:
                points = slot["_polygon"]
                xy = [(float(p["x"]), float(p["y"])) if isinstance(p, dict)
                      else (float(p[0]), float(p[1])) for p in points]
                rectangles[str(slot["id"])] = (
                    min(x for x, _ in xy) / w, min(y for _, y in xy) / h,
                    max(x for x, _ in xy) / w, max(y for _, y in xy) / h,
                )
            self._slots[camera] = rectangles
        self._tracks: dict[str, dict[int, _LocalObservation]] = {
            c: {} for c in self.cameras
        }
        self._last_sent: dict[tuple[str, str, str], float] = {}
        self._binder_cursor: dict[str, dict | None] = {c: None for c in self.cameras}
        self._dirty: dict[str, float | None] = {c: None for c in self.cameras}
        self._inflight: dict[str, float | None] = {c: None for c in self.cameras}
        self._last_scan: dict[str, float | None] = {c: None for c in self.cameras}
        self.jobs = 0
        self.trigger_count = 0
        self._latencies: list[float] = []

    def near_slots(self, camera: str, x: float, y: float, shape) -> frozenset[str]:
        height, width = shape[:2]
        if width <= 0 or height <= 0:
            return frozenset()
        px, py = x / width, y / height
        result = set()
        for slot_id, (x1, y1, x2, y2) in self._slots[camera].items():
            # Radius ~half a parking space, so entering/leaving is noticed
            # before a track's ground point is inside the slot polygon.
            pad_x = max(18.0 / width, (x2 - x1) * 0.5)
            pad_y = max(18.0 / height, (y2 - y1) * 0.5)
            if x1 - pad_x <= px <= x2 + pad_x and y1 - pad_y <= py <= y2 + pad_y:
                result.add(slot_id)
        return frozenset(result)

    def mark_dirty(self, camera: str, slot_id: str, cause: str,
                   now_s: float) -> bool:
        key = (camera, str(slot_id), cause)
        previous = self._last_sent.get(key, float("-inf"))
        if now_s - previous < self.debounce_s:
            return False
        self._last_sent[key] = now_s
        self.trigger_count += 1
        existing = self._dirty[camera]
        self._dirty[camera] = now_s if existing is None else min(existing, now_s)
        return True

    def observe_tracks(self, camera: str, tracks: Mapping, shape,
                       now_s: float) -> None:
        """Observe ALL measured local IDs, including tentative and unbound IDs."""
        previous = self._tracks[camera]
        current: dict[int, _LocalObservation] = {}
        for local_id, track in tracks.items():
            if getattr(track, "consecutive_invisible_count", 0) != 0:
                continue  # predicted/held positions are not new measurements
            x, y = float(track.cx), float(track.cy)
            near = self.near_slots(camera, x, y, shape)
            old = previous.get(local_id)
            stopped = None
            if old is not None:
                elapsed = max(1e-3, now_s - old.time_s)
                speed = math.hypot(x - old.x, y - old.y) / elapsed
                extent = max(20.0, float(max(track.bbox[2], track.bbox[3])))
                # Image-relative speed threshold: keeps small stationary jitter
                # from generating a stop/start event on every detection.
                stopped = speed < 0.22 * extent
                if old.stopped is not None and old.stopped != stopped:
                    for slot_id in near | old.near:
                        self.mark_dirty(camera, slot_id, "motion_transition", now_s)
                for slot_id in near ^ old.near:
                    self.mark_dirty(camera, slot_id, "proximity_transition", now_s)
            else:
                for slot_id in near:
                    self.mark_dirty(camera, slot_id, "track_appeared", now_s)
            current[local_id] = _LocalObservation(x, y, now_s, stopped, near)
        for local_id, old in previous.items():
            if local_id not in current:
                for slot_id in old.near:
                    self.mark_dirty(camera, slot_id, "track_disappeared", now_s)
        self._tracks[camera] = current

    def observe_binder(self, camera: str, events: list[dict], now_s: float) -> None:
        """Consume binder's bounded event buffer without repeating older events."""
        last = self._binder_cursor[camera]
        start = 0
        if last is not None:
            start = next((i + 1 for i in range(len(events) - 1, -1, -1)
                          if events[i] is last), 0)
        for event in events[start:]:
            if event.get("type") in self.BINDER_TYPES and event.get("slot_id"):
                self.mark_dirty(camera, str(event["slot_id"]),
                                event["type"], now_s)
        if events:
            self._binder_cursor[camera] = events[-1]

    def next_camera(self, now_s: float) -> str | None:
        # Startup is mandatory for both cameras, even if no local track exists.
        startup = [c for c in self.cameras if self._last_scan[c] is None]
        if startup:
            return startup[0]
        # A storm of events in one camera must not starve the other camera's
        # mandatory background scan.
        idle = [c for c in self.cameras
                if now_s - self._last_scan[c] >= self.idle_period_s]
        if idle:
            return min(idle, key=lambda c: self._last_scan[c])
        dirty = [c for c in self.cameras if self._dirty[c] is not None]
        if dirty:
            return min(dirty, key=lambda c: (self._dirty[c], self._last_scan[c]))
        return None

    def submitted(self, camera: str, now_s: float) -> None:
        self.jobs += 1
        self._last_scan[camera] = now_s
        self._inflight[camera] = self._dirty[camera]
        self._dirty[camera] = None

    def completed(self, camera: str, now_s: float, *, accepted: bool) -> None:
        triggered = self._inflight[camera]
        self._inflight[camera] = None
        if triggered is None:
            return
        if accepted:
            self._latencies.append(max(0.0, now_s - triggered))
        else:
            prior = self._dirty[camera]
            self._dirty[camera] = triggered if prior is None else min(prior, triggered)

    def summary(self, now_s: float) -> str:
        samples = sorted(self._latencies)

        def quantile(fraction: float) -> str:
            if not samples:
                return "n/a"
            position = fraction * (len(samples) - 1)
            low = int(position)
            high = min(low + 1, len(samples) - 1)
            value = samples[low] + (samples[high] - samples[low]) * (position - low)
            return f"{value * 1000.0:.1f}ms"

        minutes = max((now_s - self.started_at_s) / 60.0, 1e-6)
        return (f"[P38_PARKING_EVENT] jobs={self.jobs} "
                f"jobs_per_min={self.jobs / minutes:.2f} events={self.trigger_count} "
                f"event_to_result_p50={quantile(.5)} "
                f"p95={quantile(.95)} max={quantile(1.0)} "
                f"accepted_event_jobs={len(samples)}")
