"""Recovery when the runtime JSON disk worker exits unexpectedly."""

import json
import threading
import time

from two_camera import RuntimeJsonWriter


def test_dead_worker_unblocks_full_queue_and_replays_partial_line(tmp_path, monkeypatch):
    crashes = []
    monkeypatch.setattr(threading, "excepthook", lambda args: crashes.append(args.exc_type))
    started = threading.Event()
    die = threading.Event()

    with (tmp_path / "predictions.jsonl").open("w+", encoding="utf-8") as output:
        writer = RuntimeJsonWriter()
        write_original = writer._write_item
        injected = False

        def kill_during_write(item):
            nonlocal injected
            if item[0] == "prediction" and not injected:
                injected = True
                item[1][0].write('{"partial":')
                started.set()
                assert die.wait(timeout=2)
                raise SystemExit("simulated worker death mid-write")
            write_original(item)

        writer._write_item = kill_during_write
        counts = {}
        writer.submit_prediction(output, {"frame_idx": 1}, counts)
        assert started.wait(timeout=2)
        writer.submit_prediction(output, {"frame_idx": 2}, counts)
        writer.submit_prediction(output, {"frame_idx": 3}, counts)

        # The queue is full while the worker is suspended in frame 1.
        release = threading.Timer(0.05, die.set)
        release.start()
        before = time.monotonic()
        writer.submit_prediction(output, {"frame_idx": 4}, counts)
        waited = time.monotonic() - before
        release.join(timeout=2)
        assert 0.03 <= waited < 1.5

        for frame_idx in range(5, 11):
            writer.submit_prediction(output, {"frame_idx": frame_idx}, counts)
        writer.close([(tmp_path / "status.json", {"frame_idx": 10, "final": True})])

        output.seek(0)
        rows = [json.loads(line) for line in output]

    assert [row["frame_idx"] for row in rows] == list(range(1, 11))
    assert counts["predictions"] == 10
    assert json.loads((tmp_path / "status.json").read_text(encoding="utf-8")) == {
        "frame_idx": 10, "final": True,
    }
    assert crashes == [SystemExit]


def test_worker_death_after_successful_write_does_not_duplicate_frame(tmp_path, monkeypatch):
    crashes = []
    monkeypatch.setattr(threading, "excepthook", lambda args: crashes.append(args.exc_type))

    with (tmp_path / "predictions.jsonl").open("w+", encoding="utf-8") as output:
        writer = RuntimeJsonWriter()
        write_original = writer._write_item
        injected = False

        def die_after_write(item):
            nonlocal injected
            write_original(item)
            if not injected:
                injected = True
                raise SystemExit("simulated worker death after write")

        writer._write_item = die_after_write
        counts = {}
        writer.submit_prediction(output, {"frame_idx": 1}, counts)
        writer._worker.join(timeout=2)
        assert not writer._worker.is_alive()
        writer.submit_prediction(output, {"frame_idx": 2}, counts)
        writer.close()

        output.seek(0)
        rows = [json.loads(line) for line in output]

    assert [row["frame_idx"] for row in rows] == [1, 2]
    assert counts["predictions"] == 2
    assert crashes == [SystemExit]
