# batch-position-c.md — Bảng vị trí (before → here → after) cho 22 trang + Map

**Mục đích (LEAD yêu cầu, gửi A/B sớm):** chốt `v3.stage` (chip) + `position` cho từng route theo bảng chặng style-guide §4 + runtime `pipeline-order.md`, để A/B không tự suy ra sai từ mẫu ROI. Mẫu đã duyệt = roi.

> **Sửa (sau flag của A, batch-checkpoint-a §4):** `brightness` here.label "Bù sáng từng vùng" → **"Bù sáng toàn cục"** — source `mt:453-484`: một mức bù duy nhất (median lưới ~128 mẫu/chiều) cộng vào **toàn ảnh** tham chiếu; lưới chỉ là nơi lấy mẫu, không bù riêng từng vùng. Glossary C: term đổi `adaptive brightness` → `brightness shift` (def toàn cục), alias `bù sáng`/`bù sáng toàn cục`/`adaptive brightness` vẫn resolve. Title trang A giữ nguyên "Bù sáng toàn cục".

## 0. Quy ước áp dụng (bắt buộc khi viết `position`)

1. **before = chặng chính ngay TRƯỚC node đầu** của trang; **after = chặng chính ngay SAU node cuối**. Chuỗi chính: `1 Nhận ảnh · 2 Dự đoán · 3 Chống che khuất · 4 Phát hiện chuyển động · 5 Ghép vệt · 6 Giữ/kết thúc vết · 7 Báo mất dấu · 8 Gom chứng cứ · 9 Chuẩn bị khôi phục · 10 Bàn giao & mã toàn cục · 11 Cập nhật ô đỗ · 12 Đồng bộ & phát tin`.
2. **Trang con ⊂ một chặng** (roi⊂4, brightness/shadow⊂4, reid/gid-conflict⊂10): dùng **cùng dải của chặng cha**; `here.label` = tên riêng của trang; `here.note` = "nằm trong chặng …"; `links` → trang chặng cha.
3. **Trang trải nhiều node** (echo, occlusion, trajectory, dormant, homography, polygon, snapshot): before/after theo **node đầu–cuối**; `here.note` nói rõ trải qua các chặng nào.
4. **Cùng chặng KHÔNG hứa tuần tự:** reid/handoff/gid-conflict (10), gate/session (nhánh async), motion/roi/brightness/shadow/echo (4–5) — liên kết chéo qua `links` với nhãn "cùng chặng", KHÔNG đặt nhau vào before/after.
5. **Nhánh không-tuần-tự phải ghi rõ**, không ngụy trang tuần tự:
   - `N2` ensemble: worker song song — before=N0 (nguồn khung hình), after=N12 (nơi nhận).
   - `SETUP` homography: một-lần — before="(một lần khi cài đặt)", after=**nơi đầu tiên dùng kết quả**.
   - `N14` gate/session · `N15` routing: bất đồng bộ — before=nguồn nuôi (snapshot/logic), after=tác nhân tiếp theo hoặc "—".
6. **Mũi tên phản hồi** (binder→tracker vùng ưu tiên; session→binder giữ chỗ) KHÔNG lên dải chính — để `links` + Deep.
7. `ifMissing` = hậu quả đời thường, hedge ("có thể"), không hứa tuyệt đối.
8. Route `#/` dùng khi chặng không có trang riêng (chỉ N0).

## 1. Bảng theo route — OWNER A (10)

| route | chip `v3.stage` | before | here (label + note) | after | links gợi ý |
|---|---|---|---|---|---|
| motion | Chặng 4/12 · Phát hiện chuyển động | Chuẩn bị chống che khuất `#/algo/occlusion` | Phát hiện chuyển động — "chứa cả bước khoanh vùng quan sát" | Ghép vệt với xe theo dõi `#/algo/assignment` | roi "bước nằm trong chặng này" |
| kalman | Chặng 2/12 · Dự đoán vị trí xe | Nhận ảnh & đồng bộ 2 camera `#/` | Dự đoán vị trí xe | Chuẩn bị chống che khuất `#/algo/occlusion` | — |
| coasting | Chặng 6/12 · Giữ / suy đoán / kết thúc vết xe | Ghép vệt với xe theo dõi `#/algo/assignment` | Giữ vết khi mất đo — "một cơ chế của chặng 6" | Báo mất dấu & hết hạn `#/algo/dormant` | track-lifecycle "cùng chặng" |
| assignment | Chặng 5/12 · Ghép vệt với xe theo dõi | Phát hiện chuyển động `#/algo/motion` | Ghép vệt với xe theo dõi | Giữ / suy đoán / kết thúc vết xe `#/algo/track-lifecycle` | echo "cùng chặng" |
| brightness | Chặng 4/12 · Phát hiện chuyển động | Chuẩn bị chống che khuất `#/algo/occlusion` | Bù sáng toàn cục — "bước con trong chặng phát hiện" | Ghép vệt với xe theo dõi `#/algo/assignment` | motion "chặng chứa trang này" |
| shadow | Chặng 4/12 · Phát hiện chuyển động | Chuẩn bị chống che khuất `#/algo/occlusion` | Lọc bóng đổ — "bước con trong chặng phát hiện" | Ghép vệt với xe theo dõi `#/algo/assignment` | motion "chặng chứa trang này" |
| echo | Chặng 4–5/12 · Phát hiện & ghép vệt | Chuẩn bị chống che khuất `#/algo/occlusion` | Lọc vệt trùng & vệt mép — "trải qua chặng 4 và 5" | Giữ / suy đoán / kết thúc vết xe `#/algo/track-lifecycle` | motion + assignment |
| track-lifecycle | Chặng 6/12 · Giữ / suy đoán / kết thúc vết xe | Ghép vệt với xe theo dõi `#/algo/assignment` | Giữ / suy đoán / kết thúc vết xe | Báo mất dấu & hết hạn `#/algo/dormant` | coasting "cùng chặng" |
| occlusion | Chặng 3/12 · Chuẩn bị chống che khuất | Dự đoán vị trí xe `#/algo/kalman` | Chuẩn bị chống che khuất — "lệnh cấm phát huy tới chặng 5" | Giữ / suy đoán / kết thúc vết xe `#/algo/track-lifecycle` | motion "chặng áp lệnh cấm" |
| routing | Nhánh bất đồng bộ · Điều hướng trên bản đồ | Đồng bộ & phát bản tin `#/algo/snapshot` note "nguồn dữ liệu" | Điều hướng trên bản đồ — "nhánh bất đồng bộ, chạy theo yêu cầu" | Người lái nhận chỉ dẫn (không href) | session "đích đến từ phiên" |

**Lưu ý occlusion (A):** nodes `N4,N5,N6` → trải chặng 3–5; before=N3(kalman), after=N7 — không phải motion vì chặng 4 nằm TRONG phạm vi trang.

## 2. Bảng theo route — OWNER B (9)

| route | chip `v3.stage` | before | here (label + note) | after | links gợi ý |
|---|---|---|---|---|---|
| reid | Chặng 10/12 · Bàn giao & mã toàn cục | Chuẩn bị khôi phục xe rời ô `#/algo/dormant` | Nhận dạng lại bằng bề ngoài — "bước con trong chặng bàn giao" | Cập nhật ô đỗ và xe đang đỗ `#/algo/binder` | handoff, gid-conflict "cùng chặng" |
| handoff | Chặng 10/12 · Bàn giao & mã toàn cục | Chuẩn bị khôi phục xe rời ô `#/algo/dormant` | Bàn giao 2 camera & cấp mã toàn cục | Cập nhật ô đỗ và xe đang đỗ `#/algo/binder` | reid, gid-conflict "cùng chặng" |
| gid-conflict | Chặng 10/12 · Bàn giao & mã toàn cục | Chuẩn bị khôi phục xe rời ô `#/algo/dormant` | Dàn xếp khi tranh một mã — "bước con trong chặng bàn giao" | Cập nhật ô đỗ và xe đang đỗ `#/algo/binder` | reid, handoff "cùng chặng" |
| trajectory | Chặng 8–9/12 · Gom chứng cứ & khôi phục | Báo mất dấu & hết hạn `#/algo/dormant` | Gom chứng cứ quỹ đạo & nhận dạng — "gom liên tục từ vết đang sống" | Bàn giao 2 camera & cấp mã toàn cục `#/algo/handoff` | dormant "chuẩn bị khôi phục" |
| dormant | Chặng 7/12 · Báo mất dấu & hết hạn | Giữ / suy đoán / kết thúc vết xe `#/algo/track-lifecycle` | Báo mất dấu & hết hạn — "danh tính ngủ còn sống tới chặng 10" | Cập nhật ô đỗ và xe đang đỗ `#/algo/binder` | handoff "nơi danh tính ngủ tái dùng" |
| homography | Cài đặt một lần · Hiệu chuẩn bản đồ chung | (một lần khi cài đặt — không href) | Cài đặt & hiệu chuẩn — "kết quả dùng lại ở chặng 8–10" | Gom chứng cứ quỹ đạo & nhận dạng `#/algo/trajectory` | handoff, reid "nơi dùng bản đồ chung" |
| gate | Nhánh bất đồng bộ · Cổng vào/ra & phiên QR | Đồng bộ & phát bản tin `#/algo/snapshot` note "nguồn dữ liệu" | Phát hiện xe qua vạch cổng — "nhánh bất đồng bộ" | Phiên QR `#/algo/session` note "cùng nhánh" | snapshot "nguồn nuôi" |
| session | Nhánh bất đồng bộ · Cổng vào/ra & phiên QR | Phát hiện xe qua vạch cổng `#/algo/gate` note "cùng nhánh" | Phiên QR cho xe — "nhánh bất đồng bộ" | Điều hướng trên bản đồ `#/algo/routing` note "nhánh khác" | gate "cùng nhánh" |
| snapshot | Chặng 12/12 · Đồng bộ & phát bản tin | Cập nhật ô đỗ và xe đang đỗ `#/algo/binder` | Đồng bộ & phát bản tin trạng thái — "nuôi các nhánh bên dưới" | Nhánh bất đồng bộ: cổng · phiên · điều hướng (không href) | gate, session, routing |

**Sửa theo LEAD:**
- **snapshot = Chặng 12/12** (checkpoint B §5 ghi nhầm "11" — đúng là 12, chặng cuối chuỗi chính).
- **trajectory**: strip `coasting → trajectory` đã **bỏ qua chặng 7** — sửa before = "Báo mất dấu & hết hạn" (route dormant, không phải coasting/track-lifecycle). nodes `N9,N10` → after = N11 → handoff.
- **dormant**: nodes `N8,N10,N11` → node-cuối N11 nên after = **N12 binder** (không phải handoff — handoff nằm trong phạm vi trang); danh tính-ngủ-tái-dùng ghi ở `here.note` + links.
- **reid ↔ handoff ↔ gid-conflict** cùng chặng 10: before/after giống nhau; quan hệ logic đặt trong `links` nhãn "cùng chặng" — KHÔNG xếp nhau tuần tự.

## 3. Bảng theo route — OWNER C (3, tự áp)

| route | chip `v3.stage` | before | here (label + note) | after | links gợi ý |
|---|---|---|---|---|---|
| ensemble | Nhánh song song · Quan sát ô đỗ bằng ảnh | Nhận ảnh & đồng bộ 2 camera `#/` | Quan sát ô đỗ bằng ảnh — "worker song song, không trong vòng lặp theo dõi" | Cập nhật ô đỗ và xe đang đỗ `#/algo/binder` | motion "luồng theo dõi chạy song song" |
| binder | Chặng 11/12 · Cập nhật ô đỗ và xe đang đỗ | Bàn giao 2 camera & cấp mã toàn cục `#/algo/handoff` | Cập nhật ô đỗ và xe đang đỗ — "còn nhận bằng chứng từ nhánh song song" | Đồng bộ & phát bản tin `#/algo/snapshot` | ensemble "nguồn bằng chứng ảnh" · roi "nhận vùng ưu tiên phản hồi" |
| polygon | Chặng 10–11/12 · Bàn giao & cập nhật ô | Chuẩn bị khôi phục xe rời ô `#/algo/dormant` | Đa giác đánh thức & cổng khoảng cách — "trải qua chặng 10–11" | Đồng bộ & phát bản tin `#/algo/snapshot` | roi "cùng kỹ thuật đa giác" |

*(polygon còn node N1/N14 trong manifest = cùng kỹ-thuật-đa-giác tái dùng — giữ ở Deep/links, không kéo vào dải chính.)*

## 4. ROI (đã duyệt — tham chiếu, không đổi)

`Chặng 4/12 · Phát hiện chuyển động` · before=Chuẩn bị chống che khuất → here=Khoanh vùng quan sát & vùng ưu tiên (note "nằm trong chặng phát hiện chuyển động") → after=Ghép vệt với xe theo dõi · link motion.

## 5. Ghi nhớ cho mọi trang

- `here.label` = tên **ngắn của trang** (không nhất thiết lặp lại tên chặng — xem roi/binder).
- Chip stage của trang con = chip chặng cha (không tự đánh số mới).
- Nếu `before`/`after` trùng một route (vd. 2 trang cùng chỉ vào dormant) là bình thường — dải theo chặng, không theo trang.
- `links` dùng cho: trang chặng-cha, quan-hệ-cùng-chặng, nhánh song song/async, phản hồi ngược.
