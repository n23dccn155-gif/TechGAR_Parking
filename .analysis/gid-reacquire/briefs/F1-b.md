# BRIEF F1-b — builder-b: Phân phối components + chuẩn bị backtest (đọc-only)

Đọc trước: `F0-SUMMARY.md`, `F0-b-cases.md`, `F0-b-cases.json`, `MEGAPLAN.md` (F1) trong `D:\TechGar2\.analysis\gid-reacquire\`.

## PHẦN 1 — Bảng phân phối (làm ngay)
Từ `F0-b-cases.json` (10 candidates, verdicts đã duyệt) trích bảng theo nhóm verdict:

| component | SAME_CAR (n=7): min/median/max | DIFFERENT_CAR (n=3): min/median/max | chồng lấn? |
|---|---|---|---|
| world_distance, appearance, direction, time_topology, speed, corridor, size, traj_score, gap_frames |

Mục tiêu: tìm **khoảng tách** cho D_stat/A_stat/STAT_MARGIN. Lưu ý: 2 SAME_CAR có wd>1 do bbox cũ bị cắt mép (partial bbox) — nếu được, tính lại "center distance" từ anchor pixel thay vì world_distance để tách nhiễu bbox, và ghi cả hai số vào bảng.

Đồng thời đề xuất các tiêu chí BỔ SUNG ngoài components có thể tách SAME/DIFFERENT mà dữ liệu hỗ trợ (vd: "có track khác độc lập chiếm chỗ trong gap" — thai7; "spot trống trong gap" — thai8): với mỗi tiêu chí nêu có kiểm chứng được từ `predictions.jsonl` observations không (không cần code, chỉ nêu tính khả thi + cách đo).

## PHẦN 2 — Sau khi `F1-design.md` xuất hiện (do builder-a viết)
Backtest: chạy ngược MỌI điều kiện của thiết kế trên cả 10 candidates + (nếu điều kiện tham chiếu event khác) mọi `global_id_created`/`dormant_reid_rejected` có wd≤5 trong 18 session:
- Bao nhiêu SAME_CAR được cứu (mục tiêu: càng nhiều, bắt buộc sang8).
- Bao nhiêu DIFFERENT_CAR bị gán nhầm — **phải = 0**; nếu >0 liệt kê case và điều kiện gây lỗi.
- Bao nhiêu UNSURE/defer.
Viết `F1-b-backtest.md` (bảng per-candidate: điều kiện nào pass/fail, verdict thiết kế vs verdict F0-b).

## Nộp
- `F1-b-distributions.md` (Phần 1 — bảng phân phối + đề xuất tiêu chí bổ sung)
- `F1-b-backtest.md` (Phần 2 — sau khi có F1-design.md; nếu design chưa xong, hoàn thành Phần 1 rồi trả lời "READY-BACKTEST" và chờ)

## Ràng buộc
- Đọc-only code/data; được viết script phân tích tạm dưới `.analysis/gid-reacquire/`. KHÔNG replay pipeline. KHÔNG commit.
- `progress-builder-b.md` sau mỗi bước; checkpoint trước context >60%.
