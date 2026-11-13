import time
import multiprocessing as mp

import cv2
import numpy as np
import pytest

from techgar.async_video_process import AsyncVideoProcess, _signal_stop_key


@pytest.mark.parametrize('key,should_stop', [(ord('q'), True), (ord('Q'), True), (27, True), (ord('a'), False), (-1, False)])
def test_render_key_crosses_process_boundary(key, should_stop):
    ctx = mp.get_context('spawn')
    event = ctx.Event()
    child = ctx.Process(target=_signal_stop_key, args=(key, event))
    child.start(); child.join(10)
    assert child.exitcode == 0
    assert event.is_set() is should_stop


def test_stop_request_does_not_prevent_encoder_close(tmp_path):
    output = tmp_path / 'debug.mp4'
    writer = AsyncVideoProcess({'debug': (str(output), 25, (32, 24))})
    assert not writer.stop_requested
    writer._stop_event.set()
    assert writer.stop_requested
    writer.submit({'debug': np.full((24, 32, 3), 128, dtype=np.uint8)})
    assert writer.close()['debug'] == 1


def test_video_encoder_process_writes_and_closes(tmp_path):
    output = tmp_path / 'debug.mp4'
    writer = AsyncVideoProcess({'debug': (str(output), 12.5, (32, 24))}, capacity=2)
    image = np.full((24, 32, 3), 128, dtype=np.uint8)
    assert writer.submit({'debug': image})
    # Wait for real child to receive a frame before requesting shutdown.
    deadline = time.monotonic() + 5
    while not output.exists() and time.monotonic() < deadline:
        time.sleep(.01)
    time.sleep(.2)
    counts = writer.close()
    assert counts['debug'] >= 1
    capture = cv2.VideoCapture(str(output))
    ok, decoded = capture.read()
    capture.release()
    assert ok and decoded.shape == (24, 32, 3)


def test_replay_renderer_reads_requested_source_frame_and_scales_video(tmp_path):
    for camera in ('cam1', 'cam2'):
        source = cv2.VideoWriter(str(tmp_path / f'raw_{camera}.mp4'), cv2.VideoWriter_fourcc(*'mp4v'), 25, (64, 48))
        assert source.isOpened()
        for value in (20, 180, 40):
            source.write(np.full((48, 64, 3), value, dtype=np.uint8))
        source.release()
    output = tmp_path / 'output.avi'
    writer = AsyncVideoProcess({'raw_cam1': (str(output), 25, (64, 48))}, replay_dir=tmp_path, scale=.5, codec='MJPG')
    assert writer.submit({'source_frame_idx': 2, 'payloads': {'cam1': {'frame_index': 2}, 'cam2': {'frame_index': 2}}})
    counts = writer.close(timeout=30)
    assert counts['raw_cam1'] == 1
    capture = cv2.VideoCapture(str(output));ok, decoded = capture.read();capture.release()
    assert ok and decoded.shape == (24, 32, 3)
    assert decoded.mean() > 120  # second frame, not the first or third
