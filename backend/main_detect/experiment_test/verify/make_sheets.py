"""V4 — contact-sheet builder for eyeball review (MEGAPLAN verify-replay §4).

Ghép lưới ô ảnh (mặc định 3x3) từ frame GỐC ``raw_camN.mp4`` kèm overlay:
bbox track (màu theo association_state), nhãn ``G#<gid>|L<local>|<state>``,
ROI mask hiện tại, ô đỗ hiện tại (đỏ=occupied / xanh=free theo record),
và caption ``camN f<idx> t=<giây>`` + event types.

Dùng chung cho V2 (căn chỉnh config) và V4 (xem cửa sổ cờ + lấy mẫu đều).

Chọn frame (có thể kết hợp):
    --frames "1,990-1000"          chỉ định trực tiếp (1-based, giống render_gid_frames)
    --every 2.0                    lấy mẫu đều: 1 frame mỗi N giây video / cam
    --windows "120,480-500"        span thô; pad ± --window-pad rồi gom gần nhau
    --windows-file FILE            JSONL cờ V3 (scan_frames frame_from/to THÔ),
                                   JSON list, hoặc text 'a-b' / 'n' mỗi dòng
    --window-pad 15                pad quanh mỗi span (§4: ±15 quanh cờ)
    --merge-gap 0                  gom cửa sổ cách <=N frame sau pad
    --window-step 5                bước lấy mẫu bên trong cửa sổ

Ví dụ:
    python experiment_test/verify/make_sheets.py \
        --session experiment_test/output/verify_cur_session_thai8 \
        --video-dir experiment_test/output/session_thai8 \
        --cam both --every 2.0 --windows-file flags.json

Output: ``--out`` (mặc định .analysis/verify-replay/sheets/<session>) chứa
``sheet_NNNN.jpg`` + ``index.json`` (sheet → danh sách ô {frame_idx, cam}).
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Dict, List, Optional, Sequence, Tuple

import cv2
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from render_gid_frames import (  # noqa: E402
    CameraVideo, draw_observation, load_records, parse_frames, put_text,
)

CAM_IDS = {"1": ("cam1",), "2": ("cam2",), "both": ("cam1", "cam2")}
COLOR_ROI = (0, 200, 230)          # vàng-cam: ROI mask
COLOR_SLOT_FREE = (60, 200, 60)    # xanh: slot trống
COLOR_SLOT_OCC = (60, 60, 235)     # đỏ: slot occupied
COLOR_SLOT_UNK = (150, 150, 150)   # xám: chưa có record


def _polygon_points(raw) -> np.ndarray:
    return np.array([[int(round(p["x"])), int(round(p["y"]))] for p in raw],
                    np.int32).reshape((-1, 1, 2))


def load_config_overlay(config_dir: Path) -> Tuple[dict, dict]:
    """ROI polygon + slot polygons per cam from CURRENT config."""
    roi, slots = {}, {}
    for cam in ("cam1", "cam2"):
        rp = config_dir / f"roi_mask_{cam}.json"
        if rp.is_file():
            roi[cam] = _polygon_points(json.loads(rp.read_text(
                encoding="utf-8-sig"))["polygon"])
        sp = config_dir / f"parking_slots_{cam}.json"
        if sp.is_file():
            slots[cam] = [
                {"id": s.get("id"), "polygon": _polygon_points(s["polygon"])}
                for s in json.loads(sp.read_text(
                    encoding="utf-8-sig")).get("slots", [])
                if s.get("polygon")
            ]
    return roi, slots


def draw_static_overlay(image, roi, slots, slot_state):
    if roi is not None:
        cv2.polylines(image, [roi], True, COLOR_ROI, 2, cv2.LINE_AA)
    for slot in slots or []:
        state = slot_state.get(slot["id"])
        color = (COLOR_SLOT_OCC if state is True else COLOR_SLOT_FREE
                 if state is False else COLOR_SLOT_UNK)
        cv2.polylines(image, [slot["polygon"]], True, color, 1, cv2.LINE_AA)
        x, y = slot["polygon"][0][0]
        put_text(image, str(slot["id"]), (x + 2, y + 12), color, scale=0.35)


def slot_states(record: Optional[dict], cam: str) -> Dict[str, bool]:
    return {s["slot_id"]: bool(s.get("occupied"))
            for s in (record or {}).get("slots") or []
            if s.get("camera_id") == cam and s.get("slot_id") is not None}


def expand_windows(spans, pad: int, step: int, merge_gap: int = 0):
    """Mọi span đầu vào là interval THÔ (flags V3 chưa pad):
    pad ±pad -> gom span chồng/gần (gap <= merge_gap) thành 1 cửa sổ §4
    -> lấy mẫu step trong cửa sổ. Trả (frames, merged_windows)."""
    padded = sorted((max(1, lo - pad), hi + pad) for lo, hi in spans)
    merged: List[List[int]] = []
    for lo, hi in padded:
        if merged and lo <= merged[-1][1] + merge_gap + 1:
            merged[-1][1] = max(merged[-1][1], hi)
        else:
            merged.append([lo, hi])
    out = set()
    for lo, hi in merged:
        out.update(range(lo, hi + 1, max(1, step)))
        out.add(hi)
    return sorted(out), [tuple(w) for w in merged]


def load_windows_file(path: Path) -> List[Tuple[int, int]]:
    """Ba dạng: JSONL cờ V3 (scan_frames.py: {frame_from,frame_to,...}/dòng),
    JSON list [{start,end}|n], hoặc text 'a-b' / 'n' mỗi dòng."""
    text = path.read_text(encoding="utf-8-sig").strip()
    if not text:
        return []
    if text.startswith("{"):
        out = []
        for line in text.splitlines():
            line = line.strip()
            if line:
                d = json.loads(line)
                out.append((int(d["frame_from"]), int(d["frame_to"])))
        return out
    if text.startswith("["):
        data = json.loads(text)
        out = []
        for item in data:
            if isinstance(item, dict):
                out.append((int(item["start"]), int(item["end"])))
            else:
                out.append((int(item), int(item)))
        return out
    out = []
    for line in text.splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        if "-" in line:
            a, b = line.split("-", 1)
            out.append((int(a), int(b)))
        else:
            out.append((int(line), int(line)))
    return out


def frame_count(video: CameraVideo) -> int:
    if not video.available:
        return 0
    return int(video.capture.get(cv2.CAP_PROP_FRAME_COUNT))


def video_fps(video: CameraVideo) -> float:
    fps = video.capture.get(cv2.CAP_PROP_FPS) if video.available else 0
    return float(fps) if fps and np.isfinite(fps) and fps > 0 else 25.0


def cell_caption(image, cam, idx, fps, event_types):
    put_text(image, f"{cam} f{idx} t={max(0, (idx - 1) / fps):.1f}s",
             (6, 16), (255, 255, 255), scale=0.5)
    for i, ev in enumerate(event_types[:3]):
        put_text(image, str(ev), (6, 34 + 14 * i), (160, 220, 255),
                 scale=0.38)


def make_cell(image, record, cam, idx, fps, roi, slots, overlays):
    cell = image.copy()
    if overlays:
        draw_static_overlay(cell, roi.get(cam), slots.get(cam),
                            slot_states(record, cam))
        for obs in (record or {}).get("observations") or []:
            if obs.get("camera_id") == cam:
                draw_observation(cell, obs)
    events = [str(e.get("event_type") or e.get("type"))
              for e in (record or {}).get("identity_events") or []]
    if record is None:
        events = ["no predictions record"] + events
    cell_caption(cell, cam, idx, fps, events)
    return cell


def build_sheets(cells: List[np.ndarray], meta: List[dict], out: Path,
                 cols: int, rows: int, cell_w: int, quality: int) -> int:
    per_sheet = cols * rows
    written = 0
    index = []
    for start in range(0, len(cells), per_sheet):
        chunk = cells[start:start + per_sheet]
        h = int(chunk[0].shape[0] * cell_w / chunk[0].shape[1])
        chunk = [cv2.resize(c, (cell_w, h), interpolation=cv2.INTER_AREA)
                 for c in chunk]
        while len(chunk) < per_sheet:
            chunk.append(np.zeros((h, cell_w, 3), np.uint8))
        grid = np.vstack([np.hstack(chunk[r * cols:(r + 1) * cols])
                          for r in range(rows)])
        name = f"sheet_{written + 1:04d}.jpg"
        if not cv2.imwrite(str(out / name), grid,
                           [cv2.IMWRITE_JPEG_QUALITY, quality]):
            print(f"WARN: cannot write {name}", flush=True)
            continue
        index.append({"sheet": name,
                      "cells": meta[start:start + per_sheet]})
        written += 1
    (out / "index.json").write_text(json.dumps(index, indent=1),
                                    encoding="utf-8")
    return written


def main(argv: Optional[Sequence[str]] = None) -> int:
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--session", required=True, type=Path,
                   help="dir chứa predictions.jsonl (replay output hoặc record)")
    p.add_argument("--video-dir", type=Path, default=None,
                   help="dir chứa raw_cam1/2.mp4 (mặc định = --session)")
    p.add_argument("--config-dir", type=Path,
                   default=Path(__file__).resolve().parents[2] / "config",
                   help="config hiện tại (mặc định backend/main_detect/config)")
    p.add_argument("--cam", choices=tuple(CAM_IDS), default="both")
    p.add_argument("--frames", default=None)
    p.add_argument("--every", type=float, default=None,
                   help="1 frame mỗi N giây video mỗi cam")
    p.add_argument("--windows", default=None,
                   help="span thô '120,480-500' (số đơn = span 1 frame)")
    p.add_argument("--windows-file", type=Path, default=None,
                   action="append",
                   help="lặp được: nhiều file span cùng lúc")
    p.add_argument("--window-pad", type=int, default=15,
                   help="pad ±N mỗi span thô (§4: ±15 quanh cờ)")
    p.add_argument("--merge-gap", type=int, default=0,
                   help="gom cửa sổ cách nhau <=N frame sau pad")
    p.add_argument("--window-step", type=int, default=5)
    p.add_argument("--grid", default="3x3", help="CxR, mặc định 3x3")
    p.add_argument("--cell-width", type=int, default=640)
    p.add_argument("--quality", type=int, default=85)
    p.add_argument("--no-overlay", action="store_true",
                   help="không vẽ ROI/slots/track (V2 căn chỉnh thuần)")
    p.add_argument("--out", type=Path, default=None)
    args = p.parse_args(argv)

    session = args.session.resolve()
    video_dir = (args.video_dir or session).resolve()
    cams = CAM_IDS[args.cam]
    videos = {cam: CameraVideo(video_dir / f"raw_cam{cam[-1]}.mp4")
              for cam in cams}
    fps = max((video_fps(v) for v in videos.values()), default=25.0)
    counts = {cam: frame_count(v) for cam, v in videos.items()}
    n_frames = min((c for c in counts.values() if c), default=0)
    if not n_frames:
        print("ERROR: không đọc được raw_cam*.mp4", flush=True)
        return 2

    wanted = set()
    if args.frames:
        wanted.update(parse_frames(args.frames))
    if args.every and args.every > 0:
        wanted.update(1 + int(round(k * args.every * fps))
                      for k in range(int(n_frames / (args.every * fps)) + 2))
    windows = []
    if args.windows:
        for tok in args.windows.split(","):
            tok = tok.strip()
            if not tok:
                continue
            if "-" in tok:
                a, b = tok.split("-", 1)
                windows.append((int(a), int(b)))
            else:
                windows.append((int(tok), int(tok)))
    for wf in args.windows_file or []:
        windows.extend(load_windows_file(wf))
    if windows:
        w_frames, merged = expand_windows(
            windows, args.window_pad, args.window_step, args.merge_gap)
        wanted.update(w_frames)
        print(f"windows: {len(windows)} span(s) thô -> pad±{args.window_pad} "
              f"-> {len(merged)} cửa sổ: "
              + ", ".join(f"{a}-{b}" for a, b in merged[:20])
              + (" ..." if len(merged) > 20 else ""), flush=True)
    if not wanted:
        p.error("cần ít nhất một trong --frames/--every/--windows[--file]")
    wanted = sorted(i for i in wanted if 1 <= i <= n_frames)

    out = args.out or (Path(__file__).resolve().parents[4]
                       / ".analysis" / "verify-replay" / "sheets" / session.name)
    out.mkdir(parents=True, exist_ok=True)

    records, missing = load_records(session, wanted)
    for idx in missing:
        print(f"WARN: no predictions record for frame {idx}", flush=True)
    roi, slots = load_config_overlay(args.config_dir)

    try:
        cols, rows = (int(x) for x in args.grid.lower().split("x"))
    except ValueError:
        p.error("--grid phải dạng CxR (vd 3x3)")

    cells, meta = [], []
    for idx in wanted:
        record = records.get(idx)
        for cam in cams:
            image = videos[cam].read(idx)
            if image is None:
                print(f"WARN: cannot read {cam} frame {idx}", flush=True)
                continue
            cells.append(make_cell(image, record, cam, idx, fps,
                                   roi, slots, not args.no_overlay))
            meta.append({"frame_idx": idx, "cam": cam,
                         "has_record": record is not None})
    n = build_sheets(cells, meta, out, cols, rows, args.cell_width,
                     args.quality)
    print(f"{session.name}: {len(cells)} cells / {len(wanted)} frames "
          f"-> {n} sheets -> {out}")
    for v in videos.values():
        v.release()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
