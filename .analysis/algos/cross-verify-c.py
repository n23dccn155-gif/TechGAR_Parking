# cross-verify-c.py — kiem chung doc lap sample B1-B11 cua builder-b.md
# Chay: python cross-verify-c.py   (stdlib only, deterministic)
import math
from itertools import permutations

PASS, FAIL = "PASS", "FAIL"
def check(name, got, want, tol=1e-3):
    ok = abs(got - want) <= tol if isinstance(want, float) else got == want
    print(f"[{PASS if ok else FAIL}] {name}: got={got} want={want}")
    return ok

print("=== B1 kalman alpha-beta beta=0.5 ===")
st = [10, 10, 0, 0]; trace = []
for m in ([12, 10], [13, 10], [14, 11]):
    st = [st[0] + st[2], st[1] + st[3], st[2], st[3]]          # predict
    st = [s + 0.5 * r for s, r in zip(st, [m[0] - st[0], m[1] - st[1], m[0] - st[0], m[1] - st[1]])]
    trace.append([round(v, 4) for v in st])
print(trace)
check("B1 trace", trace, [[11, 10, 1, 0], [12.5, 10, 1.5, 0], [14, 10.5, 1.5, 0.5]])
st = [st[0] + st[2], st[1] + st[3], st[2], st[3]]
check("B1 coast f1", (st[0], st[1]), (15.5, 11.0))
st = [st[0] + st[2], st[1] + st[3], st[2], st[3]]
check("B1 coast f2", (st[0], st[1]), (17.0, 11.5))

print("=== B2 prediction-age-decay ===")
for a, w in [(0, 4.0), (0.1, 2.68), (0.2, 1.79), (0.3, 1.2)]:
    check(f"B2 v(age={a})", 4 * math.exp(-a / 0.25), w, 1e-2)
check("B2 freeze v", 4 * math.exp(-0.5 / 0.25), 0.541, 1e-2)

print("=== B3 association-distance-gate ===")
gate = 20 + 5 * (1 + 0.5 * 3) + 0.5 * 10
check("B3 gate sample A", gate, 37.5)   # dossier ghi 42.5 -> sai so hoc

print("=== B4 IoU ===")
def iou(a, b):
    ix = max(0.0, min(a[0]+a[2], b[0]+b[2]) - max(a[0], b[0]))
    iy = max(0.0, min(a[1]+a[3], b[1]+b[3]) - max(a[1], b[1]))
    i = ix * iy; u = a[2]*a[3] + b[2]*b[3] - i
    return i / u if u else 0.0
check("B4 A", iou([0,0,4,4],[2,0,4,4]), 1/3, 1e-3)
check("B4 B lồng", iou([0,0,2,2],[0,0,4,4]), 0.25)

print("=== B5 cost matrix ===")
cost = 0.4*0.3 + 0.2*(1-0.35) + 0.2*0.15 + 0.1*0.1 + 0.1*(1-0.9)
check("B5 cost A", cost, 0.30, 1e-3)

print("=== B6 lapjv exhaustive vs greedy ===")
def exhaustive(C, limit):
    T, D = len(C), len(C[0]); best = (1e18, None)
    for cols in permutations(range(D + 1), T):   # col D = unassigned
        t = sum(C[r][c] if c < D else limit for r, c in enumerate(cols))
        if t < best[0]: best = (t, cols)
    return best
def greedy_global(C, limit):
    T, D = len(C), len(C[0]); used = set(); tot = 0.0; pick = {}
    cand = sorted((C[r][c], r, c) for r in range(T) for c in range(D))
    for cost, r, c in cand:
        if r not in pick and c not in used:
            pick[r] = c; used.add(c); tot += cost
    for r in range(T):
        if r not in pick: tot += limit
    return tot, pick
CA = [[0.2,0.8,10],[0.7,0.3,10],[10,10,0.4]]
t, a = exhaustive(CA, 0.9); check("B6 A optimal total", t, 0.9); print("   assign:", a)
CB = [[0.95,10],[10,0.3]]
t, a = exhaustive(CB, 0.9); check("B6 B optimal total", t, 1.2); print("   assign:", a)
# tim counterexample greedy that bai (2x2)
found = []
for a11 in [0.1,0.2,0.3]:
  for a12 in [0.1,0.2,0.3,0.5,0.9]:
    for a21 in [0.1,0.2,0.3,0.5,0.9]:
      for a22 in [0.1,0.2,0.3,0.5,0.9]:
        C = [[a11,a12],[a21,a22]]
        g,_ = greedy_global(C, 99)
        e,_ = exhaustive(C, 99)
        if g > e + 1e-9: found.append((C, g, e))
print("   counterexamples 2x2 tim duoc:", found[:3])
CG = [[0.1,0.2],[0.3,0.9]]
g,_ = greedy_global(CG, 0.9); e,a = exhaustive(CG, 0.9)
print(f"   counterexample chon {CG}: greedy={g} opt={e} assign={a}")

print("=== B7 margin ambiguity ===")
def margin_check(C, assign, margin):
    out = []
    for r, c in assign:
        row2 = min(v for j, v in enumerate(C[r]) if j != c)
        col2 = min(C[i][c] for i in range(len(C)) if i != r)
        out.append("keep" if (C[r][c] + margin < row2 and C[r][c] + margin < col2) else "defer")
    return out
check("B7 A", margin_check([[0.30,0.32,10],[0.90,10,0.31]], [(0,0),(1,2)], 0.03), ["defer","keep"])
print("   B7 B r1 row_second =", min(v for j,v in enumerate([0.31,0.30]) if j != 1))
check("B7 B", margin_check([[0.30,0.32],[0.31,0.30]], [(0,0),(1,1)], 0.04), ["defer","defer"])

print("=== B8 stale-anchor ===")
d = math.hypot(7-5, 6-5); check("B8 d", d, math.sqrt(5), 1e-3)
cost = 0.5 + 0.2 * (d / 3)
check("B8 cost (floor 0.5 + 0.2*d/3)", cost, 0.649, 1e-3)  # dossier ghi ~0.55 -> sai

print("=== B9 lifecycle ===")
def lifecycle(dets, ttl):
    st, inv, out = "tentative", 0, []
    for m in dets:
        if st == "expired": out.append("expired"); continue
        if m:
            st, inv = "confirmed", 0; out.append("confirmed")
        else:
            inv += 1
            if inv >= ttl: st = "expired"; out.append("expired")
            else: st = "lost"; out.append(f"lost({inv})")
    return out
check("B9 A", lifecycle([1,0,0,0,0], 3), ["confirmed","lost(1)","lost(2)","expired","expired"])
check("B9 B", lifecycle([1,0,1,0,0], 3), ["confirmed","lost(1)","confirmed","lost(1)","lost(2)"])

print("=== B10 hsv-lab ===")
h = [0]*6
for v in [10,10,10,160]: h[v // 30] += 1
h = [c / 4 for c in h]; check("B10 hist", h, [0.75,0,0,0,0,0.25])
check("B10 d vs [1,0..]", 1 - math.sqrt(0.75*1), 0.134, 1e-3)

print("=== B11 gallery match (Bhattacharyya 2 bin, day du) ===")
def bd(p, q): return 1 - sum(math.sqrt(a*b) for a, b in zip(p, q))
h1, h2 = [0.9,0.1], [0.6,0.4]; h3, h4 = [0.8,0.2], [0.1,0.9]
for n,(p,q) in {"h1h3":(h1,h3),"h1h4":(h1,h4),"h2h3":(h2,h3),"h2h4":(h2,h4)}.items():
    print(f"   d({n}) = {bd(p,q):.4f}")
nnA = [min(bd(a,b) for b in (h3,h4)) for a in (h1,h2)]
nnB = [min(bd(b,a) for a in (h1,h2)) for b in (h3,h4)]
med = lambda xs: (xs[0]+xs[1])/2
dAB, dBA = med(sorted(nnA)), med(sorted(nnB))
check("B11 A nnMed(A->B)", dAB, 0.0172, 1e-3)
check("B11 A nnMed(B->A)", dBA, 0.0826, 1e-3)
check("B11 A distance=max", max(dAB, dBA), 0.0826, 1e-3)   # dossier ghi ~0.088 -> sai
# sample B
nnA2 = [bd(a, [0,1]) for a in (h1,h2)]
print("   d(h1,[0,1]) =", round(nnA2[0],4), " d(h2,[0,1]) =", round(nnA2[1],4))
nnB2 = min(bd([0,1], a) for a in (h1,h2))
dAB2, dBA2 = med(sorted(nnA2)), nnB2
check("B11 B nnMed(A->B)", dAB2, 0.5257, 1e-3)             # dossier ghi ~0.684 -> sai
check("B11 B distance=max", max(dAB2, dBA2), 0.5257, 1e-3)

print("=== B6 counterexample moi trong dossier ===")
CCE = [[0.1, 0.5], [0.4, 10]]
# greedy theo hang: r0 lay min hang -> r1 lay con lai (>=limit -> unassigned)
g_row = CCE[0][0] + 0.9          # r0->c0 0.1; r1 unassigned 0.9
e, a = exhaustive(CCE, 0.9)
check("B6 CE greedy-theo-hang", g_row, 1.0)
check("B6 CE optimal", e, 0.9); print("   opt assign:", a)

print("=== C1 slot-roi-precompute ===")
def raster_rect(poly):
    xs = [p[0] for p in poly]; ys = [p[1] for p in poly]
    cells = set()
    for i in range(min(xs), max(xs)+1):
        for j in range(min(ys), max(ys)+1):
            cells.add((i,j))      # quy uoc bao bien
    return cells
def erode1(cells):
    out = set()
    for (i,j) in cells:
        if all((i+di,j+dj) in cells for di in (-1,0,1) for dj in (-1,0,1)):
            out.add((i,j))
    return out
def core_scale(poly, cells, s):
    cx = sum(p[0] for p in poly)/len(poly); cy = sum(p[1] for p in poly)/len(poly)
    scaled = [(cx+(x-cx)*s, cy+(y-cy)*s) for x,y in poly]
    xs = [p[0] for p in scaled]; ys = [p[1] for p in scaled]
    return {(i,j) for i in range(-20,20) for j in range(-20,20)
            if min(xs) <= i <= max(xs) and min(ys) <= j <= max(ys)}
polyA = [[1,1],[6,1],[6,6],[1,6]]
roi = raster_rect(polyA); ana = erode1(roi); bnd = roi - ana; cor = core_scale(polyA, roi, 0.5)
check("C1 A roi", len(roi), 36); check("C1 A analysis", len(ana), 16)
check("C1 A boundary", len(bnd), 20); check("C1 A core", len(cor), 4); print("   core cells:", sorted(cor))
polyB = [[2,2],[3,2],[3,3],[2,3]]
roiB = raster_rect(polyB); anaB = erode1(roiB)
check("C1 B roi", len(roiB), 4); check("C1 B analysis(empty)", len(anaB), 0)

print("=== C2 ensemble-threshold-voting ===")
def votes(ratios, enter): return sum(1 for r in ratios if r >= enter)
check("C2 A votes", votes([0.30,0.28,0.31,0.05,0.04,0.06,0.29,0.30,0.02], 0.12), 5)
check("C2 B votes", votes([0.30,0.05,0.05,0.05,0.04,0.06,0.29,0.30,0.02], 0.12), 3)

print("=== C3 border-line-filter ===")
check("C3 A raw ratio", (5+2)/20, 0.35); check("C3 A filtered", 2/20, 0.10)
check("C3 B kept", 5/20, 0.25)

print("=== C4 core-rescue-vote ===")
b1 = (0.20 >= 0.18) and (0.10 >= 0.08)
b2 = (0.10 >= 0.30) and (0.20 >= 0.02)
check("C4 A rescue", b1 or b2, True)
r1 = (0.01 >= 0.18) and (0.02 >= 0.08)
r2 = (0.35 >= 0.30) and (0.01 >= 0.02)
check("C4 B rescue", r1 or r2, False)

print("=== C5 temporal-smoothing-dwell ===")
def dwell_series(votes_s, need_occ, need_emp):
    state, streak, flips = 0, 0, []
    for t, v in votes_s:
        if v == state: streak = 0; continue
        streak += 1
        need = need_occ if v == 1 else need_emp
        if streak >= need: state = v; streak = 0; flips.append((t, "occupied" if v else "free"))
    return flips
ts = [0,0.4,0.8,1.2,1.6,2.0,2.4,2.8,3.2,3.6]
vs = [0,0,1,1,1,0,1,0,0,0]
flips = dwell_series(list(zip(ts,vs)), need_occ=math.ceil(0.5/0.4), need_emp=math.ceil(1.0/0.4))
check("C5 A flips", flips, [(1.2,"occupied"),(3.6,"free")])
flips2 = dwell_series(list(zip([0,0.4,0.8,1.2],[1,0,1,0])), need_occ=2, need_emp=3)
check("C5 B no-flip", flips2, [])
