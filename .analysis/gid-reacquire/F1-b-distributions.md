# F1-b Phần 1 — Phân phối components theo verdict

Nguồn: `F0-b-cases.json` (10 candidates, verdicts đã duyệt). `cdist_px` = khoảng cách tâm bbox (pixel, cùng camera) giữa `last_old_obs` và `first_new_obs` — proxy cho world_distance đã khử nhiễu bbox-cắt-mép. Tất cả 10 case đều same-camera.

## 1. Bảng phân phối (min / median / max)

| component | SAME_CAR (n=7) | DIFFERENT_CAR (n=3) | chồng lấn? |
|---|---|---|---|
| **cdist_px** ⭐ | **10.2 / 15.9 / 54.0** | **53.7 / 187.0 / 212.2** | **biên: thai6_f4936(S)=54.0 vs thai8_f1945(D)=53.7** |
| world_distance | 0.445 / 0.900 / 3.957 | 1.225 / 1.655 / 4.285 | CÓ — thai6_f4936(S)=2.74 > thai7(D)=1.23 |
| appearance | 0.724 / 0.858 / 0.872 | 0.748 / 0.782 / 0.863 | CÓ — gần như trùng toàn dải |
| direction | 0.001 / 0.040 / 0.735 | 0.003 / 0.008 / 0.458 | CÓ |
| time_topology | 0.0 / 0.0 / 0.0 | 0.0 / 0.0 / 0.0 | trùng hoàn toàn (structural 0) |
| speed | 0.251 / 0.500 / 0.971 (3/7 có) | 0.0 (1/3 có) | thiếu data, không dùng được |
| corridor | 0.756 / 0.945 / 0.973 | 0.736 / 0.898 / 0.924 | CÓ |
| size | 0.229 (1/7 có) | 0.148 (1/3 có) | thiếu data |
| trajectory_score | 0.592 / 0.638 / 0.702 | 0.521 / 0.593 / 0.605 | CÓ — thai6_f5367(S)=0.5923 < thai7(D)=0.5932 |
| gap_frames | 220 / 334 / 348 | 310 / 421 / 698 | CÓ — 310–348 overlap |
| **new_lid_pregid_motion_px** ⭐ | **10 / 18 / 51** | **11 / 34 / 85** | CÓ ở dải thấp; tách ở >~60px |

⭐ = metric tính thêm từ `predictions.jsonl` observations (không có sẵn trong components).

## 2. Đọc kết quả — khoảng tách

- **Không component đơn lẻ nào tách hoàn toàn.** `world_distance` nhiễu vì 2 SAME có bbox cũ cắt mép (partial bbox → anchor lệch giả). `time_topology=0` và `appearance/corridor cao ở cả hai nhóm` là structural — không mang tin phân biệt.
- **`cdist_px` là separator tốt nhất**: SAME ∈ [10.2, 54.0], DIFF ∈ [53.7, 212.2]. Va chạm duy nhất ở biên ~54px (thai6_f4936 SAME vs thai8_f1945 DIFF — cách nhau 0.3px).
- Đề xuất vùng cho thiết kế:
  - **D_stat (accept zone)**: `cdist ≤ ~45px` → cứu sạch 6/7 SAME, 0 false-accept.
  - **STAT_MARGIN (defer zone)**: `45 < cdist ≤ ~70px` chứa đúng cặp biên (SAME 54.0 + DIFF 53.7) → defer/guard thêm điều kiện.
  - `cdist > ~70px` → để reject tự nhiên (2/3 DIFF ở 187–212px).
- **Tie-breaker cho defer zone**: `new_lid_pregid_motion > ~60px` = xe thật-sự lái vào (arrival signature) → thai8=85px bị vạch, thai6_f4936=30px vẫn cứu. Kết hợp `cdist≤70 AND pregid_motion≤60` phân loại đúng cả 10/10 trên dataset này (cần backtest xác nhận, không phải kết luận).
- appearance KHÔNG nên làm gate cứng (DIFF min 0.748 > SAME min 0.724); dùng làm điều kiện phụ hợp lý hơn (vd `app ≥ 0.70`).

## 3. Tiêu chí BỔ SUNG — khảo sát tính khả thi từ predictions.jsonl

| Tiêu chí | Cách đo | Khả thi? | Tách được? |
|---|---|---|---|
| **cdist_px** (ở trên) | tâm bbox old↔new, cùng cam | CÓ — đã đo | Tốt nhất, cần defer zone |
| **new_lid_pregid_motion** | quãng đường tâm bbox của new lid từ obs đầu tới frame gid_created | CÓ — đã đo (SAME ≤51, DIFF 11–85) | Chỉ ở ngưỡng cao (~60px): arrival-veto |
| **other-fragment chiếm anchor cũ** | đếm obs của lid khác trong r<80px quanh old anchor trong gap | CÓ — đã đo | KHÔNG tách: cả hai nhóm đều có (SAME: L25/L116/L247+251/L270+271; DIFF: L61/69/79, L21/23); tất cả fragment đều `canonical_gid=None` → "xe cũ được cấp gid khác" không xảy ra trong dataset |
| **slot occupied / vision_occupied timeline** | `slots[]` của slot bound với rejected gid, xem `occupied`/`vision_occupied` có flip empty→... trong gap | CÓ — đã đo | KHÔNG khả dụng: `occupied` và `vision_occupied` = 0 suốt gap ở MỌI case có slot (suspend theo track death) — không phân biệt "xe vật lý còn" vs "chỗ trống". 5/10 case gid bị-reject không bound slot nào |
| **spot trống trong gap** (visual truth của thai8) | cần biết chỗ đỗ trống vật lý | KHÔNG từ obs/slots — "không có obs" ≠ "không có xe" (SAME_CAR cũng mất obs suốt gap). Thay thế được bằng pregid_motion arrival-veto trong dataset này |
| gap_frames | đã có | CÓ | Yếu — overlap 310–348 |

## 4. Ghi chú dữ liệu

- `speed`/`size` chỉ xuất hiện ở một số rejection → không đủ phủ để làm tiêu chí.
- Mọi rejected gid đều DEAD trên mọi cam lúc event (đã ghi ở F0-b) — điều kiện tiên quyết "dormant không live-owner" mặc nhiên thỏa trong dataset này.
- Cảnh báo cho F1-design: tie-break `pregid_motion` đo trên local obs của new lid (vài chục frame trước gid_created) — đo được trực tiếp trong code tại thời điểm match vì local track history có sẵn.
- Cặp biên cần lưu ý khi backtest: **thai6_f4936 (SAME, cdist 54.0, pregid 30px)** vs **thai8_f1945 (DIFF, cdist 53.7, pregid 85px)** — mọi thiết kế accept-eager quanh ~55px sẽ gán nhầm thai8 nếu không có arrival-veto hoặc tương đương.

## 5. Trạng thái

Phần 1 xong. Phần 2 (backtest) chờ `F1-design.md` từ builder-a.
