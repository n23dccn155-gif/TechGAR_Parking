from types import SimpleNamespace

import pytest

from techgar.core2.engine_l_facade import EngineLFacade
from techgar.core2.types import State
from techgar.core2.types import Blob
from techgar.core2.engine_l import EngineLEngine
from techgar.core2.adapter import Core2Adapter, ReplayCameraView


def test_facade_exposes_tracks_and_timestamped_boxes():
    vehicle = {'gid':8, 'state':State.MOVING, 'bbox_by_cam':{1:(1,2,3,4)},
               'bbox_times':{1:2.0}, 'last_meas_xy':(3,4), 'v':(1,0), 'last_meas_t':2.0}
    engine = SimpleNamespace(snapshot=lambda: [vehicle], next_gid=9,
                             live_gids=lambda: frozenset({8}), drain_events=lambda: ())
    facade = EngineLFacade(engine)
    assert facade.tracks[0].bbox_by_cam == {1: ((1, 2, 3, 4), 2.0)}
    assert facade.live_gids() == {8}
    assert facade.next_gid == 9
    assert facade.drain_events() == []


def test_facade_reports_changed_private_contract():
    facade = EngineLFacade(SimpleNamespace(tracks=[SimpleNamespace(gid=1)], _next_gid=2))
    with pytest.raises(RuntimeError, match='snapshot interface changed'):
        _ = facade.tracks


def test_real_engine_can_emit_adapter_prediction():
    views = {'cam1': ReplayCameraView(0), 'cam2': ReplayCameraView(1)}
    adapter = Core2Adapter(EngineLFacade(EngineLEngine()), views)
    blob = Blob(0, 1, 1.0, (100, 20, 10, 8), (1.0, 2.0), 80, False, 1.0, None)
    adapter.set_inputs({0: [blob], 1: []}, 1.0, 1)
    adapter.update_all_tracks({}, 1)
    payload = adapter.identity_prediction(1)
    assert payload['source_frame_idx'] == 1
    assert payload['observations'][0]['canonical_gid'] == 1
