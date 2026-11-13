"""One low-priority parking detector process for interactive camera streams.

Only one frame may be in flight. The coordinator picks the newest available
frame when the worker becomes free, rather than queuing old frames. Detectors
live in the child so their image caches never cross process boundaries.
"""

from __future__ import annotations

import ctypes
import multiprocessing
import os
import time
from concurrent.futures import Future, ProcessPoolExecutor
from typing import Any

import cv2
import numpy as np

from .parking_detector import ParkingDetector, SlotResult


_WORKER_DETECTORS: dict[str, ParkingDetector] = {}


def _set_windows_affinity(mask: int) -> bool:
    """Pin this process to the supplied CPUs; fail open on unsupported hosts."""
    if os.name != "nt" or not mask:
        return False
    try:
        kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)
        kernel32.GetCurrentProcess.restype = ctypes.c_void_p
        kernel32.SetProcessAffinityMask.argtypes = (ctypes.c_void_p, ctypes.c_size_t)
        kernel32.SetProcessAffinityMask.restype = ctypes.c_int
        return bool(kernel32.SetProcessAffinityMask(kernel32.GetCurrentProcess(), mask))
    except (AttributeError, OSError, ValueError):
        return False


def split_live_parking_affinity() -> tuple[int, int] | None:
    """Main uses first half of its available CPUs; child gets the other half.

    Return (child_mask, original_main_mask) for later restoration. Preserve
    existing affinity restrictions and skip small/unsupported CPU sets.
    """
    if os.name != "nt":
        return None
    try:
        kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)
        kernel32.GetCurrentProcess.restype = ctypes.c_void_p
        kernel32.GetProcessAffinityMask.argtypes = (
            ctypes.c_void_p, ctypes.POINTER(ctypes.c_size_t), ctypes.POINTER(ctypes.c_size_t)
        )
        kernel32.GetProcessAffinityMask.restype = ctypes.c_int
        current = ctypes.c_size_t()
        system = ctypes.c_size_t()
        if not kernel32.GetProcessAffinityMask(kernel32.GetCurrentProcess(),
                                               ctypes.byref(current), ctypes.byref(system)):
            return None
        cores = [1 << bit for bit in range(ctypes.sizeof(ctypes.c_size_t) * 8)
                 if current.value & (1 << bit)]
        if len(cores) < 4:
            return None
        split = len(cores) // 2
        main_mask = sum(cores[:split])
        child_mask = sum(cores[split:])
        if not _set_windows_affinity(main_mask):
            return None
        return child_mask, current.value
    except (AttributeError, OSError, ValueError):
        return None


def restore_process_affinity(mask: int | None) -> None:
    if mask is not None and not _set_windows_affinity(mask):
        print("[P38_PARKING] Could not restore main CPU affinity", flush=True)


def _low_priority() -> None:
    """Keep expensive OpenCV work below the UI/identity process priority."""
    try:
        if os.name == "nt":
            kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)
            kernel32.GetCurrentProcess.restype = ctypes.c_void_p
            kernel32.SetPriorityClass.argtypes = (ctypes.c_void_p, ctypes.c_uint32)
            kernel32.SetPriorityClass(kernel32.GetCurrentProcess(), 0x4000)  # BELOW_NORMAL
        else:
            os.nice(5)
    except (AttributeError, OSError, ValueError):
        pass


def _initialize_worker(
    specs: dict[str, tuple[str, dict[str, Any]]], affinity_mask: int | None = None
) -> None:
    _low_priority()
    if affinity_mask is not None and not _set_windows_affinity(affinity_mask):
        print("[P38_PARKING] Child CPU affinity unavailable", flush=True)
    # Spawned Windows children do not inherit the parent's OpenCV thread limit.
    # A default 16-thread parking detector competes with the motion pipeline.
    # P38/AB2: P38_PARKING_THREADS overrides for A/B measurement; default 2 is
    # the F2a-FIX behaviour, so omitting the variable changes nothing.
    try:
        threads = int(os.environ.get("P38_PARKING_THREADS", "2"))
    except ValueError:
        threads = 2
    cv2.setNumThreads(max(1, threads))
    global _WORKER_DETECTORS
    _WORKER_DETECTORS = {
        camera_id: ParkingDetector(slot_path, **kwargs)
        for camera_id, (slot_path, kwargs) in specs.items()
    }


def _run_parking(
    camera_id: str, frame: np.ndarray, include_debug: bool, parameters: dict[str, Any]
) -> tuple[list, bool, float, tuple | None]:
    # P38/ABC: `P38_PARKING_EMPTY_JOB=1` short-circuits the detector so an A/B
    # measurement can separate "IPC/submit/apply cost" from "detect cost".
    # The child still receives the frame, still returns a result and the
    # coordinator still runs accept_evidence/binder.update_vision. Default off.
    if os.environ.get("P38_PARKING_EMPTY_JOB") == "1":
        import numpy as _np

        detector = _WORKER_DETECTORS[camera_id]
        empty = []
        for row in getattr(detector, "_slot_polygons", []) or []:
            polygon = row.get("polygon") or []
            points = _np.asarray(
                [
                    (int(round(p["x"])), int(round(p["y"])))
                    if isinstance(p, dict)
                    else (int(round(p[0])), int(round(p[1])))
                    for p in polygon
                ],
                dtype=_np.int32,
            )
            empty.append(
                SlotResult(
                    slot_id=str(row["id"]),
                    occupied=False,
                    polygon=points,
                    center=(int(points[:, 0].mean()), int(points[:, 1].mean()))
                    if len(points)
                    else (0, 0),
                    vehicle_id=None,
                    evidence={"empty_job_probe": True},
                )
            )
        return empty, False, time.monotonic(), None

    detector = _WORKER_DETECTORS[camera_id]
    # Interactive tuning changes are mirrored on every job. Geometry caches
    # are rebuilt by configure_roi_filter only when the mask settings change.
    for name in ("base_gamma", "base_clahe", "clahe_grid", "ratio_thr", "edge_thr"):
        setattr(detector, name, parameters[name])
    detector.configure_roi_filter(parameters)
    detector.use_edge_recheck = False

    started = time.perf_counter() if os.environ.get("TECHGAR_PROFILE") == "1" else None
    results = detector.detect(frame, apply_smoothing=not detector.stable_evidence)
    if started is not None and time.perf_counter() - started >= 0.3:
        print(f"[P38_PARKING_PROCESS] wall={(time.perf_counter() - started) * 1000:.1f}ms", flush=True)
    # Preserve the raw cache by reference to the same SlotResult objects.
    # accept_evidence mutates these objects in the coordinator before drawing.
    debug_cache = detector._debug_cache if include_debug else None
    return results, include_debug, time.monotonic(), debug_cache


def _detector_spec(detector: ParkingDetector) -> dict[str, Any]:
    return {
        "smoothing_frames": detector.smoothing_frames,
        "use_edge_recheck": False,
        "core_scale": detector.core_scale,
        "stable_evidence": detector.stable_evidence,
        "selective_line_filter": detector.selective_line_filter,
        "static_color_rescue": detector.static_color_rescue,
        "exit_ratio_thr": detector.exit_ratio_thr,
        "occupied_seconds": detector.occupied_seconds,
        "empty_seconds": detector.empty_seconds,
        "legacy_border_filter": detector.legacy_border_filter,
    }


class ParkingProcessPool:
    """Single-child executor. Caller must never submit a second pending job."""

    def __init__(
        self, slot_files: dict[str, str], detectors: dict[str, ParkingDetector],
        affinity_mask: int | None = None,
    ):
        specs = {
            camera_id: (str(slot_files[camera_id]), _detector_spec(detector))
            for camera_id, detector in detectors.items()
        }
        # spawn also on POSIX, matching the Windows runtime and avoiding a
        # fork of a process that already has OpenCV / writer threads.
        self._pool = ProcessPoolExecutor(
            max_workers=1,
            mp_context=multiprocessing.get_context("spawn"),
            initializer=_initialize_worker,
            initargs=(specs, affinity_mask),
        )

    def submit(
        self, camera_id: str, frame: np.ndarray, include_debug: bool,
        parameters: dict[str, Any],
    ) -> Future:
        return self._pool.submit(_run_parking, camera_id, frame, include_debug, parameters)

    def shutdown(self, *, wait: bool = True) -> None:
        self._pool.shutdown(wait=wait, cancel_futures=True)
