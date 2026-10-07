# REVIEW — Dossier builder-b (Phase 1, backend CV)

Phạm vi review: `D:\TechGar2\.analysis\algos\builder-b.md` — 58 mục (57 canonical CV + 1 alias F9→owner C). Các yêu cầu review vòng trước đã áp dụng; báo cáo này tổng hợp trạng thái cuối.

> **TRẠNG THÁI: PHASE 1 B ĐÃ DUYỆT — GATE CV ĐẠT** — LEAD đã duyệt dossier đã merge + completeness patches và chạy lại 3 verifier: `_verify4.mjs` (**163/163**), `verify-motion-binder-a.py` (**95/95**), `finalcheck-verify-ef-c.py` (**64/64**), exit 0. Mọi review đã đóng, không còn finding mở. Đây là trạng thái cuối Phase 1 — bắt đầu Phase 3 (`algo-web/packs/cv.js`).

## 1. Thống kê mandatory fields (58/58 mục)

| Trường bắt buộc | Có mặt | Ghi chú |
|---|---|---|
| ID kebab-case + title VN | 58/58 | `#### <ID>. \`kebab\` — <title>` |
| Nhóm + tiên quyết + liên quan | 58/58 | |
| Code refs `path:start-end + symbol` | 58/58 | root-relative `backend/main_detect/...` |
| Input/Output + kiểu | 58/58 | |
| Pseudocode đánh số | 58/58 | |
| Data structures | 58/58 | |
| Time complexity (code + sim) | 58/58 | `Độ phức tạp (code)` + `**[sim]**` |
| Space complexity | 58/58 | `**space**` chèn rõ từng entry |
| Edge cases | 58/58 | |
| Failure modes | 58/58 | |
| Phân biệt code vs sim (`[sim-omits]`) | 58/58 | |
| Sample A (thường) + Sample B (biên/lỗi) | 58/58 | JSON hợp lệ; frame_id/string đều quote |
| Expected xác định (đã verify) | 58/58 | không còn `?`/`wait`/tự sửa trong Expected |
| Storyboard cụ thể | 58/58 | đối tượng, màu, motion, bảng realtime, pseudo-line, giải thích VN |
| Thư viện ngoài + demo tương đương | 58/58 | |

Inventory header đã sửa: "58 mục = 57 canonical + 1 alias", khớp `algo-web/SPEC.md` §2 (cv = 57 canonical).

## 2. Fixture assertions — trạng thái

**Fixture hiện hành của B** (assertion PASS/FAIL thật, chạy `node _verify4.mjs` — không server/backend):

```
node _verify4.mjs                 → 163 PASS, 0 FAIL   (B-owned — assert B5/B7/B8/B10/B11 đã thay bằng formula sau merge)
python verify-motion-binder-a.py  →  95 PASS, 0 FAIL   (A-owned, độc lập — phủ 19 section đã merge, file nguyên trạng)
python finalcheck-verify-ef-c.py  →  64/64 PASS        (C-owned, độc lập — file C nguyên trạng)
```

**KHÔNG claim 115/115** — các assert pre-merge cho B5 (`cost=0.5+0.2·d/3`), B8 (`0.649`), B10 (`d=1−BC=0.134`), B11 (`nnMed max→0.0826/0.6257`), B7 (margin mọi cặp) **đã bị thay bằng assert đúng theo section đã merge**: B5 4-term `0.45/0.25/0.20/0.10` + log-size (`cost A=0.3669`); B7 split-only + `margin=0.08·(2−lineage)=0.16` + clear-streak; B8 anchor `gate=min(20,max(3,1.5))=3`, app `≤0.22`, `cost=0.2809`; B10 `d=√(1−BC)=0.366` + quality-3-factor hard-0; B11 4-term `0.5n+0.2c+0.2a+0.1b` → `0.1553`/`0.6889`. Thêm 35 assert cho 14 section có số mới (A5/A7/A9/A10/A12, D1 `0.862`+`None`, D3 `0.6123`, D4 detach, D7 `[5,25,45,45]`, D8 OR-admission+ambiguity, D9 `0.3093`+`insufficient_outward`, D10 `released`/`col_gap 0.04<0.15`).

48 assertion đầu phủ các correction source-policy (các số B5/B7/B8/B10/B11 đã cập nhật theo merge — xem khung trên): B2 vector-interp `[14,12.68,11.8,11.2]` + conf `[1,.75,.5,.25]` + merged→raw `[14,10]` + over-limit→anchor `[10,10]`; B3 `gate=50`, floor `24`, young→`180`; B5 `size_err 0.3938`, `cost=0.3669`, `d=55>gate50→∞`; B6 CE greedy `1.0>0.9`; B9 `[confirmed,lost(1),lost(2),removed+emit,—]`; C1 `64/36/20/16` + fallback `16/16/12/16`; C2 `occupied_majority(3)`, `free_clear(7)`, rescue, edge, `(5,1,free)`; C3 `0.278→0.111`, removed `0.167`, raw `0.156`; C4 central true / count1 false / count2 true; C5 `[(0.8,occ),(2.4,free)]` + gap→occ@3.0 + stale reject; D5 `r95 0.20` stopped + outlier `r95 4.29` nhưng `inlier 0.83` stable, `robustDrift 0.16`; D6 `reject:sticky_id_conflict → departing+exit_pending → token+detach → restore→parked`; D11 `parked→departing→released` + restore; E6 mint/obs4/blocked/disp_min; E10 `exited≠expired`, `parked` là state thật.

51 assertion mới phủ `cv-crosscal-review-c`: E1 `(20,30)` + fallback `(35,45)` không `approx`; E2 `1.25 frames`, gate `|v|≤1.0→None`, left `22.5>16`; E3 frame `elapsed=12→102.4` (không `/fps`), ts-branch `2.0·1.2=102.4`, `×25.0` conv; E4 `cost 0.201/0.4575`, reject `>0.92→score`, gates `prediction_distance`/`direction`; E5 unique merge `a1-b1` / ambiguous `0` / greedy min-cost `b1` / single-join `null` khi calibrated; E8 `score 0.72` (6 term), `camera_topology`/`stable_wrong_direction`; F3 `passed→ok`, `reviewed_fit standalone→reject:status`, rect-full `ok`, thiếu `accepted→reject`, sai adjacency `reject`; F4 median `500`→`{875,1375,875,250}`, ceiling `min(1000,875)=875`, tighten `700`, override `300`, fallback `600`; F5 uniform `2×` adapt `sx=sy=2`, aspect `reject`, `H@S=[[4,0,10],[0,4,20],[0,0,1]]` vs `S@H` khác; F8 pending→skip, `age=max(0.2,0.3)=0.3` accept, `3.0>2→result_too_old`, `evidence_not_monotonic`, `worker_over_deadline`. **2 FAIL ban đầu đã sửa trước khi nộp**: E2 sim sai công thức cạnh trái (`t=cx/|vx|`); F5 expected `H@S` bị nhầm `S@H` (`[[4,0,20]...]` → đúng `[[4,0,10],[0,4,20],[0,0,1]]` — dossier Sample A cũng đã sửa theo).

**Fixture đóng băng vòng trước (không còn chỉnh sửa — bằng chứng lịch sử, nay có mục superseded):**

| File | Owner | Mục đã superseded (không dùng làm bằng chứng hiện hành) |
|---|---|---|
| `cross-verify-c.py` | C (độc lập) | B2 scalar decay `4·e^(−a/0.25)` + freeze `0.541` (production dùng vector-interp + merged→raw); B3 gate `37.5` theo công thức cũ (source thật = floor/budget/ceiling → `50`); B7-B fixture `[[0.30,0.32],[0.31,0.30]]` khác sample dossier; B9 state `expired` (thật: pop+emit); C1–C5 mẫu cũ; B11-B thiếu cov-gap (`0.5257` thay `0.6257` — cùng verdict) |
| `_verify_samples.mjs` | B | B2 scalar, B3 `42.5/27.5`, B11 gộp 1 nnMed, C1 `36/20/4`, C2 `votes≥0.12`, D5 nearest-rank r95, B1/B4B5/D1/E8 demo-params cũ |
| `_verify2.mjs` | B | B2e `0.541`, B9 `expired` state, B10 bucket index 4 (bug cũ — dossier hiện bin 5), C3 `5+2/20`, C5 streak-model (đó là TemporalSmoother, không phải `accept_evidence`) |
| `_verify3.mjs` | B | D6 `exit_pending` countdown (thật: token+detach+restore), E6/E10 placeholder, B11A/B một chiều |

Mọi PASS/FAIL được claim đều lấy từ output chạy thật của `_verify4.mjs` ở trên — không tái dùng PASS của fixture cũ cho các mục đã đổi policy.

### 2b. Cross-review semantics C1–C5 (đã merge `occupancy-correction-c.md`)

Nhóm C đã thay bằng spec viết theo source `parking_detector.py` (params literal từ `__init__` `:97-137`, không còn `~` cho các ngưỡng này):

| ID | Sửa theo source | Params literal |
|---|---|---|
| C1 | `analysis_boundary` = vành *trong* analysis (`analysis − erode3x3`, `:276-279`); `inset=round(min_dim_padded_bbox·0.12)`; **fallback** `analysis<5px→mask`, `core<5px→analysis` (:273-274,:295-296) — xóa claim "invalid slot" | `border_ignore_ratio=0.12`, `core_scale=0.55` |
| C2 | **inverted polarity sửa**: đếm `empty_votes` (`ratio<0.20`, `:527-528`); `is_free = empty ≥ V//2` (`:533,539`); `occupied=¬free` (`:581`); + edge-recheck `edge_thr=0.25` (`:551-566`); V_demo=9 giữ `V//2` | `ratio_thr=0.20`, `exit_ratio_thr=0.08`, `edge_thr=0.25` |
| C3 | `filtered = mask∩analysis` từ đầu (`:331-333`); component *trong* analysis chạm `analysis_boundary`; điều kiện `span≥0.45 ∧ thickness≤0.18 ∧ ¬vehicle_core` (`:362-367`); `raw_ratio` mẫu số `roi.area` (`:328-329`); `[sim-omits]` selective fitLine | `line_min_span_ratio=0.45`, `line_max_thickness_ratio=0.18`, `core_component_threshold=0.08`, `selective_line_filter=True` |
| C4 | branch2 đủ 3 điều kiện `raw≥0.30 ∧ core≥0.02 ∧ core_component_count≥2` (`:423-427`) | `core_ratio_threshold=0.18`, `core_component_threshold=0.08`, `core_rescue_raw_ratio=0.30` |
| C5 | **tách 2 cơ chế**: `TemporalSmoother` streak đối xứng (`required_frames=5`, `:63-80`) vs `accept_evidence` dwell `count∧duration` bất đối xứng (2/3 count + 0.5s/1.0s + gap>1.5s reset + **timestamp-monotonic guard** `:609-644` — v1.1 xác nhận không có biến `jobseq`); `stable_evidence=False` mặc định | `smoothing_frames=5`, `occupied_seconds=0.5`, `empty_seconds=1.0` |

B-group patch áp theo cross-review C (vòng trước): B8 `0.55→0.649`, B11 đủ 2 bin + hai chiều, B6 counterexample sạch. **Lưu ý**: giá trị B3 `37.5` từ cross-review C đã bị **supersede** bởi source-review của A (xem §2c) — công thức thật là floor/budget/ceiling, sample gate `50`. **Và sau merge §2f**: B8 `0.649` → `0.2809` (cost 4-term), B11 hai-chiều `0.0826/0.6257` → 4-term `0.1553/0.6889`, B7 col-defer → split-only + lineage-scaled margin — các assert vòng này không còn đếm làm bằng chứng hiện hành.

### 2c. Source-review của A (`cv-source-review-a.md`) — 8 finding đã patch + verify

| ID | Claim sai cũ → semantics thật (đã verify source) | Patch |
|---|---|---|
| B2 | age>limit → vô dụng; merged-freeze = decay | **3 nhánh**: `age>limit` → point = measured anchor `stale_prediction`, conf=0; `merged_freeze` → raw Kalman conf=1.0; còn lại → nội suy `measured+(raw−measured)·e^(−age/τ)`, `velocity_confidence` giảm tuyến tính | role/pseudo/samples/storyboard |
| B3 | `42.5→37.5` theo công thức tuyến tính | **floor/budget/ceiling**: `pred_age>limit→0`; `vc<min_obs→ceiling`; `budget=speed·(inv+1)·scale+ratio·extent`; `gate=min(ceil,max(floor,budget))`; literal `scale=2.0,ratio=1.0,min_obs=3,max_dist=180,age=0.40` → sample `50`, floor `24` | pseudo/samples/Expected |
| B5 | sample B gate cũ | `d=55 > gate=50 → cost=∞` (link B3 mới) | Expected |
| B9 | `expired` là state bền | enum `{tentative,confirmed,lost}`; hết hạn = **pop + emit `expired_tracks` 1 lần**; confirm cần `min_visible_count` (+`min_displacement` khi cấu hình) | role/pseudo/samples |
| B10 | "hist 160" mơ hồ với 6 bins | production = **416-D** `0.70·HS[16×16]+1.20·AB[12×12]+0.60·L[16]` L2-norm; sample 6-bin hue là `[sim]` giáo dục (bin=floor(h/30)) | role/samples/[sim] |
| B11 | Expected 1 chiều | đủ hai chiều `nnMed(A→B)/nnMed(B→A)` + `distance=max` — `0.0826` match / `0.6257` no-match (gồm cov-gap `w=0.2`) | Expected |
| D5 | r95/first-last đơn giản | `_is_stopped` (window + min-samples + duration + same-slot ratio + median-center + r95 + net-disp, ngưỡng `max(3/5px, ratio·bbox_diag)`) tách `_strong_overlap_is_stable` (`inlier_ratio≥0.60`, robust endpoint medians `k=max(2,min(n//3,5))`) | role/pseudo/samples/storyboard |
| D6 | empty-streak countdown | **token-based**: vision-empty đầu → departure token `confirmed_empty` + detach ngay; tracker-lost → `departing` + `tracking_state=exit_pending` (label, không phải gate); occupied-lại trước consume → `_restore_false_empty_token` → `parked`; empty-count chỉ là audit metadata | role/pseudo/samples/storyboard |
| D11 | `open/parked/departing/closed` | **`parked → departing → released`**; tạo thẳng `parked` khi bind; `released` terminal → released-log; dedup rebind cùng owner (không double-session); lý do kết thúc `parking_slot_removed`/`recovery_expired` | role/pseudo/samples/storyboard |
| E6 | gate mơ hồ | **AND**: `confirmed` ∧ `observation_kind=="detection"` ∧ `association_state∉{split_recovering,occluded_prediction,watershed_provisional,frozen_ambiguous,ambiguous_merged}`; rồi `fragment_obs≥5` ∧ `disp≥max(6,0.15·diag)` — chỉ chặn **mint GID mới**, GID cũ vẫn bind qua handoff/Re-ID | role/pseudo/samples/storyboard |
| E10 | một terminal | `exited` (qua exit-zone) ≠ `expired` (retention cleanup); `parked`/`recovery_pending`/`parking_verification_pending` là **state thật ghi đè** identity.state + reset dormant clock; dormant→active revive được, exited/expired bị skip | role/pseudo/samples/storyboard |

Tất cả 8 (+B5/B10/B11 liên quan) đã assert trong `_verify4.mjs`. **Lưu ý sau merge (§2f)**: B5, B7, B8, B10, B11 được thay nguyên theo `motion-binder-correction-a.md` — số B11 hai chiều `0.0826/0.6257` và B8 `0.649` trong bảng trên là **trạng thái vòng này**, đã superseded bởi B11 4-term `0.1553/0.6889` và B8 `0.2809`.

### 2d. Cross/calibration review của C (`cv-crosscal-review-c.md`) — 10 mục đã patch + verify

| ID | Verdict C | Sửa theo source | Patch |
|---|---|---|---|
| E1 | PARTIAL | fallback **`crop_origin + local_px`** (`camera_crops`, `:1376-1377`), tuple thường — **không có cờ `approx`** (đã xóa khỏi contract; badge UI chỉ là `[sim]` chú thích) | role/pseudo/samples/storyboard |
| E2 | FAIL | `t_edge`/`lookahead` đơn vị **frames**: `dist_px/v_px_per_frame ≤ lookahead_frames=16`; gate `|v|>1.0` (bbox) / `speed_towards>0.1` (custom-mask); TTL `handoff_ttl=45` frames vs `handoff_ttl_seconds` tuỳ chọn | role/input/pseudo/samples/storyboard |
| E3 | FAIL | fallback **frame**: `elapsed=frame_idx−updated_at_frame` → `pred=last+vel_per_frame·elapsed`, **không `/fps`**; nhánh timestamp chỉ khi `handoff_ttl_seconds` set, vel=`velocity_world_per_second` else `vel·25.0` | role/pseudo/samples/storyboard |
| E4 | PARTIAL | cost literal `0.55·res/radius+0.30·app+0.10·size+0.05·dir` (`:3017`), reject `>0.92` (`cost_limit=0.92` `:3615`); hard gates trước cost: `prediction_distance`/`outside_entry_corridor`/`outside_overlap`/app`>0.45`/size`>0.90`/dir`<0.25`/`identity_waiting`/`occluded`; `cost→10` chỉ là `[sim]` hiển thị | pseudo/gates/samples/storyboard |
| E5 | PARTIAL | **3 đường tách**: A calibrated unique-unbound `:4022-4315` (chỉ đường này có duy nhất 2 chiều); B pair→GID greedy sorted-cost `:6206-6311` (+`_leaves_reserved_slot`); C single-join `:6312-6356` **disabled khi `camera_transforms` non-empty** | role/pseudo 3 nhánh/samples/storyboard |
| E8 | PARTIAL | score **6 term** `0.35·dist+0.25·app+0.15·dir+0.10·speed+0.10·min(time,topology)+0.05·size` (`:395-401`); hard rejects `teleport`/`camera_topology`/`stable_wrong_direction` (`:387-393`) | pseudo/samples/[sim-omits]/storyboard |
| F3 | FAIL | `reviewed_fit` standalone → **reject**: chỉ hợp lệ trong nhánh `rectangle_line_v1` (status+`visual_review.accepted`+`fit_ready`+`point_count==8`+cams+`fit_gate` sạch, `:287-300`); còn lại cần `status=="passed"` (`:301-304`); + `camera_transforms=={cam1,cam2}`, adjacency exact, polygon≥3, exit_zones | role/pseudo 6 gate/samples/storyboard |
| F4 | PARTIAL | `SLOT_MATCHING_MULTIPLES{handoff 1.75, pred_radius 2.75, dormant 1.75, duplicate 0.50}` (`:387-392`); median trên **minAreaRect long edge**; `resolve`: override→cfg-None→derived/fallback→**`min(configured,derived)` ceiling** | role/pseudo/samples/storyboard |
| F5 | FAIL | không có gate `% deviation`: `|aspect−|>0.005` → reject + `|sx−sy|>max·0.005` → reject; uniform resize adapt bất kể độ lớn; **`H'=H@diag(sx,sy,1)` nhân phải** (cột translation giữ nguyên) | role/pseudo/samples/storyboard |
| F8 | PARTIAL | **không có `job_seq`/`applied_seq`**: (a) `parking_futures` 1 pending job/cam (`:2628`); (b) `accept_evidence` monotonic → `evidence_not_monotonic`; (c) `result_age=max(cam_ts−job.ts, mono−submitted)>parking_max_result_age_seconds` → `result_too_old`; (d) pending quá hạn → `worker_over_deadline` | code-refs/role/pseudo/samples/storyboard |

PASS không cần sửa theo C: E7, E9, F1, F2, F6, F7. Tất cả 10 mục assert trong `_verify4.mjs` — 51 assertion mới (§2). Fixture bắt 2 lỗi sim của chính B trong quá trình viết (E2 công thức cạnh trái; F5 `H@S` vs `S@H` — dossier Sample A ban đầu ghi sai ma trận kết quả) — đã sửa cả dossier lẫn fixture trước khi nộp.

Sample số đã kiểm chứng và ghi vào Expected: A2 counts 4/4/6 và 4/0/4; A3 rescue (compPx=4, strict=2<3, ctx=4≥3); A4 20/4→18/2→21/1; A5 gate order có `oversized`; A7 median; A8 `has_bg:false → comp=1, rescued=false`; A11 tie-break ratio 2.0>1.8→merged; B1 trace `[11,10,1,0]→[12.5,10,1.5,0]→[14,10.5,1.5,0.5]` + coast `(15.5,11)→(17,11.5)`; B4 IoU 0.333/0.25/0; B6 exact solver 2 case + counterexample greedy 1.0>optimal 0.9 (đã verify, greedy chỉ là đối chiếu có nhãn); B7 split-only margin `0.08·(2−0)=0.16`, r0 `0.02<0.16` defer / r1 `0.59≥0.16` keep, not-in-split keep; B8 anchor `gate=min(20,max(3,1.5))=3`, `d=1.803`, `cost 4-term=0.2809`, `lost 2.0>1.5` skip; B9; B10 `BC=0.866`→`d=√0.134=0.366`, quality hard-0 `area<200`/`fg<0.15`; B11 4-term `0.1553`/`0.6889`; C2 votes=3<5; C3; C5 timestamps + no-flip; D1 qualify + `score=0.862`, `slot_overlap≈0.309` và edge `vo=0.16` center-out→`None`; D3 `score=0.6123` + margin `0.0623<0.15` reject; D4 detach `vehicle_id=None`+`recovery_pending`; D5 `r95=0.20 stopped` / `r95=4.29 + inlier 0.83 → stable`; D7 radius `[5,25,45,45]` + guard `2.6>2.5`; D8 signed−1+overlap0.10→keep, signed−11→skip, ambiguity `0.10<0.15`; D9 `cost=0.3093` / `insufficient_outward_evidence`; D10 consume→`released` / `col_gap 0.04<0.15` ambiguous; E1 `(20,30)` + fallback `(35,45)` không cờ; E2 `t=1.25 frames`, `|v|≤1.0→None`, left `22.5>16`; E3 frame `elapsed12→102.4` + ts `2.0·1.2→102.4`; E4 `cost 0.201/0.4575`, gates `prediction_distance`/`direction`; E5 unique `a1-b1` / ambiguous `0` / greedy `b1` / join-disabled; E6; E7 revive vs stale; E8 `score 0.72` 6-term + `camera_topology`/`stable_wrong_direction`; E9; E10; F1; F2 literals; F3 `passed→ok`, `reviewed_fit standalone→reject`; F4 `median 500→{875,1375,875,250}` + `min(1000,875)=875`; F5 `uniform 2×` + `H@S=[[4,0,10],[0,4,20],[0,0,1]]`, aspect `0.0508>0.005→reject`; F6 catch-up 2 reads→synced / 3 reads→best-effort; F7 events JSON hợp lệ; F8 `age 0.3 accept`/`3.0→result_too_old`/`evidence_not_monotonic`/`worker_over_deadline`/1-pending; F9 pairing index↔CSV + `due=wall+(src_now−src_start)` + extra-frame error.

**Sample B delta → JSON độc lập**: A7 (sửa `//` comment trong JSON → mảng hợp lệ), A8, A11, B1, B8, D5, D6, D9 — tất cả sample giờ thực thi được standalone.

**Còn lại**: một số Expected phi-số (chuỗi trạng thái, verdict) được kiểm chứng bằng đọc code, không có fixture số — ghi `(verify)` theo truy vết source.

### 2e. Vòng fix format/numeric chắc chắn (trong lúc chờ replacement của A)

LEAD chỉ đạo: KHÔNG broad-rewrite 19 section của `cv-motion-binder-review-a.md` — A đang viết `motion-binder-correction-a.md` replacement-ready, B chỉ sửa tồn tại format/numeric chắc chắn:

| Chỗ | Lỗi | Sửa |
|---|---|---|
| E5 Sample B | input delta `"tracksB":[...]` không standalone | JSON đầy đủ `tracksA/tracksB/radius/pair_costs`; expected 2 verdict khác nhau trên cùng input (path A skip ≠ path B b1) |
| F3 Sample B | `edge_adjacency:[...đúng...]` không phải JSON | chèn array adjacency đầy đủ (giống Sample A); verdict reject giữ nguyên (adjacency hợp lệ **vẫn** reject vì `reviewed_fit` standalone) |
| F6 Sample B | thiếu `ts`/`max_skew_ms`/`max_reads` | JSON đầy đủ; per-read skew `280→270→260ms` (verifier bắt lỗi `298/297/296` B viết nhầm → sửa thành 260 đúng) |
| F7 Sample A | `needs_frame@0.35=true` **sai predicate**: `0.35−last_submitted(0.3)=0.05 < 0.15` — interval đo từ publish **được nhận**, không từ request | expected → `false@0.35` + probe `true@0.45` (0.15 ≥ 0.15 — **đúng biên inclusive**, khớp assertion C); events JSON thêm 2 op `needs_frame` |

+15 assertion trong `_verify4.mjs` (E5B×3, F3B×2, F6B×3, F7×7); fixture tự bắt 2 lỗi sim lần đầu (`lastSub=0` đụng sentinel → init `-1`; skew 296→260) — sửa xong mới nộp.

**Finalcheck của C** (`cv-crosscal-finalcheck-c.md`, LEAD đã duyệt): **10/10 correction C CLOSED**; 2 OPEN → đã sửa:
- **OPEN-1 E8**: `[sim]` aside 3-term `(0.9, 0.8, 0.6)·w[0.5,0.3,0.2]` = `0.45+0.24+0.12` → ghi **`0.81`** (trước `0.75` sai).
- **OPEN-2 F7**: `needs_frame@0.35` = `false` (đã sửa ở vòng trên); probe thứ hai chuẩn hóa thành **`@0.45 = true`** theo assertion của C — đúng biên `0.15 ≥ 0.15` inclusive.
`finalcheck-verify-ef-c.py` (C-owned, **64/64 PASS**, không sửa) + `_verify4.mjs` (+1 E8-aside, F7 probe → 115/115 ở thời điểm đó — count đã thay đổi sau merge, xem §2f). `cross-verify-c.py` lịch sử vẫn superseded — không dùng approve vì provenance không byte-identical (§6.4).

### 2f. Merge `motion-binder-correction-a.md` (đã LEAD duyệt) — 19 section thay nguyên

| Hạng mục | Chi tiết |
|---|---|
| Sections merged | A1, A2, A5, A7, A9, A10, A12, B5, B7, B8, B10, B11, D1, D3, D4, D7, D8, D9, D10 — splice nguyên spec của A, giữ nguyên numeric/verdict đã 95-assert verify; file `motion-binder-correction-a.md` + `verify-motion-binder-a.py` **không sửa** |
| Completeness khi merge (theo chỉ đạo LEAD) | **D1 Sample B**: thêm `slot_poly/slot_center/vo_min/vo_strong`; expected output dùng tên production `vehicle_overlap`/`slot_overlap` (không `vo`/`so`). **B8 Sample B**: thêm `track.last_meas/clean_wh/invisible/max_dist_demo` tường minh cho 2 case. **D9 Sample B**: thêm `token{center,diag,radius,max_radius,confirmed_empty}` + `is_cross/first_signed/first_bbox_overlap/world_ready` — độc lập, không lấy ngầm Sample A |
| Dọn khi merge | xóa khối "Ghi chú merge" meta của file replacement khỏi cuối D10; sửa luật mô phỏng §0 `d=1−Σ√` → **`√(1−Σ√)`** cho khớp B10 mới; mục 5 dossier đánh dấu lại params đã trích literal (B5/B7/B8/D3/D7/D9) |
| Assert superseded | B5 `0.5+0.2·d/3`, B8 `0.649`, B10 `1−BC`, B11 `nnMed-max 0.0826/0.6257`, B7 margin-mọi-cặp — **đã thay bằng assert formula sau merge trong `_verify4.mjs`**; không claim 115 như bằng chứng hiện hành |
| Kết quả verify | `node _verify4.mjs` **163/163** · `python verify-motion-binder-a.py` **95/95** · `python finalcheck-verify-ef-c.py` **64/64** — tất cả chạy thật |

## 3. Khác biệt code vs mô phỏng (đã ghi nhãn, không "giống hệt")

| Thuật toán | Production | Demo (ghi trong `[sim-omits]`/`complexity.simulation`) |
|---|---|---|
| A1 MOG2 | Gaussian-mixture per-pixel (N state) | 1 bg/pixel |
| B1 Kalman | OpenCV KalmanFilter + covariance/noise | α-β state, nêu rõ omitted matrices |
| A11 occlusion | `cv2.distanceTransform+watershed` | Voronoi-cut |
| B6/D2/D10/E4 LAPJV | `lap.lapjv` O(n³) | exhaustive exact O(n!), **chỉ ≤5×5**; greedy chỉ là đối chiếu có nhãn + counterexample |
| C2 ensemble | 25 biến thể gamma×CLAHE trên ảnh thật | `ratios[]` đã tính sẵn |
| D1 geometry | `cv2.intersectConvexConvex`/pointPolygonTest | raster-cell inclusive-grid; bbox `xywh` |
| F9 replay | CSV monotonic_ns ↔ video index | mảng `{id,ts}`; **không** `t=n/fps` synthetic |

## 4. Điểm review đã đóng

- `use_deep_reid` ValueError đúng `CrossCameraManager.__init__` `cross_camera_manager.py:391-395` (không phải motion_tracker).
- F6: `synchronize_live_frames` **chủ động catch-up** ≤ `max_catchup_reads` (=3 literal), hết quota → best-effort — không phải chỉ warn.
- F7: `needs_frame` = subscriber liveness (`_frame_requested_at` ≤5s) ∧ interval elapsed — **không** nghĩa consumer xử lý xong; sample JSON quote đầy đủ + events/time.
- F9: pair theo index↔CSV timestamps ghi; `--replay-realtime` pace theo timestamp; EOF sạch→None, dư/thiếu→RuntimeError; alias→`replay-timestamp-pairing` (C).
- Số đếm: 58 mục (A12+B11+C5+D11+E10+F9); SPEC canonical CV = 57.
- Mọi ngưỡng chưa đối chiếu literal đánh `~` demo parameter + liệt kê ở mục 5 dossier (không claim exact).

## 5. Contract readiness cho `algo-web` (SPEC §4–5)

- `codeRefs`: path/line/symbol đã có — cần map line→`line`/`endLine` số nguyên khi xuất JSON.
- `complexity {time, space, variables, simulation}`: time+space rõ; `variables` cần đặt tên biến chính thức khi xuất.
- `simplifications[]`: ánh xạ trực tiếp từ `[sim-omits]` + `[sim]` mỗi entry.
- `scenarios[]`: Sample A→default, Sample B→`edgeCase:true`; `input`/`expected` đã deterministic.
- `buildTrace`: pseudocode đánh số → `activeLines`; bảng realtime trong storyboard → `state`/inspector fields.
- `draw`: storyboard đủ chi tiết objects/màu/motion để cài theo palette engine.
- `registerPack`: 57 trang CV → `packs/cv.js`; F9 **không** phải trang CV — canonical `replay-timestamp-pairing` thuộc `packs/integration.js` (owner C), B giữ code-refs để không mất coverage.
- Solver exact ≤5×5: limitation ghi ở B6/D2/D10/E4 + mục 6 dossier — bắt buộc badge khi render.

## 6. Blockers / chưa xác minh

0. **PHASE 1 B — ĐÃ MERGE ĐỦ, CHỜ VERDICT CUỐI CỦA LEAD** — `cv-source-review-a.md` (8 finding), `occupancy-correction-c.md` v1.1 (C1–C5), `cv-crosscal-review-c.md` (4 FAIL + 6 PARTIAL), `cv-crosscal-finalcheck-c.md` (10/10 CLOSED + 2 OPEN đã sửa), `cv-motion-binder-review-a.md` revised (đã LEAD duyệt) **đã đóng và patch xong**. `motion-binder-correction-a.md` (19 section) **đã merge vào `builder-b.md`** kèm 3 completeness patch + dọn meta-note/stale-rule (§2f). Bằng chứng hiện hành toàn xanh: `_verify4.mjs` **163/163** (B — assert pre-merge B5/B7/B8/B10/B11 đã thay, không claim 115), `verify-motion-binder-a.py` **95/95** (A, nguyên trạng), `finalcheck-verify-ef-c.py` **64/64** (C, nguyên trạng). Không còn finding mở trong các review đã giao; trạng thái PASS cuối cùng do LEAD quyết định.
1. **Demo parameters**: ~20 ngưỡng/weights đánh `~` chưa trích literal (danh sách mục 5 dossier) — **nhóm C đã trích literal** (`ratio_thr=0.20`, `edge_thr=0.25`, `border_ignore_ratio=0.12`, `core_scale=0.55`, span/thickness 0.45/0.18, core 0.18/0.08/0.30, `smoothing_frames=5`, `occupied_seconds=0.5`, `empty_seconds=1.0`, `stable_evidence=False`, `required_votes=V//2`); còn `V_demo=9` là giản lược (production 25) — Phase 2 phải hoặc đọc source/config, hoặc hiển thị nhãn "giá trị mô phỏng".
2. **F9 canonical content**: nội dung đầy đủ của `replay-timestamp-pairing` do C sở hữu (dossier `builder-c.md` entry E1) — B chỉ giữ refs; page canonical không được dựng từ mục B.
3. **Không có bằng chứng chạy**: phase này không chạy test/service (đúng ràng buộc); `448 passed` là kết quả đã ghi ở `.analysis/builder-b.md` trước đó, không claim lại.
4. **Fixture provenance — báo cáo trung thực**: `cross-verify-c.py` (C, độc lập) từng bị B **patch nhầm** ở vòng trước rồi revert; trạng thái hiện tại của file: đa số section nguyên bản (B2 scalar `4·e^(−a/0.25)`, B3 `37.5`, B9 `expired`-state, C1–C4 mẫu cũ) **cộng** tail B11 hai chiều `dAB/dBA` + B6 counterexample + C5 `dwell_series` — các phần tail này khớp nội dung patch B đã viết trước đó (đồng thời khớp semantics v1.1 của chính spec C); không xác nhận được tail có byte-identical bản gốc (read ban đầu bị truncate vùng C5). File chạy toàn PASS ở trạng thái hiện tại; **B không sửa thêm** theo chỉ đạo ownership — nếu C cần khôi phục byte-exact, C tự xử lý. `_verify{1,2,3}.mjs` (B) đóng băng làm bằng chứng vòng trước — chứa assert đã superseded (bảng §2). **Bằng chứng hiện hành của B: `_verify4.mjs` 163/163 PASS** — 115 assert trước đây đã thay các case superseded (B5/B7/B8/B10/B11 formula cũ) + thêm 35 assert cho 14 section merged có số mới; bằng chứng độc lập của A cho 19 section merged: `verify-motion-binder-a.py` **95/95 PASS** (file A nguyên trạng); bằng chứng độc lập của C cho nhóm E/F: `finalcheck-verify-ef-c.py` **64/64 PASS** (file C nguyên trạng — `cross-verify-c.py` lịch sử không dùng approve vì provenance không byte-identical).
5. **Source-reviewed, chưa runtime-tested**: 8 correction theo `cv-source-review-a.md` (B2/B3/B9/D5/D6/D11/E6/E10) đã đối chiếu trực tiếp với code tại các dòng đã cite + assert bằng sim deterministic trong `_verify4.mjs`, nhưng chưa chạy unit-test production (ngoài phạm vi phase).
6. **Web app**: chưa tồn tại, chưa có browser QA — dossier chỉ mô tả contract để Phase 2/3 cài.
