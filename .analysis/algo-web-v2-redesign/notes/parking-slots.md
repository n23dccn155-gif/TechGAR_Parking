# notes/parking-slots — bảng nguồn đã xác minh (builder-a, Task 6)

Đọc 2026-10-06. parking_detector.py + two_camera.py đang dirty — ghi theo file trên đĩa.

## Giá trị → file:dòng → kind

| Giá trị | file:dòng | kind | ghi chú |
|---|---|---|---|
| Picker: 4 điểm/slot, left-click thêm, 'a' accept | tools/ParkingSpacePicker_ve_js.py:115-118,160-165 | class-default | right-click xoá ô chứa điểm (pointPolygonTest) |
| order_points: sort theo góc quanh centroid, xoay top-left đứng đầu | tools/ParkingSpacePicker_ve_js.py:25-32 | class-default | chuẩn hoá thứ tự đỉnh |
| id slot = `{ROW}{NN:02d}` tăng dần theo hàng | tools/ParkingSpacePicker_ve_js.py:61-68 | class-default | row A-Z qua prompt/'o' |
| Schema file: {imageWidth, imageHeight, slots[{id,type:"polygon",polygon[{x,y}×4],center,status:"empty"}]} | tools/ParkingSpacePicker_ve_js.py:88-107 | config | atomic write qua .tmp |
| Load có scale theo imageWidth/Height | tools/ParkingSpacePicker_ve_js.py:70-86 | class-default | rescale khi độ phân giải đổi |
| cam1: 30 ô hàng D/E/F; cam2: 30 ô hàng A/B/C; 1280×720 | config/parking_slots_cam1.json; cam2.json | config | 60 ô tổng |
| Detector load JSON + scale polygon theo frame | parking_detector.py:142-159,228-244 | runtime | FileNotFoundError nếu thiếu file |
| _PrecomputedROI: bbox pad ±2, local_mask fillPoly, area | parking_detector.py:249-261 | runtime | |
| analysis_mask = erode(local_mask, ellipse 2·inset+1), inset = min_dim × border_ignore_ratio | parking_detector.py:263-274 | runtime | border_ignore_ratio 0.12 (ctor:107) |
| analysis_boundary = analysis_mask − erode3×3(analysis_mask) | parking_detector.py:276-280 | runtime | |
| core_mask = polygon thu core_scale quanh centroid ∩ analysis | parking_detector.py:288-297 | runtime | core_scale class 0.55 / runtime 0.80 (two_camera:2278) |
| Preprocess: LAB→L, CLAHE(2.0, 8×8), gamma LUT(2.8), blur3, adaptiveThreshold(GAUSS, INV, 25, 16), median5, dilate3×3 | parking_detector.py:458-482 | runtime | base pass |
| Ensemble 25 biến thể: Δclahe [-0.5..0.5] × Δgamma [-0.2..0.2] | parking_detector.py:454-456,498-513 | runtime | mỗi variant tự filter (selective_line_filter) |
| empty vote: ratio < ratio_thr; exit vote: ratio < min(ratio_thr, exit_ratio_thr) | parking_detector.py:526-530 | runtime | |
| required_votes = 25//2 = 12 | parking_detector.py:533 | derived | cần ≥12/25 phiếu trống |
| core rescue: core_ratio ≥ 0.18 & component ≥ 0.08; hoặc raw ≥ 0.30 & core ≥ 0.02 | parking_detector.py:418-427 | runtime | lật is_free → occupied |
| edge recheck Canny(50,150) + dilate, edge_thr 0.25 | parking_detector.py:552-566 | class-default | TẮT ở two_camera (use_edge_recheck=False) |
| TemporalSmoother: pending N frame liên tiếp mới lật | parking_detector.py:63-79,575-576 | runtime | smoothing_frames runtime = 1 |
| Runtime ctor: smoothing=1, no edge recheck, core_scale 0.80, stable_evidence+line_filter on | two_camera.py:2271-2284 | runtime | `--legacy-parking-filter` đảo cả hai |
| ratio_thr runtime = clip(parking_enter_ratio 0.12) | two_camera.py:1786,2328-2330 | runtime | class default 0.20 |
| exit_ratio 0.08 / occupied_seconds 0.5 / empty_seconds 1.0 | two_camera.py:1787-1789,2281-2283 | runtime | |
| Async worker: ThreadPoolExecutor(2), job mỗi ≥1/parking_fps (2.0 Hz) | two_camera.py:2287-2290,2528,2635-2655 | runtime | PendingParkingJob + health telemetry |
| max_result_age 1.0 s → bỏ kết quả cũ | two_camera.py:1790-1795 | runtime | |
| accept_evidence: dwell machine — enter cần count≥2 & ≥0.5s; exit cần ≥3 & ≥1.0s; gap>1.5s reset | parking_detector.py:602-645 | runtime | stable_evidence path |
| Slot chưa init → occupied=True (placeholder không phải chỗ trống) | parking_detector.py:641-643 | runtime | |
| Fallback ROI: get_global_mask = union mask các ô | parking_detector.py:174-184 | runtime | trang roi-mask đã kể |
| evidence per slot: raw_ratio, filtered_ratio, empty_votes, rescue, enter/exit_ratio | parking_detector.py:584-595 | runtime | vào predictions |

## Lỗi thật cho ⑥

- **SLOT_BINDING_ERROR f1–61 mọi session (EXPECTED)**: xe đỗ sẵn trước session → vision occupied đúng nhưng tracker không track (motion-based) = giới hạn thiết kế, từ ERRORS-SUMMARY §3.
- **E-C-006 / phantom bursts**: nhiễu detection ở startup — occupancy latch ~29-30 nên output cuối đứng (E-B-001 toi6).
- **E-B-001/002**: toi6 mass respawn nhưng latch giữ — ví dụ dwell machine chống flap.
- Vision-occupied without track = `vision-occupied w/o tracking 60f` flags đều dừng ~f61 (warmup window).

## Giới hạn thiết kế

- Occupancy hoàn toàn pixel-based (threshold L-channel), không background model riêng; xe tối màu trên nền tối = ít pixel trắng → phụ thuộc ensemble + rescue.
- Ensemble 25 variant mỗi frame nhưng chạy async 2 Hz → latency tới ~0.5 s + dwell.
- Slot chỉ là polygon phẳng; xe đỗ sai vạch sang ô bên tính theo anchor của binder, không phải occupancy của detector (ranh giới trách nhiệm với trang slot-binder).
- Picker load-rescale giúp đổi độ phân giải, nhưng file cũ status:"empty" luôn ghi mới khi save (status runtime không persist).
