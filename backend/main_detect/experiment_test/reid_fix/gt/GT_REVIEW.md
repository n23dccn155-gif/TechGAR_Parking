# Ground truth — cần user duyệt (thai7 + thai8)

Phương pháp: xem thumbnail từng GID (`label_sheets/`) + render full-frame có overlay
(`reid_fix/lead_frames/`) + đối chiếu slot reservation/parking events trong
`predictions.jsonl`. Chỉ có **2 xe vật lý thật** di chuyển trong cả 2 session;
mọi GID còn lại là ghost (texture mép bàn / túi nilon — đã kiểm bằng ảnh).

## Xe vật lý

| label | nhận dạng |
|---|---|
| `xe_xanh` | xanh nhạt, sọc cam trên nóc |
| `xe_den` | đen, sọc nhiều màu trên nóc |

## session_thai8 (live) — xe_den bị cấp 3 ID

| GID | xe | frame | cams | hành trình |
|---|---|---|---|---|
| 1 | xe_xanh | 52–1856 | cam1+cam2 | D01→D10→B10→A01 — recover đúng 4 lần |
| 2 | **xe_den** | 122–175 | cam2 | B01; departure f588–976 **token expired**, candidate ('cam1',7) unconsumed; identity expired f1492 |
| 4 | **xe_den** | 1242–1350 | cam1+cam2 | grouped f1242 → parked **F01** f1355 |
| 7 | **xe_den** | 1842–1859 | cam1 | parked **F05** f1863 — cùng xe gid4 |
| 3,5,6,8,9 | — (ghost) | | | texture mép bàn, 1–144 frame rải rác |

## session_thai7 (live) — cả 2 xe đều đổi ID

| GID | xe | frame | cams | hành trình |
|---|---|---|---|---|
| 1 | **xe_xanh** | 4–1414 | cam1+cam2 | D01→C10→A10, recover đúng 3 lần |
| 8 | **xe_xanh** | 1720–2727 | cam2+cam1 | D01→D08→C10 — cùng xe gid1 (gap ~38s) |
| 2 | **xe_den** | 135–2591 | cam2 | B01→B04→A07→B01→B10, recover đúng 5 lần |
| 9 | **xe_den** | 2749–2781 | cam2 | fragment sau khi gid2 mất dấu |
| 10 | **xe_den** | 2803–2826 | cam2 | parked A09 f2831 |
| 3,4,5,6,7 | — (ghost) | | | mép bàn/túi nilon |

## Baseline metrics (evaluate_session_metrics.py)

| session | ID consistency | IDSW |
|---|---|---|
| thai7 live | 0% | 3 |
| thai8 live | 50% | 2 |
| R0 thai7 | 0% | 2 |
| R0 thai8 | 50% | 1 |

## Điểm cần duyệt

1. `xe_den` thai8: gid2 (B01) = gid4 (F01) = gid7 (F05) — cùng 1 xe (bằng chứng:
   f816 cam2 xe đen rời B01 vào lane; f1242 track mới quanh D01/C01; f1355 park F01;
   f1842 cùng xe park F05; so sánh thumbnail gid2/gid4/gid7 cùng pattern sọc nóc).
2. `xe_xanh` thai7: gid1 = gid8 (cùng pattern xanh/cam; gid1 mất f1414, gid8 xuất hiện f1720).
3. `xe_den` thai7: gid2 = gid9 = gid10 (cùng xe đen; gid9 2749-81, gid10 2803-31 park A09).
4. Ghost GIDs không gán nhãn — chúng là false detection, không phải xe.
