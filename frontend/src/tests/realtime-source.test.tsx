import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getRuntimeSnapshot } from "../api/runtimeApi";
import { App } from "../app/App";
import type { RuntimeSnapshot } from "../domain/runtime";
import { useDriverFlowStore } from "../stores/driverFlowStore";
import { useParkingStore } from "../stores/parkingStore";

vi.mock("../api/runtimeApi", () => ({
  getRuntimeSnapshot: vi.fn(),
  getRuntimeGateConfig: vi.fn(async () => null),
}));
vi.mock("../api/backendApi", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../api/backendApi")>();
  return { ...actual, getWaitingSessions: vi.fn(async () => []) };
});

function runtimeSnapshot(sourceMode: "live" | "replay" = "live"): RuntimeSnapshot {
  const now = new Date().toISOString();
  return {
    schema_version: 1,
    timestamp: now,
    published_at: now,
    frame_index: 84,
    source_mode: sourceMode,
    coordinate_space: { unit: "cm", bounds: null },
    camera_skew_ms: 2.4,
    cameras: {
      cam1: { camera_id: "cam1", width: 1280, height: 720, captured_at_monotonic_ns: 1, online: true },
      cam2: { camera_id: "cam2", width: 1280, height: 720, captured_at_monotonic_ns: 2, online: true },
    },
    parking_slots: [
      { slot_id: "A01", camera_id: "cam2", status: "occupied", occupied: true, vehicle_id: 42, decision_source: "vision_and_tracking", tracking_state: "parked", stopped_for_ms: 800 },
      { slot_id: "F01", camera_id: "cam1", status: "empty", occupied: false, vehicle_id: null, decision_source: "vision", tracking_state: "idle", stopped_for_ms: 0 },
    ],
    slot_layout: [
      { slot_id: "A01", camera_id: "cam2", polygon: [[10, 0], [12, 0], [12, 2], [10, 2]] },
      { slot_id: "F01", camera_id: "cam1", polygon: [[0, 0], [2, 0], [2, 2], [0, 2]] },
    ],
    vehicles: [
      { global_id: 42, state: "active", observed: true, camera_ids: ["cam2"], position: { x: 11, y: 1, reference: "cm" }, parked_slot_id: null, last_seen_frame: 84, last_seen_time: 1 },
    ],
    pending_handoffs: [],
    recent_events: [],
  };
}

describe("OpenCV realtime source", () => {
  let requestsWhileOpenCv: string[];

  beforeEach(() => {
    useParkingStore.getState().reset();
    useDriverFlowStore.getState().reset();
    vi.clearAllMocks();
    requestsWhileOpenCv = [];
    vi.mocked(getRuntimeSnapshot).mockResolvedValue(runtimeSnapshot());
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      if (useParkingStore.getState().trackingSource === "opencv") {
        requestsWhileOpenCv.push(String(input));
      }
      return new Response("{}", { status: 404 });
    }));
  });

  afterEach(() => vi.unstubAllGlobals());

  it("uses only a live runtime snapshot after Camera OpenCV is selected", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByTestId("source-opencv"));

    await waitFor(() => expect(useParkingStore.getState().spots.A01?.status).toBe("occupied"));
    expect(getRuntimeSnapshot).toHaveBeenCalled();
    expect(screen.getByTestId("runtime-source-state")).toHaveTextContent("Camera realtime");
    expect(requestsWhileOpenCv).not.toEqual(
      expect.arrayContaining([expect.stringMatching(/parking_status|vehicle_positions/)]),
    );
  });

  it("rejects replay data instead of presenting it as a realtime camera", async () => {
    vi.mocked(getRuntimeSnapshot).mockResolvedValue(runtimeSnapshot("replay"));
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByTestId("source-opencv"));

    expect(await screen.findByRole("alert")).toHaveTextContent("không phải camera realtime");
    expect(screen.getByTestId("runtime-source-state")).toHaveTextContent("Mất kết nối camera");
    expect(useParkingStore.getState().spots.A01?.status).toBe("unknown");
  });
});
