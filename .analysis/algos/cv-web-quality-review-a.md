# Review chất lượng pack `cv.js` (builder B) — reviewer A

**Bản review hiện tại (re-audit #3 — FINAL freeze của B):** `algo-web/packs/cv.js` sha256 `27b693e84ff600d3`, 402 497 bytes / 4 911 dòng. Snapshot `.analysis/algos/_cv-snapshot.js` — audit tái chạy: `node .analysis/algos/audit-cv-pack.mjs` → **0 issues** / 574 legal-param checks.
**Bản review vòng 3 (đã qua):** md5 `f5d3fb436a75ad5b54d1046d9045502a`, 402 014 B / 4 910 dòng — đóng §3.7, verify MOG2 legend/count.
**Bản review vòng 2 (đã qua):** sha256 `de1c33bfca37c994`, 4 883 dòng — re-audit sau freeze lần 1 của B (đóng §3.1-3.4 form, mở §3.7).
**Bản review vòng 1 (đã qua):** sha `1efe8a0b092dc0fc` @`2026-10-04T07:55:16Z` — findings gốc giữ tại §3 để đối chiếu closure.
**Phạm vi:** chỉ đọc/review pack + đối chiếu dossier/SPEC; không sửa `cv.js`, shell, engine hay source sản phẩm; không cài dependency.

## 1. Tổng quan verdict

| Tiêu chí | Kết quả | Evidence |
|---|---|---|
| 57 canonical IDs | **ĐỦ** — khớp SPEC §cv inventory, 0 alias lẫn | eval registerPack |
| Metadata SPEC §4 | **OK** — `L()` map `pipelineRole→role`, `inputSchema→inputTypes`, `dataStructures→structures`, complexity tra bảng `CX[]` riêng | `cv.js:883-911` |
| Scenario `normal`/`edge` | **HỢP LỆ** (LEAD xác nhận; `edgeCase` boolean đúng) | `cv.js:898-905` |
| `trace.expected ≡ scenario.expected` | **OK** trên 116 scenario — `mkTrace` trả `sc.expected` + `chkEach(result, expected)` so từng key; result tính thật | `cv.js:226-260` |
| Checks đổ xanh ở default | **116/116 scenario** pass, 0 check FAIL | audit |
| `activeLines ⊆ pseudocode` | **OK** toàn bộ (emit normalize index→'pN', default `[0]`) | `cv.js:230-238` |
| `draw()` | **OK** — `drawScene` dispatch 11 scene type; 411 frame, 0 throw, 0 frame rỗng lệnh vẽ | `cv.js:780-790` |
| Frame ≥3/scenario | **CLOSED** — 0 vi phạm / 116 scenario, 411 frame (v1: 4 lesson ở 2f) | §3.2 |
| `metrics` trong frame | **CLOSED** — 0/411 frame thiếu metrics (v1: 383/383 rỗng) | §3.1 |
| Invariants khi đổi params | **CLOSED** — 572 legal-param checks, 0 fail; 2 công thức sai đã sửa | §3.3, §3.7 |
| `state` inspector | **CLOSED** — 0 frame computed-data còn `state:{}` (v1: 95) | §3.4 |
| Param domain | **CLOSED** — `close_k` step 2 → {1,3,5}; input lẻ-domain ngoài step clamp về k lẻ, 0 throw | §3.7 |
| MOG2 visual + rcs gate | **VERIFIED** — legend 0/127/255, enriched fixture có 127 thật (`n127=1`), `fg_count=5` độc lập đúng (4+1 gộp), `rcs=false → 4` | §3.8 |
| Độ trung thực thuật toán | **Cao** — tính thật, expected literal khớp dossier đã sửa | §2 |

## 2. Độ trung thực thuật toán (ưu tiên LEAD chỉ định)

Đối chiếu trực tiếp code pack với dossier đã duyệt + correction replacement:

| Lesson | Đánh giá | Evidence |
|---|---|---|
| `mog2-foreground-mask` | Thật: vòng lặp per-pixel `\|frame−bg\|>threshold`, mask 3 mức, `bg+=α·Δ` — `[sim]` 1 giá trị/px thay K-Gaussian **đã khai báo** | `cv.js:965-993` |
| `temporal-motion-gate` | Thật: diff tới 2 ref, OR union, "đóng hoàn toàn khi references rỗng" đúng source | `cv.js:1022-1050` |
| `foreground-morphology` | **Pixel-true**: tự cài erode/dilate/connected-components trên lưới — OPEN xóa speckle, CLOSE nối mảnh, kết quả khớp expected | `cv.js:1157-1207` |
| `kalman-constant-velocity` | α-β filter β=0.5 thay Kalman gain — **declared `[sim]`/`[sim-omits] F,P`**; trace state thật theo residual; coast đúng | `cv.js:1728-1774` |
| `prediction-age-decay` | **Đúng bản sửa**: merged-freeze → raw không decay, conf tuyến tính (không exp), `stale_prediction` | `cv.js:1780-1840` |
| `association-cost-matrix` | **Đúng bản sửa**: 4-term `[0.45,0.25,0.20,0.10]`, size_error `|ln r|/|ln 2.80|`, fail-gate→10, expected `0.3669` khớp verifier | `cv.js:1991-2062` |
| `lapjv-assignment` | **Xuất sắc**: vét cạn thật có pruning theo limit, từng ứng viên một frame (≤8), running-best, counterexample greedy-vs-exact; `[sim]` O(n!)↔O(n³) khai báo rõ | `cv.js:2092-2148` |
| `assignment-margin-ambiguity` | **Đúng bản sửa**: chỉ `split_margin` tracks qua gate, margin `0.08·(2−lineage)` | `cv.js:2152-2240` |
| `stale-anchor-reacquire` | Cost dùng công thức thường (không floor+w·d), expected `0.2809` khớp verifier | `cv.js:2233` |
| `track-lifecycle` | FSM thật per-frame, `expired`=event không enum, tentative không→lost, re-confirm; state `{status,inv}` thật | `cv.js:2328-2372` |
| `hsv-lab-descriptor` | **Đúng bản sửa**: `d=√(1−BC)=0.366`, quality `0.5·size+0.3·fg+0.2·aspect` + hard-zero | `cv.js:2375-2460` |
| `tracklet-gallery-match` | Expected `0.1553`/`0.6889` khớp script verify; distance 4-term đúng | `cv.js:2463-2464` |
| `merged-blob-assignment-guard` | **Đúng bản sửa**: excess per-axis `≤\|v_axis\|·span+0.3·size` (không cos), gate valid/recovering | `cv.js:1654-1708` |
| `slot-overlap-geometry` | Output keys `center_proximity`, score `0.862` khớp bản sửa | scenario run |
| `arrival-claim-qualification` | Score `0.6123` khớp verifier | `cv.js:3043` |
| `vision-primary-fusion` | `vehicle_id=None` ngay khi vision empty — đúng finding D4 | `cv.js:3163` |
| `stop-dwell-detection` | `inlier_ratio` + `r95` đều có (median-endpoint semantics của bản sửa) | `cv.js:3232` |
| `sticky-id-bind-release` | **Đúng bản sửa**: detach ngay empty đầu, token-rollback không countdown, `sticky_id_conflict`/`competing_vehicle` | `cv.js:3238-3315` |
| `departure-token-lifecycle` | Radius `diag·lerp(0.05→0.45)` đúng bản sửa | `cv.js:3318+` |
| `recovery-candidate-gates` | `signed distance` radius, `0.3093` khớp | `cv.js:3475` |
| `recovery-batch-assignment` | `limit=0.999` literal + ambiguity margin + consume→`released` | `cv.js:3556-3610` |
| `handoff-lapjv-matching` | Gates TRƯỚC cost đúng thứ tự, `0.55·res/radius+0.30·app+0.10·size+0.05·dir`, expected `0.201/0.4575` tính tay khớp | `cv.js:3865-3924` |
| `overlap-simultaneous-pairing` | 3 path A(mutual-unique)/B(greedy)/C(disabled) — cùng input 2 verdict dạy đúng | `cv.js:3927-4010` |
| `homography-fit-distributed` | DLT affine thật + residual/det; `[sim-omits] RANSAC` khai báo | `cv.js:4317-4378` |
| `matching-distance-derivation` | 4 multiples + resolve `min(configured,derived)` ceiling đúng | `cv.js:4495-4578` |

**Kết luận phần 2:** pack phản ánh đúng dossier ĐÃ SỬA trên toàn nhóm ưu tiên — không thấy dạy ngược còn sót. Simplification đều minh bạch `[sim]`/`[sim-omits]` — theo LEAD là được phép, không yêu cầu port OpenCV.

## 3. Findings — trạng thái sau re-audit #2 `f5d3fb43` (v1 áp `1efe8a0b`, v2 áp `de1c33bf`)

### 3.1 [BLOCKER → CLOSED] `metrics` rỗng trên 383/383 frame

SPEC §5 liệt kê `metrics: array {label,value,unit?}` là thành phần frame "để đọc nhanh". `F()` hỗ trợ (`cv.js:183`) nhưng **không một emit nào truyền metrics** → dải metric của inspector trắng toàn pack. Acceptance: mỗi frame có ≥1 metric có nghĩa (giá trị bước đang tính — ví dụ `{fg_count}`, `{cost}`, `{invisible}`, `{verdict}`), audit đếm `withMetrics > 0` trên mọi lesson.

**Re-audit `de1c33bf` → CLOSED.** `mkTrace` giờ auto-derive metrics từ `state` khi emit không truyền (`cv.js:240-248` — number/boolean/string≤24/array≤6/JSON≤48, cap 4). Đếm runtime: **0/409 frame thiếu metrics**. Inspector strip có số thật theo bước.

### 3.2 [BLOCKER → CLOSED] 4 lesson <3 frame/scenario (SPEC §5 min 3)

`merge-alias-resolution`, `global-identity-lifecycle`, `latest-frame-mailbox`, `stale-evidence-health-gating` — mỗi lesson emit đúng 2 frame cả 2 scenario. Hai bài sau nặng hơn số đếm: `latest-frame-mailbox` replay **7 sự kiện** gộp trong 1 emit (`log.join(' → ')`) và `stale-evidence-health-gating` chấm 3 case trong 1 emit — viewer không bước từng sự kiện/case được. Acceptance: mỗi sự kiện/case 1 frame (hoặc ≥3 frame có nghĩa input→tính→kết quả).

**Re-audit `de1c33bf` → CLOSED.** 0/116 scenario <3 frame. Đúng hướng đã yêu cầu: `global-identity-lifecycle` 7/4 frame, `latest-frame-mailbox` 9/4 frame — tách **per-event** chứ không pad; `merge-alias-resolution` 3/3, `stale-evidence-health-gating` 3/3 (mỗi case 1 frame).

### 3.3 [HIGH → form CLOSED, còn 2 công thức sai — §3.7] 16 invariant `pass:true` hardcode → self-PASS khi đổi params

Khi params khác default, `mkTrace` trả `checks = invariants` do lesson tự khai (`cv.js:255-257`). 16 invariant ghi `pass: true` cứng — check luôn xanh bất kể dữ liệu:

| Lesson | Invariant cứng | Có thể tính thật bằng |
|---|---|---|
| `kalman-constant-velocity` :1772 | `coast giữ nguyên v` | `st[2]===prev[2] && st[3]===prev[3]` |
| `prediction-age-decay` :1831 | `merged → raw` | `point === raw` |
| `track-lifecycle` :2370 | `tentative không → lost` | `states` không chứa `'tentative→lost'` (invariant 2 trong file đã tính thật — mẫu để theo) |
| `slot-roi-precompute` :2596 | `fallback kích` | `result` có flag fallback |
| `border-line-filter` :2750 | `vehicle_like_core bảo vệ` | `stats.some(vehicleCore)` |
| `temporal-smoothing-dwell` :2888 | `AND-gate` | `verdict === (count_ok && duration_ok)` |
| `slot-track-batch-match` :3023 | `unassigned phí limit` | `total ≥ Σ(cost + limit·unassigned)` |
| `vision-primary-fusion` :3163 | `occupied = vision` | `result.occupied === !!inp.vision` |
| `stop-dwell-detection` :3232 | `outlier không phá` | `stable_strong` hoặc so r95/inlier |
| `sticky-id-bind-release` :3313 | `empty đầu → detach` | `transitions.indexOf('token+detach')` đúng vị trí |
| `predeparture-candidate-guard` :3548 | `outward fail` | `reason` ∈ outward khi đi vào ô |
| `parking-episode-state` :3661 | `released terminal` | `states[states.length-1]==='released'` |
| `overlap-simultaneous-pairing` :3995 | `A ≠ B` | `aMerge !== bMerge` |
| `latest-frame-mailbox` :4751 | `latest-only` | `pending === last non-drop frame` |
| `stale-evidence-health-gating` :4803 | `1 pending/cam` | `pending ≤ 1` theo trace |
| `ensemble-threshold-voting` :1271 | `reject:motion khi fill<min` | so `verdict` vs `fill/min_ratio` |

Acceptance: mọi `invariants[].pass` là biểu thức tính từ `result`/`state` — không literal `true`.

**Re-audit `de1c33bf` → CLOSED về mặt form.** Toàn source: **0 literal `pass:` value** trên **122 block `invariants:`** — mọi `pass` là biểu thức theo `rows`/`result`/`state`/`P.*`. Nhưng sweep động 572 invariant-check trên mọi giá trị param hợp lệ lộ **2 invariant biểu thức thật nhưng sai logic** (fail khi params đổi — xem §3.7) + **1 lesson throw**. Tức self-PASS đã đóng, nhưng "biểu thức có" ≠ "biểu thức đúng" — 3 case cần B sửa công thức/miền param, không phải thêm literal.

### 3.4 [MEDIUM → CLOSED] 95 frame có computed-data nhưng `state:{}`

SPEC §5: `state` biểu diễn cấu trúc dữ liệu hiện tại cho inspector. Các frame sau đã tính giá trị (hiện trong scene/explanation) nhưng inspector `{}` — đáng mirror state (danh sách đầy đủ 95 frame trong audit; nhóm nặng nhất là frame GIỮA chuỗi tính):

- `foreground-morphology` normal+edge **f0–f2** (m0/m1/m2 counts đã tính)
- `contour-geometry-filter` **f0–f2**, `motion-echo-suppression` **f1,f2**, `hsv-lab-descriptor/edge` **f0–f2**, `recovery-batch-assignment` **f0–f2**, `ensemble-threshold-voting` f1, `border-line-filter` f2, `core-rescue-vote` f1/f2, `stale-anchor-reacquire` f1,f2, `prediction-age-decay` f1,f2, `occlusion-group-guard` f1, `cast-shadow-discriminator` f1, `bottom-center-anchor` f1, `tracklet-gallery-match` f1, `slot-track-batch-match` f1, `vision-primary-fusion` f1, `predeparture-candidate-guard` f1, `world-trajectory-match` f0–f2, `overlap-simultaneous-pairing` f0,f1, `handoff-lapjv-matching` f0, `homography-fit-distributed` f2/edge-f1,f2, `frame-size-adaptation` f0,f1, `camera-skew-synchronization` f4/f5, `latest-frame-mailbox` f1, `stale-evidence-health-gating` f0,f1, `matching-distance-derivation` f0, `merge-alias-resolution` f1, `parking-episode-state` f3, `departure-token-lifecycle` f6, `recovery-candidate-gates` f2, `global-id-allocation` edge-f2, `dormant-identity-reid` f1,f2, `mog2-foreground-mask` f0, `temporal-motion-gate` f0, `calibration-load-validation` edge-f2, `rectangle-line-fit-gate` f2.

Không yêu cầu bịa state cho frame transient (5 frame còn lại trong audit: border-line f1, departure-token edge-f2, predeparture f2 — scene/explanation không mang data thật thì để `{}` là đúng).

**Re-audit `de1c33bf` → CLOSED.** Runtime sweep 409 frame: **0 frame `state:{}`**, 0 frame có scene-data mà state rỗng — emit giờ mirror state thật (stateKeys mẫu: `W,H,fg,bg,verdict,cost,tracks,comps,inliers…`). Metrics auto-derive cũng dựa trên state này (§3.1) → inspector hiển thị đúng dữ liệu bước.

### 3.5 [LOW] `emit([2],…)` lặp cùng pseudocode line

`matching-distance-derivation/edge` emit 3 frame liền cùng `[2]`; hợp lệ contract nhưng tô cùng 1 dòng pseudo cho 3 quyết định khác nhau. Nên tách `p3` thành resolve-step phụ nếu muốn inspector theo nhánh. Không bắt buộc.

### 3.6 [INFO] 17 lesson `parameters: []`

`bottom-center-anchor, iou-overlap-score, association-cost-matrix, core-rescue-vote, vision-primary-fusion, sticky-id-bind-release, recovery-candidate-gates, parking-episode-state, world-projection-anchor, handoff-prediction-corridor, merge-alias-resolution, global-identity-lifecycle, homography-fit-distributed, rectangle-line-fit-gate, calibration-load-validation, matching-distance-derivation, frame-size-adaptation` — hợp lý cho thuật toán ngưỡng cố định; không vi phạm SPEC. Ghi nhận để C không báo lỗi "không có param".

### 3.7 [CLOSED trên `f5d3fb43`] 3 lỗi lộ ra khi sweep 572 invariant-check trên giá trị param HỢP LỆ (`de1c33bf`)

**Re-audit `f5d3fb43` → cả 3 CLOSED, 0 issues / 572 checks.** Evidence từng case:

**a) [BLOCKER → CLOSED] `foreground-morphology` — `close_k` chẵn throw TypeError**
- Param cũ: `param('close_k','CLOSE kernel',3,1,5,1)` → miền `{1,2,3,4,5}` mà kernel chỉ xử lý k lẻ → `close_k=2,4` → `TypeError` tại `dilate`/`erode`.
- **Fix của B (verified):** param giờ `step:2` → miền hợp lệ `{1,3,5}` khớp đúng khả năng kernel. Input ngoài-step (2,4 — không còn hợp lệ theo contract) được **clamp về k lẻ gần nhất** (`2→3`, `4→5`) thay vì throw: `close_k=2 → state.k=3`, `close_k=4 → state.k=5` — validate êm đúng nguyên tắc "input invalid-UI phải reject nhẹ, không throw console".
- Sweep `k∈{1,2,3,4,5}`: **0 throw**, mọi checks pass; `k=1` (half=0, no-op) cũng chạy đúng → `px:18, comps:2` (CLOSE không đổi gì, hợp lý).

**b) [MEDIUM → CLOSED] `contour-geometry-filter` — invariant `reject:motion` sai công thức**
- Cũ: khẳng định `reject:motion ⟹ (px≥min ∧ fill<ratio)` trong khi gate thật reject `motion<min ∨ fill<ratio` → comp1 (motion=2<3, fill=0.167) phá ở mọi `min_ratio`.
- **Fix của B (verified):** sweep `min_ratio ∈ {0.01, 0.05, 0.3, 0.5}` → **0 fail**; công thức giờ cho phép reject bởi một trong hai điều kiện (đúng OR-gate của source).

**c) [MEDIUM → CLOSED] `overlap-simultaneous-pairing` — invariant `A ≠ B` gắn premise hỏng**
- Cũ: `pass = !eqJson(aMerge, bMerge)` vô điều kiện — trên edge, `radius ≥ 2` cho cặp duy nhất → A=B → fail 4/4.
- **Fix của B (verified):** sweep edge `radius ∈ {2, 2.5, 3, 3.5, 10}` → **0 fail**; invariant giờ gate đúng premise mập mờ (radius 2–3.5 → `path:'A'` duy nhất `A=B=[a1,b1]` xanh; radius 10 → `path:'B'` phân biệt xanh).

### 3.8 [VERIFIED trên `27b693e8`] MOG2 visual: enriched fixture + `reject_cast_shadows` gate

**Delta v3→final (B báo):** fixture thêm 1 px tối-hơn-nền → tạo marker 127 **thật**; `fg_count` 4→5 tính thật; gate `reject_cast_shadows AND bg_ref` theo dossier; thêm param boolean `reject_cast_shadows` (default `true`).

**Verify trên final hash:**
- **Raw mask thật:** normal f1 grid `{off:11, marker:1, fg:4}` ≡ metrics `n0=11, n127=1, n255=4` (Σ=16) — legend `[off→"0 nền"], [marker→"127 shadow"], [fg→"255 definite"]`; caption "ô in giá trị mức". Edge: `{off:16}` ≡ `n0=16`.
- **`fg_count=5` độc lập, không che bug:** rcs=true (default) → refined `{off:11, fg:4, keep:1}` → `fg = definite 4 + keep 1 = 5` = scenario expected literal `fg_count:5` — literal thay đổi vì **fixture đổi thật**, result tính lại từ mask chứ không echo expected.
- **Gate `rcs AND bg_ref` đúng dossier:** rcs=false → marker KHÔNG gộp, refined `{off:12, fg:4}` → `fg_count=4`; state inspector lộ `reject_cast_shadows`, `bg_ref`, `marker127` per bước. (Hai scenario đều `bg_ref=true` — nhánh `bg_ref=false` chưa có fixture kích hoạt; không bắt được bằng param hiện có, ghi nhận giới hạn.)
- **Boolean param hoạt động:** flip `rcs` đổi result 5↔4, checks xanh cả hai chiều (mode đổi-param dùng invariant path — `expected={note}`, sweep 574 checks: 0 issues).

## 4. Điểm mạnh cần ghi nhận

1. **`mkTrace` không tự-PASS ở default**: `expected` = fixture literal dossier, `chkEach` so `result[k]` — result sai sẽ đỏ (đúng "không lấy result làm expected").
2. **Params có tác động thật**: audit thử đổi mọi param trên 40 lesson có param → 0 no-op. Sweep 572 invariant-check (`f5d3fb43`): **0 issues** — 3 lỗi vòng 2 (1 throw + 2 công thức sai) đã sửa đúng (§3.7).
3. **Scene phù hợp thuật toán**: grid cho mask/morphology, matrix cho cost/lapjv, tracks cho Kalman/prediction, fsm cho lifecycle/episode, dualcam cho handoff/overlap, token cho departure, hist/bars cho descriptor/threshold — 11 renderer chuyên biệt.
4. **CodeRefs** đều `backend/...:dòng` cụ thể + symbol + note.
5. **Giải thích đề cập số thật** (không văn mẫu): mọi explanation interpolate giá trị đã tính.

## 5. Acceptance criteria — TẤT CẢ ĐẠT trên `27b693e8` (FINAL)

- ~~frames≥3~~ / ~~metrics>0~~ / ~~0 `pass:true` literal~~ / ~~`state:{}`~~ → đạt.
- ~~§3.7a param-domain~~ → `step:2` {1,3,5} + clamp êm input ngoài-step, 0 throw.
- ~~§3.7b/c công thức/premise invariant~~ → sửa logic đúng (0 fail trên sweep, check không bị xóa).
- ~~MOG2 visual~~ → legend 0/127/255 + enriched fixture + `rcs∧bg_ref` gate đúng dossier, `fg_count=5` độc lập (§3.8).
- `audit-cv-pack.mjs` trên final hash: **0 issues** / 116 scenario / 411 frame / 574 legal-param checks.
- **Verdict cuối: pack CV ĐẠT chất lượng giao** — không còn blocker/finding mở. Khuyến nghị C fullQA để chốt browser-level trước khi đóng hoàn toàn.

## 6. Giới hạn review

- Re-audit #3 áp FINAL `27b693e8`; nếu `cv.js` đổi sau hash này, cần audit lại. Nhánh `bg_ref=false` của gate rcs chưa có fixture — không verify được bằng param hiện có (§3.8).
- Sweep invariant chạy trên giá trị param **trong min/max/step hợp lệ** (không fuzz out-of-range); invariant "biểu thức có nhưng sai logic" chỉ bắt được khi nó false-fail — biểu thức đúng-form-nhưng-luôn-true (tautology ngầm) không phát hiện được bằng sweep này, cần review tay nếu nghi.
- Chưa chạy browser; audit Node-level + đọc code là đủ cho các mục trên.
- Không đối chiếu từng line `codeRefs` với source backend lần này (đã verify qua các vòng review dossier); spot-check 12 ref trùng vùng đã review.
- Không kiểm `integration.js` (pack C) và không đánh giá lại `frontend.js` (owner A — verifier hiện 6395 PASS / 0 FAIL sau fix API params + changed-branch frames).
