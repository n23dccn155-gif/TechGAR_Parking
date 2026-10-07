# R2 Bàn giao — Trang ROI mẫu (owner A) — FINAL FREEZE

**Route:** `#/algo/roi` · **Phạm vi:** chỉ `js/content/roi.js` + `js/pages/roi.js` (+ harness `.analysis/readability-v3/_qa_r2_roi.mjs` riêng của A) · **STOP sau bàn giao — chờ C full-smoke + B final-reader + user duyệt, KHÔNG R3+.**

Vòng 3 này đóng **toàn bộ B findings F1–F7** (`.analysis/readability-v3/reader-roi-b.md`) và **visual blocker** LEAD (s2 trước không có xe nào thực sự bị viền cắt).

## 1. Files đổi

| File | Vai trò |
|---|---|
| `algo-web-v2/js/content/roi.js` | Schema v3 — wording lớp mặc định theo F1–F4 + hedges claim tuyệt đối |
| `algo-web-v2/js/pages/roi.js` | Canvas 2 panel cùng cảnh/seed; **xe C thực sự cắt mép strict-ROI ở s2+**; cờ `dataset.edgeClip` cho QA |
| `.analysis/readability-v3/_qa_r2_roi.mjs` | Harness QA — nay **76 checks** (thêm check `edgeClip` ×2 viewport) |
| `algo-web-v2/qa/shots/readability-roi-a/*.png` | 16 ảnh ×2 viewport, chụp lại trên bản final |

Không đụng shared/core/CSS/lint/index/22 trang khác/production source.

## 2. Nội dung lớp mặc định — TEXT DUMP (LEAD đọc không cần code)

- **Tiêu đề:** "Vùng quan sát và ưu tiên" · badges "Cốt lõi" + "Chặng 4/12 · Phát hiện chuyển động" · breadcrumb `Map → Chặng 4/12 · Phát hiện chuyển động → Vùng quan sát và ưu tiên`
- **Summary:** "ROI (vùng quan sát) là đường viền vẽ quanh bãi xe: hệ thống chỉ nhìn bên trong nó và bỏ qua nhiễu ngoài bãi."
- **Story:** "Camera nhìn cả vỉa hè lẫn bãi xe. Cỏ lay, người đi bộ hay vũng nước phản chiếu đều tạo chuyển động giống xe chạy. Không khoanh vùng, hệ thống có thể tưởng đó là xe và sinh ra những xe ma."
- **Dải vị trí:** `Chuẩn bị chống che khuất` → **Khoanh vùng quan sát & vùng ưu tiên** (note "nằm trong chặng phát hiện chuyển động") → `Ghép vệt với xe theo dõi` · link "Phát hiện chuyển động — chặng chứa trang này" · ifMissing: "Nhiễu ngoài bãi có thể trở thành xe giả và mã xe nhảy lung tung." (đã hedge, không tuyệt đối)
- **Captions 5 bước (sync):**
  1. "Hai bên cùng một cảnh: xe và nhiễu — chỉ bên phải có vùng quan sát, thử kéo đỉnh đỏ để lọc đổi theo." *(F6: kéo đỉnh đỏ thật sự re-render lọc)*
  2. "Không có vùng quan sát, cả nhiễu cũng có thể trở thành vệt; có vùng quan sát, chỉ vật trong viền được giữ lại."
  3. "Xe chạm viền vẫn được đo trọn nhờ vành đệm 48 điểm ảnh — vật nằm trọn trong vành vẫn bị loại."
  4. "Một xe vừa rời ô đỗ: vùng quanh ô được nới lỏng để bắt lại đúng xe đó trước khi mất dấu." *(F3: "vừa rời ô" ≠ xe mới đến)*
  5. "Trong vùng ưu tiên, vệt được chấp nhận dễ hơn — việc nhận đúng xe cũ do một phép đo riêng quyết." *(không ngụ ý priority xác nhận xe)*
- **Các bước (hành-động đang xảy ra — F4 tách khỏi ①):**
  1. "Người cài đặt vẽ sẵn đường viền vùng quan sát; hệ thống tô kín phần bên trong thành mặt nạ lọc."
  2. "Ở mỗi khung hình, chuyển động nằm ngoài mặt nạ bị xóa ngay và không trở thành vệt (đối tượng chuyển động)." *(F1: "vệt" có nghĩa ngay trong ngoặc)*
  3. "Vành đệm ngoài viền chỉ dùng để đo trọn vật bị viền cắt, chứ không tạo ra vật mới."
  4. "Khi một xe rời ô đỗ, vùng quanh ô giãn ra thành vùng ưu tiên với điều kiện nhẹ hơn."
  5. "Vật trong vùng ưu tiên chỉ được tin sau khi được nhìn thấy đủ lần ngay trong vùng đó."
- **① Luồng (ý nghĩa/tại-sao — không lặp lại steps):**
  1. "Đường viền là ranh giới duy nhất bộ lọc cần — chỉ phần nằm trong nó mới được nhìn." `bước 1`
  2. "Xóa nhiễu ngay tại khung hình rẻ hơn để nó đi xa rồi mới đuổi — bớt xe giả, bớt nhầm mã." `bước 2`
  3. "Nhờ vành đệm, xe sát mép vẫn được đo đủ kích thước — vị trí và hình dáng không bị đo sai." `bước 3`
  4. "Xe vừa rời ô hay bị che khuất một lúc — nới điều kiện quanh ô giúp bắt lại đúng xe đó." `bước 4`
  5. "Được tin sớm không có nghĩa được công nhận là xe cũ — việc đó do một phép đo riêng quyết." `bước 5`
- **Quy tắc quyết định (5 — đời thường, không công thức; "chân hộp"/"vệt" có tooltip):**
  1. "Nếu một vệt không có đủ phần nằm trong viền chính thì nó bị loại, vì nó nằm ngoài bãi xe."
  2. "Nếu vệt bị viền cắt, phần nằm trong vành đủ lớn và chân hộp cũng trong vành thì vệt được đo trọn."
  3. "Nếu vệt chỉ nằm trong vành đệm mà không chạm viền thì vẫn bị loại, vì vành đệm chỉ để đo."
  4. "Khi chân hộp hoặc 10% hộp của vật chạm vùng ưu tiên, vật được xét điều kiện nhẹ hơn." *(10% gắn vùng ưu tiên, không gắn ROI — đúng nguồn `mt:614-631`)*
  5. "Nếu thiếu file vùng quan sát thì hệ thống gộp các ô đỗ thành vùng, vì bộ lọc cần ranh giới."
- **Vấn đề & biên (4, có 1 `giới hạn`):** "Xe chạy sát mép viền" (không có: có thể cắt mất một phần → sai kích thước/vị trí · nhờ bước: vành cho đo trọn dù lấn ra ngoài) · "Cỏ lay, người đi bộ, vũng nước ngoài bãi" (không có: nhiễu **có thể** trở thành xe giả, mã nhảy lung tung · nhờ bước: xóa ngay khỏi theo dõi) · "Xe rời ô rồi bị che chốc lát" (không có: **có thể** mất dấu và được cấp mã mới · nhờ bước: **có thêm cơ hội** bắt lại trước khi mã cũ hết hạn) · "Thiếu file cấu hình" (không có: mất ranh giới · nhờ bước: gộp ô đỗ — **giới hạn:** lối đi giữa ô có thể bị cắt). Claims đã hedge theo LEAD — không "mỗi nhiễu đều", không "chắc chắn bắt lại".
- **HUD 5 ô (đời thường — F1):** "Vật chuyển động trái" · "Vật chuyển động phải" · "Xe theo dõi trái" · "Xe theo dõi phải" · "Bước đang xem".
- **Panel titles — EXACT:** `KHÔNG có ROI` / `CÓ ROI` — 14px bold, đặt TRÊN khung (không đè nhãn object, không đụng `camFrame` core — truyền title rỗng rồi tự vẽ).
- **Nhãn canvas khác (≤6 từ, ≥13px):** vùng quan sát · vành đệm (leader line trái) · ô đỗ B3 · vùng ưu tiên (clamp trong panel) · xe A · xe B đỗ/xe B · xe C / **xe C sát mép** · **đo trọn nhờ vành** · **không vành: đo thiếu (khung đứt)** · chân hộp · điều kiện nhẹ · vũng nước / cây lay / người đi bộ / vật trong vành (+✗ khi chết). Đỉnh đỏ kéo được.
- **Tooltips (glossRefs):** `roi` · `priority region→"vùng ưu tiên"` · `gid→"mã xe"` · `blob→"vệt"` · `anchor/bbox_center→"chân hộp"` — workaround glossary-canonical-case (core issue, không sửa shared).
- **Mapping cảnh cũ → bước mới:** cũ `normal` = s1–s2 (mask lọc nhiễu + vành chỉ-đo); cũ `priority` = s3–s4 (xe rời ô → vùng ưu tiên → tin-sớm≠xác-nhận). Lý do bỏ selector: một câu chuyện liền mạch cho người mới; không bỏ minh họa nào — mọi cảnh (có/không ROI, xe sát mép+vành, ưu tiên vs thường) vẫn trên canvas cùng 1 geometry/seed.

## 3. Visual blocker — xe C THỰC SỰ cắt mép ở s2 (đã fix + chứng minh)

- `CARC = {x0:0.81, xE:0.885, y:0.72, w:0.10, h:0.07}` — trong viền ở s0–1, **tràn qua mép phải strict-ROI ở s2+**; cùng geometry cả 2 panel (bên KHÔNG vẫn là xe nguyên — counterfactual).
- Panel CÓ: xe C sống nhờ **rescue đúng source-semantics** — `clipped` (mép trái box còn trong strict, mép phải ngoài) ∧ support-strict >0 ∧ **chân hộp (anchor) nằm trong vành** (`deadOutside` + `edgeXAtY` mô phỏng `mt:866-908, :979-1011`). Hiển thị: hộp teal nguyên + **khung đứt đỏ** = phần strict-only → "đo trọn nhờ vành" vs "không vành: đo thiếu (khung đứt)" — khác biệt ĐO ĐẠC trên canvas, không chỉ chữ.
- Vật nằm trọn trong vành (`vật trong vành`) vẫn ✗ — vành không nhận vật, đúng nguồn.
- **QA-flag:** `canvas.dataset.edgeClip === "1"` khi mép-trái-box trong strict ∧ mép-phải-box ngoài strict ở s2+ — harness assert cả 2 viewport: `PASS [1280] xe C straddles ROI s2` / `PASS [1440] xe C straddles ROI s2`.
- Geometry probe: chân hộp ngoài-strict/trong-vành; điểm trong-box trong-strict; ~39% strict support — qua sàn `max(20, min(100, 8%·vệt))` theo đúng mô phỏng.

## 4. Truth matrix (runtime vs class — verify trực tiếp file:dòng)

| Fact | Runtime dùng | Ref | Class-default (chỉ Deep/④) |
|---|---|---|---|
| Vành đệm context | 48 px | tc:1817→:2384 | 0 (mt:95) |
| Ngưỡng diện tích vệt | 650 px² | tc:1807 | 650 (khớp) |
| Điểm chuyển động tối thiểu | 100 px | tc:1814 | 160 (mt:47) |
| Tỉ lệ chuyển động trong hộp | 0.05 | tc:1815 | 0.08 (mt:46) |
| Số lần thấy confirm | 3 | tc:1805 | 3 (khớp) |
| Dịch chuyển confirm | 6.0 px | tc:1812 | 12.0 (mt:43) |
| Sàn support strict | ≥max(20, min(100, 8%·vệt)) | mt:876-878 | — (0.08 literal %vệt ≠ ratio 5%) |
| Rescue clipped | clipped ∧ support>0 ∧ anchor∈vành ∧ ctx≥yêu-cầu | mt:866-908 | — |
| Anchor ngoài strict | chỉ tha khi clipped ∧ anchor∈vành | mt:979-1011 | — |
| Ưu tiên ngưỡng mềm | — | mt:56-60,:112-116 | 350/50px/3%/2-obs-TRONG-vùng/3px (không CLI arg) |
| Test ưu tiên | điểm đáy∈vùng ∨ ≥10% hộp | mt:614-631 | **chỉ priority — KHÔNG rule ROI** |
| Fallback thiếu file | union ô đỗ | tc:2405-2420, pd:174-184 | chỉ khi thiếu tracking-roi riêng |
| Tracking-ROI ≠ occupancy mask | 2 arg riêng | tc:1762-1778 | — |
| Vùng ưu tiên từ đâu | wakeup polygon giãn của binder | svb:2653-2670 → tc:2678-2688 | wakeup ≠ acceptance gate (svb:508-509,:2875-2876,:3240-3247,:3237) |
| Stage placement | ROI nằm TRONG `_detect` (N5) | mt:792-1011 | N1⊂N5, không stage riêng |

Minh họa (đánh dấu `minh họa`/demo): giãn polygon ưu tiên ~1.5× (nguồn 1+2·r/diag), tọa độ cảnh chuẩn-hóa, vành vẽ phóng đại quanh viền.

## 5. Kiểm chứng trên bản FINAL

- **Lint:** `node qa/lint-readability.mjs --routes roi` → **0 error · 0 warn**.
- **QA browser thật:** `node .analysis/readability-v3/_qa_r2_roi.mjs` → **76/76 PASS × 1280×720 + 1440×900; 0 console/page/request errors.** Cover: mount v3, caption sync kể s0, steps-tab mặc định (pcode ẩn), play/pause/speed/next/prev/scrub/reset, HUD sync động theo `onVeh`, determinism, pcode tab, source④, tooltip, Deep refs, re-nav, **edgeClip=1 ở s2 cả 2 viewport**.
- **Ảnh** (`algo-web-v2/qa/shots/readability-roi-a/`): `roi-v3-top[-1440]` · `roi-v3-mid-s3[-1440]` · `roi-v3-final-s2[-1440]` · `roi-v3-final-s4[-1440]` · `roi-v3-pcode-tab[-1440]` · `roi-v3-src-open[-1440]` · `roi-v3-tooltip[-1440]` · `roi-v3-deep[-1440]`.
- **Eyeball s2 (cả 2 viewport):** xe C (teal) bị viền xanh cắt ngang — phần phải hộp ngoài đường strict; khung đứt đỏ trên phần trong-strict; 2 nhãn đo-trọn/đo-thiếu đọc đủ, không cắt mép; nhãn "xe C sát mép" trong panel; bên KHÔNG xe C vẫn nguyên — cùng geometry. Không chồng nhãn vùng quan sát/vành đệm/vùng ưu tiên ở 1280 (F5).

## 6. Issues / blockers

1. ~~Badge cao ~340px~~ **RESOLVED by C** · ~~Breadcrumb N1+N5~~ **RESOLVED by C**.
2. ~~**Glossary `canon=n.toLowerCase()`** miss TERMS key hoa~~ **RESOLVED by C** — C đã fix lookup canonical-case (`r2-qa-c.md` §3 có node-test cover). Workaround alias/object trong `glossRefs` giữ nguyên, vẫn resolve đúng.
3. Không còn blocker/issue mở nào phía A.

## 7. Stable build để C full-QA đúng bản (FINAL)

- `js/content/roi.js` — mtime `2026-10-05T00:10:20` — md5 `81d237a6ec681f150793b7cf0128ca69`
- `js/pages/roi.js` — mtime `2026-10-05T00:13:33` — md5 `8f4a869db4b2d85cea61fb004fcb5a78`

Ảnh + lint + harness 76/76 trên chính bản này.

## 8. FREEZE — chờ

- **C:** full-smoke/full-QA trên đúng hash/mtime mục 7.
- **B:** final-reader review trên visible text mục 2 + ảnh.
- **USER:** duyệt ROI mẫu → mới R3/22 trang.
- A không self-approve, không R3.
