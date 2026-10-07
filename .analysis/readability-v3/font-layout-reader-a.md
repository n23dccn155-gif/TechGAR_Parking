# FONT-LAYOUT READER — A (readonly · post-C-font-CSS)

**Trạng thái: ⏳ PREPARED — chờ C font-ready hash để RUN final.**

LEAD giao: sau khi C refreeze font CSS (chữ-13 mới), đọc lại layout readonly:
clip / overlap / tràn ngang / controls / HUD / card trên **roi · assignment ·
session(B) · routing + Map / Journey / Glossary** @ **1280×720 và 1440×900**.
ROI words + canvas geometry phải giữ nguyên. Không đụng CSS/content; không
duplicate font-computed của C (C owns).

---

## 1. Harness `_font_layout_a.mjs` — READY ✓

Offline `file:///`, Playwright qua `D:/TechGar2/frontend/package.json` —
không cần server.

**Per stepper route (roi/assignment/session/routing):**
- mount `.tg-v3` + đếm parts: caption/cards(4)/steps/HUD(≥5)/src4/tooltips
- text **signature dump** (summary/story/cards/stepLabels/hud/caption) →
  `_cross_dump_a/fl-{route}-{W}.json` — diff baseline ↔ post-font để chứng
  "ROI words same"
- scan tại **s0 · mid (scrub range) · pcode-tab · final**: `scanPage` bắt
  - `docOver` = document tràn ngang quá viewport
  - `clipped` = element visible có overflow hidden nhưng scroll>client (chữ bị cắt)
  - `offscreen` = element rect vượt mép viewport
- shots: `fl-{route}-s0|s{mid}|pcode|s{last}-{W}.png`

**Specials:**
- **Map** `#/`: top + click `[data-node=N2]` + `[data-node=N14]` → dump panel
  `.tg-map-panel` + scan + shot (đã verify selector khớp source map.js)
- **Journey** `#/journey`: scrub `input[type=range]` → s0/s4/s9 caption + scan + shot
  (steps qua `.tg-v3-steps li` — 10)
- **Glossary** `#/glossary`: `input[type=search]` fill "vệt" → đếm `.tg-term`,
  mở `.tg-term-deep` fold, scan + shot

**Summary output:** `N route-views · N errors · N layout flags`
(H-OVER/CLIP/OFFVP in kèm route@view+scan-point).

## 2. Smoke-run baseline (PRE-FONT, validate harness — không phải review)

Chạy trên hash hiện tại (pre-C-font) chỉ để chứng harness hoạt động:

```
14 route-views (7 routes × 2 viewports) · 0 errors · 0 layout flags
```

- Shots: `algo-web-v2/qa/shots/font-layout-a/fl-*-{1280,1440}.png` (28 ảnh)
- Dumps: `_cross_dump_a/fl-*.json` (14 file) — **baseline signature** giữ lại
  để diff post-font (ROI wording/canvas geometry so sánh story/cards/HUD text).
- Selector verify: map `[data-node]` + `.tg-map-panel` ✓, journey range-scrub
  + `.tg-v3-steps li` (10) ✓, glossary `input[type=search]` + `.tg-term` +
  `.tg-term-deep` ✓.

## 3. Checklist sẽ chấm khi RUN trên C-font-ready hash

| Mục | Pass khi |
|---|---|
| Mount + console | 0 pageerror/console-error mọi route ×2 view |
| Tràn ngang | `docOver=0`, không `offscreen` element |
| Clip | không element visible bị scroll>client (chữ-13 đủ chỗ) |
| Steps/tabs | step count đúng (5/6/5/5, journey 10), tab "mã giả"↔"Các bước" toggle, pcode ≥5 dòng không vỡ |
| Controls/HUD | `.tg-hud-cell` ≥5, caption đổi theo step, card = 4 |
| Map | N2 "luồng song song" + N14 "bất đồng bộ" panel mở, legend wrap đẹp |
| ROI words | signature dump post-font ≡ baseline (story/cards/HUD) — geometry canvas không đổi (content frozen) |
| Khoảng thở | eyeball shots mid/final không chồng nhãn, legend/flow không vỡ dòng |

**Sau RUN:** ghi hash C-font-ready + kết quả vào §F dưới, flags → owner
(C nếu layout/font; content-owner nếu wording). A không tự sửa CSS/content.

---

## §F — FINAL RUN trên C font-refreeze hash

**CSS hash verify:** `app.css = d0c05532f91e312b111d3930e076ad3e` ✓ (khớp
LEAD refreeze). `ui.js 85d9f5a7…` + `index.html 25883d21…` giữ nguyên R5-FINAL.

**Probe:** `14 route-views (7 routes × 1280×720 + 1440×900) · 0 pageerror/console-error · 0 layout flags` — không `docOver`, không `clipped`, không `offscreen` ở mọi scan-point (s0/mid/pcode/final, map N2+N14, journey s0/4/9, glossary filter+fold).

### Checklist kết quả

| Mục | Kết quả |
|---|---|
| Mount + console | ✅ 7/7 mount, 0 errors |
| Tràn ngang | ✅ `docOver=0`, 0 offscreen element cả 2 view |
| Clip (chữ-13) | ✅ 0 element scroll>client — chữ mới đủ chỗ |
| Steps/tabs | ✅ roi 5 · assignment 6 · session 5 · routing 5 · journey 10; tab "mã giả"↔"Các bước" toggle OK; pcode ≥5 dòng wrap đẹp (ảnh `fl-roi-pcode-1280`) |
| Controls/HUD | ✅ caption đổi theo step; HUD row (roi 5 ô, session 8 ô) không vỡ; player ⏮▶⏭↺ + scrub + speed select hiện đủ |
| Cards | ✅ 4/4 card mỗi stepper |
| Map | ✅ pill k/12 tách khỏi tên node; N2 panel "luồng song song" + N14 "bất đồng bộ · ngoài vòng lặp" mở đúng; legend wrap |
| Journey | ✅ s4/s9 active-chip + caption + HUD đồng bộ; nhánh async rõ |
| Glossary | ✅ filter "vệt" → 16 hits; fold "sâu hơn" mở, key/deep đọc được @1440 |
| ROI words/geometry | ✅ signature post-font ≡ baseline: story/cards/stepLabels/HUD/captions giữ nguyên; canvas geometry (đa giác ROI đứt, vành 48px, ưu tiên) như cũ — content frozen |
| Khoảng thở | ✅ eyeball s0/mid/final: nhãn canvas tách, không chồng; legend/flow không vỡ dòng |

### Shots (28) — `algo-web-v2/qa/shots/font-layout-a/`

`fl-{route}-s0|s{mid}|pcode|s{last}-{W}.png` ×4 stepper · `fl-map-{top,N2,N14}-{W}.png` ·
`fl-journey-{top,s4,s9}-{W}.png` · `fl-gloss-{top,filter,fold}-{W}.png` @1280+1440.
Dumps signature/scan: `_cross_dump_a/fl-*-{1280,1440}.json` (14).

### Kết luận

**PASS — 0 blocker, 0 risk.** Font-13 refreeze không gây clip/overlap/tràn ngang
trên phạm vi A đọc; ROI wording + canvas geometry giữ nguyên; controls/HUD/pcode/
source-fold/khoảng thở đều đọc được cả 2 viewport. Không flag owner nào.
A giữ HOLD — không sửa product files.
