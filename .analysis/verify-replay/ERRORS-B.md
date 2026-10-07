# ERRORS-B — phán-quyết trên output CURRENT (verify_cur_*)

§5 đầy-đủ: type ∈ 19-enum · severity S1/S2/S3 · confidence HIGH/MED/LOW ·
status CONFIRMED/UNSURE · cause_suspect ∈ §5.6 (11 nhóm) +
`config_era_suspected` bool · repro = full CLI + cell ordinal/frame.
OBSERVED/PASS/EXPECTED = **observations**, không tính error count.
**Churn ≠ identity loss** — identity_impact UNVERIFIED mọi nơi (GT rỗng).

Semantics verified: `render_gid_frames.py:37-58` — green=matched,
yellow=coasting, cyan=new_tentative, **magenta=frozen_***, grey=unknown;
không tồn-tại state đỏ (đỏ = slot-occupied polygon).
`observations[]` = active candidates; parked→bound→rời list.

## Coverage (unique cam×frame union, index.json)

| session | uniform+flags | events dense-5 | UNION | /total frames |
|---|---|---|---|---|
| `verify_cur_session_hiep_toi6` | 266 (30/30) | 72 (8/8) | **316** | 865 |
| `verify_cur_session_hiep1` | 180 (20/20) | 138 (16/16) | **250** | 1049 |

Skipped 0 window / 0 sheet. Uniform 1f/2s/cam · flags pad±15 · events step-5.

## ERRORS

### E-B-001 · `ID_FRAGMENT/NEW_ID` · **CONFIRMED** · S2 · confidence HIGH
- **vị-trí**: `verify_cur_session_hiep_toi6` · both (burst cam2) ·
  f97–130 (≈3.9–5.2s @25fps)
- **mô-tả**: stale-association purge → mass respawn: **53 tentative**
  (`cam2:29…48+`) + **9 lost** (`cam1:9`; `cam2:47,57,58,60,62,76,77,81`);
  nobs 7→46 @f110. Occupancy slots latch ~29-30 (output cuối không hỏng).
- **bằng-chứng**: `toi6_events/sheet_0002.jpg` cells cam1/cam2 f97,102,107,
  112 + `sheet_0003.jpg` f122,127 · events: `association_rejected_stale_
  track`×439, `…_stale_prediction`×365, `stale_prediction_replaced`×75,
  `track_frozen_stationary`×75, `provisional_trajectory_forgotten`×46.
- **repro**: `python experiment_test\verify\make_sheets.py --session
  experiment_test\output\verify_cur_session_hiep_toi6 --video-dir
  experiment_test\output\session_hiep_toi6 --cam both --frames "97-130"`
- **cause_suspect**: `tracking/assignment` · `config_era_suspected=false`
  (V2 ALIGNED)
- **identity_impact**: UNVERIFIED.

### E-B-002 · `ID_FRAGMENT/NEW_ID` · **CONFIRMED** · S2 · confidence HIGH
- **vị-trí**: toi6 · cam1 burst + cam2 lost · f596–612 (≈23.8–24.5s)
- **mô-tả**: burst thứ-2 cùng signature — 7 tentative (`cam1:25–31`),
  1 lost (`cam2:85`); `rejected_stale_track`×78, `frozen_stationary`×15,
  `handoff_rejected`×2, `dormant_reid_rejected`×3.
- **bằng-chứng/repro**: `toi6_events/sheet_0005.jpg` f601-611;
  `--frames "596-612"`
- **cause_suspect**: `tracking/assignment` · era=false
- **identity_impact**: UNVERIFIED.

### E-B-003 · `GHOST_TRACK` · **UNSURE** · S3 · confidence MED
- **vị-trí**: toi6 · cam1 · ~f611–751 (~24–30s sustained)
- **mô-tả**: `G48 coasting` ~140f trên xe nửa-ngoài-ROI (boundary);
  không phán theo màu — coasting = giữ prediction không re-match.
- **bằng-chứng/repro**: `toi6/sheet_0024…0030.jpg` cells cam1;
  `--cam 1 --frames "611-751"`
- **cause_suspect**: `local-lifecycle` (thiếu coast-TTL? hoặc boundary
  legit) · era=false — **chờ A phán coast/occlusion semantics**.
- **identity_impact**: UNVERIFIED.

## OBSERVATIONS (không error count)
- O-B-001 `frozen_ambiguous`/`frozen_vp` f648-653 — OBSERVED_OK, mechanism
  đúng thiết-kế, hồi parked f658+ (`toi6_events/sheet_0007.jpg`).
- O-B-002 boundary tentative churn f269-433 — OBSERVED_SCOPE, nguồn
  ROI_MISMATCH 50; `suppressed_roi_edge_twin` active f400/f700.
- O-B-003 hiep1 handoff windows — PASS, G9 gid nhất-quán 2 cams.
- O-B-004 `SLOT_BINDING_ERROR` f7-67 — EXPECTED (parked-at-start warmup).
- O-B-005 phone-noise mép ROI cam1 f46+ — OBSERVED.

## Tóm-tắt §5
- Errors: **2 CONFIRMED** (S2, `ID_FRAGMENT/NEW_ID`) + **1 UNSURE**
  (S3, `GHOST_TRACK`). Observations: 5.
- Coverage: 316+250 unique (cam,frame) trên 865+1049 frames; mẫu 2s+flags
  ±15+events step5; skipped 0.
- Không-chắc còn mở: TRACK_LOST_EARLY (115/8) hệ-quả bursts; JUMP (6)
  không thấy trong cells — đề-nghị A tra measure log.
- Sanity record-cũ: thai3 G40→G49 chỉ context, không verdict current.

## session_hiep_thai4 (verify_cur, 5764f) — V4 detail: `V4-thai4-B.md`

- **E-B-004** `DUPLICATE_TRACK` cam1 CONFIRMED/S2/HIGH — lid1+2 (27f@317-343),
  lid9+10+11 triple (@769-796), lid84+86 (@2537-2558), lid114+117 (@5736-5761);
  IoU .24-.61 cùng xe vật-lý. Repro: sheet_0102, sheet_0028-29.
- **E-B-005** `DUPLICATE_TRACK` cam2 CONFIRMED/S2/HIGH — lid97+99 (33f@3106-3138),
  lid36+37 (28f@1342-1369), lid97+98, lid28+31, lid117+118, lid123+125, lid15+17.
  Repro: sheet_0132-134, 0199-200, 0236-237.
- **E-B-006** `GHOST_TRACK` UNSURE/S3/MED — `frozen_ambiguous`/`coasting` stacked
  trên nền-gỗ trống mép (sheet_0236 f5736-5761) — scope, cần A phán.
- **E-B-007** `ID_FRAGMENT/NEW_ID` UNSURE-type/S2/LOW-MED — **pattern new-ID
  CONFIRMED** (lid kế-tiếp {10,11,19,23} trên xe xanh-nhạt), nhưng **cùng-xe
  vật-lý UNSURE**: anchor lid19/23 khác vị-trí lid10/11; pixel-gần không đủ —
  cần world-space + appearance/timeline (audit A). Impact UNVERIFIED.
- Data toàn-session: **59 dup-pairs** (cam1 265f, cam2 368f) nhưng **0
  slot↔gid conflict đồng-thời** — slot integrity PASS.
- Coverage: **237/237 sheets eyeballed** — 2132 unique (cam,frame) cells
  = 1066/cam; uniform 2s toàn-session + 26 windows dense-5 (0 skip).
- Observations (không error-count): **O-B-017** capture gap f2442-43 ·
  **O-B-018** xe đỗ-chéo 2 ô `merged_detection_frozen` đúng cơ-chế ·
  **O-B-019** boundary ghosts scope · **O-B-020** `local_track_lost`×57
  = parked-suspend/edge · **O-B-021** slot integrity PASS.

## session_hiep_thai3 (verify_cur, 5965f) — V4 detail: `V4-thai3-B.md`

- **E-B-008** `DUPLICATE_TRACK` cam1 CONFIRMED/S2/HIGH — lid4+5 (@1296-1314
  IoU .99), lid18+21+22 triple (@2290-2338 .91-.97), lid23+24+25+27
  (@2357-2407 .65-.92), lid28+31 (.77), lid13+14+15 (@2024-2041),
  lid40+43 / 44+48 / 41+57 (@2709-2739 trong burst), lid59+61 (.44),
  lid68+69 (@2881-2906 .84). Repro: sheet_0093, 0096, 0114, 0078.
- **E-B-009** `DUPLICATE_TRACK` cam2 CONFIRMED/S2/HIGH — lid16+19 (.96),
  lid34+38, lid43+44, lid61+62 (@2296-2336 .70 — cùng cụm cam1, 1 xe đen chéo
  nhìn 2 cam), lid70+72 (.79), lid79+81 (.82), lid80+84 (.74), lid86+95 (.53),
  lid104+105 (@3688-3704 .89), lid116+118 (@4899-4919 .87).
  Repro: sheet_0118-0120, 0093.
- **41 dup-pairs toàn same canonical_gid**; **0 slot→2gid & 0 gid→2slot
  đồng-thời** toàn session -> slot integrity PASS; harm UNVERIFIED (no GT).
- Coverage: **212/212 sheets eyeballed** — 1904 unique cells = 952/cam;
  uniform 2s + 14 merged windows dense-5 (0 skip).
- Observations: **O-B-022** cam1 coasting-bursts f2707-2742 (peak 22 obs) +
  f4878-4907 (peak 18) · **O-B-023** cam2 dải ghost mép-trái x<140 +
  frozen_ambiguous 119/120 IoU .053 (kề-nhau, không phải dup) ·
  **O-B-024** `E:` episode/reservation labels chồng trên xe chéo biên
  (render-only, không phải obs trùng) · **O-B-025** slot integrity PASS.
