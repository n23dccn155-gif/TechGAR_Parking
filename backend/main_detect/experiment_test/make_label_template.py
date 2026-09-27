"""Generate ground-truth labeling templates for a replayed session.

Reads ``predictions.jsonl`` and emits, inside the session directory:

* ``manual_tracking.csv`` — one row per (canonical_gid, camera) appearance
  sample (first/mid/last frames) with ``ai_assigned_id`` pre-filled.  The
  labeler only fills ``physical_vehicle`` (e.g. ``black_suv``, plate text).
* ``ground_truth_events.csv`` — event-level ground truth template pre-filled
  with candidate milestones detected in the predictions (first appearance,
  cross-camera handoff, parking, last seen).  The labeler confirms or fixes
  ``start_frame``/``slot_id`` and marks rows ``required``/``critical``.
* ``label_sheets/<gid>_cam<N>_f<idx>.png`` — cropped bbox thumbnails so the
  labeler can identify each physical vehicle from images instead of
  scrubbing the video.  Requires the raw videos (``raw_cam*.mp4``), either in
  the session dir or via ``--source-video-dir``.

Usage:
    python experiment_test/make_label_template.py --session REPLAY_DIR \
        [--source-video-dir RECORD_DIR] [--samples-per-gid 3]
"""
from __future__ import annotations

import argparse
import csv
import json
from collections import defaultdict
from pathlib import Path
from typing import Dict, List, Optional, Tuple

try:
    import cv2
except ImportError:  # thumbnails optional
    cv2 = None


MANUAL_COLUMNS = [
    "frame_idx", "camera_id", "local_track_id", "ai_assigned_id",
    "physical_vehicle", "notes",
]
EVENT_COLUMNS = [
    "schema_version", "event_id", "physical_vehicle_id", "event_type",
    "start_frame", "end_frame", "source_camera", "target_camera",
    "source_slot_id", "target_slot_id", "preferred_delay_frames",
    "max_delay_frames", "required", "critical", "notes",
]


def iter_predictions(session: Path):
    path = session / "predictions.jsonl"
    with open(path, "r", encoding="utf-8-sig") as fh:
        for line in fh:
            line = line.strip()
            if line:
                yield json.loads(line)


def collect_gid_windows(session: Path) -> Dict[int, dict]:
    """Per canonical_gid: per-camera first/last frame + local ids + slots."""
    gids: Dict[int, dict] = {}
    parked_slot: Dict[int, str] = {}
    for rec in iter_predictions(session):
        frame = rec["frame_idx"]
        for obs in rec.get("observations", []):
            gid = obs.get("canonical_gid") or obs.get("raw_gid")
            if gid is None:
                continue
            gid = int(gid)
            cam = obs["camera_id"]
            entry = gids.setdefault(gid, {"cams": defaultdict(
                lambda: {"first": frame, "last": frame, "locals": set(),
                         "frames": []})})
            c = entry["cams"][cam]
            c["first"] = min(c["first"], frame)
            c["last"] = max(c["last"], frame)
            c["locals"].add(obs.get("local_track_id"))
            c["frames"].append(frame)
        for ep in rec.get("parking_episodes", []):
            if ep.get("state") in ("parked", "occupied", "confirmed"):
                gid = ep.get("global_id")
                if gid is not None:
                    parked_slot[int(gid)] = ep.get("slot_id", "")
    for gid, entry in gids.items():
        entry["slot"] = parked_slot.get(gid, "")
    return gids


def pick_samples(frames: List[int], k: int) -> List[int]:
    """k roughly-evenly-spaced frames from a sorted list."""
    frames = sorted(set(frames))
    if len(frames) <= k:
        return frames
    step = (len(frames) - 1) / (k - 1)
    return [frames[round(i * step)] for i in range(k)]


def write_manual_template(session: Path, gids: Dict[int, dict],
                          samples_per_gid: int) -> Path:
    out = session / "manual_tracking.csv"
    with open(out, "w", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh)
        w.writerow(MANUAL_COLUMNS)
        for gid in sorted(gids):
            for cam in sorted(gids[gid]["cams"]):
                info = gids[gid]["cams"][cam]
                local = sorted(i for i in info["locals"] if i is not None)
                for f in pick_samples(info["frames"], samples_per_gid):
                    w.writerow([f, cam, local[0] if local else "", gid,
                                "", ""])
    return out


def write_event_template(session: Path, gids: Dict[int, dict]) -> Path:
    out = session / "ground_truth_events.csv"
    with open(out, "w", newline="", encoding="utf-8-sig") as fh:
        w = csv.writer(fh)
        w.writerow(EVENT_COLUMNS)
        eid = 0
        for gid in sorted(gids):
            cams = gids[gid]["cams"]
            cam_list = sorted(cams)
            first_cam = min(cam_list, key=lambda c: cams[c]["first"])
            last_cam = max(cam_list, key=lambda c: cams[c]["last"])
            eid += 1
            w.writerow([3, f"E{eid:03d}", "", "enter_lot",
                        cams[first_cam]["first"], "", first_cam, "",
                        "", "", "", "", "true", "true", "auto-prefill: verify"])
            if len(cam_list) > 1:
                eid += 1
                src = min(cam_list, key=lambda c: cams[c]["first"])
                dst = max(cam_list, key=lambda c: cams[c]["first"])
                w.writerow([3, f"E{eid:03d}", "", "camera_handoff",
                            cams[src]["last"], cams[dst]["first"],
                            src, dst, "", "", "", "", "true", "true",
                            "auto-prefill: verify"])
            if gids[gid]["slot"]:
                park_frame = cams[last_cam]["last"]
                eid += 1
                w.writerow([3, f"E{eid:03d}", "", "park",
                            park_frame, "", last_cam, "", "",
                            gids[gid]["slot"], "", "", "true", "true",
                            "auto-prefill: verify slot+frame"])
            eid += 1
            w.writerow([3, f"E{eid:03d}", "", "exit_lot_or_final",
                        cams[last_cam]["last"], "", last_cam, "",
                        "", "", "", "", "true", "false",
                        "auto-prefill: last seen frame"])
    return out


def _find_video(video_dir: Path, cam: str) -> Optional[Path]:
    for name in (f"raw_{cam}.mp4", f"{cam}.mp4"):
        p = video_dir / name
        if p.exists():
            return p
    return None


def write_label_sheets(session: Path, video_dir: Path,
                       gids: Dict[int, dict], samples_per_gid: int) -> int:
    """Crop bbox thumbnails per (gid, camera) at sample frames."""
    if cv2 is None:
        print("[sheets] cv2 unavailable — skipping thumbnails")
        return 0
    out_dir = session / "label_sheets"
    out_dir.mkdir(exist_ok=True)
    # index observations by (gid, cam, frame) -> bbox
    wanted: Dict[Tuple[int, str], List[int]] = {}
    for gid, entry in gids.items():
        for cam, info in entry["cams"].items():
            wanted[(gid, cam)] = pick_samples(info["frames"], samples_per_gid)
    # bbox lookup from predictions
    bbox_at: Dict[Tuple[int, str, int], List[int]] = {}
    need_frames = {cam: set() for cam in ("cam1", "cam2")}
    for (gid, cam), frames in wanted.items():
        for f in frames:
            need_frames[cam].add(f)
    for rec in iter_predictions(session):
        f = rec["frame_idx"]
        for obs in rec.get("observations", []):
            gid = obs.get("canonical_gid") or obs.get("raw_gid")
            cam = obs["camera_id"]
            if gid is None or f not in need_frames.get(cam, ()):
                continue
            if (int(gid), cam, f) not in bbox_at and obs.get("bbox"):
                bbox_at[(int(gid), cam, f)] = obs["bbox"]
    written = 0
    caps: Dict[str, object] = {}
    try:
        for (gid, cam), frames in sorted(wanted.items()):
            video = _find_video(video_dir, cam)
            if video is None:
                continue
            cap = caps.get(cam)
            if cap is None:
                cap = cv2.VideoCapture(str(video))
                caps[cam] = cap
            for i, f in enumerate(frames):
                bbox = bbox_at.get((gid, cam, f))
                if not bbox:
                    continue
                cap.set(cv2.CAP_PROP_POS_FRAMES, f)
                ok, frame_img = cap.read()
                if not ok:
                    continue
                x, y, w, h = [int(v) for v in bbox[:4]]
                pad = 40
                y0, y1 = max(0, y - pad), min(frame_img.shape[0], y + h + pad)
                x0, x1 = max(0, x - pad), min(frame_img.shape[1], x + w + pad)
                crop = frame_img[y0:y1, x0:x1]
                if crop.size == 0:
                    continue
                cv2.imwrite(str(out_dir / f"gid{gid:02d}_{cam}_f{f}.png"), crop)
                written += 1
    finally:
        for cap in caps.values():
            cap.release()
    return written


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--session", required=True, type=Path,
                    help="Replay/session dir containing predictions.jsonl")
    ap.add_argument("--source-video-dir", type=Path, default=None,
                    help="Dir with raw_camN.mp4 (defaults to --session)")
    ap.add_argument("--samples-per-gid", type=int, default=3)
    args = ap.parse_args(argv)

    session = args.session
    if not (session / "predictions.jsonl").exists():
        print(f"[!] no predictions.jsonl in {session}")
        return 1

    gids = collect_gid_windows(session)
    manual = write_manual_template(session, gids, args.samples_per_gid)
    events = write_event_template(session, gids)
    video_dir = args.source_video_dir or session
    n_sheets = write_label_sheets(session, video_dir, gids,
                                  args.samples_per_gid)

    multi_cam = sum(1 for g in gids.values() if len(g["cams"]) > 1)
    print(f"[ok] {session.name}: {len(gids)} GIDs ({multi_cam} cross-camera)")
    print(f"     manual template : {manual}")
    print(f"     event template  : {events}")
    print(f"     label sheets    : {n_sheets} thumbnails in label_sheets/")
    print("  next: fill physical_vehicle in manual_tracking.csv using the")
    print("        thumbnails, verify pre-filled rows in ground_truth_events.csv,")
    print("        then run evaluate_session_metrics.py --session DIR")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
