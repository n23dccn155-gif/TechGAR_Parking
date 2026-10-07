# algo-web-v2 Redesign — Implementation Plan (MEGAPLAN)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development (khuyến nghị — lead giao từng task cho builder, reviewer độc lập kiểm trước task kế) hoặc superpowers:executing-plans. Steps dùng checkbox `- [ ]`.

**Goal:** Ghi đè `D:\TechGar2\algo-web-v2` bằng site học thuật toán TechGAR mới: 23 trang cơ chế khung 7 mục (+ Tổng quan + Hành trình), ảnh frame camera thật, giọng báo cáo NCKH, UI hiện đại không bo góc/không chữ nghiêng/không nền kem, font Việt chuẩn.

**Architecture:** Site tĩnh `file://` (HTML/CSS/JS thuần, hash router, không module ES, không CDN). Mỗi trang là **một file dữ liệu** `js/pages/<slug>.js` gọi `TG.definePage({...})` theo schema cố định (§Schema); **một renderer duy nhất** (`js/core/render.js`) dựng 7 mục → builder chỉ viết nội dung, không viết DOM. Ảnh thật sinh bằng script Python (OpenCV + PIL) lưu trong `algo-web-v2/tools/`. QA bằng Playwright + lint tĩnh Node.

**Tech Stack:** HTML/CSS/vanilla JS · Playwright (`@playwright/test` từ `D:/TechGar2/frontend/node_modules`, như `qa/smoke.mjs` cũ) · Python venv `backend/main_detect/.venv` (cv2, numpy; PIL — kiểm tra có sẵn, nếu thiếu thì dừng báo lead, không tự cài vào venv backend) · font woff2 local (Inter, JetBrains Mono).

**Spec:** `D:\TechGar2\.analysis\algo-web-v2-redesign\SPEC.md` (đã duyệt kèm §6b UI). Executor đọc cả spec lẫn plan.

## Global Constraints

- Chỉ ghi trong `D:\TechGar2\algo-web-v2\` và `D:\TechGar2\.analysis\algo-web-v2-redesign\`. **Cấm sửa** `backend/`, `frontend/`, `docs/`; `backend/main_detect/experiment_test/output/` **chỉ đọc**. 6 file tracked đang modified (`cross_camera_manager.py`, `slot_vehicle_binder.py`, `trajectory_memory.py`, `two_camera.py`, 2 test) không được đụng.
- `algo-web-v2/` **chưa được git theo dõi** → backup bắt buộc (Task 0) trước mọi thao tác xóa.
- Không CDN, không ES module, không `fetch` (chạy `file://`), không `Math.random` không seed.
- UI: `border-radius: 0` ở mọi nơi; không `italic/oblique`; nền trắng/xám lạnh nhạt, **không nền kem/be**; font Inter + JetBrains Mono local (subset Vietnamese), fallback `Segoe UI`, `Arial`; thân ≥16px desktop / ≥15px mobile; tương phản ≥4.5:1; một màu nhấn xanh dương.
- Văn: câu đầy đủ chủ–vị, câu ≤ ~30 từ ở lớp mặc định; **thuật ngữ giữ tiếng Anh**, lần đầu trong trang kèm tiếng Việt trong ngoặc, lần sau hover tooltip; ký hiệu nội bộ (`N#`, `T#`, `ccm:`, `tc:`) chỉ ở mục ⑦.
- Mọi con số: `file:dòng` hoặc nhãn `(minh họa)`; lý do không có trong code ghi "suy luận". **Code là chuẩn, docx/báo cáo chỉ tham khảo.**
- Kết quả replay chỉ là baseline, **không phải độ chính xác ground truth** (GT gần như rỗng). Chỉ E-C-002 (sang8) là CONFIRMED mất lineage GID; còn lại UNSURE/ứng viên. Không nói "hệ thống đúng" chỉ vì không thấy lỗi.
- Ảnh thật: JPEG ≤ ~200 KB, caption ghi `session/frame/cam`, annotation bằng script lưu trong repo.
- QA cũ (46/46 smoke) không được tính cho site mới.

## Review Focus

1. **`file:dòng` lệch sau khi code backend đổi** (nhiều file đang modified) → lint resolve phải kiểm cả nội dung tại dòng (symbol/giá trị trích dẫn xuất hiện trong ±5 dòng), không chỉ dòng tồn tại.
2. **Glossary term lạ / viết hoa-thường khác** (`kalman filter` vs `Kalman filter`) → resolve không phân biệt hoa thường; term không tồn tại phải làm Playwright fail, không chỉ cảnh báo.
3. **Trang có mục rỗng hoặc sai thứ tự** (builder bỏ ⑤ khi không có ảnh) → schema cho phép `figures: []` nhưng bắt buộc `noFigureReason`; renderer vẫn render tiêu đề ⑤ kèm lý do.
4. **Mobile 390px tràn ngang** (bảng tham số, công thức dài, `pre` mã giả) → test `document.documentElement.scrollWidth <= innerWidth` ở mọi trang.
5. **Font Việt rơi về font hệ thống/ô vuông** khi woff2 không load qua `file://` → test `document.fonts.check` + đo độ rộng chuỗi `ặữựềẫỗ` bằng canvas so với fallback.
6. **Số trong ④ không khớp số trong ③/③** (copy sai) → lint đối chiếu: mọi số xuất hiện trong `params[].value` phải có trong `sources[]`/`params` cùng trang và không mâu thuẫn giá trị cùng `name`.

---

## Schema trang (hợp đồng giữa mọi task)

```js
// js/pages/<slug>.js
TG.definePage({
  id: 'homography',                 // slug = tên file, [a-z0-9-]+
  group: 'setup',                   // setup|single-cam|multi-cam|binding|gate-frontend|data
  title: 'Homography & shared map',
  order: 3,                         // thứ tự trong manifest
  prev: 'parking-slots', next: 'brightness',   // id hoặc null
  fn:  { text: 'Một hoặc hai câu đầy đủ.' },                      // ①
  why: { paras: ['đoạn 1', 'đoạn 2'] },                           // ②
  how: [                                                           // ③
    { id: '3.1', name: 'Tên cơ chế',
      paras: ['câu đầy đủ… dùng [[Term]] để gắn glossary'],
      values: [ { k: 'tham số', v: '2.0 cm', kind: 'config', src: 'file.py:123' } ] }
  ],
  formulas: [                                                      // ④ a
    { name: 'Ngưỡng suy ra', expr: 'thr = median_slot_length × 1.75',
      subst: '9.2675 × 1.75', result: '≈ 16.22 cm', note: 'vì sao', src: 'file.py:456' }
  ],
  params: [                                                        // ④ b
    { name: 'match_threshold', value: '0.78', kind: 'runtime', role: 'ý nghĩa 1 câu', src: 'file.py:789' }
  ],
  figures: [ { src: 'assets/real/homography-cam1-f120.jpg', alt: '…',
               caption: '…', origin: 'session_xxx/f120/cam1' } ],  // ⑤
  noFigureReason: null,             // bắt buộc (string) nếu figures rỗng
  interactive: null,                // null | 'roi' | 'homography' | 'occlusion' | 'assignment'
  limits: [ { text: '…', evidence: { session: 'verify_cur_session_hiep_sang8', frame: 595,
              status: 'CONFIRMED' } } ],                           // ⑥ (evidence tuỳ chọn; status: CONFIRMED|UNSURE|REJECTED)
  sources: [ { ref: 'file.py:123', kind: 'runtime', note: '…' } ],  // ⑦ kind: runtime|config|derived|illustrative|inference
  pseudocode: null                  // string tuỳ chọn, hiển thị trong ⑦
});
```

`kind` hợp lệ: `runtime` (giá trị thực chạy, từ config runtime/CLI), `config` (JSON/config file), `derived` (tính từ giá trị khác — phải có `formulas`), `class-default` (mặc định trong class, có thể bị runtime ghi đè), `illustrative` (minh họa, ghi `(minh họa)` ở text), `inference` (lý do suy luận từ code).

Markup văn bản: `[[Kalman filter]]` → renderer tra glossary (không phân biệt hoa thường); lần đầu trong trang xuất `Kalman filter (bộ lọc dự đoán vị trí)`, các lần sau `<abbr class="term" tabindex="0" data-vi="…">`. Term không có trong glossary → `console.error` + Playwright fail.

Glossary entry (`js/glossary-data.js`): `TG.defineTerms([{ term:'Kalman filter', vi:'bộ lọc dự đoán vị trí', def:'định nghĩa đời thường 1–3 câu', role:'vai trò trong TechGAR', example:'ví dụ thật', page:'kalman-lapjv', aliases:['kalman'] }])`.

Quick values (`js/quickvalues-data.js`): `TG.defineQuickValues([{ name, value, kind, src, page }])`.

## File Structure (đích)

```
algo-web-v2/
  index.html                    # shell + <script> theo thứ tự
  README.md                     # viết lại (cách mở, cấu trúc, cách thêm trang, QA)
  assets/fonts/                 # Inter + JetBrains Mono woff2 (Vietnamese subset) + LICENSE
  assets/real/                  # ảnh thật đã annotate (*.jpg) + manifest.json (origin từng ảnh)
  css/tokens.css                # biến màu/cỡ chữ/khoảng cách
  css/base.css                  # reset, typography, layout
  css/components.css            # nav, section, table, figure, term tooltip, formula
  js/core/tg.js                 # namespace, registries, rng, utils (giữ từ v2, đã gọn)
  js/core/router.js             # hash router (#/, #/p/<id>, #/glossary, #/values, #/journey, #/search)
  js/core/render.js             # renderPage(def) → 7 mục
  js/core/terms.js              # TG.defineTerms, resolve [[Term]], tooltip
  js/core/search.js             # index + UI tìm kiếm
  js/core/interactive/          # roi.js, homography.js, occlusion.js, assignment.js (Task 10)
  js/manifest.js                # nhóm + thứ tự trang (sinh từ definePage hoặc khai báo tay)
  js/glossary-data.js
  js/quickvalues-data.js
  js/pages/*.js                 # 23 trang cơ chế + overview.js + journey.js
  tools/extract_frames.py       # trích frame từ video/outputs
  tools/annotate.py             # PIL vẽ chú thích theo spec JSON
  tools/figures/*.json          # spec annotation mỗi ảnh (nguồn, frame, hình vẽ)
  qa/lint.mjs                   # lint văn + CSS + nguồn
  qa/e2e.mjs                    # Playwright
  qa/out/                       # ảnh chụp, log (ignored khi nộp)
```

## Phân công

| Ai | Việc |
|---|---|
| **lead (Devin p6)** | Task 0 (backup), điều phối, review chéo, viết trang mẫu **R0 = Homography** (Task 4), cổng dừng cho user, báo cáo cuối (Task 13). Không viết hàng loạt. |
| **builder-c** | Task 1 (khung + UI), Task 2 (QA harness), Task 3 (pipeline ảnh), Task 10 (tương tác), Task 11 (glossary/values/search/overview/journey nối ghép), nhóm 5+6 (Task 9). |
| **builder-a** | Nhóm 1+2: trang 1–9 (Task 6). |
| **builder-b** | Nhóm 3+4: trang 10–15 (Task 8). |

Thứ tự phụ thuộc: **0 → 1 → (2 ∥ 3) → 4 → CỔNG USER → (6 ∥ 8 ∥ 9) → 10 → 11 → 12 → 13**.
(Task 5 và 7 không dùng; số task giữ liền mạch với các nhóm trang bên dưới: nhóm trang = Task 6/8/9.)

---

### Task 0: Backup và đóng băng bản cũ (lead)

**Files:**
- Create: `D:\TechGar2\.analysis\algo-web-v2-redesign\backup-old-v2\` (bản sao nguyên thư mục cũ)
- Create: `D:\TechGar2\.analysis\algo-web-v2-redesign\backup-old-v2.sha256`
- Create: `D:\TechGar2\.analysis\algo-web-v2-redesign\git-baseline.txt`

**Interfaces:** Produces: bản backup đã xác minh; không file nào bị xóa trước khi có `backup-old-v2.sha256` khớp.

- [ ] **Step 1: Ghi baseline git (để sau chứng minh không đụng backend)**

```powershell
cd D:\TechGar2
git rev-parse HEAD > .analysis\algo-web-v2-redesign\git-baseline.txt
git status --short >> .analysis\algo-web-v2-redesign\git-baseline.txt
git diff --stat -- backend frontend docs >> .analysis\algo-web-v2-redesign\git-baseline.txt
```

- [ ] **Step 2: Sao lưu và băm**

```powershell
robocopy D:\TechGar2\algo-web-v2 D:\TechGar2\.analysis\algo-web-v2-redesign\backup-old-v2 /E /NFL /NDL /NJH /NJS
Get-ChildItem D:\TechGar2\algo-web-v2 -Recurse -File | Get-FileHash -Algorithm SHA256 | ForEach-Object { "$($_.Hash)  $($_.Path.Substring(24))" } | Sort-Object { $_.Split(' ')[2] } > D:\TechGar2\.analysis\algo-web-v2-redesign\backup-old-v2.sha256
```

- [ ] **Step 3: Xác minh bản sao khớp**

```powershell
$a=(Get-ChildItem D:\TechGar2\algo-web-v2 -Recurse -File).Count
$b=(Get-ChildItem D:\TechGar2\.analysis\algo-web-v2-redesign\backup-old-v2 -Recurse -File).Count
"$a $b"
```
Expected: hai số bằng nhau (~780). Khác nhau → dừng, báo lead, không làm tiếp.

- [ ] **Step 4: Kiểm tra công cụ**

```powershell
D:\TechGar2\backend\main_detect\.venv\Scripts\python.exe -c "import cv2, numpy; from PIL import Image; print(cv2.__version__)"
node -e "const r=require('module').createRequire('D:/TechGar2/frontend/package.json'); console.log(!!r('@playwright/test'))"
```
Expected: in version OpenCV và `true`. Thiếu PIL → **dừng, báo user** (không `pip install` vào venv backend); phương án thay: Task 3 dùng OpenCV vẽ (`cv2.line/circle/putText` — nhưng Unicode tiếng Việt cần PIL; nếu thiếu PIL thì nhãn trên ảnh viết ASCII/số và chú thích nằm ở caption HTML).

---

### Task 1: Khung site + UI mới (builder-c)

**Files:**
- Create: `index.html`, `css/tokens.css`, `css/base.css`, `css/components.css`
- Create: `js/core/render.js`, `js/core/terms.js`, `js/core/search.js`
- Modify (rút gọn): `js/core/tg.js`, `js/core/router.js`
- Create: `js/manifest.js` (ghi đè), `js/glossary-data.js`, `js/quickvalues-data.js` (khung rỗng hợp lệ)
- Create: `assets/fonts/*` (Inter 400/600/700, JetBrains Mono 400/600 — woff2 subset `latin` + `latin-ext` + `vietnamese`) + `assets/fonts/LICENSE.txt`
- Create: `js/pages/_fixture.js` (trang thử, **xóa ở Task 12**)
- **Không xóa** `js/content/*`, `js/pages/*` cũ ở task này (đợi Task 12).

**Interfaces:**
- Produces: `TG.definePage(def)`, `TG.getPageDef(id)`, `TG.pageIds()`, `TG.defineTerms(list)`, `TG.getTerm(name)`, `TG.defineQuickValues(list)`, `TG.validatePage(def) → string[]` (lỗi schema), `renderPage(def) → HTMLElement`; routes `#/`, `#/p/<id>`, `#/glossary`, `#/values`, `#/journey`, `#/search?q=`.
- Consumes: schema §Schema.

- [ ] **Step 1: Lấy font local (có kiểm tra tuổi gói)**

```powershell
cd D:\TechGar2\algo-web-v2\tools
npm view @fontsource/inter time --json | node -e "const t=JSON.parse(require('fs').readFileSync(0));const v=Object.entries(t).filter(([k])=>!['created','modified'].includes(k)).sort((a,b)=>new Date(b[1])-new Date(a[1])).find(([k,d])=>Date.now()-new Date(d)>7*864e5);console.log(v[0])"
```
Dùng đúng phiên bản in ra (≥7 ngày tuổi) cho `npm pack @fontsource/inter@<v>` và `@fontsource/jetbrains-mono@<v>` vào thư mục tạm **ngoài** `algo-web-v2/`; chỉ copy các file `*-vietnamese-{400,600,700}-normal.woff2`, `*-latin-*`, `*-latin-ext-*` + LICENSE vào `assets/fonts/`. Không thêm `package.json`/`node_modules` vào `algo-web-v2/`.

- [ ] **Step 2: Viết `css/tokens.css`** (nguồn duy nhất của màu/cỡ chữ)

```css
@font-face{font-family:"Inter";font-weight:400;src:url("../assets/fonts/inter-vietnamese-400-normal.woff2") format("woff2");unicode-range:U+0102-0103,U+0110-0111,U+0128-0129,U+0168-0169,U+01A0-01A1,U+01AF-01B0,U+0300-0301,U+0303-0304,U+0308-0309,U+0323,U+0329,U+1EA0-1EF9,U+20AB}
/* lặp @font-face cho latin, latin-ext, 600, 700 và JetBrains Mono tương ứng */
:root{
  --bg:#ffffff; --bg-alt:#f4f6f8; --line:#d9dee4; --text:#14202b; --muted:#4b5b6b;
  --accent:#0b57d0; --accent-ink:#ffffff; --ok:#13795b; --bad:#b3261e;
  --font:"Inter","Segoe UI",Arial,sans-serif; --mono:"JetBrains Mono",Consolas,monospace;
  --fs:16px; --lh:1.65; --measure:72ch; --nav-w:280px; --toc-w:200px;
}
*{border-radius:0 !important; font-style:normal}
em,i,cite,address,dfn,var{font-style:normal}
@media(max-width:719px){:root{--fs:15px}}
```

- [ ] **Step 3: `base.css` + `components.css`** — layout: `body{background:var(--bg);color:var(--text);font:var(--fs)/var(--lh) var(--font)}`; nav trái cố định `position:sticky` rộng `--nav-w` (desktop ≥ 1100px), menu trượt (<720px, nút ≥44px); nội dung `max-width:920px`; mục lục nổi phải ≥1280px; mỗi mục ①–⑦ là `<section class="sec" id="s1">…` với `<h2><span class="sec-no">1</span>Chức năng & vị trí</h2>` phân cách bằng `border-top:1px solid var(--line)`; **không** card có shadow/bo góc; bảng `.tbl` cuộn ngang trong `.tbl-wrap{overflow-x:auto}`; `.formula` dùng CSS (`.frac` dùng `display:inline-grid` + gạch ngang `border-bottom`); `.term{border-bottom:1px dotted var(--accent);cursor:help}`; tooltip `.tip` vuông, nền `--text`, chữ trắng; `.badge-confirmed/-unsure/-rejected` nền vuông; `figure img{max-width:100%;height:auto}`; mobile: figures cuộn ngang (`scroll-snap`), `pre{overflow-x:auto}`.

- [ ] **Step 4: Viết test schema trước (chạy bằng node, không cần browser)**

`qa/schema.test.mjs`:
```js
import fs from 'fs'; import vm from 'vm';
const ctx={window:{},console}; ctx.window=ctx; vm.createContext(ctx);
for (const f of ['js/core/tg.js','js/core/terms.js','js/core/render.js']) vm.runInContext(fs.readFileSync(f,'utf8'),ctx);
const bad = ctx.TG.validatePage({id:'x'});
if(!bad.length) throw new Error('validatePage phải báo lỗi cho trang thiếu mục');
const good = ctx.TG.validatePage(JSON.parse(fs.readFileSync('qa/fixtures/valid-page.json','utf8')));
if(good.length) throw new Error('trang hợp lệ bị báo lỗi: '+good.join('; '));
console.log('schema ok');
```
Run: `node qa/schema.test.mjs` → Expected: **FAIL** (validatePage chưa có). Tạo `qa/fixtures/valid-page.json` đủ 7 mục.

- [ ] **Step 5: Cài `tg.js` (rút gọn), `terms.js`, `render.js`, `router.js`**

`TG.validatePage` kiểm: `id` khớp `/^[a-z0-9-]+$/`; có `group,title,order,fn.text,why.paras[≥1],how[≥1],formulas|params (ít nhất một khác rỗng),limits[≥1],sources[≥1]`; `figures` rỗng ⇒ `noFigureReason` là string không rỗng; mỗi `values[]`/`params[]`/`sources[]` có `kind` hợp lệ và `src` (trừ `illustrative`); `how[i].id` dạng `^3\.\d+$` tăng dần; `limits[].evidence.status ∈ CONFIRMED|UNSURE|REJECTED`.

`renderPage` luôn xuất 7 `<section>` với `id="s1"…"s7"` theo đúng thứ tự (kể cả ⑤ rỗng → hiển thị `noFigureReason`), khối ⑦ nằm trong `<details>` (đóng sẵn), badge `CONFIRMED/UNSURE/REJECTED` cho `limits[].evidence`, dải ① "← prev | trang này | next →" dùng `prev/next`.

- [ ] **Step 6: Run schema test → PASS**, rồi mở `index.html#/p/_fixture` bằng file:// kiểm thủ công 1440×900 và 390×844 (chỉ để debug; QA chính thức ở Task 2).

- [ ] **Step 7: Commit?** `algo-web-v2/` chưa tracked: **không `git add`** thư mục này. Thay bằng ghi checkpoint vào `.analysis/algo-web-v2-redesign/PROGRESS.md` (file/ngày/hash `index.html`).

---

### Task 2: QA harness — lint + Playwright (builder-c, song song Task 3)

**Files:**
- Create: `qa/lint.mjs`, `qa/e2e.mjs`, `qa/lib/sources.mjs`
- Test: `qa/fixtures/*` (trang xấu/tốt để chứng minh lint bắt được lỗi)

**Interfaces:**
- Consumes: schema; `TG.pageIds()`; file `js/pages/*.js` (nạp bằng `vm` giống Task 1 để lấy def dạng object).
- Produces: `node qa/lint.mjs [--pages=a,b]` exit≠0 nếu có lỗi mức ERROR; `node qa/e2e.mjs [--file-only] [--pages=a,b]` ghi `qa/out/e2e.log`.

- [ ] **Step 1: Viết fixture xấu** `qa/fixtures/bad-*.json`: câu 45 từ; ký hiệu `ccm:` ngoài sources; `[[Term lạ]]`; CSS có `border-radius:6px`; CSS có `font-style:italic`; nền `#f5f0e1`; số `0.78` ở params không có `src`; `file:dòng` trỏ dòng quá file; `figures` rỗng không có reason.

- [ ] **Step 2: Viết `qa/lint.mjs`** — các luật (ERROR trừ khi ghi WARN):
  1. Schema (`TG.validatePage`) — ERROR.
  2. Câu quá dài: tách `paras[]` theo `[.!?…]\s`, đếm từ; >30 từ → WARN, >45 từ → ERROR. Bỏ qua nội dung trong `formulas`, `params`, `pseudocode`.
  3. Câu cụt (heuristic): đoạn `paras` có câu <4 từ **không** kết thúc bằng dấu câu, hoặc chứa ký tự `→` làm động từ chính ("blob thuần-vành → loại") → WARN; ≥3 cảnh báo cùng trang → ERROR.
  4. Ký hiệu nội bộ `\b(N\d{1,2}|T[123]|ccm:|tc:)\b` ngoài `sources`/`pseudocode` → ERROR.
  5. `[[Term]]` không tồn tại trong glossary → ERROR; term trong glossary không có `vi/def/role/example/page` → ERROR; `page` không phải id trang thật → ERROR.
  6. Số không nguồn: mọi `params[]`/`values[]` thuộc `kind` ≠ `illustrative` phải có `src`; `illustrative` phải có chữ `(minh họa)` trong `role`/`note`/`k` → ERROR.
  7. `src` resolve (`lib/sources.mjs`): tách `path:line[-line]`, path tương đối `D:\TechGar2`; file tồn tại; dòng ≤ số dòng file; **và** nếu `src` có kèm `sym` (tuỳ chọn, chuỗi) thì `sym` phải xuất hiện trong ±5 dòng quanh dòng đó → ERROR. Với số liệu có `sym` không tìm thấy ⇒ ERROR "nguồn lệch".
  8. CSS tĩnh trên `css/*.css`: regex `border-radius\s*:\s*(?!0\b)[^;!]+` (cho phép `0` và `0 !important`) → ERROR; `font-style\s*:\s*(italic|oblique)` → ERROR; màu nền cream: phân tích mọi `#rrggbb`/`rgb()` trong thuộc tính `background*` — nếu `r>g>b`, `r−b ≥ 12` và `r ≥ 235` (dải kem/be/vàng nhạt) → ERROR; tương phản `--text` trên `--bg` ≥ 4.5 (tính tay) → ERROR.
  9. Trang trùng `order`/`id`; `prev/next` không trỏ trang tồn tại → ERROR.
  10. Mỗi `figures[].src` file tồn tại, ≤ 260 KB, và có mục tương ứng trong `assets/real/manifest.json` (`origin`) → ERROR.

- [ ] **Step 3: Run lint trên fixture xấu → Expected: FAIL, mỗi luật 1–N lỗi, tổng số lỗi in ra.** Run lint trên `qa/fixtures/valid-page.json` → PASS.

- [ ] **Step 4: Viết `qa/e2e.mjs`** (bám `qa/smoke.mjs` cũ: `createRequire('D:/TechGar2/frontend/package.json')`, hai chế độ `file://` và `http://127.0.0.1:8799` bằng `python -m http.server` PID riêng, kill sau run). Với mỗi trang × 2 viewport (1440×900, 390×844):
  - `page.on('console'|'pageerror')` ⇒ bất kỳ error → FAIL; `page.on('request')` có URL không phải `file://`/`127.0.0.1` → FAIL.
  - 7 `section#s1..#s7` có mặt đúng thứ tự (`querySelectorAll('main section.sec')` map id).
  - Mọi `img` trong trang: `complete && naturalWidth>0`.
  - `document.documentElement.scrollWidth <= window.innerWidth` (không tràn ngang), trừ phần tử bên trong `.tbl-wrap`/`pre`.
  - Tất cả `a[href^="#/"]` resolve được trang/route có thật.
  - Mọi `abbr.term` focus/hover hiện tooltip có chữ (kiểm 3 term đầu/trang).
  - Font: `await document.fonts.ready`; `document.fonts.check('16px Inter','ặữựềẫỗ')` true và đo `canvas.measureText('ặữựềẫỗ')` với `Inter` khác với `serif` fallback (chứng minh Inter đã load).
  - Computed style quét toàn bộ phần tử thấy được: `borderTopLeftRadius==='0px'` và `fontStyle==='normal'` cho 100% phần tử; `getComputedStyle(body).backgroundColor` không thuộc dải cream.
  - Chụp `qa/out/<id>-1440.png`, `<id>-390.png`.
  - Determinism: nạp trang 2 lần, so sánh `main.innerHTML` (loại `data-*` runtime) — phải giống hệt.
  - Toàn cục: điều hướng nav → mọi trang; search “EMA” trả ≥1 kết quả trỏ đúng trang; `#/values` có ≥ N dòng và mỗi dòng có link nguồn; `#/glossary` mọi term resolve được `page`.

- [ ] **Step 5: Run `node qa/e2e.mjs --pages=_fixture` → Expected: PASS** sau Task 1; cố ý sửa fixture (xóa ⑤) → FAIL, rồi hoàn lại.

- [ ] **Step 6: Checkpoint vào PROGRESS.md.**

---

### Task 3: Pipeline ảnh thật (builder-c, song song Task 2)

**Files:**
- Create: `tools/extract_frames.py`, `tools/annotate.py`, `tools/figures/*.json`, `tools/README.md`
- Create: `assets/real/*.jpg`, `assets/real/manifest.json`

**Interfaces:**
- Produces: `python tools/extract_frames.py --session <dir> --cam 1|2 --frame N --source raw|debug --out <path>`; `python tools/annotate.py tools/figures/<fig>.json` → ghi JPEG vào `assets/real/` và cập nhật `manifest.json` (`{file, origin:"session/fNNN/camX", source:"raw|debug", sha256_of_source_frame}`).
- Spec annotation JSON: `{ "id":"homography-cam1-f120", "session":"…", "cam":1, "frame":120, "source":"raw", "draw":[ {"type":"circle","xy":[x,y],"r":10,"color":"#0b57d0","label":"P1"}, {"type":"arrow","from":[x,y],"to":[x,y],"label":"…"}, {"type":"box","xyxy":[x1,y1,x2,y2],"label":"…"}, {"type":"polygon","pts":[[x,y],…],"label":"…"} ], "max_kb":200 }`.

- [ ] **Step 1: Viết test trước** `tools/test_annotate.py` (unittest): tạo ảnh tổng hợp 640×360, spec 1 circle + 1 arrow + 1 label Việt `ặữ`, chạy `annotate`, assert file tồn tại, ≤ `max_kb`, kích thước đúng, và `manifest.json` có entry. Run `python tools/test_annotate.py` → FAIL (chưa có module).

- [ ] **Step 2: Implement** `extract_frames.py` (cv2.VideoCapture, `CAP_PROP_POS_FRAMES`, kiểm frame tồn tại; ghi PNG tạm) và `annotate.py` (PIL, font `assets/fonts/Inter-*.ttf`… nếu chỉ có woff2 thì dùng `C:\Windows\Fonts\segoeui.ttf` cho nhãn; lưu JPEG quality giảm dần tới khi ≤ `max_kb`). Bắt buộc ghi `origin` vào manifest.

- [ ] **Step 3: Run test → PASS.**

- [ ] **Step 4: Khảo sát nguồn thật.** Liệt kê `backend/main_detect/experiment_test/output/verify_cur_*/` (tên file video: `raw_cam*.mp4`, `debug_cam*.mp4`, `predictions.jsonl`). Ghi `tools/SOURCES.md`: mỗi session có video nào, độ phân giải, số frame. Nếu một session thiếu video thì ghi rõ, không bịa.

- [ ] **Step 5: Làm mẻ ảnh thử cho R0 (Homography)** — tối thiểu 2 ảnh: (a) frame cam1 + frame cam2 của cùng một thời điểm có xe, vẽ điểm hiệu chuẩn nếu `config/two_camera.shared_cm_01.json` có tọa độ pixel tương ứng (đọc file để biết đúng điểm, **không tự đặt điểm**); (b) ảnh minh họa chiếu lên bản đồ nếu có dữ liệu. Báo lead danh sách ảnh + `origin`.

- [ ] **Step 6: Danh sách ảnh ưu tiên cho các trang còn lại** (trích sau khi trang được giao, mỗi lần qua builder-c hoặc builder tự gọi script): handoff (2 cam cùng xe), occlusion trước/sau watershed, lỗi sang8 f595 (`gid3`) và gap f301–f594 cam2 (đối chiếu `.analysis/verify-replay/ERRORS-SUMMARY.md`, E-C-002), duplicate track, phantom coasting burst, parking slot binding, ROI mask overlay. Mỗi ảnh có một `tools/figures/<id>.json` nên tái lập được.

- [ ] **Step 7: Checkpoint PROGRESS.md.**

---

### Task 4: Trang mẫu R0 — Homography (lead)

**Files:**
- Create: `js/pages/homography.js` (**ghi đè file cùng tên của bản cũ ở `js/pages/` chỉ sau khi Task 12 dọn; trong lúc chuyển tiếp tạo ở `js/pages/homography.js` mới và đưa bản cũ vào backup — vì `index.html` mới chỉ nạp file mới nên không xung đột**).
- Modify: `js/glossary-data.js`, `js/quickvalues-data.js`, `js/manifest.js`
- Create: `tools/figures/homography-*.json`

**Interfaces:** Consumes Task 1–3. Produces: mẫu giọng/khung cho mọi builder (tham chiếu file này).

- [ ] **Step 1: Đọc code thật và ghi bảng nguồn**: `backend/main_detect/tools/calibrate_shared_map.py`, `config/two_camera.shared_cm_01.json`, `backend/main_detect/src/techgar/cross_camera_manager.py` (grep `shared_map_anchor`, `median_slot_length`, `fit`, `ema`/`velocity`). Với mỗi giá trị trong danh sách dưới, ghi `file:dòng` thật **hoặc** ghi "không tìm thấy" và **bỏ giá trị đó khỏi trang** (không dùng số từ ví dụ Gemini mà chưa xác minh):
  - 8 cặp điểm tương ứng (4 góc mét + 4 điểm vạch làn); tại sao hơn 4.
  - Fit-gate: 2.0 cm / 8.5 px / 12 px — ngưỡng nào thuộc cấu hình nào.
  - `shared_map_anchor`: class default vs runtime override `bbox_center`.
  - `median_slot_length = 9.267515 cm` × {1.75, 2.75, 1.75, 0.50}; `min(config, derived)`; các giá trị resolved 15.0 / 25.0 / 16.218 / 4.634.
  - EMA vận tốc 0.65 / 0.35.
- [ ] **Step 2: Viết trang** theo schema: ≥4 khối ③ (3.1 điểm tương ứng, 3.2 fit-gate, 3.3 anchor, 3.4 ngưỡng suy ra, 3.5 EMA); ④ có đủ phép thay số (`9.2675 × 1.75 ≈ 16.22 cm`, `9.2675 × 2.75 ≈ 25.49 cm`, `9.2675 × 0.50 ≈ 4.63 cm`, `0.65·v_old + 0.35·v_inst` với ví dụ số **gắn `(minh họa)`**); ⑥ nêu giới hạn thật (ví dụ: calibration cố định theo thời điểm, sai lệch khi dời camera) — chỉ viết điều kiểm chứng được từ code/config; ⑤ có ≥1 ảnh thật.
- [ ] **Step 3: Thêm term vào glossary** cho mọi `[[…]]` dùng (Homography, correspondence, reprojection error, fit gate, bounding box, EMA, anchor…).
- [ ] **Step 4: `node qa/lint.mjs --pages=homography` PASS và `node qa/e2e.mjs --pages=homography` PASS** (file + http).
- [ ] **Step 5: Tự đọc lại như người học** (không nhìn code): mỗi khối ③ trả lời đủ "cái gì / vì sao / số bao nhiêu / hệ quả"? Câu nào còn cụt thì viết lại.
- [ ] **Step 6: DỪNG — CỔNG USER #2.** Gửi user: đường dẫn trang, ảnh chụp 1440 và 390, danh sách nguồn đã xác minh, danh sách giá trị bị bỏ vì không xác minh được. **Không nhân rộng trước khi user duyệt giọng văn, khung, UI.**

---

### Task 6: Nhóm 1+2 — Hiệu chuẩn & theo vết một camera (builder-a) — trang 1–9

**Gate:** chỉ bắt đầu sau khi user duyệt R0.

**Files (mỗi trang 1 file):** `js/pages/roi-mask.js`, `parking-slots.js`, `homography.js` (đã có), `brightness.js`, `motion-detection.js`, `contour-filtering.js`, `kalman-lapjv.js`, `track-lifecycle.js`, `occlusion-watershed.js`; thêm term/values; `tools/figures/*.json`.

**Nguồn code gợi ý (đọc để tìm giá trị; số dòng phải tự xác minh):**
| Trang | Đọc |
|---|---|
| roi-mask | `backend/main_detect/mask_roi.py`, `config/roi_mask_cam{1,2}.json`, nơi `motion_tracker.py` áp mask |
| parking-slots | `tools/ParkingSpacePicker_ve_js.py`, `tools/draw_gate_zones.py`, `config/parking_slots_cam*.json`, `config/gate_zones.json` |
| brightness | brightness/exposure trong `motion_tracker.py` |
| motion-detection | MOG2 + morphology trong `motion_tracker.py` |
| contour-filtering | lọc diện tích/tỉ lệ/vành ROI trong `motion_tracker.py` |
| kalman-lapjv | `_new_kalman` (Q/R/P0), LAPJV/gating trong `motion_tracker.py` |
| track-lifecycle | trạng thái tentative/matched/coasting/lost, TTL trong `motion_tracker.py` |
| occlusion-watershed | `occlusion_guard.py` |

Mỗi trang là **một task con** theo mẫu dưới (lặp cho từng trang, không gộp):

- [ ] **Step A: Đọc code, lập bảng `giá trị → file:dòng → kind`** (ghi vào `.analysis/algo-web-v2-redesign/notes/<slug>.md`, ngắn).
- [ ] **Step B: Viết trang** theo schema; tuân khung 7 mục, giọng R0 (đọc lại `homography.js`).
- [ ] **Step C: Thêm glossary/quick-values** cho mọi term/giá trị mới; không để term mồ côi.
- [ ] **Step D: Trích ≥1 ảnh thật** (hoặc `noFigureReason` hợp lý); mục ⑥ lấy ví dụ lỗi thật từ `.analysis/verify-replay/ERRORS-SUMMARY.md` khi liên quan (phantom coasting burst → trang track-lifecycle/motion; duplicate track → occlusion-watershed/kalman-lapjv), ghi đúng nhãn CONFIRMED/UNSURE.
- [ ] **Step E: `node qa/lint.mjs --pages=<slug>` và `node qa/e2e.mjs --pages=<slug>` PASS**; ghi vào `PROGRESS.md`.
- [ ] **Step F: Review chéo:** builder-b đọc trang như người học (không code) và ghi `REVIEW-<slug>.md` ≤10 dòng: câu nào khó hiểu, số nào nghi sai. Sửa đến khi hết lỗi nghiêm trọng.

Hai trang có **tương tác** (xem Task 10): `roi-mask` (kéo đỉnh), `occlusion-watershed` (slider) — builder-a viết nội dung trước với `interactive:'roi'|'occlusion'`; Task 10 cung cấp component.

---

### Task 8: Nhóm 3+4 — Hai camera, GID, ô đỗ (builder-b) — trang 10–15

**Gate:** sau R0 được duyệt.

**Files:** `js/pages/tracklet-descriptor.js`, `trajectory-reid.js`, `handoff-dormant.js`, `gid-conflict.js`, `parking-detector.js`, `slot-binder.js`.

**Nguồn code gợi ý:**
| Trang | Đọc |
|---|---|
| tracklet-descriptor | `tracklet_descriptor.py` |
| trajectory-reid | `trajectory_memory.py`, `cross_camera_manager.py` (quanh L5430–5487: `trajectory_score`, `match_threshold 0.78`, thành phần `direction/time_topology/speed/corridor/appearance/world_distance`) |
| handoff-dormant | `cross_camera_manager.py` (handoff, dormant reid, `dormant_reid_rejected`) |
| gid-conflict | `cross_camera_manager.py` (xung đột/merge/probation) |
| parking-detector | `parking_detector.py` |
| slot-binder | `slot_vehicle_binder.py` |

Lưu ý: `cross_camera_manager.py`, `slot_vehicle_binder.py`, `trajectory_memory.py` **đang bị modified** → dùng bản đang có trên đĩa, ghi trong `notes/` timestamp/hash file lúc đọc để lệch sau này dễ truy.

- [ ] Lặp Step A–F của Task 6 cho từng trang.
- [ ] **handoff-dormant ⑥ bắt buộc có** ca E-C-002: session `verify_cur_session_hiep_sang8`, cam2, track cũ `lid35/gid1` kết thúc ≈ f301 tại ≈(397,118); track mới `lid40/gid3` ≈ f595 tại ≈(388,119); `trajectory_score = 0.6683 < 0.78`, `direction≈0.001`, `time_topology=0.0` (lấy chính xác từ `predictions.jsonl`/`world_trajectory_rejections` — **đọc lại và ghi số thật**, không chép từ tóm tắt này). Nhãn `CONFIRMED` chỉ cho "xe vật lý cùng một chiếc nhận GID mới". Viết rõ: hệ quả cuối lên slot/session **chưa chứng minh**. Các ca E-C-005, E-A-020, U2 chỉ `UNSURE`; ca đã bị bác ghi `REJECTED` (scanner artifact).
- [ ] **slot-binder ⑥:** nêu rõ "xe đỗ sẵn từ trước không được track (motion-based)" là **giới hạn có chủ đích/kỳ vọng**, không phải bug.
- [ ] Review chéo bởi builder-c.

---

### Task 9: Nhóm 5+6 — Cổng, phiên, frontend, dữ liệu (builder-c) — trang 16–23

**Gate:** sau R0 được duyệt. Làm sau khi Task 10 xong phần dùng chung nếu bị vướng; có thể song song với a/b.

**Files:** `js/pages/snapshot-api.js`, `gate-session.js`, `frontend-dataflow.js`, `routing-astar.js`, `voice-guidance.js`, `predictions-jsonl.js`, `replay-ground-truth.js`, `failure-gallery.js`.

**Nguồn code gợi ý:**
| Trang | Đọc |
|---|---|
| snapshot-api | `runtime_server.py`, `runtime_contract.py`, `prediction_writer.py` |
| gate-session | `gate_session_controller.py`, `session_manager.py`, `config/gate_zones.json` |
| frontend-dataflow | `frontend/src/app/App.tsx`, `MonitorApp.tsx`, `adapters/`, `stores/parkingStore.ts`, `stores/driverFlowStore.ts`, `components/ParkingMap.tsx` |
| routing-astar | `frontend/src/routing/routeEngine.ts`, `laneGraph.ts` (heuristic Euclid, off-route 75px) |
| voice-guidance | `frontend/src/routing/voiceGuidance.ts` |
| predictions-jsonl | `prediction_writer.py` + `predictions.jsonl` thật (đọc vài dòng, nêu event_type có thật: `frozen_ambiguous`, `departure`, `dormant_reid_rejected`, …) |
| replay-ground-truth | `.analysis/verify-replay/*` (18/18 session, 41.625 cặp frame, 83.250 camera frame, ~16.300 cam-frame xem bằng mắt, GT gần như rỗng) + runbook `backend/main_detect/docs/lenh-chay-theo-session.md` |
| failure-gallery | `.analysis/verify-replay/ERRORS-SUMMARY.md` |

- [ ] Lặp Step A–F cho từng trang. Frontend đọc **chỉ để mô tả**, không sửa.
- [ ] **replay-ground-truth:** nêu rõ độ phủ thật (không nói "đã xem từng frame"), và rằng replay chỉ là baseline, không phải accuracy.
- [ ] **failure-gallery:** mỗi lỗi một khối: (1) hiện tượng, (2) bằng chứng ảnh + `session/frame/cam`, (3) cơ chế nghi ngờ (ghi "suy luận" nếu chưa chứng minh bằng code), (4) trạng thái CONFIRMED/UNSURE/EXPECTED. Bắt buộc có: duplicate track, phantom coasting burst, false detection trên vật không phải xe, ID fragmentation (toi6, sang8), E-C-002 (link sang trang handoff-dormant), capture gap (toi5, thai7, thai4, thai1), xe đỗ sẵn không được track (EXPECTED).
- [ ] Review chéo bởi builder-a.

---

### Task 10: Tương tác (builder-c) — 4 component

**Files:** `js/core/interactive/roi.js`, `homography.js`, `occlusion.js`, `assignment.js`; test `qa/e2e.mjs` mở rộng.

**Interfaces:** mỗi file đăng ký `TG.interactive.<name> = { mount(container, ctx) → { destroy() } }`; `ctx = { seed: number }`; `renderPage` gọi khi `def.interactive === name` và đặt trong mục ⑤. Mọi ngẫu nhiên dùng `TG.rng(seed)`.

- [ ] **roi:** polygon vuông-góc, kéo đỉnh (pointer events, hit target ≥ 16px), vùng ngoài polygon phủ xám; hiển thị diện tích còn lại (%). Dùng dữ liệu `config/roi_mask_cam1.json` đã sao thành hằng số trong file (ghi nguồn).
- [ ] **homography:** hai khung (ảnh cam / bản đồ cm), click chọn cặp điểm, tính homography bằng DLT thuần JS (≥4 điểm, least squares với 8 cặp), hiển thị reprojection error cm và so với fit-gate (đọc ngưỡng từ trang). Có nút "bỏ điểm vạch làn" để thấy sai số tăng khi chỉ dùng 4 điểm — **chỉ khi** số liệu minh họa gắn `(minh họa)`.
- [ ] **occlusion:** slider IoU/khoảng cách; hiển thị khi nào nhóm bị đóng băng/tách theo ngưỡng thật đã xác minh ở trang.
- [ ] **assignment:** ma trận chi phí 4×4 có seed, tính LAPJV tương đương (Hungarian thuần JS), tô cặp được chọn; so với gán tham lam. **Tuỳ chọn** — chỉ làm nếu 3 cái trên xong và còn ngân sách; nếu bỏ, ghi lý do vào báo cáo cuối và đặt `interactive:null` ở `kalman-lapjv`.
- [ ] **Test:** Playwright thao tác thật: kéo đỉnh ROI → % đổi; click 8 điểm homography → error hiển thị là số hữu hạn; kéo slider → trạng thái đổi; reload cho kết quả giống nhau (determinism). Chạy `node qa/e2e.mjs --pages=roi-mask,homography,occlusion-watershed` → PASS.

---

### Task 11: Glossary, Số liệu tra nhanh, Search, Tổng quan, Hành trình (builder-c, lead review)

**Files:** `js/glossary-data.js`, `js/quickvalues-data.js`, `js/pages/overview.js`, `js/pages/journey.js`, `js/core/search.js`.

- [ ] **Glossary:** hợp nhất term do các trang thêm; mỗi term đủ `term, vi, def, role, example, page`; **index theo tên tiếng Anh**; không trùng lặp (dedupe alias); thứ tự A–Z; mỗi term tự dẫn tới trang. Bao gồm tối thiểu: `bbox_center`, `shared_map_anchor`, `fit gate`, `EMA`, `dormant ReID`, `reprojection error`, `Homography`, `LAPJV`, `Kalman filter`, `MOG2`, `track`, `GID`, `lid`.
- [ ] **Số liệu tra nhanh:** gom từ `params[]` của mọi trang (script `qa/build-values.mjs` sinh `quickvalues-data.js` để không chép tay); một bảng, sắp theo trang, cột: tên · giá trị · loại · nguồn · trang. Kiểm: số dòng bảng = số `params` toàn site (trừ trùng lặp có chủ đích).
- [ ] **Search:** index từ `title`, `fn.text`, `how[].name`, glossary, `params[].name`; tìm không phân biệt hoa thường/dấu (chuẩn hóa NFD bỏ dấu); kết quả có link `#/p/<id>#s<n>`; test “EMA”, “homography”, “khong gian” (bỏ dấu), “0.78”.
- [ ] **Overview + Journey:** viết theo khung 7 mục rút gọn (overview: ① ② ③ + sơ đồ chặng dạng bảng/SVG tĩnh liên kết tới 23 trang cơ chế; journey: một xe đi qua các chặng, mỗi chặng link tới trang cơ chế). Sơ đồ phải khớp pipeline runtime: `cam → two_camera → motion_tracker → occlusion_guard → tracklet_descriptor → cross_camera_manager → parking_detector/slot_vehicle_binder → prediction_writer → runtime_server :8001 → gate_session_controller :8000 → frontend`.

---

### Task 12: Dọn bản cũ + đóng gói (lead + builder-c)

**Điều kiện:** 23 trang + overview + journey + glossary + values + search đều PASS lint/e2e; backup Task 0 còn nguyên.

- [ ] **Step 1: Liệt kê chính xác file sẽ xóa** (không xóa ngay): `js/content/`, `js/pipeline/` (cũ), `js/core/{draw,player,pseudocode,ui}.js`, `css/app.css`, các `js/pages/*.js` cũ không thuộc 25 file mới, `js/app.js` cũ nếu thay bằng boot mới, `qa/_*.mjs|js`, `qa/smoke.mjs`, `qa/shots/`, `qa/fixture-v3.*`, `*.md` cũ (`CONTRACT.md`, `PROGRESS.md`, `QA.md`, `REVIEW-*.md`, `SPEC.md`, `style-guide-v3.md`). Ghi vào `.analysis/algo-web-v2-redesign/DELETE-LIST.txt`.
- [ ] **Step 2: Hỏi user xác nhận danh sách xóa** (xóa file là thao tác không hoàn tác ngoài backup). Chỉ xóa sau khi user đồng ý; sau xóa, so lại `backup-old-v2.sha256` để chắc backup còn.
- [ ] **Step 3: Xóa `_fixture.js`**, cập nhật `index.html` chỉ nạp file thật.
- [ ] **Step 4: Đóng gói `dist/`** (tuỳ chọn): script `tools/bundle.mjs` gộp CSS + JS (không ES module) và inline ảnh nhỏ nếu hợp lý; nếu không khả thi trong ngân sách, bỏ và nêu trong báo cáo. Nếu làm: `dist/index.html` phải qua `node qa/e2e.mjs --dist`.
- [ ] **Step 5: Viết lại `README.md`** (≤ 80 dòng): cách mở `file://`/http, cấu trúc, cách thêm trang (schema), cách trích ảnh, lệnh QA.

---

### Task 13: QA cuối + báo cáo (lead)

- [ ] **Step 1:** `node qa/lint.mjs` (toàn bộ) → 0 ERROR; liệt kê số WARN còn lại.
- [ ] **Step 2:** `node qa/e2e.mjs` (file + http, 2 viewport, 25 trang + glossary + values + search) → 0 FAIL; lưu log `qa/out/e2e.log` và ảnh chụp.
- [ ] **Step 3:** Chạy `e2e` lần 2 và so hash ảnh/`innerHTML` (determinism).
- [ ] **Step 4: Chứng minh không đụng ngoài phạm vi:**

```powershell
cd D:\TechGar2
git status --short > .analysis\algo-web-v2-redesign\git-after.txt
git diff --stat -- backend frontend docs
```
So với `git-baseline.txt`: tập file modified trong `backend/frontend/docs` **không đổi** (6 file đã dirty từ trước có hash nội dung không đổi do ta — so `git diff` baseline và after).
- [ ] **Step 5: Đọc thử 5 trang ngẫu nhiên (seed ghi lại) như người học**; ghi nhận câu còn khó hiểu.
- [ ] **Step 6: Báo cáo cuối cho user:** danh sách file tạo/xóa, lệnh QA và kết quả thật, ảnh chụp mẫu, số ảnh thật và trang nào dùng `noFigureReason`, giá trị đã bỏ vì không xác minh được, các claim còn UNSURE do thiếu GT, phần `dist/` làm hay bỏ, tương tác nào đã làm. **DỪNG — CỔNG USER #3 (nghiệm thu).**

---

## Self-Review

**Spec coverage:** §1 D1–D6 → Task 0/1/12 (ghi đè + backup), Task 1/3 (ảnh thật), Task 6/8/9 (thuật ngữ + khung), Task 2/13 (Playwright). §2 khung 7 mục + quy tắc văn → Schema + lint luật 2–6 + `validatePage`. §3 23 trang cơ chế → Task 4/6/8/9 (23 trang cơ chế, homography là trang 3; overview/journey ở Task 11 — tổng 25 view). §4 ảnh/tương tác → Task 3/10. §5 glossary/values/search/mobile → Task 11, e2e overflow/touch. §6b UI → tokens.css + lint luật 8 + e2e computed style. §7 QA → Task 2/13. §8 ràng buộc → Global Constraints + Task 13 Step 4. §9 team/cổng → Phân công + Task 4 Step 6 + Task 13 Step 6. §10 không làm → Global Constraints.

**Placeholder scan:** Task 6/8/9 là task **nội dung** — chi tiết con số/dòng do builder tự xác minh từ code (cố ý, vì số dòng đổi khi backend đang modified); mỗi trang có nguồn đọc cụ thể, schema, tiêu chí lint. Không còn TBD.

**Type consistency:** `TG.definePage/validatePage/defineTerms/defineQuickValues/getTerm/interactive.<name>.mount` dùng nhất quán Task 1/2/10/11. `kind` giá trị: `runtime|config|derived|class-default|illustrative|inference` (schema, lint luật 6–7, quick-values). ID trang: homography, roi-mask, parking-slots, brightness, motion-detection, contour-filtering, kalman-lapjv, track-lifecycle, occlusion-watershed, tracklet-descriptor, trajectory-reid, handoff-dormant, gid-conflict, parking-detector, slot-binder, snapshot-api, gate-session, frontend-dataflow, routing-astar, voice-guidance, predictions-jsonl, replay-ground-truth, failure-gallery, overview, journey (+ `_fixture` tạm) — dùng đồng nhất ở Task 6/8/9/11; `prev/next` phải theo thứ tự trên.

**Review Focus → test:** (1) lint luật 7 với `sym` ±5 dòng; (2) lint luật 5 + e2e term tooltip; (3) `validatePage` + e2e 7 section; (4) e2e scrollWidth 390px; (5) e2e font check; (6) lint đối chiếu số giữa params/sources (bổ sung ở Task 2 Step 2 luật 6–7).
