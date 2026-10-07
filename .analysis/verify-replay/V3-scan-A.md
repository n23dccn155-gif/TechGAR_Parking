# V3-scan-A — auto-scan results (builder-a, official verify_cur only)

Tool: `experiment_test/verify/scan_frames.py` — scans 100% prediction rows; outputs flags JSONL + merged windows (±15, 1-based) + summary JSON with 7-group coverage matrix. Flags are SUSPECTS, not errors — confirmation only via ERRORS-A.md after image review.

## 7-group coverage matrix (per MEGAPLAN §3-V3)

| group | fields/thresholds/limits | test1 | toi4 | hiep2 | sang9 | thai6 | thai1 |
|---|---|---|---|---|---|---|---|
| g1_data_replay | frame rows vs raw, frame_idx gap/dup, timestamps.csv, capture_unix_ns, skew<150ms, session_info counts | CHECKED (298=298, skew≤109ms) | CHECKED (620=620) | CHECKED (642=642) | CHECKED (727=727, skew≤93ms) | CHECKED (5937=5937, skew≤110ms, 0 missing)  | CHECKED (6050=6050; 1 capture-gap f973->974 ~6.7s) |
| g2_local_track | obs present; JUMP_PX=120/f, BBOX_AREA_JUMP=2.5×, DUPLICATE_IOU=0.55, SHORT_LIFE=3f, ROI anchor | | | | | CHECKED (28535 obs)  | CHECKED |
| g3_global_id | GID_SWITCH on lid-gid change, lineage-loss post-filter (old gid stays vanished), GHOST pred>120f | CHECKED | CHECKED | CHECKED | CHECKED | CHECKED (gid fields; GID_SWITCH 0, lineage-loss 8)  | CHECKED (GID_SWITCH 1, lineage-loss 1) |
| g4_cross_camera | handoff events, NEW_NEAR_PX=150, NEW_WITHIN=40f | CHECKED | CHECKED | CHECKED | CHECKED | CHECKED (103 handoff events)  | CHECKED (57 handoff events) |
| g5_slots | slot flicker≥6f, track/slot mismatch≥60f | | | | | CHECKED (slots records)  | CHECKED |
| g6_occlusion_windows | occlusion/merge-split event windows listing | CHECKED (490 hits) | CHECKED | CHECKED | CHECKED | CHECKED (1057 hits)  | CHECKED (377 hits) |
| g7_log_errors | sibling verify_cur_*.log error/warn lines | | CHECKED 0/0 | CHECKED 0/0 | CHECKED 0/0 | CHECKED 0 err/0 warn  | CHECKED 0 err/0 warn |

Missing field/file → group would be NOT_AVAILABLE (rule enforced by scanner); none missing on these 6 sessions.

## Results summary

| session | rows=raw | flags | top types | windows |
|---|---|---|---|---|
| verify_cur_session_test1 | 298✓ | 751 | ID_FRAG 337, TRACK_LOST 289, ROI 49, SLOT_BIND 36, TRACK_JUMP 22, BBOX_JUMP 15, GID_LOSS 3 | 2 merged |
| verify_cur_session_hiep_toi4 | 620✓ | 132 | TRACK_LOST 59, ID_FRAG 43, SLOT_BIND 30 | 6 |
| verify_cur_session_hiep2 | 642✓ | 68 | SLOT_BIND 29, TRACK_LOST 21, ID_FRAG 15, ROI 3 | 6 |
| verify_cur_session_hiep_sang9 | 727✓ | 145 | TRACK_LOST 64, ID_FRAG 46, SLOT_BIND 30, ROI 3, TRACK_JUMP 2 | 9 |
| verify_cur_session_thai6 | 5937✓ | 1459 | ID_FRAG 671, TRACK_LOST 550, ROI 141, SLOT_BIND 34, TRACK_JUMP 26, BBOX_JUMP 23, GID_LOSS 8, HANDOFF 6 | 54 |
| verify_cur_session_hiep_thai1 | 6050✓ | 197 | ID_FRAG 94, TRACK_LOST 59, SLOT_BIND 31, ROI 7, BBOX_JUMP 3, DATA_INTEGRITY 1 (capture-gap f973→974), GID_SWITCH 1, GID_LOSS 1 | 47 |

- g1: 0 missing/dup frame_idx, capture timestamps monotonic where present; 1 capture-gap noted on ORIGINAL thai1 (sanity-only scan, not campaign finding).
- Sanity scans on ORIGINAL predictions remain tool-validation only.