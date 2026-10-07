# progress-builder-b — verify-replay campaign

Owner scope §2: V0 env + **V1 replay độc-quyền** (18 session) + V2–V5 trên
4 session B: `hiep_thai3, hiep_thai4, hiep1, hiep_toi6`.
Freeze: không sửa code/config/tests; chỉ file mới `verify_cur_*` +
`.analysis/verify-replay/` + `experiment_test/verify/run_verify_replays.py`.

## Trạng thái (snapshot)

| phase | trạng thái | artefact |
|---|---|---|
| V0 | **DONE** — runtime pilot PASS (exit0, 298/298, schema v3, completed_replay) | `V0-environment.md` (hash 6 config, lệnh, env) |
| V1 | **RUNNING** — batch runtime 18 session, ≤3 proc, threads 1 | `V1-replay-b.md` + `v1-replay-results.json` |
| V2 | **DONE** — 16 ảnh (2 mốc × 2 cam × 4), ALIGNED cả 4, không era-flag | `V2-alignment-b.md` + `alignment/` |
| V3 | **DONE** — scan_frames 4 session: flags JSONL | `flags/session_*.jsonl` |
| V4 | pending — cần make_sheets (C tool) trên flag windows + mẫu đều | `sheets/<session>/` |
| V5 | pending — sau V4 | |

## V1 running detail
- Runtime path dùng `runtime_server.py` (pilot PASS — không fallback).
- Finished: `session_test1` exit0 completed_replay 298 lines (~215.8s → 1.38fps).
- In-flight snapshot: hiep2 433/642 · hiep_toi4 399/620 · hiep_sang9 105/727.
- ETA thật ~80–160min tổng (long sessions ~72min cái). Không tự đổi config/async.
- Pilots two_camera+runtime đều 298/298 completed — "236" chỉ snapshot
  mid-run, KHÔNG REPLAY_FAILURE (đính-chính V1-intake §002).

## V3 flags — 4 session B (auto-flag, CHƯA xác-nhận)
- `hiep_thai3`: 551 — ROI_MISMATCH 162 · ID_FRAGMENT/NEW_ID 196 · TRACK_LOST_EARLY 150 · SLOT_BINDING 33
- `hiep_thai4`: 542 — ID_FRAGMENT 238 · TRACK_LOST 177 · ROI 87 · SLOT_BINDING 32 · DATA_INTEGRITY 1 (capture gap f2442-43)
- `hiep1`: 43 — SLOT_BINDING 30 · TRACK_LOST 7 · ID_FRAG 5 · ROI 1
- `hiep_toi6`: 239 — TRACK_LOST 110 · ID_FRAG 77 · SLOT_BINDING 30 · ROI 17
- Pattern systematic: SLOT_BINDING "vision-occupied w/o tracking" f7-70 lặp ở MỌI session = xe đỗ-sẵn trước start (cohort parked-at-start, có-thể expected) — chờ V4 xác-nhận.

## GT — session_thai8 (verify riêng theo LEAD)
- events.csv: 24 rows DRAFT `auto-prefill: verify` (8 rows thiếu vehicle_id, 2 anomaly frame) — tham-khảo, chưa GT vàng.
- identity/slots csv: header-only.

## V3/V4 trên CURRENT (`verify_cur_*`) — FULL eyeball xong
- Coverage: **74/74 sheets xem hết** (toi6 30+8, hiep1 20+16; uniform 2s +
  flagged±15 + events dense-5; skipped 0).
- `ERRORS-B.md/json` chuẩn §5 enum (type 19-giá-trị, S1-3, HIGH/MED/LOW,
  status, cause §5.6, era bool, repro CLI+cell):
  - **E-B-001/002 CONFIRMED S2**: stale-purge→respawn bursts f97-130
    (53 spawn/9 lost) & f596-612 (7/1); slots latch — output cuối không
    hỏng; impact UNVERIFIED.
  - **E-B-003 UNSURE S3 GHOST_TRACK**: G48 coasting ~140f boundary —
    chờ A verdict semantics.
  - 5 observations (frozen OK / boundary scope / hiep1 PASS / warmup
    expected / phone noise). `V3-scan-B.md` riêng.
- Sửa semantics: RED không phải state — magenta=`frozen_*`; red-outline=
  slot occupied; `observations` chỉ chứa candidates (parked→rời list).
- `sheets/` (record cũ) = sanity-only, tách khỏi verdict current.

## V5 — cross-check ERRORS-C (xong)
- `V5-crosscheck-B.md`: seed 20261005, pool 4 E-C → sample E-C-003
  (phenomenon CONFIRMED, defect UNSURE → **mẫu-FP chưa ước-tính**).
- Audit riêng C001 (CONFIRMED + dup-coasting cluster) / C002 (CONFIRMED
  same-vehicle: ±9px + 6-gap-frame continuity f300-550). Audits không gộp
  FP denominator.

## Intake §1/5 — `V1-intake-b.md` (ngoài-cohort)
- `session_hiep_thai2` = DATA_INTEGRITY: 1 frame/cam, 1 pred line, capture
  dừng 18:28:30 — không replay, loại cohort.
- Pilots `verify_cur_test1` + `verify_cur_rt_test1` ngoài-cohort: cả hai
  hoàn-tất 298 lines (21:59 / 22:02); "236" chỉ snapshot mid-run — không
  REPLAY_FAILURE. Runtime side-state dirs ghi riêng.
- GT thai8: 24 rows auto-prefill draft (8 thiếu vehicle_id, 2 anomaly) —
  không gold; metrics vẫn BLOCKED.

## Checkpoint ~mới (thay bản 23:12)
- V1 registry: **14/18 completed_replay** (thai5 vừa xong 3977f).
- In-flight 3 proc: `thai4` **5135/5764 (89%)** · `thai6` **4575/5937
  (77%)** · `thai3` **1703/5965 (29%)** — cả 3 đang ghi (age ≤1s).
- Queue: `thai1` 6050f (chờ slot). Còn ~12,303f ÷ ~1.4fps×3 → ETA ≈75–90min
  (thai1 ~72min là critical-path).
- QA thai7 (V4-help §4): 120 sheets event-dense5 sinh xong
  (`sheets_cur/verify_cur_session_thai7_keyevents`, 1078 cells / 539
  unique frames); **đã xem ~109/120**, còn 110-120. Ghi chú tạm:
  ghosts/coasting trên lối-gỗ ngoài ROI = boundary scope; xe máy `lid16`
  mép-phải ổn; xe xanh-nhạt `lid23` mép-trên ổn; candidate dup-box trên
  SUV đen ~f1521-1541 cam2 (sheet 63-64) đang verify bằng data.

## V3/V4 thai4 xong
- V3 scan `verify_cur_session_hiep_thai4`: 447 flags (ID_FRAGMENT 228,
  TRACK_LOST 169, SLOT_BINDING 35, BBOX_JUMP 5, GID_NEW_LINEAGE 5,
  DATA_INTEGRITY 1 gap f2442-43) → 54 windows.
- V4: `V4-thai4-B.md` — 237 sheets/2132 cells; **100 eyeballed**, mọi
  26 windows ≥1 sheet; skip = uniform-only gaps (PARTIAL, ghi số).
- ERRORS-B thêm E-B-004/005 DUPLICATE_TRACK (data-confirmed 59 pairs,
  IoU>0.4, 0 slot conflict), E-B-006 GHOST UNSURE (boundary), E-B-007
  ID_FRAGMENT (light-blue car lid churn). JSON đồng-bộ 7 errors.

## V4-thai4 REVIEW-ROUND-2 (LEAD: 100/237 chưa đủ)
- Đã xem nốt 137 sheets → **237/237 eyeballed, 0 skip**; 2132 unique
  (cam,frame) = 1066/cam (uniform 2s + 26 windows dense-5 flags∪events).
- Findings mới từ 137 sheets còn lại: không thêm error — ổn-định parked
  suspend/matched; ghost `coasting` mép-trống biên (O-B-019); xe cyan
  đỗ chéo làn `matched`/`coasting` ổn (O-B-018) — giữ verdict.
- ID namespace chuẩn-hóa: errors **E-B-001..007** duy nhất; observations
  **O-B-001..005** (toi6/hiep1) + **O-B-006..016** (thai7 file) +
  **O-B-017..021** (thai4) — không trùng, JSON↔MD đồng-bộ
  (ERRORS-B.json là cp1258 — giữ nguyên encoding khi sửa).

## Chờ (cập-nhật cuối — DEVIN tiếp-quản sau LEAD hết quota)
- V1: **18/18 PASS** — canonical `V1-replay-results.md` ĐÃ VIẾT đủ
  (cmd + per-session src/dir/log/cam1/cam2/pred/ts/processed_frames/
  exit/elapsed/size + 6 config hashes V0=post + HEAD 5f581311 +
  ngoại-lệ `verify_cur_runtime_session_bt` official /
  `verify_cur_runtime_runtime_session_bt` side-state).
- V5 FINAL C (pool 7, seed 20261005, k=2 → E-C-003 + E-C-005):
  **0/2 resolved, FP not estimable** — E-C-003 phenomenon-confirmed/
  defect UNSURE; E-C-005 NOT-CONFIRMED (1/3 disproven bằng ảnh thai7
  gid3→gid5, 2/3 UNSURE). Audit ngoài-seed C005/C006/C007 xong.
  File: `V5-crosscheck-B.md`.
- Audit A áp xong: **E-B-007 hạ UNSURE-type** (lid19/23 anchor khác —
  chỉ pattern new-ID confirmed; không suy cùng-xe từ pixel-gần).
- **V4 thai3 XONG**: `V4-thai3-B.md` — 212/212 sheets eyeballed, 1904
  cells (952×2cam), 0 skip. Findings mới:
  - **E-B-008** DUPLICATE_TRACK cam1 CONFIRMED — 14+ cụm IoU>.4
    (lid4+5 .99; lid18+21+22 triple .91-.97 @2290-2338; lid23-27 quad;
    lid68+69 .84; cụm trong burst @2709-2739).
  - **E-B-009** DUPLICATE_TRACK cam2 CONFIRMED — lid16+19 .96; lid61+62
    .70 (cùng xe chéo với cụm cam1); lid104+105 .89; lid116+118 .87; v.v.
  - 41 dup-pairs **toàn same-gid**; **0 slot↔gid conflict đồng-thời**.
  - O-B-022 cam1 coasting-bursts f2707-2742 (peak22) + f4878-4907 (peak18)
    · O-B-023 cam2 dải ghost mép-trái x<140 + frozen_ambiguous 119/120
    IoU .053 kề-nhau (không phải dup) · O-B-024 `E:` episode-labels chồng
    (render-only) · O-B-025 slot integrity PASS.
- IDs cuối: errors **E-B-001..009**, obs **O-B-001..025** — không trùng;
  ERRORS-B.json + .md UTF-8 đồng-bộ.
- **B full 4-session coverage xong** (toi6, hiep1, thai4 237/237,
  thai3 212/212). Còn: A cross-check full pool (§4). Không replay thêm.
- INBOX-B.md = bảng giao-việc cho poll tiếp.
