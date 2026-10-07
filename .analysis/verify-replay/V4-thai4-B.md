# V4-current — `verify_cur_session_hiep_thai4` (builder-B, §4/§5)

Session PASS V1: 5764f, exit 0, `completed_replay`. Output =
`experiment_test/output/verify_cur_session_hiep_thai4/` · source
`experiment_test/output/session_hiep_thai4/` · log `.log` cùng-tên.

## Coverage actual — FULL
- Sheets: `sheets_cur/verify_cur_session_hiep_thai4/` — **237 sheets,
  ALL EYEBALLED 237/237** (không skipped).
- Cells: **2132 unique (cam,frame)** = **1066 cam1 + 1066 cam2**
  (uniform `--every 2.0` toàn-session + 26 windows = flags ±15 ∪
  key-events ±15 merged, dense **step-5**, `--window-pad 0` spans đã pad).
- Sheet→frame map: `sheets_cur/verify_cur_session_hiep_thai4/index.json`.
- Data-scan độc-lập toàn-bộ 5764f: IoU-pairs, slot↔gid conflicts,
  lid-state churn — 100% rows (không phụ-thuộc ảnh).

## Findings §5 (append vào ERRORS-B)
- **E-B-004 — DUPLICATE_TRACK, CONFIRMED, S2, HIGH** — cam1, cụm lid
  chồng bền (IoU>0.4): `lid1+2` 27f @317-343 · `lid9+10+11` triple
  @769-796 · `lid84+86` 22f @2537-2558 · `lid114+117` 26f @5736-5761 +
  nhiều cặp khác (59 cặp tổng cả 2 cam). Cùng xe vật-lý (IoU .24-.61),
  2-3 lid `coasting`/`frozen_ambiguous` đồng-thời. Ảnh: sheet_0102 cells
  (f2349-2375, 2×`coasting` chồng trên xe xanh-nhạt đầu-hàng-giữa);
  sheet_0028/29 (f769-796). cause_suspect: `tracking/association`
  (lineage split không gộp). `config_era_suspected=false`.
  identity_impact: UNVERIFIED (slots vẫn đúng — 0 conflict).
- **E-B-005 — DUPLICATE_TRACK, CONFIRMED, S2, HIGH** — cam2: `lid97+99`
  33f @3106-3138 · `lid97+98` 25f @3101-3125 · `lid36+37` 28f @1342-1369 ·
  `lid28+31` 24f @1208-1231 · `lid117+118` 24f @4601-4628 · `lid123+125`
  22f @4998-5019 · `lid15+17` 21f @878-898 + … Tổng 368 dup-frames cam2.
  Ảnh: sheet_0132-134 (f3100-3138), sheet_0199-200 (f4601-4641),
  sheet_0236-237 (f5736-5761 mép-phải). Cùng cơ-chế E-B-004.
- **E-B-006 — GHOST_TRACK, UNSURE, S3, MED** — boxes `frozen_ambiguous`/
  `coasting` trên nền-gỗ trống mép (góc phải-trên, mép-phải hàng-giữa,
  bottom-right) nhiều đoạn; sheet_0236 cell f5736-5761 có stacked labels
  mép-phải trên vùng-trống. Boundary/scope zone — giống E-B-003; cần A
  phán coast/frozen TTL cho vùng-trống. `config_era_suspected=false`.
- **E-B-007 — ID_FRAGMENT/NEW_ID, CONFIRMED, S2, MED** — xe xanh-nhạt
  di-chuyển/đỗ nhiều chỗ mang lid liên-tiếp {10,11,19,23,...} qua session
  (mỗi đoạn ổn trong cửa-sổ nhưng ID thay sau re-park/freeze cycles);
  khớp 228 cờ ID_FRAGMENT + scan. Churn ≠ harm; identity_impact
  UNVERIFIED.
- **Observed (không error-count)**:
  - `O-B-017` DATA_INTEGRITY capture gap f2442-43 (1 cờ) — EXPECTED/
    capture-side, không tracker-defect.
  - `O-B-018` xe đỗ-chéo qua 2 ô (sheet_0223 ~f5449-5481 cam2,
    `frozen_ambiguous`) — geometry merge-prone, đúng cơ-chế
    `merged_detection_frozen`; xe thật, ô không bind-sai.
  - `O-B-019` ghost walkway/mép (`coasting`/`frozen_ambiguous` trên
    nền-trống ngoài ô — sheets 087, 156-157, 236…) — boundary/scope,
    không slot-impact; overlap phần-lớn là biên.
  - `O-B-020` `local_track_lost`×57 qua session — phần-lớn parked-suspend
    /edge; khớp pattern `observations` rời list khi bound.
  - `O-B-021` slot integrity: **0 slot-2-gid đồng-thời, 0 gid-2-slot
    đồng-thời** trên toàn 5764f — PASS.

## Checklist §4
- [x] uniform ≥1f/2s/cam (every-2.0 cả hai cam trong cell set)
- [x] flagged windows ±15: 26/26 windows có ≥1 sheet đã xem
- [x] event dense-5: mọi window render step-5
- [x] unique (cam,frame) union ghi số thật + skip-count
- [x] old-record sheets không dùng cho verdict current
- [x] errors/observations tách; enum §5; repro bằng sheet+frame+cell
