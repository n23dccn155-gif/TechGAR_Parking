# build-wave1-c.md — Checkpoint W1 (Builder C)

**DONE — W1 scope C** · CONTRACT ổn định + shell/core + 3/3 page own verify xanh.

## Đã nộp

| Hạng mục | Trạng thái |
|---|---|
| `algo-web-v2/CONTRACT.md` | **v1 stable** — publish cho A/B (registerPage/registerContent object-form, mount/ctx/destroy, player, draw, pseudocode, ui, checklist) |
| Shell+core | index.html, css/app.css, core/{tg,draw,player,pseudocode,ui,router}.js, app.js, manifest.js (23 routes) |
| Pipeline | map.js (N0-N15 2-lane đúng pipeline-order), journey.js (khung), glossary.js |
| `content/polygon.js` + `pages/polygon.js` | DONE — reference impl |
| `content/ensemble.js` + `pages/ensemble.js` | DONE — 25-vote + rescue + dwell |
| `content/binder.js` + `pages/binder.js` | DONE — vision_primary one-way + recovery token |
| Ảnh W1 | `qa/shots/`: home-{1440x900,1280x720}, algo-{ensemble,binder,polygon}-{1440x900,1280x720} (8 ảnh) |

## Verify cuối (Playwright file://, `node qa/_probe.js`)

```
1440x900 + 1280x720: mapNodes=16 links=6
  ensemble px≈293k step 0/5→2/5 changed=true
  binder   px≈296k step 0/5→2/5 changed=true
  polygon  px≈293k step 0/4→2/4 changed=true
consoleErrors=[]  failedReqs=[]  (không script nào missing)
```

## API contract thật (A/B dùng)

- `TG.registerPage({id,title,tier,nodes,mount(el,ctx)->{destroy()}})`; `TG.registerContent({id,...,problem,does,role,where,why,steps[],sourceRefs[{file,line,symbol,note}],realParams[{name,value,unit,scope,refs}],limits,qa[{q,a}],certainty})`
- ctx chỉ `{content, router}` — page dùng `TG.*` global
- `TG.ui.pageScaffold(el,c)` → `{stage,transport,hudSlot,expl,pcBox,below}` — auto Deep/QA/refs accordions từ content
- `TG.ui.hud(el,[[k,v],…])` → `set(index,txt)` — INDEX không phải key
- `TG.pseudocode.mount(el,lines,mapFn)` → `forStep(step)`; line `{t,note}`
- `TG.player.create({steps,seed,stepMs,onStep})` → `total/step` (không phải `steps`); `transport(el)`; `p.rng()`
- `TG.draw.attach(canvas)` → `onResize` hook + `line/rect/bbox/circle/polygon/pointInPoly/arrow/trail/label/text/matrix/histogram/timeline/camFrame/destroy`; label opt `align` (không `anchor`)

## Bẫy đã fix — A/B phải biết (đã ghi CONTRACT)

1. **`create()` gọi `onStep(0)` đồng bộ** → `render` không được đọc biến `player` (chưa gán). Pattern: `lastStep` + `onResize(){render(lastStep)}`.
2. **`canvas.width=` xoá bitmap kể cả cùng giá trị** → `draw.resize()` no-op khi size không đổi; đổi thật → gọi `d.onResize` (BẮT BUỘC gán, nếu không canvas trống sau resize).
3. **Map debounce sót** — timeout/observer phải clear trong `destroy()` (map.js:164-180) — race cũ từng wipe trang mới.
4. Router fallback `destroy` khi mount fail (router.js:45).
5. Step không vẽ gì thêm → screenshot giống → QA fail; mỗi step phải đổi pixel.
6. Content strings render qua `textContent` → KHÔNG dùng HTML/entity trong `problem/does/role/where/why/qa/limits` (chỉ `sc.expl` nhận innerHTML).

## Params page đã verify (file:dòng trong content files)

- **ensemble**: vote 25 (pd:7 docstring), empty≥25//2=12 (pd:533-539), rescue (pd:542-547), edge TẮT (tc:2267), smoother bypass (tc:2324), dwell 2/3×0.5s/1.0s (pd:627-640), occ/empty 0.5/1.0s (tc:2274-2275 ← arg :1788-1789), startup placeholder (pd:643)
- **binder**: vision_primary (tc:2331), overlap gate (svb:729-731), anchor bottom-center (svb:573) vs center (svb:727), token ramp 0.05→0.85 (svb:603-609), runtime 0.85 (tc:1890→:2331) vs class 0.45 (svb:228), wake-up 1+2r ≠ gate (svb:2653-2668 vs :2875-2876)

## Còn lại (không thuộc W1 scope)

- 4 T3 (gate/session/snapshot→B, routing→A) — KHÔNG viết
- QA suite đầy đủ `qa/smoke.mjs` + QA.md + README + all-route shots — C own, sau khi LEAD chốt core stable + W2
- `qa/_probe.js`, `qa/_dbg.js` — debug tạm, sẽ dọn/tách khi viết smoke.mjs

## Reproduce

```
cd D:\TechGar2\algo-web-v2 && node qa/_probe.js
```
