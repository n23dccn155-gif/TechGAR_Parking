# cross-review-c — Kiểm chứng chéo builder-b.md (Phase 1)

Người thực hiện: builder-c. Đối tượng: `.analysis/algos/builder-b.md` bản rewrite hiện có.
Phạm vi: **B1–B11 (tracking)** — file kết thúc tại B11 với marker `<!-- CONT-C -->`; **C1–C5 occupancy chưa được viết** → ngoài phạm vi kiểm chứng lần này.
Phương pháp: script độc lập `.analysis/algos/cross-verify-c.py` (stdlib Python, deterministic, port tay công thức trong dossier — KHÔNG dùng `_verify*.mjs` cũ của builder-b). Không sửa dossier B, không chạy source/backend.

## 1. Kết quả tổng hợp

| ID | Sample verify | Verdict |
|---|---|---|
| B1 `kalman-constant-velocity` | trace `[11,10,1,0]→[12.5,10,1.5,0]→[14,10.5,1.5,0.5]`; coast `(15.5,11)→(17,11.5)` | **PASS** cả normal+edge |
| B2 `prediction-age-decay` | `4·e^(−age/0.25)` = 4/2.681/1.797/1.205; freeze `4·e⁻²`=0.541 | **PASS** số liệu; **gap**: pseudocode thiếu bước tính decay mà sample đo (xem §2-5) |
| B3 `association-distance-gate` | `20 + 5·(1+0.5·3) + 0.5·10` = **37.5** | **FAIL — dossier ghi 42.5** (sai số học: 5·2.5=12.5, không phải 17.5) |
| B4 `iou-overlap-score` | IoU=8/24=0.3333; lồng 4/16=0.25 | **PASS** |
| B5 `association-cost-matrix` | `0.12+0.13+0.03+0.01+0.01`=0.300 | **PASS**; lưu ý sample B dùng `gate:42.5` — số lấy từ lỗi B3 (xem §2-5) |
| B6 `lapjv-assignment` | A: opt total 0.9 (r0→c0,r1→c1,r2→c2); B: opt 1.2 (r0 unassigned, r1→c1) | **PASS** số liệu; **FAIL soạn thảo — đoạn "counterexample" là nháp tự sửa chưa chốt** (xem §2-2) |
| B7 `assignment-margin-ambiguity` | A → `[defer, keep]`; B → `[defer, defer]` | **PASS**; wording nhỏ: sample B expected trích `col_second=0.32` nhưng `row_second=0.31` cũng vi phạm — kết quả defer vẫn đúng |
| B8 `stale-anchor-reacquire` | `d=√5≈2.236 ≤3`, `app 0.2≤0.22` → vào solver | **FAIL — expected ghi `cost≈0.55`; theo đúng công thức demo của chính dossier (`0.5 + 0.2·d/3`) = 0.649** |
| B9 `track-lifecycle` | `[1,0,0,0,0]`→confirmed,lost1,lost2,expired,expired; `[1,0,1,0,0]`→confirmed,lost1,confirmed,lost1,lost2 | **PASS** |
| B10 `hsv-lab-descriptor` | hist `[0.75,0,0,0,0,0.25]`; d `1−√0.75`=0.134 | **PASS** |
| B11 `tracklet-gallery-match` | Bhattacharyya 2-bin đầy đủ | **FAIL nặng — 3/4 khoảng cách trong sample A tính sai + nnMed/distance sai; sample B cũng sai** (xem §2-3) |

## 2. Lỗi chi tiết + expected đã verify + đề xuất patch

### 2.1 B3 `association-distance-gate` — sai số học trong Expected

- Dossier: `gate = 20 + 5·(1+1.5) + 5 = 42.5` — thực tế `5·(1+0.5·3) = 5·2.5 = 12.5` → `20+12.5+5 = 37.5`.
- **Expected đã verify**: `gate = 37.5`.
- **Đề xuất patch**: sửa Expected thành `gate = 37.5 px`. Kiểm chứng `d=50 > 37.5` vẫn fail-gate → kết luận mẫu không đổi, chỉ con số.

### 2.2 B6 `lapjv-assignment` — counterexample greedy còn nháp, phải chốt bằng ma trận đã vét cạn

- Dossier Sample B chứa ~10 dòng thử-sai tự mâu thuẫn (`[[0.4,0.5]...]` → "sai hướng" → `[[0.05,0.9]...]` → "= opt" → n=3 → "không phân biệt" → kết luận treo "lesson-builder sẽ sinh sau"). Đây là nội dung nháp còn sót trong Expected — vi phạm quy ước "Expected chỉ chứa đáp án đã verify".
- **Đã vét cạn bằng script**: counterexample 2×2 đơn giản nhất với greedy global-min:
  `costs = [[0.1, 0.2], [0.3, 0.9]]` → greedy lấy ô nhỏ nhất `(r0,c0)=0.1` rồi ép `r1→c1=0.9` → total **1.0**; optimal `r0→c1 + r1→c0 = 0.2+0.3 = 0.5` → **greedy thua 2×**.
  (Nếu muốn kèm `cost_limit=0.9`: greedy vẫn ~1.0 vì `r1→c1=0.9` ngang unassigned; opt giữ 0.5.)
- **Đề xuất patch**: xóa toàn đoạn nháp; thay bằng block ngắn: `Counterexample greedy (verify exhaustive): [[0.1,0.2],[0.3,0.9]] — greedy 1.0 vs optimal 0.5`.
- Hai sample chính A/B đã verify đúng (0.9 / 1.2) — giữ nguyên.

### 2.3 B11 `tracklet-gallery-match` — Bhattacharyya bỏ sót term → nnMed/distance sai

Công thức dossier tự định nghĩa (đúng): `d(p,q) = 1 − Σᵢ√(pᵢ·qᵢ)` trên **cả** vector. Script tính lại đầy đủ 2 bin:

| Cặp | Dossier ghi | Đã verify | Ghi chú |
|---|---|---|---|
| `d(h1,h3)` | `1−√0.72 = 0.151` | **0.0101** | dossier bỏ term `√(0.1·0.2)=0.141` |
| `d(h1,h4)` | `1−√0.09 = 0.7` | **0.4000** | bỏ term `√(0.1·0.9)=0.3` |
| `d(h2,h3)` | 0.024 | 0.0243 | đúng (dùng đủ 2 term) — bất nhất giữa các dòng cùng sample |
| `d(h2,h4)` | 0.155 | 0.1551 | đúng |

Hệ quả: `nn(h1)=min(0.0101,0.4)=0.0101`, `nn(h2)=min(0.0243,0.1551)=0.0243` →
- **nnMed(A→B) = (0.0101+0.0243)/2 = 0.0172** — dossier ghi 0.0875.
- Chiều ngược `nnMed(B→A) = (0.0101+0.1551)/2 = 0.0826`.
- **distance = max = 0.0826** — dossier ghi `≈0.088`. Kết luận định tính (distance thấp → match) không đổi.

Sample B (gallery `{[0,1]}`):
- `d(h1,[0,1])`: dossier ghi `=1` — **sai**: bin thứ hai overlap `√(0.1·1)=0.316` → đúng **0.6838**. `d(h2,[0,1])=0.3675` (dossier 0.368 đúng).
- **nnMed(A→B) = (0.6838+0.3675)/2 = 0.5257** — dossier ghi `≈0.684` (lấy nhầm nn đầu làm median). distance=max(0.5257, 0.3675)=**0.5257**. Kết luận "distance cao → không match" không đổi.
- Hai câu dẫn "verify tương tự trước… dAgg≈0.82" và "khớp verify cũ 0.8174" là **dangling reference** tới fixture cũ không còn trong file — phải xóa hoặc thay bằng số verify mới.

**Đề xuất patch**: tính lại 4 khoảng cách bằng công thức đầy đủ (đã liệt kê ở trên, sai số <1e-3); sửa nnMed 0.0172 / distance 0.0826 (sample A), nnMed 0.5257 / distance 0.5257 (sample B); xóa 2 câu dẫn verify cũ.

### 2.4 B8 `stale-anchor-reacquire` — expected mâu thuẫn chính công thức demo của dossier

- Dossier pseudocode bước 4: `cost = floor + w·d_norm`; Expected ghi `cost≈0.55 (sàn demo ~0.5+0.2·d/3)`.
- Theo chính công thức trong ngoặc: `0.5 + 0.2·(√5/3) = 0.5 + 0.2·0.7454 = 0.649`.
- **Expected đã verify**: `cost ≈ 0.649` (với floor 0.5, w·d_norm = 0.2·d/3).
- **Đề xuất patch**: sửa `≈0.55` → `≈0.649`, hoặc nếu muốn giữ 0.55 thì đổi công thức (ví dụ `0.5+0.07·d/3`) — nhưng phải nhất quán giữa pseudocode, sample input và expected. Gate `d≤3, app≤0.22` và verdict "vào solver" đều đúng, không đổi.

### 2.5 Các điểm phụ (không sai đáp án, nên sửa khi pass)

1. **B2**: pseudocode 3 dòng chỉ `age/limit/predict_ok` — không có bước tính `v·e^(−age/τ)`, nhưng Sample A/B expected toàn là giá trị decay → người đọc không map được dòng pseudo nào ra số. Đề xuất: thêm dòng pseudo "[sim] `v_eff = v_max·e^(−age/τ)`" hoặc tách sample decay sang mục sim riêng.
2. **B5 Sample B**: dùng `gate:42.5` — nếu số này bắt nguồn từ sample B3 thì lan lỗi; đổi thành 37.5 cho nhất quán liên-kết (bản thân nó là input tự do nên không sai kết quả).
3. **B7 Sample B**: expected trích `col_second=0.32`; thực tế `row_second=0.31` cũng < 0.34 — nên ghi "cả hai guard đều vi phạm" cho đầy đủ.
4. **B9**: Expected ghi "hết hạn ở frame 4" — đúng nếu đếm frame từ 1; danh sách trạng thái đã đúng, chỉ nên ghi rõ frame index 3 để tránh nhầm.
5. **`[test]` tag "448 passed in 7.88s"**: lấy từ phiên builder-b trước — cross-review không chạy lại test backend; giữ nguyên gán quy ước, không suy rộng thành "đã kiểm chứng phiên này".

## 3. Phạm vi chưa kiểm chứng

- **C1–C5 occupancy**: không tồn tại trong file hiện tại (kết thúc ở B11, marker `<!-- CONT-C -->` chờ builder-b tiếp tục). Nhóm C/D/E trong inventory (line 26-88) chưa có spec → cross-review vòng sau khi builder-b ghi xong.
- Nhóm A (A1–A12, line 91-394): ngoài ưu tiên lần này, chưa rà.
- Code refs `motion_tracker.py`/`tracklet_descriptor.py`: chỉ kiểm tính nhất quán sample↔pseudocode↔expected theo công thức dossier tự khai; chưa đối chiếu lại source gốc (không phát hiện cần thiết cho các lỗi số học trên).

## 4. Tóm tắt cho LEAD

- **4 lỗi số liệu phải sửa**: B3 `42.5→37.5`; B8 `0.55→0.649`; B11 sample A `nnMed 0.0875→0.0172, distance≈0.0826` (4 khoảng cách tính lại); B11 sample B `nnMed≈0.684→0.5257` (và `d(h1,[0,1])=1→0.6838`).
- **1 lỗi soạn thảo**: B6 đoạn counterexample nháp ~10 dòng → thay bằng `[[0.1,0.2],[0.3,0.9]]` (greedy 1.0 vs opt 0.5, đã vét cạn).
- **PASS sạch**: B1, B4, B5, B7, B9, B10 (cả normal+edge).
- Fixture độc lập: `.analysis/algos/cross-verify-c.py` — chạy `python cross-verify-c.py`, mọi `[PASS]` là giá trị đã đối chiếu.

---

## 5. Vòng 2 — Re-check trạng thái fix + nhóm C1–C5 (file đã cập nhật, 726 dòng)

File hiện tại đã có `### Nhóm C — Slot occupancy (C1–C5)` (line 615–726) và B6 được viết lại. Fixture `cross-verify-c.py` đã bổ sung phần B6-CE + C1–C5, chạy lại toàn bộ.

### 5.1 Trạng thái các mục đã báo vòng 1

| Mục | Vòng 1 | Trạng thái hiện tại | Ghi chú |
|---|---|---|---|
| B3 gate `42.5` | FAIL | **OPEN** — vẫn `= 42.5` (line 455) | đúng phải là `37.5`; chưa sửa |
| B6 counterexample nháp | FAIL soạn thảo | **RESOLVED** — đoạn nháp đã thay bằng counterexample `[[0.1,0.5],[0.4,10]]` sạch | verify: greedy-theo-hàng `r0→c0`(0.1)+`r1` unassigned(0.9)=**1.0**; optimal `r0→c1+r1→c0`=**0.9** — đúng cả logic lẫn số |
| B8 cost `≈0.55` | FAIL | **OPEN** — vẫn `≈0.55` (line 549) | theo công thức demo `0.5+0.2·d/3` → `0.649` |
| B11 Bhattacharyya | FAIL | **OPEN** — sample A/B vẫn giá trị cũ (line 610-611) | `d(h1,h3)` bỏ term `√(0.1·0.2)` → đúng 0.0101; nnMed→0.0172, distance→0.0826 (A); `d(h1,[0,1])`=0.6838, nnMed→0.5257 (B); 2 câu dẫn "verify cũ" vẫn còn |

### 5.2 C1–C5 occupancy — verify normal + edge (đều PASS)

| ID | Sample A (thường) | Sample B (biên) | Verdict |
|---|---|---|---|
| C1 `slot-roi-precompute` | poly {1..6}² → roi=36, analysis=16 (erode 1 bỏ vành), boundary=20, core={3,4}²=4 | poly 2×2 → roi=4, analysis=0 → `invalid slot` | **PASS** — quy ước raster bao-biên nhất quán; core = scale polygon 0.5 về tâm → đúng {(3,3),(3,4),(4,3),(4,4)} |
| C2 `ensemble-threshold-voting` | ratios ≥0.12 ở idx {0,1,2,6,7} → votes=5 ≥ needed=5 → occupied | votes=3 <5 → free | **PASS** |
| C3 `border-line-filter` | raw 7/20=0.35 → lọc vạch còn 2/20=0.10 <0.12 → vote lật free | fg lõi 5/20=0.25 → occupied | **PASS** |
| C4 `core-rescue-vote` | `core 0.20≥0.18 && comp 0.10≥0.08` → rescue=true | `ratio 0.35≥0.30` nhưng `core 0.01<0.02` + `comp 0.02<0.08` → rescue=false | **PASS**; **gap nhỏ**: JSON sample B thiếu field `core_min`/`comp_min` (expected viện dẫn 0.18/0.08 từ sample A) — nên self-contained |
| C5 `temporal-smoothing-dwell` | `need_occ=ceil(0.5/0.4)=2`, `need_emp=ceil(1.0/0.4)=3` → flips `[(1.2,'occupied'),(3.6,'free')]` | flicker [1,0,1,0] → streak max 1 <2 → không flip | **PASS** — trace từng frame khớp mô tả |

### 5.3 Cập nhật tổng

- Verify lại toàn bộ fixture: **B6 RESOLVED**; **3 OPEN còn lại** (B3, B8, B11) — số liệu đúng đã nêu ở §2, chờ builder-b patch.
- C1–C5: **5/5 PASS** cả normal+edge; 1 gap nhỏ (C4 sample B thiếu `core_min`/`comp_min` trong JSON).
- File vẫn còn `<!-- CONT-D -->` cuối C5 — nhóm D/E chưa viết, cross-review vòng sau.

---

## 6. Vòng 3 — Đối chiếu SOURCE semantics cho C1–C5 (`backend/main_detect/src/techgar/parking_detector.py`)

Vòng 2 chỉ kiểm chứng số học theo công thức dossier tự khai — tất cả PASS. Vòng này đọc source gốc để kiểm semantics: **sample số học đúng nhưng một số mô hình dạy không khớp code thật**. Đây là loại lỗi nghiêm trọng hơn số học — demo sẽ dạy cơ chế sai.

### 6.1 C2 `ensemble-threshold-voting` — **INVERTED POLARITY (FAIL)**

| | Code thật (`:454-549`) | Dossier |
|---|---|---|
| Biến thể | 5 gamma × 5 CLAHE = **25** | 9 (`~`demo OK) |
| Phiếu đếm | `ratio < ratio_thr(0.20)` → **`empty_votes`++** (`:527-528`) | `ratio ≥ enter_ratio` → occupied votes |
| Quyết định | `is_free = empty_votes ≥ 12` (`required_votes = 25//2`, `:533,539`) → **`occupied = not is_free`** (`:581`) | `occupied = fg_votes ≥ needed` |
| Cứu | `_has_core_rescue` lật free→occupied (`:542-547`) + **edge recheck** Canny `edge_thr=0.25` (`:551-566`) | chỉ core-rescue qua C4; **không nhắc edge recheck** |

Hệ quả: code có semantics "mặc định occupied trừ khi đa số rõ empty" — slot mơ hồ (`empty=12` vừa ngưỡng) → **free**; fg=12 (empty=13) → code free nhưng model dossier (`fg≥5`) → occupied — **verdict ngược ở biên**. Model dossier không phải "giản lược tương đương": nó đảo cả chiều đếm lẫn ngữ nghĩa default.
- **Đề xuất patch**: đổi pseudocode/sample thành đếm `empty_votes`; `free ⇔ empty ≥ ceil(V/2)`; `occupied ⇔ ¬free` sau rescue+edge; nêu rõ `ratio_thr=0.20`/`exit=0.08`/25 biến thể; khai báo `[sim-omits]` edge-recheck nếu demo bỏ pass Canny. Sample hiện tại có thể giữ bằng cách diễn đạt lại theo empty_votes (`votes_empty=4 <5→…`) — nhưng phải đổi biểu thức, không chỉ đổi nhãn.

### 6.2 C3 `border-line-filter` — **topology mask sai (FAIL)**

- Code (`:328-410`): `raw_ratio = count(mask∩roi.mask)/roi.area` — **toàn ROI**; `filtered = mask∩analysis_mask` — vành `roi−analysis` **không bao giờ vào filtered từ đầu** (loại bằng mask, không phải bằng line-filter); component được xét là các component **nằm trong analysis** và **`touches_boundary` = chạm `analysis_boundary`** — tức vành mỏng *bên trong* analysis (`analysis_mask − erode3x3(analysis_mask)`, `:276-279`), không phải dải giữa roi↔analysis. Điều kiện xóa: `span_ratio ≥ line_min_span_ratio(0.45)` ∧ `thickness_ratio ≤ line_max_thickness_ratio(0.18)` ∧ `¬vehicle_like_core` (`:362-367`); `selective_line_filter=True` mặc định → fitLine + chỉ xóa phần mảnh, giữ vùng dày (`:370-387`).
- Dossier: pseudocode bước 1 `components = connectedComponents(mask & boundary)` — **sai vùng** (vành ngoài roi−analysis không tồn tại trong filtered); bước 2 tiêu chí `mảnh+dài` đúng ý nhưng thiếu `span/thickness/vehicle-core`; sample `raw = 7/20` — nếu theo code, raw_ratio = `fg(roi)/roi.area` = 7/**36** ≈ 0.19 chứ không phải 0.35 (analysis_px=20 sai mẫu số), và 5 px "boundary" đó **không nằm trong filtered nên không có gì để lọc** — câu chuyện "lọc làm ratio tụt 0.35→0.10" chỉ đúng nếu vạch nằm trong analysis chạm vành trong.
- **Đề xuất patch**: sửa pseudocode thành `components trong filtered(=mask∩analysis)`; loại khi `touches analysis_boundary ∧ span≥0.45 ∧ thickness≤0.18 ∧ ¬core xe`; sample phải đặt vạch **trong analysis** (ví dụ 5 px mảnh chạm vành analysis) thì `filtered 7→2`, `removed_ratio=5/20`; nêu `raw_ratio` qua `roi.area` riêng. `[sim-omits]` bổ sung selective fitLine.

### 6.3 C1 `slot-roi-precompute` — **PARTIAL: fallback thay "invalid slot"**

- Code (`:263-296`): `analysis = erode(roi, ellipse-size = border_ignore_ratio(0.12) × min_roi_dim)` — kernel tỉ lệ, không phải `erode_px` cố định; `analysis_boundary = analysis − erode3x3(analysis)` (vành mỏng *trong*); `core = scale-poly(0.55) ∩ analysis`; **nếu analysis < 5 px → fallback `analysis_mask = local_mask`** (`:273-274`), core <5 → fallback analysis (`:295-296`).
- Dossier Sample B "analysis=0 → invalid slot" — **không đúng code**: slot nhỏ được fallback về ROI chứ không chết (`detect` chỉ skip khi `analysis_area == 0` — gần như không xảy ra vì fallback). Edge "slot nhỏ hơn kernel → không bao giờ occupied" là **chưa xác minh/ngược code**.
- Đề xuất patch: Sample B đổi expected thành "analysis <5px → fallback analysis=roi (slot vẫn đo được, mất lớp lõi)"; C1 bổ sung `analysis_boundary` là vành *trong* để C3 khớp topology; đổi `erode_px` → `border_ignore_ratio` (0.12×min_dim).

### 6.4 C4 `core-rescue-vote` — **thiếu điều kiện `core_component_count ≥ 2`**

- Code (`:418-428`): branch1 `central_blob = core_ratio ≥ 0.18 ∧ core_component_ratio ≥ 0.08` (dossier khớp); branch2 `textured_dense_blob = raw_ratio ≥ 0.30 ∧ core_ratio ≥ 0.02 ∧ core_component_count ≥ 2` — **dossier bỏ điều kiện thứ ba**. Sample B verdict `rescue=false` vẫn đúng (core 0.01<0.02 đã kill) nhưng JSON thiếu `core_component_count` + ngưỡng → demo có thể pass với input mà code thật fail ở count.
- Đề xuất patch: thêm field `core_component_count` + `comp_count_min=2` vào sample, pseudocode bổ sung điều kiện; `[sim-omits]` ghi rõ nếu demo gộp.

### 6.5 C5 `temporal-smoothing-dwell` — **trộn hai cơ chế khác nhau (PARTIAL→FAIL nhẹ)**

- **`TemporalSmoother`** (`:63-80`, `smoothing_frames=5`): streak **đối xứng cả hai chiều** — `pending==vote → counter++ else counter=1`; `counter ≥ required → confirmed`. Không timestamp, không hysteresis. Chạy trong `detect()` `:575-576`.
- **`accept_evidence`** (`:602-645`, chỉ khi `stable_evidence=True`): timestamp dwell **bất đối xứng thật**: timestamp-monotonic guard `now > _accepted_timestamp` (`:610-611`) — không có biến seq, chỉ so timestamp nguồn; `gap = now − last`; **`gap > 1.5 s` → reset pending/count** (`:624-625`); `desired` khác theo chiều — đang occupied: `desired = ¬(exit_empty_votes ≥ required ∧ ¬rescue)` (`:626-628`), đang free: `desired = instant_occupied` (`:630`); lật cần **`count ≥ (2 nếu vào / 3 nếu ra)` ∧ `elapsed ≥ (0.5 s vào / 1.0 s ra)`** (`:637-639`) — CẢ count LẪN duration; `initialized` gate — lúc đầu `occupied=True` placeholder + `ready` (`:643`).
- Dossier gộp thành `need = ceil(dwell/interval)` streak — trùng hợp số `0.5/1.0 s` với default thật (`occupied_seconds=0.5`, `empty_seconds=1.0`, `:115-116`) nhưng **bỏ count∧duration kết hợp, gap>1.5s reset, timestamp-monotonic guard, và exit-votes logic khi occupied**; cũng không phân biệt hai cơ chế.
- Đề xuất patch: tách 2 mục/pseudo — (a) streak đối xứng `required_frames`; (b) timestamp dwell `count ∧ elapsed` + gap reset + desired exit-votes; nếu demo chỉ giữ một mô hình thì `[sim-omits]` phải liệt kê phần bỏ rõ ràng. Sample hiện vẫn chạy được như sim-streak nhưng không được gán nhãn "port" cơ chế gốc.

### 6.6 Tổng vòng 3

| ID | Vòng 2 (số học) | Vòng 3 (semantics vs source) |
|---|---|---|
| C1 | PASS | **PARTIAL** — sample B "invalid slot" ngược fallback code `:273-274`; `analysis_boundary` là vành *trong*, không phải `roi−analysis` |
| C2 | PASS | **FAIL** — inverted: code đếm `empty_votes` (free ⇔ empty≥12/25, `:527-539`), occupied=`¬free` sau rescue+edge-recheck; demo đếm occupied — verdict ngược ở vùng mơ hồ |
| C3 | PASS | **FAIL** — filtered=mask∩analysis từ đầu; component bị lọc nằm *trong* analysis chạm `analysis_boundary`; sample raw-ratio sai mẫu số (roi.area) |
| C4 | PASS | **PARTIAL** — thiếu `core_component_count ≥ 2` trong branch2 (`:426`) |
| C5 | PASS | **PARTIAL** — trộn `TemporalSmoother` streak đối xứng với `accept_evidence` dwell bất đối xứng (count 2/3 + duration 0.5/1.0 s + gap>1.5 s + timestamp-monotonic) |

**Cập nhật cho LEAD**: 3 OPEN vòng 1 (B3/B8/B11) + 2 FAIL semantics mới (C2 inverted, C3 topology) + 3 PARTIAL (C1 fallback, C4 count, C5 conflation). Đề xuất patch chi tiết ở từng mục; không sửa `builder-b.md`.

### 6.7 RESOLVED — bản thay thế đã viết

Toàn bộ 5 finding semantics đã được giải quyết bằng **replacement spec hoàn chỉnh** tại `.analysis/algos/occupancy-correction-c.md` (schema dossier đầy đủ: params literal từ `__init__`, pseudocode theo source, normal+edge JSON + expected đã trace, storyboard, `[sim-omits]` rõ — giữ 5 ID canonical):

| ID | Trạng thái sau correction doc |
|---|---|
| C1 | **RESOLVED** (v1.1) — spec mới: `analysis_boundary` = vành *trong* analysis (`analysis − erode3x3`), fallback `<5px → local_mask`/`→analysis` thay "invalid slot", `border_ignore_ratio` thay `erode_px`. **v1.1 sửa Sample B**: `min_dim` tính trên **padded-bbox** (`roi_w/h` = poly bounds ±2px → 6 chứ không 4) → `inset=round(6·0.2)=1`; cả 2 fallback kích hoạt → expected final `analysis=16, core=16` (intermediate 4<5 không phải giá trị cuối). Sample A = normal path không fallback |
| C2 | **RESOLVED** — spec mới: đếm `empty_votes` (`ratio<0.20`), `is_free ⇔ empty ≥ V//2`, `occupied=¬free`, 2 cứu (core-rescue + edge-recheck `edge_thr=0.25`); sample verify: empty=3<4→occupied, 7≥4→free, rescue/edge lật free→occupied, biên empty=required→free |
| C3 | **RESOLVED** — spec mới: `filtered=mask∩analysis`, component *trong* analysis chạm `analysis_boundary` mới bị xét; `raw_ratio` mẫu số `roi.area`; sample verify: vạch 6 ô trên vành → xóa (0.278→0.111, raw 10/64≈0.156), vạch 2 ô span 0.333<0.45 → giữ, blob-đuôi vehicle_core → giữ |
| C4 | **RESOLVED** — spec mới: branch2 đủ 3 điều kiện `raw≥0.30 ∧ core≥0.02 ∧ count≥2`; sample verify: count=1→false, count=2→true (cùng raw/core — count-gate quyết định) |
| C5 | **RESOLVED** — spec mới tách (a) `TemporalSmoother` streak đối xứng `required_frames` vs (b) `accept_evidence` dwell `count(2/3) ∧ elapsed(0.5/1.0s)` + `gap>1.5s` reset + timestamp-monotonic reject + desired exit-votes; sample verify: flips `[(0.8,'occupied'),(2.4,'free')]` (duration-gate trì hoãn so với count-only), gap=2.0 reset đẩy lật tới t=3.0, stale ts reject |

**Unresolved còn lại** (đều trong `builder-b.md`, chờ builder-b patch — B cũng có thể dùng correction doc cho phần C): **B3** `42.5→37.5`, **B8** `0.55→0.649`, **B11** Bhattacharyya thiếu term bin-2 (sample A `nnMed 0.0172/distance 0.0826`, sample B `0.5257`). B6 đã RESOLVED.
