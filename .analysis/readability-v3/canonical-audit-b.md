# Canonical audit — legacy content fields (READ-ONLY, B nộp cho C)

**Mục đích:** v3 đã phủ 24/24 route (`legacy_PENDING=0`); audit tĩnh mọi consumer của top-level fields v1 (`problem/does/role/where/why/steps/nodes/…`) để C quyết cleanup canonical. **B chỉ đọc, không xóa.** R5 còn đang sửa (A refs, glossary C) → **C FINAL-verify lại trước khi xóa**; audit này là snapshot tại thời điểm đọc.

## 1. Bản đồ consumer (file:dòng đã mở code)

| field | consumer | còn sống trên v3? |
|---|---|---|
| `c.id` | `tg.js:22-28` (registry) | **GIỮ** |
| `c.title` | `ui.js:166` (v1 head) + `ui.js:327` (v3 head) + `router.js:85` nav + `map.js:207` (`ct.title \|\| r.title`) | **GIỮ** |
| `c.tier` | `ui.js:168` (v1) + `ui.js:330` (v3 badge → nhãn VI qua `TIER_VI`) | **GIỮ** |
| `c.certainty` | `ui.js:172` (v1 badge) + `ui.js:485` (**v3 ô ④ details**) | **GIỮ** — lint không ép nhưng ④ hiển thị |
| `c.sourceRefs` | `ui.js:217` (v1) + `ui.js:486` (**v3 ô ④**); `lint-readability.mjs:214` (ERR nếu thiếu); `_refdump.mjs:117`; `smoke.mjs:125` | **GIỮ** |
| `c.realParams` | `ui.js:208` (v1) + `ui.js:494` (**v3 Deep accordion**); `_refdump.mjs:118`; `smoke.mjs:126` | **GIỮ** |
| `c.limits` | `ui.js:209` (v1) + `ui.js:495` (**v3 Deep**) | **GIỮ** |
| `c.qa` | `ui.js:213` (v1) + `ui.js:498` (**v3 QA accordion**); `lint:224,:243` (scan công-thức/banned) | **GIỮ** |
| `c.nodes` | `ui.js:169` — **chỉ v1 badges**; v3 ẩn N-badges. Map/router đọc `manifest.nodes`, không đọc content | **chết trên v3** |
| `c.problem` | `ui.js:176-178` — chỉ nhánh v1 (`pageScaffold` return sớm `ui.js:163` khi `c.v3`) | **chết trên v3** |
| `c.does` / `c.role` / `c.where` / `c.why` | `ui.js:56-57` `fourBlocks()` — chỉ được mount từ v1 `pageScaffold` (`ui.js:205`); v3 return sớm, không page nào gọi `fourBlocks`/`sc.expl` trực tiếp (grep `js/pages/` = 0) | **chết trên v3** |
| `c.steps` (mảng top-level) | **không consumer** — lint chỉ đọc `v3.steps` (số), player đọc `steps:` trong page file | **chết trên v3** |
| `c.v3.*` | `pageScaffoldV3` `ui.js:321-525` + toàn-bộ lint v3 (`lint:130-270`) | **GIỮ** (canonical mới) |

**Consumers ngoài scope:** `placeholder` (`ui.js:143-153`) đọc `route.*` từ **manifest** không phải content. `app.js`/`index.html` không đọc field nào. `journey.js:222` content `__journey` chạy qua v3 scaffold — không mang problem/does/… nên không bị ảnh-hưởng.

## 2. Đề xuất xóa an-toàn (khi route đã v3 — hiện 24/24)

**Xóa được (0 consumer trên v3):** `problem`, `does`, `role`, `where`, `why`, `steps[]` (top-level), `nodes` (manifest là canonical — `manifest.js:9-31`).

**Phải giữ (v3 vẫn render):** `id`, `title`, `tier`, `certainty`, `sourceRefs`, `realParams`, `limits`, `qa`, `v3`.

**Áp dụng theo owner** (cùng danh sách field, theo file):
- **A** (10): `content/{roi,motion,kalman,coasting,assignment,brightness,shadow,echo,track-lifecycle,occlusion,routing}.js`
- **B** (9): `content/{reid,handoff,homography,trajectory,dormant,gid-conflict,gate,session,snapshot}.js`
- **C** (3 + shared): `content/{ensemble,binder,polygon}.js` + `pipeline/journey.js` (`__journey` — chỉ cần giữ, không có dead fields) + **core `ui.js` v1 path** (sau khi mọi route v3, nhánh v1 `:163-224` + `fourBlocks :50-69` thành dead code — riêng C quyết).

## 3. Cảnh báo / điều-kiện trước khi xóa

1. **`facts không bị mất khi xóa:**`does/where/why/steps` hiện chứa phần-lớn dẫn-chứng kỹ-thuật (`ccm:…`, `tm:…`) — nhưng tất-cả refs có-giá-trị đã được migrate sang `sourceRefs`/`realParams`/`v3.source.note`. C cần diff từng file: nếu field v1 còn fact **chưa có trong `sourceRefs`/`realParams`** thì phải kéo sang trước khi xóa (ví dụ `where:` của B chứa ranges chi-tiết đã gom vào sourceRefs — kiểm-tra từng file).
2. **Lint gate:** `lint:214` ép `sourceRefs` — xóa nhầm `sourceRefs`/`qa` sẽ fail ngay. `realParams/limits` lint không ép nhưng Deep accordion trống → UX mất lớp kỹ-thuật.
3. **R5 đang sửa:** A còn flag refs (coasting tc:1806/mt:278), C glossary vừa đổi display+canon (glossRefs phải resolve qua canon). C FINAL-verify sau owner-freeze; audit này không thay thế verify.
4. **`nodes`/`title`/`tier` dup với manifest:** giữ `title`+`tier` trong content (v3 head/badge đọc `c.*`), `nodes` có-thể xóa khỏi content vì manifest + map.js dùng manifest; nếu muốn single-source, C quyết việc scaffold đọc manifest thay `c.nodes`/`c.tier` — ngoài phạm-vi đề-xuất xóa.

## 4. Phát-hiện phụ (không phải cleanup)

- `ui.js:501-503` `explSink` — v3 giữ sink cho `sc.expl` code cũ; khi v1-path bị xóa có thể gọn lại, nhưng pages v3 hiện không ai gọi `sc.expl` → chỉ là phí 1 div. Chuyện của C.
- `TIER_VI` map (`ui.js:249`) — nếu sau này bỏ `tier` khỏi content thì map.js:209-210 vẫn cần `route.tier` từ manifest.

**Hash audit-time (B files):** reid `6efc3b590d`·handoff `04e5f34298`·homography `d425c6c61b`·trajectory `670631c0a3`·dormant `06fc749198`·gid-conflict `aa808e30e7`·gate `29093ece68`·session `f4629eaadb`·snapshot `6207950958` (content md5-10).

---

## 5. Fact-preservation map — own 9, trước khi xóa v1 fields

Quét `_factmap_b.mjs`: trích mọi `file:dòng` trong `problem/does/role/where/why/steps` rồi so phủ với `sourceRefs`+`realParams` (range chứa = covered). Claim sai dossier-era đã vá trong migration (trajectory 3.0→2.0·16→240·spacing-2cm-xóa; dormant 5526→4911; gid-conflict 163→173; handoff `_predicted_world`/`required_evidence`; reid `compute_sample_quality`+12/3/24; homography bịa-`ANCHOR` xóa) — **grep sạch, không còn claim sai trong v1-fields** → chỉ cần giữ các ref-chưa-cover dưới đây.

| route | v1-only fact còn trong fields-sắp-xóa | đã verify source? | trạng thái |
|---|---|---|---|
| reid | `ccm:391-395` (why) | ✓ DeepReID-raise | **covered** — ⊂ sourceRef `388-397` → xóa an-toàn |
| handoff | `ccm:2588-2636`, `ccm:2759-2764` (steps) | ✓ | **covered** — ⊂ `2572-2636` / `2744-2774` → xóa an-toàn |
| homography | `tc:287-331` ⊂ `284-341` ✓; **`ccm:590-608`** = `velocity_per_second` EMA 0.65/0.35 (verify :601-607) | ✓ | **cần chuyển** — thêm sourceRef `ccm:590-608` trước khi xóa steps |
| trajectory | `tm:79-97` dedupe; `tm:349-355` corridor; `tm:362-363` dist/time; `tm:366-377` direction; `tm:379-385` speed-log4 — formulas chỉ nằm trong `steps[]` | ✓ (đọc trực-tiếp lượt trước) | **cần chuyển** — gom 1 sourceRef "match internals `tm:349-385`" hoặc đẩy vào realParams refs |
| dormant | `ccm:4911` (steps) | ✓ | **covered** — sourceRef `4911,5526` → xóa an-toàn |
| gid-conflict | `ccm:173` ⊂ `173,523` ✓; **`tc:1980-1995`** = `--new-identity-*` CLI gates (verify :1980/:1986/:1992) trong `where` | ✓ | **cần chuyển** — thêm sourceRef `tc:1980-1995` |
| gate | — | — | **covered toàn-bộ** → xóa an-toàn |
| session | **`svb:330-332`** trong `why` = episode là nguồn-sự-thật occupancy (verify comment `svb:331-333`) | ✓ | **cần chuyển** — thêm sourceRef `slot_vehicle_binder.py:331-333` |
| snapshot | `tc:2815-2869` ⊂ throttle block (thật `tc:2817`+`2844-2869`); `rs:106-113` ⊂ `106-113,285-289`; `gate:899-906` ⊂ `55,865,899-906` | ✓ | **covered** → xóa an-toàn (tuỳ-chọn siết v1 range `:2815`→`:2817`) |

**Tóm:** 4 route cần chuyển 1 ref mỗi trước xóa — `homography` (ccm:590-608), `trajectory` (tm:349-385), `gid-conflict` (tc:1980-1995), `session` (svb:331-333). 5 route xóa an-toàn ngay. Fields `problem/does/role/why` toàn narrative không-ref hoặc refs đã cover. **B chưa sửa — chờ LEAD/C chốt list + C sourcecheck homography xong.**

---

## 6. §5 ĐÃ THỰC HIỆN — migration + xóa v1 fields (freeze-ready)

**Authorization:** LEAD duyệt field-list C. Đã làm trên own-9 `js/content/*.js`: migrate fact-text còn sót → Deep/`sourceRefs.note`/`realParams`, rồi **xóa top-level `problem/does/role/where/why/steps[]/nodes`**. Giữ nguyên `id/title/tier/certainty/sourceRefs/realParams/limits/qa/v3.*` (`v3.steps` ở indent-4, không bị strip).

### Fact-text đã chuyển (không chỉ ref)

| route | fact chuyển | đích trong v3 | source |
|---|---|---|---|
| trajectory | corridor `pos+vel·gap`; dist `1−d/radius`; time `1−gap/window`; direction `(cos+1)/2·(1−curv/π)`; speed `1−|log r|/log4`; thiếu-data→0.5; dedupe (frame,cam,track) | `realParams["score internals"]` | tm:349-355, 362-385, 79-97 |
| trajectory | fn-boundary `match()` + `_match_world_trajectory_identities` | `sourceRefs` 2 dòng | tm:306-426; ccm:5748-6141 |
| homography | velocity_per_second EMA 0.65·cũ+0.35·mới, lần-đầu lấy-thẳng | `realParams` row | ccm:590-608 |
| homography | click 8 cặp + preview | `sourceRefs` | calibrate_map.py:275,308 |
| gid-conflict | new-identity gates 5/12/0.15 | `realParams` row | tc:1980-1995 CLI + ccm:163-165 ctor-default |
| session | episode = nguồn-sự-thật occupancy | `sourceRefs` note | svb:331-333 |
| session | create_session/select_spot/set_exit_navigation/delete | `sourceRefs` +4 dòng | sm:255-302, 371-389, 449-464, 574-600 |
| reid | AppearanceTracklet+merge; callsites tạo/update; compare_tracklets→0.30-handoff+dormant-gate+member_rank | `sourceRefs` +2 dòng + note | td:183,277,308; tc:2029-2033,2157-2163 |
| handoff | `_candidate_cost` gates (occluded/invalid_edge/>25cm/corridor/size>0.90/dir<0.25/dir_cost=0.20) + `_match_pending_handoffs` anchor | `sourceRefs` 2 dòng mở-rộng | ccm:2831-3018, 3442-3673 |
| dormant | `_reconcile_dormant_duplicates` + `_token_radius` + callsite wiring | `sourceRefs` +3 dòng | ccm:6854; svb:603-609; tc:2690-2779 |
| gate | `_normalize_gate`; poll `:864` | `sourceRefs` +1 dòng + mở-rộng | gsc:196-207, 864-865,904-906 |
| snapshot | session cần GID-hợp-lệ + crossing-hợp-lệ | `sourceRefs.note` | gsc:55,865,899-906 |

**False-claims đối-chiếu code — không carry-forward:** `ANCHOR=(0.5,1.0)`/`min_anchor_multiples`/`homography.py` (bịa); trajectory history `3.0`→`2.0`; `≤16 điểm`→`240`; spacing `≥2cm` (không tồn tại); dormant match `:5526`→`:4911` def; probation `:163`→`:173`. Narrative `[suy luận]` trong `why/role` — inference đã-tagged, không phải code-fact, không cần chuyển.

**C-flag reid ctor-labels — CLOSED:** A crosscheck + C §6 xác-nhận B đúng (`tc:2227` manager · `tc:2366` tracker), C retract. Fix kèm: sourceRef callsites `two_camera.py`→`motion_tracker.py` (mt:2029-2033/2157-2163, verify trực-tiếp). CLI flag-name audit: content không ghi flag names — `--tracklet-max-samples 12`/`--tracklet-sample-interval 3`/`--global-gallery-max-samples 24` đúng tại tc:1965-1967, **absence only, không wrong-name**. reid hash mới `9e1d33fd12` (47/47, lint 0/0).

### Hậu-cleanup verification

- Strip: 9 file, regex top-level indent-2 keys; không sót (grep 0 match). `v3.steps` 4-indent giữ nguyên.
- Lint: `0 error · 0 warn · v3=24 legacy_PENDING=0`.
- Scoped QA `_qa_v3_b.mjs` 9/9: reid 47/47 · handoff 47/47 · homography 41/41 · trajectory 47/47 · dormant 41/41 · gid-conflict 41/41 · gate 35/35 · session 41/41 · snapshot 41/41.

### Hash final (content md5-10; page không-đổi)

| route | content | page |
|---|---|---|
| reid | `9e1d33fd12` | `cd2ccd90c4` |
| handoff | `eaddad418f` | `74480cfd70` |
| homography | `44b953f310` | `f35add3871` |
| trajectory | `dd377480b0` | `7824e0f1d1` |
| dormant | `269ef72adc` | `ed1d2f58f3` |
| gid-conflict | `1e5200aae1` | `6e450280fa` |
| gate | `c7aabe9400` | `f8b007b805` |
| session | `445a17fe25` | `2ca863bd1d` |
| snapshot | `0434ad4d72` | `5ce846cc71` |

**C FINALsourcecheck target = hash cột "content" trên.** Chưa đụng `ui.js` v1-path/core v1-optional (ngoài scope). A/C/shared files không sửa.
