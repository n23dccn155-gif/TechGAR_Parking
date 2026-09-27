# Refactor — Lead-adjudicated removal list (refactor_20_9)

Baseline: pytest 486/486 · frontend build+lint+vitest 70/70 · bt replay sha256=c12ab00838628e8e

## APPROVED — backend root

| Item | Evidence (lead-verified) | Cascade |
|---|---|---|
| `backend/opencv_test_js_2.py` | zero code imports; docs-only refs | `parking_yolo_utils.py`, `parking_slots_polygon.json`; doc edits CLAUDE.md/README/system-overview |
| `backend/parking_yolo_utils.py` | sole importer = opencv_test_js_2.py | — |
| `backend/ParkingSpacePicker_ve_js.py` (root) | unrunnable (`dataset/` absent), superseded by `main_detect/tools/ParkingSpacePicker_ve_js.py` | `CarParkPos` pickle, `parking_slots_2.json` |
| `backend/CarParkPos` | only touched by root picker | — |
| `backend/parking_slots.json` (root 640px) | zero readers | — |
| `backend/parking_slots_2.json` | only written by removed picker | — |
| `backend/parking_slots_polygon.json` | only read by removed demo | — |
| `backend/sample_tracking_simulator.py` | docs-only refs; `--source` mode in gate controller stays (generic JSON file mode) | doc edits CLAUDE.md/README/system-overview (drop Sample Mode section) |
| `backend/detect_car_update/` (whole dir) | self-contained legacy single-cam tracker; nothing imports it; superseded by main_detect | `session_manager.py`: strip `POSITIONS_FILE`,`STATUS_FILE`,`watch_loop()`,`--watch` (provably dead after removal — verify nothing else calls them) |
| `plot_graph.py` (root) | reads `frontend/graph.json` stale dump; zero invokers | `frontend/graph.json` + `dump.test.ts` (the graph generator) |
| `runtime_local/` (root) | dead run artifacts pointing at old repo path | — |
| `main_detect/main.py` | 4-pane demo; only reachable via dormant `/api/detection/start` | cascade: remove `start_detection_process` + endpoint + `/api/detection/start` handler in `gate_session_controller.py` (lead-verified: zero frontend/test/e2e callers) |

## APPROVED — main_detect

| Item | Evidence | Cascade |
|---|---|---|
| `single_camera.py` | imported only by record_experiment.py + test_single_camera_cli.py | `experiment_test/record_experiment.py`, `tests/test_single_camera_cli.py`, `config/two_camera_detector.local.json` (its default profile), doc refs |
| `evaluate.py` + `src/techgar/evaluation_v3.py` | evaluation_v3 imported only by evaluate.py + test_evaluate_v3.py | `tests/test_evaluate_v3.py`, doc refs (ablation guide, system-overview, plan-gid-swap-fix, experiment_test/README) |
| `src/techgar/test_improvements.py` | 0 importers | — |
| `config/two_camera.example.json` | 0 refs | — |
| `config/two_camera_detector.example.json` | 0 refs | — |
| `config/two_camera.local.json` | doc-only refs (superseded pre-schema format) | runbook example update |
| `config/two_camera_detector.local.json` | only ref = single_camera.py default | — |
| `.pytest_tmp/` | residue, not gitignored | add `.pytest_*/` to .gitignore (fix underscore/dot mismatch) |
| `run_r3.sh` ALL_R2_DONE echo | copy-paste bug | fix string |
| `config/shared_map_02/` | provenance-only leftover captures, no loader | — |
| `config/parking_slots.json` (main_detect legacy) | picker default output — keep as tool default (harmless data) | — |
| `experiment_test/record_experiment.py` | lead-verified 0 refs repo-wide; orphan single-cam recorder superseded by two_camera sessions | cascade kills `direction_detector.py` |
| `src/techgar/direction_detector.py` | importers = single_camera.py + record_experiment.py only (both removed); main.py does NOT import it | `tools/draw_direction_lines.py`, `config/roi_lines.json`, doc edits (README tree + runbook L113) |
| `tools/draw_direction_lines.py` | only produces roi_lines.json consumed solely by DirectionDetector | `config/roi_lines.json` |
| `config/roi_lines.json` | data for dead direction feature | — |
| `config/botsort_parking_reid.yaml` | single_camera `--tracker` default only | — |
| `src/techgar/parking_detector_parallel.py` | sole importer = test_improvements.py (both unrunnable/orphan) | — |
| `src/techgar/deep_reid_model.py` | `use_deep_reid=True` raises ValueError by design (ccm L408-412); torch not in requirements; reachable only via test_improvements + lazy `__getattr__` | strip `__init__.py` `__all__` + `__getattr__` block; doc refs docs/algorithms-documentation.md:534,564 + system-overview:147 |
| `VehicleTracker` class in `vehicle_tracker.py` | instantiated only by single_camera.py:228 + detect_car_update (both removed); keep `TrackStatus`/`TrackedVehicle` (live via motion_tracker, tests) | remove class + ultralytics guard |
| `CrossCameraManager._promote_from_provisional` (L542-557) | 0 call sites lead-verified; event `identity_promoted_from_provisional` emitted nowhere else, no test asserts it | — |
| `CrossCameraManager._merge_recently_lost_duplicates` (L1414-1471) | 0 call sites; test_recently_lost_* uses public API (still passes) | orphan state: `LostTrackEntry` (L65), `_recently_lost` init (L322) + populate (L1111-1115) + remap (L1387-1388), `_lost_continuation_evidence` (L345). KEEP `_set_identity_dormant` + `local_track_lost` event in notify_track_lost |
| `SlotVehicleBinder.bindings`/`active_departure_tokens`/`get_vehicle_id_for_slot`/`update` (L334,342,346,2648) | 0 call sites; `.bindings` hits all belong to CrossCameraManager/test fakes | — |
| `ParkingDetector.get_roi_polygon` (L647-653) | 0 call sites | — |
| `LatestFrameCapture.skipped_decode_failures` (L117-120) | 0 call sites; `_consecutive_failures` stays | — |
| `occlusion_guard.py` unused `field` import | verified | — |
| `cross_camera_manager.py:2622-2626` commented-out print block | verified | — |

## APPROVED — frontend

| Item | Evidence | Cascade |
|---|---|---|
| `src/dump.test.ts` | debug JSON dump to tempdir, no behavioral assert | also removes need for frontend/graph.json |
| `src/tests/geometry.test.ts` | literal `expect(1).toBe(1)` placeholder | — |
| `frontend/graph.json` | stale dump consumed only by root plot_graph.py | — |
| `routeEngine.ts: findNearestNode` + `findKNearestNodes` | zero callers (lead-verified) | — |
| `voiceGuidance.ts: VoiceOptions`, `getMuted()` | zero refs (lead-verified) | — |
| `eslint.config.js:8`, `tsconfig.app.json:27` | stale `App_Hiep4.tsx` references — file gone | — |
| `package-lock.json` | packageManager=pnpm@10.14.0 → pnpm-lock.yaml authoritative | — |
| `ParkingMap.tsx` dead surface | `vehicle.trail` always `[]` (both producers); `camToMap`/`frameSize` vestigial identity transform (all callers pass identical dims); `svgRef` unused | remove trail render block, camToMap prop+transform, svgRef |
| `EntryQRKiosk.tsx` | `spots` prop + non-standalone variant unreachable (sole caller KioskApp passes standalone, no spots) | remove dead branch + prop |
| `RecommendationPanel.tsx:31` | `useFocusTrap(false,…)` — permanently disabled no-op | remove call |
| `parkingGeometry.ts ZoneGeometry.side/spotIds` | written by generator, never read | REVIEW → minor; keep if cheap |

## REJECTED / KEPT (with reasons)

- `KioskApp`, `MonitorApp`, `monitor.css`, `EntryQRKiosk` core, `qrcode` dep — routed from main.tsx, documented features
- Tailwind toolchain — AGENTS.md required stack even if utilities unused
- `MockParkingDataSource`, `MockControlPanel` — spec-mandated no-backend mode + e2e uses it
- `--source` file mode in gate_session_controller — generic JSON mode, keep
- `public/vehicle_positions_sample.json`, `parking_status_sample.json`, `gate_roi.json` — consumed by gate controller file mode / App fallback
- `backend/requirements.txt` — Render deploy stub
- `backend/data/` — intentional gitignored session store location
- Narrative/analysis docs (phan_tich…, kich_ban…) — historical slide material, not run instructions; leave as-is
- `config/sessions/`, `experiment_test/recovered_cal/`, verify tools — active harness
- test-only exports (routeUsesOnlyValidEdges etc.) — kept by real tests

## Adjudicated — scout A merged (all REMOVE items lead-verified by grep before listing above)

## EXECUTION LOG (lead-verified)

**Phase 3 — 4 implementation agents, all complete:**
- Agent internals: ccm −110 (`_promote_from_provisional`, `_merge_recently_lost_duplicates` + `LostTrackEntry`/`_recently_lost`/`_lost_continuation_evidence` plumbing, commented prints), binder −19, parking_detector −7, latest_frame_capture −5, occlusion_guard −1. Targeted pytest 212/212.
- Agent main_detect: deleted main.py, single_camera.py, evaluate.py, evaluation_v3.py, test_improvements.py, parking_detector_parallel.py, deep_reid_model.py, direction_detector.py, record_experiment.py, draw_direction_lines.py, 2 test files, 6 dead configs, shared_map_02/, .pytest_tmp/; edited `__init__.py`, `vehicle_tracker.py` (VehicleTracker class −258), run_r3.sh, .gitignore, README + runbook + ablation/experiment docs.
- Agent backend root: deleted opencv_test_js_2, parking_yolo_utils, root ParkingSpacePicker, CarParkPos, 3 root slot JSONs, sample_tracking_simulator, detect_car_update/, runtime_local/, plot_graph.py; session_manager −25 (watch internals), gate_session_controller −37 (dormant /api/detection subprocess block — zero callers verified); CLAUDE.md/README/system-overview/algorithms/plan docs updated. backend pytest 52/52.
- Agent frontend: deleted dump.test.ts, geometry.test.ts, graph.json, package-lock.json; routeEngine −17, voiceGuidance −8, ParkingMap dead surface (trail/camToMap/frameSize/svgRef), EntryQRKiosk spots+non-standalone branch, RecommendationPanel dead focus-trap, stale App_Hiep4 refs. lint clean / build ✓ / vitest 14 files 68 tests.
- Lead tidy-up: fixed stale main.py docstrings in two_camera.py + ccm; deleted orphaned requirements-yolo.txt (ultralytics no longer imported anywhere).

**Phase 4 — quarantine rescue + purge (lead-executed):**
- Rescued to `D:\TechGar2_archive\` (outside repo, same-volume move): 49 old sessions × (raw_cam*.mp4 + predictions.jsonl + metadata CSV/JSON) = 444 files; 2 loose raw mp4; 2 screen recordings; 1 pptx backup. Total 13.8 GB, verified 0 raw videos left behind.
- Deleted `_quarantine_20260919` remainder: 11.7 GB debug videos (regenerable) + git-recoverable old file copies + derived runtime/audit outputs + stub CSVs.

**Phase 5 gates so far (lead-run):**
- backend/main_detect pytest: **444/444** (486 baseline − 42 tests in the 2 deleted test files; 41 test files remain)
- backend/tests pytest: 52/52
- frontend: lint clean, build ✓, vitest 14/68
- R5 9-session replay launched; must produce byte-identical predictions vs R4 (refactor removed dead code only).
