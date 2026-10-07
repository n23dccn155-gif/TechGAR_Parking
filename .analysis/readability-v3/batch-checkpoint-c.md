# batch-checkpoint-c.md — R3–R6 batch (builder C)

**Status hiện tại (R5 round-4 — sau LEAD duyệt layout round-3): minor
cuối đã vá (Map card `luồng song song`/`nhánh bất đồng bộ`, Journey
flow① câu hoàn chỉnh, chrome font ≥13px). Sourcecheck FINAL + fieldlist
audit ĐÃ NỘP. Lint 0/0 toàn cục (warn A/B closed). Chờ LEAD ALLFREEZE.**

## R5 round-4 — minor cuối (LEAD đã duyệt layout round-3)

- **Map card**: `chặng ∥`→`luồng song song`, `chặng ~`→`nhánh bất đồng
  bộ` (map.js :193–200); ký hiệu ∥/~ chỉ còn trong diagram. N14 card
  verify trực quan; N2 shot err=0 cả 2 viewport.
- **Journey flow[0]**: noun-phrase → câu hoàn chỉnh "Vòng lặp chính chạy
  12 chặng trên mỗi khung hình, từ lúc nhận ảnh tới lúc phát bản tin".
- **Font đo thực 1280**: Map SVG scale 1.054 → 13px declared ≈13.7px
  hiệu-lực; journey canvas 13px=13 CSS px thật; DOM <13px chỉ còn chrome
  (crumb/nav) → bump `app.css` lên 13px.

## Sourcecheck FINAL — ĐÃ NỘP (`batch-sourcecheck-b-c.md` §FINAL)

- **Homography 4/4 ĐÚNG**: rl_calib:41–44 8-cặp A–D+V1–V4 · :112–127
  fit_gate · tc:287–322 load_calibration gates · anchor bottom_center
  (ccm:168 class) → bbox_center (config:1461 → tc:2155–2161 → tc:2258).
- **Trajectory .78/.12**: ccm:379–384 ctor hardcode = tm:60–61 class
  defaults → runtime=class, ghim tường-minh (không CLI flag).
- **ReID 8/8 ĐÚNG** trên bản B đã sửa (416-D, 0.70/1.20/0.60, quality
  200/0.15/<0.5, dedupe 0.015, compare 0.50/0.20/0.20/0.10, per-camera
  gallery, ValueError ccm:391–395, runtime=class 12/3/24 tc:1965–1967).
  1 lệch nhỏ: `tc:2387–2388` nhãn "tracker ctor" → thật manager ctor
  (giá trị đúng, không blocking).
- **Handoff 7/7 ĐÚNG** (_upsert_handoff :2572, _entry_depth :2776,
  _direction_cosine :2823, gates :2934–2990, cost 0.55/0.30/0.10/0.05
  ≤0.92 :3017–3018, required_evidence 2|3/2/1 :3663–3673, CLI 45/16/8/
  0.25/0.45/0.82).
- **Gate/session/snapshot ≥3 refs/route ĐÚNG**: gsc:229–256 · :259–309 ·
  :483–493 · :865,:904–906 · gate_zones:16,28 · sm:29,:81–88,:355 ·
  tc:1802,:2817,:2844 · rs:106–113.
- Không sửa file B. Flags trả LEAD.

## Canonical audit — ĐÃ NỘP (`canonical-audit-c.md`, thay fieldlist-c.md)

- **LEAD: APPROVE field list (7 dead vs keep) — REJECT "ref coverage =
  không mất fact"** → đã sửa report: §2 **semantic-preservation gate** —
  owner migrate unique VERIFIED text + numbers/scope/formulas vào
  Deep/realParams trước khi xóa; `file:dòng` chỉ là dẫn-chứng, không đủ.
- Verdict: GIỮ `id/title/tier/certainty/sourceRefs/realParams/limits/
  qa/v3.*`; XÓA được `problem/does/role/where/why/steps[]/nodes` — qua
  gate §2 cho MỌI route.
- Dispatch: **A 11** (incl ROI, own fact-map, tự xác-định unique text);
  **B 9** (5 phủ ref + 4 cần chuyển ref: homography ccm:590-608 ·
  trajectory tm:349-385 · gid-conflict tc:1980-1995 · session svb:331-333
  — tất cả kèm gate §2); **C 3** áp gate tương tự, QA+hash sau cleanup.
- Core `ui.js` v1-path **KHÔNG xóa đợt này** — không cần để đạt plan 23
  canonical, tránh broaden cleanup.
- Ưu tiên kế: sourcecheck B FINAL **actual content** (không chỉ report)
  sau khi owners báo hash mới — flags rõ cho LEAD.

## C own-3 cleanup — ĐÃ XONG (gate §2, AUTHORIZED NOW)

- `content/{ensemble,binder,polygon}.js`: xóa 7 dead-fields
  (`nodes/problem/does/role/where/why/steps[]`); unique facts đã migrate
  vào fields render thật (realParams/limits/sourceRefs.note) — không
  dùng `v3.deep` (không có consumer):
  - **ensemble**: +ref `detect() :439,461-530` vòng 25 biến thể; +ref
    `exit_votes :529-530` `ratio < min(ratio_thr, exit_ratio_thr)`;
    docstring note → `5 delta-gamma × 5 delta-CLAHE`; :526 note →
    công thức `countNonZero(mask)/roi.analysis_area`; :602 note →
    evidence keys `empty_votes/instant_occupied/stable_occupied/ready`.
  - **binder**: +ref `update_vision :2431` (mailbox latest-only, cờ
    `ready` :2463, tín hiệu evidence keys); :3241 note → `biên sd=−r
    → giữ`.
  - **polygon**: +ref `score :739` (công thức 0.70/0.20/0.10), +ref
    `_batch_match :1285`, +ref `prepare_predeparture_tokens :495`;
    :719 note → `ov = giao/diện tích bbox`; :728 note → `TÂM bbox
    (x+w/2, y+h/2)`; :582 note → `cv2.pointPolygonTest`.
- Verify source trực tiếp trước khi migrate (pd:7/:439/:526-530/:588-643;
  svb:2431/:2463/:3241/:495/:1285).
- **QA scoped sau cleanup**: lint **0/0** · smoke `routes=3 issues=0
  refs=116 INVALID=0` · v3routes=3 · playPixel 3/3 · console/network
  sạch.

## FINAL §6 sourcecheck — ctor conflict RESOLVED + 1 flag mới

- **RETRACT flag C:** `tc:2387-2388` ĐÚNG là `MotionVehicleTracker` ctor
  (mở :2366; `tracklet_max_samples` :2387 + `tracklet_sample_interval`
  :2388). `CrossCameraManager(` mở `tc:2227`, `tracklet_gallery_size`
  :2248. **B đúng ngay từ đầu** — nhãn hiện tại giữ nguyên.
- **FLAG reid `tc→mt` — CLOSED:** B sửa `reid.js:14` →
  `motion_tracker.py:2029-2033,2157-2163`; hash actual
  `9e1d33fd12728e6dc2464497bbc0fbb3` (khớp `9e1d33fd12` B báo). Verify
  trên file thật — **sourcecheck FINAL 0 flag mở.**
- **C docs-only fix:** bảng ReID §FINAL — flag names đúng lại
  `--tracklet-max-samples/--tracklet-sample-interval/--global-gallery-max-samples`
  (giá trị 12/3/24 vốn đúng).
- **README docs-only fix:** intro tách vòng lặp mỗi-khung (kết thúc
  `phát snapshot`) khỏi nhánh async (worker N2 mailbox + cổng/phiên/
  frontend qua API) — tránh ngụ ý session nằm trong call-loop; nav
  `Pipeline Map` → `Sơ đồ` đồng nhất web. Hash mới
  `77f61a346d5be94e5f4da10152e4359c`.
- **Facts mới B §6 — TẤT CẢ verify ĐÚNG:** trajectory score internals
  (tm:349-385 công thức chính-xác) · homography EMA 0.65/0.35
  (ccm:596-608) · gid-conflict 5/12/0.15 runtime=class (tc:1980-1995 +
  ccm:163-165) · session episode svb:331-333 + sm:255/371/449/574 ·
  reid td:183 · handoff ccm:2831/:3442 · dormant ccm:6854 ·
  gate gsc:196-207/:864 · snapshot gsc:55/:899-906.
- Report: `batch-sourcecheck-b-c.md` §FINAL §6 (retract + flag).

## R6 FINAL QA — 2026-10-05T03:52Z (post-ALLFREEZE)

- `node qa/smoke.mjs` FULL (không scoped): **routes=46 issues=0** ·
  refs checked=894 fileOnly=0 skipped=0 **INVALID=0** · v3routes=23/23 ·
  fixture riêng OK · manifest 23 {9/9/5} · console/network sạch ·
  controls speed/scrub/reset/determinism 46/46 · playPixel 46/46 ·
  reducedMotion/kb/present/fs ok. Log `qa/smoke-final.log`.
- `_probe_links.mjs` 23+specials: **badTotal=0**.
- `_audit_deadfields.mjs`: **dead-fields prod = 0** trên 23 content.
- Ảnh fresh `qa/shots/v3/` 03:48–03:49Z: map/journey/glossary + roi+reid
  ×2 viewports, err=0.
- Report FINAL: `qa/QA-readability-v3.md` §★R6 + §5a hash manifest đầy đủ.
- reid `9e1d33fd12728e6dc2464497bbc0fbb3` khớp B post-fix — sourcecheck 0 open.
- **✅ FLAG FONT RESOLVED** (LEAD unfreeze css/app.css, C targeted patch):
  `_probe_font.mjs` ALL 23 algo + 3 specials × @1280/@1440 = **52/52
  ≥13px computed** (loại details-đóng + pane-code ẩn). Bumps ~24 rule
  reader-facing (badge/hud-k/pos-strip/step-label/map-note/legend/foot/
  brand-small/four/v3-card/steps/impact/tab/src4-sum/limit-tag/stepref/
  qa-q+a/term-sum/glossary-header). Deep/④/pcode giữ nguyên (exempt).
  Layout patch: badge pad 3px, step-label 52px, stepref/limit pad,
  legend gap. H-overflow 0 trên 6 trang ×2 views; ảnh verify trực quan.
- **css/app.css NEW hash `d0c05532f91e312b111d3930e076ad3e`** (baseline
  cũ `a2c7ba96…`). Product ngoài css giữ baseline cũ — chờ ROOT re-freeze.
- Link-CLICK expansion → **B owns** `_click_links_b.mjs` + report
  (actual-click ALL pos/related/flow + Map 17 + Journey, file+http port
  riêng), chạy sau re-freeze. C owns full-smoke 46 final + QA compile.
- QA.md root = checklist duyệt tay (đã viết lại theo khung v3).
- QA-readability-v3.md: title FINAL, timestamp UTC sửa (20:41Z = 03:41
  +07), §R1/R2 đánh dấu HISTORY, §5a hash cập nhật.
- **HOLD** — chờ ROOT re-freeze css → chạy full 46 final.

## R6 FINAL sau re-freeze — 2026-10-04T21:10:47Z UTC

- ROOT re-freeze css `d0c05532f91e312b111d3930e076ad3e` — diff chỉ css.
- Run 21:01Z flag `non-deterministic` handoff+homography (2 mode) →
  ĐIỀU TRA: element-screenshot chụp **sticky header đè mép canvas** khi
  scroll dừng sai — bitmap vẫn deterministic (repro tay dims giống,
  t3 sạch). **Harness artifact, không phải product bug.** Fix smoke.mjs:
  `canvasBytes()` đọc `canvas.toDataURL()` bitmap thô — 6 call-site.
- Re-run FULL: **46 runs · issues=0** · refs 894/0/0/0 · v3routes=23 ·
  playPixel 46/46 · controls/kb/present/reducedMotion ok · console=0.
- `qa/smoke.mjs` `c799973d73724aa453e08f8a1507b2d4` (QA-artifact).
- QA-readability-v3.md FINAL: timestamp 21:10:47Z UTC (=04:10 +07) ·
  flake-note · B click-report (file:// @1440 accepted, KHÔNG claim http)
  · flow steprefs = SPAN tĩnh expected · limitations đầy đủ.
- Product giữ freeze. **STOP/HOLD** — chờ root review.

## Docs — ĐÃ cập nhật

- `README.md` `77f61a346d5be94e5f4da10152e4359c` — mở file:// + http.server,
  v3 layout (caption lớn, tabs, dải vị-trí, 4 ô ①②③④), quy-ước nhãn
  Deep-layer; intro tách loop/async; nav Sơ đồ.
- `CONTRACT.md` `9d24fb19c06a17788c25ec96d62191c7` — canonical schema:
  giữ `id/title/tier/sourceRefs/realParams/limits/qa/certainty/v3`;
  7 fields loại (nodes/problem/does/role/where/why/steps[]);
  `fourBlocks` đánh dấu LEGACY-unused.

## R5-ready — full MD5 filelist FINAL (C-owned + core product)

**C-owned content/pipeline:**
- `js/content/ensemble.js` `60a402b53d971333cc235b35dd6821ae`
- `js/content/binder.js` `54a27a8e4befb55b3e6d39aae9f69402`
- `js/content/polygon.js` `ec47a618451c371700e85d8252f5da1e`
- `js/pipeline/map.js` `9adfcfb2238ff8ad25919ad67de2b7a2`
- `js/pipeline/journey.js` `698a4588ce5cc682fd0d7af6ad74df97`
- `js/pipeline/glossary.js` `072bf3a28ff8c300cb3d43fcbc7ec50a`

**Core product:**
- `index.html` `25883d21970a6e5aec431df40d1d92c6`
- `css/app.css` `a2c7ba967c13354ae622585e643b4c6e`
- `js/core/tg.js` `184aab6f12c38f81ebe1f4d08a0c7f27`
- `js/core/draw.js` `193b888eb2a4d0def5ed7a7d8705b905`
- `js/core/player.js` `46c7e14bd1e28b927903cbf1f293fae0`
- `js/core/pseudocode.js` `cf8452fb2f430e07e20d3453536c5758`
- `js/core/ui.js` `85d9f5a7782e066731a98fc6eb7c95fc`
- `js/core/router.js` `65229674a1f8f966356c33baa5e8bef7`
- `js/app.js` `6a91590756124c2bd3416e7661aad4c0`
- `js/manifest.js` `27818b673465bc298ba62972d710518f`

**QA/docs:**
- `qa/fixture-v3.js` `ea97d0a1ca6a0cf7b09c439c8975d5f6`
- `README.md` `77f61a346d5be94e5f4da10152e4359c`
- `CONTRACT.md` `9d24fb19c06a17788c25ec96d62191c7`

## Verify round-4 (đã chạy thật, sau fix cuối)

- `lint`: **0 error · 0 warn · v3=24 legacy_PENDING=0** — warnings A/B
  đã closed bởi owners (metadata-only, không suppress).
- `smoke --file-only --routes=polygon`: issues=0 · refs INVALID=0 ·
  journey `px=523640 hits=14 step 0/9 refs 21/0` · click `kalman→
  #/algo/kalman` · glossary `56→6 refs 0` · console/network sạch.
- `_probe_r5.mjs`: **map/journey/glossary domLeaks=0 svgLeaks=0**.
- Shots N2/N14 sau card-fix: `map-{1440,1280}-N{2,14}.png` err=0.

## Hash sau fix round-4 (sha256 12 ký tự)

- `map.js` `32a5f2f24f14` · `journey.js` `fa94a7d3acca` · `glossary.js`
  `b5a88c628245` · `router.js` `28c5c9d94ce9` · `index.html`
  `baf722cb2dcf` · `app.css` `8457b6c68088` · `fixture-v3.js`
  `eb9cce1a8663` · `ui.js` `f95ddbcd0fb7` · `draw.js` `929664df0252`

## R5 round-3 đã sửa (theo LEAD layout feedback)

- **Map**: số chặng `k/12` → **pill riêng phía trên đỉnh node** (tách vùng
  khỏi tên, cả 2 viewport); ký hiệu `∥`/`~` → góc dưới-phải trong node;
  mũi "gửi việc" N0→N2 kéo ra mép node (trước đứt vào mặt, đè nhãn).
- **Journey layout**: `sc.stage.minHeight=560px`; cột node strip rộng hơn
  (world 58%); hàng chip ~26px + gap 6 (trước ~22px chật); async box cao
  hơn + label phụ vừa khung; legend "sáng = chặng… ↗ mở trang" nằm gọn
  trong panel (trước bị cắt ngang); nhãn "cú cắt ra → xóa phiên" tách khỏi
  nhãn xe (s9).
- **Journey prose**: stepTexts 10 câu viết lại thành **câu đầy đủ chủ-vị
  ≤25 từ, không mũi tên**; captions step 3/4/7 bỏ `→` trong văn; HUD
  bỏ mũi tên ("vệt cam 1 sang cam 2", "đã xóa (ra cổng)"…). Mũi tên chỉ
  còn trên nhãn canvas/diagram.
- **Nhãn VI**: `stage` badge "Toàn bộ quy trình" (trước "Toàn pipeline");
  menu + breadcrumb "Map" → **"Sơ đồ"** (index.html + router.js 5 chỗ).
- **Highlight verification** (LEAD hỏi "ánh sáng đúng ý nghĩa, không giả
  call-order"): đã đối chiếu `STEP[].active` — s0 N0/3/5/6/7 (vào+vệt),
  s1 N14 (cổng thấy cú cắt), s2 N7/9/11/13 (cấp mã+phát tin), s3 N13/14
  (phiên), s4 N12/14/15 (claim báo ngược+chọn ô+điều hướng), s5 N11/13/15
  (bàn giao+dẫn đường), s6 N2/12/13/14 (ảnh quyết ô+đã đỗ), s7 N7/10
  (vệt nghỉ+vé nhớ), s8 N10/11/12 (nhận lại), s9 N13/14/15 (ra+ xóa
  phiên) — khớp pipeline-order, không giả call-order.

## Verify round-3 (đã chạy thật)

- `_probe_r5.mjs` (DOM+SVG default-layer scan, 3 specials): **0 leak** —
  không N#/T#/file:dòng/tc:/gsc:/svb:/source-backed/deterministic.
- `smoke --file-only --routes=polygon`: issues=0 · journey
  `canvas=true px=523640 hits=14 step 0/9 refs 21/0` · journeyClick
  `kalman→#/algo/kalman` · glossary `56→6 refs 0` · console/network sạch.
- `lint`: **0 error · 7 warn** — warn còn lại đều thuộc A/B (first-use
  alias: roi/kalman/shadow/echo/track-lifecycle/routing) — owners tự
  xử lý theo hướng glossRefs {term:canon,label:VI}; C-owned sạch.
- Ảnh mới 16 PNG (mtime mới): `qa/shots/v3/map-{1440,1280}[-N5/-N2/-N14].png`,
  `journey-{1440,1280}-s{0,4,9}.png`, `glossary-{1440,1280}.png` — err=0.

## Hash sau fix round-3 (md5 12 ký tự)

- `js/pipeline/map.js` `752bf99c2056` · `js/pipeline/journey.js`
  `19093e915622` · `js/pipeline/glossary.js` `072bf3a28ff8` ·
  `js/core/router.js` `65229674a1f8` · `index.html` `25883d21970a`

## Bảng trạng thái route sở hữu C

| Route | Status | Lint | Smoke | Shots | Hash (md5, sau fix) |
|---|---|---|---|---|---|
| ensemble | reader-review fixed · freeze-chờ | 0/0 | issues=0 · refs 42/0bad · v3routes=1 | 14 PNG `qa/shots/v3/ensemble-*` | content `52680d15…` · page `cd59e81e…` (+glossRef label sửa sau — re-hash) |
| binder   | reader-review fixed · freeze-chờ | 0/0 | issues=0 · refs 21/0bad · v3routes=1 · playPixel | 14 PNG `qa/shots/v3/binder-*` | content `8b63f119…` · page `3b3f5c57…` |
| polygon  | LEAD-fix v2 applied · freeze-chờ | 0/0 | issues=0 · refs 11/0bad · v3routes=1 · playPixel | 14 PNG `qa/shots/v3/polygon-*` | content `006907b1…` · page `996154e2…` (+glossRef đợt đỗ — re-hash) |
| Map      | R5 round-3 code+QA DONE — chờ LEAD review ảnh | — (special) | issues=0 · nodes=17 links=6 · probe 0 leak | 8 PNG map-* | `752bf99c2056` |
| Hành trình | R5 round-3 code+QA DONE — chờ LEAD review ảnh | — (special) | issues=0 · px=523640 hits=14 refs 21/0 · probe 0 leak | 6 PNG journey-* | `19093e915622` |
| Thuật ngữ | R5 round-3 code+QA DONE — chờ LEAD review ảnh | — (special) | issues=0 · 56→6 refs 0 · probe 0 leak | 2 PNG glossary-* | `072bf3a28ff8` |

## R5 round-2 đã làm (theo LEAD flag 03:0x)

- **Map** (`js/pipeline/map.js`): gỡ mã N# khỏi mặt node (giữ `data-node`
  nội bộ); toàn bộ text SVG ≥13 viewBox-px (≈13px hiệu-lực ở 1280); node
  card title = tên VI + "chặng N/12" (bỏ `· N5`); tier badge VI
  (`Cốt lõi/Bổ trợ/Tham khảo`); link trang dùng `getContent().title` VI;
  note `two_camera.py:2679` đưa vào `<details>` "dẫn chứng mã nguồn".
- **Hành trình** (`js/pipeline/journey.js`): migrate khung **v3**
  (`pageScaffold` auto-v3 — `J.v3` gán sau registerContent vì store-by-ref):
  summary/story/caption-lớn/Các bước default/Mã giả tab/4 ô ①②③④; certainty
  → ô ④; bỏ badge `core` + 4-cards legacy (does/role/where/why xoá khỏi
  content). Tên minh hoạ VI: `vệt cam 1/vệt cam 2/vệt mới/mã 7/ô A05`
  (T12/G7/T9 bỏ). Toàn bộ `d.label` ≥13px; node-strip bỏ `· N#`; camFrame
  `titleSize:13` (option mới trong draw.js — default 11 giữ nguyên);
  PSEUDO.note bỏ `tc:/gsc:/sm:` → VI thuần (refs vẫn trong Deep/sourceRefs).
- **Thuật ngữ** (`js/pipeline/glossary.js`): TERMS → 5 trường
  `[displayVI, def, group, deep, canon]` — 56 term display VI đời-thường,
  canon (minAreaRect/exit_votes/frame_index/…) chỉ trong Deep `sâu hơn`;
  lookup match cả display+canon; filter gồm canon; aliases giữ nguyên
  (giá trị = canon nên vẫn resolve).
- **Header/footer** (`index.html`): `source-backed · edu v2` →
  `minh họa giáo dục · bám theo mã nguồn thật`; footer bỏ
  file:// & deterministic → câu đời-thường.
- **lint fix đúng-ý-rule** (`qa/lint-readability.mjs`): matchWords glossary
  theo canon (t[4]) thay first-token display — display VI đời-thường gây
  348 warn giả; sau fix: **0 error · ~10 warn** (warn còn lại alias-first-use
  hợp lệ trên routes A/B; C-owned sạch sau khi thêm glossRef "phiếu ra"/
  "đợt đỗ" + fixture "cụm chuyển động").

## Verify đã chạy round-2

- syntax check 5 file ✓ · glossary lookup node-test: canon+alias+VI đều
  resolve (minAreaRect→Khung xoay nhỏ nhất, mã xe→Mã chung (GID)…).
- lint: `0 error · 10 warn · v3=24 legacy_PENDING=0` — 9 warn còn lại của
  A/B (first-use alias hợp lệ) + routing summary 26t (A) + echo err đã hết
  (A đang sửa đồng thời).
- smoke lần 1 fail đúng-hướng: `TG.ui.pageScaffoldV3 is not a function` →
  đã sửa gọi `TG.ui.pageScaffold` (dispatch v3 theo `c.v3`).
- **CHƯA chạy lại smoke + shots sau các fix trên — việc kế tiếp.**

## Việc còn lại ngay (thứ tự)

1. **Sourcecheck độc lập** (queued, LEAD yêu cầu): homography ≥3facts trực
   tiếp source — canon `rectangle_line_calibration.py:41-112` /
   `two_camera.py:284-341` vs claim "homography.py"/ANCHOR của B; trajectory
   `.78/.12` ctor-wiring `ccm:379-384` vs class defaults; reid/handoff
   FINAL trên bản B đã sửa; gate/session/snapshot ≥3refs/route → viết vào
   `batch-sourcecheck-b-c.md` (không sửa file B).
2. Legacy-fields không-consumer audit (B đang dựng consumer list — hợp
   nhất khi xong).
3. Vá glossary-noise A/B nếu LEAD giao sau reader-a output (không
   suppress warnings).
4. Full-freeze QA chỉ khi LEAD signal — KHÔNG tự chạy.

## Bảng trạng thái chi tiết (trước — giữ lại tham chiếu)

| Route | Status | Lint | Smoke | Shots | Hash |
|---|---|---|---|---|---|
| ensemble | reader-review fixed · freeze-chờ | 0/0 | 42/0bad | 14 | `52680d15…` / `cd59e81e…` |
| binder | reader-review fixed · freeze-chờ | 0/0 | 21/0bad | 14 | `8b63f119…` / `3b3f5c57…` |
| polygon | LEAD-fix v2 · freeze-chờ | 0/0 | 11/0bad | 14 | `006907b1…` / `996154e2…` |

Không-route (C): draw.js (thêm `d.cross` + `camFrame o.titleSize`).

## Source facts polygon (đã verify — giữ nguyên)

- `svb:712-745` `_overlap_geometry`: giao đa giác xe∩ô; qualify
  `inside && ov≥0.35 || ov≥0.60`; tâm = bbox-center.
- `svb:217-218` ctor 0.35/0.60; `svb:592-601` intersectConvexConvex;
  `svb:582-588` pointPolygonTest; `svb:665-672` point-in-poly;
  score `0.70/0.20/0.10`; `svb:573` bottom-center chỉ neo recovery.

## Feedback LEAD đã xử lý (ensemble/binder/polygon/glossary — vòng trước)

- binder title VI + caption khớp cảnh + không claim tự publish; nhãn vùng
  sạch. ensemble "25 cách xử lý" + glossary defs VI; `d.cross`; brightness
  toàn cục; off-route 80px callsite/75px lib-default; polygon hàng-thông-tin
  + leader + vùng giao thật + hedge suy-luận; `#/algo/dormant` đúng.
- source-check B: 7 claims → nhiều sai chỗ/giá trị (B tự sửa).

## Publish package — 2026-10-05 (task mới, CHƯA push)

- Target: https://github.com/anqp5002/learn_techGar.git — package tại
  `D:\TechGar2\.publish\learn_techGar` (isolated; KHÔNG đụng .git/remote/
  index/history của D:\TechGar2).
- Scope: web algo-web-v2 đầy đủ (23 trang + Map/Journey/Glossary, static)
  + QA/docs cần thiết + file nguồn thật được web tham chiếu (file:dòng/
  source-viewer hoạt động). Loại video/frame/model/dataset/cache/
  node_modules/credentials/runtime không liên quan.
- Freeze: KHÔNG sửa web (hash 59 giữ). Chỉ tạo package + docs/.gitignore.
- Bằng chứng cần: manifest file/bytes · source-refs preserved · secrets/
  large-file scan · hash product khớp freeze · branch/commit plan no-overwrite.
- Repo remote: B audit read-only; nếu nonempty → preserve history (clone/stage).
- **CHƯA push/force/delete — chờ LEAD review package.**
- Deliverable: `.analysis/readability-v3/publish-package-c.md` + checkpoint.

## Publish package — UPDATE sau audit B (remote RỖNG)

- Remote learn_techGar: ls-remote exit0, 0 refs → rỗng → push thường, main, 1 initial commit, KHÔNG force.
- Package hoàn chỉnh tại .publish/learn_techGar: 804 files / ~85MB
  (algo-web-v2 780/84MB incl shots 687 ảnh · backend 16 · frontend 6 · root README+gitignore).
- Freeze: diff -r web = 0 khác biệt · 12 spot-hash khớp baseline (css d0c05532f91e312b111d3930e076ad3e).
- Refs: 38/38 resolve (miss=0) theo logic smoke IDX — layout sibling backend/frontend giữ nguyên.
- Scan: 0 credential thật (token=domain term, secrets=stdlib) · file max 428KB · 0 file >50MB.
  ⚑ flag: IP camera LAN 192.168.100.53/198 trong calibrate_map.py + shared_cm_01.json (LEAD quyết).
- Report: .analysis/readability-v3/publish-package-c.md.
- **CHƯA init/commit/push — chờ LEAD review + phê commit staging.**

## Publish package — FINAL staging (commit xong, HOLD push)

- F1: thêm .analysis/ (91 md + dossier content-a/b JSON + shots-b/ 313 file incl final/ được docs link) — miss doc-ref=0.
- F2: git init -b main trong package → commit 5ee4f2949b7699722064aa5747b59a88ce9d03b5 (1227 files, tree sạch, no remote). Parent D:\TechGar2 .git/index/history không đổi.
- Verify: 59/59 product SHA256 khớp freeze · 22/22 source SHA256 khớp gốc · smoke-final.log baseline restored byte-identical.
- Package check thật: smoke --file-only từ package = 23 routes · issues=0 · refs 447/0/0/0 · playPixel 23/23 · console/network sạch.
- Shell 98c0c4/54b831 (smoke package-checks) đã exit 0 — không helper treo.
- LAN IP giữ literal (line fidelity, LEAD chấp nhận phạm vi snapshot) — không phải credential.
- Report FINAL: .analysis/readability-v3/publish-package-c.md.
- **CHƯA push/remote-add — chờ B chốt SHA độc lập.**

## Publish — PUSHED 2026-10-05

- Pre-push ls-remote: 0 refs → push thường -u origin main, exit 0, noninteractive credential helper.
- Remote verify: HEAD + refs/heads/main = 5ee4f2949b7699722064aa5747b59a88ce9d03b5 = local, tracking clean, 1227 files.
- Report: .analysis/readability-v3/publish-result-c.md.
