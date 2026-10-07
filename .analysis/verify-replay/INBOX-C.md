# INBOX-C — worker C / DEVIN manager tiếp-quản điều phối

Updated: 2026-10-06 ~01:45. Đọc bởi LEAD/user khi poll; C không chờ, tiếp tục nếu có việc.
Bối cảnh: LEAD Codex hết quota → DEVIN (manager) điều phối từ đây. C = builder C duties.

## Trạng thái việc của C

| # | Việc | Trạng thái | Blocker |
|---|---|---|---|
| 1 | §5-C chuẩn findings (status/harm/cause/repro/instances cell+frame+t_s) | **DONE** — `ERRORS-C.json` + `ERRORS-C.md` đồng bộ enum §5 | — |
| 2 | V3-C auto-scan đủ 8 session | **DONE** — `V3-scan-C.md`, flags/jsonl + summary per session | — |
| 3 | V4 own-review 8 session C | **DONE** — 7182 unique (cam,f) cells, 294/294 event windows FULL gap≤5 (xem `progress-builder-c.md` bảng union) | — |
| 4 | Thai1 event-dense help + union merge | **DONE** — C xem `sheet_0001–0035` + `sheet_0097–0162` (101 sheets; 0158–0162 tail extra ghi riêng). A nộp 61 sheets 0036–0096/549 cells → **UNION 162/162 sheets, 1450 cells, 116/116 windows FULL cả 2 cam, 0 PART/0 SKIP**. Report `V4-help-C-thai1.md` | — |
| 5 | V5-C resample full A-pool (sau A freeze) | **DONE** — seed 20261005, pool 13 → sample {E-A-020, E-A-036, E-A-042}: **3/3 A-status upheld** (UNSURE/MIXED/REJECTED đều đúng), 0/3 type-FP. `V5-C.md` §final-resample | — |
| 6 | E-C-005 giữ 1 rejected + 2 unsure | **DONE/giữ nguyên** — MD+JSON đồng bộ; không confirmed handoff defect | — |

## Việc còn lại (campaign-level)

1. **ERRORS-SUMMARY.md + QUESTIONS-FOR-USER.md** — LEAD-role artifact (MEGAPAN §cuối). DEVIN-manager có thể soạn khi user xác nhận: tổng hợp A(26) + B(9 E +25 O) + C(7 E + U) findings, FP từ V5 3 chiều, coverage thực, replay-failures (không có — 18/18 PASS).
2. **V6 gate** — sau ERRORS-SUMMARY; chưa duyệt.
3. Freeze-check cuối: B đã chạy set-level PASS (HEAD `5f58131`, 6 config SHA PASS, 0 file code/config/test bị đụng). Baseline 148-file per-file chỉ tồn tại trong bộ nhớ LEAD → **không thể so per-file hash** — ghi trong INBOX-B, cần user quyết nếu muốn per-file tuyệt đối.

## Blockers

- Không blocker kỹ-thuật phía C. Mọi cờ mở đã sàn theo evidence-data; phần UNSURE là giới hạn chứng cứ (ghi rõ trong findings), không phải việc treo.
- E-B-006 UNSURE chờ A phán — việc của A, không chặn C.
- Per-file freeze-hash cần baseline LEAD (không truy-cập được) → set-level check thay thế đã PASS.

## ETA

Không ước lượng giờ. C-side **không còn việc QA chạy được** — chỉ còn artifact tổng kết (ERRORS-SUMMARY/QUESTIONS/V6-gate) chờ lệnh user/manager.

## Chỉ dẫn cho ai tiếp quản

- Union coverage thai1 đã merge xong — KHÔNG render thêm sheet nào cho thai1; mọi window FULL.
- Nếu cần bằng chứng zoom: probes tại `thai1_f{1721,2920,3218,4940,5504,5788}_cam1_*.png` + `sheets_v4h_thai1_zoom{,2,3}/`.
- Giữ nguyên: không sửa code/config/tests, không replay, không quét `.venv`/output đệ quy.
