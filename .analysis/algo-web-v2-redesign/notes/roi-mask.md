# notes/roi-mask — bảng nguồn đã xác minh (builder-a, Task 6)

Đọc ngày 2026-10-06 từ bản file trên đĩa. Files sạch (mask_roi.py, config/roi_mask_cam*.json); two_camera.py + motion_tracker.py đang dirty — ghi hash Task 0.

## Giá trị → file:dòng → kind

| Giá trị | file:dòng | kind | ghi chú |
|---|---|---|---|
| Tool vẽ tay, target_points=4 mỗi cam | mask_roi.py:13,86-90 | class-default | click chuột trái thêm điểm; 'r' reset; Enter chốt |
| Preview overlay fillPoly alpha 0.3 | mask_roi.py:43-46 | class-default | chỉ hiển thị lúc vẽ |
| Schema JSON ghi ra: `{polygon:[{x,y}…], image_size:[w,h]}` | mask_roi.py:93-101 | config | image_size lấy từ shape frame thật |
| cam1 polygon: (116,687)(1273,677)(1242,139)(158,143), image_size 1280×720 | config/roi_mask_cam1.json:3-18 | config | file đang dùng |
| cam2 polygon: (13,716)(1253,719)(1162,82)(68,103), image_size 1280×720 | config/roi_mask_cam2.json:3-18 | config | file đang dùng |
| `--mask-cam{1,2}` default = config/roi_mask_cam*.json | two_camera.py:1762-1763 | runtime | |
| `--tracking-roi-cam*` tách ROI tracking khỏi mask handoff | two_camera.py:1764-1777 | runtime | mặc định dùng --mask-cam* |
| Load JSON → fillPoly uint8 mask theo shape frame | two_camera.py:2207-2216 | runtime | custom_masks[cam]["mask"] |
| Gán trackers[cam].roi_mask; không file → union slot masks | two_camera.py:2412-2428 | runtime | fallback get_global_mask |
| Fallback: union bbox-mask của từng ô đỗ | parking_detector.py:174-184 | runtime | get_global_mask(img_shape) |
| Legacy `handoff_edge` trong mask → override adjacency | two_camera.py:2221-2230 | runtime | mask mới không có field này |
| `self.roi_mask` trên MotionVehicleTracker | motion_tracker.py:208 | runtime | Optional[ndarray] |
| Context band = dilate(roi_mask, ellipse 2p+1, 1 iter) khi p>0 | motion_tracker.py:794-811 | runtime | `_roi_context_mask`; class default p=0 (mt:95,233) |
| Runtime p = 48 px qua `--motion-roi-context-px` | two_camera.py:1817-1823 → 2392 | runtime | CLI default 48 |
| Foreground clip: mask &= _roi_context_mask | motion_tracker.py:816 | runtime | comment 812-815: blob chạm ROI được đo nguyên vẹn; không mở rộng vùng tạo identity |
| Per-contour: roi_support_ratio, roi_clipped = ratio < 0.98 | motion_tracker.py:855-875 | runtime | component mask trong bbox |
| required_support = max(20, min(motion_min_pixels, round(0.08×component_pixels))) | motion_tracker.py:876-879 | derived | motion_min_pixels runtime = 100 |
| motion_min_pixels: class 160 / CLI `--motion-min-pixels` 100 | motion_tracker.py:47,108; two_camera.py:1814,2385 | runtime | |
| Rescue path: roi_clipped + support>0 + anchor trong context + context_support ≥ required | motion_tracker.py:889-921 | runtime | ngược lại → reject `insufficient_strict_roi_support` + `_roi_rejected_points` |
| Anchor gate: bottom_center phải nằm trong strict ROI | motion_tracker.py:980-990 | runtime | `_bottom_center` mt:392 |
| Tolerance: blob KHÔNG clipped (≥98% trong) mà anchor lọt mép → chấp nếu anchor trong context band | motion_tracker.py:990-1001 | runtime | roi_anchor_tolerated |
| Anchor ngoài hoàn toàn → reject `anchor_outside_roi` + xoá contour khỏi mask | motion_tracker.py:1002-1010 | runtime | |
| Rejection telemetry: `_last_detection_rejections` types `insufficient_strict_roi_support`, `anchor_outside_roi` | motion_tracker.py:911-919,1003-1008 | runtime | vào predictions/debug |
| Live editor: roi_editor.save() → rebuild detector + roi_mask khi không có explicit tracking ROI | two_camera.py:3123-3147 | runtime | |
| `--show-tracking-roi` vẽ viền ROI vàng trên debug view | two_camera.py:1778-1782 | runtime | |

## Lỗi thật cho ⑥ (ERRORS-SUMMARY.md)

- **E-C-001** (CONFIRMED hiện tượng): sang8 cam2 f129–889 — chuỗi re-id ≥10 lần trên xe mép ROI, nhóm `local-lifecycle`.
- **E-B-003/E-B-006** (UNSURE): coasting/frozen ~140f trên xe nửa-ngoài-ROI và nền gỗ mép — boundary legit hay thiếu coast-TTL chưa chốt.
- **E-C-003** (UNSURE): anchor nằm ngoài ROI trên xe mép — có thể convention kỳ vọng.
- **E-A-039** (CONFIRMED, S3 cosmetic): thai6 cam2 lid14 sống 88f trên vùng watermark/droidcam.app (roi_support_ratio 0.08–0.15) — strict gate + rescue path vẫn cho một blob ngoài phần lớn ROI sống sót.
- **EXPECTED**: ROI_MISMATCH mép (bbox tràn/anchor ngoài, roi_clipped) — hành vi hợp lệ, không phải lỗi.

## Giới hạn thiết kế (ghi được)

- Polygon đúng 4 đỉnh, vẽ tay một lần; không re-validate polygon vs image_size khi load (suy luận từ two_camera.py:2207-2216 — chỉ fillPoly theo shape frame, không so image_size).
- Tách hai lớp ROI: mask (handoff/quan sát) vs tracking-roi; khác nhau gây vùng chết (inference từ comment 2409-2411).
- Fallback union-slot-mask khi thiếu file — vùng ngoài ô đỗ không được detect.
- Rescue/context band chỉ cứu blob chạm strict ROI; blob hoàn toàn trong band vẫn chết (comment 884-888).
