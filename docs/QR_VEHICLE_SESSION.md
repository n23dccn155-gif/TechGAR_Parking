# Phiên QR theo Global ID của xe

## Vòng đời

1. `runtime_server.py` xuất `vehicles[].global_id` và vị trí trong hệ tọa độ world.
2. Xe cắt vạch `entry_gate` đúng chiều: `gate_session_controller.py` tạo một session ID ngẫu nhiên, gắn với đúng một Global ID.
3. Bảng tại `/kiosk/entry` gọi `GET /api/sessions/waiting` mỗi 250 ms và sinh QR ngay trong trình duyệt. Mỗi QR chỉ hiển thị trong 10 giây kể từ lúc tạo; hết hạn sẽ tự ẩn dù chưa ai quét. Nếu xe mới qua cổng trong thời gian đó, QR xe mới thay QR cũ ngay. QR trỏ tới `/?session=<opaque-id>`.
4. Khi người dùng quét, frontend claim phiên và chỉ theo dõi `globalVehicleId` của phiên đó.
5. Khi `parked_slot_id` xuất hiện, session chuyển sang `PARKED`, lưu `parkedSpotId` và bỏ local track ID. Frontend đặt marker của xe tại tâm ô đã lưu dù xe không chuyển động.
6. Việc xe tạm mất khỏi camera không đóng phiên. Khi xe rời ô, session chuyển sang `EXIT_NAVIGATION`.
7. Chỉ khi cùng Global ID cắt `exit_gate` đúng chiều, session mới bị xóa. URL QR cũ sau đó nhận HTTP 404 và hiển thị “Phiên xe đã kết thúc”.

Session được lưu phía backend tại `backend/data/navigation_sessions.json` (hoặc đường dẫn trong biến `TECHGAR_SESSIONS_FILE`), không còn được frontend đọc từ thư mục `public`.

## Chọn hai vạch cổng trên frontend

Không mở camera bằng `tools/draw_gate_zones.py`. Runtime backend giữ duy nhất kết nối
tới hai camera, còn frontend dùng `slot_layout` để ánh xạ shared map SVG với tọa độ
world.

1. Chạy `runtime_server.py` với hai camera thật và toàn bộ config như bình thường.
2. Chạy frontend rồi mở `http://localhost:4173/monitor`.
3. Trong khối `GATE CALIBRATION`, chọn `Cấu hình cổng`.
4. Với `ENTRY`, bấm hai đầu vạch rồi bấm một điểm ở phía xe sẽ đi tới sau khi qua cổng.
5. Lặp lại ba điểm cho `EXIT`, kiểm tra hai mũi tên và chọn `Lưu cổng`.

Runtime API ghi `backend/main_detect/config/gate_zones.json` trong hệ tọa độ world
và đúng unit của snapshot hiện tại. Chế độ chọn điểm chỉ khóa pan/zoom của SVG;
polling runtime và hai luồng camera vẫn hoạt động.

## Chạy hệ thống

Trình tự khởi động là runtime backend, frontend, chọn/lưu cổng, sau đó mới chạy
Gate Session Controller. Từ thư mục gốc dự án:

```powershell
cd .\frontend
pnpm dev
```

Mở `http://localhost:4173/monitor`, lưu đủ ENTRY/EXIT, rồi mở terminal mới:

```powershell
cd "D:\Documents\SCIENTIFIC RESEARCH\Hiệp\TechGAR_Parking"
& .\backend\.venv\Scripts\python.exe .\backend\gate_session_controller.py `
  --runtime-url "http://127.0.0.1:8001/api/runtime/snapshot" `
  --port 8000
```

Frontend dev proxy dùng API session ở cổng 8000 và runtime ở cổng 8001. Bảng QR độc lập nằm tại `http://localhost:4173/kiosk/entry`.

## API session

- `GET /api/sessions/waiting`: các xe đang chờ quét QR và còn trong thời hạn hiển thị 10 giây.
- `GET /api/session/<session-id>`: trạng thái phiên và Global ID.
- `POST /api/session/claim`: nhận phiên sau khi quét.
- `POST /api/session/select`: chọn hoặc bỏ chọn ô đỗ.
- `POST /api/session/exit`: bắt đầu chỉ đường lấy xe ra; không xóa phiên.
- Cắt vạch exit vật lý đúng chiều: backend tự xóa phiên.

Runtime API dùng cho cấu hình cổng:

- `GET /api/runtime/gates`: đọc ENTRY/EXIT đã lưu.
- `POST /api/runtime/gates`: kiểm tra unit và ghi nguyên tử `gate_zones.json`.
