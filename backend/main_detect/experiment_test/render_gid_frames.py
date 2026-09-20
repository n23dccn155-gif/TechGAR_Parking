"""Render identity overlays on raw session video for frame-level inspection.

Each requested frame is read from ``raw_camN.mp4`` and every observation of
that camera in the frame's ``predictions.jsonl`` record is drawn: a bounding
box colored by ``association_state`` and a label
``G#<canonical_gid>|L<local_track_id>|<state>`` above it.  ``Frame: N`` and
the frame's ``identity_events`` (event types only) are listed top-left.

Because replays run with ``--no-session-video``, the pixels can come from a
different directory than the predictions: pass ``--source-video-dir`` with
the ORIGINAL record session -- frame indices align 1:1 in a full replay.

Usage:
    python experiment_test/render_gid_frames.py --session DIR \
        --frames 990-1110 --cam both --out DIR [--scale 0.5]
    python experiment_test/render_gid_frames.py --session REPLAY_DIR \
        --source-video-dir RECORD_DIR --frames 1000,1020,1040 --cam 1 --out DIR

``--frames`` accepts comma-separated indices and inclusive ranges, e.g.
``--frames 5,990-1000,1200``.  Output files are
``<out>/<session>_cam<N>_f<idx>.png`` plus ``..._both_f<idx>.png`` when
``--cam both``.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Dict, List, Optional, Sequence, Tuple

import cv2
import numpy as np

FONT = cv2.FONT_HERSHEY_SIMPLEX
MAX_EVENT_LINES = 8

# BGR colors keyed by association_state.
COLOR_MATCHED = (50, 200, 50)      # green: measurement matched to a track
COLOR_COASTING = (0, 215, 235)     # yellow: coasting / pure prediction
COLOR_TENTATIVE = (235, 200, 0)    # cyan: new_tentative fragment
COLOR_FROZEN = (220, 0, 220)       # magenta: frozen_* heuristics
COLOR_UNKNOWN = (170, 170, 170)    # grey fallback


def state_color(association_state: Optional[str]) -> Tuple[int, int, int]:
    state = (association_state or "").lower()
    if state == "matched":
        return COLOR_MATCHED
    if state in {"coasting", "prediction", "predicted"}:
        return COLOR_COASTING
    if state in {"new_tentative", "tentative"}:
        return COLOR_TENTATIVE
    if state.startswith("frozen"):
        return COLOR_FROZEN
    return COLOR_UNKNOWN


def parse_frames(spec: str) -> List[int]:
    """Parse '1000,1020,1040' / '990-1110' / mixed lists into sorted indices."""
    indices = set()
    for token in spec.split(","):
        token = token.strip()
        if not token:
            continue
        if "-" in token:
            start_text, end_text = token.split("-", 1)
            start, end = int(start_text), int(end_text)
            if start < 1 or end < start:
                raise ValueError(f"invalid frame range: {token!r}")
            indices.update(range(start, end + 1))
        else:
            index = int(token)
            if index < 1:
                raise ValueError(f"frame indices are 1-based: {token!r}")
            indices.add(index)
    if not indices:
        raise ValueError("empty --frames")
    return sorted(indices)


def load_records(
    session_dir: Path, wanted: Sequence[int],
) -> Tuple[Dict[int, dict], List[int]]:
    """predictions.jsonl records for ``wanted`` frame indices only."""
    path = session_dir / "predictions.jsonl"
    if not path.is_file():
        raise SystemExit(f"missing {path}")
    records: Dict[int, dict] = {}
    remaining = set(wanted)
    with path.open("r", encoding="utf-8") as handle:
        for line in handle:
            if not remaining:
                break
            line = line.strip()
            if not line:
                continue
            record = json.loads(line)
            index = int(record.get("frame_idx", -1))
            if index in remaining:
                records[index] = record
                remaining.discard(index)
    return records, sorted(remaining)


class CameraVideo:
    """Sequential-friendly reader: seeks only when the target is not next."""

    def __init__(self, path: Path):
        self.path = path
        self.capture = cv2.VideoCapture(str(path)) if path.is_file() else None
        self.next_pos = 0  # 0-based index the next read() would return

    @property
    def available(self) -> bool:
        return self.capture is not None and self.capture.isOpened()

    def read(self, frame_idx: int) -> Optional[np.ndarray]:
        """Return the image for 1-based ``frame_idx``, or None."""
        if not self.available:
            return None
        target = frame_idx - 1
        if target != self.next_pos:
            self.capture.set(cv2.CAP_PROP_POS_FRAMES, target)
        ok, image = self.capture.read()
        self.next_pos = target + 1
        return image if ok else None

    def release(self) -> None:
        if self.capture is not None:
            self.capture.release()


def put_text(
    image: np.ndarray, text: str, org: Tuple[int, int],
    color: Tuple[int, int, int], scale: float = 0.5, thickness: int = 1,
) -> None:
    """Text with a dark halo so it stays readable on any background."""
    cv2.putText(image, text, org, FONT, scale, (0, 0, 0), thickness + 2,
                cv2.LINE_AA)
    cv2.putText(image, text, org, FONT, scale, color, thickness, cv2.LINE_AA)


def draw_observation(image: np.ndarray, obs: dict) -> None:
    bbox = obs.get("bbox") or [0, 0, 0, 0]
    x, y, w, h = (int(round(float(v))) for v in bbox[:4])
    height, width = image.shape[:2]
    x1, y1 = max(x, 0), max(y, 0)
    x2, y2 = min(x + w, width - 1), min(y + h, height - 1)
    color = state_color(obs.get("association_state"))
    cv2.rectangle(image, (x1, y1), (x2, y2), color, 2)
    gid = obs.get("canonical_gid")
    label = (
        f"G#{gid if gid is not None else '-'}"
        f"|L{obs.get('local_track_id')}"
        f"|{obs.get('association_state')}"
    )
    (text_w, text_h), _ = cv2.getTextSize(label, FONT, 0.45, 1)
    # Label above the box; fall back to inside the top edge when clipped.
    ty = y1 - 6 if y1 - 6 > text_h + 2 else y1 + text_h + 4
    tx = min(x1, max(0, width - text_w - 2))
    put_text(image, label, (tx, ty), color, scale=0.45)


def draw_header(
    image: np.ndarray, frame_idx: int, event_types: List[str],
    note: Optional[str] = None,
) -> None:
    """Top-left 'Frame: N' plus the frame's identity event types."""
    lines = [f"Frame: {frame_idx}"]
    if note:
        lines.append(note)
    lines.extend(event_types[:MAX_EVENT_LINES])
    if len(event_types) > MAX_EVENT_LINES:
        lines.append(f"... +{len(event_types) - MAX_EVENT_LINES} events")
    scale, thickness = 0.5, 1
    sizes = [cv2.getTextSize(text, FONT, scale, thickness)[0] for text in lines]
    line_step = max(s[1] for s in sizes) + 7
    block_w = max(s[0] for s in sizes) + 16
    block_h = line_step * len(lines) + 8
    overlay = image.copy()
    cv2.rectangle(overlay, (0, 0), (block_w, block_h), (20, 20, 20), -1)
    cv2.addWeighted(overlay, 0.65, image, 0.35, 0, image)
    for i, text in enumerate(lines):
        color = (255, 255, 255) if i == 0 else (180, 220, 255)
        cv2.putText(image, text, (8, 6 + line_step * (i + 1)),
                    FONT, scale, color, thickness, cv2.LINE_AA)


def render_overlays(
    image: np.ndarray, record: Optional[dict], camera_id: str, frame_idx: int,
) -> None:
    """Draw every observation of ``camera_id`` plus the frame header."""
    observations = [
        obs for obs in (record or {}).get("observations") or []
        if obs.get("camera_id") == camera_id
    ]
    for obs in observations:
        draw_observation(image, obs)
    event_types = [
        str(event.get("event_type"))
        for event in (record or {}).get("identity_events") or []
    ]
    note = None if record is not None else "no predictions record"
    draw_header(image, frame_idx, event_types, note)


def placeholder_like(image: np.ndarray, text: str) -> np.ndarray:
    """Black panel matching ``image`` for a missing side-by-side half."""
    panel = np.zeros_like(image)
    put_text(panel, text, (20, image.shape[0] // 2), (200, 200, 200), scale=0.6)
    return panel


def side_by_side(images: Sequence[np.ndarray]) -> np.ndarray:
    height = min(image.shape[0] for image in images)
    resized = [
        cv2.resize(image, (int(image.shape[1] * height / image.shape[0]), height))
        for image in images
    ]
    return np.hstack(resized)


def write_image(path: Path, image: np.ndarray, scale: float) -> None:
    if scale != 1.0:
        image = cv2.resize(image, None, fx=scale, fy=scale,
                           interpolation=cv2.INTER_AREA)
    if not cv2.imwrite(str(path), image):
        print(f"WARN: could not write {path}", flush=True)


def main(argv: Optional[List[str]] = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--session", required=True, type=Path,
                        help="session dir containing predictions.jsonl")
    parser.add_argument("--source-video-dir", type=Path, default=None,
                        help="dir with raw_cam1.mp4/raw_cam2.mp4 to pull "
                             "pixels from (default: --session dir)")
    parser.add_argument("--frames", required=True,
                        help="1-based indices: '1000,1020' and/or '990-1110'")
    parser.add_argument("--cam", required=True, choices=("1", "2", "both"))
    parser.add_argument("--out", required=True, type=Path)
    parser.add_argument("--scale", type=float, default=1.0,
                        help="output image scale (default 1.0)")
    args = parser.parse_args(argv)

    session = args.session.resolve()
    video_dir = (args.source_video_dir or args.session).resolve()
    try:
        wanted = parse_frames(args.frames)
    except ValueError as exc:
        parser.error(str(exc))
    if args.scale <= 0:
        parser.error("--scale must be > 0")
    args.out.mkdir(parents=True, exist_ok=True)

    records, missing_records = load_records(session, wanted)
    for index in missing_records:
        print(f"WARN: no predictions record for frame {index}", flush=True)

    cam_ids = {"1": ("cam1",), "2": ("cam2",), "both": ("cam1", "cam2")}[args.cam]
    # The file is raw_camN.mp4 while the observation camera_id is 'camN'.
    videos = {
        cam: CameraVideo(video_dir / f"raw_cam{cam[-1]}.mp4")
        for cam in cam_ids
    }
    for cam, video in videos.items():
        if not video.available:
            print(f"WARN: cannot open {video.path}", flush=True)

    written = 0
    try:
        for index in wanted:
            images: Dict[str, np.ndarray] = {}
            for cam in cam_ids:
                image = videos[cam].read(index)
                if image is None:
                    print(f"WARN: cannot read {cam} frame {index}", flush=True)
                    continue
                render_overlays(image, records.get(index), cam, index)
                out_path = args.out / f"{session.name}_{cam}_f{index}.png"
                write_image(out_path, image, args.scale)
                images[cam] = image
                written += 1
            if args.cam == "both" and images:
                panels = []
                for cam in ("cam1", "cam2"):
                    if cam in images:
                        panels.append(images[cam])
                    else:
                        other = next(iter(images.values()))
                        panels.append(
                            placeholder_like(other, f"no {cam} frame {index}"))
                out_path = args.out / f"{session.name}_both_f{index}.png"
                write_image(out_path, side_by_side(panels), args.scale)
                written += 1
    finally:
        for video in videos.values():
            video.release()

    print(f"wrote {written} image(s) to {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
