# builder-a checkpoint — Phase 1 MEGAPLAN

## DONE
- `builder-a.md` — 10/10 thẻ (T1×5: ROI/priority, motion detection, Kalman CV4, coasting/TTL, LAPJV+gating · T2×5: bù sáng, cast shadow, echo/twin, lifecycle, occlusion guard) · nodes N1, N3–N7.
- §0 runtime map verified callsite (`mt:2228-2335` + `tc:2680-2716`).
- Tất cả LEAD fixes (L1–L7) + peer-B F1–F8 đã vá — chi tiết `fix-summary-megaplan-a.md`.
- Đã trace đủ: `_cast_shadow_metrics`/`_is_cast_shadow`, `_is_confirmable`, `suspend_track`, `_create_or_reid` (mint ID mới), reacquire gates `_assign`, margin/`split_recovering`/`clear_evidence`, `_expanded_polygon`/`_token_radius`, `occlusion_guard.py` full.
- Runtime-vs-class-default phân biệt xong (hardcode vs CLI arg đã ghi đúng).

## DONE (tiếp)
- Cross-review C nộp xong + recheck v2: `peer-c-by-a-megaplan.md` — **PASS 7/7 thẻ + pipeline-order.md, 0 issue mở** (ghi mtime/hash bản verdict: builder-c.md 18:31:59 sha256 `07a9b81e…`, pipeline-order.md 18:18:23 sha256 `33465f15…`; heuristic ≤1 C đã sửa đúng — A rút gợi ý ≥1; `core_scale` đồng nhất `tc:2270`).
- **B re-review v2: PASS 10/10, F1–F7 fixed** (`peer-a-by-b-megaplan.md`).
- N1–N3 + §A đã sửa (source fidelity nhỏ): brightness=lưới 128/chiều `mt:470-484`; twin gate `max(12,0.15·extent)` + BOTH roi_clipped `mt:1523-1560` + winner `mt:1491-1499`; priority obs≥2 **trong vùng** `mt:2167-2169/2081`; thêm wakeup-polygon ≠ signed-distance gate (arbitration C §A).

## DONE (tiếp)
- `build-needs-a.md` đã gửi — canvas/HUD/interaction/API cho 10 trang dựa storyboard verified.
- **W1 content datasets**: `.analysis/algos-v2/content-a/` — **11/11 JSON** (roi, motion, kalman, coasting, assignment, brightness, shadow, echo, track-lifecycle, occlusion, routing-dossier-C) theo shape SPEC §4; mỗi file ≥4 keyframes + 2 scenario + OFF/ON cùng cảnh + params scope file:dòng. Report `build-wave1-a.md`.

## NEXT
- Chờ CONTRACT.md của C → wrap content thành `js/content/<id>.js` + mount `js/pages/<id>.js` (W2: T1→T2→T3).
- Helpers cần C thêm: `view.mode`, mask/ellipse/path/badge/gauge/grid, HUD từ `state` phẳng, `sourceRefs.excerpt` — đã ghi trong build-needs + build-wave1-a.

## BLOCKERS
- Không. Mọi `file:dòng` đã đọc trực tiếp trên source hiện tại.

## Lưu ý cho người đọc sau
- `_create_or_reid` LUÔN mint local ID mới — "reacquire" nằm trong `_assign` (window 1.5s/3.0s + appearance ≤0.30/stale ≤0.22 + area 0.35–2.8). Đừng viết "reID hồi sinh ID cũ".
- Priority polygon: `1 + 2·radius/diag`, radius = diag·(0.05→**0.85** production — CLI default `tc:1889-1897`→`tc:2330-2331`; class signature `svb:228` 0.45 chỉ là default) → hệ số **1.10→2.70×**. B đúng; A đã sửa (F3 vòng 2).
- `lost_track_ttl_seconds = max(1.0, 1.5)·3.0 = 4.5s` (`mt:149-154`).

## W2-Phase (page implementation — SPEC APPROVED_FOR_BUILD)

### IN_PROGRESS — T1 DONE (5/5), T2/T3 pending

- COMPLETED T1: `algo-web-v2/js/{content,pages}/{roi,motion,kalman,coasting,assignment}.js` (10 file mới).
  Contract `TG.registerContent/registerPage`, scaffold + `fourBlocks` ×1, shared player (onStep0-sync-safe: scene consts + lastStep trước create), OFF/ON cùng cảnh/seed, HUD + pcode map, destroy() đầy đủ.
- QA file:// thật (Playwright `frontend/node_modules`, inject script-tag — index.html không sửa):
  script `.analysis/algos-v2/_qa_w2_a.mjs`; 5/5 mounted, **0 console/page error**; shots `algo-web-v2/qa/shots/a/{id}-s{0,2,4}.png` @1280×720 + `-1440` @1440×900. Ảnh đã eyeball: LAPJV 0.75 vs greedy 1.15, ô cấm 10.00 đỏ; ROI polygon kéo đỉnh + vành 48px đứt; kalman ellipse+v-vector+ghost; coasting decay→stale→reacquire/expire.
- NEXT: T2 brightness/shadow/echo/track-lifecycle/occlusion → T3 routing → report `build-wave2-a.md` đủ 11.
- BLOCKERS: script-tag integration thuộc C (file list đã gửi LEAD); C chưa load file A → map chưa hiện icon A. Không tự sửa index/manifest.

### W2 DONE — 11/11 pages

- T2: brightness (lưới strided 128/chiều + shift median), shadow (127-admit + 4 metric chips + rescue), echo (twin gate chips BOTH-clipped/IoU0.90/max12·0.15extent + realpair kịch bản), track-lifecycle (FSM strip + count/disp + suspend vs expire), occlusion (watch→merged 1.6×→freeze→watershed provisional→recover 3f).
- T3: routing — LaneGraph one/two-way, A* open-set g/h/f, freshRoute/tick, 60px silent vs 90px>80 voice (callsite 80 vs lib 75).
- QA cuối: 11/11 mounted, 0 errors @1280 (+T1 @1440); shots s0/s2/s4 per page trong qa/shots/a/. Report đầy đủ: .analysis/algos-v2/build-wave2-a.md.
- NEXT: chờ C add script-tag (file list trong report); sau integrate cần re-QA trên index thật (không inject).

### W2 FIX-ROUND (LEAD A5+A6 blockers — chưa duyệt)

Đã sửa source-verified, chờ re-QA + LEAD duyệt:

- **motion**: semantics đúng `mask = MOG2_fg(∨127 nếu flag) ∧ dilate(temporal∨temporal,17×17)` — AND giữa hai nguồn, OR chỉ nội temporal (mt:551-558, 790-793). Content+page rewrite: strip mask chips trung gian (MOG2 fg / temporal / ∧ / morph→det).
- **assignment**: `cost_limit` = cap TỪNG CẶP ≤0.90 (mt:1908 extend_cost), không cap tổng; caption/HUD/pcode sửa; EXPL[4] scenario-aware (normal vs ambiguous-0.31-defer).
- **kalman**: vector v clamp trong panel; HUD số thật x,y/vx,vy/σ-P cập nhật theo step.
- **coasting**: stale gate ≤0.22 (mt:1745 `min(0.30,0.22)`), sample app 0.18 pass; confidence sau reacquire = 1.00 reset (không phải prior); nhãn OFF kéo vào panel.
- **roi**: nhãn vành-ctx neo cạnh phải, hết chồng nhãn ROI.
- **shadow**: HUD đúng flow — OFF `>200` giết sỉ 127 → bóng VÀ xe đen đều mất; ON xóa-chọn-lọc + rescue (mt:772-779).
- **echo**: EXPL[4] theo selector (twin vs 2-xe-thật); nhãn T5/winner không tràn mép.
- **routing**: rewrite — A* CHẠY THẬT trên graph minh họa (adjacency one-way tôn trọng chiều, h=euclid×min_ratio tính runtime, bảng open g/h/f số thật), leader lines, nhãn hết chồng.
- **occlusion**: HUD s4 không ghi recovered sớm — "resolving · streak 1/3"; recovered chỉ ở s5 (EXPL sửa khớp).
- **peer/arbitration text**: dọn khỏi UI-visible strings trong content/pages A (certainty/limits/pcode notes). `map.js`/`manifest.js` còn chữ "peer-PASS" — file C, báo C dọn.
- **brightness/lifecycle**: LEAD A6 đã review hình OK (OFF rác/ON xe+limit-global; lost hợp lý) — giữ nguyên, cần proof controls/determinism.

CHECKS còn cần sau batch này — ĐÃ XONG (xem mục dưới).

### W2 FIX-ROUND v2 + ensemble — DONE, chờ LEAD/C integrated QA

- Harness `_qa_w2a_v2.mjs`: assert **15 check/page** (mount/step0/next/prev/scrub-wait/reset/determinism-hash/speed/play/pause-icon/pause-freeze/scenario/mid+final label-assert & diff). Seek qua scrub + `waitForFunction` label + blur activeElement (tránh nút giữ focus chặn ArrowRight) → shots đúng bước.
- Kết quả: **11/11 PASS @1280, T1 6/6 PASS @1440** (5 own + ensemble), re-nav PASS, 0 console error.
- LEAD vòng-2 fixes (đã apply + verify ảnh): coasting age-bar→effAge 1.2s + GID label neo panel · motion header `MOG2 ∧ temporal` · roi ctx-label leader · routing mũi tên tới mép node + open-table sort-theo-f + snapshot sau expand · lifecycle hết "phần B".
- **ensemble** (A-owned từ W3): `js/{content,pages}/ensemble.js` — 25 vote ≥12·free + rescue lõi 0.80 + dwell-in 0.5s/2mẫu + dwell-out 1.0s·3mẫu·exit≥12 + edge_recheck TẮT + smoother bypass. OFF verdict banner sửa vào TRONG panel (trước bị cắt đáy); ON badge đối xứng. Vote-badge sync số thật (`13 ≥12 → free(raw)`, leaving xanh).
- Scenario shots: `_qa_ensemble_scen.mjs` → `ensemble-{white,core,leaving}-s{2,5}[-1440].png` (rescue FIRE + dwell-out commit chứng minh, không chỉ default).
- Report: `build-wave2-a.md` §A/A2/A3 + bảng B (12 trang).

### PEER C WEB + INTEGRATED QA — DONE (đợt mới nhất)

- **index.html đã integrate** (C): 22 content + 22 page script-tags, đủ 12 file A — không cần inject nữa.
- **`peer-c-web-by-a.md`** — binder + polygon: **PASS render/scene**; verify độc lập Monte-Carlo geometry 0.31/0.74/0.44 + vision_primary `tc:2328` + one-way `svb:3841-3843`/sticky `:1990-2017` + ramp 0.05→0.85/1.0s `svb:603-609`,`tc:1898`. **MINOR-1 = BLOCKING theo LEAD** — predicate `signed_dist ≤ diag×r` dạy sai chiều; đã verify biên: reject iff `sd < −r && ov≤0 && !continuing` (`svb:2988-2990` max_radius, `:3240-3247` radius nở, `:509` initial); keep iff `sd ≥ −r || ov>0 || evidence`; biên `sd=−r` → GIỮ. MINOR-2/3 đóng trước final: arrival cite →`:1109`+`:1919-1955`; policy `:2328` (không `:2331`). MINOR-4/5 polish.
- **`integrated-a.md`** — `_qa_integrated_a.mjs` trên index thật file://: **12/12 PASS 16 checks** (gồm `four-before-deep` DOM assert), re-nav PASS, **0 console/page/request error**. Đã sửa bug truthy-"skip"→PASS ảo: scenario-selector thật chỉ có ở **7 trang** (roi/coasting/assignment/echo/track-lifecycle/routing/ensemble — options đã liệt kê trong report); 5 trang single-scene = `no-selector` (motion/kalman/brightness/shadow/occlusion).
- CONTRACT:62 confirm `onStep(0)` qua rAF (`player.js:135`) — KHÔNG đồng bộ; A pages đã an toàn (scene consts trước create + lastStep/onResize). Tests dùng seek+waitForFunction label.
- ensemble rescue chips nudge +8px khỏi mép; scenario shots re-taken.

### W3 JOURNEY — DONE phía A (chờ C full QA / LEAD review)

- **`js/pipeline/journey.js` rewrite hoàn chỉnh** (frame W1 của C chỉ là timeline 4-lane tĩnh). Giữ API: `TG.registerPage id "__journey"`, `mount(el,ctx)`→`{destroy}`; index.html:84 đã include sẵn → C không sửa gì.
- Kiến trúc: `registerContent` in-file + `pageScaffold` (đủ fourBlocks/Deep/QA/refs chuẩn). Canvas: **world** (bản đồ minh họa 1000×560: cam1/cam2 FOV ranh 520, vạch VÀO x=150/RA y=495, ô A05, QR kiosk, token ring, A* route) + **node strip** N0→N15 hai cột, ∿=lane async (N2/N14/N15).
- 10 chặng J1–J9 đúng pipeline-order: **s1 cắt vạch TRƯỚC GID** (record skip `gsc:461-462`, cờ recovered_entry_crossing) → s2 publish → s3 session (`gsc:516`, QR 120s `sm:29`) → claim/select → A*+handoff giữ G7 → PARKED (N2 mailbox→binder→episode `svb:1953`) → dormant token `_bottom_center` → recovery `sd ≥ −diag×r` → exit→delete (`sm:585`).
- HUD: local/cam, GID, ô, session, occupancy, chặng. Params real đủ ref: poll 0.25s `gsc:865`, ≤1.0s·≥2 mẫu `gsc:259-309,480-483`, throttle `tc:2844`, off-route 80px `App:746`, vision_primary `tc:2328`.
- QA `_qa_journey_a.mjs` (index thật, không inject): **19/19 PASS @1280 + @1440**, determinism+re-nav hash khớp, 0 console/page/request errors.
- Shots: `qa/shots/a/journey/journey-{s0,s5,s9}.png` + `-1440`; eyeball thêm s{1,3,6,7,8}-check.
- Report: `.analysis/algos-v2/build-wave3-a.md`.

### W3 JOURNEY v2 — corrections sau LEAD review (DONE phía A)

- **Node-strip sai thứ tự** → LOOP chain đứng `N0→N3→N4→N5⊃N1→N6→N7→N8→N9→N10→N11→N12→N13` + ASYNC hộp tím riêng (N2/N14/N15 subtitle); fix đếm "12 loop + worker + 2 consumer"; footer ghi "highlight = liên quan chặng, ∿ chạy liên tục".
- **Click chip ↗** → `TG.router.go("#/algo/"+PRIMARY[node])`; hit-test CSS-px (ctx dpr-scaled); N0 không trang; listeners gỡ trong destroy; `canvas._hit` expose cho QA.
- Async box bẹp (bug `ah=min(84,còn-lại)`) → ASYNC_H=66 cố định; s5 route label → dưới-trái + leader.
- QA 21 checks: thêm `chips`+`click-node` (click N3 → `#/algo/kalman` + `journey-nav-kalman.png`). **21/21 PASS @1280 + @1440**, 0 errors.
- **Ensemble 3 minor peer-B đóng**: rescue 2 đường OR (central_blob minh họa | textured_dense raw≥0.30∧core≥0.02∧count≥2, pd:418-428); legacy stable_evidence=False cũng skip dwell (pd:613-615); `exit_ratio_thr` ref → tc:2273.
- **ROI fix flag từ C**: `content/roi.js` predicate signed-distance — reject `sd < −diag×initial_ratio ∧ ov≤0` (svb:508-509), `:2875-2876` chỉ tính radius, predicate `:3240-3247`/origin `:3237`, biên `sd=−r` GIỮ.
- **Peer stamp**: `peer-c-web-by-a.md` REVERIFY — 5/5 MINOR RESOLVED, PASS bản C mới nhất.

### W3 FIX vòng 3 — ensemble core-s3 chips tràn panel (DONE)

- `js/pages/ensemble.js:186-193`: 2 rescue chip xếp dọc `w=min(150, room)`, room=mép trong ON camFrame; label rút ngắn — không đổi math/semantics.
- Re-shots: `ensemble-core-s3-rescue.png` @1280 + `-1440` — đọc đủ, 0 errors.
- **C**: ensemble.js đổi mtime (layout-only) → rerun route ensemble nếu full QA đã chạy trước giờ này.

### NEXT
- Chờ C full-suite QA cuối + LEAD duyệt integrated + journey v2.
- Nhắc C lần 2: dọn "peer-PASS" trong `map.js`/`manifest.js` (C-owned).
- `d.ctx` giữ public (ellipse kalman/shadow).

### BLOCKERS
- Không phía A.
