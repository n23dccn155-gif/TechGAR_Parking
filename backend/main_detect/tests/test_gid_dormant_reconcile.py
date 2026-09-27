"""GID continuity: dormant-dormant duplicate reconciliation.

When a duplicate Global ID is minted for one physical vehicle (an
immature fragment racing a dormant owner) and *both* fragments die, two
dormant identities remain parked on nearly the same world anchor with
matching appearance.  The ghost record then competes in every later
ReID pass and can steal another vehicle's fragment.  Reconciliation
must merge them -- but only with one-to-one, appearance-backed,
convergent evidence: two real vehicles resting near each other must
never be folded into one identity.
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


def _run_frames(manager, first_frame, count):
    """Advance idle frames so dormant reconciliation can converge."""
    for offset in range(count):
        frame_idx = first_frame + offset
        manager.update_all_tracks(
            {"cam1": {}}, frame_idx, {"cam1": frame_idx * 0.1}
        )


def _seed_dormant_identity(manager, histogram, *, x=100, y=200, local=7):
    """Track a fragment to a GID, then expire it into a dormant record."""
    gid = None
    for frame_idx in (1, 2, 3):
        track = attach_tracklet(
            DummyTrack(x, y, appearance=histogram),
            histogram,
            histogram,
        )
        gid = manager.update_all_tracks(
            {"cam1": {local: track}},
            frame_idx,
            {"cam1": frame_idx * 0.1},
        )["cam1"][local]
    manager.notify_track_expired(
        "cam1", local, x, y, 42, 24, histogram, 4, 0.4
    )
    return gid


def _seed_ghost_dormant(manager, histogram, *, x, y, local, frame_idx=5):
    """Force a second dormant GID at an anchor, as an allocation race leaves."""
    ghost_gid = manager._allocate_global_id()
    manager._local_to_global[("cam1", local)] = ghost_gid
    manager.notify_track_expired(
        "cam1", local, x, y, 42, 24, histogram, frame_idx, frame_idx * 0.1
    )
    return ghost_gid


def test_dormant_duplicate_at_same_anchor_is_reconciled():
    manager = make_manager()
    histogram = one_hot_histogram(0)
    gid = _seed_dormant_identity(manager, histogram)
    ghost_gid = _seed_ghost_dormant(manager, histogram, x=102, y=200, local=9)

    _run_frames(manager, 6, 3)

    # One physical vehicle keeps one Global ID: the ghost folds into the
    # original identity instead of lingering as a ReID competitor.
    assert manager._canonical_id(ghost_gid) == gid
    assert any(
        event["type"] == "dormant_duplicate_merged"
        for event in manager.to_json({})["recent_events"]
    )


def test_distant_dormant_identities_are_not_merged():
    manager = make_manager()
    histogram = one_hot_histogram(0)
    gid = _seed_dormant_identity(manager, histogram)
    other_gid = _seed_ghost_dormant(
        manager, histogram, x=100, y=380, local=9
    )

    _run_frames(manager, 6, 3)

    # 180 px apart on the same camera: two genuinely different vehicles.
    assert manager._canonical_id(other_gid) == other_gid
    assert manager._canonical_id(gid) == gid


def test_different_appearance_at_same_anchor_is_not_merged():
    manager = make_manager()
    gid = _seed_dormant_identity(manager, one_hot_histogram(0))
    other_gid = _seed_ghost_dormant(
        manager, one_hot_histogram(9), x=102, y=200, local=9
    )

    _run_frames(manager, 6, 3)

    # Position alone never merges: a different-looking vehicle that
    # happened to stop at the same anchor keeps its own Global ID.
    assert manager._canonical_id(other_gid) == other_gid
    assert manager._canonical_id(gid) == gid
