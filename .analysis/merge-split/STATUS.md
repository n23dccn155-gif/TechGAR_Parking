# STATUS — Merge/Split Identity Recovery

Ngày: 2026-10-05. **P0 HOÀN TẤT — DỪNG TRƯỚC P1.**

- LEAD đã khôi phục Herdr và tiếp quản trực tiếp A/B/C; agent list/read/prompt hoạt động.
- A nộp P0-a-code-map.md, xác minh source/invariants và đọc chéo C.
- B nộp P0-b-baseline.md + công cụ mới merge_split_report.py; sửa baseline proxy/censored theo review.
- C nộp P0-c-scenarios.md + test mới S1–S9 và ba log pytest: baseline448 PASS; full457 PASS/8XFAIL; scenario9 PASS/8XFAIL, không FAIL/XPASS.
- LEAD review báo cáo và logs, không đọc source hoặc tự code; đã viết SPEC-REVIEW.md. Các claim S5/S6 quá rộng được sửa; tỷ lệ expired và proxy new-ID không coi là lỗi identity theo GT.
- GT CSV đã kiểm chỉ có header: benchmark §6 hiện BLOCKED; chưa chứng minh cải thiện identity hoặc đủ nhãn cho P5.
- Cả ba builder ở done/ready sau P0, HOLD. Không có hành động blocked được tự approve. Không dispatchP1, không commit/push.
- P0 không thêm cờ/logic recovery mới. Các phase sau phải đặt mọi hành vi mới sau enable_multi_hypothesis_recovery, mặc định TẮT.
- Git metadata còn 5 modified tracked files đã biết từ trước; không tự revert hoặc gộp các thay đổi đó vào P0. Owners báo không sửa tracker/test cũ.
- Readability tạm dừng, giữ kết quả.

## Bàn giao

Đọc SPEC-REVIEW.md: bảng xác nhận/bác/giới hạn từng claim, baseline đã lọc, kết quả test, câu hỏi về GT/scope consumer/policy/shadow. Chờ phản hồi người dùng trước P1; mọi giao việc tiếp theo do LEAD dispatch trực tiếp.
