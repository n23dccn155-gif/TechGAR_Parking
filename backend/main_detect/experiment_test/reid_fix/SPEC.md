# SPEC — Vehicle ID recovery sau khi rời ô đỗ (root cause đã xác minh)

Trạng thái: DRAFT chờ duyệt — mô tả expected lifecycle, invariants và phạm vi sửa.
Không hard-code session/frame/ID.

## 1. Root cause (evidence: session_thai8, cùng pattern ở replay R0)

Xe đen `gid4` đậu `F01` (cam1). Timeline predictions.jsonl:

- f1660 `departure_token_created` (F01, `expires_in_ms=5000`, reason=motion_started_in_parked_slot)
- f1661+ candidate `('cam1',23)` được ghi evidence trong token (observations đếm tới 161)
- f1661→1841: mỗi frame `parking_recovery` ghi `reason=insufficient_outward_evidence`:
  `moved_px` tăng 0→220 nhưng `outward_px` kẹt ≈ −40, `radial_gain_px` −44→+99,
  `world_direction_cosine` dao động −0.9→+0.9
- f1686 episode→`departing` (vision_confirmed_empty — slot đã EMPTY)
- f1727→1835: `departure_token_retention_extended` ×14 (`candidate_evidence_in_progress`)
- f1841 `departure_token_expired_with_pending_candidates` (blocker=`qualified_candidate_unconsumed`,
  `world_trajectory_qualified=true`, `qualified_predeparture=false`)
  → episode `released` (`recovery_expired`) + `parked_id_recovery_expired`
- f1842 `global_id_created gid7` cho cùng local track; gid4 reject `parked_reservation_origin_miss`
- f1863 gid7 parked F05 — cùng xe vật lý, ID mới

### RC1 — binder: gate "outward" sai hình học (slot_vehicle_binder.py L3299–3361)

`qualified_predeparture` yêu cầu `legacy_outward_ready` cho same-camera
(`world_outward_ready` chỉ áp dụng khi `is_cross_camera`). Legacy test:

```
first_vector = evidence.first_center - token.center
outward_unit = first_vector / |first_vector|      # chỉ khi |first| >= 0.35*diag
outward_px   = dot(point - first_center, outward_unit)
require: moved_px>=3 AND outward_px>=1.5 AND radial_gain>=0.75
```

`first_center` được chốt tại frame evidence tạo (f1661 — xe đang ở mép ô, anchor lệch
khỏi tâm theo trục vuông góc hướng ra). `outward_unit` vì thế sai → `outward_px`
âm vĩnh viễn dù xe đi 220px ra ngoài. Evidence migration (f1779 L23→L25→L23) giữ
nguyên first_center sai → không bao giờ tự sửa. Kết quả: candidate qualified theo
world-trajectory (`world_trajectory_qualified=true`) nhưng kẹt mãi ở
`insufficient_outward_evidence` → token không consume → hết hạn.

### RC2 — manager: reservation gate loại đúng xe cũ (cross_camera_manager.py L1904–1935, 5835–5853)

`_fragment_starts_outside_reservation` dùng `trajectory.provisional_samples(key)[0]`.
Trail của fragment bị `provisional_trajectory_forgotten` f1677 giữa chừng rời ô →
mẫu sớm nhất còn lại nằm ngoài corridor → `parked_reservation_origin_miss` →
gid4 không được compete → f1842 cấp gid7.

Kết hợp: reservation được giữ grace (đúng thiết kế "long window") nhưng gate
origin_miss vô hiệu hoá nó đối với chính xe đang rời.

### Contributing

- Ordering: `manager.update_all_tracks` (cấp GID) chạy TRƯỚC `binder.update_tracks`
  (token expiry/release) trong cùng frame → quyết định new-ID dùng reservation stale.
- `empty_seconds=1.0` vision_empty đã chuyển slot EMPTY sớm — hợp lệ cho slot state,
  nhưng lifecycle ID phải độc lập (slot empty ≠ delete identity) — hiện đã đúng,
  vấn đề nằm ở recovery path.

## 2. Expected lifecycle (contract)

```
PARKED(gid, slot)
  → motion/vision empty → DEPARTING (departure_token mở, reservation giữ)
  → fragment(s) xuất hiện → evidence tích luỹ
  → RECOVERED(gid) khi candidate chứng minh là cùng xe:
        world-trajectory qualified  HOẶC  (pixel) escape-from-slot evidence
  → nếu fragment chết mà chưa recover: token hết hạn → RELEASED
        → gid vào DORMANT gallery (retention = identity_retention_*)
  → fragment mới trong window → dormant/world-trajectory ReID → REIDENTIFIED(gid)
  → hết window mà không match → EXPIRED → fragment mới được phép cấp GID mới
```

## 3. Invariants

1. **Identity**: cùng xe vật lý trong cùng session → cùng GID; GID mới chỉ khi không
   có candidate hợp lệ nào.
2. **Slot**: `slot=EMPTY` không xoá identity; reservation là *origin hint* cho ReID,
   không phải khóa chặn.
3. **Retention**: GID vừa rời ô được giữ trong dormant gallery tới
   `identity_retention_seconds`; departure token tới `recovery_retention + extension`.
4. **Allocation**: local track đang là *qualified candidate* (world-trajectory hoặc
   pixel escape) của token/reservation/dormant identity → KHÔNG được cấp GID mới
   trong cùng điều kiện đó; nếu token vừa expire, frame kế tiếp phải cho dormant/world
   ReID chạy trước allocator.
5. **Cleanup**: chỉ cleanup identity khi hết retention hoặc có evidence là xe khác.
6. **Ordering deterministic**: trong 1 frame — tracker → binder token/candidates →
   ReID/recovery (token consume + dormant + world) → allocator (new-ID).
   (Điều chỉnh chỗ này trong `two_camera.py` nếu Phase 3 xác nhận cần.)
7. **Bounded memory**: mọi retention pool có TTL/size cap (đã có; không nới).

## 4. Fix design (đề xuất, theo RC)

### F1 — slot_vehicle_binder.py: outward gate theo escape-from-slot
Thay/chấp nhận cho `legacy_outward_ready` một bằng chứng bền vững:
- `world_trajectory_qualified==True` → outward evidence coi như thoả (áp dụng cả
  same-camera: trajectory đã chứng minh fragment là continuation của departure).
- Fallback pixel: đo **escape** thay cho dot(first_vector): `signed_polygon_distance`
  của `first_center` ≥ -(ε) tại origin VÀ `point` hiện tại < -(min_escape_px) — tức
  fragment đi từ trong/sát ô ra ngoài ô — hoặc `radial_now - min(radial_seen)`
  ≥ `recovery_min_radial_gain_px` (lấy min toàn cục, không phụ thuộc hướng first).
Giữ nguyên: appearance gate, size gate, evidence_frames, ambiguity margin.
Rủi ro: cho phép fragment lân cận khớp dễ hơn → giảm bằng cách chỉ áp dụng escape
path khi `world_trajectory_qualified` hoặc appearance đã pass; không đổi ngưỡng.

### F2 — cross_camera_manager.py: reservation-origin check bền vững
`_fragment_starts_outside_reservation`: ngoài `provisional_samples()[0]`, chấp nhận
"origin membership" nếu trail có sample nằm trong corridor của reservation slot
HOẶC fragment liên tục kể từ khi slot empty (handoff/dormant trajectory global
samples của gid). Cụ thể: nếu provisional trail bị rỗng/forgotten → không dùng
origin_miss để *reject*; chuyển quyết định về các gate appearance/distance vốn có.
Giữ reject cho fragment có bằng chứng dương bắt đầu xa slot (chống cướp ID xe khác).

### F3 — allocation ordering (nếu Phase 3 verify cần)
Đảm bảo sau `recovery_expired`, fragment pending candidate được giữ làm
"recovery pending" tới hết dormant-ReID pass của frame kế, trước khi allocator
xem xét — hoặc: expiry của token đánh dấu gid vào dormant ngay trong cùng
`binder.update_tracks`, và manager.check trước new-ID. Chỉ làm nếu F1+F2 chưa đủ
(đo bằng replay: có còn `global_id_created` ngay sau expiry không).

## 5. Test plan

Unit (mới):
- binder: fragment với first_center lệch trục nhưng world_trajectory_qualified →
  consume được (fails trước fix); fragment từ ô khác không match appearance → vẫn reject.
- manager: reservation + fragment có trail bắt đầu ngoài corridor nhưng
  trajectory forgetten mid-departure → không reject origin_miss; fragment bắt đầu
  chứng minh được ở xa slot và appearance khác → vẫn reject (negative).
- ordering: mô phỏng expiry→new-ID trong cùng chuỗi frame (không hard-code số).

Regression: replay đủ frame 4 session (thai7, thai8, thai6, hiep_thai5) —
predictions phải: thai8 xe_den 1 GID xuyên F01→F05; thai7 xe_den & xe_xanh không
đổi ID; không thêm false-merge; pytest 444+53 pass.

## 6. Files dự kiến chạm

- `src/techgar/slot_vehicle_binder.py` — outward/escape gate (F1)
- `src/techgar/cross_camera_manager.py` — `_fragment_starts_outside_reservation` /
  `_reserved_identity_may_compete` (F2), có thể allocation defer (F3)
- `two_camera.py` — chỉ nếu F3 cần reorder
- `src/techgar/trajectory_memory.py` — chỉ nếu cần first-sample bền vững
- tests mới: `tests/test_departure_recovery_outward.py`,
  `tests/test_parked_reservation_origin.py` (tên theo convention)
- observability: giữ `slot_recovery_candidate` diagnostics; thêm event cho
  consume-path reject reasons nếu thiếu
