# F1 — Thiết kế nhánh `stationary_reacquire` (KHÔNG code) — **rev2**

Builder: A · Ngày: 2026-10-06 · Inputs: SPEC §5, MEGAPLAN, F0-SUMMARY, F0-a-codepath.md, F0-b-cases.{md,json}, F0-c-tests.md, **F1-b-backtest.md**.

**Changelog rev2** (theo F1-b backtest):
1. **Siết gate §5 live-member**: member live cam khác phải qua *window-drift* — đo drift trong cửa sổ ±10f quanh event (velocity **lấy mẫu tại event**, KHÔNG dùng EMA toàn-đời `velocity_world_per_second`); `drift > MEMBER_DRIFT_STAT` ⇒ reject `live_member_moving`. Mục đích: chặn false-merge khi member là xe ĐANG CHẠY ngang chỗ fragment đỗ (thai3_f1528: member gid2/L50 drift 3.18wu/20f ≈ 1.0wu/s — qua được V_STAT=1.5 theo EMA, nhưng là xe khác hẳn). *Lưu ý trung thực*: 3.18wu < TAIL_STAT=4.0 nên veto-drift MỘT MÌNH không chặn được f1528 ở ngưỡng hiện tại — đề xuất `MEMBER_DRIFT_STAT ≈ 2.0wu/±10f` (chặt hơn TAIL_STAT) hoặc dựa vào backstop (2). Xem §9.
2. **G4 gallery-missing = reject áp cho nhánh live-member**: identity `active` có member cam khác nhưng THIẾU `camera_appearance_samples[cam]` ⇒ reject `target_camera_gallery_missing` — đây chính là backstop đã cứu f1528 trong backtest (gid2 không có cam1 gallery). Ghi tường minh để F2 không lược.
3. **F2 phải log `identity.last_world` + `member_drift_window`** vào cả 3 event `stationary_reacquire_*`: 3/10 case (thai3, thai6_f1205, thai6_f4936) `anchor_world` của obs cũ = null trong predictions ⇒ G2 Euclid không verify được offline; field internal `last_world` + drift-window là bằng chứng duy nhất để calibrate/verify flag-on.
Phạm vi: `cross_camera_manager.py` (logic) + `two_camera.py`/`run_two_camera_session.py`/`runtime_server.py` (plumbing cờ). Không đổi threshold/ROI/calibration/slots hiện có; không refactor.
**Plan update**: F3 replay huỷ — verify trên livecam ⇒ cờ phải bật qua CLI `runtime_server.py` và event `stationary_reacquire_*` phải đọc được từ runtime snapshot/log (xem §7–§8).

Ký hiệu: `ccm` = `backend/main_detect/src/techgar/cross_camera_manager.py`, `tm` = `.../trajectory_memory.py`, `2cam` = `backend/main_detect/two_camera.py`.

---

## 1. Điểm chèn

### 1a. Pass mới độc lập — khuyến nghị CHỌN

Hàm mới `_match_stationary_reacquire(all_tracks, frame_idx, camera_timestamps_s) -> set[(cam,lid)]`, đặt sau `_match_world_trajectory_identities` (ccm:~6206) và được gọi trong `update_all_tracks` **giữa** `deferred_cross_camera = self._match_unique_unbound_cross_camera_tracks(...)` (ccm:7235–7239) và vòng mint mới (ccm:7244):

```python
# ccm, trong update_all_tracks, ngay trước "Tentative tracks remain ID-less..." loop
stationary_deferred = (
    self._match_stationary_reacquire(
        post_world_trajectory_tracks, frame_idx, camera_timestamps_s
    )
    if self.enable_stationary_reacquire
    else set()
)
# trong guard của vòng lặp mint (ccm:7246–7251) thêm:
#     or (cam_id, local_track_id) in stationary_deferred
```

**Lý do chọn "last resort trước mint":**
- Cứu được cả 3 signature lỗi đã chứng minh: (i) dormant `same_camera_stale` veto sớm (ccm:4968–4990 — recency 12s, chặn trước khi distance/appearance được xét); (ii) world `trajectory_score` (ccm:6022–6024 — direction≈0 + time_topology=0 không thể đạt 0.78 với xe đỗ); (iii) live-owner im lặng (test2 F0-c — `world_trajectory_rejections` rỗng, không event nào).
- Fragment đến được đây = đã qua mọi pass hiện có mà vẫn unbound ⇒ pass mới chỉ đụng phần "rác" của pipeline cũ → blast radius nhỏ nhất.
- Flag-off bit-identical là tầm thường: `if not self.enable_stationary_reacquire: return set()` ngay đầu hàm + membership-check trên set rỗng.

**Phương án loại (đã cân):**
- *Escape trong world pass / sửa `plausible_recent_fragment`* (ccm:6037–6044, đòi `time_topology≥0.75`): chỉ cứu được case đến được score-eval. Không cứu dormant-stale-only (fragment tentative chưa allocatable → world pass bỏ qua, ccm:5761–5774) và không cứu live-owner-silent (cặp không vào được score eval). Lại phải sửa điều kiện của escape hiện có → rủi ro flag-off diff. **Loại.**
- *Nhánh trong dormant pass sau `same_camera_stale`*: cứu được (i) nhưng không chạm (ii)/(iii); đồng thời phải vá recency veto của dormant = sửa guard hiện có. **Loại** (giữ veto nguyên vẹn như SPEC yêu cầu "không đổi threshold").

### 1b. Hook phụ cho defect-2 (ambiguous dormant → steal sau 1 frame)

F0-c test (i): `dormant_reid_ambiguous` defer ~1–3f (`ambiguity_until = frame_idx+3`, ccm:5543) rồi LAPJV bind ngay khi margin 0.12 vừa qua. Fix tối thiểu, flag-gated, KHÔNG đổi logic dormant khi cờ tắt:

- Tại nhánh ambiguous của dormant (ccm:5531–5565, `deferred_keys.add(...)` + `_ambiguous_local_identities[key]=(until, ids)`): khi cờ bật, ghi thêm `self._stationary_deferred_since[(cam_id, local_id)] = frame_idx` và KHÔNG để LAPJV bind cặp này trong khi ≥2 claim ids còn pass stationary-gates (§3.4) — tức là biến defer-1-frame thành defer-persistent.
- Cơ chế persistent-defer dùng chung dict `_stationary_deferred_since` + cleanup mỗi `update_all_tracks`: bỏ key khi track đã bound/chết, khi chỉ còn ≤1 ứng viên pass gates, hoặc quá `max(handoff_ttl, 60)` frame (mirror `depart_expired` ccm:7285–7290 và `_cleanup_world_trajectory_deferrals` ccm:4484–4510). Quá cap → nhường cho flow cũ (mint) — không starvation vĩnh viễn.

---

## 2. Điều kiện vào (tất cả map về code field/function)

### 2a. Candidate fragment `(cam_id, local_id, track)`

Mirror candidacy world-pass (ccm:5761–5774): `(cam,lid) ∉ _local_to_global` ∧ `_is_allocatable(track)` (ccm:2269) ∧ `_has_fresh_detection(track)` ∧ `len(appearance_samples(track)) ≥ 2` ∧ `len(trajectory.provisional_samples((cam,lid))) ≥ trajectory.min_observations` (tm:542, `min_observations`=3, tm:59/65).
Thêm **fragment-stationarity**: `span(provisional_samples) ≤ TAIL_STAT` — fragment tự mọc lại và nằm yên, loại "xe chạy ngang qua chỗ xe chết".

### 2b. Identity pool

`identity.state ∉ {exited, expired}` ∧ gid ∉ `_provisional_identity_holds` ∧ gid ∉ `_occluded_global_ids` — cố tình RỘNG HƠN dormant pool (ccm:4931–4938) vì phải bắt cả `active`/live-on-other-camera (test2) lẫn `dormant`/`handoff`/`parked`/`recovery_pending`.

### 2c. Gates (accept cần TẤT CẢ)

| # | Gate | Code đọc | Ngưỡng |
|---|---|---|---|
| G1 | Không same-camera live owner | `not _has_confirmed_camera_member(gid, cam_id, all_tracks, exclude_local_id=lid)` (ccm:5868–5880) | veto giữ nguyên |
| G2 | Khoảng cách same-spot (Euclidean, KHÔNG corridor) | `d = ‖_track_world(cam,track) − identity.last_world‖` (ccm:1407, field ccm:70) — lấy min với origin trail `provisional_samples(key)[0].world` (tm:542) | `d ≤ D_STAT` |
| G3 | Corroboration pixel khi bbox mép | khi `D_STAT_CORE < d ≤ D_STAT`: project `identity.last_world`→pixel qua `_local(cam,·)` (ccm:~1417), ghép `camera_bbox_sizes[cam]`/`bbox_size` (ccm:76–77) → IoU với `(track.x,y,w,h)` | `iou ≥ IOU_STAT` |
| G4 | Appearance | `compare_tracklets(track, camera_appearance_samples.get(cam) or appearance_samples)` (ccm:5889–5895, 5137–5146) | `distance ≤ 1−A_STAT` ∧ `support ≥ 2` |
| G5 | Size | `_size_distance((track.w,h), camera_bbox_sizes.get(cam, bbox_size))` (ccm:5907–5913) | `≤ S_STAT` |
| G6 | Identity đã đỗ yên khi chết | (a) `‖identity.velocity_world_per_second‖ ≤ V_STAT` (ccm:71–72, EMA tại `_observe_identity` ccm:583–601), HOẶC (b) tail-span `global_samples(gid)` ≤ TAIL_STAT (tm:539 — trail giữ 2s trước khi chết), HOẶC (c) identity từng ở `_parked_reservations` | OR |
| G7 | Recency-band | `elapsed` tính bằng `_identity_elapsed` (ccm:4316) — chỉ dùng để log + cap deferral; KHÔNG veto (đây chính là điểm nhánh này thay `same_camera_stale`) | — |

`identity.last_camera != cam_id` chỉ được phép khi có live member camera kia và member-world nằm trong `D_STAT` quanh fragment (§5); dormant cross-camera (xe chết cam1, mọc lại cam2 ở vùng overlap) vẫn được cho qua nếu `_are_adjacent` + đủ gates — vì với xe đỗ, `last_world` cùng chỗ bất kể cam nào nhìn thấy.

---

## 3. Guard chống cướp ID

| Guard | Cơ chế | Dòng nền |
|---|---|---|
| same_camera_live_owner | veto tuyệt đối (test iii F0-c đang PASS — giữ) | ccm:5868–5880 |
| live_member_divergence | member live ở cam khác mà `‖member_world − frag_world‖ > D_STAT` → reject có log | mirror `divergent_member` dormant ccm:5580–5627 |
| live_member_drift (rev2) | member live ở cam khác mà **drift trong cửa sổ ±10f quanh event** `> MEMBER_DRIFT_STAT` → reject `live_member_moving` (velocity đo tại window, KHÔNG EMA) | f1528 backtest, §5 |
| **Margin / ambiguous → defer PERSISTENT** | `rank = d + 4.0·appearance_distance`; accept chỉ khi ứng viên duy nhất HOẶC đầu bảng thắng hạng hai trên CẢ HAI trục: `Δd ≥ MARGIN_D` ∧ `Δapp ≥ MARGIN_A`; nếu không → `stationary_reacquire_deferred` + vào `_stationary_deferred_since` (persistent, cap `max(handoff_ttl,60)`f) | fix defect-2 F0-c |
| occupied-spot conflict (partial cover) | nếu một identity KHÁC có `last_world` trong `D_STAT` quanh `identity.last_world` và identity đó còn bằng chứng sống/gần đây → defer (hai "xe đỗ" không thể trùng chỗ) | dùng `_identities` + `_identity_is_recent` |
| spot-emptied (công nhận giới hạn) | tracker motion-only: xe đỗ KHÔNG sinh observation ⇒ "spot trống giữa gap" không đọc được từ stream. Chỉ phòng vệ gián tiếp: contamination guard trên + IoU corroboration. Nếu sau này plumbing `SlotVehicleBinder` occupancy vào manager (đang nằm ngoài, `2cam` `binders`), guard này nâng cấp được — **F2 không bắt buộc**; nêu rõ là UNSURE coverage | — |

---

## 4. Ngưỡng đề xuất — trích F0-b-cases.json (đo lại Euclidean + IoU)

Logged `world_distance` = corridor-to-predicted, méo cho xe đỗ; tính lại `‖anchor_world_new − anchor_world_old‖` và bbox-IoU image-space:

| case | verdict | corridor wd | **Euclid world** | px Δ | bbox IoU | app-sim | gap f |
|---|---|---:|---:|---:|---:|---:|---:|
| sang8 f600 | SAME | 0.90 | 1.81 | 22 | 0.52 | 0.833 | 334 |
| thai3 f1774 | SAME | 1.20 | n/a (≈2.5*) | 31 | 0.45 | 0.866 | 238 |
| thai4 f4633 | SAME | 0.73 | 2.80 | 37 | 0.47 | 0.872 | 338 |
| thai6 f1128 | SAME | 0.83 | 2.14 | 30 | 0.60 | 0.858 | 263 |
| thai6 f1205 | SAME | 0.45 | n/a (≈0.6*) | 7 | 0.81 | 0.855 | 342 |
| thai6 f4936 | SAME | 2.74 | n/a (partial, area×3.6) | 93 | 0.18 | 0.866 | 348 |
| thai6 f5367 | SAME | 3.96 | 4.40 (partial ×4.4) | 70 | 0.23 | 0.724 | 220 |
| thai6 f1713 | DIFF | 1.65 | **18.33** | 202 | 0.00 | 0.782 | 310 |
| thai7 f2112 | DIFF | 1.23 | **26.60** | 231 | 0.00 | 0.863 | 698 |
| thai8 f1945 | DIFF | 4.29 | **6.07** | 120 | 0.15 | 0.748 | 421 |

`*` anchor_world null trong predictions của frame cũ; px quy đổi theo tỉ lệ phiên (~0.05–0.12 wu/px).

**Chồng lấn quan sát được (nêu thẳng theo brief):**
- Corridor wd: SAME 0.45–3.96 vs DIFF 1.23–4.29 → chồng gần toàn bộ ⇒ KHÔNG dùng.
- Appearance-sim: SAME 0.724–0.872 vs DIFF 0.748–0.863 → chồng hoàn toàn ⇒ appearance chỉ làm floor, không làm separator.
- **Euclid `last_world`↔fragment: SAME ≤4.40 (đỉnh là partial-bbox), DIFF ≥6.07** → khe [4.40, 6.07] sạch trong 10 case ⇒ distance-mới là separator chính.
- bbox-IoU: SAME ≥0.18, DIFF ≤0.15 → khe hẹp [0.148, 0.177] ⇒ chỉ corroborator, không separator.

**Ngưỡng đề xuất:**

| Tham số | Giá trị | Cơ sở |
|---|---|---|
| `D_STAT_CORE` | **3.0 wu** | SAME non-partial max 2.80 (+0.2 headroom); DIFF min 6.07 cách 3.27 |
| `D_STAT` (extended) | **5.0 wu** | chỉ hợp lệ kèm IoU≥0.15 hoặc dấu hiệu bbox-partial (diện tích bbox mới ≥1.5× `camera_bbox_sizes[cam]` hoặc bbox cũ chạm mép crop/ROI); SAME partial max 4.40 (+0.6), DIFF min 6.07 (−1.07 margin) |
| `A_STAT` | **sim ≥ 0.70** (`compare_tracklets.distance ≤ 0.30`), support ≥ 2 | SAME min 0.7237; trùng hệ threshold same-camera dormant `min(0.30, dormant_appearance_threshold)` (ccm:5167–5170) |
| `S_STAT` | `size_distance ≤ 0.90` | parity world-pass gate (ccm:5918); size không phân tách được (partial SAME 0.77 vs DIFF 0.85) |
| `IOU_STAT` | `≥ 0.15` | khe [0.148, 0.177] hẹp → đặt dưới cả hai, vai trò corroboration |
| `TAIL_STAT` | `≤ 4.0 wu` | nửa chiều dài ô đỗ (median ~9.5 wu); xe đỗ: tail 2s nằm gọn trong ~1–2 wu, xe đã chạy đi: tail trải dài. **UNSURE — cần calibrate khi flag-on trên livecam** (log tail_span trong event) |
| `V_STAT` | `≤ 1.5 wu/s` | velocity_world_per_second không được log trong predictions ⇒ suy luận từ parking-creep; OR-gate với TAIL_STAT nên lỗi mềm. **UNSURE — calibrate flag-on** |
| `MEMBER_DRIFT_STAT` (rev2) | **`≤ 2.0 wu` trong ±10f** (đề xuất; spec tối thiểu: `> TAIL_STAT` là bound cứng) | f1528: member drift 3.18wu/±10f ≈ 1.0wu/s qua được V_STAT (EMA) lẫn TAIL_STAT=4.0 ⇒ cần bound riêng <3.18. Xe đỗ thật drift ~0.5wu/20f; `>2.0` = đang lăn. **UNSURE — calibrate flag-on** |
| `MARGIN_D` / `MARGIN_A` | `1.5 wu` / `0.08` | MARGIN_D = nửa khe [3.0,6.07]; MARGIN_A theo độ rung app quan sát |
| `STAT_MARGIN` | = cặp (MARGIN_D, MARGIN_A) ở trên — accept chỉ khi thắng cả hai trục | anti-ambiguous |

Band UNSURE thừa nhận: `4.4 < d ≤ 5.0` (vùng chỉ chứng kiến SAME-partial) + DIFF-min 6.07 — nếu flag-on phát hiện DIFF ở 4.4–6.0 thật, hạ D_STAT về ~4.5 hoặc siết IoU; deferral đang là fallback an toàn.

---

## 5. Nhánh live-owner silent (test2 F0-c) — XỬ LÝ + LOG

Hiện trạng: gid còn member live cam khác → ngoài dormant pool; world pass đánh giá nhưng kết quả reject không được ghi vào `world_trajectory_rejections` khi cặp rớt sớm/không vào candidate → mint gid mới **im lặng**.

Thiết kế: identity `active` có member cam khác vẫn nằm trong pool (§2b). Với mỗi member bound của gid trên cam khác có fresh detection, áp **ba kiểm-tra tuần tự** (mỗi fail ⇒ `stationary_reacquire_rejected` có log):

1. **Gallery cam-đích (rev2 — tường minh):** member-live cũng phải qua G4 với `camera_appearance_samples[cam]` thật của cam fragment — gallery cam đích thiếu ⇒ reject `target_camera_gallery_missing`, KHÔNG fallback `appearance_samples` tổng như nhánh dormant. Lý do: member live + fragment là 2 "điểm nhìn" của cùng xe phải giống nhau *ở cam fragment*; nếu gid chưa từng có mẫu cam đó thì không đủ chứng để gộp một gid đang-sống vào fragment (rủi ro cướp identity đang live cao hơn rủi ro dormant). **Backstop này đã cứu thai3_f1528 trong backtest** (gid2 live cam2/L50 không có cam1 gallery).
2. **Divergence:** `‖member_world − frag_world‖ > D_STAT` → reject `live_member_divergence` (gid đang ngồi trên xe khác → mint đúng, nhưng giờ CÓ LOG).
3. **Window-drift (rev2):** đo drift của member trong cửa sổ `[frame_idx−10, frame_idx+10]` quanh event — `drift = ‖world(f_hi) − world(f_lo)‖` trên các obs của member trong window (velocity = `drift/Δt` **lấy mẫu tại event, KHÔNG `velocity_world_per_second` EMA toàn-đời**). `drift > MEMBER_DRIFT_STAT` ⇒ reject `live_member_moving`. Motivation f1528: member là xe đang chạy ngang chỗ fragment đỗ (3.18wu/20f) — EMA bị pha loãng bởi quá-khứ đỗ yên nên vẫn < V_STAT; drift-local thì không. Member không có obs trong window (xe tắt máy rất yên) ⇒ drift=0, pass — không phạt xe đỗ thật.

Cả ba pass ⇒ `‖member_world − frag_world‖ ≤ D_STAT` đồng nghĩa "cùng xe phủ 2 cam, cả hai đều đỗ" → cho qua. Khi accept: `_bind(cam_id, local_id, gid)` — gid đa-cam đã được hỗ trợ sẵn (`_gid_members`, `_refresh_identity_states` merge gallery ccm:7025–7045).

---

## 6. Logging schema — emit trong `_match_stationary_reacquire`

Qua `self._event(kind, frame_idx, global_id, **details)` (ccm:1366) — tự động vào `recent_events`/`identity_events`.

| Event | Khi | Fields |
|---|---|---|
| `stationary_reacquire_accepted` | `_bind` thành công | `source_camera=identity.last_camera`, `target_camera`, `target_local_id`, `identity_state`, **`identity_last_world`** (tuple x,y internal — rev2), `world_distance` (euclid), `bbox_iou`, `appearance_distance`, `appearance_support`, `size_distance`, `elapsed_s`, `velocity_norm`, `tail_span`, **`member_drift_window`** `{member_cam, member_lid, f_lo, f_hi, drift_wu, velocity_wu_s, member_drift_stat}` khi có live member (rev2), `competitors=[{gid,d,app_dist}]` (mọi id qua gates), `margin_d`, `margin_a` |
| `stationary_reacquire_rejected` | ứng viên qua coarse screen (d ≤ 2·D_STAT hoặc app sim ≥0.5) rồi rớt gate, hoặc live-divergence/moving | như trên + `reason ∈ {distance, appearance, size, stationary_history_missing, same_camera_live_owner, live_member_divergence, live_member_moving, target_camera_gallery_missing, occupied_spot_conflict, fragment_moving}` |
| `stationary_reacquire_deferred` | ambiguous (§3) hoặc persistent-defer còn hiệu lực | `reason=ambiguous_candidates`, `competing_global_ids`, `deferred_since_frame`, `deferred_frames`, + components như accepted |

**Bắt buộc F2 (rev2):** `identity_last_world` phải emit ngay cả khi giá trị null (ghi `null`, không bỏ field) — 3/10 case F0-b (thai3, thai6_f1205, thai6_f4936) `anchor_world` của obs cũ null trong predictions ⇒ không verify được G2 offline; `last_world` internal + `member_drift_window` là bằng chứng duy nhất để calibrate `MEMBER_DRIFT_STAT` và verify G2/G4/G6 flag-on trên livecam.

Emit mỗi verdict tối đa 1 lần/8 frame/(gid,cam,lid,reason) — reuse `_dormant_rejection_last` pattern (ccm:3039) hoặc dict song song `_stationary_event_last` để không phá dedup dormant.

---

## 7. Cờ `enable_stationary_reacquire` — plumbing (livecam-verify được)

- `two_camera.py` `make_parser()` (ccm-adjacent args block ~L1855–1955): `parser.add_argument("--enable-stationary-reacquire", action="store_true", help=...)`.
- `CrossCameraManager(...)` call site `2cam`:2227–2260: `enable_stationary_reacquire=args.enable_stationary_reacquire`; ctor thêm `enable_stationary_reacquire: bool = False` → `self.enable_stationary_reacquire = bool(...)`.
- **Lan tự động**: `runtime_server.py:399` gọi `run_two_camera_session.make_parser()` → wrap `two_camera.make_parser()` (`run_two_camera_session.py:69–70`) ⇒ CLI runtime có cờ ngay, không cần sửa `runtime_server.py`. Replay `run_two_camera_session.py` cùng parser ⇒ on/off đối chứng được trên video ghi sẵn nếu cần.
- Livecam command: thêm `--enable-stationary-reacquire` vào lệnh `runtime_server.py` hiện tại (CLAUDE.md block).
- Đọc event trên livecam: `GET /api/runtime/events` (runtime_server.py:310–312 → `snapshot["recent_events"]` → `self._events`, ccm:7774/1366–1368) và `/api/runtime/snapshot` (`recent_events` cùng field). Lưu ý ring 200 entry — stationary events hiếm nhưng sẽ trôi theo noise; nếu session có record predictions thì `identity_events` giữ trọn.
- State mới: `self._stationary_deferred_since: Dict[Tuple[str,int], int] = {}` (luôn init; cleanup chỉ chạy khi cờ bật). `self._stationary_event_last` cho dedup log.

---

## 8. Flag-off equivalence & rủi ro

**Bit-for-bit khi cờ tắt**: call site bọc `if self.enable_stationary_reacquire` → hàm không chạy; `_event` chỉ gọi trong pass mới; `_stationary_deferred_since` rỗng ⇒ membership-check trong vòng mint là no-op; dormant hook phụ (§1b) bọc cùng cờ. Không đụng threshold, ROI, calibration, slots, ordering hiện có.

**Rủi ro gán nhầm:**
| Rủi ro | Guard | Residual |
|---|---|---|
| Xe thay thế trong gap (thai8-pattern) | euclid+IoU+occupied-spot conflict; spot-emptied không chứng minh được bằng tracking-only → defer khi mơ hồ | TRUNG BÌNH — calibrate qua event log livecam |
| Hai xe đỗ kề nhau cùng màu | persistent defer khi ≥2 pass gates | thấp |
| Bbox partial/edge-clipped thổi phồng distance | IoU corroboration qua `_local()` + `camera_bbox_sizes` | thấp |
| Xe chạy ngang chỗ xe chết được gán nhầm | fragment-stationarity (provisional span ≤ TAIL_STAT) + fresh-detection + maturity | thấp |
| **Xe chạy ngang chỗ fragment khi mang gid live (thai3_f1528 — backtest)** | window-drift ±10f `≤ MEMBER_DRIFT_STAT` (rev2) + gallery-missing reject nhánh live-member | TRUNG BÌNH — bound 2.0wu chỉ đề xuất, chưa calibrate; backstop phụ = G4 gallery-missing |
| Xe rời đi rồi quay lại đúng chỗ (cùng xe hoặc xe khác) | app floor + margin; không phân biệt triệt để được | đã nêu — chấp nhận defer khi mơ hồ |
| Live-member divergence đo sai do homography | D_STAT đủ rộng cho overlap zone; reject-có-log để audit | thấp |

**Test hooks có sẵn** (F0-c): 3 FAIL tests phải chuyển PASS khi cờ bật (`reuse gid1` ×2, ambiguous-defer); 2 PASS phải giữ PASS (`distant car`, `same_camera_live_owner`); thêm assert flag-off ⇒ event-stream identic.

## 9. Điểm mở còn UNSURE

- `V_STAT`/`TAIL_STAT` thiếu ground-truth (velocity không log) → gate OR mềm + log components để calibrate lượt livecam đầu.
- `MEMBER_DRIFT_STAT=2.0wu/±10f` (rev2) suy ra từ duy nhất 1 hard case (f1528, member 3.18wu) + giả-định xe đỗ jitter ≤~1wu — sample=1 ⇒ phải calibrate qua `member_drift_window` trên livecam trước khi tin. Nếu nâng lên TAIL_STAT=4.0 thì f1528 lọt → KHÔNG được nới quá 3.18wu mà không có evidence mới.
- Nguồn `world` cho fragment: `_track_world` lỗi `cv2.error`/`KeyError` khi homography thiếu → skip ứng viên đó (pattern sẵn có).
- Nếu cross-camera dormant reappear (khác `last_camera`) chứng minh yếu hơn same-camera (không có gallery cam đích chắc chắn) → đã gate G4 với fallback `appearance_samples`; nếu gallery cam thiếu → reject `target_camera_gallery_missing` (log).
