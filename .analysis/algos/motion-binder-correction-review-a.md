# Review log — motion-binder-correction-a.md

**Bản**: REPLACEMENT-READY cho 19 sections `builder-b.md` (A1, A2, A5, A7, A9, A10, A12, B5, B7, B8, B10, B11, D1, D3, D4, D7, D8, D9, D10), theo findings `cv-motion-binder-review-a.md` (vòng revised). Không sửa dossier B/source/web.

## 1. Coverage

| Nhóm | Sections | Trạng thái |
|------|----------|-----------|
| A | A1, A2, A5, A7, A9, A10, A12 | 7/7 replacement hoàn chỉnh |
| B | B5, B7, B8, B10, B11 | 5/5 |
| D | D1, D3, D4, D7, D8, D9, D10 | 7/7 |

Mỗi section đủ field bắt buộc: Nhóm/Tiên quyết/Liên quan, Code (`path:dòng` literal), Vai trò, Input/Output (typed), Pseudocode đánh số, Cấu trúc, Độ phức tạp code+sim, Edge cases, Failure modes, `Thực tế vs mô phỏng` + `[sim-omits]`, Sample A (thường) + Sample B (biên) JSON độc lập, Expected đã verify, Storyboard, Thư viện ngoài.

## 2. Sửa đổi chính vs bản cũ

| ID | Sửa cốt lõi |
|----|-------------|
| A1 | input `gray` → **`frame BGR`** (`:768`); gate marker kép `reject_cast_shadows && bg` (`:780-789`) |
| A2 | morph chain thật `OPEN3→dilate5×2→CLOSE5` (`:559-573`) + `refs=∅→zeros` (`:548-549`, gate ĐÓNG) + non-multiscale 1 ref + support-dilate 17×17 (`:792`) |
| A5 | **thứ tự 11 gate thật** (`:836-1085`): floor→ROI→occlusion→0.22→oversized→aspect→anchor→priority→motion(px+ratio)→shadow; sample B mới chứng minh fill-ratio fail |
| A7 | chroma = **chromaticity L1 BGR** (`:682-684`) không phải saturation; residual scaled (`:685-687`); explained triple-conjunct (`:691-695`); params literal `[0.32,0.62]/0.10/0.08/0.75/0.18` + `reject_cast_shadows` default-off |
| A9 | `same_echo` 4-điều-kiện **không IoU** (`:1102-1110`); suppress chỉ khi `IoU≥0.25 && hist≤0.12` (`:1122-1132`) — IoU đảo; echo không chồng → giữ, defer sang assignment; spawn-side `:2322-2334` |
| A10 | `1.6·median` (không `max`), **all member centers** + group pre-formed proximity (`inter≤0.20`, `gap≤0.4·diag`, `clean_obs≥3`) |
| A12 | `excess ≤ |v_axis|·1.75 + 0.3·size_axis` per-axis (`:1263-1275`) — bỏ `cos(axis,vel)`/`elong≥2` bịa; `gate_assignments` valid=`swapped−direct≥2·margin && direct<1.2`, recovering 3 frame |
| B5 | **4 term** `[0.45,0.25,0.20,0.10]` (`:1761-1766`) — bỏ direction term bịa; `size_error=log-ratio` (`:1756-1760`); `max_distance·min(1.25,1+inv/60)` (`:1691-1694`) |
| B7 | scope đúng: **chỉ split-margin tracks** (`invisible>0||merged_freeze` `:1685-1686`); `margin=0.08·(2−lineage)` (`:1921`); defer→`split_recovering`; `clear_evidence` 4-điều-kiện + streak 3 (`:1939-1985`); track thường skip (`:1990-1992`) |
| B8 | `cost=floor+w·d` bịa → **4-term thường**; `gate=min(max_d, max(3,0.3·diag))` (`:1696-1701`); 5 gate: window 1.5s/3.0s (`:1642`), `0.30·diag` anchor, hist-required (`:1726`), `app≤0.30` + stale `≤0.22` (`:1732-1737`), size `[0.35,2.80]` (`:1749-1755`) |
| B10 | `d=√(1−BC)` cv2 (`:141-149`) — expected `0.134→0.366`; quality `0.5·size+0.3·fg+0.2·aspect` + 2 hard-zero gates (`:112-126`), q_min `0.5` |
| B11 | `0.5·nearest+0.2·coverage+0.2·aggregate+0.1·best3` (`:339-344`); nearest theo chiều gallery nhỏ (`:327-331`); `support=min(len)` (`:347`); expected `0.0826→0.1553`, `0.626→0.6889` |
| D1 | output `{vo,so,center_proximity,score}` (`:740-744`); `qualifies=(inside&&vo≥0.35)||vo≥0.60` (`:729-733`); `prox=1−dist/diag`; `score=0.7vo+0.2so+0.1prox` — expected `0.793→0.862` |
| D3 | thêm **commit gates**: `streak≥2 + vehicle_id=None` (`:1176-1182`), `lost_at_s+delay 0.35s` (`:1184-1193`), `competing margin 0.15` (`:1196-1206`), `newer-motion disproof` (`:1223-1254`); score 4-term literal (`:1160-1164`) → `0.6123` |
| D4 | `vision=0` → **`vehicle_id=None` ngay** (`:1548`) + `tracking_state=recovery_pending` — bỏ claim "giữ nội bộ"; restore precondition `empty_obs>0||!predeparture` (`:2546-2557`); legacy branch phân biệt (`:2595-2604`) |
| D7 | `radius=diag·lerp(0.05→0.45, age/1.0s)` (`:603-609`) — sample `[5,45,85]`→`[5,25,45,45]`; guard-cancel `>2.5s` + extension `created+5+15` + `provisional_expired_owner_still_parked` (`:1745-1911`) |
| D8 | **fragment-side trigger**: unbound track gần ô occupied (`signed≥−0.05·diag || overlap>0`), nearest-slot + ambiguity gap `0.15` (`:505-517`), token `motion_started_in_parked_slot`, refresh `empty_obs=0` (`:535-550`) — bỏ "owner overlap giảm + vel ra" |
| D9 | radius = **signed-dist polygon** (không `‖first−origin‖`); outward 3-path (legacy `moved≥3&&outward≥1.5&&gain≥0.75` / world / escape) — bỏ `dir_cos` gate; size `[0.40,2.50]`/`[0.15,6.0]`; app limit `0.55/0.70`; `obs≥3` + `confirmed_empty`; cost `0.45·spatial+0.35·(app/limit)+0.15·size+0.05·dir` (`:3467-3472`) |
| D10 | `cost_limit=0.999` (`:3520`, không 0.95); **ambiguity margin 0.15** post-check (`:3542`); consume → episode **`released`/`departure_confirmed`** + `exit_pending` + cooldown `+2.5s` (`:2735-2750`) — bỏ "episode departing" |

## 3. Kiểm chứng

- **Verifier**: `.analysis/algos/verify-motion-binder-a.py` — python3 stdlib only, deterministic, port giản lược công thức đã sửa; **không** import cv2/numpy/lap.
- **Lệnh**: `cd /d/TechGar2/.analysis/algos && python3 verify-motion-binder-a.py`
- **Kết quả**: **`95 PASS / 0 FAIL`**.

| Block | Asserts | Nội dung verify |
|-------|---------|-----------------|
| A1 | 3 | fg_count samples (4 / 0 / 16) |
| A2 | 7 | count_short/long + union samples A,B |
| A5 | 7 | verdict thứ tự gate, ratio-fail 0.075, whole-scene |
| A7 | 8 | med_att/med_res/explained/shadow; 2 case not-shadow |
| A9 | 7 | same_echo, IoU=1/3, kept-list, owners, echo-lowIoU giữ |
| A10 | 4 | covering [[1,2]], single-member n/a, all-members-required, factor |
| A12 | 4 | explained/veto cases per-axis |
| B5 | 3 | size_error(1.5)=0.3938, cost=0.3669, gate→10 |
| B7 | 4 | defer/keep theo split-margin scope |
| B8 | 6 | verdict ok, gate=3.0, iou=6/21, cost=0.2809, app_stale, window reject |
| B10 | 5 | BC=√0.75, d=0.3660, quality 0.7/0/0 |
| B11 | 8 | pairwise ×4, distance 0.1553/0.6889, support 2, match verdicts |
| D1 | 5 | vo/so/prox/score=0.8617, null |
| D3 | 6 | qualified/inward-fail, score=0.6123, commit delay, margin |
| D4 | 2 | vehicle_id=None, token=true |
| D7 | 4 | radius [5,25,45,45] |
| D8 | 3 | token / far-skip / ambiguous-skip |
| D9 | 3 | qualified cost=0.3093, inward reject, app reject |
| D10 | 4 | consume winner, col_gap 0.35, ambiguous_reject, col_gap 0.04 |

## 4. Giới hạn

- **Không chạy pipeline thật**: tất cả expected là port giản lược chạy bằng script — đúng cho demo, không phải unit-test của code. `[sim-omits]` liệt kê phần bỏ từng section.
- **Chưa verify sâu**: `lapjv(extend_cost)` semantics nội hàm (demo dùng exhaustive + `unassigned=limit` — mô phỏng khai báo); `two_camera.py:1058-1590` recover pipeline chỉ đối chiếu qua codeRefs binder (D9 cite `batch_recover_ids` là nguồn chính); `_token_extension_blocker` chi tiết (D7 ghi như omitted-gate); `appearance_samples` nguồn đa dạng (B11 gom `[sim-omits]`).
- **cv2 BHATTACHARYYA trên Σ=1**: `√(1−BC)` khớp cv2 khi hist chuẩn hoá tổng-1 (samples demo); trên descriptor L2-norm thật, công thức đầy đủ mean-normalized khác — B11 aggregate dùng form đầy đủ (đã port vào verifier).
- **Line refs** trích theo bản source hiện tại tại thời điểm review (`motion_tracker.py` 2484 dòng, `slot_vehicle_binder.py` 3919 dòng, `tracklet_descriptor.py` 351 dòng, `occlusion_guard.py` 232 dòng); B merge thì neo bằng symbol, không neo số dòng.
- **Không lặp kiểm**: 13 mục owner B đã patch trước (B2/B3/B9/D5/D6/D11 pass re-check); C1–C5 owner C; E/F đang được B patch song song — ngoài phạm vi file này.
