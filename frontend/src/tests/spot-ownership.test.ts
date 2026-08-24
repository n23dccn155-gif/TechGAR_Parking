import { describe, expect, it } from "vitest";
import {
  classifySpotOccupancy,
  type ParkingSpotState,
} from "../domain/parking";

const occupiedSpot: ParkingSpotState = {
  id: "A01",
  zone: "A",
  number: 1,
  row: "left",
  owner: "cam-right",
  status: "occupied",
  confidence: 0.99,
  revision: 10,
  updatedAt: "2026-08-23T10:00:00+07:00",
  vehicleId: 42,
  trackingState: "parked",
  stoppedForMs: 2100,
  decisionSource: "vision_and_tracking",
};

describe("spot occupancy ownership", () => {
  it("distinguishes the session vehicle from another vehicle", () => {
    expect(classifySpotOccupancy(occupiedSpot, 42, null)).toBe("own");
    expect(classifySpotOccupancy(occupiedSpot, 99, null)).toBe("other");
  });

  it("treats a session parked-slot match as own even before slot identity resolves", () => {
    expect(classifySpotOccupancy({ ...occupiedSpot, vehicleId: null }, 42, "A01")).toBe("own");
  });

  it("does not call unresolved occupied vision another vehicle", () => {
    expect(classifySpotOccupancy({ ...occupiedSpot, vehicleId: null }, 42, null)).toBe("unknown");
    expect(classifySpotOccupancy({ ...occupiedSpot, status: "empty", vehicleId: null }, 42, null)).toBe("empty");
  });
});
