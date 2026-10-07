# stages-c.md — R0: Tên tiếng Việt 16 chặng + cấu trúc tuần-tự/song-song + mapping vị-trí ROI

**Nguồn**: `pipeline-order.md` (verified `two_camera.py:run()` :2004, loop :2444) +
`js/manifest.js` (route→nodes). Đây là **đề xuất cho style-guide-v3** — LEAD chốt
mới dùng trong UI. READONLY: không sửa web/source.

## 1. Cấu trúc thật — KHÔNG sắp N0→N15 thành tuyến tính (sai)

```
        ┌────────── 12 CHẶNG CHÍNH (tuần tự, mỗi khung hình) ──────────┐
        │                                                             │
 Chặng 1 Nhận ảnh & đồng bộ 2 camera            (N0)
 Chặng 2 Dự đoán vị trí xe                      (N3, Kalman)
 Chặng 3 Chuẩn bị chống che khuất               (N4)
 Chặng 4 Phát hiện chuyển động                  (N5) ◄── chứa N1
 Chặng 5 Ghép vệt chuyển động với xe theo dõi   (N6)
 Chặng 6 Giữ / suy đoán / kết thúc vết xe       (N7)
 Chặng 7 Báo mất dấu & hết hạn                  (N8)
 Chặng 8 Gom chứng cứ quỹ đạo & nhận dạng       (N9)
 Chặng 9 Chuẩn bị khôi phục xe rời ô            (N10)
 Chặng 10 Bàn giao 2 camera & cấp mã toàn cục   (N11)
 Chặng 11 Cập nhật ô đỗ và xe đang đỗ           (N12)
 Chặng 12 Đồng bộ & phát bản tin trạng thái     (N13)
        └─── feedback quay về chặng 4 (vùng ưu tiên) + chặng 2-5 ─────┘

   [N1 ⊂ chặng 4]  Cổng ROI & vùng ưu tiên — cổng không-gian đầu vào
                   của phát hiện chuyển động; KHÔNG phải chặng riêng.
   [N2 ‖]          Quan sát ô đỗ bằng ảnh — worker SONG SONG, kết quả
                   vào đầu vòng sau (mailbox evidence).
   [N14 ~]         Cổng vào/ra & phiên QR — process RIÊNG, poll 0.25s.
   [N15 ~]         Điều hướng trên bản đồ — ứng dụng RIÊNG, poll 200/500ms.
```

16 node = 12 chặng chính + N1 (bên trong chặng 4) + 3 nhánh song-song
(N2, N14, N15). Số N chỉ là nhãn nội bộ — thứ tự số ≠ thứ tự chạy.

## 2. Bảng tên tiếng Việt N0–N15 (+SETUP) → route phủ

| Node | Tên tiếng Việt đề xuất | Vai trò | Route(s) phủ (manifest) |
|---|---|---|---|
| SETUP | Cài đặt & hiệu chuẩn | một-lần | (map) homography |
| N0 | Nhận ảnh & đồng bộ 2 camera | chặng 1 | — |
| N1 | Khoanh vùng quan sát và vùng ưu tiên | **⊂ chặng 4** | roi |
| N2 | Quan sát ô đỗ bằng ảnh | **song song** | ensemble |
| N3 | Dự đoán vị trí xe | chặng 2 | kalman |
| N4 | Chuẩn bị chống che khuất | chặng 3 | occlusion |
| N5 | Phát hiện chuyển động | chặng 4 | motion, roi, brightness, shadow, echo |
| N6 | Ghép vệt với xe theo dõi | chặng 5 | assignment, echo |
| N7 | Giữ / suy đoán / kết thúc vết xe | chặng 6 | coasting, track-lifecycle |
| N8 | Báo mất dấu & hết hạn | chặng 7 | dormant |
| N9 | Gom chứng cứ quỹ đạo & nhận dạng | chặng 8 | trajectory, homography |
| N10 | Chuẩn bị khôi phục xe rời ô | chặng 9 | dormant, trajectory, homography |
| N11 | Bàn giao 2 camera & cấp mã toàn cục | chặng 10 | handoff, reid, gid-conflict, dormant, polygon |
| N12 | Cập nhật ô đỗ và xe đang đỗ | chặng 11 | binder, polygon |
| N13 | Đồng bộ & phát bản tin trạng thái | chặng 12 | snapshot |
| N14 | Cổng vào/ra & phiên QR | **bất đồng bộ** | gate, session, snapshot |
| N15 | Điều hướng trên bản đồ | **bất đồng bộ** | routing, snapshot |

## 3. Ghi chú runtime quan-trọng (style-guide phải giữ đúng)

- **N1 nằm trong N5**: ROI/priority mask áp **bên trong** `_detect`
  (`motion_tracker.py:834`, nhận `priority_regions` qua
  `build_recovery_priority_regions` `two_camera.py:2683`). Trên UI: ROI là
  "cổng đầu vào" của chặng 4 — không vẽ thành chặng đứng trước. Thứ tự
  trong `process_frame`: predict → prepare → `_detect` (mask áp ở đây)
  → assign (mt:2228-2249) — KHÔNG nói ROI "kiểm tra trước dự đoán".
- **N12 không phải "fusion OR"**: production policy `vision_primary`
  (`two_camera.py:2328`; `slot_vehicle_binder.py:3841-3847`) — trạng thái
  "có xe/trống" do **vision ô đỗ quyết định**; vết xe chỉ gán/gỡ
  `vehicle_id` vào ô đã occupied. Nhánh "one-way override" trong docstring
  là legacy, không chạy prod → label "Cập nhật ô đỗ và xe đang đỗ".
- **N2 song song**: worker riêng (ThreadPoolExecutor 2, tc:2280); kết quả
  áp **đầu vòng sau** trước cấp nhận dạng (tc:2511 comment). Vẽ thành
  nhánh song song có mailbox, không nhét giữa chặng 1-2.
- **N14/N15 bất đồng bộ**: process/app riêng poll snapshot — nằm NGOÀI
  vòng lặp. Vẽ thành consumer phía sau chặng 12, không đánh số chặng.
- **Feedback 2 chiều**: reservations sync ×2 (tc:2672, :2808),
  `protected_local_keys` (:2782), `cancel_observed_recovery_tokens`
  (:2786) — tồn tại đường ngược chặng 9–12 → chặng 2–5. Dải vị-trí tuyến
  tính chỉ vẽ chuỗi chính; feedback ghi trong Deep/giải-thích.

## 4. Mapping vị-trí route **roi** (runtime-accurate — §4 plan chỉ là ví-dụ giọng)

`roi` phủ **N1** — cổng không-gian áp **bên trong** `_detect` (chặng 4),
sau predict+prepare và trước assign. **Before/after theo chặng-chính gần
nhất** (verify `mt:2228-2249`: predict→prepare→`_detect`→assign; A5 trong
`roi-source-a.md` xác nhận cùng kết luận):

```
[Chuẩn bị chống che khuất] → [Khoanh vùng quan sát và vùng ưu tiên] → [Ghép vệt với xe theo dõi]
   chặng 3 (N4) · occlusion        TRANG NÀY — trong bước Phát hiện         chặng 5 (N6) · assignment
                                  chuyển động (chặng 4/N5)
```

Caption gợi-ý: *"ROI được kiểm tra ngay trong bước Phát hiện chuyển
động — chỗ nào ngoài viền bị bỏ trước khi tính vệt."* (đúng A5, không
tả như chặng trước motion, không nói "kiểm tra trước dự đoán").

| Thành phần dải vị-trí | Giá trị đề xuất |
|---|---|
| before | **Chuẩn bị chống che khuất** → `#/algo/occlusion` (chặng 3 — chặng-chính gần nhất trước _detect) |
| after | **Ghép vệt với xe theo dõi** → `#/algo/assignment` (chặng 5 — chặng-chính gần nhất sau _detect) |
| caption trong chặng | "nằm trong bước Phát hiện chuyển động" → link `#/algo/motion` cho người muốn xem lõi chặng 4 |
| ifMissing (đúng runtime) | Nhiễu ngoài vùng (cỏ lay, người đi bộ, vũng nước) thành "vật thể giả" → tracker phải gán/theo-dõi rác, mã xe nhảy lung tung. Thiếu vùng ưu tiên: xe vừa rời ô bị che → chậm được bắt lại → dễ nhận mã xe mới. |
| Lưu ý feedback | "Vùng ưu tiên" nhận dữ-liệu từ chặng 9–11 (recovery/binder) quay về — nguồn phụ, không nằm trong dải trước→sau; giải thích ở ô ③/Deep. |

## 5. Ví-dụ áp cho style-guide — chuỗi tên đủ 12 chặng để dải vị-trí dùng

`Nhận ảnh 2 camera → Dự đoán vị trí xe → Chuẩn bị chống che khuất →
Phát hiện chuyển động → Ghép vệt với xe theo dõi → Giữ/suy đoán/kết thúc
vết xe → Báo mất dấu & hết hạn → Gom chứng cứ nhận dạng → Chuẩn bị khôi
phục xe rời ô → Bàn giao camera & mã toàn cục → Cập nhật ô đỗ và xe đang
đỗ → Phát bản tin trạng thái` ‖ `Quan sát ô đỗ (song song)` ~ `Cổng &
phiên QR (bất đồng bộ)` ~ `Điều hướng (bất đồng bộ)`

## 6. Appendix — R0-review-1 (LEAD feedback, đã áp)

| # | Yêu cầu LEAD | Sửa | Verify |
|---|---|---|---|
| 1 | N12 đọc như "fusion OR" — prod `vision_primary`: occupancy = vision-only | label → "Cập nhật ô đỗ và xe đang đỗ" + note §3: vision quyết định, vết xe chỉ định danh | `two_camera.py:2328` · `svb:3841-3847` (pipeline-order §1) |
| 2 | ROI strip `N0→ROI→N5` bỏ qua N3/N4 — nearest main stages đúng hơn | before→`occlusion` (chặng 3) · after→`assignment` (chặng 5) + caption "trong bước Phát hiện chuyển động" | `mt:2228-2249` predict→prepare→`_detect`→assign; `roi-source-a.md` §A5 |
| 3 | N1 label đơn giản, ROI được giải-nghĩa | "Khoanh vùng quan sát và vùng ưu tiên" | — |
| 4 | Không claim ROI "trước temporal" trừ khi source | bỏ "áp ngay khi đọc khung"; ghi đúng: mask áp **trong** `_detect`, sau predict/prepare | `mt:792-1011` (A5) |

Còn nguyên vẹn: 12 chặng chính, N1⊂chặng4, N2‖, N14/N15~, feedback 2-chiều.
**STOP sau R0** — chờ `style-guide-v3.md` LEAD chốt trước R1; R2 ROI thuộc A.
