# BÁO CÁO SPEC-CHECK — TechGAR NCKH 13-slide deck

> **Phạm vi kiểm tra:** 13/13 slide (preview PNG 1280×720 + SVG nguồn) đối chiếu `TechGAR_13_Slides_Final_Brief.md` (đặc biệt §17), `outline_13.md`/`outline.json`, `verified_numbers.md`, `layout_rotation.md`.
> **Kết luận tổng:** **13/13 PASS — 0 BLOCKING.** Deck đạt mọi yêu cầu bắt buộc của spec. Có 6 mục MINOR/WARN (không chặn GATE 3).
> **Bổ sung của manager (kiểm chứng vật lý PPTX):** media1–4.mp4 embed đúng slide 1/7/11/12 (zip check + slide rels); oMath native trên S5 (3), S8 (6), S10 (3); file `docs\TechGAR_NCKH_13slides.pptx` 40,68 MB.

## Bảng tổng hợp PASS/FAIL/WARN

| # | Slide | Layout (chuẩn: A B C B D C D B D E C E B) | Verdict | Ghi chú |
|---|---|---|---|---|
| 1 | Định vị phương tiện & quản lý ô đỗ tầng hầm | A ✓ | **PASS** | Hero Problem đúng; câu hỏi NC đúng verbatim; caption "Mô hình bãi đỗ thu nhỏ" trung thực |
| 2 | Tại sao một camera chưa đủ? | B ✓ | **PASS** | Comparison 50/50; "chưa có baseline định lượng" — không tự thêm số |
| 3 | Từ video camera đến quyết định ô đỗ | C ✓ | **PASS** | Pipeline 8 tầng chevron + bảng lỗi→cơ chế; MINOR: gộp 2 row Cross-Camera/Matching |
| 4 | Hai camera quan sát cùng một không gian | B ✓ | **PASS** | Skew 18/47/110 + ngưỡng 120 ms tag đúng; "không phải chạy tiếp sức" ✓ §17 |
| 5 | Từ ảnh góc chéo đến tọa độ mặt sàn | D ✓ | **PASS** | s[X,Y,1]ᵀ=H[u,v,1]ᵀ; KHÔNG nói "triệt tiêu parallax"; seam benchmark 1,13/4,39/945 tag đúng |
| 6 | Duy trì Local ID trong từng camera | C ✓ | **PASS** | 3 tình huống + MOG2/Kalman+LAPJV/SSD; 1.714 & 25 tag `[doc-claimed: session 2808_3]` |
| 7 | Một xe — hai quan sát — một Canonical GID | D ✓ | **PASS** | ✅ `demo_overlap_split.mp4` CÓ: poster_s07 + play marker + caption "4,72 s · 118 frame @25 FPS"; video nhúng PPTX |
| 8 | Khi nào hai track được xem là cùng một xe? | B ✓ | **PASS** | Weights 0.55/0.30/0.10/0.05 + cos θ<0.25 ⇒ REJECT; ghi "tuning thực nghiệm (heuristic)" — KHÔNG "tối ưu"; có ảnh minh họa thuộc tính xe |
| 9 | Tại sao một bộ tham số cố định không đủ? | D ✓ | **PASS** | 3 ảnh thật tối/thường/lóa; **25 biến thể** (5Δγ×5ΔCLAHE) — KHÔNG 9 biến thể; nguồn "tuning trên indoor validation set" |
| 10 | Từ 25 biến thể đến quyết định ổn định | E ✓ | **PASS** | Ngưỡng **≥12/25** (KHÔNG 5/9); `required_votes=25//2=12` VERIFIED-CODE; "majority vote — chưa chạy threshold sweep" |
| 11 | Từ xe đi ngang đến trạng thái đỗ — khôi phục ID | C ✓ | **PASS** | Lifecycle Moving→Parked→Moving→Re-ID; arrival ≥3 mẫu; vision ≥2 lần/~1.5 s; token 5s→≤15s; Re-ID "đang kiểm chứng trên replay" ✓ |
| 12 | Kết quả thực nghiệm trên dữ liệu tầng hầm | E ✓ | **PASS** | Tất cả số tag `[doc-claimed: session 2808_3]`; failure = hiep2 G#2→G#4 @f1181; KHÔNG P/R/MOTA; KHÔNG 48,4%; glare chỉ "minh họa điều kiện"; box "GIỚI HẠN PHÁT BIỂU" chống suy rộng 95% |
| 13 | Đóng góp nghiên cứu và hướng phát triển | B ✓ | **PASS** | 3 contribution cards + hạn chế bắt buộc + roadmap + closing line verbatim |

## BLOCKING (phải sửa trước GATE 3)

**Không có.** Mọi mục bắt buộc trong checklist đều PASS.

## KẾT QUẢ SAU REWORK (GATE 2 → GATE 3)

Cả 6 mục MINOR đã được sửa trong SVG nguồn và rebuild:
1. Font phụ đã nâng lên 16px tại S1/S3/S4/S12/S13 (có chọn lọc, re-wrap khi cần).
2. S8 đã có pictogram 3-case hướng (cùng hướng / lệch vừa / ngược hướng ⇒ REJECT).
3. Outline docs đã đồng bộ `f0190` → `f0005` (file thật đã dùng).
4. S3 đã tách thành 7 hàng riêng (Cross-Camera | Matching) theo spec.
5. S5 đổi sang `roi_full_view.png` (50/50 blend — không còn nhãn "DIAGNOSTIC"); S7 đổi sang `shared_map_preview.png` (coverage diagram).
6. S11 caption stage đã thêm "· mô hình thu nhỏ"; fix thêm overlap caption y=538→552.

**Re-validation:** final gate 13/13 fully passed, 0 errors, 0 warnings · pptx_delivery_check passed · 4 MP4 embed đúng S1/S7/S11/S12 · OMML S5×1, S8×2, S10×1 · 0 dangling relationships · PPTX 38.57 MB tại `D:\TechGar2\docs\TechGAR_NCKH_13slides.pptx`.

## MINOR / WARN (nên sửa, không chặn)

1. **[WARN] Body font một số text phụ 14–15pt.** Checklist khuyến nghị body ≥16pt; các text phụ dưới ngưỡng: S1 sub-caption 15, S3 ghi chú cuối 15, S4 note 15, S12 context/caveat 14, S13 roadmap list 14 & limitations 15. Title 40–44 ✓, caption nhỏ nhất 11–13 ≥9 ✓. → Nâng các dòng nội dung chính lên ≥16 nếu siết checklist; text tag/caption giữ nguyên.
2. **[MINOR] S8 thiếu pictogram 3-case góc** theo spec Slide 8 "Minh họa" (→→ ACCEPT / →↗ xem xét / →← REJECT). Hiện chỉ có formula `cos θ` + band `cos θ < 0.25 ⇒ REJECT` + text giải thích — tương đương nội dung nhưng thiếu minh họa mũi tên spec vẽ.
3. **[MINOR] S9 + S12: glare frame là `f0005`, không phải `f0190`** như outline. File thật trên đĩa là `..._f0005`; caption trung thực "@f005" — không sai sự thật nhưng lệch tên asset outline.
4. **[MINOR] S3 gộp 2 row spec** "Cross-Camera" và "Matching" thành 1 row — nội dung đủ, chỉ khác số row so với bảng spec §Slide-3.
5. **[MINOR] S5 ảnh `shared_map_full_view.png` mang nhãn nhúng "DIAGNOSTIC FULL FRAME — not the runtime tracking area"**. Caption slide trung thực; hội đồng có thể hỏi — cân nhắc đổi sang `roi_full_view.png` (alt đã liệt kê trong outline).
6. **[MINOR] S11 caption từng stage chỉ ghi `@f278/@f543/@f705`** không lặp chữ "scale-model" (footer có). Đủ trung thực ở mức slide.

## Kiểm chứng chéo đã thực hiện

- **Nguồn số liệu:** mọi tag trong SVG khớp `verified_numbers.md` — 18/47/110ms+120ms (S4), 1,13/4,39/945 (S5/S12/S13), 1.714/25 (S6), 3.827/153,08/25FPS/169ms/19-20/88,4% (S12), 0.55/0.30/0.10/0.05+cos θ<0.25 (S8), 25=5Δγ×5ΔCLAHE + γ≈2.5–2.8/CLAHE≈2.0/Δ±0.2·±0.5/grid 8×8 (S9), ≥12/25+smoothing 5f (S10), ≥3 mẫu/≥2 lần·~1.5s/token 5s→≤15s (S11).
- **Font:** title 40–44 ✓ (≥28); caption/source-tag 11–13 ✓ (≥9); chevron labels S3 = 11 (nhỏ nhất deck, vẫn ≥9).
- **Overflow:** không thấy clipping/overlap trên 13 preview; final gate 13/13 pass, 0 errors/warnings.
- **Speaker notes:** `notes/*.md` 13 file khớp verbatim outline.
- **Câu "GNSS yếu hoặc vắng mặt"** (S1) — tương đương ngữ nghĩa spec; không claim "mất hoàn toàn"/"0 dBm".
- **Caption "scale-model/mô hình bãi đỗ thu nhỏ"** xuất hiện trên mọi footage — không chỗ nào gọi "ảnh thực địa/bãi xe thật".
- Không marketing/CTA, không "GPS=0 dBm", không "triệt tiêu parallax", không "95% mọi điều kiện" (grep toàn bộ svg_output: 0 hit ngoài disclaimer đúng ngữ cảnh).
- Layout rotation đúng chuỗi `A B C B D C D B D E C E B`.
