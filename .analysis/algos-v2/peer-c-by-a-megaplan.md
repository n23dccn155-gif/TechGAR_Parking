# Peer review — builder-c.md (7 thẻ) + pipeline-order.md — bởi A

**Đối tượng**: `builder-c.md` (7/7 thẻ: T1-1 ensemble, T1-2 binder, T2 polygon, T3-1 gate crossing, T3-2 session FSM, T3-3 snapshot contract, T3-4 A*/off-route/voice) + `pipeline-order.md`.
**Phiên bản verdict áp dụng** (recheck v2):
- `builder-c.md` — mtime 2026-10-04 18:31:59, 42 624 bytes, sha256 `07a9b81e4b2d55c8a55dd5939a6d7bb2e63fa49f89f3d8fb21090f0da93660ee`
- `pipeline-order.md` — mtime 2026-10-04 18:18:23, 10 080 bytes, sha256 `33465f1591b428de8e7a4057ffea072ee15a86e4a7570047252fddafc142d489`

**Phương pháp**: đọc trực tiếp `slot_vehicle_binder.py` (policy, `_sync_result`, `_overlap_geometry`, `_token_radius`), `parking_detector.py` (votes/params), `gate_session_controller.py` (crossing/session guard), `session_manager.py` (QR/CLOSED), `runtime_server.py` (mailbox), `routeEngine.ts`/`App.tsx`/`voiceGuidance.ts`/`useVehicleSession.ts` (routing+polls). Không sửa file C/source.

## Verdict: **PASS** — cả 7 thẻ + pipeline-order đều đạt mẫu §4, params khớp source. **0 issue còn mở ở bản đã hash** (xem §4).

## 1. Các mục LEAD flag trước — đã kiểm lại trên bản hiện tại

| Flag | Trạng thái trong bản này | Ghi chú |
|---|---|---|
| Polygon OFF/ON cùng cảnh | **FIXED** | storyboard giờ dùng X (tâm trong, 31%) và Y (tâm ngoài, 65%) — số giữ nguyên 2 nhánh; hai anchor (bbox-center :727 vs `_bottom_center` :573-574) đã phân biệt rõ :224-228 |
| "Hình thang không lồi" | **FIXED** | QA :290-293 ghi đúng: thang xiên vẫn lồi; giới hạn thật = ô lõm chưa verify config — gắn nhãn `[chưa verify]` đúng chuẩn |
| Gate QA lag ~2s | **FIXED** | giờ ghi cửa sổ ~1.0s **source-time** (`:302-306`), nói rõ là đồng hồ quan sát của xe không phải HTTP lag, "không hứa phục hồi mọi độ trễ" — source-fidelity đúng |
| Snapshot timeline .200 thấy S1 | **FIXED** | S1 chỉ tạo ở gate-poll .250; frontend .200 chỉ thấy frame 120, session thấy ở .500+ — nhất quán mailbox+poll |
| Session exit delete vs enum CLOSED | **FIXED** | :383-387 + bảng :430 ghi chính xác: `CLOSED` chỉ tồn tại ở read-filter (`session_manager.py`:190,:277,:531,:542,:556), không hàm nào ghi; runtime exit = `delete_session_by_global_id` xoá hẳn — verify bằng grep: chỉ đúng 5 dòng filter |
| Routing 60px silent reroute | **VERIFIED-đúng** | `freshRoute` tính **mọi tick vô điều kiện** (`App.tsx`:753-758), `speak` chỉ khi `currentOffRoute` (:760-762) → lệch <80px = reroute lặng lẽ, đúng mô tả |
| Heuristic "scale ≤1" | **FIXED (recheck v2)** | Bản hiện tại bỏ hẳn bound ≤1: ghi `h = euclid × min(edge.distance/euclid)`, "không khẳng định scale≤1", admissible theo cấu trúc min (`mọi edge.distance ≥ scale×euclid → h ≤ cost thật`, `builder-c.md`:571-575) — chính xác và không cần giả định `distance ≥ euclid`. **A rút lại gợi ý "≥1"** (gợi ý đó lỡ giả định dữ liệu cạnh, không cần thiết) |
| `core_scale` ref | **RESOLVED** | Cả hai bên đồng nhất `two_camera.py`:2270 (`core_scale=0.80` — đúng source; `svb:2268-2280` trong dossier C là dải `_bind_vehicle`, không liên quan) |

## 2. Tham số verify trực tiếp (≫3 yêu cầu)

| Param | C ghi | Source | Kết quả |
|---|---|---|---|
| required_votes | 12 (`25//2`) | `parking_detector.py`:533 | ✅ |
| `core_scale` | **0.80** prod vs 0.55 sig | `two_camera.py`:2270 · `pd:110` | ✅ |
| `use_edge_recheck` | **False** prod vs True sig | `tc:2267` · `pd:106` | ✅ |
| dwell | 0.5s/1.0s | `tc:1788-1789` → `:2274-2275` | ✅ |
| `policy` | `vision_primary` prod, occupied=vision only | `tc:2328` + `svb:3841-3847` (`binding.occupied = vision_occupied`, early-return) | ✅ |
| qualifies rule | `(center_inside ∧ ≥0.35) ∨ ≥0.60` | `svb:729-731` | ✅ |
| score weights | 0.70/0.20/0.10 | `svb:739` (kèm cap `min(1.0,score)` :743 — C không nhắc, nit) | ✅ |
| anchors | center_inside=tâm bbox :727; `_bottom_center` cho recovery :573-574 | khớp | ✅ |
| gate continuity | wall≤1.0s + source≤1.0s | `gate_session_controller.py`:483-493 | ✅ |
| recovered crossing | ≥2 mẫu cùng cam+local, gap≤1.0s, sau ≤1.0s | `:259-309` (docstring :266-274 "Kalman prediction/cross-camera jump cannot create a session") | ✅ |
| direction guard | `abs(cross)<1e-9` | `:254-255` | ✅ |
| QR 120s | `QR_DISPLAY_SECONDS=120.0`, chỉ lọc kiosk | `session_manager.py`:29; `claim_session` :355-368 **xác nhận không check expiry** (quirk đúng như C ghi) | ✅ |
| mailbox | freeze+encode ngoài lock, bytes bất biến | `runtime_server.py`:106-113 | ✅ |
| polls | 500ms reservations :191 · 500ms session `useVehicleSession:27` · 1000ms gate-roi :404 · runtime interval :354 | khớp | ✅ |
| off-route | callsite **80px** `App.tsx`:746-750 vs default 75 `voiceGuidance.ts`:98 | khớp | ✅ |
| speak cooldown | 7000ms | `App.tsx`:762 | ✅ |

## 3. pipeline-order.md

- Bảng N0–N15 khớp thứ tự A verify độc lập (`mt:2228-2335`, `tc:2680-2716`, N2 worker song song `:2632`, N1-in-N5, N14/N15 consumer async).
- **N12 row ĐÚNG**: ghi `policy vision_primary (:2328): occupied=vision_occupied duy nhất` + đánh dấu docstring one-way = legacy không chạy prod — **không còn mâu thuẫn LEAD flag** (đã sửa trước review này).
- J1 session-before-GID đúng: `create_session(global_vehicle_id)` đòi GID; record thiếu `global_id` bị skip (:461-462); physical-crossing-trước-GID được cứu bởi `recent_observed_path` — khớp source.
- §4 ghi đúng các lệch plan (N1-in-N5, N2 async, edge-recheck-off, feedback 2 chiều, replay khác live) — đồng ý từng mục.

## 4. Residual issues (bản đã hash)

1. **[FIXED — rút]** Heuristic `≤1` → C đã viết lại đúng (xem §1); A rút gợi ý `≥1`.
2. **[RESOLVED]** `core_scale` ref — đồng nhất `tc:2270`, đúng source.
3. **[NIT, không yêu cầu sửa]** `score` cap `min(1.0, score)` `svb:743` không nhắc; `_overlap_geometry` dùng diagonal của `cv2.boundingRect(polygon)` (:735) cho `center_proximity` khác helper `_slot_diagonal` (:577-579) — chỉ là độ chi tiết, không sai.

## 5. Kết luận

- **7/7 thẻ PASS**: T1-1, T1-2 (đặc biệt: vision_primary + legacy-docstring mâu thuẫn đã giải quyết đúng), T2, T3-1..T3-4 — params, callsite, quirk (QR-visibility-only, claim-no-expiry-check, 80-vs-75, mailbox latest-only, reroute-mọi-tick) đều fidelity cao.
- **pipeline-order.md PASS** — có thể làm chuẩn đối chiếu cho map.
- **0 issue mở** trên bản đã hash ở đầu file; mọi flag vòng trước đã sửa đúng source.
- Ranh giới A↔C đồng nhất: `priority_regions` `tc:2683` (C ghi feedback N1 đúng), suspend/dormant ở svb là phần B — A đã ghi cùng ranh giới.
