# V1-replay-results — CANONICAL (18/18 official, final)

Chốt: **18/18 `completed_replay` · exit 0 · record_consistent=True ·
0 warn · 0 error lines** trên toàn cohort. Không replay thêm.
Machine-readable nguồn: `v1-replay-results.json` (runner, full argv
per-session) + `v1-final-stats.json` + `v1-percam-frames.json`.

## Command template (per-session, từ `run_verify_replays.py`)

```powershell
.\.venv\Scripts\python.exe -u runtime_server.py `
  --cam1-video "experiment_test\output\<SRC>\raw_cam1.mp4" `
  --cam2-video "experiment_test\output\<SRC>\raw_cam2.mp4" `
  --slots-cam1 config/parking_slots_cam1.json `
  --slots-cam2 config/parking_slots_cam2.json `
  --calibration config/two_camera.shared_cm_01.json `
  --mask-cam1 config/roi_mask_cam1.json `
  --mask-cam2 config/roi_mask_cam2.json `
  --session-dir "experiment_test\output\<OUT>" `
  --output-dir "experiment_test\output\verify_cur_runtime_<SRC>" `
  --no-session-video --no-display --opencv-threads 1 `
  --api-host 127.0.0.1 --api-port <8101+i>
```
`<SRC>` = source session dir; `<OUT>` = `verify_cur_<SRC>`; runtime
side-state = `verify_cur_runtime_<SRC>`; log = `<OUT>.log`. Full argv
từng session: `v1-replay-results.json[<src>].cmd`.

## Registry (18/18)

| # | source dir | session_dir (output) | log | cam1 | cam2 | pred_lines | ts_rows | exit | status | elapsed | size |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | `session_test1` | `verify_cur_session_test1` | `verify_cur_session_test1.log` | 298 | 298 | 298 | 298 | 0 | completed_replay | 215.8s | 29.7MB |
| 2 | `session_hiep_toi4` | `verify_cur_session_hiep_toi4` | `verify_cur_session_hiep_toi4.log` | 620 | 620 | 620 | 620 | 0 | completed_replay | 422.4s | 32.4MB |
| 3 | `session_hiep2` | `verify_cur_session_hiep2` | `verify_cur_session_hiep2.log` | 642 | 642 | 642 | 642 | 0 | completed_replay | 423.4s | 32.8MB |
| 4 | `session_hiep_sang9` | `verify_cur_session_hiep_sang9` | `verify_cur_session_hiep_sang9.log` | 727 | 727 | 727 | 727 | 0 | completed_replay | 439.1s | 38.6MB |
| 5 | `session_hiep_sang7` | `verify_cur_session_hiep_sang7` | `verify_cur_session_hiep_sang7.log` | 817 | 817 | 817 | 817 | 0 | completed_replay | 466.7s | 42.5MB |
| 6 | `session_hiep_toi5` | `verify_cur_session_hiep_toi5` | `verify_cur_session_hiep_toi5.log` | 806 | 806 | 806 | 806 | 0 | completed_replay | 512.9s | 42.0MB |
| 7 | `session_hiep3` | `verify_cur_session_hiep3` | `verify_cur_session_hiep3.log` | 826 | 826 | 826 | 826 | 0 | completed_replay | 477.4s | 41.9MB |
| 8 | `session_hiep_toi6` | `verify_cur_session_hiep_toi6` | `verify_cur_session_hiep_toi6.log` | 865 | 865 | 865 | 865 | 0 | completed_replay | 528.5s | 47.6MB |
| 9 | `session_hiep_sang8` | `verify_cur_session_hiep_sang8` | `verify_cur_session_hiep_sang8.log` | 929 | 929 | 929 | 929 | 0 | completed_replay | 533.5s | 48.0MB |
| 10 | `session_hiep1` | `verify_cur_session_hiep1` | `verify_cur_session_hiep1.log` | 1049 | 1049 | 1049 | 1049 | 0 | completed_replay | 578.8s | 52.5MB |
| 11 | `runtime_session_bt` | `verify_cur_runtime_session_bt` * | `verify_cur_runtime_session_bt.log` | 1529 | 1529 | 1529 | 1529 | 0 | completed_replay | 725.2s | 80.1MB |
| 12 | `session_thai8` | `verify_cur_session_thai8` | `verify_cur_session_thai8.log` | 1952 | 1952 | 1952 | 1952 | 0 | completed_replay | 921.8s | 102.6MB |
| 13 | `session_thai7` | `verify_cur_session_thai7` | `verify_cur_session_thai7.log` | 2872 | 2872 | 2872 | 2872 | 0 | completed_replay | 1281.9s | 154.3MB |
| 14 | `session_hiep_thai5` | `verify_cur_session_hiep_thai5` | `verify_cur_session_hiep_thai5.log` | 3977 | 3977 | 3977 | 3977 | 0 | completed_replay | 2538.0s | 219.5MB |
| 15 | `session_hiep_thai4` | `verify_cur_session_hiep_thai4` | `verify_cur_session_hiep_thai4.log` | 5764 | 5764 | 5764 | 5764 | 0 | completed_replay | 3627.0s | 312.6MB |
| 16 | `session_thai6` | `verify_cur_session_thai6` | `verify_cur_session_thai6.log` | 5937 | 5937 | 5937 | 5937 | 0 | completed_replay | 3579.7s | 339.8MB |
| 17 | `session_hiep_thai3` | `verify_cur_session_hiep_thai3` | `verify_cur_session_hiep_thai3.log` | 5965 | 5965 | 5965 | 5965 | 0 | completed_replay | 3223.3s | 320.4MB |
| 18 | `session_hiep_thai1` | `verify_cur_session_hiep_thai1` | `verify_cur_session_hiep_thai1.log` | 6050 | 6050 | 6050 | 6050 | 0 | completed_replay | 3123.4s | 326.4MB |

*source `runtime_session_bt` → output prefix `verify_cur_` + tên-source
nên dir = `verify_cur_runtime_session_bt` (**đây LÀ official output**);
side-state của nó = `verify_cur_runtime_runtime_session_bt`.
Verified 1529/1529 + `session_info.json` completed_replay ended 22:41.

Mọi path dưới `backend/main_detect/experiment_test/output/`.
Tổng processed = **41,625 frames** = 41,625 pred lines = 41,625 ts rows.

## Config sha256 — trước (V0) vs sau batch: IDENTICAL

| file | V0 sha256 | post-batch sha256 | match |
|---|---|---|---|
| `config/roi_mask_cam1.json` | d49c9c33…8d67c1aa | d49c9c33…8d67c1aa | ✓ |
| `config/roi_mask_cam2.json` | 67d52482…7983532 | 67d52482…7983532 | ✓ |
| `config/two_camera.shared_cm_01.json` | ec759c55…860aef2 | ec759c55…860aef2 | ✓ |
| `config/parking_slots_cam1.json` | 2120a4d3…25b56d6 | 2120a4d3…25b56d6 | ✓ |
| `config/parking_slots_cam2.json` | d6362abb…a7761d49 | d6362abb…a7761d49 | ✓ |
| `config/gate_zones.json` | e394fd67…815de6c2 | e394fd67…815de6c2 | ✓ |

Full hashes (V0): roi_cam1 `d49c9c33c5743770d7a7b2334a4fff5ad69060ad01a3702a1cd716c28d67c1aa`
· roi_cam2 `67d524824ebda5cf4ba71181753fe50602562405d15f5dcd520d2bc779983532`
· calibration `ec759c558c3ccfebf1e7acde56820ce87431ee3d5892ac4e0591ca038860aef2`
· slots_cam1 `2120a4d358d01a549624948e2f531fa9e536940834567f5914be9f64925b56d6`
· slots_cam2 `d6362abbdc506e2af6c43c09b2a6ad26274cf84537b370cc6c7c8321a7761d49`
· gate_zones `e394fd6776914903a4a7a2424842c7eb5e20230fd6f804323113445c815de6c2`.
Post-batch re-hash 2026-10-06: **6/6 byte-identical** — freeze giữ nguyên.

## HEAD / worktree status

- `HEAD = 5f581311e34cb7c588197c6f01d2b9686d28df8d`
  ("chore: live calibration 27/9 + gate-config doc clarity").
- Worktree pre-existing modifications (KHÔNG do batch/analysis tạo —
  trạng-thái repo có sẵn, không đụng): `src/techgar/cross_camera_manager.py`,
  `src/techgar/slot_vehicle_binder.py`, `src/techgar/trajectory_memory.py`,
  `tests/test_gid_departure_token.py`, `tests/test_gid_reserved_competition.py`.
- Untracked analysis dirs: `.analysis/`, `.publish/`, `algo-web-v2/`.

## Record counts per session (đầy-đủ)

Mọi session: `pred_lines == processed_frames == src_frames ==
cam1 == cam2 == ts_rows` và `record_consistent=True` (runner check).
Tức record-counts khớp 1:1:1 trên cả 18 — không frame rớt.
Ngoại-lệ duy-nhất không phải count mà là **tên dir** của bt (xem *).

## Ngoài cohort (giữ riêng, không đếm vào 18)

- `verify_cur_test1` (two_camera pilot) + `verify_cur_rt_test1`
  (runtime pilot): cả hai **298/298 lines hoàn-chỉnh** — "236" trước là
  snapshot mid-run, KHÔNG REPLAY_FAILURE (`V1-intake-b.md`).
- `verify_cur_runtime_session_bt` = **replay output chính-thức** của
  `runtime_session_bt` (1529/1529, exit 0) — KHÔNG phải side-state.
- `verify_cur_runtime_runtime_session_bt` + `verify_cur_runtime_<src>`
  của các session khác = runtime side-state dirs (registry/
  parking_status, không có predictions.jsonl) — không phải output.
- `session_hiep_thai2` = DATA_INTEGRITY (1 frame/cam, capture dừng
  ~18:28:30) — excluded, không replay.
