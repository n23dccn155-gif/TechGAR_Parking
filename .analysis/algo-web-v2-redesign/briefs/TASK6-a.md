# BRIEF — builder-a: Task 6 (nhóm 1+2, trang 1–9)

Bạn là builder-a (w1:p7). LEAD = Devin (w1:p6). Đọc TRƯỚC khi code:
- `D:\TechGar2\.analysis\algo-web-v2-redesign\SPEC.md`
- `D:\TechGar2\.analysis\algo-web-v2-redesign\MEGAPLAN.md` mục "Task 6"
- **Mẫu chuẩn R0 đã duyệt:** `algo-web-v2\js\pages\homography.js` — đọc kỹ giọng, khung 7 mục, cách ghi nguồn/limits trước khi viết trang đầu tiên.
- Bảng nguồn mẫu: `.analysis\algo-web-v2-redesign\notes\homography.md`

## Phạm vi
8 trang MỚI (homography đã có): `js/pages/roi-mask.js`, `parking-slots.js`, `brightness.js`, `motion-detection.js`, `contour-filtering.js`, `kalman-lapjv.js`, `track-lifecycle.js`, `occlusion-watershed.js` — đúng tên/id theo MEGAPLAN "Type consistency". `prev/next` theo thứ tự: roi-mask → parking-slots → homography → brightness → motion-detection → contour-filtering → kalman-lapjv → track-lifecycle → occlusion-watershed → (next của occlusion = tracklet-descriptor, trang của builder-b — vẫn ghi dù chưa tồn tại file; lint luật 9 chỉ kiểm id tồn tại trong các trang đã nạp — nếu lint báo prev/next lỗi thì để `prev`/`next` null ở đầu/cuối chuỗi thay vì trỏ trang chưa có). **Nạp file vào `index.html` ngay sau `homography.js`.**

Mỗi trang lặp Step A–F trong MEGAPLAN Task 6 (không gộp):
- A: bảng `giá trị → file:dòng → kind` vào `.analysis/algo-web-v2-redesign/notes/<slug>.md` (ngắn). Code là chuẩn — số trong docx/Gemini chỉ dùng khi verify được.
- B: viết trang theo schema + giọng R0.
- C: thêm glossary (`js/glossary-data.js`) + quick-values (`js/quickvalues-data.js`) cho term/giá trị mới — KHÔNG để term mồ côi, KHÔNG viết `(vi)` thủ công sau `[[term]]` (renderer tự gloss lần đầu).
- D: ≥1 ảnh thật qua `tools/annotate.py` + `tools/extract_frames.py` (spec JSON vào `tools/figures/<slug>-*.json`, nguồn tra `tools/SOURCES.md`); không có ảnh khả dĩ → `noFigureReason` hợp lý.
- E: `node qa/lint.mjs --pages=<slug>` và `node qa/e2e.mjs --pages=<slug>` phải **0 ERROR 0 WARN** (chuẩn mới của R0), ghi kết quả vào PROGRESS.md.
- F: khi xong 1–2 trang đầu báo lead để builder-b review chéo (REVIEW-<slug>.md); sửa hết lỗi nghiêm trọng.

Trang `roi-mask` đặt `interactive:'roi'`; `occlusion-watershed` đặt `interactive:'occlusion'` (component nạp ở Task 10 — placeholder sẵn). `kalman-lapjv` đặt `interactive:'assignment'` (Task 10 sẽ quyết có làm không; nếu bỏ sẽ sửa null sau).

Nguồn code gợi ý: xem bảng trong MEGAPLAN Task 6. Mục ⑥ lấy lỗi thật từ `.analysis/verify-replay/ERRORS-SUMMARY.md` khi liên quan (phantom coasting burst → track-lifecycle/motion; duplicate track → occlusion-watershed/kalman-lapjv), nhãn CONFIRMED/UNSURE đúng mức bằng chứng.

## Ràng buộc cứng
- Chỉ ghi trong `algo-web-v2/` và `.analysis/algo-web-v2-redesign/`. CẤM sửa backend/frontend/docs; `experiment_test/output/` chỉ đọc. Không revert/sửa các file backend đang modified.
- Không commit/push, không `git add algo-web-v2`.
- Nếu cơ chế trong bảng không tồn tại thật trong code → DỪNG, ghi INBOX-A.md + báo lead; không tự gộp/tách trang.
- Văn phong: câu ≤30 từ, không `→` trong prose/note, mọi số có `file:dòng` hoặc `(minh họa)`, ký hiệu `N#/T#/ccm:/tc:` chỉ trong mục ⑦.

Ghi tiến độ vào PROGRESS.md (append). Bắt đầu ngay bằng Step A của `roi-mask`.
