"""CORE2 — nguon tham so DUY NHAT (TASK_B1: khong hardcode trong mo-dun).

Moi gia tri ghi nguon goc: so lieu nao, hoac "gia dinh, can do".
Nguon so lieu: .orca/core2/SPEC_M1_detect_dump.md, SPEC_CORE2_ARCH.md, G1_DECISIONS.md,
.bench: .orca/core2/s1_bench_*.py (do tren sang_10p f3200, frame 800x1280).
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Tuple


@dataclass(frozen=True)
class M1Config:
    """M1 — phep do moi camera. Gia tri = legacy dang PASS P37, KHONG tinh chinh o M1.

    OWNER: coders-1 (B1). Pane khac KHONG sua dataclass nay.
    """

    # --- MOG2 (motion_tracker.py:237) ---
    mog_history: int = 700                 # legacy; so frame DA XU LY (phu thuoc stride)
    mog_var_threshold: int = 32            # legacy
    mog_detect_shadows: bool = True        # legacy; can cho nhanh 127

    # --- nguong contour (two_camera.py:2503-2546, motion_tracker.py:66-68) ---
    min_area_px: int = 650                 # legacy; xe ~78x44 px ~ 3400 px
    min_width_px: int = 22                 # legacy
    min_height_px: int = 18                # legacy
    priority_min_area_px: int = 350        # legacy (vung chu y)
    priority_motion_min_ratio: float = 0.03
    priority_motion_min_pixels: int = 50
    motion_threshold: int = 20             # legacy grey-level
    motion_min_pixels: int = 100
    motion_min_ratio: float = 0.05
    motion_join_kernel_size: int = 5
    motion_join_iterations: int = 1
    max_bbox_width_ratio: float = 0.30
    max_bbox_height_ratio: float = 0.42
    max_bbox_area_ratio: float = 0.12
    roi_context_padding_px: int = 48       # legacy band de hoan thien contour cat mep

    # --- cua so thoi gian (motion_tracker.py:79-80) : theo GIAY, khong theo frame ---
    temporal_short_s: float = 0.25
    temporal_long_s: float = 0.80
    temporal_tolerance: float = 2.25       # motion_tracker.py:576 (0.45x .. 2.25x)

    # --- loai bong (motion_tracker.py:89-93) ---
    reject_cast_shadows: bool = True
    shadow_attenuation_range: Tuple[float, float] = (0.32, 0.62)
    shadow_max_chromaticity_distance: float = 0.10
    shadow_max_scaled_residual: float = 0.08
    shadow_min_explained_fraction: float = 0.75
    shadow_min_pixels: int = 120
    # MOI (B1): tran so pixel lay mau cho thong ke bong. Moi metric cua
    # _cast_shadow_metrics la median/ty le nen lay mau con giu dung nghia thong ke.
    # Do: 492 lan goi/100 frame, mean 0.37 ms/lan => 1.83 ms/frame (43% vong contour).
    # Bench .orca/core2/b1_shadow_cost.py tren sang_10p f3200, 120 frame:
    #   khong cap 9.68 ms -> cap 1500 6.47 -> cap 600 3.57 -> cap 300 3.46
    #   tong blob KHONG doi (563 ca 4 cau hinh) => cap 600 an toan.
    shadow_sample_cap: int = 600           # do: blob khong doi, step 9.68 -> 3.57 ms
    shadow_sample_seed: int = 0            # buoc lay mau tat dinh (khong dung RNG)

    # --- nhanh nua ti le (two_camera.py:2330 --fast-motion, MAC DINH TAT) ---
    fast_motion: bool = False              # G1: chua bat khi chua do chat luong
    fast_motion_scale: float = 0.5

    # --- mo ta ngoai hinh (desc) cho Blob: DIRECTOR da CHOT bat (M1D) ---
    # Histogram HSV tren MAT NA blob (contour da loc AND motion mask) => bo pixel bong.
    # 128 chieu = 8x4x4, chuan hoa L1. Bang chung tach biet: AUC 0.967-0.992,
    # xem .orca/core2/DESC_AUC.md. Nho hon 416 chieu legacy (gallery dai han).
    desc_enabled: bool = True
    desc_bins_h: int = 8
    desc_bins_s: int = 4
    desc_bins_v: int = 4
    desc_min_pixels: int = 40           # duoi nguong nay desc = None (khong du mau)
    desc_round: int = 4                 # so chu so thap phan: dump nho, van du pha hoa

    # --- dau chan vet STOPPED do ENGINE dua vao (thay priority_regions cua binder) ---
    # Ban kinh vung "chu y" quanh diem cham dat cua vet dang song, tinh bang pixel
    # sau khi chieu nguoc. Suy tu CAR_L (SPEC_CORE2_ARCH.md §3): mot vet chiem
    # ~1 than xe => ban kinh ~ 2 x CAR_L la du rong cho sai so chieu.
    owner_radius_cm: float = 18.8          # = 2 x CAR_L 9,4; gia dinh, can do

    def mog_kwargs(self) -> dict:
        import cv2
        return dict(history=self.mog_history, varThreshold=self.mog_var_threshold,
                    detectShadows=self.mog_detect_shadows)

    def new_mog2(self):
        import cv2
        return cv2.createBackgroundSubtractorMOG2(**self.mog_kwargs())


@dataclass(frozen=True)
class M1OwnerConfig:
    """Tham so B1 dan xuat cho luat 'tach chu tren mat dat' cua M1.

    OWNER: coders-1. Tach rieng khoi M2Config de M2 khong phai sua khi coders-4
    doi dau chan. Nguong lay tu kich thuoc xe (SPEC_CORE2_ARCH.md §3).
    """

    owner_ground_separation_cm: float = 4.2   # = CAR_W; "2 blob khac chu" khi 2 diem
                                              # cham dat cach nhau > chieu rong xe
                                              # (gia dinh, can do: xe vo manh doc co the vuot)


@dataclass(frozen=True)
class M4Config:
    """Ledger-specific parameters; initial assumptions, calibrate on G2."""

    t_lost_max_s: float = 3600.0       # SPEC_M4 §4: giả định, cần đo
    defer_capacity: int = 256          # G1-H: giả định, cần đo cảnh 600 s
    event_capacity: int = 4096         # giả định, cần đo; đầy thì từ chối commit
    cost_max: float = 0.8              # SPEC_M4 §4: giả định, cần đo
    ambiguity_delta: float = 0.10      # SPEC_M4 §4: giả định, cần đo
    position_weight: float = 0.75      # SPEC_M4 §4: giả định, cần đo
    heading_weight: float = 0.20       # SPEC_M4 §4: giả định, cần đo
    appearance_weight: float = 0.03    # SPEC_M4 §4: giả định, cần đo
    size_weight: float = 0.02          # SPEC_M4 §4: giả định, cần đo
    epsilon_cm: float = 0.1            # SPEC_M4 §4: giả định, cần đo


@dataclass(frozen=True)
class M2Config:
    """M2 — gop blob + ban do phu. OWNER: coders-4 (B1-fuse).

    Suy tu .orca/core2/SPEC_M2_fuse.md §3.1: A p99 23.72 cm > B p01 10.56 cm
    => khong nguong khoang cach nao dung duoc; luat la DAU CHAN.
    """

    car_length_cm: float = 9.4             # SPEC_CORE2_ARCH.md §3
    car_width_cm: float = 4.2              # SPEC_CORE2_ARCH.md §3
    footprint_margin_cm: float = 1.0       # gia dinh, can do (SPEC_M2 §4)
    footprint_span_ratio: float = 1.25     # do tu 291 cap A o B1F: dat 96.6% A, 1.6% B; vuot 1.25 A khong tang
    gate_band_cm: float = 5.0              # gia dinh, can do (SPEC_M2 §8.4)
    cross_camera_gate_cm: float = 9.0      # calibration.matching_defaults (du lieu AO! G1-I)
    growth_sigma_base_cm: float = 3.0      # SPEC §1 p99 3.3 cm cheo camera
    compensate_offset: bool = False        # Quyet dinh A: bu offset neu M7 bao lech > 1 cm (gia dinh, can do)
    cam_offset_x: Tuple[float, float] = (0.0, 0.0) # (cam0_dx, cam1_dx)
    cam_offset_y: Tuple[float, float] = (0.0, 0.0) # (cam0_dy, cam1_dy)


@dataclass(frozen=True)
class M3Config:
    """M3 — vet the gioi. OWNER: coders-2 (B2). Gia tri = SPEC_M3_track.md bang tham so (do tu GT, hieu chuan lai o G2)."""

    v_stop_cm_s: float = 2.0       # SPEC_M3: do tu GT; ranh gioi quy uoc
    t_stop_s: float = 1.4          # SPEC_M3: p95 doan cham 1,36 s
    r_wake_cm: float = 5.64        # SPEC_M3: residual xe chay p99 3,523 cm; footprint SPEC
    t_confirm_s: float = 0.4       # SPEC_M3: do tu GT, khong chot D_confirm=1,0 (duong cong o B2)
    d_confirm_cm: float = 1.0      # SPEC_M3: gan p05 do dời 0,4 s
    t_tent_s: float = 2.0          # SPEC_M3: gia dinh, can do; >= t_confirm_s
    t_occluded_s: float = 0.0      # chua chot (S3); B2 dat sau khi do confusion GT
    tentatives_max: int = 64       # G1-H: gia dinh, can do; vuot -> bo vet cu nhat


@dataclass(frozen=True)
class Core2Config:
    """Gom moi tham so toan he. Moi pane CHI sua dataclass cua minh; lop nay chi ghep.

    m1 (coders-1) | m2 (coders-4) | m3 (coders-2) | m4 (coders-3)
    """

    m1: M1Config = field(default_factory=M1Config)
    m1_owner: M1OwnerConfig = field(default_factory=M1OwnerConfig)
    m2: M2Config = field(default_factory=M2Config)
    m4: M4Config = field(default_factory=M4Config)
    m3: M3Config = field(default_factory=M3Config)

    # --- G1: tham so tu GT, se hieu chuan lai o G2 ---
    v_max_cm_s: float = 8.0                # G1: bat dau 8 cm/s (S3_GT_PARAMS: max 7.106)
    k_sigma: float = 4.0                   # G1: k=4 (S3b sigma truc 0.768-0.940 cm)
    t_boot_s: float = 5.0                  # G1/SPEC_M4 §4: gia dinh, can do
    t_defer_s: float = 2.0                 # G1/SPEC_M4 §4: gia dinh, can do

    # --- M3 (owner: coders-2) ---
    t_confirm_s: float = 0.0               # S3 hieu chuan; 0 = chua chot
    d_confirm_cm: float = 0.0              # S3 hieu chuan; 0 = chua chot
    v_stop_cm_s: float = 2.0               # SPEC §3 "dang chay" > 2 cm/s trong 0.2 s
    t_stop_s: float = 0.0                  # chua chot (S3)
    t_occluded_s: float = 0.0              # chua chot (S3)
    r_wake_cm: float = 0.0                 # chua chot (S3)

    # --- M4 (owner: coders-3) ---
    t_lost_max_s: float = 0.0              # chua chot (S4)
    tentatives_max: int = 0                # G1-H: tran so TENTATIVE; 0 = chua chot

    def validate(self) -> None:
        m1 = self.m1
        if m1.min_area_px <= 0 or m1.min_width_px <= 0 or m1.min_height_px <= 0:
            raise ValueError("M1 thresholds must be positive")
        if m1.shadow_sample_cap < m1.shadow_min_pixels:
            raise ValueError("shadow_sample_cap must be >= shadow_min_pixels")
        if not (0.0 < m1.fast_motion_scale <= 1.0):
            raise ValueError("fast_motion_scale must be in (0, 1]")
        if m1.temporal_long_s < m1.temporal_short_s:
            raise ValueError("temporal_long_s must be >= temporal_short_s")
        if self.k_sigma <= 0 or self.v_max_cm_s <= 0:
            raise ValueError("k_sigma and v_max_cm_s must be positive")
        if self.m2.car_length_cm <= 0 or self.m2.car_width_cm <= 0:
            raise ValueError("car dimensions must be positive")
