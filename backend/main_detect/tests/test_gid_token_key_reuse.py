"""Regression (P16d / DIAG #4): a local track whose departure token expired
without recovering a GID must not be adopted again by another slot's token.

Verified episode (K4-P15a): ``cam1`` local 16 was held 388 frames with
``gid=None``: token S056 expired, then the same fragment became candidate of
the token for S073.  Each token stayed inside its own deadline, but the track
- a car merely driving down the aisle past parked slots - was reserved in
``protected_local_keys`` for the sum of them.  Real-world: any car passing a
row of just-departed slots would be starved of its Global ID.

``legacy_token_key_reuse=True`` restores the old behaviour.
"""

from test_gid_departure_token_distance import (
    SimpleNamespace,
    appearance,
    np,
    slot_result,
    track,
)

from techgar.slot_vehicle_binder import SlotVehicleBinder


def two_slot_binder(**kwargs):
    binder = SlotVehicleBinder(policy="vision_primary", stop_seconds=1.0, **kwargs)
    first = slot_result("P001", occupied=True, x=0)
    second = slot_result("P002", occupied=True, x=130)
    binder.update_vision([first, second], 0, 0.0, camera_id="cam1")
    descriptor = appearance()
    frame, timestamp = 1, 0.0
    while timestamp <= 1.2:
        binder.update_tracks(
            {
                30: track(appearance=descriptor),
                31: track(x=150, appearance=descriptor),
            },
            frame,
            timestamp,
            camera_id="cam1",
        )
        frame += 1
        timestamp += 1.0 / 30.0
    return binder, first, second, frame, timestamp, descriptor


def _open_token(binder, result, frame, timestamp):
    result.occupied = False
    binder.update_vision([result], frame, timestamp, camera_id="cam1")


def _abandon_first_token(binder, first, frame, timestamp, descriptor):
    _open_token(binder, first, frame, timestamp)
    token = binder._departure_tokens["P001"]
    t, f, y = timestamp, frame + 1, 30.0
    for _ in range(3):  # fragment starts inside the slot
        t += 0.1
        f += 3
        y += 2.0
        binder.batch_recover_ids({58: track(y=y, appearance=descriptor)}, f, t, camera_id="cam1")
    while "P001" in binder._departure_tokens and t < token.created_at_s + 30.0:
        t += 0.6
        f += 15
        y += 30.0
        binder.batch_recover_ids({58: track(y=y, appearance=descriptor)}, f, t, camera_id="cam1")
    assert "P001" not in binder._departure_tokens, "fixture: token phai het han"
    return t, f


def _adopted_by_second(binder, second, t, f, descriptor):
    _open_token(binder, second, f + 1, t + 0.05)
    token = binder._departure_tokens["P002"]
    f += 20
    t += 0.2
    # the same aisle fragment now passes right next to P002
    binder.batch_recover_ids({58: track(x=130, y=30.0, appearance=descriptor)}, f, t, camera_id="cam1")
    return 58 in token.candidates


def test_expired_fragment_is_not_readopted_by_another_token():
    binder, first, second, frame, timestamp, descriptor = two_slot_binder()
    t, f = _abandon_first_token(binder, first, frame, timestamp, descriptor)
    assert not _adopted_by_second(binder, second, t, f, descriptor)


def test_legacy_flag_allows_readoption():
    binder, first, second, frame, timestamp, descriptor = two_slot_binder(
        legacy_token_key_reuse=True
    )
    t, f = _abandon_first_token(binder, first, frame, timestamp, descriptor)
    assert _adopted_by_second(binder, second, t, f, descriptor)
