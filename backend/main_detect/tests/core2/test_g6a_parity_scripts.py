"""Cheap tests for the G6A sequential replay/parity harness (no replay run)."""

import gzip
import json
from pathlib import Path
import sys

import pytest


ROOT = Path(__file__).resolve().parents[4]
sys.path.insert(0, str(ROOT / ".orca" / "core2"))
from g6a_compare_predictions import compare  # noqa: E402
from g6a_run_600 import build_command  # noqa: E402


def test_ab_runner_only_changes_binder_override(tmp_path):
    template = json.loads((ROOT / ".orca/core2/render_runs/dir_diag_A/cmd.json").read_text())
    commands = [build_command(template, label, tmp_path) for label in ("baseline", "optimized")]
    for command in commands:
        assert command.count("--perf-optimize") == 1
        assert "--binder-fast" in command
        assert "--predictions-gzip" in command
        assert "--no-session-video" in command
        assert "--no-display" in command
        assert "--max-frames" in command
        for disallowed in ("--perf-stages", "--replay-realtime", "--replay-drop-frames",
                           "--render-async", "--render-replay-process", "--core2-dump"):
            assert disallowed not in command
    # Baseline and optimized have the same arguments except output paths.
    a, b = commands
    for key in ("--session-dir", "--output-dir"):
        a[a.index(key) + 1] = "SAME"
        b[b.index(key) + 1] = "SAME"
    assert a == b


def test_parity_compares_all_fields_except_wall_clock(tmp_path):
    left, right = tmp_path / "baseline.jsonl.gz", tmp_path / "optimized.jsonl.gz"
    baseline = {"frame_idx": 1, "capture_unix_ns": 42, "wall_time_iso": "a",
                "observations": [{"gid": 12, "xy": [1.0, 2.0]}], "slots": []}
    optimized = {**baseline, "capture_unix_ns": 999, "wall_time_iso": "b"}

    def write(path, payload):
        with gzip.open(path, "wt", encoding="utf-8") as handle:
            handle.write(json.dumps(payload) + "\n")

    write(left, baseline)
    write(right, optimized)
    assert compare(left, right, expected_frames=1)[0] == 1
    optimized["observations"] = [{"gid": 13, "xy": [1.0, 2.0]}]
    write(right, optimized)
    with pytest.raises(AssertionError, match="first unequal key=observations"):
        compare(left, right, expected_frames=1)
