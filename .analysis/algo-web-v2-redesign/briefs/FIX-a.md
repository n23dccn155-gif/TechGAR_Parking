# BRIEF — builder-a: sửa 6 phát hiện từ REVIEW của builder-b

Bạn là builder-a (w1:p7). Review chéo xong — 6 nits cần sửa trong trang của bạn. Đọc REVIEW-<slug>.md tương ứng trong `.analysis/algo-web-v2-redesign/` cho chi tiết.

## Fix list

1. **roi-mask — polygon nguồn lệch (QUAN TRỌNG)**: sources + figure đang trích polygon CŨ `(1276,688)(1216,144)(156,143)(77,657)` / cam2 `(1228,716)...` — không file nào trên đĩa còn chứa số này (config live đã đổi sang bản mới khi user hiệu chuẩn lại 18:07). Vi phạm "mọi số có file:dòng verify được". Sửa:
   - Đọc polygon MỚI trong `backend/main_detect/config/roi_mask_cam1.json` + `roi_mask_cam2.json`, cập nhật note nguồn.
   - Tạo lại 2 figure: annotate trên capture MỚI `config/shared_map_01/attempts/cal-20261006-180750-46035b9a/capture_cam{1,2}.png` với polygon mới (spec `tools/figures/roi-cam{1,2}.json`, chạy annotate.py, verify mắt polygon khớp mép bãi).
   - Caption/prose chỉnh cho khớp ảnh mới.
   - Lưu ý: `js/core/interactive/roi.js` (builder-c) cũng hardcode polygon cũ — ghi một dòng vào `INBOX-C.md` nhờ builder-c đồng bộ hằng số.

2. **parking-slots**: formula "Core rescue" thiếu điều kiện `core_component_count ≥ 2` (parking_detector.py:425-427) — bổ sung vào expr/note.

3. **brightness**: caption figure ghi "(raw)" nhưng ảnh có annotation — sửa caption.

4. **contour-filtering**: src `anchor_outside_roi` trỏ :912 → đúng là `:1004`.

5. **kalman-lapjv**: bổ sung clamp `min(invisible,15)` trong ceiling formula + fast-path `clear_evidence` (có thể vào values/note, ngắn gọn).

6. **occlusion-watershed**: "hạn 3s tính từ lần đo sạch cuối" → làm rõ code lấy `min(last_seen)` TRÊN CÁC MEMBER.

Sau mỗi sửa: `node qa/lint.mjs --pages=<slug>` + `node qa/e2e.mjs --pages=<slug>` phải 0E/0W. Cuối cùng chạy full `node qa/lint.mjs`. Ghi PROGRESS.md.
