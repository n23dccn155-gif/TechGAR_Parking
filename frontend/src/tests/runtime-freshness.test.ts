import { describe, expect, it } from "vitest";
import { liveRuntimeError, type RuntimeSnapshot } from "../domain/runtime";

function snapshot(overrides: Partial<RuntimeSnapshot> = {}): RuntimeSnapshot {
  const published = new Date(1_700_000_000_000).toISOString();
  return {
    schema_version: 2,
    runtime_id: "run-1",
    timestamp: published,
    published_at: published,
    frame_index: 10,
    source_mode: "live",
    coordinate_space: { unit: "cm", bounds: null },
    camera_skew_ms: 0,
    cameras: {
      cam1: {
        camera_id: "cam1",
        width: 1280,
        height: 720,
        captured_at_monotonic_ns: 1,
        online: true,
        age_ms: 10,
      },
    },
    parking_slots: [],
    slot_layout: [{ slot_id: "D01", camera_id: "cam1", polygon: [] }],
    vehicles: [],
    pending_handoffs: [],
    recent_events: [],
    ...overrides,
  };
}

describe("runtime freshness contract", () => {
  const now = 1_700_000_000_000;

  it("accepts a current schema-v2 live snapshot", () => {
    expect(liveRuntimeError(snapshot(), now)).toBeNull();
  });

  it("rejects legacy schema, replay, missing cameras and stale camera data", () => {
    expect(liveRuntimeError(snapshot({ schema_version: 1 }), now)).toContain("schema v2");
    expect(liveRuntimeError(snapshot({ source_mode: "replay" }), now)).toContain("realtime");
    expect(liveRuntimeError(snapshot({ cameras: {} }), now)).toContain("camera nào");
    expect(liveRuntimeError(snapshot({ cameras: {
      cam1: { ...snapshot().cameras.cam1!, age_ms: 5001 },
    } }), now)).toContain("dữ liệu đã cũ");
    expect(liveRuntimeError(snapshot({ cameras: {
      cam1: { ...snapshot().cameras.cam1!, age_ms: -1 },
    } }), now)).toContain("dữ liệu đã cũ");
    expect(liveRuntimeError(snapshot({ cameras: {
      cam1: { ...snapshot().cameras.cam1!, age_ms: Number.NaN },
    } }), now)).toContain("dữ liệu đã cũ");
  });

});
