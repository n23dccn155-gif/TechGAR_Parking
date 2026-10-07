"""Stationary re-acquisition regressions (F0-c).

Bug under test (SPEC.md section 1-2, verify_cur_session_hiep_sang8 f600):

A parked, stationary car loses its local track (motion tracker drops a
non-moving object).  When the detector re-fires at the same spot, the
dormant/world-trajectory ReID gates reject the old GID -- for a vehicle
that never moved ``direction ~= 0`` and ``time_topology = 0`` keep the
trajectory score below ``match_threshold`` (0.78) even though
``world_distance`` (~1 px) and ``appearance`` (~0.83) strongly support
reuse.  The allocator then mints a duplicate Global ID for the same
physical car.

The two positive tests reproduce the failure through the real
``CrossCameraManager`` API and must FAIL on the unfixed code with a
message containing ``expected: reuse gid1``.  Three negative tests pin
down the desired *guards* (never steal / defer instead of guessing); two
are expected to PASS today, one (``two_equally_strong_candidates``)
currently FAILS as a second signature of the same defect class -- see
F0-c-tests.md.

F1 placeholders (flag-off equivalence + event-logging contract) live at
the bottom of the file and stay skipped until F2 lands the flag; their
assumed API names are written down so the implementation can map to them.
"""

import inspect
from dataclasses import dataclass

import numpy as np
import pytest

from techgar.cross_camera_manager import CrossCameraManager
from techgar.tracklet_descriptor import AppearanceTracklet


@dataclass
class DummyTrack:
    cx: int
    cy: int
    w: int = 42
    h: int = 24
    history: list = None
    status: str = "confirmed"
    appearance: object = None
    fragment_visible_count: int = None

    def __post_init__(self):
        if self.history is None:
            self.history = [(self.cx, self.cy)]
        if self.appearance is None:
            self.appearance = np.ones((16, 16), dtype=np.float32)

    @property
    def x(self):
        return self.cx - self.w // 2

    @property
    def y(self):
        return self.cy - self.h


def make_manager(**extra_kwargs):
    # cam2 pixels are translated +500 x into the shared world, so
    # cam2 x=60 <-> world x=560 sits inside the cam1<->cam2 overlap
    # polygon (x in [500, 640]).  match_distance=15 -> the calibrated
    # cross-camera duplicate window is 9.0 world px.
    return CrossCameraManager(
        camera_sizes={"cam1": (640, 480), "cam2": (640, 480)},
        camera_crops={"cam1": (0, 0, 640, 480), "cam2": (0, 0, 640, 480)},
        camera_transforms={
            "cam1": np.eye(3),
            "cam2": np.array(
                [[1.0, 0.0, 500.0], [0.0, 1.0, 0.0], [0.0, 0.0, 1.0]]
            ),
        },
        edge_adjacency={("cam1", "right"): "cam2", ("cam2", "left"): "cam1"},
        overlap_regions={
            ("cam1", "cam2"): np.array(
                [[500, 0], [640, 0], [640, 480], [500, 480]],
                dtype=np.float32,
            )
        },
        match_distance=15.0,
        lookahead_frames=16,
        prediction_radius=90,
        appearance_threshold=0.45,
        min_direction_cosine=0.25,
        **extra_kwargs,
    )


def one_hot_histogram(bin_index: int) -> np.ndarray:
    histogram = np.zeros((16, 16), dtype=np.float32)
    histogram.flat[bin_index] = 1.0
    return histogram


def attach_tracklet(track, *histograms):
    descriptor = AppearanceTracklet(max_samples=8, sample_interval=1)
    for frame_idx, histogram in enumerate(histograms, start=1):
        descriptor.update(histogram, frame_idx)
    track.appearance_tracklet = descriptor
    return track


def parked_track(cx, cy, histogram, *, visible_count=8, w=42, h=24):
    """A stationary-car track: real history tail but ~no real movement."""
    return attach_tracklet(
        DummyTrack(
            cx,
            cy,
            w=w,
            h=h,
            appearance=histogram,
            history=[(cx - 2, cy), (cx - 1, cy), (cx, cy)],
            fragment_visible_count=visible_count,
        ),
        histogram,
        histogram,
    )


def moving_track(cx, cy, histogram, *, visible_count=8):
    """A car that was genuinely moving: the history tail carries real
    velocity so ``velocity_world_per_second`` / tail-span gates see a
    moving identity, not a parked one."""
    return attach_tracklet(
        DummyTrack(
            cx,
            cy,
            appearance=histogram,
            history=[(cx - 24, cy), (cx - 12, cy), (cx, cy)],
            fragment_visible_count=visible_count,
        ),
        histogram,
        histogram,
    )


# --- assumed F2 flag -------------------------------------------------------
# ``enable_stationary_reacquire`` is the name the design (F1-design §7) and
# F0-SUMMARY §5 propose; the probe below lets every flag-on contract test
# self-activate the moment the ctor accepts it -- no second edit needed.
_HAS_STATIONARY_FLAG = "enable_stationary_reacquire" in inspect.signature(
    CrossCameraManager.__init__
).parameters


def make_manager_flagged(**extra_kwargs):
    """Manager with the stationary-reacquire branch ON when implemented.

    Before F2 this falls back to the unflagged manager, so the positive
    tests keep FAILing (documenting the bug) and flip to PASS once the
    branch exists.
    """
    if _HAS_STATIONARY_FLAG:
        extra_kwargs.setdefault("enable_stationary_reacquire", True)
    return make_manager(**extra_kwargs)


def _recent_events(manager):
    return manager.to_json({})["recent_events"]


def _feed(manager, tracks_per_cam, frame_idx, t_s):
    return manager.update_all_tracks(
        tracks_per_cam, frame_idx, {cam: t_s for cam in tracks_per_cam}
    )


def _rejections_for(manager, cam_id, local_id):
    """Collect every recorded veto that kept (cam_id, local_id) from its
    incumbent gid: dormant-pass rejections plus the world-trajectory
    rejection list embedded in the fresh gid's creation event."""
    out = []
    for event in _recent_events(manager):
        if event["type"] == "dormant_reid_rejected" and (
            event.get("target_camera") == cam_id
            and event.get("target_local_id") == local_id
        ):
            out.append(
                f"dormant:{event['type']}"
                f"(gid={event.get('global_id')},"
                f"reason={event.get('reason')})"
            )
        elif event["type"] == "global_id_created" and (
            event.get("camera") == cam_id
            and event.get("local_track_id") == local_id
        ):
            out.extend(event.get("world_trajectory_rejections") or [])
    return out


def _seed_dormant_gid1(manager, histogram):
    """Park a car on cam2 -> gid1, then let its track die (car stays put)."""
    last_track = None
    for frame_idx in range(1, 7):
        last_track = parked_track(60, 120, histogram)
        gid = _feed(
            manager, {"cam2": {35: last_track}}, frame_idx, frame_idx * 0.04
        )["cam2"][35]
    assert gid == 1
    # The car never moved; the tracker drops it.  gid1 goes dormant with
    # its cam2 gallery and world anchor intact (handoff state is the same
    # dormant-pool member once the opened edge handoff is still pending).
    manager.notify_track_lost("cam2", 35, last_track, 8, 0.32)
    manager.notify_track_expired(
        "cam2", 35, 60, 120, 42, 24, histogram, 12, 0.48,
        appearance_tracklet=last_track.appearance_tracklet,
    )
    assert manager._identities[1].state in {"dormant", "handoff"}
    return manager._identities[1].state


def test_stationary_car_reacquired_after_track_death_reuses_gid():
    """sang8 f600 faithful replay (dormant owner, same-camera re-fire).

    cam2 lid35 parked the car -> gid1.  The stationary car produces no
    motion so the track dies (lost -> expired).  ~334 frames / 13.7 s
    later the detector fires again 2 world-px from the last anchor with
    identical appearance (sang8 numbers: last cam2 sighting f266,
    re-detection f600 @25 fps -> 13.4 s > 12 s moving-retention window).
    Correct behaviour: reuse gid1.  Current behaviour: ``same_camera_stale``
    vetoes the dormant pass and the trajectory score of a never-moving car
    can never reach 0.78, so a fresh GID is minted -- the sang8 defect.

    Uses ``make_manager_flagged`` so the test flips to PASS once
    ``enable_stationary_reacquire`` exists and is switched on.
    """
    manager = make_manager_flagged()
    histogram = one_hot_histogram(0)
    _seed_dormant_gid1(manager, histogram)

    # ~13.7 s gap: past the 12 s same-camera moving-retention window, so
    # the re-fire hits exactly the sang8 ``same_camera_stale`` rejection.
    for step in range(5):
        frame_idx = 400 + step
        fragment = parked_track(62, 120, histogram)
        _feed(manager, {"cam2": {40: fragment}}, frame_idx, 14.0 + step * 0.04)

    assigned = manager.get_global_id("cam2", 40)
    assert assigned == 1, (
        "expected: reuse gid1 -- stationary car re-acquired ~2 world-px "
        "from its dead track's anchor with matching appearance; "
        f"got global_id={assigned}; "
        f"rejections={_rejections_for(manager, 'cam2', 40)}"
    )


def test_stationary_reacquire_while_gid_live_on_other_camera_reuses_gid():
    """Brief scenario: gid1 stays registered/matched on cam1 while its
    dead cam2 view re-detects the same parked car (live-owner branch).

    cam2 lid35 parks -> gid1; a completed handoff binds cam1 lid10 to the
    same gid1 (models the f224 handoff_opened edge transfer); lid35 dies.
    gid1's identity stays active through the cam1 registration.  The new
    cam2 fragment projects ~3 world-px from the last anchor -- inside
    D_STAT of the live-member/distance gates of the new branch, while the
    current live-owner trajectory pass still vetoes silently.
    Correct: reuse gid1.  Current: new GID minted with NO logged
    rejection (the diagnostic gap recorded in F0-c-tests.md).
    """
    manager = make_manager_flagged()
    histogram = one_hot_histogram(0)
    last_cam2 = None
    for frame_idx in range(1, 7):
        last_cam2 = parked_track(60, 120, histogram)
        gid = _feed(
            manager, {"cam2": {35: last_cam2}}, frame_idx, frame_idx * 0.04
        )["cam2"][35]
    assert gid == 1

    # Completed handoff: gid1's cam1 member binds, then the cam2 view of
    # the same parked car dies.  Feeding lid10 *after* lid35's death makes
    # cam1 the identity's last-observed camera -- its last anchor sits at
    # world (560,120) while the re-fire lands at world ~(605,120).
    manager.bind_external_id("cam1", 10, 1, 7)
    assert manager.get_global_id("cam1", 10) == 1
    manager.notify_track_lost("cam2", 35, last_cam2, 8, 0.32)
    manager.notify_track_expired(
        "cam2", 35, 60, 120, 42, 24, histogram, 12, 0.48,
        appearance_tracklet=last_cam2.appearance_tracklet,
    )
    for frame_idx, t_s in ((9, 0.36), (10, 0.40), (11, 0.44)):
        _feed(
            manager, {"cam1": {10: parked_track(560, 120, histogram)}},
            frame_idx, t_s,
        )
    # lid10 stays bound but unobserved from here on, so no live-member
    # dedup or pending handoff can short-circuit the decision.

    # Re-detection on cam2 at world ~563 px: ~3 px from the identity
    # anchor -- inside the new branch's D_STAT core, and ~13.7 s elapsed
    # keeps every opened handoff (TTL 45f) expired so only the stationary
    # gates decide under flag-on.
    for step in range(5):
        frame_idx = 400 + step
        fragment = parked_track(63, 120, histogram)
        _feed(manager, {"cam2": {40: fragment}}, frame_idx, 14.0 + step * 0.04)

    assigned = manager.get_global_id("cam2", 40)
    assert assigned == 1, (
        "expected: reuse gid1 -- gid still registered via cam1 for the "
        "same parked car; the re-fired cam2 view must re-acquire it, not "
        f"mint a duplicate; got global_id={assigned}; "
        f"rejections={_rejections_for(manager, 'cam2', 40)}"
    )


def test_two_equally_strong_candidates_must_defer_or_mint():
    """Negative guard (i): two dormant identities both strong -> no steal.

    gid1 parked at cam2 (60,120), gid2 parked at cam2 (140,120), identical
    appearance.  A new fragment at (100,120) is equidistant to both.  The
    allocator must not hand it gid1 or gid2 -- either a new GID or a
    deferral (None) is acceptable; a wrong steal is not.

    NOTE: currently FAILS -- the first frame defers with
    ``dormant_reid_ambiguous`` but the next frame still resolves to a
    steal (``dormant_global_id_recovered``).  Second signature of the
    same defect class; must pass once the margin guard lands
    (``make_manager_flagged`` auto-enables it under F2).
    """
    manager = make_manager_flagged()
    histogram = one_hot_histogram(0)

    t = 0.0
    lid35 = lid36 = None
    for frame_idx in range(1, 7):
        t += 0.04
        lid35 = parked_track(60, 120, histogram)
        lid36 = parked_track(140, 120, histogram)
        ids = _feed(
            manager, {"cam2": {35: lid35, 36: lid36}}, frame_idx, t
        )["cam2"]
    assert ids[35] == 1 and ids[36] == 2

    manager.notify_track_lost("cam2", 35, lid35, 8, t + 0.04)
    manager.notify_track_lost("cam2", 36, lid36, 8, t + 0.04)

    assigned = None
    for step in range(5):
        frame_idx = 300 + step
        fragment = parked_track(100, 120, histogram)
        _feed(manager, {"cam2": {40: fragment}}, frame_idx, 12.0 + step * 0.04)
        assigned = manager.get_global_id("cam2", 40)

    # Unbound (None, deferred) or a fresh GID are both correct; stealing
    # gid1 or gid2 on a coin-flip margin is the forbidden outcome.
    assert assigned not in (1, 2), (
        f"two equally strong candidates must defer or mint a new GID; "
        f"fragment was bound to gid={assigned}"
    )


def test_distant_car_does_not_steal_stationary_gid():
    """Negative guard (ii): different car far away -> no assignment."""
    manager = make_manager_flagged()
    histogram = one_hot_histogram(0)
    other_histogram = one_hot_histogram(9)

    last_track = None
    for frame_idx in range(1, 7):
        last_track = parked_track(60, 120, histogram)
        gid = _feed(
            manager, {"cam2": {35: last_track}}, frame_idx, frame_idx * 0.04
        )["cam2"][35]
    assert gid == 1
    manager.notify_track_lost("cam2", 35, last_track, 8, 0.32)

    # A different car parks 340 world-px away with different appearance.
    assigned = None
    for step in range(5):
        frame_idx = 300 + step
        fragment = parked_track(400, 120, other_histogram)
        _feed(manager, {"cam2": {40: fragment}}, frame_idx, 12.0 + step * 0.04)
        assigned = manager.get_global_id("cam2", 40)

    assert assigned != 1, (
        "a distant different car must never inherit the dormant gid1; "
        f"assigned={assigned}"
    )


def test_same_camera_live_owner_blocks_stationary_reacquire():
    """Negative guard (iii): gid1 is live-owned on the same camera by a
    confirmed member elsewhere -> the re-fired fragment must not take it.
    """
    manager = make_manager_flagged()
    histogram = one_hot_histogram(0)

    for frame_idx in range(1, 7):
        live = parked_track(60, 120, histogram)
        gid = _feed(
            manager, {"cam2": {35: live}}, frame_idx, frame_idx * 0.04
        )["cam2"][35]
    assert gid == 1

    # gid1's cam2 member is still alive; a second cam2 fragment appears
    # 340 world-px away with the same appearance.  same_camera_live_owner
    # must veto the assignment even though appearance matches.
    assigned = None
    for step in range(5):
        frame_idx = 10 + step
        fragment = parked_track(400, 120, histogram)
        live = parked_track(60, 120, histogram)
        _feed(
            manager,
            {"cam2": {35: live, 40: fragment}},
            frame_idx,
            0.4 + step * 0.04,
        )
        assigned = manager.get_global_id("cam2", 40)

    assert manager.get_global_id("cam2", 35) == 1
    assert assigned != 1, (
        "gid1 is live-owned on cam2 by lid35; a fragment elsewhere on the "
        f"same camera must not steal it; assigned={assigned}"
    )


# ---------------------------------------------------------------------------
# F1 placeholders -- flag-off equivalence + event-logging contract.
#
# ASSUMED API (to be mapped by F2; documented in F1-c-prep.md):
#   constructor flag : enable_stationary_reacquire: bool = False
#                      (same convention as ``use_deep_reid: bool = False``,
#                      cross_camera_manager.py ~L175; F0-SUMMARY section 5)
#   event names      : stationary_reacquire_accepted /
#                      stationary_reacquire_rejected /
#                      stationary_reacquire_deferred
#                      surfaced via manager.to_json({})["recent_events"]
# The skipif guards key off the constructor signature, so both tests switch
# themselves on automatically the moment F2 adds the flag.
# ---------------------------------------------------------------------------

_HAS_STATIONARY_FLAG = "enable_stationary_reacquire" in inspect.signature(
    CrossCameraManager.__init__
).parameters

_FLAG_MISSING_REASON = (
    "enable_stationary_reacquire chua ton tai trong ctor "
    "CrossCameraManager -- se bat khi F2 them flag"
)


@pytest.mark.skipif(not _HAS_STATIONARY_FLAG, reason=_FLAG_MISSING_REASON)
def test_flag_off_keeps_current_mint_new_gid_behaviour():
    """Flag-OFF equivalence: ``enable_stationary_reacquire=False`` must
    leave today's behaviour untouched -- the dormant same_camera_stale
    veto still fires, a duplicate gid is minted for the same parked car,
    and NO stationary_reacquire_* event is emitted.  This is the
    regression gate now that the F3 replay is cancelled."""
    manager = make_manager(enable_stationary_reacquire=False)
    histogram = one_hot_histogram(0)
    _seed_dormant_gid1(manager, histogram)
    for step in range(5):
        frame_idx = 400 + step
        fragment = parked_track(62, 120, histogram)
        _feed(manager, {"cam2": {40: fragment}}, frame_idx, 14.0 + step * 0.04)
    assigned = manager.get_global_id("cam2", 40)
    assert assigned is not None and assigned != 1, (
        "flag OFF must keep current behaviour (a fresh gid is minted for "
        f"the re-fired fragment); assigned={assigned}"
    )
    # Event-level equivalence: the same veto chain must still be recorded,
    # and the new branch must not leak any events while disabled.
    stale = [
        event
        for event in _recent_events(manager)
        if event["type"] == "dormant_reid_rejected"
        and event.get("reason") == "same_camera_stale"
        and event.get("target_local_id") == 40
    ]
    assert stale, (
        "flag OFF changed behaviour: the same_camera_stale veto for the "
        "re-fired fragment is no longer recorded"
    )
    leaked = [
        event["type"]
        for event in _recent_events(manager)
        if str(event["type"]).startswith("stationary_reacquire")
    ]
    assert not leaked, (
        f"flag OFF must not emit stationary_reacquire_* events; got {leaked}"
    )


@pytest.mark.skipif(not _HAS_STATIONARY_FLAG, reason=_FLAG_MISSING_REASON)
def test_flag_on_emits_stationary_reacquire_events():
    """Event-logging contract (F2): with the flag ON, the sang8 scenario
    must emit ``stationary_reacquire_accepted`` naming gid1 in the
    manager's recent-event log, and the fragment must reuse gid1.
    Rejected/deferred outcomes are expected to surface as the sibling
    ``stationary_reacquire_rejected`` / ``_deferred`` event types."""
    manager = make_manager(enable_stationary_reacquire=True)
    histogram = one_hot_histogram(0)
    _seed_dormant_gid1(manager, histogram)
    for step in range(5):
        frame_idx = 400 + step
        fragment = parked_track(62, 120, histogram)
        _feed(manager, {"cam2": {40: fragment}}, frame_idx, 14.0 + step * 0.04)
    events = _recent_events(manager)
    event_types = {event["type"] for event in events}
    accepted = [
        event
        for event in events
        if event["type"] == "stationary_reacquire_accepted"
    ]
    assert accepted and any(
        event.get("global_id") == 1 for event in accepted
    ), (
        "flag ON must emit stationary_reacquire_accepted for gid1; "
        f"event_types={sorted(event_types)}"
    )
    assert manager.get_global_id("cam2", 40) == 1, (
        "flag ON: the re-fired fragment must reuse gid1 after the "
        "accepted event"
    )


# ---------------------------------------------------------------------------
# F1 Phan 2 -- per-gate / per-guard contract tests (F1-design.md section 2-3).
# Every test here pins behaviour of the new _match_stationary_reacquire pass;
# all are skipif-gated on the flag existing in the ctor and self-activate
# when F2 lands it.
#
# Assumed design constants (F1-design section 4):
#   D_STAT_CORE = 3.0 wu, D_STAT = 5.0 wu, A_STAT sim >= 0.70,
#   S_STAT <= 0.90, IOU_STAT >= 0.15, TAIL_STAT <= 4.0 wu, V_STAT <= 1.5 wu/s,
#   MARGIN_D = 1.5 wu, MARGIN_A = 0.08
# World geometry of this fixture: cam2 pixel x maps to world x = x + 500;
# the parked anchor always sits at world (560, 120).
# ---------------------------------------------------------------------------


def _seed_dormant_gid1_at(manager, histogram, cam_x):
    """Park a car on cam2 at pixel x=cam_x -> gid1, then kill the track."""
    last_track = None
    for frame_idx in range(1, 7):
        last_track = parked_track(cam_x, 120, histogram)
        gid = _feed(
            manager, {"cam2": {35: last_track}}, frame_idx, frame_idx * 0.04
        )["cam2"][35]
    assert gid == 1
    manager.notify_track_lost("cam2", 35, last_track, 8, 0.32)
    manager.notify_track_expired(
        "cam2", 35, cam_x, 120, 42, 24, histogram, 12, 0.48,
        appearance_tracklet=last_track.appearance_tracklet,
    )


def _feed_fragment(manager, cam_x, histogram, base_frame=400, base_t=14.0,
                   steps=5, **track_kwargs):
    """Feed a stationary fragment on cam2 lid40 for ``steps`` frames,
    returning the gid assigned to it (or None)."""
    assigned = None
    for step in range(steps):
        frame_idx = base_frame + step
        fragment = parked_track(
            cam_x, 120, histogram, **track_kwargs
        )
        _feed(manager, {"cam2": {40: fragment}}, frame_idx,
              base_t + step * 0.04)
        assigned = manager.get_global_id("cam2", 40)
    return assigned


def _stationary_events(manager, kind=None, local_id=40):
    """Filter recent_events for the stationary_reacquire_* family."""
    return [
        event
        for event in _recent_events(manager)
        if str(event["type"]).startswith("stationary_reacquire")
        and (kind is None or event["type"] == kind)
        and event.get("target_local_id") == local_id
    ]


@pytest.mark.skipif(not _HAS_STATIONARY_FLAG, reason=_FLAG_MISSING_REASON)
def test_g2_distance_beyond_dstat_rejects():
    """G2: fragment at world ~568 (8 wu from the 560 anchor) is beyond
    D_STAT=5.0 but inside the 2*D_STAT coarse screen -> must emit
    stationary_reacquire_rejected (reason=distance) and never bind gid1."""
    manager = make_manager_flagged()
    histogram = one_hot_histogram(0)
    _seed_dormant_gid1(manager, histogram)
    assigned = _feed_fragment(manager, 68, histogram)
    assert assigned != 1
    rejected = _stationary_events(manager, "stationary_reacquire_rejected")
    assert rejected, (
        "a coarse-screened candidate that fails G2 must be logged as "
        "stationary_reacquire_rejected (reason=distance)"
    )


@pytest.mark.skipif(not _HAS_STATIONARY_FLAG, reason=_FLAG_MISSING_REASON)
def test_g3_extended_band_accept_with_iou():
    """G2+G3: fragment at world ~564 (4 wu -> inside the extended
    (D_STAT_CORE, D_STAT] band) with a matching-size bbox -> IoU
    corroboration is strong -> accept and reuse gid1."""
    manager = make_manager_flagged()
    histogram = one_hot_histogram(0)
    _seed_dormant_gid1(manager, histogram)
    assigned = _feed_fragment(manager, 64, histogram)
    assert assigned == 1, (
        "expected: reuse gid1 -- extended-band re-fire at ~4 wu with "
        f"good pixel corroboration; got {assigned}"
    )


@pytest.mark.skipif(not _HAS_STATIONARY_FLAG, reason=_FLAG_MISSING_REASON)
def test_extended_band_partial_bbox_rejects():
    """G3/G5 negative: same 4 wu band but the fragment bbox is wildly
    inflated (partial/edge-clipped look: 140x60 vs 42x24) -> IoU and/or
    size corroboration fails -> rejected, never gid1."""
    manager = make_manager_flagged()
    histogram = one_hot_histogram(0)
    _seed_dormant_gid1(manager, histogram)
    assigned = _feed_fragment(manager, 64, histogram, w=140, h=60)
    assert assigned != 1, (
        "a partial/inflated bbox in the extended band must not inherit "
        f"gid1; assigned={assigned}"
    )


@pytest.mark.skipif(not _HAS_STATIONARY_FLAG, reason=_FLAG_MISSING_REASON)
def test_g4_appearance_mismatch_rejects():
    """G4: same spot, completely different appearance (one-hot bin 9 vs
    bin 0 -> distance 1.0 >> 1-A_STAT=0.30) -> rejected appearance, no
    gid1 even though distance is ~2 wu."""
    manager = make_manager_flagged()
    histogram = one_hot_histogram(0)
    _seed_dormant_gid1(manager, histogram)
    assigned = _feed_fragment(manager, 62, one_hot_histogram(9))
    assert assigned != 1
    rejected = _stationary_events(manager, "stationary_reacquire_rejected")
    assert rejected, "G4 reject must emit stationary_reacquire_rejected"


@pytest.mark.skipif(not _HAS_STATIONARY_FLAG, reason=_FLAG_MISSING_REASON)
def test_g5_size_mismatch_rejects():
    """G5: same spot + appearance but a 200x96 fragment against the 42x24
    anchor bbox -> size_distance > S_STAT -> rejected, never gid1."""
    manager = make_manager_flagged()
    histogram = one_hot_histogram(0)
    _seed_dormant_gid1(manager, histogram)
    assigned = _feed_fragment(manager, 62, histogram, w=200, h=96)
    assert assigned != 1
    rejected = _stationary_events(manager, "stationary_reacquire_rejected")
    assert rejected, "G5 reject must emit stationary_reacquire_rejected"


@pytest.mark.skipif(not _HAS_STATIONARY_FLAG, reason=_FLAG_MISSING_REASON)
def test_g6_identity_was_moving_when_lost_rejects():
    """G6: an identity that was MOVING when its track died (velocity EMA
    and tail-span both large) is not a parked car -> the re-fire at its
    last anchor must not reclaim it (stationary_history_missing)."""
    manager = make_manager_flagged()
    histogram = one_hot_histogram(0)

    # lid35 drives rightwards (~8 px/frame) then the track dies at
    # cam2 x=88 -> world 588; the stationary fragment reappears there.
    last_track = None
    for frame_idx in range(1, 7):
        last_track = moving_track(40 + 8 * frame_idx, 120, histogram)
        gid = _feed(
            manager, {"cam2": {35: last_track}}, frame_idx, frame_idx * 0.04
        )["cam2"][35]
    assert gid == 1
    manager.notify_track_lost("cam2", 35, last_track, 8, 0.32)
    manager.notify_track_expired(
        "cam2", 35, 88, 120, 42, 24, histogram, 12, 0.48,
        appearance_tracklet=last_track.appearance_tracklet,
    )

    assigned = _feed_fragment(manager, 88, histogram)
    assert assigned != 1, (
        "an identity that was moving when it vanished must not be "
        f"reacquired by the stationary branch; assigned={assigned}"
    )
    rejected = _stationary_events(manager, "stationary_reacquire_rejected")
    assert rejected, (
        "G6 veto must be logged (reason=stationary_history_missing per "
        "F1-design section 6)"
    )


@pytest.mark.skipif(not _HAS_STATIONARY_FLAG, reason=_FLAG_MISSING_REASON)
def test_g7_long_gap_beyond_moving_window_still_reacquires():
    """G7: recency is log-only in the new branch.  Elapsed ~50.5 s (the
    REAL sang8 gap) -- far beyond the 12 s moving window yet inside the
    60 s general retention -- must still accept gid1.  This is the exact
    property the dormant same_camera_stale veto cannot express."""
    manager = make_manager_flagged()
    histogram = one_hot_histogram(0)
    _seed_dormant_gid1(manager, histogram)
    assigned = _feed_fragment(
        manager, 62, histogram, base_frame=1300, base_t=50.5
    )
    assert assigned == 1, (
        "expected: reuse gid1 -- ~50 s stationary gap must still "
        f"reacquire (recency is log-only); got {assigned}"
    )


@pytest.mark.skipif(not _HAS_STATIONARY_FLAG, reason=_FLAG_MISSING_REASON)
def test_live_member_divergence_rejects_with_log():
    """Guard: gid1 has a FRESH live member on cam1 at world ~400 (a
    different physical car carrying gid1's view there) while a fragment
    fires on cam2 at world ~568 -- divergence >> D_STAT -> the mint is
    correct but must now be LOGGED as stationary_reacquire_rejected
    (reason=live_member_divergence) instead of the silent veto."""
    manager = make_manager_flagged()
    histogram = one_hot_histogram(0)

    last_track = None
    for frame_idx in range(1, 7):
        last_track = parked_track(60, 120, histogram)
        gid = _feed(
            manager, {"cam2": {35: last_track}}, frame_idx, frame_idx * 0.04
        )["cam2"][35]
    assert gid == 1
    # cam1 member bound + kept freshly observed at world (400,120) --
    # mid-frame, outside the overlap polygon, so no handoff interferes.
    manager.bind_external_id("cam1", 10, 1, 7)
    for frame_idx, t_s in ((8, 0.32), (9, 0.36), (10, 0.40)):
        _feed(
            manager, {"cam1": {10: parked_track(400, 120, histogram)}},
            frame_idx, t_s,
        )
    manager.notify_track_lost("cam2", 35, last_track, 11, 0.44)
    manager.notify_track_expired(
        "cam2", 35, 60, 120, 42, 24, histogram, 12, 0.48,
        appearance_tracklet=last_track.appearance_tracklet,
    )

    assigned = None
    for step in range(5):
        frame_idx = 400 + step
        t_s = 14.0 + step * 0.04
        _feed(
            manager,
            {
                "cam1": {10: parked_track(400, 120, histogram)},
                "cam2": {40: parked_track(68, 120, histogram)},
            },
            frame_idx,
            t_s,
        )
        assigned = manager.get_global_id("cam2", 40)

    assert assigned != 1, (
        "the fragment is a different car ~168 wu from gid1's live cam1 "
        f"member; it must not bind; assigned={assigned}"
    )
    rejected = _stationary_events(manager, "stationary_reacquire_rejected")
    assert rejected, (
        "flag ON must log the live-owner veto "
        "(reason=live_member_divergence) -- the silent mint is the "
        "diagnostic gap this branch exists to fix"
    )


@pytest.mark.skipif(not _HAS_STATIONARY_FLAG, reason=_FLAG_MISSING_REASON)
def test_margin_defer_is_persistent_not_one_frame():
    """Guard (the F0-c defect-2 fix): two equally strong dormant
    candidates -> the deferral must persist for every frame, not release
    after one deferred frame into a LAPJV steal.  30 frames is well under
    the max(handoff_ttl, 60) cap."""
    manager = make_manager_flagged()
    histogram = one_hot_histogram(0)

    t = 0.0
    lid35 = lid36 = None
    for frame_idx in range(1, 7):
        t += 0.04
        lid35 = parked_track(60, 120, histogram)
        lid36 = parked_track(140, 120, histogram)
        ids = _feed(
            manager, {"cam2": {35: lid35, 36: lid36}}, frame_idx, t
        )["cam2"]
    assert ids[35] == 1 and ids[36] == 2
    manager.notify_track_lost("cam2", 35, lid35, 8, t + 0.04)
    manager.notify_track_lost("cam2", 36, lid36, 8, t + 0.04)

    bound_frames = []
    for step in range(30):
        frame_idx = 300 + step
        _feed(
            manager, {"cam2": {40: parked_track(100, 120, histogram)}},
            frame_idx, 12.0 + step * 0.04,
        )
        if manager.get_global_id("cam2", 40) in (1, 2):
            bound_frames.append(frame_idx)
    assert not bound_frames, (
        f"ambiguous candidates must defer persistently; the fragment was "
        f"bound to an incumbent at frames {bound_frames}"
    )
    markers = [
        event["type"]
        for event in _recent_events(manager)
        if event["type"]
        in {"stationary_reacquire_deferred", "dormant_reid_ambiguous"}
    ]
    assert markers, "persistent deferral must leave deferral-marker events"


@pytest.mark.skipif(not _HAS_STATIONARY_FLAG, reason=_FLAG_MISSING_REASON)
def test_occupied_spot_conflict_defers():
    """Guard: two dormant identities whose last_world anchors sit inside
    D_STAT of each other (two 'parked cars' cannot share one spot) ->
    defer instead of committing either."""
    manager = make_manager_flagged()
    histogram = one_hot_histogram(0)
    other = one_hot_histogram(4)

    lid35 = lid36 = None
    for frame_idx in range(1, 7):
        lid35 = parked_track(60, 120, histogram)
        lid36 = parked_track(63, 120, other)
        ids = _feed(
            manager,
            {"cam2": {35: lid35, 36: lid36}},
            frame_idx,
            frame_idx * 0.04,
        )["cam2"]
    assert ids[35] == 1 and ids[36] == 2
    manager.notify_track_lost("cam2", 35, lid35, 8, 0.32)
    manager.notify_track_lost("cam2", 36, lid36, 8, 0.32)

    bound_frames = []
    for step in range(20):
        frame_idx = 400 + step
        _feed(
            manager, {"cam2": {40: parked_track(62, 120, histogram)}},
            frame_idx, 14.0 + step * 0.04,
        )
        if manager.get_global_id("cam2", 40) in (1, 2):
            bound_frames.append(frame_idx)
    assert not bound_frames, (
        "two recent identities parked inside D_STAT of each other must "
        f"defer (occupied_spot_conflict); bound at {bound_frames}"
    )
    deferred = _stationary_events(manager, "stationary_reacquire_deferred")
    assert deferred, (
        "expected stationary_reacquire_deferred "
        "(reason=occupied_spot_conflict or ambiguous_candidates)"
    )


@pytest.mark.skipif(not _HAS_STATIONARY_FLAG, reason=_FLAG_MISSING_REASON)
def test_fragment_moving_veto():
    """Candidacy guard (F1-design section 2a): a fragment that is itself
    MOVING (provisional span > TAIL_STAT while it drifts past the dead
    car's spot) is a car driving through, not a re-fired parked car ->
    never binds gid1 (design reason enum: fragment_moving)."""
    manager = make_manager_flagged()
    histogram = one_hot_histogram(0)
    _seed_dormant_gid1(manager, histogram)

    assigned = None
    # The fragment enters near the anchor (world 562) then keeps driving
    # to world ~596 -- provisional span ~34 wu >> TAIL_STAT.
    for step in range(5):
        frame_idx = 400 + step
        fragment = moving_track(62 + 8 * step, 120, histogram)
        _feed(manager, {"cam2": {40: fragment}}, frame_idx,
              14.0 + step * 0.04)
        assigned = manager.get_global_id("cam2", 40)

    assert assigned != 1, (
        "a moving fragment must never steal the parked gid1; "
        f"assigned={assigned}"
    )
    accepted = _stationary_events(manager, "stationary_reacquire_accepted")
    assert not accepted


@pytest.mark.skipif(not _HAS_STATIONARY_FLAG, reason=_FLAG_MISSING_REASON)
def test_member_window_drift_over_tail_stat_vetoes_accept():
    """thai3_f1528 FALSE-MERGE guard (F1-b-backtest 2b/3d + design update).

    gid1 anchors at world ~560 on cam2 (parked, then the cam2 track dies).
    A live member on cam1 keeps gid1 active but is itself DRIFTING ~7 wu
    across the +-10-frame window around the re-fire (the real case: member
    crept 3.18 wu/20f at ~1.0 wu/s -- under V_STAT, so the identity-level
    G6 does not catch it).  A stationary fragment pops up 0-3 wu from the
    member's anchor -- two different cars: a parked one plus a slowly
    moving one.  The branch must veto on the member's window-drift >
    TAIL_STAT and REJECT/DEFER -- never accept, never silently mint.
    """
    manager = make_manager_flagged()
    histogram = one_hot_histogram(0)
    _seed_dormant_gid1(manager, histogram)

    # Live member on cam1 bound to gid1, observed drifting 555 -> 562 in
    # the 10-frame window leading up to the fragment's first frame.  Its
    # last world position lands on the fragment's spot (agreement path),
    # so ONLY the window-drift guard can veto the merge.
    manager.bind_external_id("cam1", 10, 1, 7)
    for step in range(9):
        frame_idx = 390 + step
        _feed(
            manager,
            {"cam1": {10: parked_track(555 + step, 120, histogram)}},
            frame_idx,
            13.0 + step * 0.04,
        )
    # Member goes unobserved but stays bound; flush handoffs its drift
    # opened so only the stationary machinery decides.
    manager._handoffs.clear()

    assigned = None
    for step in range(5):
        frame_idx = 400 + step
        fragment = parked_track(62, 120, histogram)
        _feed(manager, {"cam2": {40: fragment}}, frame_idx,
              14.0 + step * 0.04)
        assigned = manager.get_global_id("cam2", 40)

    assert assigned != 1, (
        "a fragment whose only matching identity is drifting on the other "
        "camera must not be merged onto it (thai3_f1528 false-merge); "
        f"assigned={assigned}"
    )
    assert not _stationary_events(
        manager, "stationary_reacquire_accepted"
    ), "no stationary_reacquire_accepted may be emitted for a drift-veto"
    verdict = _stationary_events(
        manager, "stationary_reacquire_rejected"
    ) or _stationary_events(manager, "stationary_reacquire_deferred")
    assert verdict, (
        "the drift veto must be logged (rejected/deferred) -- silent "
        "accept OR silent mint are both disallowed under flag-on"
    )


def test_parked_reservation_reacquire_invariant():
    """G6(c) invariant: an identity holding a slot reservation already
    owns its spot -- re-firing at it must reuse gid1.  This behaviour
    exists today (reservations exempt same_camera_stale, ccm:4678) and
    must keep working under flag-on; hence this test is NOT gated on the
    flag -- it is a regression invariant across both modes."""
    manager = make_manager_flagged()
    histogram = one_hot_histogram(0)
    _seed_dormant_gid1(manager, histogram)
    manager.sync_parked_reservations(
        [
            {
                "global_id": 1,
                "camera_id": "cam2",
                "slot_id": "C05",
                "state": "parked",
            }
        ],
        12,
    )
    assigned = _feed_fragment(manager, 62, histogram)
    assert assigned == 1, (
        "a parked-reserved identity must always be reclaimable at its "
        f"own spot (flag ON or OFF); got {assigned}"
    )
