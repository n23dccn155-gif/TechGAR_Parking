# r1-core-c.md — R1 delivery report (builder C)

Ngày nộp: 2026-10-04 · Phạm vi: **core scaffold v3 + QA tooling** ·
STOP sau R2 · không sửa content/page owner · không R3+.

## 1. File đã thay đổi / tạo

| File | Loại | Nội dung |
|---|---|---|
| `js/core/ui.js` | sửa | `pageScaffold` dispatch `c.v3` → `pageScaffoldV3`; thêm `TIER_VI/tierLabel`, `glossWrap`, block v3 (~200 dòng) |
| `js/pipeline/glossary.js` | sửa | export cuối IIFE: `TG.glossary={lookup,_aliases,_terms}` (~30 alias). Không đụng định nghĩa |
| `css/app.css` | sửa | block `.tg-v3-*` (~46 dòng) + fix `.tg-tab-pane[hidden]{display:none!important}` |
| `CONTRACT.md` | sửa | §7 "Schema v3 & lifecycle" — field-by-field, mount pattern, đồng bộ step, QA-layer rule, term-first-use, fixture |
| `qa/lint-readability.mjs` | mới | lint v3-only, node-only (TG-stub eval) |
| `qa/smoke.mjs` | sửa | v3-aware asserts + `v3fixture_<mode>` block + computed-visibility checks |
| `qa/fixture-v3.html` `qa/fixture-v3.js` | mới | QA-owned fixture (ngoài manifest) — exemplar schema đầy đủ |

**Không sửa**: bất kỳ `js/content/*.js` / `js/pages/*.js` owner nào;
không đụng `index.html` load-order (fixture là HTML riêng);
không backend/frontend app.

## 2. Layout v3 & dual schema

`pageScaffoldV3` render: head (title + `tierLabel` VI + stage chip, ẩn
N*/T*/certainty) → `.tg-v3-summary` (đậm) → `.tg-v3-story` →
`.tg-v3-pos` (before→here→after, note `⊂`/`∥`/`~` khi có) +
`.tg-v3-pos-links` (href `#/algo/*`) + `.tg-v3-missing` ("Nếu thiếu bước
này…") → canvas + `.tg-v3-caption` lớn → transport → HUD → side:
tabbar `[Các bước | Xem mã giả]` + 2 pane (đúng 1 hiện) → `.tg-v3-cards`
×4 (①luồng ②quy-tắc ③vấn-đề+biên ④`<details class=tg-src4>` gấp sẵn:
note+refs+certainty) → Deep + QA accordion.

Trang cũ (không `v3`): nhánh `pageScaffold` v1 **không đổi code** → legacy
verify qua smoke 46 runs: `four=4/1` + `preDeep` + refs + px + canvas
determinism + controls + playPixel đều PASS như baseline trước R1.
(Không claim pixel-diff so với snapshot cũ — chưa chạy so-ảnh baseline.)

## 3. API bàn giao cho A (CONTRACT §7)

```js
var sc = TG.ui.pageScaffold(el, c);                    // c = content có .v3
// sc.v3 = { onStep(i), setTab('steps'|'code'), paneSteps, paneCode,
//           caption, hud, bindPlayer(player, pc) } ; sc.pcBox === paneCode
var pc = TG.pseudocode.mount(sc.pcBox, PSEUDO, map);   // 1 lần → pane "Xem mã giả"
var player = TG.player.create({ steps: N, seed: …, onStep: function (s) {
  render(s);                    // ① vẽ canvas + cập nhật HUD như v1
  sc.v3.onStep(s);              // caption + li.on đồng bộ
}});
player.transport(sc.transport);                       // controls giữ nguyên
// HOẶC gộp: sc.v3.bindPlayer(player, pc) → tự onStep + pc.forStep mỗi step
sc.v3.hud && sc.v3.hud.set(0, "…");                   // nếu khai hudLabels
sc.v3.setTab("code");                                 // đổi tab tay nếu cần
// sc.expl = sink an-toàn (write được, không vẽ) — legacy code gọi expl vẫn OK
```

- `steps` kể **step 0**; `sc.v3.onStep(0)` được scaffold gọi sẵn lúc mount;
  `onStep(0)` của player emit qua RAF (không đồng bộ — CONTRACT §player).
- Thứ tự mỗi lần đổi bước: `onStep` của page (canvas/HUD) chạy TRƯỚC,
  rồi listener của `bindPlayer` (caption + `li.on` + `pc.forStep`).
  Gọi `bindPlayer` SAU `player.create` + `pc` mount.
- `setTab` programmatic; click tab đổi `.tg-tab.on` + `hidden` pane
  (computed-visibility verified — `hidden` attr bị `.tg-pcode{display:flex}`
  đè → fix bằng `[hidden]{display:none!important}`).
- `glossWrap(el, glossRefs)` bọc **lần-đầu mỗi term trong mỗi element**;
  needle = term | alias | `{term,label}`; title=tóm tắt glossary hiện có.
- `hudLabels` friendly (VD `["Xe thật","Nhiễu còn sống","Bước"]`) thay
  nhãn kỹ thuật; `hud.set` API giữ nguyên.

## 4. Lint — `qa/lint-readability.mjs`

- **Scope**: chỉ trang có `content.v3`; legacy → in `LEGACY PENDING`
  (liệt kê tên, KHÔNG tính pass). `exit!=0` khi có error.
- **Validate**: đủ trường schema; câu ≤25 warn />30 error; 10 banned
  pattern lớp mặc định; cardinality flow 3–5 / rules 2–5 / impacts 2–4
  +≥1 `limit:true`; `v3.steps === captions === stepTexts === page steps`;
  sourceRefs file:dòng tồn-tại; glossRefs resolve (term+alias);
  QA q/a scan banned + warn công-thức; **term-first-use warn** khi
  glossary-term xuất hiện không glossRef.
- **Tách audit**: `[DOM-LINT]` ≠ `[CANVAS-AUDIT]` (d.label >6 từ /
  size<13px → warn) — nhãn canvas không nằm trong DOM.
- Kết quả: **0 error 0 warn** · v3=1 fixture · legacy_PENDING=23.

## 5. Smoke — `qa/smoke.mjs` (đã mở rộng, giữ nguyên tiêu-chí cũ)

- Detect `info.isV3` → chạy thêm static asserts: top-blocks, posLinks≥1,
  ifMissing, cards=4, src4 gấp-sẵn, tabs=2 + mặc-định `Các bước` +
  **đúng 1 pane** (computed display/offsetParent — không chỉ
  `.hidden` attr), stepItems=nStepTexts, stepOn=0, caption có, stageChip
  + tier-VI hiện (không mã T*), glossRefs→`.tg-gt>0`, banned-DOM scan.
- Interactive per v3-route: next×2 → caption==captions[step] +
  `li.on`==step; tab code → codeShown+stepsHidden+onTab='code'; tab
  steps → quay lại; src4 mở được; reset.
- `v3fixture_<mode>` block sau route-loop: toàn bộ trên + gloss title
  + HUD cells + **3 screenshots** `qa/shots/v3/`.
- Full run: **46 runs 0 issues · refs 804 checked/0 invalid/0 skipped ·
  playPixel 46/46 · seriousWarnings=0 · consoleErrors=[] failedReqs=[]**
  · `v3fixture_{file,http}=OK … gloss=6 shots=3` · v3routes=0 (R1 đúng
  kỳ vọng: chưa có trang owner nào migrate).

## 6. Bug đã sửa trong R1

1. Comment `N*/T*/` đóng block-comment sớm → syntax error ui.js (đổi chữ).
2. `.tg-pcode{display:flex}` đè `[hidden]` → pane mã giả lòi ra dưới tab
   Các bước (phát hiện bằng ảnh fixture); fix CSS + smoke đổi sang
   computed-visibility.
3. Lint warn lần đầu: fixture thiếu glossRef cho "mã xe", canvas label
   >6 từ, 2 nhãn <13px → fixture giờ sạch = exemplar.
4. `v3text` scan gồm cả `v3.ifMissing`/stepTexts/captions → sớm bắt
   banned-pattern lọt vào text người-đọc.

## 7. Hạn chế / cho các vòng sau

- `converted_v3=1` chỉ là fixture QA; checks v3 tự áp lên route thật khi
  trang được migrate — **R2 chỉ ROI** (owner A), 22 trang còn lại PENDING
  chờ gate user R3+ (không cần sửa smoke).
- Tooltip native `title=` — đúng "wiring tối thiểu"; popover đẹp (nếu
  muốn) là phần polish sau.
- Canvas-audit ở mức cảnh-báo hình-thức, chưa verify ngữ-nghĩa nhãn.
- QA-section scan warn mức công-thức (`·≥≤±=≈%`+số) — chủ đích nhắc,
  không chặn.
- Manual checklist 5 mục §5 MEGAPLAN: **PENDING user**.

## 8. Evidence paths

- `algo-web-v2/qa/QA-readability-v3.md` — report QA chi tiết
- `algo-web-v2/qa/smoke-final.log` — full 2-mode log (2026-10-04)
- `algo-web-v2/qa/shots/v3/fixture-{file,http}-{default,pcode,src4open}.png`
- `.analysis/readability-v3/checkpoint-c.md` — checkpoint tiến-độ
- `algo-web-v2/CONTRACT.md` §7 — schema + lifecycle chính thức cho A
