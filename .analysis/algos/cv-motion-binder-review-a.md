# CV Source Review A — vòng cuối (revised): motion A1–A12, tracking B, binder D

Peer-review đối chiếu dossier `builder-b.md` (bản hiện tại) với source gốc. Chỉ đọc tĩnh —
không chạy service/hardware, không sửa dossier/source/web. Canonical IDs theo
`algo-web/SPEC.md` §2 + inventory dossier §1. Line refs source: `motion_tracker.py` (MT),
`slot_vehicle_binder.py` (SB), `occlusion_guard.py` (OG), `tracklet_descriptor.py` (TD).

Phạm vi: **28 ID** — A1–A12, `B1, B4, B5, B6, B7, B8, B10, B11`, `D1, D2, D3, D4, D7, D8, D9, D10`.
Không đụng: `B2, B3, B9, D5, D6, D11, E6, E10` (review trước — đối chiếu lại thấy owner B
đã sửa đúng, ghi nhận pass), 5 occupancy C1–C5 (owner C), `E*`, `F*`.

Ghi chú phương pháp: expected số trong các findings đã được **chạy lại** bằng script Python
stdlib (ghi `verified-run`); phần chỉ đọc code ghi `verified-static`.

## Bảng verdict

| ID | Verdict | Severity | Lỗi chính |
|----|---------|----------|-----------|
| A1 `mog2-foreground-mask` | OK+nit | low | `apply` chạy trên **frame BGR** (MT:768), dossier ghi input `gray` |
| A2 `temporal-motion-gate` | DEMO+FIX | low | morph chain temporal thật `OPEN3→dilate5×2→CLOSEjoin` (MT:559-573), dossier chỉ "dilate lớn"; non-multiscale chỉ 1 ref; `refs=∅ → zeros` (MT:548) |
| A3 `roi-strict-context-mask` | OK | — | abstraction `min_abs/max_abs` khớp `max(20, min(motion_min_pixels, 8%·compPx))` (MT:876-879); rescue-4-điều-kiện khớp MT:905-910 |
| A4 `foreground-morphology` | OK | — | OPEN→CLOSE + `join_kernel` đúng (MT:817-827) |
| A5 `contour-geometry-filter` | DEMO+FIX | med | **thứ tự gate sai**: code floor→ROI(A3)→occlusion-group→whole-scene→oversized→aspect→anchor→priority→motion(px **và** ratio)→shadow (MT:844-1086); dossier liệt kê khác thứ tự + motion gate chỉ px + thiếu occlusion step |
| A6 `bottom-center-anchor` | OK | — | `_bottom_center=(x+w//2, y+h)` literal (MT:392-394) |
| A7 `cast-shadow-discriminator` | DEMO+FIX | low | `chroma` thật = **chromaticity L1 distance** (MT:682-684) không phải "spread saturation"; residual là scaled `|cur−att·bg|/bg` (MT:685-687) — sample đã dùng đúng; params [0.32,0.62]/0.10/0.08/0.75/0.18 **literal** (MT:63-67,692) ✓ |
| A8 `dark-foreground-rescue` | OK | — | gate flag+bg (MT:781); `rescued = marker_px≥20 && ratio≥0.08` (MT:1043-1045) — `0.08` literal khớp sample |
| A9 `motion-echo-suppression` | **WRONG** | high | formula + hướng IoU gate bị đảo — xem dưới |
| A10 `occlusion-group-guard` | **WRONG** | med | `1.6·max` → thật `1.6·median`; "≥2 center" → thật tất cả member centers + group pre-formed |
| A11 `watershed-blob-partition` | OK | — | `[0.35,1.8]` literal (OG:183-185); chỉ pair-2, seed snap fg pixel, fallback merged |
| A12 `merged-blob-assignment-guard` | **WRONG** | med-high | `cos(axis,vel)≥0.9 && elong≥2` bịa — thật `excess_w ≤ vx·span+0.3w` |
| B1 `kalman-constant-velocity` | OK | — | `KalmanFilter(4,2)` + F matrix literal (MT:440-448) |
| B4 `iou-overlap-score` | OK | — | `inter/union`, `union=0→0` literal (MT:397-404); nit: codeRef `_overlap_geometry` là composite khác (D1), không phải IoU |
| B5 `association-cost-matrix` | **WRONG** | med | cost thật **4 term** — không có direction term; size là log-ratio error |
| B6 `lapjv-assignment` | OK | — | `lapjv(extend_cost=True, cost_limit=0.90)` (MT:72,1908) |
| B7 `assignment-margin-ambiguity` | **WRONG** | med | margin check **không phải mọi cặp** — chỉ split-margin tracks; `margin·(2−lineage)` + clear-streak 3 frame |
| B8 `stale-anchor-reacquire` | **WRONG** | med | `cost=floor+w·d` bịa (dùng 4-term thường); `anchor_r` → `min(max_dist,max(3,0.30·diag))`; thiếu 4 gate |
| B10 `hsv-lab-descriptor` | **WRONG** | med-high | `d=1−Σ√` → thật `√(1−BC)` (cv2.BHATTACHARYYA); expected 0.134→**0.366** verified-run; quality factors bịa |
| B11 `tracklet-gallery-match` | **WRONG** | med-high | `nnMed+w·gap` → thật `0.5nn+0.2cov+0.2agg+0.1best3`; `support=min(len)`; expected 0.0826→**0.1553**, 0.626→**0.6889** verified-run |
| D1 `slot-overlap-geometry` | **WRONG** | med | output keys `{vo,so,center_inside,dist}` → thật `{vo,so,center_proximity,score}`; score weights/proximity khác; thiếu qualify gate |
| D2 `slot-track-batch-match` | OK | — | `cost=1−score`, bonus `min(1,score+0.15)` (cap ≥0.85), `lapjv(0.95)` literal (SB:1303-1307) |
| D3 `arrival-claim-qualification` | DEMO+FIX | med | inward 3-branch literal đúng; **thiếu commit gates**: `lost_at_s`+delay 0.35s+vision_streak≥2+competing margin |
| D4 `vision-primary-fusion` | **WRONG** | med-high | "giữ `vehicle_id` nội bộ" → thật `vehicle_id=None` ngay empty đầu (SB:1548) |
| D7 `departure-token-lifecycle` | **WRONG** | med-high | `r0+rate·Δt` → thật `diag·lerp(0.05→0.45, age/1.0s)`; sample [5,45,85] sai |
| D8 `predeparture-candidate-guard` | **WRONG** | high | trigger "owner overlap giảm + vel ra" → thật **unbound fragment gần ô occupied** |
| D9 `recovery-candidate-gates` | **WRONG** | med-high | `‖first−origin‖` → signed-dist polygon; `dir_cos` → px-projection+radial+moved+obs≥3; `size<min` → range [0.4,2.5]; thiếu confirmed_empty+obs gates |
| D10 `recovery-batch-assignment` | **WRONG** | med | consume → episode **`released`** không phải "departing"; `limit 0.95` → 0.999; thiếu ambiguity margin |

**Đã pass re-check** (owner B đã sửa theo review trước): `B2` (anchor+linear conf+merged-freeze raw — khớp MT:266-292), `B3` (formula 4 bước khớp MT:1214-1230), `B9` (3 enum+pop+emit, `total_visible_count`+displacement — khớp MT:563-580, 2071-2094), `D5` (2 đường r95 vs inlier+median-drift — khớp SB:1346-1352, 1433-1445), `D6` (no-streak + detach-ngay + restore — khớp SB:2501-2557, 1533-1565), `D11` (`parked→departing→released` — khớp SB:888-977).

## Findings WRONG — chi tiết

### A9 `motion-echo-suppression` — severity: high · verified-static

> Claim dossier: "`same_echo = iou < iou_max && hist_d < hist_max && !different_clean_owners(a,b)`" (:326)

- Source: `_same_motion_echo` = `size_ratio ≥ 0.45 && hist ≤ 0.22 && dist ≤ max(24, 1.10·min(min_w)) && box_gap ≤ 14` (MT:1099-1110) — **không có IoU** trong same_echo; `_suppress_duplicate_detections` chỉ drop khi `IoU ≥ 0.25 && hist ≤ 0.12` (MT:1122-1132); `_is_echo_of_matched_track` thêm proximity `history[-4] ≤ max(22, 0.7·max(w,h))` (MT:1147-1160); spawn-side MT:2321-2334.
- Sai gì: (a) điều kiện `iou < iou_max` **đảo ngược** code — code drop khi IoU **cao** (`≥0.25`), dossier dạy drop khi IoU thấp; (b) thiếu size_ratio/dist/box_gap; (c) `hist_max` thật 0.22 (echo) / 0.12 (suppress).
- Demo: sample A IoU 0.3333 thoả cả hai nên verdict giữ — nhưng phải sửa pseudocode: `echo = same_echo(4 điều kiện) && !different_owners && IoU ≥ 0.25 && hist ≤ 0.12`; thêm edge case `IoU=0.1 → code GIỮ (dossier sẽ drop)`.

### A10 `occlusion-group-guard` — severity: med · verified-static

> Claim: "`inside = tracks có center ∈ blob`; `|inside| ≥ 2 && blob_area ≥ group_factor·max(area_i)`" (:350-351)

- Source: group form sẵn trong `prepare` theo proximity (`inter/min-area ≤ 0.20` + `gap ≤ 0.4·max_dim`, OG:55-100); `covering_group` đòi **tất cả member centers** ∈ blob (pad `0.15·min_dim`) + `w·h ≥ 1.6·median(member_ref_areas)` (OG:102-121).
- Sai gì: `max(area_i)` → `median(member_areas)`; "≥2 center bất kỳ" → all-members-inside của group đã pre-formed.
- Demo: sample A verdict giữ; sửa term `1.6·median` + ghi nhóm hình thành theo proximity trước.

### A12 `merged-blob-assignment-guard` — severity: med-high · verified-static

> Claim: "`elongated_ok = trục dài blob ≈ hướng vận tốc && hệ số dài/rộng đủ`" (:389)

- Source: `_elongation_explained_by_motion` = `excess_w ≤ |vx|·span + 0.3·w && excess_h ≤ |vy|·span + 0.3·h` (MT:1246-1300) — so sánh phần bbox **vượt size sạch** theo từng trục với quãng đường vận tốc; `gate_assignments` defer members + suppress detection cols khi swap-margin không valid, recovery sau **3 frame liên tiếp** `swapped−direct ≥ 2·margin && direct < 1.2` (OG:191-232).
- Sai gì: `cos(trục, vel) ≥ 0.9 && elong ≥ 2` là công thức bịa (không cosine, không elongation ratio trong code); cơ chế guard = defer+validate-3-frame, không chỉ "veto hoặc cho qua".
- Demo-allowed: giữ 2 nhánh explained/veto; sửa sample theo `excess ≤ |v|·span + 0.3·size` per-axis (vd `vel=[4,0], span=1.75, w=8,h=3, clean w=4 → excess_w=4 > 4·1.75+1.2? …` chọn số để `excess ≤` đổi dấu).

### B5 `association-cost-matrix` — severity: med · verified-static

> Claim: "`cost = w_d·d_norm + w_i·(1−iou) + w_a·app + w_s·size_d + w_g·(1−dir)`" (:491); Code line ghi "+ direction" (:487)

- Source: `cost = 0.45·(dist/max_dist) + 0.25·(1−iou) + 0.20·app + 0.10·size_error` (MT:1761-1766); `size_error = min(1, |ln(area_ratio)|/|ln(max_reacquire_area_ratio)|)` (MT:1756-1760). Direction **không phải cost term** — hướng chỉ xuất hiện ở gate khác.
- Sai gì: term list (5→4, bỏ `1−dir`), size term sai dạng, weights `~demo` vẫn phải khớp số term.
- Demo: sửa sang 4-term + `w=[0.45,0.25,0.20,0.10]` literal; giữ sample A nhưng tính lại theo term mới.

### B7 `assignment-margin-ambiguity` — severity: med · verified-static

> Claim: "sau LAPJV, kiểm tra **từng cặp thắng** có thắng đủ xa không" (:525)

- Source: margin check chỉ áp cho `split_margin_track_ids` = track `invisible>0` hoặc `merged_freeze` (MT:1685-1686, 1914); margin thực = `split_assignment_margin·(2.0−lineage_score)` (MT:1921, default 0.08 MT:82); fail → `association_state="split_recovering"` + suppress detection (MT:1951-1963); kể cả pass margin, `recently_ambiguous && !clear_evidence` cần `ambiguous_clear_streak ≥ ambiguous_recovery_frames(=3)` (MT:1964-1985). Cặp thường (track đang thấy) **không qua margin** — nhận kết quả LAPJV luôn (MT:1990-1992). `_assignment_has_margin` formula đúng như dossier (MT:1180-1191).
- Sai gì: scope "từng cặp" sai — policy defer chỉ cho track đang hồi phục sau invisible/merge; margin scale theo lineage; clear-streak bị bỏ sót (dossier chỉ ghi lineage trong sim-omits).
- Demo-allowed: second-min 2 chiều đúng; thêm "chỉ track invisible/merged mới bị kiểm" + margin×(2−lineage) + streak.

### B8 `stale-anchor-reacquire` — severity: med · verified-static

> Claim: "`cost = floor + w·d_norm`" (:550); params `anchor_r`, `app_max`

- Source: stale → `predicted_point = last_measured_center` + `gate = min(max_dist, max(3.0, 0.30·diag(clean)))` (MT:1696-1701); sau đó chạy **cost 4-term thường** (MT:1761); gates riêng: `app ≤ min(lost_thresh, 0.22)` (MT:1734-1737 — `app_max:0.22` trong dossier trùng literal ✓), `area_ratio ∈ [0.35, 2.80]` (MT:1749-1755, defaults MT:84-85), `invisible>0 && hist=None → skip` (MT:1726), outer `lost_seconds > reacquire_window(1.5s/3.0s merged) → bỏ hẳn` (MT:1642-1651).
- Sai gì: `cost = floor + w·d_norm` bịa; `anchor_r` param không tồn tại (0.30·diag); thiếu size-band + hist-required + reacquire-TTL.
- Demo: giữ 2 gate dist+app; sửa `anchor_radius = max(3, 0.30·diag)`; cost demo gắn `[sim]` rõ (không claim code); thêm 3 gate missing vào `[sim-omits]`.

### B10 `hsv-lab-descriptor` — severity: med-high · verified-run

> Claim: "`d = 1 − (√0.75·√1) = 1−0.866 = 0.134`" (:597); "`quality = f(n_px, contrast)`" (:590)

- Source: `histogram_distance` = `cv2.compareHist(HISTCMP_BHATTACHARYYA)` = `√(1 − BC/√(Σp·Σq))`; với Σ=1 → `√(1−BC)` (TD:141-149). `compute_sample_quality` = `0.5·size + 0.3·fg_ratio + 0.2·aspect`; hard 0 khi `area<200`/`fg<0.15`; `_histogram` reject `<0.5` (TD:81-138, MT:427-429). Phần descriptor 416-D + weights + L2-norm **đúng** (TD:52-68) ✓.
- Sai gì: `1−BC` ≠ `√(1−BC)` → expected sample A **0.134 → 0.366** (verified-run); quality factors `n_px+contrast` bịa (thật size/fg/aspect); `q_min` thật 0.5.
- Demo-allowed: demo 6-bin + Σ=1 được, nhưng distance phải là `√(1−Σ√)` để khớp cv2; sửa expected cả sample B tương ứng.

### B11 `tracklet-gallery-match` — severity: med-high · verified-run

> Claim: "`dAgg = nnMed + w·coverage_gap`; `distance = dAgg` (hai chiều lấy max); `support = số cặp nn < thresh`" (:610-611)

- Source: `distance = 0.50·nearest + 0.20·coverage + 0.20·aggregate + 0.10·best_pairs` (TD:339-344); `nearest = median(partial_nearest)` — partial = chiều của **gallery nhỏ hơn**, không phải symmetric max (TD:324-332); `coverage = median(symmetric_nearest)` (TD:333); `support = min(lenA, lenB)` (TD:347).
- Sai gì: formula + merge `max`→weighted-mix + `support` semantics + `coverage_gap` (frac > thresh) → median symmetric.
- Expected mới (verified-run, công thức cv2 đầy đủ + L2-norm aggregate): Sample A `0.0826 → 0.1553` (vẫn match <0.5); Sample B `0.626 → 0.6889` (vẫn không match). Lưu ý pairwise trong sample Σ=1 → `√(1−BC)`; aggregate L2-normalized → dùng công thức mean-normalized đầy đủ.

### D1 `slot-overlap-geometry` — severity: med · verified-static

> Claim: "Output: `{vehicle_overlap, slot_overlap, center_inside, dist}`" (:810); "`score = 0.6·1.0 + 0.3·0.309 + 0.1·1.0 ≈ 0.793`" (:821)

- Source: return `{vehicle_overlap, slot_overlap, center_proximity, score}` (SB:740-744); `qualifies = (center_inside && vo ≥ min_vehicle_overlap) || vo ≥ strong_vehicle_overlap` else **None** (SB:729-733); `center_proximity = max(0, 1−dist/diag)` (SB:737-738); `score = 0.70·vo + 0.20·so + 0.10·prox` (SB:739).
- Sai gì: output keys (không có `dist`/`center_inside` trong dict); score term-3 là proximity liên tục không phải binary inside; weights `[0.6,0.3,0.1]` vs literal `[0.7,0.2,0.1]`; qualify gate bỏ sót (dossier chỉ "null nếu không chạm").
- Demo: sample A score `0.793 → 0.862` (`0.7+0.2·0.309+0.1·1.0`); Sample B verdict giữ (vo<min và center ngoài → null ✓).

### D4 `vision-primary-fusion` — severity: med-high · verified-static

> Claim: "`vision=0 && owner` → giữ `vehicle_id` nội bộ nhưng public `occupied=false`; tạo departure token" (:873); Sample B "binding giữ `v7`" (:881)

- Source: vision-empty đầu → `_create_departure_token` + `_detach_binding_for_departure` set **`binding.vehicle_id = None`** ngay (SB:1533-1565, ~:1548); episode → `departing`. "Giữ nội bộ" chỉ đúng cho nhánh legacy (`if vision_occupied` khi release, SB:2595-2604).
- Sai gì: claim ngược policy chính — `vehicle_id` bị xoá ngay; chỉ `movement_state`/`exit_pending` + token giữ danh tính. Sample B expected sai.
- Demo: sửa pseudocode nhánh 3 → "`vehicle_id` gỡ ngay, identity sống trong token"; sửa Sample B expected.

### D7 `departure-token-lifecycle` — severity: med-high · verified-run

> Claim: "`radius(t) = min(r_max, r0 + rate·(t − t_create))`" (:938); sample `radius=[5,45,85]`

- Source: `radius = slot_diagonal·(recovery_initial_expand_ratio + progress·(max−init))`, `progress = min(1, age/recovery_expand_seconds)` (SB:603-609; defaults 0.05/0.45/1.0s SB:227-229). `expires = created + recovery_retention_seconds(5.0)` + extension loop khi còn evidence (SB:1820-1846); predeparture-guard cancel `>2.5s` không đóng episode khi owner còn parked (SB:1745-1803, 1847-1866).
- Sai gì: linear-rate bịa — thật nội suy ratio·diagonal bão hoà sau `expand_seconds`. Sample `[5,45,85]` theo code chỉ trùng điểm đầu: diag=100 → `[5,45,45]` (verified-run).
- Demo: sửa `radius(t) = diag·(0.05 + min(1,Δt/1.0)·0.40)`; chọn `diag` sample sao cho số hợp lý; ghi "expire → token pop; episode `released` chỉ khi không phải predeparture-owner-còn-parked".

### D8 `predeparture-candidate-guard` — severity: high · verified-static

> Claim: "Với mỗi binding có `overlap` giảm + vận tốc hướng ra → đánh giá 'đang rời'" (:958)

- Source: `prepare_predeparture_tokens` duyệt **unbound tracks** (không phải bindings): fragment được giữ nếu gần ô `vision_occupied` (`signed_dist ≥ −0.05·diag` hoặc `overlap > 0`), chọn ô gần nhất theo `dist/diag`, bỏ khi 2 ô chênh `<0.15` → tạo/refresh token `predeparture` `motion_started_in_parked_slot` (SB:493-518). Không đo overlap-trend hay velocity của owner.
- Sai gì: đảo chủ thể — tín hiệu là fragment unbound xuất hiện cạnh ô, không phải owner rời ô; samples "overlap [0.7,0.5,0.3] giảm" mô tả điều code không đọc.
- Demo: viết lại pseudocode theo fragment-side; samples đổi input "fragment unbound tại (x,y), signed_dist −2, overlap 0.1 → candidate".

### D9 `recovery-candidate-gates` — severity: med-high · verified-static

> Claim: "`d = ‖frag.first_pt − token.origin‖`; `dir_cos = cos(frag.vel, frag.first_pt − slot_centroid)`; `size_ratio < size_min`" (:977-979)

- Source: radius gate = `first_signed < −max_radius` hoặc `signed < −radius && overlap≤0 && !continuing` — **signed distance từ polygon**, không Euclidean-tới-origin (SB:3233-3249); outward = `obs ≥ recovery_evidence_frames(3)` + một trong: `moved ≥ 3.0 && outward_px ≥ 1.5 && radial_gain ≥ 0.75` (legacy) / world-trajectory / polygon-escape (SB:3327-3391); `size_ratio ∈ [0.40, 2.50]` hoặc `[0.15,6.0]` trajectory (SB:3251-3284); `app > limit → reject` với limit strict 0.55 / relaxed 0.70 (SB:3286-3304); `!token.confirmed_empty → departure_not_yet_confirmed` (SB:3416-3421); cost `0.45·spatial + 0.35·(app/limit) + 0.15·size + 0.05·dir` (SB:3467-3472).
- Sai gì: 3/4 metric của gates mô tả khác cơ chế (radius, direction-cosine bịa, size one-sided); thiếu obs≥3 + confirmed_empty gates; cost formula `f(d,app,size)` → literal 4-term trên.
- Demo-allowed: giữ khung "gate chuỗi + cost"; sửa metric: `signed_dist(first, poly) ≥ −radius`, outward dùng `outward_px/radial_gain/moved/obs`, size range hai đầu, thêm confirmed_empty.

### D10 `recovery-batch-assignment` — severity: med · verified-static

> Claim: "`consume`: fragment nhận `global_id`, token xóa, episode `departing`" (:1007); sample `limit:0.95`

- Source: `lapjv(extend_cost=True, cost_limit=0.999)` (SB:3520); post-check `row_gap/column_gap < recovery_ambiguity_margin(0.15)` → reject + `ambiguous_local_keys` (SB:3542-3557); `_consume_departure_token` = pop token + `_transition_parking_episode("released", "departure_confirmed")` + vehicle `exit_pending` + cooldown `+2.5s` (SB:2733-2750). `departing` đã set lúc detach (D6/D7), consume **đóng** episode.
- Sai gì: "episode departing" sai hướng (`released`); `0.95` vs `0.999`; ambiguity margin bỏ sót.
- Demo: sửa 3 điểm; sample số giữ được nếu đổi limit.

## Findings DEMO+FIX — chi tiết

- **A2** MT:559-573 — temporal mask morph là `OPEN(3) → dilate(5×5,×2) → CLOSE(join×it)` không phải "dilate kernel lớn"; non-multiscale chỉ 1 ref (`:489-493`); `references=∅ → zeros` (gate đóng, `:548-549`). Thêm vào `[sim-omits]`.
- **A5** MT:844-1086 — thứ tự thật: floor → **ROI strict/context (A3)** → occlusion-group → `area>0.22·frame` → oversized → aspect → anchor-check → priority → `motion_px < min_pixels || motion_ratio < min_ratio` → marker/shadow. Dossier xếp khác (ROI thứ 6, không occlusion step, motion chỉ px). Sample demo không có ROI nên verdict giữ.
- **A7** MT:682-696 — `chroma` = median |chromaticity_cur − chromaticity_bg| (normalized RGB L1), không phải "độ bão hòa"; residual scaled-by-attenuation (sample đã đúng, pseudocode dòng 1-2 lệch); `explained` còn đòi chroma+residual conjuncts (demo chỉ att_tol — literal 0.18 ✓). Params literal [0.32,0.62]/0.10/0.08/0.75/0.18 ✓ — giữ.
- **D3** SB:1167-1283 — commit cần claim `lost_at_s` + `≥0.35s` + `vision_occupied_streak ≥ 2` + `vehicle_id=None` + margin score vs competitor + `disproof==0`; dossier chỉ có obs/overlap/inward. Thêm vào `[sim-omits]` hoặc pseudocode.
- **A1** nit: `apply(frame)` BGR (MT:768) — dossier `apply(gray)`: đổi input thành `frame BGR` hoặc ghi rõ demo-gray.

## Ưu tiên sửa

1. **D8, A9** — đảo chủ thể/hướng gate (teach ngược hoàn toàn).
2. **B10, B11** — công thức distance + expected sai (ảnh hưởng B5/B8/D9/E7 dùng appearance).
3. **D4, D7, D10** — sai policy/state-name (ăn vào contract session C).
4. **D9, A12, B8, A10** — metric/công thức bịa nhưng khung ý tưởng đúng.
5. **B5, B7** — term list/scope sai nhưng concept đúng hướng.
6. DEMO+FIX (A1, A2, A5, A7, D3) — thêm `[sim-omits]`/gate missing, giữ sample.
7. **D1** — output contract + score (D2/D3/D5 phụ thuộc trực tiếp).

## Giới hạn review

- Chỉ đọc tĩnh + 1 script stdlib cho số expected (đã ghi verified-run/static từng mục).
- Chưa đọc sâu: `two_camera.py` recover pipeline (D9 refs), `cross_camera_manager.py` `_appearance_distance`/`_bbox_anchor` (A6/E refs chỉ xác nhận tên tồn tại), `trajectory_memory.py` world-trajectory scoring (D9 tham chiếu), `_token_extension_blocker` chi tiết.
- `lapjv(extend_cost)` semantics theo tên tham số + usage — chưa chạy solver thật.
- Line refs dossier lấy theo bản đọc `:93-1036` ngày review; owner B đang sửa file — dùng ID làm neo.
