# Lệnh chạy TechGAR — đã sửa cho folder `D:\TechGar2`

> Mỗi video ghi ở **một góc cam khác nhau** nên ROI mask / parking slots /
> calibration cũng khác nhau theo era. Chạy video cũ với config hiện tại sẽ
> gây lỗi lệch map / reject detection sai. Mỗi session đã có bộ config riêng
> tại `config\sessions\<session>\` (xem `MANIFEST.json` trong từng thư mục).

## 0. Quy ước đường dẫn (quan trọng — đã sửa)

- Thư mục làm việc cho mọi lệnh backend: `D:\TechGar2\backend\main_detect`
- Python đúng: `.\.venv\Scripts\python.exe` (venv nằm TRONG `main_detect`,
  **không phải** `..\..\.venv` như lệnh cũ — đường đó không tồn tại ở TechGar2)
- `gate_session_controller.py` nằm ở `D:\TechGar2\backend\` (không phải trong
  `main_detect`)

## 1. Bộ config theo session (`config\sessions\<session>\`)

| Session | calibration | mask cam1/cam2 | slots cam1/cam2 |
|---|---|---|---|
| droidcam_shared_hiep2 | recovered_cal | git a75d1d71 (đúng era) | git a75d1d71 |
| droidcam_shared_hiep7 | recovered_cal | git a75d1d71 | git a75d1d71 |
| droidcam_shared_hiep8 | recovered_cal | git a75d1d71 | git a75d1d71 |
| droidcam_live14 | recovered_cal | git a75d1d71 (inferred) | git a75d1d71 |
| droidcam_shared_bt | recovered_cal | **cần vẽ lại** | current (đúng era) |
| droidcam_shared_toi1 | recovered_cal | **cần vẽ lại** | current (đúng era) |
| droidcam_shared_vd_16 | recovered_cal | **cần vẽ lại** | current (đúng era) |
| droidcam_shared_vd_18 | recovered_cal | **cần vẽ lại** | cam1=current, **cam2 cần vẽ lại** |
| droidcam_shared_live15 | recovered_cal | **cần vẽ lại** | **cần vẽ lại cả 2** |

Calibration của cả 9 session đã được khôi phục chính xác từ dữ liệu ghi
(`experiment_test\recovered_cal\`) — không cần vẽ lại trừ khi muốn thay đổi.
Mask/slots đánh dấu "cần vẽ lại" là file era bị ghi đè, không còn trong git —
vẽ lại từ raw video theo lệnh mục 2/3.

## 2. Vẽ lại ROI mask từ video cũ

Công cụ nhận file mp4 thay cho URL cam. Ví dụ cho `bt` (đổi tên session cho
các video khác):

```powershell
cd D:\TechGar2\backend\main_detect
.\.venv\Scripts\python.exe .\mask_roi.py `
  --cam1-url "experiment_test\output\droidcam_shared_bt\raw_cam1.mp4" `
  --cam2-url "experiment_test\output\droidcam_shared_bt\raw_cam2.mp4" `
  --save-mask-cam1 "config\sessions\droidcam_shared_bt\roi_mask_cam1.json" `
  --save-mask-cam2 "config\sessions\droidcam_shared_bt\roi_mask_cam2.json"
```

Vẽ mask cho cam live (setup hiện tại, ghi vào config chính):

```powershell
.\.venv\Scripts\python.exe .\mask_roi.py `
  --cam1-url "http://192.168.100.53:4747/video/force/1280x720" `
  --cam2-url "http://192.168.100.198:4747/video/force/1280x720" `
  --save-mask-cam1 "config\roi_mask_cam1.json" `
  --save-mask-cam2 "config\roi_mask_cam2.json"
```

## 3. Vẽ lại ô đỗ (parking slots)

```powershell
.\.venv\Scripts\python.exe .\tools\ParkingSpacePicker_ve_js.py
```

(lưu thẳng vào `config\sessions\<session>\parking_slots_camN.json` khi làm
việc với video cũ — vd_18 cần cả slots_cam2, live15 cần cả 2.)

## 4. Vẽ / hiệu chuẩn đường giao chung (calibrate_map)

Từ video cũ — lưu vào thư mục session (ví dụ hiep2):

```powershell
.\.venv\Scripts\python.exe .\calibrate_map.py `
  --cam1-url "experiment_test\output\droidcam_shared_hiep2\raw_cam1.mp4" `
  --cam2-url "experiment_test\output\droidcam_shared_hiep2\raw_cam2.mp4" `
  --workspace "config\sessions\droidcam_shared_hiep2\shared_map_ws" `
  --output "config\sessions\droidcam_shared_hiep2\calibration.json" `
  --coverage-cam1 "config\sessions\droidcam_shared_hiep2\roi_mask_cam1.json" `
  --coverage-cam2 "config\sessions\droidcam_shared_hiep2\roi_mask_cam2.json" `
  --slots-cam1 "config\sessions\droidcam_shared_hiep2\parking_slots_cam1.json" `
  --slots-cam2 "config\sessions\droidcam_shared_hiep2\parking_slots_cam2.json"
```

Lưu ý: `--output` ghi đè `calibration.json` đã khôi phục — backup trước nếu
chỉ muốn thử nghiệm.

Từ **cam live** (DroidCam) — lưu thẳng vào config live:

```powershell
.\.venv\Scripts\python.exe .\calibrate_map.py `
  --cam1-url "http://192.168.100.53:4747/video/force/1280x720" `
  --cam2-url "http://192.168.100.198:4747/video/force/1280x720" `
  --workspace "config\shared_map_01" `
  --output "config\two_camera.shared_cm_01.json" `
  --coverage-cam1 "config\roi_mask_cam1.json" `
  --coverage-cam2 "config\roi_mask_cam2.json" `
  --slots-cam1 "config\parking_slots_cam1.json" `
  --slots-cam2 "config\parking_slots_cam2.json"
```

## 5. Vẽ vạch cổng vào/ra (gate zones) — từ video cũ

Vạch cổng phụ thuộc góc cam của từng session — vẽ riêng cho từng video:

```powershell
# Vi du cam1 nhin thay ca vao/ra, session bt:
.\.venv\Scripts\python.exe .\tools\draw_gate_zones.py `
  --source "experiment_test\output\droidcam_shared_bt\raw_cam1.mp4" `
  --camera "cam1" `
  --calibration "config\sessions\droidcam_shared_bt\calibration.json" `
  --output "config\sessions\droidcam_shared_bt\gate_zones.json" `
  --overwrite
```

(đổi `--camera "cam2"` + `raw_cam2.mp4` nếu cam2 mới là cam nhìn cổng).
Lượt 1 ENTRY: click 2 điểm vạch + 1 điểm trong bãi -> Enter. Lượt 2 EXIT: 2
điểm vạch + 1 điểm ngoài bãi -> Enter. Với cam live, `--source` = URL DroidCam
và `--output` = `config\gate_zones.json`.

## 6. Chạy runtime_server replay video cũ (đúng config era)

Mẫu cho mọi session — thay `<SESSION>`:

```powershell
cd D:\TechGar2\backend\main_detect
.\.venv\Scripts\python.exe .\runtime_server.py `
  --cam1-video "experiment_test\output\<SESSION>\raw_cam1.mp4" `
  --cam2-video "experiment_test\output\<SESSION>\raw_cam2.mp4" `
  --slots-cam1 "config\sessions\<SESSION>\parking_slots_cam1.json" `
  --slots-cam2 "config\sessions\<SESSION>\parking_slots_cam2.json" `
  --calibration "config\sessions\<SESSION>\calibration.json" `
  --mask-cam1 "config\sessions\<SESSION>\roi_mask_cam1.json" `
  --mask-cam2 "config\sessions\<SESSION>\roi_mask_cam2.json" `
  --output-dir "experiment_test\output\runtime_<SESSION>" `
  --session-dir "experiment_test\output\runtime_session_<SESSION>" `
  --identity-retention-seconds 60 `
  --show-motion-trails `
  --tracklet-max-samples 12 `
  --tracklet-sample-interval 3 `
  --global-gallery-max-samples 24 `
  --api-port 8001 `
  --no-display
```

Ví dụ điền sẵn cho `droidcam_shared_bt` (mask cần vẽ lại trước — mục 2):

```powershell
.\.venv\Scripts\python.exe .\runtime_server.py `
  --cam1-video "experiment_test\output\droidcam_shared_bt\raw_cam1.mp4" `
  --cam2-video "experiment_test\output\droidcam_shared_bt\raw_cam2.mp4" `
  --slots-cam1 "config\sessions\droidcam_shared_bt\parking_slots_cam1.json" `
  --slots-cam2 "config\sessions\droidcam_shared_bt\parking_slots_cam2.json" `
  --calibration "config\sessions\droidcam_shared_bt\calibration.json" `
  --mask-cam1 "config\sessions\droidcam_shared_bt\roi_mask_cam1.json" `
  --mask-cam2 "config\sessions\droidcam_shared_bt\roi_mask_cam2.json" `
  --output-dir "experiment_test\output\runtime_bt" `
  --session-dir "experiment_test\output\runtime_session_bt" `
  --identity-retention-seconds 60 `
  --show-motion-trails `
  --tracklet-max-samples 12 `
  --tracklet-sample-interval 3 `
  --global-gallery-max-samples 24 `
  --api-port 8001 `
  --no-display
```

## 7. Chạy runtime_server với cam live (config hiện tại)

```powershell
.\.venv\Scripts\python.exe .\runtime_server.py `
  --cam1-url "http://192.168.100.53:4747/video/force/1280x720" `
  --cam2-url "http://192.168.100.198:4747/video/force/1280x720" `
  --slots-cam1 "config\parking_slots_cam1.json" `
  --slots-cam2 "config\parking_slots_cam2.json" `
  --calibration "config\two_camera.shared_cm_01.json" `
  --mask-cam1 "config\roi_mask_cam1.json" `
  --mask-cam2 "config\roi_mask_cam2.json" `
  --output-dir "experiment_test\output\runtime_live" `
  --session-dir "experiment_test\output\session_live" `
  --identity-retention-seconds 60 `
  --show-motion-trails `
  --tracklet-max-samples 12 `
  --tracklet-sample-interval 3 `
  --global-gallery-max-samples 24 `
  --api-port 8001 `
  --no-display
```

## 8. Gate session controller + frontend

```powershell
# Terminal 1 — tu D:\TechGar2 (venv nam trong main_detect):
# ==== CAM LIVE (dung config\gate_zones.json CHUNG — KHONG co <SESSION>) ====
cd D:\TechGar2
.\backend\main_detect\.venv\Scripts\python.exe .\backend\gate_session_controller.py `
  --runtime-url "http://127.0.0.1:8001/api/runtime/snapshot" `
  --gate-config "backend\main_detect\config\gate_zones.json" `
  --port 8000

# ==== REPLAY VIDEO CU (chi khi session do da ve gate_zones rieng) ====
# THAY <SESSION> bang ten that, vd droidcam_shared_bt — KHONG go nguyen <SESSION>
.\backend\main_detect\.venv\Scripts\python.exe .\backend\gate_session_controller.py `
  --runtime-url "http://127.0.0.1:8001/api/runtime/snapshot" `
  --gate-config "backend\main_detect\config\sessions\<SESSION>\gate_zones.json" `
  --port 8000

# Terminal 2 — frontend:
cd D:\TechGar2\frontend
npm run dev
# http://localhost:4173/kiosk/entry
```

## 9. Rebuild lai bo config session neu can

```powershell
cd D:\TechGar2\backend\main_detect
.\.venv\Scripts\python.exe .\tools\assemble_session_configs.py
```
