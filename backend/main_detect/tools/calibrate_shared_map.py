"""Calibrate two partial camera views into one measured ground-plane map.

Workflow::

    capture -> mark -> fill calibration_points.csv -> build

Each camera gets its own pixel-to-world homography.  Calibration points do not
have to be visible in both cameras; they only need measured ``(x, y)`` values
in the same centimetre coordinate system on the physical parking model.
"""

from __future__ import annotations

import argparse
import csv
from datetime import datetime
import hashlib
import json
from pathlib import Path
from typing import Dict, Iterable, List, Sequence, Tuple

import cv2
import numpy as np


MANIFEST_NAME = "capture_manifest.json"
POINTS_NAME = "calibration_points.csv"
VALIDATION_POINTS_NAME = "cross_camera_validation_points.json"
PAIRED_POINTS_NAME = "paired_ground_points.json"
CAMERA_IDS = ("cam1", "cam2")
CSV_FIELDS = (
    "camera",
    "label",
    "pixel_x",
    "pixel_y",
    "world_x_cm",
    "world_y_cm",
)


def read_image(path: Path) -> np.ndarray | None:
    """Read an image without passing a Unicode path to OpenCV on Windows."""
    try:
        encoded = np.frombuffer(Path(path).read_bytes(), dtype=np.uint8)
    except OSError:
        return None
    return cv2.imdecode(encoded, cv2.IMREAD_COLOR)


def write_image(path: Path, image: np.ndarray) -> bool:
    """Write an image without passing a Unicode path to OpenCV on Windows."""
    path = Path(path)
    encoded_ok, encoded = cv2.imencode(path.suffix, image)
    if not encoded_ok:
        return False
    path.write_bytes(encoded.tobytes())
    return True


def _write_json(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    temporary.replace(path)


def _sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with Path(path).open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _ensure_writable(path: Path, overwrite: bool) -> None:
    if path.exists() and not overwrite:
        raise FileExistsError(
            f"File da ton tai: {path}. Dung --overwrite neu muon ghi de."
        )


def capture_frame_with_metadata(
    source: str, warmup_frames: int = 15
) -> Tuple[np.ndarray, dict]:
    """Read one fixed frame and retain enough provenance to reproduce it."""
    capture = cv2.VideoCapture(source)
    if hasattr(cv2, "CAP_PROP_OPEN_TIMEOUT_MSEC"):
        capture.set(cv2.CAP_PROP_OPEN_TIMEOUT_MSEC, 8000)
    if hasattr(cv2, "CAP_PROP_READ_TIMEOUT_MSEC"):
        capture.set(cv2.CAP_PROP_READ_TIMEOUT_MSEC, 8000)
    try:
        if not capture.isOpened():
            raise RuntimeError(f"Khong mo duoc stream: {source}")
        latest = None
        for _ in range(max(1, int(warmup_frames))):
            ok, frame = capture.read()
            if ok and frame is not None:
                latest = frame
        if latest is None:
            raise RuntimeError(f"Khong doc duoc frame: {source}")
        metadata = {
            "capture_position_frame": int(round(capture.get(cv2.CAP_PROP_POS_FRAMES))),
            "capture_position_ms": round(float(capture.get(cv2.CAP_PROP_POS_MSEC)), 3),
            "source_fps": round(float(capture.get(cv2.CAP_PROP_FPS)), 6),
        }
        return latest, metadata
    finally:
        capture.release()


def capture_frame(source: str, warmup_frames: int = 15) -> np.ndarray:
    """Backward-compatible frame-only wrapper."""
    return capture_frame_with_metadata(source, warmup_frames)[0]


def _parse_labels(value: str) -> List[str]:
    labels = [item.strip() for item in value.split(",") if item.strip()]
    if len(labels) < 4:
        raise ValueError("Moi camera can it nhat 4 nhan diem.")
    if len(set(labels)) != len(labels):
        raise ValueError("Nhan diem trong mot camera phai duy nhat.")
    return labels


def select_labeled_points(
    window_name: str,
    image: np.ndarray,
    labels: Sequence[str],
) -> List[Tuple[int, int]]:
    """Collect one pixel point per label with undo/reset controls."""
    points: List[Tuple[int, int]] = []

    def on_mouse(event, x, y, _flags, _userdata):
        if event == cv2.EVENT_LBUTTONDOWN and len(points) < len(labels):
            points.append((int(x), int(y)))
        elif event == cv2.EVENT_RBUTTONDOWN and points:
            points.pop()

    cv2.namedWindow(window_name, cv2.WINDOW_NORMAL)
    cv2.setMouseCallback(window_name, on_mouse)
    while True:
        preview = image.copy()
        current = labels[len(points)] if len(points) < len(labels) else "DONE"
        text1 = f"Click point: {current}   ({len(points)}/{len(labels)})"
        text2 = "Left: add | Right: undo | R: reset | Enter: confirm | Q/Esc: cancel"
        cv2.putText(preview, text1, (12, 28), cv2.FONT_HERSHEY_SIMPLEX, 0.68, (0, 0, 0), 4, cv2.LINE_AA)
        cv2.putText(preview, text1, (12, 28), cv2.FONT_HERSHEY_SIMPLEX, 0.68, (0, 255, 255), 2, cv2.LINE_AA)
        cv2.putText(preview, text2, (12, 57), cv2.FONT_HERSHEY_SIMPLEX, 0.52, (0, 0, 0), 3, cv2.LINE_AA)
        cv2.putText(preview, text2, (12, 57), cv2.FONT_HERSHEY_SIMPLEX, 0.52, (230, 230, 230), 1, cv2.LINE_AA)
        for index, point in enumerate(points):
            cv2.circle(preview, point, 7, (0, 255, 255), -1)
            cv2.circle(preview, point, 10, (0, 0, 0), 2)
            cv2.putText(
                preview,
                labels[index],
                (point[0] + 10, point[1] - 8),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.65,
                (0, 255, 255),
                2,
            )
        cv2.imshow(window_name, preview)
        key = cv2.waitKey(20) & 0xFF
        if key in (27, ord("q")):
            raise KeyboardInterrupt
        if key == ord("r"):
            points.clear()
        if key in (10, 13) and len(points) == len(labels):
            return points


def draw_labeled_points(
    image: np.ndarray,
    labels: Sequence[str],
    points: Sequence[Tuple[int, int]],
) -> np.ndarray:
    output = image.copy()
    for label, point in zip(labels, points):
        cv2.circle(output, point, 8, (0, 255, 255), -1)
        cv2.circle(output, point, 12, (0, 0, 0), 2)
        cv2.putText(
            output,
            label,
            (point[0] + 12, point[1] - 8),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.72,
            (0, 255, 255),
            2,
        )
    return output


def _load_manifest(workspace: Path) -> dict:
    path = workspace / MANIFEST_NAME
    if not path.is_file():
        raise FileNotFoundError(
            f"Thieu {path}. Hay chay lenh capture truoc."
        )
    return json.loads(path.read_text(encoding="utf-8"))


def capture_command(args: argparse.Namespace) -> None:
    workspace = args.workspace.resolve()
    workspace.mkdir(parents=True, exist_ok=True)
    manifest_path = workspace / MANIFEST_NAME
    _ensure_writable(manifest_path, args.overwrite)
    payload = {
        "schema_version": 1,
        "captured_at": datetime.now().astimezone().isoformat(),
        "cameras": {},
    }
    for camera_id, source in (("cam1", args.cam1_url), ("cam2", args.cam2_url)):
        frame = capture_frame(source, args.warmup_frames)
        image_path = workspace / f"capture_{camera_id}.png"
        _ensure_writable(image_path, args.overwrite)
        if not write_image(image_path, frame):
            raise RuntimeError(f"Khong ghi duoc anh: {image_path}")
        payload["cameras"][camera_id] = {
            "source": source,
            "image": image_path.name,
            "width": int(frame.shape[1]),
            "height": int(frame.shape[0]),
        }
        print(f"Da chup {camera_id}: {image_path}")
    _write_json(manifest_path, payload)
    print(f"Da ghi manifest: {manifest_path}")


def mark_command(args: argparse.Namespace) -> None:
    workspace = args.workspace.resolve()
    manifest = _load_manifest(workspace)
    points_path = workspace / POINTS_NAME
    _ensure_writable(points_path, args.overwrite)
    labels_by_camera = {
        "cam1": _parse_labels(args.cam1_labels),
        "cam2": _parse_labels(args.cam2_labels),
    }
    rows = []
    try:
        for camera_id in CAMERA_IDS:
            image_path = workspace / manifest["cameras"][camera_id]["image"]
            image = read_image(image_path)
            if image is None:
                raise FileNotFoundError(f"Khong doc duoc anh: {image_path}")
            labels = labels_by_camera[camera_id]
            points = select_labeled_points(
                f"Shared-map calibration - {camera_id}", image, labels
            )
            annotated = draw_labeled_points(image, labels, points)
            annotated_path = workspace / f"marked_{camera_id}.png"
            _ensure_writable(annotated_path, args.overwrite)
            if not write_image(annotated_path, annotated):
                raise RuntimeError(f"Khong ghi duoc anh: {annotated_path}")
            for label, (pixel_x, pixel_y) in zip(labels, points):
                rows.append({
                    "camera": camera_id,
                    "label": label,
                    "pixel_x": pixel_x,
                    "pixel_y": pixel_y,
                    "world_x_cm": "",
                    "world_y_cm": "",
                })
            print(f"Da danh dau {camera_id}: {annotated_path}")
    finally:
        cv2.destroyAllWindows()

    with points_path.open("w", newline="", encoding="utf-8-sig") as output:
        writer = csv.DictWriter(output, fieldnames=CSV_FIELDS)
        writer.writeheader()
        writer.writerows(rows)
    print(f"Da tao file do: {points_path}")
    print("Hay dien world_x_cm va world_y_cm, sau do chay lenh build.")


def load_measurements(path: Path) -> Dict[str, List[dict]]:
    grouped: Dict[str, List[dict]] = {camera_id: [] for camera_id in CAMERA_IDS}
    with path.open("r", newline="", encoding="utf-8-sig") as source:
        reader = csv.DictReader(source)
        missing_columns = set(CSV_FIELDS) - set(reader.fieldnames or ())
        if missing_columns:
            raise ValueError(f"CSV thieu cot: {sorted(missing_columns)}")
        for line_number, row in enumerate(reader, start=2):
            camera_id = str(row["camera"]).strip()
            if camera_id not in grouped:
                raise ValueError(f"Dong {line_number}: camera khong hop le")
            try:
                grouped[camera_id].append({
                    "camera": camera_id,
                    "label": str(row["label"]).strip(),
                    "pixel": (float(row["pixel_x"]), float(row["pixel_y"])),
                    "world": (
                        float(row["world_x_cm"]),
                        float(row["world_y_cm"]),
                    ),
                })
            except (TypeError, ValueError) as exc:
                raise ValueError(
                    f"Dong {line_number}: hay dien day du toa do pixel/world"
                ) from exc
    for camera_id, rows in grouped.items():
        if len(rows) < 4:
            raise ValueError(f"{camera_id} can it nhat 4 diem, hien co {len(rows)}")
        labels = [row["label"] for row in rows]
        if len(labels) != len(set(labels)):
            raise ValueError(f"{camera_id} co label trung nhau")
    return grouped


def _load_pixel_pair(item: dict, index: int, role: str) -> dict:
    label = str(item.get("label", f"{role}{index}")).strip()
    try:
        cam1 = np.asarray(item["cam1"], dtype=np.float64).reshape(2)
        cam2 = np.asarray(item["cam2"], dtype=np.float64).reshape(2)
    except (KeyError, TypeError, ValueError) as exc:
        raise ValueError(
            f"Cap diem {label} phai co cam1/cam2=[x,y]"
        ) from exc
    if not np.isfinite(cam1).all() or not np.isfinite(cam2).all():
        raise ValueError(f"Cap diem {label} co toa do khong hop le")
    return {"label": label, "role": role, "cam1": cam1, "cam2": cam2}


def load_paired_ground_points(path: Path) -> Tuple[List[dict], List[dict], dict]:
    """Load distributed fitting points and disjoint held-out validation points."""
    payload = json.loads(path.read_text(encoding="utf-8"))
    fit = [
        _load_pixel_pair(item, index, "fit")
        for index, item in enumerate(payload.get("fit_pairs", []), start=1)
    ]
    validation = [
        _load_pixel_pair(item, index, "validation")
        for index, item in enumerate(payload.get("validation_pairs", []), start=1)
    ]
    line_mode = payload.get("mode") == "rectangle_line_v1"
    if line_mode and (len(fit) != 8 or validation):
        raise ValueError("Rectangle-line can dung 8 cap A-D,V1-V4; V la diem fit, khong phai validation")
    if not line_mode and len(fit) < 12:
        raise ValueError("Can A-D va it nhat 8 cap P de fit calibration (tong >= 12)")
    if not line_mode and len(validation) < 6:
        raise ValueError("Can it nhat 6 cap V doc lap de kiem chung trai/giua/phai")
    fit_labels = {pair["label"] for pair in fit}
    validation_labels = {pair["label"] for pair in validation}
    if len(fit_labels) != len(fit) or len(validation_labels) != len(validation):
        raise ValueError("Nhan cap diem calibration bi trung")
    if fit_labels & validation_labels:
        raise ValueError("Diem fit va diem kiem chung phai tach biet")
    if not {"A", "B", "C", "D"}.issubset(fit_labels):
        raise ValueError("Fit pairs phai chua du A, B, C, D")
    if line_mode and fit_labels != {"A", "B", "C", "D", "V1", "V2", "V3", "V4"}:
        raise ValueError("Nhan rectangle-line phai la A,B,C,D,V1,V2,V3,V4")
    return fit, validation, payload


def _pixel_normalizer(image_size: Tuple[int, int], target_width: float = 1280.0) -> np.ndarray:
    width, height = (float(image_size[0]), float(image_size[1]))
    if width <= 0 or height <= 0:
        raise ValueError("Kich thuoc anh calibration khong hop le")
    scale = float(target_width) / width
    return np.asarray(((scale, 0.0, 0.0), (0.0, scale, 0.0), (0.0, 0.0, 1.0)))


def _project(points: np.ndarray, homography: np.ndarray) -> np.ndarray:
    return cv2.perspectiveTransform(
        np.asarray(points, dtype=np.float32).reshape(-1, 1, 2),
        np.asarray(homography, dtype=np.float64),
    ).reshape(-1, 2).astype(np.float64)


def _diagnose_world_mapping(measurements: Sequence[dict], homography: np.ndarray) -> dict:
    pixels = np.asarray([row["pixel"] for row in measurements], dtype=np.float64)
    expected = np.asarray([row["world"] for row in measurements], dtype=np.float64)
    projected = _project(pixels, homography)
    errors = np.linalg.norm(projected - expected, axis=1)
    return {
        "point_count": len(measurements),
        "inlier_count": len(measurements),
        "rms_error_cm": float(np.sqrt(np.mean(np.square(errors)))),
        "max_error_cm": float(errors.max()),
        "points": [
            {
                "label": row["label"],
                "pixel": [round(float(v), 3) for v in row["pixel"]],
                "world_cm": [round(float(v), 3) for v in row["world"]],
                "projected_world_cm": [round(float(v), 3) for v in point],
                "error_cm": round(float(error), 3),
                "inlier": True,
            }
            for row, point, error in zip(measurements, projected, errors)
        ],
    }


def compute_distributed_shared_homographies(
    measurements: Dict[str, Sequence[dict]],
    fit_pairs: Sequence[dict],
    image_sizes: Dict[str, Tuple[int, int]],
    ransac_threshold_px: float = 3.0,
    min_inliers: int = 8,
    min_inlier_ratio: float = 0.75,
    *,
    use_all_pairs: bool = False,
) -> Tuple[Dict[str, np.ndarray], Dict[str, dict], dict]:
    """Fit cam2->cam1 from distributed pairs, then attach the AB/AD cm frame."""
    if len(fit_pairs) < 4:
        raise ValueError("Can it nhat 4 cap diem de tinh phep chieu hai camera")
    normalizers = {
        camera_id: _pixel_normalizer(image_sizes[camera_id])
        for camera_id in CAMERA_IDS
    }
    cam1 = np.asarray([pair["cam1"] for pair in fit_pairs], dtype=np.float64)
    cam2 = np.asarray([pair["cam2"] for pair in fit_pairs], dtype=np.float64)
    cam1_norm = _project(cam1, normalizers["cam1"])
    cam2_norm = _project(cam2, normalizers["cam2"])
    relative_norm, mask = cv2.findHomography(
        cam2_norm.astype(np.float32),
        cam1_norm.astype(np.float32),
        method=0 if use_all_pairs else cv2.RANSAC,
        ransacReprojThreshold=float(ransac_threshold_px),
        maxIters=5000,
        confidence=0.999,
    )
    if relative_norm is None or mask is None:
        raise ValueError("Khong uoc luong duoc quan he cam2 -> cam1 tu cac cap diem")
    inliers = np.ones(len(fit_pairs), dtype=bool) if use_all_pairs else mask.reshape(-1).astype(bool)
    required = max(int(min_inliers), int(np.ceil(len(fit_pairs) * min_inlier_ratio)))
    if int(inliers.sum()) < required:
        rejected = [pair["label"] for pair, accepted in zip(fit_pairs, inliers) if not accepted]
        raise ValueError(
            f"distributed_fit_insufficient: chi {int(inliers.sum())}/{len(fit_pairs)} "
            f"cap diem nhat quan, can >= {required}; bi loai={rejected}"
        )
    relative_norm, _ = cv2.findHomography(
        cam2_norm[inliers].astype(np.float32),
        cam1_norm[inliers].astype(np.float32),
        method=0,
    )
    if relative_norm is None or abs(float(np.linalg.det(relative_norm))) < 1e-12:
        raise ValueError("Phep chieu cam2 -> cam1 bi suy bien")
    relative = (
        np.linalg.inv(normalizers["cam1"])
        @ relative_norm
        @ normalizers["cam2"]
    )
    relative /= relative[2, 2]

    world_by_label = {
        row["label"]: np.asarray(row["world"], dtype=np.float64)
        for row in measurements["cam1"]
    }
    fit_by_label = {pair["label"]: pair for pair in fit_pairs}
    metric_pixels = []
    metric_world = []
    for label in ("A", "B", "C", "D"):
        if label not in fit_by_label or label not in world_by_label:
            raise ValueError(f"Thieu diem chuan {label} de gan he toa do cm")
        pair = fit_by_label[label]
        metric_pixels.append(pair["cam1"])
        metric_pixels.append(_project(np.asarray([pair["cam2"]]), relative)[0])
        metric_world.extend((world_by_label[label], world_by_label[label]))
    metric, _ = cv2.findHomography(
        np.asarray(metric_pixels, dtype=np.float32),
        np.asarray(metric_world, dtype=np.float32),
        method=0,
    )
    if metric is None or abs(float(np.linalg.det(metric))) < 1e-12:
        raise ValueError("Khong gan duoc he toa do centimet tu AB/AD")
    transforms = {
        "cam1": np.asarray(metric, dtype=np.float64),
        "cam2": np.asarray(metric @ relative, dtype=np.float64),
    }
    for value in transforms.values():
        value /= value[2, 2]

    inverse_relative = np.linalg.inv(relative)
    forward_errors = np.linalg.norm(
        _project(cam2, relative) - cam1, axis=1
    ) * (1280.0 / image_sizes["cam1"][0])
    reverse_errors = np.linalg.norm(
        _project(cam1, inverse_relative) - cam2, axis=1
    ) * (1280.0 / image_sizes["cam2"][0])
    symmetric_errors = (forward_errors + reverse_errors) * 0.5
    relative_diagnostic = {
        "method": "all_eight_pairs_least_squares" if use_all_pairs else "distributed_cam2_to_cam1_ransac",
        "point_count": len(fit_pairs),
        "inlier_count": int(inliers.sum()),
        "inlier_ratio": round(float(inliers.mean()), 6),
        "ransac_threshold_px_at_1280": float(ransac_threshold_px),
        "rms_symmetric_pixel_error": round(
            float(np.sqrt(np.mean(np.square(symmetric_errors[inliers])))), 3
        ),
        "max_symmetric_pixel_error": round(float(symmetric_errors[inliers].max()), 3),
        "points": [
            {
                "label": pair["label"],
                "inlier": bool(accepted),
                "symmetric_pixel_error": round(float(error), 3),
            }
            for pair, accepted, error in zip(fit_pairs, inliers, symmetric_errors)
        ],
        "cam2_to_cam1": relative.tolist(),
    }
    diagnostics = {
        camera_id: _diagnose_world_mapping(measurements[camera_id], transforms[camera_id])
        for camera_id in CAMERA_IDS
    }
    return transforms, diagnostics, relative_diagnostic


def compute_homography(
    measurements: Sequence[dict],
    ransac_threshold_cm: float = 2.0,
) -> Tuple[np.ndarray, dict]:
    image_points = np.asarray([row["pixel"] for row in measurements], dtype=np.float32)
    world_points = np.asarray([row["world"] for row in measurements], dtype=np.float32)
    if np.linalg.matrix_rank(image_points - image_points.mean(axis=0)) < 2:
        raise ValueError("Cac diem pixel gan thang hang; can trai rong thanh tu giac.")
    if np.linalg.matrix_rank(world_points - world_points.mean(axis=0)) < 2:
        raise ValueError("Cac diem world gan thang hang; can toa do 2 chieu.")
    method = cv2.RANSAC if len(measurements) > 4 else 0
    homography, inlier_mask = cv2.findHomography(
        image_points,
        world_points,
        method=method,
        ransacReprojThreshold=float(ransac_threshold_cm),
    )
    if homography is None or abs(float(np.linalg.det(homography))) < 1e-12:
        raise RuntimeError("Khong tinh duoc homography hop le")
    projected = cv2.perspectiveTransform(
        image_points.reshape(-1, 1, 2), homography
    ).reshape(-1, 2)
    errors = np.linalg.norm(projected - world_points, axis=1)
    inliers = (
        inlier_mask.reshape(-1).astype(bool)
        if inlier_mask is not None
        else np.ones(len(measurements), dtype=bool)
    )
    diagnostics = {
        "point_count": len(measurements),
        "inlier_count": int(inliers.sum()),
        "rms_error_cm": float(np.sqrt(np.mean(np.square(errors)))),
        "max_error_cm": float(errors.max()),
        "points": [
            {
                "label": row["label"],
                "pixel": [round(row["pixel"][0], 3), round(row["pixel"][1], 3)],
                "world_cm": [round(row["world"][0], 3), round(row["world"][1], 3)],
                "projected_world_cm": [round(float(value), 3) for value in point],
                "error_cm": round(float(error), 3),
                "inlier": bool(inlier),
            }
            for row, point, error, inlier in zip(
                measurements, projected, errors, inliers
            )
        ],
    }
    return homography.astype(np.float64), diagnostics


def transform_polygon(points: Iterable[Sequence[float]], homography: np.ndarray) -> np.ndarray:
    polygon = np.asarray(list(points), dtype=np.float32)
    if polygon.ndim != 2 or polygon.shape[0] < 3 or polygon.shape[1] != 2:
        raise ValueError("Coverage polygon phai co it nhat 3 diem [x, y]")
    transformed = cv2.perspectiveTransform(
        polygon.reshape(-1, 1, 2), homography.astype(np.float64)
    ).reshape(-1, 2)
    return transformed.astype(np.float32)


def load_cross_camera_validation(path: Path) -> List[dict]:
    """Load paired pixels that were deliberately excluded from homography fitting."""
    payload = json.loads(path.read_text(encoding="utf-8"))
    pairs = payload.get("pairs", [])
    result = []
    for index, pair in enumerate(pairs, start=1):
        label = str(pair.get("label", f"V{index}"))
        try:
            cam1 = np.asarray(pair["cam1"], dtype=np.float64).reshape(2)
            cam2 = np.asarray(pair["cam2"], dtype=np.float64).reshape(2)
        except (KeyError, TypeError, ValueError) as exc:
            raise ValueError(f"Validation {label} phai co cam1/cam2=[x,y]") from exc
        if not np.isfinite(cam1).all() or not np.isfinite(cam2).all():
            raise ValueError(f"Validation {label} co toa do khong hop le")
        result.append({"label": label, "cam1": cam1, "cam2": cam2})
    if len(result) < 3:
        raise ValueError("Can it nhat 3 cap diem kiem chung doc lap V1-V3")
    return result


def cross_camera_validation_diagnostics(
    pairs: Sequence[dict],
    transforms: Dict[str, np.ndarray],
    image_sizes: Dict[str, Tuple[int, int]] | None = None,
) -> dict:
    """Measure how far the same unused ground points land in shared-world space."""
    errors = []
    pixel_errors = []
    details = []
    relative_2_to_1 = np.linalg.inv(transforms["cam1"]) @ transforms["cam2"]
    relative_1_to_2 = np.linalg.inv(transforms["cam2"]) @ transforms["cam1"]
    cam1_x = np.asarray([float(pair["cam1"][0]) for pair in pairs])
    x_min, x_max = float(cam1_x.min()), float(cam1_x.max())
    x_span = max(x_max - x_min, 1.0)
    for pair in pairs:
        projected = {}
        for camera_id in CAMERA_IDS:
            point = np.asarray(pair[camera_id], dtype=np.float32).reshape(1, 1, 2)
            projected[camera_id] = cv2.perspectiveTransform(
                point, transforms[camera_id].astype(np.float64)
            ).reshape(2)
        error = float(np.linalg.norm(projected["cam1"] - projected["cam2"]))
        predicted_cam1 = _project(np.asarray([pair["cam2"]]), relative_2_to_1)[0]
        predicted_cam2 = _project(np.asarray([pair["cam1"]]), relative_1_to_2)[0]
        scale1 = 1280.0 / float((image_sizes or {}).get("cam1", (1280, 1))[0])
        scale2 = 1280.0 / float((image_sizes or {}).get("cam2", (1280, 1))[0])
        pixel_error = 0.5 * (
            float(np.linalg.norm(predicted_cam1 - pair["cam1"])) * scale1
            + float(np.linalg.norm(predicted_cam2 - pair["cam2"])) * scale2
        )
        relative_x = (float(pair["cam1"][0]) - x_min) / x_span
        zone = "left" if relative_x < 1.0 / 3.0 else "right" if relative_x > 2.0 / 3.0 else "center"
        errors.append(error)
        pixel_errors.append(pixel_error)
        details.append({
            "label": pair["label"],
            "zone": zone,
            "cam1_pixel": [round(float(value), 3) for value in pair["cam1"]],
            "cam2_pixel": [round(float(value), 3) for value in pair["cam2"]],
            "cam1_world_cm": [round(float(value), 3) for value in projected["cam1"]],
            "cam2_world_cm": [round(float(value), 3) for value in projected["cam2"]],
            "cross_camera_error_cm": round(error, 3),
            "symmetric_pixel_error": round(pixel_error, 3),
        })
    values = np.asarray(errors, dtype=np.float64)
    pixels = np.asarray(pixel_errors, dtype=np.float64)
    zones = {}
    total_y_span = {
        camera_id: max(
            float(max(pair[camera_id][1] for pair in pairs) - min(pair[camera_id][1] for pair in pairs)),
            1.0,
        )
        for camera_id in CAMERA_IDS
    }
    for zone in ("left", "center", "right"):
        selected = [item for item in details if item["zone"] == zone]
        zone_cm = [item["cross_camera_error_cm"] for item in selected]
        zone_px = [item["symmetric_pixel_error"] for item in selected]
        zones[zone] = {
            "point_count": len(selected),
            "max_error_cm": round(float(max(zone_cm)), 3) if zone_cm else None,
            "max_pixel_error": round(float(max(zone_px)), 3) if zone_px else None,
            "near_far_spread_ratio": {
                camera_id: round(
                    (
                        max(item[f"{camera_id}_pixel"][1] for item in selected)
                        - min(item[f"{camera_id}_pixel"][1] for item in selected)
                    ) / total_y_span[camera_id],
                    6,
                ) if len(selected) >= 2 else 0.0
                for camera_id in CAMERA_IDS
            },
        }
    return {
        "point_count": len(details),
        "mean_error_cm": round(float(values.mean()), 3),
        "p95_error_cm": round(float(np.percentile(values, 95)), 3),
        "max_error_cm": round(float(values.max()), 3),
        "p95_symmetric_pixel_error": round(float(np.percentile(pixels, 95)), 3),
        "max_symmetric_pixel_error": round(float(pixels.max()), 3),
        "zones": zones,
        "points": details,
    }


def cross_camera_validation_spread(
    pairs: Sequence[dict], images: Dict[str, np.ndarray]
) -> dict:
    """Report whether validation points cover area, not merely one image row."""
    ratios = {}
    for camera_id in CAMERA_IDS:
        points = np.asarray([pair[camera_id] for pair in pairs], dtype=np.float32)
        hull_area = abs(float(cv2.contourArea(cv2.convexHull(points))))
        image = images[camera_id]
        ratios[camera_id] = round(
            hull_area / max(float(image.shape[0] * image.shape[1]), 1.0), 6
        )
    return {
        "hull_area_ratio_by_camera": ratios,
        "min_hull_area_ratio": min(ratios.values()),
    }


def distributed_fit_coverage(
    fit_pairs: Sequence[dict],
    validation_pairs: Sequence[dict],
    inlier_labels: Sequence[str],
) -> dict:
    """Measure fitted spatial support against all user-confirmed common ground."""
    accepted = set(inlier_labels)
    ratios = {}
    for camera_id in CAMERA_IDS:
        support = np.asarray(
            [pair[camera_id] for pair in fit_pairs if pair["label"] in accepted],
            dtype=np.float32,
        )
        declared = np.asarray(
            [pair[camera_id] for pair in [*fit_pairs, *validation_pairs]],
            dtype=np.float32,
        )
        if len(support) < 3 or len(declared) < 3:
            ratios[camera_id] = 0.0
            continue
        support_area = abs(float(cv2.contourArea(cv2.convexHull(support))))
        declared_area = abs(float(cv2.contourArea(cv2.convexHull(declared))))
        ratios[camera_id] = round(min(1.0, support_area / max(declared_area, 1e-6)), 6)
    return {
        "definition": "inlier_fit_hull / all_confirmed_common_ground_hull",
        "ratio_by_camera": ratios,
        "minimum_ratio": min(ratios.values()),
    }


def calibration_extrapolation_ratio(
    measurements: Sequence[dict], coverage_pixels: np.ndarray
) -> float:
    """Return active-ROI area divided by the measured four-point area."""
    calibration_polygon = np.asarray(
        [row["pixel"] for row in measurements], dtype=np.float32
    )
    calibration_area = abs(float(cv2.contourArea(cv2.convexHull(calibration_polygon))))
    coverage_area = abs(float(cv2.contourArea(np.asarray(coverage_pixels, np.float32))))
    return coverage_area / max(calibration_area, 1e-6)


def load_coverage_pixels(path: Path | None, image_size: Tuple[int, int]) -> np.ndarray:
    width, height = image_size
    if path is None:
        return np.asarray(
            [[0, 0], [width - 1, 0], [width - 1, height - 1], [0, height - 1]],
            dtype=np.float32,
        )
    data = json.loads(path.read_text(encoding="utf-8"))
    raw = data.get("polygon", [])
    points = [
        [float(item["x"]), float(item["y"])]
        if isinstance(item, dict)
        else [float(item[0]), float(item[1])]
        for item in raw
    ]
    polygon = np.asarray(points, dtype=np.float32)
    if polygon.ndim != 2 or polygon.shape[0] < 3 or polygon.shape[1] != 2:
        raise ValueError(f"Coverage polygon khong hop le: {path}")
    source_size = data.get("image_size")
    if source_size is None and data.get("imageWidth") and data.get("imageHeight"):
        source_size = [data["imageWidth"], data["imageHeight"]]
    if source_size is not None:
        source_width, source_height = float(source_size[0]), float(source_size[1])
        if source_width <= 0 or source_height <= 0:
            raise ValueError(f"Coverage image_size khong hop le: {path}")
        source_aspect = source_width / source_height
        target_aspect = float(width) / float(height)
        if abs(source_aspect - target_aspect) > 0.005:
            raise ValueError(
                f"Coverage {path} co ti le {source_width:g}x{source_height:g}, "
                f"khac anh calibration {width}x{height}; khong tu scale crop/aspect khac"
            )
        polygon[:, 0] *= float(width) / source_width
        polygon[:, 1] *= float(height) / source_height
    return polygon


def full_frame_polygon(image_size: Tuple[int, int]) -> np.ndarray:
    """Return the complete camera frame, independent from the active ROI."""
    width, height = image_size
    return np.asarray(
        [[0, 0], [width - 1, 0], [width - 1, height - 1], [0, height - 1]],
        dtype=np.float32,
    )


def load_parking_slots_world(
    path: Path | None,
    image_size: Tuple[int, int],
    homography: np.ndarray,
) -> List[dict]:
    """Load parking-space polygons and transform them into shared cm space."""
    if path is None:
        return []
    data = json.loads(path.read_text(encoding="utf-8"))
    width, height = image_size
    reference_width = max(1.0, float(data.get("imageWidth", width)))
    reference_height = max(1.0, float(data.get("imageHeight", height)))
    scale_x = width / reference_width
    scale_y = height / reference_height
    slots = []
    for index, item in enumerate(data.get("slots", []), start=1):
        raw = item.get("polygon") or item.get("points") or []
        try:
            pixels = [
                [float(point["x"]) * scale_x, float(point["y"]) * scale_y]
                if isinstance(point, dict)
                else [float(point[0]) * scale_x, float(point[1]) * scale_y]
                for point in raw
            ]
        except (KeyError, TypeError, ValueError):
            continue
        if len(pixels) < 3:
            continue
        slots.append({
            "id": str(item.get("id", f"slot_{index}")),
            "polygon": transform_polygon(pixels, homography),
        })
    return slots


def convex_intersection(first: np.ndarray, second: np.ndarray) -> Tuple[float, np.ndarray]:
    first_hull = cv2.convexHull(np.asarray(first, dtype=np.float32))
    second_hull = cv2.convexHull(np.asarray(second, dtype=np.float32))
    area, intersection = cv2.intersectConvexConvex(first_hull, second_hull)
    if intersection is None or float(area) <= 1e-6:
        return 0.0, np.empty((0, 2), dtype=np.float32)
    return float(area), intersection.reshape(-1, 2).astype(np.float32)


def _world_to_canvas(
    point: Sequence[float],
    bounds: Tuple[float, float, float, float],
    size: Tuple[int, int],
    padding: int,
) -> Tuple[int, int]:
    min_x, min_y, max_x, max_y = bounds
    width, height = size
    scale_x = (width - 2 * padding) / max(max_x - min_x, 1e-6)
    scale_y = (height - 2 * padding) / max(max_y - min_y, 1e-6)
    scale = min(scale_x, scale_y)
    x = padding + (float(point[0]) - min_x) * scale
    y = height - padding - (float(point[1]) - min_y) * scale
    return int(round(x)), int(round(y))


def _preview_bounds(polygons: Iterable[np.ndarray]) -> Tuple[float, float, float, float]:
    valid = [
        np.asarray(polygon, dtype=np.float32).reshape(-1, 2)
        for polygon in polygons
        if polygon is not None and np.asarray(polygon).size >= 6
    ]
    if not valid:
        raise ValueError("Khong co polygon world hop le de ve preview")
    all_points = np.vstack(valid)
    if not np.isfinite(all_points).all():
        raise ValueError("Full-view projection co toa do vo han; kiem tra diem calibration")
    min_x, min_y = all_points.min(axis=0)
    max_x, max_y = all_points.max(axis=0)
    margin_x = max(5.0, float(max_x - min_x) * 0.08)
    margin_y = max(5.0, float(max_y - min_y) * 0.08)
    return (
        float(min_x - margin_x),
        float(min_y - margin_y),
        float(max_x + margin_x),
        float(max_y + margin_y),
    )


def _world_to_canvas_matrix(
    bounds: Tuple[float, float, float, float],
    size: Tuple[int, int],
    padding: int,
) -> np.ndarray:
    min_x, min_y, max_x, max_y = bounds
    width, height = size
    scale_x = (width - 2 * padding) / max(max_x - min_x, 1e-6)
    scale_y = (height - 2 * padding) / max(max_y - min_y, 1e-6)
    scale = min(scale_x, scale_y)
    return np.asarray([
        [scale, 0.0, padding - scale * min_x],
        [0.0, -scale, height - padding + scale * min_y],
        [0.0, 0.0, 1.0],
    ], dtype=np.float64)


def draw_full_view_preview(
    images: Dict[str, np.ndarray],
    transforms: Dict[str, np.ndarray],
    full_coverages: Dict[str, np.ndarray],
    full_overlap: np.ndarray,
    diagnostics: Dict[str, dict],
    output_path: Path,
    bounds: Tuple[float, float, float, float] | None = None,
) -> dict:
    """Warp and blend both complete camera frames to validate H1/H2 visually."""
    canvas_size = (1400, 900)
    padding = 60
    bounds = bounds or _preview_bounds([*full_coverages.values(), full_overlap])
    world_to_canvas = _world_to_canvas_matrix(bounds, canvas_size, padding)
    warped_images = {}
    warped_masks = {}
    for camera_id in CAMERA_IDS:
        image = images[camera_id]
        image_to_canvas = world_to_canvas @ transforms[camera_id]
        warped_images[camera_id] = cv2.warpPerspective(
            image,
            image_to_canvas,
            canvas_size,
            flags=cv2.INTER_LINEAR,
            borderMode=cv2.BORDER_CONSTANT,
        )
        source_mask = np.full(image.shape[:2], 255, dtype=np.uint8)
        warped_masks[camera_id] = cv2.warpPerspective(
            source_mask,
            image_to_canvas,
            canvas_size,
            flags=cv2.INTER_NEAREST,
            borderMode=cv2.BORDER_CONSTANT,
        )

    canvas = np.full((canvas_size[1], canvas_size[0], 3), 245, dtype=np.uint8)
    first_valid = warped_masks["cam1"] > 0
    second_valid = warped_masks["cam2"] > 0
    only_first = first_valid & ~second_valid
    only_second = second_valid & ~first_valid
    both = first_valid & second_valid
    canvas[only_first] = warped_images["cam1"][only_first]
    canvas[only_second] = warped_images["cam2"][only_second]
    blend = cv2.addWeighted(
        warped_images["cam1"], 0.5, warped_images["cam2"], 0.5, 0
    )
    canvas[both] = blend[both]

    colors = {"cam1": (20, 20, 20), "cam2": (20, 20, 235)}
    for camera_id, polygon in full_coverages.items():
        canvas_polygon = np.asarray([
            _world_to_canvas(point, bounds, canvas_size, padding)
            for point in polygon
        ], dtype=np.int32)
        cv2.polylines(canvas, [canvas_polygon], True, colors[camera_id], 3)
    overlap_polygon = np.asarray([
        _world_to_canvas(point, bounds, canvas_size, padding)
        for point in full_overlap
    ], dtype=np.int32)
    cv2.polylines(canvas, [overlap_polygon], True, (210, 30, 210), 3)

    for camera_id, diagnostic in diagnostics.items():
        for point in diagnostic["points"]:
            canvas_point = _world_to_canvas(
                point["world_cm"], bounds, canvas_size, padding
            )
            cv2.circle(canvas, canvas_point, 6, colors[camera_id], -1)
            cv2.putText(
                canvas,
                f"{camera_id}:{point['label']}",
                (canvas_point[0] + 7, canvas_point[1] - 6),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.43,
                colors[camera_id],
                1,
            )

    cv2.rectangle(canvas, (15, 12), (890, 94), (255, 255, 255), -1)
    cv2.putText(
        canvas,
        "DIAGNOSTIC FULL FRAME - not the runtime tracking area",
        (30, 40),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.68,
        (30, 30, 30),
        2,
    )
    cv2.putText(
        canvas,
        "Walls/table may warp: judge painted ground lines near calibration points only",
        (30, 74),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.53,
        (70, 70, 70),
        1,
    )
    output_path.parent.mkdir(parents=True, exist_ok=True)
    if not write_image(output_path, canvas):
        raise RuntimeError(f"Khong ghi duoc full-view preview: {output_path}")
    return {
        "min_x_cm": round(bounds[0], 3),
        "min_y_cm": round(bounds[1], 3),
        "max_x_cm": round(bounds[2], 3),
        "max_y_cm": round(bounds[3], 3),
    }


def draw_active_roi_preview(
    images: Dict[str, np.ndarray],
    transforms: Dict[str, np.ndarray],
    active_pixels: Dict[str, np.ndarray],
    active_coverages: Dict[str, np.ndarray],
    active_overlap: np.ndarray,
    full_coverages: Dict[str, np.ndarray],
    parking_slots: Dict[str, List[dict]],
    output_path: Path,
    bounds: Tuple[float, float, float, float],
    validation_diagnostic: dict | None = None,
    composite_mode: str = "blend",
) -> None:
    """Warp captured images clipped by active ROI, then overlay parking slots."""
    canvas_size = (1400, 900)
    padding = 60
    world_to_canvas = _world_to_canvas_matrix(bounds, canvas_size, padding)
    warped_images = {}
    warped_masks = {}
    for camera_id in CAMERA_IDS:
        image = images[camera_id]
        image_to_canvas = world_to_canvas @ transforms[camera_id]
        source_mask = np.zeros(image.shape[:2], dtype=np.uint8)
        cv2.fillPoly(
            source_mask,
            [np.rint(active_pixels[camera_id]).astype(np.int32)],
            255,
        )
        warped_images[camera_id] = cv2.warpPerspective(
            image,
            image_to_canvas,
            canvas_size,
            flags=cv2.INTER_LINEAR,
            borderMode=cv2.BORDER_CONSTANT,
        )
        warped_masks[camera_id] = cv2.warpPerspective(
            source_mask,
            image_to_canvas,
            canvas_size,
            flags=cv2.INTER_NEAREST,
            borderMode=cv2.BORDER_CONSTANT,
        )

    canvas = np.full((canvas_size[1], canvas_size[0], 3), 245, dtype=np.uint8)
    first_valid = warped_masks["cam1"] > 0
    second_valid = warped_masks["cam2"] > 0
    only_first = first_valid & ~second_valid
    only_second = second_valid & ~first_valid
    both = first_valid & second_valid
    canvas[only_first] = warped_images["cam1"][only_first]
    canvas[only_second] = warped_images["cam2"][only_second]
    if composite_mode == "checkerboard":
        yy, xx = np.indices(first_valid.shape)
        choose_first = ((xx // 48 + yy // 48) % 2) == 0
        canvas[both & choose_first] = warped_images["cam1"][both & choose_first]
        canvas[both & ~choose_first] = warped_images["cam2"][both & ~choose_first]
    else:
        blend = cv2.addWeighted(
            warped_images["cam1"], 0.5, warped_images["cam2"], 0.5, 0
        )
        canvas[both] = blend[both]

    colors = {"cam1": (20, 20, 20), "cam2": (20, 20, 235)}
    # Faint complete-frame outlines make the difference from active ROI clear.
    for camera_id, polygon in full_coverages.items():
        full_polygon = np.asarray([
            _world_to_canvas(point, bounds, canvas_size, padding)
            for point in polygon
        ], dtype=np.int32)
        cv2.polylines(canvas, [full_polygon], True, (175, 175, 175), 1)
    for camera_id, polygon in active_coverages.items():
        active_polygon = np.asarray([
            _world_to_canvas(point, bounds, canvas_size, padding)
            for point in polygon
        ], dtype=np.int32)
        cv2.polylines(canvas, [active_polygon], True, colors[camera_id], 4)
    overlap_polygon = np.asarray([
        _world_to_canvas(point, bounds, canvas_size, padding)
        for point in active_overlap
    ], dtype=np.int32)
    if len(overlap_polygon) >= 3:
        cv2.polylines(canvas, [overlap_polygon], True, (210, 30, 210), 4)

    for camera_id, slots in parking_slots.items():
        for slot in slots:
            slot_polygon = np.asarray([
                _world_to_canvas(point, bounds, canvas_size, padding)
                for point in slot["polygon"]
            ], dtype=np.int32)
            cv2.polylines(canvas, [slot_polygon], True, colors[camera_id], 2)
            center = tuple(np.rint(slot_polygon.mean(axis=0)).astype(int))
            cv2.putText(
                canvas,
                slot["id"],
                center,
                cv2.FONT_HERSHEY_SIMPLEX,
                0.34,
                colors[camera_id],
                1,
            )

    cv2.rectangle(canvas, (15, 12), (1040, 126), (255, 255, 255), -1)
    cv2.putText(
        canvas,
        f"ACTIVE ROI + PARKING SLOTS - {composite_mode}",
        (30, 40),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.68,
        (30, 30, 30),
        2,
    )
    line_fit_preview = validation_diagnostic is not None and validation_diagnostic.get("evidence_kind") == "training_fit_not_independent_validation"
    cv2.putText(
        canvas,
        ("Black=cam1 ROI | Red=cam2 ROI | Purple=fitted ground support (runtime) | Gray=full frame"
         if line_fit_preview else "Black=cam1 ROI | Red=cam2 ROI | Purple=operational overlap | Gray=full frame"),
        (30, 74),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.51,
        (70, 70, 70),
        1,
    )
    if validation_diagnostic is not None:
        for item in validation_diagnostic.get("points", []):
            first = _world_to_canvas(
                item["cam1_world_cm"], bounds, canvas_size, padding
            )
            second = _world_to_canvas(
                item["cam2_world_cm"], bounds, canvas_size, padding
            )
            cv2.arrowedLine(canvas, first, second, (0, 140, 255), 2, cv2.LINE_AA, tipLength=0.25)
            cv2.putText(
                canvas,
                f"{item['label']}:{item['cross_camera_error_cm']:.2f}cm",
                (first[0] + 5, first[1] - 5),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.38,
                (0, 90, 220),
                1,
                cv2.LINE_AA,
            )
        passed = validation_diagnostic.get("status") == "passed"
        is_fit = validation_diagnostic.get("evidence_kind") == "training_fit_not_independent_validation"
        status_text = "PASS" if passed else "DRAFT - MODEL INADEQUATE"
        if is_fit and validation_diagnostic.get("status") == "fit_ready":
            status_text = "FIT READY - REVIEW REQUIRED"
        status_color = (20, 145, 20) if passed else (0, 110, 200)
        evidence_name = "8 fitted pairs, NOT independent" if is_fit else "independent cross-camera"
        cv2.putText(
            canvas,
            (
                f"CALIBRATION {status_text} - {evidence_name} "
                f"p95={validation_diagnostic['p95_error_cm']:.3f} cm"
            ),
            (30, 108),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.56,
            status_color,
            2,
            cv2.LINE_AA,
        )
    output_path.parent.mkdir(parents=True, exist_ok=True)
    if not write_image(output_path, canvas):
        raise RuntimeError(f"Khong ghi duoc active-ROI preview: {output_path}")


def draw_map_preview(
    coverages: Dict[str, np.ndarray],
    overlap: np.ndarray,
    diagnostics: Dict[str, dict],
    output_path: Path,
) -> dict:
    all_points = np.vstack([*coverages.values(), overlap])
    min_x, min_y = all_points.min(axis=0)
    max_x, max_y = all_points.max(axis=0)
    margin_x = max(5.0, float(max_x - min_x) * 0.08)
    margin_y = max(5.0, float(max_y - min_y) * 0.08)
    bounds = (
        float(min_x - margin_x),
        float(min_y - margin_y),
        float(max_x + margin_x),
        float(max_y + margin_y),
    )
    canvas_size = (1400, 900)
    padding = 55
    canvas = np.full((canvas_size[1], canvas_size[0], 3), 248, dtype=np.uint8)

    # Ten-centimetre grid in the shared measured coordinate system.
    grid_start_x = int(np.floor(bounds[0] / 10.0) * 10)
    grid_end_x = int(np.ceil(bounds[2] / 10.0) * 10)
    grid_start_y = int(np.floor(bounds[1] / 10.0) * 10)
    grid_end_y = int(np.ceil(bounds[3] / 10.0) * 10)
    for world_x in range(grid_start_x, grid_end_x + 1, 10):
        top = _world_to_canvas((world_x, bounds[3]), bounds, canvas_size, padding)
        bottom = _world_to_canvas((world_x, bounds[1]), bounds, canvas_size, padding)
        cv2.line(canvas, top, bottom, (225, 225, 225), 1)
    for world_y in range(grid_start_y, grid_end_y + 1, 10):
        left = _world_to_canvas((bounds[0], world_y), bounds, canvas_size, padding)
        right = _world_to_canvas((bounds[2], world_y), bounds, canvas_size, padding)
        cv2.line(canvas, left, right, (225, 225, 225), 1)

    colors = {"cam1": (40, 40, 40), "cam2": (40, 40, 230)}
    overlay = canvas.copy()
    for camera_id, polygon in coverages.items():
        canvas_polygon = np.asarray([
            _world_to_canvas(point, bounds, canvas_size, padding)
            for point in polygon
        ], dtype=np.int32)
        cv2.fillPoly(overlay, [canvas_polygon], colors[camera_id])
    cv2.addWeighted(overlay, 0.14, canvas, 0.86, 0, canvas)

    overlap_polygon = np.asarray([
        _world_to_canvas(point, bounds, canvas_size, padding)
        for point in overlap
    ], dtype=np.int32)
    if len(overlap_polygon) >= 3:
        overlap_layer = canvas.copy()
        cv2.fillPoly(overlap_layer, [overlap_polygon], (180, 70, 180))
        cv2.addWeighted(overlap_layer, 0.35, canvas, 0.65, 0, canvas)

    for camera_id, polygon in coverages.items():
        canvas_polygon = np.asarray([
            _world_to_canvas(point, bounds, canvas_size, padding)
            for point in polygon
        ], dtype=np.int32)
        cv2.polylines(canvas, [canvas_polygon], True, colors[camera_id], 3)
    if len(overlap_polygon) >= 3:
        cv2.polylines(canvas, [overlap_polygon], True, (180, 30, 180), 3)

    for camera_id, diagnostic in diagnostics.items():
        for point in diagnostic["points"]:
            canvas_point = _world_to_canvas(
                point["world_cm"], bounds, canvas_size, padding
            )
            cv2.circle(canvas, canvas_point, 5, colors[camera_id], -1)
            cv2.putText(
                canvas,
                f"{camera_id}:{point['label']}",
                (canvas_point[0] + 7, canvas_point[1] - 5),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.42,
                colors[camera_id],
                1,
            )

    cv2.rectangle(canvas, (15, 12), (510, 92), (255, 255, 255), -1)
    cv2.putText(canvas, "CAM1 coverage", (30, 38), cv2.FONT_HERSHEY_SIMPLEX, 0.6, colors["cam1"], 2)
    cv2.putText(canvas, "CAM2 coverage", (190, 38), cv2.FONT_HERSHEY_SIMPLEX, 0.6, colors["cam2"], 2)
    cv2.putText(canvas, "OVERLAP", (365, 38), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (180, 30, 180), 2)
    cv2.putText(canvas, "Grid: 10 cm", (30, 72), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (90, 90, 90), 1)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    if not write_image(output_path, canvas):
        raise RuntimeError(f"Khong ghi duoc preview: {output_path}")
    return {
        "min_x_cm": round(bounds[0], 3),
        "min_y_cm": round(bounds[1], 3),
        "max_x_cm": round(bounds[2], 3),
        "max_y_cm": round(bounds[3], 3),
    }


def build_command(args: argparse.Namespace) -> None:
    workspace = args.workspace.resolve()
    manifest = _load_manifest(workspace)
    measurements = load_measurements(workspace / POINTS_NAME)
    transforms = {}
    diagnostics = {}
    coverages = {}
    coverage_pixels_by_camera = {}
    full_coverages = {}
    images = {}
    parking_slots = {}
    coverage_paths = {
        "cam1": args.coverage_cam1.resolve() if args.coverage_cam1 else None,
        "cam2": args.coverage_cam2.resolve() if args.coverage_cam2 else None,
    }
    raw_slot_paths = {
        "cam1": getattr(args, "slots_cam1", None),
        "cam2": getattr(args, "slots_cam2", None),
    }
    slot_paths = {
        camera_id: path.resolve() if path else None
        for camera_id, path in raw_slot_paths.items()
    }
    image_sizes = {}
    for camera_id in CAMERA_IDS:
        camera_manifest = manifest["cameras"][camera_id]
        image_size = (
            int(camera_manifest["width"]),
            int(camera_manifest["height"]),
        )
        image_sizes[camera_id] = image_size
        image_path = workspace / camera_manifest["image"]
        image = read_image(image_path)
        if image is None:
            raise FileNotFoundError(f"Khong doc duoc anh capture: {image_path}")
        if (image.shape[1], image.shape[0]) != image_size:
            raise ValueError(
                f"{camera_id}: manifest={image_size}, anh thuc="
                f"{image.shape[1]}x{image.shape[0]}"
            )
        images[camera_id] = image

    paired_path = workspace / PAIRED_POINTS_NAME
    relative_diagnostic = None
    fit_pairs = []
    validation_pairs = []
    paired_payload = None
    fit_coverage = None
    blocking_error = None
    line_mode = False
    line_report = None
    if paired_path.is_file():
        fit_pairs, validation_pairs, paired_payload = load_paired_ground_points(paired_path)
        line_mode = paired_payload.get("mode") == "rectangle_line_v1"
        if line_mode:
            from tools.rectangle_line_calibration import compute_rectangle_line_homographies, fit_gate
            if paired_payload.get("calibration_id") != manifest.get("calibration_id"):
                raise ValueError("calibration_id cua diem va anh capture khong trung nhau")
            transforms, diagnostics, relative_diagnostic, line_report = compute_rectangle_line_homographies(
                measurements, fit_pairs, image_sizes,
            )
            limit = float(getattr(args, "max_cross_camera_validation_error_cm", 2.0))
            reasons = fit_gate(line_report, diagnostics, limit)
            line_report.update(status="model_inadequate" if reasons else "fit_ready",
                               max_error_cm_limit=limit, rejection_reasons=reasons)
            if reasons:
                blocking_error = "rectangle_line_model_inadequate: " + "; ".join(reasons)
            for item in line_report["points"]:
                print(f"{item['label']}: truoc={item['before_symmetric_pixel_error']:.2f}px -> "
                      f"sau={item['symmetric_pixel_error']:.2f}px; {item['cross_camera_error_cm']:.3f}cm")
        else:
            transforms, diagnostics, relative_diagnostic = compute_distributed_shared_homographies(
                measurements,
                fit_pairs,
                image_sizes,
                ransac_threshold_px=float(getattr(args, "ransac_threshold_px", 3.0)),
                min_inliers=int(getattr(args, "minimum_fit_inliers", 8)),
                min_inlier_ratio=float(getattr(args, "minimum_fit_inlier_ratio", 0.75)),
            )
        inlier_labels = [
            item["label"]
            for item in relative_diagnostic["points"]
            if item["inlier"]
        ]
        fit_coverage = distributed_fit_coverage(
            fit_pairs, validation_pairs, inlier_labels
        )
        minimum_coverage = float(getattr(args, "minimum_fit_coverage", 0.60))
        if not line_mode and fit_coverage["minimum_ratio"] < minimum_coverage:
            blocking_error = (
                "distributed_fit_insufficient_coverage: fit chi phu "
                f"{fit_coverage['minimum_ratio']:.1%} vung mat dat da xac nhan, "
                f"can >= {minimum_coverage:.1%}. Hay bo sung diem P tai vung trai/xa; "
                "ban nhap van duoc giu nguyen."
            )
    else:
        for camera_id in CAMERA_IDS:
            homography, diagnostic = compute_homography(
                measurements[camera_id], args.ransac_threshold_cm
            )
            transforms[camera_id] = homography
            diagnostics[camera_id] = diagnostic

    for camera_id in CAMERA_IDS:
        homography = transforms[camera_id]
        diagnostic = diagnostics[camera_id]
        image_size = image_sizes[camera_id]
        coverage_pixels = load_coverage_pixels(
            coverage_paths[camera_id],
            image_size,
        )
        coverage_pixels_by_camera[camera_id] = coverage_pixels
        coverages[camera_id] = transform_polygon(coverage_pixels, homography)
        diagnostic["active_roi_to_calibration_area_ratio"] = round(
            calibration_extrapolation_ratio(measurements[camera_id], coverage_pixels), 3
        )
        if diagnostic["active_roi_to_calibration_area_ratio"] > 8.0:
            print(
                f"Canh bao: {camera_id} ROI rong gap "
                f"{diagnostic['active_roi_to_calibration_area_ratio']:.1f} lan tu giac 4 diem. "
                "Map o xa 4 diem dang ngoai suy manh; nen dat hinh chuan lon hon "
                "hoac them diem do phan bo quanh vung tracking."
            )
        full_coverages[camera_id] = transform_polygon(
            full_frame_polygon(image_size), homography
        )
        parking_slots[camera_id] = load_parking_slots_world(
            slot_paths[camera_id], image_size, homography
        )
        if diagnostic["rms_error_cm"] > args.max_rms_error_cm and not args.allow_high_error:
            raise ValueError(
                f"{camera_id} RMS={diagnostic['rms_error_cm']:.2f} cm vuot "
                f"{args.max_rms_error_cm:.2f} cm. Kiem tra diem do hoac dung "
                "--allow-high-error de chap nhan co chu y."
            )

    validation_diagnostic = None
    validation_path = workspace / VALIDATION_POINTS_NAME
    if line_mode:
        # V1-V4 are fitted observations. Never label them independent validation.
        validation_diagnostic = line_report
    elif validation_pairs:
        validation_diagnostic = cross_camera_validation_diagnostics(
            validation_pairs, transforms, image_sizes
        )
    elif validation_path.is_file():
        validation_pairs = load_cross_camera_validation(validation_path)
        validation_diagnostic = cross_camera_validation_diagnostics(
            validation_pairs, transforms, image_sizes
        )
        validation_diagnostic.update(cross_camera_validation_spread(validation_pairs, images))

    validation_status = "missing"
    if line_mode:
        validation_status = line_report["status"]
    elif validation_diagnostic is not None:
        zones = validation_diagnostic.get("zones", {})
        minimum_zone_points = 2 if paired_path.is_file() else 1
        missing_zones = [
            name
            for name in ("left", "center", "right")
            if zones.get(name, {}).get("point_count", 0) < minimum_zone_points
            or (
                paired_path.is_file()
                and min(zones.get(name, {}).get("near_far_spread_ratio", {}).values() or [0.0]) < 0.05
            )
        ]
        max_validation_error_cm = float(
            getattr(args, "max_cross_camera_validation_error_cm", 2.0)
        )
        max_validation_pixel_p95 = float(getattr(args, "max_validation_pixel_p95", 5.0))
        max_validation_pixel_error = float(getattr(args, "max_validation_pixel_error", 8.0))
        failed_zones = [
            name for name, value in zones.items()
            if value.get("max_error_cm") is not None
            and value["max_error_cm"] > max_validation_error_cm
        ]
        validation_failed = (
            bool(missing_zones)
            or validation_diagnostic["p95_error_cm"] > max_validation_error_cm
            or validation_diagnostic["p95_symmetric_pixel_error"] > max_validation_pixel_p95
            or validation_diagnostic["max_symmetric_pixel_error"] > max_validation_pixel_error
            or bool(failed_zones)
        )
        validation_status = "model_inadequate" if validation_failed else "passed"
        validation_diagnostic["status"] = validation_status
        validation_diagnostic["limits"] = {
            "p95_error_cm": max_validation_error_cm,
            "zone_max_error_cm": max_validation_error_cm,
            "p95_symmetric_pixel_error": max_validation_pixel_p95,
            "max_symmetric_pixel_error": max_validation_pixel_error,
        }
        if validation_failed and not bool(getattr(args, "allow_high_validation_error", False)):
            details = ", ".join(
                f"{item['label']}[{item['zone']}]={item['cross_camera_error_cm']:.2f}cm/"
                f"{item['symmetric_pixel_error']:.1f}px"
                for item in validation_diagnostic["points"]
            )
            blocking_error = blocking_error or (
                "model_inadequate: phep bien doi hien tai chua khop cac diem "
                f"kiem chung (p95={validation_diagnostic['p95_error_cm']:.2f}cm, "
                f"pixel p95={validation_diagnostic['p95_symmetric_pixel_error']:.1f}px; "
                f"thieu vung={missing_zones}, vuot nguong={failed_zones}; {details}). "
                "Ket qua nay khong chung minh ban click sai. Hay xem mui ten sai so, "
                "bo sung diem P tai vung lech hoac kiem tra meo ong kinh/mat phang. "
                "Ban nhap duoc giu, calibration dang dung KHONG bi ghi de."
            )
    else:
        print(
            f"Canh bao: thieu diem V doc lap; khong the kich hoat calibration moi."
        )
        if paired_path.is_file():
            blocking_error = blocking_error or "Thieu V1-V6 doc lap; ban nhap van duoc giu nguyen"
    if blocking_error and validation_diagnostic is not None:
        validation_diagnostic["status"] = "model_inadequate"

    output_path = args.output.resolve()
    _ensure_writable(output_path, args.overwrite)
    preview_path = workspace / "shared_map_preview.png"
    full_preview_path = workspace / "shared_map_full_view.png"
    active_preview_path = workspace / "shared_map_active_roi.png"
    checkerboard_preview_path = workspace / "shared_map_checkerboard.png"
    _ensure_writable(preview_path, args.overwrite)
    _ensure_writable(full_preview_path, args.overwrite)
    _ensure_writable(active_preview_path, args.overwrite)
    _ensure_writable(checkerboard_preview_path, args.overwrite)

    full_overlap_area, full_overlap = convex_intersection(
        full_coverages["cam1"], full_coverages["cam2"]
    )
    if full_overlap_area <= 0 or len(full_overlap) < 3:
        raise ValueError(
            "Hai khung hinh day du khong giao nhau tren world map. "
            "Kiem tra thu tu A-B-C-D cua hai camera."
        )
    full_bounds_tuple = _preview_bounds([*full_coverages.values(), full_overlap])
    full_world_bounds = draw_full_view_preview(
        images,
        transforms,
        full_coverages,
        full_overlap,
        diagnostics,
        full_preview_path,
        bounds=full_bounds_tuple,
    )

    overlap_area, overlap = convex_intersection(
        coverages["cam1"], coverages["cam2"]
    )
    verified_coverages = {}
    validated_overlap_area = 0.0
    validated_overlap = np.empty((0, 2), dtype=np.float32)
    if fit_pairs and (validation_pairs or line_mode):
        for camera_id in CAMERA_IDS:
            confirmed_pixels = np.asarray(
                [pair[camera_id] for pair in [*fit_pairs, *validation_pairs]],
                dtype=np.float32,
            )
            verified_pixels = cv2.convexHull(confirmed_pixels).reshape(-1, 2)
            verified_coverages[camera_id] = transform_polygon(
                verified_pixels, transforms[camera_id]
            )
        validated_overlap_area, validated_overlap = convex_intersection(
            verified_coverages["cam1"], verified_coverages["cam2"]
        )
        if validated_overlap_area <= 0 or len(validated_overlap) < 3:
            blocking_error = blocking_error or (
                "Hai vung mat dat da chon khong giao nhau sau khi chieu; "
                "kiem tra cac cap diem P/V."
            )
    else:
        # Legacy calibration has no independently verified ground support.
        validated_overlap = overlap.copy()
        validated_overlap_area = float(overlap_area)
    active_bounds_tuple = _preview_bounds([
        *coverages.values(),
        *([overlap] if len(overlap) >= 3 else []),
    ])
    preview_overlap = validated_overlap if line_mode else overlap
    draw_active_roi_preview(
        images,
        transforms,
        coverage_pixels_by_camera,
        coverages,
        preview_overlap,
        full_coverages,
        parking_slots,
        active_preview_path,
        active_bounds_tuple,
        validation_diagnostic,
    )
    draw_active_roi_preview(
        images,
        transforms,
        coverage_pixels_by_camera,
        coverages,
        preview_overlap,
        full_coverages,
        parking_slots,
        checkerboard_preview_path,
        active_bounds_tuple,
        validation_diagnostic,
        composite_mode="checkerboard",
    )
    if overlap_area <= 0 or len(overlap) < 3:
        print(
            "Canh bao: hai ROI quan ly khong giao nhau. Runtime van dung "
            "vung mat dat da kiem chung neu calibration cung cap."
        )

    world_bounds = draw_map_preview(coverages, overlap, diagnostics, preview_path)

    common_labels = set(row["label"] for row in measurements["cam1"]) & set(
        row["label"] for row in measurements["cam2"]
    )
    shared_point_checks = []
    for label in sorted(common_labels):
        first = next(
            point for point in diagnostics["cam1"]["points"] if point["label"] == label
        )
        second = next(
            point for point in diagnostics["cam2"]["points"] if point["label"] == label
        )
        distance = float(np.linalg.norm(
            np.subtract(first["projected_world_cm"], second["projected_world_cm"])
        ))
        shared_point_checks.append({
            "label": label,
            "cross_camera_error_cm": round(distance, 3),
        })

    calibration_id = str(manifest.get("calibration_id") or "").strip()
    if not calibration_id:
        identity_source = paired_path if paired_path.is_file() else workspace / POINTS_NAME
        calibration_id = f"legacy-{_sha256_file(identity_source)[:16]}"
    calibration_status = (
        "draft_failed"
        if blocking_error
        else "fit_ready"
        if line_mode
        else "passed"
        if paired_path.is_file() and validation_status == "passed"
        else "legacy_unverified"
    )
    payload = {
        "schema_version": 5 if paired_path.is_file() else 4,
        "calibration_id": calibration_id,
        "calibration_status": calibration_status,
        "calibration_algorithm": "rectangle_line_v1" if line_mode else "distributed-ground-v1",
        "world": {
            "unit": "cm",
            "coordinate_system": "measured_parking_ground_plane",
            "bounds": world_bounds,
            "full_view_bounds": full_world_bounds,
        },
        "camera_transforms": {
            camera_id: transforms[camera_id].tolist()
            for camera_id in CAMERA_IDS
        },
        "camera_coverage_world": {
            camera_id: [[round(float(x), 4), round(float(y), 4)] for x, y in coverages[camera_id]]
            for camera_id in CAMERA_IDS
        },
        "camera_full_view_world": {
            camera_id: [[round(float(x), 4), round(float(y), 4)] for x, y in full_coverages[camera_id]]
            for camera_id in CAMERA_IDS
        },
        "parking_slots_world": {
            camera_id: [
                {
                    "id": slot["id"],
                    "polygon": [
                        [round(float(x), 4), round(float(y), 4)]
                        for x, y in slot["polygon"]
                    ],
                }
                for slot in parking_slots[camera_id]
            ]
            for camera_id in CAMERA_IDS
        },
        "edge_adjacency": [
            {"source_camera": "cam1", "exit_edge": "right", "target_camera": "cam2"},
            {"source_camera": "cam2", "exit_edge": "left", "target_camera": "cam1"},
        ],
        "overlap_world_polygon": [
            [round(float(x), 4), round(float(y), 4)] for x, y in overlap
        ],
        "full_view_overlap_world_polygon": [
            [round(float(x), 4), round(float(y), 4)] for x, y in full_overlap
        ],
        "tracking_defaults": {
            # These cameras view the toy vehicle from opposing top-down
            # angles, so bbox centre is more camera-invariant than the local
            # tracker's ground/contact point.
            "shared_map_anchor": "bbox_center",
        },
        "matching_defaults": {
            "unit": "cm",
            "handoff_match_distance": float(args.handoff_match_distance_cm),
            "handoff_prediction_radius": float(args.handoff_prediction_radius_cm),
            "dormant_match_distance": float(args.dormant_match_distance_cm),
            # Tight post-allocation reconciliation gate.  It is intentionally
            # smaller than the normal handoff radius and uses bbox-centre map
            # anchors plus mutual uniqueness before any ID can be merged.
            "cross_camera_duplicate_distance": float(
                args.handoff_match_distance_cm * 0.60
            ),
        },
        "calibration_quality": {
            "status": calibration_status,
            "cameras": diagnostics,
            "distributed_relative_fit": relative_diagnostic,
            "distributed_fit_coverage": fit_coverage,
            "shared_point_checks": shared_point_checks,
            "independent_cross_camera_validation": None if line_mode else validation_diagnostic,
            "rectangle_line_fit": line_report,
            "overlap_area_cm2": round(overlap_area, 3),
            "active_roi_overlap_area_cm2": round(overlap_area, 3),
            "full_view_overlap_area_cm2": round(full_overlap_area, 3),
            "validated_ground_overlap_area_cm2": round(validated_overlap_area, 3),
        },
        "source": {
            "workspace": str(workspace),
            "capture_manifest": manifest,
            "measurements": POINTS_NAME,
            "paired_ground_points": PAIRED_POINTS_NAME if paired_path.is_file() else None,
            "independent_validation": (
                None if line_mode else PAIRED_POINTS_NAME if paired_path.is_file()
                else VALIDATION_POINTS_NAME if validation_diagnostic is not None else None
            ),
            "hashes": {
                "measurements_sha256": _sha256_file(workspace / POINTS_NAME),
                "paired_ground_points_sha256": (
                    _sha256_file(paired_path) if paired_path.is_file() else None
                ),
                "capture_cam1_sha256": _sha256_file(
                    workspace / manifest["cameras"]["cam1"]["image"]
                ),
                "capture_cam2_sha256": _sha256_file(
                    workspace / manifest["cameras"]["cam2"]["image"]
                ),
            },
            "coverage_masks": {
                camera_id: str(path) if path else None
                for camera_id, path in coverage_paths.items()
            },
            "parking_slots": {
                camera_id: str(path) if path else None
                for camera_id, path in slot_paths.items()
            },
            "preview": str(preview_path),
            "previews": {
                "full_view": str(full_preview_path),
                "active_roi": str(active_preview_path),
                "checkerboard": str(checkerboard_preview_path),
                "legacy_active_map": str(preview_path),
            },
        },
    }
    if paired_path.is_file() and not line_mode:
        payload["validated_ground_overlap_world_polygon"] = [
            [round(float(x), 4), round(float(y), 4)] for x, y in validated_overlap
        ]
        payload["validated_ground_coverage_world"] = {
            camera_id: [
                [round(float(x), 4), round(float(y), 4)]
                for x, y in verified_coverages[camera_id]
            ]
            for camera_id in CAMERA_IDS
        }
    if line_mode:
        payload["fitted_ground_overlap_world_polygon"] = [
            [round(float(x), 4), round(float(y), 4)] for x, y in validated_overlap
        ]
        payload["calibration_quality"]["fitted_ground_overlap_area_cm2"] = round(validated_overlap_area, 3)
        payload["calibration_quality"].pop("validated_ground_overlap_area_cm2", None)
        payload["calibration_quality"].pop("distributed_fit_coverage", None)
    draft_path = workspace / "calibration_draft.json"
    _write_json(draft_path, payload)
    if blocking_error:
        print(f"Da luu ban nhap va chan doan: {draft_path}")
        raise ValueError(blocking_error)
    if line_mode:
        print(f"Da luu ban 8 diem: {draft_path}. CHUA thay calibration dang hoat dong.")
        print("V1-V4 da tham gia fit; can xem vach son/checkerboard va xac nhan truoc khi kich hoat.")
        return
    _write_json(output_path, payload)
    print(f"Da tao calibration: {output_path}")
    print(f"Da tao full-view preview: {full_preview_path}")
    print(f"Da tao active-ROI preview: {active_preview_path}")
    print(f"Da tao checkerboard preview: {checkerboard_preview_path}")
    print(f"Da tao legacy map preview: {preview_path}")
    print(f"Full-view overlap: {full_overlap_area:.2f} cm^2")
    print(f"Active-ROI overlap: {overlap_area:.2f} cm^2")
    for camera_id in CAMERA_IDS:
        quality = diagnostics[camera_id]
        suffix = " (4 diem: chua co du lieu du de cross-check)" if quality["point_count"] == 4 else ""
        print(
            f"{camera_id}: RMS={quality['rms_error_cm']:.3f} cm, "
            f"max={quality['max_error_cm']:.3f} cm, "
            f"inlier={quality['inlier_count']}/{quality['point_count']}{suffix}"
        )
    for item in shared_point_checks:
        print(
            f"Shared {item['label']}: cross-camera error "
            f"{item['cross_camera_error_cm']:.3f} cm"
        )
    if validation_diagnostic is not None:
        print(
            "Independent validation: "
            f"mean={validation_diagnostic['mean_error_cm']:.3f} cm, "
            f"p95={validation_diagnostic['p95_error_cm']:.3f} cm, "
            f"max={validation_diagnostic['max_error_cm']:.3f} cm"
        )


def make_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Calibrate two partial DroidCam views into one centimetre map"
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    capture = subparsers.add_parser("capture", help="Chup frame cam1/cam2")
    capture.add_argument("--cam1-url", required=True)
    capture.add_argument("--cam2-url", required=True)
    capture.add_argument("--workspace", required=True, type=Path)
    capture.add_argument("--warmup-frames", type=int, default=15)
    capture.add_argument("--overwrite", action="store_true")
    capture.set_defaults(handler=capture_command)

    mark = subparsers.add_parser("mark", help="Click cac diem pixel co nhan")
    mark.add_argument("--workspace", required=True, type=Path)
    mark.add_argument("--cam1-labels", default="A,B,C,D")
    mark.add_argument("--cam2-labels", default="E,F,G,H")
    mark.add_argument("--overwrite", action="store_true")
    mark.set_defaults(handler=mark_command)

    build = subparsers.add_parser("build", help="Tinh H1/H2 va dung world map")
    build.add_argument("--workspace", required=True, type=Path)
    build.add_argument("--output", required=True, type=Path)
    build.add_argument("--coverage-cam1", type=Path)
    build.add_argument("--coverage-cam2", type=Path)
    build.add_argument("--slots-cam1", type=Path)
    build.add_argument("--slots-cam2", type=Path)
    build.add_argument("--ransac-threshold-cm", type=float, default=2.0)
    build.add_argument("--ransac-threshold-px", type=float, default=3.0)
    build.add_argument("--minimum-fit-inliers", type=int, default=8)
    build.add_argument("--minimum-fit-inlier-ratio", type=float, default=0.75)
    build.add_argument("--minimum-fit-coverage", type=float, default=0.60)
    build.add_argument("--max-rms-error-cm", type=float, default=3.0)
    build.add_argument("--allow-high-error", action="store_true")
    build.add_argument(
        "--max-cross-camera-validation-error-cm", type=float, default=2.0
    )
    build.add_argument("--max-validation-pixel-p95", type=float, default=5.0)
    build.add_argument("--max-validation-pixel-error", type=float, default=8.0)
    build.add_argument("--allow-high-validation-error", action="store_true")
    build.add_argument("--min-validation-area-ratio", type=float, default=0.01)
    build.add_argument("--allow-collinear-validation", action="store_true")
    build.add_argument("--handoff-match-distance-cm", type=float, default=15.0)
    build.add_argument("--handoff-prediction-radius-cm", type=float, default=25.0)
    build.add_argument("--dormant-match-distance-cm", type=float, default=35.0)
    build.add_argument("--overwrite", action="store_true")
    build.set_defaults(handler=build_command)
    return parser


def main() -> int:
    args = make_parser().parse_args()
    try:
        args.handler(args)
    except KeyboardInterrupt:
        print("Da huy thao tac.")
        return 130
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
