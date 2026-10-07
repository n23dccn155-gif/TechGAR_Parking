# V4-help-A — dense-5 review `verify_cur_runtime_session_bt` (assist C)

Session official PASS, 1529 frames @25fps. Windows = C's 5 nhóm (`windows/event-groups.json` → `windows/bt-allgroups.txt`, 34 spans → merged pad±15 → 7 mega-windows). Sheets: `.analysis/verify-replay/sheets_v4h_bt/` — 30 sheets / 472 cells / 236 frames, grid 4×4, step5. **All 30 eyeballed.**

## Coverage

- Unique (cam,frame) viewed = **472 / 3058 = 15.4%** (index.json).
- Sheets 1–30 all viewed; **skipped = 0** in rendered set.
- Uncovered frame ranges (computed from index.json, outside merged windows): **f1–37, 279–476, 559–573, 1001–1066, 1098–1103, 1173–1198, 1449–1485, 1527–1529** — reason: outside C's 5-group windows; flagged for optional uniform pass. Inside covered windows, step-5 sampling means 4f gaps between samples by design.
- Sheet→frame map: index.json authoritative (per-sheet ranges, e.g. s1 f38–73, s7 f278–507, s28 f1399–1434, s30 f1511–1526).

## Findings (§5)

| id | type | cam | frames (t) | lid/gid/bbox | metric | sheet/cell | sev | conf | status |
|---|---|---|---|---|---|---|---|---|---|
| E-ABT-1 | FALSE_DETECTION | cam2 | f2–42 burst (vd f38) | 33 stale_prediction boxes, ALL gid NULL — vd lid1 [316,166,215,191], lid5 [1060,215,116,289], lid8 [65,66,72,129] | 33 concurrent phantom boxes ~40f | sheet_0001 cell2 (cam2 f38) | S2 | HIGH | CONFIRMED |
| E-ABT-2 | FALSE_DETECTION | cam1+cam2 | f1374–1432 + f1500–1529 (alive@EOF) | cam1 lid21 [1183,96,53,51] gidNULL 30f; cam2 lid64 [64,64,116,144] gidNULL 30f, lid66 [128,75,46,65] 21f; cam1 lids13–16 + cam2 lids56–58 f1374–1429 | vehicle-label boxes on REAL static fixture (wooden post/pipe at frame edge) + post-occlusion bursts; gid NULL → no identity harm; not ghost (object exists, label wrong) | s27–30 top-edge cells; index f1381-1433 | S2 | MED | CONFIRMED |
| E-ABT-3 | OBSERVED | cam2 | parked duration | gid19 parked mid-row flickers `Xc|ambiguous`↔FREEZING across s13–14 | association flicker on real static car | s13–s14 right-column cells | — | — | OBSERVED (expected transitional; not error) |
| E-ABT-4 | NO_ERROR | both | events windows | gid8 parked stable; traversals tracked green across entry/exit/handoff/parking windows (s3–26) | consistent gid through windows | s2–s26 broad | — | — | NO-ERROR |

## Cross-check vs ERRORS-C

- Consistent with C's pattern: warmup/edge-object coasting, gid-NULL phantom bursts, boundary fixtures. E-ABT-2 adds concrete late-session alive-at-EOF lids (cam1 lid21, cam2 lid64/66).
- No occupancy corruption seen — slot colors match cars in every cell; slot latch consistent.
- Suggest C merge E-ABT-1/2 under its false-detection/ghost rows; E-ABT-3 as observation only.

## Repro

```
.\.venv\Scripts\python.exe experiment_test\verify\make_sheets.py --session experiment_test\output\verify_cur_runtime_session_bt --video-dir experiment_test\output\runtime_session_bt --windows-file .analysis/verify-replay/windows/bt-allgroups.txt --window-step 5 --grid 4x4 --out .analysis/verify-replay/sheets_v4h_bt
```
Data query for lid lifetimes: predictions.jsonl `association_state!=measurement` filter per cam/frame.
