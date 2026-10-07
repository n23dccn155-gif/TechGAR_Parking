# LEARNER-READ — lead đọc thử 5 trang như người học (Task 13 Step 5)

Đọc file trực tiếp (không qua render): motion-detection, tracklet-descriptor, parking-detector, snapshot-api, predictions-jsonl.

## Đánh giá chung
Đọc được mạch lạc; mỗi khối ③ có cơ chế + số + lý do; ví dụ thật (B02/B05/A01, sang8 f600, thai1 f1500) làm trang sống. Số đều kèm src file:dòng.

## Phát hiện (nhỏ, không block)

1. **predictions-jsonl**:
   - fn.text lỗi chính tả: "trạng thái **là** phẳng" → "trạng thái phẳng".
   - Comment marker lệch: `/* ⑤ Giới hạn` và `/* ⑥ Nguồn */` — đúng ra ⑥/⑦ (cosmetic, chỉ là comment trong file).
   - `limits[]` dùng `{status, text}` phẳng trong khi trang khác dùng `{text, evidence:{status}}` — hai shape cùng được chấp nhận nhưng nên thống nhất.
2. **parking-detector**: §3.4 "quét **17** session replay" — ĐÃ VERIFY: `experiment_test/output/` có đúng 17 thư mục `verify_cur_session_*` (corpus khác với 18 session official của V1-replay mà replay-ground-truth cite). Không mâu thuẫn — giữ nguyên.
3. **motion-detection / contour-filtering / kalman-lapjv / occlusion-watershed / track-lifecycle**: caption "(raw)" nhưng ảnh có annotation — đã thêm vào queue FIX của builder-a (đổi thành "(frame gốc + chú thích)" hoặc bỏ).
4. Không phát hiện thuật ngữ thiếu gloss; mọi `[[Term]]` đều có trong glossary-data (45 terms).

## Đề xuất xử lý
- (1) + (2) giao builder-c sửa nhanh kèm cuối FIX (predictions-jsonl là trang Task-9 của c; parking-detector là của b — số 17 vs 18 phải verify rồi mới sửa).
- (3) đã vào queue builder-a.
