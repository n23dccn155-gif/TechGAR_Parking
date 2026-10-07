# QUESTIONS-FOR-USER — quyết định cần user sau chiến dịch verify-replay

Ngày: 2026-10-06 · Kèm `ERRORS-SUMMARY.md`. Không có câu hỏi nào chặn việc đã làm; đây là quyết định cho bước tiếp theo.

## Q1 · Ground-truth identity
Hầu hết `ground_truth_identity.csv` chỉ có header → mọi `identity_impact` chỉ dừng ở UNVERIFIED. Muốn kết luận ID-switch/lost-vehicle đúng nghĩa cần GT tối thiểu cho **3–5 session có nhiều sự kiện** (gợi ý: thai3, thai4, thai5, thai6, sang8). **Bạn có muốn team gắn nhãn GT thủ công cho các session này không** (việc nặng, ~vài giờ human-in-loop), hay chấp nhận mức báo cáo phenomenon-only?

## Q2 · Hai UNSURE cần phán quyết cơ chế (không cần GT)
- **E-B-003/E-B-006:** coasting/frozen ~140f trên xe nửa-ngoài-ROI và nền mép — boundary-legit hay thiếu coast-TTL? Cần quyết định semantics từ người biết thiết kế.
- **E-C-003:** `anchor_pixel` ngoài ROI polygon trên xe sát mép — expected theo convention anchor, hay defect của mask? Cần ý kiến người đặt ROI.

## Q3 · Hướng xử lý lỗi đã CONFIRMED (chờ duyệt trước khi sửa)
Ưu tiên đề xuất (chỉ là đề xuất, chưa làm):
1. **DUPLICATE_TRACK** (nhóm 1) — dữ liệu đã có (41+59 pairs, IoU/frames đầy đủ) → đưa thẳng vào làm baseline cho nhánh merge/split (P0 đã xong, đang HOLD trước P1).
2. **Phantom bursts** (nhóm 2, E-C-006 + bursts A) — nghi `detection/morphology`/`local-lifecycle`; trùng với mục §20 morphology-audit trong spec merge/split → có thể gộp ablation chung.
3. **E-C-002 gid lineage loss** — case duy nhất chứng minh cùng-xe; xem có nằm trong scope merge/split hay cross-camera riêng.
4. False-det fixture (nhóm 3) — mức cosmetic S3, có thể xử lý bằng ROI/mask tinh chỉnh **nhưng user đã yêu cầu không đổi mask** → cần phê duyệt riêng nếu muốn sửa.

## Q4 · Config-era
Yêu cầu ban đầu là "dùng config hiện tại, không đổi" — đã làm đúng. Các session cũ có thể thuộc camera-era khác; V2 báo aligned cả 18 nhưng đó là kiểm tra hình học sơ bộ, không phải chứng minh tuyệt đối. **Nếu muốn đối chứng**, cần duyệt một lượt replay phụ với `config/sessions/<S>/` per-session (cost: thêm ~1–2h replay + audit) — có cần không?

## Q5 · Per-file freeze tuyệt đối
Freeze-check cuối chỉ ở set-level (git status + 6 config SHA + HEAD) vì fingerprint 148-file nằm trong context của LEAD đã mất. Nếu bạn cần chứng minh per-file, cách duy nhất là re-hash từ HEAD git (đã sạch) — thực tế set-level đã đủ bảo đảm không file nào bị đụng. Xác nhận chấp nhận?

## Q6 · Nhánh song song đang chờ
- **merge/split:** P0 hoàn tất, `SPEC-REVIEW.md` đã viết — chờ bạn duyệt trước P1 (kết quả replay này là baseline hoàn hảo cho P1).
- **readability-v3** (web TechGAR): tạm dừng.
- **ontay-team** (web ôn tập XLA): team khác, tab `w1:t4`, vòng P7 đang chạy độc lập.
