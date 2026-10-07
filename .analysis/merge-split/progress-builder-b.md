# progress-builder-b — P0 dataset + baseline

**Ownership §4 (của B):** `experiment_test/merge_split_report.py` (MỚI), schema telemetry (P2 chưa tới), `.analysis/merge-split/P0-b-baseline.md` + file này. Không sửa tracker/test/file người khác.

## Đã xong
- Kiểm kê `experiment_test/output` (63 mục, không quét .venv): 18 `session_*` có RAW+PRED+GTcsv+perf (replay được); 9 `reidfix_*_session_*` có PRED+GTcsv (không RAW → chỉ phân tích log); `runtime_*` không có log dùng được.
- **Phát hiện quan trọng:** mọi `ground_truth_*.csv` chỉ có header (1 dòng) → **không có GT nào tồn tại**. §1.2.10 của spec giả-định sai thực-tế.
- Viết `merge_split_report.py`: parse `identity_events[]` trong predictions.jsonl (key `event_type`), gộp episode bằng union member-set có overlap thời-gian, phân outcome expired/recovered/none + implicit (không-opened) + member-lost-during + birth-veto + defer stats + GT-nearest-anchor (có sẵn nhưng không dùng được vì GT rỗng).
- Chạy trên 28 session-dir → `msr-raw.json` + `msr-out.txt` trong `.analysis/merge-split/`.
- Baseline đối-chiếu `diagnose_identity_churn.py` trên session_thai6.

## Kết-quả chính (xem P0-b-baseline.md)
- **386 episodes**: expired 285 (73.8%) · recovered 8 (2.1%) · none 93 (24.1%) → spec diagnosis "hết hạn chứ không recovery" ĐÚNG.
- Episodes rất ngắn (đa số 0–1 frame; top 11f≈4s) — timeout 3.0s ăn gần hết ngân sách.
- ~50%+ episode "implicit" (chỉ thấy expired/recovered, không opened event) — cần A xác-nhận nguồn group passive.
- GT rỗng → **không đo được** ID-switch/lost thật; dataset KHÔNG đủ cho learned model (P5 → không khuyến-nghị) và không đủ chứng-minh switch-impact.

## Còn lại / điểm-thiếu
- GT metrics trong tool sẵn-sàng nhưng unused (header-only) — nếu ai gán nhãn GT sau thì chạy lại.
- `none`-outcome = group vẫn mở lúc log kết-thúc hoặc event cuối không terminal — A xác-nhận semantics.
- Đề-xuất ~8 event/frame cụ-thể làm regression cho builder-c (trong report).

## Sau review LEAD + A §7 (revision 2)
- Tool thêm: `canonical_source` dedup reidfix/runtime trùng video; `kind` per-episode {active-2 | ge3-covering | implicit-2}; `kind_x_outcome`; `new_ids_45f_after` proxy; GT→"N/A header-only".
- Xác-minh trực-tiếp og:55-135,195-232: `opened` chỉ khi activate() (og:131); `expired` og:61 bắn cả watch-group member-mất; covering_group og:119-120 active ngay (không opened); recovered og:220 → group về watch (re-open được); xóa-lặng og:94-100 chỉ cho watch.
- Kết-quả chốt: 20 nguồn/203 ep — implicit-2 138 · active-2 58 (47 none-still-active / 10 exp / 1 rec) · ge3 7. Merge-thật chỉ 65 ep; recovered 2/65.
- Kết-luận hạ mức: HỖ TRỢ chẩn-đoán, CHƯA đủ chứng-minh; GT rỗng = BLOCKER §6.
- `P0-b-baseline.md` revision 2 đã nộp.

## Revision 3 (chốt P0-b theo LEAD)
- `none` = censored (không ghi terminal) — bỏ khẳng-định "còn active tới cuối".
- `new_ids_45f_after` = từ frame-cuối episode mọi outcome — sửa nhãn "new-ID sau episode-end", không riêng expiry.
- "65" = episode-proxy có opened/≥3, KHÔNG 65 merge vật-lý độc-lập — ghi trong §2.1/§5.
- HOLD P0. Không P1.
