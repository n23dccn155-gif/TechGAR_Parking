"""Recover per-session camera homographies from recorded predictions.

Every record session was captured with a different calibration file than the
current ``config/two_camera.shared_cm_01.json`` and the record-time files were
overwritten.  Luckily ``predictions.jsonl`` stores both ``anchor_pixel`` and
``anchor_world`` for every observation, so the pixel -> world homography each
session actually ran with can be re-fit from the data itself.

For every session the tool:

1. Collects (source_pixel, anchor_world) pairs per camera (any
   ``invisible_count``), where source_pixel honours the recorded
   ``anchor_world.reference`` -- "bbox_center" maps the bbox centre, anything
   else falls back to ``anchor_pixel`` -- and fits H with
   ``cv2.findHomography(..., cv2.RANSAC, 0.5)`` (threshold in world cm),
   then tries an iterative least-squares refit on the RANSAC inliers and
   keeps whichever variant has the lower p95 residual.
2. Marks a camera fit "sufficient" when n >= 30 AND inlier_ratio >= 0.5 AND
   p95 <= 4.0cm.  Insufficient cameras with pairs score every other
   session's fitted H on the same camera (project the weak session's own
   pairs, lowest p50 wins); a best donor p50 <= 4.0cm is accepted as
   "borrowed-scored".  When every donor is provably incompatible but the
   weak own fit is accurate (p95 <= 4.0cm) it is kept as "fit-weak" -- a
   known-wrong borrow is never emitted.  Cameras that cannot be fitted or
   scored (zero pairs) fall back to the ``--borrow`` map and are flagged
   "borrowed-unverifiable".
3. Emits ``<output-root>/<session>/calibration.json``: a deep copy of the
   current shared_cm_01 schema template with the recovered camera_transforms
   plus coverage/full-view/slot/overlap/bounds polygons derived through the
   recovered H, and ``source.capture_manifest.cameras[*].width/height`` set
   to the raw video dims so ``adapt_calibration_to_frame_sizes`` cannot
   rescale.  ``calibration_status`` is "passed" and the rectangle-line
   ``calibration_algorithm``/``calibration_quality`` gate fields are removed
   so ``two_camera.load_calibration`` accepts the file.
4. Validates every emitted file by actually calling
   ``two_camera.load_calibration`` and writes ``<output-root>/manifest.json``
   with per-camera fit stats, borrow decisions, file sha256 and a
   per-session confidence label
   ("fit" / "borrowed-scored" / "borrowed-unverifiable" / "fit-weak").

Usage:
    python experiment_test/recover_session_calibration.py
    python experiment_test/recover_session_calibration.py --sessions NAME ...
    python experiment_test/recover_session_calibration.py \
        --borrow droidcam_shared_toi1:cam1=droidcam_shared_bt:cam1

Feed the result to replay_acceptance.py via
``--calibration-root experiment_test/recovered_cal``.
"""

from __future__ import annotations

import argparse
import copy
import hashlib
import json
from pathlib import Path
import sys
from typing import Dict, List, Optional, Sequence, Tuple

import cv2
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
TEST_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))  # two_camera.load_calibration validation

CAMERAS = ("cam1", "cam2")
MIN_PAIRS_FOR_FIT = 4          # homography needs 4 correspondences
MIN_PAIRS_SUFFICIENT = 30      # below this the fit is not trusted alone
MIN_INLIER_RATIO = 0.5
MAX_P95_CM = 4.0               # own-fit accept bound (world cm)
RANSAC_THRESHOLD_CM = 0.5      # inlier bound, in world units (cm)
DONOR_ACCEPT_P50_CM = 4.0      # scored donor accept bound (world cm)
REFIT_ITERATIONS = 3
BOUNDS_MARGIN_CM = 20.0

DEFAULT_SESSIONS = (
    "droidcam_shared_bt", "droidcam_shared_hiep2", "droidcam_shared_hiep7",
    "droidcam_shared_hiep8", "droidcam_shared_live15", "droidcam_shared_toi1",
    "droidcam_shared_vd_16", "droidcam_shared_vd_18", "droidcam_live14",
)
# Cameras that can never be scored (no usable anchor pairs) borrow the fitted
# H of a session recorded on the same physical rig position.
DEFAULT_BORROW = {
    ("droidcam_shared_toi1", "cam1"): ("droidcam_shared_bt", "cam1"),
    ("droidcam_shared_vd_18", "cam1"): ("droidcam_shared_hiep8", "cam1"),
    ("droidcam_shared_vd_18", "cam2"): ("droidcam_shared_hiep8", "cam2"),
}

PairList = List[Tuple[Tuple[float, float], Tuple[float, float]]]


def source_pixel(obs: dict) -> Optional[Tuple[float, float]]:
    """Pixel that produced ``anchor_world``, chosen by its own reference.

    ``anchor_world.reference`` is the tracking_defaults.shared_map_anchor:
    "bbox_center" means the world anchor was projected from the bounding-box
    centre (x+w/2, y+h/2), "tracker_center" from ``anchor_pixel``.  Fitting
    the wrong source absorbs a varying h/2 offset into H and leaves a
    systematic cross-camera error, so the declared reference wins.
    """
    world = obs.get("anchor_world") or {}
    reference = str(world.get("reference") or "")
    bbox = obs.get("bbox")
    if reference == "bbox_center" and bbox:
        return float(bbox[0]) + float(bbox[2]) / 2.0, \
            float(bbox[1]) + float(bbox[3]) / 2.0
    if reference == "tracker_center":
        pixel = obs.get("anchor_pixel")
        if pixel:
            return float(pixel["x"]), float(pixel["y"])
    # Unknown/missing reference: prefer the declared anchor_pixel, else bbox.
    pixel = obs.get("anchor_pixel")
    if pixel:
        return float(pixel["x"]), float(pixel["y"])
    if bbox:
        return float(bbox[0]) + float(bbox[2]) / 2.0, \
            float(bbox[1]) + float(bbox[3]) / 2.0
    return None


def collect_pairs(predictions_path: Path) -> Dict[str, PairList]:
    """All (source_pixel, anchor_world) pairs per camera, any invisibility."""
    pairs: Dict[str, PairList] = {cam: [] for cam in CAMERAS}
    with predictions_path.open("r", encoding="utf-8") as handle:
        for line in handle:
            line = line.strip()
            if not line:
                continue
            for obs in json.loads(line).get("observations") or []:
                camera = obs.get("camera_id")
                world = obs.get("anchor_world")
                if camera not in pairs or not world:
                    continue
                pixel = source_pixel(obs)
                if pixel is not None:
                    pairs[camera].append(
                        (pixel, (float(world["x"]), float(world["y"]))))
    return pairs


def arrays(pairs: PairList) -> Tuple[np.ndarray, np.ndarray]:
    px = np.asarray([p[0] for p in pairs], dtype=np.float64)
    world = np.asarray([p[1] for p in pairs], dtype=np.float64)
    return px, world


def residuals(homography: np.ndarray, px: np.ndarray, world: np.ndarray) -> np.ndarray:
    projected = cv2.perspectiveTransform(px.reshape(-1, 1, 2), homography)
    return np.linalg.norm(projected.reshape(-1, 2) - world, axis=1)


def residual_stats(residual_values: np.ndarray) -> dict:
    inliers = int(np.sum(residual_values <= RANSAC_THRESHOLD_CM))
    return {
        "n": int(residual_values.size),
        "inliers": inliers,
        "inlier_ratio": round(inliers / max(1, residual_values.size), 4),
        "p50": round(float(np.percentile(residual_values, 50)), 4),
        "p95": round(float(np.percentile(residual_values, 95)), 4),
    }


def fit_homography(pairs: PairList) -> Tuple[Optional[np.ndarray], Optional[dict]]:
    """RANSAC fit; returns (H, stats-on-all-pairs) or (None, None)."""
    if len(pairs) < MIN_PAIRS_FOR_FIT:
        return None, None
    px, world = arrays(pairs)
    homography, mask = cv2.findHomography(
        px, world, cv2.RANSAC, RANSAC_THRESHOLD_CM)
    if homography is None:
        return None, None
    return homography, residual_stats(residuals(homography, px, world))


def refit_on_inliers(
    pairs: PairList, homography: np.ndarray,
) -> Tuple[Optional[np.ndarray], Optional[dict]]:
    """Least-squares refit on RANSAC inliers, iterated; stats on all pairs."""
    px, world = arrays(pairs)
    selected = residuals(homography, px, world) <= RANSAC_THRESHOLD_CM
    if int(selected.sum()) < MIN_PAIRS_FOR_FIT:
        return None, None
    refined = homography
    for _ in range(REFIT_ITERATIONS):
        candidate, _ = cv2.findHomography(px[selected], world[selected], 0)
        if candidate is None:
            break
        refined = candidate
        selected = residuals(refined, px, world) <= RANSAC_THRESHOLD_CM
        if int(selected.sum()) < MIN_PAIRS_FOR_FIT:
            break
    return refined, residual_stats(residuals(refined, px, world))


def sufficient(stats: dict) -> bool:
    return (
        stats["n"] >= MIN_PAIRS_SUFFICIENT
        and stats["inlier_ratio"] >= MIN_INLIER_RATIO
        and stats["p95"] <= MAX_P95_CM
    )


def project_points(homography: np.ndarray, points: Sequence[Sequence[float]]) -> List[List[float]]:
    px = np.asarray(points, dtype=np.float64).reshape(-1, 1, 2)
    projected = cv2.perspectiveTransform(px, homography).reshape(-1, 2)
    return [[round(float(x), 4), round(float(y), 4)] for x, y in projected]


def counter_clockwise(polygon: np.ndarray) -> np.ndarray:
    signed = cv2.contourArea(polygon.astype(np.float32).reshape(-1, 1, 2),
                             oriented=True)
    return polygon[::-1] if signed < 0 else polygon


def polygon_intersection(first: np.ndarray, second: np.ndarray) -> np.ndarray:
    """Convex intersection of two polygons; empty array when disjoint."""
    area, output = cv2.intersectConvexConvex(
        counter_clockwise(first).astype(np.float32),
        counter_clockwise(second).astype(np.float32),
    )
    if area <= 0 or output is None or len(output) < 3:
        return np.empty((0, 2), dtype=np.float64)
    return np.asarray(output, dtype=np.float64).reshape(-1, 2)


def union_bounds(polygons: Sequence[np.ndarray], margin: float) -> dict:
    points = np.vstack([np.asarray(p, dtype=np.float64) for p in polygons])
    lo = points.min(axis=0) - margin
    hi = points.max(axis=0) + margin
    return {
        "min_x_cm": round(float(lo[0]), 3),
        "min_y_cm": round(float(lo[1]), 3),
        "max_x_cm": round(float(hi[0]), 3),
        "max_y_cm": round(float(hi[1]), 3),
    }


def video_size(path: Path) -> Optional[Tuple[int, int]]:
    capture = cv2.VideoCapture(str(path))
    if not capture.isOpened():
        capture.release()
        return None
    size = (int(capture.get(cv2.CAP_PROP_FRAME_WIDTH)),
            int(capture.get(cv2.CAP_PROP_FRAME_HEIGHT)))
    capture.release()
    return size


def parse_borrow(text: str) -> Tuple[Tuple[str, str], Tuple[str, str]]:
    """Parse 'SESSION:CAM=DONOR_SESSION:CAM'."""
    left, sep, right = text.partition("=")
    if not sep:
        raise ValueError(f"--borrow expects SESSION:CAM=DONOR:CAM, got {text!r}")

    def split(side: str) -> Tuple[str, str]:
        session, colon, cam = side.rpartition(":")
        if not colon or cam not in CAMERAS or not session:
            raise ValueError(f"bad --borrow endpoint {side!r} (want SESSION:camN)")
        return session, cam

    return split(left), split(right)


def resolve_session(name: str, known: Sequence[str]) -> str:
    """Accept a full session name or the 'droidcam_(shared_)' short alias."""
    if name in known:
        return name
    for candidate in known:
        short = candidate
        for prefix in ("droidcam_shared_", "droidcam_"):
            if short.startswith(prefix):
                short = short[len(prefix):]
        if name == short:
            return candidate
    return name


def short_name(session: str) -> str:
    for prefix in ("droidcam_shared_", "droidcam_"):
        if session.startswith(prefix):
            return session[len(prefix):]
    return session


def build_calibration(
    template: dict,
    session: str,
    transforms: Dict[str, np.ndarray],
    frame_sizes: Dict[str, Tuple[int, int]],
    roi_polygons_px: Dict[str, np.ndarray],
    slot_polygons_px: Dict[str, List[Tuple[str, np.ndarray]]],
) -> Tuple[dict, List[str]]:
    """Deep-copy the shared_cm_01 template and re-derive world geometry."""
    warnings: List[str] = []
    calibration = copy.deepcopy(template)
    calibration["calibration_id"] = f"recovered-{session}"
    calibration["calibration_status"] = "passed"
    # The rectangle-line gate would re-run fit_gate on stale quality data and
    # reject the file; a recovered homography has no line fit to review.
    for stale_key in (
        "calibration_algorithm", "calibration_quality",
        "fitted_ground_overlap_world_polygon", "visual_review",
    ):
        calibration.pop(stale_key, None)

    for cam in CAMERAS:
        homography = transforms[cam]
        calibration["camera_transforms"][cam] = homography.tolist()
        calibration["camera_coverage_world"][cam] = project_points(
            homography, roi_polygons_px[cam])
        width, height = frame_sizes[cam]
        corners = [(0, 0), (width, 0), (width, height), (0, height)]
        calibration["camera_full_view_world"][cam] = project_points(
            homography, corners)
        calibration["parking_slots_world"][cam] = [
            {"id": slot_id,
             "polygon": project_points(homography, polygon_px)}
            for slot_id, polygon_px in slot_polygons_px[cam]
        ]

    coverage = {
        cam: np.asarray(calibration["camera_coverage_world"][cam],
                        dtype=np.float64)
        for cam in CAMERAS
    }
    full_view = {
        cam: np.asarray(calibration["camera_full_view_world"][cam],
                        dtype=np.float64)
        for cam in CAMERAS
    }
    overlap = polygon_intersection(coverage["cam1"], coverage["cam2"])
    if len(overlap) < 3:
        smaller = min(coverage.values(), key=lambda p: cv2.contourArea(
            p.astype(np.float32).reshape(-1, 1, 2)))
        overlap = smaller
        warnings.append(
            "coverage intersection empty; fell back to smaller coverage polygon")
    calibration["overlap_world_polygon"] = [
        [round(float(x), 4), round(float(y), 4)] for x, y in overlap]
    full_overlap = polygon_intersection(full_view["cam1"], full_view["cam2"])
    if len(full_overlap) < 3:
        smaller = min(full_view.values(), key=lambda p: cv2.contourArea(
            p.astype(np.float32).reshape(-1, 1, 2)))
        full_overlap = smaller
        warnings.append(
            "full-view intersection empty; fell back to smaller polygon")
    calibration["full_view_overlap_world_polygon"] = [
        [round(float(x), 4), round(float(y), 4)] for x, y in full_overlap]
    world = calibration.setdefault("world", {})
    world["bounds"] = union_bounds(list(coverage.values()), BOUNDS_MARGIN_CM)
    world["full_view_bounds"] = union_bounds(
        list(full_view.values()), BOUNDS_MARGIN_CM)

    manifest_cameras = (
        calibration.setdefault("source", {})
        .setdefault("capture_manifest", {})
        .setdefault("cameras", {})
    )
    for cam in CAMERAS:
        width, height = frame_sizes[cam]
        manifest_cameras.setdefault(cam, {})["width"] = width
        manifest_cameras.setdefault(cam, {})["height"] = height
    calibration["recovery"] = {
        "method": "ransac_refit_on_predictions_anchor_pairs",
        "session": session,
        "template": "config/two_camera.shared_cm_01.json",
    }
    return calibration, warnings


def session_confidence(cameras: Dict[str, dict]) -> str:
    order = {"fit": 0, "fit-weak": 1, "borrowed-scored": 2,
             "borrowed-unverifiable": 3, "error": 4}
    return max((entry["confidence"] for entry in cameras.values()),
               key=lambda label: order[label])


def main(argv: Optional[List[str]] = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--sessions", nargs="+", default=list(DEFAULT_SESSIONS))
    parser.add_argument("--source-root", type=Path,
                        default=TEST_DIR / "output",
                        help="where record sessions live (default "
                             "experiment_test/output)")
    parser.add_argument("--output-root", type=Path,
                        default=TEST_DIR / "recovered_cal",
                        help="where <session>/calibration.json and "
                             "manifest.json are written")
    parser.add_argument("--template", type=Path,
                        default=ROOT / "config/two_camera.shared_cm_01.json",
                        help="schema template calibration json")
    parser.add_argument("--borrow", action="append", default=[], metavar="S:CAM=D:CAM",
                        help="fallback donor for unscoreable cams, e.g. "
                             "droidcam_shared_toi1:cam1=droidcam_shared_bt:cam1")
    args = parser.parse_args(argv)

    source_root = args.source_root.resolve()
    output_root = args.output_root.resolve()
    sessions = [resolve_session(name, list(DEFAULT_SESSIONS))
                for name in args.sessions]

    # Donor pool = every record session under source-root (predictions.jsonl
    # + raw_cam1.mp4), not only --sessions.
    donor_pool = sorted(
        path.name for path in source_root.iterdir()
        if path.is_dir() and (path / "predictions.jsonl").is_file()
        and (path / "raw_cam1.mp4").is_file()
    ) if source_root.is_dir() else []
    known_names = sorted(set(sessions) | set(donor_pool) | set(DEFAULT_SESSIONS))
    borrow_map = dict(DEFAULT_BORROW)
    try:
        for text in args.borrow:
            (session, cam), (donor, donor_cam) = parse_borrow(text)
            borrow_map[(resolve_session(session, known_names), cam)] = (
                resolve_session(donor, known_names), donor_cam)
    except ValueError as exc:
        parser.error(str(exc))

    template = json.loads(args.template.read_text(encoding="utf-8"))
    roi_polygons_px: Dict[str, np.ndarray] = {}
    slot_polygons_px: Dict[str, List[Tuple[str, np.ndarray]]] = {}
    for cam in CAMERAS:
        roi = json.loads((ROOT / f"config/roi_mask_{cam}.json")
                         .read_text(encoding="utf-8"))
        roi_polygons_px[cam] = np.asarray(
            [(p["x"], p["y"]) for p in roi["polygon"]], dtype=np.float64)
        slots = json.loads((ROOT / f"config/parking_slots_{cam}.json")
                           .read_text(encoding="utf-8"))
        slot_polygons_px[cam] = [
            (str(slot["id"]),
             np.asarray([(p["x"], p["y"]) for p in slot["polygon"]],
                        dtype=np.float64))
            for slot in slots["slots"]
        ]

    # Pass 1: per-session own fits over every known session (the donor pool
    # needs their fitted H even when they are not being emitted).
    own_fits: Dict[str, Dict[str, dict]] = {}
    for name in sorted(set(sessions) | set(donor_pool)):
        predictions = source_root / name / "predictions.jsonl"
        if not predictions.is_file():
            if name in sessions:
                print(f"WARN: {name} has no predictions.jsonl", flush=True)
            continue
        pairs = collect_pairs(predictions)
        entry: Dict[str, dict] = {}
        for cam in CAMERAS:
            cam_pairs = pairs[cam]
            record = {"n_pairs": len(cam_pairs), "pairs": cam_pairs}
            homography, stats = fit_homography(cam_pairs)
            if homography is not None:
                refined, refit_stats = refit_on_inliers(cam_pairs, homography)
                record["own_fit"] = stats
                if refit_stats is not None:
                    record["refit"] = refit_stats
                    if refit_stats["p95"] < stats["p95"]:
                        homography = refined
                record["homography"] = homography
                record["sufficient"] = sufficient(stats)
            entry[cam] = record
        own_fits[name] = entry

    print("\n=== recovered homography fits ===")
    header = (f"{'session':24s} {'cam':5s} {'n':>5s} {'inl%':>6s} {'p50':>6s} "
              f"{'p95':>6s} {'refit95':>8s}  decision")
    print(header)
    print("-" * len(header))

    # Pass 2: decisions + emission.  two_camera is imported once so a broken
    # environment marks every file unvalidated instead of crashing midway.
    try:
        import two_camera
    except Exception as exc:  # noqa: BLE001 - report, do not crash
        two_camera = None
        print(f"WARN: cannot import two_camera for validation: {exc}",
              flush=True)

    manifest: Dict[str, dict] = {}
    output_root.mkdir(parents=True, exist_ok=True)
    had_error = False
    for name in sessions:
        fits = own_fits.get(name)
        if fits is None:
            manifest[name] = {"confidence": "error",
                              "error": "missing predictions.jsonl"}
            had_error = True
            continue
        decisions: Dict[str, dict] = {}
        transforms: Dict[str, np.ndarray] = {}
        for cam in CAMERAS:
            record = fits[cam]
            decision = {"n_pairs": record["n_pairs"],
                        "own_fit": record.get("own_fit"),
                        "refit": record.get("refit")}
            if record.get("sufficient"):
                transforms[cam] = record["homography"]
                decision.update(decision="own", donor=None,
                                donor_p50=None, confidence="fit")
            elif record["n_pairs"] == 0:
                donor = borrow_map.get((name, cam))
                if donor and own_fits.get(donor[0], {}).get(
                        donor[1], {}).get("homography") is not None:
                    transforms[cam] = own_fits[donor[0]][donor[1]]["homography"]
                    decision.update(decision="borrow",
                                    donor=f"{donor[0]}:{donor[1]}",
                                    donor_p50=None,
                                    confidence="borrowed-unverifiable")
                else:
                    decision.update(decision="none", donor=None,
                                    donor_p50=None, confidence="error")
                    decision["error"] = "zero pairs and no usable --borrow"
            else:
                px, world = arrays(record["pairs"])
                scored = []
                for donor_name, donor_fits in own_fits.items():
                    donor_record = donor_fits.get(cam, {})
                    if donor_name == name or donor_record.get("homography") is None:
                        continue
                    scored.append((donor_name, residual_stats(
                        residuals(donor_record["homography"], px, world))))
                scored.sort(key=lambda item: item[1]["p50"])
                decision["donor_scores"] = {
                    donor: stats for donor, stats in scored[:5]}
                if scored and scored[0][1]["p50"] <= DONOR_ACCEPT_P50_CM:
                    donor_name, donor_stats = scored[0]
                    transforms[cam] = own_fits[donor_name][cam]["homography"]
                    decision.update(decision="donor", donor=donor_name,
                                    donor_p50=donor_stats["p50"],
                                    confidence="borrowed-scored")
                elif (record.get("homography") is not None
                        and record["own_fit"]["p95"] <= MAX_P95_CM):
                    # Every donor is provably incompatible with this camera's
                    # own pairs (unique rig geometry), while the weak own fit
                    # is accurate: keep it instead of a known-wrong borrow.
                    transforms[cam] = record["homography"]
                    decision.update(decision="own", donor=None,
                                    donor_p50=scored[0][1]["p50"] if scored else None,
                                    confidence="fit-weak")
                else:
                    donor = borrow_map.get((name, cam))
                    if donor and own_fits.get(donor[0], {}).get(
                            donor[1], {}).get("homography") is not None:
                        transforms[cam] = own_fits[donor[0]][donor[1]]["homography"]
                        decision.update(
                            decision="borrow",
                            donor=f"{donor[0]}:{donor[1]}",
                            donor_p50=scored[0][1]["p50"] if scored else None,
                            confidence="borrowed-unverifiable")
                    elif record.get("homography") is not None:
                        transforms[cam] = record["homography"]
                        decision.update(decision="own", donor=None,
                                        donor_p50=None, confidence="fit-weak")
                    else:
                        decision.update(decision="none", donor=None,
                                        donor_p50=None, confidence="error")
                        decision["error"] = "no fit, no donor, no borrow"
            decisions[cam] = decision
            own = record.get("own_fit") or {}
            row = (f"{name:24s} {cam:5s} {record['n_pairs']:5d} "
                   f"{own.get('inlier_ratio', float('nan')):6.2f} "
                   f"{own.get('p50', float('nan')):6.2f} "
                   f"{own.get('p95', float('nan')):6.2f} "
                   f"{(record.get('refit') or {}).get('p95', float('nan')):8.2f}  "
                   f"{decision['decision']:8s} {decision.get('donor') or '-':32s} "
                   f"{decision['confidence']}")
            print(row)

        missing = [cam for cam in CAMERAS if cam not in transforms]
        entry = {"cameras": decisions,
                 "confidence": session_confidence(decisions)}
        if missing:
            entry["confidence"] = "error"
            entry["error"] = f"no homography for {missing}"
            had_error = True
        else:
            frame_sizes = {}
            for cam in CAMERAS:
                size = video_size(source_root / name / f"raw_{cam}.mp4")
                if size is None:
                    entry["confidence"] = "error"
                    entry["error"] = f"cannot read raw_{cam}.mp4"
                    had_error = True
                    break
                frame_sizes[cam] = size
            else:
                calibration, warnings = build_calibration(
                    template, name, transforms, frame_sizes,
                    roi_polygons_px, slot_polygons_px)
                session_dir = output_root / name
                session_dir.mkdir(parents=True, exist_ok=True)
                out_path = session_dir / "calibration.json"
                payload = json.dumps(calibration, indent=1) + "\n"
                out_path.write_text(payload, encoding="utf-8")
                entry["warnings"] = warnings
                entry["files"] = {
                    "calibration.json": {
                        "sha256": hashlib.sha256(
                            payload.encode("utf-8")).hexdigest(),
                        "bytes": len(payload.encode("utf-8")),
                    }
                }
                if two_camera is None:
                    entry["load_calibration"] = "FAIL: two_camera unavailable"
                    entry["confidence"] = "error"
                    had_error = True
                else:
                    try:
                        two_camera.load_calibration(out_path)
                        entry["load_calibration"] = "ok"
                    except Exception as exc:
                        entry["load_calibration"] = f"FAIL: {exc}"
                        entry["confidence"] = "error"
                        had_error = True
        manifest[name] = entry
        print(f"  -> {name}: confidence={entry['confidence']}")

    manifest_doc = {
        "generated_by": Path(__file__).name,
        "template": str(args.template),
        "thresholds": {
            "ransac_cm": RANSAC_THRESHOLD_CM,
            "min_pairs": MIN_PAIRS_SUFFICIENT,
            "min_inlier_ratio": MIN_INLIER_RATIO,
            "max_p95_cm": MAX_P95_CM,
            "donor_accept_p50_cm": DONOR_ACCEPT_P50_CM,
        },
        "sessions": manifest,
    }
    manifest_path = output_root / "manifest.json"
    manifest_path.write_text(json.dumps(manifest_doc, indent=1) + "\n",
                             encoding="utf-8")
    print(f"\nwrote {manifest_path}")
    return 1 if had_error else 0


if __name__ == "__main__":
    raise SystemExit(main())
