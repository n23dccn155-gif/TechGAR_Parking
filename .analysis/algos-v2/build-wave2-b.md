# build-wave2-b.md — Báo cáo W2 (builder B)

## Status: 9/9 pages BUILT + probe sạch — chờ C integrate + LEAD duyệt shots

## Môi trường QA
- `qa/_probe_b.js` (B-owned): inject `js/content|pages/<id>.js` qua `addScriptTag` sau khi shell load (index.html do C sở hữu — KHÔNG sửa), `TG.router.go` để mount.
- Khi C integrate `<script src>` thật, owner chỉ cần mở `file://` — không cần probe.
- Shots: `algo-web-v2/qa/shots/b/<id>-<viewport>-{initial,mid,final}.png` (final = scrub→max, frame bind/result).
- Viewports: **1280×720 + 1440×900** mọi page; `d.w/d.h` responsive, stage `minHeight` per page.

## Kết quả probe (9 pages × 2 viewport — run cuối)
- **consoleErrors = [] · badReqs = []** trên toàn bộ 18 lần mount.
- fourBlocks = 4 mọi page; hud đầy (7–9 ô); pc đồng bộ; Deep section tồn-tại.
- Steps chạy đúng: `step0 → mid → final` (scrub max) — ví dụ handoff 0/5→2/5→5/5.
- Transport verify thủ-công trước đó: play 0→2, pause giữ, prev lùi, reset 0.

## Bảng acceptance — 9 pages

| Page | Tier | Render | OFF/ON cùng scene | State thay đổi ≥3 khung | Pcode sync | 4-blocks | Refs đủ | px≠0 | Console/Net |
|---|---|---|---|---|---|---|---|---|---|
| reid | T1 | ✓ | ✓ xe đỏ cam1→cam2 | gallery 12→24 · dist gauge 0.21 → verdict G#5 | ✓ | ✓ | td:18-78/81-91/308 · mt:427 · ccm:547-587/388-397 · tc:1965-1967 | 93k/111k | 0/0 |
| handoff | T1 | ✓ | ✓ map 60×60cm + A/B/C | gates→cost bars 0.324/0.591→margin 0.267→streak 2/2→bind G#5 | ✓ | ✓ | ccm:2572-3017/3376-3667 · tc:1926-2190 | 203k/230k | 0/0 |
| homography | T2 | ✓ | ✓ px-offset vs shared-map | 8 điểm→fit gates→chiếu (35.2,11.8)/(34.9,11.5)→residual 0.4→v | ✓ | ✓ | rl_calib:41-112 · tc:287-331/1370-1407/2163-2190 · ccm:2759-2764 · cfg:1461 | 171k/209k | 0/0 |
| trajectory | T2 | ✓ | ✓ 2 xe đỏ + 1 mảnh | trails→corridor→6-comp bars→score 0.83≥0.78→cost 0.17→vote A→departure reject | ✓ | ✓ | tm:56-68/306-426/395-402/428-516/503-509 · ccm:1442-1510/6024-6131 | 206k/240k | 0/0 |
| dormant | T2 | ✓ | ✓ xe G#5 đỗ→mất→về | dormant+token rings→signed-gate→dist 9<16.218→rebind G#5 | ✓ | ✓ | ccm:2419-2445/4636-4691 · svb:225/603-609/2980-2992 · tc:1890-1897/2331 | 247k/292k | 0/0 |
| gid-conflict | T3 | ✓ | ✓ G#5 ôm 2 vết 11cm | probation→đo 11cm→evidence 1/2→2/2→detach→2 ID sạch | ✓ | ✓ | ccm:7485-7486/3088/3376-3440/4707-4711/163-165 · tc:2184-2190 | 265k/313k | 0/0 |
| gate | T3 | ✓ | ✓ xe qua vạch ENTRY | cross>0→create / cross<0→reject / recovered 2 mẫu≤1s / jitter an-toàn | ✓ | ✓ | gate_session_controller.py:196-534/865/899-906 | 266k/314k | 0/0 |
| session | T3 | ✓ | ✓ giả-định QR=TTL vs code thật | WAITING→QR ẩn (sống)→claim quá-hạn→PARKED→XOÁ (không CLOSED) | ✓ | ✓ | session_manager.py:29/81-88/206-215/355-446/190-556 | 271k/320k | 0/0 |
| snapshot | T3 | ✓ | ✓ mailbox latest vs giả-định queue | publish đè f119→gate 0.25s→frontend lệch-pha→QR→stale >5s banner | ✓ | ✓ | tc:1802/2817/2844-2869 · rs:106-113/285-289 · gate:55/865/899-906 · App.tsx:354-404/283/355 · rc:12-13 | 194k/229k | 0/0 |

## Fix theo LEAD review (áp dụng, đã re-probe sạch)
- **handoff geometry** (LEAD flag B2): map 60×60cm thật (`MAPCM`, `cm()`), ring 25cm = polygon 24-điểm cm-space → trong panel; A·11cm xa hơn B·9cm đúng khoảng-cách; gates table box riêng (không chồng map); verdict `B reject 'appearance' — TRƯỚC cost`; certainty badges rút ngắn `"cao [code]"` (bỏ text review nội-bộ).
- **trajectory scoring** (LEAD flag W1): bỏ "0.6/0.4" + "0.35/0.35/0.30" sai-nguồn → score thật `0.35d+0.25a+0.15dir+0.10v+0.10t+0.05s` trong match() (tm:395-402); caller `cost=1−score`, cap 0.22, margin 0.12 (ccm:6024-6131).
- **homography** (LEAD flag B5): sửa typo `(35.2,41.8)/(34.9,41.5)` → `(35.2,11.8)/(34.9,11.5)` thống-nhất HUD/map/EXPL/comment.
- **trajectory geometry** (LEAD flag B5): FRAG mới nằm sát endB (|F−B|≈0.057 ≪ |F−A|≈0.277 — nearest-position=B thật) NHƯNG trùng corridor A → OFF gán nhầm B có nghĩa, ON vote A có căn-cứ.
- **dormant predicate** (LEAD flag B5): `pointPolygonTest` sign — reject khi `signed_distance < −0.85·diag (−=ngoài) ∧ overlap=0 ∧ ¬evidence` (svb:2980-2992), trước ghi `> −0.85` sai chiều.
- **dormant clocks** (LEAD flag B5): scene "~3s sau" (trong token 5s); HUD/labels tách 2 đồng-hồ — `dormant còn ~57s/60s` ≠ `token còn ~2s/5.0s`; wakeup scale ghi `(minh họa) — expand 0.05→0.85·diag/1.0s`; EXPL nêu nhánh xe trễ >5s → dormant-match riêng vẫn cứu.
- **probe**: thêm shot `-final` (scrub→max) mọi page.
- **gid-conflict refs** (LEAD flag B9): `canonical=min(GID)` giờ cite **ccm:1259** (`_merge_global_ids` — merge 2 GID khác nhau), không còn dùng guard :3088 (`_cross_merge_would_conflict` — ghi rõ "không phải nguồn canonical" trong sourceRefs). Bounds 2×/3×+evidence gán đúng **cross-camera resolver :3226-3374** (divergence :3278 / extreme :3279 / `_advance_consecutive_evidence` :3306-3312 / member_rank app→bind→visible :3314-3347); same-camera resolver :3125-3224 (owner_rank app→size→bind→visible) — member giữ GID chọn theo rank, KHÔNG min(GID).
- **snapshot** (LEAD flag B9): thêm payload read-state box — field thật schema v2 (`schema_version:2`, `frame_index`, `vehicles[]{global_id,state,observed,camera_ids,position{ref:"cm"},parked_slot_id,recent_observed_path≤12}`, `parking_slots`, `parking_episodes`, `retired_global_ids`, `recent_events` — runtime_contract.py:95-167); "CV 30fps" → "loop ~30fps (minh họa)" ở caption + problem; cadence 5fps/0.25s/200+500ms giữ nguyên có source.
- **gate** (LEAD flag B9): caption step1 ghi rõ "thử chiều RA trên vạch ENTRY — cross<0 phải bị từ chối", tránh ngụ ý positive-pass.
- **gid-conflict scene-branch** (LEAD flag B10): scene là 1 GID ôm 2 member → detach theo `member_rank`, KHÔNG phải merge 2 GID. Pcode dòng cuối "canonical=min(GID)" đổi thành 2 dòng đúng nhánh: `kept=argmin member_rank (app→bind→vis→cam,local)` (ccm:3301-3347) + `loser: pop local→global + discard — giữ nguyên G#5` (ccm:3348-3355). Rank tuple đầy đủ có đuôi `(cam,local)` — `min()` ở đây là min member-tuple, không phải min(GID). min(GID) chỉ còn trong Deep/QA/EXPL dạng "nhánh khác — scene này không merge". HUD `kept = rank` đồng bộ.

## Semantic/scenario/seed verification
- Mọi page `seed` cố-định trong `player.create` (reid-v2/handoff-v2/homography-v2/trajectory-v2/dormant-v2/gid-conflict-v1/gate-v1/session-v1/snapshot-v1); không `Math.random()` ngoài rng player.
- OFF/ON cùng cảnh + cùng seed (REVIEW-CHECKLIST): reid/handoff/homography/trajectory/dormant/gid-conflict/gate; session+snapshot dùng "giả-định sai" panel (QR=TTL / mailbox=queue) vì comparison cần counter-factual như dataset C ghi.
- Giá trị demo gắn `scope:"illustration"`/`(minh họa)` trong HUD/labels/realParams; runtime params đủ `file:line`.
- Deep section: realParams table + limits + sourceRefs; QA 3 câu/page; certainty `[code]`.

## File nộp cho C integrate (18 files — C sole-owner index/manifest)
```
js/content/reid.js          js/pages/reid.js
js/content/handoff.js       js/pages/handoff.js
js/content/homography.js    js/pages/homography.js
js/content/trajectory.js    js/pages/trajectory.js
js/content/dormant.js       js/pages/dormant.js
js/content/gid-conflict.js  js/pages/gid-conflict.js
js/content/gate.js          js/pages/gate.js
js/content/session.js       js/pages/session.js
js/content/snapshot.js      js/pages/snapshot.js
```
Manifest route ids: `reid, handoff, homography, trajectory, dormant, gid-conflict, gate, session, snapshot`.
Sau integrate: `index.html#/algo/<id>` chạy trực-tiếp file://.

## Blockers / mở
- Không block. Probe dùng addScriptTag — route mount thật cần C thêm script tags; đó là việc của C.
- Shots `qa/shots/b/` đủ initial/mid/final ×2 viewport cho 9 trang.
