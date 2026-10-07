# notes/replay-ground-truth.md — Step A bảng nguồn (backfill builder-c, 2026-10-06)

Files đọc: `backend/main_detect/two_camera.py` (replay wiring + GT),
`.analysis/verify-replay/` (V1-replay-results.md, v1-percam-frames.json,
v1-replay-results.json, ERRORS-SUMMARY.md). Chi tiết trong page ⑦.

## giá trị → file:dòng → kind
| giá trị | nguồn | kind |
|---|---|---|
| nguồn frame replay: raw_cam1.mp4 + raw_cam2.mp4 | two_camera.py:1742 | runtime |
| kiểm timestamps: đủ cột + frame liên tục từ 1 | two_camera.py:189-206 | runtime |
| lệch nhịp = lỗi cứng, không phải cảnh báo | two_camera.py:243,2461-2465 | runtime |
| timestamp snapshot lấy từ replay_timing frame gốc | two_camera.py:3021-3031 | runtime |
| --no-session-video = chế độ analysis-only | two_camera.py:3243 | runtime |
| 18/18 session official completed_replay, exit 0 | .analysis/verify-replay/V1-replay-results.md | runtime |
| tổng 41.625 cặp frame = 83.250 cam-frame | .analysis/verify-replay/v1-percam-frames.json | runtime |
| 6 file config freeze SHA-256 khớp trước/sau | .analysis/verify-replay/V1-replay-results.md | runtime |
| eyeball coverage ~16.300 cam-frame ≈ 19.6% | .analysis/verify-replay/ERRORS-SUMMARY.md | runtime |
| session ngắn nhất test1: 298 frame (~216 s) | .analysis/verify-replay/v1-replay-results.json | runtime |
| session dài nhất hiep_thai1: 6050 frame | .analysis/verify-replay/v1-percam-frames.json | runtime |
| warn/error log cohort: 0 + 0 | .analysis/verify-replay/v1-replay-results.json | runtime |
| 3 file GT: ground_truth_{slots,events,identity}.csv | two_camera.py:2125-2140 | runtime |
| GT hiện tại gần như chỉ header → harm UNVERIFIED | .analysis/verify-replay/ERRORS-SUMMARY.md | runtime |
