"""V3 — Auto-scan 100% frames of a session's predictions.jsonl and flag suspect windows.

READ-ONLY: never writes into the session dir. Emits flags as JSONL + a summary.
Flags are SUSPECTS for human visual check (V4) — they are NOT confirmed errors.

Covers MEGAPLAN §3 groups 1-7. A `coverage` block in the summary states, per
group, CHECKED / NOT_AVAILABLE — a group is never claimed checked when its
source field/file is absent.

Usage (venv python):
    python experiment_test/verify/scan_frames.py \
        --session experiment_test/output/session_thai6 \
        --roi config/roi_mask_cam1.json config/roi_mask_cam2.json \
        --out .analysis/verify-replay/flags/thai6.jsonl

Thresholds are named constants below so results are reproducible.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from collections import defaultdict
from pathlib import Path

import cv2
import numpy as np

# ---------------- named thresholds (reproduce by reading these) ----------------
MAX_SKEW_MS = 150.0              # camera_skew_ms flag
MAX_TIME_GAP_S = 1.0             # wall/capture gap between consecutive frames
JUMP_PX_PER_FRAME = 120.0        # same-track bbox-centre displacement per frame (visible)
BBOX_AREA_JUMP_RATIO = 2.5       # same-track bbox area x/>threshold in one step
DUPLICATE_IOU = 0.55             # two live tracks same cam overlapping this much
DUPLICATE_MIN_FRAMES = 3         # consecutive frames of heavy overlap before flag
SHORT_LIFE_FRAMES = 3            # track visible <= this many frames => noise suspect
GHOST_PRED_FRAMES = 120          # frames of prediction-only (no detection) => ghost candidate
GID_JUMP_PX = 250.0              # same canonical_gid on two positions same frame, same cam
GID_FLAP_MIN = 3                 # gid changes per local id => flap note
NEW_NEAR_PX = 150.0              # new lid/gid appears within this px of a vanished one
NEW_WITHIN_FRAMES = 40           # ...within this many frames
SLOT_FLICKER_MIN = 6             # occupied state flips within window
SLOT_FLICKER_WINDOW = 150        # frames
SLOT_MISMATCH_MIN_FRAMES = 60    # occupied=True but tracking_occupied=False persist
LOG_ERR_RE = re.compile(r"error|traceback|critical|exception", re.I)
LOG_WARN_RE = re.compile(r"warn", re.I)
WINDOW_PAD = 15                  # §V4: review window = flag ± this many frames
# flag type -> §3 review group (for the coverage matrix / V4-V5 filtering)
FLAG_GROUP = {
    "DATA_INTEGRITY": "g1_data_replay",
    "REPLAY_FAILURE": "g1_data_replay",   # log-sourced ones get g7 via add(group=)
    "TRACK_JUMP": "g2_local_track", "BBOX_JUMP": "g2_local_track",
    "DUPLICATE_TRACK": "g2_local_track", "ROI_MISMATCH": "g2_local_track",
    "TRACK_LOST_EARLY": "g2_local_track", "ID_FRAGMENT/NEW_ID": "g2_local_track",
    "GID_SWITCH": "g3_global_id", "GID_CONFLICT": "g3_global_id",
    "GID_NEW_LINEAGE_LOSS": "g3_global_id", "GHOST_TRACK": "g3_global_id",
    "OTHER": "g3_global_id",
    "HANDOFF_ERROR": "g4_cross_camera",
    "SLOT_STATE_ERROR": "g5_slots", "SLOT_BINDING_ERROR": "g5_slots",
    "EVENT_INCONSISTENT": "g6_occlusion_windows",
}

REVIEW_EVENT_TYPES = {           # V3.6 occlusion/merge windows for eyeball
    "occlusion_group_opened", "occlusion_group_recovered", "occlusion_group_expired",
    "split_assignment_deferred", "association_recovery_pending",
    "new_local_id_deferred_unresolved_merge", "merged_detection_frozen",
    "oversized_detection_frozen", "association_deferred_competing_tracks",
    "watershed_partition_provisional",
}
HANDOFF_EVENT_PREFIXES = ("handoff", "gid_", "global_id")


def _centre(b):
    return (b[0] + b[2] / 2.0, b[1] + b[3] / 2.0)


def _iou(a, b):
    ax, ay, aw, ah = a
    bx, by, bw, bh = b
    ix = max(0.0, min(ax + aw, bx + bw) - max(ax, bx))
    iy = max(0.0, min(ay + ah, by + bh) - max(ay, by))
    inter = ix * iy
    union = aw * ah + bw * bh - inter
    return inter / union if union > 0 else 0.0


def _load_roi(path: Path):
    data = json.loads(Path(path).read_text(encoding="utf-8"))
    pts = data["polygon"]
    return np.array([[p["x"], p["y"]] for p in pts], dtype=np.float64)


def _in_roi(poly, x, y) -> bool:
    return cv2.pointPolygonTest(poly.astype(np.float32), (float(x), float(y)), False) >= 0


def _video_frame_count(path: Path):
    """Metadata frame count — no decode. None if unavailable."""
    if not path.exists():
        return None
    cap = cv2.VideoCapture(str(path))
    if not cap.isOpened():
        return None
    n = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    cap.release()
    return n if n > 0 else None


class Flagger:
    def __init__(self):
        self.flags = []
        self.counts = defaultdict(int)
        self.base = 0               # frame_idx base, set once by scan()

    def add(self, kind, cam, f0, f1, measure, threshold, note="", group=None):
        self.counts[kind] += 1
        self.flags.append({
            "type": kind, "cam": cam, "frame_from": f0, "frame_to": f1,
            "measure": round(float(measure), 3) if isinstance(measure, (int, float)) else measure,
            "threshold": threshold, "note": note,
            "group": group or FLAG_GROUP.get(kind, "g6_occlusion_windows"),
        })

    def windows(self, pad=WINDOW_PAD):
        """Merge flags into eyeball windows per §V4: each flag expanded ±pad,
        overlapping/touching intervals merged. Ranges are emitted 1-based
        (raw-video frame index = predictions frame_idx + 1) so make_sheets.py
        --windows-file consumes them directly."""
        per_cam = defaultdict(list)
        for f_ in self.flags:
            if not isinstance(f_["frame_from"], int):
                continue
            # REPLAY_FAILURE/DATA_INTEGRITY at cam "-" carry line numbers or
            # whole-session spans — not eyeball windows; review them from the
            # flag list directly.
            if f_["type"] == "REPLAY_FAILURE":
                continue
            if f_["frame_to"] - f_["frame_from"] > 500:
                continue
            per_cam[f_["cam"]].append((f_["frame_from"], f_["frame_to"], f_["type"]))
        out = []
        for cam, spans in per_cam.items():
            spans.sort()
            cur = None
            for f0, f1, t in spans:
                lo, hi = f0 - pad, f1 + pad
                if cur is None:
                    cur = [lo, hi, {t}]
                elif lo <= cur[1] + 1:
                    cur[1] = max(cur[1], hi)
                    cur[2].add(t)
                else:
                    out.append((cam, cur))
                    cur = [lo, hi, {t}]
            if cur is not None:
                out.append((cam, cur))
        # frame_idx base: original sessions are 0-based, verify_cur replay
        # records are 1-based — detected via self.base. Output is always
        # 1-based raw-video frame index for make_sheets.py --windows-file.
        shift = 1 if self.base == 0 else 0
        return [{"type": "WINDOW", "cam": cam,
                 "frame_from": max(1, lo + shift), "frame_to": hi + shift,
                 "measure": ",".join(sorted(types)), "threshold": pad,
                 "note": "1-based raw frames"} for cam, (lo, hi, types) in out]


def scan(session: Path, roi_paths, out_path: Path | None):
    pred_path = session / "predictions.jsonl"
    flag = Flagger()
    rois = {}
    if roi_paths:
        for i, p in enumerate(roi_paths, 1):
            rois[f"cam{i}"] = _load_roi(p)

    # field-presence trackers -> coverage matrix (never claim unchecked)
    seen = defaultdict(bool)   # field-name presence across all records

    # per-frame state
    prev_frame_idx = None
    prev_ts_s = None
    first_seen = {}        # (cam,lid) -> frame_idx
    last_bbox = {}         # (cam,lid) -> bbox of last VISIBLE obs
    last_centre = {}       # (cam,lid) -> centre of last VISIBLE obs
    last_visible_fx = {}   # (cam,lid) -> frame last visible
    total_visible = defaultdict(int)
    invisible_streak = defaultdict(int)
    pred_only_streak = defaultdict(int)   # consecutive frames kind != detection
    pred_still_streak = defaultdict(int)  # prediction-only AND near-still
    dup_streak = defaultdict(int)   # (cam, pairkey)
    gid_hist = defaultdict(int)     # (cam,lid) -> gid change count
    gid_last = {}                   # (cam,lid) -> gid
    gid_positions = {}              # (cam,gid) -> (centre,frame) last seen
    gid_first_seen = {}             # (cam,gid) -> first frame ever seen
    gid_missing_since = {}          # (cam,gid) -> frame gid first noticed absent
    gid_lost_pos = {}               # (cam,gid) -> last centre before disappearing
    gid_flagged_pairs = set()       # (new_gid, lost_gid) already flagged
    lid_missing_since = {}          # (cam,lid) -> frame lid first noticed absent
    lid_lost_pos = {}               # (cam,lid) -> last centre before disappearing
    lid_flagged_pairs = set()
    frag_cands = []                 # (cam,new_lid,lost_lid,lost_f,fx,d) post-filtered at EOF
    gid_frag_cands = []             # (cam,new_gid,lost_cam,lost_gid,lost_f,fx,d) same
    handoff_cands = []              # same, cross-camera
    slot_state = {}                 # (cam,slot) -> list[(occupied,frame)]
    slot_mismatch = defaultdict(int)
    slot_flip_counts = defaultdict(list)
    n_lines = 0
    seen_frames = set()
    min_fx = max_fx = None
    n_obs = 0
    skew_max = 0.0
    event_windows = defaultdict(list)

    with pred_path.open("r", encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if not line:
                continue
            n_lines += 1
            try:
                rec = json.loads(line)
            except json.JSONDecodeError:
                flag.add("DATA_INTEGRITY", "-", n_lines, n_lines, "json_decode", "parse", f"line {n_lines}")
                continue
            fx = rec.get("frame_idx")
            if fx is None:
                continue
            if fx in seen_frames:
                flag.add("DATA_INTEGRITY", "-", fx, fx, 1, "unique", "duplicate frame_idx row")
            seen_frames.add(fx)
            if len(seen_frames) == 1:
                flag.base = 0 if fx == 0 else 1
            min_fx = fx if min_fx is None else min(min_fx, fx)
            max_fx = fx if max_fx is None else max(max_fx, fx)

            # ---- group 1: data/replay integrity ----
            if prev_frame_idx is not None and fx != prev_frame_idx + 1:
                flag.add("DATA_INTEGRITY", "-", prev_frame_idx, fx, fx - prev_frame_idx, "idx+1",
                         "frame_idx gap/jump")
            prev_frame_idx = fx
            cap_ns = rec.get("capture_unix_ns")
            if cap_ns is not None:
                seen["capture_unix_ns"] = True
                ts_s = cap_ns / 1e9
                if prev_ts_s is not None:
                    if ts_s < prev_ts_s:
                        flag.add("DATA_INTEGRITY", "-", fx - 1, fx, ts_s - prev_ts_s, "ts>=0",
                                 "timestamp regression")
                    elif ts_s - prev_ts_s > MAX_TIME_GAP_S:
                        flag.add("DATA_INTEGRITY", "-", fx - 1, fx, ts_s - prev_ts_s,
                                 MAX_TIME_GAP_S, "capture gap")
                prev_ts_s = ts_s
            skew = rec.get("camera_skew_ms")
            if skew is not None:
                seen["camera_skew_ms"] = True
                skew_max = max(skew_max, abs(skew))
                if abs(skew) > MAX_SKEW_MS:
                    flag.add("DATA_INTEGRITY", "-", fx, fx, abs(skew), MAX_SKEW_MS,
                             "camera_skew_ms large")

            # ---- group 6: occlusion/merge event windows ----
            if rec.get("identity_events") is not None:
                seen["identity_events"] = True
            for ev in rec.get("identity_events") or []:
                et = ev.get("event_type", "")
                if et in REVIEW_EVENT_TYPES:
                    event_windows[et].append(fx)
                if et.startswith(HANDOFF_EVENT_PREFIXES):
                    event_windows[et.split(":")[0]].append(fx)

            cur_obs = defaultdict(dict)
            for ob in rec.get("observations") or []:
                cam = ob.get("camera_id")
                lid = ob.get("local_track_id")
                gid = ob.get("canonical_gid") or ob.get("raw_gid")
                if cam is None:
                    continue
                seen[f"obs_{cam}"] = True
                if gid is not None:
                    seen["gid"] = True
                n_obs += 1
                if lid is None:
                    # gid without a local track => ghost-gid candidate (group 3)
                    if gid is not None:
                        flag.add("OTHER", cam, fx, fx, 0, "lid present",
                                 f"gid {gid} without local track (ghost-gid candidate)")
                    continue
                cur_obs[cam][lid] = ob
                key = (cam, lid)
                is_new_lid = key not in first_seen
                if is_new_lid:
                    first_seen[key] = fx
                box = ob.get("bbox")
                inv = int(ob.get("invisible_count") or 0)
                kind = ob.get("observation_kind")
                detected = inv == 0 and kind == "detection" and box is not None

                # group 3: gid bookkeeping — every lid gid change is GID_SWITCH
                if gid is not None:
                    gkey = (cam, gid)
                    prev_gid = gid_last.get(key)
                    if prev_gid is not None and prev_gid != gid:
                        gid_hist[key] += 1
                        n_chg = gid_hist[key]
                        flap = n_chg >= GID_FLAP_MIN
                        flag.add("GID_SWITCH", cam, first_seen[key], fx, n_chg,
                                 GID_FLAP_MIN, f"lid {lid} gid {prev_gid}->{gid}" + (" FLAP" if flap else ""))
                    gid_last[key] = gid
                    # same gid, two places, same frame, same cam?
                    prev_pos = gid_positions.get(gkey)
                    c = _centre(box) if box else None
                    if prev_pos is not None and prev_pos[1] == fx and c is not None:
                        d = ((prev_pos[0][0] - c[0]) ** 2 + (prev_pos[0][1] - c[1]) ** 2) ** 0.5
                        if d > GID_JUMP_PX:
                            flag.add("GID_CONFLICT", cam, fx, fx, d, GID_JUMP_PX,
                                     f"gid {gid} two spots same frame same cam")
                    if gkey in gid_missing_since:
                        gid_missing_since.pop(gkey, None)
                        gid_lost_pos.pop(gkey, None)
                    gid_positions[gkey] = (c, fx)
                    gid_first_seen.setdefault(gkey, fx)

                if detected and box is not None:
                    c = _centre(box)
                    # group 2: position/size jumps vs last visible position
                    if key in last_centre and invisible_streak.get(key, 0) == 0:
                        d = ((c[0] - last_centre[key][0]) ** 2 + (c[1] - last_centre[key][1]) ** 2) ** 0.5
                        if d > JUMP_PX_PER_FRAME:
                            flag.add("TRACK_JUMP", cam, last_visible_fx.get(key, fx - 1), fx, d,
                                     JUMP_PX_PER_FRAME, f"lid {lid} centre jump")
                        a0 = last_bbox[key][2] * last_bbox[key][3]
                        a1 = box[2] * box[3]
                        if a0 > 0 and max(a1 / a0, a0 / a1) > BBOX_AREA_JUMP_RATIO:
                            flag.add("BBOX_JUMP", cam, last_visible_fx.get(key, fx - 1), fx,
                                     max(a1 / a0, a0 / a1), BBOX_AREA_JUMP_RATIO, f"lid {lid} area jump")
                    # group 2: track outside ROI
                    roi = rois.get(cam)
                    ap = ob.get("anchor_pixel") or {}
                    if roi is not None and ap and not _in_roi(roi, ap["x"], ap["y"]):
                        flag.add("ROI_MISMATCH", cam, fx, fx, 0, "inside",
                                 f"lid {lid} anchor outside ROI")
                    last_centre[key] = c
                    last_bbox[key] = box
                    last_visible_fx[key] = fx
                    lid_missing_since.pop(key, None)
                    lid_lost_pos.pop(key, None)
                    total_visible[key] += 1
                    invisible_streak[key] = 0
                    pred_only_streak[key] = 0
                    pred_still_streak[key] = 0
                else:
                    invisible_streak[key] += 1
                    # group 3 ghost candidate: prediction-only (no detection),
                    # near-still, long streak — stationary alone proves nothing
                    if box is not None and kind in ("prediction", "occluded_prediction"):
                        c = _centre(box)
                        if key in last_centre:
                            mv = ((c[0] - last_centre[key][0]) ** 2
                                  + (c[1] - last_centre[key][1]) ** 2) ** 0.5
                            pred_still_streak[key] = pred_still_streak[key] + 1 if mv <= 4.0 else 0
                            last_centre[key] = c
                        else:
                            last_centre[key] = c
                        pred_only_streak[key] += 1
                        if pred_still_streak[key] == GHOST_PRED_FRAMES:
                            flag.add("GHOST_TRACK", cam, fx - GHOST_PRED_FRAMES, fx,
                                     GHOST_PRED_FRAMES, GHOST_PRED_FRAMES,
                                     f"lid {lid} prediction-only stationary {GHOST_PRED_FRAMES}f (candidate)")

            # group 2: per-frame pairwise same-cam overlap of visible detections
            for cam, obs_map in cur_obs.items():
                ids = [lid for lid, o in obs_map.items()
                       if int(o.get("invisible_count") or 0) == 0 and o.get("bbox")
                       and o.get("observation_kind") == "detection"]
                for i in range(len(ids)):
                    for j in range(i + 1, len(ids)):
                        a, b = obs_map[ids[i]]["bbox"], obs_map[ids[j]]["bbox"]
                        pk = (cam, tuple(sorted((ids[i], ids[j]))))
                        if _iou(a, b) >= DUPLICATE_IOU:
                            dup_streak[pk] += 1
                            if dup_streak[pk] == DUPLICATE_MIN_FRAMES:
                                flag.add("DUPLICATE_TRACK", cam, fx - DUPLICATE_MIN_FRAMES + 1, fx,
                                         _iou(a, b), DUPLICATE_IOU, f"lids {ids[i]},{ids[j]}")
                        else:
                            dup_streak[pk] = 0

            # group 2: lid disappeared vs new lid nearby => ID_FRAGMENT/NEW_ID
            for key, fvis in list(last_visible_fx.items()):
                if fvis == fx:
                    continue
                if key not in lid_missing_since:
                    lid_missing_since[key] = fx
                    lid_lost_pos[key] = last_centre.get(key)
            for key in first_seen:
                if first_seen[key] != fx:
                    continue
                pos = last_centre.get(key)
                if pos is None:
                    continue
                for lkey, lost_f in list(lid_missing_since.items()):
                    if lkey[0] != key[0] or lkey == key:
                        continue
                    if 0 < fx - lost_f <= NEW_WITHIN_FRAMES and lid_lost_pos.get(lkey):
                        lp = lid_lost_pos[lkey]
                        d = ((lp[0] - pos[0]) ** 2 + (lp[1] - pos[1]) ** 2) ** 0.5
                        pair = (key[1], lkey[1])
                        if d <= NEW_NEAR_PX and pair not in lid_flagged_pairs:
                            lid_flagged_pairs.add(pair)
                            frag_cands.append((key[0], key[1], lkey[1], lost_f, fx, d))
                            break
            for key in list(lid_missing_since):
                if fx - lid_missing_since[key] > NEW_WITHIN_FRAMES:
                    lid_missing_since.pop(key, None)
                    lid_lost_pos.pop(key, None)

            # group 3: gid disappeared vs NEW gid nearby (same cam) => lineage loss
            for gkey, (pos, fpos) in list(gid_positions.items()):
                if fpos == fx:
                    continue
                if gkey not in gid_missing_since:
                    gid_missing_since[gkey] = fx
                    gid_lost_pos[gkey] = pos
            for gkey, (pos, fpos) in list(gid_positions.items()):
                if fpos != fx or pos is None:
                    continue
                if gid_first_seen.get(gkey) != fx:
                    continue
                for lkey, lost_f in list(gid_missing_since.items()):
                    if lkey == gkey or not gid_lost_pos.get(lkey):
                        continue
                    if not (0 < fx - lost_f <= NEW_WITHIN_FRAMES):
                        continue
                    lp = gid_lost_pos[lkey]
                    d = ((lp[0] - pos[0]) ** 2 + (lp[1] - pos[1]) ** 2) ** 0.5
                    pair = (gkey[1], lkey[1])
                    if d > NEW_NEAR_PX or pair in gid_flagged_pairs:
                        continue
                    gid_flagged_pairs.add(pair)
                    if lkey[0] == gkey[0]:
                        gid_frag_cands.append((gkey[0], gkey[1], lkey[1], lost_f, fx, d))
                    else:
                        handoff_cands.append((gkey[0], gkey[1], lkey[0], lkey[1], lost_f, fx, d))
                    break
            for gkey in list(gid_missing_since):
                if fx - gid_missing_since[gkey] > NEW_WITHIN_FRAMES:
                    gid_missing_since.pop(gkey, None)
                    gid_lost_pos.pop(gkey, None)

            # group 5: slots / binder
            for s in rec.get("slots") or []:
                seen["slots"] = True
                sk = (s.get("camera_id"), s.get("slot_id"))
                occ = bool(s.get("occupied"))
                hist = slot_state.setdefault(sk, [])
                if hist and hist[-1][0] != occ:
                    slot_flip_counts[sk].append(fx)
                    recent = [f for f in slot_flip_counts[sk] if fx - f <= SLOT_FLICKER_WINDOW]
                    if len(recent) == SLOT_FLICKER_MIN:
                        flag.add("SLOT_STATE_ERROR", sk[0], recent[0], fx,
                                 len(recent), SLOT_FLICKER_MIN, f"slot {sk[1]} flicker")
                hist.append((occ, fx))
                if len(hist) > SLOT_FLICKER_WINDOW * 2:
                    hist.pop(0)
                if occ and s.get("tracking_occupied") is False:
                    slot_mismatch[sk] += 1
                    if slot_mismatch[sk] == SLOT_MISMATCH_MIN_FRAMES:
                        flag.add("SLOT_BINDING_ERROR", sk[0], fx - SLOT_MISMATCH_MIN_FRAMES, fx,
                                 SLOT_MISMATCH_MIN_FRAMES, SLOT_MISMATCH_MIN_FRAMES,
                                 f"slot {sk[1]} vision-occupied w/o tracking {slot_mismatch[sk]}f")
                else:
                    slot_mismatch[sk] = 0

    # -------- end-of-file checks --------
    # group 1: raw video frame count vs prediction rows. verify_cur_* dirs
    # hold no raw videos — resolve them in the source session dir (strip the
    # verify_cur_ prefix).
    raw_dir = session
    if session.name.startswith("verify_cur_") and not (session / "raw_cam1.mp4").exists():
        src = session.parent / session.name[len("verify_cur_"):]
        if src.is_dir():
            raw_dir = src
    raw_counts = {}
    for cam in (1, 2):
        raw_counts[f"cam{cam}"] = _video_frame_count(raw_dir / f"raw_cam{cam}.mp4")
        v = raw_counts[f"cam{cam}"]
        if v is not None and v != n_lines:
            flag.add("REPLAY_FAILURE", "-", 0, n_lines, n_lines, v,
                     f"predictions lines {n_lines} != raw_cam{cam} frames {v}")

    # group 1: frame_timestamps.csv row count vs prediction rows
    ts_csv = session / "frame_timestamps.csv"
    ts_csv_rows = None
    if ts_csv.exists():
        ts_csv_rows = max(0, sum(1 for _ in ts_csv.open("r", encoding="utf-8")) - 1)
        if ts_csv_rows != n_lines:
            flag.add("DATA_INTEGRITY", "-", 0, n_lines, ts_csv_rows, n_lines,
                     f"frame_timestamps.csv rows {ts_csv_rows} != predictions lines {n_lines}")

    # group 1: session_info record_counts cross-check
    info_path = session / "session_info.json"
    info_rc = None
    if info_path.exists():
        info = json.loads(info_path.read_text(encoding="utf-8"))
        info_rc = info.get("record_counts", {})
        for name in ("raw_cam1", "raw_cam2", "predictions"):
            v = info_rc.get(name)
            if v and v != n_lines:
                flag.add("REPLAY_FAILURE", "-", 0, n_lines, n_lines, v,
                         f"predictions lines != record_counts.{name}")

    # group 2/3/4 post-filters: the "vanished" id must STAY vanished —
    # if it was detected/seen again after the new-id frame, it was a flicker,
    # not a fragment/lineage-loss.
    for cam, new_lid, lost_lid, lost_f, fx, d in frag_cands:
        if last_visible_fx.get((cam, lost_lid), 0) <= fx:
            flag.add("ID_FRAGMENT/NEW_ID", cam, lost_f, fx, d, NEW_NEAR_PX,
                     f"new lid {new_lid} near lid {lost_lid} that stayed vanished")
    for cam, new_gid, lost_gid, lost_f, fx, d in gid_frag_cands:
        if gid_positions.get((cam, lost_gid), (None, 0))[1] <= fx:
            flag.add("GID_NEW_LINEAGE_LOSS", cam, lost_f, fx, d, NEW_NEAR_PX,
                     f"new gid {new_gid} near gid {lost_gid} that stayed vanished")
    for cam, new_gid, lost_cam, lost_gid, lost_f, fx, d in handoff_cands:
        if gid_positions.get((lost_cam, lost_gid), (None, 0))[1] <= fx:
            flag.add("HANDOFF_ERROR", cam, lost_f, fx, d, NEW_NEAR_PX,
                     f"new gid {new_gid} on {cam} near gid {lost_gid} vanished "
                     f"from {lost_cam} (lineage not preserved?)")

    # group 2: short-lived tracks (noise suspects; exclude still-alive at EOF)
    for key, nvis in total_visible.items():
        if 0 < nvis <= SHORT_LIFE_FRAMES and last_visible_fx.get(key, 0) < max_fx:
            flag.add("TRACK_LOST_EARLY", key[0], first_seen.get(key, 0),
                     last_visible_fx.get(key, 0), nvis, SHORT_LIFE_FRAMES,
                     f"lid {key[1]} visible only {nvis}f")

    n_frames = (max_fx - min_fx + 1) if max_fx is not None else 0
    missing = n_frames - len(seen_frames)
    if missing > 0:
        flag.add("DATA_INTEGRITY", "-", min_fx, max_fx, missing, 0, "missing frame_idx rows")

    # group 7: replay/runtime logs — session dir itself and the sibling
    # convention `output/verify_cur_<name>.log` (top level only, no recursion)
    log_files = sorted(session.glob("*.log"))
    sib = session.parent / (session.name + ".log")
    if sib.exists():
        log_files.append(sib)
    log_err = log_warn = 0
    for lf in log_files:
        with lf.open("r", encoding="utf-8", errors="replace") as lh:
            for ln, txt in enumerate(lh, 1):
                if LOG_ERR_RE.search(txt):
                    log_err += 1
                    flag.add("REPLAY_FAILURE", "-", 0, 0, ln, 0,
                             f"{lf.name}:{ln} {txt.strip()[:120]}",
                             group="g7_log_errors")
                elif LOG_WARN_RE.search(txt):
                    log_warn += 1

    ev_summary = {k: {"count": len(v), "first": v[0], "last": v[-1]} for k, v in event_windows.items()}

    # ---- coverage matrix: never claim a group checked when source absent ----
    def cov(ok, detail):
        return {"status": "CHECKED" if ok else "NOT_AVAILABLE", "detail": detail}

    coverage = {
        "g1_data_replay": {
            "frame_rows": cov(True, f"{len(seen_frames)} rows, {missing} missing frame_idx"),
            "raw_video_frames": {
                "cam1": cov(raw_counts["cam1"] is not None, raw_counts["cam1"] or "raw_cam1.mp4 absent/unreadable"),
                "cam2": cov(raw_counts["cam2"] is not None, raw_counts["cam2"] or "raw_cam2.mp4 absent/unreadable"),
            },
            "frame_timestamps_csv": cov(ts_csv_rows is not None, f"{ts_csv_rows} rows" if ts_csv_rows is not None else "no frame_timestamps.csv"),
            "capture_timestamps": cov(seen["capture_unix_ns"], "capture_unix_ns" if seen["capture_unix_ns"] else "field absent"),
            "camera_skew_ms": cov(seen["camera_skew_ms"], f"max|skew|={skew_max:.1f}ms" if seen["camera_skew_ms"] else "field absent"),
            "session_info_counts": cov(info_rc is not None, "record_counts" if info_rc else "no session_info.json/record_counts"),
        },
        "g2_local_track": cov(seen["obs_cam1"] or seen["obs_cam2"], "observations present" if n_obs else "no observations"),
        "g3_global_id": cov(seen["gid"], "canonical_gid/raw_gid seen" if seen["gid"] else "no gid fields"),
        "g4_cross_camera": {
            "cam2_obs": cov(seen["obs_cam2"], "cam2 observations" if seen["obs_cam2"] else "no cam2 observations"),
            "handoff_events": cov(seen["identity_events"],
                                  f"{sum(v['count'] for k, v in ev_summary.items() if 'handoff' in k)} handoff events"
                                  if seen["identity_events"] else "no identity_events field"),
        },
        "g5_slots": cov(seen["slots"], "slots records present" if seen["slots"] else "no slots field"),
        "g6_occlusion_windows": cov(seen["identity_events"],
                                    f"{sum(v['count'] for k, v in ev_summary.items())} review-event hits"
                                    if seen["identity_events"] else "no identity_events field"),
        "g7_log_errors": cov(bool(log_files),
                             f"{len(log_files)} log file(s): {log_err} error-lines, {log_warn} warn-lines"
                             if log_files else "no *.log in session dir (verify_cur run will create one)"),
    }

    summary = {
        "session": session.name,
        "lines": n_lines,
        "frame_idx_range": [min_fx, max_fx],
        "distinct_frames": len(seen_frames),
        "missing_frame_rows": missing,
        "raw_video_frames": raw_counts,
        "observations": n_obs,
        "flags_by_type": dict(sorted(flag.counts.items())),
        "total_flags": len(flag.flags),
        "flagged_frames_pct": round(100.0 * len({f_["frame_from"] for f_ in flag.flags})
                                    / max(1, len(seen_frames)), 2),
        "event_windows": ev_summary,
        "coverage": coverage,
        "windows_count": 0,  # filled below
    }
    win = flag.windows()
    summary["windows_count"] = len(win)
    if out_path:
        out_path.parent.mkdir(parents=True, exist_ok=True)
        with out_path.open("w", encoding="utf-8") as fh:
            for f_ in flag.flags:
                fh.write(json.dumps(f_, ensure_ascii=False) + "\n")
        wpath = out_path.with_suffix(".windows.jsonl")
        with wpath.open("w", encoding="utf-8") as fh:
            for w in win:
                fh.write(json.dumps(w, ensure_ascii=False) + "\n")
    return summary


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--session", required=True, type=Path)
    ap.add_argument("--roi", nargs="*", type=Path, default=None,
                    help="roi_mask_cam1.json roi_mask_cam2.json (optional)")
    ap.add_argument("--out", type=Path, default=None, help="flags JSONL output")
    args = ap.parse_args()
    if not (args.session / "predictions.jsonl").exists():
        sys.exit(f"no predictions.jsonl in {args.session}")
    summary = scan(args.session, args.roi, args.out)
    print(json.dumps(summary, indent=1, ensure_ascii=False))


if __name__ == "__main__":
    main()
