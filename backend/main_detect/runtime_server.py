"""Serve TechGAR two-camera runtime state and annotated MJPEG streams."""

from __future__ import annotations

import argparse
import copy
import json
import math
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any, Callable, Optional
from urllib.parse import urlparse

import cv2

import two_camera
from run_two_camera_session import make_parser, prepare_args


DEFAULT_GATE_CONFIG = Path(__file__).resolve().parent / "config" / "gate_zones.json"


def _gate_point(value: Any) -> dict[str, float]:
    if not isinstance(value, dict):
        raise ValueError("Gate point must be an object with x and y")
    point = {"x": float(value["x"]), "y": float(value["y"])}
    if not all(math.isfinite(coordinate) for coordinate in point.values()):
        raise ValueError("Gate coordinates must be finite")
    return point


def _gate_line(name: str, value: Any) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise ValueError(f"Missing {name}")
    direction = str(value.get("direction", "")).lower()
    if direction not in {"positive", "negative"}:
        raise ValueError(f"{name}.direction must be positive or negative")
    p1 = _gate_point(value.get("p1"))
    p2 = _gate_point(value.get("p2"))
    if math.hypot(p2["x"] - p1["x"], p2["y"] - p1["y"]) < 1e-6:
        raise ValueError(f"{name} endpoints must be different")
    return {
        "name": str(value.get("name") or name),
        "p1": p1,
        "p2": p2,
        "direction": direction,
    }


def normalize_gate_config(payload: Any, runtime_unit: Optional[str] = None) -> dict[str, Any]:
    if not isinstance(payload, dict):
        raise ValueError("Gate config must be a JSON object")
    if payload.get("coordinate_space") != "world":
        raise ValueError("Gate config coordinate_space must be world")
    unit = str(payload.get("unit") or "")
    if not unit:
        raise ValueError("Gate config unit is required")
    if runtime_unit and unit != runtime_unit:
        raise ValueError(f"Gate config unit {unit!r} does not match runtime unit {runtime_unit!r}")
    return {
        "schema_version": 1,
        "coordinate_space": "world",
        "unit": unit,
        "source": "frontend_shared_map",
        "entry_gate": _gate_line("entry_gate", payload.get("entry_gate")),
        "exit_gate": _gate_line("exit_gate", payload.get("exit_gate")),
    }


def save_gate_config(path: Path, payload: Any, runtime_unit: Optional[str]) -> dict[str, Any]:
    normalized = normalize_gate_config(payload, runtime_unit)
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(
        json.dumps(normalized, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    temporary.replace(path)
    return normalized


class RuntimeState:
    def __init__(self, stream_fps: float = 8.0, jpeg_quality: int = 80) -> None:
        self._condition = threading.Condition()
        self._snapshot: Optional[dict[str, Any]] = None
        self._snapshot_json: Optional[bytes] = None
        self._frames: dict[str, tuple[int, bytes]] = {}
        self._last_encoded_at: dict[str, float] = {}
        self._last_submitted_at: dict[str, float] = {}
        self._frame_requested_at: dict[str, float] = {}
        self._pending_frames: dict[
            str, tuple[int, object, Optional[Callable[[object], object]]]
        ] = {}
        self._stream_interval = 1.0 / max(float(stream_fps), 0.1)
        self._jpeg_quality = max(30, min(95, int(jpeg_quality)))
        self._closed = False
        self._encoder_thread = threading.Thread(
            target=self._encode_latest_frames,
            name="runtime-jpeg-encoder",
            daemon=True,
        )
        self._encoder_thread.start()

    def publish_snapshot(self, snapshot: dict[str, Any]) -> None:
        # Freeze and serialize outside the shared condition. HTTP readers only
        # hold the lock long enough to copy an immutable bytes reference.
        frozen = copy.deepcopy(snapshot)
        encoded = json.dumps(frozen, ensure_ascii=False).encode("utf-8")
        with self._condition:
            self._snapshot = frozen
            self._snapshot_json = encoded
            self._condition.notify_all()

    def publish_frame(
        self,
        camera_id: str,
        frame,
        *,
        frame_index: int,
        timestamp: str,
        renderer: Optional[Callable[[object], object]] = None,
    ) -> None:
        del timestamp
        now = time.monotonic()
        owned_frame = frame.copy()
        with self._condition:
            if self._closed:
                return
            if now - self._last_submitted_at.get(camera_id, 0.0) < self._stream_interval:
                return
            self._last_submitted_at[camera_id] = now
            # Latest-only mailbox: a slow browser/JPEG encoder cannot build a
            # queue that stalls tracking or shows increasingly old frames.
            self._pending_frames[camera_id] = (
                int(frame_index), owned_frame, renderer
            )
            self._condition.notify_all()

    def _encode_latest_frames(self) -> None:
        while True:
            with self._condition:
                self._condition.wait_for(
                    lambda: self._closed or bool(self._pending_frames)
                )
                if self._closed and not self._pending_frames:
                    return
                camera_id, (frame_index, frame, renderer) = min(
                    self._pending_frames.items(), key=lambda item: item[1][0]
                )
                self._pending_frames.pop(camera_id, None)
            try:
                rendered = renderer(frame) if renderer is not None else frame
                ok, encoded = cv2.imencode(
                    ".jpg",
                    rendered,
                    [cv2.IMWRITE_JPEG_QUALITY, self._jpeg_quality],
                )
            except Exception as error:  # pragma: no cover - runtime boundary
                print(f"[runtime-stream] Khong render duoc {camera_id}: {error}")
                continue
            if not ok:
                continue
            completed_at = time.monotonic()
            with self._condition:
                previous = self._frames.get(camera_id)
                if previous is None or frame_index > previous[0]:
                    self._frames[camera_id] = (frame_index, encoded.tobytes())
                    self._last_encoded_at[camera_id] = completed_at
                    self._condition.notify_all()

    def needs_frame(self, camera_id: str) -> bool:
        """No debug rendering/encoding when only the JSON map is subscribed."""
        now = time.monotonic()
        with self._condition:
            requested = self._frame_requested_at.get(camera_id)
            return (not self._closed and requested is not None
                    and now - requested <= 5.0
                    and now - self._last_submitted_at.get(camera_id, 0.) >= self._stream_interval)

    def snapshot(self) -> Optional[dict[str, Any]]:
        with self._condition:
            snapshot = self._snapshot
        return copy.deepcopy(snapshot)

    def snapshot_json(self) -> Optional[bytes]:
        with self._condition:
            return self._snapshot_json

    def frame(self, camera_id: str) -> Optional[tuple[int, bytes]]:
        with self._condition:
            self._frame_requested_at[camera_id] = time.monotonic()
            return self._frames.get(camera_id)

    def available_cameras(self) -> list[str]:
        """Read status without subscribing to or activating expensive streams."""
        with self._condition:
            return list(self._frames)

    def wait_for_frame(
        self,
        camera_id: str,
        after_sequence: int,
        timeout: float = 2.0,
    ) -> Optional[tuple[int, bytes]]:
        with self._condition:
            self._frame_requested_at[camera_id] = time.monotonic()
            self._condition.wait_for(
                lambda: (
                    self._closed
                    or
                    camera_id in self._frames
                    and self._frames[camera_id][0] > after_sequence
                ),
                timeout=timeout,
            )
            if self._closed:
                return None
            return self._frames.get(camera_id)

    def close(self) -> None:
        with self._condition:
            self._closed = True
            self._pending_frames.clear()
            self._condition.notify_all()
        if threading.current_thread() is not self._encoder_thread:
            self._encoder_thread.join(timeout=2.0)


class RuntimeHTTPServer(ThreadingHTTPServer):
    daemon_threads = True
    block_on_close = False

    def __init__(
        self,
        address,
        state: RuntimeState,
        gate_config_path: Path = DEFAULT_GATE_CONFIG,
    ) -> None:
        super().__init__(address, RuntimeRequestHandler)
        self.runtime_state = state
        self.gate_config_path = gate_config_path


class RuntimeRequestHandler(BaseHTTPRequestHandler):
    server: RuntimeHTTPServer

    def _cors(self) -> None:
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Cache-Control", "no-store")

    def _json(self, payload: Any, status: int = 200) -> None:
        encoded = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self._json_bytes(encoded, status)

    def _json_bytes(self, encoded: bytes, status: int = 200) -> None:
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(encoded)))
        self._cors()
        self.end_headers()
        self.wfile.write(encoded)

    def do_OPTIONS(self) -> None:
        self.send_response(204)
        self._cors()
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_GET(self) -> None:
        path = urlparse(self.path).path
        if path == "/api/runtime/status":
            snapshot = self.server.runtime_state.snapshot()
            self._json(
                {
                    "running": snapshot is not None,
                    "frame_index": snapshot.get("frame_index") if snapshot else None,
                    "timestamp": snapshot.get("timestamp") if snapshot else None,
                    "cameras": self.server.runtime_state.available_cameras(),
                }
            )
            return
        if path in {"/api/runtime/snapshot", "/api/runtime/map"}:
            if path.endswith("/snapshot"):
                encoded = self.server.runtime_state.snapshot_json()
                if encoded is None:
                    self._json({"error": "Runtime snapshot is not ready"}, 503)
                else:
                    self._json_bytes(encoded)
                return
            snapshot = self.server.runtime_state.snapshot()
            if snapshot is None:
                self._json({"error": "Runtime snapshot is not ready"}, 503)
            elif path.endswith("/map"):
                self._json(
                    {
                        "coordinate_space": snapshot["coordinate_space"],
                        "slot_layout": snapshot["slot_layout"],
                    }
                )
            else:
                encoded = self.server.runtime_state.snapshot_json()
                if encoded is None:
                    self._json({"error": "Runtime snapshot is not ready"}, 503)
                else:
                    self._json_bytes(encoded)
            return
        if path == "/api/runtime/events":
            snapshot = self.server.runtime_state.snapshot()
            self._json(snapshot.get("recent_events", []) if snapshot else [])
            return
        if path == "/api/runtime/gates":
            try:
                payload = json.loads(self.server.gate_config_path.read_text(encoding="utf-8"))
                self._json(normalize_gate_config(payload))
            except FileNotFoundError:
                self._json(
                    {"error": "Gate config has not been created", "code": "GATE_CONFIG_NOT_FOUND"},
                    404,
                )
            except (OSError, json.JSONDecodeError, ValueError) as error:
                self._json({"error": str(error), "code": "INVALID_GATE_CONFIG"}, 500)
            return
        for camera_id in ("cam1", "cam2"):
            if path == f"/api/runtime/cameras/{camera_id}.jpg":
                self._serve_jpeg(camera_id)
                return
            if path == f"/api/runtime/cameras/{camera_id}.mjpg":
                self._serve_mjpeg(camera_id)
                return
        self._json({"error": "Route not found"}, 404)

    def do_POST(self) -> None:
        path = urlparse(self.path).path
        if path != "/api/runtime/gates":
            self._json({"error": "Route not found"}, 404)
            return
        try:
            length = int(self.headers.get("Content-Length", 0))
            payload = json.loads(self.rfile.read(length).decode("utf-8")) if length else None
            snapshot = self.server.runtime_state.snapshot()
            if snapshot is None:
                self._json({"error": "Runtime snapshot is not ready"}, 503)
                return
            runtime_unit = str((snapshot.get("coordinate_space") or {}).get("unit") or "")
            saved = save_gate_config(self.server.gate_config_path, payload, runtime_unit)
            self._json(saved)
        except (json.JSONDecodeError, KeyError, TypeError, ValueError) as error:
            self._json({"error": str(error), "code": "INVALID_GATE_CONFIG"}, 400)
        except OSError as error:
            self._json({"error": str(error), "code": "GATE_CONFIG_WRITE_FAILED"}, 500)

    def _serve_jpeg(self, camera_id: str) -> None:
        item = self.server.runtime_state.frame(camera_id)
        if item is None:
            item = self.server.runtime_state.wait_for_frame(camera_id, -1)
        if item is None:
            self._json({"error": f"{camera_id} frame is not ready"}, 503)
            return
        _, jpeg = item
        self.send_response(200)
        self.send_header("Content-Type", "image/jpeg")
        self.send_header("Content-Length", str(len(jpeg)))
        self._cors()
        self.end_headers()
        self.wfile.write(jpeg)

    def _serve_mjpeg(self, camera_id: str) -> None:
        self.send_response(200)
        self.send_header("Content-Type", "multipart/x-mixed-replace; boundary=frame")
        self._cors()
        self.end_headers()
        sequence = -1
        try:
            while True:
                item = self.server.runtime_state.wait_for_frame(camera_id, sequence)
                if item is None:
                    return
                if item[0] <= sequence:
                    continue
                sequence, jpeg = item
                self.wfile.write(b"--frame\r\n")
                self.wfile.write(b"Content-Type: image/jpeg\r\n")
                self.wfile.write(f"Content-Length: {len(jpeg)}\r\n\r\n".encode("ascii"))
                self.wfile.write(jpeg)
                self.wfile.write(b"\r\n")
                self.wfile.flush()
        except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError):
            return

    def log_message(self, format: str, *args) -> None:
        if ".mjpg" not in format % args:
            super().log_message(format, *args)


def parser() -> argparse.ArgumentParser:
    result = make_parser()
    result.description = "TechGAR two-camera runtime API and MJPEG server"
    result.add_argument("--api-host", default="0.0.0.0")
    result.add_argument("--api-port", type=int, default=8001)
    result.add_argument("--stream-fps", type=float, default=8.0)
    result.add_argument("--jpeg-quality", type=int, default=80)
    return result


def main() -> None:
    two_camera.configure_console_utf8()
    argument_parser = parser()
    args = prepare_args(argument_parser, argument_parser.parse_args())
    state = RuntimeState(args.stream_fps, args.jpeg_quality)
    server = RuntimeHTTPServer((args.api_host, args.api_port), state)
    api_thread = threading.Thread(target=server.serve_forever, daemon=True)
    api_thread.start()
    print(f"Runtime API: http://{args.api_host}:{args.api_port}/api/runtime/status")
    try:
        two_camera.run(args, runtime_publisher=state)
    finally:
        state.close()
        server.shutdown()
        server.server_close()
        api_thread.join(timeout=2.0)


if __name__ == "__main__":
    main()
