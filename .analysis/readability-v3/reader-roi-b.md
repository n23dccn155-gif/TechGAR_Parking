# reader-roi-b.md — B fresh-reader DRAFT review, ROI v3 — 2026-10-04

**BẢN NHÁP — chưa phải PASS/final gate.** A đang chỉnh wording, C đang fix header/badge.
Snapshot đọc: `content/roi.js` mtime 23:50 md5 `dbeab8f4dd42` · `pages/roi.js` 23:51 `eebdfcc68d0e`
· `core/ui.js` 23:53. **Nếu hash đổi sau freeze → retest các mục flag.**

Giao-thức: file:// `#/algo/roi`, 1440×900 + 1280×720, steps 0–4, **chỉ lớp mặc-định** — không mở
tab Mã giả, ô ④ (chỉ nhìn header gấp-sẵn), Deep, Hỏi-đáp, tooltip, glossary. Script:
`.analysis/readability-v3/_roi_reader_b.mjs`; ảnh + text dump: `.analysis/readability-v3/shots-b/`.

## 1. Paraphrase (chỉ từ chữ + hình nhìn-thấy)

**(a) Nó làm gì:** "Hệ thống vẽ một đường viền quanh bãi xe và chỉ nhìn bên trong viền; chuyển
động ngoài viền (cỏ, người, vũng nước) bị xóa trước khi trở thành vệt; vành đệm quanh viền chỉ
để đo trọn xe bị cắt; vùng quanh ô vừa-trống giãn ra để bắt lại xe vừa rời ô."
— chứng: summary "ROI (vùng quan sát) là đường viền vẽ quanh bãi xe…" (đầu trang); 5 steps panel
phải; canvas hai-panel "KHÔNG có/CÓ vùng quan sát" với nhiễu bị gạch ✗ (step2-3).

**(b) Nằm đâu:** breadcrumb "Map › Chặng 4/12 · Phát hiện chuyển động › Vùng quan sát và ưu tiên";
dải vị-trí "Chuẩn bị chống che khuất → **Khoanh vùng quan sát & vùng ưu tiên** (nằm trong chặng
phát hiện chuyển động) → Ghép vệt với xe theo dõi" + "Xem thêm: Phát hiện chuyển động — chặng
chứa trang này". → **ROI không có stage riêng** — đúng guide (nằm trong chặng 4, sau chặng 3,
trước chặng 5).

**(c) Thiếu nó thì sao:** dải vị-trí "Nếu thiếu bước này: Nhiễu ngoài bãi trở thành xe giả và mã
xe nhảy lung tung"; ô ③ hàng "Thiếu file cấu hình vùng quan sát **GIỚI HẠN** — hệ thống tự gộp
các ô đỗ thành vùng, nhưng lối đi giữa các ô có thể bị cắt". → hiểu được cả vai-trò lẫn fallback.

## 2. Đánh giá checklist default-layer (theo shots, không theo nguồn)

| Mục | Trạng-thái |
|---|---|
| Tóm-tắt in-đậm 1 câu ~25 từ | PASS — dùng ":", không hyphen |
| Bài toán 3 câu, không jargon | PASS |
| Dải vị-trí đúng chặng + câu thiếu | PASS — đúng mapping §4 guide |
| Caption lớn 1 câu/bước, đồng-bộ | PASS — 5 caption riêng từng step |
| Tab "Các bước" mặc-định, Mã-giả riêng | PASS — 2 tab, bước sáng đồng-bộ |
| KHÔNG CÓ/CÓ X thay TẮT/BẬT | PASS — hai panel gán đúng nhãn |
| 4 ô ①②③④ + GIỚI-HẠN | PASS — ④ gấp-sẵn "File · hàm · config · độ chắc chắn" |
| Không N#/T#/file:dòng/ký-hiệu-logic ở mặc-định | PASS (không thấy trong dump+shots) |
| Nhãn canvas ≤6 từ, đọc-được | PASS — "vũng nước/người đi bộ/cây lay/ô đỗ B3/xe A/vệt trong vành" |
| HUD chữ thường-ngày | GẦN-PASS — xem F1 |
| 3 cơ-chế tách (lọc-viền / vành-đệm / ưu-tiên) | PASS — caption step2 tách vành-đệm; step3-4 tách ưu-tiên |

## 3. Findings (DRAFT — wording, không chặn-gate)

- **F1 — 'vệt' chưa tự-giải-thích ở mặc-định.** HUD "VỆT BÊN TRÁI/PHẢI" hiện từ step0 (giá-trị "…"),
  canvas label "vệt trong vành", caption step1 "cả nhiễu cũng trở thành vệt". Có gạch-chân-chấm
  (tooltip) trên "vệt" ở panel/step2 — nhưng reader chưa-mở tooltip không biết vệt = "đối-tượng
  chuyển-động được theo dõi". Gợi-ý: lần-đầu ở step2/story ghi "vệt (đối-tượng chuyển-động)".
- **F2 — 'điểm đáy' khó ở ô ②** (visible trong box, vẫn lớp mặc-định): "…và **điểm đáy** ở trong
  vành…", "Khi **điểm đáy** hoặc một phần mười hộp…". Thuật-ngữ anchor chưa giải-nghĩa — nên kèm
  "(điểm chạm-đất giữa xe)". 'một phần mười hộp' đọc lúng — "10% hộp" tự-nhiên hơn.
- **F3 — 'Xe mới nổ máy' mơ-hồ** (①bước4): đọc được thành "xe mới-đến" thay "xe vừa-nổ-máy".
  Caption step3 ("Một xe vừa rời ô đỗ…") rõ hơn.
- **F4 — trùng-nội-dung nhẹ**: panel Các-bước (5 mục) và ① Luồng (5 mục) gần-như cùng câu —
  theo thiết-kế (sync-list vs giải-thích) nhưng reader thấy 2 bảng gần-giống; có-thể khác biệt
  nhấn-mạnh (bước=hành-động, ①=tại-sao).
- **F5 — nhãn canvas chồng**: top cạnh polygon, "vùng quan sát" chạm đường-viền gần "vành đệm"
  (đặc-biệt 1280) — nhãn vùng-ưu-tiên/vành-đệm/vùng-quan-sát có thể nhìn gộp lúc step3.
  Không misleading, chỉ hơi-dày.
- **F6 — "thử kéo đỉnh đỏ"**: caption step0 mời kéo đỉnh — tính-năng hay; nếu kéo đổi kết-quả
  lọc thật thì nên nói ở caption rằng lọc cập-nhật theo viền mới (không-verify được tương-tác
  ở lớp chữ).
- **F7 — 1280×720**: HUD nằm dưới fold (cuộn mới thấy giá-trị số) — chấp-nhận được; boxes đầy-đủ
  khi cuộn (ảnh bottom).
- **Canvas không misleading**: nhiễu ngoài viền có ✗, "vệt trong vành ✗" (step2-3) dạy đúng
  "vành không tạo vật"; hai panel cùng-cảnh; xe A vào vùng-ưu-tiên step3 khớp caption.

## 4. Người-mới hiểu-được gì sau 1 lượt đọc

Đủ để trả-lời: "khoanh vùng → xóa nhiễu → vành chỉ để đo → ưu-tiên bắt xe rời ô", vị-trí trong
chặng 4, hậu-quả khi thiếu, và giới-hạn fallback. Chưa-tự-tin ở: phân-biệt điều-kiện nhận-vật
của vành-đệm vs ưu-tiên (② quy-tắc 2 và 4 đều dùng "điểm đáy" — reader khó tách 2 phép-kiểm).

## 5. Trạng-thái

DRAFT review xong — 7 findings wording/nhỏ, không blocker layout (header/breadcrumb C đang fix,
không thấy N1/N5 trong bản này). Không mở source/Deep/pcode → không so default-vs-source (đúng
giao-thức). Chờ LEAD báo content-freeze → retest nếu hash đổi; final gate là quyền người-dùng.

---

## 6. FINAL reader pass — bản freeze (2026-10-04 ~00:2x)

Hash khớp LEAD báo: `content/roi.js` md5 `81d237a6ec681f150793b7cf0128ca69` @00:10 ·
`pages/roi.js` `8f4a869db4b2d85cea61fb004fcb5a78` @00:13. Cùng giao-thức: default-layer trước
(steps 0–4, 2 viewport), SAU ĐÓ mở tooltip/pcode/④/Deep để kiểm trợ-giúp. Probe:
`shots-b/final/` (10 shots + tooltip/pcode/deep + text dumps).

### Canvas chứng-minh bằng hình (mục LEAD gạch)

- **Step 2 edge-case THẬT** (`roi-1440-step2.png`, `roi-1280-step2.png`): xe C "sát mép" ở góc
  dưới-phải — hộp bao **lấn qua đường-viền xanh** vào vành đệm. Hai nhãn trong-canvas:
  "đo trọn nhờ vành" (xanh) đối-lập "không vành: đo thiếu (khung đứt)" (đỏ, khung nét-đứt).
  Caption khớp: "Xe chạm viền vẫn được đo trọn nhờ vành đệm 48 điểm ảnh — vật nằm trọn trong
  vành vẫn bị loại." → **không còn chỉ suy-ra từ chữ**.
- **Vật thuần-vành bị loại trên canvas**: "vật trong vành ✗" nét-đứt tím + X — cả step2 lẫn
  step3/4 ở cả 2 viewport.
- **3 cơ-chế tách hình**: viền xanh nét-đứt + vành-đệm (nhãn mép trái) + vùng ưu tiên cam
  quanh ô B3 (step3-4, "điều kiện nhẹ"). "chân hộp" chấm vàng trong xe A step4.
- KHÔNG CÓ ROI / CÓ ROI cùng-cảnh (xe C sát mép ở cả hai panel) — nhất-quán.

### F1–F7 + overpromise — kết-quả

| # | DRAFT finding | FINAL |
|---|---|---|
| F1 | 'vệt' không gloss | **FIXED** — HUD đổi "VẬT CHUYỂN ĐỘNG TRÁI/PHẢI"; step2 gloss inline "vệt (đối tượng chuyển động)" |
| F2 | 'điểm đáy' khó | **FIXED** — đổi 'chân hộp' (② rules 2+4, dotted-tooltip → glossary "anchor"); 'điểm đáy' chỉ còn ở Deep realParams — đúng tầng |
| F3 | 'xe mới nổ máy' mơ-hồ | **FIXED** — cụm không còn trong content (grep sạch) |
| F4 | steps ≈ ① trùng | **FIXED** — ① giờ văn-nguyên-nhân ("vẽ ranh giới nhất bộ lọc cần — chỉ phần nằm trong mới được nhìn…"), khác hẳn panel steps |
| F5 | nhãn canvas chồng | **GẦN-FIXED** — 1280 đọc được; còn chen nhẹ "xe C sát mép" vs "vật trong vành ✗" cạnh phải |
| F6 | 'thử kéo đỉnh đỏ' không nói gì đổi | **FIXED** — caption step0: "…thử kéo đỉnh đỏ để lọc đổi theo"; QA4 giải-thích nhiễu sống lại khi viền ôm vào |
| F7 | HUD dưới fold 1280 | Giữ nguyên — chấp-nhận (cuộn) |
| overpromise | — | **FIXED** — story hedge "có thể tưởng"; caption step1 "có thể trở thành vệt"; 'một phần mười hộp' → '10% hộp' |

### Phase-2 (sau paraphrase — tooltip/pcode/④/Deep)

- **④ Mã nguồn** mở được: `_roi_context_mask` mt:794 (dilate 2·pad+1), strict+rescue mt:866
  (:878-908), anchor test mt:979 — file:dòng đúng chỗ.
- **Deep** params runtime đầy-đủ (48px tc:1817, 650px², 100px, 0.05, 3 obs, 6.0px) + QA 4 câu
  văn-thường, hedge đúng ("miễn xe vẫn chạm vào viền chính").
- **Mã giả** 6 dòng đúng ngữ-nghĩa (rescue iff clipped∧support∧anchor∈ctx; "10% là test ưu tiên")
  — khớp phát-hiện nguồn A (10% thuộc vùng ưu tiên, không phải ROI chính).
- Tooltip popover: probe không bắt-được element (dotted-underline thấy trên 'chân hộp'/'vệt'/
  'vùng ưu tiên' trong shots; popover chưa-verify được bằng DOM dump — không-chặn vì gloss
  inline đã đủ).

### Residual nhỏ (không BLOCKER)

- Nhãn "đo trọn nhờ vành / không vành: đo thiếu" vẽ-dính cả step3-4 (vành chủ-đề step2) —
  có-thể chủ-đích giữ context; nếu lúng thì chỉ-hiện step2.
- Chen nhẹ cạnh phải 1280 (trên).

### Verdict B (reader FINAL)

**Không còn BLOCKER** từ phía B cho R2 — trang dạy-đúng và chứng-minh-bằng-hình ở mọi claim
chính. Gate cuối = root review + người-dùng duyệt; B không đánh "user approved".
