"""New replay rendering controls are opt-in and leave previous defaults intact."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from two_camera import make_parser


def test_replay_process_is_disabled_by_default():
    args = make_parser().parse_args(['--slots-cam1', 'cam1.json', '--slots-cam2', 'cam2.json',
                                     '--calibration', 'calibration.json'])
    assert args.identity_kernel == 'legacy'
    assert not args.render_async
    assert not args.render_replay_process
    assert args.render_every == 1
    assert args.render_preview_scale == 1.0
    assert args.render_video_scale == 1.0
    assert args.render_video_codec == 'mp4v'
    assert not args.perf_stages
