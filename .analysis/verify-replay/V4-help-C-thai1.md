# V4-help-C — thai1 sheet review (builder C part)

Session: `verify_cur_session_hiep_thai1` (official PASS 6050/6050). Render dir: `sheets_v4h_thai1/` (162 sheets, index.json). Windows source: `windows/event-groups-thai1.json` (116 windows / 5 nhóm runtime event). Mẫu: 1 cell = 1 frame / 2s-step (5f) / cam — theo §2.

## Sheet IDs đã xem thực (actual set, không đoán)

| Đoạn | Sheet files | Sheets | Frame range | Ghi chú |
|---|---|---|---|---|
| C assigned part 1 | `sheet_0001.jpg` – `sheet_0035.jpg` | 35 | f65–1091 | xem đủ từng sheet |
| C assigned part 2 | `sheet_0097.jpg` – `sheet_0157.jpg` | 61 | f2865–~5720 | xem đủ từng sheet |
| C extra (tail) | `sheet_0158.jpg` – `sheet_0162.jpg` | 5 | f~5723–5812 | vượt phân công 0097–0157, giữ làm coverage thực cho tail |
| Overlap pre-split (A's range) | `sheet_0036.jpg` – `sheet_0060.jpg` | 25 | f1091–1851 | đã xem trước khi nhận phân công mới; thuộc A-part 0036–0096, chờ union với báo cáo A (61 sheets) |

C-viewed cells total: **1126** (563 cam1 + 563 cam2), counting assigned + extra + pre-split overlap sheets.

## Coverage vs 116 event windows (criterion: gap ≤5f each cam, pad ±15f)

C-side only (tập C đã xem, chưa union A-part):

| Trạng thái | Số windows | Vị trí |
|---|---|---|
| FULL (đủ cả 2 cam) | 85 | toàn bộ windows trong f65–1851 ∩ C-cells và f2865–5812 |
| PART | 4 | `parking 1774–1881`, `parking 2747–2905`, `occlusion 1848–1850`, `exit 1847–1881` — đuôi/đầu window rơi vào sheets A 0061–0096 |
| SKIP (C chưa có cell) | 27 | tất cả trong f1939–2768 — nằm gọn trong phạm vi sheets A 0036–0096 |

→ Mọi PART/SKIP đều do range C bị cắt ở f1851 và f2865; union với A-part (61 sheets, f1091–2865) sẽ đưa về FULL nếu A báo đủ cell. Cần A gửi danh sách sheetID/cell đã xem để merge union, không đoán.

### Union merge (A-part đã nộp — `V4-help-A-thai1-part.md`)

- A: 61/61 sheets `sheet_0036`–`sheet_0096`, 549 unique cells (cam1 274 f1096–2860 / cam2 275 f1091–2860), NO_ERROR trong phần A.
- Union C∪A = **162/162 sheets** (toàn bộ set), **1450 cells** (725/cam).
- Recompute strict (pad ±15, gap ≤5f/cam): **116/116 windows FULL — 0 PART / 0 SKIP**: entry 5 · parking 28 · handoff 32 · occlusion 22 · exit 29.
- Không cần render bổ sung; mọi window đủ cả 2 cam.

## Findings (visual review)

- Không phát hiện slot-occupancy anomaly mới. Mọi nghi vấn "ô xanh có xe" ở tỉ lệ 3×3 đã được giải quyết bằng zoom probes: green tight-box = live/parked **track box** phủ lên outline ô đỏ occupied; green wide-outline = slot trống thật.
- Zoom probes đã dùng: f1721 cam1, f3218 cam1 (F-row: F04/06/08/09/10 đỏ occupied khớp record), f2920 cam1+cam2, f4940 cam1 (F06 đỏ occupied), f5504 cam1 (D/E rows khớp exact), f5788 cam1 (D/E + F rows khớp exact).
- Magenta merge-box / yellow `coasting` / cyan `new` quan sát trên xe thật trong đúng occlusion/entry windows (ví dụ ~f3902–3979, ~f3990–4185, ~f5216–5286, ~f5748–5768) — machinery đúng, không ghost trên vùng trống.
- Flag chuyển A (không kết luận ở C): cam2 hàng trên (~8 xe) quanh f2920–3123 có green rects ôm xe — khả năng cao là parked-track boxes (anchor ngoài polygon), A kiểm chứng với slot tooling khi review phần A nếu trùng vùng.
- Không chạy replay, không sửa code/config/test; chỉ file mới.

## Liên quan §5

- `ERRORS-C.json` giữ nguyên: E-C-001 CONFIRMED (edge coasting), E-C-002 CONFIRMED (B-audit), E-C-005 = **1 rejected + 2 unsure** (thai7 f761 bác bởi ảnh xe đỗ; thai8 f1377 + thai7 f2084 UNSURE — đợi B bổ sung), E-C-006 harm UNSURE, E-C-007 CONFIRMED fixture.
- Sau A6 freeze: resample V5 C theo phân công.

## Limitations

- Windows là proxy theo runtime event timestamps, không phải GT trực tiếp; PASS 6050/6050 là runtime-side.
- Sheet 3×3 không đủ phân giải để phân biệt track-box vs free-slot trong một số cảnh — đã bù bằng zoom probes tại các frame nghi vấn; phần còn lại giả định cùng grammar (đã verify lặp lại 6 điểm).
