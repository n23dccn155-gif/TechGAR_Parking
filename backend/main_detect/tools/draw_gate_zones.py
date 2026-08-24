"""Draw entry/exit lines on a camera frame and save them in shared-world coordinates.

For each gate, click endpoint 1, endpoint 2, then one point on the side that
the vehicle enters after a valid crossing. Right click undoes the last point.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import cv2
import numpy as np


def capture_frame(source: str) -> np.ndarray:
    path = Path(source)
    if path.exists() and path.suffix.lower() in {".jpg", ".jpeg", ".png", ".bmp"}:
        encoded = np.frombuffer(path.read_bytes(), dtype=np.uint8)
        frame = cv2.imdecode(encoded, cv2.IMREAD_COLOR)
        if frame is None:
            raise RuntimeError(f"Khong doc duoc anh: {path}")
        return frame
    capture = cv2.VideoCapture(source)
    try:
        if not capture.isOpened():
            raise RuntimeError(f"Khong mo duoc nguon camera/video: {source}")
        frame = None
        for _ in range(15):
            ok, candidate = capture.read()
            if ok and candidate is not None:
                frame = candidate
        if frame is None:
            raise RuntimeError(f"Khong doc duoc frame: {source}")
        return frame
    finally:
        capture.release()


def select_gate(frame: np.ndarray, name: str) -> list[tuple[int, int]]:
    points: list[tuple[int, int]] = []

    def on_mouse(event, x, y, _flags, _userdata):
        if event == cv2.EVENT_LBUTTONDOWN and len(points) < 3:
            points.append((int(x), int(y)))
        elif event == cv2.EVENT_RBUTTONDOWN and points:
            points.pop()

    window = f"TechGAR gate calibration - {name}"
    cv2.namedWindow(window, cv2.WINDOW_NORMAL)
    cv2.setMouseCallback(window, on_mouse)
    while True:
        preview = frame.copy()
        labels = ("P1", "P2", "accepted side")
        for index, point in enumerate(points):
            cv2.circle(preview, point, 7, (0, 255, 255), -1)
            cv2.putText(preview, labels[index], (point[0] + 8, point[1] - 8), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 255), 2)
        if len(points) >= 2:
            cv2.line(preview, points[0], points[1], (0, 200, 255), 3)
        next_label = labels[len(points)] if len(points) < 3 else "Enter to confirm"
        cv2.putText(preview, f"{name}: click {next_label}; right-click undo", (12, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.65, (0, 255, 255), 2)
        cv2.imshow(window, preview)
        key = cv2.waitKey(20) & 0xFF
        if key in (27, ord("q")):
            raise KeyboardInterrupt
        if key in (13, 10) and len(points) == 3:
            cv2.destroyWindow(window)
            return points


def to_world(points: list[tuple[int, int]], homography: np.ndarray) -> np.ndarray:
    source = np.asarray(points, dtype=np.float64).reshape(-1, 1, 2)
    result = cv2.perspectiveTransform(source, homography).reshape(-1, 2)
    if not np.all(np.isfinite(result)):
        raise ValueError("Gate projection produced a non-finite coordinate")
    return result


def gate_payload(name: str, points: np.ndarray) -> dict:
    p1, p2, accepted = points
    side = (p2[0] - p1[0]) * (accepted[1] - p1[1]) - (p2[1] - p1[1]) * (accepted[0] - p1[0])
    if abs(float(side)) < 1e-9:
        raise ValueError(f"Accepted-side point for {name} cannot lie on the gate line")
    return {
        "name": name,
        "p1": {"x": round(float(p1[0]), 4), "y": round(float(p1[1]), 4)},
        "p2": {"x": round(float(p2[0]), 4), "y": round(float(p2[1]), 4)},
        "direction": "negative" if side > 0 else "positive",
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Draw physical gate lines in the TechGAR shared-world map")
    parser.add_argument("--source", required=True, help="Camera URL, video, or captured image")
    parser.add_argument("--camera", required=True, choices=("cam1", "cam2"))
    parser.add_argument("--calibration", required=True, type=Path)
    parser.add_argument("--output", type=Path, default=Path(__file__).parents[1] / "config" / "gate_zones.json")
    parser.add_argument("--overwrite", action="store_true")
    args = parser.parse_args()
    if args.output.exists() and not args.overwrite:
        raise FileExistsError(f"{args.output} already exists; pass --overwrite to replace it")

    calibration = json.loads(args.calibration.read_text(encoding="utf-8"))
    transform = np.asarray(calibration["camera_transforms"][args.camera], dtype=np.float64)
    if transform.shape != (3, 3):
        raise ValueError("Camera transform must be a 3x3 homography")
    frame = capture_frame(args.source)
    try:
        entry = to_world(select_gate(frame, "ENTRY"), transform)
        exit_gate = to_world(select_gate(frame, "EXIT"), transform)
    finally:
        cv2.destroyAllWindows()

    payload = {
        "schema_version": 1,
        "coordinate_space": "world",
        "unit": calibration.get("world", {}).get("unit", "source_video_pixel"),
        "source_camera": args.camera,
        "entry_gate": gate_payload("entry_gate", entry),
        "exit_gate": gate_payload("exit_gate", exit_gate),
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    temporary = args.output.with_suffix(args.output.suffix + ".tmp")
    temporary.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    temporary.replace(args.output)
    print(f"Da ghi gate config: {args.output.resolve()}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
