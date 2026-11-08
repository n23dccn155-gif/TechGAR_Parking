"""Regression for a stopped lane vehicle whose tentative fragment is deferred."""

from copy import deepcopy

from two_camera import make_parser
from techgar.trajectory_memory import TrajectorySample
from test_stationary_reacquire import (
    _feed,
    _seed_dormant_gid1,
    make_manager,
    one_hot_histogram,
    parked_track,
)


def _tentative_fragment(histogram):
    fragment = parked_track(62, 120, histogram, visible_count=6)
    fragment.status = "tentative"
    fragment.total_visible_count = 6
    return fragment


def test_stopped_lane_car_recovers_gid_before_deferred_fragment_disappears(monkeypatch):
    manager = make_manager(enable_stationary_reacquire=True)
    histogram = one_hot_histogram(0)
    _seed_dormant_gid1(manager, histogram)
    # The normal dormant pass holds this not-yet-confirmed local fragment,
    # as in P22 V049/cam1 local60; it must remain eligible for the stricter
    # stationary pass, which can bind only an existing identity.
    monkeypatch.setattr(manager, "_match_dormant_identities", lambda *args: {("cam2", 40)})
    for step in range(6):
        _feed(manager, {"cam2": {40: _tentative_fragment(histogram)}}, 120 + step, 4.8 + step * 0.04)
    assert manager.get_global_id("cam2", 40) == 1


def test_stopped_lane_fragment_can_recover_with_stale_moving_velocity(monkeypatch):
    manager = make_manager(enable_stationary_reacquire=True)
    histogram = one_hot_histogram(0)
    _seed_dormant_gid1(manager, histogram)
    manager._identities[1].velocity_world_per_second = (8.0, 0.0)
    # The retained gallery deduplicates nearly identical views to one sample;
    # the new fragment still supplies two independent appearance samples.
    assert len(manager._identities[1].camera_appearance_samples["cam2"]) == 1
    manager.trajectory.append_global(1, TrajectorySample(
        frame_idx=7, timestamp_s=0.28, camera_id="cam2", local_track_id=35,
        world=(550.0, 120.0), bbox_size=(42, 24),
    ))
    monkeypatch.setattr(manager, "_match_dormant_identities", lambda *args: {("cam2", 40)})
    for step in range(6):
        _feed(manager, {"cam2": {40: _tentative_fragment(histogram)}}, 120 + step, 4.8 + step * 0.04)
    assert manager.get_global_id("cam2", 40) == 1


def test_nearby_different_appearance_cannot_steal_stopped_car_gid(monkeypatch):
    manager = make_manager(enable_stationary_reacquire=True)
    _seed_dormant_gid1(manager, one_hot_histogram(0))
    monkeypatch.setattr(manager, "_match_dormant_identities", lambda *args: {("cam2", 40)})
    for step in range(6):
        _feed(manager, {"cam2": {40: _tentative_fragment(one_hot_histogram(9))}}, 120 + step, 4.8 + step * 0.04)
    assert manager.get_global_id("cam2", 40) != 1


def test_two_nearby_indistinguishable_cars_defer_instead_of_merging(monkeypatch):
    manager = make_manager(enable_stationary_reacquire=True)
    histogram = one_hot_histogram(0)
    _seed_dormant_gid1(manager, histogram)
    # Two retained identities with overlapping stationary neighborhoods and
    # matching appearance are deliberately not distinguishable by this gate.
    neighbor = deepcopy(manager._identities[1])
    neighbor.global_id = 2
    neighbor.last_world = (neighbor.last_world[0] + 2.0, neighbor.last_world[1])
    manager._identities[2] = neighbor
    # Isolate the stationary decision from the separate dormant-duplicate
    # reconciliation pass, which has its own safeguards and tests.
    monkeypatch.setattr(manager, "_reconcile_dormant_duplicates", lambda *args: None)
    monkeypatch.setattr(manager, "_match_dormant_identities", lambda *args: {("cam2", 40)})
    for step in range(6):
        _feed(manager, {"cam2": {40: _tentative_fragment(histogram)}}, 120 + step, 4.8 + step * 0.04)
    assert manager.get_global_id("cam2", 40) is None


def test_stationary_reacquire_default_on_and_legacy_flag_off():
    required = ["--slots-cam1", "one", "--slots-cam2", "two", "--calibration", "cal"]
    parser = make_parser()
    assert parser.parse_args(required).enable_stationary_reacquire is True
    assert parser.parse_args(required + ["--legacy-stationary-reacquire"]).enable_stationary_reacquire is False


def test_legacy_path_does_not_recover_deferred_tentative_fragment(monkeypatch):
    manager = make_manager(enable_stationary_reacquire=False)
    histogram = one_hot_histogram(0)
    _seed_dormant_gid1(manager, histogram)
    monkeypatch.setattr(manager, "_match_dormant_identities", lambda *args: {("cam2", 40)})
    for step in range(6):
        _feed(manager, {"cam2": {40: _tentative_fragment(histogram)}}, 120 + step, 4.8 + step * 0.04)
    assert manager.get_global_id("cam2", 40) is None
