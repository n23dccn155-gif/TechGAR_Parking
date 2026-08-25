import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getWaitingSessions } from "../api/backendApi";
import { EntryQRKiosk } from "../components/EntryQRKiosk";
import type { VehicleSession } from "../domain/session";

vi.mock("../api/backendApi", () => ({ getWaitingSessions: vi.fn() }));
vi.mock("qrcode", () => ({ default: { toDataURL: vi.fn(async () => "data:image/png;base64,local-qr") } }));

const waitingSession: VehicleSession = {
  sessionId: "car-Ldfk0p9_x",
  state: "WAITING_FOR_SCAN",
  globalVehicleId: 42,
  vehicleTrackId: null,
  activeTrackId: null,
  targetSpotId: null,
  parkedSpotId: null,
  claimed: false,
  lastKnownPosition: null,
  createdAt: "2026-08-23T10:00:00+07:00",
  updatedAt: "2026-08-23T10:00:00+07:00",
  revision: 1,
  qrExpiresAt: "2026-08-23T10:00:10+07:00",
  claimedAt: null,
  spotSelectedAt: null,
  parkedAt: null,
  exitStartedAt: null,
};

describe("entry QR kiosk", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-23T03:00:00.000Z"));
    vi.mocked(getWaitingSessions).mockResolvedValue([waitingSession]);
  });

  afterEach(() => vi.useRealTimers());

  it("renders a locally-generated QR for the newest waiting Global ID session", async () => {
    render(<EntryQRKiosk standalone />);
    await act(async () => { await Promise.resolve(); });
    expect(screen.getByText("#42")).toBeVisible();
    await act(async () => { await Promise.resolve(); });
    expect(screen.getByAltText("QR phiên xe 42")).toHaveAttribute("src", "data:image/png;base64,local-qr");
    expect(screen.getByRole("link", { name: "Mở trang theo dõi xe" })).toHaveAttribute("href", `${window.location.origin}/?session=car-Ldfk0p9_x`);
  });

  it("shows a waiting screen before any car crosses the entry gate", async () => {
    vi.mocked(getWaitingSessions).mockResolvedValue([]);
    render(<EntryQRKiosk standalone />);
    await act(async () => { await Promise.resolve(); });
    expect(screen.getByText("Đang chờ xe đi qua vạch cổng vào…")).toBeVisible();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("hides the QR exactly ten seconds after it was created without a scan", async () => {
    render(<EntryQRKiosk standalone />);
    await act(async () => { await Promise.resolve(); });
    expect(screen.getByText("#42")).toBeVisible();

    await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });

    expect(screen.queryByText("#42")).not.toBeInTheDocument();
    expect(screen.getByText("Đang chờ xe đi qua vạch cổng vào…")).toBeVisible();
  });

  it("replaces vehicle 1 immediately when vehicle 2 reaches the entry gate", async () => {
    const vehicle1 = { ...waitingSession, sessionId: "vehicle-1", globalVehicleId: 1 };
    const vehicle2 = {
      ...waitingSession,
      sessionId: "vehicle-2",
      globalVehicleId: 2,
      createdAt: "2026-08-23T10:00:01+07:00",
      qrExpiresAt: "2026-08-23T10:00:11+07:00",
    };
    vi.mocked(getWaitingSessions)
      .mockResolvedValueOnce([vehicle1])
      .mockResolvedValue([vehicle1, vehicle2]);
    render(<EntryQRKiosk standalone />);
    await act(async () => { await Promise.resolve(); });
    expect(screen.getByText("#1")).toBeVisible();

    await act(async () => { await vi.advanceTimersByTimeAsync(250); });

    expect(screen.queryByText("#1")).not.toBeInTheDocument();
    expect(screen.getByText("#2")).toBeVisible();
    expect(screen.getByRole("link", { name: "Mở trang theo dõi xe" })).toHaveAttribute(
      "href",
      `${window.location.origin}/?session=vehicle-2`,
    );
  });
});
