import type { CameraId, CameraState, ParkingSpotState, ParkingStatus, SpotId } from "../domain/parking";
import { getSpotOwner } from "../domain/parking";
import type { RuntimeCameraId, RuntimeSnapshot } from "../domain/runtime";
import { PARKING_GEOMETRY } from "../geometry/parkingGeometry";

const CAMERA_DOMAIN_ID: Record<RuntimeCameraId, CameraId> = {
  cam1: "cam-left",
  cam2: "cam-right",
};

export function runtimeCameraStates(snapshot: RuntimeSnapshot): Record<CameraId, CameraState> {
  const updatedAt = snapshot.published_at;
  return {
    "cam-left": {
      cameraId: "cam-left",
      health: snapshot.cameras.cam1?.online ? "online" : "offline",
      updatedAt,
    },
    "cam-right": {
      cameraId: "cam-right",
      health: snapshot.cameras.cam2?.online ? "online" : "offline",
      updatedAt,
    },
  };
}

export function runtimeParkingSpots(snapshot: RuntimeSnapshot): ParkingSpotState[] {
  const byId = new Map(snapshot.parking_slots.map((slot) => [slot.slot_id, slot]));
  return PARKING_GEOMETRY.spots.map((geometry) => {
    const runtime = byId.get(geometry.id);
    const owner = runtime ? CAMERA_DOMAIN_ID[runtime.camera_id] : getSpotOwner(geometry.id);
    const status: ParkingStatus = runtime?.status === "occupied" ? "occupied" : runtime ? "empty" : "unknown";
    return {
      id: geometry.id as SpotId,
      zone: geometry.zone,
      number: geometry.number,
      row: geometry.row,
      owner,
      status,
      confidence: runtime ? 0.99 : 0,
      revision: snapshot.frame_index,
      updatedAt: snapshot.timestamp,
      vehicleId: runtime?.vehicle_id ?? null,
      decisionSource: runtime?.decision_source,
      trackingState: runtime?.tracking_state,
      stoppedForMs: runtime?.stopped_for_ms ?? 0,
    };
  });
}
