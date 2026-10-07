# r2-qa-c.md — R2 QA integration report (builder C)

Ngày: 2026-10-05 · Scope: **QA tích hợp sau A freeze ROI** ·
STOP sau R2 · không sửa owner files · không approve/block.

## 0. Freeze verification (md5 + mtime — trước & sau run, không đổi)

```
js/content/roi.js  81d237a6ec681f150793b7cf0128ca69  00:10:20
js/pages/roi.js    8f4a869db4b2d85cea61fb004fcb5a78  00:13:33
```

QA chạy đúng bản A đã nộp (`r2-roi-a.md`); không sửa file owner.

## 1. Kết quả tích hợp

| Check | Kết quả |
|---|---|
| `node qa/lint-readability.mjs` | **0 error · 0 warn** · converted_v3=2 (roi+fixture) · legacy_PENDING=22 · [DOM-LINT]+[CANVAS-AUDIT] sạch |
| `node qa/smoke.mjs` (file+http) | **routes=46 issues=0** · refs checked=**844** / fileOnly=0 / skipped=0 / INVALID=0 · playPixel **46/46** · consoleErrors=[] · failedReqs=[] · seriousWarnings=0 (refsInvalid=0, netFail=0, consoleWarn=0) |
| `v3routes` | **=1 [roi]** — ROI là route v3 đầu-tiên đi qua toàn bộ asserts ở cả 2 modes |
| Specials | map 16n/6 links→roi · journey chip→kalman · glossary 56→10 · kb/present/fs/reduceMotion OK — cả 2 modes |

## 2. v3 asserts trên route ROI thật (file + http)

- Top blocks: summary/story/position(before→here→after) + ifMissing +
  posLinks — đủ.
- Tab `Các bước` mặc định; **đúng 1 pane hiện** — assert
  computed-visibility (`display`/`offsetParent`), không chỉ `hidden` attr;
  `pcLinesVis` (số `.tg-pc-line` hiển-thị) = **0** lúc default.
- `stepOn=0` lúc mount; next×2 → caption == `v3.captions[step]` và
  `li.on` == step (không desync).
- 4 ô cards; ô④ `Mã nguồn & config` `<details>` **gấp sẵn** và mở được
  (refs + certainty bên trong).
- Tier chip **"Cốt lõi"** (không "T1"); stage chip
  **"Chặng 4/12 · Phát hiện chuyển động"**.
- Breadcrumb **VI**: `Map › Chặng 4/12 · Phát hiện chuyển động › Vùng
  quan sát và ưu tiên` — `#breadcrumb` nằm trong banned-scan; không
  còn `N1+N5`/jargon.
- `.tg-gt` = **8** tooltip (glossary def qua `title=`); banned-DOM scan
  (N*/T*/alias:/file:dòng/logic-ký-hiệu/marker/snake_case/fn()/mũi-tên)
  sạch.
- Controls/determinism/playPixel như mọi route khác (shared player).

## 3. Core fixes C áp trong R2-review (đã nộp trước run này)

| # | Issue | Root cause | Fix | Evidence |
|---|---|---|---|---|
| 1 | Badge kéo ~340px đẩy nội dung xuống | chip `tg-badge tg-stage` đụng `.tg-stage{min-height:340px}` của canvas; `.tg-badges` stretch theo | class → `tg-stagechip` (ui.js/app.css/smoke selectors) | DOM probe: badge 18px, head 27px; ảnh roi-*-top.png |
| 2 | Breadcrumb `N1+N5 › ROI masking…` | router dùng `meta.nodes`/`meta.title` | v3 → `Map › <v3.stage> › <c.title>`; scan `#breadcrumb` | crumb trong shot/probe |
| 3 | `TG.glossary.lookup` miss canon có hoa | `ALIASES[n]` giữ case so với lowercase | `canon.toLowerCase()` + prefix/first-token cả canon & n | node-test: ROI MASK/mã xe/Mã Xe/roi/vùng quan sát/blob/gán/điểm neo resolve; unknown→null |
| 4 | Assert pane chỉ check `hidden` attr | `.tg-pcode{display:flex}` đè `[hidden]` | `.tg-tab-pane[hidden]{display:none!important}` + computed-visibility + pcLinesVis + scrollTop trước shot | pcLinesVis=0; ảnh default/pcode |

**Lưu ý cho A**: issue #3 (glossary case) **đã resolve ở core** —
`lookup("mã xe")` → `GID (Global ID)`. A không còn cần workaround
`{term,label}` cho các trường-hợp này (giữ cũng không hại — label đổi
tên hiển-thị vẫn là tính năng hợp lệ); đừng report nó là bug mở.

## 4. Ảnh & logs

- `qa/shots/v3/roi-{1440,1280}-{top,default,pcode,src4open,tooltip}.png`
  (10 PNG, `qa/_shots_r2_roi.mjs` — C-owned; tooltip dùng ::after
  `attr(title)` QA-only vì native title không chụp được).
- `qa/shots/v3/fixture-{file,http}-{default,pcode,src4open}.png` (6 PNG).
- `algo-web-v2/qa/smoke-final.log` — full 46-run log.
- `algo-web-v2/qa/QA-readability-v3.md` §4c — bảng R2 tích-hợp.

## 5. Trạng thái & pending

- `converted_v3=2` (roi + fixture) — **22 trang legacy PENDING chờ gate
  user R3+** (không migrate trong R2).
- A-reported QA: **76/76 ×2 viewports** (`_qa_r2_roi.mjs` — gồm edgeClip);
  C-verify độc lập
  bằng smoke chung — hai hệ-thống đồng-ý.
- Manual checklist 5 mục §5 MEGAPLAN: **PENDING user**.
- **STOP sau R2 đúng gate** — C không approve/block; chờ quyết-định
  user trên ROI mẫu.
