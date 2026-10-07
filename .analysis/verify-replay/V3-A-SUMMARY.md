# V3 Scan Summary — Builder-A (original session data, pre-replay)

**Status: automatic flags only — no confirmed errors. 100% of `predictions.jsonl` rows scanned; human image review NOT yet done on flagged windows.**

Sessions (MEGAPLAN §2 builder-a): hiep_thai1, thai6, hiep_sang9, hiep2, hiep_toi4, test1.
Flags: `.analysis/verify-replay/flags/<session>.jsonl`.

| session | frames | ROI_MISMATCH | SLOT_BINDING | TRACK_JUMP | BBOX_JUMP | GID_NEW_LINEAGE | DATA_INTEG | total |
|---|---|---|---|---|---|---|---|---|
| hiep_thai1 | 6050 | 61 | 31 | – | – | 1 | 1 | 94 |
| thai6 | 5937 | 145 | 34 | 32 | 10 | 11 | – | 232 |
| hiep_sang9 | 727 | 5 | 29 | 4 | 2 | 1 | – | 41 |
| hiep2 | 642 | 2 | 30 | – | 2 | 1 | – | 35 |
| hiep_toi4 | 620 | 6 | 30 | 2 | – | 1 | – | 39 |
| test1 | 298 | 59 | 36 | 17 | 16 | 6 | – | 134 |

## Notes

- `ROI_MISMATCH` + `SLOT_BINDING_ERROR` dominate everywhere. Given V2 shows current configs ALIGNED on these raw videos, suspects are: (a) slot-binder occupancy semantics vs observed occupant (inferred), (b) anchor-outside-ROI on entry/exit-edge cars — plausible normal behaviour, needs image check.
- `DATA_INTEGRITY` (thai1): capture gap f973→974, Δt ≈ 6.67s — likely a dropped/stall segment, worth visual check during review.
- `GID_NEW_LINEAGE_LOSS` is now conservative (first-sighting gid near a just-vanished gid): 1–11/session — good V5 review targets.
- `TRACK_JUMP`/`BBOX_JUMP` clusters in thai6/test1 — candidates for identity/bbox-quality visual review.
- `session_thai8` (25 GT rows) is in builder-c's list; `session_hiep_thai2` broken-video per plan — not run.

## Coverage statement

- Automatic scan coverage: **6/6 assigned sessions, 100% of prediction rows**.
- Visual/image review coverage: **V2 alignment images only (f0 × cam1/cam2 × 6 sessions, all ALIGNED)**. Flagged windows not yet image-reviewed; per plan V4/V5 runs on `verify_cur_*` outputs (builder-b pending).
