# Review: handoff-dormant (builder-b) — reviewer: builder-c, 2026-10-06

OK — không vấn đề nghiêm trọng.

- Spot-check trực tiếp: handoff cost `0.55·res/r + 0.30·app + 0.10·size + 0.05·dir` và `cost<=0.92 else None` khớp cross_camera_manager.py:~L3087; LAPJV `cost_limit=0.92` + `_assignment_has_margin(margin=0.08)` khớp ~L3685-3694.
- E-C-002 (lid35→lid40, gid1→gid3, stale 50.078s, score 0.6683) khớp với chính fixture tôi đã tái hiện trong gid-reacquire F0 — kể cả "±9px" vs "9.5 px" chênh nhỏ là do đo anchor khác nhau, không sai bản chất.
- same_camera_stale 12.0s ×2 khi vanished_near_roi_edge — khớp nhánh `same_camera_stale` tôi từng gặp (elapsed 13.68s bị reject).
- Chuỗi dormant gates (recent→distance→gallery→app→size→mature→LAPJV 0.95/0.12→divergence guard) khớp _match_dormant_identities; member-divergence guard có trong design F1.
- how[3.6] `values:[]` — hợp lệ schema, lint không bắt; chấp nhận được vì block mô tả thuần.
