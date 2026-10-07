# occupancy-correction-c — Replacement spec C1–C5 (cross-review builder-c)

Bản thay thế cho nhóm C1–C5 trong `builder-b.md`, viết theo **source thực** `backend/main_detect/src/techgar/parking_detector.py` (đã đối chiếu trực tiếp, line refs kèm). Giữ nguyên 5 ID canonical theo `algo-web/SPEC.md`. Mục đích: builder-b merge thay vì vá từng lỗi — không sửa dossier B, chưa viết web.

**Quy ước**: mọi mask raster demo dùng ô lưới nguyên `(i,j)` ∈ hình chữ nhật `[min,max]` bao biên (gần `fillPoly`). Tham số không `~` là literal từ `__init__` (`:97-137`). `[sim-omits]` = phần code bỏ qua trong demo — bắt buộc liệt kê, không claim port.

**Bảng tham số thật** (`parking_detector.py:97-137`):
| Param | Giá trị | Param | Giá trị |
|---|---|---|---|
| `ratio_thr` | 0.20 | `exit_ratio_thr` | 0.08 |
| `edge_thr` | 0.25 | `use_edge_recheck` | True |
| `border_ignore_ratio` | 0.12 | `line_min_span_ratio` | 0.45 |
| `line_max_thickness_ratio` | 0.18 | `selective_line_filter` | True |
| `core_scale` | 0.55 | `core_ratio_threshold` | 0.18 |
| `core_component_threshold` | 0.08 | `core_rescue_raw_ratio` | 0.30 |
| `occupied_seconds` | 0.5 | `empty_seconds` | 1.0 |
| `smoothing_frames` | 5 | `stable_evidence` | False (mặc định; `accept_evidence` chỉ áp khi True) |
| `gamma×clahe` | 5×5 = 25 biến thể (`:454-456`) | `required_votes` | `25//2 = 12` (`:533`) |

---

## C1. `slot-roi-precompute` — Tiền tính mask ROI của ô đỗ

- **Nhóm**: Occupancy · **Tiên quyết**: polygon slot từ config · **Liên quan**: C2, C3, C4
- **Code**: `backend/main_detect/src/techgar/parking_detector.py:228-320` `_compute_rois`; `:37-61` `_PrecomputedROI`, `_ROIEvidence`.
- **Vai trò**: raster hoá polygon thành các mask con để mọi phép đo sau chạy trên mask sẵn: `mask` (toàn ROI), `analysis_mask` (erode theo tỉ lệ), `analysis_boundary` (vành mỏng *bên trong* analysis), `core_mask` (polygon co về tâm ∩ analysis).
- **Input**: `polygon[N×2]`, `img_shape`; params `border_ignore_ratio`, `core_scale`. **Output**: `_PrecomputedROI{mask,area,analysis_mask,analysis_boundary,analysis_area,analysis_size,core_mask,core_area,bbox,center}`.
- **Pseudocode** (đúng source):
  1. `mask = fillPoly(polygon)`; `area = count(mask)` (`:259-260`); `bbox = poly-bounds ±2px` (`:249-252`).
  2. `inset = round(min(roi_w,roi_h) · border_ignore_ratio)` — **`roi_w/h` là kích thước padded-bbox** (poly bounds ±2px, clip theo ảnh, `:249-254`), không phải width polygon; `inset>0` → `analysis = erode(mask, ellipse 2·inset+1)`, else `analysis = mask` (`:263-272`).
  3. **`analysis < 5 px → analysis = mask` (fallback, `:273-274`)** — slot nhỏ không chết, chỉ mất lớp lõi.
  4. `inner = erode(analysis, 3×3)`; **`analysis_boundary = analysis − inner`** (`:276-279`) — vành mỏng *trong* analysis, **không phải** `roi − analysis`.
  5. `core_poly = centroid + (poly − centroid)·core_scale`; `core = fillPoly(core_poly) ∩ analysis`; `core < 5 px → core = analysis` (`:288-296`).
  6. `analysis_size = boundingRect(analysis)`; lưu `area/analysis_area/core_area/analysis_size` (`:280-311`).
- **Cấu trúc**: 4 mask bool + diện tích/size cache; `_smoother` khởi tạo ở cuối (`:316`).
- **Độ phức tạp (code)**: O(H·W) mỗi slot một lần; O(H·W·S) bộ nhớ. **[sim]**: O(R) raster ô lưới.
- **Edge cases / failure modes**:
  - `[code]` slot nhỏ → **fallback** (bước 3/5) chứ không "invalid"; `detect` chỉ skip khi `analysis_area == 0` (`:484`) — gần như không xảy ra sau fallback.
  - `[code]` `analysis_boundary` là vành *trong* analysis — C3 dùng mask này để phát hiện component "chạm vành".
  - `[edu]` polygon chéo/mảnh → `analysis_boundary` chiếm tỉ trọng lớn → nhiều component xe chạm vành → C3 nhạy.
  - `[code]` config sai polygon → mọi mask lệch → C2–C4 sai theo.
- **Thực tế vs mô phỏng**: giữ 4 mask + 2 fallback. `[sim-omits]`: `fillPoly` anti-alias, scale theo `img_shape` vs `imageWidth/Height` gốc (`:230-243`), ellipse structuring element — demo raster lưới nguyên + kernel vuông 3×3 đơn vị.
- **Sample A (thường)**:
  ```json
  {"poly":[[0,0],[7,0],[7,7],[0,7]],"border_ignore_ratio":0.12,"core_scale":0.55,"grid":8}
  ```
  `roi = {0..7}² = 64` ô; padded bbox `{0..7}` → `min_dim = 8` → `inset = round(8·0.12) = 1` → `analysis = {1..6}² = 36`; `inner = {2..5}² = 16` → **`analysis_boundary = 36−16 = 20` ô (vành 1 ô trong analysis)**; `core_poly`: centroid (3.5,3.5), đỉnh co 0.55 (nửa cạnh 3.5→1.925) → `[1.575,5.425]²` → ô `{2..5}² = 16` ∩ analysis = **16** (≥5, không fallback — đường normal).
  **Expected** (verify bằng raster script): `roi=64, analysis=36, analysis_boundary=20, core=16` — **không fallback nào kích hoạt** (normal path).
- **Sample B (biên — CẢ HAI fallback, không invalid)**:
  ```json
  {"poly":[[1,1],[4,1],[4,4],[1,4]],"border_ignore_ratio":0.2,"core_scale":0.55,"grid":8}
  ```
  `roi = {1..4}² = 16`; padded bbox `{0..6}×{0..6}` → **`min_dim = 6`** (không phải 4 — đếm cả pad) → `inset = round(6·0.2) = 1` → erode → `{2..3}² = 4 < 5` → **fallback 1: `analysis = local_mask = 16`** (`:273-274`); `inner = {2..3}² = 4` → `analysis_boundary = 16−4 = 12`; `core_poly`: centroid (2.5,2.5), nửa cạnh 1.5→0.825 → `[1.675,3.325]²` → ô `{2,3}² = 4` ∩ analysis(16) = 4 **< 5** → **fallback 2: `core = analysis = 16`** (`:295-296`).
  **Expected** (verify): `roi=16, analysis=16 (fallback), analysis_boundary=12, core=16 (fallback)` — intermediate `analysis=4, core=4` chỉ là giá trị trước fallback; code **không có nhánh "invalid slot"**, slot nhỏ degrade về ROI đầy đủ chứ không bị loại.
- **Storyboard**: lưới 8×8, 4 lớp chồng: `mask` xám nhạt, `analysis` xanh dương đậm, `analysis_boundary` viền cam 1 ô sát mép analysis (không phải dải rộng ngoài), `core` đỏ tâm. Slider `border_ignore_ratio` → `inset` đổi; preset "slot nhỏ" → thấy fallback: lớp analysis bung ra bằng mask. Bảng realtime: `roi | analysis | boundary | core | fallback?`. Pseudo-line 1–6.
- **Thư viện ngoài**: `cv2.fillPoly`, `cv2.erode`, `MORPH_ELLIPSE`, `boundingRect` — demo raster lưới giản lược tương đương, không port cv2.

---

## C2. `ensemble-threshold-voting` — Bỏ phiếu EMPTY đa-biến-thể + rescue/edge

- **Nhóm**: Occupancy · **Tiên quyết**: C1, C3, C4 · **Liên quan**: C5
- **Code**: `backend/main_detect/src/techgar/parking_detector.py:439-600` `detect` — `empty_votes` `:461,527-528`, `exit_votes` `:529-530`, `required_votes` `:533`, `is_free` `:534-549`, edge recheck `:551-566`, `occupied = not is_free` `:574-581`.
- **Vai trò**: 25 biến thể `gamma×CLAHE` mỗi cái đo `filtered_ratio`; ô chỉ **free khi đa số biến thể đồng ý "trống"** — ngữ nghĩa mặc định là occupied (bảo thủ); core-rescue và edge-recheck lật free→occupied.
- **Input**: `ratios[V]` (filtered_ratio từng biến thể), `evidence` (C3/C4), `edge_ratio`; params `ratio_thr`, `edge_thr`, `V`. **Output**: `is_free:bool → occupied`.
- **Pseudocode** (đúng source):
  1. Với mỗi biến thể k: `ratio_k = fg(filtered_k)/analysis_area` (`:526`).
  2. `ratio_k < ratio_thr` → **`empty_votes++`** (`:527-528`); `ratio_k < min(ratio_thr, exit_ratio_thr)` → `exit_votes++` (`:529-530`, dùng cho C5-occupied).
  3. `required = V // 2` (`:533`); **`is_free = empty_votes ≥ required`** (`:539`).
  4. `is_free AND core_rescue(evidence)` → `is_free = False` (`:542-547`).
  5. `is_free AND edge_ratio ≥ edge_thr` → `is_free = False` (edge recheck, `:551-566`).
  6. **`occupied = ¬is_free`** (`:581`).
- **Cấu trúc**: `empty_votes[]`, `exit_votes[]`, `is_free_list[]`, evidence per-slot.
- **Độ phức tạp (code)**: **Time O(V·R + S)** — V=25 biến thể × R px ROI mỗi biến thể (threshold+mask+count), S slot cho vote/rescue/edge; **Memory O(S)** cho `empty_votes`/`exit_votes`/`is_free_list`/`evidence` + O(S·R) `vote_masks` khi `selective_line_filter=False` (True → O(R) buffer từng biến thể, tái dùng). **[sim]**: O(V) time + O(1) mem.
- **Edge cases / failure modes**:
  - `[code]` **inverted-by-design**: slot mơ hồ → occupied (empty phải thắng tuyệt đối mới free); `empty=required` vừa ngưỡng → free (`≥` chứ không `>`).
  - `[code]` vote chỉ trên `filtered_ratio` (analysis), không dùng `raw_ratio` — rescue nhìn `raw`/`core`/`component` (C4), edge nhìn Canny toàn ROI.
  - `[code]` `selective_line_filter=True` (mặc định) → mỗi biến thể tự lọc (`:522-523`); False → dùng chung `vote_masks` từ base (`:525,493-496`).
  - `[edu]` ánh sáng đổi → ratio dàn trải → empty_votes chao → occupied "ảo" (bảo thủ); C5 hysteresis xử lý lắc.
- **Failure modes**: `ratio_thr` quá cao → xe tối màu bị free; quá thấp → vệt sáng thành occupied; `edge_thr` thấp → texture gạch vỡ kích edge-recheck.
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
  - `free_clear`: empty = {0.05,0.05,0.04,0.06,0.19,0.10,0.02} = **7 ≥ 4** → free; `central_blob` fail (0.05<0.18), `textured` fail (raw 0.12<0.30); edge no → **`free`**.
  - `free_but_rescue`: cùng votes → free ban đầu; `core_rescue` (branch1 `0.20≥0.18 ∧ 0.10≥0.08`) → **`occupied`**.
  - `free_but_edge`: cùng votes → free ban đầu; `edge 0.30 ≥ 0.25` → **`occupied`**.
- **Sample B (biên — ngưỡng vừa đủ + exit_votes)**: `{"ratios":[0.19,0.19,0.19,0.19,0.25,0.25,0.25,0.25,0.07],"ratio_thr":0.20,"exit_thr":0.08,"required":4,"V":9}` → empty = 5 (4×0.19 + 0.07) ≥4 → `is_free=True` (không rescue/edge); `exit_votes` = ratios `< min(0.20,0.08)=0.08` → **1** (chỉ 0.07). **Expected**: `free`, `empty_votes=5`, `exit_votes=1`.
- **Storyboard**: lưới 3×3 thẻ biến thể; mỗi thẻ thanh ratio so vạch `ratio_thr` — ratio **dưới** vạch = phiếu EMPTY (xám), trên = không phiếu. Counter lớn `empty_votes ≥ required?` → cổng `is_free` xanh/đỏ; hai "cửa cứu" sau cổng free: core-rescue (tím), edge (vàng) — mở cửa nào cũng lật sang occupied. Bảng realtime: `ratio_k | empty? | count | is_free | rescue | edge | occupied`. Pseudo-line 1–6. Giải thích VN: "mặc định là có xe — phải đa số đồng ý trống mới dám báo ô trống".
- **Thư viện ngoài**: `cv2.cvtColor/LUT/createCLAHE/adaptiveThreshold/medianBlur/dilate/Canny` — demo nhận `ratios[]`/`edge_ratio` sẵn; giản lược tương đương, không port.

---

## C3. `border-line-filter` — Lọc component dạng vạch *trong* analysis

- **Nhóm**: Occupancy · **Tiên quyết**: C1 · **Liên quan**: C2, C4
- **Code**: `backend/main_detect/src/techgar/parking_detector.py:321-416` `_filter_roi_threshold` — `raw_ratio` `:328-329`, `filtered=mask∩analysis_mask` `:331-333`, components `:335`, `touches_boundary` `:338,353`, điều kiện line `:343-367`, selective removal `:368-387`, `filtered_ratio` `:389-415`.
- **Vai trò**: vạch kẻ ô đỗ chạy *vào* vùng analysis tạo component mảnh-dài chạm `analysis_boundary` → xóa để `filtered_ratio` không bị phình bởi tín hiệu "vĩnh viễn".
- **Input**: `roi_threshold` (mask nhị phân), `roi{_PrecomputedROI}`; params `line_min_span_ratio`, `line_max_thickness_ratio`, `core_component_threshold`, `selective_line_filter`. **Output**: `_ROIEvidence{raw_ratio, filtered_ratio, core_ratio, core_component_ratio, core_component_count, filtered_mask, removed_ratio}`.
- **Pseudocode** (đúng source):
  1. `raw_ratio = count(mask ∩ roi.mask) / roi.area` (`:328-329`) — mẫu số **roi.area**, không phải analysis.
  2. `filtered = mask ∩ analysis_mask` (`:331-333`) — vành `roi−analysis` **không vào filtered từ đầu** (bị mask chặn, không phải bị lọc).
  3. `components = connectedComponents(filtered)` (`:335`); `touches_boundary = component ∩ analysis_boundary ≠ ∅` (`:338,353`).
  4. `span = max(w/analysis_w, h/analysis_h)`; `thickness = (area/max(w,h))/min(analysis_size)` (`:336-352`).
  5. `vehicle_like_core = (component_core_px/core_area ≥ 0.08) ∧ (thickness ≥ 0.18·0.9)` (`:354-361`).
  6. `is_border_line = touches_boundary ∧ span ≥ 0.45 ∧ thickness ≤ 0.18 ∧ ¬vehicle_like_core` (`:362-367`).
  7. `selective_line_filter` → fitLine + chỉ xóa phần mảnh `residual ≤ half_width` (giữ vùng dày xe, `:370-387`); else xóa cả component (`:371`).
  8. `filtered_ratio = count(filtered)/analysis_area`; `core_ratio = count(filtered∩core)/core_area`; `removed_ratio = removed/analysis_area` (`:389-415`).
- **Cấu trúc**: label map + stats per component; `_ROIEvidence` dict.
- **Độ phức tạp (code)**: **Time O(R + C + P_sel)** — R px ROI quét mask+countNonZero, C component (≤R) kiểm span/thickness/core, P_sel px cho `fitLine`+`distanceTransform` khi selective (chỉ component line, ≤R); **Memory O(R)** label map + O(C) stats. **[sim]**: O(R) raster + O(C) — bỏ P_sel (xóa nguyên component).
- **Edge cases / failure modes**:
  - `[code]` component xe thật dài đến vành analysis → `vehicle_like_core` cứu (core đủ + dày) — không bị nuốt.
  - `[code]` vạch nằm *trọn trong* `roi−analysis` → không vào `filtered` từ đầu — không phải "được lọc", mà **không được đếm**.
  - `[edu]` `selective_line_filter` tách phần mảnh khỏi vùng dày — xe dính vạch chỉ mất đuôi mảnh.
- **Failure modes**: `line_min_span` thấp/`line_max_thickness` cao → ăn mép xe; `border_ignore_ratio` lớn (C1) → vành trong dày → component xe cũng "touches_boundary".
- **Thực tế vs mô phỏng**: giữ raw(denominator `roi.area`) vs filtered(`analysis_area`) + tiêu chí span/thickness/core. `[sim-omits]`: selective fitLine/`distanceTransform` half_width — demo xóa cả component (giống nhánh `selective=False`); connectivity 8 vs 4 lưới — khai báo.
- **Sample A (thường — vạch trong analysis bị xóa)**: analysis `{1..6}²=36`, `analysis_boundary` = vành {i hoặc j ∈{1,6}} (20 ô), `core={2..5}²=16`, `roi={0..7}²=64`, `analysis_size=6×6`:
  ```json
  {"analysis_area":36,"roi_area":64,"core_area":16,"analysis_size":[6,6],
   "fg_cells":{"line":[[1,1],[2,1],[3,1],[4,1],[5,1],[6,1]],"blob":[[3,3],[4,3],[3,4],[4,4]]},
   "thresholds":{"span_min":0.45,"thickness_max":0.18,"comp_core_min":0.08}}
  ```
  Line 6 ô nằm trên vành analysis (j=1) → `touches_boundary` ✓; `span = 6/6 = 1.0 ≥0.45` ✓; `thickness = (6/6)/6 = 0.167 ≤0.18` ✓; `comp_core = 0/16 = 0 <0.08` → `¬vehicle_core` → **is_border_line → xóa**. Blob `{3,4}²` nội địa → giữ.
  **Expected** (verify): `filtered trước = 10 → ratio 10/36 ≈ 0.278`; sau xóa line → `filtered = 4 → filtered_ratio = 4/36 ≈ 0.111`; `removed_ratio = 6/36 ≈ 0.167`; **`raw_ratio = 10/64 ≈ 0.156`** (mẫu số roi.area). Vote theo `ratio_thr=0.20`: trước lọc 0.278 → không empty-vote; sau lọc 0.111 <0.20 → **empty-vote** — lọc đúng lật phiếu.
- **Sample B (biên — component ngắn không bị xóa)**: line chỉ 2 ô `{(1,1),(2,1)}` → `span = 2/6 = 0.333 < 0.45` → **không phải line → giữ**; cùng blob 4 ô → `filtered = 6 → ratio 0.167 <0.20` → vẫn empty-vote nhưng không nhờ lọc. Đối chứng: xe blob `{3,4}² + đuôi {(5,3),(6,3)}` (6 ô, chạm vành ở (6,3)): `span=4/6=0.667≥0.45`, `thickness=(6/4)/6=0.25>0.18` → không mảnh → giữ — và `comp_core = 5/16 = 0.3125 ≥0.08` → `vehicle_like_core` → bảo vệ kép.
  **Expected**: line ngắn giữ; blob-có-đuôi giữ (vehicle_like_core).
- **Storyboard**: lưới slot 8×8 — `mask` viền xám, `analysis` xanh dương, `analysis_boundary` vành cam 1 ô trong analysis, `core` đỏ tâm; component fg vàng: vạch mảnh trên vành sáng đỏ → bị xóa (nhấp biến mất) với badge điều kiện `span/thickness`; blob lõi giữ xanh lá; hai thanh ratio `raw(/roi)` và `filtered(/analysis)` song song — khác mẫu số nhấn mạnh trực quan. Bảng realtime: `component | area | span | thickness | touches | core | verdict`. Pseudo-line 1–8. Giải thích VN: "vạch kẻ chỉ bị xóa khi nó *chạy vào* vùng đo và đúng dáng vạch — xe dính vành vẫn được bảo vệ bởi lõi".
- **Thư viện ngoài**: `cv2.connectedComponentsWithStats`, `fitLine`, `distanceTransform` — demo raster + xóa-nguyên-component; giản lược tương đương, không port.

---

## C4. `core-rescue-vote` — Cứu "free" khi tín hiệu tụ lõi hoặc dày đặc

- **Nhóm**: Occupancy · **Tiên quyết**: C1, C2, C3 · **Liên quan**: C5
- **Code**: `backend/main_detect/src/techgar/parking_detector.py:418-428` `_has_core_rescue`; gọi tại `:542-547`.
- **Vai trò**: khi `is_free` theo vote, evidence base có thể chứng minh xe thật → lật về occupied. Hai nhánh: blob lõi mạnh (`central_blob`) hoặc tín hiệu toàn-ROI dày nhiều cụm (`textured_dense_blob`).
- **Input**: `evidence{raw_ratio, core_ratio, core_component_ratio, core_component_count}` (từ `_ROIEvidence` của biến thể **base**); params `core_ratio_threshold=0.18`, `core_component_threshold=0.08`, `core_rescue_raw_ratio=0.30`. **Output**: `rescue:bool` (OR vào `is_free` → occupied).
- **Pseudocode** (đúng source):
  1. `central_blob = core_ratio ≥ 0.18 ∧ core_component_ratio ≥ 0.08` (`:419-422`).
  2. `textured_dense_blob = raw_ratio ≥ 0.30 ∧ core_ratio ≥ 0.02 ∧ core_component_count ≥ 2` (`:423-427`) — **3 điều kiện, gồm count ≥ 2**.
  3. `rescue = central_blob ∨ textured_dense_blob` (`:428`); `is_free ∧ rescue → occupied` (`:544-547`).
- **Cấu trúc**: `_ROIEvidence` fields; chỉ evidence của biến thể **base** quyết định rescue (`:488,541-547`).
- **Độ phức tạp**: **Time O(1)** (≤7 phép so sánh trên 4 field evidence); **Memory O(1)** — đúng: không cấp phát, chỉ đọc `_ROIEvidence` có sẵn.
- **Edge cases / failure modes**:
  - `[code]` branch2 cần `count ≥ 2` — **một** cụm dày đơn lẻ không đủ (`textured` = nhiều cụm chất lượng).
  - `[code]` `core_component_count` chỉ đếm component `≥ max(3, core_area·0.005)` px (`:405-406`) — bụi nhỏ không tính.
  - `[code]` rescue chỉ lật khi ô **đang free** — ô đã occupied giữ nguyên (rescue không hạ occupied).
  - `[edu]` `raw_ratio` (toàn ROI) mạnh nhưng lõi rỗng → branch2 fail ở `core ≥0.02` — giải thích tại sao xe cần "tụ tâm".
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
  `central_blob`: core 0.03<0.18 → fail cả hai. `textured`: raw 0.35≥0.30 ∧ core 0.03≥0.02 → phụ thuộc count: `count1` (1<2) → **`rescue=false`** — cụm đơn dày không đủ; `count2` (2≥2) → **`rescue=true`**.
  **Expected**: `count1 → false`, `count2 → true` — chính count-gate làm khác.
- **Storyboard**: slot lưới + hai "cánh cửa" điều kiện (central_blob xanh lá, textured tím) vẽ 3 bậc ngưỡng; đèn count≥2 riêng; cửa mở → đường đứt tới ô `is_free` lật occupied. Bảng realtime: `raw | core | comp_ratio | count | nhánh1 | nhánh2 | rescue`. Pseudo-line 1–3. Giải thích VN: "đa số nói trống nhưng lõi/cụm chất lượng phản bội — chỉ cứu khi đủ bằng chứng lõi, không cứu vì ồn ào toàn vùng".
- **Thư viện ngoài**: không trực tiếp (`numpy` đếm component).

---

## C5. `temporal-smoothing-dwell` — Hai cơ chế: streak đối xứng vs timestamp dwell

- **Nhóm**: Occupancy · **Tiên quyết**: C2 · **Liên quan**: D/F (stale-evidence, timestamp-monotonic)
- **Code**: `backend/main_detect/src/techgar/parking_detector.py:63-80` `TemporalSmoother` (dùng trong `detect` khi `apply_smoothing`, `:575-576`); `:602-645` `accept_evidence` (chỉ khi `stable_evidence=True`); params `smoothing_frames=5`, `occupied_seconds=0.5`, `empty_seconds=1.0` (`:105,115-116`).
- **Vai trò**: hai lớp chống lắc **khác nhau** — (a) streak frame đối xứng trong detect; (b) commit evidence theo clock nguồn: dwell `count ∧ duration` bất đối xứng + gap-reset + timestamp-monotonic guard + desired-logic theo chiều. Không được trộn thành `ceil(dwell/interval)`. **Không có biến seq nào** — guard chỉ dựa vào `_accepted_timestamp` (xác nhận qua F8 review: không tồn tại `job_seq`/`applied_seq`).
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
- **Độ phức tạp**: O(S) mỗi call; (b) O(S·evidence). Memory O(S).
- **Edge cases / failure modes**:
  - `[code]` (b) cần **CẢ count LẪN duration** — poll nhanh (interval < duration) vẫn phải chờ đủ giây; poll chậm đủ giây nhưng count thiếu cũng không lật.
  - `[code]` `gap > 1.5 s` → pending reset — burst chậm không cộng dồn.
  - `[code]` timestamp đi lùi/trùng → batch reject — evidence cũ không đè state.
  - `[code]` (a) `required_frames` **giống nhau cả hai chiều** — không phải hysteresis; hysteresis thật nằm ở (b): 2 count/0.5 s vào vs 3 count/1.0 s ra.
  - `[edu]` khởi động: `occupied=True` placeholder cho tới `initialized` — ô "unknown" bị coi như không trống (binder chờ `ready`).
- **Failure modes**: `stable_evidence=False` (mặc định) → chỉ (a) chạy — hành vi hệ thống thật phụ thuộc config; `smoothing_frames` cao → trễ nhận xe; timestamp giật → gap-reset vô tình xóa pending.
- **Thực tế vs mô phỏng**: giữ **hai cơ chế tách biệt**. `[sim-omits]`: `desired` mapping từ `exit_empty_votes`/`instant_occupied` (demo nhận `desired` sẵn — vote→desired là C2); `result.occupied` placeholder khi chưa ready; `frame_idx` bookkeeping.
- **Sample A (thường — count ∧ duration, clock đúng)** (`desired` nhận sẵn, `occupied_seconds=0.5`, `empty_seconds=1.0`, `count_need=2/3`, `gap_max=1.5`):
  ```json
  {"t":[0,0.4,0.8,1.2,1.6,2.0,2.4],"desired":[1,1,1,0,0,0,0],"init_state":"free","initialized":true}
  ```
  **Expected** (verify — mô phỏng đúng pseudocode b):
  - `t=0` (gap ∞ >1.5 → reset trước): pending=1, count=1, since=0 → chưa.
  - `t=0.4`: count=2 ∧ elapsed 0.4 **< 0.5** → **chưa lật** (duration chưa đủ dù count đủ!).
  - `t=0.8`: count=3 ∧ elapsed 0.8 ≥0.5 → **`free→occupied` tại t=0.8**.
  - `t=1.2`: desired=0 → pending=0, count=1, since=1.2.
  - `t=1.6`: count=2; `t=2.0`: count=3 ∧ elapsed 0.8 **< 1.0** → **chưa lật**.
  - `t=2.4`: count=4 ∧ elapsed 1.2 ≥1.0 → **`occupied→free` tại t=2.4**.
  - Chuỗi lật: **`[(0.8,'occupied'),(2.4,'free')]`** — so sánh trực quan: count-only model sẽ lật sớm hơn (0.4 và 2.0); duration-gate trì hoãn đúng.
- **Sample B (biên — gap reset + stale reject)**:
  ```json
  {"t":[0,2.0,2.4,3.0],"desired":[1,1,1,1],"init_state":"free","gap_max":1.5}
  ```
  **Expected**: `t=0` count=1; `t=2.0` **gap=2.0 >1.5** → pending/count reset → pending=1,count=1,since=2.0; `t=2.4` count=2 ∧ elapsed 0.4 <0.5 → chưa; `t=3.0` count=3 ∧ elapsed 1.0 ≥0.5 → **`occupied` tại t=3.0** — gap đã "ăn" mẫu đầu tiên.
  **Sample C (stale timestamp — monotonic reject)**: `{"t":[0,0.4,0.2],"desired":[1,1,1]}` → `t=0.2 ≤ last(0.4)` → `accept_evidence` trả **False** — toàn batch bỏ qua, count giữ ở `t=0.4` (`count=2`, chưa lật vì elapsed 0.4<0.5) → **`free`**.
- **Storyboard**: hai lane riêng nhãn rõ — lane trên `TemporalSmoother` (chuỗi vote nhị phân, counter đồng nhất 2 chiều); lane dưới `accept_evidence` (timeline timestamp thật): mỗi mẫu là vé có `count` và `elapsed` đo kép — thanh nạp count (số) + thanh giờ (giây) phải đầy **cả hai** mới lật; gap>1.5 s vẽ vết đứt đỏ reset; mẫu stale gạch xám "rejected". Hai vạch `0.5 s/2 count` và `1.0 s/3 count` nhìn thấy hysteresis. Bảng realtime: `t | desired | pending | count | elapsed | need | state`. Pseudo-line theo cơ chế đang chọn (a/b). Giải thích VN: "vào nhanh ra chậm — nhưng phải đủ SỐ MẪU *và* đủ GIÂY; streak đơn giản của smoother không phải dwell thật".
- **Thư viện ngoài**: không trực tiếp (`numpy` cho `isfinite`).

---

## Ghi chú merge cho builder-b

- 5 section này thay toàn bộ `#### C1`–`#### C5` hiện có trong `builder-b.md` (giữ header `### Nhóm C` + quy ước bbox/raster — phần raster bao-biên khớp).
- Điểm bắt buộc khác biệt bản cũ: C2 đếm `empty_votes` (không occupied votes) + edge-recheck; C1 `analysis_boundary` = vành trong + fallback <5px; C3 filtered=mask∩analysis + `raw_ratio` qua `roi.area` + component-trong-analysis; C4 branch2 có `core_component_count ≥ 2`; C5 tách `TemporalSmoother`/`accept_evidence`.
- Mọi expected trong file này đã tính bằng script raster/mô phỏng tay đối chiếu code — chạy lại logic trước khi merge nếu đổi tham số.
