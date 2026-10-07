# batch-checkpoint-a — OWNER A · readability-v3 R3+R4
**Cập nhật lần cuối:** 10/10 route DONE · lint 0/0 · QA R3 272/272 + R4 **408/408 PASS 0 errors** · report `batch-a.md` đã cập nhật kèm freeze hashes 20 file (sau last-fix).
**Nguồn sự thật nếu context compact:** file này + `batch-a.md` (report R3+R4 + freeze hashes) + `r2-roi-a.md` (mẫu ROI đã duyệt) + source `two_camera.py`/`motion_tracker.py`/`occlusion_guard.py`/`routeEngine.ts`.

## TRẠNG THÁI TỪNG ROUTE (bảng cho LEAD — không cần đọc code)

| Route | Title mới | Chặng (mapping C) | Src-verify | Code v3 | Lint | QA | Reader | Freeze |
|---|---|---|---|---|---|---|---|---|
| motion | Phát hiện chuyển động | 4/12 · after occlusion → before assignment | done tc+mt | done | 0/0 | 272/272 | LEAD fix đã áp | md5 trong batch-a.md |
| kalman | Dự đoán vị trí xe | 2/12 · after N0 → before occlusion | done mt:440-448 | done + visual-fix | 0/0 | 272/272 | LEAD fix đã áp | md5 trong batch-a.md |
| coasting | Trôi vết khi mất đo | 6/12 · after assignment → before dormant | done mt:77-78,149-153 | done | 0/0 | 272/272 | LEAD fix đã áp | md5 trong batch-a.md |
| assignment | Ghép vết vào điểm đo | 5/12 · before motion → after track-lifecycle | done mt:1685-1686 | done + vết-nhạy fix | 0/0 | 272/272 | B MINOR đã áp | md5 trong batch-a.md |
| brightness | Bù sáng toàn cục | 4/12 ⊂ motion · links→motion | done mt:470-484 | done | 0/0 | 408/408 | LEAD fix đã áp | md5 trong batch-a.md |
| shadow | Lọc bóng đổ | 4/12 ⊂ motion · links→motion | done mt:705-726 | done | 0/0 | 408/408 | LEAD fix đã áp | md5 trong batch-a.md |
| echo | Chặn vệt bóng ma | 4–5 · links motion+assignment | done mt:1488-1560 | done | 0/0 | 408/408 | hedge đã áp | md5 trong batch-a.md |
| track-lifecycle | Vòng đời vết theo dõi | 6/12 · after assignment → before dormant | done mt:2009-2334 | done | 0/0 | 408/408 | — | md5 trong batch-a.md |
| occlusion | Giữ đúng mã khi che nhau | 3/12 (lệnh cấm→5) · after kalman → before track-lifecycle · links→motion | done occlusion_guard.py | done | 0/0 | 408/408 | hedge đã áp | md5 trong batch-a.md |
| routing | Dẫn tuyến men theo làn xe | nhánh async · after snapshot → người-lái · links→session | done routeEngine.ts | done | 0/0 | 408/408 | — | md5 trong batch-a.md |

## VIỆC CÒN LẠI
1. ~~Re-run QA R4~~ → **408/408 PASS 0 errors** xong (fix cuối: pcode ≥5 lines ×3 route; routing glossRefs "phiên"/"bản tin" nằm trong story/stepTexts; echo HUD "vượt cổng"; harness update).
2. ~~Eyeball~~ — occlusion s3 (vệt to + đóng băng + cắt đôi gợi ý) & routing s4 (lạc quá vạch → la + vẽ lại) đúng cả 2 viewport.
3. ~~`batch-a.md`~~ — PHẦN II R4 + freeze md5 20 file đã ghi.
4. **Review-fix mới nhất đã áp (đợt LEAD review ảnh R4):**
   - brightness: một cảnh thống nhất — nền tối đồng loạt vs xe đang đi (bỏ "không xe nào nhúc nhích" mâu thuẫn).
   - shadow: OFF title → "đối chứng: bỏ mọi vùng nghi" (không ngụ ý không-lọc=production).
   - occlusion: hedge "vĩnh viễn/không sửa nổi" → "có thể đổi chỗ, khó gỡ" + limit "lệnh cấm chưa áp → hoán đổi vẫn lọt"; nhãn "độc lập vững" tách khỏi "mã A".
   - echo: hedge "an toàn" → "giảm chặn nhầm"/"vượt cổng trong cảnh này".
5. **B đang đọc chéo 6 route A** (theo LEAD) — chờ feedback.
6. ~~Cross-reader~~ → **`cross-reader-a.md` ĐÃ NỘP wave-1 (B6+C3) + wave-2 (B3 gate/session/snapshot)** — 12/12 đọc được, 0 blocker; fact-check độc lập source verify (QR 120s visibility-only sm:29/206-215 · claim-no-expiry-check sm:355-366 quirk B khai đúng · delete sm:585+gsc:526 · snapshot 5Hz tc:1802/2817 · latest-wins mailbox · stale>5s gsc:103-123/157-164 · gate poll 4Hz gsc:865 · cứu-cắt ≤1s gsc:264/279). Session left/right fix B đã live ở bản probe. Hash 24 file trong report. Ảnh 84 shot `qa/shots/cross-reader-a/` (wave-2 thêm pcode+src-open).
   - **Pending:** R5 shared (C) Map/Journey/Glossary — đọc chéo khi C ra hiệu ready (`journey.js` đang live-edit VI-hóa → chưa duyệt ảnh cũ); recheck session nếu B freeze hash mới.
   - Ghi-nhận không-blocker: vocab "vệt" vs "mảnh" (A/B), ensemble giữ selector, ID minh họa G5/G9 liền mạch.
7. Glossary "adaptive brightness→từng vùng" **RESOLVED by C**. Còn "off-route→75px" (runtime 80) — flag C, đã ghi blockers.
8. Đã sửa order assignment trong checkpoint table (before motion → after track-lifecycle — khớp UI thật; chỉ sai ở text report).

## CHECKPOINT — R5 READER ĐANG CHẠY (readonly, C đang live-edit)
- Lệnh: đọc-chéo Map/Journey/Glossary readonly trên runtime hiện tại → `r5-reader-a.md` provisional (flags + 2 viewport + hash), recheck trên C-ready-hash cuối. C đang sửa overlap số-chặng/tên-Map + Journey crowded/arrows → **không đánh pass trên ảnh cũ 02:47/03:03**.
- Đọc source R5 chỉ để xác-minh mapping không đổi call-order. Chẩn đoán glossary-lint warnings 7+ (do R5 đổi display: key/alias/consumer) → báo C qua report, KHÔNG tự sửa C/ROI.
- A files post-fix: QA r3 272/272 + r4 408/408 PASS, lint 0 error — hash mới trong batch-a.md §REVIEW-FIX wave-B3.

## B-WAVE-B3 FINDINGS — ĐÃ ÁP XONG
- **Ref sai đã sửa** (B verify đúng — chỉ ref, số/claim giữ): `lost_track_ttl=90` → `tc:1806`+`tc:2371`+`tc:3241` (coasting+track-lifecycle+report); note lerp → `mt:278` (coasting+report).
- **MINOR text đã áp:** echo story giải-nghĩa "bóng ma" inline · routing "la"→"nhắc" toàn-bộ (summary/caption/flow/impact/qa/canvas/HUD/harness) · kalman before → "Bản đồ pipeline · nguồn khung hình" (Map thật `#/`).
- **Verify:** lint 5 route **0 error** (warn glossary-noise C-owned, cũng có trên route B) · r3 **272/272** · r4 **408/408** 0 errors · hash mới trong `batch-a.md` §REVIEW-FIX wave-B3.
- **Pending giữ nguyên:** R5 Map/Journey/Glossary đọc-chéo khi C ready (journey.js đang live-edit → pending); B đọc chéo A chờ feedback.

## REVIEW-FIX ĐÃ ÁP (đợt LEAD review R3 + B cross-reader)
- **kalman visual**: quỹ đạo tọa độ tỉ-lệ panel ~65-75% (trước <20%); nhãn tách riêng không chồng ở 1280; HUD = `% ngang · % dọc` bỏ tọa độ âm debug; ellipse theo ph. QA 272/272.
- **kalman s5 OFF**: "cổng chỉ ở chỗ cũ" + "vệt về: đo vẫn dùng được" — tránh hiểu no-Kalman = không dùng được đo.
- **assignment**: s5 mơ hồ THẬT 0,30-vs-0,31 chỉ vết nhạy chờ; "vết nhạy" có giải nghĩa inline "(đang mất đo hay vừa gộp)" — verify mt:1685-1686; 0,90 = cap từng cặp.
- **coasting**: OFF = đối-chứng "xóa vết ngay" gắn nhãn rõ, ON giữ clock thật 0,40s/1,5s/4,5s·90khung; HUD s5 2 nhánh. GIỮ production facts (B toy-claim bị LEAD trả).
- **motion**: tách OR-trong-lớp (một mốc đủ) vs AND-giữa-lớp (hai lớp đồng ý).
- **brightness**: glossary/mapping sai "từng vùng" → A dùng "Bù sáng toàn cục" đúng source (np.median 1 hằng số mt:484), flag cho C.
- **routing**: glossary "off-route 75px" là lib-default — runtime 80px (App.tsx:746) → không glossRef, flag cho C.

## FACTS ĐÃ VERIFY (file:dòng — dùng lại khi viết report)
- **motion**: ctor overrides `tc:2366-2395`; MOG2 700/32 `mt:203`; temporal OR `mt:790-793` (0.25/0.80s); mask∧dilate `mt:792-793`; morph `mt:817-827`; min_area 650 `tc:1807`; min_pixels 100/0.05 `tc:1814-1815` (class 160/0.08).
- **kalman**: `_new_kalman` `mt:440-448` (Q=diag 2,2,12,12 · R=8I · P0=100I); predict `mt:239-260`; correct `_apply_detection` `mt:2170`.
- **coasting**: decay 0.25 `mt:78`,`tc:1864-1869`; max_prediction_age 0.40 `mt:77`,`tc:1859-1863`; reacquire 1.5s `mt:68`,`tc:1855` (merged 3.0 class-only `mt:69`); TTL = max(1.0,1.5)·3.0 = 4.5s `mt:149-153`; expire `mt:2305-2308` (`consec_invisible>90` OR `age>4.5s`, ttl=90 `tc:1806`); suspend `mt:2175-2187`.
- **assignment**: gate floor max(24,extent) `mt:1193-1230`; weights 0.45/0.25/0.20/0.10 `mt:1761`; lapjv `mt:1908`; cost_limit 0.90 PER-PAIR `mt:158`; margin 0.08/recovery 3 `tc:1871-1881`; vết nhạy `mt:1685-1686`.
- **brightness**: `_brightness_shift` `mt:473-484` median TOÀN CỤC; `_motion_between` `mt:451-460`; OR 2 mốc `mt:555-558`; threshold 20 `tc:1813` (class 25 `mt:45`); 17ms vs 0.3ms `mt:463-469`.
- **shadow**: `reject_cast_shadows=True` `tc:2386` (class False `mt:62`); 4 metric `mt:63-66,127-132`; `_cast_shadow_metrics` `mt:633`; `_is_cast_shadow` `mt:705-726` fail-open; 127-admission `mt:772-789`.
- **echo**: IoU 0.90 + tâm 12px consts `mt:1488-1489`; twin gate cả-hai-sát-mép + tâm≤max(12,0.15·extent) + ≥1 chưa-vững `mt:1501-1560`; winner `mt:1491-1499`; thua cấm-nhận-vẫn-sống `mt:1501-1513,1619`; echo-detect `mt:1088-1134`.
- **track-lifecycle**: fresh ID `mt:2009-2069`; confirmable `mt:2071-2094` gọi `mt:2170`; runtime 3obs+6px `tc:1808`; priority ≥2obs-vùng/3px `mt:2081`; expire `mt:2257-2334`; suspend `mt:2175-2187`; ttl=90 `tc:1870`.
- **occlusion**: timeout 3.0 `occlusion_guard.py:26` (=merged_reacquire `mt:229`); watch ≥3obs-sạch+overlap≤0.20+khe≤0.4×diag `:55-100`; activate phủ-mọi-tâm+area≥1.6×median `:102-148`; watershed gợi-ý `:150-189`; recovery swapped−direct≥2·margin, direct<1.2, 3-khung `:191-232`; birth-veto `mt:364-389`; defer `mt:224-228`.
- **routing**: heuristic euclid×min_ratio `routeEngine.ts:38`; adjacency one-way from→to `routeEngine.ts:22`+`laneGraph.ts:19,43`; freshRoute mỗi tick `App.tsx:753-758`; off-route 80px `App.tsx:746` (lib default 75 `voiceGuidance.ts:98`); arrival <35px `voiceGuidance.ts:126`; cooldown 7000ms `App.tsx:762`.

## QUY TẮC ĐÃ CHỐT (đọc lại trước khi sửa file)
- Mẫu thực hành = `js/content/roi.js` + `js/pages/roi.js` (FROZEN, không đụng).
- v3: `sc=TG.ui.pageScaffold(el,c)` → canvas vào `sc.stage` → `pc=TG.pseudocode.mount(sc.pcBox,PSEUDO,mapFn)` → `sc.v3.bindPlayer(player,pc)` SAU `player.create` → `sc.v3.hud.set(i,val)` trong render. Không `fourBlocks`/`sc.expl`/`pc.forStep`/`TG.ui.hud`.
- Panel title exact `"KHÔNG có X"`/`"CÓ X"` 14px bold ĐẶT TRÊN khung; cùng geometry/seed 2 panel.
- Canvas label ≤6 từ (em-dash "—" đếm 1 từ — dùng ":"), ≥13px, không `∧→N#/fn()`.
- Default text ≤25 từ/câu; không N#/T#/file:dòng/snake_case/formula; term glossary xuất hiện phải glossRefs cover (alias-string khi term hoa).
- qa[] bị scan banned patterns — viết đời thường.
- PSEUDO ≥5 lines (harness assert); tooltip `.tg-gt` ≥3 spans mỗi route.
- `position` theo batch-position-c: same-stage không nối before/after (không hứa call-order) — quan hệ đặt ở `links`; routing = nhánh async (before=snapshot nguồn-dữ-liệu, links=session).

## BLOCKERS / ISSUES (đã báo — không tự sửa shared/C-owned)
- Manifest titles jargon → C/R5.
- Glossary "adaptive brightness → từng vùng" sai (toàn cục) — flag C.
- Glossary "off-route → 75px" là lib default; runtime 80 — flag C.
- ROI FROZEN: content `81d237a6…` page `8f4a869d…` — không đụng.

## FILES ĐÃ SỬA (10 route — tất cả v3, 2-panel same-geometry, không selector)
`js/content/`+`js/pages/` × motion, kalman, coasting, assignment, brightness, shadow, echo, track-lifecycle, occlusion, routing (+ `_qa_r3_a.mjs`, `_qa_r4_a.mjs` harness mới).

## R5-READER + LEAD-20:08 (03:1x) — provisional
- routing summary 26→22 từ; hash `b104799cc385864b3e2c6c6a15adc9eb`; lint 0err.
- GlossRef alias-cover fix 4 file A (kalman/shadow/echo/track-lifecycle) → scoped lint còn **1 warn = roi "vùng quan sát" (roi.js A-owned metadata — đã fix bằng LEAD-phê, lint full 0/0)**.
- `_qa_r4_a` 408/408 PASS sau fix; hash 5 content-file cập nhật batch-a.md freeze.
- R5 reader chạy trên runtime ~03:08: map/journey/glossary mount sạch 0err, 10 shots `qa/shots/r5-reader-a/`, dumps `r5-*.json`.
- `r5-reader-a.md` = PROVISIONAL (C đang live-edit journey/map); recheck full trên C-ready hash. Không approve ảnh 02:47/03:03.
- Chờ: C canonical-hash + cleanup-plan (chưa remove fields); B feedback đọc-chéo A10.

## ROI METADATA-FIX (LEAD phê — 03:2x)
- roi.js glossRefs `+{term:"ROI mask",label:"vùng quan sát"}` — metadata-only, copy/canvas/số nguyên.
- Hash: `81d237a6ec681f150793b7cf0128ca69` → `35c41ab03eb4edf5dcaff61b115249e6`; lint full **0err 0warn**.
- Tooltip shot `roi-tipcheck.png` (13 tg-gt, "vùng quan sát"×5 → Vùng quan sát (ROI)) — không mất fact.
- F3 resolved trong r5-reader-a.md; vẫn chờ C ready-hash để rerun FINAL 3 specials ×2 views.

## CANONICAL CLEANUP + R5 FINAL (03:3x)
- own11: 7 v1-fields xóa sau fact-migration (13 dòng mới, `canonical-audit-a.md`); hash update batch-a.md; lint 0/0; QA 272+408 PASS.
- R5 FINAL reader trên C-ready hash: `r5-reader-a.md` §F — mọi flag closed, 16 shots final-* ×2views, N2/N14 panel đúng, journey 0/4/9 active+caption+HUD ok, glossary filter+fold ok. Readonly C.
- Còn: chờ C own3 cleanup + B canonical; A freeze-ready.

## CTOR CROSSCHECK (03:4x) — B↔C resolved
- `ctor-crosscheck-a.md`: tc:2227 CrossCameraManager (tracklet_gallery_size=24 @2248) · tc:2366 MotionVehicleTracker (tracklet 12/3 @2387-88). **B §6 ĐÚNG, C SAI** (đảo ctor).
- ROI ownership docs: "C-file" → **A-owned metadata** trong batch-a.md + checkpoint + r5-reader §4 (web-ROI không đổi).

## ★ ALLFREEZE — A FINAL (per LEAD)
- own11 FREEZE: content hashes = canonical-audit-a.md §3 + batch-a.md freeze table (đã verify re-hash khớp).
- QA cuối trên frozen files: `_qa_r3_a` 272/272 · `_qa_r4_a` 408/408 · lint 0/0 full-24 · 0 errors.
- ROI.js = A-owned metadata `e5490866…` (LEAD-approved fix; web/copy/canvas/numbers nguyên).
- R5 FINAL pass trên C hash (r5-reader-a §F); ctor crosscheck nộp (`ctor-crosscheck-a.md` — B đúng).
- **NO further product edits.** A IDLE READY — chờ C QA flag → owner-fix nếu LEAD giao.

## FONT-LAYOUT READER — PREPARED (chờ C font hash)
- `_font_layout_a.mjs` READY (file://, selectors verify khớp source C).
- Smoke-run baseline pre-font: 14 route-views · 0 err · 0 flags; 28 shots `qa/shots/font-layout-a/` + 14 dump `fl-*.json` (signature baseline để diff ROI-words post-font).
- Report `font-layout-reader-a.md` §F pending — RUN khi C báo font-ready hash.
- Product vẫn HOLD: không edit CSS/content/B/C.

## FONT-LAYOUT READER — FINAL PASS (app.css d0c05532)
- Run `_font_layout_a.mjs` trên hash refreeze: 14 route-views · 0 err · 0 flags (không clip/overflow/offscreen).
- ROI signature post-font ≡ baseline; canvas geometry nguyên. Steps/tabs/HUD/pcode/fold/Map-N2/N14/Journey-s4,9/Glossary-filter đều sạch 2 view.
- `font-layout-reader-a.md` §F = PASS 0 blocker. **A HOLD IDLE.**
