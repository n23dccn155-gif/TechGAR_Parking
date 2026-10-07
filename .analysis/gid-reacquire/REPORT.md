# REPORT — Fix: stationary re-acquisition (xe đỗ yên bị cấp GID mới)

Ngày: 2026-10-06 · Lead: Devin (w1:p6) · Builders: a (w1:p7), b (w1:p8), c (w1:p9).
Đầy đủ: `F0-SUMMARY.md`, `F0-a-codepath.md`, `F0-b-cases.{md,json}`, `F0-c-tests.md`, `F1-design.md` (rev2), `F1-b-{distributions,backtest}.md`, `F1-c-{prep,tests}.md`, `F2-a-impl.md`, `F2-b-review.md`, `F2-c-verify.md`, `LIVECAM-TEST.md`.

## 1. Nguyên nhân gốc — đã chứng minh (bằng file:dòng + số học)

Xe đỗ yên mất track → fragment mới cùng chỗ bị cấp gid mới qua **hai vòng reject chồng nhau, không nhánh nào cứu**:

1. `_match_dormant_identities` veto `same_camera_stale` khi elapsed > `identity_retention_moving_seconds` (12s) — **trước khi** position/appearance được đánh giá (ccm:4968–4990 → 4659–4689).
2. `_match_world_trajectory_identities` reject `trajectory_score` < 0.78 (ccm:6022–6024): `time_topology=0` (gap 50s >> window ~6.9s — tất yếu cho xe đỗ-tái-hiện) + `direction≈0` (cosine nhiễu của 2 vận tốc ≈0). Escape `plausible_recent_fragment` đòi `time_topology≥0.75` → bất khả thi.
3. New-ID loop mint gid mới (ccm:7439–7457 cũ → ~L8295 mới).

**H1/H3 confirmed; H2 partially refuted** (world pass reject thật, nhưng gid1 dormant chứ không "live cam1" như SPEC §1 viết — đã verify lại trong predictions.jsonl).

Phát hiện phụ: (a) ambiguous dormant tie defer 1 frame rồi steal; (b) nhánh live-owner mint gid **không log** gì.

## 2. Thay đổi (flag `enable_stationary_reacquire`, mặc định TẮT)

| File | Thay đổi |
|---|---|
| `cross_camera_manager.py` | +1073/−4: pass mới `_match_stationary_reacquire` (L4563) gọi tại L8283 trước mint loop; ctor params `stationary_reacquire_*` (L195–210); state `_stationary_deferred_*` (L407–409); dormant hooks: hold-filter L5848, ambiguous→persistent-claims L6492–6514, drift-veto tại dormant-accept L6615–6691; `_stationary_event` dedup L4390 |
| `two_camera.py` | +8: `--enable-stationary-reacquire` (L1953) + ctor kwarg (L2266). Tự lan sang `runtime_server.py` CLI qua `make_parser()` wrap |
| `tests/test_stationary_reacquire.py` | MỚI: 20 tests |

Mọi code mới flag-gated; cờ TẮT ⇒ `set()` rỗng, 0 event `stationary_*`, hành vi **bit-identical** (verify bằng diff + test). 5 file modified-sẵn không bị đụng (đã đối chiếu `baseline-dirty.patch`).

**Gates accept** (tất cả phải qua): no same-cam live owner → gallery cam-đích → divergence → member window-drift ≤2.0wu/±10f → Euclid ≤D_STAT (3.0 core; 3.0–5.0 cần IoU≥0.15/bbox-partial) → appearance ≤0.30 → size ≤0.90 → identity-đỗ-yên (velocity/tail/parked) → fragment-stationarity → margin (Δd≥1.5∧Δapp≥0.08) → occupied-spot. Fail → reject-có-log; ambiguous → **defer persistent** ≤60f.

## 3. Số liệu before/after (offline trên 18 session replay logs)

| Metric | Before | After (thiết kế backtest trên log cũ) |
|---|---|---|
| SAME_CAR bị cấp gid mới | 7/10 candidate (+5 near-miss ngoài tập) | **6/7 cứu** + 4/5 rescue ngoài tập; 1 defer an-toàn |
| DIFFERENT_CAR gán nhầm | 0 (reject đúng) | **0** — yêu cầu đạt |
| Chuỗi phân-mảnh phát hiện thêm | thai6 top-right gid14→18→19→22; thai4 gid8→10→11→13 | cứu được khi flag-on |
| Test suite | 457 PASS / 8 XFAIL | **477 PASS / 8 XFAIL** (+20 test mới), 0 regression |
| flag-off events | — | 0 `stationary_*` leak (bit-identical) |

## 4. Rủi ro còn lại (thừa nhận, đã có guard/log)

- `MEMBER_DRIFT_STAT=2.0` suy ra từ 1 hard case (f1528, drift 3.18) — **calibrate qua `member_drift_window`** field trên livecam.
- `identity.last_world` null ở 3 case (anchor không ghi log cũ) → `identity_anchor_missing` reject an-toàn; `identity_last_world` giờ được log.
- "Spot trống giữa gap" không chứng minh được bằng motion-tracker → deferred-fallback là đệm an toàn.
- UNSURE band 4.4–5.0wu chỉ chứng kiến SAME-partial — nếu flag-on thấy DIFF thật ở đó, hạ `stationary_reacquire_distance`.

## 5. Đề xuất bật cờ mặc định?

**KHÔNG bật mặc định.** Lý do: (1) chưa verify trên livecam (F3 replay đã huỷ); (2) 3 ngưỡng UNSURE cần calibrate (`member_drift`, `tail_span`, `velocity`); (3) backtest offline là lower-bound — chỉ chứng minh trên dữ liệu cũ. Đề xuất: bật tay qua `--enable-stationary-reacquire`, test theo `LIVECAM-TEST.md`, thu event log → calibrate → quyết bật-mặc-định sau.

## 6. Trạng thái repo

- Không commit/push. 5 file pre-modified nguyên vẹn (`baseline-dirty.patch` backup).
- Working tree: +2 file sửa in-scope, +1 test file mới, + `.analysis/gid-reacquire/` artifacts.
- **DỪNG tại đây — chờ user quyết định.**
