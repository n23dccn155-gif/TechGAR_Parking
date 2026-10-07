# BRIEF F1-a — builder-a: Thiết kế `stationary_reacquire` (KHÔNG code)

Đọc trước: `SPEC.md`, `MEGAPLAN.md`, `F0-SUMMARY.md`, và chính `F0-a-codepath.md` của bạn + `F0-b-cases.json` + `F0-c-tests.md` trong `D:\TechGar2\.analysis\gid-reacquire\`. Brief này là đầy đủ.

## Nhiệm vụ
Viết `D:\TechGar2\.analysis\gid-reacquire\F1-design.md` — thiết kế nhánh `stationary_reacquire` TỐI THIỂU trong `cross_camera_manager.py`, đủ để builder khác cài đặt ở F2 mà không phải đoán.

## Ràng buộc thiết kế (SPEC §5 + MEGAPLAN)
- Mọi hành vi mới sau cờ `enable_stationary_reacquire` (mặc định TẮT); cờ tắt ⇒ output bit-for-bit giống hiện tại.
- Không đổi threshold hiện có, ROI, calibration, slots, không refactor.
- `D_stat`, `A_stat`, `STAT_MARGIN` rút từ phân phối F0-b-cases.json — CHỈ RA khoảng tách SAME(7) vs DIFFERENT(3); nếu chồng lấn nêu rõ và để UNSURE→defer.
- Không tăng ID-theft; không gán khi `same_camera_live_owner`.
- Log event mới `stationary_reacquire_{accepted,rejected,deferred}` kèm đầy đủ components (dataset cho verify sau này).

## Thiết kế phải trả lời (bằng file:dòng, dựa trên trace F0-a)
1. **Chèn ở đâu**: vị trí chính xác trong `update_all_tracks` (ccm:7075+) / `_match_dormant_identities` / `_match_world_trajectory_identities` mà nhánh mới chạy — phải cứu được cả 2 blocker: dormant `same_camera_stale` (ccm:4968–4990, recency >12s) VÀ world `trajectory_score` (ccm:6022–6024). Phân tích ưu/nhược của các điểm chèn candidate (vd: nhánh riêng sau dormant-pass reject nhưng trước mint; hay escape trong world pass). Nhớ `plausible_recent_fragment` (ccm:6037–6044) đã fail vì time_topology≥0.75 — thiết kế có thể đặt cạnh nó hoặc thay điều kiện.
2. **Điều kiện vào** (tất cả phải chỉ ra code field/function): identity dormant/parked (không live-owner cùng cam), fragment same-spot (`world_distance ≤ D_stat`), `appearance ≤/≥ A_stat`, size ok, lịch sử đứng yên của identity (trail như thế nào chứng minh "đỗ yên" — vd speed trail, slot residency, `parked_identity_reservations`, hoặc anchor drift nhỏ). GAP thời gian tối thiểu/tối đa nếu cần.
3. **Guard chống cướp ID**: margin rule khi ≥2 ứng viên mạnh → defer PERSISTENT (không phải defer-1-frame — fix luôn defect phụ builder-c tìm thấy); `same_camera_live_owner` veto giữ nguyên; "spot từng trống trong gap" nếu kiểm chứng được từ observations (không bắt buộc nếu không làm được sạch — nêu rõ).
4. **Ngưỡng đề xuất**: bảng D_stat/A_stat/STAT_MARGIN kèm min/max của nhóm SAME vs DIFFERENT trong F0-b-cases.json (SAME: wd 0.45–3.96, app 0.72–0.87; DIFFERENT: wd 1.20–4.29, app 0.62–0.78 theo cần — tự trích từ JSON, và lưu ý wd lớn ở SAME là do bbox cắt mép → có thể cần chuẩn hoá bbox/partial-flag).
5. **Nhánh live-owner silent** (builder-c test2): gid còn live member cam khác, fragment cam này mint gid mới không log — thiết kế có xử lý/log không? Tối thiểu: log `stationary_reacquire_rejected` reason rõ ràng.
6. **Logging schema**: fields của 3 event mới + điểm emit (file:dòng).
7. **Cờ**: cách khai báo/truyền `enable_stationary_reacquire` theo convention cờ `enable_*` hiện có (xem `two_camera.py`/`runtime_server.py` truyền tham số vào CrossCameraManager).
8. **Rủi ro**: những case nào nhánh mới có thể gán nhầm (ma đỗ, xe thay thế trong gap, bbox partial) và guard tương ứng.

## Nộp
`F1-design.md` + cập nhật `progress-builder-a.md`. Khi xong trả lời "DONE F1-a" + 3 dòng: điểm chèn chọn, ngưỡng đề xuất, rủi ro lớn nhất.

## Ràng buộc
- KHÔNG sửa code (F1 là thiết kế). KHÔNG commit. Đọc-only production files.
- Checkpoint progress trước khi context >60%.
