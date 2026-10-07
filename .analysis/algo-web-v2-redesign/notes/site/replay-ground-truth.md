# replay-ground-truth — notes

## Nguồn đã đọc
- `.analysis/verify-replay/V1-replay-results.md` (canonical, 18/18) + `v1-replay-results.json` + `v1-percam-frames.json`
- `.analysis/verify-replay/ERRORS-SUMMARY.md` §0 — số liệu chiến dịch
- `backend/main_detect/two_camera.py` đoạn 155-250 + 1742 + 2054-3089 — cơ chế replay
- `backend/main_detect/experiment_test/output/session_hiep_sang8/` — file list + header 2 GT CSV

## Cơ chế replay (two_camera.py)
- `--cam1-video/--cam2-video` trỏ vào raw_camN.mp4 đã ghi → replay đồng bộ hai cam (L1742)
- Replay bám `frame_timestamps.csv` của session gốc: kiểm cột (L189), frame phải liên tục từ 1 (L206), video nhiều frame hơn CSV → lỗi (L243)
- `replay_timing.frame_idx` bắt buộc = frame_index+1 (L2461-2465) → phát hiện lệch nhịp ngay
- Timestamp trong predictions lấy lại từ replay_timing (capture_unix_ns, wall_time_iso, cam ns, skew) chứ không phải đồng hồ replay (L3021-3031) → output deterministic đối chiếu được với run gốc
- Session-dir mới ghi lại predictions.jsonl + timestamps + performance, `--no-session-video` để chỉ phân tích (L3243)

## Chiến dịch verify-replay (số thật)
- 18/18 session `completed_replay`, exit 0, record_consistent=True, 0 warn/0 error log (V1)
- 41.625 cặp frame = 83.250 cam-frame (tổng cam1 = tổng cam2 từ v1-percam-frames.json)
- Config freeze: 6 file config SHA-256 khớp trước/sau batch; 0 file code sửa
- Auto-scan: 100% frame cả 2 cam qua 7 nhóm cờ
- Eyeball: ~16.300 unique cam-frame ≈ 19.6% — uniform 1f/2s/cam toàn session + event windows FULL (0 PART/0 SKIP, gap≤5f)
- V5 cross-check seed 20261005: A→B 2/2 CONFIRMED; B→C 0/2; C→A 3/3 upheld; type-FP ~1/6 audited

## GT side (điểm mấu chốt của trang)
- Session có 3 GT CSV: ground_truth_slots / _events / _identity — header có schema_version, nhưng ERRORS-SUMMARY §0: "GT CSV gần như chỉ có header" → identity_impact/harm phần lớn UNVERIFIED
- Hệ quả: replay PASS chỉ chứng minh pipeline CHẠY ĐÚNG deterministic trên video đã ghi — là baseline để so, KHÔNG phải đo accuracy
- GT headers (sang8): slots(cols 10), events(cols 14) — schema có sẵn nhưng chưa được điền nội dung đánh giá

## Figure
- sheets/verify_cur_session_thai8/sheet_0040.jpg — contact sheet 3×3 frame replay cam2 (debug output), xe tracked lid40→gid2, slot outlines, ROI vàng
