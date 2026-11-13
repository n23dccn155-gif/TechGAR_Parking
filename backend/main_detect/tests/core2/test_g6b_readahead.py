from concurrent.futures import ThreadPoolExecutor
from types import SimpleNamespace
import threading

from two_camera import Core2LDropReadAhead, make_parser


def test_drop_readahead_is_opt_in():
    parser = make_parser()
    required = ['--slots-cam1', 'a', '--slots-cam2', 'b', '--calibration', 'c']
    assert not parser.parse_args(required).replay_drop_readahead
    assert parser.parse_args(required + ['--replay-drop-readahead']).replay_drop_readahead


def test_drop_selection_and_detection_run_ahead_without_mutating_views():
    entered = threading.Event()
    release = threading.Event()

    class Detector:
        def step(self, frame, frame_idx, timestamp):
            entered.set()
            assert release.wait(3)
            return [(frame, frame_idx, timestamp)]

    class Replay:
        def __init__(self):
            self._next_index = 0
            self.timings = range(12)

        def read_pair(self):
            if self._next_index >= len(self.timings):
                return None
            self._next_index += 1
            n = self._next_index
            ns = n * 40_000_000
            return ({'cam1': n, 'cam2': n}, {}, {'cam1': ns, 'cam2': ns},
                    SimpleNamespace(frame_idx=n, camera_timestamps_ns={'cam1': ns, 'cam2': ns}))

    views = {c: SimpleNamespace(detector=Detector(), frame_index=7, blobs=['old'])
             for c in ('cam1', 'cam2')}
    with ThreadPoolExecutor(max_workers=2) as pool:
        # At wall 10.49, f1..f4 are >300 ms late and f5 is not.
        worker = Core2LDropReadAhead(Replay(), views, pool, 10.0, 0.0, clock=lambda: 10.49)
        try:
            worker.start_next()
            assert entered.wait(3)
            assert all(v.frame_index == 7 and v.blobs == ['old'] for v in views.values())
            release.set()
            frames, _, _, timing, blobs = worker.take_next()
            assert timing.frame_idx == 5
            assert worker.dropped == 4
            assert frames == {'cam1': 5, 'cam2': 5}
            assert blobs['cam1'] == [(5, 5, 0.2)]
            assert blobs['cam2'] == [(5, 5, 0.2)]
        finally:
            release.set()
            worker.close()
