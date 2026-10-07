# Builder-B — Phân tích `backend/main_detect` (TechGAR)

Ngày phân tích: 2026-10-04 · Nhánh git: working tree (có thay đổi chưa commit)

---

## 1. Phạm vi & phương pháp

**Phạm vi được giao:** `backend/main_detect` — motion detection, multi-object tracking (MOT), `SlotVehicleBinder`, dual-camera handoff, calibration và cấu hình detector/tracker/binder. Theo dấu dữ liệu `frame → detection → track → slot occupancy → identity/session`. Mối nối sang `backend/gate_session_controller.py` chỉ được đọc ở mức contract (ngoài phạm vi chính).

**Phương pháp:**
- Đọc tĩnh toàn bộ mã nguồn trọng yếu (~17.4k dòng trong `src/techgar/`, 3.3k dòng `two_camera.py`, 427 dòng `runtime_server.py`), manifest, config JSON, tài liệu runbook.
- Chạy unit test suite (không phải dịch vụ/hardware). Để tái lập:
  - Working directory: `D:\TechGar2\backend\main_detect`
  - Lệnh: `./.venv/Scripts/python.exe -m pytest -q` (Git Bash; PowerShell tương đương `.\.venv\Scripts\python.exe -m pytest -q`)
  - Kết quả đầu ra tổng kết (dòng cuối): `448 passed in 7.88s` — 46 file test trong `tests/` (`pytest.ini`: `testpaths = tests`, `python_files = test_*.py`)
  - Lưu ý tái lập: lần chạy đầu thêm `--timeout=300` bị từ chối (`pytest-timeout` chưa cài, exit 4) → kết quả trên là lần chạy không flag.
  - Đây là bằng chứng ở mức unit-test có mock/giả lập — KHÔNG phải kiểm chứng end-to-end trên camera thật.
- Phân biệt rõ trong báo cáo: **[code]** = chắc chắn từ mã nguồn; **[test]** = có unit test pass; **[giả định]** = suy luận; **[chưa xác minh]** = không đủ bằng chứng.
- Trạng thái git: `cross_camera_manager.py`, `slot_vehicle_binder.py`, `trajectory_memory.py` + 2 file test đang **modified chưa commit** (thêm fallback `escape_outward_ready` cho departure recovery — ~235 dòng diff). Phân tích dựa trên working tree, không phải HEAD.

## 2. Kiến trúc & tech stack

**Stack [code]:**
- Python **3.11.9** — đo trực tiếp: `.venv/Scripts/python.exe --version` (venv `backend/main_detect/.venv`; `.pyc` cpython-311 tương thích, chỉ là bằng chứng phụ).
- Runtime deps duy nhất: `opencv-python>=4.10`, `numpy>=1.26`, `lap>=0.5.12` (`requirements.txt`). Dev: `pytest>=9.0` (`requirements-dev.txt`).
- HTTP server: `http.server.ThreadingHTTPServer` chuẩn (`runtime_server.py:11,231`), MJPEG + JSON API, không framework.
- **Không dùng model học máy nào** trong pipeline này: detection = MOG2 background subtraction + temporal frame-diff + contour; ReID = HSV/LAB histogram + tracklet gallery (`motion_tracker.py:1-7,203`, `tracklet_descriptor.py`). `use_deep_reid=True` bị từ chối tường minh bằng `ValueError` (`cross_camera_manager.py:391-395`). Hai file `backend/yolov8n.pt`, `backend/cnn_parking.h5` thuộc backend cũ, KHÔNG được `main_detect` import (đã grep: không có torch/ultralytics/dnn/keras trong `src/`).

**Sơ đồ tầng (mỗi frame, một vòng lặp đơn luồng trong `two_camera.run`):**

```
LatestFrameCapture/cv2.VideoCapture (cam1, cam2)
        │  đồng bộ skew ≤120 ms, catch-up ≤3 reads (two_camera.py:450-483, 2482-2485)
        ▼
ParkingDetector detect()  ── worker pool 2 threads, ~2 Hz (two_camera.py:2279-2282, 2632-2646)
        │  SlotResult[] ── accept_evidence() (monotonic gate, dwell hysteresis)
        ▼
SlotVehicleBinder.update_vision()  ── occupied/free, departure token, arrival claim
        │
MotionVehicleTracker.process_frame()  ── MOG2+motion mask → detections → LAPJV → local track_id
        │
        ▼ (trajectory memory → predeparture tokens → token recovery)
CrossCameraManager.update_all_tracks() ── (cam,local) → global_id; handoff/dormant/merge
        │
        ▼
binder.update_tracks() + finalize_arrivals() ── gắn global_id vào slot
        │
        ▼ registry = manager.to_json()
build_runtime_snapshot() → RuntimeState.publish_snapshot() → GET /api/runtime/snapshot (5 Hz)
        │                                          └→ /api/runtime/cameras/camN.mjpg (lazy, ≤8 fps)
        ▼
gate_session_controller.py (port 8000) ── sessions keyed by vehicles[].global_id
```

## 3. Module chính

| Module | Vai trò | Kích thước |
|---|---|---|
| `two_camera.py` | Runner chính: parse args (~70 tham số), nạp calibration/masks, vòng lặp pipeline, ghi session, publish runtime | 3333 dòng |
| `runtime_server.py` | HTTP API port 8001: `/api/runtime/{status,snapshot,map,events,gates}`, `cameras/camN.{jpg,mjpg}`; quản lý gate_zones.json | 427 dòng |
| `run_two_camera_session.py` | Wrapper CLI: live URL hoặc replay `raw_camN.mp4` + `frame_timestamps.csv` | 138 dòng |
| `src/techgar/parking_detector.py` | `ParkingDetector`: ensemble 25 biến thể (gamma×CLAHE) adaptive-threshold cho từng slot ROI; `TemporalSmoother`; `accept_evidence` hysteresis | 749 dòng |
| `src/techgar/motion_tracker.py` | `MotionVehicleTracker`: MOG2 + temporal-motion gate + ROI mask + occlusion guard/watershed + Kalman CV + LAPJV assignment + HSV/LAB tracklet ReID ngắn hạn | 2484 dòng |
| `src/techgar/slot_vehicle_binder.py` | `SlotVehicleBinder`: fuse vision & tracking → `occupied` + `vehicle_id`; arrival claims, departure tokens, recovery batch (LAPJV) | 3919 dòng |
| `src/techgar/cross_camera_manager.py` | `CrossCameraManager`: cấp/merge Global ID, handoff entries, dormant ReID, world-trajectory memory, identity lifecycle | 7775 dòng |
| `src/techgar/vehicle_tracker.py` | `TrackStatus` (TENTATIVE/CONFIRMED/LOST), `TrackedVehicle` dataclass | 93 dòng |
| `src/techgar/tracklet_descriptor.py` | Appearance tracklet gallery (HSV+LAB+spatial histogram), `compare_tracklets` | 351 dòng |
| `src/techgar/trajectory_memory.py` | `WorldTrajectoryMemory`: quỹ đạo world 2s cho ReID bằng hình học | 552 dòng |
| `src/techgar/occlusion_guard.py` | Nhóm track bị merge blob; watershed tách vùng | 232 dòng |
| `src/techgar/latest_frame_capture.py` | Thread đọc stream chỉ giữ frame mới nhất (không backlog) | 128 dòng |
| `src/techgar/runtime_contract.py` | `build_runtime_snapshot` — schema v2 payload cho web/gate | 168 dòng |
| `src/techgar/prediction_writer.py` | `predictions.jsonl` schema v3 cho đánh giá offline | 504 dòng |
| `src/techgar/live_roi_editor.py` | Editor ROI/slot tương tác trong UI OpenCV | 383 dòng |
| `calibrate_map.py`, `tools/` | Toolchain calibration: rectangle-line, shared-map homography, gate zones, slot picker | ~800+ dòng |
| `mask_roi.py` | Vẽ ROI mask polygon cho camera | 122 dòng |

## 4. Luồng dữ liệu chi tiết (frame → detection → track → slot → identity/session)

1. **Capture & đồng bộ [code]:** Hai nguồn — live (`LatestFrameCapture` cho `rtsp/http(s)`, thread drain + monotonic ns timestamp; `two_camera.py:2065-2086`) hoặc replay (`ReplaySession` ghép cặp theo `frame_timestamps.csv`, `two_camera.py:146-263`). `synchronize_live_frames` đẩy stream chậm tới skew ≤ `--max-camera-skew-ms` (mặc định 120 ms, `two_camera.py:1997`, tối đa 3 lần catch-up, `:450-483`). Một stream chết → `TimeoutError` → kết thúc toàn session (`:2472-2481` — cả hai camera dừng cùng lúc, không degrade một camera).
2. **Vision evidence trước identity [code]:** Comment tại `two_camera.py:2511-2514` nêu rõ kết quả occupied→empty phải áp dụng trước khi cấp GID. Live path: `ThreadPoolExecutor(max_workers=2)` chạy `process_parking_frame` ở `--parking-fps` (mặc định 2 Hz, `:1784`); kết quả bị loại nếu `result_age_s > --parking-max-result-age-seconds` (mặc định 1.0s, `:2587-2594`) hoặc không monotonic (`accept_evidence`, `parking_detector.py:602-645`). Replay đồng bộ (deterministic) trừ khi `--replay-async-vision`.
3. **Detection (motion) [code]:** `MotionVehicleTracker._detect` (`motion_tracker.py:759+`): MOG2 `history=700, varThreshold=32` (`:203`) → bitwise-and với temporal motion mask (bắt buộc — foreground đứng yên không thành detection, `:790-793`) → ROI mask + context band `roi_context_padding_px=48` (`:794-816`) → morphology open/close → contour filters (min_area 650, bbox ratio caps 0.30/0.42/0.12 của frame, `:831-833`) → strict-ROI support floor (`:876-920`) → cast-shadow discriminator (`_is_cast_shadow`, `:705`) → occlusion guard: merged blob → group hoặc watershed partition (`:922-954`).
4. **Association/track [code]:** Kalman constant-velocity predict (`_predict_tracks`, `:239`), giới hạn extrapolation `max_prediction_age_seconds=0.40` (`:165-167`); LAPJV (`lap.lapjv`, `:16`) trên ma trận cost `0.45·distance + 0.25·(1-IoU) + 0.20·appearance + 0.10·size`, ngưỡng `assignment_cost_limit=0.90` (`:158, 1761-1767`); reacquire window 1.5s (3.0s nếu merged-freeze, `:1637-1641`); LOST sau khi miss detection; expire sau `lost_track_ttl=90` frame hoặc TTL-giây suy ra (`:2305-2309`). TENTATIVE→CONFIRMED qua `min_visible_count=3` + `min_confirm_displacement` (`_is_confirmable`, `:2071`).
5. **Slot occupancy [code]:** `ParkingDetector.detect` — mỗi slot ROI: 25 phiếu (5 CLAHE × 5 gamma) adaptiveThreshold; `free` nếu `empty_votes ≥ 12` VÀ không có core-rescue (`parking_detector.py:533-549`); selective line filter loại vạch kẻ mảnh chạm biên (`:362-387`); `accept_evidence` áp dwell: commit occupied cần ≥2 mẫu + `occupied_seconds=0.5s`, commit free cần ≥3 mẫu + `empty_seconds=1.0s` (`:637-640`); slot chưa khởi tạo mặc định `occupied=True` — "unknown không phải ô trống" (`:641-644`).
6. **Bind slot↔identity [code]:** `SlotVehicleBinder` policy `vision_primary` (set tại `two_camera.py:2328`): `occupied = vision_occupied` tuyệt đối (`_sync_result`, `slot_vehicle_binder.py:3840-3847`) — tracking KHÔNG thể biến ô trống-vision thành occupied trong policy này (gate tại `:2204-2221` skip mọi candidate khi `not binding.vision_occupied`). `vehicle_id` được gắn qua 2 đường, cả hai đều yêu cầu `vision_occupied`: (a) `_try_commit_arrival_claim` — cần `vision_occupied_streak ≥ 2`, claim `lost_at_s` + `observations ≥ 3` + `max_overlap ≥ 0.35` + chứng minh quỹ đạo vào ô (`:1176-1222`); (b) strong-overlap dwell `overlap ≥ 0.60` + `_is_stopped`/`_strong_overlap_is_stable` (`:2246-2284`). Release: ra khỏi ô `exit_seconds=0.5s` → `_release_vehicle`, nhưng `vehicle_id` sticky tới khi vision thấy empty (`:2000-2008`) → tạo `DepartureToken` (TTL `slot_recovery_seconds=5s`, gia hạn ≤4×, `:271-278`).
7. **Identity/session [code]:** `manager.to_json` → `registry` (`cross_camera_manager.py:7628+`) → `build_runtime_snapshot` (`runtime_contract.py:37-168`) với `schema_version=2` (`:12`): `vehicles[]` (global_id, state, observed, position world, parked_slot_id), `parking_slots[]` (occupied/vehicle_id/tracking_state…), `parking_episodes`, `retired_global_ids`, `recent_events` (≤100). Publish 5 Hz (`--json-fps`, `two_camera.py:2817`). Gate controller yêu cầu `schema_version==2`, `source_mode=="live"`, có `runtime_id` (`gate_session_controller.py:401-403`), session key = `vehicles[].global_id` (`:3-4`), xử lý merge qua `retired_global_ids` + event `global_id_merged` (`:353-385`), xác nhận PARKED qua `parking_slots[].vehicle_id` + `tracking_state=="parked"` (`:128-141`).

## 5. Interface & contract liên quan

**Nội bộ (Python):**
- `MotionVehicleTracker.process_frame(frame, timestamp_s, priority_regions) → (tracks, mask, expired_tracks)` (`motion_tracker.py:2204-2342`).
- `CrossCameraManager.update_all_tracks(all_tracks, frame_idx, camera_timestamps_s, protected_local_keys, protected_global_ids) → {cam: {local_id: global_id}}` (`cross_camera_manager.py:7075-7082`). `protected_local_keys` cô lập fragment khỏi mọi đường cấp ID (để token recovery thắng) — contract quan trọng với binder.
- `SlotVehicleBinder.update_vision(results, frame_idx, timestamp_s, camera_id, evidence_frame_idx, evidence_timestamp_s)` — evidence monotonic: kết quả cũ hơn evidence đã ghi bị bỏ (`slot_vehicle_binder.py:2462-2478`). `update_tracks(active_global_tracks, ...)` nhận track đã remap GID.
- `binder.export_recovery_tokens / consume_recovery_match / batch_recover_ids` — API token recovery dùng bởi `recover_departing_vehicle_ids` (`two_camera.py:1058-1137`).

**Bên ngoài (HTTP, port 8001) [code] `runtime_server.py`:**
- `GET /api/runtime/snapshot` — schema v2 ở trên; 503 khi chưa sẵn sàng (`:285-309`).
- `GET /api/runtime/map` — `coordinate_space` + `slot_layout` (`:296-302`).
- `GET /api/runtime/events` — `recent_events` (`:310-313`).
- `GET/POST /api/runtime/gates` — validate `coordinate_space=="world"`, unit khớp runtime, direction ∈ {positive,negative}, write file nguyên tử (`:52-81, 314-353`).
- `GET /api/runtime/cameras/camN.{jpg,mjpg}` — lazy: chỉ render/encode khi có subscriber ≤5s (`needs_frame`, `:173-180`); latest-only mailbox không backlog (`:134-139`).
- CORS `*` (`:250`) — API mở toàn mạng, không auth.

**File contract [code]:**
- Calibration JSON: `schema_version≥5` bắt buộc `calibration_status=="passed"` hoặc `rectangle_line_v1` + `reviewed_fit` + `fit_gate` pass (`two_camera.py:284-304`); `camera_transforms` homography 3×3 khả nghịch cho cả 2 cam (`:305-313`); `edge_adjacency` CỨNG phải đúng `cam1:right→cam2, cam2:left→cam1` (`:318-320`); `validated_ground_overlap_world_polygon`/`overlap_world_polygon` ≥3 điểm (`:324-331`); `exit_zones` optional; `matching_defaults`/`tracking_defaults`; `parking_slots_world` dùng suy ra ngưỡng match (`median_slot_length`, `:395-423`). Aspect ratio runtime phải khớp calibration ±0.5% (`adapt_calibration_to_frame_sizes`, `:344-378`).
- `parking_slots_camN.json`: `{imageWidth, imageHeight, slots[{id,polygon,center,...}]}` — 30 slot/cam trong config hiện tại; ref resolution 1280×720, scale theo runtime (`parking_detector.py:149-159, 230-231`).
- `roi_mask_camN.json`: `{polygon, image_size}`, optional `handoff_edge` legacy override adjacency (`two_camera.py:2213-2225`).
- `two_camera.detector.json`: profile tuning per-cam (gamma/clahe/ratio_thr/border/core…), áp khi `--no-display` hoặc replay (`two_camera.py:2306-2319`).
- Session output: `raw_camN.mp4`, `debug_camN.mp4`, `frame_timestamps.csv`, `performance.csv`, `predictions.jsonl` (v3), `ground_truth_*.csv` templates, `session_info.json` (schema 3, kèm sha256 từng config + git commit + dependency versions, `:3182-3327`).

## 6. ID theo camera/global & handoff

- **Local track ID**: int tuần tự per `MotionVehicleTracker` (`_next_id=1`, `motion_tracker.py:206`); sống trong một camera; status TENTATIVE→CONFIRMED→LOST→expired. Không bao giờ được coi là identity toàn cục.
- **Global ID**: int tuần tự (`cross_camera_manager.py:399-402`); map `(cam_id, local_id) → global_id` qua `_local_to_global` (`:293`). **Chỉ confirmed track mới được cấp GID mới** — tentative chỉ được nhận GID qua handoff (`:7084-7087, 7243-7251`); `_new_global_id_ready` đòi ≥5 quan sát thật (≥12 nếu kích thước bất thường) + displacement ≥0.15·bbox diagonal (`:2337-2420`, args `:1980-1996`). Merge tạo alias vĩnh viễn `_global_aliases` → `retired_global_ids` trong snapshot (`:303, 7745`); binder tự `remap_vehicle_ids` mỗi frame (`two_camera.py:2794`).
- **Handoff [code]:** entry mở khi track confirmed + vận tốc world ≥0.20 đi vào `overlap_world_polygon` (`edge="overlap"`) hoặc ra `_outward_edge` có adjacency (`:2647-2673, 2475-2549`); entry mang last_world + velocity_world + appearance gallery per-camera (`:2724-2736`). TTL `--handoff-ttl=45` frame hoặc giây (`:3458-3467`). Match một batch LAPJV (`_match_pending_handoffs`, `:3442+`) qua `_candidate_cost`: residual ≤ `prediction_radius`, corridor entry-depth, appearance ≤0.45 (target gallery) / `handoff_appearance_threshold=0.45`, direction cosine ≥`handoff_min_direction_cosine=0.25` (`:2831-2950`); soft-candidate vẫn ở trong ma trận để tránh unique-ảo (`:2945-2950`). Huỷ khi identity parked hoặc đã có member confirmed ở target (`:3471-3495`).
- **Dormant ReID:** identity mất quan sát → `dormant`/`handoff`, giữ `identity_retention_seconds=60s` nếu parked-reserved, `12s` nếu moving (`:158-182`); match qua `_match_dormant_identities` + reachable-distance limit (speed×elapsed+margin) + world-trajectory memory (`:4911+, 5748+`).
- **Lifecycle states:** `active, handoff, dormant, parked, recovery_pending, parking_verification_pending, exited, expired` (`:611,645,676,7066-7073,7610`); `exited` khi vào `exit_zones` (`_mark_identity_exited`, `:664-690`); terminal states bị lọc khỏi `vehicles[]` (`runtime_contract.py:13,76-77`).

## 7. Chức năng đã có vs dự kiến

**Đã có (code + 448 test pass):**
- Motion detection MOG2 + temporal gate + ROI/context band + shadow reject + occlusion guard/watershed — có test (`test_motion_tracker_multiscale`, `test_stability_occlusion`, `test_parking_detector_*`).
- MOT Kalman + LAPJV + appearance/spatial tracklet + reacquire — có test.
- Slot occupancy ensemble 25-vote + dwell + vision_primary binder (arrival claim, sticky ID, departure token, token recovery cross-camera) — có test (`test_slot_vehicle_binder`, `test_departure_transaction`, `test_gid_*` ~20 file).
- Dual-camera handoff overlap/edge + dormant ReID + merge/alias + provisional identity — có test.
- Calibration toolchain (rectangle_line_v1, shared map cm), gate zones API, ROI editors — có test (`test_rectangle_line_calibration`, `test_shared_map_calibration`, `test_live_roi_editor`).
- Runtime API + MJPEG + snapshot v2 + session recording/replay deterministic — có test (`test_runtime_contract`, `test_runtime_server`, `test_two_camera_replay`).

**Dự kiến/chưa hoàn thiện:**
- **DeepReID**: tham số tồn tại nhưng raise `ValueError` — chưa có model/pipeline crop (`cross_camera_manager.py:388-397`). Docstring tracklet_descriptor nói "không cần neural graph model" — hướng ReID học sâu là dự kiến, chưa ship.
- **WIP chưa commit**: fallback `escape_outward_ready` (pixel-escape) cho departure recovery + thay đổi trajectory/manager kèm test mới — đang trong working tree (git diff, ~235 dòng).
- `use_edge_recheck` bị ép `False` trong runner dù constructor hỗ trợ (`two_camera.py:511, 2267`) — pass 2 edge-recheck là code chết trong runtime hiện tại.
- Comment "Priority 4/6/7/9" rải rác trong manager — roadmap nội bộ đã thực hiện một phần (priority 9 = DeepReID chưa làm).

## 8. Điểm mạnh / điểm yếu

**Mạnh:**
- Thiết kế phòng thủ nhất quán: "unknown ≠ free" (`parking_detector.py:641-644`), vision owns occupied, token/claim chỉ là evidence không phải quyết định, provisional/protected chặn cấp GID vội — nhiều comment chỉ rõ failure thực đã gặp (hiep2/D01, M08, bt f1070).
- Replay deterministic đầy đủ (timestamp CSV, sync parking, config hash sha256 + git rev trong session_info) — nền tốt cho nghiên cứu/ablation.
- Contract ổn định có versioning (snapshot v2, predictions v3, session_info v3, calibration v5, gate v1) và validation nghiêm khi nạp calibration (homography khả nghịch, aspect mismatch reject).
- Tách biệt clock nguồn (camera monotonic ns) khỏi clock áp dụng; stale-vision rejection đo bằng tuổi kết quả thật.
- Test coverage rộng cho các failure mode identity (20+ file test_gid_*), 448 test xanh.

**Yếu:**
- `cross_camera_manager.py` 7.8k dòng / `slot_vehicle_binder.py` 3.9k dòng — god-object, nhiều heuristic lồng nhau khó review; phần lớn logic chạy đúng nhờ test mô phỏng, chưa có chứng cớ metric live trong phạm vi phân tích.
- Topology 2-camera **hard-coded**: `load_calibration` bắt adjacency đúng `cam1:right→cam2, cam2:left→cam1` (`two_camera.py:318-320`); manager/handler cũng hard-code `("cam1","cam2")` (`runtime_server.py:326`). Mở rộng >2 cam cần sửa code, không chỉ config.
- Vòng lặp chính đơn luồng: một camera die → toàn session dừng (`two_camera.py:2472-2481`); CPU nghẽn → frame cũ bị drop qua latest-only (chấp nhận được nhưng giảm FPS hiệu dụng).
- Trong `vision_primary`, tracking hoàn toàn bất lực khi vision sai free→occupied lẫn occupied→free cho màu slot (chỉ đổi được `vehicle_id`/token) — một lỗi ensemble kéo dài sẽ kéo cả occupancy lẫn reservation theo.
- CORS `*` + không auth trên API runtime và POST gates (`runtime_server.py:250,335-353`) — chấp nhận được trong LAN lab, rủi ro nếu expose.
- `print()` tiếng Việt/emoji rải rác trong hot path (`slot_vehicle_binder.py:1979,2045`, `cross_camera_manager.py:2738`); logging không qua `logging` module.
- File `nul` lạc ở repo root — **untracked**, 54 B (hiện trong `git status` dạng `?? nul`; nhiều khả năng artifact của một redirect nhầm). `__pycache__/` tồn tại trên disk nhưng **không tracked**: `git ls-files` khớp 0 file và cả root `.gitignore` lẫn `backend/main_detect/.gitignore` đều đã che — chỉ là nhiễu thư mục làm việc, không phải vấn đề git.

## 9. Rủi ro (ưu tiên × tác động)

| # | Ưu tiên | Rủi ro | Tác động | Bằng chứng |
|---|---|---|---|---|
| R1 | **Cao** | Occupancy phụ thuộc hoàn toàn ensemble pixel 2 Hz (`vision_primary`): thay đổi ánh sáng/nền/vạch kẻ → occupied/free sai; tracking không thể sửa màu slot (gate `:2204-2221`, `_sync_result:3842`) | Slot báo sai → session/route sai; departure token tạo sai → GID có thể bị consume nhầm | `parking_detector.py:533-549`; `slot_vehicle_binder.py:2501-2568` |
| R2 | **Cao** | Một camera/stream chết → `TimeoutError` → break toàn pipeline; không chạy degrade một camera | Mất toàn bộ tracking + API (snapshot đứng yên, `online=false` sau 5s) | `two_camera.py:2460-2481`; `runtime_contract.py:128-129` |
| R3 | **Trung** | Departure-recovery yêu cầu ≥3 mẫu + appearance ≤0.62 + bằng chứng đi ra; xe đồ chơi nhanh/che khuất có thể không đủ mẫu trước khi hết token 5s | GID mới được mint cho xe cũ → nhân đôi identity; đã có deferral nhưng bounded `max(handoff_ttl,60)` | `cross_camera_manager.py:7267-7284`; `slot_vehicle_binder.py:230,285`; args `two_camera.py:1883-1904` |
| R4 | **Trung** | Camera bị xê dịch/zoom sau calibration: chỉ phát hiện aspect-resize mismatch; drift pose thực tế không được giám sát runtime | Homography sai → world/handoff/dormant matching lệch toàn cục, im lặng | `adapt_calibration_to_frame_sizes:344-378` chỉ xử lý scale đều |
| R5 | **Trung** | Dormant ReID với appearance HSV/LAB trên xe mô hình màu gần nhau + cửa sổ reachable-distance | Sai identity sau dropout dài (12s moving / 60s parked); xác suất cao khi hai xe cùng màu | `cross_camera_manager.py:158-182, 4911+`; `tracklet_descriptor.py` |
| R6 | **Trung** | Retired-alias phụ thuộc consumer áp `retired_global_ids`/event `global_id_merged` đúng | Consumer bỏ qua → session mồ côi (gate controller hiện xử lý đúng — đã kiểm tra) | `runtime_contract.py:166`; `gate_session_controller.py:353-385` |
| R7 | **Thấp** | WIP chưa commit trên đúng các file hot-path (binder/manager/trajectory) | Hành vi hiện tại ≠ HEAD; risk regression nếu merge thiếu test — hiện test đi kèm | `git status/diff` |
| R8 | **Thấp** | Không auth + CORS `*`; POST /api/runtime/gates ghi file cấu hình | Ai đó trong LAN sửa gate → entry/exit logic sai | `runtime_server.py:250,335-353` |
| R9 | **Thấp** | Legacy paths (policy `legacy`, `use_edge_recheck`, `--legacy-parking-filter`, mask `handoff_edge`) còn sóng | Độ phức tạp đọc code/test; rủi ro cấu hình nhầm flag | `slot_vehicle_binder.py:267-270`; `two_camera.py:1785,2213-2225` |

## 10. Đề xuất cải tiến cụ thể

1. **Giám sát drift calibration runtime** (đáp R4): định kỳ so anchor world của các slot `vision_occupied` ổn định với `parking_slots_world`; cảnh báo khi median world-residual > ngưỡng — phát hiện camera xê dịch mà không cần calibration lại.
2. **Degrade graceful một camera** (đáp R2): bọc `read_latest_timed` per-camera với ngân sách retry + flag `cameras[cam].online` (field đã có trong contract, `runtime_contract.py:128-129`) thay vì `break` toàn session; gate controller có thể giữ session parked.
3. **Vision-health watchdog cho occupancy** (đáp R1): expose `evidence` counters (đã có: `empty_votes`, `filtered_ratio`, `removed_ratio` trong `SlotResult.evidence`, `parking_detector.py:584-595`) vào `parking_pipeline` status; cảnh báo khi nhiều slot dao động enter/exit hoặc vote sát ngưỡng — sớm phát hiện drift ánh sáng.
4. **Hoàn thiện & commit WIP departure-recovery** (đáp R7): merge có kiểm soát `escape_outward_ready` + test kèm; cân nhắc metric offline trên `experiment_test` trước khi chốt ngưỡng `recovery_min_radial_gain_px`.
5. **Trừu tượng topology camera** (đáp hard-code): thay `required` adjacency cứng và `for cam in ("cam1","cam2")` bằng vòng lặp theo `calibration.camera_transforms` — tiền đề mở rộng 3+ camera.
6. **Bảo mật tối thiểu**: bind `--api-host` mặc định `127.0.0.1` thay `0.0.0.0` (`runtime_server.py:401`) hoặc thêm token header cho `POST /gates` và stream; giữ `*` chỉ khi dev.
7. **Dọn nợ kỹ thuật nhẹ**: xoá file `nul` lạc ở repo root (`__pycache__` đã được `.gitignore` che đúng — không cần hành động git); chuyển `print` hot-path sang `logging`; đánh dấu deprecation cho policy `legacy`/`use_edge_recheck` trong `--help`.
8. **Nếu DeepReID trong roadmap**: định nghĩa interface `appearance_extractor` thay vì flag raise — cho phép inject extractor ngoài (ONNX) mà không chạm manager; hiện `use_deep_reid` là dead-parameter gây hiểu nhầm "đã có".

## 11. Giới hạn của phân tích & phần chưa xác minh

- **Chưa chạy pipeline live** (theo ràng buộc: không chạy dịch vụ/hardware); mọi kết luận hành vi runtime là suy luận tĩnh + unit test. 448 test pass KHÔNG chứng minh end-to-end trên camera thật.
- **Không đo được hiệu năng thực** (fps xử lý, độ trễ parking worker, skew thực tế giữa hai DroidCam); `performance.csv` chỉ được ghi khi chạy session.
- **`_candidate_cost`, `_match_dormant_identities`, `batch_recover_ids`** được đọc ở mức cấu trúc/gate chính; một số nhánh heuristic sâu (~1.5k dòng matching) chưa trace từng dòng — kết luận dựa trên gate điều kiện đã đọc.
- Working tree ≠ git HEAD (WIP chưa commit) — hành vi có thể khác sau khi commit/revert.
- `experiment_test/` (audit, evaluate metrics) chỉ được liệt kê, chưa phân tích — có thể chứa số liệu đánh giá thực nghiệm bổ sung cho LEAD.
- Frontend/gate controller chỉ đọc mức contract cần thiết; phân tích chi tiết thuộc phạm vi builder khác.
