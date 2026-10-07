# REVIEW: failure-gallery (builder-c, Task 9)

OK về độ chính xác — 2 ghi chú.
- Verify vs ERRORS-SUMMARY canonical: toi4 f51 24 box (L31), toi6 53 tentative+9 lost (E-B-001), E-C-002 gid1→gid3 ±9px harm UNSURE (L46), capture gaps + thai1 ~6.7s (E-C-004/O-B-017 L50), dup 41 cặp thai3 + 59 thai4 (L27), 0 S1 proven (L27). Tất cả khớp.
- Nit F1: prose ghi "thai3 chín cụm cam1 + mười cặp cam2" (cửa sổ event) trong khi value row ghi "41 cặp thai3" (scan toàn-session) — cùng nguồn nhưng hai granularity; người đọc có thể nhầm là mâu thuẫn. Nên chú thích "cửa sổ vs toàn-session".
- F5 cơ chế đang ghi "suy luận" nhưng đã có trace thật: `.analysis/gid-reacquire/F0-a-codepath.md` chứng minh mint gid3 qua new-lineage fallback sau khi dormant reject `same_camera_stale` + world-ReID `trajectory_score` 0.6683<0.78 — có thể nâng mechanism thành CONFIRMED với ref đó (F1-design đã duyệt, F2 đã implement).
- Nhãn phân loại 3 mức CONFIRMED/UNSURE/EXPECTED nhất quán với canonical; EXPECTED cho xe-đỗ-sẵn-không-track là đúng.
