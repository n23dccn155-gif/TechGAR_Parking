# tools/SOURCES.md — nguồn ảnh thật cho assets/real/

Mọi ảnh trong `assets/real/` đều phải truy về nguồn gốc thật (bản ghi
`origin` trong `assets/real/manifest.json`). File này liệt kê các nguồn
đã khảo sát và cách dùng.

## 1. Video runtime (read-only)

`D:\TechGar2\backend\main_detect\experiment_test\output\<SESSION>\`

Mỗi session có:

- `raw_cam1.mp4`, `raw_cam2.mp4` — video gốc 1280×720 hai camera;
- `debug_cam1.mp4`, `debug_cam2.mp4` — video có overlay track/slot của pipeline;
- `predictions.jsonl`, `ground_truth_*.csv`, `session_info.json`.

Session đã xác nhận có đủ raw video cả hai cam:

- `session_hiep1/2/3`, `session_hiep_sang7/8/9`,
- `session_hiep_thai1/2/3`, `session_hiep_thai5/6/7/8`, `runtime_session_bt`.

Trích frame:

```
python tools/extract_frames.py --session session_hiep_sang8 \
    --cam 1 --frame 600 --source raw --out qa/out/probe.png
```

`--source debug` lấy video đã render overlay sẵn của pipeline (hợp cho trang
minh họa trạng thái track/slot mà không tự vẽ lại).

## 2. Frame hiệu chuẩn hai camera (read-only)

`D:\TechGar2\backend\main_detect\config\shared_map_01\attempts\cal-20260927-160513-decd3099\`

- `capture_cam1.png`, `capture_cam2.png` — frame chụp lúc hiệu chuẩn (1280×720,
  có xe đỗ thật trong cảnh);
- `marked_cam1.png`, `marked_cam2.png` — bản đã đánh dấu 8 điểm của tool gốc;
- `calibration_points.csv`, `paired_ground_points.json`,
  `cross_camera_validation_points.json` — tọa độ điểm nguồn;
- `shared_map_*.png` — preview bản đồ dùng chung.

Điểm pixel dùng cho overlay lấy từ
`backend/main_detect/config/two_camera.shared_cm_01.json`
(`calibration_quality.rectangle_line_fit.points[].cam1_pixel/cam2_pixel`):

| điểm | cam1 px      | cam2 px      | vai trò          |
|------|--------------|--------------|------------------|
| A    | (1010, 217)  | (329, 100)   | metric_anchor    |
| B    | (974, 68)    | (293, 258)   | metric_anchor    |
| C    | (688, 68)    | (633, 254)   | metric_anchor    |
| D    | (690, 217)   | (631, 98)    | metric_anchor    |
| V1   | (386, 178)   | (948, 124)   | line_correction  |
| V2   | (512, 176)   | (818, 128)   | line_correction  |
| V3   | (668, 174)   | (654, 133)   | line_correction  |
| V4   | (876, 176)   | (441, 135)   | line_correction  |

## 3. Cách ghi manifest

`tools/annotate.py` tự ghi `origin = "<session>/f<frame>/cam<cam>"` +
`sha256` của ảnh nguồn vào `assets/real/manifest.json`. Với ảnh không qua
video (`image_path` trong spec), đặt `session`/`cam`/`frame` trong spec sao
cho `origin` vẫn mô tả đúng provenance — ví dụ
`session="shared_map_01/cal-20260927", cam=1, frame=0` →
`origin="shared_map_01/cal-20260927/f0/cam1"`.

Font nhãn: PIL không đọc được WOFF2 → dùng `C:\Windows\Fonts\segoeui.ttf`
(đủ glyph tiếng Việt), fallback `arial.ttf`, `DejaVuSans.ttf`.
