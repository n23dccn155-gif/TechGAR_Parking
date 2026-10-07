# notes/routing-astar.md — Step A bảng nguồn (backfill builder-c, 2026-10-06)

Files đọc: `frontend/src/routing/routeEngine.ts`, `routing/laneGraph.ts`,
`routing/voiceGuidance.ts`, `geometry/parkingGeometry.ts`, `app/App.tsx`.
Chi tiết trong `js/pages/routing-astar.js` ⑦.

## giá trị → file:dòng → kind
| giá trị | nguồn | kind |
|---|---|---|
| 3 làn dọc: right 1 chiều; left+center 2 chiều | laneGraph.ts:104-124 | runtime |
| cạnh ngang chỉ ở connector-top + connector-bottom | laneGraph.ts:128-131 | runtime |
| map zone→làn: E,F trái; C,D giữa; A,B phải | laneGraph.ts:143-150 | runtime |
| entrance/exit node = trung điểm p1p2 của gate | laneGraph.ts:172-182 | runtime |
| f(n)=g(n)+h(n); h = euclid×min(cạnh.dist/euclid) | routeEngine.ts:38-50,83-89 | runtime (hiển thị minh họa) |
| tie-break: f, rồi g, rồi thứ tự khai báo | routeEngine.ts:61-75 | runtime |
| ngưỡng projection ≤60 đơn vị bản đồ | routeEngine.ts:147 | runtime |
| loại cạnh khi chiếu: access-anchor / spot-entry | routeEngine.ts:136-138 | runtime |
| fallback exit: findExitRoute(fallbackSpotId) | routeEngine.ts:183-187 | runtime |
| fallback inbound: không có — trả null | routeEngine.ts:204-207 | runtime |
| ngưỡng off-route tại App 80 (override default 75) | App.tsx:746-750 + voiceGuidance.ts:98 | runtime |
| ứng viên đổi ô tối đa 3, POST tuần tự | App.tsx:438-449 | runtime |
| lỗi bỏ qua: SPOT_RESERVED, SPOT_NOT_AVAILABLE | App.tsx:458-463 | runtime |
| tâm 3 làn dọc 250/540/840 (map 1200×900) | parkingGeometry.ts:102-157 | class-default |
| centerline connector y=90/790 | parkingGeometry.ts:113-115 | class-default |
