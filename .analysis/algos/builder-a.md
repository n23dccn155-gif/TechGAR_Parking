# Dossier thuật toán — builder-a (FRONTEND TechGar2)

**Phạm vi:** `frontend/src` — routing A*, recommendation, voice/off-route, session sync, affine world→SVG, render map, flow QR/driver, mock data, gate-line derive (UI consumer).

**Không thuộc phạm vi:** homography/CV backend (builder-b); session/gate/QR issuance, snapshot/replay publisher phía server (builder-c). Chỉ mô tả phía frontend tiêu thụ.

**Kiểm chứng:** mọi expected value của sample đã được thực thi bằng 2 script port nguyên logic (không server/network/model):
- `cd /d/TechGar2/.analysis/algos && node verify-fixtures.mjs` → **44 PASS, 0 FAIL**
- `cd /d/TechGar2/.analysis/algos && node verify-fixtures2.mjs` → **34 PASS, 0 FAIL, 4 INFO**

Kết quả routing trên graph thật (103 node/101 cạnh, `findExitRoute` null 60/60) lấy từ bằng chứng thực thi trước (`.analysis/check-routing.mjs`, xem `builder-a.md` phụ lục).

**Quy ước:** `[code]` chắc chắn từ code · `[đã chạy]` đã thực thi · `[demo]` hành vi mô phỏng giáo dục · **BUG** = lỗi hiện có trong code thật · `[giả định]` chưa đủ bằng chứng.

## Quy ước scale cho fixture thu nhỏ

Map thật 1200×900; fixture dùng "unit" (≈90px). Để các ví dụ không bị ngưỡng product nuốt, demo dùng ngưỡng thu nhỏ — **bảng mapping cố định cho toàn dossier**:

| Ngưỡng | Product | Fixture demo |
|---|---|---|
| `checkIsOffRoute` threshold | default `75`px; **App truyền `80`px** (`App.tsx:749`) | `1.0` |
| `routeFromPos` max projection | `60`px | `1.0` |
| `getNavigationInstruction` arrival radius | `35`px | `0.5` |
| `getNavigationInstruction` `distToTurn` near | `150`px | `2.5` |

**Lưu ý "route progress":** code **không có** algorithm theo dõi tiến độ tuyến (% hoàn thành / distance-along-route). Hai thứ có thật là: (a) route được **tái tính từ vị trí xe** mỗi nhịp (tuyến co ngắn — `routeFromPos`), (b) `closestIndex` trong `getNavigationInstruction` là proxy vị trí trên polyline. Demo không được invent progress metric.

---

## 0. Inventory

| # | ID | Thuật toán | Nhóm | Refs (`frontend/src/…`) |
|---|---|---|---|---|
| 1 | `lane-graph-build` | Sinh đồ thị làn đường | routing | `routing/laneGraph.ts:30-163` `buildLaneGraph` |
| 2 | `adjacency-directed-expand` | Sinh hàng xóm có hướng | routing | `routing/routeEngine.ts:18-29` `buildAdjacency` |
| 3 | `astar-find-route` | A*: cost/heuristic/tie-break/reconstruct | routing | `routing/routeEngine.ts:31-119` `findRoute` |
| 4 | `spot-route-wrappers` | Tuyến tĩnh entrance→ô, ô→exit | routing | `routing/routeEngine.ts:121-130` `findVehicleRoute`/`findExitRoute` |
| 5 | `drivable-edge-project` | Chiếu xe lên cạnh + node động | routing | `routing/routeEngine.ts:132-167` `routeFromPos` |
| 6 | `pos-route-wrappers` | Re-route động + exit fallback (BUG) | routing | `routing/routeEngine.ts:174-208` `findExitRouteFromPos`/`findInboundRouteFromPos` |
| 7 | `route-edge-validator` | Kiểm chứng tuyến đúng chiều | routing | `routing/routeEngine.ts:210-222` `routeUsesOnlyValidEdges` |
| 8 | `gate-node-mutate` | Đồng bộ node cổng vào graph | routing | `routing/laneGraph.ts:165-183` `updateGateNodesInGraph` |
| 9 | `spot-rank-score` | Chấm điểm & xếp hạng ô | recommendation | `recommendation/recommendationEngine.ts:16-89` `rankParkingSpots`/`recommendParkingSpots` |
| 10 | `recommendation-promote` | Đổi best khi chọn alternative | recommendation | `recommendation/recommendationEngine.ts:91-102` `promoteRecommendation` |
| 11 | `point-segment-dist` | Khoảng cách điểm–đoạn | voice-nav | `routing/voiceGuidance.ts:75-90` `distanceToSegment` |
| 12 | `off-route-detect` | Phát hiện sai tuyến | voice-nav | `routing/voiceGuidance.ts:95-111` `checkIsOffRoute` |
| 13 | `turn-instruction` | Suy câu chỉ dẫn rẽ/thẳng | voice-nav | `routing/voiceGuidance.ts:118-231` `getNavigationInstruction` |
| 14 | `voice-speak-throttle` | Dedupe/cooldown/urgent TTS | voice-nav | `routing/voiceGuidance.ts:3-70` `VoiceManager.speak` |
| 15 | `session-commit-guard` | Revision guard khi commit | session-sync | `hooks/useVehicleSession.ts:52-93` `commit` |
| 16 | `session-action-serialize` | Khóa action + expected_revision + reconcile | session-sync | `hooks/useVehicleSession.ts:144-190` `runAction` |
| 17 | `session-refresh-dedupe` | Dedupe GET in-flight + timeout 2s | session-sync | `hooks/useVehicleSession.ts:103-142` `refresh` |
| 18 | `action-id-gen` | Sinh action id fallback non-secure | session-sync | `hooks/useVehicleSession.ts:31-35` `createSessionActionId` |
| 19 | `completion-key-build` | Khóa dedupe popup đỗ xong | session-sync | `domain/session.ts:32-36` `buildSessionCompletionKey` |
| 20 | `canonical-gid-chain` | Theo alias gid + phát hiện vòng | session-sync | `domain/runtime.ts:191-202` `canonicalRuntimeId` |
| 21 | `occupancy-classify` | Phân loại ô empty/own/other/unknown | session-sync | `domain/parking.ts:149-158` `classifySpotOccupancy` |
| 22 | `spot-event-reducer` | Event reducer: ownership + revision | session-sync | `stores/parkingStore.ts:81-129` `applyEvent` |
| 23 | `live-runtime-validator` | Contract freshness fail-closed | session-sync | `domain/runtime.ts:116-141` `liveRuntimeError` |
| 24 | `frame-cursor-guard` | Chống frame lùi + watchdog 5s | session-sync | `app/App.tsx:272-287,354-360` `requireLiveRuntime` |
| 25 | `runtime-request-coalesce` | Gộp request + retry-after 2s | session-sync | `api/runtimeApi.ts:6-36` `getRuntimeSnapshot` |
| 26 | `qr-visibility-window` | Cửa sổ QR 120s + chọn cuối còn hạn | session-sync | `components/EntryQRKiosk.tsx:6-17,28-78` `qrExpiryTime`/`isQrVisible`/poll |
| 27 | `affine-fit-transform` | Fit affine least-squares 3×3 | geom-render | `calibration/worldToSvg.ts:11-81` `solve3`/`computeAffine`/`fitAffine` |
| 28 | `world-svg-project` | Chiếu/đảo chiếu + fallback clamp | geom-render | `calibration/worldToSvg.ts:83-113` `createWorldToSvg`/`createSvgToWorld` |
| 29 | `vehicle-svg-project` | Lọc gid canonical + chiếu xe | geom-render | `calibration/worldToSvg.ts:115-133` `runtimeVehiclesOnSvg` |
| 30 | `route-polyline-simplify` | Gộp điểm thẳng hàng | geom-render | `components/ParkingMap.tsx:82-96` `simplifyRoutePoints` |
| 31 | `route-arrow-place` | Đặt mũi tên theo cung dài | geom-render | `components/ParkingMap.tsx:98-123` `createRouteArrows` |
| 32 | `viewbox-pan-zoom` | Pan/zoom/pinch viewBox | geom-render | `components/ParkingMap.tsx:57-66,146-208` `clampView`/`zoomAt` |
| 33 | `parking-geometry-gen` | Sinh geometry 60 ô | geom-render | `geometry/parkingGeometry.ts:118-270` `generateParkingGeometry` |
| 34 | `spot-ownership-map` | Ánh xạ ô↔camera | geom-render | `domain/parking.ts:123-143` `getSpotOwner`/`cameraOwnsSpot` |
| 35 | `parking-counts-derive` | Đếm trạng thái ô | geom-render | `stores/parkingStore.ts:43-52` `deriveParkingCounts` |
| 36 | `driver-flow-machine` | Máy trạng thái UI driver | flow | `stores/driverFlowStore.ts:44-92`; `app/App.tsx:607-632` |
| 37 | `nav-goal-resolve` | Giải đích & tính route theo mode | flow | `app/App.tsx:677-786` |
| 38 | `invalid-spot-recovery` | Auto-reroute commit + warning | flow | `app/App.tsx:421-596,789-825,846-851` |
| 39 | `parked-marker-fallback` | Marker ảo khi PARKED | flow | `app/App.tsx:906-921` `displayedVehicles` |
| 40 | `gate-line-derive` | Suy chiều vạch cổng từ 3 điểm | flow | `app/MonitorApp.tsx:25-54` `acceptedPointForGate`/`gateLineFromPoints` |
| 41 | `parking-decision-resolve` | Resolver quyết định đỗ (9 nhánh) | session-sync | `domain/sessionParking.ts:27-139` `resolveSessionParking` |
| 42 | `mock-scenario-emitter` | Nguồn mock deterministic | data-mock | `mocks/MockParkingDataSource.ts:44-263` |

**Tổng: 42 thuật toán.**

**Đối chiếu `algo-web/SPEC.md` (đã đọc — contract Phase 2):** SPEC danh mục **117 ID canonical** gồm **frontend 37** + CV 57 + integration 23, với **6 alias**. Trong 42 ID dossier này: **37 khớp 1-1** danh mục frontend của SPEC; **5 ID là alias do integration (builder-c) quản lý** — nội dung dossier vẫn là nguồn phía FE gấp vào trang canonical:

| ID dossier | Canonical (owner: builder-c) |
|---|---|
| `live-runtime-validator` | `live-freshness-contract` |
| `frame-cursor-guard` | `frame-cursor-monotonic-poll` |
| `runtime-request-coalesce` | `frame-cursor-monotonic-poll` |
| `qr-visibility-window` | `qr-token-issuance-ttl` |
| `canonical-gid-chain` | `canonical-runtime-id-consumer` |

(Alias thứ 6 `replay-session-sync`→`replay-timestamp-pairing` thuộc phạm vi builder-c, không có trong dossier này.) Dossier giữ nguyên 42 mục — SPEC yêu cầu trang canonical "giữ cả codeRefs và tiểu mục của alias"; builder-c chịu trách nhiệm ghép 5 mục trên vào trang canonical khi implement.

---

## 1. Fixture dùng chung

### FIX-G1 — Mini lane graph (11 node, 12 cạnh)

```json
{
  "entranceNodeId": "entrance", "exitNodeId": "exit",
  "spotEntryNodeIds": { "C05": "sC05" },
  "nodes": [
    {"id":"entrance","kind":"entrance","x":8,"y":9},
    {"id":"ec","kind":"junction","x":7,"y":9},
    {"id":"r7","kind":"junction","x":7,"y":7},
    {"id":"r4","kind":"junction","x":7,"y":4},
    {"id":"r2","kind":"junction","x":7,"y":2},
    {"id":"xc","kind":"junction","x":7,"y":1},
    {"id":"exit","kind":"exit","x":8,"y":1},
    {"id":"c7","kind":"junction","x":5,"y":7},
    {"id":"c4","kind":"junction","x":5,"y":4},
    {"id":"c2","kind":"junction","x":5,"y":2},
    {"id":"sC05","kind":"spot-entry","x":5.6,"y":4}
  ],
  "edges": [
    {"id":"entrance=>ec","from":"entrance","to":"ec","distance":1,"direction":"one-way"},
    {"id":"ec=>r7","from":"ec","to":"r7","distance":2,"direction":"one-way"},
    {"id":"r7=>r4","from":"r7","to":"r4","distance":3,"direction":"one-way"},
    {"id":"r4=>r2","from":"r4","to":"r2","distance":2,"direction":"one-way"},
    {"id":"r2=>xc","from":"r2","to":"xc","distance":1,"direction":"one-way"},
    {"id":"xc=>exit","from":"xc","to":"exit","distance":1,"direction":"one-way"},
    {"id":"r7=>c7","from":"r7","to":"c7","distance":2,"direction":"two-way"},
    {"id":"r4=>c4","from":"r4","to":"c4","distance":2,"direction":"two-way"},
    {"id":"r2=>c2","from":"r2","to":"c2","distance":2,"direction":"two-way"},
    {"id":"c7=>c4","from":"c7","to":"c4","distance":5,"direction":"two-way"},
    {"id":"c4=>c2","from":"c4","to":"c2","distance":2,"direction":"two-way"},
    {"id":"c4=>sC05","from":"c4","to":"sC05","distance":0.6,"direction":"one-way"}
  ]
}
```

`c7—c4` cố tình `distance=5` trong khi euclid=3 (làn "chậm") → dạy `edge.distance` ≠ hình học. `sC05` là **sink** (out-degree 0) — tái hiện BUG exit.

### FIX-G2 — Tie-break fixture (4 node, 4 cạnh)

```json
{
  "nodes": [{"id":"s","x":0,"y":0},{"id":"a","x":1,"y":0},{"id":"b","x":0,"y":1},{"id":"t","x":1,"y":1}],
  "edges": [
    {"id":"s=>a","from":"s","to":"a","distance":1,"direction":"one-way"},
    {"id":"s=>b","from":"s","to":"b","distance":1,"direction":"one-way"},
    {"id":"a=>t","from":"a","to":"t","distance":1,"direction":"one-way"},
    {"id":"b=>t","from":"b","to":"t","distance":1,"direction":"one-way"}
  ]
}
```

a,b đối xứng (f=2, g=1 bằng nhau) → tie-break `nodeOrder` chọn `a` `[đã chạy: path s,a,t]`.

### FIX-RT1 — Route points cho voice demo

```json
{"inbound":[[8,9],[7,9],[7,7],[7,4],[5,4],[5.6,4]], "straight":[[0,0],[1,0],[2,0],[2,1]]}
```

### FIX-GEOM1 — Mini geometry cho `buildLaneGraph`

```json
{
  "layout": {"centerLaneCenterX":4,"leftAisleCenterX":1,"rightAisleCenterX":7},
  "entrance": {"x":8,"y":9.5}, "exit": {"x":8,"y":0.5},
  "horizontalConnectors": [{"centerline":{"start":{"y":1}}},{"centerline":{"start":{"y":9}}}],
  "spots": [
    {"id":"Z01","zone":"F","number":1,"y":2,"height":2,"entryPoint":{"x":2,"y":3}},
    {"id":"Z02","zone":"F","number":2,"y":5,"height":2,"entryPoint":{"x":2,"y":6}},
    {"id":"B01","zone":"B","number":1,"y":2,"height":2,"entryPoint":{"x":6,"y":3}},
    {"id":"B02","zone":"B","number":2,"y":5,"height":2,"entryPoint":{"x":6,"y":6}}
  ],
  "anchors": [{"id":"shopping","x":1,"y":1}]
}
```

`rowYValues` (mini `SPOTS_PER_ZONE=2`, mỗi `number` lấy ô đầu tiên): n=1→Z01 tâm-Y 3, n=2→Z02 tâm-Y 6 → `allY = [1,3,6,9]`.

### FIX-RECO1 — Recommendation mini

```json
{"spots":[{"id":"S1","status":"empty","center":[6,7]},{"id":"S2","status":"empty","center":[9,6]},{"id":"S3","status":"empty","center":[5,2]},{"id":"S4","status":"occupied"},{"id":"S5","status":"transitioning"}],
 "routeCost":{"S1":20,"S2":8,"S3":12}, "anchor":{"services":[5,7]}}
```

`routeCost` giả lập `route.distance` để demo không cần chạy graph.

### FIX-S1 — Session mẫu

```json
{"sessionId":"tok-abc","state":"NAVIGATING_TO_SPOT","globalVehicleId":7,"runtimeId":"rt-1","targetSpotId":"C05","parkedSpotId":null,"claimed":true,"revision":4,"qrExpiresAt":"2026-10-04T10:00:00Z","createdAt":"2026-10-04T09:58:00Z","updatedAt":"2026-10-04T09:59:00Z","parkingEpisodeId":null,"parkedAt":null}
```

### FIX-R1 — Slots/vehicles runtime

```json
{"slots":[{"slot_id":"C05","camera_id":"cam2","status":"empty","vehicle_id":null,"tracking_state":"moving","stopped_for_ms":0}],
 "vehicles":[{"global_id":7,"state":"active","observed":true,"parked_slot_id":null,"position":{"x":6,"y":4.5}}]}
```

### FIX-A1 — Affine anchors

```json
{"anchors":[{"world":{"x":0,"y":0},"svg":{"x":100,"y":200}},{"world":{"x":100,"y":0},"svg":{"x":300,"y":200}},{"world":{"x":0,"y":50},"svg":{"x":100,"y":300}}],"query":{"x":50,"y":25}}
```

### FIX-QR1 — Waiting sessions

```json
[{"sessionId":"S1","createdAt":"2026-10-04T09:57:00Z","qrExpiresAt":"2026-10-04T09:59:00Z"},
 {"sessionId":"S2","createdAt":"2026-10-04T09:58:40Z","qrExpiresAt":"2026-10-04T10:00:40Z"},
 {"sessionId":"S3","createdAt":"2026-10-04T09:59:30Z","qrExpiresAt":"2026-10-04T10:01:30Z"}]
```

`now = 10:00:00Z` → S1 đã hết, S2 còn 40s, S3 còn 90s.

---

## 2. Dossier chi tiết

Mỗi mục theo schema: Nhóm/Refs/Prereq·Related → Vai trò → I/O → Pseudocode (đánh số) → Cấu trúc dữ liệu → Độ phức tạp → Edge case → Demo → Storyboard.

### Nhóm ROUTING

#### `lane-graph-build` — Sinh đồ thị làn đường
- **Refs:** `frontend/src/routing/laneGraph.ts:30-163` `buildLaneGraph` (+ `:185` `LANE_GRAPH`) · **Prereq:** `parking-geometry-gen` · **Related:** `adjacency-directed-expand`, `gate-node-mutate`
- **Vai trò:** biến `ParkingGeometry` tĩnh thành `LaneGraph` có hướng — toàn bộ không gian tìm kiếm của A*.
- **Input → Output:** `geometry: ParkingGeometry` → `LaneGraph{nodes: LaneNode[], edges: LaneEdge[], entranceNodeId: string, exitNodeId: string, spotEntryNodeIds: Record<SpotId,string>}`.
- **Pseudocode:**
  1. `addNode`/`addEdge` qua `Map` chống trùng (`:36-41`); `addEdge` throw nếu thiếu node; `edge.distance = distanceBetween(from,to)` (`:43-53`).
  2. Tạo `entrance`, `exit` từ `geometry.entrance/exit` (`:62-65`).
  3. `rowYValues` = tâm-Y của **ô đầu tiên** khớp `number n = 1..SPOTS_PER_ZONE` (`spots.find(number===n)`, `:73-77` — giả định các zone cùng hàng Y); `allY = Set(connTopY, ...rowY, connBottomY)` sort tăng (`:78`).
  4. Mỗi `y ∈ allY`: tạo `center-y`, `left-y`, `right-y` tại 3 `aisleCenterX` (`:81-91`).
  5. `entrance-corner`@(rightX,entrance.y), `exit-corner`@(rightX,exit.y); chuỗi **one-way**: `entrance → entrance-corner → right-y (Y giảm) → exit-corner → exit` (`:95-115`).
  6. Left & center: cặp junction kề theo Y tăng, `two-way` (`:118-124`).
  7. Tại connTopY & connBottomY: `center↔left`, `center↔right` two-way (`:128-131`).
  8. Mỗi ô: node `spot-<id>` tại `entryPoint`; cạnh **one-way** `aisle→spot` — `F,E→left`; `D,C→center`; **else (B,A và mọi zone khác) → right** (`:143-154`).
  9. Mỗi anchor: node `access-anchor`, **không cạnh** (`:158-160`).
- **Cấu trúc dữ liệu:** `Map<string,LaneNode>`; `LaneNode{id,x,y,kind}`; `LaneEdge{id,from,to,distance,direction:"one-way"|"two-way"}`.
- **Độ phức tạp:** **O(V + E + R·log R)** time — R=|allY| (sort `allY` + `sortedDescY`/`sortedAscY`), V = 3R + S + 2 + 2 + A, E = (R+3) + 2(R−1) + 4 + S. Với R=12, S=60, A=3 → **V=103, E=101** `[đã chạy]`. **Space O(V+E)** (nodes/edges + nodeById).
- **Edge case / failure:** zone ngoài `{F,E,D,C}` → **else → right** (`:147-149` — không validate, không throw); `rowYValues` chỉ lấy 1 ô/đại diện mỗi `number` → nếu các zone có hàng Y lệch nhau, junction thiếu ở Y của ô sau (edge `spot-*` bị bỏ qua lặng bởi `if nodeById.has` `:152`); spot-entry sink → hệ quả BUG ở `spot-route-wrappers`.
- **Demo (FIX-GEOM1) `[đã chạy]`:** `allY = [1,3,6,9]`; **V = 3·4 + 4 + 4 + 1 = 21** (12 junction + 4 spot + entrance/exit/2 corner + 1 anchor); **E = 7 + 3 + 3 + 4 + 4 = 21** (right chain 7, left chain 3, center chain 3, connectors 4, spot edges 4); spot edges = `[left-3=>spot-Z01, left-6=>spot-Z02, right-3=>spot-B01, right-6=>spot-B02]`; `spot-*` out-degree = 0.
- **Storyboard:** canvas trái geometry, phải graph mọc dần: node xám rải theo hàng Y → cạnh xanh dương 1-chiều (right) / tím 2-chiều (left,center) / cam vào ô. Bảng realtime: |allY|, V, E, hàng pseudocode đang chạy (1-9). Controls: toggle layer "spot-entry edge", "aisle mapping". Giải thích VN: "Làn phải một chiều dẫn từ cổng vào lên cổng ra; ô đỗ là node cuối một chiều — vì sao exit từ ô bị null xem lesson L3".

#### `adjacency-directed-expand` — Sinh hàng xóm có hướng
- **Refs:** `frontend/src/routing/routeEngine.ts:18-29` `buildAdjacency` · **Prereq:** `lane-graph-build` · **Related:** `astar-find-route`
- **Vai trò:** `LaneEdge[]` → `Map<from, DirectedStep[]>`; cạnh two-way sinh bước ngược — đây là neighbor generation của A*.
- **Input → Output:** `LaneGraph` → `Map<string, DirectedStep[]>`; `DirectedStep{edgeId,from,to,distance}`.
- **Pseudocode:**
  1. `adjacency.set(node.id, [])` ∀node.
  2. ∀edge: push `{edgeId,from,to,distance}` vào `adjacency[from]`.
  3. Nếu `direction==="two-way"`: push bản đảo vào `adjacency[to]`.
- **Cấu trúc dữ liệu:** `Map<string, DirectedStep[]>`; |steps| = E_one + 2·E_two.
- **Độ phức tạp:** O(V+E) thời gian & bộ nhớ; build lại mỗi lần `findRoute` gọi (O(V+E) mỗi query — chấp nhận được ở V=103).
- **Edge case:** cạnh `to` node không tồn tại vẫn push — chỉ bị skip khi relax (`routeEngine.ts:82`); one-way không bao giờ đảo (lá chắn chiều làn).
- **Demo (FIX-G1):** `adjacency["r4"]` → `[{→"r2",2},{→"c4",2}]`; `adjacency["c4"]` → `[{→"r4",2},{→"c7",5},{→"c2",2},{→"sC05",0.6}]` (4 bước vì c4 là `to` của 2 cạnh two-way + `from` của 2 cạnh) `[đã chạy]`; `adjacency["sC05"]` → `[]`.
- **Storyboard:** chọn node → mũi tên đi ra sáng; cạnh two-way vẽ 2 đầu; sC05 xám + nhãn "0 lối ra". Bảng: out-degree từng node khi click.

#### `astar-find-route` — A* tìm đường
- **Refs:** `frontend/src/routing/routeEngine.ts:31-119` `findRoute` · **Prereq:** `adjacency-directed-expand` · **Related:** `route-edge-validator`, `spot-route-wrappers`
- **Vai trò:** lõi dẫn đường — A* trên đồ thị có hướng, trả route + distance hoặc `null`.
- **Input → Output:** `(graph: LaneGraph, startNodeId: string, endNodeId: string)` → `RouteResult{nodeIds, edgeIds, points[{x,y}], distance} | null`.
- **Pseudocode (khớp code):**
  1. `nodeById`; null nếu start/end không tồn tại (`:33`).
  2. `adjacency = buildAdjacency(graph)`; `nodeOrder` = index khai báo (`:35-37`).
  3. `heuristicScale = min_e(edge.distance / euclid(e))` — bỏ cạnh len 0; nếu không cạnh nào → 0 (`:38-46`). `h(n) = euclid(n,goal) · scale` (`:47-50`).
  4. `open={start}`; `g[start]=0`; `f[start]=h(start)`; `previous=∅` (`:52-55`).
  5. Lặp khi `open≠∅`: quét `open` chọn `current` có `f` nhỏ nhất; hoà → `g` nhỏ hơn; hoà → `nodeOrder` nhỏ hơn (`:57-75`).
  6. `current` vô hạn → break; `current===end` → break (`:77-79`).
  7. ∀step từ current: `cand = g[cur]+step.distance`; `cand < g[step.to]` → cập nhật `g,f,prev`, `open.add` (`:81-90`).
  8. `g[end]=∞` → `null`; lần ngược `previous` → `nodeIds,edgeIds,points` (`:93-118`).
- **Cấu trúc dữ liệu:** `Set<string>` open (quét tuyến tính — **không heap**); `Map` distances(g)/estimates(f)/previous/nodeOrder.
- **Độ phức tạp:** mỗi pop O(V) → **O(V²+E) time, O(V+E) space**; V=103 → ~10⁴ phép so sánh/query — không đáng kể; heap cần khi đồ thị lớn hơn nhiều.
- **Heuristic:** `scale = min(e.dist/euclid)` ≤ 1 trong graph thật (mọi cạnh euclid → scale=1.0) ⇒ admissible & consistent; FIX-G1 cũng =1.0 vì min các tỉ lệ = min(1,…,5/3,0.6/0.6) = 1.0 `[đã chạy]`.
- **Edge case / failure:** start==end → route 1 điểm, distance 0; **route TỪ sink** → `open` cạn → `g[end]=∞` → `null`; route TỚI sink hoàn toàn bình thường (vào ô là trường hợp đó); `heuristic()` deref `nodeById.get()!` — edge tới node lạ sẽ throw (latent, unreachable từ buildLaneGraph).
- **Demo (FIX-G1) `[đã chạy]`:**
  - `findRoute(G1,"entrance","sC05")` → `nodeIds=[entrance,ec,r7,r4,c4,sC05]`, `distance=8.6`.
  - Trace pops (g,f): `entrance(0,5.546) → ec(1,6.192) → r7(3,6.311) → r4(6,7.4) → c7(5,8.059) → c4(8,8.6) → sC05(8.6,8.6)` — **7 pops**; lưu ý c7 được expand (f 8.059 < c4 8.6) nhưng relax vào c4 thua (5+5=10 > 8) → không đổi prev.
  - Error: `findRoute(G1,"sC05","exit")` → `null` (start là sink); `findRoute(G1,"entrance","zz")` → `null`.
  - Tie-break (FIX-G2): path `s,a,t` — a,b cùng f=2, g=1; `nodeOrder(a)<nodeOrder(b)` thắng.
- **Storyboard:** node = chấm; open viền vàng, current cam nhấp, closed xám, path xanh dương; bảng realtime {id,g,h,f,prev}; dòng pseudocode sáng (5=chọn min, 7=relax); controls: play/step/tốc độ, chọn start/end, "thêm cạnh c7→c4=2" xem đường đổi. Text VN giải thích admissibility + tại sao c7 thua dù được expand.

#### `spot-route-wrappers` — Tuyến tĩnh entrance↔ô/exit
- **Refs:** `frontend/src/routing/routeEngine.ts:121-130` `findVehicleRoute`, `findExitRoute` · **Prereq:** `astar-find-route` · **Related:** `pos-route-wrappers`, `parking-decision-resolve`
- **Vai trò:** `findVehicleRoute(graph,spotId)`: entrance→spot-entry; `findExitRoute(graph,spotId)`: spot-entry→exit. Dùng khi **không có** vị trí xe.
- **Input → Output:** `(graph: LaneGraph, spotId: SpotId)` → `RouteResult | null` (null nếu `spotEntryNodeIds[spotId]` thiếu).
- **Pseudocode:**
  1. `findVehicleRoute`: `t = spotEntryNodeIds[spotId]`; `t ? findRoute(graph, entrance, t) : null` (`:121-124`).
  2. `findExitRoute`: `s = spotEntryNodeIds[spotId]`; `s ? findRoute(graph, s, exit) : null` (`:126-130`).
- **Cấu trúc dữ liệu:** chỉ đọc `graph.spotEntryNodeIds` — lookup O(1).
- **Độ phức tạp:** time & space = `astar-find-route` → O(V²+E) time, O(V+E) space.
- **Edge case / failure — BUG `[đã chạy]`:** `findExitRoute` trả `null` cho **60/60 ô** vì `spot-*` là sink (out-degree 0). Trên FIX-G1: `findExitRoute("C05")=null`; **bản vá** thêm cạnh `sC05=>c4` (d0.6) → `[sC05,c4,r4,r2,xc,exit]` cost **6.6** `[đã chạy]` — demo phải hiển thị cả bug lẫn đồ thị sau vá.
- **Demo:** như trên; thêm `findVehicleRoute("ZZ9")` → `null` (không có entry node).
- **Storyboard:** nút "Vào ô" (xanh, ok) / "Ra cổng" (đỏ, null) → popup "vì sao?" → tô đỏ sC05, bảng out-degree=0 → nút "vá đồ thị" → chạy lại thành công 6.6.

#### `drivable-edge-project` — Chiếu xe lên cạnh lái được
- **Refs:** `frontend/src/routing/routeEngine.ts:132-167` `routeFromPos` · **Prereq:** `astar-find-route` · **Related:** `point-segment-dist`, `pos-route-wrappers`
- **Vai trò:** cho route bắt đầu **giữa cạnh** — chiếu `(vehicleX,vehicleY)` lên cạnh drivable gần nhất, chèn node tạm `vehicle-pos`.
- **Input → Output:** `(graph, vehicleX: number, vehicleY: number, targetNodeId: string)` → `RouteResult | null`.
- **Pseudocode (khớp code):**
  1. ∀edge: bỏ qua nếu một đầu `kind ∈ {access-anchor, spot-entry}` (`:138`) hoặc len=0.
  2. `t = clamp(((V−a)·(b−a))/|b−a|², 0, 1)`; `p = a + t·(b−a)`; `d = |V−p|` (`:139-144`).
  3. Sort tăng theo `d`; `nearest = projections[0]`; `!nearest || d>60` → `null` (`:145-147`).
  4. Node `vehicle-pos` tại `p`; `two-way` → cạnh tạm one-way tới **cả a lẫn b**; `one-way` → chỉ `b` (`:148-158`).
  5. `findRoute(graph ∪ {vehicle-pos, tempEdges}, vehicle-pos, target)` (`:160-166`).
- **Cấu trúc dữ liệu:** `projections[]` (edge,a,b,x,y,d) sort; `tempGraph` = clone nông + push.
- **Độ phức tạp:** O(E log E) sort chiếu + O(V²) A* trên V+1 node; **space O(E) projections + O(V+E) tempGraph** (clone nông + ≤2 cạnh tạm).
- **Edge case:** cạnh `spot-entry`/`access-anchor` bị loại khỏi ứng viên (`:138`) — vai trò: node động chỉ neo lên **làn lái được**, tránh neo vào stub vào ô (theo comment `:133-134` "never draw a straight connector through slots"). Trong FIX-G1 cạnh `c4=>sC05` nằm đồng tuyến với làn `r4—c4` nên exclusion không đổi winner ở mẫu đó; **variant đã verify** (G1b: `sC05(5,4.6)` lệch làn, xe `(5.2,4.6)`): nếu **không** exclude, `c4=>sC05` thắng với d=0.2 (thay vì `r4=>c4` d=0.6) → neo sai vào cạnh one-way vào ô `[đã chạy]`; `one-way` chỉ đi "xuôi" (không quay đầu trong làn); `d>60` → null.
- **Demo (FIX-G1, thr demo 1.0) `[đã chạy]`:**
  - `routeFromPos(6,4.5→sC05)` → projection `r4=>c4` tại `(6,4)`, d=0.5; route `[vehicle-pos,c4,sC05]` = **1.6**.
  - `routeFromPos(7.2,8→sC05)` → projection `ec=>r7` (one-way) tại (7,8), d=0.2 → chỉ cạnh `vehicle-pos→r7`; nodes `[vehicle-pos,r7,r4,c4,sC05]` = **6.6** — không thể quay về `ec`.
  - `(0,0→exit)` → projection gần nhất d≈2.24 > 1.0 → `null`.
- **Storyboard:** kéo chấm xe → nét đứt chiếu tới cạnh; bảng top-3 {edgeId,t,d} + hàng cạnh bị loại (xám) với lý do "spot-entry"; slider threshold 0.5–2.0; toggle "cho phép cạnh one-way ngược" (demo-only) để thấy khác biệt.

#### `pos-route-wrappers` — Re-route động & exit fallback (BUG)
- **Refs:** `frontend/src/routing/routeEngine.ts:174-208` `findExitRouteFromPos`, `findInboundRouteFromPos` · **Prereq:** `drivable-edge-project` · **Related:** `spot-route-wrappers`, `nav-goal-resolve`
- **Vai trò:** API App gọi mỗi nhịp cập nhật vị trí: exit `→findExitRouteFromPos`, inbound `→findInboundRouteFromPos`.
- **Input → Output:** `findExitRouteFromPos(graph,x,y,fallbackSpotId?: SpotId)` → `RouteResult|null`; `findInboundRouteFromPos(graph,x,y,spotId)` → `RouteResult|null`.
- **Pseudocode:**
  1. Exit: `r = routeFromPos(graph,x,y,exitNodeId)`; `r` → return; `fallbackSpotId` → `findExitRoute(graph,fallback)`; ngược `null` (`:180-187`).
  2. Inbound: `t = spotEntryNodeIds[spotId]`; `!t` → null; `routeFromPos(graph,x,y,t)`; ngược `null` (`:199-207`).
- **Cấu trúc dữ liệu:** không thêm; fallback chỉ đọc map.
- **Độ phức tạp:** time & space = `drivable-edge-project` — O(E log E + V²) time, O(E + V) space (+1 `findRoute` nếu fallback chạy — hiện luôn null).
- **Edge case / failure — BUG `[đã chạy]`:** exit fallback gọi `findExitRoute` — hàm luôn null do sink → **dead code**; comment `:206` "Fallback: tính từ Cổng Vào" lệch với code trả `null` (doc-drift). Khi projection fail + fallback fail → `null`; App giữ route cũ (không xóa — `App.tsx:765-774`).
- **Demo (FIX-G1, thr 1.0) `[đã chạy]`:** `findExitRouteFromPos(6,4.5,"C05")` → `[vehicle-pos,r4,r2,xc,exit]` = **5.0**; `(0,0,"C05")` → `null` (projection fail + fallback chết); `findInboundRouteFromPos(6,4.5,"C05")` → **1.6**.
- **Storyboard:** decision-table {projection? → node động? → route|null}; nhánh fallback gạch đỏ "dead code do sink bug"; nút preset vị trí (trên làn / xa làn).

#### `route-edge-validator` — Kiểm chứng tuyến hợp lệ
- **Refs:** `frontend/src/routing/routeEngine.ts:210-222` `routeUsesOnlyValidEdges` · **Prereq:** — · **Related:** `adjacency-directed-expand`, `astar-find-route`
- **Vai trò:** QA/test — mỗi `edgeIds[i]` phải nối `nodeIds[i]→nodeIds[i+1]` đúng chiều (hoặc ngược nếu two-way).
- **Input → Output:** `(graph: LaneGraph, route: RouteResult)` → `boolean`.
- **Pseudocode:**
  1. `edgeById = Map(edges)`.
  2. ∀i: `edge` thiếu, hoặc `from/to` lấy từ `nodeIds[i]/[i+1]` thiếu → `false`.
  3. `edge.from===from && edge.to===to` hoặc (`two-way` && ngược) → pass; ngược `false`.
- **Cấu trúc dữ liệu:** `Map<string,LaneEdge>`.
- **Độ phức tạp:** **O(E + R) time** — build `Map` O(E) từ `edges` + R = |route.edgeIds| lần lookup mỗi cặp node liền kề; **space O(E)** cho Map.
- **Edge case:** route 1 node (0 cạnh) → `.every` trên mảng rỗng → `true`; edgeId bịa → false ngay.
- **Demo (FIX-G1) `[đã chạy logic]`:** route `[entrance,ec,r7,r4,c4,sC05]` + edgeIds hợp lệ → `true`; swap 2 node giữa → `false`; `edgeIds[2]="b=>t"` → `false`.
- **Storyboard:** bảng 2 cột "đoạn route | cạnh graph", tích xanh/đỏ; nút "xáo route" → chấm đỏ đầu tiên sai.

#### `gate-node-mutate` — Đồng bộ node cổng từ gate config
- **Refs:** `frontend/src/routing/laneGraph.ts:165-183` `updateGateNodesInGraph`; caller `frontend/src/app/App.tsx:~404` (poll gate 1s) · **Prereq:** `lane-graph-build` · **Related:** `world-svg-project`
- **Vai trò:** cập nhật `x,y` node `entrance`/`exit` = trung điểm vạch cổng đã chiếu world→SVG, để route bám cổng vận hành chỉnh trên `/monitor`.
- **Input → Output:** `(graph: LaneGraph, gateRoi: {entry_gate:{p1,p2}, exit_gate:{p1,p2}})` → `void` (mutate graph).
- **Pseudocode:**
  1. `n = nodes.find(id===entranceNodeId)` → `n.x=(p1.x+p2.x)/2; n.y=(p1.y+p2.y)/2`.
  2. Tương tự `exit` với `exit_gate`.
- **Cấu trúc dữ liệu:** mutate `LaneNode` in-place trên singleton `LANE_GRAPH`.
- **Độ phức tạp:** O(V) find ×2 → O(V); bộ nhớ O(1).
- **Edge case / failure — điểm yếu thiết kế:** **`edge.distance` không recompute** → chi phí cạnh `entrance=>entrance-corner` & heuristic lệch hình học mới; singleton mutate toàn cục (test/chuyển session nhiễm). Demo: biến thể "immutable rebuild" để so sánh `[demo]`.
- **Demo (FIX-G1):** set `entry_gate.p1=(8,6),p2=(8,8)` → mid (8,7): node entrance (8,9)→(8,7); edge `entrance=>ec` stored `distance=1` vs euclid mới `√(1+4)=2.236` → hiển thị lệch 1.236 `[đã chạy công thức]`.
- **Storyboard:** kéo vạch cổng → node nhảy; bảng `stored d | euclid mới` tô đỏ khi lệch; nút "recompute" hiện diff.

---

### Nhóm RECOMMENDATION

#### `spot-rank-score` — Chấm điểm & xếp hạng ô
- **Refs:** `frontend/src/recommendation/recommendationEngine.ts:16-17` constants, `:25-72` `getEligibleSpots`/`rankParkingSpots`, `:75-89` `recommendParkingSpots` · **Prereq:** `astar-find-route` · **Related:** `recommendation-promote`, `invalid-spot-recovery`
- **Vai trò:** trả best + ≤2 alternatives cho `need ∈ shopping|services|entertainment`; pure function.
- **Input → Output:** `(spots: ParkingSpotState[], need: DestinationNeed, options{geometry?,graph?,calculatedAt?,startPosition?})` → `RecommendationResult{need,best:RankedSpot,alternatives:RankedSpot[],calculatedAt} | null`. `RankedSpot{spotId,zone,totalScore,drivingDistance,walkingDistance,estimatedWalkingMinutes,reason}`.
- **Pseudocode:**
  1. `eligible = spots.filter(status==="empty")` (`:32-34`).
  2. ∀ô: `route = startPosition ? findInboundRouteFromPos : findVehicleRoute`; `!geometry || !route` → bỏ (`:44-51`).
  3. `driving = route.distance·0.12` (m), `walking = euclid(tâm ô, anchors[need])·0.12` (`:53-58`).
  4. `totalScore = round2(0.35·driving + 0.65·walking)` (`:59,64`).
  5. `walkingMinutes = max(1, ceil(walking/75))`; `reason = REASONS[need]` (`:67-68`).
  6. Sort `totalScore` tăng, hoà → `spotId.localeCompare`; `best=[0]`, `alts=[1..2]` (`:72,81-87`); `ranked` rỗng → `null`.
- **Cấu trúc dữ liệu:** array `RankedSpot[]`; anchors `geometry.anchors[need]`.
- **Độ phức tạp:** `k` ô empty: O(k) route lookups → O(k·(V²+E)) + sort **O(k log k)**; k≤60 → ~60 A* mỗi lần recompute (App gọi lại khi spots/need/vị trí đổi trong mode recommendation); **space O(k)** (điểm số + candidates).
- **Edge case / failure:** không ô nào route được → `ranked=[]` → `null` → UI "Không có ô trống phù hợp"; `METERS_PER_MAP_UNIT=0.12` chưa hiệu chỉnh `[giả định]`; `estimatedWalkingMinutes` luôn ≥1 (ceil + max) — ô cạnh anchor cũng "1 phút"; reserved/transitioning/occupied/unknown đều bị lọc bước 1.
- **Demo (FIX-RECO1) `[đã chạy]`:** eligible={S1,S2,S3}; walking: S1=1·0.12=0.12, S2=√17·0.12≈0.494, S3=5·0.12=0.6; driving: 2.4, 0.96, 1.44; score: **S2=0.6576 < S3=0.894 < S1=0.918** → `best=S2, alts=[S3,S1]`. Error: all-occupied → `null`.
- **Storyboard:** scatter driving×walking, mỗi ô chấm; formula bar `0.35·d+0.65·w`; bảng top-3 + reason VN; controls: chọn need, toggle "dùng vị trí xe", slider trọng số (demo-only, code cố định).

#### `recommendation-promote` — Đổi best khi chọn alternative
- **Refs:** `frontend/src/recommendation/recommendationEngine.ts:91-102` `promoteRecommendation` · **Prereq:** `spot-rank-score` · **Related:** `driver-flow-machine` (`chooseRecommendedSpot`)
- **Vai trò:** bấm alternative → nó thành best; best cũ chìa đầu alternatives (tối đa 2).
- **Input → Output:** `(result: RecommendationResult, spotId: SpotId)` → `RecommendationResult` mới (immutable, trả nguyên nếu không đổi).
- **Pseudocode:**
  1. `selected = [best,...alts].find(spotId)`; `!selected || selected===best` → return `result` (`:95-96`).
  2. `best=selected`; `alts = [oldBest, ...alts.filter(≠spotId)].slice(0,2)` (`:97-101`).
- **Cấu trúc dữ liệu:** `RankedSpot` object + mảng alternatives (≤2 sau slice).
- **Độ phức tạp:** find O(k), k≤3 → O(1) thực tế; filter+slice O(k). Bộ nhớ O(k).
- **Edge case:** spotId không thuộc result → trả **cùng tham chiếu** (React bail-out được); promote best → no-op; alternatives giữ thứ tự rank cũ sau best mới.
- **Demo `[đã chạy]`:** `R{best:A01,alts:[B02,C05]}`: `promote("B02")` → `best=B02, alts=[A01,C05]`; `promote("ZZ9")` → object y hệt; `promote("A01")` → y hệt.
- **Storyboard:** 3 thẻ ô; click thẻ phụ → swap animation; state table {best,alts}; nút "promote ZZ9" → "unchanged".

---

### Nhóm VOICE-NAV

#### `point-segment-dist` — Khoảng cách điểm–đoạn
- **Refs:** `frontend/src/routing/voiceGuidance.ts:75-90` `distanceToSegment` · **Prereq:** — · **Related:** `off-route-detect`, `drivable-edge-project` (cùng công thức chiếu)
- **Vai trò:** hạt nhân hình học cho off-route.
- **Input → Output:** `(px,py,x1,y1,x2,y2): number` → `number` (đơn vị map).
- **Pseudocode:**
  1. `dx=dy=0` → trả `|p−a|` (`:85`).
  2. `t = clamp(((p−a)·(b−a))/|b−a|², 0, 1)` (`:86`).
  3. `|p − (a + t·(b−a))|` (`:87-89`).
- **Cấu trúc dữ liệu:** scalar thuần — không cấu trúc.
- **Độ phức tạp:** O(1) time, O(1) space.
- **Edge case:** đoạn suy biến xử lý riêng; `t` clamp về đầu mút (đoạn hữu hạn, không phải đường thẳng vô hạn).
- **Demo `[đã chạy]`:** `(6,4.5)→[(7,4),(5,4)]` → t=0.5, d=0.5; `(9,4.5)` → t=0 → d=√(4+0.25)≈2.062; suy biến `(7,4)-(7,4)` từ `(9,9)` → √29≈5.385.
- **Storyboard:** kéo điểm P → chân chiếu + thanh t 0→1; công thức thay số trực tiếp; nút "đoạn độ dài 0".

#### `off-route-detect` — Phát hiện sai tuyến
- **Refs:** `frontend/src/routing/voiceGuidance.ts:95-111` `checkIsOffRoute`; call-site `frontend/src/app/App.tsx:746-751` · **Prereq:** `point-segment-dist` · **Related:** `voice-speak-throttle`, `nav-goal-resolve`
- **Vai trò:** quyết định cảnh báo "đi sai tuyến" + auto re-route.
- **Input → Output:** `(vehiclePos: {x,y}, routePoints: {x,y}[], thresholdPx: number = 75)` → `boolean`.
- **NGƯỠNG:** default param `75` (`:98`) nhưng **App truyền `80`** (`App.tsx:749`) → hiệu lực production = 80; docs ghi 75 — doc-drift cần nêu đúng.
- **Pseudocode:**
  1. `!vehiclePos || routePoints.length < 2` → `false` (`:100`).
  2. `minD = min over segments distanceToSegment(V, p[i], p[i+1])` (`:101-109`).
  3. `minD > threshold` (`:110`).
- **Cấu trúc dữ liệu:** quét mảng — không cấu trúc phụ.
- **Độ phức tạp:** O(n) time, **O(1) space** — n=|routePoints| mỗi nhịp ~200ms.
- **Edge case / failure:** route rỗng/1 điểm → `false` → **không cảnh báo khi route null** kể cả xe lạc; check chạy trên `route.points` gốc (không qua `simplifyRoutePoints`); threshold âm → mọi xe ≠ route đều "off" `[demo biên]`.
- **Demo (FIX-RT1.inbound, thr=1.0) `[đã chạy]`:** `(6,4.2)` → minD≈0.2 → `false`; `(5,2)` → minD=2.0 → `true`; `(8.5,9)` → minD=0.5 (clamp đầu mút) → `false`; route `[]` → `false`.
- **Storyboard:** route + corridor bán trong = threshold; xe đỏ kéo — vượt corridor flash đỏ + stub voice; bảng {minD, threshold(75 default/80 app — chú thích doc-drift), kết quả}; controls: slider threshold, nút "re-route".

#### `turn-instruction` — Suy câu chỉ dẫn rẽ
- **Refs:** `frontend/src/routing/voiceGuidance.ts:118-231` `getNavigationInstruction` · **Prereq:** — · **Related:** `off-route-detect`, `voice-speak-throttle`
- **Vai trò:** (vị trí xe, `route.points`, `isExit`, `targetSpotId`) → câu tiếng Việt.
- **Input → Output:** `(vehiclePos: {x,y}, routePoints: {x,y}[], isExit: boolean = false, targetSpotId: string | null = null)` → `string | null`.
- **Pseudocode (khớp code):**
  1. `<2` điểm → `null` (`:124`).
  2. `dist(V, điểm cuối) < 35` → câu đến đích theo isExit/targetSpotId (`:127-139`).
  3. `closestIndex` = điểm route gần xe nhất (strict `<`, giữ index đầu khi hoà) (`:142-153`).
  4. `0 < closestIndex < n−1`: `curVec = p[i]−p[i−1]`, `nextVec = p[i+1]−p[i]`; `cos = dot/(|a||b|)` (len 0 → cos=1); `cos>0.93` → "đi thẳng"; `cross = curDx·nextDy − curDy·nextDx`; `cross>0` → **rẽ phải**, `<0` → **rẽ trái** (SVG Y↓), câu theo `isExit` (`:156-190`).
  5. `closestIndex===0` (đầu đường): quét bộ 3 đầu, tìm `cos<0.93` đầu tiên; `distToTurn>150` → "đi thẳng"; ngược phán đoán cross như trên; hết vòng → "đi thẳng" (`:194-227`).
  6. Fallback: `"Tiếp tục di chuyển theo đường chỉ dẫn."` (`:230`).
- **Cấu trúc dữ liệu:** chỉ index + vector 2D.
- **Độ phức tạp:** O(n) quét gần nhất + O(n) quét khúc cua đầu; n≈độ dài route; **space O(1)** (chỉ index + vài điểm lấy ra).
- **Edge case / failure:** `closestIndex = n−1` (qua điểm cuối nhưng chưa vào bán kính 35) → nhánh 4,5 đều bỏ → fallback generic; closestIndex **trễ** — xe đã qua node cua nhưng node trước vẫn "gần nhất" → câu rẽ lặp `[đã chạy: V(7,8) trên route inbound → "rẽ phải" dù cua đó ở ec đã qua]`; node trùng → len=0 → cos=1 → "thẳng"; `cross===0` hiếm → nhánh else → trái; **demo phải giữ Y tăng xuống** mới đúng quy ước trái/phải.
- **Demo (FIX-RT1.inbound, ARRIVE=0.5, TURN_NEAR=2.5) `[đã chạy]`:**
  - `V=(7,4.3)` → closest=idx3: curVec(0,−3), nextVec(−2,0), cos=0, cross=−6 → `"Phía trước rẽ trái vào làn đỗ."`
  - `V=(8.9,9)` → closest=0 → bộ 3 đầu cua tại (7,9), distToTurn=1.9<2.5, cross=2 → `"Phía trước rẽ phải vào làn đỗ."`
  - `V=(5.5,4)` → dist đích 0.1<0.5 → `"Bạn đã đến vị trí ô đỗ C05. Vui lòng lùi xe vào đỗ."`
  - `V=(7.9,1)` route exit isExit → `"Bạn đã đến lối ra. Chúc bạn thượng lộ bình an!"`
  - `V=(1,0.1)` trên FIX-RT1.straight → `"Phía trước đi thẳng."`
- **Storyboard:** route + xe + marker "closestIndex"; vòng r=ARRIVE quanh đích; tam giác góc tại node hiện cos/cross; toggle isExit; kéo xe qua đích để thấy fallback generic; text VN giải thích quy ước cross↔trái/phải trong Y↓.

#### `voice-speak-throttle` — Dedupe/cooldown TTS
- **Refs:** `frontend/src/routing/voiceGuidance.ts:3-70` `VoiceManager` + singleton `voiceManager` · **Prereq:** — · **Related:** `turn-instruction`, `off-route-detect`
- **Vai trò:** chặn spam từ vòng 200ms: cùng câu chỉ lặp sau `cooldownMs`; urgent được chen; Web Speech API (thư viện/platform ngoài — demo stub, §5).
- **Input → Output:** `speak(text: string, cooldownMs: number = 6000, isUrgent: boolean = false)` → side-effect (utterance hoặc bị nuốt). `setMuted(bool)`, `stop()`.
- **Pseudocode (khớp `:29-67`):**
  1. `isMuted` → return.
  2. `text===lastSpokenText && now−lastSpokenTime < cooldown` → return.
  3. `isSpeaking && text===lastSpokenText` → return.
  4. `isSpeaking && !urgent && now−lastSpokenTime < 2000` → return.
  5. `lastSpokenText=text; lastSpokenTime=now; isSpeaking=true`; `speechSynthesis.cancel()`; `speak(utterance{vi-VN, rate .95, pitch 1})`; `onend/onerror → isSpeaking=false`.
- **Cấu trúc dữ liệu:** `{lastSpokenText:string, lastSpokenTime:number, isMuted:bool, isSpeaking:bool}` — singleton.
- **Độ phức tạp:** O(1) time & space mỗi call.
- **Edge case / failure — lỗi nhỏ:** `isSpeaking=true` đặt **trước** khi kiểm tra `"speechSynthesis" in window` (`:51-53`) → môi trường không TTS flag kẹt `true` (chỉ chặn câu mới <2s — nhẹ); `stop()` không reset `lastSpokenTime` → cùng câu ngay sau stop vẫn bị cooldown nuốt.
- **Demo (stub TTS, utterance "đọc" 1.5s) `[đã chạy]`:** timeline `(t_s, text, urgent)`:
  `(0,"đi thẳng",-) → SPEAK`; `(1.0,"đi thẳng",-) → SKIP:cooldown`; `(1.2,"rẽ trái",-) → SKIP:<2s`; `(3.0,"rẽ trái",-) → SPEAK` (speech cũ đã end ở 1.5s); `(3.5,"đi sai tuyến",urgent) → SPEAK:urgent` (cancel câu đang đọc); `(4.0,"đi sai tuyến",-) → SKIP:cooldown`; `(10.0,"đi sai tuyến",-) → SPEAK` (qua 6s). **4 SPEAK / 3 SKIP** `[đã chạy]`.
- **Storyboard:** timeline ngang event; bảng {lastText,lastTime,isSpeaking,middle-rule-fired}; nút bắn event nhanh; console utterance giả; toggle mute; highlight rule số (1-4) quyết định SKIP.

---

### Nhóm SESSION-SYNC

#### `session-commit-guard` — Revision guard khi commit
- **Refs:** `frontend/src/hooks/useVehicleSession.ts:52-93` `commit` · **Prereq:** — · **Related:** `session-action-serialize`, `session-refresh-dedupe`
- **Vai trò:** quyết định payload `VehicleSession` (GET hoặc POST) có được nhận — chốt race/stale.
- **Input → Output:** `(next: VehicleSession, source: string, expectedId: string, lifecycle: number)` → `CommitResult{accepted: boolean, reason?: "stale_revision"|"session_mismatch"|"deleted"}`; side-effect `sessionRef/session/ended/error/lastSyncedAt`.
- **Pseudocode (khớp `:52-93`):**
  1. lifecycle/id khác → reject `session_mismatch`.
  2. `deletedRef` → reject `deleted`.
  3. `source==="GET" && actionRef≠null` → reject `stale_revision` (GET cũ không đè POST).
  4. `next.runtimeId ≠ current.runtimeId` (cả hai có) → warn + `session_mismatch`.
  5. `next.revision < current.revision` → `stale_revision`.
  6. `revision` bằng: so 7 field then chốt (state/target/parked/gid/actualParked/episodeId/updatedAt); giống → accept-idempotent (chỉ `lastSyncedAt`+clear error không-action); khác → warn + `stale_revision`.
  7. Ngược (`next.revision > current`): set session, clear ended/error, accept.
- **Cấu trúc dữ liệu:** refs `sessionRef, activeSessionIdRef, lifecycleRef, deletedRef, actionRef` — `useRef` để commit atomic ngoài render.
- **Độ phức tạp:** O(1) time & space mỗi response.
- **Edge case / failure:** GET resolve sau khi đổi sessionId → lifecycle chặn; **contract cứng**: backend phải tăng revision khi đổi nội dung — cùng rev khác nội dung bị reject (báo builder-c); POST bị reject `stale_revision` → `runAction` tự reconcile GET.
- **Demo `[đã chạy]`:** sequence trên base FIX-S1 (rev4):
  `GET rev4 → set`; `GET rev4 giống → idempotent`; `GET rev3 → stale`; `GET rev5 trong lúc action → stale`; `POST rev5 → set`; `GET rev5 khác updatedAt/parkedSpotId → conflict-stale`; `GET sessionId khác → mismatch`. Output: `[set, idempotent, stale, stale, set, conflict, mismatch]`.
- **Storyboard:** 2 luồng GET/POST vào phễu commit; thẻ payload mang rev; thẻ đỏ bị hất kèm reason; state cuối = session hiện tại; nút "bắn GET cũ", "bắn POST", "đổi sessionId".

#### `session-action-serialize` — Khóa action + reconcile
- **Refs:** `frontend/src/hooks/useVehicleSession.ts:144-190` `runAction` (+`:192-197` claim/select/exit) · **Prereq:** `session-commit-guard`, `action-id-gen` · **Related:** `session-refresh-dedupe`
- **Vai trò:** serialize claim/select/exit — 1 action/lần; gửi `expected_revision` + `action_id`; reconcile khi outcome không chắc.
- **Input → Output:** `(action: "claim"|"select"|"exit", call: (id, ActionOptions)=>Promise<VehicleSession>)` → `Promise<VehicleSession|null>`; `ActionOptions{expected_revision?, action_id}`.
- **Pseudocode (khớp `:144-190`):**
  1. Không id/deleted/đang action → `null`.
  2. `actionRef=action`; abort GET; `pendingGet=null`; `error=null`; `busyAction=action`.
  3. `next = await call(id, {expected_revision: current.revision, action_id: createSessionActionId()})`.
  4. `commit(next,"POST:"+action)` → reject `stale_revision` → mở khóa + `await refresh()`; accept → trả `next`.
  5. catch: `SessionNotFoundError` → `markDeleted`; đúng lifecycle → `setError{message,action}` + mở khóa + `await refresh()` (reconcile); rethrow.
  6. finally: dọn `actionRef`, `busyAction` nếu còn lifecycle.
- **Cấu trúc dữ liệu:** `actionRef` (khóa đơn), `pollControllerRef`, `pendingGetRef`.
- **Độ phức tạp:** O(1) time & space + 1 POST (+1 GET reconcile).
- **Edge case:** double-click → call 2 thấy `actionRef` → `null` sớm `[đã chạy: calls=1]`; POST transport-fail → error + reconcile (không bịa state lạc quan); POST bị reject `session_mismatch` → trả `null`, **không** refresh (chỉ stale mới reconcile).
- **Demo `[đã chạy]`:** (a) `runAction("select")` lồng `runAction("select")` → inner `null`, calls=1; (b) stub POST `SPOT_RESERVED` → error action=select + auto GET reconcile; (c) POST rev5 accept → session rev5.
- **Storyboard:** nút action disable khi busy; sơ đồ "lock → POST → commit | catch → unlock → reconcile"; bảng {actionRef, busyAction, pendingGet}; log POST body `{expected_revision, action_id}`.

#### `session-refresh-dedupe` — GET dedupe + timeout
- **Refs:** `frontend/src/hooks/useVehicleSession.ts:103-142` `refresh`; poll `:199-219` `setInterval(POLL_INTERVAL_MS=500)` · **Prereq:** `session-commit-guard` · **Related:** `session-action-serialize`
- **Vai trò:** GET `/api/session/{id}` an toàn: dedupe in-flight, timeout 2s, phân loại lỗi.
- **Input → Output:** `()` → `Promise<VehicleSession|null>`; side-effects: abort controller, error state, markDeleted.
- **Pseudocode (khớp `:103-142`):**
  1. `!id || deleted || action` → `null`; `pendingGet` → trả promise sẵn có.
  2. `controller = new AbortController()`; `setTimeout(2000) → {timedOut=true; abort()}`.
  3. `getSession` → `commit(next,"GET")` → trả `next` nếu accept.
  4. catch: abort-do-cleanup (`aborted && !timedOut`) → `null`; `SessionNotFoundError` → `markDeleted`; đúng lifecycle → `setError` (timeout → "không phản hồi trong 2 giây").
  5. finally: clearTimeout; dọn `pollController/pendingGet` nếu còn là mình.
- **Cấu trúc dữ liệu:** `pendingGetRef: Promise|null`, `pollControllerRef: AbortController|null`, `timedOut: boolean`.
- **Độ phức tạp:** O(1) time & space + 1 GET; dedupe giảm tải khi poll 500ms < độ trễ mạng.
- **Edge case:** poll 500ms + GET >500ms → dedupe chặn chồng request `[đã chạy: 3 calls → 1 fetch]`; `markDeleted` chỉ chạy đúng lifecycle; error **không** xóa session hiện có (giữ last-known).
- **Demo `[đã chạy]`:** stub fetch 50ms → `Promise.all([r(),r(),r()])` → fetches=1; fetch treo >2s → error "không phản hồi trong 2 giây"; 404 `SESSION_NOT_FOUND` → `ended=true`.
- **Storyboard:** pool in-flight; đồng hồ 2s; caller xếp chung promise; sơ đồ nhánh catch theo lỗi.

#### `action-id-gen` — Sinh action id (X-Action-Id)
- **Refs:** `frontend/src/hooks/useVehicleSession.ts:31-35` `createSessionActionId` · **Prereq:** — · **Related:** `session-action-serialize`
- **Vai trò:** idempotency key cho POST; `crypto.randomUUID` khi có, ngược 32 hex từ `getRandomValues` — LAN HTTP không phải secure context nên `randomUUID` vắng mặt (`:29-30` comment).
- **Input → Output:** `()` → `string` (uuid hoặc 32 hex).
- **Pseudocode:**
  1. `typeof crypto.randomUUID === "function"` → `randomUUID()`.
  2. Ngược → `getRandomValues(16 bytes)` → map `toString(16).padStart(2,"0")` → join.
- **Cấu trúc dữ liệu:** `Uint8Array(16)`.
- **Độ phức tạp:** O(1) time & space.
- **Edge case:** không `crypto` → throw (không fallback thứ 3); fallback hex không dấu `-` (khác uuidv4 format — backend chỉ cần opaque).
- **Demo:** stub `crypto.randomUUID=undefined`, `getRandomValues` trả bytes cố định → expected chuỗi 32 ký tự hex lowercase (vd bytes `0x00..0x0f` → `"000102030405060708090a0b0c0d0e0f"`); 2 lần gọi khác nhau khi RNG thật.
- **Storyboard:** toggle "secure/insecure" → 2 nhánh entropy; hiển thị bytes→hex.

#### `completion-key-build` — Khóa dedupe popup đỗ xong
- **Refs:** `frontend/src/domain/session.ts:32-36` `buildSessionCompletionKey`; consumer `app/App.tsx:602,641-666` · **Prereq:** — · **Related:** `parking-decision-resolve`
- **Vai trò:** khóa duy nhất cho banner "đỗ thành công" — hiển thị 1 lần/episode (kể cả sau reload nhờ `sessionStorage`).
- **Input → Output:** `(session: VehicleSession)` → `string | null`.
- **Pseudocode:**
  1. `state!=="PARKED" || !parkedSpotId || !parkedAt` → `null` (`:33`).
  2. `parkingEpisodeId` → `"{sessionId}:{episodeId}"` (`:34`).
  3. Ngược → `"{sessionId}:{parkedSpotId}:{parkedAt}"` (`:35`).
- **Cấu trúc dữ liệu:** string key; consumer giữ `Set` consumed + `sessionStorage`.
- **Độ phức tạp:** O(1) time & space.
- **Edge case:** thiếu `parkedAt` → `null` → không popup (contract: backend phải set đủ bộ 3); đổi `parkedAt` → key mới → popup lại (hợp lý: episode mới).
- **Demo `[đã chạy]`:** `[PARKED+ep"ep-1" → "t:ep-1"; PARKED không ep → "t:D03:x"; PARKED thiếu parkedAt → null; SELECTING → null]`.
- **Storyboard:** 3 chân điều kiện tick; 2 biến thể khóa; timeline "reload trang" → key consumed → không popup lại.

#### `canonical-gid-chain` — Dây chuyền alias Global ID
- **Refs:** `frontend/src/domain/runtime.ts:191-202` `canonicalRuntimeId` · **Prereq:** — · **Related:** `vehicle-svg-project`, `session-commit-guard`, `parking-decision-resolve`
- **Vai trò:** tracker retire gid cũ → mới; frontend theo `retired_global_ids{old→new}` tới canonical; phát hiện vòng/dữ liệu xấu.
- **Input → Output:** `(gid: number, aliases: Record<string, number> = {})` → `number | null`.
- **Pseudocode (khớp `:191-202`):**
  1. `visited=∅`; lặp khi `aliases[String(gid)]` tồn tại: `gid ∈ visited` → `null` (cycle).
  2. `visited.add(gid)`; `next = aliases[gid]`; `undefined|!isSafeInteger|<0` → `null`.
  3. `next===gid` → `gid` (self-alias dừng); `gid=next`.
  4. Hết chuỗi → `gid`.
- **Cấu trúc dữ liệu:** `Set<number>` visited.
- **Độ phức tạp:** O(L) L=độ dài chuỗi (thực tế rất ngắn); space O(L).
- **Edge case:** `7→7` → 7; `5→7→5` → null → UI `identity_invariant_error`; `next=-3` → null; key chuỗi `"5"` vs gid số — luôn tra `String(gid)` (`:193`).
- **Demo `[đã chạy]`:** `{5:7,7:9}` → 9; `{5:7,7:5}` → null; `{7:7}` → 7; `{5:-3}` → null; `{}` → 5.
- **Storyboard:** chuỗi node gid + mũi tên; visited vàng; vòng → viền đỏ "cycle"; bảng quyết định/bước; textarea alias JSON.

#### `occupancy-classify` — Phân loại quan hệ ô–xe
- **Refs:** `frontend/src/domain/parking.ts:149-158` `classifySpotOccupancy` · **Prereq:** — · **Related:** `invalid-spot-recovery`, `parking-decision-resolve`
- **Vai trò:** ô đích còn "trống/của mình/xe khác/chưa rõ" — nguồn nhánh cảnh báo chiếm ô.
- **Input → Output:** `(spot: ParkingSpotState, globalVehicleId: number|null, parkedSpotId: SpotId|null)` → `"empty"|"own"|"other"|"unknown"`.
- **Pseudocode:**
  1. `status==="empty"` → `empty`.
  2. `parkedSpotId===spot.id` → `own`.
  3. `vehicleId==null || gid==null` → `unknown`.
  4. `vehicleId===gid` → `own`; ngược `other`.
- **Cấu trúc dữ liệu:** không.
- **Độ phức tạp:** O(1) time & space.
- **Edge case:** `parkedSpotId` khớp ưu tiên trước vehicleId (`:151-152`) — session PARKED át mọi suy luận; `occupied` không `vehicleId` → `unknown` chứ không `other` → App `:524-527` bỏ qua cảnh báo "xe khác".
- **Demo `[đã chạy]`:** spot `{C05,occupied,vehicleId:7}`: gid7→`own`; gid9→`other`; vehicleId null→`unknown`; status empty→`empty`; parkedSpotId="C05" → `own` bất kể vehicleId.
- **Storyboard:** truth table 4-5 dòng sáng theo input; slider gid/parkedSpotId; kết quả nối nhánh xử lý App.

#### `spot-event-reducer` — Reducer sự kiện ô (mock path)
- **Refs:** `frontend/src/stores/parkingStore.ts:81-129` `applyEvent` (+`:71-80` `applySnapshot` reset counters) · **Prereq:** `spot-ownership-map` · **Related:** `mock-scenario-emitter`, `parking-counts-derive`
- **Vai trò:** event-sourcing reducer cho `sample` source: ownership + revision monotone per-spot.
- **Input → Output:** `(event: ParkingEvent)` → `"applied"|"stale"|"unauthorized"|"unknown-spot"`; side-effect set state + counters.
- **Pseudocode (khớp `:81-129`):**
  1. `camera.health.changed` → merge `cameras[id]`, `lastEventTime` → applied.
  2. `!spots[spotId]` → `rejectedEvents++`, `unknown-spot`.
  3. `!cameraOwnsSpot(cam,spot) || current.owner!==cam` → warn(DEV) + rejected++, `unauthorized`.
  4. `event.revision <= current.revision` → `staleEvents++`, `stale`.
  5. Ngược: merge `{status,confidence,revision,updatedAt}` giữ field khác → applied.
- **Cấu trúc dữ liệu:** `spots: Record<SpotId,ParkingSpotState>`, counters `rejectedEvents/staleEvents` (reset khi applySnapshot).
- **Độ phức tạp:** O(1) time & space mỗi event (ngoài state O(S) của store).
- **Edge case:** revision `===` → stale (strict monotone); cam hợp lệ theo zone nhưng `current.owner` khác → unauthorized (double check); counters là "kể từ snapshot cuối".
- **Demo `[đã chạy]`:** spot A05 rev3 owner cam-right: `cam-left rev4 → unauthorized`; `cam-right rev3 → stale`; `cam-right rev4 → applied`; `spotId ZZ9 → unknown-spot`; counters `[rejected=2, stale=1]`.
- **Storyboard:** pipeline 4 cổng, event thẻ rơi qua; counters tăng; bảng spot trước→sau; nút phát 4 loại event.

#### `live-runtime-validator` — Contract freshness fail-closed
- **Refs:** `frontend/src/domain/runtime.ts:116-141` `liveRuntimeError` · **Prereq:** — · **Related:** `frame-cursor-guard`, `vehicle-svg-project`
- **Vai trò:** quyết định snapshot được render không — 5 điều kiện cứng, fail-closed.
- **Input → Output:** `(runtime: RuntimeSnapshot, nowMs: number = Date.now())` → `string | null`.
- **Pseudocode (khớp `:120-140`):**
  1. `schema_version !== 2` → lỗi.
  2. `source_mode !== "live"` → lỗi.
  3. `published_at` parse-fail hoặc `now−pub ∉ (−1000, 5000]ms` → "Dữ liệu camera đã cũ quá 5 giây".
  4. `cameras` rỗng → lỗi.
  5. Bất kỳ camera `!online || age_ms ∉ [0,5000]` → "Một camera mất kết nối…".
  6. → `null`.
- **Cấu trúc dữ liệu:** `Object.values(runtime.cameras)`.
- **Độ phức tạp:** O(C) time & space, C = |cameras| = 2.
- **Edge case:** `cameras` là `Partial<Record>` — **1 cam cũng pass** bước 5 (adapter đánh cam thiếu offline riêng) `[đã chạy: chỉ cam1 → null]`; clock client lệch >1s tương lai → reject (cần đồng hồ gần khớp backend); `source_mode:"replay"` → reject → nhãn "Replay đồng bộ" trong MonitorApp là **dead path** (`MonitorApp.tsx:276` vs `runtime.ts:123`).
- **Demo `[đã chạy]`:** 8 case: schema1→err; replay→err; pub+6s→err; pub tương lai 2s→err; cam age 6000→err; cameras {}→err; hợp lệ→null; chỉ cam1→null.
- **Storyboard:** checklist 5 mục tick/cross khi sửa JSON; slider clock-skew; toggle source_mode thấy replay bị chặn (giải thích dead-path monitor).

#### `frame-cursor-guard` — Chống frame lùi + watchdog
- **Refs:** `frontend/src/app/App.tsx:272-287` `requireLiveRuntime`; `:62,266,283,355-358` cursor/watchdog · **Prereq:** `live-runtime-validator` · **Related:** `runtime-request-coalesce`
- **Vai trò:** lớp 2 — per-`runtime_id` cursor `frame_index` đơn điệu + watchdog "không frame mới >5s".
- **Input → Output:** `(runtime: RuntimeSnapshot)` → `RuntimeSnapshot` hoặc throw `Error` (chuỗi tiếng Việt).
- **Pseudocode (khớp `:272-287`):**
  1. `liveRuntimeError(runtime)` → throw.
  2. `runtimeId = runtime.runtime_id ?? "legacy-runtime"`.
  3. cursor cùng runtimeId && `frame_index < cursor` → throw "frame cũ hơn".
  4. cursor mới/đổi runtimeId/`frame_index > cursor` → cập nhật + `progressAt=now` → return.
  5. `frame_index === cursor`: `now−progressAt > 5000` → throw "không có frame mới"; ngược return.
  6. Watchdog `setInterval(200ms)` kiểm lại mục 5 kể cả khi fetch fail (`:355-358`).
- **Cấu trúc dữ liệu:** `{cursor: number, runtimeId: string, progressAt: number}` trong refs.
- **Độ phức tạp:** O(1) time & space mỗi snapshot.
- **Edge case:** `runtime_id` mới → reset cursor (restart backend không kẹt); cùng frame liên tục → đúng 5s mới báo; đổi `trackingSource` reset (`:265-266`).
- **Demo `[đã chạy]`:** chuỗi `(fid, t)`: `(100,0)→ok; (101,1s)→ok; (99,2s)→"frame cũ hơn"; (101,8s)→"không có frame mới"; (r2!5,9s)→ok (reset)`.
- **Storyboard:** trục frame_index; cursor vạch; frame lùi đỏ; thanh "ms kể từ frame mới" → 5s; nút runtimeId mới.

#### `runtime-request-coalesce` — Gộp request + retry-after
- **Refs:** `frontend/src/api/runtimeApi.ts:6-36` `getRuntimeSnapshot` (+`:10-19` `requestRuntimeSnapshot` timeout) · **Prereq:** — · **Related:** `frame-cursor-guard`, `session-refresh-dedupe`
- **Vai trò:** chống bão request khi poll 200ms + nhiều consumer: dedupe in-flight + cache lỗi 2s.
- **Input → Output:** `(signal?: AbortSignal)` → `Promise<RuntimeSnapshot>`; module state `{pendingSnapshot, retryAfter, lastRuntimeError}`.
- **Pseudocode (khớp `:21-36`):**
  1. `signal` → bypass dedupe, fetch thẳng (timeout 2s, `AbortSignal.any`, `:10-19`).
  2. `now < retryAfter` → reject `lastRuntimeError` ngay (không fetch).
  3. `pendingSnapshot` → trả promise đó.
  4. Ngược: fetch; catch → `lastRuntimeError=err`, `retryAfter=now+2000`, rethrow; finally `pendingSnapshot=null`.
- **Cấu trúc dữ liệu:** module-level singleton `{pending: Promise|null, retryAfter: number, lastError: Error|null}`.
- **Độ phức tạp:** O(1) time & space mỗi call.
- **Edge case:** GET thành công **không** cache (fresh mỗi lần); lỗi chỉ cache 2s → nhịp retry = max(lỗi, +2s); call kèm `signal` riêng (gate fetch) không hưởng dedupe và không set `retryAfter`.
- **Demo `[đã chạy]`:** fetch reject: 3 call liên tiếp → **fetches=1** (call 2,3 bị retryAfter nuốt) — `[err,err,err], fetches=1`; fetch resolve 50ms → 3 call chồng → 1 fetch.
- **Storyboard:** lane caller → funnel; timer retry-after đếm ngược; đếm "fetch thật"; nút "làm fetch fail".

#### `qr-visibility-window` — Cửa sổ QR 120s + chọn cuối còn hạn
- **Refs:** `frontend/src/components/EntryQRKiosk.tsx:6-7` constants, `:9-17` `qrExpiryTime`/`isQrVisible`, `:28-78` poll/generate/timeout effects · **Prereq:** — · **Related:** `session-commit-guard`
- **Vai trò:** kiosk: poll `/api/sessions/waiting` 250ms, chọn session **cuối cùng** còn hạn, sinh QR data-url local (lib `qrcode` — stub trong demo, §5).
- **Input → Output:** `waiting: VehicleSession[]` + `now` → `VehicleSession | null` hiển thị; `session → navigationUrl → dataUrl`.
- **Pseudocode (khớp `:9-17,32-78`):**
  1. `qrExpiryTime(s) = Date.parse(qrExpiresAt)` nếu finite, ngược `parse(createdAt) + 120_000`.
  2. `isQrVisible(s,now) = expiry > now`.
  3. Mỗi 250ms: `waiting.filter(isQrVisible).at(-1)` → session (`.at(-1)` giả định backend trả tăng dần `[giả định — cần builder-c xác nhận thứ tự]`).
  4. `sessionId` đổi → `QRCode.toDataURL(url, {width:256,margin:2,ecLevel:"M"})`; `qrDataUrl` chỉ hiện nếu `generatedQr.navigationUrl === navigationUrl` (`:26` chống QR cũ).
  5. `remainingMs` → `setTimeout` ẩn đúng hạn.
- **Cấu trúc dữ liệu:** `{session, generatedQr{navigationUrl,dataUrl}}`; poll `AbortController`.
- **Độ phức tạp:** O(|waiting|) time & space (mảng filter) mỗi poll.
- **Edge case:** fetch lỗi → giữ QR hiện tại (silent `:41-43`); `qrExpiresAt` parse-fail → fallback createdAt+120s `[đã chạy]`; hai xe gần nhau → QR mới thay ngay; StrictMode double-mount → cleanup chuẩn.
- **Demo (FIX-QR1, now=10:00:00Z) `[đã chạy]`:** `pick(0)=S3`; `pick(+45s)=S3` (S2 hết, S3 còn 45s); `pick(+95s)=null` → kiosk-empty. Fallback: `createdAt=09:58:00, qrExpiresAt="not-a-date"` → expiry `10:00:00Z`; visible @+119s, expired @+121s.
- **Storyboard:** danh sách waiting + thanh TTL; QR đổi khi session mới; countdown 120s vòng tròn; bảng {sessionId, expiry, remaining}; text VN "QR tự ẩn dù chưa ai quét".

#### `parking-decision-resolve` — Resolver quyết định đỗ (9 nhánh)
- **Refs:** `frontend/src/domain/sessionParking.ts:27-112` `resolveSessionParking`, `:114-132` `collectOwnSpots`, `:134-139` `isConfirmedParked` · **Prereq:** `completion-key-build` · **Related:** `occupancy-classify`, `invalid-spot-recovery`, `nav-goal-resolve`
- **Vai trò:** `session + runtime` → một `SessionParkingDecision` — bộ não điều phối UI đỗ xe (banner/cảnh báo/route).
- **Input → Output:** `ResolveInput{session,vehicles,slots,dwellThresholdMs,episodes?,pendingConfirmations?,parkingPipeline?}` → 1 trong 9 variant (`:5-15`).
- **Pseudocode (khớp `:27-112`, thứ tự ưu tiên):**
  1. `EXIT_NAVIGATION` → `exit_navigation`.
  2. `PARKED && parkedSpotId && completionKey && parkedAt` → `parked`.
  3. `ownSpots` = episodes parked của gid (loại episode đang RELOCATING) hoặc fallback (`vehicle.parked_slot_id` ∪ slot `vehicle_id===gid && parked && stopped≥dwell`); `>1` → `identity_invariant_error`; `==1` → `parking_confirmation_pending`.
  4. `ownPending` = pending của gid `state!=="collecting"`, sort `max_overlap` giảm, đầu tiên; nếu có: pipeline degraded ∨ `age_ms≥5000` ∨ `insufficient_evidence` → `parking_processing_delayed`; ngược → `parking_confirmation_pending`.
  5. `!targetSpotId` → `no_target`.
  6. Slot đích không có → `runtime_unavailable`.
  7. `status==="empty"` → `guiding`.
  8. `vehicle_id==null` → `identity_pending(no_vehicle_id)`.
  9. `vehicle_id===gid` → `parking_confirmation_pending`.
  10. Xe khác confirmed parked (episodes ? episode parked : `stopped≥dwell`) → `target_occupied_by_other`.
  11. Ngược → `identity_pending(other_unconfirmed)`.
- **Cấu trúc dữ liệu:** discriminated union `SessionParkingDecision`; `Set` ownSpots.
- **Độ phức tạp:** O(V+S+E+P) time duyệt 1 lần (V vehicles, S slots, E episodes, P pendings); **space O(V+E+P)** — Set ownSpots + duyệt qua arrays.
- **Edge case / failure:** `episodes` vắng mặt → fallback dwell-based (App truyền `PARKING_DWELL_MS=2000`, `App.tsx:34,138`); RELOCATING loại episode hiện tại khỏi ownSpots (`:46`) — tránh tự đếm ô cũ; occupied bởi xe khác chưa confirm → `identity_pending` (chờ bằng chứng, không báo chiếm vội).
- **Demo (FIX-S1+FIX-R1) `[đã chạy]`:** a) `guiding`; b) slot occupied+vid9+parked+3000 → `target_occupied_by_other`; c) pending age 1200 → `parking_confirmation_pending`; d) pending age 6000 → `parking_processing_delayed`; e) vehicle parked_slot D03 → `parking_confirmation_pending(D03)`; f) PARKED+key → `parked`+`"tok-abc:ep-9"`; g) 2 slot parked cùng gid → `identity_invariant_error`; h) `no_target`; i) occupied no vid → `identity_pending/no_vehicle_id`; j) other unconf (stopped 500<2000) → `identity_pending/other_unconfirmed`; k) slot ZZ9 → `runtime_unavailable`.
- **Storyboard:** decision tree dọc; input JSON editable; đường đi active sáng; bảng ownSpots/pending/dwell `stopped≥2000`; mỗi variant màu riêng map sang banner thật.

---

### Nhóm GEOM-RENDER

#### `parking-geometry-gen` — Sinh geometry 60 ô
- **Refs:** `frontend/src/geometry/parkingGeometry.ts:118-270` `generateParkingGeometry`, `spotY`/`getAisleCenterX`/`getEntryPoint`; singleton `:272` · **Prereq:** — · **Related:** `lane-graph-build`, `spot-ownership-map`
- **Vai trò:** procedural layout — 6 cột zone, 3 làn, ô 90×56 gap 10, entryPoint hướng làn, anchors.
- **Input → Output:** `()` → `ParkingGeometry{spots, zones, lanes/aisles, connectors, entrance, exit, anchors}`.
- **Pseudocode:**
  1. `spotY(n) = 112 + (10−n)·66` → ô 10 trên cùng (y=112), ô 1 dưới (y=706) `[đã chạy]`.
  2. Mỗi zone: 10 ô tại cột `ZONE_COLUMNS[id]`; `entryPoint.x = spotX<aisleX ? x+90+8 : x−8` (hướng làn).
  3. Zone bounds bao cột; 3 aisles {left:250, center:540, right:840}; 2 connectors y=75/775 cao 30.
  4. entrance (1100,790), exit (1100,90); anchors cố định 3 nhu cầu.
- **Cấu trúc dữ liệu:** `ParkingSpotGeometry{id,zone,index,x,y,w,h,entryPoint,center}`; `SPOT_GEOMETRY_BY_ID` map.
- **Độ phức tạp:** O(Z·N) time = 60 ô; **space O(S)** output geometry; chạy 1 lần module init.
- **Edge case:** `SPOTS_PER_ZONE=10` hardcode — đổi cần sửa `FIRST_SPOT_Y`/height thủ công; `ZONE_COLUMNS` hardcode theo zone id.
- **Demo `[đã chạy]`:** `spotY(1)=706 > spotY(5)=442 > spotY(10)=112` (đảo); entryPoint C05 (spotX 600 < aisle 600? cột C=600 vs center-lane 540 → spotX>aisleX → x−8). Mini: SPOTS_PER_ZONE=3, 2 zone → 6 ô.
- **Storyboard:** slider n → cột ô mọc; highlight `112+(10−n)·66`; toggle entryPoint chấm xanh + aisle overlay.

#### `spot-ownership-map` — Ánh xạ ô↔camera
- **Refs:** `frontend/src/domain/parking.ts:123-143` `LEFT_ZONES`, `formatSpotId`, `parseSpotId`, `getSpotOwner`, `cameraOwnsSpot` · **Prereq:** — · **Related:** `spot-event-reducer`, `mock-scenario-emitter`
- **Vai trò:** ownership tĩnh disjoint: `{F,E,D}→cam-left`, `{A,B,C}→cam-right` (khớp cam1/cam2 backend).
- **Input → Output:** `getSpotOwner(spotId: SpotId) → CameraId`; `cameraOwnsSpot(cameraId, spotId) → boolean`; `parseSpotId(spotId) → {zone: ZoneId, number: number}`; `formatSpotId(zone, n) → SpotId`.
- **Pseudocode:**
  1. `parseSpotId`: `zone = spotId[0]`, `number = +spotId.slice(1)` (`:129-133`).
  2. `getSpotOwner = LEFT_ZONES.has(zone) ? "cam-left" : "cam-right"` (`:136-139`).
  3. `cameraOwnsSpot = getSpotOwner(spot)===cam` (`:141-143`).
- **Cấu trúc dữ liệu:** `Set` LEFT_ZONES.
- **Độ phức tạp:** O(1) time & space.
- **Edge case / failure:** spotId dị dạng (`"G11"`, `"A"`) → `parseSpotId` vẫn trả (zone cast mù, `number: NaN`) → owner `cam-right` — **không validate** (caller phải truyền SpotId hợp lệ); `formatSpotId` `padStart(2,"0")` → n>99 tràn ký tự.
- **Demo:** `F07→cam-left`; `A03→cam-right`; `cameraOwnsSpot("cam-left","A03")→false`; `parseSpotId("A05")→{zone:"A",number:5}`; `"G11"` → `{zone:"G",number:11}` + owner cam-right (minh họa không validate).
- **Storyboard:** map tô 2 màu cam; click ô → owner; input spotId tự do → hiện parse "mù" khi dị dạng.

#### `parking-counts-derive` — Đếm trạng thái ô
- **Refs:** `frontend/src/stores/parkingStore.ts:43-52` `deriveParkingCounts` · **Prereq:** — · **Related:** `spot-event-reducer`
- **Vai trò:** fold spots → `ParkingCounts` cho SummaryCards (nguồn truth = spot state, không tin event).
- **Input → Output:** `(spots: readonly ParkingSpotState[])` → `ParkingCounts{total,empty,occupied,reserved,transitioning,unknown}`.
- **Pseudocode:**
  1. `counts = {total:spots.length, …0}`.
  2. ∀spot: `counts[spot.status]++`.
- **Cấu trúc dữ liệu:** object 6 field cố định.
- **Độ phức tạp:** O(S) time, O(1) space (counts 6 field cố định); S=60.
- **Edge case:** status lạ ngoài 5 giá trị union → TS chặn compile; reserved đếm riêng (không gộp occupied).
- **Demo:** `{2 empty,1 occupied,1 reserved,1 transitioning,1 unknown}` → `{total:6,empty:2,…}` `[đã chạy công thức]`; mock snapshot 60 → `{43,8,5,4,0}` theo `mock-scenario-emitter`.
- **Storyboard:** stacked bar cập nhật khi đổi status ô; click segment filter map.

#### `affine-fit-transform` — Fit affine least-squares
- **Refs:** `frontend/src/calibration/worldToSvg.ts:11-17` `polygonCenter`, `:19-40` `solve3`, `:45-51` `fitAffine` cache, `:53-81` `computeAffine` · **Prereq:** `parking-geometry-gen` (tâm ô SVG) · **Related:** `world-svg-project`, `vehicle-svg-project`
- **Vai trò:** ≥3 cặp (tâm polygon world ô ↔ tâm ô SVG) → affine `x'=[a b c], y'=[d e f]` bằng least-squares — cầu nối world camera → bản đồ.
- **Input → Output:** `(layout: RuntimeSlotLayout[])` → `AffineTransform{x:[3], y:[3]} | null`.
- **Pseudocode (khớp `:53-81`):**
  1. ∀slot: `world = trung bình polygon` (`polygonCenter`), `svg = tâm SPOT_GEOMETRY_BY_ID[slot_id]`; bỏ cặp không khớp id.
  2. `<3` anchors → `null`.
  3. `normal[i][j] = Σ row_i·row_j`, `row=[wx,wy,1]`; `targetX[i]=Σ row_i·svg.x`; `targetY` tương tự.
  4. `x = solve3(normal, targetX)`; `y = solve3(normal, targetY)` — Gauss-Jordan partial pivot, pivot `<1e-9` → `null` (`:19-40`).
  5. `fitAffine` cache theo `JSON.stringify(layout)` (`:45-51`).
- **Cấu trúc dữ liệu:** ma trận 3×3 augmented; cache `{lastLayoutKey,lastTransform}` module-level.
- **Độ phức tạp:** O(S) time anchors (S≤60) + O(1) solve 3×3; stringify cache key O(S); **space O(1)** — ma trận 3×3 + 2 vector (ngoài input + cache key O(S)).
- **Edge case / failure:** anchors thẳng hàng/trùng → `normal` suy biến → `null` `[đã chạy]`; ≥4 anchors → LS trung bình (không interpolate chính xác); key-order polygon đổi → cache miss (an toàn, chậm).
- **Demo (FIX-A1) `[đã chạy]`:** transform `x:[2,0,100], y:[0,2,200]`; query `(50,25)→(200,250)`; 2 anchors → `null`; 3 anchors thẳng hàng → `null`.
- **Storyboard:** map trái (world) 3 điểm neo kéo, map phải (SVG) đích; vector sai số đỏ mỗi anchor; bảng normal 3×3 điền số; nút "thêm anchor thứ 4" (LS vs exact), "thẳng hàng" (singular).

#### `world-svg-project` — Chiếu/đảo chiếu + fallback clamp
- **Refs:** `frontend/src/calibration/worldToSvg.ts:83-113` `createWorldToSvg`, `createSvgToWorld` · **Prereq:** `affine-fit-transform` · **Related:** `vehicle-svg-project`, `gate-node-mutate`, `gate-line-derive`
- **Vai trò:** hàm project dùng khắp app (xe, cổng); inverse cho gate editor `/monitor`.
- **Input → Output:** `createWorldToSvg(layout) → (p: {x,y}) => {x,y}`; `createSvgToWorld(layout) → ((p)=>{x,y}) | null`.
- **Pseudocode (khớp `:83-113`):**
  1. `transform = fitAffine(layout)`.
  2. `null` → **fallback `clamp(0≤x≤1200, 0≤y≤900)` trên tọa độ world** (`:85-89`) — rủi ro: world cm ≫ SVG → xe "dính" góc im lặng.
  3. Có transform → `x' = a·wx + b·wy + c`, `y' = d·wx + e·wy + f`.
  4. Inverse: `det = a·e − b·d`; `|det|<1e-9` → `null` ngược công thức affine nghịch.
- **Cấu trúc dữ liệu:** closure trên `AffineTransform`; `det` scalar.
- **Độ phức tạp:** O(1) time & space /điểm; fit O(S) một lần (cache).
- **Edge case / failure — điểm yếu thiết kế (R2):** fallback im lặng vẽ sai vị trí thay vì ẩn xe — demo nên hiện cảnh báo khi transform null `[demo khác code]`; det≈0 → inverse null → gate editor không dùng được.
- **Demo (FIX-A1) `[đã chạy]`:** `(50,25)→(200,250)`; layout rỗng → clamp: `(1500,800)→(1200,800)`; inverse `(200,250)→(50,25)` (det=4, fp <1e-9).
- **Storyboard:** 2 map song song; toggle "bỏ anchors" → xe dính biên + banner "thiếu slot_layout" (demo thêm); ma trận nhân từng bước số học; det hiển thị.

#### `vehicle-svg-project` — Lọc & chiếu xe phiên
- **Refs:** `frontend/src/calibration/worldToSvg.ts:115-133` `runtimeVehiclesOnSvg` · **Prereq:** `world-svg-project`, `canonical-gid-chain` · **Related:** `parked-marker-fallback`
- **Vai trò:** snapshot → `ActiveVehicle[]` trên SVG; `globalId` → chỉ xe của phiên (canonicalized).
- **Input → Output:** `(snapshot: RuntimeSnapshot, globalId?: number|null)` → `ActiveVehicle[]{trackId,x,y,trail:[],state,observed,cameraIds,parkedSlotId}`.
- **Pseudocode (khớp `:115-133`):**
  1. `project = createWorldToSvg(snapshot.slot_layout)`.
  2. `canonical = globalId!=null ? canonicalRuntimeId(globalId, retired_global_ids) : null`.
  3. Filter `globalId==null || v.global_id === canonical`.
  4. Map `{trackId: v.global_id, ...(project(v.position)), trail:[], state, observed, cameraIds, parkedSlotId}`.
- **Cấu trúc dữ liệu:** `ActiveVehicle[]` FE-side (trail luôn `[]` — không lưu quỹ đạo).
- **Độ phức tạp:** O(V) time — vehicles × O(1) project; **space O(V)** mảng `ActiveVehicle[]` ra.
- **Edge case:** `canonical===null` (cycle) → filter `v.global_id===null` → **mảng rỗng** — xe phiên biến mất khỏi map (đi kèm `identity_invariant_error`); `position.reference` khác "world" `[giả định: vẫn chiếu — code không check reference]`.
- **Demo `[đã chạy]`:** FIX-R1 + gid=5 với `{5:7}` → giữ vehicle 7; gid=8 → `[]`; `{5:7,7:5}` → `[]`.
- **Storyboard:** vehicles → phễu canonical → chấm map; bảng {gid,canonical,pass?}; textarea alias map; toggle "cycle aliases".

#### `route-polyline-simplify` — Gộp điểm thẳng hàng
- **Refs:** `frontend/src/components/ParkingMap.tsx:82-96` `simplifyRoutePoints` · **Prereq:** — · **Related:** `turn-instruction` (cùng cross product), `route-arrow-place`
- **Vai trò:** bỏ node thẳng hàng khỏi polyline vẽ — route qua nhiều junction cùng làn không cần vertex thừa.
- **Input → Output:** `points: Point[]` → `Point[]` (giữ đầu + cuối).
- **Pseudocode (khớp `:82-96`):**
  1. `<3` → giữ nguyên.
  2. ∀điểm giữa: `cross = (cur−prev) × (next−cur)`; `|cross| > 0.01` → giữ.
  3. Đẩy điểm cuối.
- **Cấu trúc dữ liệu:** array ra (≤ input).
- **Độ phức tạp:** O(n) time, **O(n) space output** (worst giữ tất cả điểm).
- **Edge case:** ngưỡng 0.01 (đv²) — góc siêu nhỏ bị bỏ; **chỉ áp render** — `checkIsOffRoute`/instruction chạy trên `route.points` gốc; điểm trùng đầu→cross 0 → bỏ.
- **Demo `[đã chạy]`:** `[(0,0),(1,0),(2,0),(2,2),(4,2)]` → `[(0,0),(2,0),(2,2),(4,2)]` (bỏ (1,0)).
- **Storyboard:** polyline gốc mờ + kết quả đậm; node bị bỏ mờ dần; cross hiển thị/điểm giữa; slider ngưỡng.

#### `route-arrow-place` — Đặt mũi tên theo cung dài
- **Refs:** `frontend/src/components/ParkingMap.tsx:98-123` `createRouteArrows` · **Prereq:** — · **Related:** `route-polyline-simplify`
- **Vai trò:** rải mũi tên chỉ hướng đều nhau trên tuyến.
- **Input → Output:** `points: Point[]` → `RouteArrowPoint[]{x,y,angle}`.
- **Pseudocode (khớp `:98-123`):**
  1. Tính `len` từng đoạn + `totalLength`; `<140` → `[]`.
  2. `target=100`; duyệt đoạn: khi `target ≤ traversed+seg.len && target < total−45`: `ratio=(target−trav)/len` → nội suy + `atan2(dy,dx)·180/π`; `target += 190`.
  3. Dừng khi `target ≥ total−45`.
- **Cấu trúc dữ liệu:** `RouteArrowPoint{x,y,angle}`.
- **Độ phức tạp:** O(n + m) time, **O(m) space output** — m = số mũi ≤ ⌊(total−145)/190⌋.
- **Edge case:** đoạn len=0 → ratio 0, skip (`:114`); mũi đầu ≥100 đv, mũi cuối cách đích ≥45 → tuyến ngắn không mũi; `target<total−45` **strict** — mốc đúng biên bị cắt.
- **Demo `[đã chạy]`:** route thẳng 600 → mũi tại d=`100,290,480` (3 mũi, angle 0°); **route thẳng 500 → chỉ `100,290` (2 mũi — mốc 480 ≥ 500−45=455 bị cắt)**; route 120 → `[]`.
- **Storyboard:** thước cung dài dưới map; mũi spawn tại mốc; bảng {traversed, target, seg.len}; slider totalLength.

#### `viewbox-pan-zoom` — Pan/zoom/pinch viewBox
- **Refs:** `frontend/src/components/ParkingMap.tsx:57-66` `clampView`, `:146-208` `zoomAt` + handlers · **Prereq:** — · **Related:** `gate-line-derive` (khóa khi edit)
- **Vai trò:** điều hướng map: 1 pointer pan, 2 pointer pinch theo trọng tâm, wheel zoom tại con trỏ, reset.
- **Input → Output:** view `{x,y,width,height}` ⊂ `[0..1200]×[0..900]`; pointer events → view mới.
- **Pseudocode (khớp `:57-66,146-208`):**
  1. `clampView`: `width ∈ [360,1200]`; `height = width·(900/1200)` (khóa 4:3); x,y clamp trong biên.
  2. `zoomAt(factor, rx=0.5, ry=0.5)`: `w' = w·factor`; `x' = x + (w−w')·rx`; `y' = y + (h−h')·ry` → clamp.
  3. Pan 1 pointer: `x −= (dx/rectW)·view.w`; `y −= (dy/rectH)·view.h` → clamp.
  4. Pinch 2 pointer: `factor = prevDist/nextDist` → zoomAt tại trung điểm (% rect).
  5. Wheel: `factor = deltaY>0 ? 1.12 : 0.88` tại con trỏ.
- **Cấu trúc dữ liệu:** `ViewBoxState{x,y,width,height}`; refs `dragging`, `lastPinchDist`.
- **Độ phức tạp:** O(1) time & space/event.
- **Edge case / failure:** `preventDefault` trong `onWheel` — React root wheel listener passive `[giả định — cần kiểm chứng browser]`; zoom-out trần width=1200 (không nhỏ hơn map); `gateOverlay.editing` khóa mọi cử chỉ (`:160,168,204`); `height` luôn derive từ width (không méo).
- **Demo `[đã chạy]`:** `zoomAt((0,0,1200,900), 0.5, 0.5,0.5)` → `{x:300, y:225, width:600, height:450}` (khớp `x' = 0 + (1200−600)·0.5 = 300`); pan `dx=−30px` trong rect 600px (view 1200) → `x += 60`.
- **Storyboard:** khung viewBox trên thumbnail; công thức thay số; 2 chấm pointer giả pinch; nút reset-view.

---

### Nhóm FLOW

#### `driver-flow-machine` — Máy trạng thái UI driver
- **Refs:** `frontend/src/stores/driverFlowStore.ts:34-93`; đồng bộ `frontend/src/app/App.tsx:607-632` · **Prereq:** — · **Related:** `nav-goal-resolve`, `invalid-spot-recovery`, `parking-decision-resolve`
- **Vai trò:** `mode ∈ entry|browse|recommendation|navigation` + `browseFilter`, `activeNeed`, `recommendation`, `inspectedSpotId`, `confirmedSpotId`, `warning`; cộng lớp đồng bộ session→UI.
- **Input → Output:** actions `(filter|need|spotId|warning)` → partial state; session state → auto transitions.
- **Pseudocode:**
  1. `enterBrowse(f)`: browse, xoá need/reco/inspect/confirm/warning.
  2. `startRecommendation`: recommendation, clear tương tự.
  3. `chooseNeed(n)`: activeNeed=n, xoá reco.
  4. `chooseRecommendedSpot(id)`: `promoteRecommendation` trong reco (`:74-79`).
  5. `inspectSpot(id?)`; `confirmSpot(id)`: navigation + confirmed=id + clear inspect/warning.
  6. `showInvalidSpotWarning(w)`/`clearWarning`; `cancelNavigation` → browse + clear.
  7. Sync (`:607-632`): `NAVIGATING/RELOCATING`+target → `confirmSpot(target)` + reset flag; `SELECTING_SPOT`+entry → `enterBrowse("all")`; `EXIT_NAVIGATION` → `isExitGuideActive`; `PARKED` → voice stop + cancel.
- **Cấu trúc dữ liệu:** Zustand store `DriverFlowState`; cờ App `isExitGuideActive`, `isRouteDismissed`, `consumedCompletionKeys`.
- **Độ phức tạp:** O(1) time & space/action (promote O(3)).
- **Edge case / failure:** **hai nguồn truth** — `confirmedSpotId` local vs `session.targetSpotId`; sync effect chữa lệch (`:612-614`) nhưng có cửa sổ race ngắn; `reset()` dùng `initialState` object chung (primitive nên an toàn).
- **Demo:** `startRecommendation→chooseNeed→confirmSpot→cancelNavigation` → modes `[recommendation,recommendation,navigation,browse]`; giả lập session `NAVIGATING` → mode navigation tự động `[đã chạy transition table]`.
- **Storyboard:** state diagram 4 node; transition gán action; state panel cập nhật; log session-event → auto-transition; nút replay kịch bản.

#### `nav-goal-resolve` — Giải đích & tính route theo mode
- **Refs:** `frontend/src/app/App.tsx:677-692` memo `goalSpot/isExitMode`, `:703-732` effect tính route, `:735-786` effect guidance · **Prereq:** `driver-flow-machine`, `pos-route-wrappers`, `off-route-detect`, `turn-instruction` · **Related:** `invalid-spot-recovery`
- **Vai trò:** quyết định "route đi đâu, mode nào"; 2 effect: (1) tính lại khi đích/mode đổi, (2) cập nhật theo vị trí xe mỗi nhịp.
- **Input → Output:** `{session, confirmed/inspected spotId, isExitGuideActive, isRouteDismissed, targetVehicle, spots}` → `route: RouteResult|null` + `offRoute: boolean` + voice.
- **Pseudocode:**
  1. Goal (`:677-692`): `PARKED|EXIT_NAVIGATION` → chỉ khi `isExitGuideActive` → goal=`parkedSpot ?? confirmed`, exit=true; ngược goal=`sessionTargetSpot ?? confirmed ?? inspected`; `isRouteDismissed || sessionEnded` → goal=null.
  2. Effect route (`:703-732`): !goal hoặc runtimeError → route=null + voice stop; ngược: `targetVehicle` → exit?`findExitRouteFromPos`:`findInboundRouteFromPos`; không xe → exit?`findExitRoute`:`findVehicleRoute`.
  3. Effect guidance (`:735-786`): cần `targetVehicle.observed`; `offRoute = checkIsOffRoute(V, route.points, 80)`; `freshRoute` từ vị trí; offRoute → voice urgent + banner + `setRoute(freshRoute)`; ngược → `setRoute(freshRoute)` co + `getNavigationInstruction` + speak non-urgent.
- **Cấu trúc dữ liệu:** `route` state; `sessionTrackIdRef` (canonical gid); `lastInstructionRef`.
- **Độ phức tạp:** effect2 O(E log E + V²) time, **O(V+E) space** (tempGraph + route) mỗi nhịp ~200ms khi có xe.
- **Edge case / failure:** xe `observed:false` → effect2 return sớm (route giữ, không cảnh báo); `runtimeError` nuốt mọi dẫn đường; nhánh không-xe exit → `findExitRoute` **luôn null** (sink BUG); **không có progress metric** — tiến độ = route co ngắn + `closestIndex` proxy.
- **Demo:** state máy FIX-S1 (NAVIGATING→C05, xe (6,4.5)) → goal=C05, route dynamic 1.6 `[đã chạy]`; `observed:false` → route giữ; EXIT+guide on → exit route 5.0.
- **Storyboard:** 2 lane effect1/effect2; bảng {goal, mode, targetVehicle}; mũi "tính lại" chỉ sáng khi deps đổi; kéo xe khỏi corridor → auto-reroute.

#### `invalid-spot-recovery` — Auto-reroute & warning khi mất ô
- **Refs:** `frontend/src/app/App.tsx:421-475` effect session-path, `:476-596` non-session/unknown branches, `:789-825` `handleConfirmSpot`, `:846-851` `switchAlternative` · **Prereq:** `parking-decision-resolve`, `spot-rank-score`, `session-action-serialize`, `occupancy-classify` · **Related:** `driver-flow-machine`
- **Vai trò:** ô đích bị chiếm → alternatives A*-ranked → **commit tuần tự** `POST select` tới khi backend nhận → confirm + notice + voice; hết phương án → `InvalidSpotWarningSheet`.
- **Input → Output:** `{decision, session, alternatives}` → POST selects → `{committedSpot | warning}`.
- **Pseudocode (khớp `:421-475`):**
  1. `decision.kind==="target_occupied_by_other"` → top-3 `recommendParkingSpots` (loại ô cũ).
  2. `rerouteKey = sessionId:revision:spotId:otherGid` — dedupe chống POST lặp mỗi poll (`:442-444`).
  3. ∀alt: `await selectSessionSpot(alt)` → accept → `confirmSpot(alt)` + notice + voice urgent, return; `BackendApiError` code ∈ `{SPOT_RESERVED,SPOT_NOT_AVAILABLE}` → continue; lỗi khác → break.
  4. Hết vòng → `showInvalidSpotWarning{spotId,status:"occupied",alternativeSpotIds}`.
- **Cấu trúc dữ liệu:** `rerouteKeyRef` dedupe; `warning` state; notice string.
- **Độ phức tạp:** ≤3 POST tuần tự; ranking O(k·A*) time; **space O(k)** alternatives (k≤3).
- **Edge case / failure:** `selectSessionSpot` trả null (bị action khác khóa) → `continue` `[code — không phân biệt null-locked/null-failed]`; rerouteKey reset khi decision khác (`:423-425`) — decision thoáng qua có thể retrigger; `switch-alternative` whitelist `warning.alternativeSpotIds` (`:847-850`).
- **Demo `[đã chạy]`:** stub select: alt1 `SPOT_RESERVED` → thử alt2 `rev6` → posts=`[B02:RESERVED, A09:ok]`, commit A09 + notice; cả 3 RESERVED → warning sheet 3 nút.
- **Storyboard:** slot đích đỏ; alt bay sang; POST sequence log; notice xanh/xám; nút manual alt (whitelist).

#### `parked-marker-fallback` — Marker ảo khi PARKED
- **Refs:** `frontend/src/app/App.tsx:906-921` `displayedVehicles` · **Prereq:** `vehicle-svg-project` · **Related:** `parking-decision-resolve`
- **Vai trò:** session PARKED mà xe rơi khỏi `activeVehicles` (tracker mất dấu) → vẽ marker tại tâm `sessionParkedSpot`.
- **Input → Output:** `(activeVehicles: ActiveVehicle[], sessionParkedSpot: SpotGeometry|null, sessionState, targetGid)` → `ActiveVehicle[]`.
- **Pseudocode (khớp `:906-921`):**
  1. `own = activeVehicles.find(trackId===targetGid && observed)` → trả nguyên.
  2. `state!=="PARKED" || !parkedSpotId || targetGid==null` → trả nguyên.
  3. `geom = SPOT_GEOMETRY_BY_ID[parkedSpot]`; `!geom` → trả nguyên.
  4. → mảng 1 phần tử fabricated `{trackId:gid, x:geom.center.x, y:geom.center.y, trail:[], state:"parked", parkedSlotId}`.
- **Cấu trúc dữ liệu:** `ActiveVehicle` fabricated (không qua projection — tâm ô SVG trực tiếp).
- **Độ phức tạp:** O(V) time find, O(1) space (1 phần tử fabricated).
- **Edge case:** ô không geometry → không marker; marker ảo hiện kể cả khi tracker vẫn thấy xe khác — chỉ fallback cho **xe của phiên**.
- **Demo `[đã chạy]`:** PARKED+C05, active `[]` → 1 marker `(5.6,4)`; observed vehicle 7 → trả nguyên.
- **Storyboard:** toggle "xe còn observed?" → marker đổi nguồn; chú thích "tâm ô (không phải tracking)".

#### `gate-line-derive` — Suy chiều vạch cổng từ 3 điểm
- **Refs:** `frontend/src/app/MonitorApp.tsx:25-35` `acceptedPointForGate`, `:37-54` `gateLineFromPoints` · **Prereq:** `world-svg-project` (svgToWorld) · **Related:** `gate-node-mutate`
- **Vai trò:** vận hành bấm `p1, p2` (vạch) + 1 điểm phía xe tới → `RuntimeGateLine{name,p1,p2,direction}` gửi backend.
- **Input → Output:** `gateLineFromPoints(name: string, points: RuntimePoint[3])` → `RuntimeGateLine` (throw `Error` tiếng Việt); `acceptedPointForGate(gate: RuntimeGateLine)` → `RuntimePoint` (chỉ để vẽ mũi tên).
- **Pseudocode (khớp `:37-54`):**
  1. Thiếu điểm → throw "Thiếu điểm cấu hình…".
  2. `|p1p2| < 1e-6` → throw "Hai đầu vạch … phải khác nhau".
  3. `side = (p2−p1)×(acc−p1)`; `|side|<1e-6` → throw "Điểm chỉ hướng … không được nằm trên vạch".
  4. `direction = side>0 ? "negative" : "positive"`; toạ độ `toFixed(4)`.
  5. `acceptedPointForGate`: `sideSign = direction==="negative" ? 1 : −1`; điểm = `mid + sideSign·normal_đơn_vị·max(0.6·len, 2)` (`:25-35`).
- **Cấu trúc dữ liệu:** `RuntimePoint{x,y}`, `RuntimeGateLine`.
- **Độ phức tạp:** O(1) time & space.
- **Edge case:** convention dấu ngược trục chéo — demo giữ nguyên công thức; `acceptedPointForGate` **không** tái tạo điểm click gốc (tính lại theo normal·0.6len).
- **Demo `[đã chạy]`:** `p1(0,0),p2(10,0),acc(5,5)` → side=50 → `direction:"negative"`; `acc(5,−5)` → `"positive"`; `acc(5,0)` → throw; `acceptedPointForGate(negative)` → `(5,6)`, `(positive)` → `(5,−6)`.
- **Storyboard:** 3 chấm kéo; vạch + pháp tuyến mũi tên; bảng {dx,dy,side,direction}; lỗi throw hiển thị.

---

### Nhóm DATA-MOCK

#### `mock-scenario-emitter` — Nguồn mock deterministic
- **Refs:** `frontend/src/mocks/MockParkingDataSource.ts:44-49` `initialStatus`, `:55-95` snapshot, `:101-124` `start` cycles, `:134-160` `emitSpotStatus`, `:219-263` `queueScenario`/`stepScenario` · **Prereq:** `spot-ownership-map` · **Related:** `spot-event-reducer`
- **Vai trò:** `ParkingDataSource` in-browser: snapshot deterministic + chu kỳ event 2 cam độc lập + hàng đợi kịch bản dev.
- **Input → Output:** `getSnapshot() → Promise<ParkingSnapshot>`; `subscribe(listener) → unsubscribe`; `start/stop`.
- **Pseudocode:**
  1. `initialStatus(n)`: `n%7==0`→occupied, `n%11==0`→transitioning, `n%13==0`→unknown, ngược empty (`:44-49`).
  2. `BASE_TIME = 2026-07-25T08:00:00Z`; `nextTime` = BASE + tick giây — **không random** (`:244-247`).
  3. `start()`: left interval 60s cycle `[A01→transitioning, A01→occupied, A02→transitioning, A02→empty]`; right 75s cycle `[A08→transitioning, A08→empty, F01→occupied, F01→empty]` (`:102-124`).
  4. `emitSpotStatus`: `!cameraOwnsSpot` → reject log + false; `revision = tham số || current+1`; revision mới hơn → lưu; dispatch (`:134-160`).
  5. `queueScenario(id)` push actions; `stepScenario()` shift + thi hành (kể cả giả stale/unauthorized để test guard).
- **Cấu trúc dữ liệu:** `Map<SpotId,{revision,status}>`, scenario queue `string[]`, interval handles.
- **Độ phức tạp:** O(1) time & space/event; snapshot O(S) init; **state O(S)** revision map.
- **Edge case:** `start()` gọi 2 lần không nhân đôi timer (`:101` guard); `emitSpotStatus` camId mặc định `getSpotOwner` — muốn giả sai quyền phải truyền rõ; revision thấp vẫn dispatch (store quyết stale) — đúng vai trò test guard.
- **Demo `[đã chạy]`:** snapshot 60 ô → counts `{empty:43, occupied:8, transitioning:5, unknown:4}` (disjoint mod classes ≤60); `emitSpotStatus("A05","occupied")` → revision rev+1, applied.
- **Storyboard:** 2 cột interval cam; tick counter; nút step kịch bản; bảng revision/ô; reject log vùng đỏ.

---

## 3. Edge-case tổng hợp & bug vs mô phỏng

| Mục | Loại | Ghi chú cho demo |
|---|---|---|
| `findExitRoute` null 60/60 (sink) | **BUG thật** `[đã chạy]` | demo cả bản vá (sC05→aisle) |
| `routeFromPos` exit fallback dead code | hệ quả BUG | nhánh gạch đỏ |
| `updateGateNodesInGraph` không recompute `edge.distance` | điểm yếu thiết kế | so sánh immutable rebuild |
| `createWorldToSvg` fallback clamp vẽ sai im lặng | điểm yếu thiết kế (R2) | demo thêm cảnh báo transform-null |
| `isSpeaking` kẹt true khi không TTS | lỗi nhỏ | demo stub "no TTS" |
| `closestIndex` trễ → câu rẽ lặp | hành vi thật `[đã chạy]` | demo xe qua node cua |
| comment "Fallback cổng vào"/docs ">75px" lệch code | doc-drift | ngưỡng thật: default 75, App 80 |
| equal-revision-khác-nội-dung → reject | contract cứng | backend phải bảo đảm rev↔nội dung |
| `.at(-1)` kiosk giả định thứ tự waiting | giả định | builder-c xác nhận ordering |
| `onWheel` passive preventDefault | giả định chưa kiểm chứng | demo listener non-passive |
| `getSpotOwner` không validate spotId | hành vi thật | demo input "G11" |
| `source_mode:"replay"` bị validator chặn | dead path MonitorApp | toggle source_mode |

## 4. Kết quả mẫu mong đợi (chốt số, tất cả `[đã chạy]`)

- A* FIX-G1: `entrance→sC05` = **8.6**, path `entrance,ec,r7,r4,c4,sC05` — trace 7 pops (incl. c7 expand-thua).
- `findExitRoute("C05")` = **null** (BUG); vá `sC05=>c4` → `[sC05,c4,r4,r2,xc,exit]` = **6.6**.
- Tie-break FIX-G2: `s,a,t` (a thắng nodeOrder).
- Projection (6,4.5) → (6,4) trên `r4=>c4`, d=0.5; inbound **1.6**; exit **5.0**; one-way `ec=>r7` → 6.6 không quay đầu; (0,0) → null.
- Off-route (thr demo 1.0): (6,4.2)→false; (5,2)→true; (8.5,9)→false; route rỗng→false.
- Turn (ARRIVE 0.5, TURN_NEAR 2.5): (7,4.3)→"rẽ trái"; (8.9,9)→"rẽ phải"; (5.5,4)→đến đích; (7,8)→"rẽ phải" (closestIndex trễ).
- Voice: 7-event timeline → **4 SPEAK / 3 SKIP**.
- Affine FIX-A1 → `x:[2,0,100], y:[0,2,200]`; (50,25)→(200,250); singular→null.
- Canonical: `{5:7,7:9}`→9; `{5:7,7:5}`→null.
- Resolver: 11 case → `[guiding, occupied_by_other, conf_pending, delayed, conf_pending(D03), parked, invariant_err, no_target, id_pending/no_vid, id_pending/other_unconf, runtime_unavailable]`.
- Commit: `[set, idempotent, stale, stale, set, conflict, mismatch]`.
- Reducer: `[unauthorized, stale, applied, unknown-spot]`, counters `[2,1]`.
- QR FIX-QR1: t0→S3; +45s→S3; +95s→null; fallback createdAt+120s.
- Arrows: 600→`[100,290,480]`; 500→`[100,290]`; 120→[].
- Viewbox: zoom 0.5 center → `(300,225,600,450)`; pan dx−30 → x+60.
- Mock counts: `{43 empty, 8 occupied, 5 transitioning, 4 unknown}`.
- Gate: acc(5,5)→negative, (5,6); acc(5,−5)→positive, (5,−6).
- Reco FIX-RECO1: best=S2 (0.6576), alts=[S3(0.894),S1(0.918)].

## 5. Thuật toán dùng thư viện/đặc tả ngoài → mức giản lược demo

| Thuật toán | Phụ thuộc | Giản lược demo |
|---|---|---|
| `qr-visibility-window` | npm `qrcode` (`QRCode.toDataURL`) | stub `"QR:"+url`/canvas placeholder — KHÔNG claim port |
| `voice-speak-throttle`, `turn-instruction` | Web Speech `speechSynthesis` | stub utterance + `onend` deterministic 1.5s; logic throttle port nguyên |
| `driver-flow-machine`, `spot-event-reducer` | Zustand `create` | reducer thuần trên object — tương đương semantics |
| `session-*`, `runtime-request-coalesce` | `fetch`, `AbortController`, `AbortSignal.timeout/any` | fetch giả lập Promise deterministic; logic guard port nguyên |
| `qr-visibility-window` URL | `window.location` | base cố định `https://demo.local` |
| `action-id-gen` | `crypto.randomUUID/getRandomValues` | stub RNG bytes cố định |
| còn lại | không | port nguyên thuật toán |

Không thuật toán nào cần model ML hay network trong demo.

## 6. Đề xuất lesson (đủ phủ scope)

| Lesson | Bao phủ ID | Lý do gộp |
|---|---|---|
| L1 "Đồ thị làn đường" | `parking-geometry-gen`, `lane-graph-build`, `adjacency-directed-expand`, `spot-ownership-map` | cùng pipeline geometry→graph |
| L2 "A* từng bước" | `astar-find-route`, `route-edge-validator` | validator = thanh kiểm của cùng output |
| L3 "Re-route động & bug cổng ra" | `drivable-edge-project`, `pos-route-wrappers`, `spot-route-wrappers`, `gate-node-mutate` | cùng "route từ vị trí" + sink-bug |
| L4 "Gợi ý ô đỗ" | `spot-rank-score`, `recommendation-promote` | promote thao tác trên cùng bảng điểm |
| L5 "Sai tuyến & rẽ" | `point-segment-dist`, `off-route-detect`, `turn-instruction` | chia sẻ hình học + ngưỡng 75/80 |
| L6 "Giọng nói không spam" | `voice-speak-throttle` | độc lập nhỏ, UI timeline |
| L7 "Session: revision & reconcile" | `session-commit-guard`, `session-action-serialize`, `session-refresh-dedupe`, `action-id-gen`, `runtime-request-coalesce` | cùng mô hình "backend authoritative" |
| L8 "Quyết định đỗ xe" | `parking-decision-resolve`, `occupancy-classify`, `canonical-gid-chain`, `completion-key-build` | resolver tiêu thụ 3 helper |
| L9 "Dữ liệu tươi?" | `live-runtime-validator`, `frame-cursor-guard` | hai lớp freshness fail-closed |
| L10 "World→SVG" | `affine-fit-transform`, `world-svg-project`, `vehicle-svg-project` | pipeline fit→project→filter |
| L11 "Vẽ tuyến & điều hướng map" | `route-polyline-simplify`, `route-arrow-place`, `viewbox-pan-zoom` | cùng tầng render |
| L12 "Vòng đời phiên trên UI" | `driver-flow-machine`, `nav-goal-resolve`, `invalid-spot-recovery`, `parked-marker-fallback`, `qr-visibility-window`, `gate-line-derive`, `mock-scenario-emitter`, `parking-counts-derive` | các mảnh điều phối/consumer |

**12 lesson / 42 thuật toán.** Thứ tự gợi ý: L1→L2→L3→L11→L4→L5→L6→L10→L9→L7→L8→L12.

## 7. Checklist coverage theo file/symbol

| File (`frontend/src/…`) | Symbol | ID |
|---|---|---|
| `routing/routeEngine.ts` | `findRoute` | `astar-find-route` ✓ |
| | `buildAdjacency` | `adjacency-directed-expand` ✓ |
| | `findVehicleRoute`, `findExitRoute` | `spot-route-wrappers` ✓ |
| | `routeFromPos` | `drivable-edge-project` ✓ |
| | `findExitRouteFromPos`, `findInboundRouteFromPos` | `pos-route-wrappers` ✓ |
| | `routeUsesOnlyValidEdges` | `route-edge-validator` ✓ |
| `routing/laneGraph.ts` | `buildLaneGraph`, `updateGateNodesInGraph`, `LANE_GRAPH` | `lane-graph-build`, `gate-node-mutate` ✓ |
| `recommendation/recommendationEngine.ts` | `getEligibleSpots`, `rankParkingSpots`, `recommendParkingSpots`, `promoteRecommendation` | `spot-rank-score`, `recommendation-promote` ✓ |
| `routing/voiceGuidance.ts` | `VoiceManager`, `distanceToSegment`, `checkIsOffRoute`, `getNavigationInstruction` | `voice-speak-throttle`, `point-segment-dist`, `off-route-detect`, `turn-instruction` ✓ |
| `hooks/useVehicleSession.ts` | `commit`, `runAction`, `refresh`, `createSessionActionId`, poll effect | `session-commit-guard`, `session-action-serialize`, `session-refresh-dedupe`, `action-id-gen` ✓ |
| `domain/session.ts` | `buildSessionCompletionKey` | `completion-key-build` ✓ |
| `domain/sessionParking.ts` | `resolveSessionParking`, `collectOwnSpots`, `isConfirmedParked` | `parking-decision-resolve` ✓ |
| `domain/runtime.ts` | `canonicalRuntimeId`, `liveRuntimeError` | `canonical-gid-chain`, `live-runtime-validator` ✓ |
| `domain/parking.ts` | `getSpotOwner`, `cameraOwnsSpot`, `classifySpotOccupancy`, `isSelectableStatus`, `parseSpotId`, `formatSpotId` | `spot-ownership-map`, `occupancy-classify` ✓ (`isSelectableStatus` gộp trong rank/flow) |
| `stores/parkingStore.ts` | `applyEvent`, `applySnapshot`, `deriveParkingCounts`, `setTrackingSource` | `spot-event-reducer`, `parking-counts-derive` ✓ |
| `stores/driverFlowStore.ts` | all actions | `driver-flow-machine` ✓ |
| `api/backendApi.ts` | `parseResponse`, `postJson` timeout | contract — mô tả trong `session-*` (không thuật toán riêng) |
| `api/runtimeApi.ts` | `getRuntimeSnapshot`, `getRuntimeGateConfig` | `runtime-request-coalesce` ✓ (gates: pure REST) |
| `adapters/runtimeAdapter.ts` | `runtimeParkingSpots`, `runtimeCameraStates`, `runtimeVehicles` | mapping thuần — gộp `vehicle-svg-project`/L9 |
| `calibration/worldToSvg.ts` | `solve3`, `computeAffine`, `fitAffine`, `createWorldToSvg`, `createSvgToWorld`, `runtimeVehiclesOnSvg`, `polygonCenter` | `affine-fit-transform`, `world-svg-project`, `vehicle-svg-project` ✓ |
| `components/ParkingMap.tsx` | `simplifyRoutePoints`, `createRouteArrows`, `clampView`, `zoomAt`, handlers | `route-polyline-simplify`, `route-arrow-place`, `viewbox-pan-zoom` ✓ |
| `components/EntryQRKiosk.tsx` | `qrExpiryTime`, `isQrVisible`, effects | `qr-visibility-window` ✓ |
| `app/App.tsx` | `requireLiveRuntime`, decision effect, goal/route/guidance, `displayedVehicles`, handlers | `frame-cursor-guard`, `nav-goal-resolve`, `invalid-spot-recovery`, `parked-marker-fallback` ✓ |
| `app/MonitorApp.tsx` | `acceptedPointForGate`, `gateLineFromPoints` | `gate-line-derive` ✓ |
| `geometry/parkingGeometry.ts` | `generateParkingGeometry`, `spotY`, `getEntryPoint` | `parking-geometry-gen` ✓ |
| `mocks/MockParkingDataSource.ts` | class, `initialStatus`, `queueScenario`, `stepScenario` | `mock-scenario-emitter` ✓ |
| `domain/session.ts` types | `VehicleSessionState` | `driver-flow-machine`, `parking-decision-resolve` ✓ |

Không sót symbol có nội dung thuật toán; component UI thuần (sheet/toolbar/legend/header/panel) ghi nhận không tạo ID.

## 8. Phần chưa xác minh / giới hạn

- Chưa chạy `pnpm test/build` trong phiên này; expected values kiểm chứng bằng `verify-fixtures*.mjs` (port logic, không phải test sản phẩm).
- `.at(-1)` kiosk giả định backend trả waiting tăng dần — builder-c đối chiếu `session_manager`.
- `onWheel` passive-listener: giả định theo hành vi React — **chưa kiểm chứng browser thật**.
- `METERS_PER_MAP_UNIT=0.12` chưa đối chiếu calibration world.
- `position.reference` của `RuntimeVehicle` không được check trong `runtimeVehiclesOnSvg` `[giả định: mọi position là world]`.
- `position` demo trên điện thoại mục tiêu chưa kiểm chứng hiệu năng.
- `qrExpiresAt` format giả định ISO-8601 parse được bằng `Date.parse`.
- `zone→aisle` mapping ngoài 6 zone hiện có `[giả định]` — switch map tĩnh trong buildLaneGraph.
