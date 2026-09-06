from __future__ import annotations

import pytest

from techgar.cross_camera_manager import CrossCameraManager


def test_motion_manager_rejects_untrained_deep_reid_mode():
    with pytest.raises(ValueError, match="trained model"):
        CrossCameraManager(
            camera_sizes={"cam1": (640, 360)},
            camera_crops={"cam1": (0, 0, 640, 360)},
            use_deep_reid=True,
        )
