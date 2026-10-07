# REVIEW brightness (builder-a, Task 6)

- Verify OK toàn phần: shadow thresholds (0.32-0.62/0.10/0.08/0.75, min 120px — :63-67), MOG2 700/32/detectShadows (:203), shift=median trên lưới step=min(h,w)//128 + comment 17ms→0.3ms (:450-484), `>200` fg + admit-127 khi reject_cast_shadows & có bg (:769-789), 4-điều-kiện-AND + fail-open (:705-725), bg cache 10 frame chụp trước apply (:728-757), dark_rescued ≥20px & ≥0.08 + drawContours xoá + telemetry cast_shadow_rejected (:1040-1063, 2243-2245), runtime flags (:2393-94). Comment "previous >200 threshold permanently deleted the body" đúng như trang trích.
- Figure: 2 ảnh đúng nguồn (sang8 cam2 f600 sáng hẳn vs thai1 cam1 f1500), annotation khớp caption.
- Nit nhỏ: caption ghi "(raw)" nhưng ảnh có vẽ annotation box/label — hơi lệch chữ, nội dung không sai.
- limits OK; E-C-007 CONFIRMED hợp-lệ (cột gỗ/tay người = foreground thật).
