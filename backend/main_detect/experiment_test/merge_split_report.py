#!/usr/bin/env python3
"""merge_split_report.py — P0 baseline: đo tần suất & kết cục merge/split identity.

CHỈ ĐỌC dữ liệu đã ghi (predictions.jsonl + ground_truth_identity.csv +
session_info.json). Không chạy tracker, không sửa gì.

Cách dùng:
    python merge_split_report.py output\\session_thai6 [output\\session_thai7 ...]
    python merge_split_report.py output\\session_* --json out.json

Số liệu được phân loại rõ:
  [dòng]   = số dòng event trong predictions.jsonl (event-level, có thể lặp mỗi frame)
  [episode]= group-episode tái cấu trúc (union member-set có overlap thời gian)
  [GT]     = suy ra từ ground_truth_identity.csv bằng nearest-anchor (heuristic,
             threshold --match-px; không phải ground-truth assignment chính thức)
"""
from __future__ import annotations

import argparse
import csv
import json
import math
import os
import statistics
import sys
from collections import Counter, defaultdict

GROUP_EVENTS = ("occlusion_group_opened", "occlusion_group_recovered", "occlusion_group_expired")
RELATED = (
    "split_assignment_deferred",
    "association_recovery_pending",
    "new_local_id_deferred_unresolved_merge",
    "merged_detection_frozen",
    "watershed_partition_provisional",
    "watershed_partition_validated",
    "local_track_lost",
    "local_track_expired",
)
TERMINAL = ("occlusion_group_expired", "occlusion_group_recovered")


def load_frames(pred_path):
    for line in open(pred_path, encoding="utf-8", errors="replace"):
        line = line.strip()
        if not line:
            continue
        try:
            yield json.loads(line)
        except json.JSONDecodeError:
            continue


def canonical_source(session_name):
    """Map session dir -> nguồn video gốc (dedup replay cùng nguồn).

    reidfix_*_session_X / reidfix_*_X và session_X là cùng 1 video, chỉ khác
    build tracker — KHÔNG được cộng gộp khi suy ra tần suất merge thật.
    """
    n = session_name
    for pre in ("reidfix_r1b_session_", "reidfix_r1_session_", "reidfix_r0b_session_",
                "reidfix_r0_session_", "reidfix_r1b_", "reidfix_r1_", "reidfix_r0b_",
                "reidfix_r0_", "runtime_session_", "runtime_"):
        if n.startswith(pre):
            n = n[len(pre):]
            break
    if not n.startswith("session_"):
        n = "session_" + n if n != "bt" else "session_bt"
    return n


def build_episodes(events):
    """Union các event occlusion_group_* thành episode (PROXY — không phải bằng
    chứng physical merge; member-set chain có thể nối nhiều merge khác nhau).

    Episode = tập member gộp dần: event mới chạm ≥1 member của episode đang mở
    ⇒ gộp. Episode kết thúc tại event cuối cùng liên quan. Trả (episodes,
    n_set_keys)."""
    eps = []  # dict: members set, first_frame, last_frame, counts, last_terminal
    seen_sets = set()
    for e in sorted(events, key=lambda x: x["frame_idx"]):
        ids = e.get("details", {}).get("local_track_ids") or []
        ids = tuple(sorted(ids))
        if not ids:
            continue
        seen_sets.add(ids)
        M = set(ids)
        hit = None
        for ep in eps:
            if ep["last_frame"] >= e["frame_idx"] - 1 and ep["members"] & M:
                hit = ep
                break
        if hit is None:
            hit = {"members": set(), "first_frame": e["frame_idx"], "last_frame": 0,
                   "counts": Counter(), "last_terminal": None, "sets": set()}
            eps.append(hit)
        hit["members"] |= M
        hit["first_frame"] = min(hit["first_frame"], e["frame_idx"])
        hit["last_frame"] = max(hit["last_frame"], e["frame_idx"])
        hit["counts"][e["event_type"]] += 1
        hit["sets"].add(ids)
        hit["camera"] = e.get("camera_id")
        if e["event_type"] in TERMINAL:
            hit["last_terminal"] = e["event_type"]
    for ep in eps:
        # Phân loại theo semantics đã verify (occlusion_guard og:61,90,119-120,131,220):
        #  - opened chỉ phát khi activate() 2-member watch-group → active
        #  - covering_group ≥3 tạo active trực tiếp, KHÔNG opened; ≥3 không-thể recover (valid yêu cầu len==2)
        #  - expired bắn cả cho watch-group member-biến-mất (không phải merge)
        has_ge3 = any(len(s) >= 3 for s in ep["sets"])
        has_open = ep["counts"]["occlusion_group_opened"] > 0
        if has_ge3:
            ep["kind"] = "ge3-covering"   # merge thật (>=3), theo thiết kế chỉ-expire
        elif has_open:
            ep["kind"] = "active-2"       # 2-member đã activate → merge thật
        else:
            ep["kind"] = "implicit-2"     # UNKNOWN: watch-group hết-vai hoặc thiếu lịch sử
    return eps, len(seen_sets)


def gt_metrics(pred_path, gt_path, match_px):
    """Nearest-anchor obs↔GT mỗi frame×camera → switch/fragment/lost (heuristic)."""
    gt = defaultdict(dict)  # (frame,cam) -> {phys_id: (x,y)}
    with open(gt_path, encoding="utf-8-sig", newline="") as f:
        for row in csv.DictReader(f):
            try:
                fr = int(row["frame_idx"])
            except (ValueError, KeyError):
                continue
            gt[(fr, row["camera_id"])][row["physical_vehicle_id"]] = (
                float(row["anchor_x"]), float(row["anchor_y"]))
    if not gt:
        return None

    last_id = {}            # phys -> last local_track_id matched
    id_seq = defaultdict(list)   # phys -> ordered distinct local ids
    gt_frames = Counter()   # phys -> số frame GT hiện diện
    lost_frames = Counter() # phys -> số frame không obs nào match
    switches = 0
    matched_local = set()

    for d in load_frames(pred_path):
        fr = d["frame_idx"]
        obs = [o for o in (d.get("observations") or []) if o.get("anchor_pixel")]
        by_cam = defaultdict(list)
        for o in obs:
            by_cam[o["camera_id"]].append(o)
        for (gfr, cam), vehs in gt.items():
            if gfr != fr:
                continue
            for phys, (gx, gy) in vehs.items():
                gt_frames[phys] += 1
                best, bestd = None, match_px
                for o in by_cam.get(cam, []):
                    a = o["anchor_pixel"]
                    dist = math.hypot(a["x"] - gx, a["y"] - gy)
                    if dist < bestd:
                        best, bestd = o, dist
                if best is None:
                    lost_frames[phys] += 1
                    continue
                lid = best.get("local_track_id")
                matched_local.add((cam, lid))
                if lid is not None:
                    if phys in last_id and last_id[phys] != lid:
                        switches += 1
                    last_id[phys] = lid
                    if not id_seq[phys] or id_seq[phys][-1] != lid:
                        id_seq[phys].append(lid)

    all_local = set()
    for d in load_frames(pred_path):
        for o in d.get("observations") or []:
            all_local.add((o["camera_id"], o.get("local_track_id")))
    frag = {p: len(seq) for p, seq in id_seq.items() if len(seq) > 1}
    lost_tot = sum(lost_frames.values()); gt_tot = sum(gt_frames.values())
    return {
        "gt_vehicles": len(gt_frames),
        "gt_frames": gt_tot,
        "id_switches": switches,
        "fragmented_vehicles": len(frag),
        "local_ids_per_fragmented": {p: s for p, s in frag.items()},
        "unmatched_local_ids": len(all_local - matched_local),
        "lost_frame_ratio": round(lost_tot / gt_tot, 4) if gt_tot else None,
        "fully_lost_vehicles": sum(1 for p in gt_frames if lost_frames[p] == gt_frames[p]),
    }


def analyze_session(sdir, match_px):
    pred = os.path.join(sdir, "predictions.jsonl")
    out = {"session": os.path.basename(sdir), "frames": 0, "fps": None}
    info_p = os.path.join(sdir, "session_info.json")
    if os.path.exists(info_p):
        try:
            out["fps"] = json.load(open(info_p, encoding="utf-8")).get("processing_fps")
        except Exception:
            pass
    if not os.path.exists(pred):
        out["error"] = "no predictions.jsonl"
        return out

    line_counts = Counter()
    group_events = []
    defer_costs, defer_margins = [], []
    pending_tracks = set()
    deferred_tracks = set()
    lost_frames_idx = defaultdict(list)  # lid -> frames of lost/expired events
    birth_veto = []
    first_seen = {}                      # (cam, lid) -> first frame in observations

    for d in load_frames(pred):
        out["frames"] += 1
        # first-seen local id per camera (proxy new-ID-sau-expiry)
        for o in d.get("observations") or []:
            lid = o.get("local_track_id"); cam = o.get("camera_id")
            if lid is not None and (cam, lid) not in first_seen:
                first_seen[(cam, lid)] = d["frame_idx"]
        for e in d.get("identity_events") or []:
            t = e.get("event_type")
            line_counts[t] += 1
            det = e.get("details", {})
            if t in GROUP_EVENTS:
                group_events.append(e)
            elif t == "split_assignment_deferred":
                deferred_tracks.add(det.get("local_track_id"))
                if "selected_cost" in det:
                    defer_costs.append(det["selected_cost"])
                    defer_margins.append(det.get("required_margin"))
            elif t == "association_recovery_pending":
                pending_tracks.add(det.get("local_track_id"))
            elif t == "new_local_id_deferred_unresolved_merge":
                birth_veto.append(e)
            elif t in ("local_track_lost", "local_track_expired"):
                lid = det.get("local_track_id") or det.get("track_id")
                if lid is not None:
                    lost_frames_idx[lid].append(e["frame_idx"])

    out["event_line_counts"] = {k: line_counts.get(k, 0) for k in GROUP_EVENTS + RELATED if line_counts.get(k)}

    eps, n_sets = build_episodes(group_events)
    # [set] per-member-set outcome — granular nhất, không chain
    set_hist = defaultdict(lambda: {"open": 0, "terminal": [], "frames": []})
    for e in sorted(group_events, key=lambda x: x["frame_idx"]):
        ids = tuple(sorted(e.get("details", {}).get("local_track_ids") or []))
        if not ids:
            continue
        h = set_hist[ids]
        h["frames"].append(e["frame_idx"])
        if e["event_type"] == "occlusion_group_opened":
            h["open"] += 1
        else:
            h["terminal"].append(e["event_type"])
    out["set_rows"] = {
        "distinct_sets": len(set_hist),
        "sets_with_opened": sum(1 for h in set_hist.values() if h["open"]),
        "sets_terminal_only": sum(1 for h in set_hist.values() if not h["open"]),
        "sets_last_expired": sum(1 for h in set_hist.values() if h["terminal"] and h["terminal"][-1] == "occlusion_group_expired"),
        "sets_last_recovered": sum(1 for h in set_hist.values() if h["terminal"] and h["terminal"][-1] == "occlusion_group_recovered"),
        "sets_open_no_terminal": sum(1 for h in set_hist.values() if h["open"] and not h["terminal"]),
        "terminal_rows_total": sum(len(h["terminal"]) for h in set_hist.values()),
        "terminal_rows_repeated": sum(1 for h in set_hist.values() if len(h["terminal"]) > 1),
    }
    rows = []
    NEWID_WIN = 45  # ~6-9s @fps 5-8 — weak proxy "new local id sau khi episode kết thúc"
    for ep in eps:
        member_lost = [m for m in ep["members"]
                       if any(ep["first_frame"] <= f <= ep["last_frame"] for f in lost_frames_idx.get(m, []))]
        dur_f = ep["last_frame"] - ep["first_frame"]
        T = ep["last_frame"]; cam = ep.get("camera")
        n_new = sum(1 for (c, lid), f0 in first_seen.items()
                    if c == cam and T < f0 <= T + NEWID_WIN) if cam else None
        rows.append({
            "members": sorted(ep["members"]),
            "n_sets": len(ep["sets"]),
            "kind": ep["kind"],
            "has_opened": ep["counts"]["occlusion_group_opened"] > 0,
            "camera": cam,
            "open_frame": ep["first_frame"],
            "end_frame": ep["last_frame"],
            "duration_frames": dur_f,
            "duration_s": round(dur_f / out["fps"], 1) if out["fps"] else None,
            "opened": ep["counts"]["occlusion_group_opened"],
            "expired": ep["counts"]["occlusion_group_expired"],
            "recovered": ep["counts"]["occlusion_group_recovered"],
            "outcome": ep["last_terminal"] or "none",
            "member_lost_during": member_lost,
            "new_ids_45f_after": n_new,
        })
    out["episodes"] = rows
    out["n_episodes"] = len(rows)
    out["n_member_sets"] = n_sets
    out["outcome_counts"] = dict(Counter(r["outcome"] for r in rows))
    out["kind_counts"] = dict(Counter(r["kind"] for r in rows))
    out["kind_x_outcome"] = {k: dict(Counter(r["outcome"] for r in rows if r["kind"] == k))
                             for k in out["kind_counts"]}
    out["implicit_episodes"] = sum(1 for r in rows if r["kind"] == "implicit-2")
    out["episodes_member_lost"] = sum(1 for r in rows if r["member_lost_during"])
    out["eps_with_new_id_after"] = sum(1 for r in rows if r["new_ids_45f_after"])
    out["source"] = canonical_source(out["session"])
    out["birth_veto_events"] = len(birth_veto)
    out["birth_veto_pairs"] = len({tuple(sorted(e["details"].get("local_track_ids", []))) for e in birth_veto})
    out["split_deferred_events"] = line_counts.get("split_assignment_deferred", 0)
    out["split_deferred_tracks"] = len(deferred_tracks)
    if defer_costs:
        out["split_defer_cost_median"] = round(statistics.median(defer_costs), 3)
        out["split_defer_margin_median"] = round(statistics.median(m for m in defer_margins if m), 3)
    out["recovery_pending_events"] = line_counts.get("association_recovery_pending", 0)
    out["recovery_pending_tracks"] = len(pending_tracks)

    gt_p = os.path.join(sdir, "ground_truth_identity.csv")
    if os.path.exists(gt_p):
        with open(gt_p, encoding="utf-8-sig") as f:
            gt_rows = sum(1 for _ in f) - 1
        out["gt"] = gt_metrics(pred, gt_p, match_px) if gt_rows > 0 else {"note": "N/A — csv header-only, 0 rows"}
    else:
        out["gt"] = {"note": "N/A — no ground_truth_identity.csv"}
    return out


def fmt_session(r):
    L = [f"## {r['session']}  ({r.get('frames',0)} frames, fps={r.get('fps')})"]
    if r.get("error"):
        L.append(f"  ERROR: {r['error']}")
        return "\n".join(L)
    L.append("  event line-counts [dòng]: " + json.dumps(r["event_line_counts"], ensure_ascii=False))
    sr = r.get("set_rows", {})
    L.append(f"  member-sets [set]: {sr.get('distinct_sets')} "
             f"(opened={sr.get('sets_with_opened')}, terminal-only={sr.get('sets_terminal_only')}, "
             f"open-no-terminal={sr.get('sets_open_no_terminal')}) "
             f"| last-terminal: exp={sr.get('sets_last_expired')} rec={sr.get('sets_last_recovered')} "
             f"| terminal rows={sr.get('terminal_rows_total')} (repeat={sr.get('terminal_rows_repeated')})")
    L.append(f"  episodes [ep, proxy]: {r['n_episodes']} (member-sets: {r['n_member_sets']}, "
             f"kind={json.dumps(r.get('kind_counts'))}, member-lost-during: {r['episodes_member_lost']}, "
             f"new-id≤45f-after: {r.get('eps_with_new_id_after')})")
    L.append(f"  outcome [ep]: {json.dumps(r['outcome_counts'])} "
             f"| theo kind: {json.dumps(r.get('kind_x_outcome'))}")
    L.append(f"  split_deferred: {r['split_deferred_events']} ev / {r['split_deferred_tracks']} tracks"
             f" (cost med={r.get('split_defer_cost_median')}, margin med={r.get('split_defer_margin_median')})")
    L.append(f"  recovery_pending: {r['recovery_pending_events']} ev / {r['recovery_pending_tracks']} tracks"
             f" | birth_veto: {r['birth_veto_events']} ev / {r['birth_veto_pairs']} pairs")
    if r.get("gt"):
        g = r["gt"]
        if "gt_vehicles" in g:
            L.append(f"  [GT] vehicles={g['gt_vehicles']} gt_frames={g['gt_frames']} "
                     f"id_switches={g['id_switches']} fragmented={g['fragmented_vehicles']} "
                     f"unmatched_local={g['unmatched_local_ids']} "
                     f"lost_ratio={g['lost_frame_ratio']} fully_lost={g['fully_lost_vehicles']}")
        else:
            L.append(f"  [GT] {g['note']}")
    for row in sorted(r["episodes"], key=lambda x: -x["duration_frames"])[:10]:
        L.append(f"    ep {row['members']} [{row['kind']}] f{row['open_frame']}→{row['end_frame']} "
                 f"({row['duration_frames']}f/{row['duration_s']}s) "
                 f"open={row['opened']} exp={row['expired']} rec={row['recovered']} "
                 f"→{row['outcome']}{' IMPLICIT' if row['kind']=='implicit-2' else ''}"
                 f" newid45={row['new_ids_45f_after']}"
                 f"{' lost:' + str(row['member_lost_during']) if row['member_lost_during'] else ''}")
    return "\n".join(L)


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("sessions", nargs="+")
    ap.add_argument("--match-px", type=float, default=60.0,
                    help="ngưỡng px nearest-anchor obs↔GT (heuristic)")
    ap.add_argument("--json", dest="json_out")
    args = ap.parse_args()

    results = [analyze_session(s, args.match_px) for s in args.sessions]
    for r in results:
        print(fmt_session(r))
        print()
    # dedup: nhiều session-dir cùng 1 video nguồn (reidfix_* = replay của session_*)
    canon = {}
    for r in results:
        canon.setdefault(r.get("source"), []).append(r)
    print("== TỔNG (mọi session-dir) ==")
    agg = Counter()
    for r in results:
        for k, v in (r.get("outcome_counts") or {}).items():
            agg[k] += v
    print("episodes:", sum(r.get("n_episodes", 0) for r in results), "| outcome:", dict(agg))
    print("== TỔNG dedup nguồn-video (1 dir đầu mỗi source) ==")
    agg2 = Counter(); n_ep2 = 0; srcs = 0; kinds = Counter(); ko = defaultdict(Counter)
    for src, rs in canon.items():
        best = next((r for r in rs if r["session"].startswith("session_") or r["session"].startswith("runtime_session")), rs[0])
        n_ep2 += best.get("n_episodes", 0); srcs += 1
        for k, v in (best.get("outcome_counts") or {}).items():
            agg2[k] += v
        for k, v in (best.get("kind_counts") or {}).items():
            kinds[k] += v
        for k, oc in (best.get("kind_x_outcome") or {}).items():
            ko[k].update(oc)
    print(f"sources: {srcs} | episodes: {n_ep2} | outcome:", dict(agg2))
    print("kinds:", dict(kinds))
    for k, oc in ko.items():
        print(f"  {k}: {dict(oc)}")
    if args.json_out:
        with open(args.json_out, "w", encoding="utf-8") as f:
            json.dump(results, f, ensure_ascii=False, indent=1)


if __name__ == "__main__":
    sys.exit(main())
