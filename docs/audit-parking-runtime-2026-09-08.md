# Đợt sửa luồng xác nhận đỗ và tải Monitor — 08/09/2026

## Phạm vi và trạng thái

Thực hiện trên working tree `D:\TechGar2`, branch `an8_9`, nền commit `6e0cf277798d7cce94d6e11ffba35ab61c128682`. Chưa commit. Giữ nguyên các chỉnh sửa sẵn có của người dùng/Claude; không sửa ROI, calibration, detector profile, video hoặc nhãn gốc.

Áp dụng `full-audit-fix`: gom lỗi xuyên các lớp, sửa một batch, thu tất cả kết quả, sửa batch thứ hai rồi chạy lại toàn bộ kiểm thử. Không tuyên bố hoàn thành nghiệm thu thực địa chỉ từ test xanh.

## Lỗi, thay đổi và bằng chứng kiểm tra

| Vấn đề | Thay đổi | Kiểm chứng |
|---|---|---|
| Render/JPEG phục vụ Monitor nằm trên luồng tracking | `RuntimeState` có worker render/JPEG, mỗi camera chỉ một frame chờ; payload overlay độc lập với tracker; nhánh headless chỉ stream không render trên tracking | Test giữ renderer bị chặn nhưng `publish_frame()` vẫn trả về; JPEG được tạo trên `runtime-jpeg-encoder` |
| GET snapshot lặp lại deepcopy/serialize registry | Serialize trước khi đổi tham chiếu dưới khóa; endpoint snapshot dùng bytes cache; GET status không tạo đăng ký xem camera | Test cache bất biến và status không kích hoạt JPEG |
| Quan sát thưa làm reset bằng chứng vào ô | Bỏ reset chỉ vì gap 0,5 giây/frame gap; vẫn loại bằng chứng xe rời ROI và xe cạnh tranh | Test chuỗi quan sát cách nhau 0,7 giây |
| Claim mất trước khi worker vision giải quyết | Liên kết claim với job có ID/frame/timestamp thật; giữ ID tạm tối đa 5 giây, chỉ khi đủ quan sát, overlap, hướng vào và không cạnh tranh | Test chờ vision, không có job không được hold, timeout theo đồng hồ thực không gia hạn bằng job/lần LOST mới |
| ID đang chờ vision bị dùng cho xe khác | Hold không phải reservation đỗ; loại khỏi dormant/world recovery, handoff, overlap và merge thông thường | Test giữ hồ sơ ID; các test handoff/merge/parked reservation hồi quy đạt |
| Giới hạn dự đoán 0,40 giây vô hiệu hóa cả reacquire 1,5 giây | Ngừng ngoại suy cũ; xét detection thật quanh điểm đo cuối bằng ngân sách riêng, tối đa 0,30 đường chéo bbox và trần cũ; giữ gate HSV, kích thước, cạnh tranh | Test xe gần điểm đo được nhận lại; xe lân cận ngoài ngân sách không nhận ID cũ |
| Vision trễ bị bỏ nhưng không thấy nguyên nhân | Ghi job, source/completion/application clocks, tuổi kết quả, dropped count và lý do; job mới không xóa trạng thái degraded trước khi có kết quả tốt | Runtime/prediction có `parking_pipeline`; Monitor hiển thị tuổi frame/bằng chứng |
| Episode thay đổi nhưng cùng frame bị bỏ | Thêm revision cho episode; session xét revision của cùng episode, không tăng bằng chứng do polling | Test parked → departing → rollback cùng frame, từ chối revision cũ |
| GET session lỗi bị im lặng hoặc lỗi không mất dù kết nối lại | Báo timeout/GET error, thời điểm đồng bộ; phản hồi cùng revision hợp lệ vẫn xóa lỗi mạng | Test offline rồi nhận lại cùng revision |
| Frontend không biết phân biệt chờ xác nhận/thất bại | Đọc pending confirmation và pipeline; episode mới kích hoạt refresh session có gộp request; chỉ session PARKED mới báo thành công | Test resolver, UI và trình duyệt với API session Python thật |

### Quy tắc không thay đổi

- Giữ `vision_primary`: ô đỏ không đồng nghĩa đã biết chủ ô.
- Claim/hold tạm không được xuất thành episode `parked`.
- Giữ ngưỡng tuổi kết quả vision 1 giây và thời hạn reacquire hiện hành; không tăng timeout để che lỗi.
- Không đổi GID theo khoảng cách trên frontend; không để episode cũ kéo `EXIT_NAVIGATION` về `PARKED`.
- Khi đang ghi debug video hoặc mở cửa sổ OpenCV, phần render phục vụ chính việc ghi/hiển thị đó vẫn tồn tại trên vòng xử lý; tối ưu stream không đồng nghĩa toàn bộ recorder đã bất đồng bộ.

## Kiểm thử đã thực hiện

Runtime: Python 3.11.9, pytest 9.1.1, OpenCV 5.0.0. Frontend thực tế chạy Vitest 3.2.7, Vite 6.4.3.

| Hạng mục | Lượt 1 | Lượt 2 cuối |
|---|---:|---:|
| Toàn bộ tracking + backend session | 432 đạt, 2 lỗi | **434 đạt** |
| Frontend unit | 69 đạt | **70 đạt** |
| Typecheck / lint / build | Đạt | **Đạt** |
| Playwright Chromium | 10 đạt | **10 đạt** |

Hai lỗi lượt đầu: gate ngoại suy bằng 0 vẫn chặn nhánh điểm đo; một fixture chỉ có hai quan sát nằm trong ROI dù yêu cầu ba. Đã sửa gate riêng và thêm đủ quan sát hợp lệ vào fixture, không hạ điều kiện của thuật toán. Test xe lân cận bị từ chối vẫn giữ nguyên.

Lệnh từ `D:\TechGar2`:

```powershell
$env:PYTHONPATH = 'D:\TechGar2\backend;D:\TechGar2\backend\main_detect;D:\TechGar2\backend\main_detect\src'
& '.\backend\main_detect\.venv\Scripts\python.exe' -m pytest backend/main_detect/tests backend/tests -q --tb=short
```

Từ `frontend`: `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`, `pnpm playwright`.

Log từng lượt: `D:\techgar\verification-parking-pass1.log`, `verification-parking-pass2.log`, hai file JUnit XML tương ứng, `verification-frontend-<hạng mục>-pass1.log`/`pass2.log`. Playwright có một số resource 404 và cảnh báo proxy tới runtime không chạy trong ca dùng dữ liệu mẫu; test API session thật vẫn đạt. Không coi các cảnh báo này là đã có runtime camera thật trong bài test.

## Replay và tính tái lập

Đã thêm `--replay-async-vision` để replay qua worker giống live, và `--replay-realtime` phát theo timestamp ghi sẵn, không bỏ frame. `performance.csv` có thêm `tracking_pipeline_ms`, loại thời gian đọc/chờ nguồn và chờ pacing khỏi số đo xử lý chính; giữ cột tổng cũ.

`experiment_test/verify_parking_load.py` cung cấp bốn mức tải: engine, runtime không người xem, runtime + polling JSON, runtime + hai polling JSON và hai nguồn lấy JPEG. **Đây là tải HTTP mô phỏng driver/Monitor, không phải hai trình duyệt thật và không đo độ trễ popup.**

Replay nghiệm thu chính xác `vd_16` và `live20` đang **bị chặn do cấu hình khác nguồn**. Hash calibration, slots cam2, mask cam1 và mask cam2 hiện tại không trùng metadata của hai video. Không tìm thấy bản đúng trong thư mục config và 20 revision gần nhất của từng file đã tra cứu. Hai phiên chỉ có hash/path, không có bản sao đầy đủ cấu hình tương ứng.

Không phục hồi đè cấu hình hiện tại. Cờ `--performance-only-current-config` chỉ cho phép đo tải với cấu hình hiện tại, ghi rõ `identity_regression_valid=false` và danh sách file lệch; không dùng số GID/ô đỗ trong phép đo này để đánh giá sửa lỗi cũ.

### Số đo tải

Đã đo 350 cặp frame đầu của `vd_16`, chạy tuần tự với cùng cấu hình hiện tại, worker bất đồng bộ, phát theo timestamp nguồn, không ghi lại MP4. Mỗi lượt khoảng 94–95 giây. Cả bốn phiên vượt validator: metadata/predictions/timestamps/performance cùng 350 bản ghi.

| Tải | Vòng chính p50 / p95 (ms) | Job vision p95 đến hoàn tất (ms) | Tuổi kết quả vision p95 lúc nhận (ms) | Kết quả vision bị bỏ: cam1 / cam2 |
|---|---:|---:|---:|---:|
| Engine | 166,95 / 303,18 | 984,00 | 1167,20 | 18 / 46 |
| Runtime không người xem | 163,71 / 252,31 | 875,00 | 1084,25 | 12 / 33 |
| Runtime + một polling JSON | 165,07 / 275,23 | 863,00 | 1113,00 | 10 / 30 |
| Runtime + hai polling JSON + hai nguồn JPEG | 167,42 / 280,17 | 913,00 | 1078,00 | 13 / 37 |

- Tải mô phỏng Monitor tăng p95 vòng chính **11,04%** so với runtime không người xem trong mẫu này, dưới mục tiêu 20%. Chưa phải kết quả lặp nhiều lần hay đo trên hai trình duyệt thật.
- Lượt Monitor nhận 2.248 phản hồi HTTP thành công, khoảng 219 MB JPEG; 4 request lỗi lúc khởi động dịch vụ. Không có lỗi renderer trong log. Stream thực sự sinh và đọc JPEG.
- Thông lượng khoảng 3,71–3,73 cặp frame/s bị chi phối bởi timestamp nguồn, không phải FPS tối đa của engine. Không diễn giải engine chậm hơn runtime thành lợi ích của HTTP: một lượt mỗi chế độ vẫn có biến thiên do khởi động/nhiệt/tải máy và lịch worker.
- **Còn nghẽn thật:** tuổi kết quả vision p95 vượt 1.000 ms. Giữ chính sách bỏ kết quả quá cũ nên chưa thể bảo đảm đủ hai xác nhận vision trước hạn claim trong mọi lần vào ô.

Output: `backend/main_detect/experiment_test/output/audit_parking_20260908_load_vd16_<mode>/`, với mode `engine`, `runtime`, `driver`, `monitor`. Mỗi thư mục có `load_verification.json`, `session_info.json`, predictions và CSV. JSON runtime ở thư mục sibling thêm hậu tố `_runtime`. Log: `D:\techgar\parking-load-vd16-<mode>.log`.

Lệnh đo từ `backend/main_detect`, luôn dùng destination mới:

```powershell
& '.\.venv\Scripts\python.exe' experiment_test/verify_parking_load.py --session experiment_test/output/droidcam_shared_vd_16 --destination experiment_test/output/NEW_load_monitor --mode monitor --max-frames 350 --performance-only-current-config
```

### Điểm nghẽn còn lại — chưa sửa trong đợt này

`ParkingDetector.detect()` thực hiện 25 tổ hợp trên toàn frame và lọc riêng từng ROI cho từng tổ hợp. Cần profile sâu tại đây, không mặc định chi phí nằm ở JPEG. Hướng tối ưu bảo toàn kết quả: giữ CLAHE toàn ảnh để không đổi lưới histogram; thực hiện LUT/blur/adaptive/median/dilate chỉ trên vùng cần thiết có đủ pixel biên; tái sử dụng tổ hợp trung tâm đã tính. Phải so sánh mask/vote/ô đầu ra với bản hiện tại trước khi dùng live. Không bỏ lọc độc lập từng biến thể, giảm số tổ hợp hoặc nới deadline như một cách sửa mặc định.

## Điều kiện còn thiếu để nghiệm thu toàn bộ kế hoạch

1. Có bản cấu hình gốc đúng hash của `vd_16`/`live20`, hoặc ghi một phiên mới kèm bản sao cấu hình đầy đủ để replay và đối chiếu xe vật lý.
2. Xác nhận hai xe vào đúng ô/nhận lại đúng ID bằng video và nhãn; test tổng hợp không thay thế việc này.
3. Đo runtime episode → session → thông báo trên thiết bị thật; chưa chứng minh p95 ≤ 1,5 giây.
4. Kiểm tra với Monitor MJPEG thực và điện thoại: tải HTTP mô phỏng không chứng minh mượt 100%, cũng không thể tăng độ mượt vượt chất lượng/tần suất nguồn camera.
5. Lưu bản sao cấu hình ngay lúc bắt đầu ghi các phiên mới; chỉ hash ở cuối phiên như hiện tại không đủ tái lập nếu cấu hình thay đổi.

**Kết luận:** nhóm sửa code đã qua kiểm thử hồi quy; chưa đủ bằng chứng để tuyên bố lỗi đỗ trong phiên live của người dùng đã được giải quyết hoàn toàn.
