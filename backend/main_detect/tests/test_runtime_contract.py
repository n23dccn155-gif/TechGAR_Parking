from techgar.runtime_contract import build_runtime_snapshot


def test_runtime_snapshot_keeps_current_global_ids_and_slot_layout():
    snapshot = build_runtime_snapshot(
        runtime_id="runtime-m05",
        timestamp="2026-08-23T10:00:00+07:00",
        published_at="2026-08-23T10:01:00+07:00",
        frame_index=12,
        registry={
            "world_unit": "cm",
            "map_vehicles": {
                "7": {
                    "position": {"x": 10, "y": 20},
                    "camera_ids": ["cam2"],
                }
            },
            "identity_lifecycle": {
                "7": {"global_id": 7, "state": "active", "last_camera": "cam2"},
                "8": {
                    "global_id": 8,
                    "state": "dormant",
                    "last_camera": "cam1",
                    "last_world": {"x": 4, "y": 5},
                },
                "9": {
                    "global_id": 9,
                    "state": "exited",
                    "last_world": {"x": 1, "y": 2},
                },
            },
            "parked_identity_reservations": {"8": {"slot_id": "D01"}},
            "retired_global_ids": {"12": 7},
            "recent_events": [{"event": "handoff"}],
        },
        parking_by_camera={
            "cam1": {
                "D01": {
                    "status": "occupied",
                    "occupied": True,
                    "vehicle_id": 8,
                    "tracking_state": "parked",
                    "stopped_for_ms": 2300,
                }
            }
        },
        camera_sizes={"cam1": (1280, 720), "cam2": (1280, 720)},
        camera_timestamps_ns={"cam1": 100, "cam2": 120},
        calibration={
            "world": {"unit": "cm", "bounds": {"min_x_cm": 0}},
            "parking_slots_world": {
                "cam1": [{"id": "D01", "polygon": [[0, 0], [1, 0], [1, 1]]}]
            },
        },
        camera_skew_ms=0.02,
        source_mode="replay",
        parking_episodes=[{"parking_episode_id": "D01-1", "global_id": 8, "slot_id": "D01", "state": "parked"}],
    )

    assert [vehicle["global_id"] for vehicle in snapshot["vehicles"]] == [7, 8]
    assert snapshot["runtime_id"] == "runtime-m05"
    assert snapshot["vehicles"][1]["parked_slot_id"] == "D01"
    assert snapshot["parking_slots"][0]["camera_id"] == "cam1"
    assert snapshot["parking_slots"][0]["vehicle_id"] == 8
    assert snapshot["parking_slots"][0]["tracking_state"] == "parked"
    assert snapshot["parking_slots"][0]["stopped_for_ms"] == 2300
    assert snapshot["slot_layout"][0]["slot_id"] == "D01"
    assert snapshot["retired_global_ids"] == {"12": 7}


def test_reservation_is_not_a_parking_episode_and_stale_camera_is_offline():
    value = build_runtime_snapshot(runtime_id="run", timestamp="", published_at="", frame_index=20,
        registry={"identity_lifecycle": {"2": {"global_id":2,"state":"recovery_pending",
                    "last_world":{"x":1,"y":2}}},
                  "parked_identity_reservations":{"2":{"slot_id":"D01"}}},
        parking_by_camera={}, camera_sizes={"cam1":(100,100),"cam2":(100,100)},
        camera_timestamps_ns={"cam1":1_000_000_000,"cam2":9_900_000_000}, calibration={},
        camera_skew_ms=8900.,source_mode="live",applied_monotonic_ns=10_000_000_000)
    assert value["vehicles"][0]["parked_slot_id"] is None
    assert value["parking_episodes"] == []
    assert not value["cameras"]["cam1"]["online"]
    assert value["cameras"]["cam1"]["age_ms"] == 9000.
    assert value["cameras"]["cam2"]["online"]


def test_runtime_snapshot_keeps_observed_vehicle_with_integer_registry_keys():
    value = build_runtime_snapshot(
        runtime_id="run-int-keys",
        timestamp="2026-09-07T10:00:00+07:00",
        published_at="2026-09-07T10:00:00+07:00",
        frame_index=7,
        registry={
            "world_unit": "cm",
            "map_vehicles": {
                3: {
                    "position": {"x": 12, "y": 34},
                    "camera_ids": ["cam1"],
                }
            },
            "identity_lifecycle": {
                "3": {
                    "global_id": 3,
                    "state": "active",
                    "last_camera": "cam1",
                    "last_world": {"x": 10, "y": 30},
                }
            },
        },
        parking_by_camera={},
        camera_sizes={"cam1": (100, 100)},
        camera_timestamps_ns={"cam1": 1_000_000_000},
        calibration={},
        camera_skew_ms=0.0,
        source_mode="live",
        applied_monotonic_ns=1_000_000_000,
    )
    assert value["vehicles"] == [{
        "global_id": 3,
        "state": "active",
        "observed": True,
        "camera_ids": ["cam1"],
        "position": {"x": 12.0, "y": 34.0, "reference": "cm"},
        "parked_slot_id": None,
        "last_seen_frame": None,
        "last_seen_time": None,
    }]
