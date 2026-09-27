# Integration Ledger — thai27_9

## Phase 0 — Baseline (thai27_9 nguyen trang)
- Branch: local `thai27_9` tracking `origin/thai27_9` (head b2817a8f)
- `nul` file removed
- pytest collect: **435 collected, 2 errors** — test_validate_session.py + test_migrate_schema_v3.py import deleted modules
- Topology: an27_9 is strict ancestor of thai27_9 → merge = fast-forward, no git conflicts

## Phase 1 — Harness restore
Restored 11 files from an27_9 into backend/main_detect/experiment_test/:
audit_continuation, audit_parking_stability, audit_replay_window, benchmark_detector_threads,
diagnose_identity_churn, evaluate_manual_tracking, migrate_schema_v3, replay_continuation_suite,
requirements.txt, validate_session, verify_parking_load
- compileall: clean; import smoke all 10 modules: clean
- pytest collect after restore: **444 collected, 0 errors**

## Replay determinism — static equivalence proof (raw footage unavailable)
- `git diff an27_9 origin/thai27_9 -- backend/main_detect/src/ backend/main_detect/runtime_server.py`: EMPTY
- two_camera.py diff: only `--live-mode` flag + source_mode snapshot line
- prediction_payload fields (two_camera.py:3054-3057): build_frame + parking_episodes + pending_parking_confirmations + parking_pipeline — **no source_mode**
- Conclusion: predictions.jsonl byte-identical by construction; bt fingerprint c12ab00838628e8e preserved
- NOTE: experiment_test/output/ (9 acceptance sessions, raw video) is missing from disk — user cleanup. Re-verification needs re-recorded footage.

## Phase 2 — Fleet (dispatched 2026-09-27)
| Agent | Scope | Report | Status |
|---|---|---|---|
| 30841685 backend | pytest both suites + session_manager/gate_controller diff review | report_backend.md | dispatched |
| d5cb489e frontend | lint/build/vitest + A* review + reservation UX + e2e path | report_frontend.md | dispatched |
| 6e55eb2e sweep | dead refs, docs, config paths, sample JSONs, ps1, data compat | report_integration.md | dispatched |

## Findings so far
- gate_session_controller.py adds SPOT_RESERVED (409) in _validate_selection + sample fallback in _latest_spot_availability when source_mode is None
- session_manager.py adds list_navigation_reservations + QR_DISPLAY_SECONDS 10→120 + _matches_runtime relaxation

## Phase 3 — Fixes applied (lead, verified)
| Finding | Severity | Fix | Verified |
|---|---|---|---|
| test_vehicle_sessions.py QR test asserted 10s vs QR_DISPLAY_SECONDS=120 | red test | test now uses QR_DISPLAY_SECONDS constant | 14/14 pass, backend/tests 53/53 |
| _latest_spot_availability fallback read wrong schema (slots dict vs parking_slots list) → dead code, always True | bug | read slots dict {id:{status}} directly | smoke: A01→True, schema OK |
| e2e spec default python ../.venv nonexistent | medium | → ../backend/main_detect/.venv/Scripts/python.exe | path verified exists |
| findRoute dropped dangling-edge guard → TypeError malformed graph | low | restored !nodeById.has(step.to) guard | code review |
| evaluate_manual_tracking cp1258 crash on VN banner | minor | sys.stdout.reconfigure utf-8/replace | runs, prints usage |
| AGENTS.md stale claims (160 spots vs 60, frontend-only) | doc | DEFERRED — spec file, flag to user | — |

## Deferred/notes for user
- No reservation TTL (abandoned NAVIGATING holds spot until exit-gate delete) — design decision of Thai branch
- _matches_runtime relaxed: None-runtime sessions match all runtimes — intentional for file/sample mode
- Reservations polling reloads sessions.json every 500ms per viewer — fine at current scale

