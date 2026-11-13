from types import SimpleNamespace

from techgar.core2 import detect_l, engine_l
from techgar.core2.perf_stages import StageTimers


def test_stage_timers_count_nested_work_and_restore(monkeypatch):
    monkeypatch.setattr(detect_l, 'decode_refine', lambda: None)
    monkeypatch.setattr(engine_l, '_fuse_points', lambda: None)
    class Detector:
        def ground_point(self): return (1, 2)
        def step(self):
            detect_l.decode_refine()
            return self.ground_point()
    class Engine:
        def step(self): return engine_l._fuse_points()
    class Binder:
        def update_tracks(self): return None
    a,b=Detector(),Detector(); engine=Engine(); binder=Binder()
    timers=StageTimers(); timers.install({'cam1':SimpleNamespace(detector=a),'cam2':SimpleNamespace(detector=b)},SimpleNamespace(engine=engine),{'cam1':binder})
    a.step(); b.step(); engine.step(); binder.update_tracks()
    result=timers.snapshot()
    assert all(key in result for key in ('detect_cam1','detect_cam2','decode_cam1','decode_cam2','homography_cam1','homography_cam2','engine','fuse','binder'))
    assert timers.snapshot()=={}
    timers.close()
