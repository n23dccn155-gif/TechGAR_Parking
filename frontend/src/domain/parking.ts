export const MAIN_ZONE_ORDER = ["F", "E", "D", "C", "B", "A"] as const;
export const ALL_ZONE_IDS = ["A", "B", "C", "D", "E", "F"] as const;
export const CAMERA_IDS = ["cam-left", "cam-right"] as const;
export const PARKING_STATUSES = ["empty", "occupied", "transitioning", "unknown"] as const;

export const SPOTS_PER_ZONE = 10;

export type MainZoneId = (typeof MAIN_ZONE_ORDER)[number];
export type ZoneId = (typeof ALL_ZONE_IDS)[number];
export type CameraId = (typeof CAMERA_IDS)[number];
export type ParkingStatus = (typeof PARKING_STATUSES)[number];
export type CameraHealth = "online" | "offline";
export type ParkingRow = "left" | "right";
export type DriverMode = "entry" | "browse" | "recommendation" | "navigation";
export type DestinationNeed = "shopping" | "services" | "entertainment";
export type BrowseFilter = "all" | "empty";
export type SpotId = `${ZoneId}${number}`;

export interface ParkingSpotState {
  id: SpotId;
  zone: ZoneId;
  number: number;
  row: ParkingRow;
  owner: CameraId;
  status: ParkingStatus;
  confidence: number;
  revision: number;
  updatedAt: string;
  vehicleId?: number | null;
  decisionSource?: string;
  trackingState?: string;
  stoppedForMs?: number;
}

export type SpotOccupancyRelation = "empty" | "own" | "other" | "unknown";

export interface CameraState {
  cameraId: CameraId;
  health: CameraHealth;
  updatedAt: string;
}

export interface SpotStatusEvent {
  type: "spot.status.changed";
  cameraId: CameraId;
  spotId: SpotId;
  status: ParkingStatus;
  confidence: number;
  revision: number;
  updatedAt: string;
}

export interface CameraHealthEvent {
  type: "camera.health.changed";
  cameraId: CameraId;
  health: CameraHealth;
  updatedAt: string;
}

export type ParkingEvent = SpotStatusEvent | CameraHealthEvent;

export interface ParkingSnapshot {
  spots: ParkingSpotState[];
  cameras: Record<CameraId, CameraState>;
  capturedAt: string;
}

export interface ParkingDataSource {
  getSnapshot(): Promise<ParkingSnapshot>;
  subscribe(listener: (event: ParkingEvent) => void): () => void;
  start(): void;
  stop(): void;
}

export interface ParkingCounts {
  total: number;
  empty: number;
  occupied: number;
  transitioning: number;
  unknown: number;
}

export interface RankedSpot {
  spotId: SpotId;
  zone: ZoneId;
  totalScore: number;
  drivingDistance: number;
  walkingDistance: number;
  estimatedWalkingMinutes: number;
  reason: string;
}

export interface RecommendationResult {
  need: DestinationNeed;
  best: RankedSpot;
  alternatives: RankedSpot[];
  calculatedAt: string;
}

export interface InvalidSpotWarning {
  spotId: SpotId;
  status: Exclude<ParkingStatus, "empty">;
  alternativeSpotId?: SpotId;
  alternativeSpotIds?: SpotId[];
}

export const DESTINATION_LABELS: Record<DestinationNeed, string> = {
  shopping: "Shopping",
  services: "Dịch vụ",
  entertainment: "Giải trí",
};

export const STATUS_LABELS: Record<ParkingStatus, string> = {
  empty: "Trống",
  occupied: "Đã có xe",
  transitioning: "Đang chuyển tiếp",
  unknown: "Không xác định",
};

/** Zones on the left side of center lane (owned by cam-left) */
export const LEFT_ZONES: ReadonlySet<ZoneId> = new Set(["F", "E", "D"]);

export function formatSpotId(zone: ZoneId, number: number): SpotId {
  return `${zone}${String(number).padStart(2, "0")}` as SpotId;
}

export function parseSpotId(spotId: SpotId): { zone: ZoneId; number: number } {
  return {
    zone: spotId.slice(0, 1) as ZoneId,
    number: Number(spotId.slice(1)),
  };
}

export function getSpotOwner(spotId: SpotId): CameraId {
  const { zone } = parseSpotId(spotId);
  return LEFT_ZONES.has(zone) ? "cam-left" : "cam-right";
}

export function cameraOwnsSpot(cameraId: CameraId, spotId: SpotId): boolean {
  return getSpotOwner(spotId) === cameraId;
}

export function isSelectableStatus(status: ParkingStatus): boolean {
  return status === "empty";
}

export function classifySpotOccupancy(
  spot: ParkingSpotState,
  globalVehicleId: number | null,
  parkedSpotId: string | null,
): SpotOccupancyRelation {
  if (spot.status === "empty") return "empty";
  if (parkedSpotId === spot.id) return "own";
  if (spot.vehicleId == null || globalVehicleId == null) return "unknown";
  return spot.vehicleId === globalVehicleId ? "own" : "other";
}

export function getInvalidSpotWarningText(spotId: SpotId, status: Exclude<ParkingStatus, "empty">): string {
  if (status === "transitioning") {
    return `Ô ${spotId} đang có phương tiện di chuyển vào hoặc ra.`;
  }
  if (status === "occupied") {
    return `Ô ${spotId} hiện không còn trống.`;
  }
  return `Trạng thái ô ${spotId} hiện chưa xác định.`;
}
