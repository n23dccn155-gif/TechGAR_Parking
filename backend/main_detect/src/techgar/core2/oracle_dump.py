"""Offline GT-centre oracle for M1L/ENGINE_L; never starts SIM3D or video.

The simulated GT pixel (u,v) is the virtual 640x640 camera coordinate,
NOT the pixel coordinate of either real TechGar camera. First unproject it
with the P37 bridge, then invert the actual camera homography to synthesize
per-camera Blob.bbox. This ensures P37 reprojects the exact same world centre.

Examples (run from repo root):
  python -m techgar.core2.oracle_dump generate --run sang_5p --case perfect
  python -m techgar.core2.oracle_dump suite --cases perfect,jitter09,iid02
"""
from __future__ import annotations

import argparse
from collections import Counter, defaultdict, deque
import csv
import gc
import importlib.util
import json
import math
from pathlib import Path
import random
import sys

import cv2
import numpy as np

from .dump import BlobDumpWriter
from .engine_l import Core2EngineL
from .types import Blob, State

ROOT = Path(__file__).resolve().parents[5]
RUNS = {
    "sang_5p": "20261106-130217_sang_5p",
    "sang_10p": "20261106-131033_sang_10p",
    "toi_5p": "20261106-134724_toi_5p",
}
# sigma cm, IID dropout %, burst dropout, spurious points /100 frames (both cams).
# Scenarios isolate the mechanisms, then combine them to test M1L quality.
CASES = {
    "perfect": (0.0, 0.0, False, 0.0),
    "jitter09": (0.9, 0.0, False, 0.0),
    "jitter15": (1.5, 0.0, False, 0.0),
    "iid02": (0.9, 2.0, False, 0.0),
    "iid05": (0.9, 5.0, False, 0.0),
    "burst": (0.9, 0.0, True, 0.0),
    "ghost02": (0.9, 0.0, False, 0.2),
    "ghost05": (0.9, 0.0, False, 0.5),
    "ghost1": (0.9, 0.0, False, 1.0),
    "ghost2": (0.9, 0.0, False, 2.0),
    "mild": (0.9, 2.0, True, 0.5),
    "hard": (1.5, 5.0, True, 2.0),
    "edgeghost": (0.9, 0.0, False, 0.0),
}
FPS = 25.0
PITCH = math.radians(80.0)
FOCAL = 288.0
HEIGHT = 33.6
BBOX_W, BBOX_H = 85, 35
IMAGE_W, IMAGE_H = 800, 1280


def sim_to_world(u: float, v: float) -> tuple[float, float]:
    """Exact same bridge as .orca/sim3d/p37_score.py (cm)."""
    a = (u - 320.0) / FOCAL
    b = (v - 320.0) / FOCAL
    den = math.sin(PITCH) + b * math.cos(PITCH)
    depth = HEIGHT / den
    x_m = a * depth
    y_m = (HEIGHT * math.cos(PITCH) - b * depth) / math.sin(PITCH)
    return 2.090 * x_m + 4.147, 2.090 * y_m - 16.295


def _pixel(xy, inverse):
    vec = inverse @ np.asarray([xy[0], xy[1], 1.0])
    return float(vec[0] / vec[2]), float(vec[1] / vec[2])


def _calibration(run_dir: Path):
    data = json.loads((run_dir / "techgar_config/calibration.json").read_text(encoding="utf-8"))
    transforms = {cam: np.asarray(mat, dtype=np.float64)
                  for cam, mat in data["camera_transforms"].items()}
    inverses = {cam: np.linalg.inv(mat) for cam, mat in transforms.items()}
    roi_pixels = {}
    for cam, polygon in data["camera_coverage_world"].items():
        points = [_pixel((point["x"], point["y"]), inverses[cam]) for point in polygon]
        roi_pixels[cam] = np.asarray(points, dtype=np.float32).reshape((-1, 1, 2))
        if len(points) < 3:
            raise ValueError(f"camera_coverage_world for {cam} is not a polygon")
    return transforms, inverses, roi_pixels


def _make_blob(cam, frame, xy, inverse, roi_polygon):
    u, v = _pixel(xy, inverse)
    x, y = int(round(u - BBOX_W / 2)), int(round(v - BBOX_H / 2))
    # `roi_clipped` is measured against the calibrated coverage polygon, not
    # the rectangular image boundary.
    edge_distance = cv2.pointPolygonTest(roi_polygon, (u, v), True)
    clipped = edge_distance < 30.0
    return Blob(cam=cam, frame=frame, t=(frame + 1) / FPS,
                bbox=(x, y, BBOX_W, BBOX_H), xy=xy,
                area_px=BBOX_W * BBOX_H, roi_clipped=clipped,
                roi_support=0.5 if clipped else 1.0, desc=None)


def _sample_roi_world(roi_polygon, transform, rng):
    points = roi_polygon.reshape((-1, 2))
    x0, y0 = np.min(points, axis=0)
    x1, y1 = np.max(points, axis=0)
    x0, x1 = max(0.0, float(x0)), min(IMAGE_W - 1.0, float(x1))
    y0, y1 = max(0.0, float(y0)), min(IMAGE_H - 1.0, float(y1))
    for _ in range(10000):
        u, v = rng.uniform(x0, x1), rng.uniform(y0, y1)
        if cv2.pointPolygonTest(roi_polygon, (u, v), False) >= 0:
            vec = transform @ np.asarray([u, v, 1.0])
            return float(vec[0] / vec[2]), float(vec[1] / vec[2])
    raise RuntimeError("could not sample a false point inside the calibrated camera ROI")


def _match_count_3cm(gt_points, predicted_blobs, radius_cm=3.0):
    """Maximum-cardinality one-to-one centre matches for one cam/frame."""
    if not gt_points or not predicted_blobs:
        return 0
    pred_xy = [blob.xy for blob in predicted_blobs]
    edges = []
    for gt in gt_points:
        candidates = [(math.dist(gt, pred), j) for j, pred in enumerate(pred_xy)]
        edges.append([j for distance, j in sorted(candidates) if distance <= radius_cm])

    # Augmenting paths guarantee the maximum number of matches, including
    # crowded frames where a greedy nearest-pair choice could lose a TP.
    matched_pred = [-1] * len(pred_xy)

    def augment(gt_index, seen):
        for pred_index in edges[gt_index]:
            if seen[pred_index]:
                continue
            seen[pred_index] = True
            previous = matched_pred[pred_index]
            if previous < 0 or augment(previous, seen):
                matched_pred[pred_index] = gt_index
                return True
        return False

    order = sorted(range(len(gt_points)), key=lambda i: (len(edges[i]), i))
    return sum(augment(i, [False] * len(pred_xy)) for i in order)


def measure_oracle_input_quality(run_dir: Path, dump: Path) -> dict:
    """Measure synthetic oracle-input centre recall/precision at 3 cm.

    This validates the injected noise model; it is not an M1L detector score.
    """
    from .dump import read_dump

    header, steps = read_dump(dump)
    if not str(header.get("provenance", "")).startswith("gt_oracle_"):
        raise ValueError("quality action accepts only gt_oracle_* synthetic dumps")
    cameras = {int(key): value for key, value in header["cameras"].items()}
    camera_ids = {name: cam for cam, name in cameras.items()}
    counts = {name: {"gt": 0, "pred": 0, "tp": 0} for name in cameras.values()}
    total_frames = 0
    with (run_dir / "gt_frames.csv").open(encoding="utf-8-sig", newline="") as src:
        rows = csv.DictReader(src)
        vehicles = [column[:-5] for column in rows.fieldnames or [] if column.endswith("_cams")]
        for row in rows:
            try:
                step = next(steps)
            except StopIteration as exc:
                raise ValueError("oracle dump ended before gt_frames.csv") from exc
            frame = int(row["frame"])
            if step["source_frame_idx"] != frame:
                raise ValueError(f"dump/GT frame mismatch: {step['source_frame_idx']} != {frame}")
            gt_by_cam = {cam: [] for cam in cameras}
            for vehicle in vehicles:
                visible = (row.get(vehicle + "_cams") or "").strip()
                if not visible:
                    continue
                u, v = row.get(vehicle + "_u"), row.get(vehicle + "_v")
                if not u or not v:
                    continue
                xy = sim_to_world(float(u), float(v))
                for camera_name in visible.split("+"):
                    if camera_name not in camera_ids:
                        raise ValueError(f"unknown GT camera {camera_name}")
                    gt_by_cam[camera_ids[camera_name]].append(xy)
            for cam, name in cameras.items():
                predicted = step["blobs_by_cam"].get(cam, [])
                bucket = counts[name]
                bucket["gt"] += len(gt_by_cam[cam])
                bucket["pred"] += len(predicted)
                bucket["tp"] += _match_count_3cm(gt_by_cam[cam], predicted)
            total_frames += 1
        try:
            next(steps)
        except StopIteration:
            pass
        else:
            raise ValueError("oracle dump has more frames than gt_frames.csv")

    def rates(bucket):
        tp, gt, pred = bucket["tp"], bucket["gt"], bucket["pred"]
        return {"gt_visible": gt, "predicted": pred, "tp": tp,
                "fp": pred - tp, "fn": gt - tp,
                "recall": round(tp / max(1, gt), 6),
                "precision": round(tp / max(1, pred), 6)}

    combined = {key: sum(bucket[key] for bucket in counts.values())
                for key in ("gt", "pred", "tp")}
    return {"oracle_input_3cm": {"radius_cm": 3.0,
                                 "matching": "one_to_one_per_camera_per_frame",
                                 "frames": total_frames,
                                 "overall": rates(combined),
                                 "by_camera": {name: rates(bucket) for name, bucket in counts.items()}}}


def _edge_ghost(blob, transform, cam, pixel_x):
    """A clipped false centre 5–6 cm from the reference blob at image edge."""
    _, y, _, h = blob.bbox
    center_y = y + h / 2
    for delta in range(-180, 181, 5):
        v = center_y + delta
        if not 0 <= v < IMAGE_H:
            continue
        p = transform @ np.asarray([pixel_x, v, 1.0])
        xy = (float(p[0] / p[2]), float(p[1] / p[2]))
        if 5.0 <= math.dist(blob.xy, xy) <= 6.0:
            return Blob(cam, blob.frame, blob.t,
                        (round(pixel_x - BBOX_W / 2), round(v - BBOX_H / 2), BBOX_W, BBOX_H),
                        xy, BBOX_W * BBOX_H, True, 0.5, None)
    return None


def _inject_edge_ghosts(run_dir, source, destination, seed):
    """Inject only complete 15–18-frame sequences, validating every frame."""
    from .dump import read_dump
    header, stream = read_dump(source)
    transforms, _, _ = _calibration(run_dir)
    rng = random.Random(seed)
    window = deque()
    for _ in range(18):
        try: window.append(next(stream))
        except StopIteration: break
    count = episodes = 0
    until = -1
    with BlobDumpWriter(destination, video=run_dir.name, stride=1,
                        cameras={0:'cam1',1:'cam2'}, core_version='engine_l-oracle-v1',
                        provenance='gt_oracle_edgeghost',
                        engine_inputs={'seed':seed,'edge_distance_cm':[5,6], 'episode_frames':[15,18]}) as dst:
        while window:
            current = window[0]
            frame = current['source_frame_idx']
            if frame >= until and frame % 100 == 0 and len(window) == 18:
                duration = rng.randint(15, 18)
                cams = [0,1]; rng.shuffle(cams)
                found = None
                for cam in cams:
                    pixel_x = rng.uniform(780, 799) if cam == 0 else rng.uniform(1, 29)
                    transform = transforms[f'cam{cam+1}']
                    for candidate in current['blobs_by_cam'].get(cam, []):
                        first = _edge_ghost(candidate, transform, cam, pixel_x)
                        if first is None: continue
                        ref = candidate; ghosts = [first]
                        for future in list(window)[1:duration]:
                            choices = future['blobs_by_cam'].get(cam, [])
                            if not choices: break
                            ref = min(choices, key=lambda b: math.dist(b.xy, ref.xy))
                            if math.dist(ref.xy, ghosts[-1].xy) > 8.5: break
                            ghost = _edge_ghost(ref, transform, cam, pixel_x)
                            if ghost is None: break
                            ghosts.append(ghost)
                        if len(ghosts) == duration:
                            found = (cam, ghosts); break
                    if found: break
                if found:
                    cam, ghosts = found
                    for step, ghost in zip(window, ghosts):
                        step['blobs_by_cam'].setdefault(cam, []).append(ghost)
                    count += len(ghosts); episodes += 1; until = frame + len(ghosts)
            dst.write_step(current['t'], current['frame_idx'], frame, current['blobs_by_cam'])
            window.popleft()
            try: window.append(next(stream))
            except StopIteration: pass
    stream.close()
    return {'edge_ghosts':count, 'edge_episodes':episodes}


def generate(run_dir: Path, destination: Path, case: str, seed: int = 79001,
             max_frames: int | None = None) -> dict:
    """Stream GT, noise and independent/contiguous misses into real dump format."""
    if case not in CASES:
        raise ValueError(f"unknown case {case}; choices: {list(CASES)}")
    if case == 'edgeghost':
        temporary = destination.with_name(destination.name + '.base.tmp')
        try:
            stats = generate(run_dir, temporary, 'jitter09', seed, max_frames)
            stats.update(_inject_edge_ghosts(run_dir, temporary, destination, seed))
            stats['case'] = case
            return stats
        finally:
            temporary.unlink(missing_ok=True)
    sigma, miss_pct, bursting, ghosts = CASES[case]
    # Independent deterministic RNG per run/scenario; repeatable across machines.
    import hashlib
    salt = int.from_bytes(hashlib.sha256((run_dir.name + "/" + case).encode()).digest()[:8], "little")
    rng = random.Random(seed ^ salt)
    transforms, inverses, roi_pixels = _calibration(run_dir)
    cameras = {0: "cam1", 1: "cam2"}
    stats = {"frames": 0, "gt_points": 0, "dropped_iid": 0, "dropped_burst": 0,
             "ghosts": 0, "emitted": 0, "burst_starts": 0}
    burst_until: dict[str, int] = {}
    destination.parent.mkdir(parents=True, exist_ok=True)
    with (run_dir / "gt_frames.csv").open(encoding="utf-8-sig", newline="") as src, \
            BlobDumpWriter(destination, video=run_dir.name, stride=1,
                           cameras=cameras, core_version="engine_l-oracle-v1",
                           provenance=f"gt_oracle_{case}",
                           engine_inputs={"sigma_cm": sigma, "iid_pct": miss_pct,
                                          "bursts": bursting, "ghosts_per_100_frames": ghosts,
                                          "seed": seed}) as dst:
        rows = csv.DictReader(src)
        vehicles = [c[:-5] for c in rows.fieldnames or [] if c.endswith("_cams")]
        for row in rows:
            frame = int(row["frame"])
            if max_frames is not None and stats["frames"] >= max_frames:
                break
            by_cam: dict[int, list[Blob]] = {0: [], 1: []}
            for car in vehicles:
                visible = (row.get(car + "_cams") or "").strip()
                if not visible:
                    continue  # INVIS: no positive samples in either camera.
                u, v = row.get(car + "_u"), row.get(car + "_v")
                if not u or not v:
                    continue
                xy = sim_to_world(float(u), float(v))
                if not all(math.isfinite(z) for z in xy):
                    continue
                cams = visible.split("+")
                if bursting and frame >= burst_until.get(car, -1) and rng.random() < 1.0 / (60 * FPS):
                    burst_until[car] = frame + rng.randint(round(0.5 * FPS), round(2 * FPS))
                    stats["burst_starts"] += 1
                in_burst = frame < burst_until.get(car, -1)
                for cam_name in cams:
                    if cam_name not in inverses:
                        raise ValueError(f"unknown GT camera {cam_name}")
                    stats["gt_points"] += 1
                    if in_burst:
                        stats["dropped_burst"] += 1
                        continue
                    if rng.random() < miss_pct / 100.0:
                        stats["dropped_iid"] += 1
                        continue
                    noisy = (xy[0] + rng.gauss(0, sigma), xy[1] + rng.gauss(0, sigma)) if sigma else xy
                    cam = 0 if cam_name == "cam1" else 1
                    by_cam[cam].append(_make_blob(cam, frame, noisy, inverses[cam_name],
                                                  roi_pixels[cam_name]))
                    stats["emitted"] += 1
            for cam, name in cameras.items():
                # Poisson rare-event approximation: Bernoulli at these rates.
                # Split the requested TOTAL false-point rate across cameras;
                # false centres are constrained to the calibrated camera ROI.
                if rng.random() < ghosts / (100.0 * len(cameras)):
                    world = _sample_roi_world(roi_pixels[name], transforms[name], rng)
                    by_cam[cam].append(_make_blob(cam, frame, world, inverses[name],
                                                  roi_pixels[name]))
                    stats["ghosts"] += 1
                    stats["emitted"] += 1
            dst.write_step((frame + 1) / FPS, frame + 1, frame, by_cam)
            stats["frames"] += 1
    stats.update({"run": run_dir.name, "case": case, "seed": seed,
                  "observed_recall": round((stats["gt_points"] - stats["dropped_iid"]
                                            - stats["dropped_burst"]) / max(1, stats["gt_points"]), 6)})
    return stats


def _match_candidates(boxes: list[dict], gt_entries: list[dict], radius: float):
    """Vectorize P37's pair distances; preserve its greedy tie order."""
    if not boxes:
        return []
    entries = [entry for entry in gt_entries if entry.get("visible", True)]
    if not entries:
        return []
    e_xy = np.asarray([entry["tech"] for entry in entries], dtype=np.float64)
    b_xy = np.asarray([box["world"] for box in boxes], dtype=np.float64)
    distances = np.hypot(e_xy[:, None, 0] - b_xy[None, :, 0],
                         e_xy[:, None, 1] - b_xy[None, :, 1])
    same_camera = (np.asarray([entry["cam"] for entry in entries], dtype=object)[:, None]
                   == np.asarray([box["cam"] for box in boxes], dtype=object)[None, :])
    ei, bi = np.nonzero(same_camera & (distances <= radius))
    return [(float(distances[i, j]), entries[int(i)]["vehicle"], boxes[int(j)], int(j))
            for i, j in zip(ei, bi)]


def _p37_greedy_fast(boxes, gt_entries, radius=30.0):
    pairs = _match_candidates(boxes, gt_entries, radius)
    # P37 greedy_match sorts only by distance, stable by GT and bbox order.
    pairs.sort(key=lambda pair: pair[0])
    out, used = {}, set()
    for distance, vehicle, box, _index in pairs:
        if vehicle not in out and box["gid"] not in used:
            out[vehicle] = distance, box
            used.add(box["gid"])
    return out


def _p37_oracle_fast(boxes, gt_entries, radius=30.0):
    measured = [box for box in boxes if box["is_measurement"]]
    pairs = _match_candidates(measured, gt_entries, radius)
    # P37 oracle_match sorts by (distance, vehicle, measurement index).
    pairs.sort(key=lambda pair: (pair[0], pair[1], pair[3]))
    out, used = {}, set()
    for _distance, vehicle, box, index in pairs:
        if vehicle not in out and index not in used:
            out[vehicle] = box
            used.add(index)
    return out


def _p37_prediction_source(engine_source: str) -> str:
    """Translate Engine L's source vocabulary to the P37 dump contract."""
    return "measurement" if engine_source == "measured" else engine_source


def _all_visible_idf1(run_dir: Path, pred_path: Path, p37,
                      window: tuple[int, int] | None = None) -> dict:
    """Independent identity score over ALL visible cars (moving or parked).

    Uses the P37 position matching rule but does not alter P37's original
    moving-only IDF1. Stream the CSV/predictions twice to bound memory.
    """
    transforms = p37.load_transforms(run_dir)

    def assignments():
        with (run_dir / "gt_frames.csv").open(encoding="utf-8-sig", newline="") as gt_f, \
                pred_path.open(encoding="utf-8") as pred_f:
            rows = csv.DictReader(gt_f)
            vehicles = [field[:-5] for field in rows.fieldnames or [] if field.endswith("_cams")]
            gt_iter = iter(rows)
            current = next(gt_iter, None)
            for line in pred_f:
                pred = json.loads(line)
                frame = int(pred.get("source_frame_idx", pred["frame_idx"]))
                if window is not None and not (window[0] <= frame <= window[1]):
                    continue
                while current is not None and int(current["frame"]) < frame:
                    current = next(gt_iter, None)
                if current is None or int(current["frame"]) != frame:
                    raise ValueError(f"VAL predictions frame {frame} missing in GT")
                entries = []
                for car in vehicles:
                    cams = (current.get(car + "_cams") or "").strip()
                    if not cams:
                        continue
                    u, v = current.get(car + "_u"), current.get(car + "_v")
                    if not u or not v:
                        continue
                    xy = sim_to_world(float(u), float(v))
                    entries.extend({"vehicle": car, "cam": cam, "tech": xy,
                                    "visible": True} for cam in cams.split("+"))
                boxes = p37.boxes_of(pred, transforms)
                matched = _p37_greedy_fast(boxes, entries)
                yield {e["vehicle"] for e in entries}, {
                    car: box["gid"] for car, (_, box) in matched.items()
                    if box["is_measurement"]}

    freq = defaultdict(Counter)
    for _truth, matched in assignments():
        for car, gid in matched.items():
            freq[car][gid] += 1
    canonical = {car: counts.most_common(1)[0][0]
                 for car, counts in freq.items()}
    idtp = idfp = idfn = frame_count = 0
    for truth, matched in assignments():
        frame_count += 1
        for car in truth:
            gid = matched.get(car)
            if gid is None:
                idfn += 1
            elif gid == canonical.get(car):
                idtp += 1
            else:
                idfp += 1
                idfn += 1
        idfp += len(set(matched) - truth)
    return {"IDF1_all_visible": round(2 * idtp / max(1, 2 * idtp + idfp + idfn), 4),
            "all_visible_IDTP": idtp, "all_visible_IDFP": idfp,
            "all_visible_IDFN": idfn, "all_visible_frames": frame_count}


def evaluate(run_dir: Path, dump: Path, pred_path: Path,
             window: tuple[int, int] | None = None,
             oracle_quality: bool = True,
             gt_frame_offset: int | None = None) -> dict:
    """Replay ENGINE_L offline, score P37 and all-visible identity; no SIM3D."""
    spec = importlib.util.spec_from_file_location("p37_oracle", ROOT / ".orca/sim3d/p37_score.py")
    p37 = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(p37)
    # Equivalent P37 greedy assignments with batched distance computation.
    # This avoids repeating Python's box-by-GT nested loop on every frame.
    p37.greedy_match = _p37_greedy_fast
    p37.oracle_match = _p37_oracle_fast
    from .dump import read_dump
    header, steps = read_dump(dump)
    # The M1L VAL producer reads raw_cam*.mp4 sequentially: its first image
    # has source_frame_idx=1, while gt_frames.csv labels that image frame=0.
    # The GT-oracle producer already uses zero-based source_frame_idx.
    if gt_frame_offset is None:
        gt_frame_offset = -1 if header.get("provenance") == "core2_m1l_onnx_val" else 0
    dump_video = str(header.get("video", ""))
    if run_dir.name not in dump_video:
        steps.close()
        raise ValueError(f"dump video {dump_video!r} does not match GT run {run_dir.name!r}")
    cams = header["cameras"]
    transforms = p37.load_transforms(run_dir)
    gate_file = run_dir / "techgar_config/gate_zones.json"
    entry_gate = None
    if gate_file.exists():
        gate = json.loads(gate_file.read_text(encoding="utf-8"))["entry_gate"]
        entry_gate = ((float(gate["p1"]["x"]), float(gate["p1"]["y"])),
                      (float(gate["p2"]["x"]), float(gate["p2"]["y"])))
    engine = Core2EngineL(camera_transforms={int(cam): transforms[name]
                                               for cam, name in cams.items()},
                          entry_gate=entry_gate)
    written = 0
    output_sources = {"measured": 0, "held": 0, "predicted": 0}
    held_observations = 0
    first_gt_frame = last_gt_frame = None
    previous_gt_frame = None
    try:
        with pred_path.open("w", encoding="utf-8") as pred:
            for step in steps:
                gt_frame = step["source_frame_idx"] + gt_frame_offset
                if previous_gt_frame is not None and gt_frame <= previous_gt_frame:
                    raise ValueError("dump source frame indices must strictly increase")
                previous_gt_frame = gt_frame
                if gt_frame < 0:
                    raise ValueError(f"negative GT frame {gt_frame}: wrong frame offset")
                if window is not None and gt_frame > window[1]:
                    break
                out = engine.step(step["t"], step["frame_idx"], step["blobs_by_cam"])
                # Replay the prefix to warm tracker state, but P37's IDSW
                # ignores --window and reads all submitted prediction rows.
                if window is not None and gt_frame < window[0]:
                    continue
                observations = []
                for o in out:
                    output_sources[o.source] = output_sources.get(o.source, 0) + 1
                    for cam, bbox in o.bbox_by_cam.items():
                        if o.source == "held":
                            held_observations += 1
                        observations.append({"canonical_gid": o.gid,
                                             "prediction_source": _p37_prediction_source(o.source),
                                             "bbox": list(bbox), "camera_id": cams[str(cam)],
                                             "track_state": (
                                                 "stationary" if o.state is State.STOPPED
                                                 else "occluded" if o.state is State.OCCLUDED
                                                 else "tracked"),
                                             "local_track_id": o.gid})
                pred.write(json.dumps({"frame_idx": step["frame_idx"],
                                       "source_frame_idx": gt_frame,
                                       "observations": observations}, separators=(",", ":")) + "\n")
                first_gt_frame = gt_frame if first_gt_frame is None else first_gt_frame
                last_gt_frame = gt_frame
                written += 1
    finally:
        steps.close()
    if not written:
        raise ValueError(f"dump has no prediction frames in GT window {window}")
    score = p37.score(run_dir, pred_path, window, 1)
    visible_score = _all_visible_idf1(run_dir, pred_path, p37, window)
    quality = measure_oracle_input_quality(run_dir, dump) if oracle_quality else {}
    return {"IDSW": score["IDSW_meas"],
            "IDSW_meas": score["IDSW_meas"], "IDSW_all": score["IDSW_all"],
            "FRAG": score["FRAG"],
            "MIX": score["MIX"], "IDF1": score["IDF1"],
            "gt_frame_offset": gt_frame_offset, "scored_frames": written,
            "scored_gt_window": [first_gt_frame, last_gt_frame],
            "oracle_recall": score["oracle_recall"], "recall": score["recall"],
            "engine_stats": engine.stats(), "mix_detail": score.get("mix_detail", {}),
            "frag_detail": score.get("frag_detail", {}),
            "output_sources": output_sources,
            "held_observations": held_observations,
            **visible_score, **quality}


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=("generate", "evaluate", "suite", "quality", "val"))
    parser.add_argument("--run", default="sang_5p", choices=tuple(RUNS) + ("all",))
    parser.add_argument("--case", default="perfect", choices=tuple(CASES))
    parser.add_argument("--cases", default=",".join(CASES))
    parser.add_argument("--seed", type=int, default=79001)
    parser.add_argument("--max-frames", type=int)
    parser.add_argument("--out-dir", type=Path, default=ROOT / ".orca/core2/oracle_l")
    parser.add_argument("--keep-pred", action="store_true")
    parser.add_argument("--run-dir", type=Path, help="GT run directory for a VAL M1L dump")
    parser.add_argument("--dump", type=Path, help="external M1L Blob dump for VAL")
    parser.add_argument("--window", help="optional P37 GT window: first-last (default full)")
    parser.add_argument("--gt-frame-offset", type=int, default=None,
                        help="dump source_frame_idx + offset = GT frame (auto for M1L VAL: -1)")
    args = parser.parse_args(argv)
    if args.action == "val":
        if args.run_dir is None or args.dump is None:
            parser.error("val requires --run-dir and --dump")
        window = tuple(map(int, args.window.split("-"))) if args.window else None
        if window is not None and (len(window) != 2 or window[0] > window[1]):
            parser.error("--window must be first-last")
        args.out_dir.mkdir(parents=True, exist_ok=True)
        pred = args.out_dir / "val_engine_l.predictions.jsonl"
        row = evaluate(args.run_dir, args.dump, pred, window,
                       oracle_quality=False, gt_frame_offset=args.gt_frame_offset)
        (args.out_dir / "val_engine_l_scores.json").write_text(
            json.dumps(row, indent=2, ensure_ascii=False), encoding="utf-8")
        if not args.keep_pred:
            pred.unlink(missing_ok=True)
        print(json.dumps({k: v for k, v in row.items()
                          if k not in ("engine_stats", "frag_detail", "mix_detail")},
                         ensure_ascii=False, indent=2))
        return row
    selected_runs = RUNS if args.run == "all" else {args.run: RUNS[args.run]}
    selected_cases = args.cases.split(",") if args.action in ("suite", "quality") else [args.case]
    if any(c not in CASES for c in selected_cases):
        parser.error("unknown case in --cases")
    args.out_dir.mkdir(parents=True, exist_ok=True)
    results = {}
    for short, run in selected_runs.items():
        run_dir = ROOT / "sim3d/data/runs" / run
        for case in selected_cases:
            dump = args.out_dir / f"{short}_{case}.jsonl.gz"
            pred = args.out_dir / f"{short}_{case}.predictions.jsonl"
            summary = args.out_dir / "scores.json"
            if args.action == "quality":
                if not dump.exists():
                    raise FileNotFoundError(dump)
                existing = json.loads(summary.read_text(encoding="utf-8")) if summary.exists() else {}
                key = f"{short}/{case}"
                row = existing.get(key, {"generation": {"run": short, "case": case}})
                row.pop("m1l_3cm", None)
                row.update(measure_oracle_input_quality(run_dir, dump))
                existing[key] = row
                summary.write_text(json.dumps(existing, indent=2, ensure_ascii=False), encoding="utf-8")
                print(f"{key}: {json.dumps(row['oracle_input_3cm'], ensure_ascii=False)}", flush=True)
                gc.collect()
                continue
            if args.action != "evaluate":
                generation = generate(run_dir, dump, case, args.seed, args.max_frames)
            else:
                generation = {"run": short, "case": case}
            row = {"generation": generation}
            if args.action != "generate":
                row.update(evaluate(run_dir, dump, pred))
                if not args.keep_pred:
                    pred.unlink(missing_ok=True)
            results[f"{short}/{case}"] = row
            print(f"{short}/{case}: {json.dumps({k: v for k, v in row.items() if k not in ('engine_stats','frag_detail','mix_detail')}, ensure_ascii=False)}", flush=True)
            existing = json.loads(summary.read_text(encoding="utf-8")) if summary.exists() else {}
            existing[f"{short}/{case}"] = row
            summary.write_text(json.dumps(existing, indent=2, ensure_ascii=False), encoding="utf-8")
            gc.collect()
    return results


if __name__ == "__main__":
    main()
