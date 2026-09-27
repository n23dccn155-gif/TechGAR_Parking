"""GID continuity: parked time must not count as lost-signal time.

A vehicle that parks keeps its ``last_seen_time`` frozen while the slot
reservation proves where it is.  When the reservation is released the
manager re-anchors retention (``retention_anchor_*``/``dormant_since_*``),
but the same-camera stale veto inside ``_identity_is_recent`` only applied
that anchor for cleanup -- never for the matching path.  The result was a
permanently unmatchable identity once a parked car's departure token lapsed
(live15 gid13 -> gid14, vd_16 gid37 -> gid38).
"""
from dataclasses import dataclass

import numpy as np

from techgar.cross_camera_manager import CrossCameraManager
from techgar.tracklet_descriptor import AppearanceTracklet


@dataclass
class DummyTrack:
    cx: int
    cy: int
    w: int = 42
    h: int = 24
    history: list = None
    status: str = "confirmed"
    appearance: object = None

    def __post_init__(self):
        if self.history is None:
            self.history = [(self.cx, self.cy)]
        if self.appearance is None:
            self.appearance = np.ones((16, 16), dtype=np.float32)

    @property
    def x(self):
        return self.cx - self.w // 2

    @property
    def y(self):
        return self.cy - self.h


def make_manager():
    # cam2 pixels are translated into cam1/world pixels after calibration.
    return CrossCameraManager(
        camera_sizes={"cam1": (640, 480), "cam2": (640, 480)},
        camera_crops={"cam1": (0, 0, 640, 480), "cam2": (0, 0, 640, 480)},
        camera_transforms={
            "cam1": np.eye(3),
            "cam2": np.array(
                [[1.0, 0.0, 500.0], [0.0, 1.0, 0.0], [0.0, 0.0, 1.0]]
            ),
        },
        edge_adjacency={("cam1", "right"): "cam2", ("cam2", "left"): "cam1"},
        overlap_regions={
            ("cam1", "cam2"): np.array(
                [[500, 0], [640, 0], [640, 480], [500, 480]],
                dtype=np.float32,
            )
        },
        match_distance=15.0,
        lookahead_frames=16,
        prediction_radius=90,
        appearance_threshold=0.45,
        min_direction_cosine=0.25,
    )


def one_hot_histogram(bin_index: int) -> np.ndarray:
    histogram = np.zeros((16, 16), dtype=np.float32)
    histogram.flat[bin_index] = 1.0
    return histogram


def attach_tracklet(track, *histograms):
    descriptor = AppearanceTracklet(max_samples=8, sample_interval=1)
    for frame_idx, histogram in enumerate(histograms, start=1):
        descriptor.update(histogram, frame_idx)
    track.appearance_tracklet = descriptor
    return track


def _park_identity(manager, histogram):
    """Register gid 1 in cam1 and hold it under a slot reservation."""
    parked = attach_tracklet(
        DummyTrack(300, 260, appearance=histogram), histogram, histogram
    )
    gid = manager.update_all_tracks(
        {"cam1": {1: parked}}, 1, {"cam1": 1.0}
    )["cam1"][1]
    manager.sync_parked_reservations(
        [
            {
                "global_id": gid,
                "slot_id": "A01",
                "camera_id": "cam1",
                "state": "parked",
                "center": (300, 260),
            }
        ],
        2,
    )
    manager.detach_parked_local_tracks(2)
    return gid


def test_same_camera_match_uses_retention_anchor_not_frozen_last_seen():
    # A car parked for ~19 s must still be reclaimable seconds after its
    # reservation is released: the moving-ID veto has to measure elapsed
    # from the departure anchor, not from the frozen pre-parking frame.
    manager = make_manager()
    histogram = one_hot_histogram(0)
    _park_identity(manager, histogram)
    # Stay parked until t=20.0 s; the identity's last_seen_time stays 1.0.
    manager.update_all_tracks({"cam1": {}}, 200, {"cam1": 20.0})
    manager.sync_parked_reservations([], 201)
    identity = manager._identities[1]
    assert identity.state == "dormant"
    assert identity.retention_anchor_time == 20.0

    leaving = attach_tracklet(
        DummyTrack(
            315,
            260,
            history=[(305, 260), (310, 260), (315, 260)],
            appearance=histogram,
        ),
        histogram,
        histogram,
    )
    ids = manager.update_all_tracks(
        {"cam1": {9: leaving}}, 202, {"cam1": 20.1}
    )

    assert ids == {"cam1": {9: 1}}
    assert any(
        event["type"] == "dormant_global_id_recovered"
        and event["global_id"] == 1
        for event in manager.to_json({})["recent_events"]
    )


def test_same_camera_stale_veto_still_fires_and_is_telemetried():
    # The veto is still real: a car reappearing long *after the departure
    # anchor* is treated as a different vehicle -- and now records why.
    manager = make_manager()
    histogram = one_hot_histogram(0)
    _park_identity(manager, histogram)
    manager.update_all_tracks({"cam1": {}}, 200, {"cam1": 20.0})
    manager.sync_parked_reservations([], 201)

    someone_else = attach_tracklet(
        DummyTrack(
            315,
            260,
            history=[(305, 260), (310, 260), (315, 260)],
            appearance=histogram,
        ),
        histogram,
        histogram,
    )
    # 16 s after the reservation dropped: beyond the 12 s moving window.
    ids = manager.update_all_tracks(
        {"cam1": {9: someone_else}}, 360, {"cam1": 36.0}
    )

    assert ids["cam1"][9] != 1
    rejections = [
        event
        for event in manager.to_json({})["recent_events"]
        if event["type"] == "dormant_reid_rejected"
        and event["global_id"] == 1
    ]
    assert rejections, "same-camera stale veto must be visible in telemetry"
    assert any(event["reason"] == "same_camera_stale" for event in rejections)


def test_immature_fragment_defers_dormant_reid_with_telemetry():
    # A plausible but too-young fragment must defer, and the deferral must
    # be visible instead of silently falling through to allocation.
    manager = make_manager()
    histogram = one_hot_histogram(0)
    parked = attach_tracklet(
        DummyTrack(300, 260, appearance=histogram), histogram, histogram
    )
    assert manager.update_all_tracks(
        {"cam1": {1: parked}}, 1, {"cam1": 1.0}
    )["cam1"][1] == 1
    manager.notify_track_lost("cam1", 1, parked, 2, timestamp_s=1.1)

    one_frame_fragment = attach_tracklet(
        DummyTrack(305, 260, history=[(305, 260)], appearance=histogram),
        histogram,
        histogram,
    )
    ids = manager.update_all_tracks(
        {"cam1": {9: one_frame_fragment}}, 3, {"cam1": 1.2}
    )

    assert ids == {"cam1": {}}
    assert manager.get_global_id("cam1", 9) is None
    assert any(
        event["type"] == "dormant_reid_deferred_fragment_immature"
        and event["global_id"] == 1
        for event in manager.to_json({})["recent_events"]
    )
