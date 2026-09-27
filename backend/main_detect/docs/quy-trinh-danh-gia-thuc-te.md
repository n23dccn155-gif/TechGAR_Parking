# Quy trình thu thập số liệu đánh giá thực tế (NCKH)

Mục tiêu: chứng minh bằng số liệu thật rằng **1 xe vật lý giữ đúng 1 Global ID
xuyên suốt** từ lúc vào đến khi ra, kèm độ chính xác handoff/parking.

## Bước 0 — Replay session (nếu chưa có predictions)

```powershell
cd D:\TechGar2\backend\main_detect
.\.venv\Scripts\python.exe .\two_camera.py `
  --replay-session "experiment_test\output\<SESSION>" `
  --session-dir "experiment_test\output\eval_<SESSION>" `
  --output-dir "experiment_test\output\eval_runtime_<SESSION>" `
  --slots-cam1 "config\sessions\<SESSION>\parking_slots_cam1.json" `
  --slots-cam2 "config\sessions\<SESSION>\parking_slots_cam2.json" `
  --calibration "experiment_test\recovered_cal\<SESSION>\calibration.json" `
  --no-session-video --no-display --opencv-threads 1
```

Video mới quay: copy `raw_cam1.mp4`/`raw_cam2.mp4` vào
`experiment_test\output\<SESSION_MOI>\`, vẽ lại mask/calibration/slots vào
`config\sessions\<SESSION_MOI>\` (xem `lenh-chay-theo-session.md`), rồi chạy
replay như trên.

## Bước 1 — Sinh template gán nhãn + thumbnail

```powershell
.\.venv\Scripts\python.exe .\experiment_test\make_label_template.py `
  --session "experiment_test\output\eval_<SESSION>" `
  --source-video-dir "experiment_test\output\<SESSION>"
```

Sinh ra trong session dir:
- `manual_tracking.csv` — mỗi (GID, camera) 3 dòng mẫu, cột
  `ai_assigned_id` điền sẵn, chỉ cần điền `physical_vehicle`
- `ground_truth_events.csv` — mốc sự kiện prefill (enter/handoff/park/exit),
  verify `start_frame`, `target_slot_id`
- `label_sheets\gidNN_camX_fNNN.png` — crop bbox từng GID để nhận diện xe
  bằng ảnh, không cần tua video

## Bước 2 — Gán nhãn (~10-15 phút/session)

1. Mở thư mục `label_sheets\` — mỗi ảnh là 1 GID tại 1 thời điểm.
2. Điền `physical_vehicle` trong `manual_tracking.csv` (vd: `xe_den`,
   `xe_trang` — nhất quán tên giữa các dòng/2 camera của cùng 1 xe).
3. Trong `ground_truth_events.csv`: điền `physical_vehicle_id` trùng tên,
   sửa `start_frame`/`end_frame`/`target_slot_id` cho đúng thực tế
   (dùng `render_gid_frames.py` để soi frame cụ thể khi cần).

## Bước 3 — Tính metrics

```powershell
.\.venv\Scripts\python.exe .\experiment_test\evaluate_session_metrics.py `
  --session "experiment_test\output\eval_<SESSION1>" "...\eval_<SESSION2>" `
  --out "experiment_test\output\research_metrics.md"
```

Metrics: ID consistency (% xe giữ đúng 1 GID), ID switches, miss rate,
handoff success (cùng GID qua 2 cam), event accuracy (handoff delay ≤
max_delay, slot đỗ đúng). Bảng markdown dùng trực tiếp trong báo cáo.

## Gợi ý coverage cho bảng kết quả

| Điều kiện | Session hiện có | Ghi chú |
|---|---|---|
| Bình thường | bt, hiep2/7/8, vd_16/18 | nhiều xe, dead-zone |
| Thiếu sáng | toi1 | |
| Dài/nhiễu | live15 (5730f), live14 | tay người, xe đỗ tĩnh |
| Sáng gắt / mưa | **quay thêm** | sang (archive) có thể reuse nếu vẽ lại config |
