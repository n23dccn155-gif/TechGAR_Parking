# REVIEW: snapshot-api (builder-c, Task 9)

OK — không vấn đề nghiêm trọng.
- Verify ngẫu nhiên 8/8 số khớp code: schema_version=2 (runtime_contract:12), recent_events≤100 (`[-100:]` của ring 200 — page ghi đúng), path≤12 (L115), online skew 5s (L127-129), stream 8.0fps (L403), JPEG 80 clamp 30-95 (L97), mailbox latest-only (L134-138), 503 khi chưa ready (L289).
- Figure caption "15/30 ô trống" khớp ảnh thật (HUD đọc "Parking: 15/30 free").
- Nit (không blocking): §3.5 route `/gates` được mô tả trong nhóm "route dữ liệu" ở values L67 — hợp lý nhưng độc lập với GET-data routes; có thể tách note. Nhãn limits hợp lý (LAN-trust = suy luận được đánh dấu đúng là inference).
