// ../frontend/src/domain/parking.ts
var MAIN_ZONE_ORDER = ["F", "E", "D", "C", "B", "A"];
var SPOTS_PER_ZONE = 10;
var LEFT_ZONES = /* @__PURE__ */ new Set(["F", "E", "D"]);
function formatSpotId(zone, number) {
  return `${zone}${String(number).padStart(2, "0")}`;
}

// ../frontend/src/geometry/parkingGeometry.ts
var MAP_WIDTH = 1200;
var MAP_HEIGHT = 900;
var SPOT_WIDTH = 90;
var SPOT_HEIGHT = 56;
var SPOT_GAP = 10;
var FIRST_SPOT_Y = 112;
var ZONE_COLUMNS = {
  F: 110,
  E: 300,
  D: 390,
  C: 600,
  B: 690,
  A: 890
};
var LEFT_AISLE_X = 210;
var LEFT_AISLE_WIDTH = 80;
var CENTER_LANE_X = 500;
var CENTER_LANE_WIDTH = 80;
var RIGHT_AISLE_X = 800;
var RIGHT_AISLE_WIDTH = 80;
var ENTRANCE_Y = 860;
var EXIT_Y = 35;
var CONNECTOR_TOP_Y = 75;
var CONNECTOR_BOTTOM_Y = 775;
var CONNECTOR_HEIGHT = 30;
function spotY(slotNumber) {
  const indexFromTop = SPOTS_PER_ZONE - slotNumber;
  return FIRST_SPOT_Y + indexFromTop * (SPOT_HEIGHT + SPOT_GAP);
}
function getAisleCenterX(zone) {
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
function getEntryPoint(zone, spotX, spotCenterY) {
  const aisleCenterX = getAisleCenterX(zone);
  if (spotX < aisleCenterX) {
    return { x: spotX + SPOT_WIDTH + 8, y: spotCenterY };
  } else {
    return { x: spotX - 8, y: spotCenterY };
  }
}
function generateParkingGeometry() {
  const zones = [];
  const spots = [];
  const centerLaneCenterX = CENTER_LANE_X + CENTER_LANE_WIDTH / 2;
  const leftAisleCenterX = LEFT_AISLE_X + LEFT_AISLE_WIDTH / 2;
  const rightAisleCenterX = RIGHT_AISLE_X + RIGHT_AISLE_WIDTH / 2;
  MAIN_ZONE_ORDER.forEach((zoneId) => {
    const columnX = ZONE_COLUMNS[zoneId];
    const side = LEFT_ZONES.has(zoneId) ? "left" : "right";
    const spotIds = [];
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
        entryPoint: getEntryPoint(zoneId, columnX, centerY)
      });
    }
    const topY = spotY(SPOTS_PER_ZONE);
    const bottomY = spotY(1) + SPOT_HEIGHT;
    zones.push({
      id: zoneId,
      bounds: { x: columnX, y: topY, width: SPOT_WIDTH, height: bottomY - topY },
      side,
      spotIds
    });
  });
  const aisles = [
    {
      id: "left-aisle",
      bounds: { x: LEFT_AISLE_X, y: 0, width: LEFT_AISLE_WIDTH, height: MAP_HEIGHT },
      centerX: leftAisleCenterX
    },
    {
      id: "center-lane",
      bounds: { x: CENTER_LANE_X, y: 0, width: CENTER_LANE_WIDTH, height: MAP_HEIGHT },
      centerX: centerLaneCenterX
    },
    {
      id: "right-aisle",
      bounds: { x: RIGHT_AISLE_X, y: 0, width: RIGHT_AISLE_WIDTH, height: MAP_HEIGHT },
      centerX: rightAisleCenterX
    }
  ];
  const ROAD_END_X = 1100;
  const horizontalConnectors = [
    {
      id: "connector-top",
      bounds: {
        x: leftAisleCenterX,
        y: CONNECTOR_TOP_Y,
        width: ROAD_END_X - leftAisleCenterX,
        height: CONNECTOR_HEIGHT
      },
      centerline: {
        start: { x: leftAisleCenterX, y: CONNECTOR_TOP_Y + CONNECTOR_HEIGHT / 2 },
        end: { x: ROAD_END_X, y: CONNECTOR_TOP_Y + CONNECTOR_HEIGHT / 2 }
      }
    },
    {
      id: "connector-bottom",
      bounds: {
        x: leftAisleCenterX,
        y: CONNECTOR_BOTTOM_Y,
        width: ROAD_END_X - leftAisleCenterX,
        height: CONNECTOR_HEIGHT
      },
      centerline: {
        start: { x: leftAisleCenterX, y: CONNECTOR_BOTTOM_Y + CONNECTOR_HEIGHT / 2 },
        end: { x: ROAD_END_X, y: CONNECTOR_BOTTOM_Y + CONNECTOR_HEIGHT / 2 }
      }
    }
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
      exitY: EXIT_Y
    },
    spots,
    zones,
    aisles,
    horizontalConnectors,
    entrance: { x: ROAD_END_X, y: CONNECTOR_BOTTOM_Y + CONNECTOR_HEIGHT / 2 },
    exit: { x: ROAD_END_X, y: CONNECTOR_TOP_Y + CONNECTOR_HEIGHT / 2 },
    anchors: {
      shopping: { id: "shopping", label: "Shopping", x: centerLaneCenterX, y: 840 },
      services: { id: "services", label: "D\u1ECBch v\u1EE5", x: 50, y: MAP_HEIGHT / 2 },
      entertainment: { id: "entertainment", label: "Gi\u1EA3i tr\xED", x: centerLaneCenterX, y: 40 }
    }
  };
}
var PARKING_GEOMETRY = generateParkingGeometry();
var SPOT_GEOMETRY_BY_ID = new Map(
  PARKING_GEOMETRY.spots.map((spot) => [spot.id, spot])
);
function distanceBetween(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

// ../frontend/src/routing/laneGraph.ts
function buildLaneGraph(geometry = PARKING_GEOMETRY) {
  const nodes = [];
  const edges = [];
  const spotEntryNodeIds = {};
  const nodeById = /* @__PURE__ */ new Map();
  const addNode = (node) => {
    if (!nodeById.has(node.id)) {
      nodes.push(node);
      nodeById.set(node.id, node);
    }
  };
  const addEdge = (from, to, direction = "one-way") => {
    const start = nodeById.get(from);
    const end = nodeById.get(to);
    if (!start || !end) throw new Error(`Kh\xF4ng t\xECm th\u1EA5y n\xFAt l\xE0n \u0111\u01B0\u1EDDng cho c\u1EA1nh ${from} -> ${to}`);
    edges.push({
      id: `${from}=>${to}`,
      from,
      to,
      distance: distanceBetween(start, end),
      direction
    });
  };
  const { layout } = geometry;
  const centerX = layout.centerLaneCenterX;
  const leftX = layout.leftAisleCenterX;
  const rightX = layout.rightAisleCenterX;
  const entranceNodeId = "entrance";
  const exitNodeId = "exit";
  addNode({ id: entranceNodeId, kind: "entrance", ...geometry.entrance });
  addNode({ id: exitNodeId, kind: "exit", ...geometry.exit });
  const connTopY = geometry.horizontalConnectors[0].centerline.start.y;
  const connBottomY = geometry.horizontalConnectors[1].centerline.start.y;
  const rowYValues = [];
  for (let n = 1; n <= SPOTS_PER_ZONE; n++) {
    const spot = geometry.spots.find((s) => s.number === n);
    if (spot) rowYValues.push(spot.y + spot.height / 2);
  }
  const allY = [.../* @__PURE__ */ new Set([connTopY, ...rowYValues, connBottomY])].sort((a, b) => a - b);
  allY.forEach((y) => {
    addNode({ id: `center-${y}`, kind: "junction", x: centerX, y });
  });
  allY.forEach((y) => {
    addNode({ id: `left-${y}`, kind: "junction", x: leftX, y });
  });
  allY.forEach((y) => {
    addNode({ id: `right-${y}`, kind: "junction", x: rightX, y });
  });
  const sortedDescY = [...allY].sort((a, b) => b - a);
  const entranceCornerId = "entrance-corner";
  addNode({ id: entranceCornerId, kind: "junction", x: rightX, y: geometry.entrance.y });
  const exitCornerId = "exit-corner";
  addNode({ id: exitCornerId, kind: "junction", x: rightX, y: geometry.exit.y });
  const rightPathCorrect = [
    entranceNodeId,
    entranceCornerId,
    ...sortedDescY.map((y) => `right-${y}`),
    exitCornerId,
    exitNodeId
  ];
  for (let i = 0; i < rightPathCorrect.length - 1; i++) {
    const from = rightPathCorrect[i];
    const to = rightPathCorrect[i + 1];
    addEdge(from, to);
  }
  const sortedAscY = [...allY].sort((a, b) => a - b);
  for (let i = 0; i < sortedAscY.length - 1; i++) {
    const y1 = sortedAscY[i];
    const y2 = sortedAscY[i + 1];
    addEdge(`left-${y1}`, `left-${y2}`, "two-way");
    addEdge(`center-${y1}`, `center-${y2}`, "two-way");
  }
  [connTopY, connBottomY].forEach((y) => {
    addEdge(`center-${y}`, `left-${y}`, "two-way");
    addEdge(`center-${y}`, `right-${y}`, "two-way");
  });
  geometry.spots.forEach((spot) => {
    const entryId = `spot-${spot.id}`;
    spotEntryNodeIds[spot.id] = entryId;
    addNode({ id: entryId, kind: "spot-entry", ...spot.entryPoint });
    const spotCenterY = spot.y + spot.height / 2;
    let aisleJunctionId;
    if (spot.zone === "F" || spot.zone === "E") {
      aisleJunctionId = `left-${spotCenterY}`;
    } else if (spot.zone === "D" || spot.zone === "C") {
      aisleJunctionId = `center-${spotCenterY}`;
    } else {
      aisleJunctionId = `right-${spotCenterY}`;
    }
    if (nodeById.has(aisleJunctionId)) {
      addEdge(aisleJunctionId, entryId);
    }
  });
  Object.values(geometry.anchors).forEach((anchor) => {
    addNode({ id: `anchor-${anchor.id}`, kind: "access-anchor", x: anchor.x, y: anchor.y });
  });
  return { nodes, edges, entranceNodeId, exitNodeId, spotEntryNodeIds };
}
var LANE_GRAPH = buildLaneGraph();

// ../frontend/src/routing/routeEngine.ts
function buildAdjacency(graph) {
  const adjacency = /* @__PURE__ */ new Map();
  graph.nodes.forEach((node) => adjacency.set(node.id, []));
  graph.edges.forEach((edge) => {
    adjacency.get(edge.from)?.push({ edgeId: edge.id, from: edge.from, to: edge.to, distance: edge.distance });
    if (edge.direction === "two-way") {
      adjacency.get(edge.to)?.push({ edgeId: edge.id, from: edge.to, to: edge.from, distance: edge.distance });
    }
  });
  return adjacency;
}
function findRoute(graph, startNodeId, endNodeId) {
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
  if (!nodeById.has(startNodeId) || !nodeById.has(endNodeId)) return null;
  const adjacency = buildAdjacency(graph);
  const targetNode = nodeById.get(endNodeId);
  const nodeOrder = new Map(graph.nodes.map((node, index) => [node.id, index]));
  const costPerMapUnit = graph.edges.reduce((minimum, edge) => {
    const from = nodeById.get(edge.from);
    const to = nodeById.get(edge.to);
    if (!from || !to) return minimum;
    const directDistance = Math.hypot(to.x - from.x, to.y - from.y);
    if (directDistance <= 0) return minimum;
    return Math.min(minimum, edge.distance / directDistance);
  }, Number.POSITIVE_INFINITY);
  const heuristicScale = Number.isFinite(costPerMapUnit) ? costPerMapUnit : 0;
  const heuristic = (nodeId) => {
    const node = nodeById.get(nodeId);
    return Math.hypot(targetNode.x - node.x, targetNode.y - node.y) * heuristicScale;
  };
  const open = /* @__PURE__ */ new Set([startNodeId]);
  const distances = /* @__PURE__ */ new Map([[startNodeId, 0]]);
  const estimates = /* @__PURE__ */ new Map([[startNodeId, heuristic(startNodeId)]]);
  const previous = /* @__PURE__ */ new Map();
  while (open.size > 0) {
    let current;
    let currentEstimate = Number.POSITIVE_INFINITY;
    let currentDistance = Number.POSITIVE_INFINITY;
    open.forEach((nodeId) => {
      const candidateEstimate = estimates.get(nodeId) ?? Number.POSITIVE_INFINITY;
      const candidateDistance = distances.get(nodeId) ?? Number.POSITIVE_INFINITY;
      const earlierNode = (nodeOrder.get(nodeId) ?? Number.POSITIVE_INFINITY) < (nodeOrder.get(current ?? "") ?? Number.POSITIVE_INFINITY);
      if (candidateEstimate < currentEstimate || candidateEstimate === currentEstimate && candidateDistance < currentDistance || candidateEstimate === currentEstimate && candidateDistance === currentDistance && earlierNode) {
        current = nodeId;
        currentEstimate = candidateEstimate;
        currentDistance = candidateDistance;
      }
    });
    if (!current || !Number.isFinite(currentDistance)) break;
    open.delete(current);
    if (current === endNodeId) break;
    (adjacency.get(current) ?? []).forEach((step) => {
      if (!nodeById.has(step.to)) return;
      const candidate = currentDistance + step.distance;
      if (candidate < (distances.get(step.to) ?? Number.POSITIVE_INFINITY)) {
        distances.set(step.to, candidate);
        estimates.set(step.to, candidate + heuristic(step.to));
        previous.set(step.to, { nodeId: step.from, edgeId: step.edgeId });
        open.add(step.to);
      }
    });
  }
  const finalDistance = distances.get(endNodeId) ?? Number.POSITIVE_INFINITY;
  if (!Number.isFinite(finalDistance)) return null;
  const reversedNodes = [endNodeId];
  const reversedEdges = [];
  let cursor = endNodeId;
  while (cursor !== startNodeId) {
    const prior = previous.get(cursor);
    if (!prior) return null;
    reversedEdges.push(prior.edgeId);
    cursor = prior.nodeId;
    reversedNodes.push(cursor);
  }
  const nodeIds = reversedNodes.reverse();
  const edgeIds = reversedEdges.reverse();
  return {
    nodeIds,
    edgeIds,
    points: nodeIds.map((nodeId) => {
      const node = nodeById.get(nodeId);
      if (!node) throw new Error(`Thi\u1EBFu n\xFAt ${nodeId} trong tuy\u1EBFn \u0111\u01B0\u1EDDng`);
      return { x: node.x, y: node.y };
    }),
    distance: finalDistance
  };
}
function findVehicleRoute(graph, spotId) {
  const targetNodeId = graph.spotEntryNodeIds[spotId];
  return targetNodeId ? findRoute(graph, graph.entranceNodeId, targetNodeId) : null;
}
function findExitRoute(graph, spotId) {
  const startNodeId = graph.spotEntryNodeIds[spotId];
  if (!startNodeId) return null;
  return findRoute(graph, startNodeId, graph.exitNodeId);
}
function routeFromPos(graph, vehicleX, vehicleY, targetNodeId) {
  const nodes = new Map(graph.nodes.map((n) => [n.id, n]));
  const projections = graph.edges.flatMap((edge) => {
    const a = nodes.get(edge.from), b = nodes.get(edge.to);
    if (!a || !b || [a.kind, b.kind].some((k) => k === "access-anchor" || k === "spot-entry")) return [];
    const dx = b.x - a.x, dy = b.y - a.y;
    const length2 = dx * dx + dy * dy;
    if (!length2) return [];
    const t = Math.max(0, Math.min(1, ((vehicleX - a.x) * dx + (vehicleY - a.y) * dy) / length2));
    const x = a.x + t * dx, y = a.y + t * dy;
    return [{ edge, a, b, x, y, distance: Math.hypot(x - vehicleX, y - vehicleY) }];
  }).sort((a, b) => a.distance - b.distance);
  const nearest = projections[0];
  if (!nearest || nearest.distance > 60) return null;
  const vehicleNodeId = "vehicle-pos";
  const vehicleNode = { id: vehicleNodeId, kind: "junction", x: nearest.x, y: nearest.y };
  const destinations = nearest.edge.direction === "two-way" ? [nearest.a, nearest.b] : [nearest.b];
  const tempEdges = destinations.map((node) => ({
    id: `vehicle=>${node.id}`,
    from: vehicleNodeId,
    to: node.id,
    distance: Math.hypot(node.x - nearest.x, node.y - nearest.y),
    direction: "one-way"
  }));
  const tempGraph = {
    ...graph,
    nodes: [...graph.nodes, vehicleNode],
    edges: [...graph.edges, ...tempEdges]
  };
  return findRoute(tempGraph, vehicleNodeId, targetNodeId);
}
function findExitRouteFromPos(graph, vehicleX, vehicleY, fallbackSpotId) {
  const result = routeFromPos(graph, vehicleX, vehicleY, graph.exitNodeId);
  if (result) return result;
  if (fallbackSpotId) {
    return findExitRoute(graph, fallbackSpotId);
  }
  return null;
}
function findInboundRouteFromPos(graph, vehicleX, vehicleY, spotId) {
  const targetNodeId = graph.spotEntryNodeIds[spotId];
  if (!targetNodeId) return null;
  const result = routeFromPos(graph, vehicleX, vehicleY, targetNodeId);
  if (result) return result;
  return null;
}
export {
  LANE_GRAPH,
  PARKING_GEOMETRY,
  findExitRoute,
  findExitRouteFromPos,
  findInboundRouteFromPos,
  findRoute,
  findVehicleRoute
};
