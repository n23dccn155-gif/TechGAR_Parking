# Build report — Builder B (identity pack, V2)

**Deliverables**
- `algo-web/packs/pipeline-identity.js` — 3 node `handoff` / `slot-vision` / `binder`, registry `window.TechGarPipelinePacks.identity` (SPEC §5).
- `algo-web/README-identity-v2.md` — bảng scenario, fidelity notes, giới hạn, lệnh verify.
- `.analysis/algos-v2/_verify_identity_b.mjs` — owner-verifier (contract + determinism + excerpt-vs-source + draw + invariant).
- File này — report.

**Verify**: `node .analysis/algos-v2/_verify_identity_b.mjs` → **PASS 513 / 513** · 6 scenario · 38 frame · 0 fail.
Pack hash hiện tại: `sha256:8117e9984048deb5` (sau 3 fix visual/semantic cuối trước freeze — xem Fix 4 trong `fix-summary-b.md`).
Peer-check độc lập của A (`_peer_check_b.mjs`): **163/163 PASS**.

## Fix theo peer-shell A (view.time đơn vị)

- **Bug**: SPEC §draw nói `view.time` = **millisecond** kể từ đầu bước (pulse theo giây cần `time/1000`); pack truyền `view.time` thô vào `pulse(time, hz)` coi như giây → dao động nhanh gấp ~1000× (shimmer).
- **Sửa**: 5 callsite `pulse(view.time,` → `pulse(view.time / 1000,` tại :472/:500/:560/:647/:747 (bound ring, entry glow, verdict ribbon, rescue fill, recovered flash).
- **Đã kiểm unit khác**: `view.progress` dùng qua `ease()` (0..1) đúng; `durationMs` đã là ms; không có `Date.now`/`Math.sin(view.time)` thô nào khác.

## Fix theo peer-review A (finding `stationary_drift_ratio`)

- **Bug**: pack + dossier ghi `robust-drift ≤ max(5px, 0.06·diag)` — nhầm `stationary_radius_ratio` (0.06) với `stationary_drift_ratio` (**0.10**, svb:220/:1353/:1446).
- **Sửa**: `pipeline-identity.js:415` (explanation) và `:733` (canvas label) → `drift ≤ max(5px, 0.10·diag)`; giữ `inlier ≥60% trong bán kính 0.06·diag` (đúng: inlier radius là 0.06, svb:1433-1437). `builder-b.md` S8 đồng bộ. README không chứa số này — không đổi.
- **Guard**: verifier thêm 2 check — cấm `drift…0.06` trên cả pack-code lẫn text, bắt buộc `drift…0.10`.

## Đã kiểm chứng bằng verifier (không chỉ code-review)

- **Contract**: mỗi node đủ `id/title/group/summary/answers{does,role,where,why}/refs/scenarios≥2/pseudocode 5-10/draw`; frame đủ `title/explanation/activeLines(0-based,trong-bounds)/state non-empty/durationMs>0/scene`.
- **Determinism**: `build()` × 2 → deep-equal mọi scenario.
- **Refs thật**: mỗi `refs[]` — file tồn tại, `line` hợp lệ, **`excerpt` byte-đối-chiếu (đã normalize CRLF) với source tại `excerptStart`**. 17/17 excerpts khớp file gốc.
- **Draw**: `draw()` chạy mọi frame × progress {0,0.5,1} (ctx stub) — 0 throw.
- **Invariant fidelity recompute**:
  - slot-vision: `empty_votes = count(ratio < thr)` recompute khớp scene; `required === 12`; verdict cuối `occupied ⇐ !(empty≥12 ∧ !rescue)`;
  - handoff: `Σ cost terms = total` (0.164) và từng `term.c = w·v`; giải thích nhắc limit 0.92/0.95; appearance=gallery, không deep-ReID;
  - binder: `claim score = Σ w·v ≈ 0.73` recompute.
- **Fidelity keywords**: có `empty_votes`, `occupied_seconds`, `vision_primary`, `homography`, `lapjv`, `departure`, `episode`; **không** có `13/25`; `occupied_votes` chỉ xuất hiện kèm phủ định.

## Những chỗ cần review kỹ (không tự approve)

- **Số liệu scene là minh họa tính tay** (đã ghi trong README + frame text): cost 0.164, streak 2/2, dwell 1.15s, TTL 45f→0 — đều khớp công thức/ngưỡng source nhưng không phải log chạy thật.
- **World map** chỉ vẽ trail tuyến tính + corridor — homography giải thích bằng chữ, không chiếu thật.
- **Variant grid** hiển thị 25 ratio minh họa; không chạy CLAHE/gamma thật.
- **Edge-slot-vision**: `empty_votes=21 ≥12` tạm free → core-rescue lật — đúng cấu trúc vote-cho-trống + cổng lật; con số component/rescue là minh họa (source chỉ nói `_has_core_rescue` lật `is_free=False`, pd:542-547).
- **`median_slot_length` thực tế** chưa resolve — pack chỉ ghi "đơn vị calibration / bội số chiều-dài-ô" (đúng hướng shared-map, không px).
- **Group field** đặt `"identity"` cho cả 3 node — nếu shell C cần nhóm khác (vd `occupancy` cho slot-vision), đây là chỗ có thể phải đổi theo C.
- Pack **chưa render thật trong browser** — draw chỉ verified no-throw qua ctx stub; visual QA (tràn chữ, màu, responsive) là phần A/C theo SPEC §7, §8.
- `view.previous` chưa dùng để nội suy liên-frame (mỗi frame tự chứa from/to) — nếu engine C mong đợi continuity kiểu khác, cần cross-check.
- `state` đôi chỗ dùng key có ký tự `#` (`local#9`) — hợp lệ JSON nhưng nếu side-panel của C render raw key cần lưu ý.

## Không đụng

`cv.js`, `integration.js`, `frontend.js`, `index.html`, `app.js`, `shared/engine.js`, `SPEC.md`, mọi file backend/frontend production, mọi verifier của A/C. Không install, không fetch, không CDN.
