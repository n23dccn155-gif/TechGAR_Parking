"""Test cho chot chan TEST RUN (`techgar.core2.run_guard`).

Muc dich: bao dam guard
  (a) CHAN dung 3 run TEST (ten ngan + ten day du, ca duong dan);
  (b) KHONG chan nham run TRAIN/VAL (sang_20p, toi_10p, toi_20p, sang_60, ...);
  (c) ton trong env TECHGAR_ALLOW_TEST_RUNS=1;
  (d) ban dung lai trong `.orca/core2/run_guard_orca.py` dung CUNG logic
      (single source of truth, khong lech).

Chay:
    backend\\main_detect\\.venv\\Scripts\\python.exe -m pytest tests/core2/test_run_guard.py -q
"""
from __future__ import annotations

import importlib.util
import pathlib
import sys

import pytest

ROOT = pathlib.Path(__file__).resolve().parents[2]
SRC = ROOT / 'backend' / 'main_detect' / 'src'
if str(SRC) not in sys.path:
    sys.path.insert(0, str(SRC))

from techgar.core2 import run_guard as G  # noqa: E402

# ---------------------------------------------------------------- (a) CHAN
TEST_PATHS = [
    'sang_5p',
    'sang_10p',
    'toi_5p',
    '20261106-130217_sang_5p',
    '20261106-131033_sang_10p',
    '20261106-134724_toi_5p',
    'sim3d/data/runs/20261106-130217_sang_5p',
    'sim3d/data/runs/20261106-131033_sang_10p/cam1.mp4',
    'sim3d/data/runs/20261106-134724_toi_5p/techgar_config/calibration.json',
    r'sim3d\data\runs\20261106-130217_sang_5p\raw_cam1.mp4',
    'C:/x/sim3d/data/runs/20261106-134724_toi_5p',
    '.orca/core2/oracle_l/sang_5p_perfect.jsonl.gz',
]


def test_run_guard_is_exempt():
    """Test cua CHINH guard phai chay duoc ma khong can env.

    Conftest tu dong gan marker `test_run` cho moi test co tham so/ten chua ten run
    TEST (ke ca test nay, vi parametrize co 'sang_5p'). Nhung day la test KIEM TRA
    guard, khong phai test CHAM du lieu TEST => phai mien tru.
    """
    # neu conftest gan marker, pytest se skip o fixture autouse; ta xac nhan guard
    # van hoat dong doc lap:
    assert G.is_test_path('sang_5p') is True


@pytest.mark.parametrize('path', TEST_PATHS)
def test_test_run_paths_are_blocked(path):
    assert G.is_test_path(path) is True, f'phai chan: {path}'


# ---------------------------------------------------------------- (b) KHONG chan nham
TRAIN_VAL_PATHS = [
    'sang_20p',
    'toi_10p',
    'toi_20p',
    'toi_30',
    'sang_30_new',
    'sang_60',
    'toi_60',
    '20261106-131804_sang_20p',
    '20261106-135452_toi_10p',
    'sim3d/data/runs/20261106-131804_sang_20p',
    'sim3d/data/runs/20261106-135452_toi_10p/raw_cam2.mp4',
    '.orca/core2/m1l/dump_val/toi_10p_v3_m1lv2.jsonl.gz',
    '.orca/core2/m1l/dataset/toi_10p',
    'backend/main_detect/src/techgar/core2/engine_l.py',
]


@pytest.mark.parametrize('path', TRAIN_VAL_PATHS)
def test_train_val_paths_are_not_blocked(path):
    assert G.is_test_path(path) is False, f'KHONG duoc chan: {path}'


def test_empty_and_none_are_safe():
    assert G.is_test_path(None) is False
    assert G.is_test_path('') is False


# ---------------------------------------------------------------- (c) env
def test_raises_without_env(monkeypatch):
    monkeypatch.delenv(G.ENV_FLAG, raising=False)
    with pytest.raises(G.TestRunBlocked) as info:
        G.assert_not_test_path('20261106-130217_sang_5p')
    message = str(info.value)
    assert 'sang_5p' in message
    assert G.ENV_FLAG in message, 'thong bao phai noi ro cach bat env'


def test_allows_with_env(monkeypatch):
    monkeypatch.setenv(G.ENV_FLAG, '1')
    # khong raise
    G.assert_not_test_path('20261106-130217_sang_5p')


@pytest.mark.parametrize('value', ['1', 'true', 'TRUE', 'yes', 'on', ' 1 '])
def test_env_truthy_values(monkeypatch, value):
    monkeypatch.setenv(G.ENV_FLAG, value)
    assert G.allow_test_runs() is True


@pytest.mark.parametrize('value', ['0', 'false', '', 'no', 'off', 'x'])
def test_env_falsy_values(monkeypatch, value):
    monkeypatch.setenv(G.ENV_FLAG, value)
    assert G.allow_test_runs() is False


def test_non_test_path_never_raises_even_without_env(monkeypatch):
    monkeypatch.delenv(G.ENV_FLAG, raising=False)
    G.assert_not_test_path('sim3d/data/runs/20261106-135452_toi_10p')


def test_guard_path_checks_all(monkeypatch):
    monkeypatch.delenv(G.ENV_FLAG, raising=False)
    G.guard_path('toi_10p')                     # ok
    with pytest.raises(G.TestRunBlocked):
        G.guard_path('toi_10p', 'toi_5p')       # phan tu thu 2 la TEST


def test_skip_reason_helper(monkeypatch):
    monkeypatch.delenv(G.ENV_FLAG, raising=False)
    monkeypatch.delenv(G.ENV_FINAL, raising=False)
    assert G.skip_reason_if_test('sang_5p') is not None
    assert G.skip_reason_if_test('sang_20p') is None
    monkeypatch.setenv(G.ENV_FLAG, '1')
    assert G.skip_reason_if_test('sang_5p') is None
    # sang_10p: env thuong KHONG mo duoc
    assert G.skip_reason_if_test('sang_10p') is not None
    monkeypatch.setenv(G.ENV_FINAL, '1')
    assert G.skip_reason_if_test('sang_10p') is None


# ------------------------------------------------- (c2) PHAN LOAI MOI (21:xx)
# Director/anh An doi: sang_5p + toi_5p -> tap PHAN TICH (mo bang env thuong);
# sang_10p -> bai cham cuoi DUY NHAT, CHI mo bang TECHGAR_ALLOW_FINAL_TEST=1.

ANALYSIS_RUNS = ('sang_5p', 'toi_5p',
                 '20261106-130217_sang_5p', '20261106-134724_toi_5p')
FINAL_RUNS = ('sang_10p', '20261106-131033_sang_10p')


def _clear_env(monkeypatch):
    monkeypatch.delenv(G.ENV_FLAG, raising=False)
    monkeypatch.delenv(G.ENV_FINAL, raising=False)


@pytest.mark.parametrize('run', ANALYSIS_RUNS)
def test_analysis_runs_open_with_normal_env(monkeypatch, run):
    """sang_5p / toi_5p: MO khi co TECHGAR_ALLOW_TEST_RUNS=1."""
    _clear_env(monkeypatch)
    with pytest.raises(G.TestRunBlocked):
        G.assert_not_test_path(run)
    monkeypatch.setenv(G.ENV_FLAG, '1')
    G.assert_not_test_path(run)          # khong raise


@pytest.mark.parametrize('run', FINAL_RUNS)
def test_final_run_blocked_by_normal_env(monkeypatch, run):
    """sang_10p: VAN CHAN khi chi co env thuong (day la diem chot)."""
    _clear_env(monkeypatch)
    monkeypatch.setenv(G.ENV_FLAG, '1')
    with pytest.raises(G.TestRunBlocked) as info:
        G.assert_not_test_path(run)
    # thong bao phai noi ro env RIENG, khong chi env thuong
    assert G.ENV_FINAL in str(info.value), (
        'thong bao phai chi ra env RIENG cho bai cham cuoi')


@pytest.mark.parametrize('run', FINAL_RUNS)
def test_final_run_open_with_final_env(monkeypatch, run):
    """sang_10p: MO khi co TECHGAR_ALLOW_FINAL_TEST=1."""
    _clear_env(monkeypatch)
    monkeypatch.setenv(G.ENV_FINAL, '1')
    G.assert_not_test_path(run)          # khong raise


def test_final_env_does_not_open_analysis_runs(monkeypatch):
    """Env RIENG cua bai cham cuoi KHONG mo tap phan tich (tach bach 2 chieu)."""
    _clear_env(monkeypatch)
    monkeypatch.setenv(G.ENV_FINAL, '1')
    with pytest.raises(G.TestRunBlocked):
        G.assert_not_test_path('sang_5p')


def test_classification_helpers(monkeypatch):
    """Ham phan loai tra dung nhom."""
    assert G.is_final_test_path('sang_10p') is True
    assert G.is_final_test_path('sang_5p') is False
    assert G.is_analysis_path('sang_5p') is True
    assert G.is_analysis_path('toi_5p') is True
    assert G.is_analysis_path('sang_10p') is False
    # ca hai deu la "bi chan" khi chua bat env
    for run in ANALYSIS_RUNS + FINAL_RUNS:
        assert G.is_test_path(run) is True
    # TRAIN/VAL khong thuoc nhom nao
    for run in ('sang_20p', 'toi_10p', 'toi_20p', 'sang_60', 'toi_30'):
        assert G.is_final_test_path(run) is False
        assert G.is_analysis_path(run) is False
        assert G.is_test_path(run) is False


@pytest.mark.parametrize('value', ['1', 'true', 'yes', 'on'])
def test_final_env_truthy_values(monkeypatch, value):
    monkeypatch.setenv(G.ENV_FINAL, value)
    assert G.allow_final_test() is True


@pytest.mark.parametrize('value', ['0', 'false', '', 'no', 'x'])
def test_final_env_falsy_values(monkeypatch, value):
    monkeypatch.setenv(G.ENV_FINAL, value)
    assert G.allow_final_test() is False


# ---------------------------------------------------------------- (d) ban .orca
def test_orca_copy_uses_same_logic():
    """Ban trong `.orca/core2/run_guard_orca.py` phai la CUNG logic (khong lech)."""
    path = ROOT / '.orca' / 'core2' / 'run_guard_orca.py'
    if not path.is_file():
        pytest.skip('khong co ban .orca (chay ngoai repo)')
    spec = importlib.util.spec_from_file_location('run_guard_orca_test', path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)

    same_module = (module.is_test_path.__module__
                   == G.is_test_path.__module__)
    # hoac: cung module, hoac cung ket qua tren bo case
    for probe in TEST_PATHS + TRAIN_VAL_PATHS:
        assert module.is_test_path(probe) == G.is_test_path(probe), \
            f'ban .orca lech tai: {probe}'
    assert same_module or all(
        module.is_test_path(p) == G.is_test_path(p)
        for p in TEST_PATHS + TRAIN_VAL_PATHS)
