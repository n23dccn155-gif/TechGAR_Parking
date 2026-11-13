import json
from pathlib import Path
from types import SimpleNamespace

import pytest
import two_camera
import core2l_replay
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[4]/'.orca/core2'))
import m6l_guard


def test_async_accepts_both_core2_variants_and_rejects_others():
    two_camera.validate_async_render('core2', None)
    two_camera.validate_async_render('core2l', None)
    with pytest.raises(ValueError): two_camera.validate_async_render('legacy', None)
    with pytest.raises(ValueError): two_camera.validate_async_render('core2l', object())


def test_replay_uses_l_engine_and_adapted_dimensions(monkeypatch, tmp_path):
    run = tmp_path/'run'; cfg=run/'techgar_config'; cfg.mkdir(parents=True)
    (cfg/'calibration.json').write_text('{}',encoding='utf8')
    (cfg/'gate_zones.json').write_text('{"entry_gate": {}}',encoding='utf8')
    seen={}
    monkeypatch.setattr(core2l_replay, 'read_dump', lambda p: ({'video':str(run),'provenance':'core2_m1l'},(x for x in ())))
    class Capture:
        def __init__(self, path): pass
        def isOpened(self): return True
        def get(self, key): return 800 if key == core2l_replay.cv2.CAP_PROP_FRAME_WIDTH else 1280
        def release(self): pass
    monkeypatch.setattr(core2l_replay.cv2,'VideoCapture',Capture)
    monkeypatch.setattr(core2l_replay,'load_calibration',lambda path: ({'cam1':'x','cam2':'y'},None,None,None))
    def adapt(cal, transforms, sizes):
        seen['sizes']=sizes
        return {'cam1':'adapted1','cam2':'adapted2'}
    monkeypatch.setattr(core2l_replay,'adapt_calibration_to_frame_sizes',adapt)
    monkeypatch.setattr(core2l_replay,'make_engine_l',lambda transforms,gates,frame_sizes=None: ('L',transforms))
    monkeypatch.setattr(core2l_replay,'replay',lambda dump,out,engine: seen.update(engine=engine))
    core2l_replay.replay_l('input.gz','output.jsonl')
    assert seen['sizes'] == {'cam1':(800,1280),'cam2':(800,1280)}
    assert seen['engine'][0] == 'L'


def test_guard_commands_use_val_and_have_dump_and_predictions():
    for tag in m6l_guard.MATRIX:
        cmd = m6l_guard.make_command(tag)
        assert '20261106-135452_toi_10p' in cmd[cmd.index('--replay-session')+1]
        assert cmd[cmd.index('--identity-kernel')+1] == 'core2l'
        assert '--core2-dump' in cmd and '--session-dir' in cmd
        assert '--debug-video-only' not in cmd


def test_guard_respects_existing_lock(monkeypatch, tmp_path):
    lock=tmp_path/'RUNTIME.lock'; lock.write_text('other owner',encoding='utf8')
    monkeypatch.setattr(m6l_guard, 'ROOT', tmp_path)
    monkeypatch.setattr(m6l_guard, 'LOCK', lock)
    monkeypatch.setattr(m6l_guard.shutil, 'disk_usage', lambda p: SimpleNamespace(free=20*1024**3))
    monkeypatch.setitem(sys.modules,'psutil',SimpleNamespace())
    monkeypatch.setitem(sys.modules,'m6_smoke',SimpleNamespace(free_ram=lambda: 4*1024**3))
    monkeypatch.setattr(sys,'argv',['m6l_guard.py','e1_s1'])
    with pytest.raises(FileExistsError): m6l_guard.main()
    assert lock.read_text(encoding='utf8') == 'other owner'
