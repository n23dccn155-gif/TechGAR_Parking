# BRIEF F0-b — builder-b: Phân loại 8 candidate + quét rộng (đọc-only)

Đọc trước: `D:\TechGar2\.analysis\gid-reacquire\SPEC.md` (đặc biệt §3, §6) và `MEGAPLAN.md`. Brief này là đầy đủ.

## PHẦN 1 — Phân loại 8 candidate (SPEC §3)

8 candidate `global_id_created` có ứng viên bị reject với `world_distance ≤ 3.0`:

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

Với MỖI case, làm đúng playbook SPEC §6 bước 1,2,4,5,6:
1. Tìm `identity_events` trong `predictions.jsonl` của session tương ứng dưới `experiment_test/output/verify_cur_*` (tên thư mục dạng `verify_cur_session_hiep_<session>` — tự map, ví dụ sang8 = `verify_cur_session_hiep_sang8`; nếu không chắc, `dir experiment_test\output` để liệt kê).
2. Đọc `details.world_trajectory_rejections[*]`: reason + từng components.
3. Kiểm trạng thái ứng viên bị reject ở cam kia tại thời điểm đó (sống/matched/dormant/expired — từ events hoặc track state trong predictions).
4. **Xác nhận cùng-xe**: chiếu world-space bằng `backend/main_detect/config/two_camera.shared_cm_01.json` + render ảnh **≥6 mốc trong khoảng gap** (công cụ sẵn có: `experiment_test/verify/make_sheets.py`; xem thêm cách chiến dịch verify-replay đã làm trong `.analysis/verify-replay/`, ví dụ ảnh `sheets_cur/xcheck_c002_gap` của sang8). Tiêu chí SAME_CAR: "cùng chỗ ±px + hiện diện liên tục" — xe không rời chỗ trong suốt gap.
5. Verdict: `SAME_CAR` (bug) / `DIFFERENT_CAR` (reject đúng) / `UNSURE` — mỗi verdict PHẢI kèm đường dẫn ảnh bằng chứng.

Lưu ý: sang8 đã được chứng minh SAME_CAR trong SPEC — vẫn phải kiểm lại nhanh để đồng nhất phương pháp, rồi dồn sức cho 7 case còn lại.

## PHẦN 2 — Quét rộng 18 session

Quét lại toàn bộ `experiment_test/output/verify_cur_*/predictions.jsonl` với điều kiện RỘNG HƠN SPEC §3:
- Mọi `reason` (không chỉ trajectory_score*),
- `world_distance ≤ 5.0`,
- Thêm cả event `dormant_reid_rejected` và `handoff_rejected` (không chỉ `global_id_created`).

Với mỗi candidate mới tìm được: trích reason + components + verdict sơ bộ (UNSURE chấp nhận được nếu chưa render ảnh; nhưng phải nêu rõ thiếu bằng chứng gì). Báo số lượng: tổng candidate, SAME_CAR xác nhận, DIFFERENT_CAR, UNSURE.

## Nộp
- `D:\TechGar2\.analysis\gid-reacquire\F0-b-cases.md` — bảng verdict từng case + số liệu tổng hợp + phương pháp.
- `D:\TechGar2\.analysis\gid-reacquire\F0-b-cases.json` — mỗi entry: `{session, frame, cam, lid, gid_new, gid_rejected, reason, components:{world_distance, appearance, direction, time_topology, speed, corridor, trajectory_score}, verdict, evidence_dir}`.
- Ảnh bằng chứng: `D:\TechGar2\.analysis\gid-reacquire\evidence\<session>_f<frame>\`.

## Ràng buộc
- Đọc-only trên code: KHÔNG sửa code, KHÔNG commit, KHÔNG revert file modified. Được phép viết script phân tích tạm dưới `.analysis/gid-reacquire/` hoặc `experiment_test/`.
- KHÔNG chạy lại pipeline detection/tracking (không replay session); chỉ phân tích `predictions.jsonl` + render ảnh từ raw video đã có.
- Python: `D:\TechGar2\backend\main_detect\.venv\Scripts\python.exe`.
- Ghi `progress-builder-b.md` (trong `.analysis/gid-reacquire/`) sau mỗi bước; checkpoint trước khi context >60%. Nếu context gần đầy giữa chừng: dump kết quả từng phần vào JSON ngay, ưu tiên giữ verdict + evidence path.
- Khi xong: trả lời "DONE F0-b" + số SAME_CAR/DIFFERENT_CAR/UNSURE.
