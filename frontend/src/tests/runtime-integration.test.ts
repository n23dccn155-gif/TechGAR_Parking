import { describe, expect, it } from "vitest";
import { runtimeParkingSpots } from "../adapters/runtimeAdapter";
import { createSvgToWorld, createWorldToSvg, runtimeVehiclesOnSvg } from "../calibration/worldToSvg";
import type { RuntimeSlotLayout, RuntimeSnapshot } from "../domain/runtime";
import { SPOT_GEOMETRY_BY_ID } from "../geometry/parkingGeometry";

const slotLayout: RuntimeSlotLayout[] = [
  { slot_id: "F01", camera_id: "cam1", polygon: [[0, 0], [2, 0], [2, 2], [0, 2]] },
  { slot_id: "A01", camera_id: "cam2", polygon: [[10, 0], [12, 0], [12, 2], [10, 2]] },
  { slot_id: "F08", camera_id: "cam1", polygon: [[0, 10], [2, 10], [2, 12], [0, 12]] },
  { slot_id: "A08", camera_id: "cam2", polygon: [[10, 10], [12, 10], [12, 12], [10, 12]] },
];

describe("runtime world-to-SVG integration", () => {
  it("fits matching slot centers instead of scaling camera pixels", () => {
    const project = createWorldToSvg(slotLayout);
    const projected = project({ x: 1, y: 1 });
    const expected = SPOT_GEOMETRY_BY_ID.get("F01")!;
    expect(projected.x).toBeCloseTo(expected.x + expected.width / 2, 4);
    expect(projected.y).toBeCloseTo(expected.y + expected.height / 2, 4);
  });

  it("projects a clicked SVG gate point back into runtime world coordinates", () => {
    const toSvg = createWorldToSvg(slotLayout);
    const toWorld = createSvgToWorld(slotLayout);
    const world = { x: 6, y: 4 };

    expect(toWorld).not.toBeNull();
    expect(toWorld!(toSvg(world)).x).toBeCloseTo(world.x, 6);
    expect(toWorld!(toSvg(world)).y).toBeCloseTo(world.y, 6);
  });

  it("filters customer markers by Global ID", () => {
    const snapshot: RuntimeSnapshot = {
      schema_version: 1,
      timestamp: "2026-08-23T10:00:00+07:00",
      published_at: "2026-08-23T10:00:01+07:00",
      frame_index: 10,
      source_mode: "replay",
      coordinate_space: { unit: "cm", bounds: null },
      camera_skew_ms: 2,
      cameras: {},
      parking_slots: [],
      slot_layout: slotLayout,
      pending_handoffs: [],
      recent_events: [],
      vehicles: [
        { global_id: 1, state: "active", observed: true, camera_ids: ["cam1"], position: { x: 1, y: 1, reference: "cm" }, parked_slot_id: null, last_seen_frame: 10, last_seen_time: 1 },
        { global_id: 2, state: "active", observed: true, camera_ids: ["cam2"], position: { x: 11, y: 1, reference: "cm" }, parked_slot_id: null, last_seen_frame: 10, last_seen_time: 1 },
      ],
    };
    expect(runtimeVehiclesOnSvg(snapshot, 2).map((vehicle) => vehicle.trackId)).toEqual([2]);
  });

  it("keeps runtime slot identity and dwell metadata for navigation decisions", () => {
    const snapshot: RuntimeSnapshot = {
      schema_version: 1,
      timestamp: "2026-08-23T10:00:00+07:00",
      published_at: "2026-08-23T10:00:01+07:00",
      frame_index: 12,
      source_mode: "live",
      coordinate_space: { unit: "cm", bounds: null },
      camera_skew_ms: 2,
      cameras: {},
      slot_layout: slotLayout,
      pending_handoffs: [],
      recent_events: [],
      vehicles: [],
      parking_slots: [{
        slot_id: "A01",
        camera_id: "cam2",
        status: "occupied",
        occupied: true,
        vehicle_id: 42,
        decision_source: "vision_and_tracking",
        tracking_state: "parked",
        stopped_for_ms: 2100,
      }],
    };

    expect(runtimeParkingSpots(snapshot).find((spot) => spot.id === "A01")).toMatchObject({
      status: "occupied",
      vehicleId: 42,
      trackingState: "parked",
      stoppedForMs: 2100,
      decisionSource: "vision_and_tracking",
    });
  });
});
