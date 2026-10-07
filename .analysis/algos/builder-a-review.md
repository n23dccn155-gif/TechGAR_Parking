# Review log — dossier builder-a (PHASE 1, vòng 3 — review rewrite A)

Ngày: 2026-10-04 · File đối tượng: `.analysis/algos/builder-a.md` · Phạm vi: FRONTEND `frontend/src`.

## 1. Lệnh kiểm chứng đã chạy

| Lệnh | cwd | Kết quả |
|---|---|---|
| `node verify-fixtures.mjs` | `D:\TechGar2\.analysis\algos` | **44 PASS, 0 FAIL** (+7 dòng trace/INFO) |
| `node verify-fixtures2.mjs` | `D:\TechGar2\.analysis\algos` | **42 PASS, 0 FAIL, 6 INFO** (vòng 3: +8 assert mới) |

Tổng: **86 assertions, 0 fail**. Script port nguyên logic từ source (`frontend/src/routing/routeEngine.ts`, `frontend/src/routing/voiceGuidance.ts`, `frontend/src/calibration/worldToSvg.ts`, `frontend/src/hooks/useVehicleSession.ts`, `frontend/src/domain/sessionParking.ts`, `frontend/src/domain/runtime.ts`, `frontend/src/stores/parkingStore.ts`, `frontend/src/recommendation/recommendationEngine.ts`, `frontend/src/components/ParkingMap.tsx`, `frontend/src/components/EntryQRKiosk.tsx`, `frontend/src/app/MonitorApp.tsx`, `frontend/src/mocks/MockParkingDataSource.ts`, `frontend/src/geometry/parkingGeometry.ts`) — chạy node thuần, không server/network/model, không đụng production.

Lần chạy đầu `verify-fixtures2.mjs` (vòng 2) fail 2 assert do **bug trong harness test của tôi** (`tick(t)` nhận giây nhưng `endAt` mili-giây) — đã sửa `tick(t*1000)` và chạy lại xanh; không phải sai logic product.

**Assert mới vòng 3 (8):** mini `buildLaneGraph` FIX-GEOM1 — `allY=[1,3,6,9]`, `V=21`, `E=21`, right-chain one-way, spot-edges `[left-3=>spot-Z01, left-6=>spot-Z02, right-3=>spot-B01, right-6=>spot-B02]`, `spot-*` out-degree=0; exclusion-proof G1b — exclude→nearest `r4=>c4` d=0.6, no-exclude→`c4=>sC05` thắng d=0.2.

## 2. Expected values đã sửa sau khi thực thi

| # | Vấn đề review | Sửa thành | Bằng chứng |
|---|---|---|---|
| 1 | A* trace vừa `h3.44` vừa `h5.55` cùng start | Trace chính xác 7 pops: `entrance(0,5.546)→ec(1,6.192)→r7(3,6.311)→r4(6,7.4)→c7(5,8.059)→c4(8,8.6)→sC05(8.6,8.6)`; ghi rõ c7 được expand nhưng relax thua | `verify-fixtures.mjs` trace inbound |
| 2 | "đích sink → null" mơ hồ | Viết lại: route **TỪ** sink → null (open cạn, `g[end]=∞`); route **TỚI** sink bình thường | `findExitRoute("C05")=null`; `findVehicleRoute("C05")=8.6` |
| 3 | Voice timeline `t2.5 SKIP <2s` mâu thuẫn | Timeline mới 7 event: `(0 SPEAK)(1.0 SKIP:cooldown)(1.2 SKIP:<2s)(3.0 SPEAK)(3.5 SPEAK:urgent)(4.0 SKIP:cooldown)(10.0 SPEAK)` → **4 SPEAK / 3 SKIP** nhất quán | `verify-fixtures2.mjs` voice log |
| 4 | Turn fixture: ngưỡng 35/150 nuốt ví dụ | Bảng scale chung: ARRIVE `0.5`, TURN_NEAR `2.5`, off-route `1.0`, projection `1.0` (unit ≈90px); mọi ví dụ voice/off-route dùng ngưỡng fixture, ghi rõ giá trị product | bảng "Quy ước scale" |
| 5 | QR `S3 còn 90s, now+61s hết hạn` sai | FIX-QR1 chuẩn hoá: S2 +40s, S3 +90s → `pick(0)=S3`, `pick(+45s)=S3`, `pick(+95s)=null`; + case fallback `createdAt+120s` | `verify-fixtures2.mjs` qr checks |
| 6 | Arrows route 500 ghi mũi 480 | `target < total−45` → 500 chỉ có `100,290` (**2 mũi**); 600 → `100,290,480` (3) | `arrows@500 xs=[100,290]` |
| 7 | zoomAt center ghi (150,112.5) | `(0,0,1200,900) ×0.5 tại (0.5,0.5)` → `x'=0+(1200−600)·0.5=300, y'=(900−450)·0.5=225` → **(300,225,600,450)** | `verify-fixtures.mjs` zoomAt |
| 8 | Exit-vá path `sC05,c4,c2,r2,xc,exit` | Tie-break thực tế chọn `[sC05,c4,r4,r2,xc,exit]` cost **6.6** (c4→r4 pop trước do nodeOrder, c2 relax thua strict `<`) | `verify-fixtures.mjs` patched exit |
| 9 | Thiếu tie-break fixture | Thêm FIX-G2 (s,a,b,t đối xứng f=2,g=1) → `s,a,t` do `nodeOrder` | trace tie |
| 10 | Chưa phân biệt "progress" thật | Ghi tường minh: **không có** progress-distance/state algorithm; chỉ có route-co-ngắn (`routeFromPos`) và `closestIndex` proxy | mục "Lưu ý route progress" |
| 11 | Projection điểm mạnh chưa chứng minh loại spot-entry | ~~Demo: V(6,4.5) tới `c4=>sC05` d=0.64 < 0.5~~ **SAI — thay ở vòng 3** (xem §2b.1): cạnh spot-entry đồng tuyến làn nên 0.64 > 0.5, không thắng | bất đẳng thức sai — superseded |
| 12 | One-way projection chưa demo | Thêm case `routeFromPos(7.2,8)` → `ec=>r7` one-way → chỉ cạnh `vehicle-pos→r7`, route 6.6 không quay đầu | `oneway proj` check |
| 13 | Thiếu demo stale `closestIndex` | Thêm: V(7,8) trên route inbound → "rẽ phải" dù khúc cua ec đã qua | `stale-closest demo` INFO |
| 14 | `liveRuntimeError` "cameras rỗng" mơ hồ | Verify: `cameras` chỉ cam1 vẫn **pass** (Partial Record) — ghi rõ adapter xử lý cam thiếu riêng | case 8 → null |
| 15 | `selectSessionSpot` null → `continue` | Ghi rõ không phân biệt null-locked/null-failed `[code]` | đọc `App.tsx:447-470` |
| 16 | `position.reference` không check trong `runtimeVehiclesOnSvg` | Thêm giả định vào mục chưa xác minh | `worldToSvg.ts:115-133` |

## 2b. Sửa vòng 3 (review rewrite A)

| # | Vấn đề review | Sửa thành | Bằng chứng |
|---|---|---|---|
| 1 | `drivable-edge-project`: claim "d=0.64 < 0.5" bất đẳng thức sai | Bỏ claim; variant G1b đã verify: `sC05(5,4.6)` lệch làn, xe `(5.2,4.6)` — exclude → `r4=>c4` d=**0.6**; no-exclude → `c4=>sC05` thắng d=**0.2** → chứng minh exclusion đổi winner | `verify-fixtures2.mjs` §15c, 2 PASS |
| 2 | `route-edge-validator` complexity thiếu chi phí build Map | `O(E + R)` time (E cạnh build Map + R lookup), space `O(E)` | text dossier |
| 3 | `lane-graph-build` complexity mất term sort | Giữ `O(V + E + R·log R)` + **space O(V+E)** | text dossier |
| 4 | `lane-graph-build` demo suông, số phụ thuộc | FIX-GEOM1 JSON cụ thể (3 làn x=1/4/7, 4 ô, 2 connector, 1 anchor) → `[đã chạy]` `allY=[1,3,6,9]`, **V=21, E=21**, spot-edges 4, spot out-degree 0 | `verify-fixtures2.mjs` §15b, 6 PASS |
| 5 | Nhiều entry chỉ ghi time | **Space explicit cho đủ 42/42** (O(1) → O(V+E)/O(S) tuỳ thuật toán) | audit bảng §3 |
| 6 | Pseudocode `buildLaneGraph` chi tiết lệch code | Sửa: `rowYValues` lấy ô đầu tiên khớp `number` (1 đại diện/hàng — `laneGraph.ts:73-77`); zone `else → right` (B,A + mọi zone khác, `:147-149` — không phải center/throw); thêm edge-case junction thiếu bị bỏ qua lặng | đọc lại `laneGraph.ts:30-163` |
| 7 | Xác nhận contract `algo-web/SPEC.md` | 42 ID dossier = **37 canonical frontend + 5 alias do builder-c quản lý** (`live-runtime-validator`, `frame-cursor-guard`, `runtime-request-coalesce`, `qr-visibility-window`, `canonical-gid-chain`); thêm bảng mapping sau inventory | `algo-web/SPEC.md` §2 + §Alias |

## 3. Bảng kiểm đủ field cho 42 ID

Cột: R=role, IO=input/output, P=pseudocode đánh số, DS=data structures, CX=complexity(+biến/giả định), E=edge case+bug-vs-demo, S=sample JSON+expected, SB=storyboard.

| # | ID | R | IO | P | DS | CX | E | S | SB |
|---|---|---|---|---|---|---|---|---|---|
| 1 | `lane-graph-build` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 2 | `adjacency-directed-expand` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 3 | `astar-find-route` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 4 | `spot-route-wrappers` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 5 | `drivable-edge-project` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 6 | `pos-route-wrappers` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 7 | `route-edge-validator` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 8 | `gate-node-mutate` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 9 | `spot-rank-score` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 10 | `recommendation-promote` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 11 | `point-segment-dist` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 12 | `off-route-detect` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 13 | `turn-instruction` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 14 | `voice-speak-throttle` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 15 | `session-commit-guard` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 16 | `session-action-serialize` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 17 | `session-refresh-dedupe` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 18 | `action-id-gen` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 19 | `completion-key-build` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 20 | `canonical-gid-chain` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 21 | `occupancy-classify` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 22 | `spot-event-reducer` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 23 | `live-runtime-validator` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 24 | `frame-cursor-guard` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 25 | `runtime-request-coalesce` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 26 | `qr-visibility-window` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 27 | `affine-fit-transform` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 28 | `world-svg-project` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 29 | `vehicle-svg-project` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 30 | `route-polyline-simplify` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 31 | `route-arrow-place` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 32 | `viewbox-pan-zoom` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 33 | `parking-geometry-gen` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 34 | `spot-ownership-map` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 35 | `parking-counts-derive` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 36 | `driver-flow-machine` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 37 | `nav-goal-resolve` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 38 | `invalid-spot-recovery` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 39 | `parked-marker-fallback` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 40 | `gate-line-derive` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 41 | `parking-decision-resolve` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 42 | `mock-scenario-emitter` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |

**42/42 đủ field.** Các ID trước thiếu đã bổ sung: `action-id-gen` (pseudocode+DS+CX), `recommendation-promote` (CX+DS), `session-refresh-dedupe` (IO+CX), `gate-line-derive` (IO+DS+CX+JSON), và tương tự cho mọi utility còn lại.

## 4. Assertions đã verify theo nhóm

| Nhóm | Assertions chính (đã chạy) |
|---|---|
| A*/routing | inbound path+distance, 7-pop trace, sink→null, patched-exit 6.6, tie-break G2, projection 0.5/1.6/5.0, one-way no-backtrack, far→null |
| Voice/off-route | minD 3 case, route-rỗng→false, 5 câu instruction (trái/phải/đích/thẳng/exit), stale-closest "rẽ phải", timeline 4 SPEAK/3 SKIP |
| Session-sync | commit 7-case sequence, runAction lock calls=1, refresh dedupe 1 fetch, coalesce 3err/1 fetch, liveRuntimeError 8 case, frame cursor 5 case |
| Resolver | 11 case kinds + completionKey + 2 reason |
| Geom/render | affine x/y + project + 2 null-case, canonical 5 case, simplify, arrows 500/600/120, zoomAt, pan |
| Flow/misc | reducer 4 case + counters, classify 5 case, completionKey 4 case, marker fallback 2 case, promote 3 case, gate side+acceptedPoint, spotY, reroute commit A09, mock counts {43,8,5,4}, reco ranking S2/S3/S1 |

## 5. Blocker / chưa xác minh còn lại

| Mục | Trạng thái | Cần |
|---|---|---|
| `.at(-1)` kiosk thứ tự waiting | `[giả định]` | builder-c xác nhận `getWaitingSessions` ordering |
| `onWheel` passive preventDefault | `[giả định]` | kiểm chứng browser thật (demo dùng non-passive listener) |
| `METERS_PER_MAP_UNIT=0.12` | `[giả định]` | đối chiếu calibration world (builder-b) |
| `position.reference` trong `runtimeVehiclesOnSvg` | `[giả định]` mọi position là world | contract builder-c |
| zone→aisle mapping ngoài 6 zone | **đã chốt `[code]` vòng 3**: `else → right` (`laneGraph.ts:147-149`) — mọi zone ngoài {F,E,D,C} map right, không throw | — |
| `qrExpiresAt` format | giả định ISO `Date.parse` | contract builder-c |
| `pnpm test/build` | không chạy phiên này | kết quả cũ trong `artifacts/VALIDATION.md` |
| hiệu năng demo canvas trên điện thoại | chưa kiểm chứng | phase build web |

**Ghi chú môi trường:** Windows, Git Bash, node v24.18.0; không server/camera/hardware; không cài dependency; không sửa code/config sản phẩm — chỉ file trong `.analysis/algos/`.

## 6. File đầu ra

- Dossier: `D:\TechGar2\.analysis\algos\builder-a.md` (42 ID, 12 lesson)
- Script kiểm chứng: `D:\TechGar2\.analysis\algos\verify-fixtures.mjs`, `D:\TechGar2\.analysis\algos\verify-fixtures2.mjs`
- Review log (file này): `D:\TechGar2\.analysis\algos\builder-a-review.md`
