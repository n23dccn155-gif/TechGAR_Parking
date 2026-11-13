from __future__ import annotations

import time
import numpy as np
import pytest

from two_camera import AsyncDebugVideoWriter


class MockVideoWriter:
    def __init__(self, delay: float = 0.0) -> None:
        self.delay = delay
        self.frames: list[np.ndarray] = []

    def write(self, frame: np.ndarray) -> None:
        if self.delay > 0:
            time.sleep(self.delay)
        self.frames.append(frame)


def test_async_debug_video_writer_flushes_all_frames_in_order():
    writer = MockVideoWriter(delay=0.001)
    async_writer = AsyncDebugVideoWriter(maxsize=16)
    counts: dict[str, int] = {"debug_cam1": 0}

    frames = [np.full((10, 10, 3), fill_value=i, dtype=np.uint8) for i in range(10)]
    for frame in frames:
        async_writer.submit("cam1", writer, frame, counts)

    async_writer.close()

    assert async_writer.dropped_count == 0
    assert len(writer.frames) == 10
    assert counts["debug_cam1"] == 10
    # Strict FIFO verification
    for i, recorded_frame in enumerate(writer.frames):
        assert int(recorded_frame[0, 0, 0]) == i


def test_async_debug_video_writer_bounded_queue_counts_drops():
    writer = MockVideoWriter(delay=0.01)
    async_writer = AsyncDebugVideoWriter(maxsize=4)
    counts: dict[str, int] = {"debug_cam1": 0, "debug_cam2": 0}

    frame = np.zeros((10, 10, 3), dtype=np.uint8)
    for i in range(12):
        cid = "cam1" if i % 2 == 0 else "cam2"
        async_writer.submit(cid, writer, frame, counts)

    dropped = async_writer.dropped_count
    assert dropped > 0
    assert sum(async_writer.dropped_by_camera.values()) == dropped

    async_writer.close()
    written = len(writer.frames)
    assert written + dropped == 12
    assert counts["debug_cam1"] + counts["debug_cam2"] == written
