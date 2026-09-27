"""Replay a bounded source window through the REAL two_camera pipeline.

New local/GIDs start from scratch. source_frame = output_frame + start - 1.
This is a regression window, not a replacement for a full-session evaluator.
Original videos, timestamps, configuration and ground truth are never changed.
"""
import argparse
from dataclasses import replace
import hashlib
import json
from pathlib import Path
import sys

import cv2

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
import two_camera


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--window-start', type=int, default=3500)
    parser.add_argument('--window-end', type=int, default=3900)
    window, forwarded = parser.parse_known_args()
    args = two_camera.make_parser().parse_args(forwarded)
    if not args.replay_session or not args.session_dir:
        parser.error('--replay-session and a NEW --session-dir are required')
    if window.window_start < 1 or window.window_end < window.window_start:
        parser.error('Invalid source window')
    source = Path(args.replay_session).resolve()
    target = Path(args.session_dir).resolve()
    if target.exists():
        parser.error('Output directory already exists')
    hashes = {}
    for path in [ROOT/'two_camera.py', *sorted((ROOT/'src/techgar').glob('*.py'))]:
        hashes[str(path.relative_to(ROOT))] = hashlib.sha256(path.read_bytes()).hexdigest()
    base = two_camera.ReplaySession

    class WindowReplay(base):
        def __init__(self, session_dir, capture_factory=cv2.VideoCapture):
            super().__init__(session_dir, capture_factory)
            if window.window_end > len(self.timings):
                self.release()
                raise ValueError('Window extends past source timestamps')
            selected = self.timings[window.window_start-1:window.window_end]
            self.timings = [replace(item, frame_idx=i+1) for i,item in enumerate(selected)]
            self._eof_checked = True  # bounded window intentionally ends before physical EOF
            for capture in self.captures.values():
                if not capture.set(cv2.CAP_PROP_POS_FRAMES, window.window_start-1):
                    self.release()
                    raise RuntimeError('Cannot seek source window')

    two_camera.ReplaySession = WindowReplay
    two_camera.configure_console_utf8()
    try:
        two_camera.run(args)
    finally:
        two_camera.ReplaySession = base
        if target.is_dir():
            (target/'source_window.json').write_text(json.dumps({
                'source_session':str(source),
                'source_start_frame':window.window_start,
                'source_end_frame':window.window_end,
                'source_frame_formula':f'output_frame + {window.window_start-1}',
                'source_metadata_available':(source/'session_info.json').is_file(),
                'configuration_provenance':'Current workspace; original recording profile not verified',
                'identity_initialization':'Fresh tracker/manager at window start; IDs are not original session IDs',
                'code_sha256_at_start':hashes,
                'arguments':forwarded,
            },ensure_ascii=False,indent=2),encoding='utf-8')


if __name__=='__main__':main()
