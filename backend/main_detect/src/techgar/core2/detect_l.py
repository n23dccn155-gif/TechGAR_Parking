"""CORE2 M1L — detector học máy đọc ONNX bằng cv2.dnn, CÙNG GIAO DIỆN với detect.py.

File MỚI. KHÔNG sửa `detect.py`/`config.py` đang dùng cho runtime.

Hợp đồng (giống `CameraDetector`):
    M1LDetector(cam, transform, onnx_path, config=None)
    .set_roi(mask)
    .prepare(...)  # không cần, giữ để tương thích chữ ký (trả dict rỗng)
    .step(frame, frame_idx, t, owner_grounds=(), prepared=None) -> list[Blob]

Ra `Blob` đúng `core2/types.py`:
  - `xy`  : tâm xe trên MẶT ĐẤT (cm) = chiếu điểm (u, v) tâm qua homography hiện có
  - `bbox`: 85x35 px (SPEC_M1L §2), xoay theo hướng nếu biết (hiện chưa có hướng -> trục x)
  - `desc`: 128 chiều HSV trên mặt nạ = bbox AND ROI (dùng lại `core2/desc.py`)
  - `roi_clipped`: bbox chạm mép khung/ROI
  - `area_px`: ước lượng từ bbox

Giải mã TẤT ĐỊNH: NMS 5x5 + khoảng cách 2,5 ô, ngưỡng 0,3 (ĐO trên VAL:
recall 96,94 %, precision 99,97 %, 1,00 đỉnh/xe — xem run_gpu1/eval_full.json).

Lệch hệ thống: `OFFSET_CM` hiệu chuẩn trên run TRAIN/VAL (không dùng 3 run test).
"""
from __future__ import annotations

import json
import math
import pathlib
from typing import Dict, List, Optional, Sequence, Tuple

import cv2
import numpy as np

from .config import M1Config
from .types import Blob

# Tham so giai ma: DOC TU decode_config.json (1 bo duy nhat, director chi dao).
# Khong hardcode nua; gia tri duoi chi la FALLBACK khi file thieu.
_DEFAULT_CONFIG = None


def load_decode_config(path: str | pathlib.Path | None = None) -> dict:
    """Doc .orca/core2/m1l/run_gpu1/decode_config.json (hoac duong dan chi dinh)."""
    global _DEFAULT_CONFIG
    if path is None:
        # detect_l.py ở backend/main_detect/src/techgar/core2/ => repo root là parents[5]
        path = (pathlib.Path(__file__).resolve().parents[5]
                / ".orca/core2/m1l/run_gpu1/decode_config.json")
    path = pathlib.Path(path)
    if not path.is_file():
        raise FileNotFoundError(f"KHONG co decode_config.json: {path}")
    config = json.loads(path.read_text(encoding="utf-8"))
    _DEFAULT_CONFIG = config
    return config


NMS_KERNEL = 5
NMS_RADIUS = 2.5
THRESHOLD = 0.3
INPUT_SIZE = 384          # ảnh vuông đưa vào mạng
STRIDE = 4
CAR_W_PX, CAR_H_PX = 85, 35     # SPEC_M1L §2 (ĐO từ blob M1 cũ)


def decode_final(heatmap: np.ndarray, threshold: float = THRESHOLD,
                 kernel: int = NMS_KERNEL, radius: float = NMS_RADIUS):
    """NMS kernel×kernel rồi greedy theo khoảng cách. TẤT ĐỊNH (tie-break theo y,x)."""
    pooled = cv2.dilate(heatmap.astype(np.float32),
                        np.ones((kernel, kernel), np.uint8))
    keep = (pooled == heatmap) & (heatmap > threshold)
    ys, xs = np.nonzero(keep)
    if len(xs) == 0:
        return np.zeros(0), np.zeros(0), np.zeros(0)
    conf = heatmap[ys, xs]
    order = sorted(range(len(conf)), key=lambda i: (-float(conf[i]),
                                                    int(ys[i]), int(xs[i])))
    kept_x, kept_y, kept_c = [], [], []
    for index in order:
        px, py = float(xs[index]), float(ys[index])
        if all((px - kx) ** 2 + (py - ky) ** 2 > radius * radius
               for kx, ky in zip(kept_x, kept_y)):
            kept_x.append(px)
            kept_y.append(py)
            kept_c.append(float(conf[index]))
    return (np.asarray(kept_x, dtype=np.float32),
            np.asarray(kept_y, dtype=np.float32),
            np.asarray(kept_c, dtype=np.float32))


def decode_refine(heatmap: np.ndarray, threshold: float = THRESHOLD,
                  kernel: int = NMS_KERNEL, radius: float = NMS_RADIUS,
                  method: str = "peak"):
    """Giải mã TẤT ĐỊNH + (tuỳ chọn) tính lại tâm dưới-ô.

    method="peak"      : (ô đỉnh) — HÀNH VI CŨ, mặc định
    method="centroid5" : trọng tâm có trọng số heat^2 trong cửa sổ 5x5
    method="parabola"  : nội suy parabol 3 điểm mỗi trục

    ĐO TRÊN VAL (eval_ablate.json, 600 ảnh): "peak" TỐT NHẤT (p95 1,721 cm);
    centroid5 2,301 và parabola 2,360 đều tệ hơn ⇒ mặc định giữ "peak".
    """
    pooled = cv2.dilate(heatmap.astype(np.float32),
                        np.ones((kernel, kernel), np.uint8))
    keep = (pooled == heatmap) & (heatmap > threshold)
    ys, xs = np.nonzero(keep)
    if len(xs) == 0:
        return np.zeros(0), np.zeros(0), np.zeros(0)
    conf = heatmap[ys, xs]
    order = sorted(range(len(conf)), key=lambda i: (-float(conf[i]),
                                                    int(ys[i]), int(xs[i])))
    kept_x, kept_y, kept_c = [], [], []
    height, width = heatmap.shape
    for index in order:
        ix, iy = int(xs[index]), int(ys[index])
        if any((ix - kx) ** 2 + (iy - ky) ** 2 <= radius * radius
               for kx, ky in zip(kept_x, kept_y)):
            continue
        fx, fy = float(ix), float(iy)
        if method == "centroid5":
            x0, x1 = max(0, ix - 2), min(width, ix + 3)
            y0, y1 = max(0, iy - 2), min(height, iy + 3)
            window = heatmap[y0:y1, x0:x1].astype(np.float64)
            weight = window ** 2
            total = weight.sum()
            if total > 0:
                gy, gx = np.mgrid[y0:y1, x0:x1]
                fx = float((weight * gx).sum() / total)
                fy = float((weight * gy).sum() / total)
        elif method == "parabola":
            if 0 < ix < width - 1:
                left = float(heatmap[iy, ix - 1])
                centre = float(heatmap[iy, ix])
                right = float(heatmap[iy, ix + 1])
                denom = left - 2 * centre + right
                if abs(denom) > 1e-9:
                    fx = ix + 0.5 * (left - right) / denom
            if 0 < iy < height - 1:
                up = float(heatmap[iy - 1, ix])
                centre = float(heatmap[iy, ix])
                down = float(heatmap[iy + 1, ix])
                denom = up - 2 * centre + down
                if abs(denom) > 1e-9:
                    fy = iy + 0.5 * (up - down) / denom
        elif method != "peak":
            raise ValueError(f"refine.method khong hop le: {method!r} "
                             f"(cho phep peak/centroid5/parabola)")
        kept_x.append(fx)
        kept_y.append(fy)
        kept_c.append(float(conf[index]))
    return (np.asarray(kept_x, dtype=np.float32),
            np.asarray(kept_y, dtype=np.float32),
            np.asarray(kept_c, dtype=np.float32))


class M1LDetector:
    """Một camera. Dùng ONNX + cv2.dnn; không phụ thuộc torch ở runtime."""

    def __init__(self, cam: int, transform: np.ndarray, onnx_path: str | pathlib.Path,
                 config: Optional[M1Config] = None,
                 offset_cm: Tuple[float, float] = (0.0, 0.0),
                 threshold: Optional[float] = None,
                 threads: int = 4,
                 decode_config: str | pathlib.Path | None = None,
                 compute_desc: bool = True):
        self.cam = int(cam)
        self.compute_desc = bool(compute_desc)
        self.config = config or M1Config()
        matrix = np.asarray(transform, dtype=np.float64)
        if matrix.shape != (3, 3):
            raise ValueError(f"camera {cam}: transform phải 3x3, nhận {matrix.shape}")
        self.transform = matrix
        self.inverse = np.linalg.inv(matrix)
        # DOC decode_config.json (1 bo duy nhat) — CW: eval_full/dump_val/detect_l cung doc
        cfg = load_decode_config(decode_config)
        self.decode_cfg = cfg
        self.nms_kernel = int(cfg["decode"]["nms_kernel"])
        self.nms_radius = float(cfg["decode"]["nms_radius_cells"])
        self.threshold = (float(threshold) if threshold is not None
                          else float(cfg["decode"]["threshold"]))
        # M1L_DECODE2: truong 'refine' (thieu thi hanh vi y nhu cu = "peak")
        refine = cfg.get("refine") or {}
        self.refine_method = str(refine.get("method", "peak"))
        allowed = refine.get("allowed") or ["peak", "centroid5", "parabola"]
        if self.refine_method not in allowed:
            raise ValueError(
                f"decode_config.refine.method={self.refine_method!r} khong hop le; "
                f"cho phep {allowed}")
        # offset: uu tien tham so truyen vao, khong thi lay tu config theo camera
        if offset_cm == (0.0, 0.0):
            raw = cfg.get("offset_cm", {}).get(str(self.cam))
            if raw:
                offset_cm = (float(raw[0]), float(raw[1]))
        self.offset_cm = (float(offset_cm[0]), float(offset_cm[1]))
        path = pathlib.Path(onnx_path)
        if not path.is_file():
            raise FileNotFoundError(f"KHONG co ONNX: {path}")
        cv2.setNumThreads(int(threads))
        self.net = cv2.dnn.readNetFromONNX(str(path))
        self.roi_mask: Optional[np.ndarray] = None
        self._roi_bounds: Optional[Tuple[int, int, int, int]] = None
        self.stats = {"frames": 0, "blobs": 0, "ms_infer": 0.0}

    # ------------------------------------------------------------ helpers
    def set_roi(self, mask: Optional[np.ndarray]) -> None:
        self.roi_mask = None if mask is None else np.ascontiguousarray(mask, np.uint8)
        self._roi_bounds = None
        if mask is not None:
            pixels = cv2.findNonZero(mask)
            if pixels is not None:
                x, y, w, h = cv2.boundingRect(pixels)
                self._roi_bounds = (x, y, x + w, y + h)

    def ground_point(self, u: float, v: float) -> Tuple[float, float]:
        p = self.transform @ np.asarray([float(u), float(v), 1.0], dtype=np.float64)
        if not np.isfinite(p).all() or abs(p[2]) < 1e-12:
            raise ValueError(f"camera {self.cam}: chiếu mặt đất không hữu hạn ({u},{v})")
        return float(p[0] / p[2]), float(p[1] / p[2])

    def _roi_box(self, shape) -> Tuple[int, int, int, int]:
        if self._roi_bounds is not None:
            return self._roi_bounds
        return (0, 0, shape[1], shape[0])

    # ------------------------------------------------------------ API
    def prepare(self, frame, timestamp_s=None, frame_idx=None) -> dict:
        """Không cần tiền xử lý ngoài; giữ để tương thích chữ ký detect.py."""
        return {}

    def step(self, frame: np.ndarray, frame_idx: int, t: float,
             owner_grounds: Sequence[Tuple[float, float]] = (),
             prepared: Optional[dict] = None) -> List[Blob]:
        import time
        began = time.perf_counter()
        height, width = frame.shape[:2]
        x0, y0, x1, y1 = self._roi_box(frame.shape)
        if x1 <= x0 or y1 <= y0:
            return []
        # bước cuối detect_l.py lap lai dung nhieu lan: khung hinh lay tu frame; roi cat
        # khung nay la cua so co dinh cua run chua dung; chon "fit" (giu ti le)
        crop = frame[y0:y1, x0:x1]
        if crop.size == 0:
            return []
        # anh nua do phan giai: cat ROI roi thu nho 1/2 (nhu dataset)
        half = cv2.resize(crop, (max(1, round(crop.shape[1] / 2)),
                                 max(1, round(crop.shape[0] / 2))),
                          interpolation=cv2.INTER_AREA)
        # dua ve INPUT_SIZE vuong cho mang (stretch: dataset cung lam vay)
        small = cv2.resize(half, (INPUT_SIZE, INPUT_SIZE), interpolation=cv2.INTER_AREA)
        blob = cv2.dnn.blobFromImage(small, 1.0 / 255.0, (INPUT_SIZE, INPUT_SIZE),
                                     swapRB=True, crop=False)
        self.net.setInput(blob)
        out = self.net.forward()[0]                 # (3, H/4, W/4)
        heat = 1.0 / (1.0 + np.exp(-out[0].astype(np.float32)))
        offs = out[1:]

        # M1L_DECODE2: tam diem theo 'refine' trong decode_config (mac dinh "peak" = cu).
        # "peak" cong offset head (da hieu chuan); centroid5/parabola KHONG cong offset head
        # vi tam da tinh lai tu heatmap (cong nua la cong hai lan hieu chinh — da do).
        xs, ys, _conf = decode_refine(heat, self.threshold, self.nms_kernel,
                                      self.nms_radius, self.refine_method)
        use_head_offset = (self.refine_method == "peak")
        blobs: List[Blob] = []
        half_w, half_h = half.shape[1], half.shape[0]
        cell_to_half_x = half_w / (INPUT_SIZE / STRIDE)
        cell_to_half_y = half_h / (INPUT_SIZE / STRIDE)
        for index in range(len(xs)):
            ix = min(max(int(round(float(xs[index]))), 0), heat.shape[1] - 1)
            iy = min(max(int(round(float(ys[index]))), 0), heat.shape[0] - 1)
            fx = float(xs[index]) + (float(offs[0, iy, ix]) if use_head_offset else 0.0)
            fy = float(ys[index]) + (float(offs[1, iy, ix]) if use_head_offset else 0.0)
            px_half = fx * cell_to_half_x
            py_half = fy * cell_to_half_y
            # ảnh nửa -> pixel full frame
            u = px_half * 2.0 + x0
            v = py_half * 2.0 + y0
            if not (0 <= u < width and 0 <= v < height):
                continue
            try:
                gx, gy = self.ground_point(u, v)
            except ValueError:
                continue
            gx += self.offset_cm[0]
            gy += self.offset_cm[1]
            # bbox: tâm tại (u, v), kích thước cố định; đáy bbox = điểm chạm đất
            bx = int(round(u - CAR_W_PX / 2.0))
            by = int(round(v - CAR_H_PX))
            box = (bx, by, CAR_W_PX, CAR_H_PX)
            clipped = (bx <= 0 or by <= 0 or bx + CAR_W_PX >= width
                       or by + CAR_H_PX >= height)
            support = 1.0
            if self.roi_mask is not None:
                cx0, cy0 = max(0, bx), max(0, by)
                cx1, cy1 = min(width, bx + CAR_W_PX), min(height, by + CAR_H_PX)
                if cx1 > cx0 and cy1 > cy0:
                    area = float((cx1 - cx0) * (cy1 - cy0))
                    inside = float(np.count_nonzero(self.roi_mask[cy0:cy1, cx0:cx1]))
                    support = inside / area
                    if support < 0.98:
                        clipped = True
            # desc 128 chiều trên mặt nạ = bbox AND ROI (dùng lại desc.py)
            desc = None
            if self.compute_desc and self.config.desc_enabled:
                from .desc import blob_descriptor
                mask = None
                if self.roi_mask is not None:
                    mask = self.roi_mask
                desc = blob_descriptor(
                    frame, box, mask,
                    bins=(self.config.desc_bins_h, self.config.desc_bins_s,
                          self.config.desc_bins_v),
                    min_pixels=self.config.desc_min_pixels,
                    round_digits=self.config.desc_round,
                )
            blobs.append(Blob(
                cam=self.cam, frame=int(frame_idx), t=float(t),
                bbox=box, xy=(gx, gy),
                area_px=int(round(CAR_W_PX * CAR_H_PX * 0.45)),
                roi_clipped=bool(clipped),
                roi_support=float(min(1.0, max(0.0, support))),
                desc=desc,
            ))
        elapsed = (time.perf_counter() - began) * 1000.0
        self.stats["frames"] += 1
        self.stats["blobs"] += len(blobs)
        self.stats["ms_infer"] += elapsed
        return blobs


def load_offsets(path: str | pathlib.Path) -> Dict[int, Tuple[float, float]]:
    """Đọc file hiệu chuẩn lệch hệ thống (xem m1l/calibrate_offset.py)."""
    data = json.loads(pathlib.Path(path).read_text(encoding="utf-8"))
    return {int(k): (float(v[0]), float(v[1])) for k, v in data.items()}
