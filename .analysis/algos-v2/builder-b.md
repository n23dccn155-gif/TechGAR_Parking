# Builder B — Dossier Phase 1 (MEGAPLAN §3): N8–N11 Global ID xuyên camera

**Phạm vi**: 6 thẻ — T1×2 (ReID ngoại hình; predictive handoff), T2×3 (homography/shared-map; trajectory memory; dormant identity + departure token), T3×1 (GID conflict/merge/probation).
**Nguồn sự thật**: `two_camera.py:run()` + `backend/main_detect/src/techgar/*.py`. Mọi `file:dòng` đã đọc trực tiếp phiên này.
**Nhãn**: `[code]` đọc trực tiếp · `[suy luận]` suy ra, code không ghi · `[chưa xác minh]` chưa đọc tới.
**Đơn vị**: distance shared-map = **cm** (`"unit":"cm"` config:7); px cho bbox/mask; **frames** cho streak/TTL/probation, chuyển **giây** khi có timestamp (`_reid_window` ccm:4357-4371, `effective_camera_fps` ccm:4348-4354).
Viết tắt: `ccm`=cross_camera_manager.py · `td`=tracklet_descriptor.py · `tm`=trajectory_memory.py · `svb`=slot_vehicle_binder.py · `tc`=two_camera.py · `mt`=motion_tracker.py · `cfg`=config/two_camera.shared_cm_01.json.

## 0. Runtime map N8–N11 (callsite `two_camera.run()` — cho C đối chiếu `pipeline-order.md`)

```
N8  tc:2690-2716  notify_track_lost→_set_identity_dormant(ccm:1064→:633);
                  expired→binder trước rồi manager.notify_track_expired(ccm:7501)
N9  tc:2728-2733  manager.observe_trajectories(ccm:1429) — TRƯỚC recovery+alloc
N10 tc:2759       binder.prepare_predeparture_tokens(svb:479)
N10 tc:2764-2773  _recover_departing_vehicle_ids_global(tc:812)→bind_external_id — TRƯỚC update_all_tracks
N11 tc:2779-2784  manager.update_all_tracks(ccm:7075), thứ tự bên trong:
                  upsert handoff→_match_pending_handoffs→simultaneous_overlap→
                  _match_dormant_identities→_match_world_trajectory_identities→
                  pairs→unique→alloc(_new_global_id_ready)→merge dup→
                  _resolve_*_global_conflicts→refresh→cleanup (ccm:7105-7492)
```

## 0b. Resolved-params — file:dòng từng số

Cơ chế `[code]`: `SLOT_MATCHING_MULTIPLES` tc:387-392 = `{handoff 1.75, prediction 2.75, dormant 1.75, duplicate 0.50}` × median cạnh-dài ô `parking_slots_world` (cfg:134+, `median_slot_length` tc:395-412 dùng `cv2.minAreaRect`); `resolve_matching_distance` tc:426-447: **CLI thắng; nếu không thì min(configured, derived)** — calibration chỉ được siết, không nới.

Đo trên cfg thật — replicate chính xác routine `median_slot_length` (tc:395-412: `cv2.minAreaRect` per slot → long edge → `np.median`):

```
file   config/two_camera.shared_cm_01.json  sha256:ec759c558c3ccfeb  40,608 bytes
run    .\.venv\Scripts\python.exe -c <median_slot_length replicate>   (venv backend, cv2+np)
groups 2 × 30 slots = 60 polygons
median_slot_length = 9.267515182495117 cm        (KHÔNG làm tròn trước derived)
derived (tc:420-422, round(·,3)):
  handoff 16.218 · prediction 25.486 · dormant 16.218 · duplicate 4.634
```

Config `matching_defaults` cfg:1463-1468 = `{15.0, 25.0, 35.0, 9.0}`cm → **runtime resolved** (CLI=None → `min(configured, derived)` tc:426-447):

| Tham số | resolved | = min(config, derived) |
|---|---|---|
| `handoff_match_distance` | **15.0cm** | min(15.0, 16.218) tc:2163-2169 |
| `handoff_prediction_radius` | **25.0cm** | min(25.0, 25.486) tc:2170-2176 |
| `dormant_match_distance` | **16.218cm** | min(35.0, 16.218) tc:2177-2183 |
| `cross_camera_duplicate_distance` | **4.634cm** | min(9.0, 4.634) tc:2184-2190 |

⚠ Lệch với đo của C (9.202/16.1/4.6): routine đúng là `minAreaRect`→**long edge**→median trên `parking_slots_world` (cm), không phải polygon-edge hay px-config. Mọi ngưỡng downstream dùng derived `round(·,3)` = 16.218/4.634.

Derived phụ: `strong_spatial_distance = min(dup=4.634, max(1.0, match×0.40=6.0)) = 4.634cm` (ccm:226-229); `reid_reachable_margin` = dup = 4.634cm (ccm:253-260).
Class ctor defaults (fallback khi thiếu calibration, **không phải số chạy thật**): match 100 / prediction 90 / dormant 160 / dup 60 / strong 40 (ccm:150-160, :218-229).
`shared_map_anchor`: class `"bottom_center"` ccm:168 → runtime `"bbox_center"` (cfg:1461 → tc:2160-2161 → ctor tc:2259); lý do ghi trong code tc:602-606.
`use_deep_reid`: ctor **raise ValueError nếu True** rồi ép False (ccm:388-397) — tc:2227-2261 không truyền → runtime False, bị cấm hẳn.

---

## [T1] Thẻ 1 — ReID ngoại hình: histogram HSV+LAB + gallery tracklet (N11)

- **Bài toán**: cùng xe qua 2 cam lệch tông/ánh sáng; local track mất dấu vài frame rồi có mảnh mới — "mảnh này có phải chiếc xe lúc nãy?" mà không có CNN embedding.
- **Làm gì**: mỗi local track giữ gallery histogram nhiều-mẫu; so khớp = so **cặp mẫu** giữa hai gallery (không phải 1 vector).
- **Vai trò**: trước — tracker gom mẫu mỗi detection matched; sau — `compare_tracklets` là nhánh 0.30 trong handoff cost, cổng appearance trong dormant/token/conflict-resolver, gallery per-camera cho owner_rank. Mất nó → chỉ còn hình học, gán nhầm khi 2 xe cùng vùng chuyển.
- **Nằm ở đâu**: `td.py` — `hsv_histogram` :18, `compute_sample_quality` :81 (defaults `min_area=200`, `min_foreground_ratio=0.15`, reject <0.5 — docstring :91), `AppearanceTracklet` :183, `aggregate_appearance` :266, `merge_appearance_samples` :277, `compare_tracklets` :308. Callsite: quality gate `mt:420-430`; tạo tracklet `mt:2029-2033`; update `mt:2157-2163`; gallery GID `ccm:547-587`.
- **Tại sao**: histogram rẻ, không weight/model ngoài — khớp triết lý motion-backend. Alternative `[suy luận]`: deep-ReID embedding chính xác hơn nhưng cần model+crop pipeline; code chặn hẳn: `use_deep_reid=True` → `raise ValueError` (ccm:391-397, comment "no trained model shipped"). **Điểm hay nhầm: flag tồn tại nhưng bị cấm — ReID thật = histogram** `[code]`.
- **Các bước** `[code]`:
  1. Quality gate: crop quá nhỏ/nền → bỏ (mt:427-429, ngưỡng td:85-91).
  2. BGR→HSV + BGR→LAB; chỉ đếm pixel foreground (motion mask).
  3. Descriptor 416-D: HS 16×16=256 ·w0.70 + ab 12×12=144 ·w1.20 + L 16 ·w0.60 → `cv2.normalize`; crop rỗng → `zeros(416)` (td:18-78, :39).
  4. `AppearanceTracklet.update` mỗi match: ≤`tracklet_max_samples`, cách `sample_interval` frame.
  5. Bind/observe → `merge_appearance_samples` vào gallery GID ≤24 mẫu, bỏ gần-trùng (≤0.015), giữ mẫu rải `np.linspace` (td:277+).
  6. `compare_tracklets`: distance = `0.50·nearest + 0.20·coverage + 0.20·aggregate + 0.10·best-pairs` (Bhattacharyya), trả `TrackletMatch{distance, support, pair_count}`.
- **Tham số (deep)**: bins/weights td:18-78; quality td:85-91 + mt:427; local gallery `12/3f` (CLI tc:1965-1966 → mt:2387); global gallery `24` (`--global-gallery-max-samples` tc:1967 → ctor tc:2248); dedupe ≤0.015 td:277+; ngưỡng dùng nơi khác: handoff hard/relaxed `0.45`/`0.82` (tc:1928/:1929-1935 → ctor tc:2240-2241), dormant `0.60` (tc:1964 → ctor tc:2247, same-cam cap 0.30 trong `_match_dormant_identities`), binder recovery `0.62` (tc:1900-1905).
- **Storyboard** (cùng cảnh — xe đỏ cam1 mất dấu 8f, mảnh đỏ sẫm cam2):
  - TẮT: k1 gallery trống → handoff/dormant chỉ còn hình học; k2 2 mảnh cùng lúc → coin-flip/2 GID.
  - BẬT: k1 12 ô hist mỗi-3f tích luỹ; k2 lost→trộn gallery GID#5 (≤24, dedupe 0.015); k3 `compare_tracklets`: distance≈0.21<0.45 → vote "cùng xe"; k4 strip 12→24 mẫu nhấn "nhiều quan sát theo thời gian".
- **QA**: (1) Deep ReID? Không — flag bị raise ccm:391-397 `[code]`. (2) Đổi sáng mạnh? L-channel chỉ w0.60 + multi-sample giúp; vẫn là lý do quality gate + support≥2 `[code cấu trúc, suy luận mục đích]`. (3) Vì sao per-camera gallery? code có `camera_appearance_samples` ccm:548; "giảm lệch tông giữa view" `[suy luận]`.
- **Chắc chắn**: cao cho descriptor/gallery/so-khớp/flag-cấm `[code]`; "tại sao histogram" `[suy luận]`.

## [T1] Thẻ 2 — Predictive handoff + Global ID 2 camera (N11)

- **Bài toán**: xe ra biên cam1 → cam2 thấy mảnh mới trước khi cam1 mất hẳn; phải dự đoán "nó xuất hiện ở đâu trên map chung" thay vì nearest-neighbor mù.
- **Làm gì**: track tiến ra `outward_edge` → pending `HandoffEntry` TTL 45f; mỗi frame chấm `_candidate_cost` 4-thành-phần + gates cứng; `lapjv` 1-1; thắng margin + đủ streak mới `_bind` cùng GID.
- **Vai trò**: trước — homography (thẻ 3) + tracklet (thẻ 1); sau — thành công → identity active cam mới; timeout → dormant/token (thẻ 5); race với GID mới → `_bound_handoff_merge_allowed` (thẻ 6). Mất nó → mỗi lần qua cầu nối = tách ID, episode vỡ.
- **Nằm ở đâu**: ccm `_upsert_handoff` :2572 (refresh-gallery path :2603-2636), `_predicted_world` :2744, `_entry_depth` :2776, `_direction_cosine` :2823, `_candidate_cost` :2831 (appearance block ~:2935-2975, cost :3017), `_match_pending_handoffs` :3442 (lapjv :3615, margin :3622, streak :3658-3667). Race merge `_bound_handoff_merge_allowed` :3376. Order trong `update_all_tracks` ~ccm:7155.
- **Tại sao**: biên-camera + occlusion ngắn là chỗ ID tách nhiều nhất; multi-gate giảm gán nhầm khi 2 xe cùng qua `[suy luận]`. Alternative `[suy luận]`: chỉ appearance — chết khi 2 xe cùng màu; chỉ vị trí — chết khi đổi tốc; code giữ cả hai + dự đoán quỹ đạo.
- **Các bước** `[code]`:
  1. `_upsert_handoff` khi track ra `outward_edge`: entry TTL `handoff_ttl=45f` (giây nếu `handoff_ttl_seconds` có); entry sống theo track sống, refresh gallery/bbox mỗi frame (:2588-2636).
  2. `_predicted_world`: `last_world + velocity·elapsed` — per-second nếu `handoff_ttl_seconds`+timestamps (fallback per-frame ×25fps, :2759-2764).
  3. `_candidate_cost` gates cứng **theo thứ tự**: parking-hold/occluded → reject; residual >`prediction_radius` → `"prediction_distance"`; overlap → `pointPolygonTest` signed < −radius → reject; edge-handoff → `_entry_depth` > entry_limit → `"outside_entry_corridor"` (px-ảnh, polygon-normal nếu mask, :2776-2821).
  4. Appearance `compare_tracklets`: `hard_limit = min(0.45, appearance_threshold)` (target-cam ref) else `appearance_threshold=0.45`; **soft-overlap** chỉ ≤`max(hard, min(0.60, relaxed))` = 0.60 + residual ≤ 4.634cm → `bind_eligible=False`, cần temporal; **adaptive** (non-overlap, source ref, residual ≤ max(4.634·1.25, 15·0.50)=7.5cm) → nới tới `relaxed=0.82`; vượt limit → reject `"appearance"` (:2935-2975).
  5. `_size_distance` >0.90 → `"size"`; `_direction_cosine` <`min_direction_cosine=0.25` → `"direction"` (None khi |v|<1.0 → `direction_cost=0.20`, :2823-2829, :2983-2992).
  6. `strong_overlap` = overlap + app≤0.30 + support≥2 + residual≤4.634cm (`strong_spatial_distance`).
  7. `cost = 0.55·(residual/25) + 0.30·appearance + 0.10·size + 0.05·direction_cost` ≤ **0.92** (:3017) → LAPJV `cost_limit=0.92` (:3615) + margin 0.08 (:3622) + streak {strong-overlap 2 / overlap 3 / temporal 2 / else 1} (:3658-3667) → `_bind`.
- **Tham số (deep)**: `handoff_ttl=45` tc:1926; `lookahead=16f` tc:1949; `defer=8f` tc:1944-1948; `min_direction_cosine=0.25` tc:1951; thresholds `0.45/0.82` tc:1928/:1931; `prediction_radius=25cm`/`match_distance=15cm`/`dup=4.634cm`/`strong=4.634cm` (§0b); `edge_margin=40` + entry_limit formula :2895-2907; cost weights + cap :3017.
- **Storyboard** (cùng cảnh — xe A đỏ cam1 ra biên phải, mảnh cam2 xuất hiện f+6; xe B trắng cũng ở cửa; xe C đỏ-tươi):
  - TẮT: k1 mảnh → GID mới G#9; episode G#5 kết giả — 1 xe = 2 episode.
  - BẬT: k1 pending handoff + điểm hẹn dự-đoán trên map. k2 A: residual 11cm<25 ✓, app 0.21≤0.45 ✓, size 0.12 ✓, dir-cos 0.71≥0.25 → dir_cost 0.145 → **cost 0.55·(11/25)+0.30·0.21+0.10·0.12+0.05·0.145 = 0.324** ≤0.92. k3 B trắng: app 0.83 > hard 0.45 và > relaxed 0.82 → **reject `"appearance"` tại gate — không vào ma trận** (đúng code: gate trước cost). k4 C đỏ-tươi: app 0.40 ✓, residual 20cm → cost 0.44+0.12+0.02+0.011 = **0.591** — vào ma trận. k5 LAPJV: A 0.324 vs C 0.591, chênh 0.267 ≥ margin 0.08 → A thắng; streak đếm 2 (strong-overlap nếu đủ app≤0.30+residual≤4.634) hoặc 3 frame trước khi `_bind`. k6 `local#7→G#5`.
- **QA**: (1) Vì sao streak 2-3f? code bắt buộc `[code]`; tránh gán theo 1 frame nhiễu `[suy luận]`. (2) Entry-depth px vs residual cm trộn đơn vị? — đúng, 2 đơn vị khác nhau `[code]` — minh hoạ phải tách. (3) Handoff mở nhưng đích đã có GID confirmed → `_bound_handoff_merge_allowed`: target ≤3f → cho merge; source ≤3f → cần same-view gallery ≤0.30; cả hai established → reject `"both_global_ids_established"` (:3376-3440) `[code]`.
- **Chắc chắn**: cao toàn bộ gates/cost/LAPJV/streak/race `[code]`; lý do thiết kế `[suy luận]`.

## [T2] Thẻ 3 — Homography / shared-map (nền tảng N9–N11)

- **Bài toán**: 2 cam nhìn cùng bãi ở 2 góc — "gần trên ảnh" ≠ gần thật; mọi so-khớp vị trí cần **1 bản đồ chung đo cm**.
- **Làm gì**: calibration offline → homography 3×3 mỗi cam (ảnh-px → map-cm); runtime mọi vị trí/vận-tốc/khoảng-cách qua `_world()`.
- **Vai trò**: trước — `calibrate_map.py` UI + `tools/rectangle_line_calibration.py` fit + `load_calibration` gate file; sau — mọi ngưỡng N9/N10/N11 là cm trên map này (§0b); token/binder cũng chiếu qua transforms (`build_recovery_track_payload` tc:622-663). Mất nó → fallback crop-offset (ccm `_local` :1424-1427) méo mọi distance gate.
- **Nằm ở đâu**: tạo `calibrate_map.py` (8 cặp; preview `findHomography` :284); fit `tools/rectangle_line_calibration.py` :41-109, `fit_gate` :112; nạp `tc:284-341` (`load_calibration`); dùng ccm `_world` :1370, `_local` :1422, `_bbox_anchor` :1399-1402, `_track_world` :1407, `_world_velocity` :2458-2468.
- **Tại sao**: map chung → direction/depth/residual có nghĩa vật-lý. Alternative `[suy luận]`: match thuần ảnh chỉ đúng khi cam cùng crop (chính là fallback `_local`). Vai trò điểm ghi trong code: A–D `metric_anchor`, V1–V4 `line_correction` (rl_calib:108).
- **Các bước** `[code]`:
  1. Click 8 cặp tương ứng: A–D góc chữ-nhật đo cm `A(0,0)B(AB,0)C(AB,AD)D(0,AD)`; V1–V4 cùng một vạch.
  2. Validate: tứ-giác lồi ≥100px², cách ≥4px@1280, V-span ≥max(80px,0.75·rộng), lệch-đường ≤8px, liên-tục (:58-78).
  3. `compute_distributed_shared_homographies` min_inliers=8, ratio=1.0, dùng cả 8 cặp (:87-90); so với "before" = A–D-only (:93-95).
  4. `fit_gate`: `max_error_cm≤2.0, p95≤8.5px, max≤12px` (:112); `load_calibration` chặn: algorithm `rectangle_line_v1` → bắt `calibration_status=="reviewed_fit"` + `visual_review.accepted` + report `fit_ready` + 8 điểm + đủ 2 cam + fit_gate pass (tc:287-300); schema≥5 → status `"passed"` hoặc reviewed (:301-304); transforms 3×3 finite det≥1e-12 (:308-313); adjacency **đúng** `cam1:right→cam2` + `cam2:left→cam1` (:315-320); overlap polygon ≥3 điểm (:330-331).
  5. Runtime: `_track_world` = `_world(_bbox_anchor)` — `bbox_center` runtime → `(cx, cy−h/2)` (ccm:1399-1402, :1407); `cv2.perspectiveTransform` qua `camera_transforms` (:1370-1377).
  6. Vận tốc: `_world_velocity` = per-frame từ 5 điểm history cuối (:2458-2468); `velocity_world_per_second` EMA `0.65 cũ + 0.35 đo` khi có timestamp (:590-608).
  7. Ngưỡng resolve `resolve_matching_distance` tc:426-447 → ctor tc:2227-2261.
- **Tham số (deep)**: 8 cặp + roles rl_calib:41-108; gates rl_calib:112 + tc:287-341; anchor class `bottom_center` ccm:168 vs runtime `bbox_center` cfg:1461/tc:2160-2161, lý do tc:602-606; `world.bounds` cm cfg:7+; resolved §0b; `camera_transforms` từ `camera_transforms` trong cfg qua `adapt_calibration_to_frame_sizes` tc:2146.
- **Storyboard** (cùng cảnh — xe ở overlap, cam1 tâm-ảnh (812,340), cam2 (220,365)):
  - TẮT (fallback offset): k1 hai điểm "xa" 590px → cổng 15cm vô nghĩa → handoff không bao giờ khớp; k2 map chung không tồn tại — storyboard vẽ 2 timeline rời.
  - BẬT: k1 `perspectiveTransform` → world (35.2, 41.8)cm vs (34.9, 41.5)cm; k2 residual 0.4cm ≪15cm → cổng mở; k3 map vẽ 2 footprint cam + 2 điểm trùng; k4 v=−12cm/s → `_predicted_world` đặt điểm hẹn phía trước hướng đi.
- **QA**: (1) Calibration lệch 3cm → ăn vào bound 9.268cm của conflict-resolver `[code+suy luận hệ quả]`. (2) Vì sao `bbox_center` không phải chân-xe? code ghi: cam đối diện thấy 2 đầu xe khác nhau, tâm bbox khớp map hơn (tc:602-606) `[code]`. (3) Đủ 4 góc không? — cố ý thêm V1–V4 line-correction `[code]`; bẻ-cong map dọc-vạch `[suy luận]`.
- **Chắc chắn**: cao `[code]` cho pipeline calibrate→gate→runtime + anchor-override.

## [T2] Thẻ 4 — Trajectory memory: velocity + curvature (N9 → N10)

- **Bài toán**: xe biến mất vài giây (góc chết); "đường đi trước đó + hướng/tốc-độ có khả-thi tới đây không" — không chỉ "trông giống không".
- **Làm gì**: `TrajectoryMemory` lưu trail world-cm theo giây cho fragment/GID; `match` chấm hành-lang quỹ-đạo; `match_departure` đo "đang ra-khỏi-ô" cho token.
- **Vai trò**: trước — `observe_trajectories` nạp sample mỗi frame **trước cả token-recovery+alloc** (tc:2728), `_bind` promote fragment→GID (ccm:435); sau — `_match_world_trajectory_identities` (LAPJV `cost_limit=0.22` :6115) trong update_all_tracks; `parking_recovery_trajectory_evidence` (ccm:1536) nuôi binder (thẻ 5). Mất nó → dormant/departure chỉ còn appearance+điểm-cuối → đổi chỗ giữa các xe đậu gần.
- **Nằm ở đâu**: `tm.py` (552 dòng) — ctor :56-68, `observe/append` :79-105, `_estimate` (velocity median-5 :265-266, curvature median-turns :283), `match` :306-422, `match_departure` :424-508+, `provisional_samples` :542. Tích hợp: ccm `observe_trajectories` :1429-1510, `promote` :435, `merge` :1261.
- **Tại sao**: last-pos là điểm chết; quỹ-đạo = vector + lịch-sử → phân-biệt "đúng hướng xe đang lao" vs "xe khác đậu sẵn" `[suy luận]`. Alternative `[suy luận]`: chỉ `last_world`+bán-kính — code vẫn có như cổng phụ (`_reachable_distance_limit` ccm:4693).
- **Các bước** `[code]`:
  1. `observe_trajectories` mỗi frame: sample world+timestamp; **chỉ track `_has_fresh_detection`** mới được ghi (Kalman-predict không bao giờ thành "đo", :1457); unbound→`provisional`, bound→`global`; trail bị-drop → event `provisional_trajectory_forgotten` (:1494-1510).
  2. Giữ `history_seconds=2.0`s, ≤`max_samples=240`; velocity = median 5 bước cuối; curvature = median góc-rẽ `arccos`.
  3. `match(fragment, gid)`: corridor = khoảng-cách-điểm-tới-đoạn dự-đoán (point-segment, :357); `distance_score=1−d/radius`, `time_score=1−gap/window`; direction = cosine·(1−curv/π) discount; speed = `1−|log(ratio)|/log4`; stable = obs≥3.
  4. Hard rejects: corridor>radius→`"teleport"`; topology≤0→`"camera_topology"`; stable & dir<min_cos→`"stable_wrong_direction"` (:386-393).
  5. Score = `0.35·dist + 0.25·app + 0.15·dir + 0.10·speed + 0.10·min(time,topo) + 0.05·size` (:395-402); pass ≥`match_threshold=0.78`; LAPJV `cost_limit=0.22`=1−0.78 + margin `ambiguity_margin=0.12` (:6115).
  6. `match_departure`: origin = `_parked_origins[gid]` (điểm neo khi đỗ); đo `radial_gain = last−first dist-to-origin`; hard: first>radius→teleport; stable & radial_gain≤0→`"stable_not_leaving_slot"`; stable & cos(movement, outward)<0→`"stable_wrong_direction"` (:424-508).
- **Tham số (deep)**: `history_seconds=2.0` (tm:58; CLI `--trajectory-history-seconds` tc:1969-1971 default 2.0); `min_observations=3` tm:59; `match_threshold=0.78` tm:60; `ambiguity_margin=0.12` tm:61; `max_samples=240` tm:62; velocity median-5 tm:265-266; curvature median tm:283; LAPJV 0.22/margin ccm:6115; call-order traj-trước-token tc:2728 vs :2764.
- **Storyboard** (cùng cảnh — xe G#5 rẽ góc chết cam1 t=0, mất 1.2s, mảnh mới sát lối-ra):
  - TẮT: k1 chỉ last_world+radius — mảnh lối-ra và xe đậu-lâu cùng "trong bán kính" → 50/50; k2 token rời-ô không có bằng-chứng hướng → origin-gate rộng.
  - BẬT: k1 trail G#5 = điểm-cm/frame 2.0s, v=median-5 (−9,−2)cm/s, curvature nhỏ; k2 mảnh: dir-cos 0.8, speed 11cm/s → score 0.83≥0.78 → vào LAPJV-0.22; k3 xe-đậu: trail phẳng + `match_departure` radial_gain≈0 → `"stable_not_leaving_slot"`; k4 trail đứt-chỗ-mất + reachable-circle — "quỹ-đạo = cửa sau của ID".
- **QA**: (1) Vì sao median-5? chịu outlier 1-frame `[suy luận]` (docstring tm nói "robust"). (2) Score nặng dist 0.35 + calibration méo → nhạy thẻ 3 `[liên kết]`. (3) 0.78 cứng? — class default; runtime = `--trajectory-history-seconds` chỉ đổi window, không đổi threshold `[code: không có CLI cho match_threshold]`.
- **Chắc chắn**: cao cho call-order/weights/hard-rejects/LAPJV `[code]`; ý-đồ robust `[suy luận]`.

## [T2] Thẻ 5 — Dormant identity + departure token (N8 → N10)

- **Bài toán**: xe mất dấu (khuất/track-chết) hoặc **đang lùi ra khỏi ô** — vision-ô chưa báo trống, track đã đổi local-id. Hệ phải "nhớ" GID, không cấp mới.
- **Làm gì**: *dormant* — lost/expired → identity ngủ giữ gallery+world+velocity, fragment mới qua `_match_dormant_identities` (LAPJV ≤0.95). *token* — binder thấy "động-trong-ô-đậu" TRƯỚC khi ô báo trống → token TTL 5s, radius nở theo tuổi; ứng-viên qua origin/spatial/appearance/size/direction/evidence gates → `bind_external_id` — chạy TRƯỚC alloc.
- **Vai trò**: trước — N8 `notify_track_lost`/`expired` (tc:2690-2716) đóng ranh-giới dormant; sau — dormant-match + token-recovery ăn gallery (thẻ 1), world+traj (thẻ 3/4), rồi alloc; mất nó → lùi-khỏi-ô = "xe mới", episode-đỗ vỡ, reservation mồ-côi.
- **Nằm ở đâu**: dormant — ccm `notify_track_lost` :1064-1080 → `_set_identity_dormant` :633+; `notify_track_expired` :7501-7582 (exit-zone→`exited` :7569, `vanished_near_roi_edge` :7566); `_match_dormant_identities` :4911, LAPJV :5526; `_identity_is_recent` :4614-4657, `_same_camera_recovery_is_stale` :4659-4691, `_reachable_distance_limit` :4693-4711, `_dormant_candidate_distance_limit` :4713+, `_reid_window` :4357-4371, `_dormant_reid_ready` :2419-2445. Token — svb `prepare_predeparture_tokens` :479-538, `_create_departure_token` :1449-1523, `_token_radius` :603-609, `export_recovery_tokens` :611+, gates ~:2794+; global recovery tc:812-921.
- **Tại sao**: mất-track ≠ mất-xe; token giải "đang rời nhưng ô chưa trống" mà không cấp ID sớm. Alternative `[suy luận]`: đợi ô trống mới nhận — chậm ≥ vision-latency, xe ra khỏi vùng; code ghi token phải trước empty-vision (svb:479 docstring).
- **Các bước** `[code]`:
  1. `notify_track_lost`: resolve canonical GID → `_set_identity_dormant` → event. `notify_track_expired`: dormant (merge gallery), pending-handoff→`handoff`, exit-zone→`exited`, ROI-starved→flag.
  2. `prepare_predeparture_tokens`: unbound-fragment gần ô-đậu, nearest-vs-2nd normalized ≥0.15 → token sớm `predeparture=True`,`confirmed_empty=False`, reason `motion_started_in_parked_slot`.
  3. `_create_departure_token`: expiry = `t + recovery_retention_seconds`; `confirmed_empty` sau ≥2 empty-obs; predeparture re-anchor tại empty-đầu.
  4. `_match_dormant_identities`: unbound-fragment trưởng-thành (`_dormant_reid_ready` — confirmed + fragment≥3f hoặc visible≥3, :2428-2445); chỉ nhận `dormant/handoff/parked/recovery_pending`; bỏ occluded+parking-hold; topology adjacent; reservation-authoritative.
  5. Mỗi cặp: `_identity_is_recent` (parked exempt :4636-4642; established ×4 :4644-4649; same-cam moving-limit 12s/36f :4680-4684 + ROI-edge ×2 :4685-4691) → distance-limit (`_dormant_candidate_distance_limit` + reachable = margin4.634 + 1.5·speed·elapsed) → appearance (same-cam ≤0.30, cross ≤0.45, source-only cửa-sổ-ngắn) → size ≤0.92 → direction-claim (≥3 obs, support≥2) → LAPJV `0.95` :5526 → `_bind`.
  6. Token recovery: radius `0.05→max×slot_diag` tuyến-tính theo `recovery_expand_seconds` (svb:603-609); gates origin/spatial/appearance/size(0.40-2.50, traj-qualified 0.15-6.0)/direction/`evidence_frames=3`; global pass dedupe (rank confirmed-empty→newer→remaining-ms), 1-1 → `bind_external_id`.
- **Tham số (deep)**: retention `60s`(tc:1952)/moving `12s`(tc:1954-1960)/frames `180`(tc:1962); `handoff_ttl 45f`; `_reid_window` evidence=`max(defer8, min_obs5)=8` else `45` (ccm:4364-4368); token `retention 5.0s` (svb:225 + tc:1883-1887); expand `0.05→0.85×diag`/`1.0s` (**class 0.45 svb:228 → CLI 0.85** tc:1890-1897 → ctor tc:2331; clamp `max(initial,·)` svb:280-283); appearance **class 0.55 svb:231 → CLI 0.62** (tc:1900-1905, help "van can du 3 mau lien tiep"); `evidence_frames=3` (svb:230, clamp ≥2 svb:285); size `(0.40,2.50)` svb:234; relaxed `0.70`/overlap `0.25` svb:232/235; `min_vehicle_overlap=0.35` svb:217; dormant LAPJV `0.95`; `dormant_appearance_threshold=0.60` (tc:1964 → ctor :2247); `provisional_origins` giữ epoch-start ngoài rolling-window (tm:71-75).
- **Wakeup-polygon vs signed-gate** `[code]`: 2 hình học khác nhau, không trộn — (a) **wakeup**: `recovery_priority_regions` scale polygon quanh-centroid `1 + 2·radius/diag` (svb:2663-2668 + `_expanded_polygon` :2653-2656) chỉ để "đánh thức" detector nhạy ở N1 — comment svb:2665-2666 ghi rõ "only used to wake the sensitive detector; recovery itself uses an exact signed pixel distance"; (b) **gate thật**: `_signed_polygon_distance(point, token.polygon)` so `−max_radius = −0.85·diag` (svb:2875-2876, :2980-2992) — candidate xa hơn band ngoài + overlap=0 + không-evidence → `continue` (protected_pairs chỉ khi qua).
- **Storyboard** (cùng cảnh — xe G#5 đỗ A05; vision lag; lùi ra, local#5 chết, fragment local#7 sinh):
  - TẮT dormant+token: k1 #5 chết → G#5 xoá; k2 #7 → G#9 mới; k3 reservation A05 mồ-côi, episode "đỗ" kết-thúc giữa-chừng.
  - BẬT: k1 lost → G#5 dormant giữ gallery+world+vel; k2 #7 trong vùng ô → **predeparture-token trước khi ô báo trống**; k3 radius nở 0.05→0.85·diag/1s + app 0.21≤0.62 + size ok + direction-outward + evidence 3/3 → `bind_external_id(#7→G#5)`; k4 ≥2 empty-obs → `confirmed_empty` + retention 60s; k5 timeline "G#5 sống xuyên mất-dấu" — ranh-giới: lost→dormant N8, sống-lại N10.
- **QA**: (1) Retention established ×4 / ROI-edge ×2 — code có, lý-do "xe chính-chủ đáng-tin, chết-vì-ROI không phải lỗi" `[suy luận]`. (2) Token ăn nhầm xe-ngang? — 0.15 disambiguation + origin + outward + evidence-3 + traj-qualified `[code]` — đa-cổng. (3) Token hết-5s? — dormant LAPJV-0.95 vẫn là lưới-an-toàn; token = đường-tắt `[code+suy luận]`.
- **Chắc chắn**: cao cho ranh-giới/call-order/ngưỡng `[code]`; `parking_recovery_trajectory_evidence` phần competing-reservation đã đọc :1536-1595 nhưng chưa rà từng-dòng `[chưa xác minh chi-tiết]`.

## [T3] Thẻ 6 — GID conflict / merge collision / probation (N11)

- **Bài toán**: merge-sai (2 xe → 1 GID) "khó-sửa" hơn tách-sai; khi 2 GID nghi-trùng hoặc 1 GID ôm 2 vết-sống khác-nhau, hệ phải **chặn merge rủi-ro** và **tách member sai**.
- **Làm gì**: probation — GID mới sống ≥5f mới được merge/bind-slot; `_check_merge_collision_risk` chặn merge khi xung-đột vị-trí/reservation/occlusion; 2 resolver dọn "1 GID 2 vết" cùng-cam & chéo-cam bằng giữ-member-hợp-gallery nhất.
- **Vai trò**: trước — handoff/dormant/world-traj đề-xuất bind/merge; sau — resolvers chạy gần-cuối `update_all_tracks` (ccm:7485-7486) rồi refresh/cleanup; mất nó → merge-sai "dính" 2 xe mãi, episode hai-xe-gộp — nặng hơn duplicate.
- **Nằm ở đâu**: ccm `_is_provisional` :509-523, `provisional_since_frame` set :626-627, `merge_probation_frames=5` ctor :173/:280; `_merge_global_ids` :1201 (canonical=min :1258-1259, guards :1215-1227); `_check_merge_collision_risk` :1082-1183; `_resolve_same_camera_global_conflicts` :3125-3224; `_resolve_cross_camera_global_conflicts` :3226-3374; `_cross_merge_would_conflict` :3088-3123; `_bound_handoff_merge_allowed` :3376-3440; `_reconcile_dormant_duplicates` :6854+; helpers `_has_fresh_detection` :2243-2266, `_is_allocatable` :2269+, `_new_global_id_ready` :2337-2417.
- **Tại sao**: docstring :514 ghi nguyên-tắc "ID duplicate tạm thời ít nguy hiểm hơn ID collision" `[code]`. Alternative `[suy luận]`: merge-tham-lam theo cost-thấp — hỏng vì cost-thấp ≠ cùng-xe khi appearance nhiễu → code thêm collision-guard + evidence-liên-tiếp.
- **Các bước** `[code]`:
  1. Identity mới → `provisional_since_frame=frame_idx` (:626); `_is_provisional` khi `elapsed < 5f` → merge/bind-slot non-verified bị chặn (:1109-1183 nhánh provisional).
  2. `_merge_global_ids`: chặn ngay nếu pair ∈ `_independent_global_pairs` (`independently_observed_vehicles`) hoặc occluded → event `merge_blocked_collision_risk` (:1215-1227).
  3. `_check_merge_collision_risk`: parking-hold (trừ verified_transfer), parked-reservation (trừ departure-owner), cả-hai active-recent & khoảng-cách >`match_distance×2`, provisional — reject.
  4. Merge pass → canonical = **GID nhỏ-hơn/cũ-hơn** (:1258-1259); alias+`trajectory.merge`+gallery/size/reservation chuyển-chủ+rebind (:1260-1300).
  5. Same-cam resolver :3125: group (cam,canonical); bỏ-qua nếu mọi cặp là motion-echo; `owner_rank=(app_dist, size_dist, −binding_frame, −visible, local_id)` → detach còn-lại → ID-less phần-frame-này, event `same_camera_global_conflict_detached`.
  6. Cross-cam resolver :3226: chỉ member có **fresh detection** (`invisible==0`, loại coasting/merged/ambiguous :2243-2266); cặp khác-cam divergence >`2×4.634=9.268cm` cần **2 frame liên-tiếp**; >`3×4.634=13.902cm` (bất-khả-thi) → detach ngay frame-đầu; loser → ID-less.
  7. `_new_global_id_ready` :2337: allocatable + `fragment_visible_count≥5` + displacement ≥`max(6px, 0.15·diag)` + unusual-size gate → giảm GID-rác phải-dọn.
- **Tham số (deep)**: `merge_probation_frames=5` :173/:280; divergence `2×`/`3×` dup-4.634cm → **9.268/13.902cm** (:3278-3279); 2-frame-evidence :3306-3312; fresh-detection blacklist :2253-2263; owner_rank :3174-3199/:3314-3344; `new_identity_min_observations=5` tc:1980-1983/ccm:163, `unusual_size_obs=12` tc:1986-1989/ccm:164, `min_displacement_ratio=0.15` tc:1992-1995/ccm:165 (kẹp `max(6px, ratio·diag)` :2378-2380); handoff-race `_bound_handoff_merge_allowed`: target≤3f→allow, source≤3f→cần same-view≤0.30, else reject (:3408-3440).
- **Storyboard** (cùng cảnh — G#1 lỡ ôm cam1#50 VÀ cam2#50, anchors-map cách xa; kiểu-bug-thật hiep7-f1791 ghi trong :3237):
  - TẮT resolvers: k1 G#1 bound cả 2 vết; k2 map hiển thị **1 GID ở 2 chỗ 11cm+xa-nhau** — episode 2 xe gộp-1 không-ai-sửa; k3 cam1#50 thật mất → G#1 bám cam2#50 sai-xe vĩnh-viễn.
  - BẬT resolvers: k1 phát-hiện cặp divergent **11cm** (giữa 9.268–13.902 → vùng mơ-hồ): frame-1 đếm evidence=1 **chưa tách**; k2 frame-2 evidence=2 → detach member yếu (cam2#50 app 0.61 vs cam1#50 0.18 → giữ cam1#50); k3 cam2#50 → ID-less chỉ frame-này → dormant/ReID cứu-lại vòng-sau (thẻ 5); k4 trường-hợp >13.902cm (bất-khả-thi) → detach ngay frame-đầu không-chờ.
- **QA**: (1) Vì sao duplicate-tạm an-toàn hơn? — docstring :514 `[code]` — trade-off viết sẵn. (2) 2-frame chậm? — extreme >3× skip requirement `[code]`; chỉ vùng-mơ-hồ chờ. (3) ID-less mất hẳn? — chỉ "phần-còn-lại của frame", được recover vòng-sau `:3249` `[code]`.
- **Chắc chắn**: cao cho probation/guards/2-resolver/rank/race-merge `[code]` (đã đọc từng-dòng các hàm trên phiên này).

---

## Checklist LEAD (đã sửa)

1. ✅ **Conflict K3 sửa**: resolved dup = **4.634cm** → bounds **9.268 / 13.902cm**; ví dụ mơ-hồ dùng **11cm** (nằm giữa) cho đường 2-frame; >13.902 → instant. **Thêm OFF/ON song song cùng cảnh 4 khung** + hệ-quả "1 GID 2 chỗ → episode gộp vĩnh-viễn".
2. ✅ **Handoff xe B sửa**: appearance 0.83 > hard 0.45 và > relaxed 0.82 → **reject `"appearance"` tại gate** (`return None,"appearance",details` ccm:2990), không vào ma trận — storyboard không còn "vừa pass-gate vừa score". Đường code đã verify: hard `min(0.45, thr)`, soft-overlap `≤min(0.60,0.82)=0.60` + residual≤4.634cm, adaptive ≤0.82 (non-overlap+source-ref+residual≤7.5cm). Competition giữ nguyên qua candidate C (0.40 → cost 0.591 vs A 0.324).
3. ✅ **Mọi `~line`/`chưa-đối-chiếu` đã verify trực tiếp**: `strong_spatial_distance=4.634cm` (ccm:226-229), quality-gate (td:85-91 + mt:427-429), `new_identity_*` (5/12/0.15, ccm:163-165 + tc:1980-1995), trajectory ctor (tm:56-68), `load_calibration` gates (tc:284-341), `use_deep_reid` bị-cấm (ccm:388-397), resolved-distances có file:dòng (§0b: tc:387-447 + :2154-2190 + cfg:134/1463-1468, median 9.2675cm đo-thật 60-ô).
4. ✅ **Thu gọn + tách "Tham số (deep)"** mỗi thẻ; nhãn `[code]`/`[suy luận]`/`[chưa xác minh]` nhất-quán; alternative luôn gắn `[suy luận]`.

## Còn mở (không block — ghi trung-thực)

- `parking_recovery_trajectory_evidence` (ccm:1536-1595): đọc phần đầu; competing-reservation chi-tiết chưa rà.
- `_reconcile_dormant_duplicates` (ccm:6854+): đọc đầu — fold dormant-dup, appearance ≤min(dormant_thr, 0.30), skip parked/occluded/provisional; body đầy-đủ chưa rà.
- `update_all_tracks` tail (:7238-7492): thứ-tự block đã verify qua grep-call; số-dòng-từng-call xấp-xỉ.
- Dossier cũ (stage-map plan-trước) → `builder-b.pre-megaplan.md`.
