# Tools A — scan_frames.py + align_overlay.py (for B/C reuse)

Both live in `backend/main_detect/experiment_test/verify/`. Read-only on inputs; write only to `--out`. Run with `.\.venv\Scripts\python.exe` from `backend/main_detect/`.

**Registry rule (LEAD):** official results only from `verify_cur_session_*` dirs marked FINISH/PASS in B's V1 registry. Pilot dirs (`verify_cur_test1`, `verify_cur_rt_*`, `verify_cur_runtime_*`) and original-session `predictions.jsonl` are **sanity-only**.

## Index base — IMPORTANT for C

- **Original sessions**: `frame_idx` is **0-based** (0..N-1).
- **`verify_cur_session_*` replay records**: `frame_idx` is **1-based** (1..N — verified on `verify_cur_session_test1`, range [1,298]).
- `flags/<name>.jsonl` `frame_from/frame_to` are in **the record's own frame_idx base** (auto-detected, `frame_idx_range` in summary shows it).
- `flags/<name>.windows.jsonl` is emitted **1-based raw-video frames, already ±15-padded and merged** per §V4 — feed it straight to `make_sheets.py --windows-file` (schema-1 takes ranges as-is, no extra pad). REPLAY_FAILURE and >500f-span flags are excluded from windows (they're line numbers / whole-session spans, not eyeballable).
- `raw_camN.mp4` frame counts are resolved from the SOURCE session dir when `--session` is `verify_cur_*` (prefix stripped).

## V3 — scan_frames.py

```powershell
.\.venv\Scripts\python.exe experiment_test\verify\scan_frames.py `
  --session experiment_test\output\verify_cur_<SESSION> `
  --roi config\roi_mask_cam1.json config\roi_mask_cam2.json `
  --out ..\.analysis\verify-replay\flags\verify_cur_<SESSION>.jsonl
```

stdout: JSON summary `{session, lines, frame_idx_range, distinct_frames, missing_frame_rows, raw_video_frames, observations, flags_by_type, total_flags, flagged_frames_pct, event_windows{count/first/last}, coverage, windows_count}`.

Outputs: `<out>` flags JSONL + `<out>.windows.jsonl` merged windows + (save stdout to `<out>.summary.json`).

### Flag schema

```json
{"type":"GID_SWITCH","cam":"cam1","frame_from":12,"frame_to":38,
 "measure":4,"threshold":3,"note":"lid 7 gid 3->5 FLAP","group":"g3_global_id"}
```

### Coverage matrix (7 §3 groups)

`summary.coverage` reports per group `CHECKED`/`NOT_AVAILABLE` + detail — a group is NEVER claimed checked when its source is absent:

| group | checks | NOT_AVAILABLE when |
|---|---|---|
| g1_data_replay | frame rows/idx gaps, dup idx, capture gaps, ts regression, raw-video frame count, frame_timestamps.csv rows, session_info counts, camera_skew_ms | raw mp4 missing, csv missing, fields absent, no session_info |
| g2_local_track | TRACK_JUMP/BBOX_JUMP/DUPLICATE_TRACK/ROI_MISMATCH/TRACK_LOST_EARLY/ID_FRAGMENT-NEW_ID | no observations |
| g3_global_id | GID_SWITCH (every lid gid change; ≥3 = FLAP), GID_CONFLICT, GID_NEW_LINEAGE_LOSS, GHOST_TRACK, ghost-gid (OTHER) | no gid fields |
| g4_cross_camera | HANDOFF_ERROR (new gid on one cam near gid vanished on other, stayed vanished), handoff event windows | no cam2 obs / no identity_events |
| g5_slots | SLOT_STATE_ERROR flicker, SLOT_BINDING_ERROR occupied-w/o-tracking | no slots field |
| g6_occlusion_windows | event_windows listing of occlusion/defer events (eyeball windows) | no identity_events field |
| g7_log_errors | `*.log` in session dir + sibling `verify_cur_<name>.log`: error/traceback lines → REPLAY_FAILURE, warn count | no .log files |

### Semantics decisions (per LEAD)

- `lid` đổi `gid` ⇒ `GID_SWITCH` mỗi lần (FLAP note khi ≥3).
- Đứng yên một mình **không** chứng minh ghost: `GHOST_TRACK` chỉ cờ khi `kind ∈ {prediction, occluded_prediction}` kéo dài ≥120f và near-still — vẫn chỉ là candidate.
- `ID_FRAGMENT/NEW_ID`, `GID_NEW_LINEAGE_LOSS`, `HANDOFF_ERROR` đều qua post-filter EOF: id "vanished" phải **giữ-mất** sau frame cờ; tái xuất sau đó = flicker, bỏ cờ.
- `TRACK_LOST_EARLY` bỏ track còn sống lúc EOF.
- Windows: `WINDOW_PAD=15`, merge khi khoảng sau pad chạm nhau; 1-based raw frames.

⚠️ Flags = automatic suspicions on prediction data only. NOT confirmed errors; need V4/V5 image evidence. Thresholds are named constants at top of file.

## V2 — align_overlay.py

```powershell
.\.venv\Scripts\python.exe experiment_test\verify\align_overlay.py `
  --session experiment_test\output\<SESSION> `
  --roi config\roi_mask_cam1.json config\roi_mask_cam2.json `
  --slots config\parking_slots_cam1.json config\parking_slots_cam2.json `
  --frames 0 mid --out ..\.analysis\verify-replay\alignment\<SESSION>
```

- Draws current ROI (green) + slot polygons (blue, labelled) over `raw_camN.mp4` frames.
- `--frames` accepts ints and `mid`/`end` keywords; uses predictions frame_idx base for POS_FRAMES seek — for verify_cur (1-based) pass `--frames 1 mid end`.
- V2 review must eyeball **đầu + giữa cả 2 cam** (per LEAD), not only f0.
- Output `<SESSION>_cam<N>_f<idx>.jpg`. Verdict: ALIGNED / MISALIGNED (→ `config_era_suspected`) / BROKEN.

## Status

- Original-data sanity scan done on 6 builder-a sessions (sanity only, see `V3-A-SUMMARY.md`).
- `verify_cur_session_test1` scanned: 298 rows=raw frames ✓, 0 REPLAY_FAILURE, 751 flags (dense noise-track session), windows 2, coverage g1-g6 CHECKED / g7 CHECKED (sibling log found).
