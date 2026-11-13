"""Replay an M1L Blob dump with Engine L and the core2 prediction adapter."""
from __future__ import annotations
import argparse
import json
from pathlib import Path
import sys

import cv2

BACK = Path(__file__).resolve().parent
sys.path.insert(0, str(BACK / 'src'))
from core2_replay import replay
from techgar.core2.adapter_l import make_engine_l
from techgar.core2.dump import read_dump
from two_camera import load_calibration, adapt_calibration_to_frame_sizes


def replay_l(dump, output, run_dir=None, public_id_split=False, public_id_map=None):
    if public_id_map and not public_id_split:
        raise ValueError('--public-id-map requires --public-id-split')
    if public_id_map and Path(public_id_map).exists():
        raise FileExistsError(public_id_map)
    header, steps = read_dump(dump)
    next(steps, None)
    steps.close()
    if header.get('provenance') not in ('core2_m1l', 'core2_m1l_pure', 'm1l_val'):
        # Other M1L dump producers may identify their provenance differently;
        # callers must opt in by explicitly naming the run directory.
        if run_dir is None:
            raise ValueError('unknown M1L provenance; pass --run explicitly after verifying dump')
    run = Path(run_dir or header['video'])
    cfg = run / 'techgar_config'
    calibration_path = cfg / 'calibration.json'
    calibration = json.loads(calibration_path.read_text(encoding='utf8'))
    gates = json.loads((cfg / 'gate_zones.json').read_text(encoding='utf8'))
    transforms, _, _, _ = load_calibration(calibration_path)
    sizes = {}
    for name in ('cam1', 'cam2'):
        capture = cv2.VideoCapture(str(run / f'raw_{name}.mp4'))
        try:
            if not capture.isOpened(): raise RuntimeError(f'cannot open {name} video metadata')
            sizes[name] = (int(capture.get(cv2.CAP_PROP_FRAME_WIDTH)),
                           int(capture.get(cv2.CAP_PROP_FRAME_HEIGHT)))
        finally:
            capture.release()
        if min(sizes[name]) <= 0: raise ValueError(f'invalid video dimensions for {name}')
    transforms = adapt_calibration_to_frame_sizes(calibration, transforms, sizes)
    engine = make_engine_l(transforms, gates, frame_sizes=sizes,
                           **({'public_id_split': True} if public_id_split else {}))
    result = replay(dump, output, engine=engine)
    if public_id_map:
        engine.write_map(public_id_map)
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('dump'); parser.add_argument('--output', required=True)
    parser.add_argument('--run', help='explicit VAL run directory for verified external dumps')
    parser.add_argument('--public-id-split', action='store_true')
    parser.add_argument('--public-id-map', help='write internal-to-public mapping to a new JSON file')
    args = parser.parse_args()
    replay_l(args.dump, args.output, args.run, args.public_id_split, args.public_id_map)


if __name__ == '__main__': main()
