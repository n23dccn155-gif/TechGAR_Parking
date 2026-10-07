# R5 READER — A đọc chéo Map / Journey / Glossary (owner C)

> **TRẠNG THÁI: FINAL — C đã báo R5-round4 READY.** Recheck đã chạy trên
> hash hiện tại (xem §F). Bằng chứng provisional ~03:08 giữ ở §0–5 làm đối chiếu;
> kết-luận cuối ở §F.

---

## §F — FINAL RECHECK (C-ready hash, ~03:35)

**Hash reviewed (FINAL):**
| file | md5 |
|---|---|
| js/pipeline/map.js | `9adfcfb2238ff8ad25919ad67de2b7a2` |
| js/pipeline/journey.js | `698a4588ce5cc682fd0d7af6ad74df97` |
| js/pipeline/glossary.js | `072bf3a28ff8c300cb3d43fcbc7ec50a` |
| index.html | `25883d21970a6e5aec431df40d1d92c6` |
| js/core/ui.js | `85d9f5a7782e066731a98fc6eb7c95fc` |
| css/app.css | `a2c7ba967c13354ae622585e643b4c6e` |

**Probe:** `_cross_r5_final_a.mjs` — **0 console/page/request errors** × 2 viewport (1280×720 + 1440×900) · dump `_cross_dump_a/r5f-{1280,1440}.json`.

**Ảnh FINAL (16):** `qa/shots/r5-reader-a/final[-1440]-{map-top,map-N2,map-N14,journey-s0,journey-s4,journey-s9,glossary-filter,glossary-fold}.png`.

**Kết-quả FINAL theo checklist LEAD:**

- ✅ **Map 2 views**: pill `k/12` tách khỏi tên node — không overlap; nav "Sơ đồ"; ROI nested trong chặng-4; `∥` luồng riêng + `~` đầu-đọc nét-đứt rõ; feedback "giữ chỗ báo ngược về (nét đứt — ngoài vòng lặp)" đúng hướng.
- ✅ **Map N2 click** → panel "Quan sát ô đỗ bằng ảnh · **luồng song song**" + link "Bỏ phiếu trạng thái ô đỗ" — semantics parallel đúng, không ngụ ý serial.
- ✅ **Map N14 click** → panel "Cổng & phiên QR · **nhánh bất đồng bộ**" + "không nằm trong vòng lặp" + 4 links trang — đúng async consumer.
- ✅ **Journey s0/4/9** cả 2 views: active chip đúng bước (s4 "Cập nhật ô đỗ" + async "Cổng & phiên" sáng; s9 "Đồng bộ & phát tin" + 2 async sáng); caption đổi đúng; HUD 6 ô VI đồng bộ (`4/9`, `mã 7`, `ô A05 (đã chọn)` … `9/9`, `đã xóa (ra cổng)`); không câu-cụt; steps 10, `li.on` đúng.
- ✅ **Glossary**: 56 terms, filter "vệt" → 16 hits live; fold "sâu hơn" mở được; canon/deep refs trong fold.
- ✅ Journey Flow① đã vá (câu đầy đủ "Vòng lặp chính chạy 12 chặng trên mỗi khung hình…"); legend không wrap-vỡ ở cả 2 view.

**Flags:** F1 ✅ closed · F2 ✅ closed · F3 ✅ closed (ROI metadata-fix §4) · F4 note (provisional shots giữ nguyên nhãn, FINAL shots thay thế) · F5 ok.

**Kết luận: Map / Journey / Glossary FINAL đọc-được cho người mới, đúng call-order runtime, không blocker.** Không sửa file C — review read-only.

---


---

## 0. Bằng chứng kỹ thuật

- Probe: `_cross_r5_a.mjs` — mount qua index.html thật (`file://`), 2 viewport **1280×720 + 1440×900**, 0 console/page/request errors.
- Mount: `map` (route `#/`), `journey` (`#/journey` — 10 steps), `glossary` (`#/glossary`) — cả 3 mount sạch.
- Ảnh (10): `algo-web-v2/qa/shots/r5-reader-a/` — `map-top`, `map-1440-top`, `journey-top/-mid-s4/-final-s9` (×2 viewport), `glossary-top`, `glossary-1440-top`.
- Text dump: `.analysis/readability-v3/_cross_dump_a/r5-{map,journey,glossary}.json`.
- Hash reviewed (PROVISIONAL — sẽ đổi khi C chốt):
  | file | md5 @~03:1x |
  |---|---|
  | js/pipeline/map.js | `752bf99c20569de80d51f28ac0ec7b5d` |
  | js/pipeline/journey.js | `19093e9156228d190526d51bd0de6abb` |
  | js/pipeline/glossary.js | `072bf3a28ff8c300cb3d43fcbc7ec50a` |
  | index.html | `25883d21970a6e5aec431df40d1d92c6` |

---

## 1. MAP (`#/`)

**Làm gì:** Bản đồ toàn pipeline — 12 chặng vòng lặp mỗi khung + luồng riêng song song + đầu đọc bất đồng bộ + cài đặt một lần, dạng sơ đồ click-để-mở-trang.

**Paraphrase runtime-order (đối chiếu mapping C `batch-position-c` + source):**
- ✅ **Setup lane**: "CÀI ĐẶT BAN ĐẦU — chỉ 1 lần" (hiệu chuẩn · vùng nhìn · ô đỗ · cổng) — đúng semantics calibration một-lần.
- ✅ **Worker parallel**: "LUỒNG RIÊNG — chạy song song" / "Quan sát ô đỗ bằng ảnh" ∥ "bỏ phiếu ảnh/cam khoảng 2 lần/giây" / "gửi việc mỗi khung hình" / "bằng chứng mới nhất → chặng 11 (áp dụng đầu vòng lặp sau)". Đúng mô hình mailbox latest-wins (`runtime_server.py:106-113`) + vote ảnh riêng.
- ✅ **Vòng lặp chính 1/12–6/12** mỗi khung: Nhận ảnh 2 camera → Dự đoán vị trí → Chống che khuất → Phát hiện chuyển động → Ghép vệt → Giữ & kết thúc vết. Note "Chặng 2–6 lặp lại cho TỪNG camera — cam 1 xong rồi cam 2 trong cùng một vòng lặp" — đúng call-order.
- ✅ **ROI nested**: chip "Vùng quan sát (ROI)" vẽ **bên trong** node chặng-4 "Phát hiện chuyển động" — đúng semantics ROI-mask áp trước khi phân tích; đọc là phần-con chứ không phải chặng riêng.
- ✅ **Điều phối 7/12–12/12** (1 lần/khung): Báo mất dấu → Gom chứng cứ → Chuẩn bị khôi phục → Bàn giao & mã chung → Cập nhật ô đỗ → Đồng bộ & phát tin.
- ✅ **Đầu đọc bất đồng bộ** (nét đứt, "ngoài vòng lặp"): Cổng & phiên QR "~ hỏi ~4 lần/giây · trả lời yêu cầu" + Điều hướng — đúng gate-poll `gsc:865` (~4Hz) và frontend consumer. "phát bản tin mới nhất khoảng 5 lần/giây" ✓ `tc:2817` throttle `1/json_fps`.
- ✅ **Feedback**: "giữ chỗ báo ngược về (nét đứt — ngoài vòng lặp)" — đúng hướng slot-hold từ session phía user → phần gán ô; không ngụ ý call-order trong vòng lặp.
- ✅ Note rủi-ro thật: "Xe có thể cắt vạch cổng trước khi mã chung kịp phát — phiên chỉ tạo khi bản tin đã có mã xe (có cơ chế cứu trong cửa sổ rất ngắn)" — đúng quirk đã verify (rescue ~1s `gsc:264`).

**Flag (provisional):** ảnh `map-top` @1280 không thấy overlap nhãn/số-chặng — C đang sửa vùng này nên giữ flag mở cho tới khi recheck trên final hash. Không thấy vấn đề call-order giả.

---

## 2. JOURNEY (`#/journey`)

**Làm gì:** "Hành trình một chiếc xe" — một xe đi qua 10 bước (vào cam → vệt → cắt VÀO sớm → mã chung → QR/chọn ô → đường dẫn+bàn giao cam → đỗ → ngủ → nhận lại → RA/xóa phiên), panel trái = bãi xe 2-camera, panel phải = cột 12 chặng + hộp async; chặng của bước hiện tại sáng lên.

**Vai trò:** trang kể-chuyện duy nhất nối cả vòng-lặp-mỗi-khung lẫn 3 nhánh bất đồng bộ theo **thứ tự chạy thật**.

**Kiểm tra active & caption (probe scrub):**
- ✅ 10 steps; `li.on` đổi đúng; chip sáng đúng theo `STEP[n].active` (ảnh mid-s4: "Cập nhật ô đỗ" sáng khi bước 5 gán ô — khớp semantics).
- ✅ Caption đổi theo bước: mid = "Người dùng quét mã, phiên chuyển sang bước chọn ô và người dùng chọn ô A05… giữ chỗ được báo ngược về phần gán ô"; final = "Xe cắt vạch RA: bộ phận cổng chuyển phiên sang điều hướng ra rồi xóa phiên; giao diện dẫn đường ra cổng cho tới khi mất vệt".
- ✅ HUD 6 ô VI đồng bộ: `VẾT XE / MÃ CHUNG / Ô ĐỖ / PHIÊN / TRẠNG THÁI Ô / CHẶNG` — mid `mã 7 · ô A05 · đang điều hướng · 4/9`, fin `vệt cam 2 · đã xóa (ra cổng) · 9/9`.
- ✅ Nhánh async vẽ **trong hộp nét-đứt riêng** dưới cột chặng ("bất đồng bộ — song song / đầu đọc (ngoài chuỗi)") — không nằm trong chuỗi per-frame; đúng quan-điểm "không phải call-order".
- ✅ Flow ①–⑤ tham-chiếu bước đúng (bước 8,9,10 → ngủ/nhận-lại/ra); quan-hệ "phiên không thể trước mã chung" lặp ở summary+rules — đúng fact.
- ✅ Thuật-ngữ giữ (mã chung, vệt cam 1/2, vạch VÀO/RA, vé nhớ, cổng nhận lại) + glossary resolve.

**Flag (provisional):**
- Canvas cột-chặng khá chật ở 1280 (12 chip + async box trong ~510px) — C đang sửa đúng vùng này (diff mới: `minHeight 560`, `ASYNC_H 72`, gap 6, legend 26). **Recheck crowding + câu-cụt trên final hash.**
- Step-text bước-2 nói "cú cắt bị bỏ qua và được cứu lại sau" — đúng semantics rescue-window; giữ.

---

## 3. GLOSSARY (`#/glossary`)

**Làm gì:** Thuật ngữ dùng xuyên trang, gom 6 nhóm theo vùng pipeline; định nghĩa đời-thường ở mặc định, canon/tham-số/file:dòng trong "sâu hơn".

**Kiểm tra:**
- ✅ Display names VI đời-thường ("Vùng quan sát (ROI)", "Bản tin trạng thái", "Vé nhớ", "Cổng nhận lại"), giữ canon kỹ-thuật trong Deep ("sâu hơn — khóa nội bộ, tham số & nguồn").
- ✅ Lookup case-insensitive cả key lẫn alias (`lookup` lowercases canon trước khi so — comment+code `glossary.js:236-248`); alias map đủ ("bản tin"→snapshot, "vệt chuyển động"→blob, "bóng đổ"→shadow flag, "bộ lọc kalman"→Kalman CV4…).
- ✅ Ô lọc tìm theo tên+nội-dung+deep+canon.

---

## 4. GLOSSARY-WARN — chẩn đoán + owner-side fix (đã áp phần A)

**Cơ chế lint (`lint-readability.mjs:230-263`, đã đọc):** mỗi alias-key ≥3 ký tự + first-token canon `t[4]` được đưa vào `matchWords`; nếu từ đó xuất hiện ở default-layer mà `covered` không chứa `~<alias-word>` (tức glossRef có **label đúng-bằng alias-word**) hay `hit.term` display-name → WARN. Alias match theo **chuỗi-alias**, không theo canon — nên glossRef `{term:"shadow flag (127)"}` **không** tự cover alias "bóng đổ".

**Owner-side solution (đã áp 4 file A — KHÔNG đụng C/ROI):** thêm glossRef entry `{term:<canon>, label:<alias-word>}`:
- `kalman` +`bộ lọc kalman` · `shadow` +`bóng đổ` · `echo` +`vệt chuyển động` · `track-lifecycle` +`vệt chuyển động`, +`bản tin`.
- Kết quả: scoped lint **0 error · 1 warn còn lại**.

**Warn còn lại → RESOLVED (LEAD phê A sửa ROI metadata-only):** `roi v3: thuật ngữ "vùng quan sát"` — áp đúng pattern F3 trong `content/roi.js` v3.glossRefs `+{term:"ROI mask",label:"vùng quan sát"}` (1 dòng metadata — copy/canvas/geometry/số giữ nguyên).
- Hash roi.js: `81d237a6ec681f150793b7cf0128ca69` → `35c41ab03eb4edf5dcaff61b115249e6`.
- Lint roi + full-24: **0 error · 0 warn** · canvas-audit sạch (nhãn vẽ không đổi).
- Tooltip đối-chiếu `roi-tipcheck.png`: 13 `.tg-gt` — "vùng quan sát"×5 resolve → "Vùng quan sát (ROI)" entry; mọi tooltip cũ (vùng ưu tiên, mã xe, chân hộp, vệt) vẫn đủ → không mất fact.

**Nhận-xét thiết-kế (đề xuất, không ép):** sau khi C đổi display-name thành cụm VI đời-thường, warn-alias là hữu-ích (ép tooltip đúng thuật-ngữ). Chỉ lưu-ý alias dạng cụm-phổ-thông ("bản tin", "vệt chuyển động") sẽ match cả văn-thường — owner-side cover bằng glossRef-label như trên là đủ; không cần đổi lint thêm. `SKIP_TERMS` hiện có ('gán','ô đỗ','vết xe','phiên','track') đã chặn phần từ-quá-phổ-thông.

---

## 5. TÓM TẮT FLAG

| # | mức | nội dung | chờ |
|---|---|---|---|
| F1 | recheck | map overlap số-chặng/tên @1280 — ảnh mới đã sạch, giữ mở tới C-ready | C final hash |
| F2 | recheck | journey cột-chặng chật @1280 + câu-cụt — C đang sửa (diff live) | C final hash |
| F3 | ✅ resolved | roi v3 warn `vùng quan sát` — A sửa metadata-only theo LEAD phê (hash before/after + tooltip shot trong §4) | — |
| F4 | note | ảnh/hash hiện tại provisional — tuyệt-đối không approve ảnh 02:47/03:03 | — |
| F5 | ok | không thấy sai call-order / route giả / ROI-nested sai semantics | — |

## 6. VIỆC CÒN LẠI
1. Chờ C báo **canonical ready-hash** → re-run `_cross_r5_a.mjs`, chụp lại 2 viewport, hash lại, append **FINAL** vào report này.
2. ROI warn (F3) do C quyết — A đã đưa owner-side pattern.
3. `cleanup plan` của C → mới được remove fields; hiện giữ nguyên.

*Bằng chứng: `_cross_r5_a.mjs` · `qa/shots/r5-reader-a/` · `_cross_dump_a/r5-*.json` · lint-scoped logs trong batch-a.md §REVIEW-FIX LEAD 20:08.*
