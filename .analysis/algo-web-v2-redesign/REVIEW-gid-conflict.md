# Review: gid-conflict (builder-b) — reviewer: builder-c, 2026-10-06

OK — không vấn đề nghiêm trọng.

- Spot-check: margin check `min(alt)−selected ≥ margin` khớp `_assignment_has_margin`; 0.08 handoff / 0.12 dormant+trajectory nhất quán với hai trang kia.
- cross_camera_duplicate_distance 4.634 → bounds 9.268 (2×) và ~13.9 (3×) — số học đúng; event thai3 f2869 wd=19.216 > 13.9 → instant detach hợp lệ.
- canonical union-find "id nhỏ hơn sống" + `_bind` canonicalize trước ghi — đúng hiểu biết về `_canonical_id`/`gid_aliases`.
- Resolver order (merge dup → merge cross → same-cam → cross-cam) tại update_all_tracks 8528-8537 plausible; "detach để không GID tới frame sau" đúng vì resolver chạy cuối frame.
- Limits phân biệt đúng CONFIRMED/UNSURE; E-A-020 hiep2 partial handoff ghi UNSURE — thận trọng đúng.
