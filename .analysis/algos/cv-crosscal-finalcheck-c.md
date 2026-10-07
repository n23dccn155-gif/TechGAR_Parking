# cv-crosscal-finalcheck-c.md — Đối chiếu cuối E/F trong builder-b.md vs findings `cv-crosscal-review-c.md`

- **Phạm vi**: E1–E5, E7–E9, F1–F8 (16 ID) — bản `builder-b.md` hiện hành sau khi B merge corrections.
- **Không xét**: E6/E10 (A đã báo), F9 (alias → owner C, canonical `replay-timestamp-pairing` đã verify trong dossier C).
- **Phương pháp**: đọc lại section hiện hành + chạy verifier mới `finalcheck-verify-ef-c.py` (Python local, deterministic — **không** sửa `cross-verify-c.py` lịch sử, không đọc source mới).
- **Kết quả verifier**: **64/64 assertions PASS** so với semantics thật; 2 assertion chứng tỏ expected dossier còn sai (§2).

## 1. Findings cũ — trạng thái sau merge (10/10 CLOSED)

| Finding trước | Verdict cũ | Hiện hành | Trạng thái |
|---|---|---|---|
| E1 fallback `world=px` + cờ approx | PARTIAL | `crop_origin + local_px`, "tuple thường, không có cờ `approx`", `[sim]` badge ghi đúng là chú thích giáo dục; Sample B `(35,45)` | **CLOSED** |
| E2 đơn vị lookahead | FAIL | toàn bộ đã chuyển sang **frames**: `t_edge = dist_px / v_px_per_frame`, `lookahead_frames=16`, gate `|v|>1.0 px/frame`, TTL 2 dạng (`handoff_ttl=45` frames / `handoff_ttl_seconds`); Sample A `1.25 frames ≤ 16` | **CLOSED** |
| E3 chia fps fallback | FAIL | 2 nhánh tách rõ: frame-fallback `velocity_world·elapsed_frames` **không chia fps**; nhánh giây yêu cầu `handoff_ttl_seconds` + `velocity_world_per_second`, ngược lại `×25.0` hard-code; Samples đúng cả 2 nhánh `(102.4,50)` | **CLOSED** |
| E4 cost đại diện | PARTIAL | gate cứng trước cost + **4-term literal** `0.55/0.30/0.10/0.05`, reject `>0.92`, `[sim] cost→10` gán nhãn đúng; Samples verify `0.201 / 0.4575` | **CLOSED** |
| E5 gộp cơ chế | PARTIAL | tách **3 đường A/B/C** rõ: unique-2-chiều chỉ ở đường calibrated; B greedy sort-cost mint GID mới; C single-join `if camera_transforms: return None` (legacy); Sample B trình bày đúng A-skip vs B-b1-win | **CLOSED** |
| E8 công thức score | PARTIAL | **6-term literal** `0.35/0.25/0.15/0.10/0.10/0.05` + `min(time,topology)` + 3 hard-reject (teleport/camera_topology/stable_wrong_direction); Sample A `0.72 ≥ 0.5` verify đúng. *Còn 1 lỗi số nhỏ ở sim-aside — §2* | **CLOSED** (riêng aside: OPEN-1) |
| F3 reviewed_fit accept | FAIL | chuỗi gate đầy đủ: `reviewed_line_fit` chỉ trong nhánh `rectangle_line_v1` (status+visual_review+fit_ready+8 điểm+cameras+fit_gate); `status="reviewed_fit"` standalone → **REJECT** gate 2; Samples A(passed→ok)/B(reviewed_fit→reject) đúng; adjacency `{cam1:right→cam2, cam2:left→cam1}` literal | **CLOSED** |
| F4 multiples/ceiling thiếu | PARTIAL | `SLOT_MATCHING_MULTIPLES {1.75,2.75,1.75,0.50}` literal + `min(configured,derived)` ceiling + thứ tự override>configured/derived>fallback; Sample A 4 giá trị `875/1375/875/250`, Sample B 4 case resolve | **CLOSED** |
| F5 deviation%-gate | FAIL | đúng 2 gate: `|Δaspect|>0.005` + `|sx−sy|>max·0.005`; **không còn** `max_deviation` (ghi rõ "không tồn tại trong code"); `H'=H@S` nhân phải, cột translation giữ nguyên — Sample A `[[4,0,10],[0,4,20],[0,0,1]]` verify đúng, chỉ rõ `S@H` là sai thứ tự | **CLOSED** |
| F8 job_seq/applied_seq | PARTIAL | ghi rõ "**Không tồn tại `job_seq`/`applied_seq`**" — 3 cơ chế thật: one-pending-job `parking_futures` + timestamp-monotonic `accept_evidence` + `result_age_s = max(cam_ts−job.ts, mono−submitted)` + `worker_over_deadline`; Samples A(accept 0.3≤2.0)/B(3 reason) verify đúng | **CLOSED** |

**Giữ nguyên PASS** (không đổi từ vòng trước, samples re-verify PASS trong verifier mới): E7 (stale 12s + reachable limit), E9 (alias chain/canonical), F1 (≥4 pairs, det), F2 (3 ngưỡng literal), F6 (120ms/3 reads catch-up), F7 (2-điều-kiện needs_frame — *sample A đã sửa, xem §2b*).

## 2. Findings MỚI trong bản hiện hành (2 mục — chỉ tồn tại thật)

| # | ID | Loại | Chi tiết | Bằng chứng verifier |
|---|---|---|---|---|
| OPEN-1 | **E8** | Numeric (sim-aside) | `[sim]` 3-term ghi `w=[0.5,0.3,0.2]` trên `(dir 0.9, dist 0.8, app 0.6)` "cho `0.75`" — thực `0.5·0.9+0.3·0.8+0.2·0.6 = `**`0.81`**. Đề xuất: sửa số thành 0.81 hoặc đổi trọng số; chỉ là aside giản lược, không ảnh hưởng policy chính. | `E8.A [sim] 3-term value → 0.81` |
| OPEN-2 | **F7** | Expected sai | Sample A ghi `needs_frame@0.35 = true (… đủ interval)` — theo chính pseudocode dossier, publish f3@0.3 đặt `last_submitted=0.3` → `0.35−0.3 = 0.05 < 0.15` → **false**; chỉ true từ `t ≥ 0.45`. Đề xuất: đổi mốc thành `@0.45` hoặc ghi expected=false@0.35. | `F7.A needs@0.35 → False`; `needs@0.45 → True` |

~~Không phát hiện vấn đề khác trong 16 ID hiện hành.~~ E10 được B viết lại tốt (phân biệt `exited`/`expired`, `parked` override) — ngoài scope review, không kết luận.

## 2b. CLOSURE — 2 OPEN findings (report v1.1, bản builder-b hiện hành post-fix)

LEAD xác nhận B own-review đã sửa; re-check trên bản hiện hành:

- **OPEN-1 → CLOSED**: E8 `[sim]` aside hiện ghi `0.45+0.24+0.12 = `**`0.81`** — khớp bằng chứng `E8.A [sim] 3-term value → 0.81`.
- **OPEN-2 → CLOSED**: F7 Sample A đã có event `needs_frame@0.35` với expected **`false`** (`0.35−0.3 = 0.05 < 0.15`, ghi rõ interval đo từ `last_submitted` — lần publish được nhận, không từ request) + event `needs_frame@0.45` expected **`true`** (`0.45−0.3 = 0.15 ≥ 0.15` — đúng biên inclusive). Sửa tốt hơn đề xuất: giữ cả hai mốc để dạy cả false-case và boundary-case.

**Trạng thái cuối**: **12/12 findings đã báo trong `cv-crosscal-review-c.md` + finalcheck — CLOSED hết**; 6 ID giữ PASS từ vòng trước (E7, E9, F1, F2, F6, F7-sample-mới). Không còn OPEN nào trong 16 ID E/F đã review.

### Giới hạn quyền chứng (ghi rõ cho hồ sơ)

- Quyền chứng E/F hiện hành = **`finalcheck-verify-ef-c.py` (64 assertions, PASS 64/64)** — fixture do C viết và chạy trên giá trị thật, không chỉnh sửa sau khi phát hiện lỗi.
- `cross-verify-c.py` (lịch sử, nhóm B/C1–C5) **không được dùng làm bằng chứng độc lập** cho closure này — file từng bị B patch/revert, byte-exact không xác nhận.
- Closure dựa trên đọc lại section hiện hành + verifier — **không đọc lại source production**; nếu source đổi sau review, cần re-check mới.
- Không mở rộng scope: E6/E10/F9 chưa nằm trong quyền chứng này.

## 3. Assertion coverage

- **64 assertions** trong `finalcheck-verify-ef-c.py`: E1×3, E2×5, E3×4, E4×5, E5×3, E7×3, E8×5, E9×1, F1×2, F2×2, F3×6, F4×7, F5×4, F6×3, F7×6, F8×4.
- **64/64 PASS** theo giá trị thật; trong đó 2 assertion (OPEN-1, OPEN-2) khẳng định expected dossier lệch số thật.
- Chạy lại: `python .analysis/algos/finalcheck-verify-ef-c.py` (Windows py launcher hoặc python3).

## 4. Kết luận

- **10/10 correction cũ + 2/2 finding mới = 12/12 CLOSED đúng semantics** (xem §2b) — kể cả các điểm nhạy: `H@S` nhân phải, frame-vs-second velocity 2 nhánh, `reviewed_fit` không đứng một mình, 4 derived multiples + min-ceiling, mailbox `needs_frame` là liveness predicate (interval đo từ `last_submitted`, biên `@0.45` inclusive), F8 không có seq nào.
- Không còn OPEN nào trong 16 ID E/F đã review.
- Giới hạn: review tĩnh + fixture toán — không đọc lại source rộng; nếu B chỉnh sâu hơn nữa trong các hàm lớn (E7/E9) thì các chi tiết đã pass ở mức section-level.
