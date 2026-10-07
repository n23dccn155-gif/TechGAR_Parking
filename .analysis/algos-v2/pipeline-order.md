# pipeline-order.md — Thứ tự thực thi N0–N15 đã xác minh theo source

**Status: DONE** (builder-c, Phase 1 · MEGAPLAN §1). Nguồn sự thật:
`backend/main_detect/two_camera.py:run()` (:2004) + `src/techgar/*`.
Mọi `:line` đã mở kiểm tra trên source hiện tại.

## 1. Bảng N0–N15 verified

| # | Node | Việc xảy ra | file:dòng | Tính chất |
|---|------|-------------|-----------|-----------|
| N0 | Thu frame 2 cam | `read_latest_timed` (live) / `replay.read_pair` + `synchronize_live_frames` (skew ≤ `--max-camera-skew-ms` 120ms, catchup reads) | two_camera.py:2460-2485 · sync :450 · :2087 | per-frame, đầu loop |
| N1 | ROI mask + priority regions | `build_recovery_priority_regions` truyền vào `process_frame`; bên trong `_detect` áp `_priority_mask` lên motion mask | two_camera.py:2683-2688 · motion_tracker.py:590, :834 | per-frame; **KHÔNG phải stage riêng** — nằm trong N5 (xem §4 lệch plan) |
| N2 | Slot vision (occupancy) | `process_parking_frame` → `detector.accept_evidence` → `binder.update_vision` | two_camera.py:2555-2654 · submit :2632 · apply :2605 | **worker song song** (ThreadPoolExecutor 2, :2280); replay inline :2515-2554 |
| N3 | Kalman predict | `_predict_tracks` trong `process_frame` | motion_tracker.py:2228 (:239) | per-frame, trong N5-N7 |
| N4 | Occlusion guard prepare | `occlusion_guard.prepare(tracks, predictions)` | motion_tracker.py:2230 | per-frame; enable=not `--no-occlusion-guard` (:2367) |
| N5 | Motion detect | `_detect` — temporal motion + priority mask + morphology + contour/blob validation | motion_tracker.py:2233 (:759, :522, :451) | per-frame |
| N6 | Assign detection↔track | `_assign` — LAPJV + gate (gọi lại `_predict_tracks` :1599 cho gate) | motion_tracker.py:2249 (:1597, :1193) | per-frame |
| N7 | Update/coast/expire/create | matched→`_apply_detection`; unmatched→coast/TTL/expire; det lẻ→`_create_or_reid` | motion_tracker.py:2251, :2291-2340 (:2096, :2009) | per-frame |
| N8 | Notify lost/expired | `manager.notify_track_lost/expired` + `binder.notify_track_lost/expired` | two_camera.py:2690-2716 | per-frame, sau tracker |
| N9 | Identity evidence | `sync_occluded_identities` + `register_independent_tracks` + `observe_trajectories` | two_camera.py:2719-2735 | per-frame |
| N10 | Departure recovery | `prepare_predeparture_tokens` + `recover_departing_vehicle_ids` → `protected_local_keys` | two_camera.py:2759-2773 (:1058) | per-frame |
| N11 | Handoff + GID | `manager.update_all_tracks(observable, …, protected_local_keys, protected_global_ids=pending_arrival_global_ids)` | two_camera.py:2774-2784 | per-frame |
| N12 | Slot binder fusion | `remap_vehicle_ids(canonical)` → `update_tracks` → `finalize_arrivals` | two_camera.py:2793-2806 (:2047, :2426) | per-frame; policy `vision_primary` (:2328): `occupied`=vision_occupied duy nhất (`slot_vehicle_binder.py`:3841-3847) — track chỉ gán/gỡ `vehicle_id`, bind yêu cầu ô vision_occupied (:2204-2207). "one-way override" docstring :1-6 là nhánh **legacy**, không chạy prod |
| N13 | Snapshot + reservation sync | `sync_parking_identity_reservations` (lần 2) → `manager.to_json` → `publish_snapshot(build_runtime_snapshot)` throttle `1/json_fps` | two_camera.py:2808-2871 · publish :2844 | per-frame, throttle ~5Hz |
| N14 | Gate/session | Process RIÊNG poll snapshot 8001 (`--poll-interval` 0.25s) → crossing ENTRY/EXIT → session/QR/exit-delete | gate_session_controller.py:865, :906 | **async consumer**, không trong loop |
| N15 | Frontend | Poll 200ms runtime (App.tsx:354-360) + 500ms session/reservations (:191, useVehicleSession.ts:27) → A* routeEngine, off-route | frontend/src/app/App.tsx | **async consumer**, không trong loop |

## 2. Thứ tự thật trong 1 vòng loop (`while True` :2444)

```
N0 capture+sync (:2460-2485)
  → begin_frame mỗi binder (:2508-2509)
  → áp parking evidence HOÀN THÀNH của worker (:2555-2667)   [comment :2511 "before identity allocation"]
     · staleness gate: result_age > parking_max_result_age_seconds → drop (:2587-2594)
     · accept_evidence monotonicity → drop 'evidence_not_monotonic' (:2596-2601)
     · submit job mới throttle 1/parking_fps (:2625-2654)
  → sync_parking_identity_reservations #1 (:2672-2677)      [FEEDBACK binder→tracker/manager]
  → tracker.process_frame mỗi cam (:2679-2689) = N3→N4→N5(→N1 trong mask)→N6→N7
  → notify lost/expired → manager+binder (:2690-2716)       [N8]
  → occluded/independent/trajectories (:2719-2735)          [N9]
  → prepare_predeparture_tokens + recover_departing (:2759-2773)  [N10]
  → update_all_tracks + protected_* (:2774-2784)            [N11]
  → cancel_observed_recovery_tokens (:2786-2791)            [FEEDBACK]
  → remap→update_tracks→finalize_arrivals (:2793-2806)      [N12]
  → sync_parking_identity_reservations #2 (:2808-2813)      [FEEDBACK → manager]
  → to_json + publish_snapshot throttle (:2815-2871)        [N13]
  → display/MJPEG stream (:2873+)                           [ngoài xương sống]
```

## 3. Config-time vs per-frame vs async

- **Một lần (setup :2004-2440)**: args/defaults; `LatestFrameCapture` live
  (:2068) hoặc `ReplaySession` (:2054); calibration/transforms/overlap_regions;
  `CrossCameraManager` (:2227); `ParkingDetector`×2 (:2263, **use_edge_recheck=False
  :2267** — code có nhưng production tắt); `parking_executor` 2 workers chỉ live
  (:2279-2282); `SlotVehicleBinder`×2 policy `vision_primary` (:2326-2360);
  `MotionVehicleTracker`×2 (:2365+); ROI masks.
- **Per-frame**: toàn bộ §2.
- **Async/song song**: parking worker pool (submit :2632, future đọc :2562);
  gate controller (process riêng, poll 0.25s); frontend (poll 200/500ms);
  MJPEG encode thread (`runtime_server.py:141`, latest-only mailbox :134);
  HTTP snapshot API (:8001).

## 4. Lệch plan/doc so với source (đã ghi chú)

1. **N1 không phải stage riêng**: plan xếp ROI mask như node độc lập; thực tế
   ROI/priority mask áp **bên trong `_detect`** qua `_priority_mask`
   (motion_tracker.py:834, nhận `priority_regions` từ binder recovery qua
   `build_recovery_priority_regions` :2683). Trên sơ đồ: N1 là cổng không gian
   trong N5 + kênh feedback binder→detector.
2. **N2 chạy song song, không trong chuỗi**: plan xếp N2 giữa N1/N3; thực tế
   worker riêng, kết quả áp **đầu vòng sau** trước identity (:2511 comment).
   KHÔNG ép tuyến tính: đây là nhánh có mailbox evidence.
3. **Edge recheck tắt production**: plan kể "Edge Recheck" trong ensemble;
   `use_edge_recheck=False` tại callsite (:2267) — code `parking_detector.py:552`
   tồn tại nhưng không chạy.
4. **Feedback hai chiều, không chỉ xuôi**: reservations sync ×2 (:2672, :2808),
   `protected_local_keys`/`pending_arrival_global_ids` (:2782-2783),
   `cancel_observed_recovery_tokens` (:2786) — binder ảnh hưởng ngược
   tracker/manager trong cùng/sau vòng.
5. **N14/N15 là consumer async**: plan xếp trong chuỗi N; thực tế process/ứng
   dụng riêng poll snapshot — không nằm trong loop.
6. **Replay khác live**: parking inline đồng bộ (:2515) trừ
   `--replay-async-vision`; pacing `--replay-realtime` (:2496).
7. **Doc cũ `phan_tich_chuyen_sau_thuat_toan_techgar.md`**: mô tả `main.py`
   (1 video 4 crop); `two_camera.py` là 2 capture riêng + skew sync +
   cross-camera manager — chỉ tham khảo ý tưởng.

## 5. Hành trình 1 xe — thứ tự nghiệp vụ vs runtime (verified)

| # | Bước nghiệp vụ | Runtime evidence | Khi nào xảy ra |
|---|----------------|------------------|----------------|
| J1 | Xe cắt vạch ENTRY | N14 crossing + `create_session` → `WAITING_FOR_SCAN` + QR (120s hiển thị, `session_manager.py:29,302`) | **Cú cắt vật lý có thể trước GID publish**; session luôn gắn GID đã có — `create_session(global_vehicle_id=…)` (`gate_session_controller.py:516-517`), record thiếu `global_id` bị skip (:461-462). Xe cắt vạch trước khi GID xuất bản được cứu bằng `recovered_entry_crossing` (:504-513) → `_recent_measured_entry_crossing` (:259-309): ≥2 mẫu `recent_observed_path` cùng camera+cùng local_track, gap ≤1.0s |
| J2 | Xe vào cam1 → track local | N0→N5→N6→N7 `_create_or_reid` (:2340) | per-frame |
| J3 | Cấp GID | N11 `update_all_tracks` (:2779) | per-frame |
| J4 | Claim QR → chọn ô | `claim_session` WAITING→`SELECTING_SPOT` (:355-358); `select_spot` → `NAVIGATING_TO_SPOT`/`RELOCATING` (:380) | nghiệp vụ (frontend 500ms poll) |
| J5 | Điều hướng đến ô | N15 A* routeEngine + off-route | nghiệp vụ (200ms poll) |
| J6 | Đỗ → PARKED | N2 vision vote + N12 binder arrival claim → `parking_episodes` → session `PARKED` | runtime (episode là authority) |
| J7 | Đứng yên → detection mất | N7 coast/suspend; N10 dormant token chuẩn bị (:2759) | runtime |
| J8 | Rời ô → giữ GID | N10 `recover_departing_vehicle_ids` → `protected_local_keys` → N11 tái gán đúng GID | runtime |
| J9 | Cắt EXIT | N14 exit crossing → `delete_session_by_global_id` (session_manager.py:585) | runtime+consumer |

Ghi chú: với J1, **cú cắt vạch vật lý** có thể xảy ra trước J3 (GID chưa
publish vì track mới tentative) — nhưng session chỉ được tạo khi snapshot
đã mang GID (kể cả nhánh recovered, vẫn tạo session gắn GID vừa có, nhờ
`recent_observed_path` chứng minh crossing đo được trước đó). Không có
session tồn tại trước GID. Journey ≠ call-order; map cần vẽ đúng cả hai.

## 6. Blockers / pending

- Không blocker. Tham số chi tiết từng card đang verify trong `builder-c.md`
  (7 thẻ: T1×2, T2×1, T3×4 — N0,N2,N12–N15).
