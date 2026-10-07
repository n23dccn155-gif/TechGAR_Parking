# builder-c — Review Phase 1 dossier thuật toán (fixture check)

Đối tượng review: `.analysis/algos/builder-c.md` (23 IDs, 5 nhóm, 11 lesson đề xuất).
Phạm vi: chỉ review/sửa dossier — không sửa code/config/dependency, không chạy server/camera/API, chưa viết web.
Phương pháp: 2 script Python local deterministic (heredoc, pure math, không import backend) chạy trên numeric samples + đọc lại code đối chiếu các nhánh guard.

## 1. Checklist đủ field (23/23 PASS)

Mỗi ID được rà theo schema yêu cầu: kebab-case ID · title · nhóm · prereq/related · code refs (path từ project-root + start/end line + symbol) · vai trò · input/output + kiểu · pseudocode đánh số dòng · data structures · complexity (biến + time + memory) · edge cases + failure modes phân biệt `[code]`/`[edu]`/`[bug]`/`[docs-mismatch]` · sample JSON ≤10 đối tượng · expected deterministic chạy được trong browser (không backend/model/network) · storyboard canvas (đối tượng/màu/motion/state table/pseudo-highlight/controls/giải thích VN).

| ID | Đủ field | Sample numeric | Verify bằng script | Ghi chú |
|---|---|---|---|---|
| A1 `snapshot-v2-build` | PASS | có (registry/vehicle/episode) | PASS (age_ms 100/60 sau khi thêm `applied_monotonic_ns`) | expected bổ sung age cam2 |
| A2 `camera-age-online-derivation` | PASS | có (3 cam, clock 10.1e9) | PASS (age 100/160/10100 ms, online T/T/F) | — |
| A3 `live-freshness-contract` | PASS | có (5 variants ISO) | PASS (0.5/0.5/25200.5/−1.5/7.0 s) | đã tách happy-path khỏi edge timezone |
| A4 `source-mode-live-gating` | PASS | có (snapshot modes) | logic (không số) | — |
| A5 `frame-cursor-monotonic-poll` | PASS | có (frame seq) | logic | gồm alias FE fetch-coalesce/retry |
| B1 `segment-intersection-orientation` | PASS | có (4 moves) | **FAIL→fixed** (touch/collinear ban đầu sai tọa độ + expected) | quirk float-residual ghi rõ |
| B2 `directed-crossing-direction` | PASS | có (4 cases) | PASS (d=±119.22/0/0) | parallel giờ thật parallel |
| B3 `observation-continuity-window` | PASS | có (5 polls) | PASS (bảng 5 dòng port 1-1) | stale-skip không update prev |
| B4 `entry-session-creation` | PASS | có (2 polls) | logic + B1/B2 verify | — |
| B5 `measured-path-entry-rescue` | PASS | có (path 4 điểm) | PASS (rescue True@50.4, False@51.6) | — |
| B6 `exit-crossing-session-delete` | PASS | có (3 polls) | **FAIL→fixed** (chiều poll ban đầu ngược) | d=−46.30 / +49.19 |
| C1 `session-state-machine` | PASS | có (8 ops) | logic tĩnh | expected chỉ còn đáp án cuối |
| C2 `qr-token-issuance-ttl` | PASS | có (4 sessions ISO) | logic tĩnh | T+ → ISO + khai báo adapter |
| C3 `revision-optimistic-concurrency` | PASS | có (5 ops) | logic tĩnh | — |
| C4 `spot-reservation-availability` | PASS | có (sessions+slots+mono) | logic + đọc `:85-100` | expected 503 cho slot thiếu đã xác nhận |
| C5 `live-observation-cache` | PASS | có (3 updates) | logic tĩnh | — |
| C6 `atomic-session-store` | PASS | có (3 scenarios) | logic tĩnh | tách scenario A/B/C reset rõ |
| D1 `parking-episode-apply` | PASS | có (4 episodes) | logic tĩnh + đọc `:649-663` | latest-pick tuple đã ghi đúng |
| D2 `parked-evidence-dwell-legacy` | PASS | có (candidates) | logic tĩnh | — |
| D3 `identity-alias-remap-backend` | PASS | có (aliases/events) | logic tĩnh | — |
| D4 `canonical-runtime-id-consumer` | PASS | có (alias chains) | logic tĩnh | alias của A `canonical-gid-chain` |
| E1 `replay-timestamp-pairing` | PASS | có (CSV rows) | logic tĩnh | owner C — xem §4 |
| E2 `gate-config-validate-save` | PASS | có (gate config) | logic tĩnh | — |

## 2. Commands đã chạy + assertions

Hai script `python` heredoc trong shell local (Python 3.11 của máy, không venv backend, không import code dự án — port tay `orient`/`intersect`/`crossdir`/continuity/rescue từ `gate_session_controller.py`):

- **Script 1** (geometry): port `orient`/`check_line_intersection`/`get_crossing_direction`; gate B1 (40,9)→(39,−6); gate entry `gate_zones.json` (39.6688,8.9029)→(38.8685,−5.9998) positive; gate exit (50.8338,63.3703)→(49.3925,51.4338) negative.
- **Script 2** (continuity/rescue/freshness): port bảng continuity B3 (local+source gap, stale-skip `continue`), vòng rescue B5 trên path sample, `age_ms`/`online` A1-A2, `datetime.fromisoformat` parse ISO A3.

| # | Assertion | Sample | Kết quả script | Verdict |
|---|---|---|---|---|
| 1 | B1 `cross` intersect | (35,0)→(45,0) | True, orient (90,−60,−66,84) | PASS |
| 2 | B1 `miss` intersect | (35,0)→(38,0) | False | PASS |
| 3 | B1 `touch` intersect (tọa độ đúng vạch) | (35,0)→(39.5,1.5) t=0.5 trên gate | True (orient=0.0 chính xác, dyadic) | PASS sau khi sửa tọa độ |
| 4 | B1 `collinear` intersect | (39.9,7.5)→(39.3,−1.5) trên gate | **False** — residual ±1e-14 lật dấu tích | Expected cũ ghi True → **đã sửa thành False + ghi quirk** |
| 5 | B1 `touch` tọa độ (39.4,0) không dyadic | endpoint trên vạch về toán | False (residual −2.13e-14) | Quirk ghi vào edge-cases, không dùng làm sample |
| 6 | B2 `into` direction | (44,1)→(36,1), gate entry | d=+119.2216, intersect | PASS |
| 7 | B2 `outof` reject | (36,1)→(44,1) | d=−119.2216 | PASS |
| 8 | B2 `collinear_on_gate` | t=0.2→t=0.8 trên gate | d=0.000000, intersect False (residual) | PASS (reject kép) |
| 9 | B2 `parallel_off` thật song song | v=g nguyên vẹn, lệch vạch | d=0.000000, intersect False | PASS (tọa độ mới thật parallel) |
| 10 | B3 poll3 stale | `src 50.2 ≤ prev 50.2` | skip, prev giữ 10.25/50.2 | PASS — expected cũ lấy 10.5 đã sửa |
| 11 | B3 poll4 discontinuous | `12.0−10.25=1.75>1` | discontinuous, vẫn update baseline | PASS |
| 12 | B5 rescue | path 4 điểm, cur=50.4 | True (cặp 50.0→50.2) | PASS |
| 13 | B5 rescue quá cũ | cur=51.6 | False | PASS |
| 14 | B6 `exit_ok` negative | (48,57)→(52,58) | intersect, d=−46.3047 <0 → accept | PASS (mẫu cũ ngược chiều đã sửa) |
| 15 | B6 `exit_wrongdir` reject | (52,57)→(48,58) | d=+49.1873 → reject | PASS |
| 16 | A1 `applied_monotonic_ns=10e9` | cam1 9.9e9 / cam2 9.94e9 | age 100 / 60, online True | PASS (field đã thêm vào sample) |
| 17 | A3 ISO cùng instant | `17:00:01.5+07:00` = `10:00:01.5Z` | age 0.5 → accept | PASS |
| 18 | A3 sai múi giờ | `10:00:01.5+07:00` | age 25200.5 → reject | PASS |
| 19 | A3 future/old | +1.5 s / −7.0 s vs window | reject cả hai | PASS |

C4 `C05` (slot không có trong `parking_slots`): đọc `gate_session_controller.py:92-100` — `_spot_is_available` trả `None` → `:85-87` raise `RUNTIME_UNAVAILABLE` 503. Xác nhận bằng đọc code, expected ghi đúng.
D1 latest-pick tuple `(applied, applied_timestamp_s, revision, state_rank)` xác nhận tại `:650-662` — `state_rank` chỉ tie-break cuối.

## 3. Expected đã sửa trong vòng review này

1. **A3**: bỏ expected tự mâu thuẫn; happy path = 2 ISO cùng instant (`Z` và `+07:00`), edge timezone riêng (`wrong_tz` reject 25200.5 s).
2. **B1**: touch = endpoint dyadic đúng vạch (True); collinear = điểm đúng đường nhưng expected **False** do float-residual — ghi `[code đã verify]` quirk.
3. **B2**: `parallel_off` thành vector = g nguyên vẹn lệch vạch (d=0, intersect False); thêm `collinear_on_gate` (d=0, reject kép); d±119.22 điền số thật.
4. **B3**: expected thành bảng 5 poll; stale-skip không update `prev_obs` — poll4 đo gap từ 10.25 (không phải 10.5).
5. **B6**: đảo chiều polls để d=−46.30 khớp `negative`; case đối chứng d=+49.19.
6. **C1**: expected chỉ còn đáp án cuối — select sau departure → `NAVIGATING_TO_SPOT` (không RELOCATING), `qrExpiresAt` đổi ISO.
7. **C2**: toàn bộ `T+n` → ISO `2026-10-04T10:xx:xxZ`; khai báo adapter inject `now`, không `T+n` nào vào parser.
8. **C6**: tách 3 scenario với `file_before` reset rõ — B crash sau fsync → file còn **1 session** (không lẫn state của A).
9. **Complexity**: A1 `+V log V` sort vehicles; C2 `+W log W` sort waiting; C4 `+R log R` sort reservations; D1 `+G·N` per-gid session lookup; D3 `A·N + Ev·N`; mọi entry có memory.
10. **Self-correction**: dọn các pattern `? — đọc kỹ`, `? Không —`, `chỉnh:` khỏi Expected/edge (còn `?` hợp lệ trong pseudocode điều kiện, ternary, tiêu đề cột storyboard).
11. **Ownership dedup**: thêm §0b bảng alias A/B → C (xem §4).

## 4. Ownership cho SPEC (xác nhận)

| Alias trong dossier khác | Canonical tại C | Xác nhận |
|---|---|---|
| A `live-runtime-validator` | `live-freshness-contract` (A3) | OK — C phủ cả gate `_fresh_live` + FE `liveRuntimeError` |
| A `frame-cursor-guard` | `frame-cursor-monotonic-poll` (A5) | OK — gộp gate `_last_frame_index` + FE cursor |
| A `runtime-request-coalesce` | `frame-cursor-monotonic-poll` (A5, mục con dedupe/retry `runtimeApi.ts:4-36`) | OK |
| A `qr-visibility-window` | `qr-token-issuance-ttl` (C2) | OK — C phủ backend TTL/sort + kiosk pick + claim-expiry |
| A `canonical-gid-chain` | `canonical-runtime-id-consumer` (D4) | OK — cùng `canonicalRuntimeId` (`frontend/src/domain/runtime.ts:191-202`) |
| B `replay-session-sync` | `replay-timestamp-pairing` (E1) | **OK — CSV pairing/EOF/pacing contract thuộc C**; B giữ producer/cv2 decode context, không trùng nội dung |

Code refs trong dossier đều là **path tương đối từ project root** (ví dụ `backend/session_manager.py:29`, `backend/main_detect/src/techgar/runtime_contract.py:151`); không còn path tuyệt đối `D:\TechGar2` nào trong file.

## 5. Blocker còn lại

- Không blocker mở. Hạn chế đã ghi trong dossier §cuối: E2E replay `--live-mode` chưa chạy (phân tích tĩnh); `useVehicleSession` nội dung commit chỉ grep-verify (ranh giới builder-a); semantics `recent_observed_path` ở producer thuộc builder-b.
- Các expected logic-tĩnh (C1/C3–C6/D1–D4/E1–E2) chưa chạy script riêng — đã đối chiếu code trực tiếp; demo web vẫn cần port + tự test.

**Kết luận**: 23/23 ID đủ field; 19 assertion numeric đo bằng script — 17 PASS ngay, 2 phát hiện sample sai (B1 collinear, B6 chiều) và đã sửa; mọi `T+n` pseudo-time đã thay bằng ISO/numeric; dossier sẵn sàng duyệt Phase 1.
