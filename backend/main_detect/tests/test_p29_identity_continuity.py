"""P29: hai loi dinh danh cua toi_5p (V040 doi GID, V060 khong co GID).

V040 (o S049): vao cong GID 1 (cam2 local1, f354-420) nhung luc do GID 5
(cam1 local8, f760-807).  Nguyen nhan do duoc: frame-differencing tach MOT xe
thanh hai nua dinh nhau co dien tich tuong duong (cam1 local6 = 54x40,
local7 = 33x36).  Hai cong echo cu deu truot vi chung doi hoi manh nho
(<=45% primary) hoac IoU >= 0.20, nen nua sau duoc cap GID 5 rieng luc f684.

V060 (o S054): parking token cua o S056 (GID 3) giu local cam1#82 suot
f4623..f4722 (91 frame) => canonical_gid=None.  Ban kinh token
(0.85 * duong cheo o) phu ca o ke ben, nen xe dang DO VAO S054 bi coi la
"dang roi S056" ma khong bao gio chung minh duoc.
"""
from __future__ import annotations

import json
import pathlib

import numpy as np
import pytest

from techgar.cross_camera_manager import CrossCameraManager
from techgar.slot_vehicle_binder import SlotBinding, SlotVehicleBinder

RUN = pathlib.Path(__file__).resolve().parents[3] / "sim3d" / "data" / "runs" / "20261106-134724_toi_5p"


class HistogramTrack:
    """Minimal track exposing what the same-camera echo gates read."""

    def __init__(self, bbox, bin_index=0, velocity=(0.0, 0.0)):
        self.x, self.y, self.w, self.h = (int(value) for value in bbox)
        self.cx = self.x + self.w / 2.0
        self.cy = self.y + self.h / 2.0
        self.area = self.w * self.h
        self.status = "confirmed"
        self.observation_kind = "detection"
        self.association_state = "matched"
        self.consecutive_invisible_count = 0
        self.fragment_visible_count = 20
        histogram = np.zeros((16, 16), dtype=np.float32)
        histogram.flat[int(bin_index) % 256] = 1.0
        self.appearance = histogram
        self.appearance_tracklet = None
        vx, vy = velocity
        self.history = [
            (self.cx - vx * (5 - index), self.cy - vy * (5 - index))
            for index in range(5)
        ]


def make_manager(**kwargs) -> CrossCameraManager:
    settings = dict(
        camera_sizes={"cam1": (800, 1280), "cam2": (800, 1280)},
        camera_crops={"cam1": (0, 0, 800, 1280), "cam2": (0, 0, 800, 1280)},
        camera_transforms={"cam1": np.eye(3), "cam2": np.eye(3)},
        match_distance=15.0,
        prediction_radius=90,
        appearance_threshold=0.45,
        relaxed_appearance_threshold=0.62,
        min_direction_cosine=0.25,
    )
    settings.update(kwargs)
    return CrossCameraManager(**settings)


# --------------------------------------------------------------------------
# V040: hai nua cua MOT xe
# --------------------------------------------------------------------------
# bbox that cua V040 tren cam1 tai f683 (GT f682).
V040_FRONT = [448, 639, 33, 36]   # local 7 - nua truoc, dang giu GID 1
V040_REAR = [392, 633, 54, 40]    # local 6 - nua sau, bi cap GID 5
# Kich thuoc xe ma GID 1 da hoc o cam1 (union cua hai nua la 89x46).
V040_LEARNED_SIZE = (87, 56)


def test_v040_split_halves_are_one_vehicle():
    manager = make_manager()
    front = HistogramTrack(V040_FRONT, bin_index=0, velocity=(-3.0, 0.0))
    rear = HistogramTrack(V040_REAR, bin_index=0, velocity=(-3.0, 0.0))
    assert manager._same_camera_split_vehicle_echo(
        rear, front, reference_size=V040_LEARNED_SIZE
    ) is True
    assert manager._same_camera_split_vehicle_echo(
        front, rear, reference_size=V040_LEARNED_SIZE
    ) is True


def test_split_vehicle_echo_rejects_two_parked_cars():
    """Two cars in adjacent bays (S054/S056) must never be one identity."""
    manager = make_manager()
    left = HistogramTrack([542, 568, 87, 56], bin_index=0)
    right = HistogramTrack([624, 568, 87, 56], bin_index=0)
    assert manager._same_camera_split_vehicle_echo(left, right) is False


def test_split_vehicle_echo_rejects_union_wider_than_one_vehicle():
    """Two cars side by side union to ~2x one car - never a split."""
    manager = make_manager()
    left = HistogramTrack([542, 568, 87, 56], bin_index=0)
    right = HistogramTrack([624, 568, 87, 56], bin_index=0)
    assert manager._same_camera_split_vehicle_echo(left, right) is False


def test_split_vehicle_echo_requires_touching_boxes():
    manager = make_manager()
    near = HistogramTrack(V040_FRONT, bin_index=0)
    far = HistogramTrack([200, 633, 54, 40], bin_index=0)
    assert manager._same_camera_split_vehicle_echo(far, near) is False


def test_split_vehicle_echo_requires_comparable_halves():
    """A full car beside a small lamp/edge blob is not a split (toi_5p f904).

    ``same_camera_split_vehicle_merged`` wrongly welded a 84x60 car to a 39x43
    fragment there: the union fits one car, but the two blobs are not halves.
    """
    manager = make_manager()
    car = HistogramTrack([400, 600, 84, 60], bin_index=0)
    lamp = HistogramTrack([480, 620, 39, 43], bin_index=0)
    assert manager._same_camera_split_vehicle_echo(
        car, lamp, reference_size=(87, 56)
    ) is False


def test_split_vehicle_echo_rejects_an_even_split():
    """An exactly even 2.0x split is numerically two cars - stay conservative.

    Two halves of one car can look like this, but so do two equal cars side by
    side, and wrongly merging two real vehicles is the worse outcome.
    """
    manager = make_manager()
    top = HistogramTrack([500, 560, 87, 28], bin_index=0)
    bottom = HistogramTrack([500, 588, 87, 28], bin_index=0)
    assert manager._same_camera_split_vehicle_echo(top, bottom) is False


def test_legacy_flag_restores_old_behaviour_for_v040():
    manager = make_manager(split_vehicle_echo=False)
    front = HistogramTrack(V040_FRONT, bin_index=0, velocity=(-3.0, 0.0))
    rear = HistogramTrack(V040_REAR, bin_index=0, velocity=(-3.0, 0.0))
    assert manager._same_camera_split_vehicle_echo(rear, front) is False


def teach_vehicle_size(manager, global_id=1, camera_id="cam1", size=V040_LEARNED_SIZE):
    """Seed the learned camera size the way ``_refresh_identity_states`` does."""
    from techgar.cross_camera_manager import GlobalIdentityState

    identity = manager._identities.get(global_id)
    if identity is None:
        identity = GlobalIdentityState(
            global_id=global_id,
            state="active",
            last_camera=camera_id,
            last_local_track_id=7,
            last_world=(0.0, 0.0),
            velocity_world=(0.0, 0.0),
            velocity_world_per_second=(0.0, 0.0),
            bbox_size=size,
            appearance=None,
            appearance_samples=(),
            camera_appearance_samples={},
            camera_bbox_sizes={camera_id: size},
            last_seen_frame=683,
            last_seen_time=1.0,
        )
        manager._identities[global_id] = identity
    else:
        identity.camera_bbox_sizes[camera_id] = size
    return identity


def test_v040_split_fragment_does_not_mint_a_second_gid():
    """End to end through the allocator at the exact f684 moment.

    Local 7 already holds GID 1 and has just aged into a prediction; local 6 is
    the same car's other half and is still being detected.  The unfixed
    allocator minted GID 5 here (measured on toi_5p).
    """
    manager = make_manager()
    manager._bind("cam1", 7, 1)
    teach_vehicle_size(manager, global_id=1)

    rear = HistogramTrack(V040_REAR, bin_index=0, velocity=(-3.0, 0.0))
    front = HistogramTrack(V040_FRONT, bin_index=0, velocity=(-3.0, 0.0))
    front.observation_kind = "prediction"
    front.consecutive_invisible_count = 1

    ids = manager.update_all_tracks(
        {"cam1": {6: rear, 7: front}},
        684,
        {"cam1": 684 / 30.0},
    )

    assert ids["cam1"].get(6) == 1
    assert manager._next_global_id == 1


def test_v040_merge_survives_the_sibling_leaving_the_frame():
    """toi_5p f684: the half holding GID 1 is LOST, so it is not in the frame.

    ``observable_tracks`` no longer contains it, yet its last box is what proves
    the two blobs are one car.  Without the cached box the allocator minted
    GID 5 for local 6.
    """
    manager = make_manager()
    manager._bind("cam1", 7, 1)
    teach_vehicle_size(manager, global_id=1)

    rear = HistogramTrack(V040_REAR, bin_index=0, velocity=(-3.0, 0.0))
    front = HistogramTrack(V040_FRONT, bin_index=0, velocity=(-3.0, 0.0))
    manager.update_all_tracks(
        {"cam1": {6: rear, 7: front}}, 683, {"cam1": 683 / 30.0}
    )
    manager._bind("cam1", 7, 1)

    # f684: only local 6 is still observable.
    rear_next = HistogramTrack(V040_REAR, bin_index=0, velocity=(-3.0, 0.0))
    ids = manager.update_all_tracks(
        {"cam1": {6: rear_next}}, 684, {"cam1": 684 / 30.0}
    )

    assert ids["cam1"].get(6) == 1
    # The second half never got its own Global ID: at most one was minted.
    assert manager._next_global_id <= 2


def test_split_echo_merges_even_while_the_sibling_is_occluded():
    """The exact f684 transition: the half holding GID 1 goes 'occluded'.

    ``_occluded_global_ids`` must not veto the halves merge - that veto is what
    let the other half be minted GID 5 in the unfixed run.
    """
    manager = make_manager()
    manager._bind("cam1", 7, 1)
    teach_vehicle_size(manager, global_id=1)
    manager.sync_occluded_identities({1})

    rear = HistogramTrack(V040_REAR, bin_index=0, velocity=(-3.0, 0.0))
    front = HistogramTrack(V040_FRONT, bin_index=0, velocity=(-3.0, 0.0))
    # f684: the half holding GID 1 is no longer a fresh detection.
    front.observation_kind = "prediction"
    front.consecutive_invisible_count = 1

    for frame_idx in (681, 682, 683, 684):
        manager._match_same_camera_duplicate(
            "cam1", 6, rear, {"cam1": {6: rear, 7: front}}, frame_idx
        )

    assert manager.get_global_id("cam1", 6) == 1
    assert manager._next_global_id == 1

    assert manager.get_global_id("cam1", 6) == 1
    assert manager._next_global_id == 1


# --------------------------------------------------------------------------
# V060: xe DO VAO o ben canh khong duoc token cua o kia giu
# --------------------------------------------------------------------------
def load_slots() -> dict[str, tuple[np.ndarray, tuple[float, float]]]:
    path = RUN / "techgar_config" / "parking_slots_cam1.json"
    if not path.is_file():
        pytest.skip(f"missing calibration fixture: {path}")
    parsed = json.loads(path.read_text(encoding="utf-8"))
    slots = {}
    for slot in parsed["slots"]:
        polygon = np.array(
            [[float(point["x"]), float(point["y"])] for point in slot["polygon"]],
            dtype=np.float32,
        )
        center = (float(slot["center"]["x"]), float(slot["center"]["y"]))
        slots[slot["id"]] = (polygon, center)
    return slots


def binder_with_slots(slots, **kwargs) -> SlotVehicleBinder:
    binder = SlotVehicleBinder(policy="vision_primary", **kwargs)
    for slot_id, (polygon, center) in slots.items():
        binder._bindings[slot_id] = SlotBinding(
            slot_id=slot_id, camera_id="cam1", polygon=polygon, center=center
        )
    return binder


def test_v060_arrival_next_door_is_not_held_by_the_neighbour_token():
    slots = load_slots()
    binder = binder_with_slots(slots)
    polygon_s056, center_s056 = slots["S056"]

    # local cam1#82 was born at (619,675) and never entered S056.
    born_at = (619.0, 675.0)
    for point in ((619.0, 675.0), (582.0, 647.0), (584.0, 633.0), (585.0, 608.0)):
        assert binder._token_is_foreign_to_point(
            point,
            "S056",
            "cam1",
            polygon_s056,
            center_s056,
            first_point=born_at,
        ) is True


def test_real_departure_from_the_slot_still_keeps_the_token():
    slots = load_slots()
    binder = binder_with_slots(slots)
    polygon_s056, center_s056 = slots["S056"]

    # A car that really leaves S056 is born inside that slot, so it keeps the
    # token even after it has driven past the neighbouring bay.
    born_inside = (668.0, 596.0)
    for point in ((740.0, 596.0), (700.0, 596.0), (640.0, 640.0)):
        assert binder._token_is_foreign_to_point(
            point,
            "S056",
            "cam1",
            polygon_s056,
            center_s056,
            first_point=born_inside,
        ) is False


def test_fragment_inside_its_own_slot_is_never_foreign():
    slots = load_slots()
    binder = binder_with_slots(slots)
    polygon_s054, center_s054 = slots["S054"]
    assert binder._token_is_foreign_to_point(
        (586.0, 596.0), "S054", "cam1", polygon_s054, center_s054
    ) is False


def test_legacy_flag_restores_foreign_slot_capture():
    slots = load_slots()
    binder = binder_with_slots(slots, token_foreign_slot_guard=False)
    polygon_s056, center_s056 = slots["S056"]
    assert binder._token_is_foreign_to_point(
        (584.0, 633.0),
        "S056",
        "cam1",
        polygon_s056,
        center_s056,
        first_point=(619.0, 675.0),
    ) is False
