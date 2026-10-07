# V4-help-B — QA mắt `verify_cur_session_thai7` (hỗ-trợ C theo §4)

Owner B · chỉ đọc artifacts + data, không sửa files của C, không replay thêm.
Session: `session_thai7` — official PASS 2872f (registry exit 0,
`completed_replay`). Phần-này giao C merge vào manifest 5-nhóm / ERRORS-C.

## Coverage actual
- Tool: `make_sheets.py` (A) — windows file
  `flags/verify_cur_session_thai7.keyevents.txt`; grid 3×3, cell 640px,
  `--cam both`; dense **step-5** (mặc-định tool).
- Windows nguồn: 15 span ±15 quanh **591 key-event frames** trích từ
  `identity_events`/`parking_events`/`parking_recovery` (entry/exit/parking/
  occlusion/handoff/gid/lost/expired/merge/recovery — loại trừ rejection-noise
  `slot_recovery_candidate`, `association_rejected_*`, `insufficient_strict_*`
  không phải sự-kiện identity).
- Tool pad+merge → **9 mega-windows**: 1-518, 537-670, 734-1118, 1157-1305,
  1316-1544, 1570-1958, 1980-2226, 2234-2642, 2690-2896.
- Output: `sheets_cur/verify_cur_session_thai7_keyevents/` — **120 sheets**,
  1078 cells = **539 unique frames × 2 cams** (index.json: cam1=539,
  cam2=539, `has_record=true` hết).
- **Eyeball: 120/120 sheets — FULL, 0 skipped.** Mọi cell trong 9 windows
  được xem; không chỉ 1 cell/sự-kiện.

## Verdict tổng — OBSERVED-CLEAN
Không CONFIRMED defect nào trong toàn-bộ event windows. Slot-state khớp
occupancy mọi frame; transit cars giữ `matched` ổn; không overlap-pair
>0.25 trong observations tại các frame nghi (data-check §dưới).

## Findings theo §5 (observations — KHÔNG vào error-count)
| # | Hạng-mục | Trạng-thái | Ghi-chú |
|---|---|---|---|
| O-B-006 | boundary ghost boxes (`coasting`/`frozen`) trên lối-gỗ trống — góc phải-trên cam1/cam2, mép-trái, bottom-left | OBSERVED/scope | Ngoài-vùng ô-quản-lý; không slot-impact |
| O-B-007 | xe xanh-nhạt `lid23` đỗ mép-trên (ngoài grid) — nhãn dao-động `matched`↔`frozen_ambiguous`↔`new_tentative` | OBSERVED/scope | Xe thật, vị-trí ổn; churn trạng-thái ở biên, không đổi slot |
| O-B-008 | xe máy `lid16` mép-phải cam1 — `matched` liên-tục >100f, states matched↔frozen↔coasting | PASS | Đứng-yên → freeze đúng cơ-chế |
| O-B-009 | tentative churn `lid13/14` góc-trái-dưới cam1 ~f40-90 (xe-đen mép-khung) | OBSERVED/scope | Biên-entry, không vào slot |
| O-B-010 | `lid19+? new_tentative` thoáng hàng-dưới (~sheet 49) | OBSERVED | Transient 1-2 frames |
| O-B-011 | `lid51`+`lid52` cùng `coasting` overlap IoU 0.33 cam1 **f2850** — 1 frame | OBSERVED/transient | Không lặp ở f2804/2870; không phải dup bền |
| O-B-012 | visual "stacked magenta `frozen_ambiguous`" quanh xe-máy mép ~f2720-2765 cam1 (sheets 114-115) | GIẢI-THÍCH | Data: cam1 `observations=0` @f2745 — tất-cả đã suspend khi park. Stack nhãn = `parking_episodes`/slot labels, **không phải duplicate tracks** |
| O-B-013 | SUV đen cam2 ~f1521-1541 trông-như 2-box (sheet 63-64) | GIẢI-THÍCH | Data: không observation-pair IoU>0.25 @f1521/1531/1541 — không duplicate |
| O-B-014 | slot conflicts: **0** slot có 2 gid `parked` đồng-thời; **0** gid parked 2 slot cùng-frame (scan toàn 2872f) | PASS | — |
| O-B-015 | `parking_episodes` tích-lũy: gid2→6 slots, gid1→3, gid7→2 — sequential released→parked, không đồng-thời | OBSERVED | Session dài, xe được xếp-lại nhiều lần (lịch-sử hợp-lệ) |
| O-B-016 | handoff/gid events: `handoff_opened`×14, `global_id_created`×6, `recovered`×10, `occlusion_group_opened`×7/expired×13 — không visual-anomaly ở các windows | OBSERVED | — |

## Data verification đi-kèm
- IoU-scan observations tại f{1521,1531,1541,2705,2745,2785,2804,2850}:
  chỉ 1 cặp >0.25 (O6, transient).
- `parked_identity_reservations` cuối: gid7→C10, gid2→A09 — hợp-lệ.
- `max obs/frame=12` — xe đỗ rời `observations` khi bound (cơ-chế, đã học
  ở toi6). `obs=0` trên cam1 @f2745 là bình-thường.

## Handoff cho C
- C merge các observation O-B-006..O-B-016 vào manifest nhóm tương-ứng (scope/boundary/
  mechanism); không error E-B mới cho thai7.
- Repro sheets:
  `python experiment_test/verify/make_sheets.py --session experiment_test/output/verify_cur_session_thai7 --video-dir experiment_test/output/session_thai7 --cam both --grid 3x3 --cell-width 640 --quality 80 --windows-file ../../.analysis/verify-replay/flags/verify_cur_session_thai7.keyevents.txt --out ../../.analysis/verify-replay/sheets_cur/verify_cur_session_thai7_keyevents`
