# REVIEW parking-slots (builder-a, Task 6)

- Verify OK: order_points + phím a/o + right-click xoá (ParkingSpacePicker:25-32,155-184), schema+`.tmp` atomic + `status:"empty"` persisted (:88-107 — đúng limit ⑤), 30 ô/cam D/E/F + A/B/C (config JSON đếm được), 3-lớp mask + inset=min_edge×0.12 ellipse (:263-270), CLAHE 2.0/LUT 2.8/GAUSSIAN_C INV block25 C16 (:472-479), 25 variants + 12 phiếu + enter 0.12/exit 0.08 + dwell 2×0.5s/3×1.0s + placeholder occupied + pool 2 worker 2Hz — tất-cả khớp code.
- **④ formula "Core rescue" thiếu 1 điều-kiện**: nhánh 2 trong code là `raw≥0.30 ∧ core_ratio≥0.02 ∧ core_component_count≥2` (:425-427) — trang bỏ `≥2 components`. Mức: nhỏ (formula incomplete).
- limits nhãn CONFIRMED hợp-lý (vision-occupied f1-61 đúng mọi session; toi6 burst E-B-001/002 có trong ERRORS). "26 ảnh threshold" = base+25 đúng. Prose rõ, figure cam1 đúng 30 ô bám vạch.
