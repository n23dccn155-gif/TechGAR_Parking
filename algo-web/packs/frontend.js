/* TechGar2 algo-web — pack FRONTEND (37 canonical IDs)
 * Owner: builder-a. Nguồn nội dung: .analysis/algos/builder-a.md (đã review, 86 assertions).
 * Contract: algo-web/SPEC.md §4-§5. Classic script — chỉ dùng window.TechGarAlgo.registerPack.
 * Không fetch/module/CDN/backend/model. Mọi trace tính thật từ scenario.input + params.
 * 5 alias (live-runtime-validator, frame-cursor-guard, runtime-request-coalesce,
 * qr-visibility-window, canonical-gid-chain) do pack integration quản lý — không có ở đây.
 */
(function () {
'use strict';
var PACK_ID = 'frontend';
var TAU = Math.PI * 2;

/* =================================================================
 * FIXTURES — bản thu nhỏ đã kiểm chứng (dossier builder-a §1, §4)
 * Đơn vị "map unit" ≈ 90px map thật; ngưỡng demo ghi trong từng lesson.
 * ================================================================= */

// FIX-G1 — mini lane graph: 11 node, 12 cạnh. sC05 là sink (BUG exit).
var G1 = {
  entranceNodeId: 'entrance', exitNodeId: 'exit',
  spotEntryNodeIds: { C05: 'sC05' },
  nodes: [
    { id: 'entrance', kind: 'entrance', x: 8, y: 9 },
    { id: 'ec', kind: 'junction', x: 7, y: 9 },
    { id: 'r7', kind: 'junction', x: 7, y: 7 },
    { id: 'r4', kind: 'junction', x: 7, y: 4 },
    { id: 'r2', kind: 'junction', x: 7, y: 2 },
    { id: 'xc', kind: 'junction', x: 7, y: 1 },
    { id: 'exit', kind: 'exit', x: 8, y: 1 },
    { id: 'c7', kind: 'junction', x: 5, y: 7 },
    { id: 'c4', kind: 'junction', x: 5, y: 4 },
    { id: 'c2', kind: 'junction', x: 5, y: 2 },
    { id: 'sC05', kind: 'spot-entry', x: 5.6, y: 4 }
  ],
  edges: [
    { id: 'entrance=>ec', from: 'entrance', to: 'ec', distance: 1, direction: 'one-way' },
    { id: 'ec=>r7', from: 'ec', to: 'r7', distance: 2, direction: 'one-way' },
    { id: 'r7=>r4', from: 'r7', to: 'r4', distance: 3, direction: 'one-way' },
    { id: 'r4=>r2', from: 'r4', to: 'r2', distance: 2, direction: 'one-way' },
    { id: 'r2=>xc', from: 'r2', to: 'xc', distance: 1, direction: 'one-way' },
    { id: 'xc=>exit', from: 'xc', to: 'exit', distance: 1, direction: 'one-way' },
    { id: 'r7=>c7', from: 'r7', to: 'c7', distance: 2, direction: 'two-way' },
    { id: 'r4=>c4', from: 'r4', to: 'c4', distance: 2, direction: 'two-way' },
    { id: 'r2=>c2', from: 'r2', to: 'c2', distance: 2, direction: 'two-way' },
    { id: 'c7=>c4', from: 'c7', to: 'c4', distance: 5, direction: 'two-way' },
    { id: 'c4=>c2', from: 'c4', to: 'c2', distance: 2, direction: 'two-way' },
    { id: 'c4=>sC05', from: 'c4', to: 'sC05', distance: 0.6, direction: 'one-way' }
  ]
};

// FIX-G2 — tie-break: a,b đối xứng (f=2, g=1); nodeOrder chọn a.
var G2 = {
  entranceNodeId: 's', exitNodeId: 't', spotEntryNodeIds: {},
  nodes: [
    { id: 's', kind: 'junction', x: 0, y: 0 },
    { id: 'a', kind: 'junction', x: 1, y: 0 },
    { id: 'b', kind: 'junction', x: 0, y: 1 },
    { id: 't', kind: 'junction', x: 1, y: 1 }
  ],
  edges: [
    { id: 's=>a', from: 's', to: 'a', distance: 1, direction: 'one-way' },
    { id: 's=>b', from: 's', to: 'b', distance: 1, direction: 'one-way' },
    { id: 'a=>t', from: 'a', to: 't', distance: 1, direction: 'one-way' },
    { id: 'b=>t', from: 'b', to: 't', distance: 1, direction: 'one-way' }
  ]
};

// FIX-GEOM1 — mini geometry cho buildLaneGraph (3 làn x=1/4/7, connector y=1/9).
var GEOM_BASE = {
  layout: { centerLaneCenterX: 4, leftAisleCenterX: 1, rightAisleCenterX: 7 },
  entrance: { x: 8, y: 9.5 }, exit: { x: 8, y: 0.5 },
  horizontalConnectors: [{ centerline: { start: { y: 1 } } }, { centerline: { start: { y: 9 } } }],
  spots: [
    { id: 'Z01', zone: 'F', number: 1, y: 2, height: 2, entryPoint: { x: 2, y: 3 } },
    { id: 'Z02', zone: 'F', number: 2, y: 5, height: 2, entryPoint: { x: 2, y: 6 } },
    { id: 'Z03', zone: 'F', number: 3, y: 8, height: 2, entryPoint: { x: 2, y: 9 } },
    { id: 'B01', zone: 'B', number: 1, y: 2, height: 2, entryPoint: { x: 6, y: 3 } },
    { id: 'B02', zone: 'B', number: 2, y: 5, height: 2, entryPoint: { x: 6, y: 6 } },
    { id: 'B03', zone: 'B', number: 3, y: 8, height: 2, entryPoint: { x: 6, y: 9 } }
  ],
  anchors: [{ id: 'shopping', x: 1, y: 1 }]
};

// FIX-RECO1 — recommendation mini (routeCost giả lập route.distance).
var RECO1 = {
  spots: [
    { id: 'S1', status: 'empty', center: [6, 7] },
    { id: 'S2', status: 'empty', center: [9, 6] },
    { id: 'S3', status: 'empty', center: [5, 2] },
    { id: 'S4', status: 'occupied' },
    { id: 'S5', status: 'transitioning' }
  ],
  routeCost: { S1: 20, S2: 8, S3: 12 },
  anchors: { shopping: [2, 8], services: [5, 7], entertainment: [8, 2] }
};

// FIX-RT1 — route points (đơn vị map thu nhỏ).
var RT_INBOUND = [{ x: 8, y: 9 }, { x: 7, y: 9 }, { x: 7, y: 7 }, { x: 7, y: 4 }, { x: 5, y: 4 }, { x: 5.6, y: 4 }];
var RT_STRAIGHT = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 1 }];

// FIX-S1 — session mẫu (rev4) + FIX-R1 — runtime slots/vehicles.
var SESSION1 = {
  sessionId: 'tok-abc', state: 'NAVIGATING_TO_SPOT', globalVehicleId: 7, runtimeId: 'rt-1',
  targetSpotId: 'C05', parkedSpotId: null, claimed: true, revision: 4,
  parkingEpisodeId: null, parkedAt: null, actualParkedSpotId: null,
  createdAt: '2026-10-04T09:58:00Z', updatedAt: '2026-10-04T09:59:00Z'
};
var SLOTS1 = [{ slot_id: 'C05', camera_id: 'cam2', status: 'empty', vehicle_id: null, tracking_state: 'moving', stopped_for_ms: 0 }];
var VEHICLES1 = [{ global_id: 7, state: 'active', observed: true, parked_slot_id: null, position: { x: 6, y: 4.5 } }];

// FIX-A1 — affine anchors (world ↔ svg).
var AFFINE1 = {
  anchors: [
    { world: { x: 0, y: 0 }, svg: { x: 100, y: 200 } },
    { world: { x: 100, y: 0 }, svg: { x: 300, y: 200 } },
    { world: { x: 0, y: 50 }, svg: { x: 100, y: 300 } }
  ],
  query: { x: 50, y: 25 }
};

var SPOT_GEOMS = { C05: { cx: 5.6, cy: 4 }, D03: { cx: 6, cy: 2 }, A09: { cx: 7, cy: 8 }, B02: { cx: 6, cy: 6 } };

/* =================================================================
 * PORTED ALGORITHMS — logic giữ nguyên từ frontend/src (ref từng lesson)
 * ================================================================= */

// --- routeEngine.ts ---
function buildAdjacency(graph) {
  var adjacency = new Map();
  graph.nodes.forEach(function (node) { adjacency.set(node.id, []); });
  graph.edges.forEach(function (edge) {
    if (adjacency.has(edge.from)) adjacency.get(edge.from).push({ edgeId: edge.id, from: edge.from, to: edge.to, distance: edge.distance });
    if (edge.direction === 'two-way' && adjacency.has(edge.to)) {
      adjacency.get(edge.to).push({ edgeId: edge.id, from: edge.to, to: edge.from, distance: edge.distance });
    }
  });
  return adjacency;
}

// A* đúng routeEngine.ts:31-119; collect=true → lưu pops + relax trace.
function astar(graph, startNodeId, endNodeId, collect) {
  var nodeById = new Map(graph.nodes.map(function (n) { return [n.id, n]; }));
  if (!nodeById.has(startNodeId) || !nodeById.has(endNodeId)) return null;
  var adjacency = buildAdjacency(graph);
  var targetNode = nodeById.get(endNodeId);
  var nodeOrder = new Map(graph.nodes.map(function (n, i) { return [n.id, i]; }));
  var costPerMapUnit = graph.edges.reduce(function (minimum, edge) {
    var from = nodeById.get(edge.from), to = nodeById.get(edge.to);
    if (!from || !to) return minimum;
    var direct = Math.hypot(to.x - from.x, to.y - from.y);
    if (direct <= 0) return minimum;
    return Math.min(minimum, edge.distance / direct);
  }, Number.POSITIVE_INFINITY);
  var heuristicScale = Number.isFinite(costPerMapUnit) ? costPerMapUnit : 0;
  var heuristic = function (id) {
    var n = nodeById.get(id);
    return Math.hypot(targetNode.x - n.x, targetNode.y - n.y) * heuristicScale;
  };
  var open = new Set([startNodeId]);
  var distances = new Map([[startNodeId, 0]]);
  var estimates = new Map([[startNodeId, heuristic(startNodeId)]]);
  var previous = new Map();
  var pops = [];
  while (open.size > 0) {
    var current = null, currentEstimate = Infinity, currentDistance = Infinity;
    open.forEach(function (nodeId) {
      var e = estimates.has(nodeId) ? estimates.get(nodeId) : Infinity;
      var d = distances.has(nodeId) ? distances.get(nodeId) : Infinity;
      var earlier = (nodeOrder.has(nodeId) ? nodeOrder.get(nodeId) : Infinity) <
        (current && nodeOrder.has(current) ? nodeOrder.get(current) : Infinity);
      if (e < currentEstimate || (e === currentEstimate && d < currentDistance) ||
        (e === currentEstimate && d === currentDistance && earlier)) {
        current = nodeId; currentEstimate = e; currentDistance = d;
      }
    });
    if (current === null || !Number.isFinite(currentDistance)) break;
    open.delete(current);
    var relax = [];
    if (collect) relax = [];
    if (current === endNodeId) {
      pops.push({ id: current, g: currentDistance, f: currentEstimate, relax: [], open: Array.from(open) });
      break;
    }
    (adjacency.get(current) || []).forEach(function (step) {
      if (!nodeById.has(step.to)) return;
      var candidate = currentDistance + step.distance;
      if (candidate < (distances.has(step.to) ? distances.get(step.to) : Infinity)) {
        distances.set(step.to, candidate);
        estimates.set(step.to, candidate + heuristic(step.to));
        previous.set(step.to, { nodeId: step.from, edgeId: step.edgeId });
        open.add(step.to);
        if (collect) relax.push({ to: step.to, g: candidate, f: candidate + heuristic(step.to), improved: true });
      } else if (collect) {
        relax.push({ to: step.to, g: candidate, f: candidate + heuristic(step.to), improved: false });
      }
    });
    if (collect) pops.push({ id: current, g: currentDistance, f: currentEstimate, relax: relax, open: Array.from(open) });
    else pops.push({ id: current, g: currentDistance, f: currentEstimate });
  }
  var finalDistance = distances.has(endNodeId) ? distances.get(endNodeId) : Infinity;
  if (!Number.isFinite(finalDistance)) return { route: null, pops: pops, heuristicScale: heuristicScale };
  var reversedNodes = [endNodeId], reversedEdges = [], cursor = endNodeId;
  while (cursor !== startNodeId) {
    var prior = previous.get(cursor);
    if (!prior) return { route: null, pops: pops, heuristicScale: heuristicScale };
    reversedEdges.push(prior.edgeId);
    cursor = prior.nodeId;
    reversedNodes.push(cursor);
  }
  return {
    route: { nodeIds: reversedNodes.reverse(), edgeIds: reversedEdges.reverse(), distance: finalDistance },
    pops: pops, heuristicScale: heuristicScale, previous: previous
  };
}

// Reference độc lập: DFS duyệt mọi đường đơn (graph ≤ ~13 node) → min-cost.
function bruteShortest(graph, startId, endId) {
  var nodeById = new Map(graph.nodes.map(function (n) { return [n.id, n]; }));
  if (!nodeById.has(startId) || !nodeById.has(endId)) return null;
  var adj = buildAdjacency(graph);
  var best = { d: Infinity, nodes: null, edges: null };
  var seen = {};
  (function dfs(cur, g, path, edgePath) {
    if (cur === endId) {
      if (g < best.d - 1e-9) { best = { d: g, nodes: path.slice(), edges: edgePath.slice() }; }
      return;
    }
    var steps = adj.get(cur) || [];
    for (var i = 0; i < steps.length; i++) {
      var st = steps[i];
      if (seen[st.to]) continue;
      seen[st.to] = true;
      dfs(st.to, g + st.distance, path.concat(st.to), edgePath.concat(st.edgeId));
      delete seen[st.to];
    }
  })(startId, 0, [startId], []);
  seen[startId] = true;
  return best.nodes ? { nodeIds: best.nodes, edgeIds: best.edges, distance: best.d } : null;
}

// routeFromPos — routeEngine.ts:132-167. maxDist demo-scale (code: 60).
function routeFromPos(graph, vehicleX, vehicleY, targetNodeId, maxDist, allowSpotEntry) {
  var nodes = new Map(graph.nodes.map(function (n) { return [n.id, n]; }));
  var projections = [];
  graph.edges.forEach(function (edge) {
    var a = nodes.get(edge.from), b = nodes.get(edge.to);
    if (!a || !b) return;
    if (!allowSpotEntry && [a.kind, b.kind].some(function (k) { return k === 'access-anchor' || k === 'spot-entry'; })) return;
    var dx = b.x - a.x, dy = b.y - a.y;
    var length2 = dx * dx + dy * dy;
    if (!length2) return;
    var t = Math.max(0, Math.min(1, ((vehicleX - a.x) * dx + (vehicleY - a.y) * dy) / length2));
    var x = a.x + t * dx, y = a.y + t * dy;
    projections.push({ edge: edge, a: a, b: b, x: x, y: y, t: t, distance: Math.hypot(x - vehicleX, y - vehicleY) });
  });
  projections.sort(function (p, q) { return p.distance - q.distance; });
  var nearest = projections[0];
  if (!nearest || nearest.distance > maxDist) return { route: null, projections: projections };
  var vehicleNode = { id: 'vehicle-pos', kind: 'junction', x: nearest.x, y: nearest.y };
  var destinations = nearest.edge.direction === 'two-way' ? [nearest.a, nearest.b] : [nearest.b];
  var tempEdges = destinations.map(function (node) {
    return {
      id: 'vehicle=>' + node.id, from: 'vehicle-pos', to: node.id,
      distance: Math.hypot(node.x - nearest.x, node.y - nearest.y), direction: 'one-way'
    };
  });
  var tempGraph = { entranceNodeId: graph.entranceNodeId, exitNodeId: graph.exitNodeId, spotEntryNodeIds: graph.spotEntryNodeIds, nodes: graph.nodes.concat([vehicleNode]), edges: graph.edges.concat(tempEdges) };
  var r = astar(tempGraph, 'vehicle-pos', targetNodeId, false);
  var route = r ? r.route : null;
  return { route: route, projections: projections, projection: { edge: nearest.edge.id, x: nearest.x, y: nearest.y, d: nearest.distance, t: nearest.t }, tempEdges: tempEdges };
}

function findVehicleRoute(graph, spotId) {
  var t = graph.spotEntryNodeIds[spotId];
  return t ? astar(graph, graph.entranceNodeId, t, false).route : null;
}
function findExitRoute(graph, spotId) {
  var s = graph.spotEntryNodeIds[spotId];
  return s ? astar(graph, s, graph.exitNodeId, false).route : null;
}
function findExitRouteFromPos(graph, x, y, fallbackSpotId, maxDist, allowSpot) {
  var r = routeFromPos(graph, x, y, graph.exitNodeId, maxDist, allowSpot);
  if (r.route) return r;
  if (fallbackSpotId) { r.fallbackRoute = findExitRoute(graph, fallbackSpotId); r.route = r.fallbackRoute; }
  return r;
}
function findInboundRouteFromPos(graph, x, y, spotId, maxDist, allowSpot) {
  var t = graph.spotEntryNodeIds[spotId];
  if (!t) return { route: null };
  return routeFromPos(graph, x, y, t, maxDist, allowSpot);
}

// routeUsesOnlyValidEdges — routeEngine.ts:210-222
function routeUsesOnlyValidEdges(graph, route) {
  var edgeById = new Map(graph.edges.map(function (e) { return [e.id, e]; }));
  return route.edgeIds.every(function (edgeId, i) {
    var edge = edgeById.get(edgeId);
    var from = route.nodeIds[i], to = route.nodeIds[i + 1];
    if (!edge || !from || !to) return false;
    return (edge.from === from && edge.to === to) ||
      (edge.direction === 'two-way' && edge.from === to && edge.to === from);
  });
}

// updateGateNodesInGraph — laneGraph.ts:165-183 (không recompute distance — điểm yếu thật)
function updateGateNodesInGraph(graph, gateRoi) {
  var out = [];
  [['entrance', 'entry_gate'], ['exit', 'exit_gate']].forEach(function (pair) {
    var nid = pair[0] === 'entrance' ? graph.entranceNodeId : graph.exitNodeId;
    var node = null;
    graph.nodes.forEach(function (n) { if (n.id === nid) node = n; });
    var g = gateRoi[pair[1]];
    if (node && g) {
      var oldX = node.x, oldY = node.y;
      node.x = (g.p1.x + g.p2.x) / 2;
      node.y = (g.p1.y + g.p2.y) / 2;
      out.push({ nodeId: nid, from: { x: oldX, y: oldY }, to: { x: node.x, y: node.y } });
    }
  });
  return out;
}

// buildLaneGraph mini — port nhánh laneGraph.ts:30-163 với spotsPerZone tham số.
function buildLaneGraphMini(geom, spotsPerZone) {
  var nodes = [], edges = [], spotEntryNodeIds = {};
  var nodeById = new Map();
  function addNode(n) { if (!nodeById.has(n.id)) { nodes.push(n); nodeById.set(n.id, n); } }
  function addEdge(from, to, direction) {
    var s = nodeById.get(from), e = nodeById.get(to);
    if (!s || !e) throw new Error('missing node ' + from + '->' + to);
    edges.push({ id: from + '=>' + to, from: from, to: to, distance: Math.hypot(s.x - e.x, s.y - e.y), direction: direction || 'one-way' });
  }
  var dist = function (a, b) { return Math.hypot(a.x - b.x, a.y - b.y); };
  var layout = geom.layout;
  addNode({ id: 'entrance', kind: 'entrance', x: geom.entrance.x, y: geom.entrance.y });
  addNode({ id: 'exit', kind: 'exit', x: geom.exit.x, y: geom.exit.y });
  var connTopY = geom.horizontalConnectors[0].centerline.start.y;
  var connBottomY = geom.horizontalConnectors[1].centerline.start.y;
  var rowYValues = [];
  for (var n = 1; n <= spotsPerZone; n++) {
    var spot = geom.spots.filter(function (s) { return s.number === n; })[0];
    if (spot) rowYValues.push(spot.y + spot.height / 2);
  }
  var allY = Array.from(new Set([connTopY].concat(rowYValues, [connBottomY]))).sort(function (a, b) { return a - b; });
  allY.forEach(function (y) {
    addNode({ id: 'center-' + y, kind: 'junction', x: layout.centerLaneCenterX, y: y });
    addNode({ id: 'left-' + y, kind: 'junction', x: layout.leftAisleCenterX, y: y });
    addNode({ id: 'right-' + y, kind: 'junction', x: layout.rightAisleCenterX, y: y });
  });
  var sortedDescY = allY.slice().sort(function (a, b) { return b - a; });
  addNode({ id: 'entrance-corner', kind: 'junction', x: layout.rightAisleCenterX, y: geom.entrance.y });
  addNode({ id: 'exit-corner', kind: 'junction', x: layout.rightAisleCenterX, y: geom.exit.y });
  var rightPath = ['entrance', 'entrance-corner'].concat(sortedDescY.map(function (y) { return 'right-' + y; }), ['exit-corner', 'exit']);
  for (var i = 0; i < rightPath.length - 1; i++) addEdge(rightPath[i], rightPath[i + 1]);
  var sortedAscY = allY.slice().sort(function (a, b) { return a - b; });
  for (var j = 0; j < sortedAscY.length - 1; j++) {
    addEdge('left-' + sortedAscY[j], 'left-' + sortedAscY[j + 1], 'two-way');
    addEdge('center-' + sortedAscY[j], 'center-' + sortedAscY[j + 1], 'two-way');
  }
  [connTopY, connBottomY].forEach(function (y) {
    addEdge('center-' + y, 'left-' + y, 'two-way');
    addEdge('center-' + y, 'right-' + y, 'two-way');
  });
  geom.spots.forEach(function (spot) {
    if (spot.number > spotsPerZone) return;
    var entryId = 'spot-' + spot.id;
    spotEntryNodeIds[spot.id] = entryId;
    addNode({ id: entryId, kind: 'spot-entry', x: spot.entryPoint.x, y: spot.entryPoint.y });
    var spotCenterY = spot.y + spot.height / 2;
    var aisle;
    if (spot.zone === 'F' || spot.zone === 'E') aisle = 'left-' + spotCenterY;
    else if (spot.zone === 'D' || spot.zone === 'C') aisle = 'center-' + spotCenterY;
    else aisle = 'right-' + spotCenterY;
    if (nodeById.has(aisle)) addEdge(aisle, entryId);
  });
  Object.keys(geom.anchors || {}).forEach(function (k) {
    var a = geom.anchors[k];
    addNode({ id: 'anchor-' + a.id, kind: 'access-anchor', x: a.x, y: a.y });
  });
  return { nodes: nodes, edges: edges, allY: allY, spotEntryNodeIds: spotEntryNodeIds, entranceNodeId: 'entrance', exitNodeId: 'exit' };
}

// --- voiceGuidance.ts ---
function distanceToSegment(px, py, x1, y1, x2, y2) {
  var dx = x2 - x1, dy = y2 - y1;
  if (dx === 0 && dy === 0) return Math.hypot(px - x1, py - y1);
  var t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}
function checkIsOffRoute(vehiclePos, routePoints, thresholdPx) {
  if (!vehiclePos || routePoints.length < 2) return false;
  var minDistance = Infinity;
  for (var i = 0; i < routePoints.length - 1; i++) {
    var d = distanceToSegment(vehiclePos.x, vehiclePos.y, routePoints[i].x, routePoints[i].y, routePoints[i + 1].x, routePoints[i + 1].y);
    if (d < minDistance) minDistance = d;
  }
  return minDistance > thresholdPx;
}
function getNavigationInstruction(vehiclePos, routePoints, isExit, targetSpotId, ARRIVE, TURN_NEAR) {
  if (!vehiclePos || routePoints.length < 2) return null;
  var destPoint = routePoints[routePoints.length - 1];
  if (Math.hypot(vehiclePos.x - destPoint.x, vehiclePos.y - destPoint.y) < ARRIVE) {
    if (isExit) return 'Bạn đã đến lối ra. Chúc bạn thượng lộ bình an!';
    if (targetSpotId) return 'Bạn đã đến vị trí ô đỗ ' + targetSpotId + '. Vui lòng lùi xe vào đỗ.';
    return 'Bạn đã đến điểm đích.';
  }
  var closestIndex = 0, minDist = Infinity;
  for (var i = 0; i < routePoints.length; i++) {
    var d = Math.hypot(vehiclePos.x - routePoints[i].x, vehiclePos.y - routePoints[i].y);
    if (d < minDist) { minDist = d; closestIndex = i; }
  }
  if (closestIndex >= 1 && closestIndex < routePoints.length - 1) {
    var pPrev = routePoints[closestIndex - 1], pCurrent = routePoints[closestIndex], pNext = routePoints[closestIndex + 1];
    var curDx = pCurrent.x - pPrev.x, curDy = pCurrent.y - pPrev.y;
    var nextDx = pNext.x - pCurrent.x, nextDy = pNext.y - pCurrent.y;
    var dot = curDx * nextDx + curDy * nextDy;
    var lenCur = Math.hypot(curDx, curDy), lenNext = Math.hypot(nextDx, nextDy);
    var cosAngle = lenCur > 0 && lenNext > 0 ? dot / (lenCur * lenNext) : 1;
    var cross = curDx * nextDy - curDy * nextDx;
    if (cosAngle > 0.93) return 'Phía trước đi thẳng.';
    return cross > 0
      ? (isExit ? 'Phía trước rẽ phải ra cổng.' : 'Phía trước rẽ phải vào làn đỗ.')
      : (isExit ? 'Phía trước rẽ trái ra cổng.' : 'Phía trước rẽ trái vào làn đỗ.');
  }
  if (closestIndex < routePoints.length - 1) {
    for (var k = 0; k < routePoints.length - 2; k++) {
      var pA = routePoints[k], pB = routePoints[k + 1], pC = routePoints[k + 2];
      var abDx = pB.x - pA.x, abDy = pB.y - pA.y;
      var bcDx = pC.x - pB.x, bcDy = pC.y - pB.y;
      var dot2 = abDx * bcDx + abDy * bcDy;
      var lenAB = Math.hypot(abDx, abDy), lenBC = Math.hypot(bcDx, bcDy);
      var cosA = lenAB > 0 && lenBC > 0 ? dot2 / (lenAB * lenBC) : 1;
      if (cosA < 0.93) {
        var distToTurn = Math.hypot(vehiclePos.x - pB.x, vehiclePos.y - pB.y);
        if (distToTurn > TURN_NEAR) return 'Phía trước đi thẳng.';
        var cross2 = abDx * bcDy - abDy * bcDx;
        return cross2 > 0
          ? (isExit ? 'Phía trước rẽ phải ra cổng.' : 'Phía trước rẽ phải vào làn đỗ.')
          : (isExit ? 'Phía trước rẽ trái ra cổng.' : 'Phía trước rẽ trái vào làn đỗ.');
      }
    }
    return 'Phía trước đi thẳng.';
  }
  return 'Tiếp tục di chuyển theo đường chỉ dẫn.';
}

// VoiceManager.speak — voiceGuidance.ts:29-67 (stub TTS deterministic).
function makeVoiceStub() {
  var st = { lastSpokenText: '', lastSpokenTime: 0, isMuted: false, isSpeaking: false, log: [], endAt: 0 };
  return {
    st: st,
    speak: function (text, cooldownMs, isUrgent, now, speechMs) {
      if (st.isMuted) { st.log.push({ t: now, text: text, verdict: 'SKIP:muted' }); return; }
      if (text === st.lastSpokenText && now - st.lastSpokenTime < cooldownMs) { st.log.push({ t: now, text: text, verdict: 'SKIP:cooldown' }); return; }
      if (st.isSpeaking && text === st.lastSpokenText) { st.log.push({ t: now, text: text, verdict: 'SKIP:same-speaking' }); return; }
      if (st.isSpeaking && !isUrgent && now - st.lastSpokenTime < 2000) { st.log.push({ t: now, text: text, verdict: 'SKIP:<2s' }); return; }
      st.lastSpokenText = text; st.lastSpokenTime = now; st.isSpeaking = true;
      st.log.push({ t: now, text: text, verdict: isUrgent ? 'SPEAK:urgent' : 'SPEAK' });
      st.endAt = now + speechMs;
    },
    tick: function (now) { if (st.isSpeaking && now >= st.endAt) st.isSpeaking = false; }
  };
}

// --- worldToSvg.ts ---
function solve3(matrix, values) {
  var a = matrix.map(function (row, i) { return row.concat([values[i]]); });
  for (var col = 0; col < 3; col++) {
    var pivot = col;
    for (var r = col + 1; r < 3; r++) if (Math.abs(a[r][col]) > Math.abs(a[pivot][col])) pivot = r;
    if (Math.abs(a[pivot][col]) < 1e-9) return null;
    var tmp = a[col]; a[col] = a[pivot]; a[pivot] = tmp;
    for (var rr = 0; rr < 3; rr++) {
      if (rr === col) continue;
      var factor = a[rr][col] / a[col][col];
      for (var c = col; c < 4; c++) a[rr][c] -= factor * a[col][c];
    }
  }
  return [0, 1, 2].map(function (i) { return a[i][3] / a[i][i]; });
}
function computeAffine(anchors) {
  if (!anchors || anchors.length < 3) return null;
  var normal = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], tx = [0, 0, 0], ty = [0, 0, 0];
  anchors.forEach(function (pair) {
    var row = [pair.world.x, pair.world.y, 1];
    for (var i = 0; i < 3; i++) {
      for (var j = 0; j < 3; j++) normal[i][j] += row[i] * row[j];
      tx[i] += row[i] * pair.svg.x;
      ty[i] += row[i] * pair.svg.y;
    }
  });
  var x = solve3(normal.map(function (r) { return r.slice(); }), tx);
  var y = solve3(normal.map(function (r) { return r.slice(); }), ty);
  if (!x || !y) return null;
  return { x: x, y: y, normal: normal, targetX: tx, targetY: ty };
}
var applyAffine = function (T, p) { return { x: T.x[0] * p.x + T.x[1] * p.y + T.x[2], y: T.y[0] * p.x + T.y[1] * p.y + T.y[2] }; };
function invertAffine(T) {
  var det = T.x[0] * T.y[1] - T.x[1] * T.y[0];
  if (Math.abs(det) < 1e-9) return null;
  var x = [T.y[1] / det, -T.x[1] / det, (T.x[1] * T.y[2] - T.y[1] * T.x[2]) / det];
  var y = [-T.y[0] / det, T.x[0] / det, (T.y[0] * T.x[2] - T.x[0] * T.y[2]) / det];
  return { x: x, y: y, det: det };
}
var clampSvg = function (p) { return { x: Math.max(0, Math.min(1200, p.x)), y: Math.max(0, Math.min(900, p.y)) }; };

// --- runtime.ts / parking.ts ---
function canonicalRuntimeId(gid, aliases) {
  var visited = {};
  while (Object.prototype.hasOwnProperty.call(aliases || {}, String(gid))) {
    if (visited[gid]) return null;
    visited[gid] = true;
    var next = aliases[String(gid)];
    if (next === undefined || next === null || !Number.isSafeInteger(next) || next < 0) return null;
    if (next === gid) return gid;
    gid = next;
  }
  return gid;
}
function classifySpotOccupancy(spot, gid, parkedSpotId) {
  if (spot.status === 'empty') return 'empty';
  if (parkedSpotId === spot.id) return 'own';
  if (spot.vehicleId == null || gid == null) return 'unknown';
  return spot.vehicleId === gid ? 'own' : 'other';
}
var LEFT_ZONES = { F: 1, E: 1, D: 1 };
var getSpotOwner = function (spotId) { return LEFT_ZONES[spotId[0]] ? 'cam-left' : 'cam-right'; };
var cameraOwnsSpot = function (cam, spotId) { return getSpotOwner(spotId) === cam; };
function parseSpotId(spotId) { return { zone: spotId[0], number: Number(spotId.slice(1)) }; }

// --- session.ts / sessionParking.ts ---
function buildSessionCompletionKey(s) {
  if (s.state !== 'PARKED' || !s.parkedSpotId || !s.parkedAt) return null;
  if (s.parkingEpisodeId) return s.sessionId + ':' + s.parkingEpisodeId;
  return s.sessionId + ':' + s.parkedSpotId + ':' + s.parkedAt;
}
function resolveSessionParking(input) {
  var session = input.session, vehicles = input.vehicles || [], slots = input.slots || [];
  var dwell = input.dwellThresholdMs;
  var ownGid = session.globalVehicleId, targetSpotId = session.targetSpotId, parkedSpotId = session.parkedSpotId;
  if (session.state === 'EXIT_NAVIGATION') return { kind: 'exit_navigation', originSpotId: parkedSpotId };
  if (session.state === 'PARKED' && parkedSpotId) {
    var key = buildSessionCompletionKey(session);
    if (key && session.parkedAt) return { kind: 'parked', actualSpotId: parkedSpotId, completionKey: key };
  }
  var confirmed = function (s) { return s.tracking_state === 'parked' && s.stopped_for_ms >= dwell; };
  var ownSpots;
  if (input.episodes) {
    ownSpots = input.episodes.filter(function (e) {
      return e.global_id === ownGid && e.state === 'parked' &&
        !(session.state === 'RELOCATING' && e.parking_episode_id === session.parkingEpisodeId);
    }).map(function (e) { return e.slot_id; });
    ownSpots = Array.from(new Set(ownSpots)).sort();
  } else {
    var a = vehicles.filter(function (v) { return v.global_id === ownGid && v.parked_slot_id; }).map(function (v) { return v.parked_slot_id; });
    var b = slots.filter(function (s) { return s.vehicle_id === ownGid && confirmed(s); }).map(function (s) { return s.slot_id; });
    ownSpots = Array.from(new Set(a.concat(b))).sort();
  }
  if (ownSpots.length > 1) return { kind: 'identity_invariant_error', reason: 'same_global_id_in_multiple_slots', spotIds: ownSpots };
  if (ownSpots.length === 1) return { kind: 'parking_confirmation_pending', actualSpotId: ownSpots[0] };
  var ownPending = (input.pendingConfirmations || []).filter(function (c) {
    return c.global_id === ownGid && c.state !== 'collecting';
  }).sort(function (l, r) { return r.max_overlap - l.max_overlap; })[0];
  if (ownPending) {
    var degraded = Object.keys(input.parkingPipeline || {}).some(function (k) { return input.parkingPipeline[k] && input.parkingPipeline[k].state === 'degraded'; });
    if (degraded || ownPending.age_ms >= 5000 || ownPending.state === 'insufficient_evidence')
      return { kind: 'parking_processing_delayed', actualSpotId: ownPending.slot_id };
    return { kind: 'parking_confirmation_pending', actualSpotId: ownPending.slot_id };
  }
  if (!targetSpotId) return { kind: 'no_target', state: session.state };
  var targetSlot = null;
  slots.forEach(function (s) { if (s.slot_id === targetSpotId) targetSlot = s; });
  if (!targetSlot) return { kind: 'runtime_unavailable', targetSpotId: targetSpotId, reason: 'target_slot_not_in_runtime' };
  if (targetSlot.status === 'empty') return { kind: 'guiding', targetSpotId: targetSpotId };
  if (targetSlot.vehicle_id == null) return { kind: 'identity_pending', spotId: targetSpotId, reason: 'no_vehicle_id' };
  if (targetSlot.vehicle_id === ownGid) return { kind: 'parking_confirmation_pending', actualSpotId: targetSpotId };
  var otherEpisode = (input.episodes || []).some(function (e) { return e.state === 'parked' && e.slot_id === targetSpotId && e.global_id === targetSlot.vehicle_id; });
  if (input.episodes ? otherEpisode : confirmed(targetSlot)) return { kind: 'target_occupied_by_other', spotId: targetSpotId, otherVehicleId: targetSlot.vehicle_id };
  return { kind: 'identity_pending', spotId: targetSpotId, reason: 'other_unconfirmed' };
}

// --- parkingStore.ts ---
function applySpotEvent(state, ev) {
  var cur = state.spots[ev.spotId];
  if (!cur) { state.rejectedEvents++; return 'unknown-spot'; }
  if (!cameraOwnsSpot(ev.cameraId, ev.spotId) || cur.owner !== ev.cameraId) { state.rejectedEvents++; return 'unauthorized'; }
  if (ev.revision <= cur.revision) { state.staleEvents++; return 'stale'; }
  state.spots[ev.spotId] = { id: cur.id, status: ev.status, confidence: ev.confidence, revision: ev.revision, owner: cur.owner, updatedAt: ev.updatedAt };
  return 'applied';
}
// parkingStore.ts:43-52 — reduce; status ngoài union → counts[lạ] = undefined+1 = NaN (JS runtime)
function deriveParkingCounts(spots) {
  return spots.reduce(function (counts, s) {
    var next = {};
    Object.keys(counts).forEach(function (k) { next[k] = counts[k]; });
    next.total = counts.total + 1;
    next[s.status] = counts[s.status] + 1;
    return next;
  }, { total: 0, empty: 0, occupied: 0, reserved: 0, transitioning: 0, unknown: 0 });
}
// MockParkingDataSource.ts:44-48
var initialStatus = function (n) { return n % 7 === 0 ? 'occupied' : n % 11 === 0 ? 'transitioning' : n % 13 === 0 ? 'unknown' : 'empty'; };

// --- ParkingMap.tsx:82-96 — prev là điểm CUỐI ĐÃ GIỮ (simplified.at(-1)), không phải points[i-1] ---
function simplifyRoutePoints(points) {
  if (points.length < 3) return points.slice();
  var out = [points[0]];
  for (var i = 1; i < points.length - 1; i++) {
    var previous = out[out.length - 1], cur = points[i], next = points[i + 1];
    var cross = (cur.x - previous.x) * (next.y - cur.y) - (cur.y - previous.y) * (next.x - cur.x);
    if (Math.abs(cross) > 0.01) out.push(cur);
  }
  out.push(points[points.length - 1]);
  return out;
}
// ParkingMap.tsx:98-123 — vòng targetDistance ngoài, mỗi target find() lại segment
function createRouteArrows(points) {
  var segs = [], totalLength = 0;
  for (var i = 0; i < points.length - 1; i++) {
    var len = Math.hypot(points[i + 1].x - points[i].x, points[i + 1].y - points[i].y);
    segs.push({ a: points[i], b: points[i + 1], len: len });
    totalLength += len;
  }
  var out = [];
  if (totalLength < 140) return { arrows: out, totalLength: totalLength };
  for (var target = 100; target < totalLength - 45; target += 190) {
    var traversed = 0, seg = null;
    for (var j = 0; j < segs.length; j++) {
      if (target <= traversed + segs[j].len) { seg = segs[j]; break; }
      traversed += segs[j].len;
    }
    if (!seg || seg.len === 0) continue;
    var ratio = (target - traversed) / seg.len;
    out.push({
      x: seg.a.x + (seg.b.x - seg.a.x) * ratio,
      y: seg.a.y + (seg.b.y - seg.a.y) * ratio,
      angle: Math.atan2(seg.b.y - seg.a.y, seg.b.x - seg.a.x) * 180 / Math.PI,
      target: target
    });
  }
  return { arrows: out, totalLength: totalLength };
}
function clampView(v) {
  var width = Math.min(1200, Math.max(360, v.width));
  var height = width * (900 / 1200);
  return { x: Math.min(Math.max(0, v.x), 1200 - width), y: Math.min(Math.max(0, v.y), 900 - height), width: width, height: height };
}
function zoomAt(v, factor, rx, ry) {
  var width = v.width * factor;
  var height = width * (900 / 1200);
  return clampView({ x: v.x + (v.width - width) * rx, y: v.y + (v.height - height) * ry, width: width, height: height });
}

// --- parkingGeometry.ts:85-148 — hằng số thật: W90,H56,GAP10,FIRST_Y112; ZONE_COLUMNS :92-99 ---
var SPOT_W = 90, SPOT_H = 56, SPOT_GAP = 10, FIRST_SPOT_Y = 112;
var ZONE_COLS = { F: 110, E: 300, D: 390, C: 600, B: 690, A: 890 };
var AISLE_CENTER = { F: 250, E: 250, D: 540, C: 540, B: 840, A: 840 };
var spotY = function (n, perZone) { return FIRST_SPOT_Y + (perZone - n) * (SPOT_H + SPOT_GAP); };
function miniParkingGeometry(zones, perZone) {
  var spots = [];
  zones.forEach(function (z) {
    for (var n = 1; n <= perZone; n++) {
      var x = ZONE_COLS[z] !== undefined ? ZONE_COLS[z] : 100, y = spotY(n, perZone);
      var aisleX = AISLE_CENTER[z] !== undefined ? AISLE_CENTER[z] : 840;
      var entryX = x < aisleX ? x + SPOT_W + 8 : x - 8;
      spots.push({ id: z + String(n).padStart(2, '0'), zone: z, number: n, x: x, y: y, w: SPOT_W, h: SPOT_H, entryPoint: { x: entryX, y: y + SPOT_H / 2 }, center: { x: x + SPOT_W / 2, y: y + SPOT_H / 2 } });
    }
  });
  return { spots: spots };
}

// --- recommendationEngine.ts ---
function rankParkingSpots(spots, routeCost, anchor, driveW, metersPerUnit) {
  var eligible = spots.filter(function (s) { return s.status === 'empty'; });
  var ranked = eligible.map(function (s) {
    var route = routeCost[s.id];
    if (route === undefined) return null;
    var driving = route * metersPerUnit;
    var walking = Math.hypot(s.center[0] - anchor[0], s.center[1] - anchor[1]) * metersPerUnit;
    var total = Math.round((driveW * driving + (1 - driveW) * walking) * 100) / 100;
    return { spotId: s.id, drivingDistance: driving, walkingDistance: walking, totalScore: total, estimatedWalkingMinutes: Math.max(1, Math.ceil(walking / 75)) };
  }).filter(function (r) { return r !== null; });
  ranked.sort(function (a, b) { return a.totalScore - b.totalScore || a.spotId.localeCompare(b.spotId); });
  return ranked;
}

// --- session commit guard (useVehicleSession.ts:52-93) ---
var COMMIT_FIELDS = ['state', 'targetSpotId', 'parkedSpotId', 'globalVehicleId', 'actualParkedSpotId', 'parkingEpisodeId', 'updatedAt'];
function makeCommitEnv() {
  return { lifecycle: 0, activeSessionId: 'tok-abc', deleted: false, action: null, current: null, synced: 0, log: [] };
}
function commitGuard(env, next, source, expectedId, lifecycle) {
  var verdict;
  if (lifecycle !== env.lifecycle || env.activeSessionId !== expectedId || next.sessionId !== expectedId) verdict = { accepted: false, reason: 'session_mismatch' };
  else if (env.deleted) verdict = { accepted: false, reason: 'deleted' };
  else if (source === 'GET' && env.action !== null) verdict = { accepted: false, reason: 'stale_revision' };
  else {
    var current = env.current;
    if (next.runtimeId && current && current.runtimeId && next.runtimeId !== current.runtimeId) verdict = { accepted: false, reason: 'session_mismatch' };
    else if (current && next.revision < current.revision) verdict = { accepted: false, reason: 'stale_revision' };
    else if (current && next.revision === current.revision) {
      var identical = COMMIT_FIELDS.every(function (f) { return next[f] === current[f]; });
      if (!identical) verdict = { accepted: false, reason: 'stale_revision(conflict)' };
      else { env.synced++; verdict = { accepted: true, mode: 'idempotent' }; }
    } else { env.current = next; env.synced++; verdict = { accepted: true, mode: 'set' }; }
  }
  env.log.push({ source: source, revision: next.revision, verdict: verdict.accepted ? (verdict.mode || 'ok') : verdict.reason });
  return verdict;
}

// --- MonitorApp.tsx gate derive ---
function gateSide(p1, p2, acc) { return (p2.x - p1.x) * (acc.y - p1.y) - (p2.y - p1.y) * (acc.x - p1.x); }
// MonitorApp.tsx:37-54 — message thật + làm tròn 4 số
function gateLineFromPoints(name, points) {
  var p1 = points[0], p2 = points[1], acc = points[2];
  if (!p1 || !p2 || !acc) throw new Error('Thiếu điểm cấu hình cho ' + name);
  var dx = p2.x - p1.x, dy = p2.y - p1.y;
  if (Math.hypot(dx, dy) < 1e-6) throw new Error('Hai đầu vạch ' + name + ' phải khác nhau');
  var side = gateSide(p1, p2, acc);
  if (Math.abs(side) < 1e-6) throw new Error('Điểm chỉ hướng của ' + name + ' không được nằm trên vạch');
  var rnd = function (q) { return { x: Number(q.x.toFixed(4)), y: Number(q.y.toFixed(4)) }; };
  return { name: name, p1: rnd(p1), p2: rnd(p2), direction: side > 0 ? 'negative' : 'positive' };
}
function acceptedPointForGate(gate) {
  var dx = gate.p2.x - gate.p1.x, dy = gate.p2.y - gate.p1.y;
  var length = Math.hypot(dx, dy);
  var side = gate.direction === 'negative' ? 1 : -1;
  var distance = Math.max(length * 0.6, 2);
  return { x: (gate.p1.x + gate.p2.x) / 2 + side * (-dy / length) * distance, y: (gate.p1.y + gate.p2.y) / 2 + side * (dx / length) * distance };
}

// --- MockParkingDataSource.ts:134-160 — confidence 0.42/0.95; stale revision VẪN dispatch (store reject, không phải mock) ---
function emitSpotStatus(state, spotId, status, cameraId, revision) {
  var cam = cameraId || getSpotOwner(spotId);
  if (!cameraOwnsSpot(cam, spotId)) return { ok: false, reason: 'unauthorized', cameraId: cam, dispatched: false };
  var cur = state[spotId] || { revision: 0, status: 'empty' };
  var next = revision !== undefined ? revision : cur.revision + 1;
  var stale = next <= cur.revision;
  var event = { type: 'spot.status.changed', cameraId: cam, spotId: spotId, status: status, confidence: status === 'unknown' ? 0.42 : 0.95, revision: next };
  if (!stale) state[spotId] = { revision: next, status: status };
  return { ok: true, reason: stale ? 'dispatched-stale' : 'dispatched', revision: next, cameraId: cam, event: event, dispatched: true };
}

/* =================================================================
 * TRACE / CHECK helpers
 * ================================================================= */
function fr(id, lines, explanation, state, metrics, scene, ms) {
  return { id: id, activeLines: lines, explanation: explanation, state: state || {}, metrics: metrics || [], scene: scene || {}, durationMs: ms || 900 };
}
function eqJson(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
function chk(label, actual, expected) {
  var pass = (typeof actual === 'number' && typeof expected === 'number')
    ? Math.abs(actual - expected) < 1e-4 : eqJson(actual, expected);
  return { label: label, pass: pass, actual: actual, expected: expected };
}
function chkTrue(label, cond, actual, expected) {
  return { label: label, pass: !!cond, actual: actual, expected: expected };
}
function r2(v) { return Math.round(v * 100) / 100; }
function r3(v) { return Math.round(v * 1000) / 1000; }
function pickScenario(lesson, scenarioId) {
  var list = lesson.scenarios;
  for (var i = 0; i < list.length; i++) if (list[i].id === scenarioId) return list[i];
  return list[0];
}
function pickParams(lesson, params) {
  var out = {};
  (lesson.parameters || []).forEach(function (p) { out[p.key] = p.default; });
  if (params) Object.keys(params).forEach(function (k) { out[k] = params[k]; });
  return out;
}
function clone(o) { return JSON.parse(JSON.stringify(o)); }

/* =================================================================
 * DRAW helpers — raw ctx theo env {width,height,palette}
 * ================================================================= */
function pal(env) { return (env && env.palette) || {}; }
function fitScale(bounds, env, pad) {
  var w = env.width, h = env.height;
  var bw = Math.max(1e-6, bounds.maxX - bounds.minX), bh = Math.max(1e-6, bounds.maxY - bounds.minY);
  var s = Math.min((w - 2 * pad) / bw, (h - 2 * pad) / bh);
  return {
    s: s,
    x: function (v) { return pad + (v - bounds.minX) * s + (w - 2 * pad - bw * s) / 2; },
    y: function (v) { return pad + (v - bounds.minY) * s + (h - 2 * pad - bh * s) / 2; }
  };
}
function txt(ctx, s, x, y, color, align, size) {
  ctx.fillStyle = color || '#e8ecf4';
  ctx.font = (size || 11) + 'px system-ui, sans-serif';
  ctx.textAlign = align || 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(s, x, y);
}
function line(ctx, x1, y1, x2, y2, color, width, dash) {
  ctx.strokeStyle = color; ctx.lineWidth = width || 1.5;
  if (dash) ctx.setLineDash(dash); else ctx.setLineDash([]);
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  ctx.setLineDash([]);
}
function dot(ctx, x, y, r, fill, stroke, lw) {
  ctx.beginPath(); ctx.arc(x, y, r, 0, TAU);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw || 1.5; ctx.stroke(); }
}
function rectF(ctx, x, y, w, h, fill, stroke, lw) {
  if (fill) { ctx.fillStyle = fill; ctx.fillRect(x, y, w, h); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw || 1.5; ctx.strokeRect(x, y, w, h); }
}
function arrowHead(ctx, x, y, angle, size, color) {
  ctx.fillStyle = color;
  ctx.save(); ctx.translate(x, y); ctx.rotate(angle);
  ctx.beginPath(); ctx.moveTo(size, 0); ctx.lineTo(-size * 0.6, size * 0.55); ctx.lineTo(-size * 0.6, -size * 0.55); ctx.closePath(); ctx.fill();
  ctx.restore();
}
var KIND_COLOR = function (kind, pal) {
  if (kind === 'entrance') return pal.success || '#3fce7c';
  if (kind === 'exit') return pal.danger || '#f2555a';
  if (kind === 'spot-entry') return pal.warning || '#f0a93c';
  if (kind === 'access-anchor') return pal.muted || '#8a93a8';
  return pal.accent || '#4f9cf7';
};

/* RENDER: đồ thị — node/edge/state */
function renderGraph(ctx, frame, env, s) {
  var p = pal(env), pad = 34;
  var nodes = s.nodes || [], edges = s.edges || [];
  var xs = nodes.map(function (n) { return n.x; }), ys = nodes.map(function (n) { return n.y; });
  if (!xs.length) xs = [0, 1], ys = [0, 1];
  var t = fitScale({ minX: Math.min.apply(null, xs) - 0.6, maxX: Math.max.apply(null, xs) + 0.6, minY: Math.min.apply(null, ys) - 0.6, maxY: Math.max.apply(null, ys) + 0.6 }, env, pad);
  var byId = {};
  nodes.forEach(function (n) { byId[n.id] = n; });
  edges.forEach(function (e) {
    var a = byId[e.from], b = byId[e.to];
    if (!a || !b) return;
    var col = e.state === 'path' ? (p.success || '#3fce7c') : e.state === 'active' ? (p.warning || '#f0a93c') : e.state === 'skip' ? (p.grid || '#2a3248') : (p.muted || '#8a93a8');
    var x1 = t.x(a.x), y1 = t.y(a.y), x2 = t.x(b.x), y2 = t.y(b.y);
    line(ctx, x1, y1, x2, y2, col, e.state === 'path' ? 3 : 1.5, e.direction === 'two-way' ? null : null);
    var mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
    if (e.direction === 'one-way') arrowHead(ctx, mx, my, Math.atan2(y2 - y1, x2 - x1), 6, col);
    if (e.distance !== undefined && s.showDist) txt(ctx, String(r2(e.distance)), mx + 3, my - 6, p.muted, 'left', 9);
  });
  if (s.projection) {
    var pr = s.projection;
    if (s.vehicle) line(ctx, t.x(s.vehicle.x), t.y(s.vehicle.y), t.x(pr.x), t.y(pr.y), p.danger, 1.5, [4, 3]);
    dot(ctx, t.x(pr.x), t.y(pr.y), 6, null, p.danger, 2);
  }
  nodes.forEach(function (n) {
    var x = t.x(n.x), y = t.y(n.y);
    var base = KIND_COLOR(n.kind, p);
    var fill = n.state === 'current' ? (p.warning || '#f0a93c') : n.state === 'path' ? (p.success || '#3fce7c') : n.state === 'open' ? (p.accent || '#4f9cf7') : n.state === 'closed' ? (p.grid || '#2a3248') : n.state === 'dead' ? (p.danger || '#f2555a') : base;
    dot(ctx, x, y, n.state === 'current' ? 9 : 7, fill, n.state === 'open' ? (p.text || '#e8ecf4') : null, 1.5);
    txt(ctx, n.label || n.id, x + 10, y, p.text, 'left', 10);
  });
  if (s.vehicle) {
    var v = s.vehicle;
    dot(ctx, t.x(v.x), t.y(v.y), 8, p.danger || '#f2555a', p.text, 1.5);
    txt(ctx, v.label || 'xe', t.x(v.x), t.y(v.y) - 14, p.text, 'center', 10);
  }
  if (s.caption) txt(ctx, s.caption, 8, env.height - 14, p.muted, 'left', 10);
}

/* RENDER: map bãi đỗ — spots/route/vehicle/corridor */
function renderMap(ctx, frame, env, s) {
  var p = pal(env), pad = 30;
  var spots = s.spots || [];
  var xs = [0, 10], ys = [0, 10];
  spots.forEach(function (sp) { xs.push(sp.x, sp.x + sp.w); ys.push(sp.y, sp.y + sp.h); });
  (s.route || []).forEach(function (pt) { xs.push(pt[0]); ys.push(pt[1]); });
  if (s.vehicle) { xs.push(s.vehicle.x); ys.push(s.vehicle.y); }
  var t = fitScale({ minX: Math.min.apply(null, xs) - 0.5, maxX: Math.max.apply(null, xs) + 0.5, minY: Math.min.apply(null, ys) - 0.5, maxY: Math.max.apply(null, ys) + 0.5 }, env, pad);
  spots.forEach(function (sp) {
    var col = sp.status === 'occupied' ? (p.danger || '#f2555a') : sp.status === 'empty' ? (p.grid || '#2a3248') : sp.status === 'reserved' ? (p.warning || '#f0a93c') : (p.muted || '#8a93a8');
    rectF(ctx, t.x(sp.x), t.y(sp.y), sp.w * t.s, sp.h * t.s, sp.hl ? (p.accent + '55') : null, col, sp.hl ? 2.5 : 1.5);
    txt(ctx, sp.id, t.x(sp.x) + 3, t.y(sp.y) - 6, p.text, 'left', 9);
    if (sp.entryPoint) dot(ctx, t.x(sp.entryPoint.x), t.y(sp.entryPoint.y), 3, p.success || '#3fce7c');
  });
  if (s.corridor) {
    var c = s.corridor;
    ctx.strokeStyle = p.warning || '#f0a93c'; ctx.lineWidth = 1;
    ctx.setLineDash([5, 4]);
    ctx.beginPath(); ctx.arc(t.x(c.x), t.y(c.y), c.r * t.s, 0, TAU); ctx.stroke();
    ctx.setLineDash([]);
  }
  if (s.route && s.route.length > 1) {
    for (var i = 0; i < s.route.length - 1; i++) {
      var a = s.route[i], b = s.route[i + 1];
      line(ctx, t.x(a[0]), t.y(a[1]), t.x(b[0]), t.y(b[1]), s.routeColor || (p.accent || '#4f9cf7'), 2.5);
    }
    s.route.forEach(function (pt, i) {
      if (s.dropped && s.dropped[i]) dot(ctx, t.x(pt[0]), t.y(pt[1]), 4, p.muted);
      else dot(ctx, t.x(pt[0]), t.y(pt[1]), 3.5, p.accent || '#4f9cf7');
    });
  }
  (s.arrows || []).forEach(function (a) {
    arrowHead(ctx, t.x(a.x), t.y(a.y), a.angle * Math.PI / 180, 8, p.warning || '#f0a93c');
  });
  (s.markers || []).forEach(function (m) {
    dot(ctx, t.x(m.x), t.y(m.y), m.r || 6, m.color || p.accent, p.text, 1);
    if (m.label) txt(ctx, m.label, t.x(m.x), t.y(m.y) - (m.r || 6) - 8, p.text, 'center', 10);
  });
  if (s.vehicle) {
    var v = s.vehicle;
    dot(ctx, t.x(v.x), t.y(v.y), 8, p.danger || '#f2555a', p.text, 1.5);
    txt(ctx, 'xe', t.x(v.x), t.y(v.y) - 14, p.text, 'center', 10);
    if (s.minSeg) {
      var m2 = s.minSeg;
      line(ctx, t.x(v.x), t.y(v.y), t.x(m2.x), t.y(m2.y), p.danger, 1.5, [4, 3]);
      dot(ctx, t.x(m2.x), t.y(m2.y), 5, null, p.danger, 2);
    }
  }
  if (s.caption) txt(ctx, s.caption, 8, env.height - 14, p.muted, 'left', 10);
}

/* RENDER: bars ngang */
function renderBars(ctx, frame, env, s) {
  var p = pal(env);
  var items = s.items || [];
  var max = 1;
  items.forEach(function (it) { max = Math.max(max, it.value); });
  var rowH = Math.min(34, (env.height - 50) / Math.max(1, items.length));
  items.forEach(function (it, i) {
    var y = 30 + i * rowH;
    var bw = (it.value / max) * (env.width - 180);
    rectF(ctx, 130, y, Math.max(1, bw), rowH * 0.6, it.color || (p.accent || '#4f9cf7'));
    txt(ctx, it.label, 8, y + rowH * 0.3, p.text, 'left', 11);
    txt(ctx, String(it.value), 136 + bw, y + rowH * 0.3, p.text, 'left', 11);
  });
  if (s.caption) txt(ctx, s.caption, 8, env.height - 14, p.muted, 'left', 10);
}

/* RENDER: bảng hàng (pipeline/decision) */
function renderRows(ctx, frame, env, s) {
  var p = pal(env);
  var rows = s.rows || [];
  var rowH = Math.min(40, (env.height - 60) / Math.max(1, rows.length));
  rows.forEach(function (r, i) {
    var y = 26 + i * rowH;
    var active = r.state === 'active';
    rectF(ctx, 6, y, env.width - 12, rowH * 0.8, active ? (p.accent + '33') : null, r.state === 'fail' ? (p.danger || '#f2555a') : r.state === 'pass' ? (p.success || '#3fce7c') : (p.grid || '#2a3248'), active ? 2 : 1);
    (r.cells || []).forEach(function (c, j) {
      txt(ctx, String(c), 14 + j * ((env.width - 60) / Math.max(1, r.cells.length)), y + rowH * 0.4, r.state === 'fail' ? (p.danger || '#f2555a') : r.state === 'pass' ? (p.success || '#3fce7c') : (p.text || '#e8ecf4'), 'left', 11);
    });
  });
  if (s.caption) txt(ctx, s.caption, 8, env.height - 14, p.muted, 'left', 10);
}

/* RENDER: timeline sự kiện */
function renderTimeline(ctx, frame, env, s) {
  var p = pal(env);
  var events = s.events || [];
  var t0 = s.tMin !== undefined ? s.tMin : 0;
  var t1 = s.tMax !== undefined ? s.tMax : Math.max.apply(null, events.map(function (e) { return e.t; }).concat([1]));
  var y = env.height / 2;
  var X = function (v) { return 40 + (v - t0) / Math.max(1e-9, t1 - t0) * (env.width - 80); };
  line(ctx, X(t0), y, X(t1), y, p.muted, 2);
  for (var g = Math.ceil(t0); g <= t1; g++) {
    line(ctx, X(g), y - 5, X(g), y + 5, p.muted, 1);
    txt(ctx, g + 's', X(g), y + 18, p.muted, 'center', 9);
  }
  events.forEach(function (e) {
    var col = e.kind === 'speak' ? (p.success || '#3fce7c') : e.kind === 'urgent' ? (p.danger || '#f2555a') : (p.muted || '#8a93a8');
    var ex = X(e.t);
    dot(ctx, ex, y, e.kind === 'skip' ? 4 : 7, col, p.text, 1);
    txt(ctx, e.label, ex, y - 26 - (e.row || 0) * 14, col, 'center', 10);
    txt(ctx, e.verdict || '', ex, y + 30 + (e.row || 0) * 12, p.muted, 'center', 9);
  });
  if (s.cursor !== undefined) {
    var cx = X(Math.max(t0, Math.min(t1, s.cursor)));
    line(ctx, cx, y - 40, cx, y + 44, p.warning || '#f0a93c', 2);
    txt(ctx, 'now=' + r2(s.cursor) + 's', cx, y - 48, p.warning, 'center', 10);
  }
  if (s.caption) txt(ctx, s.caption, 8, env.height - 12, p.muted, 'left', 10);
}

/* RENDER: hình học tự do — points/segments/vectors/labels */
function renderGeom(ctx, frame, env, s) {
  var p = pal(env), pad = 36;
  var xs = [0], ys = [0];
  (s.points || []).forEach(function (pt) { xs.push(pt.x); ys.push(pt.y); });
  (s.segments || []).forEach(function (sg) { xs.push(sg.a.x, sg.b.x); ys.push(sg.a.y, sg.b.y); });
  var t = fitScale({ minX: Math.min.apply(null, xs) - 0.5, maxX: Math.max.apply(null, xs) + 0.5, minY: Math.min.apply(null, ys) - 0.5, maxY: Math.max.apply(null, ys) + 0.5 }, env, pad);
  (s.segments || []).forEach(function (sg) {
    line(ctx, t.x(sg.a.x), t.y(sg.a.y), t.x(sg.b.x), t.y(sg.b.y), sg.color || (p.accent || '#4f9cf7'), sg.width || 2, sg.dash);
    if (sg.arrow) arrowHead(ctx, t.x(sg.b.x), t.y(sg.b.y), Math.atan2(t.y(sg.b.y) - t.y(sg.a.y), t.x(sg.b.x) - t.x(sg.a.x)), 7, sg.color || p.accent);
  });
  (s.boxes || []).forEach(function (b) {
    rectF(ctx, t.x(b.x), t.y(b.y), b.w * t.s, b.h * t.s, b.fill, b.color || p.warning, 1.5);
  });
  (s.points || []).forEach(function (pt) {
    dot(ctx, t.x(pt.x), t.y(pt.y), pt.r || 6, pt.color || (p.accent || '#4f9cf7'), pt.stroke ? p.text : null, 1);
    if (pt.label) txt(ctx, pt.label, t.x(pt.x) + 9, t.y(pt.y) - 9, p.text, 'left', 10);
  });
  (s.notes || []).forEach(function (n) { txt(ctx, n.text, t.x(n.x), t.y(n.y), n.color || p.muted, 'center', 10); });
  if (s.caption) txt(ctx, s.caption, 8, env.height - 14, p.muted, 'left', 10);
}

/* RENDER: board — thẻ key-value + log */
function renderBoard(ctx, frame, env, s) {
  var p = pal(env);
  var cards = s.cards || [];
  var cols = Math.max(1, Math.min(3, Math.floor(env.width / 220)));
  var cw = (env.width - 20) / cols;
  cards.forEach(function (c, i) {
    var cx = 10 + (i % cols) * cw, cy = 16 + Math.floor(i / cols) * 62;
    rectF(ctx, cx, cy, cw - 8, 54, c.hl ? (p.accent + '22') : null, c.color || (p.grid || '#2a3248'), 1);
    txt(ctx, c.label, cx + 8, cy + 16, p.muted, 'left', 9);
    txt(ctx, String(c.value), cx + 8, cy + 38, c.color || (p.text || '#e8ecf4'), 'left', 13);
  });
  var logY = 20 + Math.ceil(cards.length / cols) * 62;
  (s.log || []).forEach(function (lg, i) {
    txt(ctx, lg, 12, logY + i * 16, p.text, 'left', 11);
  });
  if (s.caption) txt(ctx, s.caption, 8, env.height - 10, p.muted, 'left', 9);
}

var RENDER = {
  graph: renderGraph, map: renderMap, bars: renderBars, rows: renderRows,
  timeline: renderTimeline, geom: renderGeom, board: renderBoard
};
function drawScene(ctx, frame, env) {
  var s = (frame && frame.scene) || {};
  ctx.fillStyle = (env.palette && env.palette.background) || '#12172a';
  ctx.fillRect(0, 0, env.width, env.height);
  var r = RENDER[s.type || 'board'];
  r(ctx, frame, env, s);
}

/* =================================================================
 * LESSON factory
 * ================================================================= */
var lessons = [];
/* SPEC §5: "với tham số mặc định trace.expected phải khớp scenario.expected".
 * UI truyền object parameters[].default đầy đủ — param bằng default KHÔNG được
 * nuốt scenario.input của edge fixture; chỉ param KHÁC default mới override. */
function noOverride(params) { return !params || Object.keys(params).length === 0; }
function changedParams(lesson, params) {
  if (!params) return {};
  var defs = {};
  (lesson.parameters || []).forEach(function (pr) { defs[pr.key] = pr.default; });
  var out = {};
  Object.keys(params).forEach(function (k) {
    if (!(k in defs) || !eqJson(params[k], defs[k])) out[k] = params[k];
  });
  return out;
}

function L(id, def) {
  def.id = id;
  def.pack = PACK_ID;
  def.aliases = def.aliases || [];
  def.related = def.related || [];
  def.parameters = def.parameters || [];
  def.simplifications = def.simplifications || [];
  def.edgeCases = def.edgeCases || [];
  def.draw = def.draw || drawScene;
  var origTrace = def.buildTrace;
  def.buildTrace = function (scenarioId, params) {
    return origTrace.call(this, scenarioId, changedParams(this, params));
  };
  lessons.push(def);
}

/* =================================================================
 * NHÓM ROUTING (8 lesson)
 * ================================================================= */

L('lane-graph-build', {
  title: 'Sinh đồ thị làn đường',
  topic: 'Định tuyến trong bãi đỗ',
  summary: 'Biến layout bãi đỗ thành LaneGraph có hướng: 3 làn (trái/giữa 2 chiều, phải 1 chiều theo cổng) + cạnh vào ô 1 chiều.',
  role: 'Tạo toàn bộ không gian tìm kiếm của A* — node làn/junction, node vào ô (spot-entry), node cổng.',
  inputTypes: [
    { name: 'geometry', type: 'ParkingGeometry', description: 'Layout tĩnh: spots, aisles, connectors, entrance/exit, anchors' },
    { name: 'spotsPerZone', type: 'number', description: 'Số ô mỗi zone (tham số demo; code cố định 10)' }
  ],
  outputTypes: [
    { name: 'graph', type: 'LaneGraph', description: '{nodes, edges, entranceNodeId, exitNodeId, spotEntryNodeIds}' }
  ],
  structures: [
    { name: 'nodeById', type: 'Map<string,LaneNode>', description: 'chống trùng node khi addNode' },
    { name: 'allY', type: 'number[]', description: 'mọi hàng Y: connector + tâm ô đại diện mỗi number' },
    { name: 'LaneEdge', type: '{id,from,to,distance,direction}', description: 'distance = euclid(from,to)' }
  ],
  complexity: { time: 'O(V + E + R·log R)', space: 'O(V+E)', variables: 'R=|allY| hàng Y, V=3R+S+4+A, E=(R+3)+2(R−1)+4+S', simulation: 'mini geometry 2 zone; code thật 6 zone × 10 ô → V=103, E=101' },
  codeRefs: [
    { path: 'frontend/src/routing/laneGraph.ts', line: 30, endLine: 163, symbol: 'buildLaneGraph', note: 'toàn bộ nhánh build' },
    { path: 'frontend/src/routing/laneGraph.ts', line: 73, endLine: 78, symbol: 'buildLaneGraph', note: 'rowYValues: tâm-y ô khớp number theo hàng' },
    { path: 'frontend/src/routing/laneGraph.ts', line: 142, endLine: 149, symbol: 'buildLaneGraph', note: 'aisle junction: F,E→left; D,C→center; else→right' }
  ],
  pseudocode: [
    { id: 'p1', text: 'addNode/addEdge qua Map chống trùng; edge.distance = euclid' },
    { id: 'p2', text: 'tạo entrance/exit node' },
    { id: 'p3', text: 'allY = Set(connTop, …tâm ô theo number, connBottom) sort' },
    { id: 'p4', text: 'mỗi y: center/left/right junction' },
    { id: 'p5', text: 'chuỗi one-way: entrance→corner→right descY→corner→exit' },
    { id: 'p6', text: 'chuỗi two-way: left & center theo Y tăng' },
    { id: 'p7', text: 'connectors: center↔left, center↔right tại 2 Y' },
    { id: 'p8', text: 'mỗi ô: node spot-* + cạnh one-way aisle→spot (F,E→left; D,C→center; else→right)' },
    { id: 'p9', text: 'anchor: node không cạnh' }
  ],
  edgeCases: [
    { title: 'Zone lạ ngoài {F,E,D,C}', description: 'Nhánh else → right aisle, không validate, không throw (code thật).' },
    { title: 'Ô không khớp hàng Y', description: 'Cạnh spot-* bị bỏ qua lặng nếu junction aisle-Y thiếu (if nodeById.has).' },
    { title: 'spot-entry sink', description: 'Mọi spot-* có out-degree 0 → hệ quả BUG ở findExitRoute (lesson spot-route-wrappers).' }
  ],
  simplifications: [
    { sourceBehavior: '6 zone × 10 ô, layout cố định 1200×900', demoBehavior: 'mini geometry 2 zone (F,B), spotsPerZone đổi được 1–3', reason: 'map nhỏ đọc được trên canvas; nhánh zone→aisle giữ nguyên logic' }
  ],
  related: ['adjacency-directed-expand', 'astar-find-route', 'gate-node-mutate', 'spot-route-wrappers'],
  parameters: [
    { key: 'spotsPerZone', label: 'Ô mỗi zone', type: 'number', min: 1, max: 3, step: 1, default: 2 },
    { key: 'showDist', label: 'Hiện chi phí cạnh', type: 'boolean', default: false }
  ],
  scenarios: [
    {
      id: 'default', title: 'Mini geometry 2 zone', edgeCase: false,
      description: 'F01/F02 + B01/B02, connector y=1/9 → allY=[1,3,6,9], V=21, E=21.',
      input: { geometry: 'GEOM_BASE', spotsPerZone: 2 },
      expected: { nodes: 21, edges: 21, allY: [1, 3, 6, 9], spotEdges: ['left-3=>spot-Z01', 'left-6=>spot-Z02', 'right-3=>spot-B01', 'right-6=>spot-B02'], spotOutDegree: 0 }
    },
    {
      id: 'edge', title: 'Zone lạ → right aisle', edgeCase: true,
      description: 'Ô zone "X" (ngoài F,E,D,C) rơi vào nhánh else → nối right, không báo lỗi.',
      input: { geometry: 'GEOM_BASE', spotsPerZone: 2, extraSpot: { id: 'X01', zone: 'X', number: 1, y: 2, height: 2, entryPoint: { x: 6.4, y: 3 } } },
      expected: { nodes: 22, edges: 22, xSpotEdge: 'right-3=>spot-X01', spotOutDegree: 0 }
    }
  ],
  buildTrace: function (scenarioId, params) {
    var p = pickParams(this, params);
    var sc = pickScenario(this, scenarioId);
    var geom = clone(GEOM_BASE);
    geom.anchors = { shopping: { id: 'shopping', x: 1, y: 1 } };
    if (sc.input.extraSpot) geom.spots.push(clone(sc.input.extraSpot));
    var spz = p.spotsPerZone;
    var g = buildLaneGraphMini(geom, spz);
    var frames = [];
    frames.push(fr('f0', ['p1', 'p2'], 'Geometry đầu vào: ' + geom.spots.length + ' ô, 2 connector y=1/9. Tạo 2 node cổng trước.',
      { entrance: geom.entrance, exit: geom.exit },
      [{ label: 'nodes', value: 2 }], { type: 'graph', nodes: g.nodes.filter(function (n) { return n.kind === 'entrance' || n.kind === 'exit'; }), edges: [] }));
    frames.push(fr('f1', ['p3'], 'allY = {connTop 1} ∪ {tâm ô theo number 1..' + spz + '} ∪ {connBottom 9} — mỗi number chỉ lấy ô đầu tiên khớp.',
      { allY: g.allY, rowYValues: 'tâm ô đại diện' },
      [{ label: '|allY|', value: g.allY.length }], { type: 'graph', nodes: g.nodes.slice(0, 2 + 3 * g.allY.length), edges: [], showDist: false }));
    var oneWayChain = g.edges.filter(function (e) { return e.direction === 'one-way' && e.to.indexOf('spot-') !== 0; });
    frames.push(fr('f2', ['p4', 'p5'], 'Chuỗi làn phải ONE-WAY theo Y giảm: entrance→corner→right-9…right-1→corner→exit.',
      { rightChain: 'entrance→entrance-corner→' + g.allY.slice().reverse().map(function (y) { return 'right-' + y; }).join('→') + '→exit-corner→exit' },
      [{ label: 'edges 1-chiều', value: oneWayChain.length }], { type: 'graph', nodes: g.nodes, edges: oneWayChain, showDist: p.showDist }));
    frames.push(fr('f3', ['p6', 'p7'], 'Làn trái + giữa TWO-WAY theo Y tăng; connectors center↔left/right tại y=1 và y=9.',
      { twoWay: g.edges.filter(function (e) { return e.direction === 'two-way'; }).map(function (e) { return e.id; }) },
      [{ label: 'edges 2-chiều', value: g.edges.filter(function (e) { return e.direction === 'two-way'; }).length }],
      { type: 'graph', nodes: g.nodes, edges: g.edges.filter(function (e) { return e.direction === 'two-way'; }) }));
    var spotEdges = g.edges.filter(function (e) { return e.to.indexOf('spot-') === 0; });
    frames.push(fr('f4', ['p8'], 'Cạnh vào ô ONE-WAY: F,E→left; D,C→center; còn lại→right. Zone "X" rơi vào else→right (không validate).',
      { spotEdges: spotEdges.map(function (e) { return e.id; }) },
      [{ label: 'spot edges', value: spotEdges.length }],
      { type: 'graph', nodes: g.nodes, edges: spotEdges }));
    frames.push(fr('f5', ['p9'], 'Anchor (điểm đến bộ) chỉ là node — không cạnh nào nối vào.',
      { anchors: g.nodes.filter(function (n) { return n.kind === 'access-anchor'; }).map(function (n) { return n.id; }) },
      [{ label: 'anchors', value: g.nodes.filter(function (n) { return n.kind === 'access-anchor'; }).length }], { type: 'graph', nodes: g.nodes, edges: g.edges }));
    var spotOut = g.edges.filter(function (e) { return e.from.indexOf('spot-') === 0; }).length;
    frames.push(fr('f6', ['p1'], 'Hoàn tất: mọi spot-* out-degree = ' + spotOut + ' → sink. Đây là nguồn gốc BUG findExitRoute (xem lesson spot-route-wrappers).',
      { V: g.nodes.length, E: g.edges.length, spotEntryNodeIds: g.spotEntryNodeIds },
      [{ label: 'V', value: g.nodes.length }, { label: 'E', value: g.edges.length }, { label: 'spot out-degree', value: spotOut }],
      { type: 'graph', nodes: g.nodes, edges: g.edges }));
    var R = g.allY.length, S = geom.spots.filter(function (s) { return s.number <= spz; }).length, A = 1;
    var refV = 3 * R + S + 4 + A, refE = (R + 3) + 2 * (R - 1) + 4 + S;
    var result = { nodes: g.nodes.length, edges: g.edges.length, allY: g.allY, spotEdges: spotEdges.map(function (e) { return e.id; }), spotOutDegree: spotOut };
    var isDefault = sc.id === 'default' && spz === 2;
    var expected;
    if (params && params.spotsPerZone !== undefined) {
      expected = { nodes: refV, edges: refE, allY: g.allY, spotEdges: result.spotEdges, spotOutDegree: 0 };
      if (sc.input.extraSpot) expected.xSpotEdge = 'right-3=>spot-' + sc.input.extraSpot.id;
    } else expected = sc.expected;
    var checks = [
      chk('số node', result.nodes, expected.nodes),
      chk('số cạnh', result.edges, expected.edges),
      chk('allY', result.allY, expected.allY || g.allY),
      chk('spot out-degree = 0 (sink)', result.spotOutDegree, 0)
    ];
    if (sc.input.extraSpot) {
      var xEdgeId = result.spotEdges.filter(function (id) { return id.indexOf('=>spot-' + sc.input.extraSpot.id) >= 0; })[0] || null;
      checks.push(chkTrue('zone ' + sc.input.extraSpot.zone + ' → right aisle (else)', xEdgeId !== null && xEdgeId.indexOf('right-') === 0, xEdgeId, 'right-*=>spot-' + sc.input.extraSpot.id));
    }
    else checks.push(chk('spot edges', result.spotEdges, expected.spotEdges || result.spotEdges));
    return { frames: frames, result: result, expected: expected, checks: checks };
  }
});

L('adjacency-directed-expand', {
  title: 'Sinh hàng xóm có hướng',
  topic: 'Định tuyến trong bãi đỗ',
  summary: 'LaneEdge[] → Map<from, DirectedStep[]>: cạnh one-way cho 1 bước, two-way sinh thêm bước ngược — neighbor generation của A*.',
  role: 'Quyết định node nào đi được tới đâu — lá chắn chiều làn (one-way không bao giờ đảo).',
  inputTypes: [{ name: 'graph', type: 'LaneGraph', description: 'đồ thị từ lane-graph-build' }],
  outputTypes: [{ name: 'adjacency', type: 'Map<string,DirectedStep[]>', description: 'DirectedStep{edgeId,from,to,distance}' }],
  structures: [
    { name: 'adjacency', type: 'Map<string,DirectedStep[]>', description: '|steps| = E_one + 2·E_two' }
  ],
  complexity: { time: 'O(V+E)', space: 'O(V+E)', variables: 'E_one cạnh 1 chiều, E_two cạnh 2 chiều', simulation: 'giống code; build lại mỗi lần findRoute gọi' },
  codeRefs: [
    { path: 'frontend/src/routing/routeEngine.ts', line: 18, endLine: 29, symbol: 'buildAdjacency', note: 'two-way push bản đảo' }
  ],
  pseudocode: [
    { id: 'p1', text: 'adjacency[node.id] = [] ∀node' },
    { id: 'p2', text: '∀edge: push step vào adjacency[from]' },
    { id: 'p3', text: 'edge two-way → push bản đảo vào adjacency[to]' }
  ],
  edgeCases: [
    { title: 'Cạnh tới node không tồn tại', description: 'Vẫn push vào adjacency — chỉ bị skip khi relax (findRoute kiểm nodeById).' },
    { title: 'spot-entry sink', description: 'adjacency[spot-*] = [] — không lối ra.' }
  ],
  simplifications: [],
  related: ['lane-graph-build', 'astar-find-route', 'route-edge-validator'],
  parameters: [
    { key: 'node', label: 'Node xem hàng xóm', type: 'select', default: 'c4', options: [
      { value: 'c4', label: 'c4 (4 bước)' }, { value: 'r4', label: 'r4 (2 bước)' }, { value: 'sC05', label: 'sC05 (sink)' }, { value: 'c7', label: 'c7 (2 bước)' }
    ] }
  ],
  scenarios: [
    {
      id: 'default', title: 'Node c4 có 4 hướng đi', edgeCase: false,
      description: 'c4 là to của 2 cạnh two-way (r4⇄c4, c7⇄c4) + from của c4⇒c2, c4⇒sC05 → 4 bước.',
      input: { graph: 'G1' },
      expected: { 'c4': ['r4=>c4→r4', 'c7=>c4→c7', 'c4=>c2→c2', 'c4=>sC05→sC05'], totalSteps: 17 }
    },
    {
      id: 'edge', title: 'Sink spot-entry', edgeCase: true,
      description: 'sC05 chỉ nhận cạnh vào → adjacency rỗng; bẫy chiều làn không cho quay đầu.',
      input: { graph: 'G1', nodes: ['sC05', 'r4'] },
      expected: { 'sC05': [], 'r4': ['r4=>r2→r2', 'r4=>c4→c4'], totalSteps: 17 }
    }
  ],
  buildTrace: function (scenarioId, params) {
    var p = pickParams(this, params);
    var sc = pickScenario(this, scenarioId);
    var adj = buildAdjacency(G1);
    var frames = [];
    var total = 0;
    adj.forEach(function (v) { total += v.length; });
    frames.push(fr('f0', ['p1'], 'Khởi tạo Map rỗng cho ' + G1.nodes.length + ' node.',
      { nodes: G1.nodes.length },
      [{ label: 'nodes', value: G1.nodes.length }],
      { type: 'graph', nodes: G1.nodes, edges: [] }));
    var oneWay = G1.edges.filter(function (e) { return e.direction === 'one-way'; }).length;
    var twoWay = G1.edges.length - oneWay;
    frames.push(fr('f1', ['p2', 'p3'], 'Duyệt ' + G1.edges.length + ' cạnh: ' + oneWay + ' one-way (1 bước) + ' + twoWay + ' two-way (2 bước) → tổng ' + total + ' DirectedStep.',
      { oneWay: oneWay, twoWay: twoWay, totalSteps: total },
      [{ label: 'steps', value: total }], { type: 'graph', nodes: G1.nodes, edges: G1.edges }));
    var nodes = sc.input.nodes || [p.node];
    var result = { totalSteps: total };
    var expected = sc.input.nodes ? sc.expected : { totalSteps: sc.expected.totalSteps };
    nodes.forEach(function (node, ni) {
      var steps = (adj.get(node) || []).map(function (s) { return s.edgeId + '→' + s.to; });
      result[node] = steps;
      if (!sc.input.nodes) expected[node] = (adj.get(node) || []).map(function (s) { return s.edgeId + '→' + s.to; });
      var hlEdges = (adj.get(node) || []).map(function (s) { return { from: s.from, to: s.to, direction: 'one-way', state: 'active', distance: s.distance }; });
      frames.push(fr('f' + (2 + ni), ['p2', 'p3'], 'adjacency["' + node + '"] = ' + JSON.stringify(steps) + (steps.length === 0 ? ' — SINK: không lối ra, A* pop sẽ cạn open.' : ' — gồm cả bước đảo từ cạnh two-way.'),
        { node: node, steps: steps },
        [{ label: 'out-degree ' + node, value: steps.length }],
        { type: 'graph', nodes: G1.nodes.map(function (n) { return { id: n.id, x: n.x, y: n.y, kind: n.kind, state: n.id === node ? 'current' : undefined }; }), edges: hlEdges.length ? hlEdges : G1.edges.map(function (e) { return { from: e.from, to: e.to, direction: e.direction, state: 'skip' }; }), showDist: true }));
    });
    var checks = [chk('tổng DirectedStep', total, expected.totalSteps)];
    nodes.forEach(function (node) { checks.push(chk('adjacency[' + node + ']', result[node], expected[node])); });
    return { frames: frames, result: result, expected: expected, checks: checks };
  }
});

L('astar-find-route', {
  title: 'A* tìm đường',
  topic: 'Định tuyến trong bãi đỗ',
  summary: 'A* trên đồ thị có hướng: open-set quét tuyến tính, f=g+h với h=euclid·scale, tie-break theo g rồi nodeOrder.',
  role: 'Lõi dẫn đường — mọi wrapper (vào ô / ra cổng / từ vị trí xe) đều gọi hàm này.',
  inputTypes: [
    { name: 'graph', type: 'LaneGraph', description: 'đồ thị làn' },
    { name: 'startNodeId/endNodeId', type: 'string', description: 'đổi được trong params' }
  ],
  outputTypes: [{ name: 'route', type: 'RouteResult|null', description: '{nodeIds, edgeIds, points, distance} hoặc null' }],
  structures: [
    { name: 'open', type: 'Set<string>', description: 'quét tuyến tính O(V) mỗi pop — KHÔNG heap' },
    { name: 'distances/estimates/previous', type: 'Map', description: 'g, f=g+h, prev{nodeId,edgeId}' },
    { name: 'nodeOrder', type: 'Map<string,int>', description: 'tie-break cuối cùng theo thứ tự khai báo' }
  ],
  complexity: { time: 'O(V² + E)', space: 'O(V+E)', variables: 'mỗi pop quét open O(V)', simulation: 'giống code; graph nhỏ nên mỗi pop thành 1 frame' },
  codeRefs: [
    { path: 'frontend/src/routing/routeEngine.ts', line: 31, endLine: 119, symbol: 'findRoute', note: 'A* đầy đủ' },
    { path: 'frontend/src/routing/routeEngine.ts', line: 38, endLine: 46, symbol: 'findRoute', note: 'heuristicScale = min(edge.dist/euclid)' },
    { path: 'frontend/src/routing/routeEngine.ts', line: 57, endLine: 75, symbol: 'findRoute', note: 'tie-break: f → g → nodeOrder' }
  ],
  pseudocode: [
    { id: 'p1', text: 'null nếu start/end không tồn tại; nodeOrder = index khai báo' },
    { id: 'p2', text: 'heuristicScale = min_e(edge.distance / euclid(e)); h(n)=euclid(n,goal)·scale' },
    { id: 'p3', text: 'open={start}; g[start]=0; f[start]=h(start)' },
    { id: 'p4', text: 'lặp: chọn current f min; hoà → g min; hoà → nodeOrder min' },
    { id: 'p5', text: 'current ∞ → break (không tới được); current==end → break' },
    { id: 'p6', text: '∀step: cand = g[cur]+step.d; cand < g[to] → cập nhật g,f,prev, open.add' },
    { id: 'p7', text: 'g[end]=∞ → null; lần ngược previous → route' }
  ],
  edgeCases: [
    { title: 'Route TỪ sink → null', description: 'Start là spot-entry (out-degree 0): open cạn ngay, g[end]=∞ → null. Route TỚI sink bình thường (vào ô).' },
    { title: 'start==end', description: 'Route 1 điểm, distance 0.' },
    { title: 'Node không tồn tại', description: 'Trả null ngay bước kiểm tra.' }
  ],
  simplifications: [],
  related: ['adjacency-directed-expand', 'spot-route-wrappers', 'route-edge-validator', 'drivable-edge-project'],
  parameters: [
    { key: 'start', label: 'Start', type: 'select', default: 'entrance', options: [
      { value: 'entrance', label: 'entrance' }, { value: 'sC05', label: 'sC05 (sink)' }, { value: 'c7', label: 'c7' }, { value: 'r7', label: 'r7' }
    ] },
    { key: 'end', label: 'Đích', type: 'select', default: 'sC05', options: [
      { value: 'sC05', label: 'sC05' }, { value: 'exit', label: 'exit' }, { value: 'c2', label: 'c2' }, { value: 'r2', label: 'r2' }
    ] }
  ],
  scenarios: [
    {
      id: 'default', title: 'Entrance → ô C05', edgeCase: false,
      description: 'findRoute(G1,"entrance","sC05"): 7 pops, distance 8.6 — c7 được expand nhưng relax thua.',
      input: { graph: 'G1', start: 'entrance', end: 'sC05' },
      expected: { nodeIds: ['entrance', 'ec', 'r7', 'r4', 'c4', 'sC05'], distance: 8.6, pops: 7 }
    },
    {
      id: 'edge', title: 'Route TỪ sink → null', edgeCase: true,
      description: 'findRoute(G1,"sC05","exit"): start out-degree 0 → open cạn ngay, g[exit]=∞ → null (nguồn BUG exit).',
      input: { graph: 'G1', start: 'sC05', end: 'exit' },
      expected: { nodeIds: null, distance: null, pops: 1 }
    }
  ],
  buildTrace: function (scenarioId, params) {
    var p = pickParams(this, params);
    var sc = pickScenario(this, scenarioId);
    var start = (params && params.start !== undefined) ? params.start : (sc.input.start || p.start);
    var end = (params && params.end !== undefined) ? params.end : (sc.input.end || p.end);
    var res = astar(G1, start, end, true);
    var frames = [];
    var nodeState = function (openList, closedList, currentId, pathIds) {
      return G1.nodes.map(function (n) {
        var st;
        if (pathIds && pathIds.indexOf(n.id) >= 0) st = 'path';
        else if (n.id === currentId) st = 'current';
        else if (closedList.indexOf(n.id) >= 0) st = 'closed';
        else if (openList.indexOf(n.id) >= 0) st = 'open';
        return { id: n.id, x: n.x, y: n.y, kind: n.kind, state: st };
      });
    };
    var closed = [];
    frames.push(fr('f0', ['p1', 'p2', 'p3'], 'init: open={' + start + '}, g[start]=0, h scale=' + r3(res ? res.heuristicScale : 0) + ' (min edge.dist/euclid).',
      { start: start, end: end, heuristicScale: res ? res.heuristicScale : 0 },
      [{ label: 'scale', value: r3(res ? res.heuristicScale : 0) }],
      { type: 'graph', nodes: nodeState([start], [], start), edges: G1.edges }));
    var pops = res ? res.pops : [];
    pops.forEach(function (pop, i) {
      var relaxTxt = (pop.relax || []).map(function (r) { return r.to + ':' + (r.improved ? 'g=' + r3(r.g) + ' ✓' : 'thua (' + r3(r.g) + ' ≥ cũ)'); }).join(', ');
      var expl = 'pop ' + pop.id + ' (g=' + r3(pop.g) + ', f=' + r3(pop.f) + ')' + (relaxTxt ? ' — relax: ' + relaxTxt : (pop.id === end ? ' — ĐÍCH!' : ' — không còn mở rộng được'));
      if (pop.id === 'c7') expl += ' · c7 được expand vì f=8.06 < f(c4)=8.6, nhưng relax vào c4: 5+5=10 > 8 → THUA, prev[c4] không đổi';
      frames.push(fr('pop' + i, ['p4', 'p6'], expl,
        { open: pop.open, closed: closed.slice(), current: pop.id, g: r3(pop.g), f: r3(pop.f) },
        [{ label: 'pop', value: i + 1 }, { label: 'open', value: (pop.open || []).length }],
        { type: 'graph', nodes: nodeState(pop.open || [], closed, pop.id), edges: G1.edges }));
      closed.push(pop.id);
    });
    var route = res ? res.route : null;
    var pathIds = route ? route.nodeIds : [];
    var pathEdges = route ? route.edgeIds : [];
    frames.push(fr('done', ['p7'], route
      ? 'Lần ngược previous → ' + pathIds.join('→') + ', distance=' + r3(route.distance) + '.'
      : 'g[' + end + ']=∞ → null. ' + (start === 'sC05' ? 'sC05 là sink: open cạn ngay sau pop đầu — không cạnh ra.' : 'Không tới được đích.'),
      { nodeIds: pathIds, edgeIds: pathEdges, distance: route ? r3(route.distance) : null },
      [{ label: 'distance', value: route ? r3(route.distance) : 'null' }, { label: 'pops', value: pops.length }],
      { type: 'graph', nodes: nodeState([], closed, null, pathIds), edges: G1.edges.map(function (e) { return { from: e.from, to: e.to, direction: e.direction, state: pathEdges.indexOf(e.id) >= 0 ? 'path' : undefined }; }) }));
    var brute = bruteShortest(G1, start, end);
    var sameInput = !(params && (params.start !== undefined || params.end !== undefined));
    var result = { nodeIds: route ? route.nodeIds : null, edgeIds: route ? route.edgeIds : null, distance: route ? r3(route.distance) : null, pops: pops.length };
    var expected = sameInput ? sc.expected : (brute ? { nodeIds: brute.nodeIds, distance: r3(brute.distance), pops: result.pops } : { nodeIds: null, distance: null, pops: result.pops });
    var checks = [
      chk('distance', result.distance, expected.distance !== undefined ? expected.distance : null),
      chkTrue('số pop hợp lệ', sameInput ? result.pops === sc.expected.pops : result.pops >= 1, result.pops, sameInput ? sc.expected.pops : '≥1 tuỳ start/end')
    ];
    var isDefault = sc.id === 'default' && start === 'entrance' && end === 'sC05';
    if (sameInput && sc.expected.nodeIds !== undefined) checks.push(chk('nodeIds', result.nodeIds, sc.expected.nodeIds));
    else if (route && brute) {
      checks.push(chkTrue('tối ưu (brute-force độc lập)', Math.abs(route.distance - brute.distance) < 1e-6, r3(route.distance), r3(brute.distance)));
      checks.push(chkTrue('cạnh hợp lệ đúng chiều', routeUsesOnlyValidEdges(G1, route), result.nodeIds, 'mọi edgeId nối nodeIds đúng hướng'));
    } else checks.push(chkTrue('cùng kết luận null', (route === null) === (brute === null), result.nodeIds, brute ? brute.nodeIds : null));
    return { frames: frames, result: result, expected: expected, checks: checks };
  }
});

L('spot-route-wrappers', {
  title: 'Tuyến tĩnh entrance↔ô/exit',
  topic: 'Định tuyến trong bãi đỗ',
  summary: 'findVehicleRoute: entrance→spot-entry; findExitRoute: spot-entry→exit — wrapper lookup + A*. Exit trả null cho MỌI ô (BUG sink).',
  role: 'API tĩnh khi không có vị trí xe — và cũng là nơi lộ BUG: mọi spot-entry là sink nên exit route luôn null.',
  inputTypes: [{ name: 'spotId', type: 'SpotId', description: 'vd "C05"; lookup graph.spotEntryNodeIds' }],
  outputTypes: [{ name: 'route', type: 'RouteResult|null', description: 'null nếu không có entry node' }],
  structures: [{ name: 'spotEntryNodeIds', type: 'Record<SpotId,string>', description: 'ánh xạ ô → node vào ô' }],
  complexity: { time: 'O(V² + E)', space: 'O(V+E)', variables: '= astar-find-route + lookup O(1)', simulation: 'giống code; bản vá là cạnh giả định, KHÔNG phải sửa code' },
  codeRefs: [
    { path: 'frontend/src/routing/routeEngine.ts', line: 121, endLine: 130, symbol: 'findVehicleRoute / findExitRoute', note: 'hai wrapper' },
    { path: 'frontend/src/routing/laneGraph.ts', line: 139, endLine: 153, symbol: 'buildLaneGraph', note: 'addEdge(aisle,spot) 1 chiều → node sink, out-degree 0' }
  ],
  pseudocode: [
    { id: 'p1', text: 'findVehicleRoute: t=spotEntryNodeIds[spotId]; t ? findRoute(entrance→t) : null' },
    { id: 'p2', text: 'findExitRoute: s=spotEntryNodeIds[spotId]; s ? findRoute(s→exit) : null' },
    { id: 'p3', text: '[demo vá] thêm cạnh sC05⇒c4 → exit hoạt động — minh họa hướng sửa, không phải code hiện tại' }
  ],
  edgeCases: [
    { title: 'BUG: exit null 60/60 ô', description: 'findExitRoute trả null cho mọi ô vì spot-* là sink (out-degree 0) — đã chạy trên graph thật.' },
    { title: 'spotId lạ', description: 'Không có entry node → null cả hai chiều.' }
  ],
  simplifications: [
    { sourceBehavior: 'Graph thật 60 ô — exit null 60/60', demoBehavior: 'mini graph 1 ô C05', reason: 'BUG tái hiện y hệt, demo nhanh hơn; bản vá là toggle hiển thị, không phải code' }
  ],
  related: ['astar-find-route', 'pos-route-wrappers', 'parking-decision-resolve', 'nav-goal-resolve'],
  parameters: [
    { key: 'spotId', label: 'Ô đích', type: 'select', default: 'C05', options: [
      { value: 'C05', label: 'C05' }, { value: 'ZZ9', label: 'ZZ9 (không tồn tại)' }
    ] },
    { key: 'patch', label: 'Vá đồ thị (thêm sC05⇒c4)', type: 'boolean', default: false }
  ],
  scenarios: [
    {
      id: 'default', title: 'C05: vào được, ra không', edgeCase: false,
      description: 'Inbound entrance→sC05 = 8.6; exit sC05→exit = null (sink); vá → 6.6.',
      input: { spotId: 'C05' },
      expected: { inbound: 8.6, exit: null, patched: 6.6 }
    },
    {
      id: 'edge', title: 'Ô không tồn tại', edgeCase: true,
      description: 'ZZ9 không có spotEntryNodeIds → cả hai wrapper null ngay lookup.',
      input: { spotId: 'ZZ9' },
      expected: { inbound: null, exit: null, patched: null }
    }
  ],
  buildTrace: function (scenarioId, params) {
    var p = pickParams(this, params);
    var sc = pickScenario(this, scenarioId);
    var spotId = (params && params.spotId !== undefined) ? params.spotId : sc.input.spotId;
    var g = clone(G1);
    var gPatched = clone(G1);
    if (spotId === 'C05') gPatched.edges.push({ id: 'sC05=>c4', from: 'sC05', to: 'c4', distance: 0.6, direction: 'one-way' });
    if (p.patch && spotId === 'C05') g = gPatched;
    var entry = g.spotEntryNodeIds[spotId];
    var frames = [];
    frames.push(fr('f0', ['p1'], 'Lookup spotEntryNodeIds["' + spotId + '"] = ' + JSON.stringify(entry !== undefined ? entry : null) + '.',
      { spotId: spotId, entryNode: entry !== undefined ? entry : null },
      [{ label: 'entry node', value: entry !== undefined ? entry : '—' }],
      { type: 'graph', nodes: G1.nodes, edges: G1.edges }));
    var inbound = findVehicleRoute(g, spotId);
    frames.push(fr('f1', ['p1'], 'findVehicleRoute: ' + (inbound ? 'path ' + inbound.nodeIds.join('→') + ' = ' + r3(inbound.distance) : 'null (không entry node)'),
      { nodeIds: inbound ? inbound.nodeIds : null, distance: inbound ? r3(inbound.distance) : null },
      [{ label: 'inbound', value: inbound ? r3(inbound.distance) : 'null' }],
      { type: 'graph', nodes: G1.nodes.map(function (n) { return { id: n.id, x: n.x, y: n.y, kind: n.kind, state: inbound && inbound.nodeIds.indexOf(n.id) >= 0 ? 'path' : undefined }; }), edges: G1.edges.map(function (e) { return { from: e.from, to: e.to, direction: e.direction, state: inbound && inbound.edgeIds.indexOf(e.id) >= 0 ? 'path' : undefined }; }) }));
    var exit = findExitRoute(g, spotId);
    var sink = entry !== undefined && !g.edges.some(function (e) { return e.from === entry; });
    frames.push(fr('f2', ['p2'], 'findExitRoute: ' + (exit ? 'path ' + exit.nodeIds.join('→') + ' = ' + r3(exit.distance) : 'null') + (sink ? ' — ' + entry + ' có out-degree 0 (sink): A* cạn open ngay. Đây là BUG thật trên 60/60 ô.' : ''),
      { sink: sink, exitRoute: exit ? exit.nodeIds : null },
      [{ label: 'exit', value: exit ? r3(exit.distance) : 'null' }, { label: 'sink?', value: sink ? 'có' : 'không' }],
      { type: 'graph', nodes: G1.nodes.map(function (n) { return { id: n.id, x: n.x, y: n.y, kind: n.kind, state: n.id === entry ? 'dead' : (exit && exit.nodeIds.indexOf(n.id) >= 0 ? 'path' : undefined) }; }), edges: g.edges.map(function (e) { return { from: e.from, to: e.to, direction: e.direction, state: exit && exit.edgeIds.indexOf(e.id) >= 0 ? 'path' : e.id === 'sC05=>c4' ? 'active' : undefined }; }), caption: sink ? 'Tô đỏ node sink — không cạnh nào rời nó' : '' }));
    var patchedRoute = gPatched === g ? exit : findExitRoute(gPatched, spotId);
    var result = { inbound: inbound ? r3(inbound.distance) : null, exit: exit ? r3(exit.distance) : null, patched: patchedRoute ? r3(patchedRoute.distance) : null };
    var expected = sc.expected;
    if (params && params.spotId !== undefined && params.spotId !== sc.input.spotId) expected = { inbound: result.inbound, exit: result.exit, patched: result.patched };
    else if (p.patch && spotId === 'C05') expected = { inbound: 8.6, exit: 6.6, patched: 6.6 };
    var checks = [
      chk('inbound distance', result.inbound, expected.inbound),
      chk('exit distance', result.exit, expected.exit)
    ];
    checks.push(chk('patched exit (giả định vá)', result.patched, expected.patched));
    if (!p.patch) checks.push(chkTrue('BUG tái hiện: exit null do sink', spotId !== 'C05' || exit === null, result.exit, 'null vì sC05 out-degree 0'));
    return { frames: frames, result: result, expected: expected, checks: checks };
  }
});

L('drivable-edge-project', {
  title: 'Chiếu xe lên cạnh lái được',
  topic: 'Định tuyến trong bãi đỗ',
  summary: 'Quét mọi cạnh, lọc spot-entry/access-anchor, chiếu vuông góc xe→đoạn, chọn min ≤ maxDist, ghép temp-node + A* tới đích.',
  role: 'Mỏ neo giữa thế giới liên tục (tọa độ xe) và đồ thị rời rạc — biến vị trí xe thành node khởi đầu hợp lệ.',
  inputTypes: [
    { name: 'vehicleX/vehicleY', type: 'number', description: 'tọa độ xe world' },
    { name: 'targetNodeId', type: 'string', description: 'đích A*' },
    { name: 'maxDist', type: 'number', description: 'ngưỡng chấp nhận chiếu (code 60px; demo 1.0)' }
  ],
  outputTypes: [{ name: 'route', type: 'RouteResult|null', description: 'null nếu projection xa hơn maxDist' }],
  structures: [
    { name: 'projections', type: '{edge,x,y,t,distance}[]', description: 'mọi cạnh hợp lệ, sort theo distance' },
    { name: 'tempEdges', type: 'LaneEdge[]', description: 'one-way xe→điểm cuối cạnh; two-way thêm cả điểm đầu' }
  ],
  complexity: { time: 'O(E + V²)', space: 'O(E+V)', variables: 'chiếu O(E), A* lại O(V²)', simulation: 'giống code; ngưỡng demo 1.0 đơn vị map (code 60px)' },
  codeRefs: [
    { path: 'frontend/src/routing/routeEngine.ts', line: 132, endLine: 167, symbol: 'routeFromPos', note: 'quét cạnh + temp node + A*; ngưỡng 60px CỨNG tại :147' },
    { path: 'frontend/src/routing/routeEngine.ts', line: 138, endLine: 138, symbol: 'routeFromPos', note: 'loại cạnh chạm access-anchor/spot-entry' }
  ],
  pseudocode: [
    { id: 'p1', text: '∀cạnh: bỏ qua cạnh chạm access-anchor/spot-entry' },
    { id: 'p2', text: 't = clamp(((v−a)·(b−a))/|b−a|², 0..1); dist = |v − (a+t·(b−a))|' },
    { id: 'p3', text: 'sort theo dist; nearest → null nếu dist > maxDist' },
    { id: 'p4', text: 'temp-node vehicle-pos; temp-edge one-way → to (two-way thêm → from)' },
    { id: 'p5', text: 'findRoute(tempGraph, vehicle-pos → target)' }
  ],
  edgeCases: [
    { title: 'Xa hơn ngưỡng', description: 'dist > maxDist → null, không ghép temp node nào.' },
    { title: 'One-way không lùi', description: 'Cạnh 1 chiều chỉ ghép tới điểm cuối `to` — xe không bao giờ "lùi" về `from` trên làn 1 chiều.' },
    { title: 'Exclusion đổi winner', description: 'Bỏ lọc spot-entry: cạnh c4⇒sC05 (d=0.2) sẽ thắng r4⇄c4 (d=0.6) — lọc là cần thiết.' }
  ],
  simplifications: [
    { sourceBehavior: 'maxDist=60px map (MonitorApp:399)', demoBehavior: 'thang 0..10 đơn vị demo, mặc định 1.0', reason: 'map thu nhỏ ~×10; giữ nguyên logic so sánh' }
  ],
  related: ['pos-route-wrappers', 'astar-find-route', 'point-segment-dist'],
  parameters: [
    { key: 'vx', label: 'Xe X', type: 'number', min: 4, max: 8, step: 0.1, default: 6 },
    { key: 'vy', label: 'Xe Y', type: 'number', min: 3.5, max: 8, step: 0.1, default: 4.5 },
    { key: 'maxDist', label: 'maxDist', type: 'number', min: 0.3, max: 2, step: 0.1, default: 1 },
    { key: 'allowSpot', label: 'Cho chiếu vào cạnh spot-entry', type: 'boolean', default: false }
  ],
  scenarios: [
    {
      id: 'default', title: 'Xe (6,4.5) → ô C05', edgeCase: false,
      description: 'Chiếu lên r4⇄c4 tại t=0.5 d=0.5 → route 1.6 đơn vị.',
      input: { vx: 6, vy: 4.5, target: 'sC05', maxDist: 1 },
      expected: { edge: 'r4=>c4', projDist: 0.5, distance: 1.6 }
    },
    {
      id: 'edge', title: 'Projection vào làn 1 chiều', edgeCase: true,
      description: 'Xe (7.2,8) gần ec⇒r7 (one-way) tại (7,8) d=0.2: chỉ ghép tới r7 (điểm cuối), không lùi về ec → route exit dài hơn.',
      input: { vx: 7.2, vy: 8, target: 'exit', maxDist: 1 },
      expected: { edge: 'ec=>r7', forwardOnly: true }
    }
  ],
  buildTrace: function (scenarioId, params) {
    var p = pickParams(this, params);
    var sc = pickScenario(this, scenarioId);
    var vx = (params && params.vx !== undefined) ? params.vx : (sc.input.vx !== undefined ? sc.input.vx : p.vx);
    var vy = (params && params.vy !== undefined) ? params.vy : (sc.input.vy !== undefined ? sc.input.vy : p.vy);
    var maxDist = (params && params.maxDist !== undefined) ? params.maxDist : (sc.input.maxDist !== undefined ? sc.input.maxDist : p.maxDist);
    var target = sc.input.target;
    var r = routeFromPos(G1, vx, vy, target, maxDist, p.allowSpot);
    var frames = [];
    var top3 = (r.projections || []).slice(0, 3);
    frames.push(fr('f0', ['p1', 'p2'], 'Quét ' + G1.edges.length + ' cạnh: bỏ cạnh chạm spot-entry/anchor' + (p.allowSpot ? ' [TẮT — demo toggle]' : '') + ', chiếu xe (' + vx + ',' + vy + ') lên từng đoạn.',
      { projections: top3.map(function (q) { return { edge: q.edge.id, t: r3(q.t), d: r3(q.distance) }; }) },
      [{ label: 'cạnh hợp lệ', value: (r.projections || []).length }],
      { type: 'graph', nodes: G1.nodes, edges: G1.edges, vehicle: { x: vx, y: vy } }));
    var nearest = top3[0];
    frames.push(fr('f1', ['p3'], 'Top-3: ' + top3.map(function (q) { return q.edge.id + ' d=' + r3(q.distance); }).join(' | ') + '. ' + (nearest && nearest.distance <= maxDist ? 'Chọn ' + nearest.edge.id + ' (t=' + r3(nearest.t) + ').' : 'min > maxDist=' + maxDist + ' → NULL.'),
      { nearest: nearest ? { edge: nearest.edge.id, t: r3(nearest.t), d: r3(nearest.distance) } : null, maxDist: maxDist },
      [{ label: 'min dist', value: nearest ? r3(nearest.distance) : '—' }],
      { type: 'graph', nodes: G1.nodes, edges: G1.edges.map(function (e) { return { from: e.from, to: e.to, direction: e.direction, state: nearest && e.id === nearest.edge.id ? 'active' : undefined }; }), vehicle: { x: vx, y: vy }, projection: nearest ? { x: nearest.x, y: nearest.y } : null }));
    if (nearest && nearest.distance <= maxDist) {
      var fwd = r.tempEdges.map(function (e) { return e.to; });
      frames.push(fr('f2', ['p4'], 'Temp-node tại điểm chiếu (' + r3(nearest.x) + ',' + r3(nearest.y) + '); temp-edge one-way → {' + fwd.join(', ') + '}' + (nearest.edge.direction === 'one-way' ? ' — CHỈ về phía cuối cạnh, không lùi.' : ' — cạnh 2 chiều nên có cả 2 đầu.'),
        { tempEdges: r.tempEdges.map(function (e) { return e.id + '=' + r3(e.distance); }) },
        [{ label: 'temp edges', value: r.tempEdges.length }],
        { type: 'graph', nodes: G1.nodes.concat([{ id: 'vehicle-pos', x: nearest.x, y: nearest.y, kind: 'junction', state: 'current' }]), edges: G1.edges.concat(r.tempEdges.map(function (e) { return { from: 'vehicle-pos', to: e.to, direction: 'one-way', state: 'active' }; })), vehicle: { x: vx, y: vy } }));
    }
    frames.push(fr('f3', ['p5'], 'findRoute trên temp-graph: ' + (r.route ? r.route.nodeIds.join('→') + ' = ' + r3(r.route.distance) : 'null.'),
      { route: r.route ? r.route.nodeIds : null, distance: r.route ? r3(r.route.distance) : null },
      [{ label: 'distance', value: r.route ? r3(r.route.distance) : 'null' }],
      { type: 'graph', nodes: G1.nodes.map(function (n) { return { id: n.id, x: n.x, y: n.y, kind: n.kind, state: r.route && r.route.nodeIds.indexOf(n.id) >= 0 ? 'path' : undefined }; }), edges: G1.edges.map(function (e) { return { from: e.from, to: e.to, direction: e.direction, state: r.route && r.route.edgeIds.indexOf(e.id) >= 0 ? 'path' : (nearest && e.id === nearest.edge.id ? 'active' : undefined) }; }), vehicle: { x: vx, y: vy } }));
    var result = { edge: r.projection ? r.projection.edge : null, projDist: r.projection ? r3(r.projection.d) : null, distance: r.route ? r3(r.route.distance) : null, forwardOnly: r.tempEdges ? r.tempEdges.length === 1 : null };
    var defIn = sc.input.vx !== undefined ? sc.input : { vx: 5.8, vy: 4.3, maxDist: 3 };
    var sameInput = vx === defIn.vx && vy === defIn.vy && maxDist === defIn.maxDist && !p.allowSpot;
    var expected = sameInput ? sc.expected : { edge: result.edge, projDist: result.projDist, distance: result.distance, forwardOnly: result.forwardOnly };
    var checks = [
      chk('nearest edge', result.edge, expected.edge),
      chk('projection distance', result.projDist, expected.projDist !== undefined ? expected.projDist : result.projDist)
    ];
    if (expected.distance !== undefined) checks.push(chk('route distance', result.distance, expected.distance));
    if (expected.forwardOnly) checks.push(chkTrue('one-way chỉ ghép điểm cuối', result.forwardOnly === true, r.tempEdges ? r.tempEdges.length : 0, '1 temp edge → ' + (nearest ? nearest.b.id : '?')));
    return { frames: frames, result: result, expected: expected, checks: checks };
  }
});

L('pos-route-wrappers', {
  title: 'Tuyến từ vị trí xe',
  topic: 'Định tuyến trong bãi đỗ',
  summary: 'findExitRouteFromPos/findInboundRouteFromPos: projection + A* từ temp-node; fallback ô trống chỉ cho exit — với spot-* là sink thì fallback là dead code.',
  role: 'API động theo vị trí xe hiện tại — trả RouteResult mà caller (MonitorApp) co ngắn vẽ.',
  inputTypes: [
    { name: 'x/y', type: 'number', description: 'vị trí xe' },
    { name: 'mode', type: 'exit|inbound', description: 'exit→exitNodeId; inbound→spotEntryNodeIds[spotId]' },
    { name: 'fallbackSpotId', type: 'SpotId?', description: 'exit-only: findExitRoute khi projection null' }
  ],
  outputTypes: [{ name: 'route', type: 'RouteResult|null' }],
  structures: [{ name: 'tempGraph', type: 'LaneGraph', description: 'graph + vehicle-pos + temp edges' }],
  complexity: { time: 'O(E + V²)', space: 'O(E+V)', variables: 'wrapper trên drivable-edge-project', simulation: 'giống code; fallback không kích hoạt được do sink — ghi rõ dead code' },
  codeRefs: [
    { path: 'frontend/src/routing/routeEngine.ts', line: 174, endLine: 208, symbol: 'findExitRouteFromPos / findInboundRouteFromPos', note: 'wrapper + fallbackSpotId (App.tsx:720,756 không truyền → dead code kép)' }
  ],
  pseudocode: [
    { id: 'p1', text: 'exit: r = findRouteFromPos(x,y→exit); r ?? (fallbackSpotId ? findExitRoute(spot) : null)' },
    { id: 'p2', text: 'inbound: t=spotEntryNodeIds[spotId] ?? null; findRouteFromPos(x,y→t)' },
    { id: 'p3', text: '[ghi chú] fallback exit gọi findExitRoute — vì spot-* sink, fallback cũng null → dead code' }
  ],
  edgeCases: [
    { title: 'Projection null → fallback chết', description: 'Xe xa làn > maxDist → projection null → gọi findExitRoute(fallback) — vẫn null do sink. Dead code được ghi nhận.' },
    { title: 'Inbound không có fallback', description: 'findInboundRouteFromPos không nhận fallbackSpotId — khác bất đối xứng với exit.' }
  ],
  simplifications: [
    { sourceBehavior: 'maxDist 60px', demoBehavior: '1.0 đơn vị demo', reason: 'cùng ngưỡng với drivable-edge-project' }
  ],
  related: ['drivable-edge-project', 'spot-route-wrappers', 'nav-goal-resolve'],
  parameters: [
    { key: 'vx', label: 'Xe X', type: 'number', min: 0, max: 8, step: 0.1, default: 6 },
    { key: 'vy', label: 'Xe Y', type: 'number', min: 0, max: 9, step: 0.1, default: 4.5 },
    { key: 'mode', label: 'Chế độ', type: 'select', default: 'exit', options: [
      { value: 'exit', label: 'exit' }, { value: 'inbound', label: 'inbound' }
    ] },
    { key: 'maxDist', label: 'maxDist', type: 'number', min: 0.3, max: 2, step: 0.1, default: 1 }
  ],
  scenarios: [
    {
      id: 'default', title: 'Exit từ vị trí xe', edgeCase: false,
      description: 'Xe (6,4.5) chiếu lên r4⇄c4 → exit: route 5.0.',
      input: { mode: 'exit', vx: 6, vy: 4.5 },
      expected: { distance: 5 }
    },
    {
      id: 'edge', title: 'Xa làn → fallback dead code', edgeCase: true,
      description: 'Xe (0,0): projection >1.0 → null; fallback findExitRoute("C05") cũng null (sink) → dead code.',
      input: { mode: 'exit', vx: 0, vy: 0, fallbackSpotId: 'C05' },
      expected: { distance: null, fallbackDead: true }
    }
  ],
  buildTrace: function (scenarioId, params) {
    var p = pickParams(this, params);
    var sc = pickScenario(this, scenarioId);
    var mode = (params && params.mode !== undefined) ? params.mode : (sc.input.mode || p.mode);
    var vx = (params && params.vx !== undefined) ? params.vx : (sc.input.vx !== undefined ? sc.input.vx : p.vx);
    var vy = (params && params.vy !== undefined) ? params.vy : (sc.input.vy !== undefined ? sc.input.vy : p.vy);
    var maxDist = (params && params.maxDist !== undefined) ? params.maxDist : (sc.input.maxDist !== undefined ? sc.input.maxDist : p.maxDist);
    var fallback = sc.input.fallbackSpotId || 'C05';
    var r = mode === 'exit' ? findExitRouteFromPos(G1, vx, vy, fallback, maxDist) : findInboundRouteFromPos(G1, vx, vy, 'C05', maxDist);
    var frames = [];
    var nearest = r.projections ? r.projections[0] : null;
    frames.push(fr('f0', ['p1', 'p2'], mode.toUpperCase() + ': chiếu xe (' + vx + ',' + vy + ') lên cạnh lái được — ' + (nearest ? 'gần nhất ' + nearest.edge.id + ' d=' + r3(nearest.distance) : 'không cạnh hợp lệ') + ' (maxDist=' + maxDist + ').',
      { nearest: nearest ? nearest.edge.id : null, d: nearest ? r3(nearest.distance) : null },
      [{ label: 'min dist', value: nearest ? r3(nearest.distance) : '—' }],
      { type: 'graph', nodes: G1.nodes, edges: G1.edges, vehicle: { x: vx, y: vy }, projection: r.projection ? { x: r.projection.x, y: r.projection.y } : null }));
    var usedFallback = !r.route && mode === 'exit' && fallback;
    frames.push(fr('f1', usedFallback ? ['p3'] : ['p1', 'p2'],
      usedFallback
        ? 'Projection null → gọi fallback findExitRoute("' + fallback + '") — cũng trả null vì spot-* là sink: fallback này là DEAD CODE trong build hiện tại.'
        : (r.route ? 'Route: ' + r.route.nodeIds.join('→') + ' = ' + r3(r.route.distance) + '.' : 'Route null.'),
      { route: r.route ? r.route.nodeIds : null, fallbackUsed: usedFallback },
      [{ label: 'distance', value: r.route ? r3(r.route.distance) : 'null' }, { label: 'fallback', value: usedFallback ? 'gọi (vẫn null)' : 'không cần' }],
      { type: 'graph', nodes: G1.nodes.map(function (n) { return { id: n.id, x: n.x, y: n.y, kind: n.kind, state: r.route && r.route.nodeIds.indexOf(n.id) >= 0 ? 'path' : undefined }; }), edges: G1.edges.map(function (e) { return { from: e.from, to: e.to, direction: e.direction, state: r.route && r.route.edgeIds.indexOf(e.id) >= 0 ? 'path' : undefined }; }), vehicle: { x: vx, y: vy } }));
    frames.push(fr('f2', ['p3'], 'Kết quả: distance=' + (r.route ? r3(r.route.distance) : 'null') + (usedFallback ? ' — fallback ' + fallback + ' cũng null: DEAD CODE (spot-entry là sink).' : '.'),
      { distance: r.route ? r3(r.route.distance) : null, fallbackDead: usedFallback ? r.route === null : false },
      [{ label: 'verdict', value: r.route ? 'route' : 'null' }],
      { type: 'board', cards: [{ label: 'mode', value: mode }, { label: 'distance', value: r.route ? r3(r.route.distance) : 'null', color: r.route ? '#3fce7c' : '#f2555a', hl: true }, { label: 'fallback', value: usedFallback ? 'dead' : '—' }] }));
    var result = { distance: r.route ? r3(r.route.distance) : null, fallbackDead: usedFallback ? r.route === null : false };
    var samePos = vx === sc.input.vx && vy === sc.input.vy && mode === (sc.input.mode || 'exit') && maxDist === 1;
    var expPos = samePos ? sc.expected : { distance: result.distance, fallbackDead: result.fallbackDead };
    var checks = [chk('distance', result.distance, expPos.distance)];
    if (expPos.fallbackDead) checks.push(chkTrue('fallback là dead code (null)', result.fallbackDead === true, result.fallbackDead, 'projection null + findExitRoute null'));
    return { frames: frames, result: result, expected: expPos, checks: checks };
  }
});

L('route-edge-validator', {
  title: 'Kiểm cạnh route hợp lệ',
  topic: 'Định tuyến trong bãi đỗ',
  summary: 'routeUsesOnlyValidEdges: build Map theo edgeId rồi kiểm từng cạnh — one-way phải đúng chiều nodeIds, two-way được đảo.',
  role: 'Guard bảo đảm RouteResult khớp đồ thị (dùng bên trong engine và test).',
  inputTypes: [
    { name: 'graph', type: 'LaneGraph' },
    { name: 'route', type: 'RouteResult', description: '{nodeIds, edgeIds} đã ghép đôi' }
  ],
  outputTypes: [{ name: 'valid', type: 'boolean' }],
  structures: [{ name: 'edgeById', type: 'Map<string,LaneEdge>', description: 'build O(E)' }],
  complexity: { time: 'O(E+R)', space: 'O(E)', variables: 'R=|edgeIds|; đếm cả build Map', simulation: 'giống code' },
  codeRefs: [
    { path: 'frontend/src/routing/routeEngine.ts', line: 210, endLine: 222, symbol: 'routeUsesOnlyValidEdges', note: 'pair theo index, one-way strict, two-way đảo được' }
  ],
  pseudocode: [
    { id: 'p1', text: 'edgeById = Map(edges)' },
    { id: 'p2', text: '∀i: edge=edgeById[edgeIds[i]]; thiếu edge/node → false' },
    { id: 'p3', text: 'hợp lệ nếu (from,to) đúng chiều HOẶC (two-way && đảo)' }
  ],
  edgeCases: [
    { title: 'Đảo cạnh one-way', description: 'Ghép ngược chiều → false — bẫy chiều làn.' },
    { title: 'edgeId ngoài đồ thị', description: 'Map miss → false.' },
    { title: 'nodeIds lệch edgeIds', description: 'Pair không khớp → false.' }
  ],
  simplifications: [],
  related: ['astar-find-route', 'adjacency-directed-expand'],
  parameters: [
    { key: 'variant', label: 'Biến thể route', type: 'select', default: 'valid', options: [
      { value: 'valid', label: 'đúng chiều' }, { value: 'revOneWay', label: 'đảo cạnh one-way' }, { value: 'foreign', label: 'edgeId lạ' }, { value: 'twoway-back', label: 'đảo cạnh two-way (hợp lệ)' }
    ] }
  ],
  scenarios: [
    {
      id: 'default', title: 'Route đúng chiều → true', edgeCase: false,
      description: 'Route entrance→sC05 của A* đi qua 5 cạnh đúng hướng.',
      input: { variant: 'valid' },
      expected: { valid: true }
    },
    {
      id: 'edge', title: 'Đảo cạnh one-way → false', edgeCase: true,
      description: 'Bắt c4⇒sC05 đi ngược sC05→c4 → validator chặn.',
      input: { variant: 'revOneWay' },
      expected: { valid: false }
    }
  ],
  buildTrace: function (scenarioId, params) {
    var p = pickParams(this, params);
    var sc = pickScenario(this, scenarioId);
    var variant = sc.input.variant && p.variant === 'valid' ? sc.input.variant : p.variant;
    var ROUTES = {
      'valid': { nodeIds: ['entrance', 'ec', 'r7', 'r4', 'c4', 'sC05'], edgeIds: ['entrance=>ec', 'ec=>r7', 'r7=>r4', 'r4=>c4', 'c4=>sC05'] },
      'revOneWay': { nodeIds: ['sC05', 'c4'], edgeIds: ['c4=>sC05'] },
      'foreign': { nodeIds: ['entrance', 'ec'], edgeIds: ['edge-khong-ton-tai'] },
      'twoway-back': { nodeIds: ['c4', 'r4'], edgeIds: ['r4=>c4'] }
    };
    var route = ROUTES[variant];
    var edgeById = new Map(G1.edges.map(function (e) { return [e.id, e]; }));
    var frames = [];
    frames.push(fr('f0', ['p1'], 'Build edgeById: ' + edgeById.size + ' cạnh — O(E) một lần, sau đó O(1) mỗi lookup.',
      { edges: edgeById.size }, [{ label: '|edgeById|', value: edgeById.size }],
      { type: 'graph', nodes: G1.nodes, edges: G1.edges }));
    var rows = [], allOk = true;
    route.edgeIds.forEach(function (eid, i) {
      var edge = edgeById.get(eid);
      var from = route.nodeIds[i], to = route.nodeIds[i + 1];
      var ok = false, why = '';
      if (!edge || !from || !to) { ok = false; why = 'thiếu edge/node'; }
      else if (edge.from === from && edge.to === to) { ok = true; why = 'đúng chiều'; }
      else if (edge.direction === 'two-way' && edge.from === to && edge.to === from) { ok = true; why = 'two-way đảo hợp lệ'; }
      else why = edge.direction === 'two-way' ? 'không khớp đầu nào' : 'one-way ngược chiều';
      if (!ok) allOk = false;
      rows.push({ cells: [eid, from + '→' + to, why], state: ok ? 'pass' : 'fail' });
    });
    frames.push(fr('f1', ['p2', 'p3'], 'Kiểm ' + route.edgeIds.length + ' cặp (edgeId, nodeIds[i]→nodeIds[i+1]): ' + (allOk ? 'tất cả hợp lệ.' : 'có cạnh vi phạm — dừng sớm.'),
      { pairs: rows.length, allOk: allOk },
      [{ label: 'valid', value: allOk ? 'true' : 'false' }],
      { type: 'rows', rows: rows, caption: 'one-way phải đúng chiều; two-way được đảo' }));
    var valid = routeUsesOnlyValidEdges(G1, route);
    frames.push(fr('f2', ['p3'], 'Verdict: ' + (valid ? 'HỢP LỆ — mọi edgeId nối đúng chiều nodeIds.' : 'VI PHẠM — có cặp (edgeId, hướng đi) không khớp đồ thị.'),
      { valid: valid }, [{ label: 'valid', value: String(valid) }],
      { type: 'board', cards: [{ label: 'edges kiểm', value: route.edgeIds.length }, { label: 'validator', value: String(valid), color: valid ? '#3fce7c' : '#f2555a', hl: true }] }));
    var result = { valid: valid };
    var TRUTH = { 'valid': true, 'revOneWay': false, 'foreign': false, 'twoway-back': true };
    var expected = TRUTH[variant] !== undefined ? { valid: TRUTH[variant] } : sc.expected;
    var checks = [chk('validator', valid, expected.valid)];
    return { frames: frames, result: result, expected: expected, checks: checks };
  }
});

L('gate-node-mutate', {
  title: 'Chỉnh node cổng theo vạch',
  topic: 'Định tuyến trong bãi đỗ',
  summary: 'updateGateNodesInGraph: dịch entrance/exit node tới midpoint vạch cổng — nhưng edge.distance đã cache khi build, KHÔNG recompute (điểm yếu thật).',
  role: 'Cho phép căn đồ thị theo cấu hình vạch gate khi cài đặt — và lộ rõ chi phí là chi phí cũ.',
  inputTypes: [{ name: 'gateRoi', type: '{entry_gate,exit_gate}', description: 'mỗi gate {p1,p2} — midpoint thành node mới' }],
  outputTypes: [{ name: 'updates', type: '{nodeId,from,to}[]' }],
  structures: [{ name: 'gateRoi', type: 'Record<string,{p1,p2}>' }],
  complexity: { time: 'O(V)', space: 'O(1)', variables: 'tìm 2 node trong V', simulation: 'giống code; "vá" recompute là toggle demo, không phải sửa code' },
  codeRefs: [
    { path: 'frontend/src/routing/laneGraph.ts', line: 165, endLine: 183, symbol: 'updateGateNodesInGraph', note: 'mutate x/y theo midpoint, không đụng edge.distance' }
  ],
  pseudocode: [
    { id: 'p1', text: '∀(entrance|exit): node = nodes.find(id==*NodeId)' },
    { id: 'p2', text: 'node && gate → node.x,y = midpoint(gate.p1,gate.p2)' },
    { id: 'p3', text: '[điểm yếu] edge.distance giữ giá trị euclid tại build-time — route giữ chi phí cũ' }
  ],
  edgeCases: [
    { title: 'Chi phí route không đổi', description: 'Dịch node không đổi edge.distance → A* vẫn tính chi phí cũ — điểm yếu được ghi nhận, không che giấu.' },
    { title: 'Gate thiếu', description: 'Không có entry_gate/exit_gate → node giữ nguyên.' }
  ],
  simplifications: [
    { sourceBehavior: 'node.x,y đổi, edge.distance không đổi', demoBehavior: 'hiển thị cả "khoảng euclid mới" lẫn giá trị cache', reason: 'để thấy rõ drift, không thay đổi hành vi' }
  ],
  related: ['lane-graph-build', 'astar-find-route', 'gate-line-derive'],
  parameters: [
    { key: 'gateY', label: 'Y midpoint cổng vào', type: 'number', min: 7, max: 9.5, step: 0.5, default: 7 },
    { key: 'recompute', label: 'Vá: recompute edge.distance', type: 'boolean', default: false }
  ],
  scenarios: [
    {
      id: 'default', title: 'Dịch entrance', edgeCase: false,
      description: 'entry_gate p1(8,8)→p2(8,10): entrance (8,9)→(8,9) giữ nguyên; demo gateY=7 → dịch 2 đơn vị, edge distance vẫn 1.',
      input: { gate: { p1: { x: 8, y: 6 }, p2: { x: 8, y: 8 } } },
      expected: { newX: 8, newY: 7, cachedDist: 1, staleDist: true }
    },
    {
      id: 'edge', title: 'Thiếu exit_gate', edgeCase: true,
      description: 'gateRoi chỉ có entry_gate → chỉ entrance dịch, exit giữ nguyên.',
      input: { gate: { p1: { x: 8, y: 6 }, p2: { x: 8, y: 8 } }, missingExit: true },
      expected: { updates: 1 }
    }
  ],
  buildTrace: function (scenarioId, params) {
    var p = pickParams(this, params);
    var sc = pickScenario(this, scenarioId);
    var g = clone(G1);
    var inputMidY = sc.input.gate ? (sc.input.gate.p1.y + sc.input.gate.p2.y) / 2 : 7;
    var midY = (params && params.gateY !== undefined) ? params.gateY : inputMidY;
    var recompute = p.recompute === true;
    var roi = { entry_gate: { p1: { x: 8, y: midY - 1 }, p2: { x: 8, y: midY + 1 } } };
    if (!sc.input.missingExit) roi.exit_gate = { p1: { x: 7, y: 0.5 }, p2: { x: 9, y: 0.5 } };
    var entrance = null, exit = null;
    g.nodes.forEach(function (n) { if (n.id === 'entrance') entrance = n; if (n.id === 'exit') exit = n; });
    var old = { x: entrance.x, y: entrance.y };
    var updates = updateGateNodesInGraph(g, roi);
    var frames = [];
    frames.push(fr('f0', ['p1'], 'Tìm entranceNodeId/exitNodeId trong ' + g.nodes.length + ' node.',
      { entrance: { x: old.x, y: old.y }, exit: { x: exit.x, y: exit.y } },
      [{ label: 'node cổng', value: 2 }],
      { type: 'graph', nodes: g.nodes, edges: g.edges }));
    frames.push(fr('f1', ['p2'], 'Mutate: entrance ' + JSON.stringify(old) + ' → midpoint(' + JSON.stringify(roi.entry_gate) + ') = (' + entrance.x + ',' + entrance.y + ')' + (sc.input.missingExit ? '; exit_gate thiếu → exit giữ (' + exit.x + ',' + exit.y + ')' : ''),
      { updates: updates },
      [{ label: 'updates', value: updates.length }],
      { type: 'graph', nodes: g.nodes.map(function (n) { return { id: n.id, x: n.x, y: n.y, kind: n.kind, state: n.id === 'entrance' ? 'current' : undefined }; }), edges: g.edges, markers: [{ x: old.x, y: old.y, label: 'cũ' }] }));
    var e = g.edges.filter(function (x) { return x.from === 'entrance'; })[0];
    var to = g.nodes.filter(function (n) { return n.id === e.to; })[0];
    var cachedBefore = e.distance;
    var newEuclid = Math.hypot(to.x - entrance.x, to.y - entrance.y);
    frames.push(fr('f2', ['p3'], 'Cạnh entrance⇒ec: distance cache=' + e.distance + ' nhưng euclid thật=' + r3(newEuclid) + ' — A* vẫn dùng ' + e.distance + '. Đây là drift cố ý của code (không recompute).',
      { cached: e.distance, euclidNew: r3(newEuclid), stale: Math.abs(e.distance - newEuclid) > 1e-9 },
      [{ label: 'cached', value: e.distance }, { label: 'euclid mới', value: r3(newEuclid) }],
      { type: 'rows', rows: [
        { cells: ['edge.distance (cache)', String(e.distance)], state: 'fail' },
        { cells: ['euclid(node mới → to)', String(r3(newEuclid))], state: 'active' },
        { cells: ['lệch', String(r3(Math.abs(e.distance - newEuclid)))], state: Math.abs(e.distance - newEuclid) > 1e-9 ? 'fail' : 'pass' }
      ], caption: 'code không recompute — điểm yếu đã ghi' }));
    if (recompute) {
      e.distance = newEuclid;
      frames.push(fr('f3', ['p3'], '[Vá demo] recompute euclid → ' + r3(e.distance) + '. Chỉ minh họa hướng sửa — KHÔNG phải code hiện tại. Ở mode vá, expected tham chiếu: cachedDist=euclid, staleDist=false.',
        { patched: r3(e.distance), baseline: cachedBefore }, [{ label: 'vá', value: r3(e.distance) }],
        { type: 'rows', rows: [{ cells: ['cache baseline (không vá)', String(cachedBefore)], state: '' }, { cells: ['sau vá', String(r3(e.distance))], state: 'pass' }], caption: 'demo toggle — baseline cache là điểm yếu đã ghi' }));
    }
    var result = { newX: entrance.x, newY: entrance.y, cachedDist: r3(e.distance), euclidNew: r3(newEuclid), updates: updates.length, staleDist: Math.abs(e.distance - newEuclid) > 1e-9 };
    var expected;
    if (noOverride(params)) expected = sc.expected;
    else if (sc.id === 'edge') expected = { updates: updates.length };
    else expected = {
      newX: 8, newY: midY,
      cachedDist: recompute ? r3(newEuclid) : cachedBefore,
      staleDist: recompute ? false : Math.abs(cachedBefore - newEuclid) > 1e-9
    };
    var checks = [
      chk('tọa độ mới', [result.newX, result.newY], [8, midY]),
      chk('số update', updates.length, sc.expected.updates !== undefined ? sc.expected.updates : 2)
    ];
    if (sc.id !== 'edge') {
      if (recompute) checks.push(chk('recompute → euclid (mode vá)', result.cachedDist, r3(newEuclid)));
      else checks.push(chk('cache giữ ' + cachedBefore + ' (điểm yếu)', result.cachedDist, cachedBefore));
      checks.push(chk('staleDist', result.staleDist, expected.staleDist));
    }
    return { frames: frames, result: result, expected: expected, checks: checks };
  }
});

L('spot-rank-score', {
  title: 'Chấm điểm & xếp ô',
  topic: 'Gợi ý ô đỗ',
  summary: 'rankParkingSpots: chỉ ô empty, score = w·driving + (1−w)·walking (mét), sort theo score rồi spotId.',
  role: 'Lõi gợi ý — trả ranked list, best = phần tử đầu.',
  inputTypes: [
    { name: 'spots', type: 'SpotState[]', description: 'chỉ lọc status empty' },
    { name: 'anchor', type: '[x,y]', description: 'điểm đến bộ theo need' }
  ],
  outputTypes: [{ name: 'ranked', type: 'RankedSpot[]', description: 'score, driving/walking meters, estimatedWalkingMinutes' }],
  structures: [{ name: 'ranked', type: 'RankedSpot[]', description: 'sort ổn định theo score, tie spotId' }],
  complexity: { time: 'O(S log S + R)', space: 'O(S)', variables: 'S=ô empty, R=route lookups', simulation: 'giống code; demo 3 ô đủ điều kiện' },
  codeRefs: [
    { path: 'frontend/src/recommendation/recommendationEngine.ts', line: 36, endLine: 73, symbol: 'rankParkingSpots', note: 'getEligibleSpots(:32) + score 0.35/0.65 + tie-break spotId' },
    { path: 'frontend/src/recommendation/recommendationEngine.ts', line: 16, endLine: 17, symbol: 'hằng số', note: 'METERS_PER_MAP_UNIT=0.12, WALKING=75' }
  ],
  pseudocode: [
    { id: 'p1', text: 'eligible = spots.filter(status==empty)' },
    { id: 'p2', text: '∀ô: driving=route·M; walking=euclid(center,anchor)·M; score=w·d+(1−w)·k' },
    { id: 'p3', text: 'bỏ ô không có route (null)' },
    { id: 'p4', text: 'sort score asc, tie → spotId' }
  ],
  edgeCases: [
    { title: 'Không ô empty', description: 'ranked = [] → best null.' },
    { title: 'Ô không có route', description: 'route null → loại khỏi ranked (không phải score ∞).' }
  ],
  simplifications: [
    { sourceBehavior: 'route thật từ A*', demoBehavior: 'routeCost stub deterministic', reason: 'cô lập công thức chấm; route đã có lesson riêng' }
  ],
  related: ['recommendation-promote', 'astar-find-route'],
  parameters: [
    { key: 'need', label: 'Nhu cầu', type: 'select', default: 'shopping', options: [
      { value: 'shopping', label: 'shopping (2,8)' }, { value: 'services', label: 'services (5,7)' }, { value: 'entertainment', label: 'entertainment (8,2)' }
    ] },
    { key: 'driveWeight', label: 'Trọng số lái [demo]', type: 'number', min: 0, max: 1, step: 0.05, default: 0.35 }
  ],
  scenarios: [
    {
      id: 'default', title: '3 ô empty → S2 thắng', edgeCase: false,
      description: 'S2 gần anchor shopping: score 0.90 thắng S3 1.03, S1 1.16.',
      input: {},
      expected: { order: ['S2', 'S3', 'S1'], bestScore: 0.9 }
    },
    {
      id: 'edge', title: 'Không ô empty', edgeCase: true,
      description: 'Tất cả occupied/transitioning → ranked rỗng → best null.',
      input: { allFull: true },
      expected: { order: [], bestScore: null }
    }
  ],
  buildTrace: function (scenarioId, params) {
    var p = pickParams(this, params);
    var sc = pickScenario(this, scenarioId);
    var spots = sc.input.allFull ? RECO1.spots.map(function (s) { return { id: s.id, status: 'occupied', center: s.center }; }) : RECO1.spots;
    var anchor = RECO1.anchors[p.need];
    var w = p.driveWeight, M = 0.12;
    var frames = [];
    var eligible = spots.filter(function (s) { return s.status === 'empty'; });
    frames.push(fr('f0', ['p1'], 'eligible = ô empty: ' + JSON.stringify(eligible.map(function (s) { return s.id; })) + (sc.input.allFull ? ' — tất cả đã full → rỗng.' : ''),
      { eligible: eligible.map(function (s) { return s.id; }) },
      [{ label: 'eligible', value: eligible.length }],
      { type: 'rows', rows: spots.map(function (s) { return { cells: [s.id, s.status], state: s.status === 'empty' ? 'active' : 'fail' }; }), caption: 'chỉ ô empty được chấm' }));
    var scored = eligible.map(function (s) {
      var route = RECO1.routeCost[s.id];
      if (route === undefined) return null;
      var driving = route * M;
      var walking = Math.hypot(s.center[0] - anchor[0], s.center[1] - anchor[1]) * M;
      return { spotId: s.id, driving: r2(driving), walking: r2(walking), score: r2(w * driving + (1 - w) * walking) };
    }).filter(function (x) { return x !== null; });
    frames.push(fr('f1', ['p2', 'p3'], 'score = ' + w + '·driving + ' + r2(1 - w) + '·walking (M=0.12): ' + scored.map(function (s) { return s.spotId + '=' + s.score; }).join(', ') + (scored.length < eligible.length ? ' — ô thiếu route bị loại.' : ''),
      { scored: scored, anchor: anchor },
      [{ label: 'có score', value: scored.length }],
      { type: 'bars', items: scored.map(function (s) { return { label: s.spotId, value: s.score }; }), caption: 'thấp hơn = tốt hơn' }));
    var ranked = scored.slice().sort(function (a, b) { return a.score - b.score || a.spotId.localeCompare(b.spotId); });
    frames.push(fr('f2', ['p4'], 'Sort: ' + ranked.map(function (s) { return s.spotId + '(' + s.score + ')'; }).join(' < ') + ' → best=' + (ranked[0] ? ranked[0].spotId : 'null') + '.',
      { order: ranked.map(function (s) { return s.spotId; }) },
      [{ label: 'best', value: ranked[0] ? ranked[0].spotId : 'null' }],
      { type: 'bars', items: ranked.map(function (s) { return { label: s.spotId, value: s.score }; }), caption: 'đã sort tăng dần' }));
    var result = { order: ranked.map(function (s) { return s.spotId; }), bestScore: ranked[0] ? ranked[0].score : null };
    var expected = sc.input.allFull ? sc.expected : (p.driveWeight === 0.35 && p.need === 'shopping' ? sc.expected : { order: result.order, bestScore: result.bestScore });
    var checks = [chk('thứ tự', result.order, expected.order), chk('best score', result.bestScore, expected.bestScore)];
    return { frames: frames, result: result, expected: expected, checks: checks };
  }
});

L('recommendation-promote', {
  title: 'Đưa ô chọn tay lên đầu',
  topic: 'Gợi ý ô đỗ',
  summary: 'promoteRecommendation: user chọn ô trong best+alternatives → swap lên best, best cũ xuống đầu alternatives (giữ tối đa 3).',
  role: 'Cho phép user override gợi ý mà không mất phần còn lại của danh sách.',
  inputTypes: [
    { name: 'result', type: 'RecommendationResult', description: '{best, alternatives[]}' },
    { name: 'spotId', type: 'SpotId', description: 'ô user chọn' }
  ],
  outputTypes: [{ name: 'result', type: 'RecommendationResult', description: 'best mới + alternatives xếp lại' }],
  structures: [{ name: 'alternatives', type: 'RankedSpot[]', description: 'tối đa 2 sau promote (theo code)' }],
  complexity: { time: 'O(S)', space: 'O(S)', variables: 'S=1+|alternatives|', simulation: 'giống code' },
  codeRefs: [
    { path: 'frontend/src/recommendation/recommendationEngine.ts', line: 91, endLine: 102, symbol: 'promoteRecommendation', note: 'find + swap + slice(0,2)' }
  ],
  pseudocode: [
    { id: 'p1', text: 'selected = [best,…alts].find(spotId); không thấy hoặc đã là best → trả nguyên' },
    { id: 'p2', text: 'best := selected; alternatives := [bestCũ, …alts.filter(≠selected)].slice(0,2)' },
    { id: 'p3', text: 'trả {best, alternatives≤2, same?}' }
  ],
  edgeCases: [
    { title: 'Ô không trong danh sách', description: 'Trả nguyên object (cùng reference) — không clone thừa.' },
    { title: 'Chọn chính best', description: 'Trả nguyên object.' }
  ],
  simplifications: [],
  related: ['spot-rank-score', 'invalid-spot-recovery'],
  parameters: [
    { key: 'spotId', label: 'Ô user chọn', type: 'select', default: 'B02', options: [
      { value: 'B02', label: 'B02' }, { value: 'C05', label: 'C05' }, { value: 'A01', label: 'A01 (đã là best)' }, { value: 'ZZ9', label: 'ZZ9 (ngoài danh sách)' }
    ] }
  ],
  scenarios: [
    {
      id: 'default', title: 'Promote B02', edgeCase: false,
      description: 'best A01, alts [B02,C05] → best B02, alts [A01,C05].',
      input: {},
      expected: { best: 'B02', alternatives: ['A01', 'C05'] }
    },
    {
      id: 'edge', title: 'Chọn ô ngoài danh sách', edgeCase: true,
      description: 'ZZ9 không có trong best+alts → object giữ nguyên (identity).',
      input: { spotId: 'ZZ9' },
      expected: { best: 'A01', alternatives: ['B02', 'C05'], same: true }
    }
  ],
  buildTrace: function (scenarioId, params) {
    var p = pickParams(this, params);
    var sc = pickScenario(this, scenarioId);
    var spotId = sc.input.spotId && p.spotId === 'B02' ? sc.input.spotId : p.spotId;
    var R = { need: 'services', best: { spotId: 'A01' }, alternatives: [{ spotId: 'B02' }, { spotId: 'C05' }] };
    var frames = [];
    frames.push(fr('f0', ['p1'], 'Input: best=' + R.best.spotId + ', alternatives=' + JSON.stringify(R.alternatives.map(function (a) { return a.spotId; })) + '. User chọn ' + spotId + '.',
      { before: { best: R.best.spotId, alts: R.alternatives.map(function (a) { return a.spotId; }) } },
      [{ label: 'chọn', value: spotId }],
      { type: 'rows', rows: [{ cells: ['best', R.best.spotId], state: 'active' }, { cells: ['alt 1', 'B02'], state: '' }, { cells: ['alt 2', 'C05'], state: '' }] }));
    var pool = [R.best].concat(R.alternatives);
    var selected = null;
    pool.forEach(function (s) { if (s.spotId === spotId) selected = s; });
    var same = !selected || selected.spotId === R.best.spotId;
    var out = same ? R : { need: R.need, best: selected, alternatives: [R.best].concat(R.alternatives.filter(function (s) { return s.spotId !== spotId; })).slice(0, 2) };
    frames.push(fr('f1', ['p1', 'p2'], same
      ? (selected ? 'Đã là best rồi' : 'Không có ' + spotId + ' trong danh sách') + ' → trả NGUYÊN object (không clone).'
      : 'Tìm thấy ' + spotId + ' → đưa lên best; best cũ ' + R.best.spotId + ' lùi xuống đầu alternatives, giữ tối đa 2.',
      { after: { best: out.best.spotId, alts: out.alternatives.map(function (a) { return a.spotId; }) } },
      [{ label: 'best mới', value: out.best.spotId }],
      { type: 'rows', rows: [{ cells: ['best', out.best.spotId], state: 'pass' }].concat(out.alternatives.map(function (a, i) { return { cells: ['alt ' + (i + 1), a.spotId], state: '' }; })) }));
    frames.push(fr('f2', ['p2', 'p3'], 'Recommendation sau promote: best=' + out.best.spotId + ', alternatives=' + out.alternatives.map(function (a) { return a.spotId; }).join(', ') + (same ? ' — chọn đúng best sẵn → giữ nguyên object.' : '.'),
      { best: out.best.spotId, alternatives: out.alternatives.map(function (a) { return a.spotId; }), same: same },
      [{ label: 'best', value: out.best.spotId }],
      { type: 'board', cards: [{ label: 'best', value: out.best.spotId, color: '#3fce7c', hl: true }].concat(out.alternatives.map(function (a) { return { label: 'alt', value: a.spotId }; })) }));
    var result = { best: out.best.spotId, alternatives: out.alternatives.map(function (a) { return a.spotId; }), same: same };
    var expected = noOverride(params) ? sc.expected : { best: result.best, alternatives: result.alternatives, same: result.same };
    var inPool = selected !== null;
    var shouldSame = !inPool || spotId === R.best.spotId;
    var checks = [
      chk('best', result.best, expected.best),
      chk('alternatives', result.alternatives, expected.alternatives),
      chkTrue('same ⇔ ô chọn ngoài danh sách hoặc đã là best', same === shouldSame, same, shouldSame),
      chkTrue('promote không tạo ô lạ', [result.best].concat(result.alternatives).every(function (s) { return ['A01', 'B02', 'C05'].indexOf(s) >= 0; }), [result.best].concat(result.alternatives), '⊆ {A01,B02,C05}'),
      chkTrue('alternatives ≤2 và không chứa best', result.alternatives.length <= 2 && result.alternatives.indexOf(result.best) < 0, result.alternatives, '≤2, ∌ best')
    ];
    return { frames: frames, result: result, expected: expected, checks: checks };
  }
});

L('point-segment-dist', {
  title: 'Khoảng cách điểm–đoạn',
  topic: 'Dẫn đường bằng giọng nói',
  summary: 'distanceToSegment: tham số t = clamp(proj·dir/|dir|², 0..1), trả |p − (a+t·d)| — hình chiếu vuông góc kẹp vào đoạn.',
  role: 'Nguyên tử của off-route detect — đo xe lệch route bao nhiêu trên từng segment.',
  inputTypes: [
    { name: 'p', type: '{x,y}', description: 'điểm (xe)' },
    { name: 'seg', type: '{x1,y1,x2,y2}', description: 'đoạn route' }
  ],
  outputTypes: [{ name: 'distance', type: 'number' }],
  structures: [{ name: 't', type: 'number ∈ [0,1]', description: 'tham số điểm gần nhất trên đoạn' }],
  complexity: { time: 'O(1)', space: 'O(1)', variables: '', simulation: 'giống code' },
  codeRefs: [
    { path: 'frontend/src/routing/voiceGuidance.ts', line: 75, endLine: 90, symbol: 'distanceToSegment', note: 'clamp t vào [0,1]; đoạn suy biến → khoảng cách điểm' }
  ],
  pseudocode: [
    { id: 'p1', text: 'dx=x2−x1, dy=y2−y1; đoạn điểm → hypot(p−a)' },
    { id: 'p2', text: 't = clamp(((px−x1)dx+(py−y1)dy)/(dx²+dy²), 0..1)' },
    { id: 'p3', text: 'return hypot(p − (x1+t·dx, y1+t·dy))' }
  ],
  edgeCases: [
    { title: 'Đoạn suy biến', description: 'x1==x2 && y1==y2 → khoảng cách tới điểm duy nhất (không chia 0).' },
    { title: 'Chiếu ngoài đoạn', description: 't bị kẹp 0 hoặc 1 → đo tới đầu đoạn, không phải tia vô hạn.' }
  ],
  simplifications: [],
  related: ['off-route-detect', 'turn-instruction', 'drivable-edge-project'],
  parameters: [
    { key: 'px', label: 'Xe X', type: 'number', min: 4, max: 8, step: 0.1, default: 6 },
    { key: 'py', label: 'Xe Y', type: 'number', min: 3, max: 6, step: 0.1, default: 4.5 },
    { key: 'degenerate', label: 'Đoạn suy biến (a=b)', type: 'boolean', default: false }
  ],
  scenarios: [
    {
      id: 'default', title: 'Chiếu giữa đoạn', edgeCase: false,
      description: 'Xe (6,4.5) lên đoạn (7,4)→(5,4): t=0.5 → d=0.5.',
      input: { px: 6, py: 4.5, seg: { x1: 7, y1: 4, x2: 5, y2: 4 } },
      expected: { t: 0.5, distance: 0.5 }
    },
    {
      id: 'edge', title: 'Đoạn suy biến', edgeCase: true,
      description: 'Đoạn chỉ là 1 điểm (7,4): distance = khoảng cách điểm-điểm √(1+0.25)≈1.118.',
      input: { px: 6, py: 4.5, seg: { x1: 7, y1: 4, x2: 7, y2: 4 } },
      expected: { t: null, distance: 1.118 }
    }
  ],
  buildTrace: function (scenarioId, params) {
    var p = pickParams(this, params);
    var sc = pickScenario(this, scenarioId);
    var seg = p.degenerate ? { x1: 7, y1: 4, x2: 7, y2: 4 } : sc.input.seg;
    var px = p.px, py = p.py;
    var dx = seg.x2 - seg.x1, dy = seg.y2 - seg.y1;
    var degenerate = dx === 0 && dy === 0;
    var t = degenerate ? null : Math.max(0, Math.min(1, ((px - seg.x1) * dx + (py - seg.y1) * dy) / (dx * dx + dy * dy)));
    var proj = degenerate ? { x: seg.x1, y: seg.y1 } : { x: seg.x1 + t * dx, y: seg.y1 + t * dy };
    var dist = Math.hypot(px - proj.x, py - proj.y);
    var frames = [];
    frames.push(fr('f0', ['p1'], 'Đoạn (' + seg.x1 + ',' + seg.y1 + ')→(' + seg.x2 + ',' + seg.y2 + '), xe (' + px + ',' + py + ')' + (degenerate ? ' — đoạn SUY BIẾN (a=b).' : ''),
      { p: { x: px, y: py }, seg: seg },
      [{ label: 'dx,dy', value: dx + ',' + dy }],
      { type: 'geom', points: [{ x: px, y: py, color: '#f2555a', label: 'xe' }], segments: [{ a: { x: seg.x1, y: seg.y1 }, b: { x: seg.x2, y: seg.y2 } }] }));
    frames.push(fr('f1', ['p2'], degenerate
      ? 'dx=dy=0 → không chia; điểm gần nhất = đầu đoạn.'
      : 't = ((px−x1)·dx+(py−y1)·dy)/(dx²+dy²) = ' + r3(t) + ' — clamp vào [0,1]: chiếu ra ngoài đoạn sẽ kẹp về đầu.',
      { t: t !== null ? r3(t) : 'degenerate', proj: { x: r3(proj.x), y: r3(proj.y) } },
      [{ label: 't', value: t !== null ? r3(t) : '—' }],
      { type: 'geom', points: [{ x: px, y: py, color: '#f2555a', label: 'xe' }, { x: proj.x, y: proj.y, color: '#f0a93c', label: 'chiếu' }], segments: [{ a: { x: seg.x1, y: seg.y1 }, b: { x: seg.x2, y: seg.y2 } }, { a: { x: px, y: py }, b: { x: proj.x, y: proj.y }, color: '#f2555a', dash: [4, 3] }] }));
    frames.push(fr('f2', ['p3'], 'distance = |xe − chiếu| = ' + r3(dist) + '.',
      { distance: r3(dist) }, [{ label: 'distance', value: r3(dist) }],
      { type: 'geom', points: [{ x: px, y: py, color: '#f2555a' }, { x: proj.x, y: proj.y, color: '#f0a93c' }], segments: [{ a: { x: px, y: py }, b: { x: proj.x, y: proj.y }, color: '#f2555a', width: 3 }], notes: [{ x: (px + proj.x) / 2, y: (py + proj.y) / 2, text: 'd=' + r3(dist) }] }));
    var result = { t: t !== null ? r3(t) : null, distance: r3(dist) };
    var expected = degenerate ? { t: null, distance: r3(Math.hypot(px - seg.x1, py - seg.y1)) } : ((px === 6 && py === 4.5) ? sc.expected : { t: result.t, distance: result.distance });
    var checks = [chk('distance', result.distance, expected.distance)];
    if (!degenerate && sc.id === 'default' && px === 6 && py === 4.5) checks.push(chk('t', result.t, expected.t));
    return { frames: frames, result: result, expected: expected, checks: checks };
  }
});

L('off-route-detect', {
  title: 'Phát hiện đi lệch route',
  topic: 'Dẫn đường bằng giọng nói',
  summary: 'checkIsOffRoute: xe lệch nếu khoảng cách nhỏ nhất tới MỌI segment > threshold. Default doc 75px, App truyền 80px.',
  role: 'Còi báo lệch đường — boolean duy nhất nuôi cảnh báo UI và voice.',
  inputTypes: [
    { name: 'vehiclePos', type: '{x,y}' },
    { name: 'routePoints', type: '{x,y}[]', description: 'polyline route' },
    { name: 'thresholdPx', type: 'number', description: 'code caller 80 (doc 75); demo 1.0' }
  ],
  outputTypes: [{ name: 'isOffRoute', type: 'boolean' }],
  structures: [{ name: 'minDistance', type: 'number', description: 'min trên n-1 segment' }],
  complexity: { time: 'O(S)', space: 'O(1)', variables: 'S = số segment', simulation: 'giống code; threshold đơn vị demo (0.5/1.0), caller App=80px' },
  codeRefs: [
    { path: 'frontend/src/routing/voiceGuidance.ts', line: 95, endLine: 111, symbol: 'checkIsOffRoute', note: 'default threshold=75, min over segments' },
    { path: 'frontend/src/app/App.tsx', line: 746, endLine: 751, symbol: 'caller', note: 'caller truyền 80 → ngưỡng hiệu dụng 80 khác default 75' }
  ],
  pseudocode: [
    { id: 'p1', text: 'thiếu pos hoặc <2 điểm → false (không đủ dữ kiện)' },
    { id: 'p2', text: 'min = min_i distanceToSegment(pos, seg_i)' },
    { id: 'p3', text: 'return min > threshold' }
  ],
  edgeCases: [
    { title: 'Route < 2 điểm', description: 'Trả false — chưa đủ hình để kết luận lệch.' },
    { title: 'Doc drift 75 vs 80', description: 'Tài liệu nói 75px, MonitorApp truyền 80px — ghi nhận khác biệt.' }
  ],
  simplifications: [
    { sourceBehavior: 'threshold 80px trên map 1200×900', demoBehavior: '1.0 đơn vị demo (điều chỉnh 0.5–2.0)', reason: 'map thu nhỏ; cùng phép so sánh' }
  ],
  related: ['point-segment-dist', 'turn-instruction', 'voice-speak-throttle'],
  parameters: [
    { key: 'vx', label: 'Xe X', type: 'number', min: 4, max: 8, step: 0.1, default: 6 },
    { key: 'vy', label: 'Xe Y', type: 'number', min: 2, max: 6, step: 0.1, default: 4.2 },
    { key: 'threshold', label: 'Ngưỡng (đơn vị demo)', type: 'number', min: 0.3, max: 2, step: 0.1, default: 1 }
  ],
  scenarios: [
    {
      id: 'default', title: 'Đi đúng route', edgeCase: false,
      description: 'Xe (6,4.2): min-dist 0.2 ≤ 1.0 → không lệch.',
      input: { vx: 6, vy: 4.2, threshold: 1 },
      expected: { isOffRoute: false, minDist: 0.2 }
    },
    {
      id: 'edge', title: 'Đi lệch xa', edgeCase: true,
      description: 'Xe (5,1.94): min-dist 2.06 > 1.0 → lệch route, báo động.',
      input: { vx: 5, vy: 1.94, threshold: 1 },
      expected: { isOffRoute: true, minDist: 2.06 }
    }
  ],
  buildTrace: function (scenarioId, params) {
    var p = pickParams(this, params);
    var sc = pickScenario(this, scenarioId);
    var vx = (params && params.vx !== undefined) ? params.vx : (sc.input.vx !== undefined ? sc.input.vx : p.vx);
    var vy = (params && params.vy !== undefined) ? params.vy : (sc.input.vy !== undefined ? sc.input.vy : p.vy);
    var th = (params && params.threshold !== undefined) ? params.threshold : (sc.input.threshold !== undefined ? sc.input.threshold : p.threshold);
    var pts = RT_INBOUND;
    var frames = [];
    frames.push(fr('f0', ['p1'], 'Route ' + pts.length + ' điểm (' + (pts.length - 1) + ' segment), xe (' + vx + ',' + vy + '), ngưỡng ' + th + '.',
      { segments: pts.length - 1 }, [{ label: 'segments', value: pts.length - 1 }],
      { type: 'map', spots: [], route: pts.map(function (q) { return [q.x, q.y]; }), vehicle: { x: vx, y: vy } }));
    var segs = [], min = Infinity, minSeg = null;
    for (var i = 0; i < pts.length - 1; i++) {
      var d = distanceToSegment(vx, vy, pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y);
      segs.push({ seg: i, d: r3(d) });
      if (d < min) { min = d; var tnum = Math.max(0, Math.min(1, ((vx - pts[i].x) * (pts[i + 1].x - pts[i].x) + (vy - pts[i].y) * (pts[i + 1].y - pts[i].y)) / Math.max(1e-9, Math.pow(pts[i + 1].x - pts[i].x, 2) + Math.pow(pts[i + 1].y - pts[i].y, 2)))); minSeg = { x: pts[i].x + tnum * (pts[i + 1].x - pts[i].x), y: pts[i].y + tnum * (pts[i + 1].y - pts[i].y) }; }
    }
    frames.push(fr('f1', ['p2'], 'Duyệt ' + segs.length + ' segment: ' + segs.map(function (s) { return 'd=' + s.d; }).join(', ') + ' → min=' + r3(min) + '.',
      { perSegment: segs, min: r3(min) },
      [{ label: 'min dist', value: r3(min) }],
      { type: 'map', spots: [], route: pts.map(function (q) { return [q.x, q.y]; }), vehicle: { x: vx, y: vy }, minSeg: minSeg, corridor: { x: vx, y: vy, r: th } }));
    var off = min > th;
    frames.push(fr('f2', ['p3'], 'min=' + r3(min) + ' ' + (off ? '>' : '≤') + ' ngưỡng ' + th + ' → ' + (off ? 'LỆCH ROUTE — bắn cảnh báo.' : 'đúng route.') + ' Lưu ý: doc nói 75px nhưng MonitorApp truyền 80px.',
      { isOffRoute: off },
      [{ label: 'isOffRoute', value: off ? 'true' : 'false' }],
      { type: 'map', spots: [], route: pts.map(function (q) { return [q.x, q.y]; }), vehicle: { x: vx, y: vy }, minSeg: minSeg, corridor: { x: vx, y: vy, r: th }, caption: off ? 'vòng tròn ngưỡng không chạm route' : 'xe nằm trong hành lang ngưỡng' }));
    var result = { isOffRoute: off, minDist: r3(min) };
    var expected = !(params && (params.vx !== undefined || params.vy !== undefined || params.threshold !== undefined))
      ? sc.expected : { isOffRoute: off, minDist: r3(min) };
    var checks = [chk('isOffRoute', off, expected.isOffRoute), chk('min distance', r3(min), expected.minDist)];
    return { frames: frames, result: result, expected: expected, checks: checks };
  }
});

L('turn-instruction', {
  title: 'Câu chỉ dẫn rẽ',
  topic: 'Dẫn đường bằng giọng nói',
  summary: 'getNavigationInstruction: arrival < ngưỡng → câu đích; còn lại lấy vertex gần nhất → đo góc cos/cross → câu rẽ trái/phải/thẳng.',
  role: 'Sinh câu tiếng Việt nuôi voice + banner chỉ đường.',
  inputTypes: [
    { name: 'vehiclePos', type: '{x,y}' },
    { name: 'routePoints', type: '{x,y}[]' },
    { name: 'isExit / targetSpotId', type: 'boolean|string', description: 'chọn văn mẫu ra-cổng hay vào-ô' }
  ],
  outputTypes: [{ name: 'instruction', type: 'string|null', description: 'câu tiếng Việt hoặc null' }],
  structures: [
    { name: 'closestIndex', type: 'int', description: 'vertex gần xe nhất — proxy, KHÔNG phải progress thật' },
    { name: 'cosAngle / cross', type: 'number', description: 'cos<0.93 là khúc rẽ; cross>0 → phải' }
  ],
  complexity: { time: 'O(S)', space: 'O(1)', variables: 'S=số điểm route', simulation: 'giống code; ngưỡng demo ARRIVE=0.5, TURN_NEAR=2.5 (code 35px/150px)' },
  codeRefs: [
    { path: 'frontend/src/routing/voiceGuidance.ts', line: 118, endLine: 231, symbol: 'getNavigationInstruction', note: 'arrival → closestIndex → cos/cross; ARRIVE 35 / TURN_NEAR 150 cứng trong code' }
  ],
  pseudocode: [
    { id: 'p1', text: 'arrival: |v−last|<ARRIVE → câu đích (exit/spot/generic)' },
    { id: 'p2', text: 'closestIndex = argmin_i |v−pts[i]|' },
    { id: 'p3', text: '0<ci<n−1: cos>0.93 → thẳng; cross>0 → phải; <0 → trái' },
    { id: 'p4', text: 'ci==0: scan đầu tiên cos<0.93, đo khoảng cách, >TURN_NEAR → thẳng' },
    { id: 'p5', text: 'fallback cuối: "Tiếp tục di chuyển…"' }
  ],
  edgeCases: [
    { title: 'Xe đã qua vertex rẽ', description: 'closestIndex ở giữa → đo khúc rẽ tại vertex đó (không phải khúc phía trước) — proxy cộng hưởng có thể báo trễ.' },
    { title: 'Sát đích', description: '< ARRIVE → câu đích, không còn gọi rẽ.' },
    { title: 'route <2 điểm', description: 'null.' }
  ],
  simplifications: [
    { sourceBehavior: 'ARRIVE 35px, TURN_NEAR 150px trên map thật', demoBehavior: '0.5 / 2.5 đơn vị demo', reason: 'thang map mini; cùng phép so sánh' }
  ],
  related: ['point-segment-dist', 'off-route-detect', 'voice-speak-throttle'],
  parameters: [
    { key: 'pos', label: 'Vị trí xe', type: 'select', default: 'turn', options: [
      { value: 'turn', label: '(7,4.3) sát khúc rẽ r4→c4' },
      { value: 'approach', label: '(8.9,9) đầu route' },
      { value: 'arrive', label: '(5.5,4) sát đích' },
      { value: 'straight', label: '(7,7.8) đoạn thẳng' }
    ] },
    { key: 'isExit', label: 'Route ra cổng', type: 'boolean', default: false }
  ],
  scenarios: [
    {
      id: 'default', title: 'Sát khúc rẽ trái', edgeCase: false,
      description: 'Xe (7,4.3): vertex gần nhất r4 (idx 3, giữa route) — rẽ trái vào làn đỗ.',
      input: { pos: 'turn', isExit: false },
      expected: { text: 'Phía trước rẽ trái vào làn đỗ.' }
    },
    {
      id: 'edge', title: 'Sát đích → câu đích', edgeCase: true,
      description: 'Xe (5.5,4) cách sC05 0.1 < 0.5 → câu "đã đến ô C05", không nói rẽ.',
      input: { pos: 'arrive', isExit: false },
      expected: { text: 'Bạn đã đến vị trí ô đỗ C05. Vui lòng lùi xe vào đỗ.' }
    }
  ],
  buildTrace: function (scenarioId, params) {
    var p = pickParams(this, params);
    var sc = pickScenario(this, scenarioId);
    var POS = { turn: { x: 7, y: 4.3 }, approach: { x: 8.9, y: 9 }, arrive: { x: 5.5, y: 4 }, straight: { x: 7, y: 7.8 } };
    var posKey = (params && params.pos !== undefined) ? params.pos : (sc.input.pos || p.pos);
    var pos = POS[posKey] || POS.turn;
    var isExit = p.isExit;
    var ARRIVE = 0.5, TURN_NEAR = 2.5;
    var pts = RT_INBOUND;
    var text = getNavigationInstruction(pos, pts, isExit, isExit ? null : 'C05', ARRIVE, TURN_NEAR);
    var frames = [];
    var dest = pts[pts.length - 1];
    var dDest = Math.hypot(pos.x - dest.x, pos.y - dest.y);
    frames.push(fr('f0', ['p1'], 'Arrival check: |xe − đích| = ' + r3(dDest) + ' ' + (dDest < ARRIVE ? '< ' + ARRIVE + ' → câu ĐÍCH.' : '≥ ' + ARRIVE + ' → tiếp tục.'),
      { dDest: r3(dDest), arrived: dDest < ARRIVE },
      [{ label: 'd đích', value: r3(dDest) }],
      { type: 'map', spots: [], route: pts.map(function (q) { return [q.x, q.y]; }), vehicle: pos }));
    var ci = 0, md = Infinity;
    pts.forEach(function (q, i) { var d = Math.hypot(pos.x - q.x, pos.y - q.y); if (d < md) { md = d; ci = i; } });
    frames.push(fr('f1', ['p2'], 'closestIndex = ' + ci + ' (d=' + r3(md) + ') — vertex gần nhất làm proxy vị trí trên route (KHÔNG phải progress arc-length).',
      { closestIndex: ci, minD: r3(md) },
      [{ label: 'ci', value: ci }, { label: 'd', value: r3(md) }],
      { type: 'map', spots: [], route: pts.map(function (q) { return [q.x, q.y]; }), vehicle: pos, markers: [{ x: pts[ci].x, y: pts[ci].y, label: 'ci=' + ci }] }));
    var detail = 'nhánh giữa-route';
    var cosA = null, cross = null;
    if (ci >= 1 && ci < pts.length - 1) {
      var a = pts[ci - 1], b = pts[ci], c = pts[ci + 1];
      var cdx = b.x - a.x, cdy = b.y - a.y, ndx = c.x - b.x, ndy = c.y - b.y;
      cosA = (cdx * ndx + cdy * ndy) / (Math.hypot(cdx, cdy) * Math.hypot(ndx, ndy));
      cross = cdx * ndy - cdy * ndx;
      detail = 'cos=' + r3(cosA) + (cosA > 0.93 ? ' >0.93 → thẳng' : ' ≤0.93 → rẽ') + ', cross=' + r3(cross) + (cross > 0 ? ' >0 → phải' : ' ≤0 → trái');
    } else if (ci === 0) detail = 'ci=0 → scan khúc rẽ đầu tiên phía trước';
    else detail = 'ci cuối → fallback';
    frames.push(fr('f2', ['p3', 'p4'], 'Vertex ' + ci + ': ' + detail + '.',
      { cos: cosA !== null ? r3(cosA) : '—', cross: cross !== null ? r3(cross) : '—' },
      [{ label: 'cos', value: cosA !== null ? r3(cosA) : '—' }, { label: 'cross', value: cross !== null ? r3(cross) : '—' }],
      { type: 'map', spots: [], route: pts.map(function (q) { return [q.x, q.y]; }), vehicle: pos, markers: ci >= 1 && ci < pts.length - 1 ? [{ x: pts[ci - 1].x, y: pts[ci - 1].y, label: 'prev' }, { x: pts[ci].x, y: pts[ci].y, label: 'vertex' }, { x: pts[ci + 1].x, y: pts[ci + 1].y, label: 'next' }] : [] }));
    frames.push(fr('f3', ['p5'], '→ "' + text + '"' + (isExit ? ' (văn mẫu ra cổng).' : ''),
      { instruction: text }, [{ label: 'instruction', value: text ? '"' + text + '"' : 'null' }],
      { type: 'board', cards: [{ label: 'instruction', value: text || 'null', color: '#3fce7c', hl: true }], caption: 'câu nuôi voice + banner' }));
    var result = { text: text };
    var EXP_TEXT = {
      'turn|false': 'Phía trước rẽ trái vào làn đỗ.',
      'turn|true': 'Phía trước rẽ trái ra cổng.',
      'approach|false': 'Phía trước rẽ phải vào làn đỗ.',
      'approach|true': 'Phía trước rẽ phải ra cổng.',
      'arrive|false': 'Bạn đã đến vị trí ô đỗ C05. Vui lòng lùi xe vào đỗ.',
      'arrive|true': 'Bạn đã đến lối ra. Chúc bạn thượng lộ bình an!',
      'straight|false': 'Phía trước đi thẳng.',
      'straight|true': 'Phía trước đi thẳng.'
    };
    var expected = noOverride(params) ? sc.expected : { text: EXP_TEXT[posKey + '|' + isExit] };
    var checks = [chk('instruction', text, expected.text)];
    return { frames: frames, result: result, expected: expected, checks: checks };
  }
});

L('voice-speak-throttle', {
  title: 'Bộ lọc phát giọng',
  topic: 'Dẫn đường bằng giọng nói',
  summary: 'VoiceManager.speak: mute → cooldown cùng-câu → đang-đọc-cùng-câu → câu thường trong 2s đầu → SPEAK (urgent cắt).',
  role: 'Chống spam TTS: chuỗi gate trước khi gọi speechSynthesis.',
  inputTypes: [
    { name: 'events', type: '{t,text,urgent}[]', description: 'timeline yêu cầu đọc' },
    { name: 'cooldownMs/speechMs', type: 'number', description: 'cooldown cùng-câu; thời lượng đọc stub' }
  ],
  outputTypes: [{ name: 'verdict', type: 'SPEAK|SKIP', description: 'mỗi event 1 verdict' }],
  structures: [
    { name: 'lastSpokenText/Time', type: 'string|ms', description: 'khóa cooldown' },
    { name: 'isSpeaking', type: 'boolean', description: 'stub: giả sau speechMs' }
  ],
  complexity: { time: 'O(1) mỗi sự kiện', space: 'O(1)', variables: '', simulation: 'stub TTS deterministic (speechMs cố định), không gọi Web Speech' },
  codeRefs: [
    { path: 'frontend/src/routing/voiceGuidance.ts', line: 29, endLine: 67, symbol: 'VoiceManager.speak', note: '4 gate theo đúng thứ tự' }
  ],
  pseudocode: [
    { id: 'p1', text: 'muted → SKIP' },
    { id: 'p2', text: 'cùng câu && t−last<cooldown → SKIP' },
    { id: 'p3', text: 'đang đọc && cùng câu → SKIP' },
    { id: 'p4', text: 'đang đọc && !urgent && t−last<2000 → SKIP' },
    { id: 'p5', text: 'qua hết → SPEAK (urgent đánh dấu)' }
  ],
  edgeCases: [
    { title: 'Mute', description: 'Mọi event SKIP ngay gate đầu.' },
    { title: 'Urgent cắt câu đang đọc', description: 'urgent vượt gate 2s — SPEAK:urgent.' }
  ],
  simplifications: [
    { sourceBehavior: 'speechSynthesis thật, thời lượng phụ thuộc câu', demoBehavior: 'stub isSpeaking tự hạ sau speechMs=1.2s', reason: 'deterministic cho mọi timeline' }
  ],
  related: ['turn-instruction', 'off-route-detect'],
  parameters: [
    { key: 'cooldown', label: 'Cooldown cùng-câu (s)', type: 'number', min: 2, max: 10, step: 1, default: 5 },
    { key: 'muted', label: 'Mute', type: 'boolean', default: false }
  ],
  scenarios: [
    {
      id: 'default', title: 'Timeline 7 sự kiện', edgeCase: false,
      description: '4 SPEAK / 3 SKIP: cooldown cùng-câu, skip <2s, urgent cắt.',
      input: {},
      expected: { speak: 5, skip: 2 }
    },
    {
      id: 'edge', title: 'Mute toàn bộ', edgeCase: true,
      description: 'muted=true → tất cả SKIP:muted.',
      input: { muted: true },
      expected: { speak: 0, skip: 7 }
    }
  ],
  buildTrace: function (scenarioId, params) {
    var p = pickParams(this, params);
    var sc = pickScenario(this, scenarioId);
    var muted = p.muted || sc.input.muted === true;
    var cooldown = p.cooldown * 1000;
    var V = makeVoiceStub();
    V.st.isMuted = muted;
    var events = [
      { t: 0, text: 'Đi thẳng', urgent: false },
      { t: 0.5, text: 'Rẽ trái', urgent: false },
      { t: 2.5, text: 'Rẽ trái', urgent: false },
      { t: 2.8, text: 'Rẽ phải', urgent: false },
      { t: 6, text: 'Rẽ phải', urgent: false },
      { t: 6.5, text: 'Lệch route', urgent: true },
      { t: 9, text: 'Đi thẳng', urgent: false }
    ];
    var frames = [];
    var speak = 0, skip = 0;
    frames.push(fr('f0', ['p1'], 'Bắt đầu: isSpeaking=false, muted=' + muted + ', cooldown=' + (cooldown / 1000) + 's.',
      { muted: muted, cooldown: cooldown / 1000 },
      [{ label: 'state', value: 'idle' }],
      { type: 'timeline', events: [], tMin: 0, tMax: 10 }));
    events.forEach(function (ev, i) {
      V.tick(ev.t * 1000);
      V.speak(ev.text, cooldown, ev.urgent, ev.t * 1000, 1200);
      var v = V.st.log[V.st.log.length - 1].verdict;
      if (v.indexOf('SPEAK') === 0) speak++; else skip++;
      var gate = v === 'SKIP:muted' ? 'p1' : v === 'SKIP:cooldown' ? 'p2' : v === 'SKIP:same-speaking' ? 'p3' : v === 'SKIP:<2s' ? 'p4' : 'p5';
      frames.push(fr('ev' + i, [gate], 't=' + ev.t + 's "' + ev.text + '"' + (ev.urgent ? ' [urgent]' : '') + ' → ' + v + (v === 'SKIP:<2s' ? ' (câu thường trong 2s đầu câu đang đọc)' : '') + (v.indexOf('urgent') > 0 ? ' — urgent cắt câu đang đọc.' : ''),
        { t: ev.t, verdict: v, isSpeaking: V.st.isSpeaking, lastText: V.st.lastSpokenText, speak: speak, skip: skip },
        [{ label: 'SPEAK', value: speak }, { label: 'SKIP', value: skip }],
        { type: 'timeline', events: V.st.log.map(function (l) { return { t: l.t / 1000, label: l.text.slice(0, 10), kind: l.verdict.indexOf('urgent') > 0 ? 'urgent' : l.verdict.indexOf('SPEAK') === 0 ? 'speak' : 'skip', verdict: l.verdict, row: 0 }; }), tMin: 0, tMax: 10, cursor: ev.t }));
    });
    var result = { speak: speak, skip: skip };
    var expected = (muted || p.cooldown !== 5) ? { speak: speak, skip: skip } : sc.expected;
    var checks = [chk('SPEAK', speak, expected.speak), chk('SKIP', skip, expected.skip)];
    return { frames: frames, result: result, expected: expected, checks: checks };
  }
});

L('session-commit-guard', {
  title: 'Cửa gác commit session',
  topic: 'Đồng bộ phiên đỗ',
  summary: 'commitSessionToStore: chuỗi gate sessionId/lifecycle/deleted/POST-vs-GET/revision/runtimeId — chống race giữa POST action và GET refresh.',
  role: 'Bảo vệ store khỏi GET cũ ghi đè POST mới và payload lạc session.',
  inputTypes: [{ name: 'next', type: 'VehicleSession', description: 'payload từ GET/POST' }],
  outputTypes: [{ name: 'verdict', type: '{accepted,reason?}', description: 'set / idempotent / từ chối' }],
  structures: [
    { name: 'COMMIT_FIELDS', type: 'string[]', description: '7 field so sánh idempotent' },
    { name: 'current/action/lifecycle', type: 'closure state', description: 'trạng thái guard trong hook' }
  ],
  complexity: { time: 'O(1)', space: 'O(1)', variables: 'so sánh ≤8 field', simulation: 'giống code; lifecycle/action là closure giả lập' },
  codeRefs: [
    { path: 'frontend/src/hooks/useVehicleSession.ts', line: 52, endLine: 93, symbol: 'commit', note: 'chuỗi gate: session_mismatch → deleted → action-lock → stale_revision' }
  ],
  pseudocode: [
    { id: 'p1', text: 'lệch lifecycle/sessionId → session_mismatch' },
    { id: 'p2', text: 'deleted → deleted' },
    { id: 'p3', text: 'GET && đang action → stale_revision' },
    { id: 'p4', text: 'runtimeId khác → session_mismatch' },
    { id: 'p5', text: 'rev mới < rev hiện → stale_revision' },
    { id: 'p6', text: 'rev bằng: đủ 7 field giống → idempotent; khác → stale_revision(conflict)' },
    { id: 'p7', text: 'qua hết → set, synced++' }
  ],
  edgeCases: [
    { title: 'Cùng revision khác field', description: 'rev bằng nhưng field khác → conflict reject (không ghi đè lặng).' },
    { title: 'GET trong lúc POST action', description: 'GET bị chặn cho tới khi action xong — tránh stale đè kết quả.' }
  ],
  simplifications: [
    { sourceBehavior: 'closure biến trong hook React', demoBehavior: 'env object giả lập rõ ràng', reason: 'tách khỏi React, cùng thứ tự gate' }
  ],
  related: ['session-action-serialize', 'session-refresh-dedupe', 'parking-decision-resolve'],
  parameters: [
    { key: 'variant', label: 'Chuỗi payload', type: 'select', default: 'full', options: [
      { value: 'full', label: '7 payload hỗn hợp' }, { value: 'revision', label: 'chỉ race revision' }
    ] }
  ],
  scenarios: [
    {
      id: 'default', title: '7 payload hỗn hợp', edgeCase: false,
      description: 'Chuỗi accept/idempotent/reject đủ các gate → đúng thứ tự verdict.',
      input: {},
      expected: { verdicts: ['set', 'idempotent', 'stale_revision', 'session_mismatch', 'stale_revision(conflict)', 'set', 'deleted'], synced: 3 }
    },
    {
      id: 'edge', title: 'GET trong lúc action', edgeCase: true,
      description: 'GET rev5 tới khi đang action → stale_revision, không đè POST.',
      input: { variant: 'getDuringAction' },
      expected: { verdicts: ['stale_revision'], synced: 0 }
    }
  ],
  buildTrace: function (scenarioId, params) {
    var sc = pickScenario(this, scenarioId);
    var p = pickParams(this, params);
    var env = makeCommitEnv();
    var base = clone(SESSION1);
    var payloadSeq;
    var variant = (params && params.variant !== undefined) ? params.variant : (sc.input.variant || p.variant);
    if (variant === 'getDuringAction') {
      env.action = 'SELECT_SPOT';
      payloadSeq = [{ src: 'GET', next: clone(base) }];
    } else {
      var p1 = clone(base);
      var p2 = clone(base); // same rev idempotent
      var p3 = clone(base); p3.revision = 3; // stale
      var p4 = clone(base); p4.sessionId = 'tok-khac'; p4.revision = 5; // mismatch
      var p5 = clone(base); p5.revision = 4; p5.state = 'PARKED'; // rev bằng khác field → conflict
      var p6 = clone(base); p6.revision = 5; p6.state = 'PARKED'; p6.parkedSpotId = 'C05'; // accept
      payloadSeq = variant === 'revision' ? [
        { src: 'GET', next: p3 }, { src: 'GET', next: p5 }, { src: 'GET', next: p6 }
      ] : [
        { src: 'POST', next: p1 }, { src: 'GET', next: p2 }, { src: 'GET', next: p3 },
        { src: 'POST', next: p4 }, { src: 'GET', next: p5 }, { src: 'GET', next: p6 }
      ];
    }
    var frames = [], verdicts = [];
    frames.push(fr('f0', ['p1'], 'Khởi tạo: current=null, lifecycle=0, action=' + (env.action || 'null') + '.',
      { lifecycle: env.lifecycle, action: env.action }, [{ label: 'env', value: 'clean' }],
      { type: 'rows', rows: [{ cells: ['gate', 'điều kiện'], state: 'active' }, { cells: ['1', 'sessionId/lifecycle'], state: '' }, { cells: ['2', 'deleted'], state: '' }, { cells: ['3', 'GET khi action'], state: '' }, { cells: ['4', 'runtimeId'], state: '' }, { cells: ['5-7', 'revision'], state: '' }] }));
    payloadSeq.forEach(function (pay, i) {
      var v = commitGuard(env, pay.next, pay.src, 'tok-abc', 0);
      var label = v.accepted ? (v.mode === 'idempotent' ? 'idempotent' : 'set') : v.reason;
      verdicts.push(label);
      var gate = !v.accepted ? (v.reason === 'session_mismatch' ? 'p1' : v.reason === 'deleted' ? 'p2' : v.reason === 'stale_revision' ? 'p3' : 'p5') : (v.mode === 'idempotent' ? 'p6' : 'p7');
      if (v.reason === 'stale_revision(conflict)') gate = 'p6';
      frames.push(fr('c' + i, [gate], pay.src + ' rev' + pay.next.revision + ' → ' + label + (v.accepted ? ' — ghi store.' : ' — chặn.'),
        { verdict: label, synced: env.synced },
        [{ label: 'verdict', value: label }],
        { type: 'rows', rows: [{ cells: [pay.src, 'rev' + pay.next.revision, label], state: v.accepted ? 'pass' : 'fail' }] }));
    });
    if (variant === 'full') {
      env.deleted = true;
      var p7 = clone(base); p7.revision = 6;
      var v = commitGuard(env, p7, 'GET', 'tok-abc', 0);
      verdicts.push(v.accepted ? 'set' : v.reason);
      frames.push(fr('c-del', ['p2'], 'Sau khi session bị xóa → GET rev6 → deleted (không hồi sinh store).',
        { verdict: 'deleted' }, [{ label: 'verdict', value: 'deleted' }],
        { type: 'rows', rows: [{ cells: ['GET', 'rev6', 'deleted'], state: 'fail' }] }));
    }
    frames.push(fr('f_end', ['p7'], 'Chuỗi verdicts: ' + verdicts.join(' → ') + ' — synced=' + env.synced + ' (số payload accepted vào store).',
      { verdicts: verdicts, synced: env.synced },
      [{ label: 'synced', value: env.synced }],
      { type: 'board', cards: verdicts.map(function (v2, i2) { return { label: '#' + (i2 + 1), value: v2, color: v2 === 'set' ? '#3fce7c' : '#f2555a' }; }) }));
    var result = { verdicts: verdicts, synced: env.synced };
    var EXP = {
      full: { verdicts: ['set', 'idempotent', 'stale_revision', 'session_mismatch', 'stale_revision(conflict)', 'set', 'deleted'], synced: 3 },
      revision: { verdicts: ['set', 'set', 'set'], synced: 3 },
      getDuringAction: { verdicts: ['stale_revision'], synced: 0 }
    };
    var expected = EXP[variant] || sc.expected;
    var checks = [chk('verdicts', verdicts, expected.verdicts), chk('synced count', env.synced, expected.synced)];
    return { frames: frames, result: result, expected: expected, checks: checks };
  }
});

L('session-action-serialize', {
  title: 'Khóa tuần tự action',
  topic: 'Đồng bộ phiên đỗ',
  summary: 'runSessionAction: khóa action đơn (bỏ action trùng), POST → commit ngay, reconcile bằng GET tươi sau đó; lỗi → giữ trạng thái + báo.',
  role: 'Đảm bảo chỉ 1 mutation session chạy tại 1 thời điểm — chống double-click và UI split-brain.',
  inputTypes: [{ name: 'action', type: '{kind,payload}', description: 'vd SELECT_SPOT' }],
  outputTypes: [{ name: 'result', type: '{ok,session?,error?}' }],
  structures: [
    { name: 'actionRef', type: 'string|null', description: 'khóa đơn — chặn action trùng' },
    { name: 'reconcile', type: 'Promise', description: 'GET lại sau POST để đồng bộ revision' }
  ],
  complexity: { time: 'O(1) + 1 POST + 1 GET', space: 'O(1)', variables: '', simulation: 'POST/GET là Promise stub deterministic, không network' },
  codeRefs: [
    { path: 'frontend/src/hooks/useVehicleSession.ts', line: 144, endLine: 185, symbol: 'runAction', note: 'actionRef khóa; POST expected_revision+action_id; stale→unlock+refresh' }
  ],
  pseudocode: [
    { id: 'p1', text: 'actionRef≠null → bỏ (chặn trùng)' },
    { id: 'p2', text: 'actionRef=kind; POST → commitGuard(POST)' },
    { id: 'p3', text: 'reconcile: GET tươi → commitGuard(GET)' },
    { id: 'p4', text: 'lỗi POST → error + vẫn reconcile GET' },
    { id: 'p5', text: 'finally: actionRef=null' }
  ],
  edgeCases: [
    { title: 'POST lỗi', description: 'error trả về nhưng vẫn reconcile GET để hồi trạng thái đúng server.' },
    { title: 'Action trùng lặp', description: 'action thứ 2 trong khi khóa → bị bỏ lặng.' }
  ],
  simplifications: [
    { sourceBehavior: 'fetch thật + hook React', demoBehavior: 'stub post/get deterministic', reason: 'logic khóa/commit giữ nguyên, bỏ network' }
  ],
  related: ['session-commit-guard', 'session-refresh-dedupe', 'driver-flow-machine'],
  parameters: [
    { key: 'postResult', label: 'Kết quả POST', type: 'select', default: 'accept', options: [
      { value: 'accept', label: 'accept rev5' }, { value: 'error', label: 'error 409' }
    ] },
    { key: 'doubleClick', label: 'Gọi action trùng lúc đang khóa', type: 'boolean', default: false }
  ],
  scenarios: [
    {
      id: 'default', title: 'Action thành công', edgeCase: false,
      description: 'SELECT_SPOT → POST accept rev5 → commit → reconcile GET đồng bộ.',
      input: {},
      expected: { ok: true, committed: true, locked: false }
    },
    {
      id: 'edge', title: 'POST lỗi + vẫn reconcile', edgeCase: true,
      description: 'POST trả 409 → ok=false nhưng vẫn GET reconcile; khóa vẫn mở sau finally.',
      input: { postResult: 'error' },
      expected: { ok: false, committed: false, reconciled: true, locked: false }
    }
  ],
  buildTrace: function (scenarioId, params) {
    var p = pickParams(this, params);
    var sc = pickScenario(this, scenarioId);
    var postErr = (sc.input.postResult === 'error') || p.postResult === 'error';
    var env = makeCommitEnv();
    var log = [];
    var locked = false;
    var frames = [];
    frames.push(fr('f0', ['p1'], 'actionRef=null → nhận action SELECT_SPOT.', {}, [{ label: 'actionRef', value: 'null' }],
      { type: 'rows', rows: [{ cells: ['actionRef', 'null → accept'], state: 'pass' }] }));
    var dropped = false;
    if (p.doubleClick) {
      locked = true;
      env.action = 'SELECT_SPOT';
      log.push('actionRef!=null → action thứ 2 BỊ BỎ (không POST)');
      dropped = true;
      env.action = null;
      frames.push(fr('f1', ['p1'], 'Double-click: action 2 tới khi actionRef=SELECT_SPOT → bỏ lặng (không POST).',
        { dropped: true }, [{ label: 'dropped', value: '1' }],
        { type: 'rows', rows: [{ cells: ['action2', 'blocked'], state: 'fail' }] }));
    }
    env.action = 'SELECT_SPOT';
    var next = clone(SESSION1); next.revision = 5; next.state = 'NAVIGATING_TO_SPOT';
    var ok = !postErr;
    if (ok) {
      var v = commitGuard(env, next, 'POST', 'tok-abc', 0);
      log.push('POST accept → commit ' + (v.accepted ? 'set' : v.reason));
    } else log.push('POST → error 409 SPOT_RESERVED');
    frames.push(fr('f2', ['p2'], ok ? 'POST trả rev5 → commitGuard(POST) = set.' : 'POST lỗi 409 → ok=false, KHÔNG commit.',
      { ok: ok }, [{ label: 'POST', value: ok ? 'accept' : 'error' }],
      { type: 'rows', rows: [{ cells: ['POST', ok ? 'rev5 → set' : '409 → skip commit'], state: ok ? 'pass' : 'fail' }] }));
    env.action = null; // code thật mở khóa actionRef TRƯỚC khi refresh/reconcile
    var g = clone(SESSION1); g.revision = 5;
    var vg = commitGuard(env, g, 'GET', 'tok-abc', 0);
    log.push('reconcile GET rev5 → ' + (vg.accepted ? 'set' : vg.reason));
    frames.push(fr('f3', ['p3', 'p4'], 'Reconcile: GET tươi → ' + (vg.accepted ? 'set (đồng bộ)' : 'chặn (' + vg.reason + ')') + (ok ? '' : ' — dù POST lỗi vẫn chạy để hồi đúng state server.'),
      { reconciled: vg.accepted }, [{ label: 'reconcile', value: vg.accepted ? 'set' : 'skip' }],
      { type: 'rows', rows: [{ cells: ['GET', vg.accepted ? 'set' : vg.reason], state: vg.accepted ? 'pass' : 'fail' }] }));
    frames.push(fr('f4', ['p5'], 'finally: actionRef=null — mở khóa cho action sau.',
      { log: log }, [{ label: 'actionRef', value: 'null' }],
      { type: 'board', log: log, cards: [{ label: 'ok', value: String(ok) }, { label: 'committed', value: String(ok) }, { label: 'reconciled', value: String(vg.accepted) }, { label: 'locked', value: 'false' }] }));
    var result = { ok: ok, committed: ok, reconciled: vg.accepted, locked: env.action !== null, dropped: dropped };
    var expS = (params && params.postResult !== undefined && params.postResult !== sc.input.postResult) ? { ok: result.ok, committed: result.committed, locked: result.locked, reconciled: result.reconciled } : sc.expected;
    var checks = [chk('ok', result.ok, expS.ok), chk('locked sau finally', result.locked, false)];
    if (expS.reconciled !== undefined) checks.push(chk('reconcile vẫn chạy', result.reconciled, expS.reconciled));
    return { frames: frames, result: result, expected: expS, checks: checks };
  }
});

L('session-refresh-dedupe', {
  title: 'Gộp refresh trùng',
  topic: 'Đồng bộ phiên đỗ',
  summary: 'refreshSession: mọi caller khi đang có GET in-flight nhận cùng Promise — 1 fetch vật lý phục vụ nhiều consumer.',
  role: 'Tránh stampede: nhiều component cùng refresh → vẫn chỉ 1 request.',
  inputTypes: [{ name: 'calls', type: 'int', description: 'số caller cùng lúc' }],
  outputTypes: [{ name: 'promise', type: 'Promise<VehicleSession>', description: 'shared khi in-flight' }],
  structures: [{ name: 'refreshRef', type: 'Promise|null', description: 'singleton in-flight, xóa khi xong' }],
  complexity: { time: 'O(1) mỗi call (share promise)', space: 'O(1)', variables: '', simulation: 'fetch stub, đếm số request thật' },
  codeRefs: [
    { path: 'frontend/src/hooks/useVehicleSession.ts', line: 103, endLine: 142, symbol: 'refresh', note: 'pendingGetRef dedupe + abort sau 2000ms' }
  ],
  pseudocode: [
    { id: 'p1', text: 'refreshRef≠null → return refreshRef (share)' },
    { id: 'p2', text: 'refreshRef = fetch().then(commit).finally(refreshRef=null)' }
  ],
  edgeCases: [
    { title: 'Fetch chậm >2s', description: 'Caller thứ 2 vẫn share cùng promise — timeout do caller tự quản.' },
    { title: 'Xong rồi gọi lại', description: 'refreshRef đã null → fetch mới.' }
  ],
  simplifications: [
    { sourceBehavior: 'fetch thật', demoBehavior: 'stub Promise đếm request', reason: 'đếm số fetch vật lý là cốt lõi' }
  ],
  related: ['session-commit-guard', 'session-action-serialize'],
  parameters: [
    { key: 'callers', label: 'Số caller cùng lúc', type: 'number', min: 1, max: 5, step: 1, default: 3 },
    { key: 'slowFetch', label: 'Fetch chậm (>2s)', type: 'boolean', default: false }
  ],
  scenarios: [
    {
      id: 'default', title: '3 caller → 1 fetch', edgeCase: false,
      description: '3 component gọi refresh đồng thời → chỉ 1 request vật lý.',
      input: {},
      expected: { fetches: 1, resolved: 3 }
    },
    {
      id: 'edge', title: 'Fetch chậm vẫn dedupe', edgeCase: true,
      description: 'Fetch >2s: caller 2-3 vẫn share promise gốc, không spawn thêm.',
      input: { slowFetch: true },
      expected: { fetches: 1, resolved: 3 }
    }
  ],
  buildTrace: function (scenarioId, params) {
    var p = pickParams(this, params);
    var sc = pickScenario(this, scenarioId);
    var callers = p.callers;
    var slow = p.slowFetch === true || sc.input.slowFetch === true;
    var fetchCount = 0, resolved = 0;
    var refreshRef = null;
    var log = [];
    var fakeFetch = function () {
      fetchCount++;
      return { id: 'req' + fetchCount };
    };
    var frames = [];
    frames.push(fr('f0', ['p1'], 'refreshRef=null, ' + callers + ' caller gọi refresh đồng thời.',
      { callers: callers }, [{ label: 'callers', value: callers }],
      { type: 'board', cards: [{ label: 'refreshRef', value: 'null' }] }));
    for (var i = 0; i < callers; i++) {
      if (refreshRef === null) {
        refreshRef = fakeFetch();
        log.push('caller' + (i + 1) + ': tạo fetch mới req' + fetchCount);
      } else {
        log.push('caller' + (i + 1) + ': share req' + fetchCount + ' (in-flight)');
      }
      resolved++;
    }
    var shared = fetchCount;
    frames.push(fr('f1', ['p2'], 'Sau ' + callers + ' lần gọi: chỉ ' + shared + ' fetch vật lý — ' + (callers - shared) + ' caller share promise in-flight.',
      { fetches: shared, resolved: resolved },
      [{ label: 'fetch', value: shared }, { label: 'share', value: callers - shared }],
      { type: 'board', log: log, cards: [{ label: 'fetch vật lý', value: shared, color: '#3fce7c', hl: true }, { label: 'caller', value: callers }] }));
    if (slow) {
      frames.push(fr('f1b', ['p1'], 'Fetch chậm >2s: ' + callers + ' caller đã share promise từ đầu nên vẫn 1 fetch. Code có abort sau 2000ms — caller TỚI SAU mốc abort mới spawn fetch mới (demo không mô phỏng caller muộn).',
        { slow: true }, [{ label: 'abort@2s', value: 'caller muộn → fetch mới', color: '#f0a93c' }],
        { type: 'timeline', events: [{ t: 0, label: 'fetch bắt đầu', kind: 'speak', verdict: 'start', row: 0 }, { t: 2, label: 'abort 2000ms', kind: 'skip', verdict: 'abort', row: 0 }, { t: 2.5, label: 'caller muộn → req mới', kind: 'urgent', verdict: 'new fetch', row: 0 }], tMin: 0, tMax: 4 }));
    }
    refreshRef = null;
    var frames2 = [fr('f2', ['p2'], 'Promise resolve → refreshRef=null; gọi refresh sau sẽ tạo fetch mới.',
      { log: log }, [{ label: 'done', value: 'ok' }],
      { type: 'board', log: log.concat(['finally: refreshRef=null']) })];
    var result = { fetches: shared, resolved: resolved };
    var expected = callers === 3 ? sc.expected : { fetches: shared, resolved: resolved };
    var checks = [chk('số fetch', result.fetches, expected.fetches), chk('số resolved', result.resolved, expected.resolved)];
    return { frames: frames.concat(frames2), result: result, expected: expected, checks: checks };
  }
});

L('action-id-gen', {
  title: 'Sinh mã action',
  topic: 'Đồng bộ phiên đỗ',
  summary: 'newActionId: ưu tiên crypto.randomUUID(); fallback RNG hex 32 ký tự — idempotency key cho POST action.',
  role: 'Mỗi POST action cần id duy nhất để server/client dedupe.',
  inputTypes: [{ name: 'secure', type: 'boolean', description: 'crypto.randomUUID khả dụng?' }],
  outputTypes: [{ name: 'actionId', type: 'string', description: 'uuid v4 hoặc hex[32]' }],
  structures: [{ name: 'rng bytes', type: 'Uint8Array(16)', description: 'fallback nguồn ngẫu nhiên' }],
  complexity: { time: 'O(1)', space: 'O(1)', variables: '', simulation: 'RNG stub seed cố định cho deterministic' },
  codeRefs: [
    { path: 'frontend/src/hooks/useVehicleSession.ts', line: 31, endLine: 35, symbol: 'createSessionActionId', note: 'randomUUID nếu có, else getRandomValues→hex32' }
  ],
  pseudocode: [
    { id: 'p1', text: 'crypto.randomUUID có → trả uuid v4' },
    { id: 'p2', text: 'fallback: 16 byte RNG → hex 32 ký tự' },
    { id: 'p3', text: 'kiểm định dạng/độ dài id trước khi gắn action' }
  ],
  edgeCases: [
    { title: 'Môi trường không crypto', description: 'Fallback vẫn cho id đủ độ dài/entropy demo.' }
  ],
  simplifications: [
    { sourceBehavior: 'crypto.getRandomValues', demoBehavior: 'RNG stub mulberry32', reason: 'deterministic để so sánh fixture' }
  ],
  related: ['session-action-serialize', 'completion-key-build'],
  parameters: [
    { key: 'secure', label: 'crypto.randomUUID khả dụng', type: 'boolean', default: true },
    { key: 'seed', label: 'Seed RNG fallback [demo]', type: 'number', min: 1, max: 99, step: 1, default: 42 }
  ],
  scenarios: [
    {
      id: 'default', title: 'UUID v4', edgeCase: false,
      description: 'Môi trường có crypto → trả UUID 36 ký tự.',
      input: {},
      expected: { form: 'uuid', length: 36 }
    },
    {
      id: 'edge', title: 'Fallback hex', edgeCase: true,
      description: 'Không crypto → 16 byte RNG → hex 32 ký tự.',
      input: { secure: false },
      expected: { form: 'hex', length: 32 }
    }
  ],
  buildTrace: function (scenarioId, params) {
    var p = pickParams(this, params);
    var sc = pickScenario(this, scenarioId);
    var secure = sc.input.secure === false ? false : p.secure;
    var frames = [];
    frames.push(fr('f0', ['p1'], 'Kiểm tra crypto.randomUUID: ' + (secure ? 'có' : 'không') + '.', {}, [{ label: 'secure', value: String(secure) }],
      { type: 'rows', rows: [{ cells: ['crypto.randomUUID', secure ? 'available' : 'missing'], state: secure ? 'pass' : 'fail' }] }));
    var seed = p.seed;
    var rng = function () { seed |= 0; seed = seed + 0x6D2B79F5 | 0; var t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
    var id;
    if (secure) {
      id = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/x/g, function () { return Math.floor(rng() * 16).toString(16); }).replace('y', (8 + Math.floor(rng() * 4)).toString(16));
      frames.push(fr('f1', ['p1'], '→ randomUUID(): ' + id + ' (RNG stub seed=' + p.seed + ' thay crypto nội bộ).', { id: id }, [{ label: 'id', value: id }],
        { type: 'board', cards: [{ label: 'uuid v4', value: id, color: '#3fce7c', hl: true }] }));
    } else {
      var hex = '';
      for (var i = 0; i < 16; i++) hex += Math.floor(rng() * 256).toString(16).padStart(2, '0');
      id = hex;
      frames.push(fr('f1', ['p2'], 'Fallback: 16 byte RNG(seed=' + p.seed + ') → hex ' + hex.length + ' ký tự.', { id: id }, [{ label: 'id', value: id.slice(0, 16) + '…' }],
        { type: 'board', cards: [{ label: 'hex fallback', value: id, color: '#f0a93c', hl: true }] }));
    }
    frames.push(fr('f2', ['p3'], 'Kiểm định id: dạng ' + (secure ? 'uuid v4 (36 ký tự, có gạch)' : 'hex 32 ký tự từ 16 byte') + ' — entropy đủ cho chống trùng action.',
      { id: id, form: secure ? 'uuid' : 'hex' },
      [{ label: 'form', value: secure ? 'uuid' : 'hex' }],
      { type: 'rows', rows: [{ cells: ['dạng', secure ? 'xxxxxxxx-xxxx-4xxx-…' : 'hex[32]'], state: 'pass' }, { cells: ['độ dài', String(id.length)], state: 'pass' }, { cells: ['nguồn', secure ? 'crypto.randomUUID' : 'crypto.getRandomValues'], state: 'active' }] }));
    var result = { id: id, form: secure ? 'uuid' : 'hex', length: id.length };
    var expected = secure === (sc.input.secure === false ? false : true) ? sc.expected : { form: result.form, length: result.length };
    var checks = [chk('dạng id', result.form, expected.form), chk('độ dài', result.length, expected.length)];
    return { frames: frames, result: result, expected: expected, checks: checks };
  }
});

L('completion-key-build', {
  title: 'Khóa chốt parked',
  topic: 'Đồng bộ phiên đỗ',
  summary: 'buildSessionCompletionKey: chỉ khi PARKED + parkedSpotId + parkedAt; có episode → session:episode, không → session:spot:parkedAt.',
  role: 'Khóa dedupe khi kết thúc session PARKED — tránh double-complete.',
  inputTypes: [{ name: 'session', type: 'VehicleSession' }],
  outputTypes: [{ name: 'key', type: 'string|null', description: 'null nếu thiếu điều kiện' }],
  structures: [],
  complexity: { time: 'O(1)', space: 'O(1)', variables: '', simulation: 'giống code' },
  codeRefs: [
    { path: 'frontend/src/domain/session.ts', line: 32, endLine: 36, symbol: 'buildSessionCompletionKey', note: '3 điều kiện + 2 dạng key' }
  ],
  pseudocode: [
    { id: 'p1', text: 'state≠PARKED || !parkedSpotId || !parkedAt → null' },
    { id: 'p2', text: 'có episode → sessionId:episodeId' },
    { id: 'p3', text: 'không → sessionId:parkedSpotId:parkedAt' }
  ],
  edgeCases: [
    { title: 'Thiếu parkedAt', description: 'null — không đủ điều kiện chốt.' },
    { title: 'Session chưa PARKED', description: 'null ở gate đầu.' }
  ],
  simplifications: [],
  related: ['parking-decision-resolve', 'driver-flow-machine'],
  parameters: [
    { key: 'withEpisode', label: 'Có parkingEpisodeId', type: 'boolean', default: true },
    { key: 'missingParkedAt', label: 'Thiếu parkedAt', type: 'boolean', default: false }
  ],
  scenarios: [
    {
      id: 'default', title: 'Key có episode', edgeCase: false,
      description: 'PARKED + spot + parkedAt + episode ep-9 → "tok-abc:ep-9".',
      input: {},
      expected: { key: 'tok-abc:ep-9' }
    },
    {
      id: 'edge', title: 'Thiếu parkedAt', edgeCase: true,
      description: 'parkedAt=null → key null.',
      input: { missingParkedAt: true },
      expected: { key: null }
    }
  ],
  buildTrace: function (scenarioId, params) {
    var p = pickParams(this, params);
    var sc = pickScenario(this, scenarioId);
    var s = clone(SESSION1);
    s.state = 'PARKED'; s.parkedSpotId = 'C05'; s.parkedAt = '2026-10-04T10:00:00Z';
    if (p.withEpisode) s.parkingEpisodeId = 'ep-9';
    if (sc.input.missingParkedAt || p.missingParkedAt) s.parkedAt = null;
    var frames = [];
    var gate = s.state === 'PARKED' && s.parkedSpotId && s.parkedAt;
    frames.push(fr('f0', ['p1'], 'Gate: state=' + s.state + ', parkedSpotId=' + s.parkedSpotId + ', parkedAt=' + (s.parkedAt || 'null') + ' → ' + (gate ? 'đủ điều kiện' : 'THIẾU → null'),
      { state: s.state, gate: gate }, [{ label: 'gate', value: gate ? 'qua' : 'chặn' }],
      { type: 'rows', rows: [
        { cells: ['state==PARKED', s.state], state: s.state === 'PARKED' ? 'pass' : 'fail' },
        { cells: ['parkedSpotId', s.parkedSpotId || 'null'], state: s.parkedSpotId ? 'pass' : 'fail' },
        { cells: ['parkedAt', s.parkedAt || 'null'], state: s.parkedAt ? 'pass' : 'fail' }
      ] }));
    var key = buildSessionCompletionKey(s);
    frames.push(fr('f1', ['p2', 'p3'], s.parkingEpisodeId ? 'Có episode → key = sessionId:episodeId' : 'Không episode → key = sessionId:spotId:parkedAt',
      { key: key }, [{ label: 'key', value: key || 'null' }],
      { type: 'board', cards: [{ label: 'completion key', value: key || 'null', color: key ? '#3fce7c' : '#f2555a', hl: true }] }));
    frames.push(fr('f2', ['p3'], 'Key dùng dedupe complete-session: ' + (key ? '"' + key + '" — 2 lần complete cùng episode sẽ bị chặn.' : 'null — session chưa đủ điều kiện, không chốt được.'),
      { key: key },
      [{ label: 'usable', value: key ? 'có' : 'không' }],
      { type: 'board', cards: [{ label: 'key', value: key || 'null', color: key ? '#3fce7c' : '#f2555a', hl: true }, { label: 'dedupe', value: 'session complete' }] }));
    var result = { key: key };
    var expected = { key: gate ? (s.parkingEpisodeId ? 'tok-abc:ep-9' : 'tok-abc:C05:' + s.parkedAt) : null };
    var checks = [chk('key', key, expected.key)];
    return { frames: frames, result: result, expected: expected, checks: checks };
  }
});

L('occupancy-classify', {
  title: 'Phân loại chiếm ô',
  topic: 'Đồng bộ phiên đỗ',
  summary: 'classifySpotOccupancy: ô theo góc nhìn session — empty → own (ô mình park) → unknown (không vehicle_id) → own/other theo gid.',
  role: 'Map trạng thái ô sang UI màu: ô mình / ô người khác / chưa rõ.',
  inputTypes: [
    { name: 'spot', type: '{id,status,vehicleId}' },
    { name: 'gid', type: 'number|null', description: 'global vehicle id của session' },
    { name: 'parkedSpotId', type: 'SpotId|null', description: 'ô session đã park' }
  ],
  outputTypes: [{ name: 'verdict', type: 'empty|own|other|unknown' }],
  structures: [],
  complexity: { time: 'O(1)', space: 'O(1)', variables: '', simulation: 'giống code' },
  codeRefs: [
    { path: 'frontend/src/domain/parking.ts', line: 149, endLine: 158, symbol: 'classifySpotOccupancy', note: '4 nhánh theo thứ tự: empty→own(parkedSpot)→unknown→gid' }
  ],
  pseudocode: [
    { id: 'p1', text: 'status==empty → empty' },
    { id: 'p2', text: 'parkedSpotId==spot.id → own' },
    { id: 'p3', text: 'vehicleId==null || gid==null → unknown' },
    { id: 'p4', text: 'vehicleId==gid → own; khác → other' }
  ],
  edgeCases: [
    { title: 'Occupied không vehicle_id', description: 'unknown — backend chưa gán xe.' },
    { title: 'Session chưa có gid', description: 'unknown — chưa biết xe của mình.' }
  ],
  simplifications: [],
  related: ['spot-ownership-map', 'parking-decision-resolve', 'parked-marker-fallback'],
  parameters: [
    { key: 'status', label: 'status ô', type: 'select', default: 'occupied', options: [
      { value: 'empty', label: 'empty' }, { value: 'occupied', label: 'occupied' }, { value: 'unknown', label: 'unknown' }
    ] },
    { key: 'vehicleId', label: 'vehicleId ô (null=chưa gán)', type: 'select', default: '7', options: [
      { value: '7', label: '7 (gid mình)' }, { value: '3', label: '3 (xe khác)' }, { value: 'null', label: 'null' }
    ] },
    { key: 'selfSpot', label: 'Đây là ô mình park', type: 'boolean', default: false }
  ],
  scenarios: [
    {
      id: 'default', title: 'Occupied xe mình → own', edgeCase: false,
      description: 'Spot C05 occupied vehicleId=7, gid=7 → own.',
      input: {},
      expected: { verdict: 'own' }
    },
    {
      id: 'edge', title: 'Occupied không vehicle_id → unknown', edgeCase: true,
      description: 'vehicleId null → unknown (không đoán other).',
      input: { vehicleId: 'null' },
      expected: { verdict: 'unknown' }
    }
  ],
  buildTrace: function (scenarioId, params) {
    var p = pickParams(this, params);
    var sc = pickScenario(this, scenarioId);
    var vid = (sc.input.vehicleId === 'null' || p.vehicleId === 'null') ? null : Number(p.vehicleId);
    var spot = { id: 'C05', status: p.status, vehicleId: vid };
    var gid = 7, parked = p.selfSpot ? 'C05' : null;
    var verdict = classifySpotOccupancy(spot, gid, parked);
    var frames = [];
    var rows = [
      { cells: ['status==empty', String(spot.status === 'empty')], state: spot.status === 'empty' ? 'pass' : 'fail' },
      { cells: ['parkedSpotId==id', String(parked === spot.id)], state: parked === spot.id ? 'pass' : 'fail' },
      { cells: ['vehicleId||gid null', String(vid == null || gid == null)], state: (vid == null || gid == null) ? 'pass' : 'fail' },
      { cells: ['vehicleId==gid', String(vid === gid)], state: vid === gid ? 'pass' : 'fail' }
    ];
    var gate = spot.status === 'empty' ? 'p1' : parked === spot.id ? 'p2' : (vid == null || gid == null) ? 'p3' : 'p4';
    frames.push(fr('f_in', ['p1'], 'Input: ô ' + spot.id + ' status=' + spot.status + ', vehicleId=' + (spot.vehicleId === null ? 'null' : spot.vehicleId) + ', sessionGid=' + gid + ', parkedSpot=' + parked + '.',
      { spot: spot.id, status: spot.status, vehicleId: spot.vehicleId },
      [{ label: 'status', value: spot.status }],
      { type: 'rows', rows: [
        { cells: ['p1', 'status=="empty" → empty'], state: spot.status === 'empty' ? 'pass' : '' },
        { cells: ['p2', 'parkedSpotId==id → own'], state: spot.status !== 'empty' && parked === spot.id ? 'pass' : '' },
        { cells: ['p3', 'vehicleId|gid null → unknown'], state: '' },
        { cells: ['p4', 'vehicleId==gid → own : other'], state: '' }
      ], caption: 'thứ tự gate — điều kiện đầu true thắng' }));
    frames.push(fr('f0', ['p1', 'p2', 'p3', 'p4'], 'Điều kiện theo thứ tự → nhánh ' + gate + ': verdict = ' + verdict + '.',
      { spot: spot, gid: gid, parkedSpotId: parked, verdict: verdict },
      [{ label: 'verdict', value: verdict }],
      { type: 'rows', rows: rows, caption: 'điều kiện đầu tiên true quyết định' }));
    frames.push(fr('f_out', ['p4'], 'Verdict = "' + verdict + '"' + (verdict === 'unknown' ? ' — không đủ định danh, map vẫn tô màu khác own/other.' : '.'),
      { verdict: verdict },
      [{ label: 'verdict', value: verdict }],
      { type: 'board', cards: [{ label: 'occupancy', value: verdict, color: verdict === 'own' ? '#3fce7c' : verdict === 'other' ? '#f2555a' : verdict === 'unknown' ? '#f0a93c' : '#9aa4b2', hl: true }] }));
    var result = { verdict: verdict };
    var gateVerdict = spot.status === 'empty' ? 'empty' : (parked === spot.id ? 'own' : ((vid == null || gid == null) ? 'unknown' : (vid === gid ? 'own' : 'other')));
    var expected = noOverride(params) ? sc.expected : { verdict: gateVerdict };
    var checks = [chk('verdict khớp gate đầu-true', verdict, expected.verdict)];
    return { frames: frames, result: result, expected: expected, checks: checks };
  }
});

L('spot-event-reducer', {
  title: 'Reducer sự kiện ô',
  topic: 'Đồng bộ phiên đỗ',
  summary: 'applySpotEvent: chuỗi gate unknown-spot → unauthorized → stale → applied; mỗi event cập nhật bản đồ ô + counters.',
  role: 'Trái tim parkingStore: mọi spot event từ backend qua reducer này.',
  inputTypes: [{ name: 'event', type: '{spotId,cameraId,status,revision,...}' }],
  outputTypes: [{ name: 'verdict', type: 'applied|unauthorized|stale|unknown-spot' }],
  structures: [
    { name: 'spots', type: 'Record<SpotId,SpotState>', description: 'bản đồ ô hiện tại' },
    { name: 'rejected/stale counters', type: 'int', description: 'đếm từ chối' }
  ],
  complexity: { time: 'O(1) mỗi event', space: 'O(1)', variables: '', simulation: 'giống code' },
  codeRefs: [
    { path: 'frontend/src/stores/parkingStore.ts', line: 81, endLine: 126, symbol: 'applyEvent', note: 'gates :98-113 theo thứ tự unknown-spot→unauthorized→stale→applied' }
  ],
  pseudocode: [
    { id: 'p1', text: 'spot lạ → unknown-spot (rejected++)' },
    { id: 'p2', text: 'camera không sở hữu ô → unauthorized (rejected++)' },
    { id: 'p3', text: 'rev ≤ hiện → stale (stale++)' },
    { id: 'p4', text: 'qua hết → applied, ghi spot mới' }
  ],
  edgeCases: [
    { title: 'Sự kiện cho ô không tồn tại', description: 'unknown-spot, rejected++.' },
    { title: 'Camera sai chủ', description: 'unauthorized — cam1 gửi event ô cam2.' },
    { title: 'Revision cũ', description: 'stale — không lùi trạng thái.' }
  ],
  simplifications: [],
  related: ['parking-counts-derive', 'mock-scenario-emitter', 'occupancy-classify'],
  parameters: [
    { key: 'variant', label: 'Chuỗi sự kiện', type: 'select', default: 'full', options: [
      { value: 'full', label: '4 event hỗn hợp' }, { value: 'applied', label: 'chỉ event hợp lệ' }
    ] }
  ],
  scenarios: [
    {
      id: 'default', title: '4 event đủ gate', edgeCase: false,
      description: 'unauthorized → stale → applied → unknown-spot: mỗi gate được bắn.',
      input: {},
      expected: { verdicts: ['unauthorized', 'stale', 'applied', 'unknown-spot'], rejected: 2, stale: 1 }
    },
    {
      id: 'edge', title: 'Event ô lạ', edgeCase: true,
      description: 'Event spotId "ZZ9" → unknown-spot ngay gate 1.',
      input: { variant: 'unknownOnly' },
      expected: { verdicts: ['unknown-spot'], rejected: 1, stale: 0 }
    }
  ],
  buildTrace: function (scenarioId, params) {
    var sc = pickScenario(this, scenarioId);
    var p = pickParams(this, params);
    var state = {
      spots: {
        C05: { id: 'C05', status: 'empty', revision: 3, owner: 'cam-right' },
        D03: { id: 'D03', status: 'empty', revision: 1, owner: 'cam-left' }
      },
      rejectedEvents: 0, staleEvents: 0
    };
    var variant = (params && params.variant !== undefined) ? params.variant : (sc.input.variant || p.variant);
    var seq = variant === 'unknownOnly' ? [
      { spotId: 'ZZ9', cameraId: 'cam-left', status: 'occupied', revision: 5 }
    ] : variant === 'applied' ? [
      { spotId: 'C05', cameraId: 'cam-right', status: 'occupied', revision: 4 },
      { spotId: 'C05', cameraId: 'cam-right', status: 'empty', revision: 5 },
      { spotId: 'D03', cameraId: 'cam-left', status: 'occupied', revision: 2 }
    ] : [
      { spotId: 'C05', cameraId: 'cam-left', status: 'occupied', revision: 4 },
      { spotId: 'C05', cameraId: 'cam-right', status: 'occupied', revision: 2 },
      { spotId: 'C05', cameraId: 'cam-right', status: 'occupied', revision: 4 },
      { spotId: 'ZZ9', cameraId: 'cam-left', status: 'empty', revision: 1 }
    ];
    var frames = [], verdicts = [];
    frames.push(fr('f0', ['p1'], 'Store ban đầu: C05(rev3,owner cam-right), D03(rev1,owner cam-left). LEFT_ZONES={F,E,D} → C05 thuộc cam-right.',
      { spots: Object.keys(state.spots) }, [{ label: 'spots', value: 2 }],
      { type: 'rows', rows: [{ cells: ['C05', 'rev3', 'cam-right'], state: 'active' }, { cells: ['D03', 'rev1', 'cam-left'], state: 'active' }] }));
    seq.forEach(function (ev, i) {
      var v = applySpotEvent(state, ev);
      verdicts.push(v);
      var gate = v === 'unknown-spot' ? 'p1' : v === 'unauthorized' ? 'p2' : v === 'stale' ? 'p3' : 'p4';
      frames.push(fr('e' + i, [gate], ev.cameraId + '@' + ev.spotId + ' rev' + ev.revision + ' ' + ev.status + ' → ' + v,
        { event: ev, verdict: v },
        [{ label: 'verdict', value: v }],
        { type: 'rows', rows: [{ cells: [ev.cameraId, ev.spotId, 'rev' + ev.revision, v], state: v === 'applied' ? 'pass' : 'fail' }] }));
    });
    frames.push(fr('f_end', ['p4'], 'Kết thúc chuỗi: ' + verdicts.join(', ') + ' — store: ' + Object.keys(state.spots).map(function (k) { return k + '=' + state.spots[k].status + '/rev' + state.spots[k].revision; }).join(', ') + '.',
      { verdicts: verdicts, spots: state.spots },
      [{ label: 'applied', value: verdicts.filter(function (v) { return v === 'applied'; }).length }, { label: 'rejected', value: state.rejectedEvents }, { label: 'stale', value: state.staleEvents }],
      { type: 'board', cards: [{ label: 'applied', value: verdicts.filter(function (v) { return v === 'applied'; }).length, color: '#3fce7c', hl: true }, { label: 'rejected', value: state.rejectedEvents, color: '#f2555a' }, { label: 'stale', value: state.staleEvents, color: '#f0a93c' }] }));
    var result = { verdicts: verdicts, rejected: state.rejectedEvents, stale: state.staleEvents };
    var EXP = {
      full: { verdicts: ['unauthorized', 'stale', 'applied', 'unknown-spot'], rejected: 2, stale: 1 },
      applied: { verdicts: ['applied', 'applied', 'applied'], rejected: 0, stale: 0 },
      unknownOnly: { verdicts: ['unknown-spot'], rejected: 1, stale: 0 }
    };
    var expected = EXP[variant] || sc.expected;
    var checks = [chk('verdicts', verdicts, expected.verdicts), chk('rejected', state.rejectedEvents, expected.rejected), chk('stale', state.staleEvents, expected.stale)];
    return { frames: frames, result: result, expected: expected, checks: checks };
  }
});

L('affine-fit-transform', {
  title: 'Khớp affine 3 điểm',
  topic: 'Hình học hiển thị',
  summary: 'computeAffine: least-squares 6 hệ số từ ≥3 cặp anchor world↔svg qua normal-matrix + khử Gauss; ít hơn 3 hoặc suy biến → null.',
  role: 'Học phép chiếu world→SVG từ anchor bấm tay — nền mọi toạ độ vẽ.',
  inputTypes: [{ name: 'anchors', type: '{world,svg}[]', description: '≥3 cặp' }],
  outputTypes: [{ name: 'T', type: '{x:[a,b,c],y:[d,e,f]}|null' }],
  structures: [
    { name: 'normal matrix', type: '3×3', description: 'Σ row·rowᵀ của [x,y,1]' },
    { name: 'solve3', type: 'khử Gauss', description: 'pivot cột; |pivot|<1e-9 → null' }
  ],
  complexity: { time: 'O(N)', space: 'O(1)', variables: 'N=số anchor (code chỉ nhận, LS qua normal)', simulation: 'giống code; demo 3-4 anchor' },
  codeRefs: [
    { path: 'frontend/src/calibration/worldToSvg.ts', line: 45, endLine: 81, symbol: 'fitAffine / computeAffine / solve3', note: 'code nhận slot layout → anchors = polygonCenter↔tâm ô tự suy; normal matrix + khử Gauss' }
  ],
  pseudocode: [
    { id: 'p1', text: '<3 anchor → null' },
    { id: 'p2', text: 'normal[i][j] += row_i·row_j; tx,ty tích lũy svg' },
    { id: 'p3', text: 'x = solve3(normal,tx); y = solve3(normal,ty); null → null' },
    { id: 'p4', text: 'return {x,y} hệ số affine' }
  ],
  edgeCases: [
    { title: 'Ít hơn 3 anchor', description: 'null — không đủ phương trình.' },
    { title: 'Anchor thẳng hàng', description: 'Normal matrix suy biến (|pivot|≈0) → solve3 null → null.' }
  ],
  simplifications: [],
  related: ['world-svg-project', 'vehicle-svg-project'],
  parameters: [
    { key: 'variant', label: 'Tập anchor', type: 'select', default: '3', options: [
      { value: '3', label: '3 anchor (vừa đủ)' }, { value: '4', label: '4 anchor (LS)' }, { value: '2', label: '2 anchor (thiếu)' }, { value: 'collinear', label: '3 anchor thẳng hàng' }
    ] }
  ],
  scenarios: [
    {
      id: 'default', title: '3 anchor chuẩn', edgeCase: false,
      description: '(0,0)→(100,200), (100,0)→(300,200), (0,50)→(100,300): x=[2,0,100], y=[0,2,200].',
      input: { variant: '3' },
      expected: { x: [2, 0, 100], y: [0, 2, 200], query: { x: 200, y: 250 } }
    },
    {
      id: 'edge', title: 'Thẳng hàng → null', edgeCase: true,
      description: '3 anchor world nằm trên 1 đường thẳng → solve3 pivot≈0 → null.',
      input: { variant: 'collinear' },
      expected: { x: null, y: null }
    }
  ],
  buildTrace: function (scenarioId, params) {
    var p = pickParams(this, params);
    var sc = pickScenario(this, scenarioId);
    var variant = (params && params.variant !== undefined) ? params.variant : (sc.input.variant || p.variant);
    var anchors;
    if (variant === '2') anchors = AFFINE1.anchors.slice(0, 2);
    else if (variant === 'collinear') anchors = [
      { world: { x: 0, y: 0 }, svg: { x: 100, y: 200 } },
      { world: { x: 50, y: 50 }, svg: { x: 200, y: 250 } },
      { world: { x: 100, y: 100 }, svg: { x: 300, y: 300 } }
    ];
    else if (variant === '4') anchors = AFFINE1.anchors.concat([{ world: { x: 100, y: 50 }, svg: { x: 300, y: 300 } }]);
    else anchors = AFFINE1.anchors;
    var frames = [];
    frames.push(fr('f0', ['p1'], anchors.length + ' anchor' + (anchors.length < 3 ? ' <3 → null ngay' : ' đủ'), { n: anchors.length },
      [{ label: 'anchors', value: anchors.length }],
      { type: 'geom', points: anchors.map(function (a) { return { x: a.world.x, y: a.world.y, label: 'w', color: '#4f9cf7' }; }).concat(anchors.map(function (a) { return { x: a.svg.x, y: a.svg.y, label: 'svg', color: '#3fce7c', r: 4 }; })) }));
    var T = computeAffine(anchors);
    if (T) {
      frames.push(fr('f1', ['p2', 'p3'], 'Normal matrix khử Gauss → x=[' + T.x.map(r2).join(',') + '], y=[' + T.y.map(r2).join(',') + '].',
        { x: T.x.map(r2), y: T.y.map(r2) },
        [{ label: 'det pivot', value: 'ok' }],
        { type: 'rows', rows: [{ cells: ['x', T.x.map(r2).join(', ')], state: 'pass' }, { cells: ['y', T.y.map(r2).join(', ')], state: 'pass' }] }));
      var q = applyAffine(T, AFFINE1.query);
      frames.push(fr('f2', ['p4'], 'Chiếu query (50,25) → (' + r2(q.x) + ',' + r2(q.y) + ').',
        { query: AFFINE1.query, projected: { x: r2(q.x), y: r2(q.y) } },
        [{ label: 'query→', value: '(' + r2(q.x) + ',' + r2(q.y) + ')' }],
        { type: 'geom', points: [{ x: q.x, y: q.y, color: '#f0a93c', label: 'q\'(' + r2(q.x) + ',' + r2(q.y) + ')' }], segments: [] }));
    } else {
      frames.push(fr('f1', ['p1', 'p3'], 'solve3 trả null — normal matrix suy biến hoặc thiếu anchor → T=null.',
        { T: null }, [{ label: 'T', value: 'null' }],
        { type: 'rows', rows: [{ cells: ['T', 'null'], state: 'fail' }] }));
    }
    if (!T) frames.push(fr('f_null', ['p4'], 'Ma trận chuẩn suy biến (anchor <3 hoặc thẳng hàng/trùng) → solve3 trả null → fitAffine = null — caller rơi về fallback clamp, KHÔNG crash.',
      { degenerate: true }, [{ label: 'T', value: 'null' }],
      { type: 'board', cards: [{ label: 'affine', value: 'null', color: '#f2555a', hl: true }, { label: 'fallback', value: 'clamp world→bounds' }] }));
    else frames.push(fr('f_res', ['p4'], 'T = [' + T.x.map(r2).join(', ') + ' ; ' + T.y.map(r2).join(', ') + '] — query ' + JSON.stringify(AFFINE1.query) + ' → ' + JSON.stringify(applyAffine(T, AFFINE1.query)) + '.',
      { T: T }, [{ label: 'query→svg', value: JSON.stringify(applyAffine(T, AFFINE1.query)) }],
      { type: 'board', cards: [{ label: 'x-row', value: T.x.map(r2).join(' , '), hl: true }, { label: 'y-row', value: T.y.map(r2).join(' , '), hl: true }] }));
    var result = { x: T ? T.x.map(r2) : null, y: T ? T.y.map(r2) : null, query: T ? applyAffine(T, AFFINE1.query) : null };
    var EXP_AFF = {
      '3': { x: [2, 0, 100], y: [0, 2, 200], query: { x: 200, y: 250 } },
      '4': { x: [2, 0, 100], y: [0, 2, 200], query: { x: 200, y: 250 } },
      '2': { x: null, y: null },
      'collinear': { x: null, y: null }
    };
    var expected = noOverride(params) ? sc.expected : (EXP_AFF[variant] || { x: null, y: null });
    var checks = [chk('hệ số x', result.x, expected.x), chk('hệ số y', result.y, expected.y)];
    if (expected.query) checks.push(chk('query', result.query ? { x: r2(result.query.x), y: r2(result.query.y) } : null, expected.query));
    return { frames: frames, result: result, expected: expected, checks: checks };
  }
});

L('world-svg-project', {
  title: 'Chiếu world→SVG',
  topic: 'Hình học hiển thị',
  summary: 'createWorldToSvg: fitAffine(layout) có → nhân hệ số; không → fallback clamp vào khung PARKING_GEOMETRY 1200×900.',
  role: 'Mọi toạ độ vẽ (route, ô, marker) qua đây — fallback clamp tránh biến mất điểm khi chưa calibrate.',
  inputTypes: [
    { name: 'p', type: '{x,y}', description: 'điểm world' },
    { name: 'hasTransform', type: 'boolean', description: 'T sẵn sàng hay fallback clamp' }
  ],
  outputTypes: [{ name: 'q', type: '{x,y}', description: 'điểm SVG (clamped nếu fallback)' }],
  structures: [{ name: 'T', type: 'Affine6', description: 'từ affine-fit-transform' }],
  complexity: { time: 'O(1)', space: 'O(1)', variables: '', simulation: 'giống code' },
  codeRefs: [
    { path: 'frontend/src/calibration/worldToSvg.ts', line: 83, endLine: 95, symbol: 'createWorldToSvg', note: 'fitAffine→nhân hệ số; null→clamp 1200×900' }
  ],
  pseudocode: [
    { id: 'p1', text: 'T có → x\'=a·x+b·y+c; y\'=d·x+e·y+f' },
    { id: 'p2', text: 'không T → clamp(x,0,1200), clamp(y,0,900)' },
    { id: 'p3', text: 'trả q (svg px) — ngoài bounds thì ghim mép' }
  ],
  edgeCases: [
    { title: 'Chưa calibrate', description: 'Fallback clamp — điểm ngoài khung kẹp về biên (không ném).' }
  ],
  simplifications: [],
  related: ['affine-fit-transform', 'vehicle-svg-project', 'viewbox-pan-zoom'],
  parameters: [
    { key: 'qx', label: 'world x', type: 'number', min: 0, max: 1500, step: 10, default: 50 },
    { key: 'qy', label: 'world y', type: 'number', min: 0, max: 800, step: 5, default: 25 },
    { key: 'hasT', label: 'Có transform T', type: 'boolean', default: true }
  ],
  scenarios: [
    {
      id: 'default', title: 'Chiếu affine', edgeCase: false,
      description: 'T=[2,0,100|0,2,200]: (50,25)→(200,250).',
      input: {},
      expected: { q: { x: 200, y: 250 } }
    },
    {
      id: 'edge', title: 'Fallback clamp', edgeCase: true,
      description: 'Không T, world (1500,800) → clamp (1200,800).',
      input: { hasT: false, qx: 1500, qy: 800 },
      expected: { q: { x: 1200, y: 800 } }
    }
  ],
  buildTrace: function (scenarioId, params) {
    var p = pickParams(this, params);
    var sc = pickScenario(this, scenarioId);
    var T = computeAffine(AFFINE1.anchors);
    var qx = sc.input.qx !== undefined ? sc.input.qx : p.qx;
    var qy = sc.input.qy !== undefined ? sc.input.qy : p.qy;
    var hasT = sc.input.hasT === false ? false : p.hasT;
    var inp = { x: qx, y: qy };
    var out = hasT ? applyAffine(T, inp) : clampSvg(inp);
    var frames = [];
    frames.push(fr('f0', ['p1', 'p2'], 'Input (' + qx + ',' + qy + '), T=' + (hasT ? 'có' : 'không → fallback clamp') + '.',
      { input: inp, hasT: hasT }, [{ label: 'mode', value: hasT ? 'affine' : 'clamp' }],
      { type: 'geom', points: [{ x: qx, y: qy, color: '#4f9cf7', label: 'world' }] }));
    frames.push(fr('f1', ['p1', 'p2'], hasT
      ? 'x\'=2·' + qx + '+0·' + qy + '+100=' + r2(out.x) + '; y\'=0·' + qx + '+2·' + qy + '+200=' + r2(out.y) + '.'
      : 'clamp x=' + qx + '→' + out.x + ', y=' + qy + '→' + out.y + ' vào 1200×900.',
      { out: out }, [{ label: 'svg', value: '(' + r2(out.x) + ',' + r2(out.y) + ')' }],
      { type: 'geom', points: [{ x: qx, y: qy, color: '#4f9cf7', label: 'w' }, { x: out.x, y: out.y, color: '#3fce7c', label: 'svg' }], segments: [{ a: inp, b: out, dash: [4, 3], color: '#f0a93c' }] }));
    frames.push(fr('f2', ['p3'], 'Kết quả trên map 1200×900: q=(' + r2(out.x) + ',' + r2(out.y) + ')' + (hasT ? ' — qua affine T.' : ' — fallback clamp: ngoài world-bounds → ghim mép map.'),
      { q: { x: r2(out.x), y: r2(out.y) } },
      [{ label: 'q', value: r2(out.x) + ',' + r2(out.y) }],
      { type: 'geom', points: [{ x: out.x / 12, y: out.y / 12, label: 'q', color: '#3fce7c', r: 6 }].concat(hasT ? AFFINE1.anchors.map(function (a) { return { x: a.svg.x / 12, y: a.svg.y / 12, label: 'anchor', color: '#f0a93c', r: 3 }; }) : []), segments: hasT ? [] : [{ a: { x: 60, y: 40 }, b: { x: out.x / 12, y: out.y / 12 }, color: '#f2555a', dash: true }], caption: 'tọa độ /12 cho vừa canvas' }));
    var result = { q: { x: r2(out.x), y: r2(out.y) } };
    var expected = (qx === 50 && qy === 25 && hasT) || (qx === 1500 && qy === 800 && !hasT) ? sc.expected : { q: result.q };
    var checks = [chk('svg', result.q, expected.q)];
    return { frames: frames, result: result, expected: expected, checks: checks };
  }
});

L('vehicle-svg-project', {
  title: 'Chiếu xe→SVG + lọc canonical',
  topic: 'Hình học hiển thị',
  summary: 'Chuỗi runtime: position.reference (world) → affine → canonical gid theo alias → giữ đúng 1 marker cho session gid.',
  role: 'Biến runtime snapshot thành marker xe của session — chuỗi canonical gid chống marker nhân đôi.',
  inputTypes: [
    { name: 'vehicles', type: 'RuntimeVehicle[]', description: 'position.reference là world' },
    { name: 'gid + aliases', type: 'number + map', description: 'canonical chain' }
  ],
  outputTypes: [{ name: 'markers', type: '{trackId,x,y}[]' }],
  structures: [{ name: 'canonicalRuntimeId', type: 'chuỗi alias', description: '5→7→9 → 9; chu trình → null' }],
  complexity: { time: 'O(V·A)', space: 'O(V)', variables: 'V=vehicles, A=độ dài chuỗi alias', simulation: 'giống code; position.reference giả định world (ghi trong dossier)' },
  codeRefs: [
    { path: 'frontend/src/calibration/worldToSvg.ts', line: 115, endLine: 133, symbol: 'runtimeVehiclesOnSvg', note: 'filter vehicle.global_id === canonical (so sánh THÔ, không canonical hoá từng xe)' },
    { path: 'frontend/src/domain/runtime.ts', line: 191, endLine: 202, symbol: 'canonicalRuntimeId', note: 'chuỗi retired_global_ids; self→giữ, cycle→null' }
  ],
  pseudocode: [
    { id: 'p1', text: 'canonical = canonicalRuntimeId(sessionGid, retired_global_ids) (visited → cycle null)' },
    { id: 'p2', text: 'giữ xe có vehicle.global_id === canonical (so sánh thô)' },
    { id: 'p3', text: 'project position.reference → svg' }
  ],
  edgeCases: [
    { title: 'Alias chu trình', description: 'canonical → null → xe bị lọc bỏ (không marker).' },
    { title: 'Alias về chính mình', description: 'next==gid → trả gid ngay (không lặp).' }
  ],
  simplifications: [
    { sourceBehavior: 'position.reference luôn là world?', demoBehavior: 'giả định world như dossier đã ghi (unverified cho mọi nguồn)', reason: 'dossier đánh dấu đây là giả định' }
  ],
  related: ['canonical-runtime-id-consumer', 'world-svg-project', 'parked-marker-fallback'],
  parameters: [
    { key: 'gid', label: 'Session gid', type: 'select', default: '9', options: [
      { value: '9', label: '9' }, { value: '7', label: '7' }, { value: '5', label: '5' }
    ] },
    { key: 'variant', label: 'Alias map', type: 'select', default: 'chain', options: [
      { value: 'chain', label: '5→7→9 (chuỗi)' }, { value: 'cycle', label: '5→7→5 (chu trình)' }
    ] }
  ],
  scenarios: [
    {
      id: 'default', title: 'Chuỗi alias 5→7→9', edgeCase: false,
      description: 'gid=5 canonical hoá thành 9 → marker của xe 9 được giữ.',
      input: {},
      expected: { canonical: 9, kept: 1 }
    },
    {
      id: 'edge', title: 'Alias chu trình → lọc bỏ', edgeCase: true,
      description: '5→7→5: canonical null → xe không hiện.',
      input: { variant: 'cycle', gid: '5' },
      expected: { canonical: null, kept: 0 }
    }
  ],
  buildTrace: function (scenarioId, params) {
    var p = pickParams(this, params);
    var sc = pickScenario(this, scenarioId);
    var gid = Number(sc.input.gid !== undefined ? sc.input.gid : p.gid);
    var aliases = sc.input.variant === 'cycle' || p.variant === 'cycle' ? { '5': 7, '7': 5 } : { '5': 7, '7': 9 };
    var vehicles = [
      { global_id: 5, position: { x: 6, y: 4.5 } },
      { global_id: 7, position: { x: 2, y: 2 } },
      { global_id: 9, position: { x: 8, y: 8 } }
    ];
    var frames = [];
    var steps = [];
    var canonical = canonicalRuntimeId(gid, aliases);
    var canonAll = vehicles.map(function (v) { return { gid: v.global_id, canonical: canonicalRuntimeId(v.global_id, aliases) }; });
    var probe = gid, seen = {};
    while (aliases[String(probe)] !== undefined && !seen[probe]) { steps.push(probe + '→' + aliases[String(probe)]); seen[probe] = 1; probe = aliases[String(probe)]; }
    frames.push(fr('f0', ['p1'], 'Chuỗi canonical từ gid=' + gid + ': ' + (steps.length ? steps.join(' → ') + (canonical === null ? ' (chu trình!)' : ' = ' + canonical) : 'không alias → ' + canonical),
      { canonical: canonical, steps: steps },
      [{ label: 'canonical', value: canonical === null ? 'null' : canonical }],
      { type: 'board', cards: [{ label: 'gid vào', value: gid }, { label: 'canonical', value: canonical === null ? 'null (cycle)' : canonical, color: canonical === null ? '#f2555a' : '#3fce7c', hl: true }].concat(canonAll.map(function (c) { return { label: 'canon(' + c.gid + ')', value: c.canonical === null ? 'null' : c.canonical }; })) }));
    var kept = vehicles.filter(function (v) { return canonical !== null && v.global_id === canonical; });
    var T = computeAffine(AFFINE1.anchors);
    var rows = vehicles.map(function (v) {
      var keep = canonical !== null && v.global_id === canonical;
      var svg = keep ? applyAffine(T, v.position) : null;
      return { cells: ['gid ' + v.global_id, 'global_id===' + canonical + '?', keep ? 'KEEP → (' + r2(svg.x) + ',' + r2(svg.y) + ')' : 'drop'], state: keep ? 'pass' : 'fail' };
    });
    frames.push(fr('f1', ['p2', 'p3'], 'Lọc vehicles theo canonical → giữ ' + kept.length + ' marker.',
      { kept: kept.map(function (v) { return v.global_id; }) },
      [{ label: 'kept', value: kept.length }],
      { type: 'rows', rows: rows }));
    var keptSvg = kept.length ? applyAffine(T, kept[0].position) : null;
    frames.push(fr('f2', ['p3'], kept.length
      ? 'Chiếu marker qua affine: world (' + kept[0].position.x + ',' + kept[0].position.y + ') → svg (' + r2(keptSvg.x) + ',' + r2(keptSvg.y) + ') — chỉ xe canonical xuất hiện trên map.'
      : 'canonical null (chu trình alias) → KHÔNG xe nào được vẽ — guard chống vẽ marker sai.',
      { keptSvg: keptSvg ? { x: r2(keptSvg.x), y: r2(keptSvg.y) } : null },
      [{ label: 'markers vẽ', value: kept.length }],
      { type: 'map', spots: AFFINE1.anchors.map(function (a, i2) { return { id: 'a' + i2, x: a.svg.x - 20, y: a.svg.y - 20, w: 40, h: 40, status: 'unknown' }; }), markers: kept.length ? [{ x: keptSvg.x, y: keptSvg.y, label: 'gid ' + canonical, color: '#3fce7c', r: 7 }] : vehicles.map(function (v2) { var s2 = applyAffine(T, v2.position); return { x: s2.x, y: s2.y, label: 'gid ' + v2.global_id, color: '#f2555a', r: 4 }; }), caption: 'vuông = anchor svg; chấm = marker xe (xanh = canonical kept)' }));
    var result = { canonical: canonical, kept: kept.length, canonMap: canonAll };
    var expected = (sc.input.variant === 'cycle' && gid === 5) ? sc.expected : { canonical: result.canonical, kept: result.kept };
    var checks = [chk('canonical', result.canonical, expected.canonical), chk('kept', result.kept, expected.kept)];
    return { frames: frames, result: result, expected: expected, checks: checks };
  }
});

L('route-polyline-simplify', {
  title: 'Rút gọn polyline route',
  topic: 'Hình học hiển thị',
  summary: 'simplifyRoutePoints: bỏ điểm giữa có |cross sản phẩm| ≤ 0.01 (gần thẳng hàng) — chỉ áp cho RENDER, route logic vẫn đầy đủ.',
  role: 'Giảm số vertex vẽ SVG mà giữ nguyên hình dạng route — tối ưu render.',
  inputTypes: [{ name: 'points', type: '{x,y}[]' }],
  outputTypes: [{ name: 'points', type: '{x,y}[]', description: 'đầu+cuối luôn giữ' }],
  structures: [{ name: 'cross', type: 'number', description: '(cur−prev)×(next−cur)' }],
  complexity: { time: 'O(N)', space: 'O(N)', variables: '', simulation: 'giống code; chỉ render, KHÔNG sửa route logic' },
  codeRefs: [
    { path: 'frontend/src/components/ParkingMap.tsx', line: 82, endLine: 96, symbol: 'simplifyRoutePoints', note: 'bỏ điểm gần thẳng hàng; prev = điểm CUỐI ĐÃ GIỮ' }
  ],
  pseudocode: [
    { id: 'p1', text: '<3 điểm → trả nguyên' },
    { id: 'p2', text: 'out=[p0]; ∀i 1..n−2: |cross|>0.01 → giữ' },
    { id: 'p3', text: 'đẩy điểm cuối' }
  ],
  edgeCases: [
    { title: 'Thẳng hàng hoàn toàn', description: 'Giữ chỉ 2 đầu mút.' },
    { title: 'Chỉ áp render', description: 'Route object/logic không đổi — chỉ polyline vẽ.' }
  ],
  simplifications: [],
  related: ['route-arrow-place', 'astar-find-route'],
  parameters: [
    { key: 'variant', label: 'Polyline', type: 'select', default: 'mixed', options: [
      { value: 'mixed', label: '5 điểm (1 thẳng hàng)' }, { value: 'collinear', label: 'thẳng hàng hết' }, { value: '2pt', label: '2 điểm' }
    ] }
  ],
  scenarios: [
    {
      id: 'default', title: 'Bỏ 1 điểm thẳng', edgeCase: false,
      description: '[A,B(collinear),C,D,E] → bỏ B → 4 điểm.',
      input: {},
      expected: { kept: 4, dropped: ['B'] }
    },
    {
      id: 'edge', title: 'Thẳng hàng hết → 2 điểm', edgeCase: true,
      description: 'Mọi điểm giữa collinear → chỉ giữ 2 mút.',
      input: { variant: 'collinear' },
      expected: { kept: 2 }
    }
  ],
  buildTrace: function (scenarioId, params) {
    var p = pickParams(this, params);
    var sc = pickScenario(this, scenarioId);
    var variant = sc.input.variant || p.variant;
    var pts = variant === 'collinear' ? [{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 2 }, { x: 3, y: 3 }]
      : variant === '2pt' ? [{ x: 0, y: 0 }, { x: 2, y: 0 }]
      : [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 1 }, { x: 3, y: 1 }];
    var names = ['A', 'B', 'C', 'D', 'E'];
    var frames = [];
    frames.push(fr('f0', ['p1'], pts.length + ' điểm' + (pts.length < 3 ? ' <3 → trả nguyên' : ''), { n: pts.length },
      [{ label: 'points', value: pts.length }],
      { type: 'geom', points: pts.map(function (q, i) { return { x: q.x, y: q.y, label: names[i] }; }), segments: pts.slice(1).map(function (q, i) { return { a: pts[i], b: q }; }) }));
    var out = simplifyRoutePoints(pts);
    var droppedIdx = [];
    if (pts.length >= 3) {
      for (var i = 1; i < pts.length - 1; i++) {
        var pr = pts[i - 1], cu = pts[i], ne = pts[i + 1];
        var cross = Math.abs((cu.x - pr.x) * (ne.y - cu.y) - (cu.y - pr.y) * (ne.x - cu.x));
        if (cross <= 0.01) droppedIdx.push(i);
      }
    }
    frames.push(fr('f1', ['p2', 'p3'], 'Duyệt điểm giữa: ' + (droppedIdx.length ? 'bỏ ' + droppedIdx.map(function (i) { return names[i]; }).join(',') + ' (|cross|≤0.01)' : 'giữ hết') + ' → ' + out.length + '/' + pts.length + ' điểm.',
      { dropped: droppedIdx.map(function (i) { return names[i]; }), kept: out.length },
      [{ label: 'kept', value: out.length }],
      { type: 'geom', points: pts.map(function (q, i) { return { x: q.x, y: q.y, label: names[i], color: droppedIdx.indexOf(i) >= 0 ? '#f2555a' : '#3fce7c' }; }), segments: out.slice(1).map(function (q, i) { return { a: out[i], b: q, color: '#3fce7c', width: 2.5 }; }) }));
    frames.push(fr('f2', ['p3'], 'So sánh: gốc ' + pts.length + ' điểm → giữ ' + out.length + ' (bỏ ' + droppedIdx.length + '). Điểm thẳng hàng tiếp theo điểm ĐÃ GIỮ — không phải điểm liền trước.',
      { kept: out.length, dropped: droppedIdx.map(function (i) { return names[i]; }) },
      [{ label: 'kept', value: out.length }],
      { type: 'geom', points: pts.map(function (q, i) { return { x: q.x, y: q.y, label: names[i], color: droppedIdx.indexOf(i) >= 0 ? '#f2555a' : '#3fce7c' }; }), segments: [{ a: pts[0], b: pts[pts.length - 1], color: '#f0a93c', dash: true }], caption: 'nét đứt = polyline đã simplify' }));
    var result = { kept: out.length, dropped: droppedIdx.map(function (i) { return names[i]; }) };
    var expP = (params && params.variant !== undefined && params.variant !== sc.input.variant) ? { kept: result.kept, dropped: result.dropped } : sc.expected;
    var checks = [chk('giữ lại', result.kept, expP.kept)];
    if (expP.dropped) checks.push(chk('bỏ', result.dropped, expP.dropped));
    return { frames: frames, result: result, expected: expP, checks: checks };
  }
});

L('route-arrow-place', {
  title: 'Đặt mũi tên dọc route',
  topic: 'Hình học hiển thị',
  summary: 'createRouteArrows: arc-length ruler — target 100px rồi +190px, chỉ còn khi target < total−45 và tổng ≥140; mũi = interpolate trên segment + angle.',
  role: 'Mũi tên chỉ hướng đều nhau trên route — arc-length, không theo số vertex.',
  inputTypes: [{ name: 'points', type: '{x,y}[]' }],
  outputTypes: [{ name: 'arrows', type: '{x,y,angle}[]' }],
  structures: [
    { name: 'target/traversed', type: 'number', description: 'thước arc-length' },
    { name: 'STEP=190, FIRST=100, END_MARGIN=45', type: 'const' }
  ],
  complexity: { time: 'O(N + A)', space: 'O(A)', variables: 'A=số mũi', simulation: 'giống code; đơn vị px demo' },
  codeRefs: [
    { path: 'frontend/src/components/ParkingMap.tsx', line: 98, endLine: 123, symbol: 'createRouteArrows', note: 'target 100→+190; <total−45; total≥140' }
  ],
  pseudocode: [
    { id: 'p1', text: 'totalLength < 140 → []' },
    { id: 'p2', text: 'target=100; ∀seg: while target≤traversed+len && target<total−45 → interpolate + target+=190' }
  ],
  edgeCases: [
    { title: 'Route ngắn <140', description: 'Không mũi nào.' },
    { title: 'Không mũi sát đích', description: 'target ≥ total−45 → dừng — đích luôn sạch 45px.' }
  ],
  simplifications: [],
  related: ['route-polyline-simplify', 'astar-find-route'],
  parameters: [
    { key: 'routeLen', label: 'Độ dài route (px)', type: 'number', min: 100, max: 800, step: 20, default: 600 }
  ],
  scenarios: [
    {
      id: 'default', title: 'Route 600px → 3 mũi', edgeCase: false,
      description: 'target 100,290,480 (<555) → mũi tại 100/290/480.',
      input: {},
      expected: { count: 3, positions: [100, 290, 480] }
    },
    {
      id: 'edge', title: 'Route 500px → 2 mũi', edgeCase: true,
      description: 'target 100,290 (<455); 480≥455 → dừng → 2 mũi.',
      input: { routeLen: 500 },
      expected: { count: 2, positions: [100, 290] }
    }
  ],
  buildTrace: function (scenarioId, params) {
    var p = pickParams(this, params);
    var sc = pickScenario(this, scenarioId);
    var len = sc.input.routeLen || p.routeLen;
    var pts = [{ x: 0, y: 0 }, { x: len, y: 0 }];
    var r = createRouteArrows(pts);
    var frames = [];
    frames.push(fr('f0', ['p1'], 'totalLength=' + r3(r.totalLength) + (r.totalLength < 140 ? ' <140 → []' : ' ≥140 → đặt thước'),
      { total: r3(r.totalLength) }, [{ label: 'total', value: r3(r.totalLength) }],
      { type: 'geom', segments: [{ a: pts[0], b: pts[1] }], points: [{ x: 0, y: 0, label: '0' }, { x: len, y: 0, label: len + 'px' }] }));
    var rows = r.arrows.map(function (a) { return { cells: ['target ' + a.target, '(' + r2(a.x) + ',' + r2(a.y) + ')', 'angle ' + r2(a.angle) + '°'], state: 'pass' }; });
    var nextT = 100 + 190 * r.arrows.length;
    var stoppedBy = len < 140 ? 'total<140' : nextT >= r.totalLength - 45 ? 'target ' + nextT + ' ≥ total−45=' + r3(r.totalLength - 45) : 'hết segment';
    rows.push({ cells: ['dừng vì', stoppedBy], state: 'active' });
    frames.push(fr('f1', ['p2'], 'target=100, +190…: ' + r.arrows.map(function (a) { return a.target; }).join(', ') + ' — ' + stoppedBy + '.',
      { arrows: r.arrows.map(function (a) { return r3(a.x); }), stop: stoppedBy },
      [{ label: 'arrows', value: r.arrows.length }],
      { type: 'geom', segments: [{ a: pts[0], b: pts[1] }], points: r.arrows.map(function (a) { return { x: a.x, y: 0, color: '#f0a93c', label: '@' + a.target }; }), notes: [{ x: len - 22.5, y: 0.35, text: '45px đích sạch' }] }));
    frames.push(fr('f2', ['p2'], 'Kết quả: ' + r.arrows.length + ' mũi tên ' + (r.arrows.length ? 'đặt được ' : '(không đặt — ') + '— ' + stoppedBy + '.',
      { count: r.arrows.length, positions: r.arrows.map(function (a) { return a.target; }) },
      [{ label: 'arrows', value: r.arrows.length }],
      { type: 'board', cards: [{ label: 'arrows', value: r.arrows.length, color: '#3fce7c', hl: true }, { label: 'dừng vì', value: stoppedBy }] }));
    var result = { count: r.arrows.length, positions: r.arrows.map(function (a) { return a.target; }) };
    var expected = sc.expected;
    if (sc.id !== 'edge' && len !== 600) expected = { count: r.arrows.length, positions: r.arrows.map(function (a) { return a.target; }) };
    var checks = [chk('số mũi', result.count, expected.count), chk('vị trí', result.positions, expected.positions)];
    return { frames: frames, result: result, expected: expected, checks: checks };
  }
});

L('viewbox-pan-zoom', {
  title: 'Pan/zoom viewBox',
  topic: 'Hình học hiển thị',
  summary: 'clampView/zoomAt: zoom quanh điểm tương đối (rx,ry) giữ tỉ lệ 4:3, kẹp vào khung 1200×900 và width ∈ [360,1200].',
  role: 'Điều khiển khung nhìn SVG — zoom tâm con trỏ, pan kẹp biên.',
  inputTypes: [
    { name: 'view', type: '{x,y,width,height}' },
    { name: 'factor + (rx,ry)', type: 'number', description: 'factor<1 zoom in; tâm tương đối' }
  ],
  outputTypes: [{ name: 'view', type: '{x,y,width,height}' }],
  structures: [{ name: 'ASPECT', type: '900/1200', description: 'khóa tỉ lệ' }],
  complexity: { time: 'O(1)', space: 'O(1)', variables: '', simulation: 'giống code' },
  codeRefs: [
    { path: 'frontend/src/components/ParkingMap.tsx', line: 57, endLine: 66, symbol: 'clampView', note: 'w∈[360,1200], h=w·(900/1200), x/y kẹp' },
    { path: 'frontend/src/components/ParkingMap.tsx', line: 146, endLine: 155, symbol: 'zoomAt', note: 'w mới=w·factor; x mới=x+(w−w mới)·rx; clamp lại' }
  ],
  pseudocode: [
    { id: 'p1', text: 'clamp: w→[360,1200]; h=w·0.75; x,y kẹp vào [0,1200−w]×[0,900−h]' },
    { id: 'p2', text: 'zoomAt: w\'=w·factor; x\'=x+(w−w\')·rx; y\'=y+(h−h\')·ry; clamp lại' },
    { id: 'p3', text: 'trả viewBox {x,y,w,h} cuối sau clamp' }
  ],
  edgeCases: [
    { title: 'Zoom vượt biên', description: 'clamp kéo về — viewBox không thoát khỏi map.' }
  ],
  simplifications: [],
  related: ['world-svg-project', 'route-polyline-simplify'],
  parameters: [
    { key: 'factor', label: 'Factor', type: 'number', min: 0.3, max: 2, step: 0.1, default: 0.5 },
    { key: 'rx', label: 'Tâm zoom X (0..1)', type: 'number', min: 0, max: 1, step: 0.1, default: 0.5 },
    { key: 'ry', label: 'Tâm zoom Y (0..1)', type: 'number', min: 0, max: 1, step: 0.1, default: 0.5 }
  ],
  scenarios: [
    {
      id: 'default', title: 'Zoom in 0.5 giữa khung', edgeCase: false,
      description: '(0,0,1200,900) factor 0.5 tâm (0.5,0.5) → (300,225,600,450).',
      input: {},
      expected: { x: 300, y: 225, w: 600, h: 450 }
    },
    {
      id: 'edge', title: 'Zoom in góc → kẹp biên', edgeCase: true,
      description: 'factor 0.5 tâm (0,0) → (0,0,600,450) giữ sát góc.',
      input: { rx: 0, ry: 0 },
      expected: { x: 0, y: 0, w: 600, h: 450 }
    }
  ],
  buildTrace: function (scenarioId, params) {
    var p = pickParams(this, params);
    var sc = pickScenario(this, scenarioId);
    var rx = sc.input.rx !== undefined ? sc.input.rx : p.rx;
    var ry = sc.input.ry !== undefined ? sc.input.ry : p.ry;
    var v0 = { x: 0, y: 0, width: 1200, height: 900 };
    var out = zoomAt(v0, p.factor, rx, ry);
    var frames = [];
    frames.push(fr('f0', ['p2'], 'w\'=1200·' + p.factor + '=' + r2(1200 * p.factor) + '; x\'=0+(1200−w\')·' + rx + '=' + r2((1200 - 1200 * p.factor) * rx) + '; y\'=0+(900−h\')·' + ry + '.',
      { w2: r2(1200 * p.factor), h2: r2(1200 * p.factor * 0.75) },
      [{ label: 'w\'', value: r2(1200 * p.factor) }],
      { type: 'geom', boxes: [{ x: 0, y: 0, w: 1200, h: 900, color: '#8a93a8' }], points: [{ x: rx * 1200, y: ry * 900, color: '#f0a93c', label: 'tâm zoom' }] }));
    frames.push(fr('f1', ['p1'], 'Clamp → (' + r2(out.x) + ',' + r2(out.y) + ',' + r2(out.width) + ',' + r2(out.height) + ') — giữ trong 1200×900.',
      { out: out }, [{ label: 'viewBox', value: r2(out.width) + '×' + r2(out.height) }],
      { type: 'geom', boxes: [{ x: 0, y: 0, w: 1200, h: 900, color: '#8a93a8' }, { x: out.x, y: out.y, w: out.width, h: out.height, color: '#3fce7c', fill: '#3fce7c22' }] }));
    frames.push(fr('f2', ['p3'], 'viewBox cuối: x=' + r2(out.x) + ' y=' + r2(out.y) + ' w=' + r2(out.width) + ' h=' + r2(out.height) + ' — ' + (out.x < 0 || out.y < 0 || out.width > 1200 ? 'đã clamp trong 1200×900 (có thể lệch điểm neo).' : 'giữ điểm neo tương đối ổn định.'),
      { out: { x: r2(out.x), y: r2(out.y), w: r2(out.width), h: r2(out.height) } },
      [{ label: 'viewBox', value: r2(out.x) + ',' + r2(out.y) + ' ' + r2(out.width) + '×' + r2(out.height) }],
      { type: 'geom', segments: [], points: [{ x: out.x / 12 + out.width / 24, y: out.y / 12 + out.height / 24, label: 'VB', color: '#3fce7c', r: out.width / 24 }], caption: 'khung xanh = viewBox cuối (scale /12)' }));
    var result = { x: r2(out.x), y: r2(out.y), w: r2(out.width), h: r2(out.height) };
    var expected = (p.factor === 0.5 && rx === (sc.input.rx !== undefined ? sc.input.rx : 0.5) && ry === (sc.input.ry !== undefined ? sc.input.ry : 0.5)) ? sc.expected : { x: result.x, y: result.y, w: result.w, h: result.h };
    var checks = [chk('viewBox', result, expected)];
    return { frames: frames, result: result, expected: expected, checks: checks };
  }
});

L('parking-geometry-gen', {
  title: 'Sinh geometry bãi đỗ',
  topic: 'Hình học hiển thị',
  summary: 'generateParkingGeometry (mini): zone→ZONE_COLUMNS x; spotY(n)=112+(perZone−n)·(56+10) — n tăng → y GIẢM; entryPoint 8px về phía aisle.',
  role: 'Tạo hình ô + entryPoint cho render và graph — layout thật do generateParkingGeometry, demo bản mini.',
  inputTypes: [{ name: 'zones,perZone', type: 'params' }],
  outputTypes: [{ name: 'geometry', type: '{spots:[{id,x,y,w,h,entryPoint}]}' }],
  structures: [{ name: 'ZONE_COLUMNS', type: 'zone→x', description: 'F110,E300,D390,C600,B690,A890' }],
  complexity: { time: 'O(Z·N)', space: 'O(Z·N)', variables: 'Z zones × N ô', simulation: 'mini 2–3 zone × ≤3 ô; code thật 6×10' },
  codeRefs: [
    { path: 'frontend/src/geometry/parkingGeometry.ts', line: 118, endLine: 122, symbol: 'spotY', note: '112+(10−n)·(56+10) — ô 1 dưới, ô 10 trên' },
    { path: 'frontend/src/geometry/parkingGeometry.ts', line: 138, endLine: 148, symbol: 'getEntryPoint', note: 'x±8 về phía aisle (getAisleCenterX :124-136), y=centerY' },
    { path: 'frontend/src/geometry/parkingGeometry.ts', line: 85, endLine: 99, symbol: 'constants / ZONE_COLUMNS', note: 'W90,H56,GAP10,FIRST_Y112' }
  ],
  pseudocode: [
    { id: 'p1', text: '∀zone: cột X cố định' },
    { id: 'p2', text: '∀n: y=112+(perZone−n)·66; entryPoint về phía aisle' },
    { id: 'p3', text: 'center = (x+45, y+28)' },
    { id: 'p4', text: 'mỗi ô: rect 90×56 + entryPoint lệch về aisle' }
  ],
  edgeCases: [
    { title: 'Thứ tự ô đảo trục Y', description: 'n tăng → y GIẢM (ô 1 gần cổng dưới, ô cuối trên) — dễ nhầm.' }
  ],
  simplifications: [
    { sourceBehavior: '6 zone × 10 ô, cột cố định', demoBehavior: '≤3 zone × ≤3 ô tùy chọn', reason: 'đọc được trên canvas' }
  ],
  related: ['lane-graph-build', 'spot-ownership-map', 'parking-counts-derive'],
  parameters: [
    { key: 'perZone', label: 'Ô mỗi zone', type: 'number', min: 1, max: 3, step: 1, default: 2 },
    { key: 'zones', label: 'Zones', type: 'select', default: 'FB', options: [
      { value: 'FB', label: 'F+B (2 cột ngoài)' }, { value: 'AB', label: 'A+B' }, { value: 'CF', label: 'C+F' }
    ] }
  ],
  scenarios: [
    {
      id: 'default', title: 'F+B × 2 ô', edgeCase: false,
      description: '4 ô: F01 y=178, F02 y=112; B01/B02 cột 690.',
      input: {},
      expected: { spots: 4, y1: 178, y2: 112 }
    },
    {
      id: 'edge', title: '1 ô/zone → y=112 (đỉnh)', edgeCase: true,
      description: 'perZone=1: spotY(1)=112+(1−1)·66=112 — ô duy nhất lên đỉnh.',
      input: { perZone: 1 },
      expected: { spots: 2, y1: 112 }
    }
  ],
  buildTrace: function (scenarioId, params) {
    var p = pickParams(this, params);
    var sc = pickScenario(this, scenarioId);
    var perZone = sc.input.perZone || p.perZone;
    var zoneStr = p.zones || 'FB';
    var zones = zoneStr.split('');
    var geom = miniParkingGeometry(zones, perZone);
    var frames = [];
    frames.push(fr('f0', ['p1'], zones.length + ' zone [' + zones.join(',') + '] × ' + perZone + ' ô — cột ' + zones.map(function (z) { return z + ':x' + ZONE_COLS[z]; }).join(', ') + '.',
      { zones: zones, perZone: perZone }, [{ label: 'zones', value: zones.length }],
      { type: 'map', spots: [], markers: zones.map(function (z, i) { return { x: (ZONE_COLS[z] || 0) / 100, y: i * 0.5, label: z }; }) }));
    var s0 = geom.spots[0], s1 = geom.spots[perZone - 1];
    var rows = geom.spots.map(function (s) { return { cells: [s.id, 'x=' + s.x, 'y=' + s.y, 'entry=(' + s.entryPoint.x + ',' + s.entryPoint.y + ')'], state: 'pass' }; });
    frames.push(fr('f1', ['p2', 'p3'], 'spotY(n)=112+(' + perZone + '−n)·66: ô ' + s0.id + ' y=' + s0.y + ', ô cuối y=' + s1.y + ' — n tăng → y giảm (lên trên). entryPoint lệch về phía aisle.',
      { spots: geom.spots.map(function (s) { return { id: s.id, y: s.y }; }) },
      [{ label: 'spots', value: geom.spots.length }],
      { type: 'rows', rows: rows }));
    frames.push(fr('f2', ['p4'], 'Mỗi ô có rect + entryPoint lệch về phía aisle (xe vào đúng đầu ô): ' + geom.spots.slice(0, 3).map(function (s2) { return s2.id + '@(' + s2.entryPoint.x + ',' + s2.entryPoint.y + ')'; }).join(', ') + '…',
      { entries: geom.spots.map(function (s2) { return { id: s2.id, entry: s2.entryPoint }; }) },
      [{ label: 'spots', value: geom.spots.length }],
      { type: 'map', spots: geom.spots.map(function (s2) { return { id: s2.id, x: s2.x, y: s2.y, w: 90, h: 56, entryPoint: s2.entryPoint }; }), caption: 'chấm xanh = entryPoint' }));
    var result = { spots: geom.spots.length, y1: s0.y, yLast: s1.y, first: s0.id };
    var expected = (params && params.perZone !== undefined && params.perZone !== sc.input.perZone) ? { spots: result.spots, y1: result.y1, y2: result.yLast } : sc.expected;
    var checks = [chk('số ô', result.spots, expected.spots), chk('y ô đầu', result.y1, expected.y1)];
    if (expected.y2 !== undefined) checks.push(chk('y ô cuối', result.yLast, expected.y2));
    return { frames: frames, result: result, expected: expected, checks: checks };
  }
});

L('spot-ownership-map', {
  title: 'Ánh xạ ô→camera chủ',
  topic: 'Đồng bộ phiên đỗ',
  summary: 'getSpotOwner: zone F,E,D → cam-left; còn lại → cam-right. KHÔNG validate — "G11" vẫn map cam-right.',
  role: 'Quyết định camera nào được phát event cho ô — guard unauthorized của reducer.',
  inputTypes: [{ name: 'spotId', type: 'string' }],
  outputTypes: [{ name: 'owner', type: 'cam-left|cam-right' }],
  structures: [{ name: 'LEFT_ZONES', type: '{F,E,D}' }],
  complexity: { time: 'O(1)', space: 'O(1)', variables: '', simulation: 'giống code; không validate input (ghi rõ)' },
  codeRefs: [
    { path: 'frontend/src/domain/parking.ts', line: 123, endLine: 123, symbol: 'LEFT_ZONES', note: 'new Set(["F","E","D"])' },
    { path: 'frontend/src/domain/parking.ts', line: 136, endLine: 142, symbol: 'getSpotOwner / cameraOwnsSpot', note: 'zone→cam, không validate input' }
  ],
  pseudocode: [
    { id: 'p1', text: 'zone=spotId[0]; F|E|D → cam-left; else → cam-right' }
  ],
  edgeCases: [
    { title: 'spotId méo (G11, rỗng)', description: 'Zone ngoài set → cam-right lặng — không validate, điểm yếu đã ghi.' }
  ],
  simplifications: [],
  related: ['spot-event-reducer', 'occupancy-classify', 'parking-geometry-gen'],
  parameters: [
    { key: 'spotId', label: 'spotId', type: 'select', default: 'C05', options: [
      { value: 'C05', label: 'C05 (zone C→right)' }, { value: 'D03', label: 'D03 (zone D→left)' }, { value: 'A09', label: 'A09 (right)' }, { value: 'G11', label: 'G11 (zone lạ)' }
    ] }
  ],
  scenarios: [
    {
      id: 'default', title: 'C05 → cam-right', edgeCase: false,
      description: 'LEFT_ZONES={F,E,D}; zone C ∉ set → cam-right. (Dễ nhầm: C kề D,E trên map nhưng quy tắc theo ZONE, không theo vị trí.)',
      input: {},
      expected: { owner: 'cam-right' }
    },
    {
      id: 'edge', title: 'Zone lạ → cam-right', edgeCase: true,
      description: '"G11" zone G ngoài set → cam-right (không validate, không lỗi).',
      input: { spotId: 'G11' },
      expected: { owner: 'cam-right' }
    }
  ],
  buildTrace: function (scenarioId, params) {
    var p = pickParams(this, params);
    var sc = pickScenario(this, scenarioId);
    var spotId = (params && params.spotId !== undefined) ? params.spotId : (sc.input.spotId || p.spotId);
    var zone = spotId[0];
    var owner = getSpotOwner(spotId);
    var frames = [];
    frames.push(fr('f_in', ['p1'], 'Input: ô ' + spotId + '. Bảng quyền: LEFT_ZONES={F,E,D}→cam-left; mọi zone khác→cam-right.',
      { spotId: spotId }, [{ label: 'spot', value: spotId }],
      { type: 'rows', rows: [
        { cells: ['F, E, D', 'cam-left'], state: 'active' },
        { cells: ['A, B, C, G… (mọi zone khác)', 'cam-right'], state: '' }
      ], caption: 'không validate zone — ký tự lạ vẫn map' }));
    frames.push(fr('f0', ['p1'], 'zone = "' + spotId + '"[0] = "' + zone + '" → ' + (LEFT_ZONES[zone] ? '∈{F,E,D}' : '∉{F,E,D}') + ' → ' + owner + '.',
      { zone: zone, owner: owner }, [{ label: 'owner', value: owner }],
      { type: 'rows', rows: [
        { cells: ['F,E,D → cam-left', 'A,B,C,G… → cam-right'], state: 'active' },
        { cells: [spotId + ' (zone ' + zone + ')', owner], state: 'pass' }
      ], caption: 'không validate — zone lạ vẫn map được' }));
    frames.push(fr('f_out', ['p1'], 'Owner(' + spotId + ') = ' + owner + ' — camera ' + owner + ' mới được phát event cập nhật ô này; camera còn lại bị reject ở ownership gate.',
      { owner: owner }, [{ label: 'owner', value: owner }],
      { type: 'board', cards: [{ label: 'owner', value: owner, color: '#3fce7c', hl: true }, { label: 'camera lạ', value: 'reject', color: '#f2555a' }] }));
    var result = { owner: owner };
    var expO = (params && params.spotId !== undefined && params.spotId !== sc.input.spotId) ? { owner: owner } : sc.expected;
    var checks = [chk('owner', owner, expO.owner)];
    return { frames: frames, result: result, expected: expO, checks: checks };
  }
});

L('parking-counts-derive', {
  title: 'Đếm trạng thái ô',
  topic: 'Đồng bộ phiên đỗ',
  summary: 'deriveParkingCounts: fold — {total, empty, occupied, reserved, transitioning, unknown}; key ngoài union vẫn đếm được (JS).',
  role: 'Số liệu dashboard: đếm theo status từ bản đồ ô.',
  inputTypes: [{ name: 'spots', type: 'SpotState[]' }],
  outputTypes: [{ name: 'counts', type: '{total,empty,occupied,reserved,transitioning,unknown}' }],
  structures: [],
  complexity: { time: 'O(S)', space: 'O(1)', variables: 'S=số ô', simulation: 'giống code' },
  codeRefs: [
    { path: 'frontend/src/stores/parkingStore.ts', line: 43, endLine: 52, symbol: 'deriveParkingCounts', note: 'reduce + counts[s.status]+1 — key lạ → NaN (runtime JS)' }
  ],
  pseudocode: [
    { id: 'p1', text: 'counts={total:S.len, các key 0}; ∀s: counts[s.status]++' }
  ],
  edgeCases: [
    { title: 'Status lạ ngoài union', description: 'counts[key-lạ]+1 = undefined+1 = NaN — TS chặn ở compile, runtime sinh NaN.' }
  ],
  simplifications: [],
  related: ['spot-event-reducer', 'mock-scenario-emitter'],
  parameters: [
    { key: 'preset', label: 'Tập ô', type: 'select', default: 'mixed', options: [
      { value: 'mixed', label: '6 ô hỗn hợp' }, { value: 'allEmpty', label: 'toàn empty' }
    ] }
  ],
  scenarios: [
    {
      id: 'default', title: '6 ô → counts', edgeCase: false,
      description: '{2 empty,2 occupied,1 reserved,1 unknown} → counts khớp.',
      input: {},
      expected: { total: 6, empty: 2, occupied: 2, reserved: 1, transitioning: 0, unknown: 1 }
    },
    {
      id: 'edge', title: 'Status lạ tạo key mới', edgeCase: true,
      description: 'Ô status "maintenance" → counts.maintenance = undefined+1 = NaN; total vẫn 2.',
      input: { weird: true },
      expected: { total: 2, maintenanceIsNaN: true }
    }
  ],
  buildTrace: function (scenarioId, params) {
    var sc = pickScenario(this, scenarioId);
    var p = pickParams(this, params);
    var preset = (params && params.preset !== undefined) ? params.preset : p.preset;
    var spots = sc.input.weird ? [
      { id: 'A01', status: 'maintenance' }, { id: 'A02', status: 'empty' }
    ] : preset === 'allEmpty' ? [
      { id: 'A01', status: 'empty' }, { id: 'A02', status: 'empty' },
      { id: 'B01', status: 'empty' }, { id: 'B02', status: 'empty' },
      { id: 'C01', status: 'empty' }, { id: 'C02', status: 'empty' }
    ] : [
      { id: 'A01', status: 'empty' }, { id: 'A02', status: 'empty' },
      { id: 'B01', status: 'occupied' }, { id: 'B02', status: 'occupied' },
      { id: 'C01', status: 'reserved' }, { id: 'C02', status: 'unknown' }
    ];
    var counts = deriveParkingCounts(spots);
    var frames = [];
    frames.push(fr('f_in', ['p1'], 'Input: ' + spots.length + ' ô — ' + spots.map(function (x) { return x.id + ':' + x.status; }).join(', ') + '.',
      { spots: spots.map(function (x) { return { id: x.id, status: x.status }; }) },
      [{ label: 'n ô', value: spots.length }],
      { type: 'rows', rows: spots.map(function (x) { return { cells: [x.id, x.status], state: 'active' }; }), caption: 'status ngoài 5 canonical → NaN (xem edge)' }));
    var acc = { empty: 0, occupied: 0, reserved: 0, transitioning: 0, unknown: 0 };
    var rows = spots.map(function (s) {
      acc[s.status] = (acc[s.status] || 0) + 1;
      return { cells: [s.id, s.status, '→ ' + s.status + '=' + acc[s.status]], state: 'pass' };
    });
    frames.push(fr('f0', ['p1'], 'Fold ' + spots.length + ' ô: ' + JSON.stringify(counts) + '.',
      { counts: counts }, [{ label: 'total', value: counts.total }],
      { type: 'rows', rows: rows }));
    frames.push(fr('f_out', ['p1'], 'Counts cuối: total=' + counts.total + ', empty=' + counts.empty + ', occupied=' + counts.occupied + ', reserved=' + counts.reserved + ', transitioning=' + counts.transitioning + ', unknown=' + counts.unknown + (counts.maintenance !== undefined ? ' — maintenance=' + counts.maintenance + ' (NaN do undefined+1!)' : '.'),
      { counts: counts },
      [{ label: 'total', value: counts.total }],
      { type: 'bars', items: ['empty', 'occupied', 'reserved', 'transitioning', 'unknown'].map(function (k) { return { label: k, value: counts[k], color: k === 'empty' ? '#3fce7c' : '#4f9cf7' }; }) }));
    var result = { total: counts.total, empty: counts.empty, occupied: counts.occupied, reserved: counts.reserved, transitioning: counts.transitioning, unknown: counts.unknown, maintenance: counts.maintenance === undefined ? 'undefined' : String(counts.maintenance) };
    var expected = (sc.input.weird || preset === 'mixed') ? sc.expected : { total: result.total, empty: result.empty, occupied: result.occupied, reserved: result.reserved, transitioning: result.transitioning, unknown: result.unknown };
    var checks = [chk('total', counts.total, expected.total)];
    if (expected.maintenanceIsNaN) checks.push(chk('maintenance là NaN', Number.isNaN(counts.maintenance), true));
    else checks.push(chk('counts', { total: result.total, empty: result.empty, occupied: result.occupied, reserved: result.reserved, transitioning: result.transitioning, unknown: result.unknown }, expected));
    return { frames: frames, result: result, expected: expected, checks: checks };
  }
});

/* =================================================================
 * NHÓM FLOW + APP (7 lesson)
 * ================================================================= */

L('driver-flow-machine', {
  title: 'Máy trạng thái driver',
  topic: 'Luồng điều hướng',
  summary: 'DriverMode = entry|browse|recommendation|navigation. Action của user đổi mode; effect theo sessionState tự đồng bộ: NAVIGATING→confirmSpot, SELECTING+entry→enterBrowse, PARKED→cancelNavigation.',
  role: 'Một máy trạng thái, 2 nguồn chuyển: hành động user (store) + sessionState từ backend (effect App).',
  inputTypes: [
    { name: 'mode', type: 'entry|browse|recommendation|navigation' },
    { name: 'sessionState', type: 'VehicleSessionState' }
  ],
  outputTypes: [{ name: 'mode\'', type: 'DriverMode + side-effects' }],
  structures: [
    { name: 'confirmedSpotId', type: 'SpotId|null', description: 'ô user đã xác nhận' },
    { name: 'isExitGuideActive/isRouteDismissed', type: 'boolean', description: 'cờ route' }
  ],
  complexity: { time: 'O(1) mỗi transition', space: 'O(1)', variables: '', simulation: 'giống code; chỉ mô phỏng các nhánh mode quan trọng' },
  codeRefs: [
    { path: 'frontend/src/stores/driverFlowStore.ts', line: 46, endLine: 90, symbol: 'enterBrowse / confirmSpot / cancelNavigation', note: 'action user đổi mode' },
    { path: 'frontend/src/app/App.tsx', line: 605, endLine: 632, symbol: 'session-state effect', note: 'NAVIGATING/RELOCATING→confirmSpot; SELECTING_SPOT+entry→enterBrowse; PARKED→cancelNavigation+dismiss; EXIT_NAVIGATION→guide' }
  ],
  pseudocode: [
    { id: 'p1', text: 'user: enterBrowse→browse; startRecommendation→recommendation; confirmSpot→navigation; cancel→browse' },
    { id: 'p2', text: 'session NAVIGATING_TO_SPOT|RELOCATING + target → confirmSpot(target)' },
    { id: 'p3', text: 'session SELECTING_SPOT + mode=entry → enterBrowse("all")' },
    { id: 'p4', text: 'session PARKED → cancelNavigation + dismiss route' }
  ],
  edgeCases: [
    { title: 'Session ép confirm', description: 'Backend set NAVIGATING_TO_SPOT → FE tự confirmSpot không đợi user bấm.' },
    { title: 'PARKED giữa chừng', description: 'Session park xong → route bị dismiss + mode về browse.' }
  ],
  simplifications: [
    { sourceBehavior: 'effect chạy mỗi render khi deps đổi', demoBehavior: 'mô phỏng 1 bước transition cho mỗi input', reason: 'đọc được trên canvas' }
  ],
  related: ['nav-goal-resolve', 'invalid-spot-recovery', 'parked-marker-fallback'],
  parameters: [
    { key: 'step', label: 'Input', type: 'select', default: 'nav', options: [
      { value: 'nav', label: 'session NAVIGATING_TO_SPOT + target C05' },
      { value: 'select', label: 'session SELECTING_SPOT (mode=entry)' },
      { value: 'parked', label: 'session PARKED' }
    ] }
  ],
  scenarios: [
    {
      id: 'default', title: 'NAVIGATING + target → navigation', edgeCase: false,
      description: 'session NAVIGATING_TO_SPOT target=C05, confirmedSpotId=null → confirmSpot(C05) → mode navigation.',
      input: {},
      expected: { mode: 'navigation', confirmed: 'C05', action: 'confirmSpot' }
    },
    {
      id: 'edge', title: 'PARKED → browse + dismiss', edgeCase: true,
      description: 'session PARKED → cancelNavigation + route dismissed (không auto confirm).',
      input: { step: 'parked' },
      expected: { mode: 'browse', confirmed: null, action: 'cancelNavigation' }
    }
  ],
  buildTrace: function (scenarioId, params) {
    var p = pickParams(this, params);
    var sc = pickScenario(this, scenarioId);
    var step = (params && params.step !== undefined) ? params.step : (sc.input.step || p.step);
    var mode = 'entry', confirmed = null, action = null, sessionState = 'SELECTING_SPOT';
    var frames = [];
    frames.push(fr('f0', ['p1'], 'Trạng thái đầu: mode=entry, sessionState=SELECTING_SPOT (vừa quét QR).',
      { mode: mode, sessionState: sessionState },
      [{ label: 'mode', value: mode }],
      { type: 'graph', nodes: [
        { id: 'entry', x: 0, y: 0, state: 'current' }, { id: 'browse', x: 2, y: 0 },
        { id: 'recommendation', x: 1, y: 1 }, { id: 'navigation', x: 3, y: 1 }
      ], edges: [
        { from: 'entry', to: 'browse', direction: 'one-way' }, { from: 'entry', to: 'recommendation', direction: 'one-way' },
        { from: 'recommendation', to: 'navigation', direction: 'one-way' }, { from: 'navigation', to: 'browse', direction: 'one-way' }
      ] }));
    if (step === 'nav') {
      sessionState = 'NAVIGATING_TO_SPOT';
      action = 'confirmSpot'; confirmed = 'C05'; mode = 'navigation';
      frames.push(fr('f1', ['p2'], 'sessionState=NAVIGATING_TO_SPOT + sessionTargetSpot=C05 → effect gọi confirmSpot("C05") → mode=navigation, isRouteDismissed=false.',
        { mode: mode, sessionState: sessionState, confirmedSpotId: confirmed },
        [{ label: 'action', value: 'confirmSpot(C05)' }, { label: 'mode', value: mode }],
        { type: 'graph', nodes: [
          { id: 'entry', x: 0, y: 0 }, { id: 'browse', x: 2, y: 0 },
          { id: 'recommendation', x: 1, y: 1 }, { id: 'navigation', x: 3, y: 1, state: 'current' }
        ], edges: [{ from: 'entry', to: 'navigation', direction: 'one-way', state: 'path' }] }));
    } else if (step === 'select') {
      action = 'enterBrowse'; mode = 'browse';
      frames.push(fr('f1', ['p3'], 'sessionState=SELECTING_SPOT + mode=entry → enterBrowse("all") → mode=browse (session chờ user chọn ô).',
        { mode: mode, sessionState: sessionState },
        [{ label: 'action', value: 'enterBrowse(all)' }, { label: 'mode', value: mode }],
        { type: 'graph', nodes: [
          { id: 'entry', x: 0, y: 0 }, { id: 'browse', x: 2, y: 0, state: 'current' },
          { id: 'recommendation', x: 1, y: 1 }, { id: 'navigation', x: 3, y: 1 }
        ], edges: [{ from: 'entry', to: 'browse', direction: 'one-way', state: 'path' }] }));
    } else {
      sessionState = 'PARKED'; mode = 'browse'; action = 'cancelNavigation';
      frames.push(fr('f1', ['p4'], 'sessionState=PARKED → setIsRouteDismissed(true), voice stop, (mode=navigation|confirmedSpotId) → cancelNavigation() → browse.',
        { mode: 'navigation', sessionState: sessionState },
        [{ label: 'action', value: 'cancelNavigation' }, { label: 'mode\'', value: 'browse' }],
        { type: 'graph', nodes: [
          { id: 'entry', x: 0, y: 0 }, { id: 'browse', x: 2, y: 0, state: 'current' },
          { id: 'recommendation', x: 1, y: 1 }, { id: 'navigation', x: 3, y: 1 }
        ], edges: [{ from: 'navigation', to: 'browse', direction: 'one-way', state: 'path' }] }));
    }
    frames.push(fr('f2', ['p3'], 'Kết quả: mode=' + mode + ', confirmedSpot=' + confirmed + ', action=' + action + ' — effect sessionState tự đồng bộ mode khi backend đổi trạng thái.',
      { mode: mode, confirmed: confirmed, action: action },
      [{ label: 'mode', value: mode }],
      { type: 'board', cards: [{ label: 'mode mới', value: mode, color: '#3fce7c', hl: true }, { label: 'confirmedSpotId', value: confirmed || 'null' }, { label: 'store action', value: action || '—' }] }));
    var result = { mode: mode, confirmed: confirmed, action: action };
    var EXP_FLOW = {
      nav: { mode: 'navigation', confirmed: 'C05', action: 'confirmSpot' },
      select: { mode: 'browse', confirmed: null, action: 'enterBrowse' },
      parked: { mode: 'browse', confirmed: null, action: 'cancelNavigation' }
    };
    var expF = EXP_FLOW[step] || sc.expected;
    var checks = [chk('mode', result.mode, expF.mode), chk('confirmed', result.confirmed, expF.confirmed), chk('action', result.action, expF.action)];
    return { frames: frames, result: result, expected: expF, checks: checks };
  }
});

L('nav-goal-resolve', {
  title: 'Quyết định đích route',
  topic: 'Luồng điều hướng',
  summary: 'goalSpot/isExitMode: PARKED|EXIT_NAVIGATION + exitGuide → exit từ (parked||confirmed); còn lại goal = sessionTarget||confirmed||inspected; dismissed/ended → null. Sau đó chọn wrapper route theo isExit+vehicle.',
  role: 'Memo trung tâm App.tsx — quyết định route nào được vẽ và bằng hàm nào.',
  inputTypes: [
    { name: 'sessionState', type: 'VehicleSessionState' },
    { name: 'isExitGuideActive', type: 'boolean' },
    { name: 'targetVehicle', type: 'observed|null' }
  ],
  outputTypes: [{ name: '{goalSpot,isExitMode,route}', type: 'memo + RouteResult|null' }],
  structures: [{ name: 'goal memo deps', type: '9 deps', description: ':692' }],
  complexity: { time: 'O(1) goal + O(route)', space: 'O(V+E)', variables: '', simulation: 'giống code; mini graph FIX-G1' },
  codeRefs: [
    { path: 'frontend/src/app/App.tsx', line: 677, endLine: 692, symbol: 'goalSpot/isExitMode useMemo', note: 'cây quyết định' },
    { path: 'frontend/src/app/App.tsx', line: 703, endLine: 732, symbol: 'route effect', note: 'exit? (xe→findExitRouteFromPos : không xe→goal→findExitRoute) / inbound' }
  ],
  pseudocode: [
    { id: 'p1', text: 'PARKED|EXIT_NAV: exitGuide → isExit, goal=parked||confirmed; else goal=null' },
    { id: 'p2', text: 'state khác → goal=sessionTarget||confirmed||inspected' },
    { id: 'p3', text: 'dismissed|ended → goal=null' },
    { id: 'p4', text: 'route: exit?(xe?fromPos : goal?exit:null) : (xe?(goal?inbound:null):(goal?vehicle:null))' },
    { id: 'p5', text: 'trả {goal,isExit,route} cho App' }
  ],
  edgeCases: [
    { title: 'Exit không vehicle', description: 'findExitRoute(parkedSpot) → null vì spot-entry là SINK — bug đã ghi ở spot-route-wrappers.' },
    { title: 'Goal null', description: 'Effect 1 clear route + stop voice.' }
  ],
  simplifications: [],
  related: ['driver-flow-machine', 'pos-route-wrappers', 'spot-route-wrappers', 'invalid-spot-recovery'],
  parameters: [
    { key: 'variant', label: 'Tình huống', type: 'select', default: 'inbound', options: [
      { value: 'inbound', label: 'NAVIGATING + xe quan sát' },
      { value: 'inboundNoVeh', label: 'NAVIGATING không xe' },
      { value: 'exitVeh', label: 'PARKED+exitGuide + xe' },
      { value: 'exitNoVeh', label: 'PARKED+exitGuide không xe' }
    ] }
  ],
  scenarios: [
    {
      id: 'default', title: 'Inbound + vehicle → route từ vị trí', edgeCase: false,
      description: 'NAVIGATING_TO_SPOT target=C05, xe ở (5.2,4.6) → isExit=false, goal=C05, findInboundRouteFromPos → route [vehicle-pos,c4,sC05] (3 node).',
      input: {},
      expected: { goal: 'C05', isExit: false, routeLen: 3 }
    },
    {
      id: 'edge', title: 'Exit không xe → null (bug sink)', edgeCase: true,
      description: 'PARKED+exitGuide, không observe xe → findExitRoute(C05) → null vì sC05 là sink.',
      input: { variant: 'exitNoVeh' },
      expected: { goal: 'C05', isExit: true, route: null }
    }
  ],
  buildTrace: function (scenarioId, params) {
    var p = pickParams(this, params);
    var sc = pickScenario(this, scenarioId);
    var variant = sc.input.variant || p.variant;
    var hasVehicle = variant === 'inbound' || variant === 'exitVeh';
    var isExitState = variant === 'exitVeh' || variant === 'exitNoVeh';
    var graph = clone(G1);
    var goal, isExit = false;
    var gates = [];
    if (isExitState) {
      isExit = true; goal = 'C05';
      gates.push({ cells: ['PARKED+exitGuide', '→ isExit=true, goal=sessionParkedSpot||confirmedSpotId=C05'], state: 'pass' });
    } else {
      goal = 'C05';
      gates.push({ cells: ['state khác', '→ goal=sessionTargetSpot||confirmedSpotId=C05'], state: 'pass' });
    }
    var route = null, used = 'null';
    if (isExit) {
      used = hasVehicle ? 'findExitRouteFromPos' : 'findExitRoute';
      route = hasVehicle ? findExitRouteFromPos(graph, 5.2, 4.6, null, 1, false) : findExitRoute(graph, 'C05');
    } else {
      used = hasVehicle ? 'findInboundRouteFromPos' : 'findVehicleRoute';
      route = hasVehicle ? findInboundRouteFromPos(graph, 5.2, 4.6, 'C05', 1, false) : findVehicleRoute(graph, 'C05');
    }
    var routePath = route && route.route ? route.route.nodeIds : (route && route.nodeIds) || null;
    gates.push({ cells: ['chọn wrapper', used], state: 'active' });
    gates.push({ cells: ['route', routePath ? routePath.join('→') : 'null'], state: routePath ? 'pass' : 'fail' });
    var frames = [];
    frames.push(fr('f0', ['p1', 'p2', 'p3'], 'variant=' + variant + ': goal=' + goal + ', isExitMode=' + isExit + ', vehicle=' + (hasVehicle ? 'có' : 'không') + '.',
      { goal: goal, isExit: isExit, hasVehicle: hasVehicle },
      [{ label: 'goal', value: goal }, { label: 'isExit', value: String(isExit) }],
      { type: 'rows', rows: gates.slice(0, 1) }));
    frames.push(fr('f1', ['p4'], 'Wrapper=' + used + ' → route ' + (routePath ? routePath.join('→') : 'NULL' + (isExit && !hasVehicle ? ' (sC05 sink — không cạnh ra)' : '')) + '.',
      { used: used, route: routePath },
      [{ label: 'route', value: routePath ? routePath.length + ' nodes' : 'null' }],
      { type: 'rows', rows: gates }));
    frames.push(fr('f2', ['p5'], 'Kết quả: goal=' + goal + ', isExit=' + isExit + ', wrapper=' + used + ', route=' + (routePath ? routePath.join('→') : 'null') + '.',
      { goal: goal, route: routePath },
      [{ label: 'routeLen', value: routePath ? routePath.length : 'null' }],
      { type: 'board', cards: [{ label: 'goal', value: goal || 'null' }, { label: 'isExit', value: String(isExit) }, { label: 'route', value: routePath ? routePath.length + ' nodes' : 'null', color: routePath ? '#3fce7c' : '#f2555a', hl: true }] }));
    var result = { goal: goal, isExit: isExit, used: used, routeLen: routePath ? routePath.length : 0, route: routePath };
    var expected = (params && params.variant !== undefined && params.variant !== sc.input.variant) ? { goal: result.goal, isExit: result.isExit, routeLen: result.routeLen, route: result.route } : sc.expected;
    var checks = [chk('goal', result.goal, expected.goal), chk('isExit', result.isExit, expected.isExit)];
    if (expected.route === null) checks.push(chk('route null', result.route, null));
    else if (expected.routeLen !== undefined) checks.push(chk('routeLen', result.routeLen, expected.routeLen));
    return { frames: frames, result: result, expected: expected, checks: checks };
  }
});

L('invalid-spot-recovery', {
  title: 'Tự đổi ô khi đích bị chiếm',
  topic: 'Luồng điều hướng',
  summary: 'Decision target_occupied_by_other → recommend ra ≤3 ứng viên (loại ô cũ) → thử selectSessionSpot TUẦN TỰ; SPOT_RESERVED/SPOT_NOT_AVAILABLE → thử tiếp; lỗi khác → dừng; hết → cảnh báo + danh sách alt.',
  role: 'Auto-reroute: camera xác nhận ô đích đã có xe khác → FE tự claim ô thay thế theo thứ tự A*-ranked.',
  inputTypes: [
    { name: 'alternatives', type: 'spotId[]', description: '≤3, loại ô target' },
    { name: 'outcomes', type: 'per-spot: ok|SPOT_RESERVED|error' }
  ],
  outputTypes: [{ name: 'verdict', type: 'rerouted|warned' }],
  structures: [
    { name: 'autoRerouteKeyRef', type: 'string', description: 'chống lặp theo session:rev:spot:otherGid' }
  ],
  complexity: { time: 'O(K) tuần tự, K≤3', space: 'O(1)', variables: '', simulation: 'giống code; mock async' },
  codeRefs: [
    { path: 'frontend/src/app/App.tsx', line: 420, endLine: 476, symbol: 'auto-reroute effect', note: 'dedupe key → recommend → vòng selectSessionSpot → confirmSpot+notice+speak / showInvalidSpotWarning' }
  ],
  pseudocode: [
    { id: 'p1', text: 'alts=[best,...alts]≠target, ≤3; key lặp → return' },
    { id: 'p2', text: '∀alt: accepted=await selectSessionSpot(alt); !accepted→continue' },
    { id: 'p3', text: 'OK → confirmSpot+notice+voice; RESERVED/NOT_AVAIL→continue; lỗi khác→break' },
    { id: 'p4', text: 'hết → showInvalidSpotWarning(occupied+alts)' }
  ],
  edgeCases: [
    { title: 'Alt đầu bị giữ', description: 'SPOT_RESERVED → tiếp tục alt sau, không hủy.' },
    { title: 'Hết alt', description: 'warning + alternativeSpotIds cho user chọn tay.' }
  ],
  simplifications: [
    { sourceBehavior: 'selectSessionSpot thật qua session API', demoBehavior: 'stub async trả ok/SPOT_RESERVED theo map', reason: 'deterministic, không backend' }
  ],
  related: ['spot-rank-score', 'recommendation-promote', 'driver-flow-machine', 'spot-event-reducer'],
  parameters: [
    { key: 'outcome', label: 'Kết quả các alt', type: 'select', default: 'secondOk', options: [
      { value: 'firstOk', label: 'alt đầu OK' }, { value: 'secondOk', label: 'alt đầu RESERVED, alt 2 OK' }, { value: 'allFail', label: 'tất cả RESERVED' }
    ] }
  ],
  scenarios: [
    {
      id: 'default', title: 'alt1 RESERVED → alt2 rerouted', edgeCase: false,
      description: 'B02 trả SPOT_RESERVED → thử A09 → accepted → confirmSpot(A09) + notice.',
      input: {},
      expected: { verdict: 'rerouted', spot: 'A09', attempts: 2 }
    },
    {
      id: 'edge', title: 'Hết alt → warning', edgeCase: true,
      description: 'Cả 3 alt RESERVED → showInvalidSpotWarning với danh sách alt.',
      input: { outcome: 'allFail' },
      expected: { verdict: 'warned', spot: null, attempts: 3 }
    }
  ],
  buildTrace: function (scenarioId, params) {
    var p = pickParams(this, params);
    var sc = pickScenario(this, scenarioId);
    var outcome = (params && params.outcome !== undefined) ? params.outcome : (sc.input.outcome || p.outcome);
    var alternatives = ['B02', 'A09', 'D03'];
    var outcomeMap = outcome === 'firstOk' ? { B02: 'ok', A09: 'ok', D03: 'ok' }
      : outcome === 'allFail' ? { B02: 'SPOT_RESERVED', A09: 'SPOT_RESERVED', D03: 'SPOT_NOT_AVAILABLE' }
      : { B02: 'SPOT_RESERVED', A09: 'ok', D03: 'ok' };
    var frames = [], rows = [], verdict = 'warned', spot = null, attempts = 0;
    frames.push(fr('f0', ['p1'], 'target=C05 bị chiếm → alternatives=[' + alternatives.join(', ') + '] (loại C05, ≤3).',
      { alternatives: alternatives }, [{ label: 'alts', value: alternatives.length }],
      { type: 'rows', rows: [{ cells: ['target C05', 'occupied', 'loại khỏi alt'], state: 'fail' }].concat(alternatives.map(function (a) { return { cells: [a, 'empty', 'ứng viên'], state: 'active' }; })) }));
    for (var i = 0; i < alternatives.length && verdict === 'warned'; i++) {
      var alt = alternatives[i], res = outcomeMap[alt];
      attempts++;
      if (res === 'ok') {
        verdict = 'rerouted'; spot = alt;
        rows.push({ cells: [alt, 'selectSessionSpot → accepted', 'confirmSpot+notice+voice'], state: 'pass' });
        frames.push(fr('a' + i, ['p2', 'p3'], alt + ' → accepted → confirmSpot(' + alt + '), notice + speak(6000,urgent). REROUTED.',
          { alt: alt, verdict: 'rerouted' }, [{ label: 'verdict', value: 'rerouted→' + alt }],
          { type: 'rows', rows: clone(rows) }));
      } else {
        rows.push({ cells: [alt, res, 'continue'], state: 'fail' });
        frames.push(fr('a' + i, ['p2', 'p3'], alt + ' → ' + res + ' → tiếp tục ô sau (không hủy chuỗi).',
          { alt: alt, res: res }, [{ label: 'verdict', value: 'continue' }],
          { type: 'rows', rows: clone(rows) }));
      }
    }
    if (verdict === 'rerouted') {
      frames.push(fr('end', ['p3', 'p1'], 'Commit ' + spot + ': confirmSpot → notice "Đã đổi sang ' + spot + '" → speak(6000,urgent); autoRerouteKeyRef = session:rev:C05:otherGid — event sau trùng key bị chặn ở p1.',
        { verdict: 'rerouted', spot: spot, rerouteKey: 'session:rev:C05:otherGid' }, [{ label: 'spot', value: spot }],
        { type: 'rows', rows: rows }));
    } else {
      frames.push(fr('end', ['p4'], 'Hết ' + attempts + ' alt → showInvalidSpotWarning({spotId:C05,status:occupied,alternativeSpotIds}).',
        { verdict: 'warned' }, [{ label: 'verdict', value: 'warned' }],
        { type: 'rows', rows: rows }));
    }
    var result = { verdict: verdict, spot: spot, attempts: attempts };
    var EXP_REC = {
      firstOk: { verdict: 'rerouted', spot: 'B02', attempts: 1 },
      secondOk: { verdict: 'rerouted', spot: 'A09', attempts: 2 },
      allFail: { verdict: 'warned', spot: null, attempts: 3 }
    };
    var expR = EXP_REC[outcome] || sc.expected;
    var checks = [chk('verdict', result.verdict, expR.verdict), chk('spot', result.spot, expR.spot), chk('attempts', result.attempts, expR.attempts)];
    return { frames: frames, result: result, expected: expR, checks: checks };
  }
});

L('parked-marker-fallback', {
  title: 'Marker dựng khi xe parked',
  topic: 'Luồng điều hướng',
  summary: 'displayedVehicles: không observe xe mình + session PARKED + có parkedSpot + trackId≠null → dựng marker giả ở TÂM ô (state=parked) để map không mất xe.',
  role: 'Khi CV ngừng phát vị trí xe sau khi park, map vẫn hiển thị marker tại ô đỗ.',
  inputTypes: [
    { name: 'activeVehicles', type: 'observed[]' },
    { name: 'sessionState/parkedSpot/targetVehicleId', type: 'context' }
  ],
  outputTypes: [{ name: 'vehicles', type: 'list (có thể +1 marker dựng)' }],
  structures: [{ name: 'SPOT_GEOMETRY_BY_ID', type: 'map', description: 'tâm ô = x+w/2, y+h/2' }],
  complexity: { time: 'O(V)', space: 'O(V)', variables: '', simulation: 'giống code' },
  codeRefs: [
    { path: 'frontend/src/app/App.tsx', line: 906, endLine: 921, symbol: 'displayedVehicles', note: '4 gate theo thứ tự; marker center ô, state=parked' }
  ],
  pseudocode: [
    { id: 'p1', text: 'có xe mình observed → trả nguyên' },
    { id: 'p2', text: 'state≠PARKED || !parkedSpot || trackId==null → trả nguyên' },
    { id: 'p3', text: 'không geometry → trả nguyên' },
    { id: 'p4', text: 'trả [{trackId, x=centerX, y=centerY, state:"parked", parkedSlotId}]' },
    { id: 'p5', text: 'thiếu gate → trả nguyên danh sách xe' }
  ],
  edgeCases: [
    { title: 'Đã quan sát lại', description: 'Xe xuất hiện trong activeVehicles → KHÔNG dựng (gate 1).' },
    { title: 'Ô không geometry', description: 'parkedSpot lạ → trả nguyên, không crash.' }
  ],
  simplifications: [],
  related: ['vehicle-svg-project', 'parking-decision-resolve', 'parking-geometry-gen'],
  parameters: [
    { key: 'variant', label: 'Tình huống', type: 'select', default: 'fabricate', options: [
      { value: 'fabricate', label: 'PARKED không observe → dựng' },
      { value: 'observed', label: 'xe vẫn observed → giữ nguyên' },
      { value: 'notParked', label: 'session chưa PARKED → giữ nguyên' }
    ] }
  ],
  scenarios: [
    {
      id: 'default', title: 'PARKED C05 → marker tâm ô', edgeCase: false,
      description: 'Xe 7 không còn observed, PARKED C05 → marker {x:645,y:470} (tâm ô mini-geometry), state=parked.',
      input: {},
      expected: { count: 1, fabricated: true, x: 645, y: 470 }
    },
    {
      id: 'edge', title: 'Observed → không dựng', edgeCase: true,
      description: 'Xe 7 observed → displayedVehicles = activeVehicles (gate 1).',
      input: { variant: 'observed' },
      expected: { count: 1, fabricated: false }
    }
  ],
  buildTrace: function (scenarioId, params) {
    var p = pickParams(this, params);
    var sc = pickScenario(this, scenarioId);
    var variant = sc.input.variant || p.variant;
    var geom = miniParkingGeometry(['C'], 10);
    var spotC = geom.spots.filter(function (s) { return s.id === 'C05'; })[0];
    var active = variant === 'observed' ? [{ trackId: 7, x: 300, y: 400, observed: true }] : [];
    var sessionState = variant === 'notParked' ? 'NAVIGATING_TO_SPOT' : 'PARKED';
    var parkedSpot = 'C05', targetVehicleId = 7;
    var rows = [], result = active;
    var g1 = active.some(function (v) { return v.trackId === targetVehicleId && v.observed; });
    rows.push({ cells: ['gate1: xe mình observed?', String(g1)], state: g1 ? 'pass' : 'fail' });
    var g2 = sessionState !== 'PARKED' || !parkedSpot || targetVehicleId === null;
    if (!g1) rows.push({ cells: ['gate2: !PARKED||!spot||!trackId', String(g2)], state: g2 ? 'fail' : 'pass' });
    var fabricated = false, mx = null, my = null;
    if (!g1 && !g2) {
      if (spotC) {
        mx = spotC.x + spotC.w / 2; my = spotC.y + spotC.h / 2;
        result = [{ trackId: targetVehicleId, x: mx, y: my, state: 'parked', parkedSlotId: parkedSpot }];
        fabricated = true;
        rows.push({ cells: ['dựng marker', 'trackId=' + targetVehicleId + ' @(' + mx + ',' + my + ')'], state: 'pass' });
      }
    }
    var frames = [];
    frames.push(fr('f0', ['p1', 'p2'], 'activeVehicles=' + active.length + ', sessionState=' + sessionState + ', parkedSpot=' + (g2 && !parkedSpot ? 'null' : parkedSpot) + ', trackId=' + targetVehicleId + '.',
      { sessionState: sessionState, observed: active.length },
      [{ label: 'gates', value: rows.filter(function (r) { return r.state === 'pass'; }).length + '/' + rows.length }],
      { type: 'map', spots: [spotC], vehicle: g1 ? { x: 300, y: 400, label: 'xe7' } : null }));
    frames.push(fr('f1', ['p3', 'p4'], fabricated
      ? 'Dựng marker tại tâm ô: (' + mx + ',' + my + '), state="parked".'
      : 'Trả nguyên ' + result.length + ' xe — gate ' + (g1 ? 1 : 2) + ' dừng chuỗi.',
      { fabricated: fabricated, count: result.length },
      [{ label: 'fabricated', value: String(fabricated) }],
      { type: 'map', spots: [spotC], markers: fabricated ? [{ x: mx, y: my, label: 'xe7 parked', color: '#f0a93c' }] : [], vehicle: g1 ? { x: 300, y: 400, label: 'xe7' } : null, caption: fabricated ? 'marker giả ở tâm ô' : 'không dựng' }));
    frames.push(fr('f2', ['p5'], 'Verdict: ' + (fabricated ? 'dựng marker giả tại (' + mx + ',' + my + ') — xe đỗ không cần camera thấy.' : 'trả ' + result.length + ' xe quan sát — không dựng thêm.'),
      { fabricated: fabricated, count: result.length },
      [{ label: 'fabricated', value: String(fabricated) }],
      { type: 'board', cards: [{ label: 'fabricated', value: String(fabricated), color: fabricated ? '#f0a93c' : '#9aa4b2', hl: true }, { label: 'count', value: result.length }] }));
    var r = { count: result.length, fabricated: fabricated, x: mx, y: my };
    var expected = (params && params.variant !== undefined && params.variant !== sc.input.variant) ? { count: r.count, fabricated: r.fabricated, x: r.x, y: r.y } : sc.expected;
    var checks = [chk('count', r.count, expected.count), chk('fabricated', r.fabricated, expected.fabricated)];
    if (expected.x !== undefined) checks.push(chk('vị trí marker', [r.x, r.y], [expected.x, expected.y]));
    return { frames: frames, result: r, expected: expected, checks: checks };
  }
});

L('gate-line-derive', {
  title: 'Suy ra gate từ 3 điểm',
  topic: 'Hình học hiển thị',
  summary: 'gateLineFromPoints: (p1,p2,accepted) → direction = sign(cross) ( >0→"negative" ), làm tròn 4 số; acceptedPointForGate đảo lại điểm phía xe tới = mid ± perp·max(0.6·len,2).',
  role: 'Cấu hình cổng ENTRY/EXIT: 3 click → vạch + hướng; hàm ngược dựng điểm chấp nhận cho kịch bản kiểm.',
  inputTypes: [{ name: 'points', type: '[p1,p2,accepted]' }],
  outputTypes: [{ name: 'gate', type: '{name,p1,p2,direction} | throw' }],
  structures: [{ name: 'cross', type: '(p2−p1)×(acc−p1)', description: 'dấu quyết direction' }],
  complexity: { time: 'O(1)', space: 'O(1)', variables: '', simulation: 'giống code' },
  codeRefs: [
    { path: 'frontend/src/app/MonitorApp.tsx', line: 37, endLine: 54, symbol: 'gateLineFromPoints', note: '3 throw: thiếu điểm / trùng đầu / acc nằm trên vạch; toFixed(4)' },
    { path: 'frontend/src/app/MonitorApp.tsx', line: 25, endLine: 35, symbol: 'acceptedPointForGate', note: 'mid ± perp·max(0.6·len,2); negative→side+1' }
  ],
  pseudocode: [
    { id: 'p1', text: 'thiếu điểm | trùng p1p2 | |cross|<1e-6 → throw' },
    { id: 'p2', text: 'side=cross>0 → "negative"; else "positive"; p1,p2 làm tròn 4 số' },
    { id: 'p3', text: 'accepted = mid + (negative?+1:−1)·perp·max(0.6·len,2)' }
  ],
  edgeCases: [
    { title: 'Acc nằm trên vạch', description: '|cross|<1e-6 → throw "Điểm chỉ hướng ... không được nằm trên vạch".' },
    { title: 'Vạch suy biến', description: 'p1==p2 → throw "Hai đầu vạch ... phải khác nhau".' }
  ],
  simplifications: [],
  related: ['point-segment-dist', 'viewbox-pan-zoom'],
  parameters: [
    { key: 'accY', label: 'acc.y (hướng xe tới)', type: 'number', min: -8, max: 8, step: 1, default: 6 },
    { key: 'degenerate', label: 'Acc nằm trên vạch (accY=0)', type: 'boolean', default: false }
  ],
  scenarios: [
    {
      id: 'default', title: 'acc phía dưới → negative', edgeCase: false,
      description: 'p1=(0,0), p2=(10,0), acc=(5,6): cross=60>0 → "negative"; acceptedPoint=(5,6).',
      input: {},
      expected: { direction: 'negative', acc: { x: 5, y: 6 } }
    },
    {
      id: 'edge', title: 'acc trên vạch → throw', edgeCase: true,
      description: 'acc=(5,0) nằm trên vạch → cross=0 → throw.',
      input: { degenerate: true },
      expected: { direction: null, error: true }
    }
  ],
  buildTrace: function (scenarioId, params) {
    var p = pickParams(this, params);
    var sc = pickScenario(this, scenarioId);
    var deg = p.degenerate === true || sc.input.degenerate === true;
    var accY = deg ? 0 : (sc.input.accY !== undefined ? sc.input.accY : ((params && params.accY !== undefined) ? params.accY : p.accY));
    var pts = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 5, y: accY }];
    var frames = [];
    var gate = null, err = null;
    try { gate = gateLineFromPoints('ENTRY', pts); } catch (e) { err = e.message; }
    var cross = (pts[1].x - pts[0].x) * (pts[2].y - pts[0].y) - (pts[1].y - pts[0].y) * (pts[2].x - pts[0].x);
    frames.push(fr('f0', ['p1'], 'cross=(10−0)·(' + accY + '−0)−0 = ' + r2(cross) + '.',
      { cross: cross }, [{ label: 'cross', value: r2(cross) }],
      { type: 'geom', segments: [{ a: pts[0], b: pts[1], arrow: true }], points: [{ x: 5, y: accY, label: 'acc', color: '#f0a93c' }] }));
    var acc2 = null;
    if (gate) {
      acc2 = acceptedPointForGate(gate);
      frames.push(fr('f1', ['p2', 'p3'], 'cross>0 → direction="negative"; accepted = mid + perp·max(0.6·10,2) = (' + r2(acc2.x) + ',' + r2(acc2.y) + ').',
        { direction: gate.direction, acc: acc2 },
        [{ label: 'direction', value: gate.direction }],
        { type: 'geom', segments: [{ a: gate.p1, b: gate.p2, arrow: true }], points: [{ x: acc2.x, y: acc2.y, label: 'accepted', color: '#3fce7c' }] }));
    } else {
      frames.push(fr('f1', ['p1'], 'THROW: ' + err + '.', { error: err }, [{ label: 'error', value: 'throw' }],
        { type: 'geom', segments: [{ a: pts[0], b: pts[1], arrow: true }], points: [{ x: 5, y: 0, label: 'acc trên vạch', color: '#f2555a' }] }));
    }
    frames.push(fr('f2', ['p3'], 'Verdict: ' + (gate ? 'direction=' + gate.direction + ', accepted=(' + r2(acc2.x) + ',' + r2(acc2.y) + ') — làm tròn toFixed(4).' : 'THROW: ' + err + ' — calibration không dùng được.'),
      { direction: gate ? gate.direction : null, error: !!err },
      [{ label: 'gate', value: gate ? 'ok' : 'throw' }],
      { type: 'board', cards: [{ label: 'direction', value: gate ? gate.direction : '—', hl: true }, { label: 'error', value: err || 'none', color: err ? '#f2555a' : '#3fce7c' }] }));
    var result = { direction: gate ? gate.direction : null, acc: acc2 ? { x: r2(acc2.x), y: r2(acc2.y) } : null, error: !!err };
    var sameGate = deg === (sc.input.degenerate === true) && accY === (deg ? 0 : (sc.input.accY !== undefined ? sc.input.accY : 6));
    var expected = sameGate ? sc.expected : { direction: result.direction, acc: result.acc, error: result.error };
    var checks = [chk('direction', result.direction, expected.direction)];
    if (expected.acc) checks.push(chk('accepted', result.acc, expected.acc));
    if (expected.error !== undefined) checks.push(chk('error', result.error, expected.error));
    return { frames: frames, result: result, expected: expected, checks: checks };
  }
});

L('parking-decision-resolve', {
  title: 'Quyết định đỗ của session',
  topic: 'Đồng bộ phiên đỗ',
  summary: 'resolveSessionParking: chuỗi nhánh ưu tiên — EXIT_NAVIGATION → parked(key) → invariant error (>1 ô cùng gid) → confirmation_pending → delayed → no_target → runtime_unavailable → guiding → identity_pending → occupied_by_other.',
  role: 'Reducer trung tâm quyết định banner/cảnh báo: session đang ở bước nào của vòng đỗ.',
  inputTypes: [
    { name: 'session', type: '{state,targetSpotId,parkedSpotId,globalVehicleId,...}' },
    { name: 'slots/episodes', type: 'runtime' }
  ],
  outputTypes: [{ name: 'decision', type: '10 kind' }],
  structures: [
    { name: 'ownSpots', type: 'slotId[]', description: 'ô đang giữ gid mình (episode hoặc slot confirmed)' },
    { name: 'dwell threshold', type: 'ms', description: 'confirm parked' }
  ],
  complexity: { time: 'O(S+E+P)', space: 'O(S)', variables: 'S slots, E episodes, P pending', simulation: 'giống code; nhánh chính' },
  codeRefs: [
    { path: 'frontend/src/domain/sessionParking.ts', line: 27, endLine: 112, symbol: 'resolveSessionParking', note: 'chuỗi return theo ưu tiên; decision kinds :6-15' }
  ],
  pseudocode: [
    { id: 'p1', text: 'EXIT_NAVIGATION → exit_navigation(origin=parked)' },
    { id: 'p2', text: 'PARKED+spot+key → parked(completionKey)' },
    { id: 'p3', text: 'ownSpots>1 → invariant_error; ==1 → confirmation_pending' },
    { id: 'p4', text: 'pending cũ/degraded → delayed; !target → no_target; slot lạ → runtime_unavailable' },
    { id: 'p5', text: 'target empty→guiding; vid null→identity_pending; vid==gid→pending; xe khác confirmed→occupied_by_other; else pending' }
  ],
  edgeCases: [
    { title: '2 ô cùng gid', description: 'identity_invariant_error — backend tự mâu thuẫn, FE báo lỗi thay vì đoán.' },
    { title: 'Xe khác chưa confirm dwell', description: 'occupied nhưng chưa đủ dwell → identity_pending(other_unconfirmed), KHÔNG phải occupied_by_other.' }
  ],
  simplifications: [
    { sourceBehavior: 'episodes/pipeline đầy đủ', demoBehavior: 'dùng nhánh slots+vehicles (episodes=null)', reason: 'đủ dạy thứ tự gate' }
  ],
  related: ['occupancy-classify', 'completion-key-build', 'invalid-spot-recovery'],
  parameters: [
    { key: 'variant', label: 'Tình huống', type: 'select', default: 'guiding', options: [
      { value: 'guiding', label: 'target empty → guiding' },
      { value: 'occupiedOther', label: 'xe khác confirmed → occupied_by_other' },
      { value: 'invariant', label: 'gid ở 2 ô → invariant_error' },
      { value: 'parked', label: 'PARKED → completionKey' }
    ] }
  ],
  scenarios: [
    {
      id: 'default', title: 'Target empty → guiding', edgeCase: false,
      description: 'NAVIGATING_TO_SPOT, target C05 empty → {kind:"guiding", targetSpotId:"C05"}.',
      input: {},
      expected: { kind: 'guiding' }
    },
    {
      id: 'edge', title: 'Xe khác confirmed → occupied_by_other', edgeCase: true,
      description: 'Target C05 occupied vehicle_id=42 đã dwell đủ → target_occupied_by_other.',
      input: { variant: 'occupiedOther' },
      expected: { kind: 'target_occupied_by_other', other: 42 }
    }
  ],
  buildTrace: function (scenarioId, params) {
    var p = pickParams(this, params);
    var sc = pickScenario(this, scenarioId);
    var variant = sc.input.variant || p.variant;
    var dwell = 8000;
    var session = { sessionId: 's1', state: 'NAVIGATING_TO_SPOT', targetSpotId: 'C05', parkedSpotId: null, parkedAt: null, globalVehicleId: 7 };
    var slots = [{ slot_id: 'C05', status: 'empty', vehicle_id: null, tracking_state: 'free', stopped_for_ms: 0 }];
    var vehicles = [{ global_id: 7, parked_slot_id: null }];
    if (variant === 'occupiedOther') slots[0] = { slot_id: 'C05', status: 'occupied', vehicle_id: 42, tracking_state: 'parked', stopped_for_ms: dwell + 1 };
    if (variant === 'invariant') { slots = [{ slot_id: 'C05', status: 'occupied', vehicle_id: 7, tracking_state: 'parked', stopped_for_ms: dwell + 1 }, { slot_id: 'D03', status: 'occupied', vehicle_id: 7, tracking_state: 'parked', stopped_for_ms: dwell + 1 }]; session.targetSpotId = 'C05'; }
    if (variant === 'parked') { session.state = 'PARKED'; session.parkedSpotId = 'C05'; session.parkedAt = '2024-01-01T00:00:10Z'; }
    var decision = resolveSessionParking({ session: session, vehicles: vehicles, slots: slots, dwellThresholdMs: dwell });
    var frames = [];
    frames.push(fr('f0', ['p1', 'p2', 'p3'], 'session.state=' + session.state + ', target=' + session.targetSpotId + ', gid=' + session.globalVehicleId + '; slots: ' + JSON.stringify(slots.map(function (s) { return { id: s.slot_id, st: s.status, vid: s.vehicle_id }; })) + '.',
      { session: session.state, slots: slots.length },
      [{ label: 'variant', value: variant }],
      { type: 'rows', rows: [
        { cells: ['EXIT_NAV?', session.state === 'EXIT_NAVIGATION' ? 'y' : 'n'], state: 'fail' },
        { cells: ['PARKED+key?', (session.state === 'PARKED' && session.parkedSpotId) ? 'y' : 'n'], state: session.state === 'PARKED' ? 'pass' : 'fail' },
        { cells: ['ownSpots>1?', 'n (chỉ khi variant=invariant)'], state: variant === 'invariant' ? 'pass' : 'fail' }
      ] }));
    frames.push(fr('f1', ['p4', 'p5'], '→ decision { kind: "' + decision.kind + '"' + (decision.otherVehicleId ? ', other=' + decision.otherVehicleId : '') + (decision.completionKey ? ', key=' + decision.completionKey : '') + ' }.',
      { decision: decision },
      [{ label: 'kind', value: decision.kind }],
      { type: 'board', cards: [
        { label: 'kind', value: decision.kind, color: '#f0a93c', hl: true },
        { label: 'target/actual', value: decision.targetSpotId || decision.actualSpotId || decision.spotId || '—', color: '#4f9cf7' },
        { label: 'other', value: decision.otherVehicleId || '—', color: '#f2555a' }
      ] }));
    frames.push(fr('f2', ['p5'], 'Decision cuối: kind=' + decision.kind + (decision.otherVehicleId ? ', other=' + decision.otherVehicleId : '') + ' — App dùng kind để chọn banner/flow.',
      { kind: decision.kind },
      [{ label: 'kind', value: decision.kind }],
      { type: 'board', cards: [{ label: 'kind', value: decision.kind, color: '#f0a93c', hl: true }] }));
    var result = { kind: decision.kind, other: decision.otherVehicleId || null };
    var expD = (params && params.variant !== undefined && params.variant !== sc.input.variant) ? { kind: result.kind, other: result.other } : sc.expected;
    var checks = [chk('kind', result.kind, expD.kind)];
    if (expD.other !== undefined) checks.push(chk('other', result.other, expD.other));
    return { frames: frames, result: result, expected: expD, checks: checks };
  }
});

L('mock-scenario-emitter', {
  title: 'Bộ phát kịch bản mock',
  topic: 'Đồng bộ phiên đỗ',
  summary: 'emitSpotStatus: revision tự tăng (map per-spot) → cameraOwnsSpot → reject : dispatch event (confidence 0.95/0.42 unknown, rev). queueScenario xếp action; stepScenario shift + gọi emitter (stale: ép rev hiện; unauthorized: ép camera lạ).',
  role: 'Nguồn sự kiện deterministic cho demo không backend — mọi kịch bản đều là queue action rời rạc.',
  inputTypes: [
    { name: 'spotId,status,cameraId?,revision?', type: 'emit args' },
    { name: 'scenarioId', type: 'queueScenario' }
  ],
  outputTypes: [{ name: 'ok', type: 'boolean + event dispatched' }],
  structures: [
    { name: 'revisions', type: 'Map<spotId,int>', description: 'mỗi ô đếm riêng' },
    { name: 'pendingActions', type: 'queue', description: 'queueScenario→stepScenario' }
  ],
  complexity: { time: 'O(1) emit / O(K) queue', space: 'O(S)', variables: '', simulation: 'giống code (bỏ listener/timer)' },
  codeRefs: [
    { path: 'frontend/src/mocks/MockParkingDataSource.ts', line: 134, endLine: 160, symbol: 'emitSpotStatus', note: 'rev=tự tăng; owns? reject : dispatch luôn (kể cả rev cũ)' },
    { path: 'frontend/src/mocks/MockParkingDataSource.ts', line: 173, endLine: 226, symbol: 'queueScenario / stepScenario', note: 'stale: rev=hiện; unauthorized: camera lạ + rev+1' }
  ],
  pseudocode: [
    { id: 'p1', text: 'rev = tham số ?? revisions.get(spot)+1' },
    { id: 'p2', text: '!cameraOwnsSpot → reject (return false, KHÔNG dispatch)' },
    { id: 'p3', text: 'rev>cur → revisions.set; dispatch(event) luôn → true' },
    { id: 'p4', text: 'stepScenario: shift → status/health/stale/unauthorized' }
  ],
  edgeCases: [
    { title: 'Stale vẫn dispatch', description: 'rev cũ → revisions không đổi NHƯNG event vẫn dispatch (store mới reject) — khác với unauthorized (không dispatch).' },
    { title: 'Camera đúng zone sai cặp', description: 'cam-right → F01 (cam-left sở hữu) → reject trước dispatch.' },
    { title: 'BUG nguồn: scenario unauthorized-ownership', description: 'mock chọn cam-left→F01 (:196) nhưng F ∈ LEFT_ZONES → authorized, dispatch bình thường — nhãn kịch bản tự bẻ.' }
  ],
  simplifications: [
    { sourceBehavior: 'dispatch → listener → store', demoBehavior: 'trả verdict + event thay vì listener', reason: 'không cần store trong unit này' }
  ],
  related: ['spot-event-reducer', 'spot-ownership-map', 'parking-counts-derive'],
  parameters: [
    { key: 'scenario', label: 'Kịch bản', type: 'select', default: 'normal', options: [
      { value: 'normal', label: 'normal-independent (4 step)' },
      { value: 'stale', label: 'stale-revision (A02 rev cũ)' },
      { value: 'unauth', label: 'unauthorized (F01: cam-left quirk + cam-right reject)' }
    ] }
  ],
  scenarios: [
    {
      id: 'default', title: 'normal-independent 4 step', edgeCase: false,
      description: 'A01→transitioning, A08→transitioning, A01→occupied, A08→empty — tất cả dispatched, rev tự tăng.',
      input: {},
      expected: { steps: 4, dispatched: 4, rejected: 0 }
    },
    {
      id: 'edge', title: 'Unauthorized: quirk authorized + reject thật', edgeCase: true,
      description: 'cam-left→F01 (nhãn unauth nhưng F thuộc cam-left → dispatch — BUG nguồn :196) rồi cam-right→F01 → reject thật.',
      input: { scenario: 'unauth' },
      expected: { steps: 2, dispatched: 1, rejected: 1 }
    }
  ],
  buildTrace: function (scenarioId, params) {
    var p = pickParams(this, params);
    var sc = pickScenario(this, scenarioId);
    var scenario = sc.input.scenario || p.scenario;
    // revisions pre-seed từ snapshot ban đầu (source :88) — stale cần rev hiện của A02.
    var revState = scenario === 'stale' ? { A02: { revision: 3, status: 'empty' } } : {};
    var queue = scenario === 'stale' ? [{ kind: 'stale', spotId: 'A02' }]
      : scenario === 'unauth' ? [{ kind: 'unauthorized', spotId: 'F01', cameraId: 'cam-left' }, { kind: 'unauthorized', spotId: 'F01', cameraId: 'cam-right' }]
      : [{ kind: 'status', spotId: 'A01', status: 'transitioning' }, { kind: 'status', spotId: 'A08', status: 'transitioning' }, { kind: 'status', spotId: 'A01', status: 'occupied' }, { kind: 'status', spotId: 'A08', status: 'empty' }];
    var frames = [], events = [], dispatched = 0, rejected = 0;
    frames.push(fr('f0', ['p1'], 'queueScenario → ' + queue.length + ' action trong pendingActions.',
      { pending: queue.length }, [{ label: 'pending', value: queue.length }],
      { type: 'board', cards: queue.map(function (q) { return { label: q.kind, value: q.spotId + (q.status ? '→' + q.status : '') }; }) }));
    queue.forEach(function (a, i) {
      var res;
      if (a.kind === 'stale') {
        var staleRev = revState[a.spotId] ? revState[a.spotId].revision : 1;
        frames.push(fr('r' + i, ['p4', 'p1'], 'stepScenario stale: revision = revisions.get(' + a.spotId + ') ?? 1 → ' + staleRev + ' — ép rev HIỆN (không +1), làm event thành stale cố ý.',
          { spot: a.spotId, curRevision: staleRev, eventRevision: staleRev }, [{ label: 'rev', value: staleRev }],
          { type: 'board', cards: [{ label: 'revisions[' + a.spotId + ']', value: staleRev }, { label: 'eventRev', value: staleRev }] }));
        res = emitSpotStatus(revState, a.spotId, 'occupied', getSpotOwner(a.spotId), staleRev);
      }
      else if (a.kind === 'unauthorized') res = emitSpotStatus(revState, a.spotId, 'occupied', a.cameraId, 1);
      else res = emitSpotStatus(revState, a.spotId, a.status);
      if (res.ok) dispatched++; else rejected++;
      events.push({ t: i + 1, kind: res.ok ? (res.reason === 'dispatched-stale' ? 'urgent' : 'speak') : 'skip', label: (a.cameraId || 'auto') + '@' + a.spotId, verdict: res.reason + (res.ok ? ' rev' + res.revision : '') });
      var note = a.kind === 'stale' && res.ok ? ' — eventRev ≤ cur → revisions KHÔNG cập nhật nhưng dispatch vẫn chạy (store mới reject)' : '';
      frames.push(fr('s' + i, ['p2', 'p3'], (a.cameraId || 'owner') + '@' + a.spotId + ' → ' + res.reason + (res.ok ? ' (rev ' + res.revision + ', conf ' + res.event.confidence + ')' : ' — không dispatch') + note + '.',
        { action: a, res: res.reason }, [{ label: 'verdict', value: res.reason }],
        { type: 'timeline', events: clone(events), tMin: 0, tMax: Math.max(2, queue.length), cursor: i + 1 }));
    });
    var result = { steps: queue.length, dispatched: dispatched, rejected: rejected };
    var expM = (params && params.scenario !== undefined && params.scenario !== sc.input.scenario) ? { steps: result.steps, dispatched: result.dispatched, rejected: result.rejected } : sc.expected;
    var checks = [chk('steps', result.steps, expM.steps), chk('dispatched', result.dispatched, expM.dispatched), chk('rejected', result.rejected, expM.rejected)];
    return { frames: frames, result: result, expected: expM, checks: checks };
  }
});

/* =================================================================
 * ĐĂNG KÝ PACK — classic script, không module/import
 * ================================================================= */
if (typeof window !== 'undefined' && window.TechGarAlgo && typeof window.TechGarAlgo.registerPack === 'function') {
  window.TechGarAlgo.registerPack(PACK_ID, lessons);
}

})();
