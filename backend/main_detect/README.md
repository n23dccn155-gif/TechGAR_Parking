# TechGAR — nhận diện bãi đỗ và tracking phương tiện

Đây là bản nộp đã được rút gọn từ phiên bản V2. Thư mục chỉ giữ mã nguồn đang
được sử dụng, cấu hình hiệu chỉnh, unit test và một video demo. Các phiên bản
V1, source tham khảo, cache, file JSON kết quả và script thử nghiệm đã được loại
khỏi bản này.

## Cấu trúc

```text
main_detect/
├── two_camera.py                # Hai camera thật + Global ID + parking
├── runtime_server.py            # Entrypoint cho frontend (REST + MJPEG :8001)
├── run_two_camera_session.py    # Helper chạy/ghi lại session hai camera
├── calibrate_map.py             # Hiệu chỉnh shared map không cần nhập X/Y
├── mask_roi.py                  # Vẽ analysis mask cho hai camera
├── src/techgar/
│   ├── motion_tracker.py        # Motion, Kalman, HSV Re-ID, LAPJV
│   ├── vehicle_tracker.py       # Kiểu track dùng chung (TrackedVehicle, TrackStatus)
│   ├── cross_camera_manager.py  # Một Global ID xuyên camera
│   ├── parking_detector.py      # Ensemble nhận diện ô trống/có xe
│   ├── slot_vehicle_binder.py   # Hợp nhất vision với ID + trạng thái dừng
│   ├── latest_frame_capture.py  # Thread đọc stream, giữ frame mới nhất
│   ├── live_roi_editor.py       # Chỉnh ROI trực tiếp lúc đang chạy
│   ├── occlusion_guard.py       # Chặn bind sai khi xe tạm bị che
│   ├── prediction_writer.py     # Ghi predictions.jsonl schema v3
│   ├── runtime_contract.py      # Payload runtime cho web frontend
│   ├── tracklet_descriptor.py   # Tracklet ngoại hình cho Re-ID
│   └── trajectory_memory.py     # Bộ nhớ quỹ đạo shared-map cho ReID
├── tools/
│   ├── ParkingSpacePicker_ve_js.py      # Công cụ vẽ polygon ô đỗ
│   ├── calibrate_two_cameras.py         # Hiệu chỉnh homography từ 4 góc overlap
│   ├── calibrate_shared_map.py          # Hiệu chỉnh shared map đơn vị cm
│   ├── draw_gate_zones.py               # Vẽ vạch cổng vào/ra
│   ├── rectangle_line_calibration.py    # Fit phẳng 8 cặp điểm đo
│   └── assemble_session_configs.py      # Đóng gói config theo session
├── config/
│   ├── parking_slots.json       # 69 ô đỗ cho video 1100x720
│   ├── parking_slots_cam1.json / parking_slots_cam2.json
│   ├── roi_mask_cam1.json / roi_mask_cam2.json
│   ├── gate_zones.json          # Vạch cổng vào/ra
│   ├── two_camera.detector.json # Profile threshold detector
│   ├── two_camera.*.json        # Calibration hai camera
│   ├── sessions/<session>/      # Bộ config theo từng session cũ
│   └── shared_map_01/           # Capture hiệu chỉnh shared map
├── data/carPark.mp4             # Video duy nhất trong bản nộp
├── experiment_test/             # Session output + công cụ replay/audit
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

Backend mặc định là OpenCV motion nên không cần tải model.

## Chạy hai camera

`two_camera.py` là pipeline chính: hai luồng camera (DroidCam hoặc file replay),
local tracking trên từng camera, `CrossCameraManager` giữ một Global ID khi xe
chuyển camera, nhận diện trạng thái ô đỗ và ghi session. Chi tiết tham số,
calibration và replay nằm trong `docs/two-camera-runbook.md`; bộ lệnh theo
session nằm trong `docs/lenh-chay-theo-session.md`.

```powershell
.\.venv\Scripts\python.exe two_camera.py `
  --cam1-url "http://<IP_CAM1>:4747/video/force/1280x720" `
  --cam2-url "http://<IP_CAM2>:4747/video/force/1280x720" `
  --slots-cam1 config\parking_slots_cam1.json `
  --slots-cam2 config\parking_slots_cam2.json `
  --calibration config\two_camera.shared_cm_01.json `
  --session-dir experiment_test\output\two_camera_01
```

## Hiệu chỉnh ROI

Vẽ hoặc sửa polygon ô đỗ. Công cụ tự load `config/parking_slots.json` và chỉ
lưu lại đúng file JSON này:

```powershell
.\.venv\Scripts\python.exe tools\ParkingSpacePicker_ve_js.py
```

Vẽ analysis mask vùng nhìn thấy của từng camera:

```powershell
.\.venv\Scripts\python.exe mask_roi.py --help
```

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
.\.venv\Scripts\python.exe .\runtime_server.py `
  --cam1-video "experiment_test\output\droidcam_shared_m_04\raw_cam1.mp4" `
  --cam2-video "experiment_test\output\droidcam_shared_m_04\raw_cam2.mp4" `
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
