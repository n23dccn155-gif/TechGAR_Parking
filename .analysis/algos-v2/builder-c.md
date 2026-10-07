# builder-c.md — Dossier Phase 1 (MEGAPLAN §3, builder C)

**Status: IN_PROGRESS** · 7 thẻ được giao: T1×2, T2×1, T3×4 · Nodes N0, N2, N12–N15.
Nguồn sự thật: `two_camera.py:run()` + `src/techgar/*` + `frontend/src/*`.
Nhãn chắc chắn: **[code]** đọc trực tiếp · **[suy luận]** diễn giải hợp lý · **[chưa verify]**.
Mọi số minh họa trong storyboard là *deterministic illustrative*, không phải replay data.
Form rút gọn: mỗi thẻ 4 ý trọng tâm ngắn (Bài toán / Làm gì / Vai trò / Tại sao),
chi tiết đưa mục **Deep**; file nêu tên đầy đủ, phân biệt *callsite* vs *default*.

---

## T1-1 · Ensemble Slot Vision (25-vote + rescue + dwell) — Node N2

**Bài toán.** Camera nhìn xuống bãi xe: xe trắng hòa nền sáng, vạch kẻ ô bị
đếm nhầm "có xe", bóng nắng đổi liên tục — một threshold đơn không trả lời
được "ô này trống hay có xe" đủ tin cậy.

**Làm gì.** Mỗi ô được chấm bởi **25 biến thể tiền xử lý** (5 delta-gamma ×
5 delta-CLAHE trên kênh L của LAB). Mỗi biến thể bỏ 1 phiếu "trống" khi tỉ
lệ foreground sau lọc `< ratio_thr`; ô trống tức thời khi `empty_votes ≥
required_votes = 25//2 = 12` — **ngưỡng code, không phải đa số tuyệt đối**
(12/25 < 50%). Sau vote: center-cluster rescue cứu xe sáng chỉ lộ lõi;
`accept_evidence` thêm cam-kết theo thời gian (dwell + count) trước khi lật
trạng thái public.

**Vai trò.** Chạy trong worker song song; kết quả áp vào coordinator
**trước** identity allocation (`two_camera.py` comment :2511, call :2596).
Là nguồn `vision_occupied` duy nhất cho N12 binder — mất nó, binder chỉ còn
hình học track-overlap và nhầm xe đi ngang với xe đỗ.

**Nằm ở đâu.** `src/techgar/parking_detector.py`: `detect()` :439–600;
`accept_evidence()` :602–645; `_has_core_rescue` :418–428; `_filter_roi_threshold`
:321–416. Callsite production: `two_camera.py` ctor :2263–2277, `ratio_thr`
:2320–2322, worker `process_parking_frame` :1591, apply :2541/:2596.

**Tại sao.** [suy luận] Ensemble 25 variant rẻ (không model/GPU) và ít
nhất vài gamma tách được xe sáng khỏi nền; vote làm nhiễu variant lẻ không
đủ lật ô. Rescue tồn tại vì vote thuần bỏ sót xe trắng chỉ lộ lõi
(docstring :8). [suy luận] Alternative detector học (YOLO) không có trong
codebase — pipeline thuần OpenCV là kiến trúc hiện hữu.

**Các bước (ô B3).**
1. `detect()`: LAB→kênh L → 25 ảnh threshold (CLAHE→gamma-LUT→blur→
   adaptiveThreshold 25/16→median5→dilate) — `parking_detector.py`:458–513.
2. Mỗi variant/ROI: `_filter_roi_threshold` bỏ vạch mỏng dính biên
   (fitLine + distanceTransform bảo vệ khối dày) :373–387 → đếm ratio.
3. `ratio < ratio_thr` → `empty_votes+1` (:527); `ratio < min(ratio_thr,
   exit_ratio_thr)` → `exit_votes+1` (:529) — phiếu thoát nghiêm hơn.
4. `is_free = empty_votes ≥ 12` (:533–539); **rescue** lật về occupied nếu
   lõi đạt :542–547 + :418–428.
5. `accept_evidence`: monotonic guard (:610); ô occupied chỉ đổi khi
   `exit_votes ≥ 12` & không rescue (:627); ô trống đổi khi
   `instant_occupied` (:630); commit cần `count ≥ 2`/`3` **và** duration ≥
   `occupied_seconds`/`empty_seconds` (:636–639); chưa `initialized` →
   occupied (chưa biết ≠ trống, :641–643).

**Deep — tham số thật.**
| Tham số | Production (callsite) | Default signature | Ref |
|---|---|---|---|
| `ratio_thr` (enter) | 0.12 ← `--parking-enter-ratio` | 0.20 | `two_camera.py`:2322 (chỉ khi not `--legacy-parking-filter` :2320) · arg :1786 · `parking_detector.py`:103 (signature) |
| `exit_ratio_thr` | 0.08 | 0.08 | `two_camera.py`:2273 · arg `two_camera.py`:1787 · `parking_detector.py`:114 (sig) |
| `required_votes` | 12 (`25//2`) | — | `parking_detector.py`:533 |
| `occupied_seconds`/`empty_seconds` | 0.5 / 1.0 | 0.5 / 1.0 | `two_camera.py`:2274-2275 · arg `two_camera.py`:1788-1789 · `parking_detector.py`:115-116 (sig) |
| commit count | 2 occupied / 3 empty | — | `parking_detector.py`:638 |
| `core_scale` | **0.80** | 0.55 | `two_camera.py`:2270 · `parking_detector.py`:110 (sig) |
| `use_edge_recheck` | **False** | True | `two_camera.py`:2267 · `parking_detector.py`:106 (sig) — Pass-2 Canny :552–566 **tồn tại nhưng không chạy prod** |
| `smoothing_frames` | 1 | 5 | `two_camera.py`:2266 (`max(1,arg)`) · arg `two_camera.py`:1799 · `parking_detector.py`:105 (sig) — và prod `stable_evidence=True` nên worker gọi `detect(apply_smoothing=False)` `two_camera.py`:1597 → `TemporalSmoother` (:63–80) bị bypass hoàn toàn |
| `stable_evidence` / `selective_line_filter` | True / True | False / True | `two_camera.py`:2271-2272 · `parking_detector.py`:113,:117 (sig) |
| `border_ignore_ratio`/`line_min_span`/`line_max_thick` | 0.12/0.45/0.18 (mặc định) | = | `parking_detector.py`:107-109 |
| `core_ratio_threshold`/`core_component_threshold`/`core_rescue_raw_ratio` | 0.18/0.08/0.30 | = | `parking_detector.py`:111-112,:137 |
| worker cadence / staleness | 2.0 fps / 1.0 s | — | arg `two_camera.py`:1784,:1791-1794; gate drop :2587-2594; reject `evidence_not_monotonic` :2596-2601 |

**Storyboard** (1 cảnh: ô B3, xe trắng mũi ra cổng):
1. **TẮT ensemble** (1 ảnh base): xe trắng → filtered 0.09 < 0.12 → B3
   xanh TRỐNG (sai).
2. **BẬT 25-vote**: variant gamma thấp tách xe → `empty_votes=4 <12` →
   `instant_occupied` → B3 đỏ. *(illustrative)*
3. Xe chỉ lộ lõi: `empty_votes=13 ≥12` → free tức thời, nhưng rescue
   (core_ratio 0.22 ≥ 0.18 & component 0.09 ≥ 0.08) → vẫn đỏ.
4. Commit: mẫu occupied @t0 → pending; @t0.5 → `count≥2` & `0.5s` → flip
   → binder thấy `stable_occupied`.
5. Xe rời ô: cần `exit_votes≥12` (ngưỡng 0.08) + `count≥3` + `1.0s` →
   ~1.5s mới báo trống.
6. Worker trễ `age>1.0s` → drop tại staleness gate (`two_camera.py`:2587).

**QA phản biện.**
- Vote 13/25 bảo trống mà lõi sáng — ai kiểm chứng trước khi tin vote?
  (rescue :542)
- Xe rời ô mới 0.3s — có báo trống ngay không? (không: dwell + exit_votes)
- Edge recheck còn trong code — đọc signature sẽ tưởng chạy; callsite?
  (False, `two_camera.py`:2267)

**Chắc chắn:** cao — toàn bộ tham số callsite vs signature đã đối chiếu
[code]. Bẫy diễn giải: "smoother 5 frame" chỉ là default signature; prod
bypass qua `stable_evidence` và `smoothing_frames=1`.

---

## T1-2 · Slot Binder — fusion vision×track, one-way, arrival claim — Node N12

**Bài toán.** Vision cho biết "ô có xe" nhưng không biết **xe nào**;
tracker cho biết GID đang ở đâu nhưng **mất xe ngay khi nó dừng** (motion
detector). Cần một lớp buộc `vehicle_id ↔ slot` tin được cả khi hai nguồn
lệch pha.

**Làm gì.** `SlotVehicleBinder` hợp nhất hai luồng evidence. Ở policy
production `vision_primary`: **`occupied` = vision_occupied, chấm câu** —
`_sync_result` chỉ có hai nguồn quyết định `"vision"`/`"none"`
(`slot_vehicle_binder.py`:3841-3847). Track chỉ được gán `vehicle_id` lên ô
khi vision đã báo occupied (gate `update_tracks` :2204-2207) hoặc qua
arrival-claim khi track vừa mất (:2559-2564). Docstring "one-way override"
(:1-6) mô tả policy **legacy** — ở đó `occupied = vision OR
tracking_confirmed` (:3849-3856); production không chạy nhánh đó.

**Vai trò.** Sau N11 (GID canonical) — `remap_vehicle_ids` (:3736) chạy
trước `update_tracks`/`finalize_arrivals` trong loop (`two_camera.py`
:2793-2806). Xuất `parking_episodes` — bản ghi "xe X đỗ ô Y" authoritative
cho gate/session (:876-886, mở :1953). Mất nó → không ai nói được GID nào
đỗ ô nào sau khi track biến mất.

**Nằm ở đâu.** `src/techgar/slot_vehicle_binder.py` (3919 dòng):
`update_vision` :2431, `update_tracks` :2047, `_is_stopped` :1316,
`_advance_strong_overlap`/`_strong_overlap_is_stable` :1371-1447,
`_record_arrival_claim`/`_try_commit_arrival_claim` :1080-1283,
`_bind_vehicle`/`_release_vehicle` :1919-2045, `begin_frame`/`finalize_arrivals`
:2422-2429, `prepare_predeparture_tokens` :479-552, `parking_episodes` :876.
Callsite: `two_camera.py`:2326-2359 (`policy="vision_primary"` :2328).

**Tại sao.** [code] ArrivalClaim docstring :55-61: tracker mất xe khi dừng
→ claim giữ quan sát fresh cuối cho tới khi vision chậm hơn xác nhận.
[code] One-way theo thiết kế (docstring :3-5): xe đã dừng *có thể* biến ô
trống-thị-giác thành occupied (legacy), còn chiều ngược lại không bao giờ.
[suy luận] Production siết hơn nữa — `vision_primary` đưa quyền "màu ô" về
vision hoàn toàn vì track-prediction tạo occupied ảo khi xe coast qua ô.

**Các bước (xe G7 vào ô B3).**
1. `begin_frame` → defer claim commits (`:2422-2424`) — không đỗ một track
   LOST trước khi detection của frame này chạy xong.
2. `update_vision` (evidence từ N2): bỏ `ready=False` (:2463), chống đè
   evidence cũ hơn (:2472-2478), `vision_occupied_streak` (:2485). Vision
   chuyển trống → mở departure token `confirmed_empty` + detach ID
   (:2508-2526); vision quay lại occupied trước khi token bị tiêu →
   `_restore_false_empty_token` (:2556) — chống flicker.
3. `update_tracks` mỗi frame: chỉ mẫu `fresh` (consecutive_invisible=0)
   được tính (:2065-2075, :2096-2100); overlap≥0.35 qua `_batch_match`
   (:1285); ở vision_primary ô không `vision_occupied` → bỏ qua candidate
   (:2204-2207).
4. Dừng = 2 đường: **strong-overlap dwell** overlap≥0.60 liên tục, gap ≤
   max(0.25, 2·stop/min_samples) (:1365-1369), ổn định = ≥8 mẫu + inlier
   ≥0.60 trong bán kính max(3px, 0.06·diag) + drift ≤ max(5px, 0.10·diag)
   (:1408-1447); hoặc `_is_stopped` — suffix fresh liền, ≥8 mẫu, ≥0.9s,
   cùng ô ≥80%, r95 ≤ 0.06·diag, net ≤ 0.10·diag (:1316-1355). Commit:
   `strong_ready` → `_bind_vehicle` (callsite `slot_vehicle_binder.py`:2268-2276;
   def :1919) hoặc stopped + tuổi ≥ `stop_seconds + grace = 1.15s` (:2283-2284).
5. Track mất khi đã vào ô → `ArrivalClaim` sống tiếp: commit cần slot
   `vision_occupied` + streak ≥ `arrival_vision_confirmations` + lost ≥
   `arrival_lost_commit_delay` + obs ≥ `arrival_min_samples` + overlap ≥
   min + thắng đối thủ ≥ `arrival_competitor_margin` + `demonstrated_entry`
   (vào từ ngoài / overlap +0.10 / tiến vào ≥5% diag) + **không có quan sát
   fresh mới ngoài ô** (defense :1223-1254) → `_bind_vehicle` (:1263,
   def :1919) mở `parking_episode` (:1953). `ArrivalClaim` class :55,
   instantiate :1109.
6. `finalize_arrivals` retry các claim bị defer (:2426-2429).
7. Xe rời: `_release_vehicle` vision_primary giữ `vehicle_id` sticky khi
   vision còn occupied + mở token `predeparture` (:1990-2008); token
   confirmed khi vision trống; recovery dùng token để trả GID (N10).

**Deep — tham số thật.**
| Tham số | Production (callsite `two_camera.py`) | Default sig | Ref |
|---|---|---|---|
| `policy` | `"vision_primary"` | `"legacy"` | `two_camera.py`:2328 · `slot_vehicle_binder.py`:224 (signature) |
| `min_vehicle_overlap` | 0.35 | = | `slot_vehicle_binder.py`:217 (signature; callsite không truyền) |
| `strong_vehicle_overlap` | 0.60 | = | `slot_vehicle_binder.py`:218 (signature) |
| `stop_seconds`/`exit_seconds`/`stop_commit_grace` | 1.0/0.5/0.15 | = | `slot_vehicle_binder.py`:215-216,:223 (signature) |
| `min_stop_samples` | 8 | = | `slot_vehicle_binder.py`:222 (signature) |
| `stationary_radius_ratio` / `stationary_drift_ratio` | 0.06 / 0.10 | = | `slot_vehicle_binder.py`:219-220 (signature) — dùng :1352-1353 (r95/drift) và :1433/:1446 (inlier/drift) |
| inlier_ratio sàn | 0.60 | — | `slot_vehicle_binder.py`:1437 |
| `arrival_min_samples` | arg 3 (`--slot-arrival-min-samples`) | 3 | `two_camera.py`:2349 · arg `two_camera.py`:1914 · `slot_vehicle_binder.py`:242 (sig) |
| `arrival_vision_confirmations` | arg 2 | 2 | `two_camera.py`:2350 · arg `two_camera.py`:1915 · `slot_vehicle_binder.py`:243 (sig) |
| `arrival_absence_seconds`/`lost_commit_delay`/`processing_grace` | 0.75/0.35/5.0 | = | `two_camera.py`:2351-2356 · arg `two_camera.py`:1916-1918 · `slot_vehicle_binder.py`:245-247 (sig) |
| `arrival_lookback_seconds`/`competitor_margin` | 1.5/0.15 | = | `two_camera.py`:2348 · `slot_vehicle_binder.py`:241,:244 (sig) |
| `recovery_evidence_frames` | 3 (hardcode callsite, comment :2334-2336) | 3 | `two_camera.py`:2336 · `slot_vehicle_binder.py`:230 (sig) |
| `predeparture_guard_seconds` | `empty_seconds + max_result_age + 1/parking_fps` = 1.0+1.0+0.5 = **2.5** | 2.5 | `two_camera.py`:2343-2347 · `slot_vehicle_binder.py`:237 (sig) |
| `false_empty_grace_seconds` | 1.25 | = | `slot_vehicle_binder.py`:236 (signature) |

**Storyboard** (1 cảnh: xe G7 lùi vào ô B3 rồi tắt máy):
1. **TẮT binder** (chỉ vision + tracker raw): vision B3 đỏ, tracker mất
   G7 lúc dừng → snapshot không biết ai ở B3 → frontend tô ô đỏ không-ID.
2. **BẬT**: G7 đi qua ô trống A1 — overlap 0.4 nhưng `vision_occupied=0`
   → không bind (gate :2204) → không occupied ảo.
3. G7 vào B3: overlap 0.72 ≥0.60, dwell 1.2s ≥1.15, 9 mẫu, drift 4px ≤
   0.10·diag → strong_ready → bind G7→B3 + mở episode `B3:G7:F812`.
4. G7 dừng, tracker LOST: vision_primary chỉ xét mẫu fresh → sticky ID
   giữ nhờ binding; claim dự phòng nếu bind chưa kịp.
5. Vision flicker "trống" 1 mẫu: token mở; mẫu sau occupied trở lại →
   `_restore_false_empty_token` → G7 không mất ô.
6. G7 lùi ra: `predeparture` token → N10 recovery giữ GID; vision trống
   1.0s → detach + episode `departing`.

**QA phản biện.**
- Tracker "thấy" xe đứng trong ô trống-theo-vision 2 phút — có được tô
  đỏ không? (không: `occupied`=vision, gate :2204; chỉ legacy mới OR)
- Vision báo trống đúng lúc xe đang lùi ra (thân xe vẫn phủ ô) — ID có bị
  thu hồi ngay? (token `predeparture` + guard 2.5s; restore false-empty)
- Hai GID cùng claim một ô sau merge — ai thắng? (`remap` giữ claim score
  cao :3750; competitor margin 0.15 từ chối :1198-1206)

**Chắc chắn:** cao — policy, ngưỡng stationary/claim/token đọc trực tiếp
[code]. Cần lưu ý truyền miệng: "one-way override" trong docstring nói về
**legacy**; production `vision_primary` còn chặt hơn (track không đổi được
`occupied` cả hai chiều — chỉ gỡ/gắn `vehicle_id`).

---

## T2 · Polygon Geometry — point-in-poly / signed distance / bbox∩poly — Node N12 (nền tảng)

**Bài toán.** Ô đỗ là tứ giác xiên do người vẽ định nghĩa (`parking_slots_cam*.json`),
xe là bbox trục-thẳng. Cần trả lời chính xác: "xe đứng trong ô không?", "đè
bao nhiêu phần trăm?", "cách mép ô bao xa — và phía trong hay ngoài?".

**Làm gì.** Ba primitive OpenCV phục vụ mọi quyết định hình học của binder
và gate: `cv2.pointPolygonTest` (không đo → inside/on-edge, đo → khoảng
cách **có dấu**: trong > 0, ngoài < 0); `cv2.intersectConvexConvex` (diện
tích giao hai đa giác lồi); và tích có hướng (orientation) cho cắt đoạn
thẳng + chiều vượt vạch. **Hai điểm neo khác nhau, đừng trộn:**
`_overlap_geometry` kiểm `center_inside` bằng **tâm bbox**
(`slot_vehicle_binder.py`:727); còn `_bottom_center` — điểm chạy đất của
bánh xe (:573-574) — chỉ làm neo cho recovery/token distance
(`prepare_predeparture_tokens` :495 → `_signed_polygon_distance` :506).

**Vai trò.** Nằm dưới N10/N12 (token radius, overlap match, predeparture
gate) và N14 (line crossing). Mất nó → mọi quyết định quy về "tâm nằm
trong bounding-box", nhầm ô kề nhau và đếm cả xe đi ngang.

**Nằm ở đâu.** `slot_vehicle_binder.py`: `_point_in_polygon` :666-672,
`_signed_polygon_distance` :582-589, `_raw_vehicle_overlap` :592-601,
`_overlap_geometry` :712-745 (score 0.70/0.20/0.10), `_bottom_center`
:573-574, `_slot_diagonal` :577-579 (chuẩn hóa theo kích thước ô).
`gate_session_controller.py`: `check_line_intersection` :229-239,
`get_crossing_direction` :242-247.

**Tại sao.** [suy luận] `pointPolygonTest` cho in/out + độ sâu trong một
phép gọi O(đỉnh) — rẻ hơn rasterize mask từng ô mỗi frame; signed-distance
cho phép một ngưỡng "ngoài nhưng sát mép" (recovery radius) mà không cần
đa giác phình to. Bottom-center giảm nhiễu do nắp capô/đỉnh xe lệch so
với mặt đất.

**Các bước (match xe↔ô trong `_overlap_geometry`).**
1. Bbox xe → polygon 4 đỉnh (`_bbox_polygon` :701); ô → polygon config.
2. `intersectConvexConvex` → `vehicle_overlap = ∩/area_xe` (bao nhiêu phần
   xe nằm trong ô), `slot_overlap = ∩/area_ô` — `slot_vehicle_binder.py`
   :719-726.
3. `pointPolygonTest` trên **tâm** bbox → `center_inside` (:728).
4. `qualifies = (center_inside ∧ vehicle_overlap ≥ 0.35) ∨
   vehicle_overlap ≥ 0.60` (:729-731).
5. Score match = `0.70·vehicle + 0.20·slot + 0.10·(1−d_tâm/diag)` (:739).
6. Ở `prepare_predeparture_tokens`: `signed < −initial_radius ∧
   overlap ≤ 0` → bỏ qua ô (:506-510) — chỉ điểm ngoài-sát-mép hoặc đè
   mép mới là candidate rời ô.

**Deep — tham số thật.**
| Hằng/hàm | Giá trị | Ref |
|---|---|---|
| inside threshold | `pointPolygonTest ≥ 0` (mép tính trong) | `slot_vehicle_binder.py`:666-672 |
| signed distance | >0 trong / <0 ngoài, `measureDist=True` | `slot_vehicle_binder.py`:582-589 |
| `min_vehicle_overlap` / `strong_vehicle_overlap` | 0.35 / 0.60 | `slot_vehicle_binder.py`:217-218 (sig; callsite không override) |
| gate direction guard | `abs(cross) ≥ 1e-9` + `direction > 0 ⇔ "positive"` | `gate_session_controller.py`:250-256, `:196-201` |
| recovery initial radius | `diag × recovery_initial_expand_ratio` (arg 0.05) | `slot_vehicle_binder.py`:508 · `two_camera.py`:2330 · arg :1888 |
| score weights | 0.70/0.20/0.10 | `slot_vehicle_binder.py`:739 |

**Storyboard** (1 cảnh — 3 xe trên 2 polygon riêng A05/A07; TẮT = rule
naïve "chỉ test tâm trong polygon", BẬT = `_overlap_geometry` đầy đủ;
số liệu **tính thật từ hình** — `intersectConvexConvex`-tương đương,
virtual 1040×640, khớp cv2 đến 2 chữ số):
1. Xe X `[40,50,370,180]` vào ô A05 `[[100,150],[300,110],[340,430],
   [120,400]]`: **tâm trong** nhưng chỉ **ov=0.31** diện tích xe đè ô.
   **TẮT**: tâm trong → "match" (ảo — xe lệch ra làn). **BẬT**:
   `inside ∧ 0.31 < 0.35` fail; `0.31 < 0.60` fail → **không qualify**.
2. Xe Z `[60,220,200,160]` đậu gọn A05: **tâm trong** + **ov=0.74** →
   nhánh 1 pass → qualify; score ≈ `0.70·0.74 + 0.20·slot_ov +
   0.10·prox ≈ 0.68` (weights :739).
3. Xe Y `[750,150,250,240]` lệch ô A07 `[[620,150],[840,110],[880,430],
   [640,400]]`: **tâm ngoài** + **ov=0.44**. **TẮT**: tâm ngoài → "miss"
   (ảo). **BẬT**: `0.44 < 0.60` → cả 2 nhánh fail → **không qualify**.
   ⚠ Sửa từ bản cũ "tâm ngoài + ov=0.65": **bất khả thi hình học** —
   bbox chữ nhật đối xứng tâm + polygon lồi ⇒ tâm ngoài kéo theo đường
   tách ⇒ ov < 0.5 < 0.60 [suy luận hình học]. Nhánh `≥0.60` thực tế
   là guard dự phòng — với đầu vào lồi + bbox chữ nhật nó không thể
   fire khi `center_inside=false`.
4. Recovery: điểm track (neo `_bottom_center`) cách mép ô 8px ra ngoài,
   `signed = −8 > −10` (= −0.05·diag 200px) → giữ candidate predeparture;
   điểm `signed = −15` → loại (`slot_vehicle_binder.py`:506-510).
5. Điểm chạm ô kề A2: `signed = +4` (trong ô A2) + overlap 0.31 < 0.35 →
   không qualify ô A2.

**QA phản biện.**
- Bbox đè 40% ô nhưng tâm ngoài — match hay miss? (miss: với ô lồi +
  bbox chữ nhật thì tâm ngoài ⇒ ov<0.5<0.60, nhánh strong không cứu
  được — chính vì vậy nhánh `≥0.60` gần như guard dự phòng [suy luận])
- Ô **lõm** (không lồi) — `intersectConvexConvex` còn đúng không? Đây là
  giới hạn tiềm ẩn: cv2 trả về giao lồi → overlap bị đánh giá thấp nếu ô
  lõm; config ô đỗ vẽ tay chưa được verify luôn-lồi [chưa verify].
  (Hình thang xiên vẫn là đa giác lồi — không phải vấn đề.)

**Chắc chắn:** cao cho các hàm/điều kiện [code]. Giới hạn đã nêu: đa giác
lồi là giả định ngầm của `intersectConvexConvex`; nếu config có ô lõm,
overlap hệ thống thấp [chưa verify config].

---

## T3-1 · Gate Crossing Direction — cắt vạch đúng chiều — Node N14

**Bài toán.** Xe đi ngang vạch cổng theo **hai chiều**: chỉ chiều "vào" mới
được tạo session/QR, chiều "ra" mới được xoá session. Cần phân biệt hướng
vượt vạch từ 2 vị trí liên tiếp, không camera riêng.

**Làm gì.** `check_line_intersection` kiểm tra đoạn di chuyển (old→new) có
cắt đoạn vạch (p1→p2) bằng hai tích orientation; `get_crossing_direction`
lấy tích có hướng `cross(vec_xe, vec_vạch)` — dấu của nó cho biết xe đi
sang **phía nào** của vạch; `_crossed_in_valid_direction` so dấu với cờ
`gate.direction` ("positive"/"negative").

**Vai trò.** Consumer N14 — chạy trong process gate riêng, trên mỗi
snapshot poll. Entry → `create_session`; exit → `delete_session_by_global_id`.
Mất nó → không phân biệt được vào/ra, session nhân đôi hoặc mất sớm.

**Nằm ở đâu.** `gate_session_controller.py`: `_normalize_gate` :196-207,
`check_line_intersection` :229-239, `get_crossing_direction` :242-247,
`_crossed_in_valid_direction` :250-256, `_recent_measured_entry_crossing`
:259-309, entry/exit trong loop :498-534.

**Tại sao.** [suy luận] Một vạch + một cờ hướng rẻ hơn hai vùng polygon
"trước/sau cổng"; tích có hướng là 1 phép nhân-trừ, ổn định số học và tự
nhiên với tọa độ world đã chuẩn hóa. Guard `abs(direction) < 1e-9` loại
cú cắt song song vạch.

**Các bước (entry).**
1. Cần `observation_is_continuous`: `observed` + vị trí trước đó + obs
   wall-clock ≤1.0s + `source_time` gap ≤1.0s (`gate_session_controller.py`
   :483-493) — snapshot cũ không được tái kích hoạt crossing.
2. `check_line_intersection(old,new,p1,p2)`: hai cặp orientation đổi dấu
   (:229-239).
3. `direction = cross(vec_xe, vec_vạch)`; `gate.direction=="positive"` đòi
   >0, `"negative"` đòi <0 (:250-256).
4. Xe nhanh cắt vạch **trước khi GID publish**: `recovered_entry_crossing`
   duyệt `recent_observed_path` — ≥2 mẫu đo liên tiếp, **cùng camera +
   cùng local_track_id**, gap ≤1.0s, mẫu sau cách `current_source_time`
   ≤1.0s (:296-307). Kalman predict/jump không đủ điều kiện (comment
   :266-274).
5. Đúng hướng + chưa có session → `create_session(global_vehicle_id)`
   (:514-521); exit tương tự → `delete_session_by_global_id` (:523-534).

**Deep — tham số thật.**
| Hằng | Giá trị | Ref |
|---|---|---|
| direction guard | `abs(cross) < 1e-9` → invalid | `gate_session_controller.py`:254-255 |
| obs continuity | wall ≤1.0s · source ≤1.0s | `gate_session_controller.py`:483-493 |
| recovered path window | `raw_path[-12:]`, gap ≤1.0s, cùng cam+local | `gate_session_controller.py`:275-307 |
| gate config | `direction ∈ {"positive","negative"}` | `gate_session_controller.py`:199-201 · `config/gate_zones.json` |

**QA phản biện.**
- Xe đỗ sượt mép vạch, bbox jitter sang bên kia rồi quay lại — có tạo
  session ảo? **Giới hạn thật**: nếu hai vị trí liên tiếp thực sự cắt đoạn
  vạch đúng hướng thì session VẪN được tạo — các guard (continuity ≤1.0s,
  segment-cross, dấu hướng) chỉ lọc *điều kiện kích hoạt*, không phân biệt
  "đi vào chủ đích" vs "lắc qua vạch". Jitter 1 phía không cắt segment →
  an toàn; jitter xuyên vạch thật là kịch bản code không chặn.
- Snapshot đến trễ (poll lag) — crossing đã xảy ra có bị mất? Nhánh
  recovered cứu được **trong cửa sổ ~1.0s source-time**: mẫu path sau
  phải cách `current_source_time` ≤1.0s (:302-306) — đây là đồng hồ
  *quan sát của xe*, không phải độ trễ HTTP. Crossing cũ hơn cửa sổ này
  hoặc không có `recent_observed_path` đủ 2 mẫu đo cùng-cam/cùng-track →
  mất, không hứa phục hồi mọi độ trễ.
- Cùng GID "nhảy cóc" cross-camera qua vạch (không có 2 mẫu đo liền cùng
  local track) — có được session? (không — guard :300-301)

**Chắc chắn:** cao [code]. Toàn bộ hằng số trong file gate, không phụ
thuộc CLI ngoài `gate_zones.json`.

---

## T3-2 · Session FSM + QR 120s — Node N14

**Bài toán.** Mỗi xe vào cổng cần một "phiên" (session) gắn GID → QR cho
tài xế claim → chọn ô → điều hướng → đỗ → ra. Trạng thái phải nhất quán
giữa nhiều consumer poll bất đồng bộ, và QR không được treo mãi trên
kiosk.

**Làm gì.** `session_manager.py` là store JSON có `revision` tăng đơn điệu
+ `_STORE_LOCK`; mỗi mutation là hàm `_mutate_session` atomic. QR có
`qrExpiresAt = created + 120s`, nhưng **chỉ dùng để lọc hiển thị kiosk** —
không auto-xoá session. Exit = crossing vạch ra → `delete_session_by_global_id`
xoá hẳn record. Về `"CLOSED"`: chuỗi này **tồn tại trong code nhưng chỉ ở
read-side filter** (`session_manager.py`:190,:277,:531,:542,:556 — bỏ qua
session CLOSED khi tra cứu); **không assignment nào ghi `state="CLOSED"`**
(mọi ghi state nằm ở :358–:463 chỉ xuất 6 giá trị runtime). Cũng không có
state `CLAIMED` — claim ghi cờ `claimed` chứ không đổi tên state.

**Vai trò.** Lớp nghiệp vụ trên N13 snapshot — gate coordinator (process
N14) dịch `parking_episodes`/crossing thành mutation; frontend đọc qua
REST 8000. Mất nó → không có trạng thái xe nào sống sót qua 2 poll.

**Nằm ở đâu.** `backend/session_manager.py`: `QR_DISPLAY_SECONDS` :29,
`_qr_expires_at` :81-88, `list_waiting_sessions` :200-217, `claim_session`
:355-368, `select_spot` :371-389, `set_parked` :392-419,
`apply_departure_episode` :439-446, `set_exit_navigation` :449-464,
`delete_session(_by_global_id)` :574-600, `_NAVIGATION_RESERVATION_STATES`
:33 + `list_navigation_reservations` :220-252.

**Tại sao.** [code] Docstring `parking_episodes` (`slot_vehicle_binder.py`
:330-332): session consume theo `parking_episode_id` thay vì tự suy parked
từ counter — nguồn sự thật duy nhất. [code] `set_parked` idempotent theo
episode id (:395-401) — restore false-empty không được hủy intent
relocation/exit của tài xế. [suy luận] QR TTL chỉ lọc kiosk vì session
còn cần sống để xe vào xong hành trình kể cả khi claim muộn.

**Các bước (FSM thật).**
1. Entry crossing → `create_session` → `WAITING_FOR_SCAN` +
   `qrExpiresAt=+120s` (`session_manager.py`:291-302).
2. Kiosk `list_waiting_sessions`: `WAITING_FOR_SCAN ∧ ¬claimed ∧
   now < expiry` (:206-215) — **hết 120s QR biến mất khỏi màn hình,
   session vẫn sống**.
3. `claim_session`: `WAITING_FOR_SCAN → SELECTING_SPOT` + `claimed`
   (:355-360); đã claim → noop; state khác → `InvalidSessionState`
   (:362-366). **[quirk, code]** không kiểm `qrExpiresAt` → QR hết hạn
   kiosk vẫn claim được qua sessionId trực tiếp.
4. `select_spot`: → `NAVIGATING_TO_SPOT` (hoặc `RELOCATING` nếu đã có
   `actualParkedSpotId`) + reservation (:373-384).
5. Episode parked → `set_parked(_by_global_id)` → `PARKED` + gắn
   `parkingEpisodeId` (:392-436); episode departing →
   `apply_departure_episode` → `PARKED → SELECTING_SPOT` (:439-446).
6. `set_exit_navigation` → `EXIT_NAVIGATION` (:449-464); cắt EXIT →
   `delete_session_by_global_id` — runtime đóng = xoá, không state mới.

**Deep — tham số thật.**
| Hằng | Giá trị | Ref |
|---|---|---|
| `QR_DISPLAY_SECONDS` | 120.0 — **chỉ visibility kiosk** | `session_manager.py`:29, dùng :81-88,:213-214 |
| reservation states | `{NAVIGATING_TO_SPOT, RELOCATING}` | `session_manager.py`:33 |
| states runtime ghi được | WAITING_FOR_SCAN·SELECTING_SPOT·NAVIGATING_TO_SPOT·RELOCATING·PARKED·EXIT_NAVIGATION — `"CLOSED"` chỉ xuất hiện ở read-filter, không hàm nào ghi | assign `session_manager.py`:358–:463 · filter `:190,:277,:531,:542,:556` |
| gate poll | `--poll-interval` 0.25s; `time.sleep(max(poll,1.0))` khi lỗi | `gate_session_controller.py`:865,:904-906 |

**Storyboard** (dòng thời gian 1 session):
1. 12:00:00 xe cắt entry → session S1 `WAITING_FOR_SCAN`, QR đến 12:02:00.
2. 12:00:40 tài xế chưa quét; kiosk còn hiện. 12:02:01 QR ẩn khỏi kiosk
   (S1 vẫn `WAITING_FOR_SCAN` trong store).
3. 12:03:10 claim qua deep-link → `SELECTING_SPOT` — claim KHÔNG bị từ
   chối dù QR quá hạn [code quirk].
4. Chọn A12 → `NAVIGATING_TO_SPOT` + reservation; episode opened →
   `PARKED`; xe rời ô → episode departing → `SELECTING_SPOT` lại.
5. Chọn exit → `EXIT_NAVIGATION`; cắt vạch ra → session bị **xoá hẳn**.

**QA phản biện.**
- QR hết 120s — session chết chưa? (không: chỉ ẩn kiosk; claim không check
  expiry :355-368)
- Hai tab claim cùng session — race? (`_STORE_LOCK` + revision +
  `_mutate_session` atomic, claim idempotent :368)
- Episode "departing" tới khi tài xế đang `EXIT_NAVIGATION` — có kéo về
  SELECTING_SPOT? (không: chỉ flip khi `state=="PARKED"` :444-445)

**Chắc chắn:** cao [code] cho FSM/QR/episode. Lưu ý quirk: QR 120s =
visibility, không phải TTL session — truyền miệng dễ nhầm thành auto-delete.

---

## T3-3 · Snapshot Contract — 8001 → 8000 → frontend — Node N13→N15

**Bài toán.** Runtime CV 30fps tạo state quá lớn để mọi consumer đọc đồng
bộ; mỗi consumer có nhịp riêng (gate 0.25s, frontend 200ms, MJPEG viewer).
Cần một điểm xuất bản "mới nhất thắng", không hàng đợi.

**Làm gì.** Main loop build `build_runtime_snapshot(...)` và publish qua
`runtime_publisher.publish_snapshot` — throttle `1/json_fps`. Publisher
là **latest-only mailbox**: freeze deepcopy + serialize JSON **ngoài**
critical section, lock chỉ để đổi con trỏ bytes bất biến. HTTP server
8001 trả luôn bytes đã serialize; gate poll 8001 → REST 8000; frontend
poll cả hai.

**Vai trò.** Ranh giới sync→async: trong loop mọi thứ là call trực tiếp,
sau publish mọi consumer là pull-độc-lập — không backpressure, không
delivery guarantee (bỏ qua snapshot cũ là đúng).

**Nằm ở đâu.** Publish `two_camera.py`:2844-2869 (throttle :2817, arg
`--json-fps` 5.0 :1802). Mailbox `runtime_server.py`: `publish_snapshot`
:106-113, MJPEG latest-only :134, thread encode :100,:141, `/api/runtime/
snapshot` :285-289 (pre-serialized `snapshot_json`), `/status` :274,
`/events` :310. Consumer: `gate_session_controller.py` `DEFAULT_RUNTIME_URL`
:55 (`http://127.0.0.1:8001/...`), `--poll-interval` 0.25 :865, vòng poll
:899-906, `--port` 8000 :864. Frontend `runtimeApi.ts` `VITE_RUNTIME_URL`→
8001 `/api/runtime/snapshot` :11, `/api/runtime/gates` :43,:58; `backendApi.ts`
`VITE_BACKEND_URL`→8000 `/api/session/*` :46-79.

**Tại sao.** [code] Comment mailbox :106-113: serialize ngoài lock, reader
giữ lock chỉ để copy ref — producer không bị chặn bởi consumer chậm.
[suy luận] Pull-latest thay queue vì consumer UI/gate chỉ cần trạng thái
hiện tại; snapshot cũ không có giá trị.

**Các bước (chuỗi một frame).**
1. Loop kết thúc → `publish_snapshot` nếu đủ `1/json_fps` (`two_camera.py`
   :2815-2869).
2. Publisher freeze+encode → `_snapshot_json` bytes mới (`runtime_server.py`
   :106-113).
3. Gate controller `_runtime_snapshot(url)` mỗi 0.25s → `apply_snapshot`
   (entry/exit/episode) → REST mới nhất trên :8000
   (`gate_session_controller.py`:899-906).
4. Frontend `getRuntimeSnapshot()` poll **200ms** → xe/tuyến (`App.tsx`
   :354-360); `useVehicleSession` **500ms** → session (:27,:214);
   reservations **500ms** (`App.tsx`:191); `gate_roi.json` **1000ms**
   (:393-404); runtime stale >5s → cảnh báo (:283,:355).
5. MJPEG viewer đọc mailbox frame khác, cũng latest-only (:134-141).

**Deep — tham số thật.**
| Giá trị | Ref |
|---|---|
| `json_fps` 5.0 (throttle publish) | `two_camera.py`:1802,:2817 |
| snapshot mailbox (freeze+bytes, no queue) | `runtime_server.py`:106-113 |
| endpoint `:8001/api/runtime/snapshot` | `runtime_server.py`:285-289 · default URL `gate_session_controller.py`:55 |
| gate poll 0.25s / retry ≥1.0s | `gate_session_controller.py`:865,:904-906 |
| frontend: 200ms runtime · 500ms session/reservations · 1000ms gate-ROI · stale >5s | `App.tsx`:354-360,:191,:393-404,:283,:355 · `useVehicleSession.ts`:27,:214 |
| contract: `build_runtime_snapshot`, `RUNTIME_SCHEMA_VERSION=2`; `TERMINAL_IDENTITY_STATES={exited,expired}` lọc khỏi vehicles; `parked_slot_id` lấy từ episode parked; `recent_observed_path` xuất cùng vehicle | `techgar/runtime_contract.py`:12,:13,:37,:70,:76-77,:95-110 · producer `two_camera.py`:2844-2869 |

**Storyboard** (3 lane song song — producer/gate/frontend; số `frame_index`
dưới đây là *minh họa deterministic*, không phải field "revision" của payload):
1. 12:00:00.180 producer publish snapshot `frame_index=120` vào mailbox
   (frame 119 bị ghi đè chưa đọc).
2. 12:00:00.200 frontend poll 8001 đọc frame 120 → vẽ G7 đang cắt vạch;
   session poll 8000 lúc này **chưa có S1** (gate chưa tạo).
3. 12:00:00.250 gate poll 8001 đọc frame 120 → apply entry-crossing →
   `create_session` S1 `WAITING_FOR_SCAN`.
4. 12:00:00.500+ frontend session-poll 8000 (nhịp 500ms) mới thấy S1 →
   hiện QR — frontend luôn **đi sau** gate tối thiểu một nhịp poll của
   nó; runtime-poll 200ms chỉ thấy vị trí, không thấy session.
5. Frame 121-124: frontend đọc mỗi 200ms; gate chỉ thấy frame mới nhất ở
   nhịp 0.25s — hai consumer **lệch pha là thiết kế**, không phải bug.
6. Runtime treo 6s: frontend `now − lastRuntimeAt > 5000` → banner lỗi
   kèm gợi ý kiểm tra port 8001 (`App.tsx`:355,:946).

**QA phản biện.**
- Consumer chậm bỏ lỡ rev121-123 — có mất event? (có thể — mailbox latest
  wins; episode/exit đều trạng thái duy trì nên bản mới vẫn đủ)
- Ai là nguồn thật cho "ô đỏ"? (`parking_episodes`/bindings trong snapshot
  — vision đã qua binder, không phải pixel thô)
- Frontend đọc 8001 trực tiếp *và* 8000 — mâu thuẫn thì tin ai?
  (session/reservation → 8000; vị trí xe runtime → 8001; hai miền dữ liệu
  khác nhau)

**Chắc chắn:** cao [code] toàn chuỗi. Quirk đáng nhớ cho storyboard: đồng
hồ "skew" trong snapshot là `camera_skew_ms` giữa 2 cam, không liên quan
độ trễ consumer.

---

## T3-4 · A* Routing + Off-route + Voice — Node N15

**Bài toán.** Sau khi chọn ô, tài xế cần tuyến đường **đi được** (theo làn
một chiều, không xuyên ô đỗ), cảnh báo khi lệch tuyến, và chỉ dẫn bằng
giọng nói tiếng Việt — trên điện thoại, mọi thứ tính lại liên tục theo
vị trí runtime.

**Làm gì.** `findRoute` là A* trên `LaneGraph`: adjacency từ `edges[]`;
cạnh `direction:"two-way"` được thêm **cả chiều ngược**, cạnh `"one-way"`
chỉ `from→to`. Heuristic = euclidean × `costPerMapUnit` (hệ số nhỏ nhất
`edge.distance/đường chim bay` toàn graph — giữ admissible). Off-route =
khoảng cách điểm-đến-polyline > ngưỡng; voice = `getNavigationInstruction`
(cross product cho trái/phải trong hệ Y-xuống) + `voiceManager.speak`.

**Vai trò.** Consumer cuối N15 — đọc vị trí GID từ snapshot, vẽ lại route
mỗi tick. Mất nó → session có QR nhưng tài xế tự dò đường; mất graph
direction → route đi ngược làn.

**Nằm ở đâu.** `frontend/src/routing/routeEngine.ts`: `buildAdjacency`
:18-29, `findRoute` :31-119 (heuristic :38-50, open-scan :57-91),
`findVehicleRoute` :121-124, `findExitRoute` :126-130, `routeFromPos`
:132-163 (đứng trên cạnh gần nhất, không đảo cạnh 1 chiều :133-134,
:151-163), validity :211-219. `laneGraph.ts`: `direction` :19, `addEdge`
default `"one-way"` :43, cụm nối dọc `"two-way"` :117-130, `LANE_GRAPH`
:185. `voiceGuidance.ts`: `distanceToSegment` :85-90, `checkIsOffRoute`
:95-111, `getNavigationInstruction` :118+, arrival <35px :126-138.
Callsite: `App.tsx`:746-750 (off-route **80px**), reroute `findExit/Inbound
RouteFromPos` :755-758, speak :762.

**Tại sao.** [suy luận] Heuristic `h = euclid × min(edge.distance/euclid)`
— không clip, nhưng vì lấy **min trên mọi cạnh** nên mọi `edge.distance ≥
scale×euclid` theo định nghĩa → `h ≤ cost thật` (admissible theo cấu trúc,
kể cả khi scale >1; graph rỗng → scale=0 → thoái hoá Dijkstra). Code
không ghi lý do chọn; đây là suy luận từ công thức. routeFromPos neo vào
cạnh gần nhất thay vì node gần nhất tránh vẽ đường nối xuyên qua ô đỗ
(comment :133-134 [code]). Tie-break "nodeOrder" (:64-69) làm kết quả
deterministic [code].

**Các bước (session đi tới A12).**
1. `findVehicleRoute(graph, "A12")` → A* `entrance → spotEntry[A12]`
   (`routeEngine.ts`:121-123).
2. Adjacency: two-way edge đẩy step ngược; one-way không (:22-27).
3. Mở rộng: `f = g + h`, `h = euclid × min_cost_ratio` (:38-50); chọn f
   nhỏ nhất, hoà → g nhỏ hơn → nodeOrder sớm hơn (:61-75).
4. Xe di chuyển → `checkIsOffRoute(pos, route.points, 80)`: min
   distance-to-segment > **80px** → `isOffRoute` (`voiceGuidance.ts`
   :95-111; **callsite 80**, default 75 `voiceGuidance.ts`:98).
5. `freshRoute = *RouteFromPos(vị trí hiện tại)` được tính lại **mọi
   tick** và áp ở cả hai nhánh (`App.tsx`:753-774): nhánh off-route thêm
   `speak` + banner; nhánh đúng-đường áp luôn route mới "co theo xe"
   (:770-774). Reroute KHÔNG bị gate bởi ngưỡng — ngưỡng 80 chỉ điều
   khiển cảnh báo.
6. Off-route → `speak("Cảnh báo: Bạn đang đi sai tuyến đường chỉ dẫn!",
   7000, true)` (`App.tsx`:761-768).
7. Gần đích <35px → câu đến ô/lối ra (`voiceGuidance.ts`:126-138).

**Deep — tham số thật.**
| Giá trị | Ref |
|---|---|
| off-route: **callsite 80px** · signature default 75px | `App.tsx`:746-750 · `voiceGuidance.ts`:98 |
| arrival radius | <35px | `voiceGuidance.ts`:126-130 |
| heuristic scale | `min(edge.distance/euclid)` toàn graph | `routeEngine.ts`:38-50 |
| edge direction | `"one-way"` default · `"two-way"` thêm adjacency ngược | `laneGraph.ts`:19,:43 · `routeEngine.ts`:22-27 |
| voice cooldown | `speak(..., 7000, …)` | `App.tsx`:762 |

**Storyboard** (1 cảnh: xe đi từ cổng vào đến A12, làn giữa 1 chiều lên):
1. **TẮT direction guard** (mọi cạnh 2 chiều): A* cắt ngắn đi ngược làn
   giữa → tuyến "ngắn" nhưng đi vào đầu xe khác.
2. **BẬT**: cạnh làn giữa chỉ `from→to` → A* buộc vòng qua đầu làn; đường
   dài hơn nhưng hợp lệ giao thông.
3. Xe lệch 90px khỏi polyline (>80): off-route → cảnh báo đỏ + voice
   "đi sai tuyến"; lệch 60px (<80): không cảnh báo — nhưng route polyline
   vẫn được tính lại từ vị trí hiện tại mỗi tick ở cả hai nhánh
   (`App.tsx`:771-774), không phải "giữ nguyên tuyến cũ".
4. Reroute: xe đang giữa cạnh `center-…` — route mới bắt đầu đúng điểm
   chiếu trên cạnh, không nối thẳng tới node gần nhất.

**QA phản biện.**
- Xe "nhảy" teleport 200px do GID swap — off-route kêu oan?
  (kêu — và đúng vai trò: reroute từ vị trí mới xử lý jump)
- Ngưỡng nói 75 hay 80? (callsite 80 `App.tsx`:749 — default 75 trong
  lib chỉ là fallback, dễ truyền miệng sai)
- Ô đích bị chiếm giữa chừng — route có tự đổi? (đây là logic session/
  alternative ở App, không phải A*; A* chỉ trả tuyến)

**Chắc chắn:** cao [code]. Khác biệt đáng ghi: engine default 75px nhưng
production caller truyền 80px — hai con số đều đúng, tuỳ đang nói tới lớp nào.

---

## Checkpoint

- **completed**: `pipeline-order.md` (DONE — J1 đã sửa đúng source: physical
  crossing trước GID-publish được cứu bằng `recent_observed_path`, session
  luôn gắn GID; N12 row đồng bộ vision_primary) · **đủ 7 thẻ**: T1-1, T1-2,
  T2, T3-1, T3-2, T3-3, T3-4
- **verify thêm trong vòng này**: `claim_session` không check `qrExpiresAt`
  (QR 120s chỉ lọc kiosk `session_manager.py`:200-217); off-route 80
  callsite vs 75 default (`App.tsx`:749 vs `voiceGuidance.ts`:98); gate
  poll 0.25s + retry ≥1.0s; mailbox latest-only `runtime_server.py`:106-113;
  `vision_primary` `occupied`=vision-only + bind gate :2204-2207.
- **next**: peer-review `builder-b.md` (REVIEW-CHECKLIST, ≥3 params trực
  tiếp: matching distance, recovery TTL/radius/app, handoff cost/weights/
  streak, probation/divergence) → `peer-b-by-c-megaplan.md`
- **blockers**: không
