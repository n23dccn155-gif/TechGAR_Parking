# Builder B — Runtime handoff, Global ID & Slot Occupancy

**Phạm vi**: hành trình 1 xe `cam1 → mất dấu / qua vùng chuyển → cam2 giữ cùng identity → dừng → occupancy xác nhận`. Nguồn: `backend/main_detect/` (two_camera.py, techgar/*.py). Đọc source trực tiếp, không suy đoán API.

---

## 1. Bản đồ runtime — thứ tự gọi thật mỗi vòng lặp

`two_camera.run()` (`two_camera.py`) đọc **một cặp frame cam1+cam2** rồi chạy một lượt. Đây **không phải pipeline tuyến tính** — có 2 làn song song và vòng feedback hai chiều giữa binder↔manager:

```
[Lane SONG SONG — parking vision ~2fps, worker thread]
  parking_executor.submit(process_parking_frame)   two_camera:2632
       └─ ParkingDetector.detect()                 parking_detector.py:439
  kết quả về → detector.accept_evidence (monotonic) parking_detector.py:602
             → binder.update_vision                slot_vehicle_binder.py:2431
  (replay mode: chạy inline cùng nhịp frame        two_camera:2517-2554)

[Lane tracking — mỗi frame, tuần tự]
 1. synchronize_live_frames (live only, skew≤120ms) two_camera:450
 2. binder.begin_frame()                           two_camera:2514
 3. Áp vision evidence TRƯỚC gán ID                two_camera:2517 (comment: "Apply parking evidence before identity allocation")
 4. sync_parking_identity_reservations             two_camera:2672 → manager.detach_parked_local_tracks :1044
 5. tracker.process_frame(frame, priority_regions) two_camera:2680 → motion_tracker.py:2204
    ├─ newly_lost → manager.notify_track_lost :2692 → binder.notify_track_lost :2697
    └─ expired    → binder.notify_track_expired :2705 → manager.notify_track_expired :2710
 6. manager.sync_occluded_identities + register_independent_tracks  :2719-2727
 7. manager.observe_trajectories                   :2731 (nạp trail world-map)
 8. binder.prepare_predeparture_tokens             :2759 (unbound→ứng viên rời ô)
 9. recover_departing_vehicle_ids                  :2764 → batch_recover_ids → bind_external_id
10. manager.update_all_tracks → global_ids         :2779 → cross_camera_manager.py:7075
11. cancel_observed_recovery_tokens                :2786 (cross-cam chứng minh handoff → hủy token)
12. binder.remap_vehicle_ids(canonical_global_id)  :2794 → slot_vehicle_binder.py:3736
    binder.update_tracks(global_tracks)            :2800 → :2047
    binder.finalize_arrivals                       :2806
13. sync_parking_identity_reservations (lần 2)     :2808
14. registry = manager.to_json(confirmed)          :2816 → snapshot publish :2844 (episodes + pending claims + pipeline health)
```

**Hai làn giao nhau ở đâu**: vision evidence chạy *trước* gán ID (bước 3 trước 10) — một kết quả `occupied→empty` vừa xong có thể tạo departure token trước khi fragment mới được cấp GID. Feedback ngược: binder cho `protected_local_keys`/`protected_global_ids` (bước 8-9) vào `update_all_tracks` (bước 10), và manager cho `canonical_global_id` ngược lại binder (bước 12).

---

## 2. Câu chuyện 1 xe — từng nhịp

| Nhịp | Tình huống | Source |
|---|---|---|
| ① | cam1 thấy xe → local track confirm → **GID mới** chỉ sau khi mọi đường match thất bại | `_allocate_global_id`+`_bind` ccm:7439 |
| ② | Xe chạy vào overlap / hướng ra mép → **handoff mở SỚM** (velocity≥0.20 hoặc outward edge) | `_upsert_handoff` ccm:2572-2742 |
| ③ | cam2 xuất hiện bbox (kể cả TENTATIVE) → **LAPJV chọn 1-1** theo cost 4-term + margin + evidence streak → bind GID cũ | `_match_pending_handoffs` ccm:3442, lapjv :3615 |
| ④ | Không handoff nào khớp → **ReID registry dormant** (cửa sổ retention) trước khi nghĩ tới GID mới | `_match_dormant_identities` ccm:4911 |
| ⑤ | Xe dừng → track local **chết** (motion-only không thấy xe đứng) → arrival claim lấy `lost_at_s` | `binder.notify_track_lost` svb:2298 |
| ⑥ | Vision worker: **25 biến thể vote cho TRỐNG** — `empty_votes ≥ 12` → free; không đủ phiếu trống (hoặc bị core-rescue/edge-recheck lật) → `occupied`, streak | `ParkingDetector.detect` pd:439-600, `required_votes` :533 |
| ⑦ | Claim đủ tuổi + min samples + inward trajectory + không competitor → **commit → episode `parked`, ô đổi màu** | `_try_commit_arrival_claim` svb:1167 → `_bind_vehicle` :1919 |
| ⑧ | GID đậu = **reservation**: manager detach local, hủy handoff của nó, ReID không cho cấp GID khác | `sync_parked_reservations` ccm:849 |

`ccm` = `src/techgar/cross_camera_manager.py`, `svb` = `src/techgar/slot_vehicle_binder.py`, `pd` = `src/techgar/parking_detector.py`.

---

## 3. Từng stage — LÀM GÌ / VAI TRÒ / Ở ĐÂU / TẠI SAO

**Tóm tắt 1 câu** (bàn giao cho C — chi tiết ở từng mục):

| Stage | Một câu |
|---|---|
| S1 Local tracking | Mỗi cam tự chạy MOT: Kalman predict trước → detect motion → lapjv gán; xe dừng = track chết. |
| S2 World projection | Homography đưa mọi vị trí về cùng 1 bản đồ đo khoảng cách. |
| S3 Handoff mở sớm | Xe sắp ra mép cam1 → mở "cửa chờ" chứa vị trí/vận tốc/appearance cho cam2. |
| S4 Ghép handoff | LAPJV 1-1 trên cost 4-term + margin + streak → cam2 bind lại đúng GID cũ. |
| S5 ReID dormant | Handoff lỡ → registry identity "ngủ đông" match lại trong cửa sổ retention. |
| S6 Cấp GID | Chỉ sinh ID mới sau khi mọi đường match + deferral thất bại. |
| S7 Vision occupancy | Worker song song vote pixel cho "trống"; không đủ phiếu trống → ô có xe. |
| S8 Binder | lapjv track→ô + arrival claim → quyết định GID nào sở hữu ô nào. |
| S9 Episode + token | Vòng đời chiếm ô `parked→departing→released`; token giữ GID 5s lúc rời ô. |
| S10 Reservations | Ô đậu khóa GID: detach local, hủy handoff, ReID không được chạm. |

> ⚠ Hai loại ROI khác nhau đừng nhầm: **ROI tracking** = mask vùng chuyển động chặn detection (`roi_mask_cam*.json`, S1); **ROI slot** = polygon ô đỗ + `analysis_mask`/`core_mask` cho pixel evidence (S7). Một xe nằm ngoài ROI tracking vẫn được vision đo ô bình thường.

### S1 — Local tracking per camera (`MotionVehicleTracker`)

- **LÀM GÌ**: mỗi camera tự chạy MOT theo đúng thứ tự `process_frame`: `_predict_tracks` (Kalman predict **trước**, gắn `prediction_source`) → `_detect` (MOG2 mask + temporal motion + contour) → `_assign` (lapjv detection→prediction, cost_limit=0.90) → `_apply_detection` / unmatched → `CONFIRMED→LOST→expired`. Tình huống đời: xe lướt qua → 1 track sống; xe dừng hẳn → mask không còn khác nền → track chết (đây là *tín hiệu* cho binder chứ không phải lỗi).
- **VAI TRÒ**: cung cấp `observable_tracks` (TENTATIVE+CONFIRMED có detection frame này — :2376) cho manager; `confirmed_tracks` cho JSON/display. Mất nó = không có local track nào → GID không bind được, ReID/hảng đợi không có ứng viên.
- **Ở ĐÂU**: `motion_tracker.py:2204` (`process_frame`), association `lapjv` :1908; callsite `two_camera:2680`.
- **TẠI SAO**: motion-only — giải pháp không cần model ngoài. Hệ quả được source ghi rõ: *"motion-based trackers cannot observe stationary vehicles"* (svb:2352) → occupancy KHÔNG dựa vào lane này.
- *Ghi chú*: `newly_lost` (track vừa mất frame này) và `expired` (pop khỏi registry sau TTL) là 2 kênh khác nhau — `notify_track_lost` đi trước ~90 frame (`lost_track_ttl`).

### S2 — World projection (bản đồ chung)

- **LÀM GÌ**: homography calibration chiếu anchor của bbox sang shared-map (đơn vị cm). Anchor do calibration chọn: `bottom_center` (điểm Kalman ổn định) hoặc `bbox_center` (view-invariant hơn giữa 2 cam đối diện). Không có transform → fallback offset crop.
- **VAI TRÒ**: mọi khoảng cách của handoff/ReID/recovery đều đo trên shared-map — nếu thiếu, hai camera không nói cùng đơn vị và cost matrix vô nghĩa.
- **Ở ĐÂU**: `ccm:1370 _world`, `:1379 _bbox_anchor`, `:1404 _track_world`; `shared_map_anchor` truyền từ `two_camera`.
- **TẠI SAO**: source-supported — comment :1380-1388 nêu lý do anchor; calibration load ở `two_camera.py:284 load_calibration`.

### S3 — Handoff dự đoán (mở cửa chờ)

- **LÀM GÌ**: khi 1 GID bound+confirmed chạy vào vùng overlap (đang di chuyển ≥0.20 đơn vị/frame) hoặc hướng ra mép ảnh, manager mở `HandoffEntry` chứa `last_world, velocity_world, bbox, appearance gallery (và gallery theo target_cam nếu có)`. Tình huống đời: xe tới mép cam1 → cửa chờ mở *trước khi* cam2 thấy xe.
- **VAI TRÒ**: đây là kênh identity nhanh nhất — cam2 chỉ cần 1 bbox trong corridor để bind, không chờ local confirm. Mất nó: cam2 phải trải qua dormant-ReID với cửa sổ chặt hơn, hoặc cấp GID mới → 1 xe 2 ID.
- **Ở ĐÂU**: `_upsert_handoff` ccm:2572-2742 (callsite `update_all_tracks` :7155-7165, và ngay sau khi mint GID :7462 — xe nhanh vào corridor ngay sau khi có ID).
- **TẠI SAO**: source-supported — "A handoff is opened before the source vehicle reaches an exit edge" (:132). Entry có TTL `handoff_ttl=45` frame hoặc `handoff_ttl_seconds` (:3458-3467); refresh mỗi frame source còn thấy (:2593-2646); hủy khi GID đậu (:3472) hoặc target đã confirmed (:3483).

### S4 — Ghép handoff (`_match_pending_handoffs` + `_candidate_cost`)

- **LÀM GÌ**: mỗi frame, ma trận cost `entries × candidates` (cùng target_cam): `cost = 0.55·(residual/prediction_radius) + 0.30·appearance + 0.10·size + 0.05·direction`, chấp nhận ≤0.92. Cửa cứng trước: corridor depth, `prediction_distance`, appearance limit (có nhánh *soft-overlap* chỉ để giữ ambiguity trong ma trận, `bind_eligible=False`), size ≤0.90, direction cosine ≥0.25. Sau `lapjv(cost_limit=0.92)` phải qua `_assignment_has_margin(0.08)` (chọn phải thắng rõ → không thì `handoff_assignment_ambiguous`) và **evidence streak**: 1 frame thường, 2 nếu temporal/strong-overlap, 3 nếu overlap thường (:3664-3673) — `handoff_candidate_deferred` giữ fragment ID-less an toàn.
- **VAI TRÒ**: quyết định "cùng 1 xe" hay "xe khác". Mất nó: GID nhân đôi mỗi lần qua cầu chuyển.
- **Ở ĐÂU**: `ccm:3442` (calls `lapjv` :3615, `extend_cost=True`), `_candidate_cost` :2831, `_assignment_has_margin` :3067, `_bound_handoff_merge_allowed` :3376 (target đã có GID → merge `explicit_predictive_handoff` có thể bị `_check_merge_collision_risk` chặn).
- **TẠI SAO**: source-supported — LAPJV thật (`from lap import lapjv` :18); ứng viên bound được đưa vào cố ý (:3450-3453: "target may have been confirmed one frame before the transfer had enough evidence").

### S5 — ReID dormant & world trajectory (khi handoff lỡ)

- **LÀM GÌ**: registry `_identities` giữ mỗi GID với state `active/dormant/handoff/parked/recovery_pending/exited` + last_world + velocity + appearance gallery per-camera + bbox-size samples. Track lost → `notify_track_lost`→`_set_identity_dormant` (state `handoff` nếu còn entry, else `dormant`); expired → `notify_track_expired` (vào exit-zone → `exited`). `_match_dormant_identities` lại là LAPJV `cost_limit=0.95` (:5526) với cửa: cùng-cam hoặc adjacent, retention window (`180f/60s`, moving chỉ `12s` — arg-resolved, §5), reachable distance (`speed·elapsed·scale + margin`, cộng hưởng `dormant_match_distance = 1.75×` chiều-dài-ô — đơn vị shared-map, không px), appearance/size. `_match_world_trajectory_identities` (:5748, lapjv :6115) dùng trail số `WorldTrajectoryMemory` (2s history, ≥3 obs, threshold 0.78 — `trajectory_memory.py:48`).
- **VAI TRÒ**: cứu identity khi stream rớt đúng frame biên (:7190 comment) hoặc xe bị che/dừng. Mất nó: mọi discontinuity → GID mới.
- **Ở ĐÂU**: `_match_dormant_identities` ccm:4911; `_set_identity_dormant` :633; `notify_track_expired` :7501; states cập nhật trong `_refresh_identity_states` :6995.
- **TẠI SAO**: source-supported. *Không* deep-ReID: `use_deep_reid` tham số tồn tại nhưng bị ép `False` (:391-397) — appearance = gallery HSV/LAB histogram (`tracklet_descriptor.py`, `compare_tracklets`), không embedding.

### S6 — Cấp GID mới (đường cuối, nhiều đồn chặn)

- **LÀM GÌ**: chỉ sau khi *tất cả* đường match thất bại: `_is_allocatable` (confirmed, không tentative) + `_new_global_id_ready` + 3 lớp deferral: `leaving_reserved_slot` (fragment rời ô đã đặt — chờ owner recover), `dormant_near_miss` (gần 1 dormant identity plausible — chờ evidence chín muồi), `same_frame_twin` (đè lên sibling đã bind <`cross_camera_duplicate_distance` — coi là fragment tách). Qua hết → `_allocate_global_id`+`_bind`+ event `global_id_created` + `_upsert_handoff` ngay.
- **VAI TRÒ**: điểm duy nhất sinh ID — thiết kế "chậm trừ khi chắc là xe mới".
- **Ở ĐÂU**: ccm:7244-7473 (allocate :7439).
- **TẠI SAO**: source-supported — thứ tự deferral đọc trực tiếp trong `update_all_tracks`.

### S7 — Occupancy pixel evidence (`ParkingDetector` — làn song song)

- **LÀM GÌ**: với mỗi ô đỗ (ROI **slot** polygon — khác ROI tracking): kênh L của LAB → CLAHE+gamma → adaptive threshold → median+dilate → đếm ratio pixel trong `analysis_mask`. **25 biến thể vote cho hướng TRỐNG** (5 clahe × 5 gamma): `empty_votes ≥ required_votes = 25//2 = 12` → `is_free`. **Không có counter "occupied_votes"** — `occupied` là phần bù: không đủ phiếu trống, hoặc đủ nhưng bị `core-rescue` (component đặc ở lõi — :542-547) hay `edge recheck` (Canny `edge_ratio ≥ edge_thr` — :565) lật lại. `SlotResult.evidence` mang `raw_ratio/filtered_ratio/empty_votes/required_votes/rescue/instant_occupied`.
- **VAI TRÒ**: nguồn sự thật duy nhất về "ô có xe" khi xe đứng yên — lane tracking không thấy được. Mất nó: occupancy chỉ là suy đoán.
- **Ở ĐÂU**: `parking_detector.py:439` (`detect`), accept gate `:602` (timestamp đơn điệu — stale reject); worker `two_camera.py:1591` (`process_parking_frame`) chạy `parking_executor` ~`--parking-fps 2.0`; đồng bộ khi replay (:2517).
- **TẠI SAO**: source-supported — 25-variant vote + core rescue đọc từ code; smoothing `_smoother.update` với `occupied_seconds` runtime = `--parking-occupied-seconds` (default 0.5, `two_camera:2274`).

### S8 — Binder: track→slot + arrival claim (cầu nối identity↔ô)

- **LÀM GÌ**: `update_tracks` mỗi frame: lapjv `track→slot` theo overlap-score (cost = `1−score`, +0.15 nếu là ô đang giữ — hysteresis) → ghi `VehicleObservation` (center, overlap, fresh). `fresh` = `consecutive_invisible_count==0` trong `vision_primary` — quan sát LOST/predicted **không** được thúc dwell. `update_vision` lưu evidence thô (chống stale bằng `evidence_frame_idx/timestamp_s` đơn điệu) → `vision_occupied` + `vision_occupied_streak`.
- **Hai đường commit `parked`**:
  - **Claim path** (xe dừng → track chết): `_record_arrival_claim` cộng dồn (score = `0.55·overlap + 0.20·samples + 0.15·inward + 0.10·overlap-gain`); `notify_track_lost` đóng dấu `lost_at_s`; `_try_commit_arrival_claim` chờ `lost_at + 0.35s` + `vision_occupied_streak ≥ 2` (runtime `--slot-arrival-vision-confirmations`) + `observations ≥ 3` + `max_overlap ≥ 0.35` + `demonstrated_entry` (từ ngoài vào/overlap tăng/tiến vào tâm) + không competitor + defense `newer_motion_disproves_arrival`.
  - **Strong-overlap path** (track còn sống): `overlap ≥ 0.60` liên tục `stop_seconds+0.15s` + stable (inlier ≥60% trong bán kính `max(3px, 0.06·diag)`, robust-drift ≤ `max(5px, 0.10·diag)` — `stationary_radius_ratio` vs `stationary_drift_ratio`, :219-220/:1433-1447) → `_bind_vehicle` ngay (:2268-2282).
- **VAI TRÒ**: quyết định "xe nào sở hữu ô nào, từ khi nào". Mất nó: occupancy chỉ là pixel — không gắn identity, session không biết xe của ai.
- **Ở ĐÂU**: `svb:2047 update_tracks`, `:2431 update_vision`, `:1285 _batch_match`, `:1080 _record_arrival_claim`, `:1167 _try_commit_arrival_claim`, `:2298 notify_track_lost`, `:1371 _advance_strong_overlap`.
- **TẠI SAO**: source-supported — production chạy `policy="vision_primary"` (`two_camera:2328`); legacy path vẫn còn trong code nhưng không dùng.

### S9 — Parking episode + departure token (vòng đời chiếm ô)

- **LÀM GÌ**: `_bind_vehicle` → `_open_parking_episode` `slotId:G<id>:F<frame>` state `parked`, revision+1 mỗi transition, evidence provenance từ binding. `_release_vehicle` → episode `departing`; vision báo `empty` → `_create_departure_token` (token giữ GID + polygon + appearance + `empty_observations`, `recovery_retention_seconds=5s` → `confirmed_empty` sau ≥2 empty) + `_detach_binding_for_departure` → `released`. Token lật → `_restore_false_empty_token` (flicker). Token là *bằng chứng rời ô duy nhất* có quyền gọi `bind_external_id` — parked GID chỉ được recover qua token của chính ô đó (`raise ValueError` nếu sai ô/sai nguồn — ccm:713-727).
- **VAI TRÒ**: giữ liên tục identity qua khoảng tracker+vision đều "mù" (xe đang lùi ra). Mất nó: xe rời ô bị cấp GID mới → 1 xe 2 ID + session rối.
- **Ở ĐÂU**: `svb:888 _open_parking_episode`, `:945 _transition`, `:1449 _create_departure_token`, `:1982 _release_vehicle`, `ccm:690 bind_external_id`; recovery batch `two_camera:1058` → `binder.batch_recover_ids` (:2763+, lapjv :3520).
- **TẠI SAO**: source-supported — transactional consume (reservation chỉ pop sau khi `_bind` thành công).

### S10 — Parked reservations (đồng bộ chủ ô)

- **LÀM GÌ**: `sync_parking_identity_reservations` (gọi 2 lần/vòng, `two_camera:2672,2808`): binder export `get_identity_reservations` → manager chọn 1 owner/canonical-GID và 1 owner/slot (tranh chấp → `parked_reservation_rejected`) → `identity.state='parked'`, `detach_parked_local_tracks` (gỡ local binding của GID đậu — xe khác không thừa hưởng cặp local/GID đó), hủy handoff của GID đậu, ReID không match vào nó (`parked_reservation_origin_miss` trừ khi `_reserved_identity_may_compete`), release → `dormant` với `retention_anchor` reset.
- **VAI TRÒ**: "GID đậu là chủ ô bền, không phải track LOST" (`two_camera:2669`). Mất nó: local fragment của xe đậu ăn cắp được bbox của xe chạy ngang → identity chuyển nhầm.
- **Ở ĐÂU**: `ccm:849`, `ccm:1044 detach_parked_local_tracks`, `svb:359 get_identity_reservations`, `svb:3736 remap_vehicle_ids` (sau merge GID, claims/tokens/episodes/bindings re-key theo canonical).

---

## 4. Storyboard (ít chữ — đề xuất hình/animation)

Layout 2 panel cam1 | cam2 + band timeline dưới. Đề xuất 6 shot:

1. **S1**: cam1 panel, bbox xanh lá `G#5` bám theo xe lướt; band: local track `confirmed`. *Nhấn*: số nhỏ `local#12 → GID#5` chỉ xuất hiện sau khi các match pass thất bại (hiệu ứng "đợi").
2. **S2**: xe vào vùng overlap (tô vùng polygon hai cam) → thẻ `handoff G#5 → cam2` mở với mũi tên vận tốc; thanh TTL chạy ngược 45f.
3. **S3**: cam2 bbox mới `local#3 (tentative)` → ma trận cost mini hiện cột sáng, `lapjv → margin ✓ → evidence 2/3` → nhãn đổi `G#5`. *Animation*: entry vẽ corridor dự đoán (điểm world + velocity).
4. **S4 (nhánh)**: nếu frame biên rớt → registry card `G#5 dormant` đếm ngược retention `60s/180f`; fragment mới match vào card → đổi state `active`.
5. **S5**: xe dừng trong ô A05: track local nhạt dần (`LOST`), ô chuyển vàng `occupied (empty_votes 5 < 12)` → claim card `obs 3 · overlap 0.62 · lost 0.4s` → ô đỏ `G#5 parked`, episode chip `A05:G5:F812`.
6. **S6**: xe lùi ra: vision `empty` → token `G#5 A05 5s` với bbox+hist thumbnail → fragment `local#7` khớp token → `G#5` trở lại; episode `released`.

Phong cách: nhãn chỉ là `G#n`, `local#n`, `state`, số nhỏ (cost/dwell/streak) — phù hợp hiển thị trong web pack.

---

## 5. Số liệu minh họa nhỏ

> Mọi khoảng cách match dùng **đơn vị shared-map** và được resolve runtime = *bội số chiều dài trung vị của ô đỗ* (`SLOT_MATCHING_MULTIPLES` `two_camera:385-390` → `resolve_matching_distance` :426-446, gọi :2154-2196): `handoff_prediction_radius = 2.75×`, `handoff_match_distance = 1.75×`, `dormant_match_distance = 1.75×`, `cross_camera_duplicate_distance = 0.50×`. CLI arg thắng calibration; calibration chỉ được *siết* chứ không nới qua kích thước ô. Con số px trong class default (`prediction_radius=90`, `dormant_match_distance=160`) **không phải giá trị runtime**.

**Ví dụ cost** (slot_length = L): xe rơi vào corridor cách dự đoán `0.55·L`, appearance dist `0.12`, size `0.08`, direction `0.2` → `0.55·(0.55L/2.75L) + 0.30·0.12 + 0.10·0.08 + 0.05·0.2 = 0.11 + 0.036 + 0.008 + 0.01 ≈ 0.164` ≪ cost_limit 0.92 → đủ điều kiện bind (sau evidence streak).

**Runtime-resolved** (arg defaults `two_camera.py` parser — giá trị chạy thực khi không truyền flag):

| Giá trị | Nguồn runtime |
|---|---|
| `parking_fps = 2.0` (worker interval 0.5s) | `--parking-fps` :1784 |
| `parking_occupied_seconds = 0.5` → `occupied_seconds` smoother | `--parking-occupied-seconds` :1788, truyền :2274 |
| `parking_empty_seconds = 1.0` (token cần empty dwell) | `--parking-empty-seconds` :1789 |
| `parking_max_result_age_seconds = 1.0` (bỏ vision stale) | `--parking-max-result-age-seconds` :1791 |
| `predeparture_guard_seconds = 1.0 + 1.0 + 0.5 = 2.5s` | derived :2343-2346 |
| `recovery_retention_seconds = 5.0` (token giữ GID rời ô) | `--slot-recovery-seconds` :1883, truyền :2329 |
| `arrival_vision_confirmations = 2` (streak cần commit) | `--slot-arrival-vision-confirmations` :1915 |
| `arrival_min_samples = 3`, `absence 0.75s`, `lost_commit_delay 0.35s` | :1914-1918 |
| `handoff_ttl = 45 frame` | `--handoff-ttl` :1926, truyền :2234 |
| `identity_retention = 180f / 60s` (moving 12s) | :1952-1962, truyền :2243-2245 |
| `dormant_appearance_threshold = 0.60` | `--dormant-appearance-threshold` :1964, truyền :2247 |
| `lost_track_ttl = 90 frame` | `--lost-track-ttl` :1806, truyền :2371 |
| `max_camera_skew = 120ms`, `json_fps = 5.0` | :1997, :1802 |

**Class defaults được giữ nguyên** (không bị override trong constructor `two_camera`): binder `stop_seconds=1.0` + `commit_grace=0.15` (dwell ≈1.15s), `exit_seconds=0.5`, `min_vehicle_overlap=0.35`, `strong_vehicle_overlap=0.60`, `min_stop_samples=8`, `stationary inlier ≥60%`, `arrival_competitor_margin=0.15`, `false_empty_grace=1.25s`, `recovery_appearance_threshold` (class 0.55 — **đã override** `args.slot_recovery_appearance_threshold`, :2333), manager `appearance_threshold=0.45`, `min_direction_cosine=0.25`, `tracklet_gallery_size=24`, `edge_margin=40`, `lookahead_frames=16`, evidence streak 1/2/3 frame theo sức mạnh candidate (ccm:3664-3673).

**Công thức nhỏ để minh họa**: vote trống `empty_votes ≥ 12/25`; claim score `0.55·overlap + 0.20·samples + 0.15·inward + 0.10·gain`; handoff cost `0.55res + 0.30app + 0.10size + 0.05dir`; track→slot `1 − overlap + 0.15·hysteresis`.

## 6. Giới hạn source (tách rõ khỏi suy luận)

- Appearance = **gallery histogram HSV 16×16 + LAB a,b 12×12 + L 16** (`tracklet_descriptor.py:18-60`), `histogram_distance` + `compare_tracklets` (support/sample_pairs) — KHÔNG phải deep-ReID; cờ `use_deep_reid` bị ép `False` (ccm:391-397).
- Assignment là **LAPJV thật** (`lap.lapjv`) tại 5 điểm: local tracking (motion_tracker:1908), handoff (ccm:3615), dormant (ccm:5526), world-trajectory (ccm:6115), slot binding (svb:1307, 3520) — `extend_cost=True`, cost_limit 0.92/0.95/0.999.
- Prediction = constant-velocity trên shared-map (homography) — không model động học phức tạp; `prediction_source` đánh dấu `measurement/kalman_prediction/stale_prediction` (mt:2262-2267).
- `vision_occupied` là **đồng thuận pixel-ratio** qua 25 biến thể + rescue/edge — không phải classifier per-slot.
- Làn vision async chỉ ở **live**; replay mặc định chạy inline cùng nhịp (`two_camera:2517`, `--replay-async-vision` để bật async).
- `observable_tracks` gồm cả TENTATIVE — handoff có thể bind trước local confirm; cấp GID mới thì không (`_is_allocatable` ccm:2269).
- `binder.policy` default code là `"legacy"` nhưng production ghi đè `vision_primary` (two_camera:2328).

## 7. Cross-review hooks cho C

- Call order bảng §1 (đã đối chiếu line với `two_camera.py` hiện tại).
- Điểm feedback: vision-trước-ID (:2517), protected keys (:2764→2779), canonical remap (:2794), reservation 2 pha (:2672/:2808), `begin_frame` (:2514), `finalize_arrivals` (:2806), `parking_episodes`/`pending_arrivals` trong snapshot (:2858-2867).
- Contract xuất cho session layer: `binder.parking_episodes()` (id `slot:G<id>:F<frame>`, state `pending/parked/departing/released`, revision), `binder.pending_arrivals()` (claims), `binder.to_json` per-cam (slots+vehicle_id), `manager.to_json` (registry+events).

## 8. Blockers / câu hỏi mở

- `_in_exit_zone` (ccm:525) phụ thuộc cấu hình `custom_masks`/`edge_adjacency` từ calibration — chưa kiểm chứng file `gate_zones`/calibration thật; số liệu edge cụ thể cần đọc config session.
- Chiều-dài-ô trung vị `median_slot_length` (world units) chưa đọc từ file calibration session → giá trị tuyệt đối của `prediction_radius`/`dormant_match_distance` chưa chốt (công thức bội số đã có, §5).
- `recovery_evidence_frames` runtime = `3` hardcode trong constructor (`two_camera:2336`); `--slot-recovery-appearance-threshold` default chưa đọc (class fallback 0.55).
- `occlusion_guard` (nhóm khi 2 xe dính blob) chỉ đọc điểm vào/ra (`prepare`, `groups`, `independent_pairs`) — chưa mở nội bộ `occlusion_guard.py` (232 dòng) để tả chi tiết split/merge; ghi nhận nó feed `sync_occluded_identities`/`register_independent_tracks` trước association.
- Chưa verify `_match_world_trajectory_identities` và `_match_unbound_cross_camera_pairs` ở mức cost-term chi tiết (chỉ xác nhận lapjv callsite :6115 và vai trò trong waterfall :7207-7241).
- Không tự approve — đề nghị C cross-check thứ tự §1 và nhánh song song §3.7/S7 khi có dossier.
