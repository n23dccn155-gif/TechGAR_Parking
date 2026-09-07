export type RuntimeCameraId = "cam1" | "cam2";
export type RuntimeVehicleState = "active" | "handoff" | "dormant" | "parked";

export interface RuntimePoint {
  x: number;
  y: number;
}

export interface RuntimeCamera {
  camera_id: RuntimeCameraId;
  width: number;
  height: number;
  captured_at_monotonic_ns: number;
  online: boolean;
  age_ms?: number;
}

export interface RuntimeSlot {
  slot_id: string;
  camera_id: RuntimeCameraId;
  status: "empty" | "occupied";
  occupied: boolean;
  vehicle_id: number | null;
  decision_source: string;
  tracking_state: string;
  stopped_for_ms: number;
  evidence_frame_idx?: number | null;
  applied_frame_idx?: number | null;
}

export interface RuntimeSlotLayout {
  slot_id: string;
  camera_id: RuntimeCameraId;
  polygon: Array<[number, number]>;
}

export interface RuntimeVehicle {
  global_id: number;
  state: RuntimeVehicleState;
  observed: boolean;
  camera_ids: RuntimeCameraId[];
  position: RuntimePoint & { reference: string };
  parked_slot_id: string | null;
  last_seen_frame: number | null;
  last_seen_time: number | null;
}

export interface RuntimeEvent {
  event?: string;
  type?: string;
  frame_idx?: number;
  global_id?: number;
  camera?: RuntimeCameraId;
  source_camera?: RuntimeCameraId;
  target_camera?: RuntimeCameraId;
  slot_id?: string;
  [key: string]: unknown;
}

export interface RuntimeSnapshot {
  parking_episodes?: ParkingEpisode[];
  schema_version: number;
  runtime_id?: string;
  timestamp: string;
  published_at: string;
  frame_index: number;
  source_mode: "live" | "replay";
  coordinate_space: {
    unit: string;
    bounds: Record<string, number> | null;
  };
  camera_skew_ms: number;
  cameras: Partial<Record<RuntimeCameraId, RuntimeCamera>>;
  parking_slots: RuntimeSlot[];
  slot_layout: RuntimeSlotLayout[];
  vehicles: RuntimeVehicle[];
  pending_handoffs: RuntimeEvent[];
  retired_global_ids?: Record<string, number>;
  recent_events: RuntimeEvent[];
}

export type GateDirection = "positive" | "negative";

export interface RuntimeGateLine {
  name: string;
  p1: RuntimePoint;
  p2: RuntimePoint;
  direction: GateDirection;
}

export interface RuntimeGateConfig {
  schema_version: number;
  coordinate_space: "world";
  unit: string;
  source?: string;
  entry_gate: RuntimeGateLine;
  exit_gate: RuntimeGateLine;
}

export interface ActiveVehicle {
  observed?: boolean;
  trackId: number;
  x: number;
  y: number;
  trail: RuntimePoint[];
  state?: RuntimeVehicleState;
  cameraIds?: RuntimeCameraId[];
  parkedSlotId?: string | null;
}

export interface FrameSize {
  width: number;
  height: number;
}

export interface ParkingEpisode {
  parking_episode_id: string;
  global_id: number;
  slot_id: string;
  state: "pending" | "parked" | "departing" | "released";
  evidence_frame_idx: number | null;
  evidence_timestamp_s: number | null;
  applied_frame_idx: number;
  applied_timestamp_s: number;
  reason: string;
}

/** Follow the runtime's durable aliases only; proximity is never identity. */
export function canonicalRuntimeId(gid: number, aliases: Record<string, number> = {}): number | null {
  const visited = new Set<number>();
  while (Object.hasOwn(aliases, String(gid))) {
    if (visited.has(gid)) return null;
    visited.add(gid);
    const next = aliases[String(gid)];
    if (next === undefined || !Number.isSafeInteger(next) || next < 0) return null;
    if (next === gid) return gid;
    gid = next;
  }
  return gid;
}
