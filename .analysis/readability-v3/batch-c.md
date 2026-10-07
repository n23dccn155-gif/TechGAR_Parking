# batch-c.md — Builder C · R3–R6 batch report

**Scope C:** content/pages `ensemble` + `binder` + `polygon` (3) ·
core/UI/CSS/router/manifest · R5 Map + Hành trình + Thuật ngữ ·
CONTRACT + QA tools/reports. Không sửa A/B/ROI/backend/frontend/algo-web cũ.

Kèm: `batch-position-c.md` (bảng stage/before/after 22 route — nộp sớm
cho A/B) · `batch-checkpoint-c.md` (checkpoint đang cập nhật).

---

## R3-1 · `#/algo/ensemble` — "Bỏ phiếu trạng thái ô đỗ" — DONE

| | |
|---|---|
| Tier / stage | Cốt lõi · **Nhánh song song · Quan sát ô đỗ bằng ảnh** (N2∥, không nằm trong vòng lặp theo dõi) |
| position | before `Nhận ảnh & đồng bộ 2 camera` (link `#/`) → here `Quan sát ô đỗ bằng ảnh` (note: nhánh song song) → after `Cập nhật ô đỗ và xe đang đỗ` (link `#/algo/binder`) |
| links | `Phát hiện chuyển động` → `#/algo/motion` (luồng theo dõi chạy song song) |
| ifMissing | "Trạng thái ô đỗ có thể nhảy lung tung theo ánh sáng và bóng đổ." |
| Files | `js/content/ensemble.js` (md5 98ddd39c…, mtime 01:50) · `js/pages/ensemble.js` (md5 c3b28b72…, mtime 01:50) |
| Player | 6 bước (0–5) · seed `ensemble-v3` · captions=stepTexts=6 · `sc.v3.bindPlayer` |

### Source-verified facts (đọc trực tiếp backend/main_detect)

1. **25 biến thể = 5 Δgamma × 5 ΔCLAHE** — `parking_detector.py:454-456`;
   mỗi biến thể một phiếu: `ratio<0.12`→phiếu trống, `<min(0.12,0.08)`→phiếu ra
   (:526-530); `required_votes = 25//2 = 12` (:533-539).
2. **Runtime vs class-default:** runtime `enter 0.12 / exit 0.08 / occ 0.5s /
   empty 1.0s / fps 2.0` — `two_camera.py:1784-1800` args + `:2264-2276` ctor;
   class-default `ratio_thr=0.20, smoothing_frames=5, use_edge_recheck=True,
   core_scale=0.55, stable_evidence=False` — `parking_detector.py:103-137`.
   Runtime tắt edge_recheck & smoothing (`tc:2267`, `:1597`), `core_scale=0.80`.
3. **Core rescue 2 nhánh OR** — central: core_ratio≥0.18∧comp≥0.08; textured:
   raw≥0.30∧core≥0.02∧≥2 thành phần — `parking_detector.py:418-428`,
   callsite đảo kết quả `:542-547`.
4. **Dwell/điều-kiện công nhận** — ra: exit≥12 + đủ 1.0s + !rescue
   (:627-628,637-640); vào: 2 lần/0.5s (:630,:637-639); gap nguồn >1.5s
   reset pending (:624-625); ô chưa init → placeholder occupied (:641-644).
5. **N2∥ async mailbox** — ThreadPoolExecutor(2) `tc:2280`; worker→
   `accept_evidence`→binder `tc:2520-2634` (kết quả có age-check :2555-2618).

### Visible text (default layer)

- **summary:** "Mỗi ô đỗ được hỏi qua 25 cách xử lý ảnh; chỉ khi đủ phiếu đồng
  ý mới đổi trạng thái ô." (18 từ)
- **story:** 3 câu xe trắng hòa nền nắng gắt → một phép đo báo trống nhầm →
  bãi xe nhảy trạng thái liên tục.
- **6 captions:** đôi panel "KHÔNG có bỏ phiếu / CÓ bỏ phiếu 25 lần" → lưới
  phiếu vàng/xanh → tra cứu lõi → hai lớp kiểm phụ tắt → dwell 0.5s/1.0s.
- **flow** 4 ý · **rules** 3 (ngưỡng 12 phiếu, phiếu-ra chặt hơn, xét lõi) ·
  **impacts** 3 (xe hòa nền, xe lộ lõi, limit: 25 bản xử lý chậm hơn một đo —
  chạy luồng riêng 2fps nên không chặn tracking).
- **hudLabels:** PHIẾU TRỐNG / PHIẾU RA / TRA CỨU LÕI / TRẠNG THÁI Ô /
  BƯỚC ĐANG XEM.
- **glossRefs:** `ensemble 25-vote`, `exit_votes`, `core rescue`, `dwell count`
  → `TG.glossary.lookup` resolve (11 `.tg-gt` trên trang).
- **source.note:** bộ kiểm phiếu chạy luồng riêng song song, 2 lần/giây; kết
  quả gửi về bộ phận cập nhật ô.
- Deep giữ nguyên: sourceRefs, realParams (scope runtime|class|illustration),
  limits, qa, certainty — không xóa để lint-pass.

### Scene

2 panel cùng seed/geometry `KHÔNG có bỏ phiếu` / `CÓ bỏ phiếu 25 lần`;
3 kịch bản (Xe trắng hòa nền · Xe chỉ lộ phần lõi · Xe rời ô đỗ) — số phiếu
minh họa 4/25, 13/25, 20/25 (ghi rõ "minh họa, không đo production").
Nhãn canvas VI ≤6 từ ≥13px; không snake_case/file:dòng trên canvas.

### QA

- `node qa/lint-readability.mjs --routes ensemble` → **0 error 0 warn**
  (v3=1 fixture+ensemble).
- `node qa/smoke.mjs --file-only --routes=ensemble` → **issues=0** ·
  refs checked=95 (route ok=42) bad=0 · `v3routes=1 [ensemble]` ·
  playPixel ✓ · consoleErrors=[] failedReqs=[].
- Ảnh (14): `qa/shots/v3/ensemble-{1440,1280}-{top,mid,final,default,pcode,
  src4open,tooltip}.png` — crumb VI, pcVis=0, src4 gấp→mở, tooltip gloss.
- Tool mới: `qa/_shots_v3_page.mjs <route> [--mid --final]` (tái dùng cho
  binder/polygon).

### Core-fix trong lúc chunk (báo LEAD/A)

- **`api.cross(x,y,r,o)`** thêm vào `js/core/draw.js` — A đang edit
  kalman/coasting gọi `d.cross` (helper chưa tồn tại → `pageerror` khi
  journey click mở kalman). Chỉ thêm API core, không sửa file A.
  Sau fix smoke ensemble sạch console.

### Sửa theo review LEAD (sau QA)

- Panel phải `"CÓ bỏ phiếu 25 cách"` (trước "25 lần" — ngộ nhận 25 khung
  hình); caption[1] ghi "25 phiếu **trên một ảnh**".
- glossRefs label khớp văn-bản-thật để wrap: `25 cách xử lý` ·
  `phiếu ra nghiêm` · `tra cứu lõi` · `bằng chứng đứng yên`.
- 4 def glossary viết lại đời-thường + nguồn runtime (glossary.js — C scope):
  ensemble 25-vote · exit_votes · core rescue · dwell count (+ occupancy).
- Không dùng "đa số" — flow[1] đã ghi "ngưỡng quy ước, không phải đa số
  tuyệt đối" (đúng yêu cầu LEAD).
- Re-lint **0/0**, re-smoke **issues=0 console=[]**, re-shot 14 PNG (gt=9).

### Blockers

Không có.

---

## R3-2 · `#/algo/binder` — "Gắn xe vào ô đỗ" — DONE (post-fix verified)

| | |
|---|---|
| Tier / stage | Cốt lõi · **Chặng 11/12 · Cập nhật ô đỗ và xe đang đỗ** |
| position | before `Bàn giao hai camera và cấp mã chung` → `#/algo/handoff` · here `Cập nhật ô đỗ và xe đang đỗ` (note: còn nhận bằng chứng từ nhánh quan sát song song) · after `Đồng bộ và phát bản tin` → `#/algo/snapshot` |
| links | `Bỏ phiếu trạng thái ô đỗ` → `#/algo/ensemble` · `Vùng quan sát và ưu tiên` → `#/algo/roi` |
| ifMissing | "Mỗi lần xe đổi mã hay vết xe trượt khỏi ô, trạng thái ô có thể nhảy lung tung dù xe vẫn đậu yên." |
| Files | `js/content/binder.js` (md5 `8b63f119…`) · `js/pages/binder.js` (md5 `3b3f5c57…`) |
| Player | 6 bước (0–5) · seed `binder-v3` · captions=stepTexts=6 · `sc.v3.bindPlayer` |

### Source-verified facts (đọc trực tiếp)

1. **Production policy `vision_primary`** — ctor callsite
   `two_camera.py:2326-2356` (policy :2328). Không nhầm với class default.
2. **Qualify cổng kép** `_overlap_geometry` `slot_vehicle_binder.py:712-745`
   — tâm-trong-ô ∧ trùng ≥0.35, hoặc trùng ≥0.60 bất kể tâm (:729).
3. **Departure token neo chân xe** `_bottom_center` `svb:573`; radius ramp
   `_token_radius` `svb:603-609` = 0.05→0.85 đường-chéo ô theo 1.0s.
4. **Recovery reject** `svb:3241`: `sd < −r ∧ ov ≤ 0 ∧ ¬ev` (ramped); outer
   hard-gate `:3237` `< −max_radius` (0.85·diag); runtime
   `--slot-recovery-max-expand-ratio` `tc:1890` default **0.85** ≠ class
   ctor default **0.45**.
5. **Wake-up polygon scale 1+2r** `svb:2653-2668` — chỉ đánh thức detector;
   KHÔNG phải vùng nhận lại.
6. **Legacy occupancy** `vision_occupied OR tracking_confirmed` (tracking
   cần stopped ≥500ms) — chỉ trong Deep/limits, default layer giữ
   `vision_primary`.

### Visible text (default layer)

- **title:** `Gắn xe vào ô đỗ` (classname `SlotVehicleBinder — vision-primary`
  chỉ còn ở ④/Deep — sửa theo review LEAD).
- **summary:** "Ảnh quyết ô đỗ có xe hay không; mã xe chỉ là nhãn dán, nên
  đổi mã không làm ô nhảy trạng thái."
- **story:** hai câu hỏi tách — "có xe không" ảnh trả lời, "xe nào" vết xe.
- **6 captions:** cùng ô trống → xe vào hai bên cùng công nhận → đổi mã 7→9
  (trái nhảy trống+mở đợt mới, phải chỉ đổi nhãn) → vết lệch (trái báo trống
  nhầm) → điểm neo + vùng chờ mở dần → nhận lại nhãn cũ **khi vùng chờ còn
  mở** — trạng thái **giao bước đồng bộ** (KHÔNG claim tự publish — sửa
  theo review LEAD).
- **flow** 4 · **rules** 4 (35%/60%, một chiều theo ảnh, neo chân xe, từ
  chối ngoài vùng chờ) · **impacts** 3 + 1 `limit` (ảnh báo trống đủ lâu →
  ô trống kể cả nhãn cũ — mất bóng dài không cứu được).
- **hudLabels:** BẰNG CHỨNG ẢNH / MÃ XE / GẮN VỚI Ô / ĐỢT ĐỖ / Ô BÊN TRÁI /
  Ô BÊN PHẢI / BƯỚC ĐANG XEM.
- **glossRefs** (19 `.tg-gt`): mã xe · vết xe · trạng thái ô · điểm neo ·
  cổng khoảng cách · episode (đợt đỗ) · vùng đánh thức.
- **source.note:** cuối vòng lặp chính — nhận bằng chứng ảnh, ghép mã xe
  mới nhất, gửi cho bản tin (rõ là bàn giao chặng 12).

### Scene

2 panel cùng geometry/seed: trái `KHÔNG tách — bám mã xe` (minh họa chế độ
thất bại, KHÔNG claim là implementation legacy thật) · phải `CÓ tách —
ảnh quyết có xe`. Nhãn VI ≥13px ≤6 từ; `vùng chờ`/`vùng đánh thức` đặt
strip trống sau khi ô hạ 8px (sửa đè chip theo review LEAD).

### QA (chạy lại sau mọi fix)

- `lint --routes binder` → **0 error 0 warn** (cả cụm v3=15 lúc chạy 0/0).
- `smoke --file-only --routes=binder` → issues=0 · refs ok=21 bad=0 ·
  `v3routes=1 [binder]` · playPixel · consoleErrors=[] failedReqs=[].
- Ảnh (14): `qa/shots/v3/binder-{1440,1280}-{top,mid,final,default,pcode,
  src4open,tooltip}.png` — crumb `… › Gắn xe vào ô đỗ` · pcVis=0 · gt=19 ·
  err=0 cả 2 viewport.

### Sửa theo review LEAD (vòng 2)

- Title VI · caption step0 khớp cảnh trống · caption/stepText step5 có
  điều kiện + "giao bước đồng bộ" không tự publish · nhãn vùng khỏi đè
  chip · caption/flow/rules cắt ≤25 từ · canvas nhãn "đổi mã sang đợt
  mới"/"giữ nguyên, ảnh độc lập mã" (bỏ mũi tên, ≤6 từ).

### Blockers

Không có.

---

## R4 · `#/algo/polygon` — "Đo xem xe có trong ô" — DONE (post-fix verified)

| | |
|---|---|
| Tier / stage | Bổ trợ · **Chặng 10–11/12 · Bàn giao và cập nhật ô đỗ** |
| position | before `Chuẩn bị khôi phục xe rời ô` → `#/algo/dormant` · here `Đa giác đánh thức và cổng khoảng cách` (note: kỹ thuật nền trải qua chặng 10–11) · after `Đồng bộ và phát bản tin` → `#/algo/snapshot` |
| links | `Vùng quan sát và ưu tiên` → `#/algo/roi` · `Gắn xe vào ô đỗ` → `#/algo/binder` |
| ifMissing | "Một vệt chuyển động dài lướt qua mép ô có thể bị gán nhầm là xe đậu trong ô." |
| Files | `js/content/polygon.js` (md5 `006907b1…`) · `js/pages/polygon.js` (md5 `996154e2…`) |
| Player | 5 bước (0–4) · captions=stepTexts=5 · `sc.v3.bindPlayer` |

### Source-verified facts (đọc trực tiếp `slot_vehicle_binder.py`)

1. **`_overlap_geometry` `svb:712-745`**: giao đa giác xe ∩ ô; qualify
   `inside && ov≥0.35 || ov≥0.60`; score `0.70·veh+0.20·slot+0.10·tâm`;
   tâm = **bbox center** KHÔNG phải bottom-center.
2. **Ngưỡng `0.35/0.60`** ctor defaults `svb:217-218` — không override.
3. **`cv2.intersectConvexConvex`** `_raw_vehicle_overlap` `svb:592-601`;
   **`cv2.pointPolygonTest`** signed-dist `svb:582-588`; point-in-poly
   `svb:665-672`.
4. **`_bottom_center` `svb:573`** chỉ neo departure/recovery — không vào
   qualify (Deep nói rõ, default không trộn hai "tâm").

### Visible text + scene (sau LEAD-fix v2)

- **Title VI** `Đo xem xe có trong ô`; summary 1 câu "khung thẳng vs tứ
  giác xoay — đo phần trùng thật chứ không chỉ xét tâm".
- 2 panel **cùng seed/geometry**: trái `KHÔNG đo trùng — chỉ xét tâm` ·
  phải `CÓ đo trùng — cổng kép`. % trùng **31/74/44** tính bằng kernel
  hình học thật (Sutherland–Hodgman + ray-cast) — khớp cả 2 panel.
- **Phần trùng** vẽ đúng `r.inter` (đa giác giao) fill đậm — không phải
  tô cả box; nhãn `vùng trùng` chỉ ở step giải thích.
- **Thông tin xe** ra **hàng đáy full-width** + **leader gấp khúc**
  (đứt nét dọc→ngang): `● xe X · trùng 31% · tâm trong → NHẬN/TỪ CHỐI
  · lý do · điểm`. Đọc độc lập từng xe ở cả 1280.
- Hedge: "nhánh 60% **theo hình học** rất khó đạt" + "**(suy ra từ
  hình học)** — nhánh 60% **có vẻ** là lớp phòng ngừa." — không claim
  tần suất hay an toàn.
- **glossRefs** (3 `.tg-gt`): khoảng cách có dấu · vệt chuyển động
  (Blob) · ô đỗ.

### QA (chạy lại sau fix v2)

- `lint --routes polygon` → **0 error 0 warn**.
- `smoke --file-only --routes=polygon` → issues=0 · refs ok=11 bad=0 ·
  `v3routes=1 [polygon]` · px=291914 · playPixel · console/network sạch.
- Ảnh (14): `qa/shots/v3/polygon-{1440,1280}-*.png` — đã tự-review:
  hàng đáy tách biệt, `cách +15/+48/−15` không đè `vùng trùng` (nhãn
  ấy chỉ step 1), `ô A05/A07`/`xe X/Y/Z` tách.

### Blockers

Không có.

---

## Đang làm → R5: Map → Hành trình → Thuật ngữ

---

## Canonical cleanup own-3 (gate §2 — AUTHORIZED NOW, sau LEAD verdict)

`content/{ensemble,binder,polygon}.js` — xóa `nodes/problem/does/role/where/why/steps[]` (0 consumer v3). Unique verified facts migrate vào fields render thật (`sourceRefs.note`/`realParams`/`limits`), KHÔNG `v3.deep` (không có consumer trong ui.js):

- **ensemble** (`60a402b53d971333cc235b35dd6821ae`): +ref `detect() :439,461-530`; +ref `exit_votes :529-530` (`min(ratio_thr, exit_ratio_thr)`); notes `:7` 5δγ×5CLAHE · `:526` công thức ratio · `:602` evidence keys (empty_votes/instant_occupied :588-592 + stable_occupied/ready :643).
- **binder** (`54a27a8e4befb55b3e6d39aae9f69402`): +ref `update_vision :2431` (mailbox latest-only · `ready` :2463 · signal keys); `:3241` note `biên sd=−r → giữ`.
- **polygon** (`ec47a618451c371700e85d8252f5da1e`): +ref `score :739` (công thức 0.70·ov+0.20·ov_ô+0.10·(1−d/diag)); +ref `_batch_match :1285`; +ref `:495`; notes `:719` ov=giao/bbox · `:728` tâm bbox (x+w/2,y+h/2) · `:582` cv2.pointPolygonTest.
- Source verify trực tiếp trước migrate: `pd:7,:439,:461-463,:526-530,:586-595,:602,:618,:640-643` · `svb:2431,:2463,:3237-3245,:493-497,:1283-1288`.

**QA sau cleanup:** lint `0 error · 0 warn · v3=24` · smoke `--file-only --routes=ensemble,binder,polygon` → `routes=3 issues=0 · refs checked=116 INVALID=0 · v3routes=3 · playPixel 3/3 · console/network sạch`. Title/words/canvas/facts giữ nguyên — chỉ di chuyển facts Deep.

**Status:** C own-3 cleanup DONE — chờ A(11)/B(9) owners + LEAD ALLFREEZE.

## R6 FINAL QA — 2026-10-05T03:52Z (post-ALLFREEZE, full không scoped)

**Smoke** `qa/smoke-final.log`: routes=46 (file+http) issues=0 · refs 894 checked/0 fileOnly/0 skipped/0 INVALID · v3routes=23/23 · fixture riêng OK · controls speed→4x/scrub/reset→0/determinism byte-identical 46/46 · playPixel 46/46 canvasDiff@2 · kb/present/fs/reducedMotion ok · console/network=0.

**Probes:** links badTotal=0 (23+specials, position/flow/map/journey/gloss) · dead-fields prod=0 · ảnh fresh 2 views err=0.

**reid closure:** `9e1d33fd12728e6dc2464497bbc0fbb3` = B post-fix (mt label + CLI) — sourcecheck 0 open.

**⚑ FLAG MỞ → LEAD (không tự sửa product):** font computed <13px DOM mặc định @1280/@1440 — badge 10 · hud-k 9.5 · pos-strip 12.5/10.5 · step-label 12 · map-note 12 · hint 11 · foot 11 · brand-small 10 (~52 rule CSS <13 kể lớp gấp). Phạm vi bump chờ LEAD quyết; canvas/SVG đạt.

**Report:** `qa/QA-readability-v3.md` §★R6 + §5a (hash manifest đầy đủ 23 content + core/pipeline/docs, cùng run). **HOLD** chờ root review.

## Font-flag RESOLVED — css/app.css ready re-freeze (2026-10-04 ~21:1xZ UTC)

- LEAD unfreeze css only → C patch targeted ~24 rule reader-facing ≥13px
  (không blind-regex): badge·stagechip·hud-k·pos-strip+note+links·
  step-label·map-note·legend·hint·foot·brand-small·four-h/p·v3-card·
  v3-steps·impact·tab·src4-sum·limit-tag·stepref·qa·term-sum +
  glossary group-header inline 12→13 qua CSS `!important` (không sửa .js).
  Layout patch nhẹ (badge pad, step-label 52px, legend gap). Deep/④/
  pcode/ref-font giữ (exempt). Canvas/SVG không đụng.
- `_probe_font.mjs` nâng ALL 23 algo + 3 specials × @1280/@1440 →
  **52/52 PASS ≥13px computed** (trước-fix flag đúng).
- H-overflow scan 6 trang ×2 views = 0; ảnh session-1440/map-1280-N5/
  journey/glossary/roi/assignment verify trực quan sau CSS.
- **css/app.css `d0c05532f91e312b111d3930e076ad3e`** (old `a2c7ba96…`).
  Product ngoài css giữ baseline. QA.md = checklist duyệt tay mới;
  QA-readability-v3.md retitle FINAL + timestamp UTC sửa + HISTORY mark.
- Link-click expansion → B owns (`_click_links_b.mjs`), C không duplicate.
- HOLD chờ ROOT re-freeze css → full smoke 46 final + QA compile.

## R6 FINAL sau ROOT css re-freeze — 21:10:47Z UTC

- Run đầu sau re-freeze flag `non-deterministic` ở handoff+homography →
  điều tra: element-screenshot kẹt **sticky header đè mép canvas** khi
  scroll dừng sai; bitmap canvas vẫn deterministic → **harness artifact**.
  Fix `qa/smoke.mjs`: byte-compare qua `canvasBytes()` (toDataURL bitmap
  thô), 6 call-site. Product không đụng.
- Re-run FULL: **46 runs · issues=0** · refs 894 checked/0 fileOnly/
  0 skipped/0 INVALID · v3routes=23 · playPixel 46/46 · controls/kb/
  present/reducedMotion ok · console/network=0 · log `qa/smoke-final.log`.
- smoke.mjs `c799973d73724aa453e08f8a1507b2d4` (QA-artifact).
- QA-readability-v3.md FINAL: timestamp UTC đúng từ log · flake-note ·
  B click-report file://@1440 (KHÔNG claim http) · steprefs SPAN tĩnh.
- STOP/HOLD chờ root review. Product freeze giữ nguyên.
