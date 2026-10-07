# F0-a — Code-path trace: stationary re-acquisition (sang8 f600)

Builder: A · Scope: read-only trace · Date: 2026-10-05
Files: `backend/main_detect/src/techgar/cross_camera_manager.py` (= `ccm`),
`backend/main_detect/src/techgar/trajectory_memory.py` (= `tm`),
`backend/main_detect/two_camera.py` (= `2cam`).

Evidence source: `backend/main_detect/experiment_test/output/verify_cur_session_hiep_sang8/predictions.jsonl` (schema v3; events under `identity_events`).

---

## 0. Observed data (predictions.jsonl — facts, not inference)

| Fact | Evidence |
|---|---|
| gid1's only member ever: cam2 `lid35`, frames 173–266, `confirmed/matched`, last anchor `(397,118)`, last `anchor_world` `(-1.48, 6.66)` | observations f173–266 |
| `local_track_lost` gid1 cam2#35 at f267 | event `identity-000000428` |
| **gid1 has NO cam1 observation anywhere in the session** | full-file scan of `canonical_gid==1` → cam2 only |
| lid40 (cam2) born f595 `tentative`, anchor (388,119) — ~9 px from lid35's last anchor | observations f595–600 |
| f595 dormant rejects: `gid1×cam2#40 same_camera_stale elapsed=50.078`; `gid2×cam2#40 appearance 0.401>0.30` | events 562–563 |
| f598/f599: `new_global_id_deferred_insufficient_fragment_evidence` (4<5 obs; displacement 12.369<13.895) | events 564–565 |
| f600: `global_id_created gid=3 cam2#40` + `world_trajectory_rejections` = [gid1 `trajectory_score` 0.6683 dist 0.8997; gid2 `trajectory_stable_not_leaving_slot` 0.3918 dist 15.42]; `handoff_opened gid3 cam2→cam1` | events 569–570 |
| f600 dormant events concern **cam1#28**, not lid40: gid1 `stale_without_target_camera_gallery` elapsed=50.953; gid2 `parked_reservation_origin_miss` | events 566–568 |
| `parked_identity_reservations` at f600: **only gid2** (cam2 slot C01). gid1 is not reserved | f600 row field |
| lid40 drifts (386,137)→(344,180) over f600–620 — small parking nudge, not strictly frozen | observations |

**Correction to SPEC premise:** "gid1 vẫn `matched` trên cam1" is refuted by data — gid1's last bound member (cam2/lid35) was lost at f267 and no cam1 track is bound to gid1 in the log. At f600 gid1 is an unbound-owner identity (state `dormant`, per behaviour below). Its `last_camera = "cam2"`.

---

## 1. Which branch emits `global_id_created` at f600 — new-lineage fallback

Frame entry chain:

```
two_camera.py:2731  manager.observe_trajectories(observable, frame_index, camera_timestamps_s)
two_camera.py:2779  manager.update_all_tracks(...)          → ccm:7075
```

`update_all_tracks` (ccm:7075) order:

1. `observe_trajectories` — ccm:7107 → tm `append_provisional` per unbound fresh track (ccm:1472); `append_global` for bound (ccm:1474, skipped if GID parked in trail memory, tm:104–107).
2. `_match_pending_handoffs` — ccm:7169.
3. `_match_simultaneous_overlap` — ccm:7180–7188.
4. **`_match_dormant_identities`** — ccm:7190 (def ccm:4911). Identity pool filtered to `state ∈ {dormant, handoff, parked, recovery_pending}` (ccm:4931–4938).
5. **`_match_world_trajectory_identities`** — ccm:7207 (def ccm:5748). Identity pool = `state ∉ {exited, expired}` minus provisional-holds and occluded (ccm:5782–5789) — dormant, live and parked identities all compete.
6. `_match_unbound_cross_camera_pairs` — ccm:7221; overlap retry ccm:7224–7234; `_match_unique_unbound_cross_camera_tracks` — ccm:7235–7239.
7. **New-ID allocation loop** — ccm:7244–7457: `_match_same_camera_duplicate` (ccm:7252) → `_new_global_id_ready` (ccm:7260, def ccm:2337) → reserved-slot departure deferral (ccm:7285–7316) → `_dormant_near_miss_candidate` (ccm:7320–7343, def ccm:1990) → same-frame twin dedup (ccm:7350–7424) → **`_allocate_global_id()` + `_bind()` + `_event("global_id_created")` — ccm:7439–7457**, attaching `_last_world_reid_diagnostics[(cam2,40)]`.

lid40 at f600: survived dormant (rejected f595, see §2), failed world pass (score), not deferred by any escape → **`global_id_created` is emitted by the new-lineage fallback at ccm:7439–7457**, not by dormant or world-ReID. `_bind` promotes the provisional trail (ccm:431 → tm:110–136).

---

## 2. Why gid1 was considered for lid40 and rejected with `trajectory_score`

### 2a. Dormant pass ran first and rejected (f595, dedup-silent at f600)

- `_match_dormant_identities` pool includes `dormant` gid1 (ccm:4931–4938); lid40 unbound → candidate (ccm:4923–4928).
- Same-camera pair (gid1.last_camera=cam2 = target cam2, ccm:4949) → recency check `_identity_is_recent` (ccm:4614) → `_same_camera_recovery_is_stale` (ccm:4659–4689): elapsed 50.1 s > `identity_retention_moving_seconds` (default 12.0 s, ccm:182/236) → **reject `same_camera_stale`** recorded ccm:4968–4990 — event at f595.
- f600 silence = 8-frame dedup in `_record_dormant_rejection` (ccm:3029–3041: same `(gid,cam,lid,reason)` suppressed if <8 frames since last).
- `_dormant_near_miss_candidate` (allocation-time position+appearance deferral, ccm:1990) skips non-recent identities at ccm:2042–2047 → no deferral for gid1.

### 2b. World pass re-evaluates and rejects on score (f600)

- Candidate filter: unbound + `_is_allocatable` + fresh + ≥2 appearance samples + ≥3 provisional samples (ccm:5761–5774). lid40 confirmed at f598 → eligible at f600.
- Identity pool includes dormant gid1 (ccm:5782–5789).
- Per-pair gates passed for gid1: `identity_reserved=False` (gid1 ∉ `_parked_reservations`, ccm:5827) → source-sample check ok (ccm:5833); `last_camera==cam_id` → no topology reject (ccm:5844); not reserved → skip reservation gate (ccm:5849); no same-camera live member (ccm:5868–5880); cam2 gallery exists (ccm:5881); appearance distance 0.167 ≤ min(0.45, dormant_thr) (ccm:5890–5905); size 0.356 ≤ 0.90 (ccm:5907–5921).
- Not reserved → `trajectory.match(...)` (ccm:5974–5990) with `topology_score=1.0` (hardcoded, ccm:5984), `min_direction_cosine = -1.01 if turnaround_proof else -0.35` (ccm:5988–5990).
- `stable=True`, no hard reject → score 0.6683 < `match_threshold` 0.78 (tm:60/66; default in ccm ctor ~L381) → **reject `trajectory_score`** ccm:6022–6024 + record diagnostics ccm:6078–6091.
- Deferral escape `plausible_recent_fragment` (ccm:6037–6044) requires ALL of: `last_camera==cam_id` ✓, appearance ≤0.30 ✓ (0.167), size ≤0.65 ✓ (0.356), corridor ≤0.6·dormant_match_distance ✓ (0.9 ≪ ~9.7), **`time_topology ≥ 0.75` ✗ (0.0)** → not deferred → `continue` → never reaches LAPJV cost (ccm:6094) or bind (ccm:6162–6185).
- `match_threshold=0.78` equals `lapjv` `cost_limit=0.22` (ccm:6115–6117): only scores ≥0.78 can ever produce an assignment.

**H2 verdict: PARTIALLY REFUTED.** The logged rejection does come from the world/live-trajectory pass (not dormant) — but NOT because gid1 is "live on cam1". gid1 is dormant (cam2); the world pool simply includes dormant identities alongside live ones. The dormant pass *also* evaluated the pair and rejected it one frame earlier (`same_camera_stale`, f595); the f600 diagnostics only show the world-pass verdict because the dormant verdict was deduped.

---

## 3. `time_topology=0` and `direction≈0` — exact mechanics (tm `match()`, L306–422)

Component formulas:

```
gap        = 0 if source.last_ts ∈ [cand.first_ts, cand.last_ts]
             else max(0, cand.first_ts − source.last_ts)          tm:334–352
time_score = clip(1 − gap/recent_window_s, 0, 1)                  tm:363
time_topo  = min(time_score, clip(topology_score,0,1))            tm:400, 417–419
direction: if both speeds ≥1e-3: cos = v_s·v_c/(|v_s||v_c|)
           direction_score = clip((cos+1)/2) × curvaturePenalty   tm:365–376
           else direction_score = 0.5 (neutral default)
score = 0.35·corridor + 0.25·appearance + 0.15·direction
      + 0.10·speed + 0.10·time_topo + 0.05·size                   tm:395–402
```

Applied to gid1 × lid40:

- **`time_topology = 0.0`**: `topology_score` is hardcoded 1.0 at the call (ccm:5984) → component = `time_score`. gid1's cam2 trail ends at lid35's death (~f266, camera clock ≈51122.03 s); lid40's first provisional sample ≈f595 (≈51172.27 s) → **gap ≈ 50.2 s**. `recent_window_s = handoff_ttl/fps` (ccm:4357–4372, `handoff_ttl=45` default ccm:147) ≈ 6.9 s at the ~6.5 fps replay rate. `clip(1 − 50.2/6.9) = 0`. Not camera-skew: measured `camera_skew_ms` ≤ 47 ms. The component is purely "the source trail is 50 s stale".
- **`direction = 0.00146`**: both estimates cleared the `1e-3` speed floor (lid35's parking creep; lid40's ~15 px wobble), so `cos` is computed from two near-zero noise vectors → cos ≈ −0.997 → score `(−0.997+1)/2 ≈ 0.0015`. For stationary/near-stationary cars this component is meaningless noise and can sink arbitrarily low.
- **Why no `trajectory_stable_wrong_direction` hard reject** despite cos −0.997 < −0.35: `_has_durable_turnaround_proof` (ccm:4809–4840) returned True — lifetime 266−173≈93 ≥30, cam2 gallery ≥2, appearance distance 0.167 ≤0.25, size 0.356 ≤0.65, distance 0.9 ≤ radius → `min_direction_cosine` relaxed to −1.01 (ccm:5988–5990); tm hard-reject at tm:392–393 not triggered.
- Score arithmetic check: 0.35·0.94452 + 0.25·0.83309 + 0.15·0.00146 + 0.10·0.97076 + 0.10·0.0 + 0.05·0.64365 = **0.6683** ✓ (matches event).
- Radius: `prediction_radius = dormant_match_distance` (ccm:5978); runtime value ≈16.2 world units — `resolve_matching_distance` = min(configured 35, derived 1.75×median-slot≈16.6) (`2cam`:426–447, 2177–2181; session calibration `config/sessions/droidcam_shared_hiep8/calibration.json` matching_defaults). Implied by event: 0.8997/(1−0.94452) ≈ 16.2.

Sensitivity note (arithmetic, not a proposal): restoring only `time_topology`→1.0 gives 0.768 (<0.78, still rejected); restoring only `direction`→0.5 gives 0.743; both together → 0.843 (>0.78). The reject needed both deficits.

---

## 4. Is any branch driven by world_distance / appearance as primary evidence?

| Path | Role of position/appearance | Reachable for gid1×lid40 at f600? |
|---|---|---|
| Dormant same-camera cost `0.55·d/limit + 0.35·app/thr + 0.10·size` (ccm:5344–5351); distance>limit is a hard `position` veto (ccm:5111–5125) | position+appearance ARE primary (no trajectory term) | **No** — killed by `same_camera_stale` recency veto before cost eval (ccm:4968–4990); reentry proof also bounded by elapsed ≤ ~3.5 s (ccm:5066–5070) |
| `_dormant_near_miss_candidate` deferral (ccm:1990–2060) | position+appearance defer new GID | **No** — requires `_identity_is_recent` (ccm:2042–2047), fails on same stale clock |
| World pass | appearance = gate ≤min(0.45, dormant_thr) (ccm:5890–5905) + 0.25 component; corridor = teleport veto + 0.35 component (tm:388) | Evaluated, but accept decision is the weighted score only — **no "close distance + good appearance ⇒ accept" shortcut exists** |
| Handoff pass | velocity-aware edge handoff | gid1's earlier handoff attempts deferred at f260/263 (events 379/402); nothing pending at f600 |

`world_trajectory_rejections` components are diagnostics only; being logged ≠ deciding.

**H3 verdict: CONFIRMED for this case.** The only position/appearance-primary matcher (dormant same-camera) is unreachable once `elapsed > identity_retention_moving_seconds` (12 s), and the near-miss deferral gates on the same recency check. The world pass — the last pass before minting — offers no stationary-aware alternative; a fragment 0.9 world-units from a stale identity with appearance 0.83 cannot reuse it.

**H1 verdict: CONFIRMED, with mechanism detail.** `match()` assumes a moving pair: (a) `time_topology` collapses to 0 whenever the source trail is older than `recent_window` — structurally guaranteed for a parked-then-redetected car because the trail froze when the local track died; (b) `direction` turns into noise (−0.997 here) since two near-zero velocity medians have no meaningful sign. Together they cost 0.175 of the weighted score (0.10 + ~0.075), pushing 0.843→0.668 below the 0.78 threshold.

---

## 5. Rejection-reason map (reason → code → condition)

World-trajectory pass (`_match_world_trajectory_identities`, ccm:5748+):

| Reason | Lines | Condition |
|---|---|---|
| `source_trajectory_short` | ccm:5833–5842 | non-reserved identity with <3 trail samples on `last_camera` |
| `camera_topology` | ccm:5844–5848 | `last_camera != cam` and not `_are_adjacent` |
| `parked_reservation_origin_miss` | ccm:5849–5867 | reserved GID + `not _reserved_identity_may_compete` |
| `same_camera_live_owner` | ccm:5868–5880 | `_has_confirmed_camera_member(gid, cam, exclude=lid)` (SPEC's "same_camera_live_owner_conflict" = this event name) |
| `target_camera_gallery_missing` | ccm:5881–5889 | no appearance gallery for target camera |
| `target_camera_appearance` | ccm:5890–5905 | support≤0 or distance > min(0.45, dormant_appearance_threshold) |
| `target_camera_size` | ccm:5907–5921 | size distance > 0.90 |
| `trajectory_missing` | ccm:5991–5995 | `match()`/`match_departure()` returned None |
| `candidate_trajectory_short` | ccm:5996–6004 | `evidence.observations < min_observations` (3) |
| `trajectory_teleport` | ccm:6005–6021 ← tm:388–389 | corridor_distance > prediction_radius |
| `trajectory_camera_topology` | ccm:6010 ← tm:390–391 | topology_score ≤ 0 (unreachable here — caller passes 1.0) |
| `trajectory_stable_wrong_direction` | ccm:6010 ← tm:392–393 / tm:507–508 | `match()`: cos < min_cosine (−0.35, or −1.01 w/ turnaround proof); `match_departure()`: cos < 0 |
| `trajectory_stable_not_leaving_slot` | ccm:6010 ← tm:505–506 | `match_departure`: stable fragment with `radial_gain ≤ 0` (gid2 case) |
| `trajectory_score` | ccm:6022–6024, record 6078–6091 | `evidence.score < match_threshold` 0.78; escape `plausible_recent_fragment` needs last_camera==cam + app≤0.30 + size≤0.65 + corridor≤0.6·radius + **time_topology≥0.75** (ccm:6037–6044) |
| (assignment) `world_trajectory_reid_ambiguous` | ccm:6115–6150 | LAPJV cost_limit 0.22, ambiguity_margin 0.12 |

Dormant pass (`_match_dormant_identities`, ccm:4911+), emitted via `_record_dormant_rejection` (8-frame dedup ccm:3039):

| Reason | Lines | Condition |
|---|---|---|
| `parked_reservation_origin_miss` | ccm:4953–4967 | reserved + cannot prove slot-origin membership |
| `same_camera_stale` | ccm:4968–4990 ← ccm:4659–4689 | same-camera revival elapsed > `identity_retention_moving_seconds` (12.0 s default; ×2 if `vanished_near_roi_edge`) |
| `identity_retention_expired` | ccm:4968–4990 ← ccm:4614–4657 | elapsed > retention limit (60 s, ×4 if established) |
| `position` | ccm:5111–5125 | distance > `distance_limit` |
| `stale_without_target_camera_gallery` (+`_stale` event) | ccm:5126–5143 | cross-cam gap > 2×reid_window and no target gallery |
| `appearance_missing` / `appearance` | ccm:5161–5167 / 5243–5272 | support≤0 / distance > min(0.30 same-cam | 0.45, dormant_thr) — gid2 rejected here at f595 (0.401>0.30) |
| `stale_source_camera_appearance` | ccm:5181–5195 | no target gallery and elapsed > window |
| `size` | ccm:5306–5316 | size distance > 0.92 |
| `direction` | ccm:5400–5412 | cross-cam direction claim reject (cos < −0.35 w/o proof) |
| `trajectory_*` / `trajectory_score` (dormant, cross-cam only) | ccm:5450–5477 | same scorer as world pass |
| defers: `dormant_reid_deferred_fragment_immature`, `new_global_id_deferred_dormant_near_miss`, `dormant_reid_deferred_live_divergence` | ccm:5299–5336, 5233–5252, 5630–5650 | immature fragment / near miss / live-member divergence |

New-ID loop (ccm:7244+): `too_few_observations` <5 (ccm:2360–2368), `insufficient_displacement` < max(6, 0.15·diag) (ccm:2377–2391), `unusual_size_without_long_trajectory` (ccm:2393–2413), `leaving_reserved_slot` (ccm:7297–7316), `dormant_near_miss` (ccm:7320–7343), `same_frame_duplicate` (ccm:7390–7424), then `global_id_created` (ccm:7439–7457).

---

## 6. Timeline of the bug (consolidated)

```
f173–266  cam2 lid35 ↔ gid1, parks at (397,118); trail frozen at death
f267      local_track_lost → gid1 dormant (last_camera=cam2, last_world frozen)
f595      lid40 appears ~9 px away (same physical car nudging)
          dormant pass: gid1 → same_camera_stale (elapsed 50.1 > 12 s)
                        gid2 → appearance (0.401 > 0.30)
f596–599  dormant dedup-silent; new-ID deferred (4→5 obs, displacement 12.4 < 13.9)
f600      world pass: gid1 → match() score 0.6683 < 0.78 → trajectory_score
                        (turnaround_proof bypasses −0.997 direction hard-reject;
                         time_topology=0 kills the only deferral escape)
                        gid2 → match_departure → stable_not_leaving_slot
          no bind → allocate gid3 → global_id_created (+world_trajectory_rejections)
```

## 7. Unresolved / for F0-b–F1

- Exact `identity.state` string for gid1 at f600 (`dormant` vs `handoff`) — not logged; behaviour is identical for this trace.
- Whether the same-camera `same_camera_stale` 12 s limit or the world-pass `time_topology` term is the *first* structural blocker is frame-order dependent; both fire here (dormant at f595, world at f600). Both would need addressing (or a new pre-emptive branch) for stationary re-acquire.
- `dormant_match_distance` runtime value inferred ≈16.2 (event arithmetic) vs derived ≈16.6 — minor calibration-source discrepancy, immaterial to the outcome.
- Seven other candidate sessions remain unclassified (F0-b scope).
