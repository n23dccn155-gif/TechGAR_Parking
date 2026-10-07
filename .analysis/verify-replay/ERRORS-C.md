# ERRORS-C — V4 own-review findings (builder-c, verify-replay)

Ngày: 2026-10-05 · Nguồn: **`verify_cur_session_*` hiện-tại** (V1 FINISH/PASS) + `raw_camN.mp4` gốc. Không dùng preds/overlay gốc làm finding.
Sessions đã scan V3 8/8. Eyeball V4 hoàn tất **8/8**: `hiep_sang7`, `hiep_toi5`, `hiep3`, `hiep_sang8`, `runtime_session_bt` (C uniform + A event-dense help `sheets_v4h_bt` 30/30), `session_thai8`, `session_thai7` (C uniform + B event-dense help `sheets_cur/..._keyevents` 120/120), `hiep_thai5` (C: uniform 88/88 + dense 87/87 + dense2 120/120 + events 1/1). **294/294 event-windows FULL** (tiêu chí gap≤5 §4), 0 PART, 0 SKIP.
Sheet sets: `sheets/<s>` (uniform+windows merged), `sheets_uniform/<s>` (--every 2.0 riêng, view hết), `sheets_dense/<s>` + `sheets_dense2/<s>` (event-dense step-5 đúng window-anchor), `sheets_events/<s>`; help từ A (`sheets_v4h_bt`) + B (`sheets_cur/verify_cur_session_thai7_keyevents`).

## Errors (E-C-NNN, 1 type mỗi mục)

### E-C-001 · ID_FRAGMENT/NEW_ID — chuỗi re-id trên xe mép ROI cam2 — **CONFIRMED** (HIGH)
- **Session:** `verify_cur_session_hiep_sang8` · **cam2** · f129–889 (t≈5.2–35.6s).
- **Instances:** sang8 cam2 — chuỗi `new lid 33→45` (≥10 cờ `ID_FRAGMENT`, spans f129-167 / 561-600 / 843-889), mỗi lần "near lid N that stayed vanished"; sang8 cam1 f639-710 (lid 31,32). Cluster riêng khỏi E-C-006: các lid này **có detections thật** (xe mép ROI), khác phantom fvc≤4.
- **Visual:** xe xanh-lợt mép phải-dưới cam2 đổi `G#?|Lxx|coasting/matched` liên tục qua `sheets/sang8` sheet_0006/0013/0028–0032/0037–0038 (ô `cam2 f…`) + dense2 sheets.
- **Metric:** `NEW_NEAR_PX`=150px; cờ ví dụ `{frame_from:843, frame_to:882, note:"new lid 43 near lid 14"}` — lid43 thật sự là ghost riêng (xem E-C-006 i4), nghĩa là fragment + ghost chồng nhau ở cùng góc.
- **Severity:** S2 · **Status: CONFIRMED** · **Confidence:** HIGH · **Harm:** CONFIRMED · **Cause:** `local-lifecycle` · `config_era_suspected`: false.

- **Repro:** .venv/Scripts/python.exe experiment_test/verify/make_sheets.py --session experiment_test/output/verify_cur_session_hiep_sang8 --video-dir experiment_test/output/session_hiep_sang8 --windows "129-167,561-600,843-889" --cam 2.

### E-C-002 · GID_NEW_LINEAGE_LOSS — gid mới thay gid cũ khi handoff
- **Session:** `verify_cur_session_hiep_sang8` · **cam2** · f561–600 (t≈22.4–24.0s).
- **IDs:** `new gid 3 near gid 1 that stayed vanished` (measure 15.9px, threshold 150px).
- **Visual:** sheet_0028–0030 ô `cam2 f584-644`: box `G#1|L40|matched` cam1 SUV vẫn sống trong khi cam2 xuất hiện gid mới gần vị trí gid1 đã mất.
- **Severity:** S2 · **Status:** CONFIRMED · **Harm:** UNSURE · **Confidence:** MEDIUM — cờ `GID_NEW_LINEAGE_LOSS` chắc chắn fired; chưa chứng minh 100% cùng xe vật lý (không GT identity). · **Cause:** `cross-camera-handoff`
- **Reason:** lineage không giữ khi object re-appear cam2; có thể liên quan E-C-001.
- **V5-B audit (củng cố phenomenon):** lid35/gid1 kết thúc cam2 (397,118) ~f301; lid40/gid3 xuất hiện f595 tại (388,119) — ±9px; gap-density check `sheets_cur/xcheck_c002_gap` f300-550 cho thấy xe đen đỗ liên tục qua 6 mốc ⇒ **same physical vehicle**; lineage loss thật; harm cuối UNVERIFIED (slot occupancy không đổi).
- **Repro:** .venv/Scripts/python.exe experiment_test/verify/make_sheets.py --session experiment_test/output/verify_cur_session_hiep_sang8 --video-dir experiment_test/output/session_hiep_sang8 --windows "546-615" --cam 2.

### E-C-003 · ROI_MISMATCH — anchor ngoài polygon (có thể EXPECTED)
- **Sessions:** `verify_cur_session_hiep_toi5` cam1 f241–318 (45 cờ, lid 2→3); `sang7` cam2 f2 + cam1 f191-199; `sang8` cam1 f2-4 (lid 1,3,19).
- **Visual:** SUV đen góc trái-trên cam1 toi5 (sheet_0011–0014 ô f248-318): bbox bám đúng xe, nhưng `anchor_pixel` (tracker_center) rơi trên sàn gỗ ngoài ROI.
- **Metric:** `anchor outside ROI` trong scan (threshold: inside-polygon check).
- **Severity:** S3 · **Status:** UNSURE · **Harm:** UNSURE · **Confidence:** HIGH — anchor ngoài ROI ở xe sát mép **có thể là expected** · **Cause:** `config-mask/calibration` của convention anchor (không thấy hệ quả tracking xấu trong mẫu). Chờ LEAD/A định danh expected-vs-defect.
- **Repro:** .venv/Scripts/python.exe experiment_test/verify/make_sheets.py --session experiment_test/output/verify_cur_session_hiep_toi5 --video-dir experiment_test/output/session_hiep_toi5 --windows "241-318" --cam 1.

### E-C-004 · DATA_INTEGRITY — capture gap
- **Sessions:** `verify_cur_session_hiep_toi5` f95–96 (t≈3.8s); `verify_cur_session_thai7` f2194–2195 (t≈87.8s).
- **Visual:** toi5 sheet_0005 — không gián đoạn hình ảnh; gap ở timestamp/record level.
- **Severity:** S3 · **Status:** CONFIRMED · **Harm:** UNSURE · **Confidence:** MEDIUM · **Cause:** `data/replay` — gốc capture record, không phải lỗi replay.
- **Repro:** xem `experiment_test/output/session_hiep_toi5/frame_timestamps.csv` f95-96; `session_thai7` f2194-2195.

### E-C-005 · HANDOFF_ERROR — *claim* GID lineage mất khi object qua cam — **REJECTED-as-claimed** (V5-B world-space audit)
Claim gốc (giữ lịch sử): 3 cờ `new gid near vanished gid` được đọc là mất lineage qua cam. **V5-B chiếu world-space (`two_camera.shared_cm_01.json`): 1/3 disproven (có ảnh), 2/3 UNSURE:**

| instance | ids | world-cm separation | gap | verdict |
|---|---|---|---|---|
| thai7 cam1 f761–772 (t30.4–30.9s) | gid3(cam2)→gid5(cam1) | (7.1,78.6)@f424 → (−4.9,−18.1)@f772 = **~97cm** | ~348f | **REJECTED** — xe gid3 vẫn đỗ yên cam2 trong sheets f766-786 (untracked); gid5 là xe khác |
| thai8 cam1 f1377–1389 (t55.1–55.6s) | gid3(cam2)→gid5(cam1) | (20.3,77.4)@f242 → (−6.7,−17.2)@f1389 = **~97cm** | ~1147f | **UNSURE** — lid41 coasting chết f281; spot cam2 trống obs f1351-1551 nhưng sheet_0062 không đủ phân-giải chốt xe-còn/đã-rời |
| thai7 cam2 f2084–2112 (t83.4–84.5s) | gid1→gid7 (cùng cam2) | (31.0,14.1)@f1414 → (3.3,5.9)@f2105 = ~29cm | ~700f | **UNSURE** — lid83 xe mới mép-trên cam2; `dormant_reid_rejected` (dir=0.008); không chứng minh cùng/khác xe |

- **Cells:** thai8 `sheets/sheet_0062` f1371-1391; thai7 `sheets/sheet_0093-0095` f761-772 + sheet_0094 f2084-2112.
- **Metric (cờ gốc, giữ):** `new gid near vanished gid`, NEW_NEAR_PX=150px — cờ scanner so **pixel/stale-position**, không chiếu world → artifact khả-dĩ; ít nhất 1 case bị bác bằng ảnh.
- **Severity:** S2 · **Status:** REJECTED (claim như phát biểu không chứng minh — đang chờ B bổ-sung/downgrade: thai8 97cm+46s một-mình chưa đủ kết luận khác xe) · **Harm:** UNSURE · **Confidence:** HIGH (audit world-space) · **Cause:** `cross-camera-handoff` (heuristic cờ, không phải defect engine) · `config_era_suspected`: false.
- **Lưu ý B:** runtime `dormant_reid_rejected` đã dùng lý do world-space (`position 31.2>25.9`, `same_camera_stale`, `trajectory_stable_wrong_direction`) — engine KHÔNG merge mù; boundary lid-churn thật thuộc phạm vi E-C-001.
- **Repro:** .venv/Scripts/python.exe experiment_test/verify/make_sheets.py --session experiment_test/output/verify_cur_session_thai7 --video-dir experiment_test/output/session_thai7 --windows "746-787,2069-2127" --cam both; thai8: --session experiment_test/output/verify_cur_session_thai8 --video-dir experiment_test/output/session_thai8 --windows "1362-1404".

### E-C-006 · GHOST_TRACK — phantom `coasting`/`new` trên vùng TRỐNG — **CONFIRMED** (per-instance đo lifetime)
Rule typing: box trên vùng trống = ghost; box trên vật thật ≠ ghost. Instance bảng dưới đã đo trong `predictions.jsonl` (`fvc`=`fragment_visible_count` = số frame track thật sự được detect; `inv`=`invisible_count` max).

| # | session/cam | frames (t) | lids | số đo | evidence sheet/cell | status |
|---|---|---|---|---|---|---|
| i1 | thai5 cam1 | f392–420 (t15.7–16.8s) | 8,9,10,14,15,16 | ≥6 box, fvc≤2, inv≤21, xy-spread (0,0) static | `sheets_dense2/…thai5` sheets ~0004-0006 | CONFIRMED |
| i2 | thai5 cam1 | f~985–1040 | 67,78–87 | ≥10 gidNULL coasting đồng thời, fvc≤6, inv≤22, static | `sheets_dense2/…thai5/sheet_0042` cells f1013-1020 | CONFIRMED |
| i3 | thai5 cam2 | f1719–1790 | 125,129–134,136–138 | ~8 gidNULL stack x=0-358 mép trái (nền trắng/sàn), fvc≤10, inv≤25 | `sheets_dense2/…thai5/sheet_0072` cells f1753-1767 | CONFIRMED |
| i4 | sang8 cam2 | f882–925 (t35.3–37.0s) | 43,45 | 30f + 37f span, fvc≤4, inv≤31, góc trái-trên nền trống | `sheets/sang8` sheet_0001 + dense2 | CONFIRMED |
| i5 | thai8 cam2 | f2–42 (t0–1.7s) | 32,33,35 | 41f span, fvc=1, inv≤40, static corner | `sheets/thai8` sheet_0001 | CONFIRMED |
| i6 | toi5 cam2 | f2–37 (t0–1.5s) | 7,14 | 36f span, fvc=1, inv≤35, mép trái-dưới | `sheets/toi5` sheets 0008-0010 | CONFIRMED |
| i7 | thai7 cam1+cam2 | f2851 (t114s) | cam1 lids 50–56 (6 box), cam2 lid113 | burst gidNULL coasting fvc≤4, inv≤36 | `sheets_uniform/thai7/sheet_0013` | CONFIRMED |
| i8 | bt cam2 | f2–42 startup burst | 33 stale_prediction boxes (A E-ABT-1), all gid NULL | ~40f concurrent phantoms | `sheets_v4h_bt` sheet_0001 cell2 | CONFIRMED (A evidence) |

- **Severity:** S2 · **Status: CONFIRMED** · **Confidence:** HIGH · **Harm:** UNSURE (B audit: ghost tự-die 44–238f, không thấy slot/identity impact) · **Cause:** `detection/morphology` — phantom births theo cụm (startup + sau motion-burst), fvc thấp (≤10), gid luôn NULL; false tracks thật trên vùng trống, có TTL tự-hồi.
- **Không gộp:** hiep3 cam2 `L12`/`L14` (fvc 87/106, gid 1 sau đó) = xe thật → chuyển U1, KHÔNG tính ghost. thai8 lid37 (fvc137, gid1) = xe thật → bỏ.
- **Reason:** motion residues/edge blobs + burst tạo nhiều tentative tracks không bao giờ được confirm; coasting kéo dài ~20-40f.
- **Repro:** .venv/Scripts/python.exe experiment_test/verify/make_sheets.py --session experiment_test/output/verify_cur_session_hiep_thai5 --video-dir experiment_test/output/session_hiep_thai5 --frames "392,1015,1757" --cam both; thai8: --session experiment_test/output/verify_cur_session_thai8 --video-dir experiment_test/output/session_thai8 --frames "2,21,42"; toi5: --session experiment_test/output/verify_cur_session_hiep_toi5 --video-dir experiment_test/output/session_hiep_toi5 --frames "2,21,37"; sang8: --session experiment_test/output/verify_cur_session_hiep_sang8 --video-dir experiment_test/output/session_hiep_sang8 --windows "867-940".

### E-C-007 · FALSE_DETECTION — box trên vật thật KHÔNG-phải-xe — **CONFIRMED** (tách khỏi ghost)
Vật tồn tại thật (khác ghost vùng trống E-C-006) nhưng detector gán label xe/track.

| # | session/cam | frames | ids | số đo | evidence | status |
|---|---|---|---|---|---|---|
| i1 | bt cam1 | f1500–1529 (alive@EOF) | lid21 `[1183,96,53,51]` | fvc 4, inv≤11, drift y 88px — cột gỗ mép trên | `sheets_v4h_bt` s27-30 (A E-ABT-2) | CONFIRMED |
| i2 | bt cam2 | f1500–1529 | lid64 `[64,64,116,144]` | fvc 7, inv≤23 — fixture mép trái | như trên | CONFIRMED |
| i3 | bt cam2 | f1509–1529 | lid66 `[128,75,46,65]` | fvc 1, inv≤20, static | như trên | CONFIRMED |
| i4 | thai7 cam2 | ~f2851 (t114s) | box `matched` trên **tay operator** mép trái | sustained ≥1 uniform cell; burst gidNULL cùng frame f2851 (lids 106-111,113) | `sheets_uniform/thai7/sheet_0013` cell giữa-trái | CONFIRMED (visual) |

- **Severity:** S2 · **Status: CONFIRMED** · **Confidence:** MEDIUM · **Harm:** CONFIRMED · **Cause:** `detection/morphology` — object thật, sai class; không hại slot/identity vì gid NULL hoặc track ngắn.
- **Reason:** motion detection bắt chuyện động vật ngoài thảm (tay, fixture) — khớp pattern A CONFIRMED (test1 lid115 tripod).
- **Repro:** .venv/Scripts/python.exe experiment_test/verify/make_sheets.py --session experiment_test/output/verify_cur_runtime_session_bt --video-dir experiment_test/output/runtime_session_bt --frames "1500,1515,1529" --cam both; thai7: --session experiment_test/output/verify_cur_session_thai7 --video-dir experiment_test/output/session_thai7 --frames "2851" --cam 2.

## UNSURE (chưa đủ bằng chứng — không tính error)

- **U1 · Coasting bám XE THẬT mép frame (không phải empty space):** box `coasting`/`frozen` trên xe đỗ sát mép ROI/frame — object thật, track tồn tại hợp lệ; chỉ là track kéo dài không đo được → **EXPECTED/UNSURE** (không ghost). Giữ UNSURE cho thành phần lifetime chưa đo — cần `visible_count`/track-length để phân biệt. Riêng stack trên vùng trống đã nâng lên E-C-006; box trên vật non-vehicle lên E-C-007.
- **U2 · sang7 ~f330 `G#3|L10|coasting` cam2 vs `G#3|L8|matched` cam1:** nghi GID đặt nhầm xe — **đã verify predictions không có dup lid5 cam1 f570-635**; giữ UNSURE, cần frame-level check gid xuyên cam.
- **U3 · `merged_detection_frozen` bền ở góc frame (bt):** cam1 góc trái-trên + cam2 góc phải-trên giữ magenta `merged_detection_frozen`/`oversized` xuyên session trên vật tối ở mép thảm (sheets/ 0064, 0068 + uniform). Có thể là blob tối thật (mépp thảm cuộn/vật để) → machinery đúng — UNSURE, chưa tính lỗi.
- **U4 · TRACK_JUMP đơn lẻ:** bt cam1 f1427–28 lid19; thai7 cam2 f2–3 lid4 (startup). Single-frame, scene đông — UNSURE noise-level, chưa đủ bằng chứng lỗi.

## Observed — by design (không tính error)

- `SLOT_BINDING_ERROR` "vision-occupied w/o tracking" (~30/session ×4): xe đỗ yên cả session → không motion track; slot đỏ/xanh khớp xe thật trong mọi sheet → expected.
- `merged_detection_frozen`/`oversized_detection_frozen` cam2 hiep3 f386-471 (sheets 0018-0021): 2 xe đen kề nhau giữ merge đúng machinery — không lỗi. (Trường hợp bt góc frame bền cả session → tách U3.)
- `BBOX_JUMP` đơn lẻ toi5 f255-256 / hiep3 — cùng cụm E-C-003, không tách issue.
- `TRACK_LOST_EARLY` startup ~f2 (lid 1-2 sống 1-2f): warmup noise — expected, không tính lỗi.

## Coverage thật (đếm từ index.json theo sheet đã xem)

| session | frames | auto 100% | unique (cam,frame) xem (union, sets đã view hết) | uniform 2s | dense-5 status | flags-merge skipped |
|---|---|---|---|---|---|---|
| hiep_sang7 | 817 | ✓ | **576** (main 32/32 + dense 22/22 + dense2 18/18) | 17/17 ✓ | **16/0/0** | 0 |
| hiep_toi5 | 806 | ✓ | **550** (main 32/32 + dense 16/16 + dense2 18/18) | 17/17 ✓ | **13/0/0** | 0 |
| hiep3 | 826 | ✓ | **548** (main-uniform 16 + dense 21/21 + dense2 23/23 + events 3) | 17/17 ✓ | **18/0/0** | main ~14 mid-window lặp |
| hiep_sang8 | 929 | ✓ | **464** (main-uniform 19 + dense 18/18 + dense2 18/18) | 19/19 ✓ | **16/0/0** | main ~20 |
| runtime_bt | 1529 | ✓ | **532** (C uniform 7/7 ∪ **A help 472**, `sheets_v4h_bt` 30/30) | 31/31 ✓ | **34/0/0** | main 61/68 merge 1-1540 tĩnh |
| thai8 | 1952 | ✓ | **905** (uniform 9/9 + dense 66/66 + dense2 29/64 + gap-fix events) | 40/40 ✓ | **48/0/0** | main ~84 + dense2 35 dư-coverage |
| thai7 | 2872 | ✓ | **1182** (C uniform 13/13 ∪ **B help 1078** 120/120 + gap-fix f2645-2690) | 58/58 ✓ | **75/0/0** | main ~123; B loại rejection-noise khỏi windows |
| hiep_thai5 | 3977 | ✓ | **2425** (uniform 88/88 + dense 87/87 + dense2 120/120 + events 1/1) | 80/80 ✓ | **74/0/0** | flag-only sheets 63 không cần render |

**Tổng unique cells đã xem mắt: 7182** (union 8 session gồm help A/B, đếm từ `index.json` các set đã view — `windows/viewed_all.pkl`). Uniform-2s đủ **8/8** cả 2 cam. Cột dense-5 = window F/P/S theo rule gap≤5 (xem mục dưới).

## Dense-5 theo 5 nhóm sự kiện §4 (counts/windows/full/part/skip)

Windows trích từ `identity_events`+`parking_events` trong `predictions.jsonl` (`windows/event-groups.json`, cluster gap≤30f). **Định nghĩa chốt (theo LEAD):** FULL = viewed frames phủ `[lo−15, hi+15]` (clamp [1, max_pred_frame]) trên **cả 2 cam** với **gap tối đa ≤5** — không yêu cầu trùng phase/anchor mod-5 của từng event; PART = còn lỗ >5; SKIP = 0 cell xem. Event schema không có nhóm nào NOT_AVAILABLE.

**Kết quả strict cuối (recompute từ index.json của các set đã xem): 294/294 FULL · 0 PART · 0 SKIP.** Hai PART cuối đã vá bằng chứng cứ thật: thai8 windows @f1945 (view `sheets_dense2` sheet_0063/0064 f1930–1950 + uniform f1951, clamp đuôi tại max-pred 1952); thai7 parking @2677 (render+xem `sheets_events/` f2645–2690 lấp lỗ B-help 2643–2689).

**Proxy caveat:** `entry`=`global_id_created` và `exit`=`expired/departure` là **proxy từ event-stream**, không phải GT mọi lần xe vào/ra thật — một xe vào thật có thể không sinh `gid_created` nếu bị fragment, và `expired` có thể là track chết hạn không liên quan xe ra. Coverage FULL nghĩa là mọi window quanh *event đã ghi* được xem dense — không khẳng định 100% sự kiện vật lý thật đã được liệt kê.

Bảng window-counts (tất cả FULL sau strict recompute + gap-fix):

| session | entry | exit | parking | occlusion | handoff | tổng win | F/P/S |
|---|---|---|---|---|---|---|---|
| sang7 | 2 | 1 | 5 | 4 | 4 | 16 | 16/0/0 |
| toi5 | 3 | 1 | 3 | 1 | 5 | 13 | 13/0/0 |
| hiep3 | 2 | 2 | 5 | 3 | 6 | 18 | 18/0/0 |
| sang8 | 3 | 1 | 5 | 3 | 4 | 16 | 16/0/0 |
| bt | 4 | 9 | 8 | 7 | 6 | 34 | 34/0/0 |
| thai8 | 5 | 9 | 11 | 11 | 12 | 48 | 48/0/0 |
| thai7 | 5 | 14 | 20 | 22 | 14 | 75 | 75/0/0 |
| thai5 | 5 | 15 | 23 | 15 | 16 | 74 | 74/0/0 |

**Tổng: 294 windows — 294 FULL / 0 PART / 0 SKIP.** Coverage chứng minh bởi `windows/viewed_all.pkl` (viewed-cells union) + `index.json` từng set. bt FULL qua A help; thai7 FULL qua B help + C gap-fix; thai5 FULL toàn C (uniform 88 + dense 87 + dense2 120 + events 1 = 296 sheets).

**V5 cross-check (C→A):** xong lượt 1 — `V5-C.md`: seed 20261005, 4/16 sample (E-A-006/011/020/034 — 4/4 phenomenon CONFIRMED, harm UNSURE, 0 REJECTED) + audit ngoài-sample 5 findings CONFIRMED của A → 2 CONFIRMED-type / 1 REJECTED-type (E-A-002 ghost→stuck-track) / 2 UNSURE-type (mixed on-car/empty). Resample pool cuối khi A xong 2 session dài.
