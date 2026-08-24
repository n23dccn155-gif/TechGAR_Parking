# TechGAR — nhận diện bãi đỗ và tracking phương tiện

Đây là bản nộp đã được rút gọn từ phiên bản V2. Thư mục chỉ giữ mã nguồn đang
được sử dụng, cấu hình hiệu chỉnh, unit test và một video demo. Các phiên bản
V1, source tham khảo, cache, file JSON kết quả và script thử nghiệm đã được loại
khỏi bản này.

## Cấu trúc

```text
main_detect/
├── main.py                      # Demo tổng hợp: 4 camera ảo + Global ID + parking
├── single_camera.py             # Video/webcam đơn + xuất tọa độ JSON
├── src/techgar/
│   ├── motion_tracker.py        # Motion, Kalman, HSV Re-ID, LAPJV
│   ├── vehicle_tracker.py       # Kiểu track + backend YOLO tùy chọn
│   ├── cross_camera_manager.py  # Một Global ID xuyên camera
│   ├── parking_detector.py      # Ensemble nhận diện ô trống/có xe
│   ├── slot_vehicle_binder.py   # Hợp nhất vision với ID + trạng thái dừng
│   └── direction_detector.py    # Sự kiện hướng qua các vạch
├── tools/
│   ├── ParkingSpacePicker_ve_js.py  # Công cụ duy nhất vẽ polygon ô đỗ
│   └── draw_direction_lines.py      # Vẽ vạch xác định hướng, khác ROI ô đỗ
├── config/
│   ├── parking_slots.json       # 69 ô đỗ cho video 1100x720
│   ├── roi_lines.json           # 4 vạch junction
│   └── botsort_parking_reid.yaml
├── data/carPark.mp4             # Video duy nhất trong bản nộp
└── tests/                       # Regression test Global ID và parking fusion
```

`runtime_output/` chỉ được tạo khi chạy chương trình và bị bỏ qua bởi Git. Bản
nộp ban đầu không chứa file kết quả.

## Cài đặt

Yêu cầu Python 3.10 trở lên. Từ thư mục `main_detect`:

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
```

Backend mặc định là OpenCV motion nên không cần tải model. Nếu có model YOLO đã
fine-tune cho góc nhìn top-down, cài thêm:

```powershell
.\.venv\Scripts\python.exe -m pip install -r requirements-yolo.txt
```

## Chạy demo chính

```powershell
.\.venv\Scripts\python.exe main.py --playback-fps 30
```

Chương trình chia `carPark.mp4` thành bốn camera ảo, tracking xe trên từng vùng,
giữ một Global ID khi xe chuyển camera, nhận diện trạng thái 69 ô đỗ và ghi:

```text
runtime_output/global_vehicle_registry.json
runtime_output/parking_status_cam1..4.json
runtime_output/vehicle_positions_cam1..4.json
```

Xem crop và ROI mà không chạy thuật toán:

```powershell
.\.venv\Scripts\python.exe main.py --preview --playback-fps 30
```

Chạy headless để kiểm tra nhanh:

```powershell
.\.venv\Scripts\python.exe main.py --no-display --max-frames 120
```

## Chạy một camera hoặc điện thoại dạng webcam

Video mặc định:

```powershell
.\.venv\Scripts\python.exe single_camera.py --playback-fps 30
```

Webcam/virtual webcam:

```powershell
.\.venv\Scripts\python.exe single_camera.py --camera 0 --verbose
```

Backend YOLO tùy chọn:

```powershell
.\.venv\Scripts\python.exe single_camera.py `
  --backend yolo `
  --model models\parking_topdown.pt `
  --camera 0
```

## Hiệu chỉnh ROI

Vẽ hoặc sửa polygon ô đỗ. Công cụ tự load `config/parking_slots.json` và chỉ
lưu lại đúng file JSON này:

```powershell
.\.venv\Scripts\python.exe tools\ParkingSpacePicker_ve_js.py
```

Vẽ vạch junction dùng cho xác định hướng:

```powershell
.\.venv\Scripts\python.exe tools\draw_direction_lines.py
```

Hai công cụ trên không trùng chức năng: một công cụ tạo polygon ô đỗ, công cụ
còn lại tạo các đoạn thẳng phát hiện xe đi qua ngã rẽ.

## Logic trạng thái ô đỗ

`ParkingDetector` vẫn là nguồn tổng quát để nhận cả xe đã đỗ trước khi hệ thống
khởi động. Tracking chỉ có quyền sửa kết quả trống sai thành có xe:

```text
final_occupied = vision_occupied OR tracking_occupied
```

Một Global ID được gán vào ô khi bbox giao ROI hợp lệ và xe đứng ổn định khoảng
một giây. Binding vẫn được giữ khi motion track tạm mất vì xe đứng yên.

## Kiểm thử

```powershell
.\.venv\Scripts\python.exe -m pip install -r requirements-dev.txt
.\.venv\Scripts\python.exe -m pytest -q
```

## Tích hợp giao diện TechGAR

`runtime_server.py` là entrypoint dành cho frontend. File này chạy cùng thuật toán
hai camera trong `two_camera.py`, đồng thời phát trạng thái runtime và hai luồng
MJPEG tại cổng `8001`.

Với bộ video/config trong lệnh thử nghiệm, chạy từ thư mục `backend\main_detect`:

```powershell
..\.venv\Scripts\python.exe .\runtime_server.py `
  --cam1-video "D:\NCKH\TechGAR\main_detect\experiment_test\output\droidcam_shared_m_04\raw_cam1.mp4" `
  --cam2-video "D:\NCKH\TechGAR\main_detect\experiment_test\output\droidcam_shared_m_04\raw_cam2.mp4" `
  --slots-cam1 "config\parking_slots_cam1.json" `
  --slots-cam2 "config\parking_slots_cam2.json" `
  --calibration "config\two_camera.shared_m_01.json" `
  --mask-cam1 "config\roi_mask_cam1.json" `
  --mask-cam2 "config\roi_mask_cam2.json" `
  --output-dir "experiment_test\output\runtime_shared_vd_07" `
  --session-dir "experiment_test\output\droidcam_shared_vd_07" `
  --identity-retention-seconds 60 `
  --show-motion-trails `
  --tracklet-max-samples 12 `
  --tracklet-sample-interval 3 `
  --global-gallery-max-samples 24 `
  --api-port 8001 `
  --no-display
```

Sau đó chạy frontend và mở:

- Khách hàng: `http://localhost:4173/?session=<session-id>` — chỉ thấy xe thuộc
  Global ID của phiên và chỉ dẫn trên bản đồ SVG.
- Quản trị viên: `http://localhost:4173/monitor` — thấy toàn bộ Global ID trên
  SVG, hai camera trực tuyến, nhật ký sự kiện và nút `Cấu hình cổng`. Chọn lần
  lượt hai đầu vạch cùng phía xe đi tới cho ENTRY rồi EXIT; frontend đổi các
  điểm SVG về world và Runtime API lưu `config/gate_zones.json` mà không mở
  thêm kết nối camera.

Các endpoint runtime chính gồm `/api/runtime/snapshot`, `/api/runtime/events`,
`/api/runtime/gates`, `/api/runtime/cameras/cam1.mjpg` và
`/api/runtime/cameras/cam2.mjpg`.

Bộ test kiểm tra xe chuyển camera nhanh, chống trùng Global ID, xe chạy ngang
ROI, xe dừng trong ô, rời ô, phục hồi ID và merge ID.
