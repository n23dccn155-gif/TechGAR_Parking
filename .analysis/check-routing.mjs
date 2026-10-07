// Temporary verification script for builder-a analysis.
// Bundles frontend routing modules with esbuild and exercises them in node.
import { buildSync } from "../frontend/node_modules/.pnpm/esbuild@0.25.12/node_modules/esbuild/lib/main.js";
import { writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const outfile = new URL("./check-routing.bundle.mjs", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");

const entry = `
export { LANE_GRAPH } from "../frontend/src/routing/laneGraph.ts";
export { findRoute, findVehicleRoute, findExitRoute, findExitRouteFromPos, findInboundRouteFromPos } from "../frontend/src/routing/routeEngine.ts";
export { PARKING_GEOMETRY } from "../frontend/src/geometry/parkingGeometry.ts";
`;

writeFileSync(new URL("./check-entry.ts", import.meta.url), entry);

buildSync({
  entryPoints: [new URL("./check-entry.ts", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")],
  bundle: true,
  format: "esm",
  outfile,
  logLevel: "warning",
});

const mod = await import(pathToFileURL(outfile).href);
const { LANE_GRAPH, findVehicleRoute, findExitRoute, findExitRouteFromPos, findInboundRouteFromPos, PARKING_GEOMETRY } = mod;

console.log("nodes:", LANE_GRAPH.nodes.length, "edges:", LANE_GRAPH.edges.length);
console.log("spots:", PARKING_GEOMETRY.spots.length);

// 1) Inbound route to every spot
let inboundOk = 0, inboundNull = [];
for (const spot of PARKING_GEOMETRY.spots) {
  const r = findVehicleRoute(LANE_GRAPH, spot.id);
  if (r) inboundOk++; else inboundNull.push(spot.id);
}
console.log("findVehicleRoute ok:", inboundOk, "null:", inboundNull.join(",") || "none");

// 2) Exit route from every spot (static spot-based)
let exitOk = 0, exitNull = [];
for (const spot of PARKING_GEOMETRY.spots) {
  const r = findExitRoute(LANE_GRAPH, spot.id);
  if (r) exitOk++; else exitNull.push(spot.id);
}
console.log("findExitRoute ok:", exitOk, "null count:", exitNull.length, exitNull.slice(0, 8).join(","));

// 3) Exit route from a vehicle position (center of right aisle mid-map)
const r1 = findExitRouteFromPos(LANE_GRAPH, 840, 450);
console.log("findExitRouteFromPos(840,450):", r1 ? `route ${r1.nodeIds.length} nodes, dist=${r1.distance.toFixed(1)}` : "null");

// 4) Inbound from vehicle pos
const r2 = findInboundRouteFromPos(LANE_GRAPH, 840, 450, "C05");
console.log("findInboundRouteFromPos(840,450,C05):", r2 ? `route ${r2.nodeIds.length} nodes, dist=${r2.distance.toFixed(1)}` : "null");

// 5) Vehicle far from any lane (>60u from drivable edges)
const r3 = findExitRouteFromPos(LANE_GRAPH, 30, 20, "A01");
console.log("findExitRouteFromPos(30,20,fallback A01):", r3 ? `fallback route ${r3.nodeIds.length} nodes` : "null");

// 6) Check spot-entry node out-degree (sink check)
const outDegree = new Map();
for (const e of LANE_GRAPH.edges) {
  outDegree.set(e.from, (outDegree.get(e.from) ?? 0) + 1);
  if (e.direction === "two-way") outDegree.set(e.to, (outDegree.get(e.to) ?? 0) + 1);
}
const sinks = LANE_GRAPH.nodes.filter(n => n.kind === "spot-entry" && (outDegree.get(n.id) ?? 0) === 0);
console.log("spot-entry sink nodes:", sinks.length, "/", LANE_GRAPH.nodes.filter(n => n.kind === "spot-entry").length);
