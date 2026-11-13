"""CORE2 — lop mong tai dung desc ngoai hinh tu tracklet_descriptor (KHONG copy code).

`tracklet_descriptor` la module THUAN (hsv_histogram, compute_sample_quality khong doc
trang thai track), nen core2 duoc import theo SPEC_CORE2_ARCH.md §4.
"""
from __future__ import annotations

import numpy as np

# alias de detect.py khong phai biet ten ham goc cua legacy
from ..tracklet_descriptor import compute_sample_quality as sample_quality
from ..tracklet_descriptor import hsv_histogram

__all__ = ["hsv_histogram", "sample_quality", "desc_length"]

DESC_DIM = 416      # tracklet_descriptor.hsv_histogram


def desc_length() -> int:
    """Do dai vector desc (416 = HSV + LAB, xem tracklet_descriptor.hsv_histogram)."""
    return DESC_DIM
