"""P28 — kiểm GID lúc VÀO == GID lúc RA / lúc đỗ (chỉ đọc predictions có sẵn).

Tiêu chí (anh An, P28):
- Xe GT có ``gate_in_frame`` (bỏ xe ``initial_parked``):
  * có cả ``gate_out_frame``  → ĐẠT nếu GID lúc vào == GID lúc ra;
  * không có ``gate_out_frame`` → ĐẠT nếu GID lúc vào == GID giữ ô GT lúc đỗ
    (fallback: GID của track khớp chính xe đó quanh ``parked_frame``).
- Bỏ qua việc mất ID vài frame: chỉ cần GID đầu tiên (vào) / cuối cùng (ra) nhìn thấy.

Khớp GT ↔ observation: giữ đúng quy ước ``sim3d/tools/m1_track_eval.py``:
GT ``_u/_v`` (khung gốc 400×640) × ``gt_pixel_scale`` (MANIFEST, = 2), riêng cam2 trừ
``240 × scale`` (crop 480 px ở ảnh 800×1280); bán kính ghép 30 px gốc (× scale).
``observations[].anchor_pixel`` đã ở khung ảnh đã cắt của từng cam.
Frame GT 0-based; ``predictions.frame_idx`` 1-based ⇒ ``frame = frame_idx - 1``.

Đọc ``predictions.jsonl`` theo dòng (không nạp cả file vào RAM).

Chạy:
    python sim3d/tools/p28_entry_exit_gid.py --run <RUN> --predictions <predictions.jsonl> --json <out.json>
"""

from __future__ import annotations

import argparse
import csv
import json
import math
import re
import sys
from collections import Counter, defaultdict
from dataclasses import dataclass
from pathlib import Path

BASE_WIDTH = 400
BASE_HEIGHT = 640
CAMERAS = ("cam1", "cam2")
CAMERA_CROPS = {"cam1": 0.0, "cam2": 240.0}
DEFAULT_RADIUS_PX = 30.0
DEFAULT_ENTRY_WINDOW = 250
DEFAULT_PARK_WINDOW = 200
FRAME_RE = re.compile(r'"frame_idx":\s*(\d+)')


def _maybe_int(value: str | None) -> int | None:
    if value is None or str(value).strip() == "":
        return None
    return int(float(value))


def read_gt_events(path: Path) -> dict[str, dict[str, object]]:
    out: dict[str, dict[str, object]] = {}
    with path.open("r", encoding="utf-8", newline="") as handle:
        for row in csv.DictReader(handle):
            car = (row.get("car") or "").strip()
            if not car:
                continue
            out[car] = {
                "car": car,
                "slot": (row.get("slot") or "").strip() or None,
                "gate_in_frame": _maybe_int(row.get("gate_in_frame")),
                "parked_frame": _maybe_int(row.get("parked_frame")),
                "depart_frame": _maybe_int(row.get("depart_frame")),
                "gate_out_frame": _maybe_int(row.get("gate_out_frame")),
                "initial_parked": _maybe_int(row.get("initial_parked")) == 1,
                "note": (row.get("gate_note") or "").strip(),
            }
    return out


def read_gt_frames(path: Path, cars: set[str]) -> dict[str, dict[int, tuple[float, float, str]]]:
    """``gt_frames.csv`` → ``{car: {frame: (u, v, cams)}}`` chỉ cho các xe cần đo."""
    out: dict[str, dict[int, tuple[float, float, str]]] = {car: {} for car in cars}
    with path.open("r", encoding="utf-8", newline="") as handle:
        reader = csv.reader(handle)
        try:
            header = next(reader)
        except StopIteration:
            return out
        index = {name: position for position, name in enumerate(header)}
        try:
            frame_at = index["frame"]
        except KeyError:
            return out
        for row in reader:
            if not row:
                continue
            try:
                frame = int(row[frame_at])
            except (ValueError, IndexError):
                continue
            for car in cars:
                iu = index.get(f"{car}_u")
                iv = index.get(f"{car}_v")
                ic = index.get(f"{car}_cams")
                if iu is None or iv is None or iu >= len(row) or iv >= len(row):
                    continue
                if not row[iu].strip() or not row[iv].strip():
                    continue
                try:
                    u = float(row[iu])
                    v = float(row[iv])
                except ValueError:
                    continue
                cams = row[ic] if ic is not None and ic < len(row) else ""
                out[car][frame] = (u, v, cams)
    return out


def manifest_scale(run_dir: Path) -> tuple[float, int, int]:
    path = run_dir / "techgar_config" / "MANIFEST.json"
    data: dict[str, object] = {}
    if path.exists():
        try:
            loaded = json.loads(path.read_text(encoding="utf-8"))
            if isinstance(loaded, dict):
                data = loaded
        except (OSError, json.JSONDecodeError):
            data = {}
    width, height, scale = BASE_WIDTH, BASE_HEIGHT, 1.0
    size = data.get("image_size")
    if isinstance(size, (list, tuple)) and len(size) == 2:
        width, height = int(size[0]), int(size[1])
        scale = width / BASE_WIDTH if BASE_WIDTH else 1.0
    declared = data.get("gt_pixel_scale")
    if isinstance(declared, (int, float)) and float(declared) > 0:
        scale = float(declared)
    else:
        raw = data.get("s")
        if isinstance(raw, (int, float)) and float(raw) > 0:
            scale = float(raw)
    return scale, width, height


def anchor_of(obs: dict[str, object]) -> tuple[float, float] | None:
    anchor = obs.get("anchor_pixel")
    if isinstance(anchor, dict):
        try:
            return float(anchor["x"]), float(anchor["y"])
        except (KeyError, TypeError, ValueError):
            pass
    bbox = obs.get("bbox")
    if isinstance(bbox, (list, tuple)) and len(bbox) >= 4:
        try:
            x, y, w, h = (float(v) for v in bbox[:4])
            return x + w / 2.0, y + h
        except (TypeError, ValueError):
            return None
    return None


@dataclass
class Match:
    frame: int
    cam: str
    gid: int | None
    local: int | None
    dist: float


def stream_predictions(
    path: Path,
    *,
    gt: dict[str, dict[int, tuple[float, float, str]]],
    needed_frames: set[int],
    slots: dict[str, set[int]],
    scale: float,
    radius: float,
) -> tuple[dict[str, list[Match]], dict[str, dict[str, list[tuple]]], int]:
    """Một lượt đọc theo dòng: ghép GT ↔ observation + gom trạng thái ô theo slot."""
    matches: dict[str, list[Match]] = defaultdict(list)
    slot_state: dict[str, dict[str, list[tuple]]] = {
        slot: {"reservations": [], "episodes": [], "slots_gid": []} for slot in slots
    }
    frame_to_slots: dict[int, set[str]] = defaultdict(set)
    for slot, frames in slots.items():
        for frame in frames:
            frame_to_slots[frame].add(slot)
    seen = 0
    with path.open("r", encoding="utf-8") as handle:
        for line in handle:
            found = FRAME_RE.search(line[:200])
            record = None
            if found:
                frame_idx = int(found.group(1))
            else:
                # frame_idx khong nam o dau dong (vd key da sap xep): doc JSON that
                try:
                    record = json.loads(line)
                    frame_idx = int(record.get("frame_idx"))
                except (ValueError, TypeError):
                    continue
            frame = frame_idx - 1
            if frame not in needed_frames:
                continue
            if record is None:
                record = json.loads(line)
            seen += 1
            obs_by_cam: dict[str, list[tuple[float, float, int | None, int | None]]] = {
                cam: [] for cam in CAMERAS
            }
            for obs in record.get("observations") or []:
                if not isinstance(obs, dict) or obs.get("observation_kind") != "detection":
                    continue
                cam = str(obs.get("camera_id"))
                if cam not in CAMERAS:
                    continue
                anchor = anchor_of(obs)
                if anchor is None:
                    continue
                gid = obs.get("canonical_gid")
                gid_value = int(gid) if gid not in (None, "") else None
                local_raw = obs.get("local_track_id")
                try:
                    local = int(local_raw) if local_raw is not None else None
                except (TypeError, ValueError):
                    local = None
                obs_by_cam[cam].append((anchor[0], anchor[1], gid_value, local))

            candidates: list[tuple[float, str, str, int]] = []
            for car, points in gt.items():
                point = points.get(frame)
                if point is None:
                    continue
                u, v, cams = point
                for cam in cams.split("+"):
                    if cam not in CAMERAS:
                        continue
                    x = u * scale - CAMERA_CROPS[cam] * scale
                    y = v * scale
                    for index, obs in enumerate(obs_by_cam[cam]):
                        distance = math.hypot(obs[0] - x, obs[1] - y)
                        if distance <= radius:
                            candidates.append((distance, car, cam, index))
            candidates.sort()
            assigned: dict[str, tuple[str, int, float]] = {}
            used: set[tuple[str, int]] = set()
            for distance, car, cam, index in candidates:
                if car in assigned or (cam, index) in used:
                    continue
                assigned[car] = (cam, index, distance)
                used.add((cam, index))
            for car, (cam, index, distance) in assigned.items():
                obs = obs_by_cam[cam][index]
                matches[car].append(
                    Match(
                        frame=frame,
                        cam=cam,
                        gid=obs[2],
                        local=obs[3],
                        dist=round(distance, 2),
                    )
                )

            for slot in frame_to_slots.get(frame, ()):
                for res in record.get("parked_identity_reservations") or []:
                    if isinstance(res, dict) and res.get("slot_id") == slot:
                        slot_state[slot]["reservations"].append(
                            (
                                frame,
                                res.get("canonical_gid"),
                                res.get("state"),
                                res.get("camera_id"),
                            )
                        )
                for episode in record.get("parking_episodes") or []:
                    if isinstance(episode, dict) and episode.get("slot_id") == slot:
                        slot_state[slot]["episodes"].append(
                            (
                                frame,
                                episode.get("global_id"),
                                episode.get("state"),
                                episode.get("applied_frame_idx"),
                            )
                        )
                for slot_row in record.get("slots") or []:
                    if isinstance(slot_row, dict) and slot_row.get("slot_id") == slot:
                        gid = slot_row.get("canonical_vehicle_gid")
                        if gid is not None:
                            slot_state[slot]["slots_gid"].append(
                                (frame, gid, slot_row.get("camera_id"))
                            )
    return matches, slot_state, seen


def pick_entry(matches: list[Match], gate_in: int, window: int) -> tuple[Match | None, Match | None]:
    inside = sorted(
        (m for m in matches if gate_in <= m.frame <= gate_in + window),
        key=lambda m: (m.frame, m.cam),
    )
    first = inside[0] if inside else None
    first_gid = next((m for m in inside if m.gid is not None), None)
    return first, first_gid


def pick_exit(matches: list[Match], gate_out: int, window: int) -> tuple[Match | None, Match | None]:
    inside = sorted(
        (m for m in matches if gate_out - window <= m.frame <= gate_out),
        key=lambda m: (m.frame, m.cam),
    )
    last = inside[-1] if inside else None
    last_gid = next((m for m in reversed(inside) if m.gid is not None), None)
    return last, last_gid


def pick_slot_gid(
    state: dict[str, list[tuple]], ref: int, window: int
) -> tuple[int | None, str, dict[str, object]]:
    """GID giữ ô GT quanh ``ref``. Ưu tiên reservation → episode → slots → None."""
    low, high = ref - 10, ref + window
    reservations = [
        (frame, int(gid), state_name, cam)
        for frame, gid, state_name, cam in state["reservations"]
        if low <= frame <= high and gid not in (None, "") and state_name in ("parked", "reserved", "confirmed")
    ]
    episodes = [
        (frame, int(gid), state_name, applied)
        for frame, gid, state_name, applied in state["episodes"]
        if low <= frame <= high and gid not in (None, "") and state_name == "parked"
    ]
    slots_gid = [
        (frame, int(gid), cam)
        for frame, gid, cam in state["slots_gid"]
        if low <= frame <= high
    ]
    detail: dict[str, object] = {
        "reservations_in_window": sorted({(g, s) for _, g, s, _ in reservations}),
        "episodes_in_window": sorted({(g, s) for _, g, s, _ in episodes}),
        "slots_gid_in_window": sorted({g for _, g, _ in slots_gid}),
    }
    for rows, source in ((reservations, "reservation"), (episodes, "episode"), (slots_gid, "slots")):
        if rows:
            counter = Counter(gid for _, gid, *_ in rows)
            gid, count = counter.most_common(1)[0]
            detail["source"] = source
            detail["votes"] = count
            detail["first_frame"] = min(frame for frame, g, *_ in rows if g == gid)
            return gid, source, detail
    detail["source"] = None
    return None, "", detail


def analyse_car(
    event: dict[str, object],
    matches: list[Match],
    slot_state: dict[str, list[tuple]] | None,
    *,
    entry_window: int,
    park_window: int,
) -> dict[str, object]:
    car = str(event["car"])
    gate_in = event["gate_in_frame"]
    gate_out = event["gate_out_frame"]
    parked = event["parked_frame"]
    result: dict[str, object] = {
        "car": car,
        "slot": event["slot"],
        "gate_in_frame": gate_in,
        "gate_out_frame": gate_out,
        "parked_frame": parked,
        "note": event["note"],
        "group": "in+out" if gate_out is not None else "in_only",
    }
    matches = sorted(matches, key=lambda m: (m.frame, m.cam))
    first, first_gid = pick_entry(matches, int(gate_in), entry_window)
    result["first_match"] = (
        None if first is None else
        {"frame": first.frame, "cam": first.cam, "gid": first.gid, "local": first.local}
    )
    result["entry"] = (
        None if first_gid is None else
        {"frame": first_gid.frame, "cam": first_gid.cam, "gid": first_gid.gid,
         "offset": first_gid.frame - int(gate_in)}
    )

    entry_gid = None if first_gid is None else first_gid.gid

    if gate_out is not None:
        last, last_gid = pick_exit(matches, int(gate_out), entry_window)
        result["exit"] = (
            None if last_gid is None else
            {"frame": last_gid.frame, "cam": last_gid.cam, "gid": last_gid.gid,
             "offset": int(gate_out) - last_gid.frame}
        )
        exit_gid = None if last_gid is None else last_gid.gid
        result["gid_in"] = entry_gid
        result["gid_out"] = exit_gid
        result["pass"] = entry_gid is not None and entry_gid == exit_gid
        result["reason"] = (
            "ok" if result["pass"]
            else ("no_gid_at_entry" if entry_gid is None
                  else ("no_gid_at_exit" if exit_gid is None else "gid_changed"))
        )
        return result

    # Nhóm vào nhưng chưa ra: so GID lúc vào với GID giữ ô lúc đỗ.
    ref = int(parked) if parked is not None else (matches[-1].frame if matches else int(gate_in))
    slot_gid, source, detail = (
        pick_slot_gid(slot_state, ref, park_window) if slot_state is not None else (None, "", {})
    )
    # Chỉ xét track trong đúng cửa sổ đỗ. Trước đây lấy ``matches[-1]`` nên có thể
    # vớ phải một fragment ở cuối video (V040: gid 45 tại f5592 trong khi đỗ ở f790).
    park_low, park_high = ref - 10, ref + park_window
    track_park = next(
        (
            m
            for m in reversed(matches)
            if park_low <= m.frame <= park_high and m.gid is not None
        ),
        None,
    )
    result["slot_gid"] = slot_gid
    result["slot_source"] = source
    result["slot_detail"] = detail
    result["track_gid_at_park"] = (
        None if track_park is None else
        {"frame": track_park.frame, "cam": track_park.cam, "gid": track_park.gid}
    )
    used_gid = slot_gid if slot_gid is not None else (
        None if track_park is None else track_park.gid
    )
    result["gid_in"] = entry_gid
    result["gid_slot"] = used_gid
    result["gid_slot_source"] = source or ("track" if track_park is not None else None)
    result["pass"] = entry_gid is not None and used_gid is not None and entry_gid == used_gid
    result["reason"] = (
        "ok" if result["pass"]
        else ("no_gid_at_entry" if entry_gid is None
              else ("no_gid_at_slot" if used_gid is None else "gid_changed"))
    )
    return result


def analyse_reference_departure(
    event: dict[str, object],
    matches: list[Match],
    *,
    window: int,
    motion_frame: int | None,
) -> dict[str, object]:
    """Tham khảo (NGOÀI tiêu chí P28): xe ``initial_parked`` có ``gate_out``.

    So GID từ lúc tâm GT dịch >=1 px gốc so với ``depart_frame`` với GID lúc RA.
    Giữ ``depart_frame`` để đối chiếu thời điểm đổi state của simulator.
    """
    car = str(event["car"])
    depart = event["depart_frame"]
    gate_out = event["gate_out_frame"]
    result: dict[str, object] = {
        "car": car,
        "slot": event["slot"],
        "depart_frame": depart,
        "motion_frame": motion_frame,
        "gate_out_frame": gate_out,
        "group": "ref_init_parked",
    }
    matches = sorted(matches, key=lambda m: (m.frame, m.cam))
    first, first_gid = (pick_entry(matches, motion_frame, window)
                        if motion_frame is not None else (None, None))
    last, last_gid = pick_exit(matches, int(gate_out), window)
    result["gid_out_start"] = None if first_gid is None else first_gid.gid
    result["gid_out_end"] = None if last_gid is None else last_gid.gid
    result["exit_start"] = (
        None if first_gid is None else
        {"frame": first_gid.frame, "cam": first_gid.cam, "gid": first_gid.gid,
         "offset": first_gid.frame - motion_frame}
    )
    result["exit_end"] = (
        None if last_gid is None else
        {"frame": last_gid.frame, "cam": last_gid.cam, "gid": last_gid.gid,
         "offset": int(gate_out) - last_gid.frame}
    )
    result["pass"] = (
        first_gid is not None and last_gid is not None and first_gid.gid == last_gid.gid
    )
    result["reason"] = (
        "ok" if result["pass"]
        else ("no_gt_motion" if motion_frame is None else "no_gid_at_depart" if first_gid is None
              else ("no_gid_at_exit" if last_gid is None else "gid_changed"))
    )
    return result


def build_needed_frames(
    events: dict[str, dict[str, object]],
    gt: dict[str, dict[int, tuple[float, float, str]]],
    *,
    entry_window: int,
    park_window: int,
) -> tuple[set[int], dict[str, set[int]]]:
    frames: set[int] = set()
    slots: dict[str, set[int]] = {}
    for car, event in events.items():
        gate_in = event["gate_in_frame"]
        if gate_in is None:
            continue
        frames.update(range(int(gate_in), int(gate_in) + entry_window + 1))
        if event["gate_out_frame"] is not None:
            frames.update(range(int(event["gate_out_frame"]) - entry_window, int(event["gate_out_frame"]) + 1))
        parked = event["parked_frame"]
        ref = int(parked) if parked is not None else max(gt[car].keys(), default=int(gate_in))
        frames.update(range(ref - 10, ref + park_window + 1))
        slot = event["slot"]
        if slot:
            slots.setdefault(str(slot), set()).update(range(ref - 10, ref + park_window + 1))
    return frames, slots


def run_case(
    run_dir: Path,
    predictions: Path,
    *,
    entry_window: int,
    park_window: int,
    radius_px: float,
    skip_initial_parked: bool = True,
    include_reference_departures: bool = False,
) -> dict[str, object]:
    events = read_gt_events(run_dir / "gt_events.csv")
    target = {
        car: event
        for car, event in events.items()
        if event["gate_in_frame"] is not None
        and not (skip_initial_parked and event["initial_parked"])
    }
    reference = {
        car: event
        for car, event in events.items()
        if include_reference_departures
        and event["initial_parked"]
        and event["gate_in_frame"] is None
        and event["depart_frame"] is not None
        and event["gate_out_frame"] is not None
    }
    gt = read_gt_frames(run_dir / "gt_frames.csv", set(target) | set(reference))
    scale, width, height = manifest_scale(run_dir)
    radius = radius_px * scale
    needed, slots = build_needed_frames(
        target, gt, entry_window=entry_window, park_window=park_window
    )
    motion_frames = {}
    for car, event in reference.items():
        depart = int(event["depart_frame"])
        gate_out = int(event["gate_out_frame"])
        points = gt.get(car, {})
        origin = points.get(depart)
        motion = next((frame for frame, point in sorted(points.items())
                       if origin is not None and depart <= frame <= gate_out
                       and math.hypot(point[0] - origin[0], point[1] - origin[1]) >= 1.0), None)
        motion_frames[car] = motion
        if motion is not None:
            needed.update(range(motion, motion + entry_window + 1))
        needed.update(range(gate_out - entry_window, gate_out + 1))
    matches, slot_state, parsed = stream_predictions(
        predictions,
        gt=gt,
        needed_frames=needed,
        slots=slots,
        scale=scale,
        radius=radius,
    )
    cars = []
    for car in sorted(target):
        cars.append(
            analyse_car(
                target[car],
                matches.get(car, []),
                slot_state.get(str(target[car]["slot"] or "")),
                entry_window=entry_window,
                park_window=park_window,
            )
        )
    ref_rows = [
        analyse_reference_departure(
            reference[car], matches.get(car, []), window=entry_window, motion_frame=motion_frames[car]
        )
        for car in sorted(reference)
    ]
    groups = {"in+out": [], "in_only": []}
    for row in cars:
        groups[str(row["group"])].append(row)
    summary = {}
    for name, rows in groups.items():
        passed = sum(1 for row in rows if row["pass"])
        summary[name] = {
            "total": len(rows),
            "pass": passed,
            "fail": len(rows) - passed,
            "ratio": (passed / len(rows)) if rows else None,
        }
    ref_summary = {
        "total": len(ref_rows),
        "pass": sum(1 for row in ref_rows if row["pass"]),
    }
    ref_summary["fail"] = ref_summary["total"] - ref_summary["pass"]
    ref_summary["ratio"] = (
        ref_summary["pass"] / ref_summary["total"] if ref_rows else None
    )
    return {
        "run": run_dir.name,
        "predictions": str(predictions),
        "image_size": [width, height],
        "gt_pixel_scale": scale,
        "match_radius_px": radius,
        "entry_window": entry_window,
        "park_window": park_window,
        "frames_parsed": parsed,
        "summary": summary,
        "cars": cars,
        "reference_departures": {"summary": ref_summary, "cars": ref_rows},
        "skipped_initial_parked": sorted(
            car for car, event in events.items()
            if event["initial_parked"] and event["gate_in_frame"] is None
        ),
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="P28: kiểm GID vào == GID ra/đỗ")
    parser.add_argument("--run", type=Path, required=True, help="thư mục run (có gt_events.csv)")
    parser.add_argument("--predictions", type=Path, required=True)
    parser.add_argument("--json", type=Path, default=None)
    parser.add_argument("--entry-window", type=int, default=DEFAULT_ENTRY_WINDOW)
    parser.add_argument("--park-window", type=int, default=DEFAULT_PARK_WINDOW)
    parser.add_argument("--radius-px", type=float, default=DEFAULT_RADIUS_PX)
    parser.add_argument(
        "--reference-departures",
        action="store_true",
        help="thêm bảng THAM KHẢO: xe initial_parked, GID lúc rời chỗ vs lúc ra cổng "
             "(ngoài tiêu chí P28)",
    )
    args = parser.parse_args(argv)

    result = run_case(
        args.run,
        args.predictions,
        entry_window=args.entry_window,
        park_window=args.park_window,
        radius_px=args.radius_px,
        include_reference_departures=args.reference_departures,
    )
    if args.json is not None:
        args.json.parent.mkdir(parents=True, exist_ok=True)
        args.json.write_text(json.dumps(result, ensure_ascii=False, indent=1), encoding="utf-8")
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except (AttributeError, OSError):
        pass
    print(f"Run: {result['run']} · ảnh {result['image_size'][0]}×{result['image_size'][1]}"
          f" · GT×{result['gt_pixel_scale']} · bán kính {result['match_radius_px']:.0f} px"
          f" · frame parse {result['frames_parsed']}")
    for group, row in result["summary"].items():
        ratio = "n/a" if row["ratio"] is None else f"{row['ratio'] * 100:.0f} %"
        print(f"  {group}: {row['pass']}/{row['total']} ({ratio})")
    print(f"  {'xe':4} {'slot':5} {'vào':>5} {'đỗ':>5} {'GID vào':>8} {'GID ra/ô':>9}"
          f" {'nguồn':10} KQ")
    for row in result["cars"]:
        gid_in = "-" if row["gid_in"] is None else str(row["gid_in"])
        if row["group"] == "in+out":
            gid_out = "-" if row.get("gid_out") is None else str(row["gid_out"])
            source = "exit"
        else:
            gid_out = "-" if row.get("gid_slot") is None else str(row["gid_slot"])
            source = str(row.get("gid_slot_source") or "-")
        print(f"  {row['car']:4} {str(row['slot']):5} {str(row['gate_in_frame']):>5}"
              f" {str(row['parked_frame']):>5} {gid_in:>8} {gid_out:>9} {source:10}"
              f" {'ĐẠT' if row['pass'] else 'SAI ' + str(row['reason'])}")

    failures = [row for row in result["cars"] if not row["pass"]]
    if failures:
        print()
        print(f"--- DANH SÁCH SAI ({len(failures)}) ---")
        for row in failures:
            entry = row.get("entry") or {}
            if row["group"] == "in+out":
                other = row.get("exit") or {}
                other_text = (
                    f"GID ra {row.get('gid_out')} @f{other.get('frame')}"
                    if other
                    else f"GID ra {row.get('gid_out')} (không khớp được)"
                )
                frame_out = row.get("gate_out_frame")
            else:
                track = row.get("track_gid_at_park") or {}
                source = row.get("gid_slot_source")
                if row.get("gid_slot") is not None:
                    other_text = f"GID ô {row.get('gid_slot')} (nguồn {source})"
                elif track:
                    other_text = f"GID ô {track.get('gid')} (nguồn track @f{track.get('frame')})"
                else:
                    other_text = "GID ô: không có"
                frame_out = row.get("parked_frame")
            print(
                f"  {row['car']:4} {str(row['slot']):5} "
                f"vào f{row.get('gate_in_frame')} GID {row.get('gid_in')}"
                f"  ->  f{frame_out} {other_text}"
                f"   [{row['reason']}]"
            )
    ref = result["reference_departures"] or {}
    ref_summary = ref.get("summary") or {}
    if ref_summary.get("total"):
        ratio = (
            "n/a" if ref_summary.get("ratio") is None
            else f"{ref_summary['ratio'] * 100:.0f} %"
        )
        print(f"\nTHAM KHẢO (ngoài tiêu chí P28) · initial_parked rời chỗ → ra cổng:"
              f" {ref_summary['pass']}/{ref_summary['total']} ({ratio})")
        print(f"  {'xe':4} {'slot':5} {'rời':>5} {'ra':>5} {'GID rời':>8} {'GID ra':>7} KQ")
        for row in ref["cars"]:
            print(f"  {row['car']:4} {str(row['slot']):5} {str(row['depart_frame']):>5}"
                  f" {str(row['gate_out_frame']):>5}"
                  f" {str(row['gid_out_start']):>8} {str(row['gid_out_end']):>7}"
                  f" {'ĐẠT' if row['pass'] else 'SAI ' + str(row['reason'])}")
    print(f"JSON: {args.json}" if args.json is not None else "JSON: (không ghi)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
