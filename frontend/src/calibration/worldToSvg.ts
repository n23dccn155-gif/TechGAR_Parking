import type { ActiveVehicle, RuntimePoint, RuntimeSlotLayout, RuntimeSnapshot } from "../domain/runtime";
import { PARKING_GEOMETRY, SPOT_GEOMETRY_BY_ID, type Point } from "../geometry/parkingGeometry";
import type { SpotId } from "../domain/parking";
import { canonicalRuntimeId } from "../domain/runtime";

interface AffineTransform {
  x: [number, number, number];
  y: [number, number, number];
}

function polygonCenter(polygon: Array<[number, number]>): RuntimePoint | null {
  if (polygon.length === 0) return null;
  return {
    x: polygon.reduce((sum, point) => sum + point[0], 0) / polygon.length,
    y: polygon.reduce((sum, point) => sum + point[1], 0) / polygon.length,
  };
}

function solve3(matrix: number[][], values: number[]): [number, number, number] | null {
  const rows = matrix.map((row, index) => [...row, values[index] ?? 0]);
  for (let column = 0; column < 3; column += 1) {
    let pivot = column;
    for (let row = column + 1; row < 3; row += 1) {
      if (Math.abs(rows[row]?.[column] ?? 0) > Math.abs(rows[pivot]?.[column] ?? 0)) pivot = row;
    }
    const pivotRow = rows[pivot];
    if (!pivotRow || Math.abs(pivotRow[column] ?? 0) < 1e-9) return null;
    [rows[column], rows[pivot]] = [rows[pivot]!, rows[column]!];
    const divisor = rows[column]?.[column] ?? 1;
    for (let index = column; index < 4; index += 1) rows[column]![index] = (rows[column]![index] ?? 0) / divisor;
    for (let row = 0; row < 3; row += 1) {
      if (row === column) continue;
      const factor = rows[row]?.[column] ?? 0;
      for (let index = column; index < 4; index += 1) {
        rows[row]![index] = (rows[row]![index] ?? 0) - factor * (rows[column]![index] ?? 0);
      }
    }
  }
  return [rows[0]![3]!, rows[1]![3]!, rows[2]![3]!];
}

let lastLayoutKey: string | null = null;
let lastTransform: AffineTransform | null = null;

function fitAffine(layout: RuntimeSlotLayout[]): AffineTransform | null {
  const key = JSON.stringify(layout);
  if (key === lastLayoutKey) return lastTransform;
  lastTransform = computeAffine(layout);
  lastLayoutKey = key;
  return lastTransform;
}

function computeAffine(layout: RuntimeSlotLayout[]): AffineTransform | null {
  const anchors = layout.flatMap((slot) => {
    const geometry = SPOT_GEOMETRY_BY_ID.get(slot.slot_id as SpotId);
    const world = polygonCenter(slot.polygon);
    if (!geometry || !world) return [];
    return [{
      world,
      svg: { x: geometry.x + geometry.width / 2, y: geometry.y + geometry.height / 2 },
    }];
  });
  if (anchors.length < 3) return null;

  const normal = Array.from({ length: 3 }, () => [0, 0, 0]);
  const targetX = [0, 0, 0];
  const targetY = [0, 0, 0];
  for (const anchor of anchors) {
    const row = [anchor.world.x, anchor.world.y, 1];
    for (let left = 0; left < 3; left += 1) {
      targetX[left] = (targetX[left] ?? 0) + row[left]! * anchor.svg.x;
      targetY[left] = (targetY[left] ?? 0) + row[left]! * anchor.svg.y;
      for (let right = 0; right < 3; right += 1) {
        normal[left]![right] = (normal[left]![right] ?? 0) + row[left]! * row[right]!;
      }
    }
  }
  const x = solve3(normal, targetX);
  const y = solve3(normal, targetY);
  return x && y ? { x, y } : null;
}

export function createWorldToSvg(layout: RuntimeSlotLayout[]): (point: RuntimePoint) => Point {
  const transform = fitAffine(layout);
  if (!transform) {
    return (point) => ({
      x: Math.max(0, Math.min(PARKING_GEOMETRY.width, point.x)),
      y: Math.max(0, Math.min(PARKING_GEOMETRY.height, point.y)),
    });
  }
  return (point) => ({
    x: transform.x[0] * point.x + transform.x[1] * point.y + transform.x[2],
    y: transform.y[0] * point.x + transform.y[1] * point.y + transform.y[2],
  });
}

export function createSvgToWorld(layout: RuntimeSlotLayout[]): ((point: Point) => RuntimePoint) | null {
  const transform = fitAffine(layout);
  if (!transform) return null;
  const [a, b, c] = transform.x;
  const [d, e, f] = transform.y;
  const determinant = a * e - b * d;
  if (Math.abs(determinant) < 1e-9) return null;

  return (point) => {
    const shiftedX = point.x - c;
    const shiftedY = point.y - f;
    return {
      x: (e * shiftedX - b * shiftedY) / determinant,
      y: (a * shiftedY - d * shiftedX) / determinant,
    };
  };
}

export function runtimeVehiclesOnSvg(snapshot: RuntimeSnapshot, globalId?: number | null): ActiveVehicle[] {
  const project = createWorldToSvg(snapshot.slot_layout);
  const canonical = globalId == null ? null : canonicalRuntimeId(globalId, snapshot.retired_global_ids);
  return snapshot.vehicles
    .filter((vehicle) => globalId == null || vehicle.global_id === canonical)
    .map((vehicle) => {
      const point = project(vehicle.position);
      return {
        trackId: vehicle.global_id,
        x: point.x,
        y: point.y,
        trail: [],
        state: vehicle.state,
        observed: vehicle.observed,
        cameraIds: vehicle.camera_ids,
        parkedSlotId: vehicle.parked_slot_id,
      };
    });
}
