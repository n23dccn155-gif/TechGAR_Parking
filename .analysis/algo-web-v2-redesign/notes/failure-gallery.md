# notes/failure-gallery.md — Step A bảng nguồn (backfill builder-c, 2026-10-06)

Nguồn chính: `.analysis/verify-replay/ERRORS-SUMMARY.md` (7 khối finding F1–F7)
+ ảnh sheet verify trong experiment_test/output. Chi tiết trong page ⑦.

## giá trị → file:dòng → kind
| giá trị | nguồn | kind |
|---|---|---|
| F1 dup-track: 41 cặp thai3 + 59 cặp thai4; slot conflict 0 (gidNULL) | ERRORS-SUMMARY.md | runtime |
| F2 coasting burst: 8 instance / 6 session, fvc≤10, inv≤40; tự chết 44–238 frame | ERRORS-SUMMARY.md | runtime |
| F3 false-detection: harm chỉ detection-level, gid NULL | ERRORS-SUMMARY.md | runtime |
| F4 fragmentation: burst toi6 53 tentative + 9 lost (f97–130); re-id sang8 ≥10 lần f129–889 cam2 | ERRORS-SUMMARY.md | runtime |
| F5 gid-lineage: gid1→gid3 lệch ±9 px cùng xe; harm UNSURE (slot không đổi) | ERRORS-SUMMARY.md | runtime |
| F6 capture gap: lớn nhất thai1 f973–974 ≈ 6.7 s | ERRORS-SUMMARY.md | runtime |
| F7 pre-parked: SLOT_BINDING_ERROR f1–61 mọi session (EXPECTED-by-design) | ERRORS-SUMMARY.md | runtime |
| tổng: 6 nhóm CONFIRMED; S1 được chứng minh = 0; 6 nhóm còn UNSURE | ERRORS-SUMMARY.md | runtime |
| type-FP khi audit chéo ~1/6 (cờ scanner so pixel bị bác bằng ảnh, B-side) | ERRORS-SUMMARY.md | runtime |

## ghi chú
- Mỗi khối trong trang ghi hiện tượng + bằng chứng session·frame·cam + cơ chế nghi
  (đánh nhãn suy luận khi chưa chứng minh), khớp tiêu chí brief Task 9.
