"""Test cho ``sim3d/tools/m1_track_eval.py`` trên dữ liệu tổng hợp nhỏ (P15b)."""

from __future__ import annotations

import csv
import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import m1_eval
import m1_track_eval

CAMS = ("cam1", "cam2")


def _write_run(
    tmp_path: Path,
    *,
    gt: dict[str, dict[int, tuple[float, float, str]]],
    events: list[dict[str, object]] | None = None,
    predictions: list[dict[str, object]] | None = None,
    image_size: tuple[int, int] = (400, 640),
    mask_polygon: list[dict[str, float]] | None = None,
    manifest: dict[str, object] | None = None,
    name: str = "run",
) -> Path:
    """Run tổng hợp: gt_frames.csv có cột xe, mask, MANIFEST, predictions."""
    run = tmp_path / name
    (run / "m1" / "session").mkdir(parents=True)
    (run / "techgar_config").mkdir(parents=True)

    cars = sorted(gt)
    frames = sorted({frame for per_car in gt.values() for frame in per_car})
    header = ["frame"]
    for car in cars:
        header.extend([f"{car}_u", f"{car}_v", f"{car}_cams"])
    with (run / "gt_frames.csv").open("w", encoding="utf-8", newline="") as handle:
        writer = csv.writer(handle)
        writer.writerow(header)
        for frame in frames:
            row: list[object] = [frame]
            for car in cars:
                point = gt[car].get(frame)
                row.extend(["", "", ""] if point is None else [point[0], point[1], point[2]])
            writer.writerow(row)

    if events is not None:
        fields = [
            "car",
            "slot",
            "gate_in_frame",
            "parked_frame",
            "depart_frame",
            "cam2_to_cam1_overlap_enter",
            "gate_out_frame",
            "arrival_crosses_cameras",
            "initial_parked",
            "model",
            "color",
            "speed_kmh",
        ]
        with (run / "gt_events.csv").open("w", encoding="utf-8", newline="") as handle:
            writer = csv.DictWriter(handle, fieldnames=fields, restval="")
            writer.writeheader()
            for event in events:
                writer.writerow(event)

    width, height = image_size
    polygon = mask_polygon or [
        {"x": 0.0, "y": 0.0},
        {"x": float(width), "y": 0.0},
        {"x": float(width), "y": float(height)},
        {"x": 0.0, "y": float(height)},
    ]
    for cam in CAMS:
        (run / "techgar_config" / f"roi_mask_{cam}.json").write_text(
            json.dumps({"polygon": polygon, "image_size": [width, height]}),
            encoding="utf-8",
        )

    payload = {"image_size": [width, height]}
    if manifest:
        payload.update(manifest)
    (run / "techgar_config" / "MANIFEST.json").write_text(
        json.dumps(payload), encoding="utf-8"
    )

    with (run / "m1" / "session" / "predictions.jsonl").open("w", encoding="utf-8") as handle:
        for record in predictions or []:
            handle.write(json.dumps(record, ensure_ascii=False) + "\n")
    return run


def _obs(
    *,
    cam: str = "cam1",
    x: float,
    y: float,
    gid: str | None = None,
    local: int | None = 1,
    velocity: tuple[float, float] = (1.0, 0.0),
    kind: str = "detection",
) -> dict[str, object]:
    return {
        "camera_id": cam,
        "observation_kind": kind,
        "anchor_pixel": {"x": x, "y": y, "reference": "tracker_center"},
        "velocity_px_per_frame": list(velocity),
        "canonical_gid": gid,
        "local_track_id": local,
    }


def _pred(frame: int, observations: list[dict[str, object]]) -> dict[str, object]:
    """``frame`` là frame GT 0-based; predictions dùng ``frame_idx`` 1-based."""
    return {"frame_idx": frame + 1, "observations": observations}


# ---------------------------------------------------------------------------------------
# Recall xe-frame (giữ định nghĩa recall_probe)
# ---------------------------------------------------------------------------------------
def test_frame_recall_dem_xe_frame_dang_chay(tmp_path: Path) -> None:
    run = _write_run(
        tmp_path,
        gt={"V001": {frame: (100.0 + 10 * frame, 200.0, "cam1") for frame in range(4)}},
        predictions=[
            _pred(1, [_obs(x=110, y=200)]),
            # Observation đứng yên không được tính là "đang chuyển động".
            _pred(2, [_obs(x=120, y=200, velocity=(0.0, 0.0))]),
        ],
    )

    result = m1_track_eval.evaluate_run(run)

    cam1 = result["frame_recall"]["cam1"]
    assert cam1["gt_moving_frames"] == 3, "3 frame sau đều dịch chuyển > 0,3 px"
    assert cam1["detected_moving_frames"] == 1
    assert cam1["detected_ratio"] == pytest.approx(1 / 3)
    assert cam1["gid_frames"] == 0
    assert result["frame_recall"]["cam2"]["gt_moving_frames"] == 0


def test_frame_recall_khong_tinh_xe_vang_mat_roi_hien_lai(tmp_path: Path) -> None:
    run = _write_run(
        tmp_path,
        gt={
            "V001": {
                0: (100.0, 200.0, "cam1"),
                3: (200.0, 200.0, "cam1"),  # vắng frame 1-2 rồi hiện lại chỗ khác
            }
        },
        predictions=[],
    )

    result = m1_track_eval.evaluate_run(run)

    assert result["frame_recall"]["cam1"]["gt_moving_frames"] == 0


# ---------------------------------------------------------------------------------------
# Đo theo xe: GID, đứt track
# ---------------------------------------------------------------------------------------
def test_per_car_co_gid_va_dem_dut_track(tmp_path: Path) -> None:
    run = _write_run(
        tmp_path,
        gt={"V001": {frame: (100.0 + 10 * frame, 200.0, "cam1") for frame in range(8)}},
        events=[
            {
                "car": "V001",
                "slot": "S001",
                "gate_in_frame": 0,
                "parked_frame": "",
                "depart_frame": "",
                "initial_parked": 0,
            }
        ],
        predictions=[
            _pred(1, [_obs(x=110, y=200, gid="G1", local=7)]),
            _pred(2, [_obs(x=120, y=200, gid="G1", local=7)]),
            # frame 3 mất dấu dù GT vẫn đang chạy trong mask
            _pred(4, [_obs(x=140, y=200, gid="G2", local=8)]),
            # frame 5 đổi local track (đứt track dù vẫn cùng GID)
            _pred(5, [_obs(x=150, y=200, gid="G2", local=9)]),
        ],
    )

    result = m1_track_eval.evaluate_run(run)
    per_car = result["per_car"]
    car = per_car["cars"][0]

    assert per_car["cars_measured"] == 1
    assert car["eligible_frames"] == 8
    assert car["matched_frames"] == 4
    assert car["has_gid"] is True
    assert car["gids"] == ["G1", "G2"]
    assert car["gid_frames"] == 4
    assert car["breaks"] == 2, "1 lần mất dấu (gap) + 1 lần đổi local track/GID"
    assert per_car["cars_with_gid"] == 1
    assert per_car["breaks_total"] == 2


def test_gid_tai_su_dung_cho_nhieu_xe(tmp_path: Path) -> None:
    run = _write_run(
        tmp_path,
        gt={
            "V001": {frame: (100.0 + 10 * frame, 200.0, "cam1") for frame in range(3)},
            "V002": {frame: (100.0 + 10 * frame, 300.0, "cam1") for frame in range(3, 6)},
        },
        events=[
            {"car": "V001", "slot": "S001", "gate_in_frame": 0, "initial_parked": 0},
            {"car": "V002", "slot": "S002", "gate_in_frame": 3, "initial_parked": 0},
        ],
        predictions=[
            _pred(1, [_obs(x=110, y=200, gid="G9", local=1)]),
            _pred(2, [_obs(x=120, y=200, gid="G9", local=1)]),
            _pred(4, [_obs(x=110, y=300, gid="G9", local=1)]),
            _pred(5, [_obs(x=120, y=300, gid="G9", local=1)]),
        ],
    )

    result = m1_track_eval.evaluate_run(run)
    per_car = result["per_car"]

    assert per_car["cars_with_gid"] == 2
    assert per_car["gid_reuse_count"] == 1
    assert per_car["gid_reuse"] == [{"gid": "G9", "cars": ["V001", "V002"]}]


def test_chi_tinh_doan_tuyen_trong_mask(tmp_path: Path) -> None:
    run = _write_run(
        tmp_path,
        gt={"V001": {frame: (300.0 + 10 * frame, 200.0, "cam1") for frame in range(3)}},
        events=[{"car": "V001", "slot": "S001", "gate_in_frame": 0, "initial_parked": 0}],
        predictions=[_pred(1, [_obs(x=310, y=200, gid="G1")])],
        # Mask chỉ phủ góc trên-trái; xe ở (300, 200) nằm ngoài.
        mask_polygon=[
            {"x": 0.0, "y": 0.0},
            {"x": 50.0, "y": 0.0},
            {"x": 50.0, "y": 50.0},
            {"x": 0.0, "y": 50.0},
        ],
    )

    result = m1_track_eval.evaluate_run(run)

    # Recall xe-frame không lọc mask (giữ đúng số director đo).
    assert result["frame_recall"]["cam1"]["gt_moving_frames"] == 2
    # Đo theo xe thì bỏ toàn bộ vì tuyến nằm ngoài mask.
    per_car = result["per_car"]
    assert per_car["cars_total"] == 1
    assert per_car["cars_measured"] == 0
    assert per_car["cars"][0]["eligible_frames"] == 0


def test_xe_do_san_chi_tinh_tu_luc_roi_o(tmp_path: Path) -> None:
    run = _write_run(
        tmp_path,
        gt={"V001": {frame: (100.0, 200.0, "cam1") for frame in range(6)}},
        events=[
            {
                "car": "V001",
                "slot": "S001",
                "gate_in_frame": "",
                "parked_frame": "",
                "depart_frame": 3,
                "initial_parked": 1,
            }
        ],
        predictions=[],
    )

    result = m1_track_eval.evaluate_run(run)

    assert result["per_car"]["cars"][0]["eligible_frames"] == 3, "chỉ frame 3,4,5"


# ---------------------------------------------------------------------------------------
# Hệ số ảnh s = 2 (MANIFEST)
# ---------------------------------------------------------------------------------------
def test_manifest_s2_gt_con_o_co_goc_thi_nhan_doi(tmp_path: Path) -> None:
    run = _write_run(
        tmp_path,
        gt={"V001": {frame: (100.0 + 10 * frame, 200.0, "cam1") for frame in range(4)}},
        events=[{"car": "V001", "slot": "S001", "gate_in_frame": 0, "initial_parked": 0}],
        predictions=[_pred(1, [_obs(x=220, y=400, gid="G1")])],
        image_size=(800, 1280),
        manifest={"s": 2},
    )

    result = m1_track_eval.evaluate_run(run)

    assert result["s"] == 2
    assert result["gt_pixel_scale"] == 2
    assert result["per_car"]["cars"][0]["matched_frames"] == 1
    assert result["frame_recall"]["cam1"]["detected_moving_frames"] == 1


def test_manifest_s2_gt_da_nhan_doi_thi_khong_nhan_lan_nua(tmp_path: Path) -> None:
    run = _write_run(
        tmp_path,
        gt={"V001": {frame: (700.0 + 20 * frame, 400.0, "cam1") for frame in range(4)}},
        events=[{"car": "V001", "slot": "S001", "gate_in_frame": 0, "initial_parked": 0}],
        predictions=[_pred(1, [_obs(x=720, y=400, gid="G1")])],
        image_size=(800, 1280),
        manifest={"s": 2},
    )

    result = m1_track_eval.evaluate_run(run)

    assert result["gt_pixel_scale"] == 1
    assert result["per_car"]["cars"][0]["matched_frames"] == 1


# ---------------------------------------------------------------------------------------
# P25 — bù crop cam2: GT ở khung ĐẦY ĐỦ, obs + ROI ở khung ĐÃ CẮT
# ---------------------------------------------------------------------------------------
#: Điểm kiểm chuẩn (V046, frame 2284 của run sang_5p), số liệu gốc do coders-3 xác nhận:
#:   gt_frames.csv V046_u = 275, V046_v = 218  (khung đầy đủ 400×640)
#:   MANIFEST gt_pixel_scale = 2  ⇒ GT full = (550, 436)
#:   obs cam1 = (527, 451) · obs cam2 = (47, 451)  (obs cam2 ở khung ĐÃ CẮT)
#:   ⇒ cam2 GT local = (275 - 240) * 2 = 70 ; obs 47 + 240*2 = 527 ⇒ lệch ~23 px
V046_U_RAW = 275.0
V046_V_RAW = 218.0
GT_FULL_X = 550.0          # (275 - 0) * 2
GT_FULL_Y = 436.0          # 218 * 2
GT_CAM2_LOCAL_X = 70.0     # (275 - 240) * 2
OBS_CAM2_X = 47.0          # obs cam2 thật ở khung cắt
OBS_CAM1_X = 527.0
OBS_Y = 451.0
CROP_CAM2_PX = 240.0
SCALE = 2.0


def test_crop_cam2_gt_dua_ve_khung_cat_va_khop_obs(tmp_path: Path) -> None:
    """GT cam2 phải thành ``(275-240)*2 = 70``, khớp obs cam2 = 47 (lệch ~23 px)."""
    frames = list(range(4))
    run = _write_run(
        tmp_path,
        gt={
            "V046": {
                frame: (V046_U_RAW + frame * 5.0, V046_V_RAW, "cam2") for frame in frames
            }
        },
        events=[{"car": "V046", "slot": "S046", "gate_in_frame": 0, "initial_parked": 0}],
        predictions=[
            _pred(1, [_obs(cam="cam2", x=OBS_CAM2_X, y=OBS_Y, gid="8", local=3)])
        ],
        image_size=(800, 1280),
        manifest={"s": SCALE, "gt_pixel_scale": SCALE},
    )

    result = m1_track_eval.evaluate_run(run)
    car = result["per_car"]["cars"][0]

    assert car["matched_frames"] == 1, (
        "GT cam2 phải được đưa về khung cắt (70) thì mới khớp obs 47; "
        "nếu giữ khung đầy đủ (550) thì lệch 503 px và không khớp"
    )
    assert car["gids"] == ["8"]


def test_crop_cam2_legacy_giu_gt_o_khung_day_du_thi_khong_khop(tmp_path: Path) -> None:
    """``--legacy-no-crop-offset``: GT giữ 550 ⇒ so với obs 47 lệch 503 px, không khớp."""
    frames = list(range(4))
    run = _write_run(
        tmp_path,
        gt={
            "V046": {
                frame: (V046_U_RAW + frame * 5.0, V046_V_RAW, "cam2") for frame in frames
            }
        },
        events=[{"car": "V046", "slot": "S046", "gate_in_frame": 0, "initial_parked": 0}],
        predictions=[
            _pred(1, [_obs(cam="cam2", x=OBS_CAM2_X, y=OBS_Y, gid="8", local=3)])
        ],
        image_size=(800, 1280),
        manifest={"s": SCALE, "gt_pixel_scale": SCALE},
    )

    result = m1_track_eval.evaluate_run(run, crop_offset=False)

    assert result["per_car"]["cars"][0]["matched_frames"] == 0


def test_crop_cam1_khong_doi_vi_crop_bat_dau_tu_0(tmp_path: Path) -> None:
    """cam1 cắt từ x=0 ⇒ GT giữ nguyên 550, khớp obs cam1 527 (lệch 23 px) ở cả 2 chế độ."""
    frames = list(range(4))
    run = _write_run(
        tmp_path,
        gt={
            "V046": {
                frame: (V046_U_RAW + frame * 5.0, V046_V_RAW, "cam1") for frame in frames
            }
        },
        events=[{"car": "V046", "slot": "S046", "gate_in_frame": 0, "initial_parked": 0}],
        predictions=[
            _pred(1, [_obs(cam="cam1", x=OBS_CAM1_X, y=OBS_Y, gid="8", local=3)])
        ],
        image_size=(800, 1280),
        manifest={"s": SCALE, "gt_pixel_scale": SCALE},
    )

    fixed = m1_track_eval.evaluate_run(run)
    legacy = m1_track_eval.evaluate_run(run, crop_offset=False)

    assert fixed["per_car"]["cars"][0]["matched_frames"] == 1
    assert legacy["per_car"]["cars"][0]["matched_frames"] == 1
    assert fixed["per_car"] == legacy["per_car"], "cam1 (crop=0) phải giống hệt nhau"


def test_crop_cam2_mask_la_khung_cat_nen_gt_sau_bu_van_nam_trong(tmp_path: Path) -> None:
    """ROI cam2 khai báo trong khung CẮT (x 0..800).

    GT sau khi bù về khung cắt (70) phải nằm trong mask ⇒ vẫn được tính là "đủ điều kiện".
    Nếu để GT ở khung đầy đủ (550) thì mask khung cắt vẫn chứa (vì 550 < 800) — nên test này
    khoá lại rằng mask KHÔNG bị dịch, tức GT được dịch chứ không phải mask.
    """
    frames = list(range(4))
    run = _write_run(
        tmp_path,
        gt={
            "V046": {
                frame: (V046_U_RAW + frame * 5.0, V046_V_RAW, "cam2") for frame in frames
            }
        },
        events=[{"car": "V046", "slot": "S046", "gate_in_frame": 0, "initial_parked": 0}],
        predictions=[
            _pred(1, [_obs(cam="cam2", x=OBS_CAM2_X, y=OBS_Y, gid="8")]),
            _pred(2, [_obs(cam="cam2", x=OBS_CAM2_X, y=OBS_Y, gid="8")]),
        ],
        image_size=(800, 1280),
        mask_polygon=[
            {"x": 0.0, "y": 0.0},
            {"x": 800.0, "y": 0.0},
            {"x": 800.0, "y": 1280.0},
            {"x": 0.0, "y": 1280.0},
        ],
        manifest={"s": SCALE, "gt_pixel_scale": SCALE},
    )

    result = m1_track_eval.evaluate_run(run)
    car = result["per_car"]["cars"][0]

    assert car["eligible_frames"] >= 1
    assert car["matched_frames"] == 2


def test_crop_hai_cam_cung_mot_xe_van_do_dung(tmp_path: Path) -> None:
    """Xe hiện trên cả 2 cam: cam1 dùng u full, cam2 dùng u đã trừ crop — cả hai phải khớp."""
    frames = list(range(4))
    run = _write_run(
        tmp_path,
        gt={
            "V046": {
                frame: (V046_U_RAW + frame * 5.0, V046_V_RAW, "cam1+cam2")
                for frame in frames
            }
        },
        events=[{"car": "V046", "slot": "S046", "gate_in_frame": 0, "initial_parked": 0}],
        predictions=[
            _pred(1, [
                _obs(cam="cam1", x=OBS_CAM1_X, y=OBS_Y, gid="8", local=1),
                _obs(cam="cam2", x=OBS_CAM2_X, y=OBS_Y, gid="8", local=2),
            ]),
            _pred(2, [
                _obs(cam="cam1", x=OBS_CAM1_X, y=OBS_Y, gid="8", local=1),
                _obs(cam="cam2", x=OBS_CAM2_X, y=OBS_Y, gid="8", local=2),
            ]),
        ],
        image_size=(800, 1280),
        manifest={"s": SCALE, "gt_pixel_scale": SCALE},
    )

    result = m1_track_eval.evaluate_run(run)
    car = result["per_car"]["cars"][0]

    # ``associate`` ghép MỘT observation cho mỗi xe mỗi frame (một-một), nên xe hiện trên 2 cam
    # chỉ được tính 1 lần/frame — đây là hạn chế đã biết của harness (coders-3 đã nêu ở P22).
    # Test này chỉ khoá lại rằng điểm cam2 (đã bù crop) VẪN khớp: nếu chỉ cam1 khớp thì
    # ``matched_frames`` cũng bằng 2, nên phải kiểm thêm rằng cam2 nằm trong ứng viên.
    assert car["matched_frames"] == 2
    # Kiểm trực tiếp phép ghép cho cam2: GT cam2 local (70) phải khớp obs (47) trong bán kính.
    gt_cam2 = (V046_U_RAW - CROP_CAM2_PX) * SCALE
    assert abs(gt_cam2 - OBS_CAM2_X) <= 30 * SCALE
    # Và bản legacy (không bù crop) thì GT cam2 = 550, lệch 503 px ⇒ không thể khớp cam2.
    legacy = m1_track_eval.evaluate_run(run, crop_offset=False)
    assert legacy["per_car"]["cars"][0]["matched_frames"] <= 2




def test_gt_scale_ep_bang_co_cli(tmp_path: Path) -> None:
    run = _write_run(
        tmp_path,
        gt={"V001": {frame: (100.0 + 10 * frame, 200.0, "cam1") for frame in range(3)}},
        events=[{"car": "V001", "slot": "S001", "gate_in_frame": 0, "initial_parked": 0}],
        predictions=[_pred(1, [_obs(x=220, y=400, gid="G1")])],
        image_size=(800, 1280),
        manifest={"s": 2},
    )

    result = m1_track_eval.evaluate_run(run, gt_scale=2.0)

    assert result["gt_pixel_scale"] == 2
    assert result["per_car"]["cars"][0]["matched_frames"] == 1


# ---------------------------------------------------------------------------------------
# Tích hợp m1_eval + CLI
# ---------------------------------------------------------------------------------------
def test_m1_eval_in_them_muc_track(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    run = _write_run(
        tmp_path,
        gt={"V001": {frame: (100.0 + 10 * frame, 200.0, "cam1") for frame in range(4)}},
        events=[{"car": "V001", "slot": "S001", "gate_in_frame": 0, "initial_parked": 0}],
        predictions=[_pred(1, [_obs(x=110, y=200, gid="G1")])],
    )

    metrics = m1_eval.evaluate(run, "test")
    m1_eval.print_summary(metrics)

    assert metrics["track"]["frame_recall"]["cam1"]["detected_moving_frames"] == 1
    assert metrics["track"]["per_car"]["cars_with_gid"] == 1
    output = capsys.readouterr().out
    assert "Track (m1_track_eval" in output
    assert "xe-frame đang chạy" in output


def test_cli_ghi_json(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    run = _write_run(
        tmp_path,
        gt={"V001": {frame: (100.0 + 10 * frame, 200.0, "cam1") for frame in range(3)}},
        events=[{"car": "V001", "slot": "S001", "gate_in_frame": 0, "initial_parked": 0}],
        predictions=[],
    )
    out = tmp_path / "track.json"

    exit_code = m1_track_eval.main([str(run), "--json", str(out)])

    assert exit_code == 0
    stored = json.loads(out.read_text(encoding="utf-8"))
    assert stored["run"] == "run"
    assert "frame_recall" in stored
    assert "Theo xe" in capsys.readouterr().out


def test_cli_thieu_predictions_tra_loi_2(tmp_path: Path) -> None:
    run = _write_run(tmp_path, gt={}, predictions=[])

    exit_code = m1_track_eval.main(
        [str(run), "--predictions", str(tmp_path / "khong-co.jsonl")]
    )

    assert exit_code == 2
