# Note — motion-detection (phân hệ single-cam)

Nguồn chính: `backend/main_detect/src/techgar/motion_tracker.py` (`MotionVehicleTracker._detect` L759-1086). Trang này phủ nửa đầu: frame → foreground∩motion mask → morphology → contours. Các gate per-contour (size/aspect/anchor/motion-fill/shadow/echo-dedup) thuộc trang `contour-filtering`.

## Cấu trúc mask (đoạn L766-835)

1. `raw_background_mask = bg_sub.apply(frame)` — MOG2 3 giá trị (0/127/255).
2. `definite_foreground = raw > 200` (L769-771). Nếu `reject_cast_shadows` và có background học được: OR thêm pixel `==127` vào `background_mask` (L778-785), đồng thời giữ `mog_shadow_markers` làm nhãn (comment L772-777 ghi lý do: ngưỡng >200 cũ xoá vĩnh viễn thân xe tối).
3. `temporal_motion = _temporal_motion_mask(frame, timestamp_s)` (L786) — bắt buộc. Comment L787: "Motion mask là cổng bắt buộc: foreground đứng yên không được thành xe."
4. `support = dilate(temporal_motion, ones 17×17)` (L788); `mask = background_mask AND support` (L789) — foreground chỉ sống trong vùng có motion gần đó.
5. Nếu có roi_mask: `mask AND _roi_context_mask` (L795-809) — strict ROI dilate thêm `roi_context_padding_px` (ellipse kernel 2p+1; runtime --motion-roi-context-px 48; ctor default 0). Comment L806-808: band giới hạn, KHÔNG mở rộng vùng tạo identity.
6. `MORPH_OPEN` kernel 3×3 (L811) — xoá nhiễu chấm.
7. `MORPH_CLOSE` kernel `motion_join_kernel_size` × iterations (L812-819): ctor default join 5×5, iterations 1 (L90-91); CLI `--motion-join-kernel-size`/`--motion-join-iterations` (two_camera L1844-1850) — nối blob vỡ.
8. `findContours(mask, RETR_EXTERNAL, CHAIN_APPROX_SIMPLE)` (L826).

## Temporal motion (L486-555)

- `_gray_history`: list (timestamp_s, frame_idx, gray) — gray blur 5×5 (L210 comment: DroidCam frame rates).
- `valid_timestamp` lọc NaN; nếu timestamp < timestamp trước đó → history bị clear (L534-541) — đồng hồ lùi reset references.
- `_timestamp_references(timestamp_s)` (L486-500): duyệt history, lấy gray có age gần `temporal_short_seconds=0.25` (và `temporal_long_seconds=0.80` khi `enable_multiscale_motion`). Runtime two_camera L3288-3289 ghi cứng 0.25/0.80.
- Không có timestamp → fallback frame-gap `motion_frame_gap=3` (và `motion_long_frame_gap=9` khi multiscale) — ctor L44, L52.
- Mỗi reference: `_brightness_shift` bù exposure → `absdiff` → threshold `motion_threshold` → mask; OR các mask → open 3×3 → dilate 5×5 iterations 2 (theo ghi nhớ trước — VERIFY lại khi viết page).
- `enable_multiscale_motion`: ctor False; runtime True (two_camera L2393). Class `motion_threshold=25`; runtime `--motion-threshold 20` (two_camera ~L1870 — verify số dòng khi cite).

## Priority / recovery regions

- `_priority_mask` (L590-614): polygons → rasterize; `_box_is_priority` (L615-631): anchor trong polygon hoặc overlap ≥10% bbox → blob dùng ngưỡng priority nhẹ hơn (min_area 350, motion_min_pixels 50, motion_min_ratio 0.03 — ctor L53-57).
- Nguồn polygon: `build_recovery_priority_regions` (L689-708) gọi `binder.recovery_priority_regions(source_now)` — slot binder đặt vùng ưu tiên nơi track mất/chuẩn bị quay lại; wired ở two_camera L2691.

## Ranh giới trang

- `_detect` trả `(detections, mask)`; detections đi vào `_assign` (L1597, LAPJV — trang kalman-lapjv).
- Echo dedup `_suppress_duplicate_detections` (L1112-1134) — trang contour-filtering.
- E-C-006: phantom `coasting`/`new` GID-null sau motion burst/startup — dùng làm limit (ERRORS-SUMMARY).

## Figure

- Raw thai1 cam1 f1500 (đã có sẵn asset brightness-normal-exposure.jpg) — annotate box quanh xe đen đang chạy ở làn trên; caption: chỉ vùng có temporal motion mới qua cổng mask; xe đỗ là foreground nhưng motion≈0 → không detection. Tên asset mới `motion-moving-car.jpg`.
