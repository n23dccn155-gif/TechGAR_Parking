# cross-reader-b.md — B cross-review 4 trang A (readability-v3 R3)

**Reviewer:** B (read-only) · **Nguồn review:** `batch-a.md` + shots `qa/shots/readability-r3-a/` (tự chụp lại bằng `_qa_v3_b.mjs` → `shots-b/<route>/`, file:// `#/algo/<route>`, 1440×900 + 1280×720, default layer trước, không mở Deep/source trước paraphrase).
**Probe:** motion 41/41 · kalman 47/47 · coasting 47/47 · assignment 47/47 — 0 console/page error toàn bộ.
**Không sửa file A.** Mọi claim "đúng source" bên dưới đã đối chiếu trực tiếp code hiện-tại (không qua dossier).

---

## 1. motion — `Phát hiện chuyển động` (Chặng 4/12)

**Người-mới học được:** trang dạy bộ lọc đầu tiên của pipeline — một điểm ảnh chỉ thành "vệt" khi **hai lớp cùng đồng ý**: lớp tách-nền (so với nền tự học) **và** lớp thời-gian (so với mốc trước). Nhiễu chỉ lóe ở một lớp thì chết. Sau đó vệt được làm sạch (bóc chấm + nối mảnh gãy) rồi qua chuỗi cổng kích-thước/hình-dáng.

**Vai trò pipeline:** chặng 4 — before "Chuẩn bị chống che khuất" (chặng 3), after "Ghép vệt với xe theo dõi" (chặng 5); note "chứa cả bước khoanh vùng quan sát" → rõ ROI nằm trong chặng này, không bị tưởng stage riêng.

**ifMissing dạy gì:** "Mọi nhiễu điểm ảnh đều có thể trở thành vệt, còn xe đậu lâu hay xe chậm có thể bị bỏ sót" — reader hiểu được hai mặt mất-mát: nhiễu→vệt giả VÀ xe tĩnh/chậm→miss. Đúng vai trò của lớp lọc.

### ⚑ Câu-hỏi LEAD: OR hai mốc vs AND hai lớp — **ĐÚNG, không lộn**

Verify trực tiếp code:
- `motion_tracker.py:553-560` — temporal mask = `bitwise_or` qua các mốc tham-chiếu → **OR trong lớp thời-gian** (khớp một mốc là đủ).
- `motion_tracker.py:792-793` — `mask = bitwise_and(background_mask, dilate(temporal))` → **AND giữa hai lớp**.

Copy khớp đúng hai chiều:
- summary "hai lớp phải cùng đồng ý" = AND-lớp ✓
- stepTexts[2] "so với hai mốc trước — **khớp một mốc là đủ** — rồi đòi cả hai lớp cùng đồng ý" = OR-mốc + AND-lớp ✓
- caption s2 "Khớp một trong hai mốc là qua lớp thời gian — nhưng phải thêm lớp nền đồng ý, nên nhiễu một-lớp chết" ✓

Canvas s2 hỗ-trợ: 3 chip "mốc xa / mốc gần / hiện tại" + chuỗi hộp "tách nền → hai mốc đồng ý → làm sạch" — reader thấy hai mốc song-song chứ không xếp chồng AND.

**BLOCKER:** không.
**MINOR:** summary "hai lớp phải cùng đồng ý" đứng một-mình có-thể bị đọc-nhầm là "hai mốc phải cùng khớp" (AND-mốc — sai). Step-text + caption + canvas gỡ đúng trong 1 lượt đọc → chỉ là MINOR về nhịp câu, không phải sai-nghĩa.
**Caption↔canvas:** khớp — chấm cam nhiễu nháy / khung xám "xe đậu lâu" / xe-chạy đỏ qua cổng; OFF-panel "nhiễu cứ sống" đúng counterfactual.

---

## 2. kalman — `Dự đoán vị trí xe` (Chặng 2/12)

**Người-mới học được:** mỗi vết có bộ lọc đoán trước vị trí — đoán, rồi trộn với điểm đo cho đường-đi mượt; khi xe bị che thì đi tiếp theo vận-tốc đã học và "vòng bất định" giãn ra báo mức kém-chắc.

**Vai trò pipeline:** chặng 2 — "chạy trước khi phát hiện ở mỗi khung" (note đúng thứ-tự runtime: `predict :2228` chạy **trước** `_detect :2233` — verified). after "Chuẩn bị chống che khuất" (chặng 3).

**ifMissing dạy gì:** "Cổng ghép đặt ở vị trí cũ nên xe nhanh dễ bị trượt khỏi vệt mới và mất dấu" — reader hiểu vai-trò predict là đặt cổng-tìm đúng chỗ, không phải "trang-trí đường-cong".

### ⚑ Câu-hỏi LEAD: "điểm đo quay lại → hiệu-chỉnh" có hứa quá? — **KHÔNG**

Canvas s5: phía ON vòng bất-định "co lại" khi điểm đo quay-lại; phía OFF vẫn bắt được đo (không vẽ chết-vết giả). Text "hiệu chỉnh mạnh… giữ nguyên vết cũ" đi-kèm rules "**trong vùng cho phép**" + limit "xe đổi-hướng đột-ngột lúc bị che → vòng giãn báo độ-tin giảm thay vì tin mù" — recovery được mô-tả đúng mức, có điều-kiện, không hứa snap-to-đúng-chỗ tuyệt-đối.

**BLOCKER:** không.
**MINOR:** `before.href: "#/"` trỏ về trang Map (chặng 1 không có algo-page riêng) — reader bấm "Nhận ảnh & đồng bộ 2 camera" có-thể ngỡ sẽ tới một trang thuật-toán. Cân-nhắc nhãn "(không có trang)" hoặc href Map rõ-hơn — cosmetic.
**Caption↔canvas:** khớp — chấm đỏ nhiễu, đường-xanh mượt, vòng bất-định, "mất đo" dấu-X cam đúng chỗ đo mất.

---

## 3. coasting — `Giữ vết khi mất đo` (Chặng 6/12)

**Người-mới học được:** vết mất đo không bị xóa ngay — nó "trôi chờ" trong hạn; điểm hiển-thị lùi dần từ dự-đoán về chỗ đo cuối (không bay theo vận-tốc mãi); quá hạn thành "cũ" neo chỗ-đo-cuối; quay-lại trong cửa-sổ thì nhận lại vết; quá hạn-không-quay thì xóa.

**Vai trò pipeline:** chặng 6, note "một cơ chế của chặng 6" (không phải toàn-bộ chặng — tránh hiểu-ngầm trùm cả chặng vòng-đời) — before assignment, after "Báo mất dấu & hết hạn" (dormant).

**ifMissing dạy gì:** "Mỗi lần xe bị che có thể bị coi như mất hẳn — xe quay lại mang mã mới và hành trình đứt đoạn" — hệ-quả ID-đứt rõ.

### ⚑ Câu-hỏi LEAD: đối-chứng "xóa ngay" có đánh-dấu toy? — **ĐÃ ĐÁNH-DẤU (sau fix của A)**

Panel OFF hiển **hai lớp đánh-dấu rõ**: story "bên trái minh họa kiểu mất-vết đơn-giản để so" + nhãn trong-canvas "**đối chứng đơn giản**: xóa ngay" + caption "bên trái (**đối chứng**) xóa ngay". Reader hiểu đây là cảnh-đối-chứng giản-lược — KHÔNG phải claim về hành-vi production khi tắt riêng cơ-chế này.

> ⚠ Tự-sửa report: bản đầu của B khẳng-định "đây là hệ-quả thật (unmatched→expire ngay)" — **claim thiếu file:dòng, đã rút**. Từ visible-layer chỉ nói được: OFF là đối-chứng giản-lược, đúng vai-trò "nếu thiếu cơ-chế chờ thì trông như mất-hẳn". Hành-vi thật của backend khi vô-hiệu riêng coasting không được khẳng-định ở đây (A ghi TTL 90 khung/~4.5s giữ vết — `mt:149` verified; expire theo hạn, không "ngay" trong production).

Phần verified trực-tiếp (giữ nguyên): decay `mt:278` `point = measured + (raw − measured)·decay` — **lerp về measured**, không phải `v *= exp` — copy "lùi dần từ dự đoán về chỗ đo cuối" khớp. Panel-ON timeline "mất đo … 4,6 giây … hết hạn" khớp TTL ~4.5s. Con-số cảnh đánh `scope:"illustration"`.

**BLOCKER:** không.
**MINOR:** không có (nhãn đối-chứng đã đủ ba lớp: story/canvas/caption).
**Caption↔canvas:** khớp — caption "lùi dần từ dự đoán về chỗ đo cuối" ↔ canvas vẽ điểm-hiển-thị lệch khỏi điểm-đo-cuối theo hướng về.

---

## 4. assignment — `Ghép vệt với xe theo dõi` (Chặng 5/12)

**Người-mới học được:** ghép là bài-toán một-đối-một **toàn-cục** — cổng cấm cặp vô-lý trước, chấm mỗi cặp theo 4 dấu-hiệu, rồi chọn tập cặp tổng-điểm thấp nhất; gán theo-hàng (greedy) có-thể nghẹt cặp sau; khi hai ứng-viên gần hòa ở vết-nhạy thì **chỉ vết đó chờ** — cặp khác vẫn gán.

**Vai trò pipeline:** chặng 5 — before "Phát hiện chuyển động", after "Giữ / suy đoán / kết thúc vết xe" (vòng-đời).

**ifMissing dạy gì:** "Vết có thể nhảy giữa hai xe khi chúng sát nhau — danh tính tráo nhau và hành trình đứt" — liên-hệ đời-thật "hai xe sát nhau qua chỗ hẹp".

### ⚑ Câu-hỏi LEAD: ambiguity scope — **đúng, chỉ vết-nhạy**

- Copy rules: "Khi hai ứng viên gần hòa ở **vết nhạy** thì **chỉ vết đó đợi** thêm bằng chứng — cặp khác vẫn gán" — scope đúng, không khái-quát hóa.
- Canvas s5: ON-panel "toàn cục 0,25 + **1 chờ**" — vết-1 "điểm hòa: chờ chứng cứ" đứng-riêng trong khi vết-2 vẫn được gán 0.25. OFF-panel "theo hàng 1,15" vẫn gán-hết → đối-lập rõ.
- Source: margin chỉ áp `split_margin_track_ids` (invisible>0 ∨ merged-freeze gần — `mt:1685-1686`, content ghi đúng trong where/limits).
- Ma-trận minh-họa [0.30,0.50; 0.25,0.85] được đánh `scope:"illustration"` trong realParams — không giả số-production.

**BLOCKER:** không.
**MINOR:** "vết nhạy" — default layer chưa nói lý-do (vết vừa mất-đo hoặc vừa-gộp) — gợi-ý 1 cụm plain-VI, chi-tiết `mt:1685-1686` giữ ở Deep. **Sửa thuộc A.**
**Caption↔canvas:** khớp — ô đỏ 10.00 "bị cấm", ô vàng chọn-greedy, ô xanh chọn-toàn-cục; "vệt c ngoài cổng: bị cấm" đúng với rule cổng.

---

## 5. Tổng kết

| route | teaches đúng? | role/ifMissing | BLOCKER | MINOR | caption↔canvas |
|---|---|---|---|---|---|
| motion | ✅ OR-mốc/AND-lớp verified mt:553-560, :792-793 | ✅ / ✅ | — | 1 (summary "hai lớp" đọc-vội → AND-mốc) | khớp |
| kalman | ✅ predict-trước-detect verified :2228/:2233 | ✅ / ✅ | — | 1 (before→"#/" Map link) | khớp |
| coasting | ✅ lerp-về-measured verified :278; TTL ~4.5s verified :149; OFF "xóa ngay" đã đánh **đối-chứng giản-lược** 3 lớp | ✅ / ✅ | — | — | khớp |
| assignment | ✅ global 1-1 + defer chỉ-vết-nhạy verified :1685-1686 | ✅ / ✅ | — | 1 ("vết nhạy" lý-do chỉ ở Deep) | khớp |

**Không BLOCKER nào từ phía B.** 4 trang A đạt chuẩn default-layer: câu-ngắn, OFF/ON đánh-dấu đúng, illustration flag nơi cần, caption nói đúng điều canvas vẽ.

## 6. Ảnh đã review + hash (MD5)

Bộ đầy-đủ `shots-b/<route>/<route>-{1440,1280}-s*.png` + `-pcode.png` + `-src-open.png` + `text-{1440,1280}.json`. Ảnh đã mở trực-tiếp cho các claim then-chốt:

| file | md5 |
|---|---|
| `shots-b/motion/motion-1440-s2.png` | `adbbf871e27a0354074bdcdaa0b43ba6` |
| `shots-b/kalman/kalman-1440-s5.png` | `53ffb421497ac4058fb3043ada43c2c4` |
| `shots-b/coasting/coasting-1440-s1.png` (post-fix, nhãn "đối chứng đơn giản") | `5c08a29720610403cdf2b6e2229672c3` |
| `shots-b/coasting/coasting-1440-s2.png` (post-fix) | `9d29994ce84f964a8606bd40fdf89358` |
| `shots-b/assignment/assignment-1440-s5.png` | `f70838486ba3b513aaa40d3d48f0fa50` |

Content reviewed (mtime đọc-lúc): `content/motion.js` v3@49-101 · `content/kalman.js` v3@41-96 · `content/coasting.js` v3@46-101 · `content/assignment.js` v3@43-98.

---

# PHẦN B — Cross-review 6 route A còn lại (R5) + recheck 4 route

Đọc default-layer như người-mới (text-1440.json + ảnh 1440/1280 s0–sN, pcode + src-open chỉ sau paraphrase). Hash content/page đo tại thời-điểm review. Probe `_qa_v3_b.mjs` toàn PASS (đã mở-rộng check ④ chấp nhận ref frontend — routing chỉ có nguồn frontend, hợp-lệ).

## B1. Paraphrase từng route

| route | nó làm gì (bằng lời thường) | vị-trí đọc được | thiếu nó thì sao |
|---|---|---|---|
| brightness | Kéo khung nền sáng-tối theo trước khi so ảnh — mây che không bị tính là xe chuyển | bước con chặng 4, trước ghép vệt | cả khung tính "động" → hàng trăm vệt giả nuốt xe thật |
| shadow | Rọi từng vùng nghi-bóng với nền: tối-nhưng-giữ-màu = bóng, khác màu = xe thật | bước con chặng 4 | bóng bám xe phình khung; xóa thô thì xe tối màu mất |
| echo | Mép vùng quan sát, vệt mới chồng gần-trùng vệt cũ → kiểm có phải "vệt bóng ma" không trước khi cấp mã | trải chặng 4→5 | một xe hai mã, bàn giao camera rối |
| track-lifecycle | Vệt mới phải chứng-minh qua đủ quan sát + đi đủ xa mới được tin là xe | chặng 6 giữ/suy-đoán/kết-thúc | vũng nước rung thành "xe", rác bản tin |
| occlusion | Hai xe nhập một vệt → đóng băng hai vết thay vì gán bừa — mã không đổi chỗ | lệnh cấm chặng 3, tác-dụng tới chặng 5 | vệt dính ăn hai mã rồi đổi chỗ, khó gỡ |
| routing | Tuyến đi men làn (đúng chiều, không xuyên ô) từ cổng tới ô — tính lại liên tục, lạc quá vạch thì nhắc | nhánh bất-đồng-bộ sau snapshot | tài-xế tự dò, có thể đi ngược làn |

## B2. Findings

**Canvas chứng-minh bằng hình — 6/6 đạt:**
- brightness s3: trái "so thô: cả ảnh đều lệch" + chấm nhiễu vs phải "nền đã kéo tối −25 / chỉ còn xe" ✓
- shadow s3: trái "xe đen mất" vs phải ba bằng-chứng ✓ "khác màu nền: giữ" — dạy đúng giới-hạn xóa-thô ✓
- echo s2: hai hộp chồng ở mép + 3 điều-kiện ✓✓✓ — cổng hẹp dạy đúng "chỉ bóng ma" ✓
- track-lifecycle s2: "vũng nước thành xe" (trái) vs "đứng yên: mãi mới thử" (phải) + thanh quãng-đường ✓
- occlusion s2: "hai vết cùng nhận một vệt" (trái) vs "vết đóng băng" (phải) + caption "đóng băng chờ nghiệm rõ" ✓
- routing s2: "đường chim bay / xuyên ô · ngược làn" (trái) vs "tuyến men làn đúng chiều" (phải) ✓

**BLOCKER:** không.

**MINOR (flag → A owner):**
- A1. echo story dùng "vệt bóng ma" trước khi định-nghĩa (bước 1 giải-thích ngay sau — chấp-nhận được; nếu muốn có thể gloss ngay trong story).
- A2. routing summary "la lên khi xe lạc quá xa" hơi khẩu-ngữ so với giọng các trang khác — không sai, chỉ tông.

## B3. Spot-check nguồn (2 phát-hiện ref sai → A owner sửa)

| # | claim trong content | code hiện-tại | đánh-giá |
|---|---|---|---|
| 1 | coasting `lost_track_ttl` 90 frames ref `tc:1870` (:33) | `--lost-track-ttl` default 90 ở **tc:1806**, wiring ctor tc:2371, config tc:3241; tc:1865-1870 là `--motion-prediction-decay-seconds` + `--motion-ambiguity-margin` | **ref sai dòng** — số 90 đúng nhưng trỏ nhầm arg |
| 2 | coasting certainty note "trượt-điểm ≠ vận-tốc-decay (mt:1720)" (:45) | lerp điểm-về-measured ở **mt:278** (`point = measured + (raw − measured)·decay`); mt:1716-1724 là `_candidate_cost` iou/appearance — không liên-quan | **ref sai hàm** — claim đúng, dẫn-chứng nhầm chỗ |

Cả hai chỉ sai ref-Deep, default-layer vẫn đúng nghĩa → MINOR cho A.

## B4. Recheck 4 route đầu (bản mới nhất)

| route | probe | fix trước đó còn đúng? | hash content/page (md5, 10 ký tự) |
|---|---|---|---|
| motion | 41/41 PASS | OR-mốc/AND-lớp giữ đúng | `612fb22286` / `40c542632c` |
| kalman | 41/41 PASS | predict-trước giữ; `before → "#/"` vẫn còn — flag đứng (A quyết-định) | `5d77f6bc4f` / `21773966d0` |
| coasting | 41/41 PASS | nhãn "đối chứng đơn giản" + story giải-thích có mặt — flag đã đóng; **2 ref-Deep sai mới phát-hiện ở B3** | `9d7168a956` / `7bd12f23e4` |
| assignment | 41/41 PASS | "vết nhạy" đã có lý-do plain-VI trong qa/stepTexts ("đang mất đo hay vừa bị gộp") — flag đã đóng | `0a179eb97c` / `02d61f5dc9` |

## B5. Ảnh + hash (MD5)

| file | md5 |
|---|---|
| `shots-b/brightness/brightness-1440-s3.png` | xem file (probe-generated) |
| `shots-b/shadow/shadow-1440-s3.png` | " |
| `shots-b/echo/echo-1440-s2.png` | " |
| `shots-b/track-lifecycle/track-lifecycle-1440-s2.png` | " |
| `shots-b/occlusion/occlusion-1440-s2.png` | " |
| `shots-b/routing/routing-1440-s2.png` | " |

Content/page reviewed: brightness `176f224238`/`222dca944d` · shadow `929e286c72`/`dfd2f56032` · echo `cb4f4ce973`/`23ae02651a` · track-lifecycle `e601c38595`/`134956ca08` · occlusion `a918fbce3c`/`c07aabe118` · routing `31c822b840`/`03afd81fc7`.

**Kết-luận B:** 10/10 route A đọc được như người-mới, canvas chứng-minh bằng hình, không BLOCKER. Còn 4 flag MINOR thuộc A (echo wording, routing tông, 2 ref-Deep coasting) + flag mở kalman `before → #/`. Không sửa file A; mọi flag chuyển owner qua LEAD.

---

# PHẦN C — Recheck sau A wave-B3 fix (post-freeze, hash mới)

A đã áp hết flag của B (`batch-a.md` §REVIEW-FIX wave-B3, report 03:06; content còn chỉnh glossRefs 03:09-03:10 sau report). B verify lại **trực tiếp source + content hiện-tại**:

## C1. Flag → trạng thái

| flag B | A sửa | verify B | kết |
|---|---|---|---|
| coasting `lost_track_ttl` ref tc:1870→**tc:1806** (+wiring :2371, cfg :3241) | `coasting.js:33` + `track-lifecycle.js:31` | `--lost-track-ttl` default 90 thật ở `two_camera.py:1806`, wiring ctor `:2371` — B đã đọc trực-tiếp | **đóng** |
| coasting lerp ref mt:1720→**mt:278** | `coasting.js:23,:45` | `motion_tracker.py:278` = `measured + (raw−measured)·decay` thật | **đóng** |
| echo "vệt bóng ma" gloss trong story | `echo.js:41` "…là 'vệt bóng ma' — cổng chặn đặt rất hẹp…" | đọc lại ✓ | **đóng** |
| routing "la lên" → "nhắc" | summary/story/caption/flow/qa đều "nhắc" | đọc lại ✓ | **đóng** |
| kalman `before → #/` | `kalman.js:46` → "Bản đồ pipeline · nguồn khung hình" href `#/` (Map thật) | đọc lại ✓ | **đóng** |

## C2. Probe + hash post-fix (chạy lại, không dùng ảnh cũ)

| route | probe `_qa_v3_b` | content md5-10 | page md5-10 |
|---|---|---|---|
| coasting | 47/47 PASS | `857c9259e4` (khớp batch-a) | `7bd12f23e4` |
| track-lifecycle | 41/41 PASS | `65ec885fa3` | `134956ca08` |
| kalman | 47/47 PASS | `4781f9fe1b` | `21773966d0` |
| echo | 41/41 PASS | `8a9d4bd398` | `23ae02651a` |
| routing | 41/41 PASS | `b104799cc3` | `39ffda95c8` |

Lưu-ý hash: content track-lifecycle/kalman/echo/routing khác batch-a vì A/C bổ-sung glossRefs sau report (03:09-03:10) — hash trên là **bản hiện-hành**, đo lại tại thời-điểm recheck.

**Kết-luận cập-nhật:** 0 flag mở từ phía B. 10/10 route A OK trên bản mới nhất. Còn warn glossary-noise chung (C-owned) — không phải flag nội-dung.
