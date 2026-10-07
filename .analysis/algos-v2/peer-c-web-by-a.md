# peer-c-web-by-a.md — A review C WEB: `binder` + `polygon` (theo yêu cầu LEAD)

Phạm vi: chỉ đọc source + inspect app/report; **không sửa file C**. Source = `backend/main_detect/src/techgar/slot_vehicle_binder.py` (`svb:`) + `backend/main_detect/two_camera.py` (`tc:`) trạng thái hiện tại. App shots: `algo-web-v2/qa/shots/a/peer-{binder,polygon}-s{0,mid,last}.png`.

## Verdict tổng: **PASS cả 2 trang** về render/scene; **LEAD giữ MINOR-1 làm BLOCKING** đến khi C sửa predicate signed-distance (dạy sai chiều), cùng MINOR-2/3 (cite sai vùng/dòng) phải đóng trước final. MINOR-4/5 là polish.

## Verify params ≥3 — tất cả khớp source

| Claim của C | Verify trên source | Kết quả |
|---|---|---|
| `policy="vision_primary"` callsite | `tc:2328` — đúng dòng (bảng params content ghi 2328 ✓). Lưu ý `tc:2331` là `recovery_max_expand_ratio` — khác dòng. | PASS |
| occupied = vision (one-way) | `svb:3840-3843`: `vision_primary` → `binding.occupied = bool(vision_occupied)`, `decision_source="vision"`. Sticky: `svb:1990-2017` giữ `vehicle_id` khi track mất mà `vision_occupied` còn — comment source "Vision owns the public colour". | PASS |
| Binding + episode | `_bind_vehicle` `svb:1919` → `vehicle_id=gid` `:1946` + `_open_parking_episode` `:1953`; episode transition departing `:1986`; export `:625`. | PASS (cite sai vùng — MINOR-2) |
| qualifies `(in && ov≥0.35) || ov≥0.60` | `svb:729-731` đúng từng dòng; default `0.35/0.60` tại `svb:217-218`. | PASS |
| score `.70·ov + .20·sov + .10·prox` | `svb:739` — `score = 0.70·vehicle_overlap + 0.20·slot_overlap + 0.10·center_proximity` đúng hệ số + dấu. | PASS (ghi 740 — drift 1 dòng) |
| token neo `_bottom_center` ≠ center bbox | def `svb:573-574`; dùng cho recovery point `:495`/`:2800`; overlap test neo `center` `:727` — 2 anchor khác vai trò đúng như C mô tả. | PASS |
| wake-up `1+2r` ≠ gate | `svb:2653-2668` expanded polygon chỉ đánh thức detector; arbitration §A tôn trọng. | PASS |
| ramp 0.05→0.85 / 1.0s | `_token_radius` `svb:603-609` (linear `initial + progress·(max−initial)`); `--slot-recovery-expand-seconds` default **1.0** `tc:1898`; start 0.05 `:1889`, max **0.85** `:1892-1897`→callsite `:2331`. | PASS |
| Geometry scene 31/74/44 | **Verify độc lập Monte-Carlo** (400k mẫu, không dùng kernel của C): X ov≈0.312 tâm TRONG → rớt `0.31<0.35`; Z ov≈0.741 TRONG → qua; Y ov≈0.440 NGOÀI → rớt `0.44<0.60`. Khớp số hiển thị trên page. | PASS |
| signed-dist `+trong/−ngoài` | `_signed_polygon_distance` `svb:582-590` = `cv2.pointPolygonTest(measureDist=True)` — convention đúng như kernel mirror của C. | PASS |
| 4-blocks trước Deep | DOM check: `.tg-four` trước Deep ở cả 2 trang (`four-before-Deep: true`); scaffold auto-mount `ui.js:199-203` + guard idempotent — không dup. | PASS |

## Findings (MINOR-1 = BLOCKING theo LEAD; 2-3 phải đóng trước final; 4-5 polish)

1. **binder — predicate signed distance diễn đạt ngược dấu** (pcode dòng 7 + EXPL[4] + content `limits`/QA): "recovery gate: signed_dist ≤ diag×ratio". Theo convention +trong/−ngoài, điểm ngoài có sd<0 luôn thỏa `≤ +r` → đọc nguyên văn là nhận mọi điểm ngoài. **Predicate chính xác** (đã verify biên):
   - reject iff `signed_distance < −radius && original_overlap ≤ 0 && !continuing_candidate` — `svb:2988-2990` (max_radius) · `svb:3240-3247` (radius đang nở, `waiting_for_expanding_gate`) · `svb:509` (initial_radius).
   - ⇔ keep iff `signed ≥ −radius` **HOẶC** `overlap > 0` **HOẶC** continuing evidence.
   - Biên: `sd = −radius` → `<` false → **giữ** (kept, inclusive); `sd = −r−eps` (và ov≤0, không evidence) → reject. ⇒ phải viết `sd ≥ −r` (không `>`).
   - Gợi ý wording: "giữ nếu điểm không sâu ngoài mép quá `diag×r` (`sd ≥ −r`), hoặc có overlap/evidence" — cite `svb:2988-2990` (hiện chỉ cite `:2875-2876` = dòng gán radius).

2. **binder — cite sai vùng cho arrival**: pcode ghi `svb:2248-2290` cho "arrival: claim + bind + mở episode" — vùng đó là `_advance_strong_overlap`/stop_candidate. Đúng: `ArrivalClaim(` `svb:1109`, bind+episode `_bind_vehicle` `svb:1919` (`vehicle_id=gid` `:1946`, `_open_parking_episode` `:1953`).

3. **binder content — mâu thuẫn dòng trong cùng file**: `realParams` ghi policy `tc:2328` (đúng), nhưng `limits` viết "đọc callsite `tc:2331`" — `:2331` là `recovery_max_expand_ratio`, không phải policy. Đổi `:2331` → `:2328`.

4. **binder — OFF-branch cần nhãn simplification**: demo OFF = "occupied bám track-ID → flap". Policy `legacy` thật = `occupied = vision_occupied OR tracking_confirmed(≥500ms)` (`svb:3856`) — vẫn dùng vision, không pure-ID. OFF của page là mô hình đối-lập giảng dạy hợp lệ nhưng nên gắn `[minh họa]`/ghi chú "khác legacy" để khỏi đọc nhầm thành mode thật.

5. **polygon — line drift nhỏ** (nội dung đúng): `ov` `:725` (ghi 724), `center_inside` `:728` (ghi 727), `score` `:739` (ghi 740), `_bbox_polygon` def `:701` (ghi 715 — là call-site trong `_overlap_geometry`, chấp nhận được vì note nói "rect→poly").

## Visual (shots `peer-*`)

- `binder-s5`: 2 nguồn chips, OFF `OCCUPIED =track-ID` vs ON `OCCUPIED =vision`, token @bottom-ctr + vòng gate + wake-up dashed polygon — rõ. HUD `ep#1 giữ` khớp narrative "không episode mới". Nit: nhãn `wake-up 1+2r` sát mép phải panel ON (đọc được).
- `polygon-s4`: ov/sd hiển thị khớp verify (`ov=0.31·TRONG`, `0.74·TRONG`, `0.44·NGOÀI`, `d=15px/48px`), verdict theo nhánh đúng (`in&&ov≥0.35` / `tâm ngoài, ov<0.60`), `score=0.68` chỉ xe QUA — đúng `svb:732` (không qual → không score).
- Cả 2: 0 console/page error, controls chạy qua `_qa_peer_c.mjs` (shots label-asserted).

## Kết luận

**PASS** — không có lỗi semantics blocking. 5 MINOR là citeline/phrasing, sửa nhanh. Không approve action nào thay C.

---

## REVERIFY sau `build-wave2-c.md` (A kiểm lại file C hiện tại) — **5/5 MINOR RESOLVED → PASS latest**

| # | Finding cũ | Verify trong file C mới | Kết |
|---|---|---|---|
| 1 | predicate `sd ≤ diag×ratio` sai dấu | `content/binder.js:19` "reject khi signed < −radius ∧ overlap≤0 ∧ không-evidence (+trong/−ngoài; **biên sd=−r → GIỮ**); inner ramp `:3241` + outer hard `0.85·diag (:2988,:3237)`"; `pages/binder.js:31` "keep khi sd≥−r ∨ ov>0 ∨ ev", `:47` đủ 3 khái niệm + boundary, `:131` label scene đúng | RESOLVED |
| 2 | arrival cite `:2248-2290` sai vùng | `content/binder.js:12,28-29` → `ArrivalClaim :1109`, `_bind_vehicle :1919`, `vehicle_id=gid :1946`, `_open_parking_episode :1953`; `pages/binder.js:28` khớp | RESOLVED |
| 3 | `tc:2331` gắn policy | `content/binder.js:37` policy `:2328`; `:41` expand-ratio `:1890→:2331`; `:47` limits tách rõ (policy `:2328`, expand `:2331`) | RESOLVED |
| 4 | OFF pure-ID thiếu nhãn | `content/binder.js:52` QA: "thuần track-ID **[minh họa]** — legacy thật: vision ∨ tracking_confirmed≥500ms (`svb:3852-3857`)"; `pages/binder.js:43` cùng ghi chú | RESOLVED |
| 5 | polygon line drift | `content/polygon.js:12` → ov `:725`, center `:728`, qualify `:729-731`, score `:739`; `pages/polygon.js:152` gate cite `:2988,:3241` | RESOLVED |

**Stamp: PASS bản hiện tại (sau corrections C).** Không re-screenshot diện rộng — thay đổi là text/ref (đã đọc trực tiếp); C full QA cuối sẽ phủ render.

**Flag ngược lại A (từ C report — đã sửa bởi A):** `content/roi.js` cũ có "cap ≤diag·ratio :2875" cùng lỗi sign — A đã sửa: reject `signed < −diag×initial_ratio ∧ ov≤0` (`svb:508-509`), radius chỉ tính tại `:2875-2876` (không phải predicate), recovery predicate `:3240-3247` + origin `:3237`, biên `sd=−r` GIỮ; limits/QA đồng bộ.
