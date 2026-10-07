# Batch Checkpoint — B · readability-v3 R3/R4 (9 trang)

**Updated:** PRODUCT FROZEN (LEAD) · **Owner:** B · **Mode:** HOLD-IDLE + task mới READ-ONLY
**Task mới:** publish-audit `https://github.com/anqp5002/learn_techGar.git` — chỉ READ-ONLY (remote/branch/auth/repo-metadata/empty?/push-khả-dụng), không commit/push/config. Output `.analysis/readability-v3/publish-audit-b.md`. Nếu auto-compact: đọc file này trước.**
**Nếu auto-compact/restart: ĐỌC FILE NÀY TRƯỚC. own-9 freeze-ready đã LEAD đạt — v1 fields xóa, facts migrated→Deep (canonical-audit-b.md §6), ctor-flag CLOSED (A crosscheck + C retract), reid callsites fix mt:* áp xong. Bảng hash §0 = FINAL cho C FINALsourcecheck. KHÔNG product edits; flag mới → owner xử-lý, B không tự mutate.**

## 0. Trạng thái sau cleanup (hash FINAL)

| route | probe | content hash | page hash |
|---|---|---|---|
| reid | 47/47 | `9e1d33fd12` | `cd2ccd90c4` |
| handoff | 47/47 | `eaddad418f` | `74480cfd70` |
| homography | 41/41 | `44b953f310` | `f35add3871` |
| trajectory | 47/47 | `dd377480b0` | `7824e0f1d1` |
| dormant | 41/41 | `269ef72adc` | `ed1d2f58f3` |
| gid-conflict | 41/41 | `1e5200aae1` | `6e450280fa` |
| gate | 35/35 | `c7aabe9400` | `f8b007b805` |
| session | 41/41 | `445a17fe25` | `2ca863bd1d` |
| snapshot | 41/41 | `0434ad4d72` | `5ce846cc71` |

Lint `0 err/0 warn · v3=24`. C-flag ctor-labels reid: **CLOSED** — A crosscheck xác-nhận B đúng (`tc:2227` manager / `tc:2366` tracker), C retract. C §6 fix áp: callsites tc→`motion_tracker.py`. Flag-name audit: `--tracklet-max-samples 12`/`--tracklet-sample-interval 3`/`--global-gallery-max-samples 24` đúng tc:1965-1967; content absent (không wrong-name). **B product HOLD.**

**QA delegation — FINAL sau RE-FREEZE:** CSS `d0c05532f91e312b111d3930e076ad3e` verify khớp (css/app.css). `_click_links_b.mjs` file:// @1440: **215 cases · 0 FAIL · 0 errors** → `link-click-b.md`. Coverage: route-nav 75 (74 anchor clicks, 23r) · stepref 79 (validate+scrub, static-ref đúng CONTRACT) · map 41 (17 node + 24 card-link click-through) · journey 15 (14 chips) · glossary 5. Target `#/` = Sơ-đồ source-frame hợp-lệ → assert Map-state (hash + svg + 17 nodes), không disable. **B product HOLD.**

## 1. Scope & ownership

- **Chỉ được sửa:** `js/content/{reid,handoff,homography,trajectory,dormant,gid-conflict,gate,session,snapshot}.js` + `js/pages/{cùng 9 id}.js` + `.analysis/readability-v3/{batch-*,checkpoint-b,reader-*,cross-reader-b,sourcecheck-b,_qa_*_b.*,shots-b/}`.
- **KHÔNG đụng:** A files (motion/kalman/coasting/assignment/ensemble/...), C core/index/manifest/**glossary**/QA scripts (glossary v3 R5 giờ C owns — chỉ báo alias cần thêm), backend/frontend, `algo-web` cũ.
- `batch-b.md` status = **ĐANG SỬA — chưa LEAD duyệt** (giữ nguyên cho tới khi LEAD nói).

## 2. State 9 route (status: chưa/đang/sourcechecked/code/QA/reader/freeze)

| route | status | lint | probe | hash content (post-fix) |
|---|---|---|---|---|
| reid | QA-done, đã áp C-sourcecheck, chưa freeze | 0w | 47/47 | `6efc3b590da74506322ce82cf1febe21` |
| handoff | QA-done, đã áp C-sourcecheck, chưa freeze | 0w | 47/47 | `04e5f342985e940e9a1e88b911c45205` |
| homography | QA-done, chưa C-sourcecheck | 0w | 41/41 | — (đo lúc freeze) |
| trajectory | QA-done + áp 3 fix LEAD + scope ctor-literal (ccm:381-382, callsite 0.22:6117) | 0w | 47/47 | c670631c0a3/p7824e0f1d1 |
| dormant | QA-done | 0w | 41/41 | — (đo lúc freeze) |
| gid-conflict | QA-done + glossRef episode | 0w | 41/41 | caa808e30e7/p6e450280fa |
| gate | QA-done + fix LEAD s3 (OFF verdict theo scene, HUD đồng-bộ) | 0e/0w | 35/35 | c29093ece68f2/pf8b007b805b2 |
| session | QA-done + fix LEAD (bỏ 'quirk code thật' + OFF-trái/ON-phải panel-swap) | 0e/0w | 41/41 | cf4629eaadb53/p2ca863bd1d |
| snapshot | QA-done + fix LEAD panel-swap + glossRef snapshot | 0e/0w | 41/41 | c6207950958/p5ce846cc71 |

**Tất cả 9 route B = QA-done.** Global lint 0e/0w, v3=24/24, legacy_PENDING=0. Cross-review A đủ 10 route → `cross-reader-b.md` phần B (0 BLOCKER; flag: echo/routing wording, coasting 2 ref-Deep sai tc:1806·mt:278, kalman before→#/).

**LEAD wave2 xác-nhận:** gate/session/snapshot post-fix không BLOCKER; A verify độc-lập QR120 visibility-only + late-claim không check TTL + exit→xóa, mailbox 5Hz + stale>5s. Đang chốt `batch-b.md` (status 9/9, QA post-fix, ≥3 fact/route + scope runtime/class/derived/demo, hash 18 file, ảnh final). Chưa final full QA — C consumer audit + cleanup canonical là bước sau.

Global lint `node qa/lint-readability.mjs` = **0 err / 7 warn** — 7 warn toàn file A (glossary C đổi display-terms → glossRefs miss); B-routes đã vá (gid-conflict +episode, snapshot +snapshot).

### LEAD feedback pending (đã ghi-nhận, chưa đóng)
- C sẽ check Deep 2 route (reid/handoff) sau B freeze → chờ báo hash cuối.
- Assignment MINOR "vết nhạy" plain-VI — **thuộc A sửa**, B chỉ flag trong cross-reader-b.md.
- Kalman MINOR before→`#/` — thuộc A.

### trajectory facts mới (fresh-verify, sửa dossier sai — C nên soi)
- `tm:58` `history_seconds=2.0` **signature = runtime** (tc:1969-1971 `--trajectory-history-seconds` default 2.0) — dossier ghi "3.0 sig" là SAI.
- `tm:62,68` `max_samples=240` (floor max(16,·)) — dossier "≤16 điểm" SAI; **không có spacing ≥2cm nào trong file** — dedupe theo (frame,cam,track) `tm:79-97`, cắt cửa sổ 2.0s.
- `tm:395-402` weights 0.35/0.25/0.15/0.10/0.10/0.05 ✓ · `tm:387-393` rejects teleport/topo/stable_wrong_dir ✓ · `tm:503-509` departure radial_gain≤0→stable_not_leaving ✓ · caller `ccm:6024-6027` reject<0.78, `ccm:6093-6096` cost=1−score, `ccm:6115-6117` lapjv 0.22, `ccm:6131` margin 0.12, `ccm:379-384` wiring min_obs=3/thr=0.78/margin=0.12 ✓ · observe `ccm:1442-1510` chỉ `_has_fresh_detection` ✓.

## 3. TRUTH MATRIX — source facts ĐÃ verify 2 chiều (B + C độc lập, giữ nguyên, đừng verify lại)

**Nguồn:** `.analysis/readability-v3/batch-sourcecheck-b-c.md` (C nộp) + B spot-check.

### ReID
- `td:81-91` = **`compute_sample_quality`** (KHÔNG phải `_sample_is_usable`): `min_area=200`, `min_foreground_ratio=0.15`, docstring reject `<0.5`. Không có 120px²/0.38 đâu trong file.
- Quality-gate callsite: `mt:427-429` (score<0.5→reject trước khi vào kho — KHÔNG phải ctor).
- `td:277` = `merge_appearance_samples` (gallery max 24) — KHÔNG phải chỗ DeepReID reject.
- DeepReID reject: **`ccm:391-395`** ValueError trong ctor manager (comment :388-390).
- `td:308-345` `compare_tracklets` — w 0.50 nearest + 0.20/0.20/0.10 (:321-340); `missing_distance=0.25`.
- `ccm:547-587` gallery appearance theo-camera.
- **Gallery sizes: runtime = class = 12/3/24** — `mt:50-51` (tracklet_max_samples=12, interval=3), `ccm:162` (tracklet_gallery_size=24), `tc:1965-1967` (args default giống hệt). **KHÔNG có class default 16/6/32 — không được claim "runtime siết hơn class".**

### Handoff
- `ccm:2572-2636` = **`_upsert_handoff`** (làm tươi pending entry khi xe ra mép ngoài). Hàm `_register_cross_camera_handoff_candidate` KHÔNG tồn tại.
- `ccm:2744-2774` = `_predicted_world` (last_world + vel·elapsed; per-sec vel khi có ts, fallback 25fps).
- `ccm:2776` `_entry_depth` · `ccm:2823` `_direction_cosine`.
- Cổng cứng + cost trong **`_candidate_cost` ccm:2831-3018**: appearance :2934-2990 (hard min(0.45,thr); soft min(0.60,relaxed); adaptive dùng relaxed 0.82), size>0.90 :2997, direction<0.25 :3002, cost `0.55·res/ρ + 0.30·app + 0.10·size + 0.05·dir` ≤0.92 :3017-3018.
- lapjv `extend_cost=True, cost_limit=0.92` :3615; margin 0.08 `:**3623-3624**`.
- Streak `required_evidence` **inline :3663-3673** (không có biến `handoff_confirm_frames`): overlap+strong→2, overlap→3, temporal→2, thường→1.
- `_bound_handoff_merge_allowed` :3376 tồn tại.
- Args (tc): **`--handoff-ttl` 45 :1926** · **`--handoff-appearance-threshold` 0.45 :1928** · **`--handoff-relaxed-appearance-threshold` 0.82 :1930-1932** · `--cross-camera-defer-frames` 8 :1944-1948 · `--handoff-min-direction-cosine` 0.25 :1951 · lookahead 16 :1949 · pred_radius min(25,25.486)=25cm :2170-2176.

### C corrections — ĐÃ ÁP HẾT (content+report đồng-bộ, verify lại 47/47×2)
- `content/reid.js`: why `391-397`→`391-395`; realParams scope → `runtime = class default (mt:50-51)`/`(ccm:162)` + ctor refs `tc:2387-2388`/`tc:2248`.
- `content/handoff.js`: refs `2831-3018`/`2934-2990`/`3017-3018`/`3623-3624`/`3663-3673`; `streak`→`required_evidence`; arg names `--handoff-ttl`/`--handoff-lookahead-frames`/`--cross-camera-defer-frames`/`--handoff-min-direction-cosine`/`--handoff-appearance-threshold`/`--handoff-relaxed-appearance-threshold`(:1930-1932).
- `batch-b.md`: §3 corrected + **§3b bảng C-claim→fix**; STATUS đang-sửa.
- Hash post-fix: content/reid.js `6efc3b590da74506322ce82cf1febe21` · content/handoff.js `04e5f342985e940e9a1e88b911c45205`.
- Lint repo hiện-tại: 1 err(`binder` — C file) + 17 warn(`binder`/`shadow` — không phải B). B-routes 0w.

## 4. Position mapping — BẢNG CHUẨN C (`batch-position-c.md`, đã áp cho 3 route migrated)

reid/handoff/gid-conflict: chặng10, before=dormant, after=binder, links nhau "cùng chặng" · trajectory: chặng8–9, before=dormant, after=handoff · dormant: chặng7, before=track-lifecycle, after=binder · homography: "Cài đặt một lần", before=no-href, after=trajectory · gate/session: nhánh async (gate: before=snapshot "nguồn dữ liệu", after=session "cùng nhánh"; session ngược lại + after=routing) · snapshot: **chặng12** (đã sửa từ 11), before=binder, after=no-href "nhánh async cổng·phiên·điều hướng".

## 5. Cross-review A — ✅ ĐÃ NỘP `cross-reader-b.md`

**0 BLOCKER, 3 MINOR** (motion summary "hai lớp" đọc-vội→AND-mốc; kalman before→`#/` Map link; assignment "vết nhạy" lý-do chỉ ở Deep). Verified trực-tiếp: motion OR-mốc mt:553-560 + AND-lớp :792-793 ✓; kalman predict :2228<detect :2233 ✓; coasting lerp :278 + TTL 4.5s :149 + OFF xóa-ngay=hệ-quả thật ✓; assignment defer chỉ-vết-nhạy :1685-1686 ✓. Caption↔canvas khớp cả 4. Hash ảnh trong report §6.

## 6. Việc còn lại (thứ tự)

1. ~~9 route migrate + QA~~ ✅ xong hết (batch-b.md §11 chốt, hash 18 file).
2. ~~homography/trajectory source-fix (LEAD reject)~~ ✅ — rl_calib:42-131 + tc:287-322; ctor-literal ccm:381-382/6117.
3. ~~`canonical-audit-b.md`~~ ✅ nộp — dead-on-v3: `problem/does/role/where/why/steps[]/nodes` (consumer duy-nhất `ui.js` v1-path + fourBlocks, v3 return sớm). GIỮ: id/title/tier/certainty/sourceRefs/realParams/limits/qa/v3. C FINAL-verify trước cleanup.
4. ~~Recheck A wave-B3~~ ✅ `cross-reader-b.md` §C — 5/5 flag đóng (coasting tc:1806+mt:278 verify thật; track-lifecycle đồng-bộ; echo/routing/kalman text-fix đúng). Hash content mới ghi §C2 (4 file đổi vs batch-a do glossRefs 03:09).
5. Sau freeze: báo hash để C check Deep 2 route (reid/handoff).

## 7. Bài học giữ nguyên

Canvas chứng-minh bằng hình; hedge "có thể"; default VI ≤6 từ ≥13px không jargon (`local#`,`dist=`,alias hàm → ④/Deep); recovery≠identification; appearance ≠ quyết định một-mình (reid đã sửa); gates hiển-thị qualitative không công-thức (handoff đã sửa); position cùng-chặng không xếp before/after; OFF/ON đánh dấu minh-họa/đối-chứng.

## § Publish audit (task mới — READ-ONLY)

- `publish-audit-b.md` nộp → LEAD review → sửa: visibility **chưa xác-minh** (404 không chứng-minh private); zero-overwrite dựa remote rỗng *tại thời-điểm audit* (re-check ls-remote trước push nếu xen-kẽ); read-access ≠ write-scope giữ nguyên.
- Phân-vai: staging/commit/push = **C** (HOLD trước push); **A/B không push**; B chờ giao kiểm-độc-lập package (manifest/refs/hash). Không tự auth/login/approve.

## § Publish cross-review B (READ-ONLY)

- Task: review `.publish/learn_techGar` — filecount/hash59+src22/routes+refs/manifest-scan/.analysis-links. Output `publish-review-b.md` (PASS/flags + commit SHA). Remote re-verify 0 refs.
- C package đang thêm .analysis docs → review sơ-bộ, chốt sau package-final. Không commit/push/auth/config/product-change.
- `publish-review-b.md` nộp: 913/913 byte-identical (802 code/web/qa + 111 analysis), 133/133 refs resolve+in-bounds, secrets benign (pattern-docs/import-stdlib/rtsp-help/IP-flag-C), remote re-verify **0 refs**. Flags: F1 shots-b/final dir-link missing · F2 staging chưa có .git riêng · F3 commit-SHA pending. PASS sơ-bộ.
- `publish-review-b.md` §FINAL: commit `5ee4f2949b7699722064aa5747b59a88ce9d03b5` main · .git riêng · status sạch · 1227 committed · origin chưa add · remote vẫn 0 refs · shots-b 312/312 khớp (F1-F3 đóng) · 1225/1225 content byte-identical · largest 425KB. **FINAL PASS evidence-only** — chờ LEAD signal push (re-check ls-remote trước push).
