# V2-A — Alignment check (builder-a sessions)

Method: `experiment_test/verify/align_overlay.py` — current ROI (green) + slot polygons (blue, labelled) drawn over `raw_camN.mp4` frames; eyeballed jpgs.

## Result: ALIGNED — all sessions, both cams, f0 + mid

| session | cam1 f0 | cam1 mid | cam2 f0 | cam2 mid |
|---|---|---|---|---|
| session_test1 | ✓ | ✓ (f149) | ✓ | ✓ (f149) |
| session_hiep_toi4 | ✓ | ✓ (sheets overlay) | ✓ | ✓ (sheets) |
| session_hiep2 | ✓ | ✓ (sheets) | ✓ | ✓ (sheets) |
| session_hiep_sang9 | ✓ | ✓ (sheets) | ✓ | ✓ (sheets) |
| session_hiep_thai1 | ✓ | ✓ (f3025) | ✓ | ✓ (f3025) |
| session_thai6 | ✓ | ✓ (f2968) | ✓ | ✓ (f2968) |

- ROI covers mat area; slot polys sit on painted markings; handoff overlap zone consistent.
- sang9 cam2 top-left noise boxes sit INSIDE ROI edge → that region is within configured mask; noise là detection issue, KHÔNG phải misalignment.
- `config_era_suspected`: **none** trên 6 session đã review (thai6: layout cam1 D/E/F + cam2 A/B/C rows khớp cả f0 & f2968, global config roi+slots).

Evidence: `.analysis/verify-replay/alignment/<S>/*.jpg` + ROI/slot overlay visible in sheets.
