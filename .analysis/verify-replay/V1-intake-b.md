# V1-intake-B — metadata + lỗi NGOÀI-cohort (không vào 18 §2)

Owner B · chỉ metadata/đọc, không code/config fix.

## E-B-INTAKE-001 · `session_hiep_thai2` — DATA_INTEGRITY (capture 1 frame)
- `raw_cam1.mp4` = **1 frame** (25fps, 0.1MB) · `raw_cam2.mp4` = 1 frame.
- `frame_timestamps.csv` = 1 row (f1, capture 2026-09-27 18:28:30+07) →
  duration thực ≈40ms — record hỏng (capture dừng ngay).
- `predictions.jsonl` = 1 dòng · GT csvs = header-only · `performance.csv`
  1 row (f1, 16.9s processing — init overhead).
- Verdict: **không replay**, loại khỏi cohort §2 (đúng checklist);
  ghi DATA_INTEGRITY không thuộc error-count của campaign.

## E-B-INTAKE-002 · hai pilot `test1` ngoài-cohort — KHÔNG phải REPLAY_FAILURE
Đính-chính (LEAD review): con-số "236/298" trước chỉ là **snapshot đọc giữa-chừng**
lúc tiến-trình còn chạy — file cuối đều đủ 298 lines → không coi là failure
đã-xác-nhận. Cancel ở foreground shell ≠ process failed. Ba artifact tách riêng:

| Output dir | Path engine | lines | last frame_idx | mtime | log |
|---|---|---|---|---|---|
| `verify_cur_test1/` | pilot `two_camera.py` trực-tiếp | 298/298 | 298 | 21:59:38 | `verify_cur_test1.log` (đuôi = local-lost events cuối f298) |
| `verify_cur_rt_test1/` | pilot `runtime_server.py` (port riêng) | 298/298 | 298 | 22:02:46 | `verify_cur_rt_test1.log` |
| `verify_cur_session_test1/` | **official cohort** runtime batch | 298/298 | 298 | 22:09:36 | `verify_cur_session_test1.log` — exit 0, `completed_replay` trong registry |

- Exit code hai pilot không lưu riêng (foreground shell); trạng-thái đo từ
  artifact: output đầy-đủ + log kết-thúc bình-thường → **completed output**.
- `verify_cur_runtime_test1`, `verify_cur_rt_runtime_test1`,
  `verify_cur_runtime_session_test1`: chỉ chứa `global_vehicle_registry.json`
  + `parking_status_cam*.json` (runtime side-state), không `predictions.jsonl`
  — side-artifacts, không phải replay output.
- Hai pilot giữ ngoài cohort 18 theo chỉ-đạo; kết-quả campaign = hàng 3.

## E-B-INTAKE-003 · GT `session_thai8` draft — không gold
- `ground_truth_events.csv` = 24 rows **auto-prefill draft** (mọi
  `notes=auto-prefill: verify`/`verify slot+frame`/`last seen frame`);
  8 rows thiếu `physical_vehicle_id`; anomaly E002 (handoff end=135 <
  start=1856), E011 (handoff cam1→cam1). → tham-khảo, KHÔNG GT vàng.
- `ground_truth_identity.csv` + `ground_truth_slots.csv`: header-only.
- GT mọi session khác: header-only ⇒ ID-switch/lost/event metrics BLOCKED
  (giữ như P0-b-baseline.md).

## Checklist § intake
- Cohort đúng 18 + runtime_session_bt; thai2 loại + ghi riêng ✓
- Pilot tách riêng ngoài-cohort; "236" là mid-run snapshot, output cuối
  đầy-đủ → không ghi REPLAY_FAILURE ✓
- GT draft limitations ghi rõ ✓
