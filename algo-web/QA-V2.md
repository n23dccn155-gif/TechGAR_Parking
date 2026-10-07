# QA-V2 — Pipeline map browser verification (FINAL — LEAD ACCEPTED)

**Run**: 2026-10-04 · Chromium 151.0.7922.34 · Playwright 1.62 tái dùng từ
`frontend/node_modules` (createRequire — không install).
**LEAD/root đã reproduce**: `verify.js` exit 0 · 12+12 nodes · 246 frame checks
· 58/58 refs · 0 errors · 7 packMeta hashes khớp — SPEC status compiled.
**Lệnh tái lập** (workdir bắt buộc `algo-web`):

```
cd D:\TechGar2\algo-web
node qa-v2\verify.js
→ qa-v2\verify-results.json + qa-v2\screenshots\ (script tự dọn ảnh cũ)
```

## Frozen hashes (sha256[0:16], ghi trong verify-results.json → packMeta)

| File | Hash |
|---|---|
| `packs/pipeline-local.js` (A) | `6dee1455c790151b` |
| `packs/pipeline-identity.js` (B) | `8117e9984048deb5` |
| `packs/pipeline-system.js` (C) | `c3fd2348aeca4674` |
| `pipeline-app.js` (C) | `ab03135ec3150312` |
| `shared/pipeline-engine.js` (C) | `89e4255afa59775a` |
| `pipeline.css` (C) | `e273f97d228d32d6` |
| `index.html` (C) | `c472d0bab9e1c5ae` |

## Kết quả run final

| Suite | file:// | http:// |
|---|---|---|
| Node load | 12/12 | 12/12 (local✓5 identity✓3 system✓4) |
| Frame step-through | 123 frames — 0 blank · 0 sync-bad · ≥2 canvas signature/scenario | 123 frames — 0 lỗi |
| Transport scope | **12/12 node**: global `#transport` `display:none` trong detail + `.detail-tp` hiển thị | 12/12 |
| Contract validateNode | 0 lỗi ×12 (SPEC §5: fields · ≥2 scen · ≥3 frame · state/scene · pseudo 5–10 · activeLines⊆ · dup-id) | — |
| build() determinism | ×12 pass | — |
| Refs excerpt byte-match | **58/58** so file thật (CRLF-normalized) | — |
| Controls | play +1/2.1s · pause stable · prev/next · reset→0 · scrub→frame cuối · speed 0.5×→442ms vs 4×→3533ms · scenario switch | giống file (0.5×→450, 4×→3600) |
| Map/global | beat advance khi play · pause giữ · click→detail · back→map **transport hiện lại** · journey polyline + pill `4·11·12` · hash back/forward | giống file |
| Mobile 390 | SVG map **ẩn** → list 12 node tappable (offsetHeight≥40, tap mở detail) · không tràn ngang · canvas 372px | — |
| console/page/request errors | **0 / 0 / 0** | **0 / 0 / 0** |

**Tổng: 246 frames kiểm thử (file+HTTP) · 0 node fails · 54 ảnh** (map runtime,
journey, mid-step mọi scenario ×2 mode, mobile map + mobile detail).

## Vì sao run QA đầu fail (diagnosis thật)

Selector `.transport` trong harness match **cả 2** bar (global map + node
detail) → click nhầm control map: frame detail đứng yên → 1 canvas signature,
pseudo-highlight lệch, play=0, scrub=0, speed=false. Đó là bug
naming shell + harness, engine player đúng. Sửa: detail bar đổi class
`.detail-tp`, harness scope mọi selector vào `.detail-tp` — các assertion giữ
nguyên ý nghĩa, không waive fail nào.

Vụ ảnh "30ms + global transport" của run 17:19: file
`file-node-capture.png` **không có `-<sid>`** là ảnh sót của run trước khi fix
(verify.js lúc đó chưa dọn dir). Ảnh đúng của run hiện tại
(`file-node-capture-*.png`) đã hiển thị ngưỡng 120ms và không có global
transport. Verify.js giờ xoá `*.png` cũ trước mỗi run.

## Fix tích hợp trong run này

- **Peer A → shell**: build() try/catch + banner; pause+`display:none` global
  transport trong detail (không còn 2 player); speed đồng bộ đổi scenario;
  validate siết; nested-state `JSON.stringify`.
- **Peer B → system pack (7 must-fix)**: skew **120ms** default
  (`two_camera.py:1997`); state session thật `SELECTING_SPOT /
  NAVIGATING_TO_SPOT / EXIT_NAVIGATION`; excerpt exit byte-match indent;
  latest-only cite mailbox `:106-113`; A* two-way per-edge
  (`routeEngine.ts:22-26`); continuity ≤1s (`:487-493`); frame snapshot
  stale>5s → `_fresh_live` reject + watchdog→unknown. B checker:
  **342/342 PASS** (root chạy).
- **LEAD visual**: card không overlap · arrowhead clip tại mép card · badge
  số ghim góc ngoài card · journey pill top-right · edge-label halo · PARKING
  WORKER chỉ chứa slot-vision (binder ở main loop) · mobile list thay SVG
  thu nhỏ.
- **Capture clocks**: `tA`/`tB` là số giây; skew derive `|tA−tB|` → gauge,
  label, state luôn khớp nhau (catchup animate đồng hồ cam chậm
  11.920→12.048, skew 121→7ms).

## Giới hạn thật (không claim ngoài)

- Số liệu scene là minh họa kiểm soát; ngưỡng production ghi kèm dẫn chứng
  (120ms skew, QR 120s, off-route 80/75px, fresh ≤5s).
- Canvas check = nonblank + ≥2 signature/scenario + đồng bộ DOM; chưa
  per-frame pixel oracle cho pack A/B (fidelity do owner verifiers đảm nhận:
  **A 586 PASS** (root), **B 513 PASS** (root đã rerun, PASS),
  peer-system C by B **453 PASS** — root đã chạy (453; con số 342 ở các bản
  trước là của checker revision cũ, checker hiện tại 453 check).
- Chỉ Chromium; chưa Firefox/WebKit.
- `view.time` = ms theo SPEC; pack B đã chuyển `pulse(view.time/1000)`.
