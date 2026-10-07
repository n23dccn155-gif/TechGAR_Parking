# BRIEF F0-c — builder-c: Test tái hiện (chỉ tạo file test MỚI)

Đọc trước: `D:\TechGar2\.analysis\gid-reacquire\SPEC.md` (đặc biệt §1, §4, §5, §6) và `MEGAPLAN.md`. Brief này là đầy đủ.

## Nhiệm vụ
Viết `backend/main_detect/tests/test_stationary_reacquire.py` (file MỚI) tái hiện kịch bản sang8 bằng **dữ liệu tổng hợp** đi qua API thật của `CrossCameraManager`:

Kịch bản chính (phải FAIL — đây là bug, SPEC §6 bước 7):
1. Xe đỗ yên trên cam2 → được gán gid (vd gid1).
2. Track cam2 chết (xe vẫn đỗ yên — không có detection mới một thời gian).
3. Trong lúc đó gid1 vẫn được quan sát/matched trên cam1 (cùng xe vật lý, vùng overlap).
4. Detection mới mọc lại trên cam2 tại đúng chỗ cũ (world_distance rất nhỏ ~1, appearance giống).
5. **Expected**: hệ thống reuse gid1 (không tạo gid mới). **Actual hiện tại**: tạo gid mới → test FAIL.

Cách dựng: bắt chước các test gid sẵn có trong `backend/main_detect/tests/` — đặc biệt `test_gid_departure_token.py` và `test_gid_reserved_competition.py` (2 file này đang modified trong git: ĐỌC được, KHÔNG sửa). Xem chúng dựng detection/manager như thế nào (helper, fixture, cấu trúc event) rồi dùng đúng API đó. Nếu cần thêm test nhìn `test_gid_*.py` khác.

Test chính: để FAIL rõ ràng với assert message chứa `expected: reuse gid1` (ưu tiên FAIL thật); nếu vì lý do kỹ thuật không FAIL sạch được thì dùng `pytest.mark.xfail(strict=False, reason=...)` và giải thích trong report.

Thêm test ÂM (hành vi mong muốn KHÔNG gán gid — phải PASS ngay cả sau khi fix; hiện tại có thể PASS luôn, đó là điều tốt, ghi rõ):
- (i) Hai ứng viên cùng mạnh (margin nhỏ) → không được commit gán, phải defer/tạo gid mới.
- (ii) Xe khác đỗ cách xa (world_distance lớn) → không gán.
- (iii) gid cũ đang được track khác CÙNG camera quan sát độc lập ở vị trí khác (`same_camera_live_owner`) → không gán.

Chạy: `D:\TechGar2\backend\main_detect\.venv\Scripts\python.exe -m pytest tests\test_stationary_reacquire.py -v` từ `backend/main_detect`. Lưu full log.

## Nộp
- `backend/main_detect/tests/test_stationary_reacquire.py`
- `D:\TechGar2\.analysis\gid-reacquire\F0-c-tests.md`: mô tả kịch bản, cách dựng synthetic data qua API, kết quả chạy (FAIL đúng lý do? — quote dòng fail), nhận định test có tái hiện đúng bug không (so sánh với event thật: reject reason `trajectory_score`, components direction≈0/time_topology=0).
- Log pytest: `.analysis/gid-reacquire/F0-c-pytest.log` (hoặc dán full output trong .md).

## Ràng buộc
- CHỈ tạo file test mới + file report/log trong `.analysis/gid-reacquire/`. KHÔNG sửa file nào khác, KHÔNG commit/push, KHÔNG revert 5 file modified (SPEC §7).
- Test phải chạy độc lập được, không phụ thuộc camera/file video.
- Ghi `progress-builder-c.md` (trong `.analysis/gid-reacquire/`) sau mỗi bước; checkpoint trước khi context >60%.
- Khi xong: trả lời "DONE F0-c" + kết quả (vd "1 FAIL đúng expected, 3 PASS").
