# F1-c-tests — Phần 2: contract tests cho mọi gate/guard của F1-design

File: `backend/main_detect/tests/test_stationary_reacquire.py` (20 tests)
Log: `.analysis/gid-reacquire/F1-c-pytest.log`

## Kết quả hiện tại

```
3 failed, 3 passed, 14 skipped
```

## Cơ chế tự-bật

- `make_manager_flagged()`: thêm `enable_stationary_reacquire=True` khi
  ctor đã có tham số (probe `inspect.signature`); trước F2 fallback về
  manager thường → các positive test vẫn FAIL đúng (documenting bug) và
  tự flip PASS khi F2 land.
- Các test contract mới: `@pytest.mark.skipif(not _HAS_STATIONARY_FLAG)`
  — tự chạy khi flag tồn tại.

## Coverage theo F1-design

### Gates §2c

| Gate | Test | Assert flag-ON |
|---|---|---|
| G1 same_camera_live_owner | `test_same_camera_live_owner_blocks_stationary_reacquire` (adaptive, PASS nay) | fragment xa ≠ gid1 |
| G2 distance ≤ D_STAT | `test_g3_extended_band_accept_with_iou` (SKIP) | d=4wu + IoU tốt → accept gid1 |
| G2 reject > D_STAT | `test_g2_distance_beyond_dstat_rejects` (SKIP) | d=8wu → `stationary_reacquire_rejected` + ≠1 |
| G3 IoU corroboration | `test_g3_extended_band_accept_with_iou` (accept) + `test_extended_band_partial_bbox_rejects` (SKIP — bbox 140×60 vs 42×24 → IoU≈0.10 và/hoặc size fail → reject) | |
| G4 appearance | `test_g4_appearance_mismatch_rejects` (SKIP) | histogram bin9 vs bin0 → rejected + ≠1 |
| G5 size | `test_g5_size_mismatch_rejects` (SKIP) | 200×96 vs 42×24 → rejected + ≠1 |
| G6a/b identity-was-stationary | `test_g6_identity_was_moving_when_lost_rejects` (SKIP) | identity chết đang chạy → `stationary_history_missing` + ≠1 |
| G6c parked reservation | `test_parked_reservation_reacquire_invariant` (**PASS ngay flag-off** — reservation exempt stale, invariant giữ flag-on) | reuse gid1 |
| G7 recency log-only | `test_g7_long_gap_beyond_moving_window_still_reacquires` (SKIP) | elapsed ~50.5s (>12s stale window, <60s retention — đúng số sang8 thật) → vẫn accept |

### Guards §3

| Guard | Test | Assert flag-ON |
|---|---|---|
| same_camera_live_owner | `test_same_camera_live_owner_blocks_stationary_reacquire` (adaptive) | veto giữ + (khi flag) `stationary_reacquire_rejected` |
| live_member_divergence | `test_live_member_divergence_rejects_with_log` (SKIP) | member live cam1@world400 + frag cam2@world568 (div 168) → reject **CÓ LOG** (fix silent-veto) + ≠1 |
| margin/ambiguous → defer PERSISTENT | `test_margin_defer_is_persistent_not_one_frame` (SKIP) | 30 frame liên tục không bao giờ bind {1,2} + deferred-marker events |
| occupied_spot_conflict | `test_occupied_spot_conflict_defers` (SKIP) | gid1@560 + gid2@563 dormant (3wu) → defer 20f + `stationary_reacquire_deferred` |
| fragment_moving veto | `test_fragment_moving_veto` (SKIP) | fragment drift span ~34wu → ≠1, không accepted |
| **member window-drift > TAIL_STAT (guard mới, thai3_f1528)** | `test_member_window_drift_over_tail_stat_vetoes_accept` (SKIP) | member cam1 live drift 555→562 (~7wu/9f trong ±10f), fragment đỗ yên @562 → **reject/defer CÓ LOG, KHÔNG accept** — false-merge guard |
| spot-emptied | — | design tự nêu UNSURE/F2 không bắt buộc (tracker không sinh obs cho xe đỗ) → không test |

### Flag + event plumbing (Phần 1, giữ nguyên)

| Test | Trạng thái |
|---|---|
| `test_flag_off_keeps_current_mint_new_gid_behaviour` | SKIP — assert flag-off: mint gid mới + `same_camera_stale` vẫn ghi + không leak `stationary_reacquire_*` |
| `test_flag_on_emits_stationary_reacquire_events` | SKIP — assert `stationary_reacquire_accepted`(gid1) + reuse |

## Cập nhật test cũ (adaptive)

- 3 test FAIL cũ chuyển sang `make_manager_flagged()` → tự PASS khi F2 bật
  flag (test2 fragment kéo về x=63/world563 = d≈3 trong D_STAT_CORE để
  flag-on accept được qua gates, flag-off vẫn mint → FAIL giữ nguyên).
- 2 test âm (ii, iii) cũng flagged → giờ verify cả flag-on path.
- `test_parked_reservation_reacquire_invariant` PASS ngay → xác nhận G6c
  đã hoạt động trong dormant machinery hiện tại (reservation → stale
  exempt → dormant same-camera bound lại).

## Case thai3_f1528 (guard mới)

`test_member_window_drift_over_tail_stat_vetoes_accept` tái hiện
F1-b-backtest §2b: gid dormant anchor @world560, member live cam1 drift
~7wu trong window ±10f (real: 3.18wu/20f ~1.0wu/s — dưới V_STAT nên G6
identity-level không bắt), fragment parked @562 cách member-anchor 0-3wu
(agreement path — chỉ drift-guard veto được). Fixture clear `_handoffs`
trước pha fragment để handoff machinery không nuốt quyết định. Assert:
assigned ≠ gid1, không `stationary_reacquire_accepted`, PHẢI có
rejected/deferred event (reason impl-defined: member-window-drift /
divergence / stationary_history_missing đều chấp nhận — contract là
"veto có log, không merge").

## Lưu ý cho F2

- Reason-exactness được nới lỏng có chủ đích ở `live_member_divergence` và
  `occupied_spot_conflict` (assert event + outcome; reason enum trong
  docstring) — reason precedence khi nhiều gate cùng fail là impl-defined.
- `fragment_moving`: assert ≠1 + không accepted; nếu F2 chọn silent-skip
  ở candidacy thay vì log reject, test này cần nới thêm — đã note.
- `_seed_dormant_gid1_at`/`_feed_fragment`/`_stationary_events` helpers
  dùng chung cho contract tests.
