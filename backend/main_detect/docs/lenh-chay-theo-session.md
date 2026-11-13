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

Luôn truyền `--output` rõ ràng. Chạy không có `--output` thì tool ghi vào
`config\parking_slots.json` (mặc định) và nạp lại file đó nếu có; phím `q` hoặc
`Esc` đều lưu file ngay, kể cả khi chỉ muốn thoát.

Vẽ thử / quay demo (KHÔNG đụng config thật; `--reset` để bắt đầu từ trống):

```powershell
mkdir experiment_test\output\roi_demo -Force
.\.venv\Scripts\python.exe .\tools\ParkingSpacePicker_ve_js.py `
  --image "experiment_test\output\roi_demo\cam1_frame.png" `
  --output "experiment_test\output\roi_demo\parking_slots_cam1_demo.json" `
  --reset --row A
```

Vẽ thật cho một session cũ — chỉ khi chủ đích ghi đè (sao lưu file cũ trước);
vd_18 cần cả slots_cam2, live15 cần cả 2:

```powershell
.\.venv\Scripts\python.exe .\tools\ParkingSpacePicker_ve_js.py `
  --video "experiment_test\output\<SESSION_VIDEO>\raw_cam1.mp4" `
  --output "config\sessions\<session>\parking_slots_cam1.json"
```

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

## 10. Các cờ legacy cho xe dừng (stationary) và giải cứu màu sắc (`--legacy-*`)

Mặc định các cải tiến từ P25 – P26 đều được **bật sẵn** trong `two_camera.py`. Khi cần đo A/B hoặc quay về hành vi cũ, truyền thêm các cờ dòng lệnh sau:

| Cờ legacy | Mặc định | Tác dụng khi truyền cờ (bật legacy) |
|---|---|---|
| `--legacy-stationary-reacquire` | Tắt (thuật toán mới BẬT) | Tắt việc tìm và nối lại GID cho fragment đang dừng/đỗ bị trì hoãn (P25). |
| `--legacy-stationary-ttl` | Tắt (thuật toán mới BẬT) | Tắt việc giữ fragment đứng yên qua TTL đếm frame và đếm giây (P26). |
| `--legacy-stationary-frozen` | Tắt (thuật toán mới BẬT) | Tắt việc cho fragment đóng băng/coasting phục hồi lại GID cũ (P26). |
| `--legacy-stationary-reserve` | Tắt (thuật toán mới BẬT) | Tắt việc tạo reservation giữ chỗ cho identity của xe đứng yên tuyệt đối (P26). |
| `--legacy-static-color-rescue` | Tắt (thuật toán mới BẬT) | Tắt bộ giải cứu xe tĩnh ít đặc trưng chuyển động dựa trên phân tích mảng màu và độ tương phản ổn định (P25). |

Ví dụ chạy A/B gate controller với cờ legacy:
```powershell
$env:GATE_RUNTIME_EXTRA = '--legacy-stationary-reacquire --legacy-stationary-ttl'
.\.venv\Scripts\python.exe sim3d\tools\m1_gate_eval.py sim3d\data\runs\20261103-123426_K2-P15a --api-port 8095 --gate-port 8094
```

## 11. Chạy debug replay với `run_techgar_debug.bat`

Công cụ `sim3d\tools\run_techgar_debug.bat` hỗ trợ chạy nhanh replay TechGAR trên một thư mục run sim3d với toàn bộ cấu hình chuẩn (`techgar_config`).

### Cú pháp:
```cmd
sim3d\tools\run_techgar_debug.bat [<duong_dan_run>] [pred|predictions]
```

### Các chế độ chạy:
1. **Chế độ chỉ ghi video debug (mặc định):**
   - Chỉ xuất 2 video `debug_cam1.mp4` và `debug_cam2.mp4` trong thư mục session (nhanh, nhẹ, không ghi predictions).
   ```cmd
   sim3d\tools\run_techgar_debug.bat sim3d\data\runs\20261106-130217_sang_5p
   ```
   Hoặc chạy không truyền tham số để chọn run từ danh sách menu tương tác:
   ```cmd
   sim3d\tools\run_techgar_debug.bat
   ```

2. **Chế độ ghi cả predictions (`pred` hoặc `predictions`):**
   - Bỏ cờ `--debug-video-only`, ghi đầy đủ `predictions.jsonl` cùng video debug vào thư mục session để phục vụ đánh giá downstream (`m1_track_eval.py`, `p28_entry_exit_gid.py`...).
   ```cmd
   sim3d\tools\run_techgar_debug.bat sim3d\data\runs\20261106-130217_sang_5p pred
   ```
   Hoặc bật qua biến môi trường trước khi chạy:
   ```cmd
   set TECHGAR_WRITE_PREDICTIONS=1
   sim3d\tools\run_techgar_debug.bat sim3d\data\runs\20261106-130217_sang_5p
   ```

## 12. Chạy xem trực tiếp 1:1 như live với `run_techgar_live.bat`

Công cụ `sim3d\tools\run_techgar_live.bat` cho phép chạy TechGAR runtime trên tài nguyên video đã ghi của run sim3d (`raw_cam1/2.mp4`, `frame_timestamps.csv`, `techgar_config`), mở cửa sổ hiển thị trực tiếp (`cv2.imshow`), tốc độ thực tế 1:1 theo thời gian thật và tự động bỏ qua (drop) frame trễ tương tự camera live:

### Cú pháp:
```cmd
sim3d\tools\run_techgar_live.bat [<duong_dan_run>] [save] [prof] [cac_co_bo_sung...]
```

### Đặc điểm:
- **Hiển thị cửa sổ trực tiếp**: Không dùng cờ `--no-display`, hiển thị khung hình ghép 2 camera cùng trạng thái đỗ và tracking theo thời gian thực.
- **Tốc độ 1:1 (Realtime pacing & frame drop)**: Sử dụng tổ hợp cờ chuẩn live:
  `--live-mode --display-scale 0.5 --replay-realtime --replay-drop-frames --replay-async-vision`
  
  **T21 (chất lượng box):** Mặc định motion giữ độ phân giải gốc trong ROI crop cho cả live và non-live. Chỉ thêm `--fast-motion` khi chủ động chấp nhận chế độ 0.5 (không đạt kiểm định IoU trên cảnh đông: active 69%, stationary 41,6%). ROI crop vẫn luôn bật. Khi so sánh IoU live/non-live theo cùng video, dùng `--no-replay-drop-frames` để hai phiên xử lý đúng cùng frame nguồn; chế độ live thông thường vẫn tự bỏ frame trễ.
  Thời gian chạy tương đương thời lượng thực tế của video (video 5 phút chạy đúng ~5 phút). Khi xử lý chậm hơn thời gian thực quá 300 ms, luồng sẽ tự động bỏ qua (drop) frame trễ để bắt kịp camera.
- **Tối ưu hiển thị (`--display-scale 0.5`)**: Mặc định thu nhỏ 50% kích thước cửa sổ hiển thị (960x540 thay vì 1920x1080) để giảm tải GPU/CPU render và cv2.imshow.
- **Bộ đọc frame nền (Prefetch Reader)**: Sử dụng thread nền nạp trước khung hình (`--replay-prefetch-frames 16`), giải phóng thời gian giải mã video MP4 khỏi luồng xử lý chính (giảm chi phí đọc frame từ ~5 ms xuống ~0.3 ms).
- **Thoát nhanh**: Nhấn phím `q` hoặc `Esc` trong cửa sổ video OpenCV để dừng.
- **Menu tương tác**: Nếu không truyền đường dẫn run, script sẽ liệt kê các run trong `sim3d\data\runs` để người dùng chọn.

### Lưu ý quan trọng về Frame Drop:
> [!IMPORTANT]
> **Cơ chế Frame Drop (`--replay-drop-frames` / `--live-mode`) CHỈ kích hoạt ở chế độ Live.**
> - Khi chạy offline (replay phân tích, trích xuất dữ liệu, eval, benchmark, test): runtime luôn chạy tuần tự và **deterministic 100%**, không bỏ qua (drop) bất kỳ frame nào.
> - Khi chạy live (`--live-mode --replay-drop-frames` qua `run_techgar_live.bat`): runtime giữ nhịp theo đồng hồ thời gian thực; nếu máy bận hoặc vẽ chậm trễ > 300 ms thì tự động bỏ frame trễ để bắt kịp luồng camera trực tiếp.

### Đo kiểm hiệu năng và Profiling (`prof` hoặc `TECHGAR_PROFILE=1`):
Có thể bật nhanh profiling bằng tham số `prof` hoặc đặt biến môi trường `TECHGAR_PROFILE=1`:
```cmd
# Cách 1: Thêm tham số "prof" trực tiếp
sim3d\tools\run_techgar_live.bat sim3d\data\runs\20261106-130217_sang_5p prof

# Cách 2: Đặt biến môi trường trước khi chạy
set TECHGAR_PROFILE=1
sim3d\tools\run_techgar_live.bat sim3d\data\runs\20261106-130217_sang_5p --max-frames 200
```
Dòng log hiển thị thống kê profiling mỗi 100 frame dạng `[P35_PROFILE]` (kèm profiling chuyên sâu của `CrossCameraManager` mỗi 600 frame dạng `[p35-profile]`):
`[P35_PROFILE] frames=101-200 avg/max read_pace=21.1/33.8ms motion=2.0/3.3ms cross=1.7/6.1ms total=26.0/42.8ms`

### Chạy chuỗi video liên tục với `run_techgar_chain.bat`:
Công cụ `sim3d\tools\run_techgar_chain.bat` cho phép chạy live tuần tự các video theo chuỗi (5p $\rightarrow$ 10p $\rightarrow$ 20p) để kiểm tra độ ổn định dài hạn:
```cmd
# Chạy chuỗi ban ngày (sang_5p -> sang_10p -> sang_20p):
sim3d\tools\run_techgar_chain.bat

# Chạy chuỗi ban tối (toi_5p -> toi_10p):
sim3d\tools\run_techgar_chain.bat toi

# Hỗ trợ bật kèm lưu video debug (save) hoặc profiling (prof):
sim3d\tools\run_techgar_chain.bat toi prof
sim3d\tools\run_techgar_chain.bat sang save prof
```

### Đo benchmark độ mượt và FPS với `p35_bench.sh`:
Script chuẩn benchmark runtime (chỉ chạy 1 runtime tại 1 thời điểm):
```bash
# Cú pháp: bash .orca/sim3d/p35_bench.sh <ten_benchmark> [co_phu...]
bash .orca/sim3d/p35_bench.sh test1
```
- Tự động chạy `runtime_server.py` ngầm trên `sang_5p` trong 4 phút (mặc định 240s, hoặc cấu hình `TECHGAR_BENCH_SECONDS=60 TECHGAR_BENCH_STEP=20`).
- Ghi số frame tăng thêm (delta) mỗi 20s vào `.orca/sim3d/p35_<ten>.log`.
- Tự động gọi `p35_smooth.py` ở cuối để phân tích độ ổn định FPS và phát hiện giật cục/stall (hỗ trợ `TECHGAR_SMOOTH_POLL=1` để poll file status mỗi 100ms).

### Ví dụ:
Chạy xem trực tiếp run `sang_5p`:
```cmd
sim3d\tools\run_techgar_live.bat sim3d\data\runs\20261106-130217_sang_5p
```

Chạy thử giới hạn số frame rồi tự dừng (run này 25 fps, nên 500 frame tương đương ~20 giây video):
```cmd
sim3d\tools\run_techgar_live.bat sim3d\data\runs\20261106-130217_sang_5p --max-frames 500
```

Lưu ý khi kiểm tra nhanh:
- Tham số truyền thêm sau đường dẫn run được chuyển nguyên vẹn vào `two_camera.py`
  (biến `EXTRA` trong `.bat`), nên `--max-frames N` hay `--no-parking-debug` đều dùng được.
- **Chế độ 1:1 giữ nhịp theo thời gian thật, không đếm frame**: máy yếu sẽ bỏ (drop)
  frame đúng như camera live, nên `--max-frames 500` có thể lâu hơn 20 giây, và số frame
  xử lý được trong 20 giây thực tế sẽ ít hơn 500 nếu máy không theo kịp.
  Muốn xem đủ thì cứ nhấn `q`/`Esc` khi đã xem xong.



