"""CORE2 M1 — mo ta ngoai hinh (desc) cua mot Blob.

DIRECTOR (B1): `desc` hien None nen engine khong co ngoai hinh de phan xu khi thuc day
hoac tach blob. O day tinh histogram mau TREN MAT NA blob, bo pixel bong.

Khac `tracklet_descriptor.hsv_histogram` (416 chieu HSV+LAB, dung cho gallery dai han
cua legacy): core2 can vector NHO (128 chieu) va chi mau HSV, vi:
  - M4 chi dung desc de PHA HOA (SPEC_CORE2_ARCH §5.5), khong lam Re-ID chinh;
  - dump gzip phai nho (SPEC_M1 §4.4: 13 MB / 10 phut la tran).
Van tai dung `hsv_histogram` khong phu hop vi no 416 chieu va co LAB.

Tat dinh: khong RNG, khong phu thuoc thu tu duyet dict.
"""
from __future__ import annotations

from typing import Optional, Sequence

import cv2
import numpy as np


def blob_descriptor(
    frame: np.ndarray,
    box: tuple[int, int, int, int],
    mask: Optional[np.ndarray],
    *,
    bins: tuple[int, int, int] = (8, 4, 4),
    min_pixels: int = 40,
    round_digits: int = 4,
) -> Optional[tuple[float, ...]]:
    """Histogram HSV 8x4x4 tren pixel tien canh cua blob, chuan hoa L1.

    `mask` = contour da loc AND motion mask (da loai pixel bong o buoc _detect),
    nen pixel ngoai vat the va bong khong vao histogram.

    Tra None khi khong du pixel mau (khong du tin cay) — M4 phai xu ly None.
    """
    x, y, width, height = (int(v) for v in box)
    frame_height, frame_width = frame.shape[:2]
    left = max(0, min(frame_width, x))
    top = max(0, min(frame_height, y))
    right = max(left, min(frame_width, x + width))
    bottom = max(top, min(frame_height, y + height))
    if right <= left or bottom <= top:
        return None

    crop = frame[top:bottom, left:right]
    if crop.size == 0:
        return None

    if mask is not None:
        value = np.asarray(mask)
        if value.shape[:2] == crop.shape[:2]:
            # mask da cat dung bbox (contour_poly AND mask, detect.py)
            selection = value
        elif value.shape[:2] == (frame_height, frame_width):
            selection = value[top:bottom, left:right]
        else:
            return None
        if selection.shape[:2] != crop.shape[:2]:
            return None
        histogram_mask = np.where(selection > 0, 255, 0).astype(np.uint8)
        if cv2.countNonZero(histogram_mask) < min_pixels:
            return None
    else:
        histogram_mask = np.full(crop.shape[:2], 255, dtype=np.uint8)
        if crop.shape[0] * crop.shape[1] < min_pixels:
            return None

    hsv = cv2.cvtColor(crop, cv2.COLOR_BGR2HSV)
    histogram = cv2.calcHist(
        [hsv], [0, 1, 2], histogram_mask,
        [bins[0], bins[1], bins[2]],
        [0, 180, 0, 256, 0, 256],
    ).reshape(-1)
    total = float(histogram.sum())
    if total <= 0.0:
        return None
    histogram = (histogram / total).astype(np.float64)
    return tuple(round(float(v), round_digits) for v in histogram)


def descriptor_distance(left: Optional[Sequence[float]],
                        right: Optional[Sequence[float]]) -> Optional[float]:
    """Khoang cach L1 giua 2 desc chuan hoa (tong = 1). None neu thieu ben nao."""
    if left is None or right is None or len(left) != len(right):
        return None
    a = np.asarray(left, dtype=np.float64)
    b = np.asarray(right, dtype=np.float64)
    return float(np.abs(a - b).sum())
