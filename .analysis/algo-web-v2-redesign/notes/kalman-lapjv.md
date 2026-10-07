# Note — kalman-lapjv (phân hệ single-cam)

Nguồn chính: `motion_tracker.py` — `_new_kalman` L440-448, `_predict_tracks` L247+, `_association_gate` L1193-1230, `_assign` L1597-~1990, `_assignment_has_margin` L1166-1191.

## Kalman (L440-448)

- cv2.KalmanFilter(4,2) constant-velocity: state [x,y,vx,vy]; transition block diag(1,1)+I cho v; measurement lấy [x,y].
- processNoiseCov = diag([2,2,12,12]) — tin velocity nhiễu hơn position nhiều; measurementNoiseCov = 8·I; errorCovPost = 100·I; statePost velocity khởi tạo 0.
- `prediction_source` ∈ {kalman_prediction, stale_prediction, ...}; `max_prediction_age_seconds=0.40` (L77), `prediction_velocity_decay_seconds=0.25`, `prediction_max_distance_scale=1.25` (L79).

## Gate trước cost (per track×detection pair, L1615-1767)

- costs matrix init 10.0 (invalid). `lapjv(costs, extend_cost=True, cost_limit=0.90)` L1908 (assignment_cost_limit clip [0.05,1.0] L158).
- suppressed_roi_edge_twin: row bị skip (L1619-1623).
- lost_seconds > reacquire_window → event `association_rejected_stale_track`; window = `reacquire_max_seconds=1.50` hoặc `merged_reacquire_max_seconds=3.0` nếu `_has_recent_merged_freeze` (L1636-1651).
- prediction_age > limit → `stale_anchor_reacquire`: predicted_point = last_measured_center (không extrapolate nữa), events `track_frozen_stationary` + `stale_prediction_replaced_by_measurement_anchor` (L1654-1684); gate riêng = min(max_distance, max(3.0, 0.30·hypot(w,h))) (L1701).
- max_distance tính lại: `max_distance=180 · min(1.25, 1 + min(invisible,15)/60)` (L1691-1694).
- `_association_gate` (L1193-1230): budget = `speed·(invisible+1)·velocity_gate_scale(2.0) + velocity_gate_size_ratio(1.0)·extent`; floor = max(24, 1.0·extent); ceiling=min với trên; uninformed track (<3 visible obs) → ceiling; prediction-age vượt limit → 0.0.
- distance > gate → skip (+event stale_prediction khi ở nhánh anchor).
- appearance_distance = min(histogram_distance(track.appearance, det.hist), compare_tracklets(...).distance); det không hist → 0.5 (hoặc skip nếu invisible); spatial zone blend 0.7·app + 0.3·zone khi enable_spatial_appearance (L1728-1731); invisible cần app ≤ lost_appearance_threshold=0.30 (stale anchor ≤ min(0.30,0.22)) (L1732-1737).
- area_ratio = det_bbox/track_clean_area ∈ [min_reacquire_area_ratio=0.35, max_reacquire_area_ratio=2.80] (L1749-1755).
- cost = `0.45·(dist/max_dist) + 0.25·(1−IoU) + 0.20·app + 0.10·size_err`; size_err = min(1, |ln area_ratio| / |ln 2.80|) (L1756-1766). `_pair_metrics` ghi 4 thành phần + source (L1769-1781).

## Trước/sau lapjv

- `_mark_competing_assignments` L1785 — giải competition trước vì LAPJV 1-1 không phân biệt 2 lineage khả thi ngang nhau.
- Merged-contour freeze L1793-1906: detection bao ≥1 predicted track hợp lệ (inside box±12, dist≤1.25·max_dist, app≤max(0.55,0.30)) VÀ bbox ≥ `merged_detection_area_ratio=1.60`·median ref area → `ambiguous_merged=True`, costs[:,col]=10 → không ai nhận → cả 2 track coast. Single compatible cần w hoặc h ≥1.30× ref; `_elongation_explained_by_motion` miễn → event `oversized_detection_kept_as_motion_trail` vs `merged_detection_frozen`/`oversized_detection_frozen`.
- Post-lapjv margin (L1914-1985): track invisible>0 hoặc recent-merged-freeze (`split_margin_track_ids`) → cần `min(alternatives) − selected ≥ split_assignment_margin(0.08)·(2−lineage_score)`; thiếu → `split_assignment_deferred` + association_state `split_recovering`, detection vào ambiguous set — "giữ cả 2 lineage coasting thay vì nhận tie của LAPJV".
- recently_ambiguous (trong `ambiguous_recovery_frames=3`): cần clean streak ≥3 frame hoặc clear_evidence (margin + total≤0.12, app≤0.08, size≤0.20, pos≤0.20) else `association_recovery_pending` (L1939-1985).
- unmatched_detections → echo filter → `_create_or_reid` (L2335-2340).
- velocity fallback: `_track_velocity_px_per_frame` dùng Kalman statePost[2:4], nếu thiếu thì trail avg 4 bước (L1232-1244).

## Figure

- kalman-coast.jpg — thai1 cam1 f1407: lid18 (v=−14 px/f) + lid19/20 đều `occluded_prediction`/`frozen_ambiguous`, boxes từ predictions.jsonl — Kalman giữ track sống khi measurement ambiguous.
