# checkpoint-c.md — readability-v3 (builder C)

**Status: R2 QA ĐÃ NỘP — full smoke PASS trên bản freeze A; reports+shots đủ; STOP chờ user duyệt ROI mẫu. KHÔNG R3+.**

## R2 — QA tích hợp FINAL (2026-10-05)

- Freeze verify md5+mtime trước/sau run: content `81d237a6…` (00:10:20)
  + page `8f4a869d…` (00:13:33) — không đổi.
- lint → 0/0 · v3=2 (roi+fixture) · legacy_PENDING=22.
- `node qa/smoke.mjs` → **46 runs 0 issues · refs 844/0invalid/0skip ·
  playPixel 46/46 · consoleErr=[] netFail=[] seriousWarnings=0** ·
  `v3routes=1 [roi]` — ROI qua toàn bộ v3-asserts 2 modes
  (pcLinesVis=0, caption/stepOn sync, src4 gấp→mở, crumb VI, 8 .tg-gt,
  banned-DOM sạch).
- Ảnh C: `qa/shots/v3/roi-{1440,1280}-{top,default,pcode,src4open,tooltip}`
  (10 PNG, `_shots_r2_roi.mjs`); fixture 6 PNG giữ.
- Reports: `qa/QA-readability-v3.md` §4c + `.analysis/readability-v3/
  r2-qa-c.md` (có note glossary-case-resolved cho A).
- Port 8799 sạch sau run. Manual 5-mục §5 PENDING user. STOP gate.
- Doc-fix (LEAD review): A-final QA = **76/76×2** (thêm edgeClip) —
  sửa số 74/74 trong r2-qa-c.md; không retest, không đổi code.
- **R2 ĐÓNG** — chờ user duyệt ROI mẫu; KHÔNG R3+.

## R2 — core fixes (2026-10-04, sau review ảnh roi-v3-top-1440)

1. **Badge 340px** — root cause: chip `tg-badge tg-stage` (ui.js:331)
   đụng class `.tg-stage{min-height:340px}` của canvas container
   (app.css:45). `.tg-badges` flex-stretch kéo badge kia theo → head 335px.
   Fix: đổi class → `tg-stagechip` (ui.js + app.css + 2 selector smoke.mjs).
   Verify DOM: badges 18px, head 27px.
2. **Breadcrumb "N1+N5 › ROI masking…"** — router.js: v3 route →
   `Map › <v3.stage> › <c.title>` (fallback position.here.label);
   legacy giữ nguyên. Verify: `Map › Chặng 4/12 · Phát hiện chuyển động ›
   Vùng quan sát và ưu tiên`. Smoke v3text scan giờ gồm `#breadcrumb`
   → banned-pattern trong crumb bị bắt cho mọi route v3 sau này.
3. **Glossary lookup case bug** — `ALIASES[n]` trả canon giữ-case
   ("GID (Global ID)") so `t.toLowerCase()===canon` → miss. Fix:
   `canon.toLowerCase()` + prefix/first-token check cho cả canon lẫn n.
   Node-test: ROI MASK/mã xe/Mã Xe/roi/vùng quan sát/blob/gán… đều
   resolve; unknown → null. Chỉ wiring — không đụng định nghĩa B.
4. **Smoke hardening** (đã thêm từ vòng trước, CHƯA chạy full):
   `pcLinesVis` = `.tg-pane-code .tg-pc-line` offsetParent!=null =0 ở
   default (route `v3-pcode-visible` + fixture `pcode-visible`);
   shot default `scrollTo(0,0)`. Fixture-only run (`--routes=__none__`)
   → fixture-file OK, ảnh default đúng top+badge nhỏ+pcode ẩn.
5. `node qa/lint-readability.mjs` → **0/0 · v3=2 (roi+fixture) ·
   legacy_PENDING=22** — content A đã qua schema lint.
6. **HOLD**: full smoke + ảnh ROI mới chờ LEAD báo A stable
   (A đang sửa panel-title canvas). Không chạy/không chốt trên
   pre-A-mtime.

## Sau duyệt R1 — doc-fixes + hardening (2026-10-04)

- `r1-core-c.md` §3: ví dụ API sửa KHỚP CONTRACT §7 —
  `pageScaffold(el,c)` + `TG.pseudocode.mount(sc.pcBox,PSEUDO,map)` **1 lần
  ngoài onStep** + `onStep` trong `player.create` + `sc.v3.hud` +
  `bindPlayer` sau create+mount. (Bản cũ sai: `player.onStep=` reassign +
  mount trong onStep + `sc.hud`.) Không đổi code/API — chỉ tài liệu.
- `r1-core-c.md` §2: bỏ claim "0 pixel-diff" → ghi đúng "legacy verify
  qua smoke 46 runs (four/preDeep/refs/px/determinism/controls) — không
  chạy so-ảnh baseline".
- `QA-readability-v3.md` + report §7: wording R2 → "**R2 chỉ ROI**,
  22 trang còn lại PENDING chờ gate user R3+".
- `qa/smoke.mjs` hardening (file C-own, LEAD yêu cầu assert visible):
  `pcLinesVis` = đếm `.tg-pane-code .tg-pc-line` có `offsetParent!=null`
  → default phải =0 (route-level `v3-pcode-visible` + fixture
  `pcode-visible`); shot default `scrollTo(0,0)` trước (click next đã
  kéo viewport — ảnh cũ cắt title/summary/pos). Assertions mới **chưa
  chạy** — verify cùng run tích hợp R2.
- **CHỜ**: A báo R2-ready → chạy `lint-readability` + full `smoke.mjs`
  2 modes → cập nhật QA-readability-v3.md với `v3routes={roi}`.
  Không chạy giữa lúc A edit; không sửa file owner.

## R1 — FINAL (2026-10-04)

- `node qa/lint-readability.mjs` → **0 error 0 warn** · v3=1(fixture) ·
  legacy_PENDING=23.
- `node qa/smoke.mjs` full → **46 runs 0 issues · refs 804/0invalid/
  0skip · playPixel 46/46 · seriousWarnings=0 · consoleErr=[] netFail=[]**
  · `v3fixture_{file,http}=OK px=6284 cards=4 src4=collapsed→open
  tabs=2 gloss=6 shots=3` · v3routes=0.
- Ảnh `qa/shots/v3/` 6 PNG; log `qa/smoke-final.log`.
- Bug phát-hiện-bằng-ảnh: `.tg-pcode{display:flex}` đè `[hidden]` →
  pane mã giả lòi; fix `.tg-tab-pane[hidden]{display:none!important}` +
  smoke đổi sang computed-visibility (attr `.hidden` không đủ).
- Báo cáo: `algo-web-v2/qa/QA-readability-v3.md` +
  `.analysis/readability-v3/r1-core-c.md` (changed-files/API/lint/smoke/
  limitations/evidence).
- Còn lại theo plan: **R2 = owner migrate content** (A: ROI đầu tiên) —
  C chỉ hỗ trợ nếu LEAD giao; STOP gate đúng lệnh, không R3+.

## R1 — trạng thái giữa chừng (context ~66%, ghi theo lệnh LEAD)

**File đã sửa/tạo (tất cả syntax-OK):**
- `js/core/ui.js` — `pageScaffold` dispatch `c.v3` → `pageScaffoldV3`:
  head(tier VI+stage chip, ẩn N/T/cert) → summary → story → dải vị-trí
  +ifMissing → canvas + `.tg-v3-caption` → transport → HUD → side tabs
  [Các bước|Xem mã giả] 1-pane → `.tg-v3-cards` ×4 (④=`.tg-src4` details
  gấp sẵn: refs+certainty) → Deep+QA. Return `{…, v3:{onStep,setTab,
  paneSteps,paneCode,caption,hud,bindPlayer}}`; `expl` = sink an-toàn.
  `ui.glossWrap` bọc LẦN-ĐẦU term/element; `ui.TIER_VI/tierLabel`.
- `js/pipeline/glossary.js` — additive export cuối IIFE: `TG.glossary=
  {lookup, _aliases, _terms}` (~30 aliases; KHÔNG đụng định nghĩa).
- `css/app.css` — block `.tg-v3-*` (~45 dòng): summary/story/pos/caption/
  tabbar/steps/cards/impact/src4/gt.
- `CONTRACT.md` — §7 v3: schema field-by-field + mount pattern +
  lifecycle (steps kể step0, onStep(0) tự gọi, thứ tự page→bindPlayer,
  tab/hud) + QA thuộc default-layer + term-lần-đầu rule + fixture.
- `qa/lint-readability.mjs` — MỚI. Node-only, TG-stub eval content+
  glossary+fixture. Check: bắt buộc summary/story/position/captions/
  stepTexts/flow 3-5/rules 2-5/impacts 2-4+≥1limit/sourceRefs/glossRefs
  resolve; câu ≤25 warn >30 error; BANNED 10 pattern (N*, T*, alias:,
  file:dòng, file code, ∧¬⇒, mũi-tên, [code]/[suy-luận], snake_case,
  fn(); arrows cấm cả trong labels); v3.steps==captions==stepTexts==page
  `steps:N`; QA q/a scan banned + warn công-thức; term-first-use warn
  (glossary term xuất hiện không glossRef); CANVAS-AUDIT riêng (d.label
  >6 từ / size<13 warn). Legacy → PENDING, exit!=0 khi có error.
- `qa/smoke.mjs` — v3-aware: isV3 detect; static asserts (top/cards=4/
  src4-collapsed/tabs-default/steps-render/caption/stepOn=0/gloss/stage
  chip/tier VI/BANNED DOM-scan); interactive (caption+stepOn desync sau
  next×2, tab code→1-pane→back, src4 mở-được); `v3fixture_<mode>` block
  sau route-loop: fixture DOM+interactive+3 shots (`qa/shots/v3/`).
- `qa/fixture-v3.html` + `qa/fixture-v3.js` — MỚI, QA-owned, ngoài
  manifest, mount thẳng #view. Content `__v3fixture` đủ schema (steps=4,
  glossRefs 5: roi/blob/priority-region/mã-xe/vùng-quan-sát) — exemplar.

**QA đã chạy / kết quả hiện tại:**
- `node qa/lint-readability.mjs` → **0 error 0 warn** · v3=1(fixture)
  legacy_PENDING=23 (liệt kê rõ, không fake-PASS).
- `node qa/smoke.mjs --file-only --routes=roi,polygon --quiet` → 0 issues;
  `v3fixture_file=OK px=6284 cards=4 src4=collapsed→open tabs=2 gloss=1
  shots=3`; playPixel 2/2; journey/glossary/kb/present/fs/reduceMotion OK.
- Đã sửa fixture demo tooltip đậm hơn (ROI/blob/vùng-quan-sát needle) —
  chưa rerun smoke sau edit này (gt>1 dự kiến).
- Bug đã fix trong phiên: comment `N*/T*/` đóng block-comment sớm →
  syntax error ui.js; lint WARNs (mã-xe tooltip + canvas >6từ/size<13)
  → fixture giờ sạch, exemplar cho A.

**Còn lại trong R1:**
1. Rerun lint + smoke file-only nhanh (verify gt>1 + fixture sạch).
2. Full smoke 23 routes × file+http → `qa/smoke-final.log`.
3. `QA-readability-v3.md` (root app) + `r1-core-c.md` delivery report.
4. Báo LEAD paths; STOP (A làm R2 sau khi R1 nộp).

**Blockers:** không. Không sửa owner content/pages, không R3+.

## R1 — phạm vi & thiết kế đã chốt (trước khi edit)
- Đã đọc FULL `algo-web-v2/style-guide-v3.md` (120 dòng) + PLAN + core
  (ui/player/router/app/tg/pseudocode/manifest/glossary/css/CONTRACT/smoke).
- **Dual schema**: `pageScaffold` dispatch `c.v3` → layout mới; không v3 →
  layout cũ nguyên vẹn (23 trang legacy không đổi pixel).
- **v3 layout** theo guide §2: title + nhãn tầng VI (Cốt lõi/Bổ trợ/Tham
  khảo) + stage-chip VI (không N/T code) · summary đậm · story · dải vị-trí
  (Trước→Trang→Sau + ifMissing, arrows chỉ ở đây) · canvas + caption lớn
  sync-step · transport · side col: tabs [Các bước|Xem mã giả] chỉ 1 pane
  hiện, step-highlight sync · 4 ô mới ①Luồng(3-5)②Quy tắc(2-5)③Vấn đề(2-4,
  ≥1 giới hạn)④Mã nguồn&config = `<details>` gấp sẵn chứa refs+certainty ·
  QA + Deep accordion (realParams/limits giữ).
- **API cho A (R2)**: `sc.v3 = {onStep(i), setTab, paneCode, paneSteps,
  caption, bindPlayer(player, pc)}` — A chỉ điền content v3 + gọi onStep
  trong render; glossary tooltip qua `glossRefs` + `TG.ui.glossWrap`.
- **Glossary wiring** (allowed, KHÔNG rewrite defs): export `TG.glossary.
  lookup/ALIASES` cuối glossary.js — lint kiểm glossRefs tồn-tại alias.
- **Lint mới** `qa/lint-readability.mjs`: chỉ trang có `v3` → check schema
  (summary/story/position/captions/stepTexts/flow/rules/impacts/source/
  glossRefs/hudLabels); câu ≤25 warn >30 error; forbid N\d/T\d/alias:
  file:dòng/∧¬⇒/[code]/snake_case/call-like/→ngoài dải; length arrays
  3-5/2-5/2-4+limit; captions==stepTexts==steps(kể step 0)==page
  `steps:N`; legacy → PENDING rõ-ràng không fake-PASS. Canvas-label audit
  riêng (d.label từ page-src: ≤6 từ, size≥13 warn) — báo tách DOM lint.
- **Smoke schema-aware**: trang v3 → assert tab default=Các bước, 1-pane,
  caption đổi theo step, steps .on đúng index, 4 card + ④ đóng-mặc-định
  mở-được, default-layer DOM sạch pattern cấm; giữ nguyên playPixel/
  determinism/controls/refs/network/console cho cả 23.
- Không sửa backend/frontend/algo-web cũ; không mutate source để qua lint.

## Trạng thái bàn giao trước (context bảo toàn)
- algo-web-v2 FINAL QA đã DAT: `qa/smoke-final.log` — 46 runs (23×file+http)
  0 issues · refs 804/0/0/0 · playPixel 46/46 · reduceMotion dual-proof ·
  seriousWarnings=0 · port 8799 sạch. `QA.md` root + 58 PNG shots (54 T1 + 4 Home).
- Product + QA FREEZE theo lệnh LEAD — không rerun, không thêm feature.
- Ownership: C = core/UI/map/index/app/QA + content/page của ensemble·binder·polygon.
  A: journey + 11 trang T1/T2 + roi. B: glossary/README + 9 trang. Không sửa file owner.
- MEGAPLAN vẫn nền; PLAN-readability-v3 chỉ ghi đè §2 (khuôn trang) + phase viết lại.

## Đã đọc cho R0
- `.analysis/PLAN-readability-v3.md` FULL (134 dòng): schema v3, quy tắc viết,
  mẫu ROI §4 (voice-example), phase R0–R6, lint rules §6.
- `.analysis/algos-v2/pipeline-order.md` FULL: N0–N15 verified theo
  `two_camera.py:run()` (:2004,:2444) — loop thật, feedback ×2, async branches.
- `js/manifest.js`: route→nodes map (roi=[N1,N5], motion=[N5]…), 23 routes
  9T1/9T2/5T3 — đã assert khớp disk trong smoke-final.

## Cấu trúc chặng (chốt cho stages-c.md)
- **Chặng chính tuần tự = 12**: N0,N3,N4,N5,N6,N7,N8,N9,N10,N11,N12,N13
  (đúng yêu cầu "số chặng chính 12" — vòng lặp per-frame :2444).
- **Nằm trong**: N1 = cổng ROI/priority bên trong N5 (`_detect`, mt:834)
  + kênh feedback binder→detector (`build_recovery_priority_regions` tc:2683).
- **3 nhánh song song/async**: N2 (parking worker, mailbox :2632/:2562),
  N14 (gate/session process riêng poll 0.25s), N15 (frontend poll 200/500ms).
- Không sắp theo số → tuyến tính giả: N1⊂N5, N2‖, N14~, N15~; feedback ×2.

## Đã nộp (R0 — xong + review-1 áp)
- `.analysis/readability-v3/stages-c.md`: tên tiếng Việt N0–N15 (+SETUP),
  12 chặng chính tuần-tự + N1⊂chặng4 + 3 nhánh song-song (N2‖/N14~/N15~),
  feedback 2-chiều. **Appendix §6 R0-review-1**: N12→"Cập nhật ô đỗ và xe
  đang đỗ" (vision_primary: occupancy=vision, track chỉ định danh —
  tc:2328/svb:3841-3847); ROI strip→nearest-main-stages `occlusion(3) →
  [ROI⊂chặng4] → assignment(5)` + caption "trong bước Phát hiện chuyển
  động" (verify mt:2228-2249 + roi-source-a.md A5); N1→"Khoanh vùng quan
  sát và vùng ưu tiên"; bỏ claim ROI-trước-temporal (mask áp trong
  _detect sau predict/prepare — mt:792-1011).
- Đã đọc `roi-source-a.md` của A — D1 blocking wording (10% là rule
  priority mt:630 không phải ROI; ROI acceptance = strict support
  mt:866-908 + anchor test :979-1011) — để LEAD/A dùng khi viết R2.

## Chưa làm / chờ
- R1 core scaffold: CHỜ `style-guide-v3.md` LEAD chốt (tên chặng + nhãn tầng).
- R2 ROI mẫu (owner A viết nội dung; C chỉ scaffold sẵn).
- Không R3+, không sửa source app, không build/CDN/install.
