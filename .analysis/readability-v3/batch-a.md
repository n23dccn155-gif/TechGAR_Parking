# batch-a.md — Owner A · R3 report (4/10 trang)

Owner A: `motion, kalman, coasting, assignment` (R3 xong) · `brightness, shadow, echo, track-lifecycle, occlusion, routing` (R4 — chưa bắt đầu).
Mẫu: ROI đã user duyệt. Mọi số kỹ thuật verify trực tiếp `backend/main_detect/two_camera.py` (tc:) + `src/techgar/motion_tracker.py` (mt:), không tin dossier/plan.

**Kết quả tổng:**
- Lint `node qa/lint-readability.mjs --routes=motion,kalman,coasting,assignment` → **0 error · 0 warn** (4 converted, 0 legacy pending).
- QA `.analysis/readability-v3/_qa_r3_a.mjs` → **272/272 PASS · 0 console/page/request errors**, cả 1280×720 và 1440×900, 4 route.
- Ảnh: `algo-web-v2/qa/shots/readability-r3-a/` — 50 file, dạng `r3-<route>[-1440]-{top,mid-s*,final-s*,pcode,src,tooltip}.png`.
- Position/stage áp dụng đúng `batch-position-c.md` (đã check lại, không discrepancy).

---

## 1) `motion` — Phát hiện chuyển động

**Stage/vị trí:** Chặng 4/12 · trước = "Chuẩn bị chống che khuất" (`#/algo/occlusion`) · sau = "Ghép vệt" (`#/algo/assignment`) · link "Khoanh vùng quan sát — nằm trong chặng này" (`#/algo/roi`).

**Facts đã verify (file:dòng, runtime scope):**
1. Temporal OR trong-lớp / AND giữa-lớp: `motion_tracker.py:790-793` — hai phép so vs mốc gần/xa OR nhau (`cv2.bitwise_or` vòng `_motion_between`), rồi `fg = MOG2 ∧ dilate(temporal,17×17)`; mốc ~0.25s/0.80s target `mt:500` (cửa sổ 0.45–2.25×). → Caption nói "khớp một trong hai mốc … thêm lớp nền đồng ý" là đúng cơ chế.
2. Morphology: `mt:559-560` (MORPH_OPEN 3×3 + dilate 5×5 ×2 sau OR) và cascade tiếp `mt:817-827`; `min_area` runtime **650px** `two_camera.py:1807`.
3. Cổng khác runtime-vs-class: `motion_min_pixels` **100** `tc:1814` (class 160, `mt:56`), `motion_min_ratio` **0.05** `tc:1815` (class 0.08); MOG2 history/var `mt:203`.

**Chuyện nhìn thấy (5 bước, cùng cảnh/seed 2 panel):**
- s0 cảnh gốc: xe chạy + xe đậu + cây lay + chấm nhiễu · s1 "tách nền" bắt hết mọi thứ động (cả cây/nhiễu) · s2 chip "một mốc đủ"→"hai lớp đồng ý": chấm nhiễu chỉ-1-lớp bị loại, "hai lớp đồng ý: nhiễu chết" vs trái "không kiểm chéo: nhiễu cứ sống" · s3 "làm sạch" bóc chấm/nối mảnh · s4 cổng: chỉ xe qua. Panel KHÔNG kiểm-chéo giữ 5 vệt rác đến cổng, panel CÓ còn 1.
- Caption s2 (sau review-fix OR/AND): "Khớp một trong hai mốc là qua lớp thời gian — nhưng phải thêm lớp nền đồng ý, nên nhiễu một-lớp chết." · HUD "5 vệt" vs "1 vệt", "5 (cả rác)" vs "1 (chỉ xe)".
- Giới hạn ghi rõ: xe đậu lâu/chậm bị chết cùng nền (flow + impacts); không hứa sạch tuyệt đối.

**Khó/hedged:** "xe chậm có thể bị bỏ sót" — ifMissing nói rủi ro hai phía, không claim sạch 100%.

---

## 2) `kalman` — Dự đoán vị trí xe

**Stage/vị trí:** Chặng 2/12 · trước = "Nhận ảnh & đồng bộ 2 camera" (`#/`) · sau = "Chuẩn bị chống che khuất" (`#/algo/occlusion`) · link "Ghép vệt — dùng vị trí dự đoán làm cổng" (`#/algo/assignment`, ghi rõ quan-hệ-downstream không phải thứ-tự-gọi).

**Facts đã verify (file:dòng):**
1. `cv2.KalmanFilter(4,2)`, state (x,y,vx,vy), hằng-vận-tốc, measurement chỉ x/y — `_new_kalman` `motion_tracker.py:440-448`.
2. Q=diag(2,2,12,12), R=8·I₂, P0=100·I₄, vận tốc đầu = 0 — cùng chỗ `mt:440-448`.
3. Thứ tự runtime: predict trước detect → assignment → correct: `_predict_tracks` `mt:239-260`, gọi trong `process_frame` ~`mt:2096`, `_apply_detection` `mt:2170`, vòng assign `mt:2228-2255`.

**Chuyện nhìn thấy (6 bước, cùng chuỗi đo/seed 2 panel):**
- s0 vết mới · s1 điểm đo nhiễu · s2 bên phải đường lọc mượt, bên trái lắc theo đo · s3 mất đo: phải trôi theo dự đoán + vòng bất định, trái "kẹt ở điểm đo cuối" · s4 vòng giãn · s5 phép đo về: phải co vòng bắt lại; trái vẽ "cổng chỉ ở chỗ cũ" đứt-nét + "vệt về: đo vẫn dùng được" + "thiếu dự đoán: cổng dễ lỡ" — dạy đúng: không-lọc vẫn dùng được đo mới, chỉ thiếu cổng đoán trước.
- HUD "mất đo — chỉ dự đoán" / "bắt lại được", vận tốc học được, độ rộng vòng.
- Hedge: "ước tính kém chắc khi mất đo lâu" — không hứa đúng vị trí.

**Nguồn ④/Deep:** có đầy đủ Q/R/P0 file:dòng (mt:440-448) — chỉ ở lớp gấp, default không lộ.

---

## 3) `coasting` — Giữ vết khi mất đo

**Stage/vị trí:** Chặng 6/12 · trước = "Ghép vệt" (`#/algo/assignment`) · sau = "Báo mất dấu & hết hạn" (`#/algo/dormant`, owner-B route — đã kiểm tồn tại) · link "Vòng đời vết — cùng chặng" (`#/algo/track-lifecycle`, same-stage — không vẽ thứ tự gọi).

**Facts đã verify (file:dòng):**
1. `max_prediction_age_seconds` = **0.40s** `mt:77` + arg `tc:1859-1863`; quá → vết thành cũ, điểm hiển thị **neo chỗ đo cuối** (nội suy measured→kalman, không phải v×exp — `mt:278` lerp `point = measured + (raw − measured)·decay`).
2. Cửa sổ nhận-lại: thường **1.5s** `mt:68`+`tc:1855`, merged **3.0s** `mt:69`; TTL giây = `max(1.0,1.5)×3.0` = **4.5s** `mt:149-153`; hết hạn khi `consecutive_invisible>90` HOẶC timestamp quá TTL `mt:2305-2308` + `tc:1806` (`lost_track_ttl=90`).
3. Nhận-lại xảy ra **trong assignment** (cổng nhận-lại `mt:1631-1702`), không phải birth; `suspend_track` `mt:2175-2187` (dormant) ≠ expire tự-nhiên.
4. `prediction_velocity_decay_seconds` = 0.25s `mt:78` + `tc:1864-1869`.

**Chuyện nhìn thấy (6 bước, 2 nhánh rõ ràng):**
- Trục tuổi AGE = [0, 0.15, 0.30, 0.45, 1.20, 4.60] minh-họa đúng clock thật: s1 mất đo (cột che), s2 trôi + mờ dần, s3 **0,45s quá 0,40 → "vết cũ — neo chỗ đo"**, s4 **1,20s trong cửa sổ 1,5s → "nhận lại vết cũ"**, s5 song-song-hai-kết-quả: "vết sống tiếp" (nhánh thật) + ghost đứt-nét "quá hạn: vết bị xóa" kèm thanh tuổi mốc "thành cũ"/"hết hạn"/4,6 giây.
- HUD s5 ghi rõ 2 nhánh: "vẫn còn — nhánh thật" + "4,60 giây — nhánh nếu" — không ngụ ý TTL reset.
- Panel trái "KHÔNG có giữ vết" = **đối-chứng đơn-giản-hóa** — sau review đã thêm nhãn thường-trực trên canvas "đối chứng đơn giản: xóa ngay" + caption s1 "(đối chứng)" + story nói "bên trái minh họa kiểu mất-vết đơn-giản để so". KHÔNG mô tả "tắt tham số trong production = expire ngay".
- Eyeball `r3-coasting-*-final-s5.png`: 2 nhánh đọc rõ.

**Khó/hedged:** impacts "bị che lâu hơn cửa sổ thì mã mới vẫn xuất hiện" — không hứa nhận lại mọi trường hợp.

---

## 4) `assignment` — Ghép vệt với xe theo dõi (Chặng 5/12 · before motion → after track-lifecycle)

**Stage/vị trí:** Chặng 5/12 · trước = "Phát hiện chuyển động" (`#/algo/motion`) · sau = "Giữ/suy đoán/kết thúc vết" (`#/algo/track-lifecycle`) · link "Lọc vệt trùng & mép — cùng chặng" (`#/algo/echo`, same-stage).

**Facts đã verify (file:dòng):**
1. Solver `lapjv` `mt:1908`, `extend_cost=True`; `assignment_cost_limit = 0.90` `mt:158` — **cap từng cặp**, không phải tổng (canvas ghi "mỗi cặp dưới 0,90").
2. Trọng số cost `mt:1761`: dist 0.45 / IoU 0.25 / appearance 0.20 / size 0.10; cổng `mt:1193-1230` floor `max(24px, extent)`, fail-open trước đủ quan-sát, velocity-aware sau.
3. Ambiguity margin ~0.08 + recovery 3 khung `tc:1871-1881` — chỉ áp cho track trong `split_margin_track_ids` `mt:1685-1686`, không phải mọi cặp (canvas/caption/rules đều ghi "chỉ vết nhạy").
4. `max_distance` runtime **180px** `tc:1811`; ô ngoài-cổng = cost cấm (10.0 trong minh-họa, ghi rõ illustration).

**Chuyện nhìn thấy (6 bước, ma trận minh-họa CỐ ĐỊNH chung 2 panel):**
- Ma trận [0.30,0.50,10]/[0.25,0.85,10] — đánh dấu "minh họa" ngay ở ④/Deep, không giả runtime.
- s1 cổng quanh vết1/2, "ngoài cổng: bị cấm" vệt-c · s2 chấm điểm · s3 trái gán-theo-hàng: vết1→a(0.30) cướp mất → vết2→b(0.85), "bị nghẹt: vệt b xa"; phải "đang cân cả bảng" · s4 phải LAPJV: vết2→a(0.25)+vết1→b(0.50) = **0,75 vs 1,15** · s5 **cảnh mơ hồ THẬT**: ô vết1-b đổi 0.31 → chênh 0,01; phải khoanh "điểm hòa: chờ chứng cứ" quanh vết1, chỉ còn 0,25 gán; trái "vẫn gán dù mơ hồ" 1,15.
- HUD "Tổng trái 1,15" / "Tổng phải 0,25 + 1 chờ" / "Ô cấm 2" / "Vết chờ 1 (điểm hòa)".
- Sau review: caption/step/rule s5 đều ghi "**chỉ vết nhạy**" chờ (cặp khác vẫn gán), nhãn cạnh ma trận "chênh 0,01: chỉ vết nhạy chờ" — không mơ hồ mọi cặp; solver tối-ưu ma-trận-đưa-vào, không bảo-đảm đúng-thực-tế.

**Eyeball `r3-assignment-*-final-s5.png`:** cảnh mơ hồ đọc được từ ảnh (ô vàng 0,30/0,31 + vòng chờ), không chỉ chữ.

---

## Blockers / issues

- Không có blocker core. Breadcrumb hiển thị đúng title+stage VI (ảnh top). Manifest title jargon = C/R5, không phải blocker A.
- `pages/assignment.js` cũ có scenario selector → đã thay bằng arc 6 bước duy nhất (đúng tinh thần ROI: caption luôn khớp canvas; mapping cảnh-cũ→bước-mới ghi ở trên).

---

# PHẦN II — R4 report (6/10 trang còn lại — TẤT CẢ lint 0/0 · QA 408/408)

Verify: `node .analysis/readability-v3/_qa_r4_a.mjs` → **408/408 PASS · 0 console/page/request errors** × 1280×720 + 1440×900 · shots `algo-web-v2/qa/shots/readability-r4-a/` (12/route).
Lint: `node qa/lint-readability.mjs --routes=brightness,shadow,echo,track-lifecycle,occlusion,routing` → **0 error · 0 warn**.

## 5) `brightness` — Bù sáng toàn cục
- Chặng 4/12 ⊂ Phát hiện (before=occlusion → after=assignment, links→motion+shadow).
- 5 bước: sáng → mây che → lưới đo → kéo nền → ngưỡng. OFF = so thô (cả ảnh thành vệt), ON = bù rồi so (chỉ xe còn).
- Summary: "Trước khi so hai khung hình, kéo khung nền sáng-tối theo cho khớp — để mây che không bị tính là chuyển động."
- Story (một cảnh thống nhất): mây che làm NỀN tối đồng loạt — xe đang đi vẫn chuyển thật (đã sửa theo review: không còn "không xe nào nhúc nhích" mâu thuẫn với cảnh).
- Facts verify: `_brightness_shift` median TOÀN CỤC `mt:473-484` (grid chỉ nơi lấy mẫu — KHÔNG bù từng vùng); `_motion_between` `mt:451-460`; OR 2 mốc `mt:555-558`; threshold runtime 20 `tc:1813` (class 25 `mt:45`); median-full 17ms vs grid 0.3ms `mt:463-469`.
- **Discrepancy glossary đã C sửa** (từng vùng → toàn cục) — RESOLVED.

## 6) `shadow` — Lọc bóng đổ
- Chặng 4/12 ⊂ Phát hiện, links→motion.
- 5 bước: xe+bóng+xe đen → đánh dấu nghi → trái bỏ-mọi-vùng-nghi → phải rọi bằng chứng → kết quả.
- Title panel: OFF **"đối chứng: bỏ mọi vùng nghi"** (đánh nhãn đối-chứng rõ theo review — không ngụ ý "không lọc = production"), ON "CÓ rọi bằng chứng".
- Facts: `reject_cast_shadows=True` `tc:2386` (class False `mt:62`); 4 metric `mt:63-66,127-132`; `_cast_shadow_metrics` `mt:633`; `_is_cast_shadow` `mt:705-726` fail-open thiếu nền; marker-127 chỉ nghi `mt:772-789`.

## 7) `echo` — Chặn vệt bóng ma
- Chặng 4–5 · links→motion+assignment.
- 5 bước arc: mép ROI → echo gộp → twin gate → thắng/thua → counter-case 2 xe thật vượt cổng. Bỏ selector.
- Hedge theo review: "an toàn" → "giảm chặn nhầm"/"trong cảnh này cả hai đều vượt cổng" (cổng hẹp chủ ý, không bảo đảm mọi scene).
- Facts: IoU 0.90 + tâm 12px `mt:1488-1489`; gate cả-hai-sát-mép + tâm≤max(12,0.15·extent) + ≥1 chưa-vững `mt:1501-1560`; winner lineage `mt:1491-1499`; thua cấm-nhận-vẫn-sống `mt:1501-1513,1619`; echo-detect `mt:1088-1134`.

## 8) `track-lifecycle` — Vòng đời vết theo dõi
- Chặng 6/12 · after assignment → before dormant, links→coasting.
- 5 bước: mã mới → tích lũy → cửa tin → mất → hết hạn; FSM strip từ-ngữ-thường.
- Facts: fresh local ID `mt:2009-2069`; confirmable `mt:2071-2094` gọi `mt:2170`; runtime 3obs+6px `tc:1808`; priority ≥2obs-vùng/3px `mt:2081`; expire `mt:2257-2334`; suspend `mt:2175-2187`; ttl=90 `tc:1806` arg + `tc:2371` wiring + `tc:3241` config.

## 9) `occlusion` — Giữ đúng mã khi che nhau
- Chặng 3/12 (lệnh cấm phát huy→5) · after kalman → before track-lifecycle, links→motion (chặng áp lệnh cấm).
- 6 bước: độc lập → nhóm theo dõi → vệt dính (đóng băng vs gán bừa) → cắt đôi gợi ý + cấm mã mới → tách đếm nghiệm → kết cục (trái mã đổi).
- Hedge theo review: "vĩnh viễn/không sửa nổi" → "có thể đổi chỗ, rất khó gỡ" + impact limit "chưa đủ chứng cứ → lệnh cấm chưa áp, hoán đổi vẫn lọt được"; nhãn "độc lập vững" đã tách khỏi "mã A".
- Facts: timeout 3.0 `occlusion_guard.py:26` (=merged_reacquire `mt:229`); watch ≥3obs-sạch+overlap≤0.20+khe≤0.4×diag `:55-100`; activate phủ-mọi-tâm+≥1.6×median `:102-148`; watershed gợi-ý `:150-189`; recovery swapped−direct≥2·margin, direct<1.2, 3-khung `:191-232`; defer `mt:224-228`; birth-veto `mt:364-389`; callsite `mt:2229-2232`.

## 10) `routing` — Dẫn tuyến men theo làn xe
- **Nhánh bất đồng bộ** (không hứa call-order) · before=snapshot (nguồn dữ liệu) → after "Người lái nhận chỉ dẫn" (không-href), links→session.
- 5 bước: đồ thị làn → mở theo điểm hứa hẹn → tuyến đúng chiều → tính lại mỗi nhịp → lạc quá vạch (la + vẽ lại vs giữ tuyến cũ). **A* chạy thật** trên graph minh họa (adjacency + heuristic đúng công thức).
- Facts: heuristic euclid×min_ratio `routeEngine.ts:38`; one-way from→to `routeEngine.ts:22`+`laneGraph.ts:19,43`; freshRoute mỗi tick `App.tsx:753-758`; off-route 80px `App.tsx:746` (lib default 75 `voiceGuidance.ts:98`); arrival <35px `voiceGuidance.ts:126`; cooldown 7000ms `App.tsx:762`.
- **Discrepancy glossary**: "off-route → 75px" là lib default; runtime 80 — flag cho C (A không glossRef term sai).

## Freeze — TẤT CẢ 20 FILE (md5 · bản QA đã chạy)

| file | md5 | mtime |
|---|---|---|
| content/motion.js | 30a292a89a048e6119d4b6be18400a1a | 03:30 |
| content/kalman.js | d4114e3a52d0b5cac9dcd9d4e12c2e0a | 03:30 |
| content/coasting.js | 136f8257a5d2facb4a602aa97467a8c9 | 03:30 |
| content/assignment.js | 8cc10943471017e2f5940797f2b3a6c3 | 03:30 |
| content/brightness.js | ed7fd0a003717ec44691741ee14ee19e | 03:30 |
| content/shadow.js | 91396575f00fe27019aae2967d75710e | 03:30 |
| content/echo.js | c55bee15dc535e5631ad3827a14ac7ae | 03:30 |
| content/track-lifecycle.js | c2115d26687b319f4bf10116ff274850 | 03:30 |
| content/occlusion.js | 546cc4be529b4d487215705d67ac5054 | 03:30 |
| content/routing.js | 4c3205af480538d2aec5f721b5f50552 | 03:30 |
| pages/motion.js | 40c542632c0ccb335c7a399fbb14de1b | 02:04 |
| pages/kalman.js | 21773966d0067b76f3407a907707adf4 | 02:16 |
| pages/coasting.js | 7bd12f23e4ff31a8e3b654962dcf51ce | 02:05 |
| pages/assignment.js | 02d61f5dc99778f6699f5abafa8f6274 | 02:04 |
| pages/brightness.js | 222dca944df7cdcf963774c97bbf94d5 | 02:27 |
| pages/shadow.js | dfd2f5603263e02f21a7c7f95c3c509d | 02:31 |
| pages/echo.js | 23ae02651ac4e0bc12b547edf99a85ae | 02:33 |
| pages/track-lifecycle.js | 134956ca08be0e68675ea8d4311789bb | 02:20 |
| pages/occlusion.js | c07aabe118132ebe4779bd767870f7c6 | 02:33 |
| pages/routing.js | 39ffda95c8c8e75c2dbf0100016f8001 | 03:02 |

QA harness: `_qa_r3_a.mjs` (272/272 R3) + `_qa_r4_a.mjs` (408/408 R4) — đều owner-A scoped, index thật file://.

## REVIEW-FIX wave-B3 (cross-reader-b findings — áp sau freeze đầu)
- **Ref sai (B verify đúng, A đổi chỉ ref — số/claim giữ nguyên):**
  - `lost_track_ttl=90`: `tc:1870` → `tc:1806` arg + `tc:2371` wiring ctor + `tc:3241` config export — áp cả `content/coasting.js`, `content/track-lifecycle.js`, report §3/§8. (tc:1865-1870 thực là --motion-prediction-decay-seconds/--motion-ambiguity-margin.)
  - note lerp `(mt:1720)` → `mt:278` `point = measured + (raw − measured)·decay` — áp `content/coasting.js` + report §3. (mt:1716-1724 thực là `_candidate_cost`.)
- **MINOR text:** echo story giải-nghĩa "bóng ma" ngay ("bản sao đó là 'vệt bóng ma'") · routing "la lên"/"la" → "nhắc" (summary+caption+flow+impact+qa+canvas+HUD+harness) · kalman before `#/` → "Bản đồ pipeline · nguồn khung hình" (Map thật, không route giả).
- **Verify sau sửa:** lint 5 route **0 error** (warn glossary-noise chung, cũng có trên route B — C-owned) · `_qa_r3_a` **272/272** · `_qa_r4_a` **408/408 PASS** 0 errors.

## REVIEW-FIX LEAD 20:08 (glossary warns + routing summary)
- **routing summary 26→22 từ** ("Từ cổng tới ô đỗ cần tuyến men làn — tính lại liên tục, nhắc giọng khi xe lạc quá xa.") — nghĩa giữ nguyên.
- **GlossRef alias-cover (owner-side fix, 4 file A):** thêm entry label trùng alias-word để lint covered — kalman `+bộ lọc kalman` · shadow `+bóng đổ` · echo `+vệt chuyển động` · track-lifecycle `+vệt chuyển động`,`+bản tin`. Diễn giải cơ chế trong `r5-reader-a.md` §Glossary-warn (covered cần `~label` = alias-word; canon/display không match được alias-key). Warn còn lại duy nhất: **roi "vùng quan sát" — roi.js A-owned metadata**, fix tương tự (thêm `{term:"ROI mask",label:"vùng quan sát"}` trong v3.glossRefs) → đã áp với LEAD-phê.
- **Verify:** scoped lint **0 error · 1 warn (roi — A-owned metadata, đã fix sau đó)** · `_qa_r4_a` **408/408 PASS** 0 errors · hash 5 file cập nhật bảng freeze.

## CANONICAL CLEANUP own11 (LEAD-authorized, C fieldlist đã duyệt)
- Fact-migration trước xóa: 13 dòng realParams/limits mới — bảng đầy đủ + refs-verify trong `canonical-audit-a.md` §1 (motion +4, assignment +1, brightness +1+limits, shadow +1, echo +3+limits, lifecycle/occlusion/routing/coasting limits+params). kalman/roi không cần migrate.
- Xóa top-level `problem/does/role/where/why/steps[]/nodes` ×11 file (`_cleanup_fields.mjs`); giữ id/title/tier/certainty/sourceRefs/realParams/limits/qa/v3. `v3.deep` không consumer — mọi text migrated nằm ở field thực-render.
- Drop-ok (không carry): prediction_source tag, association_state enum, symbol-names, cờ roi_clipped/dark_foreground_rescued (semantics đã cover).
- Hash before→after + parse-verify trong `canonical-audit-a.md` §3; roi.js (A-owned metadata) `35c41ab0…→e5490866…`.
- Verify: lint **0/0** full-24 · `_qa_r3_a` **272/272** · `_qa_r4_a` **408/408** · ROI mount-check 13 tg-gt/10 refs/0err · freeze hashes cập nhật bảng trên (10 file A; roi trong audit §3).
- **A files FREEZE-READY** — chờ C own3 cleanup tương-tự + B.
