# Note — track-lifecycle (phân hệ single-cam)

Nguồn: `vehicle_tracker.py` L20-23 (TrackStatus), `motion_tracker.py` `_create_or_reid` L2009-2069, `_is_confirmable` L2071-2094, `_apply_detection` L2096-2173, unmatched loop L2257-2309, expire L2310-2317, `suspend_track` L2175-2187, public filter L2369, `process_frame` L2204+.

## States

- Enum: `TENTATIVE / CONFIRMED / LOST` (vehicle_tracker.py L20-23). Output public = CONFIRMED ∪ LOST only (L2369) — TENTATIVE không bao giờ lọt ra ngoài.
- `association_state` (string riêng, chi tiết hơn status): new_tentative / matched / coasting / frozen_ambiguous / suppressed_roi_edge_twin / split_recovering / suspended_<reason>.
- `observation_kind`: detection / prediction / occluded_prediction / merged / watershed_provisional.

## Birth — `_create_or_reid` L2009-2069

- Local ID luôn tăng đơn điệu — comment L2012-2016: appearance-reuse ID cũ từng làm fragment evidence reset mỗi frame; identity toàn cục là việc của CrossCameraManager (reid_ttl=720f).
- TENTATIVE trừ khi `min_visible_count==1`.
- Mỗi track mới: Kalman, AppearanceTracklet(max_samples=12, interval=3), `first_observation_point/bbox/frame` — origin đóng băng riêng khỏi history (comment L2038-2040: history bounded, không được đụng origin cho confirm & departure checks).
- measurement_observations ring 8 phần tử (timestamp, point, box).

## Confirm — `_is_confirmable` L2071-2094

- `total_visible_count ≥ min_visible_count` (3; priority 2 và cần ≥2 priority obs).
- Displacement từ `first_observation_point` (multiscale) hoặc `history[0]` ≥ `min_confirm_displacement` (12.0; priority 3.0).
- Status recompute mỗi `_apply_detection` (L2170) — matched nhưng chưa đủ điều kiện vẫn TENTATIVE.

## Matched — `_apply_detection` L2096-2173

- Merged/ambiguous detection → freeze: không kalman.correct, không update appearance/bbox — observation_kind `occluded_prediction`, event `track_frozen_merged_detection` (L2102-2115). Comment: duplicate ID tạm thời ít nguy hiểm hơn ID collision.
- Bình thường: kalman.correct, counters+, consecutive_invisible=0, appearance EMA `0.75·old + 0.25·new` chỉ khi appearance_trusted & hist (L2151-2156), tracklet.update, `_remember_clean`, measurement_observations ring.

## Unmatched — L2257-2309

- age+1, consecutive_invisible+1, prediction_age_s cập nhật; age > limit → `stale_prediction` + velocity_confidence 0; còn hạn → `kalman_prediction`.
- association_state: `frozen_ambiguous` (occlusion guard frozen hoặc viable-pair với ambiguous detection) / `suppressed_roi_edge_twin` / `coasting`; observation_kind tương ứng occluded_prediction/prediction.
- `roi_edge_starved`: unmatched + có rejected point trong max_distance quanh dự đoán → cờ sticky báo GID manager nới prior same-camera (L2282-2301); cleared khi match lại.
- CONFIRMED → LOST, append `_newly_lost_tracks` (L2302-2304).
- Expire khi `consecutive_invisible > lost_track_ttl` (90f) HOẶC `lost_track_ttl_seconds` — default = 1.5 × merged_reacquire 3.0 = 4.5 s (comment L143-152: 90f ~13 s ở 7FPS, dài hơn nhiều re-associable window 1.5-3 s).

## Expire / suspend

- Expire: `_exited_tracks[tid]` chỉ khi KHÔNG TENTATIVE — blob nhiễu chưa từng confirm biến mất âm thầm, không ra output (comment L2313).
- `suspend_track(tid, reason)` L2175-2187: bỏ track đã bind vào ô đỗ khỏi association → `_suspended_tracks`, event `parked_local_track_suspended`.

## Figure

- lifecycle-confirmed.jpg — thai1 cam1 f1500: lid18 CONFIRMED matched [643,144,105,62], born f1404 — cùng track đã coast `frozen_ambiguous` ở f1407 (figure trang kalman-lapjv). Một track: tentative → frozen_ambiguous → matched/confirmed trong 96f.
