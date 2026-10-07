# SPEC — BUG: xe đỗ yên xuất hiện lại bị cấp GID mới dù GID cũ vẫn sống (stationary re-acquisition)

Ngày: 2026-10-06 · Nguồn: chiến dịch verify-replay (`.analysis/verify-replay/`), trường hợp E-C-002 + quét 18 session.
Tất cả số liệu dưới đây đo từ `predictions.jsonl` của `experiment_test/output/verify_cur_*`; **hypothesis được ghi rõ là hypothesis**.

## 1. Triệu chứng (observed)

Cùng một xe vật lý mang 2 global ID song song.

Case chuẩn — `verify_cur_session_hiep_sang8`:
- Xe đen đỗ yên tại cam2 ≈ (397,118). `lid35/gid1` sống f167→~301 rồi chết (xe không chuyển động nên track mất).
- 294 frame sau (f595), detection mới mọc lại **cách chỗ cũ 9px**. Xe không hề rời chỗ (kiểm 6 mốc f300–f550, ảnh `sheets_cur/xcheck_c002_gap`).
- f600: `global_manager` phát `global_id_created gid=3` (cam2, lid40). Trong khi đó **gid1 vẫn `matched` trên cam1**.
- Hệ quả: 1 xe = gid1 (cam1) + gid3 (cam2). Slot occupancy không đổi nên chưa thấy hậu quả slot, nhưng identity bị phân đôi.

## 2. Bằng chứng trực tiếp (sự kiện f600, sang8)

`details.world_trajectory_rejections` của `identity-000000569`:

| candidate | reason | trajectory_score | world_distance | appearance | corridor | direction | time_topology | speed |
|---|---|---|---|---|---|---|---|---|
| gid1 | `trajectory_score` (< match_threshold 0.78) | 0.668 | 0.90 | 0.833 | 0.944 | **0.001** | **0.0** | 0.971 |
| gid2 | `trajectory_stable_not_leaving_slot` | 0.392 | 15.42 | 0.621 | 0.049 | 0.0003 | 0.853 | 1.0 |

Đọc: vị trí (0.9), appearance (0.83), corridor (0.94), speed (0.97) đều **ủng hộ gid1**; chỉ `direction≈0` và `time_topology=0` kéo tổng xuống 0.668 < 0.78 ⇒ reject.

## 3. Mức lan rộng (observed, chưa xác nhận từng case là cùng xe)

Quét `global_id_created` có ứng viên bị reject với `world_distance ≤ 3.0` trên 18 session → **8 candidate / 5 session**, cùng chữ ký (appearance 0.78–0.87, direction≈0, time_topology=0):

| session | frame | gid mới | cam/lid | gid bị reject | reason | traj_score | world_dist |
|---|---|---|---|---|---|---|---|
| sang8 | 600 | 3 | cam2/40 | 1 | trajectory_score | 0.668 | 0.90 |
| thai3 | 1774 | 4 | cam1/9 | 3 | trajectory_stable_wrong_direction | 0.635 | 1.20 |
| thai4 | 4633 | 12 | cam2/119 | 7 | trajectory_score | 0.639 | 0.73 |
| thai6 | 1128 | 3 | cam2/13 | 2 | trajectory_score | 0.702 | 0.83 |
| thai6 | 1205 | 4 | cam1/29 | 1 | trajectory_score | 0.621 | 0.45 |
| thai6 | 1713 | 6 | cam2/19 | 5 | trajectory_stable_wrong_direction | 0.605 | 1.65 |
| thai6 | 4936 | 16 | cam2/261 | 6 | trajectory_score | 0.639 | 2.74 |
| thai7 | 2112 | 7 | cam2/83 | 1 | trajectory_stable_wrong_direction | 0.593 | 1.23 |

Chỉ sang8 đã chứng minh cùng-xe (ảnh + world-space). 7 case còn lại **chưa phân loại** — phải làm ở F0.

## 4. Vị trí code nghi ngờ (hypothesis — phải xác minh)

`backend/main_detect/src/techgar/cross_camera_manager.py`:
- ~L5430–5478 (đường dormant reid): `trajectory_ready` (cần ≥3 observation + ≥3 mẫu quỹ đạo nguồn + ≥2 mẫu appearance) rồi `score < self.trajectory.match_threshold` ⇒ `_record_dormant_rejection("trajectory_score")`. `turnaround_proof` là nhánh duy nhất bỏ qua trajectory — không có nhánh tương đương cho "xe đỗ yên".
- ~L5487: khi `trajectory_ready` thì `cost = 1 - trajectory_score`, **bỏ qua** `world_distance` và `appearance` trong cost.
- ~L6000–6100: `trajectory_stable_not_leaving_slot` / `trajectory_stable_wrong_direction` (hard reject).
- ~L3391/3900: guard `same_camera_live_owner_conflict` — chặn theo chiều "không cho xe khác cướp gid đang đỗ", chưa chắc có chiều "xe thật nhận lại gid của chính nó khi gid đó đang sống ở cam khác".
- `trajectory.match_threshold = 0.78` (khởi tạo quanh L381).

H1: score quỹ đạo giả định xe đang di chuyển; với xe đỗ/đứng yên, `direction` và `time_topology` luôn ≈0 nên score tối đa không vượt ngưỡng.
H2: gid1 đang sống ở cam1 (không dormant) nên đi vào nhánh "live owner" khác dormant; cần xác minh nhánh nào thực sự chạy ở f600.
H3: không có bước "re-acquire theo vị trí+appearance" khi world_distance rất nhỏ và nguồn là vị trí đỗ đã biết (slot/stationary memory).

## 5. Hành vi mong muốn

Khi một local track mới trên camera C xuất hiện:
1. Nếu tồn tại gid G **chưa bị cướp bởi xe khác** và các bằng chứng tĩnh mạnh: `world_distance ≤ D_stat`, `appearance ≥ A_stat`, `size` hợp lý, và G có lịch sử đứng yên tại vị trí đó (hoặc vắng mặt tại C do track chết lúc xe đứng yên) ⇒ **gán lại G**, không tạo gid mới.
2. Không được làm tăng ID-theft: nếu có ≥2 ứng viên cùng mạnh (margin < `STAT_MARGIN`) ⇒ chờ/không commit, không đoán.
3. Không được gán G khi G đang được một track khác **cùng camera** quan sát độc lập ở cách xa (`same_camera_live_owner`).
4. Mọi hành vi mới nằm sau cờ `enable_stationary_reacquire` (**mặc định TẮT**); với cờ tắt, output phải **bit-for-bit giống hiện tại**.
5. Log event mới `stationary_reacquire_{accepted,rejected,deferred}` kèm đầy đủ components để dùng làm dataset.

Giá trị `D_stat`, `A_stat`, `STAT_MARGIN` không được chọn trước — phải rút ra từ dữ liệu F0/F1.

## 6. Quy trình phân tích gốc lỗi (RCA playbook — mọi builder phải làm đúng thứ tự)

1. **Định vị sự kiện**: tìm `identity_events` trong `predictions.jsonl` (`global_id_created`, `dormant_reid_rejected`, `handoff_rejected`) quanh frame nghi ngờ.
2. **Đọc bằng chứng**: lấy `details.world_trajectory_rejections[*]` — reason + từng `components`.
3. **Đối chiếu code**: map từng reason/threshold sang dòng code đã quyết định (không đoán).
4. **Trạng thái các cam khác**: ứng viên bị reject đang sống/dormant/expired? ở cam nào?
5. **Xác nhận cùng-xe**: chiếu world-space (`config/two_camera.shared_cm_01.json`) + render ảnh các mốc trong khoảng gap (≥6 mốc) — "cùng chỗ ±px + hiện diện liên tục" mới được tính cùng-xe.
6. **Phân loại**: SAME_CAR (bug) / DIFFERENT_CAR (reject đúng) / UNSURE.
7. **Chứng minh bằng test**: viết test tái hiện trước khi sửa (phải FAIL), sửa xong test phải PASS.

## 7. Ràng buộc

- Không đổi ROI mask, calibration, ô đỗ, threshold hiện có.
- Không dùng Laya. Không viết lại cross_camera_manager; chỉ thêm nhánh nhỏ có cờ.
- `git status` hiện có **5 file tracked đã modified từ trước** (cross_camera_manager.py, slot_vehicle_binder.py, trajectory_memory.py, test_gid_departure_token.py, test_gid_reserved_competition.py). Không revert, không gộp vào commit của task này; trước khi sửa phải lưu `git diff` baseline.
- Baseline test: 457 PASS / 8 XFAIL (full suite). Không được tụt.
- Không commit/push nếu user chưa yêu cầu.
