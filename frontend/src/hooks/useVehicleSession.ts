import { useCallback, useEffect, useRef, useState } from "react";
import type { VehicleSession } from "../domain/session";
import * as backendApi from "../api/backendApi";

export interface SessionError {
  message: string;
  action?: "claim" | "select" | "exit";
}

interface CommitResult {
  accepted: boolean;
  reason?: "stale_revision" | "session_mismatch" | "no_current";
}

export interface UseVehicleSessionResult {
  session: VehicleSession | null;
  error: SessionError | null;
  busyAction: "claim" | "select" | "exit" | null;
  claim: () => Promise<void>;
  selectSpot: (spotId: string | null) => Promise<void>;
  startExit: () => Promise<void>;
  refresh: () => Promise<void>;
}

const POLL_INTERVAL_MS = 500;

export function useVehicleSession(sessionId: string | null): UseVehicleSessionResult {
  const [session, setSession] = useState<VehicleSession | null>(null);
  const [error, setError] = useState<SessionError | null>(null);
  const [busyAction, setBusyAction] = useState<"claim" | "select" | "exit" | null>(null);

  const sessionRef = useRef<VehicleSession | null>(null);
  sessionRef.current = session;

  const pollControllerRef = useRef<AbortController | null>(null);
  const pendingGetRef = useRef<Promise<VehicleSession> | null>(null);

  const commit = useCallback((next: VehicleSession, source: string): CommitResult => {
    const current = sessionRef.current;
    if (current && current.sessionId !== next.sessionId) {
      console.warn(`[useVehicleSession] sessionId mismatch from ${source}: ${current.sessionId} vs ${next.sessionId}`);
      return { accepted: false, reason: "session_mismatch" };
    }
    if (next.runtimeId && current?.runtimeId && next.runtimeId !== current.runtimeId) {
      console.warn(`[useVehicleSession] runtimeId mismatch from ${source}: ${current.runtimeId} vs ${next.runtimeId}`);
      return { accepted: false, reason: "session_mismatch" };
    }
    if (current && next.revision < current.revision) {
      return { accepted: false, reason: "stale_revision" };
    }
    if (
      current &&
      next.revision === current.revision &&
      next.state === current.state &&
      next.targetSpotId === current.targetSpotId &&
      next.parkedSpotId === current.parkedSpotId &&
      next.globalVehicleId === current.globalVehicleId
    ) {
      return { accepted: true };
    }
    setSession(next);
    return { accepted: true };
  }, []);

  const refresh = useCallback(async () => {
    if (!sessionId) return;
    if (pollControllerRef.current) {
      pollControllerRef.current.abort();
    }
    const controller = new AbortController();
    pollControllerRef.current = controller;
    try {
      const next = await backendApi.getSession(sessionId, controller.signal);
      commit(next, "GET");
    } catch (err) {
      if (controller.signal.aborted) return;
      if (err instanceof backendApi.SessionNotFoundError) {
        setSession(null);
        return;
      }
    } finally {
      if (pollControllerRef.current === controller) {
        pollControllerRef.current = null;
      }
    }
  }, [sessionId, commit]);

  const runAction = useCallback(
    async (
      action: "claim" | "select" | "exit",
      call: () => Promise<VehicleSession>,
    ) => {
      setError(null);
      setBusyAction(action);
      try {
        if (pollControllerRef.current) {
          pollControllerRef.current.abort();
        }
        const result = await call();
        const outcome = commit(result, `POST:${action}`);
        if (!outcome.accepted && outcome.reason === "stale_revision") {
          await refresh();
        }
      } catch (err) {
        const message =
          err instanceof backendApi.BackendApiError
            ? err.message
            : err instanceof Error
              ? err.message
              : "Lỗi không xác định";
        setError({ message, action });
      } finally {
        setBusyAction(null);
      }
    },
    [commit, refresh],
  );

  const claim = useCallback(async () => {
    if (!sessionId) return;
    await runAction("claim", () => backendApi.claimSession(sessionId));
  }, [sessionId, runAction]);

  const selectSpot = useCallback(
    async (spotId: string | null) => {
      if (!sessionId) return;
      await runAction("select", () => backendApi.selectSpot(sessionId, spotId));
    },
    [sessionId, runAction],
  );

  const startExit = useCallback(async () => {
    if (!sessionId) return;
    await runAction("exit", () => backendApi.startExit(sessionId));
  }, [sessionId, runAction]);

  useEffect(() => {
    if (!sessionId) {
      setSession(null);
      return;
    }
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;
    const controller = new AbortController();

    const poll = async () => {
      if (cancelled || pendingGetRef.current) return;
      const pending = backendApi
        .getSession(sessionId, controller.signal)
        .then((next) => {
          if (!cancelled) commit(next, "POLL");
          return next;
        })
        .catch((err) => {
          if (err instanceof backendApi.SessionNotFoundError && !cancelled) {
            setSession(null);
          }
          throw err;
        })
        .finally(() => {
          pendingGetRef.current = null;
        });
      pendingGetRef.current = pending;
      try {
        await pending;
      } catch {
        // handled in .then/.catch
      }
    };

    poll();
    timer = setInterval(poll, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
      controller.abort();
    };
  }, [sessionId, commit]);

  return {
    session,
    error,
    busyAction,
    claim,
    selectSpot,
    startExit,
    refresh,
  };
}
