# notes/predictions-jsonl.md — Step A bảng nguồn (backfill builder-c, 2026-10-06)

Files đọc: `backend/main_detect/src/techgar/prediction_writer.py`,
`two_camera.py` (wiring + GT), `reidfix_r0_session_thai7/predictions.jsonl` (thực).
Chi tiết trong `js/pages/predictions-jsonl.js` ⑦.

## giá trị → file:dòng → kind
| giá trị | nguồn | kind |
|---|---|---|
| PREDICTION_SCHEMA_VERSION = 3 (khác snapshot v2) | prediction_writer.py:16 | runtime |
| 18 trường top-level (frame thật thai7) | two_camera.py:3038-3061 | runtime |
| camera_skew_ms = abs(t_cam1 − t_cam2)/1e6, tròn 3 lẻ | prediction_writer.py:479 | runtime |
| ghi file qua queue counted_recording_action, ngoài vòng nóng | two_camera.py:3076-3080 | runtime |
| observation_uid = frame-%09d:cam:lid | prediction_writer.py:276-278 | runtime |
| 29 field/observation (đếm trên file thật) | prediction_writer.py:275-355 | runtime |
| 60 slot/frame (thai7), join từ binder.to_json | prediction_writer.py:197-198 | runtime |
| canonical_gid qua manager.canonical_global_id | prediction_writer.py:87-97 | runtime |
| event_uid = {category}-{serial:09d} | prediction_writer.py:99-102 | runtime |
| fingerprint = sha1(JSON sort-keys của event) | prediction_writer.py:39-46 | runtime |
| 44 loại identity event_type + 19 loại parking (thai7) | reidfix_r0_session_thai7/predictions.jsonl | runtime |
| 3 CSV GT đi kèm: slots/events/identity | two_camera.py:2125-2140 | runtime |
| vai trò: đầu vào đánh giá offline, không phải API live | prediction_writer.py:3-4 | runtime |
| thai7: 2872 dòng = 2872 frame | predictions.jsonl (đếm) | runtime |
| event đa số: association_rejected_stale_track ×2068 (thai7) | predictions.jsonl (thống kê) | runtime |
