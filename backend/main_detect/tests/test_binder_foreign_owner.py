"""1113: a GID parked in slot S on cam2 must not be re-claimed by cam1's binder
for the same slot id (core2/core2l reservation flicker, ~490 rebinds/car)."""
import numpy as np
import pytest

from techgar.slot_vehicle_binder import SlotBinding, SlotVehicleBinder, VehicleParkingState


def _binder(camera_id: str) -> SlotVehicleBinder:
    binder = SlotVehicleBinder(policy="vision_primary")
    binder._bindings["S099"] = SlotBinding(
        slot_id="S099", camera_id=camera_id, center=(100, 100),
        polygon=np.array([[80, 80], [120, 80], [120, 120], [80, 120]], np.float32),
        vision_occupied=True,
    )
    binder._vehicle_states[19] = VehicleParkingState(global_id=19)
    return binder


ACCEPTED_CAM2 = {19: {"global_id": 19, "slot_id": "S099", "camera_id": "cam2", "state": "parked"}}


@pytest.mark.parametrize("defer, expect_bound", [(True, False), (False, True)])
def test_foreign_owner_blocks_same_slot_rebind(defer, expect_bound):
    binder = _binder("cam1")
    binder.defer_to_foreign_owner = defer
    binder.reconcile_identity_reservations(ACCEPTED_CAM2, frame_idx=60)
    binder._bind_vehicle(19, "S099", 61, 0.9, 1159)
    assert (binder._bindings["S099"].vehicle_id == 19) is expect_bound
    assert (binder._vehicle_to_slot.get(19) == "S099") is expect_bound


def test_foreign_owner_does_not_block_other_slot_or_own_camera():
    binder = _binder("cam1")
    binder.defer_to_foreign_owner = True
    binder._bindings["S100"] = SlotBinding(
        slot_id="S100", camera_id="cam1", center=(200, 100),
        polygon=np.array([[180, 80], [220, 80], [220, 120], [180, 120]], np.float32),
        vision_occupied=True,
    )
    binder.reconcile_identity_reservations(ACCEPTED_CAM2, frame_idx=60)
    binder._bind_vehicle(19, "S100", 61, 0.9, 1159)  # different slot: allowed
    assert binder._bindings["S100"].vehicle_id == 19

    own = _binder("cam2")
    own.defer_to_foreign_owner = True
    own.reconcile_identity_reservations(ACCEPTED_CAM2, frame_idx=60)
    own._bind_vehicle(19, "S099", 61, 0.9, 1159)  # owner camera itself: allowed
    assert own._bindings["S099"].vehicle_id == 19
