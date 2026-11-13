"""Regression gate tests use only an existing oracle dump's first 300 frames."""
from __future__ import annotations

import csv
import json
from pathlib import Path
import sys

import pytest


ROOT = Path(__file__).resolve().parents[4]
sys.path.insert(0, str(ROOT / ".orca/core2"))
from idf1_all_visible import match_frame, score_predictions, sim_to_world, state_at
from regress_gate import DEFAULT_ENGINE, make_factory, run_gate, parse_params
from techgar.core2.run_guard import skip_reason_if_test


def test_independent_visible_matching_and_identity_exclusivity():
    gt = [("V001", "cam1", (10., 20.)), ("V002", "cam1", (20., 20.))]
    detections = [(11, "cam1", (10., 20.), True),
                  (22, "cam1", (20., 20.), True),
                  (33, "cam2", (10., 20.), True)]
    assert match_frame(gt, detections) == {"V001": 11, "V002": 22}
    assert match_frame(gt, [(11, "cam1", (10., 20.), False)]) == {}


def test_gt_state_uses_parked_interval_and_displacement():
    meta = {"V001": {"initial_parked": "1", "depart_frame": "100"},
            "V002": {"initial_parked": "0", "parked_frame": "15", "depart_frame": "100"}}
    assert state_at(0, "V001", (0., 0.), {}, meta) == "parked"
    assert state_at(16, "V002", (0., 0.), {}, meta) == "parked"
    assert state_at(101, "V001", (0., 0.), {"V001": (0., 0.)}, meta) == "stopped"
    assert state_at(101, "V001", (1., 0.), {"V001": (0., 0.)}, meta) == "moving"


def test_engine_override_and_json_params():
    _, path = make_factory(DEFAULT_ENGINE, parse_params('{"wake_cm":3.5}'))
    assert path.is_file()
    _, wip = make_factory(".orca/core2/engine_l_wip.py:EngineLEngine", {"wake_cm": 3.5})
    assert wip.is_file()
    with pytest.raises(ValueError, match="unsupported EngineLParams"):
        make_factory(DEFAULT_ENGINE, {"made_up_flag": True})


def test_all_visible_perfect_independent_idf1_equals_one(tmp_path):
    config = tmp_path / "techgar_config"
    config.mkdir()
    (config / "calibration.json").write_text(json.dumps({
        "camera_transforms": {"cam1": [[1, 0, 0], [0, 1, 0], [0, 0, 1]]}
    }), encoding="utf-8")
    with (tmp_path / "gt_events.csv").open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=["car", "initial_parked", "parked_frame", "depart_frame"])
        writer.writeheader()
        writer.writerow({"car": "V001", "initial_parked": "1"})
        writer.writerow({"car": "V002", "initial_parked": "0"})
    pred_path = tmp_path / "predictions.jsonl"
    with (tmp_path / "gt_frames.csv").open("w", newline="", encoding="utf-8") as gt, \
            pred_path.open("w", encoding="utf-8") as pred:
        writer = csv.DictWriter(gt, fieldnames=["frame", "V001_cams", "V001_u", "V001_v",
                                                 "V002_cams", "V002_u", "V002_v"])
        writer.writeheader()
        for frame in range(3):
            writer.writerow({"frame": frame, "V001_cams": "cam1", "V001_u": 310,
                             "V001_v": 300, "V002_cams": "cam1", "V002_u": 330, "V002_v": 320})
            observations = []
            for car, gid, u, v in (("V001", 11, 310, 300), ("V002", 22, 330, 320)):
                x, y = sim_to_world(u, v)
                observations.append({"canonical_gid": gid, "bbox": [x - .5, y - .5, 1., 1.],
                                     "camera_id": "cam1", "prediction_source": "measurement"})
            pred.write(json.dumps({"frame_idx": frame + 1, "source_frame_idx": frame,
                                   "observations": observations}) + "\n")
    row = score_predictions(tmp_path, pred_path)
    assert row["IDF1_all_visible"] == 1.0
    assert row["all_visible_IDTP"] == 6
    assert row["recall_by_state"]["parked"]["recall"] == 1.0


@pytest.mark.test_run
def test_300_frame_perfect_oracle_replay(tmp_path):
    # CHOT CHAN TEST: `sang_5p` la run TEST. Oracle TEST chi duoc chay trong ma tran
    # cuoi voi TECHGAR_ALLOW_TEST_RUNS=1 (xem REPORT_TEST_GUARD.md).
    # Marker `test_run` de conftest chan tu dong (ten test khong chua token run).
    reason = skip_reason_if_test("sang_5p")
    if reason:
        pytest.skip(reason)
    # Run an actual engine and real P37 on a truncated existing oracle, never
    # SIM3D and never the TEST run's 3 source videos directly.
    result = run_gate(runs=("sang_5p",), label="smoke300", out_dir=tmp_path,
                      max_frames=300)
    row = result["runs"]["sang_5p"]
    assert "error" not in row, row.get("error")
    assert row["all_visible"]["all_visible_frames"] == 300
    assert row["all_visible"]["all_visible_IDTP"] > 0
    # The current engine fails the perfect 300-frame parked-car recall gate;
    # this test must detect the regression, not paper it over as IDF1=1.
    assert 0 < row["IDF1_all_visible"] < 1.0
    assert row["IDF1_all_visible"] == pytest.approx(row["oracle_idf1_all_visible"], abs=5e-5)
    assert row["gate"] == "FAIL"
    assert {"parked", "stopped", "moving"} <= set(row["recall_by_state"])
    saved = json.loads((tmp_path / "smoke300.json").read_text(encoding="utf-8"))
    assert saved["runs"]["sang_5p"]["perfect_oracle"]["IDSW"] == row["perfect_oracle"]["IDSW"]
    assert not list(tmp_path.glob("*.predictions.jsonl"))
