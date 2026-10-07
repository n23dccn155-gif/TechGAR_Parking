# Peer review — pack C `pipeline-system.js` (bởi builder B)

**Verdict: PASS — CLOSED.** Cả 3 must-fix và 4/5 ghi chú non-blocking đã được C xử lý; 1 ghi chú còn mở là cực-minor. Không sửa file của C.

## Evidence (chạy lại trên bản C sau fix)

- Pack: `algo-web/packs/pipeline-system.js` — 59 320 bytes, **hash `sha256:c3fd2348aeca4674`**, 4 node `capture/snapshot/gate-session/navigation` · 8 scenario · **42 frame** (+1 frame freshness mới).
- Peer-check B-owned `_peer_check_c_by_b.mjs` (đã strengthen): **453 PASS / 0 FAIL** = 342 check gốc + **111 consistency check mới**.
  - Capture consistency: `state.skew_ms` recompute từ `|tA−tB|·1000`; `verdictOk` ↔ skew≤120; `pair=true` đòi ≤120; clock trong state khớp `tA/tB/catchupFrom`; `catchupFrom<tB`+flag; mọi `Nms` trong text là skew thật hoặc ngưỡng 120; cả 2 scenario nhắc 120ms.
  - Freshness: frame `stale` bắt buộc `state.age_ms>5000` + explanation nhắc `_fresh_live`/5s; coverage hiện diện.
  - Session: mọi `session.state` ∈ whitelist thật; cấm `CLAIMED`; `qrPct∈[0,1]`; qr-expiry có `SELECTING_SPOT`+`qr:false`; lifecycle: `PARKED` đến đúng frame episode, kết thúc = exit→deleted.
  - Navigation: nhắc cả 80 (callsite) lẫn 75 (default); two-way được giải thích; route nodes ∈ graph.
  - Toàn pack: không state `undefined/NaN/null`.
- Excerpt byte-match vs source: **17/17 PASS** (kể cả indent `@523` đã sửa).
- Root verifier: 342 PASS (theo LEAD) — checker B độc lập đồng ý và bổ sung 111 check.

## Must-fix — đóng

| # | Vấn đề (trước) | Trạng thái trên `c3fd2348` |
|---|---|---|
| 1 | Skew `30ms` khắp nơi vs default `--max-camera-skew-ms=120.0` | **CLOSED** — `skew<=120`, vạch `120/maxSkew`, label `120ms`, text `14ms<120ms`, edge `121ms>120ms`, header "skew default 120ms", cite `two_camera.py:1997`. Gauge `maxSkew=140` chỉ là scale hiển thị (giữ đúng như đề xuất). |
| 2 | `CLAIMED` làm session state | **CLOSED** — `STATE_COLOR` = 6 state thật `{WAITING_FOR_SCAN, SELECTING_SPOT, NAVIGATING_TO_SPOT, RELOCATING, PARKED, EXIT_NAVIGATION}`; scenario dùng `SELECTING_SPOT` sau claim, `NAVIGATING_TO_SPOT` sau select — khớp `session_manager.py:358/:380`. Whitelist check xanh. |
| 3 | Excerpt indent `gsc:524` (20 vs 16 spaces) | **CLOSED** — excerpt byte-match. |

## Non-blocking — trạng thái

| # | Ghi chú | Trạng thái |
|---|---|---|
| 4 | Comment `runtime_server.py:134` là MJPEG `_pending_frames` | **CLOSED** — `why` giờ ghi "cơ chế tại publish_snapshot :106-113… cùng ý đồ với comment MJPEG :134-135"; ref symbol đổi thành "latest-only frames MJPEG — cùng ý đồ". Không còn gán nhầm. |
| 5 | "adjacency chỉ from→to" thiếu two-way | **CLOSED** — `why` + frame 'Route found' ghi "edge `direction==='two-way'` được đẩy thêm chiều ngược (routeEngine.ts:22-26)"; graph minh họa có cạnh `['N2','N5','two']` vẽ mũi 2 đầu. |
| 6 | "≥2 quan sát" ≠ `observation_is_continuous` | **CLOSED** — `does` ghi đúng `observed ∧ previous ∧ now−prev_observed_at ≤1.0s ∧ source_is_continuous` cite `:487-493`; frame cắt-ENTRY nhắc lại "≤1.0s". |
| 7 | Thiếu coverage `_fresh_live` + frontend watchdog | **CLOSED** — frame mới 'Snapshot stale >5s → consumer từ chối' (`age_ms: 6200`, gate REJECT, frontend watchdog→unknown) + ref `_fresh_live` `:103` + overlay `stale` trong `drawSnapshot`. Claim "source_mode=live + cameras online + age_ms≤5000 + published_at ≤5s" khớp source `:103-127` từng điều kiện. |
| 8 | `close_session` CLI maintenance còn tồn (`session_manager.py:648`) | **OPEN (chấp nhận)** — pack chưa footnote; phát biểu "duy nhất exit crossing xoá" vẫn đúng trong runtime. Giữ làm ghi nhận, không blocking. |

## Verify chéo lần cuối (claims mới trong bản fix)

- `observation_is_continuous` — `gate_session_controller.py:487-493` khớp từng vế (`observed ∧ previous ∧ prev_observed_at ∧ now−prev ≤1.0 ∧ source_is_continuous`).
- `_fresh_live` — `:103-127`: `source_mode=='live'` + cameras dict + `online ∧ 0≤age_ms≤5000` + `published_at` age `[-1,5]s` — pack tóm tắt trung thực.
- `QR_DISPLAY_SECONDS=120.0` (`session_manager.py:29`); `isQrVisible` lọc `qrExpiresAt` (`EntryQRKiosk.tsx:15,38`); `claim_session` không check expiry.
- Heuristic `costPerMapUnit`→`heuristicScale` (`routeEngine.ts:38,46,49`); `spotEntryNodeIds` (:122,:127,:200); two-way (:24,:219).
- Skew numbers nhất quán ba lớp: scene `tA/tB` → state `skew_ms` → pill verdict — checker recompute đồng ý cả 10 frame capture.

## Ghi nhận còn lại (không blocking)

- Label QR `TTL {round(qrPct·120)}s/120s` đọc hơi mơ hồ (đó là *thời gian còn lại*, không phải TTL) — cosmetic, visual QA của C quyết.
- #8 `close_session` CLI footnote chưa có (đúng-runtime vẫn giữ).
- `drawCapture` dùng `pr` thô (không `ease`) cho `frac` — hợp lệ; pulseDot/flash theo progress đúng contract.

## Phạm vi

Review source-fidelity + deterministic contract qua peer-checker B-owned (đã strengthen consistency: skew/state/freshness/whitelist). **Browser/visual QA là của C** — ctx stub chỉ chứng minh no-throw; không tự approve web quality. Không sửa file C/SPEC/engine.
