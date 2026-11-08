import json

import cv2
import numpy as np

from techgar.parking_detector import ParkingDetector
from two_camera import make_parser


def _detector(tmp_path, **kwargs):
    path = tmp_path / "slots.json"
    path.write_text(json.dumps({
        "imageWidth": 160, "imageHeight": 160,
        "slots": [{"id": "S001", "polygon": [
            {"x": 20, "y": 20}, {"x": 140, "y": 20},
            {"x": 140, "y": 140}, {"x": 20, "y": 140},
        ]}],
    }), encoding="utf-8")
    detector = ParkingDetector(str(path), core_scale=0.8, **kwargs)
    detector._compute_rois((160, 160, 3))
    return detector, detector._rois[0]


def _colored_car(dx=0):
    hsv = np.zeros((160, 160, 3), dtype=np.uint8)
    hsv[:, :] = (0, 0, 135)
    hsv[40:120, 45 + dx:115 + dx] = (110, 220, 120)
    hsv[55:100, 60 + dx:100 + dx] = (110, 220, 50)
    return cv2.cvtColor(hsv, cv2.COLOR_HSV2BGR)


def test_colored_low_texture_car_requires_two_stable_samples(tmp_path):
    detector, roi = _detector(tmp_path)
    image = _colored_car()
    assert not detector._has_static_color_rescue(image, roi)
    assert detector._has_static_color_rescue(image, roi)


def test_gray_or_uniform_colored_surface_is_not_rescued(tmp_path):
    detector, roi = _detector(tmp_path)
    gray = np.full((160, 160, 3), 100, dtype=np.uint8)
    assert not detector._has_static_color_rescue(gray, roi)
    hsv = np.full((160, 160, 3), (110, 220, 100), dtype=np.uint8)
    uniform = cv2.cvtColor(hsv, cv2.COLOR_HSV2BGR)
    assert not detector._has_static_color_rescue(uniform, roi)
    assert not detector._has_static_color_rescue(uniform, roi)


def test_spatially_moving_blob_is_not_yet_stable(tmp_path):
    detector, roi = _detector(tmp_path)
    assert not detector._has_static_color_rescue(_colored_car(-15), roi)
    assert not detector._has_static_color_rescue(_colored_car(15), roi)


def test_legacy_flag_disables_rescue_and_defaults_to_enabled(tmp_path):
    detector, _ = _detector(tmp_path, static_color_rescue=False)
    image = _colored_car()
    detector.detect(image, apply_smoothing=False)
    result = detector.detect(image, apply_smoothing=False)[0]
    assert result.evidence["static_color_rescue"] is False
    required = ["--slots-cam1", "one", "--slots-cam2", "two", "--calibration", "cal"]
    parser = make_parser()
    assert not parser.parse_args(required).legacy_static_color_rescue
    assert parser.parse_args(required + ["--legacy-static-color-rescue"]).legacy_static_color_rescue


def test_rescue_flows_through_temporal_confirmation_and_releases(tmp_path):
    detector, _ = _detector(tmp_path, stable_evidence=True)
    image = _colored_car()
    samples = []
    for frame, timestamp in enumerate((1.0, 1.52, 2.04), start=1):
        results = detector.detect(image, apply_smoothing=False)
        detector.accept_evidence(results, timestamp, frame)
        samples.append(results[0])
    assert samples[0].evidence["static_color_rescue"] is False
    assert samples[-1].evidence["static_color_rescue"] is True
    assert samples[-1].evidence["stable_occupied"] is True
    empty = np.full((160, 160, 3), 135, dtype=np.uint8)
    for frame, timestamp in enumerate((2.56, 3.08, 3.60, 4.12), start=4):
        results = detector.detect(empty, apply_smoothing=False)
        detector.accept_evidence(results, timestamp, frame)
    assert results[0].evidence["static_color_rescue"] is False
    assert results[0].evidence["stable_occupied"] is False
