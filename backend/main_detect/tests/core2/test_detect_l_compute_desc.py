import json

import numpy as np

from techgar.core2 import detect_l, desc


def test_descriptor_default_and_opt_out_preserve_blob_geometry(monkeypatch, tmp_path):
    config = tmp_path/'decode.json'
    config.write_text(json.dumps({'decode': {'threshold': .3, 'nms_kernel': 5,
        'nms_radius_cells': 2.5}, 'offset_cm': {'0': [0, 0]}}), encoding='utf8')
    model = tmp_path/'model.onnx'; model.write_bytes(b'fixture')
    class Net:
        def setInput(self, blob): pass
        def forward(self):
            data = np.zeros((1, 3, 96, 96), np.float32)
            data[0, 0, :, :] = -20
            data[0, 0, 48, 48] = 20
            return data
    monkeypatch.setattr(detect_l.cv2.dnn, 'readNetFromONNX', lambda _: Net())
    calls = []
    monkeypatch.setattr(desc, 'blob_descriptor', lambda *a, **kw: calls.append(1) or (1.0,))
    frame = np.zeros((384, 384, 3), np.uint8)
    default = detect_l.M1LDetector(0, np.eye(3), model, decode_config=config)
    disabled = detect_l.M1LDetector(0, np.eye(3), model, decode_config=config, compute_desc=False)
    a, b = default.step(frame, 1, .04), disabled.step(frame, 1, .04)
    assert len(a) == len(b) == 1 and len(calls) == 1
    assert a[0].desc == (1.0,) and b[0].desc is None
    assert a[0].xy == b[0].xy and a[0].bbox == b[0].bbox
