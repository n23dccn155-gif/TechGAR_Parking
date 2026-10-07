# DOSSIER THUẬT TOÁN — BACKEND CV TechGar2 (builder-b)

**Phase**: 1 — chỉ dossier, chưa viết web app.
**Phạm vi nguồn**: `backend/main_detect/` (motion detection, MOT, occupancy, SlotVehicleBinder, dual-camera identity, calibration, scheduling/đồng bộ).
**Mục đích**: đặc tả đủ chi tiết để xây web học trực quan chạy **độc lập trong browser** — deterministic, không backend, không model, không network.

## 0. Quy ước đọc & luật mô phỏng

- `[code]` = kết luận trực tiếp từ source hiện tại (kèm đường dẫn:dòng, root-relative).
- `[test]` = có unit test ghi nhận lịch sử (`448 passed in 7.88s`; **không** chạy lại trong phase này).
- `[giả định]` = suy luận / lựa chọn thiết kế demo.
- `[chưa xác minh]` = chưa khẳng định được.
- `[sim]` = hành vi bản mô phỏng giáo dục. **`[sim-omits]`** = liệt kê cụ thể các gate/nhánh code gốc mà demo BỎ — mọi entry đều phải ghi rõ phần này, không được nói chung "giống hệt".
- `~` trước một con số = **demo parameter** (xấp xỉ từ đọc code, chưa đối chiếu literal); con số không `~` là literal đã xác minh. Danh sách giá trị chưa xác minh ở mục 5.

**Luật mô phỏng bắt buộc**:
1. Mọi sample JSON là input độc lập, chạy bằng JS thuần, deterministic. Đã verify bằng fixture của builder-b (`_verify4.mjs` — bằng chứng hiện hành, chạy `node`, không server); các fixture cũ `_verify{1,2,3}.mjs`/`cross-verify-c.py` đóng băng làm bằng chứng vòng trước và chứa assert đã superseded (xem mục 8) — số liệu "Expected" là đáp án kiểm chứng, không phải phỏng đoán.
2. Thuật toán dùng OpenCV/NumPy/`lap` được mô phỏng bằng **tương đương giản lược**: MOG2 → running-average background; Kalman → dự đoán vận tốc + lọc β; watershed → Voronoi nearest-seed; homography fit → DLT 4 điểm; histogram distance → `d = √(1 − Σ√(pᵢ·qᵢ))` (Bhattacharyya căn, đúng cv2 với hist Σ=1); `intersectConvexConvex` → raster-∩ trên lưới. **Đây là mô hình dạy học, không phải JS port thư viện.**
3. **LAPJV demo**: chỉ dùng **solver exact** — vét cạn toàn bộ phép gán trên ma trận ≤5×5 (`O(n!)`, chừng nào n nhỏ). Greedy chỉ được trình bày như **đối chiếu có nhãn** "tham lam ≠ tối ưu" kèm counterexample, không bao giờ là solver chính. Chi phí `unassigned = cost_limit` (mô phỏng `extend_cost=True`).
4. **Quy tắc scale ngưỡng**: ngưỡng pixel trong code (ví dụ `required_support≥20px`, `marker≥20px`, diện tích) được viết cho ảnh ~1280×720. Trên lưới demo 8×8/12×8 mọi ngưỡng pixel phải được **ghi lại giá trị đã scale** trong sample (`*_scaled`) — không dùng số gốc. Ngưỡng tỉ lệ (ratio, cosine, %) giữ nguyên. Raster demo: ô lưới nguyên `(x,y)` nằm trong đa giác chữ nhật `[xmin,xmax]×[ymin,ymax]` — quy ước bao gồm biên (gần `fillPoly`).
5. Complexity ghi 2 phần: `Độ phức tạp (code)` = code thật; `[sim]` = bản demo (ví dụ exhaustive assignment O(n!) thay LAPJV O(n³)).
6. Sample phải có **1 case thường + 1 case biên/lỗi**; Expected chỉ chứa đáp án đã verify.

**Khẳng định quan trọng**: pipeline `main_detect` hiện tại **không dùng YOLO/model neural**; `use_deep_reid=True` bị `raise ValueError` ngay trong constructor `CrossCameraManager.__init__` (`backend/main_detect/src/techgar/cross_camera_manager.py:391-395`) [code]. "LAPJV" = Jonker–Volgenant qua thư viện `lap` (`from lap import lapjv`), **không phải** "Hungarian" nói chung [code: `motion_tracker.py` (import), `slot_vehicle_binder.py`, `cross_camera_manager.py`].

## 1. Bảng inventory (58 mục = 57 canonical CV + 1 alias owner-C, 6 nhóm)

*Theo `algo-web/SPEC.md` §2: pack **cv** có 57 ID canonical; `replay-session-sync` (F9) là **alias** → `replay-timestamp-pairing` thuộc pack integration (owner C) — giữ trong dossier vì B sở hữu code-refs/bối cảnh producer.*

| # | ID | Nhóm | Module:symbol chính | Thư viện ngoài |
|---|----|------|---------------------|----------------|
| A1 | `mog2-foreground-mask` | Motion | `motion_tracker.py:_detect` | cv2 MOG2 |
| A2 | `temporal-motion-gate` | Motion | `motion_tracker.py:_temporal_motion_mask`, `_motion_between`, `_timestamp_references`, `_frame_gap_references`, `_brightness_shift` | cv2/numpy |
| A3 | `roi-strict-context-mask` | Motion | `motion_tracker.py:_detect` (ROI block), context-mask cache | cv2 |
| A4 | `foreground-morphology` | Motion | `motion_tracker.py:_detect` (OPEN/CLOSE) | cv2 |
| A5 | `contour-geometry-filter` | Motion | `motion_tracker.py:_detect` (contour loop) | cv2 |
| A6 | `bottom-center-anchor` | Motion | `motion_tracker.py:_ground_point`, `_bottom_center`; `cross_camera_manager.py:_bbox_anchor` | — |
| A7 | `cast-shadow-discriminator` | Motion | `motion_tracker.py:_cast_shadow_metrics`, `_is_cast_shadow`, `_background_reference` | numpy |
| A8 | `dark-foreground-rescue` | Motion | `motion_tracker.py:_detect` (marker 127 + flag) | cv2 |
| A9 | `motion-echo-suppression` | Motion | `motion_tracker.py:_same_motion_echo`, `_suppress_duplicate_detections`, `_is_echo_of_matched_track` | numpy |
| A10 | `occlusion-group-guard` | Motion | `occlusion_guard.py:OcclusionGuard` (prepare/covering_group/activate) | numpy |
| A11 | `watershed-blob-partition` | Motion | `occlusion_guard.py:partition` | cv2 watershed |
| A12 | `merged-blob-assignment-guard` | Motion/Track | `motion_tracker.py:_assign` veto, `_elongation_explained_by_motion`, `_unresolved_merged_birth`; `occlusion_guard.py:gate_assignments` | numpy |
| B1 | `kalman-constant-velocity` | Tracking | `motion_tracker.py:_new_kalman`, `_predict_tracks` | cv2.KalmanFilter |
| B2 | `prediction-age-decay` | Tracking | `motion_tracker.py:_predict_tracks`, `_prediction_age_seconds`, `_has_recent_merged_freeze` | numpy |
| B3 | `association-distance-gate` | Tracking | `motion_tracker.py:_association_gate`, `_track_velocity_px_per_frame` | numpy |
| B4 | `iou-overlap-score` | Tracking | `motion_tracker.py:_assign` (IoU term); `slot_vehicle_binder.py:_overlap_geometry` | — |
| B5 | `association-cost-matrix` | Tracking | `motion_tracker.py:_assign` (cost build) | numpy |
| B6 | `lapjv-assignment` | Tracking | `motion_tracker.py:_assign` (gọi `lapjv`) | `lap` |
| B7 | `assignment-margin-ambiguity` | Tracking | `motion_tracker.py:_assignment_has_margin`, `_lineage_score` | numpy |
| B8 | `stale-anchor-reacquire` | Tracking | `motion_tracker.py:_assign` (reacquire block) | numpy |
| B9 | `track-lifecycle` | Tracking | `motion_tracker.py:process_frame`, `_create_or_reid`, `_apply_detection`, `_is_confirmable`, `_lost_beyond_ttl_seconds`, `suspend_track` | — |
| B10 | `hsv-lab-descriptor` | Tracking | `tracklet_descriptor.py:hsv_histogram`, `compute_sample_quality` | cv2/numpy |
| B11 | `tracklet-gallery-match` | Tracking | `tracklet_descriptor.py:merge_appearance_samples`, `aggregate_appearance`, `compare_tracklets` | numpy |
| C1 | `slot-roi-precompute` | Occupancy | `parking_detector.py:_compute_rois` | cv2 |
| C2 | `ensemble-threshold-voting` | Occupancy | `parking_detector.py:detect` (gamma×CLAHE ensemble) | cv2 |
| C3 | `border-line-filter` | Occupancy | `parking_detector.py:_filter_roi_threshold` | cv2 |
| C4 | `core-rescue-vote` | Occupancy | `parking_detector.py:_has_core_rescue` | — |
| C5 | `temporal-smoothing-dwell` | Occupancy | `parking_detector.py:TemporalSmoother`, `accept_evidence` | — |
| D1 | `slot-overlap-geometry` | Binder | `slot_vehicle_binder.py:_overlap_geometry`, `_raw_vehicle_overlap`, `_signed_polygon_distance`, `_point_in_polygon` | cv2 |
| D2 | `slot-track-batch-match` | Binder | `slot_vehicle_binder.py:_batch_match` | `lap` |
| D3 | `arrival-claim-qualification` | Binder | `slot_vehicle_binder.py:_record_arrival_claim`, `_qualified_arrival`, `_try_commit_arrival_claim`, `_disprove` | numpy |
| D4 | `vision-primary-fusion` | Binder | `slot_vehicle_binder.py:update_vision`, `_sync_result` | — |
| D5 | `stop-dwell-detection` | Binder | `slot_vehicle_binder.py:_is_stopped`, `_advance_strong_overlap`, `_strong_overlap_is_stable` | numpy |
| D6 | `sticky-id-bind-release` | Binder | `slot_vehicle_binder.py:_bind_vehicle`, `_release_vehicle` | — |
| D7 | `departure-token-lifecycle` | Binder | `slot_vehicle_binder.py:_create_departure_token`, `_detach_binding_for_departure`, `_restore_false_empty_token`, `_token_radius`, `_cleanup_tokens` | cv2/numpy |
| D8 | `predeparture-candidate-guard` | Binder | `slot_vehicle_binder.py:prepare_predeparture_tokens` | — |
| D9 | `recovery-candidate-gates` | Binder | `slot_vehicle_binder.py:batch_recover_ids` (gates); `two_camera.py:recover_departing_vehicle_ids` | numpy |
| D10 | `recovery-batch-assignment` | Binder | `slot_vehicle_binder.py:batch_recover_ids` (LAPJV), `consume_recovery_match`, `try_recover_id` | `lap` |
| D11 | `parking-episode-state` | Binder | `slot_vehicle_binder.py:_open_parking_episode`, `_transition_parking_episode`, `_binding_to_json` | — |
| E1 | `world-projection-anchor` | CrossCam | `cross_camera_manager.py:_world`, `_local`, `_bbox_anchor`, `_track_world` | cv2 |
| E2 | `handoff-entry-creation` | CrossCam | `cross_camera_manager.py:_upsert_handoff`, `_outward_edge` | numpy |
| E3 | `handoff-prediction-corridor` | CrossCam | `cross_camera_manager.py:_predicted_world`, `_entry_depth`, `_direction_cosine` | numpy |
| E4 | `handoff-lapjv-matching` | CrossCam | `cross_camera_manager.py:_match_pending_handoffs`, `_candidate_cost` | `lap` |
| E5 | `overlap-simultaneous-pairing` | CrossCam | `cross_camera_manager.py:_match_simultaneous_overlap`, `_match_unbound_cross_camera_pairs`, `_match_unique_unbound_cross_camera_tracks`, `_merge_all_nearby_active_duplicates` | numpy |
| E6 | `global-id-allocation` | CrossCam | `cross_camera_manager.py:_is_allocatable`, `_new_global_id_ready`, `_allocate_global_id`, `bind_external_id` | — |
| E7 | `dormant-identity-reid` | CrossCam | `cross_camera_manager.py:_match_dormant_identities` + distance/proof helpers | numpy |
| E8 | `world-trajectory-match` | CrossCam | `trajectory_memory.py:WorldTrajectoryMemory` (`_estimate`, `match`, `match_departure`) | numpy |
| E9 | `merge-alias-resolution` | CrossCam | `cross_camera_manager.py:_merge_global_ids`, `_canonical_id`; `trajectory_memory.py:merge` | — |
| E10 | `global-identity-lifecycle` | CrossCam | `cross_camera_manager.py:_observe_identity`, `_set_identity_dormant`, `_mark_identity_exited`, `_refresh_identity_states` | cv2/numpy |
| F1 | `homography-fit-distributed` | Calibration | `tools/calibrate_shared_map.py:compute_distributed_shared_homographies`, `compute_homography`, `transform_polygon` | cv2 |
| F2 | `rectangle-line-fit-gate` | Calibration | `tools/rectangle_line_calibration.py:_line_geometry`, `compute_rectangle_line_homographies`, `fit_gate`, `approve_rectangle_line_calibration` | cv2/numpy |
| F3 | `calibration-load-validation` | Calibration | `two_camera.py:load_calibration` | numpy |
| F4 | `matching-distance-derivation` | Calibration | `two_camera.py:median_slot_length`, `derive_matching_defaults`, `resolve_matching_distance` | numpy |
| F5 | `frame-size-adaptation` | Calibration | `two_camera.py:adapt_calibration_to_frame_sizes` | numpy |
| F6 | `camera-skew-synchronization` | Timing | `two_camera.py:synchronize_live_frames` | — |
| F7 | `latest-frame-mailbox` | Timing | `latest_frame_capture.py:LatestFrameCapture`; `runtime_server.py:RuntimeState.publish_frame/needs_frame/wait_for_frame` | cv2 |
| F8 | `stale-evidence-health-gating` | Timing | `parking_detector.py:accept_evidence`; `two_camera.py` parking worker health | — |
| F9 | `replay-session-sync` ⟶ alias → `replay-timestamp-pairing` (owner C) | Timing | `two_camera.py:ReplaySession`, `read_pair`, `--replay-realtime` pacing | cv2 |

## 2. Spec chi tiết từng thuật toán

### Nhóm A — Motion detection (A1–A12)

#### A1. `mog2-foreground-mask` — Trừ nền để lấy vùng foreground
- **Nhóm**: Motion · **Tiên quyết**: frame ảnh màu · **Liên quan**: A2, A4, A8
- **Code**: `backend/main_detect/src/techgar/motion_tracker.py:768` `self.bg_sub.apply(frame)` — input là **frame BGR nguyên bản**, không phải ảnh xám (ảnh xám chỉ được tạo bên trong `_temporal_motion_mask` `:533`). Mask 3 mức: `threshold(>200)→255` là definite foreground `:769-771`; marker `==127` chỉ được gộp khi `reject_cast_shadows && background_image` tồn tại `:780-789`.
- **Vai trò**: tạo mask "điểm khác nền" — nguồn ứng viên duy nhất của detection (không có neural detector).
- **Input**: `frame: BGR[H×W×3]`, nền học `bg_model`. **Output**: `fg_raw: uint8[H×W]` ∈ {0,127,255} — 255 = definite foreground, 127 = shadow marker do `detectShadows=True` sinh.
- **Pseudocode**:
  1. `raw = mog2.apply(frame)` (BGR) → mask 3 mức.
  2. `definite = raw > 200` (code dùng `cv2.threshold(raw,200,255)`).
  3. Nếu `reject_cast_shadows && bg_ref tồn tại`: `markers = raw == 127`, `mask = definite | markers`; ngược lại `mask = definite` (A8).
  4. MOG2 tự cập nhật nền mỗi `apply` (learning rate mặc định −1).
- **Cấu trúc**: `cv2.BackgroundSubtractorMOG2`; mask `uint8`.
- **Độ phức tạp (code)**: O(H·W) thời gian; O(H·W·K) bộ nhớ nền (K = số Gauss/pixel). **[sim]**: O(H·W), 1 giá trị nền/px.
- **Edge cases**: frame đầu → toàn foreground (nền chưa học); cảnh tĩnh dài → xe đỗ "chìm" vào nền → mất detection — lý do pipeline cần A2+A7+D5. `bg_ref=None` → marker 127 bị loại bỏ kể cả khi `reject_cast_shadows` bật (`:781` gate kép).
- **Failure modes**: thay đổi sáng đột ngột → bùm foreground toàn cục; nền nhiễu → speckle; bóng đậm → vùng ảo (marker 127 là cơ chế cứu, không phải thủ phạm).
- **Thực tế vs mô phỏng**: giữ ngưỡng chênh nền + 2 mức 255/127 + gate marker kép. `[sim-omits]`: mô hình hỗn hợp Gauss, learning-rate thích nghi, `varThreshold`, input BGR — demo dùng `bg = (1−α)·bg + α·gray` + `|gray−bg| > T` trên lưới đơn sắc.
- **Sample A (thường)**:
  ```json
  {"frame":[[5,5,5,5],[5,9,9,5],[5,9,9,5],[5,5,5,5]],"bg":[[5,5,5,5],[5,5,5,5],[5,5,5,5],[5,5,5,5]],"threshold":3,"alpha":0.2}
  ```
  **Expected** (đã verify): `fg_count=4`; ô (1,1) nền mới `bg' = 0.8·5+0.2·9 = 5.8` — nền học về phía vật cản (nguy cơ "chìm nền").
- **Sample B (biên — exposure jump)**:
  ```json
  {"frame":[[8,8,8,8],[8,8,8,8],[8,8,8,8],[8,8,8,8]],"bg":[[5,5,5,5],[5,5,5,5],[5,5,5,5],[5,5,5,5]],"threshold":3,"alpha":0.2}
  ```
  **Expected**: `|8−5|=3` không `>3` → `fg_count=0`; với `threshold:2` → `fg_count=16` — ngưỡng quyết định nhạy cảm độ sáng.
- **Storyboard**: hai lưới 4×4 "bg" (xám) và "frame" (có ô xanh dương = vật); lưới thứ 3 tô đỏ các ô `|d|>T`; thanh `bg'` chạy dần (α slider); bảng realtime: `fg_count | bg'[tâm]`; nút "exposure+3" replay sample B; pseudo-line hiện tại được bôi vàng. Giải thích VN: "MOG2 chỉ biết 'khác nền' — nền trôi theo vật cản nếu vật đứng yên lâu".
- **Thư viện ngoài**: `cv2.createBackgroundSubtractorMOG2` [code] — demo là giản lược single-background đơn sắc.

#### A2. `temporal-motion-gate` — Cổng chuyển động thời gian (bắt buộc)
- **Nhóm**: Motion · **Tiên quyết**: A1 · **Liên quan**: A1, A4, A5
- **Code**: `backend/main_detect/src/techgar/motion_tracker.py:522-574` `_temporal_motion_mask`; `:451-471` `_motion_between`; `:486-520` `_timestamp_references` + `_frame_gap_references`; `:473-484` `_brightness_shift`. Điểm gọi `:790-793`: motion mask AND với `background_mask` và dilate support kernel **17×17**.
- **Vai trò**: AND với mask A1 — vật phải **khác nền VÀ đang thay đổi so với mốc thời gian** → loại xe đỗ đã chìm vào nền và nhiễu nền tĩnh.
- **Input**: `frame` (xám hoá nội bộ), `fg_mask`, lịch sử frame+timestamp; config `temporal_short_seconds`/`temporal_long_seconds`/`motion_frame_gap`/`motion_threshold` [literal `:44-55`: gap 3, T=25, short 0.25s, long 0.80s]. **Output**: `motion_mask` uint8.
- **Pseudocode**:
  1. Chọn mốc: `references = _timestamp_references` nếu có timestamp, ngược lại `_frame_gap_references` (mặc định non-multiscale → **1 mốc** `motion_frame_gap=3` frame trước `:489-493`; multiscale → thêm mốc `motion_long_frame_gap=9`).
  2. **`references` rỗng → return mask toàn 0** `:548-549` (chưa đủ lịch sử → gate ĐÓNG hoàn toàn, không phải fail-open).
  3. `motion = OR(_motion_between(gray, ref, T) ∀ref)` — `_motion_between` trừ `_brightness_shift` (median offset) trước khi ngưỡng `:451-471`.
  4. Chuỗi morph: `OPEN(3×3)` → `dilate(5×5, iterations=2)` → `CLOSE(join_kernel=5×5, ×motion_join_iterations)` `:559-573` — không phải "dilate lớn" đơn lẻ.
  5. `fg_final = fg_mask & dilate(motion, 17×17)` tại `:792-793`.
- **Cấu trúc**: deque `_gray_history` `(timestamp_s, frame_idx, gray)`; hai mask uint8.
- **Độ phức tạp (code)**: O(H·W·R) R = số mốc (≤2) + O(H·W·k²) morph; O(H·W·S) bộ nhớ lịch sử. **[sim]**: R=1, S=2.
- **Edge cases**: xe đỗ lâu đã chìm nền + không chuyển động → gate đóng hoàn toàn; xe **vừa rời** vị trí cũ → vùng cũ vẫn "khác ref" → gate mở ở vị trí cũ (motion-echo, A9 xử lý); `gray == ref` KHÔNG đồng nghĩa gate đóng nếu còn mốc khác khác biệt; **frame đầu/chưa đủ lịch sử → mask 0** (`references` rỗng), KHÔNG phải mở.
- **Failure modes**: chuyển động quá chậm < T → gate đóng; flicker ánh sáng → `_brightness_shift` trừ median bù phơi sáng nhưng flicker cục bộ vẫn qua; timestamp lùi (seek/reconnect) → xoá lịch sử `:538-541`.
- **Thực tế vs mô phỏng**: giữ union các mốc + AND + gate-đóng-khi-thiếu-ref. `[sim-omits]`: `_brightness_shift` hiệu chỉnh median, chọn mốc theo timestamp thật, chuỗi morph `OPEN3→dilate5×2→CLOSE5` và support-dilate 17×17 — demo chỉ OR 2 diff + AND, bỏ morph (nêu rõ là bỏ).
- **Sample A (thường)** — đếm từ chính lưới:
  ```json
  {"gray":[[5,5,5,5],[5,5,9,9],[5,5,9,9],[5,5,5,5]],
   "short_ref":[[5,5,5,5],[5,9,9,5],[5,9,9,5],[5,5,5,5]],
   "long_ref":[[5,5,5,5],[5,5,5,5],[5,5,5,5],[5,5,5,5]],
   "T":3,"dilate_kernel":1}
  ```
  **Expected** (đã verify): `count_short=4` (ô (1,1),(3,1),(1,2),(3,2)), `count_long=4` (ô (2,1),(3,1),(2,2),(3,2)), `union=6` → gate mở ở vùng 3×2 — bao cả vị trí cũ lẫn mới của xe.
- **Sample B (biên)**:
  ```json
  {"gray":[[5,5,5,5],[5,5,5,5],[5,5,5,5],[5,5,5,5]],
   "short_ref":[[5,5,5,5],[5,9,9,5],[5,9,9,5],[5,5,5,5]],
   "long_ref":[[5,5,5,5],[5,5,5,5],[5,5,5,5],[5,5,5,5]],"T":3}
  ```
  **Expected** (verify): `count_short=4`, `count_long=0`, `union=4` → **gate vẫn mở** dù `gray==long_ref` — xe vừa rời vị trí cũ. (Case đỗ hẳn: cả ba bằng nhau → `union=0`; case `references=[]` → mask toàn 0.)
- **Storyboard**: ba lưới "gray/short/long" + lưới kết `d1` (vàng), `d2` (cam), `union` (đỏ viền); overlay mask cuối trên fg A1; bảng realtime: `count_short | count_long | union | gate`; slider `T`, nút "xe vừa rời" replay sample B; thêm nút "frame đầu" → union rỗng → banner "gate đóng (chưa đủ lịch sử)". Pseudo-line 1–5. Giải thích VN: "gate đo THAY ĐỔI, không đo vật — vùng xe vừa bỏ trống cũng là 'chuyển động'; thiếu lịch sử thì đóng, không phải mở".
- **Thư viện ngoài**: `cv2.absdiff`, `cv2.dilate`, `cv2.morphologyEx`, `numpy` [code] — demo tương đương.

#### A3. `roi-strict-context-mask` — Lọc ROI nghiêm + cứu qua dải context
- **Nhóm**: Motion · **Tiên quyết**: A4 · **Liên quan**: A5, A6
- **Code**: `backend/main_detect/src/techgar/motion_tracker.py:869-921` (khối ROI trong `_detect`: đếm `strictPx`, `contextPx`, ngưỡng `required`, ratio clip, rescue band).
- **Vai trò**: giới hạn detection trong ROI; riêng detection **chạm biên ROI** được "cứu" nếu phần trong dải context rộng hơn đủ — tránh cắt đứt xe ở mép.
- **Input**: `component_mask`, `strict_mask` (ROI lõi), `context_mask` (ROI+dilate ~`pad`). **Output**: `accept | roi_context_rescued | reject`.
- **Pseudocode**:
  1. `compPx = count(component)`, `strictPx = count(component & strict)`.
  2. `required = max(min_abs_scaled, min(max_abs_scaled, round(ratio_frac·compPx)))`.
  3. Nếu `strictPx ≥ required` → accept.
  4. Ngược lại nếu `strictPx/compPx < clip_ratio` (đủ "ngoài lề") và `strictPx > 0` và `contextPx = count(component & context) ≥ required` và anchor ∈ context → `roi_context_rescued`.
  5. Ngược lại reject `insufficient_strict_roi_support`.
- **Cấu trúc**: hai mask bool; counter pixel.
- **Độ phức tạp (code)**: O(compPx) đếm; O(H·W) tiền xử lý mask context (cache theo ROI). **space** O(1) ngoài cache mask O(H·W); **[sim]**: O(compPx).
- **Edge cases**: comp nằm hẳn ngoài strict nhưng trong context → chỉ cứu được nếu ≥ required px và anchor trong context; `pad=0` → context ≡ strict → không bao giờ cứu; anchor ra ngoài context → reject.
- **Failure modes**: xe to nhưng chỉ rìa nhỏ chạm ROI → strictPx nhỏ, ratio bị clip → có thể cứu → detection "ảo" ở biên; ngưỡng required quá cao trên ảnh nhỏ → mất mọi biên.
- **Thực tế vs mô phỏng**: giữ 2 mức mask + đếm px + rescue. `[sim-omits]`: cache context-mask theo polygon thật, anchor nhiều loại — demo dùng bbox anchor (A6) + pad=1 ô lưới.
- **Sample A (thường — cứu được)**:
  ```json
  {"grid":"8x8","strict":[1,6],"context_pad":1,"comp":[0,2,2,2],"required_scaled":3,"clip_ratio":0.98,"min_required_scaled":3}
  ```
  (`comp` = bbox [x,y,w,h]; strict = ROI vuông x∈[1,6].) **Expected** (verify): `compPx=4`, `strictPx=2` (cột x=1), `ratio=0.5<0.98`, `contextPx=4≥3`, anchor (1,4) ∈ context → **`roi_context_rescued`**.
- **Sample B (biên — không cứu)**:
  ```json
  {"grid":"8x8","strict":[1,6],"context_pad":0,"comp":[0,2,2,2],"required_scaled":3,"clip_ratio":0.98}
  ```
  **Expected** (verify): `contextPx=2<3` → **`reject:insufficient_strict_roi_support`** — pad=0 làm context vô dụng.
- **Storyboard**: lưới 8×8, ROI lõi xanh dương mờ + viền context nét đứt; comp 2×2 ô xám nằm sát biên; ô strict đếm số; kết luận "rescued/reject" đổi khi kéo slider `context_pad`; bảng realtime: `compPx | strictPx | ratio | contextPx | required | verdict`; pseudo-line 1–5. Giải thích VN: "xe chạm mép vùng quan sát vẫn được giữ nếu thân xe đủ dài trong vùng đệm".
- **Thư viện ngoài**: `cv2.bitwise_and`, `countNonZero`, `dilate` cho context [code] — demo đếm trên lưới.

#### A4. `foreground-morphology` — Morphology mở (tẩy nhiễu) rồi đóng (nối mảnh)
- **Nhóm**: Motion · **Tiên quyết**: A1, A2 · **Liên quan**: A5, A10
- **Code**: `backend/main_detect/src/techgar/motion_tracker.py:759-1086` `_detect` — `OPEN` kernel 3×3 (tẩy chấm), rồi `CLOSE` kernel `join_kernel`×n iter (nối mảnh cùng xe); vị trí trong khối sau temporal-gate, trước contour.
- **Vai trò**: biến mask nhiễu thành blob sạch, liền — quyết định số và hình dạng contour mà A5 duyệt.
- **Input**: `fg_mask` uint8. **Output**: `clean_mask` uint8.
- **Pseudocode**:
  1. `mask1 = open(mask, k3)` = erode rồi dilate → xóa blob < kernel.
  2. `mask2 = close(mask1, kj, iters)` = dilate rồi erode → nối mảnh cách nhau < kernel.
- **Cấu trúc**: 2 kernel cv2; mask trung gian.
- **Độ phức tạp (code)**: O(H·W·k²) mỗi pass (k = cạnh kernel). **space** O(H·W) mask trung gian; **[sim]**: O(H·W·9) hai pass.
- **Edge cases**: blob nhỏ hơn kernel OPEN → **bị xóa hoàn toàn** (mất detection thật); hai mảnh cách xa hơn CLOSE → vẫn 2 contour (2 detection hoặc A10 gom nhóm); CLOSE quá mạnh → nối 2 xe sát nhau → blob dính (A10/A11 xử lý).
- **Failure modes**: kernel CLOSE lớn → hợp nhất sai; kernel OPEN lớn → xóa xe xa/nhỏ.
- **Thực tế vs mô phỏng**: giữ erode/dilate 3×3. `[sim-omits]`: kernel ellipse, nhiều iter tùy config — demo 1 iter, kernel vuông.
- **Sample A (thường)** — lưới 8×12: 2 chấm 1×1 nhiễu + 2 khối 3×3 cách nhau 1 ô (x=1..3 và x=5..7, khe ở x=4):
  ```json
  {"grid":"8x12","speckles":[[0,0],[11,0]],"blocks":[[1,3,3,3],[5,3,3,3]],"open_k":3,"close_k":3}
  ```
  **Expected** (verify): trước `20px/4 contour`; sau OPEN `18px/2 contour` (hai chấm 1×1 biến mất; mỗi khối 3×3 erode còn tâm rồi dilate phục hồi = 9px → 2×9=18); sau CLOSE `21px/1 contour` (dilate nối hai khối qua khe x=4 → 1 contour duy nhất, 21px sau erode).
- **Sample B (biên — blob nhỏ hơn kernel)**:
  ```json
  {"grid":"8x12","blocks":[[3,3,2,2]],"open_k":3}
  ```
  **Expected** (verify): `before=4px`, `afterOpen=0` → **blob 2×2 biến mất hoàn toàn** sau OPEN 3×3 — contour không còn gì để A5 duyệt.
- **Storyboard**: 3 panel mask: gốc (chấm đỏ nhiễu + 2 khối xanh) → sau OPEN (chấm biến mất) → sau CLOSE (hai khối hợp 1); đếm px & contour dưới mỗi panel; nút toggle "open/close"; bảng realtime: `px | contours`; pseudo-line 1–2. Giải thích VN: "mở = dọn rác trước, đóng = khâu mảnh sau — thứ tự không đổi được".
- **Thư viện ngoài**: `cv2.morphologyEx` MORPH_OPEN/CLOSE [code] — demo tự cài erode/dilate.

#### A5. `contour-geometry-filter` — Lọc contour theo kích thước/tỉ lệ/support
- **Nhóm**: Motion · **Tiên quyết**: A4 · **Liên quan**: A3, A6, A7, A10, A11
- **Code**: `backend/main_detect/src/techgar/motion_tracker.py:836-1085` (vòng `findContours` trong `_detect`). **Thứ tự gate thật** — quan trọng vì lý do reject phụ thuộc thứ tự:
  1. floor `area < min(min_area, priority_min_area) || w < min_w || h < min_h` `:844-849`;
  2. **ROI strict/context (A3)** `:855-921`;
  3. **occlusion-group + watershed (A10/A11)** `:922-954` — chạy TRƯỚC mọi size-cap;
  4. whole-scene `area > 0.22·image_area` `:955-956`;
  5. oversized `w>max_bbox_w || h>max_bbox_h || w·h>max_bbox_area` `:959-972`;
  6. aspect `w/h ∉ [0.25, 5.0]` `:973-975`;
  7. anchor-outside-ROI `:980-1010` (tolerated nếu trong context band);
  8. priority → `min_area` đổi thành `priority_min_area` `:1011-1014`;
  9. motion **`motion_px < min_pixels || motion_px/(w·h) < min_ratio`** — CẢ HAI điều kiện `:1015-1019`;
  10. marker count + `dark_foreground_rescued` `:1033-1045`; shadow (A7) `:1046-1063`;
  11. histogram + append `:1065-1085`; cuối cùng `_suppress_duplicate_detections` (A9) `:1086`.
- **Vai trò**: quyết định contour nào thành `detection{bbox, point, area, hist, ...}` — điểm lọc chính của pipeline.
- **Input**: `clean_mask`, `temporal_motion`, ROI masks, `tracks`/`predictions` (cho occlusion); ngưỡng literal `:36-41,46-47,56-60,87-89`. **Output**: `detections: list` + `_last_detection_rejections: list{reason}`.
- **Pseudocode** (rút gọn theo đúng thứ tự):
  1. `contours = findContours(mask, EXTERNAL)`; với mỗi contour `area`, `box = boundingRect`.
  2. Gate floor (min(min_area,priority_min_area)/min_w/min_h) → skip.
  3. ROI strict → required = `max(20, min(motion_min_pixels, 0.08·compPx))`; fail → rescue nếu clipped + anchor ∈ context + contextPx ≥ required.
  4. `covering_group(box)` → nhánh occlusion: watershed được → children; không → `ambiguous_merged` detection. `continue`.
  5. `area > 0.22·image_area` → reject whole-scene.
  6. `w > max_w || h > max_h || w·h > max_area` → reject oversized.
  7. `w/h ∉ [0.25, 5]` → reject aspect.
  8. anchor ngoài ROI (không tolerated) → reject anchor.
  9. `is_priority` → đổi `min_area/min_pixels/min_ratio` sang bản priority; `area < min_area` → reject.
  10. `motion_px < min_pixels || motion_px/(w·h) < min_ratio` → reject motion.
  11. `reject_cast_shadows && _is_cast_shadow` → reject shadow; ngược lại append detection.
- **Cấu trúc**: `list[dict]`; `component_pixels`, `roi_support_ratio`; `_last_detection_rejections`.
- **Độ phức tạp (code)**: O(N·P), N contour × P px/contour. **space** O(N·P); **[sim]**: O(N·P) trên lưới nhỏ.
- **Edge cases**: xe lấp đầy frame → whole-scene cap; blob dẹt dài → aspect; `motion_px` đủ nhưng fill-ratio thấp → vẫn reject (gate kép, không phải chỉ px); blob che khuất 2 xe → **không qua size gates** mà rẽ nhánh occlusion ngay sau ROI; priority region chỉ đổi ngưỡng ở bước 8-9, không bỏ qua gate.
- **Failure modes**: thứ tự gate làm reject lệ thuộc giai đoạn trước (occlusion trước size-cap nên blob 2-xe-khổng-lồ không bị whole-scene nuốt); ngưỡng cứng → mất xe rất xa.
- **Thực tế vs mô phỏng**: giữ thứ tự gate + lý do reject + gate motion kép. `[sim-omits]`: ROI/context-rescue (đã mô tả ở A3), nhánh occlusion/watershed (A10/A11), anchor-tolerate, marker/shadow (A8/A7), priority ngưỡng riêng — demo chỉ chuỗi: floor → whole-scene → oversized → aspect → motion(px **và** ratio).
- **Sample A (thường)** — grid 8×12, `min_area=4, min_w=2, min_h=2, max_area_frac=0.22(→21.12px), aspect=[0.25,5], min_motion_px=3, min_ratio=0.08, max_w=9`:
  ```json
  {"comps":[{"box":[0,0,4,3],"px":12,"motion":8},{"box":[4,4,4,3],"px":12,"motion":2},{"box":[0,6,10,2],"px":20,"motion":18},{"box":[4,6,2,2],"px":4,"motion":4}]}
  ```
  **Expected** (verify): verdicts theo thứ tự gate — comp0 `accept`; comp1 `reject:motion` (`motion_px=2 < 3`); comp2 `reject:oversized` (`w=10 > 9`; `px=20 ≤ 21.12` qua whole-scene); comp3 `accept`.
- **Sample B (biên — fill-ratio fail dù px đạt)**:
  ```json
  {"comp":{"box":[0,0,4,10],"px":20,"motion":3},"max_area_frac":0.22,"frame_px":96,"min_motion_px":3,"min_ratio":0.08}
  ```
  **Expected** (verify): `px=20 ≤ 21.12` qua whole-scene; `motion_px=3 ≥ 3` đạt sàn px — nhưng `3/(4·10)=0.075 < 0.08` → **`reject:motion`** — gate yêu cầu CẢ pixel lẫn tỉ lệ phủ. (Case cap: comp `{"box":[0,0,11,2],"px":22}` → `22 > 21.12` → `reject:whole-scene`.)
- **Storyboard**: danh sách contour-card qua "phễu" gate có đánh số thứ tự; gate nào reject thẻ đỏ + reason; nút "nhánh occlusion" tách riêng (A10); thanh `motion_px` và `fill_ratio` hiển thị cùng lúc để thấy gate kép; bảng realtime: `box | px | motion | fill | gate dừng`; pseudo-line sáng theo gate. Giải thích VN: "thứ tự gate quan trọng — blob 2 xe được cứu trước khi cap kích thước kịp xoá nó; còn blob thưa chuyển động phải phủ đủ phần trăm bbox".
- **Thư viện ngoài**: `cv2.findContours`, `boundingRect`, `countNonZero` [code] — demo duyệt comp trên lưới.

#### A6. `bottom-center-anchor` — Điểm neo bbox
- **Nhóm**: Motion · **Tiên quyết**: A5 · **Liên quan**: B1, E1, D1
- **Code**: `backend/main_detect/src/techgar/motion_tracker.py:392-395` `_bottom_center`; `:432-438` `_ground_point`; `cross_camera_manager.py:1379-1403` `_bbox_anchor` (anchor theo camera config: `bottom_center`/`center`).
- **Vai trò**: rút bbox về **1 điểm đại diện trên mặt đất** — mọi phép đo vị trí (Kalman B1, chiếu world E1, overlap D1) neo vào đây.
- **Input**: `bbox=[x,y,w,h]`, `anchor_mode`. **Output**: `(ax, ay)` — bottom-center mặc định `(x+w/2, y+h)`.
- **Pseudocode**:
  1. Nếu `bottom_center`: `(x + w/2, y + h)`.
  2. Nếu `center`: `(x + w/2, y + h/2)`.
  3. Nếu camera config định kiểu khác (vd `feet`), dùng offset tương ứng.
- **Cấu trúc**: tuple float.
- **Độ phức tạp**: O(1). **space** O(1); **[sim]**: O(1).
- **Edge cases**: bbox bị cắt ở biên ảnh → anchor nằm ngoài lưới → A3 từ chối; anchor_mode khác nhau giữa 2 cam → cùng một xe chiếu ra 2 điểm world lệch nhau (E1 phải khớp anchor config).
- **Failure modes**: xe cao, ảnh góc cao → bottom-center lệch khỏi tâm thật → world-projection lệch vài dm.
- **Thực tế vs mô phỏng**: giữ 2 mode. `[sim-omits]`: mode `feet`/anchor tùy biến theo calibration — demo chỉ bottom_center/center.
- **Sample A**: `{"bbox":[2,3,4,2],"modes":["bottom_center","bbox_center"]}` → **Expected**: `(4,5)` và `(4,4)`.
- **Sample B (biên)**: `{"bbox":[10,0,4,2],"grid_w":12}` → **Expected**: `bottom_center=(12,2)` → nằm ngoài lưới → `anchor_outside` → A3 xử lý.
- **Storyboard**: bbox xanh trên lưới, chấm đỏ ở cạnh dưới vs chấm vàng ở tâm; đổi mode anchor → chấm nhảy; bảng realtime: `bbox | mode | (ax,ay) | in_bounds`; pseudo-line 1–3. Giải thích VN: "điểm chạm đất mới là vị trí thật của xe trên mặt bãi — tâm hình học bay lơ lửng".
- **Thư viện ngoài**: không.

#### A7. `cast-shadow-discriminator` — Phân biệt vật thật vs bóng đổ
- **Nhóm**: Motion · **Tiên quyết**: A5 · **Liên quan**: A1 (marker 127), A8
- **Code**: `backend/main_detect/src/techgar/motion_tracker.py:633-703` `_cast_shadow_metrics`; `:705-726` `_is_cast_shadow`; `:736-757` `_background_reference`; defaults `:63-67` — `attenuation_range (0.32,0.62)`, `chroma_max 0.10`, `res_max 0.08`, `explained_min 0.75`, `min_pixels 120`; gate flag `reject_cast_shadows` `:62`.
- **Vai trò**: reject detection là bóng đổ khi `reject_cast_shadows` bật: vùng **tối hơn nền theo hệ số ổn định, giữ chromaticity, dư lượng nhỏ** — giữ xe tối màu thật. **Fail-open**: `metrics=None` (thiếu nền/ít pixel) → KHÔNG reject `:715-716`.
- **Input**: `frame BGR`, `background BGR` (ảnh nền học từ MOG2 `getBackgroundImage`), `box`, `selection mask`. **Output**: `is_shadow: bool` + `metrics{attenuation, chromaticity_distance, scaled_residual, explained_fraction, pixel_count}` hoặc `None`.
- **Pseudocode**:
  1. `bg=None` hoặc `selected < shadow_min_pixels` hoặc `valid < max(min_px, 60%·selected)` → `None` (fail-open) `:649-667`; `luminance = BGR·[0.114,0.587,0.299]` `:661-663`; `valid = bg_lum ≥ 20 && cur_lum ≥ 3` `:664`.
  2. `att_i = cur_lum_i / bg_lum_i`; `attenuation = median(att)` `:673-674`.
  3. `chroma_i = ‖BGR/ΣBGR (cur) − BGR/ΣBGR (bg)‖₁` — khoảng cách **chromaticity L1** `:676-684`; `med_chroma = median(chroma)`.
  4. `res_i = |cur_lum_i − attenuation·bg_lum_i| / bg_lum_i` — **scaled residual** `:685-687`; `med_res = median(res)`.
  5. `explained = mean(|att_i−att| ≤ 0.18 && chroma_i ≤ 1.2·chroma_max && res_i ≤ 1.5·res_max)` — ba điều kiện liên hợp `:691-696`.
  6. `is_shadow = att ∈ [0.32,0.62] && med_chroma ≤ 0.10 && med_res ≤ 0.08 && explained ≥ 0.75` `:717-725`.
- **Cấu trúc**: mảng per-pixel float; metrics dict.
- **Độ phức tạp (code)**: O(compPx). **space** O(compPx); **[sim]**: O(compPx).
- **Edge cases**: vật tối THẬT (att < 0.32) → không phải bóng → giữ (đúng); vật sáng hơn nền (att > 0.62) → không phải bóng; bóng không đều (explained < 0.75) → giữ như vật; nền chưa học/ít pixel hợp lệ → `None` → giữ mọi thứ (fail-open có chủ đích, `:640-647` docstring).
- **Failure modes**: `reject_cast_shadows=False` (default!) → `_is_cast_shadow` trả `False` luôn `:712-713` — tính năng tắt mặc định; đổi tham số học ảnh hưởng mạnh; `valid < 60%·selected` → từ chối phán đoán (không reject).
- **Thực tế vs mô phỏng**: giữ median attenuation + explained-triple + scaled-residual + chroma-gate. `[sim-omits]`: luminance trọng số BGR `[0.114,0.587,0.299]`, chromaticity từ BGR chuẩn hoá (không phải "độ bão hòa"), `valid` gates, `_background_reference` snapshot mỗi 10 frame — demo dùng gray + bg số (chroma≡0 nên gate chroma tự động qua — ghi rõ đây là omission).
- **Sample A (thường — là bóng)**: px hiện tại `[50,50,45,180]`, `bg=100`, `att∈[0.32,0.62]`, `explained_min=0.75`, `res_max=0.08`, `chroma_max=0.10`, `att_tol=0.18`:
  ```json
  {"cur":[50,50,45,180],"bg":100,"att_range":[0.32,0.62],"explained_min":0.75,"res_max":0.08,"chroma_max":0.10,"att_tol":0.18}
  ```
  **Expected** (verify): `att=[0.5,0.5,0.45,1.8]` → `med=0.5` ∈ dải; `res_scaled=[0,0,0.05,1.30]` → `med_res=0.025 ≤ 0.08`; explained: px4 loại (`|1.8−0.5|=1.3>0.18` và `res 1.30>0.12`) → `3/4=0.75 ≥ 0.75`; `chroma=0 ≤ 0.10` → **`is_shadow=true`** (px 180 là nhiễu lẻ được median hấp thụ).
- **Sample B (biên — vật tối/sáng thật)**:
  ```json
  [{"cur":[70,70,70,70],"bg":100},{"cur":[20,20,20,20],"bg":100}]
  ```
  **Expected** (verify): `med_att=0.7 > 0.62` → **không phải bóng** (vật sáng hơn nền); `med_att=0.2 < 0.32` → **không phải bóng** (vật đen thật, giữ lại).
- **Storyboard**: dải pixel so với đường nền; histogram attenuation, đường median; vùng cho phép [0.32,0.62] tô mờ; thanh explained đếm px qua 3 điều kiện liên hợp; toggle "reject_cast_shadows=off" → banner "tính năng tắt — fail-open giữ hết"; bảng realtime: `med_att | med_chroma | med_res | explained | verdict`; pseudo-line 1–6. Giải thích VN: "bóng = nền bị nhân hệ số (màu nền giữ nguyên), vật = nền bị thay pixel — median chống nhiễu lẻ, thiếu bằng chứng thì không kết tội".
- **Thư viện ngoài**: `numpy` median/stats [code] — demo giản lược đơn sắc (chroma=0).

#### A8. `dark-foreground-rescue` — Cứu vùng tối qua marker 127
- **Nhóm**: Motion · **Tiên quyết**: A1 · **Liên quan**: A7, A5
- **Code**: `backend/main_detect/src/techgar/motion_tracker.py:759-1086` `_detect` — nhánh gộp `raw==127` vào mask + cờ `dark_fg_rescued` khi đủ marker px; `_box_is_priority` `:614-631` cho vùng ưu tiên.
- **Vai trò**: MOG2 `detectShadows=True` đánh dấu bóng bằng 127; khi xe tối-màu đi kèm bóng, vùng marker giúp giữ trọn blob thay vì mất phần tối.
- **Input**: `fg_raw` {0,127,255}, `bg_ref` tồn tại (gate fail-early). **Output**: mask mở rộng + `rescued: bool`.
- **Pseudocode**:
  1. `markers = raw == 127` (chỉ khi có `bg_ref`; không có nền → bỏ marker).
  2. `mask = definite | markers`.
  3. `rescued = marker_px_in_comp ≥ marker_min && marker_px/comp_px ≥ marker_frac_min`.
- **Cấu trúc**: 2 mask; counter.
- **Độ phức tạp**: O(H·W). **space** O(H·W) 2 mask; **[sim]**: O(H·W).
- **Edge cases**: `bg_ref=None` (nền chưa học) → marker bị loại → comp chỉ còn definite → detection nhỏ/mất; comp chỉ toàn marker không có definite → vẫn tính (có thể cứu vùng thuần bóng → ngược lại A7 phải reject).
- **Failure modes**: nhiễu marker lan rộng → thổi phồng bbox; marker_min quá thấp → cứu cả bóng thật.
- **Thực tế vs mô phỏng**: giữ 3-mức + ngưỡng cứu. `[sim-omits]`: tương tác `detectShadows` config, priority-region — demo gắn `marker_min_scaled`.
- **Sample A**:
  ```json
  {"raw":[[0,0,0,0],[0,127,127,0],[0,127,255,0],[0,0,0,0]],"has_bg":true,"marker_min_scaled":2,"marker_frac_min":0.08}
  ```
  **Expected** (verify): `definite=1px`, `markers=3px`, comp `=4px`, `marker_frac=0.75` → **`rescued=true`**, diện tích giữ 4 thay vì 1.
- **Sample B (biên — chưa học nền)**:
  ```json
  {"raw":[[0,0,0,0],[0,127,127,0],[0,127,255,0],[0,0,0,0]],"has_bg":false,"marker_min_scaled":2,"marker_frac_min":0.08}
  ```
  **Expected** (verify): `comp = 1px` (chỉ definite, marker 127 không được cộng khi chưa có nền) → marker bị bỏ → `rescued=false` → detection teo/mất.
- **Storyboard**: lưới 3 màu (đen/127-xám/255-trắng); toggle "có nền" → comp sáng/mờ; cờ rescued nhấp khi đủ ngưỡng; bảng realtime: `definite | markers | comp | frac | verdict`; pseudo-line 1–3. Giải thích VN: "MOG2 tự đánh dấu bóng — pipeline tái dùng dấu đó để không mất xe tối màu".
- **Thư viện ngoài**: `cv2` mask ops [code].

#### A9. `motion-echo-suppression` — Gộp detection trùng lặp do di chuyển
- **Nhóm**: Motion · **Tiên quyết**: A5 · **Liên quan**: A2, B4, B7
- **Code**: `backend/main_detect/src/techgar/motion_tracker.py:1088-1110` `_same_motion_echo`; `:1112-1134` `_suppress_duplicate_detections`; `:1136-1145` `_different_clean_owners`; `:1147-1160` `_is_echo_of_matched_track`; spawn-side `:2322-2334` (lọc unmatched-detection là echo của track đã match).
- **Vai trò**: frame-difference để lại "vệt" ở vị trí cũ của xe đang chạy → hai detection cùng một xe; `same_echo` nhận diện vệt đó. **Hai tầng khác nhau**: (a) suppression trước gán — chỉ xoá khi vệt **chồng lấp mạnh** (`IoU ≥ 0.25` + hist rất giống `≤ 0.12`); (b) echo không chồng → **giữ lại**, để B7/assignment phân xử (không xoá sớm).
- **Input**: `detections[]` {box, point, hist, occlusion_members}; owner = các track có `clean_observations ≥ 3` và tâm nằm trong box `:1139-1144`. **Output**: `detections'` đã lọc duplicate (và unmatched-detection đã lọc echo ở `:2322-2334`).
- **Pseudocode**:
  1. `_same_motion_echo(a,b)`: cả hai có `hist` và không có `occlusion_members`; `size_ratio = min(wh)/max(wh) ≥ 0.45`; `hist_d ≤ 0.22`; `dist(points) ≤ max(24, 1.10·max(min_w_a, min_w_b))`; `box_gap ≤ 14` — bốn điều kiện liên hợp, **không dùng IoU** `:1102-1110`.
  2. `_different_clean_owners(a,b)`: tập owner-sạch hai bên đều không rỗng và rời nhau → "hai xe thật" → không phải echo `:1136-1145`.
  3. `_suppress_duplicate_detections`: duyệt theo `area` giảm dần; xoá det khỏi kept chỉ khi `!different_clean_owners && same_echo && IoU ≥ 0.25 && hist_d ≤ 0.12` `:1120-1132`.
  4. `_is_echo_of_matched_track`: `len(track.history) ≥ 4`, `dist(det.point, history[-4]) ≤ max(22, 0.70·max(w,h))` và `same_echo` với track-reference `:1147-1160` — loại unmatched-detection là vệt của xe đã gán `:2322-2334`.
- **Cấu trúc**: đồ thị cặp; `hist` numpy; `clean_observations`.
- **Độ phức tạp (code)**: O(N²) cặp + O(N·T) owner. **space** O(N); **[sim]**: O(N²), N≤10.
- **Edge cases**: echo chồng nhẹ (`IoU<0.25`) → `same_echo=true` nhưng **không xoá** (defer sang assignment) — vệt xa mới bị chặn ở spawn; hai xe sạch cạnh nhau → `different_clean_owners` → giữ cả hai; det `hist=None` hoặc occlusion-member → `same_echo` trả False ngay (bảo vệ nhánh merged).
- **Failure modes**: `hist ≤ 0.22` lỏng → gộp nhầm 2 xe cùng màu; `box_gap ≤ 14` hẹp → vệt rất nhanh vẫn lọt sang spawn (được `_is_echo_of_matched_track` lọc lần hai).
- **Thực tế vs mô phỏng**: giữ 4-điều-kiện same_echo + ngưỡng xoá kép (IoU≥0.25 **và** hist≤0.12 — IoU đảo so với trực giác: xoá khi chồng NHIỀU). `[sim-omits]`: `clean_observations` lineage thật, `_is_echo_of_matched_track`, spawn-side filter — demo gán `owner` số nguyên và chỉ tầng suppression.
- **Sample A (thường — xoá duplicate)**:
  ```json
  {"a":{"box":[0,0,4,4],"point":[2,4],"hist":[1,0],"owner":1,"area":16},
   "b":{"box":[2,0,4,4],"point":[4,4],"hist":[1,0],"owner":1,"area":16},
   "c":{"box":[8,0,3,3],"point":[9.5,3],"hist":[0,1],"owner":2,"area":9}}
  ```
  **Expected** (verify): `same_echo(a,b)=true` (size 1.0≥0.45, hist 0≤0.22, dist 2≤24, gap 0≤14); `IoU(a,b)=8/24≈0.333 ≥ 0.25`, `hist_d=0 ≤ 0.12`, cùng owner → **drop b → kept {a,c}**.
- **Sample B (biên — echo không chồng → KHÔNG xoá)**:
  ```json
  {"a":{"box":[0,0,4,4],"point":[2,4],"hist":[1,0],"owner":1,"area":16},
   "d":{"box":[5,0,4,4],"point":[7,4],"hist":[1,0],"owner":1,"area":16}}
  ```
  **Expected** (verify): `same_echo(a,d)=true` (dist 5≤24, gap 1≤14) nhưng `IoU=0 < 0.25` → **giữ cả hai** — vệt không chồng được để assignment/B7 phân xử, suppression không xoá sớm. (Case owner khác sạch: `b.owner=2` → `different_clean_owners` → giữ cả hai dù đủ điều kiện echo.)
- **Storyboard**: 3 box trên lưới (a,d chồng ít — vệt mới; a,b chồng nhiều — vệt sát); cặp echo nối cung đứt nét; hai cột "same_echo" và "suppression-drop" hiển thị tách nhau — echo vàng (giữ) vs drop đỏ; bảng realtime: `pair | size_r | hist | dist | gap | IoU | verdict`; pseudo-line 1–4. Giải thích VN: "nhận diện vệt là một chuyện — chỉ xoá khi nó nằm đè lên detection thật; vệt cách xa để tầng gán xử".
- **Thư viện ngoài**: `cv2.compareHist`, `numpy` [code].

#### A10. `occlusion-group-guard` — Nhận diện blob chứa nhiều xe
- **Nhóm**: Motion · **Tiên quyết**: A5, B9 · **Liên quan**: A11, A12, B7
- **Code**: `backend/main_detect/src/techgar/occlusion_guard.py:25-149` `OcclusionGuard` (`prepare` :55-100 tạo group theo proximity; `covering_group` :102-121; `activate` :123-138); `OcclusionGroup` :14-22; gọi trong `_detect` `motion_tracker.py:922-954`.
- **Vai trò**: một contour lớn có thể chứa nhiều track → **group được hình thành TRƯỚC** từ proximity của track có ≥3 clean-obs; blob được gán group chỉ khi **TẤT CẢ member centers** (pad nhỏ) nằm trong blob và `blob_area ≥ 1.6·median(member_ref_areas)` — đánh dấu để A11 tách và A12/B7 không gán bừa.
- **Input**: `tracks[]` (clean_observations, predictions), `blob bbox`. **Output**: `group` kích hoạt (hoặc `None`).
- **Pseudocode**:
  1. `prepare`: eligible = track có `clean_observations ≥ 3` và `now − last_seen ≤ timeout(3.0s)` `:66-72`.
  2. Mỗi cặp eligible (i,j): bỏ nếu `inter(last_box_i, last_box_j) / min(area_i, area_j) > 0.20` (đã chồng — không chứng minh được 2 xe độc lập) `:84-86`; bỏ nếu `gap(center_i, center_j) > 0.4·max(diag_i, diag_j)` `:87-89`; còn lại → `group` mới `:90`.
  3. Prune group cũ: `dist(center_i, center_j) > 3·max_diag` → xoá `:94-100`.
  4. `covering_group(box)`: với mỗi group — `all(cx_i,cy_i ∈ box + pad 0.15·min(ref_i))` **và** `w·h ≥ 1.6·median(ref_area_i)` `:109-112` → trả group.
  5. `activate`: `active=true`, `expires = last_clean + timeout`, members `frozen`, `last_ambiguous_kind='merged'` `:123-138`.
- **Cấu trúc**: `OcclusionGroup{members, references, created_at, active, recovering, expires_at}`.
- **Độ phức tạp (code)**: O(T²) cặp eligible + O(G·members) covering. **space** O(G+T); **[sim]**: O(T²).
- **Edge cases**: group 3 member nhưng 1 member ra ngoài blob → `all(contained)` fail → **không** covering (không phải "đếm ≥2 center"); blob chứa center của track không thuộc group nào → vẫn `None`; track thiếu `clean_obs≥3` → không eligible → không thể vào group.
- **Failure modes**: 2 track dự đoán sai cùng rơi vào 1 blob xe → group ảo → tách sai ở A11; `timeout` ngắn → group hết hạn sớm; blob dính nhưng chưa đủ `1.6·median` → missed.
- **Thực tế vs mô phỏng**: giữ tiêu chí all-members-inside + `1.6·median` + pre-formed proximity. `[sim-omits]`: `clean_obs≥3` eligibility, inter>0.20 no-proof check, `expires_at` theo last_clean, `recovering` counter (A12), `frozen`/events — demo truyền `groups` sẵn có và `centers`.
- **Sample A (thường — group phủ)**: `{"blob":[0,0,8,3],"groups":[{"members":[1,2],"refs":{"1":[3,3],"2":[3,3]},"centers":{"1":[2,1],"2":[6,1]}}]}` → **Expected** (verify): members ≥2; `(2,1),(6,1)` đều ∈ box+pad(0.45); `24 ≥ 1.6·median(9)=14.4` → **`covering=[1,2]`**.
- **Sample B (biên — member lạc)**:
  ```json
  {"blob":[0,0,8,3],"groups":[{"members":[1,2,3],"refs":{"1":[3,3],"2":[3,3],"3":[3,3]},"centers":{"1":[2,1],"2":[6,1],"3":[11,1]}}]}
  ```
  **Expected** (verify): member 3 tâm (11,1) ngoài box → `all(contained)=false` → **không covering** — blob có 2/3 center không đủ, group 3 xe phải thấy đủ 3. (Case đơn: `{"members":[1]}` không phải group hợp lệ — cặp mới là đơn vị.)
- **Storyboard**: blob xám lớn + chấm tâm member (có số); vùng pad mờ quanh mép; kéo member 3 ra ngoài → đèn "all inside" tắt → verdict lật; đồng hồ timeout group; bảng realtime: `members | inside[] | blob_area | 1.6·median | verdict`; pseudo-line 1–5. Giải thích VN: "nhóm 2 xe hình thành trước từ quãng đường gần nhau — blob chỉ được gắn cờ khi phủ trọn tất cả thành viên".
- **Thư viện ngoài**: `numpy` [code].

#### A11. `watershed-blob-partition` — Tách blob occlusion theo seed
- **Nhóm**: Motion · **Tiên quyết**: A10 · **Liên quan**: A12, B7
- **Code**: `backend/main_detect/src/techgar/occlusion_guard.py:150-190` `partition` (markers = vị trí track, `cv2.watershed` trên ảnh/mask, rồi kiểm tra tỉ lệ diện tích con).
- **Vai trò**: chia blob thành các vùng con quanh seed track → mỗi vùng là detection riêng gắn đúng owner.
- **Input**: `frame/mask`, `blob`, `seeds[]` (tâm track dự đoán). **Output**: `children[]` {bbox, seed_id} hoặc `merged` nếu tách méo.
- **Pseudocode**:
  1. `markers`: mỗi seed 1 nhãn, nền 0.
  2. `labels = watershed(img, markers)` — ranh giới chảy theo gradient.
  3. `[sim]`: Voronoi — mỗi px về seed gần nhất.
  4. Với mỗi vùng con: `ratio = area_i / expected_i`; nếu `ratio ∉ [ratio_min, ratio_max]` → bỏ tách, giữ `merged`.
- **Cấu trúc**: label map int32; children dict.
- **Độ phức tạp (code)**: O(blobPx·k) gần đúng. **space** O(blobPx) label map; **[sim]**: O(blobPx·S), S seed.
- **Edge cases**: seed quá gần nhau → vùng mất cân (ratio vượt max) → **fallback merged** (không tách); seed ngoài blob → vùng rỗng → bỏ; blob không đủ độ dốc → watershed chảy loạn (demo Voronoi ổn định hơn).
- **Failure modes**: 2 xe dính không rõ ranh → tách sai; ratio gate quá chặt → không bao giờ tách (luôn merged → A12 đóng băng).
- **Thực tế vs mô phỏng**: giữ seed-based + ratio gate. `[sim-omits]`: watershed gradient thật (demo dùng khoảng cách Euclid — **không** mô phỏng topology nước chảy).
- **Sample A (thường — tách được)**: `{"blob_x":[1,6],"blob_y":[1,3],"seeds":[[2,2],[5,2]],"expected_area":6,"ratio_range":[0.35,1.8]}` → **Expected** (verify): vùng Voronoi `x≤3 → seed1 (9px)`, `x≥4 → seed2 (9px)` → `ratios=[1.5,1.5] ∈ dải` → **children** `bbox=[1,1,3,3]` và `[4,1,3,3]`.
- **Sample B (biên — seed sát nhau)**: `{"blob_x":[1,6],"blob_y":[1,3],"seeds":[[2,2],[3,2]],"expected_area":6,"ratio_range":[0.35,1.8]}` → **Expected** (verify): `x≤2 → seed1 (6px)`; `x≥3 → seed2 (12px, tie x=3 gán về seed gần-tọa-độ-phải)` → ratios `[1.0, 2.0]`; `2.0 > 1.8` → **fallback `merged`** — seed quá gần → không tách.
- **Storyboard**: blob xám + 2 chấm seed; đường Voronoi đứt nét chia đôi; slider khoảng cách seed — kéo sát nhau → vùng lệch đỏ → nút "fallback merged" sáng; bảng realtime: `areas | ratios | verdict`; pseudo-line 1–4. Giải thích VN: "tách chỉ có nghĩa khi mỗi phần ra kích thước hợp lý — méo thì thà giữ nguyên".
- **Thư viện ngoài**: `cv2.watershed` [code] — demo Voronoi giản lược.

#### A12. `merged-blob-assignment-guard` — Veto gán khi blob không giải thích được
- **Nhóm**: Motion/Track · **Tiên quyết**: A10, A11, B5 · **Liên quan**: B7
- **Code**: `backend/main_detect/src/techgar/motion_tracker.py:1246-1276` `_elongation_explained_by_motion` (span `motion_trail_elongation_frames=1.75` `:73`); `:364-391` `_unresolved_merged_birth`; `occlusion_guard.py:191-232` `gate_assignments`; freeze/cost=10 tại `motion_tracker.py:1793-1807`.
- **Vai trò**: blob merged không tách được → **chặn gán vào members + chặn sinh track mới**; ngoại lệ duy nhất: phần dư bbox được giải thích bởi chuyển động (vệt đuôi theo hướng chạy), kiểm tra **từng trục** theo hiệu blob − kích thước sạch.
- **Input**: `assignments`, `costs`, `tracks`, `detections`, `margin` (`split_assignment_margin=0.08` `:82`). **Output**: `assignments'` + `deferred_tracks` + `deferred_detections`.
- **Pseudocode**:
  1. `_elongation_explained_by_motion(track, box)`: `excess_w = blob_w − track.w`, `excess_h = blob_h − track.h`; nếu cả hai ≤ 0 → `True`; ngược lại `excess_w ≤ |vx|·1.75 + 0.30·track.w && excess_h ≤ |vy|·1.75 + 0.30·track.h` `:1263-1275` — **không** phải `cos(trục, vel)` hay `elong ≥ k`.
  2. `gate_assignments`: với mỗi group active — `valid = len(members)==2 && cả 2 member có cặp && swapped−direct ≥ 2·margin && direct < 1.2` `:200-206`.
  3. `valid` tích luỹ `recovering` mỗi frame; `recovering ≥ 3` → đóng group, `watershed_provisional→validated` `:207-221`; không valid → `recovering=0`, defer members + suppress mọi cột det có `cost<1.0` của members `:222-230`.
  4. `_unresolved_merged_birth` → unmatched-detection merged không được `_create_or_reid` `:2336-2340`; cột `ambiguous_*` → `costs[:,col]=10` `:1793-1807`.
- **Cấu trúc**: `OcclusionGroup.recovering`; `deferred_tracks/detections`; cờ `ambiguous_merged`, `ambiguous_assignment`.
- **Độ phức tạp (code)**: O(G·members) + O(members·D) suppress. **space** O(G+T); **[sim]**: O(G·D).
- **Edge cases**: blob không dư trục nào → `True` ngay (không cần vận tốc); blob dài theo đúng hướng chạy (excess ≤ quãng đường·span + dung sai) → explained → gán bình thường; blob dư theo trục VUÔNG GÓC vận tốc → veto; swap-margin đúng nhưng `direct ≥ 1.2` → không valid (cost quá xấu để tin).
- **Failure modes**: xe dài thật (buýt) bị chặn nếu excess vượt `|v|·span + 0.3·size`; 2 xe dính lâu → unresolved kéo dài → mất update; `recovering` reset khi 1 frame invalid → kéo dài đóng băng.
- **Thực tế vs mô phỏng**: giữ 2 nhánh explained/veto + defer/suppress + recovering-3-frame. `[sim-omits]`: `_unresolved_merged_birth` chi tiết, `_has_recent_merged_freeze`, watershed-validated side-effects, `observation_kind` transitions — demo giữ elongation-per-axis + valid/3-frame.
- **Sample A (thường — explained)**: `{"track":{"w":4,"h":3},"blob":{"w":8,"h":3},"vel":[4,0],"span":1.75}` → **Expected** (verify): `excess_w=4 ≤ 4·1.75+0.3·4=8.2` và `excess_h=0 ≤ 0+0.9` → **`explained=true`** → gán bình thường.
- **Sample B (biên — veto)**: `{"track":{"w":4,"h":3},"blob":{"w":8,"h":3},"vel":[0,4],"span":1.75}` → **Expected** (verify): xe chạy dọc trục y nhưng blob phình ngang: `excess_w=4 > 0·1.75+0.3·4=1.2` → **`explained=false`** → veto gán + `birth_blocked`. (Phụ: `blob [4,4]` vel `[4,0]` → `excess_h=1 > 0.9` → cũng veto — dư theo trục vuông góc.)
- **Storyboard**: blob chữ nhật + mũi tên vận tốc; hai thanh `excess_w` và `excess_h` đối chiếu giới hạn `|v_axis|·span + 0.3·size_axis` mỗi trục — trục nào vượt hiện đỏ; valid-margin gauge `swapped−direct` vs `2·margin`; bộ đếm recovering 0→3; bảng realtime: `excess_w/h | limit_w/h | valid | recovering | verdict`; pseudo-line 1–4. Giải thích VN: "vệt kéo dài chỉ hợp lệ theo trục xe đang chạy — dư theo trục vuông góc nghĩa là xe khác dính vào".
- **Thư viện ngoài**: `numpy` [code].

#### B1. `kalman-constant-velocity` — Dự đoán vị trí theo vận tốc không đổi
- **Nhóm**: Tracking · **Tiên quyết**: A5, A6 · **Liên quan**: B2, B3, B5
- **Code**: `backend/main_detect/src/techgar/motion_tracker.py:440-449` `_new_kalman` (state `[x,y,vx,vy]`, 2 đo `[x,y]`); `:239-295` `_predict_tracks`.
- **Vai trò**: mỗi track có bộ lọc dự đoán vị trí frame kế → cầu nối detection rời rạc thành quỹ đạo liên tục; khi detection mất, track "coast" theo dự đoán.
- **Input**: state `[x,y,vx,vy]`, meas `(mx,my)|None`. **Output**: predicted `(x̂,ŷ)` + corrected state.
- **Pseudocode**:
  1. `predict`: `x += vx`, `y += vy` (F constant-velocity).
  2. Nếu có meas: `residual = meas − pred`; `state += K·residual` (Kalman gain; [sim] K=β=0.5).
  3. Không có meas → giữ state sau predict (coast).
- **Cấu trúc**: `cv2.KalmanFilter(4,2)`; statePre/statePost.
- **Độ phức tạp (code)**: O(1)/track. **space** O(1) state+P; **[sim]**: O(1).
- **Edge cases**: detection mất liên tục → coast tuyến tính, lệch dần khi xe đổi hướng (B2 giới hạn tuổi dự đoán); meas nhiễu mạnh → residual lớn → v nhảy đột (B3 gate ngăn gán xa).
- **Failure modes**: xe rẽ gấp → dự đoán vượt quá vị trí thật; gain cố định ở [sim] không thích nghi như Kalman thật.
- **Thực tế vs mô phỏng**: giữ predict/correct 2 pha + coast. `[sim-omits]`: ma trận chuyển F, hiệp phương sai P, process/measurement noise — demo dùng α-β filter β=0.5, **không** mô phỏng uncertainty.
- **Sample A (thường)**: init `(10,10,0,0)`; meas theo frame: `(12,10)`, `(13,10)`, `(14,11)`:
  ```json
  {"init":[10,10,0,0],"meas":[[12,10],[13,10],[14,11]],"beta":0.5}
  ```
  **Expected** (verify): trace `[11,10,1,0] → [12.5,10,1.5,0] → [14,10.5,1.5,0.5]` — vận tốc học dần từ residual.
- **Sample B (biên — coast)**: `{"state":[14,10.5,1.5,0.5],"frames_no_meas":2}` → **Expected** (verify): frame1 `(14+1.5, 10.5+0.5) = (15.5,11)`; frame2 `(17,11.5)` — vị trí vẫn chạy theo v cũ dù không có đo.
- **Storyboard**: đường đi xe (chấm xanh meas), mũi tên v, vị trí dự đoán (vòng tròn rỗng); nút "mất meas 2 frame" → track coast về phía trước; bảng realtime: `pred | residual | v'`; pseudo-line 1–3. Giải thích VN: "Kalman = trung bình giữa 'đoán theo v' và 'đo thật' — mất đo thì chỉ còn đoán".
- **Thư viện ngoài**: `cv2.KalmanFilter` [code] — demo α-β giản lược.

#### B2. `prediction-age-decay` — Giới hạn tuổi dự đoán
- **Nhóm**: Tracking · **Tiên quyết**: B1 · **Liên quan**: B3, B8, B9
- **Code**: `backend/main_detect/src/techgar/motion_tracker.py:239-290` `_predict_tracks` (3 nhánh decay/anchor/freeze); `:297-317` `_prediction_age_seconds`, `_prediction_age_limit_seconds` (merged → `max(0.40, merged_reacquire_max_seconds=3.0)`); `:1304-1330` `_has_recent_merged_freeze`.
- **Vai trò**: dự đoán càng cũ càng không tin — khi `invisible>0`, vị trí dự đoán **nội suy về điểm đo cuối** theo `e^(−age/τ)`; `age > limit` → prediction **đóng băng thành anchor** tại `measured_point` (`stale_prediction`, confidence 0) — vẫn phục vụ reacquire B8, không phải "không gán được"; merged-freeze giữ nguyên raw Kalman (không decay) để bảo vệ hành lang tách xe.
- **Input**: `last_meas_point`, `raw_kalman_point`, `last_meas_time`, `now`, `invisible>0`, `merged_freeze`, `age_limit` (base 0.40s / merged-extended `max(0.40,3.0)`). **Output**: `point`, `prediction_source`, `velocity_confidence`.
- **Pseudocode** (chỉ nhánh `invisible>0`; `invisible=0` → `point = raw Kalman`):
  1. `age = now − last_meas`; `limit = base` (merged-freeze gần đây → `limit = max(0.40, 3.0)`).
  2. `age > limit` → `point = measured_point`, `source = stale_prediction`, `conf = 0` — anchor cho B8.
  3. `merged_freeze` → `point = raw_point` (**Kalman thô, không decay**), `conf = 1.0` — occlusion guard cần hành lang vận tốc đều tới khi cặp xe tách.
  4. Ngược lại → `decay = e^(−age/τ)`; `point = measured + (raw − measured)·decay`; `conf = 1 − age/limit` (**tuyến tính**, không exponential).
- **Cấu trúc**: timestamp float; flag `prediction_source` string.
- **Độ phức tạp**: O(1). **space** O(1); **[sim]**: O(1).
- **Edge cases**: `invisible=0` → raw Kalman, không decay; merged-freeze → vận tốc không suy giảm dù invisible (ngoại lệ có chủ đích); `age>limit` → anchor tại điểm đo cuối — B8 dùng chính điểm này.
- **Failure modes**: `limit` dài → dự đoán lạc xa theo xe đã dừng → gán nhầm blob kề; `τ` nhỏ → anchor về điểm cũ quá sớm → mất xe chạy qua occlusion ngắn.
- **Thực tế vs mô phỏng**: giữ 3 nhánh + anchor semantics + extended limit literal; sample dùng đúng công thức vector `measured + (raw−measured)·e^(−age/τ)` và `conf` tuyến tính — chỉ thu nhỏ điểm/thời gian. `[sim-omits]`: `_has_recent_merged_freeze` quét cửa sổ thời gian thật (:1304-1330), `merged_freeze` còn gate bởi `consecutive_invisible_count>0` + `last_ambiguous_kind=="merged"` — demo truyền flag sẵn.
- **Sample A**: `{"measured":[10,10],"raw":[14,10],"ages":[0,0.1,0.2,0.3],"tau":0.25,"age_limit":0.40,"invisible":1}` → **Expected** (verify, `point = measured + (raw−measured)·e^(−age/0.25)`): `x = [14, 12.68, 11.80, 11.20]` (y=10), `conf = [1, 0.75, 0.50, 0.25]`; `age=0.5` → `point=[10,10]` anchor, `conf=0`, `source=stale_prediction`.
- **Sample B (biên — merged-freeze giữ raw)**: `{"measured":[10,10],"raw":[14,10],"age":0.5,"merged_freeze":true,"extended_limit":3.0}` → **Expected** (verify): `age 0.5 ≤ 3.0` và `merged_freeze` → **`point = [14,10]` raw Kalman, `conf=1.0`, `source=kalman_prediction`** — không decay; cùng input `merged_freeze:false` → `[10,10]` anchor `conf=0`.
- **Storyboard**: đường cong `e^(−age/τ)`; chấm prediction trượt từ `raw` về `measured` theo age; toggle `merged_freeze` → chấm bật lại `raw` (vận tốc đều); vạch limit → chấm gom về `measured` đổi màu "anchor"; bảng realtime: `age | limit | decay | conf | source`; pseudo-line 1–4. Giải thích VN: "dự đoán có hạn dùng — hết hạn nó không chết mà đóng băng thành neo để B8 còn bắt lại; chỉ cặp xe dính merged mới được giữ vận tốc nguyên".
- **Thư viện ngoài**: `numpy` [code].

#### B3. `association-distance-gate` — Cổng khoảng cách gán
- **Nhóm**: Tracking · **Tiên quyết**: B1, B2 · **Liên quan**: B5, B6
- **Code**: `backend/main_detect/src/techgar/motion_tracker.py:1193-1231` `_association_gate`; `:1233-1244` `_track_velocity_px_per_frame`. Defaults: `velocity_gate_scale=2.0`, `velocity_gate_size_ratio=1.0`, `velocity_gate_min_observations=3`, `max_distance=180`, `max_prediction_age_seconds=0.40`.
- **Vai trò**: trước khi tính cost, loại cặp track–detection **quá xa so với vận tốc + số frame mất đo + kích thước vật** → giảm ma trận và chặn gán nhầm xa. Công thức là **bounded budget**: kẹp giữa `floor` (kích thước tối thiểu) và `ceiling` (`max_distance`) — không phải tổng tuyến tính `base + …`.
- **Input**: `track` (speed px/frame, `invisible`, `extent=max(w,h)`, `total_visible_count`, `pred_age`); `det` (anchor). **Output**: `gate_px` — cặp có `dist > gate_px` bị loại khỏi ma trận (cost=∞).
- **Pseudocode**:
  1. `invisible>0 && pred_age > age_limit (0.40s)` → `gate = 0` (dự đoán hết hạn, chỉ còn B8 anchor).
  2. `total_visible_count < min_obs (3)` → `gate = ceiling (180)` — track mới được "fail-open" vì Kalman chưa có velocity đáng tin.
  3. `budget = speed·(invisible+1)·scale (2.0) + size_ratio (1.0)·extent`.
  4. `floor = max(24, size_ratio·extent)`; `gate = min(ceiling, max(floor, budget))`.
- **Cấu trúc**: scalar gate.
- **Độ phức tạp**: O(1)/cặp → O(T·D) tổng. **space** O(1); **[sim]**: O(T·D).
- **Edge cases**: track nhanh + mất đo lâu → budget lớn → gate rộng; track chậm đứng yên → budget < floor → gate=floor (xe chậm vẫn được vùng đệm 24px); dự đoán hết hạn → gate=0; track thiếu obs → ceiling.
- **Failure modes**: `scale` lớn → gate rộng → ứng viên nhiễu vào ma trận; floor thấp → xe đỗ yên vẫn bị gán nhầm det sát bên; ceiling cao + track mới → gán bừa cho fragment nhiễu đầu tiên.
- **Thực tế vs mô phỏng**: giữ nguyên công thức 4 bước (gate=0 / fail-open / budget / kẹp floor-ceiling) với literal defaults. `[sim-omits]`: velocity fallback lấy từ `track.history` khi Kalman thiếu state (:1233-1244) — demo truyền `speed` sẵn.
- **Sample A**: `{"speed":5,"inv":3,"extent":10,"visible_count":10,"scale":2.0,"size_ratio":1.0,"ceiling":180,"floor_min":24}` → **Expected** (verify): `budget = 5·(3+1)·2 + 1·10 = 50`; `floor = max(24,10) = 24` → **`gate = min(180, max(24,50)) = 50`px**.
- **Sample B (biên — floor thắng + hai nhánh đặc biệt)**: `{"speed":0.5,"inv":0,"extent":10,"visible_count":10,"scale":2.0,"size_ratio":1.0,"ceiling":180,"floor_min":24}` → **Expected** (verify): `budget = 0.5·1·2+10 = 11 < floor 24` → **`gate=24`** (floor cứu xe đứng yên); cùng input nhưng `visible_count:2` → `gate=180`; `inv:2 & pred_age:0.5 > 0.40` → `gate=0`.
- **Storyboard**: track chấm xanh + vòng tròn gate; 3 slider `speed/inv/extent` kéo → budget thay đổi nhưng vòng bị kẹp bởi vạch `floor` (cam) và `ceiling` (đỏ); detection ngoài vòng gạch đỏ khỏi ma trận; bảng realtime: `speed | inv | extent | budget | floor | gate | pass`; pseudo-line 1–4. Giải thích VN: "gate = quãng đường xe có thể đi được — kẹp hai đầu để không quá hẹp (mất track) cũng không quá rộng (cướp blob xe khác)".
- **Thư viện ngoài**: `numpy` [code].

#### B4. `iou-overlap-score` — Độ chồng lấp hộp
- **Nhóm**: Tracking · **Tiên quyết**: A5 · **Liên quan**: B5, A9, D1
- **Code**: `backend/main_detect/src/techgar/motion_tracker.py:397-405` `_iou`; `slot_vehicle_binder.py:712-745` `_overlap_geometry` (phiên bản đa giác cho slot).
- **Vai trò**: thành phần cost — detection khớp dự đoán thường chồng lấp cao; IoU = giao/hợp diện tích.
- **Input**: `boxA`, `boxB` [x,y,w,h]. **Output**: `iou ∈ [0,1]`.
- **Pseudocode**:
  1. `inter = max(0, min(x2A,x2B) − max(x1A,x1B)) · max(0, min(y2A,y2B) − max(y1A,y1B))`.
  2. `iou = inter / (areaA + areaB − inter)` (union ≠ 0).
- **Cấu trúc**: scalar.
- **Độ phức tạp**: O(1). **space** O(1); **[sim]**: O(1).
- **Edge cases**: disjoint → 0; lồng nhau → inter/union < 1 (không phải 1!); bằng nhau → 1.
- **Failure modes**: bbox co giãn do morphology → IoU thấp dù cùng xe; dùng độc lập sẽ gán sai — chỉ là 1 term trong B5.
- **Thực tế vs mô phỏng**: giữ nguyên công thức. `[sim-omits]`: phiên bản polygon (D1 dùng raster-∩ riêng).
- **Sample A**: `{"a":[0,0,4,4],"b":[2,0,4,4]}` → **Expected** (verify): `inter=2·4=8`, `union=16+16−8=24` → `IoU=0.3333`.
- **Sample B (biên — lồng nhau)**: `{"a":[0,0,2,2],"b":[0,0,4,4]}` → **Expected** (verify): `inter=4`, `union=16` → `IoU=0.25` — lồng hoàn toàn vẫn chỉ 0.25.
- **Storyboard**: hai hộp kéo được trên lưới, vùng giao tô đỏ; số IoU cập nhật live; case "lồng nhau" preset → số 0.25 gây ngạc nhiên; bảng realtime: `inter | union | iou`; pseudo-line 1–2. Giải thích VN: "IoU đo mức trùng hình, không đo 'cùng vật' — hộp nhỏ trong hộp lớn vẫn thấp".
- **Thư viện ngoài**: không.

#### B5. `association-cost-matrix` — Ma trận chi phí gán
- **Nhóm**: Tracking · **Tiên quyết**: B3, B4 · **Liên quan**: B6, B7, B10, B11
- **Code**: `backend/main_detect/src/techgar/motion_tracker.py:1691-1781` (khối build cost trong `_assign`). Công thức literal `:1761-1766`:
  `cost = 0.45·(dist/max_distance) + 0.25·(1−iou) + 0.20·app_d + 0.10·size_error` — **4 term, không có direction term**. `size_error = min(1, |ln(det_area/clean_area)| / |ln(2.80)|)` `:1756-1760`; `max_distance = max_distance·min(1.25, 1 + min(invisible,15)/60)` `:1691-1694`.
- **Vai trò**: gộp bằng chứng thành 1 số `cost(track,det)` — càng thấp càng khớp; cặp fail gate → `10` (∞).
- **Input**: gates (B3), IoU (B4), appearance distance (B10/B11 → `min(histogram_distance, compare_tracklets)` `:1717-1725`, default `0.25` thiếu hist track / `0.5` thiếu hist det), area ratio. **Output**: `costs[T×D]` + `_pair_metrics`.
- **Pseudocode**:
  1. `max_distance_t = 180 · min(1.25, 1 + min(invisible,15)/60)` (`max_distance=180` literal `:42`).
  2. Cặp qua gate distance (B3): `app = min(hist_d, tracklet_d)`; thiếu hist → `0.25`/`0.5`; `zone_d` nếu có → `app = 0.70·app + 0.30·zone` `:1728-1731`.
  3. `size_error = min(1, |ln(area_ratio)| / |ln(2.80)|)`; `cost = 0.45·(d/max_d_t) + 0.25·(1−iou) + 0.20·app + 0.10·size_error`.
  4. Cặp fail gate (distance/app/size-band/missing-hist-when-invisible) → `cost = 10`; merged/ambiguous col → `10` `:1806`.
- **Cấu trúc**: `float[T×D]`; `_pair_metrics{position,iou,appearance,size,total,association_source}`.
- **Độ phức tạp (code)**: O(T·D). **space** O(T·D); **[sim]**: O(T·D) + solver B6.
- **Edge cases**: det `hist=None` → `app=0.5` (và `invisible>0` → reject trước `:1726`); track `appearance=None` → `0.25`; `area_ratio` ngoài `[0.35, 2.80]` → reject size-band `:1749-1755` — size vừa là gate vừa là cost term; `invisible` lớn → `max_distance_t` phình tới ×1.25 → d_norm giảm (track mất dấu được nới nhẹ).
- **Failure modes**: trọng số cố định [0.45,0.25,0.20,0.10] → appearance chiếm tối đa 0.20; `cost_limit=0.90` `:72` là ngưỡng "thà không gán".
- **Thực tế vs mô phỏng**: giữ đúng 4 term + literal weights + log-size + ∞ gate. `[sim-omits]`: spatial zone blend, `min(hist,tracklet)`, per-track `max_distance` scaling theo invisible, `association_source`, `_pair_metrics` — demo term trực tiếp.
- **Sample A**: `{"d_norm":0.3,"iou":0.35,"app":0.15,"area_ratio":1.5}` → `size_error = |ln1.5|/|ln2.8| = 0.4055/1.0296 = 0.3938` → **Expected** (verify): `cost = 0.45·0.3 + 0.25·0.65 + 0.20·0.15 + 0.10·0.3938 = 0.135+0.1625+0.03+0.0394 = 0.3669`.
- **Sample B (biên — fail gate)**: `{"d":55,"gate":50}` → **Expected** (verify): `55 > 50 → cost=10` (∞) — không vào solver; gate = giá trị đã verify ở B3 sample A.
- **Storyboard**: bảng ma trận T×D, ô tô màu theo cost (xanh thấp, đỏ cao, xám ∞); hover ô → popup phân tích **4 term** thành thanh xếp chồng + `size_error` hiển thị dạng log; bảng realtime: `term contributions`; pseudo-line 1–4. Giải thích VN: "cost là món nợ tổng hợp — 45% vị trí, 25% chồng lấp, 20% màu, 10% kích thước; hướng chạy KHÔNG nằm trong cost, nó là gate riêng".
- **Thư viện ngoài**: `numpy` [code].

#### B6. `lapjv-assignment` — Gán tối ưu Jonker–Volgenant
- **Nhóm**: Tracking · **Tiên quyết**: B5 · **Liên quan**: B7, D2, D10, E4
- **Code**: `backend/main_detect/src/techgar/motion_tracker.py:1597-2007` `_assign` (gọi `lapjv(costs, extend_cost=True, cost_limit=~)` — thư viện `lap`, **không phải "Hungarian" nói chung**).
- **Vai trò**: tìm phép gán 1–1 có **tổng cost nhỏ nhất**; cho phép bỏ trống (unassigned) với chi phí `cost_limit` — cùng cơ chế dùng ở D2/D10/E4.
- **Input**: `costs[T×D]` (có cột giả unassigned). **Output**: `assign[]` (row→col hoặc −1).
- **Pseudocode** (demo):
  1. Với mọi phép gán hợp lệ (mỗi hàng → cột duy nhất hoặc unassigned): `total = Σ cost + (số unassigned)·cost_limit`.
  2. Chọn total min (vét cạn n≤5, hoặc LAPJV thật nếu có thư viện).
- **Cấu trúc**: ma trận + mảng gán.
- **Độ phức tạp (code)**: LAPJV ~O(n³). **space** O(n²) ma trận + O(n) gán; **[sim]**: exhaustive O(n!) với n≤5 — **chỉ cho demo**, ghi rõ khác biệt.
- **Edge cases**: hàng toàn ∞ → unassigned; 2 det tranh 1 track → solver chọn cặp rẻ hơn toàn cục (có thể hy sinh cặp "đẹp" cục bộ); `cost_limit` là ngưỡng "thà không gán".
- **Failure modes**: ma trận xấu (nhiều cost ~limit) → nghiệp gán nhạy cảm; code gốc tin LAPJV O(n³) — demo O(n!) chỉ đúng cho n nhỏ.
- **Thực tế vs mô phỏng**: demo **solver exact** (không greedy). `[sim-omits]`: thuật toán LAPJV bên trong (augmenting path + dual) — demo vét cạn; `extend_cost` mô phỏng bằng `unassigned=cost_limit`.
- **Sample A**: `{"costs":[[0.2,0.8,10],[0.7,0.3,10],[10,10,0.4]],"cost_limit":0.9}` → **Expected** (verify exhaustive): gán `r0→c0, r1→c1, r2→c2`, `total=0.9`.
- **Sample B (biên — thà không gán)**: `{"costs":[[0.95,10],[10,0.3]],"cost_limit":0.9}` → **Expected** (verify): `r0` unassigned (0.95>0.9), `r1→c1` → `total=1.2`.
- **Counterexample greedy (đã verify, chỉ để đối chiếu — không phải solver)**: `{"costs":[[0.1,0.5],[0.4,10]],"cost_limit":0.9}` → greedy theo hàng: `r0→c0` (0.1 nhỏ nhất hàng) → `r1` chỉ còn c1=10 ≥limit → unassigned (0.9) → **greedy total=1.0**. Optimal: `r0→c1`(0.5) + `r1→c0`(0.4) → **0.9**. Greedy thua 0.1 vì cướp cột rẻ của hàng sau — đúng lý do production dùng LAPJV.
- **Storyboard**: ma trận cost + solver exact duyệt hoán vị (đếm số phương án); toggle "exact vs greedy" — greedy tô ô chọn xanh lá, exact tô tím; khi khác nhau → banner "greedy ≠ tối ưu"; bảng realtime: `total_exact | total_greedy | n!`; pseudo-line 1–2. Giải thích VN: "LAPJV bảo đảm tổng nhỏ nhất toàn cục — vét cạn chỉ dạy được với n≤5".
- **Thư viện ngoài**: `lap.lapjv` [code] — demo solver exact thuần JS.

#### B7. `assignment-margin-ambiguity` — Trì hoãn gán khi tranh chấp sít sao
- **Nhóm**: Tracking · **Tiên quyết**: B5, B6 · **Liên quan**: A10, A12, B9
- **Code**: `backend/main_detect/src/techgar/motion_tracker.py:1165-1191` `_assignment_has_margin`; `:1278-1302` `_lineage_score`; usage `:1685-1686`, `:1914-1989`; defaults `ambiguous_recovery_frames=3` `:81`, `split_assignment_margin=0.08` `:82`; `occlusion_guard.gate_assignments` `:1994-1999` (A12).
- **Vai trò**: sau LAPJV, **chỉ track đang hồi phục** (`consecutive_invisible_count>0` hoặc `_has_recent_merged_freeze`, vào `split_margin_track_ids` `:1685-1686`) mới bị kiểm margin — cặp thắng sít sao → `split_recovering` + defer, tránh swap-ID ngay sau mất dấu/merge. Track bình thường nhận kết quả LAPJV luôn `:1990-1992` (margin chỉ còn dùng cho cờ `appearance_trusted` `:2000-2006`).
- **Input**: `costs`, `assignment`, `lineage_score`. **Output**: `assignments'` + `split_recovering` marks + `ambiguous_clear_streak`.
- **Pseudocode**:
  1. Với mỗi track được gán mà ∈ `split_margin_track_ids`: `lineage = mean(min(1,|history|/10), min(1,visible/10), min(1,frag/5), min(1,age/15))` `:1287-1302`.
  2. `margin = 0.08·(2 − lineage)` — track mới (lineage≈0) cần gap 0.16, track cũ ≈ 0.08 `:1921`.
  3. `_assignment_has_margin`: `alternatives = mọi cost[r][c']<10 (c'≠c) ∪ cost[r'][c]<10 (r'≠r)`; `ok = alternatives rỗng hoặc min(alt) − cost ≥ margin` `:1180-1191`.
  4. `!ok` → `association_state="split_recovering"`, defer cặp, suppress cột `:1951-1963`.
  5. `ok` nhưng `recently_ambiguous && !clear_evidence && streak+1 < 3` → defer + `streak++` (`association_recovery_pending`) `:1964-1985`; `clear_evidence = has_margin && total≤0.12 && app≤0.08 && size≤0.20 && pos≤0.20` `:1939-1945` → bỏ qua streak, gán ngay.
  6. Ngược lại → `streak=0`, gán `:1986-1989`.
- **Cấu trúc**: `split_margin_track_ids`; `ambiguous_clear_streak`; `association_state` string.
- **Độ phức tạp (code)**: O(T·D) second-min. **space** O(T+D); **[sim]**: O(T·D).
- **Edge cases**: track vừa reappear với margin mỏng → defer dù LAPJV chọn nó (tránh kế thừa ID xe lân cận); `clear_evidence` cực mạnh → đóng merged interval ngay không cần streak; streak đủ 3 → gán bình thường; track không ∈ split_margin (đang thấy) → **không kiểm** dù margin mỏng.
- **Failure modes**: `ambiguous_recovery_frames` cao → track "đói" detection nhiều frame sau merge; `lineage` thấp → margin ×2 quá chặt cho fragment thật.
- **Thực tế vs mô phỏng**: giữ combined second-min + lineage-scaled margin + streak-3 + phạm vi chỉ-split-track. `[sim-omits]`: `appearance_trusted` flag (dùng margin ở mọi cặp nhưng chỉ set cờ, không defer), occlusion `gate_assignments` (A12), `clear_evidence` 4-điều-kiện — demo giữ gate chính.
- **Sample A (thường — track hồi phục defer)**:
  ```json
  {"costs":[[0.30,0.32,10],[0.90,10,0.31]],"margin_base":0.08,"lineage":0.0,"in_split_margin":[true,true],"assign":[[0,0],[1,2]],"streak":[0,0]}
  ```
  **Expected** (verify): `margin=0.08·2=0.16`; r0: `min_alt−0.30 = 0.32−0.30 = 0.02 < 0.16` → **defer `split_recovering`**; r1: `min(0.90)−0.31=0.59 ≥ 0.16` và `clear_evidence` (`total 0.31>0.12` → false) nhưng `recently_ambiguous=false` → **keep gán**.
- **Sample B (biên — track đang-thấy bỏ qua margin)**:
  ```json
  {"costs":[[0.30,0.32,10],[0.90,10,0.31]],"margin_base":0.08,"in_split_margin":[false,true],"assign":[[0,0],[1,2]]}
  ```
  **Expected** (verify): r0 **không ∈ split_margin** → gán ngay `r0→c0` dù gap chỉ 0.02 — margin check không áp cho track đang được quan sát; r1 như trên keep.
- **Storyboard**: ma trận + hai thẻ track: "đang thấy" (xanh, bỏ qua check) vs "hồi phục" (vàng, qua phễu margin→streak); thanh `lineage` kéo → `margin=0.08·(2−lin)` đổi; streak dots 0/3; bảng realtime: `in_split | lineage | margin | gap | streak | verdict`; pseudo-line 1–6. Giải thích VN: "LAPJV giải bài toán, margin giải vấn đề tin cậy — chỉ track vừa mất dấu mới phải thắng cách biệt".
- **Thư viện ngoài**: `numpy` [code].

#### B8. `stale-anchor-reacquire` — Tái bắt track qua neo cũ
- **Nhóm**: Tracking · **Tiên quyết**: B2, B3, B10 · **Liên quan**: B7, B9
- **Code**: `backend/main_detect/src/techgar/motion_tracker.py:1627-1701` (nhánh stale trong `_assign`); gates `:1726-1755`; cost `:1761-1766`; windows `reacquire_max_seconds=1.50` `:68`, `merged 3.0` `:69`, `lost_appearance_threshold=0.30` `:83`, `min/max_reacquire_area_ratio 0.35/2.80` `:84-85`.
- **Vai trò**: track mất đo quá `prediction_age_limit` → prediction neo tại `last_measured_center` (`stale_prediction`) và được **gate riêng theo điểm đo cuối** — cửa sống tái bắt trước khi reacquire window đóng.
- **Input**: `track` (invisible>0), `last_measured_center`, `clean_size`, `appearance`, `lost_seconds`; `det`. **Output**: `cost | skip`.
- **Pseudocode**:
  1. `lost_seconds > reacquire_window` (1.5s; 3.0s nếu merged-freeze gần) → skip toàn bộ track `:1636-1651`.
  2. `invisible>0 && prediction_age > limit` → `predicted_point = last_measured_center` + `stale_anchor_reacquire=true` `:1654-1684` (event `stale_prediction_replaced_by_measurement_anchor`).
  3. `gate = min(max_distance·scale, max(3.0, 0.30·diag(clean_w,clean_h)))` `:1696-1701` — override gate 0 của `_association_gate`.
  4. `det.hist = None && invisible>0` → skip `:1726`; `app > 0.30` → skip `:1732-1733`; `app > min(0.30, 0.22)=0.22` khi stale → skip `:1734-1737`; `area_ratio ∉ [0.35, 2.80]` → skip `:1749-1755`.
  5. Qua hết → **cost 4-term bình thường** (B5) — KHÔNG có `cost = floor + w·d`; `association_source="last_measurement_anchor"` `:1776-1780`.
- **Cấu trúc**: scalar; `_last_association_events`.
- **Độ phức tạp**: O(1)/cặp. **space** O(1); **[sim]**: O(1).
- **Edge cases**: xe tắt máy đỗ yên rồi khởi động lại → anchor cũ vẫn đúng → reacquire (lý do tồn tại); xe khác đậu vào chỗ cũ nhưng khác màu → `app>0.22` chặn; det mất hist → skip ngay khi invisible>0; `measured=None` → `continue` `:1659-1661`.
- **Failure modes**: `0.30·diag` nhỏ → xe nhỏ chỉ cứu được det sát neo; reacquire window 1.5s ngắn → xe đỗ quá lâu mất hẳn (TTL khác quyết định xoá track, B9); size-band [0.35,2.80] chặn blob gộp/vỡ.
- **Thực tế vs mô phỏng**: giữ anchor + 5 gate (window, dist, hist, app×2, size-band) + cost-4-term. `[sim-omits]`: `max_distance` scale theo invisible, `merged_freeze` window 3.0s, zone-blend, event log — demo giữ 3 gate chính + cost thường.
- **Sample A (thường — hồi sinh)**:
  ```json
  {"last_meas":[5,5],"clean_wh":[4,3],"det":{"point":[6.5,6],"box":[4,3,5,3],"app":0.2,"hist":[1,0]},"lost_s":0.8,"invisible":1,"max_dist_demo":20}
  ```
  **Expected** (verify): `lost 0.8 ≤ 1.5`; `diag(clean)=5` → `gate=min(20, max(3,1.5))=3`; `d=√(1.5²+1²)=1.803 ≤ 3`; `app 0.2 ≤ 0.22`; `area_ratio=15/12=1.25 ∈ [0.35,2.80]`; `iou(pred_box (3,2,4,3), det)=6/21=0.2857`; `size_err=|ln1.25|/|ln2.8|=0.2167` → **`cost = 0.45·(1.803/20)+0.25·(1−0.2857)+0.20·0.2+0.10·0.2167 = 0.2809`** → vào solver.
- **Sample B (biên — sai màu / quá hạn)** — track context chung cho cả 2 case:
  ```json
  {"track":{"last_meas":[5,5],"clean_wh":[4,3],"invisible":1,"max_dist_demo":20},
   "cases":[
     {"det":{"point":[6,6],"box":[4,3,4,3],"app":0.25,"hist":[1,0]},"lost_s":0.8},
     {"det":{"point":[6,6],"box":[4,3,4,3],"app":0.2,"hist":[1,0]},"lost_s":2.0}]}
  ```
  **Expected** (verify): case1 `app 0.25 > 0.22` → **reject appearance** — đúng chỗ sai màu; case2 `lost 2.0 > 1.5` → **skip reacquire_window** — quá hạn thì không vào gate nào nữa.
- **Storyboard**: track xám "chết tạm" ở neo cũ, vòng `max(3, 0.3·diag)`; det mới vào vòng + swatch màu khớp → track hồi sinh xanh; thanh `lost_seconds` chạy tới 1.5s → vòng biến mất (window đóng); bảng realtime: `lost_s | gate | d | app | size | cost`; pseudo-line 1–5. Giải thích VN: "neo cũ + cùng màu + cùng cỡ = bằng chứng tối thiểu — và cost vẫn là công thức 4-term thường, chỉ điểm so sánh đổi".
- **Thư viện ngoài**: `numpy` [code].

#### B9. `track-lifecycle` — Vòng đời track: tentative→confirmed→lost→removed
- **Nhóm**: Tracking · **Tiên quyết**: B6, B7 · **Liên quan**: B8, B10, E6
- **Code**: `backend/main_detect/src/techgar/vehicle_tracker.py:20-23` `TrackStatus` (chỉ 3 enum); `motion_tracker.py:2023` birth; `:2071-2094` `_is_confirmable`; `:2096-2170` `_apply_detection` + `:2170` re-confirm; `:2226-2342` `process_frame` lost/expire; `:2175-2203` `suspend_track`.
- **Vai trò**: trạng thái của mỗi track; chỉ `confirmed` mới được cấp global ID (E6) và bind slot (D). **`expired` không phải trạng thái enum** — enum chỉ `TENTATIVE/CONFIRMED/LOST`; hết TTL → track bị **pop khỏi `_tracks`**, non-tentative được đưa vào `_exited_tracks` + emit `expired_tracks` **một lần** trong output (sau đó không còn "ở trạng thái expired").
- **Input**: detections đã gán, clock. **Output**: transitions + danh sách `newly_lost`, `exited`, `confirmed`, `expired_tracks`.
- **Pseudocode**:
  1. Detection unmatched → track `tentative` (đếm `total_visible_count`).
  2. `_is_confirmable`: `total_visible_count ≥ 3` **và** `‖(cx,cy) − origin‖ ≥ min_confirm_displacement (12px)`; priority track: `min_visible=2` + `priority_observation_count ≥ 2` + `disp ≥ 3`. Đủ → `confirmed`. (Không có điều kiện size/hist.)
  3. Track không được gán → `invisible++`; **chỉ `confirmed` → `lost`** — tentative unmatched **không bao giờ thành `lost`**, chỉ bị pop lặng lẽ khi hết TTL (không emit).
  4. `invisible > lost_ttl` (hoặc `_lost_beyond_ttl_seconds`) → **pop khỏi `_tracks`**; nếu `status ≠ tentative` → vào `_exited_tracks` + emit `expired_tracks` 1 lần.
  5. `suspend_track` (parked) → ghi `association_state = "suspended_*"` — **trường string riêng** song song enum (B7/E6 đọc nó), không phải state thứ 4.
- **Cấu trúc**: enum `TrackStatus`; counters `total_visible_count/invisible`; `association_state` string; `_exited_tracks` dict.
- **Độ phức tạp**: O(T). **space** O(T); **[sim]**: O(T).
- **Edge cases**: det quay lại trước ttl → `lost → confirmed` (re-confirm qua `_is_confirmable` mỗi `_apply_detection`); tentative chết trẻ → pop không event (nhiễu blob không lọt vào output); suspended → sống qua ttl (khác removed).
- **Failure modes**: `ttl` ngắn → xe bị che lát mất ID → ID mới (nhảy ID); `disp ≥ 12px` khó đạt cho xe đỗ ngay khi vào cảnh → chưa confirm → không có GID.
- **Thực tế vs mô phỏng**: giữ 3 enum + emit-expired + suspend flag riêng + re-confirm. `[sim-omits]`: `exited` qua gate-zone (owner C), `priority_track` nguồn gốc, `newly_lost` bookkeeping — demo đếm frame đồng bộ.
- **Sample A**: `{"dets":[1,0,0,0,0],"ttl":3,"disp_ok":true}` (đã confirmed) → **Expected** (verify): `[confirmed, lost(1), lost(2), removed+emit(4), —]` — hết hạn ở frame 4: pop + emit `expired_tracks` 1 lần, **frame sau track không còn tồn tại** (không "ở state expired").
- **Sample B (biên — hồi sinh)**: `{"dets":[1,0,1,0,0],"ttl":3}` → **Expected** (verify): `confirmed → lost(1) → confirmed (reset, re-confirm) → lost(1) → lost(2)` — quay lại đúng lúc cứu track.
- **Storyboard**: dòng thời gian 5 frame, thẻ track đổi màu theo state (vàng tentative → xanh confirmed → cam lost → đỏ mờ khi bị pop + badge "expired emitted"); counter `invisible` tick; bảng realtime: `frame | matched | invisible | state`; pseudo-line 1–5. Giải thích VN: "confirmed là 'căn cước' — chỉ nó mới được cấp global ID và chiếm slot".
- **Thư viện ngoài**: không trực tiếp.

#### B10. `hsv-lab-descriptor` — Mô tả màu của tracklet
- **Nhóm**: Tracking · **Tiên quyết**: A5 · **Liên quan**: B5, B8, B11, E7
- **Code**: `backend/main_detect/src/techgar/tracklet_descriptor.py:18-68` `hsv_histogram`; `:81-138` `compute_sample_quality`; `:141-149` `histogram_distance`; `:152-179` `spatial_histograms`/`spatial_distance`; caller gate `quality < 0.5` (docstring `:90-91`).
- **Vai trò**: "dấu vân tay" màu của detection — descriptor **416 chiều** (ABI cố định) = weighted-concat `0.70·hist(H,S)[16×16]` + `1.20·hist(a,b)[12×12]` + `0.60·hist(L)[16]`, **L2-normalized** `cv2.normalize` `:61-68` — kèm quality gate chống học rác.
- **Input**: `frame BGR`, `bbox`, `mask`. **Output**: `descriptor: float32[416]` + `quality ∈[0,1]`.
- **Pseudocode**:
  1. Crop `bbox` clamped vào frame; `hsv=cvtColor`, `lab=cvtColor`; `mask` không khớp/có 0 px fg → bỏ mask `:31-51`.
  2. `desc = normalize(concat(0.70·hs16×16, 1.20·ab12×12, 0.60·L16))` `:52-68` — weights nghiêng LAB vì H/S không phân biệt đen/trắng/xám.
  3. `quality`: `area<200 → 0` `:112-113`; `fg_ratio<0.15 → 0` `:125-126`; `size_s=min(1,area/1000)`; `fg_s=min(1,fg·2)`; `asp_s = 0.5 nếu aspect∉[0.3,4]`; **`quality = 0.5·size + 0.3·fg + 0.2·aspect`** `:137` — không phải `f(n_px, contrast)`.
  4. `distance = cv2.compareHist(a,b,HISTCMP_BHATTACHARYYA)` `:141-149` = `√(1 − BC/√(Σp·Σq))`; với hist Σ=1 → **`√(1−BC)`** (KHÔNG phải `1−BC`).
- **Cấu trúc**: `float32[416]`; `AppearanceTracklet.samples` :183-219; `spatial_histograms` 2 vùng.
- **Độ phức tạp**: O(compPx + 416). **space** O(416·S); **[sim]**: O(compPx + 6) — demo 1 hist 6-bin H.
- **Edge cases**: `crop` rỗng → `zeros(416)`; `area<200` hoặc `fg<0.15` → `quality=0` cứng (không phải điểm thấp); gallery thiếu → distance fallback (B11); hist `0.75/0.25` vs `[1,0]` → `BC=√0.75`, `d=√0.134=0.366` (nếu tưởng `1−BC` sẽ ra 0.134 — sai hệ số căn).
- **Failure modes**: xe 2 màu → hist rộng → distance lớn giữa 2 góc nhìn cùng xe; mask lỗi → học cả nền; `aspect<0.3` chỉ trừ điểm (0.5) không loại — xe dẹt méo vẫn được học nếu đủ px/fg.
- **Thực tế vs mô phỏng**: giữ chuẩn hoá + **Bhattacharyya căn** + quality-3-yếu-tố + q_min=0.5. `[sim]`: demo 1 hist H 6-bin (Σ=1). `[sim-omits]`: kênh S/LAB/L + weights 0.70/1.20/0.60, spatial-hist, L2-norm (demo Σ=1) — khi đó `d = √(1−Σ√(p·q))` là khớp cv2.
- **Sample A**: `{"px_h":[10,10,10,160],"bins":6,"bin_width":30}` → `bin(10)=0`, `bin(160)=5` → hist `[0.75,0,0,0,0,0.25]`; so `q=[1,0,0,0,0,0]` → `BC = √0.75·√1 = 0.866` → **Expected** (verify): **`d = √(1−0.866) = √0.134 = 0.366`** — mẫu trông gần giống nhưng khoảng Bhattacharyya-căn vẫn lớn hơn nhiều ước lượng `1−BC`.
- **Sample B (biên — quality gate cứng)**:
  ```json
  {"samples":[{"crop_area":400,"fg_ratio":0.5,"aspect":1.0},{"crop_area":100,"fg_ratio":0.9,"aspect":1.0},{"crop_area":900,"fg_ratio":0.10,"aspect":1.0}],"q_min":0.5}
  ```
  **Expected** (verify): s1 `0.5·0.4+0.3·1.0+0.2·1.0 = 0.7 ≥ 0.5` → giữ; s2 `area=100<200` → `quality=0` → loại; s3 `fg=0.10<0.15` → `quality=0` → loại — hai gate cứng chạy TRƯỚC công thức điểm.
- **Storyboard**: ảnh xe mini, px chảy vào 6 thùng màu; hist hai xe xếp cạnh; cây cầu đo `√(1−BC)` với marker so sánh `1−BC` gạch đỏ; nút "crop nhỏ"/"fg thấp" → quality rơi về 0 đúng gate; bảng realtime: `area | fg | aspect | quality | d`; pseudo-line 1–4. Giải thích VN: "OpenCV trả căn bậc hai của (1−hệ số) — nhớ căn, đừng quên; quality có hai điều kiện loại thẳng".
- **Thư viện ngoài**: `cv2`/`numpy` histogram [code] — demo 6-bin.

#### B11. `tracklet-gallery-match` — So khớp gallery tracklet
- **Nhóm**: Tracking · **Tiên quyết**: B10 · **Liên quan**: B5, B8, E7
- **Code**: `backend/main_detect/src/techgar/tracklet_descriptor.py:229-263` `appearance_samples`; `:266-274` `aggregate_appearance` (median + L2, fallback mean khi norm≈0); `:277-305` `merge_appearance_samples` (dedup `d ≤ 0.015`, bounded stride-sample tới 24); `:308-351` `compare_tracklets`; fallback gallery rỗng `missing_distance=0.25` `:312-314`.
- **Vai trò**: track giữ **gallery** mẫu màu — so 2 track = tổng hợp có trọng số 4 đại lượng từ ma trận cặp: nearest (median theo chiều gallery **nhỏ hơn**), coverage (median symmetric), aggregate (median-vector + L2), best-3-mean — không phải `nnMed + w·coverage_gap` lấy max hai chiều.
- **Input**: `galleryA[]`, `galleryB[]` (hist Σ=1 hoặc đã normalize). **Output**: `TrackletMatch{distance, support, sample_pairs, aggregate_distance, nearest_distance}`.
- **Pseudocode**:
  1. `pairwise[i][j] = histogram_distance(a_i, b_j)` (cv2 BHATTACHARYYA căn, B10) `:316-319`.
  2. `left_nearest = min theo hàng`; `right_nearest = min theo cột` `:321-322`.
  3. `partial_nearest = left_nearest nếu |A|≤|B| else right_nearest` `:327-331`; `nearest = median(partial)` `:332`.
  4. `coverage = median(concat(left_nearest, right_nearest))` `:333`.
  5. `aggregate = d(agg_median_L2(A), agg_median_L2(B))` `:334-336`.
  6. `best_pairs = mean(3 giá trị nhỏ nhất của pairwise)` `:337-338`.
  7. **`distance = 0.50·nearest + 0.20·coverage + 0.20·aggregate + 0.10·best_pairs`** `:339-344`; `support = min(|A|,|B|)` `:347`; clip [0,1].
- **Cấu trúc**: 2 list hist; ma trận pairwise; `TrackletMatch`.
- **Độ phức tạp**: O(|A|·|B|·N). **space** O(|A|+|B|); **[sim]**: ≤ O(9·6).
- **Edge cases**: gallery rỗng → `TrackletMatch(0.25, 0, 0, 0.25, 0.25)` — fallback thay fail cứng; `|A|≠|B|` → nearest chỉ theo chiều nhỏ hơn (gallery dài không veto entry tốt); aggregate `median` rồi **L2-normalize** — distance trên vector L2 dùng công thức cv2 đầy đủ (mean-normalized), không còn là `√(1−BC)` đơn giản.
- **Failure modes**: gallery học nhầm nền → `aggregate` lệch → term 0.20 kéo distance; `merge` dedup 0.015 → mẫu lặp bị ghi đè chứ không cộng; `stride-sample` khi vượt 24 → mất mẫu giữa hành trình.
- **Thực tế vs mô phỏng**: giữ pairwise + 4-term mix + support=min. `[sim-omits]`: `merge_appearance_samples` bounded merge, `appearance_samples` normalize từng nguồn, zone/spatial — demo galleries sẵn có.
- **Sample A (thường — khớp)**:
  ```json
  {"galleryA":[[0.9,0.1],[0.6,0.4]],"galleryB":[[0.8,0.2],[0.1,0.9]],"match_max":0.5}
  ```
  `d` = cv2-căn trên hist Σ=1: `pw=[[0.1003,0.6325],[0.1560,0.3938]]`; `partial=left_nearest=[0.1003,0.1560]` → `nearest=0.1281`; `coverage=median(0.1003,0.1560,0.1003,0.3938)=0.1281`; `agg = d(median-A→L2, median-B→L2) ≈ 0.22`; `best3=(0.1003+0.1560+0.3938)/3=0.2167`.
  **Expected** (verify): `distance = 0.5·0.1281 + 0.2·0.1281 + 0.2·0.22 + 0.1·0.2167 ≈ 0.1553 < 0.5` → **match**; `support=2`.
- **Sample B (biên — gallery lệch hẳn)**:
  ```json
  {"galleryA":[[0.9,0.1],[0.6,0.4]],"galleryB":[[0,1],[0,1]],"match_max":0.5}
  ```
  `pw=[[0.8269,0.8269],[0.6063,0.6063]]` → `nearest=0.7166`, `coverage=0.6063`, `agg≈0.7069`, `best3=0.6798`.
  **Expected** (verify): `distance = 0.5·0.7166 + 0.2·0.6063 + 0.2·0.7069 + 0.1·0.6798 ≈ 0.6889 > 0.5` → **không match**.
- **Storyboard**: hai cột thẻ màu (gallery), đường nối nn mỗi thẻ; bốn thanh trọng số `0.50/0.20/0.20/0.10` đổ vào một ly `distance`; chiều nearest hiển thị mũi tên từ gallery NGẮN hơn; bảng realtime: `pw | nearest | coverage | agg | best3 | distance | support`; pseudo-line 1–7. Giải thích VN: "không lấy max hai chiều — nearest chỉ đo từ phía gallery ít mẫu hơn, rồi trộn bốn bằng chứng".
- **Thư viện ngoài**: `numpy` [code].

#### C1. `slot-roi-precompute` — Tiền tính mask ROI của ô đỗ
- **Nhóm**: Occupancy · **Tiên quyết**: polygon slot từ config · **Liên quan**: C2, C3, C4
- **Code**: `backend/main_detect/src/techgar/parking_detector.py:228-320` `_compute_rois`; `:37-61` `_PrecomputedROI`, `_ROIEvidence`.
- **Vai trò**: raster hoá polygon thành các mask con để mọi phép đo sau chạy trên mask sẵn: `mask` (toàn ROI), `analysis_mask` (erode theo tỉ lệ), `analysis_boundary` (vành mỏng *bên trong* analysis), `core_mask` (polygon co về tâm ∩ analysis).
- **Input**: `polygon[N×2]`, `img_shape`; params `border_ignore_ratio=0.12`, `core_scale=0.55` [literal `:97-137`]. **Output**: `_PrecomputedROI{mask,area,analysis_mask,analysis_boundary,analysis_area,analysis_size,core_mask,core_area,bbox,center}`.
- **Pseudocode**:
  1. `mask = fillPoly(polygon)`; `area = count(mask)` (`:259-260`); `bbox = poly-bounds ±2px` (`:249-252`).
  2. `inset = round(min(roi_w,roi_h) · border_ignore_ratio)` — **`roi_w/h` là kích thước padded-bbox** (poly bounds ±2px, clip theo ảnh, `:249-254`), không phải width polygon; `inset>0` → `analysis = erode(mask, ellipse 2·inset+1)`, else `analysis = mask` (`:263-272`).
  3. **`analysis < 5 px → analysis = mask` (fallback, `:273-274`)** — slot nhỏ không chết, chỉ mất lớp lõi.
  4. `inner = erode(analysis, 3×3)`; **`analysis_boundary = analysis − inner`** (`:276-279`) — vành mỏng *trong* analysis, **không phải** `roi − analysis`.
  5. `core_poly = centroid + (poly − centroid)·core_scale`; `core = fillPoly(core_poly) ∩ analysis`; `core < 5 px → core = analysis` (`:288-296`).
  6. `analysis_size = boundingRect(analysis)`; lưu `area/analysis_area/core_area/analysis_size` (`:280-311`).
- **Cấu trúc**: 4 mask bool + diện tích/size cache; `_smoother` khởi tạo ở cuối (`:316`).
- **Độ phức tạp (code)**: O(H·W) mỗi slot một lần. **space** O(H·W·S) mask; **[sim]**: O(R) raster ô lưới.
- **Edge cases**: slot nhỏ → **fallback** (bước 3/5) chứ không "invalid"; `detect` chỉ skip khi `analysis_area == 0` (`:484`) — gần như không xảy ra sau fallback; `analysis_boundary` là vành *trong* analysis — C3 dùng mask này để phát hiện component "chạm vành"; polygon chéo/mảnh → `analysis_boundary` chiếm tỉ trọng lớn → nhiều component xe chạm vành → C3 nhạy.
- **Failure modes**: config sai polygon → mọi mask lệch → C2–C4 sai theo.
- **Thực tế vs mô phỏng**: giữ 4 mask + 2 fallback. `[sim-omits]`: `fillPoly` anti-alias, scale theo `img_shape` vs `imageWidth/Height` gốc (`:230-243`), ellipse structuring element — demo raster lưới nguyên + kernel vuông 3×3 đơn vị.
- **Sample A (thường)**:
  ```json
  {"poly":[[0,0],[7,0],[7,7],[0,7]],"border_ignore_ratio":0.12,"core_scale":0.55,"grid":8}
  ```
  `roi = {0..7}² = 64` ô; padded bbox `{0..7}` → `min_dim = 8` → `inset = round(8·0.12) = 1` → `analysis = {1..6}² = 36`; `inner = {2..5}² = 16` → `analysis_boundary = 36−16 = 20` ô (vành 1 ô trong analysis); `core_poly`: centroid (3.5,3.5), nửa cạnh 3.5→1.925 → `[1.575,5.425]²` → ô `{2..5}² = 16` ∩ analysis = **16** (≥5, không fallback).
  **Expected** (verify): `roi=64, analysis=36, analysis_boundary=20, core=16` — không fallback nào kích hoạt (normal path).
- **Sample B (biên — CẢ HAI fallback, không invalid)**:
  ```json
  {"poly":[[1,1],[4,1],[4,4],[1,4]],"border_ignore_ratio":0.2,"core_scale":0.55,"grid":8}
  ```
  `roi = {1..4}² = 16`; padded bbox `{0..6}×{0..6}` → `min_dim = 6` (đếm cả pad ±2) → `inset = round(6·0.2) = 1` → erode → `{2..3}² = 4 < 5` → **fallback 1: `analysis = local_mask = 16`** (`:273-274`); `inner = {2..3}² = 4` → `analysis_boundary = 16−4 = 12`; `core_poly`: nửa cạnh 1.5→0.825 → `[1.675,3.325]²` → ô `{2,3}² = 4` ∩ analysis = 4 **< 5** → **fallback 2: `core = analysis = 16`** (`:295-296`).
  **Expected** (verify): `roi=16, analysis=16 (fallback), analysis_boundary=12, core=16 (fallback)` — intermediate `analysis=4, core=4` chỉ là giá trị trước fallback; code **không có nhánh "invalid slot"**, slot nhỏ degrade về ROI đầy đủ.
- **Storyboard**: lưới 8×8, 4 lớp chồng: `mask` xám nhạt, `analysis` xanh dương đậm, `analysis_boundary` viền cam 1 ô sát mép analysis (không phải dải rộng ngoài), `core` đỏ tâm; slider `border_ignore_ratio` → `inset` đổi; preset "slot nhỏ" → thấy fallback: lớp analysis bung ra bằng mask; bảng realtime: `roi | analysis | boundary | core | fallback?`; pseudo-line 1–6. Giải thích VN: "mỗi ô đỗ có 4 lớp mask — slot nhỏ không bị loại, chỉ rớt xuống lớp đo thô".
- **Thư viện ngoài**: `cv2.fillPoly`, `cv2.erode`, `MORPH_ELLIPSE`, `boundingRect` [code] — demo raster lưới giản lược tương đương, không port cv2.

#### C2. `ensemble-threshold-voting` — Bỏ phiếu EMPTY đa-biến-thể + rescue/edge
- **Nhóm**: Occupancy · **Tiên quyết**: C1, C3, C4 · **Liên quan**: C5
- **Code**: `backend/main_detect/src/techgar/parking_detector.py:439-600` `detect` — `empty_votes` `:461,527-528`, `exit_votes` `:529-530`, `required_votes` `:533`, `is_free` `:534-549`, edge recheck `:551-566`, `occupied = not is_free` `:574-581`.
- **Vai trò**: 25 biến thể `gamma×CLAHE` mỗi cái đo `filtered_ratio`; ô chỉ **free khi đa số biến thể đồng ý "trống"** — ngữ nghĩa mặc định là occupied (bảo thủ); core-rescue và edge-recheck lật free→occupied.
- **Input**: `ratios[V]` (filtered_ratio từng biến thể), `evidence` (C3/C4), `edge_ratio`; params `ratio_thr=0.20`, `edge_thr=0.25`, `V` [literal]. **Output**: `is_free:bool → occupied`.
- **Pseudocode**:
  1. Với mỗi biến thể k: `ratio_k = fg(filtered_k)/analysis_area` (`:526`).
  2. `ratio_k < ratio_thr` → **`empty_votes++`** (`:527-528`); `ratio_k < min(ratio_thr, exit_ratio_thr=0.08)` → `exit_votes++` (`:529-530`, dùng cho C5-occupied).
  3. `required = V // 2` (`:533`); **`is_free = empty_votes ≥ required`** (`:539`).
  4. `is_free AND core_rescue(evidence)` → `is_free = False` (`:542-547`).
  5. `is_free AND edge_ratio ≥ edge_thr` → `is_free = False` (edge recheck, `:551-566`).
  6. **`occupied = ¬is_free`** (`:581`).
- **Cấu trúc**: `empty_votes[]`, `exit_votes[]`, `is_free_list[]`, evidence per-slot.
- **Độ phức tạp (code)**: O(V·R + S) — V=25 biến thể × R px ROI (threshold+mask+count), S slot cho vote/rescue/edge. **space** O(S) votes/evidence + O(S·R) `vote_masks` khi `selective_line_filter=False` (True → O(R) buffer tái dùng); **[sim]**: O(V) + O(1) space.
- **Edge cases**: **inverted-by-design**: slot mơ hồ → occupied (empty phải thắng tuyệt đối mới free); `empty=required` vừa ngưỡng → free (`≥` chứ không `>`); vote chỉ trên `filtered_ratio` (analysis), không dùng `raw_ratio` — rescue nhìn `raw`/`core`/`component` (C4), edge nhìn Canny toàn ROI; `selective_line_filter=True` (mặc định) → mỗi biến thể tự lọc (`:522-523`).
- **Failure modes**: `ratio_thr` quá cao → xe tối màu bị free; quá thấp → vệt sáng thành occupied; `edge_thr` thấp → texture gạch vỡ kích edge-recheck; ánh sáng đổi → empty_votes chao → occupied "ảo" (bảo thủ — C5 hysteresis xử lý lắc).
- **Thực tế vs mô phỏng**: giữ **đếm empty_votes + `occupied=¬free` + 2 cứu**. `[sim-omits]`: gamma LUT + CLAHE + adaptiveThreshold + median/dilate (`:472-482,508-513`) — demo nhận `ratios[]` sẵn; `exit_votes` chỉ dùng ở C5-occupied (vẫn tính); Canny edge map — demo nhận `edge_ratio` sẵn; V_demo=9 (policy `V//2` giữ nguyên).
- **Sample A (thường — 4 case cùng V=9, `required=4`, `ratio_thr=0.20`, `edge_thr=0.25`)**:
  ```json
  {"V":9,"ratio_thr":0.20,"edge_thr":0.25,"required":4,
   "cases":[
    {"id":"occupied_majority","ratios":[0.30,0.28,0.31,0.05,0.04,0.29,0.30,0.02,0.25],"core":{"raw_ratio":0.35,"core_ratio":0.05,"comp_ratio":0.0,"count":0},"edge_ratio":0.10},
    {"id":"free_clear","ratios":[0.05,0.28,0.31,0.05,0.04,0.06,0.19,0.10,0.02],"core":{"raw_ratio":0.12,"core_ratio":0.05,"comp_ratio":0.0,"count":0},"edge_ratio":0.10},
    {"id":"free_but_rescue","ratios":[0.05,0.28,0.31,0.05,0.04,0.06,0.19,0.10,0.02],"core":{"raw_ratio":0.35,"core_ratio":0.20,"comp_ratio":0.10,"count":1},"edge_ratio":0.10},
    {"id":"free_but_edge","ratios":[0.05,0.28,0.31,0.05,0.04,0.06,0.19,0.10,0.02],"core":{"raw_ratio":0.12,"core_ratio":0.05,"comp_ratio":0.0,"count":0},"edge_ratio":0.30}
   ]}
  ```
  **Expected** (verify — đếm `ratios < 0.20`):
  - `occupied_majority`: empty = {0.05,0.04,0.02} = **3 < 4** → `is_free=False` → **`occupied`** (không cần xét cứu — cứu chỉ áp khi free).
  - `free_clear`: empty = {0.05,0.05,0.04,0.06,0.19,0.10,0.02} = **7 ≥ 4** → free; `central_blob` fail (core 0.05<0.18), `textured` fail (raw 0.12<0.30); edge 0.10<0.25 → **`free`**.
  - `free_but_rescue`: cùng votes → free ban đầu; `core_rescue` (branch1 `0.20≥0.18 ∧ 0.10≥0.08`) → **`occupied`**.
  - `free_but_edge`: cùng votes → free ban đầu; `edge 0.30 ≥ 0.25` → **`occupied`**.
- **Sample B (biên — ngưỡng vừa đủ + exit_votes)**: `{"ratios":[0.19,0.19,0.19,0.19,0.25,0.25,0.25,0.25,0.07],"ratio_thr":0.20,"exit_thr":0.08,"required":4,"V":9}` → **Expected** (verify): empty = 5 (4×0.19 + 0.07) ≥ 4 → `is_free=True` (không rescue/edge); `exit_votes` = ratios `< min(0.20,0.08)=0.08` → **1** (chỉ 0.07) → `free`, `empty_votes=5`, `exit_votes=1`.
- **Storyboard**: lưới 3×3 thẻ biến thể; mỗi thẻ thanh ratio so vạch `ratio_thr` — ratio **dưới** vạch = phiếu EMPTY (xám), trên = không phiếu; counter lớn `empty_votes ≥ required?` → cổng `is_free` xanh/đỏ; hai "cửa cứu" sau cổng free: core-rescue (tím), edge (vàng) — mở cửa nào cũng lật sang occupied; bảng realtime: `ratio_k | empty? | count | is_free | rescue | edge | occupied`; pseudo-line 1–6. Giải thích VN: "mặc định là có xe — phải đa số đồng ý trống mới dám báo ô trống".
- **Thư viện ngoài**: `cv2.cvtColor/LUT/createCLAHE/adaptiveThreshold/medianBlur/dilate/Canny` [code] — demo nhận `ratios[]`/`edge_ratio` sẵn; giản lược tương đương, không port.

#### C3. `border-line-filter` — Lọc component dạng vạch *trong* analysis
- **Nhóm**: Occupancy · **Tiên quyết**: C1 · **Liên quan**: C2, C4
- **Code**: `backend/main_detect/src/techgar/parking_detector.py:321-416` `_filter_roi_threshold` — `raw_ratio` `:328-329`, `filtered=mask∩analysis_mask` `:331-333`, components `:335`, `touches_boundary` `:338,353`, điều kiện line `:343-367`, selective removal `:368-387`, `filtered_ratio` `:389-415`.
- **Vai trò**: vạch kẻ ô đỗ chạy *vào* vùng analysis tạo component mảnh-dài chạm `analysis_boundary` → xóa để `filtered_ratio` không bị phình bởi tín hiệu "vĩnh viễn".
- **Input**: `roi_threshold` (mask nhị phân), `roi{_PrecomputedROI}`; params `line_min_span_ratio=0.45`, `line_max_thickness_ratio=0.18`, `core_component_threshold=0.08`, `selective_line_filter=True` [literal]. **Output**: `_ROIEvidence{raw_ratio, filtered_ratio, core_ratio, core_component_ratio, core_component_count, filtered_mask, removed_ratio}`.
- **Pseudocode**:
  1. `raw_ratio = count(mask ∩ roi.mask) / roi.area` (`:328-329`) — mẫu số **roi.area**, không phải analysis.
  2. `filtered = mask ∩ analysis_mask` (`:331-333`) — vành `roi−analysis` **không vào filtered từ đầu** (bị mask chặn, không phải bị lọc).
  3. `components = connectedComponents(filtered)` (`:335`); `touches_boundary = component ∩ analysis_boundary ≠ ∅` (`:338,353`).
  4. `span = max(w/analysis_w, h/analysis_h)`; `thickness = (area/max(w,h))/min(analysis_size)` (`:336-352`).
  5. `vehicle_like_core = (component_core_px/core_area ≥ 0.08) ∧ (thickness ≥ 0.18·0.9)` (`:354-361`).
  6. `is_border_line = touches_boundary ∧ span ≥ 0.45 ∧ thickness ≤ 0.18 ∧ ¬vehicle_like_core` (`:362-367`).
  7. `selective_line_filter` → fitLine + chỉ xóa phần mảnh `residual ≤ half_width` (giữ vùng dày xe, `:370-387`); else xóa cả component (`:371`).
  8. `filtered_ratio = count(filtered)/analysis_area`; `core_ratio = count(filtered∩core)/core_area`; `removed_ratio = removed/analysis_area` (`:389-415`).
- **Cấu trúc**: label map + stats per component; `_ROIEvidence` dict.
- **Độ phức tạp (code)**: O(R + C + P_sel) — R px ROI quét, C component kiểm, P_sel px cho `fitLine`+`distanceTransform` khi selective. **space** O(R) label map + O(C) stats; **[sim]**: O(R) raster + O(C) — bỏ P_sel (xóa nguyên component).
- **Edge cases**: component xe thật dài đến vành analysis → `vehicle_like_core` cứu (core đủ + dày) — không bị nuốt; vạch nằm *trọn trong* `roi−analysis` → không vào `filtered` từ đầu — không phải "được lọc", mà **không được đếm**; `selective_line_filter` tách phần mảnh khỏi vùng dày — xe dính vạch chỉ mất đuôi mảnh.
- **Failure modes**: `line_min_span` thấp/`line_max_thickness` cao → ăn mép xe; `border_ignore_ratio` lớn (C1) → vành trong dày → component xe cũng "touches_boundary".
- **Thực tế vs mô phỏng**: giữ raw (mẫu số `roi.area`) vs filtered (`analysis_area`) + tiêu chí span/thickness/core. `[sim-omits]`: selective fitLine/`distanceTransform` half_width — demo xóa cả component (giống nhánh `selective=False`); connectivity 8 vs 4 lưới — khai báo.
- **Sample A (thường — vạch trong analysis bị xóa)**: analysis `{1..6}²=36`, `analysis_boundary` = vành {i hoặc j ∈{1,6}} (20 ô), `core={2..5}²=16`, `roi={0..7}²=64`, `analysis_size=6×6`:
  ```json
  {"analysis_area":36,"roi_area":64,"core_area":16,"analysis_size":[6,6],
   "fg_cells":{"line":[[1,1],[2,1],[3,1],[4,1],[5,1],[6,1]],"blob":[[3,3],[4,3],[3,4],[4,4]]},
   "thresholds":{"span_min":0.45,"thickness_max":0.18,"comp_core_min":0.08}}
  ```
  Line 6 ô nằm trên vành analysis (j=1) → `touches_boundary` ✓; `span = 6/6 = 1.0 ≥0.45` ✓; `thickness = (6/6)/6 = 0.167 ≤0.18` ✓; `comp_core = 0/16 = 0 <0.08` → `¬vehicle_core` → **is_border_line → xóa**. Blob `{3,4}²` nội địa → giữ.
  **Expected** (verify): `filtered trước = 10 → ratio 10/36 ≈ 0.278`; sau xóa line → `filtered = 4 → filtered_ratio = 4/36 ≈ 0.111`; `removed_ratio = 6/36 ≈ 0.167`; **`raw_ratio = 10/64 ≈ 0.156`** (mẫu số roi.area). Vote theo `ratio_thr=0.20`: trước lọc 0.278 → không empty-vote; sau lọc 0.111 <0.20 → **empty-vote** — lọc đúng lật phiếu.
- **Sample B (biên — component ngắn không bị xóa + xe có đuôi)**: line chỉ 2 ô `{(1,1),(2,1)}` → `span = 2/6 = 0.333 < 0.45` → **không phải line → giữ**; cùng blob 4 ô → `filtered = 6 → ratio 0.167 <0.20` → vẫn empty-vote nhưng không nhờ lọc. Đối chứng: xe blob `{3,4}² + đuôi {(5,3),(6,3)}` (6 ô, chạm vành ở (6,3)): `span=4/6=0.667≥0.45`, `thickness=(6/4)/6=0.25>0.18` → không mảnh → giữ — và `comp_core = 5/16 = 0.3125 ≥0.08` → `vehicle_like_core` → bảo vệ kép.
  **Expected** (verify): line ngắn giữ; blob-có-đuôi giữ (vehicle_like_core).
- **Storyboard**: lưới slot 8×8 — `mask` viền xám, `analysis` xanh dương, `analysis_boundary` vành cam 1 ô trong analysis, `core` đỏ tâm; component fg vàng: vạch mảnh trên vành sáng đỏ → bị xóa (nhấp biến mất) với badge điều kiện `span/thickness`; blob lõi giữ xanh lá; hai thanh ratio `raw(/roi)` và `filtered(/analysis)` song song — khác mẫu số nhấn mạnh trực quan; bảng realtime: `component | area | span | thickness | touches | core | verdict`; pseudo-line 1–8. Giải thích VN: "vạch kẻ chỉ bị xóa khi nó *chạy vào* vùng đo và đúng dáng vạch — xe dính vành vẫn được bảo vệ bởi lõi".
- **Thư viện ngoài**: `cv2.connectedComponentsWithStats`, `fitLine`, `distanceTransform` [code] — demo raster + xóa-nguyên-component; giản lược tương đương, không port.

#### C4. `core-rescue-vote` — Cứu "free" khi tín hiệu tụ lõi hoặc dày đặc
- **Nhóm**: Occupancy · **Tiên quyết**: C1, C2, C3 · **Liên quan**: C5
- **Code**: `backend/main_detect/src/techgar/parking_detector.py:418-428` `_has_core_rescue`; gọi tại `:542-547`.
- **Vai trò**: khi `is_free` theo vote, evidence base có thể chứng minh xe thật → lật về occupied. Hai nhánh: blob lõi mạnh (`central_blob`) hoặc tín hiệu toàn-ROI dày nhiều cụm (`textured_dense_blob`).
- **Input**: `evidence{raw_ratio, core_ratio, core_component_ratio, core_component_count}` (từ `_ROIEvidence` của biến thể **base**); params `core_ratio_threshold=0.18`, `core_component_threshold=0.08`, `core_rescue_raw_ratio=0.30` [literal]. **Output**: `rescue:bool` (lật `is_free` → occupied).
- **Pseudocode**:
  1. `central_blob = core_ratio ≥ 0.18 ∧ core_component_ratio ≥ 0.08` (`:419-422`).
  2. `textured_dense_blob = raw_ratio ≥ 0.30 ∧ core_ratio ≥ 0.02 ∧ core_component_count ≥ 2` (`:423-427`) — **3 điều kiện, gồm count ≥ 2**.
  3. `rescue = central_blob ∨ textured_dense_blob` (`:428`); `is_free ∧ rescue → occupied` (`:544-547`).
- **Cấu trúc**: `_ROIEvidence` fields; chỉ evidence của biến thể **base** quyết định rescue (`:488,541-547`).
- **Độ phức tạp**: O(1) (≤7 phép so sánh trên 4 field). **space** O(1); **[sim]**: O(1).
- **Edge cases**: branch2 cần `count ≥ 2` — **một** cụm dày đơn lẻ không đủ (`textured` = nhiều cụm chất lượng); `core_component_count` chỉ đếm component `≥ max(3, core_area·0.005)` px (`:405-406`) — bụi nhỏ không tính; rescue chỉ lật khi ô **đang free** — ô đã occupied giữ nguyên; `raw_ratio` (toàn ROI) mạnh nhưng lõi rỗng → branch2 fail ở `core ≥0.02`.
- **Failure modes**: rescue lỏng → biển số phản quang/vệt sáng ở lõi → occupied ảo; `count≥2` chặt → xe mini một cụm mất cứu.
- **Thực tế vs mô phỏng**: giữ đủ 2 nhánh + count-gate. `[sim-omits]`: component_shape/size-detail trong stats, `minimum_component_area` — demo nhận metrics sẵn.
- **Sample A (thường — central_blob)**:
  ```json
  {"core_ratio":0.20,"core_component_ratio":0.10,"raw_ratio":0.15,"core_component_count":1}
  ```
  **Expected** (verify): `central_blob` (0.20≥0.18 ∧ 0.10≥0.08) → **`rescue=true`** (textured không cần — raw 0.15 <0.30).
- **Sample B (biên — count gate quyết định)**: hai case cùng `raw=0.35, core_ratio=0.03`:
  ```json
  [{"id":"count1","core_component_count":1},{"id":"count2","core_component_count":2}]
  ```
  **Expected** (verify): `central_blob`: core 0.03<0.18 → fail cả hai; `textured`: raw 0.35≥0.30 ∧ core 0.03≥0.02 → phụ thuộc count: `count1` (1<2) → **`rescue=false`**; `count2` (2≥2) → **`rescue=true`** — chính count-gate làm khác.
- **Storyboard**: slot lưới + hai "cánh cửa" điều kiện (central_blob xanh lá, textured tím) vẽ 3 bậc ngưỡng; đèn count≥2 riêng; cửa mở → đường đứt tới ô `is_free` lật occupied; bảng realtime: `raw | core | comp_ratio | count | nhánh1 | nhánh2 | rescue`; pseudo-line 1–3. Giải thích VN: "đa số nói trống nhưng lõi/cụm chất lượng phản bội — chỉ cứu khi đủ bằng chứng lõi, không cứu vì ồn ào toàn vùng".
- **Thư viện ngoài**: không trực tiếp (`numpy` đếm component) [code].

#### C5. `temporal-smoothing-dwell` — Hai cơ chế: streak đối xứng vs timestamp dwell
- **Nhóm**: Occupancy · **Tiên quyết**: C2 · **Liên quan**: F8 (stale-evidence, timestamp-monotonic)
- **Code**: `backend/main_detect/src/techgar/parking_detector.py:63-80` `TemporalSmoother` (dùng trong `detect` khi `apply_smoothing`, `:575-576`); `:602-645` `accept_evidence` (chỉ khi `stable_evidence=True`); params `smoothing_frames=5`, `occupied_seconds=0.5`, `empty_seconds=1.0` [literal `:105,115-116`].
- **Vai trò**: hai lớp chống lắc **khác nhau** — (a) streak frame đối xứng trong detect; (b) commit evidence theo clock nguồn: dwell `count ∧ duration` bất đối xứng + gap-reset + timestamp-monotonic guard + desired-logic theo chiều. Không được trộn thành `ceil(dwell/interval)`. **Không có biến seq** — guard chỉ so timestamp nguồn qua `_accepted_timestamp`.
- **Input**: (a) chuỗi `vote` per frame; (b) chuỗi `(timestamp_s, desired)` + `evidence`. **Output**: (a) `confirmed` bool/slot; (b) `stable_occupied` + `ready` + commit `True/False`.
- **Pseudocode (a) `TemporalSmoother.update` (`:72-80`)**:
  1. `pending == vote` → `counter++`; else `pending = vote`, `counter = 1`.
  2. `counter ≥ required_frames(5)` → `confirmed = vote`.
  3. `occupied_out = confirmed` (đối xứng cả hai chiều — **không** hysteresis).
- **Pseudocode (b) `accept_evidence` (`:609-644`)**:
  1. `now ≤ _accepted_timestamp` (hoặc !finite) → **reject toàn batch** (`:610-611`) — timestamp-monotonic guard (không có biến seq — chỉ so timestamp nguồn).
  2. `gap = now − last`; `gap > 1.5 s` → `pending=None, count=0, since=now` (`:612,624-625`).
  3. `desired`: đang occupied → `¬(exit_empty_votes ≥ required ∧ ¬rescue)` (`:626-628`); đang free → `instant_occupied` (`:630`).
  4. `desired == state` → reset pending/count (`:631-632`). Else: `pending != desired` → `pending=desired, count=0, since=now`; `count++` (`:634-636`).
  5. `count ≥ (2 nếu desired=occupied / 3 nếu free)` **∧** `elapsed ≥ (0.5 s / 1.0 s)` → `occupied = desired`, `initialized=True` (`:637-640`).
  6. Chưa `initialized` → `result.occupied = True` placeholder + `ready=False` (`:641-643`).
- **Cấu trúc**: (a) 3 mảng `pending/counters/confirmed`; (b) `_stable_slots{slot → {occupied,pending,since,count,initialized}}`, `_accepted_timestamp`.
- **Độ phức tạp**: O(S) mỗi call; (b) O(S·evidence). **space** O(S); **[sim]**: O(S).
- **Edge cases**: (b) cần **CẢ count LẪN duration** — poll nhanh (interval < duration) vẫn phải chờ đủ giây; poll chậm đủ giây nhưng count thiếu cũng không lật; `gap > 1.5 s` → pending reset — burst chậm không cộng dồn; timestamp đi lùi/trùng → batch reject — evidence cũ không đè state; (a) `required_frames` **giống nhau cả hai chiều** — không phải hysteresis; hysteresis thật nằm ở (b): 2 count/0.5 s vào vs 3 count/1.0 s ra; khởi động `occupied=True` placeholder tới `initialized` — ô "unknown" bị coi như không trống (binder chờ `ready`).
- **Failure modes**: `stable_evidence=False` (mặc định) → chỉ (a) chạy — hành vi hệ thống thật phụ thuộc config; `smoothing_frames` cao → trễ nhận xe; timestamp giật → gap-reset vô tình xóa pending.
- **Thực tế vs mô phỏng**: giữ **hai cơ chế tách biệt**. `[sim-omits]`: `desired` mapping từ `exit_empty_votes`/`instant_occupied` (demo nhận `desired` sẵn — vote→desired là C2); `result.occupied` placeholder khi chưa ready; `frame_idx` bookkeeping.
- **Sample A (thường — count ∧ duration, clock đúng)** (`desired` nhận sẵn, `occupied_seconds=0.5`, `empty_seconds=1.0`, `count_need=2/3`, `gap_max=1.5`):
  ```json
  {"t":[0,0.4,0.8,1.2,1.6,2.0,2.4],"desired":[1,1,1,0,0,0,0],"init_state":"free","initialized":true}
  ```
  **Expected** (verify — mô phỏng đúng pseudocode b):
  - `t=0` (gap ∞ >1.5 → reset trước): pending=1, count=1, since=0.
  - `t=0.4`: count=2 ∧ elapsed 0.4 **< 0.5** → **chưa lật** (duration chưa đủ dù count đủ).
  - `t=0.8`: count=3 ∧ elapsed 0.8 ≥0.5 → **`free→occupied` tại t=0.8**.
  - `t=1.2`: desired=0 → pending=0, count=1, since=1.2.
  - `t=1.6`: count=2; `t=2.0`: count=3 ∧ elapsed 0.8 **< 1.0** → **chưa lật**.
  - `t=2.4`: count=4 ∧ elapsed 1.2 ≥1.0 → **`occupied→free` tại t=2.4**.
  - Chuỗi lật: **`[(0.8,'occupied'),(2.4,'free')]`** — count-only model sẽ lật sớm hơn (0.4 và 2.0); duration-gate trì hoãn đúng.
- **Sample B (biên — gap reset + stale reject)**:
  ```json
  {"t":[0,2.0,2.4,3.0],"desired":[1,1,1,1],"init_state":"free","gap_max":1.5}
  ```
  **Expected** (verify): `t=0` count=1; `t=2.0` **gap=2.0 >1.5** → pending/count reset → pending=1,count=1,since=2.0; `t=2.4` count=2 ∧ elapsed 0.4 <0.5 → chưa; `t=3.0` count=3 ∧ elapsed 1.0 ≥0.5 → **`occupied` tại t=3.0`** — gap đã "ăn" mẫu đầu tiên.
  **Sample C (stale timestamp — monotonic reject)**: `{"t":[0,0.4,0.2],"desired":[1,1,1]}` → `t=0.2 ≤ last(0.4)` → `accept_evidence` trả **False** — toàn batch bỏ qua, count giữ ở `t=0.4` (`count=2`, chưa lật vì elapsed 0.4<0.5) → **`free`**.
- **Storyboard**: hai lane riêng nhãn rõ — lane trên `TemporalSmoother` (chuỗi vote nhị phân, counter đồng nhất 2 chiều); lane dưới `accept_evidence` (timeline timestamp thật): mỗi mẫu là vé có `count` và `elapsed` đo kép — thanh nạp count (số) + thanh giờ (giây) phải đầy **cả hai** mới lật; gap>1.5 s vẽ vết đứt đỏ reset; mẫu stale gạch xám "rejected"; hai vạch `0.5 s/2 count` và `1.0 s/3 count` nhìn thấy hysteresis; bảng realtime: `t | desired | pending | count | elapsed | need | state`; pseudo-line theo cơ chế đang chọn (a/b). Giải thích VN: "vào nhanh ra chậm — nhưng phải đủ SỐ MẪU *và* đủ GIÂY; streak đơn giản của smoother không phải dwell thật".
- **Thư viện ngoài**: không trực tiếp (`numpy` cho `isfinite`) [code].

### Nhóm D — SlotVehicleBinder (D1–D11)

#### D1. `slot-overlap-geometry` — Đo chồng lấp xe↔ô đỗ
- **Nhóm**: Binder · **Tiên quyết**: B9, C1 · **Liên quan**: D2, D3, D5
- **Code**: `backend/main_detect/src/techgar/slot_vehicle_binder.py:712-745` `_overlap_geometry`; `:592-601` `_raw_vehicle_overlap`; `:582-589` `_signed_polygon_distance`; `:577-579` `_slot_diagonal`; `:666-673` `_point_in_polygon`; ngưỡng `min_vehicle_overlap=0.35`, `strong_vehicle_overlap=0.60` `:217-218`.
- **Vai trò**: định lượng "xe đứng trong ô bao nhiêu" — output **4 key** `{vehicle_overlap, slot_overlap, center_proximity, score}` hoặc `None` khi không qualify — nguồn số cho D2/D3/D5.
- **Input**: `bbox` xywh `[x,y,w,h]`, `binding{polygon, center}`; raster lưới-điểm-bao-biên (demo) / `cv2.intersectConvexConvex` (code). **Output**: `{vehicle_overlap, slot_overlap, center_proximity, score}` | `None`.
- **Pseudocode**:
  1. `inter = |cells(bbox) ∩ cells(poly)|` (code: `intersectConvexConvex` diện tích) `:715-726`.
  2. `vehicle_overlap = inter/area(bbox)`; `slot_overlap = inter/area(poly)` `:725-726`.
  3. `center_inside = (x+w/2, y+h/2) ∈ poly` `:727-728`.
  4. **`qualifies = (center_inside && vo ≥ min_vehicle_overlap) || vo ≥ strong_vehicle_overlap`; không → `None`** `:729-733` — xe ngoài hẳn nhưng `vo≥0.60` vẫn qualify.
  5. `center_proximity = max(0, 1 − dist(center, binding.center)/slot_diagonal)` `:735-738` — liên tục, không binary.
  6. **`score = min(1, 0.70·vo + 0.20·so + 0.10·proximity)`** `:739-744` — weights literal `[0.70,0.20,0.10]`.
- **Cấu trúc**: metrics dict; polygon `np.ndarray`; `binding.center` cache.
- **Độ phức tạp (code)**: O(P) polygon ops (`intersectConvexConvex`, `pointPolygonTest`, `boundingRect`). **space** O(1) ngoài polygon; **[sim]**: O(cells) raster.
- **Edge cases**: `vo ≥ 0.60` với center ngoài → vẫn qualify (nhánh strong) — center không bắt buộc khi chồng đủ mạnh; `polygon=None` → `None` `:713-714`; `inter=0` → `vo=0<0.35` → `None`.
- **Failure modes**: raster convention lệch → ratio sai nhỏ; `intersectConvexConvex` chỉ convex — polygon lõm phải xấp xỉ; `center_proximity` phụ thuộc `binding.center` cache.
- **Thực tế vs mô phỏng**: giữ 2 ratio + qualify-gate + proximity liên tục + score-3-term. `[sim-omits]`: `signed_polygon_distance` (dùng ở D7/D8/D9 chứ không trong dict này), `cv2.error` fallback `inter=0` — demo raster∩ lưới.
- **Sample A (thường — đỗ trọn)**: `{"bbox":[2,2,4,4],"slot_poly":[[0,0],[8,0],[8,8],[0,8]],"slot_center":[4,4],"vo_min":0.35,"vo_strong":0.60}` → bbox cells {2..6}²=25, `inter=25`, `vo=1.0`, `so=25/81≈0.309`, `inside=true`, `diag=√128≈11.31`, `prox=1−0/11.31=1.0` → **Expected** (verify): `qualify` (inside && vo≥0.35); **`score = min(1, 0.7+0.0617+0.1) = 0.862`** → output `{vehicle_overlap:1.0, slot_overlap:0.309, center_proximity:1.0, score:0.862}` (không có `dist`/`center_inside` trong dict).
- **Sample B (biên — ngoài hầu hết)**: `{"bbox":[7,7,4,4],"slot_poly":[[0,0],[8,0],[8,8],[0,8]],"slot_center":[4,4],"vo_min":0.35,"vo_strong":0.60}` → bbox cells {7..11}², `inter={7,8}²=4`, `vehicle_overlap=4/25=0.16 < 0.35` và `0.16 < 0.60`, `center (9,9)` ngoài → **Expected** (verify): **`None`** — xe lấn mép không được tính đỗ.
- **Storyboard**: ô đỗ xanh dương + bbox xe đỏ; vùng giao tô vàng; bốn thanh `vo/so/prox/score` cập nhật khi kéo bbox; đèn `qualifies` sáng qua một trong 2 nhánh; bảng realtime: `inter | vo | so | inside | prox | score | verdict`; pseudo-line 1–6. Giải thích VN: "vo đo xe nằm trong ô, so đo xe chiếm ô, prox đo tâm gần tâm ô — score trộn 3 thứ tỉ lệ 7:2:1; chạm mép nhẹ ra ngoài vẫn được nếu chồng mạnh".
- **Thư viện ngoài**: `cv2.pointPolygonTest`, `intersectConvexConvex` [code] — demo raster∩.

#### D2. `slot-track-batch-match` — Gán track↔slot hàng loạt
- **Nhóm**: Binder · **Tiên quyết**: D1 · **Liên quan**: B6, D6
- **Code**: `backend/main_detect/src/techgar/slot_vehicle_binder.py:1285-1314` `_batch_match` (build cost từ geometry + incumbent bonus, gọi `lapjv` với `extend_cost`).
- **Vai trò**: chọn cặp (active track ↔ slot) tối ưu toàn cục mỗi vòng; track hiện đang sở hữu slot được **incumbent bonus** trừ vào cost (ổn định chống nhảy).
- **Input**: geometry per cặp (D1), `incumbent` map, `bonus`, `cost_limit`. **Output**: `{track_id → (slot_id, geo)}`.
- **Pseudocode**:
  1. `score = w·overlap_terms` (D1); `cost = 1 − score`; nếu track đang bind slot này → `cost −= bonus`.
  2. Cặp không đủ geometry → `cost = 10`.
  3. `lapjv(costs, extend_cost=True, cost_limit)` → assignments.
- **Cấu trúc**: ma trận T×S; `SlotBinding`.
- **Độ phức tạp (code)**: LAPJV O(n³) + build O(T·S). **space** O(T·S) ma trận; **[sim]**: exhaustive O(n!) n≤5.
- **Edge cases**: hai track tranh 1 slot → bonus có thể lật kết quả về incumbent; `cost_limit` thấp → nhiều track unassigned (slot trống dù có xe — cần D3 arrival claim).
- **Failure modes**: bonus lớn → xe khác vào đúng ô không thắng nổi incumbent ảo; bonus 0 → chủ ô đổi liên tục khi nhiễu.
- **Thực tế vs mô phỏng**: giữ incumbent bonus + solver exact. `[sim-omits]`: cost còn term khoảng cách tâm/size — demo chỉ overlap + bonus.
- **Sample A (thường — incumbent giữ ô)**: `{"v0_in_s0":true,"geo":{"v0s0":0.72,"v0s1":0.75,"v1s0":0.15,"v1s1":0},"bonus":0.15,"limit":0.95}` → costs `[[0.28−0.15=0.13, 0.25],[0.85, 10]]`. **Expected** (verify): phương án `v0→s0 + v1 unassigned` = `0.13+0.95=1.08` < `v0→s1 + v1→s0` = `0.25+0.85=1.10` → **v0 giữ s0, v1 không gán** — bonus +0.15 vừa đủ cứu incumbent.
- **Sample B (biên — challenger áp đảo)**: `{"geo":{"v0s0":0.72,"v1s0":0.95}}` → costs `[[0.13,10],[0.05,10]]` → `v0s0+v1none=1.08` vs `v0none+v1s0=0.95+0.05=1.0` → **v1 thắng** — challenger đủ mạnh vẫn chiếm ô.
- **Storyboard**: ma trận track×slot, ô incumbent viền sao (−bonus); solver exact chạy; số `1.08 vs 1.10` sát nhau minh họa bonus quyết định; bảng realtime: `score | bonus | cost | assign`; pseudo-line 1–3. Giải thích VN: "chủ cũ được cộng điểm ưu tiên — đủ để thắng kèo ngang, không đủ thắng kèo lệch".
- **Thư viện ngoài**: `lap.lapjv` [code] — demo solver exact.

#### D3. `arrival-claim-qualification` — Đủ điều kiện nhận xe vào ô
- **Nhóm**: Binder · **Tiên quyết**: D1, C2, D4 · **Liên quan**: D5, D6, D11
- **Code**: `backend/main_detect/src/techgar/slot_vehicle_binder.py:1080-1165` `_record_arrival_claim` (score `:1160-1164`); `:758-777` `_qualified_arrival`; `:1167-1283` `_try_commit_arrival_claim`; `:1026-1079` `_disprove_arrival_claims`; defaults `arrival_min_samples=3`, `arrival_vision_confirmations=2`, `arrival_competitor_margin=0.15`, `arrival_lost_commit_delay_seconds=0.35`, `arrival_lookback_seconds=1.5` `:241-247`.
- **Vai trò**: occupied do vision báo nhưng chưa có owner → mở **arrival claim**: track chứng minh "đi vào ô" (đủ observation, overlap đạt ngưỡng, tiến vào trong, không bị tranh/mâu thuẫn) trước khi `_try_commit` bind — chống bind xe đi ngang.
- **Input**: `claim{observations, first/last_center, first/max_overlap, entered_from_outside, score, lost_at_s}` + `binding`. **Output**: `qualified → bind | disproved | expired | rejected`.
- **Pseudocode**:
  1. Claim mở khi `vision occupied && vehicle_id=None`; `reset` nếu `now − last_seen > 1.5s` `:1100-1103`; `entered_from_outside = prev.slot_id ≠ slot || prev.overlap < 0.35` `:1104-1107`.
  2. `_qualified_arrival`: `disproof==0 && obs ≥ 3 && max_overlap ≥ 0.35 && inward && !competing` `:758-777`; `inward = entered || (max−first ≥ 0.10) || (first_dist − last_dist ≥ max(2, 0.05·diag))` `:764-770`; `competing = ∃claim' cùng slot, gid khác, obs≥3, score' ≥ score−0.15` `:771-776`.
  3. `score = 0.55·min(1,maxO) + 0.20·min(1,obs/3) + 0.15·min(1,inward_prog/0.10) + 0.10·min(1,ovl_prog/0.15)` `:1160-1164` (`inward_prog = max(0,first_d−cur_d)/diag`; `ovl_prog = max(0,max−first)`).
  4. **Commit gates** `_try_commit`: `binding.vision_occupied && vision_streak ≥ 2 && vehicle_id=None` `:1176-1182`; claim `lost_at_s` đã set **và** `now − lost_at_s ≥ 0.35s` **và** obs≥3 **và** maxO≥0.35 `:1184-1193`; ranked theo score; `winner.score − runner.score < 0.15 → reject competing_vehicle` `:1196-1206`; re-check `demonstrated_entry` `:1207-1222`; **newer-motion disproof** (obs fresh sau lost_at, overlap ô khác ≥0.35 → `newer_motion_disproves_arrival`) `:1223-1254`; sau đó `_bind_vehicle` `:1263-1269`.
- **Cấu trúc**: `ArrivalClaim` (:55-89); `_arrival_claims[(slot,gid)]`.
- **Độ phức tạp**: O(obs + claims). **space** O(claims); **[sim]**: O(n).
- **Edge cases**: xe vào rồi đỗ ngay — `entered_from_outside` là bằng chứng phụ khi `gain`/`dist` nhỏ; claim TTL/lookback hết → expire; hai claim tranh → `competing_vehicle` (không chọn đại); claim `lost_at_s=None` (track còn sống) → commit chờ — **bind chỉ sau khi track mất + delay** `:1188-1190`.
- **Failure modes**: `obs_min` cao + fps thấp → không đủ obs → occupied không owner; `streak≥2` của vision chậm → commit trễ; `newer-motion` phủ định commit trễ (stale vision).
- **Thực tế vs mô phỏng**: giữ obs/maxO/inward-3-nhánh + score-4-term + commit gates. `[sim-omits]`: `_link_arrival_job`/`_vision_job` lifecycle, `awaiting_vision`/processing deadlines, `_disprove` outside-ROI observations, `processing_grace` — demo bỏ qua lớp job.
- **Sample A (thường — đi vào ô)**:
  ```json
  {"obs":[{"o":0.30,"c":[1,5]},{"o":0.34,"c":[3,5]},{"o":0.38,"c":[5,5]}],"slot_c":[5,5],"slot_diag":11.31,"obs_min":3,"ovl_min":0.35,"lost_at_s":9.0,"now_s":9.5,"vision_streak":2}
  ```
  **Expected** (verify): `obs=3`, `maxO=0.38≥0.35`; `gain=0.08<0.10` nhưng `dist_gain = 4−0 = 4 ≥ max(2,0.566)` → `inward=true` → `qualified`; score `0.55·0.38+0.20·1.0+0.15·min(1,0.354/0.10→1.0)+0.10·min(1,0.08/0.15) = 0.6123`; commit: streak 2≥2, `9.5−9.0=0.5 ≥ 0.35` → **bind**.
- **Sample B (biên — tranh chấp sít / xe lướt)**:
  ```json
  {"rival_case":{"obs":[{"o":0.36,"c":[9,5]},{"o":0.36,"c":[9.5,5]},{"o":0.35,"c":[10,5]}],"slot_c":[5,5],"slot_diag":11.31},
   "margin_case":{"winner_score":0.6123,"runner_score":0.55,"margin":0.15}}
  ```
  **Expected** (verify): rival `dist_gain = 4−5 = −1 < 2`, `gain=−0.01` → `inward=false` → **không qualified**; margin `0.6123−0.55=0.0623 < 0.15` → **`competing_vehicle` reject** — hệ thống không chọn bừa khi hai claim ngang nhau.
- **Storyboard**: ô đỗ + quỹ đạo 3 điểm; thanh overlap tăng dần; mũi tên "vào/qua ngang"; đồng hồ `lost_at_s` + delay 0.35s đếm; hai claim-card so score, thanh margin 0.15; bảng realtime: `obs | maxO | gain | dist_gain | score | lost_wait | margin | verdict`; pseudo-line 1–4. Giải thích VN: "overlap cao chưa đủ — phải chứng minh xe đang đi VÀO, đợi vision xác nhận đủ 2 nhịp và không có đối thủ ngang điểm".
- **Thư viện ngoài**: `numpy` [code].

#### D4. `vision-primary-fusion` — Vision là nguồn sự thật của occupied
- **Nhóm**: Binder · **Tiên quyết**: C5 · **Liên quan**: D3, D6, D7, D11
- **Code**: `backend/main_detect/src/techgar/slot_vehicle_binder.py:2501-2569` (`update_vision` nhánh `vision_primary`); `_detach_binding_for_departure` `:1533-1565` (`binding.vehicle_id = None` `:1548`); `_restore_false_empty_token` `:1566-1635`; legacy sticky-clear `:2595-2604`.
- **Vai trò**: quyết định `occupied` của slot là vote vision (C); tracking/binding chỉ cung cấp identity — tách "có xe không" khỏi "là xe nào". **Policy `vision_primary`: vision-empty đầu tiên đã gỡ owner ngay** — không "giữ nội bộ"; danh tính sống trong departure token (D7).
- **Input**: `vision[occupied, ratio]` per slot; `binding`; `token`. **Output**: `public state {occupied, vehicle_id}` + token/detach/restore/commit.
- **Pseudocode** (vision_primary):
  1. `!vision_occupied` && (owner≠None || token tồn tại) → `_create_departure_token(confirmed_empty=True, reason="vision_became_empty"|"vision_empty_confirmation")` + **`_detach_binding_for_departure` — `vehicle_id=None` ngay** `:2507-2526`, `:1548`.
  2. `vision_occupied` && token → `empty_observations>0 || !predeparture` → `_restore_false_empty_token` (occupied đầu tiên sau empty được coi là flicker) `:2546-2557`; predeparture `empty_obs=0` → giữ nguyên (xe còn đậy ô): `:1566-1573`.
  3. `vision_occupied && vehicle_id=None` → `_try_commit_arrival_claim` (D3) `:2559-2564`.
  4. `_sync_result` — public `occupied = vision` luôn `:2566-2568`.
- **Cấu trúc**: `SlotBinding{vehicle_id, tracking_state, vision_occupied}`; `DepartureToken{confirmed_empty, empty_observations, predeparture}`.
- **Độ phức tạp**: O(S) mỗi vision tick. **space** O(S); **[sim]**: O(S).
- **Edge cases**: track chết nhưng xe còn đỗ → `occupied` vẫn đúng (vision); vision flick 1 tick → detach ngay nhưng occupied-quay-lại → restore (đúng là "chống flick" nhưng bằng rollback token); `!occupied` và không owner/token → không làm gì; **legacy policy** (`policy="legacy"`): nhánh khác hẳn — sticky-clear chỉ khi `!vision && !tracking` `:2595-2604`, giữ `vehicle_id` treo lâu hơn.
- **Failure modes**: 100% phụ thuộc chất lượng vision — C2 sai thì occupied sai; vision trễ ~2Hz → detach/commit trễ theo; detach-ngay + vision flick nhịp dài (occupied quay lại sau consume) → chủ cũ mất ID thật.
- **Thực tế vs mô phỏng**: giữ 4 nhánh + detach-ngay + restore-precondition. `[sim-omits]`: `_pending_release`, `vehicle_to_slot` map, `vision_evidence_frame_idx` audit, `_vehicle_states` updates (`movement_state=exit_pending`, cooldown `+predeparture_guard_seconds`) — demo giữ quyết định state.
- **Sample A**: `{"slot":"s1","vision":1,"owner":null}` → **Expected**: `public.occupied=true`, `vehicle_id=null`, `arrival_claim=open` (đường D3).
- **Sample B (biên — vision mất nhưng owner còn)**: `{"vision":0,"owner":"v7","token":null}` → **Expected** (verify): `public.occupied=false` (vision thắng) + `departure_token(confirmed_empty)` + **`vehicle_id=None` + `tracking_state="recovery_pending"`** — KHÔNG "binding giữ v7": danh tính đã chuyển vào token; xe thật còn đỗ sẽ được D9/D10 cứu ID nếu fragment xuất hiện.
- **Storyboard**: hai cột "vision nói" vs "track nói" vào ô public; toggle vision 1→0: ô chuyển empty, thẻ `vehicle_id` biến mất khỏi binding và hiện trong token-card; nút "occupied quay lại" → token rút về binding (restore); bảng realtime: `vision | owner | public.occ | vid | token | tracking_state`; pseudo-line 1–4. Giải thích VN: "vision hạ quyết occupied ngay — identity không bám theo ô mà bám theo token, nên empty đầu đã gỡ chủ".
- **Thư viện ngoài**: không trực tiếp.

#### D5. `stop-dwell-detection` — Xác nhận xe đã dừng hẳn trong ô
- **Nhóm**: Binder · **Tiên quyết**: D1, D3 · **Liên quan**: D6, D11
- **Code**: `backend/main_detect/src/techgar/slot_vehicle_binder.py:1316-1355` `_is_stopped`; `:1357-1407` `_advance_strong_overlap` (+`duration ≥ stop_s + stop_commit_grace`); `:1408-1447` `_strong_overlap_is_stable`; `:1365-1369` `_strong_overlap_max_gap_seconds` (derived).
- **Vai trò**: phân biệt "đang đỗ" với "đang lướt qua/đang dò ô" — **hai đường đánh giá khác nhau**: (a) `_is_stopped` dùng `r95` + `net_displacement` trên chuỗi fresh-suffix; (b) `_strong_overlap_is_stable` dùng `inlier_ratio ≥ 0.60` + drift giữa **median 2 cụm endpoints** — đường (b) cố ý chịu được outlier thưa.
- **Input**: `observations: [(t_s, center, bbox, slot_id, overlap, fresh)]`, `slot_id`, `now_s`; `stop_s`, `min_stop_samples`, `stationary_radius_ratio`, `stationary_drift_ratio` [~config]. **Output**: `(stopped: bool, stopped_ms: int)` — `stopped_ms = int(duration·1000)` (span mẫu, không phải `now−first_stable`).
- **Pseudocode**:
  1. `_is_stopped`: lọc mẫu trong `stop_s` (+ fresh khi `vision_primary`), cắt **fresh-suffix** tại gap `> max_gap_s` (`max_gap_s = max(0.25, 2·stop_s/max(min_stop_samples,2))` — derived); `n ≥ min_stop_samples`; `duration ≥ stop_s·0.90`; `same_slot_ratio ≥ 0.80`; `r95 = percentile95(‖p−median‖) ≤ max(3.0, r_ratio·diag)` và `net_disp = ‖last−first‖ ≤ max(5.0, d_ratio·diag)` với `diag = median bbox_diagonal`.
  2. `_strong_overlap_is_stable`: mẫu fresh từ `strong_overlap_since` cùng slot `overlap ≥ strong_vehicle_overlap`; `n ≥ min_samples`; `inlier_ratio = mean(‖p−median‖ ≤ max(3.0, r_ratio·diag)) ≥ 0.60`; `k = max(2, min(n//3, 5))`; `robust_drift = ‖median(last k) − median(first k)‖ ≤ max(5.0, d_ratio·diag)`.
- **Cấu trúc**: `VehicleParkingState.observations` deque (:35-53); `strong_overlap_since`; `SlotBinding`.
- **Độ phức tạp**: O(n) n = số mẫu trong cửa sổ (bounded). **space** O(n) mẫu cửa sổ; **[sim]**: O(n).
- **Edge cases**: mẫu bị gap (vision trễ) → fresh-suffix cắt → duration tính lại từ đầu — trễ bind; 1 outlier/6 mẫu: `_is_stopped` fail (r95 phồng) nhưng strong path **vẫn pass** (`inlier 5/6 ≈ 0.83 ≥ 0.60`) — hai đường khắc vị khác nhau; mẫu lạc slot → `same_slot_ratio < 0.80` fail.
- **Failure modes**: `ratio·diag` làm ngưỡng phụ thuộc kích thước bbox — xe nhỏ/ngưỡng sàn 3.0px chặt hơn xe lớn; `stop_s` dài → xe vào-đỗ nhanh chưa kịp `0.90·stop_s`; gap gate rộng → nối nhầm 2 lần đỗ.
- **Thực tế vs mô phỏng**: giữ 2 đường + fresh-suffix + duration/same_slot gate. `[sim-omits]`: `stop_commit_grace` cho strong path, `_reset_strong_overlap` khi slot đổi — demo tính trên tập mẫu đồng bộ; ngưỡng trong sample là **demo-fixed** (`r95_max=1.0`, `drift_max=0.5`), production dùng `max(floor, ratio·diag)` — ghi `[sim]` rõ.
- **Sample A (thường — đứng yên, đường `_is_stopped`)**: 
  ```json
  {"slot":"s1","samples":[[0.0,[5.0,5.0]],[0.5,[5.2,5.0]],[1.0,[5.0,5.2]],[1.5,[5.1,5.1]],[2.0,[4.9,5.0]],[2.5,[5.0,4.9]]],"min_samples":6,"stop_s":2.5,"r95_max":1.0,"drift_max":0.5,"same_slot":true}
  ```
  **Expected** (verify): `n=6`, `duration=2.5 ≥ 0.90·2.5`; median=(5,5); `r95 = 0.20` (radii sorted `[0,0.1,0.1,0.141,0.2,0.2]`, p95 index 4.75); `net_disp=0.10` → **`stopped=true`, `stopped_ms=2500`**.
- **Sample B (biên — một outlier, hai đường khác verdict)**:
  ```json
  {"slot":"s1","samples":[[0.0,[5.0,5.0]],[0.5,[5.2,5.0]],[1.0,[5.0,5.2]],[1.5,[9.0,9.0]],[2.0,[4.9,5.0]],[2.5,[5.0,4.9]]],"min_samples":6,"stop_s":2.5,"r95_max":1.0,"drift_max":0.5,"stat_radius":3.0}
  ```
  **Expected** (verify): `_is_stopped`: `r95 ≈ 4.29 > 1.0` → **`stopped=false`**; `_strong_overlap_is_stable` (cùng mẫu, radius demo 3.0): `inlier_ratio = 5/6 ≈ 0.83 ≥ 0.60`, `k=2`, `robust_drift = ‖median(last2)−median(first2)‖ = ‖(4.95,4.95)−(5.1,5.0)‖ ≈ 0.16 ≤ drift` → **vẫn stable** — một outlier phá đường r95 nhưng không phá đường inlier.
- **Storyboard**: trail 6 chấm trong ô, hai đường tròn: `r95` (đỏ) và `stat_radius` quanh median (xanh); kéo 1 chấm ra xa → vòng r95 phồng → verdict đường (a) lật FAIL, còn `inlier_ratio` đường (b) vẫn ≥0.60 → PASS — hai cột verdict khác nhau trên cùng dữ liệu; bảng realtime: `n | duration | r95 | inlier | drift | verdict_a/b`; pseudo-line 1–2. Giải thích VN: "đỗ = đứng yên trong vùng — đường r95 khắt khe với mọi mẫu, đường strong-overlap cố ý bỏ qua outlier thưa vì detector hay giật".
- **Thư viện ngoài**: `numpy` percentile [code].

#### D6. `sticky-id-bind-release` — Giữ ID chủ ô + giải phóng
- **Nhóm**: Binder · **Tiên quyết**: D3, D5 · **Liên quan**: D2, D7, D11
- **Code**: `backend/main_detect/src/techgar/slot_vehicle_binder.py:1919-1981` `_bind_vehicle`; `:1982-2046` `_release_vehicle`; `:2501-2557` vision-empty→token+detach; `:2595-2604` sticky-clear legacy; `:1566-1634` `_restore_false_empty_token`.
- **Vai trò**: khi slot đã có `vehicle_id`, challenger bị từ chối (`sticky_id_conflict`) — ID ổn định không nhảy theo nhiễu. **Không có bộ đếm empty-streak gate release**: release đi qua departure-token (D7) — vision-empty **đầu tiên** đã detach owner ngay, chống flick nằm ở cơ chế *khôi phục* khi occupied quay lại trước khi token bị consume.
- **Input**: `slot.owner`, `vision_occupied`, sự kiện tracking (`release`) + vision tick. **Output**: transition + lý do (`sticky_id_conflict`/`competing_vehicle`/`released:reason`/`vision_confirmed_empty`/`false_empty_restored`).
- **Pseudocode**:
  1. `bind`: `owner` khác gid đang giữ → reject `sticky_id_conflict` (nếu `vision_occupied`) hoặc `competing_vehicle` (nếu vision trống nhưng owner còn treo).
  2. `bind` ok → set `vehicle_id`, `bound_frame`, `overlap`, `stopped_ms`; mở episode `parked` (D11).
  3. Tracking mất xe → `_release_vehicle`: episode→`departing`, `tracking_state="exit_pending"` (**nhãn**, không phải bộ đếm); nếu vision còn occupied → owner vẫn treo (sticky) + token `predeparture`; nếu vision đã trống → gỡ owner ngay.
  4. Vision-empty đầu tiên (đã có owner/token) → `_create_departure_token(confirmed_empty)` + `_detach_binding_for_departure` — owner bị gỡ **ngay tại tick này**; `empty_observations ≥ 2` chỉ bật cờ audit, không quyết định release.
  5. Vision occupied quay lại trước khi token bị consume (ngoại lệ: predeparture `empty_obs=0`) → `_restore_false_empty_token` → owner phục hồi, episode `departing→parked` — đây là "chống flick" thật (token-rollback, không countdown).
- **Cấu trúc**: `SlotBinding{vehicle_id, tracking_state, vision_occupied}`; `DepartureToken`; event log.
- **Độ phức tạp**: O(1)/sự kiện. **space** O(1); **[sim]**: O(1).
- **Edge cases**: challenger overlap cao hơn → vẫn reject trong cả hai nhánh (khác reason); empty→occupied sớm → restore giữ nguyên episode (không double-session); legacy path (`!vision && !tracking`) → clear một lần, không lặp.
- **Failure modes**: detach ngay ở empty đầu tiên → nếu vision flick nhịp dài (occupied quay lại sau token consumed) → chủ cũ mất ID thật, xe thành arrival mới; `competing_vehicle` bị bỏ qua trong log → khó truy vết challenger bị chặn khi vision trống.
- **Thực tế vs mô phỏng**: giữ reject-2-reason + token-detach + restore. `[sim-omits]`: `_release_vehicle` còn cập nhật `VehicleParkingState`, `movement_state`, gọi `_sync_result`; `predeparture` token gate (D8) — demo giữ 5 bước lõi.
- **Sample A**: `{"slot":"s1","owner":"v0","vision_occupied":true,"events":["t1:claim_v1","t2:tracker_lost","t4:vision_empty"]}` → **Expected** (verify): `t1 → reject:sticky_id_conflict` (vision còn occupied); `t2 → departing + tracking_state=exit_pending, owner v0 VẪN treo`; `t4 → token confirmed_empty + detach ngay` → `v1` sau đó mới bind được.
- **Sample B (biên — false empty)**: `{"slot":"s1","owner":"v0","events":["t2:vision_empty→detach+token","t3:vision_occupied (trước consume)"]}` → **Expected**: `t3 → _restore_false_empty_token` → **owner v0 phục hồi, token hủy, episode về `parked`** — kết luận "sống sót qua nhiễu" giống hệt nhưng cơ chế là rollback, không phải reset streak.
- **Storyboard**: ô đỗ gắn thẻ `v0`; challenger đỏ gõ cửa → gạch `sticky_id_conflict`; tracker lost → cờ `exit_pending` vàng (owner vẫn treo trên ô); tick `vision_empty` → ô chuyển `departing` + token-card hiện; nút "occupied quay lại" → animation rollback `parked`; bảng realtime: `vision | tracking | owner | token | episode`; pseudo-line 1–5. Giải thích VN: "không đếm số lần báo trống — trống lần đầu đã gỡ, nhưng token giữ cửa quay về đến khi bị consume".
- **Thư viện ngoài**: không trực tiếp.

#### D7. `departure-token-lifecycle` — Vòng đời token nhớ xe sắp/đã rời
- **Nhóm**: Binder · **Tiên quyết**: D4, D6 · **Liên quan**: D8, D9, D10, D11
- **Code**: `backend/main_detect/src/techgar/slot_vehicle_binder.py:1449-1532` `_create_departure_token`; `:1533-1565` `_detach_binding_for_departure`; `:1566-1635` `_restore_false_empty_token`; `:603-609` `_token_radius`; `:1742-1914` `_cleanup_tokens`; defaults `:225-229,236-237` — `retention 5.0`, `extension 15.0`, `initial/max expand ratio 0.05/0.45`, `expand_seconds 1.0`, `guard 2.5`, `false_empty_grace 1.25`.
- **Vai trò**: khi vision báo empty nhưng owner có thể đang rời, tạo **departure token** ghi `global_id` + polygon + màu + bbox — bán kính nhận diện **nở theo ratio của đường chéo ô** (không phải tốc độ px cố định), TTL gia hạn có điều kiện để bắt fragment rời ô.
- **Input**: owner cũ + timestamp empty; `slot_diagonal`. **Output**: `DepartureToken` sống → `consume` (D10) | `restore` | `cancel` | `expire`.
- **Pseudocode**:
  1. **`radius(t) = diag · (0.05 + min(1, age/1.0s)·0.40)`** `:603-609` — nội suy ratio, bão hoà sau `expand_seconds`, tỉ lệ theo kích thước ô (không có `r0 + rate·Δt`).
  2. `expires = created + recovery_retention_seconds(5.0)` (set trong `_create_departure_token`).
  3. Vision occupied lại (empty_obs>0 hoặc !predeparture) → `restore` — hủy token, khôi phục binding (D4) `:2546-2557`.
  4. Fragment khớp (D9/D10) → `consume` → gid chuyển sang track mới, episode `released`.
  5. Cleanup `:1742-1914`: predeparture `empty_obs=0` && `age > 2.5s` && `!fresh_evidence && !qualified_evidence && !(verdict_pending && candidate_tracking)` → `cancel predeparture_guard_expired` `:1745-1803`; `now ≤ expires` → chỉ dọn candidate cũ `:1804-1819`; `now > expires` && `now < created+5+15` && `_token_extension_blocker` → gia hạn `min(now+max(0.25, expand_s), deadline)` `:1820-1846`; ngược lại expire → episode `released/recovery_expired` (trừ predeparture-owner-còn-parked → `provisional_expired_owner_still_parked`) `:1847-1911`.
- **Cấu trúc**: `DepartureToken{global_id, polygon, center, slot_diagonal, origin, appearance, size, created_at_s, expires_at_s, confirmed_empty, predeparture, empty_observations, candidates, retention_extensions}`.
- **Độ phức tạp**: O(1)/token + O(tokens·candidates) cleanup. **space** O(tokens + evidence); **[sim]**: O(n).
- **Edge cases**: false-empty → restore giữ nguyên episode; fragment tiến chậm → evidence tươi giữ token sống qua TTL phẳng (extension tới `created+20s`); token `confirmed_empty=False` + owner còn parked → expire chỉ huỷ token, không đóng episode; candidate evidence >0.75s không-qualified → bị pop sớm `:1808-1819`.
- **Failure modes**: `expand_seconds` ngắn → radius đạt trần 0.45·diag sớm — xe rời nhanh vẫn trong gate; TTL phẳng giả → xe rời chậm mất cửa consume nếu không có blocker; appearance cũ → khớp nhầm màu giống.
- **Thực tế vs mô phỏng**: giữ radius-ratio + restore + consume/expire + guard-cancel. `[sim-omits]`: `_token_extension_blocker` tiêu chí cụ thể, `_rank_fragment_continuations`, candidate-evidence TTL phân tầng, `pending_release` — demo giữ vòng đời chính.
- **Sample A (thường — radius nở)**:
  ```json
  {"slot_diagonal":100,"dt":[0,0.5,1,3],"init":0.05,"max":0.45,"expand_s":1.0}
  ```
  **Expected** (verify): `radius = [5, 25, 45, 45]` — nội suy `diag·(0.05 + min(1,t/1.0)·0.40)`, **bão hoà 45 sau 1s** (không tăng tuyến tính vô hạn như `r0+rate·t`).
- **Sample B (biên — guard cancel)**:
  ```json
  {"token":{"predeparture":true,"confirmed_empty":false,"empty_obs":0,"created":10.0,"candidates":[]},"now":12.6,"guard_s":2.5,"binding_vision_occupied":false}
  ```
  **Expected** (verify): `age 2.6 > 2.5` và không fresh/qualified evidence, không verdict_pending → **`cancel:predeparture_guard_expired`** — token dự phòng không được để treo vô hạn; ngược lại nếu `vision_occupied` vẫn true và `age ≤ max(2.5,1.25)` thì guard chưa chặt (verdict pending).
- **Storyboard**: ô đỗ + vòng tròn radius phồng theo thanh thời gian (đánh dấu `diag` slider — radius đổi theo kích thước ô); token-card id/màu/TTL; nút "vision lại occupied" → restore; nút "guard 2.5s qua" → cancel; bảng realtime: `age | progress | ratio | radius | ttl_left | evidence | state`; pseudo-line 1–5. Giải thích VN: "vòng tìm kiếm mở nhanh trong 1 giây đầu theo tỉ lệ kích thước ô — không phải bánh xe lăn đều mãi".
- **Thư viện ngoài**: `cv2`/`numpy` [code].

#### D8. `predeparture-candidate-guard` — Đánh dấu ứng viên trước khi mất binding
- **Nhóm**: Binder · **Tiên quyết**: D7 · **Liên quan**: D9, D10
- **Code**: `backend/main_detect/src/techgar/slot_vehicle_binder.py:479-552` `prepare_predeparture_tokens` — **duyệt `unbound_tracks` (fragment), không duyệt bindings/owner**: tín hiệu là "fragment không-bind xuất hiện cạnh ô đang occupied", không phải "owner overlap giảm + velocity hướng ra".
- **Vai trò**: chờ vision báo empty rồi mới tạo token là quá trễ — xe đã đi xa; guard này tạo token **predeparture** (`confirmed_empty=False`, reason `motion_started_in_parked_slot`) khi một fragment unbound đứng gần ô có owner occupied → bảo vệ fragment khỏi bị cấp ID mới trước khi vision xác nhận.
- **Input**: `unbound_tracks` {key→{bbox, point}}, bindings, `camera_id`. **Output**: `protected: set[key]` + predeparture token mới/refresh.
- **Pseudocode**:
  1. Với mỗi unbound track: `bbox`, `point` (recovery_bbox/position hoặc bottom_center) `:493-495`.
  2. Với mỗi binding `vehicle_id≠None && vision_occupied && polygon && camera khớp`: `diag = _slot_diagonal`; `signed = _signed_polygon_distance(point, poly)`; `overlap = _raw_vehicle_overlap(bbox, poly)`; **bỏ qua nếu `signed < −0.05·diag && overlap ≤ 0`** (quá xa và không chạm) `:505-510`; còn lại → `choices` ghi `dist(point, center)/diag`.
  3. `choices` rỗng → bỏ; sắp xếp; **nếu ≥2 choices và `choices[1]−choices[0] < 0.15` → skip** (không đoán khi 2 ô gần nhau tranh fragment) `:511-517`.
  4. `binding = choices[0]`; không có token → `_create_departure_token(predeparture=True, confirmed_empty=False, reason="motion_started_in_parked_slot")` + event `predeparture_token_opened` `:519-534`; token predeparture cũ `empty_obs=0` → **refresh `created_at_s` + gia hạn `expires`** `:535-550`.
  5. `protected.add(key)` — key được bảo vệ khỏi allocate mới `:551`.
- **Cấu trúc**: `protected` set; `DepartureToken{predeparture, confirmed_empty}`; `_bindings`.
- **Độ phức tạp**: O(F·B), F unbound × B bindings. **space** O(F·B) choices; **[sim]**: O(F·B).
- **Edge cases**: fragment đứng giữa 2 ô occupied (`gap<0.15`) → skip (an toàn); fragment `signed` dương (trong ô) hoặc overlap>0 → luôn ứng viên dù `signed` âm nhỏ hơn `-0.05·diag` miễn overlap>0 — hai điều kiện OR `:509`; fragment rời xa (`signed < −0.05·diag && overlap=0`) → không ai bảo vệ; token đã `confirmed_empty` → **không refresh** (`created_at_s` không được reset — radius phải nở từ empty thật) `:535-545`.
- **Failure modes**: unbound flick (fragment 1 frame) → token mở nhầm → được guard-cancel dọn nếu không có evidence tiếp theo (D7); ambiguity margin 0.15 có thể skip fragment thật ở lối đi giữa 2 ô.
- **Thực tế vs mô phỏng**: giữ fragment-side trigger + admission OR + ambiguity-skip + refresh. `[sim-omits]`: `recovery_bbox`/`recovery_position` fallback, `camera_id` filter, `_optional_bbox/point`, event log — demo truyền `signed`/`overlap`/`dist_ratio` sẵn.
- **Sample A (thường — fragment cạnh ô)**:
  ```json
  {"slot":{"diag":11.31,"occupied":true,"owner":"v7"},"frag":{"point_signed":-1.0,"overlap":0.10,"dist_over_diag":0.30},"other_slots":[]}
  ```
  **Expected** (verify): `initial_radius = 11.31·0.05 = 0.566`; `signed=−1.0 < −0.566` nhưng `overlap=0.10 > 0` → **giữ** (điều kiện OR); 1 choice → `predeparture_token(motion_started_in_parked_slot)` + fragment `protected`.
- **Sample B (biên — hai ô tranh / fragment xa)**:
  ```json
  {"ambiguous":{"frag":{"point_signed":-1.0,"overlap":0.10,"dist_over_diag":0.30,"other_dist_over_diag":0.40}},"far":{"frag":{"point_signed":-11.0,"overlap":0.0,"dist_over_diag":2.0}}}
  ```
  **Expected** (verify): ambiguous `0.40−0.30=0.10 < 0.15` → **skip — không token** (an toàn hơn đoán nhầm ô); far `signed < −0.566 && overlap=0` → **không ứng viên**.
- **Storyboard**: ô đỗ occupied + vòng `0.05·diag` quanh viền (signed-distance); fragment chấm đỏ rơi vào vùng/viền → token-card bật sớm; hai ô sát nhau + fragment giữa → đèn "ambiguous skip" vàng; bảng realtime: `signed | overlap | dist/diag | choices | gap | verdict`; pseudo-line 1–5. Giải thích VN: "không đoán chủ bằng xu hướng — bảo vệ fragment chưa-bind đứng cạnh ô có chủ, và chịu thua khi hai ô tranh nhau".
- **Thư viện ngoài**: không trực tiếp (`cv2.pointPolygonTest`, `intersectConvexConvex` bên trong).

#### D9. `recovery-candidate-gates` — Cổng nhận fragment khôi phục ID
- **Nhóm**: Binder · **Tiên quyết**: D7, D8 · **Liên quan**: B10, B11, D10, E8
- **Code**: `backend/main_detect/src/techgar/slot_vehicle_binder.py:2763-3570` `batch_recover_ids` — `radius`/`max_radius` `:2875-2876`; admission `:2980-2994`; origin gate `:3233-3239`; expanding gate `:3240-3249`; size `:3251-3284`; appearance `:3286-3304`; outward `:3306-3391`; confirmed-empty `:3416-3421`; cost `:3423-3472`; defaults `:230-240`.
- **Vai trò**: fragment muốn nhận `global_id` của token phải qua chuỗi gate: **đủ gần ô theo signed-distance (không phải khoảng cách tới điểm origin), đúng kích thước, đúng màu, có ≥3 quan sát, và chứng minh được đang đi RA** — ba đường chứng minh outward khác nhau, không có `dir_cos` đơn lẻ.
- **Input**: `token{polygon, center, slot_diagonal, candidates}` + `fragment{point, bbox, first_center/bbox, appearance, obs}`; `is_cross_camera`. **Output**: `cost | diagnostics{reason}`.
- **Pseudocode**:
  1. `radius = _token_radius(token)`; `max_radius = diag·0.45` `:2875-2876`. Admission: `signed < −max_radius && overlap≤0 && !continuing` → skip `:2987-2992`.
  2. Origin: `first_signed < −max_radius` → `origin_outside_max_gate` `:3233-3239`.
  3. Expanding gate: `signed < −radius && overlap ≤ 0 && !continuing` → `waiting_for_expanding_gate` `:3240-3249`.
  4. Size: `size_ratio ∈ [0.40, 2.50]` (legacy) **hoặc** `trajectory_ready && ∈ [0.15, 6.0]` `:3251-3284` → `size_missing_or_mismatch`.
  5. Appearance: `limit = 0.70 nếu (!cross && max(first_ovl, ovl) ≥ 0.25) else 0.55`; `app is None || app > limit` → `appearance_missing_or_mismatch` `:3286-3304`.
  6. Outward evidence — `obs ≥ 3` **và** một trong `:3380-3391`:
     a. legacy: `moved ≥ 3.0 && outward_px ≥ 1.5 && radial_gain ≥ 0.75` (`outward_px = movement·unit(first_vector)` khi `radial_first ≥ 0.35·diag`, ngược lại `radial_now − radial_first`) `:3322-3331`;
     b. world-trajectory: `trajectory_ready && (!cross || (dir_cos ≥ 0.25 && obs ≥ 3))` `:3350-3361`;
     c. polygon-escape: `originated_in_slot && signed ≤ −max(1.5, 0.05·diag) && moved ≥ 3.0 && (radial_now − min_radial) ≥ 0.75` `:3369-3379`.
     Không → `insufficient_outward_evidence`.
  7. `!token.confirmed_empty` → `departure_not_yet_confirmed` (chờ, không reject hẳn) `:3416-3421`.
  8. `spatial = min(1, ‖point − center‖/(diag + radius))`; `size_cost = min(1, |ln(size_ratio)|/ln 2.5)`; `direction_cost` theo nguồn; **`cost = 0.45·spatial + 0.35·(app/limit) + 0.15·size_cost + 0.05·direction`** `:3423-3472`.
- **Cấu trúc**: `RecoveryCandidateEvidence` (:91-134); `RecoveryBatchResult`; `trajectory_evidence`.
- **Độ phức tạp**: O(T·F). **space** O(T·F); **[sim]**: O(T·F).
- **Edge cases**: fragment sinh trong ô (`originated_in_slot`) → escape-path khớp được dù `first_vector` mập mờ; `continuing_candidate` (đã có evidence) → **bỏ qua cả origin gate và expanding gate** — fragment nhanh không bị radius chậm giữ lại; `signed` dương nhỏ (đi ngược vào ô) → `outward_px` âm → fail outward; `app=None` → reject appearance (không miễn).
- **Failure modes**: `obs<3` → chờ evidence (chưa reject — diagnostics); `outward_unit` bị `None` khi `radial_first < 0.35·diag` → dùng radial_gain thay (jitter-proof); cross-camera thiếu target-camera gallery → `target_camera_appearance_missing`.
- **Thực tế vs mô phỏng**: giữ chuỗi gate + 3 đường outward + cost 4-term. `[sim-omits]`: world-trajectory scoring chi tiết (E8), `_rank_fragment_continuations`, `protected_pairs`, target-camera gallery path, `trajectory_qualification` — demo chỉ đường legacy + escape, `world_ready` như cờ.
- **Sample A (thường — qualified)**:
  ```json
  {"token":{"center":[5,5],"diag":11.314,"radius":5.09,"max_radius":5.09,"confirmed_empty":true},
   "frag":{"first_center":[5,5],"first_signed":3.0,"first_bbox_overlap":0.5,"point":[12,5],"signed":-4.0,"overlap":0.0,"app":0.2,"size_ratio":0.9,"obs":3,"moved_px":7,"min_radial":0,"radial_now":7,"originated_in_slot":true},"is_cross":false}
  ```
  **Expected** (verify): gates qua hết (`first_signed 3 > −5.09`; `signed −4 ≥ −5.09`; size 0.9∈[0.4,2.5]; `max(0.5,0)≥0.25` → limit relaxed 0.70, `0.2≤0.70`; `moved 7≥3`, `outward 7≥1.5`, `radial_gain 7≥0.75`; obs 3) → `spatial=min(1,7/16.4)=0.4267`; `size_cost=|ln0.9|/ln2.5=0.115`; `dir_cost=clip(1−7/3)=0` → **`cost = 0.45·0.4267 + 0.35·0.2857 + 0.15·0.115 + 0 = 0.3093`**.
- **Sample B (biên — đi ngược vào ô)**:
  ```json
  {"token":{"center":[5,5],"diag":11.314,"radius":5.09,"max_radius":5.09,"confirmed_empty":true},
   "frag":{"first_center":[10,5],"first_signed":-1.0,"first_bbox_overlap":0.5,"point":[6,5],"signed":-2.0,"overlap":0.5,"app":0.2,"size_ratio":0.9,"obs":3,"moved_px":4,"min_radial":5,"radial_now":1,"originated_in_slot":false,"world_ready":false},"is_cross":false}
  ```
  **Expected** (verify): qua admission/origin/size/app (`first_signed −1.0 ≥ −5.09`; `signed −2.0 ≥ −5.09`; `max(0.5,0.5)≥0.25` → limit 0.70 ≥ 0.2); outward: `first_vector=(5,0)`, `radial_first=5 ≥ 0.35·11.314=3.96` → `outward_unit=(1,0)`; `outward_px=(−4)·1=−4 < 1.5`; `radial_gain=−4 < 0.75`; escape fail (`originated_in_slot=false`); `world_ready=false` → **`reject:insufficient_outward_evidence`** — đúng chỗ đúng màu nhưng quay đầu vào ô.
- **Storyboard**: ô đỗ + vòng signed-distance `radius`/`max_radius` (signed âm ra ngoài); fragment chấm + mũi moved; chuỗi 6 thẻ gate sáng/dập + ba nút "legacy/escape/world" cho outward; bảng realtime: `signed | size | app/limit | moved | outward_px | radial_gain | obs | verdict`; pseudo-line 1–8. Giải thích VN: "khoảng cách đo theo cạnh ô (signed), hướng đi chứng minh bằng px dịch chuyển ra xa — cosine hướng chỉ nằm trong nhánh world-camera".
- **Thư viện ngoài**: `numpy` [code].

#### D10. `recovery-batch-assignment` — Gán token→fragment hàng loạt
- **Nhóm**: Binder · **Tiên quyết**: D9 · **Liên quan**: B6, D2, D11
- **Code**: `backend/main_detect/src/techgar/slot_vehicle_binder.py:2763-3570` `batch_recover_ids` (`lapjv(extend_cost=True, cost_limit=0.999)` `:3520`; ambiguity margin `:3526-3557`); `:2726-2761` `_consume_departure_token`; `:3571-3595` `consume_recovery_match` (re-validate `confirmed_empty` `:3584`); `try_recover_id` `:3597-…` đường đơn.
- **Vai trò**: nhiều token + nhiều fragment cùng lúc → gán 1–1 tối ưu; **post-check ambiguity**: kẻ thắng phải hơn mọi phương án phụ ≥ `recovery_ambiguity_margin=0.15`; consume → fragment nhận `global_id`, episode **`released` (`departure_confirmed`)**.
- **Input**: `costs[T×F]` (chỉ cặp qua D9) + `pair_details`. **Output**: `{local_key → global_id}` + `ambiguous_local_keys` + unmatched.
- **Pseudocode**:
  1. `costs[t][f] = cost(D9)` hoặc `10` nếu reject.
  2. `lapjv(extend_cost=True, cost_limit=0.999)` `:3520` — **0.999, không phải 0.95**: gần như mọi cặp qua gate đều được gán nếu tối ưu.
  3. Với mỗi cặp thắng: `row_gap = min(cost khác trong hàng <10) − cost`; `col_gap = min(cost khác trong cột <10) − cost`; **`row_gap < 0.15 || col_gap < 0.15` → skip consume + đánh dấu `ambiguous_local_keys` + event `parked_id_recovery_ambiguous`** `:3526-3557` — margin cột tính cả token thua.
  4. `consume` (`_consume_departure_token`): pop token + `_pending_release`; episode → **`"released"`, reason `"departure_confirmed"`** `:2735-2740`; vehicle `movement_state="exit_pending"`, cooldown `+2.5s`; event `parked_id_recovered` `:2741-2760`.
- **Cấu trúc**: `RecoveryBatchResult{recovered_ids, protected_local_keys, ambiguous_local_keys, eligible_pairs, diagnostics}`.
- **Độ phức tạp (code)**: O(n³) + O(T·F) gap. **space** O(T·F); **[sim]**: exhaustive O(n!) n≤5.
- **Edge cases**: 2 token tranh 1 fragment (`col_gap<0.15`) → **cả hai không consume** — solver thắng vẫn bị chặn bởi margin; `consume_recovery_match` re-check `token.confirmed_empty` `:3584` — evaluate-only path không consume được token chưa xác nhận; cặp đã qua gate nhưng LAPJV bỏ (cost>limit) → không consume.
- **Failure modes**: `limit=0.999` rộng → cặp cost ~0.9 cũng được gán — quality nằm ở D9 chứ không limit; ambiguity margin 0.15 → hai token gần nhau làm chậm recovery (đúng chủ ý).
- **Thực tế vs mô phỏng**: giữ solver exact + margin ambiguity + consume-side-effects. `[sim-omits]`: `_pending_release`, `vehicle_states` cập nhật, cooldown, `try_recover_id` payload, event fields — demo batch + consume-flag.
- **Sample A (thường — 1 cặp consume)**:
  ```json
  {"costs":[[0.20,10],[0.55,10]],"limit":0.999,"margin":0.15}
  ```
  **Expected** (verify): tok0 thắng `0.20` vs `0.55`; `col_gap = 0.55−0.20 = 0.35 ≥ 0.15`, `row_gap = ∞` → **`tok0→f0` consume**: fragment nhận `global_id`, episode `released`/`departure_confirmed`; `tok1` unmatched chờ TTL.
- **Sample B (biên — margin cột chặn)**:
  ```json
  {"costs":[[0.30,10],[0.34,10]],"limit":0.999,"margin":0.15}
  ```
  **Expected** (verify): tok0 thắng `0.30` nhưng `col_gap = 0.34−0.30 = 0.04 < 0.15` → **`ambiguous_reject` — không ai consume**, event `parked_id_recovery_ambiguous`, cả hai token chờ (an toàn hơn gán sai).
- **Storyboard**: 2 token-card trái, 2 fragment-card phải, cạnh nối ghi cost; solver tô cặp thắng; thanh `col_gap` cạnh mốc 0.15 — thắng sít → cảnh báo đỏ "ambiguous"; token thua chuyển xám "wait"; bảng realtime: `pair | cost | row_gap | col_gap | verdict`; pseudo-line 1–4. Giải thích VN: "LAPJV chọn kèo rẻ nhất, margin chặn kèo hòa — và consume là đóng sổ episode, không phải mở 'departing'".
- **Thư viện ngoài**: `lap.lapjv` [code] — demo solver exact.

---

#### D11. `parking-episode-state` — Vòng đời episode đỗ xe
- **Nhóm**: Binder · **Tiên quyết**: D3, D6, D7, D10 · **Liên quan**: C (episode consumer khác)
- **Code**: `backend/main_detect/src/techgar/slot_vehicle_binder.py:888-944` `_open_parking_episode`; `:945-977` `_transition_parking_episode`; `:1533-1565` `_detach_binding_for_departure`; `:1566-1634` restore→`parked` (`false_empty_restored`); `:1986` release→`departing` (`released:<reason>`); `:2618`, `:1906` terminal→`released` (`parking_slot_removed`/`recovery_expired`).
- **Vai trò**: mỗi lần chiếm ô là một **episode** với FSM **`parked → departing → released`** — downstream (gate session, snapshot) đọc episode để biết xe đỗ/đang ra; `released` là terminal (pop khỏi map đang-sống vào log `_parking_episodes`). **Không có state `open`/`closed`** — episode sinh ra ngay ở `parked` khi bind.
- **Input**: bind/release/vision/token events + timestamps. **Output**: `episode {parking_episode_id, global_id, slot_id, state, revision, reason, evidence_*}`.
- **Pseudocode**:
  1. `bind` → episode mới **`state="parked"`** ngay (`revision=1`, id `slot:G{gid}:F{frame}`); dedupe: cùng `global_id` rebind → trả episode cũ (chống double-session).
  2. Release/detach (`_release_vehicle`, `_detach_binding_for_departure`) → `departing` (`reason=released:<why>`/`vision_confirmed_empty`...).
  3. `restore` (false-empty, D6) → `departing→parked` — **không đóng**, cùng `parking_episode_id`, `revision++`.
  4. Consume/expire/vision_confirmed_empty/slot_removed/reservation_rejected → **`released`** = terminal: pop `_episode_by_slot` → append `_parking_episodes` + emit `parking_episode_state_changed`.
- **Cấu trúc**: `_episode_by_slot` (đang sống) + `_parking_episodes` (log đã released); `revision`/`reason`/`evidence_frame_idx`.
- **Độ phức tạp**: O(1)/transition. **space** O(episodes); **[sim]**: O(n) duyệt chuỗi.
- **Edge cases**: false-empty → `departing→parked` (không đóng/mở lại); rebind cùng gid trong lúc parked → dedupe trả episode cũ (không double-session); xe chưa "stopped" vẫn có episode `parked` — **state `parked` không đợi D5**, nó là nhãn episode chứ không phải verdict dừng.
- **Failure modes**: thiếu token → `parked→released` nhảy thẳng qua detach (mất nhịp departing); restore lỗi → episode đã released không còn trong map → tạo episode mới → double session phía gate.
- **Thực tế vs mô phỏng**: giữ 3 state + restore + dedupe. `[sim-omits]`: các reason terminal khác (`replaced`, `parking_slot_removed`, `reservation_rejected`) + fields `revision`/`evidence_*`/`applied_*` đầy đủ — demo giữ `state`+`reason`.
- **Sample A**: `{"events":["bind@1","token+detach@6","vision_confirmed_empty@11"]}` → **Expected**: `parked(1) → departing(6) → released(11)` — một episode trọn vòng đời, terminal ghi log.
- **Sample B (biên — false empty)**: `{"events":["bind@1","token+detach@6","restore@6.5"]}` → **Expected**: `parked → departing → parked` — episode **không đóng**, `revision=3`, tiếp tục (không double-session).
- **Storyboard**: state machine 3 nút + mũi tên quay `departing→parked`; nút `released` xám có cờ "terminal→log"; `revision` counter tăng mỗi transition; bảng realtime: `event | state | revision | reason`; pseudo-line 1–4. Giải thích VN: "episode ra đời đã là 'parked' — 'departing' chỉ là giai đoạn đang rời, 'released' mới đóng sổ".
- **Thư viện ngoài**: không trực tiếp.

### Nhóm E — Dual-camera identity (E1–E10)

#### E1. `world-projection-anchor` — Chiếu pixel→world qua homography
- **Nhóm**: CrossCam · **Tiên quyết**: F1 (homography), A6 · **Liên quan**: E2, E3, E5, E8
- **Code**: `backend/main_detect/src/techgar/cross_camera_manager.py:1370-1377` `_world`; `:1419-1427` `_local` (chiều ngược); `:1379-1403` `_bbox_anchor` (anchor theo camera config); `:1407-1417` `_track_world`, `_expired_track_world`.
- **Vai trò**: mọi so sánh cross-camera đều trong **hệ world (cm)** — mỗi camera có `H_cam→world` riêng; không có H → **fallback `crop_origin + local_px`** (tọa độ virtual-crop, giới hạn chức năng).
- **Input**: `local_point (px)`, `cam_id`, `H[3×3]` hoặc `camera_crops[cam_id]=(x1,y1,w,h)`, `anchor_mode`. **Output**: `world (x_cm, y_cm)` — **tuple thường, không có cờ `approx`** (production không đánh dấu fallback).
- **Pseudocode**:
  1. `transform` tồn tại → `p = H · [u, v, 1]ᵀ`; `(x, y) = (p.x/p.w, p.y/p.w)`.
  2. Fallback: `(x1, y1, _, _) = camera_crops[cam_id]` → `world = (x1 + u, y1 + v)` — cộng offset crop, **không phải** identity `world = px`.
  3. Anchor (A6) theo config cam → pixel → chiếu.
  4. `_local` = nhân `H⁻¹` — chiếu ngược world→pixel.
- **Cấu trúc**: `H` per cam; dict `transforms`.
- **Độ phức tạp**: O(1)/điểm; O(T) cho T track. **space** O(1); **[sim]**: O(1).
- **Edge cases**: `H` không tồn tại (chưa calibrate / camera_transforms rỗng) → `world = crop_origin + local_px` → cross-cam match chạy trên tọa độ pixel-crop, sai lệch với world thật; điểm ngoài vùng calibrate → extrapolation (sai số lớn — F2 đo p95 để chặn khi fit); `p.w ≈ 0` → điểm ở vô cực.
- **Failure modes**: camera xê dịch sau calibration → toàn bộ world lệch (không có giám sát drift — rủi ro đã ghi ở báo cáo); anchor mode lệch nhau giữa 2 cam → cùng xe → 2 điểm world khác nhau; fallback offset trả về **tuple thường** — caller không phân biệt được đây là kết quả degraded (không có cờ cảnh báo ở production).
- **Thực tế vs mô phỏng**: giữ nhân ma trận + anchor mode + fallback crop-offset. `[sim-omits]`: `perspectiveTransform` batch, `camera_matrix` undistort — demo 2D thuần. `[sim]`: badge "≈crop-offset" trên UI chỉ là chú thích giáo dục — **không tồn tại field `approx` trong output production**.
- **Sample A**: `{"H":[[2,0,10],[0,2,20],[0,0,1]],"px":[5,5]}` → **Expected** (verify): `world = (2·5+10, 2·5+20) = (20,30)`; round-trip `_local(20,30) = (5,5)` — song ánh khôi phục đúng.
- **Sample B (biên — chưa calibrate)**: `{"H":null,"crop_origin":[30,40],"px":[5,5]}` → **Expected** (verify): `world = (30+5, 40+5) = (35,45)` — tuple thường, **không kèm cờ**; khác identity `(5,5)` — cross-cam matching vẫn nhận nhưng đo bằng pixel-crop chứ không phải cm.
- **Storyboard**: bản đồ world (lưới cm) + ảnh cam (lưới px) cạnh nhau; chấm px kéo → chấm world chạy theo tia chiếu; toggle "mất H" → chấm nhảy về `crop_origin + px` kèm chú thích `[sim] ≈crop-offset (không phải cờ thật)`; bảng realtime: `px | crop_origin | H | world`; pseudo-line 1–4. Giải thích VN: "mỗi camera nhìn một góc — world là ngôn ngữ chung, H là từ điển; thiếu từ điển thì chỉ dịch được bằng offset crop".
- **Thư viện ngoài**: `cv2.perspectiveTransform`/`numpy` [code] — demo ma trận 3×3.

#### E2. `handoff-entry-creation` — Tạo yêu cầu chuyển giao khi xe ra biên
- **Nhóm**: CrossCam · **Tiên quyết**: E1, B9 · **Liên quan**: E3, E4, E5
- **Code**: `backend/main_detect/src/techgar/cross_camera_manager.py:2475-2548` `_outward_edge`; `:2572-2743` `_upsert_handoff`.
- **Vai trò**: track đi về phía biên ảnh với vận tốc đủ → dự đoán **số frame** tới biên (`t_edge = dist_px / v_px_per_frame` — **đơn vị frame, không phải giây**); nếu `t_edge ≤ lookahead_frames` → tạo/cập nhật `HandoffEntry` chờ camera kề nhận.
- **Input**: track (`cx,cy` px, `vx,vy` **px/frame**), `edge`/camera size, `lookahead_frames` (default **16**, `:155`). **Output**: `HandoffEntry{cam, local_id, edge, expected_vel, updated_at_frame, ttl}` (:40-64) hoặc `None`.
- **Pseudocode**:
  1. `_outward_edge` nhánh bbox-edge (`:2531-2542`): `vx < −1.0` → `t = cx/|vx|` edge `left`; `vx > 1.0` → `t = (width − cx)/vx` edge `right`; tương tự `vy` cho `top`/`bottom` — **gate vận tốc `|v| > 1.0 px/frame`**. Nhánh custom-mask (`:2510-2530`): tham số chiếu `t` trên cạnh edge-vector, gate `speed_towards > 0.1`, cho phép overshoot `t > −5.0`.
  2. `time_to_edge = min(options)`; `time_to_edge > lookahead_frames` → `None` — **so sánh trực tiếp theo frame**, không quy đổi giây.
  3. `t ≤ lookahead` → `_upsert_handoff` tạo entry (refresh nếu đã có); entry hết TTL không match → hủy.
- **Cấu trúc**: `HandoffEntry`; `expected_vel`/`velocity_world` cho E3. TTL **hai dạng**: `handoff_ttl = 45` **frames** (mặc định) hoặc `handoff_ttl_seconds` (tuỳ chọn — khi set thì so timestamp thay frame).
- **Độ phức tạp**: O(1)/track. **space** O(1); **[sim]**: O(1).
- **Edge cases**: `|v| ≤ 1.0 px/frame` → không sinh option nào → `None` (xe đỗ/lảo đảo mép không tạo handoff ảo); vận tốc quay vào trong → `t` âm/vô hạn → `None`; track tentative (B9 chưa confirmed) → không tạo handoff.
- **Failure modes**: vận tốc ước lượng sai (Kalman nhiễu) → `t_edge` sai → entry sớm/trễ; biên không nằm trong vùng overlap cam kề → entry chờ vô vọng đến TTL; fps biến động làm *số frame* tới biên đổi nhưng đơn vị vẫn là frame của camera đó.
- **Thực tế vs mô phỏng**: giữ dự đoán frames-tới-biên + `lookahead_frames=16` + TTL 45 frames. `[sim-omits]`: `entered_from_outside` theo cạnh cụ thể, nhánh custom-mask `speed_towards>0.1`, `handoff_ttl_seconds` — demo 1 cạnh phải, đơn vị frame.
- **Sample A**: `{"cx":90,"vx":4,"edge_x":95,"lookahead_frames":16}` (vx **px/frame**) → **Expected** (verify): `t_edge = (95−90)/4 = 1.25 frames ≤ 16` → **tạo `HandoffEntry` cạnh phải**.
- **Sample B (biên — chạy xa biên/quá chậm)**: `{"cx":90,"vx":0.2,"edge_x":95,"lookahead_frames":16}` → **Expected** (verify): `vx=0.2 ≤ 1.0` → không qua gate vận tốc → **`None`**; biến thể `vx=0.5` cũng `None`; nếu dùng `vx=1.5` thì `t_edge = 5/1.5 = 3.33 frames ≤ 16` → entry; `vx=−4` → cạnh trái `t = 90/4 = 22.5 frames > 16` → `None`.
- **Storyboard**: ảnh cam, thanh biên phải đỏ; track chấm + mũi v; đồng hồ `t_edge` đếm **theo frame** — ≤ ngưỡng → entry-card hiện; slider `vx` (px/frame) + marker gate `|v|>1.0`; bảng realtime: `cx | vx(px/f) | t_edge(frames) | entry`; pseudo-line 1–3. Giải thích VN: "handoff được chuẩn bị trước khi xe ra khỏi ảnh — đơn vị đếm là frame của camera, không phải giây".
- **Thư viện ngoài**: `numpy` [code].

#### E3. `handoff-prediction-corridor` — Dự đoán nơi xe xuất hiện ở camera kề
- **Nhóm**: CrossCam · **Tiên quyết**: E1, E2 · **Liên quan**: E4, E5
- **Code**: `backend/main_detect/src/techgar/cross_camera_manager.py:2744-2775` `_predicted_world`; `:2776-2822` `_entry_depth`; `:2823-2830` `_direction_cosine`.
- **Vai trò**: từ vị trí + vận tốc world tại thời điểm entry cập nhật và **elapsed** (timestamp khi được cấu hình giây, **frame-count** là mặc định), dự đoán điểm world nơi xe sẽ xuất hiện — hành lang tìm kiếm cho E4.
- **Input**: `entry.last_world`, `entry.velocity_world` (**world/frame**), `frame_idx`, `entry.updated_at_frame`; nhánh giây: `handoff_ttl_seconds` set + `entry.updated_at_time` + `timestamp_s` + `velocity_world_per_second`. **Output**: `pred_world`, `dir_cos`, `entry_depth`.
- **Pseudocode**:
  1. **Nhánh timestamp** chỉ khi `handoff_ttl_seconds` được set **và** `updated_at_time`, `timestamp_s` tồn tại: `elapsed = max(0, timestamp_s − updated_at_time)`; `vel = velocity_world_per_second` nếu có, ngược lại **`velocity_world × 25.0`** (quy đổi FPS hard-code); `pred = last_world + vel · elapsed`.
  2. **Fallback (mặc định)**: `elapsed = max(0, frame_idx − updated_at_frame)` **đơn vị frame** — `pred = last_world + velocity_world · elapsed` — **KHÔNG chia fps**.
  3. `dir_cos = cos(vel_track, expected_vel_entry)` — hướng khớp kỳ vọng.
  4. `entry_depth` = khoảng đi sâu vào cam kề (đo độ chắc của match).
- **Cấu trúc**: `HandoffEntry{last_world, velocity_world, velocity_world_per_second?, updated_at_frame, updated_at_time?}` (:40-64); cosine scalar.
- **Độ phức tạp**: O(1). **space** O(1); **[sim]**: O(1).
- **Edge cases**: `handoff_ttl_seconds` không set → luôn nhánh frame (timestamp bị bỏ qua dù có); thiếu `velocity_world_per_second` trong nhánh giây → `×25.0` giả định — sai khi fps thật ≠ 25; elapsed lớn → pred chạy xa → radius match (E4) có thể bỏ lỡ; vel≈0 → pred đứng yên.
- **Failure modes**: xe rẽ trong vùng mù giữa 2 cam → pred sai hướng → match thất bại (E7 dormant cứu sau); nhánh `×25.0` khi fps thật 15 → dự đoán vượt xa ~67%; `frame_idx` lệch pha giữa 2 luồng → elapsed ảo.
- **Thực tế vs mô phỏng**: giữ 2 nhánh elapsed + cos hướng + depth. `[sim-omits]`: nhiễu vận tốc, đa-cạnh topology, `entry_depth` theo edge — demo 1 trục.
- **Sample A (nhánh frame — mặc định)**: `{"last_world":[100,50],"vel_per_frame":[0.2,0],"updated_at_frame":10,"frame_idx":22,"expected_vel":[3,1]}` → **Expected** (verify): `elapsed = 22−10 = 12 frames` → `pred = (100 + 0.2·12, 50) = (102.4, 50)` — **không có phép chia fps nào**; `dir_cos = (0.2·3+0)/(0.2·√10) = 0.6/0.632 ≈ 0.949`.
- **Sample B (nhánh timestamp — chỉ khi cấu hình giây)**: `{"last_world":[100,50],"vel_per_second":[2,0],"updated_at_time":10.0,"timestamp_s":11.2,"handoff_ttl_seconds":30}` → **Expected** (verify): `elapsed = 1.2s` → `pred = (100 + 2·1.2, 50) = (102.4, 50)`; nếu thiếu `vel_per_second` → fallback `vel_per_frame·25.0` (ví dụ `0.08·25 = 2.0/s` → cùng `(102.4,50)` nếu per-frame=0.08).
- **Storyboard**: 2 khung ảnh cạnh nhau; xe biến mất khỏi cam1, vòng tròn hành lang xuất hiện ở cam2 quanh `pred`; mũi expected vs thực tế + góc cos; toggle "đếm theo frames" vs "đếm theo giây (yêu cầu config)"; bảng realtime: `elapsed(frames|s) | vel đơn vị | pred | dir_cos | depth`; pseudo-line 1–4. Giải thích VN: "vùng mù giữa 2 camera được nối bằng dự đoán vận tốc — mặc định đếm frame, chỉ dùng giây khi calibration bật `handoff_ttl_seconds`".
- **Thư viện ngoài**: `numpy` [code].

#### E4. `handoff-lapjv-matching` — Khớp entry↔track mới bằng solver
- **Nhóm**: CrossCam · **Tiên quyết**: E2, E3 · **Liên quan**: B6, E5
- **Code**: `backend/main_detect/src/techgar/cross_camera_manager.py:3442-3805` `_match_pending_handoffs`; `:2831-3019` `_candidate_cost`.
- **Vai trò**: nhiều entry chờ + nhiều track mới xuất hiện ở cam kề → gán tối ưu bằng `lapjv` trên cost gộp (khoảng cách tới `pred`, appearance, size, hướng); reject có ghi nhận `_record_rejection`.
- **Input**: `entries[]`, `new_tracks[]` cam kề; cost terms + radius/`cost_limit`. **Output**: `{entry → track}` → bind global ID; rejections.
- **Pseudocode** (gate cứng chạy **trước** cost, `:2831-3016`):
  1. `residual > prediction_radius` → reject `prediction_distance`; `entry_depth > entry_limit` → `outside_entry_corridor`; điểm ngoài vùng overlap (signed-distance) → `outside_overlap`.
  2. `appearance_distance > 0.45` → reject `appearance`; `size_distance > 0.90` → `size`; `dir_cos < 0.25` → `direction`; track `identity_waiting`/`occluded` → reject.
  3. `cost = 0.55·(residual/prediction_radius) + 0.30·appearance + 0.10·size + 0.05·direction_cost` (`:3017`) — **literal**, reject `cost > 0.92` (reason `score`).
  4. `lapjv(costs, extend_cost=True, cost_limit=0.92)` (`:3615`) → pair; mỗi pair → `_bind` cùng `global_id`; entry TTL hết → drop; track không match → giữ pending.
- **Cấu trúc**: ma trận E×T; `HandoffEntry` (:40-64); rejection log (:3020-3028) — mỗi reject kèm reason literal.
- **Độ phức tạp (code)**: O(n³) + build O(E·T). **space** O(E·T); **[sim]**: exhaustive n≤5.
- **Edge cases**: 2 xe cùng lúc qua biên → solver phân đôi theo cost; entry cũ + track mới nhiều → nghiệp nhạy cost; track đúng vị trí nhưng `dir_cos < 0.25` (đi ngược entry) → reject `direction` dù residual nhỏ.
- **Failure modes**: appearance bị nhiễu (bóng/đèn) → vượt `0.45` → reject sớm dù vị trí đúng, hoặc cost lệch → swap ID cross-camera (lỗi nặng nhất pipeline); radius nhỏ → miss → track mới thành GID mới (duplicate).
- **Thực tế vs mô phỏng**: giữ solver exact + rejection reason + công thức 4-term literal trên. `[sim]`: demo có thể gán `cost → 10` cho ứng viên bị reject để ma trận dễ đọc — chỉ là quy ước hiển thị, production trả `None` + reason. `[sim-omits]`: `_reconcile_handoff_dormant_alias`, deferral lists, direction-claim — demo không có.
- **Sample A**: `{"entry":{"pred":[50,50],"radius":10},"tracks":[{"id":"t1","w":[53,50],"app":0.1,"size":0.05,"dir_cost":0.02},{"id":"t2","w":[58,50],"app":0.05,"size":0.02,"dir_cost":0.01}]}` → **Expected** (verify): `cost t1 = 0.55·(3/10) + 0.30·0.1 + 0.10·0.05 + 0.05·0.02 = 0.165+0.03+0.005+0.001 = 0.201`; `cost t2 = 0.55·0.8 + 0.015 + 0.002 + 0.0005 = 0.4575` — cả hai `≤ 0.92` → **khớp `t1`** (residual áp đảo).
- **Sample B (biên — hard gate trước cost)**: `{"entry":{"pred":[50,50],"radius":10},"tracks":[{"w":[61,50]},{"w":[62,50]}]}` → **Expected** (verify): `residual 11,12 > radius 10` → **reject `prediction_distance` ngay ở gate 1** (không tới bước cost, `[sim]` hiển thị `cost=10`) → **0 match**, entry chờ `ttl−1`; biến thể `{"w":[59,50],"dir_cos":0.1}` → residual 9 ≤ 10 nhưng `dir_cos 0.1 < 0.25` → reject `direction`.
- **Storyboard**: điểm `pred` + vòng radius; 2 ứng viên chấm; **dải gate cứng** chạy trước (residual→appearance→size→dir) rồi mới tới thanh cost 4-term; solver tô cặp thắng; nút "đẩy cả hai ra xa" → lý do `prediction_distance` + entry đếm TTL; bảng realtime: `residual | app | size | dir | gate_reason | cost | match`; pseudo-line 1–4. Giải thích VN: "bán kính và các gate là cổng cứng chạy trước, cost 0.55/0.30/0.10/0.05 chỉ phân xử ai thắng trong cổng".
- **Thư viện ngoài**: `lap.lapjv` [code] — demo solver exact.

#### E5. `overlap-simultaneous-pairing` — Khớp xe hiện đồng thời ở vùng overlap
- **Nhóm**: CrossCam · **Tiên quyết**: E1 · **Liên quan**: E4, E9
- **Code**: `backend/main_detect/src/techgar/cross_camera_manager.py:6312-6356` `_match_simultaneous_overlap`; `:6206-6311` `_match_unbound_cross_camera_pairs`; `:4022-4315` `_match_unique_unbound_cross_camera_tracks`; `:6568-6594` `_merge_all_nearby_active_duplicates`.
- **Vai trò**: khi hai track (mỗi cam một) **chưa bind** mà điểm world trùng vùng overlap → đó là cùng một xe → gán về 1 `global_id` ngay, không cần chờ handoff. **Ba đường phân biệt** bị dễ trộn — KHÔNG được gộp:
- **Input**: `unbound tracks` 2 cam + `world` points + `radius` + `camera_transforms`. **Output**: `merge | bind | skip` theo đường.
- **Pseudocode** — **đường A: calibrated unique-unbound** (`_match_unique_unbound_cross_camera_tracks` :4022-4315, chạy khi đã calibrate):
  1. Với mỗi cặp unbound (camA, camB): `d = ‖worldA − worldB‖ ≤ radius` + gate camera-aware size/appearance + probation.
  2. Yêu cầu **duy nhất hai chiều** (A chỉ có B trong radius và B chỉ có A) — điều kiện này **chỉ tồn tại ở đường này**.
  3. Duy nhất → bind cùng GID; mập mờ → không merge frame này.
- **Pseudocode** — **đường B: pair→GID mới greedy** (`_match_unbound_cross_camera_pairs` :6206-6311):
  4. Build `pair_costs` (overlap distance + appearance gates) → **sort theo cost** → duyệt: bỏ cặp đã `consumed`, bỏ cặp đã có binding, bỏ cặp `_leaves_reserved_slot` (mirror guard E6).
  5. Cặp đầu tiên đạt → mint GID mới chung. Ambiguity **được giải bằng thứ tự cost**, không phải skip.
- **Pseudocode** — **đường C: single-join legacy** (`_match_simultaneous_overlap` :6312-6356):
  6. `if self.camera_transforms: return None` — **bị vô hiệu khi đã calibrate** (docstring: calibrated dùng đường A).
  7. Track unbound của cam này `d ≤ radius` với track cam kề **đã bind GID** → **join GID có sẵn** (pixel-crop shortcut: chỉ 1 distance/histogram check, bỏ qua mọi safeguard của đường A).
- **Cấu trúc**: `pair_costs` sorted + `consumed` set; `MergeResult` (:105-114); `_local_to_global` binding map.
- **Độ phức tạp**: O(T_A·T_B) build + O(P log P) sort. **space** O(T_A+T_B+P); **[sim]**: O(n²).
- **Edge cases**: 2 xe sát nhau trong overlap → đường A: ambiguous → không merge; đường B: cặp cost thấp nhất thắng (không skip); đường C: chỉ chạy khi chưa calibrate; xe đỗ ở overlap lâu → bind ổn định lặp lại; cặp rời slot reserved → bị chặn ở đường B.
- **Failure modes**: radius lớn → đường B mint GID chung cho 2 xe song song (greedy không có mutual-uniqueness bảo vệ); đường C (legacy) bỏ qua size/appearance → merge nhầm khi uncalibrated; radius nhỏ → miss khi H lệch vài dm.
- **Thực tế vs mô phỏng**: giữ 3 đường riêng + điều kiện `camera_transforms` bật/tắt đường C. `[sim-omits]`: probation đa-frame đường A, `_bound_handoff_merge_allowed` guard khi đã bind, same-camera duplicate path (:6480+) — demo mỗi đường 1 case.
- **Sample A (đường A — merge duy nhất)**: `{"tracksA":[{"id":"a1","w":[50,50]}],"tracksB":[{"id":"b1","w":[52,50]},{"id":"b2","w":[200,50]}],"radius":10}` → **Expected** (verify): `a1↔b1` d=2 duy nhất hai chiều → **merge cùng GID** — cần đã calibrate (`camera_transforms` non-empty).
- **Sample B (đường A — mập mờ)**: `{"tracksA":[{"id":"a1","w":[50,50]}],"tracksB":[{"id":"b1","w":[52,50]},{"id":"b2","w":[54,50]}],"radius":10,"pair_costs":{"a1-b1":0.3,"a1-b2":0.5}}` → **Expected** (verify): a1 thấy cả b1 (d=2) và b2 (d=4) `≤10` → không duy nhất → đường A **không merge**; cùng input ở đường B: `min cost 0.3 → b1 thắng` (greedy không cần unique) — hai đường cho kết quả KHÁC trên cùng input.
- **Storyboard**: 3 tab đường (A-calibrated / B-greedy / C-legacy-disabled); vùng overlap + chấm world hai màu; tab A: 2 dây → "ambiguous skip"; tab B: thanh cost sort, dây rẻ nhất thắng; tab C: badge `disabled — camera_transforms set`; bảng realtime: `path | pair | d | cost | verdict`; pseudo-line tương ứng đường. Giải thích VN: "cùng một hiện tượng 'hai chấm trùng nhau' nhưng 3 policy khác nhau — duy nhất 2 chiều chỉ của đường calibrated".
- **Thư viện ngoài**: `numpy` [code].

#### E6. `global-id-allocation` — Cấp Global ID cho track confirmed
- **Nhóm**: CrossCam · **Tiên quyết**: B9, E1 · **Liên quan**: E5, E9, E10
- **Code**: `backend/main_detect/src/techgar/cross_camera_manager.py:2269-2281` `_is_allocatable`; `:2337-2419` `_new_global_id_ready`; `:399-412` `_allocate_global_id`, `_canonical_id`; `:690-746` `bind_external_id`. Defaults `obs_min=5`, `unusual_size_obs=12`, `disp_ratio=0.15` (:163-165).
- **Vai trò**: `global_id` **mới** chỉ được cấp khi track đủ chắc — chuỗi AND gate; gate này chỉ chặn **mint GID mới** (GID cũ vẫn bind tentative qua handoff/ReID — docstring :2344-2348); track chưa có GID → không bind được slot/handoff.
- **Input**: track (`confirmed`, `observation_kind`, `association_state`, `fragment_visible_count`, `displacement`, `w,h`). **Output**: `GID` mới hoặc `defer` (ghi nhận defer reason).
- **Pseudocode**:
  1. `_is_allocatable` = `confirmed` **và** `observation_kind == 'detection'` **và** `association_state ∉ {split_recovering, occluded_prediction, watershed_provisional, frozen_ambiguous, ambiguous_merged}`.
  2. `fragment_obs ≥ obs_min (5)` — legacy tracker không có `fragment_visible_count` → pass gate này.
  3. `disp ≥ max(6.0, 0.15·hypot(w,h))` — `disp` đo từ `first_observation_point`.
  4. Gate tin cậy kích thước (trusted size refs): `size_distance > 0.65` và `(obs<12 || disp<0.6·diag)` → defer. `[sim-omits]`
  5. `allocate` → `GID++`; `_bind(cam, local, GID)`; gallery/anchor khởi tạo.
- **Cấu trúc**: counter GID; map `(cam,local)→GID`; `GlobalIdentityState` (:65-104).
- **Độ phức tạp**: O(1). **space** O(G); **[sim]**: O(1).
- **Edge cases**: xe đỗ yên ngay khi vào cảnh → disp nhỏ → defer dù confirmed (đợi thêm bằng chứng, không phải từ chối); legacy tracker thiếu `fragment_visible_count` → obs gate pass (đường tương thích); GID đã cấp giữ trong identity khi lost (E10 dormant).
- **Failure modes**: `disp` gate cao → xe chậm đỗ ngay mép cảnh không bao giờ có GID (không bind slot); `obs_min` thấp → nhiễu được cấp GID → slot gán cho bóng.
- **Thực tế vs mô phỏng**: giữ chuỗi AND `allocatable` + `fragment_obs` + `disp≥max(6,0.15·diag)`. `[sim-omits]`: trusted-size gate bước 4, `bind_external_id`, defer-reason log — demo 3 gate chính; sample `disp_min:6` là **sàn**, production tính `max(6, 0.15·diag)`.
- **Sample A**: `{"track":{"state":"confirmed","obs_kind":"detection","assoc_state":"matched","fragment_obs":6,"disp":7,"bbox":[0,0,10,5]},"obs_min":5,"disp_ratio":0.15}` → **Expected** (verify): allocatable ✓ (3 điều kiện); `disp_min = max(6, 0.15·√125=1.68) = 6`; `obs 6≥5` **và** `disp 7≥6` → **`GID` mới** — CẢ HAI phải đạt, không có "hoặc".
- **Sample B (biên — thiếu một chân)**: `{"track":{"state":"confirmed","obs_kind":"detection","assoc_state":"matched","fragment_obs":4,"disp":7}}` → **Expected**: `obs 4 < 5` → **defer** — chưa cấp GID mới dù disp đủ; cùng input `assoc_state:"occluded_prediction"` → defer ngay từ gate 1 (blocklist).
- **Storyboard**: thẻ track với 2 thanh `obs`/`disp` nạp đến vạch + chip `assoc_state` (xám nếu thuộc blocklist); đủ cả chuỗi AND → tem `GID#n` dán lên; thiếu một chân → badge vàng `defer`; bảng realtime: `confirmed | kind | state | obs | disp | verdict`; pseudo-line 1–5. Giải thích VN: "GID mới là căn cước toàn cục — chỉ cấp khi track chứng minh đủ lâu VÀ đủ xa, một gate hỏng là defer".
- **Thư viện ngoài**: không trực tiếp.

#### E7. `dormant-identity-reid` — Hồi sinh identity ngủ qua cửa ReID
- **Nhóm**: CrossCam · **Tiên quyết**: B11, E1, E6 · **Liên quan**: E8, E10, D9
- **Code**: `backend/main_detect/src/techgar/cross_camera_manager.py:4911-5747` `_match_dormant_identities`; gate helpers `:4659-4910` (`_same_camera_recovery_is_stale` :4659-4692, `_reachable_distance_limit` :4693-4712, `_dormant_candidate_distance_limit` :4713-4790, `_identity_is_established` :4791-4808, `_has_durable_turnaround_proof` :4809-4893, `_predicted_identity_world` :4894-4910).
- **Vai trò**: track mới không khớp entry/active → so với các identity `dormant` (đã mất nhưng chưa exited) qua chuỗi gate: **khoảng cách reachable, thời gian, appearance, size, hướng, topology** — hồi sinh đúng `global_id` thay vì cấp mới.
- **Input**: track mới + `dormant identities`; ngưỡng `reachable_limit`, `app_max`, `size`, `stale_s` [~config]. **Output**: `revived GID | new GID | defer`.
- **Pseudocode**:
  1. Với mỗi dormant: `limit = _reachable_distance_limit(id, elapsed)`; `d > limit` → skip.
  2. Same-camera: nếu `elapsed > stale_s` và track vẫn đang di chuyển → `stale` → skip (không hồi sinh cùng cam).
  3. `app_d`, `size_d`, `dir_cos`, topology (cam có kề?) → fail → reject ghi nhận.
  4. Qua hết → `revive`: bind lại GID, gallery cập nhật.
- **Cấu trúc**: `GlobalIdentityState.dormant`; `DirectionReIDClaim` (:116-128); rejection log.
- **Độ phức tạp**: O(D·k) dormant × gates. **space** O(D); **[sim]**: O(D).
- **Edge cases**: xe đỗ lâu bị mất track → reentry cùng cam SAU stale window → không revive (phải proof bền: `_has_durable_same_camera_reentry_proof` :4844+); identity established (đỗ lâu/di chuyển xa đã chứng minh) → nới gate — turnaround/reentry có bằng chứng bền được qua.
- **Failure modes**: appearance giống nhau (2 xe cùng màu) → revive nhầm; reachable limit chặt → xe quay lại sau tắc đường thành GID mới (duplicate).
- **Thực tế vs mô phỏng**: giữ chuỗi gate + stale same-cam + established exception khái niệm. `[sim-omits]`: durable-proof đa điều kiện (turnaround/reentry cụ thể), `_dormant_near_miss_candidate` — demo 4 gate + 1 ngoại lệ.
- **Sample A (thường — revive)**: `{"dormant":{"gid":7,"last_w":[60,60],"elapsed_s":2},"track":{"w":[68,60],"app":0.1},"reachable_limit":40,"app_max":0.62,"size_min":0.6}` → **Expected** (verify): `d=8 ≤ 40`, `app≤max` → **`revive GID 7`**.
- **Sample B (biên — stale cùng cam)**: `{"elapsed_s":13,"stale_s":12,"still_moving":true,"same_cam":true}` → **Expected**: `13 > 12` và vẫn di chuyển → **`stale` → skip → cấp GID mới** — hồi sinh cùng cam sau quá lâu bị cấm.
- **Storyboard**: danh sách dormant-cards (gid, last pos, elapsed); track mới quét từng card qua cổng gate xếp hàng; card pass → dải "revived"; stale → dấu đỏ; bảng realtime: `d | elapsed | app | gates | verdict`; pseudo-line 1–4. Giải thích VN: "hồi sinh khó hơn match handoff — phải qua nhiều gate vì bằng chứng quỹ đạo đã đứt".
- **Thư viện ngoài**: `numpy` [code].

#### E8. `world-trajectory-match` — Khớp quỹ đạo world với fragment
- **Nhóm**: CrossCam · **Tiên quyết**: E1 · **Liên quan**: E7, D9
- **Code**: `backend/main_detect/src/techgar/trajectory_memory.py:48-546` `WorldTrajectoryMemory` (`_estimate` :241-294, `match` :306-423, `match_departure` :424-538, `_point_segment_distance` :295-305); `cross_camera_manager.py:5748-6205` `_match_world_trajectory_identities`.
- **Vai trò**: lưu **quỹ đạo world có timestamp** của từng identity (provisional tách riêng global — `:99-138`); fragment mới được so với quỹ đạo → nếu `score` vượt ngưỡng + hướng đúng → match — bằng chứng mạnh hơn điểm đơn.
- **Input**: `fragment samples [(t,world)]`, `trajectory[]` + `vel_est`, `limit`, `score_min`, `min_dir`. **Output**: `score | reject(stable_wrong_direction/…)`.
- **Pseudocode**:
  1. `_estimate` quỹ đạo: fit `vel` + last point.
  2. Hard rejects (`:387-393`): `corridor_distance > radius` → `teleport`; `topology_score ≤ 0` → `camera_topology`; `stable` (đủ `min_observations`) **và** `dir_cos < min_direction_cosine` → `stable_wrong_direction`.
  3. `score = 0.35·distance_score + 0.25·appearance + 0.15·direction + 0.10·speed + 0.10·min(time_score, topology) + 0.05·size` — **6 term, literal** (`:395-401`).
  4. `score ≥ score_min` → match → evidence cho E7/D10.
- **Cấu trúc**: `TrajectorySample` (:15-24), `TrajectoryEstimate` (:25-35), `TrajectoryMatchEvidence` (:36-47); hai kho provisional/global.
- **Độ phức tạp**: O(n_samples·traj). **space** O(samples); **[sim]**: O(n).
- **Edge cases**: fragment quá ít mẫu → `stable=false` → `dir_cos` xấu cũng không hard-reject (thiếu bằng chứng → defer); `topology_score ≤ 0` (cam không kề/không reachable) → reject `camera_topology` bất kể điểm số; quỹ đạo cũ → `time_score` giảm kéo score xuống.
- **Failure modes**: quỹ đạo một mình không đủ chứng minh (SPEC/dossier yêu cầu: quỹ đạo + các gate khác, không phải trajectory-only); xe rẽ U → `dir_cos` âm → miss dù đúng xe; topology stale (camera đổi cấu hình) → reject `camera_topology` cho ứng viên đúng.
- **Thực tế vs mô phỏng**: giữ fit vận tốc + 3 hard reject + **score 6 term** trên. `[sim]`: badge/score demo có thể gộp còn 3 term (distance/appearance/direction) cho dễ đọc — `[sim-omits]` **speed, time, topology, size** bị gấp lại; min(time,topology) lấy nhánh yếu hơn.
- **Sample A (thường — match, đủ 6 term)**: `{"scores":{"distance":0.8,"appearance":0.6,"direction":0.9,"speed":0.7,"time":0.5,"topology":0.4,"size":0.9},"score_min":0.5}` → **Expected** (verify): `min(time,topology)=0.4` → `score = 0.35·0.8 + 0.25·0.6 + 0.15·0.9 + 0.10·0.7 + 0.10·0.4 + 0.05·0.9 = 0.28+0.15+0.135+0.07+0.04+0.045 = 0.72 ≥ 0.5` → **match**. `[sim]` 3-term `(dir 0.9, dist 0.8, app 0.6)` với `w=[0.5,0.3,0.2]` cho `0.45+0.24+0.12 = 0.81` — chỉ là giản lược.
- **Sample B (biên — hard reject không qua score)**: `{"dir_cos":-0.99,"stable":true,"min_dir":0.25}` → **Expected** (verify): `stable && dir_cos < min_dir` → **`stable_wrong_direction` reject cứng**; biến thể `{"topology_score":0}` → **`camera_topology` reject** — cả hai bất kể score.
- **Storyboard**: quỹ đạo world là đường đứt nét + mũi vel; fragment chấm mới + mũi; **3 thẻ hard-reject** (teleport/camera_topology/stable_wrong_direction) chặn trước; thanh score đủ 6 segment có trọng số; bảng realtime: `teleport? | topo | dir_cos | 6-term score | verdict`; pseudo-line 1–4. Giải thích VN: "gate cứng sàng trước, score 6 thành phần chỉ phân xử khi đã qua cổng".
- **Thư viện ngoài**: `numpy` [code].

#### E9. `merge-alias-resolution` — Gộp GID trùng và giải quyết alias
- **Nhóm**: CrossCam · **Tiên quyết**: E5, E6, E7 · **Liên quan**: E10
- **Code**: `backend/main_detect/src/techgar/cross_camera_manager.py:1201-1365` `_merge_global_ids`; `:404-411` `_canonical_id`; `trajectory_memory.py:138-157` `merge`; `_resolve_same_camera_global_conflicts` :3125+, `_resolve_cross_camera_global_conflicts` :3226+.
- **Vai trò**: khi merge xảy ra, `GID` trùng được trỏ về **canonical** (nhỏ nhất/được chọn) — map alias đảm bảo mọi truy vấn trả về cùng identity; merge copy gallery/trajectory/reservation.
- **Input**: `gid_a, gid_b` + merge reason; alias map. **Output**: `canonical gid` + state đã hợp nhất.
- **Pseudocode**:
  1. `canonical = min/resolve(a,b)` theo rank; `alias[dup] = canonical`.
  2. `_canonical_id` follow chuỗi alias → root.
  3. Gộp: gallery, trajectory (`trajectory.merge`), parked reservation, member tracks.
  4. Conflict ngược (2 cam cùng GID không merge được) → resolve theo `member_rank`.
- **Cấu trúc**: `alias: dict`, `GlobalIdentityState`; `MergeResult`.
- **Độ phức tạp**: chain lookup O(depth) ~O(1) amortized; merge O(gallery+traj). **space** O(G) alias; **[sim]**: O(n).
- **Edge cases**: merge 2 GID đều có parked reservation → conflict → resolve (reservation duy nhất); chuỗi alias A→B→C → `_canonical_id` trả C; merge cùng id → no-op.
- **Failure modes**: merge sai một lần → hai xe thực dính chung GID vĩnh viễn (không có un-merge — rủi ro thiết kế); conflict resolution chọn sai owner → swap ID ngược.
- **Thực tế vs mô phỏng**: giữ alias chain + canonical + gộp gallery. `[sim-omits]`: conflict resolver đa rank, `_reconcile_dormant_duplicates` — demo merge đơn.
- **Sample A**: `{"pairs":[["bind","cam1",3,7],["bind","cam2",1,7],["bind","cam2",2,9]],"merge":[7,9]}` → **Expected**: `alias[9]=7` → truy vấn `cam2#2` → `canonical(9) = 7` — hai fragment giờ cùng GID 7.
- **Sample B (biên — chuỗi)**: `{"alias":{"9":7,"11":9}}` → **Expected**: `canonical(11) = canonical(9) = 7` — chuỗi alias phải follow hết.
- **Storyboard**: node GID là vòng tròn, merge kéo 2 node lại → node phụ mờ + mũi tên alias về node sáng; truy vấn `canonical(11)` đi theo 2 bước; bảng realtime: `alias | canonical`; pseudo-line 1–4. Giải thích VN: "alias như bút danh — tra cứu nào cũng về đúng tên thật".
- **Thư viện ngoài**: không trực tiếp.

#### E10. `global-identity-lifecycle` — Vòng đời identity: active→handoff/dormant→exited/expired
- **Nhóm**: CrossCam · **Tiên quyết**: E6, E7, E9 · **Liên quan**: D11
- **Code**: `backend/main_detect/src/techgar/cross_camera_manager.py:534-689` `_observe_identity`, `_set_identity_dormant`, `_mark_identity_exited`; `:6995-7074` `_refresh_identity_states`; `:7560-7610` exit/cleanup→`expired`; `:846-1027` `sync_parked_reservations`; `:5657` revive→active.
- **Vai trò**: mỗi `global_id` có state: `active` (đang thấy) → `handoff` (mất ở cam nguồn, entry chờ) → `dormant` (mất hẳn, còn cửa revive) → **hai terminal phân biệt**: `exited` (track expire **trong exit-zone** — xe đi ra thật) vs `expired` (quá retention trong `cleanup` — hết hạn nhớ). `parked`/`recovery_pending`/`parking_verification_pending` là **giá trị state thật** bị ghi đè lên `identity.state` khi có reservation/provisional hold — dormant-clock bị reset, không phải cờ phụ trên dormant.
- **Input**: observation per frame + exit-zone + retention windows + `_parked_reservations`/`_provisional_identity_holds`. **Output**: state transitions + `identity{state, last_seen}`.
- **Pseudocode**:
  1. `observe` → `active` + refresh `last_seen`, gallery, anchor.
  2. Refresh mỗi frame: reservation → `state = parked|recovery_pending` (ghi đè + clear `dormant_since`); provisional hold → `parking_verification_pending`; ngược lại track mất: `handoff` nếu `canonical gid ∈ _handoffs` else `dormant` (bắt đầu đếm `dormant_since`).
  3. `exited`/`expired` bị skip trong refresh — không tự revive.
  4. Track expire trong exit-zone → `exited`; `cleanup` quá retention (dormant/handoff) → `expired` — hai cách kết thúc khác nhau.
  5. Dormant được revive (E7) → `active` lại.
- **Cấu trúc**: `GlobalIdentityState{state, members, galleries, dormant_since_frame/time}` (:65-104).
- **Độ phức tạp**: O(G) refresh. **space** O(G); **[sim]**: O(G).
- **Edge cases**: xe đỗ ngày → `state="parked"` ghi đè + dormant clock reset vô hạn (đúng — xe đỗ vẫn của GID); `lost` kéo dài quá retention → `expired` (khác `exited` — không qua exit-zone); exited/expired → GID không tái dùng, không tự revive.
- **Failure modes**: retention ngắn → xe bị che lâu → `dormant→expired` sớm → quay lại thành GID mới (duplicate); `parked` reservation lỗi → `state` bị kẹt `parked` dù xe đã đi → identity sống ảo.
- **Thực tế vs mô phỏng**: giữ state đầy đủ + 2 terminal + reservation-override. `[sim-omits]`: `bind_external_id`, `_identity_retention_elapsed` đa điều kiện, `recovery_pending` chi tiết — demo giữ `active/handoff/dormant/exited/expired/parked`.
- **Sample A**: `{"events":["obs@0","lost@1","entry@1","entry_ttl@4","dormant@4","revive@6"]}` → **Expected**: `active(0) → handoff(1) → dormant(4) → active(6)` — hồi sinh đúng GID.
- **Sample B (biên — hai cách kết thúc)**: `{"events":["obs@0","lost@1","exit_zone@2"]}` → **Expected**: `active → exited(2)` (qua exit-zone → đóng, không dormant/revive); biến thể `{"lost@1", retention_hết@30}` → **`expired`** — `exited` ≠ `expired`: exited = thấy xe đi ra, expired = mất dấu quá lâu.
- **Storyboard**: state machine 6 nút; `parked` là nút ghi đè màu tím nuốt dormant (dormant clock về 0); hai nút terminal `exited` (cổng ra) vs `expired` (đồng hồ hết pin) khác biểu tượng; bảng realtime: `event | state | dormant_since`; pseudo-line 1–5. Giải thích VN: "dormant là bệ phóng hồi sinh — parked ghi đè giữ sống, exited/expired là hai cái chết khác nhau".
- **Thư viện ngoài**: `cv2`/`numpy` [code].

### Nhóm F — Calibration & Timing (F1–F9)

#### F1. `homography-fit-distributed` — Fit homography pixel→world phân tán
- **Nhóm**: Calibration · **Tiên quyết**: cặp điểm đánh dấu (A-D) · **Liên quan**: F2, F3, E1
- **Code**: `backend/main_detect/tools/calibrate_shared_map.py:396-511` `compute_distributed_shared_homographies`; `:512-560` `compute_homography`; `:562-571` `transform_polygon`; `:695-723` `distributed_fit_coverage`.
- **Vai trò**: từ các cặp điểm `(pixel ↔ world_cm)` đánh dấu tay → fit `H_cam→world` (least-squares/RANSAC) cho từng camera trên bản đồ chung — nguồn của mọi phép chiếu E1.
- **Input**: `pairs[] {(u,v)→(X,Y)}` (≥4/cam), `image_size`, chế độ fit (direct/RANSAC/all-pairs). **Output**: `H[3×3]` per cam + residual metrics.
- **Pseudocode**:
  1. Chuẩn hoá điểm (`_pixel_normalizer` :357-364) về kích thước chuẩn.
  2. `cv2.findHomography` (0=LS / RANSAC) → `H`; all-pairs mode gom mọi cặp shared.
  3. `residual_i = ‖H·p_i − P_i‖`; `p95`, `max`, `det(H)`.
  4. `det ≈ 0` → fit thoái hoá → reject.
- **Cấu trúc**: `H` 3×3; measurements dict; diagnostics.
- **Độ phức tạp (code)**: O(n) DLT + O(n·iters) RANSAC. **space** O(n) pairs; **[sim]**: O(n) DLT 4 điểm.
- **Edge cases**: <4 cặp → không fit được; điểm thẳng hàng → rank thiếu → `det≈0`; điểm chỉ tụ 1 góc → H đúng cục bộ, extrapolation méo (F2/F5 đo).
- **Failure modes**: đánh dấu sai 1 điểm → LS lệch toàn cục (RANSAC cứu được nếu nhiều inlier); normalized khác kích thước → H áp dụng sai tỉ lệ (F5).
- **Thực tế vs mô phỏng**: giữ cặp điểm→H + residual + det-check. `[sim-omits]`: RANSAC vòng lặp, normalization ma trận — demo DLT 4 điểm exact.
- **Sample A**: `{"pairs":[[0,0,10,20],[5,0,20,20],[0,5,10,30],[5,5,20,30]]}` (cột: u,v,X,Y) → **Expected** (verify): `H = diag(2,2,1) + T(10,20)` khôi phục đúng → `residual = 0`.
- **Sample B (biên — thiếu điểm)**: `{"pairs":[[0,0,10,20],[5,0,20,20],[0,5,10,30]]}` → **Expected**: `n=3 < 4` → **reject "need ≥4 pairs"** — không fit.
- **Storyboard**: hai panel px/world, 4 cặp điểm nối; lưới ảnh méo theo H khi kéo 1 điểm; thanh residual/p95; nút "xóa 1 điểm" → reject; bảng realtime: `n | p95 | max | det`; pseudo-line 1–4. Giải thích VN: "4 điểm không thẳng hàng định nghĩa phép chiếu — thiếu là không đủ".
- **Thư viện ngoài**: `cv2.findHomography` [code] — demo DLT giản lược.

#### F2. `rectangle-line-fit-gate` — Cổng chấp nhận fit theo vạch kẻ
- **Nhóm**: Calibration · **Tiên quyết**: F1 · **Liên quan**: F3, F5
- **Code**: `backend/main_detect/tools/rectangle_line_calibration.py:24-40` `_line_geometry`; `:41-111` `compute_rectangle_line_homographies`; `:112-129` `fit_gate`; `:130-143` `approve_rectangle_line_calibration`.
- **Vai trò**: fit H từ **vạch kẻ ô đỗ hình chữ nhật** (không cần điểm A-D) rồi **gate**: p95 pixel residual ≤ `8.5`, max ≤ `12`, sai số world ≤ `2 cm` — chỉ khi qua mới được `approve` ghi vào calibration dùng chạy.
- **Input**: line geometry (đoạn vạch kẻ theo px/cm), diagnostics. **Output**: `H` + `reasons[]` gate; approve/copy file.
- **Pseudocode**:
  1. `_line_geometry` mỗi vạch → đoạn thẳng + hướng.
  2. Fit H từ cặp đường/điểm của rectangle → H + residuals (px & cm).
  3. `fit_gate`: `p95_px > 8.5 | max_px > 12 | err_cm > 2.0` → `reasons[]` (literal signature `:112`).
  4. `approve` = chỉ khi `reasons` rỗng + reviewed thủ công → copy vào config.
- **Cấu trúc**: report dict; gate list.
- **Độ phức tạp**: O(n) lines + fit. **space** O(n); **[sim]**: O(n).
- **Edge cases**: residual vừa ngưỡng → pass nhưng chất lượng mép → vẫn cần mắt người duyệt (`approve` là bước manual, không tự động); vạch nghiễu → fit đẹp px nhưng sai cm — hai ngưỡng bắt hai chiều.
- **Failure modes**: duyệt vội (bỏ qua preview) → calibration sai được promote; `reasons` bị bỏ qua khi approve tay → không có chặn thứ hai.
- **Thực tế vs mô phỏng**: giữ 3 ngưỡng literal + approve manual. `[sim-omits]`: geometry vạch đầy đủ — demo nhận `diagnostics` sẵn.
- **Sample A**: `{"diag":{"p95_px":7,"max_px":11,"err_cm":1.8}}` → **Expected** (verify): `reasons=[]` → **gate pass** (dưới cả 3 ngưỡng 8.5/12/2.0).
- **Sample B (biên — vượt p95)**: `{"diag":{"p95_px":9,"max_px":11,"err_cm":1.8}}` → **Expected**: `reasons=["pixel p95 9.0 > 8.5"]` → **gate fail — không được approve**.
- **Storyboard**: ảnh vạch kẻ + H preview đè lên ô đỗ; ba thanh ngưỡng (p95/max/cm) đổ đỏ khi vượt; nút approve chỉ sáng khi `reasons` rỗng; bảng realtime: `p95 | max | cm | reasons`; pseudo-line 1–4. Giải thích VN: "fit đẹp theo pixel chưa chắc đúng theo cm — hai hệ đo hai cổng, người duyệt là cổng cuối".
- **Thư viện ngoài**: `cv2`/`numpy` [code].

#### F3. `calibration-load-validation` — Kiểm tra calibration khi nạp
- **Nhóm**: Calibration · **Tiên quyết**: F1/F2 · **Liên quan**: F5, E1
- **Code**: `backend/main_detect/two_camera.py:284-343` `load_calibration` (đọc file, check det/status, trả transforms/H/anchors/meta).
- **Vai trò**: calibration file chỉ được nạp khi qua **toàn bộ** chuỗi gate: `reviewed_line_fit` đủ điều kiện (chỉ cho `rectangle_line_v1`) HOẶC `calibration_status="passed"`, đúng 2 transform khả nghịch, edge-adjacency khớp topology, overlap polygon hợp lệ — chặn pipeline chạy trên bản nháp/H vô sinh. **`status="reviewed_fit"` một mình KHÔNG đủ** — nó chỉ có nghĩa trong nhánh `rectangle_line_v1` kèm `visual_review.accepted` + `fit_gate` sạch.
- **Input**: `calibration.json` (schema v5). **Output**: `(matrices{cam1,cam2}, adjacency, overlap{(cam1,cam2):poly}, exit_zones)` hoặc `ValueError`.
- **Pseudocode** (`two_camera.py:284-343`):
  1. Đọc JSON. Nếu `calibration_algorithm == "rectangle_line_v1"`: `reviewed_line_fit = (status=="reviewed_fit") ∧ visual_review.accepted ∧ report.status=="fit_ready" ∧ report.point_count==8 ∧ cameras=={cam1,cam2} ∧ ¬fit_gate(report, cameras, max_error_cm_limit)` (`:287-300`) — sai một điều kiện → `ValueError("chua duoc xem/xac nhan hoac fit khong dat")`.
  2. `schema_version ≥ 5` **và** `status != "passed"` **và** `¬reviewed_line_fit` → reject (`:301-304`) — đây là lý do `reviewed_fit` standalone bị từ chối.
  3. `camera_transforms` keys **phải đúng** `{cam1, cam2}` (`:306-307`); mỗi H: shape 3×3, finite, `|det| ≥ 1e-12` (`:309-316`).
  4. `edge_adjacency` phải **đúng** `{cam1:right→cam2, cam2:left→cam1}` (`:318-320`); thiếu/thừa cạnh → reject.
  5. Overlap polygon (fitted nếu `reviewed_line_fit`, ngược lại validated/overlap) ≥3 điểm N×2 finite (`:322-331`); `exit_zones` per-cam: camera hợp lệ + polygon ≥3 điểm (`:332-340`).
  6. Build `H⁻¹` cho `_local` (E1).
- **Cấu trúc**: dict transforms; adjacency map; polygon + exit_zones; H⁻¹ cache.
- **Độ phức tạp**: O(1) + O(P) validate polygon. **space** O(P); **[sim]**: O(1).
- **Edge cases**: `status="reviewed_fit"` nhưng thiếu `visual_review.accepted` hoặc `point_count≠8` → reject (gate 1); `status="draft"`/`"fit_ready"` → gate 2 reject; thiếu `camera_transforms["cam2"]` → reject; adjacency bị đảo (`cam1:left→cam2`) → reject; overlap polygon 2 điểm → reject.
- **Failure modes**: sửa tay `status="passed"` trong JSON → vượt gate 2 (không có chữ ký/hash — rủi ro quy trình đã ghi); H `|det|` vừa trên `1e-12` → chiếu nhạy nhiễu nhưng vẫn pass; `fitted_ground_overlap` dùng cho reviewed-fit, khác `validated_ground_overlap` — trộn hai field là bug nhẹ nhàng.
- **Thực tế vs mô phỏng**: giữ gate đầy đủ như trên. `[sim]`: demo gom thành checklist hiển thị; `[sim-omits]`: `fit_gate` internals (`tools/rectangle_line_calibration`), exit-zone polygon detail — demo đếm điều kiện boolean.
- **Sample A (schema-v5 đầy đủ, status passed)**: `{"schema_version":5,"calibration_status":"passed","camera_transforms":{"cam1":[[2,0,10],[0,2,20],[0,0,1]],"cam2":[[3,0,5],[0,3,7],[0,0,1]]},"edge_adjacency":[{"source_camera":"cam1","exit_edge":"right","target_camera":"cam2"},{"source_camera":"cam2","exit_edge":"left","target_camera":"cam1"}],"overlap_world_polygon":[[0,0],[100,0],[100,50],[0,50]],"exit_zones":[]}` → **Expected** (verify): gate 2 pass (`passed`); det cam1=4, cam2=9 đều `≥1e-12`; keys đúng `{cam1,cam2}`; adjacency khớp; polygon 4 điểm → **load ok**.
- **Sample B (biên — `reviewed_fit` standalone)**: `{"schema_version":5,"calibration_status":"reviewed_fit","camera_transforms":{"cam1":[[2,0,10],[0,2,20],[0,0,1]],"cam2":[[3,0,5],[0,3,7],[0,0,1]]},"edge_adjacency":[{"source_camera":"cam1","exit_edge":"right","target_camera":"cam2"},{"source_camera":"cam2","exit_edge":"left","target_camera":"cam1"}],"overlap_world_polygon":[[0,0],[1,0],[1,1]]}` → **Expected** (verify): không có `calibration_algorithm=="rectangle_line_v1"` → `reviewed_line_fit=false` → gate 2: `status != "passed" && !reviewed_line_fit` → **REJECT** — `reviewed_fit` một mình không mở được cửa; cùng file + `calibration_algorithm:"rectangle_line_v1"` nhưng thiếu `visual_review.accepted` → vẫn reject ở gate 1.
- **Storyboard**: file JSON chảy qua **5 trạm kiểm** xếp hàng: reviewed_line_fit→status→transforms→adjacency→polygons; mỗi trạm đèn xanh/đỏ + reason; toggle `status` giữa `passed`/`reviewed_fit`/`draft` để thấy `reviewed_fit` tắt đèn ở gate 2 trừ khi nhánh rectangle đủ điều kiện; bảng realtime: `algorithm | status | reviewed_fit? | det(cam1,cam2) | adjacency | verdict`; pseudo-line 1–6. Giải thích VN: "dấu reviewed_fit chỉ là vé vào của riêng nhánh rectangle-line — không có đủ điều kiện thì vẫn bị chặn như bản nháp".
- **Thư viện ngoài**: `numpy` [code].

#### F4. `matching-distance-derivation` — Suy bán kính match từ kích thước ô
- **Nhóm**: Calibration · **Tiên quyết**: F3 · **Liên quan**: E4, E5, D9
- **Code**: `backend/main_detect/two_camera.py:395-413` `median_slot_length`; `:415-424` `derive_matching_defaults`; `:426-448` `resolve_matching_distance`.
- **Vai trò**: ngưỡng khoảng cách identity (handoff/dormant/duplicate) không hard-code cm mà **suy từ cạnh dài median của ô đỗ** trong calibration — `SLOT_MATCHING_MULTIPLES` khác nhau theo use-case; `resolve_matching_distance` hợp CLI/config/derived với policy **ceiling**: calibration có thể siết ngưỡng nhưng **không được vượt** ngưỡng suy từ slot đo được.
- **Input**: `parking_slots_world` (polygons); `override`, `configured`, `fallback` per-name. **Output**: distance per `{handoff_match_distance, handoff_prediction_radius, dormant_match_distance, cross_camera_duplicate_distance}`.
- **Pseudocode**:
  1. Với mỗi slot polygon ≥3 điểm: `(w,h) = cv2.minAreaRect(points)` → `length = max(w,h)` — **cạnh dài của min-area-rect**, không phải độ dài tuỳ ý (`:395-412`).
  2. `med = median(lengths)`; `None` khi không có slot hợp lệ.
  3. `derived[name] = round(med · MULT[name], 3)` với `MULT = {handoff_match:1.75, prediction_radius:2.75, dormant_match:1.75, duplicate:0.50}` (`:387-392`, literal).
  4. `resolve(name, override, configured, derived, fallback)` (`:426-448`): `override` có → thắng tuyệt đối; `configured=None` → `derived` (hoặc `fallback`); `derived=None` → `configured`; **cả hai có → `min(configured, derived)`** — ceiling: configured không được phình quá slot-derived.
- **Cấu trúc**: `SLOT_MATCHING_MULTIPLES` dict literal; scalar per-name; list cạnh dài.
- **Độ phức tạp**: O(S·k²) minAreaRect (k=đỉnh/slot) + O(S log S) median. **space** O(S); **[sim]**: O(S).
- **Edge cases**: `med = None` (slots rỗng/không polygon hợp lệ) → `derive_matching_defaults` trả `{}` → resolve rơi về `fallback`; `configured < derived` → siết được (min chọn configured); `configured > derived` → **bị chặt về derived** — cấu hình tay không thể nới quá kích thước xe đo được.
- **Failure modes**: polygon ô sai → median lệch → 4 ngưỡng cùng lệch tỉ lệ (handoff miss/nhầm dây chuyền); slot là hình thoi méo → `minAreaRect` cạnh dài ≠ trục xe; `fallback` quá lớn che mất calibration khi file lỗi.
- **Thực tế vs mô phỏng**: giữ minAreaRect→median→4 multiples + `min()` ceiling. `[sim]`: demo cho `slot_long_edges` đã trích sẵn (bỏ bước minAreaRect); `[sim-omits]`: nested groups dict, `round(·,3)` — hiển thị số đẹp.
- **Sample A (derive — literal multiples)**: `{"slot_long_edges":[400,500,600,520,480]}` → **Expected** (verify): `median = 500` → `handoff_match = 500·1.75 = 875`, `prediction_radius = 500·2.75 = 1375`, `dormant_match = 875`, `duplicate = 500·0.5 = 250` — **4 giá trị khác nhau từ cùng median**.
- **Sample B (biên — resolve ceiling)**: `{"name":"handoff_match","configured":1000,"derived":875,"fallback":600}` → **Expected** (verify): `min(1000, 875) = 875` — configured không thể vượt slot-derived; biến thể `configured:700` → `min(700,875) = 700` (siết được); `override:300` → `300` bất kể hai giá trị kia; `configured:null,derived:null` → `fallback 600`.
- **Storyboard**: slot polygons → minAreaRect xoay ôm từng ô → cạnh dài vào list → median sáng; **4 thẻ ngưỡng** nhân multiples khác nhau; panel resolve: 3 nguồn override/configured/derived → nút `min()` chặn configured vượt derived (icon trần nhà); bảng realtime: `lengths | median | MULT·name | configured | derived | resolved`; pseudo-line 1–4. Giải thích VN: "ngưỡng match phải theo kích thước xe thật — và cấu hình tay chỉ được siết chứ không được nới quá thước đo".
- **Thư viện ngoài**: `numpy` median [code].

#### F5. `frame-size-adaptation` — Thích nghi calibration khi độ phân giải đổi
- **Nhóm**: Calibration · **Tiên quyết**: F3 · **Liên quan**: F3, E1
- **Code**: `backend/main_detect/two_camera.py:344-394` `adapt_calibration_to_frame_sizes`.
- **Vai trò**: calibration ghi ở độ phân giải X nhưng stream chạy Y → scale H cho khớp. **Không có gate "lệch % kích thước"** — uniform resize được adapt bất kể độ lớn; chỉ chặn **hai lỗi hình học**: khác tỉ lệ khung (aspect) hoặc resize không đều hai trục (non-uniform) — vì đó là dấu hiệu crop/góc quay khác chứ không phải resize.
- **Input**: `calibration` (có `cameras[cam].width/height` gốc), `frame_sizes` runtime. **Output**: `adapted` transforms hoặc `ValueError`.
- **Pseudocode** (`two_camera.py:344-394`):
  1. Thiếu `source.width/height` → bỏ qua cam đó (`:356-358`).
  2. `aspect_src = calib_w/calib_h`, `aspect_rt = run_w/run_h`; `|aspect_src − aspect_rt| > 0.005` → `ValueError("khac ti le runtime … khong duoc dung map cho crop/goc quay khac")` (`:364-369`).
  3. `sx = calib_w / run_w`, `sy = calib_h / run_h`; `|sx − sy| > max(sx,sy)·0.005` → `ValueError("runtime resize khong dong deu")` (`:371-374`).
  4. `H' = transform @ diag(sx, sy, 1)` — **nhân PHẢI** (`H @ S`: runtime-px `→S→` calib-px `→H→` world; chỉ 2 cột đầu của H bị scale, cột translation — vốn đã ở calib-px — **giữ nguyên**) (`:375-378`).
- **Cấu trúc**: scale matrix diag(sx,sy,1); adapted copy (transforms khác không đổi).
- **Độ phức tạp**: O(1)/cam. **space** O(1); **[sim]**: O(1).
- **Edge cases**: `sx=sy` (uniform — kể cả 0.5× hay 2×) → adapt bình thường; `sx≠sy` nhưng sai số ≤0.5% tương đối → qua (coi như uniform); cùng W nhưng khác H (crop dọc) → aspect đổi → reject; `frame_sizes` thiếu cam → cam đó không được kiểm.
- **Failure modes**: metadata video báo sai frame size → scale âm thầm (H' lệch toàn cục); aspect sai số ngay dưới 0.005 (letterbox mỏng) → qua gate nhưng world-map lệch mép; quên `H @ S` thứ tự (viết `S @ H`) → chiếu sai khi sx≠sy.
- **Thực tế vs mô phỏng**: giữ 2 gate + `H @ S` nhân phải. `[sim]`: demo hiển thị aspect bar + sx/sy; không có `max_deviation` — tên biến đó **không tồn tại** trong code.
- **Sample A (uniform resize — adapt dù lệch lớn)**: `{"calib":{"w":1280,"h":720},"runtime":{"w":640,"h":360}}` → **Expected** (verify): aspect `1.7778` cả hai → Δ=0 ≤ 0.005; `sx = 1280/640 = 2.0`, `sy = 720/360 = 2.0`, `|sx−sy| = 0` → **adapt**: `H' = H @ diag(2,2,1)` — ví dụ `H=[[2,0,10],[0,2,20],[0,0,1]]` → `H' = [[4,0,10],[0,4,20],[0,0,1]]` — **nhân phải**: chỉ cột 0/1 scale ×2, cột translation (calib-px) không đổi (`S @ H` sẽ cho `[[4,0,20],[0,4,40],...]` — thứ tự sai).
- **Sample B (biên — hai lỗi khác nhau)**: `{"calib":{"w":1280,"h":720},"runtime":{"w":1280,"h":700}}` → **Expected** (verify): aspect `1.7778` vs `1.8286` → `Δ = 0.0508 > 0.005` → **reject crop/khác tỉ lệ**; biến thể `runtime:{640,370}`: aspect `1.7297` → Δ 0.048 > 0.005 reject *và* `sx=2.0, sy=1.946` → `|Δ|=0.054 > 2.0·0.005=0.01` → cũng reject non-uniform. (Lưu ý: `720→760` cùng tỉ lệ sẽ **adapt**, không reject — không có gate % độ lệch.)
- **Storyboard**: hai khung ảnh chồng nhau; panel aspect (2 số, vạch ±0.005) + panel sx/sy (2 thanh, vạch sai số 0.5%); trường hợp pass → `H'` hiển thị phép nhân phải `H @ diag(sx,sy,1)`; nút "uniform 2×" để thấy vẫn pass; bảng realtime: `aspect Δ | sx | sy | gate | H'`; pseudo-line 1–4. Giải thích VN: "đổi kích thước đều thì chỉ cần scale — lệch tỉ lệ hay méo trục mới là dấu hiệu calibration không còn đúng".
- **Thư viện ngoài**: `numpy` [code].

#### F6. `camera-skew-synchronization` — Đồng bộ lệch thời gian giữa 2 camera
- **Nhóm**: Timing · **Tiên quyết**: F7 · **Liên quan**: F9
- **Code**: `backend/main_detect/two_camera.py:450-483` `synchronize_live_frames`; call-site `:2087-2089`, `:2482-2484`; defaults `--max-camera-skew-ms 120.0`, `--sync-catchup-reads 3` (parser `make_parser` :1731-2003).
- **Vai trò**: khi timestamp 2 cam lệch > `max_skew` → **chủ động đọc thêm** trên stream chậm (catch-up), tối đa `max_catchup_reads` lần, cho tới khi skew trong ngưỡng — **không phải chỉ cảnh báo**; hết reads/timeout → xử lý best-effort với frame mới nhất.
- **Input**: `frames{cam:(frame,seq,ts_ns)}`, `captures`, `max_skew_ms`, `max_catchup_reads`. **Output**: `frames` cập nhật (in-place) — stream chậm tiến tới.
- **Pseudocode**:
  1. `skew = max_ts − min_ts`; `skew ≤ max_skew` → xong.
  2. Cam chậm (ts nhỏ nhất): nếu không phải `LatestFrameCapture` → dừng (không đọc thêm được).
  3. `read_latest_timed(after_sequence, timeout=0.5)` → frame mới hơn; lặp tối đa `max_catchup_reads`.
  4. `TimeoutError` → dừng; skew còn → tiếp tục pipeline với pair hiện có (best-effort).
- **Cấu trúc**: dict frames in-place; sequences/timestamps.
- **Độ phức tạp**: O(max_catchup_reads) ≤ 3 đọc. **space** O(1); **[sim]**: O(k) bước.
- **Edge cases**: cam không phải `LatestFrameCapture` → không catch-up được → giữ skew; stream không còn frame mới → TimeoutError → dừng sớm; skew nhỏ hơn ngưỡng sau 1-2 reads → xong sớm.
- **Failure modes**: một cam lag kinh niên → mỗi vòng tốn ≤3 đọc phụ + timeout 0.5s — trễ pipeline; best-effort pair vẫn lệch → handoff/timing metrics sai nhẹ.
- **Thực tế vs mô phỏng**: giữ vòng catch-up bounded + early exits. `[sim-omits]`: `LatestFrameCapture` reader-thread thật — demo mảng frame có seq/ts sẵn.
- **Sample A (thường — catch-up thành công)**: `{"ts":{"cam1":10.00,"cam2":10.30},"newer_cam1":[10.10,10.20,10.25],"max_skew_ms":120,"max_reads":3}` → **Expected** (verify): skew `300ms>120` → read1 `10.10` (skew 200) → read2 `10.20` (skew `100≤120`) → **synced sau 2 reads**.
- **Sample B (biên — không kịp)**: `{"ts":{"cam1":10.00,"cam2":10.30},"newer_cam1":[10.02,10.03,10.04],"max_skew_ms":120,"max_reads":3}` → **Expected** (verify): skew `300ms` → read1 `10.02` (280) → read2 `10.03` (270) → read3 `10.04` (260) — hết `max_reads` mà skew `260>120` → **best-effort, pipeline vẫn chạy** với pair lệch — không chặn.
- **Storyboard**: 2 timeline cam, thanh skew; cam chậm nhảy tới qua mỗi read (đếm 1/2/3); vạch 120ms; hết reads → badge "best-effort"; bảng realtime: `skew | read# | synced`; pseudo-line 1–4. Giải thích VN: "đồng bộ = cho stream chậm đuổi theo, không phải chờ hay báo động — bounded nên không treo".
- **Thư viện ngoài**: không trực tiếp (dùng `LatestFrameCapture.read_latest_timed` [code]).

#### F7. `latest-frame-mailbox` — Hộp thư chỉ-giữ-frame-mới-nhất
- **Nhóm**: Timing · **Tiên quyết**: capture thread · **Liên quan**: F6, F8
- **Code**: `backend/main_detect/src/techgar/latest_frame_capture.py:12-128` `LatestFrameCapture` (`_reader_loop` đọc liên tục giữ frame mới nhất + seq + `monotonic_ns`; `read_latest_timed` :104-113); `backend/main_detect/runtime_server.py:116-139` `RuntimeState.publish_frame` (rate-limit + overwrite pending); `:173-180` `needs_frame`; `:201-220` `wait_for_frame`.
- **Vai trò**: hai tầng "latest-only": capture thread giữ frame mới nhất (bỏ frame cũ — chống backlog), runtime mailbox giữ **1 pending frame/cam** cho consumer; **`needs_frame(cam)` = true khi có subscriber còn sống** (`_frame_requested_at` trong 5s) **và đã qua `_stream_interval`** — nghĩa là *nhu cầu/liveness của subscriber*, KHÔNG phải "consumer đã xử lý xong frame trước".
- **Input**: events `publish(cam,frame)` / `request(cam)` / `wait_for_frame`. **Output**: `(frame, seq, ts_ns)` mới nhất; `needs_frame: bool`.
- **Pseudocode**:
  1. Reader: `cap.read()` liên tục → ghi đè `_latest = (frame, ++seq, monotonic_ns)`; `CAP_PROP_BUFFERSIZE=1`.
  2. `publish`: `now − last_submitted < stream_interval` → drop; ngược lại `_pending[cam] = frame` (ghi đè pending cũ).
  3. `needs_frame` = `requested_at` ≤5s trước **và** `now − last_submitted ≥ interval` (`last_submitted` = lần publish **được nhận** gần nhất, không phải lần request).
  4. `wait_for_frame(after_seq)`: đánh dấu `requested_at=now`, chờ `seq > after_seq` (hoặc closed/timeout).
- **Cấu trúc**: `_latest`, `_pending{cam}`, `_frame_requested_at{cam}`, `Condition` lock.
- **Độ phức tạp**: O(1) mỗi op; wait O(1) + blocking. **space** O(cam) pending; **[sim]**: O(events).
- **Edge cases**: consumer chậm → publish ghi đè → chỉ nhận frame mới nhất (đúng thiết kế); không ai request → `needs_frame=false` → không render/encode (tiết kiệm); `wait_for_frame` đánh dấu subscriber sống.
- **Failure modes**: `requested_at` cũ >5s → stream ngừng phát (subscriber "chết" theo định nghĩa); interval ngắn + browser chậm → frame vẫn drop (không phải bug — latest-only).
- **Thực tế vs mô phỏng**: giữ seq/ts/overwrite/needs_frame-2-điều-kiện. `[sim-omits]`: thread/lock thật, JPEG encode — demo queue 1-ô deterministic.
- **Sample A (thường — liveness + overwrite)**:
  ```json
  {"events":[
    {"t":0.0,"op":"publish","cam":"cam1","frame":"f1"},
    {"t":0.1,"op":"publish","cam":"cam1","frame":"f2"},
    {"t":0.2,"op":"request","cam":"cam1"},
    {"t":0.3,"op":"publish","cam":"cam1","frame":"f3"},
    {"t":0.35,"op":"needs_frame","cam":"cam1"},
    {"t":0.4,"op":"encode_next"},
    {"t":0.45,"op":"needs_frame","cam":"cam1"}
  ],"stream_interval_s":0.15}
  ```
  **Expected** (verify): publish f2 bị **drop** (0.1−0.0 < 0.15); request@0.2 → subscriber sống; publish f3 pass (0.3−0.0 ≥ 0.15 → `last_submitted=0.3`) → `pending=f3`; **`needs_frame@0.35 = false`** — `0.35 − 0.3 = 0.05 < 0.15`: interval đo từ lần publish **được nhận** (`last_submitted`), KHÔNG từ request; encode_next lấy **f3**; `needs_frame@0.45 = true` (0.45−0.3 = 0.15 ≥ 0.15 — **đúng biên inclusive** — ∧ request 0.25s trước ≤ 5s) — f1/f2 không bao giờ tới consumer.
- **Sample B (biên — subscriber chết)**: `{"events":[{"t":0.0,"op":"request","cam":"cam1"},{"t":6.0,"op":"needs_frame","cam":"cam1"}]}` → **Expected** (verify): `requested_at` cũ 6s > 5s → **`needs_frame=false`** — subscriber hết liveness dù từng request.
- **Storyboard**: ống publish → hộp pending 1-ô (frame cũ bị đẩy rơi ra minh họa); đèn subscriber liveness (5s); nút request/wait; bảng realtime: `pending | seq | requested_at | needs_frame`; pseudo-line 1–4. Giải thích VN: "needs_frame không hỏi 'xong chưa' — nó hỏi 'còn ai đang xem không' — không có viewer thì không render".
- **Thư viện ngoài**: `cv2.VideoCapture` (reader), `threading.Condition` [code] — demo queue.

#### F8. `stale-evidence-health-gating` — Chặn bằng chứng cũ + giám sát worker
- **Nhóm**: Timing · **Tiên quyết**: C2, C5 · **Liên quan**: F7
- **Code**: `backend/main_detect/src/techgar/parking_detector.py:602-645` `accept_evidence` (timestamp phải **monotonic tăng**); `two_camera.py:2560-2617` vòng apply kết quả (result-age + monotonic); `:2620-2645` submit gate `parking_futures`; `:2655-2668` `worker_over_deadline`; `PendingParkingJob` `:68-76`. **Không tồn tại `job_seq`/`applied_seq`** trong source — `job_id = f"{cam}:{frame_idx}"` chỉ là nhãn.
- **Vai trò**: worker occupancy async ~2Hz chậm hơn tracker → kết quả trễ bị chặn bằng **3 cơ chế phối hợp**: (a) **một pending job/camera** — không submit job mới khi cam còn job treo; (b) **timestamp monotonic** ở `accept_evidence`; (c) **result-age ceiling** — kết quả cũ hơn `parking_max_result_age_seconds` bị drop. Không có sequence-number nào tranh nhau — mỗi cam chỉ có 1 job trong lúc.
- **Input**: `PendingParkingJob{future, ts, frame_idx, submitted_at_s}`, `camera_timestamps_s`, `parking_max_result_age_seconds`, `parking_futures{}`. **Output**: `accept | reject{result_too_old, evidence_not_monotonic, worker_error}` + `health{state, last_rejection_reason, pending_age_ms}`.
- **Pseudocode** (`:2560-2668`):
  1. **Submit**: `if camera_id in parking_futures or not parking_due: continue` — cam đang có job → **không submit** (`:2628-2630`); submit → `parking_futures[cam] = PendingParkingJob(ts=camera_now, frame_idx, submitted_at_s=monotonic)`.
  2. **Complete**: `job.future.result()` lỗi → `worker_error`, `finish_vision_job(accepted=False)`, `dropped++`.
  3. `result_age_s = max(cam_ts − job.timestamp_s, monotonic − job.submitted_at_s)` (`:2569-2573`) — lấy nhánh **xấu hơn** giữa clock camera và wall-clock.
  4. `result_age_s > parking_max_result_age_seconds` → `result_too_old` + `finish_vision_job(False)` + `dropped++` (`:2586-2594`).
  5. `detector.accept_evidence(results, ts, frame_idx)` trả `False` (timestamp không monotonic — evidence đi lùi) → `evidence_not_monotonic` + reject (`:2596-2602`).
  6. Accept → apply + `health=healthy`, `last_rejection_reason=None`, `finish_vision_job(True)`.
  7. **Deadline**: job pending `age = monotonic − submitted_at_s > max_result_age` → `worker_over_deadline` (`:2665-2667`) — health degraded dù kết quả chưa về.
- **Cấu trúc**: `parking_futures{cam: PendingParkingJob}` (≤1 entry/cam); `parking_pipeline{cam: health}`; `PendingParkingJob` (:68-76).
- **Độ phức tạp**: O(S) apply + O(1) gate mỗi job. **space** O(cam); **[sim]**: O(1).
- **Edge cases**: worker chậm → `parking_futures` bận → frame này bỏ qua submit (không xếp hàng — chống backlog tự nhiên); kết quả về nhưng `cam_ts − job.ts` lớn (camera lag) → `result_too_old`; `accept_evidence` nhận evidence có `ts ≤` evidence trước → `evidence_not_monotonic`; job pending lâu → `worker_over_deadline` degraded.
- **Failure modes**: `parking_max_result_age_seconds` lớn → chấp nhận evidence lỗi thời; camera timestamp reset (stream restart) → monotonic-guard reject hàng loạt (`evidence_not_monotonic` storm); `max(cam_ts−ts, mono−submitted)` lấy nhánh xấu → một clock hỏng cũng làm drop.
- **Thực tế vs mô phỏng**: giữ 1-pending-job + monotonic + result-age + deadline. `[sim-omits]`: `job_id` label, debug_images attach, `finish_vision_job` callback — demo giữ 4 reason literal. **Không mô phỏng seq** — khái niệm đó không có trong code.
- **Sample A (accept)**: `{"parking_futures":{},"submit":true,"job":{"ts":104.8,"frame_idx":41,"submitted_ago_s":0.3},"cam_ts":105.0,"max_age_s":2.0,"evidence_ts":[104.5,104.8]}` → **Expected** (verify): submit được (cam chưa có job); `result_age = max(105.0−104.8, 0.3) = max(0.2,0.3) = 0.3 ≤ 2.0`; `accept_evidence`: `104.8 > 104.5` monotonic → **accept + healthy**.
- **Sample B (biên — ba kiểu reject)**: `{"job":{"ts":102.0,"submitted_ago_s":0.3},"cam_ts":105.0,"max_age_s":2.0}` → **Expected** (verify): `result_age = max(3.0,0.3) = 3.0 > 2.0` → **`result_too_old`**; biến thể `evidence_ts:[104.8,104.5]` → `accept_evidence` False → **`evidence_not_monotonic`**; `parking_futures:{cam1:job}` → submit skip (one-pending); `pending_age 2.5 > 2.0` → **`worker_over_deadline`**.
- **Storyboard**: slot 1-ô `parking_futures[cam]` — job mới bị chặn khi ô bận; 2 đồng hồ (camera-ts vs monotonic) → `result_age = max(2 nhánh)` so với vạch `max_age`; thẻ reason literal cho từng reject; đèn health xanh→vàng (`worker_over_deadline` khi pending quá lâu); bảng realtime: `pending? | cam_ts−job.ts | mono−submitted | age | reason | verdict`; pseudo-line 1–7. Giải thích VN: "không có số thứ tự job — một cam chỉ ôm một việc; bằng chứng đi lùi thời gian hay về quá trễ đều bị bỏ".
- **Thư viện ngoài**: không trực tiếp.

#### F9. `replay-session-sync` — Đồng bộ replay theo timestamp đã ghi *(ALIAS → `replay-timestamp-pairing`, owner C)*
- **Nhóm**: Timing/Replay · **Tiên quyết**: F7 · **Liên quan**: F6
- **Quan hệ**: canonical SPEC §2 = **`replay-timestamp-pairing` (pack integration, owner C)** — mục này giữ code-refs/bối cảnh producer của B, không mất thuật toán; nội dung pairing/CSV/EOF chi tiết thuộc dossier C (entry E1 của `builder-c.md`). **Không** dùng `t=n/fps` synthetic — đây là điểm review bắt buộc.
- **Code**: `backend/main_detect/two_camera.py:146-182` `ReplaySession.__init__` + `ReplayFrameTiming` (:58-67); `:182-228` `_load_timings`; `:229-259` `read_pair`; `:2491-2499` `--replay-realtime` pacing; `:2496-2499` `now = max(camera_timestamps_s)` từ timestamps ghi.
- **Vai trò**: replay phát lại session đã ghi: đọc `frame_timestamps.csv` + 2 video, ghép **frame video theo index** với **dòng timestamp** — không tự sinh thời gian.
- **Input**: `session_dir` (video cam1/cam2 + `frame_timestamps.csv` có cột `frame_idx`, `cam1_monotonic_ns`, `cam2_monotonic_ns`); cờ `--replay-realtime`. **Output**: `read_pair() → (frame1, frame2, ts) | None` (EOF sạch).
- **Pseudocode**:
  1. `_load_timings`: đọc CSV; `frame_idx` phải **liên tục bắt đầu từ 1**; timestamps `>0` và **nondecreasing** từng cam (bằng nhau cho phép — latest-frame có thể lặp); lùi → lỗi.
  2. `read_pair` lần thứ k: đọc frame k từ **mỗi** video + dòng CSV k.
  3. EOF: video ngắn hơn CSV → `RuntimeError` (kết thúc sớm); video còn dư frame quá CSV → `RuntimeError` (thừa); đúng → `None`.
  4. `--replay-realtime`: `due = wall_started + (src_now − src_started)`; sleep tới `due` (`time.monotonic`, `:2496-2499`) — pace theo **timestamp ghi**, không phải fps cố định.
- **Cấu trúc**: `ReplayFrameTiming{frame_idx, cam1_ns, cam2_ns}`; hai `cv2.VideoCapture`.
- **Độ phức tạp**: O(1)/pair đọc; O(n) load CSV. **space** O(n) timings; **[sim]**: O(n).
- **Edge cases**: timestamps bằng nhau (latest-frame lặp) → hợp lệ; frame_idx nhảy → lỗi load; `--replay-realtime` tắt → chạy nhanh hết tốc lực; `--replay-async-vision` → nondeterministic theo docs.
- **Failure modes**: CSV/video lệch nhau 1 frame → mọi pairing sau sai (lỗi dữ liệu); monotonic_ns giữa hai cam lệch nguồn → `max(ts)` dùng làm `now` → pacing bù skew nhẹ.
- **Thực tế vs mô phỏng**: giữ index-pairing + validation + EOF semantics + pace-due. `[sim-omits]`: `cv2.VideoCapture` decode — demo mảng frame giả `{id, ts}`.
- **Sample A (thường — pair đúng)**:
  ```json
  {"csv":[
    {"frame_idx":1,"cam1_ns":1000000000,"cam2_ns":1100000000},
    {"frame_idx":2,"cam1_ns":1500000000,"cam2_ns":1400000000}
  ],"video":{"cam1":["v1_f1","v1_f2"],"cam2":["v2_f1","v2_f2"]},"replay_realtime":true,"wall_start_s":100.0}
  ```
  **Expected** (verify): `read_pair` 1 → `(v1_f1, v2_f1, ts={cam1:1.0s,cam2:1.1s})`; lần 2 → `(v1_f2, v2_f2, {1.5,1.4})`; lần 3 → `None` (EOF sạch). Pace: `now=max(1.0,1.1)=1.1`, `due = 100 + (1.1−1.0) = 100.1` — phát theo nhịp ghi.
- **Sample B (biên — video thừa frame)**: `{"csv":[{"frame_idx":1,"cam1_ns":1e9,"cam2_ns":1e9}],"video":{"cam1":["f1","f2"],"cam2":["f1"]}}` → **Expected** (verify): sau pair 1, EOF-check đọc thêm thấy `cam1` còn `f2` → **`RuntimeError: extra frames`** — dư frame = dữ liệu không khớp.
- **Storyboard**: bảng CSV 2 cột timestamp + 2 hàng frame video; mũi nối index↔row; EOF probe đọc thêm → báo sạch/dư; toggle realtime → thanh `due` chạy; bảng realtime: `idx | pair | ts_cam1 | ts_cam2 | verdict`; pseudo-line 1–4. Giải thích VN: "replay không tự đếm giờ — thời gian đã được ghi lúc live, CSV là đồng hồ".
- **Thư viện ngoài**: `cv2.VideoCapture` [code] — demo mảng frame; **canonical page thuộc owner C** (dossier C `replay-timestamp-pairing`).

## 3. Lesson map đề xuất (18 lessons, phủ 57 canonical + 1 alias)

| Lesson | Thuật toán | Lý do gộp |
|---|---|---|
| L1. Trừ nền & cổng chuyển động | A1, A2 | hai tầng mask AND — một bài "foreground được tạo thế nào" |
| L2. Tinh chỉnh mask & ROI | A3, A4 | morphology + ROI rescue cùng thao tác trên mask trước contour |
| L3. Contour → detection | A5, A6 | chuỗi gate + anchor là 1 quy trình "blob thành detection" |
| L4. Bóng & vùng tối | A7, A8 | phân biệt bóng/cứu tối — hai mặt của marker 127 |
| L5. Echo & occlusion | A9, A10, A11, A12 | vệt chuyển động + blob dính + tách/veto — cùng bài "blob không sạch" |
| L6. Kalman & tuổi dự đoán | B1, B2 | predict/coast + giới hạn tin cậy |
| L7. Gate + cost + LAPJV + margin | B3, B4, B5, B6, B7 | toàn bộ chuỗi assignment 1–1 (bài lõi của tracker) |
| L8. Reacquire & lifecycle | B8, B9 | neo cũ + trạng thái sống/chết |
| L9. Tracklet appearance | B10, B11 | descriptor + gallery match — một bài "nhận dạng màu" |
| L10. Occupancy ensemble | C1, C2, C3, C4 | ROI precompute + 25-vote + lọc vạch + rescue — một bài "vision nói occupied" |
| L11. Dwell & fusion | C5, D4 | hysteresis + vision-primary — ranh giới occupied vs identity |
| L12. Overlap & batch bind | D1, D2 | geometry + LAPJV slot↔track |
| L13. Arrival & sticky | D3, D5, D6 | claim→stopped→bind/release — vòng đời chiếm ô |
| L14. Departure token & recovery | D7, D8, D9, D10 | token + gates + batch recovery — vòng đời rời ô |
| L15. Episode & world projection | D11, E1 | episode state + hệ tọa độ world (cầu nối binder↔crosscam) |
| L16. Handoff & global ID | E2, E3, E4, E5, E6 | entry→corridor→lapjv→overlap→alloc — bài "qua camera kề" |
| L17. Dormant/ReID/trajectory/merge | E7, E8, E9, E10 | hồi sinh + quỹ đạo + alias + lifecycle — bài "nhớ xe lâu dài" |
| L18 (phụ, timing & calibration) | F1–F8 | calibration + skew + mailbox + stale — một bài hạ tầng; F9 gộp vào page `replay-timestamp-pairing` của owner C |

*57 trang canonical = mỗi ID một page (SPEC §2); lesson chỉ để nhóm lộ trình, không bỏ mô phỏng micro-algorithm nào (SPEC §1).*

## 4. Coverage checklist theo file/symbol

| File | Symbols phủ | IDs |
|---|---|---|
| `motion_tracker.py` | `_detect`, `_temporal_motion_mask`, `_motion_between`, `_timestamp_references`, `_frame_gap_references`, `_brightness_shift`, ROI block, `_cast_shadow_metrics`, `_is_cast_shadow`, `_background_reference`, `_box_is_priority`, `_same_motion_echo`, `_suppress_duplicate_detections`, `_is_echo_of_matched_track`, `_elongation_explained_by_motion`, `_unresolved_merged_birth`, `_new_kalman`, `_predict_tracks`, `_prediction_age_seconds(+limit)`, `_has_recent_merged_freeze`, `_association_gate`, `_track_velocity_px_per_frame`, `_iou`, `_assign`, `_assignment_has_margin`, `_lineage_score`, `_mark_competing_assignments`, `_bottom_center`, `_ground_point`, `_histogram`, `_create_or_reid`, `_is_confirmable`, `_apply_detection`, `suspend_track`, `_lost_beyond_ttl_seconds`, `process_frame`, `_predicted_box`, `_tracks_proven_independent`, `_clean_size`, `_remember_clean`, `_roi_edge_twin_strength`, `_suppress_roi_edge_twins`, accessors | A1–A12, B1–B9 |
| `occlusion_guard.py` | `OcclusionGuard.prepare/covering_group/activate/annotate/partition/gate_assignments`, `OcclusionGroup` | A10, A11, A12 |
| `tracklet_descriptor.py` | `hsv_histogram`, `compute_sample_quality`, `histogram_distance`, `spatial_histograms`, `spatial_distance`, `AppearanceTracklet`, `appearance_samples`, `aggregate_appearance`, `merge_appearance_samples`, `compare_tracklets`, `TrackletMatch` | B10, B11 |
| `parking_detector.py` | `_compute_rois`, `_filter_roi_threshold`, `_has_core_rescue`, `_get_gamma_lut`, `detect`, `TemporalSmoother`, `accept_evidence`, `_PrecomputedROI`, `_ROIEvidence`, `SlotResult`, `configure_roi_filter`, `build_debug_images`, `draw_results` | C1–C5, F8 |
| `slot_vehicle_binder.py` | `VehicleObservation`, `VehicleParkingState`, `ArrivalClaim`, `RecoveryCandidateEvidence`, `DepartureToken`, `RecoveryBatchResult`, `SlotBinding`, `_overlap_geometry`, `_raw_vehicle_overlap`, `_signed_polygon_distance`, `_point_in_polygon`, `_slot_diagonal`, `_batch_match`, `_record_arrival_claim`, `_qualified_arrival`, `_try_commit_arrival_claim`, `_disprove_arrival_claims`, `_best_arrival_slot`, `_mark_arrival_absent`, `_link_arrival_job`, `_arrival_processing_pending`, `_cleanup_arrival_claims`, `update_vision`, `_bind_vehicle`, `_release_vehicle`, `_is_stopped`, `_advance_strong_overlap`, `_strong_overlap_is_stable`, `_strong_overlap_max_gap_seconds`, `_create_departure_token`, `_detach_binding_for_departure`, `_restore_false_empty_token`, `_token_radius`, `_cleanup_tokens`, `_token_extension_blocker`, `_rank_fragment_continuations`, `prepare_predeparture_tokens`, `batch_recover_ids`, `consume_recovery_match`, `try_recover_id`, `_consume_departure_token`, `_appearance_distance`, `export_recovery_tokens`, `recovery_candidate_keys`, `recovery_priority_regions`, `_open_parking_episode`, `_transition_parking_episode`, `_expanded_polygon`, `update_tracks`, `notify_track_lost/expired`, `begin_frame`, `finalize_arrivals`, `retain_slot_ids`, `reconcile_identity_reservations`, `get_identity_reservations` | D1–D11 |
| `cross_camera_manager.py` | `__init__` (use_deep_reid ValueError), `_world`, `_local`, `_bbox_anchor`, `_track_world`, `_expired_track_world`, `_outward_edge`, `_upsert_handoff`, `_predicted_world`, `_entry_depth`, `_direction_cosine`, `_match_pending_handoffs`, `_candidate_cost`, `_record_rejection`, `_match_simultaneous_overlap`, `_match_unbound_cross_camera_pairs`, `_match_unique_unbound_cross_camera_tracks`, `_merge_all_nearby_active_duplicates`, `_cross_camera_pair_evidence`, `_is_allocatable`, `_new_global_id_ready`, `_allocate_global_id`, `_canonical_id`, `_bind`, `bind_external_id`, `_match_dormant_identities`, `_same_camera_recovery_is_stale`, `_reachable_distance_limit`, `_dormant_candidate_distance_limit`, `_identity_is_established`, `_has_durable_turnaround_proof`, `_has_durable_same_camera_reentry_proof`, `_predicted_identity_world`, `_match_world_trajectory_identities`, `_merge_global_ids`, `_resolve_same_camera_global_conflicts`, `_resolve_cross_camera_global_conflicts`, `_bound_handoff_merge_allowed`, `_reconcile_handoff_dormant_alias`, `_observe_identity`, `_set_identity_dormant`, `_mark_identity_exited`, `_refresh_identity_states`, `sync_parked_reservations`, `detach_parked_local_tracks`, `reconcile_departure_identity`, `_appearance_distance`, `_size_distance`, `_rotation_invariant_size_distance`, `_world_is_in_overlap`, `_world_is_near_overlap`, `update_all_tracks`, `observe_trajectories`, `cleanup`, `to_json`, helpers `_identity_elapsed`, `_update_camera_timing`, `effective_camera_fps`, `_reid_window`, `_direction_claim_action`, `_live_handoff_deferrals`, `_identity_retention_elapsed`, `_identity_is_recent`, `_is_confirmed`, `_has_fresh_detection`, `_velocity`, `_world_velocity` | E1–E10 |
| `trajectory_memory.py` | `TrajectorySample`, `TrajectoryEstimate`, `TrajectoryMatchEvidence`, `WorldTrajectoryMemory` (`_append`, `append_provisional`, `append_global`, `promote`, `merge`, `set_parked`, `parked_origin`, `remove_missing_provisionals`, `_camera_tail`, `_estimate`, `_point_segment_distance`, `match`, `match_departure`, `global_samples`, `provisional_samples`, `provisional_origin`) | E8, E9 |
| `latest_frame_capture.py` | `LatestFrameCapture` (`_reader_loop`, `read_latest`, `read_latest_timed`, `release`, `get`) | F6, F7 |
| `runtime_server.py` | `RuntimeState.publish_frame`, `needs_frame`, `wait_for_frame`, `frame`, `available_cameras`, `_encode_latest_frames` | F7 |
| `two_camera.py` | `ReplaySession`, `ReplayFrameTiming`, `_load_timings`, `read_pair`, `release`, `load_calibration`, `adapt_calibration_to_frame_sizes`, `median_slot_length`, `derive_matching_defaults`, `resolve_matching_distance`, `synchronize_live_frames`, `PendingParkingJob`, `recover_departing_vehicle_ids`, `select_moving_tracks`, `build_recovery_track_payload`, `build_recovery_priority_regions`, `collect_binder_global_tracks`, `sync_parking_identity_reservations`, `cancel_observed_recovery_tokens`, `process_parking_frame`, `render_runtime_frame`, `freeze_runtime_render_payload`, `DetectorTuningPanel`, `make_parser` (defaults skew/catchup) | F3–F9, D9, D10 |
| `tools/calibrate_shared_map.py` | `compute_distributed_shared_homographies`, `compute_homography`, `transform_polygon`, `_pixel_normalizer`, `_project`, `_diagnose_world_mapping`, `distributed_fit_coverage`, `cross_camera_validation_diagnostics`, `cross_camera_validation_spread`, `calibration_extrapolation_ratio`, `convex_intersection`, `load_paired_ground_points`, `load_parking_slots_world`, `full_frame_polygon` | F1 |
| `tools/rectangle_line_calibration.py` | `_line_geometry`, `compute_rectangle_line_homographies`, `fit_gate`, `approve_rectangle_line_calibration` | F2 |

## 5. Chưa xác minh / demo parameters (không được claim exact)

Các giá trị `~` trong dossier là **demo parameters** chưa đối chiếu literal config — khi build Phase 2 phải hoặc đọc literal từ source/config, hoặc giữ nhãn "giá trị mô phỏng":

1. ~~Weights cost matrix B5 (`w_d/w_i/w_a/w_s/w_g`)~~ — **đã trích literal** theo merge `motion-binder-correction-a.md`: cost `[0.45,0.25,0.20,0.10]` `:1744-1760`, `size_error=|ln(ratio)|/|ln(2.80)|`, `cost_limit=0.90` `:72`, `max_distance=180` `:42`, scale `min(1.25, 1+min(invisible,15)/60)` `:1691-1694`.
2. ~~Ngưỡng `margin` B7, `anchor_radius`/`app_max` B8~~ — **đã trích literal**: B7 `split_assignment_margin=0.08` `:82` + `ambiguous_recovery_frames=3` `:81`; B8 `reacquire_max_seconds=1.50` `:68`, `merged 3.0` `:69`, `lost_appearance_threshold=0.30` `:83`, `min/max_reacquire_area_ratio 0.35/2.80` `:84-85`, gate `min(max_distance·scale, max(3.0,0.30·diag))` `:1696-1701`. Còn lại `confirm_min/ttl` B9 — `ttl=3` trong sample là demo-scale, gate confirm (`total_visible≥3`, `disp≥12px`, priority `min_visible=2`/`disp≥3`) trích theo source-review nhưng config gốc chưa đối chiếu literal.
3. ~~`enter_ratio`/`needed` C2, `core_min/comp_min` C4, dwell C5~~ — **đã trích literal** từ `parking_detector.py:97-137` (xem bảng params trong C1–C5); chỉ còn `V_demo=9` là giản lược demo (production V=25).
4. `bonus` incumbent D2 — chưa trích. ~~`obs_min/overlap_min/gain_min/inward_min` D3, `r95_max/drift_max/max_gap` D5, `r0/rate/r_max/ttl` token D7, `app_max/size_min/dir_min` D9~~ — **đã trích literal**: D3 `arrival_min_samples=3`, `arrival_vision_confirmations=2`, `arrival_competitor_margin=0.15`, `arrival_lost_commit_delay_seconds=0.35`, `arrival_lookback_seconds=1.5` `:241-247`; D5 xem params trong entry; D7 `departure_token_*` (radius `0.05/0.45/1.0s`, retention `5.0s`, extension `15.0s`, guard `2.5s`, grace `1.25s`); D9 size `[0.40,2.50]`/`[0.15,6.0]`, appearance `0.55/0.70`, outward `3.0/1.5/0.75` `:230-240`.
5. `radius` handoff E4 (thật ra từ F4 derivation), `obs_min/disp_min` E6, `reachable_limit/stale_s` E7, `score_min/min_dir` E8.
6. ~~`max_deviation` F5, `stale_s`/`stall_s`/`job_seq` F8~~ — **đã trích literal theo `cv-crosscal-review-c`**: F5 không có `max_deviation` (gate aspect `0.005` + non-uniform `0.5%`, `two_camera.py:364-374`); F8 dùng `parking_max_result_age_seconds` + monotonic guard + 1-pending-job, không có seq (`two_camera.py:2560-2668`).
7. Ngưỡng pixel gốc chưa scale trong A (`required_support`, `marker_min`, `min_area`…) — luật scale mục 0.

**Đã xác minh literal**: `--max-camera-skew-ms=120.0`, `--sync-catchup-reads=3` (F6, `make_parser`); `fit_gate(max_error_cm=2.0, max_p95_px=8.5, max_pixel_error=12.0)` (F2, signature `:112`); `use_deep_reid → ValueError` (`cross_camera_manager.py:391-395`); `frame_timestamps.csv` bắt buộc cột `frame_idx, cam1_monotonic_ns, cam2_monotonic_ns` + liên tục từ 1 + nondecreasing (F9, `:182-228`); `needs_frame` = requested≤5s ∧ interval elapsed (`runtime_server.py:173-180`); `lookahead_frames=16` + velocity gate `|v|>1.0 px/frame` + `handoff_ttl=45` frames (E2); cost `0.55/0.30/0.10/0.05` + reject `>0.92` (E4 `:3017`, `lapjv cost_limit=0.92` `:3615`); score `0.35/0.25/0.15/0.10/0.10/0.05` 6-term + hard rejects `teleport`/`camera_topology`/`stable_wrong_direction` (E8 `trajectory_memory.py:387-401`); `SLOT_MATCHING_MULTIPLES{1.75,2.75,1.75,0.50}` + `min(configured,derived)` (F4 `two_camera.py:387-448`); aspect `0.005` + non-uniform `0.5%` + `H'=H@diag(sx,sy,1)` (F5 `:364-378`); `result_too_old`/`evidence_not_monotonic`/`worker_over_deadline` + `parking_futures` 1-job (F8 `:2560-2668`).

## 6. Giới hạn & failure modes đã biết (tổng hợp)

- **Không có neural detector**: toàn bộ detection phụ thuộc nền+chuyển động; xe đỗ lâu "chìm nền" → tracking mất, chỉ occupancy còn thấy — đúng thiết kế vision-primary (D4).
- **Occupancy 100% vision**: nếu ensemble sai → `occupied` sai, không nguồn dự phòng.
- **Merge sai không thể tách**: E9 không có un-merge — một merge nhầm dính GID vĩnh viễn.
- **Camera xê dịch**: không có drift-monitoring sau calibration (F3 chỉ check lúc load).
- **Replay pacing** chỉ đúng khi CSV/video khớp index; `--replay-async-vision` nondeterministic.
- **Sim ≠ port**: MOG2→1-bg, Kalman→α-β, watershed→Voronoi, LAPJV→exhaustive ≤5×5, CLAHE/gamma→`ratios[]` sẵn — mọi trang phải hiển thị badge simplifications theo SPEC §4 (field `simplifications` bắt buộc).
- **Solver exact ≤5×5**: production dùng LAPJV O(n³); demo exhaustive O(n!) chỉ hợp lệ cho ma trận nhỏ — bắt buộc ghi `complexity.simulation` khác biệt.
- **`needs_frame` không phải barrier**: nó đo liveness/nhu cầu subscriber, không đảm bảo consumer đã xử lý frame trước — trace demo không được nói "consumer done".

## 7. Ánh xạ sang contract SPEC §4–5 (ghi chú cho Phase 2)

- `codeRefs`: dùng `path` root-relative như trên, `line`/`endLine` = số nguyên đầu-cuối symbol, `symbol` như đã ghi.
- `complexity`: `{time, space, variables, simulation}` — mục "Độ phức tạp" của từng entry đã tách time/space và `[sim]`.
- `simplifications[]`: ánh xạ từ các dòng `[sim-omits]` + `[sim]` của mỗi entry.
- `scenarios[]`: Sample A = default, Sample B = edge (`edgeCase:true`); `expected` = phần Expected đã verify bằng fixture `_verify4.mjs` (163 assertion, chạy `node`) cùng `verify-motion-binder-a.py` (95 assertion, owner A) và `finalcheck-verify-ef-c.py` (64 assertion, owner C).
- `buildTrace`: pseudocode đánh số của mỗi entry tương ứng `activeLines` theo bước; state = các bảng realtime trong storyboard.
- `draw`: storyboard mô tả objects/colors/motion đủ để cài `draw(ctx, frame, env)` theo palette engine.
- `registerPack`: 57 lesson CV thuộc `packs/cv.js`; F9 không phải trang CV — canonical `replay-timestamp-pairing` thuộc `packs/integration.js` (owner C), B chỉ giữ refs.
- Alias: `replay-session-sync → replay-timestamp-pairing` (SPEC §2 bảng Alias).

## 8. Kiểm chứng đã chạy trong phase này

- `node _verify4.mjs` — **bằng chứng kiểm chứng hiện hành của B**: **163 assertion PASS / 0 FAIL** phủ corrections source-policy (B2/B3/B5/B6/B7/B8/B9/B10/B11, C1–C5 v1.1, D5/D6/D11, E6/E10), cross/calibration review C (E1/E2/E3/E4/E5/E8, F3/F4/F5/F8), format/numeric fixes (E5B/F3B/F6B/F7), **và toàn bộ 14 section có số mới của merge `motion-binder-correction-a.md`** (A5/A7/A9/A10/A12, D1/D3/D4/D7/D8/D9/D10) — các assert cũ cho B5/B8/B10/B11 (công thức trước merge) đã **bị thay bằng assert formula đúng**, không còn đếm làm bằng chứng hiện hành.
- `python verify-motion-binder-a.py` — **bằng chứng độc lập của A cho 19 section đã merge**: **95 assertion PASS / 0 FAIL** (không sửa).
- `python finalcheck-verify-ef-c.py` — **bằng chứng độc lập của C cho nhóm E/F**: **64 assertion PASS / 0 FAIL** (không sửa).
- 19 section (A1, A2, A5, A7, A9, A10, A12, B5, B7, B8, B10, B11, D1, D3, D4, D7, D8, D9, D10) đã **thay nguyên bằng spec đã LEAD duyệt** trong `motion-binder-correction-a.md`; completeness patch khi merge: D1 Sample B đủ `slot_poly/slot_center/vo_min/vo_strong` + expected dùng `vehicle_overlap`/`slot_overlap`, B8 Sample B có `track.last_meas/clean_wh/invisible/max_dist_demo` tường minh, D9 Sample B độc lập đủ `token{...}` + `is_cross/first_signed/first_bbox_overlap/world_ready`.
- Fixture đóng băng vòng trước (bằng chứng lịch sử, **chứa assert đã superseded — không dùng làm bằng chứng hiện hành**): `_verify_samples.mjs`, `_verify2.mjs`, `_verify3.mjs` (B) — có sim cũ cho B2 scalar/B3 42.5/B9 expired-state/C1–C5 mẫu cũ/D6 countdown; `cross-verify-c.py` (C, độc lập) — assert B2 scalar, B3=37.5 theo công thức cũ, B9 expired-state, C1–C4 mẫu cũ, B7-B fixture khác; **ghi chú provenance**: file này từng bị B patch nhầm rồi revert, phần tail hiện còn check B11 hai chiều + B6 counterexample + C5 `dwell_series` (khớp semantics v1.1) — trạng thái hiện tại vẫn chạy toàn PASS, B không sửa thêm (ownership C, xem `builder-b-review.md` §6).
- Nhóm C1–C5 đã thay bằng spec semantics theo source `parking_detector.py` (merge `occupancy-correction-c.md` v1.1); 8 semantics theo `cv-source-review-a.md` (B2/B3/B9/D5/D6/D11/E6/E10) đã đối chiếu trực tiếp với code.
- **Không** chạy test suite/service/camera trong phase này (đúng ràng buộc); bằng chứng `448 passed` là của báo cáo trước `.analysis/builder-b.md`.
