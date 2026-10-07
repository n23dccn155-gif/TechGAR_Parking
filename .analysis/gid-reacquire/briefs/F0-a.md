# BRIEF F0-a — builder-a: Code-path trace (đọc-only, KHÔNG sửa code)

Đọc trước khi làm: `D:\TechGar2\.analysis\gid-reacquire\SPEC.md` (đặc biệt §1–§7) và `MEGAPLAN.md` cùng thư mục. Brief này là đầy đủ — không cần context khác.

## Bug cần trace
Xe đen đỗ yên tại cam2 ≈ (397,118), session `verify_cur_session_hiep_sang8`. `lid35/gid1` sống f167→~301 rồi track chết (xe đứng yên). f595 detection mới mọc lại cách chỗ cũ 9px. f600: `global_id_created gid=3` (cam2, lid40) trong khi **gid1 vẫn `matched` trên cam1**. Ứng viên gid1 bị reject với `trajectory_score=0.668 < 0.78` — chỉ `direction≈0` và `time_topology=0` kéo xuống; world_distance=0.90, appearance=0.833, corridor=0.944, speed=0.971 đều ủng hộ.

Dữ liệu: `experiment_test/output/verify_cur_session_hiep_sang8/predictions.jsonl` — event `identity-000000569` có `details.world_trajectory_rejections`.

File code chính: `backend/main_detect/src/techgar/cross_camera_manager.py` (vị trí nghi ngờ: ~L5430–5478 dormant reid path, ~L5487 cost, ~L6000–6100 stable rejects, ~L3391/3900 same_camera_live_owner_conflict, ~L381 trajectory.match_threshold).

## Phải trả lời bằng `file:dòng` (không đoán)
1. Event `global_id_created gid=3` ở f600 được sinh từ nhánh nào — dormant reid / live-owner / new-lineage? Chỉ ra đường đi code cụ thể từ entry point đến chỗ phát event.
2. Vì sao gid1 (đang `matched` ở cam1) vẫn được coi là ứng viên cho detection cam2, và bị reject bằng `trajectory_score`? Nhánh nào THỰC SỰ chạy ở f600 — dormant hay live-owner? (xác minh H2, SPEC §4)
3. `time_topology=0` và `direction≈0` được tính ra sao khi xe đỗ yên? Chỉ ra hàm/dòng tính 2 component này và lý do chúng =0 cho stationary track.
4. Có nhánh nào trong pipeline dùng `world_distance`/`appearance` làm bằng chứng CHÍNH (không chỉ là component phụ của score) không?
5. Xác nhận hoặc BÁC từng hypothesis H1, H2, H3 (SPEC §4) — mỗi cái kèm bằng chứng file:dòng.
6. Bảng `reject reason → dòng code → threshold/điều kiện` cho mọi reason xuất hiện trong SPEC §3 (trajectory_score, trajectory_stable_not_leaving_slot, trajectory_stable_wrong_direction, same_camera_live_owner_conflict, ...).

## Nộp
`D:\TechGar2\.analysis\gid-reacquire\F0-a-codepath.md`. Ghi rõ observed vs hypothesis.

## Ràng buộc
- Đọc-only: KHÔNG sửa bất kỳ file code nào, KHÔNG commit/push, KHÔNG revert 5 file đang modified (SPEC §7).
- Python: `D:\TechGar2\backend\main_detect\.venv\Scripts\python.exe`.
- Ghi `D:\TechGar2\.analysis\gid-reacquire\progress-builder-a.md` sau mỗi bước lớn; checkpoint (dump state vào file) trước khi context >60%.
- Khi xong: trả lời ngắn "DONE F0-a" + 1 dòng tóm tắt kết luận chính.
