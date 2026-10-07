# F0-SUMMARY — Root cause (lead synthesis)

Ngày: 2026-10-06 · Lead: Devin (w1:p6) · Inputs: F0-a-codepath.md, F0-b-cases.{md,json}, F0-c-tests.md.
Lead đã tự kiểm: event thô f600, quét `canonical_gid==1` (chỉ cam2), hằng số `identity_retention_moving_seconds=12.0` (ccm:182), `match_threshold=0.78` (ccm:381), 4/10 evidence sheet (sang8, thai6_f4936, thai7_f2112, thai8_f1945) — khớp report.

## 1. Nguyên nhân gốc — ĐÃ CHỨNG MINH

Xe đỗ yên → local track chết → fragment mới mọc lại cùng chỗ bị cấp gid mới qua **hai vòng reject chồng nhau**, không nhánh nào cứu:

1. **Dormant pass** (`_match_dormant_identities`, ccm:4911): `same_camera_stale` — elapsed 50.1s > `identity_retention_moving_seconds`=12s (ccm:4659–4689 → record 4968–4990). Veto recency chặn TRƯỚC khi position/appearance được đánh giá. Đây là blocker đầu tiên (f595; f600 im lặng do dedup 8-frame ccm:3039).
2. **World-trajectory pass** (`_match_world_trajectory_identities`, ccm:5748): `trajectory_score` 0.6683 < 0.78 (ccm:6022–6024). Số học đã kiểm: `0.35·corridor(0.945) + 0.25·app(0.833) + 0.15·dir(0.0015) + 0.10·speed(0.971) + 0.10·time_topo(0) + 0.05·size(0.644) = 0.6683`.
   - `time_topology=0`: gap 50.2s >> recent_window ≈6.9s (handoff_ttl 45f / ~6.5fps) — cấu trúc tất yếu cho xe đỗ-tái-hiện.
   - `direction≈0.0015`: cosine của 2 vector vận tốc ≈0 (nhiễu) → −0.997. Vô nghĩa cho xe đỗ nhưng kéo mạnh score.
   - Escape duy nhất `plausible_recent_fragment` (ccm:6037–6044) đòi `time_topology≥0.75` → bất khả thi.
   - Sensitivity: chỉ sửa time_topo→1.0 = 0.768 (vẫn reject); chỉ sửa direction→0.5 = 0.743; cả hai = 0.843 → cần xử lý cả hai hoặc nhánh mới.
3. **New-ID fallback** mint gid3 tại ccm:7439–7457 sau khi mọi escape thất bại.

**Correction quan trọng vs SPEC §1:** gid1 KHÔNG "matched trên cam1" lúc f600 — member duy nhất là cam2/lid35 (f173–266, lost f267), dormant với last_camera=cam2. Event `target_camera=cam1/lid28` ở f600 là dormant check chéo khác, không phải bằng chứng gid1 sống trên cam1.

## 2. Hypothesis verdicts

| H | Verdict | Ghi chú |
|---|---|---|
| H1 (score giả định xe di chuyển) | **CONFIRMED** | `direction`+`time_topology` = nhiễu/0 cho xe đỗ; mất 0.175 score |
| H2 (gid1 live cam1 → nhánh live-owner) | **PARTIALLY REFUTED** | Reject đúng là từ world/live pass — nhưng gid1 dormant; pool world gồm cả dormant+live |
| H3 (không có re-acquire theo vị trí+appearance) | **CONFIRMED** | Matcher position+appearance-primary duy nhất (dormant same-camera) bị chặn bởi recency veto; world pass không có shortcut "gần+giống ⇒ accept" |

## 3. Mức lan rộng — 18 session (builder-b, đã spot-check)

- 10 candidate có `world_distance ≤ 5` với trajectory rejections: **SAME_CAR 7** (sang8 f600, thai3 f1774, thai4 f4633, thai6 f1128, thai6 f1205, thai6 f4936, thai6 f5367), **DIFFERENT_CAR 3** (thai6 f1713, thai7 f2112, thai8 f1945), UNSURE 0.
- Chữ ký chung SAME_CAR: `time_topology=0.0`, `direction≈0`, `appearance` 0.72–0.87, `corridor` 0.75–0.97. 2 case WD>1 do bbox cũ bị cắt mép (không phải dịch chuyển thật).
- DIFFERENT_CAR: reject ĐÚNG — xe khác hẳn, hoặc chỗ đỗ trống giữa gap.
- `dormant_reid_rejected`/`handoff_rejected` không mang `world_distance` → 0 match trong quét rộng.

## 4. Phát hiện phụ từ test (builder-c) — F1 phải tính

- **Defect phụ**: ambiguous dormant tie (2 ứng viên cùng mạnh) chỉ defer 1 frame rồi steal gid ở frame kế — margin guard không tồn tại. → F1 cần defer giữ/persistent, không phải trì hoãn 1 frame.
- **Diagnostic gap**: nhánh live-owner veto/mint KHÔNG ghi event nào (world_trajectory_rejections rỗng). → F1 nên log rejections cho nhánh này để có dataset.
- Test file `tests/test_stationary_reacquire.py`: 3 FAIL (2 kịch bản chính `expected: reuse gid1` + ambiguous-steal) / 2 PASS (distant-car, same_camera_live_owner) — tái hiện đúng chuỗi event thật.

## 5. Exit F0

- SAME_CAR = 7 ≥ 2 → **đủ nền, sang F1** (không dừng).
- Vùng thiết kế gợi ý cho F1 (từ dữ liệu, chưa phải quyết định): nhánh `stationary_reacquire` trước/sau dormant+world pass, guard margin giữ defer, log `stationary_reacquire_*`, cờ `enable_stationary_reacquire` mặc định TẮT. Ngưỡng D_stat/A_stat/STAT_MARGIN rút từ phân phối SAME vs DIFFERENT trong F0-b-cases.json — SAME có WD≤3.96(nhiễu bbox)/app≥0.72; DIFFERENT có WD 1.2–4.3 nhưng kèm xe-thật-khác hoặc chỗ trống → cần thêm điều kiện ngoài WD (ví dụ "không có track khác độc lập tại chỗ đó", "spot không từng trống" nếu chứng minh được từ observations).
