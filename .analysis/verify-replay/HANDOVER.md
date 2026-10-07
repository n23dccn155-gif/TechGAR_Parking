# HANDOVER — Kiểm chứng replay video
Cập nhật: 06/10/2026 01:22 (Asia/Saigon). Người dùng tiếp quản ngay.
LEAD dừng hoàn toàn sau bàn giao; không giao thêm việc, không chạy replay, không sửa code/config.

## 1. Trạng thái V0–V6
- V0: DONE — môi trường, runtime pilot, lệnh và 6 config hiện tại đã được xác nhận.
- V1: DONE — 18/18 replay; 41.625 frame đôi = 83.250 cam-frame; exit 0, completed_replay, số dòng dự đoán khớp nguồn; log báo 0 warning/error.
- V2: DONE theo báo cáo cả 18 session; kiểm tra đầu/giữa và căn chỉnh hai camera, chưa phải ground truth toàn bộ.
- V3: Đã quét tự động cả 18 theo builder; V3-scan-B.md còn ghi 2 session ngắn, cần cập nhật đủ 4.
- V4: ĐANG LÀM — C hoàn tất 8 session; A hoàn tất 5 và uniform thai1, còn helper thai1; B hoàn tất 3, còn xem thai3.
- V5: ĐANG LÀM — B→C đã lấy mẫu đủ pool; A→B và C→A còn chốt pool/lấy mẫu cuối sau V4.
- V6: CHƯA LÀM — chưa có ERRORS-SUMMARY.md và QUESTIONS-FOR-USER.md; chưa duyệt hoàn tất chiến dịch.

## 2. Builder đúng lúc bàn giao
- builder-a: đang xem sheets_v4h_thai1/sheet_0036.jpg…sheet_0096.jpg (61 sheet), nộp V4-help-A-thai1-part.md; lần quan sát gần nhất tới sheet_0070, chưa xác nhận hết.
- A sở hữu test1, hiep_toi4, hiep2, hiep_sang9, thai6, hiep_thai1; cần gộp helper của C theo tập hợp cam/frame và cập nhật đầu ERRORS-A.md đang cũ.
- builder-b: đang xem thai3; bộ đã render 212 sheet/1.904 ô, lần thấy gần nhất sheet_0121; chưa được tính toàn bộ là đã xem.
- B sở hữu hiep_toi6, hiep1, hiep_thai4, hiep_thai3; thai4 đã xem 237/237 sheet = 2.132 cam-frame; còn V4-thai3-B.md và cập nhật V3/ERRORS.
- builder-c: đã hoàn tất 8 session riêng = 7.182 cam-frame, 294 cửa sổ FULL; đang hỗ trợ thai1 cho A.
- Helper thai1 của C có 157 sheet/1.408 ô, 116 cửa sổ sự kiện; A nhận 0036–0096, C nhận 0001–0035 + 0097–0157.
- Lần thấy C gần nhất ở sheet_0059, trùng phần A. Lệnh cuối đã nhắc checkpoint tập đã xem và chuyển 0097–0157; chưa xác nhận chuyển xong.
- C cần nộp V4-help-C-thai1.md, hợp nhất phần A, kiểm tra 116 cửa sổ cả hai cam với khoảng cách mẫu ≤5 frame.
- C sở hữu sang7, toi5, hiep3, sang8, runtime_session_bt, thai8, thai7, hiep_thai5. Còn V5 cuối cho pool đủ 6 session A.
- Cả ba được thấy đang working; chưa ghi nhận block/approval thực sự. Không tự approve nếu xuất hiện block.

## 3. Lệnh replay cuối và kết quả V0/V1
Cwd: D:\TechGar2\backend\main_detect; lệnh mẫu cuối đã yêu cầu, mọi replay hiện đã chạy xong:
`.\.venv\Scripts\python.exe -u runtime_server.py --cam1-video experiment_test/output/<SRC>/raw_cam1.mp4 --cam2-video experiment_test/output/<SRC>/raw_cam2.mp4 --slots-cam1 config/parking_slots_cam1.json --slots-cam2 config/parking_slots_cam2.json --calibration config/two_camera.shared_cm_01.json --mask-cam1 config/roi_mask_cam1.json --mask-cam2 config/roi_mask_cam2.json --session-dir experiment_test/output/verify_cur_<SRC> --output-dir experiment_test/output/verify_cur_runtime_<SRC> --no-session-video --no-display --opencv-threads 1 --api-host 127.0.0.1 --api-port <8101+i>`
- Dùng runtime_server, config/ROI/calibration hiện tại, không async/realtime/live; tối đa 3 replay đồng thời, threads=1. Không cần chạy lại toàn bộ.
- Registry v1-replay-results.json giữ argv/kết quả đủ 18; V1-replay-results.md là báo cáo chuẩn. 6/6 hash config sau batch khớp V0.
- Ngoại lệ runtime_session_bt: predictions chính ở verify_cur_runtime_session_bt; side-state ở verify_cur_runtime_runtime_session_bt.
- session_hiep_thai2 chỉ 1 frame/cam, loại vì dữ liệu hỏng. Hai pilot giữ nguyên, không tính vào 18; 236/298 trước đây chỉ là ảnh chụp giữa lần chạy.
- HEAD nền: 5f581311e34cb7c588197c6f01d2b9686d28df8d. Có 5 file tracked dirty từ trước V0, không phải sửa trong chiến dịch.
- 5 file đó: cross_camera_manager.py, slot_vehicle_binder.py, trajectory_memory.py, test_gid_departure_token.py, test_gid_reserved_competition.py.
- Kiểm tra giữa chiến dịch: 148/148 hash code/config/test/entrypoint không đổi; chưa kiểm tra cuối QA. Baseline 148 chỉ ở bộ nhớ LEAD; 6 config có chứng cứ V0.

## 4. Quyết định đã chốt và điểm chờ
- Quét tự động 100% frame + xem hình theo mẫu đều ≥1 frame/2s/cam và cửa sổ sự kiện ±15 frame, bước ≤5; không tuyên bố nhìn bằng mắt 83.250 frame.
- Chỉ đếm unique(cam,frame) thực sự đã xem; render không bằng xem; hợp helper/uniform/event bằng union, không cộng trùng.
- FULL phải phủ cửa sổ đã clamp cả hai cam, max gap ≤5; entry/exit từ sự kiện runtime chỉ là proxy, không phải ground truth identity.
- Không sửa code/config, không ghi đè dữ liệu nguồn/pilot; công cụ riêng ở experiment_test/verify; giữ toàn bộ output verify_cur_.
- GT chưa đủ: identity/slot chủ yếu header; thai8 events có 24 dòng auto-prefill draft. Không kết luận tỷ lệ ID switch/accuracy toàn hệ thống.
- A: E-A-002 ghost bị bác; E-A-003 duplicate xác nhận; E-A-001 chỉ phần fixture xác nhận; E-A-030/031 còn UNSURE, GID NULL.
- B: E-B-003 ghost bị bác; E-B-004/005 duplicate cục bộ xác nhận, tác hại slot/GID cuối chưa chứng minh; E-B-007 fragment cùng xe còn UNSURE.
- C005: thai7 f761–772 bị bác; thai8 f1377–1389 và thai7 f2084–2112 còn UNSURE. Dùng V5-crosscheck-B.md mới, không dùng kết luận cũ về khác xe.
- C006/C007 hiện tượng ghost/fixture có chứng cứ; tác hại cuối chưa chứng minh. Chưa có S1 cuối được chứng minh, không đồng nghĩa hệ thống hoàn hảo.
- V5 B→C: seed 20261005, pool 7, k=2, C003/C005 đều chưa giải quyết; 0/2 resolved, FP không ước lượng được. Tách audit bổ sung khỏi mẫu ngẫu nhiên.
- Chờ người dùng sau V6 quyết định identity còn mơ hồ, bổ sung GT và hướng xử lý; không tự sửa. Merge/split P0 đã xong, HOLD trước P1; readability vẫn tạm dừng.

## 5. File cần đọc và công việc tiếp quản
- Chung: MEGAPLAN.md, REVIEW-CHECKLIST.md, V0-environment.md, V1-replay-results.md, v1-replay-results.json, V1-intake-b.md; HANDOVER này mới hơn STATUS.md.
- A: progress-builder-a.md (Latest-13), V2-A.md, V3-scan-A.md, ERRORS-A.md, errors-a.json, V5-A.md; chờ hai helper thai1 để hợp nhất.
- B: progress-builder-b.md, V3-scan-B.md, ERRORS-B.md/json, V4-thai4-B.md, V5-crosscheck-B.md; hoàn tất thai3 và đồng bộ báo cáo.
- C: progress-builder-c.md, V3-scan-C.md, ERRORS-C.md/json, V5-C.md; chốt helper thai1 và V5 pool A cuối.
- File helper thai1 của A/C và V4-thai3-B.md chưa tồn tại lúc bàn giao. Cần xác nhận thực sự đã xem, đồng bộ MD/JSON/schema và header trước duyệt.
- Sau V4: chốt pool A/B, cross-review mẫu cuối ceil(20%) với seed nêu trên; ghi CONFIRMED/REJECTED/UNSURE đúng chứng cứ, kiểm tra freeze cuối rồi tổng hợp V6, không thêm phân tích/code mới.
- Prefix mọi lệnh Herdr: $env:HERDR_ENV='1'; $env:HERDR_SOCKET_PATH='C:\Users\anfif\AppData\Roaming\herdr\herdr.sock'; $env:HERDR_WORKSPACE_ID='w1'; $env:HERDR_TAB_ID='w1:t3'; $env:HERDR_PANE_ID='w1:p6';
- Người dùng/assistant tiếp quản toàn bộ từ đây. LEAD không poll, không giao thêm việc và dừng hoàn toàn sau khi ghi file này.
