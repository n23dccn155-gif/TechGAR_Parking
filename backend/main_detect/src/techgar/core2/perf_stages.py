"""Opt-in per-frame timing hooks; timers overlap where documented."""
import threading
import time


class StageTimers:
    def __init__(self):
        self._lock = threading.Lock()
        self._local = threading.local()
        self._values = {}
        self._restore = []

    def _add(self, name, elapsed):
        with self._lock: self._values[name] = self._values.get(name, 0.0) + elapsed

    def _wrap(self, obj, name, key):
        original = getattr(obj, name)
        def wrapper(*args, **kwargs):
            start = time.perf_counter()
            try: return original(*args, **kwargs)
            finally: self._add(key() if callable(key) else key, (time.perf_counter()-start)*1000)
        self._restore.append((obj, name, original))
        setattr(obj, name, wrapper)

    def install(self, views, manager, binders):
        from . import detect_l, engine_l
        for camera, view in views.items():
            detector = view.detector
            original = detector.step
            def step(*args, _original=original, _camera=camera, **kwargs):
                self._local.camera = _camera
                start=time.perf_counter()
                try: return _original(*args, **kwargs)
                finally:
                    self._add('detect_'+_camera, (time.perf_counter()-start)*1000)
                    self._local.camera = None
            self._restore.append((detector, 'step', original))
            detector.step = step
            self._wrap(detector, 'ground_point', 'homography_'+camera)
        self._wrap(detect_l, 'decode_refine', lambda: 'decode_'+str(getattr(self._local, 'camera', 'unknown')))
        self._wrap(engine_l, '_fuse_points', 'fuse')
        self._wrap(manager.engine, 'step', 'engine')
        for binder in binders.values(): self._wrap(binder, 'update_tracks', 'binder')

    def snapshot(self):
        with self._lock:
            out=self._values; self._values={}
        return out

    def close(self):
        for obj,name,original in reversed(self._restore): setattr(obj,name,original)
        self._restore.clear()
