# progress-builder-a.md

## Đang làm / Trạng thái
- P0 builder-a (code-map + verify §1): **DONE** → `P0-a-code-map.md`.
- READ-ONLY toàn bộ; không sửa code. Không quét `.venv`.

## Ownership (§4 MEGAPLAN)
- File tôi sở hữu (P2+): `occlusion_guard.py`, `motion_tracker.py` (vùng
  hypothesis/recovery); `cross_camera_manager.py` state-sets + `two_camera.py`
  cờ CLI — chỉ sau lead duyệt.
- `.analysis\merge-split\P0-a-code-map.md`, `progress-builder-a.md`: file của tôi.

## Kết quả chính / điểm thiếu so với §1
- §1.1 toàn bộ VERIFIED (dòng chuẩn hơn megaplan: expiry og:120+128-130,
  birth veto mt:364-389, unmatched loop mt:2257-2308).
- §1.2.1/2/4/6/8 VERIFIED; `_mark_competing_assignments` thực mt:1331-1458
  (megaplan ~1380-1500).
- **Thiếu trong §1**: (a) `split_assignment_margin`, `merged_reacquire_max_seconds`,
  `lost_track_ttl_seconds`, area-ratio params KHÔNG có CLI wiring — chỉ ctor
  default; (b) §1.2.7 chỉ nhắc 1 list CCM — thực tế ≥4 điểm phân loại
  (ccm:2257-2262, ccm:2275-2279, `_has_fresh_detection` kind-set khóa bởi
  test_ccm:196, tc:726, tc:2696); (c) ngăn sinh ID gồm ≥3 lớp, không chỉ 2
  tầng defer (thêm echo/viable/birth-veto mt:2322-2340).
- Cờ `enable_multi_hypothesis_recovery` chưa tồn tại — phải thêm mới, mặc
  định TẮT (đúng quy tắc §0).

## Addendum (LEAD 20:5x)
- Xác-nhận độc lập semantics event: `opened` chỉ tại activate-first-time
  (og:124-131); group ≥3 tạo active sẵn (og:119) ⇒ không opened; watch-group
  passive (expires_at=inf) có thể bắn `expired` khi member chết dù chưa merge;
  silent-delete og:94-100 không event. → §7 report: implicit-episode ≠ merge
  thất-bại; tách {watch-only | active-2-exp | ≥3-exp | recovered}.

## Addendum-2 (cross-check P0-c)
- §8 report: S2/S8 VERIFIED; S5 mechanism đúng nhưng ".95" là unit-only
  (pipeline cap .90 — dùng ≤.90); S6 quá tay — post-expiry per-track tier
  vẫn defer trừ khi `clear_evidence`; birth-veto `independent_pairs` sống tiếp.
- Quirk P1: watch-group `expires_at=inf` không tự dọn sau supergroup-expire.

## Bước còn lại
- Chờ lead `SPEC-REVIEW.md` → P1 DESIGN.md (tôi là tác giả kỹ thuật).
- A idle; không đụng code tracker cho tới khi P2/P3 được giao.
