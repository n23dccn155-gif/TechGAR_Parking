# notes/tracklet-descriptor — bảng nguồn đã xác minh (builder-b, Task 8 Step A)

Đọc ngày 2026-10-06 từ bản trên đĩa.
- `src/techgar/tracklet_descriptor.py` sha256:0cbfacdec9d053fc mtime 2026-09-06T11:13:36 (sạch, không modified)
- `src/techgar/cross_camera_manager.py` sha256:da9a99e6fe8a061e mtime 2026-10-06T11:04:35 (**đang modified** — bản gồm cả stationary_reacquire F2)
- `src/techgar/motion_tracker.py` sha256 — đọc tham chiếu call site
- `two_camera.py` mtime 2026-10-06 (đang modified — F2 flag)

## Giá trị → file:dòng → kind

| Giá trị | file:dòng | kind | ghi chú |
|---|---|---|---|
| Descriptor = concat 3 histogram: HS(16×16=256)×0.70 + LAB chroma(12×12=144)×1.20 + L(16)×0.60 → 416-D, L2-normalize | tracklet_descriptor.py:52-68 (trọng số 61-67, normalize 68) | class-default | docstring 23-29: bbox chứa nhiều nền → chỉ mô tả pixel foreground; HSV không tách đen/xám/trắng → giữ LAB |
| Crop rỗng → zeros(416) (bị loại ở _normalized_copy) | tracklet_descriptor.py:37-39 | runtime | |
| Mask foreground: shape lệch frame → ValueError; crop không có pixel FG → mask=None (fallback full crop) | tracklet_descriptor.py:42-51 | runtime | |
| Quality gate: area<200px² → 0; fg_ratio<0.15 → 0; aspect<0.3 hoặc >4.0 → 0.5; quality=0.5·size+0.3·fg+0.2·aspect; reject khi <0.5 | tracklet_descriptor.py:81-138 (reject dùng tại motion_tracker.py:427-430) | class-default | size_score=min(1,area/1000), fg_score=min(1,ratio·2) |
| Khoảng cách giữa 2 descriptor = Bhattacharyya (cv2.HISTCMP_BHATTACHARYYA) | tracklet_descriptor.py:141-149 | class-default | |
| spatial_histograms: 2 zone nửa-trên/nửa-dưới bbox; zone cần fg ≥ max(20px, 15% diện tích); chỉ same-camera | tracklet_descriptor.py:152-171 (comment 153-156) | class-default | `spatial_distance` = mean 2 zone, None nếu thiếu (174-179) |
| AppearanceTracklet: max_samples=12, sample_interval=3 frame; quá 12 → xóa mẫu cũ nhất | tracklet_descriptor.py:186-209 | class-default | runtime cấp từ `--tracklet-max-samples 12` / `--tracklet-sample-interval 3` (two_camera.py:1970-1971 → 2395-2396; ctor motion_tracker.py:50-51) |
| `track.appearance` (vector đơn) cập nhật EMA addWeighted 0.75 cũ / 0.25 mới, chỉ khi detection trusted | motion_tracker.py:2151-2156 | runtime | |
| aggregate = median theo từng bin; norm≈0 → fallback mean | tracklet_descriptor.py:266-274 | class-default | tương thích code single-histogram |
| merge_appearance_samples: gallery identity tối đa 24 mẫu; dedupe distance≤0.015 → replace; quá 24 → np.linspace giữ đầu-cuối | tracklet_descriptor.py:277-305 | class-default | cap runtime `--global-gallery-max-samples 24` (two_camera.py:1972 → 2253 → ccm ctor 162,327) |
| compare_tracklets: missing gallery → distance=0.25, support=0 | tracklet_descriptor.py:308-315 | class-default | |
| compare_tracklets distance = 0.50·nearest + 0.20·coverage + 0.20·aggregate + 0.10·best3; clip [0,1]; support=min(nL,nR) | tracklet_descriptor.py:316-351 | class-default | nearest = median min của gallery NHỎ hơn (comment 324-326: dest tracklet còn ngắn khi handoff) |
| Gate appearance trong world-trajectory pass: reject khi support≤0 hoặc distance > min(0.45, dormant_appearance_threshold) | cross_camera_manager.py:6917-6941 | runtime | dormant_appearance_threshold runtime 0.60 (CLI tc:1969) → gate hiệu dụng 0.45 |
| appearance_score vào trajectory score = 1 − appearance_distance, trọng số 0.25 | cross_camera_manager.py:6972-6974 / 7017-7019; trajectory_memory.py:397 | runtime | |
| Track hết hạn → gallery nhập identity dormant (create/update + per-camera gallery merge) | cross_camera_manager.py:8552-8613 | runtime | |
| Ngưỡng appearance khác trong pipeline: handoff 0.45 (ctor 151, CLI tc:1928), relaxed 0.82 (ctor 235-238, CLI tc:1929-1937), dormant 0.60 (CLI tc:1969 → ctor 284-288 fallback min(0.75, app+0.15)) | ccm:151,235-238,284-288; two_camera.py:1928-1937,1969 | runtime | |

## Cơ chế đáng viết ③

1. Descriptor 3-kênh 416-D có trọng số + mask foreground (td.py:18-68).
2. Quality gate loại mẫu nhiễu trước khi vào gallery (td.py:81-138 + motion_tracker.py:427-430).
3. Gallery local bounded 12 mẫu / mỗi 3 frame (td.py:182-210) + single-vector EMA 0.75/0.25 cho same-camera (motion_tracker.py:2156) + spatial 2-zone chỉ same-camera (td.py:152-179).
4. Identity gallery 24 mẫu toàn-route, dedupe 0.015, subsample linspace (td.py:277-305); per-camera gallery camera_appearance_samples (ccm:8592-8612).
5. So sánh gallery-với-gallery: 4 thành phần 0.5/0.2/0.2/0.1, missing → 0.25+support 0 (td.py:308-351).
6. Nơi tiêu thụ: world-trajectory gate min(0.45, dormant_thr) (ccm:6926-6941) + appearance weight 0.25 trong trajectory_score (traj_mem:397).

## Giới hạn viết được cho ⑥

- Histogram màu không phân biệt hai xe cùng màu khác hình dạng; distance thấp không đồng nghĩa cùng xe — hệ thống bù bằng trajectory/size/topology (suy luận từ trọng số 0.25 trong score).
- Descriptor giả định màu sắc xe ổn định giữa hai view; zone split chỉ dùng same-camera vì góc nhìn đảo ngược làm top/bottom đổi chỗ (comment td.py:153 "only for same-camera comparison").
- Gallery rỗng → distance=0.25 nhưng support=0 → mọi gate có `support>0` loại trước; tức thiếu evidence không tự động được duyệt (td.py:313-315, ccm:6927-6930).
- Xe che khuất một phần: mask fg<15% → mẫu bị loại → gallery còi; kéo dài → support thấp → gate support loại (liên quan UNSURE cases fragment gallery yếu).
- Fallback `track.appearance` EMA 0.75/0.25 chỉ cho same-camera; không dùng cho cross-camera compare (compare_tracklets đọc gallery).

## Ảnh thật khả dụng cho ⑤

- Cặp frame cam1/cam2 cùng xe trong overlap (từ event `world_trajectory_reid_matched`/`global_id_recovered` trong predictions). Chọn 1 ca verified.
- Có thể annotate: bbox + mask-foreground vùng histogram được tính.
