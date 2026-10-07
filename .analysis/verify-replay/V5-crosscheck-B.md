# V5-crosscheck-B — kiểm chéo findings của C (độc-lập)

Seed **20261005** · pool eligible = 4 E-C errors (`E-C-001..004`; U1/U2 là
UNSURE — không claim lỗi nên ngoài pool) · `ceil(20%×4)=1` ·
`random.Random(20261005).sample` → **E-C-003**.
Audit thêm ngoài-sample theo LEAD: **E-C-001, E-C-002** (cùng-xe-vật-lý?).
Nguồn xem độc-lập: `sheets/verify_cur_*` của C + `predictions.jsonl`
verify_cur (data-level), KHÔNG chỉ đọc mô-tả C.

## Per-finding verdict

### E-C-003 (sampled) · ROI_MISMATCH toi5 cam1 f241-318 — phenomenon CONFIRMED, defect **UNSURE**
- Xem độc-lập `sheets/verify_cur_session_hiep_toi5/sheet_0011.jpg` +
  `sheet_0013.jpg`: SUV đen góc-trái-trên có box matched bám đúng xe,
  anchor (tracker_center) rơi ngoài polygon ROI vàng — cờ đúng sự-kiện.
- Tracking vẫn matched ổn-định → không thấy hệ-quả hỏng; **defect status
  = UNSURE** (đồng C's UNCERTAIN). Theo rule: finding UNSURE **không vào
  denominator FP** → mẫu ngẫu-nhiên = 1 UNSURE ⇒ **FP chưa ước-tính được**.

### E-C-001 (audit thêm) · ID_FRAGMENT/NEW_ID sang8 cam2 f129-889 — **CONFIRMED**
- Data: lid-cluster BR-zone cam2 f885-910 — **4 lids cùng-lúc**:
  `lid41` (1055,694 matched→coasting, gid2) **+** `lid43`(1004,611) +
  `lid44`(1007,627) + `lid45`(1025,705) tất-cả `coasting`, gói ~20-90px.
  → không chỉ re-id churn: **duplicate coasting tracks chồng vị-trí**
  tồn-tại ~30f (nghiêm-trọng hơn mô-tả C: DUPLICATE_TRACK xen ID_FRAGMENT).
- Còn lids 14,16,18,26,28,32 (f2-37) = startup tentative trùng BR cars
  (warmup cohort), không tính churn.
- Verdict: **CONFIRMED** — boundary re-id churn thật + duplicate-coasting
  cluster; identity_impact UNVERIFIED (GT rỗng).

### E-C-002 (audit thêm) · GID_NEW_LINEAGE_LOSS sang8 f561-600 — **CONFIRMED**
- Data trajectory: `lid35/gid1` cam2 f167→~301 kết-thúc tại **(397,118)**;
  gap tracking ~294f (~12s); `lid40/gid3` xuất-hiện f595 tại **(388,119)**
  — cùng vị-trí ±9px.
- **Gap-density check** (bổ-sung theo LEAD): render riêng
  `sheets_cur/xcheck_c002_gap/sheet_0001.jpg` — cam2 f300,350,400,450,500,
  550 → xe đen vẫn đỗ chỗ đó **liên-tục qua 6 mốc trong gap** (không rời
  khung, không xe-khác thay chỗ). Vị-trí ±9px + presence liên-tục ⇒
  **same physical vehicle**; lineage gid1→gid3 là loss thật.
- Phân-biệt LEAD: chứng-minh **cùng-xe** (6-sample continuity + 9px), KHÔNG
  chứng-minh *identity loss có harm cuối* — slot occupancy không đổi ⇒
  impact UNVERIFIED. Nếu yêu-cầu dense hơn nữa (mọi frame trong gap) thì
  giữ lưu-ý.

## FP denominator theo type (sửa theo LEAD)

- Mẫu ngẫu-nhiên = **1 finding (E-C-003) với verdict UNSURE** → UNSURE không
  tính FP ⇒ **mẫu-FP CHƯA ước-tính được** (0 resolved trong mẫu; cần thêm
  mẫu hoặc C đủ findings CONFIRMED để có denominator).
- Audit ngoài-sample (C001/C002) = kiểm-tra định-tính riêng, **không gộp**
  vào mẫu-FP: cả hai CONFIRMED (không phản-bác C).
- Data check `E-C-004` không thuộc mẫu → chưa cross-check.

---

# V5 FINAL ROUND (sau C freeze — pool mới, 2026-10-06)

## Pool cuối (C freeze)
- Eligible = **7 findings E-C-001..007** (`ERRORS-C.md/json` frozen;
  U1-U4 UNSURE **ngoài pool**; non_errors_observed ngoài).
- Seed **20261005**, k = ceil(20% × 7) = **2** → `random.Random(20261005)
  .sample(pool,2)` = **[E-C-003, E-C-005]** (deterministic, repro được).

## Mẫu ngẫu-nhiên (random-sample verdicts)

| ID | verdict | FP-denom? | ghi-chú |
|---|---|---|---|
| E-C-003 | phenomenon CONFIRMED / defect UNSURE (giữ round-1) | **không** (UNCERTAIN) | SUV anchor ngoài polygon mép-ROI toi5 cam1 — có-thể anchor-convention; chờ A/LEAD phán expected-vs-defect |
| E-C-005 | **NOT-CONFIRMED** — 1/3 instance disproven (khác-xe, có ảnh), 2/3 UNSURE | **không** (còn UNSURE component — cùng rule C003) | chi-tiết audit dưới |

**Mẫu-resolved = 0/2** (cả hai còn UNSURE) ⇒ **sample FP chưa ước-tính
được** từ mẫu này — cần A/LEAD quyết hoặc thêm bằng-chứng.

## Audit E-C-005 HANDOFF_ERROR — cùng xe vật-lý hay near-heuristic?

Kiểm bằng **world-space homography** (`config/two_camera.shared_cm_01.json`,
pixel→world cm) + timeline + ảnh độc-lập. Lưu-ý: khoảng-cách world +
gap-thời-gian **một-mình không chứng-minh khác-xe** (xe có-thể di-chuyển)
— chỉ chốt "khác-xe" khi có ảnh vật-cũ còn-đỗ đồng-thời:

| instance | gid cũ → gid mới | last-pos (world cm) | first-pos (world cm) | ~dist | gap | verdict |
|---|---|---|---|---|---|---|
| thai7 f761-772 | gid3 (cam2) → gid5 (cam1) | (7.1, 78.6) @f424 | (-4.9, -18.1) @f772 | ~97 cm | ~348f (14s) | **khác xe (có bằng-chứng ảnh)**: xe gid3 (teal mép-trên cam2) vẫn đỗ-yên chỗ-cũ trong sheets f766-786 trong khi gid5 chạy cam1 → 2 xe khác nhau |
| thai8 f1377-1389 | gid3 (cam2) → gid5 (cam1) | (20.3, 77.4) @f242 | (-6.7, -17.2) @f1389 | ~97 cm | ~1147f (46s) | **UNSURE**: lid41 coasting chết f281; spot cam2 (1181,251) trống obs ở f1351-1551 nhưng sheet_0062 không đủ phân-giải để chốt xe-còn-hay-đã-rời — giữ UNSURE, cần render crop dày hoặc GT |
| thai7 f2084-2112 | gid1 → gid7 (cả cam2) | (31.0, 14.1) @f1414 | (3.3, 5.9) @f2105 | ~29 cm | ~700f (28s) | **UNSURE** — lid83 xe mới vào từ mép-trên cam2 (sheet_0094); gid1 reject `trajectory_stable_wrong_direction` (dir=0.008); không chứng-minh 2-phía |

- **Runtime KHÔNG merge mù**: `dormant_reid_rejected` cho gid1/gid2 với
  reason world-space (`position` 31.2>25.9 limit, `same_camera_stale`,
  `trajectory_stable_wrong_direction`) — hợp-lý nếu xe khác nhau.
- Cờ "new gid near gid vanished" của scanner so pixel/stale-position —
  không chiếu world ⇒ artifact khả-dĩ; ít-nhất 1 case bị bác bằng ảnh.
- **Kết-luận B**: E-C-005 defect-claim "GID lineage mất khi qua cam"
  **không được chứng-minh** — 1/3 instance bị bác (khác-xe có ảnh),
  2/3 UNSURE thiếu bằng-chứng độc-lập. Boundary lid-churn thật có-thể
  tồn-tại (phạm-vi E-C-001) nhưng handoff-same-vehicle như phát-biểu =
  chưa chứng-minh. Không nâng harm thiếu GT; không kết-luận chỉ từ
  position/distance.

## Audit E-C-006 (ghost) vs E-C-007 (fixture) — lifecycle/type

- **C006 ghost (vùng TRỐNG)**: coasting-track trên sàn/nền, lifespan
  **44–238f (~1.8–9.5s)** rồi chết — vd bt cam2 lid54 span 238f @(903,328),
  lid47 214f @(399,116), lid41 205f @(872,120); **không lid nào trong số
  này còn sống @EOF** → transient stale-prediction, có TTL tự-hồi.
- **C007 fixture (vật thật non-vehicle)**: object tồn-tại ⇒ spawn track
  mới lặp-lại/persist — bt EOF còn sống **6 track** (`cam1 lid21/22`,
  `cam2 lid64/65/66/67`, 21–30 obs mỗi) = cột gỗ/dây cố-định (khớp A
  E-ABT-2). Khác cơ-chế ghost: detection lặp trên vật thật, không decay.
- → C006 vs C007 **type-khác-nhau xác-nhận**: ghost = prediction-residue
  decay; fixture = re-detection bền trên object có-thật. C006 CONFIRMED
  (có ghost thật trên vùng trống, tự-die); harm không chứng-minh
  (không slot/identity impact thấy) → severity S2 của C hợp-lý-giữ.

## Trạng-thái
- Mẫu final (7-pool, k=2): E-C-003 UNSURE + E-C-005 NOT-CONFIRMED
  (còn UNSURE components) ⇒ **0/2 resolved → mẫu FP chưa ước-tính**.
- Audit thêm ngoài-mẫu: C006 CONFIRMED-type (ghost≠fixture) · C005
  same-vehicle: 1/3 disproven (thai7 gid3→5, ảnh xe-còn-đỗ), 2/3 UNSURE.
  Không gộp vào FP fraction.
- Chờ A kiểm-chéo lại pool đầy-đủ theo cùng rule.
