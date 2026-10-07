# P0-a — Code-map merge/split + xác nhận claim MEGAPLAN §1 (builder-a, READ-ONLY)

Phạm vi đọc: `src/techgar/motion_tracker.py` (=mt), `occlusion_guard.py` (=og),
`cross_camera_manager.py` (=ccm), `prediction_writer.py` (=pw), `two_camera.py`
(=tc), `tests/`. Không sửa code. Mọi claim ghi verified/inferred/not-verified.

---

## 1. Luồng thật một frame (file:dòng)

`process_frame` mt:2204-2342:

1. `_predict_tracks()` mt:2228 → def mt:239-295. Kalman predict; track
   `suspended_*` bị bỏ qua (:243-246); invisible>0 → decay/stale nhánh
   :258-288 (`merged_freeze` giữ constant-velocity corridor :270-276).
2. `guard.prepare()` mt:2229-2232 (sau `if self.enable_occlusion_guard`) →
   og:55-100: xóa group hết hạn/mất member :59-65; eligible cần ≥3 clean
   samples + last_observed ≤ timeout :67-71; tạo group khi không overlap
   >20% (:85) và gap ≤ .4·diag (:88); hủy group inactive khi xa >3·diag :94-100.
3. `_detect()` mt:2233 → def mt:759. Trong vòng contour:
   `covering_group` mt:922 (og:102-121 — hợp nhất group thành ≥3 member
   :116-120) → `partition` mt:927 (og:150-189, chỉ khi `enable_watershed`,
   len==2, ngược lại `[]`) → fail thì `activate` mt:931 + detection
   `observation_kind='merged'` :932-939; thành công thì con
   `'watershed_provisional'` :945-953.
4. `_assign()` mt:2249 → def mt:1597-2007:
   - group-prediction override :1600-1605; reset `_ambiguous_detection_ids`,
     `_viable_pairs`, `_pair_metrics` :1606-1608; `_suppress_roi_edge_twins` :1609;
     `guard.annotate` :1610-1611 (og:140-148 → detection `ambiguous_merged`,
     `observation_kind='merged'`).
   - Ma trận cost khởi tạo **10.0** :1615; per-track loop :1618-1781: stale
     reacquire reject :1642-1651, stale-anchor :1654-1684,
     `split_margin_track_ids` add :1685-1686, gate `_association_gate`
     :1695 (trả 0.0 khi stale :1215-1219); gate cặp: distance :1706-1715,
     appearance :1717-1737, area-ratio :1738-1755 → cost 4 thành phần
     :1761-1766; `costs[row,col]=cost` + `_viable_pairs` + `_pair_metrics`
     :1767-1781.
   - `_mark_competing_assignments` :1785-1787 → def mt:1331-1458:
     viable_columns>1 bỏ qua :1365-1374; `cost_gap >= association_ambiguity_margin`
     và `not close_predictions` :1393; duplicate-lineage resolve
     :1430-1438; else `ambiguous_assignment=True`, costs cột =10.0,
     `last_ambiguous_kind='competition'` :1440-1450.
   - Merged/oversized freeze :1793-1906 (compatible rules :1809-1842,
     area ratio `merged_detection_area_ratio` :1853, single-track 1.30
     :1877 + elongation exception :1880-1889; set `ambiguous_merged`,
     `last_ambiguous_kind='merged'`, costs=10.0 :1891-1900).
   - `lapjv(costs, extend_cost=True, cost_limit=assignment_cost_limit)` :1908.
   - **Tầng defer per-track** :1914-1989 (`split_margin_track_ids`):
     `adjusted_margin = split_assignment_margin*(2-lineage_score)` :1921;
     `has_margin` :1922-1927; `clear_evidence` = margin + total≤0.12 +
     appearance≤0.08 + size≤0.20 + position≤0.20 :1939-1945;
     `!has_margin` → defer + `split_recovering` + event
     `split_assignment_deferred` :1946-1963; `recently_ambiguous &&
     !clear_evidence && streak+1 < ambiguous_recovery_frames` → defer +
     event `association_recovery_pending` :1964-1985; else accept :1986-1989.
   - **Tầng defer group**: `guard.gate_assignments` :1994-1999 →
     og:191-232 (atomic 2-member :200, `swapped-direct≥2*margin && direct<1.2`
     :206, streak≥3 :212 → recovered :213-221; ngược lại defer members +
     suppress `costs<1.0` cạnh tranh :222-230).
   - `appearance_trusted` finalize :2000-2006 (hist + kind 'detection' +
     area 0.65-1.6 + margin).
5. Apply matched :2250-2256 (`association_state='matched'` :2253,
   `assignment_cost` copy :2254-2256).
6. Unmatched loop :2257-2309: `prediction_age_s` :2262-2265 →
   `stale_prediction`/`velocity_confidence=0`; `frozen` :2268-2272 →
   `frozen_ambiguous`/`occluded_prediction` ngược lại `coasting`/`prediction`
   :2273-2280; `suppressed_roi_edge_twin` :2273-2277; roi_edge_starved
   :2282-2301; CONFIRMED→LOST :2302-2304; expire
   `> lost_track_ttl (frame) || _lost_beyond_ttl_seconds` :2305-2309 →
   pop :2311-2317.
7. Lọc unmatched detections :2320-2334 (echo-of-matched + viable-pair
   suppression) → birth loop :2335-2340: skip `occlusion_members` :2336,
   `_unresolved_merged_birth` :2338 (def :364-389, event
   `new_local_id_deferred_unresolved_merge` :384-388), `_create_or_reid`
   :2340 (def :2009-2069, `association_state='new_tentative'` :2036).
8. `_last_association_events.extend(guard.events)` :2341; consumer
   `pw:_identity_events` đọc `tracker.association_events` pw:381-398;
   property mt:2419-2420.

Cross-camera path (tc): `observable_tracks` mt:2376-2388 (TENTATIVE/CONFIRMED +
invisible==0, **không** lọc kind/state) → `sync_occluded_identities`
tc:2719-2725 → ccm:1189-1190 (set `_occluded_global_ids`) → merge-block
`identity_temporarily_occluded` ccm:1221-1226; `register_independent_tracks`
tc:2727-2729 → ccm:1192-1199 + `_independent_global_pairs` chặn merge
ccm:1212-1220. Binder lọc `observation_kind ∈ {occluded_prediction,
watershed_validated, watershed_provisional}` tc:726; nhánh lost GID cũng
kiểm kind ≠ occluded_prediction tc:2696.

---

## 2. `association_state` / `observation_kind` — chuỗi & nơi dùng

`association_state` (ghi trong mt): `matched` :2253 · `new_tentative` :2036 ·
`split_recovering` :1954 · `frozen_ambiguous` :2279 · `coasting` :2279 ·
`suppressed_roi_edge_twin` :2276 · `suspended_{reason}` :2180 (dynamic;
đọc prefix mt:243-246). Xuất JSON mt:2438-2440; `observable_tracks` không lọc
state; pw nhúng vào observation pw:303-304.

`observation_kind` (ghi): `'detection'` mt:327,1076 · `'merged'` mt:935,
og:148 · `'watershed_provisional'` mt:948 · `'watershed_validated'` og:218 ·
`'occluded_prediction'` og:135, mt:2106,2280 · `'prediction'` mt:2277,2280.
Đọc: `_apply_detection` copy mt:2166 + `appearance_trusted` :2151; ccm
`_has_fresh_detection`/`_is_confirmed` chặn kind≠'detection' ccm:2250-2251;
binder tc:726; pw:328.

Tập phân loại CCM (PHẢI cập nhật khi thêm state mới — §1.2.7):
- `_is_confirmed` ccm:2238 → khối state :2257-2262 gồm 6: `coasting,
  split_recovering, occluded_prediction, watershed_provisional,
  frozen_ambiguous, ambiguous_merged` (+ kind≠detection :2250-2251).
- `_is_allocatable` ccm:2269 → khối :2275-2279 gồm 5 (KHÔNG `coasting`).
- `_has_fresh_detection` kiểm `observation_kind` riêng (test khóa
  test_cross_camera_manager.py:190-201: merged/prediction/occluded_prediction/
  watershed_provisional đều bị chặn).
- ⚠️ 3 chuỗi `occluded_prediction`/`watershed_provisional`/`ambiguous_merged`
  trong 2 set CCM thực tế không bao giờ được gán vào `association_state`
  (chúng là observation_kind/detection flag) — mục dự phòng, không có hại;
  nhưng state mới `split_occluded`/`split_partial_resolved` phải được thêm
  vào **cả hai** set + kiểm chứng `_has_fresh_detection` (kind mới) + tc:726
  + tc:2696. §1.2.7 viết như một danh sách duy nhất — thực tế có ≥4 điểm
  phân loại cần đụng.

---

## 3. Invariant do test khóa (có phải ràng buộc cứng thiết kế mới?)

`test_stability_occlusion.py`:
- `:105` preflight freeze cả hai trước size/hist gate — **cứng**.
- `:121` atomic 2→2 + streak 3 frame (skip frame reset streak) — **cứng**;
  mâu thuẫn trực tiếp với partial commit → nếu P3 thay hành vi phải sửa
  có lý do + giữ cờ-tắt.
- `:133` expiry không bị ambiguous pixel làm mới — **cứng** (§1.2.8 yêu cầu).
- `:172` watershed_validated chỉ update position, không appearance/parking —
  **cứng**.
- `:184` clean size dùng history — **cứng**.
- `:190` kind≠detection không allocatable — **cứng**.
- `:196` expired-group blob không mint ID (qua `independent_pairs`) — **cứng**.
- `:212` occluded GID chặn dormant-recovery — **cứng**.
- `:232` activate lặp không reset streak — **cứng**.
- `:255` independent local pair không rebind echo — **cứng**.

`test_motion_tracker_multiscale.py`:
- `:245` fragment chồng nhau không đóng băng 1 xe — **cứng**.
- `:276` hai xe proven tranh 1 blob → `ambiguous_assignment` — **cứng** (S9).
- `:515`/`:598`/`(:802)` merged/oversized freeze 1 hoặc 2 track — **cứng**.
- `:542` hai xe giữ ID sau split — **mục tiêu giữ**.
- `:618` ambiguous split coast không swap/không fragment mới — **cứng**.
- `:828` stale track không được đóng băng detection của xe sống — **cứng**.
- `:987`/`:1002`/`:1036` TTL hệ số giây (1.5×merged window, max(1.0)) —
  **cứng**, ảnh hưởng §1.2.8.
- `:1099`/`:1126`/`:1148` elongation-by-motion exception — **cứng**.

`test_gid_*` liên quan: fixtures dùng `ambiguous_merged` (roi_edge :58);
không test nào khóa trực tiếp 2 tập state ccm:2257-2262/2275-2279 — **vùng
mềm có thể mở rộng**, nhưng test :190 (stability) khóa hành vi tương đương.
`test_cross_camera_manager.py` `:196` khóa `_has_fresh_detection` kind-set.

## 4. Xác nhận / bác claim §1

### §1.1 (đúng) — tất cả VERIFIED, có chỉnh dòng:

| Claim | Kết quả |
|---|---|
| Atomic 2→2, og:191-232 | ✅ verified og:200/206/212/222-231; test :121 |
| Defer → frozen + occluded_prediction; unmatched → stale_prediction | ✅ og:135-138 + mt:2262-2265,2268-2280 (megaplan ghi 2252-2290; thực 2257-2308) |
| expires_at = last_clean+timeout og:119-130 | ✅ verified — set tại og:120 (group merge ≥3) & og:128-130 (activate); timeout=merged_reacquire_max_seconds=3.0 mt:69, wiring mt:229; xóa hết hạn og:59-65; test :133 |
| watershed_provisional→validated, appearance không tin | ✅ og:217-219 |
| Birth veto :370-390 | ✅ def mt:364-389 (body từ :370); event :384-388 |
| Morphology tự nối | ✅ OPEN3x3 mt:559, dilate5x5×2 :560, CLOSE :568-573; final OPEN :817, CLOSE :822-826 — join kernel/lần qua params `motion_join_kernel_size=5`/`iterations=1` mt:90-91,194-198 |

### §1.2 (thiếu/chỉnh) — VERIFIED với ghi chú:

1. **Hai tầng defer** ✅: tầng group og:191-232 + tầng per-track
   mt:1914-1989 + tiền xử lý `_mark_competing_assignments` **mt:1331-1458**
   (megaplan ghi "~1380-1500" — hàm bắt đầu sớm hơn). **Bổ sung megaplan
   thiếu**: `split_assignment_margin` (mt:82, default 0.08) KHÔNG được CLI
   wire trong tc:2366-2397 — tham số riêng `association_ambiguity_margin`
   (mt:80) được wire `--motion-ambiguity-margin` tc:1871-1875 default 0.08 →
   tc:2394; khi None nó fallback = split_assignment_margin mt:174-180 → hiện
   hai margin trùng 0.08 "tình cờ". Tương tự `merged_reacquire_max_seconds`,
   `lost_track_ttl_seconds`, `min/max_reacquire_area_ratio` đều KHÔNG có CLI
   flag (chỉ ctor). `ambiguous_recovery_frames` có wire tc:1877-1880→2395.
   ⇒ §1.2.5 calibration phải thêm wiring nếu muốn tune runtime.
2. **`_pair_metrics`** ✅: mt:1769-1781, đúng 7 field
   (position/iou/appearance/size/total/lost_seconds/association_source), chỉ
   cho cặp viable (trong `if` gate-chain, costs mặc định 10.0 sentinel
   :1615). Megaplan "1769-1780" ~đúng.
4. **Group >2** ✅: `partition` trả `[]` khi len!=2 og:153-154;
   `covering_group` hợp nhất ≥3 member og:116-120 + `prepare` chỉ tạo pair
   :73-91. Group 3-member: gate vẫn defer (`valid=False` vì len!=2 og:200)
   → hành vi hiện tại = đóng băng tới hết hạn, KHÔNG có đường tách.
6. **`references` chỉ (w,h)** ✅ og:36-42,90 — nhưng lưu ý `center()`
   og:44-53 đã tái tạo vận tốc live từ `measurement_observations`; cái thiếu
   là *snapshot pre-merge đóng băng* (ordering/direction cố định), vì sample
   ngừng cập nhật khi ambiguous (kind≠detection không ghi `_remember_clean`
   — inferred từ mt:327 chỉ chạy trong apply-detection).
8. **Timeout thang** ✅: `lost_track_ttl`=90 frame mt:37,98 + duration
   `lost_track_ttl_seconds = max(1.0, 1.5·merged_reacquire)=4.5s` mt:149-153,
   `_lost_beyond_ttl_seconds` mt:2189-2201, điểm expire mt:2305-2309;
   `sync_occluded_identities` tc:**2719-2725** (megaplan ~2722 ✓) →
   ccm:1189-1190 → chặn merge ccm:1221-1226. Invariant "pixel mờ không kéo
   dài group" khóa cứng bởi test :133 — recovery window mới chỉ được bắt
   đầu sau tách, như megaplan nói.
7. **Cross-camera sets** ✅ nhưng **megaplan thiếu điểm chạm**: ngoài list
   tại 2257-2262/2275-2279 còn `_has_fresh_detection` (kind, test :196) +
   tc:726 binder + tc:2696 — §1.2.7 phải mở rộng phạm vi đụng.
- Cờ `enable_multi_hypothesis_recovery`: **not verified tồn tại** — grep 0
  kết quả trong src/, two_camera, tests → đúng là cờ mới phải thêm (ctor +
  CLI), mặc định TẮT.

## 5. Điểm móc tối thiểu cho hypothesis engine (không viết code)

- `OcclusionGuard.gate_assignments(assignments, costs, track_ids, tracks,
  detections, margin)` og:191 — điểm quyết định group; bọc bằng
  `evaluate_hypotheses(group, costs, track_ids, detections, evidence) ->
  list[HypothesisDecision]` (hàm thuần, mới trong cùng file) gọi tại
  shadow-mode ngay trước `valid=...` :206; khi cờ tắt giữ nguyên return cũ.
- Evidence nguồn có sẵn: `group.references` (w,h), `track.measurement_observations`,
  `clean_observations`, `_pair_metrics`, `costs` (sentinel 10.0 = "không khả
  dĩ" cho cặp không viable), `detections[i]['hist'/'spatial_appearance'/
  'observation_kind'/'appearance_trusted']`, `partition` regions (og:150-189).
- Per-track tier hook: khối mt:1914-1989 — hypothesis commit phải đặt
  `ambiguous_clear_streak`/bypass `has_margin` có kiểm soát, hoặc partial
  commit đi qua đường riêng thay vì nhờ streak.
- Birth suppression: `occlusion_members` skip mt:2336 + `_unresolved_merged_birth`
  mt:2338 — hypothesis "non-member" (§1.2.3) móc ở đây để cho phép B(b)
  sinh ID mới trong khi vẫn defer member thật.
- Cờ: tham số ctor `enable_multi_hypothesis_recovery` mt:__init__ (:35-100
  vùng params) + CLI `--multi-hypothesis-recovery` tc:~1809 + wiring
  tc:2366-2397. State mới thêm vào ccm:2257-2262 + 2275-2279 (+_has_fresh_detection
  nếu kind mới) + tc:726/2696 — chỉ sau lead duyệt (§4).

## 6. Lỗ hổng bổ sung so với §1 (ngoài mục được giao)

- Unmatched-detection filter mt:2322-2334 (echo-of-matched + viable-pair
  suppression) là **tầng thứ ba** ngăn fragment mới — §1.2.1 nói "hai tầng
  defer"; thực tế cơ chế ngăn sinh ID gồm ≥3 lớp (competition mark, per-track
  defer, gate group + echo/viable/owner birth suppression :2335-2340).
- `detection['ambiguous_assignment']` (competition, :1440) tách biệt
  `ambiguous_merged` (group) — hypothesis engine phải đọc cả hai.
- `association_state` CCM lists chứa 3 chuỗi chưa-từng-gán (dự phòng) —
  không phải lỗi nhưng phản ánh tập state đã "rủi ro lan rộng"; naming
  chuẩn cho state mới nên kiểm soát trong một constant thay vì literal rải rác.

## 7. Bổ sung: semantics event/episode (đối chiếu P0-b, LEAD yêu cầu)

B báo ~50% episode "implicit" (chỉ expired/recovered, không opened) và đa số
0–1 frame. Đối chiếu code — **VERIFIED** cơ chế:

- `occlusion_group_opened` phát ra DUY NHẤT tại og:131 trong `activate()`,
  chặn bởi `if not group.active` :124.
- Group có **hai nguồn tạo**: (a) `prepare()` og:90 — `active=False`,
  `expires_at=inf` (dataclass default :22), **không event** — đây là
  *watch-list*: hai xe sạch đứng gần, chưa hề merge; (b) `covering_group()`
  og:119-120 — union member-set ≥3 được tạo trực tiếp `active=True` ⇒
  `activate()` sau đó bỏ qua nhánh phát `opened` ⇒ **group ≥3 không bao giờ
  có opened**.
- `occlusion_group_expired` og:61 bắn cho MỌI group khi `member ∉ tracks`
  HOẶC `now > expires_at` — kể cả watch-group chưa-bao-giờ-active (member
  bị xóa vì xe rời/hết TTL). Tức `expired` ≠ "merge thất bại".
- `occlusion_group_recovered` og:220 yêu cầu `len==2` qua `valid` og:200 ⇒
  group ≥3 **không-thể recover theo thiết kế** — terminal duy nhất là expire.
- Xóa-im-lặng: watch-group bị xóa không event tại og:94-100 (tách xa >3·diag)
  ⇒ episode hoàn toàn vô-hình với log; B's `none` còn gồm group còn sống khi
  log dừng (B §5 tự ghi — verified: không có event "closed" nào khác).

**Suy luận cho B (inferred từ cơ chế, chưa đo trên log):**
- Implicit-episode gồm 2 loại trộn: (i) watch-group member-biến-mất — *không
  phải merge*, chỉ là proximity; (ii) ≥3-member covering group — merge thật
  nhưng không-thể-recover theo spec hiện tại (§1.2.4).
- ⇒ Tỷ lệ 73.8% `expired` **không được đọc thẳng thành** "tỷ lệ lỗi identity
  recovery": chỉ tập-con "2-member active group quá-hạn" mới là tín hiệu
  chẩn-đoán §19. Episode 0–1 frame phù hợp watch-group/tách-sớm hơn là
  merge-thất-bại.
- Đề xuất cho merge_split_report (owner B): tách outcome theo
  {watch-only | active-2-expired | ≥3-expired | recovered} — log hiện có
  `opened` vắng + member-count trong `local_track_ids` của event terminal
  đủ phân loại; không cần đổi code tracker.

## 8. Cross-check P0-c-scenarios (LEAD yêu cầu, ≤10 dòng kết luận)

- **S2 — VERIFIED**: `recovering` chỉ đếm "selected ≥ alternative + 2·margin"
  og:204-212 — agnostic chiều direct/swapped; group không lưu hypothesis
  (`last_frame` duy nhất og:21,209) ⇒ winner lắc mỗi frame vẫn commit sau
  streak 3. C đúng.
- **S5 — mechanism verified, con số unit-only**: gate không có cap từng cặp,
  chỉ `direct<1.2` og:206 ⇒ pair .95 chấp nhận được *nếu* được đưa vào — nhưng
  `_assign` không bao giờ tạo pair .95 (`lapjv cost_limit=0.90` mt:1908,
  :72/:158) ⇒ pipeline: member không pair → `valid=False` → defer-all.
  Cơ chế "non-member cướp ID" vẫn thật với cost ≤.90 (vd .85+.30=1.15<1.2).
- **S6 — claim C quá tay (inferred-inaccurate)**: post-expiry group-tier chết
  (atomicity, suppress costs<1.0, opened/recovered path), NHƯNG per-track
  tier vẫn sống: member bị frozen ⇒ `invisible>0` hoặc `recent-merged` ⇒
  `split_margin_track_ids` mt:1685-86 ⇒ margin gate + `ambiguous_clear_streak`
  (:1964-1985) vẫn bắt. "Assign tự do ngay frame đầu" chỉ đúng khi
  `clear_evidence` pass (total≤0.12+appearance≤0.08+size≤0.20+pos≤0.20
  :1939-1945). Birth-veto `independent_pairs` vẫn tồn tại (:383).
- **S8 — VERIFIED**: `partition` [] khi len!=2 og:153; `valid=False` →
  defer-all → expire-only (§7). Quirk watch-group `expires_at=inf` (og:22
  default, chỉ activate/covering set hạn :120,:130) → pair-group inactive
  sống sót sau supergroup-expire; chết khi member-del :60 hoặc silent-delete
  :94-100 — rác thiết kế thật, ghi cho P1.
- Kết luận: C đúng S2/S8; S5 cần ghi "≤.90 pipeline-reachable"; S6 cần sửa
  thành "free assign chỉ khi clear_evidence, ngược lại tier-2 defer tiếp".
