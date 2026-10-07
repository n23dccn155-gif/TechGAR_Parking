# notes/trajectory-reid — bảng nguồn đã xác minh (builder-b, Task 8 Step A)

Đọc ngày 2026-10-06 từ bản trên đĩa.
- `src/techgar/trajectory_memory.py` sha256:ecb7e52dc110d9ea mtime 2026-09-27T23:04:55 (**đang modified** — baseline pre-existing, không phải F2)
- `src/techgar/cross_camera_manager.py` sha256:da9a99e6fe8a061e mtime 2026-10-06 (**modified**, F2)
- `two_camera.py` mtime 2026-10-06 (**modified**, F2)

## Giá trị → file:dòng → kind

| Giá trị | file:dòng | kind | ghi chú |
|---|---|---|---|
| WorldTrajectoryMemory ctor: history_seconds=2.0, min_observations=3, match_threshold=0.78, ambiguity_margin=0.12, max_samples=240 | trajectory_memory.py:56-68 | class-default | runtime khởi tạo tại ccm:448-453 (history từ CLI --trajectory-history-seconds 2.0, tc:1974; threshold/margin hardcode ctor) |
| TrajectorySample = {frame_idx, timestamp_s, camera_id, local_track_id, world, bbox_size} | trajectory_memory.py:15-21 | class-default | |
| Hai kho tách biệt: `_global` (per gid) và `_provisional` (per fragment cam+lid); provisional chỉ promote sau khi bên khác chứng minh GID | trajectory_memory.py:49-53, 99-136 | class-default | docstring: "trajectory proximity alone can never consume an identity" |
| `_provisional_origins`: mẫu đầu epoch, ngoài cửa sổ rolling 2s | trajectory_memory.py:71-75, 99-102, 545-552 | class-default | origin-membership cần điểm bắt đầu thật |
| `_append`: trùng (frame,cam,lid) → replace; prune theo timestamp−history_seconds; cap 240 | trajectory_memory.py:79-97 | class-default | |
| `remove_missing_provisionals`: fragment mất khỏi live vẫn giữ nếu mẫu mới nhất còn trong window — chịu gap ngắn của detector | trajectory_memory.py:178-216 | class-default | comment 183-196 |
| `_camera_tail`: đuôi liền-kề cùng cam+lid | trajectory_memory.py:218-238 | class-default | |
| `_estimate`: velocity = median per-axis của tối đa 5 step gần nhất trên tail[-6:]; curvature = median arccos giữa các hướng liên tiếp (cần ≥3 hướng, tail≥6) | trajectory_memory.py:240-292 | class-default | |
| `match()`: source=_estimate(global filtered theo source_camera, require_local_id=False); candidate=_estimate(provisional) | trajectory_memory.py:319-331 | runtime | |
| gap: chồng-thời-gian → origin tại mẫu gần source.last nhất, gap=0; else gap = candidate.first − source.last | trajectory_memory.py:334-352 | class-default | |
| predicted = position + velocity·gap; corridor = khoảng cách điểm-đoạn (candidate_origin → [source.position, predicted]) | trajectory_memory.py:353-359 + _point_segment_distance 294-304 | class-default | |
| distance_score = clip(1 − corridor/radius); time_score = clip(1 − gap/recent_window) | trajectory_memory.py:360-363 | class-default | |
| direction: nếu cả hai speed ≥1e-3 → cos → score=(cos+1)/2; nhân clip(1−curvature/π, 0.5, 1) | trajectory_memory.py:365-376 | class-default | |
| speed: score = clip(1 − |ln(ratio)| / ln 4) | trajectory_memory.py:378-384 | class-default | |
| Hard rejects: corridor>radius → teleport; topology≤0 → camera_topology; stable & cos < min_direction_cosine → stable_wrong_direction | trajectory_memory.py:386-393 | class-default | stable = observations ≥ min_observations(3) |
| **Trọng số score = 0.35·corridor + 0.25·appearance + 0.15·direction + 0.10·speed + 0.10·min(time,topology) + 0.05·size** | trajectory_memory.py:395-402 | class-default | components ghi ở 412-421 |
| `match_departure`: origin = parked_origin (hoặc mẫu cuối global); first_distance>radius → teleport; stable & radial_gain≤0 → stable_not_leaving_slot; cos(movement,outward)<0 → stable_wrong_direction; speed_score = speed / max(0.01, radius/window·0.002) | trajectory_memory.py:424-537 | class-default | comment 491-495: không phạt xe cà từ từ rời ô |
| Call site `_match_world_trajectory_identities`: candidate cần allocatable + fresh detection + ≥2 appearance mẫu + ≥3 provisional mẫu | ccm:6799-6812 | runtime | |
| Identity bị loại: state exited/expired, provisional hold, occluded | ccm:6818-6825 | runtime | |
| Chuỗi gate theo thứ tự: source_trajectory_short → camera_topology → parked_reservation_origin_miss → same_camera_live_owner → target_camera_gallery_missing → target_camera_appearance (min(0.45, dormant_app)) → target_camera_size (>0.90) → trajectory_missing → candidate_trajectory_short → trajectory_<hard_reject> → trajectory_score (<0.78) | ccm:6864-7129 | runtime | |
| plausible_recent_fragment defer: same cam + app≤0.30 + size≤0.65 + corridor≤0.60·dormant_dist + time_topology≥0.75 → defer + event world_trajectory_reid_deferred | ccm:7062-7113 | runtime | "minting a new GID in this state is irreversible" |
| LAPJV cost = 1 − score, cost_limit 0.22 (≈ score ≥ 0.78); ambiguity margin 0.12 → world_trajectory_reid_ambiguous + defer các cột tranh chấp | ccm:7130-7197 | runtime | |
| prediction_radius = dormant_match_distance = 16.218 (resolved) | ccm:6968/7013; two_camera.py:2182 | derived | |
| recent_window_s = _reid_window(cam, uses_seconds=True) = handoff_ttl (45f) / effective_camera_fps | ccm:5274-5288 + 6969/7014 | runtime | fps = median của 30 delta gần nhất, clip [1,60], fallback 25.0 (ccm:5266-5272) |
| Events: world_trajectory_reid_matched / _deferred / _ambiguous / world_trajectory_turnaround_matched | ccm:7094, 7183-7227 | runtime | |

## Số thật (events trong verify_cur_*)

- `session_hiep3` f467 `world_trajectory_reid_matched` gid2 cam1→cam2 lid13: score **0.842**, world_distance 0.62, app_dist 0.135, support 2; kèm `world_trajectory_turnaround_matched`.
- `verify_cur_session_hiep_sang8` f600 `global_id_created` gid3 lid40, rejections: gid1 score **0.6683** (corridor 0.9445, app 0.8331, direction 0.00146, speed 0.9708, time_topology 0.0, size 0.6437, wd 0.8997); gid2 score 0.3918 reason stable_not_leaving_slot wd 15.42.
- f599 `new_global_id_deferred_insufficient_fragment_evidence` lid40: obs 5, displacement 12.369 < required 13.895.
- f600 `dormant_reid_rejected` gid1 reason stale_without_target_camera_gallery elapsed 50.953s; gid2 parked_reservation_origin_miss.

## Giới hạn ⑥

- Xe đỗ yên → gap lớn, velocity EMA≈0 → direction cosine nhiễu/≈0 và time_topology sụp → score thấp dù đúng xe (E-C-002 CONFIRMED tại sang8 f600).
- min_observations=3 → fragment quá non trẻ bị reject candidate_trajectory_short; source trail <3 mẫu → source_trajectory_short.
- rolling window 2s: trail quá cũ bị prune → corridor kéo về 0 nếu gap lớn? (thực tế corridor đo origin so với predicted; gap lớn → predicted chạy xa → score rớt).
- LAPJV cost_limit 0.22 ⇔ threshold 0.78 — hai cơ chế khóa nhau.
- GT-side: tất cả nhận định identity-reid ngoài E-C-002 đều UNSURE.

## Ảnh ⑤
- `trajectory-reid-matched-hiep3-f467.jpg` — cam2 lid13 → gid2 score 0.842 (đã vẽ).
- `trajectory-reid-fail-sang8-f600.jpg` — lid40 gid3 box đỏ chồng vị trí cuối lid35/gid1 xanh (đã vẽ).
