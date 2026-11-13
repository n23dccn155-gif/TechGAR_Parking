"""CORE2 M2 — gop thanh ung vien xe va ban do phu (fuse.py).

Thuc hien SPEC_M2_fuse.md va quyet dinh G1 (2026-11-11).
Thuan tuy khong gian (stateless), khong luu trang thai qua cac frame.
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Any, Dict, Iterable, List, Mapping, Optional, Sequence, Tuple

import numpy as np

from .config import M2Config
from .types import Blob, Obs

try:
    import lap
except ImportError:  # pragma: no cover
    lap = None

Point = Tuple[float, float]
Polygon = Tuple[Point, ...]


def _distance(a: Point, b: Point) -> float:
    return math.hypot(a[0] - b[0], a[1] - b[1])


def _inside(point: Point, polygon: Polygon) -> bool:
    """Ray-casting kiem tra diem trong da giac; bien tinh la inside."""
    x, y = point
    inside = False
    n = len(polygon)
    if n < 3:
        return False
    for i in range(n):
        ax, ay = polygon[i]
        bx, by = polygon[(i + 1) % n]
        cross = (x - ax) * (by - ay) - (y - ay) * (bx - ax)
        if abs(cross) < 1e-7 and min(ax, bx) - 1e-7 <= x <= max(ax, bx) + 1e-7 and min(ay, by) - 1e-7 <= y <= max(ay, by) + 1e-7:
            return True
        if (ay > y) != (by > y) and x < ax + (y - ay) * (bx - ax) / (by - ay):
            inside = not inside
    return inside


def _segment_distance(p: Point, a: Point, b: Point) -> float:
    dx, dy = b[0] - a[0], b[1] - a[1]
    scale = dx * dx + dy * dy
    if scale == 0.0:
        return _distance(p, a)
    u = max(0.0, min(1.0, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / scale))
    return _distance(p, (a[0] + u * dx, a[1] + u * dy))


@dataclass(frozen=True)
class GroundGeometry:
    """Ban do phu, cong va o do tren mat dat tu config."""

    entrance: Tuple[Point, Point]
    exit: Tuple[Point, Point]
    slots: Mapping[str, Polygon] = field(default_factory=dict)
    camera_coverage: Mapping[str, Polygon] = field(default_factory=dict)
    camera_transforms: Mapping[str, Any] = field(default_factory=dict)
    overlap_polygon: Optional[Polygon] = None
    lot_bounds: Optional[Tuple[float, float, float, float]] = None  # min_x, min_y, max_x, max_y
    entrance_direction: str = "positive"
    coverage_x: Optional[Tuple[float, float]] = None
    coverage_y: Optional[Tuple[float, float]] = None

    @classmethod
    def from_config(cls, calibration: Mapping, gates: Mapping, config: Optional[M2Config] = None) -> GroundGeometry:
        def endpoint(gate: Mapping, key: str) -> Point:
            point = gate[key]
            return (float(point["x"]), float(point["y"]))

        slots: dict[str, Polygon] = {}
        for slot_list in calibration.get("parking_slots_world", {}).values():
            for slot in slot_list:
                poly = tuple((float(p[0]), float(p[1])) for p in slot["polygon"])
                slots[str(slot["id"])] = poly

        coverage: dict[str, Polygon] = {}
        for cam_id, pts in calibration.get("camera_coverage_world", {}).items():
            coverage[cam_id] = tuple((float(p["x"]), float(p["y"])) for p in pts)

        transforms: dict[str, Any] = {}
        for cam_id, mat in calibration.get("camera_transforms", {}).items():
            transforms[cam_id] = np.asarray(mat, dtype=np.float64)

        overlap_pts = calibration.get("overlap_world_polygon")
        overlap_poly = tuple((float(p[0]), float(p[1])) for p in overlap_pts) if overlap_pts else None

        bounds_dict = calibration.get("world", {}).get("bounds")
        lot_bounds = None
        if bounds_dict:
            lot_bounds = (
                float(bounds_dict["min_x_cm"]),
                float(bounds_dict["min_y_cm"]),
                float(bounds_dict["max_x_cm"]),
                float(bounds_dict["max_y_cm"]),
            )

        cov_x_list = [p[0] for poly in coverage.values() for p in poly]
        cov_y_list = [p[1] for poly in coverage.values() for p in poly]

        enter = gates["entry_gate"]
        leave = gates["exit_gate"]

        return cls(
            entrance=(endpoint(enter, "p1"), endpoint(enter, "p2")),
            exit=(endpoint(leave, "p1"), endpoint(leave, "p2")),
            slots=slots,
            camera_coverage=coverage,
            camera_transforms=transforms,
            overlap_polygon=overlap_poly,
            lot_bounds=lot_bounds,
            entrance_direction=str(enter.get("direction", "positive")),
            coverage_x=(min(cov_x_list), max(cov_x_list)) if cov_x_list else None,
            coverage_y=(min(cov_y_list), max(cov_y_list)) if cov_y_list else None,
        )

    def coverage(self, point: Point) -> int:
        """Dem so camera nhin thay diem xy (0, 1, hoac 2)."""
        count = 0
        for poly in self.camera_coverage.values():
            if _inside(point, poly):
                count += 1
        return count

    def is_entrance(self, point: Point, margin_cm: float = 5.0) -> bool:
        """Kiem tra diem nam trong hanh lang cong vao."""
        a, b = self.entrance
        if _segment_distance(point, a, b) <= margin_cm:
            return True
        lo_y, hi_y = sorted((a[1], b[1]))
        if not (lo_y - margin_cm <= point[1] <= hi_y + margin_cm):
            return False
        if self.coverage_x is None:
            return False
        gate_x = (a[0] + b[0]) / 2.0
        if self.entrance_direction == "positive":
            return gate_x - margin_cm <= point[0] <= self.coverage_x[1] + margin_cm
        return self.coverage_x[0] - margin_cm <= point[0] <= gate_x + margin_cm

    def is_exit(self, point: Point, margin_cm: float = 5.0) -> bool:
        """Kiem tra diem nam trong hanh lang cong ra."""
        a, b = self.exit
        if _segment_distance(point, a, b) <= margin_cm:
            return True
        lo_y, hi_y = sorted((a[1], b[1]))
        if not (lo_y - margin_cm <= point[1] <= hi_y + margin_cm):
            return False
        if self.coverage_x is None:
            return False
        gate_x = (a[0] + b[0]) / 2.0
        outward_is_negative = sum(p[0] for p in self.exit) < sum(p[0] for p in self.entrance)
        if outward_is_negative:
            return self.coverage_x[0] - margin_cm <= point[0] <= gate_x + margin_cm
        return gate_x - margin_cm <= point[0] <= self.coverage_x[1] + margin_cm

    def zone(self, point: Point, margin_cm: float = 5.0) -> str:
        """Phan loai vung: 'entry', 'exit', hoac 'lot'."""
        if self.is_entrance(point, margin_cm):
            return "entry"
        if self.is_exit(point, margin_cm):
            return "exit"
        return "lot"

    def slot_at(self, point: Point, occupied_slots: Optional[Iterable[str]] = None) -> Optional[str]:
        occupied = None if occupied_slots is None else set(occupied_slots)
        for name, polygon in self.slots.items():
            if (occupied is None or name in occupied) and _inside(point, polygon):
                return name
        return None


@dataclass
class _Cluster:
    cam: int
    blobs: List[Blob]
    xy: Point
    area_px: int
    roi_clipped: bool
    roi_support: float
    world_bounds: Tuple[float, float, float, float]  # min_x, min_y, max_x, max_y


def _project_point(h_mat: np.ndarray, u: float, v: float) -> Point:
    denom = h_mat[2, 0] * u + h_mat[2, 1] * v + h_mat[2, 2]
    if abs(denom) < 1e-12:
        return (float("nan"), float("nan"))
    x = (h_mat[0, 0] * u + h_mat[0, 1] * v + h_mat[0, 2]) / denom
    y = (h_mat[1, 0] * u + h_mat[1, 1] * v + h_mat[1, 2]) / denom
    return (float(x), float(y))


def _blob_world_bounds(b: Blob, geom: GroundGeometry) -> Tuple[float, float, float, float]:
    """Tinh bounding box cua blob tren mat dat (min_x, min_y, max_x, max_y)."""
    cam_keys = [f"cam{b.cam + 1}", f"cam{b.cam}", str(b.cam)]
    h_mat = None
    for k in cam_keys:
        if k in geom.camera_transforms:
            h_mat = geom.camera_transforms[k]
            break

    bx, by, bw, bh = b.bbox
    if h_mat is not None:
        pts = [
            _project_point(h_mat, bx, by),
            _project_point(h_mat, bx + bw, by),
            _project_point(h_mat, bx + bw, by + bh),
            _project_point(h_mat, bx, by + bh),
        ]
        valid_pts = [p for p in pts if math.isfinite(p[0]) and math.isfinite(p[1])]
        if valid_pts:
            xs = [p[0] for p in valid_pts]
            ys = [p[1] for p in valid_pts]
            return (min(xs), min(ys), max(xs), max(ys))

    half_w = max(0.5, bw * 0.5)
    half_h = max(0.5, bh * 0.5)
    return (b.xy[0] - half_w, b.xy[1] - half_h, b.xy[0] + half_w, b.xy[1] + half_h)


def _can_merge_blobs(b1: Blob, b2: Blob, bounds1: Tuple[float, float, float, float],
                     bounds2: Tuple[float, float, float, float], cfg: M2Config) -> bool:
    """Kiem tra 2 blob cung camera co the gop thanh 1 xe theo luat dau chan + union-span."""
    u_min_x = min(bounds1[0], bounds2[0])
    u_max_x = max(bounds1[2], bounds2[2])
    u_min_y = min(bounds1[1], bounds2[1])
    u_max_y = max(bounds1[3], bounds2[3])

    union_span_x = u_max_x - u_min_x
    union_span_y = u_max_y - u_min_y

    max_span = max(union_span_x, union_span_y)
    min_span = min(union_span_x, union_span_y)

    l_max = cfg.car_length_cm * cfg.footprint_span_ratio
    w_max = cfg.car_width_cm * cfg.footprint_span_ratio + cfg.footprint_margin_cm

    return max_span <= l_max and min_span <= w_max


def _cluster_single_camera(blobs: Sequence[Blob], cam: int, geom: GroundGeometry, cfg: M2Config) -> List[_Cluster]:
    """Gop manh vo tren cung mot camera bang Connected Components thoa man luat dau chan."""
    n = len(blobs)
    if n == 0:
        return []

    bounds_list = [_blob_world_bounds(b, geom) for b in blobs]

    if n == 1:
        b = blobs[0]
        return [_Cluster(
            cam=cam, blobs=[b], xy=b.xy, area_px=b.area_px,
            roi_clipped=b.roi_clipped, roi_support=b.roi_support,
            world_bounds=bounds_list[0],
        )]

    adj = [[] for _ in range(n)]
    for i in range(n):
        for j in range(i + 1, n):
            if _can_merge_blobs(blobs[i], blobs[j], bounds_list[i], bounds_list[j], cfg):
                adj[i].append(j)
                adj[j].append(i)

    visited = [False] * n
    clusters: List[_Cluster] = []

    for i in range(n):
        if visited[i]:
            continue
        # BFS
        queue = [i]
        visited[i] = True
        comp = []
        while queue:
            curr = queue.pop(0)
            comp.append(curr)
            for neighbor in adj[curr]:
                if not visited[neighbor]:
                    visited[neighbor] = True
                    queue.append(neighbor)

        c_blobs = [blobs[idx] for idx in comp]
        tot_area = sum(max(1, b.area_px) for b in c_blobs)
        c_x = sum(b.xy[0] * max(1, b.area_px) for b in c_blobs) / tot_area
        c_y = sum(b.xy[1] * max(1, b.area_px) for b in c_blobs) / tot_area
        c_clipped = any(b.roi_clipped for b in c_blobs)
        c_support = min(b.roi_support for b in c_blobs)

        u_min_x = min(bounds_list[idx][0] for idx in comp)
        u_min_y = min(bounds_list[idx][1] for idx in comp)
        u_max_x = max(bounds_list[idx][2] for idx in comp)
        u_max_y = max(bounds_list[idx][3] for idx in comp)

        clusters.append(_Cluster(
            cam=cam,
            blobs=c_blobs,
            xy=(c_x, c_y),
            area_px=tot_area,
            roi_clipped=c_clipped,
            roi_support=c_support,
            world_bounds=(u_min_x, u_min_y, u_max_x, u_max_y),
        ))

    return clusters


def _solve_cross_match(
    c0: Sequence[_Cluster], c1: Sequence[_Cluster], gate_cm: float
) -> Tuple[List[Tuple[int, int]], List[int], List[int]]:
    """Ghep 1-1 toi uu giua 2 cum camera trong vung chong lan."""
    n0, n1 = len(c0), len(c1)
    if n0 == 0 or n1 == 0:
        return [], list(range(n0)), list(range(n1))

    cost_matrix = np.full((n0, n1), 1e6, dtype=np.float64)
    has_valid_edge = False
    for i in range(n0):
        for j in range(n1):
            d = _distance(c0[i].xy, c1[j].xy)
            if d <= gate_cm:
                cost_matrix[i, j] = d
                has_valid_edge = True

    if not has_valid_edge:
        return [], list(range(n0)), list(range(n1))

    matched: List[Tuple[int, int]] = []
    used_c0 = set()
    used_c1 = set()

    if lap is not None:
        try:
            _, x, y = lap.lapjv(cost_matrix, extend_cost=True, cost_limit=gate_cm)
            for i, j in enumerate(x):
                if j >= 0 and cost_matrix[i, j] <= gate_cm:
                    matched.append((i, j))
                    used_c0.add(i)
                    used_c1.add(j)
        except Exception:  # fallback greedy
            pass

    if not matched:  # greedy fallback
        edges = []
        for i in range(n0):
            for j in range(n1):
                if cost_matrix[i, j] <= gate_cm:
                    edges.append((cost_matrix[i, j], i, j))
        edges.sort(key=lambda x: x[0])
        for _, i, j in edges:
            if i not in used_c0 and j not in used_c1:
                matched.append((i, j))
                used_c0.add(i)
                used_c1.add(j)

    unmatched_0 = [i for i in range(n0) if i not in used_c0]
    unmatched_1 = [j for j in range(n1) if j not in used_c1]
    return matched, unmatched_0, unmatched_1


def _create_obs_from_clusters(t: float, clusters: Sequence[_Cluster], cfg: M2Config) -> Obs:
    all_blobs: List[Blob] = []
    cams_seen = set()
    for c in clusters:
        all_blobs.extend(c.blobs)
        cams_seen.add(c.cam)

    cams_tuple = tuple(sorted(cams_seen))
    is_multi_cam = len(cams_tuple) > 1

    weights = []
    for c in clusters:
        w = max(1.0, float(c.area_px))
        if c.roi_clipped:
            w *= 0.5
        w *= max(0.1, c.roi_support)
        weights.append(w)

    tot_w = sum(weights)
    fused_x = sum(c.xy[0] * w for c, w in zip(clusters, weights)) / tot_w
    fused_y = sum(c.xy[1] * w for c, w in zip(clusters, weights)) / tot_w

    if is_multi_cam:
        sigma_cm = 1.0 * 0.7071
    else:
        sigma_cm = 1.0

    any_clipped = any(c.roi_clipped for c in clusters)
    min_support = min(c.roi_support for c in clusters)

    if any_clipped:
        sigma_cm *= 1.5
    if min_support < 0.8:
        sigma_cm *= 1.0 + (0.8 - min_support)

    quality = 1.0 if is_multi_cam else 0.9
    quality *= min_support
    if any_clipped:
        quality *= 0.6
    quality = float(min(1.0, max(0.05, quality)))

    desc = None
    descs = [b.desc for b in all_blobs if b.desc is not None]
    if descs:
        desc = descs[0]

    return Obs(
        t=t,
        xy=(fused_x, fused_y),
        sigma_cm=float(sigma_cm),
        cams=cams_tuple,
        blobs=tuple(all_blobs),
        quality=quality,
        desc=desc,
    )


def fuse(
    t: float,
    frame: int,
    blobs_by_cam: Mapping[int, Sequence[Blob]],
    geometry: GroundGeometry,
    config: Optional[M2Config] = None,
) -> List[Obs]:
    """Gop blob thanh cac ung vien Obs duy nhat trong mot lat cat thoi gian."""
    cfg = config or M2Config()

    compensate = getattr(cfg, "compensate_offset", False)
    cam_ox = getattr(cfg, "cam_offset_x", (0.0, 0.0))
    cam_oy = getattr(cfg, "cam_offset_y", (0.0, 0.0))

    # Bu offset neu duoc bat (Quyet dinh A)
    cam_blobs: Dict[int, List[Blob]] = {}
    for cam_id, b_list in blobs_by_cam.items():
        processed_list = []
        for b in b_list:
            if not (math.isfinite(b.xy[0]) and math.isfinite(b.xy[1])):
                continue
            if compensate and cam_id in (0, 1):
                ox = cam_ox[cam_id]
                oy = cam_oy[cam_id]
                b_adj = Blob(
                    cam=b.cam, frame=b.frame, t=b.t, bbox=b.bbox,
                    xy=(b.xy[0] + ox, b.xy[1] + oy),
                    area_px=b.area_px, roi_clipped=b.roi_clipped,
                    roi_support=b.roi_support, desc=b.desc,
                )
                processed_list.append(b_adj)
            else:
                processed_list.append(b)
        cam_blobs[cam_id] = processed_list

    # Gop manh vo cung camera (Same-camera fragmentation)
    single_cam_clusters: Dict[int, List[_Cluster]] = {}
    for cam_id, blobs in cam_blobs.items():
        single_cam_clusters[cam_id] = _cluster_single_camera(blobs, cam_id, geometry, cfg)

    # Gop cheo camera (Cross-camera fusion)
    c0 = single_cam_clusters.get(0, [])
    c1 = single_cam_clusters.get(1, [])

    matched_pairs, un0, un1 = _solve_cross_match(c0, c1, cfg.cross_camera_gate_cm)

    obs_list: List[Obs] = []
    for i, j in matched_pairs:
        obs_list.append(_create_obs_from_clusters(t, [c0[i], c1[j]], cfg))

    for i in un0:
        obs_list.append(_create_obs_from_clusters(t, [c0[i]], cfg))

    for j in un1:
        obs_list.append(_create_obs_from_clusters(t, [c1[j]], cfg))

    for cam_id, c_list in single_cam_clusters.items():
        if cam_id not in (0, 1):
            for c in c_list:
                obs_list.append(_create_obs_from_clusters(t, [c], cfg))

    return obs_list


class Fuser:
    """Bo xu ly M2 (fuse) stateless."""

    def __init__(self, geometry: GroundGeometry, config: Optional[M2Config] = None):
        self.geometry = geometry
        self.config = config or M2Config()

    def step(self, t: float, frame: int, blobs_by_cam: Mapping[int, Sequence[Blob]]) -> List[Obs]:
        return fuse(t, frame, blobs_by_cam, self.geometry, self.config)

    def fuse(self, t: float, frame: int, blobs_by_cam: Mapping[int, Sequence[Blob]]) -> List[Obs]:
        return self.step(t, frame, blobs_by_cam)
