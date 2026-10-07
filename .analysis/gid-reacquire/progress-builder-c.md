# progress-builder-c — gid-reacquire

## F0-c (DONE)

- Đọc SPEC.md + MEGAPLAN.md + briefs/F0-c.md; bắt chước
  `test_gid_reserved_competition.py`/`test_gid_departure_token.py`.
- Tạo `backend/main_detect/tests/test_stationary_reacquire.py` (file MỚI,
  5 tests). Chạy: **3 FAIL / 2 PASS** — log `.analysis/gid-reacquire/F0-c-pytest.log`.
- Report: `.analysis/gid-reacquire/F0-c-tests.md`.
- Kết quả chính:
  - Test dormant-owner (faithful sang8): FAIL `expected: reuse gid1`,
    rejection `same_camera_stale` elapsed=13.68 — khớp chuỗi event real.
  - Test live-on-cam1 (brief §3): FAIL `expected: reuse gid1`, veto im
    lặng (active state → ngoài dormant pool, world_trajectory_rejections
    rỗng) — ghi nhận diagnostic gap.
  - Negative (i) ambiguous-tie: FAIL — defer 1 frame rồi steal gid1
    (`dormant_reid_ambiguous` → `dormant_global_id_recovered`) — signature
    defect phụ cho F1 margin guard.
  - Negative (ii) distant-car: PASS. Negative (iii) same_camera_live_owner:
    PASS.
- Không sửa file nào khác; không chạm 5 file modified (SPEC §7).

## F1-c Phần 1 (DONE — READY-F1)

- Thêm 2 test skipif vào `test_stationary_reacquire.py`:
  `test_flag_off_keeps_current_mint_new_gid_behaviour` +
  `test_flag_on_emits_stationary_reacquire_events` — probe
  `inspect.signature` tự bật khi F2 thêm `enable_stationary_reacquire`.
- Assumed API ghi rõ trong `F1-c-prep.md` (flag name + event family).
- `make_manager` nhận `**extra_kwargs` pass-through.
- Kết quả: **3 FAIL / 2 PASS / 2 SKIP** — log `F1-c-pytest.log`,
  report `F1-c-prep.md`. Phần 2 chờ `F1-design.md`.
- Plan update (MEGAPLAN): F3 replay BỊ HUỶ — sau F2 gate = full suite
  ≥457 PASS / 8 XFAIL + flag-off unchanged. Đã siết flag-off test thêm
  event-level equivalence (`same_camera_stale` vẫn fire + không leak
  `stationary_reacquire_*`).

## F1-c Phần 2 (DONE)

- `F1-design.md` đã có → bổ sung 11 test mới phủ mọi gate G1–G7 + guard §3
  (margin defer PERSISTENT 30f, live_member_divergence reject-có-log,
  fragment_moving veto, occupied_spot_conflict defer, G7 gap 50.5s).
- `make_manager_flagged()` adaptive: flag tồn tại → bật ON; chưa có →
  unflagged → positive tests vẫn FAIL đúng. 5 test cũ chuyển sang flagged.
- `test_parked_reservation_reacquire_invariant` PASS ngay flag-off —
  invariant G6(c) giữ cả 2 mode.
- Kết quả: **3 FAIL / 3 PASS / 13 SKIP** — log `F1-c-pytest.log`,
  report `F1-c-tests.md`.
- Update: thêm `test_member_window_drift_over_tail_stat_vetoes_accept`
  (thai3_f1528 false-merge — member live drift >TAIL_STAT trong ±10f,
  fragment parked → reject/defer có log, không accept). Tổng 20 tests:
  **3 FAIL / 3 PASS / 14 SKIP**.

## F2-c verify (DONE)

- F2-a đã land (`enable_stationary_reacquire` ctor L197, default OFF).
- `test_stationary_reacquire.py -v`: **20/20 PASS** — tất cả skipif tự bật;
  2 repro + ambiguous-defer + flag-off equivalence + flag-on events đều xanh.
- Full suite `pytest tests/ -x -q`: **477 passed / 8 xfailed** — khớp
  builder-a, vượt gate ≥457/8, không regression. Log `F2-c-full-suite.log`.
- Flag-off equivalence PASS (outcome + event level).
- Report: `F2-c-verify.md`.
