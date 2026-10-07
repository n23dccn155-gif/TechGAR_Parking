# PLAN v3 — Viết lại algo-web-v2 cho DỄ HIỂU (ưu tiên: người đọc, không phải dev)

Áp dụng trên `D:\TechGar2\algo-web-v2\` (đã có 23 trang + Map + Hành trình + Thuật ngữ). **Giữ nguyên toàn bộ phần trực quan/animation đang tốt; sửa cách trình bày nội dung và khung trang.** Không sửa mã nguồn dự án (`backend/`, `frontend/`). MEGAPLAN.md vẫn là nền; plan này chỉ ghi đè phần "khuôn mẫu trang" (§2) và thêm phase viết lại.

## 0. Vì sao phải sửa (phản hồi của người dùng)
1. Nội dung giống "sổ tay ghi chú của dev": viết tắt (`N1, N5, T1, LAPJV, tc:2401, svb:2653`), câu cụt (`blob thuần-vành → loại`), ký hiệu logic (`sd < -r`, `ov<=0`, `∧ ¬`) dồn vào cùng màn hình.
2. 4 ô **LÀM GÌ / VAI TRÒ / NẰM Ở ĐÂU / TẠI SAO DÙNG** chia theo kiểu báo cáo dev, không theo tư duy luồng thuật toán; "Làm gì" và "Vai trò" lặp ý.
3. Canvas (đang tốt) và panel chữ bên phải (mã giả + công thức) tranh sự chú ý; người đọc không biết nhìn đâu.

## 1. Quyết định đã chốt với người dùng
| Hạng mục | Quyết định |
|---|---|
| Bố cục dưới canvas | Dòng tóm tắt đầu trang + 4 ô mới: **① Luồng thuật toán ② Quy tắc quyết định ③ Vấn đề thực tế & trường hợp biên ④ Mã nguồn & config (gấp sẵn)**; "vai trò trong pipeline" thành **dải Trước → Trang này → Sau** nhỏ gọn |
| Ký hiệu nội bộ | **Ẩn khỏi lớp mặc định.** `N0…N15` → tên tiếng Việt có số chặng; `T1/T2/T3` → *Cốt lõi / Bổ trợ / Tham khảo*; `file:dòng` chỉ nằm trong ô ④ và accordion Deep; thuật ngữ (LAPJV, ReID, homography…) có **tooltip** + lần đầu xuất hiện viết kèm nghĩa |
| Phạm vi | **Toàn bộ 23 trang + Map + Hành trình + Thuật ngữ**, nhưng làm **1 trang mẫu (ROI) trước → người dùng duyệt giọng văn → mới làm hàng loạt** |
| Panel phải canvas | Mặc định = **danh sách bước bằng tiếng Việt tự nhiên** tô sáng đồng bộ canvas; **mã giả** chuyển sang tab "Xem mã giả" |

## 2. Khuôn mẫu trang v3 (thay §2 của MEGAPLAN)
Từ trên xuống:
1. **Tiêu đề** + nhãn tầng bằng chữ (*Cốt lõi / Bổ trợ / Tham khảo*) + "Chặng 3/12 · Dự đoán vị trí xe". Nhãn độ chắc chắn (`[code]/[suy luận]`) chuyển xuống ô ④.
2. **Một câu tóm tắt** ("Trang này dạy gì") — in đậm, ≤ 25 từ.
3. **Bài toán đời thật**: 2–3 câu, ví dụ cụ thể, không thuật ngữ chưa giải nghĩa.
4. **Dải vị trí trong pipeline**: `[Chặng trước] → [TRANG NÀY] → [Chặng sau]` + 1 dòng "Nếu thiếu bước này thì: …" (click chuyển trang).
5. **Canvas** (giữ như hiện tại) + **caption lớn một câu** ngay dưới canvas cho bước đang chạy ("Xe A nằm trong vùng quan sát → giữ lại."); nhãn trên canvas ≤ 6 từ, chữ ≥ 13px; "TẮT/BẬT" → "KHÔNG có X / CÓ X".
6. **Panel phải**: tab *Các bước* (mặc định) | tab *Xem mã giả*. Chỉ hiện 1 tab.
7. **HUD** đổi sang chữ thường ngày ("Vật thể bị nhầm là xe" thay "Blob OFF").
8. **4 ô**:
   - ① **Luồng thuật toán** — 3–5 bước, mỗi bước 1–2 câu hoàn chỉnh, gắn với bước animation.
   - ② **Quy tắc quyết định** — 2–5 quy tắc dạng "Nếu … thì … vì …" bằng lời; công thức/ký hiệu toán đẩy xuống Deep.
   - ③ **Vấn đề thực tế & trường hợp biên** — 2–4 tình huống: *Tình huống → Nếu không có → Nhờ thuật toán*; gồm ít nhất 1 tình huống "khi thuật toán gãy/giới hạn".
   - ④ **Mã nguồn & config** — gấp sẵn; liệt kê file, hàm, tham số mặc định, `file:dòng`, độ chắc chắn.
9. Accordion: **Hỏi đáp phản biện** (giữ), **Deep — tham số, công thức** (giữ, gom `realParams` + `limits`).

**Quy tắc viết (áp cho mọi chữ ở lớp mặc định):**
- Câu hoàn chỉnh, ≤ 25 từ/câu, chủ ngữ rõ ràng. Cấm câu cụt kiểu "A → B", "blob thuần-vành → loại".
- Không dùng: `N\d+`, `T[123]`, `tc:`, `svb:`, `file:dòng`, `∧ ¬ ⇒`, `[code]`, `[suy luận]`, tên hàm/biến trong code. (Chỉ ở ô ④ / Deep.)
- Thuật ngữ kỹ thuật: lần đầu viết kèm nghĩa trong ngoặc hoặc bọc tooltip từ Thuật ngữ.
- Ưu tiên ví dụ có số cụ thể đời thường ("xe A rộng 120px, cách mép 20px…") thay vì mô tả trừu tượng.
- Số liệu/ngưỡng chỉ hiện ở lớp mặc định khi giúp hiểu (vd "vành đệm 48 điểm ảnh"); phần còn lại vào Deep.
- Giữ độ chính xác: không bỏ thông tin đã xác minh — chỉ **chuyển tầng** (mặc định ↔ Deep ↔ Mã nguồn). Số liệu giữ nguyên gốc của nội dung đã duyệt, không lấy từ bài nhận xét của người dùng nếu chưa đối chiếu code.

## 3. Schema nội dung v3 (`js/content/<id>.js`)
Thêm field mới, giữ field cũ để chạy song song trong lúc migrate; khi cả 23 trang xong thì bỏ field cũ.
```js
TG.registerContent({
  id, title,
  level: "core" | "support" | "reference",   // thay tier hiển thị
  stage: "N3",                                // vẫn dùng nội bộ; UI map sang tên tiếng Việt
  summary: "…1 câu…",
  story: "…2–3 câu…",
  position: { before: "<id|stage>", after: "<id|stage>", ifMissing: "…" },
  flow:   [ { title, text, step } ],          // 3–5; step = chỉ số bước animation
  rules:  [ { cond, then, because } ],        // 2–5, văn xuôi
  impact: [ { situation, without, with } ],   // 2–4; ≥1 phần "giới hạn/khi gãy"
  source: { certainty, files:[…], refs:[…] }, // thay where/certainty
  realParams, limits, qa,                     // giữ nguyên → Deep / Hỏi đáp
  steps: [ "câu tiếng Việt cho từng bước animation (khớp player)" ],
  glossRefs: ["ROI","LAPJV"],                 // tooltip
  pseudo: [ {t, note} ]                       // chuyển ra tab "Xem mã giả"
});
```
Mapping migrate: `problem→story` (viết lại), `does+role→flow+position`, `why→ gộp vào flow/impact`, `where+sourceRefs+certainty→source`, `steps (cũ) → flow`, `limits→impact(phần giới hạn)+Deep`, mã giả trong page → `pseudo`.

## 4. Bản MẪU giọng văn — trang ROI (để người dùng duyệt TRƯỚC khi làm hàng loạt)
> Số liệu bên dưới lấy từ nội dung hiện tại; builder-a phải đối chiếu lại code khi viết bản thật.

**Tóm tắt:** ROI là khung "chỉ nhìn ở đây": nhờ nó hệ thống bỏ qua cỏ lay, người đi bộ, vũng nước ngoài bãi và chỉ theo dõi xe thật.

**Bài toán:** Camera nhìn cả vỉa hè lẫn bãi xe. Cỏ lay, người đi bộ hay vũng nước phản chiếu đều làm hình ảnh "động" giống như xe chạy. Nếu không khoanh vùng, hệ thống sẽ tưởng đó là xe và tạo ra những "xe ma".

**Dải vị trí:** `Lấy ảnh 2 camera → [ROI + vùng ưu tiên] → Phát hiện chuyển động`. *Nếu thiếu: nhiễu ngoài bãi trở thành xe giả, mã xe nhảy lung tung.*

**① Luồng thuật toán**
1. **Khoanh vùng.** Người cài đặt vẽ sẵn đường viền ROI trong file cấu hình. Hệ thống tô kín bên trong đường viền thành "mặt nạ": trong viền thì nhìn, ngoài viền thì bỏ qua.
2. **Lọc chuyển động.** Ở mỗi khung hình, chỗ nào có chuyển động đều được đối chiếu với mặt nạ. Chuyển động nằm ngoài viền bị xóa ngay nên không thể trở thành xe.
3. **Thêm vành đệm 48 điểm ảnh.** Xe chạy sát mép sẽ bị cắt mất một nửa nếu chỉ nhìn đúng trong viền. Vì vậy hệ thống cho phép đo trọn hình xe trong vành đệm bên ngoài viền; nhưng vành đệm chỉ để đo cho đủ, không tự tạo ra xe mới.
4. **Vùng ưu tiên.** Khi một xe vừa rời ô đỗ, hệ thống nới lỏng điều kiện quanh ô đó để bắt xe nhanh hơn, vì xe vừa nổ máy thường bị che khuất trong chốc lát.

**② Quy tắc quyết định**
- Một vật được coi là *ở trong vùng quan sát* nếu điểm đáy của nó nằm trong viền, **hoặc** ít nhất 10% hộp bao của nó chồng lên viền.
- Một vật chỉ nằm trong vành đệm mà không chạm viền chính thì bị bỏ, vì nó nằm ngoài bãi.
- Ở vùng ưu tiên, điều kiện để tin một vật là xe nhẹ hơn bình thường (ít chuyển động hơn, nhỏ hơn, cần ít lần thấy hơn) nhưng vẫn phải thấy nó nhiều lần trong vùng đó.
- Vùng ưu tiên chỉ *đánh thức* bộ phát hiện cho nhạy hơn; việc xác nhận đó có đúng là xe cũ vừa rời ô hay không do một phép đo khoảng cách riêng quyết định. (Công thức ở mục Deep.)

**③ Vấn đề thực tế**
| Tình huống | Nếu không có | Nhờ ROI |
|---|---|---|
| Xe chạy sát mép viền | Xe bị cắt đôi, sai kích thước và vị trí | Vành đệm giữ nguyên hình xe |
| Cỏ lay, người đi bộ, vũng nước ngoài bãi | Sinh ra xe ma, tốn công ghép nhầm | Bị xóa từ đầu, tracker không phải xử lý |
| Xe rời ô, bị che trong chốc lát | Mất dấu, bị cấp mã xe mới | Vùng ưu tiên bắt lại trước khi mã cũ hết hạn |
| **Giới hạn:** thiếu file ROI | — | Hệ thống tự gộp các ô đỗ làm ROI, có thể cắt mất lối đi giữa các ô |

**④ Mã nguồn & config** *(gấp sẵn)* `motion_tracker.py` (`_priority_mask`, `_box_is_priority`), `two_camera.py` (tham số vành đệm 48px)… + `file:dòng` + độ chắc chắn.

## 5. Phân công & phase (lead chỉ quản lý — như MEGAPLAN)
Chủ trang giữ nguyên theo manifest: **A** = roi, motion, kalman, coasting, assignment, brightness, shadow, echo, track-lifecycle, occlusion, routing · **B** = reid, handoff, homography, trajectory, dormant, gid-conflict, gate, session, snapshot · **C** = ensemble, binder, polygon + core/UI + Map + Hành trình + Thuật ngữ.

| Phase | Việc | Người làm | Cổng duyệt |
|---|---|---|---|
| **R0** | Lead đọc plan này; ghi `style-guide-v3.md` (quy tắc viết §2 + bảng tên tiếng Việt cho 16 chặng + 3 nhãn tầng + mẫu §4) | lead | — |
| **R1** | Core v3: `ui.pageScaffold` mới (tóm tắt, dải vị trí, caption lớn, tab Các bước/Mã giả, 4 ô mới, ô ④ gấp sẵn), render song song schema cũ/mới, tooltip thuật ngữ, nhãn tầng/chặng tiếng Việt, CSS | builder-c | chạy lại smoke |
| **R2** | **Trang mẫu ROI** viết lại theo §4 (nội dung + HUD + nhãn canvas + caption + bước) | builder-a (+C đã xong R1) | **NGƯỜI DÙNG duyệt giọng văn/bố cục** — chưa duyệt thì chưa làm tiếp |
| **R3** | Viết lại 7 trang Cốt lõi còn lại: motion, kalman, coasting, assignment (A); reid, handoff (B); ensemble+binder (C) | A / B / C | lead review từng trang bằng checklist + đọc chéo (R5) |
| **R4** | 15 trang còn lại (Bổ trợ + Tham khảo) | A / B / C | như trên |
| **R5** | Map: tên chặng tiếng Việt, ẩn `N#` ở mặc định, mô tả node 1–2 câu; Hành trình: caption mỗi chặng viết lại thành câu hoàn chỉnh; Thuật ngữ: viết lại định nghĩa dễ hiểu + dùng làm nguồn tooltip | C (Map/Hành trình/Thuật ngữ), A+B hỗ trợ nội dung | lead + người dùng xem |
| **R6** | QA: lint dễ đọc, smoke Playwright, đọc chéo, screenshot | C + lead | người dùng nghiệm thu |

## 6. Kiểm thử & nghiệm thu
**Tự động — `qa/lint-readability.mjs` (C viết, chạy trên content lớp mặc định):**
- Cấm xuất hiện: `\bN\d{1,2}\b`, `\bT[123]\b`, `\b(tc|svb|gsc|mt):\d+`, `\.py:\d+`, `∧|¬|⇒`, `\[code\]|\[suy luận\]`, tên hàm dạng `_snake_case(`.
- Mỗi câu ≤ 30 từ (cảnh báo > 25); không câu bắt đầu bằng mũi tên.
- Bắt buộc có: `summary`, `story`, `position`, `flow` 3–5, `rules` 2–5, `impact` 2–4 (≥1 mục giới hạn), `steps` đúng số bước animation, `source`.
- Mọi từ trong `glossRefs` tồn tại trong Thuật ngữ; từ viết tắt chưa có nghĩa bị cảnh báo.
- `file:dòng` ở ô ④/Deep vẫn hợp lệ (script cũ).
- Smoke Playwright cũ vẫn pass: 0 lỗi console, 23 route render, animation thay đổi pixel, deterministic.

**Đọc chéo "người lạ" (R6):** mỗi trang do builder KHÔNG phải chủ trang đọc chỉ lớp mặc định, trả lời bằng lời của mình: *thuật toán làm gì, đứng ở đâu, nếu thiếu thì sao*, và đánh dấu chỗ khó hiểu. Chỗ nào paraphrase sai/lúng túng → chủ trang sửa.

**Thủ công (người dùng):**
- [ ] Mở 3 trang bất kỳ, đọc mỗi trang 1 lần, tự giải thích lại được thuật toán
- [ ] Không thấy `N5`, `T1`, `tc:2401`, `LAPJV` (không giải nghĩa) ở lớp mặc định
- [ ] Canvas + caption + danh sách bước đủ để hiểu mà không cần mở mã giả
- [ ] Map/Hành trình nhìn tên chặng tiếng Việt hiểu thứ tự chạy của hệ thống

**Xong khi:** 23 trang + Map + Hành trình + Thuật ngữ đã sang v3, lint 0 lỗi, smoke pass, người dùng duyệt.

## 7. Rủi ro
| Rủi ro | Xử lý |
|---|---|
| Viết "dễ hiểu" làm sai/mất độ chính xác | Chỉ chuyển tầng chứ không bỏ thông tin; số liệu giữ từ nội dung đã verify; đọc chéo + giữ `source`/Deep nguyên vẹn |
| Builder lại viết cô đặc | Lint + style-guide + mẫu ROI được duyệt làm chuẩn; lead trả lại từng trang không đạt |
| Đổi schema làm vỡ 23 trang | Core render song song cũ/mới; migrate dần từng trang; smoke chạy mỗi lượt |
| Context builder đã đầy (đã làm nhiều vòng) | Mỗi builder ghi checkpoint trước R1; nếu >70% context thì restart builder mới đọc `PLAN-readability-v3.md` + `style-guide-v3.md` + checkpoint |
| Tên chặng tiếng Việt lệch với thứ tự thực thi (N1 nằm trong N5, N2 song song, N14/N15 async) | Style-guide ghi rõ: chặng chính tuần tự + 3 nhánh "chạy song song"; Map vẽ rõ; lead cho C xác nhận với `pipeline-order.md` |
