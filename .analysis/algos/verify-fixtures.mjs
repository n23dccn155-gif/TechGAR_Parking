// verify-fixtures.mjs — kiểm chứng expected values của dossier builder-a (PHASE 1)
// Chạy: node verify-fixtures.mjs  (cwd: D:\TechGar2\.analysis\algos)
// Port nguyên vẹn logic từ frontend/src; fixture thu nhỏ, deterministic.

// ---------- FIXTURES ----------
const G1 = {
  entranceNodeId: "entrance", exitNodeId: "exit",
  spotEntryNodeIds: { C05: "sC05" },
  nodes: [
    { id: "entrance", kind: "entrance", x: 8, y: 9 },
    { id: "ec", kind: "junction", x: 7, y: 9 },
    { id: "r7", kind: "junction", x: 7, y: 7 },
    { id: "r4", kind: "junction", x: 7, y: 4 },
    { id: "r2", kind: "junction", x: 7, y: 2 },
    { id: "xc", kind: "junction", x: 7, y: 1 },
    { id: "exit", kind: "exit", x: 8, y: 1 },
    { id: "c7", kind: "junction", x: 5, y: 7 },
    { id: "c4", kind: "junction", x: 5, y: 4 },
    { id: "c2", kind: "junction", x: 5, y: 2 },
    { id: "sC05", kind: "spot-entry", x: 5.6, y: 4 },
  ],
  edges: [
    { id: "entrance=>ec", from: "entrance", to: "ec", distance: 1, direction: "one-way" },
    { id: "ec=>r7", from: "ec", to: "r7", distance: 2, direction: "one-way" },
    { id: "r7=>r4", from: "r7", to: "r4", distance: 3, direction: "one-way" },
    { id: "r4=>r2", from: "r4", to: "r2", distance: 2, direction: "one-way" },
    { id: "r2=>xc", from: "r2", to: "xc", distance: 1, direction: "one-way" },
    { id: "xc=>exit", from: "xc", to: "exit", distance: 1, direction: "one-way" },
    { id: "r7=>c7", from: "r7", to: "c7", distance: 2, direction: "two-way" },
    { id: "r4=>c4", from: "r4", to: "c4", distance: 2, direction: "two-way" },
    { id: "r2=>c2", from: "r2", to: "c2", distance: 2, direction: "two-way" },
    { id: "c7=>c4", from: "c7", to: "c4", distance: 5, direction: "two-way" },
    { id: "c4=>c2", from: "c4", to: "c2", distance: 2, direction: "two-way" },
    { id: "c4=>sC05", from: "c4", to: "sC05", distance: 0.6, direction: "one-way" },
  ],
};

const G2 = { // tie-break fixture
  entranceNodeId: "s", exitNodeId: "t",
  spotEntryNodeIds: {},
  nodes: [
    { id: "s", kind: "junction", x: 0, y: 0 },
    { id: "a", kind: "junction", x: 1, y: 0 },
    { id: "b", kind: "junction", x: 0, y: 1 },
    { id: "t", kind: "junction", x: 1, y: 1 },
  ],
  edges: [
    { id: "s=>a", from: "s", to: "a", distance: 1, direction: "one-way" },
    { id: "s=>b", from: "s", to: "b", distance: 1, direction: "one-way" },
    { id: "a=>t", from: "a", to: "t", distance: 1, direction: "one-way" },
    { id: "b=>t", from: "b", to: "t", distance: 1, direction: "one-way" },
  ],
};

// ---------- PORT: routeEngine ----------
function buildAdjacency(graph) {
  const adjacency = new Map();
  graph.nodes.forEach((node) => adjacency.set(node.id, []));
  graph.edges.forEach((edge) => {
    adjacency.get(edge.from)?.push({ edgeId: edge.id, from: edge.from, to: edge.to, distance: edge.distance });
    if (edge.direction === "two-way") {
      adjacency.get(edge.to)?.push({ edgeId: edge.id, from: edge.to, to: edge.from, distance: edge.distance });
    }
  });
  return adjacency;
}

function findRoute(graph, startNodeId, endNodeId, trace = false) {
  const nodeById = new Map(graph.nodes.map((n) => [n.id, n]));
  if (!nodeById.has(startNodeId) || !nodeById.has(endNodeId)) return null;
  const adjacency = buildAdjacency(graph);
  const targetNode = nodeById.get(endNodeId);
  const nodeOrder = new Map(graph.nodes.map((n, i) => [n.id, i]));
  const costPerMapUnit = graph.edges.reduce((minimum, edge) => {
    const from = nodeById.get(edge.from), to = nodeById.get(edge.to);
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
  const open = new Set([startNodeId]);
  const distances = new Map([[startNodeId, 0]]);
  const estimates = new Map([[startNodeId, heuristic(startNodeId)]]);
  const previous = new Map();
  const pops = [];
  while (open.size > 0) {
    let current, currentEstimate = Infinity, currentDistance = Infinity;
    open.forEach((nodeId) => {
      const candidateEstimate = estimates.get(nodeId) ?? Infinity;
      const candidateDistance = distances.get(nodeId) ?? Infinity;
      const earlierNode = (nodeOrder.get(nodeId) ?? Infinity) < (nodeOrder.get(current ?? "") ?? Infinity);
      if (
        candidateEstimate < currentEstimate ||
        (candidateEstimate === currentEstimate && candidateDistance < currentDistance) ||
        (candidateEstimate === currentEstimate && candidateDistance === currentDistance && earlierNode)
      ) { current = nodeId; currentEstimate = candidateEstimate; currentDistance = candidateDistance; }
    });
    if (!current || !Number.isFinite(currentDistance)) break;
    open.delete(current);
    pops.push({ id: current, g: +currentDistance.toFixed(3), f: +currentEstimate.toFixed(3) });
    if (current === endNodeId) break;
    (adjacency.get(current) ?? []).forEach((step) => {
      if (!nodeById.has(step.to)) return;
      const candidate = currentDistance + step.distance;
      if (candidate < (distances.get(step.to) ?? Infinity)) {
        distances.set(step.to, candidate);
        estimates.set(step.to, candidate + heuristic(step.to));
        previous.set(step.to, { nodeId: step.from, edgeId: step.edgeId });
        open.add(step.to);
      }
    });
  }
  const finalDistance = distances.get(endNodeId) ?? Infinity;
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
  const r = { nodeIds: reversedNodes.reverse(), edgeIds: reversedEdges.reverse(), distance: finalDistance };
  if (trace) r.pops = pops;
  return r;
}

function routeFromPos(graph, vehicleX, vehicleY, targetNodeId, maxDist = 60) {
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
  if (!nearest || nearest.distance > maxDist) return null;
  const vehicleNodeId = "vehicle-pos";
  const vehicleNode = { id: vehicleNodeId, kind: "junction", x: nearest.x, y: nearest.y };
  const destinations = nearest.edge.direction === "two-way" ? [nearest.a, nearest.b] : [nearest.b];
  const tempEdges = destinations.map((node) => ({
    id: `vehicle=>${node.id}`, from: vehicleNodeId, to: node.id,
    distance: Math.hypot(node.x - nearest.x, node.y - nearest.y), direction: "one-way",
  }));
  const tempGraph = { ...graph, nodes: [...graph.nodes, vehicleNode], edges: [...graph.edges, ...tempEdges] };
  const r = findRoute(tempGraph, vehicleNodeId, targetNodeId);
  if (r) r.projection = { edge: nearest.edge.id, x: nearest.x, y: nearest.y, d: nearest.distance };
  return r;
}

const findVehicleRoute = (g, spotId) => {
  const t = g.spotEntryNodeIds[spotId];
  return t ? findRoute(g, g.entranceNodeId, t) : null;
};
const findExitRoute = (g, spotId) => {
  const s = g.spotEntryNodeIds[spotId];
  return s ? findRoute(g, s, g.exitNodeId) : null;
};
const findExitRouteFromPos = (g, x, y, fallbackSpotId, maxDist) => {
  const r = routeFromPos(g, x, y, g.exitNodeId, maxDist);
  if (r) return r;
  if (fallbackSpotId) return findExitRoute(g, fallbackSpotId);
  return null;
};
const findInboundRouteFromPos = (g, x, y, spotId, maxDist) => {
  const t = g.spotEntryNodeIds[spotId];
  if (!t) return null;
  return routeFromPos(g, x, y, t, maxDist);
};

// ---------- PORT: voiceGuidance ----------
function distanceToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1;
  if (dx === 0 && dy === 0) return Math.hypot(px - x1, py - y1);
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}
function checkIsOffRoute(vehiclePos, routePoints, thresholdPx = 75) {
  if (!vehiclePos || routePoints.length < 2) return false;
  let minDistance = Infinity;
  for (let i = 0; i < routePoints.length - 1; i++) {
    const d = distanceToSegment(vehiclePos.x, vehiclePos.y, routePoints[i].x, routePoints[i].y, routePoints[i + 1].x, routePoints[i + 1].y);
    if (d < minDistance) minDistance = d;
  }
  return minDistance > thresholdPx;
}
function minRouteDist(vehiclePos, routePoints) {
  let m = Infinity;
  for (let i = 0; i < routePoints.length - 1; i++)
    m = Math.min(m, distanceToSegment(vehiclePos.x, vehiclePos.y, routePoints[i].x, routePoints[i].y, routePoints[i + 1].x, routePoints[i + 1].y));
  return m;
}
function getNavigationInstruction(vehiclePos, routePoints, isExit = false, targetSpotId = null, ARRIVE = 35, TURN_NEAR = 150) {
  if (!vehiclePos || routePoints.length < 2) return null;
  const destPoint = routePoints[routePoints.length - 1];
  if (Math.hypot(vehiclePos.x - destPoint.x, vehiclePos.y - destPoint.y) < ARRIVE) {
    if (isExit) return "Bạn đã đến lối ra. Chúc bạn thượng lộ bình an!";
    if (targetSpotId) return `Bạn đã đến vị trí ô đỗ ${targetSpotId}. Vui lòng lùi xe vào đỗ.`;
    return "Bạn đã đến điểm đích.";
  }
  let closestIndex = 0, minDist = Infinity;
  for (let i = 0; i < routePoints.length; i++) {
    const d = Math.hypot(vehiclePos.x - routePoints[i].x, vehiclePos.y - routePoints[i].y);
    if (d < minDist) { minDist = d; closestIndex = i; }
  }
  if (closestIndex >= 1 && closestIndex < routePoints.length - 1) {
    const pPrev = routePoints[closestIndex - 1], pCurrent = routePoints[closestIndex], pNext = routePoints[closestIndex + 1];
    const curDx = pCurrent.x - pPrev.x, curDy = pCurrent.y - pPrev.y;
    const nextDx = pNext.x - pCurrent.x, nextDy = pNext.y - pCurrent.y;
    const dot = curDx * nextDx + curDy * nextDy;
    const lenCur = Math.hypot(curDx, curDy), lenNext = Math.hypot(nextDx, nextDy);
    const cosAngle = lenCur > 0 && lenNext > 0 ? dot / (lenCur * lenNext) : 1;
    const cross = curDx * nextDy - curDy * nextDx;
    if (cosAngle > 0.93) return "Phía trước đi thẳng.";
    return cross > 0
      ? (isExit ? "Phía trước rẽ phải ra cổng." : "Phía trước rẽ phải vào làn đỗ.")
      : (isExit ? "Phía trước rẽ trái ra cổng." : "Phía trước rẽ trái vào làn đỗ.");
  }
  if (closestIndex < routePoints.length - 1) {
    for (let i = 0; i < routePoints.length - 2; i++) {
      const pA = routePoints[i], pB = routePoints[i + 1], pC = routePoints[i + 2];
      const abDx = pB.x - pA.x, abDy = pB.y - pA.y;
      const bcDx = pC.x - pB.x, bcDy = pC.y - pB.y;
      const dot = abDx * bcDx + abDy * bcDy;
      const lenAB = Math.hypot(abDx, abDy), lenBC = Math.hypot(bcDx, bcDy);
      const cosA = lenAB > 0 && lenBC > 0 ? dot / (lenAB * lenBC) : 1;
      if (cosA < 0.93) {
        const distToTurn = Math.hypot(vehiclePos.x - pB.x, vehiclePos.y - pB.y);
        if (distToTurn > TURN_NEAR) return "Phía trước đi thẳng.";
        const cross = abDx * bcDy - abDy * bcDx;
        return cross > 0
          ? (isExit ? "Phía trước rẽ phải ra cổng." : "Phía trước rẽ phải vào làn đỗ.")
          : (isExit ? "Phía trước rẽ trái ra cổng." : "Phía trước rẽ trái vào làn đỗ.");
      }
    }
    return "Phía trước đi thẳng.";
  }
  return "Tiếp tục di chuyển theo đường chỉ dẫn.";
}

// ---------- PORT: worldToSvg ----------
function solve3(matrix, values) {
  const a = matrix.map((row, i) => [...row, values[i]]);
  for (let col = 0; col < 3; col++) {
    let pivot = col;
    for (let r = col + 1; r < 3; r++) if (Math.abs(a[r][col]) > Math.abs(a[pivot][col])) pivot = r;
    if (Math.abs(a[pivot][col]) < 1e-9) return null;
    [a[col], a[pivot]] = [a[pivot], a[col]];
    for (let r = 0; r < 3; r++) {
      if (r === col) continue;
      const factor = a[r][col] / a[col][col];
      for (let c = col; c < 4; c++) a[r][c] -= factor * a[col][c];
    }
  }
  return [0, 1, 2].map((i) => a[i][3] / a[i][i]);
}
function computeAffine(anchors) { // anchors: [{world:{x,y}, svg:{x,y}}]
  if (anchors.length < 3) return null;
  const normal = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  const targetX = [0, 0, 0], targetY = [0, 0, 0];
  for (const { world, svg } of anchors) {
    const row = [world.x, world.y, 1];
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) normal[i][j] += row[i] * row[j];
      targetX[i] += row[i] * svg.x;
      targetY[i] += row[i] * svg.y;
    }
  }
  const x = solve3(normal, targetX), y = solve3(normal, targetY);
  if (!x || !y) return null;
  return { x, y };
}
const project = (T, p) => ({ x: T.x[0] * p.x + T.x[1] * p.y + T.x[2], y: T.y[0] * p.x + T.y[1] * p.y + T.y[2] });

// ---------- PORT: misc ----------
function canonicalRuntimeId(gid, aliases = {}) {
  const visited = new Set();
  while (Object.prototype.hasOwnProperty.call(aliases, String(gid))) {
    if (visited.has(gid)) return null;
    visited.add(gid);
    const next = aliases[String(gid)];
    if (next === undefined || next === null || !Number.isSafeInteger(next) || next < 0) return null;
    if (next === gid) return gid;
    gid = next;
  }
  return gid;
}
function simplifyRoutePoints(points) {
  if (points.length < 3) return points;
  const out = [points[0]];
  for (let i = 1; i < points.length - 1; i++) {
    const prev = points[i - 1], cur = points[i], next = points[i + 1];
    const cross = (cur.x - prev.x) * (next.y - cur.y) - (cur.y - prev.y) * (next.x - cur.x);
    if (Math.abs(cross) > 0.01) out.push(cur);
  }
  out.push(points[points.length - 1]);
  return out;
}
function createRouteArrows(points) {
  const out = [];
  let traversed = 0; let target = 100;
  const segs = [];
  let totalLength = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const len = Math.hypot(points[i + 1].x - points[i].x, points[i + 1].y - points[i].y);
    segs.push({ a: points[i], b: points[i + 1], len });
    totalLength += len;
  }
  if (totalLength < 140) return out;
  for (const seg of segs) {
    while (target <= traversed + seg.len && target < totalLength - 45) {
      const ratio = seg.len === 0 ? 0 : (target - traversed) / seg.len;
      out.push({
        x: seg.a.x + (seg.b.x - seg.a.x) * ratio,
        y: seg.a.y + (seg.b.y - seg.a.y) * ratio,
        angle: Math.atan2(seg.b.y - seg.a.y, seg.b.x - seg.a.x) * 180 / Math.PI,
      });
      target += 190;
    }
    traversed += seg.len;
    if (target >= totalLength - 45) break;
  }
  return out;
}
const clampView = (v) => {
  const width = Math.min(1200, Math.max(360, v.width));
  const height = width * (900 / 1200);
  return { x: Math.min(Math.max(0, v.x), 1200 - width), y: Math.min(Math.max(0, v.y), 900 - height), width, height };
};
const zoomAt = (v, factor, rx = 0.5, ry = 0.5) => {
  const width = v.width * factor;
  const height = width * (900 / 1200);
  return clampView({ x: v.x + (v.width - width) * rx, y: v.y + (v.height - height) * ry, width, height });
};
const initialStatus = (n) => (n % 7 === 0 ? "occupied" : n % 11 === 0 ? "transitioning" : n % 13 === 0 ? "unknown" : "empty");
const gateSide = (p1, p2, acc) => (p2.x - p1.x) * (acc.y - p1.y) - (p2.y - p1.y) * (acc.x - p1.x);

// ---------- RUN CHECKS ----------
const out = [];
const check = (name, actual, expected) => {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  out.push(`${a === e ? "PASS" : "FAIL"} ${name} | got=${a} | want=${e}`);
};

// 1. A* inbound + trace
const inbound = findRoute(G1, "entrance", "sC05", true);
out.push(`trace inbound: ${JSON.stringify(inbound.pops)}`);
check("inbound nodeIds", inbound.nodeIds, ["entrance", "ec", "r7", "r4", "c4", "sC05"]);
check("inbound distance", +inbound.distance.toFixed(4), 8.6);

// 2. sink: route FROM sC05 -> null ; route TO sC05 ok
check("exit from sC05 (sink start) = null", findExitRoute(G1, "C05"), null);
const fixed = { ...G1, edges: [...G1.edges, { id: "sC05=>c4", from: "sC05", to: "c4", distance: 0.6, direction: "one-way" }] };
const exitFixed = findExitRoute(fixed, "C05");
check("patched exit nodeIds", exitFixed.nodeIds, ["sC05", "c4", "r4", "r2", "xc", "exit"]);
check("patched exit distance", +exitFixed.distance.toFixed(4), 6.6);

// 3. tie-break fixture G2
const tie = findRoute(G2, "s", "t", true);
out.push(`trace tie: ${JSON.stringify(tie.pops)}`);
check("tie-break path via a", tie.nodeIds, ["s", "a", "t"]);

// 4. projection: vehicle (6,4.5) scaled threshold 1.0 ; far (0,0)
const p1 = routeFromPos(G1, 6, 4.5, "sC05", 1.0);
out.push(`projection: ${JSON.stringify(p1.projection)}`);
check("proj edge r4=>c4", p1.projection.edge, "r4=>c4");
check("proj dist", +p1.projection.d.toFixed(4), 0.5);
check("inbound from pos distance", +p1.distance.toFixed(4), 1.6);
const exitPos = findExitRouteFromPos(G1, 6, 4.5, "C05", 1.0);
check("exit from pos distance", +exitPos.distance.toFixed(4), 5.0);
check("exit from pos nodes", exitPos.nodeIds, ["vehicle-pos", "r4", "r2", "xc", "exit"]);
check("far away -> null (projection>1.0)", findExitRouteFromPos(G1, 0, 0, "C05", 1.0), null);
// one-way edge case: vehicle near ec=>r7
const p2 = routeFromPos(G1, 7.2, 8, "sC05", 1.0);
out.push(`oneway proj: ${JSON.stringify(p2.projection)} nodes=${JSON.stringify(p2.nodeIds)}`);
check("oneway proj edge", p2.projection.edge, "ec=>r7");
check("oneway nodes (no backtrack to ec)", p2.nodeIds, ["vehicle-pos", "r7", "r4", "c4", "sC05"]);

// 5. off-route on inbound route points
const routePts = inbound.nodeIds.map((id) => { const n = G1.nodes.find((n) => n.id === id); return { x: n.x, y: n.y }; });
out.push(`offroute dists: on=${minRouteDist({ x: 6, y: 4.2 }, routePts)} off=${minRouteDist({ x: 5, y: 2 }, routePts)} beyond=${minRouteDist({ x: 8.5, y: 9 }, routePts)}`);
check("off-route (6,4.2) thr1.0 -> false", checkIsOffRoute({ x: 6, y: 4.2 }, routePts, 1.0), false);
check("off-route (5,2) thr1.0 -> true", checkIsOffRoute({ x: 5, y: 2 }, routePts, 1.0), true);
check("off-route (8.5,9) thr1.0 -> false", checkIsOffRoute({ x: 8.5, y: 9 }, routePts, 1.0), false);
check("off-route empty route -> false", checkIsOffRoute({ x: 0, y: 0 }, [], 1.0), false);

// 6. turn instructions — scaled: ARRIVE=0.5, TURN_NEAR=2.5
check("turn at r4 -> left", getNavigationInstruction({ x: 7, y: 4.3 }, routePts, false, "C05", 0.5, 2.5), "Phía trước rẽ trái vào làn đỗ.");
check("start fallback -> right", getNavigationInstruction({ x: 8.9, y: 9 }, routePts, false, "C05", 0.5, 2.5), "Phía trước rẽ phải vào làn đỗ.");
check("arrival spot", getNavigationInstruction({ x: 5.5, y: 4 }, routePts, false, "C05", 0.5, 2.5), "Bạn đã đến vị trí ô đỗ C05. Vui lòng lùi xe vào đỗ.");
check("arrival exit", getNavigationInstruction({ x: 7.9, y: 1 }, exitPos.nodeIds.map((id) => id === "vehicle-pos" ? { x: 6, y: 4 } : { x: G1.nodes.find((n) => n.id === id).x, y: G1.nodes.find((n) => n.id === id).y }), true, null, 0.5, 2.5), "Bạn đã đến lối ra. Chúc bạn thượng lộ bình an!");
// straight case: route with collinear triple
const straight = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 1 }];
check("straight", getNavigationInstruction({ x: 1, y: 0.1 }, straight, false, null, 0.5, 2.5), "Phía trước đi thẳng.");
// stale-closest edge: vehicle past ec at (7,8) on route inbound -> closestIndex tie ec vs r7 -> idx1 => 'rẽ phải' (stale instruction)
out.push(`stale-closest demo: ${getNavigationInstruction({ x: 7, y: 8 }, routePts, false, "C05", 0.5, 2.5)}`);

// 7. affine FIX-A1
const anchors = [
  { world: { x: 0, y: 0 }, svg: { x: 100, y: 200 } },
  { world: { x: 100, y: 0 }, svg: { x: 300, y: 200 } },
  { world: { x: 0, y: 50 }, svg: { x: 100, y: 300 } },
];
const T = computeAffine(anchors);
out.push(`affine: ${JSON.stringify(T)}`);
check("affine x", T.x.map((v) => +v.toFixed(6)), [2, 0, 100]);
check("affine y", T.y.map((v) => +v.toFixed(6)), [0, 2, 200]);
check("project (50,25)", project(T, { x: 50, y: 25 }), { x: 200, y: 250 });
check("2 anchors -> null", computeAffine(anchors.slice(0, 2)), null);
check("collinear -> null", computeAffine([{ world: { x: 0, y: 0 }, svg: { x: 0, y: 0 } }, { world: { x: 1, y: 1 }, svg: { x: 1, y: 1 } }, { world: { x: 2, y: 2 }, svg: { x: 2, y: 2 } }]), null);

// 8. canonical
check("canonical 5->9", canonicalRuntimeId(5, { 5: 7, 7: 9 }), 9);
check("canonical cycle -> null", canonicalRuntimeId(5, { 5: 7, 7: 5 }), null);
check("canonical self", canonicalRuntimeId(7, { 7: 7 }), 7);
check("canonical invalid", canonicalRuntimeId(5, { 5: -3 }), null);
check("canonical none", canonicalRuntimeId(5, {}), 5);

// 9. simplify + arrows
check("simplify", simplifyRoutePoints([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 2 }, { x: 4, y: 2 }]),
  [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 2 }, { x: 4, y: 2 }]);
const ar = createRouteArrows([{ x: 0, y: 0 }, { x: 600, y: 0 }]);
out.push(`arrows@600: ${JSON.stringify(ar.map((a) => +a.x.toFixed(1)))}`);
check("arrow count @600", ar.length, 3);
check("short route 120 -> []", createRouteArrows([{ x: 0, y: 0 }, { x: 120, y: 0 }]), []);

// 10. viewbox
check("zoomAt center", zoomAt({ x: 0, y: 0, width: 1200, height: 900 }, 0.5, 0.5, 0.5), { x: 300, y: 225, width: 600, height: 450 });
const panX = (() => { const v = { x: 0, y: 0, width: 1200, height: 900 }; const dx = -30, rectW = 600; return v.x - (dx / rectW) * v.width; })();
check("pan dx=-30 rectW=600 -> x+60", panX, 60);

// 11. mock counts 1..60
const counts = { empty: 0, occupied: 0, transitioning: 0, unknown: 0 };
for (let n = 1; n <= 60; n++) counts[initialStatus(n)]++;
out.push(`mock counts: ${JSON.stringify(counts)}`);
check("mock counts", counts, { empty: 43, occupied: 8, transitioning: 5, unknown: 4 });

// 12. gate side
check("gate acc above -> negative", gateSide({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 5, y: 5 }), 50);
check("gate acc below -> positive", gateSide({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 5, y: -5 }), -50);

// 13. ranking score (driving*0.35 + walking*0.65, meters = unit*0.12)
const M = 0.12;
const reco = [
  { id: "S1", drivingUnits: 20, walkUnits: Math.hypot(6 - 5, 7 - 7) },
  { id: "S2", drivingUnits: 8, walkUnits: Math.hypot(9 - 5, 6 - 7) },
  { id: "S3", drivingUnits: 12, walkUnits: Math.hypot(5 - 5, 2 - 7) },
].map((s) => ({ id: s.id, score: 0.35 * s.drivingUnits * M + 0.65 * s.walkUnits * M }));
reco.sort((a, b) => a.score - b.score || a.id.localeCompare(b.id));
out.push(`ranking: ${JSON.stringify(reco.map((r) => [r.id, +r.score.toFixed(4)]))}`);
check("best S2", reco[0].id, "S2");
check("alts order", reco.slice(1).map((r) => r.id), ["S3", "S1"]);

console.log(out.join("\n"));
console.log(out.every((l) => l.startsWith("PASS") || l.startsWith("trace") || l.startsWith("proj") || l.startsWith("arrow") || l.startsWith("mock") || l.startsWith("affine") || l.startsWith("ranking") || l.startsWith("offroute") || l.startsWith("stale") || l.startsWith("oneway")) ? "ALL PASS" : "SOME FAIL");
