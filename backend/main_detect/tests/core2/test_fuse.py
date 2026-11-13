"""Unit tests for techgar.core2.fuse."""
import pytest
import math
from techgar.core2.types import Blob, Obs
from techgar.core2.config import M2Config
from techgar.core2.fuse import GroundGeometry, Fuser, fuse


def _rect(x1, y1, x2, y2):
    return [{'x': x1, 'y': y1}, {'x': x2, 'y': y1},
            {'x': x2, 'y': y2}, {'x': x1, 'y': y2}]


@pytest.fixture
def sample_geometry():
    calibration = {
        'world': {'unit': 'cm', 'bounds': {'min_x_cm': -100, 'max_x_cm': 100,
                                            'min_y_cm': -100, 'max_y_cm': 100}},
        'camera_transforms': {
            'cam1': [[1, 0, -100], [0, 1, -100], [0, 0, 1]],
            'cam2': [[1, 0, -100], [0, 1, -100], [0, 0, 1]],
        },
        'camera_coverage_world': {
            'cam1': _rect(-100, -100, 20, 100),
            'cam2': _rect(-20, -100, 100, 100),
        },
        'overlap_world_polygon': [[-20, -100], [20, -100], [20, 100], [-20, 100]],
        'parking_slots_world': {'cam1': [{'id': 'S1', 'polygon': [[-8, 35], [-4, 35],
                                                                    [-4, 45], [-8, 45]]}]},
    }
    gates = {'entry_gate': {'p1': {'x': 80, 'y': -5}, 'p2': {'x': 80, 'y': 5},
                            'direction': 'positive'},
             'exit_gate': {'p1': {'x': -80, 'y': -5}, 'p2': {'x': -80, 'y': 5},
                           'direction': 'positive'}}
    return GroundGeometry.from_config(calibration, gates)


def _blob(cam, xy, *, box=None, area=100, clipped=False, support=1.0, desc=None):
    if box is None:
        box = (round(xy[0] + 100) - 2, round(xy[1] + 100) - 2, 4, 2)
    return Blob(cam=cam, frame=10, t=0.4, bbox=box, xy=xy, area_px=area,
                roi_clipped=clipped, roi_support=support, desc=desc)


def test_fuser_class_interface(sample_geometry):
    fuser = Fuser(sample_geometry)
    b0 = _blob(0, (5.0, 10.0))
    obs_list = fuser.step(0.4, 10, {0: [b0]})
    assert len(obs_list) == 1
    assert obs_list[0].cams == (0,)
    assert obs_list[0].xy == (5.0, 10.0)

    # Test alias fuse() method
    obs_list2 = fuser.fuse(0.4, 10, {0: [b0]})
    assert len(obs_list2) == 1


def test_three_blobs_single_vehicle(sample_geometry):
    # 3 fragments along vehicle body: x=0, x=3, x=6 (total span=6 + box_width=4 => 10 <= 11.75)
    b1 = _blob(0, (0.0, 0.0), box=(98, 99, 4, 2), area=100)
    b2 = _blob(0, (3.0, 0.0), box=(101, 99, 4, 2), area=100)
    b3 = _blob(0, (6.0, 0.0), box=(104, 99, 4, 2), area=100)

    obs = fuse(0.4, 10, {0: [b1, b2, b3]}, sample_geometry)
    assert len(obs) == 1
    assert len(obs[0].blobs) == 3
    assert obs[0].xy[0] == pytest.approx(3.0)
    assert obs[0].xy[1] == pytest.approx(0.0)


def test_offset_compensation(sample_geometry):
    # Custom config with offset compensation enabled
    off_cfg = M2Config(
        footprint_span_ratio=1.25,
        cross_camera_gate_cm=9.0,
        compensate_offset=True,
        cam_offset_x=(1.5, -2.0),
        cam_offset_y=(0.5, -1.0),
    )
    b0 = _blob(0, (10.0, 20.0))
    obs = fuse(0.4, 10, {0: [b0]}, sample_geometry, config=off_cfg)
    assert len(obs) == 1
    # xy should be shifted by (1.5, 0.5)
    assert obs[0].xy == pytest.approx((11.5, 20.5))


def test_desc_preserved(sample_geometry):
    desc = (0.1, 0.5, 0.9)
    b = _blob(0, (0.0, 0.0), desc=desc)
    obs = fuse(0.4, 10, {0: [b]}, sample_geometry)
    assert obs[0].desc == desc
