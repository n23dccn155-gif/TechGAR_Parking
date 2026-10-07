# notes/brightness — bảng nguồn đã xác minh (builder-a, Task 6)

Đọc 2026-10-06. motion_tracker.py đang dirty — ghi theo file trên đĩa.

## Giá trị → file:dòng → kind

| Giá trị | file:dòng | kind | ghi chú |
|---|---|---|---|
| MOG2: history=700, varThreshold=32, detectShadows=True | motion_tracker.py:203 | runtime | khởi tạo ctor |
| definite foreground = raw_mask > 200 | motion_tracker.py:769-771 | runtime | ngưỡng tuyệt đối |
| MOG2 đánh dấu shadow = giá trị 127 | motion_tracker.py:772-773 (comment) | runtime | |
| 127 chỉ được admit khi reject_cast_shadows + có background learned | motion_tracker.py:780-789 | runtime | mog_shadow_markers |
| Comment failure thật: xe đồ chơi tối trên đường xám hay bị gán 127 khi phone exposure tăng | motion_tracker.py:774-779 | class-default | lý do tồn tại _is_cast_shadow |
| _brightness_shift: median diff trên lưới subsample | motion_tracker.py:473-484 | runtime | trả float grey-level |
| _BRIGHTNESS_SAMPLE_TARGET = 128 | motion_tracker.py:470 | class-default | step = min(h,w)//128 |
| Perf: median full-frame ~17 ms ×2/frame; lưới mẫu ~0.3 ms, sai <1 grey level | motion_tracker.py:463-469 (comment) | class-default | |
| _motion_between: reference += shift rồi absdiff + threshold | motion_tracker.py:450-461 | runtime | bù exposure toàn khung |
| Docstring: trừ median shift để không coi thay đổi phơi sáng là xe | motion_tracker.py:527-531 | class-default | |
| temporal windows: short 0.25 s, long 0.80 s (multiscale) | motion_tracker.py:53-54 | runtime | enable_multiscale_motion |
| frame gaps: 3 / 9 | motion_tracker.py:44,55 | class-default | |
| reference age hợp lệ: [0.45×, 2.25×] target | motion_tracker.py:503 | runtime | reconnect guard |
| timestamp regression → clear toàn bộ history | motion_tracker.py:537-541 | runtime | seek/reconnect |
| _gray_history deque maxlen max(48, long_gap+2) | motion_tracker.py:211 | runtime | |
| _cast_shadow_metrics: attenuation median lum ratio | motion_tracker.py:659-674 | runtime | weights BGR [0.114,0.587,0.299] |
| valid pixels: bg_lum ≥20 & cur_lum ≥3; cần ≥120 px & ≥60% blob | motion_tracker.py:664-667 | runtime | else fail-open (return None) |
| explained test per-pixel: |atten−med|≤0.18, chroma≤1.2×max, residual≤1.5×max | motion_tracker.py:691-695 | runtime | |
| _is_cast_shadow gate: atten ∈[0.32,0.62], chroma≤0.10, residual≤0.08, explained≥0.75 | motion_tracker.py:717-725 + ctor 63-66 | runtime | 4 điều kiện AND |
| fail-open thiết kế: bg trẻ/không đủ → không bao giờ reject | motion_tracker.py:647 (docstring) | class-default | |
| _background_reference: snapshot trước apply, cache 10 frame | motion_tracker.py:728-757 | runtime | _background_refresh_interval=10 |
| reject contour bị xoá khỏi mask + _last_shadow_rejections | motion_tracker.py:1053-1063 | runtime | telemetry cast_shadow_rejected mt:2243-2245 |
| dark_foreground_rescued: ≥20 marker px & ratio ≥0.08 | motion_tracker.py:1040-1045 | runtime | flag trên detection |
| shadow params ctor: reject=False, atten (0.32,0.62), chroma 0.10, residual 0.08, frac 0.75, min_px 120 | motion_tracker.py:62-67 | class-default | |
| runtime: reject_cast_shadows=True, enable_multiscale_motion=True | two_camera.py:2393-2394 | runtime | |
| temporal reported trong predictions: 0.25 / 0.80 s | two_camera.py:3288-3289 | runtime | |

## Lỗi thật / giới hạn cho ⑥

- **Session sang8** quan sát tĩnh: raw cam2 f600 rửa sáng rõ (exposure cao) — đúng kịch bản comment mt:774 mô tả (xe tối bị MOG2 gán 127 sau khi exposure tăng).
- **Fail-open**: background chưa đủ tuổi hoặc blob <120 px hợp lệ → shadow test không chạy → blob bóng đi qua (trade-off có chủ đích, mt:647-657).
- **127 re-admit**: mở lại pixel shadow-classified vào foreground là con đường cho cả vùng tối không-phải-xe quay lại; per-blob test là lưới an toàn duy nhất (mt:776-779 nêu rõ trade-off).
- **Exposure shift chỉ bù global**: shift là một scalar median toàn khung — đổi sáng cục bộ (đèn hắt, bóng mây nửa frame) không được mô hình (suy luận từ mt:473-484).
- E-C-007: vật không-phải-xe (cột gỗ, tay) vẫn detect được — brightness chain không phải class filter.

## Boundary với trang khác

- Motion-detection page kể toàn bộ pipeline MOG2+temporal+morphology; trang này chỉ kể 3 cơ chế chống "đổi sáng thành motion".
- Parking-slots đã kể CLAHE/gamma trong detector ô đỗ — khác hệ, không lặp lại ở đây.
