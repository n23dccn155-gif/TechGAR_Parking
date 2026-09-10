# Hiệu chỉnh A–D + V1–V4 (09/09/2026)

Quy trình mặc định của `calibrate_map.py` hiện dùng **tám cặp điểm**.
Giữ bốn góc hình chữ nhật A–D và số đo thật AB/AD; bốn điểm V là
**điểm hiệu chỉnh**, không còn là điểm kiểm chứng bị so với dấu cyan.
Các hướng dẫn P1–P8 + V1–V6 trước đây không áp dụng cho giao diện mặc định này.

## Chỉ cần làm các bước này

1. Dừng runtime trước khi thay calibration. Giữ cố định camera và mặt bãi.
2. Chạy lại lệnh `calibrate_map.py` đang dùng, với đúng video/URL, ROI và slots.
3. Chọn từng cặp A cam1 → A cam2, B → B, C → C, D → D.
4. Chọn V1–V4 trên **cùng một đường vạch sơn mặt đất**, trải từ trái sang
   phải trong cam1. Cam2 có thể nhìn ngược: cùng nhãn phải là cùng dấu vật lý,
   không phải cùng phía màn hình. Nên chọn dấu cố định/đầu vạch dễ xác định.
   Không dùng nóc xe, bóng hoặc watermark DroidCam. Không cần đo khoảng cách V.
5. Enter để tính. Nhập AB=20, AD=30 nếu đúng hình chữ nhật đã đo đó.
6. Xem sai số từng điểm trước/sau, ảnh trộn và caro. Gần các điểm V và ở những
   vạch khác, kiểm tra cả vị trí lẫn sự liên tục của vạch, không chỉ góc đường.
7. Chỉ gõ `AP DUNG` khi ảnh thực tế đã khớp ở vùng cần bàn giao ID. Nếu còn lệch,
   Enter để giữ bản cũ; giữ draft để xem nguyên nhân. Khởi động phiên runtime mới.

Gợi ý cyan mặc định tắt; G bật/tắt, không bắt phải chấm theo gợi ý.
Kính phóng đại nằm dưới ảnh, chỉ để nhìn; click trên ảnh gốc.
Chuột phải hoàn tác, R xóa, Q/Esc hủy. Điểm được lưu từng lần chấm.

`--resume "đường_dẫn_attempt"` sử dụng đúng ảnh đóng băng và điểm đã lưu,
nhưng tạo attempt mới, không ghi đè attempt cũ. Resume bản 18 điểm chỉ giữ A–D;
không tự biến điểm kiểm chứng cũ thành điểm hiệu chỉnh mới. Nhập lại AB/AD.

## Thuật toán và giới hạn

- Chuẩn hóa pixel theo chiều rộng 1280 để ngưỡng không đổi theo độ phân giải.
- Dùng cả tám cặp để ước lượng G: cam2 → cam1 bằng least squares
  (`cv2.findHomography(method=0)`). Không RANSAC loại V/loại cả vùng lệch.
- Đặt hệ centimet M từ các góc A–D của cam1 và góc cam2 sau khi chuyển qua G.
  Hai bộ góc cùng đối chiếu A(0,0), B(AB,0), C(AB,AD), D(0,AD).
- Xuất H1=M, H2=M×G. Điểm chấm và số đo được giữ; ma trận tìm cách khớp tổng thể,
  không cưỡng bức sai số bốn góc bằng 0 rồi bỏ qua V.
- Góc đường V được báo riêng từng ảnh chỉ để chẩn đoán. Không lấy hiệu hai góc
  để xoay tùy ý. Điểm V thẳng hàng hợp lệ vì A–D đã cung cấp thông tin hai chiều.
- Kiểm tra cả tám điểm: p95 pixel đối xứng ≤5, lớn nhất ≤8 ở chiều rộng 1280;
  sai số cặp điểm và góc centimet ≤2 mặc định. Không dùng tuổi ID hay nới gate tracking.
- V phải phân biệt được, đi liên tục trên đường, đủ trải ngang; độ lệch khỏi
  đường fit ≤8 pixel chuẩn hóa. Không ép dự đoán thành tọa độ người dùng.

Tất cả tám điểm đều được dùng tính toán. Vì vậy `fit_ready` **không phải PASS
kiểm chứng độc lập** và không chứng minh độ chính xác toàn bãi/khắc phục mọi
ID switch. Sau khi người dùng xem và đồng ý, trạng thái là `reviewed_fit`.
Nếu mặt bãi cong/méo ống kính khiến không có homography phù hợp, tool vẫn từ chối
thay cấu hình; thêm một phép xoay không giải quyết được mô hình đó.

## Bảo toàn dữ liệu và runtime

- Mỗi lần chạy có calibration_id trùng tên attempt, ảnh và nguồn riêng.
- Build chỉ ghi `calibration_draft.json`, không tự thay output hoạt động.
- Sau xác nhận bằng `AP DUNG`, ghi output bằng file tạm rồi replace.
- Draft lỗi, hủy, hoặc không đồng ý không thay output. Không sửa video/ROI/profile.
- Preview, slots và runtime dùng cùng H1/H2. Runtime từ chối draft chưa duyệt.
- Vùng bàn giao dùng `fitted_ground_overlap_world_polygon`: giao bao lồi các
  điểm đã fit. Đây là phạm vi có dữ liệu hỗ trợ, **không phải toàn khung hình
  hoặc vùng đất đã được kiểm chứng độc lập**. Chọn V trải hết đoạn giao cần dùng.
- Không đưa việc tìm G vào mỗi frame: fitting chạy offline khi hiệu chuẩn.

## Kiểm chứng triển khai

Test bao gồm: tám điểm với V thẳng hàng; hình nhỏ có nhiễu làm lệch phía xa;
so sánh ở điểm synthetic không tham gia fit; đổi độ phân giải; V sai không bị
âm thầm loại; dữ liệu nguồn không thống nhất; draft/hủy bảo toàn output;
phê duyệt → loader runtime dùng đúng ma trận; tọa độ click/kính phóng đại.

Độ chính xác trên mô hình thật còn phải kiểm tra sau khi chấm V1–V4 đúng quy trình.
Không tái sử dụng nhãn V của attempt cũ như thể đó là lần đo mới.

### Kết quả kiểm tra triển khai ngày 09/09/2026

- Nền repository: `6e0cf277`, có nhiều thay đổi chưa commit từ trước; được bảo toàn.
- Runtime kiểm tra: Python 3.12.14, OpenCV 5.0.0, NumPy 2.5.2.
- Cú pháp năm file Python liên quan đạt; `git diff --check` không có lỗi whitespace.
- Toàn bộ test `backend/main_detect/tests` và `backend/tests`: **461 đạt / 14,70 giây**.
- Lượt đầu 460 đạt; kiểm tra ảnh QA phát hiện đường tím preview chưa dùng cùng vùng
  với runtime. Batch thứ hai đồng bộ vùng, thêm test đối chiếu preview/loader và
  test từ chối cấu hình thiếu vùng hoặc giả trạng thái đã duyệt. Lượt cuối 461 đạt.
- Ca synthetic hình chuẩn nhỏ, góc có nhiễu: sai số trung bình ở bốn điểm KHÔNG
  tham gia tính giảm 34,776 → 1,961 pixel. Đây không phải số đo centimet trên bãi thật.
- Đã xem ảnh picker và checkerboard sinh bởi code. Click footer được bỏ qua,
  phép đổi tọa độ click được test; chưa kiểm tra click bằng chuột thật trên máy người dùng.
- Không thay đổi frontend hoặc association/ID gates; không chạy lại frontend suites
  và không dùng test geometry để tuyên bố đã sửa lỗi đỗ xe/session.
- Không replay ID trên video cũ với calibration mới vì chưa có V1–V4 mới do người dùng
  chấm và duyệt. Không lấy điểm cũ rồi tự đổi nhãn thành một lần đo thật mới.
- Không đo lại FPS live. Tính homography chỉ chạy offline; runtime vẫn chiếu bằng
  ma trận đã tính, không giải tám điểm ở mỗi frame.

Lệnh kiểm tra (PowerShell, thư mục `D:\TechGar2\backend\main_detect`):

```powershell
$env:PYTHONDONTWRITEBYTECODE = '1'
$env:PYTHONUTF8 = '1'
$env:PYTHONPATH = 'D:\TechGar2\backend\main_detect;D:\TechGar2\backend\main_detect\src;D:\TechGar2\backend'
& 'D:\techgar\main_detect\.venv\Scripts\python.exe' -m pytest tests ..\tests -q -o cache_dir=D:\techgar\calibration_line_patch\pytest-cache --basetemp=D:\techgar\calibration_line_patch\test-run-2 --junitxml=D:\techgar\calibration_line_patch\tests-pass2.xml
```

Log: `D:\techgar\calibration_line_patch\tests-pass2.log`.
XML: `D:\techgar\calibration_line_patch\tests-pass2.xml`.
Ảnh QA: `D:\techgar\calibration_line_patch\test-run-2\test_draft_review_runtime_use_0\attempt`.
Bản sao ba file có sẵn trước lần sửa: `D:\techgar\calibration_line_patch\before`.
Đây là artifact kiểm tra, không phải calibration nên dùng cho bãi.

File code chính: `calibrate_map.py`, `tools/calibrate_shared_map.py`,
`tools/rectangle_line_calibration.py`, `two_camera.py`.
Test mới: `tests/test_rectangle_line_calibration.py`.
