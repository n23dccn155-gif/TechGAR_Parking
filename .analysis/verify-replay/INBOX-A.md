# INBOX-A — Devin (worker A, interim coordinator)

Updated: 2026-10-06 ~01:xx. Đọc bởi LEAD khi poll; A không chờ, tiếp tục làm.

## Đang làm / còn lại của A

| # | Việc | Trạng thái | Blocker |
|---|---|---|---|
| 1 | Thai1 V4-help part (sheets 0036–0096) | **DONE** — `V4-help-A-thai1-part.md`: 61/61 sheets, 549 unique (cam,f), NO_ERROR §5 | — |
| 2 | Thai1 event-dense **union coverage** | **DONE** — `V4-help-C-thai1.md` đã merge: 162/162 sheets, 1450 event cells + uniform 242, dedup 40 → **thai1 1652/12100 = 13.7%**, 116/116 windows FULL; đã ghi `ERRORS-A.md`. C-flag f2920–3123 checked: lid30 anchor trong C10 → parked-track expected | — |
| 3 | Chốt findings UNSURE/MIXED (18 mục) | **DONE ~01:10** — 9→EXPECTED, 1→REJECTED (E-A-042), 1→CONFIRMED S3 (E-A-039), 6→MIXED w/ floor-confirmed portions; còn UNSURE: E-A-020 (gid handoff partial) + in-lane portions của MIXED | — |
| 4 | V5 final resample B (seed 20261005) | **DONE** — full pool E-B-001..009, sample = E-B-005+E-B-009; ghi V5-A.md §final (2/2 phenomenon CONFIRMED, 0 harm proven; correction nhỏ: cặp dup gidNULL-dominant, không phải same-gid) | — |
| 5 | progress-builder-a.md + STATUS.md | đồng bộ mỗi lần xong bước | — |

## UNSURE/MIXED queue (18)

- **test1**: E-A-001 MIXED (fixture CONFIRMED; floor-only lid74/lid115 UNSURE — cần chứng minh nền trống), E-A-005 SLOT_BIND, E-A-006 GID_LOSS.
- **hiep_toi4**: E-A-010 ID_FRAG, E-A-011 SLOT_BIND.
- **hiep2**: E-A-020 ID_FRAG, E-A-021 ROI_MISMATCH, E-A-022 SLOT_BIND.
- **hiep_sang9**: E-A-030 FALSE_DET, E-A-031 GHOST (đã có IoU=0 vs mọi measurement f445/451 — thiếu ảnh xác nhận nền trống), E-A-032 TRACK_JUMP, E-A-033 ID_FRAG, E-A-034 SLOT_BIND.
- **thai6** (frozen): E-A-035 MIXED (5 lids floor-only CONFIRMED; phần còn UNSURE), E-A-036/037 FALSE_DET cam2 bursts, E-A-038 DUPLICATE cluster xe trắng, E-A-039 fixture wall box lid14.
- **thai1**: E-A-042 FALSE_DET uniform green-box làn trống ~f1900–2100.

## Đã xong (đóng băng A-side)

- **thai6**: V2 4/4, V3 7/7, V4 full — uniform 10/10 + events 83/83 = **2204/11874 (18.6%)**, 0 skip.
- **thai1**: V2 4/4, V3 7/7 (197 flags, capture-gap f973–974 ~6.7s), uniform 10/10 = 242 pairs (2.0%), event-dense A-part 549 pairs; windows+manifest đã bàn giao C.
- **runtime_session_bt** help: `V4-help-A-runtime-bt.md` — 472 pairs (15.4%), E-ABT-1 warmup burst, E-ABT-2 FALSE_DET fixture (reclassified), gaps computed từ index.json.
- **V5-A.md**: audit B thai4 — E-B-004/005 DUPLICATE confirmed-phenomenon (IoU 0.44–0.89), E-B-007 partially supported.
- `V3-scan-A.md` 7-group matrix 6 cột session đúng format; `ERRORS-A.md` head/coverage 6 session đã vá.

## Blockers

1. **C chưa xong thai1 event-dense** (0001–0035, 0097–0157) → union coverage chưa ghi.
2. **B chưa freeze 4 session** → V5 final resample chưa chạy.
3. UNSURE phần floor-vs-car: cần ảnh cell hoặc metric IoU-vs-measurements; sẽ trích tối đa rồi kết UNSURE nếu không đủ chứng — không suy diễn.

## ETA / thứ tự

Không ước lượng giờ. Thứ tự: (a) data-only evidence cho E-A-035 rest / 036 / 037 / 038 / 039 / 042 / 030 / 031 → cập nhật status; (b) merge thai1 union khi C nộp; (c) V5 finalB khi B freeze.
