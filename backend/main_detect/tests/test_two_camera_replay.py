import csv
from pathlib import Path

import numpy as np
import pytest

from two_camera import (
    ReplaySession, counted_recording_action, finish_recording_actions, make_parser,
    warmup_replay_motion,
)


def test_fast_motion_defaults_off_for_live_and_offline():
    for options in ([], ["--live-mode"]):
        args = make_parser().parse_args([
            "--slots-cam1", "cam1.json", "--slots-cam2", "cam2.json",
            "--calibration", "calibration.json", *options,
        ])
        assert args.fast_motion is False
        assert args.replay_drop_frames is None
    explicit = make_parser().parse_args([
        "--slots-cam1", "cam1.json", "--slots-cam2", "cam2.json",
        "--calibration", "calibration.json", "--live-mode",
        "--fast-motion", "--no-replay-drop-frames",
    ])
    assert explicit.fast_motion is True
    assert explicit.replay_drop_frames is False


def test_recording_finishes_current_frame_before_honoring_ctrl_c():
    completed = []
    counts = {}

    def interrupted_write():
        completed.append("raw_cam1")
        raise KeyboardInterrupt

    interrupted = finish_recording_actions([
        counted_recording_action(counts, "raw_cam1", interrupted_write),
        counted_recording_action(
            counts, "raw_cam2", lambda: completed.append("raw_cam2")
        ),
        counted_recording_action(
            counts, "timestamp", lambda: completed.append("timestamp")
        ),
        counted_recording_action(
            counts, "prediction", lambda: completed.append("prediction")
        ),
    ])

    assert interrupted is True
    assert completed == ["raw_cam1", "raw_cam2", "timestamp", "prediction"]
    assert counts == {"raw_cam2": 1, "timestamp": 1, "prediction": 1}


class FakeCapture:
    def __init__(self, frames):
        self.frames = list(frames)
        self.position = 0
        self.read_calls = 0
        self.released = False

    def isOpened(self):
        return True

    def read(self):
        self.read_calls += 1
        if self.position >= len(self.frames):
            return False, None
        frame = self.frames[self.position]
        self.position += 1
        return True, frame

    def set(self, prop, value):
        import cv2
        if prop != cv2.CAP_PROP_POS_FRAMES:
            return False
        self.position = int(value)
        return True

    def get(self, prop):
        import cv2
        if prop == cv2.CAP_PROP_POS_FRAMES:
            return float(self.position)
        return 0.0

    def release(self):
        self.released = True


def make_session(tmp_path: Path, rows: list[dict]) -> Path:
    session = tmp_path / "source_session"
    session.mkdir()
    for camera_id in ("cam1", "cam2"):
        (session / f"raw_{camera_id}.mp4").write_bytes(b"fake")
    fieldnames = [
        "frame_idx",
        "capture_unix_ns",
        "wall_time_iso",
        "cam1_monotonic_ns",
        "cam2_monotonic_ns",
        "camera_skew_ms",
    ]
    with (session / "frame_timestamps.csv").open(
        "w", newline="", encoding="utf-8-sig"
    ) as output:
        writer = csv.DictWriter(output, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)
    return session


def timing_row(frame_idx: int, cam1_ns: int, cam2_ns: int) -> dict:
    return {
        "frame_idx": frame_idx,
        "capture_unix_ns": 1_000_000_000 + frame_idx,
        "wall_time_iso": f"2026-08-18T19:45:{frame_idx:02d}+07:00",
        "cam1_monotonic_ns": cam1_ns,
        "cam2_monotonic_ns": cam2_ns,
        "camera_skew_ms": abs(cam1_ns - cam2_ns) / 1_000_000,
    }


def test_replay_reads_atomic_pairs_with_recorded_timestamps_and_clean_eof(tmp_path):
    session_path = make_session(tmp_path, [
        timing_row(1, 1_000_000_000, 1_010_000_000),
        timing_row(2, 1_080_000_000, 1_090_000_000),
    ])
    fake_captures = {
        "cam1": FakeCapture([np.full((2, 2), 11), np.full((2, 2), 12)]),
        "cam2": FakeCapture([np.full((2, 2), 21), np.full((2, 2), 22)]),
    }

    def capture_factory(source):
        camera_id = Path(source).stem.removeprefix("raw_")
        return fake_captures[camera_id]

    replay = ReplaySession(session_path, capture_factory=capture_factory)
    first = replay.read_pair()
    second = replay.read_pair()

    assert int(first[0]["cam1"][0, 0]) == 11
    assert int(first[0]["cam2"][0, 0]) == 21
    assert first[1] == {"cam1": 1, "cam2": 1}
    assert first[2] == {"cam1": 1_000_000_000, "cam2": 1_010_000_000}
    assert first[3].capture_unix_ns == 1_000_000_001
    assert second[1] == {"cam1": 2, "cam2": 2}
    assert second[2] == {"cam1": 1_080_000_000, "cam2": 1_090_000_000}

    assert replay.read_pair() is None
    assert replay.read_pair() is None
    assert fake_captures["cam1"].read_calls == 3
    assert fake_captures["cam2"].read_calls == 3
    replay.release()
    assert all(capture.released for capture in fake_captures.values())


def test_replay_rejects_video_that_ends_before_timestamp_rows(tmp_path):
    session_path = make_session(tmp_path, [
        timing_row(1, 1_000_000_000, 1_010_000_000),
        timing_row(2, 1_080_000_000, 1_090_000_000),
    ])
    fake_captures = {
        "cam1": FakeCapture([np.zeros((1, 1))]),
        "cam2": FakeCapture([np.zeros((1, 1)), np.zeros((1, 1))]),
    }

    def capture_factory(source):
        return fake_captures[Path(source).stem.removeprefix("raw_")]

    replay = ReplaySession(session_path, capture_factory=capture_factory)
    replay.read_pair()
    with pytest.raises(RuntimeError, match="cam1.*ket thuc som.*frame 2"):
        replay.read_pair()
    replay.release()


def test_replay_rejects_extra_video_frames_without_timestamp(tmp_path):
    session_path = make_session(
        tmp_path, [timing_row(1, 1_000_000_000, 1_010_000_000)]
    )
    fake_captures = {
        "cam1": FakeCapture([np.zeros((1, 1)), np.ones((1, 1))]),
        "cam2": FakeCapture([np.zeros((1, 1))]),
    }

    def capture_factory(source):
        return fake_captures[Path(source).stem.removeprefix("raw_")]

    replay = ReplaySession(session_path, capture_factory=capture_factory)
    replay.read_pair()
    with pytest.raises(RuntimeError, match="nhieu frame.*cam1"):
        replay.read_pair()
    replay.release()


@pytest.mark.parametrize(
    "rows, message",
    [
        (
            [
                timing_row(1, 1_000_000_000, 1_010_000_000),
                timing_row(3, 1_080_000_000, 1_090_000_000),
            ],
            "phai lien tuc",
        ),
        (
            [
                timing_row(1, 1_000_000_000, 1_010_000_000),
                timing_row(2, 999_999_999, 1_090_000_000),
            ],
            "cam1.*di lui",
        ),
    ],
)
def test_replay_rejects_invalid_timeline(tmp_path, rows, message):
    session_path = make_session(tmp_path, rows)
    with pytest.raises(ValueError, match=message):
        ReplaySession(session_path, capture_factory=lambda _source: None)


def test_replay_accepts_repeated_camera_timestamp_from_latest_frame_capture(tmp_path):
    session_path = make_session(tmp_path, [
        timing_row(1, 1_000_000_000, 1_010_000_000),
        timing_row(2, 1_080_000_000, 1_010_000_000),
    ])
    captures = {
        "cam1": FakeCapture([np.zeros((1, 1)), np.zeros((1, 1))]),
        "cam2": FakeCapture([np.zeros((1, 1)), np.zeros((1, 1))]),
    }

    replay = ReplaySession(
        session_path,
        capture_factory=lambda source: captures[
            Path(source).stem.removeprefix("raw_")
        ],
    )

    assert replay.read_pair()[2]["cam2"] == 1_010_000_000
    assert replay.read_pair()[2]["cam2"] == 1_010_000_000
    replay.release()


def test_replay_prefetch_queues_frames_in_background(tmp_path):
    import time
    session_path = make_session(tmp_path, [
        timing_row(1, 1_000_000_000, 1_010_000_000),
        timing_row(2, 1_080_000_000, 1_090_000_000),
        timing_row(3, 1_160_000_000, 1_170_000_000),
    ])
    captures = {
        "cam1": FakeCapture([np.zeros((1, 1)) for _ in range(3)]),
        "cam2": FakeCapture([np.zeros((1, 1)) for _ in range(3)]),
    }
    replay = ReplaySession(
        session_path,
        capture_factory=lambda source: captures[Path(source).stem.removeprefix("raw_")],
        prefetch_capacity=8,
    )
    # Wait briefly for prefetch worker to fill queue
    for _ in range(20):
        if replay._queue.qsize() >= 3:
            break
        time.sleep(0.01)
    assert replay._queue.qsize() >= 3
    pair1 = replay.read_pair()
    assert pair1[3].frame_idx == 1
    assert replay.read_pair()[3].frame_idx == 2
    assert replay.read_pair()[3].frame_idx == 3
    assert replay.read_pair() is None
    replay.release()


def test_replay_synchronous_mode_when_prefetch_zero(tmp_path):
    session_path = make_session(tmp_path, [
        timing_row(1, 1_000_000_000, 1_010_000_000),
        timing_row(2, 1_080_000_000, 1_090_000_000),
    ])
    captures = {
        "cam1": FakeCapture([np.zeros((1, 1)), np.zeros((1, 1))]),
        "cam2": FakeCapture([np.zeros((1, 1)), np.zeros((1, 1))]),
    }
    replay = ReplaySession(
        session_path,
        capture_factory=lambda source: captures[Path(source).stem.removeprefix("raw_")],
        prefetch_capacity=0,
    )
    assert replay._thread is None
    assert replay.read_pair()[3].frame_idx == 1
    assert replay.read_pair()[3].frame_idx == 2
    assert replay.read_pair() is None
    replay.release()


@pytest.mark.parametrize("prefetch_capacity", [0, 2])
def test_replay_seeks_both_cameras_and_timestamps(tmp_path, prefetch_capacity):
    session_path = make_session(tmp_path, [
        timing_row(i, 1_000_000_000 + i * 80_000_000,
                   1_010_000_000 + i * 80_000_000)
        for i in range(1, 5)
    ])
    captures = {
        camera: FakeCapture([np.full((1, 1), 10 * cam + i)
                             for i in range(1, 5)])
        for cam, camera in enumerate(("cam1", "cam2"), start=1)
    }
    replay = ReplaySession(
        session_path,
        capture_factory=lambda source: captures[Path(source).stem.removeprefix("raw_")],
        prefetch_capacity=prefetch_capacity,
        start_frame=3,
    )
    pair = replay.read_pair()
    assert pair[1] == {"cam1": 3, "cam2": 3}
    assert pair[3].frame_idx == 3
    assert pair[2]["cam1"] == 1_240_000_000
    assert int(pair[0]["cam1"][0, 0]) == 13
    assert int(pair[0]["cam2"][0, 0]) == 23
    assert replay.read_pair()[3].frame_idx == 4
    assert replay.read_pair() is None
    replay.release()


def test_replay_warms_motion_history_and_preserves_first_frame(tmp_path):
    session_path = make_session(tmp_path, [
        timing_row(i, 1_000_000_000 + i * 80_000_000,
                   1_010_000_000 + i * 80_000_000)
        for i in range(1, 5)
    ])
    captures = {camera: FakeCapture([np.full((1, 1), i) for i in range(1, 5)])
                for camera in ("cam1", "cam2")}
    replay = ReplaySession(
        session_path,
        capture_factory=lambda source: captures[Path(source).stem.removeprefix("raw_")],
        start_frame=2,
    )

    class FakeTracker:
        def __init__(self):
            self.calls = []

        def prepare_motion_frame(self, frame, timestamp_s, frame_idx):
            self.calls.append((int(frame[0, 0]), timestamp_s, frame_idx))

    trackers = {camera: FakeTracker() for camera in captures}
    first_pair = warmup_replay_motion(replay, trackers, replay.read_pair(), 4)
    assert first_pair[3].frame_idx == 4
    for tracker in trackers.values():
        assert [call[0] for call in tracker.calls] == [2, 3]
        assert [call[2] for call in tracker.calls] == [-1, 0]
    replay.release()


@pytest.mark.parametrize("start_frame", [0, 2])
def test_replay_rejects_invalid_seek_frame(tmp_path, start_frame):
    session_path = make_session(tmp_path, [timing_row(1, 1_000_000_000, 1_010_000_000)])
    with pytest.raises(ValueError, match="start-frame"):
        ReplaySession(session_path, capture_factory=lambda _source: None,
                      start_frame=start_frame)

