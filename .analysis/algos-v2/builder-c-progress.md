# builder-c progress (Phase 1 — MEGAPLAN)

**Status: IN_PROGRESS** · cập nhật: đủ 7 thẻ C + pipeline-order

## Completed
- [x] MEGAPLAN đọc đủ 262 dòng (xác nhận :250-262)
- [x] `pipeline-order.md` DONE — N0–N15 theo `two_camera.py:run` + module;
      J1 sửa đúng source (physical crossing trước GID-publish; session
      luôn gắn GID qua `recent_observed_path` recovery); N12 row đồng bộ
      `vision_primary` (occupied=vision-only, track chỉ gán vehicle_id)
- [x] `builder-c.md` — đủ 7 thẻ §3:
  T1-1 ensemble (vote 25//2=12; edge_recheck TẮT prod; TemporalSmoother
  bypass — ổn định thật = accept_evidence dwell+count);
  T1-2 binder vision_primary fusion/claim/stationary/token;
  T2 polygon geometry (pointPolygonTest signed, intersectConvexConvex);
  T3-1 gate crossing direction + recovered path;
  T3-2 session FSM (QR120s = kiosk visibility; claim không check expiry);
  T3-3 snapshot contract 8001→8000→frontend (mailbox latest-only :106-113);
  T3-4 A* (one-way/two-way adjacency; off-route callsite 80 vs default 75)

- [x] `fix-summary-megaplan-c.md` — đóng 5 blocker LEAD: T2 storyboard
  OFF/ON cùng số + anchor phân biệt (bbox-center vs `_bottom_center`) +
  lõm=[chưa verify]; T3-1 gate không hứa lag/jitter quá mức (≤1.0s
  source-time :302-306); T3-3 timeline nhân quả + contract
  `runtime_contract.py` đầy đủ; T3-2 `"CLOSED"` chỉ read-filter; T3-4
  reroute mỗi tick (App.tsx:753-774) + heuristic min-ratio không clip.

## Next
- [x] `peer-b-by-c-megaplan.md` §A ARBITRATION recovery-expand: **B đúng**
  — production 0.85 (`two_camera.py:1890-1898`→`:2331`), A cite class
  default 0.45 (`binder.py:228`); scale polygon `1+2×ratio` → runtime
  **1.10→2.70** (`binder.py:2653-2668`); gate thật = signed distance
  ≤`diagonal×ratio` (`:603-609`,`:2875-2876`). Ghi trả A/B.
- [x] `peer-b-by-c-megaplan.md` DONE — **6/6 PASS** trên bản B
  18:29:38 (md5 2107dad3a995): toàn bộ param ưu-tiên verify trực-tiếp
  (median 9.27 ✓ B-đúng — C cũ 9.202 sai do max-edge≠minAreaRect;
  resolved 15/25/16.22/4.63; handoff cost/streak/3-tier appearance;
  dormant 12s/36f qua ratio 0.2; divergence 9.27/13.90 đã-đóng;
  `new_identity_*` đã-wire không-unresolved). 3 mục mở nhỏ B tự-khai.
- [x] C dossier chuẩn-hoá ref `core_scale` → `two_camera.py:2270` (theo
  peer-A) + `strong_ready` → `slot_vehicle_binder.py:2268-2280`.

## Next
- [ ] Chờ A recheck 7 thẻ C đợt-cuối + LEAD chốt SPEC.

## Blockers
- Không.

# W1/W2 build phase (algo-web-v2)

## Done
- [x] **W1 core+shell** — index/css/core{tg,draw,player,pseudocode,ui,router}/
  app/manifest(23 routes)/pipeline{map,journey,glossary} + CONTRACT.md v1
  + 3 page own (polygon/ensemble/binder) + qa/_probe.js; bug core đã fix:
  canvas-clear-on-resize (onResize hook), sync-emit, map setTimeout-sót.
- [x] **W2 core additive** — ctx mở rộng {content,router}+TG.*; draw thêm
  mask/ellipse/path/badge/gauge/grid/d.ctx; fourBlocks descendant-idempotent
  + mount 3 page C; SCOPE `minh_hoa`; ref `excerpt`; player emit qua RAF
  (fix handoff mount — KHÔNG sửa file B).
- [x] **Map rework** — viewBox 1180×600, 2 hàng loop (N3–N7 tuần tự/cam
  tc:2679, N1⊂N5), N2 worker+mailbox, N14/N15 async, publish ~5fps
  (tc:2817+1802 json-fps 5.0) vs gate poll 0.25s, feedback đứt nét.
- [x] **Polygon geometry fix (LEAD)** — scene bất khả thi cũ (Y tâm-ngoài
  ov=0.65 vi phạm tách-tuyến-tính <50%) → scene mới trong không-gian ảo
  1040×640, số đo TÍNH trong page = cv2 chính xác: **X in/0.31 REJECT ·
  Z in/0.74 PASS (score 0.68) · Y out/0.44 REJECT**; clip S–H đã test
  (bug eq/ep đảo điều kiện đã sửa); insight: ô lồi ⇒ nhánh strong 0.60
  không kích khi tâm ngoài [code fact + suy luận]; OFF-trái/ON-phải;
  ảnh qa/shots/c/polygon-{mid,final}-{1440,1280}.png, HUD=caption=số.
- [x] **Tích hợp A/B đủ 23/23** — index.html load hết 23 content +
  23 page (thêm dormant/gate/gid-conflict/session/snapshot + content
  gid-conflict); `_probe.js` quét động toàn bộ route.
- [x] **Binder scene rework (LEAD)** — 2 nguồn riêng trong mỗi panel:
  chip VISION "có xe?" (N2 evidence stable_occupied/ready) + chip
  TRACKER "xe nào?" (GID + qualifies); merge → occupied verdict +
  binding G↔ô + episode; 6 bước: arrival claim → ID swap G7→G9 →
  track drift → departure token @bottom_center + gate-ring (dist ≤
  diag×r) + wake-up 1+2r (≠ gate) → recovery claim; OFF=ID-primary
  flap từng nhịp, ON=vision_primary giữ. policy ref tc:2328.
- [x] **Dossier T2 sửa ví dụ bất khả thi** — builder-c.md storyboard
  thay "Y tâm-ngoài ov=0.65" bằng scene cv2-verified (X .31/Z .74/Y
  .44); fix-summary §1 ghi lý-do-sửa + suy luận hình học nhánh 0.60.
- [x] **fourBlocks auto-mount đúng chỗ** — scaffold chèn grid trước
  `.tg-below` (Deep/QA/refs), idempotent document-level; A/B gọi lại
  vẫn đúng 1 lần trước Deep. Probe: 23/23 `four=4/1 preDeep=true`.
- [x] **Map semantics** — evidence arrow ghi "áp dụng lúc begin_frame"
  (latest-only mailbox, không ngụ ý cuối-frame); publish ~5fps tách
  gate poll 0.25s; bỏ "peer PASS" khỏi header; manifest comment dọn.
- [x] **Player robustness** — emit() guard `dead` (đổi route lúc play
  không callback cũ); destroy cancels RAF + xoá listeners; CONTRACT
  đã ghi async-emit :62.
- [x] **Binder gate sign fix (LEAD review)** — source thật: reject khi
  `signed < −radius` (+trong/−ngoài); inner ramped svb:3241, outer hard
  −max_radius svb:2988,:3237, token-create −0.05·diag svb:508 — sửa
  pseudo/EXPL/label/content/steps/params/limits/qa; peer-b-by-c §A cũng
  cập nhật ref; title OFF/ON hàng riêng (chips không đè).

- [x] **Peer A 5-notes — ĐÃ SỬA HẾT** (build-wave2-c.md §own2 report):
  (1) predicate `sd < −r ∧ ov≤0 ∧ ¬ev`, biên `=−r` GIỮ, +trong/−ngoài;
  (2) arrival `ArrivalClaim` :1109/class :55, bind :1919, gid :1946,
  episode :1953, commit :1263 — dossier builder-c.md :153-162 sửa;
  (3) `:2328`=policy / `:2331`=expand-ratio tách sạch trong file C;
  (4) OFF = pure-ID [minh họa] ≠ legacy (vision∨tracking≥500ms :3852-
  3857); (5) polygon lines :725/:728/:729-731/:739/:701. Shots mới
  12/12 (initial/mid/final × 1440/1280, assert step) qua
  `qa/_shots_c.js`; consoleErrors=[]. Chờ A stamp.

## In progress / blockers
- [ ] ~~Ensemble~~ → **BÀN GIAO A** (BUILD thuộc A): không edit
  content/pages/ensemble.js nữa. Chưa đạt khi bàn giao: 25-vote grid/
  rescue/dwell/count trong scene; dossier nguồn vẫn C (thẻ T1-1).
  A đang edit (verdict badge/dwell timeline/vote grid + rescue chips).
- [ ] ~~Journey~~ → **BÀN GIAO A** (BUILD thuộc A): C dừng edit
  `js/pipeline/journey.js`. Bản A đã viết lại (10 chặng N0→N15,
  registerContent __journey, scene+HUD) — C không edit chồng; không
  có edit dở chưa lưu. Public API (registerPage __journey mount(el,ctx))
  A giữ nguyên → app/router/index không đổi.
- [ ] ~~Glossary + README~~ → **BÀN GIAO B** (BUILD sau khi B xong
  feedback9): C dừng edit `js/pipeline/glossary.js` (giữ làm scaffold)
  và `README.md`. B chỉ được sửa glossary — không đụng shared khác.
- [ ] Verify hình ảnh page A/B mới — probe 23/23 pass (px/four/step
  đều OK), chưa review visual từng trang.
- [ ] C còn giữ: map/index/core/app/CONTRACT/presentation/fullscreen/
  keyboard + `qa/smoke.mjs`/QA.md (full QA chờ owner báo ready —
  23 files đã mount nhưng chưa claim approved).

## Notes cho LEAD
- Ví dụ dossier cũ "Y tâm-ngoài ov=0.65" **bất khả thi hình học** —
  ĐÃ sửa builder-c.md T2 + fix-summary §1; scene site dùng số cv2 thật.
- Player emit qua RAF là thay đổi CONTRACT (async thay sync) — đã ghi
  CONTRACT :62, A/B biết qua fix-summary wave1; không sửa file owner.

## [final-QA checkpoint — smoke sẵn sàng, PASS sạch 2 modes]
- `qa/smoke.mjs`: 23 route động × file+http(8799 ownPID). Checks: px>0,
  four=4/1+preDeep, refs, scene-change, **determinism@N>0** (reset→next×2
  byte-identical), route-change-lúc-play, console/failedReq; global:
  map 16node→6link→route, journey canvas+14 chip→route (kalman),
  glossary 56→10, kb/space/present/Esc/fs.
- PASS gần nhất: 46 routes 0 issues, consoleErrors=[], failedReqs=[]
  (file & http giống nhau). `_shots_final.js`: 60 ảnh home+9T1 ×
  {initial,mid,final} × {1440,1280} vào `qa/shots/final/`.
- `QA.md` viết ở ROOT (MEGAPLAN :85/:214): cách chạy, coverage, kết quả,
  checklist user PENDING, open-items (roi.js:25 wording — flag A).
- Map.js: bỏ RO-rebuild (viewBox đã scale) — fix flaky node-click
  (rebuild wipe panel → links=0). Journey/glossary A/B mới verify qua
  smoke: chip→route OK, 56 terms.
- KHÔNG claim final approve: chờ owner fixes cuối + re-run; user-manual
  checklist pending trong QA.md.

## [FINAL-QA checkpoint 2026-10-04 ~22:10 — PASS sạch 2 modes, log persisted]
- `qa/smoke.mjs` mở-rộng theo §5 LEAD: refs validation đầy-đủ
  (file tồn-tại + MỌI endpoint ≤line-count; range/multi-loc/`+`;
  nguồn = sourceRefs+realParams+DOM textNodes+contentJSON+page-src;
  alias svb/tc/pd/mt/ccm/gsc/sm/rt/rc/app + gate/cfg/tm/td/rs dính-liền),
  controls THẬT (speed4x, play→advance, pause→freeze, prev, reset→0),
  keyboard ←/→/Space, presentation/Esc, fullscreen, reduced-motion
  (api=true, auto=0→0, manual→1), manifest assert 23 {9/9/5}.
- FINAL: `routes=46 issues=0 | refs checked=804 fileOnly=0 skipped=0
  INVALID=0 | consoleErrors=[] failedReqs=[] seriousWarnings=0`
  (refsInvalid=0, netFail=0, consoleWarn=0). Port 8799 sạch (no LISTEN).
  Log → `qa/smoke-final.log`.
- 3 bug CHECKER-side (không phải owner-content, không mask):
  `+x.line` NaN range-strings; `textContent` merge `2668`+`0`→`26680`;
  basename đa-chấm `two_camera.shared_cm_01.json` bị cắt → missing giả.
- reducedMotion `manual→0` trước = harness-bug (focus BUTTON fullscreen
  + same-hash goto không remount → onKey guard skip). Probe độc lập
  xác nhận ArrowRight dưới reduce hoạt-động; fix blur+remount → manual→1.
- ROI open-item ĐÓNG: re-grep file hiện — predicate đúng từ 21:15
  (final-roi-a.md); không sửa file A.
- Shots: **58 PNG** (54 T1 + 4 Home — sửa count sai 60).
- `QA.md` root cập-nhật final (counts, methodology, checklist 5 mục
  §5 MEGAPLAN PENDING). KHÔNG claim approve/block.

## [FINAL-QA bổ-sung ~22:20 — playPixel assert đóng §5(3)]
- LEAD hỏi đúng: check cũ chỉ manual next×2 + step-counter. Đã thêm
  canvas `screenshot()` byte-diff tại **2 mốc auto-advance trong lúc
  play** (poll ≤3s @4×) — `playPixel: routesPlay=46
  canvasDiff@2inPlayMilestones=46 fallback@1inPlay=0`.
- Reduced-motion nâng theo `qa-reduced-b.md` repro: kb BODY→0→1 ∧
  next-button→2 (hai đường điều-khiển dưới reduce). B độc-lập xác-nhận
  root-cause harness (focus #btn-fullscreen + same-hash goto) — không
  product bug; không broaden button/kb design.
- FINAL rerun 2 modes sau mọi fix: routes=46 issues=0, refs 804/0/0/0,
  seriousWarnings=0 — log `qa/smoke-final.log`, QA.md đồng-bộ.

## [CLOSE — LEAD DAT 22:1x] C freeze cùng product/QA. Bàn giao:
`algo-web-v2/QA.md` (root) + `qa/smoke-final.log` (46 runs/0 issues/
804 refs 0-0-0/playPixel 46/46) + `qa/shots/final/` 58 PNG. User-manual
5 mục §5 PENDING. Không còn task mở phía C.
