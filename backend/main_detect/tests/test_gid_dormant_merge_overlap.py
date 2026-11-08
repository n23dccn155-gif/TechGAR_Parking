"""GID continuity P16e: a dormant merge must not fold two cars that were
*measured together*.

Verified defect (P16 DIAG, run ``20261103-125324_K4-P15a``): three Global IDs
served six cars --

* ``gid 3`` -> V001 and V003
* ``gid 4`` -> V002 and V004
* ``gid 5`` -> V002, V005 and V006

The mechanism was ``dormant_duplicate_reconciled``: two records that both went
dormant on nearby anchors with similar appearance were folded into one, even
though they had been **detected in the same frame at two different places**.
Two bounding boxes produced in one frame are two physical objects - one car
cannot be in two places at once - so that pair must never be merged.

The guard therefore looks only at *measurements* (``measured_world_by_frame``),
never at predictions, and compares them against one parking-slot width.

``legacy_dormant_merge_overlap=True`` restores the pre-P16e behaviour.
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


#: One parking slot is 100 world units wide in this fixture, so "far apart"
#: means more than 100 units - a neighbouring spot, not a tracking wobble.
SLOT_WIDTH_WORLD = 100.0


def make_manager(*, legacy: bool = False):
    return CrossCameraManager(
        camera_sizes={"cam1": (640, 480), "cam2": (640, 480)},
        camera_crops={"cam1": (0, 0, 640, 480), "cam2": (0, 0, 640, 480)},
        camera_transforms={"cam1": np.eye(3), "cam2": np.eye(3)},
        edge_adjacency={("cam1", "right"): "cam2", ("cam2", "left"): "cam1"},
        overlap_regions={
            ("cam1", "cam2"): np.array(
                [[500, 0], [640, 0], [640, 480], [500, 480]], dtype=np.float32
            )
        },
        match_distance=15.0,
        lookahead_frames=16,
        prediction_radius=90,
        appearance_threshold=0.45,
        min_direction_cosine=0.25,
        slot_width_world=SLOT_WIDTH_WORLD,
        legacy_dormant_merge_overlap=legacy,
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


def _idle(manager, first_frame, count):
    """Run idle frames through the production entry point.

    ``update_all_tracks`` is what two_camera.py calls every frame; it is also
    the only path that runs ``_refresh_identity_states`` and
    ``_reconcile_dormant_duplicates`` in their real order.
    """
    for offset in range(count):
        frame_idx = first_frame + offset
        manager.update_all_tracks(
            {"cam1": {}}, frame_idx, {"cam1": frame_idx * 0.1}
        )


def _measure_pair(
    manager,
    histogram,
    *,
    left,
    right,
    frames=3,
    converge_to=None,
):
    """Track two fragments *simultaneously* at two places, then expire both.

    Both are visible in the same frames, so each identity records a measured
    world position for those frames - proof of two distinct vehicles.

    ``converge_to`` drives the two tracks to nearly the same anchor in the
    last frames before they die.  That is the K4 shape: two cars were measured
    apart earlier, then both ended up close together (one parked, the other
    beside it) and their dormant records fell inside the merge radius, so the
    dormancy anchors alone can no longer tell them apart.
    """
    left_gid = right_gid = None
    last_left = left
    last_right = right
    for frame_idx in range(1, frames + 1):
        final = converge_to is not None and frame_idx == frames
        if final:
            last_left, last_right = converge_to
        tracks = {
            7: attach_tracklet(
                DummyTrack(last_left[0], last_left[1], appearance=histogram),
                histogram,
                histogram,
            ),
            9: attach_tracklet(
                DummyTrack(last_right[0], last_right[1], appearance=histogram),
                histogram,
                histogram,
            ),
        }
        assigned = manager.update_all_tracks(
            {"cam1": tracks}, frame_idx, {"cam1": frame_idx * 0.1}
        )["cam1"]
        left_gid = assigned[7]
        right_gid = assigned[9]
    manager.notify_track_expired(
        "cam1", 7, last_left[0], last_left[1], 42, 24, histogram, frames + 1, 0.5
    )
    manager.notify_track_expired(
        "cam1", 9, last_right[0], last_right[1], 42, 24, histogram, frames + 1, 0.5
    )
    return left_gid, right_gid


def _merge_events(manager):
    return [
        event
        for event in manager.to_json({})["recent_events"]
        if event["type"] in {"dormant_duplicate_merged", "dormant_duplicate_merge_rejected"}
    ]


def test_two_cars_measured_in_same_frame_are_not_merged():
    """RED before the fix: two simultaneous detections 150 units apart were
    folded into one Global ID (the K4 shared-GID defect)."""
    manager = make_manager()
    histogram = one_hot_histogram(0)

    # Measured 150 units apart (> one slot width) while both were driving...
    # ...then both come to rest on almost the same anchor and go dormant,
    # which is exactly the K4 shape that used to be folded together.
    left_gid, right_gid = _measure_pair(
        manager,
        histogram,
        left=(100, 200),
        right=(250, 200),
        converge_to=((100, 200), (102, 200)),
    )
    assert left_gid != right_gid

    _idle(manager, 6, 6)

    # Two physical vehicles keep two Global IDs.
    assert manager._canonical_id(left_gid) == left_gid
    assert manager._canonical_id(right_gid) == right_gid
    assert not any(
        event["type"] == "dormant_duplicate_merged"
        for event in manager.to_json({})["recent_events"]
    )
    rejected = [
        event
        for event in _merge_events(manager)
        if event["type"] == "dormant_duplicate_merge_rejected"
        and event.get("reason") == "simultaneously_measured_far_apart"
    ]
    assert rejected, "phai ghi lai ly do tu choi merge"


def test_same_car_with_broken_track_is_still_merged():
    """Control: one vehicle whose track broke has NO frame measured twice,
    so the old reconciliation must still fold the ghost back in."""
    manager = make_manager()
    histogram = one_hot_histogram(0)

    # Same place, and the two fragments are never visible at the same time
    # (the first expires before the second appears) - exactly a broken track.
    gid = None
    for frame_idx in (1, 2, 3):
        track = attach_tracklet(
            DummyTrack(100, 200, appearance=histogram), histogram, histogram
        )
        gid = manager.update_all_tracks(
            {"cam1": {7: track}}, frame_idx, {"cam1": frame_idx * 0.1}
        )["cam1"][7]
    manager.notify_track_expired("cam1", 7, 100, 200, 42, 24, histogram, 4, 0.4)

    ghost_gid = manager._allocate_global_id()
    manager._local_to_global[("cam1", 9)] = ghost_gid
    manager.notify_track_expired("cam1", 9, 102, 200, 42, 24, histogram, 5, 0.5)

    _idle(manager, 6, 6)

    assert manager._canonical_id(ghost_gid) == gid
    assert any(
        event["type"] == "dormant_duplicate_merged"
        for event in manager.to_json({})["recent_events"]
    )


def test_legacy_flag_restores_old_merge():
    """``--legacy-dormant-merge-overlap`` keeps the pre-P16e behaviour."""
    manager = make_manager(legacy=True)
    histogram = one_hot_histogram(0)

    left_gid, right_gid = _measure_pair(
        manager,
        histogram,
        left=(100, 200),
        right=(250, 200),
        converge_to=((100, 200), (102, 200)),
    )
    assert left_gid != right_gid

    _idle(manager, 6, 6)

    merged = [
        event
        for event in manager.to_json({})["recent_events"]
        if event["type"] == "dormant_duplicate_merged"
    ]
    assert merged, "co legacy flag thi VAN phai gop (hanh vi cu)"
