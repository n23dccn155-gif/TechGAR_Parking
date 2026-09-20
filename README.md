# 🅿️ TechGAR - Smart Parking & Navigation System

Hệ thống Quản lý & Dẫn đường Bãi đỗ xe Thông minh kết hợp Camera AI Tracking thời gian thực (YOLOv8 + CNN), thuật toán tìm đường Dijkstra, Giao diện Cá nhân hóa QR Code, Hướng dẫn bằng Giọng nói Tiếng Việt và Cảnh báo Đi sai đường.

---

## 🌐 Link Triển khai Trực tuyến (Production Cloud Deploy)

* **Frontend Web Application (Vercel)**: [https://tech-gar-parking-xliy.vercel.app](https://tech-gar-parking-xliy.vercel.app)
* **Backend REST API Server (Render)**: [https://techgar-backend.onrender.com](https://techgar-backend.onrender.com)

> 💡 **Ghi chú**: Bản Cloud Deploy hoạt động 24/7 độc lập mà không cần khởi chạy bất kỳ script Python nào dưới máy local. Frontend và Backend tự động kết nối qua biến môi trường `VITE_BACKEND_URL` với độ trễ thấp và hỗ trợ mô phỏng thời gian thực 60 FPS.

---

## 🏗 1. Kiến trúc Hệ thống & 2 Nguồn Dữ liệu

Hệ thống hỗ trợ **2 chế độ vận hành**:
1. **Chế độ File mẫu (File Mode)**: `gate_session_controller.py --source vehicle_positions_sample.json` đọc feed JSON trong `frontend/public/` — không cần GPU/Camera.
2. **Chế độ Runtime AI 2 camera (Runtime Mode)**: `backend/main_detect/runtime_server.py` chạy pipeline motion tracking + Global ID trên 2 camera (DroidCam HTTP hoặc video replay), phát snapshot qua REST API port 8001 cho `gate_session_controller.py`. Xem runbook đầy đủ: `backend/main_detect/docs/lenh-chay-theo-session.md`.

---

## 🛠 2. Yêu cầu Môi trường & Thư viện

### Frontend:
* **Node.js**: v18.0 trở lên

### Backend:
* **Python**: v3.9 trở lên
* **Cài đặt thư viện Python**:
```bash
pip install opencv-python ultralytics tensorflow numpy requests pillow
```

---

## 🚀 3. Hướng dẫn Khởi chạy Hệ thống

---

### 🟢 CHẾ ĐỘ 1: File dữ liệu mẫu (File Mode - Demo nhanh không cần Camera)

Mở 2 Terminal độc lập:

* **Terminal 1 (Frontend Web App)**:
  ```bash
  cd frontend
  npm run dev
  ```
  *(Truy cập `http://localhost:4173/`)*

* **Terminal 2 (Gate Session Controller & API)**:
  ```bash
  python backend/gate_session_controller.py --source vehicle_positions_sample.json
  ```

---

### 🔵 CHẾ ĐỘ 2: Camera AI Tracking Thực tế (Runtime Mode - 2 camera)

Mở 3 Terminal độc lập:

* **Terminal 1 (Frontend Web App)**:
  ```bash
  cd frontend
  npm run dev
  ```

* **Terminal 2 (Runtime Server - pipeline AI, port 8001)**:
  ```powershell
  cd backend\main_detect
  .\.venv\Scripts\python.exe .\runtime_server.py `
    --cam1-url "http://<CAM1_IP>:4747/video/force/1280x720" `
    --cam2-url "http://<CAM2_IP>:4747/video/force/1280x720" `
    --slots-cam1 "config\parking_slots_cam1.json" `
    --slots-cam2 "config\parking_slots_cam2.json" `
    --calibration "config\two_camera.shared_cm_01.json" `
    --mask-cam1 "config\roi_mask_cam1.json" `
    --mask-cam2 "config\roi_mask_cam2.json" `
    --api-port 8001 --no-display
  ```
  * Để replay video đã ghi thay cho cam live, đổi `--cam*-url` thành `--cam*-video "experiment_test\output\<SESSION>\raw_camN.mp4"` và trỏ config vào `config\sessions\<SESSION>\` (xem `backend/main_detect/docs/lenh-chay-theo-session.md`).

* **Terminal 3 (Gate Session Controller, port 8000)**:
  ```powershell
  python backend/gate_session_controller.py `
    --runtime-url "http://127.0.0.1:8001/api/runtime/snapshot" `
    --gate-config "backend\main_detect\config\gate_zones.json" `
    --port 8000
  ```

* **Thao tác trên Web**: Trên thanh Header Web, đổi công tắc nguồn từ **"Dữ liệu mẫu"** $\rightarrow$ **"Camera OpenCV"** (nguồn realtime lấy từ Runtime API).

---

### ☁️ CHẾ ĐỘ 3: Triển khai Độc lập trên Cloud 24/7 (Vercel & Render)

1. **Backend Web API (Render Web Service)**:
   * **Root Directory**: `backend`
   * **Build Command**: `pip install -r requirements.txt` (nếu cần) hoặc giữ mặc định Python.
   * **Start Command**: `python gate_session_controller.py --port 8000`
   * *Backend trên Render sẽ tự động kích hoạt luồng mô phỏng 3 xe chạy ngầm và cung cấp REST API công khai.*

2. **Frontend Web App (Vercel Project)**:
   * **Root Directory**: `frontend`
   * **Framework Preset**: `Vite`
   * **Build Command**: `npm run build`
   * **Environment Variable**: `VITE_BACKEND_URL=https://techgar-backend.onrender.com`

---

## 🧪 4. Kịch bản Kiểm thử Chi tiết Toàn bộ Hệ thống (Full Test Suite)

---

### 📌 PHẦN A: Test Các Chức Năng Dẫn Đường & Giao Diện (Sample & Real Mode)

#### 🔹 Test Case 1: Giám sát Bãi xe Chung & QR Kiosk Cổng vào
1. Truy cập `http://localhost:4173/` (Trang chung).
2. **Kỳ vọng**:
   * Bản đồ hiển thị tất cả các xe đang di chuyển trong bãi.
   * Khi xe tiến vào cổng, **QR Kiosk** xuất hiện ở góc dưới bên phải hiển thị mã QR `/?session=ID`.
   * QR Kiosk tự đổi xe hoặc tự ẩn khi hết xe ở cổng.

#### 🔹 Test Case 2: Giao diện Cá nhân & Giọng nói Tiếng Việt (Web Speech API)
1. Mở trang cá nhân của xe: `http://localhost:4173/?session=3`.
2. **Kỳ vọng**:
   * Bản đồ **chỉ hiển thị duy nhất Xe #3**, ẩn các xe khác.
   * Không xuất hiện QR Kiosk.
   * Bảng *"Bạn muốn tìm chỗ đỗ theo cách nào?"* tự động mở.
3. Chọn ô đỗ (ví dụ ô **D08**):
   * Đường mũi tên chỉ dẫn màu xanh xuất hiện từ vị trí xe tới ô **D08**.
   * Trình duyệt phát **giọng nói Tiếng Việt**: *"Phía trước đi thẳng"*, *"Phía trước rẽ phải vào làn đỗ"*,...

#### 🔹 Test Case 3: Nút Thoát / Mở lại Chỉ dẫn (`❌ Thoát chỉ dẫn` / `🧭 Mở lại chỉ dẫn`)
1. Đang có đường mũi tên xanh chỉ dẫn trên trang cá nhân.
2. Bấm nút **`❌ Thoát chỉ dẫn`**: Đường xanh chỉ hướng trên bản đồ biến mất ngay lập tức.
3. Bấm nút **`🧭 Mở lại chỉ dẫn`**: Đường xanh xuất hiện trở lại.

#### 🔹 Test Case 4: Cảnh báo Đi sai Tuyến đường (Off-Route Warning)
1. Khi xe di chuyển chệch khỏi tuyến đường chỉ dẫn $>75px$:
2. **Kỳ vọng**:
   * Phát âm thanh khẩn cấp: *"Cảnh báo: Bạn đang đi sai tuyến đường chỉ dẫn!"*.
   * Xuất hiện Bảng thông báo đỏ nhấp nháy: `⚠️ CẢNH BÁO: BẠN ĐANG ĐI SAI TUYẾN ĐƯỜNG CHỈ DẪN!`.

#### 🔹 Test Case 5: Cập nhật Trạng thái Ô đỗ Thực tế
1. Khi xe đỗ hoàn tất vào ô đỗ thực tế (ô **D08**):
2. **Kỳ vọng**:
   * Hệ thống đổi trạng thái ô **D08** sang màu **Đỏ (Occupied)**.
   * Ô nhấp chọn ban đầu (ví dụ A01) giữ nguyên màu **Xanh (Trống)** nếu xe không đỗ vào đó.
   * Trạng thái phiên chuyển sang **`PARKED`**.

#### 🔹 Test Case 6: Dẫn đường Lấy xe ra Cổng (`🚗 Lấy xe ra`)
1. Khi phiên ở trạng thái `PARKED`, nhấp nút **`🚗 Lấy xe ra`**.
2. **Kỳ vọng**:
   * Thuật toán tự động vẽ tuyến đường từ **ô đỗ thực tế (D08)** ra **CỔNG EXIT**.
   * Giọng nói phát chỉ dẫn: *"Tiếp tục đi theo đường dẫn ra cổng xuất bãi"*.
   * Khi xe ra khỏi bãi, ô **D08** chuyển lại màu **Xanh (Trống)**.

---

### 📌 PHẦN B: Test Nhận Diện Xe & AI Tracking Thực Tế (`runtime_server.py`)

#### 🔹 Test Case 7: Kiểm thử Runtime AI 2 camera
1. Chạy Runtime Server như **CHẾ ĐỘ 2 - Terminal 2** (live DroidCam hoặc replay video).
2. **Kỳ vọng**:
   * Snapshot API `http://127.0.0.1:8001/api/runtime/snapshot` trả `vehicles[]` với `global_id` ổn định và `parking_slots[]` với trạng thái ô đỗ.
   * MJPEG stream tại `/api/runtime/cameras/cam1.mjpg` & `cam2.mjpg` hiển thị khung hình có nhận diện.

#### 🔹 Test Case 8: Chuyển đổi Nguồn Dữ liệu Real-time trên Web
1. Mở trang Web `http://localhost:4173/`.
2. Nhấp nút chuyển nguồn ở Header từ **"Dữ liệu mẫu"** $\rightarrow$ **"Camera OpenCV"**.
3. **Kỳ vọng**:
   * Bản đồ Web hiển thị chính xác tọa độ các xe đang chạy lấy từ Runtime API (port 8001).

---

### 📌 PHẦN C: Công cụ Định vị & Căn chỉnh Ô đỗ (Parking Slot Picker)

#### 🔹 Test Case 9: Chạy Công cụ Vẽ và Điều chỉnh Ô đỗ (ROI Calibration)
1. Chạy lệnh (từ `backend/main_detect`):
   ```powershell
   cd backend\main_detect
   .\.venv\Scripts\python.exe .\tools\ParkingSpacePicker_ve_js.py
   ```
2. **Sử dụng**:
   * Click chuột trái vào hình ảnh bãi xe để thêm ô đỗ mới.
   * Click chuột phải để xóa ô đỗ.
   * Tọa độ các ô đỗ lưu vào `config\parking_slots.json` (hoặc `--output` tùy chọn, vd. `config\sessions\<SESSION>\parking_slots_camN.json`).

---

## 📁 5. Tổng hợp Cấu trúc File Dự án

```text
TechGAR/
├── backend/
│   ├── gate_session_controller.py      # HTTP API Server (port 8000) & Gate Controller
│   ├── session_manager.py              # QR vehicle-session lifecycle
│   ├── yolov8n.pt / cnn_parking.h5     # Các mô hình AI nhận diện xe & đỗ xe
│   └── main_detect/                    # Pipeline AI 2 camera (runtime_server.py, port 8001)
│       └── tools/ParkingSpacePicker_ve_js.py  # Công cụ UI vẽ & căn chỉnh ô đỗ (ROI)
└── frontend/
    ├── public/
    │   ├── vehicle_positions_sample.json # Feed mẫu cho gate controller --source mode
    │   ├── parking_status_sample.json  # Trạng thái ô đỗ bãi xe mẫu
    │   └── gate_roi.json               # Cấu hình ROI cổng (legacy file mode)
    └── src/
        ├── app/App.tsx                 # Web Controller chính
        ├── components/EntryQRKiosk.tsx # Widget QR Kiosk tại cổng vào
        └── routing/
            ├── laneGraph.ts            # Đồ thị làn đường giao thông bãi đỗ
            ├── routeEngine.ts          # Thuật toán tìm đường Dijkstra (Inbound/Exit)
            └── voiceGuidance.ts        # Web Speech API Giọng nói Tiếng Việt & Off-route Warning
```