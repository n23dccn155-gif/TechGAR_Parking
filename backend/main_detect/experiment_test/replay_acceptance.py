"""Batch-replay recorded sessions through the REAL ``two_camera`` pipeline.

For every record session named with ``--sessions`` (a directory under
``experiment_test/output`` containing ``raw_cam1.mp4``) this script launches
the canonical replay command used by ``replay_continuation_suite.py`` into a
fresh ``<output-root>/<TAG>_<name>`` session directory, with runtime files in
``<output-root>/<TAG>_runtime_<name>`` and the replay's stdout/stderr in
``<output-root>/<TAG>_<name>.log``.  Up to ``--jobs`` replays run concurrently
while ``START`` / ``RUNNING`` / ``FINISH`` lines are streamed to stdout.

After the replays the script:

1. Validates every new session with ``validate_session.py``.
2. Runs the ``diagnose_identity_churn.py`` metrics (GID census, local
   fragments, split-identity frame count, event-type census) on every
   replayed ``predictions.jsonl``.
3. Prints before -> after deltas against a baseline per session.  Each
   ``--baseline-dir`` (repeatable) is matched to a session by name (exact,
   then name-contained, then positional when the counts line up).  With no
   ``--baseline-dir`` the recorded source session itself is the baseline.
4. Prints a per-session verdict table and writes
   ``<output-root>/<TAG>_acceptance.md``.

Exit status is 0 only when every replay exited 0 AND every replayed session
passed ``validate_session.py`` and could be analysed.

Usage:
    python experiment_test/replay_acceptance.py --tag mytag --sessions NAME [NAME ...]
    python experiment_test/replay_acceptance.py --tag mytag \
        --sessions droidcam_shared_bt droidcam_shared_hiep2 --jobs 3 \
        --baseline-dir experiment_test/output/ref_droidcam_shared_bt
    python experiment_test/replay_acceptance.py --tag calprobe_001 \
        --sessions droidcam_shared_hiep2 \
        --calibration-root experiment_test/recovered_cal \
        --extra-replay-args '["--min-visible-count","2"]'

With ``--calibration-root`` each session NAME is replayed with
``--calibration <root>/<name>/calibration.json`` instead of the shared
config; the run errors early when a session's file is missing.

Replayed sessions contain no session video (``--no-session-video``); use
``render_gid_frames.py --source-video-dir <record dir>`` to inspect frames.
"""

from __future__ import annotations

import argparse
import collections
from dataclasses import dataclass
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import time
from typing import Dict, List, Optional, Sequence, Tuple

ROOT = Path(__file__).resolve().parents[1]
TEST_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(TEST_DIR))

import diagnose_identity_churn as churn  # noqa: E402

REPLAY_PROGRESS_EVERY_S = 30.0
SOURCE_REQUIRED = ("raw_cam1.mp4", "raw_cam2.mp4", "frame_timestamps.csv")
DORMANT_RECOVERY_EVENTS = (
    "dormant_global_id_recovered",
    "dormant_turnaround_recovered",
)
TABLE_COLUMNS = (
    "session", "gids", "fragments", "split_id_frames",
    "gid_created_events", "dormant_recoveries", "verdict-notes",
)


@dataclass
class ReplayJob:
    """One queued replay: source record dir -> fresh session dir."""

    name: str
    source: Path
    session_dir: Path
    runtime_dir: Path
    log_path: Path
    command: List[str]
    calibration: Optional[Path] = None
    duration_s: float = 0.0


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def code_provenance() -> Dict[str, str]:
    """SHA-256 of pipeline code and config, recorded before replays start."""
    paths = [
        ROOT / "two_camera.py",
        *sorted((ROOT / "src/techgar").glob("*.py")),
        *sorted((ROOT / "config").glob("*.json")),
    ]
    return {str(path.relative_to(ROOT)): digest(path) for path in paths}


def replay_command(
    source: Path, session_dir: Path, runtime_dir: Path,
    calibration: Optional[Path] = None,
    extra_args: Sequence[str] = (),
) -> List[str]:
    """Canonical replay command, identical to replay_continuation_suite.py.

    ``calibration`` swaps the default shared_cm_01 file (used by
    ``--calibration-root`` for per-session recovered calibrations) and
    ``extra_args`` is appended verbatim after the canonical flags.
    """
    return [
        sys.executable, "-u", str(ROOT / "two_camera.py"),
        "--replay-session", str(source),
        "--session-dir", str(session_dir),
        "--output-dir", str(runtime_dir),
        "--slots-cam1", "config/parking_slots_cam1.json",
        "--slots-cam2", "config/parking_slots_cam2.json",
        "--calibration",
        str(calibration) if calibration else "config/two_camera.shared_cm_01.json",
        "--no-session-video", "--no-display", "--opencv-threads", "1",
        *extra_args,
    ]


def run_replays(jobs: List[ReplayJob], max_jobs: int) -> Dict[str, int]:
    """Run replay subprocesses, at most ``max_jobs`` at a time.

    Returns ``{session name: exit code}``.  Stdout/stderr of every replay go
    to its log file; this function only prints scheduler progress.
    """
    pending = collections.deque(jobs)
    running: List[dict] = []
    exit_codes: Dict[str, int] = {}
    try:
        while pending or running:
            while pending and len(running) < max_jobs:
                job = pending.popleft()
                handle = job.log_path.open("x", encoding="utf-8")
                process = subprocess.Popen(
                    job.command, cwd=ROOT,
                    stdout=handle, stderr=subprocess.STDOUT,
                )
                running.append({
                    "job": job, "process": process, "log": handle,
                    "started": time.monotonic(), "noted": 0.0,
                })
                print(f"START {job.name}", flush=True)
            time.sleep(1.0)
            now = time.monotonic()
            for entry in running[:]:
                job: ReplayJob = entry["job"]
                code = entry["process"].poll()
                if code is None:
                    if now - entry["noted"] >= REPLAY_PROGRESS_EVERY_S:
                        elapsed = int(now - entry["started"])
                        print(f"RUNNING {job.name} {elapsed}s", flush=True)
                        entry["noted"] = now
                    continue
                job.duration_s = now - entry["started"]
                entry["log"].close()
                running.remove(entry)
                exit_codes[job.name] = code
                print(f"FINISH {job.name} exit={code}", flush=True)
    except KeyboardInterrupt:
        for entry in running:
            entry["process"].terminate()
        for entry in running:
            try:
                entry["process"].wait(timeout=10)
            except subprocess.TimeoutExpired:
                entry["process"].kill()
            entry["log"].close()
        raise
    return exit_codes


def write_provenance(job: ReplayJob, exit_code: int, provenance: Dict[str, str]) -> None:
    if not job.session_dir.is_dir():
        return
    record = dict(
        source=str(job.source),
        command=job.command,
        exit_code=exit_code,
        source_metadata_available=(job.source / "session_info.json").is_file(),
        code_and_config_sha256_at_start=provenance,
        configuration_provenance=(
            "Current workspace calibration; compare source metadata hashes "
            "before claiming exact reproduction"
        ),
        duration_seconds=round(job.duration_s, 2),
    )
    target = job.session_dir / "replay_provenance.json"
    target.write_text(json.dumps(record, indent=2), encoding="utf-8")


def run_validator(session_dir: Path) -> int:
    """Exit code of validate_session.py (0 = predictions fully validated)."""
    if not session_dir.is_dir():
        print(f"VALIDATE {session_dir.name}: session dir missing", flush=True)
        return 2
    return subprocess.call(
        [sys.executable, str(TEST_DIR / "validate_session.py"),
         "--session", str(session_dir)],
        cwd=ROOT,
    )


def safe_analyse(
    session_dir: Path, body_length_cm: float,
) -> Tuple[Optional[dict], Optional[str]]:
    """churn.analyse() that converts SystemExit/exceptions into a note."""
    try:
        return churn.analyse(session_dir, body_length_cm), None
    except SystemExit as exc:
        return None, str(exc)
    except Exception as exc:  # malformed predictions must not kill the report
        return None, f"{type(exc).__name__}: {exc}"


def pick_baseline(
    name: str, index: int, baseline_dirs: List[Path], session_names: List[str],
) -> Optional[Path]:
    """Match one ``--baseline-dir`` to a session name.

    Exact directory name wins, then a baseline whose name contains the
    session name (e.g. ``ref_droidcam_shared_bt``), then positional pairing
    when the caller passed exactly one baseline per session.
    """
    for candidate in baseline_dirs:
        if candidate.name == name:
            return candidate
    containing = [c for c in baseline_dirs if name in c.name]
    if containing:
        return sorted(containing, key=lambda p: len(p.name))[0]
    if len(baseline_dirs) == len(session_names):
        return baseline_dirs[index]
    return None


def dormant_total(analysis: dict) -> int:
    counts = analysis["event_counts"]
    return sum(counts.get(kind, 0) for kind in DORMANT_RECOVERY_EVENTS)


def delta_notes(candidate: dict, baseline: dict) -> List[str]:
    """Short 'before->after' strings for metrics that changed."""
    pairs = [
        ("gids", baseline["global_ids"], candidate["global_ids"]),
        ("fragments", baseline["fragments"], candidate["fragments"]),
        ("split_id", len(baseline["split_identity_rows"]),
         len(candidate["split_identity_rows"])),
        ("gid_created", baseline["event_counts"].get("global_id_created", 0),
         candidate["event_counts"].get("global_id_created", 0)),
        ("dormant", dormant_total(baseline), dormant_total(candidate)),
    ]
    return [f"{label} {before}->{after}" for label, before, after in pairs
            if before != after]


def build_row(
    name: str,
    replay_code: int,
    validate_code: int,
    analysis: Optional[dict],
    analyse_error: Optional[str],
    baseline: Optional[dict],
) -> Tuple[dict, bool]:
    """One verdict-table row; second return value is the PASS/FAIL bool."""
    row = {column: "-" for column in TABLE_COLUMNS}
    row["session"] = name
    problems: List[str] = []
    warnings: List[str] = []
    if replay_code != 0:
        problems.append(f"replay exit={replay_code}")
    if validate_code != 0:
        problems.append(f"validate exit={validate_code}")
    if analyse_error:
        problems.append(f"analyse failed: {analyse_error}")
    if analysis:
        counts = analysis["event_counts"]
        row["gids"] = analysis["global_ids"]
        row["fragments"] = analysis["fragments"]
        row["split_id_frames"] = len(analysis["split_identity_rows"])
        row["gid_created_events"] = counts.get("global_id_created", 0)
        row["dormant_recoveries"] = dormant_total(analysis)
        if row["split_id_frames"]:
            warnings.append(f"{row['split_id_frames']} split-id frames")
        if baseline:
            warnings.extend(delta_notes(analysis, baseline))
    passed = not problems
    verdict = "PASS" if passed else "FAIL"
    notes = problems + warnings
    row["verdict-notes"] = verdict + ("; " + "; ".join(notes) if notes else "")
    return row, passed


def print_table(rows: List[dict]) -> None:
    widths = [len(column) for column in TABLE_COLUMNS]
    for row in rows:
        for i, column in enumerate(TABLE_COLUMNS):
            widths[i] = max(widths[i], len(str(row[column])))
    print("  ".join(column.ljust(widths[i]) for i, column in enumerate(TABLE_COLUMNS)))
    print("  ".join("-" * width for width in widths))
    for row in rows:
        print("  ".join(
            str(row[column]).ljust(widths[i])
            for i, column in enumerate(TABLE_COLUMNS)
        ))


def write_markdown(
    path: Path, tag: str, rows: List[dict], jobs: List[ReplayJob],
    baselines: Dict[str, Optional[Path]],
) -> None:
    lines = [
        f"# Replay acceptance report `{tag}`",
        "",
        f"Generated: {time.strftime('%Y-%m-%d %H:%M:%S')}",
        "",
        "| " + " | ".join(TABLE_COLUMNS) + " |",
        "|" + "|".join("---" for _ in TABLE_COLUMNS) + "|",
        *(
            "| " + " | ".join(str(row[column]) for column in TABLE_COLUMNS) + " |"
            for row in rows
        ),
        "",
        "## Replays",
        "",
    ]
    for job in jobs:
        baseline = baselines.get(job.name)
        baseline_text = f"; baseline `{baseline}`" if baseline else ""
        lines.append(
            f"- `{job.name}` -> `{job.session_dir}` "
            f"(log `{job.log_path.name}`, {job.duration_s:.0f}s{baseline_text})"
        )
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def main(argv: Optional[List[str]] = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--tag", required=True)
    parser.add_argument("--sessions", nargs="+", required=True)
    parser.add_argument("--jobs", type=int, default=2,
                        help="max concurrent replays (default 2)")
    parser.add_argument("--output-root", type=Path,
                        default=TEST_DIR / "output",
                        help="where <TAG>_<name> dirs/logs are written "
                             "(default experiment_test/output)")
    parser.add_argument("--source-root", type=Path,
                        default=TEST_DIR / "output",
                        help="where record sessions are read from "
                             "(default experiment_test/output)")
    parser.add_argument("--baseline-dir", type=Path, action="append",
                        default=[], metavar="DIR",
                        help="baseline session dir for before->after deltas; "
                             "repeatable. Default: the record session itself")
    parser.add_argument("--body-length-cm", type=float, default=7.0,
                        help="split-identity distance threshold, world cm "
                             "(default 7.0)")
    parser.add_argument("--calibration-root", type=Path, default=None,
                        help="when set, replay session NAME with "
                             "--calibration <root>/<name>/calibration.json "
                             "(e.g. experiment_test/recovered_cal)")
    parser.add_argument("--extra-replay-args", default=None, metavar="JSON",
                        help="JSON list of extra argv appended verbatim to "
                             "every replay command")
    args = parser.parse_args(argv)

    names = [args.tag, *args.sessions]
    if any(Path(value).name != value or value in {".", ".."} for value in names):
        parser.error("tag and session names must be single directory names")
    if args.jobs < 1:
        parser.error("--jobs must be >= 1")
    source_root = args.source_root.resolve()
    output_root = args.output_root.resolve()

    extra_args: List[str] = []
    if args.extra_replay_args:
        try:
            parsed = json.loads(args.extra_replay_args)
            if not isinstance(parsed, list):
                raise ValueError("not a list")
            extra_args = [str(item) for item in parsed]
        except (ValueError, TypeError) as exc:
            parser.error(f"--extra-replay-args must be a JSON list: {exc}")

    jobs: List[ReplayJob] = []
    for name in args.sessions:
        source = source_root / name
        for filename in SOURCE_REQUIRED:
            if not (source / filename).is_file():
                parser.error(f"Missing {source / filename}")
        calibration = None
        if args.calibration_root is not None:
            calibration = (args.calibration_root / name / "calibration.json").resolve()
            if not calibration.is_file():
                parser.error(f"Missing {calibration}")
        jobs.append(ReplayJob(
            name=name,
            source=source,
            session_dir=output_root / f"{args.tag}_{name}",
            runtime_dir=output_root / f"{args.tag}_runtime_{name}",
            log_path=output_root / f"{args.tag}_{name}.log",
            command=[],  # filled below
            calibration=calibration,
        ))
    for job in jobs:
        job.command = replay_command(
            job.source, job.session_dir, job.runtime_dir,
            calibration=job.calibration, extra_args=extra_args)
    targets = [
        path for job in jobs
        for path in (job.session_dir, job.runtime_dir, job.log_path)
    ]
    if any(path.exists() for path in targets):
        parser.error("An output already exists; choose a new tag")
    output_root.mkdir(parents=True, exist_ok=True)

    for baseline in args.baseline_dir:
        if not (baseline / "predictions.jsonl").is_file():
            parser.error(f"Baseline has no predictions.jsonl: {baseline}")

    provenance = code_provenance()
    exit_codes = run_replays(jobs, args.jobs)
    for job in jobs:
        write_provenance(job, exit_codes[job.name], provenance)

    # Baseline analyses are cached: one dir may serve several sessions and the
    # default baseline (the record source) repeats across the report.
    analysis_cache: Dict[Path, Tuple[Optional[dict], Optional[str]]] = {}

    def analysed(session_dir: Path) -> Tuple[Optional[dict], Optional[str]]:
        key = session_dir.resolve()
        if key not in analysis_cache:
            analysis_cache[key] = safe_analyse(session_dir, args.body_length_cm)
        return analysis_cache[key]

    rows: List[dict] = []
    baselines_used: Dict[str, Optional[Path]] = {}
    all_ok = True
    for index, job in enumerate(jobs):
        validate_code = run_validator(job.session_dir)
        analysis, analyse_error = analysed(job.session_dir)
        if analysis:
            churn.report(analysis, args.body_length_cm)
        baseline_dir = (
            pick_baseline(job.name, index, args.baseline_dir, args.sessions)
            if args.baseline_dir else job.source
        )
        baselines_used[job.name] = baseline_dir
        baseline_analysis = None
        if baseline_dir and baseline_dir.resolve() != job.session_dir.resolve():
            baseline_analysis, baseline_error = analysed(baseline_dir)
            if baseline_error:
                print(f"baseline {baseline_dir}: {baseline_error}", flush=True)
                baseline_analysis = None
        if analysis and baseline_analysis:
            churn.compare(baseline_analysis, analysis, args.body_length_cm)
        row, passed = build_row(
            job.name, exit_codes[job.name], validate_code,
            analysis, analyse_error, baseline_analysis,
        )
        rows.append(row)
        all_ok = all_ok and passed

    print("\n=== verdict ===")
    print_table(rows)
    report_path = output_root / f"{args.tag}_acceptance.md"
    write_markdown(report_path, args.tag, rows, jobs, baselines_used)
    print(f"wrote {report_path}")
    return 0 if all_ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
