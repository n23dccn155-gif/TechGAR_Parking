# REVIEW contour-filtering (builder-a, Task 6)

- Verify OK: max_bbox 0.30/0.42/0.12 (:87-89), giant `area>0.22·S` silent (:955), oversized telemetry + xoá contour (:964-972), aspect [0.25,5.0] không telemetry (:973-975 — đúng như limit ④ ghi), min_area 650/350-priority (:1012), motion gate px/ratio 100/0.05 runtime, 160/0.08 class, 50/0.03 priority (:1015-19), echo test 0.45/0.22/dist≤max(24,1.1·min-dim)/gap≤14 (:1088-1110), drop = echo∧IoU≥0.25∧Bhat≤0.12∧¬clean-owners (:1121-33), owners ≥3 clean obs disjoint (:1136-45), echo-of-matched history[-4] + post-assign filter (:1147-60, 2318-34).
- Figure bt f1422: box đỏ blob 223×247 mép trái khớp caption + toán (223<384, 247<302, 55k<110k) — đúng E-C-007.
- Nit: value-row "reject ROI" cite :912 nhưng `anchor_outside_roi` nằm ở :1004 — cùng vòng lặp, chỉ lệch src; không sai ý.
- limits nhãn CONFIRMED hợp-lệ; nhận-xét "trần cực đoan không phải mô hình xe" đúng.
