# -*- coding: utf-8 -*-
"""PLAN_full.md section 3 (part B): episode-driven session controller."""
import io
import sys

SM = r"D:\TechGar2\backend\session_manager.py"
GSC = r"D:\TechGar2\backend\gate_session_controller.py"


def patch(path, pairs):
    with io.open(path, "r", encoding="utf-8") as fh:
        text = fh.read()
    for old, new in pairs:
        if old not in text:
            print("MISS in %s: %r" % (path, old[:100]))
            sys.exit(1)
        if text.count(old) != 1:
            print("AMBIGUOUS in %s (%d): %r" % (path, text.count(old), old[:100]))
            sys.exit(1)
        text = text.replace(old, new)
    with io.open(path, "w", encoding="utf-8", newline="\n") as fh:
        fh.write(text)
    print("patched", path)


sm_pairs = [
    # new exception for optimistic concurrency
    (
        """class InvalidSessionState(SessionError):
    \"\"\"Raised when an action is not valid for the current lifecycle state.\"\"\"
""",
        """class InvalidSessionState(SessionError):
    \"\"\"Raised when an action is not valid for the current lifecycle state.\"\"\"


class SessionConflict(SessionError):
    \"\"\"Raised when expected_revision no longer matches the stored session.

    Carries the latest session so callers (HTTP 409) can resynchronize
    instead of retrying blindly.
    \"\"\"

    def __init__(self, message: str, current: Optional[dict] = None):
        super().__init__(message)
        self.current = current
""",
    ),
    # session normalization gains the episode id
    (
        """    session.setdefault("parkedSpotId", None)
    session.setdefault("claimed", False)
""",
        """    session.setdefault("parkedSpotId", None)
    session.setdefault("parkingEpisodeId", None)
    session.setdefault("claimed", False)
""",
    ),
    # create_session record gains the episode id
    (
        """            "targetSpotId": None,
            "parkedSpotId": None,
            "globalVehicleId": resolved_global_id,
""",
        """            "targetSpotId": None,
            "parkedSpotId": None,
            "parkingEpisodeId": None,
            "globalVehicleId": resolved_global_id,
""",
    ),
    # _mutate_session: optimistic revision gate
    (
        """def _mutate_session(session_id: str, mutate) -> dict:
    with _STORE_LOCK:
        sessions = load_sessions()
        session = sessions.get(str(session_id))
        if session is None:
            raise SessionNotFound(f"Session not found: {session_id}")
        before = dict(session)
""",
        """def _mutate_session(
    session_id: str,
    mutate,
    *,
    expected_revision: Optional[int] = None,
) -> dict:
    with _STORE_LOCK:
        sessions = load_sessions()
        session = sessions.get(str(session_id))
        if session is None:
            raise SessionNotFound(f"Session not found: {session_id}")
        if expected_revision is not None and int(
            session.get("revision") or 0
        ) != int(expected_revision):
            # Stale response / double-click / resent request: refuse, and
            # hand the caller the latest state to resynchronize (HTTP 409).
            raise SessionConflict(
                (
                    f"Session revision mismatch: expected "
                    f"{int(expected_revision)}, current "
                    f"{int(session.get('revision') or 0)}"
                ),
                current=dict(session),
            )
        before = dict(session)
""",
    ),
    # claim/select/exit/parked accept expected_revision + episode id
    (
        """def claim_session(session_id: str) -> dict:
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

    return _mutate_session(session_id, mutate)
""",
        """def claim_session(
    session_id: str, *, expected_revision: Optional[int] = None
) -> dict:
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

    return _mutate_session(session_id, mutate, expected_revision=expected_revision)
""",
    ),
    (
        """def select_spot(session_id: str, spot_id: Optional[str]) -> dict:
    def mutate(session: dict) -> None:
""",
        """def select_spot(
    session_id: str,
    spot_id: Optional[str],
    *,
    expected_revision: Optional[int] = None,
) -> dict:
    def mutate(session: dict) -> None:
""",
    ),
    (
        """        else:
            session["state"] = "SELECTING_SPOT"
            session["targetSpotId"] = None

    return _mutate_session(session_id, mutate)
""",
        """        else:
            session["state"] = "SELECTING_SPOT"
            session["targetSpotId"] = None

    return _mutate_session(session_id, mutate, expected_revision=expected_revision)
""",
    ),
    (
        """def set_parked(session_id: str, parked_spot: str) -> dict:
    def mutate(session: dict) -> None:
        current_state = session.get("state")
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
        session["targetSpotId"] = None
        session["activeTrackId"] = None
        if previous_parked_at is None or current_state != "PARKED" or current_spot != str(parked_spot):
            session["parkedAt"] = now_iso()

    return _mutate_session(session_id, mutate)
""",
        """def set_parked(
    session_id: str,
    parked_spot: str,
    *,
    parking_episode_id: Optional[str] = None,
    expected_revision: Optional[int] = None,
) -> dict:
    def mutate(session: dict) -> None:
        current_state = session.get("state")
        if current_state == "EXIT_NAVIGATION":
            raise InvalidSessionState(
                "Cannot park session while exiting the facility"
            )
        current_spot = session.get("parkedSpotId")
        # One physical parking occurrence = one episode. Re-applying the same
        # episode is a no-op (idempotent polling must not bump the revision).
        if (
            parking_episode_id is not None
            and session.get("parkingEpisodeId") == str(parking_episode_id)
            and current_state == "PARKED"
        ):
            return
        if (
            parking_episode_id is None
            and current_state == "PARKED"
            and current_spot == str(parked_spot)
        ):
            return
        previous_parked_at = _parse_iso(session.get("parkedAt"))
        session["state"] = "PARKED"
        session["parkedSpotId"] = str(parked_spot)
        if parking_episode_id is not None:
            session["parkingEpisodeId"] = str(parking_episode_id)
        session["targetSpotId"] = None
        session["activeTrackId"] = None
        if previous_parked_at is None or current_state != "PARKED" or current_spot != str(parked_spot):
            session["parkedAt"] = now_iso()

    return _mutate_session(session_id, mutate, expected_revision=expected_revision)
""",
    ),
    (
        """def set_parked_by_global_id(
    global_vehicle_id: int,
    parked_spot: str,
    *,
    runtime_id: Optional[str] = None,
) -> dict:
    session = find_session_by_global_id(
        global_vehicle_id, runtime_id=runtime_id
    )
    if session is None:
        raise SessionNotFound(f"No active session for Global ID {global_vehicle_id}")
    return set_parked(str(session["sessionId"]), parked_spot)
""",
        """def set_parked_by_global_id(
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
    return set_parked(
        str(session["sessionId"]),
        parked_spot,
        parking_episode_id=parking_episode_id,
    )
""",
    ),
    (
        """def set_exit_navigation(
    session_id: str,
    new_track_id: Optional[int] = None,
) -> dict:
""",
        """def set_exit_navigation(
    session_id: str,
    new_track_id: Optional[int] = None,
    *,
    expected_revision: Optional[int] = None,
) -> dict:
""",
    ),
    (
        """        session["state"] = "EXIT_NAVIGATION"
        session["targetSpotId"] = None
        session["activeTrackId"] = new_track_id
        session["exitStartedAt"] = now_iso()

    return _mutate_session(session_id, mutate)
""",
        """        session["state"] = "EXIT_NAVIGATION"
        session["targetSpotId"] = None
        session["activeTrackId"] = new_track_id
        session["exitStartedAt"] = now_iso()

    return _mutate_session(session_id, mutate, expected_revision=expected_revision)
""",
    ),
]

gsc_pairs = [
    # import SessionConflict
    (
        """    set_parked_by_global_id,
""",
        """    SessionConflict,
    set_parked_by_global_id,
""",
    ),
    # departure candidate keeps an observation timestamp
    (
        """        self._parked_candidates: dict[int, tuple[str, float]] = {}
        self._departure_candidates: dict[int, tuple[int, int]] = {}
""",
        """        self._parked_candidates: dict[int, tuple[str, float]] = {}
        self._departure_candidates: dict[int, tuple[int, int, Optional[float]]] = {}
""",
    ),
    # replay snapshots never touch live sessions
    (
        """    def process_snapshot(self, snapshot: dict[str, Any]) -> None:
        runtime_unit = (snapshot.get("coordinate_space") or {}).get("unit")
""",
        """    def process_snapshot(self, snapshot: dict[str, Any]) -> None:
        # Replay snapshots may run the same frames many times; they must
        # never create or mutate live sessions (PLAN 3.2).
        if str(snapshot.get("source_mode") or "live") == "replay":
            return
        runtime_unit = (snapshot.get("coordinate_space") or {}).get("unit")
""",
    ),
    # collect authoritative parked episodes (schema v2)
    (
        """        _remember_runtime_snapshot(snapshot)
        self._apply_alias_table(snapshot.get("retired_global_ids"), runtime_id)
        self._apply_merge_events(snapshot.get("recent_events"), runtime_id)
        vehicles = snapshot.get("vehicles", [])
        if not isinstance(vehicles, list):
            return
""",
        """        _remember_runtime_snapshot(snapshot)
        self._apply_alias_table(snapshot.get("retired_global_ids"), runtime_id)
        self._apply_merge_events(snapshot.get("recent_events"), runtime_id)
        # Schema v2: one authoritative parking episode per occurrence. The
        # binder is the single source of slot ownership; the controller no
        # longer re-confirms parked state with its own polling counter when
        # episodes are present.
        parked_episodes_by_gid: dict[int, dict[str, Any]] = {}
        raw_episodes = snapshot.get("parking_episodes")
        episodes_present = isinstance(raw_episodes, list)
        if episodes_present:
            for episode in raw_episodes:
                if not isinstance(episode, dict) or episode.get("state") != "parked":
                    continue
                try:
                    episode_gid = int(episode.get("global_id"))
                except (TypeError, ValueError):
                    continue
                previous = parked_episodes_by_gid.get(episode_gid)
                if previous is None or int(
                    episode.get("applied_frame_idx") or 0
                ) > int(previous.get("applied_frame_idx") or 0):
                    parked_episodes_by_gid[episode_gid] = episode
        vehicles = snapshot.get("vehicles", [])
        if not isinstance(vehicles, list):
            return
""",
    ),
    # episode-driven parked confirmation before the v1 polling fallback
    (
        """            parked_slot_id = vehicle.get("parked_slot_id")
            if session.get("state") == "EXIT_NAVIGATION":
                self._parked_candidates.pop(global_id, None)
                self._departure_candidates.pop(global_id, None)
                continue

            if parked_slot_id:
""",
        """            parked_slot_id = vehicle.get("parked_slot_id")
            if session.get("state") == "EXIT_NAVIGATION":
                self._parked_candidates.pop(global_id, None)
                self._departure_candidates.pop(global_id, None)
                continue

            episode = parked_episodes_by_gid.get(global_id)
            if episode is not None and episode.get("slot_id"):
                episode_slot = str(episode["slot_id"])
                episode_id = episode.get("parking_episode_id")
                if (
                    session.get("state") == "PARKED"
                    and session.get("parkedSpotId") == episode_slot
                    and session.get("parkingEpisodeId") == episode_id
                ):
                    self._parked_candidates.pop(global_id, None)
                    continue
                set_parked_by_global_id(
                    global_id,
                    episode_slot,
                    runtime_id=runtime_id,
                    parking_episode_id=(
                        str(episode_id) if episode_id is not None else None
                    ),
                )
                self._parked_candidates.pop(global_id, None)
                self._departure_candidates.pop(global_id, None)
                continue

            if parked_slot_id and not episodes_present:
""",
    ),
    # departure continuity by recency, not adjacent frame numbers
    (
        """                count, last_frame = self._departure_candidates.get(
                    global_id, (0, -2)
                )
                next_count = count + 1 if frame_index is None or last_frame + 1 == frame_index else 1
                if str(vehicle.get("state", "active")) == "active" and movement >= 0.25:
                    self._departure_candidates[global_id] = (
                        next_count,
                        frame_index if frame_index is not None else last_frame + 1,
                    )
""",
        """                count, last_frame, last_time = self._departure_candidates.get(
                    global_id, (0, -2, None)
                )
                # Valid polling delivers non-adjacent frames (100, 107, 114):
                # continuity is judged by observation recency, not n, n+1.
                continuous = (
                    frame_index is None
                    or last_time is None
                    or now - float(last_time) <= 2.0
                )
                next_count = count + 1 if continuous else 1
                if str(vehicle.get("state", "active")) == "active" and movement >= 0.25:
                    self._departure_candidates[global_id] = (
                        next_count,
                        frame_index if frame_index is not None else last_frame + 1,
                        now,
                    )
""",
    ),
    # API: action_id dedupe + expected_revision wiring + 409 conflict shape
    (
        """    def do_POST(self) -> None:
        length = int(self.headers.get("Content-Length", 0))
        try:
            payload = json.loads(self.rfile.read(length).decode("utf-8")) if length else {}
        except json.JSONDecodeError:
            self._json({"error": "Invalid JSON"}, 400)
            return
        path = urlparse(self.path).path
        try:
            if path == "/api/session/claim":
                session = claim_session(str(payload.get("sessionId") or ""))
                self._json(session)
            elif path == "/api/session/select":
""",
        """    def do_POST(self) -> None:
        length = int(self.headers.get("Content-Length", 0))
        try:
            payload = json.loads(self.rfile.read(length).decode("utf-8")) if length else {}
        except json.JSONDecodeError:
            self._json({"error": "Invalid JSON"}, 400)
            return
        path = urlparse(self.path).path
        # action_id guards against double-clicks and resent requests (PLAN
        # 3.3): an already-applied action returns its original result.
        action_id = payload.get("actionId")
        if isinstance(action_id, str) and action_id:
            cached = _ACTION_RESULTS.get(action_id)
            if cached is not None:
                self._json(cached)
                return
        expected_revision = payload.get("expectedRevision")
        expected_revision = (
            int(expected_revision)
            if isinstance(expected_revision, (int, float))
            else None
        )
        try:
            if path == "/api/session/claim":
                session = claim_session(
                    str(payload.get("sessionId") or ""),
                    expected_revision=expected_revision,
                )
                self._json(session)
            elif path == "/api/session/select":
""",
    ),
    (
        """                session = select_spot(
                    str(payload.get("sessionId") or ""), spot_id
                )
                self._json(session)
            elif path == "/api/session/exit":
                session = set_exit_navigation(str(payload.get("sessionId") or ""))
                self._json(session)
""",
        """                session = select_spot(
                    str(payload.get("sessionId") or ""),
                    spot_id,
                    expected_revision=expected_revision,
                )
                self._json(session)
            elif path == "/api/session/exit":
                session = set_exit_navigation(
                    str(payload.get("sessionId") or ""),
                    expected_revision=expected_revision,
                )
                self._json(session)
""",
    ),
    (
        """        except SessionNotFound as error:
            self._json({"error": str(error), "code": "SESSION_NOT_FOUND"}, 404)
        except InvalidSessionState as error:
            self._json({"error": str(error), "code": "INVALID_SESSION_STATE"}, 409)
        except (SessionError, ValueError) as error:
            self._json({"error": str(error)}, 400)
""",
        """        except SessionNotFound as error:
            self._json({"error": str(error), "code": "SESSION_NOT_FOUND"}, 404)
        except SessionConflict as error:
            self._json(
                {
                    "error": str(error),
                    "code": "REVISION_CONFLICT",
                    "session": error.current,
                },
                409,
            )
            return
        except InvalidSessionState as error:
            self._json({"error": str(error), "code": "INVALID_SESSION_STATE"}, 409)
        except (SessionError, ValueError) as error:
            self._json({"error": str(error)}, 400)
""",
    ),
    # action result cache store
    (
        """_LATEST_RUNTIME_LOCK = threading.RLock()
_latest_runtime_snapshot: Optional[dict[str, Any]] = None
_latest_runtime_received_at: Optional[float] = None
""",
        """_LATEST_RUNTIME_LOCK = threading.RLock()
_latest_runtime_snapshot: Optional[dict[str, Any]] = None
_latest_runtime_received_at: Optional[float] = None
# actionId -> response body, capped and time-bounded (PLAN 3.3).
_ACTION_RESULTS: dict[str, dict[str, Any]] = {}
_ACTION_RESULTS_MAX = 128
""",
    ),
]

patch(SM, sm_pairs)
patch(GSC, gsc_pairs)
print("ALL OK")
