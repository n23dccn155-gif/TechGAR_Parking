# Builder C — Phân tích Tích hợp & Vận hành TechGar2

**Phạm vi được giao:** `gate_session_controller.py`, `runtime_server.py` (snapshot API), `config/*.json`, `docs/lenh-chay-theo-session.md`, luồng dữ liệu end-to-end camera → gate/session → snapshot/API → frontend QR/navigation; đối chiếu contract frontend/backend (endpoint, port, payload, timestamp, ID, refresh), nguồn config và lệnh chạy thực tế; phát hiện mâu thuẫn docs ↔ code.

**Phương pháp:** đọc tĩnh toàn bộ code hai phía (backend Python + frontend TypeScript), đọc config JSON và docs/runbook, đối chiếu từng điểm contract. **Không chạy** dịch vụ, test hay hardware — mọi nhận định hành vi là phân tích tĩnh, chưa được kiểm chứng bằng thực thi (chi tiết ở mục Giới hạn).

---

## 1. Kiến trúc toàn hệ thống & Tech stack

Hệ thống gồm **3 tiến trình** giao tiếp thuần HTTP REST (không WebSocket):

```
DroidCam cam1/cam2 (HTTP MJPEG) hoặc raw_camN.mp4 replay
        │
        ▼
┌─────────────────────────────────────────────────────────────┐
│ backend/main_detect/runtime_server.py  — PORT 8001          │
│  two_camera.run() pipeline: MotionTracker + CrossCameraManager│
│  (Global ID) + SlotVehicleBinder + ParkingDetector          │
│  → publish_snapshot() mỗi ~1/json_fps (mặc định 5 Hz)       │
│  → HTTP: snapshot/map/events/gates/cameras.{jpg,mjpg}       │
└──────────────┬──────────────────────────────────────────────┘
               │ GET /api/runtime/snapshot (poll 250 ms)
               ▼
┌─────────────────────────────────────────────────────────────┐
│ backend/gate_session_controller.py — PORT 8000              │
│  GateSessionCoordinator: cắt vạch ENTRY/EXIT trên world map │
│  session_manager.py: lifecycle session → file JSON          │
│  → HTTP: /api/session(s)/* (claim/select/exit/waiting/...)  │
└──────────────┬──────────────────────────────────────────────┘
               │ GET/POST session API + GET runtime API (qua Vite proxy)
               ▼
┌─────────────────────────────────────────────────────────────┐
│ frontend/ (Vite dev port 4173)                              │
│  /kiosk/entry → EntryQRKiosk (QR tại cổng)                  │
│  /?session=<id> → App (trang dẫn đường cá nhân)            │
│  /monitor → MonitorApp (giám sát + vẽ cổng)                │
│  / (không session) → App driver + MockParkingDataSource    │
└─────────────────────────────────────────────────────────────┘
```

**Tech stack (theo manifest):**

| Thành phần | Stack | Nguồn |
|---|---|---|
| Frontend | React `^19.0.0`, TypeScript `~5.7.2`, Vite `^6.0.5`, Zustand `^5.0.2`, Tailwind `^3.4.17`, `qrcode ^1.5.4`, `lucide-react ^0.468.0`, Vitest `^3.2.4`, Playwright `^1.50.0`, pnpm `10.14.0` | `frontend/package.json:16-46,6` |
| Backend session/gate | Python **stdlib only** (`http.server.ThreadingHTTPServer`, `urllib`, `threading`) | `backend/requirements.txt:1-2` (file chỉ chứa comment, không dependency), `gate_session_controller.py:18-23` |
| Backend AI runtime | `opencv-python>=4.10`, `numpy>=1.26`, `lap>=0.5.12` | `backend/main_detect/requirements.txt:1-3` |
| Python version | README ghi "3.9 trở lên" (`README.md:30`). `int \| None` ở `runtime_contract.py:53` **không** chứng minh yêu cầu ≥3.10: mọi file đều có `from __future__ import annotations` (vd `runtime_contract.py:3`) → annotation không được đánh giá lúc runtime (postponed). Grep toàn `backend/` không thấy `match`/`datetime.UTC`/`tomllib`/`ExceptionGroup`/`zip(strict=)`; `unlink(missing_ok=True)` cần ≥3.8 (`session_manager.py:112`), `removeprefix` (3.9) chỉ trong test. → **Minimum chính xác: chưa xác minh** (bề mặt code đã đọc tương thích ~3.9). Môi trường thực tế: venv `backend/main_detect/.venv` chạy Python **3.11.9** — builder-b đo trực tiếp bằng `--version`; CLAUDE.md env note `python`→3.11. Lưu ý: version đo được trong môi trường ≠ version tối thiểu yêu cầu. | |

## 2. Module chính

**Backend**

- `backend/main_detect/runtime_server.py`: HTTP server 8001 + `RuntimeState` (mailbox frame mới-nhất, encode JPEG trên thread riêng `runtime-jpeg-encoder`, chỉ encode khi có subscriber `needs_frame` — `runtime_server.py:84-228`).
- `backend/main_detect/two_camera.py`: pipeline tracking 2 camera (~3300 dòng), gọi `build_runtime_snapshot` rồi `runtime_publisher.publish_snapshot` mỗi nhịp JSON (`two_camera.py:2841-2870`), nhịp giới hạn bởi `--json-fps` mặc định 5.0 (`two_camera.py:1802, 2817`).
- `backend/main_detect/src/techgar/runtime_contract.py`: điểm duy nhất định nghĩa snapshot schema v2 (`RUNTIME_SCHEMA_VERSION = 2`, `runtime_contract.py:12, 134-167`).
- `backend/gate_session_controller.py`: vòng poll 250 ms → `GateSessionCoordinator.process_snapshot` + HTTP API session (912 dòng).
- `backend/session_manager.py`: store session theo file `backend/data/navigation_sessions.json` (atomic write + fsync), revision optimistic concurrency, `actionReceipts` idempotency (`session_manager.py:23-28, 91-112, 316-352`).
- `backend/sample_tracking_simulator.py`: sinh feed mẫu cho file mode (`sample_tracking_simulator.py:24-27`).

**Frontend**

- `src/api/runtimeApi.ts` — client 8001 (`/api/runtime/snapshot`, `/gates` GET/POST, MJPEG url; timeout 2 s, retry-backoff 2 s cho poll không-signal).
- `src/api/backendApi.ts` — client 8000 (`/api/session/<id>`, `/sessions/waiting`, `/sessions/reservations`, POST claim/select/exit; POST timeout 2 s).
- `src/adapters/runtimeAdapter.ts` — map snapshot v2 → domain `ParkingSpotState`/`CameraState` (`cam1→cam-left`, `cam2→cam-right`; slot không có trong snapshot → `unknown`).
- `src/domain/runtime.ts` — type `RuntimeSnapshot` + `liveRuntimeError()` (freshness contract phía FE).
- `src/domain/sessionParking.ts` — `resolveSessionParking` quyết định guiding/parked/reroute từ session + snapshot.
- `src/hooks/useVehicleSession.ts` — poll session 500 ms, khóa chống race GET/POST, `expected_revision` + `action_id`.
- `src/calibration/worldToSvg.ts` — fit affine world→SVG từ `slot_layout` (không dùng homography gốc).
- `src/app/{App,KioskApp,MonitorApp}.tsx` — 3 chế độ UI chọn theo URL (`main.tsx:17-24`).
- `src/mocks/MockParkingDataSource.ts` — nguồn `sample` deterministic cho trang driver không-session.

## 3. Luồng dữ liệu end-to-end

**Thứ tự khởi động thực tế (khớp code + `docs/QR_VEHICLE_SESSION.md:31-50`):**

1. `runtime_server.py` (8001) — bắt buộc chạy trước để có `slot_layout` phục vụ vẽ cổng.
2. `frontend` dev (4173) → mở `/monitor` → khối GATE CALIBRATION chọn 3 điểm ENTRY + 3 điểm EXIT → `POST /api/runtime/gates` → `runtime_server.save_gate_config` ghi `backend/main_detect/config/gate_zones.json` (`runtime_server.py:335-353`; `MonitorApp.tsx:239-262`).
3. `gate_session_controller.py --runtime-url http://127.0.0.1:8001/api/runtime/snapshot --gate-config backend\main_detect\config\gate_zones.json --port 8000` — **gate config chỉ đọc một lần lúc khởi động** (`gate_session_controller.py:874`); runtime mode từ chối config không phải `coordinate_space=="world"` (`gate_session_controller.py:875-880`).
4. Kiosk `/kiosk/entry` poll `GET /api/sessions/waiting` 250 ms; xe cắt ENTRY đúng chiều → `create_session` → kiosk sinh QR `/?session=<id>`; trang cá nhân auto-claim, chọn ô → `POST /api/session/select` → A* + giọng nói; episode `parked` → state `PARKED`; nút "Chỉ lối ra" → `POST /api/session/exit`; cắt EXIT đúng chiều → session bị **xóa** → QR 404 → "Phiên xe đã kết thúc".

**Cadence:**

| Nhịp | Giá trị | Chứng cứ |
|---|---|---|
| Publish snapshot | ≤ 5 Hz (`--json-fps` default 5.0) | `two_camera.py:1802, 2817` |
| Gate poll runtime | 250 ms (`--poll-interval` 0.25) | `gate_session_controller.py:865, 906` |
| FE runtime snapshot | 200 ms (App + Monitor) | `App.tsx:360`, `MonitorApp.tsx:12` |
| FE session GET | 500 ms | `useVehicleSession.ts:27, 214` |
| FE reservations | 500 ms | `App.tsx:191` |
| Kiosk waiting | 250 ms | `EntryQRKiosk.tsx:7, 48` |
| FE gate config reload | 1000 ms | `App.tsx:404` |
| Timeout fetch FE | 2000 ms (GET+POST) | `backendApi.ts:40`, `runtimeApi.ts:13`, `useVehicleSession.ts:111` |

## 4. Interface & contract đối chiếu

### 4.1 Runtime snapshot (port 8001 → consumer: gate controller + frontend)

Producer duy nhất `build_runtime_snapshot` (`runtime_contract.py:134-167`), consumer type `RuntimeSnapshot` (`frontend/src/domain/runtime.ts:60-82`) — **khớp 1-1**, FE chỉ thiếu các trường bổ sung `coordinate_space.calibration_id/calibration_status` (không ảnh hưởng, TS structural). Các trường then chốt:

- `schema_version: 2`, `runtime_id` (uuid mỗi lần chạy — `two_camera.py:2043`), `frame_index` tăng đơn điệu.
- `published_at`, `timestamp`: ISO local-time `timespec="milliseconds"` có offset (vd `+07:00`) — cả gate (`fromisoformat`, `gate_session_controller.py:121`) và FE (`Date.parse`, `runtime.ts:126`) đều parse đúng.
- `cameras{cam1,cam2}`: `online` + `age_ms` từ clock monotonic ns (`runtime_contract.py:120-132`).
- `vehicles[]`: `global_id`, `observed`, `position{x,y,reference}`, `last_seen_time` (giây float — gate chỉ dùng delta `gate_session_controller.py:476-485`), `recent_observed_path` (≤12 mẫu đo, dùng cứu entry crossing).
- `parking_slots[]`, `slot_layout[]` (polygon world), `parking_episodes[]` (v2 authoritative), `pending_parking_confirmations[]`, `parking_pipeline`, `retired_global_ids` (alias bền), `recent_events` (≤100).

**Freshness contract — hai phía nhất quán:**

| Điều kiện | Gate (`_fresh_live`, `gate_session_controller.py:103-125`) | FE (`liveRuntimeError`, `runtime.ts:116-141`) |
|---|---|---|
| schema | v2 (ở `process_snapshot:402-403`) | `=== 2` |
| `source_mode` | `== "live"` | `== "live"` |
| camera | mọi cam `online` ∧ `0 ≤ age_ms ≤ 5000` | giống hệt |
| `published_at` | age ∈ [−1 s, +5 s] | `now − pub ∈ (−1000, 5000] ms` |

Cả hai phía đều **fail-closed**: dữ liệu cũ/cam mất → gate ngừng xử lý, FE tô "unknown" toàn bản đồ + tạm dừng chỉ dẫn.

### 4.2 Session API (port 8000 → consumer: kiosk + trang cá nhân)

| Endpoint | Backend | FE caller |
|---|---|---|
| `GET /api/sessions/waiting` | `gate_session_controller.py:779-783` | `backendApi.getWaitingSessions` ← `EntryQRKiosk` |
| `GET /api/sessions/reservations?sessionId=` | `:764-778` | `getNavigationReservations` ← `App.tsx:181` |
| `GET /api/session/<id>` | `:787-793` | `getSession` ← `useVehicleSession` |
| `POST /api/session/claim` | `:813-815` | `claimSession` |
| `POST /api/session/select` | `:816-822` | `selectSpot` (kèm `spotId: null` để bỏ chọn) |
| `POST /api/session/exit` | `:823-825` | `startExit` |
| `GET /api/sessions`, `/navigation_sessions` | `:784-786` | không có consumer FE (liệt kê toàn bộ — xem rủi ro) |

- Payload POST: `{sessionId, spotId?, expected_revision, action_id}`; backend chấp nhận cả snake_case lẫn camelCase (`gate_session_controller.py:807-812`). FE gửi snake_case (`backendApi.ts:54`).
- Error contract: `SESSION_NOT_FOUND` 404, `REVISION_CONFLICT` 409 (+`session` hiện tại), `INVALID_SESSION_STATE` 409, `SelectionUnavailable`: `RUNTIME_MISMATCH` 409 / `SPOT_RESERVED` 409 / `SPOT_NOT_AVAILABLE` 409 / `RUNTIME_UNAVAILABLE` 503 (`gate_session_controller.py:62-89, 828-837`). FE map `SessionNotFoundError` và dùng `error.code` cho auto-reroute (`App.tsx:459-463, 800-803`) — khớp.
- Idempotency/concurrency: `expected_revision` check (`session_manager.py:328-329`), `action_id` receipt tối đa 32 (`:323-334`), validation availability giữ `_STORE_LOCK` → TOCTOU an toàn (`:220-230` + `gate_session_controller.py:72-89`).
- `VehicleSession` type FE (`domain/session.ts:9-30`) khớp record backend (`session_manager.py:289-310` + `_normalize_session:126-153`). `runtimeId` scoping: `_matches_runtime` cho phép `None` khớp mọi runtime (`session_manager.py:179-180`).

### 4.3 Gate/session API còn lại (port 8001)

- `GET /api/runtime/gates` (404 `GATE_CONFIG_NOT_FOUND` nếu chưa có), `POST` validate `coordinate_space=="world"` + `unit` khớp snapshot hiện tại (`runtime_server.py:314-353`, `MonitorApp.tsx:245-253` gửi `unit` từ snapshot — khớp).
- FE chỉ gọi: `/api/runtime/snapshot`, `/api/runtime/gates` (GET+POST), `/api/runtime/cameras/camN.mjpg` (`runtimeApi.ts:11, 39, 43, 58`; `MonitorApp.tsx:86`).
- **Không có consumer trong frontend** (grep toàn `frontend/src`): `/api/runtime/status` (health-check — server tự in URL khi boot, `runtime_server.py:416`), `/api/runtime/map`, `/api/runtime/events`, `/api/runtime/cameras/*.jpg`. Đây là API surface thừa phía FE — vẫn có test backend (`main_detect/tests/test_runtime_server.py`) nên không hẳn dead code, nhưng không được FE dùng.
- MJPEG `/api/runtime/cameras/{cam1,cam2}.mjpg` — `MonitorApp.tsx:86` qua `runtimeCameraStreamUrl`; `.jpg` không được FE dùng.

### 4.4 Cổng & đơn vị tọa độ

- `config/gate_zones.json`: `coordinate_space="world"`, `unit="cm"` khớp calibration `two_camera.shared_cm_01.json` (`world.unit="cm"`, schema_version 5). Controller kiểm tra unit runtime ↔ gate config và raise khi lệch (`gate_session_controller.py:405-410` — lỗi rơi vào catch `ValueError` → log "Source unavailable", chạy lại sau 1 s).
- `direction` gate: `get_crossing_direction` dấu dương/âm (`gate_session_controller.py:242-256`); FE `gateLineFromPoints` suy direction từ điểm chấp nhận (`MonitorApp.tsx:37-54`, `side>0 → "negative"` — nhất quán: điểm chấp nhận là phía xe đi tới).
- Legacy `frontend/public/gate_roi.json` thiếu `direction`/`coordinate_space` → mặc định `"positive"`/`"legacy_svg"` (`gate_session_controller.py:199-200, 217`) — chỉ hợp lệ cho file mode.

### 4.5 Danh tính (ID)

- Xe: `global_id` int canonical; alias `retired_global_ids{old→new}` + event `global_id_merged` → cả gate (`remap_global_vehicle_id`, `gate_session_controller.py:343-399`) và FE (`canonicalRuntimeId`, `runtime.ts:191-202`, dùng trong `worldToSvg.ts:117-119`) đều theo chain. `runtimeId` mới = reset toàn bộ tracking state phía gate (`gate_session_controller.py:411-424`) và FE coi session-runtime khác là `runtime_unavailable` (`App.tsx:129-131`) — nhất quán.
- Session: `secrets.token_urlsafe(12)` (`session_manager.py:283`), một active session/GID/runtime (`:273-281`).
- Spot: 60 ID `A01..F10` — FE geometry sinh 6 zone × `SPOTS_PER_ZONE=10` (`domain/parking.ts:6`, `parkingGeometry.ts:160-182`); config runtime cam1 = D/E/F, cam2 = A/B/C (đã đếm trong `config/parking_slots_cam{1,2}.json`). Ownership FE `LEFT_ZONES={F,E,D}→cam-left` (`parking.ts:123, 136-143`) **khớp đúng** phân bố cam1/cam2.

## 5. Mâu thuẫn Docs ↔ Code (đã đối chiếu)

| # | Mức | Mâu thuẫn | Chứng cứ |
|---|---|---|---|
| D1 | **CAO** | Runbook replay **thiếu `--live-mode`**: snapshot replay có `source_mode="replay"` → gate `process_snapshot` return sớm (không tạo session nào) và FE `liveRuntimeError` báo "Nguồn dữ liệu không phải camera realtime". Tức là luồng E2E replay→session→QR→navigation **không chạy theo đúng lệnh docs**. Script `run_runtime_demo.ps1` có cờ này (duy nhất). | `docs/lenh-chay-theo-session.md:124-165` (§6, cả 2 lệnh replay) vs `gate_session_controller.py:103-104, 403`, `runtime.ts:124-125`, `two_camera.py:1746-1750, 2856`; đúng: `run_runtime_demo.ps1:70-71` |
| D2 | **CAO** | Không một `config/sessions/<SESSION>/` nào có `gate_zones.json` (đã liệt kê cả 9 thư mục). §8 chỉ `--gate-config` tới file không tồn tại → `load_gate_config` raise → controller thoát ngay; nếu bỏ flag thì lặng lẽ dùng `config/gate_zones.json` của **live map** → vạch sai tọa độ → không crossing nào → không session. §5 có hướng vẽ nhưng runbook không nói đây là điều kiện bắt buộc cho replay. | `ls config/sessions/*` (thực nghiệm), `docs/lenh-chay-theo-session.md:101-118, 200-205`, `gate_session_controller.py:210-216, 874-879` |
| D3 | Trung | `docs/QR_VEHICLE_SESSION.md` còn nhiều chỗ cũ: QR hiển thị "10 giây" (code: `QR_DISPLAY_SECONDS = 120` + `QR_DISPLAY_MS = 120_000`); lệnh gate dùng `.\backend\.venv\Scripts\python.exe` và đường dẫn `D:\Documents\...\TechGAR_Parking` cũ (venv thật ở `backend\main_detect\.venv`). | `docs/QR_VEHICLE_SESSION.md:5, 43-47` vs `session_manager.py:29`, `EntryQRKiosk.tsx:6`, `lenh-chay-theo-session.md:11-14` |
| D4 | Trung | `MonitorApp` có badge "Replay đồng bộ" **không bao giờ hiển thị**: `liveRuntimeError` đã reject `source_mode=="replay"` trước khi `setSnapshot` — dead branch trong UI. | `MonitorApp.tsx:123-124` vs `:276` |
| D5 | Thấp | CLAUDE.md checklist "QR Kiosk … on `/?session=ALL`" và README TC1 "QR Kiosk ở góc dưới bên phải trang chung": không còn code nào xử lý `session=ALL`; `App.tsx` không render `EntryQRKiosk`; kiosk chỉ ở `/kiosk/entry`. | `main.tsx:17-24`, `EntryQRKiosk.tsx`, grep `ALL` trong `frontend/src` = 0 kết quả |
| D6 | Thấp | CLAUDE.md mô tả gate controller "REST/**WebSocket** API" — toàn bộ là HTTP polling `ThreadingHTTPServer`, không WebSocket. | `gate_session_controller.py:18, 849-852` |
| D7 | Thấp | Ngưỡng off-route: docs (CLAUDE.md, README TC4) ghi ">75px"; code truyền `80` vào `checkIsOffRoute` (default 75 bị override). | `App.tsx:746-750`, `voiceGuidance.ts:95-110` |
| D8 | Thấp | `frontend/AGENTS.md` + skills spec mô tả layout **160 ô** (A01–A30…, ownership theo hàng) — implementation thực tế **60 ô** (6 zone × 10) và ownership theo zone-set. Spec cũ của thế hệ thiết kế trước. | `frontend/AGENTS.md` vs `domain/parking.ts:6, 123-143`, `parkingGeometry.ts:160-165`, config slots cam1/cam2 (60) |
| D9 | Thấp | README "Python 3.9 trở lên" — **minimum chưa xác minh**: `int \| None` trong annotation không phải ràng buộc (mọi file có `from __future__ import annotations`, `runtime_contract.py:3`); venv thực đo Python 3.11.9 (builder-b). README TC dùng `?session=3` dạng số — sessionId giờ là token ngẫu nhiên. | `README.md:30, 127` vs `runtime_contract.py:3, 53`, `session_manager.py:283` |
| D10 | Thấp | `GET /api/runtime/map` và `/api/runtime/events` không có consumer FE — API surface thừa (có test backend). | `runtime_server.py:285-313` vs grep `frontend/src` |
| D11 | Thấp (chưa xác minh) | File mode: đường ra của simulator kết thúc **trùng phương** vạch exit (vd `(840,90)→(1100,90)` nằm trên đoạn y=90, x∈[1050,1150] của `gate_roi.json`) → `get_crossing_direction ≈ 0` → bị reject → nhiều khả năng session file-mode không bao giờ bị xóa. | `gate_roi.json:7-11`, `sample_tracking_simulator.py:41,53` vs `gate_session_controller.py:250-256` — *chỉ phân tích tĩnh, chưa chạy* |

## 6. Điểm mạnh

1. **Contract tập trung một điểm**: `runtime_contract.py` là nguồn duy nhất sinh snapshot; FE + gate dùng chung freshness rule gần-như-y-hệt (±1 s tương lai / 5 s quá khứ, mọi cam online ≤5 s).
2. **Fail-closed nhất quán hai phía**: mất cam/dữ liệu cũ → gate ngừng tạo session, FE tô `unknown` + dừng chỉ dẫn + hiển thị lỗi tiếng Việt rõ ràng.
3. **Idempotency đầy đủ**: `frame_index` dedup + cursor episode (xử lý cùng-frame nhiều lần không lặp tác dụng — `gate_session_controller.py:432-454, 673-699`), `expected_revision`/`action_id` phía session API, GET-stale-reconciliation ở `useVehicleSession` (`:52-93`).
4. **Race-condition được xử lý tử tế**: `_STORE_LOCK` bao cả validate availability (TOCTOU an toàn); mailbox frame latest-only + chỉ encode khi có subscriber (`runtime_server.py:116-139, 173-180`); FE share 1 in-flight request (`App.tsx:247-254`, `runtimeApi.ts:21-36`).
5. **Bền vững lưu trữ**: `atomic_write` + `os.fsync` + `os.replace` cho session file (`session_manager.py:91-112`).
6. **Thiết kế cứu entry-crossing** qua `recent_observed_path` (đo thật, cùng camera+local track, gap ≤1 s) — chặn được cả Kalman-prediction lẫn jump liên cam (`gate_session_controller.py:259-309`).
7. **Vị trí sống không ghi đĩa**: `_LIVE_OBSERVATIONS` in-memory + persist chỉ tại transition (`session_manager.py:32-46, 471-502`; `gate_session_controller.py:552-554`) — giảm I/O.
8. **Vùng runtime theo `runtimeId`**: session cũ của lần chạy trước không nuốt GID mới (`session_manager.py:179-180`, `gate_session_controller.py:411-424`).
9. Test-suite tồn tại cả 3 tầng: `backend/tests/test_gate_session_coordinator.py`, `test_parking_episodes_v2.py`, `test_session_http_v2.py`, `test_vehicle_sessions.py`; `main_detect/tests/test_runtime_contract.py`, `test_runtime_server.py` + ~35 file test tracker; `frontend/src/tests/` 14 file (runtime-freshness, session-*, ownership…). *Chưa chạy.*

## 7. Điểm yếu / rủi ro (ưu tiên × tác động)

| # | Ưu tiên | Rủi ro | Tác động | Chứng cứ |
|---|---|---|---|---|
| R1 | **P1** | **Replay E2E hỏng theo docs** (D1+D2): thiếu `--live-mode` + thiếu gate_zones per-session | Demo/replay không sinh session → toàn bộ kiosk/QR/nav đứng im; rất dễ gặp khi làm theo runbook | mục 5-D1/D2 |
| R2 | **P1** | **Không có reaper session**: session ở NAVIGATING/PARKED/RELOCATING/EXIT_NAVIGATION tồn tại vĩnh viễn nếu xe biến mất mà không cắt EXIT (tracker mất dấu, xe rẽ đường khác, controller restart giữa chừng). File `data/navigation_sessions.json` hiện đã chứa session `EXIT_NAVIGATION` từ 2026-09-05 (~1 tháng tuổi). Reservation của session chết giữ chỗ ô vô hạn cho mọi xe khác (`SPOT_RESERVED`). Giảm nhẹ nhờ `runtimeId` scoping — **trừ session `runtimeId=None` (file mode) khớp mọi runtime**. | Ô đỗ bị "khóa ma" lũy tiến theo thời gian; store phình; UX sai | `session_manager.py` (không có TTL ngoài `list_waiting_sessions`), `data/navigation_sessions.json` (record cũ), `gate_session_controller.py` (không GC) |
| R3 | **P1** | **Không auth/authorization**: cả 2 API `Access-Control-Allow-Origin: *`; `GET /api/sessions` liệt kê mọi `sessionId` → ai trong LAN cũng claim/điều khiển session bất kỳ; `POST /api/runtime/gates` cho phép ghi đè vạch cổng → phá toàn bộ entry/exit detection. `claim` còn cho phép claim session quá hạn QR (expiry chỉ che khỏi kiosk, không chặn claim — `claim_session` không kiểm `qrExpiresAt`). | Spoofing/sabotage trong mạng demo; chấp nhận được cho PoC LAN, không chấp nhận được production | `runtime_server.py:249-251`, `gate_session_controller.py:739-742, 784-786`, `session_manager.py:355-368` |
| R4 | **P2** | **Exit có thể bị lỡ**: đường direct crossing yêu cầu quan sát liên tục `≤1 s` (`observation_is_continuous`); không có cơ chế `recent_observed_path` cho exit như entry. Poll stall >1 s (GC/CPU) hoặc xe chạy nhanh giữa 2 poll với track đứt → session không bị xóa → kết hợp R2. | Session "ma" + QR link sống mãi | `gate_session_controller.py:486-493, 523-535` vs `259-309` |
| R5 | **P2** | **Giả định cùng host/clock**: `published_at` phải nằm trong ±5 s đồng hồ máy chạy controller (tương lai chỉ +1 s). Runtime trên host khác mà clock lệch >1 s → mọi snapshot bị reject. FE cũng vậy (clock trình duyệt). | Không scale multi-host; fail kín đáng | `gate_session_controller.py:121-123`, `runtime.ts:126-128` |
| R6 | **P2** | **Gate config chỉ load lúc khởi động**: đổi cổng qua `/monitor` (POST gates) chỉ có hiệu lực với FE lane graph (poll 1 s) — controller phải restart thủ công, không có reload/SIGHUP. MonitorApp có nhắc "Có thể khởi động Gate Session Controller" nhưng runbook không cảnh báo restart bắt buộc sau khi vẽ lại. | Vận hành sai lệch kín đáng nếu operator vẽ lại cổng giữa chừng | `gate_session_controller.py:874`, `App.tsx:404`, `MonitorApp.tsx:256` |
| R7 | **P2** | **Single-writer file store không có inter-process lock**: `load_sessions`/`save_sessions` atomic trong process nhưng hai instance controller cùng `SESSIONS_FILE` sẽ lost-update. Cũng là giới hạn scale cho cloud (README mode 3 deploy Render). | Corrupt logic khi scale >1 instance | `session_manager.py:156-168` (không flock/msvcrt) |
| R8 | **P3** | **Phụ thuộc affine xấp xỉ cho cổng**: `worldToSvg` fit affine least-squares từ tâm polygon slot → tâm ô SVG (không dùng homography thật). Sai số vài px tại rìa map có thể đẩy vạch cổng FE lệch so với world gate backend — 2 hệ thống cổng (FE lane graph vs backend detection) có thể lệch nhau. | Marker/cổng FE lệch nhẹ so với thực tế backend | `worldToSvg.ts:53-95` |
| R9 | **P3** | **API surface & docs lệch**: `/api/runtime/map`, `/api/runtime/events`, `/api/sessions`, `/navigation_sessions` không có consumer; mục 5 (D4–D11). | Nhiễu bảo trì, sai kỳ vọng người đọc docs | mục 5 |
| R10 | **P3** | **Per-request file I/O**: mọi `GET /api/session/<id>` (500 ms/client) + waiting (250 ms kiosk) + reservations đọc-parse file JSON mỗi lần. Ổn cho vài client demo; đắt khi nhiều kiosk/driver cùng lúc. | Latency tăng tuyến tính số client | `session_manager.py:171-176` gọi `load_sessions()` mỗi request |
| R11 | **P3** | File rác `nul` ở root repo (artifact Windows); `frontend/AGENTS.md` mô tả thế hệ spec khác → dễ làm contributor mới hiểu sai layout. | Nhiễu | `ls` root; mục 5-D8 |

## 8. Đề xuất cải tiến cụ thể

1. **Sửa runbook replay (P1, effort thấp)**: thêm `--live-mode` vào 2 lệnh runtime trong `docs/lenh-chay-theo-session.md` §6/§7 (hoặc thêm `--replay-realtime` như `run_runtime_demo.ps1:70-71`), và bổ sung bước bắt buộc "vẽ `gate_zones.json` per-session (§5) trước §8" + cảnh báo controller phải restart sau khi đổi cổng.
2. **Session reaper (P1)**: thêm TTL — ví dụ đóng/xóa session khi `globalVehicleId` không còn trong `vehicles[]` quá N phút (dùng `identity_lifecycle.state`/`last_seen_time` đã có trong snapshot), hoặc job dọn định kỳ trong vòng poll của coordinator. Ưu tiên giải phóng `targetSpotId` để tránh khóa ô.
3. **Exit recovery path (P2)**: mở rộng `_recent_measured_entry_crossing` cho exit (quét `recent_observed_path` cắt `exit_gate`), hoặc nới `observation_is_continuous` window từ 1 s lên ~2-3 s cho riêng exit vì hậu quả false-positive exit nhỏ hơn session ma.
4. **Harden API (P2)**: bỏ/giới hạn `GET /api/sessions` & `/navigation_sessions` trong production (kiosk chỉ cần `/waiting`); xác thực `qrExpiresAt` trong `claim_session`; hạn chế `POST /api/runtime/gates` (token đơn giản hoặc chỉ localhost); nới CORS theo origin cấu hình.
5. **Runtime freshness không phụ thuộc wall-clock (P2)**: **không** so `captured_at_monotonic_ns` giữa hai máy — monotonic clock của host khác không có nghĩa phía consumer. Cách đúng: consumer tự đo độ tươi bằng **clock cục bộ** tính từ lần cuối nhận `(runtime_id, frame_index)` mới (cursor monotonic) — FE đã có sẵn cơ chế này (`App.tsx:276-285`, `MonitorApp.tsx:110-130`); áp dụng tương tự cho `_fresh_live` phía gate, giữ `published_at` chỉ như lớp kiểm tra phụ.
6. **Reload gate config nóng (P3)**: `POST /api/runtime/gates` đã có sẵn file; cho controller đọc lại khi mtime đổi (mỗi vòng poll) — khử yêu cầu restart.
7. **Endpoint sạch (P3)**: hoặc dùng `/api/runtime/events` cho tab sự kiện monitor thay `recent_events` trong snapshot (giảm payload), hoặc xóa endpoint chết; thêm `GET /api/runtime/map` vào bootstrap FE để render map ngay khi chưa có snapshot đầu.
8. **Docs (P3)**: cập nhật CLAUDE.md (`/?session=ALL` → `/kiosk/entry`; bỏ "WebSocket"; ngưỡng 80px), README (ghi rõ Python tối thiểu — hiện chưa xác minh, venv thực đo 3.11.9 theo builder-b; session id opaque), `docs/QR_VEHICLE_SESSION.md` (120 s, đúng venv path), đánh dấu `frontend/AGENTS.md` + skills spec 160-ô là legacy hoặc đồng bộ lại 60 ô.
9. **Cache session đọc (P3)**: in-memory index `sessionId→session` cập nhật tại mutation thay vì parse file mỗi request (đã có `_LIVE_OBSERVATIONS` làm tiền lệ).
10. **File mode exit (P3)**: chỉnh `gate_roi.json`/path simulator để đoạn qua cổng không trùng phương vạch, hoặc xử lý crossing collinear (đếm điểm cuối vượt mép segment).

## 9. Giới hạn & phần chưa xác minh

- **Không chạy runtime/test/API/dịch vụ/hardware**: không khởi động `runtime_server`/`gate_session_controller`/dev-server, không chạy `pytest`/`vitest`, không gọi HTTP API nào. Đã chạy các lệnh đọc/liệt kê/đếm file (`ls`, `head`, `grep`, inspect JSON bằng `python3 -c`) để kiểm chứng config và đếm slot. Mọi suy luận hành vi runtime (sessions được tạo/xóa, crossing, fail-closed) là **phân tích tĩnh**. Test suite tồn tại (`backend/tests/`, `main_detect/tests/`, `frontend/src/tests/`); riêng suite `main_detect` được builder-b thực thi: `448 passed in 7.88s` (`./.venv/Scripts/python.exe -m pytest -q` — unit test có mock, không phải E2E camera thật); `backend/tests/` và `frontend` tests chưa được thực thi trong phân tích này.
- **D11 (file-mode exit collinear)** là suy luận hình học tĩnh từ `gate_roi.json` + waypoint simulator — cần chạy simulator + controller để xác nhận session thực sự rò.
- **Giả định**: venv `backend/main_detect/.venv` tồn tại theo docs (không kiểm tra filesystem); camera URLs/IP trong docs là ví dụ cấu hình; `frame_timestamps.csv` và raw mp4 trong `experiment_test/output/` không được kiểm tra tồn tại.
- **`two_camera.py` (3333 dòng) chỉ đọc có chọn** quanh snapshot/publisher/parser; logic tracking/GID/ReID bên trong (ngoài phạm vi giao) chưa phân tích sâu — chỉ xác minh tại điểm chạm contract.
- `docs/system-overview.md`, `docs/algorithms-documentation.md` chỉ skim phần kiến trúc — có thể còn mâu thuẫn chưa liệt kê.
- `frontend/docs/*_SPEC.md` (MOCK/ROUTING/LAYOUT…) chưa đối chiếu chi tiết với code — nằm ngoài phạm vi tích hợp runtime.
- Không xác minh được hành vi cloud deploy (Vercel/Render) — chỉ phân tích theo README mục §3 chế độ 3.

---

## 10. Cross-review vòng 1 (builder-a × builder-b × builder-c)

Đối chiếu `.analysis/builder-a.md` (frontend) và `.analysis/builder-b.md` (main_detect backend) với các điểm chạm trong báo cáo này.

### 10.1 Routing exit — ghi theo thực thi builder-a (builder-c không tự xác minh)

- Builder-a **đã thực thi** (bundle esbuild + node, không chỉ đọc tĩnh): `findExitRoute` trả `null` cho **cả 60 ô** vì mọi spot-entry node là sink (cạnh one-way `aisle→spot-entry`, `laneGraph.ts:152-154`); `findExitRouteFromPos` fallback `findExitRoute` chết theo (`routeEngine.ts:174-188`). Comment dòng 206 nói "fallback tính từ Cổng Vào" nhưng code trả `null` — comment lệch code.
- Hệ quả tích hợp (điểm chạm phạm vi builder-c): trong `EXIT_NAVIGATION`, `App.tsx:719-721` chỉ vẽ được tuyến ra khi **có vị trí xe quan sát được** (`findExitRouteFromPos`); khi xe `observed=false`/biến mất, fallback `findExitRoute(LANE_GRAPH, goalSpot)` trả `null` → **không vẽ lối ra**. Backend session vẫn chuyển `EXIT_NAVIGATION` bình thường — bug nằm hoàn toàn phía FE (phạm vi builder-a). `routing.test.ts` chỉ test `findVehicleRoute` → không bắt được.
- Liên quan R4 của report này: nếu xe mất quan sát ngay trước vạch exit, FE không hiển thị tuyến ra VÀ gate cũng có thể lỡ crossing → kép rủi ro session "ma".

### 10.2 QR expiry 120 s — hai phía nhất quán, docs stale

- Builder-a nghi `QR_DISPLAY_MS = 120_000` (`EntryQRKiosk.tsx:6`) và hỏi backend. **Xác nhận: backend cũng 120 s** — `QR_DISPLAY_SECONDS = 120.0` (`session_manager.py:29`) và expiry được nhúng sẵn `qrExpiresAt` lúc `create_session` (`session_manager.py:302-304`). Hai phía khớp; chỉ `docs/QR_VEHICLE_SESSION.md` ghi "10 giây" là stale (bằng chứng di chứng: record cũ trong `data/navigation_sessions.json` có `qrExpiresAt = createdAt + 10 s` — hằng số từng là 10 s).
- Lưu ý phụ (đã ghi ở R3): expiry chỉ che QR khỏi kiosk — `claim_session` không kiểm `qrExpiresAt` (`session_manager.py:355-368`).

### 10.3 Runtime v2 / 60 slot / camera ownership — ba báo cáo đồng thuận

- Builder-a §8.2 kỳ vọng `slot_id = SpotId "A01".."F10"` và ≥3 slot khớp cho affine. **Đã đối chiếu trực tiếp**: config `parking_slots_cam1.json` = D/E/F ×10 (30), `cam2` = A/B/C ×10 (30) → 60 ô khớp 1-1 với geometry FE (6 zone × `SPOTS_PER_ZONE=10`). Builder-b cũng xác nhận 30 slot/cam + ref 1280×720 (`builder-b.md` §5).
- Ownership: FE `LEFT_ZONES={F,E,D}→cam-left` (`parking.ts:123,136-143`) ↔ cam1 phủ đúng D/E/F; A/B/C ↔ cam-right/cam2 — **nhất quán hai chiều**. `runtimeAdapter` ưu tiên `camera_id` của runtime, fallback `getSpotOwner` (`runtimeAdapter.ts:31`) — cùng một partition.
- Schema v2: producer duy nhất `runtime_contract.py:12` (`RUNTIME_SCHEMA_VERSION=2`); cả gate (`gate_session_controller.py:402-403`) và FE (`runtime.ts:120-121`) đều cứng `schema_version===2` — không có kênh v1 nào còn hoạt động ngoài `_sample_snapshot` file mode (vẫn đi đường `allow_legacy` riêng).

### 10.4 Contract session — kỳ vọng builder-a đã được thỏa phía backend

- `revision` monotone + "cùng revision = cùng nội dung": `_mutate_session` chỉ tăng revision khi field thực sự đổi (`session_manager.py:336-346`) → thỏa giả định reject-conflict của FE (`useVehicleSession.ts:71-82`).
- Bộ ba `PARKED` cần `state && parkedSpotId && parkedAt`: `set_parked` set đủ (`session_manager.py:410-417`).
- `runtimeId` gán lúc `create_session` (`session_manager.py:295`) khớp `runtime_id` snapshot — đúng điều kiện FE (`App.tsx:129-131`).
- Waiting list sort `createdAt` tăng (`session_manager.py:217`) → `.at(-1)` của kiosk lấy session mới nhất — đúng giả định FE.
- Alias `globalVehicleId` qua `retired_global_ids`: backend remap (`gate_session_controller.py:343-399`), FE canonicalize (`runtime.ts:191-202`) — đồng thuận.

### 10.5 Điểm chạm builder-b (đã trự kiểm trong phạm vi builder-c)

- `448 passed` suite `main_detect` (builder-b chạy) — bổ sung bằng chứng động cho contract snapshot/gates mà builder-c chỉ phân tích tĩnh.
- `edge_adjacency` cứng `cam1:right→cam2, cam2:left→cam1` (`builder-b.md` §5; `two_camera.py:318-320`) — topology 2-cam hard-coded, bổ sung vào rủi ro mở rộng (xếp cùng nhóm R7-scale).
- Trùng lặp phát hiện với builder-b: CORS `*`/không auth (R3 của report này) — hai phía backend cùng mở, nhất quán nhận định "chấp nhận LAN lab, không chấp nhận production".
- `source_mode`: builder-b ghi `--live-mode` ở `two_camera.py:2856` — khớp phân tích D1 của report này (runbook replay thiếu cờ → gate/FE reject).

### 10.6 Bất đồng/sai lệch giữa các báo cáo

- Không phát hiện mâu thuẫn kết luận trực tiếp giữa 3 report. Điểm cần chỉnh của builder-c (đã sửa vòng này): `/api/runtime/status` không có consumer FE (không phải "được dùng"); `int | None` không suy ra Python ≥3.10 do postponed annotations (venv đo 3.11.9 là môi trường, không phải requirement — builder-b đo đúng là version chạy, không xung đột).
- Builder-a §7 ghi comment `App.tsx:734` "(300ms)" vs thực tế effect theo nhịp `activeVehicles` ~200 ms — trùng quan sát với cadence 200 ms của report này.
