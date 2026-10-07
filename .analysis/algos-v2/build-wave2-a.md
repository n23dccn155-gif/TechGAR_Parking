# build-wave2-a.md — A W2: 11 pages · FIX-ROUND (LEAD A5+A6) · status: **PENDING REVIEW**

Quy ước chung mọi page: `TG.ui.pageScaffold` + `TG.ui.fourBlocks` ×1 (scaffold không auto-mount) + shared `TG.player` (`onStep(0)`-sync-safe: scene consts + `lastStep` khai báo trước `create`, `d.onResize`→`render(lastStep)`) + OFF/ON cùng cảnh/seed + HUD cập nhật trong `onStep` + pcode map + `destroy()` (player+draw+pc+DOM). Số cảnh gắn `[minh họa]`/`scope:"illustration"`; tham số production kèm file:dòng trong Deep.

## A. Corrections theo LEAD A5/A6 (blocking)

| Page | LEAD flag | Fix (source-verified) | Ref |
|------|-----------|------------------------|-----|
| `motion` | "MOG2 OR temporal" sai — AND giữa hai nguồn | Rewrite content+page: `temporal = OR(diff 0.25s, diff 0.80s)` → `support = dilate(17×17)` → `mask = MOG2_fg(>200, ∨127 nếu flag) ∧ support` → ROI ∩ → OPEN3/CLOSE5 → cascade. Pcode/content/EXPL đồng bộ. ON panel có **strip mask chips trung gian** (MOG2>200 / temporal / ∧dilate17 / morph) = mask thật từng stage. OFF = MOG2-thuần: sparkle nhiễu + ghost xe-vừa-dừng sống. | mt:551-558 (OR nội temporal), :768-769 (fg>200+127), :790-793 (∧dilate), :817-827 (morph) |
| `assignment` | `cost_limit` hiểu sai là cap tổng | `cost_limit=0.90` = cap **TỪNG CẶP** (lapjv extend_cost) — ghi rõ trong pcode/EXPL/content/HUD. Tổng greedy 1.15 vs LAPJV 0.75 là so sánh TỔNG minh họa; mọi cặp ≤0.90 đều hợp lệ (kể cả 0.85 của greedy). EXPL[4] scenario-aware: normal→"cặp chốt ≤0.90", ambiguous→margin 0.31 defer. | mt:1908 |
| `assignment` | caption final lệch selector | EXPL[4] render theo `scenario`; HUD "0.25 (1 cặp defer)" khi ambiguous; ma trận .30/.50/.25/.85 khớp caption. | — |
| `kalman` | vector vượt mép + HUD thiếu số | Slope cảnh sửa (điểm không còn văng panel); arrow ×1.8 + clamp endpoint trong panel; HUD: **x,y / vx,vy / σ(P)** số cập nhật theo step (365,135 · 54.1,−6.0 · 8.0px @s5). | mt:2228/:2250 |
| `coasting` | OFF label cắt, ON chồng, confidence mơ hồ, gate sai | Gate stale = `min(0.30, **0.22**)` — pcode/EXPL/nhãn cảnh ghi `0.18≤0.22(stale)`; HUD confidence sau reacquire = `1.00 (reset sau match)`, expire = `0 (đã expire)`; nhãn OFF kéo vào trong panel; det-quay-lại offset tránh chồng. | mt:1745, :278, :149-154 |
| `roi` | nhãn context/3-frame chồng | Nhãn "vành ctx 48px" neo cạnh phải (leader tới ring), khỏi đỉnh polygon. | — |
| `shadow` | HUD OFF/ON ngược ngụ ý | OFF (flag False, class default): `fg>200` giết sỉ 127 → bóng mất **và xe đen mất** — HUD "chết-sỉ" + "MẤT / giữ (rescued)". ON (runtime): admit 127 → rọi per-contour metric → bóng xóa FILLED 0, xe đen fail band→rescued. | mt:768-779 (lý do flag), :705-728 |
| `echo` | final caption lệch selector; T5 tràn mép | EXPL[4] theo selector: twin→kết cục suppress-TTL; realpair→2 xe confirmed IoU0.91 gate fail→không suppress. Nhãn "T5 suppressed"/"WINNER" căn trong panel. | mt:2268-2280 |
| `routing` | nhãn chồng, g/h/f mờ | **A* chạy thật** trên graph minh họa: adjacency tôn trọng one-way (chỉ from→to), `h = euclid×min(edge.dist/euclid)` tính runtime; bảng open-set g/h/f số thật từng vòng pop; leader lines; route E→A→D→A12=99.6 vs chim bay 82.5. | routeEngine.ts:38-47, App.tsx:753-758/:746, voiceGuidance:98 |
| `occlusion` | HUD recovered sớm | s4 = `occluded→resolving` + "streak 1/3, CHƯA recover"; `recovered` chỉ ở s5 sau streak 3f. | occlusion_guard recover-streak |
| `brightness` | (A6 đã OK hình) | Giữ nguyên: OFF rác toàn ảnh / ON chỉ blob xe + global limit rõ. | mt:470-484 |
| `track-lifecycle` | cần final expire/suspend | Đã có selector expire/suspend + FSM strip; s5 phân nhánh rõ. | mt:2175 |
| tất cả | lịch sử peer/arbitration trong UI | Dọn khỏi chuỗi hiển thị (certainty/limits/pcode notes) trong file A. `map.js`+`manifest.js` còn chữ "peer-PASS" — **file C, báo C dọn**. | — |

## A2. Corrections vòng 2 (LEAD xem ảnh đúng bước — 6 fix nhỏ)

| Page | Fix |
|------|-----|
| `coasting` | Age bar sync state: `effAge = (state===reacquire?1.2:age)` — bar reacquire chỉ 1.2/4.5s + nhãn "1.20s (reset khi match)"; nhãn `localID/GID` neo `align:"left"` trong panel (trước căn giữa bị cắt mép). |
| `motion` | Header ON rút ngắn `BẬT — MOG2 ∧ temporal` (không đè chip ref); caption strip gọn 1 dòng. |
| `roi` | Nhãn "vành ctx 48px" nâng lên `my-62` (khỏi sát mép dưới panel). |
| `routing` | Mũi tên one-way: endpoint rút tới mép node (trừ `12/r` thay vì `8/r`, màu `#5a6b85` nổi hơn). Open-table: font 10, `slice`+**sort theo f** (hiện đúng node sẽ pop kế — trước liệt kê theo insertion → hàng xanh sai). Ghi open **sau** expand neighbors (fix từ vòng trước — table lệch thời điểm). |
| `ensemble` | Timeline dwell kéo xuống `py+36` + rail `tly+24` (khỏi đè title); badge verdict cột phải w=210; box pass-2 hạ `ph-52` tách khỏi badge. |
| `track-lifecycle` | Grep xác nhận 0 chuỗi "phần B/part B" trong UI (đã dọn từ vòng A5 — content ghi "ngoài phạm vi trang"). |

QA lại chỉ case ảnh hưởng + ensemble: `routing · ensemble · motion · roi · coasting` — 5/5 PASS (đủ 15 assertions/page), re-nav PASS, 0 console error. Shots re-verify: routing bảng `D 76.0 19.8 95.8` (xanh, pop kế) → `C 110.0` → `B 119.1`; ensemble badge/box tách; motion header + chips sạch.

## A3. Page mới W3: `ensemble` (nhận từ C)

| Hạng mục | Nội dung |
|----------|----------|
| Scene | Cùng ô B3 + cùng xe; OFF = 1 ngưỡng đơn → `ratio=0.09` kẹt trống; ON = 25 phiếu biến thể (cam=trống/lam=đầy) + **rescue lõi 0.80·ROI** + **dwell timeline** `vào 2 mẫu·0.5s / ra 3 mẫu·1.0s·exit≥12 → commit` |
| Params thật | vote loop `pd:461-530` · `empty ratio<0.12`, exit `<0.08` `:527-530` · `is_free = empty_votes ≥ 25//2=12` `:533-539` · rescue `0.80·ROI` — 0.18/0.08/0.30 `:542-547` · `edge_recheck` TẮT prod `tc:2267` · `apply_smoothing=False` → `TemporalSmoother` bypass `tc:1597` + `stable_evidence` · `accept_evidence` `pd:627-639` (vào count≥2·0.5s / ra exit_votes≥12·count≥3·1.0s; gap>1.5s reset pending) · callsite `tc:2320-2325` |
| Kịch bản | `normal` (xe trắng — OFF trật) · `core` (empty=13≥12 nhưng rescue cứu → occupied) · `leaving` (exit_votes đỏ, dwell-out 1.0s) |
| Files | `js/content/ensemble.js` + `js/pages/ensemble.js` (mới, A-owned) |
| Fix vòng 2 | OFF verdict banner trước đặt `sy+sh+52` — **rơi ngoài panel** (slot tới 0.86·h) → chỉ thấy dải đỏ cắt mép. Nay: `ratio` + badge `TRỐNG (sai!)` overlay **đáy ô B3 trong panel**; badge ON đối xứng cùng vị trí (`occupied ✓ instant` / `occupied ✓ rescue lật` / `trống ✓ dwell`) → OFF/ON so sánh trực tiếp. Vote-badge sync số thật: `13 ≥ 12 → free(raw) — chờ rescue xét` (trước in `13 < 12` sai); leaving tô xanh (đúng kết quả), HUD dwell `1.0s` (trước ~1.5s). |
| Owner checks | `_qa_w2a_v2.mjs ensemble` @1280 + @1440: 15/15 PASS (mount/step/next/prev/scrub/reset/determinism/speed/play/pause/scenario/mid/final), re-nav PASS, 0 console error. |
| Scenario shots | `_qa_ensemble_scen.mjs` → `ensemble-{white,core,leaving}-s{2,5}[-1440].png` — cả 3 kịch bản, label assert đúng bước. `core` chứng minh rescue FIRE (`13/25 ≥12` vote free → lõi 0.22/0.09/0.30 cứu → `occupied ✓ committed`); `leaving` chứng minh dwell-out (`exit 12/25 ≥12` + 3 mẫu·1.0s → trống commit, OFF báo trống vội). |

## B. Bảng page (hiện trạng sau fix)

| # | Page | Scene / storyboard | Controls | HUD / state | Refs chính |
|---|------|--------------------|----------|-------------|------------|
| 1 | `roi` | Polygon ROI **kéo-đỉnh**, vành context 48px, ô→wakeup ~1.5×[mh], 3 nhiễu ngoài lọc, xe B priority | transport + selector | Blob/Track OFF·ON | mt:614/845, svb:2653/:506, tc:2683/:1817/:1889 |
| 2 | `motion` | Xe chạy+xe đậu+cây lay+nhiễu; **mask chips trung gian thật** (MOG2>200/temporal/∧dilate/morph→det); OFF MOG2-thuần flicker+ghost | transport | Mask/Blob OFF·ON | mt:551-558/:768-769/:790-793/:817-827/:973/:203 |
| 3 | `kalman` | Đo nhiễu đỏ + filtered xanh + ellipse co/giãn + v-arrow (clamped) + ghost miss + Q/R | transport | state + **x,y / vx,vy / σ** | mt:2228/:2250/:239 |
| 4 | `coasting` | Cột che + measured + predict ◇ + decay `m+(k−m)e^(−age/0.25)` + bar age/TTL 4.5s + stale>0.40s; reacquire gate ≤0.22 | transport + selector | association_state, age, conf, ID/GID | mt:278/:1631/:1696/:149/:1745/:2012/:2175 |
| 5 | `assignment` | Gate circles, d2→10.0 đỏ; ma trận cố định; greedy 1.15 vs LAPJV 0.75 (cap **từng cặp** ≤0.90); ambiguous→defer | transport + selector | Tổng OFF/ON, ô cấm | mt:1761/:1908/:1921/:1219/:1685, tc:1811/:1871 |
| 6 | `brightness` | Mây che; lưới strided 128/chiều; shift median; ON chỉ blob xe / OFF rác | transport | shift, diff px, blob giả | mt:470-484/:451, tc:1813 |
| 7 | `shadow` | Xe sáng+bóng+xe đen; OFF=127 chết sỉ (bóng+xe đen mất); ON=metric chips→xóa bóng/rescue | transport | Bóng/Xe-đen OFF·ON | mt:705/:633/:768-779/:728, tc:2366 |
| 8 | `echo` | Mép ROI, twin T3/T5 chồng + gate chips; scenario realpair IoU0.91 không suppress | transport + selector | association_state, claims | mt:1523/:1488/:1491/:2268 |
| 9 | `track-lifecycle` | FSM TENTATIVE→CONFIRMED→LOST→expire/suspend; count+disp; OFF vũng nước→"xe T12" | transport + selector | Status, obs, disp | mt:2071/:2167/:2012/:2175, tc:1808/:1870 |
| 10 | `occlusion` | watch→merged≥1.6×→freeze→watershed provisional→defer+birth-veto→**streak 1/3→recover**; OFF hoán đổi ID | transport | association_state, group, streak | occlusion_guard:67/:109/:158/:206, mt:364/:2229 |
| 11 | `routing` | LaneGraph one/two-way; **A* runtime** open-set g/h/f; freshRoute/tick; 60px silent vs 90px>80 voice | transport + selector | Route, cost, off-dist, voice | routeEngine:38/:22/:132, App:746-762, voiceGuidance:98/:126 |
| 12 | `ensemble` | 25 phiếu + rescue + dwell timeline; OFF ngưỡng đơn trật | transport + selector | votes, rescue, commit | pd:461-530/:533/:542/:627, tc:2267/:1597 |

## C. Verification evidence (đợt fix)

Tool `_qa_w2a_v2.mjs` — Chromium/Playwright (`frontend/node_modules`, no install), `file://` + `addScriptTag` (index.html/C không chạm).

**Per-page assertions — 11/11 PASS @1280×720, T1 5/5 PASS @1440×900:**
`mount · step0 · next · prev · scrub(wait-label) · reset · determinism(canvas-hash step0 sau reset) · speed(×4) · play · pause-icon · pause-freeze · scenario-selector(đổi kịch bản → canvas đổi) · mid-at · mid-diff · final-at · final-diff` + re-nav remount PASS + **0 console/page error**.

Fix harness: trước đây nút giữ focus → ArrowRight bị guard `BUTTON` chặn → ảnh "s2" thực là step0. Nay `seek()` qua scrub + `waitForFunction` label đúng target trước mỗi shot.

Shots mới (đúng bước, assert trước chụp): `algo-web-v2/qa/shots/a/{id}-s{0,2,4}[-1440].png` — eyeball re-check: motion chips, kalman vector-in-panel + HUD số, coasting ≤0.22 + conf reset, echo caption-theo-selector, routing open-set số thật + leader, shadow HUD đúng flow, occlusion streak 1/3, roi nhãn vành không chồng.

## D. Status + blockers

- **PENDING LEAD REVIEW** — không tự approve.
- Script-tag integration vẫn thuộc C (`index.html` chưa include file A → map chưa hiện route A). File list không đổi + thêm `ensemble` khi xong (mục riêng).
- `d.ctx` cần giữ public (ellipse kalman/shadow).

## File list gửi C integrate

```
js/content/{roi,motion,kalman,coasting,assignment,brightness,shadow,echo,track-lifecycle,occlusion,routing,ensemble}.js
js/pages/{roi,motion,kalman,coasting,assignment,brightness,shadow,echo,track-lifecycle,occlusion,routing,ensemble}.js
```
Content trước page; manifest đã đủ 23 route.
