import cv2
import numpy as np

from techgar.tracklet_descriptor import (
    AppearanceTracklet,
    compare_tracklets,
    histogram_distance,
    hsv_histogram,
)


def histogram(bin_index: int) -> np.ndarray:
    value = np.zeros((16, 16), dtype=np.float32)
    value.flat[bin_index] = 1.0
    return value


def test_tracklet_samples_over_time_and_keeps_a_bounded_recent_gallery():
    tracklet = AppearanceTracklet(max_samples=2, sample_interval=3)

    assert tracklet.update(histogram(1), 1)
    assert not tracklet.update(histogram(2), 2)
    assert tracklet.update(histogram(2), 4)
    assert tracklet.update(histogram(3), 7)

    assert tracklet.sample_frames == [4, 7]
    assert len(tracklet.samples) == 2


def test_tracklet_match_uses_route_samples_instead_of_only_last_appearance():
    source = AppearanceTracklet(max_samples=4, sample_interval=1)
    source.update(histogram(1), 1)
    source.update(histogram(2), 2)
    target = AppearanceTracklet(max_samples=4, sample_interval=1)
    target.update(histogram(2), 3)

    match = compare_tracklets(source, target)

    assert match.support == 1
    assert match.sample_pairs == 2
    assert match.distance < 0.45
    assert compare_tracklets(histogram(1), histogram(2)).distance > 0.90


def test_masked_histogram_describes_vehicle_pixels_not_bbox_background():
    frame = np.full((40, 40, 3), (80, 80, 80), dtype=np.uint8)
    frame[16:24, 16:24] = (0, 220, 0)
    mask = np.zeros(frame.shape[:2], dtype=np.uint8)
    mask[16:24, 16:24] = 255
    reference = np.full((8, 8, 3), (0, 220, 0), dtype=np.uint8)

    unmasked = hsv_histogram(frame, (8, 8, 24, 24))
    masked = hsv_histogram(frame, (8, 8, 24, 24), mask=mask)
    expected = hsv_histogram(reference, (0, 0, 8, 8))

    assert histogram_distance(masked, expected) < 0.01
    assert histogram_distance(masked, expected) < histogram_distance(
        unmasked, expected
    )


def test_appearance_descriptor_distinguishes_achromatic_brightness():
    dark_vehicle = np.full((20, 20, 3), (28, 28, 28), dtype=np.uint8)
    light_vehicle = np.full((20, 20, 3), (170, 170, 170), dtype=np.uint8)

    dark = hsv_histogram(dark_vehicle, (0, 0, 20, 20))
    light = hsv_histogram(light_vehicle, (0, 0, 20, 20))

    assert histogram_distance(dark, light) > 0.25
