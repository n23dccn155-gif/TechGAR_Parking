#!/usr/bin/env python3
"""run_verify_replays.py — V1 batch replay runner (builder-b, MEGAPLAN verify-replay §V1).

Chạy runtime_server replay cho danh sách session, tối đa 3 tiến trình,
--opencv-threads 1, session NGẮN trước. Ghi log mỗi session + bảng JSON kết quả.

CHỈ tạo output mới prefix verify_cur_* — KHÔNG đè dữ liệu cũ.
Dùng: python run_verify_replays.py            # chạy hết
      python run_verify_replays.py --only session_test1
"""
from __future__ import annotations

import json
import os
import subprocess
import sys
import time
from pathlib import Path

EXPERIMENT = Path(__file__).resolve().parents[1]    # backend/main_detect/experiment_test
ROOT = EXPERIMENT.parent                             # backend/main_detect
OUT = EXPERIMENT / "output"
PY = ROOT / ".venv" / "Scripts" / "python.exe"
RESULTS_JSON = ROOT.parent.parent / ".analysis" / "verify-replay" / "v1-replay-results.json"

# (tên dir nguồn, số cặp frame theo session_info) — ngắn trước
SESSIONS = [
    ("session_test1",       298),
    ("session_hiep_toi4",   620),
    ("session_hiep2",       642),
    ("session_hiep_sang9",  727),
    ("session_hiep_toi5",   806),
    ("session_hiep_sang7",  817),
    ("session_hiep3",       826),
    ("session_hiep_toi6",   865),
    ("session_hiep_sang8",  929),
    ("session_hiep1",      1049),
    ("runtime_session_bt", 1529),
    ("session_thai8",      1952),
    ("session_thai7",      2872),
    ("session_hiep_thai5", 3977),
    ("session_hiep_thai4", 5764),
    ("session_thai6",      5937),
    ("session_hiep_thai3", 5965),
    ("session_hiep_thai1", 6050),
]
MAX_JOBS = 3
API_PORT_BASE = 8100


def command(source: Path, session_dir: Path, runtime_dir: Path, api_port: int):
    """Canonical verify replay = runtime_server --camN-video (LEAD/user preferred).

    prepare_args() resolves --camN-video của recorded session → --replay-session
    (run_two_camera_session.py:119-124) → cùng two_camera.run engine.
    """
    return [
        str(PY), "-u", str(ROOT / "runtime_server.py"),
        "--cam1-video", str(source / "raw_cam1.mp4"),
        "--cam2-video", str(source / "raw_cam2.mp4"),
        "--slots-cam1", "config/parking_slots_cam1.json",
        "--slots-cam2", "config/parking_slots_cam2.json",
        "--calibration", "config/two_camera.shared_cm_01.json",
        "--mask-cam1", "config/roi_mask_cam1.json",
        "--mask-cam2", "config/roi_mask_cam2.json",
        "--session-dir", str(session_dir),
        "--output-dir", str(runtime_dir),
        "--no-session-video", "--no-display", "--opencv-threads", "1",
        "--api-host", "127.0.0.1", "--api-port", str(api_port),
    ]


def source_frames(source: Path) -> int:
    f = source / "frame_timestamps.csv"
    if f.exists():
        with open(f, encoding="utf-8-sig") as fh:
            return max(0, sum(1 for _ in fh) - 1)
    return -1


def session_stats(session_dir: Path):
    r = {"pred_lines": -1, "processed_frames": None, "consistent": None, "status": None}
    p = session_dir / "predictions.jsonl"
    if p.exists():
        r["pred_lines"] = sum(1 for _ in open(p, encoding="utf-8", errors="replace"))
    i = session_dir / "session_info.json"
    if i.exists():
        try:
            d = json.load(open(i, encoding="utf-8"))
            r["processed_frames"] = d.get("processed_frames")
            r["consistent"] = d.get("record_counts_consistent")
            r["status"] = d.get("status")
        except Exception as e:
            r["status"] = f"info-parse-error:{e}"
    return r


def log_warnings(log_path: Path):
    warn, err = 0, 0
    if not log_path.exists():
        return warn, err
    for line in open(log_path, encoding="utf-8", errors="replace"):
        low = line.lower()
        if "traceback" in low or "error" in low:
            err += 1
        elif "warn" in low or "cảnh báo" in low or "canh bao" in low:
            warn += 1
    return warn, err


def main():
    only = set(sys.argv[sys.argv.index("--only") + 1:]) if "--only" in sys.argv else None
    results = {}
    if RESULTS_JSON.exists():
        results = json.load(open(RESULTS_JSON, encoding="utf-8"))

    jobs = []
    for name, frames in SESSIONS:
        if only and name not in only:
            continue
        source = OUT / name
        session_dir = OUT / f"verify_cur_{name}"
        runtime_dir = OUT / f"verify_cur_runtime_{name}"
        log_path = OUT / f"verify_cur_{name}.log"
        if session_dir.exists():
            print(f"SKIP {name} — session-dir đã tồn tại ({session_dir.name})", flush=True)
            continue
        if not source.exists():
            print(f"MISSING {name}", flush=True)
            results[name] = {"error": "missing source"}
            continue
        jobs.append((name, frames, source, session_dir, runtime_dir, log_path))

    running = []
    launched = 0
    results_path = RESULTS_JSON
    results_path.parent.mkdir(parents=True, exist_ok=True)
    while jobs or running:
        while jobs and len(running) < MAX_JOBS:
            name, frames, source, session_dir, runtime_dir, log_path = jobs.pop(0)
            launched += 1
            cmd = command(source, session_dir, runtime_dir, API_PORT_BASE + launched)
            t0 = time.time()
            lf = open(log_path, "w", encoding="utf-8")
            proc = subprocess.Popen(cmd, cwd=ROOT, stdout=lf, stderr=subprocess.STDOUT)
            running.append({"name": name, "frames": frames, "cmd": cmd, "t0": t0,
                            "proc": proc, "lf": lf, "log": log_path,
                            "session_dir": session_dir, "runtime_dir": runtime_dir})
            print(f"START {name} ({frames}f) api={cmd[-1]} pid={proc.pid}", flush=True)
        time.sleep(5)
        for r in list(running):
            rc = r["proc"].poll()
            if rc is None:
                continue
            r["lf"].close()
            running.remove(r)
            stats = session_stats(r["session_dir"])
            w, e = log_warnings(r["log"])
            rec = {
                "cmd": " ".join(r["cmd"]), "exit": rc,
                "elapsed_s": round(time.time() - r["t0"], 1),
                "src_frames": r["frames"], "pred_lines": stats["pred_lines"],
                "processed_frames": stats["processed_frames"],
                "record_consistent": stats["consistent"],
                "status": stats["status"],
                "log_warn_lines": w, "log_error_lines": e,
            }
            results[r["name"]] = rec
            json.dump(results, open(results_path, "w", encoding="utf-8"),
                      ensure_ascii=False, indent=1)
            print(f"FINISH {r['name']} exit={rc} {rec['elapsed_s']}s "
                  f"pred={stats['pred_lines']}/{r['frames']} status={stats['status']} "
                  f"warn={w} err={e}", flush=True)
    print("ALL_DONE", flush=True)
    bad = {k: v for k, v in results.items() if v.get("exit") != 0 or v.get("error")}
    print("FAILURES:", json.dumps(bad, ensure_ascii=False) if bad else "none", flush=True)


if __name__ == "__main__":
    main()
