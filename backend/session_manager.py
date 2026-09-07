"""Vehicle-session lifecycle for the QR navigation flow.

A session belongs to one canonical Global ID. Local tracker IDs are optional
diagnostics only. The active session is deleted only after the gate controller
confirms that the vehicle crossed the physical exit gate in the valid direction.
"""

from __future__ import annotations

import argparse
import json
import os
import secrets
import tempfile
import threading
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional


SCRIPT_DIR = Path(__file__).resolve().parent
ROOT_DIR = SCRIPT_DIR.parent
SESSIONS_FILE = Path(
    os.environ.get(
        "TECHGAR_SESSIONS_FILE",
        ROOT_DIR / "backend" / "data" / "navigation_sessions.json",
    )
)
POSITIONS_FILE = ROOT_DIR / "backend" / "detect_car_update" / "vehicle_positions.json"
STATUS_FILE = ROOT_DIR / "frontend" / "public" / "parking_status.json"
WATCH_INTERVAL = 2.0
QR_DISPLAY_SECONDS = 10.0

_STORE_LOCK = threading.RLock()
_LIVE_OBSERVATIONS: dict[tuple[str, str], tuple[tuple, dict]] = {}


def _observation_key(session: dict) -> tuple[str, str]:
    return str(SESSIONS_FILE.resolve()), str(session["sessionId"])


def _with_live_observation(session: dict) -> dict:
    result = dict(session)
    cached = _LIVE_OBSERVATIONS.get(_observation_key(session))
    identity = (session.get("runtimeId"), session.get("globalVehicleId"), session.get("createdAt"))
    if cached is not None and cached[0] == identity:
        result["lastKnownPosition"] = dict(cached[1])
    return result


class SessionError(RuntimeError):
    """Base error for a vehicle-session operation."""


class SessionNotFound(SessionError):
    """Raised when a session no longer exists (normally after gate exit)."""


class InvalidSessionState(SessionError):
    """Raised when an action is not valid for the current lifecycle state."""


class SessionConflict(SessionError):
    def __init__(self, message: str, current: Optional[dict] = None):
        super().__init__(message)
        self.current = current


def now_iso() -> str:
    return datetime.now(timezone.utc).astimezone().isoformat(timespec="milliseconds")


def _parse_iso(value: object) -> Optional[datetime]:
    if not isinstance(value, str):
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    return parsed if parsed.tzinfo is not None else parsed.replace(tzinfo=timezone.utc)


def _qr_expires_at(session: dict) -> Optional[datetime]:
    explicit_expiry = _parse_iso(session.get("qrExpiresAt"))
    if explicit_expiry is not None:
        return explicit_expiry
    created_at = _parse_iso(session.get("createdAt"))
    if created_at is None:
        return None
    return created_at + timedelta(seconds=QR_DISPLAY_SECONDS)


def atomic_write(path: Path, data: dict) -> None:
    """Write JSON via an adjacent temporary file and an atomic replace."""
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary: Optional[Path] = None
    try:
        with tempfile.NamedTemporaryFile(
            "w",
            encoding="utf-8",
            dir=path.parent,
            prefix=f".{path.name}.",
            suffix=".tmp",
            delete=False,
        ) as handle:
            json.dump(data, handle, ensure_ascii=False, indent=2)
            handle.write("\n")
            handle.flush()
            os.fsync(handle.fileno())
            temporary = Path(handle.name)
        os.replace(temporary, path)
    finally:
        if temporary is not None and temporary.exists():
            temporary.unlink(missing_ok=True)


def load_json(path: Path) -> dict:
    if not path.exists():
        return {}
    try:
        with path.open(encoding="utf-8") as handle:
            value = json.load(handle)
    except (json.JSONDecodeError, OSError):
        return {}
    return value if isinstance(value, dict) else {}


def _normalize_session(session_id: str, value: dict) -> dict:
    session = dict(value)
    session["sessionId"] = str(session.get("sessionId") or session_id)
    if session.get("globalVehicleId") is None:
        legacy_id = session.get("vehicleTrackId")
        if legacy_id is not None:
            session["globalVehicleId"] = int(legacy_id)
    session.setdefault("vehicleTrackId", session.get("activeTrackId"))
    session.setdefault("activeTrackId", None)
    session.setdefault("runtimeId", None)
    session.setdefault("targetSpotId", None)
    session.setdefault("parkedSpotId", None)
    session.setdefault("parkingEpisodeId", None)
    session.setdefault("actualParkedSpotId", session.get("parkedSpotId") if session.get("state") == "PARKED" else None)
    session.setdefault("claimed", False)
    session.setdefault("lastKnownPosition", None)
    session.setdefault("claimedAt", None)
    session.setdefault("spotSelectedAt", None)
    session.setdefault("parkedAt", None)
    session.setdefault("exitStartedAt", None)
    qr_expiry = _qr_expires_at(session)
    session.setdefault(
        "qrExpiresAt",
        qr_expiry.isoformat(timespec="milliseconds") if qr_expiry is not None else None,
    )
    session.setdefault("revision", 0)
    session.setdefault("updatedAt", session.get("createdAt") or now_iso())
    return session


def load_sessions() -> dict[str, dict]:
    with _STORE_LOCK:
        raw = load_json(SESSIONS_FILE)
        return {
            str(session_id): _normalize_session(str(session_id), value)
            for session_id, value in raw.items()
            if isinstance(value, dict)
        }


def save_sessions(sessions: dict[str, dict]) -> None:
    with _STORE_LOCK:
        atomic_write(SESSIONS_FILE, sessions)


def get_session(session_id: str) -> dict:
    with _STORE_LOCK:
        session = load_sessions().get(str(session_id))
        if session is None:
            raise SessionNotFound(f"Session not found: {session_id}")
        return _with_live_observation(session)


def _matches_runtime(session: dict, runtime_id: Optional[str]) -> bool:
    return runtime_id is None or session.get("runtimeId") == str(runtime_id)


def find_session_by_global_id(
    global_vehicle_id: int,
    *,
    runtime_id: Optional[str] = None,
) -> Optional[dict]:
    target = int(global_vehicle_id)
    for session in load_sessions().values():
        if session.get("state") == "CLOSED":
            continue
        if (
            session.get("globalVehicleId") == target
            and _matches_runtime(session, runtime_id)
        ):
            return session
    return None


def list_waiting_sessions(
    *,
    now: Optional[datetime] = None,
    runtime_id: Optional[str] = None,
) -> list[dict]:
    current_time = now or datetime.now(timezone.utc).astimezone()
    waiting = [
        session
        for session in load_sessions().values()
        if (
            session.get("state") == "WAITING_FOR_SCAN"
            and not session.get("claimed")
            and _matches_runtime(session, runtime_id)
            and (expiry := _qr_expires_at(session)) is not None
            and current_time < expiry
        )
    ]
    return sorted(waiting, key=lambda session: str(session.get("createdAt") or ""))


def create_session(
    track_id: Optional[int] = None,
    *,
    global_vehicle_id: Optional[int] = None,
    active_track_id: Optional[int] = None,
    session_id: Optional[str] = None,
    runtime_id: Optional[str] = None,
) -> str:
    """Create one opaque QR session for a canonical Global ID.

    ``track_id`` remains as a compatibility input for the deterministic sample
    feed. The runtime integration always passes ``global_vehicle_id``.
    """
    resolved_global_id = global_vehicle_id if global_vehicle_id is not None else track_id
    if resolved_global_id is None:
        raise ValueError("global_vehicle_id is required")
    resolved_global_id = int(resolved_global_id)

    with _STORE_LOCK:
        sessions = load_sessions()
        for existing in sessions.values():
            if (
                existing.get("state") != "CLOSED"
                and existing.get("globalVehicleId") == resolved_global_id
                and _matches_runtime(existing, runtime_id)
            ):
                return str(existing["sessionId"])

        sid = str(session_id or secrets.token_urlsafe(12))
        if sid in sessions:
            raise SessionError(f"Session ID already exists: {sid}")
        local_track_id = active_track_id if active_track_id is not None else track_id
        created_at = datetime.now(timezone.utc).astimezone()
        created_iso = created_at.isoformat(timespec="milliseconds")
        sessions[sid] = {
            "sessionId": sid,
            "state": "WAITING_FOR_SCAN",
            "targetSpotId": None,
            "parkedSpotId": None,
            "globalVehicleId": resolved_global_id,
            "runtimeId": str(runtime_id) if runtime_id is not None else None,
            "vehicleTrackId": local_track_id,
            "activeTrackId": local_track_id,
            "claimed": False,
            "lastKnownPosition": None,
            "createdAt": created_iso,
            "updatedAt": created_iso,
            "qrExpiresAt": (created_at + timedelta(seconds=QR_DISPLAY_SECONDS)).isoformat(
                timespec="milliseconds"
            ),
            "claimedAt": None,
            "spotSelectedAt": None,
            "parkedAt": None,
            "exitStartedAt": None,
            "revision": 1,
        }
        save_sessions(sessions)
    print(f"[SESSION] Created {sid} for Global ID #{resolved_global_id}")
    return sid


def _mutate_session(session_id: str, mutate, *, expected_revision=None,
                    action_id=None, action_signature=None) -> dict:
    with _STORE_LOCK:
        sessions = load_sessions()
        session = sessions.get(str(session_id))
        if session is None:
            raise SessionNotFound(f"Session not found: {session_id}")
        receipts = dict(session.get("actionReceipts") or {})
        if action_id and str(action_id) in receipts:
            if receipts[str(action_id)] != action_signature:
                raise SessionConflict("Action ID was reused for a different action", dict(session))
            return dict(session)
        if expected_revision is not None and int(expected_revision) != int(session.get("revision", 0)):
            raise SessionConflict("Session changed; refresh before retrying", dict(session))
        before = dict(session)
        mutate(session)
        if action_id:
            receipts[str(action_id)] = action_signature
            session["actionReceipts"] = dict(list(receipts.items())[-32:])
        after = dict(session)
        changed = any(
            before.get(key) != after.get(key)
            for key in set(before) | set(after)
            if key not in {"updatedAt", "revision"}
        )
        if changed:
            session["revision"] = int(before.get("revision") or 0) + 1
            session["updatedAt"] = now_iso()
        else:
            session["revision"] = int(before.get("revision") or 0)
            session.setdefault("updatedAt", before.get("updatedAt") or now_iso())
        if changed:
            # Persist the latest position at a real session transition, not
            # every camera observation. Runtime snapshots own live markers.
            session["lastKnownPosition"] = _with_live_observation(session).get("lastKnownPosition")
            save_sessions(sessions)
        return dict(session)


def claim_session(session_id: str, **options) -> dict:
    def mutate(session: dict) -> None:
        if session.get("state") == "WAITING_FOR_SCAN":
            session["state"] = "SELECTING_SPOT"
            session["claimed"] = True
            session["claimedAt"] = session.get("claimedAt") or now_iso()
            return
        if session.get("claimed"):
            return
        raise InvalidSessionState(
            f"Cannot claim session in state {session.get('state')}"
        )

    return _mutate_session(session_id, mutate, action_signature="claim", **options)


def select_spot(session_id: str, spot_id: Optional[str], *, validate_selection=None, **options) -> dict:
    def mutate(session: dict) -> None:
        if session.get("state") not in {"SELECTING_SPOT", "NAVIGATING_TO_SPOT", "PARKED", "RELOCATING", "EXIT_NAVIGATION"}:
            raise InvalidSessionState(
                f"Cannot select a spot in state {session.get('state')}"
            )
        if spot_id:
            if validate_selection is not None:
                validate_selection(session, str(spot_id))
            session["state"] = "RELOCATING" if session.get("actualParkedSpotId") else "NAVIGATING_TO_SPOT"
            session["targetSpotId"] = str(spot_id)
            session["claimed"] = True
            session["claimedAt"] = session.get("claimedAt") or now_iso()
            session["spotSelectedAt"] = now_iso()
        else:
            session["state"] = "PARKED" if session.get("actualParkedSpotId") else "SELECTING_SPOT"
            session["targetSpotId"] = None

    return _mutate_session(session_id, mutate, action_signature=f"select:{spot_id}", **options)


def set_parked(session_id: str, parked_spot: str, *, parking_episode_id=None, **options) -> dict:
    def mutate(session: dict) -> None:
        current_state = session.get("state")
        if parking_episode_id and session.get("parkingEpisodeId") == parking_episode_id:
            # False-empty rollback can restore physical occupancy, but must
            # never cancel a driver's explicit relocation/exit intent.
            session["actualParkedSpotId"] = str(parked_spot)
            if current_state == "SELECTING_SPOT":
                session["state"] = "PARKED"
            return
        if current_state == "EXIT_NAVIGATION":
            raise InvalidSessionState(
                "Cannot park session while exiting the facility"
            )
        current_spot = session.get("parkedSpotId")
        if current_state == "PARKED" and current_spot == str(parked_spot):
            return
        previous_parked_at = _parse_iso(session.get("parkedAt"))
        session["state"] = "PARKED"
        session["parkedSpotId"] = str(parked_spot)
        session["actualParkedSpotId"] = str(parked_spot)
        session["parkingEpisodeId"] = parking_episode_id
        session["targetSpotId"] = None
        session["activeTrackId"] = None
        if previous_parked_at is None or current_state != "PARKED" or current_spot != str(parked_spot):
            session["parkedAt"] = now_iso()

    return _mutate_session(session_id, mutate, **options)


def set_parked_by_global_id(
    global_vehicle_id: int,
    parked_spot: str,
    *,
    runtime_id: Optional[str] = None,
    parking_episode_id: Optional[str] = None,
) -> dict:
    session = find_session_by_global_id(
        global_vehicle_id, runtime_id=runtime_id
    )
    if session is None:
        raise SessionNotFound(f"No active session for Global ID {global_vehicle_id}")
    return set_parked(str(session["sessionId"]), parked_spot,
                      parking_episode_id=parking_episode_id,
                      expected_revision=session["revision"])


def apply_departure_episode(session_id: str, episode_id: str) -> dict:
    def mutate(session):
        if session.get("parkingEpisodeId") != episode_id:
            return
        session["actualParkedSpotId"] = None
        if session.get("state") == "PARKED":
            session["state"] = "SELECTING_SPOT"
    return _mutate_session(session_id, mutate)


def set_exit_navigation(
    session_id: str,
    new_track_id: Optional[int] = None,
    **options,
) -> dict:
    def mutate(session: dict) -> None:
        if session.get("state") not in {"PARKED", "EXIT_NAVIGATION", "SELECTING_SPOT", "NAVIGATING_TO_SPOT", "RELOCATING"}:
            raise InvalidSessionState(
                f"Cannot start exit navigation in state {session.get('state')}"
            )
        if session.get("state") == "EXIT_NAVIGATION":
            if new_track_id is not None:
                session["activeTrackId"] = int(new_track_id)
            return
        session["state"] = "EXIT_NAVIGATION"
        session["targetSpotId"] = None
        session["activeTrackId"] = new_track_id
        session["exitStartedAt"] = now_iso()

    return _mutate_session(session_id, mutate, action_signature="exit", **options)


def update_global_vehicle_observation(
    global_vehicle_id: int,
    position: dict,
    *,
    active_track_id: Optional[int] = None,
    runtime_id: Optional[str] = None,
    persist: bool = True,
) -> Optional[dict]:
    session = find_session_by_global_id(
        global_vehicle_id, runtime_id=runtime_id
    )
    if session is None:
        return None

    if not persist:
        with _STORE_LOCK:
            key = _observation_key(session)
            identity = (session.get("runtimeId"), session.get("globalVehicleId"), session.get("createdAt"))
            _LIVE_OBSERVATIONS[key] = (identity, {"x": position.get("x"), "y": position.get("y")})
            while len(_LIVE_OBSERVATIONS) > 1024:
                _LIVE_OBSERVATIONS.pop(next(iter(_LIVE_OBSERVATIONS)))
            return _with_live_observation(session)

    def mutate(current: dict) -> None:
        current["lastKnownPosition"] = {
            "x": position.get("x"),
            "y": position.get("y"),
        }
        if active_track_id is not None:
            current["activeTrackId"] = int(active_track_id)

    return _mutate_session(str(session["sessionId"]), mutate)


def update_track_position(session_id: str, track_id: int, position: dict) -> dict:
    def mutate(session: dict) -> None:
        session["activeTrackId"] = int(track_id)
        session["lastKnownPosition"] = {
            "x": position.get("x"),
            "y": position.get("y"),
        }

    return _mutate_session(session_id, mutate)


def remap_global_vehicle_id(
    old_global_id: int,
    new_global_id: int,
    *,
    runtime_id: Optional[str] = None,
) -> dict:
    old_global_id = int(old_global_id)
    new_global_id = int(new_global_id)
    with _STORE_LOCK:
        sessions = load_sessions()
        source = next(
            (
                session
                for session in sessions.values()
                if session.get("globalVehicleId") == old_global_id
                and session.get("state") != "CLOSED"
                and _matches_runtime(session, runtime_id)
            ),
            None,
        )
        if source is None:
            existing = next(
                (
                    session
                    for session in sessions.values()
                    if session.get("globalVehicleId") == new_global_id
                    and session.get("state") != "CLOSED"
                    and _matches_runtime(session, runtime_id)
                ),
                None,
            )
            if existing is None:
                raise SessionNotFound(f"No active session for Global ID {old_global_id}")
            return existing
        duplicate = next(
            (
                session
                for session in sessions.values()
                if session is not source
                and session.get("globalVehicleId") == new_global_id
                and session.get("state") != "CLOSED"
                and _matches_runtime(session, runtime_id)
            ),
            None,
        )
        if duplicate is not None:
            raise SessionError(
                f"Global ID merge would create duplicate sessions: {old_global_id} -> {new_global_id}"
            )
        source["lastKnownPosition"] = _with_live_observation(source).get("lastKnownPosition")
        _LIVE_OBSERVATIONS.pop(_observation_key(source), None)
        source["globalVehicleId"] = new_global_id
        source["revision"] = int(source.get("revision") or 0) + 1
        source["updatedAt"] = now_iso()
        save_sessions(sessions)
        return dict(source)


def delete_session(session_id: str) -> dict:
    with _STORE_LOCK:
        sessions = load_sessions()
        session = sessions.pop(str(session_id), None)
        if session is None:
            raise SessionNotFound(f"Session not found: {session_id}")
        save_sessions(sessions)
        _LIVE_OBSERVATIONS.pop(_observation_key(session), None)
        return session


def delete_session_by_global_id(
    global_vehicle_id: int,
    *,
    runtime_id: Optional[str] = None,
) -> dict:
    session = find_session_by_global_id(
        global_vehicle_id, runtime_id=runtime_id
    )
    if session is None:
        raise SessionNotFound(f"No active session for Global ID {global_vehicle_id}")
    return delete_session(str(session["sessionId"]))


def close_session(session_id: str) -> dict:
    """Backward-compatible name; physical exit now deletes the active session."""
    return delete_session(session_id)


def list_sessions() -> None:
    sessions = load_sessions()
    if not sessions:
        print("No active vehicle sessions.")
        return
    for session in sessions.values():
        print(
            f"{session['sessionId']}  GID={session.get('globalVehicleId')}  "
            f"state={session.get('state')}  parked={session.get('parkedSpotId') or '-'}"
        )


def watch_loop() -> None:
    """Legacy single-camera watcher retained for the sample workflow."""
    print(f"[WATCH] Reading {POSITIONS_FILE}")
    while True:
        vehicles = load_json(POSITIONS_FILE).get("active_vehicles", {})
        parking = load_json(STATUS_FILE).get("slots", {})
        for session in load_sessions().values():
            if session.get("state") == "NAVIGATING_TO_SPOT":
                target = session.get("targetSpotId")
                if target and parking.get(target, {}).get("status") == "occupied":
                    set_parked(str(session["sessionId"]), str(target))
            active_track_id = session.get("activeTrackId")
            if active_track_id is not None and str(active_track_id) in vehicles:
                position = vehicles[str(active_track_id)].get("position", {})
                update_track_position(str(session["sessionId"]), active_track_id, position)
        time.sleep(WATCH_INTERVAL)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="TechGAR vehicle-session manager")
    actions = parser.add_mutually_exclusive_group(required=True)
    actions.add_argument("--create", action="store_true")
    actions.add_argument("--list", action="store_true")
    actions.add_argument("--claim", metavar="SESSION_ID")
    actions.add_argument("--select-spot", metavar="SESSION_ID")
    actions.add_argument("--set-parked", metavar="SESSION_ID")
    actions.add_argument("--set-exit", metavar="SESSION_ID")
    actions.add_argument("--close", metavar="SESSION_ID")
    actions.add_argument("--watch", action="store_true")
    parser.add_argument("--global-id", type=int)
    parser.add_argument("--track", type=int)
    parser.add_argument("--spot")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    if args.create:
        create_session(track_id=args.track, global_vehicle_id=args.global_id)
    elif args.list:
        list_sessions()
    elif args.claim:
        claim_session(args.claim)
    elif args.select_spot:
        select_spot(args.select_spot, args.spot)
    elif args.set_parked:
        if not args.spot:
            raise SystemExit("--spot is required")
        set_parked(args.set_parked, args.spot)
    elif args.set_exit:
        set_exit_navigation(args.set_exit, args.track)
    elif args.close:
        close_session(args.close)
    elif args.watch:
        watch_loop()


if __name__ == "__main__":
    main()
