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
  qrExpiresAt: string;
  claimedAt: string | null;
  spotSelectedAt: string | null;
  parkedAt: string | null;
  exitStartedAt: string | null;
}
