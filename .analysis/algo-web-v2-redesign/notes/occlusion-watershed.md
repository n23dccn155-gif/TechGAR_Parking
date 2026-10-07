# Note — occlusion-watershed (phân hệ single-cam)

Nguồn: `occlusion_guard.py` (toàn bộ 232 dòng) + điểm chèn trong `motion_tracker.py` (`covering_group` L922-954, `gate_assignments` L1995, `_unresolved_merged_birth` L364-380, freeze `_apply_detection` L2102-2115, frozen flag L2268-2280). Cờ: `enable_occlusion_guard=True`, `enable_watershed=True` (ctor L92-93); guard timeout = `merged_reacquire_max_seconds` = 3.0 s (L229).

## Triết lý (docstring L1-6)

- Camera-local, conservative: "no colour comparison can prove a merged blob belongs to one member". Hình học mở group trước; màu chỉ dùng để VALIDATE khi đã tách. Pixel dự đoán/chia không bao giờ refresh last-real-observation time.

## Đời một occlusion group

1. **Dự báo (prepare L55-100)**: ứng viên = track có ≥3 `clean_observations` và còn được nhìn trong 3.0 s. Với mỗi cặp: overlap last clean boxes ≤ 0.20·min area (đang chồng nặng = không chứng minh được 2 xe độc lập) VÀ `gap = ‖Δcenters − (ref_a+ref_b)/2‖ ≤ 0.4·max(hypot ref)` → tạo inactive group + `independent_pairs`. Group chưa active bị xoá khi centers cách >3×hypot.
2. **Kích hoạt (covering_group L102-121 + activate L123-138)**: một detection box chứa TẤT CẢ member centers (pad 0.15·min ref) VÀ area ≥ 1.6·median member area → group; `activate` đóng băng members: frozen, occlusion_group, obs kind `occluded_prediction`, expires_at = last clean + 3.0 s — "an ambiguous blob cannot keep the group alive forever". Event `occlusion_group_opened`.
3. **Nhánh trong _detect (L922-954)**: covering_group được check TRƯỚC các filter size/appearance ("before they can delete the only evidence of two occluded cars"). Nếu watershed trả regions → detection `watershed_provisional` per member (hist + selection thật); nếu không → 1 detection `ambiguous_merged=True` (hist=None) — không ai được claim.
4. **Annotate (L140-148)**: detection non-watershed bao group sau khi detect cũng được mark `ambiguous_merged` + `occlusion_members` + kind `merged`.
5. **Gate sau LAPJV (gate_assignments L191-232)**: nhóm active valid nếu cả hai member được gán VÀ `swapped − direct ≥ 2·margin` VÀ `direct < 1.2`. `recovering` đếm frame valid liên tiếp; **≥3** → `occlusion_group_recovered`: nhóm đóng; watershed_provisional → `watershed_validated` nhưng `appearance_trusted=False` — "colour and parking evidence resume only after a natural clean split". Chưa đủ → defer: members giữ frozen + suppress MỌI detection member-like (cột costs<1.0 của rows members) để không mọc fragment mới.
6. **Birth veto (_unresolved_merged_birth L364-380)**: sau group timeout, blob chung vẫn không được mint ID mới — "only a birth veto, never permission for a stale track to claim".

## Watershed partition (L150-189)

- Chỉ group 2 member. Crop mask theo box → `distanceTransform(DIST_L2,5)`; cần ≥40 pixel fg.
- Seed = pixel fg gần predicted center nhất của từng member; seed phải nằm trong `0.25·hypot(ref)` của center — center trôi ra ngoài blob thì bỏ.
- Hai seed cách ≥ `0.2·min(ref dims)` — quá gần = chưa tách thật.
- markers: nền=1, seed label 2/3 (chấm r=2); `cv2.watershed` trên frame crop thật.
- Mỗi vùng ≥20 điểm và bbox ratio vs reference ∈ [0.35, 1.8], nếu không cả phép chia fail → merged detection.
- Event `watershed_partition_provisional`. "Provisional real-pixel regions, never fabricated rectangles."

## Tương tác với phần còn lại

- Members frozen → `association_state=frozen_ambiguous`, obs `occluded_prediction` (L2268-2280); `_apply_detection` trên ambiguous → không kalman.correct (L2102-2115).
- `_has_recent_merged_freeze` → reacquire window 3.0 s (kalman-lapjv page).
- ctor `merged_detection_area_ratio=1.60` dùng ở covering_group L112 (1.6 median ref area) và _assign L1853 (merged freeze heuristic — trang kalman đã kể).

## Figure

- occlusion-cluster.jpg — thai1 cam1 f1407: cụm 2 xe tối sát nhau ở mép làn; cùng frame đó 3 track ở `frozen_ambiguous`/`occluded_prediction` (lid18/19/20, hình kalman-coast) — track coast thay vì stretch qua blob chung.
