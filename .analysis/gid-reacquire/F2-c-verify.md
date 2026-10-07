# F2-c-verify — F3-static verification (builder-c)

Ngày: sau khi F2-a land (`enable_stationary_reacquire` ctor ccm:L197,
default OFF). Log full suite: `.analysis/gid-reacquire/F2-c-full-suite.log`.
Không sửa code; không replay (F3 đã huỷ — verify = static + tests).

## 1. File test cụ thể — `tests/test_stationary_reacquire.py -v`

```
20 passed in 0.29s
```

**20/20 PASS** — toàn bộ test từng SKIP (14) tự bật và xanh:

| Nhóm | Test | Kết quả flag-ON |
|---|---|---|
| Repro chính | `..._after_track_death_reuses_gid` | PASS — reuse gid1 qua nhánh mới |
| Repro §3 brief | `..._while_gid_live_on_other_camera` | PASS — live-owner reuse, có log |
| defect-2 | `..._two_equally_strong_candidates...` | PASS — defer persistent, không steal |
| Guard cũ | `distant_car`, `same_camera_live_owner` | PASS — giữ nguyên |
| Flag | `flag_off_keeps_current_mint_new_gid` | PASS — flag-off mint + `same_camera_stale` vẫn ghi + không leak `stationary_reacquire_*` |
| Flag | `flag_on_emits_stationary_reacquire_events` | PASS — `stationary_reacquire_accepted` gid1 + reuse |
| G2 | `g2_distance_beyond_dstat_rejects` | PASS — d=8wu reject có log |
| G3 | `g3_extended_band_accept_with_iou` + `extended_band_partial_bbox_rejects` | PASS 2 chiều |
| G4/G5 | appearance/size mismatch | PASS — reject có log |
| G6 | `g6_identity_was_moving_when_lost_rejects` | PASS — `stationary_history_missing` |
| G7 | `g7_long_gap_..._still_reacquires` | PASS — gap 50.5s (số sang8 thật) vẫn accept |
| Live-member | `live_member_divergence_rejects_with_log` | PASS — reject CÓ LOG (fix silent veto) |
| Margin | `margin_defer_is_persistent_not_one_frame` | PASS — 30f không bind |
| Occupied-spot | `occupied_spot_conflict_defers` | PASS — defer 20f |
| Fragment veto | `fragment_moving_veto` | PASS |
| thai3_f1528 | `member_window_drift_over_tail_stat_vetoes_accept` | PASS — drift guard veto có log |
| Invariant | `parked_reservation_reacquire_invariant` | PASS — cả 2 mode |

## 2. Full suite — `pytest tests/ -x -q` (từ `backend/main_detect`)

```
477 passed, 8 xfailed in 3.75s
```

- ≥457 PASS / 8 XFAIL: **ĐẠT** — 477 pass, khớp chính xác báo cáo
  builder-a (477+8), không tụt so với baseline.
- Không failure nào; 8 xfail = bộ xfail sẵn có của suite.

## 3. Flag-off equivalence

`test_flag_off_keeps_current_mint_new_gid_behaviour` PASS: với
`enable_stationary_reacquire=False` kịch bản sang8 vẫn mint gid mới,
`dormant_reid_rejected/same_camera_stale` vẫn được ghi, và KHÔNG có event
`stationary_reacquire_*` nào leak — equivalence ở outcome + event level.

## Kết luận gate F2 (theo MEGAPLAN đã sửa — không replay)

- [x] test mới PASS (20/20)
- [x] full suite ≥457/8 → 477/8, không regression
- [x] cờ TẮT giữ hành vi (outcome + event equivalence)
- Gate còn lại theo plan: builder-b review diff + re-check design
  conditions trên F0-b-cases.json (offline) — không phải việc của C.
