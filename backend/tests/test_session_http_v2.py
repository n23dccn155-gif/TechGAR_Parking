"""Exercise the production HTTP handler against an isolated real session store."""
import json
import threading
from concurrent.futures import ThreadPoolExecutor
from http.server import ThreadingHTTPServer
from urllib.error import HTTPError
from urllib.request import Request, urlopen

import pytest
import session_manager as sm
import gate_session_controller as gate
from test_parking_episodes_v2 import snapshot, episode
from test_gate_session_coordinator import GATES


@pytest.fixture
def api(monkeypatch, tmp_path):
    monkeypatch.setattr(sm, "SESSIONS_FILE", tmp_path / "sessions.json")
    monkeypatch.setattr(gate, "_latest_runtime_snapshot", None)
    monkeypatch.setattr(gate, "_latest_runtime_received_at", None)
    sid = sm.create_session(global_vehicle_id=42, runtime_id="run-1")
    sm.claim_session(sid)
    server = ThreadingHTTPServer(("127.0.0.1", 0), gate.SessionAPIRequestHandler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()

    def request(action, *, session_id=None, **values):
        req = Request(f"http://127.0.0.1:{server.server_port}/api/session/{action}",
                      data=json.dumps(dict(sessionId=session_id or sid, **values)).encode(),
                      headers={"Content-Type": "application/json"}, method="POST")
        try:
            with urlopen(req, timeout=2) as result:
                return result.status, json.load(result)
        except HTTPError as error:
            return error.code, json.load(error)

    yield sid, request, gate.GateSessionCoordinator(GATES), server.server_port
    server.shutdown()
    server.server_close()
    thread.join(timeout=2)


def test_retry_action_after_slot_turns_red_is_idempotent(api):
    sid, request, coordinator, _port = api
    data = snapshot(1)
    data["parking_slots"] = [dict(slot_id="D06", occupied=False, status="empty")]
    coordinator.process_snapshot(data)
    revision = sm.get_session(sid)["revision"]
    status, first = request("select", spotId="D06", action_id="select-1", expected_revision=revision)
    assert status == 200
    coordinator.process_snapshot(snapshot(10, [episode()]))
    status, repeated = request("select", spotId="D06", action_id="select-1", expected_revision=revision)
    assert status == 200
    assert repeated["state"] == "PARKED"
    assert repeated["revision"] > first["revision"]
    status, rejected = request("exit", action_id="exit-1", expected_revision=revision)
    assert status == 409
    assert rejected["session"]["state"] == "PARKED"
    assert sm.get_session(sid)["state"] == "PARKED"


def test_exit_before_parking_and_relocate_preserve_one_identity(api):
    sid, request, coordinator, _port = api
    assert request("exit", action_id="exit-before-park")[0] == 200
    assert sm.get_session(sid)["state"] == "EXIT_NAVIGATION"
    assert request("select", spotId=None, action_id="cancel-exit")[0] == 200
    coordinator.process_snapshot(snapshot(10, [episode()]))
    assert sm.get_session(sid)["state"] == "PARKED"
    data = snapshot(11, [episode()])
    data["parking_slots"] = [dict(slot_id="D07", occupied=False, status="empty")]
    coordinator.process_snapshot(data)
    assert request("select", spotId="D07", action_id="relocate")[0] == 200
    moved = sm.get_session(sid)
    assert moved["state"] == "RELOCATING"
    assert moved["actualParkedSpotId"] == "D06"
    coordinator.process_snapshot(snapshot(12, [episode("departing", frame=12)]))
    coordinator.process_snapshot(snapshot(20, [episode(slot="D08", eid="second", frame=20)]))
    assert sm.get_session(sid)["parkedSpotId"] == "D08"
    assert sm.get_session(sid)["globalVehicleId"] == 42
    assert len(sm.load_sessions()) == 1


def test_unknown_and_another_runtime_are_not_empty_slots(api):
    sid, request, coordinator, _port = api
    assert request("select", spotId="D06")[0] == 409  # no matching runtime yet
    coordinator.process_snapshot(snapshot(1))
    assert request("select", spotId="D06")[0] == 503
    data = snapshot(2)
    data["runtime_id"] = "run-2"
    data["parking_slots"] = [dict(slot_id="D06", occupied=False, status="empty")]
    coordinator.process_snapshot(data)
    assert request("select", spotId="D06")[0] == 409
    assert sm.get_session(sid)["state"] == "SELECTING_SPOT"


def test_navigation_reservation_is_atomic_and_visible_to_other_sessions(api):
    sid, request, coordinator, port = api
    other_sid = sm.create_session(
        global_vehicle_id=99,
        runtime_id="run-1",
        session_id="other-session",
    )
    sm.claim_session(other_sid)
    data = snapshot(1)
    data["parking_slots"] = [
        dict(slot_id="A01", occupied=False, status="empty"),
        dict(slot_id="A02", occupied=False, status="empty"),
    ]
    coordinator.process_snapshot(data)

    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(
            lambda current_sid: request(
                "select", session_id=current_sid, spotId="A01"
            ),
            [sid, other_sid],
        ))

    assert sorted(status for status, _payload in results) == [200, 409]
    winner_index = next(index for index, (status, _payload) in enumerate(results) if status == 200)
    winner_sid = [sid, other_sid][winner_index]
    loser_sid = [sid, other_sid][1 - winner_index]
    rejected = results[1 - winner_index][1]
    assert rejected["code"] == "SPOT_RESERVED"

    with urlopen(
        f"http://127.0.0.1:{port}/api/sessions/reservations?sessionId={loser_sid}",
        timeout=2,
    ) as response:
        reservations = json.load(response)
    assert [item["spotId"] for item in reservations] == ["A01"]

    assert request("select", session_id=winner_sid, spotId="A02")[0] == 200
    assert request("select", session_id=loser_sid, spotId="A01")[0] == 200
