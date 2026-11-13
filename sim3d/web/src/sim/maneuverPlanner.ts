/** Deterministic bounded local search for an entry maneuver around parked vehicles. */
import type { Slot, Vec2 } from '../contracts/lot';
import type { CarState, Pose, Route, RoutePoint } from '../contracts/sim';
import { carRect, penetrationDepth } from './collision';
import { advanceAlongRoute, MAX_STEER_RAD, routeCumulative, routeSegmentIndex, WHEELBASE_M } from './drive';
import { normalizeAngle, polylineLength } from './geometry';

interface SearchNode {
  readonly pose: Pose;
  readonly cost: number;
  readonly score: number;
  readonly parent: SearchNode | null;
}
class Heap {
  private readonly values: SearchNode[] = [];
  get length(): number { return this.values.length; }
  push(node: SearchNode): void {
    let index = this.values.length;
    this.values.push(node);
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (this.values[parent].score <= node.score) break;
      this.values[index] = this.values[parent];
      index = parent;
    }
    this.values[index] = node;
  }
  pop(): SearchNode | undefined {
    const root = this.values[0];
    const last = this.values.pop();
    if (last === undefined || this.values.length === 0) return root;
    let index = 0;
    for (;;) {
      let child = index * 2 + 1;
      if (child >= this.values.length) break;
      if (child + 1 < this.values.length && this.values[child + 1].score < this.values[child].score) child += 1;
      if (this.values[child].score >= last.score) break;
      this.values[index] = this.values[child];
      index = child;
    }
    this.values[index] = last;
    return root;
  }
}

/** Returns null when no validated candidate is found; never mutates the input. */
export function planParkingManeuver(
  car: CarState, slot: Slot, cars: readonly CarState[], mode: 'entry' | 'exit',
  checkStep?: (previous: Pose, proposed: Pose) => boolean,
): Route | null {
  if (car.route === undefined) return null;
  const original = car.route;
  const joinIndex = mode === 'exit' ? original.points.findIndex((point) => point.gear === 'forward') : -1;
  if (mode === 'exit' && joinIndex < 1) return null;
  const origin = car.pose;
  const cos = Math.cos(origin.th), sin = Math.sin(origin.th);
  const local = (p: Pose): Pose => ({
    x: (p.x - origin.x) * cos + (p.y - origin.y) * sin,
    y: -(p.x - origin.x) * sin + (p.y - origin.y) * cos,
    th: normalizeAngle(p.th - origin.th),
  });
  const world = (p: Pose): Pose => ({
    x: origin.x + p.x * cos - p.y * sin,
    y: origin.y + p.x * sin + p.y * cos,
    th: normalizeAngle(p.th + origin.th),
  });
  const targetPose = mode === 'entry'
    ? { x: slot.center[0], y: slot.center[1], th: slot.heading }
    : original.points[joinIndex].pose;
  const goal = local(targetPose);
  const direction = mode === 'entry' ? 1 : -1;
  const parked = cars.filter((other) => other.id !== car.id && other.state === 'parked' &&
    Math.hypot(other.pose.x - slot.center[0], other.pose.y - slot.center[1]) < 18);
  if (parked.length === 0) return null;
  const localObstacles = parked.map((other) => ({ ...carRect(other), center: [local(other.pose).x, local(other.pose).y] as Vec2, heading: normalizeAngle(other.pose.th - origin.th) }));
  const curvature = Math.tan(MAX_STEER_RAD) / WHEELBASE_M;
  const step = 0.45;
  const pointKey = (p: Pose) => `${String(Math.round(p.x / 0.3))},${String(Math.round(p.y / 0.3))},${String(Math.round(normalizeAngle(p.th) / (2 * Math.PI / 72)))}`;
  const heuristic = (p: Pose) => Math.hypot(goal.x - p.x, goal.y - p.y) + Math.abs(normalizeAngle(goal.th - p.th)) * 1.3;
  const safe = (p: Pose, limit: number): boolean => {
    if (p.x < Math.min(0, goal.x) - 2 || p.x > Math.max(0, goal.x) + 6 || p.y < Math.min(0, goal.y) - 1 || p.y > Math.max(0, goal.y) + 5) return false;
    const rect = { center: [p.x, p.y] as Vec2, heading: p.th, length: car.length, width: car.width };
    return localObstacles.every((other) =>
      Math.hypot(other.center[0] - p.x, other.center[1] - p.y) > (car.length + other.length + car.width + other.width) / 2 ||
      penetrationDepth(rect, other) <= limit,
    );
  };
  interface ValidateOpts {
    /** Đúng khi tuyến phải kết thúc ở tâm ô (chế độ vào ô). */
    readonly expectTarget: boolean;
    /**
     * Chế độ RA Ô: chỉ cần kiểm tới `stopAfter` (m) — tức qua khỏi mối nối lùi→tiến một quãng.
     * Trước đây `validate` chỉ chạy trên đoạn LÙI tách rời, còn engine chạy tuyến ĐÃ NỐI; pure
     * pursuit nhìn trước 1,8 m vắt qua mối nối nên xe cắt góc và lấn xe đỗ (coders-3 đo: tại
     * cùng `s` pose validate (18,509;19,197;θ0,299) ≠ đường nối thật (18,568;19,082;θ0,656)).
     */
    readonly stopAfter?: number;
    /**
     * Chế độ RA Ô: tái hiện bước nhảy `route_s = maneuver_end_s` khi qua mốc đổi số — đúng nhánh
     * `leaving_slot → driving_to_exit` của engine. Không có bước này, validator dừng ở mốc và loại
     * oan mọi tuyến tốt (coders-3: A3 s=6,5719, B1 6,9179, A2 7,0073).
     */
    readonly jumpGearBoundary?: boolean;
  }

  /**
   * Chạy thử TUYẾN ĐÃ NỐI y như engine, **kể cả bước chuyển state ở mốc đổi số**.
   *
   * Coders-3 chỉ ra (p20-exit-run.log): `advanceAlongRoute` một mình dừng `v = 0` ngay tại mốc đổi
   * số (A3 s=6,5719; B1 6,9179; A2 7,0073). Engine thật thì ở `engine.ts` nhánh
   * `leaving_slot → driving_to_exit` đặt `route_s = max(result.route_s, maneuver_end_s)` rồi sang
   * trạng thái mới ⇒ **nhảy qua** mốc. Validator không tái hiện bước nhảy này sẽ chết ở mốc và
   * **loại bỏ mọi tuyến tốt** ⇒ fallback hàng loạt.
   */
  const validate = (route: Route, opts: ValidateOpts): boolean => {
    let pose = car.pose, v = car.v, s = 0;
    const gearAt = (at: number): 'forward' | 'reverse' => {
      const cumulative = routeCumulative(route);
      const index = routeSegmentIndex(cumulative, at);
      return route.points[index]?.gear ?? 'forward';
    };
    for (let frame = 0; frame < 2400; frame += 1) {
      const previous = pose;
      const gearBefore = gearAt(s);
      const next = advanceAlongRoute(route, s, pose, v, 5 / 3.6, 0.04);
      pose = next.pose; v = next.v; s = next.route_s;
      // Tái hiện bước nhảy của engine khi qua mốc đổi số: nếu vừa đứng lại ở mốc đổi số thì nhảy
      // `route_s` sang `maneuver_end_s` và đi tiếp (đúng nhánh `leaving_slot → driving_to_exit`).
      if (opts.jumpGearBoundary === true && Math.abs(v) < 1e-6) {
        const boundary = route.maneuver_end_s;
        if (boundary !== undefined && s < boundary - 1e-6 && gearAt(boundary + 1e-6) !== gearBefore) {
          s = boundary;
          v = 0.5;
          continue;
        }
      }
      if (checkStep !== undefined && !checkStep(previous, pose)) return false;
      const actual = carRect({ ...car, pose });
      if (parked.some((other) => penetrationDepth(actual, carRect(other)) > 0.009)) return false;
      if (opts.stopAfter !== undefined && s >= opts.stopAfter) return true;
      if (next.finished) {
        if (!opts.expectTarget) return true;
        const final = carRect({ ...car, pose: targetPose });
        return parked.every((other) => penetrationDepth(final, carRect(other)) <= 0.009);
      }
      // Dừng giữa đường (không phải ở mốc đổi số hợp lệ) ⇒ tuyến không chạy được.
      if (frame > 100 && Math.abs(v) < 1e-6 && opts.stopAfter === undefined) return false;
    }
    return false;
  };
  for (const allowance of [0.049, 0.005, 0]) {
    const heap = new Heap();
    const start = { x: 0, y: 0, th: 0 };
    heap.push({ pose: start, cost: 0, score: 1.4 * heuristic(start), parent: null });
    const best = new Map<string, number>([[pointKey(start), 0]]);
    let candidates = 0;
    for (let visited = 0; visited < 12000 && heap.length > 0; visited += 1) {
      const node = heap.pop();
      if (node === undefined) break;
      if (Math.hypot(node.pose.x - goal.x, node.pose.y - goal.y) < 0.35 && Math.abs(normalizeAngle(node.pose.th - goal.th)) < 0.13) {
        const path: Pose[] = [];
        for (let p: SearchNode | null = node; p !== null; p = p.parent) path.push(world(p.pose));
        path.reverse();
        const points: RoutePoint[] = path.map((pose) => ({ pose, gear: mode === 'entry' ? 'forward' : 'reverse', v_max: 5 / 3.6 }));
        const length = polylineLength(points.map((p) => [p.pose.x, p.pose.y] as Vec2));
        const candidate: Route = { points, aisles: original.aisles, length_m: length, target: { kind: 'slot', slot: slot.id } };
        if (mode === 'entry') {
          // Vào ô: engine chạy ĐÚNG `candidate` này ⇒ validate chính nó, tới tâm ô.
          if (validate(candidate, { expectTarget: true })) {
            return { ...candidate, slot_start_s: 2.5, maneuver_plan_attempted: true };
          }
        } else {
          // Ra ô: engine chạy **tuyến đã nối** (đoạn lùi ở trên + phần tiến sẵn có), và pure
          // pursuit nhìn trước 1,8 m vắt qua mối nối ⇒ phải validate TUYẾN ĐÃ NỐI, không phải
          // riêng đoạn lùi. Chỉ cần kiểm qua mối nối một quãng (xe thoát ô rồi về luật thường).
          const joined = [...points, ...original.points.slice(joinIndex)];
          const end = polylineLength(joined.slice(0, points.length + 1).map((p) => [p.pose.x, p.pose.y] as Vec2));
          const full: Route = {
            ...original,
            points: joined,
            length_m: polylineLength(joined.map((p) => [p.pose.x, p.pose.y] as Vec2)),
            maneuver_end_s: end,
          };
          if (validate(full, { expectTarget: false, stopAfter: end + car.length, jumpGearBoundary: true })) {
            return { ...full, maneuver_plan_attempted: true };
          }
        }
        candidates += 1;
        if (candidates >= 24) break;
        continue;
      }
      for (const steer of [-1, 0, 1]) {
        let pose = node.pose, valid = true;
        for (let sub = 0; sub < 3; sub += 1) {
          const ds = direction * step / 3;
          pose = { x: pose.x + ds * Math.cos(pose.th), y: pose.y + ds * Math.sin(pose.th), th: normalizeAngle(pose.th + ds * steer * curvature) };
          if (!safe(pose, allowance)) { valid = false; break; }
        }
        if (!valid) continue;
        const cost = node.cost + step + (steer === 0 ? 0 : 0.005);
        const key = pointKey(pose);
        if (cost >= (best.get(key) ?? Infinity)) continue;
        best.set(key, cost);
        heap.push({ pose, cost, score: cost + 1.4 * heuristic(pose), parent: node });
      }
    }
  }
  return null;
}
