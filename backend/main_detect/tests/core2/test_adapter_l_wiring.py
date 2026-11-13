import json
from types import SimpleNamespace

import numpy as np
import pytest

from techgar.core2 import adapter_l


def test_decode_config_is_required_and_validated(tmp_path):
    with pytest.raises(FileNotFoundError, match='decode config missing'):
        adapter_l.load_m1l_config(tmp_path / 'missing.json')
    path = tmp_path / 'decode.json'
    path.write_text(json.dumps({'schema': 1, 'decode': {}}), encoding='utf8')
    with pytest.raises(ValueError, match='threshold'):
        adapter_l.load_m1l_config(path)


def test_camera_view_passes_config_path(monkeypatch):
    seen = {}
    class Detector:
        def __init__(self, cam, transform, path, **kwargs):
            seen.update(cam=cam, path=path, **kwargs)
        def set_roi(self, roi): seen['roi'] = roi
    monkeypatch.setattr(adapter_l.detect_l, 'M1LDetector', Detector)
    view = adapter_l.CameraViewL(0, np.eye(3), None, 'fixture.onnx', 'fixture.json')
    assert seen['decode_config'] == 'fixture.json'
    assert seen['compute_desc'] is False
    assert view.blobs == []
