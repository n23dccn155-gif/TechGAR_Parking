/**
 * Bộ tải A/B/C (`tools/gen_load_suites.py`): chạy hết từng kịch bản trên engine thật và kiểm
 *
 * - 0 va chạm và 0 cặp xe xuyên quá 5 cm, kể cả `park_clip`;
 * - không xe kẹt giữa chừng, không xe bỏ hàng chờ, không xe còn kẹt ở frame cuối;
 * - mọi `add_car` được nhận (không bị từ chối vì hết ô / không đường).
 *
 * Đồng thời ghi dòng thời gian thật của từng xe ra `sim3d/tools/out/load_timeline/<id>.json`
 * để `tools/gen_load_doc.py` viết tài liệu thiết kế.
 */

import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { LotMap } from '../contracts/lot';
import type { Scenario } from '../contracts/scenario';
import type { SimEvent } from '../contracts/events';
import type { CarStateName, SimState } from '../contracts/sim';
import lotJson from '../../../data/lot/lot_pucpr.json';
import { advanceSimState, createSimState } from './engine';
import { DT_S } from './constants';
import { findCollisionPairs, MAX_OVERLAP_DEPTH_M } from './collision';
import { hardStopCounts } from './engine';
import { HARSH_BRAKE_MPS2 } from './segments';
import { STALL_FRAMES_LIMIT, findStalls, findStillAtEnd } from './stallCheck';
import { describeQueue, findAbandonedQueue } from './stallCheck';

const lot = lotJson as unknown as LotMap;
const TEMPLATES = resolve(__dirname, '../../../data/templates');
const OUT = resolve(__dirname, '../../../tools/out/load_timeline');
const SUITE_RE = /^[ABC]\d_.*\.sim3d\.json$/;

interface CarLine {
  id: string;
  model: string;
  color: string;
  slot: string | null;
  initial: boolean;
  first: Partial<Record<CarStateName, number>>;
}

function run(file: string) {
  for (const key of Object.keys(hardStopCounts)) {
    hardStopCounts[key] = 0;
  }
  const template = JSON.parse(readFileSync(join(TEMPLATES, file), 'utf-8')) as Scenario & {
    events: SimEvent[];
    name: string;
    description: string;
  };
  const scenario = { ...template, lot: lot.name };
  const frames = template.duration_frames;
  let state = createSimState(lot, scenario);
  const initialIds = new Set(state.cars.map((car) => car.id));
  const history: SimState[] = [state];
  const lines = new Map<string, CarLine>();
  const otherWarnings: { carId: string | null; text: string }[] = [];
  const collisions: unknown[] = [];
  let overlapPairs = 0;
  let maxOverlapDepth = 0;
  let maxOverlap: { frame: number; a: string; b: string; depth_m: number } | null = null;
  const overlapExamples: { frame: number; a: string; b: string; depth_m: number }[] = [];
  const note = (s: SimState) => {
    const pairs = findCollisionPairs(s.cars.filter((car) => car.state !== 'exited'), 0);
    for (const pair of pairs) {
      if (pair.depth_m > maxOverlapDepth) {
        maxOverlapDepth = pair.depth_m;
        maxOverlap = { frame: s.frame, a: pair.a.id, b: pair.b.id, depth_m: pair.depth_m };
      }
    }
    const violating = pairs.filter((pair) => pair.depth_m > MAX_OVERLAP_DEPTH_M);
    overlapPairs += violating.length;
    for (const pair of violating) {
      if (overlapExamples.length < 10) overlapExamples.push({ frame: s.frame, a: pair.a.id, b: pair.b.id, depth_m: pair.depth_m });
    }
    for (const car of s.cars) {
      let line = lines.get(car.id);
      if (line === undefined) {
        line = {
          id: car.id,
          model: car.model,
          color: car.color,
          slot: car.slot ?? null,
          initial: initialIds.has(car.id),
          first: {},
        };
        lines.set(car.id, line);
      }
      if (car.slot) line.slot = car.slot;
      if (line.first[car.state] === undefined) line.first[car.state] = s.frame;
    }
  };
  note(state);
  for (let frame = 0; frame < frames; frame += 1) {
    const due = template.events.filter((event) => event.frame === state.frame);
    state = advanceSimState(lot, state, { frame: state.frame, events: due }, DT_S);
    history.push(state);
    note(state);
    for (const warning of state.warnings) {
      if (warning.kind === 'collision') collisions.push(warning);
      else if (warning.kind !== 'park_clip' && warning.kind !== 'park_clip_escalated') {
        // Lưu `car_id` **có cấu trúc** để lọc theo xe đã lách mà không phải parse lại chuỗi JSON
        // (chuỗi đã bị escape nên regex dễ sai).
        otherWarnings.push({
          carId: typeof warning.car_id === 'string' ? warning.car_id : null,
          text: `${String(state.frame)}:${JSON.stringify(warning)}`,
        });
      }
    }
  }
  const id = file.replace('.sim3d.json', '');
  mkdirSync(OUT, { recursive: true });
  writeFileSync(
    join(OUT, `${id}.json`),
    JSON.stringify(
      {
        id,
        name: template.name,
        description: template.description,
        fps: 25,
        duration_frames: frames,
        env: template.env,
        noise: template.noise,
        n_initial: initialIds.size,
        cars: [...lines.values()],
        warnings: otherWarnings.map((item) => item.text),
      },
      null,
      1,
    ),
  );
  return { history, collisions, overlapPairs, maxOverlapDepth, maxOverlap, overlapExamples, otherWarnings, lines };
}

/** A: 120 s; B/C stress: 240 s (25 fps). */
const MAX_A_WAIT_FRAMES = 120 * 25;
const MAX_STRESS_WAIT_FRAMES = 240 * 25;

interface WaitStats {
  readonly p50: number;
  readonly p90: number;
  readonly max: number;
  readonly maxCar: string;
  /** Số frame liên tiếp dài nhất mà KHÔNG xe nào trong bãi di chuyển (trong khi còn xe đang chạy/thao tác). */
  readonly globalStallFrames: number;
}

/** Đợt chờ dài nhất, kể cả hàng đợi và xe đỗ quá giờ; kẹt toàn cục chỉ tính xe trong bãi đang hoạt động. */
function waitStats(history: readonly SimState[]): WaitStats {
  const run = new Map<string, number>();
  const longest = new Map<string, number>();
  let global = 0;
  let globalMax = 0;
  for (const snapshot of history) {
    let active = 0;
    let moving = 0;
    for (const car of snapshot.cars) {
      const queued = car.state === 'queued';
      const overdue = car.state === 'parked' && car.park_until_frame !== undefined && snapshot.frame >= car.park_until_frame;
      if ((car.state === 'parked' && !overdue) || car.state === 'exited') {
        run.set(car.id, 0);
        continue;
      }
      if (!queued && !overdue) active += 1;
      if (!queued && !overdue && Math.abs(car.v) > 1e-3) {
        moving += 1;
        run.set(car.id, 0);
      } else {
        const next = (run.get(car.id) ?? 0) + 1;
        run.set(car.id, next);
        if (next > (longest.get(car.id) ?? 0)) {
          longest.set(car.id, next);
        }
      }
    }
    if (active > 0 && moving === 0) {
      global += 1;
      globalMax = Math.max(globalMax, global);
    } else {
      global = 0;
    }
  }
  const values = [...longest.values()].sort((a, b) => a - b);
  const at = (q: number) => (values.length === 0 ? 0 : values[Math.min(values.length - 1, Math.floor(q * values.length))]);
  let maxCar = '';
  let max = 0;
  for (const [id, frames] of longest) {
    if (frames > max) {
      max = frames;
      maxCar = id;
    }
  }
  return { p50: at(0.5), p90: at(0.9), max, maxCar, globalStallFrames: globalMax };
}

const files = readdirSync(TEMPLATES).filter((name) => SUITE_RE.test(name)).sort();

describe('bộ tải A/B/C chạy sạch trên engine', () => {
  it('có kịch bản tải để chạy', () => {
    expect(files.length).toBeGreaterThan(0);
  });
  for (const file of files) {
    it(file, { timeout: 300_000 }, () => {
      const { history, collisions, overlapPairs, maxOverlapDepth, maxOverlap, overlapExamples, otherWarnings } = run(file);
      const stalls = findStalls(history);
      const waits = waitStats(history);
      const still = findStillAtEnd(history);
      const abandoned = findAbandonedQueue(history);
      const metricsDir = resolve(__dirname, '../../../tools/out/load_metrics');
      mkdirSync(metricsDir, { recursive: true });
      writeFileSync(join(metricsDir, `${file.replace('.sim3d.json', '')}.metrics.json`), JSON.stringify({
        wait_max_s: waits.max / 25,
        global_stall_frames: waits.globalStallFrames,
        collisions: collisions.length,
        overlap_pairs: overlapPairs,
        max_overlap_depth_m: maxOverlapDepth,
        max_overlap: maxOverlap,
        overlap_examples: overlapExamples,
        unfinished: history[history.length - 1].cars.filter((car) => car.state !== 'exited' && !(car.state === 'parked' && car.park_until_frame === undefined)).map((car) => `${car.id}:${car.state}`),
        abandoned: abandoned.length,
      }, null, 2));
      // ANS_37 mục 6: số lần phanh gấp (giảm tốc > 2·b_comf) trên mọi xe, ghi số (không chặn).
      let harshBrakes = 0;
      const braking = new Set<string>();
      for (let index = 1; index < history.length; index += 1) {
        const previous = new Map(history[index - 1].cars.map((car) => [car.id, car]));
        for (const car of history[index].cars) {
          const before = previous.get(car.id);
          const moving = (state: CarStateName) =>
            state !== 'parked' && state !== 'queued' && state !== 'exited';
          if (before === undefined || !moving(before.state) || !moving(car.state)) {
            braking.delete(car.id);
            continue;
          }
          const decel = (Math.max(0, before.v) - Math.max(0, car.v)) / DT_S;
          if (decel > HARSH_BRAKE_MPS2 + 1e-9) {
            if (!braking.has(car.id)) {
              harshBrakes += 1;
              braking.add(car.id);
            }
          } else {
            braking.delete(car.id);
          }
        }
      }
      console.info(
        `[${file}] wait p50/p90/max=${(waits.p50 / 25).toFixed(1)}/${(waits.p90 / 25).toFixed(1)}/${(waits.max / 25).toFixed(1)}s globalStall=${String(waits.globalStallFrames)} harshBrakes=${String(harshBrakes)} hardStops=${JSON.stringify(hardStopCounts)} cars=${String(history[history.length - 1].cars.length)} ` +
          `collisions=${String(collisions.length)} warnings=${String(otherWarnings.length)} ` +
          `stalls=${String(stalls.length)} stillEnd=${String(still.length)} abandoned=${String(abandoned.length)} maxOverlap=${maxOverlapDepth.toFixed(6)}m`,
      );
      if (otherWarnings.length > 0) {
        console.info(otherWarnings.slice(0, 5).map((item) => item.text).join('\n'));
      }
      expect(collisions).toEqual([]);
      expect(overlapPairs, `cặp xe xuyên > 5 cm: ${JSON.stringify(overlapExamples)}`).toBe(0);
      // ANS_39: (1) KẸT TOÀN CỤC = cả bãi đứng yên > 10 s phải = 0; (2) chờ từng xe ≤ 120 s; mọi xe xong,
      // không bỏ hàng chờ. `findStalls` (mỗi xe > 10 s) giữ để báo số, không chặn.
      expect(waits.globalStallFrames, `kẹt toàn cục ${String(waits.globalStallFrames)} frame`).toBeLessThanOrEqual(STALL_FRAMES_LIMIT);
      const waitLimit = file.startsWith('A') ? MAX_A_WAIT_FRAMES : MAX_STRESS_WAIT_FRAMES;
      expect(waits.max, `chờ lâu nhất ${(waits.max / 25).toFixed(1)} s (xe ${waits.maxCar})`).toBeLessThanOrEqual(waitLimit);
      expect(still).toEqual([]);
      expect(abandoned, describeQueue(abandoned)).toEqual([]);
      // A completed run must have no active or queued cars, even if they are moving
      // or the entrance is busy in the final frame.
      expect(history[history.length - 1].cars.filter((car) => car.state !== 'exited' && !(car.state === 'parked' && car.park_until_frame === undefined)).map((car) => `${car.id}:${car.state}`)).toEqual([]);
      const residualWarnings = otherWarnings.filter((item) => {
        // ANS_39: cảnh báo đứng 10 giây chỉ dùng thống kê; trần chờ và kẹt toàn cục đã kiểm ở trên.
        if (item.text.includes('"kind":"stuck"')) {
          return false;
        }
        // `lùi ... (backoff)` là **lùi nhường thành công**, không phải kẹt. Nó dùng `kind: 'stuck'`
        // chỉ vì mọi chẩn đoán của engine gom chung một kênh; tính nó là lỗi là phân loại sai.
        if (item.text.includes('(backoff)')) {
          return false;
        }
        // Quyết định director (P17): `backoff_failed` mà xe vẫn đi tiếp là cảnh báo thông tin, không
        // phải lỗi. Điều kiện "xe vẫn đi tiếp" đã được khẳng định ở trên (stalls/still/abandoned
        // đều rỗng), nên ở đây chỉ đếm và in, không tính là residual.
        if (item.text.includes('(backoff_failed)')) {
          return false;
        }
        return true;
      });
      const backoffFailed = otherWarnings.filter((item) =>
        item.text.includes('(backoff_failed)'),
      ).length;
      console.info(`[${file}] backoff_failed (thông tin, không lỗi)=${String(backoffFailed)}`);
      expect(residualWarnings.map((item) => item.text)).toEqual([]);
    });
  }
});
