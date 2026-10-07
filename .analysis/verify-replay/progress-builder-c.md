# Progress — Builder-C (verify-replay)

Updated: 2026-10-05 · Ownership: MEGAPLAN §2 (8 sessions C) + §4 V4 tool · Product HOLD (code/config/tests frozen — chỉ file mới).

## Done

- [x] Đọc `MEGAPLAN.md` + `STATUS.md`. Chưa có `verify_cur_*` → B (V1 replay) chưa xong; C không chạy replay.
- [x] §4 V4 tool chung: `backend/main_detect/experiment_test/verify/make_sheets.py` (file mới, không sửa file cũ).
  - Tái dùng `render_gid_frames.py` (import, không copy): bbox màu theo `association_state`, nhãn `G#|L<local>|<state>`, `CameraVideo`/`parse_frames`/`load_records`.
  - Thêm overlay config hiện tại: ROI polygon (cam) + slot polygons (xanh=free / đỏ=occupied từ `record.slots`, xám=chưa có record) từ `config/roi_mask_camN.json` + `config/parking_slots_camN.json`.
  - Chọn frame: `--frames` (list/range) · `--every N` giây (mẫu đều ≥1 frame/2s/cam khi N=2 — **không** dùng "12/phút" vì lệch số học: 2s×25fps=50 frame) · `--windows`/`--windows-file` (span thô → pad ±15 → gom cửa sổ `--merge-gap` → mẫu `--window-step` 5).
  - Output: `--out` (mặc định `.analysis/verify-replay/sheets/<session>`) — `sheet_NNNN.jpg` lưới `--grid CxR` (mặc định 3x3, cell 640px, JPEG q85) + `index.json` (sheet → cells {frame_idx, cam, has_record}) cho truy vết V5.
  - `--session` (predictions) tách `--video-dir` (raw_cam*.mp4) — cùng pattern B dùng cho replay (`--session verify_cur_* --video-dir <record>`).
- [x] V2 căn chỉnh trên 8 session C: frame 1 + mid × cam1/cam2 → `alignment/<session>/sheet_0001.jpg` (8 sheet, 32 cell). **Đã xem mắt cả 8 sheet.** Report: `V2-alignment-C.md`.
- [x] Doc tool chung: `V4-tool-c.md` (CLI + `--windows-file` schema + cohort V1).
- [x] Contract chốt với A (verify qua source): `frame_from/to` trong flags JSONL là **span thô chưa pad** → `make_sheets` tự pad ±15 + gom cửa sổ chồng/gần (`--merge-gap`) đúng §4 trước khi lấy mẫu. Test thật: `flags/session_thai6.jsonl` 1485 span → 28 cửa sổ → 916 frame.
- [x] Base frame xác minh: `frame_idx` 1-based, first=1/last=frame_count (thai8: 1952) khớp `frame_timestamps.csv`; tool đọc video `idx-1` — không off-by-one.
- [x] Cohort V1: chỉ `verify_cur_session_*` FINISH/PASS trong `V1-replay-results.md` (B); không dùng `verify_cur_test1`/`verify_cur_rt_*` pilot hay `verify_cur_runtime_*` aux.

## Checkpoint V3–V4+V5 (2026-10-05, ghi giữa chừng theo LEAD)

Nguồn dữ liệu: **`verify_cur_session_*` hiện-tại** (predictions replay config mới), video `raw_camN.mp4` từ dir record gốc. KHÔNG dùng overlay/preds gốc làm finding.

### V3 auto-scan (scan_frames.py trên verify_cur_*)

| session | frames | flags | phân bố |
|---|---|---|---|
| verify_cur_session_hiep_sang7 | 817 | 121 | SLOT_BINDING 29, ID_FRAGMENT 25, TRACK_LOST_EARLY 61, ROI_MISMATCH 6 |
| verify_cur_session_hiep_toi5 | 806 | 133 | ROI_MISMATCH 45, TRACK_LOST_EARLY 45, SLOT_BINDING 30, ID_FRAGMENT 11, BBOX_JUMP 1, DATA_INTEGRITY 1 |
| verify_cur_session_hiep3 | 826 | 65 | SLOT_BINDING 31, TRACK_LOST_EARLY 17, ID_FRAGMENT 15, BBOX_JUMP 1, DATA_INTEGRITY 1 |
| verify_cur_session_hiep_sang8 | 929 | 127 | TRACK_LOST_EARLY 68, SLOT_BINDING 30, ID_FRAGMENT 23, ROI_MISMATCH 5, GID_NEW_LINEAGE_LOSS 1 |
| verify_cur_runtime_session_bt | 1529 | 172 | TRACK_LOST 63, ID_FRAG 52, ROI 26, TRACK_JUMP 1 |
| verify_cur_session_thai8 | 1952 | 203 | TRACK_LOST 74, ID_FRAG 65, ROI 33, SLOT_BIND 30, HANDOFF 1 |
| verify_cur_session_thai7 | 2872 | 347 | ID_FRAG 149, TRACK_LOST 116, ROI 45, SLOT_BIND 33, HANDOFF 2, TRACK_JUMP 1, DATA_INTEG 1 |

Chi tiết bảng scan: `V3-scan-C.md`.

Output: `flags/verify_cur_<s>.jsonl` + `flags/verify_cur_<s>.summary.json` + `windows/verify_cur_<s>.events.txt` (span first-last từ summary `event_windows`).

### V4 sheets (make_sheets.py: --every 2.0 + flags±15 merge + events±15, step 5, cam both)

| session | frames mẫu | unique (cam,frame) cells | sheets | cửa sổ sau merge |
|---|---|---|---|---|
| hiep_sang7 | 143/817 (17.5%) | 286 | 32 | 1-77, 83-632 |
| hiep_toi5 | 143/806 (17.7%) | 286 | 32 | 1-144, 183-670 |
| hiep3 | 134/826 (16.2%) | 268 | 30 | 1-610, 791-830 |
| hiep_sang8 | 175/929 (18.8%) | 350 | 39 | 1-77, 114-725, 828-904 |
| runtime_session_bt | 306 | 612 | 68 | 1-1540 (merge gần trọn) |
| session_thai8 | 391 | 782 | 87 | 1-1964 (merge trọn) |
| session_thai7 | 575 | 1150 | 128 | 1-2881 (merge trọn) |

Thêm set uniform riêng (convention A, view hết được): `sheets_uniform/verify_cur_<s>` — bt 7 sheets/62 cells · thai8 9/80 · thai7 13/116.

→ `.analysis/verify-replay/sheets{,_uniform}/verify_cur_<s>/sheet_NNNN.jpg` + `index.json`.

### V4 eyeball coverage thật (own-review; V5 = cross-check A sau khi ERRORS-A freeze)

Đếm từ `index.json` theo sheet đã mở — không suy từ tổng render:

| session | sheets xem (đợt đầu) | uniform 2s (cả 2 cam) | sheets skip (main-set) |
|---|---|---|---|
| hiep_sang7 | 32/32 main | 17/17 | 0 |
| hiep_toi5 | 32/32 main | 17/17 | 0 |
| hiep3 | 23/30 main | 17/17 | 7 (mid-window lặp) |
| hiep_sang8 | 24/39 main | 19/19 | 15 (mid-window lặp) |
| runtime_session_bt | 7/68 main + 7/7 uniform | 31/31 | 61 (merge 1-1540 tĩnh) |
| session_thai8 | 3/87 main + 9/9 uniform | 40/40 | 84 (merge 1-1964) |
| session_thai7 | 5/128 main + 13/13 uniform | 58/58 | 123 (merge 1-2881) |

(Bảng cell-union mới nhất ở dòng dưới; dense/dense2/events/help sets đều xem hết trong phạm vi ghi.)

- **Union cells đã xem mắt (final):** sang7 **576** · toi5 **550** · hiep3 **548** · sang8 **464** · bt **532** (∪A 472) · thai8 **905** · thai7 **1182** (∪B 1078) · thai5 **2425** → **7182 tổng** (`windows/viewed_all.pkl`). Uniform-2s đủ **8/8**.
- Rare flags: HANDOFF_ERROR thai8 f1377-89 + thai7 f761-772 **cùng chữ ký gid5/gid3** (pattern hệ thống) + thai7 cam2 f2084-2112 gid7/gid1.

### Dense-5 event coverage theo 5 nhóm §4 (review LEAD)

Trích `identity_events`+`parking_events` → `windows/event-groups.json` (5 nhóm). **Định nghĩa LEAD đúng:** FULL = viewed frames phủ pad±15 với gap ≤5 mỗi cam (không cần trùng phase mod-5 với từng event); PART = còn lỗ >5; SKIP = 0 cell. Bug densegaps-v1 đã sửa: v1 merged-ranges neo step-5 tại range-start (lệch phase) → densegaps2.txt per-frame render đúng.

| session | windows | strict F/P/S (gap≤5 rule) |
|---|---|---|
| sang7 | 16 | **16/0/0 FULL** (dense 22 + dense2 18 + events + uniform đều xem hết) |
| toi5 | 13 | **13/0/0 FULL** (dense 16 + dense2 18 + uniform) |
| hiep3 | 18 | **18/0/0 FULL** (dense 21 + dense2 23 + events 3) |
| sang8 | 16 | **16/0/0 FULL** (dense 18 + dense2 18 + uniform) |
| bt | 34 | **34/0/0 FULL** — A help 30/30 ∪ C uniform |
| thai8 | 48 | **48/0/0 FULL** (dense 66 + dense2 29/64 + gap-fix; clamp đuôi max-pred 1952) |
| thai7 | 75 | **75/0/0 FULL** — B help 120/120 ∪ C uniform 13 + gap-fix events f2645-2690 (lấp lỗ B 2643-2689) |
| thai5 | 74 | **74/0/0 FULL** — uniform 88/88 + dense 87/87 + dense2 120/120 + events 1/1 |

**294/294 windows FULL — 0 PART / 0 SKIP** (strict recompute `windows/viewed_all.pkl`, clamp [1,max-pred-frame]).

### Findings sơ bộ (chưa chốt — chi tiết trong ERRORS-C)

- `SLOT_BINDING_ERROR` "vision-occupied w/o tracking": xe đỗ yên cả session → motion tracker không có track; màu slot đỏ khớp xe thật trong sheet → **đúng thiết kế, không phải lỗi** (HIGH confidence, sẽ ghi S3/known-behavior).
- `ROI_MISMATCH` (toi5 45 cờ, cụm f241-318 lid 2/3): SUV đen cam1 góc trái-trên sát mép ROI — anchor rơi ngoài polygon; box vẫn bám xe → edge-case hình học, S3.
- `DATA_INTEGRITY` toi5 f95-96 "capture gap": bất thường timestamp record, không thấy lỗi hình ảnh ở sheet_0005.
- Coasting linger: box vàng `L14`/`L7`/`L13` ở mép frame nhiều chục frame không vật — mẫu ghost/coasting-edge, sẽ ghi MEDIUM.
- Đã verify predictions: KHÔNG có duplicate `local_track_id` trong cùng frame (kiểm sang7 f570-635) — nghi ngờ label trùng trên sheet là đọc nhầm, không report làm lỗi.

### Pending

- [x] `ERRORS-C.md` + `ERRORS-C.json` §5 đủ 7 session PASS (E-C-001..006 + U1..U4 + non-errors); `V3-scan-C.md` ghi bảng scan.
- [x] Eyeball `runtime_session_bt` + `session_thai8` + `session_thai7`: uniform 100% + rare-flag windows; skip phần giữa cửa sổ merge (đếm rõ).
- [x] `session_hiep_thai5` registry PASS 3977/3977 → V3 xong (822 flags: ID_FRAG 361, TRACK_LOST 331, ROI 76, SLOT_BIND 32, TRACK_JUMP 15, BBOX_JUMP 6, GID_LINEAGE 1); 74 event windows (5/15/23/15/16).
- [x] **thai5 V4 xong**: uniform 88/88 (160/160 cells) · dense 87/87 · dense2 120/120 · events 1/1 → 296 sheets, 2425 cells; 74/74 windows FULL. Thấy: machinery churn lớn (new/matched/coasting/merged trên xe thật = nguồn 822 flags), ghost-coasting stack `gidNULL` mép ngoài ROI (E-C-006), không defect type mới.
- [x] V5 cross-check A lượt 1 — seed 20261005, 4/16 sample + 5 audit CONFIRMED; resample pool cuối khi A xong 2 session dài.
- [x] Recompute strict-FULL cả 8 + đồng bộ ERRORS-C.md/json (done — xem bảng trên).

## V2 kết quả (8 session C)

| session | frames | mid | verdict |
|---|---|---|---|
| session_hiep_thai5 | 3977 | 1988 | ALIGNED |
| session_thai7 | 2872 | 1436 | ALIGNED |
| session_thai8 | 1952 | 976 | ALIGNED |
| runtime_session_bt | 1529 | 764 | ALIGNED |
| session_hiep_sang8 | 929 | 464 | ALIGNED |
| session_hiep3 | 826 | 413 | ALIGNED |
| session_hiep_sang7 | 817 | 408 | ALIGNED |
| session_hiep_toi5 | 806 | 403 | ALIGNED |

ROI (vàng) ôm đúng mép thảm, slot polygons khớp vạch sơn ở cả frame đầu lẫn giữa → **không có evidence `config_era_suspected` về geometry** trên 8 session C. Lưu ý: màu occupied/free trong sheet đến từ `predictions.jsonl` **gốc** (record cũ), không phải kết quả replay current — verdict chỉ giới hạn ở căn chỉnh geometry 2 mốc; phán quyết state chờ V3/V4 trên `verify_cur_*`.

## Coverage mắt thật (honest)

- Đã xem: 32 cell V2 (f1 + mid × 2 cam × 8 session) + 2 sheet sanity tool.
- Chưa xem: bất kỳ cửa sổ cờ V3/V4 nào — V3 tool của A tồn tại (`scan_frames.py`) nhưng V3 chính thức chạy trên replay output; chưa chạy.

## Blocked / pending

- [ ] V3 auto-scan + V4 sheets + V5 review trên `verify_cur_<session>` × 8 — **BLOCKED**: chờ B tạo replay outputs (V1 là độc quyền B).
- [ ] Khi có outputs: chạy `scan_frames.py` (A) → flags → `make_sheets.py` `--windows-file` + `--every 2.0` → review → `ERRORS-C.md`/`ERRORS-C.json`.

## Files created (this task)

- `backend/main_detect/experiment_test/verify/make_sheets.py`
- `.analysis/verify-replay/alignment/{session_hiep_thai5,session_thai7,session_thai8,runtime_session_bt,session_hiep_sang8,session_hiep3,session_hiep_sang7,session_hiep_toi5}/` (8 × sheet_0001.jpg + index.json)
- `.analysis/verify-replay/V4-tool-c.md` + `.analysis/verify-replay/V2-alignment-C.md`
- `.analysis/verify-replay/progress-builder-c.md` (this)

Không đụng `src/`, `two_camera.py`, `runtime_server.py`, `config/*`, `tests/*`. Không quét `.venv`/output-tree đệ quy.


## 2026-10-05 checkpoint — V4-help cho A: session_hiep_thai1 (event-dense5)
- V1 all-18 PASS; thai1 6050/6050 (`verify_cur_session_hiep_thai1`).
- Extract 5 nhóm event runtime → `windows/event-groups-thai1.json`: entry 5 · exit 109·29win · parking 277·28win · occlusion 240·22win · handoff 66·32win = **116 windows** (697 event-hits).
- Merged pad±15 → 29 ranges, cần 704 frame/cam = **1408 cells** (~157 sheets) → render `sheets_v4h_thai1/` (pad0 step5, anchor đúng lo-15).
- Proxy-limit ghi rõ: entry=global_id_created / exit=expire+departure* là event-stream proxy, không phải GT vào/ra vật lý.
- A tự làm V2/V3/uniform/findings; C chỉ phủ event-dense + ghi `V4-help-C-thai1.md` (sheetIDs/unique/F-P-S/evidence §5). Không sửa file A, không replay.
- Đồng thời §5-C đã chuẩn: status enum CONFIRMED/UNSURE/REJECTED + harm_status tách, confidence HIGH/MEDIUM/LOW, cause_category theo enum §5.6 + reason, instance có cell+frame+t_s, repro full path runnable từ `backend/main_detect`.

## Thai1 event-dense — chia QA (moi nhat)
- Phan cong: A nhan sheets_v4h_thai1 0036-0096 (61 sheets); C: 0001-0035 + 0097-0157. C xem luon 0158-0162 (tail f5723-5812) la extra coverage thuc, ghi rieng.
- **C xem xong actual**: `sheet_0001`-`sheet_0035` (35 sh, f65-1091) + `sheet_0097`-`sheet_0162` (66 sh, f2865-5812). Overlap 0036-0060 (25 sh, f1091-1851) da xem truoc split — thuoc A-part, union merge.
- C-side coverage (1126 cells, 563/cam): **85/116 FULL**, 4 PART + 27 SKIP — tat ca nam trong f1856-2864 = pham vi sheets A 0036-0096, union se ve FULL neu A du cell. Khong can render bo sung phia C.
- Findings: khong defect moi. "O xanh co xe" 3x3 = track-box phu len slot do — da chot bang zoom probes f1721/f2920/f3218/f4940/f5504/f5788 (occupied do khop record exact). Magenta-merge/yellow-coasting tren xe that dung occlusion windows.
- Report: `V4-help-C-thai1.md` (sheetIDs/F-P-S/findings/limits). Cho A bao 61 sheets+IDs de merge union.
- E-C-005: giu 1 rejected + 2 unsure (pending B bo sung); ERRORS-C.json/MD da dong bo.

## 2026-10-06 ~01:45 — Thai1 union CLOSED + V5-C resample xong (DEVIN manager tiep quan)
- A nop `V4-help-A-thai1-part.md` (61/61 sheets, 549 cells, NO_ERROR). **Union C∪A = 162/162 sheets, 1450 cells (725/cam) → 116/116 windows FULL ca 2 cam, 0 PART/0 SKIP.** Khong can render bo sung.
- **V5-C final resample** (pool A freeze =13, seed 20261005, k=3): {E-A-020, E-A-036, E-A-042} → 3/3 A-status upheld, 0/3 type-FP. Ghi `V5-C.md` muc "Final resample". V5 3 chieu (A→B, B→C, C→A) da du.
- `INBOX-C.md` tao: C het viec QA chay duoc; con campaign-level ERRORS-SUMMARY + QUESTIONS-FOR-USER + V6 gate (cho lenh). Freeze set-level PASS phia B; per-file baseline 148-file khong truy cap duoc (han che ghi ro).
