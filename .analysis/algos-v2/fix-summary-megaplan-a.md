# fix-summary-megaplan-a.md — Sửa builder-a.md theo LEAD + peer-B (Phase 1)

File: `.analysis/algos-v2/builder-a.md` · 10/10 thẻ · Ngày: sau review B `peer-a-by-b-megaplan.md`.

## A. Theo LEAD (lượt 1 — trước khi có review B)

| # | Vấn đề | Sửa |
|---|---|---|
| L1 | T1-5 k3 sai toán (0.60 vs 0.80) + đổi ma trận giữa chừng | Ma trận cố định `T1:[0.30,0.50], T2:[0.25,0.85]`; OFF greedy theo thứ tự = 1.15, ON LAPJV = 0.75 — cùng input, chỉ đổi solver |
| L2 | ROI "giãn ×2" | → công thức thật `1 + 2·radius/diag` (lúc đầu ghi `2·radius/diag`; sau peer-B chuẩn thành `1+…`) |
| L3 | TTL công thức nhầm tên | `max(1.0, lost_track_ttl_reacquire_multiple=1.5) · merged_reacquire_max_seconds=3.0 = 4.5s` |
| L4 | rationale/alternative chưa nhãn | gắn `[suy luận]`/`[strong inference]` chỗ chưa có nguồn |
| L5 | T2-2 storyboard OFF mâu thuẫn với T1-2 (127 exclusion) | **rewrite toàn bộ T2-2** sau khi trace đủ `_detect` `mt:768-789`, `_cast_shadow_metrics` `mt:633-703`, `_is_cast_shadow` `mt:705-726`, reject-branch `mt:1046-1063`: OFF = loại sỉ 127 (mất thân xe tối), ON = admit+rọi contour → cứu `dark_foreground_rescued` |
| L6 | FPS-đảo ở T2-4 QA | `3 obs ~0.1s` xảy ra ở **FPS cao**, không phải FPS thấp — đã đảo + ghi cơ chế count-theo-frame |
| L7 | Pending `_is_confirmable`/suspended | đã trace: `_is_confirmable` `mt:2071-2094` (count+displacement, origin=first_observation_point khi multiscale); `suspend_track` `mt:2175-2187` **pop khỏi `_tracks`** → `_suspended_tracks`, thoát vòng TTL |

## B. Theo peer-B (`peer-a-by-b-megaplan.md` F1–F8)

| F | Vấn đề | Sửa |
|---|---|---|
| F1 | k3 toán/ma trận | trùng L1 — đã sửa trước; giữ ma trận của A (1.15 vs 0.75 cũng chứng minh đúng, cùng input) |
| F2 | **reacquire gán nhầm `_create_or_reid`** | ĐÚNG — lỗi semantic lớn. `_create_or_reid` `mt:2009-2069` luôn mint ID mới (`:2012-2016` "fresh monotonically increasing ID… Global identity recovery belongs to CrossCameraManager"). Reacquire thật ở `_assign`: window `1.5s/3.0s` `:1631-1651`, stale-anchor gate `min(max_distance, max(3.0, 0.30·diag))` `:1696-1702`, appearance `≤0.30`/stale `≤0.22` `:1732-1736`, area `0.35-2.8` `:1750-1755`. Đã sửa T1-4 (làm gì/vai trò/steps/storyboard k4) + T2-4 (steps/storyboard/params) — bỏ hoàn toàn cụm "hồi sinh ID cũ" |
| F3 | `×2` không phải hằng | công thức đúng `1 + 2·radius/diag` `svb:2653-2668`; `radius=diag·ratio`, `ratio` nở **0.05→0.85** `svb:603-609` → hệ số **1.10→2.70**. **Sửa lần 2 sau đối chiếu LEAD**: A ban đầu lấy class signature `svb:228` (0.45) — sai production; CLI default `--slot-recovery-max-expand-ratio=0.85` `tc:1889-1897` truyền `tc:2330-2331` → **B đúng 2.70×**, range production 1.10→2.70× |
| F4 | MOG2 ref `mt:768-769` | → `mt:203` (constructor); `:768-769` là apply+threshold |
| F5 | decay `v*=exp` sai cơ chế | → `point = measured + (kalman−measured)·exp(−age/0.25)` `:278`; confidence tuyến tính `1−age/limit` `:280-287`; merged_freeze **không decay** `:270-276`, limit `max(0.40,3.0)` `:307-317`. Sửa Làm-gì + step 2-3 + storyboard k1-k2 |
| F6 | TTL tên tham số | trùng L3 — giữ `ttl_reacquire_multiple·merged_window` |
| F7 | margin phạm vi rộng | → chỉ `split_margin_track_ids` (invisible>0 ∨ recent merged freeze) `:1685-1686`; `adjusted_margin = 0.08·(2−lineage_score)` `:1921`; `clear_evidence` `0.12/0.08/0.20/0.20` `:1939-1945`; thêm cost weights `0.45/0.25/0.20/0.10` `:1761-1766` vào params |
| F8 | info | thêm: temporal window `0.45–2.25×target` `mt:500`; `_box_is_priority` anchor-OR-10% `mt:614-631`; floor `min(650,350)` `mt:845`; aspect-ratio `0.25–5.0` `mt:973-975`; `history_len=90` hardcode `tc:2372` (không phải arg) — sửa §0 label; max_distance scale `×min(1.25, 1+inv/60)` `mt:1691-1694` |

## Vòng sau khi B PASS 10/10 (N1–N3 + §A wakeup — source fidelity nhỏ)

| # | Vấn đề | Sửa |
|---|---|---|
| N1 | `_BRIGHTNESS_SAMPLE_TARGET=128` bị đọc là "128 mẫu" | Đúng: **lưới ~128 điểm mỗi chiều** — `step=max(1,min(H//128,W//128))` → `frame[::step,::step]`; 1280×720 → step 5 → lưới 256×144 `mt:470-484` (comment ~17ms full-frame `mt:463-469`) |
| N2 | twin gate chỉ ghi "tâm ≤12px" | Đúng: `center_gap ≤ max(12.0, 0.15·extent)`, `extent=min(hypot w,h hai bbox)` + **BOTH** `roi_clipped` `mt:1523-1560`; winner ref sửa `mt:1408-1422` → `_roi_edge_twin_strength` `mt:1491-1499` |
| N3 | "confirmed sau 2 obs" thiếu điều kiện vùng | Đúng: ≥2 obs **trong vùng ưu tiên** — `priority_observation_count` chỉ tăng khi `detection.priority=True` `mt:2167-2169`; `_is_confirmable` `mt:2081` |
| §A | wakeup polygon vs gate | Thêm phân biệt: polygon giãn `1+2r/d` chỉ là **wakeup mask** `svb:2653-2668`; gate thật = signed distance `< −initial_radius` `svb:506-510`, cap `≤diag·ratio` `svb:2875-2876` (theo arbitration `peer-b-by-c-megaplan.md` §A) |

## C. Còn lại

- T2-3 đã thêm mục "Trạng thái nhìn thấy (audit/HUD)": `association_state` ∈ {`suppressed_roi_edge_twin`, `frozen_ambiguous`, `coasting`} + `observation_kind` `mt:2268-2280` — LEAD xác nhận có thể hiện lên UI, không cần hỏi thêm.
- Story T1-5 k4/k5 vẫn cùng ma trận/cùng cảnh — OK.
- Peer-review C đã nộp `peer-c-by-a-megaplan.md` (recheck v2: PASS 7/7 + pipeline-order, 0 issue mở).
