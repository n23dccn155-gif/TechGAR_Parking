"""Explicit M1L/Engine L wiring; existing core2 adapter stays unchanged."""
import json
from pathlib import Path
from types import SimpleNamespace
from .adapter import CameraView
from . import detect_l
from .engine_l import EngineLEngine, EngineLParams
from .engine_l_facade import EngineLFacade


def load_m1l_config(path):
    path = Path(path)
    if not path.is_file():
        raise FileNotFoundError(f'M1L decode config missing: {path}')
    data = json.loads(path.read_text(encoding='utf8'))
    if data.get('schema') != 1:
        raise ValueError('unsupported M1L decode schema')
    for key in ('threshold', 'nms_kernel', 'nms_radius_cells'):
        if key not in data.get('decode', {}): raise ValueError(f'M1L decode missing {key}')
    return data


class CameraViewL(CameraView):
    def __init__(self, cam, transform, roi_mask, onnx_path, decode_config):
        self.cam = cam
        self.detector = detect_l.M1LDetector(cam, transform, onnx_path, decode_config=decode_config,
                                            compute_desc=False)
        self.detector.set_roi(roi_mask)
        self.frame_index = 0
        self.blobs = []
        self._tracks = {}
        self.occlusion_guard = SimpleNamespace(groups={}, independent_pairs=())
        self.association_events = []
        self.newly_lost_tracks = []


def make_engine_l(transforms, gates, frame_sizes=None, public_id_split=False):
    """Build Engine L. frame_sizes: optional {cam1/cam2: (width, height)} for S1.

    Omitting it keeps the legacy 800-px edge fallback (warned once per camera).
    """
    gate = gates['entry_gate']
    entry = ((gate['p1']['x'], gate['p1']['y']), (gate['p2']['x'], gate['p2']['y']))
    if frame_sizes is not None:
        for name in ('cam1', 'cam2'):
            if name not in frame_sizes or len(frame_sizes[name]) != 2:
                raise ValueError(f'frame_sizes must supply (width, height) for {name}')
        frame_sizes = {name: tuple(int(v) for v in frame_sizes[name]) for name in ('cam1', 'cam2')}
    params = EngineLParams(s1_frame_width=frame_sizes)
    engine = EngineLFacade(EngineLEngine(params=params, camera_transforms={i: transforms[name]
        for i, name in enumerate(('cam1', 'cam2'))}, entry_gate=entry))
    if public_id_split:
        from .public_id import PublicIdEngine
        return PublicIdEngine(engine)
    return engine
