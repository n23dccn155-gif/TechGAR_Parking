"""Compute research-grade evaluation metrics from labeled ground truth.

Inputs per session dir:
* ``manual_tracking.csv``  — produced by ``make_label_template.py``, with
  ``physical_vehicle`` filled in by the labeler.
* ``ground_truth_events.csv`` — verified event milestones (optional; rows
  without ``physical_vehicle_id`` are skipped).
* ``predictions.jsonl`` — replay output (always required).

Metrics (aligned with the core claim "one physical vehicle keeps exactly one
Global ID for its whole stay"):

* ``vehicles`` / ``labeled_obs`` — physical vehicles identified / labeled rows
* ``id_consistency`` — % of physical vehicles mapped to exactly one GID
* ``id_switches`` — count of GID changes for the same physical vehicle
* ``miss_rate`` — labeled observations with no assigned GID
* ``handoff`` — vehicles seen on both cameras; ``handoff_ok`` = same GID on
  both sides
* Event checks (when GT events are labeled): handoff delay vs
  ``preferred_delay_frames``/``max_delay_frames``, predicted slot vs
  ``target_slot_id`` for ``park`` events.

Aggregate table written to ``--out`` (markdown) for the thesis report.

Usage:
    python experiment_test/evaluate_session_metrics.py \
        --session DIR [DIR2 ...] [--out research_metrics.md]
"""
from __future__ import annotations

import argparse
import csv
import json
from collections import defaultdict
from pathlib import Path
from typing import Dict, List, Optional


def read_csv(path: Path) -> List[dict]:
    if not path.exists():
        return []
    with open(path, "r", encoding="utf-8-sig", newline="") as fh:
        return [r for r in csv.DictReader(fh)]


def iter_predictions(session: Path):
    with open(session / "predictions.jsonl", "r", encoding="utf-8-sig") as fh:
        for line in fh:
            line = line.strip()
            if line:
                yield json.loads(line)


def gid_first_frames(session: Path) -> Dict[int, Dict[str, int]]:
    """canonical_gid -> camera -> first frame observed."""
    first: Dict[int, Dict[str, int]] = defaultdict(dict)
    for rec in iter_predictions(session):
        for obs in rec.get("observations", []):
            gid = obs.get("canonical_gid") or obs.get("raw_gid")
            if gid is None:
                continue
            cam = obs["camera_id"]
            g = first.setdefault(int(gid), {})
            g[cam] = min(g.get(cam, rec["frame_idx"]), rec["frame_idx"])
    return first


def gid_parked_slots(session: Path) -> Dict[int, str]:
    slots: Dict[int, str] = {}
    for rec in iter_predictions(session):
        for ep in rec.get("parking_episodes", []):
            if ep.get("state") in ("parked", "occupied", "confirmed"):
                gid = ep.get("global_id")
                if gid is not None and ep.get("slot_id"):
                    slots[int(gid)] = ep["slot_id"]
    return slots


def evaluate_session(session: Path) -> dict:
    rows = read_csv(session / "manual_tracking.csv")
    labeled = [r for r in rows if (r.get("physical_vehicle") or "").strip()]
    pred_first = gid_first_frames(session)
    pred_slots = gid_parked_slots(session)

    # physical vehicle -> ordered (frame, gid) observations
    per_vehicle: Dict[str, List[tuple]] = defaultdict(list)
    misses = 0
    for r in labeled:
        gid = (r.get("ai_assigned_id") or "").strip().lower()
        if gid in ("", "null", "none"):
            misses += 1
            continue
        try:
            frame = int(r.get("frame_idx") or 0)
        except ValueError:
            frame = 0
        per_vehicle[r["physical_vehicle"].strip()].append(
            (frame, r.get("camera_id", ""), gid))

    id_switches = 0
    single_gid = 0
    handoff_total = 0
    handoff_ok = 0
    vehicle_gid: Dict[str, int] = {}
    for veh, obs in per_vehicle.items():
        obs.sort()
        gids_seen = [g for _, _, g in obs]
        uniq = set(gids_seen)
        vehicle_gid[veh] = int(uniq.pop()) if len(uniq) == 1 else -1
        if len(set(gids_seen)) == 1:
            single_gid += 1
        else:
            for a, b in zip(gids_seen, gids_seen[1:]):
                if a != b:
                    id_switches += 1
        cams = {c for _, c, _ in obs}
        if len(cams) > 1:
            handoff_total += 1
            if len(uniq | {g for _, _, g in obs}) == 1 or len(set(gids_seen)) == 1:
                handoff_ok += 1

    # event-level verification
    events = [r for r in read_csv(session / "ground_truth_events.csv")
              if (r.get("physical_vehicle_id") or "").strip()]
    ev_checked = ev_ok = 0
    ev_notes: List[str] = []
    for ev in events:
        veh = ev["physical_vehicle_id"].strip()
        gid = vehicle_gid.get(veh)
        etype = (ev.get("event_type") or "").strip()
        if gid is None or gid < 0:
            ev_notes.append(f"{ev.get('event_id')}: vehicle {veh} unmapped")
            continue
        ev_checked += 1
        ok = True
        note = ""
        if etype == "camera_handoff":
            tgt_cam = (ev.get("target_camera") or "").strip()
            try:
                gt_frame = int(ev.get("end_frame") or ev.get("start_frame"))
            except (TypeError, ValueError):
                gt_frame = None
            pred_frame = pred_first.get(gid, {}).get(tgt_cam)
            if pred_frame is None:
                ok = False
                note = f"gid {gid} never on {tgt_cam}"
            elif gt_frame is not None:
                delay = pred_frame - gt_frame
                try:
                    maxd = int(ev.get("max_delay_frames") or 10**9)
                except ValueError:
                    maxd = 10**9
                note = f"handoff delay {delay}f"
                if delay > maxd:
                    ok = False
                    note += f" > max {maxd}"
        elif etype == "park":
            want = (ev.get("target_slot_id") or "").strip()
            got = pred_slots.get(gid, "")
            if want and got != want:
                ok = False
                note = f"slot {got or 'none'} != gt {want}"
        if ok:
            ev_ok += 1
        elif note:
            ev_notes.append(f"{ev.get('event_id')}({etype}): {note}")

    n_veh = len(per_vehicle)
    return {
        "session": session.name,
        "vehicles": n_veh,
        "labeled_obs": len(labeled),
        "id_consistency": (single_gid / n_veh) if n_veh else None,
        "id_switches": id_switches,
        "miss_rate": (misses / len(labeled)) if labeled else None,
        "handoff": handoff_total,
        "handoff_ok": handoff_ok,
        "events_checked": ev_checked,
        "events_ok": ev_ok,
        "event_notes": ev_notes,
    }


def fmt_pct(v: Optional[float]) -> str:
    return "-" if v is None else f"{v * 100:.1f}%"


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--session", nargs="+", required=True, type=Path)
    ap.add_argument("--out", type=Path, default=None,
                    help="markdown summary path")
    args = ap.parse_args(argv)

    results = []
    for s in args.session:
        if not (s / "predictions.jsonl").exists():
            print(f"[-] skip {s}: no predictions.jsonl")
            continue
        results.append(evaluate_session(s))

    lines = [
        "| session | vehicles | labeled obs | ID consistency | IDSW | miss rate | handoff ok | events ok |",
        "|---|---|---|---|---|---|---|---|",
    ]
    tot_v = tot_sw = tot_ho = tot_ho_ok = tot_ev = tot_ev_ok = 0
    for r in results:
        lines.append(
            f"| {r['session']} | {r['vehicles']} | {r['labeled_obs']} | "
            f"{fmt_pct(r['id_consistency'])} | {r['id_switches']} | "
            f"{fmt_pct(r['miss_rate'])} | {r['handoff_ok']}/{r['handoff']} | "
            f"{r['events_ok']}/{r['events_checked']} |")
        tot_v += r["vehicles"]; tot_sw += r["id_switches"]
        tot_ho += r["handoff"]; tot_ho_ok += r["handoff_ok"]
        tot_ev += r["events_checked"]; tot_ev_ok += r["events_ok"]
    if results:
        single_all = sum(
            round((r["id_consistency"] or 0) * r["vehicles"]) for r in results)
        lines.append(
            f"| **TOTAL** | {tot_v} | — | "
            f"{fmt_pct(single_all / tot_v if tot_v else None)} | {tot_sw} | — | "
            f"{tot_ho_ok}/{tot_ho} | {tot_ev_ok}/{tot_ev} |")
    table = "\n".join(lines)
    print("\n" + table + "\n")
    for r in results:
        for n in r["event_notes"]:
            print(f"  [!] {r['session']}: {n}")
    if args.out:
        args.out.write_text(table + "\n", encoding="utf-8")
        print(f"[ok] wrote {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
