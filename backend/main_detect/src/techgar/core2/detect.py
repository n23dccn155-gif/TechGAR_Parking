"""CORE2 M1 — phep do moi camera, KHONG phu thuoc trang thai vet.

Cat chinh xac trong legacy: motion_tracker.py:1249
  `return self._suppress_duplicate_detections(detections), mask`
la "contour da loc"; `motion_tracker.py:2524` (`_assign`) la bat dau ghep vet cuc bo.

Ba phu thuoc track cua `_detect` legacy (SPEC_M1 §2.2) duoc BO/THAY o day:
  1. `occlusion_guard.covering_group(box, self._tracks, self._predictions)`  -> BO HAN
     (watershed theo pixel la va cho vet cuc bo; M2 gop theo dau chan tren mat dat)
  2. `_suppress_duplicate_detections` -> `_different_clean_owners` doc
     `track.clean_observations`                                             -> BO HAN
     (phan `_same_motion_echo` la THUAN va duoc giu nguyen van)
  3. `priority_regions` (dung tu binder)                                    -> THAY BANG
     `owner_grounds`: dau chan (day-giua, cm) cua vet dang song do ENGINE dua vao,
     tuong minh, khong doc trang thai tracker.

Anchor: DAY-GIUA (G1 quyet dinh A) = (x + w/2, y + h) chieu qua homography -> cm.
"""
from __future__ import annotations

import math
from typing import Dict, List, Optional, Sequence, Tuple

import cv2
import numpy as np

from .config import M1Config, M1OwnerConfig
from .types import Blob


class CameraDetector:
    """Mot camera, mot chuoi frame. Khong giu vet, khong GID, khong lich su ngoai nen."""

    def __init__(self, cam: int, transform: np.ndarray, config: Optional[M1Config] = None,
                 owner_config: Optional[M1OwnerConfig] = None):
        self.cam = int(cam)
        self.config = config or M1Config()
        self.owner_config = owner_config or M1OwnerConfig()
        matrix = np.asarray(transform, dtype=np.float64)
        if matrix.shape != (3, 3):
            raise ValueError(f"camera {cam}: transform must be 3x3, got {matrix.shape}")
        self.transform = matrix
        self.roi_mask: Optional[np.ndarray] = None
        self.roi_context_padding_px = self.config.roi_context_padding_px
        self._roi_context_mask: Optional[np.ndarray] = None
        self._roi_context_source_id: Optional[int] = None

        self.bg_sub = self.config.new_mog2()
        self._gray_history: list = []
        self._background_image: Optional[np.ndarray] = None
        self._background_frame: Optional[int] = None
        self._last_frame_idx: Optional[int] = None

        # kernel tinh san (motion_tracker.py:227-232)
        self._motion_open_kernel = np.ones((3, 3), np.uint8)
        self._motion_dilate_kernel = np.ones((5, 5), np.uint8)
        self._motion_support_kernel = np.ones((17, 17), np.uint8)
        join = max(3, int(self.config.motion_join_kernel_size))
        join = join if join % 2 else join + 1
        self._motion_join_kernel = np.ones((join, join), np.uint8)
        self._motion_roi_key = None
        self._motion_roi_bounds: Optional[Tuple[int, int, int, int]] = None
        self._hist_gray_cache: Dict[int, np.ndarray] = {}

        self.stats: Dict[str, float] = {
            "frames": 0, "contour_raw": 0, "blob_kept": 0,
            "ms_prepare": 0.0, "ms_contour": 0.0,
            "n_roi_rejected": 0, "n_shadow_rejected": 0, "n_motion_rejected": 0,
        }

    # ------------------------------------------------------------------ helpers
    # motion_tracker.py:543 — legacy dung luoi ~128x128 mau. Doi so nay lam thay doi
    # gia tri offset sang va do do thay doi mask (bench: lech 4 px chieu cao bbox).
    _BRIGHTNESS_SAMPLE_TARGET = 128
    _background_refresh_interval = 10

    def ground_point(self, pixel_xy: Tuple[float, float]) -> Tuple[float, float]:
        """Day-giua (pixel) -> cm tren mat dat. Anchor quyet dinh A (G1)."""
        u, v = float(pixel_xy[0]), float(pixel_xy[1])
        p = self.transform @ np.asarray([u, v, 1.0], dtype=np.float64)
        if not np.isfinite(p).all() or abs(p[2]) < 1e-12:
            raise ValueError(f"camera {self.cam}: nonfinite ground projection for {(u, v)}")
        return float(p[0] / p[2]), float(p[1] / p[2])

    def set_roi(self, mask: Optional[np.ndarray]) -> None:
        self.roi_mask = None if mask is None else np.ascontiguousarray(mask, dtype=np.uint8)
        # Doi ROI = doi he toa do cua nen: phai lam lai MOG2 (motion_tracker.py:838-846)
        self.bg_sub = self.config.new_mog2()
        self._gray_history.clear()
        self._background_image = None
        self._background_frame = None
        self._motion_roi_key = None
        self._motion_roi_bounds = None
        self._roi_context_mask = None
        self._roi_context_source_id = None

    def _roi_mask_for(self) -> Optional[np.ndarray]:
        roi = self.roi_mask
        if roi is None:
            return None
        if self._roi_context_source_id != id(roi):
            pad = int(self.roi_context_padding_px)
            if pad <= 0:
                self._roi_context_mask = roi.copy()
            else:
                size = pad * 2 + 1
                kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (size, size))
                self._roi_context_mask = cv2.dilate(roi, kernel, iterations=1)
            self._roi_context_source_id = id(roi)
        return self._roi_context_mask

    def _motion_crop_bounds(self, shape) -> Optional[Tuple[int, int, int, int]]:
        cfg = self.config
        roi = self.roi_mask
        if roi is None or roi.shape != shape:
            key = (None, shape, cfg.fast_motion, cfg.fast_motion_scale)
        else:
            key = (id(roi), shape, self.roi_context_padding_px,
                   cfg.fast_motion, cfg.fast_motion_scale)
        if key != self._motion_roi_key:
            if self._motion_roi_key is not None:
                self.bg_sub = cfg.new_mog2()
                self._gray_history.clear()
                self._background_image = None
                self._background_frame = None
            self._motion_roi_key = key
            self._motion_roi_bounds = None
            if roi is not None and roi.shape == shape:
                pixels = cv2.findNonZero(roi)
                if pixels is not None:
                    x, y, w, h = cv2.boundingRect(pixels)
                    halo = max(48, self.roi_context_padding_px + 32)
                    left, top = max(0, x - halo), max(0, y - halo)
                    right = min(shape[1], x + w + halo)
                    bottom = min(shape[0], y + h + halo)
                    if (right - left) * (bottom - top) < shape[0] * shape[1]:
                        self._motion_roi_bounds = (left, top, right, bottom)
        return self._motion_roi_bounds

    @classmethod
    def _motion_between(cls, current: np.ndarray, reference: np.ndarray, threshold: int) -> np.ndarray:
        """motion_tracker.py:517-534 — GIONG TUNG PIXEL (brightness offset = floor(median))."""
        step = max(1, min(current.shape[0] // cls._BRIGHTNESS_SAMPLE_TARGET,
                          current.shape[1] // cls._BRIGHTNESS_SAMPLE_TARGET))
        sampled_current = current[::step, ::step].astype(np.int16)
        sampled_reference = reference[::step, ::step].astype(np.int16)
        shift = float(np.median(sampled_current - sampled_reference))
        offset = int(np.floor(shift))
        adjusted_reference = (reference if offset == 0
                              else cv2.add(reference, (offset,)))
        difference = cv2.absdiff(current, adjusted_reference)
        _, return_mask = cv2.threshold(difference, threshold, 255,
                                       cv2.THRESH_BINARY, difference)
        return return_mask

    def _timestamp_references(self, timestamp_s: Optional[float]) -> List[np.ndarray]:
        """Moc so sanh theo GIAY -> khong phu thuoc stride (SPEC_M1 §4.2 diem 3)."""
        history = self._gray_history[:-1]
        if not history:
            return []
        cfg = self.config
        targets = (cfg.temporal_short_s, cfg.temporal_long_s)
        references = []
        if timestamp_s is not None:
            for target in targets:
                candidates = []
                for old_timestamp, gray in history:
                    if old_timestamp is None:
                        continue
                    age = timestamp_s - old_timestamp
                    if target * 0.45 <= age <= target * cfg.temporal_tolerance:
                        candidates.append((abs(age - target), gray))
                if candidates:
                    references.append(min(candidates, key=lambda item: item[0])[1])
            return references
        # Khong co timestamp: dung khoang cach frame (motion_tracker.py:582-593)
        gap = max(1, int(round(cfg.temporal_short_s * 25.0)))
        if len(history) > gap:
            references.append(history[-gap - 1][1])
        return references

    def _temporal_motion_mask(self, frame: np.ndarray, timestamp_s: Optional[float]) -> np.ndarray:
        cfg = self.config
        gray = cv2.GaussianBlur(cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY), (5, 5), 0)
        valid_timestamp = None
        if timestamp_s is not None and np.isfinite(timestamp_s):
            valid_timestamp = float(timestamp_s)
            previous = [item[0] for item in self._gray_history if item[0] is not None]
            if previous and valid_timestamp < previous[-1]:
                self._gray_history.clear()      # seek/reconnect
        self._gray_history.append((valid_timestamp, gray))
        # motion_tracker.py:258 — deque(maxlen=max(48, motion_long_frame_gap + 2)) = 48.
        # Doi so nay lam doi tap moc so sanh => doi mask.
        maxlen = 48
        if len(self._gray_history) > maxlen:
            del self._gray_history[: len(self._gray_history) - maxlen]

        references = self._timestamp_references(valid_timestamp)
        if not references:
            return np.zeros_like(gray)
        motion = np.zeros_like(gray)
        for reference in references:
            cv2.bitwise_or(motion, self._motion_between(gray, reference, cfg.motion_threshold),
                           dst=motion)
        motion = cv2.morphologyEx(motion, cv2.MORPH_OPEN, self._motion_open_kernel)
        motion = cv2.dilate(motion, self._motion_dilate_kernel, iterations=2)
        return cv2.morphologyEx(motion, cv2.MORPH_CLOSE, self._motion_join_kernel,
                                iterations=cfg.motion_join_iterations)

    def _background_reference(self, frame_idx: int) -> Optional[np.ndarray]:
        if not self.config.reject_cast_shadows:
            return None
        age = None if self._background_frame is None else frame_idx - self._background_frame
        if self._background_image is not None and age is not None and (
                0 <= age < self._background_refresh_interval):
            return self._background_image
        getter = getattr(self.bg_sub, "getBackgroundImage", None)
        if not callable(getter):
            return None
        try:
            self._background_image = getter()
        except cv2.error:
            self._background_image = None
        self._background_frame = frame_idx
        return self._background_image

    # ------------------------------------------------------------------ shadow
    def _cast_shadow_metrics(self, frame, background, box, selection) -> Optional[dict]:
        """Nguyen van motion_tracker.py:703-773, CHI khac: lay mau co tran (shadow_sample_cap).

        Moi metric la median hoac ty le nen lay mau con giu dung nghia thong ke.
        Buoc lay mau tat dinh (stride deu), khong RNG -> replay van byte-identical.
        """
        cfg = self.config
        if background is None or background.shape != frame.shape:
            return None
        x, y, width, height = box
        if selection.shape != (height, width):
            return None
        # bbox co the vuot bien frame (contour sat mep): crop that su nho hon
        # `selection` => phai cat `selection` theo cung cua so, neu khong
        # boolean index lech shape (bench da bat: 1951 vs 1950).
        frame_h, frame_w = frame.shape[:2]
        x0, y0 = max(0, x), max(0, y)
        x1, y1 = min(frame_w, x + width), min(frame_h, y + height)
        if x1 <= x0 or y1 <= y0:
            return None
        if (x0, y0, x1, y1) != (x, y, x + width, y + height):
            selection = selection[y0 - y:y1 - y, x0 - x:x1 - x]
            if selection.shape != (y1 - y0, x1 - x0):
                return None
        selected = selection > 0
        selected_count = int(np.count_nonzero(selected))
        if selected_count < cfg.shadow_min_pixels:
            return None

        current_bgr = frame[y0:y1, x0:x1][selected].astype(np.float32)
        background_bgr = background[y0:y1, x0:x1][selected].astype(np.float32)
        weights = np.asarray([0.114, 0.587, 0.299], dtype=np.float32)
        current_luminance = current_bgr @ weights
        background_luminance = background_bgr @ weights
        valid = (background_luminance >= 20.0) & (current_luminance >= 3.0)
        valid_count = int(np.count_nonzero(valid))
        if valid_count < cfg.shadow_min_pixels or valid_count < selected_count * 0.60:
            return None

        if valid_count > cfg.shadow_sample_cap:
            # Lay mau TAT DINH theo buoc deu tren CHI SO, khong dung RNG
            # (replay phai byte-identical). `picked` phai cung DO DAI `valid`
            # (khong phai so phan tu True — bench da bat 1951 vs 1950).
            indices = np.flatnonzero(valid)
            step = max(1, len(indices) // cfg.shadow_sample_cap)
            chosen = indices[::step][: cfg.shadow_sample_cap]
            picked = np.zeros(valid.shape[0], dtype=bool)
            picked[chosen] = True
            valid = picked

        current_bgr = current_bgr[valid]
        background_bgr = background_bgr[valid]
        current_luminance = current_luminance[valid]
        background_luminance = background_luminance[valid]
        attenuation_values = current_luminance / np.maximum(background_luminance, 1e-3)
        attenuation = float(np.median(attenuation_values))

        current_chroma = current_bgr / np.maximum(np.sum(current_bgr, axis=1, keepdims=True), 1e-3)
        background_chroma = background_bgr / np.maximum(
            np.sum(background_bgr, axis=1, keepdims=True), 1e-3)
        chromaticity_distance = np.sum(np.abs(current_chroma - background_chroma), axis=1)
        scaled_residual = np.abs(
            current_luminance - attenuation * background_luminance
        ) / np.maximum(background_luminance, 1e-3)

        explained = (
            (np.abs(attenuation_values - attenuation) <= 0.18)
            & (chromaticity_distance <= cfg.shadow_max_chromaticity_distance * 1.20)
            & (scaled_residual <= cfg.shadow_max_scaled_residual * 1.50)
        )
        return {
            "attenuation": attenuation,
            "chromaticity_distance": float(np.median(chromaticity_distance)),
            "scaled_residual": float(np.median(scaled_residual)),
            "explained_fraction": float(np.mean(explained)),
            "pixel_count": valid_count,
        }

    def _is_cast_shadow(self, frame, background, box, selection) -> bool:
        cfg = self.config
        if not cfg.reject_cast_shadows:
            return False
        metrics = self._cast_shadow_metrics(frame, background, box, selection)
        if metrics is None:
            return False
        return bool(
            cfg.shadow_attenuation_range[0] <= metrics["attenuation"]
            <= cfg.shadow_attenuation_range[1]
            and metrics["chromaticity_distance"] <= cfg.shadow_max_chromaticity_distance
            and metrics["scaled_residual"] <= cfg.shadow_max_scaled_residual
            and metrics["explained_fraction"] >= cfg.shadow_min_explained_fraction
        )

    # ------------------------------------------------------------------ prepare
    def prepare(self, frame: np.ndarray, timestamp_s: Optional[float],
                frame_idx: int) -> dict:
        """MOG2 + temporal + hinh thai + ROI. Equivalent prepare_motion_frame:860-950."""
        import time
        began = time.perf_counter()
        cfg = self.config
        bounds = self._motion_crop_bounds(frame.shape[:2])
        half = cfg.fast_motion
        if half and bounds is None:
            bounds = (0, 0, frame.shape[1], frame.shape[0])
        if bounds is None:
            working = frame
        else:
            left, top, right, bottom = bounds
            working = frame[top:bottom, left:right]
        if half:
            scale = float(cfg.fast_motion_scale)
            working = cv2.resize(
                working,
                (max(1, round(working.shape[1] * scale)), max(1, round(working.shape[0] * scale))),
                interpolation=cv2.INTER_AREA,
            )
        background_image = self._background_reference(frame_idx)
        raw_mask = self.bg_sub.apply(working)
        _, definite = cv2.threshold(raw_mask, 200, 255, cv2.THRESH_BINARY)
        if cfg.reject_cast_shadows and background_image is not None:
            shadow_markers = cv2.compare(raw_mask, 127, cv2.CMP_EQ)
            background_mask = cv2.bitwise_or(definite, shadow_markers)
        else:
            shadow_markers = np.zeros_like(raw_mask)
            background_mask = definite
        temporal = self._temporal_motion_mask(working, timestamp_s)
        if half:
            def expand(image, interpolation=cv2.INTER_NEAREST):
                if image is None:
                    return None
                return cv2.resize(image, (right - left, bottom - top),
                                  interpolation=interpolation)
            background_image = expand(background_image, cv2.INTER_LINEAR)
            shadow_markers = expand(shadow_markers)
            background_mask = expand(background_mask)
            temporal = expand(temporal)
        support = cv2.dilate(temporal, self._motion_support_kernel, iterations=1)
        mask = cv2.bitwise_and(background_mask, support)
        if bounds is not None:
            h, w = frame.shape[:2]
            def restore(image):
                if image is None:
                    return None
                out = np.zeros((h, w) + image.shape[2:], dtype=image.dtype)
                out[top:bottom, left:right] = image
                return out
            background_image = restore(background_image)
            shadow_markers = restore(shadow_markers)
            temporal = restore(temporal)
            mask = restore(mask)
        self._last_frame_idx = frame_idx
        self.stats["frames"] += 1
        self.stats["ms_prepare"] += (time.perf_counter() - began) * 1000.0
        return {"background": background_image, "shadow_markers": shadow_markers,
                "temporal": temporal, "mask": mask}

    # ------------------------------------------------------------------ detect
    def step(self, frame: np.ndarray, frame_idx: int, timestamp_s: Optional[float],
             owner_grounds: Sequence[Tuple[float, float]] = (),
             prepared: Optional[dict] = None) -> List[Blob]:
        """frame -> list[Blob]. `owner_grounds` = dau chan vet dang song (cm), do ENGINE dua.

        Day la thay the TUONG MINH cho `priority_regions` (B0 doc tu binder): khong doc
        trang thai tracker, chi nhan tham so.
        """
        import time
        cfg = self.config
        if prepared is None:
            prepared = self.prepare(frame, timestamp_s, frame_idx)
        began = time.perf_counter()
        background_image = prepared["background"]
        shadow_markers = prepared["shadow_markers"]
        temporal = prepared["temporal"]
        mask = prepared["mask"]

        # nguong "vung chu y" suy TU THAM SO, khong tu binder
        priority_mask = self._priority_mask_from_grounds(frame.shape[:2], owner_grounds)

        roi = self.roi_mask
        if roi is not None:
            context = self._roi_mask_for()
            mask = cv2.bitwise_and(mask, context)
        mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, self._motion_open_kernel)
        mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, self._motion_join_kernel,
                                iterations=cfg.motion_join_iterations)
        contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        self.stats["contour_raw"] += len(contours)

        image_area = frame.shape[0] * frame.shape[1]
        image_height, image_width = frame.shape[:2]
        max_w = image_width * cfg.max_bbox_width_ratio
        max_h = image_height * cfg.max_bbox_height_ratio
        max_area = image_area * cfg.max_bbox_area_ratio
        min_possible = min(cfg.min_area_px, cfg.priority_min_area_px)

        blobs: List[Blob] = []
        for contour in contours:
            x, y, w, h = cv2.boundingRect(contour)
            if w < cfg.min_width_px or h < cfg.min_height_px or (w * h) < min_possible:
                continue
            area = cv2.contourArea(contour)
            if area < min_possible:
                continue
            box = (x, y, w, h)
            point = (x + w // 2, y + h)          # DAY-GIUA
            roi_support_ratio = 1.0
            roi_clipped = False
            roi_context_rescued = False
            anchor_tolerated = False
            contour_poly = None
            if roi is not None:
                contour_poly = np.zeros((h, w), dtype=np.uint8)
                cv2.fillPoly(contour_poly, [contour - [x, y]], 255)
                component_pixels = max(1, cv2.countNonZero(contour_poly))
                strict = cv2.bitwise_and(contour_poly, roi[y:y + h, x:x + w])
                support_pixels = cv2.countNonZero(strict)
                roi_support_ratio = float(support_pixels) / float(component_pixels)
                roi_clipped = roi_support_ratio < 0.98
                required = max(20, min(cfg.motion_min_pixels,
                                       int(round(0.08 * component_pixels))))
                if support_pixels < required:
                    context_mask = self._roi_context_mask
                    context_support = 0
                    anchor_in_context = False
                    if context_mask is not None:
                        ctx = cv2.bitwise_and(contour_poly, context_mask[y:y + h, x:x + w])
                        context_support = cv2.countNonZero(ctx)
                        ax, ay = point
                        anchor_in_context = (
                            0 <= ax < context_mask.shape[1] and 0 <= ay < context_mask.shape[0]
                            and context_mask[ay, ax] != 0
                        )
                    if not (roi_clipped and support_pixels > 0 and anchor_in_context
                            and context_support >= required):
                        self.stats["n_roi_rejected"] += 1
                        continue
                    roi_context_rescued = True
            if area > image_area * 0.22:
                continue
            bbox_area = float(w * h)
            if w > max_w or h > max_h or bbox_area > max_area:
                self.stats["n_roi_rejected"] += 1
                cv2.drawContours(mask, [contour], -1, 0, thickness=cv2.FILLED)
                continue
            aspect = w / max(h, 1)
            if aspect < 0.25 or aspect > 5.0:
                continue
            if roi is not None:
                px, py = point
                rejected = False
                if px < 0 or py < 0 or py >= roi.shape[0] or px >= roi.shape[1]:
                    rejected = True
                elif roi[py, px] == 0 and not roi_clipped:
                    context_mask = self._roi_context_mask
                    if context_mask is not None and context_mask[py, px] != 0:
                        anchor_tolerated = True
                    else:
                        rejected = True
                if rejected:
                    self.stats["n_roi_rejected"] += 1
                    cv2.drawContours(mask, [contour], -1, 0, thickness=cv2.FILLED)
                    continue
            is_priority = self._box_is_priority(priority_mask, box, point)
            min_area = cfg.priority_min_area_px if is_priority else cfg.min_area_px
            if area < min_area:
                continue
            motion_pixels = cv2.countNonZero(temporal[y:y + h, x:x + w])
            need_pixels = (cfg.priority_motion_min_pixels if is_priority
                           else cfg.motion_min_pixels)
            need_ratio = (cfg.priority_motion_min_ratio if is_priority
                          else cfg.motion_min_ratio)
            if motion_pixels < need_pixels or motion_pixels / float(w * h) < need_ratio:
                self.stats["n_motion_rejected"] += 1
                continue
            if contour_poly is None:
                contour_poly = np.zeros((h, w), dtype=np.uint8)
                cv2.fillPoly(contour_poly, [contour - [x, y]], 255)
            selection = cv2.bitwise_and(contour_poly, mask[y:y + h, x:x + w])
            if cfg.reject_cast_shadows and self._is_cast_shadow(
                    frame, background_image, box, selection):
                self.stats["n_shadow_rejected"] += 1
                cv2.drawContours(mask, [contour], -1, 0, thickness=cv2.FILLED)
                continue
            blobs.append(Blob(
                cam=self.cam, frame=int(frame_idx),
                t=float(timestamp_s) if timestamp_s is not None else float(frame_idx) / 25.0,
                bbox=(int(x), int(y), int(w), int(h)),
                xy=self.ground_point(point),
                area_px=int(round(float(area))),
                roi_clipped=bool(roi_clipped),
                roi_support=float(min(1.0, max(0.0, roi_support_ratio))),
                desc=(self._descriptor(frame, box, selection)
                      if cfg.desc_enabled else None),
            ))
        blobs = self._suppress_echoes(blobs, frame, mask)
        self.stats["blob_kept"] += len(blobs)
        self.stats["ms_contour"] += (time.perf_counter() - began) * 1000.0
        return blobs

    @staticmethod
    def _same_motion_echo(first: Blob, second: Blob,
                          first_hist, second_hist) -> bool:
        """motion_tracker.py:1251-1274, THUAN (khong doc track)."""
        if first_hist is None or second_hist is None:
            return False
        fw, fh = first.bbox[2], first.bbox[3]
        sw, sh = second.bbox[2], second.bbox[3]
        size_ratio = min(fw * fh, sw * sh) / max(fw * fh, sw * sh, 1)
        if size_ratio < 0.45:
            return False
        appearance = cv2.compareHist(first_hist, second_hist, cv2.HISTCMP_BHATTACHARYYA)
        if appearance > 0.22:
            return False
        p1 = (first.bbox[0] + fw / 2.0, first.bbox[1] + fh)
        p2 = (second.bbox[0] + sw / 2.0, second.bbox[1] + sh)
        distance = math.hypot(p1[0] - p2[0], p1[1] - p2[1])
        allowed = max(24.0, 1.10 * max(min(fw, fh), min(sw, sh)))
        return distance <= allowed and MotionEcho.box_gap(first.bbox, second.bbox) <= 14.0

    def _suppress_echoes(self, blobs: List[Blob], frame, mask) -> List[Blob]:
        """Chi phan THUAN cua _suppress_duplicate_detections (motion_tracker.py:1276-1297).

        `_different_clean_owners` (doc track.clean_observations) bi BO -> 2 blob cua
        2 xe that se KHONG bi gop boi nham. Doi lai, may canh echo co the duoc giu;
        do la rui ro da biet, do lai o bench.
        """
        if len(blobs) < 2:
            return blobs
        from .owner import ground_owner_split
        self._hist_gray_cache.clear()
        kept: List[Blob] = []
        kept_hist = []
        for blob in sorted(blobs, key=lambda item: item.area_px, reverse=True):
            hist = self._histogram(frame, blob.bbox, mask)
            echo = False
            for existing, existing_hist in zip(kept, kept_hist):
                iou = MotionEcho.iou(blob.bbox, existing.bbox)
                if iou < 0.25:
                    continue
                if ground_owner_split(blob.xy, existing.xy, self.owner_config):
                    continue        # 2 chu khac nhau tren mat dat -> khong gop
                if self._same_motion_echo(blob, existing, hist, existing_hist):
                    echo = True
                    break
            if echo:
                continue
            kept.append(blob)
            kept_hist.append(hist)
        return kept

    def _histogram(self, frame, box, mask):
        """motion_tracker.py:482-496 (compute_sample_quality + hsv_histogram)."""
        from .tracklet_hist import hsv_histogram, sample_quality
        quality = sample_quality(frame, box, mask)
        if quality < 0.5:
            return None
        return hsv_histogram(frame, box, mask=mask)

    def _descriptor(self, frame, box, mask):
        """Desc 128 chieu tren mat na blob (DIRECTOR chot o M1D)."""
        from .desc import blob_descriptor
        cfg = self.config
        return blob_descriptor(
            frame, box, mask,
            bins=(cfg.desc_bins_h, cfg.desc_bins_s, cfg.desc_bins_v),
            min_pixels=cfg.desc_min_pixels,
            round_digits=cfg.desc_round,
        )

    def _priority_mask_from_grounds(self, shape, owner_grounds) -> Optional[np.ndarray]:
        """Dau chan vet dang song (cm) -> mask pixel. THAY priority_regions cua binder."""
        if not owner_grounds:
            return None
        inverse = np.linalg.inv(self.transform)
        # ban kinh tinh bang cm roi doi sang pixel qua chinh homography (khong doan px)
        radius_cm = float(self.config.owner_radius_cm)
        mask = np.zeros(shape, dtype=np.uint8)
        for ground in owner_grounds:
            p = inverse @ np.asarray([ground[0], ground[1], 1.0], dtype=np.float64)
            if not np.isfinite(p).all() or abs(p[2]) < 1e-12:
                continue
            u, v = p[0] / p[2], p[1] / p[2]
            # 1 cm tren mat dat tuong ung bao nhieu pixel tai diem nay
            q = inverse @ np.asarray([ground[0] + radius_cm, ground[1], 1.0])
            if not np.isfinite(q).all() or abs(q[2]) < 1e-12:
                radius_px = int(round(radius_cm))
            else:
                radius_px = int(round(math.hypot(q[0] / q[2] - u, q[1] / q[2] - v)))
            radius_px = max(8, radius_px)
            cx, cy = int(round(u)), int(round(v))
            if 0 <= cx < shape[1] and 0 <= cy < shape[0]:
                cv2.circle(mask, (cx, cy), radius_px, 255, -1)
        return mask if cv2.countNonZero(mask) else None

    @staticmethod
    def _box_is_priority(priority_mask, box, point) -> bool:
        if priority_mask is None:
            return False
        x, y, w, h = box
        height, width = priority_mask.shape[:2]
        px, py = point
        if 0 <= px < width and 0 <= py < height and priority_mask[py, px] != 0:
            return True
        x1, y1 = max(0, x), max(0, y)
        x2, y2 = min(width, x + w), min(height, y + h)
        if x2 <= x1 or y2 <= y1:
            return False
        overlap = cv2.countNonZero(priority_mask[y1:y2, x1:x2])
        return overlap / float(max(1, w * h)) >= 0.10


class MotionEcho:
    """Hai ham hinh hoc THUAN cua legacy, tach ra de test rieng."""

    @staticmethod
    def iou(left, right) -> float:
        ax, ay, aw, ah = left
        bx, by, bw, bh = right
        x1, y1 = max(ax, bx), max(ay, by)
        x2, y2 = min(ax + aw, bx + bw), min(ay + ah, by + bh)
        if x2 <= x1 or y2 <= y1:
            return 0.0
        inter = (x2 - x1) * (y2 - y1)
        return inter / float(aw * ah + bw * bh - inter)

    @staticmethod
    def box_gap(left, right) -> float:
        ax, ay, aw, ah = left
        bx, by, bw, bh = right
        dx = max(0, max(ax - (bx + bw), bx - (ax + aw)))
        dy = max(0, max(ay - (by + bh), by - (ay + ah)))
        return math.hypot(dx, dy)
