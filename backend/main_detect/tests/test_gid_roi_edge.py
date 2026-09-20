"""Global-ID continuity at ROI edges.

Two defects starve or duplicate local tracks where a vehicle is clipped by
the tracking ROI boundary, and each failure later surfaces as a false new
Global ID:

* a clipped blob whose strict-ROI support falls below the pixel floor is
  rejected outright, so its tentative fragment dies before it can earn an
  identity and a later fragment mints a new one;
* two live local tracks can sit on one clipped object (near-identical
  bboxes), which feeds ghost-GID allocation downstream.
"""
import cv2
import numpy as np

from techgar.motion_tracker import MotionVehicleTracker
from techgar.occlusion_guard import OcclusionGroup
from techgar.vehicle_tracker import TrackStatus


class _FixedBackground:
    def __init__(self, foreground):
        self.foreground = foreground

    def apply(self, _frame):
        return self.foreground.copy()


def _edge_tracker(monkeypatch, foreground, roi_mask, **kwargs):
    kwargs.setdefault("min_area", 100)
    kwargs.setdefault("min_width", 10)
    kwargs.setdefault("min_height", 10)
    kwargs.setdefault("motion_min_pixels", 100)
    kwargs.setdefault("motion_min_ratio", 0.0)
    kwargs.setdefault("max_bbox_width_ratio", 1.0)
    kwargs.setdefault("max_bbox_height_ratio", 1.0)
    kwargs.setdefault("max_bbox_area_ratio", 1.0)
    tracker = MotionVehicleTracker(**kwargs)
    tracker.bg_sub = _FixedBackground(foreground)
    tracker.roi_mask = roi_mask
    monkeypatch.setattr(
        tracker,
        "_temporal_motion_mask",
        lambda _frame, timestamp_s=None: foreground.copy(),
    )
    return tracker


def _edge_detection(tracker, frame, box, *, roi_clipped=True):
    """Synthetic detection dict as ``_detect`` would emit at an ROI edge."""
    return {
        "box": tuple(box),
        "point": tracker._bottom_center(tuple(box)),
        "area": float(box[2] * box[3]),
        "bbox_area": float(box[2] * box[3]),
        "hist": tracker._histogram(frame, tuple(box)),
        "priority": False,
        "ambiguous_merged": False,
        "observation_kind": "detection",
        "roi_clipped": bool(roi_clipped),
        "roi_support_pixels": int(0.83 * box[2] * box[3]) if roi_clipped else box[2] * box[3],
        "roi_support_ratio": 0.83 if roi_clipped else 1.0,
    }


def _seed_clipped_track(tracker, frame, box, *, observations=1):
    """Create a track and grow it to the requested observation count."""
    tracker._create_or_reid(_edge_detection(tracker, frame, box))
    track = tracker._tracks[tracker._next_id - 1]
    for _ in range(observations - 1):
        # Mimic the real frame flow: predict() sets statePre, without which
        # kalman.correct() would zero the filter state.
        tracker._frame_idx += 1
        tracker._predict_tracks()
        tracker._apply_detection(
            track, _edge_detection(tracker, frame, box)
        )
    return track


# --- context-band support for clipped blobs -------------------------------


def test_context_band_support_rescues_clipped_blob_below_strict_floor(
    monkeypatch,
):
    """A car clipped by the ROI edge keeps enough context-band support."""
    foreground = np.zeros((100, 160), dtype=np.uint8)
    foreground[40:80, 79:120] = 255  # straddles the strict edge x=80
    strict_roi = np.zeros((100, 160), dtype=np.uint8)
    strict_roi[:, :80] = 255
    tracker = _edge_tracker(
        monkeypatch, foreground, strict_roi, roi_context_padding_px=20
    )

    detections, _ = tracker._detect(np.zeros((100, 160, 3), dtype=np.uint8))

    assert len(detections) == 1
    detection = detections[0]
    assert detection["roi_clipped"] is True
    # Only the sliver left of x=80 counts inside the strict ROI.
    assert detection["roi_support_pixels"] < 100
    assert detection["roi_context_rescued"] is True


def test_clipped_blob_below_strict_floor_dies_without_context_band(
    monkeypatch,
):
    """Same geometry with zero padding keeps the strict-support rejection."""
    foreground = np.zeros((100, 160), dtype=np.uint8)
    foreground[40:80, 79:120] = 255
    strict_roi = np.zeros((100, 160), dtype=np.uint8)
    strict_roi[:, :80] = 255
    tracker = _edge_tracker(
        monkeypatch, foreground, strict_roi, roi_context_padding_px=0
    )

    detections, _ = tracker._detect(np.zeros((100, 160, 3), dtype=np.uint8))

    # With no band the contour is cut to a 1 px sliver that dies on the size
    # gates before strict support is even measured; the starvation outcome is
    # the same either way, so the contract is simply "no detection".
    assert detections == []


def test_blob_living_entirely_in_the_context_band_still_dies(monkeypatch):
    """The relaxed floor must not expand the monitored area itself."""
    foreground = np.zeros((100, 160), dtype=np.uint8)
    foreground[40:80, 84:120] = 255  # only touches the band, never the ROI
    strict_roi = np.zeros((100, 160), dtype=np.uint8)
    strict_roi[:, :80] = 255
    tracker = _edge_tracker(
        monkeypatch, foreground, strict_roi, roi_context_padding_px=20
    )

    detections, _ = tracker._detect(np.zeros((100, 160, 3), dtype=np.uint8))

    assert detections == []
    assert any(
        item["type"] == "insufficient_strict_roi_support"
        for item in tracker.last_detection_rejections
    )


def test_unclipped_blob_deep_inside_roi_is_unaffected_by_context_relaxation(
    monkeypatch,
):
    """A blob comfortably inside keeps normal admission with no rescue flag."""
    foreground = np.zeros((100, 160), dtype=np.uint8)
    foreground[30:70, 20:60] = 255
    strict_roi = np.zeros((100, 160), dtype=np.uint8)
    strict_roi[:, :80] = 255
    tracker = _edge_tracker(
        monkeypatch, foreground, strict_roi, roi_context_padding_px=20
    )

    detections, _ = tracker._detect(np.zeros((100, 160, 3), dtype=np.uint8))

    assert len(detections) == 1
    assert detections[0]["roi_clipped"] is False
    assert detections[0]["roi_context_rescued"] is False


# --- anchor-outside-ROI tolerance for clipped tracks ----------------------


def test_marginal_anchor_outside_strict_roi_is_tolerated_inside_band(
    monkeypatch,
):
    """A >=98%-inside blob whose anchor slips past the edge is kept."""
    foreground = np.zeros((100, 160), dtype=np.uint8)
    foreground[0:60, 40:80] = 255  # bottom row one pixel past the strict edge
    strict_roi = np.zeros((100, 160), dtype=np.uint8)
    strict_roi[:59, :] = 255
    tracker = _edge_tracker(
        monkeypatch, foreground, strict_roi, roi_context_padding_px=4
    )

    detections, _ = tracker._detect(np.zeros((100, 160, 3), dtype=np.uint8))

    assert len(detections) == 1
    detection = detections[0]
    assert detection["roi_clipped"] is False  # ~98.3% strict support
    assert detection["roi_anchor_tolerated"] is True
    assert not any(
        item["type"] == "anchor_outside_roi"
        for item in tracker.last_detection_rejections
    )


def test_anchor_beyond_the_context_band_is_still_rejected(monkeypatch):
    """The tolerance is bounded: past the band the anchor stays rejected."""
    foreground = np.zeros((100, 160), dtype=np.uint8)
    foreground[0:60, 40:80] = 255
    strict_roi = np.zeros((100, 160), dtype=np.uint8)
    strict_roi[:59, :] = 255
    tracker = _edge_tracker(
        monkeypatch, foreground, strict_roi, roi_context_padding_px=1
    )

    detections, _ = tracker._detect(np.zeros((100, 160, 3), dtype=np.uint8))

    assert detections == []
    assert any(
        item["type"] == "anchor_outside_roi"
        for item in tracker.last_detection_rejections
    )


# --- twin-track dedup at ROI edge ------------------------------------------


def test_roi_edge_twin_pair_suppresses_the_weaker_lineage():
    tracker = MotionVehicleTracker(min_confirm_displacement=0)
    tracker.roi_mask = np.full((120, 200), 255, dtype=np.uint8)
    frame = np.zeros((120, 200, 3), dtype=np.uint8)
    tracker._frame_idx = 1
    tracker._current_timestamp_s = 0.0
    keeper = _seed_clipped_track(tracker, frame, (150, 40, 60, 40), observations=3)
    twin = _seed_clipped_track(tracker, frame, (151, 40, 60, 41))
    assert keeper.status == TrackStatus.CONFIRMED
    assert twin.status == TrackStatus.TENTATIVE

    detection = _edge_detection(tracker, frame, (150, 40, 60, 40))
    tracker._current_timestamp_s = 0.1
    assignments, unmatched_tracks, _ = tracker._assign([detection])

    assert [(track_id, col) for track_id, col, _ in assignments] == [(1, 0)]
    assert 2 in unmatched_tracks
    assert keeper.roi_edge_twin_suppressed is False
    assert twin.roi_edge_twin_suppressed is True
    event = next(
        item
        for item in tracker.association_events
        if item["type"] == "roi_edge_twin_suppressed"
    )
    assert event["kept_local_track_id"] == 1
    assert event["suppressed_local_track_id"] == 2
    assert event["iou"] >= 0.9


def test_suppressed_twin_coasts_without_feeding_identity(monkeypatch):
    """Through process_frame the twin is marked, kept, and never matched."""
    tracker = MotionVehicleTracker(min_confirm_displacement=0)
    tracker.roi_mask = np.full((120, 200), 255, dtype=np.uint8)
    frame = np.zeros((120, 200, 3), dtype=np.uint8)
    tracker._frame_idx = 1
    tracker._current_timestamp_s = 0.0
    _seed_clipped_track(tracker, frame, (150, 40, 60, 40), observations=3)
    _seed_clipped_track(tracker, frame, (151, 40, 60, 41))
    monkeypatch.setattr(
        tracker,
        "_detect",
        lambda _frame, timestamp_s=None, priority_regions=None: (
            [_edge_detection(tracker, frame, (150, 40, 60, 40))],
            np.zeros(_frame.shape[:2], dtype=np.uint8),
        ),
    )

    tracks, _mask, _expired = tracker.process_frame(frame, timestamp_s=0.1)

    assert set(tracks) == {1, 2}
    twin = tracks[2]
    assert twin.association_state == "suppressed_roi_edge_twin"
    assert twin.observation_kind != "detection"
    assert twin.consecutive_invisible_count == 1
    assert tracks[1].association_state == "matched"


def test_roi_edge_twins_inside_an_occlusion_group_are_left_alone():
    tracker = MotionVehicleTracker()
    tracker.roi_mask = np.full((120, 200), 255, dtype=np.uint8)
    frame = np.zeros((120, 200, 3), dtype=np.uint8)
    tracker._frame_idx = 1
    tracker._current_timestamp_s = 0.0
    _seed_clipped_track(tracker, frame, (150, 40, 60, 40), observations=3)
    _seed_clipped_track(tracker, frame, (151, 40, 60, 41))
    tracker.occlusion_guard.groups[(1, 2)] = OcclusionGroup(
        members=(1, 2),
        references={1: (60.0, 40.0), 2: (60.0, 40.0)},
        created_at=0.0,
        active=True,
    )

    detection = _edge_detection(tracker, frame, (150, 40, 60, 40))
    tracker._current_timestamp_s = 0.1
    tracker._assign([detection])

    assert tracker._tracks[1].roi_edge_twin_suppressed is False
    assert tracker._tracks[2].roi_edge_twin_suppressed is False
    assert not any(
        item["type"] == "roi_edge_twin_suppressed"
        for item in tracker.association_events
    )


def test_unclipped_near_identical_tracks_are_not_suppressed():
    """Same geometry without ROI clipping is not a boundary twin."""
    tracker = MotionVehicleTracker()
    tracker.roi_mask = np.full((120, 200), 255, dtype=np.uint8)
    frame = np.zeros((120, 200, 3), dtype=np.uint8)
    tracker._frame_idx = 1
    tracker._current_timestamp_s = 0.0
    tracker._create_or_reid(
        _edge_detection(tracker, frame, (150, 40, 60, 40), roi_clipped=False)
    )
    tracker._create_or_reid(
        _edge_detection(tracker, frame, (151, 40, 60, 41), roi_clipped=False)
    )

    tracker._assign([_edge_detection(tracker, frame, (150, 40, 60, 40))])

    assert tracker._tracks[1].roi_edge_twin_suppressed is False
    assert tracker._tracks[2].roi_edge_twin_suppressed is False
    assert not any(
        item["type"] == "roi_edge_twin_suppressed"
        for item in tracker.association_events
    )


def test_two_confirmed_visible_twins_are_not_suppressed():
    """Both-confirmed, both-visible pairs keep ordinary competition logic."""
    tracker = MotionVehicleTracker(
        min_visible_count=1, min_confirm_displacement=0
    )
    tracker.roi_mask = np.full((120, 200), 255, dtype=np.uint8)
    frame = np.zeros((120, 200, 3), dtype=np.uint8)
    tracker._frame_idx = 1
    tracker._current_timestamp_s = 0.0
    first = _seed_clipped_track(tracker, frame, (150, 40, 60, 40))
    second = _seed_clipped_track(tracker, frame, (151, 40, 60, 41))
    assert first.status == TrackStatus.CONFIRMED
    assert second.status == TrackStatus.CONFIRMED
    assert first.consecutive_invisible_count == 0
    assert second.consecutive_invisible_count == 0

    tracker._assign([_edge_detection(tracker, frame, (150, 40, 60, 40))])

    assert not any(
        item["type"] == "roi_edge_twin_suppressed"
        for item in tracker.association_events
    )
