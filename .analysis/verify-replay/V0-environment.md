# V0 — Environment & lệnh replay chuẩn (builder-b)

## Git / freeze baseline
- `git rev-parse HEAD` = `5f581311e34cb7c588197c6f01d2b9686d28df8d`
- `git status --porcelain backend/` — **KHÔNG sạch** (đã có sẵn trước chiến-dịch, ghi để tái-lập):
  - `M` `src/techgar/cross_camera_manager.py`, `src/techgar/slot_vehicle_binder.py`, `src/techgar/trajectory_memory.py`, `tests/test_gid_departure_token.py`, `tests/test_gid_reserved_competition.py`
  - `??` `experiment_test/merge_split_report.py`, `experiment_test/reid_fix/`, `tests/test_merge_split_scenarios.py`
  - ⇒ Replay chạy trên **worktree hiện-tại** (không phải HEAD sạch). Mọi diff sau này phải so với snapshot này, không phải HEAD.

## Config sha256 (đủ 6 file §0.3, hiện-tại, không đổi)
| file | sha256 |
|---|---|
| `config/roi_mask_cam1.json` | `d49c9c33c5743770d7a7b2334a4fff5ad69060ad01a3702a1cd716c28d67c1aa` |
| `config/roi_mask_cam2.json` | `67d524824ebda5cf4ba71181753fe50602562405d15f5dcd520d2bc779983532` |
| `config/two_camera.shared_cm_01.json` | `ec759c558c3ccfebf1e7acde56820ce87431ee3d5892ac4e0591ca038860aef2` |
| `config/parking_slots_cam1.json` | `2120a4d358d01a549624948e2f531fa9e536940834567f5914be9f64925b56d6` |
| `config/parking_slots_cam2.json` | `d6362abbdc506e2af6c43c09b2a6ad26274cf84537b370cc6c7c8321a7761d49` |
| `config/gate_zones.json` | `e394fd6776914903a4a7a2424842c7eb5e20230fd6f804323113445c815de6c2` |

## Runtime
- Python `3.11.9` (`backend/main_detect/.venv/Scripts/python.exe`) · cv2 `5.0.0` · numpy `2.4.6`
- CPU 16 threads · Disk D: 42G free (đủ cho ~85MB/session ×18 ≈ 1.5GB + log)
- OS Windows; không GPU giả-định.

## Cờ replay liên quan (`runtime_server.py --help` = `run_two_camera_session.make_parser`, share với `two_camera.py`)
`--replay-session <dir>` · `--cam1-video/--cam2-video` (resolve → replay-session) · `--cam1-url/--cam2-url` · `--replay-realtime` (pace theo timestamp — KHÔNG dùng, cần tốc-độ max) · `--replay-async-vision` (KHÔNG dùng — ghi "non-deterministic scheduling" trong help) · `--live-mode` (không dùng) · `--session-dir` (PHẢI chưa tồn-tại) · `--output-dir` (runtime dir, ≠ session-dir) · `--no-session-video` (chỉ ghi timestamps/predictions, không copy MP4 — dùng để tiết-kiệm đĩa) · `--no-display` · `--opencv-threads 1` · `--json-fps` · `--max-frames` · `--api-port` (chỉ runtime_server).

## Lệnh replay CHUẨN — runtime_server (đã chốt, pilot-verified)
```
.venv/Scripts/python.exe -u runtime_server.py \
  --cam1-video "experiment_test/output/<SOURCE>/raw_cam1.mp4" \
  --cam2-video "experiment_test/output/<SOURCE>/raw_cam2.mp4" \
  --slots-cam1  "config/parking_slots_cam1.json" \
  --slots-cam2  "config/parking_slots_cam2.json" \
  --calibration "config/two_camera.shared_cm_01.json" \
  --mask-cam1   "config/roi_mask_cam1.json" \
  --mask-cam2   "config/roi_mask_cam2.json" \
  --session-dir "experiment_test/output/verify_cur_<S>" \
  --output-dir  "experiment_test/output/verify_cur_runtime_<S>" \
  --no-session-video --no-display --opencv-threads 1 \
  --api-host 127.0.0.1 --api-port <unique> \
  > "experiment_test/output/verify_cur_<S>.log" 2>&1
```
- `--camN-video` → `_resolve_raw_session()` (`run_two_camera_session.py:119-124`) → `args.replay_session` → `two_camera.run` (`runtime_server.py:418`) — engine thật của runtime, server tự shutdown khi replay xong (`finally` :419-424).
- `gate_zones.json`: runtime_server nạp `DEFAULT_GATE_CONFIG=config/gate_zones.json` (`runtime_server.py:22,239-243`) — **có trong runtime path** (không loại khỏi yêu cầu).
- Không dùng `--replay-realtime` (runtime default không pace = full-speed replay) / `--replay-async-vision` (help: non-deterministic) / `--live-mode`.
- Process tự-thoát khi replay xong (verified trên pilot — exit 0, không treo server).

## Pilot runtime (trước batch) — PASS
- `session_test1` (298f): **exit 0**, `verify_cur_rt_test1/predictions.jsonl` = **298/298 dòng**, `schema_version=3` keys khớp-1-1 với session gốc, `session_info`: `processed_frames=298`, `record_counts_consistent=true`, `status=completed_replay`, log **0 Traceback**. Runtime path dùng cho toàn batch.
- Ghi chú artifact: pilot sớm `two_camera --replay-session` bị interrupt giữa-chừng (`verify_cur_test1`, 236/298 dòng, không session_info) — **giữ nguyên không xóa**; batch runtime dùng tên `verify_cur_session_test1` nên không đụng.

## Fallback (chỉ khi runtime lỗi trên session cụ-thể)
`two_camera.py --replay-session <S>` cùng config — code-path identica qua `prepare_args`/`two_camera.run` (đã verify tĩnh); chỉ dùng sau khi runtime pilot của session đó FAIL và ghi lý-do + đối-chiếu output.
