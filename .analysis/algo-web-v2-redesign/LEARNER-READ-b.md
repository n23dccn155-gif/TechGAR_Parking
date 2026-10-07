# LEARNER-READ-b — đọc-thử như người học (builder-b)

Đọc top-down 5 trang theo thứ tự render ①→⑦. Glossary Task 11 đã phủ tốt; dưới đây chỉ ghi điểm vấp.

## kalman-lapjv
- `lineage` / `lineage_score` dùng lặp lại ("hai lineage", "0.08 nhân hai trừ điểm lineage") nhưng chưa gloss + chưa định nghĩa trên trang — người học không biết score này tính từ đâu.
- Câu "phải tốt hơn mọi phương án cạnh tranh ít nhất 0.08 nhân hai trừ điểm lineage" — thứ tự toán tử nghe khó; nên viết `0.08 × (2 − lineage_score)` ngay trong prose (đã có trong values nhưng prose tự chận).
- `extent` trong công thức gate xuất hiện không giải thích (là max(w,h) của track); subst "extent 100" để người học tự đoán.
- `stale anchor` được định nghĩa inline tốt; `clean size`/`clean observations` thì không — "sạch" nghĩa gì chưa rõ.
- Số liệu: đủ src. E-B-003/E-B-006 là mã chiến dịch nội bộ — người học ngoài không tra được (có thể trỏ failure-gallery).

## parking-slots
- Trôi chảy; các lớp mask 3.2 giải thích tốt. "TemporalSmoother gần như tắt" trong params — người học không biết nó là gì/vì sao "gần như" (thực tế bị bypass khi stable_evidence).
- `CLAHE`, `adaptiveThreshold ... khối 25 hằng số 16`, `LAB` — thuật ngữ OpenCV chưa gloss; có src nhưng người mới sẽ hỏi C=16 là gì.
- `dwell machine` định nghĩa inline OK; `hysteresis` không dùng — tốt.
- "chi tiết đáng nhớ: ô chưa đủ bằng chứng → mặc định occupied" — câu hay, dễ nhớ.
- E-B-001/002 mã nội bộ (cùng note như trên). Số liệu đều có src.

## gate-session
- 3.1: "published_at được trễ tối đa năm giây so với đồng hồ controller và chỉ được vượt tương lai một giây" — chiều `trễ`/`vượt tương lai` dễ lẫn; values `−1.0 → +5.0 s` cứu được nhưng prose nên ghi rõ chiều dấu.
- `cursor` (episode cursor), `coordinator`, `runtime_id`, `candidate` — dùng như khái niệm nhưng chưa gloss; người học phải suy từ ngữ cảnh.
- 3.5 "episode có evidence vượt applied frame, hoặc applied vượt frame hiện tại, bị loại ngay" — đặc, đọc hai lần mới thấy đây là freshness guards.
- Tên state tiếng Anh (WAITING_FOR_SCAN...) cần thiết (đúng enum) — OK.
- Số: gate endpoints có ghi "đơn vị centimet" — tốt; mọi số có src.

## routing-astar
- `heuristic`/`admissible` — khái niệm trung tâm nhưng chưa gloss; giải thích "không phóng đại chi phí còn lại" giúp nhưng từ khoá cần gloss.
- "Hệ số đó là min của tỷ số giữa distance khai báo và độ dài Euclid trên mọi cạnh" — câu khó nhất trang; formula dưới cứu được.
- Map zone→làn `E,F trái; C,D giữa; A,B phải` — người học vừa đọc parking-slots (cam1 D/E/F, cam2 A/B/C) sẽ tự hỏi sao 6 zone trên một bản đồ; mối quan hệ shared-map frontend vs 2 cam chưa nói.
- `open-set`, `access-anchor`, `nodeOrder` — code-term inline, chấp nhận được.
- Chi tiết hay: App override off-route 75→80 có src — người học thấy runtime vs default.
- Số đều có src.

## replay-ground-truth
- `harm`/`UNVERIFIED` trong values — từ vựng chiến dịch (mức độ hại) không giải thích; người học thấy "harm UNVERIFIED" sẽ hỏi harm là gì.
- `cohort`, `record_consistent`, `eyeball coverage` — jargon chiến dịch, định nghĩa tản trong prose nhưng chưa gom.
- Câu dài 3.3 "mười tám session official, tổng bốn mươi mốt nghìn sáu trăm hai mươi lăm cặp frame" — viết bằng chữ khó nạp; đã có values số học — chấp nhận được.
- Cấu trúc ③ (replay) vs ④ (GT) rõ; "hai bên nối với nhau" kết tốt.
- Figure contact-sheet + limit 148-file fingerprint — honest, có thể hơi inside-baseball nhưng không sai.
- Số đều có src (gồm file .analysis — hợp lệ vì trang này tự giới thiệu là chiến dịch).

## Gợi ý gom (không sửa)
- Bổ sung glossary: `lineage_score`, `heuristic/admissible`, `harm`, `cursor`, `clean observations`, `CLAHE`.
- Mã lỗi E-B-*/E-C-* nên có chú thích trỏ failure-gallery cho người đọc ngoài.
