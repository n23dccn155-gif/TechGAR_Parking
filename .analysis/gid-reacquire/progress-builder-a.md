# Progress — Builder A (F0-a code-path trace)

## Checkpoints

### CP1 — docs + event extraction (done)
- Read `SPEC.md`, `MEGAPLAN.md`, `briefs/F0-a.md`.
- Extracted sang8 `verify_cur_session_hiep_sang8/predictions.jsonl` f600 event:
  `identity-000000569 global_id_created gid=3 cam2/lid40` with
  `world_trajectory_rejections` = [gid1: trajectory_score 0.6683, gid2: trajectory_stable_not_leaving_slot 0.3918].
- KEY DATA CORRECTION vs SPEC premise: gid1 has NO cam1 member — only cam2/lid35 (f173–266), `local_track_lost` f267 (identity-000000428). `parked_identity_reservations` at f600 contains ONLY gid2 (cam2/C01). gid1 is a dormant identity, not "matched on cam1".
- f595 dormant events: gid1×cam2#40 `same_camera_stale` elapsed=50.078; gid2×cam2#40 `appearance` 0.401>0.30.
- f598/f599: `new_global_id_deferred_insufficient_fragment_evidence` (4<5 obs; displacement 12.369<13.895).

### CP2 — code path traced (done)
- Entry: `two_camera.py:2731 observe_trajectories` → `:2779 update_all_tracks` → `cross_camera_manager.py:7075`.
- Order in `update_all_tracks`: pending handoffs L7169 → overlap L7180 → `_match_dormant_identities` L7190 (def L4911) → `_match_world_trajectory_identities` L7207 (def L5748) → unbound pairs L7221 → unique cross L7235 → new-ID loop L7241+ → `_allocate_global_id`+`_bind`+`global_id_created` L7439–7457.
- World-pass pools: candidates L5761–5774 (unbound, allocatable, fresh, ≥2 app samples, ≥3 provisional); identities L5782–5789 (state ∉ {exited, expired}, not hold/occluded — dormant+live+parked all included).
- gid1 × lid40 path at f600: not reserved → `trajectory.match()` L5974–5990 (topology_score=1.0 hardcoded; min_direction_cosine −1.01 because `_has_durable_turnaround_proof` L4809–4840 True) → score 0.6683 < `match_threshold` 0.78 → `trajectory_score` reject L6078–6092. `plausible_recent_fragment` deferral escape L6037–6043 fails only on `time_topology>=0.75` (0.0).
- Scorer internals `trajectory_memory.py`: `match()` L306–422; weights L395–402 (0.35 corridor + 0.25 app + 0.15 dir + 0.10 speed + 0.10 min(time,topo) + 0.05 size); time_score L363 = clip(1−gap/window), gap L349–352 ≈50.2s >> reid_window≈6.9s → time_topology=0; direction L365–376 cosine of tiny noise velocities → −0.997 → 0.0015.
- gid2 × lid40: `identity_reserved` (gid2 in `_parked_reservations` C01) → `match_departure` L424–535 → `radial_gain<=0` → `stable_not_leaving_slot` L505–506 → reject via L6005–6021.
- Dormant pass rejected gid1×lid40 at f595 `same_camera_stale` via `_identity_is_recent`→`_same_camera_recovery_is_stale` L4659–4689 (elapsed 50.1s > `identity_retention_moving_seconds` 12.0s default L182); f600 silence = 8-frame dedup L3039.
- Verified arithmetic: 0.35·0.94452+0.25·0.83309+0.15·0.00146+0.10·0.97076+0.10·0+0.05·0.64365 = 0.6683 ✓.
- `dormant_match_distance` runtime ≈16.2 world units (min(configured 35, derived 1.75×median_slot≈16.6) via `resolve_matching_distance` two_camera.py L426–447, L2177–2181); implied radius from event = 0.8997/0.0555 ≈ 16.2 ✓.

### CP3 — report (done)
- Deliverable: `F0-a-codepath.md` written; replied `DONE F0-a`.
- Read-only honoured: no production/config/test files touched.

## F1-a — design (done)

- Read `briefs/F1-a.md`, `F0-SUMMARY.md`, `F0-b-cases.json`, `F0-c-tests.md` + re-read own `F0-a-codepath.md`.
- Re-derived separation metrics from `predictions.jsonl` (logged `world_distance` = corridor, misleading): Euclidean `anchor_world` deltas SAME ≤4.40 vs DIFF ≥6.07; bbox-IoU SAME ≥0.18 vs DIFF ≤0.15 (thin); appearance-sim full overlap (floor only).
- Verified plumbing for livecam requirement: `--enable-stationary-reacquire` added to `two_camera.make_parser()` auto-flows to `runtime_server.py` (via `run_two_camera_session.make_parser`, runtime_server.py:399); `_event()` → `_events` ring → `to_json()["recent_events"]` (ccm:7774) → `GET /api/runtime/events` (runtime_server.py:310).
- Chosen insertion: new pass `_match_stationary_reacquire` between `_match_unique_unbound_cross_camera_tracks` (ccm:7235–7239) and the new-ID loop (ccm:7244); flag-off = empty set → bit-identical.
- Deliverable: `F1-design.md` written; replied `DONE F1-a`.
- No production code/config/test modified (F1 = design only).

## F2-a start (2026-10-06)
- Baseline saved: `baseline-dirty.patch` (377 lines, 5 pre-existing modified files).
- Mtimes: cross_camera_manager.py 2026-09-27 23:05, two_camera.py 2026-09-27 15:17, test_stationary_reacquire.py 2026-10-06 10:21.
- Head: 5f581311.
- Scope: cross_camera_manager.py + two_camera.py only; flag default False.

## F2-a checkpoint (~60% ctx)
DONE (cross_camera_manager.py):
- ctor: `enable_stationary_reacquire` + 11 threshold params (stationary_reacquire_*), defaults theo F1 rev2; stored ~L289-326.
- State: `_stationary_deferred_since/_claims/_reasons` + `_stationary_event_last` ~L407-410.
- Dormant hook (defect-2): hold-filter top of `_match_dormant_identities` ~L5000-5034 (`_prune_stationary_deferred`, `_stationary_hold_is_live`, `_emit_stationary_hold_deferred` — helpers CHƯA VIẾT); early return now `return deferred_keys` (flag-off = empty, identical); ambiguous branch records column-eligible claims + persistent deferral ~L5645-5667.
TODO:
1. Helpers `_prune_stationary_deferred`, `_stationary_claim_alive`, `_stationary_hold_is_live`, `_stationary_event` (dedup <=1/8f), `_emit_stationary_hold_deferred`.
2. `_match_stationary_reacquire(all_tracks, frame_idx, camera_timestamps_s)` — insert after `_match_unique_unbound_cross_camera_tracks` (ends ~L4314 area, before `_identity_elapsed`). Gates: G1 same-cam owner; member divergence (fresh member >D_STAT); gallery rule (missing cam gallery + (live member or last_camera!=cam) -> reject target_camera_gallery_missing); screen (d<=2*D_STAT or app<=0.5) — non-screened skip silently; anchor None -> reject identity_anchor_missing; drift window ±10f member > MEMBER_DRIFT_STAT -> live_member_moving; G2 d>D_STAT -> distance; band (CORE,D_STAT] needs IoU>=0.15 OR (new_area<=ref_area and iou>=0.075) else reject distance; G4 app>0.30/support<2 -> appearance; G5 size>0.90 -> size; G6 velocity/tail/reservation all fail -> stationary_history_missing; fragment_moving -> rejected when any screened. Margin Δd>=1.5 ∧ Δapp>=0.08 else defer ambiguous; occupied-spot (other live identity anchor within D_STAT of winner anchor) -> defer occupied_spot_conflict. Accept -> _bind + stationary_reacquire_accepted (fields §6 incl identity_last_world nullable + member_drift_window).
3. update_all_tracks call site after deferred_cross_camera (~L7238) + mint guard `or key in stationary_deferred`.
4. two_camera.py: --enable-stationary-reacquire arg + ctor kwarg.
5. pytest test_stationary_reacquire.py + gid neighbor tests; write F2-a-impl.md; reply DONE F2-a.
Gotcha: held keys excluded from post_* dicts -> stationary pass never sees them; deferred events emitted from dormant hook. _observe_identity velocity EMA unreliable for parked jitter -> member drift uses window samples from trajectory.global_samples(gid) filtered (cam,lid).

## F2-a DONE (2026-10-06)
- Implemented stationary_reacquire per F1-design rev2. Scope: cross_camera_manager.py + two_camera.py only. Flag `--enable-stationary-reacquire` default False; verified propagates via run_two_camera_session.make_parser -> runtime_server (no extra plumbing).
- New pass `_match_stationary_reacquire` (ccm L4563) called at L8283 before mint; G1-G7 + screens + persistent deferral (cap max(handoff_ttl,60)); dormant hooks: hold filter L5848, ambiguity->claims L6492-6514, drift veto at dormant accept L6615-6691.
- Deviations documented in F2-a-impl.md §8 (D1 support=min(A_SUPPORT,gallery_size) — deduped 1-sample gallery fix; D2 awaiting_evidence; D3 veto also at dormant accept; D4 member drift 2.0wu default; D5 identity_anchor_missing reason).
- Tests: tests/test_stationary_reacquire.py 20/20 pass; full suite 477 passed + 8 xfailed, 0 fail.
- Report: F2-a-impl.md. Flag-off emits zero stationary_reacquire_* events (regression-gated).
