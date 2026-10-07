# Re-ID Fix — Final Report (F1 + F2)

Branch: `thai27_9` (uncommitted changes). Scope: SPEC.md F1+F2, approved "Duyệt — implement F1+F2".

## A. Root Cause Report

**Symptom:** vehicle leaves parking slot → sometimes keeps its GID instantly,
sometimes disappears ≥5s and returns with a NEW gid while the slot is already
green/empty.

**Why instant recovery worked:** when `evidence.first_center` was recorded
while the car was still deep inside the slot, the outward vector was correct →
departure token consumed immediately → old gid restored.

**Why the >5s failure:** a detection gap mid-departure (thai8: track
`('cam1',23)` lost f1662–1678, `provisional_trajectory_forgotten` f1677) reset
the recovery evidence. The new `first_center` was recorded when the car was
already at the slot edge, misaligned with the true departure direction →
`outward_px ≈ −41.5` forever while the car physically moved ~220px → candidate
rejected `insufficient_outward_evidence` → token extended 14× then
`recovery_expired` at f1841.

**Why slot green but ID lost:** slot state and identity lifecycle are separate
(correctly). The binder token bridges them; when RC1 broke the token consume
path, the parked reservation released at expiry — and then RC2 struck: the
reservation-origin check `provisional_samples()[0]` reads the *rolling* 2s
window, not the fragment's real start. The early in-slot samples had been
forgotten → earliest retained sample sat outside the slot →
`parked_reservation_origin_miss` → parked gid excluded from competition → new
gid minted the very next frame (f1842).

### RC1 — outward gate used misleading geometry (PRIMARY)
`SlotVehicleBinder` derived "outward" from `first_center`, which is unreliable
after a detector-gap restart. `world_trajectory_qualified=true` evidence was
already available but ignored by the same-camera gate.

### RC2 — rolling window mistaken for fragment origin (PRIMARY)
`WorldTrajectoryMemory.provisional_samples()[0]` ≠ fragment start (2s rolling
window). Reservation-origin checks must use a persistent epoch-origin.

### Contributing — ordering
`update_all_tracks` allocates gids before `binder.update_tracks` processes
token expiry in the same frame. Not fixed (F3 unapproved); currently masked
because tokens no longer expire spuriously.

## B. Evidence

- `experiment_test/output/reidfix_r0_session_thai8/predictions.jsonl`:
  `insufficient_outward_evidence` for `('cam1',23)` ×161 frames,
  `outward_px:-41.52`, `radial_gain_px:-14.5`, `world_trajectory_qualified:true`;
  `parked_id_recovery_expired` f1841; `parked_reservation_origin_miss` f1842;
  new gid allocated f1842.
- `provisional_trajectory_forgotten` `('cam1',23)` @ f1677 (R0).
- GT: `experiment_test/reid_fix/gt/GT_REVIEW.md` — approved: 2 physical cars
  (xe_xanh light-blue/orange stripe, xe_den black/multistripe); xe_den is the
  most-switched vehicle (thai8 live 2→4→7, thai7 live 2→9→10).
- R1 (fixed): `global_id_recovered` gid2 @ f1721 via `parking_departure_token`
  with `outward_px:-41.52` and `evidence_source:polygon_escape` — the exact old
  failure signature now accepted on polygon-escape evidence.

## C. Files Changed (uncommitted, +235/−11)

| File | Change |
|---|---|
| `src/techgar/slot_vehicle_binder.py` | F1: `RecoveryCandidateEvidence` tracks min radial distance / escape progression; outward gate accepts `world_trajectory_qualified` (same-camera) or signed-distance polygon-escape fallback; `evidence_source` reported (`owner_camera_polygon`/`world_trajectory`/`polygon_escape`); thresholds unchanged |
| `src/techgar/trajectory_memory.py` | F2: persistent provisional epoch-origin stored separately from the rolling 2s window; survives `remove_missing_provisionals`; cleared on fragment end |
| `src/techgar/cross_camera_manager.py` | F2: `_fragment_starts_outside_reservation` / `_fragment_starts_inside_reservation` use epoch-origin instead of `samples[0]` |
| `tests/test_gid_departure_token.py` | +2 tests (see E) |
| `tests/test_gid_reserved_competition.py` | +2 tests (see E) |

## D. Re-ID Contract (post-fix)

```
PARKED(gid=G, slot=S)
  → motion resumes         : predeparture/departure token opened, reservation held
  → slot EMPTY             : reservation eventually releases; identity retained
  → local track lost       : token window + dormant retention cover gap
  → same physical car seen : accept if trajectory-qualified OR polygon-escape
                             OR standard movement gate — fragment noise still
                             rejected; reservation origin judged by EPOCH-ORIGIN
  → token consumed         : GLOBAL_ID = G restored (no new gid while valid
                             candidate exists)
```

Invariants now enforced: slot-empty ≠ identity deletion; epoch-origin is
immutable across rolling-window pruning; allocator still runs before binder
expiry (documented residual ordering risk).

## E. Tests Added

1. `test_departure_recovers_when_first_vector_is_perpendicular` — replay of the
   bad-first-center geometry; RED `{}` → GREEN recovered via `polygon_escape`.
2. `test_fragment_origin_survives_rolling_history_window` — epoch-origin proves
   in-slot start after rolling samples move out; RED `True` (reject) → GREEN.
3. Negative: unrelated fragment starting outside reservation still rejected.
4. Negative: reserved-competition conservatism unchanged (existing suite).

## F. Regression Results

Unit: **448/448 backend pytest pass** (444 prior + 4 new); `backend/tests` pass.

Deterministic replay (identical config hash `a1a3782b` as live):

| Metric | R0 thai7 | R1 thai7 | R0 thai8 | R1 thai8 |
|---|---|---|---|---|
| parked_id_recovered | 9 | 10 | 5 | 6 |
| parked_id_recovery_expired | 0 | 0 | **1** | **0** |
| dep_token_expired_pending | 0 | 0 | **1** | **0** |
| token_retention_extended | 39 | 27 | 25 | **0** |
| gids created | 7 | 6 | 7 | 6 |
| same-vehicle ID switches | 2 | **1** | 1 | **0** |

Physical-vehicle GID timelines (spatially mapped to GT positions):

- `thai8`: xe_xanh gid **1** whole session; xe_den gid **2** whole session.
  F01 departure f1661→recovered f1721 (the reported bug case). **PASS**
- `thai7`: xe_den gid **2** whole session — 6 slot departures all recovered via
  `parking_departure_token` (f334,842,1371,1928,2409,2762). xe_xanh gid **1**→
  **gid7 at f2112** (see G). **1 residual switch — FAIL on strict criteria**
- `hiep_thai5`: R1 event stream **identical** to R0 — zero behavior change.
- `thai6`: recovery_expired 2→0, expired_pending 1→0, created 25→23; parking
  episode events unchanged (22 opened/22 stopped/16 confirmed).
- Negative checks intact: `dormant_reid_rejected` still firing (thai7 348,
  thai8 173); no `gid_aliases` merges; gid1/gid7 never coexist (no false merge).
- Slot occupancy transitions unchanged (parking event streams match R0).

`session_thai7: FAIL` (1 residual switch, different defect class)
`session_thai8: PASS`

## G. Remaining Risks

1. **Long-gap same-camera reappearance (RC3 candidate)** — thai7 f2112:
   xe_xanh (gid1) sat ~88s at the top-left mat edge unobserved, moved ~55cm
   while invisible, reappeared moving opposite its last velocity.
   `same_camera_stale` (88.9s > 12–24s cap) vetoes at `cross_camera_manager.py`
   L4970 *before* `_has_durable_same_camera_reentry_proof` (L5083) runs; pass-2
   rejects `trajectory_stable_wrong_direction` (cos −0.98). This is a deliberate
   conservative boundary ("a different car arriving where the first vanished")
   — fixing it means trusting appearance (distance 0.137, unique vs gid2)
   across arbitrary invisible displacement: **new policy, needs new SPEC +
   approval; intentionally NOT folded into F1/F2.**
2. F3 ordering (allocator before binder expiry) remains unaddressed —
   currently harmless because tokens no longer expire spuriously.
3. `evaluate_session_metrics.py` must not be run against replay outputs with
   live `manual_tracking.csv` `ai_assigned_id`s — IDs differ per run; use
   spatial mapping or per-replay labels.
4. 9 older acceptance sessions are absent from disk — regression limited to
   the 4 sessions present.
5. Determinism: confirmed — R0 thai8 2 runs diff=0; R1 vs R1b rerun on fixed
   code: 1799 events, diff=0.
