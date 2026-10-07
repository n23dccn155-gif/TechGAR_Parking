# checkpoint-b — B reader-review độc lập, READABILITY V3 R2 (2026-10-04)

## Vai trò
- B = "người lạ" đọc chéo trang **ROI mẫu** khi A nộp R2. CHỈ review, KHÔNG viết web/nội dung/nguồn.
- Ownership: chỉ `.analysis/readability-v3/` (script `_qa_*_b.mjs`, ảnh, checkpoint, report này).
- Không R3–R6, không approve/block — feedback qua LEAD.
- CHƯA review live khi A đang edit. Chờ LEAD báo **ROI-ready**.

## Đã đọc (đầy đủ)
- `.analysis/PLAN-readability-v3.md` (134 dòng) — khuôn mẫu v3 §2, schema §3, mẫu ROI §4, phân công §5.
- `algo-web-v2/style-guide-v3.md` (121 dòng) — quy tắc viết §1, khuôn §2, nhãn tầng §3, bảng chặng §4,
  contract/kiểm-chứng §6.
- `readability-v3/roi-source-a.md` + `stages-c.md` + `r1-core-c.md` (context A/C đã nộp).
- C diff vào `glossary.js` của B: `TG.glossary.lookup` + ALIASES cho tooltip R1 — đã thấy, KHÔNG sửa
  (C owner core wiring; B chỉ giữ TERMS data).

## Cổng bắt buộc (style-guide §0/§6)
- Chỉ ROI được viết lại; dừng sau R2 cho người dùng duyệt giọng. B KHÔNG động vào content/pages A-C.

## Tiêu chí "người mới đọc mặc định" — checklist khi ROI-ready

### Trình tự đọc (bắt buộc)
1. Mở `#/algo/roi` 1440×900 rồi 1280×720 (file://, Playwright có sẵn).
2. **Paraphrase TRƯỚC** khi mở: tab "Xem mã giả", ô ④, accordion Deep, tooltips, glossary.
3. Paraphrase 3 câu: (a) nó làm gì · (b) nằm đâu trước/sau cái gì, ROI có stage độc lập không
   · (c) thiếu nó thì sao — ghi nguyên-văn lời mình vào `reader-roi-b.md`.
4. Sau paraphrase mới mở tooltip/④/Deep so sánh default-vs-source.

### Checklist lớp mặc định (style-guide §1-§2)
- [ ] Tóm tắt 1 câu in đậm ≤25 từ; bài toán 2–3 câu không thuật ngữ chưa-giải-nghĩa.
- [ ] Dải vị trí: trước=**occlusion (chặng 3)** → ROI **⊂ chặng 4 phát hiện chuyển động** →
      sau=**assignment (chặng 5)**; ROI KHÔNG được vẽ thành chặng riêng giữa nhận-ảnh và dự-đoán;
      vùng ưu tiên có nguồn feedback (không ép chuỗi chính). Có câu "Nếu thiếu bước này thì…".
- [ ] Caption lớn 1 câu/bước; nhãn canvas ≤6 từ ≥13px; "KHÔNG có X / CÓ X" thay TẮT/BẬT.
- [ ] Panel phải mặc định tab **Các bước** (tiếng Việt tự nhiên, highlight đồng bộ canvas);
      Mã giả chỉ ở tab riêng.
- [ ] HUD chữ thường-ngày, không field/debug code.
- [ ] 4 ô đủ: ① Luồng 3–5 mục gắn step · ② Quy tắc Nếu/thì/vì 2–5 · ③ Vấn đề & biên 2–4
      (≥1 giới-hạn/gãy) · ④ Mã nguồn gấp-sẵn.
- [ ] Cấm ở mặc định: `N\d+`, `T[123]`, `tc:/svb:/gsc:/mt:`, `.py:\d+`, `∧¬⇒`, `[code]/[suy luận]`,
      `_snake_case(`, câu bắt-đầu mũi-tên, câu cụt.
- [ ] Câu ≤25 từ (30 = lỗi); thuật ngữ lần-đầu có nghĩa/tooltip; "ROI" không mặc-nhiên đã biết.
- [ ] Số liệu ở mặc-định chỉ khi giúp hiểu; phân-biệt runtime/class-default/derived/minh-họa
      (A đã đối-chiếu Appendix E roi-source-a — 10% hộp-bao là vùng-ưu-tiên, KHÔNG phải điều-kiện
      ROI chính — mẫu plan sai chỗ này, bản thật phải khác).
- [ ] Caption/steps/HUD giúp phân-biệt **vành đệm 48px vs vùng ưu tiên vs lọc ROI** — 3 cơ-chế
      riêng, không gộp; giới-hạn có rõ (thiếu file ROI → gộp ô-đỗ làm ROI có-thể cắt lối đi).
- [ ] Canvas KHÔNG misleading: tín-hiệu nhìn thấy khớp caption/claim (không vẽ vật bị lọc như-thể
      vẫn "được thấy", priority band vs ROI ring phân-biệt màu/nhãn rõ).

### Suy-rộng từ kinh-nghiệm LEAD cũ (áp khi xem)
- Canvas geometry phải nhất-quán actual distances/claims (bài-học handoff ring 25cm).
- Không ngụ-ý token/TTL sống quá hạn (bài-học dormant clocks).
- Caption bước reverse/điều-kiện phải nêu đúng nhánh đang thử (bài-học gate caption).
- Đồng-hồ/nhãn có range nguồn hoặc gắn "(minh họa)" rõ.

## Deliverable (khi LEAD báo ROI-ready)
- `.analysis/readability-v3/reader-roi-b.md`: paraphrase 3 phần + bảng quan-sát checklist +
  chỗ khó/thuật-ngữ/câu-cụt/canvas-misleading + ảnh paths `qa/shots/b/` (hoặc
  `.analysis/readability-v3/shots/` nếu giữ tách) + default-vs-source sau khi mở sâu.
- Script repro nếu cần: `.analysis/readability-v3/_roi_reader_b.mjs`.

## Trạng thái
DRAFT review đã nộp (`reader-roi-b.md`, hash `dbeab8f4dd42`). LEAD phản-hồi:
- roi-v3-final-s2-1440.png: xe A/B đều TRONG viền — không xe nào bị viền cắt → canvas chưa
  chứng-minh claim vành-đệm. A được giao sửa ACTUAL edge-case scene + xử-lý F1–F5/overpromise.
- CHƯA final-retest cho đến A freeze. Hash freeze mới sẽ ghi lại trong report cuối.

## Final-retest criteria (khi LEAD báo freeze) — bắt-buộc chứng-minh bằng HÌNH

1. **Step 2 edge-case thật**: canvas phải vẽ ít-nhất 1 xe **bị viền cắt** (hộp xe lấn qua
   đường-viền vào vành-đệm), vành-đệm hiện-vai-trò "đo trọn" — không chấp-nhận chỉ-dải-xanh
   + caption suy-ra đạt.
2. **Vệt thuần-vành bị loại**: có blob/vệt nằm TRỌN trong vành-đệm (không chạm viền) phải
   hiện dấu loại (✗/xám) — nhìn thấy trên canvas, không chỉ chữ.
3. **F1–F5 đã xử-lý**: 'vệt' có gloss lần-đầu; 'điểm đáy' có nghĩa inline; 'xe mới nổ máy'
   không mơ-hồ; steps vs ① phân-biệt vai-trò; nhãn canvas không chồng ở 1280.
4. **Overpromise**: không claim gì canvas/caption không chứng-minh được; số 48px/10%/giới-hạn
   phải khớp chữ+hình.
5. Giữ nguyên: ROI ⊂ chặng 4, dải trước=occlusion sau=assignment, fallback GIỚI-HẠN.
6. Ghi hash content+page lúc freeze vào `reader-roi-b.md` (phần FINAL), ảnh mới `shots-b/final/`.

CHỜ LEAD signal. Không sửa web, không R3+.
