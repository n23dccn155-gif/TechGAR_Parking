"""Kiểm một thư mục export của SIM3D: PASS/FAIL + danh sách lỗi.

Công cụ dòng lệnh cho người soát video: trỏ vào **một thư mục run** (thư mục có
``gt_frames.csv`` / ``gt_events.csv``) và in ra kết luận PASS/FAIL kèm lỗi cụ thể::

    python sim3d/tools/check_export.py sim3d/data/runs/20261106-024404_L_sang_20
    python sim3d/tools/check_export.py <run_dir> --json ket_qua.json

Tiêu chí (giống harness của coders-3, ``p20c_run10.py`` → ``p19f_verify.py``):

1. **va chạm** — cảnh báo ``collision`` của engine: 0;
2. **chồng xe > 5 cm** (SAT / từng frame): 0 cặp;
3. **xe kẹt toàn cục > 10 s** (250 frame liên tiếp mọi xe đang chạy đều đứng yên): 0;
4. **xe chưa xong cuối video** (``queued``/``moving``… không ``exited`` và không ``parked``
   tới hết): 0;
5. **bị từ chối** (``event_rejected``): 0.

.. warning::

   **``gt_frames.csv`` không đủ để tự kiểm chồng xe.** File đó chỉ có ô đỗ 0/1 và
   toạ độ **ảnh** ``_u/_v`` của tâm xe — **không có hướng (heading)** và không có kích
   thước, nên không thể dựng lại hình chữ nhật có hướng để chạy SAT. Vì vậy công cụ này
   **chạy lại engine** từ ``scenario.sim3d.json`` nằm ngay trong thư mục export (file này
   do bước export ghi kèm, nội dung trùng kịch bản đã render), rồi mới đo trên trạng thái
   thật của từng frame.

   Hệ quả: cần ``scenario.sim3d.json`` trong thư mục run, và cần chạy được ``vitest``
   (dùng lại đúng module engine, **không sửa** ``src/sim``).

Tốc độ: engine chạy nhanh hơn render nhiều (L_sang_20 = 30 000 frame mất vài phút CPU).
"""

from __future__ import annotations

import argparse
import json
import os
import pathlib
import shutil
import subprocess
import sys

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

REPO = pathlib.Path(__file__).resolve().parents[2]
WEB = REPO / "sim3d" / "web"
HARNESS = WEB / "src" / "sim" / "__diag_check_export.test.ts"

# Ngưỡng — giữ đúng hằng số của harness coders-3 / engine.
MAX_OVERLAP_DEPTH_M = 0.05          # `sim/collision.ts`: MAX_OVERLAP_DEPTH_M
STALL_LIMIT_FRAMES = 250            # 10 s ở 25 fps
FPS = 25

HARNESS_SOURCE = '''/**
 * check_export.py — CHỈ ĐỌC: chạy hết video, báo mọi vi phạm để kết luận PASS/FAIL.
 *
 * File này do `sim3d/tools/check_export.py` sinh ra rồi **xoá ngay** sau khi chạy.
 * Không sửa engine.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { it } from 'vitest';
import type { LotMap } from '../contracts/lot';
import type { Scenario } from '../contracts/scenario';
import type { SimEvent } from '../contracts/events';
import lotJson from '../../../data/lot/lot_pucpr.json';
import { advanceSimState, createSimState, setWaitSink } from './engine';
import { DT_S } from './constants';
import { carRect, penetrationDepth, MAX_OVERLAP_DEPTH_M } from './collision';

const lot = lotJson as unknown as LotMap;
const FILE = process.env.CHECK_SCENE === undefined ? undefined : resolve(process.env.CHECK_SCENE);
const OUT = process.env.CHECK_OUT === undefined ? undefined : resolve(process.env.CHECK_OUT);
const STALL_LIMIT = Number(process.env.CHECK_STALL_LIMIT ?? '250');
const MAX_REPORT = 40;

it.skipIf(FILE === undefined)('check_export', { timeout: 6 * 60 * 60 * 1000 }, () => {
  const template = JSON.parse(readFileSync(FILE as string, 'utf-8')) as Scenario & {
    events: SimEvent[];
  };
  let state = createSimState(lot, { ...template, lot: lot.name });

  const byFrame = new Map<number, SimEvent[]>();
  for (const event of template.events) {
    const list = byFrame.get(event.frame);
    if (list === undefined) byFrame.set(event.frame, [event]);
    else list.push(event);
  }

  const overlaps: {
    frame: number; a: string; b: string; depth_m: number;
    a_state: string; b_state: string; a_slot: string | null; b_slot: string | null;
  }[] = [];
  let overlapFrames = 0;
  let maxDepth = 0;
  let maxDepthMeta: unknown = null;

  const collisions: { frame: number; message: string }[] = [];
  const rejections: { frame: number; message: string }[] = [];

  let stallRun = 0;
  let maxStall = 0;
  let stallStart = -1;
  let worstStall: { start_frame: number; frames: number } | null = null;

  let maxSlots = 0;
  let maxCars = 0;
  let lastExitFrame = 0;
  const exitSeen = new Set<string>();
  let processedFrames = 0;

  for (let frame = 0; frame < template.duration_frames; frame += 1) {
    const due = byFrame.get(state.frame) ?? [];
    const waitReasons = new Map<string, string>();
    setWaitSink(waitReasons);
    state = advanceSimState(lot, state, { frame: state.frame, events: due }, DT_S);

    // 1 + 2. Va chạm (cảnh báo engine) và chồng xe > 5 cm (SAT từng frame).
    for (const warning of state.warnings) {
      if (warning.kind === 'event_rejected' && rejections.length < MAX_REPORT) {
        rejections.push({ frame, message: warning.message });
      }
      if (warning.kind === 'collision' && collisions.length < MAX_REPORT) {
        collisions.push({ frame, message: warning.message });
      }
    }

    const present = state.cars.filter((car) => car.state !== 'exited');
    let frameHasOverlap = false;
    for (let i = 0; i < present.length; i += 1) {
      const a = present[i];
      const radiusA = Math.hypot(a.length, a.width) / 2;
      for (let j = i + 1; j < present.length; j += 1) {
        const b = present[j];
        // Mỗi hình chữ nhật nằm trong đường tròn ngoại tiếp ⇒ lọc nhanh trước khi SAT.
        if (Math.hypot(a.pose.x - b.pose.x, a.pose.y - b.pose.y) >= radiusA + Math.hypot(b.length, b.width) / 2) {
          continue;
        }
        const depth = penetrationDepth(carRect(a), carRect(b));
        if (depth > maxDepth) {
          maxDepth = depth;
          maxDepthMeta = {
            frame, a: a.id, b: b.id, a_state: a.state, b_state: b.state,
            a_slot: a.slot, b_slot: b.slot,
          };
        }
        if (depth > MAX_OVERLAP_DEPTH_M) {
          frameHasOverlap = true;
          if (overlaps.length < MAX_REPORT) {
            overlaps.push({
              frame, a: a.id, b: b.id, depth_m: depth,
              a_state: a.state, b_state: b.state, a_slot: a.slot, b_slot: b.slot,
            });
          }
        }
      }
    }
    if (frameHasOverlap) overlapFrames += 1;

    // 3. Kẹt toàn cục: mọi xe đang chạy đều đứng yên.
    const active = present.filter(
      (car) => car.state !== 'queued' && car.state !== 'parked',
    );
    const stalled = active.length > 0 && active.every((car) => Math.abs(car.v) <= 1e-3);
    if (stalled) {
      if (stallRun === 0) stallStart = frame;
      stallRun += 1;
      if (stallRun > maxStall) {
        maxStall = stallRun;
        worstStall = { start_frame: stallStart, frames: stallRun };
      }
    } else {
      stallRun = 0;
    }

    // Số ô đang giữ + số xe còn trong bãi (để báo cáo).
    let held = 0;
    let alive = 0;
    for (const car of state.cars) {
      if (car.state === 'exited') {
        if (!exitSeen.has(car.id)) {
          exitSeen.add(car.id);
          lastExitFrame = frame;
        }
        continue;
      }
      alive += 1;
      if (car.slot !== null) held += 1;
    }
    if (held > maxSlots) maxSlots = held;
    if (alive > maxCars) maxCars = alive;

    processedFrames = frame + 1;
  }

  // 4. Xe chưa xong cuối video. `parked` mà không còn `park_until_frame` = đỗ tới hết ⇒ hợp lệ.
  const unfinished = state.cars
    .filter((car) => car.state !== 'exited' && !(car.state === 'parked' && car.park_until_frame === undefined))
    .map((car) => ({ id: car.id, state: car.state, slot: car.slot }));
  const stillMoving = state.cars
    .filter((car) => car.state !== 'parked' && car.state !== 'exited' && Math.abs(car.v) > 0.05)
    .map((car) => car.id);

  const failures: string[] = [];
  if (processedFrames !== template.duration_frames) {
    failures.push(`chạy thiếu frame: ${processedFrames}/${template.duration_frames}`);
  }
  if (collisions.length > 0) failures.push(`va chạm: ${collisions.length} cảnh báo`);
  if (overlaps.length > 0) failures.push(`chồng xe > 5 cm: ${overlaps.length} cặp`);
  if (maxStall > STALL_LIMIT) failures.push(`kẹt toàn cục ${maxStall} frame > ${STALL_LIMIT}`);
  if (unfinished.length > 0) failures.push(`xe chưa xong cuối video: ${unfinished.length} xe`);
  if (stillMoving.length > 0) failures.push(`xe còn chạy cuối video: ${stillMoving.length} xe`);
  if (rejections.length > 0) failures.push(`bị từ chối: ${rejections.length} sự kiện`);

  writeFileSync(
    OUT as string,
    JSON.stringify(
      {
        ok: failures.length === 0,
        failures,
        duration_frames: template.duration_frames,
        processed_frames: processedFrames,
        cars: state.cars.length,
        collisions,
        overlaps,
        overlap_frames: overlapFrames,
        max_overlap_depth_m: maxDepth,
        max_overlap_meta: maxDepthMeta,
        global_stall_frames: maxStall,
        worst_stall: worstStall,
        unfinished,
        stillMoving,
        rejections,
        maxSlotsHeld: maxSlots,
        maxCarsInLot: maxCars,
        slotsTotal: lot.slots.length,
        lastExit_s: Math.round((lastExitFrame / 25) * 10) / 10,
      },
      null,
      1,
    ),
  );
});
'''


class CheckError(RuntimeError):
    """Lỗi môi trường (thiếu file, vitest hỏng) — khác với kết luận FAIL của video."""


def find_scene(run_dir: pathlib.Path) -> pathlib.Path:
    """Tìm `scenario.sim3d.json` trong thư mục run (export ghi kèm)."""
    candidates = [
        run_dir / "scenario.sim3d.json",
        *sorted(run_dir.glob("*.sim3d.json")),
    ]
    for candidate in candidates:
        if candidate.is_file():
            return candidate
    raise CheckError(
        f"không thấy scenario.sim3d.json trong {run_dir} — "
        "thư mục này không phải một run export đầy đủ"
    )


def check_rows(run_dir: pathlib.Path) -> dict[str, int]:
    """Đếm dòng `gt_frames.csv` / `gt_events.csv` để đối chiếu với engine."""
    counts: dict[str, int] = {}
    frames = run_dir / "gt_frames.csv"
    if frames.is_file():
        with frames.open(encoding="utf-8", errors="replace") as handle:
            counts["gt_frames_rows"] = max(0, sum(1 for _ in handle) - 1)
    events = run_dir / "gt_events.csv"
    if events.is_file():
        with events.open(encoding="utf-8", errors="replace") as handle:
            counts["gt_events_rows"] = max(0, sum(1 for _ in handle) - 1)
    return counts


def run_engine(scene: pathlib.Path, out: pathlib.Path, stall_limit: int) -> dict:
    """Chạy engine thật trên `scene`, trả kết quả đo được (hoặc ném CheckError)."""
    HARNESS.parent.mkdir(parents=True, exist_ok=True)
    HARNESS.write_text(HARNESS_SOURCE, encoding="utf-8")
    out.unlink(missing_ok=True)
    try:
        env = dict(os.environ)
        env["CHECK_SCENE"] = str(scene.resolve())
        env["CHECK_OUT"] = str(out.resolve())
        env["CHECK_STALL_LIMIT"] = str(stall_limit)
        env["PATH"] = r"C:\Program Files\nodejs;" + env.get("PATH", "")
        proc = subprocess.run(
            ["npx.cmd", "vitest", "run", "src/sim/__diag_check_export.test.ts"],
            cwd=str(WEB),
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            env=env,
        )
        if proc.returncode != 0 or not out.is_file():
            detail = ((proc.stdout or "") + (proc.stderr or "")).strip().splitlines()[-12:]
            raise CheckError("engine không chạy được:\n  " + "\n  ".join(detail))
    finally:
        HARNESS.unlink(missing_ok=True)
    return json.loads(out.read_text(encoding="utf-8"))


def report(run_dir: pathlib.Path, data: dict, counts: dict[str, int]) -> str:
    """Dựng báo cáo văn bản cho người đọc."""
    verdict = "PASS" if data["ok"] else "FAIL"
    lines = [f"{verdict}  {run_dir}"]
    lines.append(
        f"  frame: {data['processed_frames']}/{data['duration_frames']} · "
        f"xe: {data['cars']} · ô đỉnh: {data['maxSlotsHeld']}/{data['slotsTotal']} · "
        f"xe ra cuối: {data['lastExit_s']:.1f}s"
    )

    def mark(condition_ok: bool) -> str:
        return "OK  " if condition_ok else "LỖI "

    lines.append(f"  {mark(not data['collisions'])}va chạm: {len(data['collisions'])}")
    lines.append(
        f"  {mark(not data['overlaps'])}chồng xe > 5 cm: {len(data['overlaps'])} cặp "
        f"(sâu nhất {data['max_overlap_depth_m'] * 100:.3f} cm)"
    )
    lines.append(
        f"  {mark(data['global_stall_frames'] <= STALL_LIMIT_FRAMES)}"
        f"kẹt toàn cục: {data['global_stall_frames']} frame "
        f"({data['global_stall_frames'] / FPS:.1f}s)"
    )
    lines.append(f"  {mark(not data['unfinished'])}xe chưa xong cuối video: {len(data['unfinished'])}")
    lines.append(f"  {mark(not data['stillMoving'])}xe còn chạy cuối video: {len(data['stillMoving'])}")
    lines.append(f"  {mark(not data['rejections'])}bị từ chối: {len(data['rejections'])}")

    if counts.get("gt_frames_rows") is not None:
        same = counts["gt_frames_rows"] == data["duration_frames"]
        lines.append(
            f"  {mark(same)}gt_frames.csv: {counts['gt_frames_rows']} dòng "
            f"(engine {data['duration_frames']})"
        )
    if counts.get("gt_events_rows") is not None:
        lines.append(f"  OK  gt_events.csv: {counts['gt_events_rows']} dòng")

    if data["overlaps"]:
        lines.append("  cặp chồng nhau:")
        for clip in data["overlaps"]:
            lines.append(
                f"    f={clip['frame']:>6} ({clip['frame'] / FPS:>7.1f}s) "
                f"{clip['a']} [{clip['a_state']}, {clip['a_slot']}] × "
                f"{clip['b']} [{clip['b_state']}, {clip['b_slot']}] "
                f"= {clip['depth_m'] * 100:.3f} cm"
            )
    if data["collisions"]:
        lines.append("  va chạm:")
        for item in data["collisions"]:
            lines.append(f"    f={item['frame']:>6} {item['message']}")
    if data["unfinished"]:
        lines.append("  xe chưa xong:")
        for car in data["unfinished"]:
            lines.append(f"    {car['id']}: {car['state']} (ô {car['slot']})")
    if data["stillMoving"]:
        lines.append("  xe còn chạy: " + ", ".join(data["stillMoving"]))
    if data["rejections"]:
        lines.append("  bị từ chối:")
        for item in data["rejections"]:
            lines.append(f"    f={item['frame']:>6} {item['message']}")
    if data["worst_stall"] and data["global_stall_frames"] > STALL_LIMIT_FRAMES:
        worst = data["worst_stall"]
        lines.append(
            f"  kẹt dài nhất: từ frame {worst['start_frame']} "
            f"({worst['start_frame'] / FPS:.1f}s), {worst['frames']} frame"
        )
    return "\n".join(lines)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description=(
            "Kiểm một thư mục export SIM3D: PASS/FAIL + lỗi (va chạm, chồng xe > 5 cm, "
            "kẹt toàn cục > 10 s, xe chưa xong cuối video, bị từ chối).\n\n"
            "LƯU Ý: gt_frames.csv chỉ có ô đỗ 0/1 và toạ độ ẢNH (_u/_v) — KHÔNG có heading, "
            "nên không thể dựng hình chữ nhật để kiểm chồng xe. Vì vậy công cụ chạy LẠI ENGINE "
            "từ scenario.sim3d.json trong thư mục run (không sửa src/sim)."
        ),
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("run_dir", type=pathlib.Path, help="thư mục run export (có gt_frames/gt_events)")
    parser.add_argument("--json", type=pathlib.Path, default=None, help="ghi kết quả JSON ra file này")
    parser.add_argument(
        "--stall-limit",
        type=int,
        default=STALL_LIMIT_FRAMES,
        help=f"số frame kẹt toàn cục tối đa (mặc định {STALL_LIMIT_FRAMES} = 10 s)",
    )
    parser.add_argument(
        "--quiet",
        action="store_true",
        help="chỉ in một dòng kết luận (dùng trong script)",
    )
    args = parser.parse_args(argv)

    run_dir = args.run_dir
    if not run_dir.is_dir():
        print(f"lỗi: {run_dir} không phải thư mục", file=sys.stderr)
        return 2

    try:
        scene = find_scene(run_dir)
        counts = check_rows(run_dir)
        data = run_engine(scene, run_dir / ".check_export.json", args.stall_limit)
    except CheckError as error:
        print(f"lỗi: {error}", file=sys.stderr)
        return 2
    finally:
        (run_dir / ".check_export.json").unlink(missing_ok=True)

    text = report(run_dir, data, counts)
    print(text if not args.quiet else text.splitlines()[0])

    if args.json is not None:
        args.json.parent.mkdir(parents=True, exist_ok=True)
        args.json.write_text(
            json.dumps(
                {"run_dir": str(run_dir), "scene": str(scene), "counts": counts, **data},
                ensure_ascii=False,
                indent=1,
            ),
            encoding="utf-8",
        )
        print(f"đã ghi {args.json}", file=sys.stderr)

    return 0 if data["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
