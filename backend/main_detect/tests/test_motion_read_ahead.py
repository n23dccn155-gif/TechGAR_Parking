"""Verify the motion read-ahead barrier preserves camera-local observations."""

from concurrent.futures import ThreadPoolExecutor

import cv2
import numpy as np

from techgar.motion_tracker import MotionVehicleTracker
from two_camera import MotionReadAhead


def _moving_frame(index: int) -> np.ndarray:
    frame = np.full((120, 192, 3), 95, dtype=np.uint8)
    cv2.rectangle(frame, (12 + index * 3, 35), (46 + index * 3, 61), (15, 48, 186), -1)
    return frame


def _visible(tracker):
    return sorted(
        (track_id, track.x, track.y, track.w, track.h,
         track.status.value, track.consecutive_invisible_count)
        for track_id, track in tracker.all_tracks.items()
    )


def test_precomputed_mog2_and_temporal_masks_preserve_motion_and_tracking():
    serial = MotionVehicleTracker(enable_multiscale_motion=True, min_area=25)
    ahead = MotionVehicleTracker(enable_multiscale_motion=True, min_area=25)
    for index in range(28):
        frame = _moving_frame(index)
        timestamp = 10.0 + index / 25.0
        _, serial_mask, serial_expired = serial.process_frame(frame, timestamp_s=timestamp)
        # Pretend cross/binder on the previous pair is still active: only the
        # mask worker advances, with track association deferred to the barrier.
        prepared = ahead.prepare_motion_frame(
            frame, timestamp_s=timestamp, frame_idx=ahead.frame_index + 1
        )
        assert ahead.frame_index == index
        _, pipeline_mask, pipeline_expired = ahead.process_frame(
            frame, timestamp_s=timestamp, prepared_motion=prepared
        )
        assert np.array_equal(serial_mask, pipeline_mask), index
        assert _visible(serial) == _visible(ahead), index
        assert [item[0] for item in serial_expired] == [item[0] for item in pipeline_expired]


def test_read_ahead_keeps_a_single_pair_pending_and_camera_order():
    class FakeTracker:
        frame_index = 1

        def __init__(self, name):
            self.name = name
            self.calls = []

        def prepare_motion_frame(self, frame, timestamp_s, frame_idx):
            self.calls.append((frame_idx, timestamp_s, frame))
            return (self.name, frame_idx)

    trackers = {camera: FakeTracker(camera) for camera in ("cam1", "cam2")}
    pairs = iter([({"cam1": "one", "cam2": "two"},
                   {"cam1": 2, "cam2": 2},
                   {"cam1": 2_000_000_000, "cam2": 2_100_000_000}, None), None])
    with ThreadPoolExecutor(max_workers=2) as pool:
        worker = MotionReadAhead(lambda: next(pairs), trackers, pool)
        try:
            worker.start_next()
            frames, _, _, _, masks = worker.take_next()
            assert frames == {"cam1": "one", "cam2": "two"}
            assert masks == {"cam1": ("cam1", 2), "cam2": ("cam2", 2)}
            assert trackers["cam1"].calls == [(2, 2.0, "one")]
            assert trackers["cam2"].calls == [(2, 2.1, "two")]
            worker.start_next()
            assert worker.take_next() is None
        finally:
            worker.close()
