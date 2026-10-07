# Batch B — readability-v3 · report cho LEAD

**STATUS: ĐANG SỬA — chưa LEAD duyệt.** Source-verify §3 đã đối chiếu lại trực tiếp code sau feedback (3 mâu-thuẫn đã sửa, đánh dấu ←FIX). Đã áp toàn-bộ `batch-sourcecheck-b-c.md` của C: §3 + content Deep/sourceRefs/realParams đồng-bộ (xem §3b).

Owner B — 9 route: reid, handoff, homography, trajectory, dormant, gid-conflict, gate, session, snapshot.
Report cập-nhật theo chunk. Chunk này: **R3 core — reid + handoff** (2026-10-04) + homography (R4 đầu).

---

## 1. Route R3

| Route | Stage | Vị trí (position) | Steps | Lint | QA probe | Ảnh |
|---|---|---|---|---|---|---|
| reid | Chặng 10/12 · Bàn giao & mã toàn cục | before `dormant` → here "Nhận dạng lại bằng bề ngoài" → after `binder`; links: handoff, gid-conflict (cùng chặng) | 6 | 0 err / 0 warn | **47/47 PASS**, 0 console/page error | `.analysis/readability-v3/shots-b/reid/reid-{1440,1280}-s{0,2,3,5}.png`, `-tab.png`, `-src.png` |
| handoff | Chặng 10/12 · Bàn giao & mã toàn cục | before `dormant` → here "Bàn giao 2 camera & cấp mã toàn cục" → after `binder`; links: reid, gid-conflict (cùng chặng) | 6 | 0 err / 0 warn | **47/47 PASS**, 0 console/page error | `.analysis/readability-v3/shots-b/handoff/handoff-{1440,1280}-s{0,2,3,5}.png`, `-tab.png`, `-src.png` |

Mapping theo `batch-position-c.md` (nguồn C, chính-thức). Cùng chặng-10 KHÔNG xếp before/after cho nhau — chỉ ở `links` đánh "cùng chặng". Probe: `.analysis/readability-v3/_qa_v3_b.mjs` (B-owned, chỉ đọc).

## 2. Files changed (chunk này)

- `algo-web-v2/js/content/reid.js` — v3 block mới (summary/story/stage/position/captions×6/stepTexts×6/hudLabels×6/flow×4/rules×5/impacts×4/glossRefs×6); qa rewrite văn-thường; giữ v1 fields + sourceRefs
- `algo-web-v2/js/pages/reid.js` — bỏ explBox + `sc.expl` (v3 sink); `sc.v3.bindPlayer(player, pc)`; nhãn canvas VI ≥13px; titleSize qua `d.label` thay title cứng 11px; HUD → `sc.v3.hud`
- `algo-web-v2/js/content/handoff.js` — v3 block tương-tự; qa rewrite (thống-nhất "centimet")
- `algo-web-v2/js/pages/handoff.js` — cùng migration; sửa sau-ảnh: clamp nhãn "điểm hẹn · vòng 25 cm" trong panel (bị cắt mép), rút header bảng cổng (chồng chữ)
- `.analysis/readability-v3/_qa_v3_b.mjs` — probe B mới: 47 assert/route (mount, v3 contract, captions sync, HUD, bước-highlight, tab, tooltips→Thuật-ngữ, source/deep, pcode, controls, re-nav, console/network)

## 3. Fresh source verification (route này)

### reid
- `two_camera.py:1965-1967` — `--tracklet-max-samples` **12**, `--tracklet-sample-interval` **3**, `--global-gallery-max-samples` **24** — **runtime = class default, KHÔNG override** (class `mt:50-51` = 12/3, `ccm:162` = 24) ←FIX-C: report cũ bịa "class 16/6/32". Callsite truyền ctor: `tc:2387-2388` (→tracker), `tc:2248` (→manager). Content realParams ghi scope "runtime = class default".
- `tracklet_descriptor.py:81-91` — `compute_sample_quality` (**tên đúng, không phải `_sample_is_usable`** ←FIX): `min_area=200`, `min_foreground_ratio=0.15`, reject `<0.5` (signature defaults). Mẫu xấu bị loại trước khi vào kho — quality-gate callsite `motion_tracker.py:427-429`.
- `cross_camera_manager.py:388-397` — `use_deep_reid` → `raise ValueError` trong ctor (**đúng file, KHÔNG phải td:277** ←FIX); `td:277` = `merge_appearance_samples` (gallery GID, max_samples=24). `compare_tracklets` `td:308`: 4 thành-phần 0.50/0.20/0.20/0.10; gallery theo-camera merge tại `ccm:547-587`.
- Khớp claim content: bộ-nhớ 12 mẫu, ngưỡng 0.45 hard / 0.82 giới-hạn trên.

### handoff
- `cross_camera_manager.py:2572-2636` — `_upsert_handoff`: mở lượt chờ TTL 45 khung khi track ra mép (`two_camera.py:1926` **`--handoff-ttl` 45** ←FIX-C tên-arg: không có arg `handoff-pending-ttl`).
- `cross_camera_manager.py:2744-2774` — **`_predicted_world`** (←FIX: trước report ghi nhầm "confirm frames" ở range này): điểm hẹn = last_world + velocity·elapsed, ưu-tiên per-second khi có timestamp, fallback ×25fps.
- `cross_camera_manager.py:3663-3674` — **streak thực-tế** (←FIX range): `overlap_handoff → 2 nếu strong_overlap_candidate, else 3; requires_temporal_evidence → 2; còn lại → 1` = {2,3,2,1}; defer registry `:3680-3685`. Mảnh minh-họa cần 2 khung liên-tiếp → hiển "2/2 khung".
- `cross_camera_manager.py:2776-2829` (`_entry_depth`+`_direction_cosine`) · `:2934-2990` appearance gates trong `_candidate_cost` (:2831-3018) — hard 0.45 / adaptive 0.82 → reject TRƯỚC cost; size>0.90 `:2997`, direction<0.25 `:3002` ←FIX-C range · `:3017-3018` (cost 0.55/0.30/0.10/0.05 ≤0.92) · `:3623-3624` margin 0.08 ←FIX-C · `:3376-3440` `_bound_handoff_merge_allowed`.
- `two_camera.py:1951` `--handoff-min-direction-cosine 0.25`; `:1944-1948` defer 8f; `:1949` lookahead 16f; `:2170-2176` prediction_radius resolved min(cfg 25.0, derived 25.486)=25cm.
- Cảnh minh-họa: A đỏ 0.324 vs C đỏ-tươi 0.591, chênh 0.267 ≥ 0.08 (đúng cơ-chế margin; HUD hiển "0,27 · đủ rõ").

## 3b. C-sourcecheck đã áp vào content (batch-sourcecheck-b-c.md → file B)

| C-claim | File B sửa | Trước → Sau |
|---|---|---|
| runtime=class 12/3/24, không có class 16/6/32 | `content/reid.js` realParams ×2 | scope `runtime` → `runtime = class default (mt:50-51)` / `(ccm:162)`; ctor refs → `tc:2387-2388`, `tc:2248` |
| `_candidate_cost` 2831-3018 | `content/handoff.js` where+steps+sourceRefs+realParams | `2831-3017`→`2831-3018`, appearance `2935`→`2934`, cost ref `3017`→`3017-3018` |
| margin :3623-3624; streak inline `required_evidence` :3663-3673, không có `handoff_confirm_frames` | `content/handoff.js` where+sourceRefs+realParams | `:3622`→`:3623-3624`; `3658-3667`→`3663-3673`; symbol `streak`→`required_evidence` + note {overlap+strong:2, overlap:3, temporal:2, else:1} |
| Tên args đúng | `content/handoff.js` realParams ×5 + `batch-b.md` §3 | `handoff_ttl`→`--handoff-ttl`; thêm `--` cho lookahead/defer/min-direction-cosine; appearance arg → `--handoff-appearance-threshold`/`--handoff-relaxed-appearance-threshold` (relaxed ref `1931`→`1930-1932`) |
| `use_deep_reid` raise :391-395 | `content/reid.js` why | `ccm:391-397`→`ccm:391-395` (sourceRef `388-397` giữ — gồm cả comment :388-390) |

Content đã re-verify 2 chiều với C; default layer không chứa số sai này (chỉ ảnh hưởng Deep/④). C sẽ check Deep 2 route sau freeze.

## 3c. Chunk R4-1: trajectory (mới)

| Route | Stage | Vị trí | Steps | Lint | Probe | Ảnh |
|---|---|---|---|---|---|---|
| trajectory | Chặng 8–9/12 · Gom chứng cứ & khôi phục | before `dormant` → here "Gom chứng cứ quỹ đạo & nhận dạng" (note: gom liên tục từ vết đang sống) → after `handoff` | 6 | 0 err / 0 warn | **47/47 PASS**, 0 console/page error | `shots-b/trajectory/trajectory-{1440,1280}-s{0,3,5}.png` + tab/src |

**Fresh-verify phát-hiện 2 fact dossier SAI (đã sửa trong content):**
1. `tm:58` `history_seconds=2.0` — signature default = runtime arg (`--trajectory-history-seconds` tc:1969-1971 default 2.0). Dossier ghi "3.0 sig → 2.0 runtime" — **runtime = class, không override**.
2. `tm:62,68` `max_samples=240` (floor `max(16,·)`) — dossier "≤16 điểm" là SAI; **không tồn-tại spacing ≥2cm** — dedupe theo `(frame_idx,cam,track)` `tm:79-97`, giữ 2.0s gần-nhất. Đã sửa does/steps/sourceRefs/realParams/pseudocode.
Giữ đúng: weights `tm:395-402` 0.35/0.25/0.15/0.10/0.10/0.05 · rejects `tm:387-393` · departure radial `tm:503-509` · caller `ccm:6024-6027`/`6093-6096`/`6115-6117`/`6131` · wiring `ccm:379-384` · observe chỉ-fresh `ccm:1442-1510`.

**Visible text:** summary "Bộ nhớ quỹ đạo giúp phân biệt hai xe cùng màu nhờ con đường chúng vừa đi qua." (19 từ). Canvas VI: "KHÔNG có bộ nhớ quỹ đạo" vs "CÓ bộ nhớ quỹ đạo"; nhãn "hành lang" (bỏ `corridor`/`radial_gain`/weights khỏi mặc-định); bars "đường đi · màu sắc · hướng đi · tốc độ · thời gian · kích thước" (không trọng-số); verdict "0,83 đủ cao ✓"; OFF "gán nhầm xe B ✗"; HUD "0,83 ≥ 0,78 ✓ · 0,17 ≤ 0,22 ✓". Title content đổi "— corridor, hướng, tốc độ" → "Bộ nhớ quỹ đạo" (bỏ jargon H1).

**Hash post-fix:** content `f14848a6e0edfcf81ee9dff017a2f0bb` · page `315a6e32ad4cdd0be17a59823506b751`.

**LEAD-fix trajectory (đợt 2, đã áp):**
1. Step 5 reject giờ **hiện bằng hình**: trail phẳng nét-đứt + dấu ✗ đỏ gạch + tag "bị loại, không rời ô" (không còn caption-only).
2. HUD bỏ công-thức: "0,83 ≥ 0,78 ✓"→"đủ chứng cứ ✓", "0,17 ≤ 0,22 ✓"→"được vào bảng ghép"; số 0,83 vẫn gắn "(minh họa)".
3. Scope ngưỡng sửa chính-xác: `match_threshold=0.78`/`ambiguity_margin=0.12` là **literal hardcoded trong ctor wiring ccm:379-384 — class-default, KHÔNG CLI** (realParams đổi scope runtime→class-default, ghi rõ). LAPJV cap 0.22 = class-default ccm:6115-6117. Lint vẫn 0w, probe 47/47.

## 3d. Chunk R4-2: dormant (mới)

| Route | Stage | Vị trí | Steps | Lint | Probe | Ảnh |
|---|---|---|---|---|---|---|
| dormant | Chặng 7/12 · Báo mất dấu & hết hạn | before `track-lifecycle` → here "Báo mất dấu & hết hạn" (note: danh tính ngủ còn sống tới chặng 10) → after `binder`; link handoff "nơi danh tính ngủ tái dùng" | 5 | 0 err / 0 warn | **41/41 PASS**, 0 console/page error | `shots-b/dormant/dormant-{1440,1280}-s{0,2,4}.png` + tab/src |

**Fresh-verify ≥3 fact (trực tiếp code):**
1. `ccm:2419-2445` = `_dormant_reid_ready` — cổng hồi danh tính: `_is_confirmed` + fragment hiện-tại ≥3 khung (`first_observation_frame`, fallback `total_visible_count`).
2. `ccm:159` `identity_retention_seconds=60.0` · `ccm:182` `identity_retention_moving_seconds=12.0` · `ccm:4636-4691` parked_reservations **exempt** + established ×4.
3. `_match_dormant_identities` **def ccm:4911** (dossier ghi mơ-hồ), lapjv `cost_limit=0.95` ở **ccm:5526** trong hàm đó; `_reconcile_dormant_duplicates` ccm:6854.
4. `svb:225-236` token params: retention 5.0s · evidence 3f · size (0.40,2.50) · **appearance 0.55/0.70 · margin 0.15** (mới ghi nhận) · `svb:2980-2992` signed-gate `signed<−max_radius ∧ overlap=0 ∧ ¬evidence → continue` · `svb:2653-2668` wakeup chỉ đánh thức detector.
5. Runtime token expand: `--slot-recovery-max-expand-ratio` **default 0.85** tc:1890-1897 → ctor tc:2331 (class-fallback 0.45 svb:228 — KHÔNG phải runtime).

**Visible text:** summary 25 từ. Canvas VI: OFF "KHÔNG nhớ danh tính" → "mã mới G9 ✗"/"một xe hai hồ sơ"; ON "G5 đang ngủ · ngủ còn ~57 giây" + "vùng đánh thức (minh họa)" vàng-nét-đứt ≠ "ngoài vùng sẽ loại" đỏ + "vé còn ~2 giây" + "cách 9cm, đủ gần" → "lại là xe G5 ✓". Hai đồng-hồ riêng (ngủ 60s ≠ vé 5s) nhìn thấy trên canvas + HUD. QA plain-VI (đã bỏ svb:/[code] khỏi câu trả lời). Title → "Danh tính ngủ".

## 3e. Chunk R4-3: gid-conflict (mới)

| Route | Stage | Vị trí | Steps | Lint | Probe | Ảnh |
|---|---|---|---|---|---|---|
| gid-conflict | Chặng 10/12 · Bàn giao & mã toàn cục | before `dormant` → here "Dàn xếp khi tranh một mã" (bước con chặng bàn giao) → after `binder`; links reid+handoff "cùng chặng" | 5 | 0 err / 0 warn | **41/41 PASS**, 0 console/page error | `shots-b/gid-conflict/gid-conflict-{1440,1280}-s{0,2,4}.png` + tab/src |

**Fresh-verify ≥3 fact (trực tiếp code):**
1. **`merge_probation_frames=5` ở ccm:173 (ctor) + check ccm:523** — dossier/content cũ ghi `:163-165` là SAI (đó là `new_identity_min_observations`, chuyện khác). Đã sửa steps/sourceRefs/realParams/pseudocode.
2. `canonical=min(GID)` thật ở **ccm:1259** bên trong `_merge_global_ids` def `:1201` ("the smaller/older global ID always survives") ✓.
3. `_resolve_cross_camera_global_conflicts` :3226-3374 — `divergence_bound=dup×2` :3278, `extreme_bound=dup×3` :3279, `d≤divergence→jitter` :3295, `d>extreme` :3299, `_advance_consecutive_evidence` :3306 (def :3054), `member_rank` :3314, `kept=min(left,right)` :3346 ✓.
4. Resolved duplicate `tc:2184-2190`: derived 4.634cm, **fallback `handoff_match_distance×0.60`** (không phải 0.5·median như dossier — derived path vẫn từ median).
5. `member_rank` dùng `compare_tracklets` appearance + binding_frame + visible + (cam,local) tiebreak :3314-3347 ✓.

**Visible text:** summary 23 từ. Canvas VI: OFF "hai xe chung một mã mãi"; ON "mã G5"/"vết riêng" + "vùng giữa, chờ bằng chứng" → "đủ 2 khung ✓" → "hai hồ sơ sạch"; thước 3 vùng "gần / vùng giữa / xa" + kim "11cm". QA plain-VI. Title → "Gỡ xung đột mã xe".

## 4. Visible text (đã-chốt, fresh-reader)

**reid** — summary: "Bộ nhớ mẫu màu giúp hệ thống nhận ra chiếc xe cũ khi nó xuất hiện lại ở camera khác." (19 từ). Story (đã-hiệu-chỉnh vai-trò màu): "…Thiếu chứng cứ về màu, mảnh mới này rất dễ bị coi là một chiếc xe khác." Canvas: OFF "mọi mảnh đều là xe mới → thiếu chứng cứ, mã G9 mới"; ON strip "bộ nhớ mẫu theo thời gian" + đồng-hồ "độ lệch 0,21" + "so hai bộ mẫu" → "chứng cứ mạnh, giữ mã G5" + dòng phụ "màu không quyết một mình" (đánh dấu minh-họa tách-riêng — appearance chỉ MỘT nhánh của gate+cost, vị-trí/kích-thước/hướng do handoff kiểm). Caption/stepText cuối: "màu là một chứng cứ, không phải kết luận"; "vị trí và hướng đi kiểm phần còn lại". Giới-hạn nêu rõ: xe đổi-tông có-thể qua hoặc hỏng.

**handoff** — summary: "Khi xe sắp rời khung hình, hệ thống đặt điểm hẹn trên bản đồ chung để đón đúng xe đó ở camera kia." (24 từ). Story: xe-đỏ sắp qua cầu-nối, 3 mảnh cùng-lúc (đỏ/trắng/đỏ-tươi), chọn nhầm → đổi-chủ hồ-sơ. Canvas (đã-bỏ công-thức mặc-định theo LEAD): ellipse vòng-tin-cậy 25cm quanh điểm-hẹn; bảng cổng-cứng giờ **ô chữ-thường** — khoảng-cách giữ cm thật ("11 cm ✓"), màu-sắc/kích-thước/hướng-đi qualitative ("giống ✓" / "quá khác ✗" / "cùng cỡ ✓" / "đúng hướng ✓") — ngưỡng ≤0,90/≥0,25 xuống ④+mã-giả; legend thanh-điểm chỉ còn tên thành-phần "vị trí · màu · khổ · hướng" (bỏ ·55/·30/·10/·05); verdict "cách biệt đủ rõ ✓" thay "chênh 0,267 ≥ 0,08"; HUD "Chênh hai điểm: 0,27 · đủ rõ". Mảnh-trắng vẫn loại TẠI CỔNG trước chấm — đúng code. Giới-hạn: dự-đoán sai-chỗ khi đổi-tốc, chỗ-đến đã có mã khác thì bàn-giao chỉ đề-xuất (conflict-resolver quyết).

## 5. Blockers / lưu-ý cho LEAD + C

- Không blocker. reid+handoff ready theo gate R3 (lint sạch, probe 47/47 ×2 viewport, canvas chứng-minh bằng hình đúng bài-học ROI).
- Gloss aliases gợi-ý cho C (R5): `{term:"mã toàn cục",label:"mã G5"}` dùng nhiều ở layer nhãn — từ-điển "GID" hiện lookup được; `hồ sơ`, `hồ sơ chờ` — đã wrap qua glossary "episode"/"pending handoff"? → C kiểm canon; B chỉ ghi-nhận, không sửa shared.
- R4 tiếp: homography → trajectory → dormant (chặng 7-9) rồi gid-conflict, gate, session, snapshot.

---

# Chunk R4+R5 — homography · trajectory · dormant · gid-conflict · gate · session · snapshot (QA-done, chưa freeze/LEAD-duyệt)

## 6. Source facts (fresh-verify trực-tiếp code, ≥3/route)

**homography** — bản trước SAI (bịa `ANCHOR`/`min_anchor_multiples`/`homography.py`); đọc lại code hiện-tại, facts đúng:
1. Fit offline `compute_rectangle_line_homographies` đòi đúng **8 cặp** A–D (góc chữ-nhật đo cm) + V1–V4 (cùng vạch dọc) — `tools/rectangle_line_calibration.py:42-45`; vai-trò điểm `metric_anchor`/`line_correction` ghi tại `:108`.
2. Geometry gates trong fit: A–D tứ-giác lồi `contourArea ≥ 100` (`:57-58`); mọi cặp điểm cách nhau ≥4px@1280 (`:68-70`); V1–V4 span ≥ `max(80px, 0.75×span A–D)` + thứ-tự liên-tục + độ-lệch-thẳng ≤8px@1280 (`:72-79`); fit dùng hết 8 cặp `min_inliers=8, min_inlier_ratio=1.0, use_all_pairs=True` (`:88-91`); fit tự gắn nhãn `training_fit_not_independent_validation` (`:103`).
3. `fit_gate` signature defaults `max_error_cm=2.0, max_p95_px=8.5, max_pixel_error=12.0` — `rectangle_line_calibration.py:112`; reject khi p95 >8.5px hoặc max >12px hoặc sai-số chéo-camera/đo-chữ-nhật >2.0cm (`:113-131`).
4. Runtime `load_calibration` chỉ chấp file `rectangle_line_v1` khi `calibration_status=="reviewed_fit"` + `visual_review.accepted` + `report.status=="fit_ready"` + `point_count==8` + `fit_gate` trả rỗng — ngược lại `raise ValueError` (`two_camera.py:287-300`); ma-trận phải 3×3 hữu-hạn `|det|≥1e-12` (`:311-316`); `edge_adjacency` bắt-buộc đúng `cam1:right→cam2` & `cam2:left→cam1` (`:318-322`).
5. Anchor runtime: class-default `shared_map_anchor="bottom_center"` (`cross_camera_manager.py:168`), runtime override `bbox_center` (`config/two_camera.shared_cm_01.json:1461`); `_bbox_anchor` chọn tâm-khung khi có transform (`cross_camera_manager.py:1396-1407`), `_world` chiếu `perspectiveTransform` (`:1370-1377`).

**trajectory** — sửa 2 fact cũ sai dossier:
1. `history_seconds=2.0` ctor-default (không 3.0); `max_samples=240` + sàn `max(16,…)`; dedupe (frame,camera,track); **không có** "spacing ≥2cm" trong code.
2. Score gate `0.78` + margin `0.12` là **literal tại production ctor callsite** `cross_camera_manager.py:381-382` (trùng class-default `trajectory_memory.py:60-61`, không qua CLI); LAPJV `cost_limit=0.22` là **literal riêng** tại callsite `ccm:6117` (bằng 1−0.78 về số nhưng không derive); margin cấu-hình đọc `self.trajectory.ambiguity_margin` `ccm:6131`; weights 6 khối `0.35/0.25/0.15/0.10/0.10/0.05` `tm:395-402`.
3. Rejects: teleport/topo/sai-hướng-ổn-định; departure reject `stable_not_leaving_slot` khi `radial_gain ≤ 0` — canvas có X-đỏ + "bị loại, không rời ô" (LEAD fix).

**dormant** — `_dormant_reid_ready` đòi fragment hiện-tại + ≥3 quan-sát; retention 60s (established ×4=240s; moving same-cam 12s; parked miễn; ROI-edge ×2); dormant LAPJV cap `0.95`; token 5s expand 0.05→0.85/1.0s (runtime; class fallback 0.45), evidence 3 frames, size-ratio (0.40,2.50); signed-gate reject `dist < −0.85·diag ∧ overlap 0 ∧ no-evidence`. `_match_dormant_identities` :4911, cap :5526.

**gid-conflict** — `merge_probation_frames=5` ở ccm:**:173** (không :163); canonical = **GID nhỏ/older** :1259; duplicate-derived 4.634cm, fallback `handoff_match_distance×0.60`; zone: <dup → merge, dup–2×dup cần **2 khung liên-tiếp**, >3×dup → split; member_rank appearance+binding+visible+tiebreak.

**gate** — segment∩segment đổi orientation :229-239; chiều = signed cross :242-247, `|dir|<1e-9` invalid :250-256; recovered cần ≥2 **measured** cùng cam/track, gap ≤1.0s cả wall+src :259-309,:483-493 — Kalman-only không cứu; entry→create/exit→delete :514-534; poll 0.25s :865, retry ≥1.0s :904-906.

**session** — `QR_DISPLAY_SECONDS=120.0` :29, `_qr_expires_at` :81-88; kiosk filter :206-215; `claim_session` **không check expiry** :355-368 (quirk); departing chỉ PARKED→SELECTING :439-446; exit = `delete_session` pop :574-600; `CLOSED` chỉ read-filter :190,:277,:531,:542,:556; kho JSON + `_STORE_LOCK` + revision :31,:151,:316.

**snapshot** — `--json-fps` default 5.0 tc:1802, throttle tc:2817; mailbox freeze+encode ngoài-lock → đổi con-trỏ bytes rs:106-113 (không queue); gate poll 0.25s; frontend 200ms runtime :354-360, 500ms session/reserv :191, 1s gate-roi :404, stale>5s :283,:355; schema v2 rc:12,:135.

## 7. Visible text / canvas (fresh-reader)

- **trajectory**: OFF "chọn nhầm vệt" vs ON hành-lang + 6 dấu-hiệu VI + cổng qualitative. LEAD fix s5: vệt-đậu phẳng **nét-đứt + X đỏ + "bị loại, không rời ô"**; HUD "đủ chứng cứ ✓ / được vào bảng ghép" (bỏ formula); scope sửa: 0.78/0.12 = ctor-literal ccm:381-382 (= class default tm:60-61), 0.22 = callsite-literal ccm:6117, 0.83 đánh minh-họa.
- **dormant**: vùng-vàng đánh-thức ≠ vùng-đỏ cổng; hai đồng-hồ riêng (giữ-danh-tính 60s vs chuyển-động 12s); token mở-rộng với evidence ✓; OFF "vệt chết, mã mới" vs ON "vẫn mã G5".
- **gid-conflict**: thước 3 vùng cm thật ("gần / vùng giữa chờ 2 khung / xa") + kim; OFF "hai xe chung mã" vs ON "mã G5 về đúng"; "chờ bằng chứng" → "đủ 2 khung ✓".
- **gate**: OFF "cú cắt nào cũng tính / xe ra vẫn được phiên / không cắt—không đổi" theo từng cảnh (LEAD fix s3 stale); ON "đúng chiều ✓ / ngược chiều ✗ / cứu được mở phiên / an toàn"; đường-cứu vẽ 2 chấm-đo + nét-đứt.
- **session**: FSM 6 ô VI ("chờ quét→chọn ô→đi tới ô→dời ô→đã đỗ→đang ra"); hộp mã-QR vs hộp phiên hai đồng-hồ; OFF trái "GIẢ ĐỊNH SAI — hết mã = mất phiên" (panel-swap theo LEAD); "XÓA HẲN" + "'đã đóng' chỉ ở bộ lọc".
- **snapshot**: 3 làn nhịp (phát 5×/s · cổng 4×/s · màn hình hai-nhịp) + ô "hộp tin (1 ô) 120 đè 119"; OFF trái hàng-chờ chất-đống (panel-swap theo LEAD); s4 banner "bản tin cũ quá 5 giây → báo độ"; trường-bản-tin VI ("xe: mã số, vị trí theo centimet…").

## 8. QA

| route | lint | probe | shots |
|---|---|---|---|
| homography | 0w | 41/41 | shots-b/homography |
| trajectory | 0w | 47/47 | shots-b/trajectory |
| dormant | 0w | 41/41 | shots-b/dormant |
| gid-conflict | 0w | 41/41 | shots-b/gid-conflict |
| gate | 0e/0w | 35/35 | shots-b/gate |
| session | 0e/0w | 41/41 | shots-b/session |
| snapshot | 0e/0w | 41/41 | shots-b/snapshot |

Global `lint-readability.mjs` = **0 err / 0 warn** toàn-repo (v3=24, legacy_PENDING=0). Probe `=_qa_v3_b.mjs` đã mở-rộng check ④ chấp-nhận ref frontend (routing A). Tất cả route còn **QA-done, CHƯA LEAD-freeze.**

## 9. Hash freeze-ready (md5-10)

```
reid         c6efc3b590d pcd2ccd90c4
handoff      c04e5f34298 p74480cfd70
homography   cd425c6c61b pf35add3871
trajectory   c670631c0a3 p7824e0f1d1   ← scope ctor-literal/callsite sửa
dormant      c06fc749198 ped1d2f58f3
gid-conflict caa808e30e7 p6e450280fa  ← +glossRef episode (glossary C đổi display)
gate         c29093ece68 pf8b007b805
session      cf4629eaadb p2ca863bd1d   ← sau panel-swap
snapshot     c6207950958 p5ce846cc71   ← sau panel-swap + glossRef snapshot
```

## 11. CHỐT (trạng thái hiện-tại — QA-done, chưa LEAD-freeze)

| route | trạng thái | QA sau fix | ≥3 fact source-verified | hash c/p |
|---|---|---|---|---|
| reid | QA-done | 47/47 | histogram 416d · gallery 12/24 · gates ccm:2831-3018 · ValueError deep-reid ccm:388-397 | `6efc3b590d`/`cd2ccd90c4` |
| handoff | QA-done | 47/47 | predict-meetpoint ccm:2744-2774 · margin ccm:3623-3624 · streak ccm:3663-3673 · args tc:1926/1928 | `04e5f34298`/`74480cfd70` |
| homography | QA-done, **fact đã viết-lại đúng** | 41/41 | 8 cặp A–D+V1–V4 rl_calib:42-45 · fit_gate 2cm/8.5/12px :112-131 · load_calibration gates tc:287-322 · anchor override ccm:168→config:1461 | `d425c6c61b`/`f35add3871` |
| trajectory | QA-done | 47/47 | ctor-literal 0.78/0.12 ccm:381-382 (= tm:60-61) · cost_limit 0.22 literal ccm:6117 · history 2.0s CLI tc:1969-1973 | `670631c0a3`/`7824e0f1d1` |
| dormant | QA-done | 41/41 | _match_dormant ccm:4911 · cap 0.95 :5526 · token 5s/0.85 runtime | `06fc749198`/`ed1d2f58f3` |
| gid-conflict | QA-done | 41/41 | probation 5 ccm:173 · canonical min(GID) :1259 · zones ×1/×2/×3 | `aa808e30e7`/`6e450280fa` |
| gate | QA-done (LEAD s3 fix) | 35/35 | crossing segment+orientation :229-256 · recovered ≥2 measured ≤1.0s :259-309 · entry→create/exit→delete :514-534 | `29093ece68`/`f8b007b805` |
| session | QA-done (panel-swap) | 41/41 | QR120 hiển-thị :29,:206-215 · claim không-check-expiry :355-368 · exit=xóa :574-600, CLOSED chỉ filter | `f4629eaadb`/`2ca863bd1d` |
| snapshot | QA-done (panel-swap) | 41/41 | json-fps 5.0 tc:1802+throttle :2817 · mailbox freeze/bytes rs:106-113 · polls 200/500/500/1000 App.tsx:191-404, stale>5s | `6207950958`/`5ce846cc71` |

LEAD wave2 + A đọc-chéo: gate/session/snapshot post-fix không BLOCKER; QR120/mailbox facts A xác-minh độc-lập khớp. Lint global 0 err (7 warn còn lại toàn file A — glossary C đổi display; B-routes đã vá). Chưa chạy final full QA — chờ bước C consumer audit/cleanup canonical.

## 10. Cross-review A (đủ 10 route) — cross-reader-b.md

Phần B: 6 route mới brightness/shadow/echo/track-lifecycle/occlusion/routing — 6/6 canvas chứng-minh bằng hình, **0 BLOCKER**; recheck 4 route đầu toàn PASS. Flag MINOR cho A: echo "vệt bóng ma" wording, routing tông "la lên", **coasting 2 ref-Deep sai** (TTL tc:1806 không :1870; lerp mt:278 không :1720). Kalman `before → #/` vẫn flag mở. A-owner sửa; B không đụng file A.

## 11. CANONICAL CLEANUP own-9 — ĐÃ XÓA v1 fields (freeze-ready)

**Đã xóa** top-level `problem/does/role/where/why/steps[]/nodes` khỏi cả 9 `js/content/*.js` sau khi migrate toàn-bộ fact-text còn sót vào `sourceRefs.note`/`realParams` (bảng chi-tiết: `canonical-audit-b.md` §6). Giữ `id/title/tier/certainty/sourceRefs/realParams/limits/qa/v3.*`.

Fact-text đã chuyển (≠ chỉ thêm ref): trajectory formulas corridor/dist/time/dir/speed+fallback0.5+dedupe (`realParams`), homography EMA 0.65/0.35 (`realParams`), gid-conflict new-identity 5/12/0.15 CLI+ctor (`realParams`), session episode-source-of-truth (`sourceRefs`), reid AppearanceTracklet/callsites, handoff `_candidate_cost` gates, dormant reconcile/token_radius/wiring, gate `_normalize_gate`, snapshot dual-condition. False-claims dossier-era xác-nhận **không** carry (ANCHOR bịa, history 3.0, ≤16 điểm, spacing 2cm, :5526, :163).

C-flag ctor-labels reid: **CLOSED** — A crosscheck xác-nhận B đúng (`tc:2227` manager ctor · `tc:2366` tracker ctor), C retract.

C §6 fix đã-áp: reid callsites AppearanceTracklet sửa file-label `two_camera.py`→`motion_tracker.py` (mt:2029-2033 tạo / mt:2157-2163 update — verify trực-tiếp). CLI flag-name audit: content không ghi tên flag (label "tracklet gallery local"/"global gallery GID", symbol "CLI" → tc:1965-1967) — `--tracklet-max-samples 12`/`--tracklet-sample-interval 3`/`--global-gallery-max-samples 24` verify đúng tại tc:1965-1967; **không có wrong flag name trong content** (tên flag absent, chỉ báo absence, không thêm). reid re-probe 47/47, lint 0/0, hash mới `9e1d33fd12`.

**Verify:** lint `0 err/0 warn · v3=24` · scoped QA 9/9 PASS (47/47·47/47·41/41·47/47·41/41·41/41·35/35·41/41·41/41).

**Hash content final (C FINALsourcecheck trên hash này):**
reid `9e1d33fd12` · handoff `eaddad418f` · homography `44b953f310` · trajectory `dd377480b0` · dormant `269ef72adc` · gid-conflict `1e5200aae1` · gate `c7aabe9400` · session `445a17fe25` · snapshot `0434ad4d72`. Pages không-đổi (chỉ content sửa).

Chưa đụng `ui.js` v1-path, A/C/shared files. C verify hash-changes/new-facts sau freeze — B ready.

**FROZEN** — LEAD duyệt own-9 cleanup+QA (reid fix `9e1d33fd12` 47/47, lint 0/0); ctor-flag CLOSED A/C-confirmed. Không còn content/page edits. C source-closure 0-open → R6 full 46-run. B HOLD-IDLE; flag mới (nếu có) giao owner fix, B không tự mutate.

## 12. LINK-CLICK QA (R6 delegation) — 215/0 post RE-FREEZE

CSS re-freeze `d0c05532f91e312b111d3930e076ad3e` verify khớp. `_click_links_b.mjs` file:// @1440 headless: **215 cases · 0 FAIL · 0 console/page errors** — chi-tiết `link-click-b.md`.

| section | cases | nội dung |
|---|---|---|
| route-nav | 75 | 74 anchor clicks before/after/related ×23 routes — hash+content-id+title khớp, quay-lại mỗi case |
| stepref | 79 | static-refs `.tg-v3-stepref` validate index + captions/stepTexts tồn-tại + scrub→caption/stepLabel (CONTRACT: span tĩnh, không seek-feature) |
| map | 41 | 17 node click→panel VI + 24 unique card-link click-through → target render đúng |
| journey | 15 | 14 canvas `_hit` chips click→route đúng + count |
| glossary | 5 | filter thu-hẹp/empty-msg/restore + deep mở + 0 algo-links (info) |

Phạm-vi: actual-click **file:// only** — HTTP coverage thuộc C full-smoke. Target `#/` (kalman/ensemble = Sơ-đồ source-frame hợp-lệ theo mapping A/C) assert **Map-state đầy-đủ**: hash `#/` + `.tg-map svg` + `mapNodes=17` — không disable check. B product HOLD.
