from __future__ import annotations

from datetime import datetime, timedelta, timezone

import session_manager


def use_temporary_store(monkeypatch, tmp_path):
    sessions_file = tmp_path / "navigation_sessions.json"
    monkeypatch.setattr(session_manager, "SESSIONS_FILE", sessions_file)
    return sessions_file


def test_session_identity_is_global_id_and_session_id_is_opaque(monkeypatch, tmp_path):
    use_temporary_store(monkeypatch, tmp_path)

    session_id = session_manager.create_session(
        global_vehicle_id=42,
        active_track_id=7,
        session_id="vehicle-session-token",
    )

    session = session_manager.get_session(session_id)
    assert session_id == "vehicle-session-token"
    assert session["globalVehicleId"] == 42
    assert session["activeTrackId"] == 7
    assert session["sessionId"] != str(session["globalVehicleId"])


def test_one_active_session_per_global_vehicle(monkeypatch, tmp_path):
    use_temporary_store(monkeypatch, tmp_path)

    first = session_manager.create_session(global_vehicle_id=42, session_id="first")
    second = session_manager.create_session(global_vehicle_id=42, session_id="second")

    assert second == first
    assert list(session_manager.load_sessions()) == ["first"]


def test_reused_global_id_is_isolated_by_runtime(monkeypatch, tmp_path):
    use_temporary_store(monkeypatch, tmp_path)
    old_id = session_manager.create_session(
        global_vehicle_id=42,
        runtime_id="runtime-old",
        session_id="old",
    )
    new_id = session_manager.create_session(
        global_vehicle_id=42,
        runtime_id="runtime-new",
        session_id="new",
    )
    now = datetime.now(timezone.utc).astimezone()

    assert old_id == "old"
    assert new_id == "new"
    assert session_manager.find_session_by_global_id(
        42, runtime_id="runtime-old"
    )["sessionId"] == "old"
    assert session_manager.find_session_by_global_id(
        42, runtime_id="runtime-new"
    )["sessionId"] == "new"
    assert [
        session["sessionId"]
        for session in session_manager.list_waiting_sessions(
            now=now,
            runtime_id="runtime-new",
        )
    ] == ["new"]


def test_waiting_qr_is_hidden_after_ten_seconds_without_being_claimed(monkeypatch, tmp_path):
    use_temporary_store(monkeypatch, tmp_path)
    session_id = session_manager.create_session(global_vehicle_id=42, session_id="expires")
    session = session_manager.get_session(session_id)
    created_at = datetime.fromisoformat(session["createdAt"])

    assert session_manager.list_waiting_sessions(
        now=created_at + timedelta(seconds=9, milliseconds=999)
    ) == [session]
    assert session_manager.list_waiting_sessions(
        now=created_at + timedelta(seconds=10)
    ) == []


def test_waiting_sessions_keep_newest_vehicle_last(monkeypatch, tmp_path):
    use_temporary_store(monkeypatch, tmp_path)
    first_id = session_manager.create_session(global_vehicle_id=1, session_id="vehicle-1")
    sessions = session_manager.load_sessions()
    sessions[first_id]["createdAt"] = "2026-08-23T03:00:00.000+00:00"
    sessions[first_id]["qrExpiresAt"] = "2026-08-23T03:00:10.000+00:00"
    session_manager.save_sessions(sessions)

    second_id = session_manager.create_session(global_vehicle_id=2, session_id="vehicle-2")
    sessions = session_manager.load_sessions()
    sessions[second_id]["createdAt"] = "2026-08-23T03:00:01.000+00:00"
    sessions[second_id]["qrExpiresAt"] = "2026-08-23T03:00:11.000+00:00"
    session_manager.save_sessions(sessions)

    waiting = session_manager.list_waiting_sessions(
        now=datetime(2026, 8, 23, 3, 0, 2, tzinfo=timezone.utc)
    )
    assert [session["globalVehicleId"] for session in waiting] == [1, 2]


def test_parked_slot_survives_without_an_active_track(monkeypatch, tmp_path):
    use_temporary_store(monkeypatch, tmp_path)
    session_id = session_manager.create_session(global_vehicle_id=42, session_id="parked")

    parked = session_manager.set_parked_by_global_id(42, "D06")

    assert parked["sessionId"] == session_id
    assert parked["state"] == "PARKED"
    assert parked["parkedSpotId"] == "D06"
    assert parked["activeTrackId"] is None
    assert session_manager.get_session(session_id)["parkedSpotId"] == "D06"


def test_claim_is_idempotent_and_invalid_transitions_are_rejected(monkeypatch, tmp_path):
    use_temporary_store(monkeypatch, tmp_path)
    session_id = session_manager.create_session(global_vehicle_id=42, session_id="claimable")

    first = session_manager.claim_session(session_id)
    second = session_manager.claim_session(session_id)

    assert first["state"] == "SELECTING_SPOT"
    assert second["state"] == "SELECTING_SPOT"

    session_manager.set_parked(session_id, "D06")
    try:
        session_manager.select_spot(session_id, "A01")
    except session_manager.InvalidSessionState:
        pass
    else:
        raise AssertionError("PARKED session must not accept a new inbound target")


def test_remap_global_id_and_delete_on_confirmed_exit(monkeypatch, tmp_path):
    use_temporary_store(monkeypatch, tmp_path)
    session_id = session_manager.create_session(global_vehicle_id=42, session_id="remapped")

    remapped = session_manager.remap_global_vehicle_id(42, 9)
    deleted = session_manager.delete_session_by_global_id(9)

    assert remapped["sessionId"] == session_id
    assert remapped["globalVehicleId"] == 9
    assert deleted["sessionId"] == session_id
    assert session_manager.load_sessions() == {}
