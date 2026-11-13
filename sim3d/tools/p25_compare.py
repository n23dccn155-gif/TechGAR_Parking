"""P25 — so sánh TRƯỚC/SAU một lần sửa TechGAR trên hai thư mục run.

Đọc **hai thư mục run** đã có ``predictions.jsonl`` và in một bảng hợp nhất:

1. **IDF1** (qua ``.orca/sim3d/p22/idf1_eval.py`` — đã trừ crop cam2 đúng, xem
   ``evaluate`` dòng ~112);
2. **occupancy từng ô** (đọc ``m1/metrics.json`` của từng run — do ``m1_eval.py`` ghi);
3. **ID switch / đứt track / GID tái sử dụng** (``m1_track_eval.py``);
4. **frame recall** xe-frame đang chạy mỗi cam.

``before`` là thư mục chuẩn để so; mặc định ``.orca/sim3d/p22/run1`` (P22, trước P25).

Ví dụ::

    python sim3d/tools/p25_compare.py --after sim3d/data/runs/<RUN_MOI>
    python sim3d/tools/p25_compare.py --before .orca/sim3d/p22/run1 \\
        --after .orca/sim3d/p25/run_sang5p --json .orca/sim3d/p25/compare.json

Ghi chú về ``--gt-run``: ``before``/``after`` chỉ cần chứa ``predictions.jsonl`` (và tuỳ chọn
``metrics.json`` cho occupancy). GT luôn lấy từ ``--gt-run`` (mặc định =
``sim3d/data/runs/20261106-130217_sang_5p``) vì hai thư mục so sánh có thể chỉ là bản sao
predictions. Nếu ``before``/``after`` đã là run đầy đủ thì ``--gt-run`` không cần đổi.

Chỉ ĐỌC: không sửa code backend/engine, không chạy replay.
"""

from __future__ import annotations

import argparse
import json
import pathlib
import subprocess
import sys
import tempfile

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

TOOLS_DIR = pathlib.Path(__file__).resolve().parent
REPO = TOOLS_DIR.parents[1]
sys.path.insert(0, str(TOOLS_DIR))

import m1_track_eval  # noqa: E402

IDF1_SCRIPT = REPO / ".orca" / "sim3d" / "p22" / "idf1_eval.py"
DEFAULT_BEFORE = REPO / ".orca" / "sim3d" / "p22" / "run1"
DEFAULT_GT_RUN = REPO / "sim3d" / "data" / "runs" / "20261106-130217_sang_5p"


def predictions_of(run_dir: pathlib.Path) -> pathlib.Path:
    """``predictions.jsonl`` trong một thư mục run (hoặc bản sao P22)."""
    for candidate in (
        run_dir / "predictions.jsonl",
        run_dir / "m1" / "session" / "predictions.jsonl",
    ):
        if candidate.is_file():
            return candidate
    raise FileNotFoundError(f"không thấy predictions.jsonl trong {run_dir}")


def load_metrics(run_dir: pathlib.Path) -> dict | None:
    """``metrics.json`` (occupancy) nếu có.

    Tìm ở 3 chỗ vì hai kiểu thư mục đều đang dùng:
    - ``<run>/m1/metrics.json``  — run đầy đủ do ``m1_eval.py`` ghi;
    - ``<run>/metrics.json``     — bản sao P22 (``.orca/sim3d/p22/run1``) lưu phẳng ở gốc;
    - ``<run>/..`` của bản sao cũng có thể chỉ có ``metrics.json``.
    """
    for candidate in (
        run_dir / "m1" / "metrics.json",
        run_dir / "metrics.json",
    ):
        if not candidate.is_file():
            continue
        try:
            return json.loads(candidate.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            continue
    return None


def run_track(run_dir: pathlib.Path, predictions: pathlib.Path, *, crop: bool) -> dict:
    """Đo track bằng ``m1_track_eval.evaluate_run``."""
    return m1_track_eval.evaluate_run(
        run_dir,
        predictions,
        crop_offset=crop,
    )


def run_idf1(run_dir: pathlib.Path, predictions: pathlib.Path, scope: str = "moving") -> dict | None:
    """Gọi ``idf1_eval.py`` (coders-3). Trả ``None`` nếu thiếu script/lỗi.

    Ghi kết quả vào **thư mục tạm** (không ghi vào ``run_dir``): ``run_dir`` có thể là bản sao
    do người dùng giữ, không được tạo/xoá file trong đó.
    """
    if not IDF1_SCRIPT.is_file():
        return None
    with tempfile.TemporaryDirectory(prefix="p25_idf1_") as tmpdir:
        out = pathlib.Path(tmpdir) / f"idf1_{scope}.json"
        command = [
            sys.executable,
            "-X",
            "utf8",
            str(IDF1_SCRIPT),
            str(run_dir),
            "--predictions",
            str(predictions),
            "--json",
            str(out),
            "--scope",
            scope,
        ]
        try:
            proc = subprocess.run(
                command, capture_output=True, text=True, encoding="utf-8", errors="replace"
            )
        except OSError:
            return None
        if proc.returncode != 0 or not out.is_file():
            return None
        try:
            return json.loads(out.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            return None


def collect(label: str, run_dir: pathlib.Path, gt_run: pathlib.Path, *,
            crop: bool) -> dict:
    """Thu thập mọi chỉ số cho một phía (before/after)."""
    predictions = predictions_of(run_dir)
    record: dict = {"label": label, "run_dir": str(run_dir), "predictions": str(predictions)}

    # m1_track_eval cần run có gt_frames.csv; nếu run_dir chỉ là bản sao predictions thì
    # dùng gt_run (GT giống nhau vì cùng kịch bản).
    gt_source = run_dir if (run_dir / "gt_frames.csv").is_file() else gt_run
    record["gt_source"] = str(gt_source)

    if (gt_source / "gt_frames.csv").is_file():
        track = run_track(gt_source, predictions, crop=crop)
        record["track"] = track
        record["idf1"] = run_idf1(gt_source, predictions)
    else:
        record["track"] = None
        record["idf1"] = None

    record["metrics"] = load_metrics(run_dir)
    return record


def _pct(value: float | None) -> str:
    return "n/a" if value is None else f"{value * 100:.2f}%"


def print_report(before: dict, after: dict) -> None:
    print("=" * 86)
    print("P25 — SO SÁNH TRƯỚC / SAU")
    print(f"  before: {before['run_dir']}")
    print(f"  after : {after['run_dir']}")
    print(f"  GT    : {before['gt_source']}")
    print("=" * 86)

    # ---- 1. IDF1 ----
    print("\n[1] IDF1 (idf1_eval.py, đã trừ crop cam2)")
    b_idf1, a_idf1 = before.get("idf1"), after.get("idf1")
    if b_idf1 is None and a_idf1 is None:
        print("  n/a (không chạy được idf1_eval.py)")
    else:
        for key in ("idf1", "idp", "idr"):
            b = (b_idf1 or {}).get(key)
            a = (a_idf1 or {}).get(key)
            if b is None and a is None:
                continue
            delta = ""
            if isinstance(b, (int, float)) and isinstance(a, (int, float)):
                delta = f"   {((a - b) * 100):+.2f}pp"
            print(f"  {key.upper():<5} {_pct(b):>9}  ->  {_pct(a):>9}{delta}")
        for key in ("switches", "id_switches", "num_switches"):
            b_raw = (b_idf1 or {}).get(key)
            a_raw = (a_idf1 or {}).get(key)
            if b_raw is None and a_raw is None:
                continue
            # idf1_eval.py trả DANH SÁCH ca switch, không phải số ⇒ in số lượng + vài ca đầu.
            b_list = b_raw if isinstance(b_raw, list) else None
            a_list = a_raw if isinstance(a_raw, list) else None
            b = len(b_list) if b_list is not None else b_raw
            a = len(a_list) if a_list is not None else a_raw
            print(f"  {key:<16} {str(b):>9}  ->  {str(a):>9}")
            if a_list is not None:
                for item in a_list[:3]:
                    print(
                        f"      vd: f={item.get('frame')} {item.get('car')} "
                        f"{item.get('camera')} {item.get('old_gid')}→{item.get('new_gid')} "
                        f"({item.get('distance_px', 0):.1f} px)"
                    )

    # ---- 2. Occupancy ----
    print("\n[2] Occupancy (m1/metrics.json)")
    b_occ = ((before.get("metrics") or {}).get("occupancy") or {})
    a_occ = ((after.get("metrics") or {}).get("occupancy") or {})
    if not b_occ and not a_occ:
        print("  n/a (không có metrics.json — chạy m1_eval.py cho mỗi run)")
    else:
        for key, label in (
            ("accuracy", "đúng"),
            ("correct", "frame-ô đúng"),
            ("frame_slot_total", "tổng frame-ô"),
            ("false_free", "false-free"),
            ("false_occupied", "false-occupied"),
        ):
            b, a = b_occ.get(key), a_occ.get(key)
            if b is None and a is None:
                continue
            if key == "accuracy":
                print(f"  {label:<14} {_pct(b):>9}  ->  {_pct(a):>9}")
            else:
                print(f"  {label:<14} {str(b):>9}  ->  {str(a):>9}")

        # ô lệch: cái nào hết lệch, cái nào mới lệch
        b_bad = set((b_occ or {}).get("mismatched_slots") or [])
        a_bad = set((a_occ or {}).get("mismatched_slots") or [])
        fixed_slots = sorted(b_bad - a_bad)
        new_bad = sorted(a_bad - b_bad)
        print(f"  ô lệch        {len(b_bad):>9}  ->  {len(a_bad):>9}")
        if fixed_slots:
            print(f"    hết lệch : {', '.join(fixed_slots[:12])}"
                  f"{' …' if len(fixed_slots) > 12 else ''}")
        if new_bad:
            print(f"    mới lệch : {', '.join(new_bad[:12])}"
                  f"{' …' if len(new_bad) > 12 else ''}")

    # ---- 3. Track ----
    print("\n[3] Track (m1_track_eval.py)")
    b_tr = (before.get("track") or {}).get("per_car") or {}
    a_tr = (after.get("track") or {}).get("per_car") or {}
    if not b_tr and not a_tr:
        print("  n/a")
    else:
        for key, label in (
            ("cars_measured", "xe đo được"),
            ("cars_with_gid", "xe có GID"),
            ("cars_with_breaks", "xe bị đứt"),
            ("breaks_total", "đứt track tổng"),
            ("breaks_median", "trung vị/xe"),
            ("hard_breaks_total", "đứt THẬT"),
            ("hard_breaks_max", "đứt thật max"),
            ("gid_reuse_count", "GID dùng lại"),
        ):
            b, a = b_tr.get(key), a_tr.get(key)
            if b is None and a is None:
                continue
            print(f"  {label:<16} {str(b):>9}  ->  {str(a):>9}")

        b_reuse = {item["gid"]: set(item["cars"]) for item in b_tr.get("gid_reuse") or []}
        a_reuse = {item["gid"]: set(item["cars"]) for item in a_tr.get("gid_reuse") or []}
        gone = sorted(set(b_reuse) - set(a_reuse))
        new = sorted(set(a_reuse) - set(b_reuse))
        if gone:
            print(f"    GID hết dùng chung: {', '.join(gone)}")
        if new:
            print(f"    GID mới dùng chung: {', '.join(new)}")

    # ---- 4. Frame recall ----
    print("\n[4] Frame recall (xe-frame đang chạy)")
    b_rec = (before.get("track") or {}).get("frame_recall") or {}
    a_rec = (after.get("track") or {}).get("frame_recall") or {}
    for cam in ("cam1", "cam2"):
        b, a = b_rec.get(cam) or {}, a_rec.get(cam) or {}
        if not b and not a:
            continue
        print(f"  {cam}: phát hiện {_pct(b.get('detected_ratio')):>8} -> {_pct(a.get('detected_ratio')):>8} "
              f"| có GID {_pct(b.get('gid_ratio')):>8} -> {_pct(a.get('gid_ratio')):>8} "
              f"| GT {b.get('gt_moving_frames')} -> {a.get('gt_moving_frames')}")

    print()
    print("Ghi chú: 'đứt track' TĂNG có thể là ĐÚNG — trước P25 cam2 ghép sai nên nhiều xe không")
    print("được đo (eligible_frames=0). Xem 'xe đo được' và 'GID dùng lại' để đánh giá đúng.")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="So sánh TRƯỚC/SAU một lần sửa TechGAR trên hai thư mục run (chỉ đọc).",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument(
        "--before",
        type=pathlib.Path,
        default=DEFAULT_BEFORE,
        help=f"thư mục run TRƯỚC khi sửa (mặc định {DEFAULT_BEFORE})",
    )
    parser.add_argument("--after", type=pathlib.Path, required=True,
                        help="thư mục run SAU khi sửa")
    parser.add_argument(
        "--gt-run",
        type=pathlib.Path,
        default=None,
        help=f"run gốc chứa GT (mặc định {DEFAULT_GT_RUN})",
    )
    parser.add_argument("--json", type=pathlib.Path, default=None, help="ghi kết quả JSON")
    parser.add_argument(
        "--legacy-before",
        action="store_true",
        help="đo phía before bằng --legacy-no-crop-offset (mô phỏng hành vi trước P25)",
    )
    args = parser.parse_args(argv)

    gt_run = (args.gt_run or DEFAULT_GT_RUN).resolve()

    for name, path in (("--before", args.before), ("--after", args.after)):
        if not path.is_dir():
            print(f"lỗi: {name} không phải thư mục: {path}", file=sys.stderr)
            return 2

    try:
        before = collect("before", args.before.resolve(), gt_run, crop=not args.legacy_before)
        after = collect("after", args.after.resolve(), gt_run, crop=True)
    except FileNotFoundError as error:
        print(f"lỗi: {error}", file=sys.stderr)
        return 2

    print_report(before, after)

    if args.json is not None:
        args.json.parent.mkdir(parents=True, exist_ok=True)
        args.json.write_text(
            json.dumps({"before": before, "after": after}, ensure_ascii=False, indent=1),
            encoding="utf-8",
        )
        print(f"\nđã ghi {args.json}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
