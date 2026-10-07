# build-wave2-c.md — W2 report (owner C)

**Phạm vi C own:** shared core/shell + pipeline map/journey + 2 trang thuật
toán (`polygon`, `binder`). `ensemble` đã bàn giao A (không liệt kê ở đây);
`glossary` + `README` bàn giao B.

**Verify chung (file://, Playwright, `node qa/_probe.js`):**
- 23/23 route mount: canvas px>100k, fourBlocks `4/1` đúng 1 grid trước
  Deep, step advance đổi ảnh (`chg=true`), consoleErrors=[], failedReqs=[].
- Node click → related-list → route: `N5 links=6`, click → `#/algo/roi` ✓.
- Map 2 viewport: `qa/shots/home-{1440x900,1280x720}.png`.

---

## Trang `polygon` — _overlap_geometry gate

**Scene (virtual 1040×640, viewport-independent):** 2 ô lồi + 3 xe;
OFF=naïve center-only, ON=đầy đủ `(inside && ov≥0.35) || ov≥0.60`
(`slot_vehicle_binder.py:729-731`); overlap/inside/signed-dist **tính thật
trong page** (Sutherland–Hodgman, kiểm chứng = cv2).

**Geometry proof (cv2.intersectConvexConvex + pointPolygonTest):**

| Xe | Ô | Center | inside | signed_dist | bboxArea | slotArea | ∩ | ov | slotOv | prox | score | qualify |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| X | A05 | (225,140) | ✓ | +14.7 | 66600 | 60000 | 20644 | **0.310** | 0.344 | 0.675 | 0.353 | ✗ (<0.35) |
| Z | A05 | (160,300) | ✓ | +47.8 | 32000 | 60000 | 23680 | **0.740** | 0.395 | 0.832 | **0.680** | ✓ |
| Y | A07 | (875,270) | ✗ | −14.9 | 60000 | 65700 | 26400 | **0.440** | 0.402 | 0.699 | 0.458 | ✗ (<0.60) |

- diag A05 = 401.4 · A07 = 413.7; score = 0.70·ov + 0.20·slotOv + 0.10·prox (:739).
- **Bất khả thi đã sửa:** ví dụ cũ "tâm ngoài + ov 0.65" vi phạm hình học
  (bbox chữ nhật đối xứng tâm + ô lồi ⇒ tâm ngoài kéo đường tách ⇒ ov<0.5
  <0.60). Nhánh `≥0.60` với đầu vào lồi + chữ nhật là guard dự phòng,
  không thể fire khi `center_inside=false` [suy luận hình học].
- HUD = canvas = caption = cv2 (không số gán tay); OFF/ON cùng geometry.

**Shots:** `qa/shots/c/polygon-{mid,final}-{1440,1280}.png` — mid step 2/4,
final 4/4 (assert trước capture ✓).

---

## Trang `binder` — vision_primary fusion

**Scene (6 bước, minh họa):** 2 nguồn riêng mỗi panel — chip VISION "có
xe?" (N2 evidence: stable_occupied/ready, đọc begin_frame) + chip TRACKER
"xe nào?" (GID + qualifies). Merge → occupied + binding + episode.
OFF = ID-primary (flap), ON = `vision_primary` (`two_camera.py:2328`).

| Step | Vision occ | Track | OFF ô | ON ô | Sự kiện |
|---|---|---|---|---|---|
| 0 | false | — | trống | trống | hai nguồn giới thiệu |
| 1 | true | G7 qual | occupied | occupied | **ARRIVAL CLAIM** — bind G7↔A05, ep#1 |
| 2 | true | G9 qual (swap) | occupied **ep#2!** | occupied ep#1 | ID đổi → OFF episode mới |
| 3 | true | G9 drift | **TRỐNG flap** | occupied ep#1 | vision_primary: ID không override |
| 4 | true | — (mất) | **TRỐNG flap** | occupied ep#1 | **DEPARTURE TOKEN** @_bottom_center |
| 5 | true | G9 qual | occupied | occupied ep#1 | **RECOVERY CLAIM** trong bán kính token |

**Gate recovery — đúng source (re-check sau feedback):**
- `signed` (+trong/−ngoài, `pointPolygonTest` measureDist=True :582-589).
- Reject khi `signed < −radius` — inner **ramped** `radius` = diag×(0.05→
  0.85)/1.0s (`svb:3241`, `_token_radius:603-609`); outer hard
  `signed < −max_radius` = 0.85·diag (`svb:2988`,`:3237`); token-create
  `−initial_radius` = 0.05·diag (`:508`).
- Wake-up scale `1+2r` (`:2653-2668`) chỉ đánh thức detector — KHÔNG phải
  gate; scene vẽ cả hai vòng, label phân biệt rõ.
- Ref tách theo tham số: policy `tc:2328`; expand-ratio `tc:1890-1898`→
  `:2331`; ctor `tc:2326-2356`.

**Shots:** `qa/shots/c/binder-{initial,mid,final}-{1440,1280}.png` —
mid 3/5, final 5/5 (assert ✓); thêm `binder-s{2,3,4}-1440.png` các nhịp
swap/drift/token.

---

## Shared/core trong wave này

- `ui.pageScaffold` auto-mount fourBlocks trước `.tg-below`; `fourBlocks`
  idempotent document-level — A/B gọi lại không duplicate, 23/23
  `preDeep=true`.
- `player.emit()` guard `dead` + destroy hủy RAF/listeners — đổi route
  lúc đang play không callback cũ; CONTRACT :62 ghi async-emit.
- `draw` helpers: mask/ellipse/path/badge/gauge/grid/d.ctx + `onResize`.
- Map: evidence arrow "áp dụng lúc begin_frame"; publish ~5fps tách
  gate poll 0.25s; bỏ peer-PASS metadata (map + manifest).
- Dossier `builder-c.md` T2 sửa ví dụ bất khả thi (X.31/Z.74/Y.44);
  `fix-summary` §1 ghi lý do; `peer-b-by-c` §A cập nhật gate refs.

## Còn lại / chưa claim
- `qa/smoke.mjs` + full QA — chờ owner báo ready (23 files mount được
  nhưng chưa duyệt nội dung A/B; B snapshot đang bổ sung payload).
- Không approve khi block — còn visual review từng trang A/B.

---

## Sửa theo peer-c-web-by-a.md (5 notes) — own2 correction report

| # | Note A | Sửa ở đâu | Kết quả |
|---|--------|-----------|---------|
| 1 | Predicate signed-distance: `+`trong/`−`ngoài; reject STRICT `sd < −r ∧ ov≤0 ∧ ¬ev`; biên `sd=−r` GIỮ; không dạy `sd ≤ diag×ratio`; tách ramped-radius / hard-max / wake-up 1+2r | `pages/binder.js` pcode :31 + mô tả :47 + label scene "reject: sd < −r"; `content/binder.js` steps[4] :19, realParams :44, qa :51, sourceRef :31 | Trang hiển thị đúng predicate 3-điều-kiện + keep-condition + biên inclusive; 3 khái niệm bán kính tách riêng (ramp :3241 / outer 0.85·diag :2988,:3237 / wake-up :2653-2668) |
| 2 | Arrival refs: `ArrivalClaim` :1109 (class :55), `_bind_vehicle` def :1919, `vehicle_id=gid` :1946, `_open_parking_episode` :1953 — cũ cite :2248-2290 sai | `pages/binder.js` pcode :28 "svb:1109 (ArrivalClaim), :1919-1955"; `content/binder.js` `where` :12 + sourceRefs :28-29; dossier `builder-c.md` :153-162 (callsite :2276/:2284, commit :1263) | Cite đúng def/callsite; dossier thêm :1263 (commit trong `_try_commit_arrival_claim`) |
| 3 | `tc:2328` = policy `vision_primary`; `tc:2331` = `recovery_max_expand_ratio` — phải tách | `content/binder.js` :33-34, :41, :47, :53 (mọi `:2331` chỉ gắn expand-ratio); pcode :29 "tc:2328" | Đã verify: `:2331` không còn đi kèm policy ở bất cứ đâu trong file C |
| 4 | Nhánh OFF là pedagogical pure-ID, KHÔNG phải legacy thật (legacy = vision∨tracking≥500ms, svb:3852-3857) | `pages/binder.js` title :179, panel :182 "[minh họa]", mô tả :43 ghi rõ legacy thật; `content/binder.js` qa mới :52 | OFF gắn nhãn [minh họa] ở title+panel+caption; legacy đúng nêu trong Deep/QA |
| 5 | Polygon drift: ov :725, center-inside :728, qualify :729-731, score :739, `_bbox_polygon` def :701 | `pages/polygon.js` pcode :127-133; `content/polygon.js` `where` :12, steps :16-19, sourceRefs :24, realParams :32, qa :40 | Tất cả ref khớp source đã đọc lại (`sed -n 712,745p`) |

**Ngoài 5 notes:** caption polygon `svb:2875` → `svb:2988,:3241` (gate sd thật).
Step-sync binder (LEAD): step 5 (recovery claim) trước tô pcode token —
sửa map `[4]→[4,6]` = vision_primary giữ + reject gate; line mất-track
chỉ tô ở step 4 (departure) đúng nghĩa. Shot mới binder-final-1280 xác
nhận line 5+7 sáng, line 6 tắt.
**Flag cho owner khác (không sửa file người khác):** `content/roi.js:25`
(A) vẫn ghi "cap ≤diag·ratio :2875" — cùng lỗi sign/wording note#1;
`content/echo.js:2268` là `motion_tracker.py` (file khác, đúng — không liên quan).

**Verify lại:** `node --check` 4 file OK; shots mới
`qa/shots/c/{binder,polygon}-{initial,mid,final}-{1440,1280}.png` bằng
`qa/_shots_c.js` (assert step trước capture, reset qua `#/`), 12/12
consoleErrors=[]. Chờ A stamp lại.
