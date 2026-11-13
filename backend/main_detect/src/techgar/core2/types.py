"""CORE2 types.py - HOP DONG CUNG (director giu). Chep tu SPEC_CORE2_ARCH.md 5.1."""
from __future__ import annotations

from dataclasses import dataclass
from enum import Enum


@dataclass(frozen=True)
class Blob:                      # M1: mot vung tien canh tren mot camera
    cam: int
    frame: int                   # chi so frame nguon
    t: float                     # giay nguon
    bbox: tuple[int, int, int, int]      # x, y, w, h (pixel)
    xy: tuple[float, float]      # diem cham dat tren mat dat, cm
    area_px: int
    roi_clipped: bool            # bbox cham mep ROI/khung hinh
    roi_support: float           # 0..1
    desc: tuple[float, ...] | None       # mo ta ngoai hinh (co the None)


@dataclass(frozen=True)
class Obs:                       # M2: mot ung vien xe trong mot lat thoi gian
    t: float
    xy: tuple[float, float]
    sigma_cm: float              # do bat dinh vi tri
    cams: tuple[int, ...]        # camera dong gop
    blobs: tuple[Blob, ...]
    quality: float               # 0..1 (L6)
    desc: tuple[float, ...] | None


class State(Enum):
    TENTATIVE = 0   # chua xac nhan, khong GID, khong xuat
    MOVING = 1
    STOPPED = 2     # dung yen (tren lan hoac trong o), giu khong can phep do
    OCCLUDED = 3    # dang chay thi mat phep do, dang du doan
    LOST = 4        # het han du doan; GID con trong so, khong xuat
    EXITED = 5      # da ra cong; GID dong


@dataclass
class Output:                    # M5: cai loi tra ra moi buoc
    gid: int
    xy: tuple[float, float]
    v: tuple[float, float]       # cm/s
    state: State
    source: str                  # "measured" | "held" | "predicted"
    bbox_by_cam: dict[int, tuple[int, int, int, int]]
    quality: float


class Core2Engine:
    def step(self, t: float, frame: int, blobs_by_cam: dict[int, list[Blob]]) -> list[Output]:
        raise NotImplementedError

    def stats(self) -> dict:      # so vet theo state, so GID song, orphan_births, ms tung khau
        raise NotImplementedError
