# peer-b-by-c-megaplan.md — Review B dossier (6 thẻ) + arbitration

**Status: DONE** — review bản B mtime `2026-10-04 18:29:38 +0700`,
33,790 bytes, md5 `2107dad3a995`. Mọi tham số ưu-tiên LEAD giao đã đối
chiếu trực tiếp source phiên này; không sửa dossier/code/web của người khác.

## Verdict tổng: **6/6 PASS** (không blocker; 3 mục mở nhỏ B tự khai — §C)

---

## §A. ARBITRATION — `recovery_max_expand_ratio` (A↔B) — **B đúng**

| Lớp | Giá trị | File:dòng |
|---|---|---|
| Class default | 0.45 | `slot_vehicle_binder.py:228` |
| Argparse runtime | **0.85** | `two_camera.py:1890-1898` |
| Callsite | `args.slot_recovery_max_expand_ratio` | `two_camera.py:2331` |

Công thức: `_token_radius` (`svb:603-609`) `ratio = 0.05 + progress×(0.85−0.05)`
→ `radius = slot_diagonal × ratio`, ramp qua `recovery_expand_seconds=1.0s`.
Scale polygon `1+2×ratio` chỉ ở `recovery_priority_regions` (`svb:2653-2668`)
→ **1.10→2.70** runtime (comment :2664 — chỉ wake sensitive detector).
Gate thật (chuẩn xác sau re-check B): reject khi `signed_distance < −radius`
(dấu +trong/−ngoài, `pointPolygonTest` measureDist) — inner ramped `radius`
tại `svb:3241`; outer hard `signed < −max_radius` (0.85·diag) tại
`svb:2988`,`:3237`; token-create `−initial_radius` (0.05·diag) tại `:508`.
Đã trả A sửa F3/ROI; B thêm phân-biệt 2 biểu-diễn — **xác nhận wakeup
polygon ≠ signed-distance gate** [code].

## §B. Verdict từng thẻ (bản hiện tại)

### Thẻ 1 — ReID histogram/gallery — **PASS**
Verify: descriptor 416-D + weights `td:18-78`; `compare_tracklets` `td:308`
(trọng số 0.50/0.20/0.20/0.10); `--tracklet-max-samples 12`/`interval 3`
`tc:1965-1966`; `--global-gallery-max-samples 24` `tc:1967`; handoff
`0.45`/`0.82` `tc:1928`/`:1929-1936`; dormant `0.60` `tc:1964`; binder
recovery `0.62` `tc:1900-1905`; **`use_deep_reid` raise ValueError
`ccm:390-396`** — flag tồn-tại-nhưng-bị-cấm là phát-hiện đúng và có giá-trị.

### Thẻ 2 — Predictive handoff — **PASS**
Verify: sig `_upsert_handoff :2572`·`_predicted_world :2744`·`_entry_depth
:2776`·`_direction_cosine :2823`·`_candidate_cost :2831`·`_match_pending_
handoffs :3442`; cost `0.55·res/25+0.30·app+0.10·size+0.05·dir ≤0.92`
`:3017`; LAPJV `cost_limit=0.92` `:3615` + `margin=0.08` `:3622`; appearance
3-tier `hard=min(0.45,thr)` / soft-overlap `≤max(hard,min(0.60,0.82))=0.60`
+`bind_eligible=False` / adaptive `residual≤max(strong×1.25,match×0.50)=7.5`
`→relaxed 0.82` (`:2935-2975`) — B mô-tả đúng từng nhánh; reject
`"appearance"` `:2990`; streak 1/2/3 `:3658-3667`; `edge_margin=40` ctor
`:146` + entry_limit `:2899-2908`; `handoff_ttl 45`/`lookahead 16`/
`defer 8`/`min_dir_cos 0.25` `tc:1926/:1949/:1944-1948/:1951`.
**Fix .83>.82 đã đóng**: storyboard k3 giờ reject-tại-gate, không vào ma trận.

### Thẻ 3 — Homography/shared-map — **PASS**
`load_calibration` cite đã sửa đúng `tc:284-341` (trước ghi nhầm `ccm:287-304`
— vùng đó là init `exit_zones`). Verify gates `tc:287-320`, anchor runtime
`bbox_center` (`cfg:1461`→`tc:2160-2161`→ctor) vs class `bottom_center`
`ccm:168` — đúng phân-biệt default-vs-production.

### Thẻ 4 — Trajectory memory — **PASS**
`tm.py` ctor `:56-68` **exact**: `history 2.0 / min_obs 3 / threshold 0.78 /
margin 0.12 / max_samples 240`; score weights `0.35/0.25/0.15/0.10/0.10/0.05`
`tm:395-402`; LAPJV `cost_limit=0.22` (=1−0.78) `ccm:6115-6117`; CLI
`--trajectory-history-seconds 2.0` `tc:1969-1971`; call-order traj-trước-
token `tc:2728` vs recovery `tc:2764` — khớp pipeline-order C.

### Thẻ 5 — Dormant + departure token — **PASS**
`notify_track_lost` `ccm:1064-1080`→`_set_identity_dormant` ✓; retention
args `60s/12s/180f` `tc:1952/:1954-1960/:1962`; same-cam limit **12s/36f**
verify: `_moving_retention_ratio = 12/60 = 0.2` (`ccm:249-252`) → `180×0.2=36f`
(`:4680-4684`) — con-số lẻ nhưng đúng-toán; established ×4 `:4644-4649`;
ROI-edge ×2 `:4685-4691`; `_reid_window` evidence=`max(defer 8, min_obs 5)=8`,
else `ttl 45` `:4357-4371`; token `0.05→0.85×diag`/`1.0s` — **khớp arbitration
§A**; appearance `class 0.55 svb:231 → CLI 0.62`; `evidence_frames=3` svb:230
(clamp ≥2 :284); size `(0.40,2.50)` svb:234; relaxed `0.70`/overlap `0.25`
svb:232/235; dormant LAPJV `0.95` `:5526`.

### Thẻ 6 — Conflict/merge/probation — **PASS**
`_is_provisional` `:509-523` + `merge_probation_frames=5` `:173`/`:280`;
`_merge_global_ids :1201` canonical=min `:1258-1259`; collision-guard
`:1082`; resolvers `:3125`/`:3226` + `_cross_merge_would_conflict :3088` +
`_bound_handoff_merge_allowed :3376` tồn-tại đúng-dòng; divergence `×2/×3`
`:3278-3279` — **fix bounds đã đóng**: giờ `9.27/13.90cm` (2×/3×4.634),
storyboard dùng 11cm ∈ vùng-mơ-hồ đúng (trước 18cm rơi ngoài → mâu-thuẫn);
2-frame evidence `:3306-3312`; `_new_global_id_ready :2337` +
`new_identity_*` `tc:1980-1995`/`ccm:163-165` — **không còn "unresolved"**.

### §0b resolved-params — **PASS + hiệu-chỉnh phía C**
B: median **9.27cm** → resolved `15 / 25 / 16.22 / 4.63`. Replicate đúng
`median_slot_length` (`tc:395-413`, `cv2.minAreaRect` max-side) trên cùng
cfg: **median = 9.268cm** (n=60) → derived `16.218 / 25.486 / 16.218 / 4.634`
→ resolved `15.0 / 25.0 / 16.218 / 4.634` — **B đúng; con-số C cũ 9.202
sai** (tôi đo bằng max-edge polygon thay `minAreaRect` — khác hàm).
Script reproduce (chạy từ `D:\TechGar2`):
```python
import json, numpy as np, cv2
p = json.load(open('backend/main_detect/config/two_camera.shared_cm_01.json'))
lens=[]
for g in (p['parking_slots_world'].values() if isinstance(p['parking_slots_world'],dict) else [p['parking_slots_world']]):
    for s in g or []:
        poly=s.get('polygon')
        if poly and len(poly)>=3:
            _,(w,h),_ = cv2.minAreaRect(np.asarray(poly,dtype=np.float32))
            lens.append(max(w,h))
med=float(np.median(lens))   # → 9.268
```
→ chuẩn ghi chung: `median 9.27cm`, resolved `dormant 16.22cm`, `dup 4.63cm`.

## §C. Còn mở — B tự khai, C đồng-ý không-block
- `parking_recovery_trajectory_evidence` `ccm:1536-1595` — competing-
  reservation chưa rà từng-dòng (B gắn `[chưa xác minh]` đúng-quy-tắc).
- `_reconcile_dormant_duplicates :6854` — đọc đầu, body chưa rà.
- `update_all_tracks` tail `:7238-7492` — order qua grep-call, số-dòng xấp-xỉ.

## §D. Ranh-giới C↔B (đối-chiếu hai dossier)
- Departure-token: B (N8→N10 lifecycle/recovery) vs C T1-2 (tạo-token
  `prepare_predeparture_tokens` + binder gates) — **không chồng, bổ-sung**;
  cùng con-số 0.05→0.85 sau arbitration.
- `vision_primary` C vs "reservation-authoritative" B thẻ-5 — nhất-quán:
  vision còn occupied → binder giữ vehicle_id sticky; manager chỉ nhìn
  GID-claim, không quyết occupied.
- Order `observe_trajectories (tc:2728) → token-recovery (tc:2764) →
  update_all_tracks (tc:2779)` — khớp pipeline-order C.
