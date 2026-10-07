# Peer review — Ensemble A (web build) — reviewer B

**Phạm vi**: `algo-web-v2/js/content/ensemble.js` + `js/pages/ensemble.js` (owner A — nhận từ C).
**Đối chiếu**: dossier `builder-c.md` T1-1 + source trực-tiếp `parking_detector.py` / `two_camera.py`. Không sửa file owner.
**Bản review**: ensemble.js @ W2 (seed `ensemble-v3`, 6 steps).

## Verdict: PASS — 9/9 điểm kiểm source đúng; 3 minor không chặn

## Params đã verify trực-tiếp trong source (≥3 — đủ 6)

| Claim của page | Source thật | Kết |
|---|---|---|
| `required_votes = 25//2 = 12`, "không phải đa-số" | `required_votes = total_combinations // 2` pd:533; `total_combinations = 5×5 = 25` pd:455-456 → 12/25 = 48% | ✅ |
| Vote: `ratio<0.12→empty`, `ratio<0.08→exit`, exit⊆empty | `ratio < ratio_thr → empty_votes` pd:527; `ratio < min(ratio_thr, exit_ratio_thr) → exit_votes` pd:529-530; enter 0.12 (tc:1786) > exit 0.08 (tc:1787) | ✅ |
| Rescue: `is_free && _has_core_rescue → occupied`; lõi 0.80·ROI | pd:542-547 gate đúng; `_has_core_rescue` pd:418-428; `core_scale=0.80` tc:2270 (sig 0.55 pd:110) | ✅ |
| Dwell: vào count≥2&0.5s / ra count≥3&1.0s + exit≥12&!rescue; gap>1.5s reset | pd:627 `desired = not(exit≥required && !rescue)`; pd:636-639 `count=2 if desired else 3`, duration occupied/empty_seconds; pd:624 gap reset | ✅ |
| Smoother BYPASS + edge OFF | `detect(apply_smoothing=not detector.stable_evidence)` tc:1597 + `stable_evidence=True` tc:2271 → False; `use_edge_recheck=False` tc:2267 | ✅ |
| Chưa-initialized → occupied placeholder | `result.occupied = True if not initialized` pd:641-643 | ✅ |

## Sample-outcome math (3 kịch bản)

- `white`: EMPTY_IDX 4 ô → `4<12 → instant_occupied` ✓; OFF `ratio 0.09<0.12 → trống(sai)` nhất-quán 1-ngưỡng.
- `core`: 13 ô chẵn → `13≥12 → free(raw) → rescue → occupied` ✓; chips `0.22≥0.18 / 0.09≥0.08` thỏa đường `central_blob`.
- `leaving`: 20 empty ⊃ 12 exit (0-11 ⊆ 0-19 — đúng quan-hệ tập-con) → release cần `exit≥12∧!rescue∧count≥3∧1.0s` ✓; HUD/badge khớp.
- Vote-grid deterministic theo EMPTY_IDX, không random — đúng seed `ensemble-v3`.

## Findings — RE-CHECK trên bản mới (content 7,972B / pages 13,957B, mtime 21:16): **N1-N3 ĐÃ ĐÓNG**

- **N1 — rescue 2 đường OR: FIXED ✅.** content:18 + sourceRef :418 ghi đúng `central_blob core≥0.18∧comp≥0.08 | textured_dense raw≥0.30∧core≥0.02∧count≥2 (pd:418-428, callsite :542-547)`; page pcode note "2 đường OR :418-428", EXPL[3] nêu rõ minh-họa `central_blob` + đường thay-thế `textured_dense`; scene label "rescue (central_blob)" chỉ rõ đường được vẽ.
- **N2 — `stable_evidence` kéo cả dwell-branch: FIXED ✅.** content limits (:51) ghi "Cùng flag `--legacy-parking-filter` (stable_evidence=False) cũng bỏ qua hoàn toàn dwell FSM — accept_evidence pass-through raw occupied (pd:613-615)" — khớp source.
- **N3 — `exit_ratio_thr` ref: FIXED ✅.** realParams :44 cite `two_camera.py:2273` symbol "ctor kwargs — không điều-kiện" — đúng ctor, khớp dossier C.

**Verdict sau re-check: PASS 10/10 — không còn findings mở.**

## Contract/UI check

- `fourBlocks` đúng 1 lần (line 24) · `player.create` + onStep(0) qua rAF (CONTRACT :62, không sync) · `pc.forStep` · `d.onResize` · destroy đầy-đủ · certainty `cao [code]` — đúng pattern.
- Scenario selector (3 kịch bản) là điểm-cộng cho OFF/ON cùng-cảnh.
