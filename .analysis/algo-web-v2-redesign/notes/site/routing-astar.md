# routing-astar — notes (frontend read-only)

## Nguồn đã đọc
- `frontend/src/routing/laneGraph.ts` (185 dòng) — buildLaneGraph + updateGateNodesInGraph
- `frontend/src/routing/routeEngine.ts` (222 dòng) — findRoute (A*) + 4 wrapper + routeUsesOnlyValidEdges
- `frontend/src/app/App.tsx` (đoạn 435–475 auto-reroute, 710–770 route compute + off-route)
- `frontend/src/routing/voiceGuidance.ts` (đọc cho trang sau, checkIsOffRoute ở đây)
- `frontend/src/geometry/parkingGeometry.ts` (hằng số layout)

## laneGraph (laneGraph.ts)
- Node kinds: `entrance | exit | junction | lane | spot-entry | access-anchor` (L9-12)
- `allY` = sorted unique {connTopY, mọi spot-row centerY, connBottomY} (L74-78); junction trên 3 làn tại mọi y (L81-91)
- Right aisle = trục chính **one-way**: entrance → entrance-corner → right-y (desc, tức dưới→trên) → exit-corner → exit (L98-115)
- Left + center aisle: cạnh dọc **two-way** (L118-124)
- Cạnh ngang CHỈ ở connTopY + connBottomY: center↔left, center↔right, two-way (L128-131) — comment L127: "tránh đâm xuyên qua các ô đỗ"
- Spot-entry: zone E/F→left, C/D→center, A/B→right; cạnh aisleJunction→spot-entry **one-way** (L134-154)
- `updateGateNodesInGraph`: nút entrance/exit = **trung điểm** p1p2 của gate từ runtime (L165-183) → gate kéo theo nút đồ thị
- Geometry: LEFT_AISLE_X=210 w80 (center 250), CENTER_LANE_X=500 w80 (540), RIGHT_AISLE_X=800 w80 (840); CONNECTOR_TOP_Y=75, BOTTOM=775, H=30 → centerline 90/790; ROAD_END_X=1100; entrance(1100,790) exit(1100,90); MAP 1200×900; SPOT_HEIGHT=56, FIRST_SPOT_Y=112, gap 10 → spotY(n)=112+(10-n)*66

## routeEngine (routeEngine.ts)
- `buildAdjacency`: two-way edge push cả 2 chiều (L18-29)
- **A***: open=Set, g=distances, f=g+h; `heuristicScale = min over edges (edge.distance / euclid)` (L38-46) → h = euclid(node,target)*scale, **admissible** vì scale ≤ hệ số cost/đơn-vị thật của mọi cạnh
- Tie-break: f nhỏ nhất → g nhỏ → node **thứ tự khai báo** (nodeOrder L37, L61-75) → deterministic
- Dừng khi current===endNodeId; reconstruct qua `previous` (L96-118)
- `findVehicleRoute`: entrance→spotEntry (L121-124); `findExitRoute`: spotEntry→exit (L126-130)
- `routeFromPos` (dynamic start): chiếu xe lên mọi cạnh **lái được** — bỏ cạnh có đầu `access-anchor`/`spot-entry` (L136-138); projection t∈[0,1] (L142); nearest phải **≤60** (L147); tạo nút tạm `vehicle-pos` + cạnh tạm **one-way** về các đầu cạnh theo chiều hợp lệ (two-way→cả 2 đầu, one-way→chỉ đầu `to`) (L148-158) → không bao giờ vẽ connector xuyên ô hay đi ngược làn 1 chiều
- `findExitRouteFromPos`: routeFromPos→exit; fallback `findExitRoute(fallbackSpotId)` (L174-188)
- `findInboundRouteFromPos`: routeFromPos→spotEntry; KHÔNG fallback — comment L206 nói "Fallback: tính từ Cổng Vào" nhưng code `return null` (L204-207) → khác doc comment!
- `routeUsesOnlyValidEdges`: kiểm edge tồn tại + chiều hợp lệ (one-way đảo chiều → false) (L210-222)

## App wiring (App.tsx)
- Route recompute khi goalSpot/isExitMode đổi: exit→findExitRouteFromPos(xe) else findExitRoute(spot); inbound→findInboundRouteFromPos else findVehicleRoute (L717-726)
- Off-route mỗi tick: `checkIsOffRoute(pos, route.points, 80)` — App truyền **80** (L746-750), default hàm 75 (voiceGuidance.ts:98). CLAUDE.md viết 75 — giá trị thật tại call site là 80.
- Off-route → voice "Cảnh báo: đi sai tuyến" + navInstruction đỏ + auto re-route từ vị trí hiện tại nếu freshRoute (L761-768)
- **Auto-reroute khi ô đích bị chiếm**: lấy alternatives.best + alternatives (≤3, loại trùng target), POST selectSessionSpot từng cái; skip lỗi SPOT_RESERVED/SPOT_NOT_AVAILABLE; thành công → confirmSpot + notice "đã tự động chuyển tuyến … bằng A*" + voice 6s; hết phương án → showInvalidSpotWarning (L438-475). rerouteKey chống lặp (L442-444).

## Số liệu cho trang
- Ngưỡng projection: 60 (map unit); off-route App: 80 (default hàm 75)
- Heuristic: h = euclid × min(edge.dist/euclid)
- Đồ thị: 3 làn dọc (right one-way vào→ra; left/center two-way) + 2 connector ngang + cạnh spot-entry
- Lỗi doc/code: findInboundRouteFromPos comment hứa fallback, code trả null → nêu trong limits
