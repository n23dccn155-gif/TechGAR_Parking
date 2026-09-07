"""Physical-gate watcher and HTTP API for vehicle QR sessions.

Production mode consumes the two-camera runtime snapshot and keys every
session by ``vehicles[].global_id``. A missing observation never closes a
session. The session is deleted only when that Global ID crosses the configured
physical exit line in the accepted direction.
"""

from __future__ import annotations

import argparse
import json
import math
import subprocess
import sys
import threading
import time
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any, Callable, Optional
from urllib.error import HTTPError, URLError
from urllib.parse import unquote, urlparse
from urllib.request import Request, urlopen


BASE_DIR = Path(__file__).resolve().parent
ROOT_DIR = BASE_DIR.parent
sys.path.append(str(BASE_DIR))

from session_manager import (  # noqa: E402
    InvalidSessionState,
    SessionError,
    SessionConflict,
    SessionNotFound,
    claim_session,
    create_session,
    delete_session_by_global_id,
    find_session_by_global_id,
    get_session,
    list_waiting_sessions,
    load_sessions,
    remap_global_vehicle_id,
    select_spot,
    set_exit_navigation,
    set_parked_by_global_id,
    update_global_vehicle_observation,
    apply_departure_episode,
)


LEGACY_GATE_CONFIG = ROOT_DIR / "frontend" / "public" / "gate_roi.json"
DEFAULT_GATE_CONFIG = BASE_DIR / "main_detect" / "config" / "gate_zones.json"
PARKING_STATUS_SAMPLE = ROOT_DIR / "frontend" / "public" / "parking_status_sample.json"
DEFAULT_RUNTIME_URL = "http://127.0.0.1:8001/api/runtime/snapshot"

detection_process: Optional[subprocess.Popen] = None
active_video_url: Optional[str] = None
_LATEST_RUNTIME_LOCK = threading.RLock()
_latest_runtime_snapshot: Optional[dict[str, Any]] = None
_latest_runtime_received_at: Optional[float] = None


class SelectionUnavailable(SessionError):
    def __init__(self, message: str, code: str, status: int):
        super().__init__(message)
        self.code = code
        self.status = status


def _validate_selection(session: dict, spot_id: str) -> None:
    if session.get("runtimeId") and session["runtimeId"] != _latest_runtime_id():
        raise SelectionUnavailable("Session belongs to another runtime", "RUNTIME_MISMATCH", 409)
    availability = _latest_spot_availability(spot_id)
    if availability is None:
        raise SelectionUnavailable("Runtime parking data is unavailable or stale", "RUNTIME_UNAVAILABLE", 503)
    if not availability:
        raise SelectionUnavailable(f"Parking spot is no longer available: {spot_id}", "SPOT_NOT_AVAILABLE", 409)


def _spot_is_available(snapshot: dict[str, Any], spot_id: str) -> Optional[bool]:
    slots = snapshot.get("parking_slots")
    if not isinstance(slots, list):
        return None
    for slot in slots:
        if not isinstance(slot, dict) or str(slot.get("slot_id")) != str(spot_id):
            continue
        return not bool(slot.get("occupied")) and slot.get("status") == "empty"
    return None


def _fresh_live(snapshot: dict[str, Any]) -> bool:
    if snapshot.get("source_mode") != "live":
        return False
    try:
        for camera in (snapshot.get("cameras") or {}).values():
            if not camera.get("online", False) or float(camera.get("age_ms", 0)) > 5000:
                return False
        stamp = datetime.fromisoformat(str(snapshot["published_at"]).replace("Z", "+00:00"))
        age = (datetime.now(timezone.utc) - stamp.astimezone(timezone.utc)).total_seconds()
        return -1.0 <= age <= 5.0
    except (KeyError, ValueError, TypeError):
        return False


def _parked_evidence_seconds(snapshot: dict[str, Any], global_id: int, spot_id: str) -> float:
    """Return continuous stopped time only for the same vehicle and parking spot."""
    slots = snapshot.get("parking_slots")
    if not isinstance(slots, list):
        return 0.0
    for slot in slots:
        if not isinstance(slot, dict) or str(slot.get("slot_id")) != str(spot_id):
            continue
        try:
            vehicle_id = int(slot.get("vehicle_id"))
            stopped_for_ms = float(slot.get("stopped_for_ms", 0))
        except (TypeError, ValueError):
            return 0.0
        if vehicle_id != global_id or slot.get("tracking_state") != "parked":
            return 0.0
        return max(0.0, stopped_for_ms / 1000.0)
    return 0.0


def _remember_runtime_snapshot(snapshot: dict[str, Any]) -> None:
    global _latest_runtime_snapshot, _latest_runtime_received_at
    with _LATEST_RUNTIME_LOCK:
        _latest_runtime_snapshot = snapshot
        _latest_runtime_received_at = time.monotonic()


def _latest_spot_availability(
    spot_id: str,
    *,
    max_age_seconds: float = 5.0,
) -> Optional[bool]:
    with _LATEST_RUNTIME_LOCK:
        snapshot = _latest_runtime_snapshot
        received_at = _latest_runtime_received_at
    if snapshot is None or received_at is None:
        return None
    if time.monotonic() - received_at > max(0.0, max_age_seconds):
        return None
    if not _fresh_live(snapshot):
        return None
    return _spot_is_available(snapshot, spot_id)


def _latest_runtime_id() -> Optional[str]:
    with _LATEST_RUNTIME_LOCK:
        snapshot = _latest_runtime_snapshot
    if snapshot is None:
        return None
    value = snapshot.get("runtime_id")
    return str(value) if value else None


def _point(value: Any) -> dict[str, float]:
    if not isinstance(value, dict):
        raise ValueError("Gate point must be an object with x and y")
    return {"x": float(value["x"]), "y": float(value["y"])}


def _normalize_gate(name: str, value: Any) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise ValueError(f"Missing {name}")
    direction = str(value.get("direction", "positive")).lower()
    if direction not in {"positive", "negative"}:
        raise ValueError(f"{name}.direction must be positive or negative")
    return {
        "name": str(value.get("name") or name),
        "p1": _point(value.get("p1")),
        "p2": _point(value.get("p2")),
        "direction": direction,
    }


def load_gate_config(path: Optional[Path] = None) -> dict[str, Any]:
    selected = path or (DEFAULT_GATE_CONFIG if DEFAULT_GATE_CONFIG.exists() else LEGACY_GATE_CONFIG)
    try:
        payload = json.loads(selected.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise ValueError(f"Cannot read gate config {selected}: {error}") from error
    return {
        "coordinate_space": str(payload.get("coordinate_space", "legacy_svg")),
        "unit": payload.get("unit"),
        "entry_gate": _normalize_gate("entry_gate", payload.get("entry_gate")),
        "exit_gate": _normalize_gate("exit_gate", payload.get("exit_gate")),
    }


def load_gate_roi() -> dict[str, Any]:
    """Compatibility alias used by older scripts."""
    return load_gate_config()


def check_line_intersection(p1: dict, p2: dict, p3: dict, p4: dict) -> bool:
    def orientation(a: dict, b: dict, c: dict) -> float:
        return (b["x"] - a["x"]) * (c["y"] - a["y"]) - (
            b["y"] - a["y"]
        ) * (c["x"] - a["x"])

    first = orientation(p1, p2, p3)
    second = orientation(p1, p2, p4)
    third = orientation(p3, p4, p1)
    fourth = orientation(p3, p4, p2)
    return first * second <= 0 and third * fourth <= 0


def get_crossing_direction(p_old: dict, p_new: dict, gate_p1: dict, gate_p2: dict) -> float:
    vehicle_x = p_new["x"] - p_old["x"]
    vehicle_y = p_new["y"] - p_old["y"]
    gate_x = gate_p2["x"] - gate_p1["x"]
    gate_y = gate_p2["y"] - gate_p1["y"]
    return (vehicle_x * gate_y) - (vehicle_y * gate_x)


def _crossed_in_valid_direction(old: dict, new: dict, gate: dict) -> bool:
    if not check_line_intersection(old, new, gate["p1"], gate["p2"]):
        return False
    direction = get_crossing_direction(old, new, gate["p1"], gate["p2"])
    if abs(direction) < 1e-9:
        return False
    return direction > 0 if gate["direction"] == "positive" else direction < 0


class GateSessionCoordinator:
    """Apply runtime observations to the persistent vehicle-session store."""

    def __init__(
        self,
        gate_config: dict[str, Any],
        *,
        parked_confirm_seconds: float = 2.0,
        clock: Callable[[], float] = time.monotonic,
        allow_legacy: bool = False,
    ) -> None:
        self.gate_config = {
            "coordinate_space": str(gate_config.get("coordinate_space", "world")),
            "unit": gate_config.get("unit"),
            "entry_gate": _normalize_gate("entry_gate", gate_config.get("entry_gate")),
            "exit_gate": _normalize_gate("exit_gate", gate_config.get("exit_gate")),
        }
        self.previous_positions: dict[int, dict[str, float]] = {}
        self.parked_confirm_seconds = max(0.0, float(parked_confirm_seconds))
        self._clock = clock
        self._parked_candidates: dict[int, tuple[str, float]] = {}
        self._departure_candidates: dict[int, tuple[int, int]] = {}
        self._last_observed_at: dict[int, float] = {}
        self._last_source_observed_at: dict[int, float] = {}
        self._last_frame_index: Optional[int] = None
        self.runtime_id: Optional[str] = None
        self.allow_legacy = allow_legacy
        self.identity_conflicts: set[int] = set()
        self._episode_cursors: dict[str, tuple[int, str, str]] = {}

    def _apply_alias_table(
        self, aliases: Any, runtime_id: Optional[str]
    ) -> None:
        if not isinstance(aliases, dict):
            return
        for old_value, new_value in aliases.items():
            try:
                old_id, new_id = int(old_value), int(new_value)
            except (TypeError, ValueError):
                continue
            if old_id == new_id or find_session_by_global_id(
                old_id, runtime_id=runtime_id
            ) is None:
                continue
            try:
                remap_global_vehicle_id(old_id, new_id, runtime_id=runtime_id)
            except SessionError as error:
                self.identity_conflicts.update((old_id, new_id))
                print(f"[IDENTITY CONFLICT] {error}")
                continue
            if old_id in self.previous_positions:
                self.previous_positions[new_id] = self.previous_positions.pop(old_id)
            if old_id in self._last_observed_at:
                self._last_observed_at[new_id] = self._last_observed_at.pop(old_id)
            if old_id in self._last_source_observed_at:
                self._last_source_observed_at[new_id] = self._last_source_observed_at.pop(old_id)
            candidate = self._parked_candidates.pop(old_id, None)
            if candidate is not None:
                self._parked_candidates[new_id] = candidate

    def _apply_merge_events(
        self, events: Any, runtime_id: Optional[str]
    ) -> None:
        if not isinstance(events, list):
            return
        for event in events:
            if not isinstance(event, dict) or event.get("type") != "global_id_merged":
                continue
            old_id = event.get("superseded_global_id")
            new_id = event.get("global_id")
            if old_id is None or new_id is None:
                continue
            if find_session_by_global_id(
                int(old_id), runtime_id=runtime_id
            ) is None:
                continue
            try:
                remap_global_vehicle_id(int(old_id), int(new_id), runtime_id=runtime_id)
            except SessionError as error:
                self.identity_conflicts.update((int(old_id), int(new_id)))
                print(f"[IDENTITY CONFLICT] {error}")
                continue
            if int(old_id) in self.previous_positions:
                self.previous_positions[int(new_id)] = self.previous_positions.pop(int(old_id))
            candidate = self._parked_candidates.pop(int(old_id), None)
            if candidate is not None:
                self._parked_candidates[int(new_id)] = candidate

    def process_snapshot(self, snapshot: dict[str, Any]) -> None:
        v2 = snapshot.get("schema_version") == 2
        if not self.allow_legacy and (not v2 or not _fresh_live(snapshot) or not snapshot.get("runtime_id")):
            return
        runtime_unit = (snapshot.get("coordinate_space") or {}).get("unit")
        configured_unit = self.gate_config.get("unit")
        if configured_unit and runtime_unit and configured_unit != runtime_unit:
            raise ValueError(
                f"Gate config unit {configured_unit!r} does not match runtime unit {runtime_unit!r}"
            )
        raw_runtime_id = snapshot.get("runtime_id")
        if raw_runtime_id:
            next_runtime_id = str(raw_runtime_id)
            if self.runtime_id != next_runtime_id:
                self.previous_positions.clear()
                self._parked_candidates.clear()
                self._departure_candidates.clear()
                self._last_observed_at.clear()
                self._last_source_observed_at.clear()
                self._last_frame_index = None
                self.runtime_id = next_runtime_id
                self.identity_conflicts.clear()
                self._episode_cursors.clear()
        runtime_id = self.runtime_id
        raw_frame_index = snapshot.get("frame_index")
        frame_index = (
            int(raw_frame_index)
            if isinstance(raw_frame_index, (int, float))
            else None
        )
        if (
            frame_index is not None
            and self._last_frame_index is not None
            and frame_index <= self._last_frame_index
        ):
            return
        if frame_index is not None:
            self._last_frame_index = frame_index
        _remember_runtime_snapshot(snapshot)
        self._apply_alias_table(snapshot.get("retired_global_ids"), runtime_id)
        self._apply_merge_events(snapshot.get("recent_events"), runtime_id)
        if v2:
            self._apply_parking_episodes(snapshot, runtime_id)
        vehicles = snapshot.get("vehicles", [])
        if not isinstance(vehicles, list):
            return

        seen_global_ids: set[int] = set()
        for vehicle in vehicles:
            if not isinstance(vehicle, dict) or vehicle.get("global_id") is None:
                continue
            global_id = int(vehicle["global_id"])
            if global_id in self.identity_conflicts:
                continue
            seen_global_ids.add(global_id)
            raw_position = vehicle.get("position")
            if not isinstance(raw_position, dict):
                continue
            position = _point(raw_position)
            previous = self.previous_positions.get(global_id)
            observed = bool(vehicle.get("observed", True))
            now = self._clock()
            # Source time measures observation continuity, not how quickly a
            # buffered HTTP response happened to arrive at this controller.
            source_time = vehicle.get("last_seen_time")
            source_time = (float(source_time) if isinstance(source_time, (int, float))
                           and math.isfinite(source_time) else None)
            previous_source_time = self._last_source_observed_at.get(global_id)
            if observed and source_time is not None and previous_source_time is not None:
                if source_time <= previous_source_time:
                    continue  # A newer snapshot can still contain old vehicle evidence.
            source_is_continuous = (source_time is None or
                                    (previous_source_time is not None and
                                     0 < source_time - previous_source_time <= 1.0))
            previous_observed_at = self._last_observed_at.get(global_id)
            observation_is_continuous = (
                observed
                and previous is not None
                and previous_observed_at is not None
                and now - previous_observed_at <= 1.0
                and source_is_continuous
            )
            session = find_session_by_global_id(
                global_id, runtime_id=runtime_id
            )

            if observation_is_continuous and _crossed_in_valid_direction(
                previous, position, self.gate_config["entry_gate"]
            ):
                if session is None:
                    session_id = create_session(
                        global_vehicle_id=global_id,
                        runtime_id=runtime_id,
                    )
                    session = get_session(session_id)
                    print(f"[ENTRY] Global ID #{global_id} -> session {session_id}")

            if observation_is_continuous and session is not None and _crossed_in_valid_direction(
                previous, position, self.gate_config["exit_gate"]
            ):
                deleted = delete_session_by_global_id(
                    global_id, runtime_id=runtime_id
                )
                self.previous_positions.pop(global_id, None)
                self._parked_candidates.pop(global_id, None)
                self._departure_candidates.pop(global_id, None)
                self._last_observed_at.pop(global_id, None)
                self._last_source_observed_at.pop(global_id, None)
                print(f"[EXIT] Global ID #{global_id} -> deleted session {deleted['sessionId']}")
                continue

            if observed:
                self.previous_positions[global_id] = position
                self._last_observed_at[global_id] = now
                if source_time is not None:
                    self._last_source_observed_at[global_id] = source_time
                else:
                    self._last_source_observed_at.pop(global_id, None)
            session = find_session_by_global_id(
                global_id, runtime_id=runtime_id
            )
            if session is None:
                self._parked_candidates.pop(global_id, None)
                continue

            if observed:
                update_global_vehicle_observation(
                    global_id, position, runtime_id=runtime_id, persist=not v2
                )

            if v2:
                continue  # Slot ownership comes only from authoritative episodes.

            parked_slot_id = vehicle.get("parked_slot_id")
            if session.get("state") == "EXIT_NAVIGATION":
                self._parked_candidates.pop(global_id, None)
                self._departure_candidates.pop(global_id, None)
                continue

            if parked_slot_id:
                parked_slot_id = str(parked_slot_id)
                if (
                    session.get("state") == "PARKED"
                    and session.get("parkedSpotId") == parked_slot_id
                ):
                    self._parked_candidates.pop(global_id, None)
                    continue

                candidate = self._parked_candidates.get(global_id)
                if candidate is None or candidate[0] != parked_slot_id:
                    evidence_seconds = min(
                        self.parked_confirm_seconds,
                        _parked_evidence_seconds(snapshot, global_id, parked_slot_id),
                    )
                    candidate = (parked_slot_id, now - evidence_seconds)
                    self._parked_candidates[global_id] = candidate
                if now - candidate[1] < self.parked_confirm_seconds:
                    continue

                if (
                    session.get("state") != "PARKED"
                    or session.get("parkedSpotId") != parked_slot_id
                ):
                    set_parked_by_global_id(
                        global_id,
                        parked_slot_id,
                        runtime_id=runtime_id,
                    )
                self._parked_candidates.pop(global_id, None)
                self._departure_candidates.pop(global_id, None)
                continue

            self._parked_candidates.pop(global_id, None)
            if session.get("state") == "PARKED" and observed:
                movement = (
                    float(math.hypot(
                        position["x"] - previous["x"],
                        position["y"] - previous["y"],
                    ))
                    if previous is not None
                    else 0.0
                )
                count, last_frame = self._departure_candidates.get(
                    global_id, (0, -2)
                )
                next_count = count + 1 if observation_is_continuous else 1
                if str(vehicle.get("state", "active")) == "active" and movement >= 0.25:
                    self._departure_candidates[global_id] = (
                        next_count,
                        frame_index if frame_index is not None else last_frame + 1,
                    )
                    if next_count >= 2:
                        set_exit_navigation(str(session["sessionId"]))
                        self._departure_candidates.pop(global_id, None)
                else:
                    self._departure_candidates.pop(global_id, None)

        for global_id in set(self._parked_candidates) - seen_global_ids:
            self._parked_candidates.pop(global_id, None)
        for global_id in set(self._departure_candidates) - seen_global_ids:
            self._departure_candidates.pop(global_id, None)

    def _apply_parking_episodes(self, snapshot: dict, runtime_id: Optional[str]) -> None:
        latest: dict[int, dict] = {}
        owners: dict[int, set[str]] = {}
        slot_owners: dict[str, set[int]] = {}
        for episode in snapshot.get("parking_episodes", []):
            if not isinstance(episode, dict):
                continue
            try:
                gid = int(episode["global_id"])
                applied = int(episode["applied_frame_idx"])
                evidence = int(episode["evidence_frame_idx"])
                if not (0 <= evidence <= applied <= int(snapshot["frame_index"])):
                    continue
                if not episode.get("parking_episode_id") or not episode.get("slot_id"):
                    continue
            except (KeyError, TypeError, ValueError):
                continue
            if episode.get("state") == "parked":
                owners.setdefault(gid, set()).add(str(episode["slot_id"]))
                slot_owners.setdefault(str(episode["slot_id"]), set()).add(gid)
            if gid not in latest or applied >= int(latest[gid]["applied_frame_idx"]):
                latest[gid] = episode
        for gid, episode in latest.items():
            if (gid in self.identity_conflicts or len(owners.get(gid, set())) > 1
                    or len(slot_owners.get(str(episode["slot_id"]), set())) > 1):
                continue
            session = find_session_by_global_id(gid, runtime_id=runtime_id)
            if session is None:
                continue
            cursor = (int(episode["applied_frame_idx"]), str(episode["parking_episode_id"]), str(episode["state"]))
            previous = self._episode_cursors.get(session["sessionId"])
            if previous is not None and cursor[0] <= previous[0]:
                continue
            try:
                if episode["state"] == "parked" and session["state"] != "EXIT_NAVIGATION":
                    set_parked_by_global_id(gid, str(episode["slot_id"]), runtime_id=runtime_id,
                                            parking_episode_id=str(episode["parking_episode_id"]))
                elif episode["state"] in {"departing", "released"}:
                    apply_departure_episode(session["sessionId"], str(episode["parking_episode_id"]))
                else:
                    continue
                self._episode_cursors[session["sessionId"]] = cursor
            except SessionError as error:
                print(f"[SESSION WAIT] {error}")


def _runtime_snapshot(url: str) -> dict[str, Any]:
    request = Request(url, headers={"Accept": "application/json"})
    with urlopen(request, timeout=3.0) as response:
        payload = json.loads(response.read().decode("utf-8"))
    if not isinstance(payload, dict):
        raise ValueError("Runtime snapshot must be a JSON object")
    return payload


def _sample_snapshot(path: Path) -> dict[str, Any]:
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {"vehicles": [], "recent_events": []}
    vehicles = []
    for raw_id, raw_vehicle in payload.get("active_vehicles", {}).items():
        if not isinstance(raw_vehicle, dict):
            continue
        status = str(raw_vehicle.get("status", "active"))
        parked_slot_id = raw_vehicle.get("parked_spot_id") if status == "parked" else None
        vehicles.append(
            {
                "global_id": int(raw_id),
                "position": raw_vehicle.get("position", {"x": 0, "y": 0}),
                "parked_slot_id": parked_slot_id,
                "observed": status != "parked",
                "state": "parked" if status == "parked" else "active",
            }
        )
    return {"vehicles": vehicles, "recent_events": []}


def start_detection_process(video_source: str) -> None:
    global detection_process, active_video_url
    stop_detection_process()
    active_video_url = video_source
    script = BASE_DIR / "main_detect" / "main.py"
    detection_process = subprocess.Popen(
        [sys.executable, str(script), "--video", video_source, "--loop", "--no-display"]
    )


def stop_detection_process() -> None:
    global detection_process
    if detection_process is not None and detection_process.poll() is None:
        detection_process.terminate()
        try:
            detection_process.wait(timeout=2)
        except subprocess.TimeoutExpired:
            detection_process.kill()
    detection_process = None


class SessionAPIRequestHandler(BaseHTTPRequestHandler):
    def _cors(self) -> None:
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def _json(self, data: Any, status: int = 200) -> None:
        encoded = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(encoded)))
        self._cors()
        self.end_headers()
        try:
            self.wfile.write(encoded)
        except (BrokenPipeError, ConnectionAbortedError, ConnectionResetError):
            pass

    def do_OPTIONS(self) -> None:
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_GET(self) -> None:
        path = urlparse(self.path).path
        if path == "/api/sessions/waiting":
            self._json(
                list_waiting_sessions(runtime_id=_latest_runtime_id())
            )
            return
        if path in {"/api/sessions", "/navigation_sessions"}:
            self._json(load_sessions())
            return
        if path.startswith("/api/session/"):
            session_id = unquote(path.rsplit("/", 1)[-1])
            try:
                self._json(get_session(session_id))
            except SessionNotFound as error:
                self._json({"error": str(error), "code": "SESSION_NOT_FOUND"}, 404)
            return
        if path == "/api/detection/status":
            running = detection_process is not None and detection_process.poll() is None
            self._json({"running": running, "videoUrl": active_video_url})
            return
        self._json({"error": "Route not found"}, 404)

    def do_POST(self) -> None:
        length = int(self.headers.get("Content-Length", 0))
        try:
            payload = json.loads(self.rfile.read(length).decode("utf-8")) if length else {}
        except json.JSONDecodeError:
            self._json({"error": "Invalid JSON"}, 400)
            return
        path = urlparse(self.path).path
        try:
            if not isinstance(payload, dict):
                raise ValueError("Payload must be an object")
            options = {
                "expected_revision": payload.get("expected_revision", payload.get("expectedRevision")),
                "action_id": payload.get("action_id", payload.get("actionId")),
            }
            if options["expected_revision"] is not None:
                options["expected_revision"] = int(options["expected_revision"])
            if path == "/api/session/claim":
                session = claim_session(str(payload.get("sessionId") or ""), **options)
                self._json(session)
            elif path == "/api/session/select":
                spot_id = payload.get("spotId")
                session = select_spot(
                    str(payload.get("sessionId") or ""), spot_id,
                    validate_selection=_validate_selection, **options
                )
                self._json(session)
            elif path == "/api/session/exit":
                session = set_exit_navigation(str(payload.get("sessionId") or ""), **options)
                self._json(session)
            elif path == "/api/detection/start":
                video_url = str(payload.get("videoUrl") or "")
                if not video_url:
                    raise ValueError("videoUrl is required")
                start_detection_process(video_url)
                self._json({"ok": True, "running": True, "videoUrl": video_url})
            elif path == "/api/detection/stop":
                stop_detection_process()
                self._json({"ok": True, "running": False})
            else:
                self._json({"error": "Route not found"}, 404)
        except SessionNotFound as error:
            self._json({"error": str(error), "code": "SESSION_NOT_FOUND"}, 404)
        except SelectionUnavailable as error:
            self._json({"error": str(error), "code": error.code}, error.status)
        except SessionConflict as error:
            self._json({"error": str(error), "code": "REVISION_CONFLICT", "session": error.current}, 409)
        except InvalidSessionState as error:
            self._json({"error": str(error), "code": "INVALID_SESSION_STATE"}, 409)
        except (SessionError, ValueError) as error:
            self._json({"error": str(error)}, 400)

    def log_message(self, format: str, *args) -> None:
        message = format % args
        if "/api/session/" not in message and "/api/sessions/waiting" not in message:
            super().log_message(format, *args)


def start_api_server(port: int = 8000) -> None:
    server = ThreadingHTTPServer(("0.0.0.0", port), SessionAPIRequestHandler)
    print(f"[SESSION API] http://0.0.0.0:{port}")
    server.serve_forever()


def parser() -> argparse.ArgumentParser:
    result = argparse.ArgumentParser(description="TechGAR Global-ID gate session controller")
    result.add_argument(
        "--source",
        default=None,
        help="Legacy file in frontend/public. Omit to consume the runtime API.",
    )
    result.add_argument("--runtime-url", default=DEFAULT_RUNTIME_URL)
    result.add_argument("--gate-config", type=Path, default=None)
    result.add_argument("--port", type=int, default=8000)
    result.add_argument("--poll-interval", type=float, default=0.25)
    result.add_argument("--parked-confirm-seconds", type=float, default=2.0)
    return result


def main() -> None:
    args = parser().parse_args()
    gate_config = load_gate_config(args.gate_config)
    if args.source is None and gate_config["coordinate_space"] != "world":
        raise SystemExit(
            "Runtime mode requires backend/main_detect/config/gate_zones.json in world "
            "coordinates. Start runtime_server.py and configure ENTRY/EXIT on "
            "the frontend shared map at /monitor first."
        )
    coordinator = GateSessionCoordinator(
        gate_config,
        parked_confirm_seconds=args.parked_confirm_seconds,
        allow_legacy=args.source is not None,
    )
    api_thread = threading.Thread(target=start_api_server, args=(args.port,), daemon=True)
    api_thread.start()
    source_path = ROOT_DIR / "frontend" / "public" / args.source if args.source else None
    print(
        f"[GATE] {'file ' + str(source_path) if source_path else 'runtime ' + args.runtime_url}"
    )

    try:
        while True:
            try:
                snapshot = (
                    _sample_snapshot(source_path)
                    if source_path is not None
                    else _runtime_snapshot(args.runtime_url)
                )
                coordinator.process_snapshot(snapshot)
            except (HTTPError, URLError, TimeoutError, ValueError, SessionError) as error:
                print(f"[GATE] Source unavailable: {error}")
                time.sleep(max(args.poll_interval, 1.0))
                continue
            time.sleep(args.poll_interval)
    except KeyboardInterrupt:
        print("Stopped Gate Session Controller.")


if __name__ == "__main__":
    main()
