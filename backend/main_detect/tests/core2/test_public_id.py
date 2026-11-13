import json
from types import SimpleNamespace

import pytest

from techgar.core2.public_id import PublicIdEngine
from techgar.core2.types import Output, State


def output(gid, state):
    return Output(gid=gid, xy=(1, 2), v=(0, 0), state=state,
                  source='measured', bbox_by_cam={0: (1, 2, 3, 4)}, quality=1)


class FakeFacade:
    def __init__(self):
        self.tracks = []
        self.outputs = []
        self.events = []

    def step(self, t, frame, blobs):
        return self.outputs

    def drain_events(self):
        events, self.events = self.events, []
        return events

    def snapshot(self):
        return tuple({'gid': tr.gid, 'state': tr.state, 'bbox_by_cam': {0: (1, 2, 3, 4)},
                      'bbox_times': {0: 1.0}} for tr in self.tracks)

    def live_gids(self):
        return frozenset(tr.gid for tr in self.tracks)

    def stats(self):
        return {'live_gids': len(self.tracks)}


def track(gid, state):
    return SimpleNamespace(gid=gid, state=state, bbox_by_cam={0: ((1, 2, 3, 4), 1.0)},
                           last_meas_xy=(1, 2), v=(0, 0), last_meas_t=1.0)


def test_initial_and_entry_ids_adoption_events_and_no_mutation(tmp_path):
    raw = FakeFacade()
    raw.tracks = [track(1, State.STOPPED), track(2, State.MOVING), track(3, State.STOPPED)]
    raw.outputs = [output(tr.gid, tr.state) for tr in raw.tracks]
    raw.events = [dict(type='gid_created', gid=tr.gid, state=tr.state.name) for tr in raw.tracks]
    raw.events += [dict(type='s7_handover', gid_donor=2, donor_gid=1, tid_tentative=4)]
    facade = PublicIdEngine(raw, strict=True)
    translated = facade.step(1, 1, {})
    assert [x.gid for x in translated] == [1001, 1, 1002]
    assert [x.gid for x in raw.outputs] == [1, 2, 3]
    assert [x.gid for x in facade.tracks] == [1001, 1, 1002]
    assert facade.live_gids() == {1001, 1, 1002}
    assert [x['gid'] for x in facade.snapshot()] == [1001, 1, 1002]
    events = facade.drain_events()
    assert [x['gid'] for x in events[:3]] == [1001, 1, 1002]
    assert events[-1]['gid_donor'] == 1 and events[-1]['donor_gid'] == 1001
    assert events[-1]['tid_tentative'] == 4
    raw.events = [{'type': 'gid_adopted', 'gid': 1}]
    raw.tracks[0].state = State.MOVING
    assert facade.step(2, 2, {})[0].gid == 1001
    assert facade.drain_events()[0]['gid'] == 1001
    assert facade.next_gid == 2
    from techgar.core2.adapter import Core2Adapter
    assert Core2Adapter(facade).to_json({})['next_global_id'] == 2
    with pytest.raises(AttributeError):
        _ = facade.unexpected_field
    path = tmp_path / 'map.json'
    facade.write_map(path)
    assert json.loads(path.read_text()) == {'1': 1001, '2': 1, '3': 1002}
    with pytest.raises(FileExistsError):
        facade.write_map(path)


def test_missing_creation_strict_and_runtime_fallback(caplog):
    raw = FakeFacade()
    raw.tracks = [track(9, State.STOPPED)]
    raw.outputs = [output(9, State.STOPPED)]
    with pytest.raises(RuntimeError, match='before gid_created'):
        PublicIdEngine(raw, strict=True).step(1, 1, {})
    facade = PublicIdEngine(raw)
    assert facade.step(1, 1, {})[0].gid == 1001
    assert 'before gid_created' in caplog.text


def test_entry_range_cannot_collide_with_parked_ids():
    facade = PublicIdEngine(FakeFacade(), strict=True)
    facade.next_entry = 1001
    with pytest.raises(RuntimeError, match='exhausted'):
        facade._allocate(1, State.MOVING)


def test_factory_flag_off_keeps_original_facade(monkeypatch):
    from techgar.core2 import adapter_l
    sentinel = object()
    monkeypatch.setattr(adapter_l, 'EngineLEngine', lambda **kw: sentinel)
    monkeypatch.setattr(adapter_l, 'EngineLFacade', lambda engine: engine)
    transforms = {'cam1': object(), 'cam2': object()}
    gates = {'entry_gate': {'p1': {'x': 0, 'y': 0}, 'p2': {'x': 1, 'y': 1}}}
    assert adapter_l.make_engine_l(transforms, gates) is sentinel
    assert isinstance(adapter_l.make_engine_l(transforms, gates, public_id_split=True), PublicIdEngine)


@pytest.mark.parametrize('kernel', ['legacy', 'world', 'core2'])
def test_runtime_rejects_public_id_for_other_kernels(kernel):
    from two_camera import make_parser, run
    args = make_parser().parse_args(['--slots-cam1', 'a', '--slots-cam2', 'b',
        '--calibration', 'c', '--identity-kernel', kernel, '--public-id-split'])
    with pytest.raises(ValueError, match='requires --identity-kernel core2l'):
        run(args)
