"""Controlled engine/API load replay, not a substitute for live browser latency.

Each mode starts from frame one with recorded timestamps and real async vision.
The driver/monitor modes reproduce HTTP polling and JPEG consumers, not React.
Never modifies recordings, configuration, ground truth or live session storage.
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import json
from pathlib import Path
import sys
import threading
import time
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
import two_camera
from runtime_server import RuntimeHTTPServer, RuntimeState


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--session", type=Path, required=True)
    parser.add_argument("--destination", type=Path, required=True)
    parser.add_argument("--mode", choices=("engine", "runtime", "driver", "monitor"), required=True)
    parser.add_argument("--max-frames", type=int, default=0)
    parser.add_argument("--unpaced", action="store_true")
    parser.add_argument("--performance-only-current-config", action="store_true",
                        help="Allow changed geometry for load measurement ONLY, never identity regression")
    options = parser.parse_args()
    source, target = options.session.resolve(), options.destination.resolve()
    runtime_output = target.with_name(target.name + "_runtime")
    if target.exists() or runtime_output.exists():
        parser.error("Destination already exists; choose a NEW directory")
    metadata = json.loads((source / "session_info.json").read_text(encoding="utf-8"))
    provenance = {}
    configuration_mismatches = []
    flags = {"calibration": "--calibration", "slots_cam1": "--slots-cam1",
             "slots_cam2": "--slots-cam2", "mask_cam1": "--mask-cam1",
             "mask_cam2": "--mask-cam2", "detector_profile": "--detector-profile"}
    command = ["--replay-session", str(source), "--session-dir", str(target),
               "--output-dir", str(runtime_output), "--no-display", "--no-session-video",
               "--replay-async-vision", "--max-frames", str(options.max_frames)]
    if not options.unpaced:
        command.append("--replay-realtime")
    for key, flag in flags.items():
        record = metadata["configuration_files"][key]
        path = Path(record["path"])
        digest = hashlib.sha256(path.read_bytes()).hexdigest()
        if digest != record["sha256"]:
            configuration_mismatches.append(key)
            if not options.performance_only_current_config:
                parser.error(f"Source configuration changed: {path}; cannot claim controlled comparison")
        command.extend((flag, str(path)))
        provenance[key] = digest
    engine_parser = two_camera.make_parser()
    args = engine_parser.parse_args(command)
    stop = threading.Event()
    state = RuntimeState() if options.mode != "engine" else None
    server = RuntimeHTTPServer(("127.0.0.1", 0), state) if state else None
    threads = []
    counters = {"requests": 0, "errors": 0, "jpeg_bytes": 0}

    def poll(path: str, interval: float) -> None:
        url = f"http://127.0.0.1:{server.server_address[1]}{path}"
        while not stop.is_set():
            try:
                with urlopen(url, timeout=2) as response:
                    body = response.read()
                counters["requests"] += 1
                if path.endswith(".jpg"):
                    counters["jpeg_bytes"] += len(body)
            except Exception:
                counters["errors"] += 1
            stop.wait(interval)

    if server:
        threads.append(threading.Thread(target=server.serve_forever, daemon=True))
    if options.mode in {"driver", "monitor"}:
        threads.append(threading.Thread(target=poll, args=("/api/runtime/snapshot", .2), daemon=True))
    if options.mode == "monitor":
        threads.append(threading.Thread(target=poll, args=("/api/runtime/snapshot", .2), daemon=True))
        for camera in ("cam1", "cam2"):
            threads.append(threading.Thread(target=poll, args=(f"/api/runtime/cameras/{camera}.jpg", .125), daemon=True))
    for thread in threads:
        thread.start()
    started = time.monotonic()
    try:
        two_camera.run(args, runtime_publisher=state)
    finally:
        stop.set()
        if state:
            state.close()
        if server:
            server.shutdown()
            server.server_close()
        for thread in threads:
            thread.join(timeout=3)
    report = {"mode": options.mode, "source": str(source), "arguments": command,
              "configuration_sha256": provenance, "wall_seconds": time.monotonic()-started,
              "http_load": counters, "frontend_browser_included": False,
              "configuration_mismatches": configuration_mismatches,
              "identity_regression_valid": not configuration_mismatches,
              "paced": not options.unpaced, "vision_worker": "asynchronous"}
    with (target / "performance.csv").open(encoding="utf-8-sig", newline="") as handle:
        samples = [float(row["tracking_pipeline_ms"]) for row in csv.DictReader(handle)]
    import numpy as np
    report["tracking_pipeline_ms"] = {
        "count": len(samples), "p50": float(np.percentile(samples, 50)),
        "p95": float(np.percentile(samples, 95)), "max": max(samples),
    } if samples else {}
    (target / "load_verification.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(report, indent=2), flush=True)


if __name__ == "__main__":
    two_camera.configure_console_utf8()
    main()
