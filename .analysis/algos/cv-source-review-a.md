# CV Source Review A — Peer-review dossier `builder-b.md` (8 ID tracking/binder/identity)

**Phạm vi**: `prediction-age-decay` (B2), `association-distance-gate` (B3), `track-lifecycle` (B9), `stop-dwell-detection` (D5), `sticky-id-bind-release` (D6), `parking-episode-state` (D11), `global-id-allocation` (E6), `global-identity-lifecycle` (E10).
**Phương pháp**: đọc source hiện tại tại `backend/main_detect/src/techgar/`, đối chiếu từng claim "code" + expected values trong dossier; 5 ID occupancy (C1–C5) **không** review (owner C đang viết replacement).
**Ký hiệu verdict**:
- `[OK]` — khớp code, giữ nguyên.
- `[demo-allowed]` — đơn giản hoá có thể giữ **nếu** đánh dấu `[sim-omits]`/`[sim]` rõ; hiện đang thiếu/thiếu rõ.
- `[claim-wrong]` — mô tả ngược implementation hoặc expected value sai → phải sửa trước khi build web.

Path dossier: `.analysis/algos/builder-b.md` (tham chiếu `:dòng` theo file này).
Path source viết relative từ `D:/TechGar2`.

---

## B2 `prediction-age-decay` — dossier :423-440

**Source**: `backend/main_detect/src/techgar/motion_tracker.py:239-317`.

- `[claim-wrong]` Vai trò/pseudocode "age > limit → không còn đủ tin để gán / `predict_ok = age ≤ limit`". Code (:266-269): quá limit → `point = measured_point`, `prediction_source="stale_prediction"`, `velocity_confidence=0` — dự đoán **vẫn tồn tại** làm anchor tại điểm đo cuối (chính là đầu vào nhánh B8 reacquire), không phải "không gán được". Edge-cases dòng :434 ("rơi vào nhánh anchor B8") đã đúng nhưng mâu thuẫn vai trò + pseudocode.
- `[claim-wrong]` Sample B (:438): mô tả merged-freeze vẫn decay `v=4·e^(−2)=0.541`. Code (:270-276): `merged_freeze` → `point = raw_point` **Kalman thô, không decay**, `confidence=1.0` — ngược hẳn. Lưu ý freeze chỉ áp trong nhánh `consecutive_invisible_count > 0` và `last_ambiguous_kind=="merged"`.
- `[demo-allowed]` Công thức `v·e^(−age/τ)`: code (:263-278) decay **vector displacement** `measured + (raw−measured)·e^(−age/0.25)` (nội suy vị trí), không phải scale một vận tốc `v`; `velocity_confidence` giảm **tuyến tính** `1 − age/limit` (:280-287), không exponential. Sample A numbers `[4, 2.68, 1.79, 1.2]` khớp `4·e^(−age/0.25)` → giữ được nếu ghi rõ "decay quãng đi ngoại suy, confidence giảm linear — demo gộp minh hoạ".
- `[demo-allowed]` `extended_limit`: thật là `max(0.40, merged_reacquire_max_seconds=3.0)` chỉ khi `last_ambiguous_kind=="merged"` + recent freeze (:307-317). Sample B `extended_limit:1.0` là demo param — ghi `~`.
- `[demo-allowed]` Ref `Code:` thiếu phần decay thật: thêm `:263-288` vào dòng :425.

**Patch đề xuất**: vai trò → "age > limit → prediction đóng băng thành anchor điểm đo cuối (`stale_prediction`, confidence 0) — vẫn phục vụ reacquire B8"; pseudocode 3 nhánh (visible→raw / merged-freeze→raw / else→interpolated / over-limit→anchor); Sample B expected → `point=Kalman raw, confidence=1.0` (không decay).

---

## B3 `association-distance-gate` — dossier :442-460

**Source**: `backend/main_detect/src/techgar/motion_tracker.py:1193-1244` (+ defaults `velocity_gate_scale=2.0`, `velocity_gate_size_ratio=1.0`, `velocity_gate_min_observations=3`, ceiling `max_distance=180`, `max_prediction_age_seconds=0.40`).

- `[claim-wrong]` Công thức `gate = base + v·(1 + k·inv) + c·extent` (:449) **không tồn tại trong code**. Công thức thật:
  ```
  nếu invisible>0 và pred_age > limit(0.40s)  → gate = 0
  nếu total_visible_count < 3                → gate = ceiling 180
  budget = speed·(invisible+1)·2.0 + 1.0·extent   # extent = max(w,h)
  floor  = max(24, 1.0·extent)
  gate   = min(180, max(floor, budget))
  ```
  Không có hạng `base`; term vận tốc là `speed·(inv+1)·scale` (nhân, không phải `1+k·inv`); thiếu floor `max(24,·)` và clamp `min(ceiling, max(floor,budget))` — cấu trúc bounded chính là cốt thuật toán.
- `[claim-wrong]` Sample A expected `42.5` (:457): theo công thức thật với input demo (speed=5, inv=3, extent=10): `budget=5·4·2+10=50`, `floor=24` → `gate=min(180,50)=50` ≠ 42.5.
- `[claim-wrong]` Dòng "Thực tế vs mô phỏng: giữ công thức `base + v·(1+k·inv) + c·extent`" (:456) claim khớp code nhưng không — phải viết lại theo floor/budget/ceiling.
- `[OK]` Hai nhánh đúng: `age>limit → 0` và `track mới (obs<3) → ceiling` — giữ.

**Patch đề xuất**: thay pseudocode + "thực tế vs mô phỏng" bằng công thức thật (4 bước trên); Sample A expected → `min(180, max(24, 50)) = 50` (hoặc chọn input minh hoạ floor: speed=0.5 → `gate=max(24, 10+…)≈24-26`).

---

## B9 `track-lifecycle` — dossier :556-575

**Source**: `backend/main_detect/src/techgar/vehicle_tracker.py:20-23` (`TrackStatus`); `motion_tracker.py:2023` (birth), `:2096-2170` (`_apply_detection` + `:2170` re-confirm), `:2071-2094` (`_is_confirmable`), `:2226-2342` (`process_frame` lost/expire), `:2175-2203` (`suspend_track`).

- `[claim-wrong]` Title + pseudocode trình `expired` như **trạng thái thứ 4**. Enum chỉ có `TENTATIVE/CONFIRMED/LOST` — expiry là **xoá khỏi `_tracks`** + (non-tentative) đưa vào `_exited_tracks` và emit 1 lần trong `expired_tracks` output (:2311-2317). Sample A `…expired(3), expired]` (:572) sai: sau khi bị pop, track không còn "ở trạng thái expired" ở frame sau — nên ghi `removed/emitted`.
- `[claim-wrong]` Confirm gate `obs ≥ confirm_min && size/hist đủ` (:563) — code `_is_confirmable` (:2071-2094): `total_visible_count ≥ min_visible_count` (default **3**, :36) **và** `displacement từ origin ≥ min_confirm_displacement` (default **12.0**, :43); priority track dùng `priority_min_visible_count=2` + `priority_observation_count≥2` + `priority_min_confirm_displacement=3.0`. Không có điều kiện "size/hist".
- `[demo-allowed]` Thiếu nghịch lý quan trọng: track **TENTATIVE không bao giờ thành LOST** — unmatched tentative chỉ bị pop lặng lẽ khi hết TTL, không emit (:2302-2317). Edge-case :569 nói "chết lặng lẽ" nhưng pseudocode vẽ `lost` cho mọi track unmatched — cần 1 dòng "chỉ CONFIRMED→LOST".
- `[OK]` LOST→CONFIRMED khi được match lại (:2170 tái đánh giá `_is_confirmable` mỗi `_apply_detection`) — khớp edge-case dossier.
- `[demo-allowed]` `suspend_track` lưu riêng qua `association_state` string ("suspended_*") — song song với enum status, không phải state thứ 5; dossier nên ghi đây là trường riêng (B7/E6 blocklist đọc nó).

**Patch đề xuất**: đổi FSM thành `tentative → confirmed → lost → [removed→exited_tracks]`; confirm gate → `visible_count ≥ 3 && ‖p−origin‖ ≥ 12px` (priority: `obs≥2/priority_obs≥2/disp≥3`); Sample A expected `[confirmed, lost(1), lost(2), removed, —]`; thêm ghi chú `expired` chỉ là sự kiện emit, `association_state` là trường string riêng.

---

## D5 `stop-dwell-detection` — dossier :818-840

**Source**: `backend/main_detect/src/techgar/slot_vehicle_binder.py:1316-1355` (`_is_stopped`), `:1357-1447` (`_advance_strong_overlap`, `_strong_overlap_is_stable`, `_strong_overlap_max_gap_seconds`).

- `[claim-wrong]` Dossier refs cả `_advance_strong_overlap`/`_strong_overlap_is_stable` nhưng pseudocode dùng `r95` + `drift=‖last−first‖` — đó là công thức của **`_is_stopped`**. Đường strong-overlap (:1408-1447) dùng metric khác: `inlier_ratio = mean(dist ≤ stationary_radius) ≥ 0.60` + `robust_drift` giữa **median của 2 cụm endpoints** (`endpoint_count = max(2, min(n//3, 5))`) — **không có r95**. Storyboard "một chấm kéo xa → verdict lật" (:839) **sai với strong path**: 1 outlier/6 mẫu → inlier 5/6 ≈ 0.83 ≥ 0.60 → vẫn stable (code comment :1440-1441 nói rõ thiết kế chịu outlier).
- `[claim-wrong]` Ngưỡng `r95_max=1.0`, `drift_max=0.5` trình như param tuyệt đối — code dùng **tỷ lệ theo bbox diagonal**: `max(3.0, stationary_radius_ratio·diag)` và `max(5.0, stationary_drift_ratio·diag)` (:1351-1353, :1433, :1446). Phải gắn nhãn demo-fixed hoặc đổi sample theo diag.
- `[claim-wrong]` Expected values sai số: Sample A `r95≈0.17` → tính theo `np.percentile(radius,95)` trên 6 bán kính `{0,0.1,0.1,0.141,0.2,0.2}` = **0.20**; Sample B `r95≈1.04` → với outlier (9,9), radius max ≈5.66, p95 nội suy ≈ **4.29** (verdict `false` vẫn đúng, số sai).
- `[demo-allowed]` Thiếu gate: `duration ≥ stop_seconds·0.90` (:1338) và `same_slot_ratio ≥ 0.80` (:1340-1341); strong path yêu cầu `duration ≥ stop_seconds + stop_commit_grace_seconds` (:1399-1403). `max_gap_s` **derived** `max(0.25, 2·stop_seconds/max(min_stop_samples,2))` (:1365-1369), không phải param `[~config]` như Input mô tả.
- `[OK]` Gap-reset chuỗi (:824→code :1380-1388), vision_primary fresh-suffix (:1324-1334), output `(stopped, duration_ms)` (:835-839 → :1337-1355 span-based, `int(duration·1000)` — không phải `now−first_stable` như pseudocode 4).

**Patch đề xuất**: tách 2 pseudocode — `_is_stopped` (r95+drift+duration·0.90+same_slot 0.80) và `_advance/_is_stable` (inlier 0.60 + robust-endpoints drift + duration ≥ stop+grace); ghi ngưỡng `= max(floor, ratio·bbox_diag)`; sửa expected Sample A `r95=0.20`, Sample B `r95≈4.29` (hoặc đổi sang sample inlier_ratio: 2/6 outlier → `4/6=0.67≥0.60` vẫn stable, 3/6 → `0.5<0.60` fail — đúng tinh thần "tolerate sparse outliers"); sửa storyboard claim 1-outlier chỉ đúng với `_is_stopped`.

---

## D6 `sticky-id-bind-release` — dossier :842-859

**Source**: `slot_vehicle_binder.py:1919-1981` (`_bind_vehicle`), `:1982-2046` (`_release_vehicle`), `:2501-2557` (vision-empty → token+detach), `:2595-2604` (sticky clear khi dual-free), `:1566-1634` (`_restore_false_empty_token`).

- `[claim-wrong]` **Cơ chế cốt lõi sai**: "`exit_pending` đếm vision-empty liên tiếp trước khi release" + Sample A "3 empty liên tiếp → release v0" + Sample B "streak đứt → không release" (:846,:850,:853,:856-857). Code **không có bộ đếm empty-streak nào gate release**: `exit_pending` chỉ là **label** `tracking_state`/`movement_state` (:2003,:2011). Thực tế: vision_primary — **vision-empty đầu tiên** đã `_create_departure_token(confirmed_empty=True)` + `_detach_binding_for_departure` → owner bị gỡ ngay (:2508-2545); `token.empty_observations ≥ 2` chỉ bật cờ audit `confirmed_empty` (:1484), không quyết định release. Chống flick nằm ở `_restore_false_empty_token` (:1566-1634): occupied quay lại trước khi token consumed → **restore owner** — đó là cơ chế "streak đứt" thật, nhưng qua token-rollback chứ không countdown.
- `[demo-allowed]` Legacy path: clear khi `!vision_occupied && !tracking_occupied` — điều kiện AND **một lần**, không cần lặp (:2595-2604).
- `[demo-allowed]` Thiếu lý do reject thứ 2: owner khác gid + `!vision_occupied` → reject `competing_vehicle` (:1937-1944) — challenger bị từ chối **trong cả hai nhánh**, chỉ khác reason; dossier chỉ nêu `sticky_id_conflict`.
- `[OK]` `sticky_id_conflict` khi `vision_occupied` (:1929-1936) ✓; bind → mở episode (`binder_binding_confirmed`, :1953-1955) ✓; release reasons (`left_roi`/`reassigned`) ✓.

**Patch đề xuất**: viết lại vai trò/pseudocode quanh sticky-keep + departure-token: `release = tracking mất → tracking_state="exit_pending" (giữ owner nếu vision còn occupied) → vision-empty đầu tiên → token+detach (D7) → occupied quay lại → restore`; Sample A → "t1 reject sticky_id_conflict; t2 (tracker lost) → exit_pending giữ owner; t4 vision empty → detach ngay + token"; Sample B → "empty→occupied sớm → `_restore_false_empty_token` → owner phục hồi, không release" (cùng kết luận, cơ chế khác); bỏ tham số `exit_pending:3` hoặc gắn `[sim]` rõ không có trong code.

---

## D11 `parking-episode-state` — dossier :943-961

**Source**: `slot_vehicle_binder.py:888-944` (`_open_parking_episode`), `:945-977` (`_transition_parking_episode`), `:1533-1565` (`_detach_binding_for_departure`), `:1566-1634` (restore), `:1906-1908`, `:2618-2620`, `:434/:477`, `:3713` (released callers).

- `[claim-wrong]` FSM `open → parked → departing → closed` (:946,:958): **hai trong bốn tên sai**. Thật: episode sinh ra **ngay `"parked"`** (:912 — không có state `open`; `{"pending","parked"}` ở :900 chỉ là tập dung thừa cho dedupe, không nơi nào gán `"pending"`), chuyển `parked → departing` (release: `released:{reason}` :1987 / `vision_confirmed_empty` :1544), terminal = **`"released"`** (pop khỏi `_episode_by_slot` vào log `_parking_episodes` :966-968 — `"closed"` không tồn tại trong file).
- `[claim-wrong]` Edge "xe không stopped (lướt) → episode open ngắn → close, không bao giờ parked" (:955) — bất khả thi: episode chỉ tồn tại từ `_bind_vehicle` và sinh ở `parked`.
- `[OK]` Restore `departing → parked` không đóng episode — khớp `false_empty_restored` (:1609-1614, :1623-1628); dedupe rebind cùng owner → trả episode cũ (:897-905) — hỗ trợ narrative "không double-session" ✓.
- `[demo-allowed]` Các lý do `released` khác dossier chưa kể: `replaced` (:934), `parking_slot_removed` (:2619), `reservation_rejected` (:434/:477/:3713) — nên liệt kê như ví dụ, `[sim-omits]` chi tiết.

**Patch đề xuất**: FSM → `parked → departing → released` (+ `departing→parked` restore); Sample A expected `parked(1) → departing(6) → released(11)`; Sample B `parked → departing → parked`; storyboard đổi nhãn nút `closed→released`; bỏ edge "open ngắn".

---

## E6 `global-id-allocation` — dossier :1062-1079

**Source**: `cross_camera_manager.py:2238-2240` (`_is_confirmed`), `:2269-2281` (`_is_allocatable`), `:2337-2417` (`_new_global_id_ready`), `:399-402` (`_allocate_global_id`), defaults :163-165 (`obs_min=5`, `unusual_size_obs=12`, `disp_ratio=0.15`).

- `[claim-wrong]` "`obs ≥ obs_min` **và/hoặc** `displacement ≥ disp_min`" (:1069) — code là chuỗi AND bắt buộc: `_is_allocatable` → `obs ≥ 5` → `disp ≥ max(6.0, 0.15·diagonal)` — **cả hai phải đạt**, không có "hoặc". Samples đứng (cả hai đều thoả AND) nhưng câu chữ dạy sai điều kiện.
- `[demo-allowed]` `_is_allocatable` thật gồm: `confirmed` **và** `observation_kind == 'detection'` **và** `association_state ∉ {split_recovering, occluded_prediction, watershed_provisional, frozen_ambiguous, ambiguous_merged}` (:2269-2280). Dossier "confirmed + chưa có GID" thiếu 2 điều kiện; "chưa có GID" không nằm trong hàm (caller kiểm bind map).
- `[demo-allowed]` `obs` thật là `fragment_visible_count` (per-fragment, :2352) — legacy tracker không có field này → pass (:2353-2355); `disp_min` không phải hằng: `max(6.0, 0.15·hypot(w,h))` (:2371-2380). Sample `disp_min:6` trùng sàn — ghi `[sim]`.
- `[demo-allowed]` Gate thứ 3 (trusted size refs, `size_distance>0.65` + `(obs<12 || disp<0.6·diag)` → defer :2393-2416) đã được `[sim-omits]` "size-reference trust" ✓.
- `[demo-allowed]` "provisional track chưa có GID → không bind được slot/handoff" (:1065): gate này chỉ chặn **mint GID mới** — docstring :2344-2348 nói rõ GID cũ vẫn bind tentative qua handoff/ReID. Nên chuyển thành "không được cấp GID mới".

**Patch đề xuất**: sửa pseudocode thành `confirmed && detection-kind && state∉blocklist → fragment_obs ≥ 5 && disp ≥ max(6, 0.15·diag)`; đổi "và/hoặc"→"và"; bổ sung `[sim-omits]` observation_kind/blocklist/priority-override; giữ samples (đổi chú thích `disp_min` là sàn 6).

---

## E10 `global-identity-lifecycle` — dossier :1141-1160

**Source**: `cross_camera_manager.py:534-689` (observe/dormant/exited), `:6995-7073` (`_refresh_identity_states`), `:7560-7610` (exit + cleanup→expired), `:5657` (revive→active), `:987-988` (reservation mất → dormant).

- `[claim-wrong]` Pseudocode 4 (:1150) "`hết retention → exited`" — sai terminal: quá retention trong `cleanup()` → **`expired`** (:7606-7610); `exited` chỉ khi track expire **trong exit-zone** (:676, :7569-7572). Hai trạng thái kết thúc phân biệt — dossier gộp làm một.
- `[claim-wrong]` "parked là cờ reservation song song" (:1144,:1151): `identity.state` bị **ghi đè thành `"parked"`/`"recovery_pending"`** từ `_parked_reservations` (:7061) và `"parking_verification_pending"` từ provisional holds (:7066) — đó là **giá trị state thật**, dormant-clock bị clear; không phải cờ phụ trên dormant.
- `[demo-allowed]` Thiếu trong FSM: `expired`, `parking_verification_pending`; handoff-vs-dormant chọn theo `canonical gid ∈ _handoffs` (:645-648, :7073) ✓ dossier mô tả đúng.
- `[OK]` Revive dormant→active (:5657) ✓; `exited`/`expired` bị skip trong refresh (:7057) → không tự revive ✓.

**Patch đề xuất**: FSM → `active → handoff|dormant → expired` (TTL) và `active → exited` (exit-zone), song song `parked|recovery_pending|parking_verification_pending` ghi đè state khi có reservation/hold; Sample B giữ `exit_zone→exited`; thêm sample "`lost` kéo dài quá retention → `expired` (khác `exited`)"; sửa "parked giữ dormant" → "state bị override thành `parked`, dormant clock reset".

---

## Tổng kết & ưu tiên

| ID | Verdict | Core |
|---|---|---|
| B2 | 2× claim-wrong | stale→anchor (không "invalid"); merged-freeze→raw Kalman |
| B3 | 3× claim-wrong | công thức floor/budget/ceiling bị thay bằng `base+v·(1+k·inv)`; expected 42.5→50 |
| B9 | 2× claim-wrong | `expired` không phải enum state; confirm gate = obs+displacement (không size/hist) |
| D5 | 3× claim-wrong | strong path = inlier_ratio 0.60 + endpoints median (không r95); ngưỡng theo bbox-diag; expected r95 sai |
| D6 | 1× claim-wrong lớn | không có countdown empty-streak; release = token+detach/restore (D7) |
| D11 | 2× claim-wrong | states thật `parked/departing/released` (không `open`/`closed`) |
| E6 | 1× claim-wrong | "và/hoặc" → AND; thiếu observation_kind + association_state blocklist |
| E10 | 2× claim-wrong | `exited` (exit-zone) ≠ `expired` (TTL); `parked`/`recovery_pending`/`parking_verification_pending` là state thật |

**Ưu tiên sửa (dạy sai mechanism)**: D6, D11, B3, D5, E10, B2, B9 → E6 (chủ yếu câu chữ). D6 và D11 ăn vào FSM/contract mà consumer (builder-c/session) đối chiếu — sửa trước.

**Không thuộc phạm vi**: C1–C5 occupancy (owner C đang viết replacement), E1–E5/E7–E9 (chưa duyệt vòng này).

**Giới hạn review**: chỉ đọc tĩnh, không chạy backend/test; expected D5 tính tay theo `np.percentile` linear (chưa chạy numpy — ghi `[giả định method=linear]`, cần chạy lại nếu dossier muốn claim `[đã chạy]`); `GlobalIdentityState` field `members` ở dossier :1152 chưa verify từng field.
