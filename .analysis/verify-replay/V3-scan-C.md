# V3-scan-C — auto-scan results (builder-c, official verify_cur only)

Ngày: 2026-10-05. Tool: `experiment_test/verify/scan_frames.py` (A) trên predictions của `verify_cur_session_*` — 100% rows, flags JSONL + summary JSON. Cờ = SUSPECT, không phải lỗi xác nhận (xác nhận chỉ ở ERRORS-C sau eyeball).

Cohort: chỉ `verify_cur_session_*` có FINISH/PASS trong `V1-replay-results.md`. Không dùng `verify_cur_test1`/`verify_cur_rt_*`/`verify_cur_runtime_*` aux.

| session | rows | flags | top types | windows event groups |
|---|---|---|---|---|
| verify_cur_session_hiep_sang7 | 817 | 121 | TRACK_LOST 61, SLOT_BIND 29, ID_FRAG 25, ROI 6 | — |
| verify_cur_session_hiep_toi5 | 806 | 133 | ROI 45, TRACK_LOST 45, SLOT_BIND 30, ID_FRAG 11, BBOX_JUMP 1, DATA_INTEG 1 | — |
| verify_cur_session_hiep3 | 826 | 65 | SLOT_BIND 31, TRACK_LOST 17, ID_FRAG 15, BBOX_JUMP 1, DATA_INTEG 1 | — |
| verify_cur_session_hiep_sang8 | 929 | 127 | TRACK_LOST 68, SLOT_BIND 30, ID_FRAG 23, ROI 5, GID_LOSS 1 | — |
| verify_cur_runtime_session_bt | 1529 | 172 | TRACK_LOST 63, ID_FRAG 52, ROI 26, TRACK_JUMP 1 | 13 |
| verify_cur_session_thai8 | 1952 | 203 | TRACK_LOST 74, ID_FRAG 65, ROI 33, SLOT_BIND 30, HANDOFF 1 | 17 |
| verify_cur_session_thai7 | 2872 | 347 | ID_FRAG 149, TRACK_LOST 116, ROI 45, SLOT_BIND 33, HANDOFF 2, TRACK_JUMP 1, DATA_INTEG 1 | 17 |
| verify_cur_session_hiep_thai5 | 3977 | 822 | ID_FRAG 361, TRACK_LOST 331, ROI 76, SLOT_BIND 32, TRACK_JUMP 15, BBOX_JUMP 6, GID_LINEAGE 1 | 74 (5 nhóm) |

Artifacts: `flags/verify_cur_<s>.jsonl`, `flags/verify_cur_<s>.summary.json`, `windows/verify_cur_<s>.events.txt` (span first–last trích từ `event_windows` của summary — dùng làm `--windows-file` cho make_sheets).

Rare flags đáng chú ý:
- HANDOFF_ERROR: thai8 cam1 f1377–1389 (new gid5 near gid3 vanished cam2) **và** thai7 cam1 f761–772 (cùng chữ ký gid5/gid3) + thai7 cam2 f2084–2112 (gid7 near gid1) — pattern lặp 2 session.
- TRACK_JUMP: bt cam1 f1427–28 lid19; thai7 cam2 f2–3 lid4.
- DATA_INTEGRITY capture gap: toi5 f95–96; thai7 f2194–95.

**8/8 session C đã scan** — `hiep_thai5` registry PASS 3977/3977, flag-density cao nhất (822 flags ≈ 0.21/frame — chủ yếu machinery churn trên xe thật, đã confirm bằng V4 eyeball).

Rare flags thai5: TRACK_JUMP 15 (nhiều nhất cohort), GID_LINEAGE 1, BBOX_JUMP 6 — toàn bộ trong event-dense windows đã xem (74/74 FULL).
