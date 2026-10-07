# Progress — Builder-A (verify-replay)

Updated: 2026-10-05 · Ownership: MEGAPLAN §2/§4 · Product HOLD (code/config/tests frozen, only new files).

## Latest-13 (thai6 FROZEN + thai1 V2/V3/uniform done, event-dense → C)

- **thai6 CLOSED**: V3 7/7 CHECKED (1459 flags, 54 windows, skew≤110ms, log 0/0) · V2 ALIGNED 4/4 · **V4 complete: uniform 10/10 + events 83/83 eyeballed, unique 2204/11874 = 18.6%, 0 skip**. ERRORS-A +errors-a.json synced: E-A-035 (cam1 f5901 burst 20 lids gidNULL, 5 lids anchored in EMPTY slots = floor-only confirmed portion, MIXED), E-A-036/037 (cam2 top-strip bursts gidNULL, UNSURE), E-A-038 (duplicate cluster on white car entry, UNSURE), E-A-039 (fixture boxes top-right wall lid14 ~88f, UNSURE), E-A-041 NO-ERROR. Retracted: s82 "cluster"=slot outlines (0 obs @f5865-80), s36 "giant box"=ROI outline (no bbox>120k).
- **thai1 PASS 6050/6050 → V2/V3/uniform done**: V3 7/7 CHECKED — 197 flags (ID_FRAG 94, TRACK_LOST 59, SLOT_BIND 31, ROI 7, BBOX_JUMP 3, DATA_INTEGRITY 1 capture-gap f973→974 ~6.7s, GID_SWITCH 1, GID_LOSS 1), 47 windows, 57 handoffs, 377 occlusion hits, log 0/0. V2 ALIGNED 4/4 (cam1 D/E/F + cam2 A/B/C @ f0 & f3025). Uniform 10/10 eyeballed = 242/12100 = 2.0% — sạch phần lớn; 1 finding UNSURE (E-A-042 green box làn trống ~f1900-2100); person-edge noise = E-A-043 obs.
- **Cho C (event-dense thai1)**: `windows/thai1_{entry,exit,parking,occlusion,handoff}.txt` + `windows/thai1_manifest.json`; rendered `sheets_events_thai1/` 62 sheets / 1536 cells (17 merged windows, pad±15 merge30 step5 grid5x5). C QA dense → A merge union coverage.
- A freeze sau thai6; chờ C event-dense thai1 + resample 20% full error set.

## Latest-12 (thai6 PASS → V3+V2 done, V4 in-progress checkpoint)

- **Registry**: `verify_cur_session_thai6` official PASS 5937/5937. Không replay, code/config frozen.
- **V3** (`flags/verify_cur_session_thai6.*`): 7/7 groups CHECKED — rows=raw 5937/5937, 0 missing, skew≤110ms, log 0err/0warn; **1459 flags** (ID_FRAG 671, TRACK_LOST 550, ROI 141, SLOT_BIND 34, TRACK_JUMP 26, BBOX_JUMP 23, GID_LOSS 8, HANDOFF 6); 54 merged windows; 103 handoff events; 1057 occlusion hits. Matrix cập nhật trong `V3-scan-A.md` (fixed malformed column).
- **V2**: `alignment/session_thai6*` — ALIGNED 4/4 (cam1 D/E/F + cam2 A/B/C rows @ f0 & f2968, global config). `V2-A.md` updated.
- **V4 coverage so far** (mắt thật, unique (cam,f) từ index.json):
  - Uniform `sheets_uniform_thai6/` **10/10 sheets** (238 cells = 119f×2cam, mỗi 2s) — ALL eyeballed.
  - Event-dense `sheets_events_thai6/` **58/83 sheets** eyeballed (step5 quanh 9 merged windows từ 5 nhóm spans: entry/exit/parking/occlusion/handoff — GT csv rỗng nên nhóm trích từ `identity_events`/`parking_events` predictions).
  - **Unique (cam,f) = 1612/11874 = 13.6%** (uniform 238 + events 1450, overlap de-duped). Remaining: 25 event sheets (s59–s83 ≈ windows cuối ~f4794–5952).
- **Findings sơ bộ thai6** (chưa §5-full, đang gom evidence):
  - cam1 f5901: **20 coasting gidNULL** lids340–359 sinh f5877–5896 (~30–45f) — burst cuối session; cell `sheets_uniform_thai6/sheet_0010` r3c2.
  - cam2 f5901: 5 coasting + 4 frozen_ambiguous gidNULL — cùng sheet cell r3c3.
  - cam2 right-edge/bottom empty-lane coasting clusters: `sheets_events s31,s34,s35,s38,s40,s41` (~f2425–3136).
  - cam2 purple fixture box top-right (droidcam.app/wall): persistent nhiều sheet (~s5,s6,s9,s23,s29,s30).
  - cam2 white-car entry duplicate cluster: s8/s9 (~f592–717).
  - s36 (~f2761–2821): oversized giant green box phủ nửa khung (oversized_detection).
  - Person/feet mép frame → edge noise (observation, s4-uniform, s25–27, s39).
  - Ngoài ra đa số cells sạch: moving vehicles tracked đúng, parked slots khớp.
- Tiếp: xem nốt s59–s83, trích §5 lid/gid/bbox/cell cho findings thai6, append ERRORS-A + JSON, đóng băng A.

## Latest-11 (C V5 audit applied + IoU evidence)

- C V5 verdicts merged: E-A-002 REJECTED (box on real object); E-A-001 MIXED (fixture portion CONFIRMED, floor-only UNSURE); E-A-030/031 UNSURE; E-A-003 CONFIRMED. Evidence history kept, MD+JSON synced.
- New metric for E-A-031: f445/f451 cam1 — every stale_prediction box has **IoU=0 vs all measurements** (no detection underneath). Per-box fixture-vs-floor split still open.
- B đã qua toi4 (C handles); A chờ thai1/thai6 registry.

## Latest-10 (V4-help runtime_session_bt for C)

- Rendered `sheets_v4h_bt/` = 30 sheets / 472 cells (C's 5-group windows → 7 merged, step5, grid 4x4). **All 30 eyeballed.**
- Unique (cam,f) = **472/3058 = 15.4%**; skipped 0 rendered; gaps documented (non-event ranges).
- Findings: E-ABT-1 warmup burst cam2 f2-42 (33 stale_prediction gidNULL, cell s1c2); E-ABT-2 static-fixture/post coasting cam1 lid21 + cam2 lid64/66 alive@EOF + f1374-1432 bursts gidNULL; E-ABT-3 gid19 ambiguous-flicker on parked car = OBSERVED; E-ABT-4 events NO-ERROR.
- Report `V4-help-A-runtime-bt.md` for C merge — corrected: gaps exact từ index.json (f1–37, 279–476, 559–573, 1001–1066, 1098–1103, 1173–1198, 1449–1485, 1527–1529); bỏ hand-map sai; E-ABT-2 → FALSE_DETECTION (fixture thật, gid NULL, không suy ghost). Own-6 evidence đã fix ở Latest-9. A idle.

## Latest-9 (§5 evidence fix — prediction-data backed)

- 6 CONFIRMED findings now cite concrete lid/gid/bbox + lifespan + cell ordinal + repro: E001/002 (test1 f100: lid74 gidNULL coasting 46f, lid85 frozen_amb 41f), E003 (lid111↔120 IoU 0.57>0.55), E013 (toi4 f51 burst 24 box gidNULL + lid50 118f), E030/031 (sang9 cam2 f51 ~20 + cam1 f441-466 14-15 box gidNULL ~24f).
- **Corrections**: sang9 storms are cam2@f51 + cam1@f441-466 (not cam2-only); E031 "real gids" claim REMOVED — all storm boxes gid NULL (caption misread). E004 → EXPECTED; E012/E023 → observations.
- MD/JSON synced; progress checkpoint this entry.

## Latest-8 (V4 complete + V5 on B)

- **All rendered sheets eyeballed**: events toi4 14/14, hiep2 14/14, sang9 18/18 + uniform all + test1 sheets 14/14 + e006 dense 5/5 (f55-155). Windows skipped = **0**.
- Unique (cam,f) exact: test1 **162=27.2%**, toi4 **148=11.9%**, hiep2 **146=11.4%**, sang9 **184=12.7%**.
- Event-review results: toi4/hiep2 all-clean (gids stable through entry/parking/departure/handoff/recovery/claim windows); sang9 events clean except burst storms f101/f451/f440-460 (already filed); gid19/25 `Xc|ambiguous` transitional on real crossing cars = expected.
- E-A-006 upgraded: dense f55-155 shows gid9/13/14/15 magenta-pending on REAL parked cars + one giant merge box over ~3 cars → evidence-strong UNSURE.
- **V5 cross-check `V5-A.md`**: seed20261005 → sampled E-B-002 → CONFIRM (visual coherent, churn-only). E-B-003 semantic → **NOT-ERROR**: G48 coasting sits on real boundary car (missing coast-TTL), recommend OBSERVED.
- Pending: thai1/thai6 + remaining B sessions → re-sample V5 on full error set at campaign end.

## Latest-7 (V4 chốt 4 session — coverage exact)

- **Uniform 100% viewed**: toi4 3/3, hiep2 3/3, sang9 4/4 sheets (mọi cell, step~50/cam). Phát hiện thêm: sang9 storm 3 burst — f101 + f451 (uniform) + f440-460 (events s12), không phải chỉ 445-495.
- **Unique (cam,f) exact từ index.json** chỉ các sheet đã xem: test1 120/596=20.1%; toi4 62/1240=5.0%; hiep2 44/1284=3.4%; sang9 48/1454=3.3%. Spot-pass `sheets/` cũ = supplemental, không cộng vào.
- Skip chính xác: uniform 0; events unviewed toi4 10/14, hiep2 12/14 (gồm win 560-600), sang9 16/18 (gồm ~180-345, 600-660) — lý do + queue trong ERRORS-A.
- `ERRORS-A.md`+`errors-a.json` đồng bộ §5 (cell+ID+repro cho confirmed). 4 session chốt scope hiện tại; V5 sau. Pending: thai1/thai6 registry; UNSURE dense-render queue (E-A-006…).

## Latest-6 (checkpoint @~70% — LEAD gaps being fixed)

- Gaps acknowledged: uniform sheets toi4 s2, hiep2 s1/s3, sang9 s1/s3/s4 chưa eyeball → đang xem đủ; coverage "unique" phải tính từ index.json của sheet THỰC-xem (không cộng trùng); events toi4 xem 4/14 (không phải 2→4 inconsistent).
- Đang chạy: eyeball đủ uniform + thêm event sheets còn lại theo queue.
- Sau đó: §5 per-finding đủ cell+ID+repro; đếm skip windows chính xác từ index.json; chốt 4 session.

## Latest-5 (V4 dense pass done + canonical docs split)

- Eyeball dense-5 event sheets: toi4 s4/s7/s10/s13 (parking/departure/recovery/claim-rej — gid12/14/15 stable, NO-ERROR); hiep2 s3/s8 (gid4 parking OK, gid5 edge-reject reasonable); sang9 s7/s12.
- **Key finding upgrade**: sang9 `sheets_events/sheet_0012` f445-495 = **cam2 ghost storm with REAL GIDs** (15+ `GID:N|COASTING` over empty A/D slots) → E-A-031 GHOST_TRACK S2-HIGH.
- Canonical split: `ERRORS-A.md` + `errors-a.json` (§5 synced), `V2-A.md` (alignment), `V3-scan-A.md` (auto results). Coverage table counts only ACTUALLY-viewed cells; skipped windows counted+reasoned.
- Pending: hiep_thai1/thai6 registry; dense renders for UNSURE queue (E-A-006 etc).

## Latest-4 (post-review V4 coverage fix)

- LEAD review: uniform coverage phải chứng minh — tạo `sheets_uniform/<S>` (--every 2.0 only: toi4 3, hiep2 3, sang9 4 sheets) + `sheets_events/<S>` dense step-5 quanh event windows thật (`windows/<S>.txt` từ identity/parking events).
- Uniform eyeballed đủ 3 session mới; event-dense đã render đủ (toi4 14, hiep2 14, sang9 18 sheets) — eyeballed subset có ghi rõ trong ERRORS-A coverage table; skipped windows đếm + lý do.
- Sửa claims: "persistent f1-727" → cite windows cụ thể; toi4 cam2 coasting CONFIRMED systematic (uniform s1/s3), không còn "sạch nhiều"; hiep2 = cleanest.
- ERRORS-A canonical + errors-a.json updated.

## Latest-3 (4 sessions official → ERRORS-A canonical)

- Registry PASS: test1, toi4, hiep2, sang9 → V3+V4 done on all 4. thai1/thai6 still pending B.
- `ERRORS-A.md` + `errors-a.json` rewritten canonical §5: E-A-001..034 across 4 sessions, exact cam/frame/time (25fps, 1-based verify_cur), lids/gids/slots, sheet+cell evidence, repro commands, severity/confidence/status.
- Cross-session pattern found: **cam2 top-left/left-edge coasting zone** (test1 S2 strongest, sang9 S2, toi4/hiep2 S3 mild); **SLOT_BINDING cam1 f1-61 D03/D05/D06 mọi session = design-inherent suspect** (parked cars invisible to motion tracker) — UNSURE; TRACK_LOST_EARLY lid1/2 @f2 = warmup noise CONFIRMED.
- Eyeball coverage honest: test1 120/596 (20.1%), toi4 ~2.7%, hiep2 ~2.6%, sang9 ~1.8%; auto 100% all. Windows-skipped 0.

## Latest-2 (test1 V3+V4 official → ERRORS-A)

- `verify_cur_session_test1` = official registry (298/298, exit0, completed_replay). V3 scan → `flags/verify_cur_session_test1.{jsonl,windows.jsonl,summary.json}`.
- V4 sheets via C's `make_sheets.py` → `sheets/session_test1/` 14 sheets / 120 cells (windows-file + every-2s). **14/14 eyeballed.**
- `ERRORS-A.md` + `errors-a.json` (LEAD format, V4 own-review): E-A-001..006. CONFIRMED: cam2 FALSE_DETECTION+GHOST_TRACK storm (S2), DUPLICATE_TRACK visual (S2), ROI_MISMATCH edge (S3). UNSURE: SLOT_BINDING_ERROR cam1 f1–61 (design-inherent suspect), GID_NEW_LINEAGE_LOSS cam2 f77–134 (needs dense render). Coverage: 120/596 cells (20.1%), windows-skipped 0, V2 f0+mid ALIGNED.
- Pre-replay flags on original preds = sanity only, NOT findings. V5 crosscheck = other builders' work per §4.

## Latest (post-LEAD review)

- `scan_frames.py` v2: **7-group coverage matrix** (`coverage` block, CHECKED/NOT_AVAILABLE — never claims unchecked), `group` field per flag, sibling `verify_cur_<name>.log` for g7, raw-frame counts resolved from source dir for `verify_cur_*`.
- **Index base verified**: original sessions `frame_idx` 0-based; `verify_cur_session_*` records **1-based** ([1,298] on test1). `.windows.jsonl` auto-normalizes to 1-based raw frames, ±15 pad + merge per §V4 — direct input for C's `make_sheets.py --windows-file`. Contract documented in `TOOLS-A.md`.
- Post-filter EOF: `ID_FRAGMENT/NEW_ID` + `GID_NEW_LINEAGE_LOSS` + `HANDOFF_ERROR` chỉ cờ khi id mất-hẳn (tái xuất = flicker, bỏ). `TRACK_LOST_EARLY` bỏ track sống-cuối. `GHOST_TRACK` chỉ prediction-only stationary ≥120f. `GID_SWITCH` mỗi lần lid đổi gid.
- Official scan `verify_cur_session_test1` (FINISH, có session_info): 298 rows = raw 298/298 cams, frame_timestamps.csv 298 rows, 0 REPLAY_FAILURE, g7 log 0 error-lines, 751 flags → 2 merged windows (flags quá dày — test1 nhiễu track ngắn).
- Registry rule noted: chỉ `verify_cur_session_*` FINISH/PASS; pilot + original-pred = sanity-only.
- V2 LEAD: phải eyeball đầu+giữa 2 cam — f0 xong cho 6 session gốc; mid-frame images đã render, chưa eyeball → recheck khi làm verify_cur.

## Done

- [x] Read `verify-replay/MEGAPLAN.md` + `STATUS.md`; confirmed no `verify/` dir, no `verify_cur_*` outputs → **builder-b replay not started**. No replay run by A.
- [x] §4 initial V3 tool: `backend/main_detect/experiment_test/verify/scan_frames.py` (new file).
- [x] V2 helper: `backend/main_detect/experiment_test/verify/align_overlay.py` (new file).
- [x] V2 alignment run on 6 builder-a sessions (existing data, NOT verify_cur): rendered ROI+slots overlays f0+mid × cam1/cam2 → `.analysis/verify-replay/alignment/<session>/` (24 jpg). Eyeballed f0 × 2 cams × 6 sessions: **all ALIGNED** — ROI covers lot, slot polygons sit on painted markings; no `config_era_suspected` evidence on current configs.
- [x] V3 scanner run on original `predictions.jsonl` for 6 sessions → `.analysis/verify-replay/flags/<session>.jsonl`. Tuned pass 2: `GID_NEW_LINEAGE_LOSS` restricted to first-sighting gids near a vanished gid (was exploding on continuous neighbours).

## Coverage (V3, automatic)

| session | frames | automatic flags |
|---|---|---|
| session_hiep_thai1 | 6050 | 94 |
| session_thai6 | 5937 | 232 |
| session_hiep_sang9 | 727 | 41 |
| session_hiep2 | 642 | 35 |
| session_hiep_toi4 | 620 | 39 |
| session_test1 | 298 | 134 |

**Automatic scan = 100% of prediction rows** (every frame_idx read). **Human image review so far = V2 alignment images only (12 f0 frames)** — no V4/V5 confirmation yet; flags are suspicions, not confirmed errors.

## Blocked / pending

- [ ] V4/V5 visual review — waiting for builder-b `verify_cur_*` replay outputs (V1 is B-exclusive). Preliminary flags on original data are usable for practice review but per plan the official pass is on replay outputs.
- [ ] Re-run V2+V3 on `verify_cur_<session>` dirs when they appear.
- [ ] Mid-frame alignment images rendered but only f0 eyeballed — recheck mid on replay outputs.

## Flag mix (original data, unconfirmed)

Dominant: `ROI_MISMATCH` (anchor-outside-ROI obs), `SLOT_BINDING_ERROR` (occupant↔observed mismatch). Small: `BBOX_JUMP`/`TRACK_JUMP` (>180px centre jumps), `GID_NEW_LINEAGE_LOSS` 1–11/session, `DATA_INTEGRITY` 1 (thai1 — missing frame rows in mid-range).

## Files created (this task)

- `backend/main_detect/experiment_test/verify/scan_frames.py`
- `backend/main_detect/experiment_test/verify/align_overlay.py`
- `.analysis/verify-replay/flags/*.jsonl` (6)
- `.analysis/verify-replay/alignment/<session>/*.jpg` (24)
- `.analysis/verify-replay/progress-builder-a.md` (this)
- `.analysis/verify-replay/TOOLS-A.md`

No src/config/test file touched. No `.venv`/output-tree recursion.


## Latest-13 — 2026-10-06 ~01:10 (Devin tam dieu phoi; INBOX-A.md + STATUS.md)

- **Thai1 V4-help nop**: `V4-help-A-thai1-part.md` — sheets_v4h_thai1 0036-0096, 61/61 sheets, 549 unique (cam,f) [cam1 274 f1096-2860, cam2 275 f1091-2860], 0 skip, **NO_ERROR**; obs: s55 lid24/lid22 tentative/lost box tren debris nen go (gid NULL, transient). Union cho C merge (0001-0035, 0097-0157).
- **Findings closure (data-only evidence, khong replay)**: errors-a.json + ERRORS-A.md dong bo:
  - EXPECTED: E-A-005/011/022/034 (vision-occupied w/o tracking = xe do san pre-session, design limitation — verify f70/f150 van occupied + 0 track), E-A-006 (gid5 vs gid9 khac vung — object khac), E-A-010/033 (warmup churn gid NULL), E-A-021 (lid7/8 edge roi_clipped), E-A-032 (warmup bootstrap jump).
  - REJECTED: E-A-042 (box = lid17 gid1 matched detection xe teal that f1965-2003).
  - CONFIRMED S3: E-A-039 (lid14 f1355-1442 matched detections tren watermark wall, roi_support 0.08-0.15, gid NULL).
  - MIXED +floor-confirmed: E-A-030 (cam2 f51 lid19/25->B02, lid30->A03 empty; cam1 lid2->E04), E-A-031 (lid15->E03 empty), E-A-035 (5 lids empty slots; 4 lids occupied slots F06/D05 = over-real-car; 11 in-lane unsure), E-A-036 (lid317->C08 empty), E-A-037 (lid160->C08, lid161->B10 empty; lid164==165 identical bbox = true dup), E-A-038 (chi 1 cap dup thuc lid9x10 IoU0.42 f716-717; cluster visual = trails).
  - Con UNSURE: E-A-020 (hiep2 churn, gid handoff partial: lid9/14/18->gid1, lid15/20->gid2); E-A-001 lid115 in-lane.
- Method: point-in-polygon anchor->slot + occupied flag frame-time + IoU-vs-measurements + observation_kind; khong replay, chi doc predictions.jsonl.
- Pending: C thai1 event-dense -> union; B freeze4 -> V5 final resample seed20261005.
