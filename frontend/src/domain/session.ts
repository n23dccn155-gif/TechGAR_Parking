export type VehicleSessionState =
  | "WAITING_FOR_SCAN"
  | "SELECTING_SPOT"
  | "NAVIGATING_TO_SPOT"
  | "PARKED"
  | "EXIT_NAVIGATION";

export interface VehicleSession {
  sessionId: string;
  state: VehicleSessionState;
  globalVehicleId: number;
  runtimeId?: string | null;
  vehicleTrackId: number | null;
  activeTrackId: number | null;
  targetSpotId: string | null;
  parkedSpotId: string | null;
  claimed: boolean;
  lastKnownPosition: { x: number; y: number } | null;
  createdAt: string;
  updatedAt: string;
  revision: number;
  qrExpiresAt: string;
  claimedAt: string | null;
  spotSelectedAt: string | null;
  parkedAt: string | null;
  exitStartedAt: string | null;
}

export function buildSessionCompletionKey(session: VehicleSession): string | null {
  if (session.state !== "PARKED" || !session.parkedSpotId || !session.parkedAt) return null;
  return `${session.sessionId}:${session.parkedSpotId}:${session.parkedAt}`;
}
