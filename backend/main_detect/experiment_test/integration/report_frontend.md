# Frontend Verification Report — branch `thai27_9`

Diff base: `an27_9` → `origin/thai27_9`. Verified on a fresh checkout of `thai27_9` (clean tree except staged backend experiment scripts).

## 1. Gate results (run from `D:\TechGar2\frontend`)

| Gate | Command | Result |
|------|---------|--------|
| Lint | `npm run lint` (`eslint . --max-warnings 0`) | **PASS** — exit 0, no output |
| Build | `npm run build` (`tsc -b && vite build`) | **PASS** — exit 0, 1669 modules, built in 13.40s (`dist/assets/index-DZmcjqJl.js` 330.81 kB) |
| Unit tests | `npx vitest run` | **PASS** — 14 files / 70 tests, 0 failures, ~31s |

Per-file vitest results (all passed):

- `runtime-freshness.test.ts` 2, `spot-ownership.test.ts` 3, `session-parking-resolver.test.ts` 13,
  `runtime-integration.test.ts` 4, `ownership-and-store.test.ts` 6, `routing.test.ts` 6,
  `recommendation.test.ts` 5, `entry-qr-kiosk.test.tsx` 4, `session-consistency.test.tsx` 6,
  `invalid-spot-warning.test.tsx` 1, `realtime-source.test.tsx` 2, `monitor.test.tsx` 3,
  `app-flow.test.tsx` 6, `session-navigation.test.tsx` 9 — **total 70 passed / 0 failed**. No verbatim failure output exists.

## 2. `routeEngine.ts` — Dijkstra → A* review (frontend/src/routing/routeEngine.ts:31–118)

### 4a. Heuristic admissibility — **CORRECT**

- `costPerMapUnit` = min over edges of `edge.distance / euclidean(edge)` (routeEngine.ts:38–45); `h(n) = euclidean(n, target) * costPerMapUnit` (routeEngine.ts:46–50).
- In this codebase every graph edge's `distance` is exactly `distanceBetween(a,b) = Math.hypot(a.x-b.x, a.y-b.y)` (laneGraph.ts:51 via parkingGeometry.ts:287–289; temp edges routeEngine.ts:155 also use `Math.hypot`). So every ratio is exactly `1.0` → `heuristicScale = 1` → `h` = straight-line distance. Straight-line distance ≤ any polyline path cost (triangle inequality) and every edge cost equals its own euclidean length → **admissible and consistent** (h(n) ≤ cost(n,n′) + h(n′)).
- The `min` (not max) is the *safe* direction: even if a future edge were a "shortcut" (cost < euclidean), min-ratio would only shrink h further, never overestimate. The hypothetical risk flagged in the task (shortcut edges → overestimate) does not materialise with `min`; it would materialise with `max` or if zero-length edges with negative/zero cost existed — neither possible here (`addEdge` computes distance from geometry, laneGraph.ts:43–54; zero-length edges are skipped at routeEngine.ts:43).
- Edge cases handled: empty/dangling-only edge list → `costPerMapUnit = Infinity` → `heuristicScale = 0` → degrades to Dijkstra (routeEngine.ts:46). `start === end` returns a single-node, distance-0 route (line 79 break + line 92–117).

### 4b. Tie-breaking — **DETERMINISTIC**

- Frontier selection is a strict lexicographic order on `(f = g+h, g, nodeIndex)` where `nodeIndex` is position in `graph.nodes` (routeEngine.ts:37, 61–75). Node indices are unique, so the order is total — the winner is independent of `Set.forEach` insertion order. No `Math.random`, no object-key-order reliance (all `Map`s / arrays with fixed build order). IEEE-754 comparisons are deterministic across browsers.
- `previous` updates use strict `<` on distance (routeEngine.ts:83) over the fixed `graph.edges` array order — deterministic.

### 4c. Same routes as Dijkstra? — **Same optimal cost; node sequence in practice identical, not contractually pinned**

- A* with a consistent heuristic returns an optimal path and expands each node at most once (reopen path at routeEngine.ts:87 is dead code here but keeps correctness for inconsistent heuristics). Same optimal `distance` as Dijkstra guaranteed.
- On equal-cost ties, the new `(f,g,index)` order can in principle pick a different predecessor than old Dijkstra's insertion-order min — a *different but equally optimal* route. In this asymmetric lane graph equal-cost alternatives are unlikely; no test asserts an exact `nodeIds` sequence. `routing.test.ts` asserts only endpoints + aisle prefixes + `routeUsesOnlyValidEdges` (routing.test.ts:6–61); `session-navigation.test.tsx` asserts `selectSpot` calls/DOM, not route geometry. All 70 tests pass.
- Early exit on target pop (`if (current === endNodeId) break`, routeEngine.ts:79) is valid under admissible h, including the reopening variant.

### 4d. Signature / callers — **UNCHANGED**

- `findRoute(graph, startNodeId, endNodeId): RouteResult | null` and `RouteResult {nodeIds, edgeIds, points, distance}` (routeEngine.ts:11–16, 31) unchanged. Callers `findVehicleRoute` / `findExitRoute` / `routeFromPos` (routeEngine.ts:120–166), `App.tsx:720–758`, `recommendationEngine.ts:49–50` all use it identically. No behavioral-regression risk in the contract.

## 3. Reservation consumers — `SPOT_RESERVED` (HTTP 409)

- **Backend emits**: `gate_session_controller.py:79–84` `_validate_selection` → `SelectionUnavailable("SPOT_RESERVED", 409)`; JSON `{error, code}`.
- **Error mapping**: `backendApi.ts:19–28` `parseResponse` → `BackendApiError(message, status, code=payload.code)`. `error.code === "SPOT_RESERVED"` reaches UI logic — **handled, not raw**.
- **Manual select path** (`App.tsx:794–820`): `selectSessionSpot` throw → `SPOT_RESERVED`/`SPOT_NOT_AVAILABLE` → `showInvalidSpotWarning` with `status: "reserved"` → warning dialog text `"Ô {id} đã được xe khác chọn và đang được giữ chỗ."` (parking.ts:160–163) + A*-ranked alternatives; `return false` → navigation not started. Other errors (transport/timeout) → `console.warn` + `sessionError` banner (App.tsx:929–942) via `useVehicleSession.ts:170`.
- **Auto-reroute path** (`App.tsx:421–476`): on `target_occupied_by_other` decision, tries up to 3 `recommendParkingSpots` alternatives; `SPOT_RESERVED`/`SPOT_NOT_AVAILABLE` → try next; success → `confirmSpot` + `auto-reroute-notice` banner (App.tsx:1148–1152) + Vietnamese voice announce; all fail/fatal error → `showInvalidSpotWarning`. Deduped by `autoRerouteKeyRef = sessionId:revision:spot:otherVehicleId` (App.tsx:442–444).
- **Reservation overlay**: `getNavigationReservations(sessionId)` polls `/api/sessions/reservations` every 500 ms (App.tsx:167–198); backend excludes the viewer's own reservation (gate_session_controller.py:764–777 → session_manager.py:231–238), so own target is never painted yellow. Empty spots in `reservedSpotIds` get `status:"reserved", decisionSource:"navigation_reservation"` in the `spots` memo (App.tsx:97–110); `NON_EMPTY_STATUSES` includes `"reserved"` (App.tsx:33) → non-selectable (`handleConfirmSpot` App.tsx:790–791; `handleSpotClick` App.tsx:828–829 still inspectable in browse) and never recommended. Amber styling exists: index.css:435, 608–609; legend card + summary card added (ParkingLegend.tsx:3, SummaryCards.tsx:14, STATUS_LABELS parking.ts:117). Poll failure keeps last overlay — selection still enforced server-side (comment App.tsx:180–183). Camera `occupied` outranks reservation (overlay only on `status==="empty"`).
- `parkingStore.ts` diff is only `reserved: 0` in `deriveParkingCounts` initialiser (line 50); `EntryQRKiosk.tsx` diff is `QR_DISPLAY_MS` 10s→120s (line 6, matching backend `QR_DISPLAY_SECONDS` change).

## 4. Playwright e2e `tests/e2e/real-session-api.spec.ts` — **cannot run as-is**

- Line 28: `process.env.TECHGAR_TEST_PYTHON ?? path.resolve("../.venv/Scripts/python.exe")`. Playwright's cwd is `D:\TechGar2\frontend` (config testDir `./tests/e2e`, playwright.config.ts:4) → resolves to `D:\TechGar2\.venv\Scripts\python.exe` — **verified nonexistent**. Real venv is `D:\TechGar2\backend\main_detect\.venv\Scripts\python.exe` (verified exists).
- `TECHGAR_TEST_PYTHON` is **undocumented** — its only occurrence in the repo is this line; no README/CLAUDE.md/docs mention.
- The fixture `backend/tests/browser_session_server.py` exists and imports only stdlib + `session_manager`/`gate_session_controller` (both stdlib-only: json/http.server/urllib/secrets) — so ANY Python 3 suffices; it does not need the AI venv.
- To run: `set TECHGAR_TEST_PYTHON=<any python>` or create `D:\TechGar2\.venv`; plus `pnpm` on PATH for the `pnpm dev` webServer (playwright.config.ts:17–22; pnpm 11.25.0 present) and Playwright browsers installed.
- The spec itself covers the new features end-to-end: asserts 409/`SPOT_RESERVED` rejection, `data-status="reserved"` overlay on a second session, and `auto-reroute-notice` → `targetSpotId` becomes "A02" (spec lines 85–113).

## 5. `frontend/AGENTS.md` diff — diff itself coherent; pre-existing staleness remains

The diff correctly documents the new behaviour (reserved status colour, A*-ranked auto-reroute, never-recommend-reserved). Stale/inconsistent items (mostly pre-existing, not introduced by this diff):

- "Build the **frontend only**… must run without any backend" — stale: the app integrates real session/runtime APIs (`backendApi.ts`, `runtimeApi.ts`, EntryQRKiosk polling `getWaitingSessions`).
- Spot inventory "A01–A30…F01–F10, Total 160 spots", "two opposing parking rows", cam ownership ranges (01–08/16–23, 09–15/24–30) — stale: code generates `SPOTS_PER_ZONE = 10` (parking.ts:6) × 6 zones, single row per zone → **60 spots** (parkingGeometry.ts:160–193).
- "Do not show a QR code inside the app" vs `EntryQRKiosk.tsx` rendering a QRCode — rule/code tension (kiosk mode `/?session=ALL`).
- "Lint, typecheck, unit tests, Playwright, and build pass" — Playwright gate currently unreachable without the undocumented `TECHGAR_TEST_PYTHON` (see §4).
- `packageManager: pnpm@10.14.0` + `pnpm-lock.yaml` present (no package-lock.json) — consistent with "Use pnpm"; npm still works for the gates.

## 6. Bugs found (severity-ranked)

1. **[Medium] E2E suite cannot run out of the box.** `real-session-api.spec.ts:28` default python path `D:\TechGar2\.venv\Scripts\python.exe` does not exist → `spawn` ENOENT → `beforeEach` rejects ("Session fixture did not start" / spawn error). Only workaround is undocumented env var `TECHGAR_TEST_PYTHON`. Any stdlib Python works; fix = document the var or point default at `../backend/main_detect/.venv/Scripts/python.exe`.
2. **[Low] `findRoute` lost the dangling-edge guard (robustness regression).** Old code skipped steps to nodes absent from `graph.nodes` (`!unvisited.has(step.to)`); new code calls `heuristic(step.to)` which dereferences `nodeById.get(nodeId)!.x` → `TypeError` if an edge references a missing node (routeEngine.ts:48, 81–88). Unreachable via `buildLaneGraph` (`addEdge` throws, laneGraph.ts:46) and `routeFromPos`, but `findRoute` accepts arbitrary `LaneGraph` — latent crash on malformed input.
3. **[Low] Auto-reroute flashes a raw English error banner.** Each `SPOT_RESERVED`/`SPOT_NOT_AVAILABLE` rejection inside the auto-reroute loop goes through `runAction`'s catch → `setError({message: payload.error, action:"select"})` (useVehicleSession.ts:167–177) → `role="alert"` banner shows the English backend message ("Parking spot is reserved by another navigation session: A02") while alternatives are tried; cleared on next accepted commit. Cosmetic; consider suppressing `setError` for expected reservation conflicts.
4. **[Info] Equal-cost path choice may differ from old Dijkstra.** Tie-break changed from unvisited insertion order to `(f,g,nodeIndex)`; returned route is still optimal, no test pins exact node sequences, all pass.
5. **[Info] Per-session 500 ms reservations polling** (`App.tsx:189`) — read-only GET; each call reloads all sessions server-side (`load_sessions()`, session_manager.py:233). Fine at expected scale; worth noting.
