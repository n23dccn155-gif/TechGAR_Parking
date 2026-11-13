import importlib.util
import json
from pathlib import Path

import numpy as np
import pytest

from techgar.core2.capture import make_blobs, tap_detector
from techgar.core2.dump import BlobDumpWriter, read_dump
from techgar.core2.types import Blob


def test_round_trip_is_byte_deterministic_and_preserves_blob(tmp_path):
    blob = Blob(0, 99, 12.345, (1, 2, 3, 4), (1.1, -2.2), 7, True, 0.75, (0.1, 0.2))
    paths = [tmp_path / "a.gz", tmp_path / "b.gz"]
    for path in paths:
        with BlobDumpWriter(path, video="video", stride=2, cameras={0: "cam1", 1: "cam2"}, core_version="abc") as out:
            out.write_step(12.5, 1, 99, {0: [blob], 1: []})
            out.write_step(12.58, 2, 101, {0: [], 1: []})
    assert paths[0].read_bytes() == paths[1].read_bytes()
    header, steps = read_dump(paths[0])
    steps = list(steps)
    assert header["stride"] == 2 and header["cameras"] == {"0": "cam1", "1": "cam2"}
    assert steps[0]["blobs_by_cam"] == {0: [blob], 1: []}
    assert steps[1]["source_frame_idx"] == 101


def test_capture_preserves_detector_result_and_projects_point():
    detection = {"box": (1, 2, 3, 4), "point": (2, 6), "area": 8,
                 "roi_clipped": True, "roi_support_ratio": 0.5}
    class Tracker:
        def _detect(self, *args, **kwargs):
            return [detection], "mask"
    tracker = Tracker()
    captured = tap_detector(tracker)
    detections, mask = tracker._detect(None)
    assert detections[0] is detection and mask == "mask"
    blobs = make_blobs(captured, 0, 4, 0.16, np.eye(3))
    assert blobs[0].xy == (2.0, 6.0) and blobs[0].area_px == 8
    assert blobs[0].roi_clipped and blobs[0].roi_support == 0.5


def test_replay_invokes_engine_and_writes_predictions_v3(tmp_path):
    script = Path(__file__).resolve().parents[2] / "core2_replay.py"
    spec = importlib.util.spec_from_file_location("core2_replay", script)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    path = tmp_path / "input.gz"
    blob = Blob(0, 99, 4.0, (1, 2, 3, 4), (1., 2.), 3, False, 1., None)
    with BlobDumpWriter(path, video="x", stride=1, cameras={0: "cam1"}, core_version="a") as out:
        out.write_step(4.125, 1, 99, {0: [blob]})
    class Spy:
        calls = []
        tracks = []
        _next_gid = 1
        def step(self, t, frame, blobs):
            self.calls.append((t, frame, blobs))
            return []
        def live_gids(self): return set()
        def drain_events(self): return []
        def stats(self): return {}
    engine = Spy()
    for name in ("one", "two"):
        module.replay(path, tmp_path / name, engine=engine)
    assert engine.calls == [(4.125, 1, {0: [blob]})] * 2
    assert (tmp_path / "one").read_bytes() == (tmp_path / "two").read_bytes()
    row = json.loads((tmp_path / "one").read_text())
    assert row["schema_version"] == 3 and row["observations"] == []
    assert row["source_frame_idx"] == 99


def test_writer_rejects_nonmonotonic_time(tmp_path):
    with BlobDumpWriter(tmp_path / "x.gz", video="x", stride=1, cameras={0:"cam1"}, core_version="a") as out:
        out.write_step(1., 1, 1, {0: []})
        with pytest.raises(ValueError):
            out.write_step(1., 2, 2, {0: []})


def test_comparison_ignores_only_wall_clock(tmp_path):
    root = Path(__file__).resolve().parents[4]
    spec = importlib.util.spec_from_file_location("compare_b0", root / ".orca/core2/b0_compare_predictions.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    a, b = tmp_path / "a", tmp_path / "b"
    a.write_text(json.dumps({"frame_idx": 1, "capture_unix_ns": 10, "wall_time_iso": "a", "observations": [1]}) + "\n")
    b.write_text(json.dumps({"frame_idx": 1, "capture_unix_ns": 20, "wall_time_iso": "b", "observations": [1]}) + "\n")
    assert module.compare(a, b)["equal"]
    b.write_text(json.dumps({"frame_idx": 1, "capture_unix_ns": 20, "wall_time_iso": "b", "observations": [2]}) + "\n")
    assert module.compare(a, b)["different_keys"] == ["observations"]
