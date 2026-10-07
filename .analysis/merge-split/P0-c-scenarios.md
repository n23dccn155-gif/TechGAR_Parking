# P0-c — Kịch bản merge/split tổng hợp (builder-c)

File mới: `backend\main_detect\tests\test_merge_split_scenarios.py` — 17 test,
không sửa `src/` hay test cũ. Seeding theo `seeded_tracker()`
(`test_stability_occlusion.py:84`) qua import; S8 dùng bản 3-track cùng kiểu.

## Kết quả số (log truy vết trong `.analysis\merge-split\`)

- **Baseline** (`pytest tests -q --ignore=tests/test_merge_split_scenarios.py`):
  **448 passed** → log `P0-c-baseline-pytest.log`.
- **Full suite sau khi thêm**: **457 passed + 8 xfailed** → log `P0-c-fullsuite-pytest.log`.
- **Riêng file scenario**: 9 passed + 8 xfailed → log `P0-c-scenarios-pytest.log`.
- Lệnh: `cd backend\main_detect; .\.venv\Scripts\python.exe -m pytest tests -q`.
- Không test cũ nào fail sẵn; mọi xfail fail vì THIẾU hành vi recovery
  (assert trên accepted/deferred/state/events), không assert cờ/API chưa tồn tại.

## Phạm vi test (quan trọng)

- Test hiện-tại ở S1/S2/S3/S5/S6/S7/S9 chạy **unit-level trực tiếp
  `gate_assignments`** với cost matrix giả lập — đúng contract của hàm, không qua
  `_detect`/LAPJV. S4 là integration `process_frame` đầy đủ (mask monkeypatch).
- S5 dùng cost noise **.75 < `assignment_cost_limit=.90`** (`motion_tracker.py`
  :72, `lapjv(..., cost_limit)` :1908) ⇒ cặp (2,noise) **LAPJV-compatible —
  inferred** (không verify end-to-end vì S5 chạy unit `gate_assignments`, không
  qua `_assign` thật). Kết luận verified chỉ ở tầng unit gate. Bản nháp đầu
  dùng .95 > .90 → LAPJV loại trước khi tới gate (khi đó chỉ còn nghĩa S3);
  đã chỉnh để đúng phạm vi.
- **xfail ≠ yêu cầu bắt buộc P3**: 8 desired-test là ỨNG VIÊN hành vi theo spec
  đã chỉnh, cần lead chốt ở P1/DESIGN. Riêng S1-early-commit chỉ là đề xuất
  (spec §13 "trừ khi evidence cực mạnh") — nếu P1 chốt giữ streak=3 tuyệt đối,
  test xfail này sẽ được gỡ/viết lại thành PASS-locks-3-frames, không phải lỗi.

## Bản đồ kịch bản → hành vi hiện tại (PASS) → mong muốn (xfail)

| S | Hiện tại (khóa baseline) | Mong muốn (xfail reason) |
|---|---|---|
| S1 | Direct split commit nguyên khối frame thứ 3; `watershed_provisional→validated`; event `occlusion_group_recovered` (`gate_assignments` :191-232, streak `recovering>=3` :212) | Evidence cực mạnh (.04 vs 1.9) commit trước 3 frame (spec §13) |
| S2 | Swapped commit sau 3 frame — atomic gate nhận cả 2 chiều | Winner đổi hướng mỗi frame (direct→swapped→direct) phải WAIT — hiện tại `recovering` chỉ đếm frame valid, **không theo hypothesis nhất quán** → commit cả khi hypothesis lắc |
| S3 | Chỉ member 1 có pair ⇒ `valid=False` ⇒ defer cả group, blob A bị chặn mint ID (suppress `costs<1.0` :230), `recovering` không tăng | Partial commit: A→ID7 `matched_after_split`, ID12 `split_occluded` giữ prediction riêng (spec §14) |
| S4 | Integration `process_frame`: merged blob → A-only qua expiry → B quay lại muộn ⇒ **`_create_or_reid` mint ID 3**, member 2 không bao giờ match — mất lineage (đúng chẩn đoán spec §6) | Blob B phù hợp member chưa-resolve phải được thử rebind trước, không mint ID mới (spec §9.1/§18) |
| S5 | Mảnh nhiễu cost .75 (< limit .90) được `gate_assignments` commit làm member khi tổng direct <1.2 — **verified ở unit gate**; cặp (2,noise) đi qua LAPJV chỉ **inferred** (cost < `assignment_cost_limit` :1908), chưa verify end-to-end vì S5 không phải integration test | Hypothesis "non-member" (MEGAPLAN §1.2.3): noise bị từ chối, member kia → `split_occluded`, không cướp ID cũng không chặn vô hạn |
| S6 | **Unit gate**: sau khi `prepare` xóa group hết hạn (event `expired`), `gate_assignments` không còn defer — pair mới accept ngay. **Không** chứng minh "assign tự do toàn pipeline": per-track defer (`split_margin_track_ids` :1685, `association_recovery_pending` :1964) và birth veto `_unresolved_merged_birth` (:364) vẫn tồn tại độc lập group — phạm vi claim chỉ ở tầng group-gate | `identity_recovery_timeout` riêng bắt đầu sau tách (spec §17): post-expiry split vẫn phải qua evidence-gathering ở group-gate |
| S7 | Ordering không được lưu/dùng — `references` chỉ có (w,h); vượt nhau (ordering lật) vẫn commit theo cost | Pre-merge ordering là evidence (spec §10/§1.2.6): ordering nhất quán direct phải phá hoà-cost; KHÔNG hard constraint |
| S8 | 3-member: `partition()→[]` (:153 `len!=2`), gate defer cả 3 mỗi frame, supergroup trôi expiry — **giữ nguyên** (không xfail, MEGAPLAN §1.2.4) | — |
| S9 | A nhập nhằng (cost≈cost) ⇒ swapped−direct < 2·margin ⇒ defer cả group, **cả 2 blob member-like bị chặn sinh ID** — không ID theft | Gate phải emit telemetry `split_hypothesis` (scores/selected/decision, spec §21) — hiện chỉ trả accepted/deferred |

## Phát hiện phụ (verified bằng test)

- **Pair-group nền tồn tại bất-hạn**: `covering_group` gộp (1,2)+(2,3) thành
  supergroup (1,2,3) nhưng pair-group gốc `expires_at=inf` vì chưa `activate`
  (`occlusion_guard.py:22` default + :119 chỉ set khi activate/merge) — sau khi
  supergroup hết hạn chúng vẫn nằm trong `g.groups` (inactive). Test S8 khóa
  quirk này; cần lead quyết có phải rác cần dọn ở P1.
- **Tầng defer thứ 2 độc lập với group**: kể cả khi group đã qua, per-track
  margin gate `split_margin_track_ids` (:1685, invisible>0 hoặc recent-merged)
  + `association_recovery_pending` (:1964) vẫn giữ 3-frame clean run — cổng cho
  partial commit phải đi qua cả hai tầng (xác nhận §1.2.1).
- **Integration path**: `process_frame` với mask monkeypatch (`bg_sub` +
  `_temporal_motion_mask`) tái hiện đúng chuỗi merged→defer→expire→new-ID —
  dùng được cho regression khi flag bật (P2/P3).

## Đề xuất cho P1 (test hooks tối thiểu)

- `gate_assignments` cần trả thêm per-member verdict hoặc event; hypothesis
  history phải gắn `OcclusionGroup` (streak theo hypothesis, không theo frame).
- Cờ `enable_multi_hypothesis_recovery` + CLI: 8 xfail là **ứng viên** — chỉ
  những cái lead chốt trong DESIGN mới chuyển pass khi cờ bật (S1-early-commit
  chưa được duyệt); khi cờ tắt suite phải giữ 457 pass nguyên trạng
  (regression fence).
