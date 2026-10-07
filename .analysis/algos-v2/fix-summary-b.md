# Fix summary — B pack `stationary_drift_ratio` (theo peer-review A)

**Finding (A, `peer-b-by-a.md`)**: pack ghi `drift ≤ max(5px, 0.06·diag)` — `0.06` là `stationary_radius_ratio` (bán kính inlier), không phải drift.

## Source đúng (`slot_vehicle_binder.py`)

- `:219` `stationary_radius_ratio = 0.06` → inlier radius `max(3.0, 0.06·bbox_diagonal)` (:1433, :1352)
- `:220` `stationary_drift_ratio = 0.10` → drift `max(5.0, 0.10·bbox_diagonal)` (:1446, :1353)
- `:1436-1437` `inlier_ratio < 0.60` → reject → "inlier ≥60%" trong pack là đúng, giữ nguyên

## Đã sửa (chỉ file B)

| File | Chỗ | Trước → Sau |
|---|---|---|
| `algo-web/packs/pipeline-identity.js:415` | explanation frame "Stable check" | `robust-drift ≤ max(5px, 0.06·đường chéo)` → `0.10·đường chéo` (kèm ghi rõ bán kính inlier `0.06·diag` để không nhầm ngược) |
| `algo-web/packs/pipeline-identity.js:733` | canvas label | `drift≤max(5px,0.06·diag)` → `inlier≥60% (r=0.06·diag) ∧ drift≤max(5px,0.10·diag)` |
| `.analysis/algos-v2/builder-b.md` S8 | strong-overlap bullet | đồng bộ `0.10` + phân biệt 2 ratio kèm line refs |

**Giữ nguyên `0.06`** ở mọi chỗ mô tả inlier radius — đó là giá trị đúng của `stationary_radius_ratio`.
`algo-web/README-identity-v2.md` không chứa số này → không đổi. Không đụng pack A/C hay file nào khác.

## Guard + verify

- `_verify_identity_b.mjs` +2 check: cấm `drift…0.06` (quét cả pack-code lẫn text), bắt buộc `drift…0.10`.
- Rerun: `node .analysis/algos-v2/_verify_identity_b.mjs` → **497 PASS / 0 FAIL** (495 + 2 check mới).
- Peer-check A trên pack B: **163/163 PASS**.
- Pack hash mới: `sha256:752462b29f013a33`.
- `build-b.md` đã cập nhật hash/counts + mục fix.

Không tự approve — chờ root review + rerun verifier.

---

## Fix 2 — `view.time` đơn vị ms (theo peer-shell A issue 1)

**Finding (A)**: engine `view.time` = `elapsedInFrame` ms (LEAD chốt SPEC); pack B truyền thô vào `pulse(time, hz)` vốn kỳ vọng giây → shimmer.

**Sửa (chỉ pack B)**: 5 callsite `pulse(view.time,` → `pulse(view.time / 1000,` tại pipeline-identity.js :472/:500/:560/:647/:747. SPEC :73 đã ghi rõ "time là millisecond… pulse theo giây cần time/1000" — pack sai contract, không phải engine.

**Kiểm tra unit khác**: `view.progress` (0..1) đúng qua `ease()`; `durationMs` đã ms; không `Date.now`/time-thô nào khác.

**Verify**: `node .analysis/algos-v2/_verify_identity_b.mjs` → **497 PASS / 0 FAIL** · hash mới `sha256:94e64527e4a98df4`. C fix phía engine riêng — B không đụng file C.

---

## Fix 3 — Rewrite tiếng Việt cho người học (LEAD visual-review)

**Finding (LEAD, `file-node-binder.png`)**: summary/4-câu-trả-lời nhiều jargon ("track-memory + pixel evidence", "quyền lực tối cao", "cầu identity", "dormant", "claim path", "hysteresis"...).

**Sửa (chỉ pack B, giữ nguyên fidelity + ghi chú minh họa)**:

- **Glossary 1 lần**: frame đầu handoff định nghĩa `track / local ID / GID / episode` một lần — các node sau dùng "vết / mã số / episode" thống nhất.
- **Pseudocode ×3** viết lại câu đời thường ("điểm hẹn", "phiếu TRỐNG", "đơn xin ô", "thẻ chờ") — giữ mọi ngưỡng source trong ngoặc.
- **38 frame** title+explanation viết lại giản dị; symbol/ngưỡng chi tiết dồn về `where`/`refs` (đã có sẵn).
- **State keys + canvas labels Việt hóa**: `hysteresis`→`ô_đang_giữ`, `gallery`→`album`, `TTL`→`còn hạn`, `TRACK`/`VISION`→`VẾT XE`/`PIXEL Ô`, `DEPARTURE TOKEN`→`THẺ CHỜ (departure token)`, checklist gates Việt hóa. Giữ tên source đã dạy: `lapjv`, `empty_votes`, `bind_external_id`, `homography`, `occupied/parked/departing`, `local#n`, `G#5`.
- **Lỗi tự gây**: regex state-key sửa nhầm `entry:`→`vào_ô:` trong 1 excerpt string (ref @2831) — đã hoàn nguyên, quét toàn bộ excerpt sạch.
- **2 check fidelity phải giữ từ khóa source**: `histogram` (frame ReID) + `departure` (frame thẻ chờ) + `drift` (label đứng yên) — thêm lại trong ngữ cảnh dịch.

**Verify**: `node .analysis/algos-v2/_verify_identity_b.mjs` → **497 PASS / 0 FAIL** · hash mới `sha256:2dca9c83528b1813`. Không đụng file C/SPEC/A.

---

## Fix 4 — Ba lỗi visual/semantic cuối trước freeze (LEAD final visual review)

**Findings (screenshots của LEAD)**:

1. `file-node-handoff-handoff-qua-vung-chuyen.png` step 5 (phase `cost`): giá trị thanh điểm bị cắt mép phải canvas; lý do từ chối đỏ của `local#9` bị cắt đáy — text nằm ngoài panel.
2. `file-node-slot-vision-xe-dung-trong-o.png` step 4 (phase `gates`): panel "25 biến thể" trống hoàn toàn dù `empty_votes = 4/25` đã tính — grid chỉ vẽ khi scene có `ratios`, các phase sau `vote` không truyền.
3. `file-node-binder-dung-do-token.png` step 5 (phase `parked`, đường đơn): episode PARKED nhưng hàng "VẾT XE" hiện "còn sống, tươi" — mâu thuẫn câu chuyện `track lost + 0.35s` của claim path.

**Sửa (chỉ `pipeline-identity.js`, layout + scene semantics — không đổi text giải thích/fidelity)**:

- **Cost panel**: `bw = w*0.44 - 175` (bar + value text "0.110" giờ kết thúc ~27px trong mép panel, trước đây tràn ~12px+ ngoài panel tới sát canvas); hàng term `0.24 + i*0.15`; `Σ` lên `0.80`; lý do từ chối vào `0.92` — tất cả nằm trong panel (`cardH`), không còn vẽ ngoài đáy.
- **Lưới 25 biến thể**: truyền `ratios + thr` vào mọi phase sau khi đã tính — `gates`/`smooth`/`evidence`/`done` (normal) + `rescue`/`edge`/`done` (edge) — grid giữ nguyên kết quả đã tính cho các bước sau. Phase `roi` giờ vẽ skeleton 25 ô mờ (`shown=false`) thay vì panel trống; tally phiếu + hàng gates ẩn ở `roi` để không lộ kết quả sớm. Verifier tự recompute `empty_votes` trên các scene mới → +16 check.
- **Binder claim vs strong-overlap**: scene `parked` (claim) + `departing` giờ `trackLost: true` — khớp source (vết local chết/tách khi xe dừng; fragment mới chưa ràng lúc lùi). Thêm `trackLabel`/`carNote` override: parked → "vết tách — episode giữ G#5"; departing → "vết mới local#7 — chờ khớp thẻ"; recover → "vết local#7 sống — đã trả G#5". Edge scenario (strong-overlap) giữ "còn sống, tươi" — đúng tương phản hai đường.

**Verify**: `node .analysis/algos-v2/_verify_identity_b.mjs` → **513 PASS / 0 FAIL** · hash mới `sha256:8117e9984048deb5`. Không đụng file C/SPEC/A. **Pack B FROZEN.**
