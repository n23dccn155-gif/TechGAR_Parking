"""Kiểu dữ liệu track dùng chung cho các tracker của TechGAR.

Module này giữ :class:`TrackStatus` và :class:`TrackedVehicle` — bản ghi một xe
đang được theo dõi (bbox, điểm tiếp xúc mặt đường, lịch sử, tracklet ngoại hình
và telemetry association) mà :class:`techgar.motion_tracker.MotionVehicleTracker`
và các tầng trên (CrossCameraManager, SlotVehicleBinder) trao đổi với nhau.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import List, Optional, Tuple

import numpy as np

from .tracklet_descriptor import AppearanceTracklet


class TrackStatus(Enum):
    TENTATIVE = "tentative"
    CONFIRMED = "confirmed"
    LOST = "lost"


@dataclass
class TrackedVehicle:
    """Một xe với local track ID do tracker duy trì.

    ``cx, cy`` là điểm tiếp xúc mặt đường (giữa cạnh đáy bbox), ổn định hơn
    tâm bbox khi camera nhìn xiên.  ``ground_point`` giữ toạ độ world (mét/cm
    theo calibration) khi tracker được truyền homography.
    """

    track_id: int
    cx: int
    cy: int
    bbox: Tuple[int, int, int, int]
    area: float
    confidence: float = 0.0
    class_id: int = -1
    class_name: str = "vehicle"
    age: int = 1
    total_visible_count: int = 1
    consecutive_invisible_count: int = 0
    status: TrackStatus = TrackStatus.TENTATIVE
    history: List[Tuple[int, int]] = field(default_factory=list)
    direction_events: List[dict] = field(default_factory=list)
    entered_frame: int = 0
    exited_frame: int = 0
    last_seen_frame: int = 0
    ground_point: Optional[Tuple[float, float]] = None
    appearance: Optional[np.ndarray] = field(default=None, repr=False)
    appearance_tracklet: Optional[AppearanceTracklet] = field(default=None, repr=False)
    # Association telemetry.  These fields are deliberately separate from
    # ``history``: history is also rendered as a debug trail, while the
    # association code must know whether a point came from a real detection
    # or from a Kalman extrapolation.
    last_measured_center: Optional[Tuple[float, float]] = None
    last_measured_timestamp_s: Optional[float] = None
    prediction_age_s: float = 0.0
    velocity_confidence: float = 0.0
    prediction_source: str = "measurement"
    association_state: str = "new_tentative"
    last_ambiguous_frame: Optional[int] = None
    last_ambiguous_timestamp_s: Optional[float] = None
    last_ambiguous_kind: Optional[str] = None
    ambiguous_clear_streak: int = 0
    # OpenCV MOG2 marks both true cast shadows and dark physical vehicles with
    # value 127.  MotionVehicleTracker may conservatively rescue those pixels
    # and then run its own background/colour shadow discriminator.
    dark_foreground_rescued: bool = False
    mog_shadow_marker_ratio: float = 0.0

    @property
    def x(self) -> int:
        return self.bbox[0]

    @property
    def y(self) -> int:
        return self.bbox[1]

    @property
    def w(self) -> int:
        return self.bbox[2]

    @property
    def h(self) -> int:
        return self.bbox[3]

    @property
    def visibility(self) -> float:
        return self.total_visible_count / max(self.age, 1)
