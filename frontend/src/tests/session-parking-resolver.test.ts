import { describe, expect, it } from "vitest";
import type { VehicleSession } from "../domain/session";
import type { RuntimeSlot } from "../domain/runtime";
import { resolveSessionParking, type SessionParkingDecision } from "../domain/sessionParking";

const DWELL_MS = 2000;

function baseSession(overrides: Partial<VehicleSession> = {}): VehicleSession {
  return {
    sessionId: "s1",
    state: "NAVIGATING_TO_SPOT",
    globalVehicleId: 42,
    runtimeId: "r1",
    vehicleTrackId: 1,
    activeTrackId: 1,
    targetSpotId: "D06",
    parkedSpotId: null,
    claimed: true,
    lastKnownPosition: null,
    createdAt: "2026-08-26T00:00:00Z",
    updatedAt: "2026-08-26T00:00:00Z",
    revision: 3,
    qrExpiresAt: "2026-08-26T00:00:10Z",
    claimedAt: "2026-08-26T00:00:00Z",
    spotSelectedAt: "2026-08-26T00:00:01Z",
    parkedAt: null,
    exitStartedAt: null,
    ...overrides,
  };
}

function targetEmpty(): RuntimeSlot {
  return {
    slot_id: "D06",
    camera_id: "cam1",
    status: "empty",
    occupied: false,
    vehicle_id: null,
    decision_source: "vision",
    tracking_state: "moving",
    stopped_for_ms: 0,
  };
}

function targetOccupied(
  vehicleId: number | null,
  trackingState: string,
  stoppedForMs: number,
): RuntimeSlot {
  return {
    slot_id: "D06",
    camera_id: "cam1",
    status: "occupied",
    occupied: true,
    vehicle_id: vehicleId,
    decision_source: "vision",
    tracking_state: trackingState,
    stopped_for_ms: stoppedForMs,
  };
}

describe("sessionParking resolver", () => {
  it("guides when target empty", () => {
    const decision = resolveSessionParking({
      session: baseSession(),
      vehicles: [],
      slots: [targetEmpty()],
      dwellThresholdMs: DWELL_MS,
    });
    expect(decision).toEqual<SessionParkingDecision>({
      kind: "guiding",
      targetSpotId: "D06",
    });
  });

  it("identity_pending when target red with no vehicle_id for 2 seconds", () => {
    const decision = resolveSessionParking({
      session: baseSession(),
      vehicles: [],
      slots: [targetOccupied(null, "moving", 0)],
      dwellThresholdMs: DWELL_MS,
    });
    expect(decision).toEqual<SessionParkingDecision>({
      kind: "identity_pending",
      spotId: "D06",
      reason: "no_vehicle_id",
    });
  });

  it("identity_pending when target red with no vehicle_id for 5 seconds", () => {
    const decision = resolveSessionParking({
      session: baseSession(),
      vehicles: [],
      slots: [targetOccupied(null, "parked", 5000)],
      dwellThresholdMs: DWELL_MS,
    });
    expect(decision).toEqual<SessionParkingDecision>({
      kind: "identity_pending",
      spotId: "D06",
      reason: "no_vehicle_id",
    });
  });

  it("parking_confirmation_pending when own GID accumulating dwell", () => {
    const decision = resolveSessionParking({
      session: baseSession(),
      vehicles: [],
      slots: [targetOccupied(42, "parked", 1500)],
      dwellThresholdMs: DWELL_MS,
    });
    expect(decision).toEqual<SessionParkingDecision>({
      kind: "parking_confirmation_pending",
      actualSpotId: "D06",
    });
  });

  it("no other warning when own GID fully confirmed", () => {
    const decision = resolveSessionParking({
      session: baseSession(),
      vehicles: [],
      slots: [targetOccupied(42, "parked", 3000)],
      dwellThresholdMs: DWELL_MS,
    });
    expect(decision.kind).toBe("parking_confirmation_pending");
  });

  it("identity_pending when different vehicle not parked yet", () => {
    const decision = resolveSessionParking({
      session: baseSession(),
      vehicles: [],
      slots: [targetOccupied(99, "moving", 500)],
      dwellThresholdMs: DWELL_MS,
    });
    expect(decision).toEqual<SessionParkingDecision>({
      kind: "identity_pending",
      spotId: "D06",
      reason: "other_unconfirmed",
    });
  });

  it("target_occupied_by_other when different vehicle parked long enough", () => {
    const decision = resolveSessionParking({
      session: baseSession(),
      vehicles: [],
      slots: [targetOccupied(99, "parked", 2500)],
      dwellThresholdMs: DWELL_MS,
    });
    expect(decision).toEqual<SessionParkingDecision>({
      kind: "target_occupied_by_other",
      spotId: "D06",
      otherVehicleId: 99,
    });
  });

  it("parking_confirmation_pending/D05 when own GID in D05 while target D06", () => {
    const d05: RuntimeSlot = {
      slot_id: "D05",
      camera_id: "cam1",
      status: "occupied",
      occupied: true,
      vehicle_id: 42,
      decision_source: "vision",
      tracking_state: "parked",
      stopped_for_ms: 2500,
    };
    const decision = resolveSessionParking({
      session: baseSession(),
      vehicles: [{
        global_id: 42,
        state: "parked",
        observed: true,
        camera_ids: ["cam1"],
        position: { x: 0, y: 0, reference: "bbox_center" },
        parked_slot_id: "D05",
        last_seen_frame: 100,
        last_seen_time: 100,
      }],
      slots: [targetEmpty(), d05],
      dwellThresholdMs: DWELL_MS,
    });
    expect(decision).toEqual<SessionParkingDecision>({
      kind: "parking_confirmation_pending",
      actualSpotId: "D05",
    });
  });

  it("parked/D05 when session is PARKED with parkedSpotId D05", () => {
    const decision = resolveSessionParking({
      session: baseSession({
        state: "PARKED",
        parkedSpotId: "D05",
        targetSpotId: "D06",
        parkedAt: "2026-08-26T00:01:00Z",
      }),
      vehicles: [],
      slots: [targetEmpty()],
      dwellThresholdMs: DWELL_MS,
    });
    expect(decision.kind).toBe("parked");
    if (decision.kind === "parked") {
      expect(decision.actualSpotId).toBe("D05");
      expect(decision.completionKey).toBe("s1:D05:2026-08-26T00:01:00Z");
    }
  });

  it("exit_navigation overrides inbound logic when runtime still shows parked", () => {
    const decision = resolveSessionParking({
      session: baseSession({
        state: "EXIT_NAVIGATION",
        parkedSpotId: "D05",
        exitStartedAt: "2026-08-26T00:02:00Z",
      }),
      vehicles: [{
        global_id: 42,
        state: "parked",
        observed: true,
        camera_ids: ["cam1"],
        position: { x: 0, y: 0, reference: "bbox_center" },
        parked_slot_id: "D05",
        last_seen_frame: 100,
        last_seen_time: 100,
      }],
      slots: [targetOccupied(42, "parked", 5000)],
      dwellThresholdMs: DWELL_MS,
    });
    expect(decision).toEqual<SessionParkingDecision>({
      kind: "exit_navigation",
      originSpotId: "D05",
    });
  });

  it("identity_invariant_error when same GID in two slots", () => {
    const d05: RuntimeSlot = {
      slot_id: "D05",
      camera_id: "cam1",
      status: "occupied",
      occupied: true,
      vehicle_id: 42,
      decision_source: "vision",
      tracking_state: "parked",
      stopped_for_ms: 2500,
    };
    const d07: RuntimeSlot = {
      slot_id: "D07",
      camera_id: "cam1",
      status: "occupied",
      occupied: true,
      vehicle_id: 42,
      decision_source: "vision",
      tracking_state: "parked",
      stopped_for_ms: 2500,
    };
    const decision = resolveSessionParking({
      session: baseSession(),
      vehicles: [],
      slots: [d05, d07],
      dwellThresholdMs: DWELL_MS,
    });
    expect(decision.kind).toBe("identity_invariant_error");
    if (decision.kind === "identity_invariant_error") {
      expect(decision.spotIds.sort()).toEqual(["D05", "D07"]);
    }
  });
});
