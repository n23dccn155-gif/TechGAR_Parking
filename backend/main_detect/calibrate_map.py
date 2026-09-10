r"""Calibrate two DroidCam views without manually entering world X/Y.

Place one measured rectangle on the ground inside the area visible to both
cameras. Run::

    & ..\.venv\Scripts\python.exe .\calibrate_map.py

Click the same physical corners A, B, C, D on cam1 and cam2. The script asks
only for AB and AD in centimetres, chooses A=(0,0) automatically, and builds
both pixel-to-world homographies plus the shared map.
"""

from __future__ import annotations

import argparse
import csv
from datetime import datetime
import json
from pathlib import Path
from typing import Dict, List, Sequence, Tuple
import uuid
import shutil

import cv2
import numpy as np

from tools.calibrate_shared_map import (
    CSV_FIELDS,
    MANIFEST_NAME,
    PAIRED_POINTS_NAME,
    POINTS_NAME,
    VALIDATION_POINTS_NAME,
    build_command,
    capture_frame_with_metadata,
    draw_labeled_points,
    read_image,
    write_image,
)
from tools.rectangle_line_calibration import MODE, approve_rectangle_line_calibration


PROJECT_ROOT = Path(__file__).resolve().parent
DEFAULT_CAM1_URL = "http://192.168.100.53:4747/video/force/1280x720"
DEFAULT_CAM2_URL = "http://192.168.100.198:4747/video/force/1280x720"
POINT_LABELS = ("A", "B", "C", "D")
FIT_LABELS = POINT_LABELS + tuple(f"V{index}" for index in range(1, 5))
# V1-V4 are correction observations; do not claim held-out validation.
VALIDATION_LABELS: Tuple[str, ...] = ()
PAIR_PANEL_SIZE = (720, 405)
PAIR_HEADER_HEIGHT = 78
MIN_VALIDATION_TRIANGLE_AREA_RATIO = 0.01


def _read_positive_length(prompt: str) -> float:
    while True:
        try:
            raw = input(prompt).strip().replace(",", ".")
        except EOFError as exc:
            raise KeyboardInterrupt from exc
        try:
            value = float(raw)
        except ValueError:
            print("Hay nhap mot so, vi du: 25 hoac 25.5")
            continue
        if not np.isfinite(value) or value <= 0:
            print("Chieu dai phai lon hon 0 cm.")
            continue
        return value


def _render_selection(
    image: np.ndarray,
    camera_id: str,
    points: Sequence[Tuple[int, int]],
) -> np.ndarray:
    preview = image.copy()
    next_label = POINT_LABELS[len(points)] if len(points) < 4 else "DONE"
    
    # Ve chu co vien den truc tiep len anh ma khong can ve dai den che khuat mep anh
    text1 = f"{camera_id.upper()}: click SAME overlap rectangle - next point {next_label}"
    text2 = f"Points: {len(points)}/4 | A-B-C-D around rectangle | Right: undo | R: reset | Q: cancel"
    
    cv2.putText(preview, text1, (12, 28), cv2.FONT_HERSHEY_SIMPLEX, 0.65, (0, 0, 0), 4, cv2.LINE_AA)
    cv2.putText(preview, text1, (12, 28), cv2.FONT_HERSHEY_SIMPLEX, 0.65, (0, 255, 255), 2, cv2.LINE_AA)
    cv2.putText(preview, text2, (12, 54), cv2.FONT_HERSHEY_SIMPLEX, 0.48, (0, 0, 0), 3, cv2.LINE_AA)
    cv2.putText(preview, text2, (12, 54), cv2.FONT_HERSHEY_SIMPLEX, 0.48, (255, 255, 255), 1, cv2.LINE_AA)

    for label, point in zip(POINT_LABELS, points):
        cv2.circle(preview, point, 7, (0, 255, 255), -1)
        cv2.circle(preview, point, 10, (0, 0, 0), 2)
        cv2.putText(
            preview,
            label,
            (point[0] + 11, point[1] - 8),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.68,
            (0, 255, 255),
            2,
        )
    if len(points) >= 2:
        cv2.polylines(
            preview,
            [np.asarray(points, dtype=np.int32)],
            len(points) == 4,
            (0, 220, 255),
            2,
        )
    return preview


def select_rectangle_points(camera_id: str, image: np.ndarray) -> List[Tuple[int, int]]:
    """Select the same four physical rectangle corners in one camera."""
    points: List[Tuple[int, int]] = []
    window_name = f"Shared rectangle - {camera_id}"

    def on_mouse(event, x, y, _flags, _userdata):
        if event == cv2.EVENT_LBUTTONDOWN and len(points) < 4:
            points.append((int(x), int(y)))
        elif event == cv2.EVENT_RBUTTONDOWN and points:
            removed_label = POINT_LABELS[len(points) - 1]
            points.pop()
            print(f"Da xoa diem {camera_id}:{removed_label}")

    cv2.namedWindow(window_name, cv2.WINDOW_NORMAL)
    cv2.resizeWindow(window_name, 1280, 720)
    cv2.setMouseCallback(window_name, on_mouse)
    while True:
        next_label = POINT_LABELS[len(points)] if len(points) < 4 else "DONE"
        cv2.setWindowTitle(
            window_name,
            f"[{camera_id.upper()}] Diem tiep theo: {next_label} ({len(points)}/4) | Chuot phai: Undo | R: Reset | Q: Cancel",
        )
        cv2.imshow(window_name, _render_selection(image, camera_id, points))
        key = cv2.waitKey(20) & 0xFF
        if key in (27, ord("q")):
            raise KeyboardInterrupt
        if key == ord("r"):
            points.clear()
            print(f"Da xoa tat ca diem cua {camera_id}.")
        if len(points) == 4:
            polygon = np.asarray(points, dtype=np.int32)
            area = abs(float(cv2.contourArea(polygon)))
            if not cv2.isContourConvex(polygon) or area < 100.0:
                print(
                    f"{camera_id}: A-B-C-D dang bi cheo, lom hoac qua sat nhau. "
                    "Hay click lai theo mot vong quanh hinh chu nhat."
                )
                points.clear()
                continue
            cv2.imshow(window_name, _render_selection(image, camera_id, points))
            cv2.waitKey(250)
            cv2.destroyWindow(window_name)
            return points.copy()


def _render_paired_selection(
    images: Dict[str, np.ndarray],
    points_by_camera: Dict[str, Sequence[Tuple[int, int]]],
    expected_label: str,
    expected_camera: str,
    predicted_cam2_point: Tuple[float, float] | None = None,
    magnifier_point: Tuple[int, int] | None = None,
) -> np.ndarray:
    panel_width, panel_height = PAIR_PANEL_SIZE
    panels = []
    all_labels = FIT_LABELS + VALIDATION_LABELS
    for camera_id in ("cam1", "cam2"):
        image = images[camera_id]
        panel = cv2.resize(image, (panel_width, panel_height))
        scale_x = panel_width / float(image.shape[1])
        scale_y = panel_height / float(image.shape[0])
        rendered_points = [
            (int(round(x * scale_x)), int(round(y * scale_y)))
            for x, y in points_by_camera[camera_id]
        ]
        corners = rendered_points[: len(POINT_LABELS)]
        if len(corners) >= 2:
            cv2.polylines(
                panel,
                [np.asarray(corners, dtype=np.int32)],
                len(corners) == 4,
                (0, 220, 255),
                2,
            )
        if len(rendered_points) > 5:
            cv2.polylines(panel, [np.asarray(rendered_points[4:], np.int32)], False, (0, 165, 255), 2)
        for index, point in enumerate(rendered_points):
            label = all_labels[index]
            color = (
                (0, 255, 255)
                if index < len(POINT_LABELS)
                else (0, 165, 255)
                if index < len(FIT_LABELS)
                else (60, 255, 60)
            )
            cv2.circle(panel, point, 6, color, -1)
            cv2.circle(panel, point, 9, (0, 0, 0), 2)
            cv2.putText(
                panel, label, (point[0] + 9, point[1] - 7),
                cv2.FONT_HERSHEY_SIMPLEX, 0.58, color, 2, cv2.LINE_AA,
            )
        if camera_id == "cam2" and predicted_cam2_point is not None:
            predicted = (
                int(round(predicted_cam2_point[0] * scale_x)),
                int(round(predicted_cam2_point[1] * scale_y)),
            )
            cv2.drawMarker(
                panel, predicted, (255, 255, 0), cv2.MARKER_CROSS, 24, 2, cv2.LINE_AA
            )
            cv2.circle(panel, predicted, 14, (255, 255, 0), 2, cv2.LINE_AA)
            cv2.putText(
                panel, "VI TRI DU DOAN", (predicted[0] + 14, predicted[1] + 20),
                cv2.FONT_HERSHEY_SIMPLEX, 0.42, (255, 255, 0), 1, cv2.LINE_AA,
            )
        cv2.putText(
            panel, camera_id.upper(), (12, 28), cv2.FONT_HERSHEY_SIMPLEX,
            0.82, (0, 0, 0), 4, cv2.LINE_AA,
        )
        cv2.putText(
            panel, camera_id.upper(), (12, 28), cv2.FONT_HERSHEY_SIMPLEX,
            0.82, (255, 255, 255), 2, cv2.LINE_AA,
        )
        zoom = None
        if magnifier_point is not None:
            mouse_x, mouse_y = magnifier_point
            belongs = (camera_id == "cam1" and mouse_x < panel_width) or (
                camera_id == "cam2" and mouse_x >= panel_width
            )
            if belongs and PAIR_HEADER_HEIGHT <= mouse_y < PAIR_HEADER_HEIGHT + panel_height:
                local_x = mouse_x if camera_id == "cam1" else mouse_x - panel_width
                local_y = mouse_y - PAIR_HEADER_HEIGHT
                source_x = int(round(local_x * image.shape[1] / panel_width))
                source_y = int(round(local_y * image.shape[0] / panel_height))
                radius = 28
                x0, x1 = max(0, source_x - radius), min(image.shape[1], source_x + radius)
                y0, y1 = max(0, source_y - radius), min(image.shape[0], source_y + radius)
                crop = image[y0:y1, x0:x1]
                if crop.size:
                    zoom = cv2.resize(crop, (180, 180), interpolation=cv2.INTER_NEAREST)
                    marker = (int((source_x - x0) * 180 / (x1 - x0)), int((source_y - y0) * 180 / (y1 - y0)))
                    cv2.drawMarker(zoom, marker, (0, 255, 255), cv2.MARKER_CROSS, 26, 2)
        # Magnifier is outside the clickable image: it cannot hide ground or
        # accidentally be treated as a coordinate in the original photograph.
        panel = cv2.copyMakeBorder(panel, 0, 190, 0, 0, cv2.BORDER_CONSTANT, value=(24, 24, 24))
        if zoom is not None:
            panel[panel_height + 5:panel_height + 185, 5:185] = zoom
        cv2.putText(panel, "ZOOM - chi xem; click tren anh goc", (195, panel_height + 35), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (235, 235, 235), 1)
        panels.append(panel)

    body = np.hstack(panels)
    canvas = cv2.copyMakeBorder(
        body, PAIR_HEADER_HEIGHT, 0, 0, 0, cv2.BORDER_CONSTANT, value=(24, 24, 24)
    )
    title = (
        f"Click {expected_label} tren {expected_camera.upper()}: "
        "HAI diem cung nhan phai la CUNG MOT VI TRI VAT LY"
    )
    if expected_label == "DONE":
        title = "Da du 8 cap diem | ENTER: tinh | Chuot phai: undo | R: reset | Q/ESC: huy"
    help_text = (
        "A-D: hinh chu nhat | V1-V4: cung vach trai->phai CAM1, cung nhan CAM2 | G: goi y (khong bat buoc)"
    )
    cv2.putText(canvas, title, (12, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.62, (0, 255, 255), 2, cv2.LINE_AA)
    cv2.putText(canvas, help_text, (12, 61), cv2.FONT_HERSHEY_SIMPLEX, 0.43, (235, 235, 235), 1, cv2.LINE_AA)
    cv2.line(
        canvas,
        (PAIR_PANEL_SIZE[0], PAIR_HEADER_HEIGHT),
        (PAIR_PANEL_SIZE[0], canvas.shape[0]),
        (255, 255, 255),
        2,
    )
    return canvas


def _predict_cam2_point(
    points_by_camera: Dict[str, Sequence[Tuple[int, int]]],
) -> Tuple[float, float] | None:
    """Optional provisional guide from all completed pairs, never a click gate."""
    if len(points_by_camera["cam1"]) <= len(points_by_camera["cam2"]):
        return None
    if len(points_by_camera["cam1"]) < 5 or len(points_by_camera["cam2"]) < 4:
        return None
    completed = min(len(points_by_camera["cam2"]), len(FIT_LABELS))
    homography, _ = cv2.findHomography(
        np.asarray(points_by_camera["cam1"][:completed], dtype=np.float32),
        np.asarray(points_by_camera["cam2"][:completed], dtype=np.float32),
        method=0,
    )
    if homography is None:
        return None
    source = np.asarray(points_by_camera["cam1"][-1], dtype=np.float32).reshape(1, 1, 2)
    predicted = cv2.perspectiveTransform(source, homography).reshape(2)
    if not np.isfinite(predicted).all():
        return None
    return float(predicted[0]), float(predicted[1])


def _validation_points_are_spread(
    points: Sequence[Tuple[int, int]], image: np.ndarray
) -> bool:
    if len(points) < 3:
        return False
    triangle_area = abs(float(cv2.contourArea(np.asarray(points[:3], np.float32))))
    image_area = float(image.shape[0] * image.shape[1])
    return triangle_area >= image_area * MIN_VALIDATION_TRIANGLE_AREA_RATIO


def select_corresponding_points(
    images: Dict[str, np.ndarray],
    initial_points: Dict[str, Sequence[Tuple[int, int]]] | None = None,
    draft_path: Path | None = None,
) -> Tuple[Dict[str, List[Tuple[int, int]]], Dict[str, List[Tuple[int, int]]]]:
    """Select each physical point as a cam1/cam2 pair in one shared view."""
    labels = FIT_LABELS + VALIDATION_LABELS
    points_by_camera: Dict[str, List[Tuple[int, int]]] = {
        camera_id: [tuple(map(int, point)) for point in (initial_points or {}).get(camera_id, [])]
        for camera_id in ("cam1", "cam2")
    }
    if any(len(points) > len(labels) for points in points_by_camera.values()):
        raise ValueError("Ban nhap resume co nhieu diem hon schema hien tai")
    if len(points_by_camera["cam1"]) - len(points_by_camera["cam2"]) not in (0, 1):
        raise ValueError("Ban nhap khong theo thu tu cap CAM1 -> CAM2")
    history: List[Tuple[str, str, Tuple[int, int]]] = []
    for index, label in enumerate(labels):
        if index < len(points_by_camera["cam1"]):
            history.append(("cam1", label, points_by_camera["cam1"][index]))
        if index < len(points_by_camera["cam2"]):
            history.append(("cam2", label, points_by_camera["cam2"][index]))
    window_name = "TechGAR paired cross-camera calibration"
    panel_width, panel_height = PAIR_PANEL_SIZE
    show_fit_guide = False
    mouse_position: Tuple[int, int] | None = None

    def save_progress():
        if draft_path is not None:
            temporary = draft_path.with_suffix(".tmp")
            temporary.write_text(json.dumps({"mode": MODE, "points": points_by_camera}, indent=2), encoding="utf-8")
            temporary.replace(draft_path)

    def on_mouse(event, x, y, _flags, _userdata):
        nonlocal mouse_position
        mouse_position = (int(x), int(y))
        if event == cv2.EVENT_RBUTTONDOWN and history:
            camera_id, label, _point = history.pop()
            points_by_camera[camera_id].pop()
            save_progress()
            print(f"Da xoa {camera_id}:{label}")
            return
        if event != cv2.EVENT_LBUTTONDOWN or len(history) >= len(labels) * 2:
            return
        if not (0 <= x < 2 * panel_width and PAIR_HEADER_HEIGHT <= y < PAIR_HEADER_HEIGHT + panel_height):
            return
        pair_index = len(history) // 2
        expected_camera = "cam1" if len(history) % 2 == 0 else "cam2"
        clicked_camera = "cam1" if x < panel_width else "cam2"
        if clicked_camera != expected_camera:
            print(f"Hay click {labels[pair_index]} tren {expected_camera} truoc.")
            return
        local_x = x if clicked_camera == "cam1" else x - panel_width
        local_y = y - PAIR_HEADER_HEIGHT
        image = images[clicked_camera]
        point = (
            int(round(local_x * image.shape[1] / panel_width)),
            int(round(local_y * image.shape[0] / panel_height)),
        )
        point = (
            min(max(point[0], 0), image.shape[1] - 1),
            min(max(point[1], 0), image.shape[0] - 1),
        )
        label = labels[pair_index]
        if clicked_camera == "cam2" and label in FIT_LABELS[4:]:
            predicted = _predict_cam2_point(points_by_camera)
            if predicted is not None:
                guide_error = float(np.linalg.norm(np.subtract(point, predicted)))
                if guide_error > 25.0:
                    print(
                        f"Canh bao {label}: diem cam2 cach goi y tam thoi {guide_error:.1f}px. "
                        "Van chap nhan: goi y khong phai dap an dung."
                    )
        points_by_camera[clicked_camera].append(point)
        history.append((clicked_camera, label, point))
        save_progress()
        print(f"Da chon {clicked_camera}:{label} = {point}")

    cv2.namedWindow(window_name, cv2.WINDOW_AUTOSIZE)
    cv2.setMouseCallback(window_name, on_mouse)
    save_progress()
    while True:
        pair_index = min(len(history) // 2, len(labels) - 1)
        expected_label = labels[pair_index] if len(history) < len(labels) * 2 else "DONE"
        expected_camera = "cam1" if len(history) % 2 == 0 else "cam2"
        predicted_cam2_point = (
            _predict_cam2_point(points_by_camera)
            if show_fit_guide
            and expected_camera == "cam2"
            and expected_label in FIT_LABELS[4:]
            else None
        )
        preview = _render_paired_selection(
            images,
            points_by_camera,
            expected_label,
            expected_camera,
            predicted_cam2_point,
            mouse_position,
        )
        cv2.imshow(window_name, preview)
        key = cv2.waitKey(20) & 0xFF
        if key in (27, ord("q")):
            raise KeyboardInterrupt
        if key == ord("r"):
            history.clear()
            points_by_camera = {"cam1": [], "cam2": []}
            save_progress()
            print("Da xoa tat ca cac cap diem.")
        if key in (ord("g"), ord("G")):
            show_fit_guide = not show_fit_guide
            print(f"Goi y fit: {'bat' if show_fit_guide else 'tat'}")
        if len(history) != len(labels) * 2:
            continue
        if key not in (10, 13):
            continue
        corners_by_camera = {
            camera_id: points[:4] for camera_id, points in points_by_camera.items()
        }
        invalid = []
        for camera_id, corners in corners_by_camera.items():
            polygon = np.asarray(corners, dtype=np.int32)
            if not cv2.isContourConvex(polygon) or abs(float(cv2.contourArea(polygon))) < 100.0:
                invalid.append(camera_id)
        if invalid:
            print(
                "A-B-C-D bi cheo/lom/qua gan o " + ", ".join(invalid)
                + ". Bam R va chon lai theo mot vong quanh cung hinh chu nhat."
            )
            continue
        cv2.imshow(
            window_name,
            _render_paired_selection(images, points_by_camera, "DONE", "cam2"),
        )
        cv2.waitKey(350)
        cv2.destroyWindow(window_name)
        validations_by_camera = {
            camera_id: points[len(FIT_LABELS):]
            for camera_id, points in points_by_camera.items()
        }
        fit_by_camera = {
            camera_id: points[:len(FIT_LABELS)]
            for camera_id, points in points_by_camera.items()
        }
        return fit_by_camera, validations_by_camera


def _capture_both(args: argparse.Namespace, workspace: Path) -> dict:
    manifest = {
        "schema_version": 2,
        "calibration_id": workspace.name,
        "captured_at": datetime.now().astimezone().isoformat(),
        "cameras": {},
    }
    for camera_id, source in (("cam1", args.cam1_url), ("cam2", args.cam2_url)):
        print(f"Dang chup {camera_id}: {source}")
        frame, frame_metadata = capture_frame_with_metadata(source, args.warmup_frames)
        image_path = workspace / f"capture_{camera_id}.png"
        if not write_image(image_path, frame):
            raise RuntimeError(f"Khong ghi duoc anh: {image_path}")
        manifest["cameras"][camera_id] = {
            "source": source,
            "image": image_path.name,
            "width": int(frame.shape[1]),
            "height": int(frame.shape[0]),
            **frame_metadata,
        }
        print(f"Da chup {camera_id}: {image_path}")
    (workspace / MANIFEST_NAME).write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    return manifest


def _pixel_length(first: Sequence[float], second: Sequence[float]) -> float:
    return float(np.linalg.norm(np.subtract(first, second)))


def _make_rows(
    points_by_camera: Dict[str, Sequence[Tuple[int, int]]],
    ab_cm: float,
    ad_cm: float,
) -> List[dict]:
    # The origin and axes are generated by the script, not entered by the user.
    world_by_label = {
        "A": (0.0, 0.0),
        "B": (ab_cm, 0.0),
        "C": (ab_cm, ad_cm),
        "D": (0.0, ad_cm),
    }
    rows = []
    for camera_id in ("cam1", "cam2"):
        for label, (pixel_x, pixel_y) in zip(
            POINT_LABELS, points_by_camera[camera_id]
        ):
            world_x, world_y = world_by_label[label]
            rows.append({
                "camera": camera_id,
                "label": label,
                "pixel_x": pixel_x,
                "pixel_y": pixel_y,
                "world_x_cm": world_x,
                "world_y_cm": world_y,
            })
    return rows


def _save_points_and_images(
    workspace: Path,
    manifest: dict,
    points_by_camera: Dict[str, Sequence[Tuple[int, int]]],
    validation_by_camera: Dict[str, Sequence[Tuple[int, int]]],
    rows: List[dict],
) -> None:
    points_path = workspace / POINTS_NAME
    with points_path.open("w", newline="", encoding="utf-8-sig") as output:
        writer = csv.DictWriter(output, fieldnames=CSV_FIELDS)
        writer.writeheader()
        writer.writerows(rows)

    paired_payload = {
        "schema_version": 2,
        "calibration_id": manifest.get("calibration_id"),
        "mode": MODE,
        "description": "A-D metric rectangle plus V1-V4 lateral line correction; all eight used for fitting",
        "fit_pairs": [
            {
                "label": label,
                "role": "metric_anchor" if label in POINT_LABELS else "line_correction",
                "cam1": list(points_by_camera["cam1"][index]),
                "cam2": list(points_by_camera["cam2"][index]),
            }
            for index, label in enumerate(FIT_LABELS)
        ],
        "validation_pairs": [
            {
                "label": label,
                "role": "held_out_validation",
                "cam1": list(validation_by_camera["cam1"][index]),
                "cam2": list(validation_by_camera["cam2"][index]),
            }
            for index, label in enumerate(VALIDATION_LABELS)
        ],
        "independent_validation": False,
    }
    (workspace / PAIRED_POINTS_NAME).write_text(
        json.dumps(paired_payload, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    validation_payload = {
        "schema_version": 2,
        "description": "Legacy-compatible view of held-out validation pairs",
        "pairs": paired_payload["validation_pairs"],
    }
    (workspace / VALIDATION_POINTS_NAME).write_text(
        json.dumps(validation_payload, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    for camera_id in ("cam1", "cam2"):
        image_path = workspace / manifest["cameras"][camera_id]["image"]
        image = read_image(image_path)
        if image is None:
            raise RuntimeError(f"Khong doc duoc anh: {image_path}")
        marked = draw_labeled_points(
            image,
            FIT_LABELS + VALIDATION_LABELS,
            list(points_by_camera[camera_id]) + list(validation_by_camera[camera_id]),
        )
        marked_path = workspace / f"marked_{camera_id}.png"
        if not write_image(marked_path, marked):
            raise RuntimeError(f"Khong ghi duoc anh: {marked_path}")
    print(f"Da tu dong luu diem va toa do do script tao: {points_path}")


def _print_scale_diagnostics(
    points_by_camera: Dict[str, Sequence[Tuple[int, int]]],
    ab_cm: float,
    ad_cm: float,
) -> None:
    print("\nTy le tai cac canh tham chieu (chi de kiem tra):")
    for camera_id in ("cam1", "cam2"):
        points = points_by_camera[camera_id]
        p_ab = _pixel_length(points[0], points[1])
        p_ad = _pixel_length(points[0], points[3])
        print(
            f"{camera_id}: pAB={p_ab:.2f}px, pAD={p_ad:.2f}px, "
            f"AB={p_ab / ab_cm:.3f}px/cm, AD={p_ad / ad_cm:.3f}px/cm"
        )
    print(
        "AB/AD gan he centimet; A-D VA V1-V4 cung tinh phep can hai camera. "
        "V1-V4 la diem hieu chinh, KHONG phai kiem chung doc lap."
    )


def run(args: argparse.Namespace) -> None:
    workspace_root = args.workspace.resolve()
    attempt_name = f"cal-{datetime.now().strftime('%Y%m%d-%H%M%S')}-{uuid.uuid4().hex[:8]}"
    workspace = workspace_root / "attempts" / attempt_name
    workspace.mkdir(parents=True, exist_ok=False)
    initial_points = None
    if args.resume is not None:
        resume_source = args.resume.resolve()
        manifest_path = resume_source / MANIFEST_NAME
        if not manifest_path.is_file():
            raise FileNotFoundError(f"Khong co capture manifest de resume: {manifest_path}")
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        manifest["resumed_from"] = str(resume_source)
        manifest["calibration_id"] = attempt_name
        for camera in ("cam1", "cam2"):
            original = resume_source / manifest["cameras"][camera]["image"]
            filename = f"capture_{camera}.png"
            shutil.copy2(original, workspace / filename)
            manifest["cameras"][camera]["image"] = filename
        (workspace / MANIFEST_NAME).write_text(json.dumps(manifest, indent=2), encoding="utf-8")
        partial_path = resume_source / "point_selection_draft.json"
        paired_path = resume_source / PAIRED_POINTS_NAME
        if partial_path.is_file():
            partial = json.loads(partial_path.read_text(encoding="utf-8"))
            if partial.get("mode") == MODE:
                initial_points = partial["points"]
        if initial_points is None and paired_path.is_file():
            saved = json.loads(paired_path.read_text(encoding="utf-8"))
            # Old V labels meant validation. Never relabel old P/V silently.
            allowed = FIT_LABELS if saved.get("mode") == MODE else POINT_LABELS
            by_label = {pair["label"]: pair for pair in saved.get("fit_pairs", [])}
            kept = []
            for label in allowed:
                if label not in by_label:
                    break
                kept.append(by_label[label])
            initial_points = {camera: [pair[camera] for pair in kept] for camera in ("cam1", "cam2")}
        print(f"Dung LAI anh/diem tu {resume_source}; luu thanh attempt MOI {workspace}")
    else:
        manifest = _capture_both(args, workspace)
    print("\nDat MOT hinh chu nhat tren mat bai, nam tron trong vung CA HAI cam cung thay.")
    print("Danh dau 4 goc A-B-C-D theo vong quanh hinh. Khong can tu chon goc toa do.\n")
    images: Dict[str, np.ndarray] = {}
    try:
        for camera_id in ("cam1", "cam2"):
            image_path = workspace / manifest["cameras"][camera_id]["image"]
            image = read_image(image_path)
            if image is None:
                raise RuntimeError(f"Khong doc duoc anh: {image_path}")
            images[camera_id] = image
        print(
            "\nChon TUNG CAP diem tren mot man hinh: A cam1 -> A cam2, "
            "sau do B-C-D, V1-V4 tren CUNG MOT DUONG VACH SON trai sang phai CAM1. "
            "CAM2 co the dao chieu; van click dung cung nhan vat ly. "
            "Enter: tinh | Chuot phai: undo | R: reset | Q: huy | G: goi y (mac dinh tat)."
        )
        points_by_camera, validation_by_camera = select_corresponding_points(
            images, initial_points=initial_points, draft_path=workspace / "point_selection_draft.json"
        )
    finally:
        cv2.destroyAllWindows()

    print("\nChi can nhap hai chieu dai that cua hinh chu nhat:")
    ab_cm = _read_positive_length("Nhap chieu dai AB (cm): ")
    ad_cm = _read_positive_length("Nhap chieu dai AD (cm): ")
    _print_scale_diagnostics(points_by_camera, ab_cm, ad_cm)
    rows = _make_rows(points_by_camera, ab_cm, ad_cm)
    _save_points_and_images(
        workspace, manifest, points_by_camera, validation_by_camera, rows
    )
    build_error = None
    try:
        build_command(argparse.Namespace(
            workspace=workspace,
            output=args.output.resolve(),
            coverage_cam1=args.coverage_cam1.resolve() if args.coverage_cam1 else None,
            coverage_cam2=args.coverage_cam2.resolve() if args.coverage_cam2 else None,
            slots_cam1=args.slots_cam1.resolve() if args.slots_cam1 else None,
            slots_cam2=args.slots_cam2.resolve() if args.slots_cam2 else None,
            ransac_threshold_cm=2.0,
            ransac_threshold_px=3.0,
            minimum_fit_inliers=8,
            minimum_fit_inlier_ratio=0.75,
            minimum_fit_coverage=0.60,
            max_rms_error_cm=3.0,
            allow_high_error=False,
            max_cross_camera_validation_error_cm=args.max_validation_error_cm,
            max_validation_pixel_p95=5.0,
            max_validation_pixel_error=8.0,
            allow_high_validation_error=False,
            min_validation_area_ratio=MIN_VALIDATION_TRIANGLE_AREA_RATIO,
            allow_collinear_validation=False,
            handoff_match_distance_cm=15.0,
            handoff_prediction_radius_cm=25.0,
            dormant_match_distance_cm=35.0,
            overwrite=True,
        ))
    except Exception as exc:
        build_error = exc
    print(f"Calibration attempt: {workspace}")

    previews = [
        (
            workspace / "shared_map_active_roi.png",
            "DRAFT FIT - NOT ACTIVE YET - ANY KEY: NEXT; Q/ESC: CANCEL",
        ),
        (
            workspace / "shared_map_checkerboard.png",
            "CHECKERBOARD - KIEM TRA VACH SON TRAI/GIUA/PHAI",
        ),
    ]
    if args.show_full_diagnostic:
        previews.append((
            workspace / "shared_map_full_view.png",
            "DIAGNOSTIC ONLY - full camera frames are NOT expected to coincide",
        ))
    for preview_path, window_name in previews:
        preview = read_image(preview_path)
        if preview is None:
            continue
        print(f"Dang hien thi: {preview_path}")
        cv2.namedWindow(window_name, cv2.WINDOW_NORMAL)
        cv2.imshow(window_name, preview)
        key = cv2.waitKey(0) & 0xFF
        cv2.destroyWindow(window_name)
        if key in (27, ord("q"), ord("Q")):
            raise KeyboardInterrupt
    cv2.destroyAllWindows()
    if build_error is not None:
        raise build_error
    print("Tam diem da tham gia tinh; sai so tren diem fit KHONG chung minh do chinh xac toan bai.")
    print("Chi kich hoat neu vach son vung trai/giua/phai da khop. Sau do khoi dong LAI runtime.")
    answer = input("Go AP DUNG de thay calibration; Enter hoac bat ky noi dung khac de giu ban cu: ").strip().upper()
    if answer != "AP DUNG":
        print("Da giu ban nhap; calibration cu KHONG thay doi.")
        return
    approve_rectangle_line_calibration(workspace / "calibration_draft.json", args.output.resolve())
    print(f"Da kich hoat ban da xem: {args.output.resolve()}")


def make_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Build a two-camera cm map from one shared measured rectangle"
    )
    parser.add_argument("--cam1-url", default=DEFAULT_CAM1_URL)
    parser.add_argument("--cam2-url", default=DEFAULT_CAM2_URL)
    parser.add_argument(
        "--workspace",
        type=Path,
        default=PROJECT_ROOT / "config" / "shared_map_01",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=PROJECT_ROOT / "config" / "two_camera.shared_cm.json",
    )
    parser.add_argument(
        "--coverage-cam1",
        type=Path,
        default=PROJECT_ROOT / "config" / "roi_mask_cam1.json",
    )
    parser.add_argument(
        "--coverage-cam2",
        type=Path,
        default=PROJECT_ROOT / "config" / "roi_mask_cam2.json",
    )
    parser.add_argument(
        "--slots-cam1",
        type=Path,
        default=PROJECT_ROOT / "config" / "parking_slots_cam1.json",
    )
    parser.add_argument(
        "--slots-cam2",
        type=Path,
        default=PROJECT_ROOT / "config" / "parking_slots_cam2.json",
    )
    parser.add_argument("--warmup-frames", type=int, default=15)
    parser.add_argument(
        "--resume",
        type=Path,
        help="Tiep tuc mot attempt cu, dung lai dung capture da dong bang",
    )
    parser.add_argument(
        "--max-validation-error-cm",
        type=float,
        default=2.0,
        help="Sai so cm toi da cua 8 cap fit va goc A-D; khong phai do chinh xac kiem chung",
    )
    parser.add_argument(
        "--show-full-diagnostic",
        action="store_true",
        help="Mo them full-frame diagnostic; anh nay khong phai map runtime",
    )
    return parser


def main() -> int:
    args = make_parser().parse_args()
    try:
        run(args)
    except KeyboardInterrupt:
        cv2.destroyAllWindows()
        print("Da huy hieu chuan; chua dung map moi.")
        return 130
    except Exception as exc:
        cv2.destroyAllWindows()
        print(f"Khong the dung map: {exc}")
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
