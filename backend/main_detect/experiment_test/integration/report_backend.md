# Backend Verification Report — branch `thai27_9`

Date: 2026-09-27 (local checkout `thai27_9`, 11 restored files staged under `experiment_test/`)
Diff reviewed: `git diff an27_9 origin/thai27_9 -- backend/session_manager.py backend/gate_session_controller.py` (+ two_camera.py, test files for context)

---

## 1. Pytest results

### Suite A — `backend/main_detect/tests/` (run from `D:\TechGar2\backend\main_detect`)

```
........................................................................ [ 16%]
........................................................................ [ 32%]
........................................................................ [ 48%]
........................................................................ [ 64%]
........................................................................ [ 81%]
........................................................................ [ 97%]
............                                                             [100%]
444 passed in 5.76s
```

**444 passed, 0 failed.**

### Suite B — `backend/tests/`

- As instructed (`pytest backend/tests/` from `D:\TechGar2`): **collection fails** — `ModuleNotFoundError: No module named 'session_manager'` / `'gate_session_controller'` on all 4 test modules. Not a missing-dep issue (fastapi etc. are irrelevant); the modules live in `backend/`, and `backend/tests/` has no `conftest.py`/`sys.path` shim. `python -m pytest` adds only the cwd to `sys.path`, so the suite must be run **from `backend/`**.
- Run correctly from `D:\TechGar2\backend` (`./main_detect/.venv/Scripts/python.exe -m pytest tests/ -q`):

```
..........................................F..........                    [100%]
FAILED tests/test_vehicle_sessions.py::test_waiting_qr_is_hidden_after_ten_seconds_without_being_claimed
1 failed, 52 passed in 3.74s
```

Failure detail (real, reproducible):

```
def test_waiting_qr_is_hidden_after_ten_seconds_without_being_claimed(monkeypatch, tmp_path):
    use_temporary_store(monkeypatch, tmp_path)
    session_id = session_manager.create_session(global_vehicle_id=42, session_id="expires")
    session = session_manager.get_session(session_id)
    created_at = datetime.fromisoformat(session["createdAt"])
    assert session_manager.list_waiting_sessions(now=created_at + timedelta(seconds=9, milliseconds=999)) == [session]
>   assert session_manager.list_waiting_sessions(now=created_at + timedelta(seconds=10)) == []
E   AssertionError: assert [{'sessionId': 'expires', 'state': 'WAITING_FOR_SCAN', ...}] == []
E    Left contains one more item
backend/tests/test_vehicle_sessions.py:80
```

The test still asserts the 10-second QR window; `QR_DISPLAY_SECONDS` is now 120.0 (`backend/session_manager.py:29`). `test_vehicle_sessions.py` was **not** touched by the diff — the constant was changed without updating this test → genuine red test on `origin/thai27_9`.

Per-file: `test_session_http_v2.py` 4/4 pass (incl. `test_navigation_reservation_is_atomic_and_visible_to_other_sessions`), `test_parking_episodes_v2.py` + `test_gate_session_coordinator.py` all pass (39/39 combined with http file).

## 2. `--help` smoke results (venv python, cwd `backend/main_detect`)

| Tool | `--help` works? | Notes |
|---|---|---|
| `validate_session.py` | ✅ | argparse, exit 0 |
| `diagnose_identity_churn.py` | ✅ | argparse, exit 0 |
| `evaluate_manual_tracking.py` | ❌ | No argparse — `sys.argv[1:]` treats `--help` as a directory (line 48). Worse: crashes with `UnicodeEncodeError` on the default cp1258 Windows console printing the Vietnamese banner (`experiment_test/evaluate_manual_tracking.py:7` — `'\u1ebe' … charmap`). With `PYTHONIOENCODING=utf-8` it runs and prints `Khong tim thay: --help\manual_tracking.csv`. The banner print crashes the tool on this console even with real dir args. |
| `replay_continuation_suite.py` | ✅ | argparse, exit 0 |
| `verify_parking_load.py` | ✅ | argparse, exit 0 |
| `migrate_schema_v3.py` | ✅ | argparse, exit 0 |

## 3. Diff review — answers a–e

### a) `list_navigation_reservations()` + `_NAVIGATION_RESERVATION_STATES` — session_manager.py:220-252, :33

- **State filter is complete.** `targetSpotId` is set only in `select_spot` (line 381) while forcing state to `NAVIGATING_TO_SPOT`/`RELOCATING` (line 380), and cleared by `set_parked` (414), `select_spot(None)` (387), `set_exit_navigation` (464). Invariant `targetSpotId set ⇔ state ∈ {NAVIGATING_TO_SPOT, RELOCATING}` holds in all `_mutate_session` paths.
- **spotId match:** caller compares `item["spotId"] == str(spot_id)` (gate_session_controller.py:77); the function already emits `str(spot_id)` (line 244) — consistent.
- **Self-block:** impossible — `_validate_selection` passes `exclude_session_id=str(session.get("sessionId"))` and the function skips that session (line 238). Verified by test: winner re-selecting another spot gets 200, loser can take the released spot.
- **Two sessions, same spot:** not possible within one process. `validate_selection` runs inside `select_spot`'s `mutate()`, which executes under `_STORE_LOCK` (`_mutate_session` line 318), and `_STORE_LOCK` is a `threading.RLock` (line 31) so the re-entrant `load_sessions()` in `list_navigation_reservations` is safe — check-and-set is atomic vs `ThreadingHTTPServer` threads.
- **Caveat:** atomicity is per-process. Two controller processes sharing `backend/data/navigation_sessions.json` (no file lock) could double-book. Deployment-dependent, low risk.
- **Caveat:** `session_manager.py:640` CLI `--select-spot` calls `select_spot` without `validate_selection` — admin path can bypass reservations (likely intentional).

### b) `exclude_session_id` normalization — correct

Caller: `str(session.get("sessionId") or "")` (gate_session_controller.py:75); callee: `excluded = str(exclude_session_id) if exclude_session_id else None` (session_manager.py:231) then `session.get("sessionId") == excluded` (line 238). Stored sessionIds are normalized to `str` in `_normalize_session` (line 128) and created via `str(session_id or secrets.token_urlsafe(12))` (line 283). Empty-string edge collapses to `None` (no exclusion) — harmless since sessionId is always set. The GET endpoint passes the raw query param (`gate_session_controller.py:765-767`), already str. **No bug.**

### c) `_latest_spot_availability` `source_mode is None` fallback — gate_session_controller.py:166-175

- **Does NOT leak into live/replay mode.** `source_mode` is always set on runtime snapshots: `two_camera.py:2856` emits `"live" if (live_mode or replay is None) else "replay"`. `source_mode is None` only occurs for the file-mode `_sample_snapshot` (`gate_session_controller.py:715-735`), which builds `{"vehicles":…, "recent_events":[]}` with no `source_mode`. `_fresh_live` (line 103) requires `source_mode == "live"`; a `"replay"` snapshot still returns `None` → 503 as before. One process runs either file or runtime mode (`main()` picks one source, lines 896-899) — no cross-feed.
- **BUT the fallback is dead code (REAL BUG, see §5-B1):** it calls `_spot_is_available(sample_data, spot_id)` where `sample_data = frontend/public/parking_status_sample.json`. That file has schema `{"timestamp","source","slots": {"A01": {"status","confidence"}}}` — a `slots` **dict**, no `parking_slots` list. `_spot_is_available` (lines 92-100) requires `snapshot["parking_slots"]` as a list of `{slot_id, occupied, status}` → always returns `None` → `avail is None` → falls through to `return True`. **In file mode every spot is treated as available, always** — the sample file's actual occupancy is never consulted; fails open (also `except Exception: pass` + `return True` for missing file/missing spot).
- Residual risk: an older/foreign runtime publishing snapshots without `source_mode` would silently fall into this sample/always-True path.

### d) `QR_DISPLAY_SECONDS` 10→120 — session_manager.py:29

- Consumers of the constant: `_qr_expires_at` fallback (line 88) and creation-time `qrExpiresAt` stamp (line 302). `list_waiting_sessions` filters on `current_time < _qr_expires_at` (lines 213-214) — so WAITING sessions now stay visible 120 s.
- Frontend synced in the same diff: `EntryQRKiosk.tsx` `QR_DISPLAY_MS = 120_000` (was 10_000), and it prefers explicit `session.qrExpiresAt` anyway (line 10). Old sessions keep their stored 10 s `qrExpiresAt` (explicit wins over fallback, line 82-84) — self-consistent.
- **Coupling found:** `backend/tests/test_vehicle_sessions.py:80` still asserts hiding at 10 s → the one failing test above. No other 10 s assumption found in backend or frontend.

### e) `_matches_runtime` relaxation — session_manager.py:179-180

`runtime_id is None or session.get("runtimeId") is None or session.get("runtimeId") == str(runtime_id)` — a session with `runtimeId=None` now matches **every** runtime query. Consequences (confirmed by code paths):

- `create_session` dedup (lines 276-281): a stale file-mode session (runtimeId=None) for the same `globalVehicleId` is returned instead of creating a runtime-scoped session → live vehicle inherits a None-runtime session (which also skips the `RUNTIME_MISMATCH` guard at gate_session_controller.py:70 since `session.get("runtimeId")` is falsy).
- `find_session_by_global_id` (line 194): live tracking can attach to / mutate a stale file-mode session.
- `list_waiting_sessions(runtime_id=live)`: stale file-mode QRs surface on the live kiosk.
- Reservations: a stale None-runtime session in NAVIGATING/RELOCATING blocks **all** runtimes' selectors; a live reservation likewise blocks file-mode selectors (`runtime_id=None` query matches everything). Two different live runtimes stay isolated from each other (e.g. "run-1" vs "run-2") — correct.
- **So:** a stale file-mode session cannot *steal* a live reservation (its `select` sees all reservations → 409 SPOT_RESERVED), but it *does* consume live capacity by blocking, and vice-versa. Combined with there being **no reservation TTL/sweeper** — sessions are freed only by exit-gate deletion (`gate_session_controller.py:526`) or explicit API delete — a session abandoned mid-navigation holds its spot reservation indefinitely. Dead-runtime reservations are isolated (filtered by runtimeId), but None-runtime stale reservations are global.

## 4. predictions.jsonl / two_camera.py check

- `predictions.jsonl` records are `prediction_payload` serialized at `two_camera.py:3054-3056` and written at line 3071. Fields come from `PredictionV3Builder.build_frame` (`src/techgar/prediction_writer.py:470-503`): `schema_version, frame_idx, capture_unix_ns, wall_time_iso, camera_timestamps_ns, camera_skew_ms, trail_render_only, association_trajectory_policy, observations, slots, gid_aliases, identity_events, parking_events, parking_recovery, parked_identity_reservations` plus caller-added `parking_episodes`, `pending_parking_confirmations`, `parking_pipeline` (two_camera.py:3044-3053). **No `source_mode` — confirmed excluded.**
- The branch diff to `two_camera.py` is exactly: new `--live-mode` argparse flag (`store_true`, default off — line ~1746) + the `source_mode` expression change at line 2856 feeding `build_runtime_snapshot` (the HTTP snapshot to `runtime_publisher`, port 8001) — it does not touch `prediction_payload`. **Prediction bytes are unaffected.**

## 5. Test coverage of reservation logic

- `backend/tests/test_session_http_v2.py::test_navigation_reservation_is_atomic_and_visible_to_other_sessions` (lines 96-134) — **passes** and is genuinely good coverage: concurrent `select` on the same spot via `ThreadPoolExecutor` → exactly `[200, 409]` with `code == "SPOT_RESERVED"` (atomicity); `GET /api/sessions/reservations?sessionId=<loser>` returns `["A01"]` (endpoint + exclude_session_id); winner re-selects A02 → 200 (self-exclusion); loser then selects freed A01 → 200 (release-on-reselect).
- `test_unknown_and_another_runtime_are_not_empty_slots` (lines 83-93) covers the RUNTIME_MISMATCH → 409 ordering before reservation checks.
- `snapshot()` helper (test_parking_episodes_v2.py:13-19) emits `source_mode="live"`, fresh `published_at`, online camera — exercises `_fresh_live`.
- `frontend/src/tests/session-navigation.test.tsx` exists and mocks `getNavigationReservations` (frontend suite — out of pytest scope here).
- **Coverage gap:** no test exercises the file-mode `source_mode is None` fallback — which is why bug B1 below went unnoticed. No test covers stale-reservation TTL (there is none) or None-runtime cross-mode blocking.

## 6. Real bugs found

| # | Severity | Bug |
|---|---|---|
| B1 | **Medium** | `gate_session_controller.py:166-175` — file-mode availability fallback is dead code. `parking_status_sample.json` schema (`slots` dict of `{status,confidence}`, written by `backend/sample_tracking_simulator.py:215-220`) does not match `_spot_is_available`'s expected `parking_slots` list of `{slot_id,occupied,status}` → every `select` in file mode returns available=True. Occupied/nonexistent spots are selectable; fail-open. Verified live: `_spot_is_available(sample, 'A01')` → `None`. |
| B2 | **Medium** (CI red) | `QR_DISPLAY_SECONDS` bumped to 120 without updating `backend/tests/test_vehicle_sessions.py:80` → suite has 1 failing test on `origin/thai27_9`. Update test to 120 s (or make it read the constant). |
| B3 | **Medium-low** | No TTL/cleanup for reservations: a session stuck in `NAVIGATING_TO_SPOT`/`RELOCATING` (lost tracking, closed browser, crash before exit) holds its spot reservation forever; only exit-gate deletion (`gate_session_controller.py:526`) frees it. None-runtime stale sessions block *every* runtime (relaxed `_matches_runtime`). |
| B4 | **Low-medium** | `_matches_runtime` relaxation lets stale file-mode (runtimeId=None) sessions be adopted by live runtimes (`create_session` dedup returns them; `find_session_by_global_id` mutates them) and show on the live waiting list. Likely intentional legacy compat, but it is a real cross-mode contamination channel both directions. |
| B5 | **Low** | `evaluate_manual_tracking.py` — no argparse (`--help` becomes a directory arg) and crashes on the stock Windows cp1258 console with `UnicodeEncodeError` on its Vietnamese banner (line 7). Other restored tools pass `--help`. |
| B6 | **Info** | `session_manager.py:640` CLI `--select-spot` bypasses `validate_selection` (can double-book — admin override?); reservation atomicity is per-process only (two controller processes sharing `navigation_sessions.json` are unprotected). |

### Non-bugs verified

- `main()` forcing `LEGACY_GATE_CONFIG` for `--source` mode (gate_session_controller.py:872-873) is a correct fix: without it, file mode would load `gate_zones.json` (world space) when present and silently mis-apply gates; the world-space guard only fires when `args.source is None`.
- `/api/sessions/reservations` response deliberately omits `sessionId`/`globalVehicleId` (privacy) — frontend `App.tsx:97-106` only needs `spotId`; matched.
- `log_message` filter updated for the new endpoint — consistent.
