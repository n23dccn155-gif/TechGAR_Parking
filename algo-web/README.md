# TechGar2 — Bản đồ pipeline tương tác (V2)

Mô phỏng **giáo dục** pipeline runtime TechGar2 trong trình duyệt: camera →
tracking → handoff/GID → occupancy/binder → snapshot → gate/session → điều
hướng. Dữ liệu minh họa — không phải pipeline production đang chạy.

Catalog 117 bài V1 vẫn giữ nguyên tại **`catalog.html`** (lưu trữ, không còn
là màn chính; QA cũ trong `qa/` chỉ áp dụng cho V1, không phải QA của V2).

## Mở nhanh

- **file://** — mở thẳng `algo-web/index.html` trong trình duyệt. Không cần
  mạng, backend, tài khoản hay build.
- **HTTP** — từ project root:
  ```
  python -m http.server 8080 --directory D:\TechGar2
  → http://localhost:8080/algo-web/index.html
  ```

> Trạng thái: **FINAL — LEAD ACCEPTED** (frozen hashes trong `QA-V2.md`;
> root reproduce verify.js exit 0 · 246 checks · 0 errors).

## Có gì trong màn chính

- **Bản đồ 12 node** — main loop 1 hàng theo call order thật; nhánh parking
  worker song song (slot-vision); consumer async (gate-session, navigation);
  feedback reservations → tracker/manager (nét đứt).
- **2 view**: "Thứ tự runtime" (call order) và "Hành trình 1 xe" (timeline
  nghiệp vụ — entry QR/select trước parked).
- **Global timeline**: Play/Pause, ‹ ›, Reset, speed 0.5–4×, scrubber; token
  xe/GID chạy theo, node đang xử lý sáng.
- **Click node** → canvas animation step-through, 2+ scenario/node, 4 câu
  LÀM GÌ/VAI TRÒ/NẰM Ở ĐÂU/TẠI SAO, pseudocode highlight, state panel,
  drawer dẫn chứng file:dòng (excerpt đã byte-match source) + link file gốc.
- Hash `#/map`, `#/journey`, `#/node/<id>/<scenario>` — back/forward hoạt
  động; keyboard Space/←/→/R; mobile 390px.

## Cấu trúc file (V2)

| File | Owner | Nội dung |
|------|-------|----------|
| `index.html` `pipeline.css` `pipeline-app.js` | C | shell, map, journey, routing |
| `shared/pipeline-engine.js` | C | registry, validate, player, detail, helpers |
| `packs/pipeline-local.js` | A | 5 node: kalman/motion/roi/assignment/coasting |
| `packs/pipeline-identity.js` | B | 3 node: handoff/slot-vision/binder |
| `packs/pipeline-system.js` | C | 4 node: capture/snapshot/gate-session/navigation |
| `SPEC.md` | LEAD | hợp đồng V2 + nghiệm thu |
| `qa-v2/verify.js` | C | browser QA (Playwright tái dùng từ frontend) |
| `QA-V2.md` | C | báo cáo QA mới nhất |

Registry: `window.TechGarPipelinePacks[key] = [node,...]`, key
`local`/`identity`/`system`; node theo contract SPEC §5
(`view = {width,height,progress,time(ms),previous}`, `activeLines` 0-based).

## Verify / QA

```
cd D:\TechGar2\algo-web
node qa-v2\verify.js    → qa-v2\verify-results.json + qa-v2\screenshots\
```

(Workdir bắt buộc `algo-web` — script resolve `packs/` + `frontend/node_modules`
tương đối.) Playwright tái dùng từ `frontend/node_modules` (createRequire) —
algo-web không cài dependency riêng. Script tự dọn ảnh cũ trong
`qa-v2/screenshots/` trước khi chụp mới. Kết quả + hash frozen + giới hạn thật
trong `QA-V2.md`.

Owner verifiers (nằm ngoài algo-web):
`.analysis/algos-v2/test-local-pack.mjs` (A) · `_verify_identity_b.mjs` (B)
· `_peer_check_c_by_b.mjs` (B→C).
