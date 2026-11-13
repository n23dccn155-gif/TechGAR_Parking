"""CORE2 M5 — engine: gop phep do -> vet the gioi -> so GID. Tat dinh, thuan Python."""
from __future__ import annotations

from dataclasses import dataclass, field, replace
import math

import lap
import numpy as np

from .track import Point, Track, TrackParams, in_footprint
from .types import Blob, Core2Engine as EngineContract, Obs, Output, State


@dataclass(frozen=True)
class EngineParams:
    track: TrackParams = field(default_factory=TrackParams)
    fuse_cross_cm: float = 3.5      # gop cheo camera (du lieu ao: 0 cm)
    fuse_same_cm: float = 8.0       # gop manh vo cung camera (<= ~1 than xe)
    frag_gap_px: float = 16.0       # khe pixel toi da giua hai manh cua mot xe
    frag_far_cm: float = 12.0       # manh NGAN (<= frag_member_px) tach xa hon fuse_same_cm van gop neu hop <= frag_union_px
    frag_member_px: float = 70.0    # xe nguyen ven dai ~86 px: manh vo ngan hon nguong nay
    frag_union_px: float = 117.0    # canh dai bbox lon nhat cua xe don (12 cua so B0 + full)
    absorb_cm: float = 5.0          # phep do thua trong dau chan vet vua khop => bo
    reid_margin_cm: float = 8.0     # bien cong nhan lai GID
    overrun_cm: float = 3.0         # < be rong xe: hai xe khong the chong len nhau
    reid_speed_cm_s: float = 5.5    # toc do toi da dung cho nhan lai (BLIND_CORNERS v2: toi thieu 5,32 de moi ca qua cong)
    reid_short_s: float = 10.0      # khoang vang <= nguong nay: tran reid_cap_cm; dai hon: reid_cap_long_cm
    reid_cap_long_cm: float = 14.0
    reid_cap_cm: float = 40.0       # tran ban kinh nhan lai GID
    tentatives_max: int = 64
    foot_along_cm: float = 9.0      # ~ chieu dai xe 9,4
    foot_lateral_cm: float = 3.0    # < be rong xe 4,2
    wake_along_cm: float = 7.5
    wake_lateral_cm: float = 3.2
    wake_behind_pen: float = 1.5    # tren lan (ngoai o do) xe it khi lui: phat chi phi khi phep do nam SAU neo (theo huong xe); chi uu tien, khong cam
    xy_offset_by_cam: tuple = ()    # ((cam, dx, dy), ...) bu lech he thong day-giua bbox (CALIB_B0)
    slots: tuple = ()               # da giac o do tren mat dat (cm)
    group_blob_px: float = 125.0    # bbox dai hon nguong nay (~1,45 than xe 85 px) => blob nhieu xe
    desc_veto_l1: float = 1.0       # desc: CHI de BAC BO ghep sai (cung xe p50 0,18-0,29; khac xe p50 1,7-1,9; DESC_AUC.md)
    desc_veto_per_s: float = 0.05   # noi long theo khoang vang (anh sang/goc nhin doi)
    desc_ema: float = 0.3
    reid_desc_w: float = 3.0        # diem nhan lai = d(cm) + w * L1(desc) (khong co desc: w*1,0)
    reid_ambig_cm: float = 2.0      # 2 ung vien chenh diem < nguong nay => mo ho, khong nhan lai
    desc_min_px: float = 40.0       # blob ngan hon nguong nay la manh/luoi liem: desc khong tin cay => khong bac bo
    coverage_polys: tuple = ()      # da giac tam nhin tren mat dat (hop cac camera): xe sap ra khoi hop => OUT_OF_VIEW
    exit_reach_cm: float = 9.4      # xe 'dang ra' neu diem cach vet 1 than xe theo huong chay nam ngoai tam nhin
    entry_zones: tuple = ()         # da giac vung cong vao: sinh o day => GID moi
    exit_zones: tuple = ()          # da giac vung cong ra: mat o day => EXITED


def _desc_far(a, b, gap_s: float, p: 'EngineParams') -> bool:
    """True neu CA HAI co desc va L1 vuot nguong (bac bo ghep). Khong co desc => khong ket luan."""
    if a is None or b is None:
        return False
    return float(np.abs(np.asarray(a) - np.asarray(b)).sum()) > p.desc_veto_l1 + p.desc_veto_per_s * min(max(gap_s, 0.0), 10.0)


def _inside(pt: Point, poly) -> bool:
    x, y = pt
    inside = False
    n = len(poly)
    for i in range(n):
        x1, y1 = poly[i]
        x2, y2 = poly[(i + 1) % n]
        if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1) + x1:
            inside = not inside
    return inside


def _bbox_gap(a, b) -> float:
    """Khe ho pixel giua hai bbox (0 neu cham/chong)."""
    gx = max(a[0] - (b[0] + b[2]), b[0] - (a[0] + a[2]), 0)
    gy = max(a[1] - (b[1] + b[3]), b[1] - (a[1] + a[3]), 0)
    return float(max(gx, gy))


def _merge_same_cam(members: list[Blob]) -> Blob:
    """Gop cac manh cung camera thanh 1 blob: bbox hop, xy noi suy theo day-giua bbox hop."""
    if len(members) == 1:
        return members[0]
    x0 = min(b.bbox[0] for b in members); y0 = min(b.bbox[1] for b in members)
    x1 = max(b.bbox[0] + b.bbox[2] for b in members); y1 = max(b.bbox[1] + b.bbox[3] for b in members)
    pts = [((b.bbox[0] + b.bbox[2] / 2.0, b.bbox[1] + b.bbox[3]), b.xy) for b in members]
    u_star, v_star = (x0 + x1) / 2.0, float(y1)
    axis = 0 if (max(p[0][0] for p in pts) - min(p[0][0] for p in pts)) >=         (max(p[0][1] for p in pts) - min(p[0][1] for p in pts)) else 1
    lo = min(pts, key=lambda p: p[0][axis]); hi = max(pts, key=lambda p: p[0][axis])
    span = hi[0][axis] - lo[0][axis]
    s = ((u_star, v_star)[axis] - lo[0][axis]) / span if span > 1e-6 else 0.5
    xy = (lo[1][0] + s * (hi[1][0] - lo[1][0]), lo[1][1] + s * (hi[1][1] - lo[1][1]))
    first = max(members, key=lambda b: b.area_px)
    return Blob(cam=first.cam, frame=first.frame, t=first.t, bbox=(x0, y0, x1 - x0, y1 - y0), xy=xy,
                area_px=sum(b.area_px for b in members), roi_clipped=any(b.roi_clipped for b in members),
                roi_support=min(b.roi_support for b in members), desc=None)


def _same_car(a: Blob, b: Blob, p: 'EngineParams') -> bool:
    d = math.dist(a.xy, b.xy)
    if d <= p.fuse_same_cm:
        return True
    if d > p.frag_far_cm:
        return False
    if max(a.bbox[2], a.bbox[3]) > p.frag_member_px or max(b.bbox[2], b.bbox[3]) > p.frag_member_px:
        return False
    ux = max(a.bbox[0] + a.bbox[2], b.bbox[0] + b.bbox[2]) - min(a.bbox[0], b.bbox[0])
    uy = max(a.bbox[1] + a.bbox[3], b.bbox[1] + b.bbox[3]) - min(a.bbox[1], b.bbox[1])
    return max(ux, uy) <= p.frag_union_px


def _union(n, pairs):
    parent = list(range(n))

    def find(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i
    for i, j in pairs:
        parent[find(j)] = find(i)
    groups: dict[int, list[int]] = {}
    for i in range(n):
        groups.setdefault(find(i), []).append(i)
    return list(groups.values())


def fuse(t: float, blobs_by_cam: dict[int, list[Blob]], p: EngineParams) -> list[Obs]:
    """M2 rut gon: (1) gop manh vo cung camera theo khe pixel + khoang cach mat dat,
    (2) gop cheo camera theo khoang cach mat dat."""
    merged: list[Blob] = []
    offs = {c: (dx, dy) for c, dx, dy in p.xy_offset_by_cam}
    for cam in sorted(blobs_by_cam):
        bs = blobs_by_cam[cam]
        if cam in offs:
            dx, dy = offs[cam]
            bs = [replace(b, xy=(b.xy[0] + dx, b.xy[1] + dy)) for b in bs]
        pairs = [(i, j) for i in range(len(bs)) for j in range(i + 1, len(bs))
                 if _bbox_gap(bs[i].bbox, bs[j].bbox) <= p.frag_gap_px and _same_car(bs[i], bs[j], p)]
        for group in _union(len(bs), pairs):
            merged.append(_merge_same_cam([bs[i] for i in group]))
    pairs = [(i, j) for i in range(len(merged)) for j in range(i + 1, len(merged))
             if merged[i].cam != merged[j].cam and math.dist(merged[i].xy, merged[j].xy) <= p.fuse_cross_cm]
    out = []
    for group in _union(len(merged), pairs):
        members = [merged[i] for i in group]
        x = sum(b.xy[0] for b in members) / len(members)
        y = sum(b.xy[1] for b in members) / len(members)
        clipped = all(b.roi_clipped for b in members)
        dm = [b for b in members if b.desc is not None]
        desc = max(dm, key=lambda b: b.area_px).desc if dm else None
        out.append(Obs(t=t, xy=(x, y), sigma_cm=2.0 if clipped else 1.0,
                       cams=tuple(sorted({b.cam for b in members})), blobs=tuple(members),
                       quality=0.5 if clipped else 1.0, desc=desc))
    out.sort(key=lambda o: (o.xy[0], o.xy[1]))
    return out


class Core2Engine(EngineContract):
    def __init__(self, params: EngineParams | None = None):
        self.p = params or EngineParams()
        self.tracks: list[Track] = []
        self._next_tid = 1
        self._next_gid = 1
        self._events: list[dict] = []
        self.counters = {"births": 0, "reid": 0, "tentative_dropped": 0, "tentative_expired": 0,
                         "lost_total": 0, "lost_expired": 0}

    # ------------------------------------------------------------------ API
    def live_gids(self) -> set[int]:
        return {tr.gid for tr in self.tracks if tr.gid is not None and tr.state is not State.EXITED}

    def drain_events(self) -> list[dict]:
        events, self._events = self._events, []
        return events

    def stats(self) -> dict:
        by_state: dict[str, int] = {}
        for tr in self.tracks:
            by_state[tr.state.name] = by_state.get(tr.state.name, 0) + 1
        return {"tracks": by_state, "live_gids": len(self.live_gids()), **self.counters}

    # ----------------------------------------------------------------- step
    def step(self, t: float, frame: int, blobs_by_cam: dict[int, list[Blob]]) -> list[Output]:
        p, tp = self.p, self.p.track
        for tr in self.tracks:
            tr.measured = False
        # blob nhieu xe: bbox rat dai VA phu len bbox cuoi cua >= 2 vet co GID
        drop: set[int] = set()
        for cam in sorted(blobs_by_cam):
            for g in blobs_by_cam[cam]:
                if max(g.bbox[2], g.bbox[3]) <= p.group_blob_px:
                    continue
                covered = []
                for tr in self.tracks:
                    last = tr.bbox_by_cam.get(cam)
                    if last is None or tr.gid is None or tr.state in (State.LOST, State.EXITED):
                        continue
                    (x, y, w, h), _ = last
                    cx, cy = x + w / 2.0, y + h / 2.0
                    if (g.bbox[0] - 10 <= cx <= g.bbox[0] + g.bbox[2] + 10
                            and g.bbox[1] - 10 <= cy <= g.bbox[1] + g.bbox[3] + 10):
                        covered.append(tr)
                if len(covered) >= 2:
                    drop.add(id(g))
                    for tr in covered:
                        tr.group_t = t           # xe van o do, khong do duoc vi tri rieng
        if drop:
            blobs_by_cam = {cam: [b for b in bs if id(b) not in drop] for cam, bs in blobs_by_cam.items()}
        obs = fuse(t, blobs_by_cam, p)

        # --- buoc 1: vet dang hoat dong x phep do
        active = [tr for tr in self.tracks if tr.state in (State.MOVING, State.OCCLUDED)]
        used = self._assign(active, obs, set(), t)
        # --- phep do thua nam trong dau chan vet co GID vua duoc do => manh cua chinh xe do, bo
        measured = [tr for tr in active if tr.measured and tr.gid is not None]
        for j, ob in enumerate(obs):
            if j not in used and any(in_footprint(tr.last_meas_xy, tr.heading, ob.xy, p.foot_along_cm, p.foot_lateral_cm)
                                     for tr in measured):
                used.add(j)
        # --- L4: vet co GID dang do di xuyen qua neo cua vet STOPPED => vet STOPPED do khong con o do
        for tr in self.tracks:
            if tr.state is State.STOPPED and any(
                    math.dist(m.last_meas_xy, tr.anchor) <= p.overrun_cm and m.wake_anchor is None
                    for m in measured):
                tr.state = State.LOST
                tr.lost_since_t = t
                tr.xy = tr.anchor
                tr.last_meas_xy = tr.anchor
                self.counters["lost_total"] += 1
                self._events.append({"type": "overrun", "gid": tr.gid, "t": t})
        # --- buoc 2: vet STOPPED x phep do con lai (thuc day / van dung yen)
        stopped = [tr for tr in self.tracks if tr.state is State.STOPPED]
        used = self._assign(stopped, obs, used, t)
        # --- phep do thua trong dau chan vet STOPPED => nhieu/manh cua xe dang dung, bo
        for j, ob in enumerate(obs):
            if j not in used and any(in_footprint(tr.anchor, tr.heading, ob.xy, p.wake_along_cm, p.wake_lateral_cm)
                                     for tr in stopped if tr.state is State.STOPPED):
                used.add(j)
        # --- buoc 3: TENTATIVE x phep do con lai; roi sinh TENTATIVE moi
        used = self._assign([tr for tr in self.tracks if tr.state is State.TENTATIVE], obs, used, t)
        for j, ob in enumerate(obs):
            if j not in used:
                self._spawn(ob, t)

        self._lifecycle(t)
        return self._outputs(t)

    # -------------------------------------------------------------- helpers
    def _assign(self, cands: list[Track], obs: list[Obs], used: set[int], t: float) -> set[int]:
        tp = self.p.track
        free = [j for j in range(len(obs)) if j not in used]
        if not cands or not free:
            return set(used)
        big = 1e6
        cost = np.full((len(cands), len(free)), big, dtype=np.float64)
        for i, tr in enumerate(cands):
            pred = tr.predict(t)
            if tr.state is State.STOPPED:
                gate = tp.r_wake_cm
            else:
                gate = tp.gate_base_cm + tp.v_max_cm_s * (t - tr.last_meas_t)
            for k, j in enumerate(free):
                d = math.dist(pred, obs[j].xy)
                if tr.state is State.STOPPED:
                    ok = in_footprint(pred, tr.heading, obs[j].xy, self.p.wake_along_cm, self.p.wake_lateral_cm)
                    if ok and tr.heading is not None and tr.anchor is not None and not self._in_slot(tr.anchor):
                        ahead = ((obs[j].xy[0] - tr.anchor[0]) * tr.heading[0]
                                 + (obs[j].xy[1] - tr.anchor[1]) * tr.heading[1])
                        if ahead < 0.0:
                            d += self.p.wake_behind_pen * (-ahead)
                else:
                    ok = d <= gate
                if (ok and tr.gid is not None and tr.state is not State.MOVING
                        and max(max(b.bbox[2], b.bbox[3]) for b in obs[j].blobs) >= self.p.desc_min_px
                        and _desc_far(tr.desc, obs[j].desc, t - tr.last_meas_t, self.p)):
                    ok = False
                if ok:
                    cost[i, k] = d + (0.5 if tr.gid is None else 0.0)
        _, x, _ = lap.lapjv(cost, extend_cost=True, cost_limit=big / 2)
        out = set(used)
        for i, k in enumerate(x):
            if k >= 0 and cost[i, k] < big / 2:
                self._apply(cands[i], obs[free[k]], t)
                out.add(free[k])
        return out

    def _spawn(self, ob: Obs, t: float) -> None:
        tents = [tr for tr in self.tracks if tr.state is State.TENTATIVE]
        if len(tents) >= self.p.tentatives_max:
            oldest = min(tents, key=lambda tr: (tr.last_meas_t, tr.tid))
            self.tracks.remove(oldest)
            self.counters["tentative_dropped"] += 1
        tr = Track(tid=self._next_tid, xy=ob.xy, t=t, born_t=t, born_xy=ob.xy,
                   last_meas_t=t, last_meas_xy=ob.xy, measured=True,
                   born_clipped=any(b.roi_clipped for b in ob.blobs))
        tr.hist.append((t, ob.xy))
        tr.first_t, tr.first_xy = t, ob.xy
        tr.desc = None if ob.desc is None else np.asarray(ob.desc, dtype=np.float64)
        self._next_tid += 1
        self._store_boxes(tr, ob, t)
        self.tracks.append(tr)

    @staticmethod
    def _store_boxes(tr: Track, ob: Obs, t: float) -> None:
        best: dict[int, Blob] = {}
        for b in ob.blobs:
            if b.cam not in best or b.area_px > best[b.cam].area_px:
                best[b.cam] = b
        for cam in list(tr.bbox_by_cam):
            if cam not in best and t - tr.bbox_by_cam[cam][1] > 0.5 and tr.state is not State.STOPPED:
                del tr.bbox_by_cam[cam]
        for cam, b in best.items():
            tr.bbox_by_cam[cam] = (b.bbox, t)

    def _apply(self, tr: Track, ob: Obs, t: float) -> None:
        tp = self.p.track
        if ob.desc is not None and max(max(b.bbox[2], b.bbox[3]) for b in ob.blobs) <= self.p.group_blob_px:
            d_new = np.asarray(ob.desc, dtype=np.float64)
            tr.desc = d_new if tr.desc is None else (1.0 - self.p.desc_ema) * tr.desc + self.p.desc_ema * d_new
        if tr.state is State.STOPPED:
            if math.dist(ob.xy, tr.anchor) <= tp.wake_disp_cm:
                tr.update(t, ob.xy, tp)          # van dung yen: chi ghi nhan
                tr.soft_stop = False
                self._store_boxes(tr, ob, t)
                return
            self._events.append({"type": "wake", "gid": tr.gid, "t": t,
                                 "d": round(math.dist(ob.xy, tr.anchor), 2)})
            tr.resume(t, ob.xy)
            tr.last_meas_t, tr.last_meas_xy, tr.measured = t, ob.xy, True
            self._store_boxes(tr, ob, t)
            return
        if tr.state is State.OCCLUDED:
            tr.state = State.MOVING
            tr.oov = False
        tr.update(t, ob.xy, tp)
        tr.last_clipped = any(b.roi_clipped for b in ob.blobs)
        tr.note_area(t, float(max(b.area_px for b in ob.blobs)), tp)
        self._store_boxes(tr, ob, t)

    def _lifecycle(self, t: float) -> None:
        tp = self.p.track
        keep: list[Track] = []
        for tr in self.tracks:
            silent = t - tr.last_meas_t
            if tr.state is State.TENTATIVE:
                if silent > tp.t_tent_s:
                    self.counters["tentative_expired"] += 1
                    continue
                if (tr.measured and t - tr.born_t >= tp.t_confirm_s
                        and math.dist(tr.born_xy, tr.xy) >= tp.d_confirm_cm):
                    self._confirm(tr, t)
            elif tr.state is State.LOST:
                # LOST khong con vi tri hop le va khong duoc reid. Don theo moc overrun,
                # khong theo last_meas_t (co the da cu tu truoc luc dung).
                if tr.lost_since_t is not None and t - tr.lost_since_t > tp.t_lost_max_s:
                    self.counters["lost_expired"] += 1
                    self._events.append({"type": "lost_expired", "gid": tr.gid, "t": t})
                    continue
            elif tr.group_t == t and not tr.measured and tr.state in (State.MOVING, State.OCCLUDED):
                tr.v = (0.0, 0.0)                    # trong blob nhieu xe: giu nguyen, cho tach
                tr.t = t
                tr.hist.clear()
            elif tr.state is State.MOVING:
                if tr.wake_anchor is not None and math.dist(tr.wake_anchor, tr.xy) >= tp.wake_commit_cm:
                    tr.wake_anchor = None
                if tr.measured:
                    disp = tr.window_disp(tp.stop_window_s)
                    if disp is not None and disp < tp.stop_disp_cm:
                        if tr.wake_anchor is not None:
                            tr.xy = tr.wake_anchor
                        else:
                            tr.settle_xy(t, tp)
                        tr.stop_here(t)
                elif tr.wake_anchor is not None:
                    tr.xy = tr.wake_anchor           # thuc gia: ve lai neo
                    tr.stop_here(t)
                else:
                    tr.state = State.OCCLUDED
                    if ((tr.last_clipped or self._leaving_view(tr)) and tr.gid is not None
                            and tr.speed() >= tp.oov_min_speed_cm_s):
                        tr.oov = True                # ra ngoai mep tam nhin: giu GID cho den khi hien lai
                        tr.t_out = tp.t_exit_out_s if self._in_exit(tr.last_meas_xy) else tp.t_out_s
                        tr.v = (0.0, 0.0)            # khong ngoai suy: neo tai diem do cuoi
                        tr.xy = tr.last_meas_xy
            elif tr.state is State.OCCLUDED and tr.oov:
                if silent > tr.t_out:                # qua T_out: xe da ra that
                    self._exit(tr, t)
                    continue
            elif tr.state is State.OCCLUDED:
                if self._in_exit(tr.last_meas_xy) and tr.last_clipped:
                    if silent > tp.t_occ_s:          # mat o MEP tam nhin trong vung cong ra => da ra
                        self._exit(tr, t)
                        continue
                elif silent > tp.t_coast_s:
                    tr.xy = tr.last_meas_xy          # vinh cuu vat the: xe o noi thay lan cuoi
                    tr.settle_xy(t, tp)
                    tr.stop_here(t, soft=True)
            keep.append(tr)
        self.tracks = [tr for tr in keep if tr.state is not State.EXITED]

    def _leaving_view(self, tr: Track) -> bool:
        """Phep do cuoi + 1 than xe theo huong chay roi ra ngoai hop cac da giac tam nhin (dang ra khoi bai)."""
        polys = self.p.coverage_polys
        if not polys:
            return False
        sp = tr.speed()
        if sp < 1e-6:
            return False
        ux, uy = tr.v[0] / sp, tr.v[1] / sp
        ahead = (tr.last_meas_xy[0] + ux * self.p.exit_reach_cm, tr.last_meas_xy[1] + uy * self.p.exit_reach_cm)
        return not any(_inside(ahead, poly) for poly in polys)

    def _in_slot(self, xy: Point) -> bool:
        return any(_inside(xy, poly) for poly in self.p.slots)

    def _in_exit(self, xy: Point) -> bool:
        return any(_inside(xy, poly) for poly in self.p.exit_zones)

    def _exit(self, tr: Track, t: float) -> None:
        if tr.gid is not None:
            self.counters["exited"] = self.counters.get("exited", 0) + 1
            self._events.append({"type": "gid_exited", "gid": tr.gid, "t": t})

    def _confirm(self, tr: Track, t: float) -> None:
        """M4 rut gon: nhan lai GID tu vet OCCLUDED/LOST toi duoc, khong thi sinh GID moi."""
        p, tp = self.p, self.p.track
        for other in self.tracks:
            # manh vo bam theo mot xe da co GID: khong cap GID
            if (other is not tr and other.gid is not None and other.measured
                    and other.state is State.MOVING
                    and in_footprint(other.last_meas_xy, other.heading, tr.xy, p.foot_along_cm, p.foot_lateral_cm)):
                tr.born_t = t      # hoan xac nhan; neu la manh vo no se tu het han hoac bi hap thu
                tr.born_xy = tr.xy
                return
        at_entry = any(_inside(tr.born_xy, poly) for poly in p.entry_zones)
        # khong nhan lai GID: sinh trong o do (xe do san), hoac sinh o mep tam nhin trong vung cong vao
        in_slot = any(_inside(tr.born_xy, poly) for poly in p.slots) or (at_entry and tr.born_clipped)
        cands = []
        for other in self.tracks:
            if other is tr or other.gid is None or in_slot:
                continue
            # vet LOST do bi xe khac di xuyen qua: vi tri cua no da duoc chung minh la SAI,
            # nen khong nhan lai GID theo khoang cach toi vi tri do
            if not (other.state is State.OCCLUDED
                    or (other.state is State.STOPPED and other.soft_stop)):
                continue
            dt = max(tr.first_t - other.last_meas_t, 0.0)
            if _desc_far(other.desc, tr.desc, dt, p):
                continue
            reach = min(p.reid_speed_cm_s * dt + p.reid_margin_cm, p.reid_cap_cm if dt <= p.reid_short_s else p.reid_cap_long_cm)
            d = math.dist(other.last_meas_xy, tr.first_xy)
            if d <= reach:
                l1 = (float(np.abs(np.asarray(other.desc) - np.asarray(tr.desc)).sum())
                      if other.desc is not None and tr.desc is not None else None)
                cands.append((d + (p.reid_desc_w * l1 if l1 is not None else p.reid_desc_w * 1.0), d, other))
        cands.sort(key=lambda c: (c[0], c[2].gid))
        best, best_d = None, None
        if cands and not (len(cands) > 1 and cands[1][0] - cands[0][0] < p.reid_ambig_cm):
            best, best_d = cands[0][2], cands[0][1]     # mo ho (2 ung vien gan bang nhau) => khong nhan lai, cap GID moi
        tr.state = State.MOVING
        if best is not None:
            tr.gid = best.gid
            tr.bbox_by_cam = {**best.bbox_by_cam, **tr.bbox_by_cam}
            tr.birth_reason = "reid"
            best.state = State.EXITED      # da nhuong GID; _lifecycle se loai (khong sua list khi dang duyet)
            best.gid = None
            self.counters["reid"] += 1
            self._events.append({"type": "reid", "gid": tr.gid, "t": t, "d": round(best_d, 2),
                                 "dt": round(tr.first_t - best.last_meas_t, 2), "from": best.state.name})
        else:
            tr.gid = self._next_gid
            self._next_gid += 1
            tr.birth_reason = "entry" if at_entry else ("parked_wake" if in_slot else "orphan")
            self.counters[tr.birth_reason] = self.counters.get(tr.birth_reason, 0) + 1
            self.counters["births"] += 1
            self._events.append({"type": "gid_created", "gid": tr.gid, "t": t, "xy": tr.born_xy})

    def _outputs(self, t: float) -> list[Output]:
        out = []
        for tr in self.tracks:
            if tr.gid is None or tr.oov or tr.state in (State.LOST, State.EXITED, State.TENTATIVE):
                continue
            if tr.state is State.STOPPED:
                xy, source = tr.anchor or tr.xy, "held"
            elif tr.measured:
                xy, source = tr.xy, "measured"
            else:
                xy, source = tr.predict(t), "predicted"
            out.append(Output(gid=tr.gid, xy=xy, v=tr.v, state=tr.state, source=source,
                              bbox_by_cam={cam: box for cam, (box, _) in sorted(tr.bbox_by_cam.items())},
                              quality=1.0))
        out.sort(key=lambda o: o.gid)
        return out
