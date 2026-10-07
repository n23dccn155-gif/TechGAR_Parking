# Note: slot-binder (Step A)

Trang: `slot-binder.js` — gán xe (GID) vào ô đỗ, giữ và trả danh-tính qua vòng đỗ-xe.

## Nguồn

- `backend/main_detect/src/techgar/slot_vehicle_binder.py` (3919 dòng, đang modified — bản đĩa)
- Runtime wiring: `two_camera.py:2334-2367` (policy `vision_primary`, recovery_evidence_frames=3, predeparture_guard = empty_s + max_age + 1/parking_fps = 1.0+1.0+0.5 = **2.5 s**).

## Policy vision_primary

Hai kênh bằng chứng song-song: `update_vision` (detector: ô có bị che) + `update_tracks` (tracker: xe nào ở đâu). `vision_occupied` là bằng-chứng sơ-cấp cho trạng-thái ô; tracking quyết-định identity. Evidence provenance tách khỏi application clock (`evidence_frame_idx`/`evidence_timestamp_s` vs frame áp-dụng) — vision trễ không ghi-đè motion mới (2462-2499). Evidence `ready=false` bị skip (2463).

## Bind (update_tracks 2047-2296)

- Track có overlap slot → `stop_candidate`. Điều-kiện: `vision_occupied` phải true & hết cooldown; ô đang có chủ + vision occupied → `sticky_id_conflict` reject (2204-2229).
- `_is_stopped` (1316-1355): chỉ suffix **fresh liên-tục** tính; ≥ `min_stop_samples=8` mẫu; span ≥ 0.9·stop_seconds(1.0s); ≥80% mẫu cùng slot; r95 ≤ max(3px, 0.06·bbox_diag); net-drift ≤ max(5px, 0.10·diag). Commit khi stopped & candidate_age ≥ 1.0+0.15s (2283).
- Fast path: overlap ≥ `strong_vehicle_overlap=0.60` → strong-overlap dwell → bind sớm (2248-2282).
- `_bind_vehicle`: mở parking_episode `slot:GID:F<frame>`, gỡ claims/token cùng slot (1919-1980).

## Arrival claim (track mất-dấu lúc vào ô)

`_record_arrival_claim` → track lost → `_try_commit_arrival_claim` (1167-1283):
yêu-cầu `vision_occupied_streak ≥ 2`, `lost ≥ 0.35 s`, `obs ≥ 3`, `max_overlap ≥ 0.35`, winner margin 0.15, `demonstrated_entry` (vào từ ngoài / overlap +0.10 / tiến về tâm ≥ 5% diag), veto `newer_motion_disproves_arrival`.
`arrival_lookback` runtime = max(3.0, 1.0 + 2/2.0 + 0.5) = **3.0 s** (1719-1728).

## DepartureToken (135-156, 1449-1531)

Vision chuyển empty (hoặc motion bắt-đầu trong ô đỗ = predeparture) → token giữ GID chủ ô 5 s (`recovery_retention_seconds` runtime default).
`confirmed_empty` cần ≥2 empty observations liên-tiếp. Radius gate mở-dần:
`r(t) = slot_diagonal × (0.05 + progress·0.80)`, progress = min(1, age/1.0 s) — runtime `max_expand_ratio=0.85` (class 0.45). Retention extend khi blocker còn (live15 comment).

## Recovery gating (batch_recover_ids 2763-3569)

Candidate (unbound local track) trong radius → **protected** (không được cấp GID mới) nhưng chưa consume. Consume cần:
- `recovery_evidence_frames ≥ 3` obs — "3 obs chặn fragment bóng 2-frame chiếm GID đỗ" (two_camera.py:2342-2344).
- Gate origin: first_position trong max-radius; `originated_in_slot` (overlap ≥0.10 hoặc signed ≥ −0.20·diag).
- Size: legacy band hoặc trajectory-qualified 0.15–6.0 (phối-cảnh khiến xe lớn dần khi ra ô).
- Appearance: median distance ≤ 0.62 runtime (relaxed 0.70 nếu overlap ≥ 0.25); cross-cam dùng target-camera gallery.
- Outward proof 1-trong-3: `world_outward` (trajectory qualified + direction_cos ≥0.25 cross-cam), `escape_outward` (trong-ô → ra ≥max(1.5px, 0.05·diag), radial gain ≥0.75px từ min), `legacy` dot-product ≥1.5px + moved ≥3px.
- Token phải `confirmed_empty` trước consume.
- LAPJV `extend_cost, cost_limit=0.999`; cost = 0.45·spatial + 0.35·(app/limit) + 0.15·size + 0.05·direction; margin 0.15 → ambiguous → không consume.

## Release

Parked member ra khỏi ô → `exit_pending` ≥ `exit_seconds=0.5 s` → release. False-empty flicker → `_restore_false_empty_token` khôi-phục chủ.

## Evidence thật (hiep3)

- f155-162 cam1: gid1 dừng D01 (overlap 0.733) → `vehicle_stopped_in_slot` + `slot_arrival_claim_confirmed` (obs=19, vision_confirms=6) + `parking_episode_opened` D01:G1:F162 — claim commit khi track đã lost.
- f239: `predeparture_token_opened` D01 (motion_started_in_parked_slot, lid5) → retention_extended ×2 → f272 `departure_token_cancelled` (predeparture_guard_expired) — token chết không consume.
- f421-440: predeparture lại (lid12 cam2!) → `departure_token_confirmed` empty_obs 2→3 (f435,438) → f440 **`parked_id_recovered`**: lid8 nhận lại gid1 — evidence_frames=14, appearance=0.1129 ≤0.62, size 1.3183, outward 48.8 px.
- lid9 fragment [907,216,50,33] ngay miệng ô D01: new_tentative→frozen_ambiguous→coasting f425+, **không bao giờ có gid** — token protection chặn shadow fragment (CONFIRMED).

## Giới-hạn ⑥ (brief bắt-buộc)

- **Xe đỗ-sẵn không được track** — motion tracker không sinh track cho xe đứng yên từ trước → ô báo `occupied` (vision) nhưng không `vehicle_id`/episode. Giới-hạn có chủ-đích (expected), không bug.
- Token expiry 5 s: xe rời chậm/khuất lâu hơn token → GID mất, phải re-acquire qua dormant/trajectory (nối trang 11-12).
- Arrival cần vision streak ≥2 → ô mà vision chậm xác-nhận thì claim chờ; vision flicker occupied→empty tạo token giả (guard 2.5 s + restore).
