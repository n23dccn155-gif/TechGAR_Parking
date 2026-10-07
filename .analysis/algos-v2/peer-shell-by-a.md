# Peer review shell (by A) — `shared/pipeline-engine.js` + `pipeline-app.js` + `index.html`

## FINAL (sau khi C giao `pipeline-system.js` + fix shell)

**Phạm vi:** re-read 3 file C + browser QA THẬT (Chromium 151 qua
`@playwright/test` trong `frontend/node_modules` bằng createRequire — không
install). Script `.analysis/algos-v2/_qa_a.mjs`; ảnh `qa-shots/a-*.png`.

**Kết quả browser run (file://, viewport 1280×860):**

- `#pack-status`: `local ✓5 · identity ✓3 · system ✓4 — 12/12 node`; map
  render 12 card đúng NODE_ORDER + worker/async/feedback edges (ảnh map).
- Detail `assignment/edge` + `assignment/normal` + `roi/edge` mount đúng,
  title/explanation/state/pseudocode có mặt; controls (play, prev/next,
  reset, speed, scrub, scenario select, Trước/Sau node) render.
- **console errors 0 · pageerror 0**; file:// không request lỗi.
- **Label fix của A xác nhận trên browser thật**: edge merged — `T1`
  trái-trên, `T2` phải-trên, `d0 (merged)` dưới, đều có leader-line về tâm
  đối tượng, không chồng kể cả blob merged ở giữa; normal — `T1`,`T2` trên,
  `d0`,`d1` dưới, đọc được.
- QA-V2.md của C (246 frame file+HTTP, 0 fails) đối chiếu khớp với run của A.

## Findings v1 — trạng thái sau fix của C

| # | Issue v1 | Trạng thái (verify) |
|---|----------|---------------------|
| 1 | Units `view.time` | **CLOSED** — engine giờ truyền `time:elapsedInFrame` ms + `elapsedInFrame`/`totalElapsed`/`frameIndex`/`playing`; QA-V2 chốt ms trong SPEC; B fix pulse phía pack. |
| 2 | `sc.build()` không try/catch | **FIXED** — `selectScenario` bọc try/catch + err-banner fallback frame (engine:511-515); validateNode cũng gọi build() trong try (:103). |
| 3 | 2 player sống trong detail | **FIXED** — `showDetail` gọi `player.pause()` + ẩn `#transport` (app:375-377); transport detail đổi class `detail-tp`. |
| 4 | speedSel lệch sau đổi scenario | **FIXED** (C ghi QA-V2; code sync khi remount). |
| 5 | dead vars | nit — không đáng chặn. |
| 6 | validateNode lỏng | **FIXED** — giờ check id trùng scenario, build() throw, ≥3 frames, title/explanation/durationMs/state-rỗng/scene, activeLines bounds, JSON-safe, `dupNodeIds()` (:95-123,:50-57). |
| 7 | `String(state)` → `[object Object]` | **FIXED** — render state `JSON.stringify` cho object (:489). |

**Verdict: PASS** — shell hoàn chỉnh 12/12 node, contract đúng, findings đóng.
Giới hạn: QA của A chỉ Chromium file:// + ảnh 4 màn; pixel-oracle per-frame và
HTTP/mobile nằm ở QA-V2 của C. Không sửa file C.
