# EVENT-WINDOWS-MANIFEST — dense-5 windows theo 5 nhóm §4 (chia QA)

Nguồn: `windows/event-groups.json` — trích `identity_events` + `parking_events` từ `predictions.jsonl` của `verify_cur_session_*`, cluster gap≤30f thành windows. File này là manifest tham chiếu cho A/B; builder C không sửa file của A/B.

## Mapping nhóm (event_type → group)

| group | event_type pattern |
|---|---|
| entry (xe vào khung) | `global_id_created` |
| exit (xe ra/rời ô) | `global_identity_expired`, `*departure*`, `*predeparture*` |
| parking (đỗ) | `slot_arrival_*`, `slot_candidate_*`, `parking_episode_opened/state_changed`, `vehicle_stopped_in_slot`, `parked_id_recovered`, `global_id_parked_reserved` |
| occlusion (2 xe gần/che) | `occlusion_group_*`, `merged_detection_frozen`, `oversized_detection_frozen`, `split_assignment_deferred`, `association_recovery_pending`, `association_deferred_competing_tracks`, `watershed_partition_provisional`, `new_local_id_deferred_unresolved_merge` |
| handoff (chuyển cam) | `handoff_*`, `global_id_recovered` |

## Phân công QA dense-5 (LEAD)

| session | owner | windows/5nhóm (entry/exit/park/occl/handoff) | trạng thái |
|---|---|---|---|
| runtime_session_bt | **A** | 34 (4/9/8/7/6) — flag-merge gần trọn 1-1540 | **DONE — 34/0/0 FULL** (`V4-help-A-runtime-bt.md` 30/30 ∪ C uniform) |
| session_thai7 | **B** | 75 (5/14/20/22/14) — merge trọn 1-2881 | **DONE — 75/0/0 FULL** (`V4-help-B-thai7.md` 120/120 ∪ C uniform + C gap-fix `sheets_events/` f2645-2690; B dùng key-events set riêng — loại `slot_recovery_candidate`, `association_rejected_*`, `insufficient_strict_*`) |
| thai8 + 4 short C (sang7/toi5/hiep3/sang8) | **C** | 16+13+18+16+48=111 | **DONE — 111/0/0 FULL** (`sheets_dense`+`sheets_dense2` per-frame render + uniform + gap-fix events) |
| hiep_thai5 | **C** | 74 (5/15/23/15/16) | **DONE — 74/0/0 FULL** (uniform 88/88 + dense 87/87 + dense2 120/120 + events 1/1 = 296 sheets, 2425 cells) |

**Định nghĩa chốt (LEAD):** FULL = viewed frames phủ `[lo−15, hi+15]` (clamp `[1, max-pred-frame]`) trên **cả 2 cam** với **gap ≤5** — KHÔNG yêu cầu trùng phase/anchor mod-5 của từng event; PART = còn lỗ >5 thật; SKIP = 0 cell. (Tiêu chí "≥½" và "trùng phase anchor" đều đã bị bác.) **Kết quả chiến dịch: 294/294 FULL · 0 PART · 0 SKIP.**

**Lưu ý anchor:** khi render dense cho một window `lo-hi`, step-5 phải neo tại `lo-15` (`range(lo-15, hi+16, 5)`), KHÔNG neo tại đầu merged-range — nếu ghi merged `a-b` vào windows-file tool sẽ neo tại `a` → lệch mẫu. Cách an toàn: ghi **mỗi frame expected một dòng** vào windows-file với `--window-pad 0 --window-step 5` (như `*.densegaps2.txt`).

## Windows per session (frame spans; pad ±15 khi render)

### verify_cur_runtime_session_bt (A) — 34 win
- entry: 53-53, 122-122, 242-242, 1378-1378
- exit: 206-216, 248-263, 492-532, 589-632, 751-751, 936-985, 1082-1082, 1124-1157, 1239-1261
- parking: 82-185, 510-543, 611-726, 758-854, 908-953, 1119-1119, 1157-1157, 1214-1355
- occlusion: 208-213, 590-611, 734-789, 902-905, 959-965, 1381-1433, 1501-1525
- handoff: 125-135, 533-535, 635-635, 883-908, 1157-1157, 1261-1263

### verify_cur_session_thai7 (B) — 75 win (per-group full list trong `windows/event-groups.json`)
- entry: 133, 401, 771-772, 804, 2112
- exit: 183, 216, 314-334, 440-461, 814-896, 1053-1088, 1239-1275, 1346-1370, 1694, 1736-1928, 2330-2408, 2531-2573, 2733-2762, 2839
- parking: 9-27, 62, 103-186, 329-334, 428-484, 548-609, 838-842, 892-943, 1033-1052, 1258-1262, 1353-1514, 1694, 1928-1934, 2040, 2078-2132, 2250-2304, 2353, 2409-2607, 2677-2783, 2819-2831
- occlusion: 111, 163-207, 417-488, 639-640, 794-841, 899-920, 977, 1008-1030, 1193-1196, 1350-1382, 1429-1447, 1601-1604, 1641-1662, 1741-1753, 1813-1871, 2025-2039, 2136-2196, 2318-2380, 2462-2467, 2568-2612, 2733-2756, 2823-2866
- handoff: 6, 79, 143-168, 334, 461-470, 804-904, 1262, 1371, 1928, 2113-2138, 2188-2194, 2409, 2576-2600, 2762

## Cách dùng với make_sheets.py

```
.venv/Scripts/python experiment_test/verify/make_sheets.py \
  --session experiment_test/output/verify_cur_<S> \
  --video-dir experiment_test/output/<S> \
  --cam both --grid 3x3 \
  --windows-file <file txt dạng a-b mỗi dòng> --window-pad 15 --window-step 5 \
  --out ../../.analysis/verify-replay/sheets_dense/verify_cur_<S>
```

`windows/verify_cur_<S>.events.txt` = span first-last theo event_type (từ V3 summary). `windows/event-groups.json` = per-event-type windows 5 nhóm, có `events` count + `windows` list.
