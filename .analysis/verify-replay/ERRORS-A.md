# ERRORS-A — builder-a V4 own-review (official verify_cur only)

Registry PASS (v1-replay-results.json): `verify_cur_session_{test1, hiep_toi4, hiep2, hiep_sang9, thai6, hiep_thai1}` — exit0, completed_replay, lines==src_frames, 0 log errors/warns. All 6 sessions covered.
fps=25 → t=f/25. frame_idx 1-based in verify_cur. Flag artifacts: `flags/verify_cur_<S>.{jsonl,windows.jsonl,summary.json}`.
Sheet sets: `sheets/<S>` (windows+uniform), `sheets_uniform[_thai6|_thai1]/<S>` (--every 2.0), `sheets_events[_thai6|_thai1]/<S>` (dense step5 around real events; windows listed in `windows/<S>.txt`).

## Coverage — eyeballed cells only (index.json of each set)

| session | auto-scan | sets eyeballed (index.json) | unique (cam,f) seen | % of 2×N |
|---|---|---|---|---|
| test1 | 298/298 | sheets/ 14/14 + e006/ 5/5 (dense f55–155) | 162 | 27.2% |
| hiep_toi4 | 620/620 | uniform/ 3/3 + events/ 14/14 | 148 | 11.9% |
| hiep2 | 642/642 | uniform/ 3/3 + events/ 14/14 | 146 | 11.4% |
| hiep_sang9 | 727/727 | uniform/ 4/4 + events/ 18/18 | 184 | 12.7% |
| thai6 | 5937/5937 | sheets_uniform_thai6/ 10/10 + sheets_events_thai6/ 83/83 (9 merged windows, 5 event groups) | 2204 | 18.6% |
| hiep_thai1 | 6050/6050 | sheets_uniform_thai1/ 10/10 (event-dense 62 sheets rendered → C reviews, union TBD) | 242 | 2.0% |

- Unique counts computed from `index.json` cell lists of exactly the sheets listed; earlier `sheets/` spot pass (toi4 4, hiep2 4, sang9 3 sheets) treated as supplemental, **not counted**.
- Uniform ≥1f/2s verified by viewing **all** `sheets_uniform/` cells: toi4 f1–601, hiep2 f1–641, sang9 f1–726 step~50 per cam.
- **Event-dense per §4 COMPLETE**: all generated event sheets viewed — toi4 14/14 (entry f15–85, parking-ep f170–290, departure f305–335, recovery f365–440, claim f520–560, end f570–620; gids 4/8/12/14/15/16 stable, all cam-side cells clean); hiep2 14/14 (f130–642: gid7/8/10 traverse+parking stable, minor edge slivers only); sang9 18/18 (f150–727: gid8/9/19/25 stable incl. gid19/25 `Xc|ambiguous` transitional boxes on real crossing cars).
- **Windows skipped (per set)**:
  - `sheets_uniform/` + `sheets_events/` + `sheets_e006/` + `sheets/session_test1`: **0 skipped** — every rendered sheet eyeballed.
  - `sheets/` auto merged-window sets (older pass): toi4 viewed 4/21 (17 skipped), hiep2 4/24 (20 skipped), sang9 3/30 (27 skipped) — superseded by uniform+events coverage of the same sessions; skipped cells not counted in coverage.
- Claims use only frames actually seen in cells; no full-range inference.

## Cross-session systematic pattern (verified ≥2 independent views each)

- **Coasting/stale-prediction bursts** (tất cả gid NULL → không hại identity): test1 cam2 dai nhất (lid74 46f, lid50-class 118f ở toi4); **toi4 cam2 f51 burst 24 box**; **sang9 cam2 f51 (~20) + cam1 f441–466 (14–15, ~24f)** — box phủ ô trống/đường; hiep2 gần như không có.
- **SLOT_BINDING_ERROR cam1 f1–61 D03/D05/D06 mọi session**: xe đỗ sẵn → vision occupied đúng, tracking_occupied=false vì motion tracker không track xe đứng yên → **design-inherent suspect, UNSURE** — không tính bug.
- **TRACK_LOST_EARLY lid1/2 @f2**: warmup noise 1–2f — CONFIRMED nhưng expected/noise, không bug.

## Findings (canonical §5)

| id | session | type | cam | frames (t) | lid/gid/slot | sev | conf | status |
|---|---|---|---|---|---|---|---|---|
| E-A-001 | test1 | FALSE_DETECTION | cam2 | vd f100 | fixture/object portion (post, droidcam text, hand) CONFIRMED; lid74 anchor trong slot C05 occupied=True f65-92 (matched detections) → KHONG floor-only; lid115 [204,63,78,202] in-lane gidNULL IoU=0 → UNSURE | S2 | MED | MIXED (C V5; lid74 refined not-floor) |
| E-A-002 | test1 | GHOST_TRACK | cam2 | vd f100 | lid74/lid85 — box nằm trên xe/vật thật per C audit | S2 | — | REJECTED (C V5: not ghost) |
| E-A-003 | test1 | DUPLICATE_TRACK | cam2 | f100 | **lid111 ↔ lid120 IoU=0.57** ([696,265,62,80] vs [683,265,57,83]), gid NULL cả hai | S2 | MED | CONFIRMED (C V5) |
| E-A-004 | test1 | ROI_MISMATCH | cam2 | 49 flags | vd lid5 @f2 — bbox tràn mép ROI, không phải lỗi | S3 | HIGH | UNSURE→EXPECTED (reclassify) |
| E-A-005 | test1 | SLOT_BINDING_ERROR | cam1 | f1–61 | D03/D05/D06 vision-occupied w/o tracking; verify f70: D03 occupied=True, 0 track inside → xe đỗ sẵn trước session; motion tracker không detect xe chưa-hề-di-chuyển (vision covers occupancy) → design limitation, gid NULL | S3 | HIGH | EXPECTED (design limit) |
| E-A-006 | test1 | GID_NEW_LINEAGE_LOSS | cam2 | f55–155 dense-reviewed | gid5 x~63–72 f69–76 (8 obs, edge) vs gid9 x~204–235 f91–93 — vùng khác hẳn → object khác, không lineage-swap; magenta-pending bám xe đỗ thật = transitional | S3 | HIGH | EXPECTED (edge churn) |
| E-A-010 | toi4 | ID_FRAGMENT/NEW_ID | cam2 | f3–24 | lid11↔4, lid12↔5 — vanished lids 1–12 ALL gid NULL → bootstrap churn, no identity harm | S3 | HIGH | EXPECTED (warmup churn) |
| E-A-011 | toi4 | SLOT_BINDING_ERROR | cam1 | f1–61 | D05/D06 vision-occupied w/o tracking; D03 f78–138 tương tự; f150 D03 occupied=True, 0 track → pre-parked design limitation | S3 | HIGH | EXPECTED (design limit) |
| E-A-013 | toi4 | FALSE_DETECTION | cam2 | f51 burst (24 box) + f501–601 | lid21 bbox[83,265,99,262] gid NULL ~14f; lid50 [1038,555,89,144] gid NULL sống f407–524 (**118f**) | S2 | MED | CONFIRMED |
| E-A-014 | toi4 | —(clean events) | both | f151–229, 400–425 | gid12 handoff_matched OK; gid14/15 departure windows OK; recovery pending on real car @412 | — | — | NO-ERROR |
| E-A-020 | hiep2 | ID_FRAGMENT/NEW_ID | cam2 | f115–153 | lid11,12↔lid10; gid continuity PARTIALLY preserved: lid9/14/18→gid1, lid15/20→gid2 (ReID recovered); lid11/12/13/19 gid NULL — churn confirmed, harm unresolved | S3 | MED | UNSURE (gid handoff partial) |
| E-A-021 | hiep2 | ROI_MISMATCH | cam1 | f404–405 | lid7 anchor (79,706)/(72,703) bottom-left edge, lid8 anchor (71,587); roi_support 0.03–0.31, roi_clipped=True, new_tentative gid NULL → boundary noise | S3 | HIGH | EXPECTED (edge) |
| E-A-022 | hiep2 | SLOT_BINDING_ERROR | cam1 | f1–61 | vision-occupied w/o tracking → pre-parked design limitation (same test1/toi4) | S3 | HIGH | EXPECTED (design limit) |
| E-A-024 | hiep2 | —(clean events) | both | f263–347, 430–465 | gid4 parking stable; gid5 tentative→coasting @edge in reject window (reject hợp lý, xe ở rìa) | — | — | NO-ERROR |
| E-A-030 | sang9 | FALSE_DETECTION | cam2 f51 (burst ~20) + cam1 f441–466 | cam2 f51 floor-CONFIRMED: lid19→B02, lid25→B02, lid30→A03 (occupied=False, IoU=0); over-real-car lid29→B03, lid37→C05, cam1 lid1→E05; cam1 lid2→E04 empty (confirmed); ~14 lids in-lane IoU=0 UNSURE | S2 | MED | MIXED |
| E-A-031 | sang9 | GHOST_TRACK | cam1 f441–466 | lid9–22 stale_prediction, gid NULL; IoU=0 vs mọi measurement; floor-CONFIRMED lid15 [795,219,32,87]→E03 occupied=False; lid12→E07 occupied=True; 12 lids in-lane UNSURE | S2 | MED | MIXED |
| E-A-032 | sang9 | TRACK_JUMP | cam2 | f39–41 | lid25 [578,163]→[506,179]→[380,245], lid26 [366,384]→[504,382] — warmup association bootstrap jumps, sau đó coasting ổn định, gid NULL | S3 | HIGH | EXPECTED (warmup) |
| E-A-033 | sang9 | ID_FRAGMENT/NEW_ID | cam2 | f3–38 | lid19↔7, lid21↔4 (46) — warmup churn, vanished lids gid NULL, no identity harm | S3 | HIGH | EXPECTED (warmup churn) |
| E-A-034 | sang9 | SLOT_BINDING_ERROR | cam1 | f1–61 | vision-occupied w/o tracking → pre-parked design limitation | S3 | HIGH | EXPECTED (design limit) |

Evidence/repro (all relative `backend/main_detect`):
- E001/E002/E003: `sheets_e006/session_test1/sheet_0003` cell2 = cam2 f100: lid74 gidNULL [562,183,34,66] coasting (life f65–110=46f), lid115 gidNULL [204,63,78,202] (f87–106), lid85 frozen_ambiguous [850,174,105,183]; **dup lid111↔lid120 IoU 0.57**; + `sheets/session_test1/sheet_0012–0014` cam2 cells. Repro: `make_sheets.py --session output\verify_cur_session_test1 --video-dir output\session_test1 --windows "70-140" --window-step 5 --window-pad 15`.
- E013: `sheets_uniform/session_hiep_toi4/sheet_0001` cell4 = cam2 f51 (24-box burst, lid21 [83,265,99,262] gidNULL ~14f); `sheet_0003` cell4 = cam2 f501 (lid50 [1038,555,89,144] gidNULL, life f407–524=118f).
- E030/E031: `sheets_uniform/session_hiep_sang9/sheet_0001` cell4 = cam2 f51 (~20 coasting gidNULL, lid18 [969,244,30,40]); `sheet_0003` cell1 = cam1 f451 (14 stale_prediction lid9–18, gidNULL, life f441–464~466); `sheets_events/.../sheet_0012` cam1 cells f440–460 (cùng burst lid9+). Repro: `make_sheets.py --session output\verify_cur_session_hiep_sang9 --video-dir output\session_hiep_sang9 --every 2.0` + `--windows "430-470" --window-step 5`.
- E014 clean: `sheets_events/session_hiep_toi4/sheet_0004` gid12 cả 2 cam; `sheet_0010` magenta recovery box on real dark car f~412; `sheet_0007`/`sheet_0013` departure+claim windows.
- E024 clean: `sheets_events/session_hiep2/sheet_0003` gid4 parking both cams; `sheet_0008` gid5 tentative→coasting at right edge f~445–465.
- E006: `sheets_e006/session_test1/sheet_0001–0005` (f55–155 step5, đã xem đủ) — gid9/13/14/15 pending bám xe đỗ thật; giant merge box @sheet_0005 left cell. Repro: `make_sheets.py --session output\verify_cur_session_test1 --video-dir output\session_test1 --windows "70-140" --window-step 5 --window-pad 15`.

| E-A-035 | thai6 | FALSE_DETECTION | cam1 | f5901 (burst f5877–5896→) | lids340–359 gidNULL 20 coasting box ~30–45f; **5 lids anchor trong ô TRỐNG** (343→F05, 344→F02, 349→F05, 351→F03, 354→F05, occupied=false) = floor-only confirmed; 4 lids trong ô occupied (342→F06, 346→D05, 352/356→F06) trên xe thật; 9 lids ngoài mọi ô (aisle/gỗ) UNSURE | S2 | MED | MIXED (floor-only portion CONFIRMED, rest UNSURE) |
| E-A-036 | thai6 | FALSE_DETECTION | cam2 | f5882–5900+ | lid317 [760,136,56,81]→C08 occupied=False = floor-confirmed; lid313/314/315/321 in-lane IoU=0 UNSURE; gid NULL tất cả | S3 | MED | MIXED |
| E-A-037 | thai6 | FALSE_DETECTION | cam2 | f2759–2791 burst | floor-CONFIRMED lid160→C08 + lid161→B10 (occupied=False); **lid164==lid165 IDENTICAL bbox [976,392,48,104] = true dup pair**; f2761 lid156→C05 occupied; rest in-lane UNSURE | S3 | MED | MIXED |
| E-A-038 | thai6 | DUPLICATE_TRACK | cam2 | f592–717 | scan toàn range: chỉ 1 cặp dup thực lid9(matched,gidNULL)×lid10(coasting) IoU 0.42/0.39 f716–717; visual "4–6 box cluster" = trail_render tích lũy, KHÔNG simultaneous → cluster-claim partially rejected | S3 | MED | MIXED |
| E-A-039 | thai6 | FALSE_DETECTION | cam2 | recurring f500–5470 | lid14 f1355–1442 (88f): matched DETECTIONS trên vùng wall/droidcam.app x905–944 y52–229, roi_support 0.08–0.15, gid NULL → detector false-positive trên watermark/non-vehicle; cosmetic, no identity impact | S3 | MED | CONFIRMED (S3 cosmetic) |
| E-A-041 | thai6 | —(clean events) | both | event windows | xe cyan/teal/đen/máy di chuyển tracked đúng xuyên windows; ô đỗ khớp; handoff/entry/parking OK | — | — | NO-ERROR |

| E-A-042 | thai1 | FALSE_DETECTION | cam2 | ~f1900–2100 | box = lid17 gid=1 MATCHED detection moving [239,164,79,95]→[298,356,62,112] f1965–2003 → xe teal thật trong làn (khớp event sheets s63–66); không phải ghost nền trống | S3 | HIGH | REJECTED |

## Observations (không tính error)

- E-A-012 (toi4 cam2): 59 TRACK_LOST_EARLY lids sống 1–2f @f2+ — warmup noise, expected.
- E-A-023 (hiep2 cam2): 21 TRACK_LOST_EARLY lids 1–2f — warmup noise, expected.
- E-A-004 (test1 cam2): 49 ROI_MISMATCH flags — bbox tràn mép ROI, hành vi hợp lệ, không phải defect (giữ EXPECTED).

- E-A-040 (thai6): chân/tay người mép frame → yellow/green box nhỏ mép (uniform s4; events s25–27, s39); corner yellow-box nền gỗ ngoài mat (s66,s76–78); s82 "yellow cluster" đáy-trái = **ô-trống outlines** (cam2 f5865–5880 có 0 obs) — retracted; s36 "giant green box" = ROI outline, retracted (no bbox>120k in preds).

- E-A-043 (thai1): chân người mép trái/trên thỉnh thoảng bị box (uniform s3, s5) — edge person-as-vehicle noise.

## Boundaries (not errors)

- Coasting box ngoài ROI / xe-rời-frame (toi4 gid55 f~600+): hợp lệ.
- Warmup 1–2f lids, slot-arrival-claim_rejected rải: expected/noise.
- `config_era_suspected`: KHÔNG — V2-A aligned cả 4 (xem V2-A.md).
- V5 cross-check của B findings nằm riêng trong `V5-A.md` (seed20261005, 1-sample + audit E-B-003).

## Hạn chế

- Eyeball unique (cam,f): test1 27.2%, toi4 11.9%, hiep2 11.4%, sang9 12.7%, thai6 18.6% (2204/11874; uniform 10/10 + events 83/83, 0 skip), **thai1 13.7% (1652/12100)** — uniform 242 + event-dense union 1450 (162/162 sheets: C `V4-help-C-thai1.md` 0001–0035+0097–0157+tail0158–0162 & A `V4-help-A-thai1-part.md` 0036–0096; dedup uniform∩events=40), **116/116 event windows FULL (0 PART/SKIP)**, 0 rendered-sheet skipped. Auto-scan 100%.
- Findings closure ~01:10: E-A-005/006/010/011/021/022/032/033/034 → EXPECTED (warmup/design-limit/edge, evidence trong json); E-A-042 → REJECTED (lid17 gid1 xe teal thật); E-A-039 → CONFIRMED S3 (watermark fixture); E-A-030/031/036/037/038 → MIXED với floor-only portions CONFIRMED (anchor trong slot occupied=False + IoU=0 vs measurements); E-A-020 vẫn UNSURE (gid handoff partial); E-A-001 MIXED (lid74 KHÔNG floor-only — anchor C05 occupied).
- Không sửa runtime/config; cause-suspect chỉ phục vụ clustering của lead.
