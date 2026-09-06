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
  claim: () => Promise<VehicleSession | null>;
  selectSpot: (spotId: string | null) => Promise<VehicleSession | null>;
  startExit: () => Promise<VehicleSession | null>;
  refresh: () => Promise<VehicleSession | null>;
}

const POLL_INTERVAL_MS = 500;

export function useVehicleSession(sessionId: string | null): UseVehicleSessionResult {
  const [session, setSession] = useState<VehicleSession | null>(null);
  const [error, setError] = useState<SessionError | null>(null);
  const [ended, setEnded] = useState(false);
  const [busyAction, setBusyAction] = useState<"claim" | "select" | "exit" | null>(null);

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
        && next.updatedAt === current.updatedAt;
      if (!identical) {
        console.warn(`[useVehicleSession] conflicting revision from ${source}`);
        return { accepted: false, reason: "stale_revision" };
      }
      return { accepted: true };
    }
    sessionRef.current = next;
    setSession(next);
    setEnded(false);
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
    let pending: Promise<VehicleSession | null>;
    pending = backendApi.getSession(expectedId, controller.signal)
      .then((next) => commit(next, "GET", expectedId, lifecycle).accepted ? next : null)
      .catch((caught: unknown) => {
        if (controller.signal.aborted) return null;
        if (caught instanceof backendApi.SessionNotFoundError) markDeleted(expectedId, lifecycle);
        return null;
      })
      .finally(() => {
        if (pollControllerRef.current === controller) pollControllerRef.current = null;
        if (pendingGetRef.current === pending) pendingGetRef.current = null;
      });
    pendingGetRef.current = pending;
    return pending;
  }, [commit, markDeleted]);

  const runAction = useCallback(async (
    action: "claim" | "select" | "exit",
    call: (id: string) => Promise<VehicleSession>,
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
      const next = await call(expectedId);
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
    (spotId: string | null) => runAction("select", (id) => backendApi.selectSpot(id, spotId)),
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
    if (!sessionId) return;
    void refresh();
    const timer = setInterval(() => void refresh(), POLL_INTERVAL_MS);
    return () => {
      clearInterval(timer);
      pollControllerRef.current?.abort();
    };
  }, [sessionId, refresh]);

  return { session, error, ended, busyAction, claim, selectSpot, startExit, refresh };
}
