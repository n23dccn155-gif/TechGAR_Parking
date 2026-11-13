"""CORE2 — luat tach chu tren MAT DAT (cm), thuan, khong doc track.

Thay cho `_different_clean_owners` (motion_tracker.py:1299-1308) — ham do doc
`track.clean_observations` de biet 2 blob co thuoc 2 xe khac nhau khong.

O day cung cau hoi nhung tra loi bang HINH HOC tren mat dat, khong can lich su:
hai diem cham dat cach nhau > CAR_W (chieu rong xe) thi khong the la cung chiec xe
dang nam doc theo truc chay. Do la gia dinh, do lai o bench.
"""
from __future__ import annotations

from typing import Tuple

from .config import M1OwnerConfig


def ground_distance(left: Tuple[float, float], right: Tuple[float, float]) -> float:
    dx = float(left[0]) - float(right[0])
    dy = float(left[1]) - float(right[1])
    return (dx * dx + dy * dy) ** 0.5


def ground_owner_split(left: Tuple[float, float], right: Tuple[float, float],
                       config: M1OwnerConfig) -> bool:
    """True = 2 blob KHONG the la cung mot xe -> khong duoc gop vi "echo".

    Nguong: owner_ground_separation_cm (mac dinh CAR_W = 4,2 cm).
    Nguon: SPEC_CORE2_ARCH.md §3 (CAR_W 4,2 cm) + gia dinh "di ra giua 2 lan do
    cua cung mot xe nho hon chieu rong than xe". Can do lai: xe lon (CAR_L 9,4)
    hoac blob vo manh doc co the vuot nguong nay.
    """
    return ground_distance(left, right) > float(config.owner_ground_separation_cm)
