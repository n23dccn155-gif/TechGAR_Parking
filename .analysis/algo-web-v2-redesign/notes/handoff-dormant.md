# notes/handoff-dormant — bảng nguồn đã xác minh (builder-b, Task 8 Step A)

Đọc ngày 2026-10-06 từ bản trên đĩa.
- `src/techgar/cross_camera_manager.py` sha256:da9a99e6fe8a061e mtime 2026-10-06 (**modified**, F2 — các block stationary bọc `enable_stationary_reacquire`)
- `two_camera.py` (CLI wiring) — đọc các dòng 1951, 1974, 2182 ở notes trước.

## Giá trị → file:dòng → kind

| Giá trị | file:dòng | kind |
|---|---|---|
| HandoffEntry fields: gid, source_cam, source_lid, target_cam, exit_edge, last_world, velocity_world, bbox_size, appearance(+samples), target_appearance_samples, target_bbox_size, created/updated frame+time | ccm:40-61 | class-default |
| GlobalIdentityState: state, last_camera/lid/world, velocity (per-frame + per-second), camera_appearance_samples per-cam, dormant_since_*, retention_anchor_*, vanished_near_roi_edge | ccm:64-94 | class-default |
| handoff_ttl = 45 frame (ctor default); handoff_ttl_seconds optional (time-based TTL) | ccm:147-149, 226-232 | class-default |
| lookahead_frames = 16; edge_margin = 40; prediction_radius = 90; match_distance = 100 | ccm:146,155,156,150 | class-default |
| identity_retention_frames = 180 / seconds = 60; moving same-cam limit = 12.0 s; established ×4 | ccm:158-159,182,5560-5566 | class-default |
| reid_reachable_speed_scale = 1.5; reid_reachable_margin từ config | ccm:186-187 | class-default |
| dormant_match_distance resolved = 16.218 | two_camera.py:2182 | derived |
| dormant_appearance_threshold CLI default 0.60 | (notes tracklet) | runtime |
| `_outward_edge`: cạnh sớm nhất reachable trong lookahead; mask: tia cắt cạnh polygon, speed_towards>0.1, t>-5; non-mask: vx>1.0 | ccm:2545-2616 | class-default |
| `_upsert_handoff`: mở/refresh entry; huỷ nếu đã có member confirmed ở cam đích; event handoff_opened | ccm:2642-2812 | runtime |
| `_predicted_world`: last_world + velocity·elapsed (time-based ưu tiên, fallback per-frame ×25fps) | ccm:2814-2844 | class-default |
| `_candidate_cost` gates theo thứ tự: provisional hold → occluded → edge (OPPOSITE_EDGE/mask handoff_edge) → entry corridor depth → residual ≤ prediction_radius (overlap: min(predicted,last) + pointPolygonTest ≥ −radius) → appearance (target gallery: min(0.45, app_thresh); soft overlap ≤min(0.60, relaxed=0.82) bind_eligible=False; adaptive non-overlap: residual ≤ max(1.25·strong_spatial, 0.5·match_distance) → relaxed) → size ≤0.90 → direction ≥0.25 (None → 0.20) → cost ≤0.92 | ccm:2901-3088 | runtime |
| cost = 0.55·residual/radius + 0.30·app + 0.10·size + 0.05·dir_cost | ccm:3087 | class-default |
| `_match_pending_handoffs`: TTL check; huỷ khi parked reservation hoặc confirmed member ở cam đích; LAPJV cost_limit 0.92; margin 0.08; evidence frames: overlap 2-3, temporal 2, else 1 → `handoff_candidate_deferred`; bound merge `_bound_handoff_merge_allowed`+`_merge_global_ids`; event `handoff_matched`/`handoff_matched_target_gallery` | ccm:3512-3840 | runtime |
| `notify_track_expired`: gỡ local mapping, merge gallery vào identity (+per-cam), exit zone → exited; else state = handoff (nếu có entry) hoặc dormant; `local_track_expired` | ccm:8552-8633 | runtime |
| `_identity_retention_elapsed`: elapsed = min(elapsed, t−retention_anchor, t−dormant_since) — thời gian đỗ dưới reservation không tính là mất tín hiệu | ccm:5469-5529 | class-default |
| `_identity_is_recent`: parked reservation → luôn recent; limit retention (×4 established); same-camera stale check riêng | ccm:5531-5574 | class-default |
| `_same_camera_recovery_is_stale`: same-cam revival quá `identity_retention_moving_seconds` (12s, ×2 nếu vanished_near_roi_edge) → stale; parked reservation exempt | ccm:5576-5608 | class-default |
| `_reachable_distance_limit`: margin + 1.5·speed·elapsed | ccm:5610-5628 | class-default |
| `_dormant_candidate_distance_limit`: same-cam = min(hard_cap 2-3×dmd, max(dmd, reachable với elapsed cap 2-5s)); cross-cam long-gap = dmd (×1.6 nếu target-gallery + established); cross-cam short = min(cap, max(dmd·1.6 nếu có target gallery, dmd + speed·min(elapsed,2-5)·0.25)) | ccm:5630-5706 | class-default |
| `_match_dormant_identities`: candidates = track chưa gán; identities = dormant/handoff/parked/recovery_pending trừ occluded/provisional; stationary holds lọc trước (F2); gates: adjacent → parked_reservation_origin_miss → recent (same_camera_stale/retention_expired) → distance limit (position) → stale_without_target_camera_gallery → appearance (same-cam min(0.30,dormant_app); cross+target-hist min(0.30 nếu long-gap else 0.45); source-only sau short window → stale_source_camera_appearance; same-cam near-miss app≤0.45 & elapsed≤window → defer dormant_near_miss) → ambiguity live → defer → size ≤0.92 (defer unstable_reid_size) → fragment ≥3 obs (defer fragment_immature) → cross-cam: direction claims + trajectory.match → trajectory_* rejects → cost công thức 3 nhánh | ccm:5828-6444 | runtime |
| cost same-cam reentry-proof = 0.75·app/0.25 + 0.25·size/0.65; same-cam thường = 0.55·d/limit + 0.35·app/thresh + 0.10·size; cross turnaround = 0.55·d + 0.35·app + 0.10·size; cross trajectory_ready = 1−score; fallback = 0.60·d + 0.25·app + 0.10·size + 0.05·dir | ccm:6283-6442 | class-default |
| LAPJV dormant: cost_limit 0.95; margin = trajectory.ambiguity_margin 0.12 → `dormant_reid_ambiguous` + đăng ký ambiguity (frame+3, competing ids) | ccm:6466-6524 | runtime |
| Pre-bind divergence guard: member confirmed+fresh ở cam khác xa hơn cross_camera_duplicate_distance → defer `dormant_reid_deferred_live_divergence` | ccm:6528-6614 | runtime |
| F2 drift veto: frag_span ≤ tail_span 4.0 & member cross-cam drift > 2.0 trong ±10f → defer `stationary_reacquire_rejected` live_member_moving | ccm:6615-6691 | runtime (flag-on) |
| Accept → `_bind` + `dormant_global_id_recovered` (+ turnaround/reentry events) + chuyển pending handoff sang fragment mới | ccm:6692-6760 | runtime |
| `_dormant_reid_ready`: fragment ≥3 frame sống (first_observation_frame/total_visible_count/history ≥3) + confirmed | ccm:2490-2515 | class-default |
| new_identity_min_observations=5, min_displacement_ratio 0.15 | ccm:163-165 | class-default |

## E-C-002 — đọc lại từ predictions.jsonl (verify_cur_session_hiep_sang8)

- f173 `global_id_created` gid1 lid35 cam2.
- lid35 obs cuối f295 bbox [367,61,61,57] → bottom-center (397.5,118).
- f296 `local_track_expired` lid35; f312 `handoff_expired` (cam2→cam1).
- f595: lid40 obs đầu [368,63,41,56] → anchor (388.5,119); `dormant_reid_rejected` gid1 **same_camera_stale** elapsed 50.078s; gid2 **appearance** 0.401>0.30 (support 1).
- f598 defer `too_few_observations` 4<5; f599 defer `insufficient_displacement` 12.369<13.895.
- f600 `global_id_created` gid3 lid40; `world_trajectory_rejections` gid1 score 0.6683 (corridor 0.9445, app 0.8331, dir 0.00146, speed 0.9708, tt 0.0, size 0.6437, wd 0.8997); gid2 ~0.39 stable_not_leaving_slot. Cùng frame: dormant pass còn reject gid1→cam1/lid28 `stale_without_target_camera_gallery` elapsed 50.953; gid2 `parked_reservation_origin_miss`.
- f600 `handoff_opened` gid3 cam2→cam1 edge overlap.
- f779 `local_track_expired` lid40.

⇒ Ba cửa độc lập cùng chặn cứu gid1: dormant `same_camera_stale` (50s > moving limit 12s), trajectory 0.6683<0.78 (dir≈0.0015, tt=0), dormant appearance của gid2 0.401>0.30. CONFIRMED chỉ cho "cùng xe vật lý nhận GID mới"; hệ quả slot/session UNSURE (ERRORS-SUMMARY: slot occupancy không đổi).

## Các ca khác (nhãn verify-replay)

- E-C-005 REJECTED-as-claimed: 1/3 disproven bằng ảnh thai7 f761 (gid3 xe vẫn đỗ, gid5 xe khác ~97cm), 2/3 UNSURE — cờ scanner so pixel, không phải defect engine.
- E-A-020 UNSURE: hiep2 f115-153 gid handoff partial (lid9/14/18→gid1, lid15/20→gid2 recovered; lid11/12/13/19 gid NULL).
- U2 UNSURE: sang7 ~f330 nghi GID đặt nhầm xe qua cam.

## Ảnh ⑤
- `handoff-dormant-gap-sang8-f450.jpg` — cam2 f450: xe gid1 vẫn đỗ, không track; anchor cuối (397,118).
- `handoff-dormant-recovered-hiep3-f465.jpg` — cam1 lid10 → gid2, dormant 39.8s, app 0.167 vs target-camera gallery.
