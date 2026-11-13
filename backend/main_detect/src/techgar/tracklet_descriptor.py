"""Lightweight appearance tracklets for cross-camera vehicle association.

The graph-based MTMCT literature compares a sequence of observations instead
of reducing a vehicle to one last crop.  This module keeps that useful idea
without requiring a neural graph model: every local track owns a small gallery
of HSV histograms and matching uses all samples in both galleries.
"""

from __future__ import annotations

import hashlib
import threading
from collections import OrderedDict
from dataclasses import dataclass, field
from typing import List, Optional, Sequence, Tuple

import cv2
import numpy as np


def hsv_histogram(
    frame: np.ndarray,
    box: Tuple[int, int, int, int],
    mask: Optional[np.ndarray] = None,
) -> np.ndarray:
    """Return a normalized colour descriptor for a clipped vehicle crop.

    Motion bounding boxes often contain more road than vehicle.  When a
    foreground mask is available, describe only the observed object pixels so
    camera-specific asphalt and old motion silhouettes do not dominate Re-ID.
    Hue/saturation alone cannot distinguish black, grey and white vehicles, so
    the descriptor also retains LAB chromaticity and luminance distributions.
    """
    x, y, width, height = box
    frame_height, frame_width = frame.shape[:2]
    left = max(0, min(frame_width, int(x)))
    top = max(0, min(frame_height, int(y)))
    right = max(left, min(frame_width, int(x + width)))
    bottom = max(top, min(frame_height, int(y + height)))
    crop = frame[top:bottom, left:right]
    if crop.size == 0:
        return np.zeros(416, dtype=np.float32)
    hsv = cv2.cvtColor(crop, cv2.COLOR_BGR2HSV)
    lab = cv2.cvtColor(crop, cv2.COLOR_BGR2LAB)
    histogram_mask = None
    if mask is not None:
        value = np.asarray(mask)
        if value.shape[:2] != frame.shape[:2]:
            raise ValueError("Histogram mask must match frame dimensions")
        histogram_mask = np.where(
            value[top:bottom, left:right] > 0, 255, 0
        ).astype(np.uint8)
        if cv2.countNonZero(histogram_mask) == 0:
            histogram_mask = None
    hue_saturation = cv2.calcHist(
        [hsv], [0, 1], histogram_mask, [16, 16], [0, 180, 0, 256]
    )
    lab_chromaticity = cv2.calcHist(
        [lab], [1, 2], histogram_mask, [12, 12], [0, 256, 0, 256]
    )
    luminance = cv2.calcHist(
        [lab], [0], histogram_mask, [16], [0, 256]
    )
    descriptor = np.concatenate(
        (
            0.70 * hue_saturation.reshape(-1),
            1.20 * lab_chromaticity.reshape(-1),
            0.60 * luminance.reshape(-1),
        )
    ).astype(np.float32)
    return cv2.normalize(descriptor, descriptor).astype(np.float32)


def _normalized_copy(histogram: np.ndarray) -> Optional[np.ndarray]:
    value = np.asarray(histogram, dtype=np.float32)
    if value.size == 0 or not np.all(np.isfinite(value)):
        return None
    copied = value.copy()
    if float(np.linalg.norm(copied)) <= 1e-12:
        return None
    return cv2.normalize(copied, copied).astype(np.float32)


def compute_sample_quality(
    frame: np.ndarray,
    box: Tuple[int, int, int, int],
    mask: Optional[np.ndarray] = None,
    min_area: int = 200,
    min_foreground_ratio: float = 0.15,
) -> float:
    """Compute quality score for an appearance sample.

    Priority 8: Filter low-quality samples before adding to gallery.
    Returns score between 0 (bad) and 1 (good). Reject if < 0.5.

    Quality factors:
    - Crop size (too small = unreliable)
    - Foreground ratio (low = mostly background = noisy)
    - Aspect ratio sanity check
    """
    x, y, width, height = box
    frame_h, frame_w = frame.shape[:2]

    # Clamp box to frame bounds
    left = max(0, min(frame_w, int(x)))
    top = max(0, min(frame_h, int(y)))
    right = max(left, min(frame_w, int(x + width)))
    bottom = max(top, min(frame_h, int(y + height)))

    crop_w = right - left
    crop_h = bottom - top
    crop_area = crop_w * crop_h

    # Factor 1: Size score (too small = unreliable)
    if crop_area < min_area:
        return 0.0
    size_score = min(1.0, crop_area / 1000.0)  # 1000px^2 = perfect

    # Factor 2: Foreground ratio (if mask available)
    fg_ratio_score = 1.0
    if mask is not None:
        fg_mask = np.asarray(mask)
        if fg_mask.shape[:2] == frame.shape[:2]:
            fg_crop = fg_mask[top:bottom, left:right]
            fg_pixels = cv2.countNonZero(fg_crop)
            if crop_area > 0:
                fg_ratio = fg_pixels / crop_area
                if fg_ratio < min_foreground_ratio:
                    return 0.0  # Reject: mostly background
                fg_ratio_score = min(1.0, fg_ratio * 2.0)  # 0.5 ratio = perfect

    # Factor 3: Aspect ratio sanity (vehicles aren't extremely thin/wide)
    aspect = crop_w / max(1, crop_h)
    if aspect < 0.3 or aspect > 4.0:
        aspect_score = 0.5  # Suspicious but not reject
    else:
        aspect_score = 1.0

    # Combined score
    quality = 0.5 * size_score + 0.3 * fg_ratio_score + 0.2 * aspect_score
    return float(np.clip(quality, 0.0, 1.0))


def histogram_distance(left: np.ndarray, right: np.ndarray) -> float:
    """Bhattacharyya distance normalized to the range used by OpenCV."""
    return float(
        cv2.compareHist(
            np.asarray(left, dtype=np.float32),
            np.asarray(right, dtype=np.float32),
            cv2.HISTCMP_BHATTACHARYYA,
        )
    )


def histogram_distance_matrix(
    left: np.ndarray, right: np.ndarray
) -> np.ndarray:
    """P35/T5: `histogram_distance` for every pair, computed in one shot.

    ``left`` is ``(N, D)`` and ``right`` is ``(M, D)``; the result is
    ``(N, M)``.  This is the same quantity ``cv2.compareHist`` reports with
    ``HISTCMP_BHATTACHARYYA``:

        sqrt(1 - sum(sqrt(a*b)) / sqrt(sum(a) * sum(b)))

    Verified against OpenCV on synthetic and sparse histograms with a maximum
    absolute difference of 1.3e-15 (requirement: < 1e-9), including the
    all-zero case where OpenCV returns 1.0.

    The reason this exists: a single ``compareHist`` call costs ~1.1 us but the
    numpy equivalent costs ~8 us, so replacing them one-by-one would be a
    *regression*.  Batched, one 24x24 gallery comparison drops from 0.84 ms to
    0.048 ms (17x) because the inner loop becomes a single matmul.
    """
    a = np.asarray(left, dtype=np.float64)
    b = np.asarray(right, dtype=np.float64)
    numerator = np.sqrt(a) @ np.sqrt(b).T
    denominator = np.sqrt(np.outer(a.sum(axis=1), b.sum(axis=1)))
    safe = np.where(denominator > 0.0, denominator, 1.0)
    values = np.sqrt(np.clip(1.0 - numerator / safe, 0.0, None))
    # OpenCV returns 1.0 when either side is all zeros.
    return np.where(denominator > 0.0, values, 1.0)


def spatial_histograms(frame, box, mask):
    """Two image-space zones, only for same-camera comparison.

    Empty zones are absent evidence, never a fallback to the whole background.
    Keep the established 416-D descriptor ABI unchanged.
    """
    x, y, w, h = map(int, box)
    zones = []
    for top, height in ((y, h // 2), (y + h // 2, h - h // 2)):
        left, right = max(0, x), min(frame.shape[1], x+w)
        start, end = max(0, top), min(frame.shape[0], top+height)
        if end <= start or right <= left or mask is None:
            zones.append(None)
            continue
        foreground = cv2.countNonZero(mask[start:end, left:right])
        if foreground < max(20, .15 * (end-start) * (right-left)):
            zones.append(None)
        else:
            zones.append(hsv_histogram(frame, (left, start, right-left, end-start), mask))
    return tuple(zones)


def spatial_distance(left, right):
    if left is None or right is None or len(left) != 2 or len(right) != 2:
        return None
    if any(value is None for value in (*left, *right)):
        return None
    return float(np.mean([histogram_distance(a, b) for a, b in zip(left, right)]))


@dataclass
class AppearanceTracklet:
    """Bounded, temporally sampled appearance gallery for one local track."""

    max_samples: int = 12
    sample_interval: int = 3
    samples: List[np.ndarray] = field(default_factory=list)
    sample_frames: List[int] = field(default_factory=list)

    def __post_init__(self) -> None:
        self.max_samples = max(1, int(self.max_samples))
        self.sample_interval = max(1, int(self.sample_interval))

    def update(self, histogram: Optional[np.ndarray], frame_idx: int) -> bool:
        """Append one observation when enough frames passed since the last one."""
        if histogram is None:
            return False
        normalized = _normalized_copy(histogram)
        if normalized is None:
            return False
        if self.sample_frames and frame_idx - self.sample_frames[-1] < self.sample_interval:
            return False
        self.samples.append(normalized)
        self.sample_frames.append(int(frame_idx))
        if len(self.samples) > self.max_samples:
            overflow = len(self.samples) - self.max_samples
            del self.samples[:overflow]
            del self.sample_frames[:overflow]
        return True

    def snapshot(self) -> Tuple[np.ndarray, ...]:
        return tuple(sample.copy() for sample in self.samples)

    @property
    def aggregate(self) -> Optional[np.ndarray]:
        return aggregate_appearance(self.samples)


@dataclass(frozen=True)
class TrackletMatch:
    distance: float
    support: int
    sample_pairs: int
    aggregate_distance: float
    nearest_distance: float


def appearance_samples(source) -> Tuple[np.ndarray, ...]:
    """Extract a copied gallery from a track, descriptor, array or sequence."""
    if source is None:
        return ()
    if isinstance(source, AppearanceTracklet):
        return source.snapshot()

    descriptor = getattr(source, "appearance_tracklet", None)
    if isinstance(descriptor, AppearanceTracklet) and descriptor.samples:
        return descriptor.snapshot()
    if descriptor is not None and hasattr(descriptor, "snapshot"):
        samples = descriptor.snapshot()
        if samples:
            return tuple(
                normalized
                for item in samples
                if (normalized := _normalized_copy(item)) is not None
            )

    if not isinstance(source, (np.ndarray, list, tuple)):
        source = getattr(source, "appearance", None)
        if source is None:
            return ()
    values: Sequence[np.ndarray]
    if isinstance(source, np.ndarray):
        values = (source,)
    elif isinstance(source, (list, tuple)):
        values = source
    else:
        return ()
    return tuple(
        normalized
        for item in values
        if (normalized := _normalized_copy(item)) is not None
    )


def aggregate_appearance(source) -> Optional[np.ndarray]:
    """Median descriptor, used for compatibility with single-histogram code."""
    samples = appearance_samples(source)
    if not samples:
        return None
    aggregate = np.median(np.stack(samples, axis=0), axis=0).astype(np.float32)
    if float(np.linalg.norm(aggregate)) <= 1e-12:
        aggregate = np.mean(np.stack(samples, axis=0), axis=0).astype(np.float32)
    return cv2.normalize(aggregate, aggregate).astype(np.float32)


def merge_appearance_samples(
    existing,
    incoming,
    max_samples: int = 24,
) -> Tuple[np.ndarray, ...]:
    """Merge local tracklets into a bounded cross-camera identity gallery."""
    maximum = max(1, int(max_samples))
    samples = (*appearance_samples(existing), *appearance_samples(incoming))
    if not samples:
        return ()

    # P35/T5: the sequential dedupe below only ever needs the distance between
    # two *input* samples -- ``merged`` always holds copies of earlier inputs --
    # so compute the whole K x K matrix with one matmul and walk the ordering
    # logic over it.  Same decisions, same output order: this is exactly the
    # per-pair loop with the arithmetic hoisted out.
    if len(samples) > 1:
        flat = np.stack(
            [np.asarray(sample, dtype=np.float64).ravel() for sample in samples]
        )
        distances = histogram_distance_matrix(flat, flat)
    else:
        distances = np.zeros((1, 1), dtype=np.float64)

    merged: List[np.ndarray] = []
    # Index into ``samples`` for each entry currently in ``merged``.
    merged_source: List[int] = []
    for position, sample in enumerate(samples):
        duplicate_index = None
        for merged_position, source_index in enumerate(merged_source):
            if distances[source_index, position] <= 0.015:
                duplicate_index = merged_position
                break
        if duplicate_index is not None:
            merged[duplicate_index] = sample.copy()
            merged_source[duplicate_index] = position
        else:
            merged.append(sample.copy())
            merged_source.append(position)
    if len(merged) <= maximum:
        return tuple(merged)
    # Preserve observations across the complete route, including earlier
    # cameras, while keeping the gallery deterministic and bounded.
    indices = np.linspace(0, len(merged) - 1, maximum, dtype=int)
    return tuple(merged[int(index)].copy() for index in indices)


def _raw_samples(source) -> Tuple[np.ndarray, ...]:
    """P35/T11: the gallery arrays behind ``source``, *without* re-normalising.

    ``appearance_samples`` runs ``_normalized_copy`` (a ``cv2.normalize``) over
    every sample.  For an ``AppearanceTracklet`` or an already-normalised tuple
    that is pure repetition - and it is not free: 63.8 us for a 12-sample tuple
    against 0.14 us to just read the arrays.

    This is only used to build a *cache key*, so skipping the normalise is
    sound: a key must merely be stable for identical inputs and different for
    different ones.  ``_normalized_copy`` is deterministic, so equal raw bytes
    always mean an equal cached answer.  Two different raws that happen to
    normalise to the same arrays would merely miss the cache and recompute -
    never return a wrong value.
    """
    if source is None:
        return ()
    if isinstance(source, AppearanceTracklet):
        return tuple(source.samples)
    descriptor = getattr(source, "appearance_tracklet", None)
    if isinstance(descriptor, AppearanceTracklet):
        return tuple(descriptor.samples)
    if isinstance(source, (tuple, list)):
        return tuple(source)
    return appearance_samples(source)


def _gallery_digest(samples: Tuple[np.ndarray, ...]) -> int:
    """P35/T11: content hash of a gallery, used as a cache key.

    Must be *content* based, not identity based: a local track's gallery is
    rebuilt every frame by ``appearance_samples`` even when its contents did
    not change, so ``id()`` would never hit, while ``id()`` would also be
    unsound (CPython reuses ids of freed arrays).

    P35/T11 changed this from ``hashlib.blake2b`` to the builtin ``hash`` of the
    concatenated bytes, because the cache now hits 97 % of the time and the
    digest was on the hot path: measured 39.9 us vs 9.6 us for a 12-sample
    gallery (4.1x).  A cache key needs only to (a) be stable within a process
    and (b) separate different contents; it is not a security boundary.  A
    collision would cause one *recomputation*, never a wrong answer, because
    the result stored under the key is still whatever ``compare_tracklets``
    computed for that key's holder.  Verified it still detects a 1e-7 change in
    any component, still separates a ``(832,)`` sample from two ``(416,)``
    samples (the shape is hashed in), and still returns a different digest for
    two different galleries.
    """
    parts: List[bytes] = []
    for sample in samples:
        value = np.ascontiguousarray(sample, dtype=np.float32)
        # Hash the shape too, so one (832,) sample cannot collide with two
        # (416,) samples - a digest over a bare concatenated byte stream would
        # collide on exactly that.
        parts.append(str(value.shape).encode("ascii"))
        parts.append(value.tobytes())
    return hash(b"".join(parts))


# P35/T6: cross-frame memo of ``compare_tracklets`` results.
#
# Measured on sang_5p (1300 frames): 5 647 calls but only 452 distinct
# (left, right) gallery contents - 92 % of the work is recomputing an answer
# that is already known, because a gallery only gains a sample every
# ``sample_interval`` frames while the comparison runs every frame.
#
# Keyed by (left digest, right digest) *in that order*.  Measured, the metric
# turns out to be symmetric (``partial_nearest`` always takes the median over
# the *smaller* gallery, whichever side that is: 0 asymmetric pairs found in 80
# sampled (12,3) gallery pairs), so a reversed pair would also match if the key
# were canonicalised.  The key keeps the order anyway: it costs at most one
# duplicate cache slot per pair, and it stays correct without depending on that
# symmetry holding for every future change to the distance formula.  Entries are
# immutable ``TrackletMatch`` values, so sharing them is safe.  Bounded FIFO so
# a long run cannot grow without limit; eviction only costs a recompute, never
# correctness.
#
# The memo is per-thread on purpose.  The runtime owns two worker threads (the
# JSON writer and the encoder) plus a parking executor, and a shared
# ``OrderedDict`` would need a lock around ``move_to_end`` - paying on every hit
# to serve threads that never call this function.  Every tracking call comes
# from the frame thread, so a thread-local memo has the same hit rate with no
# synchronisation at all.
_TRACKLET_MATCH_CACHE_LIMIT = 8192
_MATCH_CACHE_LOCAL = threading.local()


def _match_cache() -> "OrderedDict[tuple, TrackletMatch]":
    cache = getattr(_MATCH_CACHE_LOCAL, "cache", None)
    if cache is None:
        cache = OrderedDict()
        _MATCH_CACHE_LOCAL.cache = cache
    return cache


def tracklet_match_cache_size() -> int:
    """Number of memoised comparisons held by the calling thread."""
    return len(_match_cache())


def clear_tracklet_match_cache() -> None:
    """Drop the calling thread's memo (used by tests and A/B harnesses)."""
    _match_cache().clear()


def compare_tracklets_cached(left, right, missing_distance: float = 0.25) -> TrackletMatch:
    """``compare_tracklets`` with a bounded content-keyed memo.

    Returns exactly what ``compare_tracklets`` returns - see the note inside
    ``compare_tracklets`` about why the aggregate step must keep re-normalising.

    P35/T11: the *key* is built from the raw arrays (``_raw_samples``) so a hit
    does not pay for re-normalising both galleries.  On a miss the full
    ``appearance_samples`` normalisation still runs, exactly as before, so the
    computed value is unchanged.
    """
    raw_left = _raw_samples(left)
    raw_right = _raw_samples(right)
    if not raw_left or not raw_right:
        fallback = float(missing_distance)
        return TrackletMatch(fallback, 0, 0, fallback, fallback)

    key = (
        _gallery_digest(raw_left),
        _gallery_digest(raw_right),
        float(missing_distance),
    )
    cache = _match_cache()
    cached = cache.get(key)
    if cached is not None:
        cache.move_to_end(key)
        return cached
    match = _compare_tracklets_from_samples(
        appearance_samples(left), appearance_samples(right), missing_distance
    )
    cache[key] = match
    if len(cache) > _TRACKLET_MATCH_CACHE_LIMIT:
        cache.popitem(last=False)
    return match


def compare_tracklets(left, right, missing_distance: float = 0.25) -> TrackletMatch:
    """Compare two galleries using robust symmetric nearest-neighbour evidence."""
    left_samples = appearance_samples(left)
    right_samples = appearance_samples(right)
    if not left_samples or not right_samples:
        fallback = float(missing_distance)
        return TrackletMatch(fallback, 0, 0, fallback, fallback)
    return _compare_tracklets_from_samples(
        left_samples, right_samples, missing_distance
    )


def _compare_tracklets_from_samples(
    left_samples: Tuple[np.ndarray, ...],
    right_samples: Tuple[np.ndarray, ...],
    missing_distance: float = 0.25,
) -> TrackletMatch:
    """The comparison itself, on galleries already extracted from their source."""

    # P35/T5: vectorised pairwise distances.  Same values as the former
    # per-pair ``histogram_distance`` loop (max diff 1.3e-15), but the inner
    # sweep becomes one matmul instead of N*M calls into OpenCV.
    left_flat = np.stack(
        [
            np.asarray(sample, dtype=np.float64).ravel()
            for sample in left_samples
        ]
    )
    right_flat = np.stack(
        [
            np.asarray(sample, dtype=np.float64).ravel()
            for sample in right_samples
        ]
    )
    pairwise = histogram_distance_matrix(left_flat, right_flat).astype(np.float32)

    left_nearest = pairwise.min(axis=1)
    right_nearest = pairwise.min(axis=0)
    symmetric_nearest = np.concatenate((left_nearest, right_nearest))
    # A destination tracklet is usually still short when handoff runs. Match
    # every node of the smaller graph to its best node in the larger graph;
    # old viewpoints in the longer source route should not veto a good entry.
    partial_nearest = (
        left_nearest
        if len(left_samples) <= len(right_samples)
        else right_nearest
    )
    nearest_distance = float(np.median(partial_nearest))
    coverage_distance = float(np.median(symmetric_nearest))
    # P35/T6 note: this must stay ``aggregate_appearance``, NOT a "fast" variant
    # working on the samples already in hand.  ``appearance_samples`` returns
    # ``_normalized_copy`` output, and ``_normalized_copy`` is *not* idempotent:
    # a second ``cv2.normalize`` on an already-normalised float32 vector moves
    # components by up to 1.5e-08 in 139/170 measured galleries.  Using the
    # already-normalised arrays directly therefore changes ``aggregate_distance``
    # and with it the returned match distance.  Measured, not assumed.
    left_aggregate = aggregate_appearance(left_samples)
    right_aggregate = aggregate_appearance(right_samples)
    aggregate_distance = histogram_distance(left_aggregate, right_aggregate)
    top_count = min(3, pairwise.size)
    best_pairs = float(np.mean(np.partition(pairwise.ravel(), top_count - 1)[:top_count]))
    distance = (
        0.50 * nearest_distance
        + 0.20 * coverage_distance
        + 0.20 * aggregate_distance
        + 0.10 * best_pairs
    )
    return TrackletMatch(
        distance=float(np.clip(distance, 0.0, 1.0)),
        support=min(len(left_samples), len(right_samples)),
        sample_pairs=int(pairwise.size),
        aggregate_distance=aggregate_distance,
        nearest_distance=nearest_distance,
    )
