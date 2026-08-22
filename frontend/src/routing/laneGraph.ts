import { SPOTS_PER_ZONE, type SpotId } from "../domain/parking";
import {
  PARKING_GEOMETRY,
  distanceBetween,
  type ParkingGeometry,
  type Point,
} from "../geometry/parkingGeometry";

export interface LaneNode extends Point {
  id: string;
  kind: "entrance" | "exit" | "junction" | "lane" | "spot-entry" | "access-anchor";
}

export interface LaneEdge {
  id: string;
  from: string;
  to: string;
  distance: number;
  direction: "one-way" | "two-way";
}

export interface LaneGraph {
  nodes: LaneNode[];
  edges: LaneEdge[];
  entranceNodeId: string;
  exitNodeId: string;
  spotEntryNodeIds: Record<SpotId, string>;
}

export function buildLaneGraph(geometry: ParkingGeometry = PARKING_GEOMETRY): LaneGraph {
  const nodes: LaneNode[] = [];
  const edges: LaneEdge[] = [];
  const spotEntryNodeIds = {} as Record<SpotId, string>;
  const nodeById = new Map<string, LaneNode>();

  const addNode = (node: LaneNode): void => {
    if (!nodeById.has(node.id)) {
      nodes.push(node);
      nodeById.set(node.id, node);
    }
  };

  const addEdge = (from: string, to: string, direction: LaneEdge["direction"] = "one-way"): void => {
    const start = nodeById.get(from);
    const end = nodeById.get(to);
    if (!start || !end) throw new Error(`Không tìm thấy nút làn đường cho cạnh ${from} -> ${to}`);
    edges.push({
      id: `${from}=>${to}`,
      from,
      to,
      distance: distanceBetween(start, end),
      direction,
    });
  };

  const { layout } = geometry;
  const centerX = layout.centerLaneCenterX;
  const leftX = layout.leftAisleCenterX;
  const rightX = layout.rightAisleCenterX;

  // ── Entrance & Exit ────────────────────────────────────────────────────────
  const entranceNodeId = "entrance";
  const exitNodeId = "exit";
  addNode({ id: entranceNodeId, kind: "entrance", ...geometry.entrance });
  addNode({ id: exitNodeId, kind: "exit", ...geometry.exit });

  // ── Connector junction Y positions (top & bottom) ──────────────────────────
  const connTopY = geometry.horizontalConnectors[0]!.centerline.start.y;
  const connBottomY = geometry.horizontalConnectors[1]!.centerline.start.y;

  // ── Create junction nodes on all 3 aisles at connector Y + each row Y ──────
  // Collect all relevant Y values: each spot row + connector top/bottom
  const rowYValues: number[] = [];
  for (let n = 1; n <= SPOTS_PER_ZONE; n++) {
    const spot = geometry.spots.find((s) => s.number === n);
    if (spot) rowYValues.push(spot.y + spot.height / 2);
  }
  const allY = [...new Set([connTopY, ...rowYValues, connBottomY])].sort((a, b) => a - b);

  // Create junction nodes on center lane
  allY.forEach((y) => {
    addNode({ id: `center-${y}`, kind: "junction", x: centerX, y });
  });
  // Create junction nodes on left aisle
  allY.forEach((y) => {
    addNode({ id: `left-${y}`, kind: "junction", x: leftX, y });
  });
  // Create junction nodes on right aisle
  allY.forEach((y) => {
    addNode({ id: `right-${y}`, kind: "junction", x: rightX, y });
  });

  // ── Connect entrance → right aisle junctions → exit (bottom to top) ────────
  // Right aisle is the main road from entrance to exit
  const sortedDescY = [...allY].sort((a, b) => b - a); // descending Y = bottom first
  
  // Add orthogonal corner nodes
  const entranceCornerId = "entrance-corner";
  addNode({ id: entranceCornerId, kind: "junction", x: rightX, y: geometry.entrance.y });
  
  const exitCornerId = "exit-corner";
  addNode({ id: exitCornerId, kind: "junction", x: rightX, y: geometry.exit.y });

  const rightPathCorrect = [
    entranceNodeId,
    entranceCornerId,
    ...sortedDescY.map((y) => `right-${y}`),
    exitCornerId,
    exitNodeId,
  ];
  for (let i = 0; i < rightPathCorrect.length - 1; i++) {
    const from = rightPathCorrect[i]!;
    const to = rightPathCorrect[i + 1]!;
    addEdge(from, to);
  }

  // ── Connect center lane and left aisle junctions vertically (bidirectional for flexibility) ──
  const sortedAscY = [...allY].sort((a, b) => a - b);
  for (let i = 0; i < sortedAscY.length - 1; i++) {
    const y1 = sortedAscY[i]!;
    const y2 = sortedAscY[i + 1]!;
    addEdge(`left-${y1}`, `left-${y2}`, "two-way");
    addEdge(`center-${y1}`, `center-${y2}`, "two-way");
  }

  // ── Horizontal connectors: connect center ↔ left ↔ right at ALL row levels ──
  // Cho phép xe di chuyển ngang giữa các aisle ở mọi hàng
  allY.forEach((y) => {
    addEdge(`center-${y}`, `left-${y}`, "two-way");
    addEdge(`center-${y}`, `right-${y}`, "two-way");
  });

  // ── Spot entry nodes ───────────────────────────────────────────────────────
  geometry.spots.forEach((spot) => {
    const entryId = `spot-${spot.id}`;
    spotEntryNodeIds[spot.id] = entryId;
    addNode({ id: entryId, kind: "spot-entry", ...spot.entryPoint });

    const spotCenterY = spot.y + spot.height / 2;

    // Connect from the appropriate aisle junction to the spot entry
    let aisleJunctionId: string;
    if (spot.zone === "F" || spot.zone === "E") {
      aisleJunctionId = `left-${spotCenterY}`;
    } else if (spot.zone === "D" || spot.zone === "C") {
      aisleJunctionId = `center-${spotCenterY}`;
    } else {
      // B, A
      aisleJunctionId = `right-${spotCenterY}`;
    }

    if (nodeById.has(aisleJunctionId)) {
      addEdge(aisleJunctionId, entryId);
    }
  });

  // ── Access anchors ─────────────────────────────────────────────────────────
  Object.values(geometry.anchors).forEach((anchor) => {
    addNode({ id: `anchor-${anchor.id}`, kind: "access-anchor", x: anchor.x, y: anchor.y });
  });

  return { nodes, edges, entranceNodeId, exitNodeId, spotEntryNodeIds };
}

export function updateGateNodesInGraph(
  graph: LaneGraph,
  gateRoi: {
    entry_gate: { p1: { x: number; y: number }; p2: { x: number; y: number } };
    exit_gate: { p1: { x: number; y: number }; p2: { x: number; y: number } };
  }
): void {
  const entranceNode = graph.nodes.find((n) => n.id === graph.entranceNodeId);
  if (entranceNode && gateRoi.entry_gate) {
    entranceNode.x = (gateRoi.entry_gate.p1.x + gateRoi.entry_gate.p2.x) / 2;
    entranceNode.y = (gateRoi.entry_gate.p1.y + gateRoi.entry_gate.p2.y) / 2;
  }

  const exitNode = graph.nodes.find((n) => n.id === graph.exitNodeId);
  if (exitNode && gateRoi.exit_gate) {
    exitNode.x = (gateRoi.exit_gate.p1.x + gateRoi.exit_gate.p2.x) / 2;
    exitNode.y = (gateRoi.exit_gate.p1.y + gateRoi.exit_gate.p2.y) / 2;
  }
}

export const LANE_GRAPH = buildLaneGraph();
