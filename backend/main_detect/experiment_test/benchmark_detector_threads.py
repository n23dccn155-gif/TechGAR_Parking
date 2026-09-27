"""Read-only CPU-thread benchmark; checks identical detector decisions/masks."""
import argparse
import hashlib
import json
from pathlib import Path
import sys
import time
from concurrent.futures import ThreadPoolExecutor

import cv2
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from two_camera import ParkingDetector, apply_detector_parameters


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--session', required=True, type=Path)
    parser.add_argument('--repeats', type=int, default=3)
    parser.add_argument('--frame', type=int, default=350)
    args = parser.parse_args()
    profile = json.loads((args.session/'session_info.json').read_text(encoding='utf8'))['detector_parameters']
    frames = {}
    for camera in ('cam1', 'cam2'):
        capture = cv2.VideoCapture(str(args.session/f'raw_{camera}.mp4'))
        capture.set(cv2.CAP_PROP_POS_FRAMES, args.frame-1)
        ok, frame = capture.read()
        capture.release()
        if not ok: raise RuntimeError(f'Cannot read {camera}')
        frames[camera] = frame
    original = cv2.getNumThreads()
    try:
        for threads in (1, 2, 4, original):
            cv2.setNumThreads(threads)
            detectors = {}
            for camera in frames:
                detector = ParkingDetector(str(ROOT/f'config/parking_slots_{camera}.json'),
                                           stable_evidence=True, smoothing_frames=1)
                apply_detector_parameters(detector, profile[camera])
                detectors[camera] = detector
            timings, signatures = [], []
            with ThreadPoolExecutor(max_workers=2) as pool:
                for index in range(args.repeats+1):
                    started = time.perf_counter()
                    jobs = [pool.submit(detectors[c].detect, frames[c], apply_smoothing=False) for c in frames]
                    outputs = [job.result() for job in jobs]
                    elapsed = (time.perf_counter()-started)*1000
                    if index == 0: continue
                    timings.append(elapsed)
                    signatures.append(hashlib.sha256(repr([
                        [(r.slot_id, bool(r.occupied), r.evidence) for r in out]
                        for out in outputs]).encode()).hexdigest())
                    signatures[-1] += ':' + hashlib.sha256(b''.join(
                        image.tobytes() for detector in detectors.values()
                        for image in detector.build_debug_images())).hexdigest()
            print(json.dumps(dict(threads=threads, p50_ms=float(np.median(timings)),
                                  p95_ms=float(np.percentile(timings,95)), signatures=signatures)), flush=True)
    finally:
        cv2.setNumThreads(original)


if __name__ == '__main__': main()
