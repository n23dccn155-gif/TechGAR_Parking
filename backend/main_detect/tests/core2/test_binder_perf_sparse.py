"""G6A: opt-in binder shortcuts must preserve the canonical slot decisions."""

import random
from types import SimpleNamespace

import numpy as np
import pytest

from techgar.slot_vehicle_binder import (
    SlotBinding,
    SlotVehicleBinder,
    VehicleObservation,
    VehicleParkingState,
)


def _binder_grid(columns=8, rows=8):
    binder = SlotVehicleBinder(stop_seconds=1.0)
    for index in range(columns * rows):
        x, y = (index % columns) * 25, (index // columns) * 25
        slot_id = f"S{index:03d}"
        binder._bindings[slot_id] = SlotBinding(
            slot_id=slot_id,
            center=(x + 10, y + 10),
            polygon=np.asarray(
                [(x, y), (x + 20, y), (x + 20, y + 20), (x, y + 20)],
                dtype=np.int32,
            ),
        )
    return binder


@pytest.mark.parametrize('fast_candidates', [False, True])
def test_perf_sparse_lap_matches_full_lap_for_parked_and_competing_cars(fast_candidates):
    binder = _binder_grid()
    binder.fast_batch_match = fast_candidates
    binder.perf_geometry_cache = True
    rng = random.Random(667)
    for repeat in range(45):
        tracks = {}
        binder._vehicle_states.clear()
        binder._vehicle_to_slot.clear()
        for vehicle_id in range(55):
            if vehicle_id < 32:
                x, y = vehicle_id % 8 * 25, vehicle_id // 8 * 25
                tracks[vehicle_id] = {'bbox': (x + 2., y + 2., 16., 16.)}
                slot_id = f'S{vehicle_id:03d}'
                binder._vehicle_states[vehicle_id] = VehicleParkingState(
                    global_id=vehicle_id, parked_slot_id=slot_id,
                )
                binder._vehicle_to_slot[vehicle_id] = slot_id
            else:
                tracks[vehicle_id] = {'bbox': (
                    rng.uniform(-15, 195), rng.uniform(-15, 195),
                    rng.uniform(8, 36), rng.uniform(8, 36),
                )}
        # Parked cars may also exit or compete for the same slot.  These must
        # fall back to LAP instead of receiving a forced parked assignment.
        if repeat % 3 == 0:
            tracks[0]['bbox'] = (27., 2., 16., 16.)
        if repeat % 4 == 0:
            tracks[54]['bbox'] = (2., 2., 16., 16.)
        if repeat % 5 == 0:
            tracks[1]['bbox'] = (20., 2., 18., 16.)

        binder.perf_sparse_match = False
        expected = binder._batch_match(tracks)
        binder.perf_sparse_match = True
        actual = binder._batch_match(tracks)
        assert actual == expected, (fast_candidates, repeat)


def test_sparse_path_handles_no_candidate_and_parked_slot_exits():
    binder = _binder_grid(columns=2, rows=1)
    binder._vehicle_states[1] = VehicleParkingState(global_id=1, parked_slot_id='S000')
    binder._vehicle_to_slot[1] = 'S000'
    cases = [
        {1: {'bbox': (1000., 1000., 12., 12.)}},
        {1: {'bbox': (27., 2., 16., 16.)}},
        {1: {'bbox': (2., 2., 16., 16.)}, 2: {'bbox': (3., 3., 15., 15.)}},
        {1: {'bbox': (2., 2., 16., 16.)}, 2: {'bbox': (26., 2., 16., 16.)}},
    ]
    for tracks in cases:
        binder.perf_sparse_match = False
        full = binder._batch_match(tracks)
        binder.perf_sparse_match = True
        sparse = binder._batch_match(tracks)
        assert sparse == full


def test_stationary_cache_invalidates_when_history_rolls_and_time_changes():
    binder = _binder_grid(columns=1, rows=1)
    state = VehicleParkingState(global_id=1)
    for frame in range(35):
        state.observations.append(VehicleObservation(
            frame / 25, (10., 10.), (1., 1., 18., 18.), 'S000', 0.9,
        ))
    for time_s in (1.4, 1.4, 1.9):
        binder.perf_stopped_cache = False
        expected = binder._is_stopped(state, 'S000', time_s)
        binder.perf_stopped_cache = True
        assert binder._is_stopped(state, 'S000', time_s) == expected
    # Keep the deque length unchanged but replace both endpoints.
    for frame in range(35, 65):
        state.observations.popleft()
        state.observations.append(VehicleObservation(
            frame / 25, (90., 90.), (80., 80., 18., 18.), 'S000', 0.9,
        ))
    binder.perf_stopped_cache = False
    expected = binder._is_stopped(state, 'S000', 2.6)
    binder.perf_stopped_cache = True
    assert binder._is_stopped(state, 'S000', 2.6) == expected
    binder.perf_stopped_cache = False
    expected_stable = binder._strong_overlap_is_stable(state, 'S000')
    binder.perf_stopped_cache = True
    assert binder._strong_overlap_is_stable(state, 'S000') == expected_stable


def test_performance_flags_preserve_binding_lifecycle():
    def run(optimized):
        binder = SlotVehicleBinder(stop_seconds=1.0, exit_seconds=0.5)
        bbox = np.asarray([(0, 0), (100, 0), (100, 100), (0, 100)], dtype=np.int32)
        binder.update_vision([SimpleNamespace(
            slot_id='S1', occupied=False, polygon=bbox,
            center=(50, 50), vehicle_id=None,
        )], 0, 0.0)
        binder.fast_batch_match = True
        binder.perf_sparse_match = optimized
        binder.perf_stopped_cache = optimized
        binder.perf_geometry_cache = optimized
        states = []
        for frame in range(1, 75):
            x = 20 if frame < 43 else 150
            binder.update_tracks({2: {'bbox': (x, 20, 60, 60)}}, frame, frame / 25)
            current = binder.get_slot_state('S1')
            states.append((current['vehicle_id'], current['tracking_occupied'],
                           binder._vehicle_states[2].movement_state))
        return states

    assert run(True) == run(False)
