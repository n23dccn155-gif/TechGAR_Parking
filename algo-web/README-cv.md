# algo-web — Pack `cv` (57 thuật toán canonical)

Mô phỏng giáo dục 57 thuật toán **computer-vision / tracking / binder / cross-camera /
calibration** của TechGar2, trích trực tiếp từ `backend/main_detect/**` đã qua
peer-review vòng A (motion/binder) + C (crosscam/calibration). Dossier chuẩn:
`.analysis/algos/builder-b.md` (bản đã merge `motion-binder-correction-a.md` 19
section + `cv-crosscal-review-c.md` 10 mục), review log `builder-b-review.md`,
SPEC `algo-web/SPEC.md`.

- File: `algo-web/packs/cv.js` — classic script, **không** module/fetch/CDN/backend.
- Đăng ký: `window.TechGarAlgo.registerPack('cv', lessons)`.
- Phạm vi: **57 ID canonical CV** trong SPEC. Alias `replay-session-sync` (F9)
  do **builder-C / pack integration** sở hữu — cố ý **không** register trong file này.

## 1. Danh mục 57 lesson

| Nhóm | Lesson ID |
|---|---|
| A — Motion & mask (12) | `mog2-foreground-mask`, `temporal-motion-gate`, `roi-strict-context-mask`, `foreground-morphology`, `contour-geometry-filter`, `bottom-center-anchor`, `cast-shadow-discriminator`, `dark-foreground-rescue`, `motion-echo-suppression`, `occlusion-group-guard`, `watershed-blob-partition`, `merged-blob-assignment-guard` |
| B — Tracking & assignment (11) | `kalman-constant-velocity`, `prediction-age-decay`, `association-distance-gate`, `iou-overlap-score`, `association-cost-matrix`, `lapjv-assignment`, `assignment-margin-ambiguity`, `stale-anchor-reacquire`, `track-lifecycle`, `hsv-lab-descriptor`, `tracklet-gallery-match` |
| C — Occupancy vote (5) | `slot-roi-precompute`, `ensemble-threshold-voting`, `border-line-filter`, `core-rescue-vote`, `temporal-smoothing-dwell` |
| D — Binder (11) | `slot-overlap-geometry`, `slot-track-batch-match`, `arrival-claim-qualification`, `vision-primary-fusion`, `stop-dwell-detection`, `sticky-id-bind-release`, `departure-token-lifecycle`, `predeparture-candidate-guard`, `recovery-candidate-gates`, `recovery-batch-assignment`, `parking-episode-state` |
| E — Cross-camera & identity (10) | `world-projection-anchor`, `handoff-entry-creation`, `handoff-prediction-corridor`, `handoff-lapjv-matching`, `overlap-simultaneous-pairing`, `global-id-allocation`, `dormant-identity-reid`, `world-trajectory-match`, `merge-alias-resolution`, `global-identity-lifecycle` |
| F — Calibration & timing (8) | `homography-fit-distributed`, `rectangle-line-fit-gate`, `calibration-load-validation`, `matching-distance-derivation`, `frame-size-adaptation`, `camera-skew-synchronization`, `latest-frame-mailbox`, `stale-evidence-health-gating` |

Mỗi lesson có đủ metadata SPEC §4: `id, pack, title, topic, summary (VN), role
(VN), inputTypes/outputTypes/structures [{name,type,description}], complexity
{time,space,variables,simulation}, codeRefs (path:dòng root-relative),
edgeCases, simplifications, related, aliases, parameters, pseudocode(id),
scenarios, buildTrace(scenarioId, params), draw(ctx, frame, env)`. Nguồn
semantic `inputSchema/outputSchema/dataStructures/keyFields/invariants` của
dossier được migrate nguyên vẹn vào shape SPEC — không mất dữ liệu đã duyệt.

## 2. Scenario & tham số

- **116 scenario**: 55 lesson × 2 (`normal` + `edge`) **cộng** 2 lesson có
  scenario thứ ba — `lapjv-assignment` (`greedy`: min-cost≠min-total khi skip
  track) và `temporal-smoothing-dwell` (`stale`: timestamp đi lùi → reject).
  `normal` (`edgeCase: false`) = đường chuẩn, `edge`/`greedy`/`stale`
  (`edgeCase: true`) = biên/gate-fail. Fixture lấy đúng Sample A/B của dossier
  (đã qua peer review, verifier B163/A95/C64).
- `buildTrace` trả `{ frames, result, expected, checks }`. `checks` là
  `{label, pass, actual, expected}` — mỗi key của `scenario.expected` có một
  check so `result[k]` thật; không có check nào tự so result với result.
- **Params đổi trace**: `params` merge theo `parameters[].default`; khi param
  khác default, `expected` là tham chiếu/invariant độc lập (không clone result)
  và `checks` là invariant của nhánh đó. Đổi lesson/scenario → UI reset params
  về `default` (shell quản lý — pack chỉ đọc `params` khi được truyền).
- `frame.activeLines` trỏ `pseudocode[].id` (numeric index 0-based → `p<n+1>`),
  **không clamp** — tham chiếu sai sẽ bị validator bắt.
- Mỗi trace ≥3 frame **có ý nghĩa**: input/geometry → gate/tính trung gian →
  kết quả/quyết định. Không có frame padding — mỗi bước emit mang trạng thái
  thật của thuật toán (mask từng stage, cost từng ô, FSM từng transition).
- `frame.state` luôn khác rỗng: số liệu thật của bước (cost, verdict, counters,
  radii, assignment) để UI hiển thị bên cạnh canvas.

## 3. Canvas & scene

`draw(ctx, frame, env)` raw Canvas2D, responsive `env.width/height`, hỗ trợ
`env.progress/previousFrame/palette/reducedMotion`. 14 kiểu scene nội bộ
(registry `drawScene.rendererTypes`):

`grid` (mask/morphology nhiều lớp), `tracks` (bbox/trails/rings/vlines),
`matrix` (cost/assignment), `fsm` (lifecycle), `slots` (occupancy),
`world` (quỹ đạo bản đồ chung), `hmat` (homography), `timeline` (skew/mailbox),
`bars` (score nhiều term + ngưỡng), `hist` (descriptor), `rows` (gate/verdict),
`board` (thẻ trạng thái), `dualcam` (camA/camB/world handoff), `token`
(departure/predeparture token card).

Scene không thuộc registry → **không** silent-fallback (validator fail).

## 4. Kiểm chứng (Node, không cần browser)

```bash
cd D:/TechGar2/algo-web
node _validate_cv.mjs
```

Kết quả hiện tại: **14970 PASS / 0 FAIL** — `lessons: 57 | scenarios: 116 | frames: 411`.
Snapshot pack: `sha256:27b693e84ff600d3` (402497 bytes · 4912 dòng).
Harness stub `window.TechGarAlgo.registerPack` + fake Canvas ctx; assert gồm:

- đúng 57 lesson, khớp danh mục canonical, `replay-session-sync` vắng mặt,
  không trùng ID;
- metadata đủ field; mỗi lesson có `normal` + `edgeCase:true`;
- mọi trace đủ 4 field `{frames,result,expected,checks}`; `result`/`expected`
  JSON-compatible; `expected` deep-equal `scenario.expected` ở default;
- mọi `check.pass === true`, shape `{label,actual,expected}`, và mỗi key
  fixture có check thật `actual=result[k]` vs `expected=fixture[k]`;
- mọi frame: id unique, ≥1 `activeLines` ⊆ pseudocode ids (không clamp),
  explanation VN, state/scene JSON-compat, **`state` không rỗng** (dữ liệu thật
  của bước), `metrics ≥ 1` (giá trị đang tính — auto-mirror scalar từ `state`
  hoặc khai tường minh), `durationMs > 0`;
- `scene.type ∈ drawScene.rendererTypes` (registry thật); `draw()` mọi frame
  không throw với fake ctx;
- **mọi param × mọi scenario** ở giá trị `min`: expected JSON-compat, KHÔNG
  deep-equal `result` (reference/invariant độc lập), checks có `actual`;
- **invariant audit (peer-review A §3.3)**: 0 literal `pass:true`/`pass:1` trong
  source; 16 lesson đã liệt kê đều có invariant là biểu thức tính từ
  `result`/state/reference (ví dụ `overlap-simultaneous-pairing` báo FAIL thật
  khi radius nhỏ làm A≡B — bằng chứng không hardcode);
- **domain sweep (A §3.7)**: mọi giá trị trong miền `min..max` (đúng `step`) ×
  mọi enum/boolean option × mọi scenario — 1120 run, 1267 invariant-check,
  0 throw / 0 fail; probe ngoài step-grid `close_k=2,4`, `min_ratio=0.01`,
  `radius∈{2,2.5,3,3.5}` — phải normalize/validate có giải thích, không throw;
- spot-check số học dossier: IoU 0.3333, cost 4-term 0.3669, LAPJV total 0.9,
  slot score 0.862, gallery distance 0.1553, HSV/LAB 0.366, token radius
  [5,25,45,45], stale cost 0.2809, world [20,30], skew reads 2, t_edge 1.25,
  median 500, `H@S = [[4,0,10],[0,4,20],[0,0,1]]`.

## 5. Độ trung thực & giới hạn (ghi trong `simplifications[]` từng lesson)

- Giữ literal nguồn đã peer-review: cost 4-term `.45/.25/.2/.1` (+log-size B5),
  gallery 4-term `.5/.2/.2/.1` (B11), Bhattacharyya `√(1−BC)` (B10), handoff
  gates + cost `.55/.30/.10/.05` limit `.92` (E4), world-trajectory 6-term
  `.35/.25/.15/.10/.10/.05` (E8), `radius = diag·lerp(0.05→0.45)` (D7),
  multiples `{1.75,2.75,1.75,0.50}` + ceiling `min(configured,derived)` (F4),
  `needs_frame` đo từ publish được nhận (F7), `result_age=max(2 nhánh)` +
  `evidence_not_monotonic` + `worker_over_deadline` — không `job_seq` (F8),
  `reviewed_fit` standalone reject (F3), `H' = H @ diag(sx,sy,1)` nhân phải (F5).
- `[sim]`/`[sim-omits]` nêu rõ: assignment demo vét cạn O(n!) n≤5 vs LAPJV O(n³)
  production (ghi nhãn đúng); erode/dilate tự cài trên lưới nhỏ thay cv2;
  handoff elapsed đếm **frame** (không /fps) — nhánh timestamp chỉ khi
  `handoff_ttl_seconds` set; mailbox queue 1-ô deterministic thay thread/lock.
- Production-vs-demo: không dùng camera/frame thật; occupancy score/radius ở đơn
  vị px lưới demo; descriptor HSV/LAB trích bằng fixture nhỏ không phải ảnh.

### 5.1 Sửa theo peer-review A §3.7 + visual C (bản hiện tại)

- `foreground-morphology` (§3.7a): `close_k` domain về lẻ `{1,3,5}` (kernel
  morphology luôn lẻ); giá trị chẵn nhập tay (2,4) được normalize tới lẻ gần
  nhất kèm giải thích trong frame đầu — không còn TypeError.
- `contour-geometry-filter` (§3.7b): invariant `reject:motion` đúng công thức
  OR — `motion ≥ min_px **hoặc** fill < min_ratio` (trước sai AND).
- `overlap-simultaneous-pairing` (§3.7c): invariant structural thật —
  "A merge ⇔ đúng 1 cặp duy nhất · B = cặp cost thấp nhất" (premise `A≠B`
  trước đây không gating ambiguous; giờ sweep radius 2..3.5 pass).
- `mog2-foreground-mask` (visual C): trace 4 frame — frame raw hiển thị mask
  **3 mức {0,127,255}** với màu + legend riêng (0 nền / 127 shadow / 255
  definite), ô in giá trị mức và đếm `n0/n127/n255`; frame thứ ba hiển thị
  2 mask `definite` và `refined` với số ô bật khớp metric `fg`. Fixture
  normal giờ có 1 px tối-hơn-nền (frame=1, bg=5) → raw có đủ 3 mức
  (n0=11·n127=1·n255=4), `fg_count=5` tính lại trung thực. Gate gộp marker
  đúng dossier: param `reject_cast_shadows` (boolean, default true — UI
  checkbox) ∧ `bg_ref` tồn tại; tắt cờ → marker bị loại, fg=4. Trước đây
  chỉ 1 lưới 2 màu khiến 9 ô xanh không khớp `fg=4`.
- `stale-anchor-reacquire` (phát hiện nhờ sweep): `window < lost_s` →
  `result.gate/d/cost = null` (trước NaN — JSON-incompatible).
- Expected fixtures không đổi **ngoại trừ** `mog2-foreground-mask/normal`:
  `fg_count 4→5` vì *input* thêm 1 px bóng (127) để demo đủ 3 mức — expected
  được **tính lại trung thực** từ input mới, không chỉnh theo scene.
  Invariant/checks không nới — sweep chứng minh công thức đúng trên toàn
  miền, không phải chỉ ở điểm default.

## 6. Ranh giới & blocker

- Owner file này: `algo-web/packs/cv.js` + `_validate_cv.mjs` +
  `README-cv.md` — không sửa source TechGar2, shell, engine, SPEC, pack
  `frontend.js` (A) hay `integration.js` (C).
- Browser QA **đã đạt** — xem [`QA.md`](QA.md): 117 lessons (37 A + 57 CV +
  23 C) · 236/236 scenarios · 130/130 params · 0 fail trên freeze
  `27b693e84ff600d3`; A independent closure + root verifier 14970 PASS.
  **LEAD đã duyệt deliverable.**
- Nguồn tham chiếu: `codeRefs` trỏ `backend/main_detect/...:dòng` — kiểm chứng
  trên dossier merged (A replacement 19 section + C crosscal 10 mục) tại thời
  điểm viết; nếu backend đổi sau đó, fixture cần đối chiếu lại.
