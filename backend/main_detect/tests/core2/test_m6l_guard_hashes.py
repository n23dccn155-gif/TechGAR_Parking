import importlib.util
from pathlib import Path


def test_guard_covers_core2l_files_and_detects_changes(tmp_path, monkeypatch):
    root = Path(__file__).resolve().parents[4]
    spec = importlib.util.spec_from_file_location('m6l_guard_test', root / '.orca/core2/m6l_guard.py')
    guard = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(guard)
    expected = [root / 'backend/main_detect/src/techgar/core2' / name for name in
                ('adapter.py', 'adapter_l.py', 'config.py', 'engine_l.py', 'detect_l.py')]
    expected += [root / '.orca/core2/m1l/run_gpu2/decode_config.json',
                 root / '.orca/core2/m1l/run_gpu2/m1l.onnx']
    assert set(expected).issubset(set(guard.FILES))
    assert all(path.is_file() for path in expected)

    replicas = []
    for index, _ in enumerate(expected):
        path = tmp_path / str(index)
        path.write_bytes(b'original')
        replicas.append(path)
    monkeypatch.setattr(guard, 'FILES', replicas)
    before = guard.hashes()
    for path in replicas:
        path.write_bytes(b'changed')
        assert guard.hashes() != before
        path.write_bytes(b'original')
        assert guard.hashes() == before
