"""Exercise real reservation guards, trajectory scoring and binder tokens together."""
from types import SimpleNamespace
import numpy as np
import pytest
from techgar.cross_camera_manager import CrossCameraManager
from techgar.slot_vehicle_binder import SlotVehicleBinder, SlotBinding, VehicleParkingState
from techgar.trajectory_memory import TrajectorySample


def rig():
    histogram = np.zeros((16, 16), np.float32)
    histogram[0, 0] = 1
    track = SimpleNamespace(x=90, y=88, w=20, h=12, cx=100, cy=100,
                            appearance=histogram, status="confirmed", history=[(100,100)])
    manager = CrossCameraManager({"cam1": (400, 400)}, {"cam1": (0, 0, 400, 400)})
    manager._observe_identity(2, "cam1", 1, track, 1, 1.0)
    binder = SlotVehicleBinder(policy="vision_primary")
    binding = SlotBinding(slot_id="D01", camera_id="cam1", center=(100,100), vehicle_id=2,
                          polygon=np.array([[80,80],[120,80],[120,120],[80,120]], np.float32),
                          vision_occupied=True, vision_evidence_frame_idx=1, vision_evidence_timestamp_s=1.)
    binder._bindings["D01"] = binding
    binder._vehicle_states[2] = VehicleParkingState(global_id=2, last_bbox=(90,88,20,12), last_appearance=histogram)
    binder._vehicle_to_slot[2] = "D01"
    binder._open_parking_episode(2, "D01", 1, "test")
    token = binder._create_departure_token(binding, 2, 10., reason="test", confirmed_empty=True)
    token.confirmed_empty = True
    binder._transition_parking_episode("D01", "departing", "test")
    manager.sync_parked_reservations(binder.get_identity_reservations(), 100)
    manager._bind("cam1", 9, 4)
    for i in range(4):
        manager.trajectory.append_global(4, TrajectorySample(
            frame_idx=101+i, timestamp_s=10.1+i*.2, camera_id="cam1", local_track_id=9,
            world=(102.+8*i,100.), bbox_size=(20,12)))
    proof = binder.export_recovery_tokens(10.8)[0]
    return manager, binder, track, proof


def test_reserved_owner_recovers_with_real_manager_and_real_binder():
    manager, binder, track, proof = rig()
    assert manager._merge_global_ids(2,4,110,"ordinary").accepted is False
    result = manager.reconcile_departure_identity("cam1",9,track,110,
                                                   token=proof,binder=binder,timestamp_s=10.8)
    assert result.accepted, result.rejection_reason
    assert manager.get_global_id("cam1",9) == 2
    assert manager.canonical_global_id(4) == 2
    assert 2 not in manager.parked_global_ids
    assert binder.export_recovery_tokens(10.8) == []
    assert binder.parking_episodes()[0]["state"] == "released"


@pytest.mark.parametrize("failure", ["independent", "occluded", "token", "appearance"])
def test_rejected_real_transaction_keeps_identity_and_episode(failure):
    manager, binder, track, proof = rig()
    if failure == "independent": manager._independent_global_pairs.add((2,4))
    if failure == "occluded": manager.sync_occluded_identities({4})
    if failure == "token": proof["created_at_s"] = 9.
    if failure == "appearance": track.appearance = np.roll(track.appearance, 4, axis=0)
    result = manager.reconcile_departure_identity("cam1",9,track,110,
                                                   token=proof,binder=binder,timestamp_s=10.8)
    assert not result.accepted
    assert manager.get_global_id("cam1",9) == 4
    assert manager.canonical_global_id(4) == 4
    assert 2 in manager.parked_global_ids
    assert len(binder.export_recovery_tokens(10.8)) == 1
    assert binder.parking_episodes()[0]["state"] == "departing"


def test_bind_external_id_keeps_reservation_when_bind_raises(monkeypatch):
    manager, binder, _, proof = rig()
    original = manager._bind

    def fail_once(*args, **kwargs):
        raise RuntimeError("simulated bind failure")

    monkeypatch.setattr(manager, "_bind", fail_once)
    with pytest.raises(RuntimeError, match="simulated bind failure"):
        manager.bind_external_id(
            "cam1", 9, 2, 110,
            source="parking_departure_token",
            source_slot_id=proof["slot_id"],
            source_camera_id=proof["camera_id"],
        )
    assert manager.parked_global_ids == {2}
    # The rig starts with local #9 already carrying the wrong candidate G#4;
    # a failed bind must preserve that mapping rather than deleting it.
    assert manager.get_global_id("cam1", 9) == 4
    monkeypatch.setattr(manager, "_bind", original)


def test_active_episode_survives_more_than_64_completed_episodes():
    binder = SlotVehicleBinder()
    binder._open_parking_episode(1, "D01", 1, "test")
    for i in range(2, 100):
        binder._open_parking_episode(i, "E01", i, "test")
        binder._transition_parking_episode("E01", "released", "test")
    assert len(binder.parking_episodes()) == 65
    assert any(e["slot_id"] == "D01" and e["state"] == "parked" for e in binder.parking_episodes())
    binder.remap_vehicle_ids(lambda gid: 1000 if gid == 1 else gid)
    assert binder._episode_by_slot["D01"]["global_id"] == 1000


def test_departure_extends_retention_without_faking_recent_observation():
    manager, binder, track, proof = rig()
    identity = manager._identities[2]
    manager._update_camera_timing({"cam1": 100.0})
    manager.sync_parked_reservations({}, 1000)
    assert identity.last_seen_frame == 1
    assert identity.last_seen_time == 1.0
    assert manager._identity_is_recent(identity, 1001, 100.1)
    assert not manager._identity_is_recent(identity, 1001, 100.1, target_camera="cam1")


def test_expired_provisional_token_does_not_end_an_occupied_parking_episode():
    manager, binder, _, _ = rig()
    token = binder._departure_tokens["D01"]
    token.predeparture = True
    token.confirmed_empty = False
    token.empty_observations = 1  # A rebound can leave evidence before it is reset.
    binder._bindings["D01"].tracking_state = "parked"
    binder._transition_parking_episode("D01", "parked", "false_empty_restored")
    episode_id = binder.parking_episodes()[0]["parking_episode_id"]
    binder._cleanup_tokens(token.expires_at_s + 1)
    assert binder._departure_tokens == {}
    assert binder.get_slot_for_vehicle(2) == "D01"
    assert binder.parking_episodes()[0]["parking_episode_id"] == episode_id
    assert binder.parking_episodes()[0]["state"] == "parked"
    manager.sync_parked_reservations(binder.get_identity_reservations(), 200)
    assert 2 in manager.parked_global_ids


def test_expired_confirmed_departure_releases_episode():
    _, binder, _, _ = rig()
    token = binder._departure_tokens["D01"]
    binder._detach_binding_for_departure(binder._bindings["D01"], token, 10.)
    binder._cleanup_tokens(token.expires_at_s + 1)
    assert binder.parking_episodes()[0]["state"] == "released"
    assert binder.get_slot_for_vehicle(2) is None


def test_tracking_only_episode_has_current_source_evidence_for_session_contract():
    binder = SlotVehicleBinder(policy="vision_primary")
    binder._last_frame_idx = 42
    binder._last_timestamp_s = 3.5
    binder._bindings["D02"] = SlotBinding(
        slot_id="D02",
        camera_id="cam1",
        center=(100, 100),
        vehicle_id=7,
        polygon=np.array([[80, 80], [120, 80], [120, 120], [80, 120]], np.float32),
        vision_occupied=False,
        vision_evidence_frame_idx=None,
        vision_evidence_timestamp_s=None,
    )
    binder._vehicle_to_slot[7] = "D02"
    episode = binder._open_parking_episode(7, "D02", 42, "tracking_stop")
    assert episode["evidence_frame_idx"] == 42
    assert episode["evidence_timestamp_s"] == 3.5
