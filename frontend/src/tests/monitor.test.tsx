import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getRuntimeGateConfig, getRuntimeSnapshot, saveRuntimeGateConfig } from "../api/runtimeApi";
import { MonitorApp } from "../app/MonitorApp";
import type { RuntimeGateConfig, RuntimeSnapshot } from "../domain/runtime";

const snapshot: RuntimeSnapshot = {
  schema_version: 1,
  timestamp: "2026-08-23T10:00:00+07:00",
  published_at: new Date().toISOString(),
  frame_index: 42,
  source_mode: "live",
  coordinate_space: { unit: "cm", bounds: null },
  camera_skew_ms: 3.2,
  cameras: {
    cam1: { camera_id: "cam1", width: 1280, height: 720, captured_at_monotonic_ns: 1, online: true },
    cam2: { camera_id: "cam2", width: 1280, height: 720, captured_at_monotonic_ns: 2, online: true },
  },
  parking_slots: [
    { slot_id: "F01", camera_id: "cam1", status: "empty", occupied: false, vehicle_id: null, decision_source: "vision", tracking_state: "idle", stopped_for_ms: 0 },
    { slot_id: "A01", camera_id: "cam2", status: "occupied", occupied: true, vehicle_id: 7, decision_source: "vision_and_tracking", tracking_state: "parked", stopped_for_ms: 900 },
  ],
  slot_layout: [
    { slot_id: "F01", camera_id: "cam1", polygon: [[0, 0], [2, 0], [2, 2], [0, 2]] },
    { slot_id: "A01", camera_id: "cam2", polygon: [[10, 0], [12, 0], [12, 2], [10, 2]] },
    { slot_id: "F08", camera_id: "cam1", polygon: [[0, 10], [2, 10], [2, 12], [0, 12]] },
  ],
  vehicles: [
    { global_id: 7, state: "active", observed: true, camera_ids: ["cam2"], position: { x: 11, y: 1, reference: "cm" }, parked_slot_id: null, last_seen_frame: 42, last_seen_time: 1 },
  ],
  pending_handoffs: [],
  recent_events: [{ event: "global_id_created", frame_idx: 42, global_id: 7, camera: "cam2" }],
};

vi.mock("../api/runtimeApi", () => ({
  getRuntimeSnapshot: vi.fn(async () => snapshot),
  getRuntimeGateConfig: vi.fn(async () => null),
  saveRuntimeGateConfig: vi.fn(async (config: RuntimeGateConfig) => config),
  runtimeCameraStreamUrl: (cameraId: string) => `/api/runtime/cameras/${cameraId}.mjpg`,
}));

describe("admin monitor", () => {
  beforeEach(() => {
    snapshot.published_at = new Date().toISOString();
    vi.mocked(getRuntimeSnapshot).mockResolvedValue(snapshot);
    vi.mocked(getRuntimeGateConfig).mockResolvedValue(null);
    vi.mocked(saveRuntimeGateConfig).mockImplementation(async (config) => config);
  });

  it("shows all Global IDs and both live camera panels", async () => {
    const user = userEvent.setup();
    render(<MonitorApp />);
    const vehicle = await screen.findByRole("button", { name: "Xe Global ID 7" });
    expect(screen.getByAltText("Khung hình có nhận diện từ cam1")).toHaveAttribute("src", "/api/runtime/cameras/cam1.mjpg");
    expect(screen.getByAltText("Khung hình có nhận diện từ cam2")).toHaveAttribute("src", "/api/runtime/cameras/cam2.mjpg");
    await user.click(vehicle);
    expect(screen.getByText("G#7")).toBeVisible();
  });

  it("does not open camera streams before the runtime API is available", async () => {
    vi.mocked(getRuntimeSnapshot).mockRejectedValue(new TypeError("Failed to fetch"));
    render(<MonitorApp />);

    expect(await screen.findByText(/Failed to fetch/)).toBeVisible();
    expect(screen.queryByAltText(/cam1$/)).not.toBeInTheDocument();
    expect(screen.queryByAltText(/cam2$/)).not.toBeInTheDocument();
  });

  it("draws both gates on the shared map and saves world coordinates", async () => {
    const user = userEvent.setup();
    render(<MonitorApp />);
    await screen.findByText("FRAME 42");
    await user.click(screen.getByRole("button", { name: "Cấu hình cổng" }));

    const map = screen.getByRole("img", { name: /Bản đồ 48 ô/ });
    vi.spyOn(map, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 1200,
      bottom: 900,
      width: 1200,
      height: 900,
      toJSON: () => ({}),
    });
    for (const [clientX, clientY] of [[1020, 790], [1140, 790], [1080, 740], [1020, 90], [1140, 90], [1080, 140]]) {
      fireEvent.click(map, { clientX, clientY });
    }

    await user.click(screen.getByRole("button", { name: "Lưu cổng" }));

    expect(saveRuntimeGateConfig).toHaveBeenCalledWith(expect.objectContaining({
      coordinate_space: "world",
      unit: "cm",
      entry_gate: expect.objectContaining({ direction: expect.stringMatching(/positive|negative/) }),
      exit_gate: expect.objectContaining({ direction: expect.stringMatching(/positive|negative/) }),
    }));
    expect(await screen.findByText(/Đã lưu gate_zones\.json/)).toBeVisible();
  });
});
