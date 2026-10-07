# V4-help-A — Thai1 event-dense partial review (sheets 0036–0096)

Helper review by **A** for C's event-dense set `sheets_v4h_thai1/`.
**Scope**: A's assigned slice only — sheets `sheet_0036.jpg`..`sheet_0096.jpg` (61 sheets).
C reviews `0001–0035` and `0097–0157`; C merges the union. This file does NOT claim the
full set is reviewed.

- Session: `verify_cur_session_hiep_thai1` — official PASS **6050/6050**, 25 fps, frames 1-based.
- Review basis: `sheets_v4h_thai1/index.json` (authoritative for sheet↔cell membership).
- No replay performed. No C file, sheet, manifest, runtime, config, or test modified.
- Overlays discipline: large yellow polygon = ROI outline; thin slot outlines = slot
  polygons; only captioned G#/L# boxes counted as tracks.

## 1. Coverage (computed from `index.json` cells of the 61 reviewed sheets)

| Metric | Value |
|---|---|
| Sheets reviewed | **61/61** (0036–0096), 0 rendered-sheet skipped |
| Cells | **549** (9 per sheet, 3×3 grid) |
| Unique (cam, frame) pairs | **549** (no double-count inside the range) |
| cam1 frames | 274, span f1096–2860 |
| cam2 frames | 275, span f1091–2860 |
| Range frame span | **f1091–2860** |
| `has_record=False` cells | 0 |

Overlap with A's own uniform set (`sheets_uniform_thai1`, 242 pairs) is not double-counted
here; union happens at campaign level per MEGAPLAN.

## 2. Per-sheet review status

All sheets eyeballed cell-by-cell. Frame span per sheet from `index.json`:

```
036 f1091-1111 | 037 f1116-1136 | 038 f1136-1278 | 039 f1283-1303
040 f1303-1323 | 041 f1328-1348 | 042 f1348-1368 | 043 f1373-1393
044 f1393-1413 | 045 f1418-1438 | 046 f1438-1458 | 047 f1462-1561
048 f1561-1581 | 049 f1586-1606 | 050 f1606-1626 | 051 f1631-1651
052 f1651-1671 | 053 f1676-1696 | 054 f1696-1716 | 055 f1721-1741
056 f1741-1761 | 057 f1766-1786 | 058 f1786-1806 | 059 f1811-1831
060 f1831-1851 | 061 f1856-1876 | 062 f1876-1896 | 063 f1898-1939
064 f1939-1959 | 065 f1964-1984 | 066 f1984-2004 | 067 f2009-2029
068 f2029-2049 | 069 f2054-2074 | 070 f2074-2094 | 071 f2099-2119
072 f2119-2182 | 073 f2187-2207 | 074 f2207-2230 | 075 f2235-2265
076 f2265-2285 | 077 f2290-2310 | 078 f2310-2339 | 079 f2344-2364
080 f2364-2384 | 081 f2389-2409 | 082 f2409-2429 | 083 f2434-2454
084 f2454-2474 | 085 f2479-2499 | 086 f2499-2606 | 087 f2611-2663
088 f2663-2683 | 089 f2688-2708 | 090 f2708-2726 | 091 f2730-2750
092 f2750-2770 | 093 f2775-2795 | 094 f2795-2815 | 095 f2820-2840
096 f2840-2860
```
(every sheet: both cameras, 9 cells each — see `index.json`)

## 3. §5 findings

**NO_ERROR** — no §5 finding supported by image + prediction evidence in A's range.

Throughout f1091–2860 all rendered track boxes with G#/L# captions sit on real vehicles
(parked cars in rows, moving cars/bikes in lanes, vehicles parked in aisle edge areas).
All slot outlines align with painted slots; occupied vs free rendering is consistent.
Handoff/transitional magenta boxes (PARKING/AMB states) are on real vehicles.
No ghost box on empty floor, no oversized box, no slot misalignment observed.

## 4. Observations / noise / expected (not §5)

- **OBS-1 — tentative box on floor debris (sheet_0055)**: cam1 `lid24`
  `[494,198,37,29]` `tentative`, `gid=NULL` at f1721–1726; `lid22` `[428,180,103,52]`
  `lost`, `gid=NULL` at f1721. Boxes sit on a dark elongated object lying on the wooden
  floor at top-left edge (visible in cells), i.e. a real object, not empty floor.
  Transient (~2 frames tentative, then gone), no gid, no slot binding → edge
  false-detection noise on non-vehicle debris. Observation only.
- **OBS-2 — person edge noise (sheet_0055, elsewhere)**: bare feet/shoes at mat edge
  bottom-right / frame edges in several cells — not boxed. Expected.
- **OBS-3 — transitional colors**: magenta/yellow boxes labeled PARKING/AMB/Xc on real
  vehicles (e.g. s82 `GID:16`, s84 PARKING on mid-row car, s91 AMB on purple car) are
  state transitions on real objects — expected behavior.
- **OBS-4 — overlay reminder**: the large yellow polygon is the ROI outline and thin
  outlines are slot polygons (confirmed at s57); they are NOT detections and were not
  counted as tracks anywhere in this range.
- **Clean event windows**: entry/exit along top and mid lanes (black car f2400–2500,
  cyan/teal car in mid aisle f2300–2726, motorcycle top-right f1811–1851), parking
  transitions, and occlusions at frame edges — all tracked on real objects. NO_ERROR.

## 5. Reproduction

From `backend/main_detect`:
```
py ../../.analysis/verify-replay/scan_frames.py --session verify_cur_session_hiep_thai1 ...
py ../../.analysis/verify-replay/make_sheets.py --session verify_cur_session_hiep_thai1 \
  --windows-file <windows> --window-pad 15 --merge-gap 30 --window-step 5 --grid 3x3 \
  --out ../../.analysis/verify-replay/sheets_v4h_thai1
```
Raw evidence: `experiment_test/output/verify_cur_session_hiep_thai1/predictions.jsonl`
(observations: `camera_id`, `local_track_id`, `canonical_gid`, `bbox`, `track_state`).
Cell↔frame mapping: `.analysis/verify-replay/sheets_v4h_thai1/index.json`.

## 6. Boundary statement

- This report covers **only sheets 0036–0096** of `sheets_v4h_thai1` (61/162 sheets).
- Union coverage is pending C's review of 0001–0035 and 0097–0157; do not treat the
  Thai1 event-dense set as complete until C merges.
- No C file modified. No replay. Runtime/config/tests frozen.
