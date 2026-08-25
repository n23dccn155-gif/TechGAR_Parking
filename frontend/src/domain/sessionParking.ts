import type { VehicleSession, VehicleSessionState } from "./session";
import { buildSessionCompletionKey } from "./session";
import type { RuntimeSlot, RuntimeVehicle } from "./runtime";

export type SessionParkingDecision =
  | { kind: "guiding"; targetSpotId: string }
  | { kind: "identity_pending"; spotId: string; reason: "no_vehicle_id" | "other_unconfirmed" }
  | { kind: "parking_confirmation_pending"; actualSpotId: string }
  | { kind: "parked"; actualSpotId: string; completionKey: string }
  | { kind: "target_occupied_by_other"; spotId: string; otherVehicleId: number }
  | { kind: "runtime_unavailable"; targetSpotId: string | null; reason: string }
  | { kind: "exit_navigation"; originSpotId: string | null }
  | { kind: "identity_invariant_error"; reason: string; spotIds: string[] }
  | { kind: "no_target"; state: VehicleSessionState };

export interface ResolveInput {
  session: VehicleSession;
  vehicles: RuntimeVehicle[];
  slots: RuntimeSlot[];
  dwellThresholdMs: number;
}

export function resolveSessionParking(input: ResolveInput): SessionParkingDecision {
  const { session, vehicles, slots, dwellThresholdMs } = input;
  const ownGid = session.globalVehicleId;
  const targetSpotId = session.targetSpotId;
  const parkedSpotId = session.parkedSpotId;

  if (session.state === "EXIT_NAVIGATION") {
    return { kind: "exit_navigation", originSpotId: parkedSpotId };
  }

  if (session.state === "PARKED" && parkedSpotId) {
    const completionKey = buildSessionCompletionKey(session);
    if (completionKey && session.parkedAt) {
      return { kind: "parked", actualSpotId: parkedSpotId, completionKey };
    }
  }

  const ownSpots = collectOwnSpots(ownGid, vehicles, slots, dwellThresholdMs);
  if (ownSpots.length > 1) {
    return {
      kind: "identity_invariant_error",
      reason: "same_global_id_in_multiple_slots",
      spotIds: ownSpots,
    };
  }
  if (ownSpots.length === 1) {
    return { kind: "parking_confirmation_pending", actualSpotId: ownSpots[0]! };
  }

  if (!targetSpotId) {
    return { kind: "no_target", state: session.state };
  }

  const targetSlot = slots.find((s) => s.slot_id === targetSpotId);
  if (!targetSlot) {
    return {
      kind: "runtime_unavailable",
      targetSpotId,
      reason: "target_slot_not_in_runtime",
    };
  }

  if (targetSlot.status === "empty") {
    return { kind: "guiding", targetSpotId };
  }

  if (targetSlot.vehicle_id == null) {
    return { kind: "identity_pending", spotId: targetSpotId, reason: "no_vehicle_id" };
  }

  if (targetSlot.vehicle_id === ownGid) {
    return { kind: "parking_confirmation_pending", actualSpotId: targetSpotId };
  }

  if (isConfirmedParked(targetSlot, dwellThresholdMs)) {
    return {
      kind: "target_occupied_by_other",
      spotId: targetSpotId,
      otherVehicleId: targetSlot.vehicle_id,
    };
  }

  return { kind: "identity_pending", spotId: targetSpotId, reason: "other_unconfirmed" };
}

function collectOwnSpots(
  ownGid: number,
  vehicles: RuntimeVehicle[],
  slots: RuntimeSlot[],
  dwellThresholdMs: number,
): string[] {
  const spots = new Set<string>();
  for (const v of vehicles) {
    if (v.global_id === ownGid && v.parked_slot_id) {
      spots.add(v.parked_slot_id);
    }
  }
  for (const s of slots) {
    if (s.vehicle_id === ownGid && isConfirmedParked(s, dwellThresholdMs)) {
      spots.add(s.slot_id);
    }
  }
  return Array.from(spots).sort();
}

function isConfirmedParked(slot: RuntimeSlot, dwellThresholdMs: number): boolean {
  return (
    slot.tracking_state === "parked" &&
    slot.stopped_for_ms >= dwellThresholdMs
  );
}
