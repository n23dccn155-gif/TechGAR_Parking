"""Compare raw-source parking evidence without modifying a recorded session.

This reports flicker, NOT accuracy: an occupied/free ground truth must still be
reviewed by a human. Source frame numbers and timestamps are retained verbatim.
"""
import argparse
import csv
import hashlib
import json
from pathlib import Path
import sys
import time

import cv2
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from two_camera import ParkingDetector, apply_detector_parameters


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--session', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--start-frame', type=int, default=2820)
    parser.add_argument('--end-frame', type=int, default=3015)
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=False)
    profile_path = ROOT/'config/two_camera.detector.json'
    profile = json.loads(profile_path.read_text(encoding='utf-8'))
    with (args.session/'frame_timestamps.csv').open(encoding='utf-8-sig') as stream:
        timings = list(csv.DictReader(stream))
    rows, measurements, counts, snapshots = [], {}, {}, {}
    for camera in ('cam1','cam2'):
        slot_path = ROOT/f'config/parking_slots_{camera}.json'
        detectors = {}
        for mode in ('baseline','stable'):
            d = ParkingDetector(str(slot_path), use_edge_recheck=False,
                smoothing_frames=1, stable_evidence=mode=='stable',
                selective_line_filter=mode=='stable')
            apply_detector_parameters(d,profile[camera])
            if mode=='stable':d.ratio_thr=.12
            detectors[mode]=d
            measurements[camera,mode]=[]
        cap=cv2.VideoCapture(str(args.session/f'raw_{camera}.mp4'))
        cap.set(cv2.CAP_PROP_POS_FRAMES,args.start_frame-1)
        last_time=float('-inf');previous={}
        try:
            for f in range(args.start_frame,min(args.end_frame,len(timings))+1):
                ok,frame=cap.read()
                if not ok:raise RuntimeError(f'{camera} missing source frame {f}')
                timestamp=int(timings[f-1][f'{camera}_monotonic_ns'])/1e9
                if timestamp-last_time<.5:continue
                last_time=timestamp
                views=[]
                for mode,d in detectors.items():
                    begin=time.perf_counter();results=d.detect(frame,False)
                    d.accept_evidence(results,timestamp,f)
                    elapsed=(time.perf_counter()-begin)*1000
                    measurements[camera,mode].append(elapsed)
                    for result in results:
                        key=(camera,mode,result.slot_id)
                        if key in previous and previous[key]!=result.occupied:
                            counts[key]=counts.get(key,0)+1
                        previous[key]=result.occupied
                        rows.append(dict(camera_id=camera,mode=mode,frame_idx=f,
                            slot_id=result.slot_id,occupied=result.occupied,
                            **result.evidence))
                    _,filtered=d.build_debug_images()
                    filtered=cv2.resize(filtered,(768,432))
                    cv2.putText(filtered,f'{camera} {mode} SOURCE FRAME {f}',(12,424),
                                cv2.FONT_HERSHEY_SIMPLEX,.6,(0,255,255),1)
                    views.append(filtered)
                if len(snapshots.get(camera,[]))<3:
                    snapshots.setdefault(camera,[]).append(np.hstack(views))
        finally:cap.release()
    for camera,images in snapshots.items():
        cv2.imwrite(str(args.output/f'comparison_{camera}.png'),np.vstack(images))
    with (args.output/'parking_evidence.jsonl').open('w',encoding='utf-8') as stream:
        for row in rows:stream.write(json.dumps(row)+'\n')
    report={
        'source':str(args.session.resolve()),'source_frame_range':[args.start_frame,args.end_frame],
        'source_metadata_available':(args.session/'session_info.json').is_file(),
        'configuration_provenance':'Current workspace profile/ROI; recording configuration unverified',
        'profile':profile,'profile_sha256':hashlib.sha256(profile_path.read_bytes()).hexdigest(),
        'warning':'Transitions include initial confirmation and real changes. Not an accuracy or ID-switch evaluator.',
        'metrics':[{ 'camera':cam,'mode':mode,'samples':len(times),
            'processing_ms_p50':float(np.percentile(times,50)),
            'processing_ms_p95':float(np.percentile(times,95)),
            'slot_transitions':{slot:count for (c,m,slot),count in counts.items() if c==cam and m==mode}}
            for (cam,mode),times in measurements.items()],
    }
    (args.output/'report.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
    print(json.dumps(report['metrics'],indent=2),flush=True)


if __name__=='__main__':main()
