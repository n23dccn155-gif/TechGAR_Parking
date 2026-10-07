# PROGRESS — algo-web-v2 redesign

Lead: Devin (w1:p6). Builders: a=w1:p7, b=w1:p8, c=w1:p9.
Mỗi builder ghi tiến độ vào đây (append, ghi rõ ngày giờ + task + trạng thái + file liên quan). Inbox riêng: INBOX-A.md / INBOX-B.md / INBOX-C.md.

## Trạng thái phase
- **Phase hiện tại:** Task 0/1/2/3/4 DONE → **CỔNG #2 ĐÃ DUYỆT** (user ủy quyền). Task 6/8/9 dispatch: a=trang 1–9, b=trang 10–15, c=trang 16–23 rồi Task 10.
- Thứ tự: 0 → 1 → (2 ∥ 3) → 4 → CỔNG USER #2 → (6 ∥ 8 ∥ 9) → 10 → 11 → 12 → 13.

## Task 0 — backup (lead) — DONE
- `git-baseline.txt`: HEAD `5f581311` + 6 file backend modified (kết quả gid-reacquire, không đụng).
- `backup-old-v2/`: robocopy xong, **780/780 file** khớp.
- `backup-old-v2.sha256`: 780 hash.
- Tool check: cv2 5.0.0, numpy 2.4.6, **PIL có sẵn** trong venv backend; `@playwright/test` OK; node v24.18.0.

## Log
- (lead) Task 0 done → dispatch Task 1 cho builder-c.

## Task 1 — khung site + UI mới (builder-c) — đang làm
- Step 1 DONE (2026-10-06): fonts local — `npm pack @fontsource/inter@5.3.0` + `@fontsource/jetbrains-mono@5.3.0` (pub 2026-07-19, ~79 ngày > 7d), temp `tmp-fonts/` NGOÀI algo-web-v2. Copy 18 woff2 (2 family × 3 subset latin/latin-ext/vietnamese × 3 weight 400/600/700) + 2 LICENSE → `algo-web-v2/assets/fonts/`.
- Step 2 DONE: `css/tokens.css` — 18 @font-face (Inter+JBM × latin/latin-ext/vietnamese × 400/600/700) + tokens đúng plan (--accent #0b57d0, --fs 16px→15px mobile, --measure 72ch, --nav-w 280, --toc-w 200) + hard rules (radius 0, no italic).
- Step 3 DONE: `css/base.css` + `css/components.css` — topbar 52px, nav sticky 280px ≥1100px / drawer <1100px nút 44px, main ≤920px, toc phải ≥1280px, .sec ①–⑦, .tbl-wrap, .formula/.frac, .term/.tip, .badge-*, figure scroll-snap mobile, prev/next, glossary/search.
- Step 4 DONE (RED): `qa/schema.test.mjs` (28 checks: bad/valid + 17 mutation cases + illustrative/figure/registry/terms) + `qa/fixtures/valid-page.json`. `node qa/schema.test.mjs` → FAIL `ENOENT js/core/terms.js` (implementation chưa tồn tại — đúng lý do mong đợi).
- Step 5 DONE: cài `tg.js` (rút gọn: definePage/getPageDef/pageIds/defineQuickValues/getQuickValues/validatePage/esc/rng), `terms.js` (defineTerms/getTerm/termify/tooltip), `render.js` (renderPage 7 mục + buildToc), `router.js` (viết lại: #/ #/p/<id> #/glossary #/values #/journey #/search?q=, nav builder, drawer mobile), `manifest.js` (ghi đè: 6 groups + order 23 trang), `glossary-data.js` (6 seed terms), `quickvalues-data.js` (rỗng hợp lệ), `index.html` (shell mới — chỉ nạp file mới), `js/pages/_fixture.js`.
- Step 6 DONE: `node qa/schema.test.mjs` → **PASS 26/26** (`schema ok`). Playwright file:// smoke (tự kiểm, QA chính thức Task 2): desktop 1440×900 + mobile 390×844 → 7 section s1–s7 đúng thứ tự, nav 280px/toc ≥1280px hiện desktop, drawer+backdrop mobile, tooltip term hoạt động, term-first "Term (vi)" vs term-lặp abbr đúng, badges CONFIRMED/UNSURE/REJECTED, 0 console error, 0 request fail, hoverflow=0px mobile, search/glossary/values/overview routes OK. Shots: `qa/out/shot-{desktop,mobile,mobile2}.png`.
- Sửa trong lúc verify: (a) search.js buildIndex gọi `flat(x)` thiếu acc → pageerror, đã fix truyền mảng; (b) topbar tràn mobile → giấu search-box + brand small, toplinks overflow-x; (c) nav rỗng khi chưa có trang → thêm nhóm "Trang chung" cố định.

### Rulings (Task 1)
- `_fixture` id có dấu `_` nhưng schema regex `/^[a-z0-9-]+$/` → mở rộng thành `/^_?[a-z0-9-]+$/`, `_`-đầu = trang nội bộ không hiện nav. Chi phí nếu sai: fixture không validate được.
- Fixture `figures:[]` + `noFigureReason` thay vì ảnh giả → tránh request 404; nhánh figures được cover bởi `qa/fixtures/valid-page.json`.
- sources[] dùng field `ref` (schema) — coi như src-equivalent trong check "thiếu src/ref trừ illustrative".
- Nhóm trang suy từ Task 6/8/9: setup={homography,roi-mask,parking-slots}, single-cam={brightness..occlusion-watershed}, multi-cam={tracklet-descriptor,trajectory-reid,handoff-dormant,gid-conflict}, binding={parking-detector,slot-binder}, gate-frontend={snapshot-api..voice-guidance}, data={predictions-jsonl,replay-ground-truth,failure-gallery}.

## Task 1 — DONE (2026-10-06)
hash index.html (sha256): `0c757afaaf36c2553a099ea70ec7ed54c9db48a9594019522d4e24537cf5c478`
Không git add (algo-web-v2 untracked). js/content + js/pages cũ giữ nguyên trên disk.

### Files tạo/ghi đè trong Task 1
- `index.html` (ghi đè — shell mới)
- `css/tokens.css` (mới) · `css/base.css` (mới) · `css/components.css` (mới)
- `js/core/tg.js` (ghi đè/rút gọn) · `js/core/router.js` (ghi đè) · `js/core/render.js` (mới) · `js/core/terms.js` (mới) · `js/core/search.js` (mới)
- `js/manifest.js` (ghi đè) · `js/glossary-data.js` (mới) · `js/quickvalues-data.js` (mới)
- `js/pages/_fixture.js` (mới — xóa ở Task 12)
- `qa/schema.test.mjs` (mới) · `qa/fixtures/valid-page.json` (mới) · `qa/out/shot-*.png` (evidence)
- `assets/fonts/` (mới): 18 woff2 = 2 family × {latin,latin-ext,vietnamese} × {400,600,700} + `LICENSE-inter` + `LICENSE-jetbrains-mono` (fontsource 5.3.0, OFL)

Không giữ lại: cũ `js/core/{draw,player,pseudocode,ui}.js`, `js/app.js`, `js/content/*`, `js/pages/*` cũ, `css/app.css` — vẫn trên disk, không được nạp bởi index.html mới, dọn ở Task 12.

## Task 2/3 — dispatched builder-c (đang làm)

## Task 4 — trang mẫu R0 Homography (lead) — DONE, chờ CỔNG USER #2
- Step 1 DONE: `notes/homography.md` — bảng nguồn đầy đủ; **mọi giá trị ví dụ Gemini verify được trong code**, kèm phát hiện thêm `before_p95_symmetric_pixel_error = 19.394 px` (config:1972) → 2.658 px sau khi thêm V1–V4 (~7× tốt hơn).
- Step 2 DONE: `js/pages/homography.js` — 6 khối ③, 5 formula + 7 params ④, 2 figures ⑤ thật, `interactive:'homography'`, 4 limits ⑥, 17 sources ⑦.
- Step 3 DONE: +8 glossary terms (tất cả [[…]] resolve); quickvalues seeded 6 dòng; manifest sửa thứ tự theo SPEC §3.
- Figures DONE (lead tự viết spec + chạy annotate.py builder-c): `tools/figures/homography-cam{1,2}-points.json` → `assets/real/homography-{cam1,cam2}-points.jpg` (179.5KB/143.2KB), manifest.json cập nhật; polygon A–D vàng + V1–V4 xanh đúng pixel.
- Lead fixes trong lúc verify: (a) xóa double-gloss thủ công sau [[term]] ×5 chỗ — renderer tự thêm (vi); (b) `components.css` thêm `overflow-wrap:anywhere` cho `.src-list .ref` + `.f-src` + `.evid` + `.origin` + `.f-*` — sửa tràn ngang 82px trên 390px do path file:line dài; (c) src `two_camera.py:395`→`:394` (đúng dòng def).
- Step 4 DONE (manual probe, chờ harness Task 2 chính thức): `task4-probe.js` + shots trong `.analysis/algo-web-v2-redesign/task4-shots/` — 1440×900 + 390×844 cả hai FAILURES:none (7 section đúng thứ tự, img nw=1280, hOverflow 0, không border-radius/italic, font Inter+JetBrains load, tooltip hoạt động, 0 console error, 0 external request, file:// ok).
- Spot-verify src: ccm:676 (EMA 0.65/0.35) ✓ · config:1972 (before_p95 19.394) ✓ · config:1461 anchor bbox_center nằm trong range 1460-1468 ✓ · two_camera.py:387 (SLOT_MATCHING_MULTIPLES) ✓ · :447 (min(config,derived)) ✓.
- Giá trị ví dụ Gemini KHÔNG dùng được → không có (tất cả đều verify được). Lint/e2e chính thức chạy lại ở Task 10/13 khi qa harness xong.

## CỔNG USER #2 — ĐÃ DUYỆT (user ủy quyền) + 3 chỉnh R0 áp làm chuẩn
- `.sec p + p { margin-top:0.8em }` (components.css) — đoạn trong cùng khối không còn dính.
- homography.js: tách đoạn 3.1 đầu, tách 3 câu >30từ → **lint site 0 ERROR 0 WARN** (chuẩn mới cho mọi trang).
- `terms.js` tooltip ưu tiên phía TRÊN term (không che mục đang đọc); fallback dưới khi sát mép trên.
- Task 2/3 của builder-c (user ghi nhận trong file trên): lint+e2e harness DONE 0E/4W→0W, `annotate.py`/`extract_frames.py`/`SOURCES.md` DONE; figure specs user format lại (màu #ffd23f/#33a3ff, max_kb 240), ảnh regen 199.1KB/136.3KB + fixture-demo.jpg trong manifest.

## Phát hiện giữa chừng — config live bị đổi (2026-10-06 ~18:07)
- `git status` lệch baseline Task 0: +3 file tracked modified: `config/roi_mask_cam1.json`, `roi_mask_cam2.json`, `two_camera.shared_cm_01.json`; attempt mới `cal-20261006-180750-46035b9a` (calibration live mới — có vẻ user chạy lại hiệu chuẩn, KHÔNG phải builder).
- **Chính sách pin snapshot:** trang trích số gắn tên bản cụ thể; src trỏ artifact bất biến `attempts/<cal-id>/calibration_draft.json` thay vì config live; prose không nói "đang dùng" cho bản cũ.
- Đã áp cho homography.js: const DRAFT, re-point 4 chỗ (p95 trước/sau, fit p95, max_error_cm, 2 sources) — lint 0E/0W.
- Còn treo: `roi-mask` note + figure + interactive `roi.js` đang dùng polygon ROI CŨ (config giờ khác); `quickvalues shared_map_anchor` vẫn đúng (live :1461 vẫn bbox_center). Sẽ refresh/kiểm lại ở Task 13 trước khi chốt.

## Step F — review chéo dispatched (2026-10-06)
- builder-a → review 8 trang Task 9 của builder-c → REVIEW-<slug>.md
- builder-b → review 8 trang Task 6 của builder-a → REVIEW-<slug>.md
- builder-c → review 6 trang Task 8 của builder-b + **backfill 7 notes Task 9 thiếu trên đĩa** + sau đó Task 11 (glossary merge/quickvalues/overview/journey/search)
- Lead tự verify: lint 24 trang 0E/0W ✓ · e2e 132 rows PASS (file+http × 1440/390) ✓ · spot-check handoff-dormant E-C-002 + failure-gallery nhãn ✓

## Dispatch 2026-10-06 — đã herdr-prompt, cả 3 working
- **builder-a (w1:p7)**: Task 6 — brief `briefs/TASK6-a.md`; 8 trang mới roi-mask→occlusion-watershed; review chéo bởi builder-b.
- **builder-b (w1:p8)**: Task 8 — brief `briefs/TASK8-b.md`; 6 trang tracklet-descriptor→slot-binder; E-C-002 bắt buộc ở handoff-dormant; review bởi builder-c.
- **builder-c (w1:p9)**: Task 9 rồi Task 10 — brief `briefs/TASK9+10-c.md`; 8 trang snapshot-api→failure-gallery; review bởi builder-a.

## Task 2 — QA harness — DONE (2026-10-06, builder-c)

### Files tạo
- `qa/lib/sources.mjs` — resolver `file[:dòng[-dòng]][ (Symbol)]`: parse ref, resolve repo-root `D:\TechGar2` trước, fallback site-relative `algo-web-v2/` khi không tồn tại ở root; chặn path thoát repo; check dòng ≤ len file, sym trong ±5 dòng.
- `qa/lint.mjs` — `node qa/lint.mjs [--files=a,b] [--css=x.css] [--pages=a,b]`; exit≠0 khi có ERROR. Nạp page = đúng các `<script src="js/pages/*">` trong index.html (file cũ giữ-tới-Task-12 không lint). CSS = đúng các `<link>` trong index.html + `--css` thêm (không quét `css/app.css` dead-file).
- `qa/e2e.mjs` — `node qa/e2e.mjs [--file-only] [--pages=a,b] [--sabotage]`; log `qa/out/e2e.log`; createRequire từ `frontend/package.json`; mode file:// + http://127.0.0.1:8799 (python http.server own PID, taskkill sau); viewport 1440×900 + 390×844.
- Fixtures: `bad-long-sentence`, `bad-internal-symbols`, `bad-term`, `bad-src`, `bad-no-figure`, `bad-nav`, `bad-dup-a/b` (json) + `bad-css.css`; hợp lệ `valid-page.json`.

### 10 luật lint — chứng minh bắt được (bad fixtures → ERROR đúng luật)
1. schema TG.validatePage — `bad-no-figure`: "figures rỗng ⇒ noFigureReason" ✓
2. câu >30 WARN / >45 ERROR — `bad-long-sentence` 46 từ → ERROR ✓
3. câu cụt <4 từ không punctuation / `→` cụm → WARN, ≥3/trang → ERROR — `bad-src` 4 stub → ERROR ✓ (nhãn how[].name + figures[].alt KHÔNG tính là câu — chỉ lint luật 4/5)
4. `N\d| T[123] | ccm: | tc:` ngoài sources/pseudocode → ERROR — `bad-internal-symbols` (N5, T2, ccm:, tc:) ✓
5. [[Term]] không trong glossary → ERROR; term thiếu vi/def/role/example/page hoặc page không tồn tại → ERROR — `bad-term` ✓
6. params/values thiếu src (trừ illustrative có "(minh họa)") → ERROR — `bad-src` params[0] 0.78 + params[3] ✓
7. file:dòng resolve: file mất / dòng > len / sym lệch ±5 → ERROR — `bad-src` (missing file + :99999 > 205 dòng) ✓
8. CSS: `border-radius≠0` (kể cả `0 !important` hợp lệ qua normalize), `font-style:italic|oblique`, nền kem/vàng (r>g>b, r-b≥12, r≥235), `--text`/`--bg` contrast ≥4.5 → ERROR — `bad-css.css` (6px + italic + #f5f0e1) ✓
9. dup id/order + prev/next trỏ id không tồn tại → ERROR — `bad-nav`, `bad-dup-a/b` ✓
10. figures[].src tồn tại + ≤260KB + manifest.json entry có origin (origin lệch → WARN) — `bad-src` ảnh 404 ✓

### Verify
- `node qa/lint.mjs` (site): **0 ERROR, 4 WARN** (homography 3 câu >30 + 1 formula-note cụt — chấp nhận, sẽ gia cố prose ở task nội dung)
- `node qa/lint.mjs --files=qa/fixtures/valid-page.json` → **0 ERROR 0 WARN**
- Mọi bad fixture → exit 1 với đúng luật dự kiến.
- `node qa/e2e.mjs` → **PASS**: 28 check (2 trang × 2 mode × 2 viewport + routes + nav + drawer + search + glossary-count), 0 console.error/pageerror/requestfailed/blocked-external; mọi img loaded; không hoverflow (đo ngoài .tbl-wrap/pre); 7 section s1..s7 đúng thứ tự cả hai trang.
- `node qa/e2e.mjs --file-only --sabotage` → inject `console.error` vào _fixture.js → harness bắt được, file được restore nguyên (grep SABOTAGE = 0).
- Fix trong lúc dựng harness: `e2e` scroll-to-load cho `img[loading=lazy]`; topbar-search guard visible (mobile ẩn); `location0` helper dư bỏ; `#/` h1 thật là "TechGAR Smart Parking — pipeline".

## Task 3 — pipeline ảnh thật — DONE (2026-10-06, builder-c)

### Files tạo
- `tools/extract_frames.py` — trích 1 frame PNG từ `<session>/{raw,debug}_cam<N>.mp4` (resolve session theo path hoặc tên dưới experiment_test/output; xác nhận frame-index sau seek).
- `tools/annotate.py` — đọc spec JSON → lấy ảnh (image_path HOẶC extract_frames qua video) → vẽ circle/arrow/box/polygon + nhãn nền tối (Segoe UI fallback — PIL không đọc woff2) → JPEG auto-quality ≤ max_kb → ghi manifest entry {file, origin, source, sha256, session, cam, frame}.
- `tools/test_annotate.py` — RED trước (`ModuleNotFoundError`), sau implement PASS: ảnh tổng hợp 640×360 + circle/arrow/nhãn Việt → JPEG hợp lệ ≤ max_kb + manifest entry đúng (tự dọn artifact).
- `tools/figures/homography-cam1-points.json`, `tools/figures/homography-cam2-points.json` — spec 8 điểm hiệu chuẩn THẬT từ `config/two_camera.shared_cm_01.json` (`rectangle_line_fit.points[].camN_pixel`); nguồn ảnh = `config/shared_map_01/attempts/cal-20260927-160513-decd3099/capture_camN.png` (đúng calibration_id của config đang dùng).
- `tools/SOURCES.md` — danh mục nguồn: session dirs có raw_cam{1,2}.mp4, thư mục attempt cal-20260927, bảng 8 điểm pixel, quy ước origin/font.

### Mẻ ảnh Homography (Step 5)
- `assets/real/homography-cam1-points.jpg` (199.1KB q92) — origin `shared_map_01/cal-20260927/f0/cam1`
- `assets/real/homography-cam2-points.jpg` (136.3KB q92) — origin `shared_map_01/cal-20260927/f0/cam2`
- 8 điểm vẽ trên frame hiệu chuẩn THẬT có xe đỗ: A(1010,217) B(974,68) C(688,68) D(690,217) V1(386,178) V2(512,176) V3(668,174) V4(876,176) cam1; A(329,100) B(293,258) C(633,254) D(631,98) V1(948,124) V2(818,128) V3(654,133) V4(441,135) cam2 — KHÔNG tự đặt; origin khớp `figures[].origin` trong homography.js.
- Verify mắt: marker trùng vị trí `marked_camN.png` của tool hiệu chuẩn gốc; cam2 mirrored đúng caption "hai camera đối diện"; nhãn Việt render đúng bằng Segoe UI.
- `assets/real/manifest.json`: 3 entry (fixture-demo.jpg synthetic + 2 homography) đều có origin+sha256.

### Gates tổng sau Task 2+3
- `python tools/test_annotate.py` → PASS (1 test)
- `node qa/lint.mjs` → 0 ERROR / 4 WARN
- `node qa/e2e.mjs` (file + http) → PASS 28/28
- Không đụng backend/frontend/docs; experiment_test/output chỉ đọc; algo-web-v2 vẫn untracked (không git add).

## Task 6 (nhóm 1+2, builder-a) — trang 1: roi-mask — DONE QA (2026-10-06)

### Step A–F
- **A** `notes/roi-mask.md` — 21 dòng giá trị xác minh: mask_roi.py (target_points=4, fill 0.3, schema JSON), two_camera.py (CLI 1762-1782, load+fillPoly 2205-2230, tracking-roi 2412-2428, live editor 3123-3147), motion_tracker.py (context band 794-816, support gate 850-921, anchor gate 976-1010), parking_detector.py (fallback union 174-184). 4 case lỗi cho ⑥: E-C-001 CONFIRMED, E-B-003/006 UNSURE, E-C-003 UNSURE, E-A-039 CONFIRMED-cosmetic.
- **B** `js/pages/roi-mask.js` — đủ 7 mục schema R0: fn/why paras 2 / how 6 bước (vẽ tay → JSON→mask → strict+band → support gate → anchor gate+telemetry → live editor) / 2 formulas (required_support, band dilate) / 6 params / 5 limits / 15 sources / pseudocode offline+startup+per-frame / `interactive:"roi"` / `order:1, prev:null, next:parking-slots`.
- **C** glossary +1 term `context band` (page roi-mask); quickvalues-data.js KHÔNG sửa tay (file ghi Task 11 sinh từ params[] — ghi chú dòng 2-3).
- **D** figures ×2: `tools/figures/roi-cam1.json` + `roi-cam2.json` — polygon THẬT từ config/roi_mask_cam*.json vẽ trên capture_camN.png của cal-20260927; output roi-cam1.jpg 209KB + roi-cam2.jpg 146KB, manifest origin `shared_map_01/cal-20260927/f0/camN`. Verify mắt: polygon khớp mép tấm bãi, watermark droidcam.app nằm TRONG ROI cam2 (caption giải thích tie-in E-A-039).
- **E** `node qa/lint.mjs --pages=roi-mask` → **0 ERROR 0 WARN** (sửa 2 câu >30 từ); `node qa/e2e.mjs --pages=roi-mask` → **PASS** file+http × 2 viewport, 0 console.error/pageerror/requestfailed/blocked-external, imgs=2 loaded.
- **F** index.html nạp roi-mask.js sau homography.js; snapshot-api.js của builder khác giữ nguyên.

### Sẵn sàng review chéo
- Trang đầu tiên nhóm mới — chờ builder-b/lead review theo brief trước khi scale 7 trang còn lại.

### Task 6 — trang 2: parking-slots — DONE QA (2026-10-06)

- **A** `notes/parking-slots.md` — picker tool (order_points, ROW+NN id, atomic save), schema 30 ô/cam (D/E/F + A/B/C), _compute_rois 3 lớp mask (local/analysis/core), pipeline LAB-L + 25-variant ensemble, required_votes=12, core rescue, dwell machine (2 đọc/0.5s enter, 3 đọc/1.0s exit), async 2Hz pool 2 worker.
- **B** `js/pages/parking-slots.js` — how 5 bước, 3 formulas, 8 params, 5 limits (vision-occupied-without-tracking EXPECTED mọi session; toi6 latch CONFIRMED), 16 sources, pseudocode. `order:2, prev:roi-mask, next:homography`.
- **C** không term mới (dùng [[track]]); quickvalues vẫn để Task 11.
- **D** figures ×2: `slots-cam1/2.jpg` — cả 30 polygon THẬT từ config vẽ trên capture_camN.png (215KB/153KB), label mẫu F01/E05/D10 + A01/B05/C10.
- **E** lint **0/0** (fix: multi-range `a-b,c-d` refs không được hỗ trợ — parseRef chỉ nhận một range; tách câu >30 từ); e2e PASS file+http.
- **F** index.html đã nạp. Báo lead: roi-mask + parking-slots sẵn review chéo (builder-b) — hai trang đầu nhóm 1.

## Task 9 (nhóm 5+6, builder-c) — trang 16+17: snapshot-api, gate-session — DONE QA (2026-10-06)

### T9-1 snapshot-api (đã ghi trước; recap)
- `notes/snapshot-api.md`, `js/pages/snapshot-api.js`, figure `snapshot-api-debug-cam1-f600.jpg` (debug_cam1 f600), terms Runtime snapshot + schema version, quickvalues 8001/2/8.0/100. lint 0E/1W→sửa; e2e PASS file.

### T9-2 gate-session — Step A–F
- **A** `notes/gate-session.md` — đọc gate_session_controller.py 912 dòng + session_manager.py + gate_zones.json: poll 0.25s/timeout 3s, 4 guard đầu vào (v2+fresh+runtime_id+unit), _fresh_live (cam age ≤5s, published ±5s), crossing = đoạn p1–p2 + check_line_intersection + dấu cross(v_xe,v_gate), direct vs recovered entry (recent_observed_path ≤12 mẫu, 2 mẫu liên tiếp cùng cam+lid, gap ≤1s), state machine WAITING_FOR_SCAN→…→EXIT_NAVIGATION→xóa, QR 120s chỉ lọc waiting list, episode v2 authoritative (cursor idempotent, conflict diagnostics), REST 8000 + _mutate_session (expected_revision + actionReceipts 32).
- **B** `js/pages/gate-session.js` — how 6 bước, 3 formulas, 7 params, 4 limits (QR-hết-hạn-vẫn-claim CONFIRMED; exit chỉ xóa khi observed; unit mismatch → crash UNSURE; legacy heuristic song song), 14 sources, pseudocode. `order:17, prev:snapshot-api, next:frontend-dataflow`.
- **C** glossary +2: `parking episode`, `idempotency`; quickvalues +5 (poll 0.25, port 8000, QR 120, gap 1.0s, departure 0.25).
- **D** figure `gate-session-cam2-gates.jpg` (136KB): entry/exit từ gate_zones.json chiếu world→px qua nghịch đảo `camera_transforms.cam2` (cam1: cả 2 gate ngoài khung — ghi trong caption). Cam1 px A→world ~(0,0) xác nhận transforms là px→world. origin `shared_map_01/f0/cam2`. Mở rộng annotate.py: `label_at` đặt góc nhãn cố định (test_annotate vẫn PASS).
- **E** lint: sửa 2 câu >45 từ + 4 câu chứa `→` trong prose (luật3) → `--pages=gate-session` **0E/0W**; e2e **PASS file+http × 2 viewport**, imgs=1.
- **F** index.html nạp sau snapshot-api.js.

### Fix phát sinh (QA harness)
- `qa/lib/sources.mjs`: hỗ trợ multi-range `file:a-b,c-d` (builder-a dùng trong parking-slots); mỗi range validate riêng, sym window min-5..max+5. Full lint sau fix: **6 trang/defs, 3 css — 0 ERROR, 0 WARN**.

### Task 6 — trang 3: brightness — DONE QA (2026-10-06)

- **A** notes/brightness.md — _brightness_shift lưới mẫu 128 (comment perf 17ms→0.3ms), _motion_between bù shift, MOG2 700/32/detectShadows, admit-127 có điều kiện, _cast_shadow_metrics + _is_cast_shadow 4 điều kiện (atten 0.32-0.62, chroma 0.10, resid 0.08, explained 0.75), bg snapshot 10f trước apply, runtime flags two_camera:2393-2394.
- **B** js/pages/brightness.js — 4 bước how, 2 formulas, 6 params, 4 limits (scalar global-only, fail-open, 127 double-edge, E-C-007 boundary).
- **C** glossary +2: MOG2 (page brightness), cast shadow (page brightness).
- **D** figures ×2 đối lập exposure: brightness-high-exposure.jpg (sang8 cam2 f600, rửa sáng, 85KB) + brightness-normal-exposure.jpg (thai1 cam1 f1500, 177KB) — verify mắt đúng ý đồ.
- **E** lint **0/0** (sửa 8 câu >30 từ); e2e PASS.
- **F** index.html nạp.

### T9-3 frontend-dataflow — DONE QA (2026-10-06)
- **A** `notes/frontend-dataflow.md` — đọc 9 file frontend (read-only): poll 200ms snapshot dedupe+backoff 2s, liveRuntimeError mirror _fresh_live, cursor frame/runtimeId, adapter unknown fallback, affine worldToSvg (≥3 neo, cache layout, gate 1s), commit guards (GET-trong-POST stale, conflicting revision, expected_revision+action_id), resolveSessionParking 10-kind tree.
- **B** `js/pages/frontend-dataflow.js` — how 6 bước, 2 formulas, 7 params, 4 limits, 12 sources. `order:18, prev:gate-session, next:routing-astar`.
- **C** không term mới (dùng [[Runtime snapshot]], [[schema version]], [[parking episode]], [[idempotency]]); quickvalues để Task 11.
- **D** figure `frontend-dataflow-map.jpg` (207KB) từ `frontend/artifacts/screenshots/1440x900-c10-navigation.png` — UI driver thật; origin `frontend_artifacts/f0/cam0`. Đo pixel xác nhận vị trí marker.
- **E** annotate.py +`label_at` (đã thêm ở T9-2); lint `--pages=frontend-dataflow` **0E/0W**; e2e **PASS file+http ×2 viewport**, imgs=1.
- **F** index.html nạp sau gate-session.js.

### Task 6 — trang 4: motion-detection — DONE QA (2026-10-06)

- **A** notes/motion-detection.md — mask pipeline _detect L759-1086; temporal refs theo tuổi 0.45–2.25×T (T=0.25/0.80s), fallback gap 3/9, timestamp lùi → clear history; mask = fg AND dilate(motion,17×17) AND roi_context → open → close join 5×5; prefilter 350/22/18; priority regions từ binder (350/50/0.03).
- **B** js/pages/motion-detection.js — 4 how, 2 formulas, 7 params, 4 limits (xe đứng yên vô hình by-design, cold-start mù, join-kernel tension, E-C-006).
- **C** glossary: đủ term sẵn (MOG2, foreground mask, ROI, context band, track).
- **D** figure motion-moving-car.jpg (thai1 cam1 f1500, 205KB): cyan xe chạy có motion / đỏ xe đỗ foreground-motion-0 — verify mắt đúng.
- **E** lint **0/0** (sửa 2 câu >30 từ); e2e PASS.
- **F** index.html nạp.

### Task 6 — trang 5: contour-filtering — DONE QA (2026-10-06)

- **A** notes/contour-filtering.md — chuỗi gate tuần tự L836-1085; giant 0.22, oversized 0.30/0.42/0.12 + telemetry + xoá contour, aspect [0.25,5] silent, min_area 650/350, motion px/fill 100/5% (runtime; class 160/8%; priority 50/3%); echo dedup IoU≥0.25+Bhat≤0.12+_same_motion_echo (0.45/0.22/14px), clean-owners ≥3 obs; echo-of-matched-track sau assign L2318-2334.
- **B** js/pages/contour-filtering.js — 4 how, 2 formulas, 6 params, 4 limits (E-C-007 vật lạ thành detection, clean-owner cần 3 obs, trần cực đoan, aspect silent).
- **C** glossary: đủ (HSV histogram, Bhattacharyya distance, track, bounding box, ROI, cast shadow).
- **D** figure contour-giant-blob.jpg (bt cam2 f1422, 142KB): blob 223×247 qua mọi gate = E-C-007 — bbox lấy đúng từ predictions.
- **E** lint **0/0** (sửa 4 câu >30 từ); e2e PASS.
- **F** index.html nạp.

### T9-4 routing-astar — DONE QA (2026-10-06)
- **A** `notes/routing-astar.md` — laneGraph (3 làn, right 1-chiều vào→ra, connectors chỉ ở 2 Y), A* findRoute (h admissible qua min-edge scale, tie-break f→g→nodeOrder), routeFromPos (projection ≤60, cạnh tạm 1-chiều), findInboundRouteFromPos KHÔNG fallback dù comment hứa, off-route call-site=80 (hàm default 75), auto-reroute ≤3 alternatives qua selectSessionSpot.
- **B** `js/pages/routing-astar.js` — how 4 bước, 3 formulas, 5 params, 4 limits, 10 sources. `order:19, prev:frontend-dataflow, next:voice-guidance`.
- **C** glossary +[[A*]], +[[off-route]].
- **D** figure `routing-astar-map.jpg` (246KB) từ screenshot c10 thật; origin `frontend_artifacts/f0/cam0`.
- **E** lint `--pages=routing-astar` **0E/0W**; e2e **PASS file+http ×2 viewport**, imgs=1. Fix schema: kind=illustrative phải kèm "(minh họa)", sources cần kind, formulas/params bắt buộc.
- **F** index.html nạp sau frontend-dataflow.js.

### T9-5 voice-guidance — DONE QA (2026-10-06)
- **A** `notes/voice-guidance.md` — VoiceManager 4 luật chặn (cooldown 6s, urgent cắt <2s block), getNavigationInstruction (arrival r35, cos 0.93 ~20°, cross product Y-xuống, lookahead 150), checkIsOffRoute (App override 80 vs default 75 — lệch với tài liệu), 4 call site speak + render condition.
- **B** `js/pages/voice-guidance.js` — how 3 bước, 2 formulas, 5 params, 4 limits (gồm edge isSpeaking-không-API), 6 sources. `order:20`.
- **C** không term mới (dùng [[off-route]] của T9-4).
- **D** figure `voice-guidance-map.jpg` (258KB) — banner chỉ dẫn + bán kính 35 + góc cua trên screenshot thật; origin `frontend_artifacts/f0/cam0`.
- **E** lint **0E/0W** (sau khi tách 3 câu >30 từ); e2e **PASS file+http ×2 viewport**, imgs=1.
- **F** index.html nạp sau routing-astar.js.

### Task 6 — trang 6: kalman-lapjv — DONE QA (2026-10-06)

- **A** notes/kalman-lapjv.md — KF(4,2) const-velocity noise [2,2,12,12]/8I; max_prediction_age 0.40s → stale anchor ghim last measured; reacquire 1.5/3.0s; gate speed·(invis+1)·2+extent (floor 24/extent); app ≤0.30/0.22; area [0.35,2.80]; cost .45/.25/.20/.10; lapjv cost_limit 0.90; merged-freeze 1.60×; margin 0.08×(2−lineage); clear run 3f.
- **B** js/pages/kalman-lapjv.js — 4 how, 2 formulas, 9 params, 4 limits (const-velocity, stale-anchor false-merge link F0/F1, coasting trade-off, E-B-003/006 UNSURE 140f).
- **D** figure kalman-coast.jpg (thai1 cam1 f1407, 219KB): lid18/19/20 frozen_ambiguous coasting, velocity arrow −14px/f — data từ predictions.
- **E** lint **0/0** (sửa 6 câu >30 từ); e2e PASS.
- **F** index.html nạp.

### T9-6 predictions-jsonl — DONE QA (2026-10-06)
- **A** `notes/predictions-jsonl.md` — builder v3, _RollingEventDelta (suffix/prefix trên id+sha1), schema phẳng 18 trường, đọc file thật thai7: 2872 dòng, 44 identity + 19 parking event_type, 60 slot + ≤12 obs/frame.
- **B** `js/pages/predictions-jsonl.js` — how 4 bước (record tự chứa, obs/slots, rolling delta, baseline-không-GT), 2 formulas, 4 params, 4 limits. `order:21`, `figures:[]` + noFigureReason.
- **C** không term mới.
- **D** không figure (trang định dạng dữ liệu).
- **E** lint **0E/0W** (fix ref thiếu prefix `backend/main_detect/`); e2e **PASS file+http ×2 viewport**, imgs=0.
- **F** index.html nạp sau voice-guidance.js.

### Task 6 — trang 7: track-lifecycle — DONE QA (2026-10-06)

- **A** notes/track-lifecycle.md — TrackStatus TENTATIVE/CONFIRMED/LOST; ID đơn điệu fragment-scoped (comment reuse-ID bug); confirm = visible≥3 ∧ disp≥12px từ first_observation (priority 2obs/3px); matched EMA 0.75/0.25 + merged freeze; unmatched → coasting/frozen_ambiguous/suppressed_twin + roi_edge_starved; expire 90f hoặc 4.5s (1.5×3.0); expire TENTATIVE im lặng; suspend_track cho xe đỗ; output chỉ CONFIRMED∪LOST.
- **B** js/pages/track-lifecycle.js — 4 how, 2 formulas, 7 params, 4 limits (xe đỗ không confirm được by-design, lid fragment-scoped, tentative chết im lặng, E-C-006).
- **D** figure lifecycle-confirmed.jpg (thai1 cam1 f1500, 201KB): lid18 confirmed — cùng track từng frozen_ambiguous f1407 (figure kalman), chuỗi đời 96f.
- **E** lint **0/0** (sửa 4 câu >30 từ); e2e PASS.
- **F** index.html nạp.

### Task 6 — trang 8: occlusion-watershed — DONE QA (2026-10-06)

- **A** notes/occlusion-watershed.md — OcclusionGuard 232 dòng: prepare pair (≥3 clean obs, overlap ≤0.20, gap ≤0.4·hypot) → covering_group (chứa centers pad 0.15 + area ≥1.6·median, check TRƯỚC filters) → activate (frozen, expires last clean +3.0s) → watershed partition 2-member (distanceTransform, seed ≤0.25·hypot, seeds ≥0.2·min, regions ≥20pts & bbox/ref ∈[0.35,1.8]) → gate_assignments (swapped−direct ≥2·margin, ≥3 frame → recovered, appearance_trusted=False) → _unresolved_merged_birth veto.
- **B** js/pages/occlusion-watershed.js — 4 how, 2 formulas, 7 params, 4 limits (2-member only, seed phụ thuộc Kalman, coasting trade-off, E-B-003/006 UNSURE); interactive:"occlusion".
- **D** figure occlusion-cluster.jpg (thai1 cam1 f1407, 185KB): cụm 2 xe tối + track coast — cùng frame với kalman-coast, kể góc nhìn ambiguous.
- **E** lint **0/0** (sửa 7 câu >30 từ); e2e PASS.
- **F** index.html nạp.

## Task 6 nhóm 1+2 — HOÀN TẤT 8/8 (2026-10-06)

- roi-mask, parking-slots, brightness, motion-detection, contour-filtering, kalman-lapjv, track-lifecycle, occlusion-watershed — tất cả lint 0/0 + e2e PASS.
- Site-wide: `lint.mjs` 19 trang **0 ERROR 0 WARN**; `e2e.mjs` full site PASS (24 routes, 0 console/page/request error, 0 blocked-external).
- Glossary +3 term mới (context band, MOG2, cast shadow); 8 notes file; 8 figure spec; 8 asset real mới (85–220KB, đều có manifest provenance).
- Chờ REVIEW từ lead/bên kia — hiện chưa có file REVIEW-* nào.

### T9-7 replay-ground-truth — DONE QA (2026-10-06)
- **A** `notes/replay-ground-truth.md` — 18/18 session chạy hết, exit 0; 41,625 cặp frame (83,250 ảnh); `pred_lines == src_frames`; replay là baseline KHÔNG phải độ chính xác GT (GT CSV gần như chỉ header); nhịp theo `frame_timestamps.csv`.
- **B** `js/pages/replay-ground-truth.js` — 4 how (khuôn phát lại, nhịp & độ phủ, baseline-vs-GT, đã/chưa kiểm chứng), 2 formulas, 4 params, 4 limits. `order:22`, `next:"failure-gallery"`.
- **C** không term mới.
- **D** figure `replay-ground-truth-sheet.jpg` (từ sheet replay-output, tối giản 1 annotation) — sửa 2 lần: tọa độ source 1920×1080 (không phải mặc định), `max_kb` 300→250.
- **E** lint **0E/0W** (fix 1 câu >30 từ + ERROR ảnh 294KB>260KB); e2e **PASS** file+http ×2 viewport.
- **F** index.html nạp sau predictions-jsonl.js.

### T9-8 failure-gallery — DONE QA (2026-10-06)
- **A** `notes/failure-gallery.md` — đọc `.analysis/verify-replay/ERRORS-SUMMARY.md` (canonical V6) + ERRORS-A/B/C; map đủ 7 lớp lỗi bắt buộc của brief.
- **B** `js/pages/failure-gallery.js` — 7 how-block F1–F7, mỗi block: hiện tượng / bằng chứng session+frame+cam / cơ chế nghi ghi "suy luận" khi chưa chứng minh bằng code; nhãn CONFIRMED×6, harm UNSURE (E-C-002), EXPECTED (pre-parked). 1 formula + 4 params + 4 limits. `order:23`, `next:null`.
- **C** không term mới.
- **D** 2 figure mới: `failure-dup-track.jpg` (thai3 cam1 ~f1350, sheet_0021 — xe xanh 2 track lid9+lid10; đo pixel trực tiếp 2 vòng sửa tọa độ) + `failure-coasting-burst.jpg` (toi4 cam2 f51, ~24 box vàng coasting trên sàn trống). Đều ≤250KB.
- **E** lint **0E/0W** (fix 4 câu >30 từ); e2e **PASS** file+http ×2 viewport, imgs=2.
- **F** index.html nạp sau replay-ground-truth.js.

## Task 9 nhóm 5+6 — HOÀN TẤT 8/8 (2026-10-06, builder-c)

- snapshot-api → gate-session → frontend-dataflow → routing-astar → voice-guidance → predictions-jsonl → replay-ground-truth → failure-gallery — tất cả lint **0E/0W** + e2e **PASS** (file+http × 1440×900 + 390×844).
- Site-wide sau Task 9: `lint.mjs` **21 trang/defs 0 ERROR 0 WARN**.
- Chuỗi prev/next: đúng thứ tự manifest (order 16→23). Dangling theo spec: `snapshot-api.prev→slot-binder` (builder-b chưa nộp, giữ nguyên như builder-a `handoff-dormant.next→gid-conflict`) — render an toàn, tự liền khi builder-b nộp.
- Glossary +6 term (Runtime snapshot, schema version, parking episode, idempotency, A*, off-route); 8 notes; 8 figure spec; 8 asset real mới đều có manifest provenance.
- `sources.mjs`: mở rộng parseRef hỗ trợ multi-range `file:a-b,c-d` (format builder-a dùng).
- `annotate.py`: thêm `label_at` cho mọi loại shape (nhãn đặt tự do, cần cho figure gate/routing/failure).
- Chờ Task 10 (interactive roi/homography/occlusion/assignment + e2e mở rộng).

## Task 10 — Tương tác — DONE (2026-10-06, builder-c)

**Files tạo:**
- `js/core/interactive/roi.js` — kéo 4 đỉnh polygon (pointer events + setPointerCapture, hit r=24px ≥16), vùng ngoài phủ xám evenodd, % diện tích shoelace live. Data sao nguyên `roi_mask_cam1.json` (1276,688 / 1216,144 / 156,143 / 77,657). Reset về polygon thật.
- `js/core/interactive/homography.js` — hai pane cam-px / map-cm, 8 cặp điểm thật của cal-20260927-160513-decd3099 (A–D đo thước 20×30 từ calibration_points.csv; V1–V4 vị trí cm suy qua `camera_transforms.cam1`, ghi rõ "minh họa"). Click marker toggle cặp ở cả hai pane; ≥4 → DLT thuần JS (Hartley normalize + Gauss-Jordan 8×8, least squares); hiển thị max/p95 reprojection cm + so với fit gate 2.0cm + bảng sai số từng điểm + chấm chiếu trên map. Nút "Bỏ điểm vạch làn" → chỉ A–D → sai số kiểm chứng V tăng (đúng câu chuyện p95 19.394→2.658px của trang).
- `js/core/interactive/occlusion.js` — 1 slider khoảng cách mô hình đúng state machine occlusion_guard.py: gap ≤0.4·hypot (L88) → PAIR; contour bao ≥1.6×median (L112) → GROUP MỞ/đóng băng; blob <1.6× → CHỒNG SÂU; d >3·hypot (L99) → QUÁ XA. Live: chồng% (ngưỡng 20% L85), gap px, cover ratio, seed-gap 0.2·min.
- `js/core/interactive/assignment.js` — ma trận 4×4 seeded `TG.rng`; cell ≥0.90 khóa như cost 10.0 thật (cost_limit L1908); tối ưu duyệt 4! (≡ Hungarian cỡ này) vs tham lam greedy; tô xanh tối ưu + viền cam chỗ greedy lệch; nút "seed kế". `kalman-lapjv.interactive="assignment"` (optional — đã làm vì 3 component chính xong).
- `render.js` — mount thật: `TG.interactive[name].mount(ph,{seed:TG.hashSeed(def.id+":"+name)})`; giữ `data-interactive`.
- `index.html` +4 script (sau search.js, trước data); `components.css` +`.itv-*` (radius 0, không italic, bảng cost, state ok/warn/bad).
- `qa/e2e.mjs` +`checkInteractive`: roi kéo đỉnh→% đổi (scrollIntoView trước — fix bb.y ngoài viewport); homography click 8 tắt/bật→"cần ≥4"/cm hữu hạn, nút bỏ V→kiểm chứng+minh họa, reload→readout giống hệt; occlusion slider 30/65/95→4 trạng thái phân biệt (CHỒNG SÂU/GROUP MỞ/PAIR/ĐỘC LẬP); assignment 16 cell + reload→ma trận giống hệt (determinism).

**Bug sửa trong lúc verify:**
- `solve8` return `r[i][i]` → `r[i]` (NaN lan khắp SVG, 832 console error).
- `greedy()` đảo điều kiện: trả object khi còn hàng trống → `p.indexOf(-1)<0`.
- CSS `.itv-lbl{fill}` đè attribute → label map-pane vô hình trên nền sáng; bỏ fill khỏi CSS, giữ `!important` cho trạng thái off.

**Verify:**
- `node qa/lint.mjs` — 22 trang **0 ERROR 0 WARN** (gid-conflict builder-b đã nộp; WARN cũ của họ đã hết).
- `node qa/e2e.mjs --pages=roi-mask,homography,occlusion-watershed,kalman-lapjv` — **PASS** file+http ×2 viewport.
- `node qa/e2e.mjs` full — **124 rows 0 issues, 0 console/page/request error** (22 trang + 4 itv checks ×2 mode ×2 viewport, 189.5s).
- Ảnh chụp `qa/out/shot-itv-{roi,homo,occ,assign}.png` — kiểm trực quan OK; homography fit 8 cặp: max 0.169cm / p95 0.095cm — hợp lý so với chất lượng cal thật (cross-cam 0.398cm).
- Determinism xác nhận bởi test reload trên homography + assignment.

**Còn lại:** Task 11 (glossary merge + quickvalues auto-gen + search test + overview/journey) — phần builder-c tiếp theo trong MEGAPLAN; builder-b còn nợ `parking-detector`, `slot-binder`.

## Task 8 nhóm 3+4 — HOÀN TẤT 6/6 (builder-b, tiếp 2026-10-06)

6 trang `tracklet-descriptor → trajectory-reid → handoff-dormant → gid-conflict → parking-detector → slot-binder` đều Step A–F đầy đủ: notes/*.md → trang → glossary → ảnh thật annotate.py → index.html → lint/e2e từng trang → review.

- **Evidence mới cho 2 trang cuối (hiep3, predictions.jsonl thật):**
  - `parking-detector`: f466 cam2 — B05 occupied 0/25 votes filt 0.417; A01 free 25/25; **B02 raw 0.122 > enter 0.12 nhưng filt 0.022** → line-filter cứu đúng (minh họa vạch kẻ). E03: 25/25 enter vs 17/25 exit = vùng hysteresis. Finding: rescue chưa-từng lật vote trong 17 session quét.
  - `slot-binder`: chuỗi vòng-đời đầy-đủ D01 gid1 — f162 `vehicle_stopped_in_slot` (claim confirmed, obs=19, vision_confirms=6, track đã lost) → f239 predeparture token → f272 cancelled (guard expired) → f421-438 token confirmed (empty_obs 2→3) → **f440 `parked_id_recovered` lid8→gid1** (app 0.1129, size 1.3183, outward 48.8px, 14 obs). lid9 shadow-fragment miệng ô **không bao giờ có gid** — chặn bởi `recovery_evidence_frames=3`.
  - `slot-binder` ⑥: xe-đỗ-sẵn-không-track ghi là giới-hạn chủ-đích (EXPECTED) đúng brief.
- **Runtime-vs-default phân biệt rõ**: binder `max_expand_ratio` runtime 0.85 ≠ class 0.45; `appearance_threshold` runtime 0.62 ≠ 0.55; detector `ratio_thr` runtime 0.12 ≠ 0.20; `use_edge_recheck=false` runtime; `core_scale` 0.80.
- Ảnh mới: `parking-detector-votes-hiep3-f466.jpg`, `parking-detector-bw-hiep3-f466.jpg` (debug overlay), `slot-binder-parked-hiep3-f155.jpg`, `slot-binder-recovery-hiep3-f440.jpg` — figure specs trong `tools/figures/`.
- Glossary +3 term: `ensemble voting`, `stable evidence`, `core rescue` → page `parking-detector`.
- **Full verification cuối:** `node qa/lint.mjs` — 24 trang **0 ERROR 0 WARN**; `node qa/e2e.mjs` — **132 rows, 0 issues** (24 trang × file+http × 1440×900 + 390×844), 0 console.error/pageerror/requestfailed/blocked-external, 207.4s.

Task 8 đóng. Nợ còn lại của builder-b: review chéo trang builder-a nếu lead yêu cầu; Task 11 thuộc builder-c.

- [2026-10-06] builder-a Step F: review xong 8 trang Task 9 của builder-c → REVIEW-{snapshot-api,gate-session,frontend-dataflow,routing-astar,voice-guidance,predictions-jsonl,replay-ground-truth,failure-gallery}.md. Kết quả: 7/8 OK; gate-session có 1 lỗi prose nhỏ (published_at −1.0/+5.0 bị viết "5 giây cả hai chiều"); failure-gallery F5 có thể nâng mechanism sang CONFIRMED nhờ gid-reacquire/F0-a-codepath.md. Spot-check ~30 con số vs code/config — không phát hiện sai số liệu.

- [2026-10-06] builder-b Step F: review xong 8 trang Task 6 cua builder-a -> REVIEW-{roi-mask,parking-slots,brightness,motion-detection,contour-filtering,kalman-lapjv,track-lifecycle,occlusion-watershed}.md. Ket qua: motion-detection + track-lifecycle OK sach; cac nit nho: roi-mask polygon trong sources/figure lech config runtime (co ve la ROI capture calibration), parking-slots formula core-rescue thieu dieu-kien count>=2, brightness caption "(raw)" khi anh co annotation, contour-filtering src :912 khong phu anchor_outside_roi (:1004), kalman-lapjv bo clamp min(invis,15) + fast-path clear_evidence, occlusion-watershed expires_at min-across-members. Khong sua trang — chi ghi review.

## REVIEW + Task 11 — HOÀN TẤT (builder-c, 2026-10-06)

### 1. Review chéo 6 trang builder-b → REVIEW-<slug>.md
`tracklet-descriptor / trajectory-reid / handoff-dormant / gid-conflict / parking-detector / slot-binder` — đọc như người học ≤10 dòng/file, spot-check vào code thật:
- trajectory-reid: weights quỹ đạo/appearance/size, threshold 0.78, margin 0.12 — khớp.
- handoff-dormant: cost 0.55·residual + 0.30·app + 0.10·size + 0.05·dir, accept ≤0.92, margin 0.08, lookahead 16f, TTL 45f — khớp.
- parking-detector: 25 = 5 CLAHE × 5 gamma, filt <0.12, majority 12/25 — khớp.
- slot-binder: overlap ≥0.35 / strong >0.60, token 5s, recovery ≥3 obs, margin 0.15 — khớp.
- Không sửa trang builder-b; nit/ghi nhận đều trong REVIEW-*.md.

### 2. Backfill 7 notes Task 9 (giá trị → file:dòng → kind, ~15-25 dòng)
`notes/{gate-session,frontend-dataflow,routing-astar,voice-guidance,predictions-jsonl,replay-ground-truth,failure-gallery}.md` — tái lập từ `params[]` + sources ⑦ của chính các trang. (`snapshot-api.md` đã có sẵn — brief ngược thực tế một chút.)

### 3. Task 11 — tích hợp chung
- `qa/build-glossary.mjs` → `js/glossary-data.js`: **45 terms, sort A–Z, 0 dup alias, 0 badfields**; bù 4 mandatory thiếu (`bbox_center`, `dormant ReID`, `reprojection error`, `lid`); mọi `page` trỏ trang thật.
- `qa/build-values.mjs` → `js/quickvalues-data.js`: **159 rows từ 26 trang** (auto-gen từ `params[]`, dedupe name+page có kiểm soát, +1 extra `descriptor length 416`).
- `js/pages/overview.js` — 7 mục đúng schema: sơ đồ pipeline runtime → bảng map node→trang → nav theo nhóm manifest; tái dùng `pipeMap` của router trong s3.
- `js/pages/journey.js` — chuỗi xe vào→đỗ→ra, mỗi chặng `page:` link trang cơ chế (render.js +`step.page`→anchor).
- `js/core/search.js` — nâng: index per-section (title/fn/how/params/limits/glossary), NFD bỏ dấu + đ→d, loại `_fixture`, kết quả link `#/p/<id>#s<n>`; glossary vẫn `#/glossary`. Test VM: `EMA→homography#s3`, `homography→homography#s1`, `khong gian→frontend-dataflow#s4`, `0.78→trajectory-reid#s3`, `LAPJV`, `8001` đều hit.
- `index.html` +overview.js +journey.js; `GROUPS` nới cho trang chung.

### 4. Sửa theo review builder-a (sau verify)
- `gate-session`: prose `published_at` sửa đúng bất đối xứng **−1.0 ≤ age ≤ +5.0s** (quá khứ ≤5s, tương lai ≤1s) — trước viết "5 giây cả hai chiều" là sai.
- `failure-gallery`: F1 tách rõ cửa-sổ-event vs quét-toàn-session; **F5 nâng mechanism → CONFIRMED** theo `gid-reacquire/F0-a-codepath.md` (dormant từ chối `same_camera_stale` 50.078s → world-ReID 0.6683 < 0.78 → new-lineage mint gid3; harm giữ UNSURE); sources +F0-a-codepath.md; limit[2] cập nhật.

### Verify cuối (sau tất cả sửa)
- `node qa/build-values.mjs` — 159 rows, 0 bad.
- `node qa/lint.mjs` — **26 trang/defs, 3 css — 0 ERROR 0 WARN**.
- `node qa/e2e.mjs` — **140 checks, 0 issues; 0 console.error/pageerror/requestfailed/blocked-external** — file+http × 1440×900 + 390×844 (220.9s).
- Site hiện đủ **23 trang cơ chế + overview + journey + _fixture**.

Không commit; backend/frontend/docs không đụng; `algo-web-v2` vẫn untracked. Task REVIEW+T11-c đóng.

## FIX-c — sửa theo review builder-a (builder-c, 2026-10-06) — HOÀN TẤT

3 điểm trong `briefs/FIX-c.md`:

1. **gate-session §3.1**: prose `published_at` đã sửa đúng bất đối xứng — "trễ tối đa năm giây so với đồng hồ controller và chỉ được vượt tương lai một giây" (khớp `-1.0 ≤ age ≤ +5.0` tại `gate_session_controller.py:123`). Đã sửa ngay khi nhận review.
2. **failure-gallery**: F1 tách rõ granularity — số cụm trong cửa sổ event (thai3 chín cụm cam1 + mười cặp cam2) khác tổng quét toàn session (41 cặp) trong values row. **F5 mechanism → CONFIRMED** theo `.analysis/gid-reacquire/F0-a-codepath.md`: dormant reject `same_camera_stale` 50.078s → trajectory score 0.6683 < 0.78 → new-lineage fallback mint gid3; file đó đã cite trong sources ⑦; limit[2] cập nhật "riêng F5 đã có truy vết tới code".
3. **`js/core/interactive/roi.js`**: `REAL_POLY` cập nhật theo config live `roi_mask_cam1.json` — `(116,687)(1273,677)(1242,139)(158,143)` (bl→br→tr→tl, giữ nguyên thứ tự file config); comment nguồn ghi "bản polygon hiện hành". Trang `roi-mask.js` vốn đã cite đúng polygon mới — không cần sửa.

**Verify:** `node qa/lint.mjs` — 26 trang/defs, 3 css — **0 ERROR 0 WARN**. `node qa/e2e.mjs --pages=gate-session,failure-gallery,roi-mask` — **36 checks, 0 issues**, file+http × 2 viewport (43.0s).

Không commit; chỉ ghi `algo-web-v2/` + `.analysis/`. FIX-c đóng.

- [2026-10-06] builder-b learner-read: doc-thu 5 trang nhu nguoi hoc (kalman-lapjv, parking-slots, gate-session, routing-astar, replay-ground-truth) -> LEARNER-READ-b.md. Goi y bo-sung glossary: lineage_score, heuristic/admissible, harm, cursor, clean observations, CLAHE; ma loi E-B-*/E-C-* nen tro failure-gallery. Khong sua trang.

- [2026-10-06] builder-a FIX-a xong 6+1 nits từ REVIEW-b: (1) roi-mask — polygon nguồn + figure spec + 2 asset regen trên capture cal-20261006-180750-46035b9a, sources/captions/origin cập nhật, notes/roi-mask.md đồng bộ, ping INBOX-C đồng bộ REAL_POLY trong interactive/roi.js; (2) parking-slots — Core rescue expr thêm comp_count ≥ 2 (parking_detector.py:425-427); (3) brightness + 5 caption khác — chuẩn hóa '(raw)/(annotate)' → '(frame gốc + chú thích)' toàn site; (4) contour-filtering — src reject ROI :912 → :905-1010 (anchor_outside_roi tại :1004); (5) kalman-lapjv — ceiling thêm min(invis,15) + value row clear_evidence fast-path (:1939-1945); (6) occlusion-watershed — hạn 3s là min(last_clean) trên members (:120). Full lint 26 trang 0E/0W; e2e từng trang PASS.
- [2026-10-06] builder-a FIX-a bổ sung (LEARNER-READ-b): kalman-lapjv — margin viết lại '0.08 × (2 − lineage_score)'; định nghĩa 'extent' = cạnh dài khung xe ngay chỗ dùng đầu (§3.2); định nghĩa 'kích thước sạch/quan sát sạch' tại §3.1 (đo thật không bị merged/occlusion freeze). parking-slots — §3.5 thêm câu TemporalSmoother 'gần như tắt': required_frames=1 + stable_evidence dwell machine là cổng thật. Lint 0/0 cả 2 trang, e2e PASS (32 routes).

## LEARNER-READ nit — predictions-jsonl + lan fix shape limits (builder-c, 2026-10-06) — HOÀN TẤT

Nit lead đọc-như-người-học trên `predictions-jsonl`:

1. `fn.text`: "trạng thái là phẳng" → "trạng thái phẳng" (bỏ 'là' thừa).
2. Section markers lệch: `/* ⑤ figures */ /* ⑤ Giới hạn */ /* ⑥ Nguồn */` → `/* ⑤ Hình thật */ /* ⑥ Giới hạn & lỗi thật */ /* ⑦ Nguồn */`.
3. **`limits[]` shape bug (thật sự lớn hơn cosmetic)**: `{status, text}` phẳng KHÔNG được renderer đọc — `render.js` chỉ nhận `l.evidence.status` cho badge nên badge CONFIRMED/UNSURE không hề hiển thị. Schema `validatePage` cho phép `evidence{}` (tg.js:144). Đổi sang `{text, evidence:{status}}` — cùng lỗi có ở **5 trang của builder-c** nên fix lan: `predictions-jsonl`, `failure-gallery`, `replay-ground-truth`, `routing-astar`, `voice-guidance` (badge giờ hiện đúng, đã verify DOM: `["CONFIRMED","CONFIRMED","CONFIRMED","UNSURE"]`).

**Verify:** `node qa/lint.mjs` — 0 ERROR / **2 WARN** trên `kalman-lapjv` (builder-a vừa edit file, 2 câu >30 từ — phạm vi của a, đã báo). 5 trang sửa: e2e `--pages=predictions-jsonl,failure-gallery,replay-ground-truth,routing-astar,voice-guidance` — **40 checks PASS, 0 issues** file+http ×2 viewport (51.0s).

Không commit; chỉ ghi `algo-web-v2/` + `.analysis/`. Nit đóng — còn chờ builder-a xử 2 WARN kalman-lapjv.

## LEARNER-READ-b — 3 nhóm sửa (builder-c, 2026-10-06) — HOÀN TẤT

Theo `LEARNER-READ-b.md` (builder-b đọc-thử 5 trang):

**1. Glossary +8 term vào `qa/build-glossary.mjs` ADDS → regen (53 terms, sorted, 0 dup):**
- `lineage_score` → kalman-lapjv: trung bình 4 điểm con (history/10 + visible/10 + fragment/5 + age/15), đúng `motion_tracker.py:1278-1302`; role = margin 0.08×(2−score).
- `heuristic` + `admissible` → routing-astar: h(n)=euclid×heuristicScale; admissible vì scale = min(cost/d_len) trên mọi cạnh (`routeEngine.ts:46-49`).
- `harm` → failure-gallery: mức độ hại downstream, tách khỏi "lỗi có tồn tại" (ERRORS-SUMMARY).
- `episode cursor` → gate-session: `_episode_cursors` per-slot, lũy đẳng hóa apply (`gate_session_controller.py:340`).
- `clean observations` → kalman-lapjv: tối đa 8 mẫu đo sạch (không merged/occlusion), occlusion_guard lấy ref từ đây (`occlusion_guard.py:37-82`, `motion_tracker.py:323-326`).
- `CLAHE` → parking-slots: cv2.createCLAHE(clipLimit, tileGridSize), trục của ensemble 25 biến thể (`parking_detector.py:466,500`).
- `TemporalSmoother` → parking-slots: latch confirmed khi vote lặp đủ required_frames; runtime smoothing_frames=1 nên gần như vô hình (`parking_detector.py:63-82`).

**2. Prose:**
- `gate-session` §3.1: viết tường minh chiều dấu — `age = now − published_at`, nhận `−1.0 ≤ age ≤ +5.0`: dương = timestamp cũ/trễ tới 5s, âm = vượt tương lai tới 1s. (Code `gate_session_controller.py:121-122`: `age = now − stamp`.) + `[[episode cursor]]` vào đoạn runtime_id.
- `routing-astar` §3.x: thêm câu map↔camera — sáu zone bản đồ trùng chữ cái prefix ô slots; D/E/F thuộc cam1, A/B/C thuộc cam2 (verify `parking_slots_cam{1,2}.json`).
- `replay-ground-truth`: gloss `harm` ngay lần đầu (value row "harm (mức độ hại lỗi) UNVERIFIED") + `[[harm]]` trong limits.

**3. Mã E-* trỏ failure-gallery:** thêm câu "Mã E-* là finding của chiến dịch verify-replay; danh mục đầy đủ ở trang failure-gallery." tại first-mention trong limits trên 9 trang: brightness, contour-filtering, handoff-dormant, kalman-lapjv, motion-detection, occlusion-watershed, parking-slots, roi-mask, track-lifecycle (additive, không đổi prose gốc của a/b).

**Verify:** `node qa/lint.mjs` — 26 trang **0 ERROR 0 WARN** (2 WARN kalman-lapjv của builder-a đã hết sau khi a tự sửa). `node qa/e2e.mjs --pages=` 12 trang chạm — **80 checks PASS, 0 issues** file+http ×2 viewport (114.8s).

Không commit; chỉ ghi `algo-web-v2/` + `.analysis/`.

## Task 12 — dọn bản cũ (lead, theo duyệt của DIRECTOR)

- Step 1: builder-a/b/c đều idle — không ai đang ghi.
- Step 2: backup re-verify — manifest 780 entry, **OK 780 / BAD 0 / MISSING 0** (script `_verify_backup.js`, manifest CRLF+backslash Windows nên verify bằng node).

## Task 12 — thực hiện xóa (lead, 2026-10-06 ~19:20)
- Step 3: gỡ `<script _fixture.js>` ở index.html:50 + dọn thụt lề lệch dòng 61–65.
- Step 4: move `algo-web-v2/notes/` (7 file gốc Task-9) → `.analysis/.../notes/site/` — verify 7/7 byte-identical rồi mới xóa nguồn.
- Step 5: `_do_delete.js` xóa đúng 775 file trong DELETE-LIST (A:772 + B:3) — 0 missing; dọn 17 thư mục rỗng (js/content, js/pipeline, qa/shots/**).
- Step 6 sau xóa: còn **168 file** (=950−775−7 notes); 8 file ghi đè nguyên; backup re-verify **780/780 OK**; lint **25 trang 0E/0W**; e2e **136 checks 0 issues** (−4 do _fixture gỡ).
- Step 5 README: viết lại `algo-web-v2/README.md` 60 dòng (mở file/http, cấu trúc, thêm trang, trích ảnh, QA).
- Step 4 dist/: **BỎ** — qa/e2e.mjs không có flag --dist (plan giả định sai); ảnh+font vẫn phải là file rời nên dist chỉ là folder copy thứ hai, giá trị thấp.

## Task 13 đang chạy — lead
- git-after.txt: 6 file code dirty nguyên vẹn vs baseline (ccm +1073 / svb +94 / tm +19 / tests +56+59 / two_camera +8). +3 file config + attempt cal-20261006 do USER hiệu chuẩn 18:07 — NGOÀI phạm vi team, ghi nhận không tính vi phạm.
- Pin calibration verify: live :5 rectangle_line_v1 + :1461 bbox_center đúng bản mới; homography pin draft cal-20260927 cho số fit; roi-mask figure + roi.js đã chuyển polygon/capture cal-20261006.
- Drift phát hiện: median_slot_length 9.2675→9.0557 dưới cal-20261006 → dormant 16.218→15.85, pred_radius 25→24.90, dup 4.634→4.53; handoff 15.0 giữ (cap config). → giao builder-b ghi note hai-bản vào trajectory-reid/handoff-dormant/gid-conflict + regen quickvalues.
- Learner-read lead 5 trang → LEARNER-READ-lead.md; builder-b 5 trang → LEARNER-READ-b.md (7 glossary term đã thêm).
- Cải thiện failure-gallery: figure theo khối F → giao builder-c (how[].figure optional field).

## Task cuối — figure nhúng trong how[] + failure-gallery (builder-c, 2026-10-06) — HOÀN TẤT

Đợi `qa/out/e2e-run2.log` hoàn tất trước — log đã có `e2e PASS — 0 vấn đề` (136 checks, 215.5s) nên mới sửa file.

**Core:**
- `tg.js` validatePage: `how[].figure` là field tùy chọn — object có `src`/`alt` không rỗng (giống luật figures[]).
- `render.js` §3: render `figureBlock(step.figure)` ngay sau paras, trước bảng values.
- `qa/lint.mjs`: `proseFields` lint `how[i].figure.caption/alt`; luật 10 (tồn tại/≤260KB/manifest origin) giờ duyệt cả figures nhúng trong how[] — manifest check vẫn bắt buộc.

**failure-gallery.js:**
- `failure-dup-track.jpg` → `how[0]` (F1 DUPLICATE_TRACK), `failure-coasting-burst.jpg` → `how[1]` (F2 coasting burst).
- `figures: []` + `noFigureReason`: "Hai ảnh bằng chứng được đặt ngay trong khối F1/F2 ở mục ③ — không có hình tổng quan riêng vì mỗi lỗi đi kèm frame chứng minh của chính nó."

**Verify:**
- `node qa/lint.mjs` — 25 trang/defs, 3 css — **0 ERROR 0 WARN** (site giờ 25 defs sau khi `_fixture` được gỡ khỏi index.html).
- `node qa/e2e.mjs --pages=failure-gallery` — **24 checks PASS, 0 issues** file+http ×2 viewport (24.2s).
- Verify mắt (`qa/out/shot-fgallery-f1.png`): figure nằm trong `.step` 3.1 đúng vị trí sau paras/trước values, caption + origin render; §5 hiện noFigureReason; F2 tương tự.

Không commit; chỉ ghi `algo-web-v2/` + `.analysis/`.

## Drift-fix cal-20261006 (builder-b) — runtime derived đổi sau khi median slot 9.2675→9.0557

Sửa 3 trang b + 1 trang lân cận (homography — params[] nạp thẳng vào quickvalues nên bắt buộc patch để quickvalues không còn stale):
- **trajectory-reid**: prediction_radius 16.218→ghi nhãn "(cal-20260927); live ≈15.85" ở values/params/source-note; subst corridor sang8 f600 giữ nguyên (số liệu replay thật), note gắn tag snapshot.
- **handoff-dormant**: dormant_match_distance param → "16.218 (cal-20260927); live ≈15.85". Sửa 2 latent bug: Handoff-cost subst chia 16.22 → 25.0 (đúng divisor handoff_prediction_radius của ccm:3087 — dormant event f465 chỉ là số đo minh họa), result ≈0.19→≈0.16; Entry-corridor subst 90→25.0 runtime (90 là class-default), result "= 130+speed"→"= 65+speed"; caption f465 gắn tag run.
- **gid-conflict**: cross_camera_duplicate_distance param → "4.634 (cal-20260927); live ≈4.53"; bounds values "9.268/13.9" gắn tag snapshot + "live 9.06/≈13.58"; subst+caption detach thai3 f2869 giữ số replay, note gắn tag.
- **homography** (ngoài scope tên trang nhưng bắt buộc cho quickvalues đúng): 3 result suy-ra + formula hợp-nhất + 2 params resolved gắn tag cal-20260927 + note live (dormant ≈15.85, prediction ≈24.90 — derived giờ THẤP hơn config 25.0, duplicate ≈4.53; handoff_match vẫn 15.0 cap).
- Không đụng `prediction_radius (non-overlap) = 90` class-default; không đụng backend/calibration.

**Verify:**
- `node qa/build-values.mjs` — quickvalues regen 159 rows; dormant/prediction/dup đều mang nhãn "(cal-20260927); live ≈15.85/4.53" — không còn giá trị stale trình-bày-như-live.
- `node qa/lint.mjs --pages=trajectory-reid,handoff-dormant,gid-conflict,homography` — **0 ERROR 0 WARN**.
- `node qa/e2e.mjs --pages=...4 trang --quiet` — exit 0 (không issue).

## Task 13 — QA cuối (lead) — HOÀN TẤT, CỔNG #3
- Step 1 lint toàn site: **25 trang/defs, 3 css — 0 ERROR 0 WARN**.
- Step 2 e2e full sau mọi sửa: **136 checks, 0 issues** (file+http × 1440×900 + 390×844), log `qa/out/e2e-final.log` (213.6s).
- Step 3 determinism: e2e run2 = run1 (136/0 cả hai); harness có reload-determinism check cho 4 interactive.
- Step 4 git-after.txt: 6 file code baseline nguyên vẹn; +3 config + attempt cal-20261006 = user hiệu chuẩn (ngoài scope, không vi phạm); HEAD 5f581311; không commit/push.
- Step 5 learner-read 10 trang (lead 5 + builder-b 5) → 2 file LEARNER-READ-*.md; nit đã lan fix hết.
- Drift-fix đã land: dormant/dup/prediction mang nhãn "(cal-20260927); live ≈..." trong 4 trang + quickvalues.
- failure-gallery: ảnh chứng cứ nhúng theo khối F (how[].figure mới), verify ảnh shot-fgallery-f1.png.
