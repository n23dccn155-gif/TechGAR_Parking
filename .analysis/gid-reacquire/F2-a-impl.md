# F2-a Implementation Report — stationary_reacquire

Builder: A · 2026-10-06 · Implements `F1-design.md` **rev2** per `briefs/F2-a.md`.
Scope touched: `backend/main_detect/src/techgar/cross_camera_manager.py`,
`backend/main_detect/two_camera.py`. Flag default **OFF**. No commit/push.
Baseline: `baseline-dirty.patch` (377 lines) saved before first edit; the 5
pre-existing tracked modifications were not reverted.

## 1. Chosen mechanism

`_match_stationary_reacquire` (ccm `L4563`) is a last-resort pass called in
`update_all_tracks` immediately after `_match_unique_unbound_cross_camera_tracks`
(`L8283–8291`) and before the mint loop (`L8295+`). It is fully gated on
`self.enable_stationary_reacquire`; when OFF it returns `set()` and the mint
loop is unchanged — one extra `in stationary_deferred` membership check against
an always-empty set (bit-identical behaviour, verified by the flag-off test).

Deferred fragments land in `_stationary_deferred_since/_claims/_reasons`
(`L407–409`) — the persistent quarantine store — and are re-checked every frame
inside `_match_dormant_identities` (`L5848–5860`) via
`_stationary_hold_is_live` (`L4453`). Held keys are added to the dormant
`deferred_keys` return value, so they are filtered out of
`post_dormant_tracks` and never reach minting. Deferral cap:
`max(handoff_ttl, 60)` frames, matching F1.

## 2. Constructor parameters → F1 rev2 thresholds

Signature at `L195–210`, stored/clamped at `L289–326`:

| ctor param | F1 symbol | default |
|---|---|---|
| `enable_stationary_reacquire` | flag | `False` |
| `stationary_reacquire_core_distance` | D_STAT_CORE | `3.0` wu |
| `stationary_reacquire_distance` | D_STAT | `5.0` wu |
| `stationary_reacquire_appearance_distance` | 1−A_STAT | `0.30` |
| `stationary_reacquire_appearance_support` | A_SUPPORT | `2` |
| `stationary_reacquire_size_distance` | S_STAT | `0.90` |
| `stationary_reacquire_iou` | IOU_STAT | `0.15` |
| `stationary_reacquire_tail_span` | TAIL_STAT | `4.0` wu |
| `stationary_reacquire_velocity` | V_STAT | `1.5` wu/s |
| `stationary_reacquire_margin_distance` | MARGIN_D | `1.5` wu |
| `stationary_reacquire_margin_appearance` | MARGIN_A | `0.08` |
| `stationary_reacquire_member_drift` | MEMBER_DRIFT_STAT | `2.0` wu |
| `stationary_reacquire_member_window` | ±window | `10` f |

## 3. Gate chain inside the pass (per candidate fragment × identity)

Order of evaluation (each `reject` emits `stationary_reacquire_rejected`,
dedup ≤1/8 f per `(kind,gid,cam,lid,reason)` via `_stationary_event`, `L4390`):

1. **Candidacy** (`L4614–4698`): fragment must be unbound, `_is_allocatable`,
   `_has_fresh_detection`. Fragments too young to prove stationarity
   (`provisional < min_observations` or `<2` appearance samples) are deferred
   with reason `awaiting_evidence` *only if some identity still screens
   positive* — otherwise they fall through to minting as before.
2. **G1 same-camera live owner** (`L4725`): `_has_confirmed_camera_member` on
   the fragment's camera → `same_camera_live_owner`.
3. **Target-camera gallery rule** (`L4793`): live cross-camera member(s) or a
   cross-camera identity with no `camera_appearance_samples[cam_id]` →
   `target_camera_gallery_missing` (rev2 fix — the f1528 backstop).
4. **Coarse screen** (`L4801–4813`): distance `≤ 2·D_STAT` *or* appearance
   distance `≤ 0.5` keeps the pair; anything else is skipped silently.
5. **Live-member divergence** (`L4836`): fresh member world > D_STAT from the
   fragment → `live_member_divergence`.
6. **Member drift window** (`L4845–4877`, `_stationary_member_drift_window`
   `L4517`): bound cross-camera member drift inside ±`member_window` frames of
   the event, measured on that member's own `trajectory.global_samples` —
   *not* the lifetime EMA. `drift > MEMBER_DRIFT_STAT` → `live_member_moving`.
7. **Anchor/distance** (`L4871`, `L4881`): `identity.last_world` missing →
   `identity_anchor_missing`; `d > D_STAT` → `distance`.
8. **Extended band** (`L4890–4920`): `D_STAT_CORE < d ≤ D_STAT` requires
   `_stationary_anchor_iou` (`L5195`) `≥ IOU_STAT`, or `≥ 0.5·IOU_STAT` when the
   fragment bbox is *smaller* than the learned per-camera size (partial-view
   direction only).
9. **Appearance** (`L4931–4960`): `distance ≤ A_STAT` floor **and**
   `support ≥ min(A_SUPPORT, gallery_size)` — see deviation D1.
10. **Size** (`L4963`): `size_distance > S_STAT` → `size`.
11. **Stationary history** (`L4989`): identity velocity EMA ≤ V_STAT *or* tail
    span ≤ TAIL_STAT *or* parked reservation — else
    `stationary_history_missing`.
12. **Fragment moving veto** (`L5017–5028`): provisional span > TAIL_STAT with
    any screened candidate → `fragment_moving`.
13. **Margin** (`L5040–5090`): >1 qualified candidate needs
    `Δd ≥ MARGIN_D ∧ Δapp ≥ MARGIN_A`; else persistent defer
    `ambiguous_candidates`.
14. **Occupied-spot conflict** (`L5095–5145`): another identity anchor inside
    `D_STAT` of the winner's anchor → persistent defer
    `occupied_spot_conflict`.
15. **Accept** (`L5148+`): `_bind(cam, lid, winner_gid)` — the existing path,
    so `trajectory.promote`, `_gid_members`, `_local_to_global` all update
    normally — then `stationary_reacquire_accepted`.

## 4. Dormant-pass hooks (F1 §1b + rev2 drift veto)

* **Ambiguity → persistent hold** (`L6492–6514`): when the dormant LAPJV column
  is ambiguous, *all* column-eligible identities are recorded as claims in
  `_stationary_deferred_claims` (reason `ambiguous_candidates`), so the
  fragment stays quarantined across frames instead of being re-evaluated by
  LAPJV next frame (defect-2 fix; `test_margin_defer_is_persistent_not_one_frame`).
* **Hold filter** (`L5848–5860`): fragments with a live hold are removed from
  dormant candidates, added to `deferred_keys`, and re-emit
  `stationary_reacquire_deferred` (deduped) via `_emit_stationary_hold_deferred`
  (`L4498`).
* **Drift veto at dormant accept** (`L6615–6691`): between the existing
  `divergent_member` guard and `_bind`. If the winner identity has a bound
  cross-camera member whose ±10 f window drift exceeds
  `stationary_reacquire_member_drift` **and** the fragment is
  stationary-looking (provisional span ≤ TAIL_STAT), the bind is vetoed this
  frame (`deferred_keys`) and `stationary_reacquire_rejected
  (reason=live_member_moving)` is emitted. This is the only path that can stop
  a dormant-accepted merge before it happens — required because a live member
  observed *recently on another camera* flips `identity.last_camera`, which
  defeats `same_camera_stale` (exactly the f1528 shape reproduced by
  `test_member_window_drift_over_tail_stat_vetoes_accept`).

## 5. Event schema

All three types surface through `_event` → `_events` ring (200) →
`to_json()["recent_events"]` → `GET /api/runtime/events`. Common fields:
`frame`, `global_id` (nullable on defer), `target_camera`,
`target_local_id`, `reason`, `identity_last_world` (emitted even when null —
distinguishes "no observation anchor" from "no internal state" for the three
backtest cases thai3_f1774 / thai6_f1205 / thai6_f4936),
`member_drift_window` = `{member_cam, member_lid, f_lo, f_hi, drift_wu,
velocity_wu_s, member_drift_stat}` or `null`, plus per-gate measurements
(`world_distance`, `bbox_iou`, `appearance_distance/support`,
`size_distance`, `velocity_norm`, `tail_span`, `elapsed_s/elapsed_frames`,
`competing_global_ids`, `competitors`, `margin_d/margin_a`).

Reasons emitted: `distance`, `appearance`, `size`,
`stationary_history_missing`, `same_camera_live_owner`,
`live_member_divergence`, `live_member_moving`,
`target_camera_gallery_missing`, `identity_anchor_missing`,
`fragment_moving`, `ambiguous_candidates`, `occupied_spot_conflict`,
`awaiting_evidence`.

## 6. CLI plumbing

`two_camera.py` `L1953–1957`: `--enable-stationary-reacquire`
(`store_true`, default False). `L2266–2268`: forwarded into
`CrossCameraManager(...)` via `getattr(args, ..., False)` so callers building
namespaces without the flag keep the safe default.
Verified: `run_two_camera_session.make_parser()` wraps
`two_camera.make_parser()` and the flag parses there; `runtime_server.py`
uses that parser, so `python runtime_server.py --enable-stationary-reacquire`
works with **zero** additional plumbing. Livecam verification path:
`GET /api/runtime/events`.

## 7. Local verification

```
$ .venv/Scripts/python.exe -m pytest tests/test_stationary_reacquire.py -v
20 passed in 0.38s

$ .venv/Scripts/python.exe -m pytest tests/ -x -q
477 passed, 8 xfailed in 5.31s
```

Flag-on positives reuse gid1 via `stationary_reacquire_accepted`; flag-off
keeps the duplicate-mint behaviour and emits **zero** `stationary_reacquire_*`
events (`test_flag_off_keeps_current_mint_new_gid_behaviour`).

## 8. Deviations from F1 rev2 (explicit, none silent)

* **D1 — appearance support**: `support ≥ min(A_SUPPORT, gallery_size)`
  instead of an absolute `≥2`. Reason: `merge_appearance_samples` dedupes
  near-identical histograms (≤0.015), so a genuinely stationary car can
  legitimately own a 1-sample gallery; an absolute floor deadlocks exactly the
  parked cars this pass exists to re-acquire. `sample_pairs`/`support` are
  still logged on every event for calibration.
* **D2 — `awaiting_evidence` deferral** (new reason): fragments that are
  screen-positive but too young (< `min_observations` provisional samples or
  <2 appearance samples) are deferred instead of minted. Without this the
  fragment mints a duplicate on its first frame before any evidence exists.
  The hold auto-releases once the fragment matures (`_stationary_hold_is_live`
  `L4474–4490`).
* **D3 — drift veto location**: also applied at the dormant accept site
  (`L6615`), not only inside the new pass. F1 rev2 mandates the veto wherever
  a moving live member could cause a merge; the dormant LAPJV accept path is
  reachable before the stationary pass runs and would otherwise bypass it.
  The veto is exempt when the fragment itself is moving (real handoff).
* **D4 — member drift threshold**: `MEMBER_DRIFT_STAT = 2.0` wu as the F1
  suggested starting point — deliberately below f1528's 3.18 wu. It is a
  constructor parameter (`stationary_reacquire_member_drift`) so livecam
  calibration can tune it without code changes.
* **D5 — reason name** `identity_anchor_missing` added for the
  `identity.last_world is None` case (design enum did not name it; logging it
  was required by rev2 §6).
* No other deviations; every other gate/threshold maps 1:1 to F1 rev2 §4.
