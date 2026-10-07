"""V2 — Draw CURRENT ROI mask + parking slots over raw video frames (alignment check).

READ-ONLY: writes only into the --out dir (never the session dir).
Verdict (ALIGNED/PARTIAL/MISALIGNED) is made by a human looking at the images.

Usage:
    python experiment_test/verify/align_overlay.py \
        --session experiment_test/output/session_thai6 \
        --roi config/roi_mask_cam1.json config/roi_mask_cam2.json \
        --slots config/parking_slots_cam1.json config/parking_slots_cam2.json \
        --frames 0 mid --out .analysis/verify-replay/alignment/thai6
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

import cv2
import numpy as np


def _poly(points):
    return np.array([[p["x"], p["y"]] for p in points], dtype=np.int32)


def _grab(cap, idx):
    cap.set(cv2.CAP_PROP_POS_FRAMES, idx)
    ok, frame = cap.read()
    return frame if ok else None


def render(session: Path, roi_paths, slot_paths, frames, out_dir: Path):
    out_dir.mkdir(parents=True, exist_ok=True)
    written = []
    for cam_i, (roi_p, slot_p) in enumerate(zip(roi_paths, slot_paths), 1):
        video = session / f"raw_cam{cam_i}.mp4"
        cap = cv2.VideoCapture(str(video))
        if not cap.isOpened():
            print(f"!! cannot open {video}")
            continue
        total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        wanted = []
        for f in frames:
            wanted.append(total - 1 if f == "last" else (total // 2 if f == "mid" else int(f)))
        roi = _poly(json.loads(roi_p.read_text(encoding="utf-8"))["polygon"]) if roi_p else None
        slots = (json.loads(slot_p.read_text(encoding="utf-8")).get("slots", [])
                 if slot_p else [])
        for idx in wanted:
            img = _grab(cap, idx)
            if img is None:
                continue
            if roi is not None:
                cv2.polylines(img, [roi], True, (0, 255, 0), 2)
                cv2.putText(img, "ROI", (roi[0][0], max(20, roi[0][1] - 6)),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 0), 2)
            for s in slots:
                p = _poly(s.get("polygon") or s.get("points") or [])
                if len(p) < 3:
                    continue
                cv2.polylines(img, [p], True, (255, 120, 0), 1)
                c = p.reshape(-1, 2).mean(axis=0).astype(int)
                cv2.putText(img, str(s.get("id", "?")), (c[0] - 8, c[1] + 4),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.45, (255, 160, 40), 1)
            cv2.putText(img, f"cam{cam_i} frame {idx}/{total}", (10, 24),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 2)
            name = out_dir / f"{session.name}_cam{cam_i}_f{idx}.jpg"
            cv2.imwrite(str(name), img, [cv2.IMWRITE_JPEG_QUALITY, 85])
            written.append((cam_i, idx, name))
        cap.release()
    return written


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--session", required=True, type=Path)
    ap.add_argument("--roi", nargs=2, type=Path, required=True)
    ap.add_argument("--slots", nargs=2, type=Path, required=True)
    ap.add_argument("--frames", nargs="+", default=["0", "mid"])
    ap.add_argument("--out", required=True, type=Path)
    args = ap.parse_args()
    written = render(args.session, args.roi, args.slots, args.frames, args.out)
    for cam, idx, p in written:
        print(f"cam{cam} f{idx} -> {p}")


if __name__ == "__main__":
    main()
