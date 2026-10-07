# V4 — session_hiep_thai3 (verify_cur_session_hiep_thai3) — Builder B

- Replay: 5965f, exit 0, `completed_replay` (canonical V1-replay-results.md).
- V3: 470 flags → 43 auto windows (ID_FRAGMENT 193 · TRACK_LOST_EARLY 137 ·
  ROI_MISMATCH 93 · SLOT_BINDING 32 · BBOX_JUMP 6 · TRACK_JUMP 5 ·
  GID_NEW_LINEAGE_LOSS 3 · GID_SWITCH 1). Events: 360 keyframes → 20 windows →
  merged 14 windows (~4205f phủ). File: `flags/verify_cur_session_hiep_thai3.merged_windows.txt`.
- V4 sheets: `sheets_cur/verify_cur_session_hiep_thai3/` — uniform every-2s
  + dense-5 trong merged windows.

## Coverage THỰC-eyeballed
- **212/212 sheets đã mở-mắt**, 0 skip.
- **1904 unique (cam,frame) cells** = 952 cam1 + 952 cam2 (theo index.json).
- Mọi merged window ≥1 sheet; cụm overlap/burst ≥2 sheet kiểm-chéo.

## Findings

### E-B-008 `DUPLICATE_TRACK` cam1 — CONFIRMED (S2/HIGH)
Data-verified IoU>0.4 cùng-frame:
- lid4+5 @1296-1314 IoU .99 · lid18+21 @2290-2307 .97 · lid21+22 @2297-2338
  .91-.96 (3-box cluster) · lid23+24 @2357-2390 .92 + lid24+25 / lid23+25 /
  lid25+27 @2371-2407 · lid28+31 @2414-2435 .77 · lid13+14 & lid14+15 @2024-2041
  · lid40+43 & lid44+48 .48 & lid41+57 .76 @2709-2739 (trong burst) ·
  lid59+61 @2761-2783 .44 · lid68+69 @2881-2906 .84.
- Visual anchor: sheet_0093 & sheet_0096 (xe đen chéo hàng-dưới — 2 box
  `matched`+`coasting` chồng), sheet_0114 (cụm coasting), sheet_0078.

### E-B-009 `DUPLICATE_TRACK` cam2 — CONFIRMED (S2/HIGH)
Data-verified IoU>0.4:
- lid16+19 @219-235 .96 · lid34+38 @969-989 .57 · lid43+44 @1120-1153 .65 ·
  lid61+62 @2296-2336 .70 (trùng cụm cam1 f2296+ — cùng xe đen chéo thấy cả
  2 cam) · lid70+72 @2384-2407 .79 · lid79+81 @2841-2861 .82 · lid80+84
  @2847-2868 .74 · lid86+95 @2883-2905 .53 · lid104+105 @3688-3704 .89 ·
  lid116+118 @4899-4919 .87.
- Visual anchor: sheet_0118-0120 (dải ghost mép-trái + xe đen mép-phải),
  sheet_0093 (cùng cụm cam1).

### Slot & identity integrity — PASS toàn session
- 41 cặp dup — **TẤT-CẢ same canonical_gid** (không pair nào lệch gid).
- **0 slot→2gid đồng-thời, 0 gid→2slot đồng-thời** (scan parking_episodes +
  parked_identity_reservations toàn 5965f).
- Identity harm UNVERIFIED — thiếu GT (header-only files).

## Observations (không đếm error)

- **O-B-022** cam1 mass-coasting bursts: f2707-2742 peak **22 obs đồng-thời**
  (toàn `coasting`, phủ mọi xe đỗ) + f4878-4907 peak **18 obs** — pattern
  mất-detection→prediction-resume; không slot-conflict kèm theo.
  Repro: sheet_0114 (f2709+), sheet_0190-0191 (f4878+).
- **O-B-023** cam2 dải ghost mép-trái: hàng-chục lid `coasting` x<140 trên
  nền-gỗ trống quanh f2841-2905 (sheet_0118-0120); cặp `frozen_ambiguous`
  lid119/120 @f5154-5184 IoU **.053** — **kề-nhau**, KHÔNG phải same-car dup
  (đính-chính nghi-vấn từ sheet_0201).
- **O-B-024** nhãn `E:`-prefixed (episode/reservation render) chồng trên xe
  đen đỗ-chéo mép-phải (sheet_0115-0116, 0180-0189, 0201-0204) — xác-nhận là
  render episode/parked_identity_reservation, không phải obs trùng.
- **O-B-025** slot integrity PASS (như trên).

## §5 Repro
- Flags→sheets: `scan_frames.py --session experiment_test/output/verify_cur_session_hiep_thai3`
  → `flags/verify_cur_session_hiep_thai3.jsonl`; `make_sheets.py --session
  verify_cur_session_hiep_thai3 --every 2s --windows-file
  flags/...merged_windows.txt --window-step 5 --out sheets_cur/...`.
- Dup-scan: IoU(xywh bbox)>0.4 cùng (cam,frame) trên `predictions.jsonl`
  (observations[].local_track_id / canonical_gid / association_state).
- Slot-conflict: parking_episodes + parked_identity_reservations, gom theo
  (frame,cam,slot)→gids và (frame,cam,gid)→slots.

Verdict: **E-B-008/009 CONFIRMED dup-local**; identity/slot harm UNVERIFIED;
không patch tracker theo chứng-cứ này.
