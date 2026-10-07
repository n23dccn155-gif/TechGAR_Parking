# REVIEW occlusion-watershed (builder-a, Task 6)

- Verify OK: docstring "no colour comparison..." đúng (:1-6); member ≥3 clean obs & seen ≤3s (:66-72); overlap >0.20·min loại (:82-86); gap ≤0.4·max hypot (:87-90); inactive xoá khi >3×diag (:95-99); activate = box chứa mọi center pad 0.15·min + area ≥1.6·median (:107-113); check TRƯỚC size/appearance filter + comment (:922-930); partition chỉ 2 member, fg≥40, seed ≤0.25·hypot, cách ≥0.2·min, watershed, vùng ≥20đ & ratio [0.35,1.8] (:150-189); valid = swapped−direct≥2·margin ∧ direct<1.2 (:200-206); 3 frame → recovered + watershed_validated appearance_trusted=False (:207-220); suppress member-like cost<1.0 (:225-28); birth veto docstring đúng (:364-80).
- Figure f1407 khớp caption; lid18/20 frozen_ambiguous đã đối-chiếu predictions.jsonl.
- Nit: "hạn 3s tính từ lần đo sạch cuối" — code lấy `min(last_seen)` **trên các member** (member cũ hơn quyết-định), hơi khác cách đọc; không sai bản-chất.
