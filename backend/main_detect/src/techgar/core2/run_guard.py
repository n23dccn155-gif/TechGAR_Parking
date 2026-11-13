"""Chot chan RUN — phan loai theo director/anh An (2026-11-12).

PHAN LOAI MOI:

| run | phan loai | mo bang |
|---|---|---|
| `sang_5p`, `toi_5p` | **tap PHAN TICH** (doc GT, lam fixture duoc) | `TECHGAR_ALLOW_TEST_RUNS=1` |
| `sang_10p` | **bai cham cuoi DUY NHAT** | **`TECHGAR_ALLOW_FINAL_TEST=1`** (env thuong KHONG mo) |

Ten day du tren dia: `20261106-130217_sang_5p`, `20261106-131033_sang_10p`,
`20261106-134724_toi_5p`.

VI SAO: `sang_10p` la bai cham cuoi, chi director mo MOT lan. Moi duong dan khac
(VAL, train, dump VAL) KHONG bi chan.

CACH DUNG (ham) — khong sua `oracle_dump.py`:

    from techgar.core2.run_guard import assert_not_test_path, is_test_path

    assert_not_test_path(dump_path)          # raise neu bi chan
    if is_test_path(run_dir): ...

CACH DUNG (pytest) — `conftest.py` goi `skip_reason_if_test` / marker `test_run`.

Bien moi truong:
    TECHGAR_ALLOW_TEST_RUNS=1  -> mo `sang_5p`, `toi_5p` (phan tich)
    TECHGAR_ALLOW_FINAL_TEST=1 -> mo `sang_10p` (CHI luc cham cuoi)
"""
from __future__ import annotations

import os
import pathlib

# Env thuong: mo tap PHAN TICH (sang_5p, toi_5p).
ENV_FLAG = "TECHGAR_ALLOW_TEST_RUNS"
# Env RIENG: mo bai cham cuoi (sang_10p). Env thuong KHONG mo duoc.
ENV_FINAL = "TECHGAR_ALLOW_FINAL_TEST"

# --- PHAN LOAI -------------------------------------------------------------
ANALYSIS_SHORT = ("sang_5p", "toi_5p")
ANALYSIS_FULL = ("20261106-130217_sang_5p", "20261106-134724_toi_5p")

FINAL_SHORT = ("sang_10p",)
FINAL_FULL = ("20261106-131033_sang_10p",)

# Tuong thich nguoc: ten cu gop ca 3.
TEST_SHORT = ANALYSIS_SHORT + FINAL_SHORT
TEST_FULL = ANALYSIS_FULL + FINAL_FULL
TEST_TOKENS = TEST_SHORT + TEST_FULL


class TestRunBlocked(RuntimeError):
    """Dung run bi chan (chua bat env tuong ung)."""


def _truthy(value) -> bool:
    return (value or "").strip().lower() in ("1", "true", "yes", "on")


def allow_test_runs() -> bool:
    """True neu env thuong cho phep TAP PHAN TICH (sang_5p, toi_5p).

    LUU Y: env nay KHONG mo `sang_10p`.
    """
    return _truthy(os.environ.get(ENV_FLAG))


def allow_final_test() -> bool:
    """True neu env RIENG cho phep bai cham cuoi (`sang_10p`)."""
    return _truthy(os.environ.get(ENV_FINAL))


def _matches(name: str, tokens) -> bool:
    """Ten/duong dan co khop mot trong `tokens` khong — khop theo RANH GIOI.

    Phai theo ranh gioi: `sang_20p` (TRAIN) KHONG bi chan, `sang_5p_extra` thi PHAI.
    """
    lowered = str(name).lower().replace("\\", "/")
    parts = [p for p in lowered.split("/") if p]
    if not parts:
        return False
    for token in tokens:
        candidate = token.lower()
        for part in parts:
            if part == candidate:
                return True
            # ten day du `20261106-130217_sang_5p` voi token ngan `sang_5p`
            if part.endswith("_" + candidate) or part.endswith("-" + candidate):
                return True
            # token la ten day du, `part` la ten ngan
            if candidate.endswith("_" + part) and part in TEST_SHORT:
                return True
            # TEN FILE co hau to: `sang_5p_perfect.jsonl.gz`
            if part.startswith(candidate + "_"):
                return True
            if part.startswith(candidate + "."):
                return True
    return False


def is_final_test_path(value) -> bool:
    """True neu `value` tro toi bai cham cuoi (`sang_10p`)."""
    if value is None:
        return False
    return _matches(str(value), FINAL_SHORT + FINAL_FULL)


def is_analysis_path(value) -> bool:
    """True neu `value` tro toi tap PHAN TICH (sang_5p, toi_5p)."""
    if value is None:
        return False
    return _matches(str(value), ANALYSIS_SHORT + ANALYSIS_FULL)


def is_test_path(value) -> bool:
    """True neu `value` BI CHAN (tap phan tich hoac bai cham cuoi)."""
    if value is None:
        return False
    return is_final_test_path(value) or is_analysis_path(value)


def assert_not_test_path(value, *, what: str = "duong dan") -> None:
    """Raise TestRunBlocked neu `value` bi chan va env tuong ung chua bat.

    `sang_10p` CHI mo bang `TECHGAR_ALLOW_FINAL_TEST=1`; `TECHGAR_ALLOW_TEST_RUNS=1`
    KHONG mo duoc no.
    """
    if value is None:
        return
    if is_final_test_path(value):
        if allow_final_test():
            return
        raise TestRunBlocked(
            f"{what} tro toi BAI CHAM CUOI (`sang_10p`: {value}). "
            f"Day la tap TEST KIN, chi director mo MOT lan. "
            f"Bat bang bien RIENG: {ENV_FINAL}=1 "
            f"(bien {ENV_FLAG}=1 KHONG mo duoc run nay).")
    if is_analysis_path(value):
        if allow_test_runs():
            return
        raise TestRunBlocked(
            f"{what} tro toi TAP PHAN TICH ({value}). "
            f"Bat bang: {ENV_FLAG}=1 (duoc phep doc GT / lam fixture).")
    return


def guard_path(*paths, what: str = "duong dan"):
    """Tien loi: chan nhieu duong dan cung luc."""
    for path in paths:
        assert_not_test_path(path, what=what)


def skip_reason_if_test(value) -> str | None:
    """Tra reason de `pytest.skip(reason)` neu bi chan va env chua bat.

    Phan biet ro tap phan tich va bai cham cuoi trong thong bao.
    """
    if value is None:
        return None
    if is_final_test_path(value):
        if allow_final_test():
            return None
        return (f"run {value} la BAI CHAM CUOI (sang_10p) — chi director mo bang "
                f"{ENV_FINAL}=1")
    if is_analysis_path(value):
        if allow_test_runs():
            return None
        return (f"run {value} la TAP PHAN TICH — bat {ENV_FLAG}=1 de doc GT / "
                f"lam fixture")
    return None


# ---------------------------------------------------------------- pytest helper
def pytest_guard(namespace: dict) -> None:
    """Goi trong conftest.py: cung cap fixture `no_test_runs`.

    Thuc te chan chac chan nhat la goi `skip_reason_if_test` o tung test hoac dung
    marker `test_run` (xem conftest cua tests/core2).
    """
    try:
        import pytest
    except ImportError:  # pragma: no cover
        return

    @pytest.fixture(autouse=True)
    def no_test_runs(request):
        if allow_final_test() and allow_test_runs():
            yield
            return
        reason = skip_reason_if_test(request.node.name)
        if reason is None:
            marker = request.node.get_closest_marker("test_run")
            if marker is not None:
                reason = (f"test danh dau marker test_run; bat {ENV_FLAG}=1 "
                          f"(phan tich) hoac {ENV_FINAL}=1 (cham cuoi)")
        if reason is not None:
            pytest.skip(reason)
        yield

    namespace.setdefault("no_test_runs", no_test_runs)
