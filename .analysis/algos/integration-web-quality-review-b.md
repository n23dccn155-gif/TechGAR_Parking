# Integration pack — independent quality review (reviewer B)

**Đối tượng**: `algo-web/packs/integration.js` (builder C) so với `.analysis/algos/builder-c.md` + `algo-web/SPEC.md`.
**Snapshot under review (CLOSING)**: `sha256 4092aa839ac25e8d` · 289 652 bytes · 4 511 dòng · mtime 2026-10-04T15:47:19+07 — mirror do B sở hữu tại `.analysis/algos/_integration-snapshot-b2.js`. Snapshot vòng trước `cb443779b97555fe` (279 997 B) lưu tại `_integration-snapshot.js` để đối chiếu diff. Mọi kết luận closing áp dụng cho hash `4092aa839ac25e8d` — nếu C đổi file giữa browser QA, cần hash mới + chạy lại.
**Phương pháp**: review độc lập, KHÔNG dựa vào verifier của C. Harness riêng `.analysis/algos/_audit_integration.mjs` (Node, registerPack stub) + đọc source + đối chiếu từng result với Expected của dossier.
**Lệnh LEAD rerun** (cwd độc lập — harness resolve path tuyệt đối từ `__dir`): `node .analysis/algos/_audit_integration.mjs` từ `D:\TechGar2`. Output kỳ vọng: `registered: 23 lessons` · `param runs: 70 | invariant-shape fails: 0` · `STATS: frames=276 emptyState=0 noMetrics=0 <3frames= drawThrow= sceneNoType=` · `PASS 3389 / 3389`.

**Lưu ý contract**: engine (`app.js:468-474, 578`) và smoke của C (`qa/smoke.js:137-141`) merge `scenario.defaultParams` trước `buildTrace`. Từ hash `4092aa839ac25e8d`, buildTrace cũng **tự merge defaults bên trong** → `buildTrace(id,{})` ≡ effective-defaults (L4 đã đóng — verify trên `source-mode`, `replay`, `snapshot-v2`: `result`+`expected` identical). Snapshot cũ `cb443779…` KHÔNG có hành vi này.

## 1. Contract / shape (SPEC §4–§5) — PASS

| Hạng mục | Kết quả |
|---|---|
| Lessons | **23/23** canonical ID đúng dossier §Z, không trùng, không `replay-session-sync` (đúng — alias C không phải của pack này) |
| Registration | 1 lần `registerPack(PACK_ID='integration', LESSONS)` cuối file, classic script, không eval/fetch/CDN |
| Metadata §4 | Đủ `summary, role, inputTypes, outputTypes, structures, complexity{time,space,variables,simulation}, codeRefs{path,line,symbol}, edgeCases{title,description}, simplifications{sourceBehavior,demoBehavior,reason}, related, aliases, parameters` — ngoại trừ 8 field `description:""` (M4) |
| Scenarios | 46 = 23×2 (normal+edge); `edgeCase` boolean explicit mọi cái; `expected` literal rõ ràng ở mọi scenario — **không có** `expected:{}` placeholder nào (`atomic-session-store/edge` có `load_result:{}` là GIÁ TRỊ bên trong expected — đúng, malformed-load→{}) |
| Trace §5 | `{frames,result,expected,checks}` đủ; **274 frames**; frame-id unique per trace; `activeLines ⊆ pseudocode.id` 0 vi phạm; explanation VN mang giá trị tính được; `durationMs` có |
| JSON-compat | result/expected/state/scene không có non-finite/Set/function |
| draw() | per-lesson custom (đọc `scene.phase`), **0 throw** trên 274 frames với ctx-stub |
| `pass:true` literal | **0** trong source |
| Default contract | `trace.expected ≡ scenario.expected` **46/46** (khi gọi đúng defaultParams) |

## 2. Algorithm fidelity vs dossier — PASS (spot-verified toàn bộ 23 lesson)

Kết quả `buildTrace` ở default khớp Expected của dossier cho cả 46 scenario:

- `snapshot-v2-build`: gids `[5,8]` sorted, parked `{8:A01}`, gid9 filtered (terminal), cam `100/60ms online`, path tail ≤12 — đúng §A1/A2 (skip exited/expired, parked_owners, int-key lookup, age derive `applied_monotonic_ns ?? max ts`).
- `camera-age-online-derivation`: edge `cam1 age 0 / online=false` (captured=0 → clock/1e6) và `cam2 6200ms offline` — đúng quirk clamp-0 + cửa sổ ≤5e9.
- `live-freshness-contract`: accept cho `happy_z` + `same_instant+07` (same instant khác timezone); `wrong_tz`→reject:window (25200.5s), future→reject:window, `replay_mode`→reject:source_mode — đúng chuỗi guard schema→source_mode→cameras→cam_health→window→runtime_id.
- `source-mode-live-gating`: `live_mode OR replay is None → 'live'`; normal `replay`+realtime → `reject:source_mode, due_s=1060` (=1000+60−0) — đúng công thức §A4/E1.
- `frame-cursor-monotonic-poll`: `[process, episode-only, process, drop, episode-only]` last=11 — same-frame apply episode trước khi return, frame lùi drop; edge có `process(runtime-reset)` — đúng §A5.
- `segment-intersection-orientation`: touch→true (inclusive ≤0), collinear→false — đúng quirk §B1.
- `directed-crossing-direction`: into=true/outof=false; collinear+parallel_off=false — đúng §B2.
- `observation-continuity-window`: verdicts `baseline→continuous(crossing)→stale-skip→discontinuous(update)→continuous`; `prev_after` giữ nguyên ở poll3 → stale-skip KHÔNG update baseline, poll4 discontinuous CÓ update — đúng §B3.
- `entry-session-creation`: dedup cùng sid cho `(gid,runtime)` lặp; rt-2 → session mới — đúng §B4.
- `measured-path-entry-rescue`: chọn đúng pair `50@cam1#7→50.2`; reject reasons `direction/cam-track/recency` đúng thứ tự gate §B5; edge tất cả reject recency.
- `exit-crossing-session-delete`: `deleted:'s-5'`, `d_sign:'negative'` (d=−46.30); edge wrong-dir reject + `not-observed` giữ session — đúng §B6 (delete trực tiếp, không qua FSM).
- `session-state-machine`: states `SELECTING→NAVIGATING→PARKED→PARKED→SELECTING→NAVIGATING→EXIT_NAV→EXIT_NAV`, revs `2,3,4,4,5,6,7,7`, lỗi cuối `InvalidSessionState` (set_parked ep-khác-id trong EXIT_NAV) — **chính xác chuỗi Expected §C1** gồm idempotent-same-episode và rollback-branch.
- `qr-token-issuance-ttl`: TTL 120s; normal waiting `[s-old,s-mid,s-new]` kiosk `s-new` (`.at(-1)` newest); edge now=+130 → `s-old` hết hạn bị loại `[s-mid,s-new]` nhưng `claim_s-old:'SELECTING_SPOT (quá hạn vẫn claim)'` — claim KHÔNG đọc expiry, trung thực §C2 (không "sửa" thành hành vi đúng đắn).
- `revision-optimistic-concurrency`: `mutate→rev4, dedup→rev4, conflict:signature, mutate→rev5, conflict:revision`; edge = 33 action → receipt `u-1` trôi cap 32 → replay mutate lại — đúng §C3 (receipts ≤32, reused-signature conflict, expected_revision conflict).
- `spot-reservation-availability`: ordering đúng — reservations check TRƯỚC availability (B02 vẫn `SPOT_RESERVED` khi snapshot stale); edge now=+106 (6s>5) → `RUNTIME_UNAVAILABLE:503` cho A01/C05/D99 — đúng §C4 (stale→None→503; slot absent→503).
- `live-observation-cache`: `get_after [100,50→120,55→120,55→140,58]` vs `file_after [null,null,{120,55},{120,55}]` — cache nóng phục vụ GET, file chỉ ghi ở transition (select) — đúng §C5 persist=False.
- `atomic-session-store`: normal 2 keys không orphan; edge crash-giữa-write → file giữ `[s-1]` + `tmp_orphan:true` + `load_result:{}` (malformed→{}) — đúng §C6 (tmp+replace, cleanup, non-dict→{}). Đã khai "không inter-process lock" chưa — xem §4.
- `parking-episode-apply`: ep `applied 55>frame 50` bị loại; gid5 `applied`→set_parked; gid8 released→departure→`PARKED→SELECTING`; edge có `conflict` hai gid cùng ô + `skip_same_cursor` + `applied(newer_revision)` — đúng §D1 tuple-cursor.
- `parked-evidence-dwell-legacy`: poll1 `set_parked` NGAY (evidence backdate `min(confirm, stopped/1000)`), dep-count×2→`set_exit`; edge gap→reset=1 — đúng §D2.
- `identity-alias-remap-backend`: `5→9` đụng `s-9` → `conflicts:[5,9]`, s5 giữ gid5, xe gid9 bị skip (fail-closed); edge không s-9 → `remapped:['5→9']`, rev+1 — đúng §D3.
- `canonical-runtime-id-consumer`: `5→12, 7→null(cycle), 3→12, 10→null(garbage), 11→11(self-loop), 99→99` — đúng §D4 từng quirk.
- `replay-timestamp-pairing`: 4 pair, `eof_error:'video dư frame (cam2)'` (lazy EOF one-shot), ts-lặp row4 hợp lệ, `due_s:1000.4`; edge idx-gãy → `ValueError row3` — đúng §E1.
- `gate-config-validate-save`: hai phía tách bạch đúng — POST chặt (`reject:direction/endpoints/space/unit`); controller lỏng (`pass(default-positive)`, `pass(unit-None-bỏ-check)`, `swapped` vẫn pass với note "nghĩa đảo") — đúng §E2.

## 3. Provisional issues — CLOSING trên `4092aa839ac25e8d`

| # | Issue | Trạng thái | Evidence closing |
|---|---|---|---|
| P1 | `replay @fault=missing-col` → 2 frames | ✅ **CLOSED** | giờ **3 frames** `[load-input, load-header, done]` ở CẢ normal+edge — frame `load-input` expose header input trước short-circuit; 6/6 checks pass mỗi scenario. Audit `<3frames=` trống. |
| P2 | replay `due_s` | ✅ **CLOSED** | `source-mode/normal due_s=1060`, `replay/normal due_s=1000.4` — khớp fixture+dossier; `due_s:null` chỉ xuất hiện khi param `replay_realtime=false` (đúng semantics); `buildTrace(id,{})` giờ ≡ internal defaults nên không còn nhánh `{}`→`due_s:null` (L4). |

## 4. Findings — CLOSING trên `4092aa839ac25e8d`

### MEDIUM — 5/5 CLOSED

- **M1 `error` mislabel → CLOSED**: `result.error` phân loại đúng nguồn — normal EOF → `"RuntimeError"` `at="EOF — video dư frame (cam2)"`; edge row → `"ValueError"` `at="row3 idx gãy (expected 3, got 4)"`. Không còn literal `'ValueError'` cho mọi lỗi.
- **M2 claim-check bị skip → CLOSED**: key thống nhất underscore — `result`/`expected` cùng phát `claim_s_old`; check `claim_s_old=true` chạy thật với `actual="SELECTING_SPOT (quá hạn vẫn claim)"` — điểm dạy "claim không đọc expiry" giờ được assert.
- **M3 `note` fixture-only → CLOSED**: `result.note` giờ emit `"u-1 trôi cap 32 → replay mutate lại"` — khớp fixture, có check.
- **M4 `ttl_s` param chết → CLOSED**: `@ttl_s=7` → `waiting` đổi `["s-old","s-mid","s-new"]→["s-mid","s-new"]` (s-old hết hạn qua fallback `createdAt+ttl`) — param tác động result thật.
- **M5 8 `description:""` → CLOSED**: scan toàn bộ `inputTypes/outputTypes/structures` × 23 lesson → **0 field rỗng**.

### LOW — 5/6 CLOSED, 1 ghi nhận

- **L1 `state:{}` ×10 → CLOSED**: audit `emptyState=0` trên 276 frames.
- **L2 `metrics:[]` ×38 → CLOSED**: audit `noMetrics=0`.
- **L3 coverage gaps → CLOSED**: 5/5 key giờ có check thật — `layout_count`, `sid gid5@rt-1`, `skipped`, `pairs_before_error` pass; `rejected`/`rejected_all` giờ so **reason-map** `{pair→reason}`/`"recency > 1.0s"` chứ không chỉ keys. Scan bổ sung: **142/142 expected-key có check assert, 0 gap** (46 scenario @dp).
- **L4 `buildTrace(id,{})` divergence → CLOSED**: `{}` ≡ `dp()` trên cả 3 lesson boolean-default (`source-mode`, `replay`, `snapshot-v2`) — `result`+`expected` identical → buildTrace tự merge defaults bên trong.
- **L5 params cosmetic → GHI NHẬN** (không vá, đã chấp nhận ở vòng trước).
- **L6 `fault` giữ expected=fixture → CLOSED**: `expected` recompute per-fault — `missing-col`→`error:"ValueError" at:"header — thiếu cột cam2_monotonic_ns" pairs:0 due_s:null`; `ts-backward`→`"ValueError" at:"row2 cam1 ts đi lùi…"`; `idx-gap` trên normal giữ `RuntimeError EOF` (fault không kích trên fixture đó — reference đồng nhất với result, checks pass).

## 5. Declared simplifications — đúng dossier §X

7/23 lesson khai simplification, khớp bảng §X: token giả + QR placeholder (không render bitmap quét được — lane-timeline, đúng SPEC §5 QR), `cv2` mock bằng mảng frame nhưng port nguyên pairing/EOF/pacing, `tempfile/os.replace` mô phỏng tmp/final in-memory, snapshot scale ≤4 identity/2 cam, poll-loop → chuỗi snapshot cố định. Các lesson còn lại pure-logic port 1-1 — không cần khai. Giới hạn §C6 "không inter-process lock" có trong `edgeCases` của atomic-session-store — đúng yêu cầu giữ visible.

## 6. Acceptance & verdict — CLOSING

| Tiêu chí | Trạng thái |
|---|---|
| 23 canonical lessons, contract §4/§5 | ✅ PASS |
| Traces ≥3 frame meaningful, không padding | ✅ 276 frames, `<3frames=` trống kể cả changed-params |
| expected literal ≡ fixture @default | ✅ 46/46 |
| Every expected-key có check assert | ✅ **142/142**, 0 gap |
| Changed-param expected = reference độc lập | ✅ 70 param-runs, 0 shape-fail; `fault` recompute per-fault (L6) |
| `{}` ≡ effective defaultParams | ✅ buildTrace tự merge (L4) |
| Không hardcode pass | ✅ 0 `pass:true` literal |
| `state`/`metrics` mọi frame | ✅ `emptyState=0`, `noMetrics=0` (L1/L2) |
| QR 120s / claim-quá-hạn / kiosk `.at(-1)` | ✅ đúng dossier §C2 — claim check giờ chạy thật (M2) |
| Gate/session FSM rev+idempotent+rollback | ✅ đúng §C1 |
| Entry/exit crossing + continuity | ✅ đúng §B3–B6 |
| Snapshot v2 (sorted, filter, tail-12, age) | ✅ đúng §A1/A2 |
| Replay pairing/EOF/pacing `due_s` + error class | ✅ đúng §E1 (P1/P2/M1 closed) |
| Simplifications declared | ✅ §X |

**Verdict: PASS — CLOSING-READY trên `sha256 4092aa839ac25e8d`.**

- **P1, P2, M1–M5, L1–L4, L6: CLOSED** (evidence §3–§4). **L5** ghi nhận, không blocking.
- **Điều kiện duy nhất**: kết luận gắn hash `4092aa839ac25e8d`. C đang browser QA — nếu file đổi giữa run (finding mới), chụp hash lại + `node .analysis/algos/_audit_integration.mjs` phải còn `PASS 3389/3389`.
- Audit totals hiện tại: 23 lessons · 46 scenarios · **276 frames** · 70 param-runs · `PASS 3389/3389` · `emptyState=0` · `noMetrics=0` · `invariant-shape fails=0` · `drawThrow=` trống.

**Không phát hiện** self-PASS, expected-clone, fake trace, hoặc semantic sai lệch dossier nào trong 46 scenario mặc định. Semantic fidelity cao — bao gồm cả các quirk (ts lặp hợp lệ, claim-bỏ-qua-expiry, controller-lenient-default-positive, EOF lazy-check, cursor stale-skip-không-update).

---
*Review độc lập bởi B · harness `_audit_integration.mjs` · closing trên snapshot `4092aa839ac25e8d` (mirror `_integration-snapshot-b2.js`)*
