# REVIEW: predictions-jsonl (builder-c, Task 9)

OK — 1 nit trình bày.
- Verify: file thật 2872 dòng khớp claim; top-level keys đếm được 18 (đúng "15 core + 3 bơm thêm"); skew thật frame1 = |12083828000000 − 12083859000000| ns = 31.0 ms — kết quả page đúng.
- Nit: formula `skew_ms = |t1 − t2| / 1 000 000` kèm subst "|12083828 − 12083859| ms = 31.0" — subst hiển thị toán hạng đã quy ms rồi mới trừ, hơi lệch so với formula (chia cho ns). Kết quả không sai; có thể viết lại subst cho rõ.
- `noFigureReason` hợp lý (trang format-dữ-liệu).
- Limits đúng mức: chỉ-tồn-tại-khi-session_dir CONFIRMED; fingerprint same-object-id UNSURE hợp lý.
- Chưa verify độc lập 44/19 event_type và 29 field/obs — đều dẫn file thật nên chấp nhận được.
