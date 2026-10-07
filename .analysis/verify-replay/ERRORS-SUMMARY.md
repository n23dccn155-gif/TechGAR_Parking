# ERRORS-SUMMARY — V6 tổng hợp chiến dịch verify-replay (config hiện tại)

Ngày: 2026-10-06 · Tổng hợp bởi DEVIN (manager, tiếp quản từ LEAD Codex hết quota).
Nguồn: `ERRORS-A.md` (6 session), `ERRORS-B.md` (4 session), `ERRORS-C.md` (8 session), `V5-*.md`, `V1-replay-results.md`, `HANDOVER.md`.

## 0. Phạm vi và độ tin cậy

- **Replay:** 18/18 session official PASS — 41.625 cặp frame (83.250 cam-frame), exit 0, pred_lines == src_frames, 0 warning/error log. Không replay-failure nào.
- **Auto-scan:** 100% frame cả 2 cam (7 nhóm cờ: ID churn, dup track, ghost, false-det, slot-bind, ROI, jump).
- **Eyeball (xem ảnh thật):** ~16.300 unique cam-frame (~19.6% tổng), gồm uniform 1f/2s/cam TOÀN session + mọi event window FULL (A: 116/116 thai1 windows; C: 294/294 windows; B: toàn bộ windows 4 session — 0 PART/0 SKIP ở strict criterion gap≤5f).
- **Cross-check V5 (seed 20261005):** cả 3 chiều hoàn tất. A→B: 2/2 CONFIRMED. B→C: 0/2 resolved (phenomenon có, defect chưa chứng minh). C→A: 3/3 upheld + audit ngoài mẫu. Type-FP ~1/6 audited (B-side).
- **Ground truth:** GT CSV gần như chỉ có header → `identity_impact`/`harm` phần lớn **UNVERIFIED**; không kết luận tỷ lệ ID-switch/accuracy toàn hệ thống.
- **Freeze:** 0 file code/config/test bị sửa (git set-level PASS, 6 config SHA khớp, HEAD không đổi). Giới hạn: fingerprint 148-file chỉ có trong bộ nhớ LEAD → so được ở set-level, không per-file.

## 1. Lỗi CONFIRMED — nhóm theo cơ chế

### Nhóm 1 · DUPLICATE_TRACK — hai local-track trên cùng một xe (S2)
| finding | session | vị trí | bằng chứng chính |
|---|---|---|---|
| E-A-003 | test1 cam2 | f100 | lid111×lid120 IoU 0.57, gid NULL |
| E-B-004 | thai4 cam1 | 4 cụm f317–5761 | IoU 0.24–0.87; ảnh sheet_0102/0029 box chồng xe thật |
| E-B-005 | thai4 cam2 | 7 cặp f1342–5005 | IoU 0.44–0.89; `suppressed_roi_edge_twin` vẫn render |
| E-B-008 | thai3 cam1 | 9 cụm f1296–2906 | IoU 0.44–0.99 |
| E-B-009 | thai3 cam2 | 10 cặp f219–4919 | IoU 0.53–0.96 (A re-verify độc lập 10/10) |
| E-A-037/038 (phần) | thai6 | f2759+, f716–717 | lid164==lid165 bbox trùng hệt; lid9×10 IoU 0.42 |

**Hệ quả:** 41 dup-pairs thai3 + 59 thai4 toàn gidNULL hoặc gid×gidNULL → **0 slot↔2gid conflict, 0 gid↔2slot conflict** (slot integrity PASS). Harm chưa chứng minh. Đây là vật chứng trực tiếp cho nhóm merge/split.

### Nhóm 2 · GHOST_TRACK / coasting-burst trên vùng TRỐNG (S2)
- **E-C-006 systematic (8 instance, 6 session):** phantom `coasting`/`new` gidNULL trên nền trống, fvc≤10, inv≤40, tự die sau 44–238f. Ví dụ: thai5 f392–420 (6 box), f985–1040 (~10 box), f1719–1790 (~8 box mép trái); sang8 f882–925; thai8/toi5 startup f2–42; thai7 f2851; bt f2–42 (33 stale_prediction).
- **A-side bursts:** toi4 cam2 f51 (24 box), sang9 cam2 f51 (~20) + cam1 f441–466, thai6 f5877–5900 (20 box), thai6 cam2 f2759–2791 — floor-only portions CONFIRMED (anchor trong ô `occupied=false`, IoU=0 vs mọi measurement).
- **Cause suspect:** `detection/morphology` + `local-lifecycle` — phantom births theo cụm sau motion-burst/startup, TTL tự hồi nhưng chậm.

### Nhóm 3 · FALSE_DETECTION trên vật thật KHÔNG-phải-xe (S2/S3)
- **E-C-007:** cột gỗ bt cam1/cam2 (lid21, lid64, lid66 — sống tới EOF); **tay operator** thai7 cam2 f2851.
- **E-A-039:** thai6 cam2 lid14 sống 88f trên watermark/droidcam.app wall (roi_support 0.08–0.15) — S3 cosmetic.
- **E-A-001 (phần):** test1 cam2 fixture/post/hand.
- Harm: CONFIRMED ở mức detection (object thật sai class), identity không hại vì gid NULL.

### Nhóm 4 · ID_FRAGMENT / burst respawn (S2)
- **E-B-001:** toi6 f97–130 — mass respawn **53 tentative + 9 lost**, nobs 7→46; occupancy latch ~29-30 nên output cuối không hỏng.
- **E-B-002:** toi6 f596–612 — burst thứ hai cùng signature.
- **E-C-001:** sang8 cam2 f129–889 — chuỗi re-id ≥10 lần trên xe mép ROI (`local-lifecycle`).

### Nhóm 5 · GID lineage (S2)
- **E-C-002 CONFIRMED:** sang8 — gid1 (cam2, xe đen đỗ) → gid3 xuất hiện ±9px; gap-density audit chứng minh **cùng xe vật lý** → lineage mất thật. Slot occupancy không đổi → harm UNSURE.
- **E-C-005 REJECTED-as-claimed:** 1/3 instance bị bác bằng ảnh (thai7 f761: gid3 xe vẫn đỗ, gid5 xe khác, cách ~97cm); 2/3 UNSURE. Cờ scanner `new gid near vanished gid` so pixel — artifact, không phải defect engine.

### Nhóm 6 · DATA_INTEGRITY (S3, nguồn video)
- **E-C-004:** capture gap toi5 f95–96, thai7 f2194–2195; **O-B-017** thai4 f2442–43; thai1 f973–974 ~6.7s. Lỗi record gốc, không phải replay.

## 2. UNSURE còn mở (không đủ chứng, cần user/GT)

- **E-A-020** (hiep2): gid handoff partial — lid9/14/18→gid1, lid15/20→gid2 recovered; lid11/12/13/19 gidNULL.
- **E-A-030/031 phần in-lane** (~26 lids): anchor ngoài mọi ô, IoU=0 — floor-vs-car chưa chốt.
- **E-B-003/E-B-006:** coasting/frozen ~140f trên xe nửa-ngoài-ROI và nền gỗ mép — boundary legit hay thiếu coast-TTL?
- **E-B-007:** pattern new-ID CONFIRMED nhưng "cùng một xe" UNSURE (anchor lid19/23 khác lid10/11).
- **E-C-003:** anchor ngoài ROI trên xe mép — có thể expected convention.
- **U2** (sang7 ~f330): nghi GID đặt nhầm xe qua cam — cần frame-level check.

## 3. EXPECTED / không phải lỗi (đã phân loại)

- **SLOT_BINDING_ERROR f1–61 mọi session:** xe đỗ sẵn trước session → vision occupied đúng, tracker không track xe chưa-hề-di-chuyển = giới hạn thiết kế motion-based.
- **Warmup churn f2** (lid sống 1–2f) và TRACK_JUMP bootstrap — noise kỳ vọng.
- **ROI_MISMATCH mép:** bbox tràn/anchor ngoài ROI, roi_clipped — hành vi hợp lệ.
- **E-A-042 REJECTED:** box "green trên làn trống" thực ra là lid17 gid1 matched trên xe teal thật.

## 4. Kết luận

- **Không S1 nào được chứng minh.** Không có bằng chứng slot-claim sai, gid-conflict, hoặc mất xe vĩnh viễn trong phần đã xem — nhưng **harm phần lớn UNVERIFIED vì GT rỗng**, không đồng nghĩa "hệ thống không có lỗi".
- **Vấn đề nổi bật nhất:** (a) DUPLICATE_TRACK lặp lại ở ≥5 session — trùng với miền merge/split đang HOLD ở P0; (b) phantom coasting-bursts trên nền trống — nghi morphology/lifecycle; (c) 1 case gid lineage mất được chứng minh cùng-xe (E-C-002).
- Replay config-hiện-tại **không** thấy `config_era_suspected` ở session nào được xác nhận (V2 aligned cả 18 theo báo cáo builder).
