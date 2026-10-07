# Note: parking-detector (Step A)

Trang: `parking-detector.js` — cơ chế nhận-diện ô đỗ trống/đầy bằng thị-giác (KHÔNG phải tracker).

## Nguồn chính

- `backend/main_detect/src/techgar/parking_detector.py` (749 dòng)
- `backend/main_detect/two_camera.py` — wiring runtime, async worker, thresholds CLI.

## Luồng & vị-trí pipeline

`detect(frame)` → `accept_evidence(results, timestamp_s, frame_idx)` → `binder.update_vision`.
- Live: `ThreadPoolExecutor(max_workers=2)` async, mỗi cam một future (two_camera.py ~2287-2290, 2563+).
- Replay sync: detect ngay trong vòng lặp, nhịp `1/parking_fps` (2523-2562).
- `accept_evidence` từ-chối kết-quả không-monotonic (`timestamp <= _accepted_timestamp`) — bằng-chứng trễ/duplicate của worker không đổi state (609-611).
- Result-age guard: `result_age_s > parking_max_result_age_seconds (1.0s)` → drop `result_too_old` (2595-2602).

## Thuật-toán detect() (439-600)

1. Convert BGR→LAB, lấy kênh L (458-459).
2. Ensemble **25 biến-thể** = 5 `delta_clahe` ∈ {-0.5,-0.2,0,0.2,0.5} × 5 `delta_gamma` ∈ {-0.2,-0.1,0,0.1,0.2} quanh `base_clahe=2.0`, `base_gamma=2.8`, grid CLAHE 8×8 (454-456, 498-506).
3. Mỗi biến-thể: CLAHE → gamma LUT (cache) → GaussianBlur 3×3 → `adaptiveThreshold` (GAUSSIAN_C, BINARY_INV, block 25, C=16) → medianBlur 5 → dilate 3×3 (508-513).
4. Mỗi ô: cắt ROI → `_filter_roi_threshold` loại vạch/biên → `ratio = countNonZero(filtered)/analysis_area`; `ratio < ratio_thr` → +1 `empty_vote`; `ratio < min(ratio_thr, exit_ratio_thr)` → +1 `exit_vote` (515-530).
5. **Pass 1**: `empty_votes >= required_votes (=25//2=12)` → free; `core_rescue` lật ngược → occupied (532-549).
6. **Pass 2**: Edge Recheck Canny ≥ edge_thr 0.25 → occupied; **TẮT runtime** (`use_edge_recheck=False`, two_camera.py 2275).
7. `TemporalSmoother` (5 frame) chỉ dùng khi `stable_evidence=False` (legacy); runtime `stable_evidence=True` → smoothing tắt, dwell-based thay-thế (575-576, 597).

## ROI geometry (228-319)

- `local_mask`: polygon fill → `analysis_mask` = erode bởi `border_ignore_ratio=0.12` × min-dim (bỏ vạch kẻ viền ô); fallback local nếu <5px (263-274).
- `core_mask`: polygon scale `core_scale` (**0.80 runtime**, default class 0.55) quanh centroid, ∩ analysis_mask (288-297).
- `analysis_boundary`: viền 1-lớp của analysis_mask (276-279) — phục-vụ line filter.

## Selective line filter (321-416)

- `connectedComponents` trên vùng analysis; mỗi component: `span_ratio` ≥ 0.45 **và** `thickness_ratio` ≤ 0.18 **và** chạm boundary **và** không `vehicle_like_core` → `is_border_line` (343-367).
- `vehicle_like_core`: core đáng-kể (`component_core_ratio ≥ core_component_threshold=0.08`) + đủ dày (≥0.9×0.18) → bảo-vệ xe dù dính vạch (357-361).
- Selective mode (runtime ON): fitLine Huber + residual ≤ half_width + distanceTransform protection → chỉ xoá phần mảnh của vạch, giữ pixel xe (368-387). `removed_ratio` đo phần bị xoá.

## Core rescue (418-428)

`central_blob`: core_ratio ≥ 0.18 & component lớn-nhất/core ≥ 0.08.
`textured_dense_blob`: raw ≥ 0.30 & core_ratio ≥ 0.02 & ≥2 components.
→ chống miss xe trắng/sáng khi adaptive-threshold nuốt texture.

**Finding**: quét toàn-bộ 17 session verify → **0 case** `rescue=true` với `empty_votes ≥ 12` — tức rescue chưa-từng lật kết-quả vote trong replay (ô có xe thật luôn có votes < 12). Rescue vẫn chặn trong stable-exit (`not rescue` trong desired-empty).

## Stable-evidence hysteresis — accept_evidence (602-645)

- `stable_evidence=True` runtime (khi không `--legacy-parking-filter`).
- Occupied→empty: `desired = not(exit_empty_votes ≥ 12 && !rescue)` — phải thấy trống ở ngưỡng thấp-hơn `exit_ratio=0.08` (626-628).
- Empty→occupied: `desired = instant_occupied` (629-630).
- Chuyển trạng-thái cần: occupied `count ≥ 2` & ≥ `occupied_seconds=0.5s`; empty `count ≥ 3` & ≥ `empty_seconds=1.0s` — dwell theo **timestamp nguồn**, không theo số frame (636-640).
- `gap > 1.5s` giữa hai evidence → reset pending (624-625).
- `ready=initialized`: trước khi đủ evidence, `occupied=True` (placeholder không-khả-dụng) — binder không nhận chỗ "unknown" (641-644).

## Ngưỡng runtime thực-tế (two_camera.py)

| Tham-số | Giá-trị | Nguồn |
|---|---|---|
| ratio_thr (enter) | 0.12 | `--parking-enter-ratio` default, ghi-đè ratio_thr khi không legacy (2330) |
| exit_ratio_thr | 0.08 | `--parking-exit-ratio` (1787) |
| required_votes | 12 | 25//2 |
| occupied_seconds | 0.5 | (1788) |
| empty_seconds | 1.0 | (1789) |
| smoothing_frames | 1 | `--parking-smoothing-frames` default 1; chỉ legacy dùng (1797-1801) |
| use_edge_recheck | False | (2275) |
| core_scale | 0.80 | (2278) |
| stable_evidence / selective_line_filter | True | (2279-2280) |
| parking_max_result_age_seconds | 1.0 | (1791-1794) |
| parking_fps | (chu-kỳ worker) | `1/parking_fps` spacing (2528) |

## Evidence thật (hiep3, frame 465-466)

- cam2 `B05` f466: `empty_votes=0/25`, filtered 0.417, raw 0.295, `instant_occupied=true`, occupied=**true** — xe đỗ.
- cam2 `A01` f466: `empty_votes=25/25`, filtered 0.0, raw 0.024 — trống.
- cam2 `B02` f466: raw 0.122 **≥ enter 0.12** nhưng filtered 0.022 → votes 25/25 free — **minh-họa selective line filter loại vạch/biên** (raw cao do vạch+viền, filtered sạch).
- cam1 `D03` f465: votes 16/25, filtered 0.115 (<0.12) — free nhưng gần ngưỡng.
- cam1 `E03` f465: `exit_empty_votes=17` vs `empty_votes=25` — 8 biến-thể nằm giữa 0.08 và 0.12 = vùng hysteresis.

## Slot polygons nguồn

`config/parking_slots_cam2.json` (1280×720, 30 ô, keys id/polygon/center). B05 pts: (578,248),(637,248),(639,332),(579,334). A01: (303,461),(371,459),(359,574),(285,571). B02: cần lấy.

## Giới-hạn cho ⑥

- Pixel-evidence phụ-thuộc ánh-sáng/bóng; ensemble + dwell giảm nhưng không xoá flicker — `pending` state tồn-tại.
- `rescue` trong replay chưa-từng lật vote (0/17 sessions) → Pass-1 cứu lý-thuyết, chưa thấy tác-động thực-tế.
- Placeholder `occupied=True` trước `ready` → startup ngầm-định ô "không rảnh".
- Async live: result >1.0s tuổi bị drop → evidence gaps khi máy chậm.
- Detector chỉ nói "ô có vật-thể che", không biết đó là xe nào — identity do slot-binder gán (trang sau).
