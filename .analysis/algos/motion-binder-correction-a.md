# Replacement-ready corrections — dossier B (19 sections)

**Phạm vi**: thay thế nguyên văn các section sau trong `builder-b.md` §2 khi merge:
`A1, A2, A5, A7, A9, A10, A12, B5, B7, B8, B10, B11, D1, D3, D4, D7, D8, D9, D10`.
Các section không liệt kê (A3, A4, A6, A8, A11, B1–B4, B6, B9, D2, D5, D6, D11, C1–C5, E*, F*) **không thay đổi**.

**Cơ sở**: peer-review `cv-motion-binder-review-a.md` (vòng revised). Mọi `Expected` đều đã chạy
bằng `verify-motion-binder-a.py` (stdlib, deterministic — **95 assertions, 0 FAIL**);
chi tiết bằng chứng trong `motion-binder-correction-review-a.md`. Format giữ nguyên mandatory
của dossier B (nhóm/tiên quyết/liên quan, code refs `path:dòng`, typed IO, pseudocode đánh số,
structures, complexity code+sim, edge/failure, `[sim-omits]`, 2 sample JSON độc lập, expected,
storyboard, libs). Số không `~` = literal đã đối chiếu source; `~` = demo parameter.

---

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
- **Sample B (biên — sai màu / quá hạn)**:
  ```json
  [{"det":{"point":[6,6],"box":[4,3,4,3],"app":0.25,"hist":[1,0]},"lost_s":0.8},{"det":{"point":[6,6],"box":[4,3,4,3],"app":0.2,"hist":[1,0]},"lost_s":2.0}]
  ```
  **Expected** (verify): case1 `app 0.25 > 0.22` → **reject appearance** — đúng chỗ sai màu; case2 `lost 2.0 > 1.5` → **skip reacquire_window** — quá hạn thì không vào gate nào nữa.
- **Storyboard**: track xám "chết tạm" ở neo cũ, vòng `max(3, 0.3·diag)`; det mới vào vòng + swatch màu khớp → track hồi sinh xanh; thanh `lost_seconds` chạy tới 1.5s → vòng biến mất (window đóng); bảng realtime: `lost_s | gate | d | app | size | cost`; pseudo-line 1–5. Giải thích VN: "neo cũ + cùng màu + cùng cỡ = bằng chứng tối thiểu — và cost vẫn là công thức 4-term thường, chỉ điểm so sánh đổi".
- **Thư viện ngoài**: `numpy` [code].

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
- **Sample A (thường — đỗ trọn)**: `{"bbox":[2,2,4,4],"slot_poly":[[0,0],[8,0],[8,8],[0,8]],"slot_center":[4,4],"vo_min":0.35,"vo_strong":0.60}` → bbox cells {2..6}²=25, `inter=25`, `vo=1.0`, `so=25/81≈0.309`, `inside=true`, `diag=√128≈11.31`, `prox=1−0/11.31=1.0` → **Expected** (verify): `qualify` (inside && vo≥0.35); **`score = min(1, 0.7+0.0617+0.1) = 0.862`** → output `{vo:1.0, so:0.309, center_proximity:1.0, score:0.862}` (không có `dist`/`center_inside` trong dict).
- **Sample B (biên — ngoài hầu hết)**: `{"bbox":[7,7,4,4]}` → bbox cells {7..11}², `inter={7,8}²=4`, `vo=4/25=0.16 < 0.35` và `0.16 < 0.60`, `center (9,9)` ngoài → **Expected** (verify): **`None`** — xe lấn mép không được tính đỗ.
- **Storyboard**: ô đỗ xanh dương + bbox xe đỏ; vùng giao tô vàng; bốn thanh `vo/so/prox/score` cập nhật khi kéo bbox; đèn `qualifies` sáng qua một trong 2 nhánh; bảng realtime: `inter | vo | so | inside | prox | score | verdict`; pseudo-line 1–6. Giải thích VN: "vo đo xe nằm trong ô, so đo xe chiếm ô, prox đo tâm gần tâm ô — score trộn 3 thứ tỉ lệ 7:2:1; chạm mép nhẹ ra ngoài vẫn được nếu chồng mạnh".
- **Thư viện ngoài**: `cv2.pointPolygonTest`, `intersectConvexConvex` [code] — demo raster∩.

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
  {"frag":{"first_center":[10,5],"point":[6,5],"signed":-2.0,"overlap":0.5,"app":0.2,"size_ratio":0.9,"obs":3,"moved_px":4,"min_radial":5,"radial_now":1,"originated_in_slot":false}}
  ```
  **Expected** (verify): `first_vector=(5,0)`, `radial_first=5 ≥ 3.96` → `outward_unit=(1,0)`; `outward_px=(−4)·1=−4 < 1.5`; `radial_gain=−4 < 0.75`; escape fail (`originated_in_slot=false`); world none → **`reject:insufficient_outward_evidence`** — đúng chỗ đúng màu nhưng quay đầu vào ô.
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

### Ghi chú merge (không thuộc section)

- Đổi mục 5 (unverified/demo params) nếu cần: các số dùng trong corrections này đều literal hoặc đã verify bằng script — `0.30` lost-appearance, `0.22` stale-app, `[0.35,2.80]` size-band, `0.999` cost_limit, `0.15` ambiguity margin, `0.05/0.45/1.0s` expand, `[0.40,2.50]`/`[0.15,6.0]` size range, `0.55/0.70` appearance limits, `3.0/1.5/0.75` outward px, `0.25` relaxed slot overlap, `2.5s` guard, `1.25s` grace, `5.0/15.0` retention/extension, `0.15` arrival margin, `0.35s` lost delay, `0.35/0.60` overlap thresholds, `0.08` split margin, `3` recovery frames, `1.75` elongation span, `[0.45,0.25,0.20,0.10]` cost weights, `180` max_distance, `1.25` scale, `0.90` cost limit, `0.22` whole-scene frac, `[0.25,5.0]` aspect, `120` shadow min px, `0.18` att tol, `1.2/1.5` explained multipliers.
