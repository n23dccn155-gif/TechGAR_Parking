# Cross-review — đối chiếu A / B / C (Phase 1 V2)

Phạm vi: kiểm chứng **thứ tự gọi thật** và **ranh giới stage** giữa ba
dossier (`builder-a.md` local-CV, `builder-b.md` handoff+occupancy,
`builder-c.md` orchestration→snapshot→gate→frontend) so với source.
Phương pháp: đọc lại callsite trong `two_camera.py` + module liên quan,
đánh dấu verdict KHỚP / SỬA / PENDING.

---

## 1. Verdict tổng — thứ tự loop khớp nhau

Ba bảng call-order (A §1, B §1, C §1) **khớp nhau và khớp source**. Thứ
tự authoritative trong `two_camera.run()` mỗi vòng lặp:

| # | Stage | Callsite | A | B | C |
|---|-------|----------|---|---|---|
| 1 | read pair + `synchronize_live_frames` | `two_camera.py:2460-2485` | ✓ | ✓ | ✓ |
| 2 | `binder.begin_frame()` | `:2508-2509` | ✓ | ✓ | ✓ |
| 3 | áp parking evidence (futures / inline replay) → `update_vision` | `:2515-2667` | ✓ | ✓ | ✓ |
| 4 | `sync_parking_identity_reservations` (pre) | `:2672-2677` | ✓ | ✓ | ✓ |
| 5 | `tracker.process_frame` + notify lost/expired | `:2679-2716` | ✓ | ✓ | ✓ |
| 6 | `manager` occluded/independent/`observe_trajectories` | `:2718-2735` | ✓ | ✓ | ✓ |
| 7 | `prepare_predeparture_tokens` + `recover_departing_vehicle_ids` | `:2736-2773` | — | ✓ | ✓ |
| 8 | `manager.update_all_tracks` → GID | `:2779-2784` | ✓ | ✓ | ✓ |
| 9 | `cancel_observed_recovery_tokens` | `:2786-2791` | — | ✓ | (gom bước 8) |
| 10 | binder `remap`/`update_tracks`/`finalize_arrivals` | `:2793-2806` | — | ✓ | ✓ |
| 11 | `sync_parking_identity_reservations` (post) | `:2808-2813` | — | ✓ | ✓ |
| 12 | `to_json` → `build_runtime_snapshot` → publish | `:2816-2871` | — | ✓ | ✓ |

Mô hình chung ba bên thống nhất: **1 loop tuần tự + 1 nhánh parking
song song (live) + N consumer async**. Không bên nào ép tuyến tính.

## 2. Điểm đã sửa trong dossier C sau đối chiếu

| # | Vấn đề | Source truth | Xử lý |
|---|--------|--------------|-------|
| 1 | §4 Q1 nói "áp evidence → begin_frame" — lệch diagram | `begin_frame` :2508-2509 **trước** evidence :2515 | Đã sửa Q1 theo callsite |
| 2 | §3.2 tả "ROI → motion" đơn giản | Thật: `_predict_tracks` trước detect (:2228); trong `_detect`: MOG2 :768 → motion-gate `support∧fg` :790-793 → ROI context :794-816 → per-blob gates :828+ (A §1/§3.2-3.4 verify) | Đã viết lại §3.2 theo chuỗi MOG2→motion→ROI |
| 3 | Vote occupancy chưa ghi ngưỡng | `required_votes = total_combinations // 2 = 12` (`parking_detector.py:533`); `is_free = empty_votes ≥ 12` (:539); core-rescue/edge-recheck lật (:560-570) | Đã ghi **≥12/25** tại §3.4 |
| 4 | Off-route threshold mơ hồ | engine default `thresholdPx=75` (`voiceGuidance.ts:98`); callsite App truyền **80** (`App.tsx:746-750`) | Đã cite cả hai tại §3.9 |
| 5 | QR 120 s diễn tả chưa đủ | `qrExpiresAt` chỉ filter `list_waiting_sessions` (:200-217) + `isQrVisible` kiosk; **`claim_session` không check expiry** (:355-368); không job xoá session theo TTL | Đã ghi SOURCE QUIRK tại §3.8/§5 |
| 6 | Một "TẠI SAO" pha suy luận | RLock re-entrant source-documented chỉ cho select atomicity (`session_manager.py:225-230`); lập luận race poll↔API là suy luận | Đã đánh dấu *[suy luận]* |

## 3. Điểm khớp quan trọng giữa các ranh giới

- **Vision-trước-identity**: C §1 + B bước 3 + A bảng §1 đều ghi evidence
  parking áp trước `update_all_tracks` — comment chủ ý source
  `two_camera.py:2511-2514`. ✓
- **Feedback hai chiều binder↔manager**: `protected_local_keys`/
  `protected_global_ids` vào `update_all_tracks` (:2764→2779) và
  `canonical_global_id` remap ngược vào binder (:2794). B mô tả chi tiết,
  C chỉ mức orchestration — không mâu thuẫn. ✓
- **Output tracker → manager+binder**: `newly_lost`/`expired` hai kênh
  notify khác nhau (A bảng §4, C §3.2 gọi đúng callsite :2690-2716). ✓
- **Episode là authority đỗ ô**: B S9 (`_open_parking_episode`,
  `slot:G<id>:F<frame>`) khớp contract C (`runtime_contract.py:50-54,
  153-159`) và consumer semantics gate (`gate_session_controller.py:
  628-703`, v1 path bị `continue` ở v2 :556-557). ✓
- **Không deep-ReID**: B verify `use_deep_reid` ép `False`
  (`cross_camera_manager.py:391-397`) — appearance = gallery histogram.
  C không claim gì ngược lại. ✓
- **Consumer async**: C §3.6-3.9 (mailbox latest-only, poll 0.25 s/200 ms)
  không phụ thuộc nội hàm A/B; khớp với B "hai làn giao nhau". ✓

## 4. Discrepancy phía B — ĐÃ ĐÓNG (B cập nhật 16:39)

1. **Ngưỡng vote occupancy — RESOLVED ✓**: B bản mới ghi
   `empty_votes ≥ required_votes = 25//2 = 12` → `is_free`, và nói rõ
   "không có counter occupied_votes — occupied là phần bù"
   (`builder-b.md` §⑥/S7/§196). Khớp source `parking_detector.py:533,539`
   và khớp C §3.4.
2. **Storyboard label — RESOLVED ✓**: shot 5 giờ ghi
   `occupied (empty_votes 5 < 12)` — đúng hướng phiếu empty.
3. **Defaults gắn runtime args**: B đã đổi sang cite cờ chạy thật —
   `occupied_seconds` = `--parking-occupied-seconds` (0.5,
   `two_camera.py:2274`), `vision_occupied_streak ≥ 2` =
   `--slot-arrival-vision-confirmations`. Số "minh họa" giờ đúng
   production default.

## 5. Điểm C kiến nghị SPEC giữ đúng (qua đối chiếu 3 bên)

- Diagram pipeline final = C §1 (đã khớp A/B): vẽ **3 lớp** — loop tuần
  tự / nhánh parking song song / consumer async; không được dựng lại
  thành một mũi tên thẳng.
- Thứ tự trong ô tracking (A): MOG2 → motion-gate → ROI → blob cascade —
  nếu SPEC minh hoạ stage con, dùng chuỗi này, không dùng "ROI trước".
- Occupancy: vote `empty_votes ≥ 12/25` + core-rescue + edge-recheck +
  smoothing (`occupied_seconds=0.5`, `empty_seconds=1.0`) → `is_free`;
  `occupied` là phủ định của is_free — không có "phiếu occupied" riêng.
- QR/session: TTL 120 s = visibility-only; claim không reject expiry;
  session xoá chỉ bởi exit-gate crossing; alias/merge remap GID giữ QR
  sống. Off-route: engine default 75 px, App dùng 80 px — SPEC nên ghi
  "80 tại callsite" hoặc cả hai.

## 6. Còn mở / không block

- Mục 4 đã đóng hoàn toàn sau bản B mới — không còn discrepancy giữa
  ba dossier về thứ tự gọi, ranh giới, hay số liệu production.
- A §4 đã ghi ranh giới feedback `priority_regions`/`sync_reservations`
  khớp C; nếu A đổi mô tả nhánh parking, C chỉ cần kiểm lại §3.4.
- Không ai chạy stack thật trong Phase 1 — mọi kết luận đều từ đọc
  source + callsite, chưa có runtime observation.

*Verdict FINAL: ba dossier (A local-CV · B handoff+occupancy · C
orchestration/snapshot/gate/frontend) nhất quán với source và với nhau.
Diagram C §1 + bảng call-order §1 của review này sẵn sàng làm input cho
LEAD compile SPEC.*
