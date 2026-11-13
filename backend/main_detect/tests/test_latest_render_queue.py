import threading

import pytest

from techgar.latest_render_queue import LatestRenderQueue


def test_slow_render_keeps_latest_without_blocking_producer():
    entered, release, done = threading.Event(), threading.Event(), threading.Event()
    seen = []

    def render(value):
        seen.append(value)
        if value == 0:
            entered.set()
            assert release.wait(2)
        else:
            done.set()

    worker = LatestRenderQueue(render)
    try:
        assert worker.submit(0) and entered.wait(1)
        for value in range(1, 100):
            assert worker.submit(value)
        release.set()
        assert done.wait(1)
        assert seen == [0, 99]
        assert worker.overwritten == 98
    finally:
        release.set()
        worker.close()


def test_worker_error_is_reported():
    failed = threading.Event()

    def render(_value):
        failed.set()
        raise ValueError('render failed')

    worker = LatestRenderQueue(render)
    assert worker.submit(1) and failed.wait(1)
    with pytest.raises(RuntimeError, match='render worker failed'):
        worker.close()
