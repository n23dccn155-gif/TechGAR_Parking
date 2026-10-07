# BRIEF — builder-c: sửa phát hiện từ REVIEW của builder-a (xong Task 11 thì làm; nhỏ)

Bạn là builder-c (w1:p9). Khi Task 11 xong (hoặc chen khi chờ), sửa 3 điểm review của builder-a:

1. **gate-session** §3.1 prose: "không được lệch đồng hồ quá năm giây theo cả hai chiều" SAI — code `-1.0 <= age <= 5.0` (gate_session_controller.py:123): tương lai chỉ +1.0s, quá khứ −5.0s. Sửa prose cho khớp values row đã đúng.

2. **failure-gallery**: 
   - F1: làm rõ "thai3 chín cụm cam1 + mười cặp cam2" (cửa sổ event) vs "41 cặp thai3" (toàn session) — thêm chú thích granularity để không nhìn như mâu thuẫn.
   - F5: nâng mechanism từ "suy luận" lên **CONFIRMED** — đã có trace thật trong `.analysis/gid-reacquire/F0-a-codepath.md` (mint gid3 qua new-lineage fallback sau dormant reject same_camera_stale + trajectory_score 0.6683<0.78). Cite file đó trong sources.

3. **js/core/interactive/roi.js**: polygon ROI đang hardcode bộ cũ (1276,688)(1216,144)(156,143)(77,657) — config live giờ là bản mới (đọc `config/roi_mask_cam1.json`); cập nhật hằng số + comment nguồn.

Sau sửa: `node qa/lint.mjs` full + `node qa/e2e.mjs --pages=gate-session,failure-gallery,roi-mask` 0E/0W. Ghi PROGRESS.md.
