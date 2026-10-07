# Notes — gate-session (Step A, đọc source trước khi viết trang)

## Nguồn
- `backend/gate_session_controller.py` (912 dòng): GateSessionCoordinator + HTTP API + main loop
- `backend/session_manager.py` (652 dòng): session store + state machine + reservations
- `backend/main_detect/config/gate_zones.json`: gate config thật đang dùng
- `backend/main_detect/runtime_server.py`: gate POST writer (đã đọc cho snapshot-api)

## Kiến trúc hai tiến trình
- `runtime_server` (port 8001): phục vụ `/api/runtime/snapshot` + stream + ghi `gate_zones.json`
- `gate_session_controller` (port 8000, `start_api_server` L849-852): session API + poll loop
  - Poll `/api/runtime/snapshot` mỗi `--poll-interval` 0.25s (L894-906), HTTP timeout 3.0s (L708)
  - `main()` bắt buộc `coordinate_space=="world"` cho runtime mode (L875-880)
- Session API routes:
  - GET `/api/sessions/reservations` | `/api/sessions/waiting` | `/api/sessions` | `/api/session/<id>` (L764-793)
  - POST `/api/session/claim` | `/api/session/select` | `/api/session/exit` (L813-825)
  - Idempotency: `expected_revision` + `action_id`/`actionId` → `actionReceipts` giữ 32 gần nhất (`_mutate_session` L316-352)
  - Lỗi typed: `SESSION_NOT_FOUND` 404 / `SelectionUnavailable` code+status / `REVISION_CONFLICT` 409 / `INVALID_SESSION_STATE` 409 (L828-837)

## Session store
- File `backend/data/navigation_sessions.json` (env `TECHGAR_SESSIONS_FILE`, L23-26), `atomic_write` L91
- `sessionId = secrets.token_urlsafe(12)` (L283); QR hiển thị `QR_DISPLAY_SECONDS = 120.0` giây (L29, L302)
- Một session mở mỗi `(globalVehicleId, runtimeId)` — `create_session` trả về session đang mở nếu có (L275-281)
- States: WAITING_FOR_SCAN →(claim)→ SELECTING_SPOT →(select_spot)→ NAVIGATING_TO_SPOT | RELOCATING (nếu đã có `actualParkedSpotId`) → PARKED → EXIT_NAVIGATION → xóa khi qua exit gate
- `select_spot(session, None)` → quay lại SELECTING_SPOT/PARKED, xóa targetSpotId (L385-387)
- `set_parked` cấm khi `EXIT_NAVIGATION` → `InvalidSessionState` (L402-405); idempotent cùng spot (L407-408); `parkedAt` ghi lần đầu
- `apply_departure_episode` chỉ áp dụng nếu `parkingEpisodeId` khớp → clear `actualParkedSpotId`, PARKED→SELECTING_SPOT (L439-447)
- Reservations: session ở NAVIGATING_TO_SPOT/RELOCATING có `targetSpotId` → giữ chỗ (L33, L220-253)
- `_validate_selection` (controller L69-89): RUNTIME_MISMATCH / SPOT_RESERVED / RUNTIME_UNAVAILABLE 503 / SPOT_NOT_AVAILABLE — check availability qua snapshot mới nhất ≤5s (L154-165)

## Coordinator — `process_snapshot` (L401-534)
Guards đầu vào:
- `schema_version==2` + `_fresh_live` + có `runtime_id`, trừ khi `allow_legacy` (--source file) (L402-404)
- `_fresh_live`: `source_mode=='live'`; mọi camera `online` và `age_ms ∈ [0,5000]`; `published_at` tuổi ∈ [-1,5]s (L103-125)
- Unit gate ≠ unit snapshot → `ValueError` crash (L407-410)
- `runtime_id` đổi → reset toàn bộ vị trí/candidate/timestamp/cursor (L414-424)
- Frame rewind (`frame_index < last`) → bỏ qua (L437-442); cùng frame → chỉ apply episodes rồi return (L450-454)
- Alias: `retired_global_ids` + event `global_id_merged` → `remap_global_vehicle_id`; conflict → `identity_conflicts`, xe bị skip (L343-399, L464)
- Xe hợp lệ: `global_id` int + `position` (L467-469); source timestamp phải đơn điệu (L476-479)

Phát hiện qua cổng (crossing):
- Gate = đoạn thẳng p1→p2 trong `gate_zones.json`; cắt đoạn qua `check_line_intersection` + hướng `_crossed_in_valid_direction` dùng dấu `cross_side` (L229-257)
- `direction: "positive"|"negative"` = hướng hợp lệ của crossing
- ENTRY tạo session khi `observation_is_continuous` (observed + có prev + Δt quan sát ≤1.0s + Δt source ≤1.0s) (L480-513)
- `recovered_entry_crossing`: dùng `recent_observed_path` (12 mẫu cuối) — cần 2 mẫu liên tiếp cùng camera + cùng local track, gap ≤1.0s, gần thời điểm hiện tại ≤1.0s → cho phép xe vào nhanh trước khi Global ID publish (L259-309)
- EXIT crossing → `delete_session` nếu có session (L523-534)

Parking episodes (schema v2, `_apply_parking_episodes` L628-703):
- Lọc episode hợp lệ: `0 ≤ evidence_frame_idx ≤ applied_frame_idx ≤ frame_index`, có `parking_episode_id`+`slot_id` (L636-644)
- Mỗi gid chọn episode mới nhất theo (applied_frame_idx, applied_timestamp_s, revision, state_rank parked<departing<released) (L649-663)
- Conflict guards: gid trong `identity_conflicts`, gid sở hữu >1 slot, slot có >1 gid → diagnostic `identity_or_slot_owner_conflict`, skip (L664-668)
- Cursor per session để idempotent: episode cũ hơn cursor → `episode_older_than_session_cursor`; không mới hơn trong cùng frame (kể cả revision) → `episode_not_newer_within_frame` (L673-690)
- `parked` + không phải EXIT_NAVIGATION → `set_parked_by_global_id`; `departing|released` → `apply_departure_episode`; lỗi → `session_rejected:<err>` + log `[SESSION WAIT]` (L691-703)

Legacy path (không v2):
- `parked_slot_id` + slot kia `stopped_for_ms/1000` ≥ `parked_confirm_seconds` (default 2.0, L319/866) → `set_parked` (L565-596); evidence chỉ đếm nếu slot.vehicle_id==gid và tracking_state=='parked' (L128-144)
- Departure: PARKED + movement ≥ 0.25 đơn vị world trong 2 quan sát liên tục → `set_exit_navigation` (L599-621)
- Candidates prune khi gid biến mất khỏi snapshot (L623-626)

## Gate config thật (`gate_zones.json`)
- `coordinate_space:"world"`, `unit:"cm"`, `source:"frontend_shared_map"`, schema_version 1
- entry_gate "Cổng vào": p1(39.6688, 8.9029) → p2(38.8685, -5.9998), direction **positive**
- exit_gate "Cổng ra": p1(50.8338, 63.3703) → p2(49.3925, 51.4338), direction **negative**

## Figure — chiếu gate lên cam2
- `camera_transforms` trong `two_camera.shared_cm_01.json` là pixel→world (kiểm: px A cam1 → ~(0,0))
- Nghịch đảo để chiếu gate world→pixel:
  - cam1: cả 2 gate nằm NGOÀI khung (y âm) → không dùng cam1
  - cam2: entry (362.6,454.5)→(173.8,446.7); exit (1114.1,590.5)→(939.1,571.7) — cả hai trong khung
- Figure: `gate-session-cam2-gates.jpg` — vẽ trên `capture_cam2.png` (cùng attempt cal-20260927), entry xanh lá + exit đỏ, arrow p1→p2 làm orientation + nhãn direction sign

## Câu hỏi/limits
- QR TTL 120s chỉ giới hạn danh sách `waiting`; session không auto-close khi hết hạn (chỉ claim sau vẫn được? — claim không check expiry → UNCERTAIN, nêu là limit)
- `qrExpiresAt` là thời điểm hiển thị; `list_waiting_sessions` lọc `current_time < expiry`
- Exit chỉ xóa session khi xe còn được quan sát (`observed`) — xe mất dấu trước cổng thì session còn lại (limit)
