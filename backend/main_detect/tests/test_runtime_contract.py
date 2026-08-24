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
    )

    assert [vehicle["global_id"] for vehicle in snapshot["vehicles"]] == [7, 8]
    assert snapshot["runtime_id"] == "runtime-m05"
    assert snapshot["vehicles"][1]["parked_slot_id"] == "D01"
    assert snapshot["parking_slots"][0]["camera_id"] == "cam1"
    assert snapshot["parking_slots"][0]["vehicle_id"] == 8
    assert snapshot["parking_slots"][0]["tracking_state"] == "parked"
    assert snapshot["parking_slots"][0]["stopped_for_ms"] == 2300
    assert snapshot["slot_layout"][0]["slot_id"] == "D01"
