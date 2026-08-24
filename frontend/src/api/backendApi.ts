import type { VehicleSession } from "../domain/session";

const BASE_URL = import.meta.env.VITE_BACKEND_URL ?? "";

export class BackendApiError extends Error {
  constructor(message: string, readonly status: number, readonly code?: string) {
    super(message);
    this.name = "BackendApiError";
  }
}

export class SessionNotFoundError extends BackendApiError {
  constructor(sessionId: string) {
    super(`Phiên xe không tồn tại hoặc đã kết thúc: ${sessionId}`, 404, "SESSION_NOT_FOUND");
    this.name = "SessionNotFoundError";
  }
}

async function parseResponse<T>(response: Response, sessionId?: string): Promise<T> {
  const payload = await response.json().catch(() => ({})) as { error?: string; code?: string };
  if (!response.ok) {
    if (response.status === 404 && payload.code === "SESSION_NOT_FOUND" && sessionId) {
      throw new SessionNotFoundError(sessionId);
    }
    throw new BackendApiError(payload.error ?? `API trả về HTTP ${response.status}`, response.status, payload.code);
  }
  return payload as T;
}

async function getJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, { cache: "no-store", signal });
  return parseResponse<T>(response);
}

async function postJson<T>(path: string, body: object): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return parseResponse<T>(response, "sessionId" in body ? String(body.sessionId) : undefined);
}

export async function getSession(sessionId: string, signal?: AbortSignal): Promise<VehicleSession> {
  const response = await fetch(`${BASE_URL}/api/session/${encodeURIComponent(sessionId)}`, { cache: "no-store", signal });
  return parseResponse<VehicleSession>(response, sessionId);
}

export function getWaitingSessions(signal?: AbortSignal): Promise<VehicleSession[]> {
  return getJson<VehicleSession[]>("/api/sessions/waiting", signal);
}

export function claimSession(sessionId: string): Promise<VehicleSession> {
  return postJson<VehicleSession>("/api/session/claim", { sessionId });
}

export function selectSpot(sessionId: string, spotId: string | null): Promise<VehicleSession> {
  return postJson<VehicleSession>("/api/session/select", { sessionId, spotId });
}

export function startExit(sessionId: string): Promise<VehicleSession> {
  return postJson<VehicleSession>("/api/session/exit", { sessionId });
}
