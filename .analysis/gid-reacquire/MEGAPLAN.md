# MEGAPLAN — Fix: stationary re-acquisition (xe đỗ yên bị cấp GID mới)

Đọc trước: `D:\TechGar2\.analysis\gid-reacquire\SPEC.md` (bắt buộc, đặc biệt §6 RCA playbook và §7 ràng buộc).
Lead: **Devin (w1:p6)** — chỉ quản lý/duyệt, không tự code. Builder: `builder-a` (w1:p7), `builder-b` (w1:p8), `builder-c` (w1:p9).
Quyền sửa code **được cấp cho giai đoạn F2 trở đi**, và chỉ ở các file ghi trong §3. F0–F1 chỉ đọc/phân tích.
Thư mục làm việc/báo cáo: `D:\TechGar2\.analysis\gid-reacquire\`. Mỗi builder ghi `progress-<tên>.md` sau mỗi bước và **checkpoint trước khi context > 60%**.
Mọi lệnh Python dùng `D:\TechGar2\backend\main_detect\.venv\Scripts\python.exe`.

## 1. Nguyên tắc

- Observed ≠ hypothesis: ghi rõ cái nào đo được (frame, giá trị) và cái nào suy đoán.
- Không đổi threshold có sẵn, ROI, calibration, slot. Mọi hành vi mới sau cờ `enable_stationary_reacquire`, mặc định TẮT; cờ tắt ⇒ output giống hiện tại.
- Số đo cho `D_stat/A_stat/STAT_MARGIN` phải rút từ dữ liệu, không chọn số đẹp.
- Test tái hiện phải **FAIL trước khi sửa**.
- Không commit/push. Không revert 5 file đã modified từ trước (xem SPEC §7).

## 2. Phase

### F0 — Phân tích gốc (đọc-only, song song) — mục tiêu gọn
- **builder-a — Code-path trace:** theo SPEC §6 bước 3. Trả lời bằng `file:dòng`: ở f600 sang8, event `global_id_created gid3` được sinh từ nhánh nào (dormant / live-owner / new-lineage)? Vì sao gid1 (đang `matched` ở cam1) vẫn bị coi là ứng viên và bị reject bằng `trajectory_score`? `time_topology=0` và `direction≈0` được tính ra sao với xe đỗ? Có nhánh nào dùng `world_distance`/`appearance` làm bằng chứng chính không? Xác nhận/bác H1–H3. Nộp `F0-a-codepath.md`. Dựng bảng `reason → dòng code → threshold`.
- **builder-b — Phân loại 8 candidate + quét rộng:** làm SPEC §6 bước 1,2,4,5,6 cho 8 candidate ở SPEC §3 (SAME_CAR / DIFFERENT_CAR / UNSURE, kèm ảnh ≥6 mốc trong gap và world-space). Sau đó quét lại 18 session với điều kiện rộng hơn (mọi `reason`, `world_distance ≤ 5`; thêm `dormant_reid_rejected`, `handoff_rejected`) và báo số liệu: có bao nhiêu SAME_CAR thật. Nộp `F0-b-cases.md` + `F0-b-cases.json` (frame, session, cam, lid, gid, components, verdict, evidence path). Công cụ có sẵn: `experiment_test/verify/make_sheets.py`.
- **builder-c — Test tái hiện:** viết test mới `backend/main_detect/tests/test_stationary_reacquire.py` (file mới) tái hiện kịch bản sang8 bằng dữ liệu tổng hợp qua API thật của `CrossCameraManager` (xem các test gid sẵn có như `test_gid_departure_token.py` để bắt chước cách dựng): xe đỗ yên, track chết, detection mới đúng chỗ cũ, gid cũ vẫn sống ở cam khác. Test phải đánh dấu `xfail(strict=False)` hoặc FAIL rõ ràng và mô tả "expected: reuse gid1". Thêm các test **âm** (không được gán): (i) hai xe cùng mạnh, (ii) xe khác đỗ cách xa, (iii) gid cũ đang được track khác cùng cam quan sát. Nộp `F0-c-tests.md` + log pytest.
- **Exit F0:** lead tổng hợp `F0-SUMMARY.md`: nguyên nhân gốc đã chứng minh, số case SAME_CAR thật, test FAIL đúng lý do. **Dừng, báo user** nếu SAME_CAR < 2 (khi đó đây không đủ nền để sửa — chờ user quyết).

### F1 — Thiết kế (không code)
- **builder-a** viết `F1-design.md`: nhánh `stationary_reacquire` tối thiểu — điều kiện vào, bằng chứng, margin, guard chống cướp ID, vị trí chèn trong code, cách log, cách tắt bằng cờ. Giá trị ngưỡng đề xuất lấy từ phân phối ở `F0-b-cases.json` (SAME_CAR vs DIFFERENT_CAR) — chỉ ra khoảng tách; nếu hai nhóm chồng lấn thì nêu rõ và để guard `UNSURE→defer`.
- **builder-b** review thiết kế bằng cách chạy ngược các điều kiện trên toàn bộ candidate: bao nhiêu SAME_CAR được cứu, bao nhiêu DIFFERENT_CAR bị cướp nhầm (phải = 0 trên 18 session).
- **builder-c** bổ sung test cho mọi điều kiện của thiết kế.
- **Exit F1:** lead duyệt `F1-design.md`; **dừng chờ user duyệt** trước khi sang F2.

### F2 — Cài đặt (sau khi user duyệt F1)
- Chỉ **builder-a** sửa code (một người sở hữu để tránh đụng nhau): `src/techgar/cross_camera_manager.py` và nếu cần cấu hình cờ ở đúng chỗ khai báo tham số hiện có (xem cách các cờ `enable_*` khác được truyền qua `two_camera.py`/`runtime_server.py`).
- Trước khi sửa: `git diff > .analysis/gid-reacquire/baseline-dirty.patch` (backup trạng thái bẩn hiện tại) và ghi hash các file sẽ sửa.
- Cờ `enable_stationary_reacquire` mặc định `False`; truyền được qua CLI replay.
- **builder-c** chạy: test mới PASS; full suite ≥ 457 PASS / 8 XFAIL (không tụt); với cờ TẮT không đổi hành vi.
- **builder-b** review diff: có đổi hành vi khi cờ tắt không, có chạm file ngoài phạm vi không.

### F3 — BỎ QUA (user tự test livecam trực tiếp)
- Không replay 18 session, không so sánh before/after bằng replay. Không tạo `verify_reacq_*`.
- Thay bằng kiểm tra tĩnh nhẹ, không replay: **builder-c** chạy full test suite (>= 457 PASS / 8 XFAIL) và xác nhận cờ TẮT không đổi hành vi bằng test; **builder-b** review diff (không đổi hành vi khi cờ tắt, không chạm file ngoài phạm vi) và chạy lại điều kiện thiết kế trên `F0-b-cases.json` (offline, không replay).
- Cờ `enable_stationary_reacquire` phải bật/tắt được qua CLI của `runtime_server.py` để user test livecam.

### F4 — Báo cáo + hướng dẫn test livecam
- Thêm `LIVECAM-TEST.md`: lệnh chạy runtime với cờ bật/tắt, cách đọc event `stationary_reacquire_*` trong log/snapshot, các tình huống nên thử (xe đỗ yên rồi track mất, xe khác đỗ gần, xe đi qua giữa 2 cam), dấu hiệu lỗi cần báo lại.
- Lead viết `REPORT.md`: nguyên nhân gốc (đã chứng minh), thay đổi (file/dòng), số liệu before/after, rủi ro còn lại, đề xuất có bật cờ mặc định hay không. **Dừng, chờ user quyết bật.**

## 3. Phạm vi file được sửa (chỉ từ F2)
- `backend/main_detect/src/techgar/cross_camera_manager.py` (thêm nhánh nhỏ có cờ; **không** refactor).
- Nơi khai báo/truyền cờ nếu bắt buộc (`two_camera.py` / `runtime_server.py`) — chỉ thêm tham số.
- Test mới: `backend/main_detect/tests/test_stationary_reacquire.py`.
- Cấm: ROI/calibration/slots JSON, `motion_tracker.py`, `occlusion_guard.py`, threshold hiện có.

## 4. Vai trò lead
- Giao việc bằng `herdr agent prompt`, poll trạng thái, xử lý hộp thoại quyền khi builder bị chặn (nhớ gửi Enter bằng `herdr pane send-keys <pane> enter` nếu prompt kẹt hàng chờ).
- Review báo cáo từng phase, đọc chéo, bác bỏ kết luận thiếu bằng chứng, **không tự code, không tự replay**.
- Dừng và báo user ở 3 điểm: sau F0 nếu SAME_CAR < 2, sau F1 (duyệt thiết kế), sau F4 (không còn replay F3; user tự test livecam).
- Ghi `STATUS.md` mỗi lần có thay đổi phase; checkpoint trước khi context của chính lead > 60%.
