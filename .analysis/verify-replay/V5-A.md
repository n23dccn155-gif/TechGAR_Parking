# V5-A — cross-check of ERRORS-B (builder-a, independent eyeball)

Seed **20261005** → `random.sample(errors, ceil(20%))` = **E-B-002** (1/3 errors; OBSERVED/PASS/EXPECTED excluded). E-B-003 audited separately per instruction (semantic, outside sample). Independent renders: `.analysis/verify-replay/sheets_v5a/{b002,b003}` on `verify_cur_session_hiep_toi6` + `session_hiep_toi6` raw.

Verdict vocabulary: **CONFIRMED** (claim stands) / **REJECTED** (claim/type wrong — false positive) / **UNSURE** (insufficient evidence). Phenomenon vs defect separated: a real behavior can be CONFIRMED while its harm stays UNSURE.

## Verdicts

| finding | sample | cells viewed | verdict (phenomenon) | verdict (defect/harm) | note |
|---|---|---|---|---|---|
| E-B-002 ID_FRAGMENT/NEW_ID toi6 f596–612 | yes (seed) | b002 10/10 | **CONFIRMED** — churn happens: event sweep + tentative spawn burst visible in captions; boxes still bind real cars; occupancy intact | **UNSURE** — no visual identity-swap or broken final output seen in sampled cells | consistent with B's "identity_impact UNVERIFIED" |
| E-B-003 GHOST_TRACK toi6 cam1 f611–751 | audit (semantic) | b003 8/8 | **REJECTED** as GHOST_TRACK — `GID:48|COASTING` sits on a real light-blue car half-outside-ROI (static all cells); not a phantom on empty space | n/a | semantic gap = sustained coasting w/o TTL on un-measurable boundary car → recommend reclassify OBSERVED; answers B's TTL question: yes, missing coast-TTL + boundary un-observable |

## FP per type (sampled denominator)

| type | sampled | phenomenon CONFIRMED | REJECTED-type (FP) | defect-harm UNSURE |
|---|---|---|---|---|
| ID_FRAGMENT/NEW_ID | 1 (E-B-002) | 1 | 0 | 1 |
| GHOST_TRACK | 1 (E-B-003, audit) | 0 as ghost | 1 | 0 |

In-sample headline: **1/1 sampled CONFIRMED phenomenon, 0/1 proven harm; audit item REJECTED 1/1** (B's own status was UNSURE — audit resolves it as not-an-error).



## Audit E-B-004/005/007 — `verify_cur_session_hiep_thai4` (ngoài mẫu, theo yêu cầu)

Independent data re-check on `predictions.jsonl` (IoU tính lại trực tiếp) + eyeball B's cited sheets (`sheets_cur/verify_cur_session_hiep_thai4/`). Boxes verified ON real cars (không nhầm slot/episode outlines — tracking box có caption G#/lid trên pixel xe, offset khỏi slot poly).

| finding | evidence re-checked | verdict (phenomenon) | verdict (defect/harm) | note |
|---|---|---|---|---|
| **E-B-004** DUPLICATE_TRACK cam1 | lid1×lid2 IoU **0.46** @f330 ([976,203,50,83]/[986,203,35,54], coasting+frozen_ambiguous, gid NULL); lid9×10×11 @f780 IoU 0.29/0.61/0.24; lid84×86 IoU **0.87** @f2550 ([642,503,38,62]/[644,503,38,60]); lid114×117 IoU 0.56 @f5750. Ảnh: sheet_0102 (cam1 f2351–2375 — xe cyan đầu hàng E có 2 box chồng trên xe thật), sheet_0029 (f789–804 — green+cyan box chồng xe cyan) | **CONFIRMED** — dup lids trên cùng xe vật-lý, IoU thật | **UNSURE** — không thấy slot↔gid conflict trong cells; đồng ý B "identity_impact UNVERIFIED" | type đúng; severity S2 hợp lý (bền 22–33f) |
| **E-B-005** DUPLICATE_TRACK cam2 | lid97×98×99 @f3110 IoU 0.73/0.89/0.80 (lid98 **gid5 matched**, 97 coasting, 99 suppressed_roi_edge_twin); lid36×37 IoU 0.77 @f1350; lid117×118 IoU 0.44 @f4615 (lid117 gid5); lid123×125 IoU 0.70 @f5005. Ảnh: sheet_0133 (f3109–3129 — box chồng xe cyan/trên xe teal mép phải) | **CONFIRMED** — same mechanism E-B-004; interesting: `suppressed_roi_edge_twin` vẫn render như track | **UNSURE** — harm unproven | lid97+99 both gidNULL; suppressed_twin giữ box là đáng chú ý (twin-suppression không xoá track) |
| **E-B-007** ID_FRAGMENT/NEW_ID | xe xanh-nhạt: cam1 lid10 [481,300,86,108] f769–822 → cam2 lid10 [513,319,47,50] f844–874 — cùng anchor vùng ~x480–524,y268–320 (handoff chuỗi đúng); lid19 cam2 [1049,144] f903–929 + lid23 [1136,144] f1030–1058 ở mép-phải — **vị trí khác**, không cùng anchor với xe xanh-nhạt | **CONFIRMED** — chuỗi new_tentative lid mới qua repark/freeze thật (tất cả gid NULL) | **UNSURE** — "cùng 1 xe vật-lý" chỉ chứng minh được cho lid10/11 (cam1→cam2); lid19/23 anchor khác → chuỗi có thể gồm xe khác; churn≠harm đúng như B ghi | claim "xe xanh-nhạt mang {10,11,19,23}" chỉ đúng một phần — giữ CONFIRMED-phenomenon, không nâng lên bug |

**Position note**: tất cả dup/frozen đều gid NULL trừ lid98/lid117 (gid5, matched) — dup ở local-track layer, chưa thấy lan vào canonical gid hay slot-claim sai trong các cell đã xem.

## FP per type — cộng thêm audit thai4 (không phải mẫu seed)

| type | audited | phenomenon CONFIRMED | REJECTED-type | harm UNSURE |
|---|---|---|---|---|
| DUPLICATE_TRACK | 2 (E-B-004, E-B-005) | 2 | 0 | 2 |
| ID_FRAGMENT/NEW_ID | 1+1 (E-B-002 sample, E-B-007 audit) | 2 | 0 | 2 |

## Resample note

ERRORS-B.json errors currently span `verify_cur_session_hiep_toi6` + `verify_cur_session_hiep1` only (hiep1: 0 error rows). When B's remaining sessions reach registry PASS, re-run seed-20261005 sampling over the full error set — do not reuse this partial sample as campaign-level FP rate.

---

## V5 FINAL resample — full E-B pool (post-freeze, 2026-10-06 ~01:xx)

B frozen: 4/4 sessions (toi6, hiep1, thai4, thai3). Full error pool = **E-B-001..009** (9 errors;
OBS/O-entries excluded per convention). `random.Random(20261005).sample(pool, ceil(20%))`
= ceil(1.8) = **2 samples → E-B-005, E-B-009**.

| finding | cells/data re-checked | verdict (phenomenon) | verdict (defect/harm) | note |
|---|---|---|---|---|
| **E-B-005** DUPLICATE_TRACK thai4 cam2 | audit section above — 4 pairs re-verified (IoU 0.44–0.89), ảnh sheet_0133 | **CONFIRMED** — dup lids trên xe thật | **UNSURE** — harm unproven; `suppressed_roi_edge_twin` vẫn render | sample reuses audit verdict (không audit lại) |
| **E-B-009** DUPLICATE_TRACK thai3 cam2 | data re-check toàn bộ 10 pairs claimed: **10/10 co-observed, IoU 0.53–0.96** (16×19 .96 f219, 34×38 .57 f969, 43×44 .65 f1120, 61×62 .70 f2302, 70×72 .79 f2400, 79×81 .82 f2843, 80×84 .74 f2847, 86×95 .53 f2883, 104×105 .89 f3692, 116×118 .87 f4899). Pattern: coasting/frozen × new_tentative twin. Ảnh sheet_0119 (f2841–2861): stacked lid labels left-edge band trên xe đen thật bị cắt mép — khớp lid79×81 [0,369,129,287] | **CONFIRMED** — dup pairs thật trên xe thật, IoU verify độc lập | **UNSURE** — không cặp nào mang 2 gid khác nhau (gidNULL×gidNULL, hoặc gid×gidNULL: lid72→gid1, lid104→gid2) → không conflict identity; đồng ý B "UNVERIFIED" | Correction nhỏ: B ghi "toàn same-gid" — thực tế là gidNULL-dominant, không phải cặp cùng-gid; kết luận "no identity conflict" vẫn đúng |

### FP per type — full pool sampled

| type | sampled | phenomenon CONFIRMED | REJECTED-type (FP) | harm UNSURE |
|---|---|---|---|---|
| DUPLICATE_TRACK | 2 (E-B-005, E-B-009) | 2 | 0 | 2 |

**In-sample headline (seed 20261005, full pool): 2/2 phenomenon CONFIRMED, 0/2 type-FP, 0/2 harm proven.**
Cross-sample totals (mọi audit A→B): ID_FRAG 3/3 phenomenon, DUPLICATE 3/3 phenomenon, GHOST 0/1 (E-B-003 REJECTED-type) — B's false-positive **type rate 1/6 audited** (16.7%, audit-weighted); defect-harm remains UNSURE across all DUPLICATE/ID_FRAG items.
