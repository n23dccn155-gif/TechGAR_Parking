# TechGar2 - Trạng thái dự án

**Ngày cập nhật:** 2026-09-05
**Branch:** Hiep3_9
**Người thực hiện:** Claude (với Pan)

---

## ✅ Đã làm được

### 1. Setup môi trường
- [x] Tạo Python venv tại `backend/main_detect/.venv`
- [x] Cài đặt dependencies: opencv-python, numpy, lap
- [x] Cài đặt torch, torchvision (cho DeepReID)
- [x] Xác minh model `agentrouter/glm-5.3` hoạt động với Pi (prompt phải dùng **tiếng Anh**)

### 2. Phân tích codebase
- [x] CrossCameraManager - GID assignment, ReID, handoff logic
- [x] SlotVehicleBinder - slot binding, sticky ID, anti-cướp-slot
- [x] MotionTracker - split detection, lineage scoring
- [x] Frontend App.tsx - GID tracking, session management

### 3. Test và diagnostic tools
- [x] Tạo session replay với videos (raw_cam1.mp4, raw_cam2.mp4)
- [x] Generate frame_timestamps.csv cho replay session
- [x] Chạy `diagnose_identity_churn.py` thành công
- [x] Chạy full 1842 frames - 5 GIDs được tạo, 0 identity errors

### 4. Hiểu GID lifecycle
- [x] GID tạo mới khi local track confirmed
- [x] Provisional identity - 5 frames probation trước khi eligible cho merge
- [x] Sticky ID - Vision-occupied slots giữ vehicle_id
- [x] Handoff - chuyển GID giữa cameras
- [x] Departure token - recovery GID khi xe rời slot

---

## ⚠️ Lỗi đã phát hiện (chưa fix)

### Bug 1: GID bị mất khi 2 xe đỗ gần nhau (GID SWAP)

**Mô tả:** Khi 2 xe đỗ sát nhau, chúng có thể:
1. Ban đầu: mỗi xe có GID riêng
2. Tracker merge blobs → 1 detection cho 2 xe
3. Khi tách ra: ReID nhầm → Xe A lấy GID xe B, xe B mất GID

**Root cause tiềm ẩn:**
- `motion_tracker.py` - split detection margin không đủ cho xe tương tự
- `cross_camera_manager.py` - appearance matching weight thấp (0.30) so với position (0.55)
- 2 xe cùng màu → histogram gần giống nhau

**Vị trí code cần fix:**
```
src/techgar/cross_camera_manager.py:2394
cost = 0.55 * (residual / self.prediction_radius) + 0.30 * appearance_distance + ...

→ Đề xuất: 0.40 * residual + 0.45 * appearance + ...
```

### Bug 2: GID mất quá nhanh khi xe đang tìm ô đỗ (SESSION LOSS)

**Mô tả:** Xe đang di chuyển trong bãi để tìm ô trống → **mất GID** → phải cấp GID mới → session bị break

**Root cause tiềm ẩn:**
- `identity_retention_seconds = 60` - có thể quá ngắn
- Khi xe đi chậm hoặc dừng chờ, tracker có thể "coast" rồi mất track
- Motion blur trong low-light làm tracker khó maintain track

**Vị trí code cần fix:**
```
src/techgar/slot_vehicle_binder.py:1275-1276
# Khi vision_occupied = False, vehicle_id bị xóa
if not binding.vision_occupied:
    binding.vehicle_id = None  # ← Có thể quá sớm!

→ Đề xuất: Giữ sticky ID lâu hơn, chỉ xóa khi departure confirmed
```

### Bug 3: Low-light - Histogram nhận diện kém

**Mô tả:** Khi ánh sáng yếu:
1. Histogram subtraction cho motion detection không hoạt động tốt
2. Không có cân bằng histogram (CLAHE/equalization)
3. Xe mờ → tracking thất bại → mất GID

**Root cause:**
- `motion_tracker.py` - background subtraction nhạy cảm với lighting changes
- `parking_detector.py` - có CLAHE nhưng có thể chưa đủ cho low-light

**Vị trí code cần fix:**
```
src/techgar/parking_detector.py
- Thêm adaptive threshold cho low-light
- Cải thiện CLAHE parameters
- Tăng sensitivity cho motion detection trong low-light

src/techgar/motion_tracker.py
- Tăng merge_area_ratio cho low-light
- Giảm motion threshold
```

---

## 📋 Kế hoạch fix

### Phase 1: Fix Bug 2 (GID mất khi tìm ô)
**Ưu tiên: Cao** - Ảnh hưởng trực tiếp đến user experience

1. Tăng `identity_retention_seconds` từ 60 → 120 giây
2. Thêm logging để debug khi nào GID bị mất
3. Fix `_release_vehicle` - giữ sticky ID

### Phase 2: Fix Bug 1 (GID SWAP)
**Ưu tiên: Cao** - Nghiêm trọng, ảnh hưởng billing

1. Tăng appearance weight trong `_candidate_cost`
2. Thêm spatial consistency check
3. Thêm temporal consistency (3-5 frames confirm)

### Phase 3: Fix Bug 3 (Low-light)
**Ưu tiên: Trung bình** - Ảnh hưởng buổi tối

1. Adaptive CLAHE parameters
2. Motion detection tuning cho low-light
3. Có thể cần thêm denoising

---

## 🧪 Test checklist

- [ ] Chạy diagnostic trước/sau fix
- [ ] Test với DroidCam live (2 cameras)
- [ ] Test scenario: 2 xe đỗ gần nhau
- [ ] Test scenario: xe tìm ô > 60 giây
- [ ] Test low-light (che camera, test ban đêm)

---

## 📁 Files quan trọng

| File | Mô tả |
|------|--------|
| `src/techgar/cross_camera_manager.py` | GID management, ReID |
| `src/techgar/slot_vehicle_binder.py` | Slot binding, sticky ID |
| `src/techgar/motion_tracker.py` | Motion detection, split |
| `src/techgar/parking_detector.py` | Parking state detection |
| `experiment_test/diagnose_identity_churn.py` | Diagnostic tool |

---

## 🔧 Commands để test

```powershell
# Test với videos (replay)
cd D:\TechGar2\backend\main_detect
.\.venv\Scripts\python.exe runtime_server.py `
  --replay-session "experiment_test/output/test_gid_swap" `
  --slots-cam1 "config/parking_slots_cam1.json" `
  --slots-cam2 "config/parking_slots_cam2.json" `
  --calibration "config/two_camera.shared_cm_01.json" `
  --mask-cam1 "config/roi_mask_cam1.json" `
  --mask-cam2 "config/roi_mask_cam2.json" `
  --session-dir "experiment_test/output/session_test" `
  --output-dir "experiment_test/output/session_test" `
  --no-display --max-frames 1842

# Diagnostic
.\.venv\Scripts\python.exe experiment_test/diagnose_identity_churn.py experiment_test/output/session_test

# Live với DroidCam
.\.venv\Scripts\python.exe runtime_server.py `
  --cam1-url "http://192.168.100.53:4747/video/force/1280x720" `
  --cam2-url "http://192.168.100.198:4747/video/force/1280x720" `
  --slots-cam1 "config/parking_slots_cam1.json" `
  --slots-cam2 "config/parking_slots_cam2.json" `
  --calibration "config/two_camera.shared_cm_01.json" `
  --mask-cam1 "config/roi_mask_cam1.json" `
  --mask-cam2 "config/roi_mask_cam2.json" `
  --session-dir "experiment_test/output/droidcam_live" `
  --output-dir "experiment_test/output/runtime_live" `
  --api-port 8001
```

---

## 📝 Ghi chú

1. **Pi delegate**: Prompt phải dùng **tiếng Anh** - agentrouter từ chối UTF-8
2. **Session directories**: `--session-dir` và `--output-dir` phải khác nhau
3. **Frame timestamps**: Phải start từ frame_idx=1, timestamps > 0
