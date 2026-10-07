# INBOX-A — builder-a status/outbox (algo-web-v2 redesign Task 6 nhóm 1+2)

## 2026-10-06 — Sẵn sàng review chéo: roi-mask + parking-slots (Step F)

Hai trang đầu của Task 6 đã xong Step A–F, mỗi trang: lint **0 ERROR / 0 WARN**, e2e **PASS** (file+http × desktop+mobile).

| Trang | notes | page | figures | Điểm đáng review |
|---|---|---|---|---|
| `roi-mask` | notes/roi-mask.md | js/pages/roi-mask.js | roi-cam1/2.jpg (polygon thật từ config) | interactive:"roi"; 6 bước how; limits dùng E-C-001/E-B-003/006/E-C-003/E-A-039; caption cam2 giải thích watermark-droidcam-trong-ROI |
| `parking-slots` | notes/parking-slots.md | js/pages/parking-slots.js | slots-cam1/2.jpg (30 ô/cam thật) | occupancy pipeline 25-variant ensemble + dwell machine; limits: vision-occupied-w/o-tracking EXPECTED + toi6 latch CONFIRMED |

Đề nghị builder-b review theo REVIEW-&lt;slug&gt;.md: độ chính xác prose, kind tagging (runtime/config/class-default/derived/inference), refs `file:dòng`, và ranh giới phạm vi trang (occupancy ≠ slot binding — binding thuộc trang nhóm sau).

## Đang làm tiếp (không chờ review)
- `brightness` Step A đang bắt đầu (group 2).

## Lưu ý quy trình phát hiện
- `resolveRef` chỉ nhận MỘT khoảng dòng mỗi src (`file:a-b`); dạng `file:a-b,c-d` bị coi là symbol → lint lỗi "file không tồn tại". Ghi nhớ cho các trang còn lại.
- `quickvalues-data.js` KHÔNG sửa tay — file ghi chú Task 11 sinh từ params[] bằng qa/build-values.mjs.
- Glossary thêm `context band` (page roi-mask). Không term mới ở parking-slots.
- index.html giữ nguyên các page của builder khác (snapshot-api, gate-session thấy xuất hiện song song).

## Blocker
- Không có. Review chéo là non-blocking — tiếp tục theo thứ tự MEGAPLAN.

## Task 6 nhóm 1+2 — HOÀN TẤT 8/8 (2026-10-06)

- Tất cả 8 trang (roi-mask → occlusion-watershed): lint 0/0 + e2e PASS từng trang.
- Site-wide: lint 19 trang 0 ERROR 0 WARN; e2e 96 routes PASS, 0 issue.
- Notes: notes/{roi-mask,parking-slots,brightness,motion-detection,contour-filtering,kalman-lapjv,track-lifecycle,occlusion-watershed}.md — số liệu+line refs đã verify.
- Figures: 10 asset real mới (motion, kalman coast, lifecycle, occlusion cluster dùng chung f1407 thai1 cho câu chuyện ambiguous nối nhau).
- Glossary +3: context band, MOG2, cast shadow.
- Vẫn chưa thấy REVIEW-* cho roi-mask/parking-slots — lead poll khi cần.
