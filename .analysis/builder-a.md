# builder-a — Phân tích Frontend TechGar2

Ngày phân tích: 2026-10-04. Phạm vi giao: `frontend/` React+TypeScript — routing A* (`routeEngine`, `laneGraph`), render bản đồ, Zustand store, voice guidance, QR kiosk flow, luồng chọn slot/route/navigation, API polling/refresh/error.

---

## 1. Phạm vi & phương pháp

**Đã đọc toàn bộ** `frontend/src` (~25 file TS/TSX chính + 15 file test), `vite.config.ts`, `package.json`, `index.html`, `docs/*.md`, `artifacts/VALIDATION.md`, `docs/QR_VEHICLE_SESSION.md` (repo root), và một audit cũ tại `backend/main_detect/experiment_test/integration/report_frontend.md`.

**Phương pháp:**
- Đọc tĩnh toàn bộ code trong phạm vi; trích dẫn `đường dẫn:dòng` cho mọi kết luận.
- **Xác minh động bổ sung** cho phần routing: bundle `routeEngine.ts` + `laneGraph.ts` + `parkingGeometry.ts` bằng esbuild (dep sẵn có của vite, không cài thêm) rồi chạy node trực tiếp — script và kết quả ở mục Phụ lục. Đây là bằng chứng thực thi, không chỉ nhận định tĩnh.
- Không chạy dev server, không chạy test suite (ngoài script tự viết), không đụng backend/hardware. Kết luận về test suite lấy từ đọc file test + `artifacts/VALIDATION.md`, không phải từ lần chạy của tôi.

**Quy ước:** `[code]` = chắc chắn từ code; `[đã chạy]` = xác minh bằng script phụ lục; `[giả định]` = suy luận cần kiểm chứng; `[docs]` = theo tài liệu, có thể lệch code.

---

## 2. Kiến trúc & tech stack

Lấy từ `frontend/package.json` (`frontend/package.json:1-47`):

| Thành phần | Phiên bản |
|---|---|
| React / react-dom | ^19.0.0 |
| TypeScript | ~5.7.2, `strict: true`, `noUncheckedIndexedAccess` (`tsconfig.app.json`) |
| Vite | ^6.0.5, dev+preview port **4173** (`vite.config.ts:7,20`) |
| Zustand | ^5.0.2 (2 store) |
| Tailwind | ^3.4.17 (nhưng phần lớn style là CSS thuần `src/styles/index.css` 1340 dòng + `monitor.css` 454 dòng) |
| qrcode | ^1.5.4 (sinh QR phía client) |
| lucide-react | ^0.468.0 |
| Vitest + RTL + Playwright | ^3.2.4 / ^16.1.0 / ^1.50.0 |
| Package manager | pnpm 10.14.0 (`packageManager` field) |

**Ba entry trong một SPA**, định tuyến bằng URL thủ công — không dùng react-router (`src/main.tsx:17-24`):
- `/?session=<id>` hoặc `/` → `App` (trang tài xế / trang theo dõi phiên)
- `/kiosk/entry` → `KioskApp` → `EntryQRKiosk` (bảng QR cổng vào)
- `/monitor` → `MonitorApp` (giám sát 2 camera + cấu hình cổng)

**Hai chế độ nguồn dữ liệu** qua `parkingStore.trackingSource: "sample" | "opencv"` (`parkingStore.ts:22`):
- `sample`: `MockParkingDataSource` deterministic in-browser (`mocks/MockParkingDataSource.ts`).
- `opencv`: polling HTTP tới Runtime API (8001) + Session API (8000). Trang có `?session=` bị khóa vào `opencv` (`App.tsx:163-165`, `SmartParkingHeader.tsx:57`).

---

## 3. Module chính & luồng dữ liệu

### 3.1 Bản đồ & geometry
- `geometry/parkingGeometry.ts` — sinh geometry typed: canvas SVG **1200×900**, **60 ô = 6 zone (F,E,D,C,B,A) × 10 ô** (`parkingGeometry.ts:82-99`; `parking.ts:1,6`). Mỗi zone là **một cột dọc 10 ô** (không phải 2 hàng đối diện như spec cũ). 3 làn dọc (`aisles`): left x=250, center x=540, right x=840 (`parkingGeometry.ts:102-107,196-212`); 2 connector ngang y=90 và y=790 (`113-115,217-244`); entrance (1100,790), exit (1100,90) (`262-263`); 3 anchor nhu cầu (`264-268`).
- `components/ParkingMap.tsx` — render **SVG** (không phải Canvas như CLAUDE.md mô tả): viewBox pan/zoom thủ công bằng pointer events + pinch 2 ngón (`ParkingMap.tsx:141-208`), lớp hit-test riêng (`545-572`), route polyline + mũi tên (`82-123,391-405`), marker xe realtime (`417-493`).
- `calibration/worldToSvg.ts` — affine least-squares từ `slot_layout` world→SVG cần ≥3 slot khớp SpotId (`worldToSvg.ts:45-81`); fallback clamp vào biên map khi thiếu (`85-89`).

### 3.2 State (Zustand)
- `stores/parkingStore.ts` — trạng thái ô đỗ + camera health. `applySnapshot` thay toàn bộ (`71-80`); `applyEvent` enforce ownership camera (`103-109`) và revision monotone/spot (`110-113`).
- `stores/driverFlowStore.ts` — máy trạng thái UI: `entry|browse|recommendation|navigation` (`driverFlowStore.ts:12-32`).

### 3.3 Luồng dữ liệu live (session mode)
```
runtime_server :8001 ─GET /api/runtime/snapshot─► App.tsx poll 200ms
   ├─ liveRuntimeError() validate (schema=2, live, published_at ±5s, cam online+age≤5s)
   ├─ requireLiveRuntime(): frame_index monotone per runtime_id; >5s không frame mới → error
   ├─ runtimeParkingSpots() → applySnapshot() → parkingStore.spots
   └─ runtimeVehiclesOnSvg() → activeVehicles (project world→SVG)
gate_session_controller :8000 ─► useVehicleSession poll 500ms (session object)
                              ─► getNavigationReservations poll 500ms (reserved overlay)
                              ─► getRuntimeGateConfig poll 1000ms → updateGateNodesInGraph
```
Evidence: `App.tsx:239-411` (runtime poll 200ms tại `354-360`), `App.tsx:167-197` (reservations 500ms tại `191`), `App.tsx:363-404` (gate config 1000ms tại `404`), `useVehicleSession.ts:27,214`.

### 3.4 Luồng chọn ô → điều hướng (session mode)
1. `handleSpotClick` (`App.tsx:827-842`): ô `empty` → `inspectSpot` → `SpotDetailSheet` nút "Chỉ đường đến {id}" (`SpotDetailSheet.tsx:25-29`).
2. `handleConfirmSpot` (`App.tsx:789-825`): kiểm tra local `status==="empty"` → `POST /api/session/select` → `confirmSpot()` → `mode:"navigation"`.
3. Session `NAVIGATING_TO_SPOT` đồng bộ ngược từ backend (`App.tsx:607-615`).
4. Route effect (`App.tsx:703-732`): có vị trí xe → `findInboundRouteFromPos`, không có → `findVehicleRoute` từ entrance.
5. Guidance effect (`App.tsx:735-786`): mỗi lần `activeVehicles` đổi (≈200ms) → off-route check + voice + re-route.
6. Kết thúc: `resolveSessionParking` → `PARKED` → completion key + success popup 5s (`App.tsx:634-674`); hoặc `startExit` → `EXIT_NAVIGATION` (`App.tsx:868-881`).
7. Mất ô đích: `target_occupied_by_other` → auto-reroute commit lần lượt tối đa 3 phương án A*-ranked (`App.tsx:421-475`); thất bại → `InvalidSpotWarningSheet` (`InvalidSpotWarningSheet.tsx`).

---

## 4. Xác minh thuật toán routing

`routing/routeEngine.ts` + `routing/laneGraph.ts`.

### 4.1 Lane graph — `[code]` + `[đã chạy]`
- `buildLaneGraph` (`laneGraph.ts:30-163`): junction trên 3 làn tại mọi Y của tâm ô + 2 connector; right aisle là **chuỗi one-way** entrance→corner→các junction Y giảm dần→exit (`104-115`); left+center aisle **two-way** (`118-124`); connector ngang two-way (`128-131`); cạnh vào ô `aisle→spot-entry` **one-way** (`152-154`); edge distance = euclid (`43-54`). `access-anchor` node được tạo nhưng **không nối cạnh nào** (`157-160`) — chỉ dùng cho recommendation.
- `[đã chạy]` 103 nodes / 101 edges; **60/60 spot-entry node là sink** (out-degree 0).
- Quan hệ zone↔làn: F,E→left; D,C→center; B,A→right (`laneGraph.ts:143-150`; `parkingGeometry.ts:124-136`).

### 4.2 A* — `[code]`
- `findRoute` (`routeEngine.ts:31-119`) là **A* đúng chuẩn**: g-score `distances`, f = g+h `estimates`, prev-pointer rebuild.
- Heuristic = euclid(node→đích) × `min over edges (edge.distance / euclid)` (`38-50`) — admissible vì scale ≤ chi phí thực/đơn vị. Vì mọi edge đều euclid → scale = 1.0 → h = euclid → **admissible & consistent** `[code]+[đã chạy]`.
- Open set là `Set` quét tuyến tính O(V) mỗi vòng (`57-75`) — không có heap; ở ~103 node không đáng kể, nhưng là O(V²) tổng thể.
- Tie-break deterministic: (f, g, index khai báo node) (`64-69`).
- `routeUsesOnlyValidEdges` kiểm chứng tuyến chỉ đi trên cạnh đúng chiều (`210-222`).

### 4.3 Route động từ vị trí xe — `[code]`
- `routeFromPos` (`routeEngine.ts:132-167`): chiếu vị trí xe lên **cạnh gần nhất trong tập "drivable"** (loại cạnh chạm `access-anchor`/`spot-entry`), ngưỡng **60 đơn vị map** (`147`); tạo node tạm `vehicle-pos` + cạnh one-way tới đầu-cuối hợp lệ theo chiều cạnh (one-way → chỉ tới `b`; two-way → cả hai) (`151-158`). Không vẽ đường xuyên ô đỗ, không đảo chiều làn.
- `findInboundRouteFromPos` (`194-208`): fallback `null` khi xe xa mọi làn — **comment dòng 206 nói "Fallback: tính từ Cổng Vào" nhưng code trả null** (comment lệch code).
- `findExitRouteFromPos` (`174-188`): fallback `findExitRoute(graph, fallbackSpotId)`.

### 4.4 ⚠️ BUG đã xác minh bằng thực thi — `findExitRoute` luôn trả `null`
- Spot-entry node chỉ có cạnh **vào** (one-way `aisle→spot-entry`, `laneGraph.ts:153`) → là sink; `findRoute` từ sink không đi đâu được (`routeEngine.ts:126-130`).
- `[đã chạy]` `findExitRoute` trả `null` cho **cả 60 ô**; `findExitRouteFromPos(30,20,fallback="A01")` → `null` vì fallback chết theo.
- **Hệ quả trong app**: `App.tsx:721` gọi `findExitRoute(LANE_GRAPH, goalSpot)` khi `isExitMode && !targetVehicle` — tức khi mất vị trí xe (unobserved/dropped khỏi `activeVehicles`), tuyến ra cổng **không được vẽ**. Fallback `fallbackSpotId` của `findExitRouteFromPos` (`routeEngine.ts:184-186`) là dead code về mặt chức năng.
- `routing.test.ts` chỉ test `findVehicleRoute` (`src/tests/routing.test.ts:6-62`) → bug này không bị test bắt.

### 4.5 ⚠️ `updateGateNodesInGraph` mutate node nhưng không cập nhật edge
- `laneGraph.ts:165-183` ghi đè `x,y` của node `entrance`/`exit` trên singleton `LANE_GRAPH` (`185`) mỗi 1s (`App.tsx:404`). `edge.distance` đã precompute → **không được tính lại** → khoảng cách route + heuristic lệch so với geometry thực tế; endpoint vẽ đổi nhưng trọng số đồ thị cũ. Tác động nhỏ khi cổng dịch ít, nhưng là mutation trạng thái module chia sẻ (rủi ro nhiễm giữa test/session).

### 4.6 Recommendation — `[code]`
- `recommendationEngine.ts`: pure function; eligible = chỉ `status==="empty"` (`32-34`); driving = `findVehicleRoute`/`findInboundRouteFromPos` distance (`48-51`); score = `0.35×driving + 0.65×walking` (`59`); walking = euclid tới anchor × `METERS_PER_MAP_UNIT=0.12` (`16,54-58`); top-3, tie-break theo spotId (`72,75-89`). `[giả định]` hệ số 0.12 m/map-unit chưa hiệu chỉnh với tọa độ world thật.

---

## 5. Session state & xử lý stale data — phần chặt chẽ nhất của codebase

### 5.1 `useVehicleSession` (`hooks/useVehicleSession.ts`)
- Poll `GET /api/session/{id}` mỗi **500ms** (`27,214`), timeout 2s qua AbortController (`111-114`), dedupe in-flight GET (`107,140`).
- `commit()` (`52-93`) — rào chắn đầy đủ: sai lifecycle/sessionId → reject; GET không được ghi đè khi đang có action POST (`60-62`); `runtimeId` đổi → warn+reject (`64-67`); **revision lùi → stale_revision** (`68-70`); **revision bằng nhưng nội dung khác → warn+reject** (`71-82`); POST response là authoritative.
- `runAction` (`144-190`): khóa action đơn lẻ; gửi `expected_revision` + `action_id` (`157-160`); POST xong bị stale → reconcile bằng GET (`162-165`); transport error → drop lock + refresh trước khi cho tương tác tiếp (`167-177`); `SESSION_NOT_FOUND` → `markDeleted` → `ended` UI (`95-101`).
- Đây là mô hình "backend authoritative, frontend reconcile" — đúng chuẩn cho QR multi-client.

### 5.2 Runtime freshness (`App.tsx:272-287`, `domain/runtime.ts:116-141`)
- `liveRuntimeError`: `schema_version===2` bắt buộc; `source_mode==="live"`; `published_at` trong cửa sổ (−1s,+5s) so với clock client; mọi camera `online && 0≤age_ms≤5000`.
- Cursor `runtime_id + frame_index` monotone (`App.tsx:276-284`); không có frame mới >5s → `"Camera không có frame mới trong 5 giây"` (`283-285,355-358`).
- Khi runtime lỗi: **toàn bộ ô chuyển `unknown`** + camera offline + routePaused (`App.tsx:309-349,1206`) — fail-safe đúng hướng.
- Snapshot GET dedupe + cache lỗi 2s (`runtimeApi.ts:21-36`) — poll 200ms không gây bão request khi backend sập.

### 5.3 Spot state
- `runtimeAdapter.ts:27-49`: runtime chỉ có `empty|occupied` → slot thiếu trong snapshot → `unknown`; `revision = frame_index` (toàn cục, khác semantics per-spot của mock); `confidence` hardcode 0.99/0 (`40`); `owner` theo `camera_id` của runtime, fallback `getSpotOwner` (`31`).
- `parkingStore.applyEvent` (mock path): reject sai ownership + revision cũ, đếm `rejectedEvents`/`staleEvents` (`parkingStore.ts:98-113`).
- `setTrackingSource("opencv")` reset mọi ô về `unknown` (`56-70`) — tránh hiển thị dữ liệu mock cũ khi chuyển sang camera thật.
- Reserved overlay: `navigationReservations` (poll 500ms) gắn `status:"reserved"` lên ô đang `empty` — không đổi trạng thái gốc (`App.tsx:97-109`); fetch lỗi giữ overlay cũ (comment chủ đích `184-186`).

### 5.4 Quyết định đỗ xe — `domain/sessionParking.ts`
- `resolveSessionParking` (`27-112`) là pure resolver 9 nhánh: `guiding`, `identity_pending` (no_vehicle_id | other_unconfirmed), `parking_confirmation_pending`, `parking_processing_delayed` (pipeline degraded | age≥5s | insufficient_evidence, `63-72`), `parked` (cần completion key), `target_occupied_by_other` (xe khác `tracking_state==="parked" && stopped_for_ms≥2000` hoặc episode parked, `101-109`), `runtime_unavailable`, `exit_navigation`, `identity_invariant_error` (cùng gid ở >1 ô, `44-54`).
- `canonicalRuntimeId` theo dây chuyền `retired_global_ids`; vòng lặp/giá trị xấu → null → `identity_invariant_error` (`domain/runtime.ts:191-202`; `App.tsx:122-143`).

---

## 6. QR kiosk — `components/EntryQRKiosk.tsx`

- Poll `GET /api/sessions/waiting` mỗi **250ms** (`7,48`), chọn session cuối cùng còn hiệu lực `.at(-1)` — giả định backend trả theo thứ tự thời gian (`38`).
- Hiển thị QR tới `qrExpiresAt` (parse ISO), fallback `createdAt + 120s` (`9-17`). TTL **120s nhất quán hai phía**: FE `QR_DISPLAY_MS = 120_000` (`6`) khớp backend `QR_DISPLAY_SECONDS = 120` (`backend/session_manager.py:29`, theo builder-c). Chỉ **docs `QR_VEHICLE_SESSION.md:7` còn ghi 10 giây là sai**.
- QR sinh local bằng lib `qrcode` trỏ `/?session=<id>` (`22-26,70-78`); timer ẩn QR hết hạn (`56-68`).
- `?session=ALL` trong CLAUDE.md:103 **không còn tồn tại** — `App` sẽ poll `/api/session/ALL` → 404 → "Phiên xe đã kết thúc". Flow hiện tại là `/kiosk/entry` (`main.tsx:19-20`).

---

## 7. Voice guidance & off-route — `routing/voiceGuidance.ts`

- `VoiceManager` singleton (`3-70`): dedupe cùng câu trong cooldown (mặc định 6s), urgent được ưu tiên cắt câu cũ (`34-47`); `SpeechSynthesisUtterance` `lang="vi-VN"`, rate 0.95 (`53-62`).
- `checkIsOffRoute`: min distance điểm-đoạn tới mọi segment > ngưỡng (`95-111`). Mặc định tham số 75 nhưng **App truyền 80** (`App.tsx:749`); CLAUDE.md ghi >75px — lệch nhỏ.
- `getNavigationInstruction` (`118-231`): đến đích <35 đv → câu kết thúc (`127-139`); tìm node route gần xe nhất → so sánh vector trước/sau; cos>0.93 (~21°) → "đi thẳng"; cross product xác định trái/phải trong hệ Y-down (`156-190`); fallback quét khúc cua đầu tiên, >150 đv → báo thẳng (`194-228`).
- Đi sai tuyến: voice urgent "đi sai tuyến" 7s + banner đỏ + **tự động re-route** (`App.tsx:761-768`).
- ⚠️ `isSpeaking` set `true` trước khi check `speechSynthesis` tồn tại → trên môi trường không có Web Speech API, flag kẹt `true` (nhẹ: chỉ chặn câu mới trong 2s đầu) (`voiceGuidance.ts:51-66`).
- Comment `App.tsx:734` ghi "(300ms)" nhưng effect chạy theo nhịp `activeVehicles` ~200ms.

---

## 8. Contract frontend cần từ backend (cho builder-c đối chiếu)

### 8.1 Session API — `VITE_BACKEND_URL` (dev proxy → 127.0.0.1:8000, `vite.config.ts:13-16`; `backendApi.ts:3`)
| Endpoint | Frontend gửi | Frontend kỳ vọng |
|---|---|---|
| `GET /api/session/{id}` | — | `VehicleSession`; lỗi `{error:string, code?:string}`; `404 + code==="SESSION_NOT_FOUND"` → kết thúc phiên (`backendApi.ts:19-28,45-48`) |
| `GET /api/sessions/waiting` | — | `VehicleSession[]` (frontend lấy `.at(-1)`, giả định thứ tự tăng dần) (`backendApi.ts:50-52`; `EntryQRKiosk.tsx:38`) |
| `GET /api/sessions/reservations?sessionId={id}` | query `sessionId` | `[{spotId, reservedAt:string\|null, revision:number}]` (`backendApi.ts:56-68`) |
| `POST /api/session/claim` | `{sessionId, expected_revision?, action_id?}` | `VehicleSession` đã update (`backendApi.ts:70-72`) |
| `POST /api/session/select` | `{sessionId, spotId:string\|null, expected_revision?, action_id?}` | `VehicleSession`; conflict `code ∈ {"SPOT_RESERVED","SPOT_NOT_AVAILABLE"}` để auto-reroute/warning (`backendApi.ts:74-76`; `App.tsx:458-463,800-818`) |
| `POST /api/session/exit` | giống claim | `VehicleSession` (`backendApi.ts:78-80`) |

**Ràng buộc phía backend phải giữ:**
- `revision` monotone tăng; cùng revision phải cùng nội dung (frontend reject nếu khác, `useVehicleSession.ts:71-82`).
- `expected_revision` → 409/conflict khi stale; `action_id` → idempotent POST retry.
- `VehicleSession` fields (`domain/session.ts:9-30`): `sessionId`, `state ∈ {WAITING_FOR_SCAN, SELECTING_SPOT, NAVIGATING_TO_SPOT, PARKED, RELOCATING, EXIT_NAVIGATION}`, `globalVehicleId:number`, `runtimeId?`, `vehicleTrackId`, `activeTrackId`, `targetSpotId`, `parkedSpotId`, `actualParkedSpotId?`, `parkingEpisodeId?`, `claimed:boolean`, `lastKnownPosition{x,y}|null`, `createdAt/updatedAt` ISO, `revision:number`, `qrExpiresAt` ISO, `claimedAt`, `spotSelectedAt`, `parkedAt`, `exitStartedAt`.
- Điều kiện `parked` phía frontend cần **`state==="PARKED" && parkedSpotId && parkedAt`** (`domain/session.ts:32-36`) — backend phải set đủ bộ ba.
- `runtimeId` trong session phải khớp `runtime_id` snapshot hiện tại, nếu không frontend từ chối dẫn đường (`App.tsx:129-131`).
- `globalVehicleId` phải khớp `vehicles[].global_id` của runtime **sau** khi canonicalize qua `retired_global_ids` (`App.tsx:122-123`).

### 8.2 Runtime API — `VITE_RUNTIME_URL` (dev proxy → 127.0.0.1:8001, `vite.config.ts:9-12`)
| Endpoint | Ghi chú |
|---|---|
| `GET /api/runtime/snapshot` | `RuntimeSnapshot` — contract cứng ở `liveRuntimeError` (`domain/runtime.ts:60-82,116-141`): `schema_version===2`, `source_mode==="live"`, `published_at` ISO trong ±5s, `frame_index` tăng theo `runtime_id`, `cameras.camN.{online,age_ms≤5000}` |
| `GET /api/runtime/gates` | `RuntimeGateConfig{schema_version,coordinate_space:"world",unit,entry_gate{name,p1,p2,direction},exit_gate}`; `404` = chưa cấu hình (`runtimeApi.ts:42-55`) |
| `POST /api/runtime/gates` | lưu config; monitor gửi `schema_version:1`, `unit` lấy từ `snapshot.coordinate_space.unit` (`MonitorApp.tsx:245-256`) — backend nên validate unit |
| `GET /api/runtime/cameras/{cam1\|cam2}.mjpg` | MJPEG stream cho monitor (`runtimeApi.ts:38-40`; `MonitorApp.tsx:86`) |

**Cấu trúc snapshot frontend đọc** (`domain/runtime.ts`): `parking_slots[]{slot_id(=SpotId "A01".."F10"),camera_id,status:"empty"|"occupied",occupied,vehicle_id,decision_source,tracking_state,stopped_for_ms}` — slot thiếu → `unknown`, `status` chỉ 2 giá trị (reserved/transitioning không đến từ runtime); `slot_layout[]{slot_id,camera_id,polygon:[[x,y]..]}` tọa độ **world**, cần **≥3 slot khớp SpotId frontend** để affine (`worldToSvg.ts:53-63`); `vehicles[]{global_id,state,observed,camera_ids,position{x,y,reference},parked_slot_id}`; `retired_global_ids:{string→number}` dây chuyền **phải phi chu kỳ** (`runtime.ts:191-202`); `parking_episodes[]{parking_episode_id,global_id,slot_id,state:pending|parked|departing|released,applied_frame_idx,...}`; `pending_parking_confirmations[]{global_id,slot_id,state:collecting|awaiting_vision|insufficient_evidence,max_overlap,age_ms}`; `parking_pipeline{camN:{state:waiting|processing|healthy|degraded,...}}`; `recent_events[]`; `camera_skew_ms`; `coordinate_space{unit,bounds}`.

**Tần suất frontend gọi** (để builder-c đánh giá tải): session 500ms, reservations 500ms, snapshot 200ms (dedupe), gates 1000ms, kiosk waiting 250ms.

---

## 9. Điểm mạnh

1. **Session sync viết rất cẩn thận**: revision guard, GET-vs-POST ordering, action lock, reconcile-sau-lỗi (`useVehicleSession.ts`) — mức production-grade hiếm gặp ở đồ án.
2. **Fail-safe nhất quán**: runtime lỗi → mọi ô `unknown` + pause route (`App.tsx:309-349`); invariant "1 gid = 1 ô" được enforce (`sessionParking.ts:44-54`); runtimeId mismatch → từ chối dẫn đường.
3. **A* đúng + heuristic admissible**; route chỉ trên cạnh đồ thị, có test validity (`routing.test.ts`) — `[đã chạy]` 60/60 ô inbound đều có tuyến hợp lệ.
4. **Tách domain/UI/data source** theo interface `ParkingDataSource` (`parking.ts:68-73`); mock deterministic không `Math.random()` (`MockParkingDataSource.ts:17,44-49`).
5. **Resolver đỗ xe** xử lý đủ các trạng thái biên (pending evidence, pipeline degraded, parked-elsewhere) thay vì nhìn slot đơn giản (`sessionParking.ts`).
6. Accessibility: focus trap sheet (`useFocusTrap`), aria-label/status đầy đủ, hit-layer riêng (`ParkingMap.tsx:545-572`).
7. Dedupe request + retry-backoff nhẹ ở runtime layer (`runtimeApi.ts:21-36`); monitor có exponential backoff (`MonitorApp.tsx:106-143`).

## 10. Điểm yếu & rủi ro (ưu tiên × tác động)

| # | Mức | Rủi ro | Bằng chứng | Tác động |
|---|---|---|---|---|
| R1 | **Cao** | `findExitRoute` luôn `null` — spot-entry là sink 60/60 | `laneGraph.ts:152-154`; `[đã chạy]` | Khi mất vị trí xe lúc `EXIT_NAVIGATION`/`PARKED`, không vẽ được tuyến ra cổng; fallback param dead code (`App.tsx:721`, `routeEngine.ts:184-186`) |
| R2 | **Cao** | Projection fallback khi `<3` slot_layout: clamp world→biên SVG → xe vẽ sai vị trí **mà không báo lỗi** | `worldToSvg.ts:85-89`; `App.tsx:303` | Marker xe/voice guidance/routeFromPos có thể sai hoàn toàn khi calibration thiếu — `liveRuntimeError` không check slot_layout |
| R3 | **Trung** | `updateGateNodesInGraph` mutate singleton nhưng edge.distance cũ | `laneGraph.ts:165-183`; `App.tsx:404` | Route distance/heuristic lệch khi cổng được hiệu chỉnh; shared-state mutation mỗi giây |
| R4 | **Thấp** | QR TTL: docs ghi 10s nhưng FE+BE đều 120s — **chỉ là docs lệch**, FE/BE nhất quán | `EntryQRKiosk.tsx:6`, `backend/session_manager.py:29` (theo builder-c) vs `docs/QR_VEHICLE_SESSION.md:7` | Tài liệu gây hiểu nhầm về cửa sổ quét QR; không phải mismatch hệ thống |
| R5 | **Trung** | `MonitorApp` reject `source_mode:"replay"` qua `liveRuntimeError` nhưng UI có nhãn "Replay đồng bộ" | `MonitorApp.tsx:123,276`; `runtime.ts:123-125` | Không giám sát được khi replay video test — nhãn replay là dead path |
| R6 | **Trung** | POST timeout cứng 2s (`AbortSignal.timeout(2000)`) | `backendApi.ts:40` | Trên LAN chậm, claim/select/exit dễ báo lỗi rồi phải reconcile; UX tài xế |
| R7 | **Thấp** | `[giả định — cần kiểm chứng trình duyệt]` `onWheel` + `preventDefault` trong React 19: nếu React đăng ký wheel passive ở root thì preventDefault vô hiệu, trang vẫn scroll khi zoom map | `ParkingMap.tsx:203-208` | UX zoom trên desktop/mobile — hành vi passive-listener chưa được kiểm chứng trên trình duyệt thật và chưa có nguồn chắc trong repo |
| R8 | **Thấp** | `isSpeaking` kẹt `true` khi không có speechSynthesis | `voiceGuidance.ts:49-66` | Chặn câu mới ≤2s — gần như vô hại |
| R9 | **Thấp** | Churn 200ms: `applySnapshot` tạo object mới toàn bộ ô + recommendation recompute ≤60 lần A* mỗi poll khi ở mode recommendation | `parkingStore.ts:71-80`; `App.tsx:413-419` | Lãng phí CPU/re-render trên điện thoại yếu; chưa đo được |
| R10 | **Thấp** | Reservations fetch lỗi → giữ overlay cũ vô hạn | `App.tsx:183-186` | Ô hiển thị "reserved" có thể đã hết hạn — được ghi chú là chủ đích nhưng không có expiry |
| R11 | **Thấp** | Tài liệu lệch code: AGENTS.md 160 ô/2 hàng; VALIDATION.md 48 ô; code 60 ô/1 cột; CLAUDE.md `?session=ALL`, "Canvas" (thực tế SVG), ">75px" (code 80) | `parking.ts:1,6`; `parkingGeometry.ts`; `report_frontend.md` §5 | Người mới đọc spec sai kiến trúc |
| R12 | **Thấp** | Asset chết: `public/vehicle_positions_sample.json`, `parking_status_sample.json` không được fetch; comment "(300ms)" & "Fallback từ Cổng Vào" sai | grep 0 match; `App.tsx:393,734`; `routeEngine.ts:206` | Nhiễu repo |
| R13 | **Thấp** | `METERS_PER_MAP_UNIT=0.12` chưa hiệu chỉnh với đơn vị world thật | `recommendationEngine.ts:16` | "phút đi bộ"/"mét" có thể sai tỉ lệ |
| R14 | **Info** | A* open-set O(V) mỗi pop | `routeEngine.ts:52-75` | OK ở 103 node; sẽ đau nếu graph lớn hơn vài nghìn node |
| R15 | **Info** | `heuristic()` deref `nodeById.get()!` — crash nếu graph truyền vào có edge tới node không tồn tại | `routeEngine.ts:48` | Đã được audit cũ ghi nhận (report_frontend §6.2); không reachable từ `buildLaneGraph` |

## 11. Đề xuất cải tiến cụ thể

1. **Sửa R1** — thêm cạnh one-way `spot-entry→aisle` (chiều ra) trong `buildLaneGraph` (`laneGraph.ts:152-154`), hoặc cho `findExitRoute` bắt đầu từ aisle-junction của ô thay vì spot-entry node; thêm test `findExitRoute` cho cả 60 ô vào `routing.test.ts`.
2. **Sửa R2** — khi `slot_layout` <3 anchors hoặc affine null: ẩn marker xe + set `runtime_unavailable`/warning thay vì clamp (`worldToSvg.ts:85-89`); đồng thời đưa `slot_layout.length>=3` vào `liveRuntimeError` hoặc cảnh báo riêng.
3. **Sửa R3** — recompute `edge.distance` cho mọi cạnh chạm entrance/exit sau khi move node trong `updateGateNodesInGraph`; lý tưởng hơn: rebuild graph immutable rồi `useMemo`/`useRef` thay vì mutate singleton.
4. **Sửa R4** — chỉ cần sửa docs `QR_VEHICLE_SESSION.md:7` (10 giây → 120 giây); FE/BE đã nhất quán 120s.
5. **Sửa R5** — cho `liveRuntimeError` chấp nhận `source_mode:"replay"` ở MonitorApp (tham số), giữ strict "live" cho trang tài xế.
6. **Sửa R6** — tăng timeout POST lên ~5s và/hoặc retry idempotent bằng `action_id` (đã gửi sẵn).
7. **Sửa R7** — gắn `wheel` listener non-passive qua ref (`svg.addEventListener("wheel", h, {passive:false})`) thay `onWheel`.
8. **Churn (R9)** — memoize `runtimeParkingSpots` theo `frame_index` (bỏ qua frame trùng); chỉ recompute recommendation khi tập ô `empty` thay đổi (hash spotId+status).
9. **Docs (R11-R13)** — cập nhật AGENTS.md/CLAUDE.md/VALIDATION.md: 60 ô 1 cột, `/kiosk/entry`, SVG, ngưỡng 80; xóa 2 JSON chết hoặc wire lại file-mode nếu còn dùng; hiệu chỉnh `METERS_PER_MAP_UNIT` theo calibration world.
10. **Nhỏ** — sửa 2 comment sai (`routeEngine.ts:206`, `App.tsx:734`); set `isSpeaking=false` khi không có speechSynthesis (`voiceGuidance.ts:51`); expiry cho reservations overlay (R10).

## 12. Giới hạn & phần chưa xác minh

- **Chưa chạy** `pnpm test/lint/build/playwright` — kết quả test trong `artifacts/VALIDATION.md` (70 unit + 10 e2e PASS, 2026-09-08) là của lần chạy trước; e2e `real-session-api.spec.ts` cần `TECHGAR_TEST_PYTHON` (đã có audit ghi default path sai).
- Không verify được: hành vi `onWheel` passive trên trình duyệt thật; timing thực của voice/poll trên điện thoại; độ chính xác affine world→SVG với calibration thật; contract backend chỉ suy ra từ phía client (builder-c đối chiếu server code).
- `MockParkingDataSource`, `MapControls`, `BrowseToolbar`, `SummaryCards`, `ParkingLegend`, `AlternativeSpotList`, `DestinationNeedSelector`, `MockControlPanel`, `useFocusTrap` — đã đọc lướt/quan trọng phần đã đọc kỹ; các component thuần trình bày không phân tích sâu.
- MonitorApp chỉ trong phạm vi contract/gate-config; không audit đầy đủ trang monitor.

## Phụ lục — bằng chứng thực thi routing

**Môi trường chạy:** Windows, Git Bash, `node v24.18.0`; cwd khi chạy: `D:\TechGar2\.analysis`. Không cài thêm dependency — dùng esbuild `0.25.12` đã có sẵn trong `frontend/node_modules` (transitive dep của vite).

**Các lệnh đã chạy (theo đúng thứ tự):**

```bash
# 1) Tạo script .analysis/check-routing.mjs — nội dung:
#    a. ghi .analysis/check-entry.ts re-export từ ../frontend/src/routing/routeEngine.ts,
#       ../frontend/src/routing/laneGraph.ts, ../frontend/src/geometry/parkingGeometry.ts
#    b. esbuild buildSync: entryPoints=[check-entry.ts], bundle, format esm,
#       outfile=.analysis/check-routing.bundle.mjs
#    c. dynamic-import bundle rồi gọi findVehicleRoute/findExitRoute/
#       findExitRouteFromPos/findInboundRouteFromPos cho toàn bộ spot + đếm sink node
#    (esbuild import từ:
#     ../frontend/node_modules/.pnpm/esbuild@0.25.12/node_modules/esbuild/lib/main.js)
cd /d/TechGar2/.analysis        # tương đương D:\TechGar2\.analysis
node check-routing.mjs          # ghi bundle + chạy kiểm tra, in kết quả dưới
```

**Output đầy đủ:**

```
nodes: 103 edges: 101
spots: 60
findVehicleRoute ok: 60 null: none
findExitRoute ok: 0 null count: 60 (F01..F08...)
findExitRouteFromPos(840,450): route 9 nodes, dist=620.0
findInboundRouteFromPos(840,450,C05): route 15 nodes, dist=1092.0
findExitRouteFromPos(30,20,fallback A01): null
spot-entry sink nodes: 60 / 60
```

→ Kết luận tại mục 4.4 (rủi ro R1) là **đã xác minh bằng thực thi**, không phải suy đoán tĩnh.
