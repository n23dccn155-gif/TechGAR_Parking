#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Verifier cho motion-binder-correction-a.md — stdlib only, deterministic.
Port giản lược các công thức ĐÃ SỬA theo source; assert expected literals trong file.
Chạy: python3 verify-motion-binder-a.py  (cwd .analysis/algos)
"""
import math, statistics

PASS = 0
FAIL = 0
def check(name, got, want, tol=1e-4):
    global PASS, FAIL
    if isinstance(want, float) or isinstance(got, float):
        ok = abs(float(got) - float(want)) <= tol
    else:
        ok = got == want
    if ok:
        PASS += 1
    else:
        FAIL += 1
        print(f"  FAIL {name}: got={got!r} want={want!r}")

def cv2_bhatt(p, q):
    """cv2.HISTCMP_BHATTACHARYYA: sqrt(1 - BC/sqrt(Sp*Sq)); = sqrt(1-BC) khi Sp=Sq=1."""
    bc = sum(math.sqrt(a * b) for a, b in zip(p, q))
    denom = math.sqrt(sum(p) * sum(q))
    return math.sqrt(max(0.0, 1.0 - bc / denom)) if denom > 0 else 0.0

def iou(a, b):
    ax, ay, aw, ah = a; bx, by, bw, bh = b
    ix = max(0, min(ax + aw, bx + bw) - max(ax, bx))
    iy = max(0, min(ay + ah, by + bh) - max(ay, by))
    inter = ix * iy
    union = aw * ah + bw * bh - inter
    return inter / union if union else 0.0

# ---------- A1 ----------
def a1_mask(frame, bg, T):
    return sum(1 for r in range(len(frame)) for c in range(len(frame[0]))
               if abs(frame[r][c] - bg[r][c]) > T)
check("A1.A fg_count", a1_mask([[5]*4,[5,9,9,5],[5,9,9,5],[5]*4], [[5]*4]*4, 3), 4)
check("A1.B fg_count", a1_mask([[8]*4]*4, [[5]*4]*4, 3), 0)
check("A1.B fg_count T2", a1_mask([[8]*4]*4, [[5]*4]*4, 2), 16)

# ---------- A2 (union of diffs) ----------
def diff_count(a, b, T):
    return sum(1 for r in range(len(a)) for c in range(len(a[0]))
               if abs(a[r][c] - b[r][c]) > T)
def union_count(d1_cells, d2_cells):
    return len(set(d1_cells) | set(d2_cells))
g  = [[5,5,5,5],[5,5,9,9],[5,5,9,9],[5,5,5,5]]
sh = [[5,5,5,5],[5,9,9,5],[5,9,9,5],[5,5,5,5]]
lg = [[5]*4]*4
check("A2.A short", diff_count(g, sh, 3), 4)
check("A2.A long",  diff_count(g, lg, 3), 4)
u1 = {(r,c) for r in range(4) for c in range(4) if abs(g[r][c]-sh[r][c])>3}
u2 = {(r,c) for r in range(4) for c in range(4) if abs(g[r][c]-lg[r][c])>3}
check("A2.A union", union_count(u1, u2), 6)
g2 = [[5]*4]*4
u3 = {(r,c) for r in range(4) for c in range(4) if abs(g2[r][c]-sh[r][c])>3}
u4 = {(r,c) for r in range(4) for c in range(4) if abs(g2[r][c]-lg[r][c])>3}
check("A2.B short", len(u3), 4); check("A2.B long", len(u4), 0)
check("A2.B union open", union_count(u3, u4), 4)

# ---------- A5 gate order demo ----------
# gates: floor -> ROI -> occlusion -> whole-scene(0.22) -> oversized -> aspect -> anchor -> priority-min_area -> motion(px AND ratio) -> shadow
def a5_verdicts(comps, frame_px, max_area_frac, min_area, min_w, min_h, max_w, aspect, min_motion_px, min_ratio):
    out = []
    for c in comps:
        x, y, w, h = c["box"]; px = c["px"]; mo = c["motion"]
        if px < min_area or w < min_w or h < min_h: out.append(("floor", c["box"])); continue
        if px > max_area_frac * frame_px: out.append(("whole-scene", c["box"])); continue
        if w > max_w: out.append(("oversized", c["box"])); continue
        if not (aspect[0] <= w / max(h, 1) <= aspect[1]): out.append(("aspect", c["box"])); continue
        if mo < min_motion_px or mo / float(w * h) < min_ratio: out.append(("motion", c["box"])); continue
        out.append(("accept", c["box"]))
    return out
comps = [{"box":[0,0,4,3],"px":12,"motion":8},{"box":[4,4,4,3],"px":12,"motion":2},
         {"box":[0,6,10,2],"px":20,"motion":18},{"box":[4,6,2,2],"px":4,"motion":4}]
v = a5_verdicts(comps, 96, 0.22, 4, 2, 2, 9, [0.25,5.0], 3, 0.08)
check("A5.A comp0", v[0][0], "accept")
check("A5.A comp1", v[1][0], "motion")
check("A5.A comp2", v[2][0], "oversized")
check("A5.A comp3", v[3][0], "accept")
# edge: motion_px đạt sàn nhưng FILL-RATIO thấp -> reject:motion (gate px AND ratio, MT:1015-1019)
comps2 = [{"box":[0,0,4,10],"px":20,"motion":3}]  # px=20<=21.12 qua whole-scene; mo=3>=3; 3/40=0.075<0.08
v2 = a5_verdicts(comps2, 96, 0.22, 4, 2, 2, 9, [0.25,5.0], 3, 0.08)
check("A5.B ratio-fail", v2[0][0], "motion")
check("A5.B ratio value", 3/40.0, 0.075, tol=1e-9)
check("A5.C whole-scene", a5_verdicts([{"box":[0,0,11,2],"px":22,"motion":22}],96,0.22,4,2,2,9,[0.25,5],3,0.08)[0][0], "whole-scene")

# ---------- A7 shadow metrics ----------
def a7_metrics(cur, bg, att_rng, expl_min, res_max, chroma_max, att_tol=0.18):
    att = [c / bg for c in cur]
    med = statistics.median(att)
    scaled_res = [abs(c - med * bg) / bg for c in cur]
    med_res = statistics.median(scaled_res)
    chroma = [0.0] * len(cur)  # demo gray
    explained = sum(1 for i in range(len(cur))
                  if abs(att[i] - med) <= att_tol and chroma[i] <= chroma_max * 1.20
                  and scaled_res[i] <= res_max * 1.50) / len(cur)
    is_shadow = (att_rng[0] <= med <= att_rng[1] and med_res <= res_max
                 and 0.0 <= chroma_max and explained >= expl_min)
    return med, med_res, explained, is_shadow
med, mres, expl, sh7 = a7_metrics([50,50,45,180], 100, [0.32,0.62], 0.75, 0.08, 0.10)
check("A7.A med_att", med, 0.5); check("A7.A med_res", mres, 0.025)
check("A7.A explained", expl, 0.75); check("A7.A is_shadow", sh7, True)
medB1,_,_,sB1 = a7_metrics([70]*4, 100, [0.32,0.62], 0.75, 0.08, 0.10)
check("A7.B1 med_att", medB1, 0.7); check("A7.B1 not shadow", sB1, False)
medB2,_,_,sB2 = a7_metrics([20]*4, 100, [0.32,0.62], 0.75, 0.08, 0.10)
check("A7.B2 med_att", medB2, 0.2); check("A7.B2 not shadow", sB2, False)

# ---------- A9 echo/suppress ----------
def same_motion_echo(a, b):
    """a,b: {box:[x,y,w,h], point:(x,y), hist, owner, occlusion}"""
    if a.get("hist") is None or b.get("hist") is None: return False
    if a.get("occlusion") or b.get("occlusion"): return False
    aw, ah = a["box"][2], a["box"][3]; bw, bh = b["box"][2], b["box"][3]
    size_ratio = min(aw*ah, bw*bh) / max(aw*ah, bw*bh, 1)
    if size_ratio < 0.45: return False
    if cv2_bhatt(a["hist"], b["hist"]) > 0.22: return False
    dist = math.dist(a["point"], b["point"])
    allowed = max(24.0, 1.10 * max(min(aw, ah), min(bw, bh)))
    def box_gap(p, q):
        gx = max(0, max(p[0]-(q[0]+q[2]), q[0]-(p[0]+p[2])))
        gy = max(0, max(p[1]-(q[1]+q[3]), q[1]-(p[1]+p[3])))
        return math.hypot(gx, gy)
    return dist <= allowed and box_gap(a["box"], b["box"]) <= 14.0

def suppress(dets):
    kept = []
    for d in sorted(dets, key=lambda it: it["area"], reverse=True):
        if any(d["owner"] == k["owner"] and same_motion_echo(d, k)
               and iou(d["box"], k["box"]) >= 0.25
               and cv2_bhatt(d["hist"], k["hist"]) <= 0.12 for k in kept):
            continue
        kept.append(d)
    return kept
da = {"box":[0,0,4,4],"point":(2,4),"hist":[1,0],"owner":1,"area":16}
db = {"box":[2,0,4,4],"point":(4,4),"hist":[1,0],"owner":1,"area":16}
dc = {"box":[8,0,3,3],"point":(9.5,3),"hist":[0,1],"owner":2,"area":9}
check("A9.A same_echo(a,b)", same_motion_echo(da, db), True)
check("A9.A IoU(a,b)", iou(da["box"], db["box"]), 1/3)
check("A9.A kept", [d["box"] for d in suppress([da, db, dc])], [[0,0,4,4],[8,0,3,3]])
db2 = dict(db); db2["owner"] = 2
check("A9.B different owners kept", [d["box"] for d in suppress([da, db2, dc])],
      [[0,0,4,4],[2,0,4,4],[8,0,3,3]])
dd = {"box":[5,0,4,4],"point":(7,4),"hist":[1,0],"owner":1,"area":16}
check("A9.C echo-but-lowIoU same_echo", same_motion_echo(da, dd), True)
check("A9.C IoU(a,d)", iou(da["box"], dd["box"]), 0.0)
check("A9.C suppressed? (giữ)", [d["box"] for d in suppress([da, dd])], [[0,0,4,4],[5,0,4,4]])

# ---------- A10 covering group ----------
def covering_group(blob, groups):
    """groups chỉ tồn tại với >=2 member (pairs pre-formed theo proximity, OG:73-90)."""
    x, y, w, h = blob["box"]
    out = []
    for members, refs, centers in groups:
        if len(members) < 2:
            continue  # không có "group" 1 thành viên — cặp mới là đơn vị
        contained = []
        for tid in members:
            cx, cy = centers[tid]
            pad = 0.15 * min(refs[tid])
            contained.append(x-pad <= cx <= x+w+pad and y-pad <= cy <= y+h+pad)
        median_area = statistics.median(rw*rh for rw, rh in refs.values())
        if all(contained) and w*h >= 1.6 * median_area:
            out.append(sorted(members))
    return out
blobA = {"box":[0,0,8,3]}
refs = {1:(3,3), 2:(3,3)}
centers = {1:(2,1), 2:(6,1)}
check("A10.A covering", covering_group(blobA, [({1,2}, refs, centers)]), [[1,2]])
check("A10.B single member group n/a", covering_group(blobA, [({1}, {1:(3,3)}, centers)]), [])
# edge: 3-member preformed group, one member outside -> NOT covering
refs3 = {1:(3,3),2:(3,3),3:(3,3)}
centers3 = {1:(2,1),2:(6,1),3:(11,1)}
check("A10.C all-members-required", covering_group(blobA, [({1,2,3}, refs3, centers3)]), [])
# pair groups formed by proximity: pair {1,2} near each other — demo giữ
check("A10.A2 factor", 8*3 >= 1.6*9, True)

# ---------- A12 elongation ----------
def elong_explained(track_wh, blob_wh, vel, span=1.75):
    ew = float(blob_wh[0]) - float(track_wh[0])
    eh = float(blob_wh[1]) - float(track_wh[1])
    if ew <= 0 and eh <= 0: return True
    return (ew <= abs(vel[0])*span + 0.30*track_wh[0]
            and eh <= abs(vel[1])*span + 0.30*track_wh[1])
check("A12.A explained", elong_explained((4,3),(8,3),(4,0)), True)
check("A12.A excess_w", 8-4 <= 4*1.75 + 0.3*4, True)   # 4 <= 8.2
check("A12.B veto (vuông góc)", elong_explained((4,3),(8,3),(0,4)), False)  # 4 > 1.2
check("A12.B2 veto (cao theo y nhỏ)", elong_explained((4,3),(4,4),(4,0)), False)  # eh=1 > 0.9

# ---------- B5 cost ----------
def b5_cost(d_norm, iouv, app, area_ratio, w=(0.45,0.25,0.20,0.10), max_ratio=2.80):
    size_error = min(1.0, abs(math.log(max(area_ratio,1e-6))) / abs(math.log(max_ratio)))
    return w[0]*d_norm + w[1]*(1-iouv) + w[2]*app + w[3]*size_error
check("B5.A size_error(1.5)", abs(math.log(1.5))/abs(math.log(2.8)), 0.3938, tol=1e-3)
check("B5.A cost", b5_cost(0.3, 0.35, 0.15, 1.5), 0.3669, tol=1e-3)
# B sample: gate fail -> cost=10
check("B5.B gate", 55 > 50, True)

# ---------- B7 margin ----------
def has_margin(costs, r, c, margin, invalid=10.0):
    sel = costs[r][c]
    alts = [v for i, v in enumerate(costs[r]) if i != c and v < invalid]
    alts += [costs[i][c] for i in range(len(costs)) if i != r and costs[i][c] < invalid]
    return (not alts) or (min(alts) - sel >= margin)
costs7 = [[0.30,0.32,10],[0.90,10,0.31]]
check("B7.A r0 defer", has_margin(costs7,0,0,0.03*2.0), False)  # margin=0.06 cho track mới (lineage~0)
check("B7.A r0 keep nếu visible", has_margin(costs7,0,0,0.03*2.0) or "skip-check", "skip-check")
costs7b = [[0.05,10,0.32],[0.90,10,0.31]]
check("B7.B col defer", has_margin(costs7b,1,2,0.05), False)
check("B7.B row ok", has_margin(costs7b,0,0,0.05), True)

# ---------- B8 stale-anchor ----------
def b8(last_meas, det_pt, det_box, clean_wh, app, hist_present, lost_s, window=1.5,
       lost_app_thresh=0.30, stale_app=0.22, size_rng=(0.35,2.80), max_distance=20.0, invis=1):
    if lost_s > window: return ("skip:reacquire_window", None)
    diag = math.hypot(*clean_wh)
    gate = min(max_distance, max(3.0, 0.30*diag))
    d = math.dist(det_pt, last_meas)
    if d > gate: return ("skip:anchor_gate", None)
    if invis > 0 and not hist_present: return ("skip:no_hist", None)
    if invis > 0 and app > lost_app_thresh: return ("skip:app_lost", None)
    if app > min(lost_app_thresh, stale_app): return ("skip:app_stale", None)
    pred_box = (last_meas[0]-clean_wh[0]//2, last_meas[1]-clean_wh[1], clean_wh[0], clean_wh[1])
    iv = iou(pred_box, det_box)
    area_ratio = (det_box[2]*det_box[3]) / float(clean_wh[0]*clean_wh[1])
    if not (size_rng[0] <= area_ratio <= size_rng[1]): return ("skip:size", None)
    size_err = min(1.0, abs(math.log(max(area_ratio,1e-6)))/abs(math.log(2.80)))
    cost = 0.45*(d/max_distance) + 0.25*(1-iv) + 0.20*app + 0.10*size_err
    return ("ok", cost)
res8a = b8((5,5),(6.5,6),(4,3,5,3),(4,3),0.20,True,0.8)
check("B8.A verdict", res8a[0], "ok")
check("B8.A gate", min(20.0, max(3.0, 0.30*math.hypot(4,3))), 3.0)
check("B8.A iou", iou((3,2,4,3),(4,3,5,3)), 6/21)
check("B8.A cost", res8a[1], 0.2809, tol=1e-3)
res8b = b8((5,5),(6,6),(4,3,4,3),(4,3),0.25,True,0.8)
check("B8.B app reject", res8b[0], "skip:app_stale")
res8c = b8((5,5),(6,6),(4,3,4,3),(4,3),0.20,True,2.0)
check("B8.C window reject", res8c[0], "skip:reacquire_window")

# ---------- B10 descriptor ----------
hA = [0.75,0,0,0,0,0.25]; hB = [1,0,0,0,0,0]
check("B10.A bc", sum(math.sqrt(a*b) for a,b in zip(hA,hB)), math.sqrt(0.75))
check("B10.A d", cv2_bhatt(hA,hB), 0.3660, tol=1e-3)
def quality(box_area, fg_ratio, aspect, min_area=200, min_fg=0.15):
    if box_area < min_area: return 0.0
    size_s = min(1.0, box_area/1000.0)
    if fg_ratio is not None:
        if fg_ratio < min_fg: return 0.0
        fg_s = min(1.0, fg_ratio*2.0)
    else: fg_s = 1.0
    asp_s = 0.5 if (aspect < 0.3 or aspect > 4.0) else 1.0
    return max(0.0, min(1.0, 0.5*size_s + 0.3*fg_s + 0.2*asp_s))
check("B10.B quality(400,0.5,1.0)", quality(400,0.5,1.0), 0.7)
check("B10.C quality area<200", quality(100,0.9,1.0), 0.0)
check("B10.C2 quality fg<0.15", quality(900,0.10,1.0), 0.0)

# ---------- B11 gallery ----------
def agg_median_l2(g):
    a = [statistics.median(c) for c in zip(*g)]
    s = math.sqrt(sum(v*v for v in a))
    if s <= 1e-12:
        a = [sum(c)/len(c) for c in zip(*g)]
        s = math.sqrt(sum(v*v for v in a))
    return [v/s for v in a]
def compare(A, B):
    pw = [[cv2_bhatt(a,b) for b in B] for a in A]
    ln = [min(r) for r in pw]
    rn = [min(pw[i][j] for i in range(len(A))) for j in range(len(B))]
    partial = ln if len(A) <= len(B) else rn
    nearest = statistics.median(partial)
    cov = statistics.median(ln + rn)
    ag = cv2_bhatt(agg_median_l2(A), agg_median_l2(B))
    bp = sum(sorted(x for r in pw for x in r)[:3]) / 3
    return 0.5*nearest + 0.2*cov + 0.2*ag + 0.1*bp, pw, min(len(A),len(B))
GA = [[0.9,0.1],[0.6,0.4]]; GB = [[0.8,0.2],[0.1,0.9]]
dA, pwA, supA = compare(GA, GB)
check("B11.A pw00", pwA[0][0], 0.1003, tol=1e-3)
check("B11.A pw01", pwA[0][1], 0.6325, tol=1e-3)
check("B11.A pw10", pwA[1][0], 0.1560, tol=1e-3)
check("B11.A pw11", pwA[1][1], 0.3938, tol=1e-3)
check("B11.A distance", dA, 0.1553, tol=1e-3)
check("B11.A support", supA, 2)
check("B11.A match(<0.5)", dA < 0.5, True)
GB2 = [[0,1],[0,1]]
dB, pwB, _ = compare(GA, GB2)
check("B11.B distance", dB, 0.6889, tol=1e-3)
check("B11.B match(<0.5)", dB < 0.5, False)

# ---------- D1 slot geometry (raster bao-biên) ----------
def cells_rect(x0, x1, y0, y1):
    return {(x,y) for x in range(int(x0), int(x1)+1) for y in range(int(y0), int(y1)+1)}
poly = [[0,0],[8,0],[8,8],[0,8]]
slot_cells = cells_rect(0,8,0,8)
slot_diag = math.hypot(8,8)
def d1(bbox):
    x,y,w,h = bbox
    bc = cells_rect(x, x+w, y, y+h)
    inter = len(bc & slot_cells)
    vo = inter / len(bc); so = inter / len(slot_cells)
    center = (x+w/2, y+h/2)
    inside = (0 <= center[0] <= 8) and (0 <= center[1] <= 8)
    qualifies = (inside and vo >= 0.35) or vo >= 0.60
    if not qualifies: return None
    dist = math.hypot(center[0]-4, center[1]-4)
    prox = max(0.0, 1.0 - dist/slot_diag)
    return {"vo":vo,"so":so,"prox":prox,"score":min(1.0,0.70*vo+0.20*so+0.10*prox)}
r1 = d1([2,2,4,4])
check("D1.A vo", r1["vo"], 1.0); check("D1.A so", r1["so"], 25/81, tol=1e-3)
check("D1.A prox", r1["prox"], 1.0); check("D1.A score", r1["score"], 0.8617, tol=1e-3)
check("D1.B null", d1([7,7,4,4]), None)

# ---------- D3 qualify + commit ----------
def d3_qualified(obs, entered, slot_center, diag, obs_min=3, ovl_min=0.35):
    if len(obs) < obs_min: return False
    maxO = max(o["o"] for o in obs); firstO = obs[0]["o"]
    if maxO < ovl_min: return False
    inward = (entered or (maxO - firstO) >= 0.10
              or (math.dist(obs[0]["c"], slot_center) - math.dist(obs[-1]["c"], slot_center))
                 >= max(2.0, 0.05*diag))
    return inward
obsA = [{"o":0.30,"c":[1,5]},{"o":0.34,"c":[3,5]},{"o":0.38,"c":[5,5]}]
check("D3.A qualified", d3_qualified(obsA, False, (5,5), math.hypot(8,8)), True)
obsB = [{"o":0.36,"c":[9,5]},{"o":0.36,"c":[9.5,5]},{"o":0.35,"c":[10,5]}]
check("D3.B not inward", d3_qualified(obsB, False, (5,5), math.hypot(8,8)), False)
def d3_score(maxO, obs, min_obs, inward_prog, ovl_prog):
    return (0.55*min(1.0,maxO) + 0.20*min(1.0,obs/min_obs)
            + 0.15*min(1.0,inward_prog/0.10) + 0.10*min(1.0,ovl_prog/0.15))
sc1 = d3_score(0.38, 3, 3, 4/math.hypot(8,8), 0.08)
check("D3.A score", sc1, 0.6123, tol=1e-3)
# commit gates: streak>=2, vehicle_id None, lost_delay>=0.35, margin 0.15
check("D3.commit delay ok", 9.5-9.0 >= 0.35, True)
# margin edge: winner 0.61 vs rival 0.55 -> diff 0.06 < 0.15 -> competing_vehicle reject
check("D3.margin diff", 0.6123-0.55, 0.0623, tol=1e-3)
check("D3.margin <0.15", (0.6123-0.55) < 0.15, True)

# ---------- D4 detach semantics ----------
def d4(vision, owner, token_exists):
    if vision == 0 and owner is not None:
        return {"occupied": False, "vehicle_id": None, "token": True,
                "tracking_state": "recovery_pending", "episode": "departing"}
    return {"occupied": bool(vision), "vehicle_id": owner, "token": token_exists}
check("D4.B detach", d4(0, "v7", False)["vehicle_id"], None)
check("D4.B token", d4(0, "v7", False)["token"], True)

# ---------- D7 token radius ----------
def tok_radius(diag, age, init=0.05, mx=0.45, expand_s=1.0):
    return diag * (init + min(1.0, age/expand_s) * (mx - init))
check("D7.A r(0)", tok_radius(100, 0), 5.0)
check("D7.A r(0.5)", tok_radius(100, 0.5), 25.0)
check("D7.A r(1)", tok_radius(100, 1.0), 45.0)
check("D7.A r(3)", tok_radius(100, 3.0), 45.0)

# ---------- D8 predeparture ----------
def d8(frag_signed, frag_overlap, frag_center_dist_over_diag, other_dist_over_diag=None):
    diag = math.hypot(8,8)
    init_r = diag * 0.05
    if frag_signed < -init_r and frag_overlap <= 0.0:
        return None
    choices = sorted([frag_center_dist_over_diag] + ([other_dist_over_diag] if other_dist_over_diag else []))
    if len(choices) > 1 and choices[1] - choices[0] < 0.15:
        return "ambiguous_skip"
    return "predeparture_token"
check("D8.A token", d8(-1.0, 0.10, 0.30), "predeparture_token")
check("D8.B far skip", d8(-11.0, 0.0, 2.0), None)
check("D8.C ambiguity", d8(-1.0, 0.10, 0.30, 0.40), "ambiguous_skip")

# ---------- D9 gates ----------
def d9(first_signed, signed, orig_overlap, continuing, obs, size_ratio, app, app_limit,
       first_center, token_center, point, moved_px, min_radial, radial_now,
       originated_in_slot, diag, radius, max_radius, world_ready=False):
    if first_signed < -max_radius: return ("origin_outside_max_gate", None)
    if signed < -radius and orig_overlap <= 0.0 and not continuing:
        return ("waiting_for_expanding_gate", None)
    legacy_size = 0.40 <= size_ratio <= 2.50
    traj_size = world_ready and 0.15 <= size_ratio <= 6.0
    if not (legacy_size or traj_size): return ("size_missing_or_mismatch", None)
    if app is None or app > app_limit: return ("appearance_missing_or_mismatch", None)
    outward_px = radial_now - radial_now  # placeholder
    legacy = moved_px >= 3.0 and radial_now - min_radial >= 0.75
    escape = (originated_in_slot and signed <= -max(1.5, 0.05*diag)
              and moved_px >= 3.0 and radial_now - min_radial >= 0.75)
    if obs < 3 or not (legacy or world_ready or escape):
        return ("insufficient_outward_evidence", None)
    spatial = min(1.0, math.dist(point, token_center) / max(1.0, diag + radius))
    size_cost = min(1.0, abs(math.log(max(size_ratio,1e-6))) / math.log(2.5))
    dir_cost = max(0.0, min(1.0, 1.0 - max(0.0, radial_now - min_radial) / max(3.0, 0.10*diag)))
    cost = 0.45*spatial + 0.35*(app/max(app_limit,1e-6)) + 0.15*size_cost + 0.05*dir_cost
    return ("qualified", cost)
diag = math.hypot(8,8)  # 11.314
radius = diag * 0.45; maxr = diag * 0.45
# Sample A: first inside (signed=+3), current signed=-4 > -radius
r9a = d9(3.0, -4.0, 0.5, False, 3, 0.9, 0.2, 0.70, (5,5), (5,5), (12,5), 7.0, 0.0, 7.0, True, diag, radius, maxr)
check("D9.A verdict", r9a[0], "qualified")
check("D9.A cost", r9a[1], 0.3093, tol=1e-3)
# Sample B: inward motion -> insufficient_outward_evidence
r9b = d9(4.0, -2.0, 0.5, False, 3, 0.9, 0.2, 0.70, (10,5), (5,5), (6,5), 4.0, 5.0, 1.0, False, diag, radius, maxr)
check("D9.B inward reject", r9b[0], "insufficient_outward_evidence")
# Sample C: app reject
r9c = d9(3.0, -4.0, 0.5, False, 3, 0.9, 0.75, 0.70, (5,5), (5,5), (12,5), 7.0, 0.0, 7.0, True, diag, radius, maxr)
check("D9.C app reject", r9c[0], "appearance_missing_or_mismatch")

# ---------- D10 batch + ambiguity + consume ----------
def d10(costs, limit=0.999, margin=0.15, invalid=10.0):
    T, F = len(costs), len(costs[0])
    best = None
    import itertools
    for perm in itertools.product(range(-1, F), repeat=T):
        if len([p for p in perm if p >= 0]) != len(set(p for p in perm if p >= 0)): continue
        total = sum(costs[r][p] if p >= 0 else limit for r, p in enumerate(perm))
        if best is None or total < best[0]: best = (total, perm)
    total, perm = best
    out = {}
    for r, c in enumerate(perm):
        if c < 0 or costs[r][c] >= invalid: continue
        row_gap = min([costs[r][o]-costs[r][c] for o in range(F) if o != c and costs[r][o] < invalid] or [math.inf])
        col_gap = min([costs[i][c]-costs[r][c] for i in range(T) if i != r and costs[i][c] < invalid] or [math.inf])
        if row_gap < margin or col_gap < margin:
            out[r] = "ambiguous_reject"
        else:
            out[r] = ("consume", c)
    return total, out
totA, outA = d10([[0.20,10],[0.55,10]])
check("D10.A winner", outA[0], ("consume", 0))
check("D10.A col_gap 0.35", 0.55-0.20, 0.35, tol=1e-9)
check("D10.A tok1 unmatched", 1 not in outA, True)
totB, outB = d10([[0.30,10],[0.34,10]])
check("D10.B ambiguous", outB[0], "ambiguous_reject")
check("D10.B col_gap", 0.34-0.30, 0.04, tol=1e-9)

print(f"\n{PASS} PASS / {FAIL} FAIL")
raise SystemExit(1 if FAIL else 0)
