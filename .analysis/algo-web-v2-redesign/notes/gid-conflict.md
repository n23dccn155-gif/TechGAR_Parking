# notes/gid-conflict — bảng nguồn đã xác minh (builder-b, Task 8 Step A)

Đọc ngày 2026-10-06 từ bản trên đĩa. `cross_camera_manager.py` sha256:da9a99e6fe8a061e mtime 2026-10-06 (modified, F2).

## Giá trị → file:dòng → kind

| Giá trị | file:dòng | kind |
|---|---|---|
| `_canonical_id`: union-find có path-compression qua `_global_aliases` | ccm:474-481 | class-default |
| `_bind`: canonicalize gid, gỡ member khỏi gid cũ, ghi `_local_binding_frames`, promote trajectory | ccm:483-507 | class-default |
| `_merge_global_ids`: canonical nhỏ nhất sống (invariant); guards: `_independent_global_pairs` → independently_observed_vehicles; occluded; `_check_merge_collision_risk` → merge_blocked_collision_risk; merge alias + trajectory + galleries per-cam + reservation + rebind | ccm:1271-1390 | runtime |
| `_assignment_has_margin(costs,row,col,invalid,margin)`: đòi min(alternatives) − selected ≥ margin trên cả row lẫn col | ccm:3137-3156 | class-default |
| `_cross_merge_would_conflict`: cấm merge nếu cả hai gid đều có confirmed track trong cùng một cam mà không phải motion echo | ccm:3158-3193 | class-default |
| `_resolve_same_camera_global_conflicts`: group confirmed members theo (cam, canonical gid); nếu >1 member mà không phải toàn motion-echo → giữ member có rank tốt nhất (appearance_distance → size → binding_frame → visible_count → lid), detach phần còn lại, event `same_camera_global_conflict_detached` | ccm:3195-3294 | runtime |
| `_resolve_cross_camera_global_conflicts`: members confirmed + fresh; cặp cross-cam cùng gid lệch > 2×dup_distance → evidence 2 frame liên tiếp; > 3× → detach ngay (instant); giữ member theo rank (app → binding_frame → visible_count); event `cross_camera_global_conflict_detached` | ccm:3296-3444 | runtime |
| cross_camera_duplicate_distance: ctor default match_distance×0.60; resolved từ calibration = 4.634 | ccm:153,240-247; two_camera.py:2189-2202; notes homography | derived |
| divergence_bound = 2×4.634 = 9.268; extreme = 3× = 13.9 | ccm:3348-3349 | derived |
| Call order trong update_all_tracks: `_merge_all_nearby_active_duplicates` → `_merge_unique_cross_camera_duplicates` → `_resolve_same_camera_global_conflicts` → `_resolve_cross_camera_global_conflicts` | ccm:8528-8537 | runtime |
| Sổ ambiguity `_ambiguous_local_identities`: (cam,lid) → (until_frame, competing_gids); handoff defer khi ambiguity live + source gid ngoài claim + app>0.20; dormant defer `recent_identity_ambiguity` | ccm:3644-3682, 6143-6182 | runtime |
| `gid_aliases` trong snapshot output (gid_aliases field mỗi frame) | predictions.jsonl schema | runtime |

## Events thật (predictions.jsonl)

- thai3 f2869: `cross_camera_global_conflict_detached` gid8 — detach cam1 lid64, giữ cam2 lid88, world_distance 19.216 > bound 9.268, instant=true (extreme > 13.9).
- thai4 f1327: cùng loại, gid2 detach cam2 lid33 giữ cam1 lid17, 9.317 > 9.268 non-extreme (đã qua 2-frame evidence).
- thai1 f1059-1116: `cross_camera_merge_rejected_established_ids` gid2×gid3 lặp liên-tục — cả hai established → không merge.
- thai1 f1133-1134: `dormant_duplicate_merge_deferred` → `global_id_merged` gid3→gid2 (`dormant_duplicate_reconciled`, wd 1.559, app 0.203).
- thai1 f1783: `handoff_reconciled_dormant_alias` gid4→gid2 (wd 6.259, app 0.125, support 12) + `global_id_merged` reason handoff_destination_camera_history.

## BBOX cho ảnh (đã render)
- thai3 f2869: cam1 lid64 bbox [1145,121,130,114] (đã detached → gid None), cam2 lid88 [46,245,92,101] giữ gid8.
