# TECHGAR — MERGE/SPLIT IDENTITY RECOVERY SPECIFICATION (bản đề xuất gốc của user, CHƯA kiểm chứng)

> Đây là hướng đề xuất, có thể không đúng hoàn toàn. Đối chiếu với code thật ở `REVIEW-lead-assistant.md` và MEGAPLAN.md trước khi làm theo.

## 1. Mục tiêu
Giải quyết lỗi Local ID khi hai xe đi sát/che nhau trong camera cố định, foreground của hai xe nối thành một connected component.

Trước: ID7 ... ID12 (hai khối tách) → hai foreground nối nhau (1 blob) → sau khi tách: Blob A, Blob B.
Hệ thống hiện tại có thể:
- A → ID12, B → ID7 (ID switch);
- A → ID7, B → ID13 mới (mất lineage của ID12);
- A → ID7, ID12 → LOST → EXPIRED (một xe biến mất).

Mục tiêu: không buộc quyết định toàn bộ identity ngay khi hai xe vừa tách khỏi merged blob. Duy trì nhiều giả thuyết trong vài frame, chỉ commit identity khi bằng chứng đủ mạnh.

## 2. Phạm vi
Không thay đổi kiến trúc Global ID/cross-camera ở giai đoạn đầu. CrossCameraManager chỉ nhận kết quả sau khi Local ID đã giải quyết đủ chắc.

## 3. Pipeline hiện tại
Frame → MOG2 foreground + Temporal motion → Morphology → Connected components/contours → Detections → Kalman prediction → Cost matrix (position, IoU, appearance, size) → LAPJV → Local ID.
Đã có xử lý occlusion: hai clean tracks đến gần → OcclusionGuard tạo group → một contour lớn phủ hai prediction → merged/ambiguous detection → giữ hai track sống → watershed dùng predicted centers làm seed → A, B provisional → LAPJV → so sánh direct/swapped → 3 frame nhất quán → recover. KHÔNG viết lại toàn bộ merge/split system; mở rộng hệ thống hiện tại.

## 4. Cơ chế phải giữ nguyên
- 4.1 Occlusion Group: `OcclusionGroup(members=(7,12))`; khi merged blob xuất hiện, hai track bị freeze, blob chung không cập nhật Kalman/appearance.
- 4.2 Watershed partition: `occlusion_guard.py partition()` dùng prediction từng track làm marker, cv2.watershed → region A, B, đánh dấu `observation_kind = watershed_provisional`.
- 4.3 WAIT hiện tại: `split_assignment_deferred`, `association_recovery_pending`, `frozen_ambiguous`, `split_recovering`. Khái niệm "không đủ bằng chứng → chưa assign → tiếp tục chờ" phải giữ.

## 5. Vấn đề kiến trúc
Logic phục hồi của `OcclusionGuard.gate_assignments()` thiên về atomic recovery: sau split phải có A→ID7 và B→ID12 (hoặc swap hợp lệ), nếu không toàn bộ assignment bị trì hoãn (2 tracks + 2 detections + whole assignment rõ = recover; ngược lại WAIT ALL). Quá cứng với video thực.

## 6. Case chưa xử lý tốt
Sau khi tách: A rất rõ thuộc ID7 (position, appearance, trajectory đều cao) nhưng B đứt foreground / chỉ còn một phần nhỏ / chưa qua min_area. Hành vi đúng: A→ID7, ID12→OCCLUDED. Hiện tại: không đủ cả 2 assignment → defer toàn bộ group → uncertainty kéo dài, Kalman prediction tệ dần → track mất reacquire window → LOST → EXPIRED, hoặc detection mới sinh ra new local ID.

## 7. Hướng giải quyết đề xuất
Thay ATOMIC 2→2 RECOVERY bằng MULTI-HYPOTHESIS MERGE/SPLIT RECOVERY: không quyết định identity chỉ dựa trên một assignment duy nhất; duy trì các hypothesis trong thời gian recovery.

## 8. Hypothesis model
Old tracks T1=ID7, T2=ID12; detections A, B. Tối thiểu 5 hypothesis:
- H1 Direct: A→ID7, B→ID12
- H2 Swapped: A→ID12, B→ID7
- H3 Partial 1: A→ID7, ID12→OCCLUDED (B không đủ bằng chứng/chưa xuất hiện rõ)
- H4 Partial 2: A→ID12, ID7→OCCLUDED
- H5 Wait: ID7→OCCLUDED, ID12→OCCLUDED, WAIT_MORE_EVIDENCE
Nếu chỉ có một detection A: H1: A→ID7, ID12→OCCLUDED; H2: A→ID12, ID7→OCCLUDED; H3: WAIT. Không sinh Local ID mới khi hypothesis chưa resolve.

## 9. Nguyên tắc
- 9.1 Identity preservation: track tồn tại trước merged interval ưu tiên bảo toàn lineage. Không được merged → split → new local ID nếu detection mới vẫn là candidate hợp lệ của một member.
- 9.2 Một detection không bắt buộc resolve toàn bộ group: cho phép ID7=RESOLVED, ID12=OCCLUDED thay vì cả hai WAIT.
- 9.3 Partial commit không xóa hypothesis còn lại: ID7 commit nhưng ID12 giữ `association_state = split_occluded` và prediction riêng; ID12 không bị coi là identity đã thất bại.

## 10. Evidence cho mỗi cặp Track–Detection
Không thêm AI ở bước đầu. Dùng evidence tracker đã có: position error, IoU, appearance distance, spatial appearance, bbox size, area ratio, velocity compatibility, trajectory consistency, prediction age, lost_seconds, lineage score. Có thể bổ sung: direction consistency, relative ordering, pre-merge ordering, split-side consistency (ví dụ ID7 bên trái ID12 trước merge, sau split A trái B ⇒ A→7,B→12 nhận thêm evidence). Ordering KHÔNG phải hard constraint.

## 11. Pair score
pair_cost = wp*position + wi*iou + wa*appearance + ws*size + wv*velocity + wt*trajectory (nhỏ hơn = tốt hơn). Chưa cần đổi weight hiện tại; tái sử dụng `_pair_metrics` trong motion_tracker.py.

## 12. Hypothesis score
cost(H1)=cost(7,A)+cost(12,B)+consistency_penalty; cost(H2)=cost(12,A)+cost(7,B)+consistency_penalty; cost(H3)=cost(7,A)+occlusion_penalty(12); cost(H5)=wait_penalty. WAIT không phải failure, là hypothesis hợp lệ.

## 13. Multi-frame evidence
Không commit chỉ dựa trên một frame trừ khi evidence cực mạnh. OcclusionGroup bổ sung: hypothesis_history, best_hypothesis, best_hypothesis_streak, hypothesis_scores, resolved_members, unresolved_members. Ví dụ: frame 100 H1=.47 H2=.49 → WAIT; 101 .31/.46 → WAIT; 102 .18/.61 → H1 streak=1; 103 .15/.65 → streak=2; 104 .13/.69 → commit H1.

## 14. Partial recovery (thay đổi quan trọng nhất)
A rất rõ → ID7 (cost(7,A)=.08, cost(12,A)=.62), không có B đủ chất lượng. Thay vì WAIT cả hai: A→ID7 (`matched_after_split`), ID12: `association_state = split_occluded`, `observation_kind = occluded_prediction`, tiếp tục predict trong bounded recovery window.

## 15. Chống ID theft
Partial assignment chỉ commit nếu: selected_cost < MAX_PARTIAL_COST; alternative_cost − selected_cost >= PARTIAL_ASSIGNMENT_MARGIN; detection không đồng thời là candidate mạnh của member còn lại. Ví dụ cost(7,A)=.20, cost(12,A)=.23 ⇒ WAIT, không A→ID7.

## 16. Recovery states
NORMAL → MERGE_SUSPECTED → MERGED_OCCLUDED → SPLIT_RECOVERING → {FULL_RECOVERED | PARTIAL_RECOVERED → PARTIAL_OCCLUDED → FULL_RECOVERED | WAITING → timeout policy}. Track-level: matched, frozen_ambiguous, split_recovering, split_partial_resolved, split_occluded.

## 17. Timeout policy
Không giữ track vô hạn; timeout không chỉ dựa trên merged pixel còn tồn tại. Tách `merge_detection_timeout` (ví dụ 3 s) và `identity_recovery_timeout` (ví dụ 4–5 s). Sau khi blob đã tách, identity recovery có thêm khoảng ngắn riêng; không kéo dài vô hạn bằng ambiguous pixels.

## 18. New Local ID birth suppression
Trong unresolved merge/split interval, candidate detection không tạo Local ID mới nếu còn phù hợp một unresolved member. Code đã có `new_local_id_deferred_unresolved_merge`; mở rộng sang trạng thái PARTIAL_RECOVERED: ID7 recovered, ID12 unresolved, blob B mới xuất hiện phải thử với ID12 trước khi `_create_or_reid()` tạo ID13.

## 19. Watershed
Giữ watershed hiện tại; không coi là ground truth; `watershed_provisional` chỉ là candidate geometry; sau khi hypothesis xác nhận đủ frame → `watershed_validated`. Watershed pixels không cập nhật trusted appearance.

## 20. Morphology cần audit riêng
Motion pipeline có dilate 5×5 ×2 và MORPH_CLOSE; final mask có closing trước findContours(). Morphology quá mạnh có thể tự nối hai xe trước khi OcclusionGuard xử lý. Không bỏ ngay. Chạy ablation: join kernel 3, join kernel 5, các dilation iterations; đo merge frequency, fragment frequency, ID switch, missed detection. Không tối ưu chỉ bằng nhìn video.

## 21. Telemetry bắt buộc
Mỗi merge/split event log đủ để debug và tạo dataset. Ví dụ JSON:
{"event":"split_hypothesis","group":[7,12],"detections":["A","B"],"hypotheses":{"direct":0.14,"swapped":0.71,"left_only_7":0.22,"left_only_12":0.69,"wait":0.40},"selected":"direct","streak":2,"decision":"DEFER"}
Ngoài score tổng phải log pair metrics: position, iou, appearance, spatial appearance, size, prediction age, lost_seconds. Mục tiêu thứ hai: dataset để benchmark learned decision model sau này.

## 22. Laya
KHÔNG nằm trong Phase 1. Không dùng Laya để detect vehicle, segment blob, chạy Kalman, thay LAPJV, thay watershed. Nếu sau Multi-Hypothesis Recovery vẫn còn ambiguity khó, Laya có thể thử làm Decision Arbiter: input = structured state của hypothesis; output = DIRECT | SWAPPED | PARTIAL_ID7 | PARTIAL_ID12 | WAIT. Chỉ gọi khi rule-based confidence thấp, không gọi mỗi frame.

## 23. Benchmark Laya trước production
So sánh: Current rule-based, Multi-Hypothesis rule-based, XGBoost, Small MLP, Laya. Dataset: merge/split logs của TechGAR. Metric: ID Switch ↓, False New ID ↓, Lost Vehicle ↓, Fragmentation ↓.
