from __future__ import annotations

import pytest

import gate_session_controller
import session_manager


GATES = {
    "coordinate_space": "world",
    "entry_gate": {
        "p1": {"x": 0, "y": 10},
        "p2": {"x": 10, "y": 10},
        "direction": "positive",
    },
    "exit_gate": {
        "p1": {"x": 0, "y": 0},
        "p2": {"x": 10, "y": 0},
        "direction": "positive",
    },
}


def snapshot(*vehicles, events=None, parking_slots=None, runtime_id=None):
    result = {
        "schema_version": 1,
        "coordinate_space": {"unit": "cm", "bounds": None},
        "vehicles": list(vehicles),
        "recent_events": events or [],
        "parking_slots": parking_slots or [],
    }
    if runtime_id is not None:
        result["runtime_id"] = runtime_id
    return result


def vehicle(global_id, x, y, *, parked_slot_id=None, observed=True, state="active"):
    return {
        "global_id": global_id,
        "position": {"x": x, "y": y, "reference": "cm"},
        "parked_slot_id": parked_slot_id,
        "observed": observed,
        "state": state,
        "camera_ids": ["cam1"] if observed else [],
    }


class FakeClock:
    def __init__(self):
        self.value = 0.0

    def __call__(self):
        return self.value

    def advance(self, seconds):
        self.value += seconds


def coordinator(monkeypatch, tmp_path, *, clock=None):
    monkeypatch.setattr(
        session_manager,
        "SESSIONS_FILE",
        tmp_path / "navigation_sessions.json",
    )
    return gate_session_controller.GateSessionCoordinator(
        GATES,
        parked_confirm_seconds=2.0,
        clock=clock or FakeClock(),
    )


def test_entry_park_disappear_leave_and_exit_lifecycle(monkeypatch, tmp_path):
    clock = FakeClock()
    gate = coordinator(monkeypatch, tmp_path, clock=clock)

    gate.process_snapshot(snapshot(vehicle(42, 5, 12)))
    gate.process_snapshot(snapshot(vehicle(42, 5, 8)))
    session = session_manager.find_session_by_global_id(42)
    assert session is not None
    assert session["state"] == "WAITING_FOR_SCAN"

    gate.process_snapshot(
        snapshot(vehicle(42, 5, 5, parked_slot_id="D06", observed=False, state="parked"))
    )
    assert session_manager.find_session_by_global_id(42)["state"] == "WAITING_FOR_SCAN"

    clock.advance(1.99)
    gate.process_snapshot(
        snapshot(vehicle(42, 5, 5, parked_slot_id="D06", observed=False, state="parked"))
    )
    assert session_manager.find_session_by_global_id(42)["state"] == "WAITING_FOR_SCAN"

    clock.advance(0.01)
    gate.process_snapshot(
        snapshot(vehicle(42, 5, 5, parked_slot_id="D06", observed=False, state="parked"))
    )
    assert session_manager.find_session_by_global_id(42)["parkedSpotId"] == "D06"

    gate.process_snapshot(snapshot())
    assert session_manager.find_session_by_global_id(42) is not None

    gate.process_snapshot(snapshot(vehicle(42, 5, 3)))
    assert session_manager.find_session_by_global_id(42)["state"] == "EXIT_NAVIGATION"

    gate.process_snapshot(snapshot(vehicle(42, 5, -1)))
    assert session_manager.find_session_by_global_id(42) is None


def test_parking_confirmation_resets_when_slot_changes(monkeypatch, tmp_path):
    clock = FakeClock()
    gate = coordinator(monkeypatch, tmp_path, clock=clock)
    session_manager.create_session(global_vehicle_id=42, session_id="candidate-reset")

    gate.process_snapshot(
        snapshot(vehicle(42, 5, 5, parked_slot_id="D06", observed=False, state="parked"))
    )
    clock.advance(1.5)
    gate.process_snapshot(
        snapshot(vehicle(42, 5, 5, parked_slot_id="D07", observed=False, state="parked"))
    )
    clock.advance(0.6)
    gate.process_snapshot(
        snapshot(vehicle(42, 5, 5, parked_slot_id="D07", observed=False, state="parked"))
    )
    assert session_manager.find_session_by_global_id(42)["parkedSpotId"] is None

    clock.advance(1.4)
    gate.process_snapshot(
        snapshot(vehicle(42, 5, 5, parked_slot_id="D07", observed=False, state="parked"))
    )
    assert session_manager.find_session_by_global_id(42)["parkedSpotId"] == "D07"


def test_runtime_stop_duration_counts_toward_two_second_confirmation(monkeypatch, tmp_path):
    gate = coordinator(monkeypatch, tmp_path)
    session_manager.create_session(global_vehicle_id=42, session_id="runtime-stop-evidence")

    gate.process_snapshot(
        snapshot(
            vehicle(42, 5, 5, parked_slot_id="D06", observed=False, state="parked"),
            parking_slots=[{
                "slot_id": "D06",
                "status": "occupied",
                "occupied": True,
                "vehicle_id": 42,
                "tracking_state": "parked",
                "stopped_for_ms": 2100,
            }],
        )
    )

    session = session_manager.find_session_by_global_id(42)
    assert session["state"] == "PARKED"
    assert session["parkedSpotId"] == "D06"


def test_wrong_exit_direction_does_not_delete_session(monkeypatch, tmp_path):
    gate = coordinator(monkeypatch, tmp_path)
    session_manager.create_session(global_vehicle_id=42, session_id="still-inside")

    gate.process_snapshot(snapshot(vehicle(42, 5, -1)))
    gate.process_snapshot(snapshot(vehicle(42, 5, 1)))

    assert session_manager.find_session_by_global_id(42) is not None


def test_global_id_merge_updates_existing_session(monkeypatch, tmp_path):
    gate = coordinator(monkeypatch, tmp_path)
    session_manager.create_session(global_vehicle_id=42, session_id="canonical")

    gate.process_snapshot(
        snapshot(
            vehicle(9, 5, 5),
            events=[{
                "type": "global_id_merged",
                "global_id": 9,
                "superseded_global_id": 42,
            }],
        )
    )

    assert session_manager.find_session_by_global_id(42) is None
    assert session_manager.find_session_by_global_id(9)["sessionId"] == "canonical"


def test_new_runtime_does_not_reuse_a_stale_session_with_the_same_global_id(
    monkeypatch, tmp_path
):
    gate = coordinator(monkeypatch, tmp_path)
    old_session_id = session_manager.create_session(
        global_vehicle_id=42,
        runtime_id="runtime-old",
        session_id="old-session",
    )
    session_manager.claim_session(old_session_id)
    session_manager.select_spot(old_session_id, "D08")

    gate.process_snapshot(
        snapshot(vehicle(42, 5, 12), runtime_id="runtime-old")
    )
    # A restarted detector establishes a fresh baseline instead of forming a
    # false crossing with the previous process.
    gate.process_snapshot(
        snapshot(vehicle(42, 5, 8), runtime_id="runtime-new")
    )
    assert session_manager.find_session_by_global_id(
        42, runtime_id="runtime-new"
    ) is None

    gate.process_snapshot(
        snapshot(vehicle(42, 5, 12), runtime_id="runtime-new")
    )
    gate.process_snapshot(
        snapshot(vehicle(42, 5, 8), runtime_id="runtime-new")
    )

    old_session = session_manager.find_session_by_global_id(
        42, runtime_id="runtime-old"
    )
    new_session = session_manager.find_session_by_global_id(
        42, runtime_id="runtime-new"
    )
    assert old_session is not None
    assert old_session["sessionId"] == "old-session"
    assert old_session["state"] == "NAVIGATING_TO_SPOT"
    assert new_session is not None
    assert new_session["sessionId"] != old_session["sessionId"]
    assert new_session["state"] == "WAITING_FOR_SCAN"

    gate.process_snapshot(snapshot(
        vehicle(
            42,
            5,
            5,
            parked_slot_id="D08",
            observed=False,
            state="parked",
        ),
        runtime_id="runtime-new",
        parking_slots=[{
            "slot_id": "D08",
            "status": "occupied",
            "occupied": True,
            "vehicle_id": 42,
            "tracking_state": "parked",
            "stopped_for_ms": 2100,
        }],
    ))

    assert session_manager.find_session_by_global_id(
        42, runtime_id="runtime-new"
    )["parkedSpotId"] == "D08"
    assert session_manager.find_session_by_global_id(
        42, runtime_id="runtime-old"
    )["state"] == "NAVIGATING_TO_SPOT"


def test_gate_config_unit_must_match_runtime(monkeypatch, tmp_path):
    gate = coordinator(monkeypatch, tmp_path)
    gate.gate_config["unit"] = "cm"

    with pytest.raises(ValueError, match="does not match"):
        gate.process_snapshot({
            "coordinate_space": {"unit": "m"},
            "vehicles": [],
            "recent_events": [],
        })


def test_latest_runtime_slot_availability_rejects_an_occupied_replacement():
    runtime = {
        "parking_slots": [
            {"slot_id": "A01", "status": "occupied", "occupied": True},
            {"slot_id": "A02", "status": "empty", "occupied": False},
        ]
    }

    assert gate_session_controller._spot_is_available(runtime, "A01") is False
    assert gate_session_controller._spot_is_available(runtime, "A02") is True
    assert gate_session_controller._spot_is_available(runtime, "A03") is None
