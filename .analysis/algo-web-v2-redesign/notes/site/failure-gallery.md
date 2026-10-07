# failure-gallery — notes

## Nguồn
- `.analysis/verify-replay/ERRORS-SUMMARY.md` — canonical V6 (6 nhóm CONFIRMED + UNSURE + EXPECTED)
- Sheets: `sheets/session_hiep_thai3_events/sheet_0021.jpg` (cam1 f1340-1380, dup box trên xe xanh), `sheets/session_hiep1/sheet_0010.jpg` (cam2 f5901, cụm coasting trên nền trống)

## 7 khối bắt buộc (theo brief)
1. **DUPLICATE_TRACK CONFIRMED** — E-A-003 test1 cam2 f100 lid111×lid120 IoU0.57; E-B-004 thai4 cam1 4 cụm f317–5761 IoU0.24–0.87; E-B-008/009 thai3 19 cụm; E-A-037/038 thai6 bbox trùng hệt. 41 dup-pairs thai3 + 59 thai4 → 0 slot conflict (slot integrity PASS). Harm chưa chứng minh.
2. **GHOST/coasting-burst CONFIRMED** — E-C-006 systematic 8 instance/6 session: phantom gidNULL trên nền trống, fvc≤10 inv≤40, die 44–238f. thai5 f392–420(6 box), f985–1040(~10), f1719–1790(~8); sang8 f882–925; thai8/toi5/bt startup f2–42. A-side: toi4 f51 24 box, sang9 f51 ~20+cam1 f441–466, thai6 f5877–5900. Cơ chế nghi (suy luận): morphology/lifecycle.
3. **FALSE_DETECTION CONFIRMED** — E-C-007 cột gỗ bt (lid21/64/66 sống tới EOF) + tay operator thai7 f2851; E-A-039 thai6 lid14 watermark 88f; E-A-001 test1 fixture/post/hand. Harm chỉ ở detection-level (gid NULL).
4. **ID_FRAGMENT CONFIRMED** — E-B-001 toi6 f97–130 respawn 53 tentative + 9 lost (nobs 7→46), latch ~29-30 cứu output cuối; E-B-002 toi6 f596–612 burst hai; E-C-001 sang8 cam2 f129–889 re-id ≥10 lần trên xe mép ROI.
5. **E-C-002 CONFIRMED lineage loss** — sang8 gid1 (cam2 xe đen đỗ) → gid3 xuất hiện ±9px; gap-density audit chứng minh cùng xe → mất lineage; slot không đổi → harm UNSURE. Link tới handoff-dormant.
6. **CAPTURE_GAP CONFIRMED (data)** — E-C-004 toi5 f95–96, thai7 f2194–2195; O-B-017 thai4 f2442–43; thai1 f973–974 ~6.7s. Lỗi record gốc.
7. **EXPECTED: xe đỗ sẵn không track** — SLOT_BINDING_ERROR f1–61 mọi session; motion-based pipeline không sinh track cho xe chưa-hề-di-chuyển; vision occupied vẫn đúng. Giới hạn thiết kế, không phải defect.

## UNSURE còn mở (nêu ở limits)
- E-A-030/031 (~26 lids) anchor ngoài ô IoU=0: floor-vs-car chưa chốt; E-B-003/006 coasting 140f boundary; E-B-007 new-ID pattern; E-C-003 anchor ngoài ROI; U2 sang7 f330 nghi GID đặt nhầm xe.

## Figure
- dup-track: sheet_0021 (thai3 events cam1) — xe xanh có 2 box lid9+lid10; annotate circle tại dup r2c1 (src ~265,445) + r3c2 (~795,795)
- coasting burst: sheet_0010 (hiep1 cam2 f5901) — cụm box vàng/nền trống ở top-strip r3c3 (~1400-1670,750-785)
