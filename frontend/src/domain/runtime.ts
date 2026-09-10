export type RuntimeCameraId = "cam1" | "cam2";
export type RuntimeVehicleState = "active" | "handoff" | "dormant" | "parked" | "parking_verification_pending";

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
  pending_parking_confirmations?: PendingParkingConfirmation[];
  parking_pipeline?: Partial<Record<RuntimeCameraId, ParkingPipelineStatus>>;
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

export interface PendingParkingConfirmation {
  global_id: number;
  slot_id: string;
  state: "collecting" | "awaiting_vision" | "insufficient_evidence";
  observations: number;
  max_overlap: number;
  started_at_s: number;
  last_seen_s: number;
  lost_at_s: number | null;
  processing_deadline_s: number | null;
  age_ms: number;
}

export interface ParkingPipelineStatus {
  pending_age_ms?: number;
  accepted_evidence_age_ms?: number | null;
  state: "waiting" | "processing" | "healthy" | "degraded";
  job_id: string | null;
  evidence_frame_idx: number | null;
  applied_frame_idx: number | null;
  result_age_ms: number | null;
  processing_ms: number | null;
  dropped_results: number;
  last_rejection_reason: string | null;
}

/**
 * Validate the immutable parts of the live runtime contract before a
 * consumer renders it or uses it for a user action.  Cursor/frame ordering is
 * deliberately handled by the caller because it is subscription state, not
 * a property of one snapshot.
 */
export function liveRuntimeError(
  runtime: RuntimeSnapshot,
  nowMs: number = Date.now(),
): string | null {
  if (runtime.schema_version !== 2) {
    return "Runtime chưa dùng schema v2";
  }
  if (runtime.source_mode !== "live") {
    return "Nguồn dữ liệu không phải camera realtime";
  }
  const publishedAt = Date.parse(runtime.published_at);
  if (!Number.isFinite(publishedAt) || nowMs - publishedAt < -1000 || nowMs - publishedAt > 5000) {
    return "Dữ liệu camera đã cũ quá 5 giây";
  }
  const cameras = Object.values(runtime.cameras);
  if (cameras.length === 0) {
    return "Runtime chưa công bố camera nào";
  }
  if (cameras.some((camera) => {
    const ageMs = Number(camera.age_ms);
    return !camera.online || !Number.isFinite(ageMs) || ageMs < 0 || ageMs > 5000;
  })) {
    return "Một camera mất kết nối hoặc dữ liệu đã cũ; tạm dừng chỉ dẫn";
  }
  return null;
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
  revision?: number;
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
