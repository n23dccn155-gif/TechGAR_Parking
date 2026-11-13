"""M2 black-box contract tests, based on SPEC_M2 §6 and G1.

The API follows the SPEC: GroundGeometry.from_config(calibration, gates) and
fuse(t, frame, blobs_by_cam, geometry). Coordinate values are cm and seconds.
"""
from dataclasses import asdict
import json

import pytest

from techgar.core2.types import Blob, Obs


def _rect(x1, y1, x2, y2):
    return [{'x': x1, 'y': y1}, {'x': x2, 'y': y1},
            {'x': x2, 'y': y2}, {'x': x1, 'y': y2}]


@pytest.fixture
def fuse_api():
    # Import only when the test executes: the B1F author owns fuse.py.
    from techgar.core2.fuse import GroundGeometry, fuse
    return GroundGeometry, fuse


@pytest.fixture
def geometry(fuse_api):
    cls, _ = fuse_api
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
    return cls.from_config(calibration, gates)


def _blob(cam, xy, *, box=None, area=100, clipped=False, support=1.0):
    if box is None:
        box = (round(xy[0] + 100) - 2, round(xy[1] + 100) - 2, 4, 2)
    return Blob(cam=cam, frame=25, t=1.0, bbox=box, xy=xy, area_px=area,
                roi_clipped=clipped, roi_support=support, desc=None)


def _run(fuse_api, geometry, buckets):
    _, fuse = fuse_api
    result = fuse(1.0, 25, buckets, geometry)
    assert all(isinstance(obs, Obs) and obs.t == 1.0 for obs in result)
    assert all(0 <= obs.quality <= 1 and obs.sigma_cm > 0 for obs in result)
    return result


def test_same_cam_fragment_merge(fuse_api, geometry):
    first = _blob(0, (0., 2.), box=(98, 100, 4, 2), area=100)
    second = _blob(0, (6.2, 2.), box=(104, 100, 4, 2), area=300)
    observations = _run(fuse_api, geometry, {0: [first, second], 1: []})
    assert len(observations) == 1
    obs = observations[0]
    assert set(obs.blobs) == {first, second} and obs.cams == (0,)
    assert obs.xy == pytest.approx((4.65, 2.0))


def test_same_cam_different_cars_no_merge(fuse_api, geometry):
    # Endpoints are 7 cm apart but the world-projected union is 13 cm long,
    # larger than 1.25 * 9.4 cm. Pixel-to-world is a translation.
    first = _blob(0, (0., 2.), box=(97, 98, 6, 4))
    second = _blob(0, (7., 2.), box=(104, 98, 6, 4))
    observations = _run(fuse_api, geometry, {0: [first, second], 1: []})
    assert len(observations) == 2
    assert {b for obs in observations for b in obs.blobs} == {first, second}


def test_cross_cam_merge_lap_one_to_one(fuse_api, geometry):
    c0 = [_blob(0, (-12., 0.)), _blob(0, (12., 0.))]
    c1 = [_blob(1, (-10.5, 0.)), _blob(1, (14., 0.))]
    observations = _run(fuse_api, geometry, {0: c0, 1: c1})
    assert len(observations) == 2
    assert all(obs.cams == (0, 1) and len(obs.blobs) == 2 for obs in observations)
    assert {b for obs in observations for b in obs.blobs} == set(c0 + c1)
    single = _run(fuse_api, geometry, {0: [c0[0]], 1: []})[0]
    assert all(obs.sigma_cm < single.sigma_cm for obs in observations)


def test_cross_cam_gate_rejection(fuse_api, geometry):
    # Greater than the configured 9 cm simulated-data gate, unlike the
    # obsolete 6 cm proposal; G1 says real-camera calibration is still needed.
    first, second = _blob(0, (-8., 0.)), _blob(1, (8., 0.))
    observations = _run(fuse_api, geometry, {0: [first], 1: [second]})
    assert len(observations) == 2
    assert {obs.cams for obs in observations} == {(0,), (1,)}


def test_ground_coverage_function(geometry):
    assert geometry.coverage((0., 0.)) == 2
    assert geometry.coverage((50., 0.)) == 1
    assert geometry.coverage((150., 0.)) == 0


def test_ground_zones_and_slot_classification(geometry):
    assert geometry.zone((0., 0.)) == 'lot'
    assert geometry.zone((85., 0.)) == 'entry'
    assert geometry.zone((-85., 0.)) == 'exit'
    assert geometry.slot_at((-6., 40.)) == 'S1'
    assert geometry.slot_at((0., 0.)) is None


def test_stateless_determinism(fuse_api, geometry):
    buckets = {0: [_blob(0, (-12., 0.)), _blob(0, (12., 0.))],
               1: [_blob(1, (-10.5, 0.)), _blob(1, (14., 0.))]}
    def serialize():
        return json.dumps([asdict(obs) for obs in _run(fuse_api, geometry, buckets)],
                          sort_keys=True, separators=(',', ':'), allow_nan=False)
    expected = serialize()
    assert all(serialize() == expected for _ in range(100))


def test_empty_and_roi_clipped_input(fuse_api, geometry):
    assert _run(fuse_api, geometry, {0: [], 1: []}) == []
    clean = _blob(0, (0., 0.))
    clipped = _blob(0, (0., 0.), clipped=True, support=.5)
    normal = _run(fuse_api, geometry, {0: [clean], 1: []})[0]
    low_quality = _run(fuse_api, geometry, {0: [clipped], 1: []})[0]
    assert low_quality.quality < normal.quality
    assert low_quality.sigma_cm >= normal.sigma_cm
