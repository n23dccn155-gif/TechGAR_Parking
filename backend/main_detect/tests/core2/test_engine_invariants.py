"""Bat bien core2 tren MOI buoc cua dump ORACLE TRAIN (Core2Engine / Core2EngineL).

I1: khong co hai vet (bat ky trang thai, tru da xoa) cung mang mot GID.
I2: mot vet khong doi GID: gid di None -> g mot lan (xac nhan/nhan lai), khong bao gio g -> g'.
I3: moi buoc khong co hai dau ra cung GID.
Dung dev_loop.make_engine (zone cong, o do, offset mat dinh / 0 cho oracle).
Du lieu: dump oracle train cat ngan (3500 frame, <20 MB) luu tai .orca/core2/oracle_train/.
KHONG dung 3 run TEST (sang_5p, sang_10p, toi_5p) de tuan thu run_guard tuyet doi.
"""
from __future__ import annotations

import importlib.util
from pathlib import Path

import pytest

from techgar.core2.dump import read_dump
from techgar.core2.run_guard import skip_reason_if_test

ROOT = Path(__file__).resolve().parents[4]
ORACLE_DIR = ROOT / ".orca/core2/oracle_train"
RUNS = ROOT / "sim3d/data/runs"

SANG20 = "20261106-131804_sang_20p"
TOI20 = "20261109-175513_toi_20p"

CASES = [
    ("sang_20p_perfect", SANG20),
    ("sang_20p_jitter09", SANG20),
    ("toi_20p_perfect", TOI20),
    ("toi_20p_jitter09", TOI20),
]


def _dev_loop():
    path = ROOT / ".orca/core2/dev_loop.py"
    if not path.exists():
        pytest.skip("dev_loop.py khong co")
    spec = importlib.util.spec_from_file_location("dev_loop_for_tests", path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


@pytest.mark.parametrize("name,run", CASES)
def test_no_shared_gid_and_no_gid_change(name, run):
    # Kiem tra run_guard: tuyet doi khong dung 3 run TEST
    reason = skip_reason_if_test(run)
    if reason:
        pytest.skip(reason)

    dump = ORACLE_DIR / f"{name}.jsonl.gz"
    run_dir = RUNS / run
    if not dump.exists() or not (run_dir / "techgar_config/calibration.json").exists():
        pytest.skip(f"dump {dump.name} hoac run_dir khong co tren may")

    eng = _dev_loop().make_engine(run_dir, xy_offset_by_cam=((0, 0.0, 0.0), (1, 0.0, 0.0)))
    _, steps = read_dump(str(dump))
    seen: dict[int, int | None] = {}  # tid -> GID lan truoc
    n_steps = 0

    for st in steps:
        outs = eng.step(st["t"], st["frame_idx"], st["blobs_by_cam"])
        eng.drain_events()
        n_steps += 1
        where = f"{name} f{st['source_frame_idx']}"

        # I1: Khong co hai vet dang theo doi mang cung mot GID
        live = [(tr.gid, tr.tid, tr.state.name) for tr in eng.tracks if tr.gid is not None]
        gids = [g for g, _, _ in live]
        dup = sorted({g for g in gids if gids.count(g) > 1})
        assert not dup, f"I1 hai vet cung GID {dup} tai {where}: {[x for x in live if x[0] in dup]}"

        # I2: Mot vet khong bao gio bi doi GID khac
        for tr in eng.tracks:
            before = seen.get(tr.tid)
            if before is not None:
                assert tr.gid == before, f"I2 vet {tr.tid} doi GID {before}->{tr.gid} tai {where}"
            seen[tr.tid] = tr.gid if tr.gid is not None else before

        # I3: Moi buoc dau ra khong co trung lap GID
        og = [o.gid for o in outs]
        assert len(og) == len(set(og)), f"I3 hai dau ra cung GID tai {where}: {sorted(og)}"

    assert n_steps >= 500, f"So buoc kiem tra qua it ({n_steps} < 500)"
