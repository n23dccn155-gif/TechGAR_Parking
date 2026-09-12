import cv2
import numpy as np
import pytest

from techgar.motion_tracker import MotionVehicleTracker
from techgar.tracklet_descriptor import histogram_distance
from techgar.vehicle_tracker import TrackStatus


def _frame_with_soft_blob(center_x: int, brightness: int = 30) -> np.ndarray:
    height, width = 96, 144
    yy, xx = np.mgrid[:height, :width]
    blob = 58.0 * np.exp(-(((xx - center_x) ** 2) + ((yy - 48) ** 2)) / (2.0 * 10.0 ** 2))
    gray = np.clip(brightness + blob, 0, 255).astype(np.uint8)
    return cv2.cvtColor(gray, cv2.COLOR_GRAY2BGR)


def _detection(tracker: MotionVehicleTracker, frame: np.ndarray, x: int, *, priority: bool) -> dict:
    box = (x, 20, 28, 24)
    return {
        "box": box,
        "point": tracker._bottom_center(box),
        "area": float(box[2] * box[3]),
        "hist": tracker._histogram(frame, box),
        "priority": priority,
    }


def test_constructor_preserves_requested_track_history_length():
    tracker = MotionVehicleTracker(history_len=37)

    assert tracker.history_len == 37


def test_constructor_keeps_legacy_detection_defaults_opt_in_only():
    tracker = MotionVehicleTracker()

    assert tracker.history_len == 10
    assert tracker.min_confirm_displacement == 12.0
    assert tracker.motion_threshold == 25
    assert tracker.motion_min_ratio == 0.08
    assert tracker.motion_min_pixels == 160
    assert tracker.enable_multiscale_motion is False
    assert tracker.reject_cast_shadows is False


def test_timestamp_history_selects_short_and_long_references(monkeypatch):
    tracker = MotionVehicleTracker(enable_multiscale_motion=True)
    calls = []

    def record_reference(current, reference, threshold):
        calls.append(int(reference[0, 0]))
        return np.zeros_like(current)

    monkeypatch.setattr(tracker, "_motion_between", record_reference)
    for index in range(9):
        value = index * 10
        frame = np.full((32, 32, 3), value, dtype=np.uint8)
        tracker._temporal_motion_mask(frame, timestamp_s=index * 0.1)

    calls.clear()
    tracker._temporal_motion_mask(np.full((32, 32, 3), 90, dtype=np.uint8), timestamp_s=0.9)

    assert len(calls) == 2
    assert any(value <= 20 for value in calls)  # approximately 0.8 s old
    assert any(50 <= value <= 70 for value in calls)  # approximately 0.25 s old


def test_timestamp_gap_does_not_compare_across_stream_pause(monkeypatch):
    tracker = MotionVehicleTracker()
    calls = []

    def record_reference(current, reference, threshold):
        calls.append(reference)
        return np.full_like(current, 255)

    monkeypatch.setattr(tracker, "_motion_between", record_reference)
    tracker._temporal_motion_mask(np.zeros((32, 32, 3), dtype=np.uint8), timestamp_s=0.0)
    tracker._temporal_motion_mask(np.zeros((32, 32, 3), dtype=np.uint8), timestamp_s=0.2)
    calls.clear()

    mask = tracker._temporal_motion_mask(
        np.full((32, 32, 3), 255, dtype=np.uint8),
        timestamp_s=7.0,
    )

    assert not calls
    assert cv2.countNonZero(mask) == 0


def test_multiscale_mask_detects_a_slow_soft_object():
    tracker = MotionVehicleTracker(
        motion_threshold=20,
        enable_multiscale_motion=True,
    )
    last_mask = None

    for index in range(10):
        last_mask = tracker._temporal_motion_mask(
            _frame_with_soft_blob(40 + index),
            timestamp_s=index * 0.1,
        )

    assert last_mask is not None
    assert cv2.countNonZero(last_mask) > 0


def test_uniform_brightness_change_does_not_create_temporal_motion():
    tracker = MotionVehicleTracker(
        motion_threshold=20,
        enable_multiscale_motion=True,
    )

    masks = [
        tracker._temporal_motion_mask(
            np.full((72, 96, 3), 40 + index * 6, dtype=np.uint8),
            timestamp_s=index * 0.1,
        )
        for index in range(10)
    ]

    assert all(cv2.countNonZero(mask) == 0 for mask in masks)


def test_priority_region_allows_small_blob_but_normal_region_rejects_it(monkeypatch):
    tracker = MotionVehicleTracker(min_area=650, priority_min_area=350)
    foreground = np.zeros((100, 120), dtype=np.uint8)
    foreground[40:60, 30:55] = 255

    class FixedBackground:
        def apply(self, _frame):
            return foreground.copy()

    tracker.bg_sub = FixedBackground()
    monkeypatch.setattr(
        tracker,
        "_temporal_motion_mask",
        lambda _frame, timestamp_s=None: foreground.copy(),
    )
    frame = np.zeros((100, 120, 3), dtype=np.uint8)

    normal_detections, _ = tracker._detect(frame)
    priority_detections, _ = tracker._detect(
        frame,
        priority_regions=[[(20, 30), (70, 30), (70, 80), (20, 80)]],
    )

    assert normal_detections == []
    assert len(priority_detections) == 1
    assert priority_detections[0]["priority"] is True


def test_mog_shadow_value_without_background_cannot_become_candidate(monkeypatch):
    tracker = MotionVehicleTracker(
        priority_min_area=350,
        reject_cast_shadows=True,
    )
    mog_shadow = np.zeros((100, 120), dtype=np.uint8)
    mog_shadow[40:65, 30:60] = 127  # OpenCV MOG2 detectShadows marker
    temporal_motion = np.zeros_like(mog_shadow)
    temporal_motion[40:65, 30:60] = 255

    class FixedBackground:
        def apply(self, _frame):
            return mog_shadow.copy()

    tracker.bg_sub = FixedBackground()
    monkeypatch.setattr(
        tracker,
        "_temporal_motion_mask",
        lambda _frame, timestamp_s=None: temporal_motion.copy(),
    )

    detections, _ = tracker._detect(
        np.zeros((100, 120, 3), dtype=np.uint8),
        priority_regions=[[(20, 30), (70, 30), (70, 80), (20, 80)]],
    )

    assert detections == []


def test_dark_vehicle_mislabeled_as_mog_shadow_is_recovered(monkeypatch):
    box = (50, 40, 40, 40)
    background, foreground = _synthetic_background_and_motion(box)
    mog_shadow = np.where(foreground > 0, 127, 0).astype(np.uint8)
    frame = background.copy()
    x, y, width, height = box
    frame[y:y + height, x:x + width] = 10
    tracker = MotionVehicleTracker(reject_cast_shadows=True)
    tracker.bg_sub = _FixedBackgroundModel(background, mog_shadow)
    monkeypatch.setattr(
        tracker,
        "_temporal_motion_mask",
        lambda _frame, timestamp_s=None: foreground.copy(),
    )

    detections, _ = tracker._detect(frame)

    assert len(detections) == 1
    assert detections[0]["dark_foreground_rescued"] is True
    assert detections[0]["mog_shadow_marker_ratio"] >= 0.95
    assert tracker.last_shadow_rejections == []


def test_roi_context_completes_vehicle_touching_boundary_without_admitting_outside_blob(monkeypatch):
    tracker = MotionVehicleTracker(
        min_area=200,
        motion_min_pixels=20,
        motion_min_ratio=0.02,
        roi_context_padding_px=25,
        max_bbox_width_ratio=0.8,
        max_bbox_height_ratio=0.8,
        max_bbox_area_ratio=0.5,
    )
    strict_roi = np.zeros((100, 120), dtype=np.uint8)
    strict_roi[50:100, :] = 255
    tracker.roi_mask = strict_roi
    foreground = np.zeros_like(strict_roi)
    foreground[30:70, 40:80] = 255

    class FixedBackground:
        def apply(self, _frame):
            return foreground.copy()

    tracker.bg_sub = FixedBackground()
    monkeypatch.setattr(
        tracker,
        "_temporal_motion_mask",
        lambda _frame, timestamp_s=None: foreground.copy(),
    )
    detections, _ = tracker._detect(np.zeros((100, 120, 3), dtype=np.uint8))

    assert len(detections) == 1
    assert detections[0]["box"][1] <= 31
    assert detections[0]["box"][3] >= 39
    assert detections[0]["roi_clipped"] is True
    assert 0.45 <= detections[0]["roi_support_ratio"] <= 0.55

    foreground[:] = 0
    foreground[10:30, 40:80] = 255
    detections, _ = tracker._detect(np.zeros((100, 120, 3), dtype=np.uint8))
    assert detections == []


def test_overlapping_fragments_do_not_freeze_one_physical_vehicle_as_two_tracks():
    tracker = MotionVehicleTracker(association_ambiguity_margin=0.08)
    frame = np.full((100, 140, 3), 90, dtype=np.uint8)
    tracker._frame_idx = 1
    tracker._current_timestamp_s = 1.0
    tracker._create_or_reid(_detection(tracker, frame, 30, priority=False))
    tracker._frame_idx = 2
    tracker._current_timestamp_s = 1.1
    tracker._create_or_reid(_detection(tracker, frame, 33, priority=False))
    track_ids = list(tracker._tracks)
    costs = np.asarray([[0.10], [0.12]], dtype=np.float64)
    predictions = {
        track_ids[0]: (44, 44),
        track_ids[1]: (47, 44),
    }
    detection = _detection(tracker, frame, 34, priority=False)

    tracker._mark_competing_assignments(
        costs, track_ids, predictions, [detection]
    )

    assert not detection.get("ambiguous_assignment", False)
    assert int(np.sum(costs[:, 0] < 10.0)) == 1
    event = next(
        event
        for event in tracker.association_events
        if event["type"] == "duplicate_lineage_competition_resolved"
    )
    assert len(event["suppressed_local_track_ids"]) == 1


def test_two_proven_cars_competing_for_one_blob_are_still_frozen():
    tracker = MotionVehicleTracker(association_ambiguity_margin=0.08)
    frame = np.full((100, 180, 3), 90, dtype=np.uint8)
    tracker._frame_idx = 1
    tracker._current_timestamp_s = 1.0
    tracker._create_or_reid(_detection(tracker, frame, 20, priority=False))
    tracker._create_or_reid(_detection(tracker, frame, 90, priority=False))
    track_ids = list(tracker._tracks)
    # Both cars were measured at the same time as separate, non-overlapping
    # objects before their foreground becomes one blob.
    tracker._tracks[track_ids[0]].clean_observations = [
        (1.0, (34, 44), (20, 20, 28, 24))
    ]
    tracker._tracks[track_ids[1]].clean_observations = [
        (1.0, (104, 44), (90, 20, 28, 24))
    ]
    costs = np.asarray([[0.10], [0.12]], dtype=np.float64)
    predictions = {track_ids[0]: (65, 44), track_ids[1]: (68, 44)}
    detection = _detection(tracker, frame, 52, priority=False)

    tracker._mark_competing_assignments(
        costs, track_ids, predictions, [detection]
    )

    assert detection["ambiguous_assignment"] is True
    assert np.all(costs[:, 0] == 10.0)
    assert any(
        event["type"] == "association_deferred_competing_tracks"
        for event in tracker.association_events
    )


def _synthetic_background_and_motion(box=(50, 40, 40, 40)):
    yy, xx = np.mgrid[:120, :160]
    floor = (95 + (xx % 13) * 2 + (yy % 9)).astype(np.uint8)
    background = np.stack(
        [
            np.clip(floor.astype(np.int16) - 5, 0, 255),
            floor,
            np.clip(floor.astype(np.int16) + 4, 0, 255),
        ],
        axis=2,
    ).astype(np.uint8)
    foreground = np.zeros(background.shape[:2], dtype=np.uint8)
    x, y, width, height = box
    foreground[y:y + height, x:x + width] = 255
    return background, foreground


class _FixedBackgroundModel:
    def __init__(self, background, foreground):
        self.background = background
        self.foreground = foreground

    def getBackgroundImage(self):
        return self.background.copy()

    def apply(self, _frame):
        return self.foreground.copy()


def test_achromatic_scaled_cast_shadow_is_rejected_even_in_priority_region(monkeypatch):
    box = (50, 40, 40, 40)
    background, foreground = _synthetic_background_and_motion(box)
    frame = background.copy()
    x, y, width, height = box
    frame[y:y + height, x:x + width] = np.clip(
        background[y:y + height, x:x + width].astype(np.float32) * 0.43,
        0,
        255,
    ).astype(np.uint8)
    tracker = MotionVehicleTracker(
        priority_min_area=350,
        reject_cast_shadows=True,
    )
    mog_shadow = np.where(foreground > 0, 127, 0).astype(np.uint8)
    tracker.bg_sub = _FixedBackgroundModel(background, mog_shadow)
    monkeypatch.setattr(
        tracker,
        "_temporal_motion_mask",
        lambda _frame, timestamp_s=None: foreground.copy(),
    )

    detections, _ = tracker._detect(
        frame,
        priority_regions=[[(40, 30), (105, 30), (105, 95), (40, 95)]],
    )

    assert detections == []
    assert len(tracker.last_shadow_rejections) == 1
    rejection = tracker.last_shadow_rejections[0]
    assert 0.40 <= rejection["attenuation"] <= 0.46
    assert rejection["explained_fraction"] >= 0.90


def test_dark_neutral_physical_object_is_not_rejected_as_scaled_shadow(monkeypatch):
    box = (50, 40, 40, 40)
    background, foreground = _synthetic_background_and_motion(box)
    frame = background.copy()
    x, y, width, height = box
    frame[y:y + height, x:x + width] = 10
    tracker = MotionVehicleTracker(reject_cast_shadows=True)
    tracker.bg_sub = _FixedBackgroundModel(background, foreground)
    monkeypatch.setattr(
        tracker,
        "_temporal_motion_mask",
        lambda _frame, timestamp_s=None: foreground.copy(),
    )

    detections, _ = tracker._detect(frame)

    assert len(detections) == 1
    assert tracker.last_shadow_rejections == []


def test_colored_slow_vehicle_keeps_priority_detection_with_shadow_filter(monkeypatch):
    # Area is below the normal threshold, so this also guards the relaxed
    # slow-car path against accidentally being disabled by shadow rejection.
    box = (50, 40, 25, 20)
    background, foreground = _synthetic_background_and_motion(box)
    frame = background.copy()
    x, y, width, height = box
    frame[y:y + height, x:x + width] = (12, 55, 18)
    tracker = MotionVehicleTracker(
        min_area=650,
        priority_min_area=350,
        reject_cast_shadows=True,
    )
    tracker.bg_sub = _FixedBackgroundModel(background, foreground)
    monkeypatch.setattr(
        tracker,
        "_temporal_motion_mask",
        lambda _frame, timestamp_s=None: foreground.copy(),
    )

    normal_detections, _ = tracker._detect(frame)
    priority_detections, _ = tracker._detect(
        frame,
        priority_regions=[[(40, 30), (90, 30), (90, 80), (40, 80)]],
    )

    assert normal_detections == []
    assert len(priority_detections) == 1
    assert priority_detections[0]["priority"] is True
    assert tracker.last_shadow_rejections == []


def test_priority_noise_needs_two_displaced_observations_to_confirm(monkeypatch):
    tracker = MotionVehicleTracker(
        min_visible_count=3,
        min_confirm_displacement=6,
        priority_min_visible_count=2,
        priority_min_confirm_displacement=3,
    )
    frame = np.zeros((80, 100, 3), dtype=np.uint8)
    detections = iter([
        [_detection(tracker, frame, 20, priority=True)],
        [_detection(tracker, frame, 24, priority=True)],
    ])
    monkeypatch.setattr(
        tracker,
        "_detect",
        lambda _frame, timestamp_s=None, priority_regions=None: (
            next(detections),
            np.zeros(_frame.shape[:2], dtype=np.uint8),
        ),
    )

    tracks, _mask, _expired = tracker.process_frame(frame, timestamp_s=0.0)
    assert tracks[1].status == TrackStatus.TENTATIVE

    tracks, _mask, _expired = tracker.process_frame(frame, timestamp_s=0.1)
    assert tracks[1].status == TrackStatus.CONFIRMED


def test_non_priority_track_keeps_stricter_confirmation_and_legacy_call(monkeypatch):
    tracker = MotionVehicleTracker(min_visible_count=3, min_confirm_displacement=6)
    frame = np.zeros((80, 100, 3), dtype=np.uint8)
    detections = iter([
        [_detection(tracker, frame, 20, priority=False)],
        [_detection(tracker, frame, 24, priority=False)],
    ])
    monkeypatch.setattr(
        tracker,
        "_detect",
        lambda _frame, timestamp_s=None, priority_regions=None: (
            next(detections),
            np.zeros(_frame.shape[:2], dtype=np.uint8),
        ),
    )

    tracker.process_frame(frame)
    tracks, _mask, _expired = tracker.process_frame(frame)

    assert tracks[1].status == TrackStatus.TENTATIVE


def test_stale_lost_track_cannot_capture_a_new_detection():
    tracker = MotionVehicleTracker(reacquire_max_seconds=0.75)
    frame = np.zeros((100, 180, 3), dtype=np.uint8)
    tracker._frame_idx = 1
    tracker._current_timestamp_s = 0.0
    tracker._create_or_reid(_detection(tracker, frame, 30, priority=False))
    old = tracker._tracks[1]
    old.status = TrackStatus.LOST
    old.consecutive_invisible_count = 1
    old.last_seen_timestamp_s = 0.0

    tracker._current_timestamp_s = 1.0
    assignments, unmatched_tracks, unmatched_detections = tracker._assign(
        [_detection(tracker, frame, 32, priority=False)]
    )

    assert assignments == []
    assert unmatched_tracks == [1]
    assert unmatched_detections == [0]
    assert any(
        event["type"] == "association_rejected_stale_track"
        for event in tracker.association_events
    )


def test_expired_local_track_id_is_never_reused_by_appearance_only():
    tracker = MotionVehicleTracker()
    frame = np.zeros((100, 220, 3), dtype=np.uint8)
    tracker._frame_idx = 1
    tracker._create_or_reid(_detection(tracker, frame, 30, priority=False))
    expired = tracker._tracks.pop(1)
    expired.exited_frame = 1
    tracker._exited_tracks[1] = expired

    tracker._frame_idx = 100
    tracker._create_or_reid(_detection(tracker, frame, 160, priority=False))

    assert set(tracker._tracks) == {2}
    assert tracker._tracks[2].fragment_visible_count == 1
    assert set(tracker._exited_tracks) == {1}


def test_large_detection_covering_two_tracks_is_frozen():
    tracker = MotionVehicleTracker(merged_detection_area_ratio=1.6)
    frame = np.zeros((120, 220, 3), dtype=np.uint8)
    tracker._frame_idx = 1
    tracker._current_timestamp_s = 0.0
    tracker._create_or_reid(_detection(tracker, frame, 50, priority=False))
    tracker._create_or_reid(_detection(tracker, frame, 90, priority=False))
    for item in tracker._tracks.values():
        item.status = TrackStatus.CONFIRMED

    merged = _detection(tracker, frame, 42, priority=False)
    merged["box"] = (42, 16, 90, 35)
    merged["point"] = (87, 51)
    merged["area"] = 2500.0
    merged["bbox_area"] = 3150.0
    tracker._current_timestamp_s = 0.1
    assignments, unmatched_tracks, unmatched_detections = tracker._assign([merged])

    assert assignments == []
    assert set(unmatched_tracks) == {1, 2}
    assert unmatched_detections == []
    assert any(
        event["type"] == "merged_detection_frozen"
        for event in tracker.association_events
    )


def test_two_close_vehicles_keep_ids_after_merged_contour_splits(monkeypatch):
    tracker = MotionVehicleTracker(
        min_visible_count=1,
        min_confirm_displacement=0,
        merged_detection_area_ratio=1.6,
    )
    frame = np.zeros((120, 180, 3), dtype=np.uint8)
    first_appearance = np.zeros(416, dtype=np.float32)
    first_appearance[10] = 1.0
    second_appearance = np.zeros(416, dtype=np.float32)
    second_appearance[300] = 1.0

    def vehicle(x: int, appearance: np.ndarray) -> dict:
        detection = _detection(tracker, frame, x, priority=False)
        detection["hist"] = appearance.copy()
        detection["bbox_area"] = float(
            detection["box"][2] * detection["box"][3]
        )
        return detection

    merged_appearance = cv2.normalize(
        first_appearance + second_appearance,
        None,
    ).astype(np.float32)
    merged = vehicle(45, merged_appearance)
    merged["box"] = (45, 16, 90, 35)
    merged["point"] = tracker._bottom_center(merged["box"])
    merged["area"] = 2500.0
    merged["bbox_area"] = 3150.0

    detections = iter([
        [vehicle(20, first_appearance), vehicle(120, second_appearance)],
        [vehicle(45, first_appearance), vehicle(95, second_appearance)],
        [merged],
        # The contour remains merged beyond the ordinary 1.5 s reacquire
        # window. The 3.0 s merge protection must preserve both lineages.
        [merged],
        # Reverse input order while the two distinct centre points are close.
        [vehicle(75, second_appearance), vehicle(65, first_appearance)],
        # The vehicles have crossed, but their appearance and motion lineage
        # must remain attached to their original Local IDs.
        [vehicle(45, second_appearance), vehicle(95, first_appearance)],
    ])
    monkeypatch.setattr(
        tracker,
        "_detect",
        lambda _frame, timestamp_s=None, priority_regions=None: (
            next(detections),
            np.zeros(_frame.shape[:2], dtype=np.uint8),
        ),
    )

    tracker.process_frame(frame, timestamp_s=0.0)
    tracker.process_frame(frame, timestamp_s=0.1)
    tracker.process_frame(frame, timestamp_s=0.2)
    assert any(
        event["type"] == "merged_detection_frozen"
        for event in tracker.association_events
    )
    tracker.process_frame(frame, timestamp_s=2.0)
    tracker.process_frame(frame, timestamp_s=2.8)
    tracks, _mask, _expired = tracker.process_frame(
        frame, timestamp_s=2.9
    )

    assert set(tracks) == {1, 2}
    assert tracks[1].cx == 109
    assert tracks[2].cx == 59
    assert histogram_distance(
        tracks[1].appearance, first_appearance
    ) < 0.10
    assert histogram_distance(
        tracks[2].appearance, second_appearance
    ) < 0.10


def test_ambiguous_split_coasts_without_swap_or_new_fragment(monkeypatch):
    tracker = MotionVehicleTracker(
        min_visible_count=1,
        min_confirm_displacement=0,
        merged_detection_area_ratio=1.6,
        split_assignment_margin=0.08,
    )
    frame = np.zeros((120, 180, 3), dtype=np.uint8)
    appearance = np.zeros(416, dtype=np.float32)
    appearance[10] = 1.0

    def vehicle(x: int) -> dict:
        detection = _detection(tracker, frame, x, priority=False)
        detection["hist"] = appearance.copy()
        detection["bbox_area"] = float(
            detection["box"][2] * detection["box"][3]
        )
        return detection

    merged = vehicle(45)
    merged["box"] = (45, 16, 90, 35)
    merged["point"] = tracker._bottom_center(merged["box"])
    merged["area"] = 2500.0
    merged["bbox_area"] = 3150.0
    # Both post-split detections are deliberately tied for both lineages.
    tied_left = vehicle(60)
    tied_right = vehicle(60)
    detections = iter([
        [vehicle(20), vehicle(120)],
        [merged],
        [tied_right, tied_left],
    ])
    monkeypatch.setattr(
        tracker,
        "_detect",
        lambda _frame, timestamp_s=None, priority_regions=None: (
            next(detections),
            np.zeros(_frame.shape[:2], dtype=np.uint8),
        ),
    )

    tracker.process_frame(frame, timestamp_s=0.0)
    tracker.process_frame(frame, timestamp_s=0.1)
    tracks, _mask, _expired = tracker.process_frame(
        frame, timestamp_s=0.2
    )

    assert set(tracks) == {1, 2}
    assert all(track.consecutive_invisible_count == 2 for track in tracks.values())
    assert all(track.status == TrackStatus.LOST for track in tracks.values())
    assert not {3, 4}.intersection(tracks)
    assert any(
        event["type"] == "split_assignment_deferred"
        for event in tracker.association_events
    )


def test_non_overlapping_centres_keep_ids_for_identical_crossing_vehicles(
    monkeypatch,
):
    tracker = MotionVehicleTracker(
        min_visible_count=1,
        min_confirm_displacement=0,
    )
    frame = np.zeros((120, 180, 3), dtype=np.uint8)
    same_appearance = np.zeros(416, dtype=np.float32)
    same_appearance[10] = 1.0

    def vehicle(x: int) -> dict:
        detection = _detection(tracker, frame, x, priority=False)
        detection["hist"] = same_appearance.copy()
        detection["bbox_area"] = float(
            detection["box"][2] * detection["box"][3]
        )
        return detection

    first_path = [20, 35, 50, 65, 80, 95]
    second_path = [120, 105, 90, 75, 60, 45]
    assert all(
        tracker._bottom_center(vehicle(first_x)["box"])
        != tracker._bottom_center(vehicle(second_x)["box"])
        for first_x, second_x in zip(first_path, second_path)
    )
    detections = iter([
        (
            [vehicle(first_x), vehicle(second_x)]
            if frame_index == 0
            else [vehicle(second_x), vehicle(first_x)]
        )
        for frame_index, (first_x, second_x) in enumerate(
            zip(first_path, second_path)
        )
    ])
    monkeypatch.setattr(
        tracker,
        "_detect",
        lambda _frame, timestamp_s=None, priority_regions=None: (
            next(detections),
            np.zeros(_frame.shape[:2], dtype=np.uint8),
        ),
    )

    tracks = None
    for frame_index in range(len(first_path)):
        tracks, _mask, _expired = tracker.process_frame(
            frame, timestamp_s=0.1 * frame_index
        )

    assert tracks is not None
    assert set(tracks) == {1, 2}
    assert tracks[1].cx == 109
    assert tracks[2].cx == 59


def test_oversized_motion_bbox_is_rejected_before_it_can_create_or_expand_track(monkeypatch):
    tracker = MotionVehicleTracker(
        min_area=100,
        motion_min_pixels=1,
        motion_min_ratio=0.0,
        max_bbox_width_ratio=0.35,
        max_bbox_height_ratio=0.90,
        max_bbox_area_ratio=0.90,
    )
    foreground = np.zeros((240, 400), dtype=np.uint8)
    foreground[30:90, 20:190] = 255

    class FixedBackground:
        def apply(self, _frame):
            return foreground.copy()

    tracker.bg_sub = FixedBackground()
    monkeypatch.setattr(
        tracker,
        "_temporal_motion_mask",
        lambda _frame, timestamp_s=None: foreground.copy(),
    )

    detections, _ = tracker._detect(np.zeros((240, 400, 3), dtype=np.uint8))

    assert detections == []
    assert any(
        item["type"] == "oversized_bbox"
        for item in tracker.last_detection_rejections
    )


def test_clipped_contour_with_anchor_outside_tracking_roi_is_rejected(monkeypatch):
    tracker = MotionVehicleTracker(
        min_area=100,
        motion_min_pixels=1,
        motion_min_ratio=0.0,
        max_bbox_width_ratio=1.0,
        max_bbox_height_ratio=1.0,
        max_bbox_area_ratio=1.0,
    )
    foreground = np.zeros((240, 240), dtype=np.uint8)
    foreground[10:111, 10:111] = 255

    class FixedBackground:
        def apply(self, _frame):
            return foreground.copy()

    tracker.bg_sub = FixedBackground()
    tracker.roi_mask = np.zeros((240, 240), dtype=np.uint8)
    cv2.fillPoly(
        tracker.roi_mask,
        [np.asarray([(10, 10), (110, 10), (10, 110)], dtype=np.int32)],
        255,
    )
    monkeypatch.setattr(
        tracker,
        "_temporal_motion_mask",
        lambda _frame, timestamp_s=None: foreground.copy(),
    )

    detections, _ = tracker._detect(np.zeros((240, 240, 3), dtype=np.uint8))

    assert detections == []
    assert any(
        item["type"] == "anchor_outside_roi"
        for item in tracker.last_detection_rejections
    )


def test_single_track_is_frozen_when_one_blob_suddenly_covers_multiple_cars():
    tracker = MotionVehicleTracker(merged_detection_area_ratio=1.6)
    frame = np.zeros((120, 220, 3), dtype=np.uint8)
    tracker._frame_idx = 1
    tracker._current_timestamp_s = 0.0
    tracker._create_or_reid(_detection(tracker, frame, 50, priority=False))
    track = tracker._tracks[1]
    track.status = TrackStatus.CONFIRMED

    merged = _detection(tracker, frame, 42, priority=False)
    merged["box"] = (42, 16, 78, 42)
    merged["point"] = (81, 58)
    merged["area"] = 2400.0
    merged["bbox_area"] = 3276.0
    tracker._current_timestamp_s = 0.1
    assignments, unmatched_tracks, unmatched_detections = tracker._assign([merged])

    assert assignments == []
    assert unmatched_tracks == [1]
    assert unmatched_detections == []
    assert any(
        event["type"] == "oversized_detection_frozen"
        for event in tracker.association_events
    )


def test_stale_track_does_not_freeze_merged_detection_with_live_track():
    tracker = MotionVehicleTracker(
        merged_detection_area_ratio=1.6,
        reacquire_max_seconds=0.75,
    )
    frame = np.zeros((120, 220, 3), dtype=np.uint8)
    tracker._frame_idx = 1
    tracker._current_timestamp_s = 0.0
    tracker._create_or_reid(_detection(tracker, frame, 50, priority=False))
    tracker._create_or_reid(_detection(tracker, frame, 90, priority=False))
    stale = tracker._tracks[1]
    live = tracker._tracks[2]
    stale.status = TrackStatus.LOST
    stale.consecutive_invisible_count = 1
    stale.last_seen_timestamp_s = 0.0
    live.status = TrackStatus.CONFIRMED
    live.last_seen_timestamp_s = 1.0

    merged = _detection(tracker, frame, 42, priority=False)
    merged["box"] = (42, 16, 90, 35)
    merged["point"] = (87, 51)
    merged["area"] = 2500.0
    merged["bbox_area"] = 3150.0
    tracker._current_timestamp_s = 1.0
    _assignments, _unmatched_tracks, unmatched_detections = tracker._assign([merged])

    assert unmatched_detections == [0]
    assert not any(
        event["type"] == "merged_detection_frozen"
        for event in tracker.association_events
    )


def test_suspended_parked_track_is_removed_from_assignment():
    tracker = MotionVehicleTracker()
    frame = np.zeros((80, 100, 3), dtype=np.uint8)
    tracker._frame_idx = 1
    tracker._create_or_reid(_detection(tracker, frame, 20, priority=False))

    suspended = tracker.suspend_track(1)

    assert suspended is not None
    assert tracker.all_tracks == {}


def test_first_observation_survives_bounded_display_history():
    tracker = MotionVehicleTracker(
        history_len=3,
        min_visible_count=2,
        min_confirm_displacement=20,
        enable_multiscale_motion=True,
    )
    frame = np.zeros((80, 120, 3), dtype=np.uint8)
    tracker._frame_idx = 1
    tracker._create_or_reid(_detection(tracker, frame, 10, priority=False))
    track = tracker._tracks[1]

    for frame_index, x in enumerate((14, 18, 22, 26), start=2):
        tracker._frame_idx = frame_index
        tracker._apply_detection(track, _detection(tracker, frame, x, priority=False))

    assert len(track.history) == 3
    assert track.first_observation_point == (24, 44)
    assert track.history[0] != track.first_observation_point
    assert track.status == TrackStatus.TENTATIVE

    tracker._frame_idx += 1
    tracker._apply_detection(track, _detection(tracker, frame, 31, priority=False))
    assert track.status == TrackStatus.CONFIRMED


def test_legacy_confirmation_keeps_rolling_history_origin():
    tracker = MotionVehicleTracker(
        history_len=3,
        min_visible_count=2,
        min_confirm_displacement=20,
    )
    frame = np.zeros((80, 120, 3), dtype=np.uint8)
    tracker._frame_idx = 1
    tracker._create_or_reid(_detection(tracker, frame, 10, priority=False))
    track = tracker._tracks[1]

    for frame_index, x in enumerate((14, 18, 22, 26, 31), start=2):
        tracker._frame_idx = frame_index
        tracker._apply_detection(track, _detection(tracker, frame, x, priority=False))

    assert track.first_observation_point == (24, 44)
    assert track.status == TrackStatus.TENTATIVE


# --- effective frame rate -------------------------------------------------
# The per-frame budget decides whether a moving vehicle is still measurable
# at all, so the two hot paths below are treated as correctness, not speed.


def test_sampled_brightness_shift_matches_the_full_frame_median():
    rng = np.random.default_rng(7)
    reference = rng.integers(20, 220, size=(720, 1280), dtype=np.int16).astype(np.uint8)
    shifted = np.clip(reference.astype(np.int16) + 11, 0, 255).astype(np.uint8)
    # A vehicle occupying part of the frame must not drag the estimate.
    shifted[300:420, 500:640] = 5

    exact = float(np.median(shifted.astype(np.int16) - reference.astype(np.int16)))
    sampled = MotionVehicleTracker._brightness_shift(shifted, reference)

    assert abs(sampled - exact) <= 1.0


def test_brightness_shift_reads_every_pixel_of_a_small_frame():
    reference = np.zeros((40, 60), dtype=np.uint8)
    current = np.full((40, 60), 9, dtype=np.uint8)

    assert MotionVehicleTracker._brightness_shift(current, reference) == 9.0


def test_background_reference_is_reused_within_the_refresh_interval():
    tracker = MotionVehicleTracker(reject_cast_shadows=True)
    calls = []

    class CountingBackground:
        def getBackgroundImage(self):
            calls.append(1)
            return np.zeros((8, 8, 3), dtype=np.uint8)

        def apply(self, _frame):
            return np.zeros((8, 8), dtype=np.uint8)

    tracker.bg_sub = CountingBackground()

    tracker._frame_idx = 1
    tracker._background_reference()
    for offset in range(1, tracker._background_refresh_interval):
        tracker._frame_idx = 1 + offset
        tracker._background_reference()
    assert len(calls) == 1

    tracker._frame_idx = 1 + tracker._background_refresh_interval
    tracker._background_reference()
    assert len(calls) == 2


def test_background_reference_is_not_built_without_shadow_rejection():
    tracker = MotionVehicleTracker(reject_cast_shadows=False)

    class ExplodingBackground:
        def getBackgroundImage(self):  # pragma: no cover - must never run
            raise AssertionError("background must not be rebuilt")

        def apply(self, _frame):
            return np.zeros((8, 8), dtype=np.uint8)

    tracker.bg_sub = ExplodingBackground()

    assert tracker._background_reference() is None


# --- duration-based lost-track TTL ---------------------------------------


def test_lost_track_ttl_is_derived_from_the_widest_reacquire_window():
    tracker = MotionVehicleTracker(
        merged_reacquire_max_seconds=3.0,
        lost_track_ttl_reacquire_multiple=1.5,
    )

    # Nothing still re-associable may be discarded, so the TTL has to sit
    # above the widest reacquire window rather than below it.
    assert tracker.lost_track_ttl_seconds == pytest.approx(4.5)
    assert tracker.lost_track_ttl_seconds > tracker.merged_reacquire_max_seconds
    assert MotionVehicleTracker(
        lost_track_ttl_seconds=2.0
    ).lost_track_ttl_seconds == pytest.approx(2.0)


def test_unreacquirable_fragment_expires_on_duration_not_frame_count(monkeypatch):
    tracker = MotionVehicleTracker(
        min_visible_count=1,
        min_confirm_displacement=0,
        lost_track_ttl=90,
        lost_track_ttl_seconds=1.0,
    )
    frame = np.zeros((100, 180, 3), dtype=np.uint8)
    detections = iter([
        [_detection(tracker, frame, 30, priority=False)],
        [],
        [],
    ])
    monkeypatch.setattr(
        tracker,
        "_detect",
        lambda _frame, timestamp_s=None, priority_regions=None: (
            next(detections),
            np.zeros(_frame.shape[:2], dtype=np.uint8),
        ),
    )

    tracker.process_frame(frame, timestamp_s=0.0)
    assert set(tracker._tracks) == {1}

    # Two invisible frames are far below the 90-frame TTL, but at this frame
    # rate they already outlast every reacquire window.
    tracker.process_frame(frame, timestamp_s=0.6)
    assert set(tracker._tracks) == {1}
    tracker.process_frame(frame, timestamp_s=1.4)

    assert tracker._tracks == {}


def test_frame_counted_ttl_still_applies_without_timestamps(monkeypatch):
    tracker = MotionVehicleTracker(
        min_visible_count=1,
        min_confirm_displacement=0,
        lost_track_ttl=2,
        lost_track_ttl_seconds=1.0,
    )
    frame = np.zeros((100, 180, 3), dtype=np.uint8)
    detections = iter([[_detection(tracker, frame, 30, priority=False)], [], [], []])
    monkeypatch.setattr(
        tracker,
        "_detect",
        lambda _frame, timestamp_s=None, priority_regions=None: (
            next(detections),
            np.zeros(_frame.shape[:2], dtype=np.uint8),
        ),
    )

    for _ in range(3):
        tracker.process_frame(frame)
    assert set(tracker._tracks) == {1}

    tracker.process_frame(frame)

    assert tracker._tracks == {}


# --- motion trail versus a genuine merge ---------------------------------


def _feed(tracker, frame, per_frame_detections, monkeypatch, *, dt=0.1):
    """Drive process_frame with a fixed detection script."""
    detections = iter(per_frame_detections)
    monkeypatch.setattr(
        tracker,
        "_detect",
        lambda _frame, timestamp_s=None, priority_regions=None: (
            next(detections),
            np.zeros(_frame.shape[:2], dtype=np.uint8),
        ),
    )
    tracks = None
    for index in range(len(per_frame_detections)):
        tracks, _mask, _expired = tracker.process_frame(
            frame, timestamp_s=dt * index
        )
    return tracks


def _moving_vehicle(tracker, frame, x, *, hist=None, box=None):
    detection = _detection(tracker, frame, x, priority=False)
    if box is not None:
        detection["box"] = box
        detection["point"] = tracker._bottom_center(box)
        detection["area"] = float(box[2] * box[3])
    if hist is not None:
        detection["hist"] = hist.copy()
    detection["bbox_area"] = float(
        detection["box"][2] * detection["box"][3]
    )
    return detection


def test_motion_trail_along_travel_keeps_the_measurement(monkeypatch):
    # Frame differencing keeps the previous silhouette too, so one car moving
    # at 20 px/frame paints a contour ~1.7x its own width. Freezing that is
    # how a lone vehicle loses every measurement and dies of coasting.
    tracker = MotionVehicleTracker(
        min_visible_count=1,
        min_confirm_displacement=0,
        merged_detection_area_ratio=1.6,
    )
    frame = np.zeros((120, 400, 3), dtype=np.uint8)
    script = [[_moving_vehicle(tracker, frame, x)] for x in (20, 40, 60, 80)]
    script.append([_moving_vehicle(tracker, frame, 100, box=(100, 20, 68, 24))])

    tracks = _feed(tracker, frame, script, monkeypatch)

    assert set(tracks) == {1}
    assert tracks[1].consecutive_invisible_count == 0
    assert any(
        event["type"] == "oversized_detection_kept_as_motion_trail"
        for event in tracker.association_events
    )
    assert not any(
        event["type"] == "oversized_detection_frozen"
        for event in tracker.association_events
    )


def test_growth_across_the_direction_of_travel_still_freezes(monkeypatch):
    # A car cannot get taller by moving sideways-free along x, so this blob is
    # the ambiguous measurement the freeze exists for.
    tracker = MotionVehicleTracker(
        min_visible_count=1,
        min_confirm_displacement=0,
        merged_detection_area_ratio=1.6,
    )
    frame = np.zeros((160, 400, 3), dtype=np.uint8)
    script = [[_moving_vehicle(tracker, frame, x)] for x in (20, 40, 60, 80)]
    script.append([_moving_vehicle(tracker, frame, 100, box=(100, 20, 44, 52))])

    tracks = _feed(tracker, frame, script, monkeypatch)

    assert set(tracks) == {1}
    assert tracks[1].consecutive_invisible_count == 1
    assert any(
        event["type"] == "oversized_detection_frozen"
        for event in tracker.association_events
    )


def test_elongation_check_needs_no_velocity_when_the_blob_did_not_grow():
    tracker = MotionVehicleTracker()
    frame = np.zeros((100, 180, 3), dtype=np.uint8)
    tracker._frame_idx = 1
    tracker._create_or_reid(_detection(tracker, frame, 30, priority=False))
    track = tracker._tracks[1]

    assert tracker._elongation_explained_by_motion(
        track, (30, 20, track.w, track.h)
    )


# --- velocity-derived association gate ------------------------------------


def test_association_gate_stays_within_reach_of_a_slow_vehicle(monkeypatch):
    tracker = MotionVehicleTracker(
        min_visible_count=1,
        min_confirm_displacement=0,
        max_distance=180.0,
    )
    frame = np.zeros((120, 400, 3), dtype=np.uint8)
    script = [[_moving_vehicle(tracker, frame, x)] for x in (20, 40, 60, 80, 100)]
    _feed(tracker, frame, script, monkeypatch)
    track = tracker._tracks[1]

    gate = tracker._association_gate(track, 0, 180.0)

    # 20 px/frame cannot become 180 px of travel in one frame, so the whole
    # scene-wide constant is not what this track may claim.
    assert 40.0 < gate < 100.0
    assert gate < 180.0
    # A longer gap re-opens the gate in proportion to the time elapsed.
    assert tracker._association_gate(track, 3, 180.0) > gate


def test_association_gate_fails_open_for_an_uninformed_fragment():
    tracker = MotionVehicleTracker(max_distance=180.0)
    frame = np.zeros((100, 180, 3), dtype=np.uint8)
    tracker._frame_idx = 1
    tracker._create_or_reid(_detection(tracker, frame, 30, priority=False))
    track = tracker._tracks[1]

    # One correction leaves the filter's initial zero velocity in place; a
    # budget derived from it would reject the vehicle's real displacement.
    assert track.total_visible_count < tracker.velocity_gate_min_observations
    assert tracker._association_gate(track, 0, 180.0) == pytest.approx(180.0)


def test_stopped_lineage_cannot_win_a_tied_neighbour_prediction():
    """A reversing car must not inherit the ID of a stopped neighbour."""
    tracker = MotionVehicleTracker(
        min_visible_count=1,
        min_confirm_displacement=0,
        max_prediction_age_seconds=0.40,
        association_ambiguity_margin=0.08,
    )
    frame = np.zeros((120, 300, 3), dtype=np.uint8)
    appearance = np.zeros(416, dtype=np.float32)
    appearance[10] = 1.0

    stopped = _moving_vehicle(tracker, frame, 40, hist=appearance)
    moving = _moving_vehicle(tracker, frame, 90, hist=appearance)
    tracker._frame_idx = 1
    tracker._create_or_reid(stopped)
    tracker._create_or_reid(moving)
    stopped_track = tracker._tracks[1]
    moving_track = tracker._tracks[2]
    stopped_track.status = TrackStatus.LOST
    stopped_track.consecutive_invisible_count = 1
    stopped_track.last_seen_timestamp_s = 0.0
    stopped_track.last_measured_timestamp_s = 0.0
    stopped_track.last_measured_center = (54.0, 44.0)
    moving_track.last_seen_timestamp_s = 0.1
    moving_track.last_measured_timestamp_s = 0.1
    # Both Kalman predictions arrive at the same foreground blob.  A
    # deterministic LAPJV tie-break must not decide which physical car won.
    stopped_track.kalman.statePost[0, 0] = 104.0
    stopped_track.kalman.statePost[2, 0] = 0.0
    moving_track.kalman.statePost[0, 0] = 104.0
    moving_track.kalman.statePost[2, 0] = 14.0
    tracker._current_timestamp_s = 0.1
    tracker._predictions_frame = -1

    detection = _moving_vehicle(tracker, frame, 90, hist=appearance)
    assignments, unmatched_tracks, unmatched_detections = tracker._assign(
        [detection]
    )

    assert assignments == []
    assert set(unmatched_tracks) == {1, 2}
    assert unmatched_detections == []
    assert any(
        event["type"] == "association_deferred_competing_tracks"
        for event in tracker.association_events
    )
    assert stopped_track.cx == 40 + 14
    assert moving_track.cx == 90 + 14


def test_stale_prediction_is_rejected_before_it_can_claim_a_neighbour():
    tracker = MotionVehicleTracker(
        min_visible_count=1,
        min_confirm_displacement=0,
        max_prediction_age_seconds=0.40,
        reacquire_max_seconds=1.5,
    )
    frame = np.zeros((100, 240, 3), dtype=np.uint8)
    tracker._frame_idx = 1
    tracker._current_timestamp_s = 0.0
    tracker._create_or_reid(_detection(tracker, frame, 30, priority=False))
    old = tracker._tracks[1]
    old.status = TrackStatus.LOST
    old.consecutive_invisible_count = 1
    old.last_seen_timestamp_s = 0.0
    old.last_measured_timestamp_s = 0.0
    tracker._current_timestamp_s = 0.6
    tracker._predictions_frame = -1

    assignments, unmatched_tracks, unmatched_detections = tracker._assign(
        [_detection(tracker, frame, 44, priority=False)]
    )

    assert assignments == []
    assert unmatched_tracks == [1]
    assert unmatched_detections == [0]
    assert any(
        event["type"] == "association_rejected_stale_prediction"
        for event in tracker.association_events
    )
    assert old.prediction_source == "stale_prediction"


def test_reacquire_uses_last_real_measurement_without_stale_extrapolation():
    tracker = MotionVehicleTracker(min_visible_count=1, min_confirm_displacement=0,
                                   max_prediction_age_seconds=.40, reacquire_max_seconds=1.5)
    frame = np.zeros((100, 240, 3), dtype=np.uint8)
    frame[20:44, 30:58] = (0, 0, 230)
    tracker._frame_idx = 1
    tracker._current_timestamp_s = 0.
    tracker._create_or_reid(_detection(tracker, frame, 30, priority=False))
    old = tracker._tracks[1]
    old.status = TrackStatus.LOST
    old.consecutive_invisible_count = 1
    old.last_seen_timestamp_s = old.last_measured_timestamp_s = 0.
    tracker._current_timestamp_s = .6
    tracker._predictions_frame = -1
    assignments, _, _ = tracker._assign([_detection(tracker, frame, 31, priority=False)])
    assert [(entry[0], entry[1]) for entry in assignments] == [(1, 0)]
    assert tracker._pair_metrics[(1, 0)]["association_source"] == "last_measurement_anchor"


def test_far_detection_outside_the_velocity_budget_starts_its_own_track(
    monkeypatch,
):
    tracker = MotionVehicleTracker(
        min_visible_count=1,
        min_confirm_displacement=0,
        max_distance=400.0,
    )
    frame = np.zeros((120, 600, 3), dtype=np.uint8)
    script = [[_moving_vehicle(tracker, frame, x)] for x in (20, 40, 60, 80)]
    # A blob 300 px further along cannot be the same vehicle one frame later.
    script.append([_moving_vehicle(tracker, frame, 400)])

    tracks = _feed(tracker, frame, script, monkeypatch)

    assert set(tracks) == {1, 2}
    assert tracks[1].consecutive_invisible_count == 1
    assert tracks[2].total_visible_count == 1


def test_two_parallel_vehicles_one_car_length_apart_keep_their_ids(monkeypatch):
    # The reported failure: two identical model cars driving side by side, one
    # car length apart. Their appearance carries no information, so only the
    # motion model may decide which blob belongs to which lineage.
    tracker = MotionVehicleTracker(
        min_visible_count=1,
        min_confirm_displacement=0,
        max_distance=180.0,
    )
    frame = np.zeros((120, 500, 3), dtype=np.uint8)
    same_appearance = np.zeros(416, dtype=np.float32)
    same_appearance[10] = 1.0

    leader = [90, 105, 120, 135, 150, 165]
    follower = [x - 56 for x in leader]  # exactly two bbox widths behind
    script = []
    for index, (front, back) in enumerate(zip(leader, follower)):
        pair = [
            _moving_vehicle(tracker, frame, front, hist=same_appearance),
            _moving_vehicle(tracker, frame, back, hist=same_appearance),
        ]
        # Detection order must not be what preserves identity.
        script.append(pair if index % 2 == 0 else list(reversed(pair)))

    tracks = _feed(tracker, frame, script, monkeypatch)

    assert set(tracks) == {1, 2}
    # Local #1 took the leading blob on the first frame and must still hold it.
    assert tracks[1].cx > tracks[2].cx
    assert tracks[1].cx == pytest.approx(leader[-1] + 14, abs=2)
    assert tracks[2].cx == pytest.approx(follower[-1] + 14, abs=2)
    assert all(track.consecutive_invisible_count == 0 for track in tracks.values())
    assert not any(
        event["type"] == "split_assignment_deferred"
        for event in tracker.association_events
    )


def test_coasting_fragment_alone_cannot_freeze_a_merged_detection():
    # Freezing costs every listed track its only measurement, so the merge
    # hypothesis needs a track that was actually seen in the previous frame.
    tracker = MotionVehicleTracker(merged_detection_area_ratio=1.6)
    frame = np.zeros((120, 220, 3), dtype=np.uint8)
    tracker._frame_idx = 1
    tracker._current_timestamp_s = 0.0
    tracker._create_or_reid(_detection(tracker, frame, 50, priority=False))
    tracker._create_or_reid(_detection(tracker, frame, 90, priority=False))
    coasting, live = tracker._tracks[1], tracker._tracks[2]
    coasting.status = TrackStatus.LOST
    coasting.consecutive_invisible_count = 1
    coasting.last_seen_timestamp_s = 0.0
    live.status = TrackStatus.CONFIRMED
    live.last_seen_timestamp_s = 0.1

    merged = _detection(tracker, frame, 42, priority=False)
    merged["box"] = (42, 16, 90, 35)
    merged["point"] = (87, 51)
    merged["area"] = 2500.0
    merged["bbox_area"] = 3150.0
    tracker._current_timestamp_s = 0.1
    tracker._assign([merged])

    assert not any(
        event["type"] == "merged_detection_frozen"
        for event in tracker.association_events
    )


def test_assignment_cost_limit_is_configurable_and_bounded():
    assert MotionVehicleTracker().assignment_cost_limit == pytest.approx(0.90)
    assert MotionVehicleTracker(
        assignment_cost_limit=0.60
    ).assignment_cost_limit == pytest.approx(0.60)
    # The cost terms sum to at most 1.0, so a larger limit means "no limit".
    assert MotionVehicleTracker(
        assignment_cost_limit=5.0
    ).assignment_cost_limit == pytest.approx(1.0)
