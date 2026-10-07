# Builder B — checkpoint Phase 1 + W1 + W2 (algos-v2)

## Status: W2 DONE — 9/9 pages built + probe sạch (0 console-err, 0 ext-req) — chờ C integrate + LEAD duyệt

### W2 — trạng thái hiện tại (context-compact recovery point)
- **Pages done**: T1 reid·handoff ✔ · T2 homography·trajectory·dormant ✔ · T3 gid-conflict·gate·session·snapshot ✔ — 18 files (content+page).
- **Probe cuối (9×2 viewport)**: consoleErrors=[], badReqs=[], four=4, hud 7-9, pc sync, deep ✓, steps 0→mid→final đúng.
- **Shots**: `qa/shots/b/<id>-{1280x720,1440x900}-{initial,mid,final}.png` đủ 54 ảnh.
- **Report**: `build-wave2-b.md` — bảng acceptance 9 pages + fix-log + file list C.
- **LEAD review-fix đã áp + verify**:
  - handoff: map 60×60cm cm-space, ring 25cm polygon trong panel, A11>B9 đúng, gates table box riêng.
  - homography: typo 41.8/41.5 → **11.8/11.5** thống-nhất.
  - trajectory: FRAG sát endB (0.057≪0.277 — nearest=B thật) nhưng trùng corridor A → OFF nhầm B / ON vote A.
  - dormant: predicate đúng chiều `signed_distance < −0.85·diag ∧ overlap=0 ∧ ¬ev → reject` (svb:2980-2992, pointPolygonTest −=ngoài); 2 đồng-hồ riêng `dormant ~57s/60s` ≠ `token ~2s/5.0s`, scene ~3s; wakeup ×1.90 `(minh họa)`.
  - gid-conflict: kim 11cm nhãn lệch phải tránh chồng evidence-text.
  - certainty `"cao [code]"` ngắn gọn mọi content.
- **LEAD B9 fix (đã re-probe sạch)**:
  - gid-conflict: canonical=min → cite **ccm:1259** (`_merge_global_ids`), :3088 chỉ là guard; bounds 2×/3×+evidence → **cross-cam resolver :3226-3374** (:3278-3299/:3306-3312/:3314-3347); same-cam :3125-3224 owner_rank; member giữ GID theo rank không min(GID).
  - snapshot: payload box schema v2 (fields thật rc:95-167); "30fps" → "loop ~30fps (minh họa)".
  - gate: caption step1 "thử chiều RA trên ENTRY — cross<0 reject".
- **LEAD B10 fix**: gid-conflict pcode/caption tách hẳn nhánh — scene = member_rank detach (kept=argmin app→bind→vis→cam,local ccm:3314-3347, loser pop+discard ccm:3348-3355, giữ nguyên G#5); min(GID) chỉ trong Deep/QA "nhánh khác". Re-probe sạch.
- **W3 DONE**: `js/pipeline/glossary.js` (55 terms ÷ 6 nhóm + filter — probe `qa/_probe_glossary_b.js` sạch, shots `qa/shots/b/glossary-*.png`) + `README.md` (file:// + `python -m http.server 8080 --directory`, routes/đọc-trang/nhãn/structure, không ghi approval). Report `build-wave3-b.md`.
- **Peer Ensemble A** → `peer-a-web-by-b.md`: **PASS 10/10, N1-N3 ĐÃ ĐÓNG** (re-check bản mới content 7,972B/pages 13,957B mtime 21:16 — rescue 2-đường-OR + chỉ-rõ central_blob minh-họa, stable_evidence→dwell skip trong limits pd:613-615, exit_ratio_thr ref đúng tc:2273 ctor).
- **Async-contract audit (CONTRACT :62 — onStep(0) qua rAF, KHÔNG sync)**: 9 pages B đều đúng — `onStep: s=>render(s)` đọc step từ arg (không đọc `player.step` trong onStep); `d.onResize = render(player.step)` đúng mẫu contract :71; không `render(0)` sync sau create; consts/EXPL khai-báo sau `create()` an-toàn vì mount() chạy hết trước frame 0 (contract xác nhận); `destroy()` = `player.destroy()+d.destroy()+pc.destroy()+innerHTML=""` → cancel rAF khi đổi route lúc play. Probe `_probe_b.js` đã wait 120-400ms sau mỗi điều-hướng/scrub trước assert → async-tolerant.
- **LEAD W3-review fix (đã re-probe sạch — 56 terms)**: anchor refs đúng chiều (runtime bbox_center ← config/two_camera.shared_cm_01.json:1461, class-default bottom_center ← ccm:168); tách `motion echo` (detection mt:1088-1134) / `ROI-edge twin` (track, BOTH roi_clipped mt:1501-1595); refs đổi shorthand→tên-file thật; README pipeline đúng thứ-tự coordinator (identity/GID trước binder, N2 worker async), ~45→56, "Tại sao dùng", "BẬT=mô phỏng hành-vi", QA.md→root. peer report: onStep(0)→rAF.
- **Chờ**: C integrate 18 script tags → mount thật; LEAD duyệt shots/report; A đóng 3 ensemble notes (N1-N3) → B re-check latest sau fix.
- **Next nếu có review mới**: sửa trong file own rồi re-probe.
- **Contract API nhắc** (đã verify ui.js:3-6,86,197-206): content shape = `{id,title,tier,nodes,problem,does,role,where,why,steps,sourceRefs,realParams,storyboard,qa,certainty,limits?}`; realParams item `{name,value,unit,scope,ref|refs[]}`; `mount→{destroy}`; `fourBlocks` đúng 1 lần qua `sc.below.insertBefore(fb, sc.below.firstChild)`; `player.create` → onStep(0) qua **rAF không sync** (CONTRACT :62); render dùng arg `step`; `d.onResize`; `pc.forStep(step)`; stage `minHeight` set qua `sc.stage.style`.
- **QA probe**: `algo-web-v2/qa/_probe_b.js` inject qua addScriptTag (không sửa index của C); chạy `node qa/_probe_b.js [ids…]` từ thư mục `algo-web-v2/qa/`; shots `qa/shots/b/<id>-<vp>-{initial,mid,final}.png`; viewports 1280×720+1440×900.

### W2 (build pages — CONTRACT.md v1 đã đọc)
- Contract: `TG.registerContent` + `TG.registerPage{mount→{destroy}}`; `TG.ui.fourBlocks` **đúng 1 lần** → `sc.below.insertBefore(fb, firstChild)`; `player.create` 1 clock/seed; `draw.attach` + `d.onResize`; `pc.forStep(step)` sync.
- QA: `qa/_probe_b.js` (B-owned) — inject scripts qua addScriptTag (index C sở hữu, không sửa), `TG.router.go` mount. Shots `qa/shots/b/<id>-<vp>-{initial,mid,final}.png`.
- **T1**: `reid` — gallery strip 12→24, gauge 0.21 vs 0.45, OFF/ON cùng cảnh, deep-reid=cấm. `handoff` — map 60×60cm thật, điểm hẹn 25cm ring-polygon, gates A/B/C (B 0.83 reject trước cost), cost bars, margin 0.267, streak → G#5.
- **T2**: `homography` (8 cặp điểm→matrix→map), `trajectory` (trail/velocity/curvature + score 6-comp 0.35/0.25/0.15/0.10/0.10/0.05 → ≥0.78 → LAPJV 0.22), `dormant` (retention 60s/×4 + token 5s expand 0.85; ring VÀNG wakeup ≠ ring ĐỎ signed-gate −0.85·diag).
- **LEAD note trajectory**: score thật `0.35/0.25/0.15/0.10/0.10/0.05` (tm:395-402, 6 components :412-421), caller `cost=1−score` cap 0.22 margin 0.12 (ccm:6024,:6093-6096,:6115-6131); bỏ "0.6/0.4" và "0.35/0.35/0.30" sai-nguồn; match_departure radial-gain tm:503-509. Đã sửa dataset+content.
- **File list gửi C**: T1×4 files xong; sẽ gửi đủ 18 files khi T3 xong (C sole-index).

### W1 (datasets — giữ nguyên làm nguồn content)

### W1 (mới nhất — content datasets)
- Đọc `algo-web-v2/{SPEC,REVIEW-CHECKLIST,PROGRESS}.md`; **CONTRACT.md chưa tồn-tại** → ghi datasets vào `.analysis/algos-v2/content-b/` đúng field names SPEC §4, JSON-serializable.
- 9 files: `reid, handoff, homography, trajectory, dormant, gid-conflict` (dossier B) + `gate, session, snapshot` (dossier C T3-1/2/3, peer-PASS).
- Chốt-values áp dụng: median **9.267515182495117** → resolved **15/25/16.218/4.634**; expand runtime **0.85**; app **0.83 reject trước cost**; conflict **11cm** trong **9.268–13.902**; QR120s visibility-only; CLOSED filter-only; delete=xoá; frame_index=minh-hoạ.
- OFF/ON cùng-seed mọi thẻ (reid 4f / handoff 6f / conflict 5f / gate 4f / session 5f / snapshot 5f).
- Report: `.analysis/algos-v2/build-wave1-b.md`.
- **Tiếp-theo khi contract ra**: wrap mỗi JSON → `js/content/<id>.js` (adapter theo registry C định-nghĩa); sau-đó `js/pages/` khi LEAD giao W2.

### Phase 1 (đã duyệt)

### Đã hoàn thành
- Đọc đủ MEGAPLAN §3/§4/§6 + checklist; archive dossier-cũ → `builder-b.pre-megaplan.md`.
- `builder-b.md`: 6 thẻ đúng mẫu §4 — T1×2 (ReID histogram; handoff), T2×3 (homography; trajectory; dormant+token), T3×1 (conflict/merge/probation).
- Peer-review A → `peer-a-by-b-megaplan.md`: T1×5 reviewed, T2×5 PENDING; FAIL T1-5 (toán 0.55+0.25), FAIL-major T1-4 (`_create_or_reid` mint ID mới), FAIL-mild T1-1 (×2 sai — thật 1.10–2.70); 21 tham số verified.

### Vòng 3 (phối hợp C — số liệu median/resolved exact)
- Chạy replicate `median_slot_length` (tc:395-412) trên config **sha256:ec759c558c3ccfeb / 40,608B** bằng venv backend: `groups 2×30 = 60 slots; median = 9.267515182495117 cm` → derived `round(·,3)`: 16.218/25.486/16.218/4.634 → resolved **15.0 / 25.0 / 16.218 / 4.634 cm**. Số C (9.202/16.1/4.6) lệch — routine đúng = `minAreaRect`→long-edge→median trên `parking_slots_world`.
- Chuẩn hóa toàn bộ giá trị trong dossier: 4.63→**4.634**, bounds conflict 9.27/13.90→**9.268/13.902**, dormant 16.22→**16.218**.
- Thêm mục "Wakeup-polygon vs signed-gate" thẻ 5: wakeup = `_expanded_polygon(1+2·ratio)` chỉ đánh thức detector (svb:2658-2668, comment :2665-2666); gate thật = `_signed_polygon_distance` vs `−max_radius=−0.85·diag` + overlap=0 + no-evidence → reject (svb:2875-2876, :2980-2992).

### Vòng 2 (LEAD re-review)
- Chuẩn hóa nốt `~line`: svb:~230→**svb:225** (retention 5.0), tc:~1896→**tc:1890-1897** (CLI 0.85), ccm:~7477→**ccm:7485-7486**, ccm:~2970→**ccm:2990** (`return None,"appearance"`).
- Tranh chấp `recovery_max_expand_ratio`: **runtime = 0.85** — CLI default tc:1890-1897 → ctor callsite tc:2331; class 0.45 (svb:228) chỉ là fallback. Chuỗi: `_token_radius` svb:603-609 → `recovery_priority_regions` svb:2663-2668 → `_expanded_polygon` svb:2653-2656 → dilation **1.10→2.70**. A's fix-summary F3 ghi ngược ("0.45, B sai") — bằng chứng giao C phân xử.
- Peer-review A v2: `peer-a-by-b-megaplan.md` — bản A hiện tại 397d/56,965B/18:25 có đủ 10 thẻ. **PASS 10/10** (F1-F7 đều fixed); 3 minor mới: N1 `_BRIGHTNESS_SAMPLE_TARGET`=lưới ~128/chiều không phải "128 mẫu"; N2 twin-gap `max(12, 0.15·extent)`+both-`roi_clipped`+winner-cite mt:1492-1499; N3 `priority_observation_count≥2`. Trace thêm: `_is_confirmable` mt:2071-2094, `suspend_track` mt:2175-2187, shadow mt:633-726/768-789, twins mt:1488-1595, og.py 232 dòng.

### Blocker LEAD — đã sửa trong `builder-b.md`
1. **Conflict K3**: bounds thật 9.27/13.90cm (dup 4.63cm); ví dụ mơ-hồ = 11cm; thêm OFF/ON 4 khung cùng cảnh + hệ-quả.
2. **Handoff xe B**: appearance 0.83 → reject `"appearance"` tại gate (trước cost/LAPJV) — ccm:~2970; competition giữ qua candidate C 0.40→cost 0.591.
3. **Verify trực tiếp tất cả `~line`/chưa-đối-chiếu**: strong_spatial 4.63cm (ccm:226-229); quality td:85-91+mt:427; new_identity 5/12/0.15 (ccm:163-165, tc:1980-1995); traj ctor tm:56-68; load_calibration tc:284-341; deep_reid bị cấm ccm:388-397; resolved 15/25/16.22/4.63cm với file:dòng (tc:387-447, :2154-2190, cfg:134/1461/1463-1468; median 9.27cm đo 60-ô).
4. **Thu gọn + "Tham số (deep)" tách riêng**; nhãn `[code]`/`[suy luận]`/`[chưa xác minh]` nhất-quán.

### Verified-đúng (bằng-chứng đọc)
- ctor ccm:145-188; `_candidate_cost` gates+cost :2831-3017; `_predicted_world` :2744; `_entry_depth` :2776; `_direction_cosine` :2823; lapjv 0.92 :3615/margin 0.08 :3622/streak 1-2-3 :3658; dormant lapjv 0.95 :5526; world-traj 0.22 :6115; `observe_trajectories` fresh-only :1457; `_dormant_reid_ready` ≥3f :2419; `_reid_window` :4357; retention ×4/×2/parked-exempt :4636-4691; reachable margin+1.5·speed :4707-4711; `_cross_merge_would_conflict` :3088; `_bound_handoff_merge_allowed` :3376; `_reconcile_dormant_duplicates` :6854+; `match_departure` rejects tm:501-508; update_all_tracks order ~:7105-7492.

### Còn mở (không block)
- `parking_recovery_trajectory_evidence` :1536-1595 chi-tiết competing-reservation.
- `_reconcile_dormant_duplicates` :6854+ body đầy-đủ.
- `update_all_tracks` tail dòng-chính-xác từng-call.

### Chờ
- LEAD re-check 4 blocker → OK thì sẵn-sàng SPEC.
- C cross-verify ≥3 params (đã dọn sẵn bằng-chứng file:dòng).

## QA ref-format audit (LEAD support, readonly) — 2026-10-04
- Root cause: smoke.mjs `+x.line` -> NaN/0 -> dedupe `file:NaN` -> skipped (khong phai missing; INVALID=0).
- 29 skips = 9 pages B, khop tung file: gate ok=0 do alias `gate:` khong thuoc ALIAS(gsc) + all-structured non-numeric.
- Deliverable .analysis/algos-v2/qa-ref-format-b.md: full canonical file:line map + 4 khuyen-nghi cho C verifier. Khong sua code/web/QA.

## Citation fixes (LEAD) — 2026-10-04
- gate.js:26 gate_zones.json line:"" -> "16,28" (direction pos/neg :16/:28).
- session.js:34 sm atomicity line:"" -> "31,151,316" (_STORE_LOCK/revision/_mutate_session).
- snapshot.js x3: frontend/src/App.tsx -> frontend/src/app/App.tsx (path sai, truoc chi resolve nho basename fallback).
- Appendix §6 qa-ref-format-b.md: path/line/mtime evidence. Range/multiloc giu nguyen.

## QA reduced-motion manual-dead — independent repro (LEAD)
- Verdict: harness artifact. Focus ket tren #btn-fullscreen sau click (smoke:462) + goto same-URL = same-doc (khong remount) -> ArrowRight target=BUTTON bi player.js:118-119 guard nuot.
- Repro _qa_reduced_b.mjs: body-focus arrow OK 0->1 duoi reduce; button-focus arrow dead 1->1; click next/scrub/blur+arrow deu OK. Player khong gate reduce cho manual step.
- Report .analysis/algos-v2/qa-reduced-b.md + blur() suggestion cho C. Khong sua core/web/Cscript.

## READABILITY V3 R2 — B reader role (cho ROI-ready)
- Da doc full PLAN-readability-v3 + style-guide-v3 + roi-source-a/stages-c context.
- Checkpoint .analysis/readability-v3/checkpoint-b.md: checklist fresh-reader day du (vi-tri ROI trong chang4, cam-symbols, <=25 words, band/priority/ROI-filter tach 3 co-che, canvas-khong-misleading).
- CHO LEAD bao ROI-ready -> xem #/algo/roi 2 viewport, paraphrase TRUOC khi mo tab Mã gia/o4/Deep, report reader-roi-b.md + shots. Khong sua files A/C, khong R3-R6.

## R2 DRAFT reader review ROI — xong
- Doc ban nhap roi.js (md5 dbeab8f4dd42, mtime 23:50) file:// 1440/1280, step0-4, chi lop mac-dinh.
- Paraphrase tu chu+hinh: khoanh-vung/loc-nhieu/vanh-do/uu-tien bat-xe; dung chang4 (khong stage rieng); fallback gioi-han ro.
- 7 findings nho (vet/diem-day chua giai-nghia default, xe-moi-noi-may mo-ho, steps-vs-o1 trung, label chong, HUD duoi fold 1280). Canvas khong misleading.
- Report .analysis/readability-v3/reader-roi-b.md + shots-b/. CHO freeze -> retest. Khong sua web, khong R3+.

## R2 LEAD feedback -> cho A freeze
- LEAD xac-nhan canvas band chua chung-minh: s2 xe A/B deu trong vien, khong xe bi cat. A sua actual edge-case + F1-F5/overpromise.
- checkpoint-b.md cap-nhat final-retest criteria: step2 xe bi vien cat thay bang hinh, vet thuan-vanh bi loai tren canvas, F1-F5 xu-ly, hash freeze ghi lai.
- CHO signal, khong sua web, khong R3+.

## R2 FINAL reader pass — ban freeze khop hash
- content 81d237a6..., page 8f4a869d...; file:// 1440+1280 steps0-4, default-only truoc roi mo tooltip/pcode/④/Deep.
- Canvas step2 CHUNG-MINH bang hinh: xe C sat mep hop lan qua vien + nhan "do tron nho vanh" vs "khong vanh: do thieu (khung dut)" + "vat trong vanh X".
- F1-F6 FIXED (vet->vatchuyendong+gloss inline, diem-day->chan-hop tooltip, xe-moi-noi-may bo, ① tach van, caption keo-dinh noi loc-doi, hedge co-the). F7 giu (HUD fold 1280).
- Residual nho: nhan vanh dinh ca step3-4; chen nhe canh phai 1280. KHONG BLOCKER tu B.
- reader-roi-b.md §6 + shots-b/final/. Khong sua web, khong R3, khong danh user-approved.
