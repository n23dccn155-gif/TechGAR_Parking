# F0-b — Candidate Classification + Broad Scan

**Task**: classify the 8 `SPEC.md §3` candidates (SAME_CAR / DIFFERENT_CAR / UNSURE) with ≥6 image checkpoints + world-space per case, then broad-scan all 18 sessions. Read-only: no code/config/replay changes.

## Method

1. Located each `global_id_created` event in `verify_cur_session_*/predictions.jsonl`, read `details.world_trajectory_rejections[*]` (reason + all components).
2. Extracted last observation of the rejected GID and first observation of the new LID (bbox is `[x,y,w,h]`, `anchor_world` from shared calibration `two_camera.shared_cm_01.json`).
3. Rendered ≥7 checkpoints across the gap with `experiment_test/verify/make_sheets.py` into `.analysis/gid-reacquire/evidence/<case>/` and eyeballed every cell.
4. Verdict rule (SPEC §6): SAME_CAR requires same spot **and** continuous visual presence across the gap; spot vacated mid-gap or a visibly different vehicle → DIFFERENT_CAR; insufficient evidence → UNSURE.

## Broad scan (18 sessions)

- Scanned all `identity_events` in every `verify_cur_*` predictions.jsonl.
- Filter: `world_trajectory_rejections` with `world_distance ≤ 5.0`.
- **10 candidates** = the 8 originals + 2 new (thai6 f5367, thai8 f1945). By reason: `trajectory_score` 7, `trajectory_stable_wrong_direction` 3.
- `dormant_reid_rejected` / `handoff_rejected` event types were checked across all 18 sessions — **0 matched** the distance criterion (these event types do not produce world-trajectory rejections with `world_distance`; other per-GID rejection reasons seen — `parked_reservation_origin_miss`, `target_camera_appearance`, `target_camera_gallery_missing` — carry no distance field).
- All 10 rejected GIDs had **no active observation on any camera within ±25f of the event** (track dead at event time). This does not by itself prove/disprove same-car — the physical car may remain parked.

## Per-case results

| Session | Frame | GID new | Rej GID | Reason | WD | Gap | Verdict | Evidence |
|---|---:|---:|---:|---|---:|---:|---|---|
| sang8 | 600 | 3 | 1 | trajectory_score | 0.90 | 334f | **SAME_CAR** | `evidence/sang8_f600` |
| thai3 | 1774 | 4 | 3 | traj_stable_wrong_direction | 1.20 | 238f | **SAME_CAR** | `evidence/thai3_f1774` |
| thai4 | 4633 | 12 | 7 | trajectory_score | 0.73 | 338f | **SAME_CAR** | `evidence/thai4_f4633` |
| thai6 | 1128 | 3 | 2 | trajectory_score | 0.83 | 263f | **SAME_CAR** | `evidence/thai6_f1128` |
| thai6 | 1205 | 4 | 1 | trajectory_score | 0.45 | 342f | **SAME_CAR** | `evidence/thai6_f1205` |
| thai6 | 1713 | 6 | 5 | traj_stable_wrong_direction | 1.65 | 310f | **DIFFERENT_CAR** | `evidence/thai6_f1713` |
| thai6 | 4936 | 16 | 6 | trajectory_score | 2.74 | 348f | **SAME_CAR** | `evidence/thai6_f4936` |
| thai7 | 2112 | 7 | 1 | traj_stable_wrong_direction | 1.23 | 698f | **DIFFERENT_CAR** | `evidence/thai7_f2112` |
| thai6 | 5367 | 19 | 18 | trajectory_score | 3.96 | 220f | **SAME_CAR** | `evidence/thai6_f5367` |
| thai8 | 1945 | 6 | 5 | trajectory_score | 4.29 | 421f | **DIFFERENT_CAR** | `evidence/thai8_f1945` |

### SAME_CAR (7)

- **sang8 f600** — black car parked top-left cam2 continuously visible f300→590 unboxed; G3|L40 spawns same spot (~10px, WD 0.90). appearance .83.
- **thai3 f1774** — teal parked car top-left cam1 visible all 7 checkpoints f1540→1750; G4|L9 same spot (~11px, WD 1.20). appearance .87.
- **thai4 f4633** — blue/green angled car end of middle row cam2; lid114 box still live f4300, G12|L119 same spot f4633 (~29px, WD 0.73). appearance .87.
- **thai6 f1128** — teal car top-right corner cam2 present all 7 checkpoints f900→1128; ~4px, WD 0.83. appearance .86.
- **thai6 f1205** — blue car inside middle-left slot cam1 continuous; G4|L29 same spot (~13px, WD 0.45). appearance .85.
- **thai6 f4936** — blue car end of middle row continuous; old box truncated (h=46, edge-clipped) vs new full (h=125) → WD 2.74 explained by partial bbox, ~15px. appearance .87.
- **thai6 f5367** *(broad-scan)* — light-blue car top-right cam2 present all 7 checkpoints f5160→5367; box grew 23×64 → 46×140 (partial→full) → WD 3.96, ~20px. appearance .72.

### DIFFERENT_CAR (3)

- **thai6 f1713** — two distinct vehicles: gid5 dark car at (944,229) top-right vs lid19 teal car at (911,398) right-lower; both visible through the gap; ~170px vertical offset. Reject correct.
- **thai7 f2112** — gid1 dark car stayed parked middle-left (405,244) through the whole gap while lid83 teal car newly entered top-left (339,61) ~f1750. Distinct cars; reject correct.
- **thai8 f1945** *(broad-scan)* — right-edge spot was **empty at f1550/1620/1700**, then a black car arrived by f1780+; gid5's lid chain (14/15/20) expired f1428–1567. New arrival during the gap — continuous presence fails; reject correct. (A same-car-returned scenario is not disprovable from appearance alone, but the spot demonstrably vacated, so the old GID's death was legitimate.)

### UNSURE (0)

## Observed pattern (facts, not hypothesis)

- 7/10 rejected candidates are visually the same parked car at the same spot; the old track died (no obs for 220–348f ≈ 9–14s) and the re-detected car received a new GID.
- All 7 SAME_CAR cases show `time_topology = 0.0` and near-zero `direction` (stationary car yields no direction evidence); `appearance` and `corridor` scored high (.72–.87 / .75–.97) yet `trajectory_score` fell below threshold.
- 2 of 7 SAME_CAR have `world_distance > 1` caused by partial/edge-truncated old bboxes, not real displacement.
- DIFFERENT_CAR cases were correctly rejected: either a second distinct vehicle was simultaneously present, or the spot demonstrably emptied during the gap.

## Counts

- SAME_CAR: **7** (6 of 8 original + 1 broad-scan)
- DIFFERENT_CAR: **3** (2 of 8 original + 1 broad-scan)
- UNSURE: **0**

F0 exit criterion (≥2 SAME_CAR among originals): **met — 6/8 originals are SAME_CAR**.
