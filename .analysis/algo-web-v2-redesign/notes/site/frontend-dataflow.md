# Notes — frontend-dataflow (Step A, đọc source trước khi viết trang)

## Nguồn (frontend — chỉ đọc, KHÔNG sửa)
- `frontend/src/api/runtimeApi.ts` (68 dòng)
- `frontend/src/api/backendApi.ts` (80 dòng)
- `frontend/src/adapters/runtimeAdapter.ts` (77 dòng)
- `frontend/src/domain/runtime.ts` (202 dòng)
- `frontend/src/domain/sessionParking.ts` (139 dòng)
- `frontend/src/stores/parkingStore.ts` (141 dòng)
- `frontend/src/stores/driverFlowStore.ts` (93 dòng)
- `frontend/src/hooks/useVehicleSession.ts` (232 dòng)
- `frontend/src/app/App.tsx` (1301 dòng, đọc phần polling/claim)
- `frontend/src/calibration/worldToSvg.ts` (133 dòng)

## Hai nguồn dữ liệu, một store
- `trackingSource: "sample" | "opencv"` trong parkingStore (parkingStore.ts:22); sessionId có sẵn → ép "opencv" (App.tsx:163-165); chuyển sang opencv thì mọi ô reset unknown+confidence 0 (parkingStore.ts:56-70)
- Sample mode: mockParkingDataSource subscribe → applyEvent per event (App.tsx:209-217)
- Live mode: poll GET /api/runtime/snapshot mỗi **200ms** qua setInterval (App.tsx:354-360)

## runtimeApi — lớp fetch có kỷ luật
- `getRuntimeSnapshot`: dedupe — một promise in-flight dùng chung cho map + gate overlay (runtimeApi.ts:6,21-36); AbortSignal.timeout(2000)
- Lỗi → `retryAfter = now + 2000ms`: các call sau reject ngay với lastRuntimeError, không spam server (runtimeApi.ts:4,23-29)
- `runtimeCameraStreamUrl` → `/api/runtime/cameras/<cam>.mjpg` (L38-40); gates GET 404→null, POST gửi config (L42-68)

## Hợp đồng sống phía client: liveRuntimeError (runtime.ts:116-141)
Giống hệt `_fresh_live` bên backend:
- schema_version == 2 ("Runtime chưa dùng schema v2")
- source_mode == "live"
- published_at tuổi ∈ [−1000ms, +5000ms] ("Dữ liệu camera đã cũ quá 5 giây")
- mọi camera `online` và `age_ms` finite ∈ [0,5000]
→ frontend tự tái kiểm chứng, không tin controller

## Cursor frame trên client (App.tsx:272-287)
- `runtimeCursorRef` = {runtimeId, frameIndex}; runtime_id đổi → reset cursor
- frame_index < cursor → throw "Runtime trả về frame cũ hơn frame đã hiển thị"
- frame không tiến quá **5000ms** → "Camera không có frame mới trong 5 giây" (check cả trong interval App.tsx:354-358)
- Lỗi → applySnapshot fallback toàn ô `unknown`, cameras offline, runtimeState="error" (App.tsx:309-349)

## Adapter runtime→domain (runtimeAdapter.ts)
- cam1→"cam-left", cam2→"cam-right" (L6-9)
- `runtimeParkingSpots`: join snapshot.parking_slots theo slot_id với PARKING_GEOMETRY; status occupied/empty; ô không có trong runtime → "unknown", confidence 0; revision = frame_index (L27-49)
- `runtimeVehicles`/`runtimeSlots`: rút gọn field có default an toàn (L52-77)

## Session pipeline phía client
- useVehicleSession poll GET /api/session/<id> mỗi **500ms**, timeout 2s (useVehicleSession.ts:27,111-114,214)
- `commit()` (L52-93): reject nếu sai session id / lifecycle cũ / deleted; **GET trong lúc POST đang chạy bị loại** ("stale_revision" — comment L57-59); runtimeId đổi → reject + warn; revision < hiện tại → reject; revision bằng mà khác trường → "conflicting revision" reject
- Action POST mang `expected_revision` + `action_id = crypto.randomUUID()` (fallback getRandomValues cho HTTP LAN không-secure-context) (L31-35,157-160)
- Lỗi transport sau POST → reconcile bằng GET thay vì giả trạng thái (comment L171-175)
- Auto-claim: sessionId + !claimed → claim() một lần qua claimedRef (App.tsx:219-236)
- Reservations poll 500ms; lỗi giữ overlay cũ (comment L183-186)
- ownParkedEpisode trong snapshot → refreshSession một lần mỗi episode id (App.tsx:155-161)

## worldToSvg — affine từ slot_layout (worldToSvg.ts)
- Anchor = tâm polygon slot_layout (world cm) ↔ tâm ô trong PARKING_GEOMETRY (svg px) (L53-62)
- Fit affine least-squares 3 tham số/trục qua solve3 (Gaussian elimination), cần ≥3 anchor (L63-80); cache theo JSON layout key (L42-51)
- Không fit được → fallback clamp vào khung (L86-89); createSvgToWorld dùng nghịch đảo định thức (L97-113)
- Gate nodes: fetchGateRoi mỗi 1000ms → GET gates + project p1/p2 → updateGateNodesInGraph(LANE_GRAPH) (App.tsx:363-404); gates KHÔNG được chiếu từ frame cũ (comment L371-373)
- `canonicalRuntimeId`: theo dây chuyền retired_global_ids có visited-set; gần nhau ≠ cùng xe (comment L190; runtime.ts:191-202)

## resolveSessionParking (sessionParking.ts:27-112) — decision tree
Thứ tự: EXIT_NAVIGATION → parked(completionKey) → ownSpots (episodes ưu tiên, fallback dwell) → >1 ô = identity_invariant_error → pending confirmations (degraded/age>5s/insufficient → parking_processing_delayed) → target checks: not-in-runtime → empty→guiding → vehicle null → identity_pending → ==ownGid → confirmation_pending → other confirmed → target_occupied_by_other → else identity_pending

## Figure
- `frontend/artifacts/screenshots/1440x900-c10-navigation.png` — UI thật (navigation mode, route A* tới C10, 160 ô)
- Copy qua annotate image_path → `frontend-dataflow-map.jpg`; chú thích: box header stats (dữ liệu từ snapshot), marker LỐI VÀO/LỐI RA (gate world→SVG), pin C10 (targetSpotId)
- origin sẽ là `frontend_artifacts/f0/cam0` (ngoài video pipeline)
