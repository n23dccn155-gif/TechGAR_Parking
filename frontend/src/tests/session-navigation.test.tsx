import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../app/App";
import { BackendApiError } from "../api/backendApi";
import type { RuntimeSnapshot } from "../domain/runtime";
import type { VehicleSession } from "../domain/session";
import { useDriverFlowStore } from "../stores/driverFlowStore";
import { useParkingStore } from "../stores/parkingStore";
import { LANE_GRAPH } from "../routing/laneGraph";

const runtimeMocks = vi.hoisted(() => ({
  getRuntimeSnapshot: vi.fn(),
  getRuntimeGateConfig: vi.fn(async () => null),
}));

const backendMocks = vi.hoisted(() => ({
  claimSession: vi.fn(),
  getSession: vi.fn(),
  selectSpot: vi.fn(),
  startExit: vi.fn(),
}));

vi.mock("../api/runtimeApi", () => runtimeMocks);
vi.mock("../api/backendApi", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../api/backendApi")>();
  return { ...actual, ...backendMocks };
});

function session(overrides: Partial<VehicleSession> = {}): VehicleSession {
  return {
    sessionId: "session-42",
    state: "NAVIGATING_TO_SPOT",
    globalVehicleId: 42,
    vehicleTrackId: null,
    activeTrackId: null,
    targetSpotId: "A01",
    parkedSpotId: null,
    claimed: true,
    lastKnownPosition: { x: 997, y: 858 },
    createdAt: "2026-08-23T10:00:00+07:00",
    updatedAt: "2026-08-23T10:00:00+07:00",
    revision: 3,
    qrExpiresAt: "2026-08-23T10:00:10+07:00",
    claimedAt: "2026-08-23T10:00:01+07:00",
    spotSelectedAt: "2026-08-23T10:00:02+07:00",
    parkedAt: null,
    exitStartedAt: null,
    ...overrides,
  };
}

function runtimeSnapshot(options: {
  targetVehicleId: number | null;
  targetOccupied?: boolean;
  parkedSpotId?: string | null;
}): RuntimeSnapshot {
  const now = new Date().toISOString();
  const ownParkedAtA02 = options.parkedSpotId === "A02";
  const targetOccupied = options.targetOccupied ?? options.targetVehicleId != null;
  return {
    schema_version: 2,
    timestamp: now,
    published_at: now,
    frame_index: Date.now(),
    source_mode: "live",
    coordinate_space: { unit: "cm", bounds: null },
    camera_skew_ms: 1,
    cameras: {
      cam1: { camera_id: "cam1", width: 1280, height: 720, captured_at_monotonic_ns: 1, online: true, age_ms: 10 },
      cam2: { camera_id: "cam2", width: 1280, height: 720, captured_at_monotonic_ns: 2, online: true, age_ms: 10 },
    },
    parking_slots: [
      {
        slot_id: "A01",
        camera_id: "cam2",
        status: targetOccupied ? "occupied" : "empty",
        occupied: targetOccupied,
        vehicle_id: options.targetVehicleId,
        decision_source: targetOccupied ? "vision" : "none",
        tracking_state: options.targetVehicleId == null ? "moving" : "parked",
        stopped_for_ms: options.targetVehicleId == null ? 0 : 2200,
      },
      {
        slot_id: "A02",
        camera_id: "cam2",
        status: ownParkedAtA02 ? "occupied" : "empty",
        occupied: ownParkedAtA02,
        vehicle_id: ownParkedAtA02 ? 42 : null,
        decision_source: ownParkedAtA02 ? "vision_and_tracking" : "none",
        tracking_state: ownParkedAtA02 ? "parked" : "moving",
        stopped_for_ms: ownParkedAtA02 ? 2200 : 0,
      },
    ],
    slot_layout: [
      { slot_id: "A01", camera_id: "cam2", polygon: [[10, 0], [12, 0], [12, 2], [10, 2]] },
      { slot_id: "A02", camera_id: "cam2", polygon: [[20, 0], [22, 0], [22, 2], [20, 2]] },
    ],
    vehicles: [{
      global_id: 42,
      state: options.parkedSpotId ? "parked" : "active",
      observed: !options.parkedSpotId,
      camera_ids: ["cam2"],
      // Use an actual drivable graph point; the old arbitrary point relied on
      // straight-line routing through parking geometry.
      position: { ...LANE_GRAPH.nodes.find(n => n.id === LANE_GRAPH.entranceNodeId)!, reference: "cm" },
      parked_slot_id: options.parkedSpotId ?? null,
      last_seen_frame: 1,
      last_seen_time: 1,
    }],
    pending_handoffs: [],
    recent_events: [],
  };
}

describe("session-aware navigation", () => {
  let currentSession: VehicleSession;

  beforeEach(() => {
    vi.clearAllMocks();
    window.sessionStorage.clear();
    useParkingStore.getState().reset();
    useDriverFlowStore.getState().reset();
    currentSession = session();
    backendMocks.claimSession.mockImplementation(async () => currentSession);
    backendMocks.getSession.mockImplementation(async () => currentSession);
    backendMocks.startExit.mockImplementation(async () => currentSession);
  });

  it("does not warn when the session vehicle occupies its selected target", async () => {
    runtimeMocks.getRuntimeSnapshot.mockImplementation(async () => runtimeSnapshot({ targetVehicleId: 42 }));
    render(<App sessionId="session-42" />);

    await waitFor(() => expect(useDriverFlowStore.getState().mode).toBe("navigation"));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 2200));
    });
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("does not warn when target is occupied but identity has not been resolved", async () => {
    runtimeMocks.getRuntimeSnapshot.mockImplementation(async () => runtimeSnapshot({
      targetVehicleId: null,
      targetOccupied: true,
    }));
    render(<App sessionId="session-42" />);

    await waitFor(() => expect(useDriverFlowStore.getState().mode).toBe("navigation"));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 2100));
    });
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("shows other-vehicle warning only after target is confirmed occupied by another vehicle", async () => {
    runtimeMocks.getRuntimeSnapshot.mockImplementation(async () => runtimeSnapshot({
      targetVehicleId: null,
      targetOccupied: true,
    }));
    render(<App sessionId="session-42" />);

    await waitFor(() => expect(useDriverFlowStore.getState().mode).toBe("navigation"));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();

    runtimeMocks.getRuntimeSnapshot.mockImplementation(async () => runtimeSnapshot({
      targetVehicleId: 99,
      targetOccupied: true,
    }));
    expect(await screen.findByRole("alertdialog")).toBeVisible();
    expect(useDriverFlowStore.getState().warning?.status).toBe("occupied");
  });

  it("waits for the session API before switching to an alternative", async () => {
    const user = userEvent.setup();
    runtimeMocks.getRuntimeSnapshot.mockImplementation(async () => runtimeSnapshot({ targetVehicleId: 99 }));
    let acceptSelection: (() => void) | undefined;
    backendMocks.selectSpot.mockImplementation((_sessionId: string, spotId: string) => new Promise<VehicleSession>((resolve) => {
      acceptSelection = () => {
        currentSession = session({
          targetSpotId: spotId,
          revision: 4,
          updatedAt: "2026-08-23T10:00:01+07:00",
        });
        resolve(currentSession);
      };
    }));
    render(<App sessionId="session-42" />);

    expect(await screen.findByRole("alertdialog")).toBeVisible();
    await user.click(screen.getByTestId("switch-alternative"));

    expect(backendMocks.selectSpot).toHaveBeenCalledWith("session-42", "A02", expect.objectContaining({ expected_revision: 3, action_id: expect.any(String) }));
    expect(screen.getByRole("alertdialog")).toBeVisible();
    expect(screen.queryByTestId("active-route")).not.toBeInTheDocument();

    await act(async () => acceptSelection?.());
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(await screen.findByTestId("active-route")).toBeInTheDocument();
  });

  it("keeps navigation paused when the backend rejects a stale alternative", async () => {
    const user = userEvent.setup();
    const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    runtimeMocks.getRuntimeSnapshot.mockImplementation(async () => runtimeSnapshot({ targetVehicleId: 99 }));
    backendMocks.selectSpot.mockRejectedValue(
      new BackendApiError("Parking spot is no longer available", 409, "SPOT_NOT_AVAILABLE"),
    );
    render(<App sessionId="session-42" />);

    expect(await screen.findByRole("alertdialog")).toBeVisible();
    await user.click(screen.getByTestId("switch-alternative"));

    expect(backendMocks.selectSpot).toHaveBeenCalledWith("session-42", "A02", expect.objectContaining({ expected_revision: 3, action_id: expect.any(String) }));
    expect(screen.getByRole("alertdialog")).toBeVisible();
    expect(screen.queryByTestId("active-route")).not.toBeInTheDocument();
    consoleWarn.mockRestore();
  });

  it("restores navigation from the session and stops it at the actual parked spot", async () => {
    runtimeMocks.getRuntimeSnapshot.mockImplementation(async () => runtimeSnapshot({ targetVehicleId: null, parkedSpotId: "A02" }));
    render(<App sessionId="session-42" />);

    expect(await screen.findByTestId("active-route")).toBeInTheDocument();
    currentSession = session({
      state: "PARKED",
      targetSpotId: null,
      parkedSpotId: "A02",
      parkedAt: "2026-08-23T10:00:05+07:00",
      revision: 4,
      updatedAt: "2026-08-23T10:00:05+07:00",
    });

    expect(await screen.findByTestId("parked-success")).toHaveTextContent("A02");
    await waitFor(() => expect(screen.queryByTestId("active-route")).not.toBeInTheDocument());
    expect(useDriverFlowStore.getState().mode).toBe("browse");
  });

  it("allows exit before any parking and waits for the accepted API state", async () => {
    currentSession = session({state: "SELECTING_SPOT", targetSpotId: null});
    runtimeMocks.getRuntimeSnapshot.mockImplementation(async () => runtimeSnapshot({targetVehicleId: null}));
    backendMocks.startExit.mockImplementation(async () => {
      currentSession = session({state: "EXIT_NAVIGATION", targetSpotId: null, revision: 4});
      return currentSession;
    });
    render(<App sessionId="session-42" />);
    await userEvent.click(await screen.findByRole("button", {name: /Chỉ lối ra/i}));
    await waitFor(() => expect(backendMocks.startExit).toHaveBeenCalledTimes(1));
    expect(await screen.findByTestId("active-route")).toBeInTheDocument();
    expect(screen.queryByTestId("parked-success")).not.toBeInTheDocument();
    expect(screen.getByTestId("source-sample")).toBeDisabled();
    expect(screen.queryByTestId("mock-toggle")).not.toBeInTheDocument();
  });

  it("parking notification expires while polling and does not repeat on exit", async () => {
    currentSession = session({state: "PARKED", targetSpotId: null, parkedSpotId: "A02",
      actualParkedSpotId: "A02", parkingEpisodeId: "episode-1", parkedAt: "2026-09-07T10:00:00Z"});
    runtimeMocks.getRuntimeSnapshot.mockImplementation(async () => runtimeSnapshot({targetVehicleId: null, parkedSpotId: "A02"}));
    backendMocks.startExit.mockImplementation(async () => {
      currentSession = {...currentSession, state: "EXIT_NAVIGATION", revision: 4};
      return currentSession;
    });
    render(<App sessionId="session-42" />);
    expect(await screen.findByTestId("parked-success")).toBeVisible();
    await waitFor(() => expect(screen.queryByTestId("parked-success")).not.toBeInTheDocument(), {timeout: 6200});
    await userEvent.click(screen.getByRole("button", {name: /Chỉ lối ra/i}));
    await waitFor(() => expect(backendMocks.startExit).toHaveBeenCalledTimes(1));
    expect(screen.queryByTestId("parked-success")).not.toBeInTheDocument();
  }, 10000);
});
