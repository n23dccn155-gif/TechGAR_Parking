# integrated-a.md — Integrated QA: 12 trang A trên index.html THẬT

Ngày: post-integration (index.html đã include đủ 22 content + 22 page script tags — C đã integrate).
Tool: `.analysis/algos-v2/_qa_integrated_a.mjs` — Chromium/Playwright, `file://.../index.html`, **không addScriptTag, không inject** — dùng đúng pipeline C (manifest + router + script tags).
Viewport: 1280×720 (run này). T1 đã có 1440 từ `_qa_w2a_v2.mjs`/`_qa_ensemble_scen.mjs` đợt trước.

## Kết quả: **12/12 PASS** (16 checks/page; scenario chỉ assert khi page có selector thật)

| Page | mount | step0 | four→Deep | controls+determinism | scenario selector (options thực) |
|---|---|---|---|---|---|
| roi | ✓ | ✓ | ✓ | ✓ | **PASS** — `normal` (xe+nhiễu ngoài ROI) / `priority` (xe rời ô→vùng ưu tiên) |
| motion | ✓ | ✓ | ✓ | ✓ | `no-selector` — scene đơn (OFF/ON cố định) |
| kalman | ✓ | ✓ | ✓ | ✓ | `no-selector` — scene đơn |
| coasting | ✓ | ✓ | ✓ | ✓ | **PASS** — `reacquire` (quay lại ≤1.5s) / `expire` (quá TTL) |
| assignment | ✓ | ✓ | ✓ | ✓ | **PASS** — `normal` (greedy vs LAPJV) / `ambiguous` (margin defer) |
| brightness | ✓ | ✓ | ✓ | ✓ | `no-selector` — scene đơn (mây che) |
| shadow | ✓ | ✓ | ✓ | ✓ | `no-selector` — scene đơn (xe+bóng+xe đen) |
| echo | ✓ | ✓ | ✓ | ✓ | **PASS** — `twin` (1 xe 2 track) / `realpair` (2 xe thật, không suppress) |
| track-lifecycle | ✓ | ✓ | ✓ | ✓ | **PASS** — `expire` (TTL) / `suspend` (dormant) |
| occlusion | ✓ | ✓ | ✓ | ✓ | `no-selector` — scene đơn (merge→recover) |
| routing | ✓ | ✓ | ✓ | ✓ | **PASS** — `silent` (60px≤80) / `offroute` (90px>80 voice) |
| ensemble | ✓ | ✓ | ✓ | ✓ | **PASS** — `white` / `core` (rescue) / `leaving` (dwell-out) |

**Controls+determinism gộp**: next · prev · scrub(wait-label) · reset · canvas-hash-determinism · speed(×4) · play · pause-icon · pause-freeze · mid/final label-assert + canvas-diff — tất cả PASS 12/12.

- **re-nav remount: PASS** (quay lại page đầu sau khi duyệt 12 trang — destroy path sạch).
- **0 console/page/request error** (requestfailed cũng được bắt — không file nào 404 trên file://).
- Shots: `algo-web-v2/qa/shots/a/integrated/{id}-s{0,2,4}.png` — label đúng bước trước khi chụp.
- `four-before-deep` = DOM check `.tg-four` trước accordion Deep — **PASS 12/12** (C scaffold auto-mount `ui.js:199-203`; insertBefore của A chỉ move node, không dup).

## Khác biệt so với đợt inject-script

- Router/manifest thật: mỗi page mount qua `#/algo/<id>` — destroy() được exercise giữa các page (re-nav PASS).
- Không còn risk "pass vì inject": script-tag đầy đủ, content registry resolve từ index.

## Correction log (LEAD A13)

- **Bug harness `check("scenario","skip")`**: chuỗi truthy → PASS ảo. Đã sửa `a.checks["scenario"]="no-selector"` + re-run toàn bộ. 5 trang không có selector theo thiết kế (single-scene) — ghi `no-selector`, không dựng UI giả.
- Selector thật = `.tg-scenario-sel select` do **từng page tự tạo** trong hudSlot (không phải `.tg-speed` của transport). Đối chiếu grep `js/pages/*.js` — đúng 7 trang có, options khớp bảng trên.
- Mỗi scenario check = đổi `selectedIndex` → dispatch `change` → assert canvas-hash đổi (không chỉ DOM tồn tại).

## Status

A-side integrated QA sạch. Chờ LEAD duyệt + C full-suite cuối. Không tự approve.
