import json
import threading
from urllib.request import Request, urlopen

import numpy as np
import pytest

from runtime_server import RuntimeHTTPServer, RuntimeState, normalize_gate_config, save_gate_config


def test_runtime_state_exposes_snapshot_and_latest_jpeg():
    state = RuntimeState(stream_fps=30, jpeg_quality=70)
    state.publish_snapshot(
        {
            "frame_index": 4,
            "timestamp": "recorded-time",
            "published_at": "current-time",
            "coordinate_space": {},
            "slot_layout": [],
            "recent_events": [],
        }
    )
    state.publish_frame(
        "cam1",
        np.zeros((20, 30, 3), dtype=np.uint8),
        frame_index=4,
        timestamp="current-time",
    )
    assert state.snapshot()["frame_index"] == 4
    _, jpeg = state.wait_for_frame("cam1", -1, timeout=2.0)
    assert jpeg[:2] == b"\xff\xd8"
    state.close()


def test_runtime_frame_render_and_jpeg_are_off_the_tracking_thread():
    state = RuntimeState(stream_fps=30, jpeg_quality=70)
    rendered_on = []
    release_render = threading.Event()

    def renderer(frame):
        rendered_on.append(threading.current_thread().name)
        assert release_render.wait(timeout=2.0)
        frame[0, 0] = 255
        return frame

    state.publish_frame(
        "cam1",
        np.zeros((120, 160, 3), dtype=np.uint8),
        frame_index=7,
        timestamp="",
        renderer=renderer,
    )
    release_render.set()  # publish returned while rendering was deliberately blocked
    assert state.wait_for_frame("cam1", -1, timeout=2.0)[0] == 7
    assert rendered_on == ["runtime-jpeg-encoder"]
    state.close()


def test_json_only_runtime_does_not_request_jpeg_work(monkeypatch):
    import runtime_server
    now = [10.]
    monkeypatch.setattr(runtime_server.time, "monotonic", lambda: now[0])
    state = RuntimeState(stream_fps=8)
    state.publish_snapshot({"frame_index": 1})
    assert not state.needs_frame("cam1")
    assert state.frame("cam1") is None  # first viewer requests a frame
    assert state.needs_frame("cam1")
    state.publish_frame("cam1", np.zeros((10, 10, 3), np.uint8), frame_index=1, timestamp="")
    assert not state.needs_frame("cam1")  # enforce stream FPS before rendering
    now[0] += .13
    assert state.needs_frame("cam1")
    assert not state.needs_frame("cam2")
    now[0] += 5.
    assert not state.needs_frame("cam1")  # disconnected viewer expires
    state.close()


def test_status_read_does_not_subscribe_and_snapshot_cache_is_immutable():
    state = RuntimeState()
    original = {"frame_index": 2, "nested": {"owner": 4}}
    try:
        state.publish_snapshot(original)
        cached = state.snapshot_json()
        original["nested"]["owner"] = 99
        state.snapshot()["nested"]["owner"] = 88
        assert json.loads(cached)["nested"]["owner"] == 4
        assert state.snapshot_json() is cached
        assert state.available_cameras() == []
        assert not state.needs_frame("cam1")
    finally:
        state.close()


def gate_config(unit="cm"):
    return {
        "coordinate_space": "world",
        "unit": unit,
        "entry_gate": {
            "p1": {"x": 1, "y": 2},
            "p2": {"x": 3, "y": 2},
            "direction": "positive",
        },
        "exit_gate": {
            "p1": {"x": 8, "y": 9},
            "p2": {"x": 10, "y": 9},
            "direction": "negative",
        },
    }


def test_frontend_gate_config_is_saved_atomically_in_world_coordinates(tmp_path):
    path = tmp_path / "config" / "gate_zones.json"

    saved = save_gate_config(path, gate_config(), "cm")

    assert saved["source"] == "frontend_shared_map"
    assert saved["entry_gate"]["p1"] == {"x": 1.0, "y": 2.0}
    assert path.read_text(encoding="utf-8").endswith("\n")
    assert not path.with_suffix(".json.tmp").exists()


def test_gate_config_must_match_runtime_unit():
    with pytest.raises(ValueError, match="does not match runtime unit"):
        normalize_gate_config(gate_config("m"), "cm")


def test_gate_endpoints_must_not_overlap():
    payload = gate_config()
    payload["entry_gate"]["p2"] = {"x": 1, "y": 2}

    with pytest.raises(ValueError, match="endpoints must be different"):
        normalize_gate_config(payload, "cm")


def test_runtime_gate_endpoint_saves_without_opening_another_camera(tmp_path):
    state = RuntimeState()
    state.publish_snapshot({
        "frame_index": 1,
        "coordinate_space": {"unit": "cm"},
        "slot_layout": [],
    })
    path = tmp_path / "gate_zones.json"
    server = RuntimeHTTPServer(("127.0.0.1", 0), state, path)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    url = f"http://127.0.0.1:{server.server_address[1]}/api/runtime/gates"
    try:
        request = Request(
            url,
            data=json.dumps(gate_config()).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urlopen(request, timeout=2) as response:
            saved = json.loads(response.read().decode("utf-8"))
        with urlopen(url, timeout=2) as response:
            loaded = json.loads(response.read().decode("utf-8"))
        assert saved == loaded
        assert loaded["coordinate_space"] == "world"
    finally:
        state.close()
        server.shutdown()
        server.server_close()
        thread.join(timeout=2)
