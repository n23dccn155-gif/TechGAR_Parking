# progress-builder-c — merge/split P0

## Đang làm
- Task P0 builder-c (MEGAPLAN §3): viết `tests/test_merge_split_scenarios.py` MỚI — S1–S9,
  current-behavior PASS (khóa baseline) + desired-behavior `xfail(strict=False, reason=…)`;
  chạy pytest baseline; ghi `P0-c-scenarios.md`.
- Ownership §4: C chỉ own `tests/test_merge_split_scenarios.py` + file report của C.
  KHÔNG sửa `src/` (tracker/occlusion_guard/ccm = A; prediction_writer/report tool = B).

## Đã đọc/định vị (file:dòng)
- `occlusion_guard.py`: `prepare` :55 (expiry cố định `expires_at=last_clean+timeout` :119-130),
  `covering_group` :102 (≥3-member merge :116-121), `activate` :123, `partition` :150
  (`len!=2 → []` :153), `gate_assignments` :191-232 (atomic: `valid = len(ids)==2 and
  all in pairs`; `swapped-direct >= 2*margin and direct < 1.2`; streak `recovering>=3`;
  defer cả group + suppress member-like dets `costs<1.0` :230).
- `motion_tracker.py`: tầng defer thứ 2 trong `_assign` :1914-1988
  (`split_assignment_deferred` margin `0.08*(2-lineage)`, `association_recovery_pending`
  cần `ambiguous_recovery_frames=3`); merged-blob suppression :1793-1906;
  `_unresolved_merged_birth` :364-389 (veto cần blob chứa CẢ 2 owner);
  `_pair_metrics` :1769-1781 (chỉ viable pairs); `process_frame` unmatched→frozen/coasting :2257-2280.
- `test_stability_occlusion.py`: `seeded_tracker()` :84-102 (mẫu dùng lại — đọc only).

## XONG (P0-c nộp)
- `tests/test_merge_split_scenarios.py`: 17 test (9 PASS baseline + 8 xfail desired).
- Baseline đo trước khi thêm file: 448 passed. Sau: **457 passed + 8 xfailed, 0 fail/xpass**.
- Report: `.analysis/merge-split/P0-c-scenarios.md`.
- Quirk phát hiện: pair-group nền expires_at=inf sau khi supergroup expire (S8 lock).

## Review update (LEAD feedback)
- S5 noise cost .95→.75 (< assignment_cost_limit .90) để kịch bản reachable end-to-end qua LAPJV.
- 3 log lưu: P0-c-baseline-pytest.log (448), P0-c-fullsuite-pytest.log (457+8x), P0-c-scenarios-pytest.log (9+8x).
- Report ghi rõ: xfail = ứng viên hành vi chờ P1 chốt, KHÔNG phải yêu cầu XPASS bắt buộc ở P3.

## Review update 2 (LEAD §8)
- S6: sửa table + test comment — claim chỉ ở group-gate (expiry → gate accept ngay);
  per-track defer + birth veto tồn tại độc lập, KHÔNG kết luận "assign tự do pipeline".
- S5: ghi rõ unit-verified + LAPJV-compatible inferred, chưa end-to-end (không integration).
- P1 line đồng bộ: 8 xfail = ứng viên chờ DESIGN chốt; S1 chưa duyệt.
- Rerun sau chỉnh comment: 9 passed + 8 xfailed (log P0-c-scenarios-pytest.log đã refresh).
