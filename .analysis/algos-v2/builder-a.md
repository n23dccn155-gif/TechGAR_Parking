# Builder-A dossier — "Phát hiện & theo dõi trong 1 camera" (N1, N3–N7)

Phase 1 theo `D:\TechGar2\.analysis\MEGAPLAN.md` §3. Chỉ phân tích source, không sửa code/web.
Nguồn sự thật: `backend/main_detect/two_camera.py:run()` + `backend/main_detect/src/techgar/*` (file hiện tại, `motion_tracker.py` 2484 dòng).
Viết tắt: `mt` = `src/techgar/motion_tracker.py`, `tc` = `two_camera.py`, `og` = `src/techgar/occlusion_guard.py`, `vt` = `src/techgar/vehicle_tracker.py`, `svb` = `src/techgar/slot_vehicle_binder.py`, `pd` = `src/techgar/parking_detector.py`.

## 0. Thứ tự runtime đã xác minh (callsite thật)

Trong vòng lặp `run()` của `tc`, mỗi camera mỗi frame:

```
frame (tc:2467-2477 capture)
  └─ tracker.process_frame()                    tc:2680-2688
       ├─ N3 _predict_tracks()                  mt:2228 → mt:239
       ├─ N4 occlusion_guard.prepare()          mt:2229-2232 → og:55
       ├─ N5 _detect()                          mt:2233 → mt:759
       ├─ N6 _assign()                          mt:2249 → mt:1597
       ├─ N7 _apply_detection() matched         mt:2250-2255 → mt:2096
       ├─ N7 unmatched: coasting/stale/TTL      mt:2257-2334
       └─ N7 _create_or_reid() detection thừa   mt:2335 → mt:2009
  └─ N8 notify lost/expired → manager+binders   tc:2690-2716   (ranh giới B)
  └─ N9/N11 observe_trajectories / update_all_tracks  tc:2731/2779  (B)
  └─ N2 parking vision = nhánh song song async  tc:2632-2640  (C)
```

Feedback ngược vào đầu chuỗi: `priority_regions` của binder truyền vào `process_frame` tại `tc:2683` (xây ở `tc:689-719`). Không ép thành chuỗi đơn: N2 là worker song song, N8+ là giai đoạn sau tracker.

**Tham số: class default vs runtime override** — runtime (`tc:2366-2399` + argparse `tc:1805-1880`) khác class default ở: `history_len` 10→**90** (hardcode callsite `tc:2372`, không phải CLI arg); `enable_multiscale_motion` False→**True** (hardcode `tc:2385`); `reject_cast_shadows` False→**True** (hardcode `tc:2386`); `motion_threshold` 25→**20**; `motion_min_pixels` 160→**100**; `motion_min_ratio` 0.08→**0.05**; `min_confirm_displacement` 12.0→**6.0**; `roi_context_padding_px` 0→**48**; `association_ambiguity_margin` None→**0.08** (hiệu dụng = `split_assignment_margin` 0.08). Các thẻ dưới ghi `[class]`/`[runtime]` riêng.

---

## Thẻ T1-1 — N1: ROI masking + priority regions

**Bài toán đời thật.** Camera nhìn cả vỉa hè, đường xe chạy ngoài bãi, cây rung. Nếu detect mọi pixel chuyển động, tracker sinh track ảo và gán nhầm. Cần một "vùng quan sát" cứng (ROI = Region Of Interest, đa giác do người vận hành vẽ) để chỉ giữ chuyển động trong bãi — nhưng vẫn phải đo trọn xe đang đi nửa trong nửa ngoài mép ROI.

**Làm gì.** Rasterize đa giác ROI thành mask nhị phân; motion mask chỉ được giữ pixel nằm trong ROI (và một "vành đệm context" xung quanh chỉ để hoàn thiện contour, không để sinh blob mới). Riêng các **priority regions** (vùng ưu tiên, lấy từ binder — chỗ xe vừa rời ô) được nới ngưỡng để khôi phục track nhanh hơn.

**Vai trò.** Trước: đọc mask file (`tc:2401-2420`). Sau: motion detection N5 nhận mask đã lọc; mọi blob/bbox/track đều bắt đầu sau ROI. Mất nó: nhiễu ngoài bãi tràn vào → track ảo → Hungarian gán rác → ID nhảy; xe rời ô mất ưu tiên → re-ID chậm/sai.

**Nằm ở đâu.** ROI load `tc:2401-2420` (`args.tracking_roi_camN or args.mask_camN`, `cv2.fillPoly`; thiếu file → fallback `pd.get_global_mask` `pd:174-184` = OR các mask ô đỗ). Áp mask trong `_detect` `mt:794-816` (strict ROI + `_roi_context_mask`). Priority mask `_priority_mask`/`_box_is_priority` `mt:577-631`. Nguồn priority `tc:689-719` → `svb.recovery_priority_regions` `svb:2658-2669` (đa giác ô có departure-token, giãn quanh centroid hệ số `1 + 2·radius/diag` — `_expanded_polygon` `svb:2653-2656`).

**Tại sao + alternative.** Bãi đỗ là vùng cố định đã biết → lọc hình học cứng rẻ và chắc hơn để detector tự học nền khắp ảnh (suy luận từ thiết kế: mask là file cấu hình, không học). Alternative hợp lý: chỉ dùng MOG2 (nhưng nền ngoài ROI vẫn đổi → nhiễu); vành context thay vì cắt cứng (để xe mép ROI đo trọn — code nói rõ `:1821-1823` "blob hoàn toàn ngoài ROI vẫn bị loại"). Không suy đoán lịch sử quyết định ngoài code.

**Các bước.**
1. Load JSON polygon → `fillPoly` → `_roi_mask` (`tc:2409-2417`).
2. Dilate `_roi_mask` thêm `roi_context_padding_px` → `_roi_context_mask` (`_detect` `mt:794-801`).
3. `mask &= roi_context` cho phép contour lấn vành đệm; mỗi contour kiểm tra support trong **strict** ROI + anchor hợp lệ (`mt:802-816`).
4. Blob hoàn toàn trong vành (không chạm ROI) → reject.
5. `priority_regions` → `_priority_mask`; blob chạm vùng ưu tiên dùng ngưỡng riêng mềm hơn (`mt:577-631`).

**Tham số thật.** `roi_context_padding_px`: class `0` `mt:34-96`, runtime **48px** `tc:1817-1819`. Priority: `priority_min_area=350`, `priority_motion_min_ratio=0.03`, `priority_motion_min_pixels=50`, `priority_min_visible_count=2`, `priority_min_confirm_displacement=3.0` `mt:34-96` (class = runtime, không có flag riêng). `_box_is_priority`: anchor nằm trong priority-mask **hoặc** overlap ≥10% diện tích box `mt:614-631`; floor diện tích tuyệt `min(650,350)=350` áp cho mọi blob trước khi tách priority `mt:845`. Token: polygon giãn `1 + 2·radius/diag` `svb:2653-2668`, `radius = diag·ratio` với `ratio` nở `0.05→0.85` trong `recovery_expand_seconds=1.0s` `svb:603-609` → hệ số **1.10→2.70** theo tuổi token. **Runtime**: `recovery_initial_expand_ratio=0.05` / `recovery_max_expand_ratio=0.85` (CLI default `tc:1888-1897`, truyền `tc:2330-2331` — **khác** class signature `svb:227-228` 0.05/0.45). **Phân biệt (arbitration C §A)**: polygon giãn chỉ là **wakeup mask** cho detector nhạy hơn (`svb:2653-2668`, comment `:2664`); gate chấp-nhận-candidate thật là **signed distance** `signed < −initial_radius` `svb:506-510` / cap `≤ diag·ratio` `svb:2875-2876` — đừng trộn hai biểu diễn.

**Storyboard (deterministic, cùng 1 cảnh — minh họa).** Cảnh: xe A đi trong ROI; vũng nước lấp lánh + người đi bộ ở vỉa ngoài ROI; xe B rời ô ở vùng ưu tiên.
- k1 TẮT-ROI: mask=toàn ảnh → vũng nước/người bộ tạo 3 blob nhiễu → 3 track rác.
- k2 BẬT-ROI: chỉ blob A trong polygon sống; vành context 48px [prod] cho contour A lấn mép vẫn được đo trọn; blob thuần-vành bị loại.
- k3 Bật priority: B rời ô → polygon ô giãn `1 + 2·radius/diag` [prod công thức; radius nở 0.05→0.85·diag theo CLI default → hệ số 1.10→2.70 theo tuổi token — minh họa vẽ ~1.5×] → vùng ưu tiên sáng; blob B nhỏ chỉ cần `motion_min_ratio 0.03` [prod] thay 0.05 → confirmed sau **≥2 obs nằm trong vùng ưu tiên** (`priority_observation_count` chỉ đếm obs `priority=True` `mt:2167-2169`, `_is_confirmable` `mt:2081`) thay 3 obs thường.
- k4 So sánh: A bình thường đi ngưỡng chuẩn; B đi đường "ưu tiên" — cùng pixel motion nhưng khác ngưỡng.

**QA phản biện.** (1) Xe chạy dọc mép ROI: contour nửa-trong → qua gate nhờ vành 48px; nếu vành=0 [class default] → xe mép bị cắt bbox → sai kích thước/anchor. (2) File ROI thiếu: fallback union-mask ô đỗ — khác hẳn polygon tay: vùng giữa các ô có thể bị cắt mất [đã xác minh code, ý nghĩa vận hành là suy luận]. (3) Priority quá rộng: blob nhỏ 350px² trong vùng ưu tiên được nuôi → rủi ro nuôi nhiễu — đánh đổi có chủ đích.

**Mức chắc chắn:** Confirmed from code (mask load, strict-vs-context, priority thresholds, nguồn token). Ý nghĩa "vì sao vành" = strong inference từ help-string `tc:1821`.

---

## Thẻ T1-2 — N5: Motion detection (frame-diff đa mốc + MOG2 + ngưỡng + blob→bbox)

**Bài toán đời thật.** Không có model phát hiện xe; phải trả lời "pixel nào vừa chuyển động". Xe đỗ yên hàng giờ là nền; xe mới chạy là foreground. Ánh nắng lấp ló qua cây, camera giật nhẹ, xe chạy chậm — tất cả đều "động" theo nghĩa pixel.

**Làm gì.** Hai kênh chứng cứ AND nhau: (a) **MOG2** background-subtraction (nền học dần, history=700 frame) cho blob foreground; (b) **temporal frame-difference** so với 2 mốc tham chiếu (ngắn 0.25s, dài 0.80s — "multiscale") bắt cả xe chậm. Mask cuối = MOG2 **∩** dilate(temporal-motion) **∩** ROI → morphology → `findContours` → bbox + anchor bottom-center.

**Vai trò.** Trước: N1 ROI, N3/N4 đã predict+prepare. Sau: danh sách detection `{box, motion_ratio, observation_kind…}` cho N6 gán. Mất nó: không detection → mọi track coasting→expire; bằng chứng mới hoàn toàn vắng.

**Nằm ở đâu.** `_detect` `mt:759-827`; `_temporal_motion_mask` `mt:522-574`; `_motion_between` `mt:451-461`; `_brightness_shift` `mt:472-484`; anchor `_bottom_center` `mt:391-394`; duplicate-filter `_suppress_duplicate_detections` `mt:1112-1134`.

**Tại sao + alternative.** MOG2 một mình nổ mask cho bóng đổ + nền thay đổi tức thì (đèn, cửa); frame-diff một mình bỏ sót xe chậm/dừng lại vẫn là foreground. AND-gate (motion làm support bắt buộc, `mt:793`) chỉ giữ vùng vừa khác nền vừa thật sự động gần đây — thiết kế conservative "thiếu còn hơn thừa" (docstring `occlusion_guard:1-6` thể hiện cùng triết lý). Alternatives hợp lý: chỉ MOG2 (đơn giản hơn nhưng nhiễu bóng/đèn); YOLO/DNN (chính xác hơn nhưng cần weight/GPU — code chọn không phụ thuộc model ngoài, `CLAUDE.md` mô tả "no external model weights").

**Các bước.**
1. Gray + `GaussianBlur(5×5)` cả hai nhánh (`mt:526-530`).
2. MOG2 apply → fg `>200` (giá trị 127 = shadow-marker bị loại trừ khi `reject_cast_shadows` bật + đã học được nền → cho vào để rọi shadow) `mt:768-789`.
3. Temporal: diff frame hiện tại với mốc ~0.25s và ~0.80s (có timestamp) hoặc gap 3/9 frame; mỗi diff bù sáng rồi threshold; OR hai mask `mt:522-574`.
4. `support = dilate(temporal, 17×17)`; `mask = mog2_fg ∧ support ∧ roi_context` `mt:790-816`.
5. Morph `OPEN 3×3` → `CLOSE(join 5×5×1)`; `findContours(RETR_EXTERNAL)` `mt:817-827`.
6. Lọc contour: `area≥650`, `w≥22`, `h≥18`, bbox≤0.30·W/0.42·H/0.12·area frame, `motion_pixels≥100`, `motion_ratio≥0.05` → detection.

**Tham số thật.** MOG2 `history=700, varThreshold=32, detectShadows=True` — tạo ở `mt:203`; `mt:768-769` là apply + threshold `>200`. Temporal: short `temporal_short_seconds=0.25`, long `0.80`, `motion_frame_gap=3`, `motion_long_frame_gap=9` `mt:34-96`; `enable_multiscale_motion` class False → runtime **True** `tc:2366-2397`. `motion_threshold` class 25 → runtime **20** `tc:1813`. `motion_min_pixels` 160→**100** `tc:1814`. `motion_min_ratio` 0.08→**0.05** `tc:1815`. `min_area=650` `tc:1807`. Bbox-max `0.30/0.42/0.12` `tc:1826-1841`. Aspect-ratio `0.25–5.0` `mt:973-975`. Join `5×5, iter 1` `tc:1844-1853`. Support dilate `17×17` `mt:791-793`. Cửa sổ nhận mốc temporal `target·0.45 ≤ age ≤ target·2.25` `mt:500`.

**Storyboard (deterministic — minh họa).** Cảnh 1280×720: xe A chạy 6px/frame; xe B đỗ yên (nền); cây lay ở góc (cũng "động").
- k1: frame t-0.25s/t-0.80s/t; diff ngắn thấy A (mép mới), diff dài thấy A + vệt đuôi; OR → temporal mask.
- k2: MOG2 trả A + vệt sáng lá (bóng/động nền); temporal cũng thấy lá — AND vẫn còn lá: morphology `OPEN 3×3` xóa chấm nhỏ, `CLOSE` nối thân xe.
- k3: contour A 3400px²>650 → bbox + chấm anchor bottom-center; blob lá 90px²<650 hoặc motion_ratio<0.05 → loại.
- k4 TẮT-multiscale (class default False): chỉ mốc 0.25s — xe chậm 1px/frame gần như mất diff → **miss**; BẬT (runtime True): mốc 0.80s vẫn thấy → giữ detection.
- k5 So sánh: cùng cảnh, TẮT temporal-support (giả lập): MOG2 nổ blob cho vũng nước phản chiếu → detection rác; BẬT: vũng nước không động gần đây → bị cổng support chặn.

**QA phản biện.** (1) Xe dừng hẳn >0.8s + MOG2 đã học xe vào nền → mất detection: đó là lý do tồn tại coasting N7 — detection tắt không có nghĩa xe biến mất. (2) `varThreshold=32` cứng: nền nhiễu mạnh có thể ép tăng foreground → được chặn tiếp bởi cổng diện tích/ratio. (3) Hai xe sát nhau → `CLOSE` nối thành 1 blob: không cố tách ở đây — nhường cho occlusion guard N4 xử lý.

**Mức chắc chắn:** Confirmed from code (chuỗi AND, toàn bộ ngưỡng, callsite). Hành vi "xe dừng bị nền nuốt" = strong inference từ cơ chế MOG2+temporal.

---

## Thẻ T1-3 — N3: Kalman filter hằng-vận-tốc 4 trạng thái

**Bài toán đời thật.** Detection là điểm đo nhiễu: bbox giật vài pixel mỗi frame, thỉnh thoảng mất hẳn (bị che). Muốn biết "xe đang đi đâu" để dự đoán vị trí frame tới và tự tin gán detection đúng xe — cần bộ lọc tách vị trí thật khỏi nhiễu đo.

**Làm gì.** Mỗi track 1 `cv2.KalmanFilter(4,2)`: trạng thái ẩn `(x, y, vx, vy)` — vị trí + vận tốc; phép đo chỉ `(x, y)`. `predict()` mỗi frame đẩy trạng thái theo mô hình hằng-vận-tốc `x' = x + vx`; `correct(x,y)` khi có detection khớp — nạp đo thật, hiệu chỉnh cả vị trí lẫn vận tốc ước lượng.

**Vai trò.** Trước: chạy **đầu** `process_frame` (`mt:2228`) — prediction đi trước detection để N6 biết "xe này đáng lẽ ở đâu" (gate), và N4 ước lượng tâm track cho occlusion guard. Sau: kết quả predict nuôi `_association_gate` và ma trận chi phí; `correct` chỉ xảy ra **sau** assign trong `_apply_detection`. Mất nó: gate phải dựa vào vị trí đo cuối (kém theo thời gian), coasting không tồn tại, mất dấu 1-2 frame = mất track.

**Nằm ở đâu.** Tạo `_new_kalman` `mt:440-448`; predict `_predict_tracks` `mt:239-295` gọi `mt:2228`; correct trong `_apply_detection` (matched loop `mt:2250-2255`, hàm `mt:2096`).

**Tại sao + alternative.** Cảnh top-down bãi đỗ: xe đi chậm, gần như thẳng đều giữa 2 frame → mô hình hằng-vận-tốc đủ cho cửa sổ dự đoán ngắn (≤0.4s sau đó bị "stale", xem T1-4) — suy luận từ cấu hình decay/stale chặt. Alternatives hợp lý: mô hình gia tốc CTRV (phức tạp hơn, lợi khi xe vào cua — đổi lấy nhiễu ước lượng); alpha-beta (đơn giản hơn nhưng không có covariance cho gate thích nghi). Code không ghi lý do lịch sử — chỉ ghi nhận lựa chọn hiện tại.

**Các bước.**
1. Sinh track: `KF(4,2)`, init `(px, py, 0, 0)` — chưa biết vận tốc `mt:447-448`.
2. Mỗi frame: `F·state` đẩy `(x,y)` theo `(vx,vy)` — mọi active track, kể cả đang mất detection `mt:239-295`.
3. Có detection khớp: `correct([x,y])` → trộn đo với dự đoán theo độ tin cậy (Kalman gain từ P, R).
4. Vận tốc `(vx,vy)` sau correct nuôi gate vận tốc ở N6.

**Tham số thật** `mt:440-448`. `transitionMatrix` = `[[1,0,1,0],[0,1,0,1],[0,0,1,0],[0,0,0,1]]` (dt=1 frame). `measurementMatrix` quan sát `(x,y)`. `processNoiseCov = diag(2,2,12,12)` — nhiễu vận tốc lớn gấp 6× vị trí: cho phép vận tốc ước lượng đổi nhanh. `measurementNoiseCov = 8·I` — tin đo ~±2.8pxσ. `errorCovPost = 100·I` — khởi đầu "chưa biết gì". Predict chạy trước detect `mt:2228` vs `mt:2233` [prod order].

**Storyboard (deterministic — minh họa).** Xe đi +6px/frame trục x [minh họa]; đo nhiễu ±4px.
- k1 f0: birth tại (100,300), v=0, P=100 → elip tin-cậy to.
- k2 f1: predict (100,300); đo (105,302) → correct kéo về ~103, vx≈+5, elip co.
- k3 f2-f3: predict (109),(115); đo (114,299),(121,301) → v→+6px/f, elip nhỏ dần.
- k4 f4 **mất detection**: chỉ predict → (127,300), vận tốc giữ +6 nhưng elip P giãn lại → "bóng ma" đi trước.
- k5 f5 detection thật ở (134,300) nằm trong elip giãn → correct khớp lại; nếu KF tắt (giả lập): vị trí cũ (121) — cách 13px, cùng cảnh → TẮT: có thể rớt gate; BẬT: khớp.

**QA phản biện.** (1) Q vận tốc=12: xe quay đầu/phanh đột ngột — mô hình hằng-vận-tốc đuổi theo nhờ Q lớn; nếu Q nhỏ hơn sẽ lag → lựa chọn này chấp nhận vận tốc ước lượng "lỏng". (2) Xe đỗ yên: vx,vy→0, predict≈đứng im — Kalman vô hại với xe tĩnh. (3) Khởi tạo v=0 cho xe đang chạy nhanh vào ROI: 1-2 correct đầu kéo vx lên; trong khoảnh khắc đó gate dựa vào nhánh fail-open của N6 (`<3` observations → trần cảnh 180px) — thiết kế có chủ đích.

**Mức chắc chắn:** Confirmed from code (ma trận, noise, thứ tự predict-trước-detect, correct-sau-assign).

---

## Thẻ T1-4 — N7: Dự đoán khi mất dấu — coasting, stale prediction, TTL

**Bài toán đời thật.** Xe chui sau cột/xe khác 0.3-1s: detection mất nhưng xe vẫn tồn tại. Nếu giết track ngay → ID nhảy, handoff hỏng. Nếu tin dự đoán mãi → track "ma" ăn detection của xe khác. Cần hành lang có hạn: dự đoán tiếp một chút, giảm niềm tin dần, rồi dừng hẳn.

**Làm gì.** Track unmatched vẫn được `predict()` (coasting — "trôi theo quán tính"), nhưng điểm dự đoán **bị kéo dần về điểm đo cuối**: `point = measured + (kalman_predict − measured)·exp(−age/0.25s)` (`mt:278`) — không phải nhân vận tốc; `velocity_confidence` giảm **tuyến tính** `1 − age/limit` (`mt:280-287`). Quá `max_prediction_age_seconds=0.40s` → **stale**: neo hẳn về điểm đo cuối (`prediction_source="stale_prediction"`, confidence=0) — ma không trôi xa nữa. Riêng track vừa qua merged-occlusion (`last_ambiguous_kind=="merged"` + recent freeze) **không decay**: giữ nguyên dự đoán Kalman + confidence 1.0 (`mt:270-276`), với limit `max(0.40, 3.0)=3.0s` (`mt:307-317`). Quá TTL → expire.

**Vai trò.** Trước: N6 assign — track không khớp mới vào nhánh này. Sau: expire → `tc:2690-2716` báo manager/binder (ranh giới B); detection thừa → `_create_or_reid` — **luôn cấp local ID mới** (`mt:2009-2069`, docstring `:2012-2016`: local ID là fragment-scoped, "global identity recovery belongs to CrossCameraManager" — không reuse local ID). Reacquire thật nằm trong `_assign`: track invisible còn trong cửa sổ (1.5s / merged 3.0s) vẫn eligible, qua cổng appearance `≤0.30` (stale-anchor siết `≤0.22`) + diện tích `0.35–2.8×` (`mt:1631-1755`). Mất nó: mất detection 1 frame = mất ID, hoặc ngược lại track ma nuốt detection lạ.

**Nằm ở đâu.** `_predict_tracks` `mt:239-295` (decay `:263-288`, stale `:266-269`, merged-freeze `:270-276`); `_prediction_age_seconds` `mt:297-305`; `_prediction_age_limit_seconds` `mt:307-317`; reacquire trong `_assign` `mt:1631-1687` (window+anchor) + `mt:1726-1755` (appearance/area gates); unmatched/expire `mt:2257-2334`; `_lost_beyond_ttl_seconds` `mt:2189-2202`; birth `_create_or_reid` `mt:2009-2069`; suspend `suspend_track` `mt:2175-2187`.

**Tại sao + alternative.** "Kéo dự đoán về điểm đo + neo sau 0.4s" thừa nhận: dự đoán hằng-vận-tốc chỉ đáng tin trong cửa sổ rất ngắn ở bãi đỗ — comment `mt:259-261` nói thẳng: "A stopped car often leaves no foreground pixels. Do not let its old velocity carry the identity along the path of a neighbouring moving car" [lý do verified từ comment]. TTL tính bằng **giây** thay frame (`mt:2189-2202`, comment: frame-TTL giãn khi FPS tụt). Alternatives: giữ dự đoán không decay (rủi ro ma chạy theo xe hàng xóm — đúng thứ code tránh); expire theo frame (lệch khi load chậm); xóa ngay khi mất (ID nhảy).

**Các bước.**
1. Track không khớp detection → `consecutive_invisible_count++`, `age` = giây kể từ đo cuối (`mt:297-305`, timestamp; fallback frame/30).
2. Predict mỗi frame: `point = measured + (kalman−measured)·exp(−age/0.25)`; `confidence = clip(1 − age/limit)` tuyến tính `mt:263-288`.
3. `age > limit` (0.40s; merged 3.0s) → `point = measured`, `stale_prediction`, confidence=0 `mt:266-269`.
4. **Reacquire (trong `_assign`)**: invisible nhưng `lost_seconds ≤ 1.5s` (merged ≤3.0s) → vẫn vào ma trận; quá cửa sổ → `association_rejected_stale_track` `mt:1631-1651`. Stale-anchor dùng riêng gate `min(max_distance, max(3.0, 0.30·diag))` `mt:1696-1702`; appearance `≤0.30`, stale-anchor `≤0.22` `mt:1732-1736`; area `0.35–2.8×` `mt:1750-1755`. Khớp → nối lại đúng track đó.
5. Quá TTL (`lost_track_ttl` 90f; timestamp: `lost_track_ttl_seconds = max(1.0, ttl_reacquire_multiple=1.5)·merged_window=3.0 = 4.5s` `mt:149-154`) → expire → event downstream.
6. `suspend_track(id, reason)` `mt:2175-2187`: **pop khỏi `_tracks`** → `_suspended_tracks` + `association_state="suspended_*"` → thoát hẳn vòng predict/assign/TTL (đỗ yên — dormant phía binder gọi, ranh giới B).

**Tham số thật.** `reacquire_max_seconds=1.5` `tc:1855`; `merged_reacquire_max_seconds=3.0` `mt:34-96`; `max_prediction_age_seconds=0.40` `tc:1859-1862`; `prediction_velocity_decay_seconds=0.25` `tc:1865-1868`; `lost_track_ttl=90`f `tc:1806`; `lost_appearance_threshold=0.30` `tc:1856`; `min/max_reacquire_area_ratio=0.35/2.80` `mt:34-96`; `lost_track_ttl_reacquire_multiple=1.5` `mt:34-96`.

**Storyboard (deterministic — minh họa).** Xe vx=+6px/f; đo cuối tại (200,300); bị che từ f10.
- k1 f10: mất detection → coasting: predicted = measured + (kalman−measured)·e^0 → điểm ma trùng dự đoán Kalman, age≈0.
- k2 f15: age≈0.17s → hệ số e^(−0.17/0.25)≈0.51 → điểm ma chỉ đi **51%** độ dời Kalman: gần điểm đo hơn là điểm dự đoán trần; confidence tuyến tính ~0.57 [minh họa số].
- k3 f22: age≈0.40s → chạm ngưỡng: `point = measured` (200,300), `stale_prediction`, confidence=0 [prod threshold] — ma neo hẳn, không trôi thêm.
- k4 f30 (age≈0.67s): detection thật quay lại cách anchor 40px → invisible nhưng ≤1.5s → eligible trong `_assign`, qua appearance ≤0.30 + area → khớp lại đúng track (không phải ID mới).
- k5 Nhánh B cùng cảnh: không có detection đến age>4.5s [prod TTL giây] → expire → notify N8.
- k6 OFF-decay (giả lập): điểm ma giữ nguyên quán tính +6px/f suốt 0.4s → lệch ~60px về phía xe đối diện → ăn nhầm detection; ON: kéo về measured → an toàn. (Một nhánh đặc biệt: track vừa merged-occlusion **không decay** — giữ Kalman trần + confidence 1.0 trong ≤3.0s, `mt:270-276`.)

**QA phản biện.** (1) Xe thật đổi hướng trong lúc bị che: reacquire vẫn khớp nếu quay lại trong 1.5s + diện tích/appearance hợp; nếu đi xa hẳn → ID cũ expire đúng nghĩa. (2) `stale` sau 0.4s nhưng TTL ~4.5s: vùng 0.4-4.5s track "đứng im chờ" — không trôi, không chết — đúng thiết kế an toàn cho reacquire gần. (3) FPS tụt 30→10: timestamp-TTL giữ đúng 4.5s thật; frame-TTL 90 sẽ thành 9s — lý do code có 2 nhánh [xác minh comment `mt:2189-2202`].

**Mức chắc chắn:** Confirmed from code (decay, stale-anchor, TTL giây, hằng số). Giá trị storyboard là minh họa.

---

## Thẻ T1-5 — N6: Hungarian/LAPJV + gating

**Bài toán đời thật.** Frame này có M track đang chờ và N detection mới — ai là ai? Gán sai 1 lần = 2 xe đổi ID vĩnh viễn. Greedy ("track nào cũng bắt detection gần nhất") thất bại khi 2 track tranh 1 detection: kẻ đến trước ăn, kẻ sau đói — nhưng tổng chi phí toàn cục có thể tệ.

**Làm gì.** Xây ma trận chi phí `costs[track][detection]` (khởi tạo 10.0 = "cấm"), điền chi phí thật chỉ cho cặp qua được **cổng** (gate khoảng cách thích nghi theo vận tốc+invisible+kích thước; trước 3 quan sát gate "fail-open" tới trần cảnh). Chi phí = `0.45·(khoảng cách/max_distance) + 0.25·(1−IoU) + 0.20·appearance(Bhattacharyya) + 0.10·size_error` (`mt:1761-1766`). Giải gán **toàn cục 1-1** bằng `lapjv` (solver LAP/JV — thuộc nhóm bài toán "Hungarian"/gán tuyến tính; trong source gọi literal `lapjv` với `extend_cost=True, cost_limit=0.90`). Sau giải: margin mơ hồ → đóng băng cặp tranh chấp; occlusion guard được quyền **defer** cả nhóm.

**Vai trò.** Trước: N3 predict (điểm kỳ vọng), N5 detections, N4 annotate merged. Sau: cặp khớp → `_apply_detection` correct Kalman; unmatched hai phía → N7 coasting/birth. Mất nó (tắt LAPJV, giả lập greedy): cảnh 2 xe chéo — greedy gán theo thứ tự duyệt → hoán ID; LAPJV tối thiểu **tổng** chi phí → đúng cặp.

**Nằm ở đâu.** `_assign` `mt:1597-2007` (init `mt:1615`, gate `mt:1691-1707`, LAPJV `mt:1908`, margin `mt:1914-1992`, og-gate `mt:1994-1999`); `_association_gate` `mt:1193-1230`; `_mark_competing_assignments` `mt:1331-1484`; import `lapjv` `mt:16`.

**Tại sao + alternative.** Bài toán gán 1-1 hai phía là kinh điển: LAPJV cho nghiệm tối ưu toàn cục O(n³) — với ≤vài chục track/detection là rẻ [suy luận về kích thước bài toán]. `extend_cost=True` + `cost_limit=0.90` ép solver tôn trọng "cấm" thay vì ép gán mọi cặp — [suy luận: thiết kế thiên về "không gán còn hơn gán sai", khớp cùng triết lý defer ở `_mark_competing_assignments`]. Alternatives: greedy (nhanh, sai khi tranh chấp — chính thứ mà `_mark_competing_assignments` phải vá thêm); mạng neural data-association (nặng, cần train).

**Các bước.**
1. `costs[:,:]=10.0` `mt:1615`.
2. Mỗi (track, det): tính gate riêng (velocity-aware sau ≥3 obs; floor `max(24px, extent)`; chưa đủ obs → trần `max_distance`) `mt:1193-1230`.
3. Detection `ambiguous_merged` (từ N4) → giữ cost 10, không gán `mt:1691+`.
4. `_mark_competing_assignments`: 1 detection có ≥2 track khả thi (`cost<0.90`) mà không còn cột khả thi khác, và (chênh cost < margin 0.08 hoặc dự đoán cách ≤1.1×đường chéo bbox) → nếu 2 track **đã chứng minh độc lập** → cột = ambiguous, chi phí 10 (defer, không ai được ăn); nếu chưa chứng minh → chỉ giữ lineage mạnh nhất, suppress phần còn lại `mt:1331-1484`.
5. `lapjv(costs, extend_cost=True, cost_limit=0.90)` → cặp (row→col) `mt:1908`.
6. Margin check — **phạm vi hẹp**: chỉ áp cho track `invisible>0` **hoặc** có `recent_merged_freeze` (`split_margin_track_ids` `mt:1685-1686`), nhắm đúng nơi ID-switch hay xảy ra. Nghiệm phải thắng đối thủ ≥ `adjusted_margin = 0.08·(2 − lineage_score)` (`mt:1921` — track non cần margin gấp ~2×); không đạt → `split_assignment_deferred`, track giữ `split_recovering` và detection bị đánh ambiguous. Đạt margin nhưng vừa mơ hồ ≤3 frame trước → cần `ambiguous_recovery_frames=3` frame sạch trừ khi `clear_evidence` (total≤0.12 & appearance≤0.08 & size≤0.20 & position≤0.20) đóng merged ngay `mt:1926-1985`. Track thường (không invisible/merged) vào thẳng `else` — không bị margin.
7. `occlusion_guard.gate_assignments`: nhóm merged active — nghiệm phải thỏa `swapped−direct ≥ 2·margin` và `direct<1.2`, đủ 3 frame liên tiếp mới recover; không → defer cả nhóm + chặn detection hình-thành-viên `og:191-232`.

**Tham số thật.** `max_distance=180.0` `tc:1811`, kéo dài tối đa `×min(1.25, 1+invisible/60)` `mt:1691-1694`; `velocity_gate_scale=2.0`, `velocity_gate_size_ratio=1.0`, `velocity_gate_min_observations=3`, floor `max(24, extent)` `mt:34-96` + `mt:1219-1230`; cost weights `0.45/0.25/0.20/0.10` `mt:1761-1766`; `assignment_cost_limit=0.90` `mt:34-96`, LAPJV `mt:1908`; `split_assignment_margin=0.08` (base, `adjusted = ×(2−lineage_score)`) `mt:1921`; `association_ambiguity_margin` runtime **0.08** `tc:1871-1874`; `ambiguous_recovery_frames=3` `tc:1877-1880`; `clear_evidence` `0.12/0.08/0.20/0.20` `mt:1939-1945`; viable `min(0.90, 0.95)` `mt:1348`; close-pred `1.10×diag` `mt:1392`; reacquire window `1.5s`/merged `3.0s` + stale-anchor gate `min(max_distance, max(3.0, 0.30·diag))` `mt:1631-1702`; og `swapped−direct≥2·margin, direct<1.2, recovering≥3` `og:206-212`.

**Storyboard (deterministic — minh họa, CÙNG 1 ma trận cho cả 2 nhánh).** 2 track T1,T2 cắt nhau; detection d1,d2. Ma trận chi phí cố định [minh họa]:
```
        d1     d2
T1     0.30   0.50
T2     0.25   0.85
```
- k1: ma trận hiện; cặp quá gate (ví dụ T1-d3) = X (10.0).
- k2 Nhánh OFF (giả lập greedy, duyệt T1 trước): T1 lấy min hàng → d1 (0.30); T2 chỉ còn d2 (0.85) → **tổng 1.15** — T2 bị đẩy vào detection xa vật lý thật của nó.
- k3 Nhánh ON (LAPJV production, cùng ma trận): so 2 phương án 1-1 — (T1d1+T2d2)=1.15 vs (T1d2+T2d1)=0.50+0.25=**0.75** → chọn 0.75 → T2 đúng xe của nó ở d1. Greedy thua vì chỉ nhìn từng hàng, không nhìn tổng.
- k4 Cùng cảnh, chỉ còn **1 detection** duy nhất và cả T1,T2 khả thi: cost 0.30 vs 0.34 (chênh < margin 0.08) + predict gần → cột bị đóng băng (defer) — không gán thay vì gán sai.
- k5 merged blob (N4 active): nghiệm phải qua `swapped−direct ≥ 2·0.08` & `direct<1.2`, đủ 3 frame → recover; thiếu → defer cả nhóm.

**QA phản biện.** (1) `cost_limit=0.90` cứng: track với appearance xa nhưng vật lý đúng (đổi sáng mạnh) có thể rớt ngưỡng → coasting thay vì gán sai — [suy luận: chấp nhận miss có kiểm soát]. (2) Freeze khi tranh chấp: 2 frame liên tiếp bị defer → detection không ai ăn, có nguy cơ nuôi blob mồ côi — đổi lấy không nhiễm độc appearance [strong inference từ docstring `mt:1338-1345`]. (3) Vì sao không Hungarian module gốc: `lap` solver là LAPJV — bài toán cùng nhóm; dossier gọi "LAPJV" cho đúng source, "Hungarian" chỉ để định vị khái niệm.

**Mức chắc chắn:** Confirmed from code (solver, cổng, ngưỡng, defer logic). Nhãn "Hungarian" = tên nhóm bài toán, source literal là `lapjv`.

---

## Thẻ T2-1 — N5: Bù sáng toàn cục (brightness compensation)

**Bài toán đời thật.** Mây che nắng, đèn bật, exposure camera tự chỉnh — toàn bộ frame sáng/tối đi cùng lúc. Frame-diff "ngây" sẽ thấy **mọi pixel khác** → mask nổ trắng, hàng trăm blob nhiễu.

**Làm gì.** Trước khi `absdiff`, đo độ lệch sáng toàn cục giữa frame hiện tại và frame tham chiếu bằng **median** của hiệu mức xám trên mẫu thô (không phải mean — median bền với vùng xe đang chuyển động), rồi cộng bù vào frame tham chiếu, clip [0,255]. Sau bù, diff chỉ còn khác biệt cục bộ thật.

**Vai trò.** Nằm trong mỗi phép diff của N5 — gọi bởi `_motion_between` cho cả 2 mốc temporal. Trước: gray+blur. Sau: diff đã bù → threshold → temporal mask. Mất nó: mỗi lần đổi sáng = một đợt detection rác toàn cảnh → tracker ngập track ảo.

**Nằm ở đâu.** `_brightness_shift` `mt:473-484` (lưới thô `_BRIGHTNESS_SAMPLE_TARGET=128` `mt:470`); áp dụng trong `_motion_between` `mt:451-461` (`add(shift)` → `clip` → `absdiff` → `THRESH_BINARY`).

**Tại sao + alternative.** Median robust hơn mean khi một phần ảnh thật sự đổi (xe chạy) — mean bị kéo bởi chính đối tượng [suy luận từ chọn median]. Alternative hợp lý: histogram equalization (mạnh hơn nhưng méo màu, tốn hơn); normalize theo vùng (chính xác hơn nhưng phức tạp). Chỉ bù **1 hằng số toàn cục** — không xử lý gradient sáng cục bộ.

**Các bước.**
1. Lấy mẫu gray theo **lưới đều ~128 điểm mỗi chiều**: `step = max(1, min(H//128, W//128))` → `frame[::step, ::step]` — với 1280×720 ra step 5 → lưới 256×144 (≠ "128 mẫu tổng"; 128 là mật độ lưới mỗi chiều, chọn vì median full-frame ~17ms quá chậm `mt:463-469`) `mt:470-484`.
2. `shift = median(gray_now − gray_ref)`.
3. `ref_bù = clip(ref + shift)`; `diff = absdiff(now, ref_bù)`.
4. `mask = diff > motion_threshold` (20 runtime).

**Tham số thật.** `_BRIGHTNESS_SAMPLE_TARGET=128` (lưới mỗi chiều, `step=max(1,min(H//128,W//128))`) `mt:470-484`; `motion_threshold` class 25 → runtime **20** `tc:1813`; clip [0,255] `mt:455-461`.

**Storyboard (deterministic — minh họa, cùng cảnh).** Cảnh: frame t-0.25s sáng 120 mean; mây đến, frame t sáng 95; xe A chạy.
- k1 OFF (không bù): diff toàn ảnh ~25 → mask nổ khắp → hàng chục blob.
- k2 ON: shift=−25 → ref bù tối theo → diff chỉ còn vùng xe + mép cây → đúng 1 blob.
- k3 Xe đen trên nền xám: median bù toàn cục không xóa tương phản cục bộ → blob vẫn trụ.
- k4 Giới hạn [suy luận từ cơ chế]: đèn xe rọi chỉ 1 góc → bù toàn cục không triệt → vùng đó vẫn diff (chuyển cho ngưỡng/morphology xử lý).

**QA phản biện.** (1) Xe chiếm >50% mẫu: median vẫn chịu kéo → bù lệch một ít — hiếm ở top-down nhưng có thể ở cam gần [suy luận]. (2) Đổi sáng cục bộ lớn: bù một hằng số không đủ — blob nhiễu cục bộ lọt vào, phải qua tiếp cổng min_area/ratio. (3) Vì sao không bù trong MOG2: MOG2 tự thích nghi nền chậm (history 700f) — bù sáng là cho nhánh temporal-diff, hai nhánh bổ sung [suy luận từ kiến trúc].

**Mức chắc chắn:** Confirmed from code (median, sample target, clip, thứ tự trong `_motion_between`). Ý nghĩa robust-median = suy luận.

---

## Thẻ T2-2 — N5: Chặn bóng đổ (cast-shadow rejection)

**Bài toán đời thật.** Hai mặt của marker-127: (a) bóng đổ "động" y như xe — nếu để vào blob: bbox phình, anchor sai, 2 xe dính 1; (b) **xe tối màu** trên đường xám cũng bị MOG2 xếp 127 (đặc biệt khi exposure tăng) — loại sỉ 127 thì mất luôn thân xe. Cần phân biệt "nền bị tối đi" vs "vật thể tối thật".

**Làm gì.** MOG2 (`detectShadows=True`) gán **127** cho pixel nghi-bóng và 255 cho foreground chắc. Nhánh mặc định (`reject_cast_shadows=False`) loại sỉ mọi 127 bằng `threshold(>200)` — bóng đi luôn, **nhưng thân xe tối màu bị MOG2 xếp nhầm 127 cũng bị xóa vĩnh viễn** (comment `mt:772-779` nói đúng điều này: ">200 threshold permanently deleted the body"). Khi flag bật + nền đã học (`_background_reference`, snapshot mỗi 10 frame trước `apply` `mt:734-757`): 127 được admit vào mask tạm, rồi `_is_cast_shadow()` rọi **từng contour** — mô hình "bóng = nền × 1 hệ số tối": attenuation median trong dải hẹp `[0.32,0.62]` (quá tối = vật thể đen thật → không phải bóng), sắc độ gần nguyên (`chromaticity_distance ≤ 0.10`), phần dư sau nhân hệ số nhỏ (`scaled_residual ≤ 0.08`), và ≥75% pixel được mô hình giải thích (`explained_fraction ≥ 0.75`). Vùng đạt → xóa khỏi mask (`drawContours FILLED 0` + `continue`); fail → giữ và đánh dấu `dark_foreground_rescued` (≥20 marker-px và ≥8% contour `mt:1043-1045`). Metrics thiếu dữ liệu → **fail-open: không bao giờ reject** (`mt:647,714-716`).

**Vai trò.** Trong `_detect`, sau MOG2 trước contour-loop: quyết định marker-127 đi vào đâu. Trước: nền học đủ mới (≤10 frame). Sau: blob sạch bóng nhưng giữ xe tối. Mất nó = cấu hình class default: bóng vẫn bị loại (qua exclusion 127) nhưng **xe tối màu mất khối blob** — detection nhỏ/rách/miss.

**Nằm ở đâu.** Marker admission `mt:780-789`; `_cast_shadow_metrics` `mt:633-703`; gate `_is_cast_shadow` `mt:705-726`; `_background_reference` `mt:734-757`; reject per-contour `mt:1046-1063`; telemetry `last_shadow_rejections` `mt:2409-2411`.

**Tại sao + alternative.** Bóng đổ ≈ nền bị che sáng: giữ sắc độ + texture, mất cường độ theo 1 hệ số — docstring `mt:640-647` nói đúng vật lý này. Dải attenuation hẹp cố tình để không nuốt vật thể đen (`mt:645-646`). Alternatives: giữ nguyên loại-sỉ-127 (đơn giản — chính là nhánh OFF: đổi lấy mất xe tối, comment `:772-776`); shadow-classifier học máy (nặng, cần label).

**Các bước.**
1. `raw = bg_sub.apply` → `definite_fg = raw>200`; chỉ khi flag + nền: `markers = (raw==127)`, `mask = definite_fg | markers` `mt:768-789`.
2. Mỗi contour: đếm `shadow_marker_ratio`; `_is_cast_shadow` đo metrics trên vùng chọn `mt:1030-1052`.
3. Metrics: cần `≥120` px chọn, `valid ≥120` và `≥60%` (lum nền ≥20, hiện ≥3) — thiếu → None → **giữ** `mt:656-667`.
4. `attenuation=median(L_now/L_bg)`; chromaticity L1 median; `scaled_residual=median|L_now−att·L_bg|/L_bg`; `explained` = att trong ±0.18 quanh median + chrom ≤0.12 + residual ≤0.12 `mt:673-696`.
5. Đạt cả 4 gate → bóng → xóa contour + rejection log; fail → detection thường + flag rescued `mt:1046-1085`.

**Tham số thật** `mt:34-96` + runtime `tc:2366-2397`: `shadow_attenuation_range=(0.32, 0.62)` (`shadow_min/max_attenuation` dùng `mt:718-720`), `shadow_max_chromaticity_distance=0.10`, `shadow_max_scaled_residual=0.08`, `shadow_min_explained_fraction=0.75`, `shadow_min_pixels=120`; explained-tolerance `±0.18 / ×1.2 / ×1.5` `mt:691-695`; lum gates `≥20 / ≥3` `mt:664`; valid `≥60%` `mt:666`; rescue `≥20px & ≥0.08` `mt:1043-1045`; bg refresh `10`f `mt:734`; `reject_cast_shadows` class **False** → runtime **True** `tc:2366-2397`.

**Storyboard (deterministic — minh họa, cùng cảnh).** Nắng 45°; xe A **tối màu** kéo bóng S.
- k1 OFF (`reject_cast_shadows=False` [class default]): MOG2 xếp S→127 **và** nắp xe tối→127; `>200` loại sỉ → S không vào mask ✓ nhưng blob xe mất phần tối → còn 60% diện tích, có thể rớt `min_area` → **miss/track đứt**.
- k2 ON [runtime]: 127 admit → contour S: att 0.45∈[0.32,0.62], chrom/residual đạt, explained 0.8≥0.75 → **bóng** → xóa; contour thân xe tối: att 0.20<0.32 → fail band → giữ → `dark_foreground_rescued`.
- k3 So sánh trực tiếp: OFF → detection xe 60% (hoặc không có); ON → detection đủ thân xe, bóng vẫn loại. Cùng input, chỉ đổi cờ.
- k4 Xe sáng màu bình thường (không 127 trên thân): OFF/ON như nhau — blob đầy đủ cả hai (flag chỉ khác khi MOG2 xếp 127 nhầm).

**QA phản biện.** (1) Bóng cực đậm (att<0.32): trượt band → coi là xe → sót bóng đậm; band hẹp là đánh đổi có chủ đích cho xe đen (`mt:645-646`). (2) Nền mới/refresh: `metrics=None` → fail-open giữ blob — tốt cho an toàn nhưng bóng sống sót trong cửa sổ đó [code `mt:647,714-716`]. (3) Contour nhỏ <120 px: không đủ mẫu → metrics None → giữ — bóng nhỏ lọt nhưng được cổng `min_area`/motion_ratio bắt tiếp [suy luận chuỗi].

**Mức chắc chắn:** Confirmed from code — đã trace toàn bộ `_cast_shadow_metrics`/`_is_cast_shadow`/admission/reject-branch. Không còn phần chưa đọc.

---

## Thẻ T2-3 — N5·N6: Chặn echo/twin — duplicate detection & ROI-edge twin

**Bài toán đời thật.** Một xe vật lý sinh hai chứng cứ gần-giống nhau: (a) detection kép — cùng vệt motion nổ 2 blob lồng/liền nhau (echo); (b) **ROI-edge twin** — track bị "bỏ đói" ở mép ROI bật lại thành ID thứ hai, bbox gần trùng hẳn. Nếu không dẹp: 1 xe 2 ID, Hungarian tranh cướp, handoff rối.

**Làm gì.** Hai cơ chế: (1) `_suppress_duplicate_detections` — so sánh cặp detection: histogram, tỷ lệ kích thước, khoảng cách tâm, khe hở bbox; gần-trùng → giữ 1, nhưng **không** suppress nếu mỗi blob có "chủ sạch" riêng (tránh xóa 2 xe thật sát nhau). (2) `_suppress_roi_edge_twins` — chỉ xét cặp **cả hai đều `roi_clipped`**: IoU≥0.90 + tâm cách ≤ `max(12px, 0.15·extent)` (extent = min đường-chéo-bbox của hai track) + ít nhất 1 bên tentative/invisible → giữ lineage mạnh hơn (confirmed > first-observation cũ hơn > nhiều obs hơn > ID nhỏ hơn — `_roi_edge_twin_strength` `mt:1491-1499`); twin thua vẫn ở trong `_tracks`, già đi bình thường, nhưng **không được claim detection** và không tạo ID cạnh tranh.

**Vai trò.** (1) chạy trong N5 trước khi detection ra ngoài; (2) chạy đầu N6 trong `_assign`. Trước: contour/track hiện hữu. Sau: detection/track sạch cho LAPJV. Mất nó: xe mép ROI nhân đôi ID; blob echo làm track cướp nhầm.

**Nằm ở đâu.** `_same_motion_echo` `mt:1088+`; `_suppress_duplicate_detections` `mt:1112-1134`; hằng `_ROI_EDGE_TWIN_IOU=0.90`, `_ROI_EDGE_TWIN_CENTER_PX=12.0` `mt:1488-1489`; `_suppress_roi_edge_twins` `mt:1501-1595` (comment cơ chế `mt:1485-1487`).

**Tại sao + alternative.** Twin mép-ROI là artifact của chính cơ chế ROI: xe chạy dọc biên → anchor ra/vào → track cũ starve, birth mới cùng chỗ. Suppress tại assign (giữ cả 2 trong `_tracks`) an toàn hơn kill hẳn — nếu 2 xe thật trùng ngẫu, track thua vẫn có cơ hội sống lại [suy luận từ thiết kế "vẫn giữ trong _tracks"]. Alternatives: merge/xóa track thua ngay (mất dữ liệu nếu phán sai); NMS detection thuần (không xử lý được twin ở tầng track — cần cả hai).

**Các bước.**
1. Detection mới: so từng cặp `_same_motion_echo` (hist + size + dist + gap) `mt:1088-1111`.
2. Echo + không có chủ sạch riêng → loại bớt `mt:1112-1134`.
3. Trong `_assign`: **cả hai** track `roi_clipped` + IoU≥0.90 + tâm ≤`max(12, 0.15·extent)` + ≥1 bên tentative/invisible → twin `mt:1501-1595` (gate `:1523-1560`).
4. Chọn winner theo thứ tự confirmed → first_obs cũ → nhiều obs → ID nhỏ.
5. Twin thua: chi phí vô hiệu trong ma trận (không claim), vẫn age/expire theo TTL chung.

**Tham số thật.** `_ROI_EDGE_TWIN_IOU=0.90`, `_ROI_EDGE_TWIN_CENTER_PX=12.0` `mt:1488-1489`; gate đầy đủ: **both** `roi_clipped` + IoU≥0.90 + `center_gap ≤ max(12.0, 0.15·extent)` với `extent = min(hypot(w,h) hai bbox)` `mt:1523-1560`; điều kiện ≥1 bên TENTATIVE ∨ `consecutive_invisible_count>0` `mt:1529-1535`; tiêu chí winner `_roi_edge_twin_strength` = (CONFIRMED, first_obs cũ hơn, visible nhiều hơn, ID nhỏ hơn) `mt:1491-1499`.

**Storyboard (deterministic — minh họa, cùng cảnh).** Xe A chạy dọc mép ROI.
- k1 f1-20: track T7 confirmed theo A; mép ROI cắt contour → anchor bật ra ngoài → T7 invisible.
- k2 f21: blob A lại vào ROI → birth T9 tentative — cùng xe, bbox IoU 0.93 với T7.
- k3 OFF twin-suppress (giả lập): T7,T9 cùng claim detection A mỗi frame → LAPJV tranh, 1 xe 2 ID song song.
- k4 ON [prod]: IoU 0.93≥0.90, tâm 8px≤12, T9 tentative → T9 bị suppress, T7 (confirmed, first-obs cũ) giữ → 1 ID.
- k5 Phản ví: 2 xe thật sát IoU 0.91 nhưng cả hai confirmed + obs đủ → **không** suppress (điều kiện "≥1 tentative/invisible" chặn) — cùng cơ chế, khác kết quả.

**QA phản biện.** (1) Ngưỡng IoU 0.90 rất cao: chỉ bắt twin gần-nhất-trí — 2 xe thật đỗ sát nhau hiếm khi trúng, thiết kế cố tình hẹp [suy luận]. (2) T9 thua bị giữ trong `_tracks`: chiếm slot và vẫn expire theo TTL — chi phí chấp nhận được cho an toàn [suy luận]. (3) Blob echo của xe có chủ: `_suppress_duplicate_detections` bảo vệ detection có "clean owner" riêng — tránh nuốt xe hàng xóm thật.

**Trạng thái nhìn thấy (audit/HUD).** Track thua twin vẫn sống trong `_tracks` và được gắn nhãn `association_state="suppressed_roi_edge_twin"` + `observation_kind="prediction"` `mt:2272-2275`; nhánh mơ hồ bị đóng băng → `"frozen_ambiguous"` + `'occluded_prediction'`; còn lại `"coasting"` `mt:2276-2278` — tức trạng thái cơ chế có thể hiện thẳng lên UI/debug mà không cần suy ra.

**Mức chắc chắn:** Confirmed from code (2 cơ chế, hằng số, điều kiện, winner-order). Phân loại "twin vẫn được giữ an toàn" = strong inference từ thiết kế.

---

## Thẻ T2-4 — N7: Vòng đời track (tentative → confirmed → lost → expire / suspended)

**Bài toán đời thật.** Không phải blob nào cũng là xe: một vệt motion đơn lẻ (giật camera, bóng mây) không nên được cấp danh tính thật. Track phải "chứng minh" mình tồn tại qua nhiều quan sát trước khi downstream (handoff, binder, GID) được tin.

**Làm gì.** Máy trạng thái 3 trạng thái `TrackStatus`: **TENTATIVE** khi `_create_or_reid` sinh — chưa đủ bằng chứng; **CONFIRMED** khi đủ `min_visible_count` quan sát **và** di chuyển đủ `min_confirm_displacement` (chống blob đứng yên như lá cây rung); **LOST** khi confirmed không còn detection khớp (vào coasting T1-4); quá TTL → **expire** ra khỏi pool, báo N8. Nhánh phụ: track suspended (đỗ yên lâu — dormant phía binder) không predict/expiry theo cách thường. Priority-region track xác nhận nhanh hơn — nhưng **2 obs đó phải nằm trong vùng ưu tiên**: `priority_observation_count` chỉ tăng khi detection mang `priority=True` `mt:2167-2169`, `_is_confirmable` đòi riêng `priority_observation_count ≥ 2` + displacement 3px `mt:2072-2082`.

**Vai trò.** Trước: detection qua N5/N6. Sau: chỉ track CONFIRMED mới đi tiếp xuống manager/binder (notify ở `tc:2690-2716`) — TENTATIVE/LOST là nội bộ tracker. Mất nó (confirm ngay 1 obs): mọi nhiễu motion tức thì thành "xe" → snapshot rác.

**Nằm ở đâu.** Enum `TrackStatus` `vt:20-23`; fields `vt:40-68`; birth `_create_or_reid` `mt:2009-2069` (luôn ID mới — xem T1-4); confirm `_is_confirmable` `mt:2071-2094` gọi ở `_apply_detection` `mt:2170`; unmatched/expire `mt:2257-2334`; `suspend_track` `mt:2175-2187`; notify `tc:2690-2716`.

**Tại sao + alternative.** Hai điều kiện confirm (đếm + dịch chuyển) bắt hai loại nhiễu khác nhau: blob ngắn sống (thiếu count) và blob tĩnh lặp lại (thiếu displacement) — ví dụ cây lay đủ count nhưng không đi đâu [suy luận từ 2 ngưỡng song song]. Alternatives: confirm theo 1 obs (nhanh, rác nhiều); theo thời gian tuyệt đối (bỏ qua chất lượng quan sát).

**Các bước.**
1. Detection mồ côi → `_create_or_reid` → `TrackedVehicle` TENTATIVE **ID mới** `mt:2009-2069` (reacquire track LOST xảy ra trước đó, trong `_assign` — xem T1-4).
2. Mỗi lần khớp (`_apply_detection`): `total_visible_count++`; `_is_confirmable`: count ≥ `min_visible_count` **và** ‖(cx,cy) − `first_observation_point`‖ ≥ `min_confirm_displacement` (multiscale: origin = `first_observation_point`; legacy: `history[0]`) → CONFIRMED `mt:2071-2094`, `mt:2170`.
3. Confirmed unmatched → LOST + coasting (T1-4).
4. LOST quá TTL (90f / 4.5s) → expire → `_exited_tracks`, event cho downstream `mt:2257-2334`.
5. `suspend_track(id,"parked")` `mt:2175-2187`: binder gọi → **pop khỏi `_tracks`** vào `_suspended_tracks`, `association_state="suspended_parked"` — track rời hẳn vòng predict/assign/TTL, giữ danh tính cho dormant recovery (ranh giới B).

**Tham số thật.** `min_visible_count=3` `tc:1805`; `min_confirm_displacement` class 12.0 → runtime **6.0** `tc:1812`; priority `2/3.0` `mt:34-96` + `_is_confirmable` `mt:2073-2082`; TTL `90f`/`4.5s` `tc:1806`+`mt:149-154`; reacquire gates (trong `_assign`) `0.30 / 0.35-2.8 / 1.5s` `mt:1732-1755`.

**Storyboard (deterministic — minh họa, cùng cảnh).** Blob nhiễu N (lá lay) và xe A cùng xuất hiện f0.
- k1 f0-f2: N đủ 3 obs nhưng displacement 2px<6 → **TENTATIVE mãi** → không CONFIRMED; A: 3 obs + 40px → CONFIRMED [prod ngưỡng].
- k2 f10: A bị che → LOST, ghost coast; N vẫn tentative chết dần TTL.
- k3 f15: A quay lại trong cửa sổ reacquire → `_assign` khớp A với **đúng track cũ** (appearance 0.22≤0.30, area 1.1×) → track tiếp tục — không cần birth.
- k4 OFF-window (giả lập age>1.5s): A quay lại → `association_rejected_stale_track` → detection mồ côi → `_create_or_reid` mint **ID mới** — cùng cảnh, khác hậu quả [cơ chế prod, mốc thời gian minh họa].
- k5 A khuất >4.5s → expire → `notify_track_expired` (N8, ranh giới B). Xe B' đỗ yên lâu → binder gọi `suspend_track` → rời `_tracks`, chờ dormant recovery.

**QA phản biện.** (1) Xe thật vào ROI rồi đứng ngay <6px: không đủ displacement → kẹt TENTATIVE — đánh đổi chống nhiễu tĩnh [suy luận]. (2) `min_visible_count=3` ở **FPS cao**: 3 obs chỉ ~0.1s thời gian thật — bằng chứng mỏng về mặt đồng hồ (đếm theo frame, không theo giây); displacement bù phần nào — xe 6px/f vẫn cần đi ≥6px [cơ chế verified: count đếm frame `mt:2079-2082`]. (3) Suspended + expire: `suspend_track` pop khỏi `_tracks` → vòng TTL không chạm tới — suspended track "đông lạnh" giữ danh tính, không expire theo TTL thường [verified `mt:2175-2187`]; việc giải phóng dormant thuộc binder (B).

**Mức chắc chắn:** Confirmed from code (3 trạng thái, `_is_confirmable` đầy đủ, suspend-pop, TTL). Ranh giới dormant-recovery phía svb = phần B.

---

## Thẻ T2-5 — N4: Occlusion guard (nhóm xe bị dính blob)

**Bài toán đời thật.** Hai xe đi sát/vượt nhau: contour nối thành **1 blob to** — detector chỉ thấy "một vật". Nếu để LAPJV tự do: cả 2 track cướp cùng blob, hoặc 1 track ăn cả blob rồi appearance bị nhiễm độc (2 xe trộn histogram). Khi tách ra lại không biết ai là ai.

**Làm gì.** `OcclusionGuard` (timeout=3.0s, `og:26-27`, được tạo với `merged_reacquire_max_seconds` `mt:229`) quản **group**: (a) `prepare` mỗi frame — track nào ≥3 clean-obs + còn "tươi" thì ghép cặp ứng viên khi tâm gần + bbox sạch cuối overlap ≤0.20 + khe ≤0.4×đường chéo → watch-group + ghi `independent_pairs` [og:55-100]; (b) trong `_detect` — blob chứa **tất cả** tâm group (đệm 0.15×ref) và diện tích ≥1.6×median-ref → activate: members bị đóng băng, `observation_kind='occluded_prediction'`, detection đánh `ambiguous_merged` [og:102-148]; (c) `partition` — thử watershed tách blob theo 2 seed tại tâm dự đoán → vùng con hợp lệ (ratio 0.35–1.8×ref) thành provisional child [og:150-189]; (d) trong `_assign` — `gate_assignments` chỉ nhận nghiệm thắng rõ `swapped−direct ≥ 2·margin` và `direct<1.2`, đủ **3 frame liên tiếp** hợp lệ mới "recover" [og:191-232]. Thêm `_unresolved_merged_birth`: cấm sinh ID mới cho blob che khuất cặp đã-chứng-minh-độc-lập [mt:364-389].

**Vai trò.** Chuẩn bị trước detect (`mt:2229-2232`), annotate trong detect, cổng sau LAPJV (`mt:1994-1999`) — bao quanh N5/N6. Trước: predict N3 cho tâm. Sau: detection merged bị cấm gán thường; members coasting an toàn; khi tách, ID về đúng. Mất nó (`--no-occlusion-guard`): xe dính → ăn nhầm → đổi ID + nhiễm appearance — đúng loại lỗi khó gỡ nhất.

**Nằm ở đâu.** `og.py` toàn bộ (232 dòng); gọi `mt:2229-2232` (prepare), `mt:759-827` (annotate/partition trong `_detect`), `mt:1994-1999` (gate); birth-veto `mt:364-389`; flag `--no-occlusion-guard`/`--no-watershed` `tc:1808-1809`; mặc định bật `mt:34-96` + runtime.

**Tại sao + alternative.** Triết lý nguồn (docstring `og:1-6`): "không so màu nào chứng minh được blob gộp thuộc ai — hình học mở nhóm trước, appearance chỉ để kiểm vùng tách; pixel dự đoán/chia không được làm tươi thời điểm thấy thật". Alternatives: cứ để LAPJV gán (nhiễm độc identity — chính thứ guard ngăn); luôn watershed mọi blob to (giả mạo vùng — code yêu cầu seed gần tâm dự đoán + size sanity).

**Các bước.**
1. `prepare`: cập nhật group hết hạn/mất member; cặp eligible gần → watch `og:55-100`.
2. Blob phủ tâm cả 2 + area ≥1.6× → activate, members frozen `og:102-138`.
3. Watershed 2-seed tại tâm dự đoán; hợp lệ → provisional detections `og:150-189`.
4. Detection merged không gán (`cost=10`); members coast `mt:1691+`.
5. `gate_assignments`: nghiệm đủ chắc (`swapped−direct≥0.16`, `<1.2`) đếm `recovering`; ≥3 frame → tách, `watershed_validated`; không → defer + chặn detection dạng-member (`costs<1.0`) `og:191-232`.
6. Group hết hạn (`last_clean+3.0s`) → `occlusion_group_expired`; members tự do lại `og:59-65`.

**Tham số thật.** `timeout=3.0` `og:26-27`←`merged_reacquire_max_seconds` `mt:229`; eligible `≥3 clean obs` `og:67-72`; overlap `≤0.20` `og:85`; gap `≤0.4×diag` `og:88`; blob-cover: pad `0.15×ref`, area `≥1.6×median` `og:109-112`; watershed: `≥40` pts, seed `≤0.25×diag`, sep `≥0.2×min-ref`, vùng `≥20px`, ratio `0.35–1.8` `og:158-186`; gate `2·margin/direct<1.2/3 frame` `og:206-212`; birth-veto `≥1.6×` + independent-pair `mt:364-389`.

**Storyboard (deterministic — minh họa, cùng cảnh).** T1,T2 confirmed đi song song, sát dần.
- k1 f1: tâm cách 60px <0.4×diag → watch-group mở (2 xe "độc lập" được ghi).
- k2 f2: contour nối — blob 3400px² ≥1.6×median 2000 → activate: T1,T2 `occluded_prediction`, blob `merged` → cấm gán; 2 ghost coast theo vận tốc riêng.
- k3 Watershed: seed tại 2 tâm dự đoán → tách 2 vùng ratio 0.9/0.8 ∈[0.35,1.8] → 2 provisional detections.
- k4 OFF (giả lập `--no-occlusion-guard`): blob merged gán cho T1 theo cost → T1 nuốt appearance T2; f3 tách ra — T1 bị nhiễm độc, T2 mồ côi → hoán ID [cùng cảnh].
- k5 ON: nghiệm T1→vùng-trái + T2→vùng-phải qua gate 3 frame → `occlusion_group_recovered` — ID nguyên.

**QA phản biện.** (1) Xe đỗ chạm nhau lâu >3s: group expire → mất bảo vệ đúng lúc blob còn dính — timeout cố tình để group không sống mãi [suy luận từ `og:127-130`]. (2) Watershed provisional: vùng tách "giả" nếu tâm dự đoán lệch — code chặn bằng seed-distance + size-ratio; vẫn còn rủi ro → vì vậy provisional phải qua 3-frame recovery mới thành bằng chứng thật [thiết kế verified]. (3) eligible cần ≥3 clean obs: track mới sinh không vào group → blob gộp của track non vẫn đi đường thường — hạn chế có chủ đích [suy luận].

**Mức chắc chắn:** Confirmed from code — `og.py` đọc hết 232 dòng; tất cả ngưỡng + callsite.

---

## Phụ lục A — Ranh giới giao B/C (để đối chiếu)

| Dữ liệu rời tay A | Nơi | Người nhận |
|---|---|---|
| `newly_lost_tracks`, `expired` | `tc:2690-2716` → `manager.notify_track_lost/expired`, `binders.notify_*` | B (N8) |
| `observable_tracks` (CONFIRMED…) + `occluded_pairs` | `tc:2718-2727` `sync_occluded_identities` | B (N9) |
| `independent_pairs` của occlusion guard | `og:29` → evidence danh tính liên-cam | B |
| `priority_regions` ← binder departure tokens | `tc:689-719` → `process_frame` `tc:2683` | C/B (feedback N1) |
| Parking vision worker | `tc:2632-2640` song song | C (N2) |

Ghi chú cho C: thứ tự trong `process_frame` (predict→prepare→detect→assign→apply→coast→birth) và bảng N0-N15 §1 khớp nhau — A kiểm chứng callsite `mt:2228-2335` + `tc:2680-2716`.

## Phụ lục B — Nguồn chưa đọc hết (pending)

- `vehicle_tracker.py` các field phụ (đã đọc enum + dataclass head; hàm phụ trợ khác chưa liệt kê).
- `cross_camera_manager.py`, `slot_vehicle_binder.py` ngoài `recovery_priority_regions`/`_expanded_polygon`/`_token_radius` — phần B, chỉ chạm ranh giới.
- `_same_motion_echo` body chi tiết (đã có signature + vai trò; ngưỡng cụ thể trong hàm chưa trích hết).
- Đã trace đủ (không còn pending): `_cast_shadow_metrics`/`_is_cast_shadow`/marker-admission; `_is_confirmable`; `suspend_track`/`_suspended_tracks`; `_create_or_reid` (mint ID mới); reacquire gates trong `_assign`; `_mark_competing_assignments`; margin/`split_recovering`/`clear_evidence`; `_expanded_polygon`/`_token_radius`.
