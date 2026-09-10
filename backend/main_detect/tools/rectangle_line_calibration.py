"""Eight-pair planar fit: measured A-D rectangle plus four lateral V points.

V points are observations, not synthetic coordinates and NOT held-out checks.
All eight pairs enter the fit; none may be silently removed as an outlier.
"""
from __future__ import annotations

from datetime import datetime
import json
from pathlib import Path

import cv2
import numpy as np

from tools.calibrate_shared_map import (
    _pixel_normalizer, _project, _write_json,
    compute_distributed_shared_homographies, cross_camera_validation_diagnostics,
)

MODE = "rectangle_line_v1"
LABELS = ("A", "B", "C", "D", "V1", "V2", "V3", "V4")


def _line_geometry(points: np.ndarray) -> dict:
    center = points.mean(axis=0)
    _, _, axes = np.linalg.svd(points - center, full_matrices=False)
    direction = axes[0]
    # Orient from V1 to V4, independent of the opposing camera's image axes.
    if np.dot(points[-1] - points[0], direction) < 0:
        direction = -direction
    along = (points - center) @ direction
    perpendicular = np.abs((points - center) @ axes[1])
    return {
        "span_px_at_1280": float(np.ptp(along)),
        "max_line_deviation_px_at_1280": float(perpendicular.max()),
        "ordered": bool(np.all(np.diff(along) > 4.0)),
        "angle_degrees_image_only": float(np.degrees(np.arctan2(direction[1], direction[0]))),
    }


def compute_rectangle_line_homographies(measurements, fit_pairs, image_sizes):
    by_label = {pair["label"]: pair for pair in fit_pairs}
    if len(fit_pairs) != 8 or set(by_label) != set(LABELS):
        raise ValueError("Can dung 8 cap A-D,V1-V4")
    pairs = [by_label[label] for label in LABELS]
    geometry = {}
    failures = []
    worlds = {}
    for camera in ("cam1", "cam2"):
        rows = {row["label"]: row for row in measurements[camera]}
        pixels = np.asarray([pair[camera] for pair in pairs], np.float64)
        if not np.isfinite(pixels).all():
            raise ValueError(f"{camera}: toa do khong huu han")
        width, height = image_sizes[camera]
        if np.any(pixels < 0) or np.any(pixels >= [width, height]):
            raise ValueError(f"{camera}: diem nam ngoai anh capture")
        corners = pixels[:4].astype(np.float32)
        if not cv2.isContourConvex(corners) or abs(cv2.contourArea(corners)) < 100:
            raise ValueError(f"{camera}: A-D phai la tu giac loi khong suy bien")
        for pair in pairs[:4]:
            label = pair["label"]
            if label not in rows or not np.allclose(rows[label]["pixel"], pair[camera], atol=1e-5):
                raise ValueError(f"{camera}:{label}: CSV va diem cap khong cung anh/lan cham")
        worlds[camera] = np.asarray([rows[label]["world"] for label in LABELS[:4]], np.float64)
        normalized = _project(pixels, _pixel_normalizer(image_sizes[camera]))
        distances = np.linalg.norm(normalized[:, None] - normalized[None, :], axis=2)
        np.fill_diagonal(distances, np.inf)
        if distances.min() < 4:
            raise ValueError(f"{camera}: hai diem qua gan/trung nhau (<4px tai chieu rong 1280)")
        info = _line_geometry(normalized[4:])
        # Reference-relative check, not a fictitious percentage of the entire ground.
        info["minimum_span_px_at_1280"] = max(80.0, 0.75 * float(np.ptp(normalized[:4, 0])))
        if info["span_px_at_1280"] < info["minimum_span_px_at_1280"]:
            failures.append(f"{camera}: V1-V4 chua trai rong theo chieu ngang")
        if not info["ordered"]:
            failures.append(f"{camera}: thu tu V1-V4 khong lien tuc tren cung duong")
        if info["max_line_deviation_px_at_1280"] > 8:
            failures.append(f"{camera}: V1-V4 chua phu hop mot duong thang; kiem tra mat bai/ong kinh/diem")
        geometry[camera] = info
    if not np.isfinite(worlds["cam1"]).all() or not np.allclose(worlds["cam1"], worlds["cam2"]):
        raise ValueError("A-D hai camera phai dung cung so do centimet")
    world = worlds["cam1"]
    ab, ad = world[1, 0], world[3, 1]
    if ab <= 0 or ad <= 0 or not np.allclose(world, [[0, 0], [ab, 0], [ab, ad], [0, ad]]):
        raise ValueError("He centimet phai la A(0,0), B(AB,0), C(AB,AD), D(0,AD)")

    transforms, diagnostics, relative = compute_distributed_shared_homographies(
        measurements, pairs, image_sizes, min_inliers=8, min_inlier_ratio=1.0,
        use_all_pairs=True,
    )
    before = {}
    for camera in ("cam1", "cam2"):
        before[camera], _ = cv2.findHomography(
            np.asarray([pair[camera] for pair in pairs[:4]], np.float32), world, method=0,
        )
    before_errors = cross_camera_validation_diagnostics(pairs, before, image_sizes)
    after_errors = cross_camera_validation_diagnostics(pairs, transforms, image_sizes)
    for previous, current in zip(before_errors["points"], after_errors["points"]):
        current["before_symmetric_pixel_error"] = previous["symmetric_pixel_error"]
        current["before_cross_camera_error_cm"] = previous["cross_camera_error_cm"]
    after_errors.update({
        "evidence_kind": "training_fit_not_independent_validation",
        "line_geometry": geometry,
        "before_p95_symmetric_pixel_error": before_errors["p95_symmetric_pixel_error"],
        "independent_validation": False,
        "geometry_failures": failures,
    })
    relative["point_roles"] = {label: "metric_anchor" if label in LABELS[:4] else "line_correction" for label in LABELS}
    return transforms, diagnostics, relative, after_errors


def fit_gate(report: dict, diagnostics: dict, max_error_cm: float = 2.0) -> list[str]:
    """Evaluate every pair, including the four corners; no RANSAC hiding failures."""
    fields = ("p95_symmetric_pixel_error", "max_symmetric_pixel_error", "max_error_cm")
    if (any(not isinstance(report.get(key), (float, int)) or not np.isfinite(report[key]) for key in fields)
            or set(diagnostics) != {"cam1", "cam2"}
            or any(not np.isfinite(info.get("max_error_cm", float("nan"))) for info in diagnostics.values())
            or not np.isfinite(max_error_cm) or max_error_cm <= 0):
        return ["invalid_fit_diagnostics"]
    reasons = list(report.get("geometry_failures", ["missing_geometry_checks"]))
    if report["p95_symmetric_pixel_error"] > 5 or report["max_symmetric_pixel_error"] > 8:
        reasons.append("eight_pair_pixel_residual_exceeded")
    if report["max_error_cm"] > max_error_cm:
        reasons.append("eight_pair_cross_camera_cm_residual_exceeded")
    if any(info["max_error_cm"] > max_error_cm for info in diagnostics.values()):
        reasons.append("measured_rectangle_cm_residual_exceeded")
    return reasons


def approve_rectangle_line_calibration(candidate_path: Path, output_path: Path) -> dict:
    """Called only after explicit visual approval; never promotes a failed fit."""
    payload = json.loads(candidate_path.read_text(encoding="utf-8"))
    quality = payload.get("calibration_quality", {})
    report = quality.get("rectangle_line_fit", {})
    if (payload.get("calibration_algorithm") != MODE
            or payload.get("calibration_status") != "fit_ready"
            or report.get("status") != "fit_ready"
            or fit_gate(report, quality.get("cameras", {}), report.get("max_error_cm_limit", 2.0))):
        raise ValueError("Chi chap nhan ban rectangle-line fit_ready da qua kiem tra tat ca diem")
    payload["calibration_status"] = "reviewed_fit"
    payload["calibration_quality"]["status"] = "reviewed_fit"
    payload["visual_review"] = {
        "accepted": True,
        "reviewed_at": datetime.now().astimezone().isoformat(),
        "scope": "fitted_ground_support_only",
        "independent_validation": False,
    }
    _write_json(output_path, payload)
    return payload
