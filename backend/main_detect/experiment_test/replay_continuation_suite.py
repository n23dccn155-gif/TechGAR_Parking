"""Replay complete recordings into NEW directories with immutable start provenance.

No ground truth or source files are edited. This validates record consistency,
not physical vehicle accuracy. Run from backend/main_detect.
"""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import time

ROOT = Path(__file__).resolve().parents[1]


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--tag', required=True)
    parser.add_argument('--sessions', nargs='+', default=['droidcam_shared_hiep2', 'droidcam_shared_hiep7',
                                                         'droidcam_shared_hiep8', 'droidcam_shared_live15'])
    args = parser.parse_args()
    if any(Path(value).name != value or value in {'.', '..'} for value in [args.tag, *args.sessions]):
        parser.error('tag and session names must be single directory names')
    output_root = ROOT/'experiment_test/output'
    targets = [output_root/f'{args.tag}_{name}' for name in args.sessions]
    if any(path.exists() for path in targets):
        parser.error('An output already exists; choose a new tag')
    for name, target in zip(args.sessions, targets):
        source = output_root/name
        for filename in ('raw_cam1.mp4', 'raw_cam2.mp4', 'frame_timestamps.csv'):
            if not (source/filename).is_file(): parser.error(f'Missing {source/filename}')
        provenance = {str(p.relative_to(ROOT)):digest(p) for p in [
            ROOT/'two_camera.py', *sorted((ROOT/'src/techgar').glob('*.py')),
            *sorted((ROOT/'config').glob('*.json'))]}
        command = [sys.executable, '-u', str(ROOT/'two_camera.py'),
                   '--replay-session', str(source), '--session-dir', str(target),
                   '--output-dir', str(output_root/f'{args.tag}_runtime_{name}'),
                   '--slots-cam1', 'config/parking_slots_cam1.json',
                   '--slots-cam2', 'config/parking_slots_cam2.json',
                   '--calibration', 'config/two_camera.shared_cm_01.json',
                   '--no-session-video', '--no-display', '--opencv-threads', '1']
        log_path = output_root/f'{args.tag}_{name}.log'
        print(f'START {name}', flush=True)
        started = time.monotonic()
        with log_path.open('x', encoding='utf8') as log:
            process = subprocess.Popen(command, cwd=ROOT, stdout=log, stderr=subprocess.STDOUT)
            try:
                while True:
                    try:
                        code = process.wait(timeout=30)
                        break
                    except subprocess.TimeoutExpired:
                        print(f'RUNNING {name}: {int(time.monotonic()-started)} seconds', flush=True)
            except KeyboardInterrupt:
                process.terminate()
                process.wait(timeout=10)
                raise
        record = dict(source=str(source), command=command, exit_code=code,
                      source_metadata_available=(source/'session_info.json').is_file(),
                      code_and_config_sha256_at_start=provenance,
                      configuration_provenance='Current workspace calibration; compare source metadata hashes before claiming exact reproduction',
                      duration_seconds=time.monotonic()-started)
        if target.is_dir():
            (target/'replay_provenance.json').write_text(json.dumps(record, indent=2), encoding='utf8')
        print(f'FINISH {name}: exit={code}', flush=True)
        if code: return code
        code = subprocess.call([sys.executable, str(ROOT/'experiment_test/validate_session.py'), '--session', str(target)], cwd=ROOT)
        if code: return code
    return 0


if __name__ == '__main__': sys.exit(main())
