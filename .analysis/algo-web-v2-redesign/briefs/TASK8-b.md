# BRIEF — builder-b: Task 8 (nhóm 3+4, trang 10–15)

Bạn là builder-b (w1:p8). LEAD = Devin (w1:p6). Đọc TRƯỚC khi code:
- `D:\TechGar2\.analysis\algo-web-v2-redesign\SPEC.md`
- `D:\TechGar2\.analysis\algo-web-v2-redesign\MEGAPLAN.md` mục "Task 8"
- **Mẫu chuẩn R0 đã duyệt:** `algo-web-v2\js\pages\homography.js` — đọc kỹ giọng, khung 7 mục, cách ghi nguồn/limits.
- Bảng nguồn mẫu: `.analysis\algo-web-v2-redesign\notes\homography.md`

## Phạm vi
6 trang MỚI: `js/pages/tracklet-descriptor.js`, `trajectory-reid.js`, `handoff-dormant.js`, `gid-conflict.js`, `parking-detector.js`, `slot-binder.js` — đúng id theo Type consistency. prev/next theo thứ tự trang 9→16: occlusion-watershed → tracklet-descriptor → trajectory-reid → handoff-dormant → gid-conflict → parking-detector → slot-binder → snapshot-api (đầu/cuối trỏ trang chưa tồn tại — nếu lint luật 9 báo lỗi thì để null, ghi chú trong PROGRESS). **Nạp file vào `index.html` sau các trang nhóm trước.**

Lặp Step A–F như Task 6 (bảng nguồn notes/<slug>.md → viết trang → glossary/quick-values → ảnh thật qua tools/annotate.py + tools/SOURCES.md → `node qa/lint.mjs --pages=<slug>` + `node qa/e2e.mjs --pages=<slug>` **0 ERROR 0 WARN** → review chéo bởi builder-c khi lead phối). Ghi PROGRESS.md.

Yêu cầu riêng (MEGAPLAN Task 8):
- `cross_camera_manager.py`, `slot_vehicle_binder.py`, `trajectory_memory.py` **đang modified** — dùng bản trên đĩa, ghi timestamp/hash file đọc vào `notes/<slug>.md`.
- **handoff-dormant mục ⑥ BẮT BUỘC ca E-C-002**: session `verify_cur_session_hiep_sang8`, cam2, lid35/gid1 kết thúc ≈f301 ≈(397,118); lid40/gid3 ≈f595 ≈(388,119); trajectory_score 0.6683 < 0.78, direction≈0.001, time_topology=0.0 — **đọc lại số thật từ predictions.jsonl/world_trajectory_rejections, không chép tóm tắt**. Nhãn CONFIRMED chỉ cho "cùng xe vật lý nhận GID mới"; hệ quả lên slot/session = chưa chứng minh. E-C-005, E-A-020, U2 = UNSURE; ca bị bác = REJECTED. Có thể đọc thêm `.analysis/gid-reacquire/F0-SUMMARY.md` (đã xong) làm nguồn phụ — nhưng mọi số vẫn tự verify trong backend/predictions.
- **slot-binder mục ⑥**: "xe đỗ sẵn từ trước không được track (motion-based)" là giới hạn có chủ đích/kỳ vọng (EXPECTED), không phải bug.

## Ràng buộc cứng
- Chỉ ghi trong `algo-web-v2/` và `.analysis/algo-web-v2-redesign/`. CẤM sửa backend/frontend/docs; `experiment_test/output/` chỉ đọc. KHÔNG revert/sửa file backend đang modified (đặc biệt 3 file kể trên — chỉ đọc).
- Không commit/push, không `git add algo-web-v2`.
- Cơ chế không tồn tại thật trong code → DỪNG, ghi INBOX-B.md + báo lead.
- Câu ≤30 từ, không `→` trong prose/note, mọi số có `file:dòng` hoặc `(minh họa)`, `N#/T#/ccm:/tc:` chỉ trong mục ⑦; không viết `(vi)` thủ công sau `[[term]]`.

Bắt đầu ngay bằng Step A của `tracklet-descriptor`.
