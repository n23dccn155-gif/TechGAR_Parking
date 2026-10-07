# Peer review B → A (MEGAPLAN) — RE-REVIEW v2

**Reviewer**: Builder B (phụ trách N8–N11; ranh giới với A ở notify/suspend/recovery callsites).
**Đối tượng**: `D:\TechGar2\.analysis\algos-v2\builder-a.md` — **bản hiện tại: 397 dòng / 56,965 bytes / mtime 2025-10-04 18:25** (10 thẻ đầy đủ: T1-1..T1-5 + T2-1..T2-5). Không còn "5 thẻ, T2 pending" — A đã viết xong T2 và sửa T1.
**Phương pháp**: đọc lại toàn bộ dossier bản mới + trace trực tiếp `motion_tracker.py` (mt), `occlusion_guard.py` (og), `slot_vehicle_binder.py` (svb), `two_camera.py` (tc) — không dựa vào checklist cũ.

## Bảng PASS/FAIL — 10 thẻ

| Thẻ | Verdict | Ghi chú |
|---|---|---|
| T1-1 ROI+priority | **PASS** | F3 đã sửa đúng trong thẻ: dilation `1+2·radius/diag`, radius `0.05→0.85·diag` runtime → hệ số **1.10→2.70** (svb:2653-2668 + tc:1888-1897 → tc:2331); phân biệt rõ class 0.45 (svb:228). ⚠ `fix-summary-megaplan-a.md` F3 vẫn ghi "1.90, B sai" — meta-note lạc hậu, mâu thuẫn chính thẻ (xem mục tranh chấp). |
| T1-2 Motion | **PASS** | F-MOG2 sửa đúng: tạo `mt:203`, apply `mt:768-769`. `history=700`, AND-gate `mt:793`, support `17×17` — khớp source. |
| T1-3 Kalman | **PASS** | Giữ nguyên từ v1. |
| T1-4 Coasting/TTL | **PASS** | F2 sửa đúng: `_create_or_reid` = "luôn cấp local ID mới" (docstring mt:2012-2016), reacquire đặt đúng trong `_assign` mt:1631-1755; decay `measured+(kalman−measured)·exp(−age/0.25)` (mt:278) ✓; TTL `max(1.0,1.5)·3.0=4.5s` (mt:149-154) ✓; suspend-pop `mt:2175-2187` ✓. |
| T1-5 LAPJV+gating | **PASS** | F1 sửa đúng: ma trận cố định `[0.30,0.50; 0.25,0.85]` — greedy 1.15 vs optimal 0.75, cùng cảnh ✓; cost weights `0.45/0.25/0.20/0.10` (mt:1761-1766) + margin scope `split_margin_track_ids` (mt:1685-1686) + `adjusted=0.08·(2−lineage)` (mt:1921) + `clear_evidence` (mt:1939-1945) — tất cả khớp. |
| T2-1 Brightness | **PASS có minor** | Cơ chế median-shift + clip + THRESH_BINARY đúng (mt:451-484). **Issue N1 (minor)**: "`_BRIGHTNESS_SAMPLE_TARGET=128` mẫu thô / ~128 mẫu" sai ngữ nghĩa — 128 là **kích thước lưới mỗi chiều**, `step=max(1,min(h//128,w//128))` (mt:475-481) → ở 720p step=5 → ~144×256 ≈ **36,864 mẫu** (comment mt:463-469: "~128x128 samples"). Sửa: "lưới ~128 điểm/chiều". |
| T2-2 Cast-shadow | **PASS** | Trace đầy đủ mt:768-789: OFF → `raw>200` loại sỉ 127 (bóng đi + thân xe tối mất); ON+bg → `raw==127` admit → `_is_cast_shadow` per-contour (band 0.32-0.62, chroma ≤0.10, residual ≤0.08, explained ≥0.75, min_pixels 120, valid ≥60%, fail-open mt:647/715-716). **Kết luận về "mâu thuẫn" LEAD flag**: bản hiện tại KHÔNG còn mâu thuẫn — T2-2 k1 OFF ghi đúng "`>200` loại sỉ" (không phải "127 theo xe"); nhất quán với T1-2 :79 và source. Nếu LEAD xem bản cũ → đã sửa. |
| T2-3 Echo/twin | **PASS có minor** | `_suppress_duplicate_detections` (mt:1112-1134): gate = NOT different_clean_owners ∧ same_echo ∧ IoU≥0.25 ∧ hist≤0.12 ✓. **Issue N2 (minor)**: twin gate viết "tâm ≤12px" — thật `center_gap > max(12.0, 0.15·extent)` (mt:1557-1559) nên xe lớn được phép gap lớn hơn; và cần **cả hai** `roi_clipped` (mt:1524-1528), thẻ viết "track roi_clipped" nghèo. Winner-order đúng nhưng cite sai chỗ: twin dùng `_roi_edge_twin_strength` **mt:1492-1499** (confirmed→older-first_obs→more-obs→smaller-ID), không phải block mt:1408-1422 (đó là `_mark_competing_assignments`). |
| T2-4 Lifecycle | **PASS có minor** | `_is_confirmable` (mt:2071-2094) ✓ count+displacement+origin-switch multiscale; `suspend_track` pop `_tracks` (mt:2175-2187) ✓ expiry-suspended đúng. **Issue N3 (minor)**: "priority 2 obs" thiếu điều kiện thứ hai — priority track cần `total_visible_count≥2` **và** `priority_observation_count≥2` (obs *trong* vùng ưu tiên, mt:2081-2082). |
| T2-5 Occlusion | **PASS** | Đọc hết og.py 232 dòng — timeout 3.0s=merged_reacquire (mt:229, og:26), eligible ≥3 clean obs + fresh (og:67-71), overlap ≤0.20/min-area (og:85), gap ≤0.4×diag (og:88), cover pad 0.15 + area ≥1.6×median (og:109-112), watershed ≥40pts/seed ≤0.25×diag/sep ≥0.2/region ≥20px/ratio 0.35-1.8 (og:157-186), gate `swapped−direct≥2·margin, direct<1.2, ≥3f` (og:206-212), birth-veto (mt:364-389) — tất cả khớp. |

## Xác nhận fixes F1–F7 (v1 → v2)

| # | v1 finding | Trạng thái v2 |
|---|---|---|
| F1 | T1-5 toán `0.55+0.25=0.80≠0.60` + đổi ma trận | ✅ Fixed — ma trận mới đúng, cùng cảnh |
| F2 | T1-4 `_create_or_reid` mô tả sai (reacquire local) | ✅ Fixed — mint-ID-mới + reacquire trong `_assign` |
| F3 | T1-1 "luôn ×2" | ✅ Fixed trong thẻ (1.10→2.70 runtime) — ⚠ fix-summary F3 ghi ngược lại (xem tranh chấp) |
| F4 | decay "v*=exp" | ✅ Fixed — position-offset lerp `mt:278` |
| F5 | TTL tên param nhầm | ✅ Fixed — `ttl_reacquire_multiple=1.5` |
| F6 | thiếu cost weights | ✅ Fixed — `0.45/0.25/0.20/0.10` |
| F7 | margin phạm vi rộng | ✅ Fixed — `split_margin_track_ids` scope |
| (phụ) | MOG2 cite mt:768-769 | ✅ Fixed — tạo ở mt:203 |

## Issues mới (v2)

| # | Sev | Thẻ | Vấn đề | Fix đề xuất | Recheck |
|---|---|---|---|---|---|
| N1 | minor | T2-1 | "`128 mẫu`" → thật ~128/chiều (~36.9k điểm ở 720p) | đổi "mẫu thô"→"lưới downsample ~128/chiều" | grep `_BRIGHTNESS_SAMPLE_TARGET` |
| N2 | minor | T2-3 | twin-gap `≤12px` thiếu `0.15·extent`; cần BOTH `roi_clipped`; winner cite sai dòng | cite mt:1557-1559 + mt:1524-1528 + mt:1492-1499 | đọc lại 2 hàm |
| N3 | minor | T2-4 | "2 obs" thiếu `priority_observation_count≥2` | thêm "2 obs *trong vùng ưu tiên*" | mt:2081-2082 |
| N4 | info | T2-3 | `_same_motion_echo` ngưỡng (0.45/0.22/≤14px/max(24,1.10·mindim)) A tự ghi pending Phụ-lục B | A tự bổ sung | mt:1102-1110 |

## Tranh chấp cần C phân xử: `recovery_max_expand_ratio` runtime

**Kết luận B: runtime = 0.85, không phải 0.45.** Bằng chứng đọc trực tiếp:
- Class signature `svb:228`: `recovery_max_expand_ratio: float = 0.45` (default ctor).
- CLI `tc:1890-1897`: `--slot-recovery-max-expand-ratio` **default=0.85**, help: "0.85 giu duoc xe do choi di nhanh trong khi van can appearance/huong/3 mau".
- Callsite `tc:2331`: `SlotVehicleBinder(..., recovery_max_expand_ratio=args.slot_recovery_max_expand_ratio)` — runtime luôn truyền 0.85.
- Chuỗi tiêu dùng: `_token_radius` svb:603-609 (ratio→max) → `recovery_priority_regions` svb:2663-2668 (`scale_ratio=2·radius/diag`) → `_expanded_polygon` svb:2653-2656 (`1+ratio`) → dilation **1.10→2.70** theo tuổi token.
- A's card T1-1 (line 51) đã ghi đúng 0.85/2.70 — nhưng `fix-summary-megaplan-a.md` F3 viết "B nhầm 0.85, thật 0.45 → 1.90" — **fix-summary sai, chỉ đọc signature mà bỏ qua CLI default**. Bản thân thẻ A đúng.

## Params verified trực tiếp lần này (thêm v1's 21)

`_is_confirmable` origin-switch + priority-obs (mt:2071-2094) · `suspend_track` pop (mt:2175-2187) · `_BRIGHTNESS_SAMPLE_TARGET` semantics (mt:470-484) · shadow admission/metrics/gates (mt:633-726, 768-789) · `_same_motion_echo` + `_suppress_duplicate_detections` (mt:1088-1134) · `_suppress_roi_edge_twins` gates+union-find+winner (mt:1488-1595) · occlusion_guard toàn bộ (og:1-232) · `_unresolved_merged_birth` (mt:364-389) · `OcclusionGuard(merged_reacquire)` (mt:229) · class defaults mt:34-96 (priority 350/0.03/50/2/3.0 khớp).

## Trạng thái

**Overall: PASS tất cả 10 thẻ** (3 minor N1-N3 không chặn SPEC). Owner A đang sửa — recheck sau khi A ghi nhận N1-N3 + sửa fix-summary F3 (hoặc C phân xử 0.45/0.85 — evidence ở trên).
