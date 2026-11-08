"""Regression: a departure token must not be kept alive by a track that has
already left the slot far beyond the recovery gate.

Verified defect episode (P16 DIAG, run ``20261103-123426_K2-P15a``):

* The token for slot ``S061`` stayed alive for **387 frames / 15.5 s** while
  the fragment it protected (``cam2`` local 7) had travelled **466 px** - by
  then it was the *next* car driving across the lot, not the vehicle that
  left the slot.
* ``protected_local_keys`` therefore reserved a moving track for the whole
  window.  ``two_camera.py:2772`` forwards that set to
  ``CrossCameraManager.update_all_tracks``, where a reserved key is excluded
  from every Global-ID assignment path (``cross_camera_manager.py:8168/8177``)
  -> ``canonical_gid=None`` -> the tracker's GID broke (L3) and the gate
  counter saw no crossing.

Root cause: ``_token_extension_blocker`` treated *any* recently observed
candidate as ``fresh_evidence``.  It never asked whether that candidate was
still anywhere near the slot, so the spatial gate that bounds candidate
matching (``token.slot_diagonal * recovery_max_expand_ratio``, see
``slot_vehicle_binder.py:2876``) was not applied to the extension decision.
A distant track kept the token - and the protected key - alive all the way
to the hard ``retention + extension`` deadline.

Fix under test: reuse the **same** bound (no new constant) so a candidate
further than ``slot_diagonal * recovery_max_expand_ratio`` from the slot
polygon can no longer justify an extension.
``legacy_departure_token_distance=True`` restores the old behaviour.
"""

from types import SimpleNamespace

import numpy as np

from techgar.slot_vehicle_binder import SlotVehicleBinder


def slot_result(slot_id="P001", occupied=False, x=0, y=0, size=100):
    return SimpleNamespace(
        slot_id=slot_id,
        occupied=occupied,
        polygon=np.asarray(
            [[x, y], [x + size, y], [x + size, y + size], [x, y + size]],
            dtype=np.int32,
        ),
        center=(x + size // 2, y + size // 2),
        vehicle_id=None,
    )


def track(x=20, y=20, w=60, h=60, appearance=None, **extra):
    return {"bbox": (x, y, w, h), "appearance": appearance, **extra}


def appearance(bin_index=0):
    histogram = np.zeros((16, 16), dtype=np.float32)
    histogram.flat[bin_index] = 1.0
    return histogram


def parked_binder(global_id=30, **binder_kwargs):
    binder = SlotVehicleBinder(
        policy="vision_primary",
        stop_seconds=1.0,
        **binder_kwargs,
    )
    result = slot_result(occupied=True)
    binder.update_vision([result], 0, 0.0, camera_id="cam1")
    frame = 1
    timestamp = 0.0
    descriptor = appearance()
    while timestamp <= 1.2:
        binder.update_tracks(
            {global_id: track(appearance=descriptor)},
            frame,
            timestamp,
            camera_id="cam1",
        )
        frame += 1
        timestamp += 1.0 / 30.0
    assert binder.get_slot_state("P001")["vehicle_id"] == global_id
    return binder, result, frame, timestamp, descriptor


def unconfirmed_token(binder_kwargs=None):
    """Token left with only ONE empty vision sample -> ``confirmed_empty=False``.

    This is the state the real K2 token was in: the slot was re-occupied
    before vision could deliver its second empty sample, so the token could
    never be confirmed and ``confirmed_empty`` stayed False for its whole
    life.  That is precisely the state in which the unbounded extension
    fires (``departure_not_yet_confirmed``).
    """
    binder, result, frame, timestamp, descriptor = parked_binder(
        **(binder_kwargs or {})
    )
    result.occupied = False
    binder.update_vision([result], frame, timestamp, camera_id="cam1")
    frame += 1
    timestamp += 0.05
    token = binder._departure_tokens["P001"]
    assert token.confirmed_empty is False
    return binder, frame, timestamp, descriptor, token


def _events(binder, event_type):
    return [event for event in binder.events if event["type"] == event_type]


def _creep_out_of_slot(binder, descriptor, frame, timestamp, *, steps=3):
    """Move a fragment from inside the slot outward but still inside the gate.

    Realistic approach: a real departure *starts* inside the slot and only
    then drives away.  A fragment that is already far away on its first
    observation is simply never accepted as a candidate
    (``slot_vehicle_binder.py:2988``), so it cannot reproduce the defect.
    """
    t, f = timestamp, frame
    y = 30.0
    for _ in range(steps):
        t += 0.1
        f += 3
        y += 2.0
        binder.batch_recover_ids(
            {58: track(y=y, appearance=descriptor)},
            f,
            t,
            camera_id="cam1",
        )
    return t, f, y


def _drive_away(binder, descriptor, token, max_radius, t, f, y, *,
                stop_at_s=9.0, step_px=30.0):
    """Drive the fragment far past the gate, sampling once per 0.6 s.

    Yields ``(t, f, y, batch, distance, blocker)`` so each test can assert on
    the aspect it cares about.
    """
    while t <= token.created_at_s + stop_at_s:
        t += 0.6
        f += 15
        y += step_px
        batch = binder.batch_recover_ids(
            {58: track(y=y, appearance=descriptor)},
            f,
            t,
            camera_id="cam1",
        )
        distance = binder._signed_polygon_distance((50.0, y), token.polygon)
        blocker = binder._token_extension_blocker(token, t)
        yield t, f, y, batch, distance, blocker


def test_far_track_cannot_extend_token_beyond_recovery_gate():
    """The K2 defect: a fragment that started near the slot kept the token
    alive long after it had driven far beyond the recovery gate."""
    binder, frame, timestamp, descriptor, token = unconfirmed_token()
    max_radius = token.slot_diagonal * binder.recovery_max_expand_ratio

    t, f, y = _creep_out_of_slot(binder, descriptor, frame, timestamp)
    # Phase 1 legitimately sits inside the gate.
    assert binder._signed_polygon_distance((50.0, y), token.polygon) > -max_radius

    far_seen = False
    for t, f, y, _batch, distance, blocker in _drive_away(
        binder, descriptor, token, max_radius, t, f, y
    ):
        if distance < -max_radius:
            far_seen = True
            # A fragment beyond the gate must stop justifying an extension.
            assert blocker is None, (
                f"token van duoc gia han boi track da roi o: "
                f"y={y:.0f} cach mep o {abs(distance):.0f} px (nguong {max_radius:.0f})"
            )
    assert far_seen, "fixture phai co luc fragment ra ngoai nguong"


def test_far_track_does_not_hold_protected_local_key():
    """The same defect seen through ``batch_recover_ids.protected_local_keys``.

    That set is what ``two_camera.py:2772`` forwards to
    ``CrossCameraManager.update_all_tracks``, where a reserved key is excluded
    from every Global-ID assignment path (``cross_camera_manager.py:8168/8177``)
    - a reserved *moving* track is the L3 track break.

    What the fix guarantees is that a fragment beyond the gate can no longer
    keep the token (and therefore its reservation) alive past the ordinary
    retention deadline.  While the token is still inside its normal retention
    window the key stays reserved by design - that is the slow-departure
    protection from live15/E01 - so the assertion is anchored at the TTL.
    """
    binder, frame, timestamp, descriptor, token = unconfirmed_token()
    max_radius = token.slot_diagonal * binder.recovery_max_expand_ratio
    ttl = token.created_at_s + binder.recovery_retention_seconds

    t, f, y = _creep_out_of_slot(binder, descriptor, frame, timestamp)

    protected_past_ttl = set()
    far_samples = 0
    for t, f, y, batch, distance, _blocker in _drive_away(
        binder, descriptor, token, max_radius, t, f, y, stop_at_s=9.0
    ):
        if distance < -max_radius:
            far_samples += 1
        if t > ttl:
            protected_past_ttl |= set(batch.protected_local_keys)

    assert far_samples > 0, "fixture phai co mau fragment ra ngoai nguong"
    # Past the flat TTL a beyond-the-gate fragment must not be reserved any
    # more: reserving it is what starved the moving car of its Global ID.
    assert protected_past_ttl == set(), (
        f"qua TTL ma track ngoai nguong van bi giu: {protected_past_ttl}"
    )
    assert binder._departure_tokens.get("P001") is None
    assert _events(binder, "parked_id_recovery_expired")


def test_near_track_still_extends_token():
    """Negative control: a slow departure still near the slot keeps its token.

    Mirrors ``test_confirmed_token_extends_while_candidate_keeps_fresh_evidence``
    in ``test_gid_departure_token.py`` - the live15/E01 and hiep2/P0
    behaviour that must NOT regress.
    """
    binder, frame, timestamp, descriptor, token = unconfirmed_token()
    max_radius = token.slot_diagonal * binder.recovery_max_expand_ratio

    t, f = timestamp, frame
    y = 30.0
    extensions = 0
    while t <= token.created_at_s + 5.4:
        t += 0.6
        f += 18
        y += 1.0
        binder.batch_recover_ids(
            {58: track(y=y, appearance=descriptor)},
            f,
            t,
            camera_id="cam1",
        )
        if binder._token_extension_blocker(token, t) is not None:
            extensions += 1
    # The fragment never left the gate, so it still justifies the extension.
    assert binder._signed_polygon_distance((50.0, y), token.polygon) > -max_radius
    assert extensions > 0
    assert binder.export_recovery_tokens(t)
    assert _events(binder, "departure_token_retention_extended")


def test_legacy_flag_restores_old_unbounded_behaviour():
    """``legacy_departure_token_distance=True`` keeps the pre-fix behaviour.

    With the flag a distant fragment still counts as fresh evidence, so the
    token is extended (the defect).  Documents the escape hatch required by
    SPEC_P16 R6.
    """
    binder, frame, timestamp, descriptor, token = unconfirmed_token(
        {"legacy_departure_token_distance": True}
    )
    max_radius = token.slot_diagonal * binder.recovery_max_expand_ratio

    t, f, y = _creep_out_of_slot(binder, descriptor, frame, timestamp)

    far_extensions = 0
    for _t, _f, _y, _batch, distance, blocker in _drive_away(
        binder, descriptor, token, max_radius, t, f, y
    ):
        if distance < -max_radius and blocker is not None:
            far_extensions += 1

    assert far_extensions > 0, (
        "co legacy flag thi track ngoai nguong VAN phai gia han token "
        "(day la hanh vi cu duoc giu lai)"
    )
