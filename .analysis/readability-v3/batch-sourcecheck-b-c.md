# batch-sourcecheck-b-c.md — C đối chiếu trực tiếp claims của B (reid + handoff)

**Yêu cầu LEAD:** kiểm 3–5 claim trong code hiện tại, không sửa file B.
**Kết quả:** đã đọc trực tiếp `tracklet_descriptor.py` (td), `motion_tracker.py`
(mt), `cross_camera_manager.py` (ccm), `two_camera.py` (tc) ngày hiện tại.

**Tóm tắt:** `batch-checkpoint-b.md §4` đúng gần như toàn bộ vị-trí file:dòng;
`batch-b.md §3` có **5 claim sai ref/giá-trị** — trong đó 1 claim bịa chênh
runtime-vs-class (class defaults 16/6/32 không tồn tại — runtime=class=12/3/24).

---

## Bảng đối chiếu

| # | Claim (nguồn) | Code thật | Kết quả | Ảnh hưởng |
|---|---|---|---|---|
| 1 | **report:** td:81–91 `_sample_is_usable` — vùng ≥120px², mờ <0.38 | td:81–91 = `compute_sample_quality`: `min_area=200`, `min_foreground_ratio=0.15`, reject khi score <0.5 (docstring :91). Không có giá trị 120/0.38 đâu trong file | **SAI giá trị + SAI tên hàm.** checkpoint-B đúng (area 200/fg 0.15/reject <0.5) | Nếu default layer/Deep của reid ghi 120px²/0.38 → phải sửa thành 200px²/15% nền/điểm<0.5 |
| 2 | **report:** td:277 `use_deep_reid`→ValueError | td:277 = `merge_appearance_samples` (gộp kho mẫu). ValueError thật ở **ccm:391–395** (ctor manager, comment :388–390) | **SAI file ref.** checkpoint-B đúng (ccm:388–397) | Deep/ref card của reid phải đổi ref |
| 3 | **report:** runtime 12/3/24 vs class 16/6/32, truyền ctor `mt:427-429` | Class defaults: `mt:50–51` (tracklet 12/3) + `ccm:162` (gallery 24). Runtime args `tc:1965–1967` = **12/3/24 — giống hệt class**. `mt:427-429` là callsite quality-gate (`quality<0.5`→reject), không phải ctor | **SAI 2 lớp:** (a) class-default 16/6/32 không tồn tại — runtime=class, không có override; (b) ref ctor nhầm | Nếu content reid vẽ "runtime siết chặt hơn class" → sai cơ chế; sửa thành "mặc định 12/3/24". `mt:427-429` chỉ đúng vai trò "mẫu xấu bị loại trước khi vào kho" |
| 4 | **report:** ccm:2572–2636 `_register_cross_camera_handoff_candidate` + cổng cứng | ccm:2572–2636 = `_upsert_handoff` (làm tươi entry — gộp mẫu, cập nhật vị trí/vận tốc). Hàm tên đó **không tồn tại**; cổng cứng nằm trong `_candidate_cost` **ccm:2831–3018** (appearance :2934–2990, size>0.90 :2997, direction<0.25 :3002, cost≤0.92 :3017) | **SAI ref + tên hàm** (giá trị cổng thì đúng: hard 0.45, size 0.90, dir 0.25, cost 0.92). checkpoint-B ghi "ccm:2572-2636 (TTL 45f)" cũng lệch — TTL là arg tc:1926 | Deep card handoff sửa ref → `_candidate_cost` ccm:2831–3018; giữ nguyên các số cổng |
| 5 | **report:** ccm:2744–2774 deferred confirm `handoff_confirm_frames={2,3,2,1}` | ccm:2744–2774 = `_predicted_world` (dự đoán vị trí — đúng như checkpoint-B). Không có biến `handoff_confirm_frames` nào cả; streak thật tính inline `required_evidence` tại **ccm:3664–3673**: overlap→2|3, temporal→2, thường→1 | **SAI ref + tên biến** (giá trị {3,2,1} đúng ngữ nghĩa). checkpoint-B đúng | Nếu handoff Deep ghi "handoff_confirm_frames" → đổi tên/vị trí; số "2/2 khung" minh họa vẫn ổn |
| 6 | **report:** ccm:2776–2829 + :2935–2990 cost weights {0.55/0.30/0.10/0.05} cap 0.92, margin 0.08 | ccm:2776–2829 = `_entry_depth` (:2776) + `_direction_cosine` (:2823) — đúng như checkpoint-B. Cost weights thật ở **ccm:3017–3018**; margin 0.08 ở **:3623–3624** (trong vòng assignment, kèm lapjv cap 0.92 :3615) | **SAI ref** (giá trị đúng). checkpoint-B đúng | Deep card handoff sửa ref |
| 7 | **report:** `handoff_pending_ttl=45` (tc:1926) + `handoff_hist_hard=0.45` (tc:1928) | tc:1926 = `--handoff-ttl` default **45** ✓; tc:1928 = `--handoff-appearance-threshold` default **0.45** ✓ (relaxed 0.82 tc:1930–1932 ✓) | **ĐÚNG giá trị, SAI tên arg** | Trị số giữ nguyên; nếu Deep ghi tên arg → đổi |
| — | report: appearance hard 0.45/soft 0.60/adaptive 0.82 (qua checkpoint) | ccm:2936–2990: hard=min(0.45,thr) khi target-ref; soft=min(0.60,relaxed) cho overlap; adaptive dùng relaxed (arg 0.82) | **ĐÚNG** (cả 2 file khớp) | — |

## Bổ sung đúng từ report (đã verify, không cần sửa)

- `td:308–345` `compare_tracklets` — trọng số 0.50·gần-nhất + phủ/trung-bình/đôi-tốt
  (:321–340) ✓; `missing_distance=0.25` default.
- `ccm:3376` `_bound_handoff_merge_allowed` tồn tại ✓.
- `--cross-camera-defer-frames` default 8 tc:1944–1948 ✓;
  `--handoff-min-direction-cosine` 0.25 tc:1951 ✓.
- Ngưỡng "0.82 giới-hạn trên" của reid — relaxed appearance arg tc:1930–1932
  (default 0.82, chỉ nhánh adaptive/duy-nhất) — đúng ngữ nghĩa.

## Ảnh hưởng tới default layer (ước tính từ text report, B tự soi file)

- Claim 3 (class 16/6/32) **nghiêm trọng nhất**: nếu Deep/realParams của reid
  ghi "class default 16/6/32, runtime siết 12/3/24" thì đó là fact sai —
  runtime=class=12/3/24, không có override. Chỗ khác runtime-vs-class thật
  (ví dụ ensemble ratio 0.20→0.12) thì giữ nguyên.
- Claims 1/2/4/5/6 chủ yếu sai **file:dòng + tên hàm** trong sourceRefs/Deep —
  cơ chế mô tả (gates, streak, quality) đúng về giá trị. Sửa ref là đủ.
- Default layer (summary/story/caption) của reid/handoff không chứa các số
  sai này → ảnh hưởng Deep/④ nhiều hơn lớp mặc định.

## B tự sửa theo

B được yêu cầu sửa `batch-b.md` + content/pages own theo bảng trên; C không
đụng file B. Các claim này không ảnh hưởng ROI đã đóng băng.

---

## FINAL — kiểm độc lập trên bản B đã sửa (homography + trajectory + reid/handoff + gate/session/snapshot)

C đọc trực tiếp code hiện tại, đối chiếu sourceRefs đã-sửa của B (`js/content/{homography,trajectory,reid,handoff,gate,session,snapshot}.js`). Không sửa file B.

### Homography — 4/4 claims ĐÚNG

| Claim của B | Code thật | Kết quả |
|---|---|---|
| 8 cặp A–D+V1–V4 bắt buộc | `rl_calib:41–44` `len(labeled)<8 or set(ordered)!=set(LABELS)` | ĐÚNG (LABELS ở :25) |
| `fit_gate` trả (bool, failures) | `rl_calib:112–127` — gates p95/max px-error, spread, edge % | ĐÚNG |
| `load_calibration` gates runtime | `tc:287–322` — `calibration_algorithm`/`status`/`visual_review.accepted`/`report.status`/`point_count`/adjacency/ma-trận 3×3 finite det≥1e-12/fit_gate | ĐÚNG |
| anchor `bottom_center` class → `bbox_center` runtime qua payload | `ccm:168` class default → config `calibration.json:1461` `"shared_map_anchor":"bbox_center"` → đọc `tc:2155–2161` (`tracking_defaults` từ `latest_calibration`) → wiring `tc:2258` | ĐÚNG |

Số Deep (p95 8.5px / max 12px / rect 2cm) không nhắc lại trong sourceRefs — chỉ nằm trong note `fit_gate` chung; tham chiếu rl_calib:112–127 là đủ.

### Trajectory — scope `.78/.12` ĐÚNG, runtime=class

- **Runtime wiring:** `ccm:379–384` ctor `WorldTrajectoryMemory(match_threshold=0.78, ambiguity_margin=0.12)` — **hardcode trong ctor**, không qua CLI arg (không có `--trajectory-*` flag).
- **Class defaults:** `tm:60–61` `match_threshold: float = 0.78`, `ambiguity_margin: float = 0.12`.
- Kết luận: `.78/.12` = runtime=class, ctor ghim tường-minh. Nếu content ghi "runtime override" thì sai; nếu chỉ ghi "ngưỡng 0.78/0.12" thì đúng.

### ReID — B đã sửa đúng theo round-1 (verify trên file mới)

| Ref mới của B | Verify trực tiếp | Kết quả |
|---|---|---|
| `td:18–78` 416-D, weights 0.70/1.20/0.60 | `td:39` `np.zeros(416)`; `td:63–65` `0.70*HS + 1.20*lab + 0.60*lum` | ĐÚNG |
| `td:81–93` quality 200px²/0.15/reject<0.5 | `compute_sample_quality`: `min_area=200, min_foreground_ratio=0.15`, docstring <0.5 | ĐÚNG (đã sửa từ claim sai 120px²/0.38) |
| `td:277` dedupe ≤0.015 | `td:292` `histogram_distance(...) <= 0.015` trong `merge_appearance_samples` (:275) | ĐÚNG |
| `td:308` compare 0.50/0.20/0.20/0.10 | `td:339–344` chính-xác 4 trọng số | ĐÚNG |
| `ccm:547–587` `camera_appearance_samples` per-camera | `camera_appearance_samples` field thật (:78), `_observe_identity` gộp+replace gallery (:547–620) | ĐÚNG |
| `ccm:388–397` `use_deep_reid`→ValueError | `ccm:391–395` raise ValueError khi `use_deep_reid=True` | ĐÚNG |
| `mt:427–429` caller lọc mẫu trước khi vào kho | callsite quality-gate trong tracker | ĐÚNG (scope: callsite, không phải ctor) |
| `tc:1965–1967` runtime=class 12/3/24 | `--tracklet-max-samples 12 / --tracklet-sample-interval 3 / --global-gallery-max-samples 24` | ĐÚNG — *(flag names trong bảng này trước ghi nhầm `--local-gallery-*`; giá trị 12/3/24 đúng, docs-only fix)* |

~~**1 lệch nhỏ:** realParams ghi `tc:2387–2388 → tracker ctor` — thật là manager ctor~~ — **RETRACTED** (§6): đọc đủ context, `MotionVehicleTracker(` mở tc:2366 → :2387-2388 ĐÚNG tracker ctor; `CrossCameraManager(` mở tc:2227 → `tracklet_gallery_size` :2248. Nhãn B đúng ngay từ đầu.

### Handoff — B đã sửa đúng theo round-1

| Ref mới của B | Verify trực tiếp | Kết quả |
|---|---|---|
| `ccm:2572–2636` `_upsert_handoff` TTL-refresh | `def _upsert_handoff` tại :2572 | ĐÚNG (đã sửa từ tên-hàm-bịa round-1) |
| `ccm:2776–2829` `_entry_depth + _direction_cosine` | `def _entry_depth` :2776 · `def _direction_cosine` :2823 | ĐÚNG |
| `ccm:2934–2990` appearance gates | hard/soft/adaptive trong `_candidate_cost` | ĐÚNG |
| `ccm:3017–3018` cost 0.55/0.30/0.10/0.05 ≤0.92 | `cost = 0.55*residual/radius + 0.30*appearance + 0.10*size + 0.05*direction; ≤0.92` | ĐÚNG chính-xác |
| `ccm:3376–3440` `_bound_handoff_merge_allowed` | def tại :3376 | ĐÚNG |
| `ccm:3615–3673` lapjv+margin+required_evidence | margin 0.08 :3623–3624 · `required_evidence` 2\|3/2/1 :3663–3673 | ĐÚNG |
| `tc:1926/1949/1944-1948/1951/1928/1930-1932` CLI 45/16/8/0.25/0.45/0.82 | defaults khớp từng số | ĐÚNG |

### Gate / session / snapshot — ≥3 refs mỗi route, tất-cả ĐÚNG

**gate.js (5 sourceRefs + 4 realParams):**
- `gsc:229–256` `check_line_intersection` + orientation + `|direction|<1e-9` guard (:254–255) ✓
- `gsc:259–309` `_recent_measured_entry_crossing` def tại :259 ✓
- `gsc:483–493` continuity `0 < Δsource ≤ 1.0` ✓
- `gsc:865` `--poll-interval default=0.25` + `gsc:904–906` `sleep(max(poll,1.0))` retry + `sleep(poll)` ✓
- `gate_zones.json:16,28` `"direction":"positive"/"negative"` ✓

**session.js (13 file-refs):**
- `sm:29` `QR_DISPLAY_SECONDS = 120.0` ✓
- `sm:81–88` `_qr_expires_at` — explicit `qrExpiresAt` override, fallback createdAt+120s ✓
- `sm:355` `claim_session` WAITING_FOR_SCAN→SELECTING_SPOT (quirk: không check expiry — mutator chỉ đổi state) ✓

**snapshot.js (13 file-refs):**
- `tc:1802` `--json-fps default=5.0` ✓
- `tc:2817` throttle `1.0/max(json_fps,0.01)` ✓
- `tc:2844` `runtime_publisher.publish_snapshot(build_runtime_snapshot(...))` in-loop ✓
- `rs:106–113` `publish_snapshot` freeze deepcopy→encoded bytes, `_snapshot`/`_snapshot_json` latest-only mailbox (comment :134) ✓

### Tổng kết FINAL

- **B đã sửa đúng tất-cả findings round-1:** homography refs→rl_calib/tc thật, trajectory ctor, reid quality/ValueError/gallery-ctor, handoff `_upsert_handoff`/`_candidate_cost`/`required_evidence`. Không còn claim bịa.
- ~~Sai sót `tc:2387–2388`~~ — **RETRACTED** ở §6: đọc lại đủ context,
  `tc:2387-2388` ĐÚNG là tracker ctor (`MotionVehicleTracker(` mở
  :2366); manager ctor mở `tc:2227` (`tracklet_gallery_size` :2248).
  Nhãn của B đúng ngay từ đầu.
- **Gate/session/snapshot:** refs đầy-đủ, file:dòng chính-xác, giá-trị khớp.
- **Không sửa file B.** Flags trả cho LEAD dispatch owner-fix nếu cần.

*FINAL verify bởi C — đọc trực tiếp code hiện tại (rl_calib/tc/ccm/tm/td/mt/gsc/sm/rs).*

---

## FINAL §6 — recheck trên content SAU cleanup (actual new hashes)

B §6 báo 9/9 cleanup + migration done. C recheck trực tiếp facts mới trong
content files hiện tại (không chỉ report):

### Facts mới — TẤT CẢ ĐÚNG trừ 1 flag

| claim mới | verify trực tiếp | kết quả |
|---|---|---|
| trajectory `realParams["score internals"]` | tm:349-355 `predicted = pos + vel·gap` ✓ · :362 `1−d/radius` ✓ · :363 `1−gap/window` ✓ · :366 dir default 0.5 ✓ · :379-385 `1−|log r|/log4` ✓ · missing→0.5 | **ĐÚNG** công thức chính-xác |
| trajectory refs tm:306-426 + ccm:5748-6141 | `def match(` tm:306 (span tới `match_departure` :424); `def _match_world_trajectory_identities` ccm:5748 | **ĐÚNG** |
| homography EMA `0.65·cũ+0.35·mới`, lần-đầu lấy-thẳng | ccm:596-608 — `<1e-6 → measured` else `0.65·v + 0.35·measured` | **ĐÚNG** chính-xác |
| gid-conflict gates 5/12/0.15 runtime=class | tc:1980-1995 `--new-identity-min-observations 5 / unusual-size 12 / min-displacement 0.15`; ccm:163-165 ctor defaults **giống hệt** | **ĐÚNG** |
| session episode = nguồn-sự-thật `svb:331-333` | comment "One episode per physical parking occurrence. Sessions consume these by parking_episode_id" | **ĐÚNG** |
| session sm:255-302/371-389/449-464/574-600 | `create_session` :255 · `select_spot` :371 · `set_exit_navigation` :449 · `delete_session` :574 (+`:585` by_gid) | **ĐÚNG** |
| reid td:183 + callsites + compare→member_rank | `class AppearanceTracklet` td:183 ✓ · td:277/308 đã verify trước | **ĐÚNG** (xem flag file-label) |
| handoff `_candidate_cost` :2831-3018 + `_match_pending_handoffs` :3442-3673 | cả 2 def tồn tại đúng vị trí | **ĐÚNG** |
| dormant `_reconcile_dormant_duplicates` ccm:6854 | def tại :6854 | **ĐÚNG** |
| gate `_normalize_gate` gsc:196-207 + poll :864/:904-906 | def đọc direction từ config; `--poll-interval 0.25` :865 | **ĐÚNG** |
| snapshot `gsc:55,865,899-906` | `DEFAULT_RUNTIME_URL` :55 + poll loop :899-906 | **ĐÚNG** |

### ⚑ RETRACT — flag C trước đây SAI

`tc:2387-2388` trước C gắn cờ "nhãn tracker ctor sai — thật manager ctor".
**Đọc lại đủ context:** `MotionVehicleTracker(` mở `tc:2366`;
`tracklet_max_samples` `tc:2387` + `tracklet_sample_interval` `tc:2388`
nằm TRONG tracker ctor. `CrossCameraManager(` mở `tc:2227`;
`tracklet_gallery_size` `tc:2248` nằm TRONG manager ctor.
→ **B đúng ngay từ đầu; flag C retract.** Nhãn hiện tại của B giữ nguyên.

### ✓ FLAG CLOSED — file-label đã sửa (verify trên actual hash)

`reid` sourceRef `two_camera.py:2029-2033,2157-2163` → **B đã sửa thành
`motion_tracker.py:2029-2033,2157-2163`** (reid.js:14, note "tạo
AppearanceTracklet"). Verify trên actual file: hash mới
`9e1d33fd12728e6dc2464497bbc0fbb3` (md5-10 `9e1d33fd12` khớp B báo).
Content+dòng đúng: `mt:2029-2033` tạo `AppearanceTracklet(max_samples,
sample_interval)` + `.update()`; `mt:2157-2163` tạo-nếu-None + `.update()`
khi trusted.

## CLOSURE — 0 flag mở

| flag | status |
|---|---|
| ctor-label `tc:2387-2388` (C) | **RETRACTED** — B đúng ngay từ đầu |
| reid `tc→mt` file-label (B) | **CLOSED** — `reid.js` `9e1d33fd12728e6dc2464497bbc0fbb3` |
| CLI flag names trong bảng ReID (C) | **CLOSED** — docs-only fix `--tracklet-max-samples/--tracklet-sample-interval/--global-gallery-max-samples` |

**Sourcecheck FINAL: 0 open.** Tất cả facts B (round-1 corrections + §6
migrations) verify đúng trên actual post-cleanup content.

*§6 recheck + closure bởi C — verify trực tiếp trên content post-cleanup.*

