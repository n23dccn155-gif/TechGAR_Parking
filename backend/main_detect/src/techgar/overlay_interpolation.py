"""Display-only interpolation of measured image-space boxes.

Callers own history and must never feed the returned boxes into tracking.
"""

import math


def interpolate_box(first, first_time, second, second_time, target_time):
    """Linearly interpolate xyxy coordinates inside two measurement times.

    Outside the interval, hold the nearest measurement; no extrapolation is
    performed. Times can be frame indices or seconds, in consistent units.
    """
    a, b = tuple(map(float, first)), tuple(map(float, second))
    if len(a) != 4 or len(b) != 4:
        raise ValueError("boxes must have four xyxy coordinates")
    times = tuple(map(float, (first_time, second_time, target_time)))
    if not all(math.isfinite(v) for v in a + b + times):
        raise ValueError("coordinates and times must be finite")
    start, end, target = times
    if end <= start:
        raise ValueError("measurement times must increase")
    if a[0] > a[2] or a[1] > a[3] or b[0] > b[2] or b[1] > b[3]:
        raise ValueError("invalid xyxy box")
    fraction = max(0.0, min(1.0, (target - start) / (end - start)))
    return tuple(x + fraction * (y - x) for x, y in zip(a, b))


def draw_boxes(frame, boxes, color=(0, 255, 0), thickness=2):
    """Return a copy of the latest frame with display-only boxes drawn on it."""
    import cv2

    result = frame.copy()
    for box in boxes:
        x1, y1, x2, y2 = (round(value) for value in box)
        cv2.rectangle(result, (x1, y1), (x2, y2), color, thickness)
    return result
