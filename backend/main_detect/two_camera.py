"""Run TechGAR tracking and parking on two real camera streams.

This entrypoint accepts two independent MJPEG/RTSP feeds or recorded video
files and drives the shared-map tracking, slot binding, and runtime API.
"""

from __future__ import annotations

import argparse
import copy
import csv
import gzip
import hashlib
import importlib.metadata
import json
import os
import queue
import subprocess
import sys
import time
import threading
import uuid
from collections import deque
from concurrent.futures import Future, ThreadPoolExecutor
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Callable, Optional

import cv2
import numpy as np
from lap import lapjv

PROJECT_ROOT = Path(__file__).resolve().parent
SRC_DIR = PROJECT_ROOT / "src"
if str(SRC_DIR) not in sys.path:
    sys.path.insert(0, str(SRC_DIR))

from techgar.cross_camera_manager import CrossCameraManager
from techgar.latest_frame_capture import LatestFrameCapture
from techgar.latest_render_queue import LatestRenderQueue
from techgar.async_video_process import AsyncVideoProcess
from techgar.live_roi_editor import LiveROIEditor, MAIN_WINDOW
from techgar.motion_tracker import MotionVehicleTracker
from techgar.overlay_interpolation import draw_boxes, interpolate_box
from techgar.parking_detector import ParkingDetector
from techgar.parking_event_scheduler import ParkingEventScheduler
from techgar.parking_process import (
    ParkingProcessPool, restore_process_affinity, split_live_parking_affinity,
)
from techgar.prediction_writer import PredictionV3Builder
from techgar.runtime_contract import build_runtime_snapshot
from techgar.slot_vehicle_binder import SlotVehicleBinder


def configure_console_utf8() -> None:
    """Prevent Windows legacy console encodings from crashing runtime logs."""
    for stream in (sys.stdout, sys.stderr):
        reconfigure = getattr(stream, "reconfigure", None)
        if reconfigure is None:
            continue
        try:
            reconfigure(encoding="utf-8", errors="replace")
        except (AttributeError, OSError, ValueError):
            # Test capture streams and embedded hosts need not be reconfigured.
            pass


@dataclass(frozen=True)
class ReplayFrameTiming:
    """Recorded timing for one synchronized pair of session frames."""

    frame_idx: int
    camera_timestamps_ns: dict[str, int]
    capture_unix_ns: int
    wall_time_iso: str


@dataclass
class PendingParkingJob:
    """One camera-local parking job and the timestamp of its source frame."""

    future: Future
    frame_idx: int
    timestamp_s: float
    job_id: str
    submitted_at_s: float


def finish_recording_actions(actions: list[Callable[[], object]]) -> bool:
    """Finish the current frame record before honoring Ctrl+C.

    On Windows, ``KeyboardInterrupt`` can arrive between individual video and
    JSON writes. Completing the remaining tiny writes keeps raw videos,
    timestamps and predictions on the same frame count.
    """
    interrupted = False
    for action in actions:
        try:
            action()
        except KeyboardInterrupt:
            interrupted = True
    return interrupted


def counted_recording_action(
    counts: dict[str, int],
    channel: str,
    action: Callable[[], object],
) -> Callable[[], object]:
    """Count a channel only after its frame write returned successfully."""
    def run_action() -> object:
        result = action()
        counts[channel] = counts.get(channel, 0) + 1
        return result

    return run_action


def file_sha256(path: Path) -> Optional[str]:
    """Return a reproducibility hash without failing a recording shutdown."""
    try:
        return hashlib.sha256(path.read_bytes()).hexdigest()
    except OSError:
        return None


def git_revision(path: Path) -> Optional[str]:
    """Return the source revision when this checkout is a Git worktree."""
    try:
        completed = subprocess.run(
            ["git", "rev-parse", "HEAD"],
            cwd=path,
            check=True,
            capture_output=True,
            text=True,
            timeout=3,
        )
    except (OSError, subprocess.SubprocessError):
        return None
    return completed.stdout.strip() or None


def dependency_versions() -> dict[str, str]:
    """Small dependency snapshot used to reproduce an experiment session."""
    versions = {
        "python": sys.version.split()[0],
        "opencv-python": str(cv2.__version__),
        "numpy": str(np.__version__),
    }
    try:
        versions["lap"] = importlib.metadata.version("lap")
    except importlib.metadata.PackageNotFoundError:
        versions["lap"] = "unknown"
    return versions


class ReplaySession:
    """Read a recorded two-camera session as deterministic frame pairs."""

    REQUIRED_TIMESTAMP_COLUMNS = {
        "frame_idx",
        "cam1_monotonic_ns",
        "cam2_monotonic_ns",
    }

    def __init__(
        self,
        session_dir: Path,
        capture_factory: Callable = cv2.VideoCapture,
        prefetch_capacity: int = 16,
        start_frame: int = 1,
    ) -> None:
        self.session_dir = Path(session_dir).resolve()
        if not self.session_dir.is_dir():
            raise FileNotFoundError(f"Khong tim thay replay session: {self.session_dir}")

        timestamps_path = self.session_dir / "frame_timestamps.csv"
        if not timestamps_path.is_file():
            raise FileNotFoundError(f"Replay session thieu file: {timestamps_path}")
        self.timings = self._load_timings(timestamps_path)
        if not 1 <= start_frame <= len(self.timings):
            raise ValueError(
                f"--start-frame phai trong [1, {len(self.timings)}], nhan {start_frame}"
            )
        self._next_index = start_frame - 1
        self._eof_checked = False
        self.captures = {}
        try:
            for camera_id in ("cam1", "cam2"):
                video_path = self.session_dir / f"raw_{camera_id}.mp4"
                if not video_path.is_file():
                    raise FileNotFoundError(f"Replay session thieu file: {video_path}")
                capture = capture_factory(str(video_path))
                if not capture.isOpened():
                    capture.release()
                    raise RuntimeError(f"Khong mo duoc replay video: {video_path}")
                self.captures[camera_id] = capture
                if start_frame > 1:
                    if not capture.set(cv2.CAP_PROP_POS_FRAMES, start_frame - 1):
                        raise RuntimeError(
                            f"Khong seek duoc {camera_id} toi frame {start_frame}"
                        )
                    position = capture.get(cv2.CAP_PROP_POS_FRAMES)
                    if abs(position - (start_frame - 1)) > 0.5:
                        raise RuntimeError(
                            f"Seek {camera_id} sai vi tri: mong doi {start_frame - 1}, nhan {position}"
                        )
        except Exception:
            self.release()
            raise

        self._prefetch_capacity = max(0, int(prefetch_capacity))
        self._queue: queue.Queue = queue.Queue(maxsize=max(1, self._prefetch_capacity))
        self._stop_event = threading.Event()
        self._eof_reached = False
        self._thread: Optional[threading.Thread] = None
        if self._prefetch_capacity > 0:
            self._thread = threading.Thread(
                target=self._prefetch_worker,
                name="replay-session-prefetch",
                daemon=True,
            )
            self._thread.start()

    @classmethod
    def _load_timings(cls, path: Path) -> list[ReplayFrameTiming]:
        with path.open("r", newline="", encoding="utf-8-sig") as source:
            reader = csv.DictReader(source)
            columns = set(reader.fieldnames or [])
            missing = cls.REQUIRED_TIMESTAMP_COLUMNS - columns
            if missing:
                raise ValueError(
                    "frame_timestamps.csv thieu cot: " + ", ".join(sorted(missing))
                )
            timings = []
            previous_timestamps = {"cam1": None, "cam2": None}
            for expected_idx, row in enumerate(reader, start=1):
                try:
                    frame_idx = int(row["frame_idx"])
                    camera_timestamps_ns = {
                        "cam1": int(row["cam1_monotonic_ns"]),
                        "cam2": int(row["cam2_monotonic_ns"]),
                    }
                except (TypeError, ValueError) as exc:
                    raise ValueError(
                        f"Timestamp khong hop le tai dong frame {expected_idx}"
                    ) from exc
                if frame_idx != expected_idx:
                    raise ValueError(
                        "frame_timestamps.csv phai lien tuc tu 1; "
                        f"mong doi {expected_idx}, nhan {frame_idx}"
                    )
                for camera_id, timestamp_ns in camera_timestamps_ns.items():
                    previous = previous_timestamps[camera_id]
                    # Latest-frame capture may legitimately repeat one camera
                    # while waiting for its partner. Equality means a repeated
                    # source frame; only a backwards timestamp corrupts replay.
                    if timestamp_ns <= 0 or (previous is not None and timestamp_ns < previous):
                        raise ValueError(
                            f"Timestamp cua {camera_id} di lui tai frame {frame_idx}"
                        )
                    previous_timestamps[camera_id] = timestamp_ns
                timings.append(ReplayFrameTiming(
                    frame_idx=frame_idx,
                    camera_timestamps_ns=camera_timestamps_ns,
                    capture_unix_ns=int(row.get("capture_unix_ns") or 0),
                    wall_time_iso=str(row.get("wall_time_iso", "")),
                ))
        if not timings:
            raise ValueError(f"Replay session khong co timestamp: {path}")
        return timings

    def _prefetch_worker(self) -> None:
        try:
            for timing in self.timings[self._next_index:]:
                if self._stop_event.is_set():
                    return
                frames = {}
                for camera_id, capture in self.captures.items():
                    ok, frame = capture.read()
                    if not ok or frame is None:
                        raise RuntimeError(
                            f"Replay {camera_id} ket thuc som truoc frame {timing.frame_idx}"
                        )
                    frames[camera_id] = frame
                sequences = {camera_id: timing.frame_idx for camera_id in frames}
                item = (frames, sequences, dict(timing.camera_timestamps_ns), timing)
                while not self._stop_event.is_set():
                    try:
                        self._queue.put(item, timeout=0.05)
                        break
                    except queue.Full:
                        continue
                if self._stop_event.is_set():
                    return

            if not self._stop_event.is_set():
                extra_frames = {}
                for camera_id, capture in self.captures.items():
                    ok, frame = capture.read()
                    extra_frames[camera_id] = bool(ok and frame is not None)
                if any(extra_frames.values()):
                    cameras = ", ".join(
                        camera_id for camera_id, has_frame in extra_frames.items() if has_frame
                    )
                    raise RuntimeError(
                        "Replay video co nhieu frame hon frame_timestamps.csv: " + cameras
                    )

            while not self._stop_event.is_set():
                try:
                    self._queue.put(None, timeout=0.05)
                    break
                except queue.Full:
                    continue
        except Exception as exc:
            while not self._stop_event.is_set():
                try:
                    self._queue.put(exc, timeout=0.05)
                    break
                except queue.Full:
                    continue

    def read_pair(self) -> Optional[tuple[dict, dict, dict, ReplayFrameTiming]]:
        """Return the next atomic frame pair, or ``None`` at an exact clean EOF."""
        if self._prefetch_capacity > 0:
            if self._eof_reached:
                return None
            while True:
                try:
                    item = self._queue.get(timeout=0.1)
                    break
                except queue.Empty:
                    if self._thread is not None and not self._thread.is_alive():
                        raise RuntimeError("Replay prefetch worker da ket thuc dot ngot")
                    if self._stop_event.is_set():
                        return None
            if isinstance(item, Exception):
                self._eof_reached = True
                raise item
            if item is None:
                self._eof_reached = True
                return None
            self._next_index += 1
            return item

        if self._next_index >= len(self.timings):
            if not self._eof_checked:
                extra_frames = {}
                for camera_id, capture in self.captures.items():
                    ok, frame = capture.read()
                    extra_frames[camera_id] = bool(ok and frame is not None)
                self._eof_checked = True
                if any(extra_frames.values()):
                    cameras = ", ".join(
                        camera_id for camera_id, has_frame in extra_frames.items() if has_frame
                    )
                    raise RuntimeError(
                        "Replay video co nhieu frame hon frame_timestamps.csv: " + cameras
                    )
            return None

        timing = self.timings[self._next_index]
        frames = {}
        for camera_id, capture in self.captures.items():
            ok, frame = capture.read()
            if not ok or frame is None:
                raise RuntimeError(
                    f"Replay {camera_id} ket thuc som truoc frame {timing.frame_idx}"
                )
            frames[camera_id] = frame
        self._next_index += 1
        sequences = {camera_id: timing.frame_idx for camera_id in frames}
        return frames, sequences, dict(timing.camera_timestamps_ns), timing

    def release(self) -> None:
        self._stop_event.set()
        if hasattr(self, "_queue"):
            while not self._queue.empty():
                try:
                    self._queue.get_nowait()
                except (queue.Empty, AttributeError):
                    break
        if getattr(self, "_thread", None) is not None and self._thread.is_alive():
            self._thread.join(timeout=1.0)
        for capture in self.captures.values():
            capture.release()
        self.captures.clear()


def warmup_replay_motion(
    replay: ReplaySession, trackers: dict, first_pair: tuple, start_frame: int,
) -> tuple:
    """Train only camera-local MOG2/temporal history before a replay seek.

    Leave track association, global identities, binder, and parking untouched.
    Use relative indices ending at zero so the next processed frame is one.
    """
    pair = first_pair
    warmed = 0
    while pair[3].frame_idx < start_frame:
        frames, _sequences, timestamps_ns, timing = pair
        for camera_id, tracker in trackers.items():
            tracker.prepare_motion_frame(
                frames[camera_id], timestamps_ns[camera_id] / 1e9,
                timing.frame_idx - start_frame + 1,
            )
        warmed += 1
        pair = replay.read_pair()
        if pair is None:
            raise RuntimeError(f"Replay ket thuc khi warm-up truoc frame {start_frame}")
    if pair[3].frame_idx != start_frame:
        raise RuntimeError(
            f"Replay seek sai timestamp: mong doi {start_frame}, nhan {pair[3].frame_idx}"
        )
    if warmed:
        print(f"[P35_SEEK] start_frame={start_frame} mog2_warmup_frames={warmed}", flush=True)
    return pair


class MotionReadAhead:
    """One pending pair: decode and precompute motion while cross/IO runs.

    Only camera-local background/temporal masks advance in the worker. The
    caller still runs association and all cross-camera identity updates in
    strictly increasing frame order, after the previous frame is finished.
    """

    def __init__(self, read_pair: Callable, trackers: dict, motion_pool: ThreadPoolExecutor):
        self._read_pair = read_pair
        self._trackers = trackers
        self._motion_pool = motion_pool
        self._worker = ThreadPoolExecutor(max_workers=1, thread_name_prefix="motion-read-ahead")
        self._pending: Optional[Future] = None

    def start_next(self) -> None:
        if self._pending is not None:
            raise RuntimeError("Motion read-ahead already has a pending frame")
        self._pending = self._worker.submit(self._prepare_next)

    def _prepare_next(self) -> Optional[tuple]:
        pair = self._read_pair()
        if pair is None:
            return None
        frames, sequences, timestamps_ns, timing = pair
        tasks = {
            camera_id: self._motion_pool.submit(
                tracker.prepare_motion_frame,
                frames[camera_id],
                timestamps_ns[camera_id] / 1e9,
                tracker.frame_index + 1,
            )
            for camera_id, tracker in self._trackers.items()
        }
        prepared = {camera_id: task.result() for camera_id, task in tasks.items()}
        return frames, sequences, timestamps_ns, timing, prepared

    def take_next(self) -> Optional[tuple]:
        pending = self._pending
        if pending is None:
            raise RuntimeError("Motion read-ahead has no pending frame")
        try:
            return pending.result()
        finally:
            self._pending = None

    def close(self) -> None:
        self._worker.shutdown(wait=True)


class Core2LDropReadAhead(MotionReadAhead):
    """Select one non-stale source pair, then detect it off the main thread.

    Only detector instances are touched here; camera views and the identity
    engine are updated by the main thread after take_next(). A selected pair is
    committed even if it becomes stale while its detection is in flight.
    """
    def __init__(self, replay, trackers, motion_pool, wall_started, source_started,
                 clock=time.monotonic):
        super().__init__(replay.read_pair, trackers, motion_pool)
        self.replay = replay
        self.wall_started = wall_started
        self.source_started = source_started
        self.clock = clock
        self.dropped = 0

    def _prepare_next(self):
        pair = self._read_pair()
        if pair is None:
            return None
        while self.replay._next_index < len(self.replay.timings):
            timing = pair[3]
            due = self.wall_started + max(timing.camera_timestamps_ns.values()) / 1e9 - self.source_started
            if self.clock() - due <= 0.300:
                break
            pair = self._read_pair()
            if pair is None:
                raise RuntimeError('Replay ended while discarding stale pair')
            self.dropped += 1
        frames, sequences, timestamps_ns, timing = pair
        tasks = {
            camera_id: self._motion_pool.submit(
                tracker.detector.step, frames[camera_id], timing.frame_idx,
                timestamps_ns[camera_id] / 1e9)
            for camera_id, tracker in self._trackers.items()
        }
        return frames, sequences, timestamps_ns, timing, {
            camera_id: task.result() for camera_id, task in tasks.items()
        }

def save_json(path: Path, payload: dict, *, tolerate_lock: bool = False) -> bool:
    temporary = path.with_name(f".{path.name}.{os.getpid()}.tmp")
    temporary.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    try:
        for attempt in range(4):
            try:
                temporary.replace(path)
                return True
            except PermissionError:
                if attempt == 3:
                    if tolerate_lock:
                        return False
                    raise
                time.sleep(0.01 * (attempt + 1))
    finally:
        temporary.unlink(missing_ok=True)


def _copy_json_snapshot(value):
    """Copy JSON-shaped snapshots without deepcopy's per-scalar dispatch."""
    kind = type(value)
    if kind is dict:
        return {key: _copy_json_snapshot(item) for key, item in value.items()}
    if kind is list:
        return [_copy_json_snapshot(item) for item in value]
    if kind is tuple:
        return tuple(_copy_json_snapshot(item) for item in value)
    if kind in (str, int, float, bool, type(None)):
        return value
    return copy.deepcopy(value)


class RuntimeJsonWriter:
    """One bounded disk worker: coalesce status, preserve every recording frame."""

    def __init__(self, *, fast_snapshot: bool = False, capacity: int = 2) -> None:
        if not 1 <= capacity <= 256:
            raise ValueError('prediction queue capacity must be between 1 and 256')
        self._fast_snapshot = fast_snapshot
        self._capacity = capacity
        self.prediction_wait_count = 0
        self.prediction_wait_ms = 0.0
        self.prediction_queue_peak = 0
        self._condition = threading.Condition()
        self._pending = deque()
        self._closing = False
        self._errors: list[Exception] = []
        self._sync_lock = threading.Lock()
        self._sync_fallback = False
        self._inflight = None
        self._inflight_position = None
        self._inflight_count = None
        self._worker = threading.Thread(target=self._run, name="techgar-json", daemon=False)
        self._worker.start()

    def _submit(self, kind: str, data: object, *, final: bool = False) -> None:
        with self._condition:
            if self._closing:
                raise RuntimeError("RuntimeJsonWriter already closed")
            if kind == "status":
                # Only the newest pending status matters. The executing batch
                # can finish independently without writes arriving out of order.
                self._pending = deque(item for item in self._pending if item[0] != "status")
            waited_at = None
            while len(self._pending) >= self._capacity and self._worker.is_alive():
                if kind == "status" and not final:
                    return  # Two mandatory prediction frames have priority.
                # Wake periodically: a worker killed by BaseException will not
                # notify this condition, and the producer must not hang.
                if kind == 'prediction' and waited_at is None:
                    waited_at = time.perf_counter()
                    self.prediction_wait_count += 1
                self._condition.wait(timeout=0.1)
            if waited_at is not None:
                self.prediction_wait_ms += (time.perf_counter() - waited_at) * 1000.0
            if kind == "status":
                # Freeze the snapshot on the producer thread; nested binder
                # and recovery structures can change on the next frame.
                data = copy.deepcopy(data)
            self._pending.append((kind, data, final))
            self.prediction_queue_peak = max(self.prediction_queue_peak, len(self._pending))
            if self._worker.is_alive():
                self._condition.notify_all()
                return
            if not self._sync_fallback:
                self._sync_fallback = True
                print("Canh bao: JSON worker da dung, chuyen sang ghi dong bo", flush=True)
        self._flush_sync()

    def submit_status(self, files: list[tuple[Path, dict]], *, final: bool = False) -> None:
        self._submit("status", files, final=final)

    def submit_prediction(
        self, output, payload: dict, counts: dict[str, int]
    ) -> None:
        # Freeze references before the main thread mutates live trackers.
        snapshot = _copy_json_snapshot(payload) if self._fast_snapshot else copy.deepcopy(payload)
        self._submit("prediction", (output, snapshot, counts))

    @staticmethod
    def _write_item(item) -> None:
        kind, data, final = item
        if kind == "status":
            for path, payload in data:
                if not save_json(path, payload, tolerate_lock=not final):
                    print(f"Canh bao: JSON runtime dang bi khoa: {path}", flush=True)
        else:
            output, payload, counts = data
            output.write(json.dumps(payload, ensure_ascii=False) + "\n")
            counts["predictions"] = counts.get("predictions", 0) + 1

    def _flush_sync(self) -> None:
        """Replay pending writes in FIFO order once the worker has died."""
        with self._sync_lock:
            while True:
                with self._condition:
                    if self._inflight is not None:
                        item = self._inflight
                        self._inflight = None
                        if item[0] == "prediction":
                            output, _, counts = item[1]
                            if self._inflight_position is not None:
                                # A worker can die midway through write().
                                # Rewind the last line before replaying it.
                                output.seek(self._inflight_position)
                                output.truncate()
                                counts["predictions"] = self._inflight_count
                            elif (self._inflight_count is not None
                                  and counts.get("predictions", 0) != self._inflight_count):
                                # Non-seekable sink, write already completed.
                                continue
                    elif self._pending:
                        item = self._pending.popleft()
                    else:
                        return
                self._write_item(item)

    def _run(self) -> None:
        while True:
            with self._condition:
                while not self._pending and not self._closing:
                    self._condition.wait()
                if not self._pending:
                    return
                item = self._pending.popleft()
                self._inflight = item
                self._inflight_position = None
                self._inflight_count = None
                self._condition.notify_all()
            handled = False
            try:
                if item[0] == "prediction":
                    output, _, counts = item[1]
                    self._inflight_count = counts.get("predictions", 0)
                    try:
                        self._inflight_position = output.tell()
                    except (AttributeError, OSError, ValueError):
                        pass  # A non-seekable test/stream sink.
                self._write_item(item)
                handled = True
            except Exception as exc:
                with self._condition:
                    self._errors.append(exc)
                print(f"Loi ghi JSON nen: {exc!r}", flush=True)
                handled = True
            finally:
                # A BaseException still kills the worker; keep its in-flight
                # item for synchronous recovery by the producer or close().
                if handled:
                    with self._condition:
                        self._inflight = None
                        self._condition.notify_all()

    def close(self, final_status: Optional[list[tuple[Path, dict]]] = None) -> None:
        if final_status is not None:
            self.submit_status(final_status, final=True)
        with self._condition:
            self._closing = True
            self._condition.notify_all()
        self._worker.join()
        if not self._worker.is_alive():
            if (self._inflight is not None or self._pending) and not self._sync_fallback:
                self._sync_fallback = True
                print("Canh bao: JSON worker da dung, flush dong bo khi dong", flush=True)
            self._flush_sync()
        if self._errors:
            raise RuntimeError("Background JSON write failed") from self._errors[0]


class AsyncDebugVideoWriter:
    """Bounded background worker for encoding and writing debug video frames.

    Decouples cv2.VideoWriter compression from the main tracking loop:
      (1) Bounded queue, frames are copied (.copy()) before enqueueing.
      (2) FIFO ordering preserved; flushes all pending frames before releasing writers.
      (3) Queue-full condition explicitly counted (no silent drops), printed at
          run end, and recorded in performance.csv.
    """

    def __init__(self, maxsize: int = 128) -> None:
        self._maxsize = maxsize
        self._queue: queue.Queue = queue.Queue(maxsize=maxsize)
        self._dropped_frames = 0
        self._dropped_by_camera: dict[str, int] = {}
        self._closing = False
        self._lock = threading.Lock()
        self._worker = threading.Thread(
            target=self._run, name="techgar-debug-video", daemon=False
        )
        self._worker.start()

    @property
    def dropped_count(self) -> int:
        with self._lock:
            return self._dropped_frames

    @property
    def dropped_by_camera(self) -> dict[str, int]:
        with self._lock:
            return dict(self._dropped_by_camera)

    def submit(
        self,
        camera_id: str,
        writer: cv2.VideoWriter,
        frame: np.ndarray,
        counts: dict[str, int],
    ) -> None:
        if self._closing:
            return
        frame_copy = frame.copy()
        try:
            self._queue.put_nowait((camera_id, writer, frame_copy, counts))
        except queue.Full:
            with self._lock:
                self._dropped_frames += 1
                self._dropped_by_camera[camera_id] = (
                    self._dropped_by_camera.get(camera_id, 0) + 1
                )

    def _run(self) -> None:
        while True:
            item = self._queue.get()
            if item is None:
                self._queue.task_done()
                break
            camera_id, writer, frame, counts = item
            try:
                writer.write(frame)
                counts[f"debug_{camera_id}"] = counts.get(f"debug_{camera_id}", 0) + 1
            except Exception as exc:
                print(f"Loi ghi video debug {camera_id}: {exc!r}", flush=True)
            finally:
                self._queue.task_done()

    def close(self) -> None:
        if self._closing:
            return
        self._closing = True
        self._queue.put(None)
        self._worker.join()


def runtime_status_files(
    output_dir: Path, timestamp: str, frame_index: int, parking_by_camera: dict,
    registry: dict, recovery_diagnostics: dict, calibration_path: Path,
) -> list[tuple[Path, dict]]:
    files = [
        (output_dir / f"parking_status_{camera_id}.json", {
            "timestamp": timestamp, "frame_index": frame_index,
            "camera_id": camera_id, "parking_slots": camera_parking,
        })
        for camera_id, camera_parking in parking_by_camera.items()
    ]
    files.append((output_dir / "global_vehicle_registry.json", {
        "timestamp": timestamp, "frame_index": frame_index,
        "calibration": str(calibration_path),
        "parking_recovery": recovery_diagnostics,
        **registry,
    }))
    return files


def load_calibration(path: Path) -> tuple[dict, dict, dict, dict]:
    data = json.loads(path.read_text(encoding="utf-8"))
    reviewed_line_fit = False
    if data.get("calibration_algorithm") == "rectangle_line_v1":
        from tools.rectangle_line_calibration import fit_gate
        quality = data.get("calibration_quality", {})
        report = quality.get("rectangle_line_fit", {})
        reviewed_line_fit = (
            data.get("calibration_status") == "reviewed_fit"
            and data.get("visual_review", {}).get("accepted") is True
            and report.get("status") == "fit_ready"
            and report.get("point_count") == 8
            and set(quality.get("cameras", {})) == {"cam1", "cam2"}
            and not fit_gate(report, quality["cameras"], report.get("max_error_cm_limit", 2.0))
        )
        if not reviewed_line_fit:
            raise ValueError("Rectangle-line calibration chua duoc xem/xac nhan hoac fit khong dat")
    if int(data.get("schema_version", 0)) >= 5 and data.get("calibration_status") != "passed" and not reviewed_line_fit:
        raise ValueError(
            f"Calibration schema v5 chua duoc kich hoat: status={data.get('calibration_status')}"
        )
    transforms = data.get("camera_transforms", {})
    if set(transforms) != {"cam1", "cam2"}:
        raise ValueError("calibration phai co camera_transforms cho cam1 va cam2")
    matrices = {}
    for camera_id, matrix in transforms.items():
        value = np.asarray(matrix, dtype=np.float64)
        if value.shape != (3, 3) or not np.isfinite(value).all() or abs(np.linalg.det(value)) < 1e-12:
            raise ValueError(f"Homography khong hop le cho {camera_id}")
        matrices[camera_id] = value

    adjacency = {}
    for item in data.get("edge_adjacency", []):
        adjacency[(item["source_camera"], item["exit_edge"])] = item["target_camera"]
    required = {("cam1", "right"): "cam2", ("cam2", "left"): "cam1"}
    if adjacency != required:
        raise ValueError("edge_adjacency phai la cam1:right -> cam2 va cam2:left -> cam1")

    # A visually reviewed eight-point fit has fitted support, not an
    # independently validated whole-ground claim. Never substitute full frame.
    polygon = np.asarray(
        data.get("fitted_ground_overlap_world_polygon", []) if reviewed_line_fit else (
            data.get("validated_ground_overlap_world_polygon") or data.get("overlap_world_polygon", [])
        ),
        dtype=np.float32,
    )
    if polygon.ndim != 2 or polygon.shape[0] < 3 or polygon.shape[1] != 2 or not np.isfinite(polygon).all():
        raise ValueError("overlap_world_polygon phai co it nhat 3 diem [x, y]")
    exit_zones = {}
    for item in data.get("exit_zones", []):
        camera_id = str(item.get("camera", ""))
        exit_polygon = np.asarray(item.get("polygon", []), dtype=np.float32)
        if camera_id not in matrices:
            raise ValueError(f"exit_zone co camera khong hop le: {camera_id}")
        if exit_polygon.ndim != 2 or exit_polygon.shape[0] < 3 or exit_polygon.shape[1] != 2:
            raise ValueError(f"exit_zone cua {camera_id} phai co it nhat 3 diem [x, y]")
        exit_zones.setdefault(camera_id, []).append(exit_polygon)
    return matrices, adjacency, {("cam1", "cam2"): polygon}, exit_zones


def adapt_calibration_to_frame_sizes(
    calibration: dict,
    transforms: dict[str, np.ndarray],
    frame_sizes: dict[str, tuple[int, int]],
) -> dict[str, np.ndarray]:
    """Adapt pixel-domain H for uniform resizing; reject crop/aspect changes."""
    cameras = calibration.get("source", {}).get("capture_manifest", {}).get("cameras", {})
    if not cameras:
        return transforms
    adapted = {}
    for camera_id, transform in transforms.items():
        source = cameras.get(camera_id, {})
        if not source.get("width") or not source.get("height"):
            adapted[camera_id] = transform
            continue
        calibration_width = float(source["width"])
        calibration_height = float(source["height"])
        runtime_width, runtime_height = frame_sizes[camera_id]
        source_aspect = calibration_width / calibration_height
        runtime_aspect = float(runtime_width) / float(runtime_height)
        if abs(source_aspect - runtime_aspect) > 0.005:
            raise ValueError(
                f"{camera_id}: calibration {int(calibration_width)}x{int(calibration_height)} "
                f"khac ti le runtime {runtime_width}x{runtime_height}; "
                "khong duoc dung map cho crop/goc quay khac"
            )
        scale_x = calibration_width / float(runtime_width)
        scale_y = calibration_height / float(runtime_height)
        if abs(scale_x - scale_y) > max(scale_x, scale_y) * 0.005:
            raise ValueError(f"{camera_id}: runtime resize khong dong deu")
        adapted[camera_id] = transform @ np.asarray(
            ((scale_x, 0.0, 0.0), (0.0, scale_y, 0.0), (0.0, 0.0, 1.0)),
            dtype=np.float64,
        )
    return adapted


# Identity distance thresholds only mean something relative to the size of the
# vehicles they describe.  Every calibration file records its parking slots in
# world units, so the slot length is the one measured length available for any
# deployment; expressing the thresholds as multiples of it keeps a scale-model
# lot and a full-size car park on the same code path instead of on hand-tuned
# centimetre constants.
SLOT_MATCHING_MULTIPLES = {
    "handoff_match_distance": 1.75,
    "handoff_prediction_radius": 2.75,
    "dormant_match_distance": 1.75,
    "cross_camera_duplicate_distance": 0.50,
}


def median_slot_length(payload: dict) -> Optional[float]:
    """Median long edge of the calibrated parking slots, in world units."""
    slots = payload.get("parking_slots_world") or {}
    groups = list(slots.values()) if isinstance(slots, dict) else [slots]
    lengths = []
    for group in groups:
        for slot in group or ():
            polygon = slot.get("polygon") if isinstance(slot, dict) else None
            if not polygon or len(polygon) < 3:
                continue
            points = np.asarray(polygon, dtype=np.float32)
            if points.ndim != 2 or points.shape[1] != 2:
                continue
            (_center, (width, height), _angle) = cv2.minAreaRect(points)
            lengths.append(max(float(width), float(height)))
    if not lengths:
        return None
    return float(np.median(lengths))


def median_slot_width(payload: dict) -> Optional[float]:
    """Median **short** edge of the calibrated parking slots, in world units.

    Used to decide that two simultaneous measurements are far enough apart to
    be two different cars: one vehicle cannot occupy two spots at once.
    """
    slots = payload.get("parking_slots_world") or {}
    groups = list(slots.values()) if isinstance(slots, dict) else [slots]
    widths = []
    for group in groups:
        for slot in group or ():
            polygon = slot.get("polygon") if isinstance(slot, dict) else None
            if not polygon or len(polygon) < 3:
                continue
            points = np.asarray(polygon, dtype=np.float32)
            if points.ndim != 2 or points.shape[1] != 2:
                continue
            (_center, (width, height), _angle) = cv2.minAreaRect(points)
            widths.append(min(float(width), float(height)))
    if not widths:
        return None
    return float(np.median(widths))


def derive_matching_defaults(payload: dict) -> dict:
    """Matching distances implied by the calibrated slot geometry."""
    slot_length = median_slot_length(payload)
    if slot_length is None or slot_length <= 0.0:
        return {}
    return {
        name: round(slot_length * multiple, 3)
        for name, multiple in SLOT_MATCHING_MULTIPLES.items()
    }


def resolve_matching_distance(
    name: str,
    override: Optional[float],
    configured: Optional[float],
    derived: Optional[float],
    fallback: float,
) -> float:
    """Combine CLI, calibration and slot geometry for one distance threshold.

    An explicit command-line value always wins.  Otherwise the calibrated
    geometry acts as a ceiling: a calibration file may tighten a threshold but
    cannot stretch it past what the measured slot size can justify, which is
    how a stale file ends up granting re-identification across several vehicle
    lengths.
    """
    if override is not None:
        return float(override)
    if configured is None:
        return float(derived if derived is not None else fallback)
    if derived is None:
        return float(configured)
    return float(min(float(configured), float(derived)))


def synchronize_live_frames(
    captures: dict,
    frames: dict,
    capture_sequences: dict,
    capture_timestamps_ns: dict,
    max_skew_ms: float,
    max_catchup_reads: int,
) -> None:
    """Advance the older live stream until the two decode times are close."""
    if max_skew_ms <= 0 or len(capture_timestamps_ns) < 2:
        return
    max_skew_ns = int(max_skew_ms * 1_000_000)
    for _ in range(max(0, int(max_catchup_reads))):
        oldest_camera = min(capture_timestamps_ns, key=capture_timestamps_ns.get)
        newest_camera = max(capture_timestamps_ns, key=capture_timestamps_ns.get)
        if (
            capture_timestamps_ns[newest_camera]
            - capture_timestamps_ns[oldest_camera]
            <= max_skew_ns
        ):
            return
        capture = captures[oldest_camera]
        if not isinstance(capture, LatestFrameCapture):
            return
        try:
            frame, sequence, captured_at_ns = capture.read_latest_timed(
                after_sequence=capture_sequences[oldest_camera], timeout=0.5
            )
        except TimeoutError:
            return
        frames[oldest_camera] = frame
        capture_sequences[oldest_camera] = sequence
        capture_timestamps_ns[oldest_camera] = captured_at_ns


def detector_parameters(detector: ParkingDetector) -> dict:
    return {
        "base_gamma": float(detector.base_gamma),
        "base_clahe": float(detector.base_clahe),
        "clahe_grid": int(detector.clahe_grid),
        "ratio_thr": float(detector.ratio_thr),
        "edge_thr": float(detector.edge_thr),
        "use_edge_recheck": bool(detector.use_edge_recheck),
        "border_ignore_ratio": float(detector.border_ignore_ratio),
        "line_min_span_ratio": float(detector.line_min_span_ratio),
        "line_max_thickness_ratio": float(detector.line_max_thickness_ratio),
        "core_scale": float(detector.core_scale),
        "core_ratio_threshold": float(detector.core_ratio_threshold),
        "core_component_threshold": float(detector.core_component_threshold),
    }


def apply_detector_parameters(detector: ParkingDetector, values: dict) -> None:
    detector.base_gamma = max(0.1, float(values.get("base_gamma", detector.base_gamma)))
    detector.base_clahe = max(0.1, float(values.get("base_clahe", detector.base_clahe)))
    detector.clahe_grid = max(2, int(values.get("clahe_grid", detector.clahe_grid)))
    detector.ratio_thr = min(1.0, max(0.01, float(values.get("ratio_thr", detector.ratio_thr))))
    detector.edge_thr = min(1.0, max(0.01, float(values.get("edge_thr", detector.edge_thr))))
    detector.use_edge_recheck = bool(values.get("use_edge_recheck", detector.use_edge_recheck))
    detector.configure_roi_filter(values)
    # The real two-camera runner uses threshold pixels only, even with an old profile.
    detector.use_edge_recheck = False


def select_moving_tracks(
    active_tracks: dict,
    local_to_global: dict[int, int],
    parked_global_ids: set[int],
    canonicalize: Callable[[int], int],
) -> tuple[dict, dict[int, int]]:
    """Return visible non-parked tracks and their canonical Global IDs."""
    canonical_parked = {canonicalize(global_id) for global_id in parked_global_ids}
    moving_tracks = {}
    shown_ids = {}
    for local_id, track in active_tracks.items():
        global_id = local_to_global.get(local_id)
        if global_id is None:
            continue
        global_id = canonicalize(global_id)
        if global_id in canonical_parked:
            continue
        moving_tracks[local_id] = track
        shown_ids[local_id] = global_id
    return moving_tracks, shown_ids


def dropped_frame_overlay_boxes(
    previous: Optional[tuple[int, dict]],
    source_frame_idx: int,
    moving_tracks: dict,
    shown_ids: dict[int, int],
) -> tuple[list[tuple[float, float, float, float]], tuple[int, dict]]:
    """Display-only boxes at skipped source indices between two real sightings.

    Match by local track and unchanged GID; never use predicted/occluded tracks.
    Limit old gaps and drawings so a stalled stream cannot flood the overlay.
    Returned snapshots contain only primitive values, never live track objects.
    """
    observations = {}
    for local_id, track in moving_tracks.items():
        if (local_id not in shown_ids
                or int(getattr(track, "consecutive_invisible_count", 0)) != 0
                or getattr(track, "observation_kind", "detection") != "detection"):
            continue
        x, y, width, height = (float(value) for value in track.bbox)
        observations[local_id] = (
            int(shown_ids[local_id]), (x, y, x + width, y + height),
        )

    boxes = []
    if previous is not None:
        previous_idx, previous_observations = previous
        gap = int(source_frame_idx) - int(previous_idx)
        if 1 < gap <= 12:
            for local_id, (global_id, current_box) in observations.items():
                earlier = previous_observations.get(local_id)
                if earlier is None or earlier[0] != global_id:
                    continue
                for skipped_idx in range(max(previous_idx + 1, source_frame_idx - 3), source_frame_idx):
                    boxes.append(interpolate_box(
                        earlier[1], previous_idx, current_box, source_frame_idx, skipped_idx,
                    ))
    return boxes, (int(source_frame_idx), observations)


def is_interpolated_overlay_enabled(args: argparse.Namespace) -> bool:
    """CLI overrides the environment; both leave F3 disabled by default."""
    requested = getattr(args, "interpolate_overlay", None)
    return (os.environ.get("TECHGAR_F3_OVERLAY") == "1"
            if requested is None else bool(requested))


def _track_bbox(track) -> tuple[float, float, float, float]:
    bbox = getattr(track, "bbox", None)
    if bbox is None and isinstance(track, dict):
        bbox = track.get("bbox")
    if bbox is None:
        getter = track.get if isinstance(track, dict) else lambda key, default=0: getattr(track, key, default)
        bbox = (getter("x"), getter("y"), getter("w", 1), getter("h", 1))
    x, y, width, height = (float(value) for value in bbox)
    return x, y, max(1.0, width), max(1.0, height)


def _project_points_between_cameras(
    points,
    source_camera: str,
    target_camera: str,
    transforms: dict[str, np.ndarray],
) -> np.ndarray:
    """Project image points through the calibrated floor/world plane."""
    value = np.asarray(points, dtype=np.float64).reshape((-1, 1, 2))
    if source_camera == target_camera:
        return value.reshape((-1, 2)).astype(np.float32)
    source_to_world = np.asarray(transforms[source_camera], dtype=np.float64)
    world_to_target = np.linalg.inv(
        np.asarray(transforms[target_camera], dtype=np.float64)
    )
    world = cv2.perspectiveTransform(value, source_to_world)
    projected = cv2.perspectiveTransform(world, world_to_target).reshape((-1, 2))
    if not np.all(np.isfinite(projected)):
        raise ValueError("Recovery projection produced a non-finite point")
    return projected.astype(np.float32)


def _project_bbox_between_cameras(
    bbox,
    source_camera: str,
    target_camera: str,
    transforms: dict[str, np.ndarray],
) -> tuple[float, float, float, float]:
    x, y, width, height = (float(value) for value in bbox)
    corners = _project_points_between_cameras(
        [
            (x, y),
            (x + width, y),
            (x + width, y + height),
            (x, y + height),
        ],
        source_camera,
        target_camera,
        transforms,
    )
    minimum = np.min(corners, axis=0)
    maximum = np.max(corners, axis=0)
    return (
        float(minimum[0]),
        float(minimum[1]),
        max(1.0, float(maximum[0] - minimum[0])),
        max(1.0, float(maximum[1] - minimum[1])),
    )


def _recovery_bbox_anchor(
    bbox,
    anchor: str = "bottom_center",
) -> tuple[float, float]:
    """Return the image point used for all slot-recovery geometry.

    Real two-camera calibration currently selects ``bbox_center`` because the
    opposing views in the DroidCam rig see different apparent vehicle ends;
    their bbox centres align more reliably in the measured shared map. A rig
    whose homographies are calibrated strictly to ground-contact points may
    explicitly select ``bottom_center`` instead.

    ``build_recovery_track_payload`` always supplies the resulting point, so
    the binder's legacy bottom-centre fallback is never mixed with a
    bbox-centre recovery payload.
    """
    normalized = str(anchor).strip().lower()
    if normalized not in {"bbox_center", "bottom_center"}:
        raise ValueError(
            "recovery anchor must be 'bbox_center' or 'bottom_center'"
        )
    x, y, width, height = (float(value) for value in bbox)
    anchor_y = y + (height / 2.0 if normalized == "bbox_center" else height)
    return x + width / 2.0, anchor_y


def build_recovery_track_payload(
    track,
    source_camera: str,
    target_camera: str,
    transforms: dict[str, np.ndarray],
    shared_map_anchor: str = "bottom_center",
) -> dict:
    """Represent a local fragment in the token camera's pixel space.

    ``recovery_position`` and ``recovery_first_position`` are the selected
    anchor projected from their corresponding current/first bbox. The recovery
    bboxes are projections of those exact same source boxes. This keeps point,
    size and overlap evidence in one coordinate system for same- and
    cross-camera recovery.
    """
    bbox = _track_bbox(track)
    first_bbox = getattr(track, "first_observation_bbox", None)
    if first_bbox is None and isinstance(track, dict):
        first_bbox = track.get("first_observation_bbox") or track.get("first_bbox")
    if first_bbox is None:
        first_bbox = getattr(track, "first_bbox", None)
    first_bbox = tuple(first_bbox) if first_bbox is not None else bbox
    first_timestamp_s = (
        track.get("first_observation_timestamp_s")
        if isinstance(track, dict)
        else getattr(track, "first_observation_timestamp_s", None)
    )

    normalized_anchor = str(shared_map_anchor).strip().lower()
    current_anchor = _recovery_bbox_anchor(bbox, normalized_anchor)
    first_anchor = _recovery_bbox_anchor(first_bbox, normalized_anchor)

    position = _project_points_between_cameras(
        [current_anchor], source_camera, target_camera, transforms
    )[0]
    first_position = _project_points_between_cameras(
        [first_anchor], source_camera, target_camera, transforms
    )[0]
    appearance = (
        track.get("appearance")
        if isinstance(track, dict)
        else getattr(track, "appearance", None)
    )
    payload = {
        "bbox": bbox,
        "first_bbox": first_bbox,
        "recovery_bbox": bbox,
        "recovery_first_bbox": first_bbox,
        "recovery_position": tuple(float(value) for value in position),
        "recovery_first_position": tuple(float(value) for value in first_position),
        "recovery_first_timestamp_s": first_timestamp_s,
        "recovery_anchor": normalized_anchor,
        "appearance": appearance,
        "camera_id": source_camera,
    }
    if source_camera != target_camera:
        payload["recovery_bbox"] = _project_bbox_between_cameras(
            bbox, source_camera, target_camera, transforms
        )
        # Image-bbox corners above the floor are not valid homography points.
        # Cross-view recovery therefore gates on the calibrated anchor and
        # appearance/outward evidence, not a hard projected-area ratio.
        payload["recovery_first_bbox"] = None
        payload["recovery_size_ratio"] = 1.0
    return payload


def build_recovery_priority_regions(
    target_camera: str,
    binders: dict[str, SlotVehicleBinder],
    transforms: dict[str, np.ndarray],
    camera_timestamps_s: dict[str, float],
) -> list[dict]:
    """Project every live token's sensitive-search region into one camera."""
    projected_regions: list[dict] = []
    for source_camera, binder in binders.items():
        source_now = camera_timestamps_s[source_camera]
        for raw_polygon in binder.recovery_priority_regions(source_now):
            try:
                polygon = np.asarray(raw_polygon, dtype=np.float32).reshape((-1, 2))
                if source_camera != target_camera:
                    polygon = _project_points_between_cameras(
                        polygon,
                        source_camera,
                        target_camera,
                        transforms,
                    )
            except (cv2.error, KeyError, np.linalg.LinAlgError, ValueError):
                continue
            if len(polygon) < 3 or not np.all(np.isfinite(polygon)):
                continue
            projected_regions.append(
                {
                    "polygon": polygon,
                    "source_camera": source_camera,
                }
            )
    return projected_regions


def collect_binder_global_tracks(camera_id, tracker, manager) -> dict[int, object]:
    """Include retained confirmed/LOST tracks so a stopped car can bind fast."""
    selected: dict[int, tuple[tuple[int, int, int], object]] = {}
    for local_id, track in tracker.confirmed_tracks.items():
        if getattr(track, 'observation_kind', 'detection') in {'occluded_prediction', 'watershed_validated', 'watershed_provisional'}:
            continue
        global_id = manager.get_global_id(camera_id, local_id)
        if global_id is None:
            continue
        global_id = int(manager.canonical_global_id(global_id))
        rank = (
            int(getattr(track, "consecutive_invisible_count", 0)),
            -int(getattr(track, "last_seen_frame", 0)),
            int(local_id),
        )
        if global_id not in selected or rank < selected[global_id][0]:
            selected[global_id] = (rank, track)
    return {global_id: item[1] for global_id, item in selected.items()}


def sync_parking_identity_reservations(
    binders: dict[str, SlotVehicleBinder],
    manager: CrossCameraManager,
    trackers: dict[str, MotionVehicleTracker],
    frame_idx: int,
) -> dict[int, dict]:
    """Reserve parked GIDs globally and remove their stale local fragments."""
    reservations = [
        reservation
        for binder in binders.values()
        for reservation in binder.get_identity_reservations()
    ]
    accepted = manager.sync_parked_reservations(reservations, frame_idx)
    for binder in binders.values():
        binder.reconcile_identity_reservations(
            accepted,
            frame_idx,
            manager.canonical_global_id,
        )
    # P26 (lead duyet 5.2): KHONG detach mot fragment dang bi dong bang nhung
    # van duoc thay that (>=5 khung, >=2 mau appearance) tai dung cho, chi vi
    # GID cua no vua duoc ghi nhan la "da do" (reservation). Do duoc tren V049
    # sang_5p: ca GID #1 va #13 cung bi ghi "[slot-park] dung trong S016";
    # reservation cat binding cua fragment dang dung yen => track chet =>
    # xe quay lai voi GID moi (11 -> 22).
    keep = set()
    if getattr(manager, "stationary_resume_frozen", False):
        for camera_id, tracker in trackers.items():
            live_tracks = getattr(tracker, "_tracks", None) or {}
            for local_id, track in live_tracks.items():
                if not manager._frozen_member_kept(track):
                    continue
                keep.add((camera_id, int(local_id)))
    for camera_id, local_id, global_id in manager.detach_parked_local_tracks(
        frame_idx
    ):
        if (camera_id, int(local_id)) in keep:
            # Gan lai binding vua bi go (track van la cung chiec xe dang do).
            manager.restore_local_binding(
                camera_id, int(local_id), global_id, frame_idx
            )
            continue
        tracker = trackers.get(camera_id)
        if tracker is not None:
            tracker.suspend_track(local_id, reason="parked")
    return accepted

def cancel_observed_recovery_tokens(
    global_ids: dict[str, dict[int, int]],
    binders: dict[str, SlotVehicleBinder],
    manager: CrossCameraManager,
    camera_timestamps_s: dict[str, float],
) -> None:
    """Retire a token once normal tracking has durable ownership again.

    Cross-camera observation proves a handoff immediately. Same-camera
    observation waits past the false-empty grace so two noisy green samples
    followed by red can still restore the parked binding.
    """
    visible_cameras: dict[int, set[str]] = {}
    for camera_id, camera_global_ids in global_ids.items():
        for global_id in camera_global_ids.values():
            canonical = int(manager.canonical_global_id(global_id))
            visible_cameras.setdefault(canonical, set()).add(camera_id)

    for owner_camera, binder in binders.items():
        now_s = camera_timestamps_s[owner_camera]
        grace_ms = int(max(0.0, binder.false_empty_grace_seconds) * 1000)
        for token in binder.export_recovery_tokens(now_s):
            global_id = int(manager.canonical_global_id(token["global_id"]))
            cameras = visible_cameras.get(global_id, set())
            handed_off = any(camera_id != owner_camera for camera_id in cameras)
            mature_same_camera = (
                owner_camera in cameras
                and bool(token.get("confirmed_empty"))
                and int(token.get("age_ms", 0)) > grace_ms
            )
            if not handed_off and not mature_same_camera:
                continue
            binder.cancel_recovery_for_global_id(
                global_id,
                reason=(
                    "identity_observed_cross_camera"
                    if handed_off
                    else "identity_still_tracked_after_empty_grace"
                ),
            )


def _recover_departing_vehicle_ids_global(
    observable: dict[str, dict],
    manager: CrossCameraManager,
    binders: dict[str, SlotVehicleBinder],
    transforms: dict[str, np.ndarray],
    frame_idx: int,
    camera_timestamps_s: dict[str, float],
    shared_map_anchor: str,
) -> tuple[set[tuple[str, int]], list[dict]]:
    """Evaluate token/track pairs globally before selecting an owner camera.

    A physical fragment can be close to slots represented by both cameras.
    The old dispatcher picked one camera from geometry alone and only then ran
    appearance/direction gates.  A wrong provisional token could therefore
    hide the correct confirmed token.  This function collects every pair that
    passes the owning binder's hard gates, then performs one global one-to-one
    assignment.
    """
    canonical = getattr(manager, "canonical_global_id", lambda value: int(value))
    active_global_ids = {
        int(canonical(global_id))
        for camera_id, tracks in observable.items()
        for local_id in tracks
        if (global_id := manager.get_global_id(camera_id, local_id)) is not None
    }
    unbound = {
        (camera_id, int(local_id)): track
        for camera_id, tracks in observable.items()
        for local_id, track in tracks.items()
        if manager.get_global_id(camera_id, local_id) is None
    }
    if not unbound:
        return set(), []

    diagnostics: list[dict] = []
    owned_tokens: dict[int, list[tuple[str, dict]]] = {}
    for owner_camera, binder in binders.items():
        for raw_token in binder.export_recovery_tokens(
            camera_timestamps_s[owner_camera]
        ):
            token = dict(raw_token)
            token["global_id"] = int(canonical(token["global_id"]))
            if token["global_id"] in active_global_ids:
                continue
            owned_tokens.setdefault(token["global_id"], []).append(
                (owner_camera, token)
            )

    tokens: list[tuple[str, dict]] = []
    for global_id, choices in owned_tokens.items():
        ranked = sorted(
            choices,
            key=lambda item: (
                bool(item[1].get("confirmed_empty")),
                float(item[1].get("created_at_s", 0.0)),
                float(item[1].get("remaining_ms", 0.0)),
            ),
            reverse=True,
        )
        tokens.append(ranked[0])
        for duplicate_camera, duplicate_token in ranked[1:]:
            binders[duplicate_camera].cancel_recovery_for_global_id(
                global_id, reason="duplicate_cross_camera_token"
            )
            diagnostics.append({
                "type": "slot_recovery_duplicate_token_cancelled",
                "frame": int(frame_idx),
                "global_id": int(global_id),
                "kept_camera": ranked[0][0],
                "cancelled_camera": duplicate_camera,
                "cancelled_slot": duplicate_token.get("slot_id"),
            })
    if not tokens:
        return set(), diagnostics

    protected: set[tuple[str, int]] = set()
    eligible: list[dict] = []
    trajectory_evidence_for = getattr(
        manager, "parking_recovery_trajectory_evidence", None
    )
    for owner_camera, binder in binders.items():
        owner_tokens = [token for camera, token in tokens if camera == owner_camera]
        if not owner_tokens:
            continue
        candidates: dict[tuple[str, int], dict] = {}
        for local_key, track in unbound.items():
            source_camera, local_id = local_key
            try:
                payload = build_recovery_track_payload(
                    track,
                    source_camera,
                    owner_camera,
                    transforms,
                    shared_map_anchor=shared_map_anchor,
                )
            except (cv2.error, KeyError, np.linalg.LinAlgError, ValueError):
                continue
            evidence = {}
            if trajectory_evidence_for is not None:
                for token in owner_tokens:
                    global_id = int(token["global_id"])
                    evidence[global_id] = trajectory_evidence_for(
                        global_id,
                        source_camera,
                        int(local_id),
                        track,
                        recent_window_s=max(
                            0.1, float(binder.recovery_retention_seconds)
                        ),
                    )
            payload["recovery_identity_evidence"] = evidence
            candidates[local_key] = payload

        batch = binder.batch_recover_ids(
            candidates,
            frame_idx,
            camera_timestamps_s[owner_camera],
            camera_id=owner_camera,
            allow_cross_camera=True,
            consume_matches=False,
            allowed_token_slots={str(token["slot_id"]) for token in owner_tokens},
        )
        protected.update(batch.protected_local_keys)
        protected.update(batch.ambiguous_local_keys)
        for local_key, detail in batch.diagnostics.items():
            diagnostics.append({
                "type": "slot_recovery_candidate",
                "frame": int(frame_idx),
                "camera": local_key[0],
                "local_track_id": int(local_key[1]),
                "owner_camera": owner_camera,
                **dict(detail),
            })
        for pair in batch.eligible_pairs:
            eligible.append({**pair, "owner_camera": owner_camera})

    if not eligible:
        return protected, diagnostics

    token_keys = sorted({
        (item["owner_camera"], item["token_slot_id"], int(item["token_global_id"]))
        for item in eligible
    })
    candidate_keys = sorted({tuple(item["local_key"]) for item in eligible})
    token_index = {key: index for index, key in enumerate(token_keys)}
    candidate_index = {key: index for index, key in enumerate(candidate_keys)}
    costs = np.full((len(token_keys), len(candidate_keys)), 10.0, dtype=np.float64)
    details_by_pair: dict[tuple[int, int], dict] = {}
    for item in eligible:
        row = token_index[(
            item["owner_camera"], item["token_slot_id"], int(item["token_global_id"])
        )]
        column = candidate_index[tuple(item["local_key"])]
        cost = float(item["cost"])
        if cost < costs[row, column]:
            costs[row, column] = cost
            details_by_pair[(row, column)] = item

    _, row_to_col, _ = lapjv(costs, extend_cost=True, cost_limit=0.999)
    for row, raw_column in enumerate(row_to_col):
        column = int(raw_column)
        if column < 0 or (row, column) not in details_by_pair:
            continue
        item = details_by_pair[(row, column)]
        margin = float(binders[item["owner_camera"]].recovery_ambiguity_margin)
        selected = float(costs[row, column])
        alternatives = [
            float(costs[row, other])
            for other in range(costs.shape[1])
            if other != column and costs[row, other] < 10.0
        ] + [
            float(costs[other, column])
            for other in range(costs.shape[0])
            if other != row and costs[other, column] < 10.0
        ]
        local_key = candidate_keys[column]
        if alternatives and min(alternatives) - selected < margin:
            protected.add(local_key)
            diagnostics.append({
                "type": "slot_recovery_token_ambiguous",
                "frame": int(frame_idx),
                "camera": local_key[0],
                "local_track_id": int(local_key[1]),
                "token_slot_id": item["token_slot_id"],
                "token_global_id": int(item["token_global_id"]),
                "cost": round(selected, 4),
                "cost_gap": round(min(alternatives) - selected, 4),
            })
            continue

        owner_camera = item["owner_camera"]
        global_id = int(item["token_global_id"])
        token_proof = next(
            token for camera, token in tokens
            if camera == owner_camera
            and token["slot_id"] == item["token_slot_id"]
            and int(token["global_id"]) == global_id
        )
        source_camera, local_id = local_key
        try:
            manager.bind_external_id(
                source_camera,
                int(local_id),
                global_id,
                frame_idx,
                source="parking_departure_token",
                source_slot_id=str(token_proof["slot_id"]),
                source_camera_id=str(token_proof.get("camera_id") or owner_camera),
            )
        except (KeyError, ValueError) as exc:
            protected.add(local_key)
            diagnostics.append({
                "type": "slot_recovery_bind_rejected",
                "frame": int(frame_idx),
                "camera": source_camera,
                "local_track_id": int(local_id),
                "token_slot_id": item["token_slot_id"],
                "token_global_id": global_id,
                "reason": str(exc),
            })
            continue
        consumed = binders[owner_camera].consume_recovery_match(
            item["token_slot_id"],
            local_key,
            camera_timestamps_s[owner_camera],
            item,
        )
        if consumed is None:
            raise RuntimeError(
                "Recovery token changed after verified manager bind; "
                f"owner={owner_camera} slot={item['token_slot_id']}"
            )
        protected.discard(local_key)
        diagnostics.append({
            "type": "slot_recovery_global_match_applied",
            "frame": int(frame_idx),
            "camera": source_camera,
            "local_track_id": int(local_id),
            "owner_camera": owner_camera,
            "token_slot_id": item["token_slot_id"],
            "global_id": global_id,
            "cost": round(selected, 4),
        })
    return protected, diagnostics


def recover_departing_vehicle_ids(
    observable: dict[str, dict],
    manager: CrossCameraManager,
    binders: dict[str, SlotVehicleBinder],
    transforms: dict[str, np.ndarray],
    frame_idx: int,
    camera_timestamps_s: dict[str, float],
    recovery_max_expand_ratio: float,
    shared_map_anchor: str = "bottom_center",
) -> tuple[set[tuple[str, int]], list[dict]]:
    """Batch slot recovery before normal Global-ID allocation.

    A local fragment is offered to at most one camera binder. If two token
    owners are similarly plausible, it remains protected and ID-less; this is
    safer than letting a shadow/nearby vehicle consume an irreversible GID.
    """
    canonicalize = getattr(manager, "canonical_global_id", lambda value: int(value))
    active_global_ids = {
        int(canonicalize(global_id))
        for camera_id, tracks in observable.items()
        for local_id in tracks
        if (global_id := manager.get_global_id(camera_id, local_id)) is not None
    }
    unbound = {
        (camera_id, int(local_id)): track
        for camera_id, tracks in observable.items()
        for local_id, track in tracks.items()
        if manager.get_global_id(camera_id, local_id) is None
    }
    if not unbound and not any(
        manager.get_global_id(camera_id, local_id) is not None
        for camera_id, tracks in observable.items()
        for local_id in tracks
    ):
        return set(), []

    # Real binders support evaluate-then-consume.  Keep the legacy dispatcher
    # below for test doubles and older integrations, but never use its
    # camera-first routing in the production two-camera runtime.
    production_result = None
    if binders and all(
        hasattr(binder, "consume_recovery_match") for binder in binders.values()
    ):
        production_result = _recover_departing_vehicle_ids_global(
            observable,
            manager,
            binders,
            transforms,
            frame_idx,
            camera_timestamps_s,
            shared_map_anchor,
        )
        # The global path already handled every unbound fragment.  Continue
        # through the legacy function only for its separate late-
        # reconciliation pass over tracks that already received a wrong GID.
        unbound = {}

    diagnostics: list[dict] = (
        list(production_result[1]) if production_result is not None else []
    )
    tokens_by_camera: dict[str, list[dict]] = {}
    tokens_by_global_id: dict[int, list[tuple[str, dict]]] = {}
    # Late reconciliation needs the full confirmed token list, including tokens
    # whose owner GID is still visibly tracked (the normal path refuses those):
    # hiep2/D01 showed vision confirming empty after the departing car had
    # already been minted a wrong new Global ID.
    confirmed_tokens_by_camera: dict[str, list[dict]] = {
        camera_id: [] for camera_id in binders
    }
    for camera_id, binder in binders.items():
        tokens_by_camera[camera_id] = []
        for raw_token in binder.export_recovery_tokens(camera_timestamps_s[camera_id]):
            token = dict(raw_token)
            token["global_id"] = int(canonicalize(token["global_id"]))
            if token.get("confirmed_empty"):
                confirmed_tokens_by_camera[camera_id].append(token)
            # Keep the token alive while its original local track is still
            # visible, but never offer that GID to a second object concurrently.
            if token["global_id"] in active_global_ids:
                continue
            tokens_by_global_id.setdefault(token["global_id"], []).append(
                (camera_id, token)
            )

    # The same canonical identity may have left overlapping slots observed by
    # both cameras. Only one token is authoritative; otherwise two candidates
    # could consume the same irreversible GID in one frame. Prefer confirmed,
    # newest evidence and cancel duplicate owners before matching.
    for global_id, owned_tokens in tokens_by_global_id.items():
        ranked_tokens = sorted(
            owned_tokens,
            key=lambda item: (
                bool(item[1].get("confirmed_empty")),
                float(item[1].get("created_at_s", 0.0)),
                float(item[1].get("remaining_ms", 0.0)),
            ),
            reverse=True,
        )
        winner_camera, winner_token = ranked_tokens[0]
        tokens_by_camera[winner_camera].append(winner_token)
        for duplicate_camera, duplicate_token in ranked_tokens[1:]:
            cancel = getattr(
                binders[duplicate_camera], "cancel_recovery_for_global_id", None
            )
            if cancel is not None:
                cancel(global_id, reason="duplicate_cross_camera_token")
            diagnostics.append(
                {
                    "type": "slot_recovery_duplicate_token_cancelled",
                    "frame": int(frame_idx),
                    "global_id": int(global_id),
                    "kept_camera": winner_camera,
                    "cancelled_camera": duplicate_camera,
                    "cancelled_slot": duplicate_token.get("slot_id"),
                }
            )
    payload_cache: dict[tuple[tuple[str, int], str], dict] = {}
    assigned_candidates: dict[str, dict] = {camera_id: {} for camera_id in binders}
    protected: set[tuple[str, int]] = (
        set(production_result[0]) if production_result is not None else set()
    )
    trajectory_evidence_for = getattr(
        manager, "parking_recovery_trajectory_evidence", None
    )
    for local_key, track in unbound.items():
        source_camera, _local_id = local_key
        continuation_owners = [
            owner_camera
            for owner_camera, binder in binders.items()
            if local_key in getattr(
                binder, "recovery_candidate_keys", lambda: set()
            )()
            and tokens_by_camera.get(owner_camera)
        ]
        if len(continuation_owners) == 1:
            owner_camera = continuation_owners[0]
            try:
                payload = build_recovery_track_payload(
                    track,
                    source_camera,
                    owner_camera,
                    transforms,
                    shared_map_anchor=shared_map_anchor,
                )
            except (cv2.error, KeyError, np.linalg.LinAlgError, ValueError):
                protected.add(local_key)
                continue
            assigned_candidates[owner_camera][local_key] = payload
            protected.add(local_key)
            continue
        if len(continuation_owners) > 1:
            protected.add(local_key)
            diagnostics.append({
                "type": "slot_recovery_continuation_ambiguous",
                "frame": int(frame_idx),
                "camera": source_camera,
                "local_track_id": int(local_key[1]),
                "owners": continuation_owners,
            })
            continue
        owner_scores: dict[str, float] = {}
        for owner_camera, tokens in tokens_by_camera.items():
            if not tokens:
                continue
            try:
                payload = build_recovery_track_payload(
                    track,
                    source_camera,
                    owner_camera,
                    transforms,
                    shared_map_anchor=shared_map_anchor,
                )
            except (cv2.error, KeyError, np.linalg.LinAlgError, ValueError):
                continue
            payload_cache[(local_key, owner_camera)] = payload
            point = payload["recovery_position"]
            best_score = None
            for token in tokens:
                polygon = np.asarray(token["polygon"], dtype=np.float32)
                _, _, width, height = cv2.boundingRect(polygon)
                diagonal = max(1.0, float(np.hypot(width, height)))
                max_radius = diagonal * max(0.0, float(recovery_max_expand_ratio))
                signed = float(
                    cv2.pointPolygonTest(
                        polygon.reshape((-1, 1, 2)),
                        (float(point[0]), float(point[1])),
                        True,
                    )
                )
                continuation_score = None
                for evidence in token.get("continuation_evidence", []):
                    if not (
                        evidence.get("qualified_predeparture")
                        or evidence.get("originated_in_slot")
                    ):
                        continue
                    last_center = evidence.get("last_center")
                    if last_center is None:
                        continue
                    continuation_limit = diagonal * (
                        1.50
                        if evidence.get("qualified_predeparture")
                        else 2.25
                    )
                    continuation_distance = float(
                        np.linalg.norm(
                            np.asarray(point, dtype=np.float64)
                            - np.asarray(last_center, dtype=np.float64)
                        )
                    )
                    if continuation_distance > continuation_limit:
                        continue
                    score = continuation_distance / max(
                        1.0, continuation_limit
                    )
                    continuation_score = (
                        score
                        if continuation_score is None
                        else min(continuation_score, score)
                    )
                if signed < -max_radius and continuation_score is None:
                    continue
                center = np.asarray(token["center"], dtype=np.float64)
                center_distance = float(
                    np.linalg.norm(np.asarray(point, dtype=np.float64) - center)
                )
                if continuation_score is not None:
                    score = 0.25 * continuation_score + 0.05 * (
                        center_distance / diagonal
                    )
                else:
                    score = max(0.0, -signed) / max(1.0, max_radius) + 0.10 * (
                        center_distance / diagonal
                    )
                best_score = score if best_score is None else min(best_score, score)
            if best_score is not None:
                owner_scores[owner_camera] = float(best_score)

        if not owner_scores:
            continue
        ranked = sorted(owner_scores.items(), key=lambda item: item[1])
        if len(ranked) > 1 and ranked[1][1] - ranked[0][1] < 0.15:
            protected.add(local_key)
            diagnostics.append(
                {
                    "type": "slot_recovery_owner_ambiguous",
                    "frame": int(frame_idx),
                    "camera": source_camera,
                    "local_track_id": int(local_key[1]),
                    "owners": [item[0] for item in ranked[:2]],
                }
            )
            continue
        owner_camera = ranked[0][0]
        assigned_candidates[owner_camera][local_key] = payload_cache[
            (local_key, owner_camera)
        ]

    for owner_camera, candidates in assigned_candidates.items():
        if not candidates:
            continue
        recovery_window_s = max(
            0.1,
            float(
                getattr(
                    binders[owner_camera],
                    "recovery_retention_seconds",
                    5.0,
                )
            ),
        )
        for local_key, payload in candidates.items():
            source_camera, local_id = local_key
            track = unbound[local_key]
            identity_evidence = {}
            for token in (
                tokens_by_camera.get(owner_camera, ())
                if trajectory_evidence_for is not None
                else ()
            ):
                global_id = int(token["global_id"])
                identity_evidence[global_id] = (
                    trajectory_evidence_for(
                        global_id,
                        source_camera,
                        int(local_id),
                        track,
                        recent_window_s=recovery_window_s,
                    )
                )
            payload["recovery_identity_evidence"] = identity_evidence
        batch = binders[owner_camera].batch_recover_ids(
            candidates,
            frame_idx,
            camera_timestamps_s[owner_camera],
            camera_id=owner_camera,
            allow_cross_camera=True,
        )
        protected.update(batch.protected_local_keys)
        protected.update(batch.ambiguous_local_keys)
        for local_key, global_id in batch.recovered_ids.items():
            source_camera, local_id = local_key
            recovery_token = next(
                (
                    token
                    for token in tokens_by_camera.get(owner_camera, ())
                    if int(token["global_id"])
                    == int(manager.canonical_global_id(global_id))
                ),
                None,
            )
            if recovery_token is None:
                # Fail closed: a bare source string is not proof that this
                # local track owns a parked identity.
                protected.add(local_key)
                diagnostics.append({
                    "type": "slot_recovery_rejected_missing_token_proof",
                    "frame": int(frame_idx),
                    "camera": source_camera,
                    "local_track_id": int(local_id),
                    "global_id": int(global_id),
                })
                continue
            manager.bind_external_id(
                source_camera,
                int(local_id),
                int(global_id),
                frame_idx,
                source="parking_departure_token",
                source_slot_id=str(recovery_token["slot_id"]),
                source_camera_id=str(
                    recovery_token.get("camera_id") or owner_camera
                ),
            )
            protected.discard(local_key)
        for local_key, detail in batch.diagnostics.items():
            diagnostics.append(
                {
                    "type": "slot_recovery_candidate",
                    "frame": int(frame_idx),
                    "camera": local_key[0] if isinstance(local_key, tuple) else owner_camera,
                    "local_track_id": (
                        int(local_key[1]) if isinstance(local_key, tuple) else local_key
                    ),
                    **detail,
                }
            )
    # Late departure reconciliation (P0 hiep2/D01): vision may confirm the
    # slot empty only AFTER the departing vehicle was already minted a wrong
    # new Global ID.  The normal candidate pool above is unbound-only, so such
    # a track is invisible to it.  Admit already-assigned tracks into a
    # separate, fail-closed pool driven by confirmed tokens.  A wrong ID is
    # canonicalized back to the slot owner only when EVERY gate below proves
    # this is the vehicle that left the slot; otherwise the token simply
    # retries next frame until retention expires.
    if (
        trajectory_evidence_for is not None
        and any(confirmed_tokens_by_camera.values())
    ):
        created_frames = getattr(manager, "_global_created_frames", {})
        dormant_distance = float(
            getattr(manager, "dormant_match_distance", 160.0)
        )
        for camera_id, tracks in observable.items():
            for local_id, track in tracks.items():
                current_gid_raw = manager.get_global_id(camera_id, local_id)
                if current_gid_raw is None:
                    continue  # normal unbound recovery owns this key
                current_gid = int(canonicalize(current_gid_raw))
                for token_owner, tokens in confirmed_tokens_by_camera.items():
                    reconciled = False
                    for token in tokens:
                        token_gid = int(token["global_id"])
                        # g1 token proof: confirmed, owner differs from the
                        # wrong ID, and the token GID itself is not the
                        # concurrently-tracked identity.
                        if not token.get("confirmed_empty") or token_gid == current_gid:
                            continue
                        if token_gid in active_global_ids:
                            continue
                        # g2 timing: the wrong ID must have been minted while
                        # the token was already collecting evidence, never
                        # after the owner identity itself was created.
                        wrong_birth = created_frames.get(current_gid)
                        owner_birth = created_frames.get(token_gid)
                        if wrong_birth is None or int(wrong_birth) > int(frame_idx):
                            continue
                        if owner_birth is not None and int(wrong_birth) <= int(
                            owner_birth
                        ):
                            continue
                        # g3-g6: origin, trajectory, appearance, camera via the
                        # manager's conservative evidence bundle, sourced from
                        # the bound candidate trail.
                        try:
                            evidence = trajectory_evidence_for(
                                token_gid,
                                camera_id,
                                int(local_id),
                                track,
                                recent_window_s=max(
                                    0.1,
                                    float(
                                        getattr(
                                            binders[token_owner],
                                            "recovery_retention_seconds",
                                            5.0,
                                        )
                                    ),
                                ),
                                candidate_global_id=current_gid,
                            )
                        except (
                            cv2.error,
                            KeyError,
                            np.linalg.LinAlgError,
                            ValueError,
                        ):
                            continue
                        origin_distance = evidence.get("origin_distance_cm")
                        appearance_distance = evidence.get("appearance_distance")
                        reason = None
                        if evidence.get("hard_reject_reason") is not None:
                            reason = str(evidence["hard_reject_reason"])
                        elif (
                            origin_distance is None
                            or float(origin_distance) > dormant_distance
                        ):
                            reason = "origin_too_far"
                        elif (
                            evidence.get("score") is None
                            or float(evidence["score"]) < 0.78
                            or int(evidence.get("observations", 0)) < 3
                            or not evidence.get("stable")
                        ):
                            reason = "trajectory_not_qualified"
                        elif (
                            appearance_distance is None
                            or float(appearance_distance) > float(
                                getattr(
                                    binders[token_owner],
                                    "recovery_appearance_threshold",
                                    0.55,
                                )
                            )
                            or float(evidence.get("appearance_support", 0.0)) <= 0.0
                        ):
                            reason = "appearance_mismatch"
                        elif float(evidence.get("topology_score", 0.0)) <= 0.0:
                            reason = "camera_topology"
                        if reason is not None:
                            diagnostics.append({
                                "type": "slot_recovery_late_reconciliation_pending",
                                "reason": reason,
                                "frame": int(frame_idx),
                                "camera": camera_id,
                                "local_track_id": int(local_id),
                                "token_slot_id": token.get("slot_id"),
                                "token_global_id": token_gid,
                                "current_global_id": current_gid,
                            })
                            continue
                        local_key = (camera_id, int(local_id))
                        token_camera = str(
                            token.get("camera_id") or token_owner
                        )
                        reservation = manager._parked_reservations.get(token_gid)
                        if (
                            reservation is None
                            or str(reservation.get("slot_id"))
                            != str(token.get("slot_id"))
                            or str(reservation.get("camera_id")) != token_camera
                        ):
                            # The token proof must match the durable
                            # reservation, not just the caller's source chain.
                            diagnostics.append({
                                "type": "slot_recovery_late_reconciliation_pending",
                                "reason": "token_reservation_mismatch",
                                "frame": int(frame_idx),
                                "camera": camera_id,
                                "local_track_id": int(local_id),
                                "token_slot_id": token.get("slot_id"),
                                "token_global_id": token_gid,
                                "current_global_id": current_gid,
                            })
                            continue
                        # Transaction: the merge validates every guard before
                        # mutating anything. Rejected -> mappings, aliases,
                        # reservations and tokens all stay exactly as they
                        # were; the token retries on the next frame.
                        merge = manager.reconcile_departure_identity(
                            camera_id, int(local_id), track, frame_idx,
                            token=token, binder=binders[token_owner],
                            timestamp_s=camera_timestamps_s[camera_id],
                        )
                        if not merge.accepted:
                            diagnostics.append({
                                "type": "slot_recovery_late_reconciliation_blocked",
                                "reason": merge.rejection_reason,
                                "frame": int(frame_idx),
                                "camera": camera_id,
                                "local_track_id": int(local_id),
                                "token_slot_id": token.get("slot_id"),
                                "token_global_id": token_gid,
                                "current_global_id": current_gid,
                            })
                            continue
                        canonical_gid = int(merge.canonical_id)
                        diagnostics.append({
                            "type": "slot_recovery_late_reconciliation_applied",
                            "frame": int(frame_idx),
                            "camera": camera_id,
                            "local_track_id": int(local_id),
                            "slot_id": token.get("slot_id"),
                            "token_global_id": token_gid,
                            "canonical_global_id": canonical_gid,
                            "retired_global_id": int(merge.retired_id),
                        })
                        # Retire the consumed token so it is never offered
                        # twice.  Keep the key protected this frame so the
                        # allocator cannot immediately re-bind it elsewhere.
                        binders[token_owner].cancel_recovery_for_global_id(
                            token_gid,
                            reason="late_departure_token_reconciled",
                        )
                        protected.add(local_key)
                        reconciled = True
                        break
                    if reconciled:
                        break
    return protected, diagnostics


def process_parking_frame(
    detector: ParkingDetector,
    frame: np.ndarray,
    include_debug: bool,
) -> tuple[list, bool, float]:
    """Run slow parking work outside the live display loop."""
    profile_worker = os.environ.get("TECHGAR_PROFILE") == "1"
    if profile_worker:
        worker_started = time.perf_counter()
        worker_cpu_started = time.thread_time()
    results = detector.detect(frame, apply_smoothing=not detector.stable_evidence)
    if profile_worker:
        worker_wall_ms = (time.perf_counter() - worker_started) * 1000.0
        if worker_wall_ms >= 300.0:
            print(
                f"[P35_PARKING_WORKER] wall={worker_wall_ms:.1f}ms "
                f"cpu={(time.thread_time() - worker_cpu_started) * 1000.0:.1f}ms",
                flush=True,
            )
    # Coordinator draws once, after accept_evidence has updated stable state.
    # Drawing here and again on acceptance doubles this work every parking job.
    return results, include_debug, time.monotonic()


def freeze_runtime_render_payload(
    *,
    moving_tracks: dict,
    shown_ids: dict[int, int],
    slot_results: list,
    frame_index: int,
    roi_points: Optional[np.ndarray] = None,
    trails: Optional[list[tuple[int, list[tuple[int, int]]]]] = None,
) -> dict:
    """Copy only primitive overlay data for the runtime render worker."""
    tracks = []
    for local_id, track in moving_tracks.items():
        tracks.append({
            "bbox": tuple(int(value) for value in track.bbox),
            "center": (int(track.cx), int(track.cy)),
            "global_id": int(shown_ids.get(local_id, local_id)),
        })
    slots = [{
        "slot_id": str(result.slot_id),
        "occupied": bool(result.occupied),
        "vehicle_id": (
            int(result.vehicle_id) if result.vehicle_id is not None else None
        ),
        "polygon": np.asarray(result.polygon, dtype=np.int32).copy(),
        "center": (int(result.center[0]), int(result.center[1])),
    } for result in slot_results]
    return {
        "frame_index": int(frame_index),
        "tracks": tracks,
        "slots": slots,
        "roi_points": None if roi_points is None else roi_points.copy(),
        "trails": list(trails or []),
    }


def render_runtime_frame(frame: np.ndarray, payload: dict) -> np.ndarray:
    """Render a frozen overlay without touching tracker/manager state."""
    # F3 drawing lives only in the copy returned to the UI/stream renderer.
    skipped_boxes = payload.get("f3_interpolated_boxes")
    output = (draw_boxes(frame, skipped_boxes, color=(0, 180, 255), thickness=1)
              if skipped_boxes else frame)
    roi_points = payload.get("roi_points")
    if roi_points is not None:
        cv2.polylines(output, [roi_points], True, (0, 255, 255), 2, cv2.LINE_AA)
        cv2.putText(output, "TRACKING ROI", tuple(roi_points[0]),
                    cv2.FONT_HERSHEY_SIMPLEX, .45, (0, 255, 255), 1, cv2.LINE_AA)
    for global_id, points in payload.get("trails", []):
        color = (
            64 + (global_id * 83) % 192,
            64 + (global_id * 47) % 192,
            64 + (global_id * 131) % 192,
        )
        for first, second in zip(points, points[1:]):
            cv2.line(output, first, second, color, 2, cv2.LINE_AA)
    for track in payload.get("tracks", []):
        x, y, width, height = track["bbox"]
        cv2.rectangle(output, (x, y), (x + width, y + height), (255, 0, 0), 2)
        cv2.circle(output, track["center"], 3, (255, 0, 0), -1)
        cv2.putText(output, f"G#{track['global_id']} moving", (x, max(14, y - 5)),
                    cv2.FONT_HERSHEY_SIMPLEX, .45, (255, 0, 0), 1, cv2.LINE_AA)
    slots = payload.get("slots", [])
    for slot in slots:
        color = (0, 0, 255) if slot["occupied"] else (0, 255, 0)
        cv2.polylines(output, [slot["polygon"]], True, color, 2)
        label = slot["slot_id"]
        if slot["vehicle_id"] is not None:
            label += f" #{slot['vehicle_id']}"
        center = slot["center"]
        cv2.putText(output, label, (center[0] - 12, center[1] + 4),
                    cv2.FONT_HERSHEY_SIMPLEX, .3, (255, 255, 255), 1)
    free_count = sum(1 for slot in slots if not slot["occupied"])
    cv2.putText(output, f"Frame: {payload['frame_index']}", (10, 30),
                cv2.FONT_HERSHEY_SIMPLEX, 1.0, (0, 255, 255), 2)
    cv2.putText(output, f"Parking: {free_count}/{len(slots)} free", (10, 60),
                cv2.FONT_HERSHEY_SIMPLEX, .7, (255, 200, 0), 2)
    return output


class DetectorTuningPanel:
    WINDOW = "Parking detector settings"
    FIELDS = (
        ("Gamma x10", "base_gamma", 10.0, 60),
        ("CLAHE x10", "base_clahe", 10.0, 60),
        ("Grid", "clahe_grid", 1.0, 32),
        ("Ratio %", "ratio_thr", 100.0, 100),
        ("Core mask %", "core_scale", 100.0, 95),
    )

    def __init__(self, detectors: dict[str, ParkingDetector], profile_path: Path):
        self.detectors = detectors
        self.profile_path = profile_path
        if profile_path.is_file():
            profile = json.loads(profile_path.read_text(encoding="utf-8"))
            for camera_id, detector in detectors.items():
                apply_detector_parameters(detector, profile.get(camera_id, {}))
        cv2.namedWindow(self.WINDOW, cv2.WINDOW_NORMAL)
        cv2.resizeWindow(self.WINDOW, 560, 520)
        for camera_id, detector in detectors.items():
            prefix = camera_id.upper()
            for label, attribute, scale, maximum in self.FIELDS:
                value = int(round(getattr(detector, attribute) * scale))
                cv2.createTrackbar(f"{prefix} {label}", self.WINDOW, value, maximum, lambda _value: None)

    def apply(self) -> None:
        for camera_id, detector in self.detectors.items():
            prefix = camera_id.upper()
            values = {}
            for label, attribute, scale, _maximum in self.FIELDS:
                values[attribute] = cv2.getTrackbarPos(f"{prefix} {label}", self.WINDOW) / scale
            apply_detector_parameters(detector, values)

    def snapshot(self) -> dict:
        return {camera_id: detector_parameters(detector) for camera_id, detector in self.detectors.items()}

    def save(self) -> None:
        self.profile_path.parent.mkdir(parents=True, exist_ok=True)
        save_json(self.profile_path, self.snapshot())
        print(f"Da luu detector profile: {self.profile_path}")


def resolve_slot_arrival_lookback_seconds(args: argparse.Namespace) -> float:
    """Keep a lost arrival claim long enough for asynchronous parking vision."""
    configured = getattr(args, "slot_arrival_lookback_seconds", None)
    if configured is not None:
        return max(0.25, float(configured))

    parking_fps = max(0.01, float(args.parking_fps))
    max_result_age = max(0.0, float(args.parking_max_result_age_seconds))
    confirmations = max(1, int(args.slot_arrival_vision_confirmations))
    return max(3.0, max_result_age + confirmations / parking_fps + 0.5)


def make_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Hai camera that: tracking, parking va Global ID")
    parser.add_argument('--render-async', action='store_true',
                        help='Render va ghi video bat dong bo; q/Esc de thoat, khong ho tro sua ROI truc tiep')
    parser.add_argument('--render-every', type=int, default=1,
                        help='Che do render-async: render moi N frame (mac dinh 1)')
    parser.add_argument('--render-preview-scale', type=float, default=1.0,
                        help='Che do render-async: ti le anh hien thi (mac dinh 1.0)')
    parser.add_argument('--render-replay-process', action='store_true', help='Replay only: render in a process that reads source video by frame index')
    parser.add_argument('--render-video-scale', type=float, default=1.0, help='Replay render process video scale')
    parser.add_argument('--render-video-codec', choices=('mp4v','MJPG'), default='mp4v')
    parser.add_argument(
        "--identity-kernel", choices=("legacy", "world", "core2", "core2l"), default="legacy",
        help="Identity association: legacy (default), P37 world, or core2",
    )
    parser.add_argument('--m1l-decode-config', default=str(PROJECT_ROOT.parent.parent / '.orca/core2/m1l/run_gpu1/decode_config.json'))
    parser.add_argument('--binder-fast', action='store_true', help='Opt-in vectorized binder candidate filtering')
    parser.add_argument('--perf-optimize', action='store_true', help='Opt-in core2l prediction and binder optimizations')
    parser.add_argument('--core2-dump-async', action='store_true', help='Opt-in bounded lossless dump writer thread')
    parser.add_argument('--predictions-gzip', action='store_true', help='Write session predictions as gzip JSONL')
    parser.add_argument('--public-id-split', action='store_true', help='Use separate public ID ranges for parked and entering vehicles (core2l only)')
    parser.add_argument('--public-id-map', help='Write internal-to-public ID mapping as a new JSON file')
    parser.add_argument('--prediction-queue-capacity', type=int, default=2, choices=range(1, 257),
                        metavar='N', help='Bounded FIFO prediction queue (default 2; max 256)')
    parser.add_argument('--perf-stages', action='store_true', help='Opt-in per-frame core2l performance stage timings')
    parser.add_argument(
        "--identity-kernel-dump",
        default=None,
        metavar="FILE",
        help=(
            "P37/T6c DEBUG: write exactly what the world adapter feeds the kernel "
            "each frame (source frame, timestamp, cam, local id, bbox, world, "
            "track_state, prediction_source) plus the GID the kernel returned. "
            "Requires --identity-kernel world. One JSON object per line."
        ),
    )
    parser.add_argument("--core2-dump", default=None, metavar="FILE",
                        help="B0: capture pre-association detector Blobs as jsonl.gz")
    parser.add_argument("--cam1-url")
    parser.add_argument("--cam2-url")
    parser.add_argument("--replay-async-vision", action="store_true",
                        help="Use the live vision worker path while replaying (non-deterministic scheduling)")
    parser.add_argument("--replay-realtime", action="store_true",
                        help="Pace replay using recorded timestamps without dropping source frames")
    parser.add_argument("--start-frame", type=int, default=1,
                        help="Replay from 1-based frame N; warm up MOG2 on up to 150 earlier pairs")
    parser.add_argument(
        "--replay-stride",
        type=int,
        default=1,
        help=(
            "P36 TEST-ONLY: process only every N-th replay source pair (1 = every "
            "frame, the default). Decoded pairs that are skipped are never fed to "
            "the trackers, reproducing live drop-rate conditions deterministically. "
            "Only valid with --replay-session / --camN-video; requires "
            "--no-replay-realtime (no pacing) so results depend only on the stride."
        ),
    )
    parser.add_argument("--replay-drop-frames", action=argparse.BooleanOptionalAction,
                        default=None,
                        help="Drop replay pairs >300ms late in live mode (use --no-replay-drop-frames for aligned diagnostics)")
    parser.add_argument("--replay-drop-readahead", action="store_true",
                        help="core2l only: select realtime replay pairs and detect one pair ahead")
    parser.add_argument("--no-motion-pipeline", action="store_true",
                        help="Disable motion read-ahead for deterministic A/B diagnostics")
    parser.add_argument(
        "--replay-session",
        help=(
            "Replay dong bo raw_cam1.mp4/raw_cam2.mp4 bang frame_timestamps.csv "
            "trong session da ghi"
        ),
    )
    parser.add_argument(
        "--live-mode",
        action="store_true",
        help="Cong bo source_mode='live' ngay ca khi replay video de frontend va gate controller nhan nhu camera realtime",
    )
    parser.add_argument(
        "--fast-motion",
        action=argparse.BooleanOptionalAction,
        default=False,
        help="Opt in to half-scale MOG2/temporal ROI (disabled by default, including --live-mode)",
    )
    parser.add_argument(
        "--replay-prefetch-frames",
        type=int,
        default=1,
        help="So frame cap dem truoc trong bo doc replay (thread prefetch queue)",
    )
    parser.add_argument(
        "--display-scale",
        type=float,
        default=None,
        help="Ti le thu phong cua so live display (mac dinh 0.5 khi --live-mode, 1.0 khi khong live)",
    )
    parser.add_argument("--slots-cam1", required=True)
    parser.add_argument("--slots-cam2", required=True)
    parser.add_argument("--calibration", required=True, help="JSON homography va overlap da hieu chinh")
    parser.add_argument("--output-dir", default=str(PROJECT_ROOT / "runtime_output_two_camera"))
    parser.add_argument("--session-dir", help="Thu muc ghi video/JSONL hai camera; phai chua ton tai")
    parser.add_argument(
        "--debug-video-only", action="store_true",
        help="Chi ghi video debug, khong ghi raw, predictions hay telemetry session",
    )
    parser.add_argument(
        "--no-session-video",
        action="store_true",
        help="Chi ghi timestamp/predictions khi replay, khong sao chep lai raw/debug MP4",
    )
    parser.add_argument("--detector-profile", default="config/two_camera.detector.json", help="Saved tuning state")
    parser.add_argument("--mask-cam1", default="config/roi_mask_cam1.json", help="Camera 1 ROI mask")
    parser.add_argument("--mask-cam2", default="config/roi_mask_cam2.json", help="Camera 2 ROI mask")
    parser.add_argument(
        "--tracking-roi-cam1",
        help=(
            "Polygon ROI chi cho motion tracking cam1; mac dinh dung --mask-cam1. "
            "Dung file rieng neu vung quan sat nho hon vung handoff"
        ),
    )
    parser.add_argument(
        "--tracking-roi-cam2",
        help=(
            "Polygon ROI chi cho motion tracking cam2; mac dinh dung --mask-cam2. "
            "Dung file rieng neu vung quan sat nho hon vung handoff"
        ),
    )
    parser.add_argument(
        "--show-tracking-roi",
        action="store_true",
        help="Ve duong bao ROI motion mau vang tren debug view/MP4",
    )
    parser.add_argument("--no-parking-debug", action="store_true", help="An cua so threshold pixel de giam tai")
    parser.add_argument("--parking-fps", type=float, default=2.0)
    parser.add_argument(
        "--parking-schedule", choices=("periodic", "event"), default="periodic",
        help="Parking sampling: existing periodic schedule or local-track/binder events",
    )
    parser.add_argument(
        "--parking-idle-period", type=float, default=5.0,
        help="Seconds between background scans per camera in event schedule",
    )
    parser.add_argument("--legacy-parking-filter", action="store_true", help="Replay baseline border filter and frame smoothing")
    parser.add_argument("--legacy-static-color-rescue", action="store_true", help="Tat nhan lai xe mau dung yen it dac trung")
    parser.add_argument(
        "--legacy-dormant-reid",
        action="store_true",
        help=(
            "Tat 2 chan siet dormant re-id (P16k): (a) khoang cach vuot qua "
            "toc do toi da vat ly, (b) GID cu con giu o khac dang co xe. "
            "Mac dinh = hanh vi moi (co chan)."
        ),
    )
    parser.add_argument(
        "--dormant-reid-max-speed-kmh",
        type=float,
        default=20.0,
        help=(
            "Toc do toi da cua bai xe (km/h) dung cho chan (a) cua P16k. "
            "20 km/h la gioi han hop ly trong bai do; doi ra don vi world bang k."
        ),
    )
    parser.add_argument(
        "--legacy-young-source-merge-window",
        action="store_true",
        help=(
            "Chi cho gop GID nguon moi vao GID cu khi nguon <= 3 frame tuoi (hanh vi "
            "truoc P18a/L-B). Mac dinh = cho gop khi nguon <= 60 frame, chua tung do, "
            "chua tung cung duoc do o hai cho khac nhau."
        ),
    )
    parser.add_argument(
        "--legacy-dormant-merge-overlap",
        action="store_true",
        help=(
            "Tat chan merge khi hai identity cung duoc DO trong cung frame o hai "
            "vi tri cach nhau > be rong o (hanh vi truoc P16e, gop nham 2 xe). "
            "Mac dinh = hanh vi moi (co chan)."
        ),
    )
    parser.add_argument(
        "--legacy-token-key-reuse",
        action="store_true",
        help=(
            "Cho phep track local cua token da het han khong thu hoi GID duoc "
            "token cua o khac nhan lai lam ung vien (hanh vi truoc P16d, giu "
            "protected_local_keys cong don). Mac dinh = khong nhan lai."
        ),
    )
    parser.add_argument(
        "--legacy-token-continuation-range",
        action="store_true",
        help=(
            "Cho phep token khoi hanh noi manh track xa toi 2.25 duong cheo o "
            "ngay ca khi xe chu van dang do (hanh vi truoc P18a/L-A). Mac dinh = "
            "chi noi trong 0.35 duong cheo khi xe chu con do."
        ),
    )
    parser.add_argument(
        "--legacy-token-foreign-slot-capture",
        action="store_true",
        help=(
            "Cho phep token cua o A giu manh track dang DO VAO o B ben canh "
            "(hanh vi truoc P29: V060/S054 bi token S056 giu canonical_gid=None "
            "91 frame). Mac dinh = chi giu khi o cua token la o gan nhat."
        ),
    )
    parser.add_argument(
        "--legacy-split-vehicle-echo",
        action="store_true",
        help=(
            "Tat viec gop hai nua cua MOT xe bi frame-differencing tach doi "
            "trong cung camera (hanh vi truoc P29: V040 toi_5p doi GID 1 -> 5). "
            "Mac dinh = gop (giu mot GID)."
        ),
    )
    parser.add_argument(
        "--legacy-departure-token-distance",
        action="store_true",
        help=(
            "Tat gioi han khoang cach cua token khoi hanh: track da roi o qua "
            "xa van gia han token va giu protected_local_keys (hanh vi truoc P16, "
            "gay dut GID). Mac dinh = hanh vi moi (co gioi han)."
        ),
    )
    parser.add_argument("--parking-enter-ratio", type=float, default=0.12)
    parser.add_argument("--parking-exit-ratio", type=float, default=0.08)
    parser.add_argument("--parking-occupied-seconds", type=float, default=0.5)
    parser.add_argument("--parking-empty-seconds", type=float, default=1.0)
    parser.add_argument(
        "--parking-max-result-age-seconds",
        type=float,
        default=1.0,
        help="Bo ket qua parking live da cu hon moc nay de token khong bat dau tu frame cu",
    )
    parser.add_argument(
        "--parking-smoothing-frames",
        type=int,
        default=1,
        help="So mau parking lien tiep truoc khi doi mau; two-camera mac dinh cap nhat ngay",
    )
    parser.add_argument("--json-fps", type=float, default=5.0)
    parser.add_argument("--max-frames", type=int, default=0)
    parser.add_argument("--no-display", action="store_true")
    parser.add_argument(
        "--interpolate-overlay", action=argparse.BooleanOptionalAction, default=None,
        help="F3: draw skipped source-frame boxes (default OFF; TECHGAR_F3_OVERLAY=1)",
    )
    parser.add_argument("--min-visible-count", type=int, default=3)
    parser.add_argument("--lost-track-ttl", type=int, default=90)
    parser.add_argument("--motion-min-area", type=int, default=650)
    parser.add_argument("--no-occlusion-guard", action="store_true", help="Ablation: disable two-car group protection")
    parser.add_argument("--no-watershed", action="store_true", help="Keep group protection, disable provisional watershed")
    parser.add_argument("--no-spatial-appearance", action="store_true", help="Ablation: original 416-D descriptor only")
    parser.add_argument("--motion-max-distance", type=float, default=180.0)
    parser.add_argument("--motion-min-displacement", type=float, default=6.0)
    parser.add_argument("--motion-threshold", type=int, default=20)
    parser.add_argument("--motion-min-pixels", type=int, default=100)
    parser.add_argument("--motion-min-ratio", type=float, default=0.05)
    parser.add_argument(
        "--motion-roi-context-px",
        type=int,
        default=48,
        help=(
            "Vung dem chi de hoan thien contour da cham ROI; blob hoan toan "
            "ngoai ROI van bi loai"
        ),
    )
    parser.add_argument(
        "--motion-max-bbox-width-ratio",
        type=float,
        default=0.30,
        help="Chieu rong bbox toi da theo ty le chieu rong frame",
    )
    parser.add_argument(
        "--motion-max-bbox-height-ratio",
        type=float,
        default=0.42,
        help="Chieu cao bbox toi da theo ty le chieu cao frame",
    )
    parser.add_argument(
        "--motion-max-bbox-area-ratio",
        type=float,
        default=0.12,
        help="Dien tich bbox toi da theo ty le dien tich frame",
    )
    parser.add_argument(
        "--motion-join-kernel-size",
        type=int,
        default=5,
        help="Kernel morphology noi foreground; nho hon giup hai xe gan nhau khong bi gop",
    )
    parser.add_argument(
        "--motion-join-iterations",
        type=int,
        default=1,
        help="So lan morphology noi foreground",
    )
    parser.add_argument("--motion-reacquire-seconds", type=float, default=1.5)
    parser.add_argument("--motion-lost-appearance-threshold", type=float, default=0.30)
    parser.add_argument("--motion-merged-area-ratio", type=float, default=1.60)
    parser.add_argument(
        "--motion-max-prediction-age-seconds",
        type=float,
        default=0.40,
        help="Tuổi tối đa của dự đoán Kalman khi track mất detection",
    )
    parser.add_argument(
        "--motion-prediction-decay-seconds",
        type=float,
        default=0.25,
        help="Hằng số suy giảm vận tốc khi track đang coasting",
    )
    parser.add_argument(
        "--motion-ambiguity-margin",
        type=float,
        default=0.08,
        help="Độ chênh chi phí tối thiểu để chấp nhận ghép khi có cạnh tranh",
    )
    parser.add_argument(
        "--motion-ambiguity-recovery-frames",
        type=int,
        default=3,
        help="Số frame bằng chứng rõ ràng trước khi thoát trạng thái mơ hồ",
    )
    parser.add_argument(
        "--slot-recovery-seconds",
        type=float,
        default=5.0,
        help="Thoi gian giu GID cua xe vua roi o trong bo nho dem",
    )
    parser.add_argument("--slot-recovery-start-expand-ratio", type=float, default=0.05)
    parser.add_argument(
        "--slot-recovery-max-expand-ratio",
        type=float,
        default=0.85,
        help=(
            "Ban kinh toi da tim lai GID tinh theo duong cheo o; 0.85 giu "
            "duoc xe do choi di nhanh trong khi van can appearance/huong/3 mau"
        ),
    )
    parser.add_argument("--slot-recovery-expand-seconds", type=float, default=1.0)
    parser.add_argument(
        "--slot-recovery-appearance-threshold",
        type=float,
        default=0.62,
        help="Nguong histogram cho recovery; van can du 3 mau lien tiep va huong roi o",
    )
    parser.add_argument(
        "--slot-arrival-lookback-seconds",
        type=float,
        default=None,
        help=(
            "Thoi gian giu arrival claim sau khi mat track; mac dinh tu dong "
            "theo parking FPS va do tre ket qua vision (toi thieu 3 giay)"
        ),
    )
    parser.add_argument("--slot-arrival-min-samples", type=int, default=3)
    parser.add_argument("--slot-arrival-vision-confirmations", type=int, default=2)
    parser.add_argument("--slot-arrival-absence-seconds", type=float, default=0.75)
    parser.add_argument(
        "--slot-arrival-lost-commit-delay-seconds", type=float, default=0.35
    )
    parser.add_argument(
        "--slot-arrival-processing-grace-seconds",
        type=float,
        default=5.0,
        help="Thoi gian toi da giu GID trong khi worker vision dang xac nhan",
    )
    parser.add_argument("--handoff-ttl", type=int, default=45)
    parser.add_argument("--handoff-match-distance", type=float)
    parser.add_argument("--handoff-appearance-threshold", type=float, default=0.45)
    parser.add_argument(
        "--handoff-relaxed-appearance-threshold",
        type=float,
        default=0.82,
        help=(
            "Nguong appearance chi dung khi cap xe la duy nhat va rat gan nhau "
            "tren shared map"
        ),
    )
    parser.add_argument(
        "--cross-camera-duplicate-distance",
        type=float,
        help="Ban kinh hop nhat hai Global ID da cap (lay mac dinh tu calibration)",
    )
    parser.add_argument(
        "--cross-camera-defer-frames",
        type=int,
        default=8,
        help="So frame cho tracklet ro hon truoc khi cap ID moi trong overlap",
    )
    parser.add_argument("--handoff-lookahead-frames", type=int, default=16)
    parser.add_argument("--handoff-prediction-radius", type=float)
    parser.add_argument("--handoff-min-direction-cosine", type=float, default=0.25)
    parser.add_argument("--identity-retention-seconds", type=float, default=60.0)
    parser.add_argument(
        "--enable-stationary-reacquire",
        dest="enable_stationary_reacquire",
        action="store_true",
        default=True,
        help="Bat nhanh re-acquire cuoi cho xe do yen mat track (tranh mint GID trung cho cung mot xe)",
    )
    parser.add_argument(
        "--legacy-stationary-reacquire",
        dest="enable_stationary_reacquire",
        action="store_false",
        help="Tat stationary reacquire, tro ve hanh vi cu",
    )
    parser.add_argument(
        "--legacy-stationary-frozen",
        dest="stationary_resume_frozen",
        action="store_false",
        default=True,
        help=(
            "Tat P26: fragment dang dong bang (frozen_ambiguous/coasting/occluded_prediction) "
            "KHONG duoc xet lai GID cu (ve hanh vi truoc P26)"
        ),
    )
    parser.add_argument(
        "--legacy-stationary-ttl",
        dest="hold_stationary_fragment_ttl",
        action="store_false",
        default=True,
        help=(
            "Tat P26: fragment dung yen da duoc thay that se bi TTL don nhu cu "
            "(truoc P26, xe do roi nhich lai bi cap GID moi)"
        ),
    )
    parser.add_argument(
        "--legacy-stationary-reserve",
        dest="stationary_reserve_hold",
        action="store_false",
        default=True,
        help=(
            "Tat P26: xe dung yen tuyet doi KHONG duoc giu identity qua "
            "_parked_reservations (ve hanh vi truoc P26)"
        ),
    )
    parser.add_argument(
        "--identity-retention-moving-seconds",
        type=float,
        default=12.0,
        help=(
            "cua so giu Global ID cho xe dang di chuyen (xe da do giu"
            " --identity-retention-seconds nho co reservation cho do)"
        ),
    )
    parser.add_argument("--identity-retention-frames", type=int, default=180)
    parser.add_argument("--dormant-match-distance", type=float)
    parser.add_argument("--dormant-appearance-threshold", type=float, default=0.60)
    parser.add_argument("--tracklet-max-samples", type=int, default=12)
    parser.add_argument("--tracklet-sample-interval", type=int, default=3)
    parser.add_argument("--global-gallery-max-samples", type=int, default=24)
    parser.add_argument(
        "--trajectory-history-seconds",
        type=float,
        default=2.0,
        help="Do dai bo nho quy dao world-map; mac dinh 2 giay",
    )
    parser.add_argument(
        "--show-motion-trails",
        action="store_true",
        help="Ve vet world trajectory chi len cua so/debug MP4",
    )
    parser.add_argument(
        "--new-identity-min-observations",
        type=int,
        default=5,
        help="So detection that toi thieu truoc khi tao mot Global ID hoan toan moi",
    )
    parser.add_argument(
        "--new-identity-unusual-size-observations",
        type=int,
        default=12,
        help="So detection can co neu bbox khac thuong so voi kich thuoc xe da hoc",
    )
    parser.add_argument(
        "--new-identity-min-displacement-ratio",
        type=float,
        default=0.15,
        help="Quang duong toi thieu theo duong cheo bbox truoc khi tao GID moi",
    )
    parser.add_argument("--max-camera-skew-ms", type=float, default=120.0)
    parser.add_argument("--sync-catchup-reads", type=int, default=3)
    parser.add_argument("--opencv-threads", type=int, default=1,
                        help="So luong OpenCV threads moi tien trinh; 1 tranh tranh chap voi hai vision workers")
    parser.add_argument(
        "--debug-video-queue-size",
        type=int,
        default=128,
        help="Kich thuoc hang doi bo dem ghi debug video sang thread rieng (mac dinh = 128 frame)",
    )
    return parser


def validate_async_render(identity_kernel, runtime_publisher):
    if identity_kernel not in ('core2', 'core2l') or runtime_publisher is not None:
        raise ValueError('--render-async chi ho tro core2/core2l, khong ho tro runtime publisher')


def run(args: argparse.Namespace, runtime_publisher=None) -> None:
    perf_stages = bool(getattr(args, 'perf_stages', False))
    if perf_stages and (args.identity_kernel != 'core2l' or not args.session_dir or args.debug_video_only):
        raise ValueError('--perf-stages requires core2l and a predictions-enabled session')
    render_async = bool(getattr(args, 'render_async', False))
    render_every = int(getattr(args, 'render_every', 1))
    preview_scale = float(getattr(args, 'render_preview_scale', 1.0))
    render_replay_process = bool(getattr(args, 'render_replay_process', False))
    video_scale = float(getattr(args, 'render_video_scale', 1.0))
    video_codec = getattr(args, 'render_video_codec', 'mp4v')
    if render_replay_process and (not render_async or not args.replay_session or args.no_session_video):
        raise ValueError('--render-replay-process requires --render-async, --replay-session and session video')
    if not 0 < video_scale <= 1 or (not render_replay_process and (video_scale != 1.0 or video_codec != 'mp4v')):
        raise ValueError('video scale/codec require --render-replay-process; scale must be in (0,1]')
    if render_every < 1 or not 0 < preview_scale <= 1:
        raise ValueError('render-every >= 1 and 0 < render-preview-scale <= 1 required')
    if not render_async and (render_every != 1 or preview_scale != 1.0):
        raise ValueError('render-every and render-preview-scale require --render-async')
    if args.public_id_split and args.identity_kernel != 'core2l':
        raise ValueError('--public-id-split requires --identity-kernel core2l')
    if args.public_id_map and not args.public_id_split:
        raise ValueError('--public-id-map requires --public-id-split')
    if args.public_id_map and Path(args.public_id_map).exists():
        raise FileExistsError(args.public_id_map)
    cv2.setNumThreads(max(1, int(getattr(args, "opencv_threads", 1))))
    f3_overlay_enabled = is_interpolated_overlay_enabled(args)
    profile_enabled = os.environ.get("TECHGAR_PROFILE") == "1" or perf_stages
    profile_interval = max(1, int(os.environ.get('TECHGAR_PROFILE_INTERVAL', '100')))
    profile_totals = {}
    profile_maximums = {}
    profile_imshow_ms = [0.0]
    profile_original_imshow = cv2.imshow
    if profile_enabled:
        # Measure GUI calls without changing the display path owned by T3.
        def profiled_imshow(*args, **kwargs):
            before = time.perf_counter()
            try:
                return profile_original_imshow(*args, **kwargs)
            finally:
                profile_imshow_ms[0] += (time.perf_counter() - before) * 1000.0
        cv2.imshow = profiled_imshow
    arrival_lookback_seconds = resolve_slot_arrival_lookback_seconds(args)
    replay_session_path = (
        Path(args.replay_session).resolve() if args.replay_session else None
    )
    if replay_session_path is not None:
        if args.cam1_url or args.cam2_url:
            raise ValueError(
                "--replay-session khong duoc dung chung voi --cam1-url/--cam2-url"
            )
        if (getattr(args, "replay_drop_frames", False)
                and not (getattr(args, "replay_realtime", False) or getattr(args, "live_mode", False))):
            raise ValueError("--replay-drop-frames can --replay-realtime hoac --live-mode")
    elif not args.cam1_url or not args.cam2_url:
        raise ValueError(
            "Can ca --cam1-url va --cam2-url, hoac dung --replay-session"
        )
    if getattr(args, "start_frame", 1) != 1 and replay_session_path is None:
        raise ValueError("--start-frame chi ho tro replay session")
    replay_stride = int(getattr(args, "replay_stride", 1) or 1)
    if replay_stride < 1:
        raise ValueError("--replay-stride phai >= 1")
    if replay_stride > 1:
        # P36 test-only path. Kept deliberately narrow so the default behaviour
        # (stride 1) is untouched: no stride logic runs at all unless asked.
        if replay_session_path is None:
            raise ValueError("--replay-stride chi ho tro replay session")
        if getattr(args, "replay_realtime", False) or getattr(args, "live_mode", False):
            raise ValueError(
                "--replay-stride khong duoc dung voi --replay-realtime/--live-mode "
                "(pace/skip se lam ket qua khong tat dinh)"
            )
        if getattr(args, "replay_drop_frames", False):
            raise ValueError(
                "--replay-stride khong duoc dung voi --replay-drop-frames "
                "(ca hai deu bo frame, ket qua se khong tat dinh)"
            )

    output_dir = Path(args.output_dir).resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    calibration_path = Path(args.calibration).resolve()

    session_dir = Path(args.session_dir).resolve() if args.session_dir else None
    if session_dir is not None and session_dir == output_dir:
        raise ValueError(
            "--output-dir va --session-dir phai la hai thu muc khac nhau"
        )
    if session_dir is not None and session_dir.exists():
        raise FileExistsError(f"Session da ton tai: {session_dir}")

    captures = {}
    writers = {}
    timestamps_file = performance_file = predictions_file = None
    frame_index = 0
    recorded_frame_count = 0
    recording_counts: dict[str, int] = {}
    recording_write_interrupted = False
    debug_video_writer: Optional[AsyncDebugVideoWriter] = None
    async_render_worker = None
    async_video_process = None
    stage_timers = None
    async_video_specs = {}
    async_render_stop = threading.Event()
    session_created = False
    status = "failed"
    started_at = datetime.now().astimezone()
    processing_started_at = time.monotonic()
    runtime_id = uuid.uuid4().hex
    tuning_panel = None
    roi_editor = None
    parking_executor = None
    parking_worker_affinity_mask = None
    parking_affinity_restore = None
    motion_executor = None
    motion_pipeline = None
    status_writer: Optional[RuntimeJsonWriter] = None
    replay = None
    replay_completed = False
    replay_timing = None
    prediction_builder = PredictionV3Builder(cache_event_fingerprints=(
        bool(getattr(args, 'perf_optimize', False)) and args.identity_kernel == 'core2l'))
    display_scale = getattr(args, "display_scale", None)
    if display_scale is None:
        display_scale = 0.5 if getattr(args, "live_mode", False) else 1.0
    display_scale = max(0.1, min(2.0, float(display_scale)))
    
    try:
        if replay_session_path is not None:
            start_frame = getattr(args, "start_frame", 1)
            replay = ReplaySession(
                replay_session_path,
                prefetch_capacity=getattr(args, "replay_prefetch_frames", 1),
                start_frame=max(1, start_frame - 150),
            )
            captures = replay.captures
            first_pair = replay.read_pair()
            if first_pair is None:  # Guarded by the non-empty timestamp validation.
                raise RuntimeError("Replay session khong co frame")
            frames, capture_sequences, capture_timestamps_ns, replay_timing = first_pair
            print(
                f"Replay dong bo {len(replay.timings)} cap frame tu: "
                f"{replay_session_path}"
            )
        else:
            camera_urls = {"cam1": args.cam1_url, "cam2": args.cam2_url}
            for camera_id, url in camera_urls.items():
                if url.startswith(("rtsp://", "http://", "https://")):
                    captures[camera_id] = LatestFrameCapture(url).start()
                else:
                    captures[camera_id] = cv2.VideoCapture(url)

            frames = {}
            capture_sequences = {}
            capture_timestamps_ns = {}
            for camera_id, capture in captures.items():
                if isinstance(capture, LatestFrameCapture):
                    frame, sequence, captured_at_ns = capture.read_latest_timed(timeout=10.0)
                else:
                    ret, frame = capture.read()
                    if not ret or frame is None:
                        raise RuntimeError(f"Khong doc duoc frame dau tu {camera_id}")
                    sequence = 0
                    captured_at_ns = time.monotonic_ns()
                frames[camera_id] = frame
                capture_sequences[camera_id] = sequence
                capture_timestamps_ns[camera_id] = captured_at_ns
            synchronize_live_frames(
                captures, frames, capture_sequences, capture_timestamps_ns,
                args.max_camera_skew_ms, args.sync_catchup_reads,
            )

        sizes = {camera_id: (frame.shape[1], frame.shape[0]) for camera_id, frame in frames.items()}
        initial_camera_fps = {}
        for camera_id, capture in captures.items():
            try:
                reported_fps = float(capture.get(cv2.CAP_PROP_FPS))
            except (AttributeError, TypeError, ValueError):
                reported_fps = 0.0
            initial_camera_fps[camera_id] = (
                reported_fps if np.isfinite(reported_fps) and reported_fps > 0.0 else 25.0
            )
        if session_dir is not None:
            if args.debug_video_only and args.no_session_video:
                raise ValueError("--debug-video-only khong dung cung --no-session-video")
            session_dir.mkdir(parents=True)
            session_created = True
            if not args.no_session_video:
                for camera_id, (width, height) in sizes.items():
                    fps = float(captures[camera_id].get(cv2.CAP_PROP_FPS)) or 25.0
                    if render_async:
                        if not args.debug_video_only:
                            async_video_specs[f'raw_{camera_id}'] = (str(session_dir / f'raw_{camera_id}.{ "avi" if render_replay_process and video_codec == "MJPG" else "mp4"}'), fps / render_every, (width, height))
                        async_video_specs[f'debug_{camera_id}'] = (str(session_dir / f'debug_{camera_id}.{ "avi" if render_replay_process and video_codec == "MJPG" else "mp4"}'), fps / render_every, (width, height))
                        writers[camera_id] = (None if args.debug_video_only else True, True)
                    else:
                        writers[camera_id] = (
                            None if args.debug_video_only else cv2.VideoWriter(str(session_dir / f"raw_{camera_id}.mp4"), cv2.VideoWriter_fourcc(*"mp4v"), fps, (width, height)),
                            cv2.VideoWriter(str(session_dir / f"debug_{camera_id}.mp4"), cv2.VideoWriter_fourcc(*"mp4v"), fps, (width, height)),
                        )
                    if not args.debug_video_only:
                        recording_counts[f"raw_{camera_id}"] = 0
                    recording_counts[f"debug_{camera_id}"] = 0
                queue_size = int(getattr(args, "debug_video_queue_size", 128) or 128)
                if not render_async:
                    debug_video_writer = AsyncDebugVideoWriter(maxsize=queue_size)
            if not args.debug_video_only:
                timestamps_file = (session_dir / "frame_timestamps.csv").open("w", newline="", encoding="utf-8-sig")
                performance_file = (session_dir / "performance.csv").open("w", newline="", encoding="utf-8-sig")
                predictions_file = (gzip.open(session_dir / 'predictions.jsonl.gz', 'wt', compresslevel=1, encoding='utf-8', newline='\n')
                                    if getattr(args, 'predictions_gzip', False) else
                                    (session_dir / "predictions.jsonl").open("w", encoding="utf-8"))
                recording_counts["timestamps"] = 0
                recording_counts["performance"] = 0
                recording_counts["predictions"] = 0
                csv.writer(timestamps_file).writerow([
                    "frame_idx", "capture_unix_ns", "wall_time_iso",
                    "cam1_monotonic_ns", "cam2_monotonic_ns", "camera_skew_ms",
                ])
                perf_header = [
                    "frame_idx", "total_processing_ms", "tracking_pipeline_ms", "debug_video_dropped_frames"
                ]
                if perf_stages:
                    perf_header += ['source_frame_idx','read_pace_ms','parking_apply_ms','parking_total_ms',
                        'motion_wall_ms','detect_cam1_ms','detect_cam2_ms','decode_cam1_ms','decode_cam2_ms',
                        'homography_cam1_ms','homography_cam2_ms','fuse_ms','engine_ms','binder_ms',
                        'cross_wall_ms','prediction_build_ms','render_ms','write_submit_ms','track_count','blob_count','snapshot_submit_ms']
                    if args.replay_drop_readahead:
                        perf_header.append('total_incl_submit_ms')
                csv.writer(performance_file).writerow(perf_header)
            ground_truth_headers = {
                "ground_truth_slots.csv": [
                    "schema_version", "camera_id", "slot_id", "start_frame",
                    "end_frame", "occupied", "physical_vehicle_id",
                    "identity_required", "notes",
                ],
                "ground_truth_events.csv": [
                    "schema_version", "event_id", "physical_vehicle_id",
                    "event_type", "start_frame", "end_frame", "source_camera",
                    "target_camera", "source_slot_id", "target_slot_id",
                    "preferred_delay_frames", "max_delay_frames", "required",
                    "critical", "notes",
                ],
                "ground_truth_identity.csv": [
                    "schema_version", "observation_id", "physical_vehicle_id",
                    "frame_idx", "camera_id", "anchor_x", "anchor_y", "slot_id",
                    "phase", "required", "notes",
                ],
            }
            for filename, header in ground_truth_headers.items():
                with (session_dir / filename).open("w", newline="", encoding="utf-8-sig") as ground_truth:
                    csv.writer(ground_truth).writerow(header)
        
        transforms, adjacency, overlap_regions, exit_zones = load_calibration(calibration_path)
        calibration_payload = json.loads(calibration_path.read_text(encoding="utf-8"))
        transforms = adapt_calibration_to_frame_sizes(
            calibration_payload, transforms, sizes
        )
        print(
            "  [calibration] "
            f"id={calibration_payload.get('calibration_id', 'legacy')} "
            f"status={calibration_payload.get('calibration_status', 'legacy_unverified')} "
            f"path={calibration_path}"
        )
        matching_defaults = calibration_payload.get("matching_defaults", {})
        tracking_defaults = calibration_payload.get("tracking_defaults", {})
        world_unit = str(calibration_payload.get("world", {}).get("unit", "source_video_pixel"))
        derived_matching = derive_matching_defaults(calibration_payload)
        slot_length_world = median_slot_length(calibration_payload) or 0.0
        slot_width_world = median_slot_width(calibration_payload) or 0.0
        world_unit_label = "cm" if world_unit == "cm" else "u"
        # P16k (#8a): the dormant re-id speed ceiling must be in the *world*
        # unit of this calibration.  Newer calibrations carry
        # ``world_scale_k`` (world units per metre, sim = 2.0895); older real
        # sessions do not, so fall back to the standard 2.50 m parking bay
        # width implied by the calibrated slot geometry.  Both paths yield
        # world units per metre, so the ceiling is independent of the camera.
        world_scale_k = calibration_payload.get("world_scale_k")
        if not isinstance(world_scale_k, (int, float)) or world_scale_k <= 0:
            world_scale_k = (
                float(slot_width_world) / 2.50 if slot_width_world > 0 else 1.0
            )
        dormant_reid_max_speed_world = (
            max(0.0, float(args.dormant_reid_max_speed_kmh)) / 3.6
        ) * float(world_scale_k)
        shared_map_anchor = str(
            tracking_defaults.get("shared_map_anchor", "bottom_center")
        )
        handoff_match_distance = resolve_matching_distance(
            "handoff_match_distance",
            args.handoff_match_distance,
            matching_defaults.get("handoff_match_distance"),
            derived_matching.get("handoff_match_distance"),
            100.0,
        )
        handoff_prediction_radius = resolve_matching_distance(
            "handoff_prediction_radius",
            args.handoff_prediction_radius,
            matching_defaults.get("handoff_prediction_radius"),
            derived_matching.get("handoff_prediction_radius"),
            90.0,
        )
        dormant_match_distance = resolve_matching_distance(
            "dormant_match_distance",
            args.dormant_match_distance,
            matching_defaults.get("dormant_match_distance"),
            derived_matching.get("dormant_match_distance"),
            160.0,
        )
        cross_camera_duplicate_distance = resolve_matching_distance(
            "cross_camera_duplicate_distance",
            args.cross_camera_duplicate_distance,
            matching_defaults.get("cross_camera_duplicate_distance"),
            derived_matching.get("cross_camera_duplicate_distance"),
            handoff_match_distance * 0.60,
        )
        if derived_matching:
            print(
                f"  [identity] slot dai {slot_length_world:.2f}{world_unit_label} ->"
                f" handoff {handoff_match_distance:.2f}"
                f" prediction {handoff_prediction_radius:.2f}"
                f" dormant {dormant_match_distance:.2f}"
                f" duplicate {cross_camera_duplicate_distance:.2f}"
            )

        # Load mask jsons and set roi_mask
        custom_masks = {}
        for cam_id, mask_path in [("cam1", args.mask_cam1), ("cam2", args.mask_cam2)]:
            path = Path(mask_path).resolve()
            if path.exists():
                data = json.loads(path.read_text(encoding="utf-8"))
                h, w = frames[cam_id].shape[:2]
                mask = np.zeros((h, w), dtype=np.uint8)
                pts = np.array([[p["x"], p["y"]] for p in data["polygon"]], np.int32)
                cv2.fillPoly(mask, [pts], 255)
                custom_masks[cam_id] = data
                custom_masks[cam_id]["mask"] = mask

        # Legacy masks may define one explicit handoff edge per camera. Newer
        # masks only describe each camera's independent tracking ROI, so keep
        # the adjacency from the shared-map calibration in that case.
        if (
            "cam1" in custom_masks
            and "cam2" in custom_masks
            and custom_masks["cam1"].get("handoff_edge") not in (None, "")
            and custom_masks["cam2"].get("handoff_edge") not in (None, "")
        ):
            adjacency = {}  # Clear old adjacency
            # The edge from cam1 to cam2 is defined by the user
            adjacency[("cam1", str(custom_masks["cam1"]["handoff_edge"]))] = "cam2"
            adjacency[("cam2", str(custom_masks["cam2"]["handoff_edge"]))] = "cam1"

        if args.identity_kernel not in ("core2", "core2l"):
            manager = CrossCameraManager(
                camera_sizes=sizes,
                camera_crops={camera_id: (0, 0, *size) for camera_id, size in sizes.items()},
                camera_transforms=transforms,
                edge_adjacency=adjacency,
                overlap_regions=overlap_regions,
                custom_masks=custom_masks,
                handoff_ttl=args.handoff_ttl,
                match_distance=handoff_match_distance,
                appearance_threshold=args.handoff_appearance_threshold,
                relaxed_appearance_threshold=args.handoff_relaxed_appearance_threshold,
                cross_camera_duplicate_distance=cross_camera_duplicate_distance,
                cross_camera_defer_frames=args.cross_camera_defer_frames,
                lookahead_frames=args.handoff_lookahead_frames,
                prediction_radius=handoff_prediction_radius,
                min_direction_cosine=args.handoff_min_direction_cosine,
                identity_retention_frames=args.identity_retention_frames,
                identity_retention_seconds=args.identity_retention_seconds,
                identity_retention_moving_seconds=args.identity_retention_moving_seconds,
                dormant_match_distance=dormant_match_distance,
                dormant_appearance_threshold=args.dormant_appearance_threshold,
                tracklet_gallery_size=args.global_gallery_max_samples,
                # P16e: a slot width in world units is the scale of "far apart" for
                # the simultaneous-measurement guard.  Falls back to the manager's
                # duplicate distance when the calibration has no slot polygons.
                slot_width_world=slot_width_world,
                legacy_dormant_merge_overlap=args.legacy_dormant_merge_overlap,
                legacy_young_source_merge_window=args.legacy_young_source_merge_window,
                dormant_reid_max_speed_world_per_s=dormant_reid_max_speed_world,
                legacy_dormant_reid=args.legacy_dormant_reid,
                new_identity_min_observations=args.new_identity_min_observations,
                new_identity_unusual_size_observations=(
                    args.new_identity_unusual_size_observations
                ),
                new_identity_min_displacement_ratio=(
                    args.new_identity_min_displacement_ratio
                ),
                exit_zones=exit_zones,
                world_unit=world_unit,
                shared_map_anchor=shared_map_anchor,
                camera_fps=initial_camera_fps,
                trajectory_history_seconds=args.trajectory_history_seconds,
                enable_stationary_reacquire=getattr(
                    args, "enable_stationary_reacquire", True
                ),
                stationary_resume_frozen=getattr(
                    args, "stationary_resume_frozen", True
                ),
                stationary_reserve_hold=getattr(
                    args, "stationary_reserve_hold", True
                ),
                split_vehicle_echo=not getattr(
                    args, "legacy_split_vehicle_echo", False
                ),
            )
        if args.identity_kernel == "world":
            if world_unit != "cm":
                raise ValueError(
                    f"--identity-kernel world requires a cm calibration, got {world_unit!r}"
                )
            if getattr(args, "identity_kernel_dump", None):
                # P37/T6c debug: chi co nghia o world mode. Ghi ro thay vi bo qua.
                print(
                    f"[P37_T6C] dump adapter -> {args.identity_kernel_dump}",
                    flush=True,
                )
            gates_path = calibration_path.parent / "gate_zones.json"
            if not gates_path.is_file():
                raise FileNotFoundError(
                    f"--identity-kernel world requires gate_zones.json next to calibration: {gates_path}"
                )
            from techgar.world_identity_adapter import WorldIdentityAdapter
            from techgar.world_identity_kernel import GroundGeometry

            gate_zones = json.loads(gates_path.read_text(encoding="utf-8"))
            if gate_zones.get("unit") != "cm":
                raise ValueError(f"World gate zones must use cm: {gates_path}")
            manager = WorldIdentityAdapter(
                GroundGeometry.from_config(calibration_payload, gate_zones),
                transforms,
                bootstrap_first_frame=True,
                dump_path=getattr(args, "identity_kernel_dump", None),
            )
        elif args.identity_kernel == "core2":
            from techgar.core2.adapter import Core2Adapter, make_engine
            gates_path = calibration_path.parent / "gate_zones.json"
            gate_zones = json.loads(gates_path.read_text(encoding="utf-8"))
            manager = Core2Adapter(make_engine(calibration_payload, gate_zones))
        elif args.identity_kernel == "core2l":
            from techgar.core2.adapter import Core2Adapter
            from techgar.core2.adapter_l import load_m1l_config, make_engine_l
            m1l_config = load_m1l_config(args.m1l_decode_config)
            gates_path = calibration_path.parent / 'gate_zones.json'
            gate_zones = json.loads(gates_path.read_text(encoding='utf8'))
            manager = Core2Adapter(make_engine_l(transforms, gate_zones, frame_sizes=sizes,
                **({'public_id_split': True} if args.public_id_split else {})))
        slot_files = {"cam1": args.slots_cam1, "cam2": args.slots_cam2}
        detectors = {
            camera_id: ParkingDetector(
                slot_file,
                smoothing_frames=max(1, int(args.parking_smoothing_frames)),
                use_edge_recheck=False,
                # The magenta inner mask should cover most of the vehicle,
                # while still staying clear of the painted slot boundary.
                core_scale=0.80,
                stable_evidence=not args.legacy_parking_filter,
                selective_line_filter=not args.legacy_parking_filter,
                static_color_rescue=not args.legacy_static_color_rescue,
                exit_ratio_thr=args.parking_exit_ratio,
                occupied_seconds=args.parking_occupied_seconds,
                empty_seconds=args.parking_empty_seconds,
            )
            for camera_id, slot_file in slot_files.items()
        }
        # --camN-video resolves to a recorded replay for timestamp accuracy.
        # When served through the Runtime API, this is an interactive video
        # stream: expensive parking detection must not stall its frame loop.
        # Explicit --replay-session keeps the deterministic synchronous path.
        parking_async = (
            replay is None
            or bool(getattr(args, "replay_async_vision", False))
            or (runtime_publisher is not None and bool(getattr(args, "cam1_video", None)))
        )
        if args.parking_schedule == "event" and not parking_async:
            print("[P38_PARKING_EVENT] Replay dong bo giu lich periodic de bao toan golden", flush=True)
        profile_path = Path(args.detector_profile).resolve()
        replay_detector_profile = None
        if replay_session_path is not None:
            replay_info_path = replay_session_path / "session_info.json"
            if replay_info_path.is_file():
                try:
                    replay_info = json.loads(
                        replay_info_path.read_text(encoding="utf-8")
                    )
                except (OSError, UnicodeError, json.JSONDecodeError) as exc:
                    # Old/foreign sessions can have a Windows ACL that permits
                    # reading the videos but not this optional metadata file.
                    # Replay remains valid; only the detector tuning snapshot
                    # from that recording is unavailable.
                    print(
                        "Canh bao: khong doc duoc detector profile cua session "
                        f"({replay_info_path}): {exc}. "
                        "Tiep tuc bang detector profile hien tai."
                    )
                else:
                    value = replay_info.get("detector_parameters")
                    if isinstance(value, dict):
                        replay_detector_profile = value
        if args.no_display:
            profile = replay_detector_profile
            if profile is None and profile_path.is_file():
                profile = json.loads(profile_path.read_text(encoding="utf-8"))
            if profile is not None:
                for camera_id, detector in detectors.items():
                    apply_detector_parameters(detector, profile.get(camera_id, {}))
        else:
            tuning_panel = DetectorTuningPanel(detectors, profile_path)
            if replay_detector_profile is not None:
                for camera_id, detector in detectors.items():
                    apply_detector_parameters(
                        detector, replay_detector_profile.get(camera_id, {})
                    )
        if not args.legacy_parking_filter:
            for camera_id, detector in detectors.items():
                detector.ratio_thr = float(np.clip(args.parking_enter_ratio, .01, 1.0))
                if tuning_panel is not None:
                    cv2.setTrackbarPos(f"{camera_id.upper()} Ratio %", tuning_panel.WINDOW,
                                      int(round(detector.ratio_thr * 100)))
        if parking_async:
            # One low-priority child, never more than one pending parking job.
            # Replay/golden continues through the synchronous branch below.
            if getattr(args, "live_mode", False):
                # P38/AB2: P38_PARKING_AFFINITY=0 disables the CPU-mask split for
                # A/B measurement. Default (unset) keeps the F2a-FIX behaviour.
                if os.environ.get("P38_PARKING_AFFINITY", "1") != "0":
                    cpu_split = split_live_parking_affinity()
                    if cpu_split is not None:
                        parking_worker_affinity_mask, parking_affinity_restore = cpu_split
            parking_executor = ParkingProcessPool(
                slot_files, detectors, affinity_mask=parking_worker_affinity_mask
            )
        binders = {
            camera_id: SlotVehicleBinder(
                policy="vision_primary",
                recovery_retention_seconds=args.slot_recovery_seconds,
                recovery_initial_expand_ratio=args.slot_recovery_start_expand_ratio,
                recovery_max_expand_ratio=args.slot_recovery_max_expand_ratio,
                recovery_expand_seconds=args.slot_recovery_expand_seconds,
                recovery_appearance_threshold=args.slot_recovery_appearance_threshold,
                # Three observations keep a two-frame shadow/noise fragment
                # from ever consuming the only parked Global ID.
                recovery_evidence_frames=3,
                # The predeparture guard must outlive the slowest path to a
                # confirmed-empty vision result: stale live-result age + the
                # empty dwell + one parking worker interval.  The old 0.75 s
                # default cancelled the token while the car was still
                # reversing out and vision needed >= 1.0 s to confirm the
                # slot empty (P0 hiep2/D01).
                predeparture_guard_seconds=(
                    args.parking_empty_seconds
                    + args.parking_max_result_age_seconds
                    + 1.0 / max(args.parking_fps, 0.01)
                ),
                arrival_lookback_seconds=arrival_lookback_seconds,
                arrival_min_samples=args.slot_arrival_min_samples,
                arrival_vision_confirmations=args.slot_arrival_vision_confirmations,
                arrival_absence_seconds=args.slot_arrival_absence_seconds,
                arrival_lost_commit_delay_seconds=(
                    args.slot_arrival_lost_commit_delay_seconds
                ),
                arrival_processing_grace_seconds=(
                    args.slot_arrival_processing_grace_seconds
                ),
                # P16c: a fragment that has driven beyond the recovery gate is
                # no longer the vehicle that left this slot, so it must not keep
                # the token (nor ``protected_local_keys``) alive.  The flag
                # restores the pre-P16 behaviour for one release.
                legacy_departure_token_distance=(
                    args.legacy_departure_token_distance
                ),
                legacy_token_key_reuse=args.legacy_token_key_reuse,
                legacy_token_continuation_range=args.legacy_token_continuation_range,
                token_foreign_slot_guard=not args.legacy_token_foreign_slot_capture,
            )
            for camera_id in frames
        }
        if getattr(args, 'binder_fast', False):
            for binder in binders.values():
                binder.fast_batch_match = True
        if args.identity_kernel in ('core2', 'core2l'):
            for binder in binders.values():
                binder.defer_to_foreign_owner = True
        if getattr(args, 'perf_optimize', False) and args.identity_kernel == 'core2l':
            for binder in binders.values():
                binder.perf_geometry_cache = True
                # G6A A/B baseline: keep the existing perf-optimize behavior
                # (including prediction serialization and geometry cache),
                # but disable only the new binder paths for parity checks.
                if os.environ.get('TECHGAR_G6A_LEGACY_BINDER') != '1':
                    binder.perf_sparse_match = True
                    binder.perf_stopped_cache = True
        if not args.no_display and not render_async:
            roi_editor = LiveROIEditor(slot_files, sizes)
            cv2.namedWindow(MAIN_WINDOW, cv2.WINDOW_NORMAL)
            cv2.setMouseCallback(MAIN_WINDOW, roi_editor.handle_mouse)
        trackers = {
            camera_id: MotionVehicleTracker(
                enable_occlusion_guard=not args.no_occlusion_guard,
                enable_watershed=not args.no_watershed,
                enable_spatial_appearance=not args.no_spatial_appearance,
                min_visible_count=args.min_visible_count,
                lost_track_ttl=args.lost_track_ttl,
                hold_stationary_fragment_ttl=getattr(
                    args, "hold_stationary_fragment_ttl", True
                ),
                history_len=90,
                min_area=args.motion_min_area,
                max_distance=args.motion_max_distance,
                min_confirm_displacement=args.motion_min_displacement,
                motion_threshold=args.motion_threshold,
                motion_min_pixels=args.motion_min_pixels,
                motion_min_ratio=args.motion_min_ratio,
                max_bbox_width_ratio=args.motion_max_bbox_width_ratio,
                max_bbox_height_ratio=args.motion_max_bbox_height_ratio,
                max_bbox_area_ratio=args.motion_max_bbox_area_ratio,
                motion_join_kernel_size=args.motion_join_kernel_size,
                motion_join_iterations=args.motion_join_iterations,
                roi_context_padding_px=args.motion_roi_context_px,
                enable_multiscale_motion=True,
                reject_cast_shadows=True,
                tracklet_max_samples=args.tracklet_max_samples,
                tracklet_sample_interval=args.tracklet_sample_interval,
                reacquire_max_seconds=args.motion_reacquire_seconds,
                lost_appearance_threshold=args.motion_lost_appearance_threshold,
                merged_detection_area_ratio=args.motion_merged_area_ratio,
                max_prediction_age_seconds=args.motion_max_prediction_age_seconds,
                prediction_velocity_decay_seconds=args.motion_prediction_decay_seconds,
                association_ambiguity_margin=args.motion_ambiguity_margin,
                ambiguous_recovery_frames=args.motion_ambiguity_recovery_frames,
                slot_binder=None,
            )
            for camera_id in frames
        }
        for tracker in trackers.values():
            tracker.fast_motion = bool(args.fast_motion)

        core2_dump = None
        core2_last_t = None
        if getattr(args, "core2_dump", None):
            from techgar.core2.capture import core_version, tap_detector
            from techgar.core2.dump import BlobDumpWriter
            if world_unit != "cm":
                raise ValueError("--core2-dump requires cm calibration")
            if args.identity_kernel not in ("core2", "core2l"):
                core2_captured = {camera_id: tap_detector(tracker)
                                  for camera_id, tracker in trackers.items()}
            core2_dump = BlobDumpWriter(
                args.core2_dump, video=str(replay_session_path or "live"),
                stride=replay_stride, cameras={0: "cam1", 1: "cam2"},
                core_version=core_version(), provenance=("core2_m1l" if args.identity_kernel == "core2l" else "core2_m1" if args.identity_kernel == "core2"
                                                         else "legacy_detector_pre_association"),
                engine_inputs=({'calibration': calibration_payload, 'gates': gate_zones}
                               if args.identity_kernel in ("core2", "core2l") else None))
            if getattr(args, 'core2_dump_async', False):
                from techgar.core2.dump import AsyncBlobDumpWriter
                core2_dump = AsyncBlobDumpWriter(core2_dump)
        elif getattr(args, 'core2_dump_async', False):
            raise ValueError('--core2-dump-async requires --core2-dump')
        
        # Motion observation ROI can intentionally be smaller than the map
        # coverage/handoff ROI passed to CrossCameraManager above.  Defaulting
        # to --mask-cam* preserves existing calibration files and commands.
        tracking_rois = {}
        tracking_mask_paths = {
            "cam1": args.tracking_roi_cam1 or args.mask_cam1,
            "cam2": args.tracking_roi_cam2 or args.mask_cam2,
        }
        for cam_id, mask_path in tracking_mask_paths.items():
            path = Path(mask_path).resolve()
            if path.exists():
                data = json.loads(path.read_text(encoding="utf-8"))
                h, w = frames[cam_id].shape[:2]
                mask = np.zeros((h, w), dtype=np.uint8)
                pts = np.array([[p["x"], p["y"]] for p in data["polygon"]], np.int32)
                cv2.fillPoly(mask, [pts], 255)
                trackers[cam_id].roi_mask = mask
                tracking_rois[cam_id] = data
            else:
                trackers[cam_id].roi_mask = detectors[cam_id].get_global_mask(frames[cam_id].shape)

        if args.identity_kernel == "core2":
            from techgar.core2.adapter import CameraView
            trackers = {camera_id: CameraView(index, transforms[camera_id], trackers[camera_id].roi_mask)
                        for index, camera_id in enumerate(("cam1", "cam2"))}
            manager.views = trackers
        elif args.identity_kernel == 'core2l':
            from techgar.core2.adapter_l import CameraViewL
            model_path = PROJECT_ROOT.parent.parent / m1l_config['model']['onnx']
            trackers = {camera_id: CameraViewL(index, transforms[camera_id], trackers[camera_id].roi_mask,
                                               model_path, args.m1l_decode_config)
                        for index, camera_id in enumerate(('cam1', 'cam2'))}
            manager.views = trackers
        if perf_stages:
            from techgar.core2.perf_stages import StageTimers
            stage_timers = StageTimers()
            stage_timers.install(trackers, manager, binders)

        if replay is not None and getattr(args, "start_frame", 1) > 1:
            frames, capture_sequences, capture_timestamps_ns, replay_timing = (
                warmup_replay_motion(replay, trackers, first_pair, args.start_frame)
            )
        if replay is not None and replay_stride > 1:
            # P36: the warmup pair above IS the first processed frame, and the
            # stride skipping itself lives inside `read_next_source_pair` (which
            # is what feeds every later frame). Doing an extra skip here would
            # consume the pair that function is about to read and make the first
            # step stride+2 instead of stride.
            print(
                f"[P36_STRIDE] stride={replay_stride} "
                f"first_processed={replay_timing.frame_idx}",
                flush=True,
            )

        # Run the independent camera trackers on two persistent workers.
        motion_executor = ThreadPoolExecutor(max_workers=2, thread_name_prefix="motion-camera")

        def read_next_source_pair():
            if replay is not None:
                pair = replay.read_pair()
                if replay_stride <= 1 or pair is None:
                    return pair
                # P36 stride: consume and DISCARD the extra source pairs so the
                # trackers only ever see every N-th one - the same condition a
                # live pipeline produces when it cannot keep up. Decoding happens
                # either way, so skipped pairs cost the same read local motion
                # never sees; therefore they are dropped here, before
                # ``MotionReadAhead`` would run MOG2 on them.
                current = pair
                for _ in range(replay_stride - 1):
                    current = replay.read_pair()
                    if current is None:
                        return None
                return current
            next_frames = {}
            next_sequences = {}
            next_timestamps = {}
            for camera_id, capture in captures.items():
                try:
                    if isinstance(capture, LatestFrameCapture):
                        frame, sequence, timestamp_ns = capture.read_latest_timed(
                            after_sequence=capture_sequences[camera_id], timeout=5.0
                        )
                    else:
                        ok, frame = capture.read()
                        if not ok or frame is None:
                            raise TimeoutError()
                        sequence = frame_index
                        timestamp_ns = time.monotonic_ns()
                except TimeoutError:
                    print(f"End of stream reached for {camera_id}.")
                    return None
                next_frames[camera_id] = frame
                next_sequences[camera_id] = sequence
                next_timestamps[camera_id] = timestamp_ns
            synchronize_live_frames(
                captures, next_frames, next_sequences, next_timestamps,
                args.max_camera_skew_ms, args.sync_catchup_reads,
            )
            return next_frames, next_sequences, next_timestamps, None

        # Realtime replay with skipping must consume its source in the pacing
        # loop. All other modes allow one camera pair in flight, so masks for
        # N+1 overlap cross-camera identity/JSON/render for N.
        replay_drop_override = getattr(args, "replay_drop_frames", None)
        use_replay_drop = replay is not None and (
            bool(getattr(args, "live_mode", False))
            if replay_drop_override is None else bool(replay_drop_override)
        )
        if not getattr(args, "no_motion_pipeline", False) and not use_replay_drop:
            motion_pipeline = MotionReadAhead(read_next_source_pair, trackers, motion_executor)
        if args.replay_drop_readahead and (
            not use_replay_drop or args.no_motion_pipeline or args.identity_kernel != "core2l"
        ):
            raise ValueError("--replay-drop-readahead requires core2l, replay drop and motion pipeline")

        slot_results = {camera_id: [] for camera_id in frames}
        threshold_debug = {}
        last_parking_at = {camera_id: 0.0 for camera_id in frames}
        last_json_at = 0.0
        status_writer = RuntimeJsonWriter(fast_snapshot=bool(getattr(args, 'perf_optimize', False)),
                                          capacity=args.prediction_queue_capacity)
        # F3 history is used only by the display branch. It never enters the
        # motion tracker, binder, identity registry, or predictions writer.
        previous_overlay_measurements = {"cam1": None, "cam2": None}
        parking_futures: dict[str, PendingParkingJob] = {}
        parking_pipeline = {
            camera_id: {
                "state": "waiting",
                "job_id": None,
                "evidence_frame_idx": None,
                "applied_frame_idx": None,
                "result_age_ms": None,
                "processing_ms": None,
                "dropped_results": 0,
                "last_rejection_reason": None,
            }
            for camera_id in frames
        }
        parking_event = (
            ParkingEventScheduler(
                detectors, idle_period_s=args.parking_idle_period,
                started_at_s=time.monotonic(),
            )
            if parking_async and args.parking_schedule == "event" else None
        )
        parking_event_fallback = False

        def parking_failover(reason: str) -> None:
            """Recover a hung/broken event worker, then use existing periodic pacing."""
            nonlocal parking_executor, parking_event_fallback
            if parking_event is None or parking_event_fallback:
                return
            parking_event_fallback = True
            print(f"[P38_PARKING_WARNING] event -> periodic: {reason}", flush=True)
            for camera_id, pending in list(parking_futures.items()):
                binders[camera_id].finish_vision_job(pending.job_id, accepted=False)
                parking_event.completed(camera_id, time.monotonic(), accepted=False)
                parking_pipeline[camera_id].update({
                    "state": "degraded", "last_rejection_reason": "event_worker_failover",
                })
            parking_futures.clear()
            old = parking_executor
            parking_executor = None
            if old is not None:
                # A pool with a stuck child cannot be joined synchronously.
                # Terminate it before shutting down to avoid orphaning a worker.
                try:
                    for proc in (getattr(old._pool, "_processes", None) or {}).values():
                        if proc.is_alive():
                            proc.terminate()
                except Exception as exc:
                    print(f"[P38_PARKING_WARNING] terminate failed: {exc}", flush=True)
                try:
                    old.shutdown(wait=False)
                except Exception as exc:
                    print(f"[P38_PARKING_WARNING] shutdown failed: {exc}", flush=True)
            try:
                parking_executor = ParkingProcessPool(
                    slot_files, detectors, affinity_mask=parking_worker_affinity_mask,
                )
            except Exception as exc:
                print(f"[P38_PARKING_WARNING] restart failed: {exc}", flush=True)
            for camera_id in last_parking_at:
                last_parking_at[camera_id] = 0.0

        if render_async:
            validate_async_render(args.identity_kernel, runtime_publisher)
            async_window_created = [False]
            if async_video_specs:
                async_video_process = AsyncVideoProcess(async_video_specs, capacity=2, replay_dir=replay_session_path if render_replay_process else None,
                    scale=video_scale, codec=video_codec, display=render_replay_process and not args.no_display, preview_scale=preview_scale)
            def render_async_snapshot(snapshot):
                rendered = {}
                video_packet = {}
                for camera_id in ('cam1', 'cam2'):
                    source = snapshot['frames'][camera_id]
                    rendered[camera_id] = render_runtime_frame(source.copy(), snapshot['payloads'][camera_id])
                    if camera_id in writers:
                        raw_writer, debug_writer = writers[camera_id]
                        if raw_writer is not None:
                            video_packet[f'raw_{camera_id}'] = source
                        if debug_writer is not None:
                            video_packet[f'debug_{camera_id}'] = rendered[camera_id]
                if video_packet and not async_video_process.submit(video_packet):
                    raise RuntimeError('async video process stopped')
                if not args.no_display:
                    if not async_window_created[0]:
                        cv2.namedWindow(MAIN_WINDOW, cv2.WINDOW_NORMAL)
                        async_window_created[0] = True
                    main_view = np.hstack([cv2.resize(rendered[c], (max(1, int(640*preview_scale)), max(1, int(360*preview_scale)))) for c in ('cam1', 'cam2')])
                    if display_scale != 1.0:
                        main_view = cv2.resize(main_view, (max(160, int(main_view.shape[1]*display_scale)),
                                                          max(90, int(main_view.shape[0]*display_scale))))
                    cv2.imshow(MAIN_WINDOW, main_view)
                    if (cv2.waitKey(1) & 0xff) in (27, ord('q'), ord('Q')):
                        async_render_stop.set()
            if not render_replay_process:
                async_render_worker = LatestRenderQueue(render_async_snapshot)
        replay_wall_started = time.monotonic()
        replay_source_started = max(capture_timestamps_ns.values()) / 1_000_000_000.0
        if args.replay_drop_readahead:
            motion_pipeline = Core2LDropReadAhead(
                replay, trackers, motion_executor, replay_wall_started, replay_source_started)
        replay_dropped_pairs = 0
        while True:
            if (async_render_stop.is_set() or
                    (render_replay_process and async_video_process is not None and async_video_process.stop_requested)):
                break
            started = time.perf_counter()
            stream_ended = False
            prepared_motion = {}
            if frame_index:
                if motion_pipeline is not None:
                    previous_replay_index = replay_timing.frame_idx if replay_timing is not None else None
                    prepared_pair = motion_pipeline.take_next()
                    if prepared_pair is None:
                        replay_completed = replay is not None
                        break
                    frames, capture_sequences, capture_timestamps_ns, replay_timing, prepared_motion = prepared_pair
                    if args.replay_drop_readahead:
                        replay_dropped_pairs = motion_pipeline.dropped
                    # P36: with a stride the source index advances by more than
                    # one per processed frame, so the invariant becomes "strictly
                    # increasing" instead of "exactly +1". Stride 1 keeps the
                    # original (stronger) check untouched.
                    if replay is not None:
                        if replay_stride <= 1 and not args.replay_drop_readahead:
                            if replay_timing.frame_idx != previous_replay_index + 1:
                                raise RuntimeError(
                                    "Replay frame index khong dong bo: "
                                    f"mong doi {previous_replay_index + 1}, "
                                    f"nhan {replay_timing.frame_idx}"
                                )
                        elif replay_timing.frame_idx <= previous_replay_index:
                            raise RuntimeError(
                                "Replay frame index khong tang khi dung --replay-stride: "
                                f"truoc {previous_replay_index}, "
                                f"nhan {replay_timing.frame_idx}"
                            )
                elif replay is not None:
                    previous_replay_index = replay_timing.frame_idx
                    pair = replay.read_pair()
                    if pair is None:
                        replay_completed = True
                        break
                    if replay_stride > 1:
                        # P36: consume and discard the stride-1 extra pairs here
                        # too, so the no-pipeline path drops the same sources.
                        for _ in range(replay_stride - 1):
                            pair = replay.read_pair()
                            if pair is None:
                                break
                        if pair is None:
                            replay_completed = True
                            break
                    frames, capture_sequences, capture_timestamps_ns, replay_timing = pair
                    if replay_stride <= 1:
                        if replay_timing.frame_idx != previous_replay_index + 1:
                            raise RuntimeError(
                                "Replay frame index khong dong bo: "
                                f"mong doi {previous_replay_index + 1}, "
                                f"nhan {replay_timing.frame_idx}"
                            )
                    elif replay_timing.frame_idx <= previous_replay_index:
                        raise RuntimeError(
                            "Replay frame index khong tang khi dung --replay-stride: "
                            f"truoc {previous_replay_index}, "
                            f"nhan {replay_timing.frame_idx}"
                        )
                    if use_replay_drop:
                        # Never process a stale pair when a newer one exists.
                        # Decode forward until the newest pair is at most
                        # 300 ms late; MOG2 deliberately skips those sources
                        # only in explicit realtime/drop mode.
                        while replay._next_index < len(replay.timings):
                            current_due = replay_wall_started + (
                                max(replay_timing.camera_timestamps_ns.values()) / 1e9
                                - replay_source_started
                            )
                            if time.monotonic() - current_due <= 0.300:
                                break
                            frames, capture_sequences, capture_timestamps_ns, replay_timing = replay.read_pair()
                            replay_dropped_pairs += 1
                else:
                    for camera_id, capture in captures.items():
                        try:
                            if isinstance(capture, LatestFrameCapture):
                                frame, sequence, captured_at_ns = capture.read_latest_timed(
                                    after_sequence=capture_sequences[camera_id], timeout=5.0
                                )
                            else:
                                ret, frame = capture.read()
                                if not ret:
                                    raise TimeoutError()
                                sequence = frame_index
                                captured_at_ns = time.monotonic_ns()
                        except TimeoutError:
                            print(f"End of stream reached for {camera_id}.")
                            frame = None
                            stream_ended = True
                            break
                        frames[camera_id] = frame
                        capture_sequences[camera_id] = sequence
                        capture_timestamps_ns[camera_id] = captured_at_ns
                    if stream_ended or any(f is None for f in frames.values()):
                        break
                    synchronize_live_frames(
                        captures, frames, capture_sequences, capture_timestamps_ns,
                        args.max_camera_skew_ms, args.sync_catchup_reads,
                    )
            frame_index += 1
            camera_timestamps_s = {
                camera_id: timestamp_ns / 1_000_000_000.0
                for camera_id, timestamp_ns in capture_timestamps_ns.items()
            }
            now = (
                max(camera_timestamps_s.values())
                if replay is not None
                else time.monotonic()
            )
            if replay is not None and (
                getattr(args, "replay_realtime", False) or getattr(args, "live_mode", False)
            ):
                due = replay_wall_started + now - replay_source_started
                while time.monotonic() < due:
                    time.sleep(min(0.05, max(0.0, due - time.monotonic())))
            frame_ready_at = time.perf_counter()
            if profile_enabled:
                profile_read_ms = (frame_ready_at - started) * 1000.0
                profile_future_done_ms = 0.0
                profile_future_result_ms = 0.0
                profile_debug_ms = 0.0
                profile_imshow_ms[0] = 0.0
            if (
                tuning_panel is not None
                and replay_detector_profile is None
                and not parking_futures
            ):
                tuning_panel.apply()

            for binder in binders.values():
                binder.begin_frame()
            if profile_enabled:
                profile_parking_started = time.perf_counter()
                profile_parking_cpu_started = time.thread_time()
                profile_parking_accept_ms = 0.0
                profile_parking_bind_ms = 0.0
                profile_parking_copy_ms = 0.0
                profile_parking_submit_ms = 0.0
                profile_parking_completed = 0
                profile_parking_scheduled = 0

            # Apply parking evidence before identity allocation.  A completed
            # occupied->empty result may create a five-second recovery token;
            # processing it later would let a just-created local track consume
            # a fresh, incorrect Global ID first.
            if not parking_async:
                for camera_id, detector in detectors.items():
                    camera_now = camera_timestamps_s[camera_id]
                    parking_due = (
                        camera_now - last_parking_at[camera_id]
                        >= 1.0 / max(args.parking_fps, 0.01)
                    )
                    if not parking_due:
                        continue
                    include_parking_debug = (
                        not args.no_display and not args.no_parking_debug
                    )
                    result, debug_requested, completed_at_s = process_parking_frame(
                        detector,
                        frames[camera_id],
                        include_parking_debug,
                    )
                    parking_pipeline[camera_id].update({
                        "state": "healthy",
                        "job_id": f"{camera_id}:{frame_index}",
                        "evidence_frame_idx": int(frame_index),
                        "applied_frame_idx": int(frame_index),
                        "result_age_ms": 0.0,
                        "processing_ms": 0.0,
                        "last_rejection_reason": None,
                    })
                    if not detector.accept_evidence(result, camera_now, frame_index):
                        continue
                    if debug_requested:
                        if profile_enabled:
                            profile_debug_started = time.perf_counter()
                        debug_images = detector.build_debug_images()
                        if profile_enabled:
                            profile_debug_ms += (time.perf_counter() - profile_debug_started) * 1000.0
                    slot_results[camera_id] = result
                    binders[camera_id].update_vision(
                        result,
                        frame_index,
                        camera_now,
                        camera_id=camera_id,
                    )
                    if debug_requested:
                        threshold_debug[camera_id] = debug_images
                    last_parking_at[camera_id] = camera_now
            else:
                for camera_id, job in list(parking_futures.items()):
                    if profile_enabled:
                        profile_check_started = time.perf_counter()
                    is_done = job.future.done()
                    if profile_enabled:
                        profile_future_done_ms += (time.perf_counter() - profile_check_started) * 1000.0
                    if not is_done:
                        continue
                    health = parking_pipeline[camera_id]
                    parking_futures.pop(camera_id, None)
                    try:
                        if profile_enabled:
                            profile_result_started = time.perf_counter()
                        # A completed future is harvested without waiting for parking.
                        completed_results, debug_requested, completed_at_s, debug_cache = job.future.result(timeout=0)
                        if profile_enabled:
                            profile_future_result_ms += (time.perf_counter() - profile_result_started) * 1000.0
                    except Exception as error:
                        binders[camera_id].finish_vision_job(job.job_id, accepted=False)
                        health.update({"state": "degraded", "last_rejection_reason": "worker_error",
                                       "error": str(error), "applied_frame_idx": int(frame_index)})
                        health["dropped_results"] += 1
                        if parking_event is not None and not parking_event_fallback:
                            parking_event.completed(camera_id, time.monotonic(), accepted=False)
                            parking_failover(f"worker result failed ({camera_id}): {error}")
                        continue
                    result_age_s = max(
                        0.0,
                        camera_timestamps_s[camera_id] - job.timestamp_s,
                        time.monotonic() - job.submitted_at_s,
                    )
                    health.update({
                        "job_id": job.job_id,
                        "evidence_frame_idx": int(job.frame_idx),
                        "applied_frame_idx": int(frame_index),
                        "result_age_ms": round(result_age_s * 1000.0, 3),
                        "source_timestamp_s": job.timestamp_s,
                        "completed_monotonic_s": completed_at_s,
                        "applied_monotonic_s": time.monotonic(),
                        "processing_ms": round(
                            max(0.0, completed_at_s - job.submitted_at_s) * 1000.0,
                            3,
                        ),
                    })
                    if result_age_s > max(
                        0.0, float(args.parking_max_result_age_seconds)
                    ):
                        health["state"] = "degraded"
                        health["dropped_results"] = int(health["dropped_results"]) + 1
                        health["last_rejection_reason"] = "result_too_old"
                        binders[camera_id].finish_vision_job(job.job_id, accepted=False)
                        if parking_event is not None and not parking_event_fallback:
                            parking_event.completed(camera_id, time.monotonic(), accepted=False)
                            parking_failover(f"worker job exceeded result age ({camera_id})")
                        continue
                    detector = detectors[camera_id]
                    if debug_cache is not None:
                        # Pickle preserves the SlotResult aliases shared with
                        # the worker's cache, so accepted evidence colours the
                        # exact same debug image as the synchronous detector.
                        detector._debug_cache = debug_cache
                    if profile_enabled:
                        profile_accept_started = time.perf_counter()
                    accepted = detector.accept_evidence(completed_results, job.timestamp_s, job.frame_idx)
                    if profile_enabled:
                        profile_parking_accept_ms += (time.perf_counter() - profile_accept_started) * 1000.0
                    if not accepted:
                        health["state"] = "degraded"
                        health["dropped_results"] = int(health["dropped_results"]) + 1
                        health["last_rejection_reason"] = "evidence_not_monotonic"
                        binders[camera_id].finish_vision_job(job.job_id, accepted=False)
                        if parking_event is not None and not parking_event_fallback:
                            parking_event.completed(camera_id, time.monotonic(), accepted=False)
                        continue
                    if debug_requested:
                        if profile_enabled:
                            profile_debug_started = time.perf_counter()
                        debug_images = detector.build_debug_images()
                        if profile_enabled:
                            profile_debug_ms += (time.perf_counter() - profile_debug_started) * 1000.0
                    slot_results[camera_id] = completed_results
                    if profile_enabled:
                        profile_bind_started = time.perf_counter()
                    binders[camera_id].update_vision(
                        slot_results[camera_id],
                        frame_index,
                        camera_timestamps_s[camera_id],
                        camera_id=camera_id,
                        evidence_frame_idx=job.frame_idx,
                        evidence_timestamp_s=job.timestamp_s,
                    )
                    if profile_enabled:
                        profile_parking_bind_ms += (time.perf_counter() - profile_bind_started) * 1000.0
                        profile_parking_completed += 1
                    if debug_requested:
                        threshold_debug[camera_id] = debug_images
                    health["state"] = "healthy"
                    health["last_rejection_reason"] = None
                    health["last_accepted_monotonic_s"] = time.monotonic()
                    binders[camera_id].finish_vision_job(job.job_id, accepted=True)
                    if parking_event is not None and not parking_event_fallback:
                        parking_event.completed(camera_id, time.monotonic(), accepted=True)

                include_parking_debug = (
                    not args.no_display and not args.no_parking_debug
                )
                # There is no backlog: once the child is free, choose the
                # oldest-serviced camera and sample its newest source frame.
                # At most one child job is in flight across both cameras.
                if parking_event is not None and not parking_event_fallback:
                    selected = parking_event.next_camera(time.monotonic())
                    parking_order = [selected] if selected is not None else []
                else:
                    parking_order = sorted(detectors, key=lambda cam: last_parking_at[cam])
                for camera_id in parking_order:
                    if parking_futures:
                        break
                    detector = detectors[camera_id]
                    camera_now = camera_timestamps_s[camera_id]
                    parking_due = (
                        True if parking_event is not None and not parking_event_fallback
                        else camera_now - last_parking_at[camera_id]
                        >= 1.0 / max(args.parking_fps, 0.01)
                    )
                    if camera_id in parking_futures or not parking_due:
                        continue
                    submitted_at_s = time.monotonic()
                    if profile_enabled:
                        profile_copy_started = time.perf_counter()
                    frame_copy = frames[camera_id].copy()
                    if profile_enabled:
                        profile_parking_copy_ms += (time.perf_counter() - profile_copy_started) * 1000.0
                        profile_submit_started = time.perf_counter()
                    try:
                        future = parking_executor.submit(
                            camera_id, frame_copy, include_parking_debug,
                            detector_parameters(detector),
                        )
                    except Exception as error:
                        parking_pipeline[camera_id].update({
                            "state": "degraded", "last_rejection_reason": "worker_submit_error",
                            "error": str(error),
                        })
                        if parking_event is not None and not parking_event_fallback:
                            parking_failover(f"worker submit failed ({camera_id}): {error}")
                        continue
                    if profile_enabled:
                        profile_parking_submit_ms += (time.perf_counter() - profile_submit_started) * 1000.0
                        profile_parking_scheduled += 1
                    job_id = f"{camera_id}:{frame_index}"
                    parking_futures[camera_id] = PendingParkingJob(
                        future=future,
                        frame_idx=frame_index,
                        timestamp_s=camera_now,
                        job_id=job_id,
                        submitted_at_s=submitted_at_s,
                    )
                    binders[camera_id].register_vision_job(job_id, frame_index, camera_now)
                    parking_pipeline[camera_id].update({
                        "pending_job_id": job_id,
                        "pending_evidence_frame_idx": int(frame_index),
                        "pending_submitted_monotonic_s": submitted_at_s,
                    })
                    if parking_pipeline[camera_id]["state"] == "waiting":
                        parking_pipeline[camera_id]["state"] = "processing"
                    last_parking_at[camera_id] = camera_now
                    if parking_event is not None and not parking_event_fallback:
                        parking_event.submitted(camera_id, submitted_at_s)

                for camera_id, health in parking_pipeline.items():
                    job = parking_futures.get(camera_id)
                    age = max(0.0, time.monotonic() - job.submitted_at_s) if job else 0.0
                    health["pending_age_ms"] = round(age * 1000.0, 3)
                    accepted_at = health.get("last_accepted_monotonic_s")
                    health["accepted_evidence_age_ms"] = (
                        round((time.monotonic() - accepted_at) * 1000.0, 3)
                        if accepted_at is not None else None
                    )
                    if age > args.parking_max_result_age_seconds:
                        health["state"] = "degraded"
                        health["last_rejection_reason"] = "worker_over_deadline"
                if parking_event is not None and not parking_event_fallback:
                    overdue = next((camera_id for camera_id, job in parking_futures.items()
                                    if time.monotonic() - job.submitted_at_s
                                    > max(1.0, float(args.parking_max_result_age_seconds))), None)
                    if overdue is not None:
                        parking_failover(f"worker job overdue ({overdue})")
                    elif parking_executor is not None:
                        processes = (getattr(parking_executor._pool, "_processes", None) or {})
                        if any(process.exitcode is not None for process in processes.values()):
                            parking_failover("parking child process exited")

            if profile_enabled:
                profile_parking_ms = (time.perf_counter() - profile_parking_started) * 1000.0
                profile_parking_cpu_ms = (time.thread_time() - profile_parking_cpu_started) * 1000.0
                if profile_parking_ms >= 300.0:
                    print(
                        f"[P35_PARKING_SPIKE] frame={frame_index} parking={profile_parking_ms:.1f}ms "
                        f"main_cpu={profile_parking_cpu_ms:.1f}ms "
                        f"future_done={profile_future_done_ms:.1f}ms "
                        f"future_result={profile_future_result_ms:.1f}ms "
                        f"accept={profile_parking_accept_ms:.1f}ms "
                        f"binder={profile_parking_bind_ms:.1f}ms "
                        f"copy={profile_parking_copy_ms:.1f}ms "
                        f"submit={profile_parking_submit_ms:.1f}ms "
                        f"completed={profile_parking_completed} scheduled={profile_parking_scheduled}",
                        flush=True,
                    )

            # A parked Global ID is a durable slot owner, not an ordinary LOST
            # motion track. Detach its old local fragment before association so
            # another moving car cannot inherit that local/GID pair.
            sync_parking_identity_reservations(
                binders,
                manager,
                trackers,
                frame_index,
            )

            if profile_enabled:
                profile_motion_started = time.perf_counter()
            # Compute all recovery regions on the identity-owning thread.
            # Both tracker workers then operate exclusively on their own cam.
            priority_regions = {
                camera_id: build_recovery_priority_regions(
                    camera_id, binders, transforms, camera_timestamps_s
                )
                for camera_id in trackers
            }
            motion_futures = {
                camera_id: motion_executor.submit(
                    tracker.process_frame,
                    frames[camera_id],
                    timestamp_s=camera_timestamps_s[camera_id],
                    priority_regions=priority_regions[camera_id],
                    prepared_motion=prepared_motion.get(camera_id),
                    source_frame_idx=(
                        replay_timing.frame_idx if replay_timing is not None
                        else capture_sequences[camera_id]
                    ),
                )
                for camera_id, tracker in trackers.items()
                if not (args.replay_drop_readahead and prepared_motion)
            }
            # Join both cameras before sending loss/expiry to the manager.
            motion_results = {
                camera_id: future.result()
                for camera_id, future in motion_futures.items()
            }
            if args.replay_drop_readahead and prepared_motion:
                for camera_id, tracker in trackers.items():
                    tracker.frame_index += 1
                    tracker.blobs = prepared_motion[camera_id]
                    motion_results[camera_id] = ({}, None, [])
            if core2_dump is not None or args.identity_kernel in ("core2", "core2l"):
                from techgar.core2.capture import make_blobs
                import math
                core2_t = max(camera_timestamps_s.values())
                if core2_last_t is not None and core2_t <= core2_last_t:
                    core2_t = math.nextafter(core2_last_t, math.inf)
                core2_source_frame = (replay_timing.frame_idx if replay_timing is not None
                                      else frame_index)
                if args.identity_kernel in ("core2", "core2l"):
                    core2_blobs = {index: trackers[camera_id].blobs
                                   for index, camera_id in enumerate(("cam1", "cam2"))}
                else:
                    core2_blobs = {
                        index: make_blobs(core2_captured[camera_id], index, core2_source_frame,
                                          camera_timestamps_s[camera_id], transforms[camera_id])
                        for index, camera_id in enumerate(("cam1", "cam2"))
                    }
                if core2_dump is not None:
                    core2_dump.write_step(core2_t, frame_index, core2_source_frame, core2_blobs)
                if args.identity_kernel in ("core2", "core2l"):
                    manager.set_inputs(core2_blobs, core2_t, core2_source_frame)
                core2_last_t = core2_t
            if parking_event is not None and not parking_event_fallback:
                event_now_s = time.monotonic()
                for camera_id, tracker in trackers.items():
                    parking_event.observe_tracks(
                        camera_id, tracker.all_tracks, frames[camera_id].shape, event_now_s,
                    )
            for camera_id, tracker in trackers.items():
                _, _, expired = motion_results[camera_id]
                for local_id, track in tracker.newly_lost_tracks:
                    lost_global_id = manager.get_global_id(camera_id, local_id)
                    manager.notify_track_lost(
                        camera_id, local_id, track, frame_index,
                        timestamp_s=camera_timestamps_s.get(camera_id),
                    )
                    if lost_global_id is not None and getattr(track, 'observation_kind', '') != 'occluded_prediction':
                        binders[camera_id].notify_track_lost(
                            manager.canonical_global_id(lost_global_id),
                            frame_index,
                            camera_timestamps_s[camera_id],
                        )
                for local_id, track in expired:
                    expiring_global_id = manager.get_global_id(camera_id, local_id)
                    if expiring_global_id is not None:
                        binders[camera_id].notify_track_expired(
                            manager.canonical_global_id(expiring_global_id),
                            frame_index,
                            camera_timestamps_s[camera_id],
                        )
                    manager.notify_track_expired(
                        camera_id, local_id, track.cx, track.cy, track.w, track.h,
                        getattr(track, "appearance", None), frame_index,
                        timestamp_s=camera_timestamps_s.get(camera_id),
                        appearance_tracklet=getattr(track, "appearance_tracklet", None),
                        roi_edge_starved=bool(getattr(track, "roi_edge_starved", False)),
                    )

            # Read/decode and precompute N+1 masks during N's cross/binder/IO.
            # Queue capacity is one future; no future tracker association can
            # run until the main loop has completed all identity updates for N.
            if (motion_pipeline is not None
                    and (not args.max_frames or frame_index < args.max_frames)):
                motion_pipeline.start_next()

            if profile_enabled:
                profile_motion_ms = (time.perf_counter() - profile_motion_started) * 1000.0
                profile_cross_started = time.perf_counter()
            observable = {camera_id: tracker.observable_tracks for camera_id, tracker in trackers.items()}
            manager.sync_occluded_identities({
                manager.canonical_global_id(gid)
                for camera_id, tracker in trackers.items()
                for group in tracker.occlusion_guard.groups.values() if group.active
                for local_id in group.members
                if (gid := manager.get_global_id(camera_id, local_id)) is not None
            })
            for camera_id, tracker in trackers.items():
                manager.register_independent_tracks(camera_id, tracker.occlusion_guard.independent_pairs)
            # Parking-token recovery runs before ordinary ID association. Feed
            # the numeric trails first so it can require three real world-map
            # observations instead of trusting one nearby foreground blob.
            manager.observe_trajectories(
                observable,
                frame_index,
                camera_timestamps_s,
            )
            if args.identity_kernel in ("world", "core2", "core2l"):
                # L1-L5 owns identity and recovery. Legacy predeparture tokens
                # cannot introduce external GIDs or fake world observations.
                protected_local_keys, recovery_diagnostics = set(), []
            else:
                for owner_camera, binder in binders.items():
                    unbound = {}
                    for source_camera, tracks in observable.items():
                        for local_id, track in tracks.items():
                            if manager.get_global_id(source_camera, local_id) is not None:
                                continue
                            try:
                                unbound[(source_camera, int(local_id))] = (
                                    build_recovery_track_payload(
                                        track,
                                        source_camera,
                                        owner_camera,
                                        transforms,
                                        shared_map_anchor=shared_map_anchor,
                                    )
                                )
                            except (
                                cv2.error,
                                KeyError,
                                np.linalg.LinAlgError,
                                ValueError,
                            ):
                                continue
                    binder.prepare_predeparture_tokens(
                        unbound,
                        camera_timestamps_s[owner_camera],
                        camera_id=owner_camera,
                    )
                protected_local_keys, recovery_diagnostics = recover_departing_vehicle_ids(
                    observable,
                    manager,
                    binders,
                    transforms,
                    frame_index,
                    camera_timestamps_s,
                    args.slot_recovery_max_expand_ratio,
                    shared_map_anchor=shared_map_anchor,
                )
            pending_arrival_global_ids = {
                int(global_id)
                for binder in binders.values()
                for global_id in binder.pending_arrival_global_ids()
            }
            global_ids = manager.update_all_tracks(
                observable, frame_index,
                camera_timestamps_s=camera_timestamps_s,
                protected_local_keys=protected_local_keys,
                protected_global_ids=pending_arrival_global_ids,
            )
            if args.identity_kernel in ("core2", "core2l"):
                for notification, gid in manager.take_binder_notifications():
                    for camera_id, binder in binders.items():
                        callback = binder.notify_track_lost if notification == "lost" else binder.notify_track_expired
                        callback(gid, frame_index, camera_timestamps_s[camera_id])
            # P26 (lead duyet, huong b): xe dung yen tuyet doi du lau duoc giu
            # identity qua `_parked_reservations`, de cua so 12 s cua xe dang
            # chay khong don no (V049: identity #1 bi don o ~f670 => mat GID).
            manager.register_stationary_reservations(observable, frame_index)

            cancel_observed_recovery_tokens(
                global_ids,
                binders,
                manager,
                camera_timestamps_s,
            )

            for camera_id, binder in binders.items():
                binder.remap_vehicle_ids(manager.canonical_global_id)
                global_tracks = collect_binder_global_tracks(
                    camera_id,
                    trackers[camera_id],
                    manager,
                )
                binder.update_tracks(
                    global_tracks,
                    frame_index,
                    camera_timestamps_s[camera_id],
                    camera_id=camera_id,
                )
                binder.finalize_arrivals(frame_index, camera_timestamps_s[camera_id])
                if parking_event is not None and not parking_event_fallback:
                    parking_event.observe_binder(camera_id, binder.events, time.monotonic())

            parked_reservations = sync_parking_identity_reservations(
                binders,
                manager,
                trackers,
                frame_index,
            )
            if profile_enabled:
                profile_cross_ms = (time.perf_counter() - profile_cross_started) * 1000.0

            confirmed = {camera_id: trackers[camera_id].confirmed_tracks for camera_id in trackers}
            registry = manager.to_json(confirmed)
            if now - last_json_at >= 1.0 / max(args.json_fps, 0.01):
                if profile_enabled:
                    profile_json_started = time.perf_counter()
                timestamp = (
                    replay_timing.wall_time_iso
                    if replay is not None and replay_timing.wall_time_iso
                    else datetime.now().astimezone().isoformat(timespec="milliseconds")
                )
                parking_by_camera = {}
                for camera_id in frames:
                    camera_parking = binders[camera_id].to_json(camera_id=camera_id)
                    parking_by_camera[camera_id] = camera_parking
                status_writer.submit_status(runtime_status_files(
                    output_dir, timestamp, frame_index, parking_by_camera,
                    registry, recovery_diagnostics, calibration_path,
                ))
                if runtime_publisher is not None:
                    cam1_ns = capture_timestamps_ns.get("cam1", 0)
                    cam2_ns = capture_timestamps_ns.get("cam2", 0)
                    runtime_publisher.publish_snapshot(
                        build_runtime_snapshot(
                            runtime_id=runtime_id,
                            timestamp=timestamp,
                            published_at=datetime.now().astimezone().isoformat(timespec="milliseconds"),
                            frame_index=frame_index,
                            registry=registry,
                            parking_by_camera=parking_by_camera,
                            camera_sizes=sizes,
                            camera_timestamps_ns=capture_timestamps_ns,
                            calibration=calibration_payload,
                            camera_skew_ms=abs(cam1_ns - cam2_ns) / 1_000_000.0,
                            source_mode="live" if (getattr(args, "live_mode", False) or replay is None) else "replay",
                            applied_monotonic_ns=max(capture_timestamps_ns.values()) if replay is not None else time.monotonic_ns(),
                            parking_episodes=[
                                episode
                                for binder in binders.values()
                                for episode in binder.parking_episodes()
                            ],
                            pending_parking_confirmations=[
                                claim
                                for binder in binders.values()
                                for claim in binder.pending_arrivals()
                            ],
                            parking_pipeline=parking_pipeline,
                        )
                    )
                last_json_at = now
                if profile_enabled:
                    profile_json_ms = (time.perf_counter() - profile_json_started) * 1000.0
            elif profile_enabled:
                profile_json_ms = 0.0

            if profile_enabled:
                profile_render_started = time.perf_counter()
            tracking_frames = {}
            debug_frames = {}
            stream_needed = {
                camera_id: runtime_publisher is not None and
                getattr(runtime_publisher, "needs_frame", lambda _camera: True)(camera_id)
                for camera_id in ("cam1", "cam2")
            }
            needs_rendered_frames = (
                not args.no_display
                or any(dw is not None for _, dw in writers.values())
                or any(stream_needed.values())
            )
            if needs_rendered_frames and not render_async:
                parked_global_ids = {
                    global_id
                    for binder in binders.values()
                    for global_id in binder.get_all_parked_vehicle_ids()
                }
                for camera_id in ("cam1", "cam2"):
                    cam_needs_debug = (
                        not args.no_display
                        or (camera_id in writers and writers[camera_id][1] is not None)
                        or stream_needed[camera_id]
                    )
                    if not cam_needs_debug:
                        continue
                    moving_tracks, shown_ids = select_moving_tracks(
                        trackers[camera_id].active_tracks,
                        global_ids.get(camera_id, {}),
                        parked_global_ids,
                        manager.canonical_global_id,
                    )
                    interpolated_boxes = []
                    if f3_overlay_enabled:
                        source_idx = (
                            int(replay_timing.frame_idx) if replay_timing is not None
                            else int(capture_sequences[camera_id])
                        )
                        interpolated_boxes, previous_overlay_measurements[camera_id] = (
                            dropped_frame_overlay_boxes(
                                previous_overlay_measurements[camera_id], source_idx,
                                moving_tracks, shown_ids,
                            )
                        )
                    roi_points = None
                    if args.show_tracking_roi:
                        roi_data = tracking_rois.get(camera_id)
                        if roi_data is not None:
                            roi_points = np.asarray(
                                [
                                    (int(point["x"]), int(point["y"]))
                                    for point in roi_data["polygon"]
                                ],
                                dtype=np.int32,
                            )
                    runtime_stream_only = (
                        args.no_display
                        and camera_id not in writers
                        and stream_needed[camera_id]
                    )
                    if runtime_stream_only:
                        trails = (
                            manager.motion_trail_polylines(
                                camera_id, frames[camera_id].shape[:2]
                            )
                            if args.show_motion_trails
                            else []
                        )
                        render_payload = freeze_runtime_render_payload(
                            moving_tracks=moving_tracks,
                            shown_ids=shown_ids,
                            slot_results=slot_results[camera_id],
                            frame_index=frame_index,
                            roi_points=roi_points,
                            trails=trails,
                        )
                        if interpolated_boxes:
                            render_payload["f3_interpolated_boxes"] = tuple(interpolated_boxes)
                        runtime_publisher.publish_frame(
                            camera_id,
                            frames[camera_id],
                            frame_index=frame_index,
                            timestamp=datetime.now().astimezone().isoformat(
                                timespec="milliseconds"
                            ),
                            renderer=(
                                lambda source, payload=render_payload:
                                render_runtime_frame(source, payload)
                            ),
                        )
                        continue
                    debug_input = frames[camera_id].copy()
                    if roi_points is not None:
                            cv2.polylines(
                                debug_input,
                                [roi_points],
                                isClosed=True,
                                color=(0, 255, 255),
                                thickness=2,
                                lineType=cv2.LINE_AA,
                            )
                            cv2.putText(
                                debug_input,
                                "TRACKING ROI",
                                tuple(roi_points[0]),
                                cv2.FONT_HERSHEY_SIMPLEX,
                                0.45,
                                (0, 255, 255),
                                1,
                                cv2.LINE_AA,
                            )
                    if args.show_motion_trails:
                        manager.draw_motion_trails(debug_input, camera_id)
                    debug = trackers[camera_id].draw_tracks(
                        debug_input,
                        moving_tracks,
                        id_overrides=shown_ids,
                        confirmed_color=(255, 0, 0),
                        confirmed_label="moving",
                        point_color=(255, 0, 0),
                    )
                    if interpolated_boxes:
                        # Drawing allocates a copy; the source frame and track
                        # objects used for identity have already been consumed.
                        debug = draw_boxes(
                            debug, interpolated_boxes, color=(0, 180, 255), thickness=1,
                        )
                    cv2.putText(
                        debug,
                        f"Frame: {frame_index}",
                        (10, 30),
                        cv2.FONT_HERSHEY_SIMPLEX,
                        1.0,
                        (0, 255, 255),
                        2,
                    )
                    tracking_frames[camera_id] = debug
                    debug_frames[camera_id] = detectors[camera_id].draw_results(
                        debug, slot_results[camera_id]
                    )
                    if runtime_publisher is not None and stream_needed[camera_id]:
                        runtime_publisher.publish_frame(
                            camera_id,
                            debug_frames[camera_id],
                            frame_index=frame_index,
                            timestamp=(
                                replay_timing.wall_time_iso
                                if replay is not None and replay_timing.wall_time_iso
                                else datetime.now().astimezone().isoformat(timespec="milliseconds")
                            ),
                        )
            stage_render_ms = (time.perf_counter() - profile_render_started) * 1000.0 if perf_stages else 0.0
            recording_actions: list[Callable[[], object]] = []
            snapshot_started = time.perf_counter() if perf_stages else 0.0
            if render_async and (frame_index - 1) % render_every == 0 and (not args.no_display or writers):
                parked = {gid for binder in binders.values() for gid in binder.get_all_parked_vehicle_ids()}
                frozen = {}
                for camera_id in ('cam1', 'cam2'):
                    moving, shown = select_moving_tracks(trackers[camera_id].active_tracks,
                                                        global_ids.get(camera_id, {}), parked,
                                                        manager.canonical_global_id)
                    roi_data = tracking_rois.get(camera_id) if args.show_tracking_roi else None
                    roi_points = (np.asarray([(int(p['x']), int(p['y'])) for p in roi_data['polygon']],
                                             dtype=np.int32) if roi_data is not None else None)
                    trails = (manager.motion_trail_polylines(camera_id, frames[camera_id].shape[:2])
                              if args.show_motion_trails else [])
                    frozen[camera_id] = freeze_runtime_render_payload(moving_tracks=moving, shown_ids=shown,
                        slot_results=slot_results[camera_id], frame_index=frame_index, roi_points=roi_points,
                        trails=trails)
                snapshot = ({'source_frame_idx': replay_timing.frame_idx, 'payloads': frozen} if render_replay_process else
                            {'frames': {c: frames[c].copy() for c in ('cam1','cam2')}, 'payloads': frozen})
                render_target = async_video_process if render_replay_process else async_render_worker
                submit_render = (render_target.submit_nonblocking
                                 if args.replay_drop_readahead and render_replay_process
                                 else render_target.submit)
                if not submit_render(snapshot):
                    raise RuntimeError('async render worker stopped')
            snapshot_submit_ms = (time.perf_counter() - snapshot_started) * 1000.0 if perf_stages else 0.0
            if writers and not render_async:
                for camera_id, (raw_writer, debug_writer) in writers.items():
                    raw_frame = frames[camera_id]
                    debug_frame = debug_frames[camera_id]
                    if raw_writer is not None:
                        recording_actions.append(counted_recording_action(
                            recording_counts,
                            f"raw_{camera_id}",
                            lambda writer=raw_writer, frame=raw_frame: writer.write(frame),
                        ))
                    if debug_video_writer is not None:
                        recording_actions.append(
                            lambda cid=camera_id, wr=debug_writer, f=debug_frame: debug_video_writer.submit(
                                cid, wr, f, recording_counts
                            )
                        )
                    else:
                        recording_actions.append(counted_recording_action(
                            recording_counts,
                            f"debug_{camera_id}",
                            lambda writer=debug_writer, frame=debug_frame: writer.write(frame),
                        ))
            if predictions_file is not None:
                capture_ns = (
                    replay_timing.capture_unix_ns
                    if replay is not None and replay_timing.capture_unix_ns
                    else time.time_ns()
                )
                cam1_ns = capture_timestamps_ns.get("cam1", 0)
                cam2_ns = capture_timestamps_ns.get("cam2", 0)
                camera_skew_ms = abs(cam1_ns - cam2_ns) / 1_000_000.0
                wall_time_iso = (
                    replay_timing.wall_time_iso
                    if replay is not None and replay_timing.wall_time_iso
                    else datetime.now().astimezone().isoformat(timespec="milliseconds")
                )
                timestamp_record = (
                    f"{frame_index},{capture_ns},"
                    f"{wall_time_iso},"
                    f"{cam1_ns},{cam2_ns},{camera_skew_ms:.3f}\n"
                )
                prediction_build_started = time.perf_counter() if perf_stages else 0.0
                prediction_payload = prediction_builder.build_frame(
                    frame_idx=frame_index,
                    capture_unix_ns=capture_ns,
                    wall_time_iso=wall_time_iso,
                    camera_timestamps_ns=capture_timestamps_ns,
                    camera_skew_ms=camera_skew_ms,
                    trackers=trackers,
                    global_ids=global_ids,
                    binders=binders,
                    manager=manager,
                    registry=registry,
                    parking_recovery=recovery_diagnostics,
                    parked_identity_reservations=parked_reservations,
                    omit_observations=(getattr(args, 'perf_optimize', False) and args.identity_kernel == 'core2l'),
                )
                if args.identity_kernel == "world":
                    # L5: held state is a separate prediction, never an input
                    # measurement or an observation with an invented GID.
                    manager.attach_prediction_state(prediction_payload)
                elif args.identity_kernel in ("core2", "core2l"):
                    identity = manager.identity_prediction(frame_index)
                    for key in ("observations", "held_vehicles", "identity_events", "core2"):
                        prediction_payload[key] = identity[key]
                    prediction_payload["source_frame_idx"] = identity["source_frame_idx"]
                # P36/T22: predictions index the PROCESSED frame counter, which
                # under --replay-stride is no longer the source frame. Record the
                # source index too so a run can be mapped back onto ground truth
                # (gt_frames.csv is keyed by source frame). Only added when a
                # stride is in use, so default output is byte-identical.
                if replay_stride > 1 and replay_timing is not None:
                    prediction_payload["source_frame_idx"] = int(
                        replay_timing.frame_idx
                    )
                    prediction_payload["replay_stride"] = int(replay_stride)
                prediction_payload["parking_episodes"] = [
                    episode for binder in binders.values() for episode in binder.parking_episodes()
                ]
                prediction_payload["pending_parking_confirmations"] = [
                    claim for binder in binders.values() for claim in binder.pending_arrivals()
                ]
                prediction_payload["parking_pipeline"] = {
                    camera_id: dict(status)
                    for camera_id, status in parking_pipeline.items()
                }
                prediction_build_ms = (time.perf_counter() - prediction_build_started) * 1000.0 if perf_stages else 0.0
                dropped_debug_count = (
                    debug_video_writer.dropped_count
                    if debug_video_writer is not None
                    else 0
                )
                performance_record = (
                    f"{frame_index},"
                    f"{(time.perf_counter() - started) * 1000.0:.3f},"
                    f"{(time.perf_counter() - frame_ready_at) * 1000.0:.3f},"
                    f"{dropped_debug_count}\n"
                )
                if perf_stages:
                    values = stage_timers.snapshot()
                    state = manager.engine.stats().get('tracks', {})
                    stage_columns = [core2_source_frame, profile_read_ms,
                        profile_parking_accept_ms + profile_parking_bind_ms, profile_parking_ms,
                        profile_motion_ms, values.get('detect_cam1',0), values.get('detect_cam2',0),
                        values.get('decode_cam1',0), values.get('decode_cam2',0),
                        values.get('homography_cam1',0), values.get('homography_cam2',0),
                        values.get('fuse',0), values.get('engine',0), values.get('binder',0),
                        profile_cross_ms, prediction_build_ms, stage_render_ms,
                        sum(len(trackers[c].blobs) for c in ('cam1','cam2')),
                        sum(state.values()), snapshot_submit_ms]
                    # Write-submit is filled immediately before this record is enqueued.
                    stage_prefix = performance_record.rstrip('\n')
                    write_started = time.perf_counter()
                    def write_perf_stages():
                        elapsed = (time.perf_counter()-write_started)*1000
                        ordered = stage_columns[:17] + [elapsed, stage_columns[18], stage_columns[17], stage_columns[19]]
                        if args.replay_drop_readahead:
                            ordered.append((time.perf_counter()-started)*1000)
                        performance_file.write(stage_prefix + ',' + ','.join(str(round(v,6)) for v in ordered) + '\n')
                recording_actions.extend([
                    counted_recording_action(
                        recording_counts,
                        "timestamps",
                        lambda record=timestamp_record: timestamps_file.write(record),
                    ),
                    lambda payload=prediction_payload: status_writer.submit_prediction(
                        predictions_file, payload, recording_counts
                    ),
                    counted_recording_action(
                        recording_counts,
                        "performance",
                        write_perf_stages if perf_stages else lambda record=performance_record: performance_file.write(record),
                    ),
                ])
            if recording_actions:
                recording_interrupted = finish_recording_actions(recording_actions)
                identity_counts = [value for key, value in recording_counts.items()
                                   if not (render_async and (key.startswith('debug_') or key.startswith('raw_')))]
                recorded_frame_count = min(identity_counts or list(recording_counts.values()), default=0)
                if recording_interrupted:
                    recording_write_interrupted = True
                    raise KeyboardInterrupt
            if not args.no_display and not render_async:
                camera_views = {}
                for camera_id in ("cam1", "cam2"):
                    source = tracking_frames[camera_id] if roi_editor.enabled else debug_frames[camera_id]
                    view = cv2.resize(source, (640, 360))
                    if roi_editor.enabled:
                        view = roi_editor.render_camera(camera_id, view, slot_results[camera_id])
                    camera_views[camera_id] = view
                main_view = roi_editor.compose_main_view(camera_views)
                if display_scale != 1.0:
                    target_w = max(160, int(round(main_view.shape[1] * display_scale)))
                    target_h = max(90, int(round(main_view.shape[0] * display_scale)))
                    main_view = cv2.resize(main_view, (target_w, target_h))
                cv2.imshow(MAIN_WINDOW, main_view)
                if not args.no_parking_debug and set(threshold_debug) == {"cam1", "cam2"}:
                    tw = max(120, int(round(480 * display_scale)))
                    th = max(68, int(round(270 * display_scale)))
                    threshold_rows = []
                    for camera_id in ("cam1", "cam2"):
                        raw_view, filtered_view = threshold_debug[camera_id]
                        threshold_rows.append(np.hstack([
                            cv2.resize(raw_view, (tw, th)),
                            cv2.resize(filtered_view, (tw, th)),
                        ]))
                    cv2.imshow(
                        "B/W pixels - raw | filtered (cam1 top, cam2 bottom)",
                        np.vstack(threshold_rows),
                    )
                key = cv2.waitKey(1) & 0xFF
                if key in (ord("s"), ord("S")):
                    if parking_futures:
                        for camera_id, job in parking_futures.items():
                            try:
                                job.future.result()
                            finally:
                                binders[camera_id].finish_vision_job(job.job_id, accepted=False)
                        parking_futures = {}
                    if tuning_panel is not None:
                        tuning_panel.apply()
                        tuning_panel.save()
                    saved_camera_ids = roi_editor.save()
                    for camera_id in saved_camera_ids:
                        old_detector = detectors[camera_id]
                        parameters = detector_parameters(old_detector)
                        detector = ParkingDetector(
                            slot_files[camera_id],
                            smoothing_frames=old_detector.smoothing_frames,
                            use_edge_recheck=False,
                        )
                        apply_detector_parameters(detector, parameters)
                        detectors[camera_id] = detector
                        # Do not replace an explicit tracking ROI with parking
                        # slots when the interactive editor saves slot changes.
                        if camera_id not in tracking_rois:
                            trackers[camera_id].roi_mask = detector.get_global_mask(frames[camera_id].shape)
                        slot_results[camera_id] = detector.detect(
                            frames[camera_id], apply_smoothing=False
                        )
                        binders[camera_id].retain_slot_ids(set(detector.slot_ids))
                        binders[camera_id].update_vision(
                            slot_results[camera_id], frame_index, now, camera_id=camera_id
                        )
                        if not args.no_parking_debug:
                            threshold_debug[camera_id] = detector.build_debug_images(frames[camera_id])
                        print(f"Da luu va ap dung ROI moi cho {camera_id}")
                    if saved_camera_ids and parking_executor is not None:
                        parking_executor.shutdown(wait=True)
                        parking_executor = ParkingProcessPool(
                            slot_files, detectors, affinity_mask=parking_worker_affinity_mask
                        )
                elif key in (ord("q"), ord("Q")):
                    saved_camera_ids = roi_editor.save()
                    if saved_camera_ids:
                        print("Da luu ROI truoc khi thoat: " + ", ".join(sorted(saved_camera_ids)))
                    break
                elif key == 27:
                    break
                else:
                    roi_editor.handle_key(key)
            if profile_enabled:
                profile_values = {
                    "read_pace": profile_read_ms,
                    "parking": profile_parking_ms,
                    "park_cpu": profile_parking_cpu_ms,
                    "park_accept": profile_parking_accept_ms,
                    "park_bind": profile_parking_bind_ms,
                    "park_copy": profile_parking_copy_ms,
                    "park_submit": profile_parking_submit_ms,
                    "future_done": profile_future_done_ms,
                    "future_result": profile_future_result_ms,
                    "parking_debug": profile_debug_ms,
                    "motion": profile_motion_ms,
                    "cross": profile_cross_ms,
                    "json_submit": profile_json_ms,
                    "render": (time.perf_counter() - profile_render_started) * 1000.0,
                    "imshow": profile_imshow_ms[0],
                    "total": (time.perf_counter() - started) * 1000.0,
                }
                for key, value in profile_values.items():
                    profile_totals[key] = profile_totals.get(key, 0.0) + value
                    profile_maximums[key] = max(profile_maximums.get(key, 0.0), value)
                if frame_index % profile_interval == 0:
                    summary = " ".join(
                        f"{key}={profile_totals[key]/profile_interval:.1f}/{profile_maximums[key]:.1f}ms"
                        for key in profile_values
                    )
                    print(f"[P35_PROFILE] frames={frame_index-profile_interval+1}-{frame_index} avg/max {summary} "
                          f"prediction_queue_wait_count={status_writer.prediction_wait_count} "
                          f"prediction_queue_wait_ms={status_writer.prediction_wait_ms:.1f} "
                          f"prediction_queue_peak={status_writer.prediction_queue_peak}/"
                          f"{status_writer._capacity}", flush=True)
                    if use_replay_drop:
                        print(
                            f"[P35_REPLAY_DROP] processed={frame_index} "
                            f"source={replay_timing.frame_idx} dropped={replay_dropped_pairs}",
                            flush=True,
                        )
                    profile_totals.clear()
                    profile_maximums.clear()
            if args.max_frames and frame_index >= args.max_frames:
                break
            if time.perf_counter() - started < 0.001:
                time.sleep(0.001)
        if args.max_frames and frame_index >= args.max_frames:
            status = "completed_max_frames"
        elif replay_completed:
            status = "completed_replay"
        else:
            status = "stopped_by_user"
    except KeyboardInterrupt:
        status = (
            "incomplete_interrupted_frame_write"
            if recording_write_interrupted
            else "stopped_by_user"
        )
    finally:
        if stage_timers is not None:
            stage_timers.close()
        if 'core2_dump' in locals() and core2_dump is not None:
            core2_dump.close()
        if 'parking_event' in locals() and parking_event is not None:
            print(parking_event.summary(time.monotonic()), flush=True)
        if replay is not None and 'replay_dropped_pairs' in locals() and use_replay_drop:
            print(
                f"[P35_REPLAY_DROP_FINAL] processed={frame_index} "
                f"source={replay_timing.frame_idx if replay_timing else 0} "
                f"dropped={replay_dropped_pairs}",
                flush=True,
            )
        # P37/T6c: dong file dump cua world adapter neu dang mo.
        if 'manager' in locals() and hasattr(manager, "close_dump"):
            try:
                manager.close_dump()
            except Exception as exc:  # pragma: no cover - chi la debug
                print(f"Loi dong identity-kernel dump: {exc!r}", flush=True)
        if profile_enabled:
            cv2.imshow = profile_original_imshow
        if parking_executor is not None:
            parking_executor.shutdown(wait=True)
        restore_process_affinity(parking_affinity_restore)
        if motion_pipeline is not None:
            motion_pipeline.close()
        if motion_executor is not None:
            motion_executor.shutdown(wait=True)
        if status_writer is not None:
            try:
                final_files = None
                runtime_locals = locals()
                if frame_index and all(name in runtime_locals for name in (
                    "binders", "trackers", "manager", "recovery_diagnostics"
                )):
                    final_registry = manager.to_json({
                        camera_id: tracker.confirmed_tracks
                        for camera_id, tracker in trackers.items()
                    })
                    final_files = runtime_status_files(
                        output_dir,
                        datetime.now().astimezone().isoformat(timespec="milliseconds"),
                        frame_index,
                        {camera_id: binder.to_json(camera_id=camera_id)
                         for camera_id, binder in binders.items()},
                        final_registry, recovery_diagnostics, calibration_path,
                    )
                status_writer.close(final_files)
            except Exception as exc:
                print(f"Loi flush JSON runtime cuoi: {exc!r}", flush=True)
                status = "failed"
            identity_counts = [value for key, value in recording_counts.items()
                               if not (render_async and (key.startswith('debug_') or key.startswith('raw_')))]
            recorded_frame_count = min(identity_counts or list(recording_counts.values()), default=0)
        if tuning_panel is not None and replay is None:
            tuning_panel.apply()
            tuning_panel.save()
        if replay is not None:
            replay.release()
        else:
            for capture in captures.values():
                capture.release()
        if async_render_worker is not None:
            async_render_worker.close()
            print(f'[ASYNC_RENDER] submitted={async_render_worker.submitted} rendered={async_render_worker.rendered} overwritten={async_render_worker.overwritten}', flush=True)
        if async_video_process is not None:
            video_counts = async_video_process.close()
            recording_counts.update(video_counts)
            if not any(k in recording_counts for k in ('timestamps', 'predictions', 'performance')):
                recorded_frame_count = min(video_counts.values(), default=0)
            print(f'[ASYNC_VIDEO] counts={video_counts} overwritten={async_video_process.dropped}', flush=True)
        if debug_video_writer is not None:
            debug_video_writer.close()
            total_dropped_debug = debug_video_writer.dropped_count
            if total_dropped_debug > 0:
                print(
                    f"[DEBUG_VIDEO] CANH BAO: da bo {total_dropped_debug} frame debug video do hang doi day",
                    flush=True,
                )
                for cid, cnt in debug_video_writer.dropped_by_camera.items():
                    print(f"[DEBUG_VIDEO]   {cid}: {cnt} frames bi bo", flush=True)
            else:
                print(f"[DEBUG_VIDEO] dropped_frames={total_dropped_debug}", flush=True)
        if not render_async:
            for raw_writer, debug_writer in writers.values():
                if raw_writer is not None:
                    raw_writer.release()
                debug_writer.release()
        for output in (timestamps_file, performance_file, predictions_file):
            if output is not None:
                output.close()
        if args.public_id_map and 'manager' in locals() and hasattr(manager, 'engine'):
            manager.engine.write_map(args.public_id_map)
        if session_created:
            check_counts = {
                k: v for k, v in recording_counts.items()
                if not (render_async and (k.startswith('debug_') or k.startswith('raw_')))
                and not (k.startswith("debug_") and debug_video_writer and debug_video_writer.dropped_count > 0)
            }
            recording_counts_consistent = (
                len(set(check_counts.values())) <= 1
                if check_counts
                else True
            )
            if not recording_counts_consistent and status != "failed":
                status = "incomplete_record_count_mismatch"
            configuration_files = {
                name: {
                    "path": str(path),
                    "sha256": file_sha256(path),
                }
                for name, path in {
                    "calibration": calibration_path,
                    "slots_cam1": Path(args.slots_cam1).resolve(),
                    "slots_cam2": Path(args.slots_cam2).resolve(),
                    "mask_cam1": Path(args.mask_cam1).resolve(),
                    "mask_cam2": Path(args.mask_cam2).resolve(),
                    "detector_profile": Path(args.detector_profile).resolve(),
                }.items()
            }
            processing_elapsed_seconds = max(
                0.0, time.monotonic() - processing_started_at
            )
            recorded_frame_count = (
                recording_counts.get("performance", min(check_counts.values(), default=0))
                if check_counts
                else recorded_frame_count
            )
            save_json(session_dir / "session_info.json", {
                "schema_version": 3,
                "status": status,
                "runtime_id": runtime_id,
                "started_at": started_at.isoformat(timespec="milliseconds"),
                "ended_at": datetime.now().astimezone().isoformat(timespec="milliseconds"),
                "processed_frames": recorded_frame_count,
                "record_counts": recording_counts,
                "record_counts_consistent": recording_counts_consistent,
                "debug_video_dropped_frames": debug_video_writer.dropped_count if debug_video_writer is not None else 0,
                "processing_elapsed_seconds": round(processing_elapsed_seconds, 3),
                "processing_fps": round(
                    recorded_frame_count / processing_elapsed_seconds,
                    3,
                ) if processing_elapsed_seconds > 0 else 0.0,
                "camera_ids": ["cam1", "cam2"],
                "calibration": str(calibration_path),
                "configuration_files": configuration_files,
                "configuration_hash": hashlib.sha256(
                    json.dumps(
                        configuration_files,
                        ensure_ascii=False,
                        sort_keys=True,
                    ).encode("utf-8")
                ).hexdigest(),
                "git_commit": git_revision(PROJECT_ROOT),
                "dependency_versions": dependency_versions(),
                "opencv_threads": cv2.getNumThreads(),
                "replay_source": str(replay_session_path) if replay_session_path else None,
                "analysis_only": bool(args.no_session_video),
                "detector_parameters": tuning_panel.snapshot() if tuning_panel is not None else {
                    camera_id: detector_parameters(detector) for camera_id, detector in detectors.items()
                } if "detectors" in locals() else {},
                "tracking_parameters": {
                    "min_visible_count": args.min_visible_count,
                    "lost_track_ttl": args.lost_track_ttl,
                    "motion_min_area": args.motion_min_area,
                    "motion_max_distance": args.motion_max_distance,
                    "motion_min_displacement": args.motion_min_displacement,
                    "motion_threshold": args.motion_threshold,
                    "motion_min_pixels": args.motion_min_pixels,
                    "motion_min_ratio": args.motion_min_ratio,
                    "motion_reacquire_seconds": args.motion_reacquire_seconds,
                    "motion_lost_appearance_threshold": args.motion_lost_appearance_threshold,
                    "motion_merged_area_ratio": args.motion_merged_area_ratio,
                    "motion_max_prediction_age_seconds": args.motion_max_prediction_age_seconds,
                    "motion_prediction_decay_seconds": args.motion_prediction_decay_seconds,
                    "motion_ambiguity_margin": args.motion_ambiguity_margin,
                    "motion_ambiguity_recovery_frames": args.motion_ambiguity_recovery_frames,
                    "motion_max_bbox_width_ratio": args.motion_max_bbox_width_ratio,
                    "motion_max_bbox_height_ratio": args.motion_max_bbox_height_ratio,
                    "motion_max_bbox_area_ratio": args.motion_max_bbox_area_ratio,
                    "motion_join_kernel_size": args.motion_join_kernel_size,
                    "motion_join_iterations": args.motion_join_iterations,
                    "motion_roi_context_px": args.motion_roi_context_px,
                    "tracking_roi_cam1": str(
                        args.tracking_roi_cam1 or args.mask_cam1
                    ),
                    "tracking_roi_cam2": str(
                        args.tracking_roi_cam2 or args.mask_cam2
                    ),
                    "identity_retention_seconds": args.identity_retention_seconds,
                    "identity_retention_moving_seconds": (
                        args.identity_retention_moving_seconds
                    ),
                    "new_identity_min_observations": (
                        args.new_identity_min_observations
                    ),
                    "new_identity_unusual_size_observations": (
                        args.new_identity_unusual_size_observations
                    ),
                    "new_identity_min_displacement_ratio": (
                        args.new_identity_min_displacement_ratio
                    ),
                    "temporal_short_seconds": 0.25,
                    "temporal_long_seconds": 0.80,
                },
                "parking_identity_parameters": {
                    "stable_evidence": not args.legacy_parking_filter,
                    "enter_ratio": args.parking_enter_ratio,
                    "exit_ratio": args.parking_exit_ratio,
                    "occupied_seconds": args.parking_occupied_seconds,
                    "empty_seconds": args.parking_empty_seconds,
                    "policy": "vision_primary",
                    "smoothing_frames": max(1, int(args.parking_smoothing_frames)),
                    "max_live_result_age_seconds": args.parking_max_result_age_seconds,
                    "recovery_retention_seconds": args.slot_recovery_seconds,
                    "recovery_initial_expand_ratio": args.slot_recovery_start_expand_ratio,
                    "recovery_max_expand_ratio": args.slot_recovery_max_expand_ratio,
                    "recovery_expand_seconds": args.slot_recovery_expand_seconds,
                    "recovery_appearance_threshold": args.slot_recovery_appearance_threshold,
                    "recovery_evidence_frames": 3,
                    "arrival_lookback_seconds": arrival_lookback_seconds,
                    "arrival_min_samples": args.slot_arrival_min_samples,
                    "arrival_vision_confirmations": args.slot_arrival_vision_confirmations,
                    "arrival_absence_seconds": args.slot_arrival_absence_seconds,
                    "arrival_lost_commit_delay_seconds": (
                        args.slot_arrival_lost_commit_delay_seconds
                    ),
                    "arrival_processing_grace_seconds": (
                        args.slot_arrival_processing_grace_seconds
                    ),
                },
                "occlusion_features": {
                    "guard": not args.no_occlusion_guard,
                    "watershed": not args.no_watershed,
                    "spatial_appearance": not args.no_spatial_appearance,
                },
                "files": {
                    **({} if args.debug_video_only else {
                        "predictions": "predictions.jsonl.gz" if getattr(args, 'predictions_gzip', False) else "predictions.jsonl",
                        "timestamps": "frame_timestamps.csv",
                    }),
                    "ground_truth_slots": "ground_truth_slots.csv",
                    "ground_truth_events": "ground_truth_events.csv",
                    "ground_truth_identity": "ground_truth_identity.csv",
                    **({
                        **({} if args.debug_video_only else {
                            "raw_cam1": "raw_cam1.mp4",
                            "raw_cam2": "raw_cam2.mp4",
                        }),
                        "debug_cam1": "debug_cam1.mp4",
                        "debug_cam2": "debug_cam2.mp4",
                    } if writers else {}),
                },
            })
        cv2.destroyAllWindows()


if __name__ == "__main__":
    configure_console_utf8()
    run(make_parser().parse_args())
