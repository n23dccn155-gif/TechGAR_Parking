# Note — contour-filtering (phân hệ single-cam)

Nguồn chính: `backend/main_detect/src/techgar/motion_tracker.py`, vòng `for contour in contours` trong `_detect` (L836-1086) + `_suppress_duplicate_detections` (L1112-1134) + echo guards sau assign (L2318-2334). Trang này phủ nửa sau của _detect: từ contour → detection dict → dedup echo. Các gate ROI/anchor/occlusion/shadow đã có trang riêng (roi-mask, occlusion-watershed, brightness) — trang này chỉ nêu vị trí của chúng trong chuỗi.

## Chuỗi gate theo thứ tự code (L836+)

1. **Prefilter tuyệt đối** L844-849: `area < min(min_area=650, priority_min_area=350)` hoặc `w<22` hoặc `h<18` → continue. Comment L839-843: exposure nhảy tạo hàng trăm speckle 3×3, làm polygon work cho tất cả gây latency vô ích.
2. **ROI strict support + context rescue** L855-921 → reject `insufficient_strict_roi_support` (L912). [trang roi-mask]
3. **Occlusion group branch** L922-954: contour thuộc covering_group → merged detection hoặc watershed regions, `continue` sớm. [trang occlusion-watershed]
4. **Giant non-group** L955-956: `area > 0.22·image_area` → continue (chỉ áp khi KHÔNG qua nhánh occlusion).
5. **Oversized bbox** L959-972: `w > 0.30·W` hoặc `h > 0.42·H` hoặc `w·h > 0.12·image_area` → telemetry `oversized_bbox` (ghi max_width/max_height/max_area) + `drawContours` xoá contour khỏi mask → continue.
6. **Aspect ratio** L973-975: `w/h ∉ [0.25, 5.0]` → continue (silent).
7. **Anchor gate** L976-1010 → reject `anchor_outside_roi` (L1004). [trang roi-mask]
8. **Min area** L1011-1014: `area < 650` (hoặc 350 nếu priority) → continue.
9. **Motion evidence** L1015-1019: `motion_pixels = countNonZero(temporal_motion[bbox])`; cần `≥ min_pixels` (100 runtime/160 class; 50 priority) VÀ `motion_pixels/(w·h) ≥ min_ratio` (0.05 runtime/0.08 class; 0.03 priority).
10. **Shadow discriminator** L1020-1063: rasterize contour_selection ∩ mask → mog_shadow_marker_ratio → `dark_foreground_rescued` (≥20 px & ≥0.08); `reject_cast_shadows` → `_is_cast_shadow` → reject + xoá contour. [trang brightness]
11. **Detection dict** L1064-1085: `_histogram(frame, box, mask)`; fields: box, point=bottom_center, area=contourArea, bbox_area, motion_fill_ratio, hist, priority, ambiguous_merged=False, appearance_trusted, observation_kind='detection', roi_clipped/roi_support_*/roi_context_rescued/roi_anchor_tolerated, dark_foreground_rescued, mog_shadow_marker_ratio, spatial_appearance (nếu enable_spatial_appearance ctor L94 → True runtime?).

## Echo dedup (L1086 → L1112-1134)

- `_suppress_duplicate_detections`: sort theo area giảm; một detection bị drop nếu với một "kept" nào đó: NOT `_different_clean_owners` AND `_same_motion_echo` AND IoU ≥0.25 AND Bhattacharyya(hist) ≤0.12.
- `_same_motion_echo` L1088-1110 (docstring: frame-diff chứa cả silhouette cũ lẫn mới của một xe nhanh): cần hist cả hai; không occlusion_members; `size_ratio = min/max(w·h) ≥ 0.45`; `compareHist Bhat ≤ 0.22`; `dist(anchors) ≤ max(24, 1.10·max(min dims))`; `_box_gap ≤ 14` (L407).
- `_different_clean_owners` L1136-1145: hai blob thuộc hai track khác nhau, mỗi track có ≥3 clean_observations, owner sets disjoint → giữ cả hai (hai xe thật chạm nhau).
- `_is_echo_of_matched_track` L1147-1160 + dùng ở L2318-2334: sau assign, unmatched detection nằm trong `max(22, 0.70·max(track.w,h))` quanh `track.history[-4]` (bóng đuôi cũ của track vừa match) → loại khỏi tạo track mới, trừ khi nó là viable pair cho một unmatched track khác.

## Rejection telemetry

- Detection-stage `_last_detection_rejections` types: `insufficient_strict_roi_support` (L912), `anchor_outside_roi` (L1004), `oversized_bbox` (L965). Shadow có `_last_shadow_rejections` riêng (L1054).
- Các type khác (`duplicate_lineage_competition_resolved`, `association_deferred_competing_tracks`, `split_assignment_deferred`, `roi_edge_twin_suppressed`, `association_rejected_stale_track`, `track_frozen_stationary`, `stale_prediction_replaced_by_measurement_anchor` — L1431-1675) nằm trong assignment → trang kalman-lapjv.

## Số liệu ctor vs runtime

- ctor: max_bbox_width/height/area_ratio = 0.30/0.42/0.12 (L87-89, clamp L191-193); min_area 650, min_w 22, min_h 18 (L40-42); motion_min_pixels 160, motion_min_ratio 0.08 (L46-47); priority 350/50/0.03 (L53-55).
- runtime: --motion-min-area 650, --motion-min-pixels 100, --motion-min-ratio 0.05 (two_camera L1807-1815).
- giant: `0.22·image_area` hardcode L955.

## Figure

- contour-giant-blob.jpg — bt cam2 f1422, blob đen 223×247 px góc trái-trên (vật thật, E-C-007) — qua được mọi gate kích thước vì 223<0.30W, 247<0.42H, 55k<0.12·921600. Minh họa: gate size chặn blob "quá lớn không thể là xe", không chặn vật to vừa.
