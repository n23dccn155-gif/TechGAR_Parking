import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { VehicleSession } from "../domain/session";
import { canonicalRuntimeId } from "../domain/runtime";
import { createSessionActionId, useVehicleSession } from "../hooks/useVehicleSession";
import * as api from "../api/backendApi";

vi.mock("../api/backendApi", async original => ({
  ...await original<typeof api>(), getSession: vi.fn(), startExit: vi.fn(),
}));

function session(revision = 1, state: VehicleSession["state"] = "SELECTING_SPOT"): VehicleSession {
  return {sessionId:"s1", runtimeId:"r1", revision, state, globalVehicleId:2,
    vehicleTrackId:null, activeTrackId:null, targetSpotId:null, parkedSpotId:null,
    claimed:true, lastKnownPosition:null, createdAt:"2026-09-07T00:00:00Z",
    updatedAt:`2026-09-07T00:00:0${revision}Z`, qrExpiresAt:"2026-09-07T00:00:10Z",
    claimedAt:null, spotSelectedAt:null, parkedAt:null, exitStartedAt:null};
}

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.unstubAllGlobals());

it("late GET cannot undo a newer accepted exit POST", async () => {
  vi.mocked(api.getSession).mockResolvedValue(session());
  const {result} = renderHook(() => useVehicleSession("s1"));
  await waitFor(() => expect(result.current.session?.revision).toBe(1));
  let finishGet!: (value: VehicleSession) => void;
  vi.mocked(api.getSession).mockImplementationOnce(() => new Promise(resolve => {finishGet = resolve;}));
  let pending!: Promise<VehicleSession | null>;
  act(() => {pending = result.current.refresh();});
  vi.mocked(api.startExit).mockResolvedValue(session(2, "EXIT_NAVIGATION"));
  await act(async () => {await result.current.startExit();});
  await act(async () => {finishGet(session()); await pending;});
  expect(result.current.session?.state).toBe("EXIT_NAVIGATION");
  expect(result.current.session?.revision).toBe(2);
});

it("double click sends one POST and changing session rejects the old response", async () => {
  vi.mocked(api.getSession).mockResolvedValue(session());
  const {result, rerender} = renderHook(({id}) => useVehicleSession(id), {initialProps:{id:"s1"}});
  await waitFor(() => expect(result.current.session?.revision).toBe(1));
  let finish!: (value: VehicleSession) => void;
  vi.mocked(api.startExit).mockImplementation(() => new Promise(resolve => {finish = resolve;}));
  let pending!: Promise<VehicleSession | null>;
  act(() => {pending = result.current.startExit(); void result.current.startExit();});
  expect(api.startExit).toHaveBeenCalledTimes(1);
  vi.mocked(api.getSession).mockResolvedValue({...session(), sessionId:"s2", globalVehicleId:3});
  rerender({id:"s2"});
  await waitFor(() => expect(result.current.session?.sessionId).toBe("s2"));
  await act(async () => {finish(session(2,"EXIT_NAVIGATION")); await pending;});
  expect(result.current.session?.sessionId).toBe("s2");
  expect(result.current.session?.state).toBe("SELECTING_SPOT");
});

it("creates action IDs over phone LAN HTTP without randomUUID", () => {
  vi.stubGlobal("crypto", {getRandomValues: crypto.getRandomValues.bind(crypto)});
  const first = createSessionActionId();
  expect(first).toMatch(/^[0-9a-f]{32}$/);
  expect(createSessionActionId()).not.toBe(first);
});

it("follows durable alias chains, never guesses an ID on a cycle", () => {
  expect(canonicalRuntimeId(4, {"4":3,"3":2})).toBe(2);
  expect(canonicalRuntimeId(4, {"4":3,"3":4})).toBeNull();
  expect(canonicalRuntimeId(4, {"4":Number.NaN})).toBeNull();
  expect(canonicalRuntimeId(5, {"4":2})).toBe(5);
});
