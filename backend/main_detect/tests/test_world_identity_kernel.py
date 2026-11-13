"""World-identity structural invariants; no video, runtime or OpenCV."""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from techgar.world_identity_kernel import (  # noqa: E402
    GroundGeometry,
    Measurement,
    WorldIdentityKernel,
    WorldTrack,
)


def geometry() -> GroundGeometry:
    return GroundGeometry(
        entrance=((0.0, -2.0), (0.0, 2.0)),
        exit=((-30.0, -2.0), (-30.0, 2.0)),
        slots={"S1": ((-12, 8), (-8, 8), (-8, 13), (-12, 13))},
        coverage_x=(-40, 40),
    )


def m(x: float, y: float, cam: str = "cam1", local: int = 1, color: str = "red") -> Measurement:
    return Measurement(cam, (x, y), (0.0, 0.0, 20.0, 10.0), local, color)


def gids(kernel: WorldIdentityKernel, observations: list[Measurement], time_s: float) -> list[int | None]:
    return [r.gid for r in kernel.step(observations, time_s).measurements]


def test_l1_one_to_one_and_camera_pair_fusion() -> None:
    kernel = WorldIdentityKernel(geometry())
    a = gids(kernel, [m(1.0, 0, "cam1"), m(1.2, 0, "cam2")], 0.0)
    assert a == [1, 1]
    b = gids(kernel, [m(0.0, 0, "cam1"), m(0.2, 0, "cam2")], 0.1)
    assert b == [1, 1]
    assert len([t for t in kernel.tracks if t.gid is not None]) == 1


def test_l2_stopped_then_moved_preserves_gid_after_long_silence() -> None:
    kernel = WorldIdentityKernel(geometry())
    assert gids(kernel, [m(1, 0)], 0.0) == [1]
    assert gids(kernel, [m(-2, 0)], 0.2) == [1]
    assert gids(kernel, [], 3.2) == []
    # A held vehicle is an explicitly tagged hold, not a measured observation.
    held = kernel.step([], 3.3, emit_held=True).held
    assert len(held) == 1 and held[0].prediction_source == "held"
    assert gids(kernel, [m(-3, 0)], 3.4) == [1]


def test_l2_departing_car_retires_only_at_configured_exit() -> None:
    # Starting at a real entrance makes the identity immediately registered.
    g = GroundGeometry(entrance=((-27.0, -2), (-27.0, 2)), exit=((-30.0, -2), (-30.0, 2)))
    kernel = WorldIdentityKernel(g, bootstrap_first_frame=True)
    assert gids(kernel, [m(-27, 0, "cam1"), m(-27.1, 0, "cam2")], 0.0) == [1, 1]
    assert gids(kernel, [m(-29, 0, "cam1"), m(-29.1, 0, "cam2")], 0.1) == [1, 1]
    assert gids(kernel, [], 0.7) == []
    assert kernel.tracks[0].retired


def test_l1_opposite_direction_same_color_retains_both_identities() -> None:
    g = geometry()
    g.slots["initial_left"] = ((-10, -1), (-8, -1), (-8, 1), (-10, 1))
    kernel = WorldIdentityKernel(g, bootstrap_first_frame=True)
    first = [m(-9, 0, "cam1", 11), m(-9.1, 0, "cam2", 21),
             m(9, 0, "cam1", 12), m(9.1, 0, "cam2", 22)]
    assert gids(kernel, first, 0.0) == [1, 1, 2, 2]
    for i in range(1, 9):
        x1, x2 = -9 + 2.4 * i, 9 - 2.4 * i
        obs = [m(x1, 0, "cam1", 11), m(x1 + 0.1, 0, "cam2", 21),
               m(x2, 0, "cam1", 12), m(x2 + 0.1, 0, "cam2", 22)]
        assert gids(kernel, obs, i * 0.2) == [1, 1, 2, 2]


def test_l1_nearby_opposing_lanes_do_not_fuse_distinct_local_tracks() -> None:
    kernel = WorldIdentityKernel(geometry())
    kernel._time_s = 0.0
    kernel._gid = kernel._internal_id = 2
    kernel.tracks = [
        WorldTrack(1, 1, (-1.6, -3.0), (14.0, 0.0), 0.0, 0.0,
                   last_ids={"cam1": 101}, last_color="red"),
        WorldTrack(2, 2, (1.6, 3.0), (-14.0, 0.0), 0.0, 0.0,
                   last_ids={"cam1": 202}, last_color="red"),
    ]
    # Two opposing lanes pass within one body length. These are separate
    # vehicles despite the tempting split-blob distance threshold.
    assert gids(kernel, [m(-0.2, -3.0, "cam1", 101),
                         m(0.2, 3.0, "cam1", 202)], 0.1) == [1, 2]


def test_l1_cross_camera_pair_rejects_opposite_known_vehicle() -> None:
    kernel = WorldIdentityKernel(geometry())
    kernel._time_s = 0.0
    kernel._gid = kernel._internal_id = 2
    kernel.tracks = [
        WorldTrack(1, 1, (-1.0, -2.0), (10.0, 0.0), 0.0, 0.0,
                   last_ids={"cam1": 101}, last_color="red"),
        WorldTrack(2, 2, (1.0, 2.0), (-10.0, 0.0), 0.0, 0.0,
                   last_ids={"cam2": 202}, last_color="red"),
    ]
    # Different vehicles appear within the geometric cross-camera gate.
    assert gids(kernel, [m(0.0, -2.0, "cam1", 101),
                         m(0.0, 2.0, "cam2", 202)], 0.1) == [1, 2]


@pytest.mark.parametrize("second_camera", ["cam1", "cam2"])
def test_l1_opposing_vehicles_keep_ids_when_local_track_ids_exchange(second_camera: str) -> None:
    kernel = WorldIdentityKernel(geometry())
    kernel._time_s = 0.0
    kernel._gid = kernel._internal_id = 2
    kernel.tracks = [
        WorldTrack(1, 1, (-1.0, -2.5), (10.0, 0.0), 0.0, 0.0,
                   last_ids={"cam1": 101, "cam2": 111}, last_color="red"),
        WorldTrack(2, 2, (1.0, 2.5), (-10.0, 0.0), 0.0, 0.0,
                   last_ids={"cam1": 202, "cam2": 222}, last_color="red"),
    ]
    # At the intersection, even the per-camera tracker can accidentally hand
    # the two same-colored cars each other's local IDs.
    second_local = 101 if second_camera == "cam1" else 111
    assert gids(kernel, [m(0.0, -2.5, "cam1", 202),
                         m(0.0, 2.5, second_camera, second_local)], 0.1) == [1, 2]


def test_l1_opposite_traffic_keeps_heading_when_local_ids_swap_at_close_crossing() -> None:
    kernel = WorldIdentityKernel(geometry())
    kernel._time_s = 0.0
    kernel._gid = kernel._internal_id = 2
    kernel.tracks = [
        WorldTrack(1, 1, (-1.0, -1.5), (10.0, 0.0), 0.0, 0.0,
                   last_ids={"cam1": 101}, last_color="red"),
        WorldTrack(2, 2, (1.0, 1.5), (-10.0, 0.0), 0.0, 0.0,
                   last_ids={"cam1": 202}, last_color="red"),
    ]
    # Observations deliberately arrive in reversed physical order. The two
    # lanes are just 3 cm apart, smaller than a full camera pairing gate.
    assert gids(kernel, [m(0.0, 1.5, "cam1", 101),
                         m(0.0, -1.5, "cam1", 202)], 0.1) == [2, 1]


def test_l3_tentative_track_cannot_displace_confirmed_local_continuity() -> None:
    # Based on the two groups at source frame 1762 in stride 4. A nearby
    # tentative track is eligible for the registered car's true measurement;
    # the other blob is also within the registered track's physical gate.
    kernel = WorldIdentityKernel(geometry())
    kernel._time_s = 1758 / 25
    kernel._gid = 9
    kernel._internal_id = 14
    kernel.tracks = [
        WorldTrack(9, 9, (-7.3, -9.4), (-3.2, 0), 1758 / 25, 0,
                   last_ids={"cam1": 25, "cam2": 36}),
        WorldTrack(14, None, (-13.6, -12.6), (-1, 0), 1746 / 25, 0,
                   last_ids={"cam1": 29, "cam2": 42}),
    ]
    observed = [
        m(-7.9, -9.4, "cam1", 25), m(-7.9, -9.4, "cam2", 36),
        m(-2.4, -9.4, "cam1", 40), m(-2.4, -9.4, "cam2", 45),
    ]
    assert gids(kernel, observed, 1762 / 25) == [9, 9, None, None]


def test_l2_slow_track_long_gap_cannot_jump_to_distant_vehicle() -> None:
    # Stride 4, source frame 1762: an old GID at x=14.52 must not take the
    # measurement at x=-2.45 just because max_speed * elapsed allows it.
    kernel = WorldIdentityKernel(geometry())
    kernel._time_s = 1746 / 25
    kernel._gid = 10
    kernel._internal_id = 10
    kernel.tracks = [
        WorldTrack(10, 10, (14.52, -9.73), (-2.86, -1.37), 1746 / 25, 0,
                   last_ids={"cam1": 30, "cam2": 40}),
    ]
    assert gids(kernel, [m(-2.45, -9.43, "cam1", 40)], 1762 / 25) == [None]
    assert gids(kernel, [m(13.2, -9.4, "cam1", 44)], 1862 / 25) == [10]


def test_l3_gate_slot_born_immediately_mid_lane_stays_provisional() -> None:
    kernel = WorldIdentityKernel(geometry())
    assert gids(kernel, [m(-15, 0)], 0.0) == [None]
    assert len([t for t in kernel.tracks if t.gid is not None]) == 0
    assert gids(kernel, [m(-10, 10, "cam1", 2)], 0.1) == [1]
    assert gids(kernel, [m(20, 0, "cam1", 3)], 0.2) == [2]
    # Non-entrance inventory remains provisional even with bootstrap enabled.
    second = WorldIdentityKernel(geometry(), bootstrap_first_frame=True)
    assert gids(second, [m(-15, 0)], 0.0) == [None]


def test_l3_prime_requires_source_time_measurements_and_motion() -> None:
    kernel = WorldIdentityKernel(geometry())
    samples = [(0.0, -24.0), (0.20, -22.5), (0.40, -21.0),
               (0.60, -19.0), (0.80, -18.0), (1.0, -17.0)]
    for time_s, x in samples[:-1]:
        assert gids(kernel, [m(x, 0)], time_s) == [None]
    result = kernel.step([m(-17, 0)], 1.0)
    assert [item.gid for item in result.measurements] == [1]
    assert result.promoted_tracks == {1: 1}
    assert result.newly_created_gids == [1]
    assert result.measurements[0].internal_track_id == 1


def test_l3_prime_bootstrap_shortens_age_and_count_for_dual_camera() -> None:
    kernel = WorldIdentityKernel(geometry(), bootstrap_first_frame=True)
    first = kernel.step([m(-20, 0, 'cam1', 1), m(-20.2, 0, 'cam2', 2)], 100.0)
    assert [item.gid for item in first.measurements] == [None, None]
    assert not first.promoted_tracks
    second = kernel.step([m(-19.8, 0, 'cam1', 1), m(-19.9, 0, 'cam2', 2)], 100.2)
    assert [item.gid for item in second.measurements] == [None, None]
    third = kernel.step([m(-19.6, 0, 'cam1', 1), m(-19.7, 0, 'cam2', 2)], 100.4)
    assert [item.gid for item in third.measurements] == [1, 1]
    assert third.promoted_tracks == {1: 1}
    assert {item.internal_track_id for item in first.measurements + third.measurements} == {1}


def test_l3_prime_must_not_promote_with_reachable_silent_vehicle() -> None:
    kernel = WorldIdentityKernel(geometry())
    kernel.step([], 0.0)
    kernel._gid = 1
    kernel._internal_id = 1
    kernel.tracks.append(WorldTrack(1, 1, (-17, 0), (0.0, 0.0), 0.0, 0.0))
    # A provisional identity has enough time/hits/movement but is adjacent to
    # an older silent registered vehicle which must retain priority.
    track = WorldTrack(2, None, (-20, 0), (0.0, 0.0), 0.9, 0.0,
                       hits=6, first_xy=(-26, 0), measurement_count=6)
    kernel._internal_id = 2
    kernel.tracks.append(track)
    group = kernel._groups([m(-20, 0)])[0]
    assert not kernel._may_promote(track, group, [m(-20, 0)], 0.9, {2})


def test_l3_prime_does_not_recycle_departed_silent_gid_at_camera_edge() -> None:
    # Sang 1500: an identity last travelling toward the outer camera edge
    # cannot be reused five seconds later for a different arriving car.
    base = geometry()
    geo = GroundGeometry(base.entrance, base.exit, base.slots,
                         coverage_x=(-94.4, 102.7), coverage_y=(-71.1, 96.2))
    kernel = WorldIdentityKernel(geo)
    kernel._time_s = 0.0
    kernel._gid = kernel._internal_id = 1
    kernel.tracks.append(WorldTrack(1, 1, (-49.3, 24.4), (-16.9, 1.3), 0.0, 0.0,
                                    last_ids={'cam1': 9}))
    result = kernel.step([m(-64.0, 21.6, 'cam1', 35)], 5.1)
    assert [item.gid for item in result.measurements] == [None]
    assert kernel.tracks[0].gid == 1 and not kernel.tracks[0].retired
    assert len(kernel.tracks) == 2 and kernel.tracks[1].gid is None


def test_l4_recent_split_blob_never_mints_second_slot_identity() -> None:
    kernel = WorldIdentityKernel(geometry())
    kernel._time_s = 0.0
    kernel._gid = kernel._internal_id = 1
    kernel.tracks.append(WorldTrack(1, 1, (-27.3, 11.2), (0.0, 0.0), 0.0, 0.0,
                                    last_ids={'cam1': 25}))
    # Centres differ by 6.4 cm, inside the 9.4 cm physical body footprint.
    result = kernel.step([m(-27.5, 17.6, 'cam1', 26)], 0.08)
    assert [item.gid for item in result.measurements] == [None]
    assert len(kernel.tracks) == 1


def test_l4_short_local_handoff_preserves_gid_after_anchor_jump() -> None:
    kernel = WorldIdentityKernel(geometry())
    kernel._time_s = 0.0
    kernel._gid = kernel._internal_id = 1
    kernel.tracks.append(WorldTrack(1, 1, (0.0, 0.0), (0.0, 0.0), 0.0, 0.0,
                                    last_ids={"cam1": 10}))
    # A different local tracker may measure the opposite end of the same car.
    assert gids(kernel, [m(8.5, 0.0, "cam1", 11)], 0.12) == [1]
    assert len(kernel.tracks) == 1


def test_l4_short_handoff_does_not_allow_long_gap_id_reuse() -> None:
    kernel = WorldIdentityKernel(geometry())
    kernel._time_s = 0.0
    kernel._gid = kernel._internal_id = 1
    kernel.tracks.append(WorldTrack(1, 1, (0.0, 0.0), (0.0, 0.0), 0.0, 0.0,
                                    last_ids={"cam1": 10}))
    # At 0.16 s the normal gate applies again to a new local track.
    assert gids(kernel, [m(8.5, 0.0, "cam1", 11)], 0.16) == [2]
    assert kernel.tracks[0].gid == 1


def test_l4_split_blob_does_not_create_duplicate_gid() -> None:
    kernel = WorldIdentityKernel(geometry())
    result = kernel.step([m(0, 0, "cam1", 1), m(0.1, 0, "cam2", 1), m(5.0, 0, "cam1", 2)], 0.0)
    assert [a.gid for a in result.measurements] == [1, 1, None]
    assert result.newly_created_gids == [1]
    assert result.measurements[2].reason == "unassigned_fragment"


def test_l4_stale_silent_ghost_eliminated_by_measured_vehicle() -> None:
    kernel = WorldIdentityKernel(geometry())
    assert gids(kernel, [m(0.0, 0.0)], 0.0) == [1]
    # A stale independently retained track claims the same physical body.
    kernel.tracks.append(WorldTrack(99, 99, (-6.0, 0.0), (0.0, 0.0), 0.0, 0.0))
    gids(kernel, [m(-4.0, 0.0)], 0.5)
    gids(kernel, [m(-6.0, 0.0)], 0.8)
    assert kernel.tracks[-1].retired


def test_l5_nonmeasurement_is_never_returned_as_normal_observation() -> None:
    kernel = WorldIdentityKernel(geometry())
    kernel.step([m(0.0, 0.0)], 0.0)
    silent = kernel.step([], 0.5, emit_held=True)
    assert not silent.measurements
    assert [(r.gid, r.prediction_source) for r in silent.held] == [(1, "held")]


def test_timestamps_must_advance_and_units_are_seconds() -> None:
    kernel = WorldIdentityKernel(geometry())
    kernel.step([m(0, 0)], 0.0)
    with pytest.raises(ValueError, match="strictly increasing"):
        kernel.step([], 0.0)
    # 2 cm in 0.1 s is physically reachable, not 2 cm per processed frame.
    assert gids(kernel, [m(-2.0, 0)], 0.1) == [1]
