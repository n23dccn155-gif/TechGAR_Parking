"""Replay B0 Blob dumps through Core2Engine into predictions v3 JSONL."""
from __future__ import annotations
import argparse
import json
from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).resolve().parent / "src"))
from techgar.core2.dump import read_dump
from techgar.core2.adapter import CAMERAS, Core2Adapter, ReplayCameraView, make_engine

def replay(dump_path, output_path, *, engine=None, calibration=None, gates=None):
    header, steps = read_dump(dump_path)
    if engine is None:
        if not calibration and not gates and 'engine_inputs' in header:
            engine = make_engine(header['engine_inputs']['calibration'], header['engine_inputs']['gates'])
        else:
            video = Path(header['video'])
            calibration_path = Path(calibration) if calibration else video / 'techgar_config/calibration.json'
            gates_path = Path(gates) if gates else calibration_path.parent / 'gate_zones.json'
            engine = make_engine(json.loads(calibration_path.read_text(encoding='utf8')),
                                 json.loads(gates_path.read_text(encoding='utf8')))
    views = {name: ReplayCameraView(cam) for cam, name in CAMERAS.items()}
    adapter = Core2Adapter(engine, views)
    with open(output_path, "w", encoding="utf-8", newline="\n") as out:
        for step in steps:
            adapter.set_inputs(step['blobs_by_cam'], step['t'], step['source_frame_idx'])
            adapter.update_all_tracks({}, step['frame_idx'])
            payload = adapter.identity_prediction(step['frame_idx'])
            payload["replay_stride"] = header["stride"]
            out.write(json.dumps(payload, sort_keys=True, ensure_ascii=False,
                                 separators=(",", ":"), allow_nan=False) + "\n")

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("dump")
    parser.add_argument("--output", required=True)
    parser.add_argument("--calibration", help="calibration.json (defaults to dump video/techgar_config)")
    parser.add_argument("--gates", help="gate_zones.json (defaults beside calibration)")
    args = parser.parse_args()
    replay(args.dump, args.output, calibration=args.calibration, gates=args.gates)

if __name__ == "__main__":
    main()
