from datetime import datetime, timezone, timedelta
import pytest
import session_manager as sm
from gate_session_controller import GateSessionCoordinator
from test_gate_session_coordinator import GATES


def episode(state="parked", slot="D06", eid="parking-1", frame=10):
    return dict(parking_episode_id=eid, global_id=42, slot_id=slot, state=state,
                evidence_frame_idx=frame, applied_frame_idx=frame,
                evidence_timestamp_s=1.0, applied_timestamp_s=1.0)


def snapshot(frame=10, episodes=None, **overrides):
    return dict(schema_version=2, runtime_id="run-1", frame_index=frame,
                source_mode="live", published_at=datetime.now(timezone.utc).isoformat(),
                parking_episodes=episodes or [], vehicles=[], **overrides)


@pytest.fixture
def rig(monkeypatch, tmp_path):
    monkeypatch.setattr(sm, "SESSIONS_FILE", tmp_path / "sessions.json")
    sid = sm.create_session(global_vehicle_id=42, runtime_id="run-1")
    sm.claim_session(sid)
    return GateSessionCoordinator(GATES), sid


def test_park_without_motion_vehicle_and_change_spot_same_session(rig):
    gate, sid = rig
    gate.process_snapshot(snapshot(10, [episode()]))
    assert sm.get_session(sid)["state"] == "PARKED"
    moved = sm.select_spot(sid, "D07")
    assert moved["state"] == "RELOCATING"
    assert moved["actualParkedSpotId"] == "D06"
    gate.process_snapshot(snapshot(17, [episode()]))
    assert sm.get_session(sid)["state"] == "RELOCATING"
    gate.process_snapshot(snapshot(24, [episode("departing", frame=24)]))
    assert sm.get_session(sid)["actualParkedSpotId"] is None
    gate.process_snapshot(snapshot(40, [episode(slot="D08", eid="parking-2", frame=40)]))
    parked = sm.get_session(sid)
    assert parked["state"] == "PARKED"
    assert parked["parkedSpotId"] == "D08"  # another slot than the requested D07 is valid
    assert parked["globalVehicleId"] == 42


def test_exit_without_parking_and_old_episode_never_cancels_exit(rig):
    gate, sid = rig
    exiting = sm.set_exit_navigation(sid)
    assert exiting["state"] == "EXIT_NAVIGATION"
    gate.process_snapshot(snapshot(10, [episode()]))
    assert sm.get_session(sid)["state"] == "EXIT_NAVIGATION"


def test_revision_and_idempotent_action(rig):
    _, sid = rig
    current = sm.get_session(sid)
    first = sm.set_exit_navigation(sid, expected_revision=current["revision"], action_id="click-1")
    assert sm.set_exit_navigation(sid, expected_revision=current["revision"], action_id="click-1") == first
    with pytest.raises(sm.SessionConflict):
        sm.select_spot(sid, "D08", expected_revision=current["revision"], action_id="click-2")
    with pytest.raises(sm.SessionConflict):
        sm.select_spot(sid, "D08", action_id="click-1")


@pytest.mark.parametrize("invalid", ["replay", "stale", "runtime", "v1", "future_evidence"])
def test_invalid_source_cannot_park(rig, invalid):
    gate, sid = rig
    value = snapshot(10, [episode()])
    if invalid == "replay": value["source_mode"] = "replay"
    if invalid == "stale": value["published_at"] = (datetime.now(timezone.utc) - timedelta(seconds=10)).isoformat()
    if invalid == "runtime": value["runtime_id"] = "run-2"
    if invalid == "v1": value["schema_version"] = 1
    if invalid == "future_evidence": value["parking_episodes"][0]["evidence_frame_idx"] = 99
    gate.process_snapshot(value)
    assert sm.get_session(sid)["state"] == "SELECTING_SPOT"


def test_cancel_relocation_before_and_after_departure(rig):
    gate, sid = rig
    gate.process_snapshot(snapshot(10, [episode()]))
    sm.select_spot(sid, "D07")
    assert sm.select_spot(sid, None)["state"] == "PARKED"
    sm.select_spot(sid, "D07")
    gate.process_snapshot(snapshot(20, [episode("released", frame=20)]))
    assert sm.select_spot(sid, None)["state"] == "SELECTING_SPOT"


def test_false_empty_rollback_restores_physical_slot_not_navigation_intent(rig):
    gate, sid = rig
    gate.process_snapshot(snapshot(10, [episode()]))
    sm.select_spot(sid, "D07")
    gate.process_snapshot(snapshot(11, [episode("departing", frame=11)]))
    gate.process_snapshot(snapshot(12, [episode("parked", frame=12)]))
    state = sm.get_session(sid)
    assert state["state"] == "RELOCATING"
    assert state["actualParkedSpotId"] == "D06"
    assert state["targetSpotId"] == "D07"


def test_conflicting_owners_cannot_complete_parking(rig):
    gate, sid = rig
    first = episode()
    second = dict(episode(), global_id=99, parking_episode_id="other")
    gate.process_snapshot(snapshot(10, [first, second]))
    assert sm.get_session(sid)["state"] == "SELECTING_SPOT"


def test_stale_camera_with_fresh_publication_cannot_park(rig):
    gate, sid = rig
    value = snapshot(10, [episode()], cameras={"cam1": {"online": True, "age_ms": 6000}})
    gate.process_snapshot(value)
    assert sm.get_session(sid)["state"] == "SELECTING_SPOT"


def test_forward_snapshot_frame_cannot_reapply_older_parking_episode(rig):
    gate, sid = rig
    gate.process_snapshot(snapshot(10, [episode()]))
    gate.process_snapshot(snapshot(20, [episode("released", frame=20)]))
    released = sm.get_session(sid)
    gate.process_snapshot(snapshot(30, [episode()]))
    assert sm.get_session(sid) == released


def test_repeated_episode_is_not_applied_again(monkeypatch, rig):
    import gate_session_controller as module
    gate, sid = rig
    gate.process_snapshot(snapshot(10, [episode()]))
    def unexpected(*args, **kwargs):
        raise AssertionError("Repeated episode triggered another mutation")
    monkeypatch.setattr(module, "set_parked_by_global_id", unexpected)
    gate.process_snapshot(snapshot(11, [episode()]))
    assert sm.get_session(sid)["state"] == "PARKED"


def test_live_motion_does_not_fsync_or_conflict_with_user_actions(monkeypatch, rig):
    gate, sid = rig
    initial = sm.get_session(sid)
    writes = []
    original = sm.atomic_write
    def record_write(*args):
        writes.append(args)
        original(*args)
    monkeypatch.setattr(sm, "atomic_write", record_write)
    for frame in range(1, 21):
        value = snapshot(frame)
        value["vehicles"] = [dict(global_id=42, observed=True, state="active",
                                  position={"x":50+frame,"y":50}, camera_ids=["cam1"])]
        gate.process_snapshot(value)
    assert writes == []
    current = sm.get_session(sid)
    assert current["lastKnownPosition"] == {"x":70,"y":50}
    assert current["revision"] == initial["revision"]
    exiting = sm.set_exit_navigation(sid, expected_revision=initial["revision"], action_id="exit")
    assert exiting["state"] == "EXIT_NAVIGATION"
    assert len(writes) == 1
    assert sm.load_sessions()[sid]["lastKnownPosition"] == {"x":70,"y":50}


@pytest.mark.parametrize("times,expected_entry", [([10, 10.4], True), ([10, 12], False),
                                                  ([10, 10], False), ([10, 9], False)])
def test_gate_uses_source_observation_time_not_http_arrival_speed(monkeypatch, tmp_path, times, expected_entry):
    monkeypatch.setattr(sm, "SESSIONS_FILE", tmp_path / "sessions.json")
    gate = GateSessionCoordinator(GATES, clock=lambda: 100.0)
    for frame, (y, source_time) in enumerate(zip([12, 8], times), 1):
        value = snapshot(frame)
        value["vehicles"] = [dict(global_id=42, observed=True, position={"x":5,"y":y},
                                  last_seen_time=source_time)]
        gate.process_snapshot(value)
    assert (sm.find_session_by_global_id(42, runtime_id="run-1") is not None) == expected_entry
