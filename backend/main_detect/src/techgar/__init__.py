"""Core TechGAR vehicle tracking and parking package."""

from .cross_camera_manager import CrossCameraManager
from .motion_tracker import MotionVehicleTracker
from .parking_detector import ParkingDetector
from .slot_vehicle_binder import SlotVehicleBinder
from .tracklet_descriptor import AppearanceTracklet
from .deep_reid_model import DeepReIDExtractor

__all__ = [
    "CrossCameraManager",
    "MotionVehicleTracker",
    "ParkingDetector",
    "SlotVehicleBinder",
    "AppearanceTracklet",
    "DeepReIDExtractor",
]
