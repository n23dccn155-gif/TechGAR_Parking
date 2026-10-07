# F1-b Phần 2 — Backtest thiết kế `stationary_reacquire` (offline, đọc-only)

Input: `F1-design.md` (builder-a), `F0-b-cases.json` (10 candidates), `predictions.jsonl` 18 session replay outputs. Không chạy pipeline; mọi metric tính lại từ observations/identity_events theo ĐÚNG định nghĩa design.

## 0. Metric check — số px trong design ĐÚNG, số của tôi ở F1-b-distributions sai convention

| case | bbox-center Δ (F1-b P1, sai convention) | **bottom-center anchor Δ (design)** | Euclid world (verify) |
|---|---:|---:|---:|
| sang8_f600 | 15.9 | 22.2 (design 22 ✓) | 1.81 ✓ |
| thai3_f1774 | 15.5 | 31.0 (31 ✓) | n/a |
| thai4_f4633 | 34.0 | 37.4 (37 ✓) | 2.80 ✓ |
| thai6_f1128 | 15.0 | 30.0 (30 ✓) | 2.14 ✓ |
| thai6_f1205 | 10.2 | 7.3 (7 ✓) | n/a |
| thai6_f4936 | 54.0 | 93.3 (93 ✓) | n/a (anchor null) |
| thai6_f5367 | 33.1 | 70.5 (70 ✓) | 4.40 ✓ |
| thai6_f1713 | 187.0 | 202.3 (202 ✓) | 18.33 ✓ |
| thai7_f2112 | 212.2 | 230.9 (231 ✓) | 26.60 ✓ |
| thai8_f1945 | 53.7 | 120.0 (120 ✓) | 6.07 ✓ |

- Design dùng **bottom-center anchor** `(x+w/2, y+h)` — đúng convention của `anchor_world` (chân xe chiếu mặt đất). `cdist_px` ở F1-b-distributions.md dùng bbox-center → "va chạm biên 54.0 vs 53.7" là **artifact của metric sai**: với anchor đúng, khoảng tách là SAME ≤93px vs DIFF ≥120px — **sạch, không va chạm**. F1-b-distributions §1 cần đọc kèm đính chính này.
- Euclid `anchor_world` verify được 7/10 case (khớp design); 3 case (thai3, thai6_f1205, thai6_f4936) `anchor_world` của obs cũ = null trong predictions → euclid không đo được từ log — xem §3 caveat.

## 1. Backtest trên 10 candidates (gates G1–G7 + margin §3)

Ngưỡng design: `D_STAT_CORE=3.0`, `D_STAT=5.0` (vùng 3.0–5.0 cần IoU≥0.15 hoặc partial-bbox), `A_STAT` sim≥0.70 support≥2, `S_STAT`≤0.90, G6 stationary-history (velocity≤1.5 OR tail≤4.0 OR parked), margin Δd≥1.5 ∧ Δapp≥0.08, G1 same-cam live-owner veto, G7 log-only.

| case | verdict F0 | competitor(s) trong D_STAT | outcome design | gate quyết-định |
|---|---|---|---|---|
| sang8 f600 | SAME | gid1 ew1.81 (gid2 ew13.56 out) | **ACCEPT gid1 = SAVED** | unique, core |
| thai3 f1774 | SAME | gid3 ew1.1 + **gid2 LIVE cam2 ew1.75** | **DEFER** (margin: Δd≈0.65 <1.5; hai ứng viên) | margin guard |
| thai4 f4633 | SAME | gid7 ew2.80 (gid5 live-cam2 ew15.88 → G1 veto) | **ACCEPT gid7 = SAVED** | unique, core |
| thai6 f1128 | SAME | gid2 ew2.14 | **ACCEPT gid2 = SAVED** | unique, core |
| thai6 f1205 | SAME | gid1 pxΔ7 (ew n/a — anchor null); gid3 live-cam1 ew25.6 → G1 veto | **ACCEPT gid1 = SAVED** *(caveat §3a)* | unique |
| thai6 f4936 | SAME | gid6 pxΔ93 partial (IoU 0.18≥0.15, area×3.6); các gid khác ew≥8 out | **ACCEPT gid6 = SAVED** *(caveat §3a)* | extended + IoU corroboration |
| thai6 f5367 | SAME | **gid14 ew0.27 + gid13 ew3.87 + gid18 ew4.40** | **DEFER** (margin: Δd đạt nhưng Δapp không đo được — 3 alias cùng-xe → có khả năng Δapp<0.08 → defer persistent; nếu accept thì winner gid14 vẫn đúng xe) | margin guard |
| thai6 f1713 | DIFF | gid5 ew18.33 | **reject distance → mint** ✓ | G2 |
| thai7 f2112 | DIFF | gid1 ew26.60 (gid2 live px575) | **reject distance → mint** ✓ | G2 |
| thai8 f1945 | DIFF | gid5 ew6.07 | **reject distance → mint** ✓ (6.07 > 5.0 kể cả extended) | G2 |

### Kết quả trên 10 case đã phân loại

- **SAME_CAR được cứu: 5** — sang8 ✓(bắt buộc), thai4, thai6_f1128, thai6_f1205*, thai6_f4936* (*caveat §3a).
- **DEFER: 2** — thai3_f1774 (live-member competitor), thai6_f5367 (3 dormant alias cùng chỗ → margin).
- **DIFFERENT_CAR bị gán nhầm: 0** — cả 3 đều rớt G2 distance (18.33 / 26.60 / 6.07 > 5.0). Yêu cầu `=0` đạt trên tập đã phân loại.
- UNSURE: 0.

## 2. Quét rộng theo điều kiện design (Euclid ≤5.0, 18 session)

Design tham chiếu `identity.last_world` Euclid — metric khác `world_distance` corridor đã log → quét lại toàn bộ **133 `global_id_created`** + `dormant_reid_rejected`/`handoff_rejected`:

- `dormant_reid_rejected` với `last_position_distance ≤ 5.0` trong 18 session: **0**.
- `handoff_rejected`: không mang world/near-miss theo schema → 0 thêm.
- `global_id_created` có ≥1 dead/live gid trong Euclid ≤5.0 ngoài 10 case đã biết: **9 event mới**.

### 2a. Dead-gid near-misses (design sẽ đánh giá/cứu thêm)

| event | near gid(s) | đánh giá |
|---|---|---|
| thai4 f4045 gid10←cam1/L104 | gid8 ew2.42 dead 388f | unique → accept gid8. Ảnh `evidence/thai4_f4045`: cảnh tĩnh, xe đỗ nguyên → **SAME_CAR (rescue thêm)** |
| thai4 f4418 gid11←cam1/L107 | gid10 ew2.40 dead 366f | cùng chuỗi phân-mảnh cam1 → **SAME_CAR (rescue thêm)** |
| thai4 f5715 gid13←cam1/L111 | gid8 ew0.85 dead 2058f | `evidence/thai4_f5715`: cùng xe top-right suốt gap → **SAME_CAR (rescue thêm)** |
| thai6 f5143 gid18←cam2/L267 | gid14 ew3.23 dead 548f | `evidence/thai6_f5143`: xe xanh top-right liên tục → **SAME_CAR (rescue thêm)** — đây chính là mắt-xích trước của case f5367 |
| thai6 f5912 gid22←cam2/L323 | gid18 ew1.23, gid14 ew3.41, gid19 ew3.45 (dead) | `evidence/thai6_f5912`: cùng xe xanh top-right; 3 competitor cùng-xe → margin → **DEFER** (không gán nhầm) |

→ Phát hiện thêm **chuỗi phân-mảnh** không nằm trong 10 case: thai6 top-right xe xanh (gid14→gid18→gid19→gid22), thai4 cam1 (gid8→gid10→gid11→gid13). Design cứu được 4/5 (f5912 defer do margin) — nâng coverage thực-tế của nhánh.

### 2b. Live-member trong D_STAT (mặt rủi-ro design)

| event | frag vs live member | kết quả |
|---|---|---|
| thai6 f1359 gid5←cam2/L14 vs gid4 live cam1/L29 (ew2.57) | **frag drift 24.6wu — fragment KHÔNG stationary** | fragment-stationarity gate loại → an-toàn |
| thai1 f1038 gid3←cam1/L16 vs gid2 live cam2/L7 (ew1.05) | frag drift 16.9wu — đang chạy | fragment-stationarity loại → an-toàn |
| test1 f131 gid13←cam2/L152 vs gid6 live **cùng cam2** (ew4.79) | member same-cam | **G1 veto** → an-toàn (co-frame dist med 5.8 > D_STAT phần lớn) |
| thai3 f2346 gid6←cam1/L23 vs gid5 live cam2/L63 (ew0.73) | member drift 19.75wu trong 5f — đang lái ngang | G6 velocity/tail fail → an-toàn |
| **thai3 f1528 gid3←cam1/L7 vs gid2 live cam2/L50 (ew2.72)** | frag đỗ yên (drift 0.66), member drift 3.18wu/20f (~1.0wu/s <V_STAT 1.5) rồi chạy tiếp — **2 xe khác nhau** (ảnh `evidence/thai3_f1528_risk`: xe đen đỗ mép trên-trái vs xe di chuyển) | gid2 qua G6 → competitor duy nhất → margin đạt (single) → **ACCEPT L7→gid2 = FALSE MERGE** — CHỈ tránh được nếu G4 vận hành theo §9 `target_camera_gallery_missing → reject` (gid2 thiếu cam1 gallery — đúng như event gốc đã log). **Đây là rủi-ro gán-nhầm duy nhất phát hiện được, phụ thuộc hoàn toàn vào G4 gallery-missing=reject** |

## 3. Caveats đo được (ghi đúng chuẩn evidence)

- **3a. anchor_world null**: obs cũ của gid1 (thai6 f1205), gid6 (thai6 f4936), gid3 (thai3 f1774) thiếu `anchor_world` trong predictions → euclid G2 không đo được từ log. Design giả-định `identity.last_world` tồn-tại trong manager (khác với field trên obs record). Nếu internal last_world cũng null → G2 không tính được → 2 case này mất cứu (rớt về mint, không gây gán nhầm). → Đề nghị F2 log `identity.last_world` vào `stationary_reacquire_*` events để verify flag-on.
- **3b. Δapp cho margin**: appearance distance giữa fragment và competitor không được log (world_trajectory_rejections chỉ ghi cho gid bị trajectory-reject) → margin verdicts ở thai3_f1774/thai6_f5367/thai6_f5912 là conservative-defer; accept-side không kiểm chứng offline được.
- **3c. G5 size / G6 velocity**: `size_distance` chỉ có 2/10 case trong log; `velocity_world_per_second` không log — cứu/reject giả-định theo ảnh (xe đỗ yên) + design OR-gate; không chứng minh được offline.
- **3d. Live-member gate §5** ("member trong D_STAT → cho qua") là điểm mở lớn nhất: thai3_f1528 cho thấy 1 parked-car + 1 moving-car cách ~2.7wu vẫn vào được D_STAT; an-toàn hiện phụ thuộc gallery-missing=reject và fragment/member stationarity. Đề xuất cho F1 review: bổ-sung **veto khi member có window-drift > TAIL_STAT trong ±10f quanh event** (thai3_f1528 member drift 3.18wu ≈ tại ngưỡng; thai3_f2346 19.75wu đã bị loại) — hoặc siết velocity check lấy mẫu tại window event chứ không lấy EMA toàn-đời.

## 4. Tổng kết trả lời

- **SAME_CAR được cứu (tập 10): 5** — gồm sang8 (bắt buộc). +4 rescue mới phát hiện ngoài tập (thai4×3, thai6 f5143) — tổng physical-car saves có thể tới 9/14 near-miss events.
- **DIFFERENT_CAR bị gán nhầm (tập 10): 0** — đạt yêu cầu. Toàn-pool: 1 rủi-ro điều-kiện (thai3_f1528, chỉ xảy ra nếu gallery-missing KHÔNG reject).
- **DEFER: 2** trong 10 (thai3_f1774, thai6_f5367) + 1 ngoài (thai6_f5912) — defer persistent ≤ max(handoff_ttl,60)f rồi mint: không tệ hơn hiện trạng, không gán nhầm.
- Metric nghiệm: **design's px/Euclid numbers đúng** (bottom-center anchor); số cdist_px ở F1-b-distributions dùng convention sai — đã đính chính §0; khoảng tách thật SAME ≤93px / DIFF ≥120px.
