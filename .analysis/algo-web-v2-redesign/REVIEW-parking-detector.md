# Review: parking-detector (builder-b) — reviewer: builder-c, 2026-10-06

OK — không vấn đề nghiêm trọng.

- Cấu trúc 3 lớp (ensemble 25 = 5×5, selective line filter, stable evidence) mạch lạc và đúng mô tả pipeline vision-primary.
- Số liệu có mạch nội bộ: ratio_thr 0.12 enter / 0.08 exit (hysteresis đệm 0.08-0.12), dwell occupied 0.5s/2 mẫu vs empty 1.0s/3 mẫu, gap reset 1.5s — nhất quán giữa params, formulas và how[3.5].
- Ví dụ hiep3 f466 (B05 0/25, A01 25/25, B02 filtered 0.022 vs raw 0.122) có cite tới predictions thật; claim "core rescue chưa từng lật vote đa số trong replay" được ghi UNSURE đúng chuẩn.
- "Init = occupied giả định" phù hợp với quan sát SLOT_BINDING_ERROR f1-61 mọi session mà trang failure-gallery của tôi ghi — hai trang kể cùng câu chuyện nhất quán.
- `core_scale` 0.80 runtime vs 0.55 class-default được ghi rõ nguồn ghi đè — tốt.
