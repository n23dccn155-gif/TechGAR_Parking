# SPEC — Thiết kế lại algo-web-v2 (giọng báo cáo NCKH, sâu và trực quan)

Ngày: 2026-10-06 · Trạng thái: **chờ user duyệt** (đã brainstorm 5 phần với user, mọi quyết định bên dưới đã được user gật).

## 0. Bối cảnh & mục tiêu

Web học hiện tại (`D:\TechGar2\algo-web-v2`) có kiến trúc kỹ thuật tốt nhưng lời viết khó hiểu: câu cụt, ký hiệu nội bộ dày, "nửa nạc nửa mỡ", không giải thích theo từng cơ chế, tham số liệt kê mà không nói vai trò/lý do/hệ quả; hình toàn canvas trừu tượng, không có frame camera thật.

Mục tiêu: web giúp **chính user tự ôn và hiểu sâu** từng thuật toán của TechGAR — mỗi cơ chế: làm gì, vì sao cần, hoạt động ra sao, số thật là bao nhiêu và tính thế nào, hỏng khi nào, nằm ở đâu trong code. Giọng văn và cách tổ chức học theo `docs/Bao_cao_NCKH_TechGAR_hoan_chinh.docx` (câu đầy đủ, cơ chế → công thức → giải thích → giới hạn) nhưng ngắn hơn, tập trung thuật toán, trực quan hơn.

Độ sâu tham chiếu: ví dụ Homography của Gemini — 8 cặp điểm thay vì 4 (+ lý do), fit-gate 2.0 cm / 8.5 px / 12 px, `shared_map_anchor` `bottom_center` → `bbox_center` (+ lý do phối cảnh), ngưỡng suy ra từ `median_slot_length = 9.267515 cm` × {1.75, 2.75, 1.75, 0.50} và `min(config, derived)`, EMA vận tốc `0.65·old + 0.35·inst`, kèm thay số.

Đối tượng đọc: **bản thân user** (không cần onboarding người mới; ưu tiên đúng và sâu).

Phân loại brainstorming: **architectural** (thay khung nội dung toàn site).

## 1. Quyết định đã chốt

| # | Quyết định |
|---|---|
| D1 | **Ghi đè thẳng `D:\TechGar2\algo-web-v2`**, không tạo bản song song; bỏ toàn bộ khung nội dung cũ (`js/content/*`, `js/pages/*` cũ). |
| D2 | Xương sống = **Phương án A "Giải phẫu cơ chế"**: mỗi trang một cơ chế, khung 7 mục cố định. Mượn từ B: mục ⑥ lỗi thật + 1 trang gallery lỗi; mượn từ C: trang hiệu chuẩn + trang đọc dữ liệu. |
| D3 | Ít canvas trừu tượng, **nhiều frame camera thật** có chú thích. |
| D4 | **Thuật ngữ giữ tiếng Anh mặc định** (Homography, LAPJV, Kalman filter, bounding box, track, re-identification, MOG2…); lần đầu trong trang kèm tiếng Việt trong ngoặc, các lần sau hover hiện tooltip tiếng Việt. Câu văn vẫn là tiếng Việt đầy đủ. |
| D5 | Giữ kiến trúc kỹ thuật: static HTML/CSS/JS, hash router, không build tool bắt buộc, chạy `file://`, không CDN. |
| D6 | QA bằng **Playwright**; quy trình brainstorming → spec → plan (superpowers). |

## 2. Khung nội dung mỗi trang (bắt buộc đúng 7 mục)

| # | Mục | Quy tắc viết |
|---|---|---|
| ① | **Chức năng & vị trí** | 1–2 câu đầy đủ + dải "bước trước → trang này → bước sau" (click được). |
| ② | **Vì sao cần** | 1 đoạn: thiếu cơ chế này hệ thống hỏng ở đâu, kèm ví dụ thật. |
| ③ | **Cách hoạt động** | Các khối đánh số `3.1, 3.2…`. Mỗi khối = tên cơ chế + giải thích bằng câu đầy đủ + số liệu thật + lý do thiết kế + (nếu có) điều gì xảy ra khi vượt ngưỡng và bước nào bị ảnh hưởng tiếp theo. |
| ④ | **Số liệu & công thức** | Công thức render rõ + **thay số thật** (vd `9.2675 × 1.75 ≈ 16.22 cm`); bảng tham số: tên · giá trị · loại (runtime / cấu hình / suy ra / minh họa) · `file:dòng`. |
| ⑤ | **Hình thật** | 1–3 ảnh frame camera thật có chú thích, caption nêu `session/frame/cam`. Canvas tương tác chỉ khi tương tác thật sự dạy được ý. |
| ⑥ | **Giới hạn & lỗi thật** | Giới hạn của cơ chế + lỗi thật từ audit `verify_cur_*` (nêu session/frame, phân biệt CONFIRMED / UNSURE; không nói quá). |
| ⑦ | **Nguồn** | `file:dòng`, gấp sẵn; mã giả (nếu có) nằm ở đây. Ký hiệu nội bộ (N#, T#, ccm:, tc:) chỉ được xuất hiện ở mục này. |

### Quy tắc văn

- Câu đầy đủ chủ–vị; cấm câu cụt kiểu "blob thuần-vành → loại". Mỗi đoạn trả lời được "cái gì – vì sao – số bao nhiêu – hệ quả".
- Câu ≤ ~30 từ ở lớp mặc định (lint kiểm, cảnh báo thay vì chặn cứng khi công thức/bảng).
- Thuật ngữ tiếng Anh theo D4; không dùng viết tắt chưa định nghĩa.
- Mọi con số: có nguồn `file:dòng` hoặc nhãn `(minh họa)`. Nếu lý do thiết kế là suy luận từ code (không có comment tác giả) phải ghi "suy luận".
- Không copy mô tả từ docx khi chưa đối chiếu code (báo cáo và code có thể lệch; code là chuẩn).

## 3. Cấu trúc site (23 trang cơ chế + trang chủ + tài nguyên)

```
TRANG CHỦ
  0.  Tổng quan — câu chuyện hệ thống + sơ đồ chặng click được
  0b. Hành trình 1 xe — giữ ý tưởng từ v2, viết lại lời theo khung mới

NHÓM 1 · KHỞI TẠO & HIỆU CHUẨN
  1. ROI mask (mask_roi.py)
  2. Ô đỗ & gate zones (ParkingSpacePicker, draw_gate_zones)
  3. Homography & shared map            ← trang mẫu R0

NHÓM 2 · PHÁT HIỆN & THEO VẾT MỘT CAM
  4. Brightness / exposure normalisation
  5. Motion detection (MOG2 + morphology)
  6. ROI gate & contour filtering
  7. Kalman filter & LAPJV assignment
  8. Track lifecycle (tentative / matched / coasting / lost)
  9. Occlusion guard & watershed

NHÓM 3 · HAI CAM & GID
 10. Tracklet descriptor (appearance)
 11. Trajectory memory & reid scoring
 12. Handoff & dormant re-identification (+ lỗi stationary re-acquire E-C-002)
 13. GID conflict resolution

NHÓM 4 · Ô ĐỖ & BINDING
 14. Parking detector (trạng thái ô, temporal smoothing)
 15. Slot–vehicle binder (claim, departure)

NHÓM 5 · CỔNG, PHIÊN & FRONTEND
 16. Snapshot API :8001 & hợp đồng dữ liệu
 17. Gate/session controller :8000 & luồng QR
 18. Frontend data flow (runtimeAdapter → stores → ParkingMap)
 19. Routing A* & off-route detection
 20. Voice guidance (Vietnamese)

NHÓM 6 · DỮ LIỆU & KIỂM CHỨNG
 21. Đọc predictions.jsonl (schema, event_type)
 22. Replay session & giới hạn ground truth
 23. Gallery lỗi thật (duplicate track, phantom coasting burst, gid mới khi xe đỗ yên…)

TÀI NGUYÊN
  Glossary (term tiếng Anh) + "Số liệu tra nhanh" (bảng threshold + nguồn + loại)
  Search (client-side)
```

Danh sách trang cuối cùng được lead/builder đối chiếu với code khi viết; nếu một cơ chế thực tế không tồn tại hoặc cần gộp/tách thì báo user trước khi đổi.

Tên file/slug do plan chốt; nội dung các trang 0–23 phải khớp bảng trên.

## 4. Hình ảnh thật & tương tác

- Nguồn: `backend/main_detect/experiment_test/output/verify_cur_*/` và video `raw_cam*.mp4`/`debug_cam*` (chỉ đọc). Trích frame bằng OpenCV (venv `backend/main_detect/.venv`), annotation (mũi tên, vòng tròn, nhãn ngắn) bằng PIL bằng script **lưu trong repo để tái lập** (`algo-web-v2/tools/`), xuất JPEG ≤ ~200 KB vào `algo-web-v2/assets/real/`, lazy-load.
- Mỗi ảnh: caption nêu cơ chế + `session/frame/cam`.
- Mỗi trang 1–3 ảnh thật nếu có frame phù hợp; nếu không có thì dùng sơ đồ tĩnh/bảng và ghi lý do trong plan (không bịa ảnh).
- Ưu tiên ảnh: hiệu chuẩn (8 điểm + bản đồ chiếu), handoff 2 cam cùng xe, occlusion trước/sau watershed, lỗi sang8 f595 (gid3), duplicate track, phantom burst.
- **Tương tác giữ lại (tối đa 4):** (1) ROI kéo đỉnh, (2) Homography chọn cặp điểm + reprojection error, (3) Occlusion slider IoU/ngưỡng, (4) Assignment ma trận chi phí nhỏ (nếu thời gian cho phép). Các canvas "KHÔNG có / CÓ" chung chung bị bỏ.
- Mọi hành vi tương tác deterministic (không `Math.random` không seed).

## 5. Glossary, tra nhanh, search, mobile

- **Glossary:** index theo thuật ngữ tiếng Anh; mỗi mục = định nghĩa tiếng Việt đời thường → vai trò trong TechGAR → ví dụ thật → link trang cơ chế. Mọi term dùng trong trang phải resolve được vào glossary (QA kiểm).
- **Số liệu tra nhanh:** một bảng duy nhất gom threshold/hệ số quan trọng (vd `match_threshold 0.78`, fit-gate `2.0 cm`, EMA `0.65/0.35`, off-route `75 px`, morphology kernels…) với cột: giá trị · loại (runtime/cấu hình/suy ra) · `file:dòng` · trang liên quan.
- **Search:** client-side, index sinh lúc build (hoặc dựng lúc tải) từ tiêu đề trang + term + tham số.
- **Mobile:** 1 cột dưới 720 px, ảnh vuốt ngang, vùng chạm ≥ 44 px, công thức/bảng không tràn ngang trang (cuộn trong khung). Kiểm 390×844.

## 6. Công nghệ

- HTML/CSS/JS thuần; hash router; `TG.registerContent/registerPage` hoặc tương đương nếu plan thấy cần đơn giản hóa; không ES module, không CDN, chạy `file://`.
- Công thức bằng HTML/CSS (sub/sup, phân số CSS), không KaTeX.
- Xóa `js/content/*` cũ và các engine không còn dùng (`core/player.js`, mã canvas đôi…) — chỉ giữ code mà 4 tương tác còn dùng. **`algo-web-v2/` hiện chưa được git theo dõi**, nên trước khi xóa phải sao lưu nguyên thư mục cũ sang `D:\TechGar2\.analysis\algo-web-v2-redesign\backup-old-v2\` (ngoài `algo-web-v2/`) và ghi hash; không xóa gì trước khi backup xác minh xong.

## 6b. Giao diện (UI/UX) — yêu cầu của user

- Phong cách **hiện đại, sạch, dễ nhìn**: nền **trắng / xám lạnh rất nhạt**, **không dùng nền kem/be/vàng ấm**.
- **Không bo tròn**: mọi `border-radius` = 0 (card, nút, ảnh, input, tooltip, tag). Phân tách bằng đường kẻ 1px và khoảng trắng, không dùng box nổi bo góc.
- **Không chữ nghiêng**: không `font-style: italic/oblique`; thẻ `em`, `i`, `cite`, `address` bị ép `font-style: normal` (nhấn mạnh bằng đậm hoặc màu).
- **Font tiếng Việt chuẩn**: dùng font đóng gói local (không CDN) có subset Vietnamese đầy đủ — Inter cho văn bản, JetBrains Mono cho code/số liệu; fallback `Segoe UI`, `Arial`. QA kiểm các ký tự `ă â ê ô ơ ư đ` và dấu xếp chồng (`ặ ữ ự ề ẫ ỗ`) hiển thị đúng, không rơi sang font lạ/ô vuông.
- Một màu nhấn duy nhất (xanh dương đậm) + màu ngữ nghĩa tối thiểu: đỏ = lỗi/giới hạn, xanh lá = đúng/ổn; tương phản chữ/nền ≥ 4.5:1; cỡ chữ thân ≥ 16px desktop, ≥ 15px mobile; độ rộng dòng đọc ≤ ~75 ký tự.
- Bố cục: thanh điều hướng trái cố định (nhóm → trang) trên desktop, menu trượt trên mobile; nội dung một cột rộng ≤ 920px; 7 mục có tiêu đề đánh số rõ và mục lục nổi bên phải (desktop).
- QA CSS tĩnh: không có `border-radius` khác 0, không có `italic|oblique`, không có màu nền thuộc dải kem (R>G>B với độ bão hòa ấm, xem lint trong plan).

Đóng gói: giữ script gộp 1 file (`dist/`) nếu khả thi; nếu bỏ thì ghi rõ trong báo cáo cuối.

## 7. QA (Playwright + kiểm tĩnh)

- Mỗi trang chụp 1440×900 và 390×844; không console error; không request mạng ra ngoài; ảnh thật load được (`naturalWidth > 0`).
- Mỗi trang có đủ 7 mục theo đúng thứ tự.
- Lint văn: câu quá dài, ký hiệu nội bộ ngoài mục ⑦, câu cụt (heuristic), thuật ngữ chưa vào glossary.
- Mỗi `file:dòng` resolve được trong repo (file tồn tại, dòng nằm trong phạm vi).
- Mỗi con số trong bảng ④ có `file:dòng` hoặc nhãn `(minh họa)`.
- Điều hướng, link chéo, search, các tương tác (kéo ROI, chọn điểm, slider) có test hành vi.
- Deterministic: chạy 2 lần cho kết quả giống nhau.
- QA cũ (46/46 smoke của v2 cũ) **không** được tính cho site mới.

## 8. Ràng buộc

- Chỉ sửa trong `D:\TechGar2\algo-web-v2\` (và thư mục `.analysis\algo-web-v2-redesign\` cho tài liệu). Không sửa `backend/`, `frontend/`, `docs/`; `experiment_test/output/` chỉ đọc.
- 5 file tracked đang modified từ trước (cross_camera_manager.py…) không được đụng.
- Không trình bày kết quả replay như độ chính xác ground-truth; GT chủ yếu rỗng → mọi kết luận identity phải ghi rõ CONFIRMED/UNSURE và phạm vi (xem `.analysis/verify-replay/ERRORS-SUMMARY.md`).
- Không nêu bug chưa chứng minh như sự thật; lỗi stationary re-acquire: chỉ ghi CONFIRMED cho case sang8 (E-C-002) và nêu rõ phần còn lại là ứng viên.

## 9. Team & quy trình

- **Lead Devin (w1:p6):** quản lý, review chéo, viết **trang mẫu R0 (Homography)**; không viết hàng loạt.
- **builder-a:** nhóm 1+2 (trang 1–9).
- **builder-b:** nhóm 3+4 (trang 10–15).
- **builder-c:** nhóm 5+6 (trang 16–23), pipeline trích/annotate ảnh thật, QA tổng.
- Khung site (router, layout 7 mục, component `<Term>`, glossary engine, search) do lead giao một builder làm **trước** R0, nhưng chỉ ở mức đủ chạy trang mẫu.

### Cổng dừng bắt buộc

1. User duyệt SPEC này → mới viết plan (writing-plans) → user duyệt plan và chọn cách thực thi.
2. R0: trang mẫu Homography + mẻ ảnh thật thử → **user duyệt giọng văn & khung** → mới làm hàng loạt.
3. QA cuối + báo cáo (file thay đổi, lệnh QA, kết quả thật, giới hạn còn lại) → user nghiệm thu.

## 10. Phạm vi KHÔNG làm

- Không sửa thuật toán/runtime TechGAR; không mô phỏng chạy OpenCV/LAPJV trong trình duyệt.
- Không biến site thành báo cáo khoa học đầy đủ; không thêm CDN/framework/build tool nặng.
- Không viết nội dung cho cơ chế chưa kiểm được trong code.
