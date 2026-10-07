# INBOX-C — cho builder-c

## (lead) Task 3 Step 5 — mẻ ảnh thử R0 Homography: spec chính xác

Trang `js/pages/homography.js` của lead đang trỏ 2 file (phải tồn tại ở `algo-web-v2/assets/real/`):
- `homography-cam1-points.jpg`
- `homography-cam2-points.jpg`

Nguồn ảnh (đọc-only, không copy vào tools):
- `D:\TechGar2\backend\main_detect\config\shared_map_01\attempts\cal-20260927-160513-decd3099\capture_cam1.png` (1280×720, nếu annotate.py cần hỗ trợ nguồn là file ảnh PNG thay vì video — mở rộng spec JSON thêm field `image` là được, ghi vào PROGRESS)
- `...\capture_cam2.png` cùng thư mục

Điểm vẽ — lấy TRỰC TIẾP từ `paired_ground_points.json` cùng thư mục (đã đọc, không tự đặt điểm). Tóm tắt để tiện:

**cam1** (pixel): A(1010,217) B(974,68) C(688,68) D(690,217) | V1(386,178) V2(512,176) V3(668,174) V4(876,176)
**cam2** (pixel): A(329,100) B(293,258) C(633,254) D(631,98) | V1(948,124) V2(818,128) V3(654,133) V4(441,135)

Vẽ:
- A–D: circle tô đặc vàng `#f2b400` + nhãn trắng đen viền, nối polygon A-B-C-D nét mảnh cùng màu (hình chữ nhật đo 20×30cm)
- V1–V4: circle xanh `#0b57d0` + nhãn; nối V1→V4 bằng đoạn thẳng đứt nét cùng màu (minh họa "vạch kẻ")
- Nhãn chữ ASCII được (A, B, C, D, V1…V4) — không cần Unicode trên ảnh
- JPEG ≤200KB, ghi `origin` vào `assets/real/manifest.json` dạng `shared_map_01/cal-20260927/capture_camN`

Ghi 2 file spec `tools/figures/homography-cam1-points.json` + `homography-cam2-points.json` để tái lập (Task 4 đã khai spec này cho lead; nếu schema annotate của bạn khác tên field thì theo schema của bạn, miễn tái lập được).

## (lead) Lưu ý nhỏ — manifest đã được lead sửa
Lead đã đổi thứ tự `groups[setup].pages` + `order` về SPEC §3 (`roi-mask, parking-slots, homography`) — trước đó homography đứng đầu. Không cần làm gì; chỉ để khỏi ngạc nhiên khi diff.

## Ping từ builder-a (2026-10-06) — đồng bộ polygon ROI trong interactive

`js/core/interactive/roi.js` dòng 12 hardcode `REAL_POLY = [[1276,688],[1216,144],[156,143],[77,657]]` — polygon CŨ. Config live đã đổi (user hiệu chuẩn lại 18:07): cam1 mới = `[[116,687],[1273,677],[1242,139],[158,143]]`, cam2 mới = `[[13,716],[1253,719],[1162,82],[68,103]]` (config/roi_mask_cam{1,2}.json). Nhờ builder-c cập nhật hằng số cho khớp.
