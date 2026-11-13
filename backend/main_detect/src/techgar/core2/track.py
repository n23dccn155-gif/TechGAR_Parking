"""CORE2 M3 — vet the gioi tren mat dat (cm, giay). Khong nguong theo so frame."""
from __future__ import annotations

from collections import deque
from dataclasses import dataclass, field
import math

from .types import State

Point = tuple[float, float]


@dataclass(frozen=True)
class TrackParams:
    v_max_cm_s: float = 8.0        # G1: GT max 7.1 cm/s
    gate_base_cm: float = 4.0      # ~ k*sigma (S3b: residual p99 3.5 cm)
    alpha: float = 0.6             # loc vi tri
    beta: float = 0.25             # loc van toc
    hist_s: float = 1.6            # do dai lich su vi tri giu lai
    stop_window_s: float = 1.0     # cua so xet dung
    stop_disp_cm: float = 1.2      # di < nguong nay trong cua so => dung
    r_wake_cm: float = 7.0         # SPEC_M3 5,64 + manh blob luc khoi hanh lech ve phia dau xe
    wake_disp_cm: float = 2.5      # roi neo qua nguong nay => chay lai
    wake_commit_cm: float = 4.7    # di qua nguong nay ke tu neo => thuc that (nua than xe)
    wake_revert_s: float = 1.0     # thuc ma mat phep do som, chua qua nguong => ve lai neo
    t_coast_s: float = 0.5         # mat phep do: du doan toi da khoang nay roi DUNG tai cho
    t_confirm_s: float = 0.4
    d_confirm_cm: float = 1.5
    t_tent_s: float = 0.6          # TENTATIVE khong duoc cap nhat qua han => xoa
    t_occ_s: float = 3.2           # S3b
    t_lost_max_s: float = 10.0     # vet LOST do overrun khong reid; giu 10 s de chan doan roi don
    t_out_s: float = 4.5           # OUT_OF_VIEW toi da; BLIND_CORNERS v2: 6 ca vong goc mu dt 3,12-3,92 s
    t_exit_out_s: float = 0.0     # OUT_OF_VIEW trong vung cong ra: xe ra that, khong quay lai
    oov_min_speed_cm_s: float = 2.0   # chi xe dang chay (khong phai xe sap do) moi vao OUT_OF_VIEW
    full_area_ratio: float = 0.7   # blob >= ti le nay cua area_ref => con day du
    full_max_age_s: float = 4.0    # vi tri day du cu hon nguong nay thi khong dung
    full_max_shift_cm: float = 8.0 # blob tan dan lam tam troi toi da ~ nua than xe + du
    slow_cm_s: float = 2.5         # mat phep do khi cham hon nguong => STOPPED


@dataclass
class Track:
    tid: int
    xy: Point
    t: float
    state: State = State.TENTATIVE
    gid: int | None = None
    v: Point = (0.0, 0.0)
    born_t: float = 0.0
    born_xy: Point = (0.0, 0.0)
    last_meas_t: float = 0.0
    last_meas_xy: Point = (0.0, 0.0)
    anchor: Point | None = None            # vi tri neo khi STOPPED
    wake_anchor: Point | None = None       # vua thuc: neo cu de quay ve neu la nhieu
    wake_t: float = 0.0
    soft_stop: bool = False                # dung do mat phep do (chua thay dung yen)
    hist: deque = field(default_factory=deque)
    bbox_by_cam: dict = field(default_factory=dict)   # cam -> (bbox, t)
    measured: bool = False                 # co phep do o buoc hien tai
    max_disp: float = 0.0                  # do doi lon nhat so voi diem sinh
    birth_reason: str = ""
    stop_t: float = 0.0
    area_ref: float = 0.0                  # dien tich blob 'day du' gan day
    full_xy: Point | None = None           # vi tri lan cuoi blob con day du (chua bi MOG2 an mon)
    full_t: float = 0.0
    last_clipped: bool = False             # phep do cuoi cham mep ROI/khung hinh
    desc: object = None                    # np.ndarray 128 chieu (HSV, L1 chuan hoa) trung binh truot, hoac None
    t_out: float = 4.5                     # han OUT_OF_VIEW rieng cua vet (giay)
    first_t: float = 0.0                   # lan dau thay (khong bi hoan xac nhan reset)
    first_xy: Point = (0.0, 0.0)
    oov: bool = False                      # OUT_OF_VIEW: mat o mep tam nhin khi dang chay; giu GID, khong xuat, khong soft-stop
    born_clipped: bool = False             # blob luc sinh cham mep ROI/khung hinh (xe dang di vao tam nhin)
    group_t: float = -1.0                  # buoc gan nhat vet nam trong blob nhieu xe
    heading: Point | None = None           # huong than xe (don vi) theo chuyen dong gan nhat
    lost_since_t: float | None = None      # moc LOST rieng; last_meas_t co the da cu tu luc STOPPED

    def predict(self, t: float) -> Point:
        if self.state is State.STOPPED and self.anchor is not None:
            return self.anchor
        dt = t - self.t
        return (self.xy[0] + self.v[0] * dt, self.xy[1] + self.v[1] * dt)

    def speed(self) -> float:
        return math.hypot(*self.v)

    def window_disp(self, window_s: float) -> float | None:
        """Do doi thang trong cua so gan nhat; None neu lich su chua du dai."""
        if not self.hist:
            return None
        t_now, xy_now = self.hist[-1]
        ref = None
        for t_old, xy_old in self.hist:
            if t_now - t_old >= window_s:
                ref = xy_old
            else:
                break
        if ref is None:
            return None
        # do trai rong cua moi vi tri trong cua so (ben vung voi blob doi hinh dang)
        pts = [xy for t_old, xy in self.hist if t_now - t_old <= window_s]
        xs = [q[0] for q in pts]; ys = [q[1] for q in pts]
        return max(math.dist(ref, xy_now), math.hypot(max(xs) - min(xs), max(ys) - min(ys)))

    def window_speed(self, window_s: float = 0.4) -> float:
        if len(self.hist) < 2:
            return self.speed()
        t_now, xy_now = self.hist[-1]
        ref_t, ref_xy = self.hist[0]
        for t_old, xy_old in self.hist:
            if t_now - t_old >= window_s:
                ref_t, ref_xy = t_old, xy_old
            else:
                break
        dt = t_now - ref_t
        return math.dist(ref_xy, xy_now) / dt if dt > 1e-6 else self.speed()

    def update(self, t: float, xy: Point, p: TrackParams) -> None:
        dt = t - self.t
        if self.state is State.STOPPED and self.anchor is not None:
            # dang neo: khong keo vi tri theo phep do; chi ghi nhan
            self.last_meas_t, self.last_meas_xy, self.measured = t, xy, True
            self.t = t
            return
        if dt <= 1e-9:
            self.xy = ((self.xy[0] + xy[0]) / 2.0, (self.xy[1] + xy[1]) / 2.0)
        else:
            px, py = self.predict(t)
            rx, ry = xy[0] - px, xy[1] - py
            self.xy = (px + p.alpha * rx, py + p.alpha * ry)
            self.v = (self.v[0] + p.beta * rx / dt, self.v[1] + p.beta * ry / dt)
            sp = math.hypot(*self.v)
            if sp > p.v_max_cm_s:
                k = p.v_max_cm_s / sp
                self.v = (self.v[0] * k, self.v[1] * k)
        self.t = t
        self.last_meas_t, self.last_meas_xy, self.measured = t, xy, True
        self.hist.append((t, self.xy))
        while self.hist and t - self.hist[0][0] > p.hist_s:
            self.hist.popleft()
        self.max_disp = max(self.max_disp, math.dist(self.born_xy, self.xy))
        if len(self.hist) >= 2:
            (t0, p0), (t1, p1) = self.hist[0], self.hist[-1]
            d = math.dist(p0, p1)
            if d >= 1.5:
                self.heading = ((p1[0] - p0[0]) / d, (p1[1] - p0[1]) / d)

    def note_area(self, t: float, area: float, p: TrackParams) -> None:
        self.area_ref = max(self.area_ref * 0.999, area)
        if area >= p.full_area_ratio * self.area_ref:
            self.full_xy, self.full_t = self.xy, t

    def settle_xy(self, t: float, p: TrackParams) -> None:
        """Blob cua xe vua dung bi an mon dan lam tam troi di: lay lai vi tri luc blob con day du."""
        if (self.full_xy is not None and t - self.full_t <= p.full_max_age_s
                and math.dist(self.full_xy, self.xy) <= p.full_max_shift_cm):
            self.xy = self.full_xy

    def stop_here(self, t: float, soft: bool = False) -> None:
        self.state = State.STOPPED
        self.anchor = self.xy
        self.v = (0.0, 0.0)
        self.wake_anchor = None
        self.soft_stop = soft
        self.stop_t = t
        self.hist.clear()

    def resume(self, t: float, xy: Point) -> None:
        self.state = State.MOVING
        self.xy = xy
        self.t = t
        self.v = (0.0, 0.0)
        self.wake_anchor, self.wake_t = self.anchor, t
        self.anchor = None
        self.hist.clear()
        self.hist.append((t, xy))


def in_footprint(center: Point, heading: Point | None, pt: Point, along: float, lateral: float) -> bool:
    """pt co nam trong dau chan (elip) quanh center khong; khong co huong thi dung ban kinh nho."""
    dx, dy = pt[0] - center[0], pt[1] - center[1]
    if heading is None:
        r = lateral * 1.2
        return dx * dx + dy * dy <= r * r
    a = dx * heading[0] + dy * heading[1]
    b = -dx * heading[1] + dy * heading[0]
    return (a / along) ** 2 + (b / lateral) ** 2 <= 1.0
