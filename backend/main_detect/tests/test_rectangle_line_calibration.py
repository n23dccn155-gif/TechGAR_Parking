import argparse
import copy
import csv
import json
from pathlib import Path

import cv2
import numpy as np
import pytest

import calibrate_map as picker
from tools.calibrate_shared_map import (
    CSV_FIELDS, PAIRED_POINTS_NAME, _project, build_command,
    load_paired_ground_points, write_image,
)
from tools.rectangle_line_calibration import (
    LABELS, MODE, approve_rectangle_line_calibration,
    compute_rectangle_line_homographies, fit_gate,
)
from two_camera import load_calibration


def fixture(noisy=False, scale=1.0):
    first = np.array([[800, 200], [1000, 200], [1000, 400], [800, 400],
                      [150, 300], [450, 300], [700, 300], [1100, 300]], np.float64)
    relative = np.array([[-0.95, 0.03, 1200], [0.04, -0.98, 690],
                         [0.00005, 0.00003, 1]], np.float64)
    second = _project(first, np.linalg.inv(relative))
    if noisy:
        second[:4] += np.array([[1, -1], [-1, 2], [1, -2], [-1, 1]])
    first *= scale
    second *= scale
    pairs = [{"label": label, "cam1": p, "cam2": q} for label, p, q in zip(LABELS, first, second)]
    world = [[0, 0], [20, 0], [20, 30], [0, 30]]
    measurements = {camera: [{"label": p["label"], "pixel": p[camera], "world": w}
                             for p, w in zip(pairs[:4], world)] for camera in ("cam1", "cam2")}
    sizes = {camera: (int(1280 * scale), int(720 * scale)) for camera in measurements}
    return pairs, measurements, sizes, relative


def test_eight_pairs_include_collinear_v_and_keep_metric_rectangle():
    pairs, measurements, sizes, relative = fixture()
    h, d, r, report = compute_rectangle_line_homographies(measurements, pairs, sizes)
    assert r["inlier_count"] == 8
    assert r["method"] == "all_eight_pairs_least_squares"
    assert r["point_roles"]["V1"] == "line_correction"
    assert not report["independent_validation"]
    assert not fit_gate(report, d)
    assert np.allclose(np.asarray(r["cam2_to_cam1"]), relative, atol=0.002)
    for camera in measurements:
        assert np.allclose(_project([p[camera] for p in pairs[:4]], h[camera]),
                           [p["world"] for p in measurements[camera]], atol=0.001)


def test_lateral_points_improve_unseen_left_positions_with_noisy_small_rectangle():
    pairs, measurements, sizes, true_g = fixture(noisy=True)
    h, d, r, report = compute_rectangle_line_homographies(measurements, pairs, sizes)
    before, _ = cv2.findHomography(np.array([p["cam2"] for p in pairs[:4]]),
                                   np.array([p["cam1"] for p in pairs[:4]]), method=0)
    held_out = np.array([[200, 240], [350, 360], [580, 230], [1050, 370]], np.float64)
    observed = _project(held_out, np.linalg.inv(true_g))
    e_before = np.linalg.norm(_project(observed, before) - held_out, axis=1)
    e_after = np.linalg.norm(_project(observed, np.asarray(r["cam2_to_cam1"])) - held_out, axis=1)
    assert e_after.mean() < e_before.mean()
    assert not fit_gate(report, d)


def test_norm_thresholds_are_resolution_independent():
    p, m, s, _ = fixture(noisy=True)
    a = compute_rectangle_line_homographies(m, p, s)[3]
    p, m, s, _ = fixture(noisy=True, scale=0.5)
    b = compute_rectangle_line_homographies(m, p, s)[3]
    assert a["p95_symmetric_pixel_error"] == pytest.approx(b["p95_symmetric_pixel_error"], abs=0.002)


def test_wrong_line_pair_is_not_silently_removed_or_accepted():
    p, m, s, _ = fixture()
    p[5]["cam2"] = p[5]["cam2"] + [0, 45]
    _, diagnostics, r, report = compute_rectangle_line_homographies(m, p, s)
    assert r["inlier_count"] == 8
    assert len(r["points"]) == 8
    assert fit_gate(report, diagnostics)


@pytest.mark.parametrize("mutation", ["duplicate", "order", "world", "csv", "nonfinite"])
def test_invalid_inputs_are_rejected(mutation):
    p, m, s, _ = fixture()
    if mutation == "duplicate":
        p[5]["cam1"] = p[4]["cam1"].copy()
    elif mutation == "order":
        p[5]["cam2"], p[6]["cam2"] = p[6]["cam2"], p[5]["cam2"]
    elif mutation == "world":
        m["cam2"][1]["world"] = [21, 0]
    elif mutation == "csv":
        m["cam2"][1]["pixel"] = [10, 20]
    else:
        p[7]["cam1"] = [float("nan"), 0]
    if mutation == "order":
        _, diagnostics, _, report = compute_rectangle_line_homographies(m, p, s)
        assert fit_gate(report, diagnostics)
    else:
        with pytest.raises(ValueError):
            compute_rectangle_line_homographies(m, p, s)


def prepare_workspace(tmp_path, bad=False):
    p, m, s, _ = fixture()
    if bad:
        p[5]["cam2"] = p[5]["cam2"] + [0, 45]
    workspace = tmp_path / "attempt"
    workspace.mkdir()
    manifest = {"schema_version": 2, "calibration_id": "line-test", "cameras": {}}
    for camera in s:
        image = np.zeros((720, 1280, 3), np.uint8)
        for x in range(100, 1200, 100):
            cv2.line(image, (x, 100), (x, 650), (255, 255, 255), 2)
        write_image(workspace / f"capture_{camera}.png", image)
        manifest["cameras"][camera] = {"image": f"capture_{camera}.png", "width": 1280, "height": 720}
    (workspace / "capture_manifest.json").write_text(json.dumps(manifest), encoding="utf-8")
    (workspace / PAIRED_POINTS_NAME).write_text(json.dumps({
        "mode": MODE, "calibration_id": "line-test", "validation_pairs": [],
        "fit_pairs": [{"label": pair["label"], "cam1": pair["cam1"].tolist(),
                       "cam2": pair["cam2"].tolist()} for pair in p],
    }), encoding="utf-8")
    with (workspace / "calibration_points.csv").open("w", newline="", encoding="utf-8-sig") as f:
        writer = csv.DictWriter(f, fieldnames=CSV_FIELDS)
        writer.writeheader()
        for camera in m:
            for row in m[camera]:
                writer.writerow(dict(camera=camera, label=row["label"], pixel_x=row["pixel"][0],
                                     pixel_y=row["pixel"][1], world_x_cm=row["world"][0], world_y_cm=row["world"][1]))
    args = argparse.Namespace(workspace=workspace, output=tmp_path / "active.json", coverage_cam1=None,
                              coverage_cam2=None, slots_cam1=None, slots_cam2=None,
                              ransac_threshold_cm=2.0, max_rms_error_cm=3.0, allow_high_error=False,
                              max_cross_camera_validation_error_cm=2.0, handoff_match_distance_cm=15.0,
                              handoff_prediction_radius_cm=25.0, dormant_match_distance_cm=35.0, overwrite=True)
    return workspace, args


def test_draft_review_runtime_use_same_matrices_without_fake_validation(tmp_path, monkeypatch):
    workspace, args = prepare_workspace(tmp_path)
    from tools import calibrate_shared_map as shared
    original_draw = shared.draw_active_roi_preview
    preview_polygons = []
    def spy(*args, **kwargs):
        preview_polygons.append(np.asarray(args[4]).copy())
        return original_draw(*args, **kwargs)
    monkeypatch.setattr(shared, "draw_active_roi_preview", spy)
    args.output.write_text("existing calibration", encoding="utf-8")
    build_command(args)
    assert args.output.read_text() == "existing calibration"
    draft = workspace / "calibration_draft.json"
    data = json.loads(draft.read_text())
    assert data["calibration_status"] == "fit_ready"
    assert data["calibration_quality"]["independent_cross_camera_validation"] is None
    assert "validated_ground_overlap_world_polygon" not in data
    assert len(data["fitted_ground_overlap_world_polygon"]) >= 3
    with pytest.raises(ValueError):
        load_calibration(draft)
    approve_rectangle_line_calibration(draft, args.output)
    matrices, _, overlaps, _ = load_calibration(args.output)
    for camera in matrices:
        assert np.array_equal(matrices[camera], data["camera_transforms"][camera])
    assert np.allclose(overlaps[("cam1", "cam2")], data["fitted_ground_overlap_world_polygon"])
    assert len(preview_polygons) == 2
    for polygon in preview_polygons:
        assert np.allclose(polygon, overlaps[("cam1", "cam2")], atol=0.0001)
    assert json.loads(args.output.read_text())["calibration_status"] == "reviewed_fit"


def test_runtime_refuses_missing_support_or_fake_review(tmp_path):
    workspace, args = prepare_workspace(tmp_path)
    build_command(args)
    original = approve_rectangle_line_calibration(workspace / "calibration_draft.json", args.output)
    for mutation in ("missing_support", "unreviewed", "bad_report", "nan_matrix"):
        data = copy.deepcopy(original)
        if mutation == "missing_support":
            data.pop("fitted_ground_overlap_world_polygon")
        elif mutation == "unreviewed":
            data["visual_review"]["accepted"] = False
        elif mutation == "bad_report":
            data["calibration_quality"]["rectangle_line_fit"]["max_error_cm"] = float("nan")
        else:
            data["camera_transforms"]["cam1"][0][0] = float("nan")
        args.output.write_text(json.dumps(data), encoding="utf-8")
        with pytest.raises(ValueError):
            load_calibration(args.output)


def test_failed_fit_preserves_active_and_cannot_be_approved(tmp_path):
    workspace, args = prepare_workspace(tmp_path, bad=True)
    args.output.write_text("original", encoding="utf-8")
    with pytest.raises(ValueError, match="rectangle_line_model_inadequate"):
        build_command(args)
    assert args.output.read_text() == "original"
    with pytest.raises(ValueError):
        approve_rectangle_line_calibration(workspace / "calibration_draft.json", args.output)
    assert args.output.read_text() == "original"


def test_loader_does_not_reinterpret_old_validation_labels(tmp_path):
    workspace, _ = prepare_workspace(tmp_path)
    path = workspace / PAIRED_POINTS_NAME
    fit, validation, _ = load_paired_ground_points(path)
    assert len(fit) == 8 and validation == []
    data = json.loads(path.read_text())
    data.pop("mode")
    path.write_text(json.dumps(data))
    with pytest.raises(ValueError):
        load_paired_ground_points(path)


def test_picker_coordinates_footer_ignored_and_progress_saved(monkeypatch, tmp_path):
    images = {c: np.zeros((720, 1280, 3), np.uint8) for c in ("cam1", "cam2")}
    points = [(100, 100), (300, 100), (300, 300), (100, 300),
              (50, 400), (250, 400), (450, 400), (650, 400)]
    callback = {}
    monkeypatch.setattr(cv2, "namedWindow", lambda *a: None)
    monkeypatch.setattr(cv2, "setMouseCallback", lambda name, fn: callback.update(fn=fn))
    monkeypatch.setattr(cv2, "imshow", lambda *a: None)
    monkeypatch.setattr(cv2, "destroyWindow", lambda *a: None)
    events = iter([(c, p) for p in points for c in (0, 1)])
    def tick(*args):
        if args[0] == 350:
            return 0
        # Footer magnifier and outside-window clicks must not create points.
        callback["fn"](cv2.EVENT_LBUTTONDOWN, 10, 550, 0, None)
        callback["fn"](cv2.EVENT_LBUTTONDOWN, -10, 100, 0, None)
        try:
            camera, (x, y) = next(events)
        except StopIteration:
            return 13
        callback["fn"](cv2.EVENT_LBUTTONDOWN, camera * 720 + round(x * 720 / 1280),
                       78 + round(y * 405 / 720), 0, None)
        return 0
    monkeypatch.setattr(cv2, "waitKey", tick)
    path = tmp_path / "draft.json"
    fit, validation = picker.select_corresponding_points(images, draft_path=path)
    assert len(fit["cam1"]) == len(fit["cam2"]) == 8
    assert validation == {"cam1": [], "cam2": []}
    assert np.max(np.abs(np.asarray(fit["cam1"]) - points)) <= 1
    assert json.loads(path.read_text())["mode"] == MODE


def test_cancelling_resume_keeps_original_captures_and_points(monkeypatch, tmp_path):
    workspace, _ = prepare_workspace(tmp_path)
    original = {p.name: p.read_bytes() for p in workspace.iterdir()}
    def cancel(images, initial_points=None, draft_path=None):
        assert len(initial_points["cam1"]) == 8
        assert draft_path.parent != workspace
        raise KeyboardInterrupt
    monkeypatch.setattr(picker, "select_corresponding_points", cancel)
    monkeypatch.setattr(cv2, "destroyAllWindows", lambda: None)
    args = picker.make_parser().parse_args(["--resume", str(workspace), "--workspace", str(tmp_path / "new")])
    with pytest.raises(KeyboardInterrupt):
        picker.run(args)
    assert original == {p.name: p.read_bytes() for p in workspace.iterdir()}
