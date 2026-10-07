# BRIEF F1-c — builder-c: Test flag-off equivalence + chờ thiết kế (chỉ file test)

Đọc trước: `F0-SUMMARY.md`, `F0-c-tests.md` (của bạn), `MEGAPLAN.md` (F1) trong `D:\TechGar2\.analysis\gid-reacquire\`.

## PHẦN 1 — Làm ngay (không phụ thuộc F1-design)
Trong `backend/main_detect/tests/test_stationary_reacquire.py` (file của bạn, được phép sửa/thêm):
1. Thêm test **flag-off equivalence**: khởi tạo `CrossCameraManager` với `enable_stationary_reacquire=False` (nếu tham số chưa tồn tại thì đoán API hợp lý theo convention cờ `enable_*` trong ctor — ví dụ xem cách tham số `identity_retention_moving_seconds`/các flag khác được khai báo ở `cross_camera_manager.py` ~L140–250 và truyền từ `two_camera.py`; GHI RÕ tên tham số bạn giả định để F2 map đúng) — assert kịch bản sang8 vẫn mint gid mới (hành vi hiện tại giữ nguyên khi cờ tắt). Nếu ctor hiện CHƯA có tham số → test này tạm `pytest.mark.skip` hoặc xfail với reason "flag chưa tồn tại — sẽ bật khi F2 thêm", KHÔNG sửa production code để thêm cờ (F1 là design phase, chưa được sửa).
2. Thêm test placeholder **event logging**: khi cờ BẬT, kỳ vọng event `stationary_reacquire_accepted`/`_rejected`/`_deferred` xuất hiện trong event log của manager (đọc event list API mà test của bạn đã dùng). Cũng skip/xfail chờ F2.
3. Chạy lại pytest file, cập nhật `F0-c-pytest.log` thành `F1-c-pytest.log` (hoặc file mới) + ghi vào `F1-c-prep.md` trạng thái từng test.

## PHẦN 2 — Sau khi `F1-design.md` xuất hiện
Bổ sung test cho MỌI điều kiện trong thiết kế (mỗi guard/ngưỡng ≥1 test; đặc biệt: margin defer persistent — không chỉ 1 frame; spot-emptied-in-gap nếu design có; live-owner cross-cam). Nộp `F1-c-tests.md`.

## Nộp
`F1-c-prep.md` + test file cập nhật + log. Phần 2 nộp sau khi có design (nếu chưa có: trả lời "READY-F1" rồi chờ).

## Ràng buộc
- CHỈ sửa `tests/test_stationary_reacquire.py` + file trong `.analysis/gid-reacquire/`. KHÔNG sửa production code, KHÔNG commit, KHÔNG revert file modified.
- pytest: `D:\TechGar2\backend\main_detect\.venv\Scripts\python.exe -m pytest`.
- `progress-builder-c.md`; checkpoint trước context >60%.
