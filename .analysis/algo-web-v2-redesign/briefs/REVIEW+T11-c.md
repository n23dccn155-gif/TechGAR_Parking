# BRIEF — builder-c: (1) review chéo builder-b, (2) backfill notes Task 9, (3) Task 11

Bạn là builder-c (w1:p9). Ba việc theo thứ tự:

## (1) Review chéo 6 trang builder-b (Step F)
`js/pages/tracklet-descriptor.js`, `trajectory-reid.js`, `handoff-dormant.js`, `gid-conflict.js`, `parking-detector.js`, `slot-binder.js` — đọc như người học, ≤10 dòng mỗi file → `.analysis/algo-web-v2-redesign/REVIEW-<slug>.md`. Đối chiếu file:dòng với code thật nếu nghi sai. Không vấn đề → "OK — không vấn đề".

## (2) Backfill notes Task 9 — THIẾU TRÊN ĐĨA
PROGRESS ghi `notes/<slug>.md` cho 7 trang của bạn nhưng chỉ `snapshot-api.md` tồn tại. Viết lại notes ngắn (giá trị → file:dòng → kind) cho: `gate-session`, `frontend-dataflow`, `routing-astar`, `voice-guidance`, `predictions-jsonl`, `replay-ground-truth`, `failure-gallery` — tái lập từ chính trang của bạn (src trong mục ⑦ + params đã verify). Mỗi file ~15-25 dòng là đủ.

## (3) Task 11 — Glossary + Số liệu + Overview + Journey (MEGAPLAN Task 11)
- `js/glossary-data.js`: merge term mọi trang đã thêm; mỗi term đủ `term, vi, def, role, example, page`; dedupe alias; sort A–Z; mỗi term trỏ trang thật. Tối thiểu phải có: bbox_center, shared_map_anchor, fit gate, EMA, dormant ReID, reprojection error, Homography, LAPJV, Kalman filter, MOG2, track, GID, lid (đa số đã có — kiểm tra đủ trường + page hợp lệ).
- `js/quickvalues-data.js`: auto-gen từ `params[]` của mọi trang (ghi chú đầu file đã hứa việc này) — viết script gen nhỏ hoặc merge tay có kiểm soát; mỗi dòng name/value/kind/src/page.
- `js/pages/overview.js` + `js/pages/journey.js`: 2 trang theo cùng schema TG.definePage (7 mục — nếu MEGAPLAN cho phép variant cho trang chung thì theo SPEC; kiểm tra validatePage yêu cầu gì rồi tuân). Overview: map pipeline → nav nhóm. Journey: chuỗi xe vào→đỗ→ra gắn tên trang.
- `js/core/search.js`: chạy thử search route với vài từ khóa Việt + Anh, sửa nếu lỗi.
- Nạp overview/journey vào `index.html`; chạy `node qa/lint.mjs` + `node qa/e2e.mjs` full → 0 ERROR 0 WARN.

## Ràng buộc
Chỉ ghi `algo-web-v2/` + `.analysis/algo-web-v2-redesign/`; không đụng backend/frontend/docs; không commit. Ghi PROGRESS.md từng bước.
