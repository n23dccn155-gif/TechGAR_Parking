# BRIEF F2-a — builder-a: Implement `stationary_reacquire` (được sửa code)

Đọc trước: `F1-design.md` (rev2 — **spec của bạn, implement đúng nó**), `SPEC.md` §5/§7, `MEGAPLAN.md` F2/§3, `F1-b-backtest.md` §3 (caveats → fields cần log), `F1-c-tests.md` (test contract — `enable_stationary_reacquire` ctor param name đã giả định).

**User note (mới):** giải quyết vấn đề CHUNG, không fit tham số cho 1 session cụ thể — implement mechanism đúng design; ngưỡng là ctor params có default từ design, conservative + có log để calibrate; không hard-code case nào.

## Bước 0 — BẮT BUỘC trước khi sửa
```bash
cd D:\TechGar2
git diff > .analysis\gid-reacquire\baseline-dirty.patch
git status --short
git log --oneline -3
```
Ghi hash/mtime của file sẽ sửa vào `progress-builder-a.md`. Có 5 file tracked đã modified sẵn (SPEC §7) — **tuyệt đối không revert**, chỉ append chỉnh sửa lên trên.

## Implement (theo F1-design.md rev2)
1. `backend/main_detect/src/techgar/cross_camera_manager.py`:
   - ctor param `enable_stationary_reacquire: bool = False` → `self.enable_stationary_reacquire` (đặt cạnh các flag `enable_*`/param bool hiện có ~L140–250, đúng convention).
   - Params ngưỡng mới theo design §4 (D_STAT_CORE=3.0, D_STAT=5.0, A_STAT sim≥0.70, S_STAT=0.90, IOU_STAT=0.15, TAIL_STAT=4.0, V_STAT=1.5, MARGIN_D=1.5, MARGIN_A=0.08, MEMBER_DRIFT_STAT=2.0) — ctor kwargs có default, tên snake_case rõ ràng (vd `stationary_reacquire_distance`... — theo convention param hiện có; ghi mapping trong report).
   - `_match_stationary_reacquire(...)` pass mới + call site giữa `_match_unique_unbound_cross_camera_tracks` (ccm:7235–7239) và mint loop (ccm:7244) — guard `if self.enable_stationary_reacquire else set()`; membership-check trong mint-loop guard.
   - Gates G1–G7 + guards §3 (same_camera_live_owner veto, live_member_divergence/window-drift reject-có-log, margin→defer persistent qua `_stationary_deferred_since` + cleanup, occupied_spot_conflict defer, fragment-stationarity candidacy).
   - Hook defect-2 §1b: dormant ambiguous → `_stationary_deferred_since` persistent (chỉ khi cờ bật).
   - `_stationary_event_last` dedup ≤1/8f/(gid,cam,lid,reason); events `stationary_reacquire_{accepted,rejected,deferred}` qua `self._event` với đủ fields §6 **gồm `identity_last_world` (emit kể cả null) và `member_drift_window`** (rev2 bắt buộc).
   - KHÔNG sửa logic/threshold hiện có; mọi code mới bọc trong cờ.
2. `backend/main_detect/two_camera.py`: `--enable-stationary-reacquire` (store_true) trong `make_parser()` args block; truyền `enable_stationary_reacquire=args.enable_stationary_reacquire` tại ctor call site (~L2227–2260). Không cần sửa runtime_server.py (parser lan tự động qua `run_two_camera_session.make_parser` — đã verify trong design §7); nếu verify lại thấy không lan thì thêm wiring tối thiểu và note lại.
3. Nếu `run_two_camera_session.py`/`runtime_server.py` cần tham số riêng để lan cờ → chỉ thêm tham số, không logic.

## Tự verify trước khi báo xong
- `D:\TechGar2\backend\main_detect\.venv\Scripts\python.exe -m pytest tests\test_stationary_reacquire.py -v` từ `backend/main_detect`: kỳ vọng các skipif test chuyển PASS/FAIL rõ; **flag-off test phải PASS** (assert không leak event + mint giữ nguyên).
- Chạy thêm vài test gid lân cận (`test_gid_dormant_*`, `test_gid_reserved_competition`, `test_gid_parked_stale`) xác nhận không regression khi cờ tắt.
- Full suite builder-c sẽ chạy — bạn chỉ cần xanh cục bộ.

## Nộp
`F2-a-impl.md`: file:dòng đã sửa, mapping param-name → ngưỡng, điểm emit event, kết quả pytest cục bộ, mọi lệch design (phải giải thích lý do — silent deviation = defect).
`progress-builder-a.md` cập nhật. Trả lời "DONE F2-a" + số test pass/fail.

## Ràng buộc
- CHỈ file trong MEGAPLAN §3. KHÔNG commit/push. KHÔNG revert 5 file modified. KHÔNG đổi ROI/calibration/slots/motion_tracker/occlusion_guard/threshold cũ.
- Checkpoint trước context >60%.
