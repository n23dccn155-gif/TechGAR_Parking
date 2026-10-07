# MEGAPLAN — Merge/Split Identity Recovery (Local ID, camera cố định)

Team: `lead` (Codex, pane w1:p6, CHỈ điều phối + viết spec/plan/review-doc) + `builder-a`, `builder-b`, `builder-c` (Devin).
Repo: `D:\TechGar2`. Code: `backend\main_detect\src\techgar\`. Spec gốc của user: `.analysis\merge-split\SPEC-original.md` (đề xuất, CHƯA kiểm chứng). Thư mục làm việc: `.analysis\merge-split\`.
Python: `backend\main_detect\.venv\Scripts\python.exe` (3.11). Test: `cd backend\main_detect; .\.venv\Scripts\python.exe -m pytest tests -q`. KHÔNG quét `.venv`, `node_modules`, `experiment_test\output\*` đệ quy.

## 0. Quy tắc
- Spec là HƯỚNG ĐỀ XUẤT. Mọi claim kỹ thuật phải đối chiếu code thật (file:dòng), ghi rõ: verified / inferred / not verified. Không copy spec thành sự thật.
- Lead không tự code. Builder không sửa file của người khác (xem §4).
- Mọi thay đổi hành vi nằm sau cờ `enable_multi_hypothesis_recovery` (tham số constructor `MotionVehicleTracker` + CLI `two_camera.py`), MẶC ĐỊNH TẮT. Chỉ bật mặc định khi qua cổng benchmark §6 và user duyệt.
- Không đổi kiến trúc Global ID/cross-camera trong Phase này, ngoại lệ duy nhất đã nêu ở §3.7 (tập trạng thái track được cross-camera bỏ qua), và chỉ sau khi lead duyệt.
- Không xóa/nới các invariant hiện có trong `tests\test_stability_occlusion.py` một cách im lặng. Test nào mâu thuẫn có chủ đích với thiết kế mới phải được SỬA CÓ GHI LÝ DO (và giữ phiên bản hành vi cũ khi cờ tắt).
- Không commit/push nếu user chưa yêu cầu. Không chạy lệnh phá hủy.
- Prompt lead gửi builder phải NGẮN, trỏ về mục trong file này. Builder gần đầy context (>75%) ghi tiến độ vào `progress-<tên>.md` rồi báo user.
- Lưu ý hạn mức Codex của lead còn thấp (~24% tuần): lead đừng đọc file lớn không cần thiết; để builder viết tóm tắt ngắn cho lead.

## 1. Đánh giá spec so với code thật (lead-assistant đã đọc code; builder P0 phải XÁC NHẬN LẠI độc lập)

### 1.1 Đã xác nhận ĐÚNG
| Claim trong spec | Bằng chứng |
|---|---|
| Recovery là atomic 2→2 | `occlusion_guard.py:191-232` `gate_assignments`: `valid = len(ids)==2 and all(tid in pairs for tid in ids)` rồi `swapped-direct >= 2*margin and direct < 1.2`; streak `group.recovering >= 3`. Thiếu một member trong `pairs` ⇒ `valid=False`, mọi member bị `deferred_tracks`, và assignment ĐÃ ĐƯỢC LAPJV chọn cho A bị loại khỏi `accepted` (dòng 222-231). Test khóa hành vi này: `test_split_assignment_is_atomic_and_requires_three_fresh_frames` (`tests/test_stability_occlusion.py:121`). |
| Defer cả group làm uncertainty dài | Member bị `frozen`, `observation_kind='occluded_prediction'`; ở `process_frame` (motion_tracker `2252-2290`) unmatched ⇒ `prediction_age_s` tăng, quá `_prediction_age_limit_seconds` ⇒ `stale_prediction`, `velocity_confidence=0`. |
| Hết hạn bằng đồng hồ cố định | `OcclusionGroup.expires_at = last_clean + timeout` (`occlusion_guard.py:119-130`), `timeout = merged_reacquire_max_seconds = 3.0` (motion_tracker:69/229). Hết hạn ⇒ `prepare()` xóa group (`:59-65`). Test khóa: `test_group_expiry_is_not_extended_by_ambiguous_pixels` (`:133`). ⇒ thời gian blob dính nhau ĂN vào ngân sách recovery; sau khi tách không còn thời gian riêng cho identity. |
| `watershed_provisional` → `watershed_validated`, appearance không tin | `occlusion_guard.py:217-219` (`appearance_trusted=False`). Đã có sẵn, spec §19 không cần làm mới. |
| Birth veto đã có | `motion_tracker.py:370-390` `_unresolved_merged_birth`, event `new_local_id_deferred_unresolved_merge`. |
| Morphology có thể tự nối xe | motion: `MORPH_OPEN 3x3` (`:559`), `dilate 5x5 iterations=2` (`:560`), `MORPH_CLOSE` (`:570`); final mask: OPEN (`:817`), CLOSE (`:824`). |

### 1.2 Spec THIẾU / cần chỉnh (lead-assistant phát hiện, cần xác nhận)
1. **Có HAI tầng defer, không phải một.** Ngoài `gate_assignments` còn tầng per-track trong `_assign` (`motion_tracker.py:1914-1988`): `has_margin` với `split_assignment_margin=0.08*(2-lineage_score)` ⇒ `split_assignment_deferred` (state `split_recovering`), và `recently_ambiguous and not clear_evidence` ⇒ `association_recovery_pending` cần `ambiguous_recovery_frames=3` frame sạch. Partial commit (H3/H4) PHẢI định nghĩa tương tác với tầng này, nếu không A vẫn bị chặn bởi tầng per-track dù tầng group cho qua. Ngoài ra còn `_mark_competing_assignments` (`:~1380-1500`) tiền xử lý cạnh tranh.
2. **`_pair_metrics` chỉ có 4 thành phần + vài trường:** `position, iou, appearance, size, total, lost_seconds, association_source` (`:1769-1780`), và CHỈ cho cặp "viable" (nằm trong gating). Chưa có velocity, trajectory, direction, ordering, spatial-appearance trong pair cost. Cặp không viable không có metric ⇒ hypothesis cần quy ước (chi phí = "không khả dĩ", không phải 0 hay thiếu key). Mục "reuse `_pair_metrics`" của spec chỉ đúng một phần.
3. **Spec lẫn hai trường hợp khi "B không có bằng chứng":** (a) B chưa quan sát/đứt foreground (member bị che thật) và (b) B là vật thể THỨ BA/mảnh nhiễu không thuộc member nào. Cần thêm hypothesis "detection bị từ chối là member" để B (b) không cướp ID và cũng không bị chặn sinh ID vô thời hạn.
4. **Group > 2 member không được xử lý.** `partition()` trả `[]` nếu `len(members)!=2` (`occlusion_guard.py:153`), nhưng `covering_group` có thể hợp nhất group thành ≥3 member (`:116-121`). Phase này chỉ làm 2-member; ≥3 giữ nguyên hành vi hiện tại (ghi rõ trong design).
5. **Ngưỡng chưa có số.** `MAX_PARTIAL_COST`, `PARTIAL_ASSIGNMENT_MARGIN`, `occlusion_penalty`, `wait_penalty`, `consistency_penalty`, `identity_recovery_timeout` không thể đoán; phải hiệu chỉnh từ log thật (P0 baseline + P3 sweep). Thang cost hiện tại: `assignment_cost_limit=0.90`, gate group `direct<1.2` (tổng 2 cost). Ví dụ số trong spec (0.47, 0.13...) chỉ minh họa.
6. **Giữ dữ liệu pre-merge để dùng làm evidence:** `OcclusionGroup.references` hiện chỉ lưu kích thước (w,h). Ordering/direction/velocity trước merge cần chụp lúc tạo group (từ `clean_observations`, `measurement_observations`).
7. **Trạng thái track mới phải được cross-camera biết.** `cross_camera_manager.py:2258-2278` có danh sách `{"coasting","split_recovering","occluded_prediction","watershed_provisional","frozen_ambiguous","ambiguous_merged"}` loại track khỏi observe/allocate GID. Trạng thái mới `split_occluded`, `split_partial_resolved`, `matched_after_split` phải được phân loại đúng (không cấp GID mới cho `split_occluded`, không cập nhật gallery bằng A ngay sau partial commit trừ khi evidence sạch). Đây là thay đổi tối thiểu duy nhất ngoài local tracker.
8. **Timeout (spec §17):** tách `merge_detection_timeout` / `identity_recovery_timeout` ĐƯỢC, nhưng phải giữ invariant "pixel mờ không kéo dài group" (test `:133`): thời gian recovery thêm chỉ bắt đầu SAU KHI blob đã tách (có ≥1 region validated/partition), không được bị ambiguous pixels làm mới. Cần xem `lost_track_ttl_seconds` / `_lost_beyond_ttl_seconds` / `lost_track_ttl` để cùng thang và `sync_occluded_identities` (two_camera.py:~2722) không bị phá.
9. **Dataset thật còn ít.** Số dòng event trong `predictions.jsonl` (đếm theo DÒNG, chưa theo sự kiện, gồm cả group "passive" hết hạn khi member biến mất ⇒ chỉ là gợi ý): thai6: opened 22 / recovered 3 / expired 75; thai7: 9/0/16; hiep_thai5: 2/0/7; hiep1: 0. Nghĩa là: (a) hầu hết group KẾT THÚC bằng hết hạn chứ không phải recovery ⇒ ủng hộ chẩn đoán của spec, nhưng cần đo lại đúng; (b) chỉ có vài chục merge/split event thật ⇒ KHÔNG đủ huấn luyện XGBoost/MLP/Laya đáng tin. Spec §22-23 phải kèm điều kiện: cần ≥ vài trăm event được gán nhãn trước khi benchmark learned model; nếu không, kết luận là KHÔNG làm.
10. **Mục tiêu đo ("Local ID đúng") cần ground truth.** Các session có `ground_truth_identity.csv` + `predictions.jsonl` (ví dụ `experiment_test\output\reidfix_r0_session_*`, `session_hiep*`); công cụ có sẵn: `experiment_test\diagnose_identity_churn.py`, `evaluate_session_metrics.py`, `replay_acceptance.py`. P0 xác định session nào có video thô + GT để replay lại bằng tracker mới.

### 1.3 Quyết định thiết kế lead-assistant đề xuất (builder có thể phản biện bằng bằng chứng ở P0)
- Mở rộng `gate_assignments` thành bộ ra quyết định theo hypothesis cho nhóm 2-member, giữ nguyên đường code cũ khi cờ tắt.
- H1…H5 như spec + H6/H7 "detection bị từ chối là non-member" (§1.2.3).
- Commit full khi: H tốt nhất thắng H tốt nhì với margin và streak ≥ N (mặc định 3 như hiện tại, cấu hình được). Commit partial theo §15 spec (3 điều kiện) + streak ngắn hơn khi evidence cực mạnh.
- Member chưa giải quyết (`split_occluded`) được: giữ prediction riêng, vào danh sách "ứng viên ưu tiên" cho blob mới (§18 spec) trước `_create_or_reid()`, có cửa sổ `identity_recovery_timeout` bắt đầu từ lúc tách.
- Log mọi quyết định (telemetry §21 spec) kể cả khi cờ tắt (shadow mode): tính hypothesis nhưng chỉ GHI LOG, không áp dụng. Shadow mode cho phép đo "hypothesis có đúng hơn rule hiện tại không" trên dữ liệu thật mà không rủi ro.

## 2. Phase tổng quan
| Phase | Nội dung | Cổng (gate) |
|---|---|---|
| P0 Kiểm chứng + baseline (chỉ đọc/đo, không sửa tracker) | A: code-map + invariants; B: dataset + baseline; C: kịch bản tổng hợp dạng test | Lead viết `SPEC-REVIEW.md`: bảng xác nhận/bác từng claim §1; danh sách quyết định cần user |
| P1 Thiết kế | Lead + builder viết `DESIGN.md` (state machine, tham số, tương tác 2 tầng defer, API cờ, schema telemetry) | User duyệt DESIGN.md nếu có thay đổi lớn so với §1.3 (lead báo, không tự đoán) |
| P2 Shadow mode + telemetry | Hypothesis chỉ ghi log. Chưa đổi hành vi | Hypothesis tốt nhất khớp GT ≥ rule hiện tại trên replay (số liệu thật) |
| P3 Áp dụng sau cờ | Partial/full commit, birth suppression, timeout mới, trạng thái track mới, cross-camera state sets | Qua cổng benchmark §6 |
| P4 Morphology ablation | Chỉ sau P3 (tránh chồng sửa `motion_tracker.py`) | Báo cáo + khuyến nghị, không tự đổi mặc định |
| P5 (tùy chọn) Khả thi Laya arbiter | Chỉ khi dataset đủ lớn (§1.2.9) | Nếu không đủ: ghi "không khuyến nghị", dừng |

## 3. Việc chi tiết

### P0 — song song, KHÔNG sửa code tracker
**builder-a (code-map)** → `.analysis\merge-split\P0-a-code-map.md`
1. Vẽ luồng thật: `process_frame` → `_predict_tracks` → `guard.prepare` → `_detect` (+`covering_group`/`partition`, `annotate`) → `_assign` (2 tầng defer, `gate_assignments`) → unmatched loop → `_create_or_reid`. Mỗi bước file:dòng.
2. Liệt kê MỌI chuỗi `association_state` / `observation_kind` và nơi dùng (motion_tracker, occlusion_guard, cross_camera_manager, prediction_writer, two_camera, frontend nếu có).
3. Liệt kê invariant do test khóa (`test_stability_occlusion.py` + `test_motion_tracker_multiscale.py` + `test_gid_*` liên quan occlusion) và mỗi invariant có phải ràng buộc cứng của thiết kế mới không.
4. Xác nhận/bác từng mục §1.1, §1.2.1, 1.2.2, 1.2.4, 1.2.6, 1.2.8 bằng code (verified/inferred/not verified).
5. Đề xuất điểm móc tối thiểu trong code (hàm, chữ ký) cho hypothesis engine, KHÔNG viết code.

**builder-b (dữ liệu + baseline)** → `.analysis\merge-split\P0-b-baseline.md` + công cụ `backend\main_detect\experiment_test\merge_split_report.py` (file MỚI; chỉ đọc dữ liệu)
1. Kiểm kê session: cái nào có `raw_cam*.mp4` + `predictions.jsonl` + `ground_truth_identity.csv`; cái nào replay được bằng `two_camera.py` (xem `docs\lenh-chay-theo-session.md`, `docs\ablation_study_guide.md`).
2. Viết `merge_split_report.py`: parse `predictions.jsonl`, nhóm event theo group (`occlusion_group_opened/recovered/expired`, `split_assignment_deferred`, `association_recovery_pending`, `new_local_id_deferred_unresolved_merge`), tính cho từng group: thời gian merged, kết cục (full recovered / expired / member biến mất / new ID sinh ra sau), và nếu có GT: ID switch, false new ID, lost vehicle, fragmentation. Chạy `diagnose_identity_churn.py` làm baseline đối chiếu.
3. Báo con số baseline THẬT (số group, kết cục, số lỗi) và đánh giá dataset có đủ để chứng minh/bác chẩn đoán spec không. Đánh dấu mọi số "đếm theo dòng" vs "đếm theo sự kiện".
4. Liệt kê event thực tế đáng làm test hồi quy (session, frame) để builder-c dựng lại.

**builder-c (kịch bản tổng hợp = test thất bại trước)** → `backend\main_detect\tests\test_merge_split_scenarios.py` (file MỚI) + `.analysis\merge-split\P0-c-scenarios.md`
1. Dùng cách dựng `seeded_tracker()` của `test_stability_occlusion.py` (đọc, không sửa) để viết các kịch bản có kịch bản mask/box xác định: S1 tách sạch direct; S2 tách đảo (swapped) chứng cứ mạnh; S3 chỉ A rõ, B vắng nhiều frame; S4 B xuất hiện muộn sau khi đã partial; S5 B là mảnh nhiễu/vật thứ ba; S6 hết hạn trước khi tách; S7 hai xe đổi hướng/vượt nhau (ordering KHÔNG được là ràng buộc cứng); S8 group 3 member (giữ hành vi cũ); S9 A nhập nhằng (cost(7,A)≈cost(12,A) ⇒ phải WAIT, không ID theft).
2. Với mỗi kịch bản ghi rõ hành vi MONG MUỐN theo spec đã chỉnh và hành vi HIỆN TẠI. Test mô tả hành vi mong muốn của thiết kế mới dùng `pytest.mark.xfail(strict=False, reason=...)` hoặc đặt sau cờ để suite hiện tại vẫn xanh. Kịch bản mô tả hành vi hiện tại phải PASS (khóa baseline).
3. Chạy toàn bộ `pytest tests -q`, báo số pass/fail hiện tại (baseline) và test nào đã fail sẵn trước khi sửa (không đổ lỗi cho thay đổi mới).

**Lead sau P0:** đọc 3 báo cáo, viết `SPEC-REVIEW.md` (bảng claim → verified/refuted/inferred, kèm khác biệt với nhận định §1.2), liệt kê câu hỏi cần user (nếu có). Không bắt đầu P1 khi còn mâu thuẫn giữa builder.

### P1 — Thiết kế (`DESIGN.md`, do lead tổng hợp, builder-a là tác giả kỹ thuật)
Phải trả lời: (1) state machine track-level & group-level cuối cùng; (2) cách partial commit đi qua tầng per-track defer; (3) cấu hình + giá trị mặc định + cách hiệu chỉnh `MAX_PARTIAL_COST`, `PARTIAL_ASSIGNMENT_MARGIN`, penalties, timeouts; (4) hypothesis cho detection không viable; (5) schema telemetry JSON (builder-b); (6) shadow mode; (7) danh sách file/hàm sẽ sửa và chủ sở hữu; (8) tương tác với `lineage_score`, `_mark_competing_assignments`, `_unresolved_merged_birth`, `sync_occluded_identities`, cross-camera state sets; (9) kế hoạch test và cổng benchmark.

### P2 — Shadow mode + telemetry
- builder-a: hypothesis engine (hàm thuần, dễ test) trong `occlusion_guard.py`; gọi từ `gate_assignments` ở shadow mode (tính + ghi event, không đổi kết quả). Giữ nguyên toàn bộ đường code cũ.
- builder-b: schema event, ghi qua `tracker.association_events` → `prediction_writer.py` (đã có consumer ở `:381`), mở rộng `merge_split_report.py` để so "quyết định hiện tại" vs "hypothesis tốt nhất" vs GT. Đảm bảo kích thước log hợp lý (giới hạn số event/frame).
- builder-c: unit test cho engine (đã có kịch bản S1-S9), property test (hoán đổi nhãn đối xứng, cost đơn điệu), test log schema.

### P3 — Áp dụng sau cờ
- builder-a: partial/full commit, giữ `split_occluded` + prediction riêng, ưu tiên member chưa giải quyết trước `_create_or_reid`, `identity_recovery_timeout` bắt đầu sau khi tách, mọi trạng thái mới; cờ `enable_multi_hypothesis_recovery` + tham số trong constructor và `two_camera.py` (CLI `--multi-hypothesis-recovery`).
- builder-c: cập nhật test (đổi có ghi lý do), thêm test cross-camera cho trạng thái mới (`test_gid_*` pattern), chạy toàn suite với cờ TẮT (phải y hệt baseline) và BẬT.
- builder-b: replay các session có GT với cờ tắt/bật, xuất so sánh metric.
- Chỉ sửa `cross_camera_manager.py` tập trạng thái (§1.2.7) khi lead duyệt; owner: builder-a, thay đổi nhỏ nhất có thể.

### P4 — Morphology ablation (sau P3)
builder-c (owner kernel/iteration knobs trong `motion_tracker.py` ở vùng `:559-570` và `:817-824`, chỉ khi builder-a đã xong): thêm tham số cấu hình (mặc định = giá trị hiện tại), harness ablation (join kernel 3/5, dilation iterations 0/1/2) đo merge frequency, fragment frequency, ID switch, missed detection trên replay. Không đổi mặc định; chỉ báo cáo.

### P5 — (tùy chọn) Laya
Chỉ khi P2/P3 đã sinh ≥ vài trăm event có nhãn. builder-b lập kế hoạch: đặc trưng đầu vào có cấu trúc, nhãn từ GT, so sánh rule-based hiện tại / multi-hypothesis / XGBoost / MLP nhỏ / Laya (advisory, gọi khi confidence thấp). Nếu dataset không đủ: ghi rõ không làm.

## 4. Chủ sở hữu file (tránh đụng nhau; chỉnh sửa nhỏ bằng thay thế chuỗi, KHÔNG viết lại cả file, KHÔNG reformat)
| File | Owner |
|---|---|
| `src/techgar/occlusion_guard.py`, `src/techgar/motion_tracker.py` (logic hypothesis/recovery) | builder-a |
| `src/techgar/prediction_writer.py`, `experiment_test/merge_split_report.py`, schema telemetry | builder-b |
| `tests/test_merge_split_scenarios.py`, các test mới/đã chỉnh, morphology knobs (P4) | builder-c |
| `src/techgar/cross_camera_manager.py` (chỉ tập trạng thái §1.2.7), `two_camera.py` (cờ CLI) | builder-a, sau khi lead duyệt |
Tài liệu `.analysis\merge-split\*.md`: mỗi builder viết file của mình; `SPEC-REVIEW.md`, `DESIGN.md`, `REPORT.md`, `STATUS.md`: lead.

## 5. Chuẩn bằng chứng
- Claim kỹ thuật: file:dòng + trạng thái verified/inferred/not verified. Không trình bày đọc code tĩnh như đã chạy thật.
- Số liệu: nêu rõ nguồn (session, script, lệnh), phân biệt đếm theo dòng/frame/sự kiện.
- Mọi so sánh trước/sau: cùng session, cùng seed/lệnh, cờ tắt = baseline.

## 6. Cổng benchmark trước khi bật mặc định (do lead báo user quyết định)
Trên mọi session có GT replay được, so cờ BẬT với cờ TẮT:
- ID switch ↓ hoặc bằng; False new local ID ↓ hoặc bằng; Lost vehicle ↓ hoặc bằng; Fragmentation không tăng.
- Không có regression ở cross-camera: toàn bộ `tests\test_gid_*`, `test_cross_camera_manager.py` pass; số Global ID/xe và `diagnose_identity_churn.py` không xấu đi.
- Toàn bộ `pytest tests -q` xanh với cờ tắt (giống baseline) và bật.
- Overhead thời gian mỗi frame không đáng kể (đo bằng `performance.csv` hoặc đo trực tiếp).
Nếu dataset quá ít để kết luận thống kê: báo rõ "chưa đủ bằng chứng", KHÔNG tuyên bố cải thiện.

## 7. Báo cáo cuối (lead, `REPORT.md`)
Gồm: claim nào của spec đúng/sai, thay đổi đã làm (file:dòng), kết quả benchmark thật, test, phần chưa làm/rủi ro, khuyến nghị bật hay không, quyết định cần user. Dừng sau P3 (hoặc P4) để user duyệt; không tự bật mặc định.
