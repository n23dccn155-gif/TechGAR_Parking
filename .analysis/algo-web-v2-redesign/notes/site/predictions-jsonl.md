# predictions-jsonl — notes

## Nguồn đã đọc
- `backend/main_detect/src/techgar/prediction_writer.py` (504 dòng) — builder schema v3
- `backend/main_detect/two_camera.py` (đoạn 2039–3089) — chỗ mở file + ghi record
- File thật `experiment_test/output/reidfix_r0_session_thai7/predictions.jsonl` — 2872 dòng

## Ghi file (two_camera.py)
- Mở `predictions.jsonl` khi có session_dir (L2119) — cùng cụm với raw/debug mp4 + 2 CSV
- Mỗi frame: `prediction_builder.build_frame(...)` (L3038-3051) rồi append thêm `parking_episodes`, `pending_parking_confirmations`, `parking_pipeline` (L3052-3061), `json.dumps + "\n"` (L3062-3064)
- Ghi qua `counted_recording_action` queue (L3076-3080) — nằm ngoài vòng xử lý nóng
- Docstring module: "The live JSON files and the OpenCV UI intentionally do not use this module" → chỉ cho experiment/replay, KHÔNG phải API live

## Builder (prediction_writer.py)
- `PREDICTION_SCHEMA_VERSION = 3` (L16)
- `_RollingEventDelta` (L49-76): lịch sử event là deque có giới hạn → lấy delta bằng so khớp suffix/prefix trên cặp (id(event), sha1 fingerprint). Giữ được 2 event liền nhau giống-hệt-byte (không dedupe theo nội dung) và đúng khi deque trôi
- `event_uid = "{category}-{serial:09d}"` tăng đơn điệu (L99-102)
- `_normalise_event`: event_type từ `type`/`event_type` fallback "unknown"; frame từ `frame`/`frame_idx` fallback frame hiện tại; `canonical_gid` qua manager.canonical_global_id, `raw_gid` giữ nguyên; `details` = mọi field còn lại (L104-149)
- `_aliases`: retired_global_ids → cặp {alias_gid, canonical_gid} sort + map canonical→[aliases] (L151-173)
- `_slots`: join binder.to_json mỗi cam → 60 slot; field occupied/vision_occupied/tracking_occupied/decision_source/tracking_state/vehicle_overlap/stopped_for_ms/recovery_* (L190-234)
- `_observations`: telemetry mỗi tracker × cam → observation_uid `frame-%09d:cam:lid`; anchor_pixel = tracker_center; anchor_world từ world_observation global_position + shared_map_anchor.reference + world_unit; ~29 field (L236-356)
- `identity_state` = "unassigned" khi không có gid (L349-353)
- `camera_skew_ms` round 3 số lẻ (L479); skew thật thai7 f1 = 31.0 ms
- `trail_render_only` + `association_trajectory_policy` đi kèm từ registry

## File thật thai7 (2872 frame)
- Keys: 18 trường top-level
- identity event_type: 44 loại — nhiều nhất: association_rejected_stale_track 2068, track_frozen_stationary 655, stale_prediction_replaced_by_measurement_anchor 655, association_rejected_stale_prediction 652, dormant_reid_rejected 352, insufficient_strict_roi_support 241…
- parking event_type: 19 loại — departure_token_confirmed 52, slot_arrival_claim_started 40, retention_extended 39, parking_episode_opened 11…
- max slots/frame = 60, max observations/frame = 12
- Một frame = một dòng JSON (record tự chứa, đọc streaming được)
