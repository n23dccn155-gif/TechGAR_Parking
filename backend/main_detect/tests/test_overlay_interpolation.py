from types import SimpleNamespace

import numpy as np
import pytest

from techgar.overlay_interpolation import draw_boxes, interpolate_box
from two_camera import (
    dropped_frame_overlay_boxes,
    is_interpolated_overlay_enabled,
    make_parser,
    render_runtime_frame,
)


def test_interpolation_and_hold():
    a, b = (0, 10, 20, 30), (10, 20, 40, 50)
    assert interpolate_box(a, 10, b, 14, 12) == (5, 15, 30, 40)
    assert interpolate_box(a, 10, b, 14, 9) == a
    assert interpolate_box(a, 10, b, 14, 15) == b


def test_reject_invalid_inputs():
    with pytest.raises(ValueError):
        interpolate_box((0, 0, 1, 1), 1, (0, 0, 1, 1), 1, 1)
    with pytest.raises(ValueError):
        interpolate_box((0, 0, 1, 1), 0, (0, 0, float('nan'), 1), 1, 0.5)


def test_draw_does_not_modify_input_frame():
    frame = np.zeros((20, 20, 3), dtype=np.uint8)
    output = draw_boxes(frame, [(2, 2, 10, 10)])
    assert not frame.any()
    assert output.any()


def test_f3_switch_defaults_off_and_cli_overrides_env(monkeypatch):
    parser = make_parser()
    required = ["--slots-cam1", "unused1.json", "--slots-cam2", "unused2.json", "--calibration", "unused3.json"]
    monkeypatch.delenv("TECHGAR_F3_OVERLAY", raising=False)
    assert not is_interpolated_overlay_enabled(parser.parse_args(required))
    assert is_interpolated_overlay_enabled(parser.parse_args(required + ["--interpolate-overlay"]))
    monkeypatch.setenv("TECHGAR_F3_OVERLAY", "1")
    assert is_interpolated_overlay_enabled(parser.parse_args(required))
    assert not is_interpolated_overlay_enabled(parser.parse_args(required + ["--no-interpolate-overlay"]))


def _overlay_track(x, invisible=0, observation_kind="detection"):
    return SimpleNamespace(
        bbox=(x, 0, 10, 10),
        consecutive_invisible_count=invisible,
        observation_kind=observation_kind,
    )


def test_f3_interpolates_only_same_observed_track_and_gid():
    _, earlier = dropped_frame_overlay_boxes(None, 10, {7: _overlay_track(0)}, {7: 13})
    boxes, later = dropped_frame_overlay_boxes(earlier, 13, {7: _overlay_track(30)}, {7: 13})
    assert boxes == [(10.0, 0.0, 20.0, 10.0), (20.0, 0.0, 30.0, 10.0)]
    assert dropped_frame_overlay_boxes(earlier, 11, {7: _overlay_track(10)}, {7: 13})[0] == []
    assert dropped_frame_overlay_boxes(earlier, 13, {7: _overlay_track(30)}, {7: 14})[0] == []
    assert dropped_frame_overlay_boxes(earlier, 23, {7: _overlay_track(30)}, {7: 13})[0] == []
    assert dropped_frame_overlay_boxes(earlier, 13, {7: _overlay_track(30, invisible=1)}, {7: 13})[0] == []
    assert dropped_frame_overlay_boxes(earlier, 13, {7: _overlay_track(30, observation_kind="prediction")}, {7: 13})[0] == []
    assert later[0] == 13


def test_f3_renderer_only_draws_on_copy():
    frame = np.zeros((100, 100, 3), dtype=np.uint8)
    base_payload = {"frame_index": 13, "tracks": [], "slots": []}
    without_overlay = render_runtime_frame(frame.copy(), base_payload)
    with_overlay = render_runtime_frame(
        frame,
        {**base_payload, "f3_interpolated_boxes": [(15, 70, 25, 90)]},
    )
    assert not frame.any()
    assert not np.array_equal(with_overlay, without_overlay)
    assert with_overlay[70:91, 15:26].any()
