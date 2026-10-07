# V2-alignment — builder-b (4 session: hiep_thai3, hiep_thai4, hiep1, hiep_toi6)

Công cụ: `experiment_test/verify/align_overlay.py` (owner **A** — xem TOOLS-A.md) — ROI xanh-lá + slots xanh-dương lên frame gốc.
Ảnh: `.analysis/verify-replay/alignment/{hiep_thai3,hiep_thai4,hiep1,hiep_toi6}/*_cam{1,2}_f{0,mid}.jpg`

## Kết luận từng session/cam

| session | cam1 | cam2 | bằng chứng |
|---|---|---|---|
| `session_hiep_thai3` | **ALIGNED** | **ALIGNED** | f0+f2982: ROI phủ D/E/F rows; slots D01–D10/E01–E09/F01–F08 bám đúng vạch ô sơn, xe ngồi trong polygon |
| `session_hiep_thai4` | **ALIGNED** | **ALIGNED** | f0+f2882: cùng cảnh, slots A01–A10/B01–B10/C01–C10 (cam2) khớp vạch |
| `session_hiep1` | **ALIGNED** | **ALIGNED** | f0+f524: khớp; 1 xe tối-màu D-row hơi lấn mép polygon (vẫn trong ô sơn) |
| `session_hiep_toi6` | **ALIGNED** | **ALIGNED** | f0+f432: khớp |

→ 4/4 session cùng góc quay + cùng config era (config hiện-tại được vẽ cho đúng cảnh này). Verdict **ALIGNED** mọi cam ⇒ **`config_era_suspected` KHÔNG áp** (LEAD: xe ngoài ROI = scope, không tự đánh cờ era ở cam ALIGNED).

## Ghi-chú chung (áp mọi session/cam — scope, KHÔNG phải misalign)
- **Hàng xe trên-cùng khung hình (y≲140 cam1 / y≲90 cam2) nằm NGOÀI ROI và không có slot nào** — xe đỗ đó là xe thật nhưng ngoài vùng-quản-lý → tracker/binder không thấy chúng theo thiết-kế config. Đây là **scope cố-định**; V3/V4 không nên báo xe-hàng-trên là lỗi thuật-toán.
- Bốn session chia sẻ hoàn-toàn cảnh/config ⇒ lỗi lặp lại giữa chúng nhiều khả-năng systematic (config/algo), không phải ngẫu-nhiên.

## Độ phủ
2 mốc (f0, mid) × 2 cam × 4 session = **16 ảnh** — đủ cho verdict căn-chỉnh (không thay-thế V4).
