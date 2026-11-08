"""Regression (P18a / L-A): a departure token must not "continue" onto a fragment
that is far from the slot while the token's owner is **still parked**.

Verified episode (K2-P15a, GT V003 entering): V002 had just parked in ``S061``.
``prepare_predeparture_tokens`` opened a provisional token on its own static
fragment (cam2 local 4).  Local 4 died and the token then "continued" onto
local 6 -> 5 -> 7 - the fragments of **V003**, a different car driving in about
190 px away - because ``batch_recover_ids`` accepts a continuation up to
``2.25 x slot_diagonal`` from the dead fragment when the only live key in range
is the candidate (``slot_vehicle_binder.py`` fragment-continuation block).
The migrated key joined ``protected_local_keys``; ``CrossCameraManager`` excluded
it from every Global-ID path, so V003 had no GID for 143 frames and the gate
counter never saw it enter.

Fix under test: while the owner is still parked (vision occupied, bound to the
token's GID) a **provisional** (not ``qualified_predeparture``) token only
continues within ``continuation_limit`` (0.35 x diagonal).
``legacy_token_continuation_range=True`` restores the old range.
"""

from test_gid_departure_token_distance import (
    appearance,
    parked_binder,
    track,
)


def _token_with_static_fragment(**binder_kwargs):
    binder, _result, frame, timestamp, descriptor = parked_binder(**binder_kwargs)
    # A static unbound fragment sits on the parked car: prepare_predeparture_tokens
    # opens the provisional token and protects it (this is K2 frame 556).
    protected = binder.prepare_predeparture_tokens(
        {4: track(appearance=descriptor)}, timestamp, camera_id="cam1"
    )
    assert 4 in protected
    token = binder._departure_tokens["P001"]
    assert token.predeparture and not token.confirmed_empty
    # The fragment is observed a few times so the token holds evidence for it.
    for _ in range(4):
        timestamp += 0.1
        frame += 3
        binder.batch_recover_ids(
            {4: track(appearance=descriptor)}, frame, timestamp, camera_id="cam1"
        )
    assert 4 in token.candidates, "fixture: fragment 4 phai la ung vien cua token"
    return binder, token, frame, timestamp, descriptor


def _far_fragment_appears(binder, frame, timestamp, descriptor):
    """Fragment 4 disappears; a *different* car shows up ~190 px away (K2 local 7)."""
    timestamp += 0.1
    frame += 3
    return binder.batch_recover_ids(
        {7: track(x=190, y=20, appearance=descriptor)},
        frame,
        timestamp,
        camera_id="cam1",
    )


def test_far_fragment_is_not_adopted_while_owner_still_parked():
    binder, token, frame, timestamp, descriptor = _token_with_static_fragment()
    result = _far_fragment_appears(binder, frame, timestamp, descriptor)
    assert 7 not in token.candidates
    assert 7 not in result.protected_local_keys


def test_legacy_flag_restores_the_old_continuation_range():
    binder, token, frame, timestamp, descriptor = _token_with_static_fragment(
        legacy_token_continuation_range=True
    )
    result = _far_fragment_appears(binder, frame, timestamp, descriptor)
    assert 7 in token.candidates
    assert 7 in result.protected_local_keys


def test_close_fragment_still_continues_while_owner_parked():
    """A fragment born right next to the dead one is still the same car."""
    binder, token, frame, timestamp, descriptor = _token_with_static_fragment()
    timestamp += 0.1
    frame += 3
    binder.batch_recover_ids(
        {8: track(x=24, y=20, appearance=descriptor)},
        frame,
        timestamp,
        camera_id="cam1",
    )
    assert 8 in token.candidates
