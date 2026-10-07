# Builder-C — Bản đồ luồng thực thi end-to-end (Phase 1 V2)

Phạm vi C: **orchestration → snapshot → gate/QR → frontend navigation**.
Chi tiết CV/motion/handoff thuộc A và B; C chỉ xác minh thứ tự stage,
nhánh song song và điểm nối giữa chúng. Dossier A/B chưa có tại thời điểm
viết — phần đối chiếu ghi ở mục Blocker.

---

## 1. Tổng quan runtime — bản đồ pipeline authoritative

```
 CAM1 stream ──[LatestFrameCapture: grab-thread, latest-only]──┐
 CAM2 stream ──[LatestFrameCapture: grab-thread, latest-only]──┤
                                                              ▼
                                    main loop (two_camera.run, mỗi vòng = 1 cặp frame)
                                    ┌───────────────────────────────────────────────┐
                                    │ 1. read pair + synchronize_live_frames        │
                                    │ 2. binder.begin_frame                         │
                                    │ 3. PARKING branch (song song)                 │
                                    │    live:  apply futures → submit jobs mới     │
                                    │    replay: process_parking_frame inline        │
                                    │ 4. sync_parking_identity_reservations (pre)   │
                                    │ 5. tracker.process_frame  (motion → local ID) │
                                    │ 6. manager: occluded/independent/trajectories │
                                    │ 7. binder.prepare_predeparture_tokens         │
                                    │    + recover_departing_vehicle_ids            │
                                    │ 8. manager.update_all_tracks → GLOBAL IDs     │
                                    │ 9. binder.update_tracks / finalize_arrivals   │
                                    │10. sync_parking_identity_reservations (post)  │
                                    │11. to_json → build_runtime_snapshot           │
                                    │    → RuntimeState.publish_snapshot (5 Hz)     │
                                    │    → publish_frame (MJPEG, latest-only)       │
                                    └───────────────────────────────────────────────┘
                                          │                        │
                    parking_executor      │                        │
                    (ThreadPoolExecutor   │                        │
                     2 workers, per-cam) ─┘                        │
                                                                   ▼
                    ┌──────────────────────┐        ┌───────────────────────────────┐
                    │ runtime_server :8001 │        │ gate_session_controller :8000 │
                    │ /api/runtime/…       │◀─poll──│ vòng while 0.25 s: fetch      │
                    │ snapshot·map·events· │ 0.25 s │ snapshot → process_snapshot   │
                    │ gates·cameras.mjpg   │        │ → session store (file JSON)   │
                    └──────────────────────┘        └───────────────────────────────┘
                            ▲    ▲                          ▲
                            │    │ poll 200 ms              │ poll 500 ms
                            │    │ + gates 1 s              │ session/reservations
                            │    │                          │
                    ┌───────┴────┴──────────────────────────┴────┐
                    │ frontend (Vite): App driver /kiosk /monitor │
                    │ runtimeAdapter → parkingStore → ParkingMap  │
                    │ session ?id → claim → select → A* route     │
                    └─────────────────────────────────────────────┘
```

**Điểm then chốt về thứ tự** (không được vẽ thành đường thẳng đơn giản):

- **Occupancy là nhánh song song tracking**, không phải bước kế tiếp tuần tự:
  live mode submit `process_parking_frame` vào `ThreadPoolExecutor(2)` rồi
  *áp dụng kết quả ở vòng loop sau* khi kèm staleness gate
  (`result_too_old`, `evidence_not_monotonic`). Replay mặc định mới chạy
  inline. — `two_camera.py:2280-2282, 2515-2667`.
- **Thứ tự đúng trong loop** (đối chiếu lại với A §1 / B §1):
  `binder.begin_frame` (`2508-2509`) chạy **trước**, rồi mới đến áp parking
  evidence (`2515+`) — diagram trên đã đúng; lỗi diễn giải cũ ở §4 Q1 đã sửa.
- **Parking evidence được áp dụng TRƯỚC identity allocation** trong cùng
  vòng loop (comment chủ ý tại `two_camera.py:2511-2514`): token recovery
  occupied→empty phải tồn tại trước khi track mới được cấp GID.
- **Gate controller và frontend đều là consumer async độc lập**: runtime
  publish ~5 Hz (`--json-fps`), gate poll 0.25 s, frontend poll 200 ms —
  không có push, không có chuỗi gọi ngược. Session/QR *không* nằm trong
  loop xử lý frame.
- **Gate event (entry/exit) dùng vị trí xe, KHÔNG chờ occupancy**: entry
  crossing tạo session ngay khi đoạn world-position cắt vạch cổng — có thể
  xảy ra hàng chục giây trước khi xe đỗ vào ô và binder phát episode.

---

## 2. Câu chuyện một chiếc xe (đúng theo source)

1. **Xe vào cam1.** `LatestFrameCapture` giữ sẵn frame mới nhất
   (`latest_frame_capture.py:10-60`); loop đọc cặp frame + đồng bộ lệch
   thời gian (`synchronize_live_frames`, `two_camera.py:450-482`).
   Motion tracker phát hiện blob trong tracking-ROI → track local →
   `manager.update_all_tracks` cấp **Global ID** mới (chỉ track confirmed
   mới được cấp — `cross_camera_manager.py:7083-7088`).
2. **Xe cắt vạch CỔNG VÀO.** Ở poll kế tiếp, gate controller thấy đoạn
   `previous → position` cắt `entry_gate` đúng hướng → `create_session` →
   session `WAITING_FOR_SCAN`, QR sống 120 s
   (`gate_session_controller.py:498-521`, `session_manager.py:29,255-313`).
   *Quirk*: nếu xe nhanh cắt vạch trước khi GID được publish, coordinator
   vẫn nhận được nhờ `recent_observed_path` — 2 điểm đo liên tiếp cùng
   camera + cùng local track (`gate_session_controller.py:259-309,504-513`).
3. **Kiosk hiện QR.** `/kiosk/entry` poll `/api/sessions/waiting` mỗi
   250 ms, render QR chứa `/?session=<sid>` (`EntryQRKiosk.tsx:19-78`).
   Tài xế quét → trang App mở với `?session=sid` → auto-`claim` →
   `SELECTING_SPOT` (`App.tsx:219-236`, `session_manager.py:355-368`).
4. **Tài xế chọn ô.** `POST /api/session/select` → `_validate_selection`
   kiểm runtimeId khớp + ô không bị session khác reserve + ô còn `empty`
   trong snapshot live (`gate_session_controller.py:69-89,816-822`) →
   state `NAVIGATING_TO_SPOT`. Frontend vẽ A* từ `entrance` (hoặc từ vị
   trí xe hiện tại) đến `spot-entry` của ô (`routeEngine.ts:121-208`).
5. **Xe đi qua vùng chồng lấp cam1→cam2.** Manager nối đoạn:
   `_upsert_handoff` → `_match_pending_handoffs` → dormant re-ID →
   cross-camera pair/duplicate — giữ **cùng Global ID**
   (`cross_camera_manager.py:7154-7241`; chi tiết của B).
6. **Xe vào ô và dừng.** Nhánh parking async đo `occupied` theo pixel
   trong ROI ô; binder kết hợp vision + track + dwell → commit chủ ô và
   phát **parking episode** (`state:"parked"`) vào snapshot
   (`slot_vehicle_binder.py:2047+,2431+,876-913`; chi tiết của B).
7. **Session chuyển PARKED.** Gate controller thấy episode mới (lọc theo
   `applied_frame_idx/revision`, idempotent bằng cursor) →
   `set_parked_by_global_id` → `PARKED`
   (`gate_session_controller.py:628-703`, `session_manager.py:392-437`).
   Frontend nhận `decision.kind="parked"` → màn hoàn tất.
8. **Xe rời ô & cắt CỔNG RA.** Episode `departing/released` →
   `apply_departure_episode`; đoạn vị trí cắt `exit_gate` đúng hướng →
   `delete_session_by_global_id` — **cách duy nhất session đóng**; mất
   quan sát không đóng session (`gate_session_controller.py:523-535`,
   docstring dòng 3-6).

---

## 3. Từng stage — LÀM GÌ · VAI TRÒ · NẰM Ở ĐÂU · TẠI SAO

### 3.1 Capture & đồng bộ cặp frame
- **LÀM GÌ:** mỗi camera một thread đọc stream liên tục và chỉ giữ frame
  mới nhất (drop stale); loop chính lấy cặp frame + đẩy stream cũ hơn đuổi
  kịp đến khi skew ≤ `--max-camera-skew-ms`.
- **VAI TRÒ:** đầu vào của mọi stage. Mất nó → không frame; skew lớn → hai
  camera mô tả hai thời điểm khác nhau, handoff/occupancy lệch pha.
- **NẰM Ở ĐÂU:** `latest_frame_capture.py:10-60`; `two_camera.py:2066-2090`
  (setup), `2460-2485` (per-loop), `450-482` (sync).
- **TẠI SAO:** docstring nói rõ "drops stale frames"/"latest-only mailbox"
  — nguồn MJPEG chậm không được phép tạo hàng đợi làm tracking trễ
  (`latest_frame_capture.py:1,9`; cùng quan điểm tại `runtime_server.py:134-136`).

### 3.2 ROI/motion/tracking (per-camera)
- **LÀM GÌ:** `process_frame` chạy `Kalman predict` cho TẤT CẢ track
  **trước** detect, rồi `_detect` (bên trong: `MOG2` → cổng 127 có điều
  kiện → `temporal motion mask` → `support = dilate(motion)` ∧ fg —
  **motion là cổng, không phải ROI** → `∧ roi_context_mask` → morphology
  → findContours → cascade per-blob: strict-ROI support + anchor∈ROI +
  motion-fill + cast-shadow), `_assign` LAPJV, quản lý
  lost/expired/occlusion; `priority_regions` từ binder là vùng ưu tiên
  recovery. Tức thứ tự thật là **MOG2 → motion-gate → ROI** —
  "ROI trước motion" chỉ là cách tả đơn giản, không đúng source
  (đối chiếu A §1/§3.2-3.4).
- **VAI TRÒ:** tạo "quan sát" đầu vào cho identity. Mất nó → không
  track → không GID → không vehicle trong snapshot.
- **NẰM Ở ĐÂU:** `motion_tracker.py:2204-2263` (`process_frame`:
  `_predict_tracks` :2228 → `occlusion_guard.prepare` :2230 → `_detect`
  :2233 → `_assign` :2249); `_detect` nội bộ :768-1086 (MOG2 :768,
  motion-gate :790-793, ROI context :794-816, per-blob gates :828-1085);
  gọi tại `two_camera.py:2679-2716`; ROI gán `2417-2420` (fallback =
  union polygon ô từ `parking_detector.get_global_mask`).
- **TẠI SAO:** `priority_regions` để blob nhỏ quanh ô đang recovery cũng
  được xem xét (docstring `motion_tracker.py:2210-2217`); motion-gate
  trước ROI vì "MOG2 đánh dấu cả xe đỗ khi ánh sáng đổi — frame
  difference qua nhiều frame loại blob đứng yên"
  (docstring `motion_tracker.py:527-532`, theo A).

### 3.3 Handoff & Global ID (CrossCameraManager)
- **LÀM GÌ:** ánh xạ (camera, local track) → GID duy nhất trên bản đồ
  world chung; chuỗi ưu tiên: bảo vệ occluded/recovery → handoff sớm
  theo vận tốc → match pending handoffs → overlap đồng thời → dormant
  re-ID → world-trajectory → pair/duplicate cross-cam → mới cấp GID mới.
- **VAI TRÒ:** đây là "hộ chiếu" của xe — session, binder và frontend đều
  key theo GID. Mất nó → mỗi camera một danh tính, xe bị nhân đôi.
- **NẰM Ở ĐÂU:** `cross_camera_manager.py:7075-7253+` (`update_all_tracks`),
  gọi tại `two_camera.py:2779-2784` với `protected_local_keys` từ
  `recover_departing_vehicle_ids` (`two_camera.py:2764-2773`).
- **TẠI SAO thứ tự:** tentative track chỉ được *nhận* GID cũ, không được
  *cấp* GID mới (`7083-7088`); reserved keys của recovery bị loại khỏi mọi
  đường gán tự động (`7089-7097`) — tránh đoạn xe rời ô bị cấp nhầm GID
  mới trước khi recovery kịp match.

### 3.4 Occupancy/binder — nhánh song song
- **LÀM GÌ:** `ParkingDetector.detect` vote **25 biến thể** (5 CLAHE × 5
  gamma) đếm ratio pixel "không phải nền" trong ROI ô: `is_free` khi
  `empty_votes ≥ required_votes = total//2` — **≥12/25 ở production**
  (`parking_detector.py:528-539`), `occupied = not is_free`; `core-rescue`
  (component đặc ở lõi) và `edge recheck` (Canny `edge_ratio ≥ edge_thr`)
  có thể lật is_free→False (:560-570). `SlotVehicleBinder` kết hợp
  vision + track-owner + dwell → quyết định `occupied`, `vehicle_id`,
  `tracking_state`, `stopped_for_ms`, `decision_source`; phát episode
  parked/departing/released và `pending_arrivals` (claim đang thu thập).
  *(Bề sâu trong ô — claim path/strong-overlap/token — của B; C chỉ cam
  kết mức orchestration.)*
- **VAI TRÒ:** authoritative về "ô này của xe nào". Chạy *song song* với
  tracking ở live mode (executor 2 worker, ~2 Hz `--parking-fps`), đồng bộ
  inline ở replay; kết quả áp vào frame sau qua `update_vision` kèm
  `evidence_frame_idx/timestamp`.
- **NẰM Ở ĐÂU:** `parking_detector.py:439-…` (`detect`), `602-…`
  (`accept_evidence`); `slot_vehicle_binder.py:2431+` (`update_vision`),
  `2047+` (`update_tracks`), `876-913` (`parking_episodes`,
  `pending_arrivals`), `3872-3914` (`_binding_to_json` — các field xuất
  snapshot); orchestration `two_camera.py:2515-2667`, `2793-2806`.
- **TẠI SAO song song:** docstring `process_parking_frame`
  ("Run slow parking work outside the live display loop",
  `two_camera.py:1596`) — parking nặng (vote đa threshold) nên tách worker
  để không làm tracking trễ; staleness gate `result_too_old`/
  `evidence_not_monotonic`/`worker_over_deadline` (`2587-2667`) ngăn
  evidence cũ ghi đè trạng thái mới.

### 3.5 Snapshot build + publish
- **LÀM GÌ:** `manager.to_json` xuất registry (map_vehicles,
  identity_lifecycle, aliases, events); `build_runtime_snapshot` chuẩn
  hoá schema v2: slots (flatten binder JSON), vehicles (bỏ
  `exited/expired`), episodes, pending confirmations, pipeline health,
  `retired_global_ids`, 100 events gần nhất; throttle `--json-fps` 5 Hz;
  `RuntimeState.publish_snapshot` freeze + serialize vào mailbox.
- **VAI TRÒ:** đây là **contract duy nhất** giữa CV stack và mọi consumer
  (gate + hai trang frontend). Mất nó → downstream chết đứng.
- **NẰM Ở ĐÂU:** `two_camera.py:2816-2871` (gọi + throttle);
  `runtime_contract.py:37-168`; `runtime_server.py:106-114`.
- **TẠI SAO mailbox latest-only:** comment `runtime_server.py:107-109` —
  HTTP reader chỉ giữ lock đủ lâu để copy `bytes` bất biến; publisher
  không bao giờ chờ consumer.

### 3.6 runtime_server :8001 — API bề mặt
- **LÀM GÌ:** thread HTTP phục vụ `GET /api/runtime/status|snapshot|map|
  events|gates`, `POST /api/runtime/gates` (validate `coordinate_space:
  world` + `unit` khớp runtime), `GET /cameras/{cam}.jpg|mjpg`
  (encode ở thread riêng, latest-only, `needs_frame` chỉ render khi có
  subscriber).
- **VAI TRÒ:** cổng duy nhất để gate controller và frontend đọc thế giới.
- **NẰM Ở ĐÂU:** `runtime_server.py:84-228` (`RuntimeState`),
  `272-391` (handler), `408-423` (`main`: API thread daemon +
  `two_camera.run(runtime_publisher=state)` trên main thread).
- **TẠI SAO:** `needs_frame`/`wait_for_frame` (`173-220`) tránh tốn CPU
  encode MJPEG khi không ai xem — comment `173-174`.

### 3.7 Gate session controller :8000 — consumer async
- **LÀM GÌ:** vòng `while` poll snapshot mỗi `--poll-interval` 0.25 s →
  `process_snapshot`: chặn non-v2/non-live/stale (`_fresh_live` ≤5 s);
  reset state khi `runtime_id` đổi; bỏ snapshot lùi `frame_index`; áp
  alias (`retired_global_ids`) + merge events → remap session; áp
  parking episodes theo cursor idempotent; sau đó mới xét gate crossing
  entry/exit; phục vụ session API (GET sessions/waiting/reservations/
  session/:id · POST claim/select/exit).
- **VAI TRÒ:** biến luồng quan sát thành *sự kiện nghiệp vụ* — session,
  QR, reservation. Mất nó → không ai biết xe nào cần QR/đang đi đâu.
- **NẰM Ở ĐÂU:** `gate_session_controller.py:893-906` (poll loop),
  `401-456` (process_snapshot gates/aliases), `458-626` (per-vehicle),
  `628-703` (episodes), `738-846` (HTTP), `259-309`
  (`_recent_measured_entry_crossing`).
- **TẠI SAO gate event có thể đến trước occupancy:** entry/exit chỉ cần
  2 vị trí liên tiếp cắt vạch đúng hướng (`498-535`) — độc lập hoàn toàn
  với nhánh parking; `recent_observed_path` còn cứu cả trường hợp xe cắt
  vạch *trước khi* GID được publish (docstring `266-273`).

### 3.8 Session store — lifecycle + QR
- **LÀM GÌ:** file JSON `navigation_sessions.json` (atomic write), mỗi
  session: `sessionId` ngẫu nhiên, `globalVehicleId`, `runtimeId`,
  state machine `WAITING_FOR_SCAN → SELECTING_SPOT → NAVIGATING_TO_SPOT/
  RELOCATING → PARKED → EXIT_NAVIGATION` (đóng = xoá khi exit crossing);
  `qrExpiresAt = createdAt + 120 s` (`QR_DISPLAY_SECONDS`); optimistic
  concurrency `revision` + `actionReceipts` (idempotent, giữ 32 gần nhất);
  `select_spot` đặt reservation → `list_navigation_reservations`.
- **VAI TRÒ:** single source of truth cho mọi phiên QR. Mất nó → không
  có trạng thái điều hướng, không reserve ô.
- **NẰM Ở ĐÂU:** `session_manager.py:255-313` (create), `355-389`
  (claim/select), `392-437` (parked/departure), `449-468` (exit),
  `516-…` (remap gid), `220-252` (reservations), `81-88` (TTL),
  `316-352` (`_mutate_session` — revision/receipts).
- **TẠI SAO:** docstring mở đầu file — session gắn **canonical GID**,
  local tracker id chỉ là diagnostic. RLock re-entrant được source ghi là
  để `select_spot` giữ check-availability + update nguyên tử trong API
  thread (`session_manager.py:225-230`); suy luận thêm *[suy luận]*:
  atomic write + revision/receipts cùng phục vụ nhận quả đua giữa
  poll-loop (gate) và HTTP thread cùng mutate file.
- **SOURCE QUIRK — QR expiry chỉ là visibility, không phải hard TTL:**
  `qrExpiresAt = createdAt + 120 s` chỉ được dùng để **lọc hiển thị** —
  `list_waiting_sessions` trả session `WAITING_FOR_SCAN` còn hạn cho
  kiosk (`session_manager.py:200-217`) và `EntryQRKiosk.isQrVisible`
  (`EntryQRKiosk.tsx:9-17`). **`claim_session` KHÔNG kiểm `qrExpiresAt`**
  (`session_manager.py:355-368`) → session quá 120 s nhưng chưa claim
  vẫn claim được qua `POST /api/session/claim`. Không có job nào xoá
  session hết QR TTL — session chỉ xoá khi exit-gate crossing
  (`gate_session_controller.py:523-535`).

### 3.9 Frontend — 3 trang, 2 nguồn poll
- **LÀM GÌ:** `main.tsx` định tuyến theo URL: `?session=<id>` → App tài
  xế, `/kiosk/entry` → QR kiosk, `/monitor` → bản đồ vận hành + vẽ gate.
  App poll snapshot 200 ms (một request dùng chung cho map + gates), bắt
  `liveRuntimeError` (schema 2, `source_mode=live`, published ≤5 s, cả 2
  cam online & age ≤5 s), cursor `runtime_id+frame_index` chống frame
  ngược/thiu → đổ vào `parkingStore`; session poll 500 ms với commit
  guard (sessionId/lifecycle/revision, POST thắng GET đang bay); A* trên
  `LANE_GRAPH` + re-route động theo vị trí xe + off-route — engine default
  `thresholdPx = 75` (`voiceGuidance.ts:98`) nhưng callsite App truyền
  **80 px** (`App.tsx:746-750`), ghi cả hai để không nhầm.
- **VAI TRÒ:** consumer cuối — render bản đồ, QR, đường dẫn, cảnh báo.
  Mất nó → hệ thống vẫn chạy nhưng tài xế mù.
- **NẰM Ở ĐÂU:** `main.tsx:17-24`; `api/runtimeApi.ts:10-36`;
  `app/App.tsx:238-411` (poll+guards+gate overlay), `703-786` (route
  calc + guidance + off-route), `789-825` (confirm → POST select);
  `hooks/useVehicleSession.ts:27-219`; `adapters/runtimeAdapter.ts:27-49`;
  `calibration/worldToSvg.ts:45-133` (affine từ slot_layout);
  `routing/routeEngine.ts:31-208`; `domain/sessionParking.ts:27-112`
  (quyết định parked/pending/occupied-by-other);
  `components/EntryQRKiosk.tsx:19-78`; `app/MonitorApp.tsx:110-135,240-265`.
- **TẠI SAO nhiều lớp freshness:** runtime chết/đứng yên 5 s thì mọi ô →
  `unknown` và chỉ dẫn dừng (`App.tsx:309-349`); session cũng commit-guard
  để GET cũ không ghi đè POST mới (`useVehicleSession.ts:52-93`).

---

## 4. Bốn câu hỏi thực tế cho các stage được giao

**Q1 — Thứ tự stage có tuyến tính không?**
Không hẳn. Trong một vòng loop, theo đúng callsite: capture+sync →
`binder.begin_frame` (`two_camera.py:2508`) → áp parking evidence đã hoàn
thành (`2515+`, replay thì chạy inline ngay đây) → sync reservations →
tracker → trajectory/occlusion → predeparture tokens + recovery →
update_all_tracks (GID) → binder update_tracks/finalize → sync
reservations lần 2 → snapshot. Nhưng *sản xuất* evidence parking là nhánh
song song (`parking_executor`), và mọi consumer (gate, frontend, MJPEG)
đều async qua mailbox/poll. Mô hình đúng: **1 loop thứ tự nghiêm ngặt +
1 nhánh vision song song + N consumer bất đồng bộ.**

**Q2 — Gate/frontend có bị block bởi pipeline chậm không?**
Không trực tiếp. Runtime publish vào mailbox latest-only
(`runtime_server.py:106-139`); snapshot GET chỉ copy bytes đã serialize.
Gate poll 0.25 s, frontend 200 ms — cả hai tự chịu trách nhiệm freshness
(`_fresh_live` ≤5 s; `liveRuntimeError` + 5 s progress watchdog). Khi
pipeline chậm/stale, consumer *nhìn thấy* staleness và tự degrade
(session API trả `RUNTIME_UNAVAILABLE` 503 cho select; frontend đánh
`unknown` toàn bộ ô) chứ không treo chờ.

**Q3 — Ai là chủ của "xe đã đỗ ở ô nào"?**
`SlotVehicleBinder` (qua `parking_episodes` schema v2), không phải
pixel detector trần, cũng không phải session. Gate controller *chỉ* áp
episode vào session (`gate_session_controller.py:556-557` — nhánh v1
`parked_slot_id` bị `continue` ở v2). Frontend cũng quyết định theo
episodes/pending confirmations trong `resolveSessionParking`
(`sessionParking.ts:44-73`). `pending_parking_confirmations` chỉ là
diagnostic — comment trong `runtime_contract.py:155-157` nói consumer
không được coi đó là đỗ thành công.

**Q4 — QR/session gắn vào cái gì — track, ô, hay thời điểm?**
Gắn canonical **Global ID** của xe, tạo ngay khi entry-gate crossing;
không gắn ô đỗ (ô chỉ là `targetSpotId`/`parkedSpotId`), không gắn local
track id (chỉ diagnostic). Session sống 120 s QR window rồi *hết hạn
hiển thị* (không xoá), và chỉ bị xoá khi exit-gate crossing đúng hướng —
mất tầm nhìn camera không đóng session
(`session_manager.py:29,81-88`; `gate_session_controller.py:1-6`).
Alias/merge (`retired_global_ids`, `global_id_merged`) remap GID của
session để QR không chết khi manager gộp danh tính
(`gate_session_controller.py:343-399`).

---

## 5. Storyboard đề xuất — bản đồ pipeline tương tác (cho LEAD duyệt)

**Bố cụ:** bản đồ node-node như sơ đồ §1, click vào node mở panel
"đoạn một câu chuyện + file:line + đối tượng thật" (frame/track/GID/
slot/session/QR). Ba lớp rõ ràng: (a) loop thứ tự, (b) nhánh parking
song song, (c) consumer async — ba nhóm màu/vùng khác nhau để không ai
đọc nhầm thành đường thẳng.

**Animation chính** (một chuyến xe, theo đúng thứ tự §2):
1. Frame rơi vào node *capture* (cam1 sáng trước, cam2 sau).
2. Blob→local-track→**GID** — nhấn mạnh GID là thứ đi xuyên toàn hệ.
3. Vị trí GID cắt vạch entry → tia sáng chạy sang node *gate* (async!),
   QR bật lên ở *kiosk*, đếm ngược 120 s.
4. Xe đỗ: nhánh parking (vùng riêng) sáng → `episode` bay về snapshot →
   gate áp vào session `PARKED` — minh hoạ rõ *authoritative episode*,
   đối lập với `pending` mờ.
5. Exit: crossing vạch exit → session biến mất; QR tắt.
6. Nhánh phụ: `retired_global_ids` remap session (GID đổi nhưng QR sống
   tiếp); parking job bị `result_too_old` rớt khỏi gate staleness.

**Boundary/quirk cần vẽ đúng:**
- `QR_DISPLAY_SECONDS = 120` cố định (`session_manager.py:29`) — chỉ là
  *visibility* cho kiosk; `claim` API không reject session hết TTL
  (`session_manager.py:355-368`), và TTL hết không xoá session.
- Gate config đến từ file `gate_zones.json` do **trang /monitor vẽ và
  POST** (`MonitorApp.tsx:240-265` → `runtime_server.py:335-353` →
  `gate_session_controller.py:210-221`) — đơn vị world `cm`, phải khớp
  `coordinate_space.unit` của snapshot.
- Session chỉ xoá bằng exit crossing — không có timeout.
- `select` có thể fail `SPOT_RESERVED`/`SPOT_NOT_AVAILABLE`/
  `RUNTIME_UNAVAILABLE` — UX phải hiện đúng lý do.
- Snapshot `schema_version==2` + `source_mode=="live"` là điều kiện gate
  *và* frontend đều bắt buộc — replay (không `--live-mode`) bị cả hai từ
  chối như nhau.
- `frame_index` lùi = snapshot bị drop; cùng frame nhưng episode mới vẫn
  được áp (`same_frame_update`, `gate_session_controller.py:432-454`).

---

## 6. Blocker & phụ thuộc

- **Đã đối chiếu A + B** (cùng thư mục, xem `cross-review.md`): thứ tự
  loop khớp; C đã sửa các điểm lệch theo verdict trong cross-review
  (begin_frame→evidence, chuỗi MOG2→motion→ROI, vote ≥12/25, off-route
  75/80, QR expiry = visibility-only).
- **Phía B đã đóng** (bản 16:39): vote `empty_votes ≥ 12/25` đúng source
  (`parking_detector.py:533,539`), storyboard nhãn đúng "phiếu empty",
  defaults gắn runtime args — không còn discrepancy (xem cross-review §4).
- C đọc orchestration-level các module techgar (không audit sâu bên trong
  `motion_tracker`/`cross_camera_manager`/`slot_vehicle_binder` — việc đó
  của A/B); mọi phát biểu trong dossier đều kèm file:line đã mở trực tiếp.
- Không verify được hành vi MJPEG thật (chỉ đọc code), không chạy stack —
  Phase 1 chỉ phân tích source.

*C xác nhận hoàn thành phần orchestration/snapshot/gate-QR/frontend;
diagram §1 là bản final đề xuất cho LEAD compile SPEC (sau khi B chốt
correction ở phần occupancy).*
