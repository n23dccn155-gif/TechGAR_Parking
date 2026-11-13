"""P38/F5 event selection without loading videos or starting child processes."""

from types import SimpleNamespace

import pytest

from techgar.parking_event_scheduler import ParkingEventScheduler


def _detector():
    return SimpleNamespace(
        _img_w_ref=100, _img_h_ref=100,
        _slot_polygons=[{
            "id": "A1",
            "_polygon": [(40, 40), (60, 40), (60, 60), (40, 60)],
        }],
    )


def _scheduler(idle=5.0):
    return ParkingEventScheduler({"cam1": _detector(), "cam2": _detector()},
                                 idle_period_s=idle, started_at_s=10)


def _track(x, y, invisible=0):
    return SimpleNamespace(cx=x, cy=y, bbox=(x - 5, y - 5, 10, 10),
                           consecutive_invisible_count=invisible)


def test_initial_scan_both_cameras_then_idle_period():
    schedule = _scheduler()
    assert schedule.next_camera(10.0) == "cam1"
    schedule.submitted("cam1", 10.0)
    assert schedule.next_camera(10.01) == "cam2"
    schedule.submitted("cam2", 10.01)
    assert schedule.next_camera(14.99) is None
    assert schedule.next_camera(15.0) == "cam1"
    schedule.submitted("cam1", 15.0)
    assert schedule.next_camera(15.01) == "cam2"


def test_background_camera_not_starved_by_other_camera_event_storm():
    schedule = _scheduler()
    schedule.submitted("cam1", 10)
    schedule.submitted("cam2", 10)
    schedule.mark_dirty("cam1", "A1", "track_appeared", 11)
    schedule.submitted("cam1", 11)
    schedule.mark_dirty("cam1", "A1", "motion_transition", 14)
    assert schedule.next_camera(15.1) == "cam2"


def test_unbound_local_tracks_appearance_motion_departure_and_worker_busy():
    schedule = _scheduler()
    for camera in ("cam1", "cam2"):
        schedule.submitted(camera, 10.0)
    # No global ID field: tentative local track must still trigger sampling.
    schedule.observe_tracks("cam1", {17: _track(50, 50)}, (100, 100), 11)
    assert schedule.trigger_count == 1
    assert schedule.next_camera(11.01) == "cam1"
    schedule.submitted("cam1", 11.02)
    schedule.observe_tracks("cam1", {17: _track(50, 50)}, (100, 100), 11.1)
    schedule.observe_tracks("cam1", {17: _track(80, 50)}, (100, 100), 11.2)
    assert schedule.trigger_count >= 2
    # A newly triggered job remains queued while another job is inflight.
    assert schedule.next_camera(11.21) == "cam1"
    schedule.completed("cam1", 11.3, accepted=True)
    assert "event_to_result_p50=" in schedule.summary(12.0)
    schedule.submitted("cam1", 11.4)
    schedule.observe_tracks("cam1", {18: _track(50, 50)}, (100, 100), 11.5)
    schedule.observe_tracks("cam1", {}, (100, 100), 12.0)
    assert schedule.trigger_count >= 3
    assert schedule.next_camera(12.01) == "cam1"


def test_predicted_tracks_not_used_as_events_and_debounce():
    schedule = _scheduler()
    schedule.observe_tracks("cam1", {2: _track(50, 50, invisible=1)}, (100, 100), 10.0)
    assert schedule.trigger_count == 0
    schedule.observe_tracks("cam1", {2: _track(50, 50)}, (100, 100), 10.1)
    assert schedule.trigger_count == 1
    schedule.observe_tracks("cam1", {}, (100, 100), 10.2)
    assert schedule.trigger_count == 2
    schedule.observe_tracks("cam1", {2: _track(50, 50)}, (100, 100), 10.3)
    assert schedule.trigger_count == 2  # appearance debounced per slot/cause
    schedule.observe_tracks("cam1", {}, (100, 100), 10.4)
    assert schedule.trigger_count == 2


def test_binder_events_cursor_ignores_old_events_and_handles_wrapping():
    schedule = _scheduler()
    first = {"type": "vehicle_stopped_in_slot", "slot_id": "A1"}
    schedule.observe_binder("cam2", [first], 20)
    schedule.observe_binder("cam2", [first], 21)
    assert schedule.trigger_count == 1
    second = {"type": "vehicle_left_slot", "slot_id": "A1"}
    schedule.observe_binder("cam2", [first, second], 21.1)
    assert schedule.trigger_count == 2
    third = {"type": "vehicle_stopped_in_slot", "slot_id": "A1"}
    schedule.observe_binder("cam2", [third], 22)
    assert schedule.trigger_count == 3


def test_failed_job_requeues_dirty_event_and_metrics():
    schedule = _scheduler()
    schedule.submitted("cam1", 10)
    schedule.submitted("cam2", 10)
    schedule.mark_dirty("cam2", "A1", "track_appeared", 11)
    schedule.submitted("cam2", 11.1)
    schedule.completed("cam2", 11.2, accepted=False)
    assert schedule.next_camera(11.3) == "cam2"
    schedule.submitted("cam2", 11.4)
    schedule.completed("cam2", 12, accepted=True)
    summary = schedule.summary(70)
    assert "jobs_per_min=4.00" in summary
    assert "events=1" in summary
    assert "p95=1000.0ms" in summary


@pytest.mark.parametrize("seconds", [0, -1, float("nan"), float("inf")])
def test_invalid_idle_period(seconds):
    with pytest.raises(ValueError):
        _scheduler(seconds)
