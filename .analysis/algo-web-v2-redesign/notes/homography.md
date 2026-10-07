# notes/homography — bảng nguồn đã xác minh (lead, Task 4 Step 1)

Đọc ngày 2026-10-06 từ bản file trên đĩa (cross_camera_manager.py đang dirty — hash trạng thái Task 0).

## Giá trị → file:dòng → kind

| Giá trị | file:dòng | kind | ghi chú |
|---|---|---|---|
| 8 cặp điểm bắt buộc, labels A,B,C,D,V1..V4 | tools/rectangle_line_calibration.py:21,43-44 | config (schema điểm) | `rectangle_line_v1`; cũng calibrate_shared_map.py:338-339,352-353 |
| V1–V4 là điểm fit, KHÔNG phải validation held-out | rectangle_line_calibration.py:3-4,101-105 | inference→code nói thẳng | `evidence_kind: training_fit_not_independent_validation`, `independent_validation: False` |
| A–D phải là tứ giác lồi không suy biến (area≥100px²) | rectangle_line_calibration.py:58 | config | điểm chuẩn gắn hệ cm |
| Hai điểm bất kỳ cách nhau ≥4px @1280 | rectangle_line_calibration.py:68-69 | config | |
| V1–V4 cùng thuộc 1 đường: lệch đường ≤8px, thứ tự liên tục, span ≥ max(80px, 0.75×AB) | rectangle_line_calibration.py:70-78 | config | geometry_failures khi vi phạm |
| A–D hai camera phải cùng số đo cm; hệ A(0,0) B(AB,0) C(AB,AD) D(0,AD) | rectangle_line_calibration.py:80-85 | config | |
| Fit all-8-pairs least squares, min_inliers=8, ratio=1.0 (không RANSAC loại điểm) | rectangle_line_calibration.py:87-90 → calibrate_shared_map.py:400-428 | runtime | `use_all_pairs=True` → method=0 |
| Đường dẫn fit: cam2→cam1 relative (normalized @1280) rồi gắn metric bằng A–D | calibrate_shared_map.py:406-473 | runtime | `metric @ relative` cho cam2 |
| **fit_gate: max_error_cm 2.0 / p95_symmetric_px 8.5 / max_symmetric_px 12.0** | rectangle_line_calibration.py:112-126 | config (mặc định hàm) + runtime (có thể override qua CLI `--max-cross-camera-validation-error-cm`, calibrate_shared_map.py:1803) | 3 loại reject: `eight_pair_pixel_residual_exceeded`, `eight_pair_cross_camera_cm_residual_exceeded`, `measured_rectangle_cm_residual_exceeded` |
| Approve flow: fit_ready → visual review → reviewed_fit | rectangle_line_calibration.py:130-148 | runtime | reject nếu fit_gate còn reason |
| **Số fit thật cal-20260927**: p95_px=2.658, max_px=3.035, max_cm=0.398 (limit 2.0); cam1 rms 0.114/max 0.197 cm; cam2 rms 0.116/max 0.201 cm; point_count 8 | config/two_camera.shared_cm_01.json:1470+ (calibration_quality.rectangle_line_fit + cameras) | config | measured thật, dùng để thay số |
| shared_map_anchor class default `bottom_center`, validate ∈ {bottom_center, bbox_center} | cross_camera_manager.py:168,342-345 | class-default | |
| Runtime override `bbox_center` từ config tracking_defaults | config/two_camera.shared_cm_01.json:1460-1462; đọc tại two_camera.py:2165-2167 | config | |
| Cơ chế anchor: bottom_center→`(cx, cy)`; bbox_center→`(cx, cy−h/2)` | cross_camera_manager.py:1455-1472 (`_bbox_anchor`) | runtime | docstring 1458-1465 nêu lý do: bottom-center rơi về 2 đầu đối diện của cùng xe khi 2 cam đối diện; center bất biến-view hơn |
| Anchor cũng quyết định vị trí bbox tham chiếu khi tính IoU | cross_camera_manager.py:5216-5220 | runtime | |
| Anchor đi vào telemetry observation (`shared_map_anchor.reference`) | cross_camera_manager.py:8707-8714 | runtime | |
| **median_slot_length = 9.267515 cm** (60 slots, minAreaRect→max(w,h)→median) | two_camera.py:395-412 | derived | verify: tự chạy lại = 9.267515182495117 |
| SLOT_MATCHING_MULTIPLES: handoff 1.75 / prediction 2.75 / dormant 1.75 / duplicate 0.50 | two_camera.py:387-392 | config | comment 381-386: ngưỡng theo bội số chiều dài ô để scale-independent |
| derive_matching_defaults: round(len×multiple, 3) → 16.218 / 25.486 / 16.218 / 4.634 | two_camera.py:415-423 | derived | |
| resolve_matching_distance: CLI > min(config, derived) > fallback | two_camera.py:426-447 | runtime | comment 433-439: calibration làm trần, không kéo ngưỡng lên |
| Config matching_defaults: 15.0 / 25.0 / 35.0 / 9.0 | config/two_camera.shared_cm_01.json:1463-1468 | config | resolved: min → **15.0 / 25.0 / 16.218 / 4.634** |
| Fallback khi không có config+derived: handoff 100.0, prediction 90.0, dormant 160.0, duplicate=handoff×0.60 | two_camera.py:2168-2195 | runtime | |
| **EMA vận tốc 0.65·old + 0.35·measured** (per-axis, có điều kiện timestamp) | cross_camera_manager.py:660-678 | runtime | first obs: velocity=measured trực tiếp (672-673) |
| RANSAC legacy path (non-line mode): threshold 3.0px@1280, min_inliers 8, ratio 0.75, maxIters 5000, conf 0.999 | calibrate_shared_map.py:400-424 | runtime | chỉ nêu nếu cần đối chiếu; cal hiện tại dùng line mode |

## Giá trị trong ví dụ Gemini → trạng thái xác minh
- 8 cặp điểm ✓ đúng (rectangle_line_v1)
- fit-gate 2.0cm/8.5px/12px ✓ đúng (mặc định `fit_gate`)
- shared_map_anchor bottom_center→bbox_center ✓ đúng (class default vs config override)
- median_slot_length 9.267515 cm ✓ đúng (tự tính lại)
- resolved 15.0/25.0/16.218/4.634 ✓ đúng (min(config,derived))
- EMA 0.65/0.35 ✓ đúng (ccm:676-677)

## Giới hạn viết được cho ⑥ (có bằng chứng)
- Calibration cố định theo thời điểm capture; dời camera/lens → phải chụp lại (workflow capture→mark→build, calibrate_shared_map.py:1-9).
- `evidence_kind: training_fit_not_independent_validation` + `independent_validation: false` (config visual_review + rl report): V1–V4 vào fit, không phải điểm kiểm chứng độc lập → sai số báo cáo là sai số trên tập fit, không phải holdout. (ghi thẳng từ field)
- fit_gate chỉ chạy ở build-time/approve-time; runtime không re-check — sai số phát sinh sau đó (ví dụ rung lắc, đổi mount) không có cơ chế tự phát hiện trong code đã đọc (suy luận: không thấy re-validation runtime trong ccm/two_camera).
- Homography giả định mặt phẳng đất; điểm cao hơn mặt phẳng (nóc xe) chiếu sai — chính lý do anchor dùng bbox đáy/center chứ không điểm tự do (liên hệ docstring 1458-1465 + homography mặt phẳng — phần này là lập luận chuẩn, ghi "suy luận" ở phần vượt mặt phẳng).
