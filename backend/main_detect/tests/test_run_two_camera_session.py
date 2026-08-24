from __future__ import annotations

import pytest

from run_two_camera_session import make_parser, prepare_args
from two_camera import resolve_slot_arrival_lookback_seconds


COMMON = [
    "--slots-cam1", "config/parking_slots_cam1.json",
    "--slots-cam2", "config/parking_slots_cam2.json",
    "--calibration", "config/two_camera.shared_m_01.json",
]


def parse(*source_args: str):
    parser = make_parser()
    return prepare_args(parser, parser.parse_args([*source_args, *COMMON]))


def test_accepts_native_realtime_camera_urls():
    args = parse(
        "--cam1-url", "http://192.168.100.53:4747/video/force/1280x720",
        "--cam2-url", "http://192.168.100.198:4747/video/force/1280x720",
    )

    assert args.cam1_url.endswith("1280x720")
    assert args.cam2_url.endswith("1280x720")
    assert args.cam1_video is None
    assert args.cam2_video is None


def test_keeps_legacy_network_video_arguments_compatible():
    args = parse(
        "--cam1-video", "http://192.168.100.53:4747/video",
        "--cam2-video", "http://192.168.100.198:4747/video",
    )

    assert args.cam1_url == "http://192.168.100.53:4747/video"
    assert args.cam2_url == "http://192.168.100.198:4747/video"


def test_rejects_mixed_source_argument_styles():
    with pytest.raises(SystemExit):
        parse(
            "--cam1-url", "http://192.168.100.53:4747/video",
            "--cam2-url", "http://192.168.100.198:4747/video",
            "--cam1-video", "raw_cam1.mp4",
            "--cam2-video", "raw_cam2.mp4",
        )


def test_rejects_an_incomplete_realtime_pair():
    with pytest.raises(SystemExit):
        parse("--cam1-url", "http://192.168.100.53:4747/video")


def test_default_arrival_lookback_covers_live_parking_latency():
    args = parse(
        "--cam1-url", "http://192.168.100.53:4747/video",
        "--cam2-url", "http://192.168.100.198:4747/video",
    )

    assert args.slot_arrival_lookback_seconds is None
    assert resolve_slot_arrival_lookback_seconds(args) == pytest.approx(3.0)


def test_explicit_arrival_lookback_override_is_preserved():
    args = parse(
        "--cam1-url", "http://192.168.100.53:4747/video",
        "--cam2-url", "http://192.168.100.198:4747/video",
        "--slot-arrival-lookback-seconds", "4.25",
    )

    assert resolve_slot_arrival_lookback_seconds(args) == pytest.approx(4.25)
