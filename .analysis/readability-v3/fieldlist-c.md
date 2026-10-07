# fieldlist-c.md — canonical field list (builder C, FINAL-verify)

Dựa trên `canonical-audit-b.md` (B, read-only snapshot) + C đã tự chạy lại
consumer-grep + fact-preservation audit trên bản hiện-tại. **23/23 routes
v3 + fixture; `legacy_PENDING=0`.**

## 1. Verdict field list

| field | verdict | bằng chứng consumer |
|---|---|---|
| `title`, `tier` | **GIỮ** | v3 head/badges đọc `c.title`/`c.tier` (`ui.js:325+`); router crumb đọc `cnt.title` |
| `certainty` | **GIỮ** | v3 ô ④ "độ chắc chắn" (`ui.js` src4 block) |
| `realParams` | **GIỮ** | ④ bảng tham số runtime-vs-class + refs |
| `limits` | **GIỮ** | ③ giới hạn + Deep |
| `qa` | **GIỮ** | "QA phản biện" details |
| `sourceRefs` | **GIỮ** | ④ danh sách dẫn chứng file:dòng |
| `v3.*` (mọi sub-field) | **GIỮ** | scaffold v3 |
| `problem` | **CHẾT trên v3** | chỉ `ui.js:176` nhánh v1; v3 return sớm :163 |
| `does`/`role`/`where`/`why` | **CHẾT trên v3** | chỉ `fourBlocks` `ui.js:50-69`, mount từ v1 `:205`; grep `js/pages`+`js/pipeline` = 0 caller |
| `steps` (top-level mảng v1) | **CHẾT trên v3** | 0 consumer (player đọc `steps:` trong page file; lint đọc `v3.steps`) |
| `nodes` (trong content) | **CHẾT trên v3** | manifest là canonical (`manifest.js`); `ui.js:169` chỉ nhánh v1; map/router đọc manifest |

## 2. Fact-preservation audit (C đã chạy: `qa/_audit_deadfields.mjs`)

Trích mọi `file.ext` + line-ref trong 6 v1-fields của từng content file,
so với `sourceRefs`/`realParams`/`v3`:

- **23/23 files: OK — mọi file:dòng trong v1 fields đã tồn tại trong
  v3/refs** → xóa v1 fields **không mất fact/dẫn chứng nào**.
- `__journey` (pipeline/journey.js): không mang v1 fields — không cần động.

## 3. Dispatch cleanup theo owner (LEAD phân phối)

- **A** (10 routes): xóa `problem/does/role/where/why/steps[]/nodes` khỏi
  content/{roi,motion,kalman,coasting,assignment,brightness,shadow,echo,
  track-lifecycle,occlusion,routing}.js — mọi ref đã nằm trong refs (đã
  audit OK).
- **B** (10 routes): cùng 7 fields trên content/{reid,handoff,homography,
  trajectory,dormant,gid-conflict,gate,session,snapshot}.js + homography
  nếu thuộc B.
- **C** (3 routes + core): content/{ensemble,binder,polygon}.js (đã audit
  OK); `__journey` không động. **Core `ui.js`**: nhánh v1
  `pageScaffold :163-205` + `fourBlocks :50-69` thành dead-code SAU khi
  owners xóa xong + regression QA — C tự cleanup ở nhịp sau, kèm guard
  `c.v3` missing→placeholder thay vì nhánh v1 (không xóa ngay đợt này để
  tránh mất fallback trong lúc owners đang edit).
- **Manifest `nodes`/`nodeStage`/`nodeDesc`**: giữ — map/journey dùng.

## 4. Điều kiện trước khi xóa core v1-path (nhắc lại)

1. 23/23 content không còn field v1 (owners xong).
2. `lint` + `smoke --file-only` sạch sau cleanup (không cần full-http).
3. `v3fixture` giữ làm regression cho schema v3.

## 5. ROI alias-format — C xác nhận solution F3 của A

- **Cơ chế lint đã đúng**: matchWords = first-token canon `t[4]` + mọi
  alias-key; coverage theo **needle** (`~label`) hoặc `hit.term`.
- **Format owner dùng**: `glossRefs: […, {term:"<canon>", label:"<cụm đúng
  trong văn>"}]` — label phải trùng cụm chữ xuất hiện trong prose (đó là
  phần được bọc tooltip). Vd `{term:"ROI mask", label:"vùng quan sát"}`.
- Lookup đã verify: canon+alias+display+case-insensitive đều resolve
  (14/14 test pass). Keys/aliases/defs glossary **không đổi** — bảo tồn
  ROI-approved copy.
- **Không suppress lint**; warn còn lại sau fix của A đều là owner-side
  (routing summary 26 từ → A tự cắt).

## 6. Map minor đã vá (LEAD cuối)

- Card node `chặng ∥`/`chặng ~` → `luồng song song`/`nhánh bất đồng bộ`
  (ký hiệu chỉ còn trên sơ đồ). Ảnh `map-{1440,1280}-N2/N14.png` mới.
