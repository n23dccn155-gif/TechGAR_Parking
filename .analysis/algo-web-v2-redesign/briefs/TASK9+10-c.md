# BRIEF — builder-c: Task 9 (nhóm 5+6, trang 16–23) rồi Task 10 (tương tác)

Bạn là builder-c (w1:p9). LEAD = Devin (w1:p6). Task 2/3 của bạn đã DONE — cảm ơn (lint 0E/0W, e2e 28/28). Đọc TRƯỚC khi code:
- `D:\TechGar2\.analysis\algo-web-v2-redesign\SPEC.md`
- `D:\TechGar2\.analysis\algo-web-v2-redesign\MEGAPLAN.md` mục "Task 9" + "Task 10"
- **Mẫu chuẩn R0 đã duyệt:** `algo-web-v2\js\pages\homography.js` — giọng/khung/limits chuẩn cho mọi trang.

## Thứ tự
**Task 9 trước** (8 trang): `js/pages/snapshot-api.js`, `gate-session.js`, `frontend-dataflow.js`, `routing-astar.js`, `voice-guidance.js`, `predictions-jsonl.js`, `replay-ground-truth.js`, `failure-gallery.js`. prev/next nối sau slot-binder → snapshot-api → … → failure-gallery (đầu chuỗi trỏ trang builder-b chưa có — nếu lint luật 9 báo thì để null + ghi chú). Nạp vào `index.html` cuối danh sách trang.

Lặp Step A–F như Task 6: notes/<slug>.md → trang → glossary/quick-values → ảnh thật (tools/annotate.py của bạn + tools/SOURCES.md) → `node qa/lint.mjs --pages=<slug>` + `node qa/e2e.mjs --pages=<slug>` **0 ERROR 0 WARN** → review chéo bởi builder-a khi lead phối.

Yêu cầu riêng:
- `frontend-dataflow`, `routing-astar`, `voice-guidance`: đọc frontend **chỉ để mô tả**, KHÔNG sửa frontend/.
- `predictions-jsonl`: đọc vài dòng predictions.jsonl thật, nêu event_type có thật.
- `replay-ground-truth`: độ phủ thật (18/18 session, 41.625 cặp frame — verify trong `.analysis/verify-replay/*`), nêu rõ replay = baseline không phải GT accuracy.
- `failure-gallery`: mỗi lỗi 1 khối (hiện tượng / bằng chứng session+frame+cam / cơ chế nghi — ghi "suy luận" nếu chưa chứng minh bằng code / nhãn CONFIRMED·UNSURE·EXPECTED). Bắt buộc: duplicate track, phantom coasting burst, false detection vật-không-phải-xe, ID fragmentation (toi6, sang8), E-C-002 (link handoff-dormant), capture gap (toi5, thai7, thai4, thai1), xe đỗ sẵn không track (EXPECTED).
- **Sau Task 9 → Task 10** (4 interactive: roi, homography, occlusion, assignment-tùy-chọn) theo MEGAPLAN Task 10 — interface `TG.interactive.<name>.mount(container,{seed})`, DLT thuần JS, deterministic qua `TG.rng(seed)`, mở rộng `qa/e2e.mjs` test thao tác thật. Nếu trong lúc viết trang bạn rảnh chờ review thì được phép làm Task 10 song song.

## Ràng buộc cứng
- Chỉ ghi `algo-web-v2/` + `.analysis/algo-web-v2-redesign/`. CẤM sửa backend/frontend/docs; output/ chỉ đọc; không đụng file backend đang modified.
- Không commit/push, không `git add algo-web-v2`.
- Cơ chế không tồn tại thật → DỪNG, ghi INBOX-C.md + báo lead.
- Câu ≤30 từ, không `→` trong prose, số phải có `file:dòng`/`(minh họa)`, `N#/T#/ccm:/tc:` chỉ mục ⑦; không viết `(vi)` thủ công sau `[[term]]`.

Ghi PROGRESS.md. Bắt đầu ngay bằng Step A của `snapshot-api`.
