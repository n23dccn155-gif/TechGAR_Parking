"""Chot chan TEST RUN cho moi test trong `tests/core2`.

Hai lop bao ve:
  1. `no_test_runs` (autouse fixture): test co marker `@pytest.mark.test_run` bi SKIP
     khi chua bat `TECHGAR_ALLOW_TEST_RUNS=1`.
  2. `pytest_collection_modifyitems`: quet ten/param cua tung test, neu thay token
     run TEST (sang_5p / sang_10p / toi_5p, ten ngan hoac day du) thi tu dong gan
     marker `test_run` => bi SKIP o buoc (1).

KHONG sua `oracle_dump.py`: ma tran cuoi can chay oracle TEST, va se chay voi env
`TECHGAR_ALLOW_TEST_RUNS=1` (guard ton trong env).

Chay TEST co chu dich:
    $env:TECHGAR_ALLOW_TEST_RUNS='1'
    .\\.venv\\Scripts\\python.exe -m pytest tests/core2 -q
"""
from __future__ import annotations

import pathlib
import sys

import pytest

ROOT = pathlib.Path(__file__).resolve().parents[4]
_SRC = ROOT / "backend" / "main_detect" / "src"
if str(_SRC) not in sys.path:
    sys.path.insert(0, str(_SRC))

from techgar.core2.run_guard import (  # noqa: E402
    ENV_FINAL,
    ENV_FLAG,
    allow_final_test,
    allow_test_runs,
    is_test_path,
    skip_reason_if_test,
)


def _is_guard_self_test(item) -> bool:
    """Test cua CHINH chot chan (`test_run_guard.py`) khong bi chan.

    No chi kiem ham guard, khong cham du lieu TEST. Neu chan no thi khong ai kiem
    duoc guard con dung hay khong.
    """
    path = str(getattr(item, "fspath", "") or getattr(item, "path", "") or "")
    return path.replace("\\", "/").endswith("test_run_guard.py")


def pytest_configure(config):
    config.addinivalue_line(
        "markers",
        "test_run: test dung run TEST (sang_5p/sang_10p/toi_5p); "
        "bi SKIP tru khi TECHGAR_ALLOW_TEST_RUNS=1")


@pytest.fixture(autouse=True)
def no_test_runs(request):
    """Skip test dung run BI CHAN (kiem ten test + marker + params).

    PHAN LOAI MOI: `sang_5p`/`toi_5p` (phan tich) mo bang ENV_FLAG;
    `sang_10p` (cham cuoi) CHI mo bang ENV_FINAL — nen khong the dung mot co
    `allow_test_runs()` chung cho tat ca.
    """
    if _is_guard_self_test(request.node):
        yield
        return

    if request.node.get_closest_marker("test_run") is not None:
        if not (allow_test_runs() and allow_final_test()):
            pytest.skip(f"test danh dau marker test_run; bat {ENV_FLAG}=1 "
                        f"(phan tich) hoac {ENV_FINAL}=1 (cham cuoi) de chay")

    reason = skip_reason_if_test(request.node.name)
    if reason:
        pytest.skip(reason)

    # kiem gia tri tham so (parametrize co the mang ten run bi chan)
    callspec = getattr(request.node, "callspec", None)
    if callspec is not None:
        for value in callspec.params.values():
            reason = skip_reason_if_test(value)
            if reason:
                pytest.skip(f"tham so test tro toi run bi chan ({value}); {reason}")
    yield


def pytest_collection_modifyitems(config, items):
    """Gan marker `test_run` cho test co ten/param tro toi run BI CHAN.

    KHONG duoc return som theo `allow_test_runs()`: `sang_10p` van bi chan
    ngay ca khi env thuong da bat, nen marker phai duoc gan dua tren tung run.
    """
    for item in items:
        if _is_guard_self_test(item):
            continue
        marked = is_test_path(item.name)
        callspec = getattr(item, "callspec", None)
        if not marked and callspec is not None:
            marked = any(is_test_path(value) for value in callspec.params.values())
        if marked:
            item.add_marker(pytest.mark.test_run)
