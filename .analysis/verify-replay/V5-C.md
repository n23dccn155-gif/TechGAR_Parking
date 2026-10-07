# V5-C — cross-check of ERRORS-A 4 short sessions (builder-c, independent eyeball)

Seed **20261005** → `random.Random(20261005).sample(pool, ceil(20%))`. Pool = `errors-a.json` findings minus EXPECTED/NO-ERROR/observations_not_errors = **16** (6 CONFIRMED + 10 UNSURE) → sample **4**:

**E-A-006, E-A-011, E-A-020, E-A-034** — all four sampled findings carry A status **UNSURE** (sample landing on zero CONFIRMED findings is a property of the frozen pool, not a re-draw).

Verdict vocabulary (same as V5-A): CONFIRMED / REJECTED / UNSURE; phenomenon vs defect-harm separated.

## Verdicts

| finding | type | session | verdict | evidence used (independent) |
|---|---|---|---|---|
| E-A-006 | GID_NEW_LINEAGE_LOSS test1 cam2 f55–155, gids 4,5,9,13,14,15 | test1 | **Phenomenon CONFIRMED / harm UNSURE** | predictions: 15 `global_id_created` f64–134 all cam2 (gid1–15, lids 59–171) — startup burst, no prior-gid replacement signature in sample; eyes on `sheets_e006/session_test1/sheet_0003,0005`: boxes bind real parked cars, gid NULL stacks also on operator hand (corroborates E-A-001 separately) |
| E-A-011 | SLOT_BINDING_ERROR toi4 cam1 f1–61, D05/D06 | hiep_toi4 | **Phenomenon CONFIRMED / harm UNSURE** | slot records f2–61: `occupied=true, vision_occupied=true, vehicle_lid=null` persistent — parked cars unbound by design; eyes `sheets/session_hiep_toi4/sheet_0002,0003`: slots red on real cars (occupancy itself correct) |
| E-A-020 | ID_FRAGMENT/NEW_ID hiep2 cam2 f115–153, lids 10,11,12 | hiep2 | **Phenomenon CONFIRMED / harm UNSURE** | predictions: lid11 f138–164 + lid12 f153–178 share bbox ≈[248,565,29,38] (overlap f153–164, gid NULL both); lid10 f72–93 separate object [202,680,51,35]; own render `sheets_v5c/hiep2/sheet_0001` cam2 f110–170: boxes bind real black car at left edge, no swap visible |
| E-A-034 | SLOT_BINDING_ERROR sang9 cam1 f1–61, D03/D05 | hiep_sang9 | **Phenomenon CONFIRMED / harm UNSURE** | slot records f2–61 identical signature (`vision_occupied` + `vehicle_lid=null`); same design-inherent basis as E-A-011 |

## FP per type (V5-C sampled denominator — separate from C own-review)

| type | sampled | phenomenon CONFIRMED | REJECTED (FP) | harm UNSURE |
|---|---|---|---|---|
| GID_NEW_LINEAGE_LOSS | 1 | 1 | 0 | 1 |
| SLOT_BINDING_ERROR | 2 | 2 | 0 | 2 |
| ID_FRAGMENT/NEW_ID | 1 | 1 | 0 | 1 |

In-sample: **4/4 phenomenon CONFIRMED, 0/4 REJECTED, 4/4 harm UNSURE** — consistent with A's UNSURE statuses; no finding upgraded to confirmed-defect by C eyes.

## Out-of-sample audit (top CONFIRMED of A — separate denominator, not part of seed sample)

Rule applied: REJECTED/UNSURE as claimed-type when the box sits on a real car/fixture (phenomenon ≠ type). Lifespans from `predictions.jsonl observations`; eyes on A's cited cells + own render.

| finding | type claimed | verdict (type) | evidence |
|---|---|---|---|
| E-A-001 | FALSE_DETECTION test1 cam2 f60–298 (lid74, lid115) | **CONFIRMED (partial-UNSURE)** | lid115 [204,63,78,202] gid NULL 20f — tall box on the black tripod/post fixture at left frame-edge (real non-vehicle object → detection fired off-car, type holds). lid74 [582,182,33,63] 46f (matched16/frozen15/coast14) — top-row car region; the "false" portion for real-car boxes is UNSURE. `sheets_e006/sheet_0003` viewed |
| E-A-002 | GHOST_TRACK test1 cam2 f100 (lid74 46f, lid85 41f) | **REJECTED as ghost** | lid85 [848,178,96,166] 41f frozen_ambiguous-dominant, box sits on top-row parked cars in sheet_0003 cells — stuck/frozen track on REAL car, not phantom on empty space. Phenomenon real (frozen/gid-NULL persistence) → reclassify toward frozen-track issue; same precedent as V5-A E-B-003 |
| E-A-003 | DUPLICATE_TRACK test1 cam2 f100 (lid111↔lid120 IoU 0.57) | **CONFIRMED** | predictions: lid111 f83–104 [696,265,62,80] vs lid120 f92–109 [683,265,57,83] — co-exist f92–104 same position, both gid NULL. Duplicate lids on one object verified |
| E-A-030 | FALSE_DETECTION sang9 (cam2 f51 burst ~20; cam1 f441–466 14–15) | **UNSURE-type (mixed)** | data: cam2 lid18 f34–66 33f coasting-dominant [969,244,30,40]; cam1 lids9–18 all spawn f441–443, ~24f, gid NULL. Eyes `sheets_events/sang9/sheet_0012`: burst boxes land BOTH on empty floor/lane (true false-detections) AND on real parked cars (spurious tracks on real objects ≠ phantom). Mixed population → type UNSURE, phenomenon CONFIRMED |
| E-A-031 | GHOST_TRACK sang9 cam1 f441–466 (lids 9–18) | **UNSURE-type (mixed)** | same evidence — several boxes visibly on real cars (`L8/L9/L10/L13/L15` on occupied slots), several on empty floor left-edge/lane. Corrected claim already gid NULL ✓ |

### Audit FP per type (separate denominator — do NOT merge into seed-sample table)

| type | audited | CONFIRMED-type | REJECTED-type | UNSURE-type (mixed/other defect) |
|---|---|---|---|---|
| FALSE_DETECTION | 2 | 1 (E-A-001, fixture portion) | 0 | 1 (E-A-030) |
| GHOST_TRACK | 2 | 0 | 1 (E-A-002) | 1 (E-A-031) |
| DUPLICATE_TRACK | 1 | 1 (E-A-003) | 0 | 0 |

Audit headline: **5 audited → 2 CONFIRMED-type, 1 REJECTED-type (E-A-002 ghost→stuck-track), 2 UNSURE-type**. FP-defect rate cannot be estimated from the seed sample (all 4 landed on UNSURE-status findings); type-accuracy issues surface only in audit, denominator = 5 audited findings.

## Merged coverage note

`V4-help-A-runtime-bt.md` (A event-dense own-review, 30/30 sheets) contributes **472 unique (cam,frame)** — merged into ERRORS-C coverage as union with C cells (bt union ≥ 532 unique so far; recompute after B-thai7 help lands). E-ABT-1 (33 gid-NULL phantom boxes cam2 f2–42) + E-ABT-2 (fixture boxes alive@EOF) corroborate C's E-C-006 ghost/false-detection row — independent builder, same signature.

## Repro

- hiep2 independent cells: `make_sheets.py --session experiment_test/output/verify_cur_session_hiep2 --video-dir experiment_test/output/session_hiep2 --cam 2 --frames "110,125,140,150,160,170" --window-pad 0 --out sheets_v5c/hiep2`
- test1/toi4/sang9 evidence viewed in A's published dirs (`sheets_e006/session_test1`, `sheets/session_hiep_toi4`); data checks on `predictions.jsonl` (`observations`, `slots`, `identity_events`).

## Resample note

Pool above covers A's 4 frozen short sessions only. When A's long sessions (thai6, hiep_thai1, …) freeze into `errors-a.json`, re-run seed-20261005 over the **full final pool** — do not reuse this partial sample as campaign FP rate.

## Final resample — full frozen A-pool (2026-10-06, sau A findings-freeze)

Pool = `errors-a.json` freeze 26 findings − EXPECTED(9) − NO-ERROR(3) = **13**
(1 UNSURE, 7 MIXED, 3 CONFIRMED, 2 REJECTED — statuses as frozen by A).

`random.Random(20261005).sample(pool, ceil(20%)=3)` → **{E-A-020, E-A-036, E-A-042}**

| finding | type | session | A status | C verdict (independent) |
|---|---|---|---|---|
| E-A-020 | ID_FRAGMENT/NEW_ID hiep2 cam2 f115–153 | hiep2 | UNSURE | **phenomenon CONFIRMED / harm UNSURE** — reuse audit lượt 1 (lid11/12 share bbox ≈[248,565,29,38] overlap f153–164 gid NULL; own render `sheets_v5c/hiep2` boxes on real black car). A closure kept UNSURE; no new evidence → verdict stands |
| E-A-036 | FALSE_DETECTION thai6 cam2 f5882–5924, lids 313-322 burst | thai6 | MIXED | **MIXED verified** — data: 8 lids spawn f5882–5899 tentative-dominant gid NULL; lid317 [760,136,56,81] overlaps slot C08 polygon (center 781,209) while record f5901 `occupied=false, instant=false, raw_ratio=0.007` → floor-confirmed portion đúng như A; in-lane lids 313/314/315/320/322 static tentative — eyes `sheets_uniform_thai6/sheet_0010` r3c3: yellow boxes ở top-strip, không phân giải được real-object vs floor từng lid → UNSURE portion đúng |
| E-A-042 | FALSE_DETECTION thai1 cam2 ~f1900–2100 (uniform s0004) | thai1 | REJECTED | **REJECTION verified** — `predictions.jsonl`: lid17 cam2 **gid=1 confirmed** moving [401,94,98,48]→[347,92,103,47] f1900–1911 (và tiếp f1965–2003 theo A); eyes `sheets_uniform_thai1/sheet_0004`: green box ôm **xe teal thật** đang chạy làn trên qua nhiều cell, không phải nền trống → claim "box on empty lane" đúng là reject |

Resample verdicts: **3/3 A-statuses upheld** (1 UNSURE, 1 MIXED, 1 REJECTED đều đúng). **0/3 type-FP** trong mẫu; pool 13 → FP type-level ước tính **0% (0/3)**, nhưng mẫu rất nhỏ + không rơi vào CONFIRMED-defect nào → không suy rộng; kết hợp audit table phía trên (1 REJECTED-type/5 audited) làm cận thận.

Chiến dịch V5 state: A→B final xong (V5-A.md), B→C final xong (0/2 resolved, FP không ước-tính), **C→A final = bảng này** (3/3 upheld). Full-pool cross-check đủ 3 chiều.
