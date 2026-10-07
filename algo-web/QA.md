# QA — algo-web (trạng thái FINAL — APPROVED)

> **Trạng thái tổng: FINAL APPROVED — Phase 3 web deliverable đã duyệt (SPEC status COMPLETE).**
> A freeze `ee4682454f1f8b80` @08:35Z (verifier owner 6395 PASS/0 FAIL).
> B freeze `27b693e84ff600d3` @08:40Z (verifier owner **14970** PASS/0 FAIL —
> §3.7 findings + 16 self-PASS + MOG2 3-level mask + contour param-aware;
> A peer-review CV closing PASS).
> C freeze `4092aa839ac25e8d` @08:47Z sau khi đóng toàn bộ findings của
> review độc lập B (`integration-web-quality-review-b.md`, hash cũ `cb443779…`):
> LEAD đã chạy `_audit_integration.mjs` trên hash khớp packMeta → **3389/3389 PASS**;
> **B final closing PASS** trên hash này — mọi owner closure đã đạt, LEAD duyệt.

## Môi trường & cách chạy

- Browser: **Chromium 151.0.7922.34** qua `@playwright/test@1.62.0` — tái sử dụng
  `frontend/node_modules` bằng `createRequire`; `algo-web` **không cài dep riêng**
  (install riêng trước đó đã cleanup: node_modules/package*.json đã xóa).
- Full QA: `cd D:/TechGar2/algo-web && node qa/smoke.js`
- Audit độc lập integration (B): `node ../.analysis/algos/_audit_integration.mjs`
- Chế độ test: `file:///D:/TechGar2/algo-web/index.html` + HTTP root-serve
  `python -m http.server 8137 --directory D:/TechGar2` (smoke tự spawn/kill).
- `results.packMeta` = mtime + sha256(16) 6 file shell/packs — failure gắn đúng version.

## Kết quả FINAL run — 2026-10-04T08:48Z (`qa/smoke-results.json`)

| Hạng mục | file:// | HTTP root-serve |
|---|---|---|
| Pack registered | 37 + 57 + 23 = 117 | 117 |
| Contract check (236 scenario) | **236/236 OK** | — |
| Source refs path+line tồn tại | 253/253 | — |
| DOM step-through (ALL packs) | **117 lessons · 236/236 scen · 547/547 checks · 956 frames** | **117/117 lessons · 236/236 scen · 0 fail** |
| Aliases | 6/6 ok | 6/6 ok |
| Console/page/request errors | 0 / 0 / 0 | — |
| Mobile 390 | không h-scroll · canvas fit · `canvasEdgeLit`=300 | — |

### Controls (strict — không chỉ nonblank)

- `playMoved`: index 1→2 tăng thật trong timeout ∝ duration/speed ✓
- `pauseStable`: index đứng yên 400ms + `aria-pressed=false` ✓
- `speedAdvance`: **0.25→3706ms · 0.5→1840ms · 1→908ms · 2→469ms · 4→339ms** — ordering đúng ✓
- scrub / next-prev / btn-first / end-auto-pause ("10 / 10" playing=false) ✓
- scenario switch → frame "1 / n" + params reset default ✓
- route-change-while-playing → lesson mới frame "1 / n" + paused ✓

### Param-change test (mỗi param, 1 giá trị khác default, qua UI thật)

- Phạm vi: **ALL packs** — 130 params (frozen packs thêm 1 so với run trước).
- Kết quả: **130 tested · 130 changed · 130/130 checksPass · lowFrames=0 · traceKo=0**.
- Mọi fail trước đây đã đóng:
  - `invalid-spot-recovery` outcome→firstOk (was 3→2) — A freeze v3
  - `mock-scenario-emitter` scenario→stale (was 5→2) — A freeze v3
  - `contour-geometry-filter` min_ratio→0.01 (was KO) — B freeze
  - `gate-node-mutate` recompute→true (was 2/3 KO) — A freeze v2
  - `source-mode-live-gating` replay_realtime→false (was due_s mismatch + 2 frames) — C
  - `parked-evidence-dwell-legacy` v2_mode→true (was 1 frame) — C
- `traceDiff` = ground truth `buildTrace(defaults)` vs `buildTrace(changed)` —
  không assert `trace.expected == scenario.expected` ở nhánh changed-params.
- `buildTrace(id,{})` ≡ effective defaults: internal merge
  lesson-defaults→`scenario.defaultParams`→caller (SPEC §5, verified 46/46 integration).

### DOM evidence — dropdown `vehicle-svg-project/default`

- `Session gid`: SELECT 3 options, selected=`9`; `Alias map`: SELECT 2 options, selected=`chain`
- UI change thật: gid 9→7 ✓ · chain→cycle ✓ — contract `{value,label}` (SPEC đã ghi).

## Integration — closing cho B review (hash mới `4092aa839ac25e8d`)

| Finding | Outcome |
|---|---|
| P1 missing-col 2 frames | `load-input` frame trước header → 3 frames; audit `<3frames=0` |
| M1 error class | `errors:[{cls,msg}]` — ValueError (header/idx/ts) vs RuntimeError (EOF/early) phân loại thật |
| M2 claim_s key | `claim_s-new`→`claim_s_new`; check duyệt theo expected keys — thiếu result key = fail |
| M3 note | `result.note` + `verdicts_head`/`verdicts_tail` projections + checks |
| M4 ttl_s dead | `s-old` → legacy (gỡ `qrExpiresAt`, fallback `createdAt+ttl_s`); ttl=30 loại s-old khỏi waiting |
| M5 descriptions | 8 typed I/O rỗng đã điền |
| L1 state{} | replay/atomic/done states dữ liệu thật — audit `emptyState=0` |
| L3 coverage | layout_count · sid_rt1 · rejected(class map)+rejected_all · skipped · gate-config whole-map |
| L4 defaults | buildTrace wrap merge defaults→scenario→caller |
| L6 fault expected | replay reference độc lập mirror pipeline + inject fault — 70 param runs 0 invariant fail |
| metrics ≥1 | 18 done frames có summary metrics — audit `noMetrics=0` |

Audit độc lập B trên hash mới: **3389/3389 PASS** (276 frames · 70 param runs).

## Screenshots (đã chụp lại trên packs frozen, mid-ink)

`qa/screenshots/` — catalog file+HTTP · A*: `astar-find-route` · frontend:
`vehicle-svg-project`, `world-svg-project` · CV: `lapjv-assignment`,
`association-cost-matrix`, `foreground-morphology`, `handoff-lapjv-matching`,
`mog2-foreground-mask` · integration: `directed-crossing`, `parking-episode`,
`qr-token-issuance-ttl`, `replay-timestamp-pairing`, `atomic-session-store`,
`gate-config-validate-save` · mobile-390 (+canvas).

## Giới hạn (không phải fail — chưa chạy/không cover)

- Param test mỗi param 1 giá trị khác default — không quét pair-combinations.
- Canvas check = nonblank + newFrameSync + ink-diff cho shots; chưa
  per-frame pixel oracle.
- MOG2: A independent Node peer-review trên final hash `27b693…` + LEAD visual
  canvas refined (4+1=5 shots) — 3-level mask đã fix theo B.
- Owner verifiers: A 6395 PASS, B 14970 PASS — chạy phía owner, không lặp lại ở đây.

## Lệnh cho LEAD rerun

```powershell
cd D:/TechGar2/algo-web
node qa/smoke.js                              # FULL QA — mọi số ở bảng trên
node ../.analysis/algos/_audit_integration.mjs # audit độc lập integration (B)
python -m http.server 8080 --directory ..     # serve tay → http://localhost:8080/algo-web/index.html
```
