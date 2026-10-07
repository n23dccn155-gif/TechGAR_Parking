# algo-web — Pack `frontend` (37 thuật toán canonical)

Mô phỏng giáo dục 37 thuật toán **frontend** của TechGar2, trích trực tiếp từ
`frontend/src/**` đã qua review (dossier `.analysis/algos/builder-a.md`,
review log `builder-a-review.md`, SPEC `algo-web/SPEC.md`).

- File: `algo-web/packs/frontend.js` — classic script, **không** module/fetch/CDN/backend.
- Đăng ký: `window.TechGarAlgo.registerPack('frontend', lessons)`.
- Phạm vi: **37 ID canonical frontend** trong SPEC. 5 alias tích hợp
  (`live-runtime-validator`, `frame-cursor-guard`, `runtime-request-coalesce`,
  `qr-visibility-window`, `canonical-gid-chain`) do **builder-C / pack integration**
  quản lý — cố ý **không** có trong file này.

## 1. Danh mục 37 lesson

| Nhóm | Lesson ID |
|---|---|
| Đồ thị làn | `lane-graph-build`, `adjacency-directed-expand`, `gate-node-mutate` |
| Định tuyến | `astar-find-route`, `spot-route-wrappers`, `drivable-edge-project`, `pos-route-wrappers`, `route-edge-validator` |
| Gợi ý ô đỗ | `spot-rank-score`, `recommendation-promote` |
| Dẫn đường | `point-segment-dist`, `off-route-detect`, `turn-instruction`, `voice-speak-throttle` |
| Đồng bộ phiên | `session-commit-guard`, `session-action-serialize`, `session-refresh-dedupe`, `action-id-gen`, `completion-key-build`, `parking-decision-resolve` |
| Trạng thái ô | `occupancy-classify`, `spot-event-reducer`, `spot-ownership-map`, `parking-counts-derive` |
| Hình học/render | `affine-fit-transform`, `world-svg-project`, `vehicle-svg-project`, `route-polyline-simplify`, `route-arrow-place`, `viewbox-pan-zoom`, `parking-geometry-gen`, `gate-line-derive` |
| Luồng app | `driver-flow-machine`, `nav-goal-resolve`, `invalid-spot-recovery`, `parked-marker-fallback`, `mock-scenario-emitter` |

Mỗi lesson có đủ schema SPEC: `id, pack, title, topic, summary, role,
inputTypes, outputTypes, structures, complexity, codeRefs, pseudocode,
edgeCases, simplifications, related, parameters, scenarios,
buildTrace(scenarioId, params), draw(ctx, frame, env)`.

## 2. Scenario & tham số

- **74 scenario** (2/lesson): `default` = đường chuẩn, `edge` (`edgeCase: true`)
  = biên/bug nguồn. Ví dụ: `spot-route-wrappers/edge` tái hiện **bug sink**
  (mọi `spot-entry` out-degree 0 → `findExitRoute` luôn null);
  `mock-scenario-emitter/edge` tái hiện **bug nhãn** của kịch bản
  `unauthorized-ownership` (mock gửi `cam-left→F01` mà F ∈ LEFT_ZONES → được
  authorize, dispatch bình thường).
- `buildTrace` trả `{ frames, result, expected, checks }`; `checks` là
  `{label, pass, actual, expected}` tính thật — không hardcode PASS.
- **Tham số thật sự đổi trace**: khi `params` khác input mặc định của
  scenario, `expected` được tính lại độc lập theo kết quả mô phỏng mới
  (tham chiếu độc lập, không lặp expected cũ). Đổi lesson/scenario → UI phải
  reset params về `default` (shell quản lý — pack chỉ đọc `params` khi được truyền).
- **Semantics `{}` ≡ explicit defaults**: UI truyền object `parameters[].default`
  đầy đủ; pack strip mọi key bằng `default` trước khi lesson đọc `params` →
  `buildTrace(id, {})` và `buildTrace(id, fullDefaults)` cho trace/expected/checks
  y hệt, và param-default không bao giờ nuốt `scenario.input` của edge fixture.
  Chỉ key **khác** `default` mới override input.
- **Expected khi params đổi**: không lặp `scenario.expected`; mỗi lesson có
  reference riêng cho mode hiệu lực — spec-table (variant→verdict/text/hệ số),
  công thức độc lập (refV/refE đóng-form, brute-force path), hoặc invariant
  (gate-chain, membership). Checks luôn so result với reference của mode đó —
  vd `gate-node-mutate` mode `recompute` so `cachedDist` với euclid mới,
  không so với cache baseline (baseline=điểm yếu đã ghi, không phải lỗi vá).
- **≥3 frame có nghĩa trên MỌI changed-branch**: mọi giá trị hợp lệ của mọi
  param (mọi option `select`, boolean flip, min/max/+step của `number`) trên
  mọi scenario phải cho ≥3 frame tương ứng bước input/guard/decision/action
  thật của thuật toán — không được phép nhánh kết thúc sớm chỉ còn 1-2 frame,
  và không waiver cho yêu cầu này.
- `frame.activeLines` trỏ `pseudocode[].id` → inspector tô dòng pseudocode đang chạy.

## 3. Canvas & inspector

`draw(ctx, frame, env)` render bằng raw Canvas2D, responsive theo
`env.width/env.height`, không phụ thuộc helper ngoài contract SPEC.
7 kiểu scene nội bộ: `graph` (đồ thị làn + route + projection),
`map` (ô đỗ + marker + route), `geom` (điểm/đoạn hình học),
`bars` (điểm xếp hạng), `rows` (bảng gate/verdict), `timeline` (sự kiện theo thời
gian — voice, session, mock), `board` (thẻ trạng thái + log).
Inspector lấy `frame.inspector` (label/value) + `frame.state`.

## 4. Kiểm chứng (Node, không cần browser)

```bash
cd D:/TechGar2/.analysis/algos
node test-frontend-pack.mjs
```

Kết quả hiện tại: **6395 PASS / 0 FAIL**. Harness stub
`window.TechGarAlgo.registerPack` + Canvas ctx stub; assert đúng contract
SPEC §4-5 và `qa/smoke.js` của C:

- đúng 37 lesson, ID unique, khớp danh mục canonical SPEC, `pack='frontend'`,
  không chứa alias của C;
- metadata đủ field; mỗi lesson ≥1 scenario thường + ≥1 `edgeCase:true`;
- **mọi scenario × cả 2 cách gọi** (`{}` và explicit `parameters[].default`):
  `trace.expected` deep-equal `scenario.expected`, `result` y hệt,
  `checks` đều `pass=true`;
- **≥3 frame/scenario** và **≥3 frame trên mọi changed-branch** (mọi option
  `select` ≠ default, boolean flip, min/max/+step của `number` × mọi scenario),
  mọi `frame.activeLines` ⊆ `pseudocode[].id` (kể cả frame sinh bởi params
  đổi), frames JSON-safe, mọi frame có `explanation`;
- param `select` có `options` không rỗng + `default ∈ options` + label;
- **mọi giá trị hợp lệ của mọi param** làm trace/result khác (trên scenario
  `default`) và `checks` vẫn xanh ở mọi branch — expected tham chiếu độc lập
  theo input mới, không lặp literal mặc định;
- **projection-consistency**: mọi single-param và mọi cặp param (cumulative
  như UI), `expected` phải khớp `result` trên shared keys — chặn bug-class
  "trả `sc.expected` cứng khi result đã đổi mode";
- `draw()` gọi được trên mọi frame của **mọi** scenario với ctx stub,
  không throw và phát sinh lệnh vẽ.

## 5. Độ trung thực & giới hạn đã ghi trong pack

- Giữ nguyên các gate/hằng số nguồn: A* tie-break `f→g→node`, heuristic scale
  min-ratio, projection `routeFromPos` maxDist=60px loại cạnh chạm
  `access-anchor`/`spot-entry`, off-route default 75 vs **caller MonitorApp 80**
  (drift ghi rõ), voice 4-gate, commit guard GET-vs-action lock + unlock trước
  reconcile, `LEFT_ZONES={F,E,D}` (C05→cam-right), `deriveParkingCounts` status
  lạ → `NaN`, simplify so với điểm **cuối đã giữ**, arrow mọc theo arc-length,
  viewbox clamp/zoom-stable, affine <3 anchor → null, gate line `toFixed(4)` +
  accept `max(0.6·len, 2)`.
- `simplifications[]` nêu rõ nơi demo thay bằng env object/fixture nhỏ
  (ví dụ fixture đồ thị G1 thay layout đầy đủ; RNG seeded cho `action-id-gen`
  fallback; `Math.random` của bản thật không deterministic).
- Bug nguồn được **dạy đúng là bug** (sink `spot-entry`, drift threshold,
  nhãn `unauthorized-ownership`, `closestIndex` là lân cận vertex chứ không
  phải tiến độ theo cung).

## 6. Ranh giới & trạng thái QA

- Owner file này: `algo-web/packs/frontend.js` + `README-frontend.md` +
  verifier `.analysis/algos/test-frontend-pack.mjs` — không sửa source
  TechGar2, shell, engine, SPEC, `cv.js` (B), `integration.js` (C).
- **Status: ĐẠT — đã freeze.** Browser QA cuối của C (`algo-web/QA.md`):
  **117/236 contract pass, 130 param-changes, 0 fails**; owner verifier
  `6395 PASS / 0 FAIL`. Peer review B/C đã đóng. Pack frozen tại
  `frontend.js` sha256 `ee4682454f1f8b80` — mọi thay đổi sau hash này cần
  chạy lại verifier + browser QA.
- QA vòng 1 của C (`qa/smoke-results.json`): **17 lỗi frontend** — 15
  `trace.expected ≠ scenario.expected` + 2 edge check — đã sửa toàn bộ;
  verifier nâng lên đúng contract smoke.
- Review ảnh vòng 2: frame ≥3/scenario cho 21 lesson, scene `map`/`geom`/
  `bars`/`timeline` đúng định dạng renderer, param select không còn rỗng —
  đã sửa và assert cứng trong harness.
- QA vòng 3 (`QA.md`): 2 changed-branch <3 frame (`invalid-spot-recovery`
  `outcome=firstOk`, `mock-scenario-emitter` `scenario=stale`) — đã sửa bằng
  frame input/guard/decision thật theo source, không padding, không waiver.
- Nguồn tham chiếu: mỗi lesson `codeRefs` trỏ `frontend/src/...:dòng` —
  kiểm chứng lần cuối trên working tree hiện tại.
