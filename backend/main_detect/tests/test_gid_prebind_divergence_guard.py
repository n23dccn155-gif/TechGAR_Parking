"""GID continuity: pre-bind divergence guard on dormant recovery.

live15 f3733: ``dormant_global_id_recovered`` bound cam2#437 to gid18 at
12.5cm while gid18 still owned the fresh confirmed member cam1#303 at a
divergent world anchor -- one Global ID displayed on two different cars
for a full frame until ``_resolve_cross_camera_global_conflicts``
detached cam2#437 at 20.2cm.

A dormant candidate that lands beyond ``cross_camera_duplicate_distance``
from a *live* cross-camera member is a different physical car, so the
bind is now deferred (and retried every frame) instead of bound and then
healed.  Co-located overlap co-observations, stale/coasting members,
same-camera members and members without a measurable anchor must never
block a recovery.
"""
from dataclasses import dataclass

import numpy as np
import pytest

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
    consecutive_invisible_count: int = 0

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


def _seed_dormant_identity(manager, histogram, *, x=560, y=260, local=7):
    """Track a cam1 fragment to a GID, then expire it into a dormant record.

    The identity's last world anchor stays at ``(x, y)`` in shared-map
    space, exactly where a boundary handoff would put it.
    """
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


def _bind_member(manager, cam_id, local_id, gid):
    """Pre-bind a live member, as an earlier pass in the same update did."""
    manager._local_to_global[(cam_id, local_id)] = gid
    manager._gid_members.setdefault(gid, set()).add((cam_id, local_id))


def _events(manager, kind):
    return [
        event
        for event in manager.to_json({})["recent_events"]
        if event["type"] == kind
    ]


def _candidate(histogram, local_x=57):
    """A cam2 fragment recovering at world ``(local_x + 500, 260)``."""
    return attach_tracklet(
        DummyTrack(
            local_x,
            260,
            history=[
                (local_x - 4, 260),
                (local_x - 2, 260),
                (local_x, 260),
            ],
            appearance=histogram,
        ),
        histogram,
        histogram,
    )


def test_divergent_live_member_defers_dormant_bind():
    # The live15 f3733 shape: dormant gid1 recovered at the cam1/cam2
    # boundary (last world anchor 560) while its fresh confirmed member
    # cam1#303 sits at world 500 -- 57 units from the cam2#437 candidate at
    # world 557, far beyond the strict 9-unit divergence bound.  Binding
    # here would put gid1 on two different cars for a frame, so the
    # candidate must be deferred instead.
    manager = make_manager()
    white = one_hot_histogram(0)
    gid = _seed_dormant_identity(manager, white)
    _bind_member(manager, "cam1", 303, gid)

    member = attach_tracklet(
        DummyTrack(500, 260, appearance=white), white, white
    )
    candidate = _candidate(white)
    manager.update_all_tracks(
        {"cam1": {303: member}, "cam2": {437: candidate}},
        5,
        {"cam1": 0.5, "cam2": 0.5},
    )

    # Deferral, never rejection: the candidate stays unbound this frame and
    # the live member keeps the Global ID.
    assert manager.get_global_id("cam2", 437) is None
    assert manager.get_global_id("cam1", 303) == gid
    assert not _events(manager, "dormant_global_id_recovered")
    events = _events(manager, "dormant_reid_deferred_live_divergence")
    assert len(events) == 1
    event = events[0]
    assert event["global_id"] == gid
    assert event["source_camera"] == "cam1"
    assert event["target_camera"] == "cam2"
    assert event["target_local_id"] == 437
    assert event["owner_camera"] == "cam1"
    assert event["owner_local_id"] == 303
    assert event["world_distance"] == pytest.approx(57.0, abs=0.01)
    assert event["divergence_bound"] == pytest.approx(
        manager.cross_camera_duplicate_distance
    )
    assert event["reason"] == "live_member_anchor_divergence"


def test_co_located_member_does_not_block_recovery():
    # Same dormant recovery, but the live member sits at world 554 -- only
    # 3 units from the candidate, the normal same-car overlap
    # co-observation.  The guard must not fire and the bind lands.
    manager = make_manager()
    white = one_hot_histogram(0)
    gid = _seed_dormant_identity(manager, white)
    _bind_member(manager, "cam1", 303, gid)

    member = attach_tracklet(
        DummyTrack(554, 260, appearance=white), white, white
    )
    candidate = _candidate(white)
    manager.update_all_tracks(
        {"cam1": {303: member}, "cam2": {437: candidate}},
        5,
        {"cam1": 0.5, "cam2": 0.5},
    )

    assert manager.get_global_id("cam2", 437) == gid
    assert manager.get_global_id("cam1", 303) == gid
    assert any(
        event["type"] == "dormant_global_id_recovered"
        and event["global_id"] == gid
        for event in manager.to_json({})["recent_events"]
    )
    assert not _events(manager, "dormant_reid_deferred_live_divergence")


def test_coasting_member_does_not_block_recovery():
    # A member without a fresh detection (Kalman-only coasting) cannot
    # prove divergence -- it may be exactly the stale fragment the
    # recovery is replacing -- so the candidate still binds.
    manager = make_manager()
    white = one_hot_histogram(0)
    gid = _seed_dormant_identity(manager, white)
    _bind_member(manager, "cam1", 303, gid)

    member = attach_tracklet(
        DummyTrack(
            500, 260, appearance=white, consecutive_invisible_count=1
        ),
        white,
        white,
    )
    candidate = _candidate(white)
    manager.update_all_tracks(
        {"cam1": {303: member}, "cam2": {437: candidate}},
        5,
        {"cam1": 0.5, "cam2": 0.5},
    )

    assert manager.get_global_id("cam2", 437) == gid
    assert not _events(manager, "dormant_reid_deferred_live_divergence")


def test_same_camera_member_does_not_block_recovery():
    # The guard is cross-camera only: a divergent member in the
    # *candidate's own* camera is the domain of
    # ``_resolve_same_camera_global_conflicts``, so it never defers.
    manager = make_manager()
    white = one_hot_histogram(0)
    gid = _seed_dormant_identity(manager, white)
    _bind_member(manager, "cam2", 303, gid)

    member = attach_tracklet(
        DummyTrack(0, 260, appearance=white), white, white
    )
    candidate = _candidate(white)
    deferred = manager._match_dormant_identities(
        {"cam2": {303: member, 437: candidate}},
        5,
        {"cam2": 0.5},
    )

    assert deferred == set()
    assert manager.get_global_id("cam2", 437) == gid
    assert not _events(manager, "dormant_reid_deferred_live_divergence")


def test_member_without_world_anchor_does_not_block():
    # A member whose camera has no usable calibration cannot prove
    # divergence -- the pair is skipped rather than blocking the bind.
    manager = make_manager()
    white = one_hot_histogram(0)
    gid = _seed_dormant_identity(manager, white)
    _bind_member(manager, "cam3", 303, gid)

    member = attach_tracklet(
        DummyTrack(10, 260, appearance=white), white, white
    )
    candidate = _candidate(white)
    deferred = manager._match_dormant_identities(
        {"cam2": {437: candidate}, "cam3": {303: member}},
        5,
        {"cam2": 0.5},
    )

    assert deferred == set()
    assert manager.get_global_id("cam2", 437) == gid
    assert not _events(manager, "dormant_reid_deferred_live_divergence")
