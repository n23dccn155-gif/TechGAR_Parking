# REVIEW: gate-session (builder-c, Task 9)

1 lỗi nhỏ về từ ngữ + phần còn lại verified.
- §3.1 prose: "published_at cũng không được lệch đồng hồ controller quá năm giây **theo cả hai chiều**" — sai. Code thật `-1.0 <= age <= 5.0` (gate_session_controller.py:123): chiều tương-lai chỉ cho phép 1.0s, quá-khứ 5.0s. Values row trong cùng trang ghi đúng −1.0→+5.0 → chỉ cần sửa prose cho khớp.
- Verify khớp: poll 0.25s (L865; nhánh sleep `max(interval,1.0)` chỉ là error-path L904 nên "4 lần/giây" đúng), timeout 3.0s, age_ms 0–5000, QR 120s + token_urlsafe(12) + receipts 32 (session_manager 29/283/334), continuity ≤1.0s (L485-491), recovered ≤12 mẫu, departure 0.25 (L612), rank parked1/departing2/released3 (L629), cổng 8000/8001.
- Gate coords khớp gate_zones.json (unit "cm" L4). Figure cam2 vẽ đúng entry+xanh/exit+hồng; claim "cam1 nhìn ngoài khung" chưa verify độc lập nhưng hợp lý.
- Limits nhãn hợp lý; claim ValueError crash controller gán UNSURE là đúng mức (code quan sát, chưa chạy).
