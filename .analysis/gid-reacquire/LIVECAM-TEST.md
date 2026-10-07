# LIVECAM-TEST — Hướng dẫn test `stationary_reacquire` trên livecam

Mục tiêu: verify nhánh re-acquire cuối (F1 rev2 / F2-a) — xe **đỗ yên mất
track rồi mọc lại** phải **giữ nguyên GID cũ** thay vì bị mint GID mới,
đồng thời **không merge nhầm** hai xe khác nhau.

Cờ: `--enable-stationary-reacquire` — **default OFF** (không truyền = hành
vi cũ nguyên vẹn, không event `stationary_reacquire_*` nào được emit).

---

## 1. Chạy runtime_server

### 1a. Cờ BẬT (build cần test)

```powershell
cd D:\TechGar2\backend\main_detect
.\.venv\Scripts\python.exe .\runtime_server.py `
  --cam1-url "http://192.168.100.53:4747/video/force/1280x720" `
  --cam2-url "http://192.168.100.198:4747/video/force/1280x720" `
  --slots-cam1 "config\parking_slots_cam1.json" `
  --slots-cam2 "config\parking_slots_cam2.json" `
  --calibration "config\two_camera.shared_cm_01.json" `
  --mask-cam1 "config\roi_mask_cam1.json" `
  --mask-cam2 "config\roi_mask_cam2.json" `
  --enable-stationary-reacquire `
  --api-port 8001 --no-display
```

### 1b. Cờ TẮT (baseline đối chiếu)

Giữ nguyên lệnh trên, **bỏ dòng `--enable-stationary-reacquire`**.
So sánh cùng kịch bản: flag-off sẽ mint GID mới khi xe đỗ yên mất track
mọc lại; flag-on phải reuse GID cũ.

Khuyến nghị: chạy session baseline trước, ghi nhận các điểm bug quen thuộc,
rồi chạy lại cùng tình huống với cờ bật.

---

## 2. Đọc event

### 2a. Trực tiếp từ runtime API

```powershell
curl http://127.0.0.1:8001/api/runtime/events | python -m json.tool | more
```

Lọc nhanh 3 loại event mới (PowerShell):

```powershell
(Invoke-RestMethod http://127.0.0.1:8001/api/runtime/events) |
  Where-Object { $_.type -like "stationary_reacquire*" }
```

Ring buffer chỉ giữ **200 event gần nhất** — với scene đông nên poll
định kỳ (vài giây/lần) hoặc đọc ngay sau khi tình huống vừa xảy ra.
Snapshot đầy đủ (`GET /api/runtime/snapshot`) cũng chứa `recent_events`.

### 2b. Từ predictions.jsonl nếu có ghi session

Mỗi record có trường `identity_events` (mirror `recent_events` tại frame
đó). Grep nhanh:

```powershell
Select-String -Path "<session>\predictions.jsonl" -Pattern "stationary_reacquire"
```

### 2c. Các trường quan trọng

| field | ý nghĩa |
|---|---|
| `type` | `stationary_reacquire_accepted` / `_rejected` / `_deferred` |
| `global_id` | GID được accept/reject; `null` trên deferred |
| `target_camera` / `target_local_id` | fragment (local track mới mọc lại) |
| `reason` | lý do reject/defer — enum bên dưới |
| `world_distance` | khoảng Euclidean (wu) fragment ↔ anchor của identity |
| `identity_last_world` | anchor nội bộ của identity; **`null` hợp lệ** — phân biệt "chưa từng thấy" vs "đã thấy nhưng mất state" |
| `member_drift_window` | `{member_cam, member_lid, f_lo, f_hi, drift_wu, velocity_wu_s, member_drift_stat}` — drift của member còn sống trong ±10f quanh event; `null` khi không có member hoặc không đủ sample |
| `competing_global_ids` / `competitors` | các identity cạnh tranh (deferral mơ hồ) |
| `appearance_distance` / `appearance_support` | khoảng màu (≤0.30 pass) / số sample corroborate |
| `size_distance` | mismatch bbox chuẩn hoá (≤0.90 pass) |
| `bbox_iou` | IoU anchor-projected ↔ fragment (corroboration band 3–5 wu) |
| `elapsed_s` / `elapsed_frames` | gap kể từ lần thấy cuối (log-only, không gate) |
| `deferred_since_frame` / `deferred_frames` | quarantine bắt đầu / đã kéo dài bao nhiêu frame |

**`reason` enum**: `distance`, `appearance`, `size`,
`stationary_history_missing`, `same_camera_live_owner`,
`live_member_divergence`, `live_member_moving`,
`target_camera_gallery_missing`, `identity_anchor_missing`,
`fragment_moving`, `ambiguous_candidates`, `occupied_spot_conflict`,
`awaiting_evidence` (fragment còn quá trẻ, chờ tích luỹ bằng chứng —
bình thường trong vài frame đầu).

---

## 3. Kịch bản nên thử (theo độ ưu tiên)

1. **Xe đỗ yên → mất track → mọc lại** *(bug gốc sang8 f600)*:
   xe đỗ lâu đến khi tracker drop local track (label biến mất), vẫn đỗ
   yên; khi local track mọc lại → kỳ vọng `stationary_reacquire_accepted`
   với `global_id` = GID cũ, `world_distance` nhỏ (≤3 wu), KHÔNG có
   `global_id_created` mới cho local đó.
2. **Xe khác đỗ ngay cạnh ô đang chiếm**: xe A đỗ mất track, xe B đỗ
   sát cạnh (< ~5 wu world) rồi track A mọc lại → kỳ vọng reject
   (`distance`/`appearance`/`size`) hoặc defer `ambiguous_candidates` /
   `occupied_spot_conflict` — tuyệt đối không accept nếu 2 xe khác nhau.
3. **Xe chạy ngang chỗ xe đỗ**: xe đỗ mất track; xe thứ hai lái ngang
   qua vị trí đó → fragment "moving" phải bị veto `fragment_moving`,
   không được dính GID xe đỗ.
4. **Hai xe cùng màu đỗ cạnh nhau**: hai ô liền kề, appearance gần
   giống → kỳ vọng defer lâu (`ambiguous_candidates`/`occupied_spot_conflict`)
   hoặc reject, không accept chắc sai.
5. **Member còn sống nhưng đang trôi** *(thai3_f1528)*: gid còn member
   bound trên cam khác nhưng member đó đang di chuyển chậm (xe len lách);
   fragment đỗ yên mọc lại → kỳ vọng reject `live_member_moving` với
   `member_drift_window.drift_wu` > 2.0 — không accept.

---

## 4. Dấu hiệu lỗi cần báo lại

| Triệu chứng | Nghĩa | Thu thập trước khi báo |
|---|---|---|
| `accepted` cho 2 xe khác nhau (2 xe thật cùng 1 gid trên màn hình) | false-merge — vụ nặng nhất | event đầy đủ + timestamp/frame + ảnh/sheet nếu có |
| `deferred` kéo dài **> 60 frame** liên tục cùng `(target_camera, target_local_id)` | quarantine không tự thoát — có thể claims không bao giờ giảm < 2 | chuỗi deferred events, `deferred_frames`, `competing_global_ids` |
| `member_drift_window.drift_wu` cao bất thường (> ~5 wu) trên xe thực tế đứng yên | anchor/transform lệch hoặc sample nhiễu — gate drift sẽ chặn nhầm | event kèm `member_drift_window` đầy đủ |
| Xe đỗ yên mọc lại vẫn mint GID mới và **không có** event stationary nào | fragment không qua được candidacy (không fresh/allocatable) hoặc không identity nào screen được | `global_id_created` event + frame |
| `awaiting_evidence` kéo dài > ~10 f | fragment không tích luỹ được provisional/appearance — kiểm track có bị chập chờn không | chuỗi events + `deferred_frames` |

### Param tune được (constructor `CrossCameraManager`, default F1 rev2)

Hiện tại **chưa có CLI cho từng ngưỡng** — tune bằng cách truyền kwarg khi
khởi tạo manager (hoặc nhờ dev thêm arg). Khi báo số liệu kèm luôn giá trị
đo được trong event để chọn ngưỡng mới.

| param | default | khi nào cần nới/siết |
|---|---|---|
| `stationary_reacquire_member_drift` | 2.0 wu | `drift_wu` thật trên xe đỗ yên thường > 2 → nới (f1528 đo 3.18 wu); false-merge vẫn lọt → siết |
| `stationary_reacquire_member_window` | 10 f | drift chỉ rõ ở cửa sổ dài hơn |
| `stationary_reacquire_distance` | 5.0 wu | re-fire lệch anchor nhiều do homography → nới; xe kề cạnh bị hút nhầm → siết |
| `stationary_reacquire_core_distance` | 3.0 wu | core band (không cần IoU) |
| `stationary_reacquire_appearance_distance` | 0.30 | gallery mỏng → xem `appearance_distance` trong event |
| `stationary_reacquire_iou` | 0.15 | band 3–5 wu hay miss do bbox run |
| `stationary_reacquire_margin_distance` / `_margin_appearance` | 1.5 / 0.08 | defer mơ hồ kéo dài → siết margin để chốt nhanh hơn |
| `stationary_reacquire_tail_span` | 4.0 wu | `fragment_moving` bắn nhầm do jitter anchor |
| `stationary_reacquire_velocity` | 1.5 wu/s | `stationary_history_missing` bắn nhầm do EMA nhiễu |

### Ghi chú vận hành

- Mọi gate log **trước** khi quyết định — event `rejected`/`deferred` đã đủ
  số để suy luận; không cần bật debug build.
- Flag-off tuyệt đối không emit `stationary_reacquire_*` — nếu thấy event
  khi chưa truyền cờ thì đó là bug, báo ngay.
- Deferral cap `max(handoff_ttl, 60)` f — hết cap fragment được release về
  pipeline thường (mint hoặc các pass khác quyết).
