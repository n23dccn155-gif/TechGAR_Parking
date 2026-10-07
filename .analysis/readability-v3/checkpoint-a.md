# Checkpoint A — readability-v3 (owner A, scope: ROI only)

**Trạng thái: R2 — STOP. ROI MẪU FINAL FREEZE; C full-smoke ĐÃ PASS trên đúng hash (46 runs / 844 refs / Play 46/46 — theo `r2-qa-c.md`). Đóng hết B findings F1–F7 + visual blocker LEAD (xe C thực sự cắt mép strict-ROI ở s2). Lint 0/0 · QA 76/76 ×2 viewport · 0 errors · 16 ảnh trên bản final. Mọi issue phía A RESOLVED (badge/breadcrumb/glossary-canonical-case đều C đã fix). ĐANG CHỜ: B final-reader + USER ROI gate. KHÔNG R3+, không code-edit thêm.**

Stable (đã C QA pass): `content/roi.js` md5 `81d237a6ec681f150793b7cf0128ca69` (mtime 2026-10-05T00:10:20) · `pages/roi.js` md5 `8f4a869db4b2d85cea61fb004fcb5a78` (mtime 2026-10-05T00:13:33).

## Giới hạn
- OWNERSHIP: `algo-web-v2/js/content/roi.js` + `js/pages/roi.js` only. Report/QA riêng: `.analysis/readability-v3/` + `qa/shots/readability-roi-a/`.
- Không shared/core/CSS/lint-script/22 trang khác/production source. Vấn đề core → báo LEAD, không tự sửa.
- Số liệu: runtime-only ở lớp mặc định; class chỉ ở Deep/ô④. §4 lấy voice, KHÔNG lấy math.

## Vòng-3 (final-freeze) đã làm
- **Visual blocker:** thêm `CARC{x0:0.81,xE:0.885,y:0.72,w:0.10,h:0.07}` — trong viền s0–1, cắt mép phải strict-ROI s2+; cùng geometry 2 panel. Rescue đúng semantics nguồn: clipped ∧ support>0 ∧ chân hộp∈vành (`deadOutside`+`edgeXAtY` ~ `mt:866-908,:979-1011`); hiển thị khung đứt đỏ "không vành: đo thiếu" vs hộp nguyên "đo trọn nhờ vành". Cờ QA `canvas.dataset.edgeClip="1"` ở s2 — harness assert cả 2 viewport.
- **F1** "vệt": nghĩa trong ngoặc "(đối tượng chuyển động)" ở step2; HUD "Vệt…"→"Vật chuyển động trái/phải"; gloss `blob→"vệt"`.
- **F2** band-vs-priority: rules đời thường ("chân hộp" thay "điểm đáy", gloss `anchor→"chân hộp"`); rescue nêu đủ đk; "10% hộp" gắn vùng ưu tiên không gắn ROI; công thức ở ④/Deep.
- **F3** "xe mới nổ máy" → "Xe vừa rời ô hay bị che khuất một lúc — nới điều kiện quanh ô giúp bắt lại đúng xe đó."
- **F4** Các-bước = hành-động; ① Luồng = tại-sao/ý-nghĩa — viết lại 5 câu flow nhân-quả.
- **F5** chồng nhãn 1280: title panel TRÊN khung 14px; "vành đệm" trái + leader; "vùng ưu tiên" clamp; nhãn nhiễu/xe C clamp trong panel.
- **F6** caption s0: "thử kéo đỉnh đỏ để lọc đổi theo" — drag thật re-render (đã có).
- **F7** HUD cuộn 1280: acceptable, không thêm khối.
- **Hedges (LEAD flags):** "có thể trở thành xe giả" / "có thể bị mất dấu và được cấp mã mới" / "có thêm cơ hội bắt lại trước khi mã cũ hết hạn" — không tuyệt đối.
- **Panel titles EXACT** `KHÔNG có ROI` / `CÓ ROI` 14px bold (camFrame title rỗng, tự vẽ — không sửa core).
- **HUD động:** đếm `onVeh` trả từ `panel()`; trái "3 xe + 4 nhiễu"/"7 (gồm nhiễu)".

## Kết quả final
- `node qa/lint-readability.mjs --routes roi`: **0 error · 0 warn**.
- `node _qa_r2_roi.mjs`: **76/76 PASS × 1280×720 + 1440×900, 0 console/page/request errors** — gồm `xe C straddles ROI s2` cả 2 viewport.
- Ảnh 16 file ×2 viewport trong `qa/shots/readability-roi-a/` — eyeball s2 xác nhận xe C bị viền cắt, nhãn đọc đủ.

## BLOCKERS — hết
1. ~~Badge 340px~~ · ~~breadcrumb N1+N5~~ · ~~glossary canonical-case~~ — đều **RESOLVED by C** (glossary có node-test `r2-qa-c.md` §3). Không còn issue mở phía A.

## NEXT
1. ~~C: full-smoke/full-QA~~ — **DONE, PASS trên hash frozen** (`r2-qa-c.md`: 46 runs / 844 refs / Play 46/46).
2. B: final-reader review (visible-text §2 report + ảnh).
3. USER duyệt ROI mẫu → mới R3/22 trang. A không self-approve, không code-edit thêm.
