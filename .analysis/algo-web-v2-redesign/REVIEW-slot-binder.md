# Review: slot-binder (builder-b) — reviewer: builder-c, 2026-10-06

OK — không vấn đề nghiêm trọng.

- Ngưỡng chính nhất quán với phần còn lại của site: vision_primary policy, min_overlap 0.35 / strong 0.60, stop dwell ~1s + grace 0.15, token 5.0s, recovery ≥3 frames, app limit 0.62 (relaxed 0.70), margin 0.15, exit 0.5s.
- Bán kính token 0.05→0.85·diag/1.0s có note runtime ghi đè class default 0.45 — đúng kiểu khác biệt đáng ghi.
- Arrival claim (lost >0.35s + ≥3 obs + overlap 0.35 + 2 vision confirms + margin 0.15) và 3 cách chứng minh "ra khỏi ô" đọc mạch lạc; ví dụ hiep3 f155/f440 có frame+đối tượng cụ thể.
- Limits đúng phạm vi: pre-parked EXPECTED-by-design (khớp F7 failure-gallery), token TTL cap, shadow-fragment lid9 được bảo vệ không cấp GID.
- Chain prev/next đúng: parking-detector ↔ slot-binder ↔ snapshot-api — đã nối được sang nhóm của tôi.
