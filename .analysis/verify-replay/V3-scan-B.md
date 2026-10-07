# V3-scan-B — flags tự-động trên session B (tool A `scan_frames.py`)

⚠️ Flags = nghi-vấn tự-động heuristic, CHƯA phải lỗi xác-nhận (xem ERRORS-B).
Outputs: `flags/<session>.jsonl` (record gốc) + `flags/verify_cur_*.jsonl`
(replay current) — hai tập giữ riêng.

## Record gốc (sanity/context — không dùng verdict current)

| session | tổng | ROI_MISMATCH | SLOT_BIND | ID_FRAG | TRACK_LOST | JUMP | khác |
|---|---|---|---|---|---|---|---|
| hiep_thai3 | 551 | 162 | 33 | 196 | 150 | 7 | GID_SWITCH 1, LINEAGE 2 |
| hiep_thai4 | 542 | 87 | 32 | 238 | 177 | 4 | DATA_INTEGRITY 1 (capture gap f2442-43), GID_SWITCH 1, LINEAGE 2 |
| hiep1 | 43 | 1 | 30 | 5 | 7 | 0 | |
| hiep_toi6 | 239 | 17 | 30 | 77 | 110 | 5 | |

## Replay CURRENT (verify_cur_*) — nguồn verdict

| session | tổng | ROI_MISMATCH | SLOT_BIND | ID_FRAG | TRACK_LOST | JUMP | khác |
|---|---|---|---|---|---|---|---|
| verify_cur_session_hiep_toi6 | 284 | 50 | 30 | 83 | 115 | 6 | |
| verify_cur_session_hiep1 | 44 | 0 | 30 | 6 | 8 | 0 | |
| thai3/thai4 current | **chờ V1 finish** (~72min mỗi cái) | | | | | | |

## Event-context data (toi6 current — thay phán-đoán "detector noise")
- f97–130 burst: `association_rejected_stale_track`×439, `…_stale_prediction`
  ×365, `stale_prediction_replaced_by_measurement_anchor`×75,
  `track_frozen_stationary`×75, `provisional_trajectory_forgotten`×46,
  `anchor_outside_roi`×19, `cast_shadow_rejected`×8, `oversized_bbox`×6,
  `global_id_created`×1, `local_track_lost`×1.
  → **stale-association purge + mass respawn** (guard sweep), không ngẫu-nhiên.
- f596–612: cùng signature nhỏ (rejected×78, frozen×15, handoff_rejected×2,
  dormant_reid_rejected×3).
- `suppressed_roi_edge_twin` xuất-hiện f400/f700 — ROI-edge dedup hoạt-động.

## Nhận-định cho A/C
- Pattern `SLOT_BINDING` f7–70 = parked-at-start (expected, đề-nghị whitelist
  warmup — nhưng KHÔNG tự patch tool, chờ LEAD/A).
- TRACK_LOST/ID_FRAG phần-lớn hệ-quả 2 burst + boundary churn — không tách
  từng-case.
