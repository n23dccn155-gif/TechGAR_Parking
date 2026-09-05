"""Debug script to trace GID lifecycle when vehicle exits slot."""

import json
import sys
from pathlib import Path

# Monkey-patch slot_vehicle_binder to add debug prints
sys.path.insert(0, str(Path(__file__).parent / "src"))

from techgar.slot_vehicle_binder import SlotVehicleBinder
from techgar.cross_camera_manager import CrossCameraManager

# Store original methods
orig_bind_vehicle = SlotVehicleBinder._bind_vehicle
orig_release_vehicle = SlotVehicleBinder._release_vehicle

def debug_bind_vehicle(self, global_id, slot_id, frame_idx, overlap, stopped_ms):
    print(f"[DEBUG] _bind_vehicle: GID #{global_id} -> slot {slot_id}, overlap={overlap:.2f}, stopped={stopped_ms}ms")
    return orig_bind_vehicle(self, global_id, slot_id, frame_idx, overlap, stopped_ms)

def debug_release_vehicle(self, global_id, frame_idx, reason):
    slot_id = self._vehicle_to_slot.get(global_id)
    binding = self._bindings.get(slot_id) if slot_id else None
    vision_occ = binding.vision_occupied if binding else None
    print(f"[DEBUG] _release_vehicle: GID #{global_id} <- slot {slot_id}, reason={reason}, vision_occupied={vision_occ}")
    result = orig_release_vehicle(self, global_id, frame_idx, reason)
    new_binding = self._bindings.get(slot_id) if slot_id else None
    if new_binding:
        print(f"[DEBUG]   After: vehicle_id={new_binding.vehicle_id}, vision_occupied={new_binding.vision_occupied}")
    return result

SlotVehicleBinder._bind_vehicle = debug_bind_vehicle
SlotVehicleBinder._release_vehicle = debug_release_vehicle

# Patch cross_camera_manager to track GID state
orig_set_state = CrossCameraManager._set_state

def debug_set_state(self, global_id, state, frame_idx, camera_id=None, local_track_id=None, **kwargs):
    print(f"[DEBUG] GID #{global_id} state: {state} (camera={camera_id}, local={local_track_id})")
    return orig_set_state(self, global_id, state, frame_idx, camera_id, local_track_id, **kwargs)

CrossCameraManager._set_state = debug_set_state

print("[DEBUG] Patches applied. Run runtime_server.py with DROIDCAM URLs")
print("[DEBUG] Looking for: vehicle_id=None after release, or GID expired")
