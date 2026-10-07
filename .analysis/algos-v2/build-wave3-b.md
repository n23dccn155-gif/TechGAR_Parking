# build-wave3-b.md — W3: glossary.js + README.md (owner B)

**Status: DONE** — 2 files nộp, probe route/console sạch. Trước đó B10 fix (gid-conflict scene-branch) cũng re-probe sạch.

## Deliverables

| File | Nội dung | Verify |
|---|---|---|
| `algo-web-v2/js/pipeline/glossary.js` | 56 thuật-ngữ ÷ 6 nhóm pipeline (Setup / Detection N1-N6 / Tracking N3-N7 / Identity N8-N11 / Ô-đỗ N2,N12 / Session N13-N15) + ô lọc text | probe: 56 `.tg-term` render, filter `dwell`→1, miss→0, crumb "Thuật ngữ" |
| `algo-web-v2/README.md` | Mở file:// hoặc `python -m http.server 8080 --directory`; map/journey/glossary/algo routes; cách-đọc trang (OFF-ON, transport, HUD, pcode, 4-blocks, Deep, QA); nhãn `[code]`/`[suy luận]`/`(minh họa)`; cấu-trúc thư-mục; QA → `QA.md` root (owner C) | static, không install/CDN/build/ES-module; không ghi approval UI |

## Bổ sung corrections9 (LEAD B10 — trước W3)

- **gid-conflict scene-branch**: scene = 1 GID ôm 2 member → `kept=argmin member_rank (app→bind→vis→cam,local)` ccm:3314-3347 + `loser: pop local→global + discard` ccm:3348-3355, **giữ nguyên G#5** — `min(GID)` chỉ còn trong Deep/QA/EXPL gắn nhãn "nhánh khác — scene này không merge" (ccm:1259). HUD/EXPL/rank-tuple đồng-bộ. Re-probe sạch cả 2 viewport; final shot xác-nhận.

## QA evidence — glossary

`node qa/_probe_glossary_b.js` (file mới, B-named; index.html của C đã include glossary.js:85 — không sửa):

```
glossary@1280x720:  terms=56, filterBox=true, filteredDwell=1, filteredMiss=0, crumb="Thuật ngữ"
glossary@1440x900:  terms=56, filterBox=true, filteredDwell=1, filteredMiss=0, crumb="Thuật ngữ"
consoleErrors=[]  badReqs=[]
```

Shots: `qa/shots/b/glossary-1280x720.png` + `glossary-1440x900.png` (đã xem — nhóm header rõ, refs hiển-thị).

Route check: `index.html#/glossary` → `TG.getPage("__glossary")` mount trực-tiếp (router.js:67-73) — không cần inject.

## Nguồn cho glossary

Chỉ tổng-hợp dossier đã duyệt + fix-log: builder-a (detection/tracking), builder-b (identity/handoff/dormant/gate/session/snapshot), builder-c (ensemble/binder/episode). Tham-số kèm `file:dòng`: `0.85 runtime (tc:1890-1897→2331)`, `9.268/13.902 (ccm:3278-3279)`, `member_rank (ccm:3314-3347)`, `canonical min chỉ-merge (ccm:1259)`, `25//2=12 (pd:533)`, `dwell 2·0.5s / 3·1.0s (pd:636-639)`, `publish 5fps (tc:1802,:2817)`, `QR 120s visibility (sm:29,81-88)`, `recovered 2 mẫu ≤1.0s (gate:259-309)`…

## Corrections LEAD W3-review (đã áp + re-probe sạch)

1. **anchor term — refs ngược** (đã verify source): runtime `bbox_center` ← `config/two_camera.shared_cm_01.json:1461` (calibration JSON, dòng đúng file prod-config); class-default `bottom_center` ← signature `cross_camera_manager.py:168`. Trước ghi đảo ngược — đã sửa.
2. **echo/ROI-edge twin — tách 2 cơ-chế**: `motion echo (detection)` = `_suppress_duplicate_detections` hist+size+dist+gap, bảo-vệ chủ-sạch (motion_tracker.py:1088-1134) ở nhóm Detection; `ROI-edge twin (track)` = BOTH `roi_clipped` + IoU≥0.90 + gap≤max(12px,0.15·extent) + ≥1 tentative/invisible ở nhóm Tracking/_assign (motion_tracker.py:1501-1595, gate :1523-1560) — gate `roi_clipped` chỉ thuộc nhánh track. Đúng dossier A T2-3.
3. **File refs → tên thật**: mọi shorthand (ccm/tc/mt/svb/pd/sm/gate/cfg) đổi thành `cross_camera_manager.py` / `two_camera.py` / `motion_tracker.py` / `slot_vehicle_binder.py` / `parking_detector.py` / `session_manager.py` / `gate_session_controller.py` / `config/two_camera.shared_cm_01.json` — không còn viết-tắt không giải-thích.
4. **README pipeline order**: đổi `frame→detection→track→slot occupancy→identity/session` → `frame→detect/track→identity (handoff/GID)→slot occupancy→session` theo `pipeline-order.md` (N9-N11 trước N12 binder); ghi rõ worker N2 song-song async.
5. **README nhỏ**: glossary ~45→**56**; `Tại sao đúng`→`Tại sao dùng` (khớp ui.js:57); `BẬT = pipeline thật`→`mô phỏng hành-vi của code (không runtime thật trong browser)`; `qa/QA.md`→`QA.md` root (C viết — B không tạo).
6. **peer-a-web-by-b.md**: `onStep(0) sync` → `onStep(0) qua rAF (CONTRACT :62)` — khớp contract mới.

## Peer-review Ensemble A → `.analysis/algos-v2/peer-a-web-by-b.md`

- **PASS** — 6 nhóm params verify trực-tiếp source (vote 12, exit⊆empty, rescue 0.80/conditions, dwell/count, bypass, placeholder) + 3 kịch-bản math khớp.
- 3 minor không-chặn: N1 rescue có 2 đường OR (page chỉ vẽ central_blob); N2 `stable_evidence` điều-khiển cả smoother lẫn dwell-branch (legacy skip dwell); N3 `exit_ratio_thr` ref nên là tc:2273 (ctor), không phải tc:2320 (block enter-ratio).

## Ownership

- B chỉ viết: `js/pipeline/glossary.js`, `README.md`, `qa/_probe_glossary_b.js`, analysis B files.
- Không đụng: index.html, manifest.js, CSS, core, journey, map (C), trang A/C khác.
