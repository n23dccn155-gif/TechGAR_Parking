import { useCallback, useEffect, useRef, useState } from "react";
import type { VehicleSession } from "../domain/session";
import * as backendApi from "../api/backendApi";

export interface SessionError {
  message: string;
  action?: "claim" | "select" | "exit";
}

interface CommitResult {
  accepted: boolean;
  reason?: "stale_revision" | "session_mismatch" | "deleted";
}

export interface UseVehicleSessionResult {
  session: VehicleSession | null;
  error: SessionError | null;
  ended: boolean;
  busyAction: "claim" | "select" | "exit" | null;
  lastSyncedAt: number | null;
  claim: () => Promise<VehicleSession | null>;
  selectSpot: (spotId: string | null) => Promise<VehicleSession | null>;
  startExit: () => Promise<VehicleSession | null>;
  refresh: () => Promise<VehicleSession | null>;
}

const POLL_INTERVAL_MS = 500;

// DroidCam demos often open the driver UI via plain HTTP on a LAN IP.
// randomUUID is secure-context-only; getRandomValues also works there.
export function createSessionActionId(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return Array.from(crypto.getRandomValues(new Uint8Array(16)),
    value => value.toString(16).padStart(2, "0")).join("");
}

export function useVehicleSession(sessionId: string | null): UseVehicleSessionResult {
  const [session, setSession] = useState<VehicleSession | null>(null);
  const [error, setError] = useState<SessionError | null>(null);
  const [ended, setEnded] = useState(false);
  const [busyAction, setBusyAction] = useState<"claim" | "select" | "exit" | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);

  const sessionRef = useRef<VehicleSession | null>(null);
  const activeSessionIdRef = useRef<string | null>(sessionId);
  const lifecycleRef = useRef(0);
  const deletedRef = useRef(false);
  const pollControllerRef = useRef<AbortController | null>(null);
  const pendingGetRef = useRef<Promise<VehicleSession | null> | null>(null);
  const actionRef = useRef<"claim" | "select" | "exit" | null>(null);

  const commit = useCallback((next: VehicleSession, source: string, expectedId: string, lifecycle: number): CommitResult => {
    if (lifecycle !== lifecycleRef.current || activeSessionIdRef.current !== expectedId || next.sessionId !== expectedId) {
      return { accepted: false, reason: "session_mismatch" };
    }
    if (deletedRef.current) return { accepted: false, reason: "deleted" };
    // A GET started before a user action may still resolve after the POST.
    // Never let that older response overwrite the action's in-flight state;
    // the action response (or its explicit reconciliation GET) is authoritative.
    if (source === "GET" && actionRef.current !== null) {
      return { accepted: false, reason: "stale_revision" };
    }
    const current = sessionRef.current;
    if (next.runtimeId && current?.runtimeId && next.runtimeId !== current.runtimeId) {
      console.warn(`[useVehicleSession] runtime mismatch from ${source}`);
      return { accepted: false, reason: "session_mismatch" };
    }
    if (current && next.revision < current.revision) {
      return { accepted: false, reason: "stale_revision" };
    }
    if (current && next.revision === current.revision) {
      const identical = next.state === current.state
        && next.targetSpotId === current.targetSpotId
        && next.parkedSpotId === current.parkedSpotId
        && next.globalVehicleId === current.globalVehicleId
        && next.actualParkedSpotId === current.actualParkedSpotId
        && next.parkingEpisodeId === current.parkingEpisodeId
        && next.updatedAt === current.updatedAt;
      if (!identical) {
        console.warn(`[useVehicleSession] conflicting revision from ${source}`);
        return { accepted: false, reason: "stale_revision" };
      }
      setLastSyncedAt(Date.now());
      setError(previous => previous?.action ? previous : null);
      return { accepted: true };
    }
    sessionRef.current = next;
    setSession(next);
    setEnded(false);
    setError(null);
    setLastSyncedAt(Date.now());
    return { accepted: true };
  }, []);

  const markDeleted = useCallback((expectedId: string, lifecycle: number) => {
    if (lifecycle !== lifecycleRef.current || activeSessionIdRef.current !== expectedId) return;
    deletedRef.current = true;
    sessionRef.current = null;
    setSession(null);
    setEnded(true);
  }, []);

  const refresh = useCallback(async (): Promise<VehicleSession | null> => {
    const expectedId = activeSessionIdRef.current;
    const lifecycle = lifecycleRef.current;
    if (!expectedId || deletedRef.current || actionRef.current) return null;
    if (pendingGetRef.current) return pendingGetRef.current;
    const controller = new AbortController();
    pollControllerRef.current = controller;
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, 2000);
    const pending: Promise<VehicleSession | null> = backendApi.getSession(expectedId, controller.signal)
      .then((next) => commit(next, "GET", expectedId, lifecycle).accepted ? next : null)
      .catch((caught: unknown) => {
        if (controller.signal.aborted && !timedOut) return null;
        if (caught instanceof backendApi.SessionNotFoundError) markDeleted(expectedId, lifecycle);
        if (
          lifecycle === lifecycleRef.current
          && activeSessionIdRef.current === expectedId
          && !deletedRef.current
        ) {
          setError({
            message: timedOut
              ? "Session API không phản hồi trong 2 giây"
              : caught instanceof Error
                ? caught.message
                : "Không đồng bộ được phiên xe",
          });
        }
        return null;
      })
      .finally(() => {
        clearTimeout(timeout);
        if (pollControllerRef.current === controller) pollControllerRef.current = null;
        if (pendingGetRef.current === pending) pendingGetRef.current = null;
      });
    pendingGetRef.current = pending;
    return pending;
  }, [commit, markDeleted]);

  const runAction = useCallback(async (
    action: "claim" | "select" | "exit",
    call: (id: string, options: backendApi.ActionOptions) => Promise<VehicleSession>,
  ): Promise<VehicleSession | null> => {
    const expectedId = activeSessionIdRef.current;
    const lifecycle = lifecycleRef.current;
    if (!expectedId || deletedRef.current || actionRef.current) return null;
    actionRef.current = action;
    pollControllerRef.current?.abort();
    pendingGetRef.current = null;
    setError(null);
    setBusyAction(action);
    try {
      const next = await call(expectedId, {
        expected_revision: sessionRef.current?.revision,
        action_id: createSessionActionId(),
      });
      const result = commit(next, `POST:${action}`, expectedId, lifecycle);
      if (!result.accepted && result.reason === "stale_revision") {
        actionRef.current = null;
        return await refresh();
      }
      return result.accepted ? next : null;
    } catch (caught) {
      if (caught instanceof backendApi.SessionNotFoundError) markDeleted(expectedId, lifecycle);
      if (lifecycle === lifecycleRef.current && activeSessionIdRef.current === expectedId) {
        setError({ message: caught instanceof Error ? caught.message : "Lỗi không xác định", action });
        // The POST outcome is unknown to the UI on transport failures.  Drop
        // the action lock and reconcile with the backend before the next user
        // interaction instead of inventing an optimistic session state.
        actionRef.current = null;
        await refresh();
      }
      throw caught;
    } finally {
      if (
        lifecycle === lifecycleRef.current
        && activeSessionIdRef.current === expectedId
        && actionRef.current === action
      ) {
        actionRef.current = null;
        setBusyAction(null);
      } else if (lifecycle === lifecycleRef.current && activeSessionIdRef.current === expectedId) {
        setBusyAction(null);
      }
    }
  }, [commit, markDeleted, refresh]);

  const claim = useCallback(() => runAction("claim", backendApi.claimSession), [runAction]);
  const selectSpot = useCallback(
    (spotId: string | null) => runAction("select", (id, options) => backendApi.selectSpot(id, spotId, options)),
    [runAction],
  );
  const startExit = useCallback(() => runAction("exit", backendApi.startExit), [runAction]);

  useEffect(() => {
    lifecycleRef.current += 1;
    activeSessionIdRef.current = sessionId;
    deletedRef.current = false;
    sessionRef.current = null;
    actionRef.current = null;
    pollControllerRef.current?.abort();
    pendingGetRef.current = null;
    setSession(null);
    setEnded(false);
    setError(null);
    setBusyAction(null);
    setLastSyncedAt(null);
    if (!sessionId) return;
    void refresh();
    const timer = setInterval(() => void refresh(), POLL_INTERVAL_MS);
    return () => {
      clearInterval(timer);
      pollControllerRef.current?.abort();
    };
  }, [sessionId, refresh]);

  return {
    session,
    error,
    ended,
    busyAction,
    lastSyncedAt,
    claim,
    selectSpot,
    startExit,
    refresh,
  };
}
