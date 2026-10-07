# REVIEW: replay-ground-truth (builder-c, Task 9)

OK — không vấn đề.
- Verify: 18/18 completed_replay + 41.625 cặp / 83.250 cam-frame + 0 warn/err (ERRORS-SUMMARY L8, V1-results L57); eyeball ~16.300 ≈19.6% (L10); 6 config SHA-256 khớp (V1 L74-75); thai1 longest 6050 (V1 L49); test1 shortest 298; GT gần-chỉ-header → harm UNVERIFIED (khớp canonical).
- Điểm mạnh: phân biệt rõ "replay PASS = lặp lại được" vs "đúng cần GT" — đúng trạng thái chiến dịch, không phóng đại.
- Limit "80% chưa qua mắt" gắn CONFIRMED đúng (coverage thật ~19.6%); fingerprint per-file UNSURE hợp lý.
- Figure contact-sheet verify_cur thai8: caption không phóng đại (mô tả đúng là trang rà soát bằng mắt).
