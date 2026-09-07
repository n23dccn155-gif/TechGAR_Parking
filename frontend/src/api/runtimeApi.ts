import type { RuntimeCameraId, RuntimeGateConfig, RuntimeSnapshot } from "../domain/runtime";

const RUNTIME_BASE = import.meta.env.VITE_RUNTIME_URL ?? "";
const RETRY_DELAY_MS = 2000;

let pendingSnapshot: Promise<RuntimeSnapshot> | null = null;
let retryAfter = 0;
let lastRuntimeError: unknown = new Error("Runtime API is unavailable");

async function requestRuntimeSnapshot(signal?: AbortSignal): Promise<RuntimeSnapshot> {
  const response = await fetch(`${RUNTIME_BASE}/api/runtime/snapshot`, {
    cache: "no-store",
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(2000)]) : AbortSignal.timeout(2000),
  });
  if (!response.ok) {
    throw new Error(`Runtime API: ${response.status} ${response.statusText}`);
  }
  return response.json() as Promise<RuntimeSnapshot>;
}

export function getRuntimeSnapshot(signal?: AbortSignal): Promise<RuntimeSnapshot> {
  if (signal) return requestRuntimeSnapshot(signal);
  if (Date.now() < retryAfter) return Promise.reject(lastRuntimeError);
  if (pendingSnapshot) return pendingSnapshot;

  pendingSnapshot = requestRuntimeSnapshot()
    .catch((error: unknown) => {
      lastRuntimeError = error;
      retryAfter = Date.now() + RETRY_DELAY_MS;
      throw error;
    })
    .finally(() => {
      pendingSnapshot = null;
    });
  return pendingSnapshot;
}

export function runtimeCameraStreamUrl(cameraId: RuntimeCameraId): string {
  return `${RUNTIME_BASE}/api/runtime/cameras/${cameraId}.mjpg`;
}

export async function getRuntimeGateConfig(signal?: AbortSignal): Promise<RuntimeGateConfig | null> {
  const response = await fetch(`${RUNTIME_BASE}/api/runtime/gates`, {
    cache: "no-store",
    signal,
  });
  if (response.status === 404) return null;
  if (!response.ok) {
    const payload = await response.json().catch(() => ({})) as { error?: string };
    throw new Error(payload.error ?? `Runtime gate API: ${response.status} ${response.statusText}`);
  }
  return response.json() as Promise<RuntimeGateConfig>;
}

export async function saveRuntimeGateConfig(config: RuntimeGateConfig): Promise<RuntimeGateConfig> {
  const response = await fetch(`${RUNTIME_BASE}/api/runtime/gates`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(config),
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({})) as { error?: string };
    throw new Error(payload.error ?? `Runtime gate API: ${response.status} ${response.statusText}`);
  }
  return response.json() as Promise<RuntimeGateConfig>;
}
