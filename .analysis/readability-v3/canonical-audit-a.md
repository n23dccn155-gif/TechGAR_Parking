# CANONICAL AUDIT — A own11 (10 route + ROI metadata) — FACT PRESERVATION + CLEANUP

> Scope: `algo-web-v2/js/content/{roi,motion,kalman,coasting,assignment,brightness,shadow,echo,track-lifecycle,occlusion,routing}.js`.
> Đã xóa top-level v1 prose fields: **problem, does, role, where, why, steps[], nodes** (script `_cleanup_fields.mjs`, cân-bằng ngoặc, parse-verify sau xóa).
> Giữ: id, title, tier, certainty, sourceRefs, realParams, limits, qa, v3 (+ manifest C).
> Surviving-consumers đã verify trong `js/core/ui.js`: `sourceRefs`→④ ref-list (:486), `realParams`→deepTable (:494), `limits`→tg-limits (:495), `v3.source.note`, `certainty`, `qa`. **`v3.deep` KHÔNG có consumer — mọi text migrated chỉ đặt ở field thực-sự-render.**
> QA sau cleanup: `_qa_r3_a` **272/272** · `_qa_r4_a` **408/408** · 0 console/page/request errors · lint **0 err 0 warn** (24 route).

## 1. Fact-migration table — unique verified facts chuyển trước xóa

| file | fact (v1-only) | → đích | ref verify |
|---|---|---|---|
| motion | fgmask `>200`, dilate `17×17`, morph `3×3/5×5×1`, aspect `0.25–5.0` | realParams +4 | mt:769-70 / mt:791 / tc:1844-50→mt:90-91 / mt:972-74 |
| assignment | invalid-cost sentinel `10.0` | realParams +1 | mt:1615 np.full + mt:1171 default |
| brightness | chi phí `~17ms full / ~0.3ms lưới`; signed-shift cả 2 chiều; "128 mỗi chiều ≠ 128 mẫu" | realParams +1 · limits | mt:463-469 (comment perf) |
| shadow | `>200` loại 127 khi flag OFF | realParams +1 | mt:769 |
| echo | `_same_motion_echo` 4 cổng: size ≥0.45 · Bhattacharyya ≤0.22 · dist ≤max(24,1.10×min) · gap ≤14 | realParams +3 | mt:1088-1111 (đọc trực tiếp) |
| echo | thứ tự thắng twin: confirmed→first-obs→obs-count→ID nhỏ | limits append | mt:1492-1499 tuple |
| track-lifecycle | "≈0.3s ở 10fps" (đối 0.1s@30fps) | limits append | count-based, đã có v1 why |
| occlusion | chuẩn-bị-cặp `≥3 clean-obs + overlap ≤0.20 + gap ≤0.4×diag`; vùng-con `≥20 điểm + 0.35–1.8×ref` | realParams +2 | og:71/85/88-89 · og:181/185 |
| routing | heuristic admissible theo cấu-trúc [suy luận] + tie-break 3 tầng | limits append | routeEngine.ts:60-70 |
| coasting | boundary: birth mint mã-cục-bộ MỚI, khôi-phục mã-chung thuộc tầng xuyên-camera | limits append | mt:2012 (đã ref) |
| kalman | — không cần: Q/R/P0/state/limits đã đủ ở R3 | — | — |
| roi | — không cần: params/refs R2 đã đầy (10 sourceRefs + 14 params) | — | — |

## 2. Drop-ok (không carry-forward)

| file | nội dung | lý do |
|---|---|---|
| kalman | `prediction_source='kalman_prediction'` tag | chỉ là tên cờ debug; semantics "vị-trí-hiển-thị = sau-correct" đã ở v3 |
| echo | `association_state` enum nhãn | label nội bộ HUD-audit; không phải fact giáo-dục mặc định |
| track-lifecycle | `total_visible_count`, `vehicle_tracker` symbol | tên biến — semantics đã cover |
| occlusion | `independent_pairs`, `ambiguous_merged` | tên cấu-trúc — semantics đã cover |
| assignment | `_apply_detection`, `_association_gate`, `clear_evidence` | symbol refs — đã có trong sourceRefs ở dạng cần thiết |
| motion | `roi_clipped`/`dark_foreground_rescued` cờ | semantics đã cover v3 + trang shadow/echo |
| roi | — (không drop gì ngoài field xóa) | — |

**Không carry claim sai:** ROI "10% hộp" vẫn ghi đúng là test *priority* (mt:614), không phải ROI-admission — semantics đã đúng trong limits từ R2.

## 3. Hash before → after (md5)

| file | before (pre-cleanup) | after (final) |
|---|---|---|
| roi.js | `35c41ab03eb4edf5dcaff61b115249e6` | `e5490866a2b194f9898ed8012740ff35` |
| motion.js | `566106510c699eb7a117c58bb43b2f9a` | `30a292a89a048e6119d4b6be18400a1a` |
| kalman.js | `4781f9fe1b8e772db700f99ea06630e8` | `d4114e3a52d0b5cac9dcd9d4e12c2e0a` |
| coasting.js | `a50e98f9a6303bff6aa6ebad5c48cfa0` | `136f8257a5d2facb4a602aa97467a8c9` |
| assignment.js | `fca8d36f0934d424c7f3b0451457d294` | `8cc10943471017e2f5940797f2b3a6c3` |
| brightness.js | `98446faf2b61e4b76899d40f56d7b69b` | `ed7fd0a003717ec44691741ee14ee19e` |
| shadow.js | `57867b2b23ff44099385a37e958adf21` | `91396575f00fe27019aae2967d75710e` |
| echo.js | `63cefc58fe7ab8428340d15912ec5bde` | `c55bee15dc535e5631ad3827a14ac7ae` |
| track-lifecycle.js | `4832db37f8d83c7607e2331da6c88d07` | `c2115d26687b319f4bf10116ff274850` |
| occlusion.js | `8f724f08a3d3a10ce45fa8fadef0c66b` | `546cc4be529b4d487215705d67ac5054` |
| routing.js | `a8d3dcf5d47f9f7ecbe9dbc2727b57a5` | `4c3205af480538d2aec5f721b5f50552` |

(before = sau fact-migration + ROI glossRef-fix, trước delete; full list trong `_hash_before_cleanup.txt`.)

## 4. Verify post-cleanup

- Parse: 11/11 `TG.registerContent` eval OK.
- Lint full-24: **0 error · 0 warn** · canvas-audit sạch.
- ROI mount-check: `tg-gt` tooltips **13** ("vùng quan sát"×5 → Vùng quan sát (ROI)) · ④ refs **10** · 0 errors — facts/tooltips nguyên.
- QA: `_qa_r3_a` **272/272 PASS** · `_qa_r4_a` **408/408 PASS** · 0 console/page/request errors.
- `pages/*.js` không consumer field đã xóa (đã grep c.does/problem/steps/nodes — chỉ legacy scaffold + manifest.nodes).
