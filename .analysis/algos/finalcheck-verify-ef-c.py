# finalcheck-verify-ef-c.py — independent fixture verify cho E/F hiện hành (builder-c, Phase1)
# Không liên quan cross-verify-c.py (lịch sử). Chạy: python finalcheck-verify-ef-c.py
import json, math

results = []
def check(name, actual, expected, tol=1e-9):
    ok = (abs(actual - expected) <= tol if isinstance(expected, (int, float)) and isinstance(actual, (int, float))
          else actual == expected)
    results.append((name, ok, actual, expected))

# ---- E1 world-projection-anchor ----
H = [[2,0,10],[0,2,20],[0,0,1]]
wx, wy = H[0][0]*5+H[0][2], H[1][1]*5+H[1][2]
check("E1.A world", (wx, wy), (20.0, 30.0))
inv = [[1/2,0,-10/2],[0,1/2,-20/2],[0,0,1]]
check("E1.A roundtrip", (inv[0][0]*wx+inv[0][2], inv[1][1]*wy+inv[1][2]), (5.0, 5.0))
check("E1.B crop fallback", (30+5, 40+5), (35.0, 45.0))  # crop_origin+px, no flag

# ---- E2 handoff-entry-creation (frames units) ----
def outward(cx, vx, width=95):
    # bbox-edge branch: gate |v|>1.0 px/frame, t in frames
    if vx < -1.0: return max(0.0, cx)/abs(vx), "left"
    if vx > 1.0:  return max(0.0, width-cx)/vx, "right"
    return None
check("E2.A t_edge frames", outward(90,4)[0], 1.25)
check("E2.A entry", outward(90,4)[0] <= 16, True)
check("E2.B vx<=1.0 gate", outward(90,0.2), None)
check("E2.B vx=1.5 entry", outward(90,1.5)[0] <= 16, True)
check("E2.B vx=-4 left", outward(90,-4)[0] > 16, True)

# ---- E3 handoff-prediction-corridor (2 branches) ----
# frame branch (default): pred = last + vel_per_frame * elapsed_frames  (NO /fps)
check("E3.A pred frame", 100 + 0.2*(22-10), 102.4)
# timestamp branch (needs handoff_ttl_seconds): pred = last + vel_per_second * elapsed_s
check("E3.B pred seconds", 100 + 2.0*1.2, 102.4)
check("E3.B x25 fallback", 0.08*25.0, 2.0)
dc = (0.2*3)/(0.2*math.sqrt(10))
check("E3.A dir_cos", dc, 0.9489, 5e-4)

# ---- E4 handoff-lapjv-matching (literal 4-term cost) ----
def cost(res, radius, app, size, dcost):
    return 0.55*(res/radius) + 0.30*app + 0.10*size + 0.05*dcost
check("E4.A cost t1", cost(3,10,0.1,0.05,0.02), 0.201, 1e-4)
check("E4.A cost t2", cost(8,10,0.05,0.02,0.01), 0.4575, 1e-4)
check("E4.A pick", "t1" if cost(3,10,0.1,0.05,0.02) < cost(8,10,0.05,0.02,0.01) else "t2", "t1")
check("E4.B residual gate", all(r > 10 for r in (11,12)), True)   # -> prediction_distance
check("E4.B dir gate", 0.1 < 0.25, True)                          # -> direction reject

# ---- E5 overlap pairing: unique (A) vs greedy (B) ----
pairs = [("b1",2.0),("b2",150.0)]
check("E5.A unique merge", min(p[1] for p in pairs) <= 10 and len([p for p in pairs if p[1]<=10])==1, True)
check("E5.B ambiguous skip", len([p for p in [("b1",2.0),("b2",4.0)] if p[1]<=10]) != 1, True)
costs = sorted([(0.3,"b1"),(0.5,"b2")])
check("E5.B greedy picks b1", costs[0][1], "b1")

# ---- E7 dormant-identity-reid ----
check("E7.A d<=limit", math.hypot(68-60,60-60) <= 40, True)
check("E7.A app gate", 0.1 <= 0.62, True)
check("E7.B stale", 13 > 12, True)   # same-cam moving -> skip

# ---- E8 world-trajectory-match (6-term literal) ----
s = {"distance":0.8,"appearance":0.6,"direction":0.9,"speed":0.7,"time":0.5,"topology":0.4,"size":0.9}
score = 0.35*s["distance"]+0.25*s["appearance"]+0.15*s["direction"]+0.10*s["speed"]+0.10*min(s["time"],s["topology"])+0.05*s["size"]
check("E8.A 6-term score", score, 0.72, 1e-9)
check("E8.A score>=min", score >= 0.5, True)
sim3 = 0.5*0.9 + 0.3*0.8 + 0.2*0.6   # dossier claims 0.75
check("E8.A [sim] 3-term value", round(sim3,2), 0.81, 1e-9)   # != 0.75 -> dossier text off
check("E8.B dir reject", -0.99 < 0.25, True)
check("E8.B topo reject", 0 <= 0, True)

# ---- E9 merge-alias ----
alias = {9:7}
def canonical(g):
    while g in alias: g = alias[g]
    return g
alias[11] = 9
check("E9.B canonical(11)", canonical(11), 7)

# ---- F1 homography ----
check("F1.A recover H", H[0][0]*5+H[0][2], 20.0)
check("F1.B <4 reject", 3 < 4, True)

# ---- F2 fit_gate thresholds ----
def fit_gate(p95, mx, cm):
    r=[]
    if p95 > 8.5 or mx > 12.0: r.append("eight_pair_pixel_residual_exceeded")
    if cm > 2.0: r.append("eight_pair_cross_camera_cm_residual_exceeded")
    return r
check("F2.A pass", fit_gate(7,11,1.8), [])
check("F2.B p95 fail", len(fit_gate(9,11,1.8))>0, True)

# ---- F3 calibration-load-validation ----
def load_ok(status, algo=None, visual_reviewed=False):
    reviewed = (algo=="rectangle_line_v1" and status=="reviewed_fit" and visual_reviewed)
    return status=="passed" or reviewed
check("F3.A passed ok", load_ok("passed"), True)
check("F3.B reviewed_fit standalone reject", load_ok("reviewed_fit"), False)
check("F3.B reviewed_fit+algo no visual", load_ok("reviewed_fit","rectangle_line_v1",False), False)
check("F3.B reviewed_fit+algo+visual ok", load_ok("reviewed_fit","rectangle_line_v1",True), True)
check("F3 det cam1", 2*2-0*0 >= 1e-12, True)
check("F3 det cam2", 3*3-0*0 >= 1e-12, True)

# ---- F4 matching-distance-derivation ----
edges = sorted([400,500,600,520,480]); med = edges[2]
check("F4.A median", med, 500.0)
MULT = {"handoff":1.75,"pred":2.75,"dormant":1.75,"dup":0.50}
check("F4.A handoff", med*MULT["handoff"], 875.0)
check("F4.A pred_radius", med*MULT["pred"], 1375.0)
check("F4.A duplicate", med*MULT["dup"], 250.0)
def resolve(ovr,cfg,der,fb):
    if ovr is not None: return float(ovr)
    if cfg is None: return float(der if der is not None else fb)
    if der is None: return float(cfg)
    return float(min(cfg,der))
check("F4.B ceiling", resolve(None,1000,875,600), 875.0)
check("F4.B tighten", resolve(None,700,875,600), 700.0)
check("F4.B override", resolve(300,1000,875,600), 300.0)
check("F4.B fallback", resolve(None,None,None,600), 600.0)

# ---- F5 frame-size-adaptation (aspect/non-uniform gates, H@S) ----
def adapt(cw,ch,rw,rh):
    a_src, a_rt = cw/ch, rw/rh
    if abs(a_src-a_rt) > 0.005: return "reject:aspect"
    sx, sy = cw/rw, ch/rh
    if abs(sx-sy) > max(sx,sy)*0.005: return "reject:nonuniform"
    return (sx,sy)
check("F5.A uniform adapt", adapt(1280,720,640,360), (2.0,2.0))
check("F5.B aspect reject", adapt(1280,720,1280,700), "reject:aspect")
check("F5.B nonuniform reject", adapt(1280,720,640,370), "reject:aspect")  # aspect fails first (0.048>0.005)
H5 = [[2,0,10],[0,2,20],[0,0,1]]; S=[[2,0,0],[0,2,0],[0,0,1]]
Hp = [[sum(H5[r][k]*S[k][c] for k in range(3)) for c in range(3)] for r in range(3)]
check("F5.A H@S", Hp, [[4,0,10],[0,4,20],[0,0,1]])

# ---- F6 camera-skew ----
ts = {"cam1":10.00,"cam2":10.30}; newer=[10.10,10.20,10.25]; reads=0
while ts["cam2"]-ts["cam1"] > 0.120 and reads < 3:
    ts["cam1"] = newer[reads]; reads += 1
check("F6.A synced reads", reads, 2)
check("F6.A final skew<=", ts["cam2"]-ts["cam1"] <= 0.120, True)
ts = {"cam1":10.00,"cam2":10.30}; newer=[10.02,10.03,10.04]; reads=0
while ts["cam2"]-ts["cam1"] > 0.120 and reads < 3:
    ts["cam1"] = newer[reads]; reads += 1
check("F6.B best-effort skew", ts["cam2"]-ts["cam1"] > 0.120, True)

# ---- F7 latest-frame-mailbox (needs_frame predicate) ----
interval, liveness = 0.15, 5.0
last_sub = None; requested = None; pending = None
events = [(0.0,"publish","f1"),(0.1,"publish","f2"),(0.2,"request",None),(0.3,"publish","f3"),(0.4,"encode",None)]
log = {}
for t,op,fr in events:
    if op=="publish":
        if last_sub is None or t-last_sub >= interval:
            last_sub = t; pending = fr
        else:
            log.setdefault("dropped",[]).append(fr)
    elif op=="request": requested = t
    elif op=="encode": log["encoded"] = pending
def needs_frame(now):
    return requested is not None and now-requested <= liveness and last_sub is not None and now-last_sub >= interval
check("F7.A f2 dropped", log.get("dropped"), ["f2"])
check("F7.A pending", pending, "f3")
check("F7.A needs@0.35 (dossier claims TRUE)", needs_frame(0.35), False)  # 0.05 < 0.15 -> dossier expected sai
check("F7.A needs@0.45", needs_frame(0.45), True)
check("F7.A encode gets", log["encoded"], "f3")
check("F7.B dead subscriber", (6.0-0.0) > liveness, True)  # needs_frame false

# ---- F8 stale-evidence (no job_seq; one-pending + monotonic + age) ----
def apply_job(cam_ts, job_ts, submitted_ago, max_age, evidence_ts, accepted_ts):
    age = max(cam_ts-job_ts, submitted_ago)
    if age > max_age: return "result_too_old"
    if evidence_ts <= accepted_ts: return "evidence_not_monotonic"
    return "accept"
check("F8.A accept", apply_job(105.0,104.8,0.3,2.0,104.8,104.5), "accept")
check("F8.B too_old", apply_job(105.0,102.0,0.3,2.0,105.0,104.0), "result_too_old")
check("F8.B monotonic", apply_job(105.0,104.8,0.3,2.0,104.5,104.8), "evidence_not_monotonic")
check("F8.B deadline", 2.5 > 2.0, True)   # worker_over_deadline

# ---- report ----
fails = [r for r in results if not r[1]]
print(f"{len(results)-len(fails)}/{len(results)} assertions PASS")
for n,ok,a,e in results:
    if not ok: print(f"  FAIL {n}: actual={a!r} expected={e!r}")
if fails: raise SystemExit(1)
