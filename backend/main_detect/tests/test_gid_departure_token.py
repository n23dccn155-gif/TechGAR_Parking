"""Global-ID continuity regressions for the departure-token mechanism.

Covers the verified defect episodes:

* live15 E01/D01 - a slow departure lost its token at the flat 5 s TTL while
  a protected candidate was still accumulating evidence.
* hiep2 P0 - the 0.75 s predeparture guard cancelled protection before the
  >=1 s vision-empty verdict could land, leaving the departing fragment
  unprotected while the slot was still reserved.
* Evidence migration stalls when several dead fragments could continue into
  the same live key; the binder must rank them instead of resetting.
"""

from types import SimpleNamespace

import numpy as np
import pytest

from techgar.slot_vehicle_binder import SlotVehicleBinder, VehicleParkingState


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
    """Same construction pattern as test_slot_vehicle_binder."""
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


def confirm_departure(binder, result, frame, timestamp):
    """Two raw empty samples; the second confirms the departure token."""
    result.occupied = False
    binder.update_vision([result], frame, timestamp, camera_id="cam1")
    binder.update_vision([result], frame + 1, timestamp + 0.1, camera_id="cam1")
    return frame + 2, timestamp + 0.1


def _events(binder, event_type):
    return [event for event in binder.events if event["type"] == event_type]


def test_confirmed_token_extends_while_candidate_keeps_fresh_evidence():
    """live15/E01: slow departure must not lose the token at the flat TTL."""
    binder, result, frame, timestamp, descriptor = parked_binder()
    frame, timestamp = confirm_departure(binder, result, frame, timestamp)
    token_created = binder.export_recovery_tokens(timestamp)[0]["created_at_s"]

    batch = None
    t = timestamp
    f = frame
    y = 30.0
    # Sparse fragments: each >0.5 s gap resets the unqualified evidence, but
    # the fragment stays fresh at every cleanup, so the token must extend
    # rather than expire at created_at + retention.
    while t <= token_created + 5.4:
        t += 0.6
        f += 18
        y += 1.0
        batch = binder.batch_recover_ids(
            {58: track(y=y, appearance=descriptor)},
            f,
            t,
            camera_id="cam1",
        )

    assert batch is not None and batch.recovered_ids == {}
    exported = binder.export_recovery_tokens(t)
    assert exported and exported[0]["global_id"] == 30
    assert _events(binder, "departure_token_retention_extended")
    assert not _events(binder, "parked_id_recovery_expired")

    # Once the car finally produces contiguous outward evidence the parked
    # GID is recovered well after the original 5 s expiry.
    recovered = {}
    for _ in range(3):
        t += 0.05
        f += 2
        y += 3.0
        batch = binder.batch_recover_ids(
            {58: track(y=y, appearance=descriptor)},
            f,
            t,
            camera_id="cam1",
        )
        recovered.update(batch.recovered_ids)
    assert recovered == {58: 30}
    assert _events(binder, "parked_id_recovered")


def test_retention_extension_is_capped_and_stalled_token_expires():
    """Extensions are incremental but bounded by a hard deadline."""
    binder, result, frame, timestamp, descriptor = parked_binder(
        recovery_extension_seconds=3.0,
    )
    frame, timestamp = confirm_departure(binder, result, frame, timestamp)
    token_created = binder.export_recovery_tokens(timestamp)[0]["created_at_s"]
    deadline = (
        token_created
        + binder.recovery_retention_seconds
        + binder.recovery_extension_seconds
    )

    t = timestamp
    f = frame
    y = 30.0
    while t <= deadline + 1.0:
        t += 0.6
        f += 18
        y += 1.0
        binder.batch_recover_ids(
            {58: track(y=y, appearance=descriptor)},
            f,
            t,
            camera_id="cam1",
        )

    assert binder.export_recovery_tokens(deadline + 1.0) == []
    expired = _events(binder, "parked_id_recovery_expired")
    assert expired and expired[-1]["global_id"] == 30
    extended = _events(binder, "departure_token_retention_extended")
    assert extended
    # The token survived beyond the plain retention TTL but the incremental
    # extension never pushed expiry past the configured hard deadline.
    assert extended[-1]["expires_at_s"] <= deadline + 1e-6


def test_unconfirmed_token_survives_ttl_when_candidate_only_needs_verdict():
    """The only blocker is ``departure_not_yet_confirmed``: keep the token."""
    binder, result, frame, timestamp, descriptor = parked_binder()
    result.occupied = False
    binder.update_vision([result], frame, timestamp, camera_id="cam1")
    token_created = binder.export_recovery_tokens(timestamp)[0]["created_at_s"]

    batch = None
    for offset, y in enumerate((30, 33, 36), start=1):
        batch = binder.batch_recover_ids(
            {58: track(y=y, appearance=descriptor)},
            frame + offset,
            timestamp + offset * 0.04,
            camera_id="cam1",
        )
    assert batch.diagnostics[58]["reason"] == "departure_not_yet_confirmed"

    # The second empty sample is delayed past the flat 5 s TTL; the qualified
    # fragment keeps being re-observed about once a second.
    t = timestamp + 0.12
    f = frame + 3
    y = 40.0
    while t <= token_created + 5.4:
        t += 1.0
        f += 30
        y += 1.0
        binder.batch_recover_ids(
            {58: track(y=y, appearance=descriptor)},
            f,
            t,
            camera_id="cam1",
        )

    # The confirming empty verdict finally lands and recovery succeeds even
    # though the original expiry is long past.
    binder.update_vision([result], f + 1, t + 0.1, camera_id="cam1")
    batch = binder.batch_recover_ids(
        {58: track(y=y + 3.0, appearance=descriptor)},
        f + 2,
        t + 0.15,
        camera_id="cam1",
    )

    assert batch.recovered_ids == {58: 30}
    assert _events(binder, "departure_token_retention_extended")
    assert not _events(binder, "parked_id_recovery_expired")
    assert _events(binder, "parked_id_recovered")


def test_confirmed_token_without_live_candidates_still_expires_on_time():
    """No live evidence -> ordinary retention expiry is unchanged."""
    binder, result, frame, timestamp, _ = parked_binder()
    frame, timestamp = confirm_departure(binder, result, frame, timestamp)
    token_created = binder.export_recovery_tokens(timestamp)[0]["created_at_s"]

    assert binder.export_recovery_tokens(token_created + 4.9)
    assert binder.export_recovery_tokens(token_created + 5.05) == []
    expired = _events(binder, "parked_id_recovery_expired")
    assert expired
    assert expired[-1]["global_id"] == 30
    assert expired[-1]["retained_in_global_gallery"] is True
    assert not _events(binder, "departure_token_retention_extended")


def test_predeparture_guard_holds_until_vision_verdict_when_candidate_recent():
    """hiep2/P0: a 0.75 s guard must not cancel while the >=1 s vision-empty
    verdict is still pending and a fragment tracked the departee inside the
    verdict window."""
    binder = SlotVehicleBinder(
        policy="vision_primary",
        predeparture_guard_seconds=0.75,
        false_empty_grace_seconds=1.25,
    )
    result = slot_result(occupied=True)
    binder.update_vision([result], 0, 0.0, camera_id="cam1")
    state = binder._vehicle_states.setdefault(2, VehicleParkingState(global_id=2))
    state.last_bbox = (20, 20, 60, 60)
    binder._bind_vehicle(2, "P001", 1, 0.8, 1000)

    protected = binder.prepare_predeparture_tokens(
        {("cam1", 7): track(x=20)}, 1.0, camera_id="cam1"
    )
    assert protected == {("cam1", 7)}

    # The fragment vanishes.  At +0.9 s the raw guard TTL has elapsed, but
    # vision still reports the slot occupied and the token was refreshed by
    # the departee less than the verdict window ago.
    binder.update_tracks({}, 2, 1.9, camera_id="cam1")
    tokens = binder.export_recovery_tokens(1.9)
    assert tokens and tokens[0]["global_id"] == 2
    assert not any(
        event.get("reason") == "predeparture_guard_expired"
        for event in binder.events
    )

    # The verdict lands on its own schedule; protection bridges the gap.
    result.occupied = False
    binder.update_vision([result], 3, 2.05, camera_id="cam1")
    binder.update_vision([result], 4, 2.15, camera_id="cam1")
    confirmed = binder.export_recovery_tokens(2.2)
    assert confirmed and confirmed[0]["confirmed_empty"] is True


def test_predeparture_guard_still_cancels_after_verdict_window():
    """Once the verdict window lapses with no candidate and no empty sample,
    the guard still removes a stale provisional token (fail closed)."""
    binder = SlotVehicleBinder(
        policy="vision_primary",
        predeparture_guard_seconds=0.75,
        false_empty_grace_seconds=1.25,
    )
    result = slot_result(occupied=True)
    binder.update_vision([result], 0, 0.0, camera_id="cam1")
    state = binder._vehicle_states.setdefault(2, VehicleParkingState(global_id=2))
    state.last_bbox = (20, 20, 60, 60)
    binder._bind_vehicle(2, "P001", 1, 0.8, 1000)

    binder.prepare_predeparture_tokens(
        {("cam1", 7): track(x=20)}, 1.0, camera_id="cam1"
    )

    # +1.4 s: beyond the verdict window, still no empty sample and no
    # candidate activity -> the noise token is collected as before.
    binder.update_tracks({}, 2, 2.4, camera_id="cam1")
    assert binder.export_recovery_tokens(2.4) == []
    cancelled = _events(binder, "departure_token_cancelled")
    assert cancelled and cancelled[-1]["reason"] == "predeparture_guard_expired"


def test_competing_dead_fragments_migrate_best_scored_continuation():
    """Two dead fragments could continue into the live key: rank them instead
    of stalling the evidence chain."""
    binder, result, frame, timestamp, descriptor = parked_binder()
    frame, timestamp = confirm_departure(binder, result, frame, timestamp)
    t = timestamp
    f = frame

    # Fragments 58 and 59 are tracked side by side; both drop in the same
    # frame, leaving two dead evidence chains behind.
    binder.batch_recover_ids(
        {
            58: track(y=30, appearance=descriptor),
            59: track(y=84, appearance=descriptor),
        },
        f + 1,
        t + 0.04,
        camera_id="cam1",
    )
    binder.batch_recover_ids(
        {
            58: track(y=33, appearance=descriptor),
            59: track(y=86, appearance=descriptor),
        },
        f + 2,
        t + 0.08,
        camera_id="cam1",
    )

    # The new live key sits near both dead fragments; 58 is by far the
    # closer continuation and its accumulated evidence transfers by rank.
    batch = binder.batch_recover_ids(
        {60: track(y=35, appearance=descriptor)},
        f + 3,
        t + 0.16,
        camera_id="cam1",
    )

    assert batch.recovered_ids == {60: 30}
    continued = _events(binder, "departure_candidate_fragment_continued")
    assert continued
    assert continued[-1]["previous_local_key"] == "58"
    assert continued[-1]["candidate_sources"] == 2


def test_tied_dead_fragments_keep_conservative_no_migration():
    """Equal continuation scores remain fail-closed: no transfer, evidence
    restarts on the live key instead of attaching a stale chain."""
    binder, result, frame, timestamp, descriptor = parked_binder()
    frame, timestamp = confirm_departure(binder, result, frame, timestamp)
    t = timestamp
    f = frame

    # Two fragments die together, equidistant to where the next live key
    # will surface.
    binder.batch_recover_ids(
        {
            58: track(y=30, appearance=descriptor),
            59: track(y=37, appearance=descriptor),
        },
        f + 1,
        t + 0.04,
        camera_id="cam1",
    )
    binder.batch_recover_ids(
        {
            58: track(y=33, appearance=descriptor),
            59: track(y=37, appearance=descriptor),
        },
        f + 2,
        t + 0.08,
        camera_id="cam1",
    )

    # (50, 95) is 2 px from both last centers; identical appearance means
    # the ranker cannot separate them, so the conservative path must hold
    # and the live key only ever accumulates its own evidence.
    first = binder.batch_recover_ids(
        {60: track(y=35, appearance=descriptor)},
        f + 3,
        t + 0.16,
        camera_id="cam1",
    )
    batch = binder.batch_recover_ids(
        {60: track(y=35, appearance=descriptor)},
        f + 4,
        t + 0.20,
        camera_id="cam1",
    )

    assert first.recovered_ids == {}
    assert batch.recovered_ids == {}
    assert batch.diagnostics[60]["reason"] == "insufficient_outward_evidence"
    assert batch.diagnostics[60]["evidence_frames"] == 2
    assert not _events(binder, "departure_candidate_fragment_continued")


def test_expiry_with_pending_candidate_emits_diagnostic():
    """A token that dies with retained mid-qualification evidence reports the
    candidate key and blocker for the registry."""
    binder, result, frame, timestamp, descriptor = parked_binder()
    frame, timestamp = confirm_departure(binder, result, frame, timestamp)
    token_created = binder.export_recovery_tokens(timestamp)[0]["created_at_s"]

    # One fragment inside the slot then lost: ``originated_in_slot`` keeps
    # its evidence alive for the full retention window, so it is still on
    # the token when the token expires.
    binder.batch_recover_ids(
        {58: track(y=20, appearance=descriptor)},
        frame + 1,
        timestamp + 0.05,
        camera_id="cam1",
    )

    binder.update_tracks({}, frame + 2, token_created + 5.05, camera_id="cam1")

    assert binder.export_recovery_tokens(token_created + 5.05) == []
    diagnostic = _events(
        binder, "departure_token_expired_with_pending_candidates"
    )
    assert diagnostic
    assert diagnostic[-1]["global_id"] == 30
    candidate_entries = diagnostic[-1]["candidates"]
    assert candidate_entries[0]["local_key"] == "58"
    assert "blocker" in candidate_entries[0]
    expired = _events(binder, "parked_id_recovery_expired")
    assert expired and expired[-1]["global_id"] == 30
    assert not _events(binder, "departure_token_retention_extended")
