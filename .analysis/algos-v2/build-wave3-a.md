# Build Wave 3 — Owner A: `js/pipeline/journey.js` (Hành trình một chiếc xe)

**Scope/ownership:** chỉ `algo-web-v2/js/pipeline/journey.js` + report này + `qa/shots/a/journey/` + `_qa_journey_a.mjs`. KHÔNG sửa index/manifest/core/CSS/router — `journey.js` đã có script-tag sẵn từ frame C (index:84); route `#/journey`, id `__journey`, `mount(el,ctx)` → `{destroy}` giữ nguyên → C không phải đụng gì.

## Thiết kế

`TG.registerContent({id:"__journey"})` in-file → `TG.ui.pageScaffold` → đủ chuẩn: title/badges/problem, stage(canvas), transport, HUD, pcode, expl, fourBlocks auto, Deep/QA/refs.

Canvas 2 vùng:
- **World** (trái ~62%): bản đồ minh họa 1000×560 — cam1/cam2 FOV (ranh x=520), làn polyline, vạch VÀO (x=150)/RA (y=495), ô A05, QR kiosk, token ring, route A*. Xe đổi vị trí/màu (`gidColor(7)` sau publish).
- **Node strip** (phải ~38%): N0→N15 trong 2 cột; `∿` đánh dấu lane async (N2 worker/N14 gate/N15 frontend) — footer giải thích ∿; node active highlight theo step.
- HUD 6 ô: Local track · GID · Ô · Session · Occupancy · Chặng.

## Storyboard 10 chặng (J1–J9 của pipeline-order §5)

| Step | Chặng | Node active | Điểm cốt lõi |
|---|---|---|---|
| 0 | Vào cam1 | N0,N1,N3,N5,N6,N7 | T12 tentative; N1 ROI ⊂ N5 (không tách stage) |
| 1 | **Cắt vạch VÀO trước GID** | N14 | crossing đo được, record thiếu `global_id`→skip (`gsc:461-462`); cờ "được cứu bởi recovered_entry_crossing" |
| 2 | GID publish | N7,N9,N11,N13 | manager.update_all_tracks → G7 (`tc:2774`); snapshot publish |
| 3 | Session + QR | N13,N14 | `create_session(global_vehicle_id=G7)` `gsc:516` → WAITING_FOR_SCAN; QR ≤120s (`sm:29`) |
| 4 | Claim + chọn ô | N12,N14,N15 | claim→SELECTING (`sm:355-358`), select→NAVIGATING (`sm:380`), reservation feedback |
| 5 | A* + handoff | N11,N13,N15 | off-route>80px callsite (`App:746`; lib 75 `RT:22`); T12→T4 giữ G7 |
| 6 | Đỗ → PARKED | N2,N12,N13,N14 | N2 mailbox song song → binder claim → episode (`svb:1953`) → PARKED; occupied=vision |
| 7 | Dormant token | N7,N10 | coast→suspend; token `_bottom_center` (`svb:573`); vision vẫn occupied |
| 8 | Recovery giữ GID | N10,N11,N12 | gate `sd ≥ −diag×r` (`svb:2988`) → protected_local_keys → tái gán, không episode mới |
| 9 | Exit → xoá | N13,N14,N15 | EXIT_NAVIGATION → `delete_session_by_global_id` (`sm:585`, `gsc:526`) |

## Ranh giới async — đúng pipeline-order §4

- **N2** worker vẽ trong lane ∿, chỉ active chặng 6 (mailbox → `update_vision`, áp đầu vòng sau — `tc:2555-2667`).
- **N14** gate/session poll 0.25s (`gsc:865`) — consumer async, active ở 1,3,4,6,9.
- **N15** frontend poll — active ở 4,5,9.
- **Session không trước GID**: step1 HUD `sess: — (crossing bị skip)`; step2 publish; step3 mới tạo session.
- **Recovered ≤1.0s·≥2 mẫu**: expl step1 + pcode dòng 7 + realParams (`gsc:259-309`, `recent_observed_path` `:275`, continuity `:480-483`).

## Fact vs minh họa vs suy luận

- **Fact (refs trong pcode/realParams/sourceRefs)**: thứ tự N0–N15, poll 0.25s, QR 120s, observation/source ≤1.0s, ≥2 mẫu same-cam+local, throttle 1/json_fps, off-route 80px callsite, vision_primary occupied, token `_bottom_center`, recovery predicate, delete on exit.
- **Minh họa [đã ghi trong `limits`/certainty]**: toạ độ bản đồ/vị trí xe/ô A05/tên G7/T12/T4/T9; thời gian giữa chặng rút gọn thành step.
- **Không suy đoán**: mọi caption chỉ nói điều kiện/thứ tự đã verify trong source.

## QA — `_qa_journey_a.mjs` (index.html thật, KHÔNG inject)

```
node .analysis/algos-v2/_qa_journey_a.mjs          → 19/19 PASS, 0 errors (1280×720)
node .analysis/algos-v2/_qa_journey_a.mjs --1440   → 19/19 PASS, 0 errors (1440×900)
```

19 checks: mount, step0 `0/9`, title, hud-init (`T12`, `—`), four-before-deep, next, prev, scrub→5, hud-mid (`G7`+`NAVIGATING`), reset, determinism (hash s0 sau reset khớp), hud-reset, speed=4, play, pause-freeze, hud-final (`EXIT`/`xoá`), scene-change (hash s9≠s0), re-nav `#/map→#/journey` (step 0/9 + hash khớp h0), errors=0.

**Shots** `algo-web-v2/qa/shots/a/journey/`: `journey-{s0,s5,s9}.png` @1280 + `-1440` @1440; thêm `journey-s{1,3,6,7,8}-check.png` eyeball (cờ cắt-trước-GID, kiosk QR, PARKED đỏ, token ring, re-assign).

## Corrections vòng 2 (sau LEAD review W3)

| LEAD note | Sửa | Chỗ |
|---|---|---|
| Node strip xếp theo số N0..N15 — sai thứ tự runtime | **LOOP chain đứng theo pipeline-order**: `N0→N3→N4→N5(⊃N1 ROI)→N6→N7→N8→N9→N10→N11→N12→N13` (có ↓ giữa chip); **ASYNC lane hộp tím riêng** (N2 worker / N14 gate / N15 frontend, có subtitle) — không còn hàm ý N2 trước predict | `LOOP`/`ASYNC`/`nodes()` |
| Highlight hàm ý "chỉ chạy lúc đó" | Footer strip: "highlight = node liên quan chặng hiện tại · ∿ chạy song song/poll liên tục, không chỉ lúc highlight" | `nodes()` footer |
| Đếm "16 node + 2 consumer" = 18 | problem text → "12 node loop per-frame (N0, N3–N13 — N1 nằm TRONG N5) + worker N2 song song + 2 consumer async (N14, N15)" | content `problem` |
| Click node → trang thuật toán | Chip ↗ click → `TG.router.go("#/algo/"+page)` (API public C, router.js:93); `PRIMARY` map node→route chính (N14→session, N15→routing, N2→ensemble…); N0 không trang → không ↗; hover → cursor:pointer; listener gỡ trong destroy | `hitRects`/`hitAt`/`onClick` |
| Nhãn A* s5 chồng | Route label dời vùng trống dưới-trái + leader đứt tới xe | `world()` st===5 |
| Async box bẹp (~14px) | Bug `ah=min(84, còn-lại)` → ASYNC_H=66 cố định, loop `ch` tính lùi chỗ; 3 chip ngang 2 dòng (id+tên / subtitle) | `nodes()` |

**Ensemble — 3 minor từ `peer-a-web-by-b.md` (đã đóng, file A):**
- N1: rescue ghi rõ **2 đường OR** — minh họa `central_blob` (core≥0.18 ∧ comp≥0.08); đường thay-thế `textured_dense` (raw≥0.30 ∧ core≥0.02 ∧ count≥2) — `pd:418-428`, callsite `:542-547`. Sửa EXPL[3], pcode note, header comment, rescue label + content step/sourceRef — "raw 0.30" không còn đọc như điều-kiện-3.
- N2: `--legacy-parking-filter` (stable_evidence=False) **cũng bỏ qua dwell** — `accept_evidence` pass-through raw (`pd:613-615`) → thêm vào content `limits` + EXPL[5] nửa dòng.
- N3: `exit_ratio_thr` ref `tc:2320` → **`tc:2273`** (ctor kwargs, không điều-kiện).

**ROI — flag từ C report (đã sửa, file A):** `content/roi.js` "cap ≤diag·ratio :2875" → reject `signed < −diag×initial_ratio ∧ ov≤0` (`svb:508-509`); `:2875-2876` chỉ tính radius/max (không predicate); recovery predicate `:3240-3247`, origin `:3237`, biên `sd=−r` GIỮ — đồng bộ limits + QA + phân biệt wakeup mask `:2653-2668`.

**Peer stamp:** `peer-c-web-by-a.md` REVERIFY sau corrections C — **5/5 MINOR RESOLVED → PASS bản hiện tại**.

## QA vòng 2 — `_qa_journey_a.mjs` cập nhật (21 checks)

```
node .analysis/algos-v2/_qa_journey_a.mjs          → 21/21 PASS, 0 errors (1280×720)
node .analysis/algos-v2/_qa_journey_a.mjs --1440   → 21/21 PASS, 0 errors (1440×900)
```

Thêm: `chips` (≥14 hit-rect qua `canvas._hit`), `click-node` (click tâm chip N3 → assert `location.hash === "#/algo/kalman"`), `journey-nav-kalman.png` (ảnh sau điều hướng — trang Kalman render đúng, crumb N3 › Kalman CV4). Targeted: `ensemble-core-s3-rescue.png` (EXPL 2-đường-OR đọc đủ), `roi-deep-refs.png` (mount + Deep sạch).

## Corrections vòng 3 (LEAD targeted visual — ensemble core s3)

- **Vấn đề**: chip `comp 0.09≥0.08` ở `gx+136` (w=128 → gx+264) tràn mép phải panel ON @1280; label rescue trên cũng tràn.
- **Sửa** (`js/pages/ensemble.js:186-193` — chỉ layout, không đổi math/data/nguồn): label rút ngắn `"vote 13≥12 → lõi đủ → rescue (central_blob)"`; 2 chip **xếp dọc** `badge(w=min(150, room))` với `room = 46+2·pw−10−gx` (mép trong camFrame ON).
- **Re-run targeted**: `ensemble-core-s3-rescue.png` @1280 + `-1440` — cả 2 chip + label đọc đủ trong panel, 0 console error. Semantics peer-PASS giữ nguyên.
- **Ghi chú cho C**: `js/pages/ensemble.js` đổi mtime (layout-only) — nếu C đã chạy full QA trước giờ này thì rerun riêng route `#/algo/ensemble` là đủ.

## Trạng thái / blockers

- Journey v2 **done phía A** — chờ C full QA / LEAD review. Không self-approve.
- Ensemble/ROI minors đã đóng trong file A (không đụng file C).
- Nit còn lại: nhãn "gate sd ≥ −diag×r" s7/s8 kề tiêu đề ô; "exit crossing → delete_session" s9 hơi kề vạch RA — đọc được.
- C full QA cuối sẽ phủ render toàn bộ; A sẵn sàng fix thêm nếu LEAD flag.
