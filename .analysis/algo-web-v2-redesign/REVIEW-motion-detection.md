# REVIEW motion-detection (builder-a, Task 6)

- Verify OK: temporal windows 0.25/0.80 (:52-53), gap 3/9 (:44,54), cửa-sổ tuổi 0.45–2.25×T + argmin (:503-506), timestamp lùi→clear (:537-541), blur 5×5 (:533), open3×3→dilate5×5×2→close-join (:559-572), comment "gộp 2 xe" (:561-563), support dilate 17×17 + fg AND support AND roi_context (:788-809), prefilter min(650,350)/22/18 (:845-847 + ctor :39-41,56), priority anchor∈poly ∨ overlap≥10% (:615-631) và floors 350/50/0.03 (:55-57), runtime CLI 20/650/100/0.05 + join args (two_camera:1807-15,1844-50), temporal hardcode (:3288-89), priority_regions wire (:2691).
- Figure thai1 f1500: box cyan "co temporal motion" + đỏ "xe do: motion=0" khớp caption chính-xác.
- limits hợp-lý; E-C-006 UNSURE đúng mức-thận-trọng; cold-start/paradox đỗ đều grounded code.
- OK — không vấn đề.
