# Build report — Builder C (V2 pipeline: shell + engine + system pack + QA)

**Trạng thái**: **LEAD FINAL ACCEPTED** (2026-10-04) — root reproduce
`node qa-v2\verify.js` exit 0 trên frozen hashes (12+12 · 246 checks ·
58/58 refs · 0 errors), review 3 ảnh B-fix (cost-bar/vote-grid/claim-lost)
đúng. SPEC status compiled. Toàn bộ web frozen — không mutation nào nữa.

## Deliverables (chỉ file thuộc C)

| File | Nội dung |
|------|----------|
| `algo-web/index.html` | entry V2 — engine → 3 packs → app |
| `algo-web/pipeline.css` | theme shell (map SVG, detail, mobile list) |
| `algo-web/pipeline-app.js` | map 12 node · 2 view · global timeline · hash routing · token xe/GID · badge/pill ghim góc · mobile node-list |
| `algo-web/shared/pipeline-engine.js` | registry · `validateNode` siết · `createPlayer` · `mountNodeDetail` (`.detail-tp` scoped) · helpers |
| `algo-web/packs/pipeline-system.js` | 4 node C: capture (skew derive từ clock, catchup animate) · snapshot (mailbox 1-slot, stale>5s) · gate-session (vòng đời state thật) · navigation (A* 1/2-chiều, off-route 80px) |
| `algo-web/catalog.html` | bản lưu trữ catalog V1 |
| `algo-web/README.md` · `QA-V2.md` | hướng dẫn + báo cáo QA |
| `algo-web/qa-v2/verify.js` | browser QA độc lập (Playwright từ frontend/node_modules) |

Không sửa: SPEC.md, pack A/B, file V1 cũ, mọi source production.

## Frozen hashes — run cuối (sha256[0:16])

- A `packs/pipeline-local.js` = `6dee1455c790151b` (final, root 586 PASS)
- B `packs/pipeline-identity.js` = `8117e9984048deb5` (final, owner 513 PASS)
- C `packs/pipeline-system.js` = `c3fd2348aeca4674` (B checker 453/453, root chạy)
- C `pipeline-app.js` `ab03135ec3150312` · `pipeline.css` `e273f97d228d32d6`
  · `shared/pipeline-engine.js` `89e4255afa59775a` · `index.html` `c472d0bab9e1c5ae`

## Lệnh tái lập (root)

```
cd D:\TechGar2\algo-web
node qa-v2\verify.js
→ qa-v2\verify-results.json + qa-v2\screenshots\ (script tự dọn ảnh cũ)
```

Workdir bắt buộc `algo-web` (script resolve `packs/` + playwright tương đối).

## Kết quả run final (Chromium 151.0.7922.34)

- **246 frames** step-through file+HTTP — 0 blank, 0 sync-bad, ≥2 canvas
  signature/scenario; `nodeFails: []`.
- Contract `validateNode` 0 lỗi ×12; build×2 deterministic.
- Excerpt refs byte-match disk: **58/58**.
- Controls PASS 2 mode (play/pause/prev/next/reset/scrub/speed-ordering/
  scenario); map beat advance + pause; journey polyline + pill `4·11·12`;
  hash back/forward.
- **Transport scope mới (assert mỗi node, cả 2 mode)**: global `#transport`
  `display:none` trong detail + `.detail-tp` hiển thị — 12/12 PASS;
  `transportBackOnMap: true` sau back.
- Mobile 390: SVG map ẩn → `.m-node-list` 12 hàng tappable (≥40px), tap mở
  detail; không tràn ngang; canvas 372px.
- console/page/request errors: **0/0/0** cả 2 mode. 54 ảnh mới (đã dọn stale).

## Findings LEAD vòng này — kết luận thật

1. **"30ms + global transport" trong file-node-capture.png**: file đó là ảnh
   **stale** của run trước fix (tên không có `-<sid>` — verify.js cũ không
   dọn dir). Render hiện tại đúng (120ms, transport ẩn) — xác nhận trong ảnh
   `file-node-capture-skew-recover.png` của run mới + assert
   `transportScoped` 12/12. verify.js giờ xoá `*.png` cũ trước mỗi run.
2. **skew/clock nhất quán**: `tA`/`tB` chuyển thành số giây, skew derive
   `|tA−tB|` — gauge/label/state không thể lệch nhau nữa; catchup animate
   đồng hồ cam chậm quét 11.920→12.048 (skew 121→7ms).

## Giới hạn / không claim

- Canvas check = nonblank + signature + DOM sync + controls; fidelity số-liệu
  pack A/B do owner verifiers (A 586 root, B 513 owner) + peer-check C 453
  (root) đảm nhận, không phải browser QA này.
- Số trong scene là minh họa; ngưỡng production ghi kèm dẫn chứng.
- Chỉ Chromium; chưa Firefox/WebKit. `view.time` = ms.
