import { describe, expect, it } from "vitest";
import { PARKING_GEOMETRY, pointInsideRect } from "../geometry/parkingGeometry";
import { LANE_GRAPH } from "../routing/laneGraph";
import { findVehicleRoute, routeUsesOnlyValidEdges } from "../routing/routeEngine";

describe("route engine", () => {
  it("connects the entrance to every spot using only valid directed edges", () => {
    PARKING_GEOMETRY.spots.forEach((spot) => {
      const route = findVehicleRoute(LANE_GRAPH, spot.id);
      expect(route, spot.id).not.toBeNull();
      if (!route) return;
      expect(route.nodeIds[0]).toBe(LANE_GRAPH.entranceNodeId);
      expect(route.nodeIds.at(-1)).toBe(LANE_GRAPH.spotEntryNodeIds[spot.id]);
      expect(routeUsesOnlyValidEdges(LANE_GRAPH, route)).toBe(true);
    });
  });

  it("keeps all route points outside parking rectangles", () => {
    PARKING_GEOMETRY.spots.forEach((target) => {
      const route = findVehicleRoute(LANE_GRAPH, target.id);
      expect(route).not.toBeNull();
      route?.points.forEach((point) => {
        expect(PARKING_GEOMETRY.spots.some((spot) => pointInsideRect(point, spot)), `${target.id} at ${point.x},${point.y}`).toBe(false);
      });
    });
  });

  it("routes D04 from the right aisle to the center lane", () => {
    const route = findVehicleRoute(LANE_GRAPH, "D04");
    expect(route).not.toBeNull();
    // Path: entrance (right) -> right junctions -> center lane junctions -> spot entry
    expect(route!.nodeIds.some(id => id.startsWith("right-"))).toBe(true);
    expect(route!.nodeIds.some(id => id.startsWith("center-"))).toBe(true);
    expect(route!.nodeIds.some(id => id.startsWith("left-"))).toBe(false);
  });

  it("routes C06 from the right aisle to the center lane", () => {
    const route = findVehicleRoute(LANE_GRAPH, "C06");
    expect(route).not.toBeNull();
    // Path: entrance (right) -> right junctions -> center lane junctions -> spot entry
    expect(route!.nodeIds.some(id => id.startsWith("right-"))).toBe(true);
    expect(route!.nodeIds.some(id => id.startsWith("center-"))).toBe(true);
    expect(route!.nodeIds.some(id => id.startsWith("left-"))).toBe(false);
  });

  it("routes E02 using the left aisle (via connector)", () => {
    const route = findVehicleRoute(LANE_GRAPH, "E02");
    expect(route).not.toBeNull();
    // Path: entrance (right) -> right junctions -> center junctions -> left aisle
    expect(route!.nodeIds.some(id => id.startsWith("right-"))).toBe(true);
    expect(route!.nodeIds.some(id => id.startsWith("left-"))).toBe(true);
  });

  it("routes B07 exclusively on the right aisle", () => {
    const route = findVehicleRoute(LANE_GRAPH, "B07");
    expect(route).not.toBeNull();
    // Path: entrance (right) -> right aisle -> spot
    expect(route!.nodeIds.some(id => id.startsWith("right-"))).toBe(true);
    expect(route!.nodeIds.some(id => id.startsWith("center-"))).toBe(false);
    expect(route!.nodeIds.some(id => id.startsWith("left-"))).toBe(false);
  });
});
