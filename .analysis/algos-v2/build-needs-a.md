# build-needs-a.md — Nhu cầu canvas/HUD/interaction/API cho 10 trang của A

**Mục đích**: input cho C dựng `CONTRACT.md` (SPEC §4). Bám storyboard đã verify trong `builder-a.md` — KHÔNG phải phân tích mới. Chưa build; chờ SPEC final.

**10 trang (route id theo SPEC §2)**: `roi`, `motion`, `kalman`, `coasting`, `assignment`, `brightness`, `shadow`, `echo`, `track-lifecycle`, `occlusion`.

---

## §1. Nhu cầu CHUNG (áp mọi trang — xin đưa vào contract một lần)

| # | Nhu cầu | Lý do (storyboard nào dùng) |
|---|---|---|
| C1 | **Hai khung cảnh OFF/ON cùng-input, đồng bộ step** — một `state` chung, render 2 nhánh; không 2 clock lệch (SPEC §4 đã nêu "một tick/step sở hữu state chung" — cần API chốt: `draw(ctx, frame, view)` được gọi 2 lần với `view.mode ∈ {off,on}` hay page tự xử lý?) | Mọi storyboard T1/T2 đều OFF/ON cùng cảnh |
| C2 | **Draw primitives ngoài bbox/polygon/arrow/trail/label/matrix/histogram/timeline** (SPEC §4 đã có 7): cần thêm `mask` (overlay pixel-region trong suốt), `ellipse` (uncertainty), `path` (contour tự do), `badge/chip` (trạng thái text nhỏ trên đối tượng), `gauge/bar` (thanh ngưỡng có marker), `grid` (lưới mẫu). Nếu contract cho `ctx.draw` raw-canvas access thay vì primitive list thì cũng đáp ứng — nhưng cần nói rõ. | roi/motion/kalman/coasting/shadow/lifecycle/echo |
| C3 | **HUD**: thanh trạng thái mỗi frame hiển thị `association_state`/`observation_kind`/`prediction_source` của track + counters (age, votes, cost). Đề xuất contract: mỗi keyframe có field `state` (object phẳng JSON) và shell render k·v tự động — page không tự vẽ DOM. | T1-3/4/5, T2-3/4/5 — dossier đã verify `association_state`/`observation_kind` hiện thẳng `mt:2268-2280` |
| C4 | **Pseudocode đồng bộ**: mảng dòng, mỗi keyframe chỉ `activeLines: int[]` (0-based); shell tô sáng. (Đã hợp ý "bước tô sáng đồng bộ" SPEC §3.) | Mọi trang có 3–7 bước trong dossier |
| C5 | **Chú thích [prod]/[minh họa]/[suy luận]**: content field cho phép đánh dấu param scope (SPEC §4 `realParams.scope` đã có default/runtime/config — xin thêm `minh_hoa` hoặc quy ước `unit="minh_hoa"`); scene constants tách khỏi realParams. | Mọi storyboard đều tách số prod vs minh họa |
| C6 | **Player**: play/pause/prev/next/reset/speed/scrub + seeded RNG (SPEC §4 đã có) — A chỉ cần xác nhận `frame` object nhận được trong draw là **immutable-by-contract** (draw không mutate) và `view` truyền `{width,height,progress,time,previous}` (progress trong keyframe để nội suy). | Cần cho mọi animation nội suy trong keyframe |
| C7 | **Refs**: `sourceRefs[]` {file,line,symbol,note} (SPEC §4) — A cần thêm `excerpt`/`excerptStart` để viewer hiện đoạn source gốc (SPEC §3 có nhắc "viewer trích đoạn" — xin chốt field). | Mọi thẻ đều có file:dòng |
| C8 | **Accordion**: Deep + QA collapse (SPEC §3); term/glossary link từ text (ROI, blob, track, LAPJV, Kalman…) → `#/glossary` anchor. | Giải nghĩa thuật ngữ đã frontload trong dossier |

## §2. Nhu cầu RIÊNG theo trang (scene + keyframes đã verify)

| Route | Scene canvas | Keyframes chính (từ storyboard dossier) | HUD/state cần | Primitives đặc thù |
|---|---|---|---|---|
| `roi` | Bãi xe + polygon ROI + vành context | k1 OFF: nhiễu ngoài ROI → 3 blob rác · k2 ON: chỉ blob trong ROI sống · k3 priority: ô giãn `1+2r/diag` sáng vùng, blob nhỏ ngưỡng mềm → confirm 2 obs **trong vùng** · k4 A vs B cùng pixel khác ngưỡng | `roi_clipped`, `priority`, `priority_observation_count`, ngưỡng đang dùng (0.05 vs 0.03) | polygon+mask+context-ring, badge `priority`, gauge ngưỡng |
| `motion` | Mask pipeline dạng "bản đồ pixel" | MOG2 fg>200 → 127 admit khi flag → temporal short/long ∧ support → ROI context → OPEN 3×3/CLOSE 5×5 → contours→bbox→cascade gates | per-stage pixel/blob count; `mog_shadow_marker_ratio` | **mask/binary overlay** (3 lớp: mog, temporal, final), contour path, cascade checklist |
| `kalman` | Một xe + đám mây dự đoán | predict trước detect (Hằng số vận tốc 4-state x,vx,y,vy) → ellipse co khi correct → state text | `prediction_source` ∈ {measurement, kalman_prediction}, velocity_confidence | **ellipse (covariance)**, arrow vận tốc, badge state |
| `coasting` | Track mất detection theo thời gian | predict → decay điểm về measured `measured+(kalman−measured)·e^(−age/0.25)` → stale 0.40s anchor → TTL 4.5s expire | `age_s`, `prediction_source`∈{kalman_prediction, stale_prediction}, velocity_confidence ↓ | **bar/gauge TTL** (đã từng bug nhãn chồng — cần callout+leader), fade trail |
| `assignment` | 2 track × 2 detection + ma trận cost | gate circle → matrix cost (0.45/0.25/0.20/0.10) → greedy 1.15 vs LAPJV 0.75 (cùng ma trận!) → margin 0.08 đóng băng | cost per cặp, `assignment_cost_limit 0.90`, margin/frozen | **matrix** + highlight cell/sweep, arrow gán, gate circle |
| `brightness` | Frame + histogram/mean readout | sáng→tối 120→95: OFF diff ~25 toàn ảnh vs ON shift−25 chỉ còn xe | `shift` giá trị, mean trước/sau, grid overlay (128/chiều!) | **grid sampling overlay**, histogram hoặc mean-badge |
| `shadow` | Contour + mask MOG2 | OFF: 127 bị threshold>200 loại sỉ (xe đen cũng mất) · ON: 127 admit → rọi từng contour bằng 4 metric (att/chrom/residual/explained) → bóng xóa, xe đen `dark_foreground_rescued` | per-contour: attenuation 0.32–0.62, chrom≤0.10, residual≤0.08, explained≥0.75 → pass/fail | **mask 3 màu** (0/127/255), **gauge 4-metric** per contour, contour path |
| `echo` | Hai bbox gần trùng + mép ROI | echo detection kép: hist+size+dist+gap → suppress trừ khi 2 chủ sạch · ROI-twin: BOTH `roi_clipped` + IoU≥0.90 + tâm≤`max(12,0.15·extent)` + ≥1 tentative/invisible → winner `_roi_edge_twin_strength` | `association_state` ∈ {suppressed_roi_edge_twin, frozen_ambiguous, coasting} (HUD — LEAD đã duyệt hiện) | IoU badge, extent circle, winner/loser tag, ROI edge highlight |
| `track-lifecycle` | FSM + timeline track | TENTATIVE →(count+displacement)→ CONFIRMED →(mất khớp)→ LOST →(TTL)→ expire; suspended pop khỏi `_tracks` | `total_visible_count`, displacement, `TrackStatus`, `association_state="suspended_*"` | **FSM node-graph** (không có trong primitive list — cần thêm hoặc tự vẽ), counter chips |
| `occlusion` | 2 track + blob merge | group prepare → blob phủ 2 tâm + ≥1.6×ref → freeze members `occluded_prediction` → watershed provisional → recovery cần 3 frame + swapped−direct≥2·margin | group id, `recovering_count` (0→3), `observation_kind`, margin gate | blob-union shape, watershed split-line, freeze badge, recovery counter |

## §3. Interaction cần (ngoài player chuẩn)

| # | Interaction | Trang |
|---|---|---|
| I1 | OFF/ON toggle hoặc song-song (C1 quyết định layout) | TẤT CẢ 10 — yêu cầu cùng cảnh, nên mặc định song-song |
| I2 | Hover object → tooltip state (bbox/mask/contour/matrix-cell) | roi, motion, assignment, shadow, echo, occlusion |
| I3 | Click pseudocode-line ↔ nhảy tới keyframe dùng dòng đó (hoặc chỉ highlight) | TẤT CẢ (nice-to-have, không block) |
| I4 | Chọn scenario: mỗi trang ≥2 scenario (normal + edge) — storyboard dossier đã có sẵn 2 nhánh OFF/ON; edge-cases: roi(noise/priority), motion(shadow/noise), kalman(predict/correct), assignment(2-xe/gate), coasting(reacquire/stale), shadow(127-rescue), echo(2-xe-thật-sát không suppress), lifecycle(suspend), occlusion(recover-fail) | TẤT CẢ — cần `ctx.router` hoặc param `?sc=` |
| I5 | Badge màu GID/track cố định xuyên trang (SPEC §3 màu đã quy định) | mọi trang có ≥2 track |

## §4. Field/API contract A đề xuất C chốt

1. `frame` (1 keyframe): `{ caption?, state:Object(phẳng→HUD), pseudocodeActive:int[], drawData:Object(page-private) }` — state phẳng để shell render `k: v` tự động.
2. `scenario` build: `build(seed) → frames[]` — deterministic, mỗi trang ≥2 scenario (`id`, `label`).
3. `view` cho draw: `{width,height,progress,time,mode:'off'|'on'|'both',previous}` — **cần `mode`** vì OFF/ON là yêu cầu cốt lõi của dossier.
4. `ctx.draw` primitives: danh sách §1-C2 (mask/ellipse/path/badge/gauge/grid + 7 có sẵn) **hoặc** expose raw ctx2d + page tự vẽ — chốt 1 trong 2.
5. `ctx.ui`: `accordion(title,node)`, `paramChips(realParams)` (scope badge tự động), `refList(sourceRefs)` (+copy file:line), `glossaryLink(term)`.
6. `ctx.player`: đã đủ theo SPEC §4 — chỉ cần thêm `stepCount`/label từ frames.
7. `ctx.pseudocode`: `setLines(string[])`, per-frame `activeLines`.
8. Không cần: fetch/network, DOM access ngoài rootEl, import động — tuân thủ SPEC §4.

## §5. Ràng buộc A tự cam kết

- Số liệu trong scene = `minh_hoa` (seed cố định), params prod hiện trong `realParams` với `scope` đúng — không trộn.
- `draw()` không mutate `frame`; mọi nội suy dùng `view.progress`.
- Mỗi trang có `certainty` + `qa` 2–3 câu từ dossier; `sourceRefs` đầy đủ file:dòng đã verify.
- Chỉ viết `js/pages/<id>.js` + `js/content/<id>.js` của 10 id trên; không chạm core/index/css/manifest/pipeline.
