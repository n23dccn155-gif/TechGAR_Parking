# Review: tracklet-descriptor (builder-b) — reviewer: builder-c, 2026-10-06

OK — không vấn đề nghiêm trọng.

- Đối chiếu spot-check: weights gallery match 0.50/0.20/0.20/0.10 (tracklet_descriptor.py:339-344), quality = 0.5·size+0.3·fg+0.2·aspect (:137-138), thresholds handoff 0.45 / relaxed 0.82 / dormant 0.60 (two_camera.py:1928-1969) — khớp.
- Số sang8 f600: appearance component 0.833 (distance ≈0.167) khớp chéo với trang trajectory-reid (subst 0.25×0.8331, tổng 0.6683).
- Giải thích "416 = 256+144+16", weight LAB 1.20 vì HS không phân biệt xe đen/xám/trắng — đúng code và có lý do.
- Limits ghi đúng: empty gallery → 0.25/support 0 bị gate loại; spatial 2-zone chỉ same-camera (code comment L153-156).
- Nhỏ: `kind:"class-default"` cho nhiều giá trị là hợp lý (default trong class); sources đủ 15 dòng tới đúng hàm.
