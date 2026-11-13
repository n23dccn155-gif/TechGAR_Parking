import importlib.util
import json
from pathlib import Path
from types import SimpleNamespace

from techgar.core2.adapter import CAMERAS, Core2Adapter, ReplayCameraView, make_engine
from techgar.core2.dump import BlobDumpWriter
from techgar.core2.types import Blob, Output, State


class FakeEngine:
    def __init__(self):
        self.tracks = []
        self.events = []
        self.count = 0
        self._next_gid = 4
    def step(self, t, frame, blobs):
        self.count += 1
        source = 'measured' if self.count == 1 else 'held'
        state = State.MOVING if self.count == 1 else State.STOPPED
        self.tracks = [SimpleNamespace(gid=3, state=state, last_meas_xy=(1., 2.),
                                       last_meas_t=1., v=(0., 0.),
                                       bbox_by_cam={0: ((10, 20, 30, 40), 1.0),
                                                    1: ((15, 20, 30, 40), .8)})]
        self.events = [{'type': 'gid_created', 'gid': 3, 't': t}] if self.count == 1 else []
        return [Output(3, (1., 2.), (0., 0.), state, source,
                       {0: (10, 20, 30, 40), 1: (15, 20, 30, 40)}, .9)]
    def live_gids(self): return {3}
    def drain_events(self):
        events, self.events = self.events, []
        return events
    def stats(self): return {'tracks': {'MOVING': 1}}


def test_identity_parity_and_per_camera_freshness(tmp_path):
    spec = importlib.util.spec_from_file_location(
        'core2_replay_m6', Path(__file__).resolve().parents[2] / 'core2_replay.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    path, output = tmp_path/'input.gz', tmp_path/'replay.jsonl'
    blob = Blob(0, 25, 1., (10, 20, 30, 40), (1., 2.), 100, False, 1., None)
    with BlobDumpWriter(path, video='test', stride=1, cameras=CAMERAS, core_version='x') as writer:
        writer.write_step(1., 1, 25, {0: [blob], 1: []})
        writer.write_step(1.2, 2, 26, {0: [], 1: []})
    module.replay(path, output, engine=FakeEngine())
    rows = [json.loads(line) for line in output.read_text(encoding='utf8').splitlines()]
    views = {name: ReplayCameraView(cam) for cam, name in CAMERAS.items()}
    direct = Core2Adapter(FakeEngine(), views)
    direct_rows = []
    for frame, t, blobs in ((1, 1., {0: [blob], 1: []}), (2, 1.2, {0: [], 1: []})):
        direct.set_inputs(blobs, t, 24+frame)
        direct.update_all_tracks({}, frame)
        direct_rows.append(direct.identity_prediction(frame))
    for left, right in zip(rows, direct_rows):
        for key in ('observations', 'held_vehicles', 'identity_events', 'core2', 'source_frame_idx'):
            assert left[key] == right[key]
    assert len(rows[0]['observations']) == 1
    assert rows[0]['observations'][0]['camera_id'] == 'cam1'
    assert 'roi_support_ratio' not in rows[0]['observations'][0]
    assert rows[1]['observations'] == []
    assert rows[1]['held_vehicles'][0]['bbox_age_s_by_cam']['cam2'] > 0


# CHOT CHAN TEST: doi tu run TEST 20261106-130217_sang_5p sang run TRAIN
# 20261106-131804_sang_20p. Test nay chi doc calibration/gate (khong do du lieu),
# nhung van doi de khong con duong dan TEST trong test suite.
def test_engine_geometry_matches_dev_loop():
    root = Path(__file__).resolve().parents[4]
    run = root/'sim3d/data/runs/20261106-131804_sang_20p/techgar_config'
    calibration = json.loads((run/'calibration.json').read_text(encoding='utf8'))
    gates = json.loads((run/'gate_zones.json').read_text(encoding='utf8'))
    engine = make_engine(calibration, gates)
    assert engine.p.slots and engine.p.entry_zones and engine.p.exit_zones
    assert engine.p.xy_offset_by_cam == ((0, .55, 2.54), (1, -.17, 2.33))


def test_replay_uses_embedded_engine_inputs_without_video(tmp_path):
    root = Path(__file__).resolve().parents[4]
    config = root/'sim3d/data/runs/20261106-131804_sang_20p/techgar_config'
    inputs = {'calibration': json.loads((config/'calibration.json').read_text(encoding='utf8')),
              'gates': json.loads((config/'gate_zones.json').read_text(encoding='utf8'))}
    path = tmp_path/'x.gz'
    with BlobDumpWriter(path, video='missing-video', stride=1, cameras=CAMERAS,
                        core_version='x', engine_inputs=inputs) as writer:
        writer.write_step(1., 1, 1, {0: [], 1: []})
    spec = importlib.util.spec_from_file_location(
        'core2_replay_embedded', Path(__file__).resolve().parents[2]/'core2_replay.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    module.replay(path, tmp_path/'out.jsonl')
    assert json.loads((tmp_path/'out.jsonl').read_text(encoding='utf8'))['schema_version'] == 3


def test_binder_notifications_follow_lost_and_exit_once():
    class LifecycleEngine:
        def __init__(self):
            self.tracks = []
            self._next_gid = 2
            self.n = 0
        def step(self, t, frame, blobs):
            self.n += 1
            state = State.MOVING if self.n == 1 else State.LOST
            self.tracks = ([] if self.n == 3 else
                           [SimpleNamespace(gid=1, state=state, bbox_by_cam={},
                                            last_meas_xy=(0., 0.), last_meas_t=0., v=(0., 0.))])
            return []
        def drain_events(self): return []
        def live_gids(self): return {track.gid for track in self.tracks}
        def stats(self): return {}
    adapter = Core2Adapter(LifecycleEngine())
    expected = [[], [('lost', 1)], [('expired', 1)]]
    for frame in range(1, 4):
        adapter.set_inputs({}, float(frame), frame)
        adapter.update_all_tracks({}, frame)
        assert adapter.take_binder_notifications() == expected[frame-1]
        assert adapter.take_binder_notifications() == []
