# F2-b Review — stationary_reacquire implementation (F3-static role)

Reviewer: builder-b · 2026-10-06 · Inputs: `F1-design.md` rev2, `F2-a-impl.md`, `git diff` (ccm +1073/−4, two_camera +8), `baseline-dirty.patch`, `F0-b-cases.json`, `_backtest_pool_b.json`, `_near5scan_b.json`.

## 1. REVIEW DIFF — flag-off equivalence (a)

**PASS.** Mọi code mới đều flag-gated:

- `_match_stationary_reacquire` early-return `set()` khi cờ tắt (`if not self.enable_stationary_reacquire: return set()`) + call site (ccm:~8276) bọc `if self.enable_stationary_reacquire else set()` — double-gated. Guard trong mint loop chỉ thêm `in stationary_deferred` trên set luôn-rỗng → no-op.
- 3 hook trong `_match_dormant_identities` (hold-filter `L5848`, competing-claims `L6492`, drift-veto `L6615`) đều nằm trong `if self.enable_stationary_reacquire:` — flag-off không đổi control flow.
- Diff F2 chỉ có **2 dòng xoá** ngoài baseline: `return set()` → `return deferred_keys` + move declaration `deferred_keys` lên trước filter. Khi cờ tắt `deferred_keys` rỗng tại điểm return sớm → tương-đương `return set()` cũ. Bit-identical ✓.
- `_stationary_event`/3 dict `_stationary_deferred_*` chỉ init, không chạy khi cờ tắt → 0 event `stationary_*`, 0 effect trên `_events` ring.
- `two_camera.py`: đúng 8 dòng plumbing — `--enable-stationary-reacquire` (store_true, default False) + `enable_stationary_reacquire=getattr(args,...,False)` vào ctor. Namespace thiếu cờ → default an-toàn.
- **Verify**: `pytest tests/test_stationary_reacquire.py` → **20/20 PASS** (chạy lại thực tế), gồm flag-off equivalence test.

## 2. REVIEW DIFF — scope (b)

**PASS.** `git status` modified-tracked = đúng 6 file: ccm + two_camera (scope F2) + 4 file pre-existing. So `baseline-dirty.patch` (line-level signature):

| file | baseline | hiện-tại | missing | extra |
|---|---|---|---|---|
| slot_vehicle_binder.py | +67/−9 | +67/−9 | 0 | 0 |
| trajectory_memory.py | +17/−0 | +17/−0 | 0 | 0 |
| test_gid_departure_token.py | +37/−0 | +37/−0 | 0 | 0 |
| test_gid_reserved_competition.py | +37/−0 | +37/−0 | 0 | 0 |
| ccm (phần baseline) | +10/−1 | còn nguyên | 0 | 0 |

→ 5 file pre-existing **không bị đụng**; ccm giữ nguyên toàn-bộ hunk cũ (provisional_origin). Không chạm ROI mask, calibration `two_camera.shared_cm_01.json`, parking_slots, motion_tracker, occlusion_guard — **đúng scope MEGAPLAN §3**. `runtime_server.py`/`run_two_camera_session.py` không sửa — cờ lan qua `make_parser()` wrap như thiết kế.

## 3. REVIEW DIFF — deviations D1–D5 (c)

Tất cả đúng report, không deviation ngầm:

- **D1** `required_support = min(A_SUPPORT, len(target_gallery))` (ccm:~4945, có comment lý-do dedupe gallery) — hợp lý; `support` vẫn log để calibrate.
- **D2** `awaiting_evidence`: fragment immature chỉ defer khi ≥1 identity qua coarse screen (d≤2·D_STAT hoặc app≤0.5), release khi mature/claims<1 — đúng mô-tả.
- **D3** drift-veto tại dormant-accept (ccm:~6615): áp cả ngoài pass mới; **miễn khi fragment chính nó moving** (`frag_span > TAIL_STAT`) — đúng lập-luận "real handoff".
- **D4** `MEMBER_DRIFT_STAT=2.0` ctor param `stationary_reacquire_member_drift`, window ±`member_window`=10f — đo trên `trajectory.global_samples` của member (window-local, KHÔNG EMA) — đúng rev2 §5.3.
- **D5** `identity_anchor_missing` emitted khi `identity.last_world is None`, `identity_last_world` emit kể cả null — đúng rev2 §6 bắt-buộc.

Gate chain khớp impl report §3: candidacy→G1→gallery-rule→coarse screen→divergence→window-drift→anchor/distance→extended-IoU (IoU≥0.15, ≥0.075 khi `new_area ≤ ref_area` chiều-partial)→appearance (≤0.30 + support)→size (≤0.90)→stationary-history (OR velocity≤1.5/tail≤4.0/parked)→fragment-moving veto→margin (Δd≥1.5 ∧ Δapp≥0.08 → persistent defer)→occupied-spot conflict→`_bind`+accepted. Threshold defaults = F1 rev2 §4.

## 4. Re-run điều kiện rev2 OFFLINE trên F0-b-cases.json/pool

rev2 thêm 2 thứ so với backtest cũ: **window-drift veto** (đo trên obs member ±10f — tính được từ predictions) và **gallery-missing=reject** trên live/cross-cam. Kết quả:

| case | backtest cũ | **rev2 outcome** | cơ chế |
|---|---|---|---|
| sang8 f600 | SAVED | **SAVED** ✓ | gid1 unique (gid2 ew13.56 out) |
| thai3 f1774 | DEFER | **SAVED** ↑ | gid2 member drift **12.84wu > 2.0** (L50 đang lái!) → `live_member_moving` → gid3 unique → accept |
| thai4 f4633 | SAVED | **SAVED** ✓ | gid7 unique; gid5 G1 veto (member L117 drift 4.88 cũng sẽ veto) |
| thai6 f1128 | SAVED | **SAVED** ✓ | gid2 unique 2.14 |
| thai6 f1205 | SAVED* | **SAVED** *caveat anchor* | gid1 unique (pxΔ7); gid3 G1 veto |
| thai6 f4936 | SAVED* | **SAVED** *caveat anchor* | gid6 partial→IoU-corroboration; gid5 anchor ~8wu → không occupied-conflict |
| thai6 f5367 | DEFER | **DEFER** | gid14/13/18 margin — cùng-xe → Δapp<0.08 kỳ-vọng |
| thai6 f1713 | reject ✓ | reject ✓ | d=18.33 |
| thai7 f2112 | reject ✓ | reject ✓ | d=26.60 |
| thai8 f1945 | reject ✓ | reject ✓ | d=6.07 > 5.0 |

**Occupied-spot conflict** (gate mới): winner anchors vs identities còn lại đều ≥~5.8wu (ước lượng tam-giác khi last_world thiếu) → không conflict nào cho 6 case saved.

**Live-member pool** (rủi-ro đã flag):
- thai3_f1528: member drift 3.18 > 2.0 → `live_member_moving` **+** gallery-missing reject → **double-veto, risk ĐÓNG** (không còn phụ thuộc một gate).
- thai3_f2346: drift 19.75 → veto; thai6_f1359 + thai1_f1038: `fragment_moving`; test1 f131: G1 same-cam. → 0 false-merge còn lại.

### Kết quả rev2 (tập 10 phân-loại)

- **SAME_CAR được cứu: 6** — sang8 (bắt buộc) + thai3_f1774 (nâng từ DEFER) + thai4 + thai6_f1128 + thai6_f1205* + thai6_f4936* (*caveat `anchor_world` null → verify qua `identity_last_world` khi flag-on).
- **DEFER: 1** — thai6_f5367 (margin, đúng-cơ-chế).
- **DIFFERENT_CAR gán nhầm: 0** — yêu cầu đạt.
- Ngoài tập: +4 dead-gid rescues (thai4 f4045/f4418/f5715, thai6 f5143) + 1 defer (thai6 f5912), dormant_reid≤5wu=0 — không đổi.

## 5. Issues / notes cho lead

1. **`identity_anchor_missing` có thể quyết-định 2 case saved** (thai6_f1205, f4936 + thai3_f1774 anchor-null): nếu `last_world` internal cũng null → `identity_anchor_missing` → mint (mất cứu, không hại). `identity_last_world` giờ được log → verify được flag-on. **Không phải defect.**
2. **D3 exempt-fragment-moving hợp lý** nhưng để ý: nếu fragment "đỗ yên" (span≤4.0) mà member live drift>2.0 → defer; xe thật-sự cùng-identity đang creep chậm (>2wu/20f) sẽ defer 1 frame — chấp nhận được, persistent-defer cap 60f tránh starvation.
3. **Occupied-spot conflict** chỉ kiểm `last_world` giữa các identity — xe đỗ chưa-track (không có identity) không gây conflict: đúng như design công-nhận (spot-emptied = UNSURE coverage, F2 không bắt buộc).
4. `MEMBER_DRIFT_STAT=2.0` chứng-cứ backtest: pass được cả 3 live-member nguy-hiểm (3.18/12.84/19.75) và member gid5-thai4 (4.88); cần calibrate livecam theo `member_drift_window` field trong event.
5. Flag-off equivalence khẳng-định bằng diff + test; không chạy replay (plan huỷ). **Recommend: APPROVE với điều-kiện calibrate flag-on `identity_last_world`/`member_drift_window` cho 3 case anchor-null.**

## 6. Verdict

**REVIEW PASS** — flag-off bit-identical verified, scope sạch, D1–D5 đúng + có lý-do, rev2 gates tái-tạo offline: **6 SAVED / 1 DEFER / 0 FALSE-ACCEPT** trên tập 10; live-member risk đã được double-veto đóng.
