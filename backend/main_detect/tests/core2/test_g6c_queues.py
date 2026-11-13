import io
import json
import threading
import time

from techgar.latest_render_queue import LatestRenderQueue
from two_camera import RuntimeJsonWriter, make_parser


def test_render_handoff_drops_without_waiting_for_busy_mutex():
    relay = LatestRenderQueue(lambda packet: None)
    try:
        relay._queue.mutex.acquire()
        try:
            start = time.perf_counter()
            assert relay.submit_nonblocking('preview')
            assert time.perf_counter() - start < 0.1
            assert relay.overwritten == 1
        finally:
            relay._queue.mutex.release()
    finally:
        relay.close()


def test_prediction_queue_absorbs_burst_then_backpressures_without_loss():
    entered = threading.Event()
    release = threading.Event()

    class SlowOutput(io.StringIO):
        def write(self, data):
            entered.set()
            assert release.wait(3)
            return super().write(data)

    out, counts = SlowOutput(), {}
    writer = RuntimeJsonWriter(capacity=3)
    producer = None
    try:
        writer.submit_prediction(out, {'frame': 0}, counts)
        assert entered.wait(3)
        for frame in range(1, 4):
            writer.submit_prediction(out, {'frame': frame}, counts)
        assert writer.prediction_queue_peak == 3
        producer = threading.Thread(target=writer.submit_prediction,
                                    args=(out, {'frame': 4}, counts))
        producer.start()
        for _ in range(100):
            if writer.prediction_wait_count:
                break
            time.sleep(0.001)
        assert writer.prediction_wait_count == 1
        assert producer.is_alive()
        release.set()
        producer.join(3)
        assert not producer.is_alive()
        writer.close([])
        assert writer.prediction_wait_ms > 0
        assert counts['predictions'] == 5
        assert [json.loads(line)['frame'] for line in out.getvalue().splitlines()] == list(range(5))
    finally:
        release.set()
        if producer is not None:
            producer.join(3)
        if not writer._closing:
            writer.close([])


def test_prediction_queue_default_and_bounds():
    parser = make_parser()
    required = ['--slots-cam1', 'a', '--slots-cam2', 'b', '--calibration', 'c']
    assert parser.parse_args(required).prediction_queue_capacity == 2
    assert parser.parse_args(required + ['--prediction-queue-capacity', '256']).prediction_queue_capacity == 256
