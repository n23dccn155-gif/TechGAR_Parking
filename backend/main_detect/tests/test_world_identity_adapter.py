"""T5 bridge contract tests: no video, runtime, or legacy tracker execution."""

from __future__ import annotations

import json
import sys
from pathlib import Path
from types import SimpleNamespace

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from two_camera import make_parser  # noqa: E402
from techgar.world_identity_adapter import WorldIdentityAdapter  # noqa: E402
from techgar.world_identity_kernel import GroundGeometry  # noqa: E402


def geometry() -> GroundGeometry:
    return GroundGeometry(
        entrance=((0.0, -2.0), (0.0, 2.0)),
        exit=((-30.0, -2.0), (-30.0, 2.0)),
        slots={
            "S1": ((-12, 8), (-8, 8), (-8, 13), (-12, 13)),
            "S2": ((10, 8), (14, 8), (14, 13), (10, 13)),
        },
        coverage_x=(-40, 40),
    )


def adapter(*, bootstrap: bool = True) -> WorldIdentityAdapter:
    return WorldIdentityAdapter(
        geometry(),
        {"cam1": np.eye(3), "cam2": np.eye(3)},
        bootstrap_first_frame=bootstrap,
    )


def track(x: float, y: float = 0.0, *, source: str = "measurement") -> SimpleNamespace:
    return SimpleNamespace(bbox=(x - 1, y - 1, 2, 2), prediction_source=source)


def step(
    manager: WorldIdentityAdapter,
    tracks: dict[str, dict[int, SimpleNamespace]],
    frame_idx: int,
    timestamp_s: float,
) -> dict[str, dict[int, int]]:
    return manager.update_all_tracks(
        tracks, frame_idx,
        camera_timestamps_s={camera: timestamp_s for camera in tracks},
    )


def test_identity_kernel_flag_defaults_legacy_and_accepts_world() -> None:
    parser = make_parser()
    mandatory = [
        "--calibration", "calibration.json",
        "--slots-cam1", "cam1.json", "--slots-cam2", "cam2.json",
    ]
    assert parser.parse_args(mandatory).identity_kernel == "legacy"
    assert parser.parse_args([*mandatory, "--identity-kernel", "world"]).identity_kernel == "world"


def test_measured_camera_pair_has_one_gid_and_writer_registry_contract() -> None:
    manager = adapter()
    assigned = step(manager, {
        "cam1": {11: track(1.0)},
        "cam2": {21: track(1.2)},
    }, 1, 0.0)
    assert assigned == {"cam1": {11: 1}, "cam2": {21: 1}}
    assert manager.get_global_id("cam1", 11) == 1
    assert manager.canonical_global_id(1) == 1
    registry = manager.to_json({})
    observations = registry["active_global_vehicles"]["1"]["observations"]
    assert [(row["camera_id"], row["local_track_id"]) for row in observations] == [
        ("cam1", 11), ("cam2", 21),
    ]
    assert observations[0]["global_position"] == {"x": 1.0, "y": 0.0}
    assert registry["identity_lifecycle"]["1"]["state"] == "active"
    assert registry["map_vehicles"]["1"]["observation_count"] == 2


def test_missing_and_stale_tracks_are_held_but_never_measured() -> None:
    manager = adapter()
    step(manager, {"cam1": {1: track(0.0)}}, 1, 0.0)
    assert step(manager, {"cam1": {1: track(0.0, source="stale_prediction")}}, 2, 0.1) == {
        "cam1": {},
    }
    assert manager.get_global_id("cam1", 1) is None
    registry = manager.to_json({})
    assert registry["active_global_vehicles"] == {}
    assert registry["identity_lifecycle"]["1"]["state"] == "held"
    assert [item["global_id"] for item in registry["held_vehicles"]] == [1]
    payload = {"observations": [
        {"local_track_id": 1, "prediction_source": "stale_prediction", "canonical_gid": 1},
        {"local_track_id": 2, "prediction_source": "measurement", "canonical_gid": None},
    ]}
    manager.attach_prediction_state(payload)
    assert payload["observations"] == [
        {"local_track_id": 2, "prediction_source": "measurement", "canonical_gid": None},
    ]
    assert payload["held_vehicles"][0]["prediction_source"] == "held"


def test_all_occupied_slots_remain_eligible_in_one_step() -> None:
    manager = adapter(bootstrap=False)
    manager._parked_reservations = {
        90: {"slot_id": "S1"}, 91: {"slot_id": "S2"},
    }
    assigned = step(manager, {"cam1": {1: track(-10, 10), 2: track(12, 10)}}, 1, 0.0)
    assert set(assigned["cam1"].values()) == {1, 2}


def test_parked_reservation_acknowledgement_and_json_serialization() -> None:
    manager = adapter()
    step(manager, {"cam1": {4: track(0.0)}}, 1, 0.0)
    record = {"global_id": 1, "camera_id": "cam1", "slot_id": "S1",
              "appearance": np.array([0.2, 0.8], dtype=np.float32), "center": (1, 2)}
    accepted = manager.sync_parked_reservations(
        [record, {"global_id": 99, "camera_id": "cam1", "slot_id": "S2"}], 1,
    )
    assert list(accepted) == [1]
    assert accepted[1]["camera_id"] == "cam1"
    restored = json.loads(json.dumps(manager.to_json({})))
    assert restored["parked_identity_reservations"]["1"]["center"] == [1, 2]
    assert len(restored["parked_identity_reservations"]["1"]["appearance"]) == 2
