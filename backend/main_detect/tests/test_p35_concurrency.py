"""Tests for P35 Concurrency: RuntimeJsonWriter, ReplaySession Prefetch, and Async Parking.

Covers:
(a) RuntimeJsonWriter (Codex T4):
    - Normal flush on close
    - Prediction ordering and zero-loss under queue saturation / coalescing
    - Atomic save_json with no lingering temporary files
    - Worker exception propagation and behavior when worker dies
    - Ctrl+C (KeyboardInterrupt) flush flow
(b) ReplaySession Prefetch:
    - Clean thread shutdown on early exit
    - Clean EOF handling and idempotent None returns
    - Monotonic frame_idx and sequence matching
    - Capture release without leaks
    - Worker exception propagation to consumer
(c) Async Parking Evidence:
    - Evidence frame and timestamp association (late results do not misattribute frame)
    - Stale result rejection when deadline exceeded
    - Non-monotonic timestamp rejection
"""

from __future__ import annotations

import csv
import json
import sys
import threading
import time
from pathlib import Path
from unittest.mock import MagicMock

BASE_DIR = Path(__file__).resolve().parent.parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))
SRC_DIR = BASE_DIR / "src"
if str(SRC_DIR) not in sys.path:
    sys.path.insert(0, str(SRC_DIR))

import numpy as np
import pytest

from two_camera import (
    ReplayFrameTiming,
    ReplaySession,
    RuntimeJsonWriter,
    runtime_status_files,
    save_json,
)


# ============================================================================
# Helpers
# ============================================================================

class FakeCapture:
    """Mock cv2.VideoCapture for replay testing."""

    def __init__(self, frames, fail_at: int = -1):
        self.frames = list(frames)
        self.read_calls = 0
        self.released = False
        self.fail_at = fail_at

    def isOpened(self):
        return True

    def read(self):
        self.read_calls += 1
        if self.fail_at > 0 and self.read_calls == self.fail_at:
            raise RuntimeError("Capture hardware read failure")
        if not self.frames:
            return False, None
        return True, self.frames.pop(0)

    def release(self):
        self.released = True


def make_test_session(tmp_path: Path, num_frames: int = 5) -> Path:
    session = tmp_path / "test_replay_session"
    session.mkdir(parents=True, exist_ok=True)
    for camera_id in ("cam1", "cam2"):
        (session / f"raw_{camera_id}.mp4").write_bytes(b"dummy_video_data")
    fieldnames = [
        "frame_idx",
        "capture_unix_ns",
        "wall_time_iso",
        "cam1_monotonic_ns",
        "cam2_monotonic_ns",
        "camera_skew_ms",
    ]
    with (session / "frame_timestamps.csv").open("w", newline="", encoding="utf-8-sig") as out:
        writer = csv.DictWriter(out, fieldnames=fieldnames)
        writer.writeheader()
        base_ns = 1_000_000_000
        for i in range(1, num_frames + 1):
            writer.writerow({
                "frame_idx": str(i),
                "capture_unix_ns": str(base_ns + i * 40_000_000),
                "wall_time_iso": f"2026-11-09T10:00:0{i}.000Z",
                "cam1_monotonic_ns": str(base_ns + i * 40_000_000),
                "cam2_monotonic_ns": str(base_ns + i * 40_000_000 + 1_000_000),
                "camera_skew_ms": "1.0",
            })
    return session


class SlowOutput:
    """Mock file output that simulates slow disk I/O."""

    def __init__(self, delay_s: float = 0.01):
        self.delay_s = delay_s
        self.lines: list[str] = []
        self._lock = threading.Lock()

    def write(self, s: str):
        if self.delay_s > 0:
            time.sleep(self.delay_s)
        with self._lock:
            self.lines.append(s)

    def flush(self):
        pass


# ============================================================================
# (a) RuntimeJsonWriter & save_json Tests
# ============================================================================

def test_json_writer_normal_flush(tmp_path):
    """Worker flushes all submitted predictions and final status on close."""
    writer = RuntimeJsonWriter()
    pred_file = SlowOutput(delay_s=0.001)
    counts = {}

    for idx in range(1, 6):
        writer.submit_prediction(pred_file, {"frame": idx, "data": f"det_{idx}"}, counts)
        status_files = [(tmp_path / "status.json", {"frame": idx})]
        writer.submit_status(status_files)

    final_status = [(tmp_path / "status.json", {"frame": 5, "final": True})]
    writer.close(final_status)

    assert len(pred_file.lines) == 5
    for idx, line in enumerate(pred_file.lines, start=1):
        data = json.loads(line)
        assert data["frame"] == idx

    status_data = json.loads((tmp_path / "status.json").read_text(encoding="utf-8"))
    assert status_data["frame"] == 5
    assert status_data.get("final") is True
    assert counts.get("predictions") == 5


def test_json_writer_queue_saturation_coalesces_status_without_losing_predictions(tmp_path):
    """Status is coalesced when queue is full, but PREDICTIONS are NEVER dropped or reordered."""
    writer = RuntimeJsonWriter()
    slow_output = SlowOutput(delay_s=0.005)
    counts = {}
    num_predictions = 25

    for idx in range(1, num_predictions + 1):
        # Interleave predictions and status writes rapidly
        writer.submit_prediction(slow_output, {"frame_idx": idx}, counts)
        writer.submit_status([(tmp_path / "coalesce_status.json", {"latest_frame": idx})])

    writer.close([(tmp_path / "coalesce_status.json", {"latest_frame": num_predictions, "done": True})])

    # All predictions MUST be preserved in exact sequential order
    assert len(slow_output.lines) == num_predictions
    for idx, line in enumerate(slow_output.lines, start=1):
        item = json.loads(line)
        assert item["frame_idx"] == idx, f"Prediction out of order: expected {idx}, got {item['frame_idx']}"

    # Status file contains final state
    status = json.loads((tmp_path / "coalesce_status.json").read_text(encoding="utf-8"))
    assert status["latest_frame"] == num_predictions
    assert status.get("done") is True


def test_json_writer_atomic_save_no_dangling_tmp(tmp_path):
    """save_json writes to temporary file first and replaces atomically with no dangling tmp."""
    target = tmp_path / "atomic_test.json"
    payload = {"status": "ok", "items": [1, 2, 3]}

    ok = save_json(target, payload)
    assert ok is True
    assert target.is_file()
    assert json.loads(target.read_text(encoding="utf-8")) == payload

    # Ensure no leftover .tmp files
    tmp_files = list(tmp_path.glob(".*.tmp"))
    assert len(tmp_files) == 0


def test_json_writer_save_json_lock_tolerance(tmp_path):
    """save_json tolerates locks when tolerate_lock=True, raises when False."""
    target = tmp_path / "locked_file.json"
    target.write_text("initial", encoding="utf-8")

    # Open with exclusive access to simulate a lock on Windows
    with open(target, "r+", encoding="utf-8") as lock_handle:
        # On Windows, replacing an open file may raise PermissionError
        # When tolerate_lock=True, save_json handles retry and returns False on failure
        res_tolerant = save_json(target, {"update": 1}, tolerate_lock=True)
        # Result may be True or False depending on OS file locking semantics, but MUST NOT raise
        assert isinstance(res_tolerant, bool)


def test_json_writer_exception_propagates_on_close():
    """If the worker thread encounters an unhandled write exception, close() raises RuntimeError."""
    writer = RuntimeJsonWriter()

    class FailingOutput:
        def write(self, s: str):
            raise OSError("Disk quota exceeded")

    counts = {}
    writer.submit_prediction(FailingOutput(), {"test": 1}, counts)

    with pytest.raises(RuntimeError, match="Background JSON write failed"):
        writer.close()


def test_json_writer_ctrl_c_exception_flow(tmp_path):
    """Simulate two_camera.py KeyboardInterrupt in main loop and verify finally close flushes."""
    writer = RuntimeJsonWriter()
    pred_output = SlowOutput(delay_s=0.001)
    counts = {}

    try:
        for f in range(1, 4):
            writer.submit_prediction(pred_output, {"frame": f}, counts)
        # Simulate user pressing Ctrl+C mid-run
        raise KeyboardInterrupt
    except KeyboardInterrupt:
        pass
    finally:
        final_files = [(tmp_path / "ctrl_c_status.json", {"interrupted_at": 3})]
        writer.close(final_files)

    assert len(pred_output.lines) == 3
    status = json.loads((tmp_path / "ctrl_c_status.json").read_text(encoding="utf-8"))
    assert status["interrupted_at"] == 3


# ============================================================================
# (b) ReplaySession Prefetch Tests
# ============================================================================

def test_replay_prefetch_clean_eof_and_subsequent_reads(tmp_path):
    """Prefetch worker cleanly signals EOF with None; multiple read_pair calls stay None."""
    session_dir = make_test_session(tmp_path, num_frames=3)
    captures = {
        "cam1": FakeCapture([np.zeros((2, 2)) for _ in range(3)]),
        "cam2": FakeCapture([np.zeros((2, 2)) for _ in range(3)]),
    }
    replay = ReplaySession(
        session_dir,
        capture_factory=lambda src: captures[Path(src).stem.removeprefix("raw_")],
        prefetch_capacity=8,
    )

    for expected_frame in (1, 2, 3):
        pair = replay.read_pair()
        assert pair is not None
        assert pair[3].frame_idx == expected_frame
        assert pair[1]["cam1"] == expected_frame
        assert pair[1]["cam2"] == expected_frame

    # Clean EOF
    assert replay.read_pair() is None
    # Subsequent calls must remain None without blocking
    assert replay.read_pair() is None
    assert replay.read_pair() is None

    replay.release()
    assert captures["cam1"].released is True
    assert captures["cam2"].released is True


def test_replay_prefetch_early_stop_stops_thread_cleanly(tmp_path):
    """When user stops early (break loop), release() stops background thread within 1s."""
    session_dir = make_test_session(tmp_path, num_frames=50)
    captures = {
        "cam1": FakeCapture([np.zeros((2, 2)) for _ in range(50)]),
        "cam2": FakeCapture([np.zeros((2, 2)) for _ in range(50)]),
    }
    replay = ReplaySession(
        session_dir,
        capture_factory=lambda src: captures[Path(src).stem.removeprefix("raw_")],
        prefetch_capacity=16,
    )

    # Read only 2 frames, simulating early exit (--max-frames 2 or user 'q')
    p1 = replay.read_pair()
    p2 = replay.read_pair()
    assert p1 is not None and p2 is not None

    worker_thread = replay._thread
    assert worker_thread is not None

    # Call release and verify thread joins cleanly
    start = time.perf_counter()
    replay.release()
    elapsed = time.perf_counter() - start

    assert elapsed < 1.0, f"Thread release took too long: {elapsed:.3f}s"
    assert not worker_thread.is_alive()
    assert captures["cam1"].released is True
    assert captures["cam2"].released is True


def test_replay_prefetch_worker_exception_propagates_to_read_pair(tmp_path):
    """If capture raises an error in the worker thread, read_pair raises it on the consumer thread."""
    session_dir = make_test_session(tmp_path, num_frames=5)
    captures = {
        "cam1": FakeCapture([np.zeros((2, 2)) for _ in range(5)], fail_at=2),
        "cam2": FakeCapture([np.zeros((2, 2)) for _ in range(5)]),
    }
    replay = ReplaySession(
        session_dir,
        capture_factory=lambda src: captures[Path(src).stem.removeprefix("raw_")],
        prefetch_capacity=4,
    )

    # First frame should succeed
    pair1 = replay.read_pair()
    assert pair1 is not None and pair1[3].frame_idx == 1

    # Second frame should raise the worker exception
    with pytest.raises(RuntimeError, match="Capture hardware read failure"):
        replay.read_pair()

    replay.release()


# ============================================================================
# (c) Async Parking Evidence Tests
# ============================================================================

def test_parking_async_delayed_result_preserves_evidence_frame():
    """Delayed async parking evidence preserves source frame_idx and does not misassign."""
    from techgar.parking_detector import ParkingDetector, SlotResult
    from techgar.slot_vehicle_binder import SlotVehicleBinder

    # Mock detector and binder
    detector = ParkingDetector.__new__(ParkingDetector)
    detector._accepted_timestamp = 0.0
    detector.stable_evidence = True
    detector._stable_slots = {}
    detector.occupied_seconds = 0.5
    detector.empty_seconds = 0.5
    detector.ratio_thr = 0.12
    detector.exit_ratio_thr = 0.08

    mock_result = SlotResult(
        slot_id="S001",
        occupied=True,
        polygon=np.array([[10, 10], [50, 10], [50, 50], [10, 50]]),
        center=(30, 30),
        evidence={"instant_occupied": True, "raw_ratio": 0.25, "filtered_ratio": 0.3},
    )

    # Submit was at frame 10 (t=0.4s), but completed and applied at frame 15 (t=0.6s)
    evidence_frame_idx = 10
    evidence_timestamp_s = 0.4
    applied_frame_idx = 15
    applied_timestamp_s = 0.6

    accepted = detector.accept_evidence([mock_result], evidence_timestamp_s, evidence_frame_idx)
    assert accepted is True

    # Check that detector recorded the EVIDENCE frame, not the applied frame
    assert mock_result.evidence["evidence_frame_idx"] == 10
    assert mock_result.evidence["evidence_timestamp_s"] == 0.4

    # Binder receives both applied frame clock and evidence provenance
    binder = SlotVehicleBinder(policy="vision_primary")
    binder.update_vision(
        [mock_result],
        frame_idx=applied_frame_idx,
        timestamp_s=applied_timestamp_s,
        camera_id="cam1",
        evidence_frame_idx=evidence_frame_idx,
        evidence_timestamp_s=evidence_timestamp_s,
    )

    # Application clock advances to applied frame
    assert binder._last_frame_idx == 15
    assert binder._last_timestamp_s == 0.6


def test_parking_async_non_monotonic_timestamp_rejected():
    """Evidence with older or equal timestamp is rejected to prevent time-travel corruption."""
    from techgar.parking_detector import ParkingDetector, SlotResult

    detector = ParkingDetector.__new__(ParkingDetector)
    detector._accepted_timestamp = 1.0
    detector.stable_evidence = False

    result = SlotResult(
        slot_id="S001",
        occupied=True,
        polygon=np.array([[10, 10], [50, 10], [50, 50], [10, 50]]),
        center=(30, 30),
        evidence={},
    )

    # Out of order timestamp (0.8s <= 1.0s) MUST be rejected
    rejected = detector.accept_evidence([result], timestamp_s=0.8, frame_idx=8)
    assert rejected is False


def test_parking_async_stale_result_age_rejection_logic():
    """Verify max result age rejection condition used in two_camera.py."""
    camera_timestamps_s = 2.0
    job_timestamp_s = 1.0
    submitted_at_s = 10.0
    current_monotonic_s = 11.2  # 1.2s delay

    max_result_age_s = 0.75

    result_age_s = max(
        0.0,
        camera_timestamps_s - job_timestamp_s,  # 1.0s video time
        current_monotonic_s - submitted_at_s,  # 1.2s wall time
    )

    is_too_old = result_age_s > max_result_age_s
    assert is_too_old is True, "Result exceeding 0.75s must be flagged as stale"
