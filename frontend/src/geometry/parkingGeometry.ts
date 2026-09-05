import {
  MAIN_ZONE_ORDER,
  SPOTS_PER_ZONE,
  LEFT_ZONES,
  formatSpotId,
  type DestinationNeed,
  type MainZoneId,
  type ParkingRow,
  type SpotId,
  type ZoneId,
} from "../domain/parking";

export interface Point {
  x: number;
  y: number;
}

export interface Rect extends Point {
  width: number;
  height: number;
}

export interface SpotGeometry extends Rect {
  id: SpotId;
  zone: ZoneId;
  number: number;
  row: ParkingRow;
  entryPoint: Point;
}

export interface ZoneGeometry {
  id: MainZoneId;
  bounds: Rect;
  side: "left" | "right";
  spotIds: SpotId[];
}

export interface AisleGeometry {
  id: string;
  bounds: Rect;
  centerX: number;
}

export interface ConnectorGeometry {
  id: string;
  bounds: Rect;
  centerline: {
    start: Point;
    end: Point;
  };
}

export interface AccessAnchor extends Point {
  id: DestinationNeed;
  label: string;
}

export interface ParkingLayout {
  centerLaneX: number;
  centerLaneWidth: number;
  centerLaneCenterX: number;
  leftAisleCenterX: number;
  rightAisleCenterX: number;
  entranceY: number;
  exitY: number;
}

export interface ParkingGeometry {
  width: number;
  height: number;
  layout: ParkingLayout;
  spots: SpotGeometry[];
  zones: ZoneGeometry[];
  aisles: AisleGeometry[];
  horizontalConnectors: ConnectorGeometry[];
  entrance: Point;
  exit: Point;
  anchors: Record<DestinationNeed, AccessAnchor>;
}

// ── Layout constants ──────────────────────────────────────────────────────────
const MAP_WIDTH = 1200;
const MAP_HEIGHT = 900;

const SPOT_WIDTH = 90;
const SPOT_HEIGHT = 56;
const SPOT_GAP = 10;    // vertical gap between spots

const FIRST_SPOT_Y = 112;  // y of slot 10 (topmost)

// X positions for each zone column
const ZONE_COLUMNS: Record<MainZoneId, number> = {
  F: 110,
  E: 300,
  D: 390,
  C: 600,
  B: 690,
  A: 890,
};

// 3 aisles (driving lanes)
const LEFT_AISLE_X = 210;
const LEFT_AISLE_WIDTH = 80;
const CENTER_LANE_X = 500;
const CENTER_LANE_WIDTH = 80;
const RIGHT_AISLE_X = 800;
const RIGHT_AISLE_WIDTH = 80;

const ENTRANCE_Y = 860;
const EXIT_Y = 35;

// Horizontal connector Y positions (above top slot & below bottom slot)
const CONNECTOR_TOP_Y = 75;
const CONNECTOR_BOTTOM_Y = 775;
const CONNECTOR_HEIGHT = 30;

// ── Helpers ───────────────────────────────────────────────────────────────────
function spotY(slotNumber: number): number {
  // Slot 10 at top (FIRST_SPOT_Y), slot 01 at bottom
  const indexFromTop = SPOTS_PER_ZONE - slotNumber; // 10→0, 09→1, ..., 01→9
  return FIRST_SPOT_Y + indexFromTop * (SPOT_HEIGHT + SPOT_GAP);
}

function getAisleCenterX(zone: ZoneId): number {
  switch (zone) {
    case "F":
    case "E":
      return LEFT_AISLE_X + LEFT_AISLE_WIDTH / 2;
    case "D":
    case "C":
      return CENTER_LANE_X + CENTER_LANE_WIDTH / 2;
    case "B":
    case "A":
      return RIGHT_AISLE_X + RIGHT_AISLE_WIDTH / 2;
  }
}

function getEntryPoint(zone: ZoneId, spotX: number, spotCenterY: number): Point {
  const aisleCenterX = getAisleCenterX(zone);
  // Entry point is on the side of the spot facing its aisle
  if (spotX < aisleCenterX) {
    // Spot is to the LEFT of its aisle → entry on the right edge
    return { x: spotX + SPOT_WIDTH + 8, y: spotCenterY };
  } else {
    // Spot is to the RIGHT of its aisle → entry on the left edge
    return { x: spotX - 8, y: spotCenterY };
  }
}

// ── Generator ─────────────────────────────────────────────────────────────────
export function generateParkingGeometry(): ParkingGeometry {
  const zones: ZoneGeometry[] = [];
  const spots: SpotGeometry[] = [];

  const centerLaneCenterX = CENTER_LANE_X + CENTER_LANE_WIDTH / 2;
  const leftAisleCenterX = LEFT_AISLE_X + LEFT_AISLE_WIDTH / 2;
  const rightAisleCenterX = RIGHT_AISLE_X + RIGHT_AISLE_WIDTH / 2;

  // Generate spots for each zone
  MAIN_ZONE_ORDER.forEach((zoneId) => {
    const columnX = ZONE_COLUMNS[zoneId];
    const side: ParkingRow = LEFT_ZONES.has(zoneId) ? "left" : "right";
    const spotIds: SpotId[] = [];

    for (let n = 1; n <= SPOTS_PER_ZONE; n++) {
      const id = formatSpotId(zoneId, n);
      const y = spotY(n);
      const centerY = y + SPOT_HEIGHT / 2;

      spotIds.push(id);
      spots.push({
        id,
        zone: zoneId,
        number: n,
        row: side,
        x: columnX,
        y,
        width: SPOT_WIDTH,
        height: SPOT_HEIGHT,
        entryPoint: getEntryPoint(zoneId, columnX, centerY),
      });
    }

    // Zone bounds: enclosing rectangle for all 8 spots
    const topY = spotY(SPOTS_PER_ZONE); // slot 08 (topmost)
    const bottomY = spotY(1) + SPOT_HEIGHT; // slot 01 bottom edge
    zones.push({
      id: zoneId,
      bounds: { x: columnX, y: topY, width: SPOT_WIDTH, height: bottomY - topY },
      side,
      spotIds,
    });
  });

  // 3 aisles
  const aisles: AisleGeometry[] = [
    {
      id: "left-aisle",
      bounds: { x: LEFT_AISLE_X, y: 0, width: LEFT_AISLE_WIDTH, height: MAP_HEIGHT },
      centerX: leftAisleCenterX,
    },
    {
      id: "center-lane",
      bounds: { x: CENTER_LANE_X, y: 0, width: CENTER_LANE_WIDTH, height: MAP_HEIGHT },
      centerX: centerLaneCenterX,
    },
    {
      id: "right-aisle",
      bounds: { x: RIGHT_AISLE_X, y: 0, width: RIGHT_AISLE_WIDTH, height: MAP_HEIGHT },
      centerX: rightAisleCenterX,
    },
  ];

  // Horizontal connectors (top + bottom)
  const ROAD_END_X = 1100;

  const horizontalConnectors: ConnectorGeometry[] = [
    {
      id: "connector-top",
      bounds: {
        x: leftAisleCenterX,
        y: CONNECTOR_TOP_Y,
        width: ROAD_END_X - leftAisleCenterX,
        height: CONNECTOR_HEIGHT,
      },
      centerline: {
        start: { x: leftAisleCenterX, y: CONNECTOR_TOP_Y + CONNECTOR_HEIGHT / 2 },
        end: { x: ROAD_END_X, y: CONNECTOR_TOP_Y + CONNECTOR_HEIGHT / 2 },
      },
    },
    {
      id: "connector-bottom",
      bounds: {
        x: leftAisleCenterX,
        y: CONNECTOR_BOTTOM_Y,
        width: ROAD_END_X - leftAisleCenterX,
        height: CONNECTOR_HEIGHT,
      },
      centerline: {
        start: { x: leftAisleCenterX, y: CONNECTOR_BOTTOM_Y + CONNECTOR_HEIGHT / 2 },
        end: { x: ROAD_END_X, y: CONNECTOR_BOTTOM_Y + CONNECTOR_HEIGHT / 2 },
      },
    },
  ];

  return {
    width: MAP_WIDTH,
    height: MAP_HEIGHT,
    layout: {
      centerLaneX: CENTER_LANE_X,
      centerLaneWidth: CENTER_LANE_WIDTH,
      centerLaneCenterX,
      leftAisleCenterX,
      rightAisleCenterX,
      entranceY: ENTRANCE_Y,
      exitY: EXIT_Y,
    },
    spots,
    zones,
    aisles,
    horizontalConnectors,
    entrance: { x: ROAD_END_X, y: CONNECTOR_BOTTOM_Y + CONNECTOR_HEIGHT / 2 },
    exit: { x: ROAD_END_X, y: CONNECTOR_TOP_Y + CONNECTOR_HEIGHT / 2 },
    anchors: {
      shopping: { id: "shopping", label: "Shopping", x: ROAD_END_X - 100, y: CONNECTOR_BOTTOM_Y + CONNECTOR_HEIGHT / 2 + 20 },
      services: { id: "services", label: "Dịch vụ", x: 50, y: MAP_HEIGHT / 2 },
      entertainment: { id: "entertainment", label: "Giải trí", x: ROAD_END_X - 100, y: CONNECTOR_TOP_Y + CONNECTOR_HEIGHT / 2 - 10 },
    },
  };
}

export const PARKING_GEOMETRY = generateParkingGeometry();

export const SPOT_GEOMETRY_BY_ID = new Map<SpotId, SpotGeometry>(
  PARKING_GEOMETRY.spots.map((spot) => [spot.id, spot]),
);

export function pointInsideRect(point: Point, rect: Rect): boolean {
  return (
    point.x > rect.x &&
    point.x < rect.x + rect.width &&
    point.y > rect.y &&
    point.y < rect.y + rect.height
  );
}

export function distanceBetween(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
