# QA reduced-motion `manual-dead` — independent repro (B, readonly) — 2026-10-04

**Verdict: KHÔNG phải reduced-motion bug trong player/web. Harness artifact — stale focus trên
`#btn-fullscreen` nuốt ArrowRight qua target-guard `player.js:119`.** Repro `_qa_reduced_b.mjs`.

## Evidence (repro, file:// + `emulateMedia reducedMotion:'reduce'`)

| Step | action | `activeElement` | `.tg-step-label` | kết-quả |
|---|---|---|---|---|
| A | fresh nav + `ArrowRight` | `BODY.tg-on-algo` | `0/4 → 1/4` | **manual step hoạt-động dưới reduce** |
| A | auto 1200ms | — | `0/4 → 0/4` | không auto-play (đúng `player.js:136`) |
| B | click `#btn-fullscreen` rồi `ArrowRight` | `BUTTON#btn-fullscreen` | `1/4 → 1/4` | **repro manual-dead — target=BUTTON** |
| C | click `⏭ Bước sau` | — | `→ 2/4` | `p.next()` không gate reduce |
| D | scrub input | — | `→ 2/4` | `setStep` trực-tiếp OK |
| E | `blur()` + `ArrowLeft` | BODY | `2/4 → 1/4` | arrows chết chỉ khi target=control |
| F | `goto` identical URL | DOM preserved, no reload | — | same-doc nav giữ nguyên focus |

`pageerrors=[]`, `TG.reducedMotion()=true`.

## Root cause chain (khớp sequence smoke.mjs)

1. `smoke.mjs:462` `#btn-fullscreen.click()` → focus = button (header, ngoài `#view` — persist mọi route).
2. `smoke.mjs:472` `goto('#/algo/polygon')` — **identical URL** → same-document nav, không reload,
   không hashchange, không remount → focus vẫn trên `#btn-fullscreen`.
3. `smoke.mjs:478` `ArrowRight` → `e.target.tagName === 'BUTTON'` → guard
   `player.js:118-119` `/INPUT|SELECT|TEXTAREA|BUTTON/` **early-return** → `p.next()` không chạy → `manual→0`.
4. Kb test trước đó (`smoke.mjs:437-447`) pass vì focus = body (chưa click button nào kể từ goto).
   Repro 2 lần đều fail vì deterministic — luôn đứng sau click fullscreen.

`p.next/p.prev/p.setStep` (player.js:42-47) **không** tham-chiếu reducedMotion — chỉ `opts.autoPlay`
gate ở :136. `TG.reducedMotion` (tg.js:72-73) chỉ đọc matchMedia — đúng spec.

## Unblock cho C (đề-xuất, không áp)

Trong smoke trước `ArrowRight` thêm 1 trong:
```js
await page.evaluate(() => document.activeElement && document.activeElement.blur());
// hoặc click canvas/stage (element không phải control) — bảo đảm target=BODY/canvas
```

## Minor quirk thật (FYI, không phải bug smoke đang gặp)

`player.js:119` guard BUTTON cho **cả arrows** — user click ⏮/⏭/⏯ xong bấm phím mũi-tên sẽ "câm"
(buttons chỉ cần guard Space — nút tự-activate). Design call của C, không bắt-buộc sửa để smoke pass.
