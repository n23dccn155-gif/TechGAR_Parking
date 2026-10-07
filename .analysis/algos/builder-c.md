# builder-c — Dossier thuật toán phạm vi TÍCH HỢP (Phase 1)

**Mục tiêu**: hồ sơ thuật toán cho web học trực quan TechGar2 — phạm vi **tích hợp/vận hành**: gate-session state machine, crossing có hướng + entry rescue/exit continuity, QR issuance/waiting/TTL, snapshot v2 freshness/cursor, polling idempotent/revision/reservation, parked episode + identity remap, replay pairing + prerequisites.

**Nguồn đã tự xác minh trên working tree** (đọc lại trực tiếp, không chỉ dựa index `.analysis/builder-*.md`):
`backend/gate_session_controller.py` (912 d), `backend/session_manager.py` (652 d), `backend/main_detect/src/techgar/runtime_contract.py` (168 d), `backend/main_detect/two_camera.py` (đọc có chọn: ReplaySession 146–263, parser 1731–1759, pacing 2490–2504, publish 2840–2869), `backend/main_detect/runtime_server.py` (20–139), `backend/main_detect/run_two_camera_session.py` (138 d), `backend/main_detect/config/gate_zones.json`, `frontend/src/domain/runtime.ts` (202 d), `frontend/src/api/runtimeApi.ts` (68 d), `frontend/src/components/EntryQRKiosk.tsx` (99 d), `frontend/src/app/App.tsx` (270–289), `frontend/src/hooks/useVehicleSession.ts` (grep 157–160), `frontend/src/api/backendApi.ts` (grep 54).

**Ranh giới**: browser flow/voice/affine/worldToSvg → builder-a; CV/GID-matching/homography/handoff → builder-b. Ở đây chỉ mô tả **consumer-side** (`canonicalRuntimeId` phía FE là của builder-c theo phân chia). API endpoint thuần túy (route table, CORS) không được tính là thuật toán.

**Quy ước**: `[code]` chắc chắn từ code đã đọc; `[docs-mismatch]` docs sai so với code hiện tại; `[bug]` vấn đề thật trong code; `[edu]` tình huống dựng cho mô phỏng giáo dục. Mọi sample là JSON nhỏ, deterministic, chạy độc lập trong browser (không backend/model/network). Đường dẫn tính từ root `D:\TechGar2`.

---

## 0. Inventory

| # | ID | Title | Nhóm | Code chính | Lib ngoài trong code? |
|---|---|---|---|---|---|
| A1 | `snapshot-v2-build` | Chuẩn hóa payload runtime schema v2 | Contract | `runtime_contract.py:37-168` | Không (pure dict) |
| A2 | `camera-age-online-derivation` | Suy ra `age_ms`/`online` từ monotonic ns | Contract | `runtime_contract.py:120-132` | Không |
| A3 | `live-freshness-contract` | Kiểm freshness 4 điều kiện (2 consumer) | Contract | `gate_session_controller.py:103-125`; `runtime.ts:116-141` | Không |
| A4 | `source-mode-live-gating` | Cờ `--live-mode` quyết định `source_mode` + consumer reject | Contract | `two_camera.py:1746-1750, 2856` | Không |
| A5 | `frame-cursor-monotonic-poll` | Cursor `frame_index` monotone + poll/retry/dedupe | Contract | `gate_session_controller.py:426-454, 893-906`; `App.tsx:272-287`; `runtimeApi.ts:4-36` | Không |
| B1 | `segment-intersection-orientation` | Giao cắt đoạn bằng 4 orientation | Crossing | `gate_session_controller.py:229-239` | Không |
| B2 | `directed-crossing-direction` | Chiều cắt qua cross product + direction | Crossing | `gate_session_controller.py:242-256` | Không |
| B3 | `observation-continuity-window` | Cửa sổ liên tục ≤1 s (local + source clock) | Crossing | `gate_session_controller.py:473-493` | Không |
| B4 | `entry-session-creation` | Entry crossing (direct/rescued) → tạo session idempotent | Session | `gate_session_controller.py:498-521`; `session_manager.py:255-313` | `secrets` (CSPRNG) |
| B5 | `measured-path-entry-rescue` | Cứu entry bằng `recent_observed_path` đo thật | Crossing | `gate_session_controller.py:259-309` | Không |
| B6 | `exit-crossing-session-delete` | Exit crossing liên tục → xóa session | Crossing | `gate_session_controller.py:523-535`; `session_manager.py:585-595` | Không |
| C1 | `session-state-machine` | FSM 6 trạng thái + chuyển tiếp | Session | `session_manager.py:255-468, 574-595` | Không |
| C2 | `qr-token-issuance-ttl` | Token, `qrExpiresAt`, waiting sort, kiosk pick; claim không kiểm hạn | Session | `session_manager.py:29, 81-88, 200-217, 283-310, 355-368`; `EntryQRKiosk.tsx:6-68` | `secrets`, `qrcode` (chỉ render) |
| C3 | `revision-optimistic-concurrency` | `expected_revision` + `actionReceipts` idempotent | Session | `session_manager.py:316-352`; `gate_session_controller.py:807-835`; `useVehicleSession.ts:157-160` | Không |
| C4 | `spot-reservation-availability` | Chuỗi validate chọn ô: runtime/reserved/stale/occupied | Session | `gate_session_controller.py:69-178`; `session_manager.py:220-252` | Không |
| C5 | `live-observation-cache` | Cache vị trí nóng tách khỏi persist | Session | `session_manager.py:32-46, 471-502, 565-566, 581` | Không |
| C6 | `atomic-session-store` | Ghi file JSON nguyên tử + load chịu lỗi + RLock | Session | `session_manager.py:91-123, 156-168` | Không |
| D1 | `parking-episode-apply` | Chọn latest episode/gid, owner-conflict, cursor dedup, apply | Episode | `gate_session_controller.py:628-703` | Không |
| D2 | `parked-evidence-dwell-legacy` | Đường v1: dwell `stopped_for_ms` + departure 2 frame | Episode | `gate_session_controller.py:128-144, 556-626` | Không |
| D3 | `identity-alias-remap-backend` | Remap GID qua `retired_global_ids` + merge events | Identity | `gate_session_controller.py:343-399, 463-465`; `session_manager.py:516-571` | Không |
| D4 | `canonical-runtime-id-consumer` | Consumer đi theo dây chuyền alias, chống chu trình | Identity | `frontend/src/domain/runtime.ts:191-202` | Không |
| E1 | `replay-timestamp-pairing` | Ghép cặp frame replay theo `frame_timestamps.csv` | Replay | `two_camera.py:146-263, 2496-2499` | `cv2.VideoCapture` (decode) |
| E2 | `gate-config-validate-save` | Validate/atomic-save gate config + prerequisite world-space | Config | `gate_session_controller.py:190-221, 405-410, 874-880`; `runtime_server.py:25-81` | Không |

**23 thuật toán · 5 nhóm.** Không thuật toán nào trong phạm vi dùng `cv2/numpy/lap` trong phần logic được trích — các điểm dùng lib ngoài chỉ ở I/O (decode mp4, CSPRNG token, render bitmap QR), nêu rõ ở §X.

## 0b. Dedup/ownership theo SPEC

Các dossier khác có ID chạm cùng symbol — bảng alias chuẩn (owner = file này):

| ID trong dossier khác (alias) | ID canonical ở đây | Phạm vi phủ |
|---|---|---|
| A `live-runtime-validator` | `live-freshness-contract` | C phủ cả hai phía: gate `_fresh_live` + FE `liveRuntimeError` |
| A `frame-cursor-guard` | `frame-cursor-monotonic-poll` | C gộp gate `_last_frame_index` + FE `requireLiveRuntime` |
| A `runtime-request-coalesce` | `frame-cursor-monotonic-poll` | FE fetch dedupe/retry là mục con trong A5 |
| A `qr-visibility-window` | `qr-token-issuance-ttl` | C phủ backend TTL/sort + kiosk pick + claim-expiry |
| A `canonical-gid-chain` | `canonical-runtime-id-consumer` | cùng symbol `canonicalRuntimeId` (`runtime.ts:191-202`) |
| B `replay-session-sync` | `replay-timestamp-pairing` | thuật toán pairing/CSV/EOF — owner C; B phủ producer/cv2 context |

---

## Nhóm A — Contract snapshot & freshness

### A1 `snapshot-v2-build` — Chuẩn hóa payload runtime schema v2

- **Nhóm**: Contract · **Prereq**: — · **Related**: `camera-age-online-derivation`, `live-freshness-contract`, `parking-episode-apply`
- **Code**: `backend/main_detect/src/techgar/runtime_contract.py:37-168` — `build_runtime_snapshot`; phụ: `_slot_layout` `:16-34`, hằng `RUNTIME_SCHEMA_VERSION=2` `:12`, `TERMINAL_IDENTITY_STATES` `:13`; call site `two_camera.py:2844-2869`.
- **Vai trò**: producer duy nhất của contract web. Gom output rời rạc (registry identity, parking per-camera, episode, pipeline health) thành 1 JSON object ổn định cho gate + frontend.
- **Input**: `runtime_id:str`, `timestamp/published_at:str ISO`, `frame_index:int`, `registry{map_vehicles, identity_lifecycle, pending_handoffs, retired_global_ids, recent_events, world_unit}`, `parking_by_camera{cam:{slot_id:state}}`, `camera_sizes`, `camera_timestamps_ns`, `calibration`, `camera_skew_ms`, `source_mode`, `parking_episodes`, `pending_parking_confirmations`, `parking_pipeline`, `applied_monotonic_ns?`.
- **Output**: `dict` snapshot v2 (17 khóa, `:134-168`); `vehicles[]` sort tăng theo `global_id`.
- **Pseudocode**:
  1. `slots ← []`; với mỗi `(cam, states)` trong `parking_by_camera`: append `{slot_id, camera_id, **state}` (`:56-65`).
  2. `episodes ← copy(parking_episodes)`; `parked_owners ← {int(gid): slot_id | episode.state=="parked"}` (`:69-70`).
  3. Với mỗi `(gid, identity)` trong `identity_lifecycle`: skip nếu `state ∈ {exited, expired}` (`:75-77`).
  4. `active ← map_vehicles[str(gid)] or map_vehicles[int(gid)] or {}` (`:82-87`).
  5. `position ← active.position or identity.last_world`; skip nếu không phải Mapping (`:88-90`).
  6. `camera_ids ← active.camera_ids or [identity.last_camera]` (`:91-94`).
  7. Build vehicle: `global_id`, `state`, `observed=bool(active)`, `position{x,y,reference=world_unit}`, `parked_slot_id=parked_owners.get(gid)`, `last_seen_frame/time` (`:95-108`).
  8. Nếu `identity.recent_observed_path` là list không rỗng → giữ 12 phần tử cuối làm evidence (`:109-117`).
  9. `clock_ns ← applied_monotonic_ns or max(camera_timestamps_ns)`; build `cameras{}` (A2) (`:120-132`).
  10. Trả dict: schema/runtime/timestamp/`source_mode`/`coordinate_space{unit,bounds,calibration_*}`/`camera_skew_ms`/`cameras`/`parking_slots`/`slot_layout`/`vehicles sorted`/`pending_handoffs`/`parking_episodes`/`pending_parking_confirmations`/`parking_pipeline`/`retired_global_ids`/`recent_events[-100:]` (`:133-168`).
- **Cấu trúc dữ liệu**: flat list `slots`; map `parked_owners: int→str`; `lifecycle` dict; `slot_layout` list `{slot_id,camera_id,polygon}`.
- **Độ phức tạp**: O(S + V log V + E + L + ev) — sort `vehicles` theo `global_id` (`:151`) chiếm V log V; S tổng slot (~60), E episode, L slot_layout, ev events (≤100). Memory O(V + S + E) — payload mới không chỉnh sửa registry.
- **Edge cases / failure modes**:
  - `[code]` key registry có thể str hoặc int → double lookup `:82-87`; nếu bỏ sót, xe live bị `observed=false` sai.
  - `[code]` `position` thiếu → xe bị lọc khỏi snapshot (`:89-90`) → consumer không thấy (không phải `observed=false`).
  - `[edu]` `recent_observed_path` chỉ giữ tail 12 → path dài hơn bị cắt im lặng.
  - `[edu]` `episodes.state=="parked"` trùng gid trên 2 slot → `parked_owners` giữ cái cuối cùng theo thứ tự list (không validate — gate mới chặn ở D1).
- **Sample** (deterministic, fixed `clock_ns=10_000_000_000`):
  ```json
  {
    "runtime_id": "rt-001", "timestamp": "2026-10-04T10:00:01", "published_at": "2026-10-04T10:00:01.500",
    "frame_index": 42, "source_mode": "live", "camera_skew_ms": 40.0,
    "camera_timestamps_ns": {"cam1": 9900000000, "cam2": 9940000000},
    "camera_sizes": {"cam1": [1280,720], "cam2": [1280,720]},
    "registry": {
      "world_unit": "cm",
      "map_vehicles": {"5": {"position": {"x": 400, "y": 60}, "camera_ids": ["cam1"]}},
      "identity_lifecycle": {
        "5": {"global_id": 5, "state": "active", "last_seen_time": 10.0, "last_seen_frame": 42,
              "recent_observed_path": [{"timestamp_s": 9.5, "frame_index": 41, "camera_id": "cam1", "local_track_id": 3, "position": {"x": 402, "y": 55}}]},
        "8": {"global_id": 8, "state": "parked", "last_world": {"x": 300, "y": 200}, "last_camera": "cam2", "last_seen_time": 8.0},
        "9": {"global_id": 9, "state": "exited", "last_world": {"x": 500, "y": 50}}
      },
      "retired_global_ids": {"6": 5}, "recent_events": [{"type": "global_id_merged", "superseded_global_id": 6, "global_id": 5}],
      "pending_handoffs": []
    },
    "parking_by_camera": {"cam1": {"D01": {"occupied": false, "status": "empty"}}, "cam2": {"A01": {"occupied": true, "status": "occupied", "vehicle_id": 8, "tracking_state": "parked", "stopped_for_ms": 4000}}},
    "parking_episodes": [{"parking_episode_id": "ep-1", "global_id": 8, "slot_id": "A01", "state": "parked", "applied_frame_idx": 40, "evidence_frame_idx": 39, "applied_timestamp_s": 8.0, "revision": 3}],
    "calibration": {"world": {"unit": "cm", "bounds": {"w": 1200, "h": 900}}, "calibration_id": "cal-1", "calibration_status": "passed", "parking_slots_world": {"cam1": [{"id": "D01", "polygon": [[1,2],[3,4],[5,6]]}]},
    "applied_monotonic_ns": 10000000000
  }
  ```
  **Expected**: `vehicles` = [gid5 (observed, camera_ids cam1, có recent_observed_path 1 pt), gid8 (observed=false, parked_slot_id="A01")] — gid9 bị loại (exited); `parking_slots` = 2 phần tử có `camera_id` gắn đúng; `cameras.cam1.age_ms` = 100, `cam2.age_ms` = 60, cả hai `online=true` (clock 10e9); `slot_layout` 1 phần tử; `recent_events` giữ nguyên.
- **Storyboard**: canvas trái = cây JSON input collapsible (xám), phải = snapshot v2 card (xanh lá). Bước chạy từng dòng pseudocode 3→8: tô sáng identity đang xử (vàng), xe `exited` gạch đỏ rồi biến mất; `parked_owners` map vẽ đường nối gid8→A01; bảng state realtime: `slots | parked_owners | vehicles | cameras`. Controls: tick chạy từng bước, toggle "bỏ filter terminal" để thấy gid9 xuất hiện. Text VN giải thích "producer duy nhất — consumer không tự suy parked_slot_id".

### A2 `camera-age-online-derivation` — Suy ra `age_ms`/`online` từ monotonic ns

- **Nhóm**: Contract · **Prereq**: `snapshot-v2-build` · **Related**: `live-freshness-contract`
- **Code**: `backend/main_detect/src/techgar/runtime_contract.py:120-132` — dict-comprehension `cameras`; call site truyền `applied_monotonic_ns` ở `two_camera.py:2857`.
- **Vai trò**: biến hai mốc `time.monotonic_ns()` per-camera thành chỉ số sức khỏe (`age_ms`, `online`) mà mọi consumer kiểm lại.
- **Input**: `camera_timestamps_ns: {cam_id → int ns}`, `camera_sizes: {cam_id → (w,h)}`, `clock_ns: int` (đã chọn ở bước 9 của A1).
- **Output**: `{cam_id → {camera_id, width, height, captured_at_monotonic_ns, age_ms:float, online:bool}}`.
- **Pseudocode**:
  1. `clock_ns ← applied_monotonic_ns ?? max(camera_timestamps_ns.values(), default=0)`.
  2. Với mỗi `cam_id, (w,h)`: `captured ← ts.get(cam_id, 0)`.
  3. `age_ms ← max(0, (clock_ns − captured)/1e6)`.
  4. `online ← captured > 0 AND 0 ≤ (clock_ns − captured) ≤ 5_000_000_000`.
  5. Emit object theo `cam_id`.
- **Cấu trúc dữ liệu**: hai dict keyed cam_id; scalar ns.
- **Độ phức tạp**: O(C) thời gian, O(C) memory — C=2 camera.
- **Edge cases / failure modes**:
  - `[code]` `captured=0` → `online=false`, `age_ms=clock_ns/1e6` (rất lớn) — camera chưa từng capture.
  - `[code]` timestamp tương lai (`clock−captured <0`) → `age_ms` clamp 0 nhưng `online=false` (diff<0) — nhất quán "online yêu cầu 0 ≤ diff".
  - `[edu]` replay: `applied_monotonic_ns = max(capture_ts)` → age luôn ~0 → luôn online nếu có frame.
  - `[code]` monotonic ns chỉ có nghĩa cùng host — consumer **không được** so `captured_at_monotonic_ns` giữa 2 máy (đã sửa trong review C §10.6); consumer chỉ đọc `age_ms/online` đã tính sẵn.
- **Sample**:
  ```json
  {
    "clock_ns": 10100000000,
    "camera_timestamps_ns": {"cam1": 10000000000, "cam2": 9940000000, "cam3": 0},
    "camera_sizes": {"cam1": [1280,720], "cam2": [1280,720], "cam3": [640,480]}
  }
  ```
  **Expected**: cam1 `age_ms=100, online=true`; cam2 `age_ms=160, online=true`; cam3 `age_ms=10100, online=false`. Thêm case `clock=10.2e9, cam1=4.0e9` → diff 6.2e9 > 5e9 → `age_ms=6200, online=false`.
- **Storyboard**: trục timeline ns nằm ngang; mỗi camera là một vạch `captured` (xanh), marker `clock_ns` (đỏ) trượt; khoảng cách hiển thị `age_ms`; vùng cho phép 0–5000 ms tô xanh nhạt, ngoài vùng vạch chuyển đỏ + badge OFFLINE. Controls: slider clock_ns, nút inject `captured=0`/`captured>clock`. Bảng realtime: `captured | diff_ns | age_ms | online`. Dòng pseudo highlight bước 3–4.

### A3 `live-freshness-contract` — Kiểm freshness 4 điều kiện (hai consumer)

- **Nhóm**: Contract · **Prereq**: `snapshot-v2-build`, `camera-age-online-derivation` · **Related**: `source-mode-live-gating`, `frame-cursor-monotonic-poll`
- **Code**: `backend/gate_session_controller.py:103-125` — `_fresh_live` (+ `runtime_id` bắt buộc ở `:403`); `frontend/src/domain/runtime.ts:116-141` — `liveRuntimeError`.
- **Vai trò**: cùng một rule được implement 2 lần (Python + TS) — "dữ liệu có đủ tươi và đúng nguồn để tin không". Gate fail → skip snapshot; FE fail → báo lỗi VN + đánh dấu `unknown`.
- **Input**: `snapshot: dict/RuntimeSnapshot` (+ `now` cục bộ). **Output**: gate `bool`; FE `string|null` (thông báo lỗi).
- **Pseudocode** (chung, khác biệt chú thích):
  1. `schema_version == 2`? (gate: check ở `:402` trong `process_snapshot`; FE `:120-121`). Không → reject.
  2. `source_mode == "live"`? (`gate:104`, `runtime.ts:123-125`). Không → reject.
  3. `cameras` là dict/object **không rỗng** (`gate:107-109`, `runtime.ts:130-133`).
  4. Với mọi camera: `online == true` và `age_ms` finite trong `[0, 5000]` (`gate:110-120`, `runtime.ts:134-139`).
  5. `age ← now_local − parse(published_at)`; yêu cầu `−1.0 ≤ age ≤ 5.0` giây (gate `:121-123`; FE `nowMs−publishedAt < −1000 || > 5000` → reject, `:126-128`).
  6. Gate thêm: `runtime_id` truthy (`:403`); parse lỗi → `except → False` (`:124-125`).
- **Cấu trúc dữ liệu**: scalar flags; dict cameras; ISO string → epoch.
- **Độ phức tạp**: O(C) — C=2.
- **Edge cases / failure modes**:
  - `[bug/design]` đồng hồ host lệch >1 s (runtime ở máy khác, browser NTP lệch) → reject toàn bộ — rủi ro R5 báo cáo C. Không phải lỗi code; là giả định cùng clock.
  - `[code]` `published_at` sai format → gate `except → False`; FE `!isFinite → reject` — cả hai fail-closed.
  - `[code]` camera thiếu `age_ms` → `float(None)` raise → gate False; FE `Number(undefined)=NaN` → reject.
  - `[edu]` `source_mode="replay"` → reject ngay bước 2 (liên kết A4, docs-mismatch runbook).
- **Sample** (inject `now = 2026-10-04T10:00:02.000Z`; base chung cho mọi case):
  ```json
  {
    "schema_version": 2, "runtime_id": "rt-001", "source_mode": "live",
    "cameras": {"cam1": {"online": true, "age_ms": 120}, "cam2": {"online": true, "age_ms": 0}},
    "variants": [
      {"id": "happy_z",        "published_at": "2026-10-04T10:00:01.500Z"},
      {"id": "same_instant+07","published_at": "2026-10-04T17:00:01.500+07:00"},
      {"id": "wrong_tz",       "published_at": "2026-10-04T10:00:01.500+07:00"},
      {"id": "future_1.5s",    "published_at": "2026-10-04T10:00:03.500Z"},
      {"id": "old_7s",         "published_at": "2026-10-04T09:59:55.000Z"}
    ]
  }
  ```
  **Expected** (đã tính bằng script local): `happy_z` age=+0.5 s → **accept**; `same_instant+07` là **cùng instant** (=10:00:01.5Z) → accept — offset `+07:00` được parse đúng; `wrong_tz` nhìn giống giờ địa phương nhưng là instant khác (=03:00:01.5Z) → age=25200.5 s → **reject** — bẫy timezone phổ biến; `future_1.5s` age=−1.5 s (<−1) → reject; `old_7s` age=7.0 s (>5) → reject. Biến thể còn lại reject ở đúng bước: `cam2.online=false` / `age_ms=5200` (bước 4), `source_mode="replay"` (bước 2), `cameras={}` (bước 3), `schema_version=1` (bước 1).
- **Storyboard**: trục thời gian với cửa sổ cho phép `[now+1s … now−5s]` tô xanh; chip `published_at` trượt theo slider "lệch clock"; 4 checkbox điều kiện (schema/source_mode/cameras/window) sáng xanh/đỏ từng cái; toggle "Python _fresh_live | TS liveRuntimeError" hiển thị cùng kết quả + chuỗi lỗi VN của FE. Bảng realtime: mỗi điều kiện → pass/fail + giá trị đo. Controls: slider clock-skew, dropdown chọn biến thể fail.

### A4 `source-mode-live-gating` — Cờ `--live-mode` quyết định `source_mode` + consumer reject

- **Nhóm**: Contract · **Prereq**: `replay-timestamp-pairing` · **Related**: `live-freshness-contract`
- **Code**: `backend/main_detect/two_camera.py:2856` — `source_mode="live" if (getattr(args, "live_mode", False) or replay is None) else "replay"`; argparse `--live-mode` `:1746-1750`; `--replay-realtime` `:1737-1738`; wrapper `run_two_camera_session.py:95-126`.
- **Vai trò**: một bit trạng thái điều khiển toàn bộ chuỗi session: replay với `--live-mode` được nhận như camera thật; không có cờ → snapshot mang nhãn "replay" → gate/FE reject ở A3 → **E2E không tạo session**.
- **Input**: `args.live_mode: bool`, `replay: ReplaySession|None`. **Output**: `source_mode ∈ {"live","replay"}` trong snapshot (A1 bước 10).
- **Pseudocode**:
  1. `if live_mode OR replay is None → source_mode="live"`.
  2. `else → "replay"`.
  3. (Phụ) `--replay-realtime` pace vòng lặp theo timestamp ghi: `due = wall_started + (src_now − src_started)`; sleep tới `due` (`:2496-2499`).
  4. Consumer: A3 bước 2 reject nếu `source_mode != "live"`.
- **Cấu trúc dữ liệu**: flag bool + chuỗi enum.
- **Độ phức tạp**: O(1); memory O(1).
- **Edge cases / failure modes**:
  - `[docs-mismatch]` runbook `docs/lenh-chay-theo-session.md:124-165` §6 replay **thiếu `--live-mode`** → session không sinh — lỗi docs thật (C §5-D1), không phải bug code.
  - `[code]` `--live-mode` + replay vẫn giữ `published_at=now` → freshness pass; nhưng `captured_at` là timestamp ghi — `age_ms` ≈0 → pass cả A2.
  - `[edu]` `--replay-realtime` chỉ chỉnh nhịp, **không** đổi `source_mode` — hai cờ độc lập.
- **Sample**:
  ```json
  {"args": {"live_mode": false, "replay_realtime": true}, "replay": "session_2026_09_05"}
  ```
  **Expected**: `source_mode="replay"` → A3 reject bước 2 ("Nguồn dữ liệu không phải camera realtime"). Với `live_mode=true` → `"live"` → tiếp tục kiểm tra freshness. Pacing: `src=60.0s, src_started=0, wall_started=100` → `due=160` → sleep khi `wall<160`.
- **Storyboard**: panel trái: hai toggle `[--live-mode]` `[--replay-realtime]` + label replay/live; mũi tên → hộp snapshot hiện `source_mode`; hai consumer card (Gate :8000, FE) hiện verdict xanh/đỏ + dòng lỗi. Khi toggle live-mode bật mà vẫn replay: banner "demo/demo-mode — nhận như live". Bảng realtime: flag → source_mode → verdict từng consumer. Text VN: "cờ này là điểm nghẽn E2E số 1 trong runbook".

### A5 `frame-cursor-monotonic-poll` — Cursor `frame_index` monotone + poll/retry/dedupe

- **Nhóm**: Contract · **Prereq**: `live-freshness-contract` · **Related**: `parking-episode-apply` (cursor tương tự), `canonical-runtime-id-consumer`
- **Code**: `backend/gate_session_controller.py:426-454` (`frame_index` cursor + same-frame), `:893-906` (poll loop + retry), `:706-712` (`urlopen timeout=3.0`); `frontend/src/app/App.tsx:272-287` (`requireLiveRuntime`); `frontend/src/api/runtimeApi.ts:4-36` (`pendingSnapshot` dedupe + `retryAfter` 2 s).
- **Vai trò**: polling 4–5 Hz theo HTTP không có ordering guarantee — cursor `frame_index` chặn xử lý lùi và ghi nhận "cùng frame nhưng có episode mới" (background vision publish).
- **Input**: chuỗi `snapshot{frame_index, runtime_id, ...}` theo poll; cục bộ `last_frame_index/cursor`. **Output**: quyết định process / drop / episode-only.
- **Pseudocode** (gate):
  1. `frame_index ← int(snapshot.frame_index) if số else None` (`:426-431`).
  2. `same_frame ← frame_index == last_frame_index` (`:432-436`).
  3. `frame_index < last_frame_index` → `return` (drop stale) (`:437-442`).
  4. `last_frame_index ← frame_index` (`:443-444`); `_remember_runtime_snapshot` (`:445`); alias+merge+episodes (`:446-449`).
  5. `same_frame` → `return` — **bỏ qua evidence chuyển động** nhưng episode đã áp (`:450-454`).
  6. Xử lý `vehicles[]` (crossing/parked).
  (poll loop `:893-906`) 7. fetch timeout 3 s; exception → log + `sleep max(poll,1.0)`; else `sleep(poll=0.25)`.
  (FE `App.tsx:272-287`) 8. `runtime_id` đổi → reset cursor; `frame_index < cursor` → throw; `frame_index > cursor` → cập nhật cursor + `progressAt=now`; else `now−progressAt > 5000` → throw "không có frame mới".
  (FE `runtimeApi.ts:21-36`) 9. `retryAfter` chưa qua → reject nhanh lỗi cũ; `pendingSnapshot` tồn tại → share; lỗi → `retryAfter=now+2000`.
- **Cấu trúc dữ liệu**: `last_frame_index:int|None`; `runtimeCursorRef{runtimeId,frameIndex}`; `runtimeProgressAtRef`; `pendingSnapshot:Promise|null`; `retryAfter:int`.
- **Độ phức tạp**: O(1) mỗi poll (ngoài xử lý snapshot); memory O(1).
- **Edge cases / failure modes**:
  - `[code]` runtime restart → `runtime_id` mới → gate reset **toàn bộ** cursors/positions/candidates (`:411-424`) — tránh kẹt cursor của đời cũ.
  - `[code]` `frame_index` không phải số → `None` → không dedup được (vẫn process mỗi poll) — legacy tolerance.
  - `[code]` snapshot poll đến trễ (HTTP buffered) không làm lùi `frame_index`, nhưng evidence xe cũ bị skip bởi `source_time` (`:480-482`) — hai lớp chống stale.
  - `[edu]` mất frame trong 5 s nhưng poll vẫn 200 → FE báo "Camera không có frame mới trong 5 giây" dù snapshot fetch thành công.
- **Sample** (gate, chuỗi poll trên cùng runtime rt-1, mỗi phần tử 1 poll):
  ```json
  [
    {"frame_index": 10, "vehicles": [{"global_id": 5, "position": {"x": 400, "y": 60}, "observed": true}]},
    {"frame_index": 10, "parking_episodes": [{"parking_episode_id": "ep-1", "global_id": 5, "slot_id": "D01", "state": "parked", "applied_frame_idx": 10, "evidence_frame_idx": 9, "applied_timestamp_s": 5.0, "revision": 1}], "vehicles": []},
    {"frame_index": 11, "vehicles": [{"global_id": 5, "position": {"x": 410, "y": 62}, "observed": true}]},
    {"frame_index": 10, "vehicles": [{"global_id": 5, "position": {"x": 0, "y": 0}, "observed": true}]},
    {"frame_index": 11, "vehicles": [{"global_id": 5, "position": {"x": 410, "y": 63}, "observed": true}]}
  ]
  ```
  **Expected**: poll1 process frame 10; poll2 same-frame → chỉ áp episode (D1) rồi return — không đếm crossing; poll3 process 11; poll4 `10<11` → drop (không đụng vehicles); poll5 same-frame → episode-only. `last_frame_index` cuối = 11. FE side: poll4 sẽ throw "frame cũ hơn".
- **Storyboard**: băng conveyor các thẻ snapshot đi vào cửa "cursor"; mỗi thẻ đổi màu theo verdict (xanh process / vàng episode-only / đỏ drop); đồng hồ `progressAt` chạy; lane phụ hiển thị poll timer 250 ms + vùng retry 2 s khi fetch lỗi. Bảng realtime: `incoming frame_index | last | same_frame | verdict`. Controls: inject out-of-order, inject stale, toggle runtime restart (runtime_id đổi → reset cursor). Dòng pseudo 1–5 highlight tuần tự.

---

## Nhóm B — Crossing hình học & continuity

### B1 `segment-intersection-orientation` — Giao cắt đoạn bằng 4 orientation

- **Nhóm**: Crossing · **Prereq**: — · **Related**: `directed-crossing-direction`, `measured-path-entry-rescue`
- **Code**: `backend/gate_session_controller.py:229-239` — `check_line_intersection` (closure `orientation`).
- **Vai trò**: nguyên thủy hình học quyết định "đoạn di chuyển p1→p2 của xe có cắt đoạn cổng p3→p4 không".
- **Input**: 4 điểm `{x:float,y:float}`. **Output**: `bool`.
- **Pseudocode**:
  1. `orient(a,b,c) = (b.x−a.x)(c.y−a.y) − (b.y−a.y)(c.x−a.x)`.
  2. `o1=orient(p1,p2,p3)`, `o2=orient(p1,p2,p4)`, `o3=orient(p3,p4,p1)`, `o4=orient(p3,p4,p2)`.
  3. `return o1·o2 ≤ 0 AND o3·o4 ≤ 0`.
- **Cấu trúc dữ liệu**: 4 scalar cross-product.
- **Độ phức tạp**: O(1) — 4 phép nhân trừ mỗi orientation; memory O(1).
- **Edge cases / failure modes**:
  - `[code]` `≤0` chứ không `<0` → chạm đầu mút tính là cắt **khi** orientation về đúng 0 — với tọa độ dyadic (đuôi .5) residual = 0 chính xác (đã verify).
  - `[code đã verify]` điểm nằm trên vạch nhưng tọa độ không dyadic → orientation residual ±1e-14 có thể lật dấu tích → `intersect=False` dù toán học nằm trên đường. Đây là quirk float thật của implementation — demo phải hiển thị, không sửa.
  - `[code]` hai đoạn collinear chồng lấp: toán học mọi orient=0 → True; **fixture cụ thể của sample** trả **False** do residual float ±1e-14 — kết quả phụ thuộc tọa độ, input khác có thể về đúng 0 → True; không suy rộng thành "collinear luôn bị loại".
- **Sample**:
  ```json
  {
    "gate": {"p1": {"x": 40, "y": 9}, "p2": {"x": 39, "y": -6}},
    "moves": [
      {"id": "cross",     "p": [{"x": 35, "y": 0}, {"x": 45, "y": 0}]},
      {"id": "miss",      "p": [{"x": 35, "y": 0}, {"x": 38, "y": 0}]},
      {"id": "touch",     "p": [{"x": 35, "y": 0}, {"x": 39.5, "y": 1.5}]},
      {"id": "collinear", "p": [{"x": 39.9, "y": 7.5}, {"x": 39.3, "y": -1.5}]}
    ]
  }
  ```
  **Expected** (đã tính bằng script local): `cross` → **True** (orient −66, 84, 90, −60, dấu đổi cả hai cặp); `miss` → **False** (o1·o2 = −66·−21 > 0 — cùng phía); `touch` → **True**: đầu cuối (39.5, 1.5) nằm đúng trên vạch (tham số t=0.5 của đoạn gate), orient tương ứng = 0.0 chính xác → tích = 0 ≤ 0; `collinear` → **False** trên tọa độ này: hai điểm đều nằm trên đường gate (t=0.1 và t=0.7) nhưng residual float ±1e-14 làm tích o1·o2 > 0 — quirk đã verify, giữ nguyên làm case học.
- **Storyboard**: SVG vạch cổng xanh dương; đoạn move (mũi tên vàng) kéo bằng drag; 4 giá trị `o1..o4` cập nhật realtime với dấu +/−; verdict lớn ở góc. Controls: kéo điểm đầu/cuối của move, preset 4 case. Bảng realtime: orient ×4 → product → bool. Dòng pseudo 1–3 theo từng tick.

### B2 `directed-crossing-direction` — Chiều cắt qua cross product + direction

- **Nhóm**: Crossing · **Prereq**: `segment-intersection-orientation` · **Related**: `entry-session-creation`, `exit-crossing-session-delete`, `gate-config-validate-save`
- **Code**: `backend/gate_session_controller.py:242-256` — `get_crossing_direction`, `_crossed_in_valid_direction`; gate config `gate_zones.json` entry `positive`, exit `negative`.
- **Vai trò**: biến giao cắt hình học thành sự kiện có hướng — cùng một vạch, đi vào ≠ đi ra.
- **Input**: `p_old,p_new`, `gate{p1,p2,direction∈{positive,negative}}`. **Output**: `bool`.
- **Pseudocode**:
  1. Nếu `!check_line_intersection(old,new,g.p1,g.p2)` → False.
  2. `v ← new−old`; `g ← g.p2−g.p1`; `d ← v.x·g.y − v.y·g.x` (cross 2D v×g).
  3. `|d| < 1e-9` → False (song song/trùng phương).
  4. `direction=="positive"` → `d>0`; `"negative"` → `d<0`.
- **Cấu trúc dữ liệu**: vector 2D, scalar có dấu.
- **Độ phức tạp**: O(1); memory O(1).
- **Edge cases / failure modes**:
  - `[bug/giả định]` đoạn di chuyển **trùng phương** vạch (collinear) → `d≈0` → reject — đúng logic, nhưng làm lỡ exit trong file-mode khi path simulator nằm đúng trên vạch (C §5-D11, chưa chạy xác minh).
  - `[code]` dấu `d` phụ thuộc thứ tự p1→p2 của gate — đổi đầu vạch là đảo nghĩa `positive`. Đây là lý do `direction` nằm trong config, không suy ra được.
  - `[edu]` đi ngược chiều (quay đầu sau khi vào) → reject → không tạo/không xóa session.
- **Sample** (gate = entry của `gate_zones.json:6-17`, direction positive; vector gate g = (−0.8003, −14.9027)):
  ```json
  {
    "gate": {"p1": {"x": 39.6688, "y": 8.9029}, "p2": {"x": 38.8685, "y": -5.9998}, "direction": "positive"},
    "cases": [
      {"id": "into",              "old": {"x": 44, "y": 1},       "new": {"x": 36, "y": 1}},
      {"id": "outof",             "old": {"x": 36, "y": 1},       "new": {"x": 44, "y": 1}},
      {"id": "collinear_on_gate", "old": {"x": 39.50874, "y": 5.92236}, "new": {"x": 39.02856, "y": -3.01926}},
      {"id": "parallel_off",      "old": {"x": 44, "y": 8},       "new": {"x": 43.1997, "y": -6.9027}}
    ]
  }
  ```
  **Expected** (đã tính bằng script local): `into` → intersect=True, d=**+119.22** → accept (dấu `+` khớp `positive`); `outof` → intersect=True, d=**−119.22** → reject (sai chiều); `collinear_on_gate` → hai điểm nằm đúng đường gate (t=0.2, t=0.8), d=0.000000 (v = 0.6·g) → reject: intersect=False do residual (B1) và `|d|<1e-9` — loại kép; `parallel_off` → v = g nguyên vẹn (−0.8003, −14.9027), d=0.000000 nhưng đường song song lệch → intersect=False → reject ngay bước 1. Cho học viên đổi `direction` và thấy verdict `into/outof` đảo.
- **Storyboard**: vạch cổng với mũi tên normal (hướng "positive" hiển thị bằng mũi tên xoay); xe là chấm chuyển động qua lại khi scrub slider t; hiển thị `d` có dấu to bên cạnh; flash xanh khi accept/đỏ khi reject; toggle `direction` đảo màu vùng accept. Bảng realtime: `v`, `g`, `d`, `|d|≥1e-9?`, `sign khớp direction?` → verdict. Dòng pseudo 2–4.

### B3 `observation-continuity-window` — Cửa sổ liên tục ≤1 s (hai clock)

- **Nhóm**: Crossing · **Prereq**: `frame-cursor-monotonic-poll` · **Related**: `entry-session-creation`, `exit-crossing-session-delete`
- **Code**: `backend/gate_session_controller.py:473-493` — khối `observed/source_time/observation_is_continuous`; cập nhật `:537-543`.
- **Vai trò**: chỉ evidence liên tục mới được tính crossing — lọc jump (track mới xuất hiện xa vạch, Kalman jump, poll stall) mà vẫn cho phép mẫu chậm ≤1 s.
- **Input**: `vehicle{observed, last_seen_time}`, `previous_position`, `previous_observed_at` (monotonic cục bộ), `previous_source_time`, `now`. **Output**: `observation_is_continuous:bool` + skip-stale flag.
- **Pseudocode**:
  1. `source_time ← float(vehicle.last_seen_time) nếu finite else None` (`:476-478`).
  2. Nếu `observed AND source_time ≤ previous_source_time` → `continue` (evidence cũ trong snapshot mới) (`:480-482`).
  3. `source_is_continuous ← source_time is None OR (prev_source ≠ None AND 0 < gap ≤ 1.0)` (`:483-485`).
  4. `observation_is_continuous ← observed AND previous_position ≠ None AND prev_observed_at ≠ None AND (now − prev_observed_at) ≤ 1.0 AND source_is_continuous` (`:486-493`).
  5. (Sau xử lý) `observed` → cập nhật `previous_position`, `prev_observed_at=now`, `prev_source=source_time`; nếu `source_time is None` → xóa `prev_source` (`:537-543`).
- **Cấu trúc dữ liệu**: hai map `gid→float` (local monotonic, source ts); `previous_positions: gid→point`.
- **Độ phức tạp**: O(1)/xe; memory O(1).
- **Edge cases / failure modes**:
  - `[code]` `observed=false` → `prev_observed_at` **không** cập nhật → lần quan sát lại sau >1 s là discontinuous → crossing bị bỏ qua (fail-safe, nhưng cũng là nguyên nhân lỡ exit — R4).
  - `[code]` `source_time=None` (snapshot thiếu `last_seen_time`) → `source_is_continuous` mặc định true → chỉ còn rào local 1 s — chuỗi yếu hơn.
  - `[code]` poll stall >1 s (GC/CPU) → `now−prev>1` → discontinuous → lỡ crossing dù xe đi đúng — R4.
  - `[bug/design]` xe teleport (nhảy xa giữa 2 observation) vẫn continuous theo công thức — **không có rào quãng đường/tốc độ** → nếu đoạn teleport tình cờ cắt vạch đúng chiều, hệ thống ghi nhận crossing giả (tạo/xóa session sai). Demo: drag xe nhảy qua vạch → session sinh ra dù xe không đi qua thật.
- **Sample** (1 xe gid=5, `now` tăng theo poll, entry gate như B2; `prev_observed_at`/`prev_source` khởi None):
  ```json
  [
    {"t_local": 10.0, "observed": true, "last_seen_time": 50.0, "position": {"x": 44, "y": 1}},
    {"t_local": 10.25, "observed": true, "last_seen_time": 50.2, "position": {"x": 36, "y": 1}},
    {"t_local": 10.5, "observed": true, "last_seen_time": 50.2, "position": {"x": 30, "y": 1}},
    {"t_local": 12.0, "observed": true, "last_seen_time": 50.4, "position": {"x": 20, "y": 1}},
    {"t_local": 12.25, "observed": true, "last_seen_time": 50.6, "position": {"x": 10, "y": 1}}
  ]
  ```
  **Expected** (đã mô phỏng bằng script port 1-1):

  | poll | t_local | src | verdict | prev sau poll |
  |---|---|---|---|---|
  | 1 | 10.0 | 50.0 | discontinuous — `prev=None`, đặt baseline | pos(44,1), obs@10.0, src 50.0 |
  | 2 | 10.25 | 50.2 | **continuous** (local 0.25, src gap 0.2) → kiểm crossing (44→36 cắt, hướng `into`) | pos(36,1), obs@10.25, src 50.2 |
  | 3 | 10.5 | 50.2 | **STALE-SKIP** — `50.2 ≤ prev_src 50.2` → `continue`, **không update gì** | giữ nguyên (obs@10.25, src 50.2) |
  | 4 | 12.0 | 50.4 | discontinuous — `now−prev_obs = 12.0−10.25 = 1.75 > 1`; **vẫn update** (observed) | pos(20,1), obs@12.0, src 50.4 |
  | 5 | 12.25 | 50.6 | **continuous** (local 0.25, src gap 0.2) | pos(10,1), obs@12.25, src 50.6 |

  Điểm dạy: baseline được cập nhật kể cả khi discontinuous (poll4), nhưng stale-skip thì không (poll3 — local gap ở poll4 đo từ 10.25, không phải 10.5).
- **Storyboard**: hai đồng hồ nhỏ (local monotonic xám, source clock xanh dương) + timeline các tick quan sát; thanh đo `gap` tô xanh ≤1 s/đỏ >1 s; chip `observed=false` tắt nửa trong suốt; khi reject ở bước 2: biểu tượng "stale" màu cam. Bảng realtime: `observed | local_gap | source_gap | source_is_cont | obs_is_cont`. Controls: slider stall, toggle missing `last_seen_time`. Dòng pseudo 1–5.

### B4 `entry-session-creation` — Entry crossing → tạo session idempotent

- **Nhóm**: Session · **Prereq**: `directed-crossing-direction`, `observation-continuity-window`, `measured-path-entry-rescue` · **Related**: `session-state-machine`, `qr-token-issuance-ttl`
- **Code**: `backend/gate_session_controller.py:498-521` — `direct_entry_crossing`/`recovered_entry_crossing`/`create_session`; `backend/session_manager.py:255-313` — `create_session` (dedup `:273-281`, token `:283`, payload `:289-310`).
- **Vai trò**: chuyển sự kiện vật lý "xe cắt cổng vào đúng chiều" thành một session logic duy nhất per (gid, runtime) — đầu mối toàn bộ luồng QR.
- **Input**: `vehicle{global_id, position, observed, recent_observed_path}`, `previous_position`, `entry_gate`, `runtime_id`. **Output**: `session_id:str` (mới hoặc hiện có).
- **Pseudocode**:
  1. `direct ← obs_is_cont AND crossed_in_valid_direction(prev, pos, entry_gate)` (`:498-503`).
  2. `rescued ← observed AND session=None AND measured_path_rescue(vehicle, entry_gate, source_time) ≠ None` (`:504-513`).
  3. `if direct OR rescued`: `if session=None → sid = create_session(gid, runtime_id)` (`:514-520`).
  4. Trong `create_session`: quét sessions; nếu đã có session mở (state≠CLOSED) cùng gid+runtime → trả `sessionId` hiện có (`:273-281`).
  5. Else `sid = secrets.token_urlsafe(12)`; collision → raise (`:283-285`); ghi session `WAITING_FOR_SCAN`, `revision=1`, `qrExpiresAt=created+120 s` (`:289-310`); save.
- **Cấu trúc dữ liệu**: `previous_positions` map; session dict; `_STORE_LOCK`.
- **Độ phức tạp**: O(N_sessions) cho dedup scan trong `create_session` + O(P log P) rescue path (P ≤ 12, xem B5); memory O(N) khi load store.
- **Edge cases / failure modes**:
  - `[code]` cắt cổng 2 lần (xe lùi-vào-lại) → dedup trả cùng sid → không nhân bản QR.
  - `[code]` session từ runtime cũ (`runtimeId` khác) → `_matches_runtime` false → tạo session mới; session `runtimeId=None` khớp mọi runtime (`:179-180`) — R2 edge.
  - `[edu]` GID đổi sau merge → session cũ gắn gid cũ vẫn được rescue/remap ở D3 trước khi dedup tìm gid mới.
- **Sample** (2 poll liên tiếp, đã qua B3 continuous; entry gate B2; `create_session` chạy trong store mô phỏng):
  ```json
  {
    "runtime_id": "rt-1",
    "polls": [
      {"vehicle": {"global_id": 5, "observed": true, "position": {"x": 44, "y": 1}}, "note": "baseline"},
      {"vehicle": {"global_id": 5, "observed": true, "position": {"x": 36, "y": 1}, "recent_observed_path": []}},
      {"vehicle": {"global_id": 5, "observed": true, "position": {"x": 30, "y": 1}}}
    ]
  }
  ```
  **Expected**: poll2 → `direct=True`, `session=None` → `create_session` → `sid="Ab3x..."` WAITING_FOR_SCAN rev1 `qrExpiresAt=+120 s`; poll3 → không crossing (không cắt vạch); nếu poll2 lặp lại (re-poll cùng frame) → dedup trả **cùng sid**.
- **Storyboard**: bản đồ mini 2D: vạch entry xanh dương, xe chấm đỏ trượt; khi cắt → flash vàng + thẻ session trượt vào cột phải hiển thị `sessionId | state | gid | qrExpiresAt`; nút "replay poll" chứng minh dedup trả cùng id (counter `created_count` vẫn =1). Bảng realtime: `direct | rescued | session? | sid`. Dòng pseudo 1–5. Giải thích VN: "cắt cổng chỉ tạo session, không claim".

### B5 `measured-path-entry-rescue` — Cứu entry bằng `recent_observed_path`

- **Nhóm**: Crossing · **Prereq**: `directed-crossing-direction`, `observation-continuity-window` · **Related**: `entry-session-creation`
- **Code**: `backend/gate_session_controller.py:259-309` — `_recent_measured_entry_crossing`.
- **Vai trò**: track tentative vài frame → GID có thể xuất hiện *sau khi* xe đã cắt vạch → direct crossing không bao giờ thấy (prev=None). Rescue quét quỹ đạo **đo thật** (manager export, không phải Kalman) để khôi phục crossing đã lỡ.
- **Input**: `vehicle{recent_observed_path:[{timestamp_s, frame_index, camera_id, local_track_id, position}]}`, `gate`, `current_source_time`, `max_gap=1.0`. **Output**: `(p1,p2)|None`.
- **Pseudocode**:
  1. `raw_path` không list hoặc <2 → None (`:275-277`).
  2. Giữ 12 mẫu cuối; parse từng mẫu `{ts, frame, cam, track, pos}` — sai kiểu → bỏ (`:278-294`).
  3. `sort theo (ts, frame_index)` (`:295`).
  4. Với mỗi cặp liền kề `(a,b)`: `0 < b.ts − a.ts ≤ 1.0` (`:296-299`); `a.cam == b.cam AND a.track == b.track` (`:300-301`); `b.ts` cách `current_source_time` ≤ 1.0 (`:302-306`); `_crossed_in_valid_direction(a.pos, b.pos, gate)` → trả cặp (`:307-308`).
  5. Hết vòng → None.
- **Cấu trúc dữ liệu**: list mẫu `(ts:int|float, frame:int, cam:str, track:int, pos:point)`; sort key tuple.
- **Độ phức tạp**: O(P log P + P) với P ≤ 12 → O(1) hiệu dụng; memory O(P).
- **Edge cases / failure modes**:
  - `[code]` yêu cầu **cùng camera và cùng local track** — chặn cross-camera jump và đổi local ID (`:300-301`, comment `:270-274`).
  - `[code]` mẫu cũ >1 s so với `current_source_time` → loại — chỉ cứu crossing "vừa xảy ra".
  - `[code]` path không được sort theo thời gian đến? Code tự sort → chấp nhận input xáo trộn.
  - `[edu]` path do Kalman predict (không phải measured) — nếu producer đưa vào thì consumer không phân biệt được; contract nói "manager-authored measured trail" (`runtime_contract.py:111-113`).
- **Sample**:
  ```json
  {
    "current_source_time": 50.4,
    "gate": {"p1": {"x": 39.67, "y": 8.9}, "p2": {"x": 38.87, "y": -6.0}, "direction": "positive"},
    "vehicle": {
      "global_id": 5, "observed": true, "position": {"x": 36, "y": 1},
      "recent_observed_path": [
        {"timestamp_s": 50.0, "frame_index": 40, "camera_id": "cam1", "local_track_id": 7, "position": {"x": 44, "y": 1}},
        {"timestamp_s": 50.2, "frame_index": 41, "camera_id": "cam1", "local_track_id": 7, "position": {"x": 36, "y": 1}},
        {"timestamp_s": 50.3, "frame_index": 42, "camera_id": "cam2", "local_track_id": 2, "position": {"x": 33, "y": 1}},
        {"timestamp_s": 49.0, "frame_index": 39, "camera_id": "cam1", "local_track_id": 7, "position": {"x": 47, "y": 1}}
      ]
    }
  }
  ```
  **Expected** (đã mô phỏng bằng script local): cặp `49.0→50.0` qua được 3 guard đầu (gap 1.0, cùng cam/track, recency theo điểm cuối `50.4−50.0=0.4`) nhưng đoạn `47→44` không cắt vạch → loại; cặp `50.0→50.2` đủ cả 4 điều kiện → **rescue = (50.0,cam1#7)→(50.2,cam1#7)**; cặp `50.2→50.3` khác cam (`cam1`→`cam2`) và khác track (`7`→`2`) → loại. Biến thể `current_source_time=51.6` → mọi cặp recency >1.0 → **None**.
- **Storyboard**: ghost-trail chấm nhỏ nhiều màu theo `(cam,track)` trên map; cặp đủ điều kiện được nối bằng đoạn xanh lá nhấp nháy qua vạch; bảng liệt kê từng cặp với 4 cột điều kiện (gap/cam+track/recency/direction) — hàng nào đủ 4 xanh → highlight. Controls: slider `current_source_time` cho thấy recency tắt dần; nút "xáo trộn thứ tự path" chứng minh sort. Dòng pseudo 4 sub-điều kiện.

### B6 `exit-crossing-session-delete` — Exit crossing → xóa session

- **Nhóm**: Crossing · **Prereq**: `directed-crossing-direction`, `observation-continuity-window` · **Related**: `entry-session-creation`, `session-state-machine`
- **Code**: `backend/gate_session_controller.py:523-535` — exit branch; `backend/session_manager.py:585-595` — `delete_session_by_global_id`, `:574-582` — `delete_session`.
- **Vai trò**: đối xứng với entry — xe cắt vạch exit đúng chiều và **đang được quan sát liên tục** → session bị xóa cứng (không còn state CLOSED — record mất luôn) → FE GET session → 404 → kết thúc UI.
- **Input**: `previous`, `position`, `exit_gate`, session (đã tìm theo gid). **Output**: `deleted_session dict` + cleanup.
- **Pseudocode**:
  1. `if obs_is_cont AND session≠None AND crossed_in_valid_direction(prev,pos,exit_gate)` (`:523-525`):
  2. `deleted ← delete_session_by_global_id(gid, runtime_id)` (`:526-528`).
  3. Xóa `previous_positions`, `_parked_candidates`, `_departure_candidates`, `_last_observed_at`, `_last_source_observed_at` của gid (`:529-533`); log `[EXIT]` (`:534`); `continue` — **không** cập nhật previous (`:535`).
- **Cấu trúc dữ liệu**: các map per-gid của coordinator; session dict trả về.
- **Độ phức tạp**: O(N_sessions) cho find+delete trong file store; memory O(N) khi load store.
- **Edge cases / failure modes**:
  - `[bug/design]` **không có measured-path rescue cho exit** — bất đối xứng có chủ đích hay thiếu? Exit cần `observation_is_continuous` trực tiếp; stall >1 s hay mất quan sát → session sống mãi (R2+R4, đã thấy session 1 tháng trong file). Giáo dục: so sánh với entry để thấy asymmetry.
  - `[code]` delete bất kể state — WAITING_FOR_SCAN chưa claim cũng bị xóa nếu xe ra (đúng vật lý).
  - `[code]` `find_session_by_global_id` skip `CLOSED` (`:190`) nhưng delete là xóa record — `CLOSED` là di sản tương thích cũ (`close_session` alias `:598-600`).
  - `[edu]` observed=false jump ra ngoài vạch → không delete → session ma.
- **Sample** (session gid=5, exit gate `gate_zones.json:18-29` `direction:"negative"`, p1(50.8338,63.3703)→p2(49.3925,51.4338); local gap đều ≤1 s):
  ```json
  {
    "session": {"sessionId": "s-5", "state": "EXIT_NAVIGATION", "globalVehicleId": 5, "runtimeId": "rt-1"},
    "polls": [
      {"vehicle": {"global_id": 5, "observed": true, "last_seen_time": 70.0, "position": {"x": 48, "y": 57}}},
      {"vehicle": {"global_id": 5, "observed": true, "last_seen_time": 70.2, "position": {"x": 52, "y": 58}}},
      {"vehicle": {"global_id": 5, "observed": false, "position": {"x": 40, "y": 60}}}
    ]
  }
  ```
  **Expected** (đã tính bằng script local): poll2 đoạn (48,57)→(52,58) cắt vạch tại ≈(50.13, 57.53), d=**−46.30** < 0 khớp `negative` → delete `s-5`, trả record; poll3 xe `observed=false` — không còn session, không làm gì. Case đối chứng: đảo chiều (52,57)→(48,58) cho d=**+49.19** → reject, session sống; `observed=false` hoặc gap >1 s tại poll2 → discontinuous → **giữ** session (minh họa R4).
- **Storyboard**: tương tự B4 nhưng vạch đỏ (exit); khi cắt → thẻ session nổ/biến mất với badge "DELETED"; phần phụ minh họa case "mất quan sát": chấm xe mờ → vạch không trigger → thẻ session tồn tại với đồng hồ đếm tuổi. Toggle "áp dụng rescue cho exit (đề xuất)" mô phỏng fix. Bảng realtime: `obs_is_cont | crossed | direction_ok | deleted?`. Dòng pseudo 1–3.

---

## Nhóm C — Session store & lifecycle

### C1 `session-state-machine` — FSM 6 trạng thái + chuyển tiếp

- **Nhóm**: Session · **Prereq**: `entry-session-creation` · **Related**: `revision-optimistic-concurrency`, `spot-reservation-availability`, `parking-episode-apply`
- **Code**: `backend/session_manager.py` — `create_session:255-313`, `claim_session:355-368`, `select_spot:371-389`, `set_parked:392-419`, `apply_departure_episode:439-446`, `set_exit_navigation:449-468`, `delete_session:574-582`; guards `InvalidSessionState` `:57-59`.
- **Vai trò**: một FSM authoritative phía backend — mọi hành vi UI/FE chỉ là trigger; transition sai bị `InvalidSessionState`/`SessionConflict` chặn, không có "client tự quyết".
- **Input**: tên hành động + payload (`spotId`, `episode_id`, `new_track_id`) + session hiện tại. **Output**: session đã mutate (có/không thay đổi revision).
- **Pseudocode** (transition table; mỗi dòng = `mutate` trong `_mutate_session`):
  1. `create → WAITING_FOR_SCAN` (rev=1, qrExpiresAt=+120 s).
  2. `claim`: `WAITING_FOR_SCAN` → `SELECTING_SPOT`, `claimed=true`; nếu `claimed` rồi → no-op; ngược lại → `InvalidSessionState` (`:356-366`).
  3. `select(spotId)`: state ∈ {SELECTING, NAVIGATING, PARKED, RELOCATING, EXIT_NAV} (`:373`); có spot → `actualParkedSpotId? RELOCATING : NAVIGATING_TO_SPOT` + `targetSpotId` + `spotSelectedAt` (`:377-384`); `spotId=null` → `actualParkedSpotId? PARKED : SELECTING_SPOT`, clear target (`:385-387`).
  4. `set_parked(spot, episodeId)`: nếu `episodeId` trùng `parkingEpisodeId` đã lưu → **rollback nhẹ**: chỉ restore `actualParkedSpotId`, `SELECTING_SPOT→PARKED` (`:395-401`); `EXIT_NAVIGATION` → `InvalidSessionState` (`:402-405`); idempotent cùng spot (`:406-408`); else → `PARKED` + `parkedSpotId`+`actualParkedSpotId`+`parkingEpisodeId`, clear `targetSpotId`, `parkedAt` giữ nếu cùng spot (`:409-417`).
  5. `apply_departure_episode(ep)`: chỉ khi `parkingEpisodeId==ep` → clear `actualParkedSpotId`; `PARKED→SELECTING_SPOT` (`:439-446`).
  6. `set_exit_navigation`: state ∈ {PARKED, EXIT_NAV, SELECTING, NAVIGATING, RELOCATING} (`:455`); `EXIT_NAVIGATION` → no-op (có thể update `activeTrackId`) (`:459-462`); else → `EXIT_NAVIGATION`, clear target, `exitStartedAt` (`:463-466`).
  7. Exit crossing (B6) → `delete_session` — xóa record, không qua state.
- **Cấu trúc dữ liệu**: session dict ~18 field; tập trạng thái; `actionReceipts` map.
- **Độ phức tạp**: O(1) mỗi transition (ngoài find O(N)); memory O(1).
- **Edge cases / failure modes**:
  - `[code]` `claim` trên session đã qua `SELECTING_SPOT`+claimed → no-op idempotent; trên `NAVIGATING` chưa claimed? `claimed=false` → `InvalidSessionState` (nhánh `:362-366` chỉ no-op khi claimed=true).
  - `[code]` `set_parked` trong `EXIT_NAVIGATION` bị chặn — nhưng rollback-branch (episodeId trùng) **không** kiểm EXIT → restore `actualParkedSpotId` dù đang exit — có chủ đích theo comment `:396-398` (giữ intent của driver).
  - `[code]` `select` với `spotId=null` là "bỏ chọn" — trả về SELECTING/PARKED tùy `actualParkedSpotId`.
  - `[edu]` `CLOSED` state tồn tại trong find-filters nhưng không transition nào ghi — dead state.
- **Sample** (1 session `s-1`, mô phỏng trong browser; ISO như production):
  ```json
  {
    "initial": {"sessionId": "s-1", "state": "WAITING_FOR_SCAN", "globalVehicleId": 5, "revision": 1, "claimed": false, "qrExpiresAt": "2026-10-04T10:02:00.000Z"},
    "actions": [
      {"op": "claim"},
      {"op": "select", "spotId": "A01"},
      {"op": "set_parked", "spot": "A01", "episodeId": "ep-1"},
      {"op": "set_parked", "spot": "A01", "episodeId": "ep-1"},
      {"op": "departure_episode", "episodeId": "ep-1"},
      {"op": "select", "spotId": "B02"},
      {"op": "set_exit"},
      {"op": "set_parked", "spot": "B02", "episodeId": "ep-2"}
    ]
  }
  ```
  **Expected** (mỗi op → state → revision):
  claim → SELECTING_SPOT, rev2; select A01 → NAVIGATING_TO_SPOT (target A01), rev3; set_parked → PARKED (parkedSpotId=A01, actualParkedSpotId=A01, parkingEpisodeId=ep-1), rev4; set_parked lặp cùng ep-1 → nhánh rollback (`session_manager.py:395-401`) restore cùng giá trị → `changed=false` → giữ PARKED, **rev4**; departure_episode ep-1 → `actualParkedSpotId=null` + `PARKED→SELECTING_SPOT`, rev5; select B02 → `actual=null` → **NAVIGATING_TO_SPOT** (không phải RELOCATING — RELOCATING chỉ khi `actualParkedSpotId` còn), rev6; set_exit → EXIT_NAVIGATION, rev7; set_parked B02 → `InvalidSessionState` (ep-2 ≠ parkingEpisodeId ep-1 → không vào nhánh rollback; state giữ EXIT_NAVIGATION, rev7).
- **Storyboard**: FSM nodes tròn (6 state + "DELETED" ghost); cạnh có label action; nút active pulse xanh; panel phải liệt kê action buttons (claim/select/parked/departure/exit) disable theo guard hiện tại — bấm action bất hợp lệ → toast `InvalidSessionState` đỏ; sidebar hiển thị JSON session + revision đếm. Controls: chọn kịch bản (happy path / relocate / exit-while-parking), step/auto. Dòng pseudo = cạnh đang highlight.

### C2 `qr-token-issuance-ttl` — Token, `qrExpiresAt`, waiting sort; claim không kiểm hạn

- **Nhóm**: Session · **Prereq**: `entry-session-creation`, `session-state-machine` · **Related**: `canonical-runtime-id-consumer`
- **Code**: `backend/session_manager.py:29` (`QR_DISPLAY_SECONDS=120.0`), `:81-88` (`_qr_expires_at` fallback), `:200-217` (`list_waiting_sessions`), `:283-285` (`secrets.token_urlsafe(12)` + collision), `:302-304` (expiry embed), `:355-368` (`claim_session` **không** check expiry); `frontend/src/components/EntryQRKiosk.tsx:6-17, 36-39, 56-68` (`QR_DISPLAY_MS=120_000`, `.at(-1)`, filter+timer).
- **Vai trò**: hàng đợi QR "một xe mới nhất hiển thị" — backend filter+sort+expiry, kiosk chọn phần tử cuối và tự đếm ngược.
- **Input**: sessions dict; `now`. **Output**: list waiting sort `createdAt` tăng; kiosk render session cuối; claim → state transition bất kể expiry.
- **Pseudocode**:
  1. `create_session`: `qrExpiresAt = createdAt + 120 s` (`:302-304`); legacy record thiếu field → `_qr_expires_at` fallback `createdAt+120` (`:81-88`).
  2. `list_waiting`: `state==WAITING_FOR_SCAN AND !claimed AND runtime match AND now < expiry` → sort `createdAt` asc (`:206-217`).
  3. Kiosk poll 250 ms: `waiting.filter(qrExpiryTime>now).at(-1)` (`:36-39`); local expiry fallback `createdAt+120_000` (`:9-17`); timer ẩn khi hết (`:56-68`).
  4. `claim_session`: guard theo state, **không đọc `qrExpiresAt`** (`:355-368`).
- **Cấu trúc dữ liệu**: token urlsafe ~16 ký tự; ISO timestamps; list sort.
- **Độ phức tạp**: `list_waiting_sessions` O(N + W log W) — quét N session + sort W waiting; kiosk pick O(W); `create_session` dedup O(N); `claim` O(N) load + O(1) mutate. Memory O(N) — toàn bộ store được parse mỗi lần.
- **Edge cases / failure modes**:
  - `[docs-mismatch/bug?]` QR hết hạn chỉ **ẩn khỏi kiosk** — `claim_session` vẫn chấp nhận session quá hạn (C §7-R3). Docs cũ ghi 10 s cũng sai (cả hai phía đều 120 s).
  - `[code]` nhiều xe vào liên tiếp → kiosk chỉ hiện QR **mới nhất** (`.at(-1)`); QR cũ vẫn quét được đến hết hạn riêng — claim đúng session của QR đó, không bị "đè".
  - `[code]` token `secrets` = CSPRNG — demo dùng chuỗi giả cố định (xem §X lib ngoài).
  - `[edu]` hai kiosk cùng poll → cùng thấy QR mới nhất — race claim: người thứ hai claim session đã claimed → mutate no-op, vẫn trả session (idempotent).
- **Sample** (ISO UTC như production; base `T = 2026-10-04T10:00:00.000Z`, adapter demo: inject `now`, timestamp parse bằng `Date.parse`/ISO chuẩn — không ký hiệu "T+n" nào được truyền vào parser):
  ```json
  {
    "now": "2026-10-04T10:01:40.000Z",
    "sessions": {
      "s-old":  {"sessionId": "s-old",  "state": "WAITING_FOR_SCAN", "claimed": false, "createdAt": "2026-10-04T10:00:00.000Z", "qrExpiresAt": "2026-10-04T10:02:00.000Z", "globalVehicleId": 3},
      "s-mid":  {"sessionId": "s-mid",  "state": "WAITING_FOR_SCAN", "claimed": false, "createdAt": "2026-10-04T10:00:50.000Z", "qrExpiresAt": "2026-10-04T10:02:50.000Z", "globalVehicleId": 5},
      "s-new":  {"sessionId": "s-new",  "state": "WAITING_FOR_SCAN", "claimed": false, "createdAt": "2026-10-04T10:01:30.000Z", "qrExpiresAt": "2026-10-04T10:03:30.000Z", "globalVehicleId": 7},
      "s-done": {"sessionId": "s-done", "state": "SELECTING_SPOT",   "claimed": true,  "createdAt": "2026-10-04T10:01:35.000Z", "qrExpiresAt": "2026-10-04T10:03:35.000Z", "globalVehicleId": 9}
    }
  }
  ```
  **Expected**: tại `now=10:01:40Z`, waiting = [s-old, s-mid, s-new] (s-old còn 20 s hiệu lực; s-done bị lọc vì `claimed`/state) sort `createdAt` tăng → kiosk `.at(-1)` = **s-new**. Tại `now=10:02:05Z`: s-old hết hạn → waiting = [s-mid, s-new]. **Case lỗi**: `claim("s-old")` tại `10:02:10Z` (đã hết hạn) → vẫn thành công SELECTING_SPOT — behavior thật của code, không phải bug của demo.
- **Storyboard**: lane timeline QR: mỗi session = vé có thanh expiry 120 s chạy ngược; vé hết hạn mờ đi; đèn "KIOSK SHOWING" gắn vé mới nhất; nút "Quét QR (claim)" trên vé hết hạn → kết quả `SELECTING_SPOT` + cảnh báo "expiry không chặn claim". Bảng realtime: `createdAt | expiry | now<expiry | in waiting | kiosk picks`. Controls: slider now, nút tạo session giả. Dòng pseudo 1–4.

### C3 `revision-optimistic-concurrency` — `expected_revision` + `actionReceipts`

- **Nhóm**: Session · **Prereq**: `session-state-machine` · **Related**: `spot-reservation-availability`
- **Code**: `backend/session_manager.py:316-352` — `_mutate_session`; error map `gate_session_controller.py:807-835` (409 REVISION_CONFLICT body kèm `session`); FE gửi `useVehicleSession.ts:157-160` (`expected_revision=revision hiện tại`, `action_id=uuid`).
- **Vai trò**: chống lost-update giữa nhiều client (kiosk, điện thoại tài xế, gate thread) mà không cần transaction — mỗi POST mang "tôi đang đọc revision nào" + "hành động này là duy nhất".
- **Input**: `session_id`, `expected_revision?`, `action_id?`, `action_signature` (nội bộ), `mutate()`. **Output**: session mới | `SessionConflict(current)` | `SessionNotFound`.
- **Pseudocode**:
  1. Lock (`_STORE_LOCK` reentrant); `session` thiếu → `SessionNotFound` (`:318-322`).
  2. `receipts ← session.actionReceipts`; nếu `action_id ∈ receipts`: signature khác → `SessionConflict("reused for different action")`; khớp → `return session` **không mutate** (`:323-327`).
  3. `expected_revision ≠ session.revision` → `SessionConflict` kèm bản copy (`:328-329`).
  4. `before = dict(session)`; `mutate(session)`; nếu có `action_id` → `receipts[id]=signature`, giữ 32 gần nhất (`:330-334`).
  5. `changed = any field diff` trừ `{updatedAt, revision}` (`:336-340`); nếu changed → `revision+1`, `updatedAt=now`, kéo `lastKnownPosition` từ live cache, `save_sessions` (`:341-351`); else giữ revision (`:344-346`).
- **Cấu trúc dữ liệu**: `actionReceipts: {action_id→signature}` cap 32; snapshot before/after.
- **Độ phức tạp**: O(N) load + O(F) diff field (~20) + O(R) append receipt (R ≤ 32); `save_sessions` ghi full file O(F_total). Memory O(N) — parse toàn bộ JSON mỗi op.
- **Edge cases / failure modes**:
  - `[code]` **subtlety thật**: ghi `actionReceipts` vào session làm `changed=True` → POST có `action_id` mới **luôn** bump revision kể cả khi mutate no-op (`:330-342`). Retry cùng `action_id` thì thoát sớm ở bước 2 → không bump — đúng idempotent.
  - `[code]` signature `select:{spotId}` → cùng `action_id` nhưng đổi spot → conflict rõ ràng thay vì âm thầm đổi ý định.
  - `[code]` `set_parked_by_global_id` truyền `expected_revision=session.revision` (`:436`) — gate cũng dùng optimistic concurrency giữa 2 lần đọc.
  - `[edu]` receipt cap 32: replay action_id cũ hơn 32 gần nhất → coi như mới → có thể mutate lại — cửa sổ idempotency hữu hạn.
- **Sample** (session `s-1` rev=3 SELECTING_SPOT):
  ```json
  {
    "actions": [
      {"op": "select", "spotId": "A01", "expected_revision": 3, "action_id": "u-1"},
      {"op": "select", "spotId": "A01", "expected_revision": 3, "action_id": "u-1"},
      {"op": "select", "spotId": "B02", "expected_revision": 3, "action_id": "u-1"},
      {"op": "select", "spotId": "B02", "expected_revision": 4, "action_id": "u-2"},
      {"op": "select", "spotId": "C03", "expected_revision": 4, "action_id": "u-3"}
    ]
  }
  ```
  **Expected**: u-1 → mutate → rev4 target A01; u-1 lặp → return nguyên (rev4, không đổi); u-1 đổi spot → `SessionConflict` "reused for different action"; u-2 rev4 → rev5 target B02; u-3 với expected=4 nhưng session đã rev5 → `REVISION_CONFLICT` + body `session` hiện tại. Bảng cột: op → verdict → revision → target.
- **Storyboard**: hai lane client (điện thoại vàng / gate xanh dương) gửi request vào một hộp khóa; revision counter lớn; khi conflict → lane thua sáng đỏ + nhận "current session" ghost-merged; tab `actionReceipts` hiển thị map cap 32 trượt. Bảng realtime: `expected vs actual | action_id seen? | signature | changed fields | revision`. Controls: nút "retry cùng action_id", "retry sai signature", "2 client đua". Dòng pseudo 1–5.

### C4 `spot-reservation-availability` — Chuỗi validate chọn ô

- **Nhóm**: Session · **Prereq**: `live-freshness-contract`, `session-state-machine` · **Related**: `revision-optimistic-concurrency`
- **Code**: `backend/gate_session_controller.py:69-89` — `_validate_selection`; `:92-100` — `_spot_is_available`; `:154-178` — `_latest_spot_availability`; `backend/session_manager.py:220-252` — `list_navigation_reservations` (reentrant-lock comment `:227-229`).
- **Vai trò**: rào 4 lớp trước khi gán `targetSpotId` — đúng runtime, không session khác giữ, runtime tươi, ô thật sự trống. Check+set nguyên tử nhờ `_STORE_LOCK` (TOCTOU-safe trong 1 process).
- **Input**: `session`, `spot_id`. **Output**: pass | `SelectionUnavailable(code,status)`.
- **Pseudocode**:
  1. `session.runtimeId` khác `_latest_runtime_id()` → `RUNTIME_MISMATCH` 409 (`:70-71`).
  2. `list_navigation_reservations(runtime, exclude=self)` chứa `spotId` → `SPOT_RESERVED` 409 (`:72-84`); reservation = session khác có `targetSpotId` và state ∈ {NAVIGATING_TO_SPOT, RELOCATING} (`:233-241`).
  3. `_latest_spot_availability(spot)` → None → `RUNTIME_UNAVAILABLE` 503 (`:85-87`): None khi snapshot cũ >5 s theo `time.monotonic` nhận được (`:159-165`) hoặc `_fresh_live` fail (`:176-177`).
  4. `availability == false` → `SPOT_NOT_AVAILABLE` 409 (`:88-89`); available ⇔ `!occupied AND status=="empty"` (`:99`).
  5. File-mode (`source_mode=None`): tra `parking_status_sample.json`; lỗi/không có → True (`:166-175`).
- **Cấu trúc dữ liệu**: reservations list `{sessionId, spotId, globalVehicleId, reservedAt, revision}` sort `(spotId, reservedAt)`; `_latest_runtime_snapshot` + `_latest_runtime_received_at` dưới RLock riêng (`:57-59`).
- **Độ phức tạp**: O(N + R log R + S) — quét N session lọc reservation rồi sort R reservation (`:249-252`), S slot tìm availability (~60). Memory O(N + R).
- **Edge cases / failure modes**:
  - `[code]` reservation chỉ gắn state NAVIGATING/RELOCATING — session "ma" EXIT_NAV giữ target? `set_exit` clear target (`:464`) nên không; nhưng session ma ở NAVIGATING giữ ô mãi (R2).
  - `[code]` `runtimeId=None` session khớp mọi runtime — session file-mode có thể chiếm ô trên runtime live (R2 edge).
  - `[code]` freshness của availability đo bằng **local monotonic receive-time** (không phải `published_at`) — 5 s kể từ khi controller nhận snapshot cuối (`:159-165`).
  - `[edu]` hai client cùng chọn 1 ô đồng thời → RLock tuần tự hóa: kẻ sau thấy reservation đã commit → `SPOT_RESERVED`. Giới hạn: chỉ trong 1 process.
- **Sample**:
  ```json
  {
    "latest_runtime": {"runtime_id": "rt-1", "received_at_mono": 100.0, "now_mono": 102.0,
                       "parking_slots": [{"slot_id": "A01", "occupied": true, "status": "occupied"},
                                          {"slot_id": "B02", "occupied": false, "status": "empty"}]},
    "sessions": [
      {"sessionId": "s-a", "state": "NAVIGATING_TO_SPOT", "targetSpotId": "B02", "runtimeId": "rt-1"},
      {"sessionId": "s-b", "state": "SELECTING_SPOT", "runtimeId": "rt-1"}
    ],
    "select_for": {"sessionId": "s-b"}
  }
  ```
  **Expected**: `s-b` select `B02` → bước 2 fail `SPOT_RESERVED` (s-a giữ); select `A01` → bước 4 fail `SPOT_NOT_AVAILABLE` (occupied); select `C05` (không có trong `parking_slots`) → `_spot_is_available` trả `None` (`:100`) → `availability is None` → **bước 3 `RUNTIME_UNAVAILABLE` 503** — ô không tồn tại báo giống lỗi runtime stale; `now_mono=106` (>5 s sau receive ở 100) → mọi select → `RUNTIME_UNAVAILABLE`.
- **Storyboard**: phễu 4 cổng (RUNTIME → RESERVED → FRESH → EMPTY); request card đi qua, dừng ở cổng fail với mã lỗi đỏ; map mini tô ô theo `parking_slots` + overlay amber reservation; bảng realtime: 4 điều kiện + code+status. Controls: chọn spot từ dropdown, giả lập snapshot cũ (>5 s). Dòng pseudo 1–5.

### C5 `live-observation-cache` — Cache vị trí nóng tách khỏi persist

- **Nhóm**: Session · **Prereq**: `atomic-session-store` · **Related**: `identity-alias-remap-backend`, `revision-optimistic-concurrency`
- **Code**: `backend/session_manager.py:32` (`_LIVE_OBSERVATIONS`), `:36-46` (`_observation_key`/`_with_live_observation`), `:471-502` (`update_global_vehicle_observation`, nhánh `persist=False` `:485-492`), gọi ở `gate_session_controller.py:551-554` (`persist=not v2`); persist tại transition `:348-350`, remap `:565-566`, delete `:581`.
- **Vai trò**: vị trí xe đổi 4–5 lần/giây — không được ghi đĩa mỗi frame; giữ trong RAM keyed session, chỉ "đóng gói" vào `lastKnownPosition` lúc transition hoặc khi GET.
- **Input**: `global_id`, `position{x,y}`, `persist:bool`. **Output**: session với `lastKnownPosition` merge (hoặc None nếu no session).
- **Pseudocode**:
  1. `session ← find_by_gid(gid, runtime)`; None → return None (`:479-483`).
  2. `persist=False` (v2): `key ← (SESSIONS_FILE, sessionId)`; `identity ← (runtimeId, gid, createdAt)`; `cache[key] = (identity, {x,y})` (`:486-489`); `while len>1024 → pop oldest` (`:490-491`); trả `_with_live_observation(session)`.
  3. `_with_live_observation`: nếu `cache[key]` tồn tại và `identity` khớp → copy vào `session.lastKnownPosition` (`:40-46`).
  4. `persist=True` (legacy): mutate ghi `lastKnownPosition` (và `activeTrackId`) vào file (`:494-502`).
  5. Transition thành công (C3 bước 5) → `session.lastKnownPosition ← cache` trước khi save (`:348-350`).
- **Cấu trúc dữ liệu**: `dict[(file,sid) → (identity_tuple, pos)]` FIFO-1024; identity tuple chống merge sai session sau remap/recreate.
- **Độ phức tạp**: O(1) update cache (dict + FIFO pop); O(N) `find_by_gid`. Memory O(min(N, 1024)) — cache cap cứng 1024 entry.
- **Edge cases / failure modes**:
  - `[code]` session recreated cùng gid nhưng `createdAt` khác → identity mismatch → cache cũ không rò sang session mới (`:43-44`).
  - `[code]` FIFO evict theo insertion-order dict — không reinsert → oldest bỏ; >1024 session đồng thời mới mất dữ liệu (không thực tế).
  - `[edu]` GET session trả vị trí nóng nhưng file JSON trên đĩa vẫn vị trí cũ — "file không phải nguồn vị trí live".
- **Sample**:
  ```json
  {
    "cache_start": {},
    "updates": [
      {"gid": 5, "pos": {"x": 100, "y": 50}, "persist": false},
      {"gid": 5, "pos": {"x": 120, "y": 55}, "persist": false},
      {"op": "select", "spotId": "A01"},
      {"gid": 5, "pos": {"x": 140, "y": 58}, "persist": false}
    ],
    "session": {"sessionId": "s-5", "runtimeId": "rt-1", "globalVehicleId": 5, "createdAt": "T0", "lastKnownPosition": null}
  }
  ```
  **Expected**: sau 2 update, `GET` trả `lastKnownPosition={120,55}` nhưng **file không đổi**; sau `select` transition → file persist `{120,55}`; update cuối → GET `{140,58}`, file vẫn `{120,55}`. Demo bảng 2 cột "RAM cache" vs "disk file" thấy lệch rõ.
- **Storyboard**: hai cột song song "RAM (mất khi restart)" vàng nhạt vs "Disk JSON" xám; mũi tên ghi chỉ bắn sang cột disk khi transition sáng; badge `identity=(rt,gid,createdAt)` đổi đỏ khi mismatch; counter `len(_LIVE_OBSERVATIONS)/1024`. Bảng realtime: `pos mới | cache hit | identity ok | file write?`. Dòng pseudo 1–5.

### C6 `atomic-session-store` — Ghi file nguyên tử + load chịu lỗi

- **Nhóm**: Session · **Prereq**: — · **Related**: `revision-optimistic-concurrency`, `live-observation-cache`
- **Code**: `backend/session_manager.py:91-112` — `atomic_write`; `:115-123` — `load_json`; `:156-168` — `load_sessions`/`save_sessions` under `_STORE_LOCK`; `:23-28` — `TECHGAR_SESSIONS_FILE` env override.
- **Vai trò**: persistence tối giản an toàn-trong-process: không có file nửa-vở khi crash giữa ghi; file hỏng → trả {} thay vì crash.
- **Input**: `path`, `data:dict`. **Output**: file thay thế nguyên tử; cleanup `.tmp` khi lỗi.
- **Pseudocode**:
  1. `mkdir -p parent`; mở `NamedTemporaryFile` cùng dir, `delete=False` (`:93-103`).
  2. `json.dump + flush + os.fsync` (`:104-107`).
  3. `os.replace(tmp, path)` — atomic trên cùng filesystem (`:109`).
  4. `finally`: `tmp.unlink(missing_ok=True)` nếu còn (`:110-112`).
  5. `load_json`: `!exists → {}`; JSONDecodeError/OSError → `{}`; non-dict → `{}` (`:115-123`).
  6. Mọi thao tác sessions trong `_STORE_LOCK` RLock (`:156-168`).
- **Cấu trúc dữ liệu**: file JSON `{sessionId → session}`; lock process-level.
- **Độ phức tạp**: O(F) write (serialize + fsync + replace) và O(F) load mỗi op; memory O(F) — full rewrite, không incremental.
- **Edge cases / failure modes**:
  - `[bug/design]` **không có inter-process lock** (không flock/msvcrt) → hai instance controller cùng file → lost-update (R7). Demo: 2 tab "process" ghi xen kẽ → mất bản ghi.
  - `[code]` `os.replace` cùng dir bắt buộc — tmp tạo `dir=path.parent` đảm bảo same-fs.
  - `[code]` crash giữa bước 2–3 → file cũ nguyên vẹn + `.tmp` dư (dọn lần sau không cần — tmp name prefix `.{name}.`).
  - `[edu]` load file chứa list/array → `{}` — "không phải dict = coi như rỗng".
- **Sample** (hai scenario độc lập, reset giữa hai kịch bản):
  ```json
  {
    "scenario_A_write_ok": {
      "file_before": {"s-1": {"state": "PARKED"}},
      "events": [{"op": "write", "data": {"s-1": {"state": "PARKED"}, "s-2": {"state": "WAITING_FOR_SCAN"}}}]
    },
    "scenario_B_crash": {
      "file_before": {"s-1": {"state": "PARKED"}},
      "events": [{"op": "write_crash_after_fsync", "data": {"s-1": {"state": "PARKED"}, "s-2": {"state": "WAITING_FOR_SCAN"}}}]
    },
    "scenario_C_load": {"file_content": "{not json"}
  }
  ```
  **Expected**: A → tmp ghi + fsync + replace thành công → file sau = **2 sessions** (s-1 + s-2). B → fsync xong nhưng crash trước `os.replace` → file trên đĩa **vẫn 1 session** (s-1 nguyên vẹn; `.tmp` orphan — xóa ở lần ghi sau hoặc dọn tay). C → `load_json` trả `{}`, không exception.
- **Storyboard**: timeline 3 vùng `tmp write → fsync → os.replace`; nút "crash ngẫu nhiên" dừng giữa chừng → hiển thị file gốc còn nguyên; tab "2 process" cho hai writer xen kẽ không lock → highlight record mất. Bảng realtime: `tmp exists | fsynced | replaced | file content`. Dòng pseudo 1–5.

---

## Nhóm D — Episodes & identity

### D1 `parking-episode-apply` — Latest-episode/gid, owner-conflict, cursor dedup

- **Nhóm**: Episode · **Prereq**: `frame-cursor-monotonic-poll`, `session-state-machine` · **Related**: `identity-alias-remap-backend`, `parked-evidence-dwell-legacy`
- **Code**: `backend/gate_session_controller.py:628-703` — `_apply_parking_episodes`; gọi `:448-449` (trước same-frame return).
- **Vai trò**: trong v2, quyết định "xe đã đỗ/rời ô" đến **chỉ** từ `parking_episodes` (binder authoritative) — không từ `parked_slot_id` hay occupied. Cursor per-session làm cho việc áp episode idempotent qua repoll và same-frame republish.
- **Input**: `snapshot{parking_episodes, frame_index}`, `runtime_id`. **Output**: side-effect `set_parked_by_global_id`/`apply_departure_episode` + `episode_diagnostics[gid]`.
- **Pseudocode**:
  1. Với mỗi episode: parse `gid`, `applied_frame_idx`, `evidence_frame_idx`; yêu cầu `0 ≤ evidence ≤ applied ≤ snapshot.frame_index` và `parking_episode_id`, `slot_id` không rỗng — sai → skip (`:633-645`).
  2. `state=="parked"` → ghi `owners[gid]+=slot`, `slot_owners[slot]+=gid` (`:646-648`).
  3. Giữ per-gid episode "mới nhất" theo tuple `(applied_frame_idx, applied_ts, revision, state_rank{parked:1,departing:2,released:3})` (`:649-663`); `pending` rank 0.
  4. Với mỗi gid latest: skip nếu `identity_conflicts` hoặc `|owners[gid]|>1` hoặc `|slot_owners[slot]|>1` → diag `identity_or_slot_owner_conflict` (`:664-668`).
  5. `session ← find_by_gid`; None → diag `session_not_found` (`:669-672`).
  6. `cursor = (applied_frame_idx, episode_id, state, applied_ts, revision)`; so với `_episode_cursors[sessionId]`: bằng → skip; `applied < prev` → diag `episode_older`; cùng frame và `applied_ts ≤ prev` và **không phải** revision mới hơn cùng episode → diag `not_newer` (`:673-690`).
  7. Apply: `parked` và `state≠EXIT_NAV` → `set_parked_by_global_id(ep)`; `departing|released` → `apply_departure_episode`; `pending` → skip (`:691-698`); ghi cursor + diag `applied` (`:699-700`); `SessionError` → diag `session_rejected` (`:701-703`).
- **Cấu trúc dữ liệu**: `latest: gid→episode`; `owners/slot_owners` set; `_episode_cursors: sessionId→tuple5`; `state_rank` map.
- **Độ phức tạp**: O(E) lọc+latest-pick + O(G·N) lookup session (G ≤ E gid riêng, mỗi `find_session_by_global_id` quét N session) — tổng O(E·N). Memory O(E + G) cho `latest/owners/slot_owners` + O(N) khi load store.
- **Edge cases / failure modes**:
  - `[code]` `evidence > applied` hoặc `applied > frame_index` → episode bị loại — guard chống "evidence từ tương lai".
  - `[code]` hai gid cùng "parked" một ô (identity merge lỗi) → cả hai diag conflict, **không** áp — fail-closed.
  - `[code]` cùng `applied_frame_idx`, cùng episode_id, revision cao hơn → cho qua (nhánh `newer_revision` `:687`) — xử lý republish cùng frame.
  - `[code]` `departing|released` áp dù session `PARKED` với episode khác? `apply_departure_episode` chỉ tác dụng khi `parkingEpisodeId` khớp (`:441-442`) — lệch id → no-op.
  - `[code]` episode `pending` không apply, nhưng vẫn tham gia latest-pick theo tuple `(applied, ts, revision, state_rank)` (`:650-662`) — `state_rank` chỉ là tie-break cuối, nên `pending` chỉ thắng khi `applied/ts/revision` lớn hơn hẳn; khi đó nó "che" episode parked cũ hơn (không apply gì) cho tới khi episode mới hơn tới.
- **Sample** (`frame_index=50`, sessions `{s-5: gid5 NAVIGATING, s-8: gid8 PARKED ep-old}`):
  ```json
  {
    "snapshot_frame_index": 50,
    "parking_episodes": [
      {"parking_episode_id": "ep-a", "global_id": 5, "slot_id": "D01", "state": "parked", "applied_frame_idx": 48, "evidence_frame_idx": 47, "applied_timestamp_s": 20.0, "revision": 2},
      {"parking_episode_id": "ep-bad", "global_id": 6, "slot_id": "D02", "state": "parked", "applied_frame_idx": 55, "evidence_frame_idx": 54, "applied_timestamp_s": 21.0, "revision": 1},
      {"parking_episode_id": "ep-old", "global_id": 8, "slot_id": "A01", "state": "released", "applied_frame_idx": 49, "evidence_frame_idx": 49, "applied_timestamp_s": 21.5, "revision": 4}
    ]
  }
  ```
  **Expected**: ep-bad loại bước 1 (`applied 55 > frame 50`); gid5 ep-a hợp lệ → cursor mới → `set_parked` → diag `applied`; gid8 released → `apply_departure_episode` (parkingEpisodeId khớp ep-old → clear actual + `PARKED→SELECTING_SPOT`). Re-poll cùng snapshot → hai cursor bằng → skip (diag giữ). Gửi lại ep-a với `revision=3` cùng frame → `newer_revision` → áp lại `set_parked` (idempotent phía session).
- **Storyboard**: cột trái "episodes đến" nhưng cards xếp theo `applied_frame_idx`; máy "latest-picker" giữ card cao nhất mỗi gid; cổng conflict (2 thẻ gid cùng ô đỏ chớp); cursor bar theo session; bảng diag mỗi gid `applied|conflict|older|not_newer|rejected`. Controls: re-poll cùng snapshot, inject episode xấu, inject conflict. Dòng pseudo 1–7.

### D2 `parked-evidence-dwell-legacy` — Đường v1: dwell `stopped_for_ms` + departure 2 frame

- **Nhóm**: Episode · **Prereq**: `session-state-machine`, `observation-continuity-window` · **Related**: `parking-episode-apply`
- **Code**: `backend/gate_session_controller.py:128-144` — `_parked_evidence_seconds`; `:556-557` — `if v2: continue` (v1 bị bypass); `:559-626` — legacy parked/departure logic; arg `--parked-confirm-seconds` default `2.0` `:866`.
- **Vai trò**: đường xác nhận đỗ **chỉ chạy khi snapshot không phải v2** (file-mode/legacy): ô đỗ + `stopped_for_ms` dwell 2 s → `set_parked`; rời ô = 2 frame liên tục `active` + dịch ≥0.25 đơn vị → `set_exit_navigation`. Giữ trong dossier vì đây là thuật toán thật còn trong code và là điểm đối chiếu sư phạm "evidence-based vs episode-authoritative".
- **Input**: `vehicle{parked_slot_id, state, observed}`, `parking_slots`, `previous_position`, `frame_index`. **Output**: `set_parked`/`set_exit_navigation` side-effects.
- **Pseudocode**:
  1. `v2 → continue` — toàn bộ khối skip (`:556-557`).
  2. `parked_slot_id` truthy và session chưa parked-đúng-ô: `evidence ← min(confirm_s, stopped_for_ms/1000)` từ slot cùng gid + `tracking_state=="parked"` (`:128-143, 574-579`); `candidate ← (slot, now − evidence)` (backdate) (`:580-581`); `now − start < 2 s → chờ` (`:582-583`); đủ → `set_parked` (`:585-595`).
  3. `parked_slot_id` falsy và session PARKED và observed: `movement ≥0.25` và `state=="active"` → `count++` nếu continuous (else reset 1) (`:599-616`); `count ≥2 → set_exit_navigation` (`:617-619`); ngược → clear (`:620-621`).
  4. Prune candidates của gid không còn trong snapshot (`:623-626`).
- **Cấu trúc dữ liệu**: `_parked_candidates: gid→(slot,start)`; `_departure_candidates: gid→(count,last_frame)`.
- **Độ phức tạp**: O(V + S) mỗi snapshot (V vehicles, S slot tra evidence); memory O(V) cho hai candidate map.
- **Edge cases / failure modes**:
  - `[code]` `vehicle_id` slot khác gid hoặc `tracking_state≠parked` → evidence 0 → dwell reset — chống nhầm xe đứng cạnh.
  - `[code]` `stopped_for_ms` backdate → xe đỗ lâu confirm ngay frame đầu (min() cap 2 s).
  - `[code]` `EXIT_NAVIGATION` → cả hai candidates pop (`:560-563`) — không re-confirm khi đang ra.
  - `[edu]` trong v2 nhánh này là dead path — demo nên hiển thị "đường cũ bị bypass" chứ không trình bày như behavior hiện tại của live mode.
- **Sample** (v1 snapshot kiểu file-mode, `parked_confirm=2 s`, local now tăng 0.25/poll):
  ```json
  [
    {"vehicle": {"global_id": 5, "observed": true, "parked_slot_id": "A01", "position": {"x": 300, "y": 200}, "state": "active"},
     "parking_slots": [{"slot_id": "A01", "vehicle_id": 5, "tracking_state": "parked", "stopped_for_ms": 3000}]},
    {"vehicle": {"global_id": 5, "observed": true, "parked_slot_id": "A01", "position": {"x": 300, "y": 200}, "state": "parked"},
     "parking_slots": [{"slot_id": "A01", "vehicle_id": 5, "tracking_state": "parked", "stopped_for_ms": 3200}]},
    {"vehicle": {"global_id": 5, "observed": true, "parked_slot_id": null, "position": {"x": 305, "y": 200}, "state": "active"}},
    {"vehicle": {"global_id": 5, "observed": true, "parked_slot_id": null, "position": {"x": 310, "y": 200}, "state": "active"}}
  ]
  ```
  **Expected**: poll1 → evidence min(2,3)=2 → candidate start backdated → confirm ngay → `set_parked(A01)` (không cần chờ); poll2 parked-đúng-ô → skip; poll3 `parked_slot_id=null` + move 5 ≥0.25 + continuous → count=1; poll4 move 5 → count=2 → `set_exit_navigation`. Nếu poll3 có gap >1 s → count reset.
- **Storyboard**: hai thanh tiến trình "parked dwell 2 s" (xanh) và "departure ×2 frame" (cam); badge "V2 PATH — LEGACY ONLY" cố định góc; khi toggle schema v2 → toàn bộ panel mờ + note "episodes take over". Bảng realtime: `candidate | evidence | dwell left | dep count`. Dòng pseudo 2–3.

### D3 `identity-alias-remap-backend` — Remap GID qua aliases + merge events

- **Nhóm**: Identity · **Prereq**: `session-state-machine`, `live-observation-cache` · **Related**: `canonical-runtime-id-consumer`, `parking-episode-apply`
- **Code**: `backend/gate_session_controller.py:343-371` — `_apply_alias_table`; `:373-399` — `_apply_merge_events`; `:463-465` — skip `identity_conflicts`; `backend/session_manager.py:516-571` — `remap_global_vehicle_id`.
- **Vai trò**: producer đổi GID của xe (merge) — session phải đi theo ID mới mà không mất state; hai kênh báo: `retired_global_ids` (durable) và `recent_events[].global_id_merged` (transient), durable thắng khi event lỡ.
- **Input**: `aliases:{old→new}`, `events:[{type:"global_id_merged", superseded_global_id, global_id}]`, `runtime_id`. **Output**: session remap + cursor migration hoặc `identity_conflicts`.
- **Pseudocode** (alias; event giống với id lấy từ event):
  1. Với mỗi `(old,new)` trong aliases: skip non-int/`old==new`; `find_session(old)` None → skip (`:348-356`).
  2. `remap_global_vehicle_id(old,new,runtime)`: trong lock — tìm session(old); không có → trả session(new) nếu có else `SessionNotFound` (`:524-549`); session khác đã giữ `new` → `SessionError` duplicate (`:550-564`); migrate `lastKnownPosition` từ live cache, pop cache, `globalVehicleId=new`, `revision+1`, save (`:565-570`).
  3. `SessionError` → `identity_conflicts ∪ {old,new}` + log (`:357-361`); sau đó mọi vehicle có gid ∈ conflicts bị skip trong main loop (`:463-465`).
  4. Thành công → chuyển `previous_positions`, `_last_observed_at`, `_last_source_observed_at`, `_parked_candidates` từ old→new (`:363-371`).
- **Cấu trúc dữ liệu**: alias map str→int; `identity_conflicts:set[int]`; các cursor dict.
- **Độ phức tạp**: O(A·N + Ev·N) — mỗi alias/event gọi `find_session_by_global_id` O(N); memory O(A + N) (conflict set + session store).
- **Edge cases / failure modes**:
  - `[code]` merge events chỉ sống trong `recent_events` (≤100, `runtime_contract.py:167`) → event lỡ vẫn cứu được bằng `retired_global_ids` — đây là lý do hai kênh.
  - `[code]` conflict (2 session tranh 1 gid mới) → **cả hai id bị đóng băng** (skip trong loop) → không crossing/parked nào áp cho xe đó — fail-closed, phải can thiệp tay.
  - `[code]` remap tự `revision+1` không qua `_mutate_session` (đường riêng `:568`) — receipt không liên quan.
  - `[edu]` chain alias a→b→c: `_apply_alias_table` duyệt từng cặp; thứ tự dict quyết định — nếu (a→b) trước (b→c) thì session a→b rồi vòng sau (hoặc snapshot sau) b→c; consumer FE theo chain trong 1 lần (D4).
- **Sample**:
  ```json
  {
    "sessions": {"s-5": {"sessionId": "s-5", "globalVehicleId": 5, "state": "NAVIGATING_TO_SPOT", "runtimeId": "rt-1"},
                 "s-9": {"sessionId": "s-9", "globalVehicleId": 9, "state": "WAITING_FOR_SCAN", "runtimeId": "rt-1"}},
    "snapshot": {
      "retired_global_ids": {"5": 9, "3": 4},
      "recent_events": [{"type": "global_id_merged", "superseded_global_id": 3, "global_id": 4},
                        {"type": "other"}],
      "vehicles": [{"global_id": 9, "position": {"x": 300, "y": 200}, "observed": true}]
    }
  }
  ```
  **Expected**: alias `5→9`: `s-5` tồn tại → remap, nhưng `s-9` đã giữ gid 9 → `SessionError` duplicate → `identity_conflicts={5,9}` + log — **case lỗi chính**. Alias `3→4`: không session gid 3 → skip. Vehicle gid 9 bị skip ở main loop do conflict. Biến thể không có `s-9` → `s-5.globalVehicleId=9`, `revision+1`, candidates migrate; xóa `s-9` trong sample để thấy happy path.
- **Storyboard**: hai hàng node gid; cung mũi tên alias old→new; session card trượt theo mũi tên khi remap; va chạm → hai card đỏ + khóa (conflict) với danh sách id bị skip; panel "hai kênh báo" hiển thị durable alias (ổn định) vs transient events (≤100 cuối, trôi đi). Bảng realtime: `alias | session(old)? | duplicate? | conflict`. Dòng pseudo 1–4.

### D4 `canonical-runtime-id-consumer` — Consumer đi theo dây chuyền alias

- **Nhóm**: Identity · **Prereq**: — · **Related**: `identity-alias-remap-backend` (đối ngẫu producer/consumer)
- **Code**: `frontend/src/domain/runtime.ts:191-202` — `canonicalRuntimeId`; dùng để khớp `session.globalVehicleId` với `vehicles[].global_id` trong App (theo builder-a `App.tsx:122-143` — chưa đọc lại ngữ cảnh đầy đủ nhưng symbol xác minh được).
- **Vai trò**: phía consumer, "canonical GID của tôi là gì?" — đi theo map `retired_global_ids` cho tới khi không còn alias; chu trình/giá trị xấu → `null` (identity_invariant_error ở caller).
- **Input**: `gid:int`, `aliases:Record<string,int>`. **Output**: `int|null`.
- **Pseudocode**:
  1. `visited = ∅`.
  2. `while gid ∈ aliases (key str)` (`:193`):
  3. `gid ∈ visited` → `null` (chu trình) (`:194-195`).
  4. `visited += gid`; `next = aliases[gid]`; `next` undefined / không safe-int / `<0` → `null` (`:196-197`).
  5. `next == gid` (self-loop) → return `gid` (`:198`); `gid = next`.
  6. Trả `gid` khi thoát vòng.
- **Cấu trúc dữ liệu**: `Set<number>` visited; lookup map.
- **Độ phức tạp**: O(L) thời gian, O(L) memory (visited set); L độ dài chuỗi alias, bounded bởi visited.
- **Edge cases / failure modes**:
  - `[code]` self-loop `{"5":5}` → trả 5 (không null) — alias tự tham chiếu coi như đã canonical.
  - `[code]` chu trình 5→7→5 → null; alias `{"4":"x"}`/`{"4":-1}`/`{"4":2.5}` → null — garbage input fail-closed.
  - `[edu]` null không phải "không có alias" — phân biệt: không alias → trả chính gid; alias hỏng → null → caller báo `identity_invariant_error`.
- **Sample**:
  ```json
  {
    "aliases": {"5": 9, "9": 12, "7": 8, "8": 7, "3": 5, "10": "oops", "11": 11},
    "queries": [5, 7, 3, 10, 11, 99]
  }
  ```
  **Expected**: `5→9→12` = **12**; `7→8→7` chu trình = **null**; `3→5→9→12` = **12**; `10` = **null** (giá trị xấu); `11` = **11** (self-loop); `99` không alias = **99**.
- **Storyboard**: đồ thị node số với cung alias; click một gid → animate nhảy theo cung, node đi qua tô vàng (visited); chu trình → vòng đỏ + badge null; self-loop → viền xanh quanh node; bảng kết quả `query | chain | result`. Controls: nhập gid, nút "inject cycle". Dòng pseudo 2–5.

---

## Nhóm E — Replay & config prerequisites

### E1 `replay-timestamp-pairing` — Ghép cặp frame replay theo `frame_timestamps.csv`

- **Nhóm**: Replay · **Prereq**: — · **Related**: `source-mode-live-gating`, `frame-cursor-monotonic-poll`
- **Code**: `backend/main_detect/two_camera.py:146-263` — `ReplaySession` (`REQUIRED_TIMESTAMP_COLUMNS:149-153`, `_load_timings:181-227`, `read_pair:229-258`); pacing `--replay-realtime` `:2496-2499`; wrapper resolve `run_two_camera_session.py:40-66, 119-125`.
- **Vai trò**: biến 2 video rời + CSV timestamp thành chuỗi frame-pair deterministic — mọi sai lệch (thiếu cột, idx gãy, ts đi lùi, video dư/thiếu frame) fail nhanh thay vì replay sai kín đáng.
- **Input**: `session_dir` chứa `raw_cam1.mp4`, `raw_cam2.mp4`, `frame_timestamps.csv`. **Output**: iterator `(frames, sequences, camera_timestamps_ns, timing)` per row; `None` tại clean EOF.
- **Pseudocode**:
  1. Validate dir + tồn tại CSV + 2 mp4 mở được (`:156-179`).
  2. `_load_timings`: cột bắt buộc `{frame_idx, cam1_monotonic_ns, cam2_monotonic_ns}` (`:185-190`); mỗi row `frame_idx` phải liên tục từ 1 (`:193-208`); per-cam `ts > 0` và **không đi lùi** (`< prev` lỗi; `= prev` OK — repeated frame `:209-218`); append `ReplayFrameTiming` (`:219-224`); rỗng → lỗi (`:225-226`).
  3. `read_pair`: hết timings → kiểm `capture.read()` còn frame → có dư → `RuntimeError` ("video nhiều hơn CSV") (`:231-244`); else `None`.
  4. Đọc 1 frame mỗi cam; EOF sớm → `RuntimeError` ("video kết thúc sớm") (`:247-255`); trả `timing.camera_timestamps_ns` (`:256-258`).
  5. `--replay-realtime`: `due = wall_started + src_now − src_started`; ngủ tới `due` (`:2496-2499`).
- **Cấu trúc dữ liệu**: `timings: list[ReplayFrameTiming]`; `_next_index`; `_eof_checked` one-shot; `captures{cam→VideoCapture}`.
- **Độ phức tạp**: O(R) load rows (R = số dòng CSV, memory O(R) giữ toàn bộ `timings`); O(1)/pair đọc frame — trừ decode video của cv2 (ngoài phạm vi port).
- **Edge cases / failure modes**:
  - `[code]` `frame_idx` bắt đầu từ 1 và liên tục — file export thiếu frame (drop lúc ghi) → lỗi ngay khi load, không phải lúc replay.
  - `[code]` `ts` bằng nhau giữa 2 row được cho phép (latest-frame capture lặp) — chỉ `<` mới lỗi (`:213-217`).
  - `[code]` video nhiều frame hơn CSV chỉ phát hiện ở EOF (lazy check one-shot `:232-244`).
  - `[lib]` `cv2.VideoCapture` decode mp4 — demo browser **không** port decode; mock `captures` bằng list frame giả, giữ nguyên logic pairing/pacing (giản lược tương đương — §X).
  - `[code]` `capture_unix_ns`/`wall_time_iso` optional (default `0`/`""`) — chỉ monotonic ns bắt buộc.
- **Sample** (CSV 5 dòng + video cam1 4 frame, cam2 5 frame → demo cả happy và lỗi):
  ```json
  {
    "csv": [
      {"frame_idx": 1, "cam1_monotonic_ns": 1000000000, "cam2_monotonic_ns": 1050000000},
      {"frame_idx": 2, "cam1_monotonic_ns": 1200000000, "cam2_monotonic_ns": 1250000000},
      {"frame_idx": 3, "cam1_monotonic_ns": 1400000000, "cam2_monotonic_ns": 1450000000},
      {"frame_idx": 4, "cam1_monotonic_ns": 1400000000, "cam2_monotonic_ns": 1650000000}
    ],
    "video_frames": {"cam1": ["f1","f2","f3","f4"], "cam2": ["g1","g2","g3","g4","g5_extra"]},
    "wall_started": 1000.0, "src_started_ns": 1000000000
  }
  ```
  **Expected**: pairs (f1,g1)…(f4,g4) với timestamps; row4 cam1 ts lặp 1.4e9 → hợp lệ (equality); sau 4 pair → EOF check: cam2 còn `g5_extra` → `RuntimeError`. Variant lỗi: `frame_idx` 1,2,4 → `ValueError` tại row3; `cam1` row2 ts `900000000` < prev → `ValueError`; thiếu cột `cam2_monotonic_ns` → `ValueError` ngay header. Pacing `--replay-realtime`: src_now=1.4e9, `due=1000+0.4` → ngủ tới wall 1000.4.
- **Storyboard**: hai dải film cam1/cam2 + thước timestamp ns chung; từng pair khóa lại bằng khung nối; marker `frame_idx` chạy; lỗi hiển thị cờ đỏ tại đúng dòng CSV với lý do; toggle `--replay-realtime` bật đồng hồ wall vs src. Bảng realtime: `row | idx ok | ts monotone | pair | EOF check`. Controls: chọn lỗi inject từ dropdown. Dòng pseudo 2–5.

### E2 `gate-config-validate-save` — Validate/atomic-save gate config + prerequisite world

- **Nhóm**: Config · **Prereq**: `directed-crossing-direction` · **Related**: `entry-session-creation`, `segment-intersection-orientation`
- **Code**: `backend/gate_session_controller.py:190-221` — `_point`/`_normalize_gate`/`load_gate_config`; `:405-410` — unit match per snapshot; `:874-880` — runtime-mode yêu cầu `coordinate_space=="world"`; `backend/main_detect/runtime_server.py:25-49` — `_gate_point`/`_gate_line` (finite coords, direction enum, endpoints khác `hypot ≥1e-6`), `:52-69` — `normalize_gate_config` (world+unit+match runtime), `:72-81` — `save_gate_config` atomic; file `backend/main_detect/config/gate_zones.json`.
- **Vai trò**: hai mức kiểm chứng khác nhau trên cùng một file — runtime-server chặt khi ghi (POST), controller lỏng hơn khi đọc (không bắt `coordinate_space`, nhưng runtime-mode từ chối non-world; unit mismatch với runtime → raise ngay lúc snapshot đầu).
- **Input**: `payload` JSON hoặc path file. **Output**: normalized config `{coordinate_space, unit, entry_gate{name,p1,p2,direction}, exit_gate}` hoặc `ValueError`.
- **Pseudocode**:
  1. `load_gate_config`: chọn path → default `config/gate_zones.json`, fallback legacy `frontend/public/gate_roi.json` (`:210-215`); `coordinate_space` default `"legacy_svg"`, `unit` có thể None (`:216-221`).
  2. `_normalize_gate`: `direction ∈ {positive,negative}` (default `positive` phía controller!) (`:199-201`); `p1/p2` float (`:190-193`).
  3. `main()`: `source=None` (runtime mode) và `coordinate_space != "world"` → `SystemExit` hướng dẫn vẽ cổng ở `/monitor` (`:874-880`).
  4. `process_snapshot`: `configured_unit` và `runtime_unit` đều có và khác → `ValueError` (`:405-410`).
  5. POST phía runtime: `coordinate_space=="world"` bắt buộc, `unit` bắt buộc + khớp runtime (`:55-61`), endpoints `hypot(p2−p1) ≥1e-6` (`:42-43`), coords finite (`:29-30`); ghi tmp→replace (`:72-81`).
- **Cấu trúc dữ liệu**: config dict 2 gate; scalar unit.
- **Độ phức tạp**: O(1); memory O(1).
- **Edge cases / failure modes**:
  - `[code]` controller `_normalize_gate` **default `direction="positive"`** khi thiếu (`:199`) — file thiếu direction được "sửa lặng" thay vì lỗi như phía runtime (`:37-39` bắt buộc); file-mode/legacy tolerance.
  - `[code]` `unit=None` phía controller → bỏ qua check bước 4 (chỉ check khi cả hai có) — config thiếu unit vẫn chạy, khác runtime-server.
  - `[docs-mismatch]` runbook replay trỏ `--gate-config` tới `config/sessions/<S>/gate_zones.json` không tồn tại → `load_gate_config` raise → controller thoát ngay (C §5-D2) — prerequisite bắt buộc bị bỏ sót trong docs.
  - `[edu]` đổi chiều `p1↔p2` giữ cùng `direction` → nghĩa đảo chiều (B2) — config vẫn "hợp lệ" nhưng semantics sai.
- **Sample**:
  ```json
  {
    "candidates": [
      {"id": "ok", "coordinate_space": "world", "unit": "cm",
       "entry_gate": {"p1": {"x": 39.7, "y": 8.9}, "p2": {"x": 38.9, "y": -6.0}, "direction": "positive"},
       "exit_gate":  {"p1": {"x": 50.8, "y": 63.4}, "p2": {"x": 49.4, "y": 51.4}, "direction": "negative"}},
      {"id": "bad_dir", "coordinate_space": "world", "unit": "cm", "entry_gate": {"p1": {"x": 1, "y": 1}, "p2": {"x": 2, "y": 2}, "direction": "inward"}},
      {"id": "degenerate", "coordinate_space": "world", "unit": "cm", "entry_gate": {"p1": {"x": 1, "y": 1}, "p2": {"x": 1, "y": 1}, "direction": "positive"}},
      {"id": "wrong_space", "coordinate_space": "legacy_svg", "unit": "px", "entry_gate": {"p1": {"x": 1, "y": 1}, "p2": {"x": 2, "y": 2}, "direction": "positive"}},
      {"id": "unit_mismatch", "coordinate_space": "world", "unit": "m", "entry_gate": {"p1": {"x": 1, "y": 1}, "p2": {"x": 2, "y": 2}, "direction": "positive"}}
    ],
    "runtime_unit": "cm"
  }
  ```
  **Expected** phía runtime POST: `ok` pass; `bad_dir` → "direction must be positive or negative"; `degenerate` → "endpoints must be different"; `wrong_space` → "coordinate_space must be world"; `unit_mismatch` → "unit 'm' does not match runtime unit 'cm'". Phía controller: `wrong_space` load được (`legacy_svg`) nhưng `main()` runtime-mode SystemExit; `unit_mismatch` chỉ nổ khi snapshot đầu có `coordinate_space.unit="cm"` → `ValueError` bước 4.
- **Storyboard**: form JSON trái → pipeline 5 badge validate (space/unit/direction/endpoints/unit-match) sáng tuần tự; hai cột "runtime POST (chặt)" vs "controller load (lỏng + runtime-mode gate)" so sánh kết quả từng candidate; nút "POST" animate tmp→replace; badge "load-once-at-boot — restart cần thiết" (C §7-R6). Bảng realtime: candidate → verdict từng phía. Dòng pseudo 1–5.

---

## X. Thuật toán dùng thư viện ngoài & mức giản lược demo

| Algo | Lib ngoài trong code gốc | Demo browser |
|---|---|---|
| `qr-token-issuance-ttl` | `secrets.token_urlsafe(12)` (CSPRNG); `qrcode.toDataURL` (render bitmap, `EntryQRKiosk.tsx:2,74`) | Token giả cố định (`"demo-token-abc"`); QR bitmap **giản lược** (placeholder hoặc lib JS tương đương) — phần được mô phỏng là TTL/sort/pick, **không** claim port QR ECC |
| `replay-timestamp-pairing` | `cv2.VideoCapture` decode mp4 | Mock `captures` = mảng frame giả; **port đúng** toàn bộ logic CSV/EOF/pacing — không decode video |
| `atomic-session-store` | `tempfile`, `os.fsync`, `os.replace` | Mô phỏng 2 slot `tmp/final` trong memory — semantics giữ nguyên |
| Các algo còn lại (20/23) | Không | Port 1-1 được (pure logic: geometry, FSM, cursor, TTL, ordering) |

**Không có** `cv2/numpy/lap` trong phạm vi builder-c — detection/tracking/GID-matching thuộc builder-b.

---

## Y. Đề xuất lesson (đủ phủ scope, gộp có lý do)

| # | Lesson | Algos | Lý do gộp |
|---|---|---|---|
| L1 | Vạch cổng: giao cắt + hướng | B1, B2 | Một bài toán hình học — giao cắt vô hướng → chiều có hướng |
| L2 | Continuity & cứu entry | B3, B5 | Hai lớp bảo chứng cho "crossing tin cậy" |
| L3 | Vòng đời session tại cổng | B4, B6, C1 | Entry→create, exit→delete đặt trên nền FSM — một câu chuyện |
| L4 | Snapshot v2 producer | A1, A2 | Build payload + derive camera health cùng một hàm |
| L5 | Freshness & cursor hai consumer | A3, A4, A5 | Cùng rule hai ngôn ngữ + nguồn gốc `source_mode` + polling order |
| L6 | QR issuance & waiting | C2 | Độc lập; kèm edge claim-quá-hạn |
| L7 | Concurrency & reservation | C3, C4 | Revision/idempotency và availability chain cùng là "chống double-booking" |
| L8 | Persistence | C5, C6 | Cache nóng + atomic file — hai mặt cùng bài toán |
| L9 | Episodes & legacy dwell | D1, D2 | Đối chiếu v2-authoritative vs v1-evidence — một lesson hai thế hệ |
| L10 | Identity remap hai phía | D3, D4 | Producer-side remap + consumer-side chain — đối ngẫu tự nhiên |
| L11 | Replay & prerequisites vận hành | E1, E2 | "Chạy lại đúng như live": pairing timestamp + config gating |

**11 lessons / 23 algos** — phủ toàn bộ scope giao; không lesson nào >3 algos trừ L3/L5 (chuỗi nhân quả tự nhiên).

---

## Z. Checklist coverage theo file/symbol

| File | Symbols đã phủ | Algo |
|---|---|---|
| `backend/gate_session_controller.py` | `check_line_intersection` `:229-239`, `get_crossing_direction`/`_crossed_in_valid_direction` `:242-256`, `_recent_measured_entry_crossing` `:259-309`, `GateSessionCoordinator.__init__` `:312-341`, `_apply_alias_table` `:343-371`, `_apply_merge_events` `:373-399`, `process_snapshot` `:401-626`, `_apply_parking_episodes` `:628-703`, `_runtime_snapshot` `:706-712`, `_sample_snapshot` `:715-735` (nhắc trong C4/E2), `_validate_selection` `:69-89`, `_spot_is_available` `:92-100`, `_fresh_live` `:103-125`, `_parked_evidence_seconds` `:128-144`, `_remember_runtime_snapshot`/`_latest_spot_availability`/`_latest_runtime_id` `:147-187`, `_point`/`_normalize_gate`/`load_gate_config` `:190-221`, `SessionAPIRequestHandler` `:738-846` (không phải algo — route/CORS), `start_api_server`/`parser`/`main` `:849-912` | B1,B2,B3,B4,B5,B6,C4,C5*,D1,D2,D3,A3,A5,E2 |
| `backend/session_manager.py` | `QR_DISPLAY_SECONDS` `:29`, `_LIVE_OBSERVATIONS`+helpers `:32-46`, exceptions `:49-64`, `now_iso`/`_parse_iso`/`_qr_expires_at` `:67-88`, `atomic_write`/`load_json` `:91-123`, `_normalize_session` `:126-153`, `load/save_sessions` `:156-168`, `get_session`/`_matches_runtime`/`find_session_by_global_id` `:171-197`, `list_waiting_sessions` `:200-217`, `list_navigation_reservations` `:220-252`, `create_session` `:255-313`, `_mutate_session` `:316-352`, `claim_session` `:355-368`, `select_spot` `:371-389`, `set_parked`+`_by_global_id` `:392-436`, `apply_departure_episode` `:439-446`, `set_exit_navigation` `:449-468`, `update_global_vehicle_observation` `:471-502`, `update_track_position` `:505-513` (legacy helper — ghi trong C1 note), `remap_global_vehicle_id` `:516-571`, `delete_session`/`_by_global_id`/`close_session` `:574-600`, CLI `:603-652` | C1,C2,C3,C4,C5,C6,B6,D3 |
| `backend/main_detect/src/techgar/runtime_contract.py` | toàn bộ `:12-168` | A1,A2 |
| `backend/main_detect/two_camera.py` | `ReplaySession` `:146-263`, args `:1737-1750`, pacing `:2496-2499`, publish `:2841-2869` | E1,A4 |
| `backend/main_detect/runtime_server.py` | `_gate_point`/`_gate_line`/`normalize_gate_config`/`save_gate_config` `:25-81`; `RuntimeState.publish_snapshot` `:106-114` (context A1) | E2 |
| `backend/main_detect/run_two_camera_session.py` | `_resolve_raw_session`/`prepare_args` `:40-126` | E1,A4 |
| `frontend/src/domain/runtime.ts` | `liveRuntimeError` `:116-141`, `canonicalRuntimeId` `:191-202`, types `:60-108` | A3,D4 |
| `frontend/src/app/App.tsx` | `requireLiveRuntime` `:272-287` | A5 |
| `frontend/src/api/runtimeApi.ts` | `getRuntimeSnapshot` dedupe/retry `:4-36` | A5 |
| `frontend/src/components/EntryQRKiosk.tsx` | expiry/pick/timer `:6-68` | C2 |
| `frontend/src/hooks/useVehicleSession.ts` | `expected_revision`/`action_id` `:157-160` (verify bằng grep; nội dung commit/reconcile thuộc phạm vi builder-a §5.1) | C3 |
| `backend/main_detect/config/gate_zones.json` | schema/2 gate `:1-30` | E2,B2 |

`SessionAPIRequestHandler` (route dispatch, CORS, JSON encode) và `start_api_server`/`parser`/`main` **không** được liệt kê là algorithm — đúng yêu cầu "không nhầm API endpoint thành algorithm". `update_track_position`/`close_session` là shim legacy, ghi chú trong C1 thay vì algo riêng.

---

## Phần chưa xác minh / giới hạn

- `[giả định]` `useVehicleSession.ts` nội dung commit/reconcile chỉ xác minh bằng grep `:157-160` + cross-ref builder-a §5.1 — dossier trích contract `expected_revision/action_id`, không tái phân tích FSM phía FE (ranh giới builder-a).
- `[giả định]` `App.tsx:122-143` (caller của `canonicalRuntimeId` → `identity_invariant_error`) chưa đọc lại toàn văn trong phiên này — lấy từ builder-a §5.4; symbol đã xác minh tồn tại.
- `[chưa xác minh]` hành vi thực thi replay `--live-mode` + gate per-session chỉ là phân tích tĩnh (C §9) — không chạy E2E.
- `[chưa xác minh]` ngữ nghĩa `recent_observed_path` ở producer (manager-export, "measured không phải Kalman") chỉ có comment contract `:266-274` + `runtime_contract.py:109-117` — nội dung producer thuộc builder-b.
- `[docs-mismatch đã ghi nhận]` replay thiếu `--live-mode` (D1), thiếu `gate_zones.json` per-session (D2), QR docs 10 s vs code 120 s (C2), claim không chặn expiry (C2), `?session=ALL` cũ, off-route 75 vs 80 (ngoài scope), layout 160 vs 60 (ngoài scope).
- **Đã thực thi fixture**: chạy script Python local deterministic (không server, không sửa production) kiểm chứng numeric samples — B1 (orient/intersect + quirk float-residual), B2 (d=±119.22, parallel/collinear d=0), B3 (mô phỏng continuity port 1-1), B5 (rescue True/False), B6 (d=−46.30/+49.19), A1/A2 (age_ms 100/60), A3 (ISO timezone ages 0.5/25200.5/−1.5/7.0). Chi tiết pass/fail ở `.analysis/algos/builder-c-review.md`. Các expected còn lại (C1 FSM, C2 pick, C3–C6, D1–D4, E1–E2) là suy diễn tĩnh đã đối chiếu code trực tiếp.
- Không chạy dịch vụ/camera/API trong phiên dossier này — demo web vẫn cần port + tự test lại.
