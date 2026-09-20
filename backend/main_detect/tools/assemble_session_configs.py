"""Assemble per-session config sets under config/sessions/<session>/.

Each recorded session used its own ROI masks, parking slots and calibration
("era").  session_info.json stores the sha256 of every config file used at
record time.  This tool materializes the best-available file for each slot:

- calibration.json      <- experiment_test/recovered_cal/<session>/ (fitted
                           from the session's own recorded anchor pairs)
- masks / slots         <- git history when the blob hash matches the
                           recorded sha256, else the current config file when
                           its hash still matches, else marked MISSING so the
                           user re-draws from the session's raw video.

Run from backend/main_detect:  .venv/Scripts/python.exe tools/assemble_session_configs.py
"""
import hashlib
import json
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
REPO = ROOT.parent.parent
OUT = ROOT / "experiment_test" / "output"
SESSIONS_DIR = ROOT / "config" / "sessions"
RECOVERED = ROOT / "experiment_test" / "recovered_cal"

CONFIG_FILES = {
    "mask_cam1": "roi_mask_cam1.json",
    "mask_cam2": "roi_mask_cam2.json",
    "slots_cam1": "parking_slots_cam1.json",
    "slots_cam2": "parking_slots_cam2.json",
}

# Era hiep2/hiep7/hiep8 (recorded 2026-09-06) is fully committed: commit
# a75d1d71 carries the exact mask/slots blobs whose sha256 matches the
# recorded hashes.  live14 (2026-09-05) predates config-hash recording but
# sits inside the same unchanged blob range, so it is extracted too but
# flagged "inferred".
GIT_ERA_COMMIT = "a75d1d71"
GIT_ERA_SESSIONS = {"droidcam_shared_hiep2", "droidcam_shared_hiep7",
                    "droidcam_shared_hiep8"}
GIT_INFERRED_SESSIONS = {"droidcam_live14"}


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def git_blob(commit: str, repo_rel: str) -> bytes | None:
    proc = subprocess.run(
        ["git", "-C", str(REPO), "show", f"{commit}:{repo_rel}"],
        capture_output=True,
    )
    return proc.stdout if proc.returncode == 0 else None


def main() -> int:
    sessions = sorted(
        p.name for p in OUT.iterdir()
        if p.is_dir() and (p / "predictions.jsonl").exists()
        and not p.name.startswith(("idfix_", "runtime_", "session_", "calprobe"))
    )
    report = {}
    for session in sessions:
        sdir = SESSIONS_DIR / session
        sdir.mkdir(parents=True, exist_ok=True)
        info_path = OUT / session / "session_info.json"
        recorded = {}
        if info_path.exists():
            info = json.loads(info_path.read_text(encoding="utf-8"))
            recorded = {
                k: (v or {}).get("sha256")
                for k, v in (info.get("configuration_files") or {}).items()
            }
        manifest = {"session": session, "files": {}}

        cal_src = RECOVERED / session / "calibration.json"
        if cal_src.exists():
            shutil.copy2(cal_src, sdir / "calibration.json")
            manifest["files"]["calibration"] = "recovered_cal"
        else:
            manifest["files"]["calibration"] = "MISSING"

        for key, fname in CONFIG_FILES.items():
            want = recorded.get(key)
            dest = sdir / fname
            repo_rel = f"backend/main_detect/config/{fname}"
            placed = None
            if session in GIT_ERA_SESSIONS | GIT_INFERRED_SESSIONS:
                blob = git_blob(GIT_ERA_COMMIT, repo_rel)
                if blob and (want is None
                             or hashlib.sha256(blob).hexdigest() == want):
                    dest.write_bytes(blob)
                    placed = ("git:" + GIT_ERA_COMMIT +
                              ("-inferred" if session in GIT_INFERRED_SESSIONS
                               else ""))
            current = ROOT / "config" / fname
            if placed is None and current.exists() and want is not None \
                    and sha256(current) == want:
                shutil.copy2(current, dest)
                placed = "current-hash-match"
            if placed is None:
                placed = "MISSING-needs-redraw"
            manifest["files"][key] = placed

        (sdir / "MANIFEST.json").write_text(
            json.dumps(manifest, indent=2), encoding="utf-8")
        report[session] = manifest["files"]
        missing = [k for k, v in manifest["files"].items()
                   if v.startswith("MISSING")]
        print(f"{session}: missing={missing or 'none'}")
    print(f"\nWrote {len(report)} session config dirs under {SESSIONS_DIR}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
