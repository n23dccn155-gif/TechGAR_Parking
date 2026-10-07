# V2 — Alignment check, 8 sessions builder-c

Ngày: 2026-10-05 · Tool: `experiment_test/verify/make_sheets.py --frames "1,<mid>" --cam both --grid 2x2`
→ `alignment/<session>/sheet_0001.jpg` (f1 + mid × cam1/cam2 = 32 cell, đã xem mắt hết).

## Phạm vi phán quyết (quan trọng)

Verdict **chỉ về căn chỉnh geometry**: ROI polygon và slot polygons của config
**hiện tại** có khớp vạch thảm/vạch ô đỗ trong video gốc không. Màu
occupied/free trong sheet vẽ từ `predictions.jsonl` **gốc** (record cũ) —
**không phải** kết quả replay current-config, không dùng để kết luận slot state.
`config_era_suspected` cần xác nhận lại khi có `verify_cur_*`.

## Kết quả

| session | frames (cam1) | mid | geometry verdict |
|---|---|---|---|
| session_hiep_thai5 | 3977 | 1988 | ALIGNED |
| session_thai7 | 2872 | 1436 | ALIGNED |
| session_thai8 | 1952 | 976 | ALIGNED |
| runtime_session_bt | 1529 | 764 | ALIGNED |
| session_hiep_sang8 | 929 | 464 | ALIGNED |
| session_hiep3 | 826 | 413 | ALIGNED |
| session_hiep_sang7 | 817 | 408 | ALIGNED |
| session_hiep_toi5 | 806 | 403 | ALIGNED |

Quan sát: ROI (vàng) ôm mép thảm ở cả 2 cam; slot polygons trùng vạch sơn ô đỗ
ở f1 lẫn mid; không thấy lệch góc/quay hay lệch khu vực → **không có evidence
`config_era_suspected`** trên 8 session C ở bước này.

## Giới hạn

- Chỉ 2 mốc (đầu + giữa) × 2 cam; không bao phủ drift trong session.
- Geometry aligned ≠ track/slot-state đúng: chờ V3/V4 trên `verify_cur_*`.
- `session_hiep_thai2` nằm ngoài danh sách 8 của C (đã ghi BROKEN ở plan).
