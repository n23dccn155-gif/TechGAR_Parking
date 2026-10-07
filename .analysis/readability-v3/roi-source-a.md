# ROI — source truth (A, R2 PREP READONLY)

Đối chiếu trực tiếp `two_camera.py` (`tc:`) + `src/techgar/motion_tracker.py` (`mt:`) + `slot_vehicle_binder.py` (`svb:`) + `parking_detector.py` (`pd:`). **Không sửa content/pages** — chờ LEAD R1 + style-guide. Phạm vi: ROI page only.

## A. FACTS đã verify (file:dòng)

### A1. Load mask + fallback (hai loại mask KHÁC nhau)
- `--mask-cam1/2` = occupancy mask cho vision detector; `--tracking-roi-cam1/2` = polygon ROI riêng cho **motion tracking**, default dùng lại file mask nếu không truyền riêng — `tc:1762-1778`, `tc:2405-2408`.
- Tracking ROI JSON → `fillPoly` → `trackers[cam].roi_mask` — `tc:2409-2418`.
- **Fallback file thiếu**: `roi_mask = detectors[cam].get_global_mask(frame.shape)` — `tc:2420`; `get_global_mask` = OR-union các slot ROI masks — `pd:174-184`. → §4 nói "gộp các ô đỗ làm ROI" **ĐÚNG**; hệ quả: khe giữa các ô không nằm trong union → đường đi có thể ngoài vùng nhìn.
- Khi live-editor đổi ô đỗ, `roi_mask` chỉ reset theo union ô **nếu cam đó không có tracking ROI file riêng** — `tc:3124-3131`.

### A2. Context band 48px
- CLI `--motion-roi-context-px` **default 48** — `tc:1817-1820`; ctor `roi_context_padding_px=0` — `mt:95,233`; runtime truyền `args.motion_roi_context_px` tại `tc:2384` → giá trị thật **48**.
- Cơ chế: `context_mask = dilate(roi_mask, ellipse 97×97)` (2·48+1) cache theo source-id — `mt:794-811`. `mask_motion ∧ context_mask` — tức pixel trong band được **đo** chứ không được **nhận mới**.
- Mục đích (comment source `mt:813-816`): xe chạm mép ROI được đo trọn; "component still needs real support inside the strict ROI".

### A3. ROI acceptance — QUY TẮC THẬT (khác §4 mẫu!)
- Mỗi blob: `roi_support_pixels = contour ∩ strict_roi`; yêu cầu `≥ max(20, min(motion_min_pixels, 0.08·component))` = `max(20, min(100, 8%·blob))` theo runtime — `mt:866-879` + `tc:1814` (runtime `motion_min_pixels=100`; `0.08` là literal trong code, không phải `motion_min_ratio`).
- Nếu thiếu support: chỉ sống khi đồng thời `roi_clipped (support_ratio<0.98) ∧ roi_support_pixels>0 ∧ anchor ∈ context_band ∧ context_support ≥ required` — `mt:878-908` (`roi_context_rescued`).
- Sau đó **anchor test** (`_bottom_center`) — `mt:979-1011`: ngoài ảnh → reject; ngoài strict ROI → chỉ tolerated nếu `roi_clipped` ∧ anchor trong band (`roi_anchor_tolerated`); không → `anchor_outside_roi` reject.
- Blob nằm trọn trong band (không chạm strict ROI) → chết ở bước support — `mt:884-885` comment + help `tc:1821-1822`.

### A4. Priority gating (đánh thức, không xác nhận)
- `_box_is_priority` — `mt:614-631`: **anchor ∈ priority_mask HOẶC overlap ≥ 0.10·(w·h) của hộp** → priority. ⚠️ **Đây mới là chỗ "10% hộp bao"** — không phải của ROI chính.
- Ngưỡng mềm hơn khi `is_priority` — `mt:56-60,1010-1017` (runtime values, xem Appendix E): `min_area 350` vs `650`; `motion_min_pixels 50` vs **`100` runtime** (class 160); `motion_min_ratio 0.03` vs **`0.05` runtime** (class 0.08).
- Confirm: `total_visible_count ≥ 2` **VÀ** `priority_observation_count ≥ 2` (obs nằm trong vùng), displacement `≥ 3.0px` (vs `3` obs & **`6.0px` runtime**, class 12.0) — `mt:2073-2084,2169`.
- Nguồn vùng: `tracker.process_frame(priority_regions=build_recovery_priority_regions(...))` mỗi frame — `tc:2678-2688`; polygons = `binder.recovery_priority_regions` = `_expanded_polygon(token, 2·radius/diag)` — `svb:2653-2670`; cross-cam project homography — `tc:703-706`.
- Priority chỉ làm tracker nhạy; xác nhận "xe cũ rời ô" do binder signed-distance riêng — `svb:2988+,3240+`.

### A5. Stage placement
- `roi_mask` được áp **bên trong** `tracker._detect` (mask∩band + strict support + anchor) — `mt:792-1011` → N1 nằm TRONG N5, đúng pipeline-order; không phải stage tuần tự trước motion.

## B. DISCREPANCIES so với §4 mẫu (phải sửa khi viết bản v3)

| # | §4 viết | Source thật | Mức |
|---|---------|-------------|-----|
| D1 | "điểm đáy trong viền **hoặc** ≥10% hộp bao chồng viền" (rule ROI) | 10% là rule **priority** (`mt:630`). ROI acceptance = strict support `≥ max(20, min(100, 8%·blob))` **runtime** (`tc:1814`; literal `0.08` ở `mt:878` là % component, khác `motion_min_ratio` 5%), rescue bằng clipped+anchor-in-band, sau đó anchor test riêng (`mt:866-908,979-1011`) | **SAI — blocking cho wording v3** |
| D2 | "vùng ưu tiên … cần ít lần thấy hơn" | Đúng hướng nhưng cần chính xác: ít nhất **2 lần thấy TRONG vùng** (`priority_observation_count≥2`), không chỉ tổng số lần thấy | Thiếu chính xác |
| D3 | §4 không nêu | Có **2 mask khác nhau**: occupancy (`--mask-cam*`) vs tracking ROI (`--tracking-roi-cam*`) — cùng file default nhưng khái niệm riêng | Nên thêm câu trong ô ④/story nếu hợp giọng |
| D4 | "vành đệm 48 điểm ảnh … không tự tạo xe mới" | Đúng; bổ sung chi tiết đúng: anchor ngoài viền chỉ được tha khi blob đã bị viền cắt (`roi_anchor_tolerated`), không phải mọi anchor trong band đều qua | Chỉnh nhẹ |
| D5 | fallback "tự gộp các ô đỗ làm ROI" | Đúng (`tc:2420`, `pd:174-184`); thêm: chỉ khi **không có** file tracking-roi riêng | Chỉnh nhẹ |

## C. Params dùng cho lớp mặc định v3 — **ĐÍNH CHÍNH theo runtime** (xem Appendix E)
- Vành đệm: **48 px** (`tc:1818`).
- Support tối thiểu trong viền: `max(20, min(100, 8% số điểm blob))` — dùng **runtime 100** không phải class 160 (`mt:876-878` + `tc:1814`).
- Vùng ưu tiên: test anchor-trong-vùng **hoặc** `≥10% hộp` (`mt:624-631`); ngưỡng mềm: area `350` (vs `650`), motion `50 px`/`3%` (vs runtime `100`/`5%`), confirm `2 lần trong vùng + dịch 3 px` (vs `3`/`6 px` runtime).

## E. Appendix — MATRIX runtime vs class-default (LEAD yêu cầu, verify tại `tc:2366-2395` ctor + argparse `tc:1805-1815`)

Ctor `MotionVehicleTracker` per-cam: `tc:2366-2395`. **Không có argparse nào cho `priority_*`** → priority giữ class defaults.

| Param | Class default (`mt:`) | CLI arg / runtime default (`tc:`) | **Giá trị THẬT dùng** | Ref arg |
|---|---|---|---|---|
| `min_area` | 650 (`mt:39`) | `--motion-min-area` 650 | **650** | `tc:1807` → `:2373` |
| `motion_min_pixels` | **160** (`mt:47`) | `--motion-min-pixels` **100** | **100** | `tc:1814` → `:2377` |
| `motion_min_ratio` | **0.08** (`mt:46`) | `--motion-min-ratio` **0.05** | **0.05** | `tc:1815` → `:2378` |
| `min_visible_count` | 3 (`mt:36`) | `--min-visible-count` 3 | **3** | `tc:1805` → `:2370` |
| `min_confirm_displacement` | **12.0** (`mt:43`) | `--motion-min-displacement` **6.0** | **6.0** | `tc:1812` → `:2375` |
| `roi_context_padding_px` | 0 (`mt:95`) | `--motion-roi-context-px` **48** | **48** | `tc:1817-1819` → `:2384` |
| `priority_min_area` | 350 (`mt:56`) | — (không arg) | **350** | `mt:112` |
| `priority_motion_min_pixels` | 50 (`mt:58`) | — | **50** | `mt:114` |
| `priority_motion_min_ratio` | 0.03 (`mt:57`) | — | **0.03** | `mt:113` |
| `priority_min_visible_count` | 2 (`mt:59`) | — | **2** | `mt:115` |
| `priority_min_confirm_displacement` | 3.0 (`mt:60`) | — | **3.0** | `mt:116` |

**Hệ quả wording v3**: ngưỡng thường khi so sánh phải dùng **100 px / 5% / 3 obs / 6 px** (runtime), KHÔNG class 160/8%/3/12. Support floor cũng đổi tương ứng: `min(100, 8%·blob)` — `8%` trong công thức là literal `0.08` trong code (`mt:878`), không phải `motion_min_ratio`. `roi-source-a.md` mục A3/C đã chỉnh theo runtime.

## F. Dải vị trí pipeline (verify với C `pipeline-order.md`)
- Chuỗi per-frame: `N3 predict → N4 occlusion-prepare → N5 _detect (⊃ N1 ROI/priority mask) → N6 assign → N7 update` — `pipeline-order.md:14-18,38`; N1 "KHÔNG phải stage riêng — nằm trong N5" (`:12,66-70`).
- → Dải Trước→NÀY→Sau cho trang ROI nên là: **`Phát hiện chuyển động (N5, đang chứa ROI)` trong khung `N4 → [ROI trong N5] → N6`**; nearest main stages xác nhận: trước = occlusion prepare (N4), sau = gán detection↔track (N6).

## D. Lưu ý viết v3
- Không để lẫn "10% overlap" vào quy tắc ROI chính (D1) — đây là lỗi duy nhất có thể dạy sai hẳn cơ chế.
- Giữ phân biệt: mask/màu nhiễu → lọc; band 48px → chỉ đo; priority → chỉ đánh thức; xác nhận xe → binder.
- N1⊂N5: viết "ROI được kiểm tra ngay trong bước phát hiện chuyển động", không tả như stage trước.
