# Smart Parking Frontend Validation

## Session Navigation Update (2026-08-23)

This update supersedes the older 160-spot prototype assertions below. The
current shared map contains 48 spots (A01-F08) and is the map used by both the
driver and monitor views.

- `pnpm lint`: PASS, 0 warnings.
- `pnpm typecheck`: PASS.
- `pnpm test`: PASS, 13 files and 44 tests.
- `pnpm playwright`: PASS, 9 Chromium flows.
- `pnpm build`: PASS, 1,665 modules transformed.
- Backend session tests: PASS, 12 tests.

The session regressions prove that an own-vehicle target does not trigger a
false occupied warning, an occupied target offers explicit alternatives, a
stale alternative rejected with HTTP 409 does not change the route, and a car
parked in another spot for two seconds ends inbound navigation at that actual
spot. The sample simulator is now isolated from realtime OpenCV polling and is
subscribed to its event source, so deterministic browser scenarios are no
longer overwritten or silently ignored.

New desktop route evidence is saved as
`artifacts/screenshots/1440x900-c06-navigation.png`.

## Historical Prototype Baseline (2026-07-25)

The remaining sections document the previous 160-spot prototype and are kept
for traceability; they do not describe the current 48-spot shared map.

## Final Command Results

| Check | Result | Evidence |
| --- | --- | --- |
| `pnpm lint` | PASS | ESLint completed with 0 errors and 0 warnings. |
| `pnpm typecheck` | PASS | Strict TypeScript project build completed with 0 errors. |
| `pnpm test` | PASS | 5 test files passed; 29 tests passed; 0 failed; 0 skipped. |
| `pnpm playwright` | PASS | 9 Chromium flows passed; 0 failed; 0 skipped. |
| `pnpm build` | PASS | Vite transformed 1,607 modules and produced `dist/` successfully. |

Production build output:

- `dist/index.html`: 0.55 kB (0.36 kB gzip)
- CSS bundle: 24.43 kB (6.08 kB gzip)
- JavaScript bundle: 245.57 kB (76.72 kB gzip)

## Geometry And State Evidence

- The geometry test rendered exactly 160 unique spot IDs.
- Zones E, D, C, B, and A are ordered by increasing SVG Y coordinate; A is last and at the bottom.
- Each main zone has 30 spots: 15 top-row and 15 bottom-row spots around one center lane.
- The horizontal topology is zones A-E, the main access road, then zone F.
- All five A-E road connectors terminate at the shared main-road centerline X coordinate.
- Zone F has 10 deterministic vertical-strip spots on the right, ordered F01 at the top through F10 at the bottom.
- All ten F anchors face left and have graph-valid right-turn access connectors from the main road.
- Initial canonical counts are 119 empty, 21 occupied, 10 transitioning, and 10 unknown, totaling 160.
- Ownership is disjoint: cam-left owns 80 spots; cam-right owns 70 main-zone spots plus all 10 F spots, also totaling 80.
- Direct store tests prove stale revisions are ignored and unauthorized camera events are rejected.
- Camera-offline tests prove the camera health degrades while the last known spot states remain unchanged.

## Recommendation And Routing Evidence

- Recommendation tests cover all three supported needs and prove every returned spot is `empty`.
- Amber spots are excluded from eligibility, selection, and recommendation.
- Invalidating an unconfirmed best spot recalculates the top three without a reload.
- A route is absent before explicit recommendation confirmation.
- Manual navigation works from a green browse-selected spot; non-empty spot detail does not expose navigation.
- Route tests connect the entrance to all 160 spot-entry nodes, respect directed graph edges, and verify route points never enter any parking rectangle.
- C10, A05, and E12 tests prove the route rises on the main road, turns left only at the target zone, stays on that zone's center lane, and ends with a 15-unit perpendicular segment.
- The F04 test proves the route turns right from the main road and never enters an A-E graph branch.
- The browser-level C10 assertion proves exactly one rendered route polyline with points `997,858 997,437 621,437 621,422`.
- Confirmed-spot invalidation hides the route, renders the exact status warning, and requires an explicit switch or map action.

## Browser Flows

Playwright passed these end-to-end behaviors in Chromium:

1. Entry to browse to manual empty-spot navigation.
2. Shopping recommendation with no route before confirmation.
3. Dịch vụ recommendation abandoned back to full browse.
4. Giải trí recommendation recalculated after the unconfirmed best turns amber.
5. Confirmed spot becomes occupied, route pauses, warning appears, and an alternative can be selected.
6. cam-left goes offline, health degrades, and owned spot state is preserved.
7. Mobile zoom/reset controls and desktop 160-spot geometry.
8. C10 navigation with one lane-valid rendered SVG route.
9. Mobile and desktop visual capture.

## Screenshots

All captures were produced by Playwright and visually inspected:

- `artifacts/screenshots/390x844-entry.png`
- `artifacts/screenshots/390x844-recommendation.png`
- `artifacts/screenshots/390x844-navigation.png`
- `artifacts/screenshots/1440x900-desktop.png`
- `artifacts/screenshots/1440x900-c10-navigation.png`

The visual test hides the development-only mock toggle before capture. The C10 screenshot was directly inspected against the supplied topology reference: the route starts at `LỐI VÀO`, follows the road between A-E and F, turns left at C, and stops beside C10 without crossing another spot, curb, or landscaped gap. The production build omits the mock panel entirely through `import.meta.env.DEV`.

## Known Limitations

- Parking coordinates, walking distances, access anchors, and camera events are deterministic product mocks rather than surveyed real-world data.
- Automated browser validation covers Chromium. Pan, wheel zoom, pinch handling, and reset are implemented; Playwright explicitly exercises zoom/reset but not a hardware multi-touch pinch gesture.
- No reservation is implied or created. The application deliberately has no backend, authentication, payment, database, QR display, raw video, or camera-calibration surface.

## Definition Of Done

PASS. The frontend runs without a backend, renders the required 160-spot layout with the corrected road topology, implements all four driver modes, enforces stable-empty eligibility, models two independent cameras with deterministic scenarios, renders graph-derived routes, pauses invalid routes without silent redirection, and passes every required validation command.

## Audit-Fix Revalidation — 2026-09-07

The following is the post-fix verification on branch `an5_9`, based on commit `2527e03f` plus the uncommitted audit-fix changes in the working tree. The historical results above are intentionally preserved.

| Check | Result |
| --- | --- |
| `pnpm lint` | PASS, 0 errors/warnings |
| `pnpm typecheck` | PASS |
| `pnpm test -- --run` | PASS, 16 files / 66 tests |
| `pnpm build` | PASS, Vite transformed 1,669 modules |
| `pnpm playwright test` | PASS, 10 Chromium tests |

The browser suite includes the real Python API flow for pending identity, parking in another spot, relocation and exit while stationary. The browser console printed a few expected 404 resource warnings during the run; no test failed.

The shared frontend runtime contract now rejects schema-v1/replay/stale snapshots, missing or offline cameras and invalid camera ages before rendering live guidance. Map and gate overlay share an in-flight snapshot request; a missing `slot_layout` only defers the gate overlay and does not discard static parking state.

These checks establish frontend contract and interaction behavior. They do not establish physical parking accuracy or IDF1 without labeled ground truth, and they do not replace a live DroidCam latency measurement.
