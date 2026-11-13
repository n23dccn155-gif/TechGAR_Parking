"""CORE2 shared physical reachability gate; coordinates cm, time seconds."""
from __future__ import annotations
import math

from .config import Core2Config


def reachable(last_xy, last_t, last_sigma_cm, xy, t, sigma_cm, config: Core2Config) -> bool:
    values = (*last_xy, last_t, last_sigma_cm, *xy, t, sigma_cm)
    if not all(math.isfinite(value) for value in values):
        raise ValueError('nonfinite gate input')
    if t < last_t or min(last_sigma_cm, sigma_cm) < 0:
        raise ValueError('invalid gate time or uncertainty')
    radius = config.v_max_cm_s * (t-last_t) + config.k_sigma * math.hypot(last_sigma_cm, sigma_cm)
    return math.dist(last_xy, xy) <= radius
