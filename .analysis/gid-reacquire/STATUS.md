# STATUS — gid-reacquire (stationary re-acquisition)

Lead: Devin (w1:p6). Builders: builder-a (w1:p7), builder-b (w1:p8), builder-c (w1:p9).

## Phase hiện tại: F4 DONE — **DỪNG, CHỜ USER** (test livecam + quyết bật cờ)

F2+F3-static xong 2026-10-06. Implement per F1 rev2 (ccm +1073/−4 flag-gated, two_camera +8). Verify: 20/20 test mới PASS, full suite **477 PASS / 8 XFAIL** (=457+20, 0 regression), flag-off bit-identical (diff+test), offline re-run **6 SAVED/1 DEFER/0 false-accept**. Report: `REPORT.md`; hướng dẫn livecam: `LIVECAM-TEST.md`. Đề xuất: KHÔNG bật mặc định — test livecam trước.

**USER đã duyệt F1 rev2** (2026-10-06) kèm note: giải quyết vấn đề CHUNG — không fit tham số cho session cụ thể; ngưỡng = ctor params có default, conservative, log để calibrate livecam.

| Builder | Pane | Nhiệm vụ F2 | Deliverable | Trạng thái |
|---|---|---|---|---|
| builder-a | w1:p7 | Implement per F1-design rev2 (baseline-dirty.patch trước khi sửa) | `F2-a-impl.md` + code | WORKING |
| builder-b | w1:p8 | (sau impl) review diff: flag-off behavior, scope files | review note | QUEUED |
| builder-c | w1:p9 | (sau impl) test mới PASS + full suite ≥457/8 XFAIL + flag-off không đổi | pytest logs | QUEUED |

F1 xong 2026-10-06. Backtest offline: 5/7 SAME cứu (sang8 ✓ bắt buộc), 2 defer an-toàn, 0/3 DIFFERENT gán nhầm; +4 rescue ngoài tập; 1 rủi ro (thai3_f1528) đã được vá trong rev2. Test contract: 20 tests, 3 FAIL đúng bug / 3 PASS / 14 skip chờ F2.

F0 DONE 2026-10-06 → `F0-SUMMARY.md`. Kết quả: SAME_CAR=7/10 (6/8 original) ≥2 → qua stop-point 1. Root cause proven: dormant `same_camera_stale` (>12s) + world `trajectory_score` (time_topology=0 + direction≈0 cho xe đỗ). Correction: gid1 dormant cam2, không live cam1.

| Builder | Pane | Nhiệm vụ F1 | Deliverable | Trạng thái |
|---|---|---|---|---|
| builder-a | w1:p7 | Viết `F1-design.md` — nhánh `stationary_reacquire` tối thiểu, ngưỡng từ phân phối F0-b | `F1-design.md` | DONE — chờ lead duyệt |
| builder-b | w1:p8 | Phân phối (DONE `F1-b-distributions.md`) + backtest design trên 10 candidates | `F1-b-backtest.md` | WORKING (Phần 2) |
| builder-c | w1:p9 | Flag-off tests (DONE `F1-c-prep.md`) + test mọi gate/guard của design | `F1-c-tests.md` | WORKING (Phần 2) |

## F1-design.md — tóm tắt (builder-a)
- Pass mới `_match_stationary_reacquire` làm "last resort trước mint" (giữa ccm:7239 và vòng mint ccm:7244); cờ tắt → trả set() rỗng → bit-identical.
- Gates: no same-cam live owner, Euclid world ≤D_STAT_CORE 3.0 (band 3.0–5.0 cần IoU≥0.15 / bbox-partial), app sim ≥0.70, size ≤0.90, identity-đỗ-yên (velocity/tail-span/parked-reservation), + persistent-defer margin (fix defect-2), live-member divergence log.
- Ngưỡng trích dữ liệu: SAME Euclid ≤4.40 vs DIFF ≥6.07 (khe sạch); appearance chỉ làm floor (chồng lấn).
- Cờ `--enable-stationary-reacquire` vào two_camera.make_parser → tự lan sang runtime_server.py CLI; event đọc qua `/api/runtime/events`.
- UNSURE thừa nhận: band 4.4–5.0, V_STAT/TAIL_STAT cần calibrate livecam.

## F0 hoàn tất — verdicts
- builder-a: ACCEPTED (trace + số học 0.6683 tự kiểm; H1/H3 confirmed, H2 partially refuted, SPEC premise corrected).
- builder-b: ACCEPTED (7 SAME_CAR/3 DIFF/0 UNSURE; spot-check 4 sheet khớp).
- builder-c: ACCEPTED (3 FAIL đúng / 2 PASS; phát hiện defect phụ: defer-1-frame-then-steal + live-owner silent veto).

## Điểm dừng (theo MEGAPLAN §4)
- Sau F0: nếu SAME_CAR < 2 → dừng, báo user.
- Sau F1: dừng chờ user duyệt `F1-design.md`.
- Sau F4: dừng chờ user quyết bật cờ.

## Ràng buộc đang áp dụng
- F0–F1: đọc/phân tích only (builder-c chỉ tạo file test MỚI).
- Không commit/push. Không revert 5 file modified sẵn (SPEC §7).
- Python: `D:\TechGar2\backend\main_detect\.venv\Scripts\python.exe`.
- Baseline test suite: 457 PASS / 8 XFAIL — không được tụt.

## Log
- 2026-10-06 — F0 dispatched: briefs tại `.analysis/gid-reacquire/briefs/F0-{a,b,c}.md`.
- 2026-10-06 — F0 DONE: F0-SUMMARY.md viết xong. F1 dispatched (briefs/F1-{a,b,c}.md). **Chờ F1-design.md → lead duyệt → DỪNG chờ user.**
- 2026-10-06 — **USER UPDATE: F3 replay HUỶ** (user tự test livecam). MEGAPLAN F3→kiểm-tra-tĩnh (full pytest + review diff + điều kiện trên F0-b-cases.json offline); F4 +LIVECAM-TEST.md. Cờ phải bật/tắt qua runtime_server.py CLI. Đã thông báo 3 builder.
- 2026-10-06 — F1 DONE: F1-design.md rev2 (sau rework từ backtest thai3_f1528), F1-b-distributions.md, F1-b-backtest.md, F1-c-{prep,tests}.md. Metric-check: design dùng bottom-center anchor đúng convention; khoảng tách thật SAME ≤93px / DIFF ≥120px sạch. **STOP #2: chờ user duyệt thiết kế trước F2.**
- 2026-10-06 — **USER APPROVED F1** + note "giải quyết chung, không fit cho 1 session". F2 dispatched cho builder-a (briefs/F2-a.md). b/c queued verify sau impl.
- 2026-10-06 — F2 DONE: F2-a-impl.md (deviations D1-D5 documented); F2-b-review PASS (flag-off bit-identical, scope sạch vs baseline-dirty.patch, rev2 offline 6/1/0); F2-c-verify PASS (20/20, suite 477/8).
- 2026-10-06 — F4 DONE: REPORT.md + LIVECAM-TEST.md. **STOP #3: chờ user test livecam / quyết bật cờ.**
