import type { SpotId } from "../domain/parking";
import type { LaneEdge, LaneGraph, LaneNode } from "./laneGraph";

interface DirectedStep {
  edgeId: string;
  from: string;
  to: string;
  distance: number;
}

export interface RouteResult {
  nodeIds: string[];
  edgeIds: string[];
  points: Array<Pick<LaneNode, "x" | "y">>;
  distance: number;
}

function buildAdjacency(graph: LaneGraph): Map<string, DirectedStep[]> {
  const adjacency = new Map<string, DirectedStep[]>();
  graph.nodes.forEach((node) => adjacency.set(node.id, []));

  graph.edges.forEach((edge) => {
    adjacency.get(edge.from)?.push({ edgeId: edge.id, from: edge.from, to: edge.to, distance: edge.distance });
    if (edge.direction === "two-way") {
      adjacency.get(edge.to)?.push({ edgeId: edge.id, from: edge.to, to: edge.from, distance: edge.distance });
    }
  });
  return adjacency;
}

export function findRoute(graph: LaneGraph, startNodeId: string, endNodeId: string): RouteResult | null {
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
  if (!nodeById.has(startNodeId) || !nodeById.has(endNodeId)) return null;

  const adjacency = buildAdjacency(graph);
  const unvisited = new Set(graph.nodes.map((node) => node.id));
  const distances = new Map<string, number>(graph.nodes.map((node) => [node.id, Number.POSITIVE_INFINITY]));
  const previous = new Map<string, { nodeId: string; edgeId: string }>();
  distances.set(startNodeId, 0);

  while (unvisited.size > 0) {
    let current: string | undefined;
    let currentDistance = Number.POSITIVE_INFINITY;
    unvisited.forEach((nodeId) => {
      const candidateDistance = distances.get(nodeId) ?? Number.POSITIVE_INFINITY;
      if (candidateDistance < currentDistance) {
        current = nodeId;
        currentDistance = candidateDistance;
      }
    });

    if (!current || !Number.isFinite(currentDistance)) break;
    unvisited.delete(current);
    if (current === endNodeId) break;

    (adjacency.get(current) ?? []).forEach((step) => {
      if (!unvisited.has(step.to)) return;
      const candidate = currentDistance + step.distance;
      if (candidate < (distances.get(step.to) ?? Number.POSITIVE_INFINITY)) {
        distances.set(step.to, candidate);
        previous.set(step.to, { nodeId: step.from, edgeId: step.edgeId });
      }
    });
  }

  const finalDistance = distances.get(endNodeId) ?? Number.POSITIVE_INFINITY;
  if (!Number.isFinite(finalDistance)) return null;

  const reversedNodes = [endNodeId];
  const reversedEdges: string[] = [];
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
      if (!node) throw new Error(`Thiếu nút ${nodeId} trong tuyến đường`);
      return { x: node.x, y: node.y };
    }),
    distance: finalDistance,
  };
}

export function findVehicleRoute(graph: LaneGraph, spotId: SpotId): RouteResult | null {
  const targetNodeId = graph.spotEntryNodeIds[spotId];
  return targetNodeId ? findRoute(graph, graph.entranceNodeId, targetNodeId) : null;
}

export function findExitRoute(graph: LaneGraph, spotId: SpotId): RouteResult | null {
  const startNodeId = graph.spotEntryNodeIds[spotId];
  if (!startNodeId) return null;
  // Tạo đồ thị hai chiều tạm thời cho luồng ra cổng exit
  const exitGraph: LaneGraph = {
    ...graph,
    edges: graph.edges.map((e) => ({ ...e, direction: "two-way" })),
  };
  return findRoute(exitGraph, startNodeId, graph.exitNodeId);
}

/**
 * Tìm nút (node) trong đồ thị gần nhất với tọa độ (x, y) hiện tại của xe.
 * Dùng để tính điểm xuất phát động khi xe đang di chuyển.
 */
export function findNearestNode(graph: LaneGraph, x: number, y: number): string | null {
  const nodes = findKNearestNodes(graph, x, y, 1);
  return nodes[0]?.id ?? null;
}

function findKNearestNodes(graph: LaneGraph, x: number, y: number, k: number = 2): LaneNode[] {
  const nodes = graph.nodes
    .filter((n) => n.kind !== "access-anchor" && n.kind !== "spot-entry")
    .map((n) => ({ node: n, d: Math.hypot(n.x - x, n.y - y) }))
    .sort((a, b) => a.d - b.d);
  return nodes.slice(0, k).map((item) => item.node);
}

function routeFromPos(graph: LaneGraph, vehicleX: number, vehicleY: number, targetNodeId: string): RouteResult | null {
  const nearestNodes = findKNearestNodes(graph, vehicleX, vehicleY, 2);
  if (nearestNodes.length === 0) return null;

  const vehicleNodeId = "vehicle-pos";
  const vehicleNode: LaneNode = { id: vehicleNodeId, kind: "junction", x: vehicleX, y: vehicleY };
  
  const tempEdges: LaneEdge[] = nearestNodes.map(node => ({
    id: `vehicle=>${node.id}`,
    from: vehicleNodeId,
    to: node.id,
    distance: Math.hypot(node.x - vehicleX, node.y - vehicleY),
    direction: "one-way"
  }));

  const tempGraph: LaneGraph = {
    ...graph,
    nodes: [...graph.nodes, vehicleNode],
    edges: [...graph.edges, ...tempEdges]
  };

  return findRoute(tempGraph, vehicleNodeId, targetNodeId);
}

/**
 * Tính đường từ tọa độ HIỆN TẠI của xe (x, y) ra CỔNG RA.
 * Nếu xe đang di chuyển, dùng hàm này để tính lại đường động (Re-routing).
 * Nếu không tìm thấy nút gần nhất, fallback về findExitRoute dựa trên ô đỗ.
 */
export function findExitRouteFromPos(
  graph: LaneGraph,
  vehicleX: number,
  vehicleY: number,
  fallbackSpotId?: SpotId,
): RouteResult | null {
  const exitGraph: LaneGraph = {
    ...graph,
    edges: graph.edges.map((e) => ({ ...e, direction: "two-way" })),
  };
  
  const result = routeFromPos(exitGraph, vehicleX, vehicleY, graph.exitNodeId);
  if (result) return result;

  // Fallback: tính từ ô đỗ ban đầu nếu không tìm được nút gần xe
  if (fallbackSpotId) {
    return findExitRoute(graph, fallbackSpotId);
  }
  return null;
}

/**
 * Tính đường từ tọa độ HIỆN TẠI của xe (x, y) đến ô đỗ đích (spotId).
 * Dùng để cập nhật đường vào thời gian thực khi xe đang di chuyển trong bãi.
 */
export function findInboundRouteFromPos(
  graph: LaneGraph,
  vehicleX: number,
  vehicleY: number,
  spotId: SpotId,
): RouteResult | null {
  const targetNodeId = graph.spotEntryNodeIds[spotId];
  if (!targetNodeId) return null;
  
  const result = routeFromPos(graph, vehicleX, vehicleY, targetNodeId);
  if (result) return result;

  // Fallback: tính từ Cổng Vào nếu không tìm được nút gần xe
  return findVehicleRoute(graph, spotId);
}

export function routeUsesOnlyValidEdges(graph: LaneGraph, route: RouteResult): boolean {
  const edgeById = new Map<string, LaneEdge>(graph.edges.map((edge) => [edge.id, edge]));
  return route.edgeIds.every((edgeId, index) => {
    const edge = edgeById.get(edgeId);
    const from = route.nodeIds[index];
    const to = route.nodeIds[index + 1];
    if (!edge || !from || !to) return false;
    return (
      (edge.from === from && edge.to === to) ||
      (edge.direction === "two-way" && edge.from === to && edge.to === from)
    );
  });
}
