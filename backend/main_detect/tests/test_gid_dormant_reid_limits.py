"""P16k (#8): tighten dormant re-id so an old Global ID cannot migrate to a
different car.

Verified defect (ASK_23 / REPORT_P16e §4, run ``20261103-125324_K4-P15a``):
V004 created GID 4 at frame 479; later V002 - a different vehicle - was
re-identified *into* GID 4 through dormant re-id, so one Global ID served two
cars.  The pair was never measured in the same frame (the cars occlude each
other), which is why the P16e "simultaneously measured" guard could not see it.

Two independent refusals are added (director: ANS_25):

(a) **Physically impossible.**  If the new fragment is further from the old
    identity's last measured world position than ``v_max * t_dormant + margin``
    it cannot be the same car.  ``v_max`` is an absolute ceiling (default
    20 km/h), not the old track's measured speed - a stopped track has ~0
    measured speed, which is exactly how this defect slipped through.
    ``margin`` is at least one parking slot.

(b) **Still parked somewhere else.**  If the old identity holds a parked
    reservation in another slot *and vision still confirms a vehicle there*,
    the fragment is a different car.  The vision confirmation is mandatory:
    a car that is already driving away still holds its reservation for a
    moment, and refusing re-id then would break its identity.

``--legacy-dormant-reid`` restores the pre-P16k behaviour.
"""

from dataclasses import dataclass

import numpy as np

from techgar.cross_camera_manager import CrossCameraManager
from techgar.cross_camera_manager import GlobalIdentityState
from techgar.tracklet_descriptor import AppearanceTracklet

#: One parking slot in world units, and the speed ceiling the caller derives
#: from ``--dormant-reid-max-speed-kmh`` (20 km/h at k = 2.0895 -> 116.08 u/s).
SLOT_WIDTH_WORLD = 5.116
MAX_SPEED_WORLD_PER_S = 116.083


def make_manager(*, legacy: bool = False, max_speed=MAX_SPEED_WORLD_PER_S):
    return CrossCameraManager(
        camera_sizes={"cam1": (640, 480)},
        camera_crops={"cam1": (0, 0, 640, 480)},
        camera_transforms={"cam1": np.eye(3)},
        edge_adjacency={},
        overlap_regions={},
        match_distance=15.0,
        lookahead_frames=16,
        prediction_radius=90,
        appearance_threshold=0.45,
        min_direction_cosine=0.25,
        slot_width_world=SLOT_WIDTH_WORLD,
        dormant_reid_max_speed_world_per_s=max_speed,
        legacy_dormant_reid=legacy,
    )


def make_identity(*, gid=4, last_world=(10.0, 10.0)) -> GlobalIdentityState:
    histogram = np.zeros((16, 16), dtype=np.float32)
    histogram.flat[0] = 1.0
    return GlobalIdentityState(
        global_id=gid,
        state="dormant",
        last_camera="cam1",
        last_local_track_id=3,
        last_world=last_world,
        velocity_world=(0.0, 0.0),
        velocity_world_per_second=(0.0, 0.0),
        bbox_size=(42, 24),
        appearance=histogram,
        appearance_samples=(histogram,),
        camera_appearance_samples={"cam1": (histogram,)},
        camera_bbox_sizes={"cam1": (42, 24)},
        last_seen_frame=100,
        last_seen_time=4.0,
        dormant_since_frame=100,
    )


# --------------------------------------------------------------------------
# (a) physically impossible
# --------------------------------------------------------------------------


def test_unreachable_distance_is_refused():
    """K4 shape: the old track sat still, so measured speed is ~0; a car that
    appears far away 2 s later cannot be it."""
    manager = make_manager()
    identity = make_identity(last_world=(10.0, 10.0))
    # v_max * 2 s + slot width = 116.083 * 2 + 5.116 = 237.28 units reachable.
    candidate = (400.0, 10.0)  # 390 units away: impossible at 20 km/h.
    result = manager._dormant_reid_physically_impossible(identity, candidate, 2.0)
    assert result is not None, "phai tu choi: 390 > 237 don vi world trong 2 s"
    distance, limit = result
    assert distance == 390.0
    assert limit < distance


def test_reachable_distance_is_allowed():
    """Control: a genuinely occluded car reappearing nearby must still re-id."""
    manager = make_manager()
    identity = make_identity(last_world=(10.0, 10.0))
    candidate = (60.0, 10.0)  # 50 units in 2 s: well inside the ceiling.
    assert manager._dormant_reid_physically_impossible(identity, candidate, 2.0) is None


def test_margin_covers_one_slot_at_zero_elapsed():
    """The margin must be at least one slot so jitter/calibration cannot
    produce a false rejection of a car revived on the spot."""
    manager = make_manager()
    identity = make_identity(last_world=(10.0, 10.0))
    # 5.0 units away, zero elapsed: reachable purely by the slot-width margin.
    assert manager._dormant_reid_physically_impossible(
        identity, (15.0, 10.0), 0.0
    ) is None
    # 6.0 units away is beyond the margin alone.
    assert manager._dormant_reid_physically_impossible(
        identity, (16.0, 10.0), 0.0
    ) is not None


def test_legacy_flag_disables_distance_refusal():
    manager = make_manager(legacy=True)
    identity = make_identity(last_world=(10.0, 10.0))
    assert manager._dormant_reid_physically_impossible(
        identity, (4000.0, 4000.0), 0.1
    ) is None


# --------------------------------------------------------------------------
# (b) still parked - and seen - in another slot
# --------------------------------------------------------------------------


def test_reserved_slot_with_vision_confirmation_is_refused():
    manager = make_manager()
    identity = make_identity(gid=4)
    manager._parked_reservations[4] = {
        "global_id": 4,
        "slot_id": "S061",
        "vision_occupied": True,
    }
    assert manager._dormant_reid_slot_contradiction(identity, None) == "S061"
    # Requesting the very same slot is not a contradiction.
    assert manager._dormant_reid_slot_contradiction(identity, "S061") is None


def test_reserved_slot_without_vision_confirmation_is_allowed():
    """Real-world: a departing car keeps its reservation for a moment.  Without
    vision confirming occupancy the reservation must not block re-id."""
    manager = make_manager()
    identity = make_identity(gid=4)
    manager._parked_reservations[4] = {
        "global_id": 4,
        "slot_id": "S061",
        "vision_occupied": False,
    }
    assert manager._dormant_reid_slot_contradiction(identity, None) is None


def test_no_reservation_is_allowed():
    manager = make_manager()
    identity = make_identity(gid=99)
    assert manager._dormant_reid_slot_contradiction(identity, None) is None


def test_legacy_flag_disables_slot_refusal():
    manager = make_manager(legacy=True)
    identity = make_identity(gid=4)
    manager._parked_reservations[4] = {
        "global_id": 4,
        "slot_id": "S061",
        "vision_occupied": True,
    }
    assert manager._dormant_reid_slot_contradiction(identity, None) is None


# --------------------------------------------------------------------------
# Null-configuration safety
# --------------------------------------------------------------------------


def test_missing_speed_ceiling_disables_only_check_a():
    """A calibration without k must not silently block every re-id."""
    manager = make_manager(max_speed=None)
    identity = make_identity(last_world=(10.0, 10.0))
    assert manager._dormant_reid_physically_impossible(
        identity, (4000.0, 4000.0), 1.0
    ) is None
