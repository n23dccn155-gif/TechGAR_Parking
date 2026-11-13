"""B0-only passive tap of legacy detector output, before local association.

This is not M1: legacy _detect can consult local tracks and priority regions.
"""
from __future__ import annotations

import hashlib
from pathlib import Path
import numpy as np
from .types import Blob


def core_version() -> str:
    digest = hashlib.sha256()
    for path in sorted(Path(__file__).parent.glob("*.py")):
        digest.update(path.name.encode("utf-8") + b"\0" + path.read_bytes())
    return digest.hexdigest()


def tap_detector(tracker):
    """Attach to one tracker; only copy primitive fields, never mutate detections."""
    original = tracker._detect
    captured = []

    def detect(*args, **kwargs):
        detections, mask = original(*args, **kwargs)
        captured[:] = [{key: item.get(key) for key in
                       ("box", "point", "area", "roi_clipped", "roi_support_ratio")}
                      for item in detections]
        return detections, mask

    tracker._detect = detect
    return captured


def make_blobs(captured, cam, frame, t, transform):
    blobs = []
    for detection in captured:
        x, y, w, h = (int(v) for v in detection["box"])
        point = detection.get("point")
        if point is None:
            point = (x + w / 2, y + h)
        p = np.asarray(transform, dtype=float) @ np.asarray((point[0], point[1], 1.0))
        if not np.isfinite(p).all() or abs(p[2]) < 1e-12:
            raise ValueError("nonfinite Blob ground projection")
        support = detection.get("roi_support_ratio")
        blobs.append(Blob(cam=cam, frame=int(frame), t=float(t), bbox=(x, y, w, h),
                          xy=(float(p[0]/p[2]), float(p[1]/p[2])),
                          area_px=int(round(detection.get("area") or 0)),
                          roi_clipped=bool(detection.get("roi_clipped", False)),
                          roi_support=float(support if support is not None else 1.0), desc=None))
    return blobs
