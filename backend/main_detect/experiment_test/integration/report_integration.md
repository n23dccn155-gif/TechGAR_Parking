# Integration Audit — thai27_9 (post refactor+merge)
Scope: dead refs, docs, config paths, sample JSONs, run_runtime_demo.ps1, session-data compat, stray artifacts.
Audit by integration-sweep agent; lead verified load-bearing claims + applied fixes.

## 1. Dead-ref sweep — OK (zero breaking refs)
- `src/techgar/__init__.py` clean; `VehicleTracker` class absent (TrackStatus/TrackedVehicle retained); no `deep_reid`/`evaluation_v3`/`direction_detector`/`parking_detector_parallel`/`single_camera`/`detect_car_update`/`opencv_test_js_2`/`parking_yolo_utils` refs in code.
- `cross_camera_manager.py:391-397` — `use_deep_reid=True` raises ValueError by design.
- tests/test_validate_session.py + test_migrate_schema_v3.py import restored modules — present.

## 2. Docs — issues found
- **README.md stale**: `pip install ultralytics tensorflow` (lead-verified: zero ultralytics/torch imports; requirements = opencv/numpy/lap); Render auto-sim claim; yolov8n.pt/cnn_parking.h5 listing. FIXED by lead.
- **system-overview.md stale**: nonexistent cm_02–05 configs, wrong roi_mask/calibration/snapshot formats, branch label Hiep3_9. DEFERRED (bulk rewrite, low risk).
- **Thesis docs** (phan_tich_*.md, kich_ban_*.md, thuat_toan_techgar.md, algorithms-documentation.md, techgar_backend_analysis.md) describe deleted modules as live (~65 refs). DEFERRED — archival/presentation material; flagged for user.
- CLAUDE.md tech-stack line still says YOLOv8/CNN — corrected by lead (motion-based detection).
- Nothing documents sample_tracking_simulator regenerating sample JSONs — noted.

## 3. Config paths — OK
All live config paths exist + parse. calibration = schema v5 (camera_transforms, parking_slots_world, calibration_quality).

## 4. Sample JSONs
- vehicle_positions_sample.json OK.
- parking_status_sample.json schema mismatch (slots dict vs parking_slots list) → fallback dead/fail-open. **FIXED** in gate_session_controller.py (fallback now reads slots dict).

## 5. run_runtime_demo.ps1 — OK
Diff: adds repo-root .venv candidate + `--replay-realtime --live-mode` demo args. All 18 flags verified live. Media files absent (gitignored) → -CheckOnly throws expected error.

## 6. data/ compat — OK
Reservations derived (targetSpotId + state), not persisted. `_normalize_session` backfills all keys — old records compatible.
NOTE: sample_tracking_simulator.py writes `{}` to navigation_sessions.json at startup (wipes sessions) + writes frontend/public/navigation_sessions.json which nothing reads (dead write).

## 7. Stray artifacts — OK
No nul/.orig/.rej/.bak strays. git status verified by lead: 11 staged restores + lead fixes only.
