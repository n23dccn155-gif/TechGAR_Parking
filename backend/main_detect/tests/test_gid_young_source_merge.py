"""Regression (P18a / L-B): a Global ID minted in the neighbour camera a few
seconds before the handoff opened must fold into the older identity.

Verified episode (K2-P15a, GT V002 leaving): cam2#11 carried GID2 (age 929);
cam1#7 saw the same car 8 frames after its first observation and minted GID5
(f1154).  The handoff only opened at f1176 (22 frames later) and every frame hit
``handoff_bound_identity_rejected reason=both_global_ids_established`` because
``_bound_handoff_merge_allowed`` accepted a young source only up to 3 frames.
The car crossed the exit line as GID5 and the session (GID2) never saw it.

Allowed now when the source is <= 60 frames old, never parked, and the two
identities were never measured in one frame far apart.
``legacy_young_source_merge_window=True`` restores the 3-frame window.
"""

import numpy as np

from test_cross_camera_manager import (
    DummyTrack,
    HandoffEntry,
    make_real_two_camera_manager,
    one_hot_histogram,
)
from techgar.cross_camera_manager import CrossCameraManager


def _setup(manager, *, source_born, target_born):
    appearance = one_hot_histogram(0)
    source = DummyTrack(60, 240, h=80, appearance=appearance)
    target = DummyTrack(560, 220, h=40, appearance=appearance)
    manager.bind_external_id("cam2", 1, 1, 1, source="test")
    manager.bind_external_id("cam1", 2, 2, 1, source="test")
    manager.update_all_tracks({"cam2": {1: source}, "cam1": {2: target}}, 1)
    manager._global_created_frames[1] = source_born
    manager._global_created_frames[2] = target_born
    manager._handoffs = [
        HandoffEntry(
            global_id=1,
            source_cam="cam2",
            source_local_track_id=1,
            target_cam="cam1",
            exit_edge="overlap",
            last_world=(560.0, 200.0),
            velocity_world=(0.0, 0.0),
            bbox_size=(42, 80),
            appearance=appearance,
            appearance_samples=(appearance,),
            created_at_frame=19,
            updated_at_frame=19,
        )
    ]
    return source, target


def _run(manager, source, target, last_frame=22):
    for frame in range(20, last_frame + 1):
        manager.update_all_tracks({"cam2": {1: source}, "cam1": {2: target}}, frame)


def _reasons(manager):
    return {
        event.get("reason")
        for event in manager.to_json({})["recent_events"]
        if event["type"] == "handoff_bound_identity_rejected"
    }


def test_young_source_merges_into_older_target():
    manager = make_real_two_camera_manager()
    source, target = _setup(manager, source_born=10, target_born=-500)
    _run(manager, source, target)
    assert manager.canonical_global_id(1) == manager.canonical_global_id(2)


def test_legacy_flag_keeps_two_established_ids_apart():
    manager = make_real_two_camera_manager()
    manager.legacy_young_source_merge_window = True
    source, target = _setup(manager, source_born=10, target_born=-500)
    _run(manager, source, target)
    assert manager.canonical_global_id(1) != manager.canonical_global_id(2)
    assert "both_global_ids_established" in _reasons(manager)


def test_source_that_ever_parked_is_not_folded():
    manager = make_real_two_camera_manager()
    source, target = _setup(manager, source_born=10, target_born=-500)
    manager._ever_parked_gids.add(1)
    _run(manager, source, target)
    assert manager.canonical_global_id(1) != manager.canonical_global_id(2)
    assert "young_source_failed_guard" in _reasons(manager)


def test_two_cars_measured_apart_in_one_frame_are_not_folded():
    manager = make_real_two_camera_manager()
    manager.slot_width_world = 10.0
    source, target = _setup(manager, source_born=10, target_born=-500)
    manager._identities[1].measured_world_by_frame[15] = (0.0, 0.0)
    manager._identities[2].measured_world_by_frame[15] = (400.0, 0.0)
    _run(manager, source, target)
    assert manager.canonical_global_id(1) != manager.canonical_global_id(2)
    assert "young_source_failed_guard" in _reasons(manager)


def test_source_older_than_window_is_not_folded():
    manager = make_real_two_camera_manager()
    source, target = _setup(manager, source_born=-200, target_born=-500)
    _run(manager, source, target)
    assert manager.canonical_global_id(1) != manager.canonical_global_id(2)
    assert "both_global_ids_established" in _reasons(manager)
