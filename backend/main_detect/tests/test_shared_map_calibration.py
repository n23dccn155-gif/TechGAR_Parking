import argparse
import csv
import json

import cv2
import numpy as np
import pytest

from calibrate_map import (
    _make_rows,
    _pixel_length,
    _predict_cam2_point,
    _validation_points_are_spread,
)
from tools.calibrate_shared_map import (
    CSV_FIELDS,
    PAIRED_POINTS_NAME,
    build_command,
    calibration_extrapolation_ratio,
    compute_homography,
    compute_distributed_shared_homographies,
    convex_intersection,
    cross_camera_validation_diagnostics,
    cross_camera_validation_spread,
    distributed_fit_coverage,
    load_coverage_pixels,
    load_parking_slots_world,
    read_image,
    write_image,
)


def test_image_io_supports_unicode_paths(tmp_path):
    image_path = tmp_path / "Hiệp" / "capture_cam1.png"
    image_path.parent.mkdir()
    expected = np.full((4, 6, 3), (40, 120, 200), dtype=np.uint8)

    assert write_image(image_path, expected)
    actual = read_image(image_path)

    assert actual is not None
    assert np.array_equal(actual, expected)


def test_easy_calibration_generates_shared_origin_from_rectangle_lengths():
    points = {
        "cam1": [(10, 20), (110, 20), (110, 70), (10, 70)],
        "cam2": [(30, 40), (230, 50), (210, 150), (20, 130)],
    }

    rows = _make_rows(points, ab_cm=40.0, ad_cm=25.0)
    worlds = {
        camera: {
            row["label"]: (row["world_x_cm"], row["world_y_cm"])
            for row in rows
            if row["camera"] == camera
        }
        for camera in ("cam1", "cam2")
    }

    expected = {
        "A": (0.0, 0.0),
        "B": (40.0, 0.0),
        "C": (40.0, 25.0),
        "D": (0.0, 25.0),
    }
    assert worlds["cam1"] == expected
    assert worlds["cam2"] == expected
    assert _pixel_length((0, 0), (3, 4)) == 5.0


def test_validation_click_is_guided_by_the_selected_corner_homography():
    points = {
        "cam1": [(0, 0), (100, 0), (100, 100), (0, 100), (25, 50)],
        "cam2": [(20, 10), (220, 10), (220, 210), (20, 210)],
    }

    predicted = _predict_cam2_point(points)

    assert predicted is not None
    assert np.allclose(predicted, (70, 110), atol=1e-4)


def test_validation_points_must_cover_both_image_dimensions():
    image = np.zeros((720, 1280, 3), dtype=np.uint8)

    assert not _validation_points_are_spread(
        [(200, 100), (600, 105), (1000, 110)], image
    )
    assert _validation_points_are_spread(
        [(200, 100), (1000, 160), (600, 600)], image
    )


def test_compute_homography_maps_camera_points_to_centimetres():
    measurements = [
        {"label": "A", "pixel": (0, 0), "world": (10, 20)},
        {"label": "B", "pixel": (100, 0), "world": (60, 20)},
        {"label": "C", "pixel": (100, 100), "world": (60, 70)},
        {"label": "D", "pixel": (0, 100), "world": (10, 70)},
        {"label": "M", "pixel": (50, 50), "world": (35, 45)},
    ]

    homography, diagnostics = compute_homography(measurements)
    mapped = homography @ np.array([20.0, 40.0, 1.0])
    mapped = mapped[:2] / mapped[2]

    assert np.allclose(mapped, [20.0, 40.0], atol=1e-3)
    assert diagnostics["rms_error_cm"] < 1e-3
    assert diagnostics["inlier_count"] == 5


def _distributed_fixture():
    cam1 = np.asarray([
        [900, 100], [1100, 100], [1100, 300], [900, 300],
        [120, 120], [350, 160], [600, 130], [780, 180],
        [150, 520], [400, 560], [650, 500], [820, 540],
    ], dtype=np.float64)
    cam2_to_cam1 = np.asarray([
        [1.04, 0.03, 180.0], [-0.02, 0.98, 25.0], [0.00008, -0.00004, 1.0]
    ])
    cam2 = cv2.perspectiveTransform(
        cam1.reshape(-1, 1, 2).astype(np.float32),
        np.linalg.inv(cam2_to_cam1),
    ).reshape(-1, 2)
    labels = ["A", "B", "C", "D", *[f"P{i}" for i in range(1, 9)]]
    fit = [
        {"label": label, "cam1": first, "cam2": second}
        for label, first, second in zip(labels, cam1, cam2)
    ]
    world = {"A": (0, 0), "B": (20, 0), "C": (20, 30), "D": (0, 30)}
    measurements = {
        camera_id: [
            {"label": label, "pixel": tuple(pair[camera_id]), "world": world[label]}
            for label, pair in zip(labels[:4], fit[:4])
        ]
        for camera_id in ("cam1", "cam2")
    }
    return fit, measurements, cam2_to_cam1


def test_distributed_pairs_fit_the_whole_ground_relation_and_keep_ab_ad_metric():
    fit, measurements, expected_relative = _distributed_fixture()

    transforms, diagnostics, relative = compute_distributed_shared_homographies(
        measurements, fit, {"cam1": (1280, 720), "cam2": (1280, 720)}
    )

    actual_relative = np.linalg.inv(transforms["cam1"]) @ transforms["cam2"]
    actual_relative /= actual_relative[2, 2]
    expected_relative /= expected_relative[2, 2]
    assert np.allclose(actual_relative, expected_relative, atol=1e-3)
    assert relative["inlier_count"] == 12
    assert relative["rms_symmetric_pixel_error"] < 0.01
    assert diagnostics["cam1"]["rms_error_cm"] < 0.01
    assert diagnostics["cam2"]["rms_error_cm"] < 0.01


def test_distributed_fit_coverage_detects_points_clustered_away_from_left_side():
    fit, _measurements, _relative = _distributed_fixture()
    validation = [
        {"label": f"V{i}", "cam1": np.asarray([20 + i, 650]), "cam2": np.asarray([20 + i, 650])}
        for i in range(1, 7)
    ]
    coverage = distributed_fit_coverage(
        fit, validation, [pair["label"] for pair in fit if pair["cam1"][0] > 700]
    )
    assert coverage["minimum_ratio"] < 0.60


def test_coverage_polygon_scales_only_for_same_aspect_ratio(tmp_path):
    mask = tmp_path / "mask.json"
    mask.write_text(json.dumps({
        "image_size": [1280, 720],
        "polygon": [[0, 0], [1280, 0], [1280, 720], [0, 720]],
    }), encoding="utf-8")
    assert np.allclose(
        load_coverage_pixels(mask, (640, 360)),
        [[0, 0], [640, 0], [640, 360], [0, 360]],
    )
    with pytest.raises(ValueError, match="khac anh calibration"):
        load_coverage_pixels(mask, (640, 480))


def test_distributed_build_writes_schema_v5_and_validated_ground_overlap(tmp_path):
    fit, measurements, relative = _distributed_fixture()
    workspace = tmp_path / "attempt"
    workspace.mkdir()
    for camera_id in ("cam1", "cam2"):
        assert write_image(
            workspace / f"capture_{camera_id}.png",
            np.zeros((720, 1280, 3), dtype=np.uint8),
        )
    (workspace / "capture_manifest.json").write_text(json.dumps({
        "schema_version": 2,
        "calibration_id": "cal-test-distributed",
        "cameras": {
            camera_id: {
                "image": f"capture_{camera_id}.png", "width": 1280, "height": 720,
                "source": f"raw_{camera_id}.mp4",
            }
            for camera_id in ("cam1", "cam2")
        },
    }), encoding="utf-8")
    rows = []
    for camera_id in ("cam1", "cam2"):
        for row in measurements[camera_id]:
            rows.append({
                "camera": camera_id,
                "label": row["label"],
                "pixel_x": row["pixel"][0],
                "pixel_y": row["pixel"][1],
                "world_x_cm": row["world"][0],
                "world_y_cm": row["world"][1],
            })
    with (workspace / "calibration_points.csv").open("w", newline="", encoding="utf-8-sig") as output:
        writer = csv.DictWriter(output, fieldnames=CSV_FIELDS)
        writer.writeheader()
        writer.writerows(rows)
    validation_cam1 = np.asarray([
        [160, 180], [210, 500], [500, 190], [570, 510], [880, 180], [960, 500]
    ], dtype=np.float64)
    validation_cam2 = cv2.perspectiveTransform(
        validation_cam1.reshape(-1, 1, 2).astype(np.float32),
        np.linalg.inv(relative),
    ).reshape(-1, 2)
    (workspace / PAIRED_POINTS_NAME).write_text(json.dumps({
        "schema_version": 2,
        "calibration_id": "cal-test-distributed",
        "fit_pairs": [
            {"label": pair["label"], "cam1": pair["cam1"].tolist(), "cam2": pair["cam2"].tolist()}
            for pair in fit
        ],
        "validation_pairs": [
            {"label": f"V{index}", "cam1": first.tolist(), "cam2": second.tolist()}
            for index, (first, second) in enumerate(zip(validation_cam1, validation_cam2), start=1)
        ],
    }), encoding="utf-8")
    mask = tmp_path / "mask.json"
    mask.write_text(json.dumps({
        "image_size": [1280, 720],
        "polygon": [[0, 0], [1279, 0], [1279, 719], [0, 719]],
    }), encoding="utf-8")
    destination = tmp_path / "shared_map_v5.json"
    build_command(argparse.Namespace(
        workspace=workspace, output=destination,
        coverage_cam1=mask, coverage_cam2=mask,
        slots_cam1=None, slots_cam2=None,
        ransac_threshold_cm=2.0, ransac_threshold_px=3.0,
        minimum_fit_inliers=8, minimum_fit_inlier_ratio=0.75,
        minimum_fit_coverage=0.60,
        max_rms_error_cm=3.0, allow_high_error=False,
        max_cross_camera_validation_error_cm=2.0,
        max_validation_pixel_p95=5.0, max_validation_pixel_error=8.0,
        allow_high_validation_error=False,
        handoff_match_distance_cm=15.0,
        handoff_prediction_radius_cm=25.0,
        dormant_match_distance_cm=35.0,
        overwrite=False,
    ))

    payload = json.loads(destination.read_text(encoding="utf-8"))
    assert payload["schema_version"] == 5
    assert payload["calibration_status"] == "passed"
    assert payload["calibration_id"] == "cal-test-distributed"
    assert len(payload["validated_ground_overlap_world_polygon"]) >= 3
    assert payload["calibration_quality"]["distributed_relative_fit"]["inlier_count"] == 12


def test_extrapolation_ratio_reports_active_roi_far_beyond_four_points():
    measurements = [
        {"pixel": point} for point in ((40, 40), (60, 40), (60, 60), (40, 60))
    ]
    full_roi = np.asarray(((0, 0), (100, 0), (100, 100), (0, 100)), np.float32)
    assert calibration_extrapolation_ratio(measurements, full_roi) == 25.0


def test_independent_pairs_expose_wrong_physical_correspondence():
    transforms = {
        "cam1": np.eye(3, dtype=np.float64),
        "cam2": np.asarray(((1, 0, 20), (0, 1, 0), (0, 0, 1)), np.float64),
    }
    pairs = [
        {"label": label, "cam1": np.asarray(point), "cam2": np.asarray(point)}
        for label, point in zip(("V1", "V2", "V3"), ((5, 5), (20, 10), (40, 30)))
    ]

    diagnostic = cross_camera_validation_diagnostics(pairs, transforms)

    assert diagnostic["point_count"] == 3
    assert diagnostic["p95_error_cm"] == 20.0


def test_independent_pairs_must_cover_two_dimensions():
    images = {
        "cam1": np.zeros((100, 100, 3), np.uint8),
        "cam2": np.zeros((100, 100, 3), np.uint8),
    }
    pairs = [
        {"label": label, "cam1": np.asarray(point), "cam2": np.asarray(point)}
        for label, point in zip(("V1", "V2", "V3"), ((10, 10), (50, 10), (90, 10)))
    ]

    diagnostic = cross_camera_validation_spread(pairs, images)

    assert diagnostic["min_hull_area_ratio"] == 0.0


def test_convex_intersection_returns_the_shared_camera_strip():
    cam1 = np.array([[0, 0], [60, 0], [60, 50], [0, 50]], np.float32)
    cam2 = np.array([[40, 0], [100, 0], [100, 50], [40, 50]], np.float32)

    area, overlap = convex_intersection(cam1, cam2)

    assert area == 1000.0
    assert np.isclose(overlap[:, 0].min(), 40.0)
    assert np.isclose(overlap[:, 0].max(), 60.0)


def test_parking_slots_are_scaled_and_projected_to_world(tmp_path):
    slots_path = tmp_path / "slots.json"
    slots_path.write_text(json.dumps({
        "imageWidth": 200,
        "imageHeight": 200,
        "slots": [{
            "id": "A01",
            "polygon": [
                {"x": 20, "y": 40},
                {"x": 60, "y": 40},
                {"x": 60, "y": 80},
                {"x": 20, "y": 80},
            ],
        }],
    }), encoding="utf-8")

    slots = load_parking_slots_world(slots_path, (100, 100), np.eye(3))

    assert slots[0]["id"] == "A01"
    assert np.allclose(
        slots[0]["polygon"],
        [[10, 20], [30, 20], [30, 40], [10, 40]],
    )


def test_build_command_creates_two_transforms_overlap_and_preview(tmp_path):
    workspace = tmp_path / "calibration"
    workspace.mkdir()
    (workspace / "capture_manifest.json").write_text(json.dumps({
        "schema_version": 1,
        "cameras": {
            "cam1": {"image": "capture_cam1.png", "width": 100, "height": 100},
            "cam2": {"image": "capture_cam2.png", "width": 100, "height": 100},
        },
    }), encoding="utf-8")
    assert write_image(
        workspace / "capture_cam1.png",
        np.full((100, 100, 3), (40, 120, 200), dtype=np.uint8),
    )
    assert write_image(
        workspace / "capture_cam2.png",
        np.full((100, 100, 3), (180, 100, 30), dtype=np.uint8),
    )
    rows = []
    for camera, labels, offset in (
        ("cam1", "ABCD", 0.0),
        ("cam2", "EFGH", 5.0),
    ):
        for label, (pixel_x, pixel_y) in zip(
            labels, ((0, 0), (100, 0), (100, 100), (0, 100))
        ):
            rows.append({
                "camera": camera,
                "label": label,
                "pixel_x": pixel_x,
                "pixel_y": pixel_y,
                "world_x_cm": offset + pixel_x / 10.0,
                "world_y_cm": pixel_y / 10.0,
            })
    with (workspace / "calibration_points.csv").open(
        "w", newline="", encoding="utf-8-sig"
    ) as output:
        writer = csv.DictWriter(output, fieldnames=CSV_FIELDS)
        writer.writeheader()
        writer.writerows(rows)

    coverage_cam1 = tmp_path / "coverage_cam1.json"
    coverage_cam2 = tmp_path / "coverage_cam2.json"
    coverage_cam1.write_text(json.dumps({
        "polygon": [[60, 0], [99, 0], [99, 99], [60, 99]],
    }), encoding="utf-8")
    coverage_cam2.write_text(json.dumps({
        "polygon": [[20, 0], [60, 0], [60, 99], [20, 99]],
    }), encoding="utf-8")

    (workspace / "cross_camera_validation_points.json").write_text(json.dumps({
        "schema_version": 1,
        "pairs": [
            {"label": "V1", "cam1": [70, 20], "cam2": [20, 20]},
            {"label": "V2", "cam1": [80, 50], "cam2": [30, 50]},
            {"label": "V3", "cam1": [60, 80], "cam2": [10, 80]},
        ],
    }), encoding="utf-8")

    destination = tmp_path / "shared_map.json"
    args = argparse.Namespace(
        workspace=workspace,
        output=destination,
        coverage_cam1=coverage_cam1,
        coverage_cam2=coverage_cam2,
        ransac_threshold_cm=2.0,
        max_rms_error_cm=3.0,
        allow_high_error=False,
        handoff_match_distance_cm=15.0,
        handoff_prediction_radius_cm=25.0,
        dormant_match_distance_cm=35.0,
        max_cross_camera_validation_error_cm=2.0,
        allow_high_validation_error=False,
        min_validation_area_ratio=0.01,
        allow_collinear_validation=False,
        overwrite=False,
    )
    build_command(args)

    payload = json.loads(destination.read_text(encoding="utf-8"))
    overlap = np.asarray(payload["overlap_world_polygon"])
    assert payload["world"]["unit"] == "cm"
    assert payload["tracking_defaults"]["shared_map_anchor"] == "bbox_center"
    assert set(payload["camera_transforms"]) == {"cam1", "cam2"}
    assert set(payload["camera_full_view_world"]) == {"cam1", "cam2"}
    assert np.isclose(overlap[:, 0].min(), 7.0, atol=0.1)
    assert np.isclose(overlap[:, 0].max(), 9.9, atol=0.1)
    quality = payload["calibration_quality"]
    assert quality["cameras"]["cam1"]["active_roi_to_calibration_area_ratio"] > 0
    assert quality["independent_cross_camera_validation"]["p95_error_cm"] == 0.0
    assert quality["full_view_overlap_area_cm2"] > quality["active_roi_overlap_area_cm2"]
    assert (workspace / "shared_map_full_view.png").is_file()
    assert (workspace / "shared_map_active_roi.png").is_file()
    assert (workspace / "shared_map_preview.png").is_file()

    (workspace / "cross_camera_validation_points.json").write_text(json.dumps({
        "schema_version": 1,
        "pairs": [
            {"label": "V1", "cam1": [70, 20], "cam2": [70, 20]},
            {"label": "V2", "cam1": [80, 50], "cam2": [80, 50]},
            {"label": "V3", "cam1": [60, 80], "cam2": [60, 80]},
        ],
    }), encoding="utf-8")
    args.output = tmp_path / "rejected_map.json"
    args.overwrite = True
    with pytest.raises(ValueError, match="model_inadequate"):
        build_command(args)
    assert not args.output.exists()
    assert (workspace / "calibration_draft.json").is_file()
