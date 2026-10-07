# V1 — Runtime replay batch (builder-b)

Batch: `experiment_test/verify/run_verify_replays.py` — `runtime_server.py` path,
≤3 process, `--opencv-threads 1`, session ngắn trước, output mới
`verify_cur_session_<src>` + runtime dir `verify_cur_runtime_session_<src>` +
log `verify_cur_session_<src>.log`. Registry JSON tự-ghi mỗi FINISH:
`.analysis/verify-replay/v1-replay-results.json`.

## Config freeze — hash 6 file §0.3

| file | sha256 (trước batch) |
|---|---|
| `config/parking_slots_cam1.json` | `xem V0-environment.md` |
| `config/parking_slots_cam2.json` | " |
| `config/roi_mask_cam1.json` | " |
| `config/roi_mask_cam2.json` | " |
| `config/two_camera.shared_cm_01.json` | " |
| `config/gate_zones.json` | " |

(Hash đầy-đủ tại `V0-environment.md` §0.3 — re-hash sau batch, diff ở § cuối.)

## Lệnh chuẩn (mỗi session)

```
runtime_server.py --cam1-video <src>/raw_cam1.mp4 --cam2-video <src>/raw_cam2.mp4
  --slots-cam1 config/parking_slots_cam1.json --slots-cam2 config/parking_slots_cam2.json
  --calibration config/two_camera.shared_cm_01.json
  --mask-cam1 config/roi_mask_cam1.json --mask-cam2 config/roi_mask_cam2.json
  --session-dir <verify_cur_session_*> --output-dir <verify_cur_runtime_session_*>
  --api-port <unique> --no-session-video --no-display --opencv-threads 1
```

ROI thực-dùng: `config/roi_mask_cam1.json` + `roi_mask_cam2.json` (truyền CLI,
runtime log confirm `using roi` / session_info) — KHÔNG loại gate khỏi yêu-cầu.

## Pilot runtime (đã PASS, LEAD review)

- `session_test1`: exit 0 · 298/298 prediction lines · schema v3 ·
  `session_info.status=completed_replay` · keys khớp session gốc · no traceback.
- elapsed **215.8s / 298f = ~1.38 fps** — chậm hơn ước-tính 6.5fps ~4.7×.
  **ETA thật cohort 18**: **41,625 frames** (đúng §2) → ~90–160 min
  (3 proc song-song, critical-path ~6k-frame sessions ≈ 73 min cái).
  Không tự đổi async/config để tăng tốc.

## Cohort §2 — đã xác-minh đúng 18 tên

Harness hardcode đúng: `test1, toi4, hiep2, sang9, toi5, sang7, hiep3,
toi6, sang8, hiep1, runtime_session_bt, thai8, thai7, thai5, thai4,
thai6, thai3, thai1` — **gồm `runtime_session_bt` (1529f), KHÔNG replay
`session_hiep_thai2` (hỏng, 1 frame)**. Tổng 41,625 khớp §2 (báo-cáo
trước ghi 40,097 do glob `session_*` sai — đã sửa).

Per-cam frames (metadata video, cam1=cam2 mọi session, fps=25):
`percam-frames.json`; mỗi session cam1=cam2=N frames.
- Hai pilot ngoài-cohort (`verify_cur_test1` two_camera, `verify_cur_rt_test1`
  runtime) đều đạt **298/298 lines** — "236" trước là snapshot mid-run, KHÔNG
  phải REPLAY_FAILURE (đính-chính `V1-intake-b.md` §002). Chi-tiết artifact
  runtime side-state xem intake report.

## Registry (cập nhật mỗi FINISH)

| # | session | frames | exit | status | pred_lines | elapsed |
|---|---|---|---|---|---|---|
| 1 | session_test1 | 298 | 0 | completed_replay | 298 | 215.8s |
| 2 | session_hiep_toi4 | 620 | 0 | completed_replay | 620 | 422.4s |
| 3 | session_hiep2 | 642 | 0 | completed_replay | 642 | 423.4s |
| 4 | session_hiep_sang9 | 727 | 0 | completed_replay | 727 | 439.1s |
| 5 | session_hiep_sang7 | 817 | 0 | completed_replay | 817 | 466.7s |
| 6 | session_hiep_toi5 | 806 | 0 | completed_replay | 806 | 512.9s |
| 7 | session_hiep3 | 826 | 0 | completed_replay | 826 | 477.4s |
| 8 | session_hiep_toi6 | 865 | 0 | completed_replay | 865 | 528.5s |
| 9 | session_hiep_sang8 | 929 | 0 | completed_replay | 929 | 533.5s |
| 10 | session_hiep1 | 1049 | 0 | completed_replay | 1049 | 578.8s |
| 11 | runtime_session_bt | 1529 | 0 | completed_replay | 1529 | 725.2s |
| 12 | session_thai8 | 1952 | 0 | completed_replay | 1952 | 921.8s |
| 13 | session_thai7 | 2872 | 0 | completed_replay | 2872 | 1281.9s |
| 14 | session_hiep_thai5 | 3977 | 0 | completed_replay | 3977 | — |
| 15 | session_hiep_thai4 | 5764 | 0 | completed_replay | 5764 | — |
| 16 | session_thai6 | 5937 | 0 | completed_replay | 5937 | ended 23:55 |
| 17 | session_hiep_thai3 | 5965 | 0 | completed_replay | 5965 | ended 00:17 |
| — | in-flight: thai1 ~4775/6050 (79%) — session cuối | | | | | |

**Checkpoint mới** — **17/18 `completed_replay`** (thai6 FINISH 23:55,
thai3 FINISH 00:17 — cả hai `session_info.json` xác-nhận). Còn 1 proc:
`thai1` ~4775/6050 (~1.4fps → **ETA ≈15–18 min**).

Throughput thực-tế ≈1.4–1.5 fps/proc — khớp ETA §pilot.

## Per-session paths + per-cam frames (explicit, theo LEAD)

`src` = `experiment_test/output/<session>` (raw_cam1/2.mp4) ·
`session_dir` = `experiment_test/output/verify_cur_session_<session>` ·
`runtime_dir` = `experiment_test/output/verify_cur_runtime_session_<session>` ·
`log` = `experiment_test/output/verify_cur_session_<session>.log`.
cam1=cam2=N frames mọi session (fps 25):

| session | cam1 | cam2 | session_dir | log |
|---|---|---|---|---|
| session_test1 | 298 | 298 | `verify_cur_session_test1` | `verify_cur_session_test1.log` |
| session_hiep_toi4 | 620 | 620 | `verify_cur_session_hiep_toi4` | `verify_cur_session_hiep_toi4.log` |
| session_hiep2 | 642 | 642 | `verify_cur_session_hiep2` | `verify_cur_session_hiep2.log` |
| session_hiep_sang9 | 727 | 727 | `verify_cur_session_hiep_sang9` | `.log` cùng-tên |
| session_hiep_sang7 | 817 | 817 | `verify_cur_session_hiep_sang7` | " |
| session_hiep_toi5 | 806 | 806 | `verify_cur_session_hiep_toi5` | " |
| session_hiep3 | 826 | 826 | `verify_cur_session_hiep3` | " |
| session_hiep_toi6 | 865 | 865 | `verify_cur_session_hiep_toi6` | " |
| session_hiep_sang8 | 929 | 929 | `verify_cur_session_hiep_sang8` | " |
| session_hiep1 | 1049 | 1049 | `verify_cur_session_hiep1` | " |
| runtime_session_bt | 1529 | 1529 | `verify_cur_runtime_session_bt` * | `verify_cur_runtime_session_bt.log` |
| session_thai8 | 1952 | 1952 | `verify_cur_session_thai8` | " |
| session_thai7 | 2872 | 2872 | `verify_cur_session_thai7` | " |
| session_hiep_thai5 | 3977 | 3977 | `verify_cur_session_hiep_thai5` | " |
| session_hiep_thai4 | 5764 | 5764 | `verify_cur_session_hiep_thai4` | " |
| session_thai6 | 5937 | 5937 | `verify_cur_session_thai6` | " |
| session_hiep_thai3 | 5965 | 5965 | `verify_cur_session_hiep_thai3` | " |
| session_hiep_thai1 | 6050 | 6050 | `verify_cur_session_hiep_thai1` | " |

*runtime_session_bt: dir thực-tế trên disk = `verify_cur_runtime_session_bt/`
(prefix `verify_cur_` + source-dir `runtime_session_bt`; đã verify:
1529 pred lines + `session_info.json` `completed_replay` ended 22:41).
`verify_cur_runtime_runtime_session_bt/` = runtime side-state, không phải
output. Chi-tiết máy-đọc (command/exit/elapsed): `v1-replay-results.json`.

## GT status (verify riêng, session_thai8)

- `ground_truth_identity.csv`: **header-only** (1 dòng) — không usable.
- `ground_truth_events.csv`: **24 data-rows** nhưng TẤT-CẢ `notes=auto-prefill:
  verify` → DRAFT tự-động, CHƯA human-verified: 8 rows thiếu
  `physical_vehicle_id`; anomaly E002 handoff end_frame=135 < start=1856;
  E011 handoff cam1→cam1 (same-cam). Có-thể dùng làm gợi-ý, KHÔNG phải GT vàng.
- `ground_truth_slots.csv`: header-only.
- → ID-switch/lost/event-accuracy metrics vẫn **BLOCKED** cho cohort;
  thai8 events chỉ có giá-trị tham-khảo sau khi verify thủ-công.
