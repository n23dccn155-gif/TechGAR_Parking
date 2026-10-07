# canonical-audit-c.md — FINAL consumer audit + field list (builder C)

**Mục đích:** chốt danh sách field GIỮ/XÓA cho cleanup song song theo
owner. Nguồn: `canonical-audit-b.md` (B, read-only snapshot + fact-map
§5) + C tự chạy consumer-grep + fact-preservation scan
(`qa/_audit_deadfields.mjs`) trên bản hiện tại. **23/23 routes v3 +
1 fixture; `legacy_PENDING=0`.** Report này thay `fieldlist-c.md`.

**LEAD verdict:** APPROVE field list (7 dead vs keep) — **REJECT** cụm
"ref coverage = không mất fact": `file:dòng` chỉ là dẫn-chứng, không
chứa nội dung/công-thức → xóa field phải qua **semantic-preservation
gate** (§2), owner migrate unique VERIFIED text + numbers/scope/formulas
vào Deep trước khi xóa. Ref-cover một mình không đủ.

## 1. Verdict — chốt

| field | verdict | bằng chứng consumer (đã mở code) |
|---|---|---|
| `id` | **GIỮ** | registry `tg.js:22-28` |
| `title` | **GIỮ** | v3 head `ui.js:327` · router crumb `router.js:85` · map card `map.js:207` |
| `tier` | **GIỮ** | v3 badge `ui.js:330` (TIER_VI :249) · map.js:209-210 |
| `certainty` | **GIỮ** | v3 ô ④ `ui.js:485` |
| `sourceRefs` | **GIỮ** | v3 ④ `ui.js:486` · **lint bắt buộc** `lint:214` (ERR nếu thiếu) · `smoke:125` · `_refdump:117` |
| `realParams` | **GIỮ** | v3 Deep `ui.js:494` · `smoke:126` |
| `limits` | **GIỮ** | v3 ③+Deep `ui.js:495` |
| `qa` | **GIỮ** | v3 QA accordion `ui.js:498` · lint scan `lint:224,:243` |
| `v3.*` | **GIỮ** | `pageScaffoldV3` `ui.js:321-525` + toàn bộ lint v3 |
| `problem` | **XÓA được — qua gate §2** | chỉ `ui.js:176-178` nhánh v1 — v3 return sớm `:163` |
| `does`/`role`/`where`/`why` | **XÓA được — qua gate §2** | chỉ `fourBlocks()` `ui.js:56-57`, mount duy nhất từ v1 `:205`; grep pages+pipeline = 0 caller v3 |
| `steps` (mảng top-level v1) | **XÓA được — qua gate §2** | 0 consumer — lint đọc `v3.steps`; player đọc `steps:` trong page file |
| `nodes` (trong content) | **XÓA được — qua gate §2** | chỉ v1 badges `ui.js:169`; manifest `manifest.js:9-31` là canonical cho map/router |

**Ngoài scope:** `placeholder` đọc `route.*` từ manifest (không phải
content); `app.js`/`index.html` không đọc field nào; `__journey` không
mang v1 fields → không động.

## 2. Semantic-preservation gate — điều-kiện xóa cho MỌI owner

**LEAD sửa verdict:** coverage `file:dòng` chỉ là **dẫn chứng**, không
bảo đảm giữ nội dung/công thức. `sourceRef` trỏ tới code — nó KHÔNG chứa
văn bản giải thích. Trước khi xóa bất-kỳ v1-field nào, owner phải:

1. **Migrate unique VERIFIED TEXT** — câu giải thích/cơ chế chỉ nằm
   trong `problem/does/role/where/why/steps` phải được viết lại vào
   `v3.story`/`v3.deep`/ô ③④ (narrative Deep), không chỉ liệt kê ref.
2. **Migrate numbers/scope/formulas** — mọi con số, ngưỡng, trọng số,
   công thức, phạm-vi áp dụng (runtime-vs-class) duy nhất trong v1
   fields phải nằm trong `realParams`/`limits`/`sourceRefs.note`/
   `v3.steps`/`v3.deep` trước khi xóa.
3. **Ref ≠ nội dung** — `file:dòng` đã-cover chỉ đủ cho phần dẫn-chứng;
   phần chữ giải thích phải tồn tại dạng text ở lớp Deep mới được xóa.
4. Owner tự verify fact trước khi migrate (không kéo claim sai dossier
   sang lớp mới); C-scan `_audit_deadfields.mjs` chỉ chứng-minh phủ ref
   — **không thay thế gate này**.

Sau cleanup: `lint` + `smoke --file-only` phải sạch (lint:214 ép
`sourceRefs` — xóa nhầm fail ngay; `realParams`/`limits`/`qa` lint không
ép nhưng Deep trống → giữ). **Không đụng `manifest.*`** — canonical.

## 3. Dispatch per-route — gate §2 áp cho MỌI route (ref-cover không đủ)

**Lưu ý:** cột "ref-status" chỉ phản ánh phủ `file:dòng`; owner vẫn phải
qua gate §2 (text+numbers+formulas) trước khi xóa bất-kỳ field nào.

### A (11 routes incl ROI) — A đang own fact-map

`content/{roi,motion,kalman,coasting,assignment,brightness,shadow,echo,
track-lifecycle,occlusion,routing}.js` — C-scan: mọi `file:dòng` v1 đã
phủ refs (scan tại một thời điểm); A own fact-map 11 file, tự xác-định
unique text/numbers cần migrate theo gate §2 trước xóa.

### B (9 routes) — theo fact-map B §5 (authoritative)

| route | ref-status | nội dung fact/formula cần migrate (ngoài gate §2 chung) |
|---|---|---|
| reid | phủ ref | gate §2 |
| handoff | phủ ref | gate §2 |
| dormant | phủ ref | gate §2 |
| gate | phủ ref | gate §2 |
| snapshot | phủ ref | gate §2 · (tuỳ chọn siết range :2815→:2817) |
| homography | thiếu fact+ref | fact `velocity_per_second` EMA **0.65/0.35** + ref `ccm:590-608` (verify :601-607) — migrate giá trị+scope vào realParams/sourceRefs.note |
| trajectory | thiếu fact+ref | match internals `tm:349-385` — công thức dedupe/corridor/dist/time/direction/speed-log4 cần text+numbers trong Deep |
| gid-conflict | thiếu fact+ref | cổng `--new-identity-*` `tc:1980-1995` — giá trị CLI + vai trò cổng vào realParams |
| session | thiếu fact+ref | fact "episode = nguồn sự thật occupancy" `svb:331-333` — câu giải thích vào Deep/limits |

### C (3 routes + shared) — ĐÃ XONG (gate §2 applied)

- `content/{ensemble,binder,polygon}.js` — 7 dead-fields đã xóa; unique
  facts migrate vào realParams/limits/sourceRefs.note (không `v3.deep`
  — không consumer). Migrations: ensemble `detect():439,461-530` +
  `exit_votes:529-530` + composition `5γ×5CLAHE` + evidence keys;
  binder `update_vision:2431` + `ready:2463` + `biên sd=−r`; polygon
  `score:739` + `_batch_match:1285` + `:495` + công thức ov/center.
  QA sau cleanup: **lint 0/0 · smoke routes=3 issues=0 refs=116
  INVALID=0 · playPixel 3/3**. MD5: ensemble `60a402b5…` · binder
  `54a27a8e…` · polygon `ec47a618…` (full hash trong checkpoint).
- `__journey` — không mang v1 fields.
- **Core `ui.js` v1-path (`:163-224`, `fourBlocks :50-69`, `explSink
  :501-503`): KHÔNG xóa đợt này** — plan chỉ yêu cầu 23 content
  canonical; giữ fallback tránh broaden cleanup. Có-thể gọn ở nhịp sau
  nếu LEAD muốn.

## 4. Sau cleanup (tất cả owners)

1. 23/23 content không còn field v1 **và** gate §2 đã qua từng file.
2. `lint` + `smoke --file-only` sạch (không cần full-http).
3. Owner báo hash mới per file → C recheck source trên bản sau-cleanup
   (không recheck trùng phần đã verify).
4. `__v3fixture` giữ làm regression schema v3.

## 5. Hash audit-time (B files, md5-10 — tham chiếu B §5)

reid `6efc3b590d` · handoff `04e5f34298` · homography `d425c6c61b` ·
trajectory `670631c0a3` · dormant `06fc749198` · gid-conflict
`aa808e30e7` · gate `29093ece68` · session `f4629eaadb` · snapshot
`6207950958`

---

*C FINAL-verify — consumer-grep + fact-scan trực tiếp; per-route status
B-routes theo fact-map B §5 (B verify từng file own). Không sửa file
owner.*
