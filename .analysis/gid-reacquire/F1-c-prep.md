# F1-c-prep — flag-off equivalence + event-logging placeholders (Phần 1)

File sửa: `backend/main_detect/tests/test_stationary_reacquire.py` (file của
F0-c, được phép sửa). Log: `.analysis/gid-reacquire/F1-c-pytest.log`.

## Assumed API (GHI RÕ để F2 map)

| Thành phần | Tên giả định | Căn cứ |
|---|---|---|
| ctor flag | `enable_stationary_reacquire: bool = False` | Convention `use_deep_reid: bool = False` (ccm ~L175); F0-SUMMARY §5 đề xuất đúng tên này, default TẮT |
| event accept | `stationary_reacquire_accepted` | F0-SUMMARY §5 (`log stationary_reacquire_*`) |
| event reject | `stationary_reacquire_rejected` | cùng family |
| event defer | `stationary_reacquire_deferred` | cùng family (cho margin-defer) |
| surface | `manager.to_json({})["recent_events"]` | API test đã dùng |

Cơ chế tự-bật: `_HAS_STATIONARY_FLAG` probe
`inspect.signature(CrossCameraManager.__init__)` — khi F2 thêm tham số,
hai `@pytest.mark.skipif` tự tắt, test chạy thật mà không cần sửa.

## Test thêm (Phần 1)

| Test | Trạng thái hiện | Kỳ vọng sau F2 |
|---|---|---|
| `test_flag_off_keeps_current_mint_new_gid_behaviour` | **SKIP** (`enable_stationary_reacquire` chưa có trong ctor) | PASS: flag OFF → sang8 vẫn mint gid mới + `same_camera_stale` vẫn ghi event + KHÔNG có `stationary_reacquire_*` leak. Đây là regression gate chính vì F3 replay đã bị huỷ (MEGAPLAN update) — gate còn lại = full suite ≥457 PASS / 8 XFAIL + test này |
| `test_flag_on_emits_stationary_reacquire_events` | **SKIP** (cùng lý do) | PASS: flag ON → `stationary_reacquire_accepted` cho gid1 trong recent_events + fragment reuse gid1 |

## Kết quả pytest hiện tại

```
3 failed, 2 passed, 2 skipped in 1.71s
FAILED test_stationary_car_reacquired_after_track_death_reuses_gid
FAILED test_stationary_reacquire_while_gid_live_on_other_camera_reuses_gid
FAILED test_two_equally_strong_candidates_must_defer_or_mint
PASSED test_distant_car_does_not_steal_stationary_gid
PASSED test_same_camera_live_owner_blocks_stationary_reacquire
SKIPPED flag_off / flag_on (flag chưa tồn tại)
```

Không sửa production; `make_manager` giờ nhận `**extra_kwargs` pass-through
vào ctor để các test flag dùng chung fixture.

## Phần 2 — chờ `F1-design.md`

Khi design xuất hiện sẽ bổ sung ≥1 test/guard, đặc biệt:
- margin defer **persistent** (không chỉ 1 frame — defect phụ đã FAIL sẵn);
- spot-emptied-in-gap nếu design có điều kiện đó;
- live-owner cross-cam rejections có event (diagnostic gap đã ghi F0).

→ READY-F1
