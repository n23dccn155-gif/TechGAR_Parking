"""B1 — test M1 thuan (SPEC_M1_detect_dump.md §6).

Khong doc video, khong runtime: dung frame tong hop + dataclass, chay nhanh (< 1 s,
RAM thap). Test nao can video that thi danh dau `video` va bo qua khi thieu file.
"""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pytest

from techgar.core2.config import Core2Config, M1Config, M1OwnerConfig
from techgar.core2.detect import CameraDetector, MotionEcho
from techgar.core2.owner import ground_owner_split

ROOT = Path(__file__).resolve().parents[4]
RUNS = ROOT / "sim3d/data/runs"


# ------------------------------------------------------------------ config
def test_config_defaults_validate_and_have_single_home():
    config = Core2Config()
    config.validate()
    assert config.m1.min_area_px == 650
    assert config.m2.car_width_cm == 4.2
    assert config.m1_owner.owner_ground_separation_cm == 4.2
    # moi tham so co nguon: validate tu choi gia tri vo nghia
    with pytest.raises(ValueError):
        Core2Config(m1=M1Config(min_area_px=0)).validate()
    with pytest.raises(ValueError):
        Core2Config(m1=M1Config(shadow_sample_cap=10)).validate()
    with pytest.raises(ValueError):
        Core2Config(m2=type(config.m2)(car_width_cm=0.0)).validate()


def test_mog_kwargs_come_from_config():
    config = M1Config(mog_history=500, mog_var_threshold=40)
    assert config.mog_kwargs() == {"history": 500, "varThreshold": 40,
                                   "detectShadows": True}


# ------------------------------------------------------------------ anchor
def test_anchor_is_bottom_center_not_bbox_center():
    """G1 quyet dinh A: Blob.xy = DAY-GIUA, khac tam bbox."""
    identity = np.eye(3)
    detector = CameraDetector(0, identity)
    box = (10, 10, 40, 20)              # x, y, w, h -> day-giua = (30, 30)
    bottom = detector.ground_point((box[0] + box[2] // 2, box[1] + box[3]))
    center = detector.ground_point((box[0] + box[2] / 2, box[1] + box[3] / 2))
    assert bottom == (30.0, 30.0)
    assert center == (30.0, 20.0)
    assert bottom != center


def test_ground_point_rejects_nonfinite():
    singular = np.array([[1.0, 0.0, 0.0], [0.0, 1.0, 0.0], [0.0, 0.0, 0.0]])
    detector = CameraDetector(0, singular)
    with pytest.raises(ValueError):
        detector.ground_point((5.0, 5.0))


def test_transform_must_be_3x3():
    with pytest.raises(ValueError):
        CameraDetector(0, np.eye(2))


# ------------------------------------------------------------------ M1 thuan
def test_step_never_reads_track_state():
    """M1 khong duoc co thuoc tinh vet nao: khong _tracks/_predictions/_next_id."""
    detector = CameraDetector(0, np.eye(3))
    for forbidden in ("_tracks", "_predictions", "_next_id", "_exited_tracks",
                      "occlusion_guard", "clean_observations"):
        assert not hasattr(detector, forbidden), forbidden


def test_owner_grounds_replace_priority_regions():
    """`priority_regions` cua binder duoc thay bang dau chan vet do ENGINE dua vao."""
    detector = CameraDetector(0, np.eye(3))
    mask_none = detector._priority_mask_from_grounds((400, 400), ())
    assert mask_none is None
    mask = detector._priority_mask_from_grounds((400, 400), ((200.0, 200.0),))
    assert mask is not None
    assert detector._box_is_priority(mask, (190, 190, 20, 20), (200, 210))


def test_no_frame_based_threshold_in_detector():
    """Dieu cam §7: khong nguong theo so frame.

    Kiem theo AST chu khong grep chuoi: comment giai thich "48 = long_frame_gap + 2"
    la hop le, nhung khong duoc co NGUONG tinh bang so frame.
    """
    import ast
    source = Path(__file__).resolve().parents[2] / "src/techgar/core2/detect.py"
    tree = ast.parse(source.read_text(encoding="utf-8"))
    names = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Assign):
            for target in node.targets:
                if isinstance(target, ast.Attribute):
                    names.add(target.attr)
                elif isinstance(target, ast.Name):
                    names.add(target.id)
        elif isinstance(node, ast.arg):
            names.add(node.arg)
    for forbidden in ("frame_gap", "lost_track_ttl", "min_visible_count",
                      "motion_frame_gap", "max_invisible"):
        assert forbidden not in names, f"nguong theo frame: {forbidden}"


# ------------------------------------------------------------------ hinh hoc thuan
def test_motion_echo_iou_and_gap():
    assert MotionEcho.iou((0, 0, 10, 10), (100, 100, 10, 10)) == 0.0
    assert 0.0 < MotionEcho.iou((0, 0, 10, 10), (5, 5, 10, 10)) < 1.0
    assert MotionEcho.box_gap((0, 0, 10, 10), (20, 0, 10, 10)) == 10.0
    assert MotionEcho.box_gap((0, 0, 10, 10), (0, 20, 10, 10)) == 10.0
    assert MotionEcho.box_gap((0, 0, 10, 10), (5, 5, 10, 10)) == 0.0


def test_ground_owner_split_uses_config():
    config = M1OwnerConfig(owner_ground_separation_cm=4.2)
    assert not ground_owner_split((0.0, 0.0), (3.0, 0.0), config)
    assert ground_owner_split((0.0, 0.0), (5.0, 0.0), config)
    loose = M1OwnerConfig(owner_ground_separation_cm=20.0)
    assert not ground_owner_split((0.0, 0.0), (15.0, 0.0), loose)


# ------------------------------------------------------------------ sensor tong hop
def _synthetic_camera(tmp_path, frames=40):
    """Chuoi frame co 1 hinh vuong sang di chuyen: khong can video that.

    Can >= ~10 frame de `_gray_history` co moc cach 0.25 s (6 frame @25fps)
    truoc khi cong chuyen dong bat dau co tac dung.
    """
    import cv2
    frames_list = []
    for index in range(frames):
        frame = np.full((240, 320, 3), 90, dtype=np.uint8)
        x = 60 + index * 4
        cv2.rectangle(frame, (x, 120), (x + 60, 180), (235, 235, 235), -1)
        frames_list.append(frame)
    return frames_list


def test_detector_finds_moving_square_and_matches_legacy_contract():
    frames = _synthetic_camera(None)
    detector = CameraDetector(0, np.eye(3), M1Config(min_area_px=200,
                                                     priority_min_area_px=150))
    rois = None
    found = []
    for index, frame in enumerate(frames):
        rois = detector.step(frame, index + 1, index / 25.0, owner_grounds=())
        found.extend(rois)
    assert found, "phai thay vat the chuyen dong"
    blob = found[-1]
    x, y, w, h = blob.bbox
    # anchor day-giua (identity transform nen = pixel)
    assert blob.xy == (float(x + w // 2), float(y + h))
    assert blob.cam == 0 and blob.area_px > 0
    assert 0.0 <= blob.roi_support <= 1.0


def test_detector_is_deterministic():
    frames = _synthetic_camera(None)
    def run():
        detector = CameraDetector(0, np.eye(3), M1Config(min_area_px=200,
                                                         priority_min_area_px=150))
        out = []
        for index, frame in enumerate(frames):
            out.extend(detector.step(frame, index + 1, index / 25.0))
        return out
    first, second = run(), run()
    assert first == second


def test_static_frame_yields_no_blob():
    """Frame dung yen: MOG2 khong co gi de bao => 0 blob (cong chuyen dong bat buoc)."""
    frame = np.full((240, 320, 3), 90, dtype=np.uint8)
    detector = CameraDetector(0, np.eye(3), M1Config(min_area_px=200))
    blobs = []
    for index in range(5):
        blobs = detector.step(frame, index + 1, index / 25.0)
    assert blobs == []


def test_roi_change_resets_background():
    from techgar.core2.detect import CameraDetector as Detector
    detector = Detector(0, np.eye(3))
    first = detector.bg_sub
    mask = np.zeros((240, 320), dtype=np.uint8)
    mask[50:200, 40:300] = 255
    detector.set_roi(mask)
    assert detector.bg_sub is not first
    assert detector._gray_history == []


# ------------------------------------------------------------------ video that (tuy chon)
# CHOT CHAN TEST: truoc day test nay mo video `sang_5p` (run TEST). Nay dung run
# TRAIN `20261106-131804_sang_20p` (VAL la 20% cuoi, phan con lai la TRAIN).
TRAIN_VIDEO_RUN = RUNS / "20261106-131804_sang_20p"


@pytest.mark.skipif(not TRAIN_VIDEO_RUN.is_dir(),
                    reason="khong co video TRAIN 20261106-131804_sang_20p")
def test_real_video_blob_budget():
    """Do tren video that (run TRAIN): so blob/frame phai cung bac voi legacy."""
    import cv2
    run = TRAIN_VIDEO_RUN
    calibration = json.loads(
        (run / "techgar_config/calibration.json").read_text(encoding="utf-8"))
    cap = cv2.VideoCapture(str(run / "raw_cam1.mp4"))
    assert cap.isOpened()
    cap.set(cv2.CAP_PROP_POS_FRAMES, 493)
    detector = CameraDetector(0, calibration["camera_transforms"]["cam1"])
    counts = []
    for index in range(40):
        ok, frame = cap.read()
        if not ok:
            break
        blobs = detector.step(frame, index + 1, index / 25.0)
        if index >= 20:
            counts.append(len(blobs))
    cap.release()
    assert counts, "phai doc duoc frame"
    assert np.mean(counts) < 25, f"qua nhieu blob: {np.mean(counts):.2f}"
