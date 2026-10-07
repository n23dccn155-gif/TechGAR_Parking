# Checklist duyệt V2–V6

Nguồn: MEGAPLAN.md §0–§6. Chưa đạt mục nào thì ghi rõ, không gọi hoàn tất.

- [ ] V1 đúng 18 session §2, include runtime_session_bt; video hỏng thai2 ghi riêng, không replay.
- [ ] Runtime current, 6 config giữ hash; bảng source/output/log/command, exit, thời gian, raw mỗi cam/predictions/record_counts, dung lượng.
- [ ] V2 first+middle mỗi cam, ảnh dẫn chứng và ALIGNED/PARTIAL/MISALIGNED; giới hạn kiểm geometry 2 mốc.
- [ ] V3 official replay: 100% rows, raw cả 2 cam, 7 nhóm CHECKED/NOT_AVAILABLE, log; không trộn record cũ/pilot.
- [ ] V4 mắt xem đủ mẫu đều >=1 frame/2s/cam; dense5 quanh sự kiện thực; cờ ±15 gom windows, skipped count+reason nếu ưu tiên.
- [ ] Coverage đếm unique(camera,frame) của sheet thực đã xem; số cells xem không vượt số cells của các sheet đó. Không cộng trùng uniform/events/flags.
- [ ] Finding E-builder-NNN: một loại §5, session/cam/frame/time, ảnh gốc so prediction, LID/GID/slot cụ thể, image+cell+frame, metric/threshold hoặc trace, severity/confidence/status, suspected cause, era flag, repro đầy đủ.
- [ ] Expected/observations/UNSURE tách confirmed lỗi; không suy mọi frame từ vài ảnh, không tính cùng hiện tượng nhiều lần trong tổng issue.
- [ ] MD/JSON đồng bộ; không đề xuất patch/whitelist, không sửa source/config/tests có sẵn.
- [ ] V5 kiểm ảnh người khác: seeded random >=20% finding, CONFIRMED/REJECTED/UNSURE, denominator mỗi loại, giới hạn mẫu nhỏ.
- [ ] V6 tổng hợp loại/severity/session, era, cluster nghi nguyên nhân theo builder, ảnh top lỗi, coverage thật, replay failures, FP V5, giới hạn và câu hỏi user.
- [ ] Final hash 148 file đóng băng và Git status/diff stat; phân biệt thay đổi tồn tại trước chiến dịch và file verify mới.
