# V4 — Contact-sheet eyeball builder-b (4 session)

Tool: `make_sheets.py` (C) — sheets tại `.analysis/verify-replay/sheets/<session>/`.
Mỗi cell = frame gốc + ROI vàng + slot xanh/đỏ + bbox theo `association_state`
+ caption cam/f/t + ≤3 identity_events.
Nguồn predictions: **session GỐC** (flags V3 sinh từ đó — đúng cặp overlay).
Phán-quyết chiến-dịch trên `verify_cur_*` sẽ làm sau khi V1 xong.

## Coverage

| session | cửa-sổ-cờ | cells | sheets | uniform |
|---|---|---|---|---|
| hiep_toi6 | 5 (từ 239 flags) | 256 | 29 | 1f/2s/cam |
| hiep1 | 5 (43 flags) | 166 | 19 | 1f/2s/cam |
| hiep_thai3 | 27 (551 flags) | 728 | 81 | 1f/2s/cam (window-step 15) |
| hiep_thai4 | 36 (542 flags) | 850 | 95 | 1f/2s/cam (window-step 15) |
| **thai3_events** | 16 cửa-sổ quanh 161 identity_events | 614 | **69** | **window-step 5 mặc-định** |
| **thai4_events** | 23 cửa-sổ quanh 129 identity_events | 620 | **69** | **window-step 5 mặc-định** |

Tổng **362 sheets**. ⚠️ Step-15 sheets (thai3/4 flag-windows) chỉ là SANITY
quét-thưa theo LEAD — **phán-quyết sự-kiện dùng `_events` dense-5** (windows
±10f quanh từng occlusion/gid event, gộp nếu <5f). Event windows:
`flags/session_*.eventwin.txt`. Mắt xem mẫu đại-diện (không tuyên-bố từng
frame): toi6 #1/#15, thai3 #40 + quét đều.

## Xác-nhận bằng ảnh (flag → verdict)

1. **`session_hiep_thai3` f1100–1104 — ID_SWITCH/duplicate CONFIRMED bằng mắt**
   (`sheets/session_hiep_thai3/sheet_0040.jpg`):
   - f1100: xe đen chuyển-động lane giữa cam1 gán `G40 occluded`.
   - f1102: **hai box chồng trên cùng xe** — `G49 new_id` + `G40 occluded`
     ⇒ tracker cấp GID mới trong khi gid cũ còn occluded.
   - f1104: chỉ còn `G49 tracked` — G40 bị bỏ.
   - Song-song cam2 (f1101–1108): `G40 parked` trên xe ĐỖ khác ⇒ **cùng gid
     ở 2 nơi 2 cam** — GID_CONFLICT theo nghĩa-đen.
   - Đây là hiện-tượng merge/occlusion → new-id chính xác như speculation
     P0 merge-split. Evidence ảnh: CONFIRMED.

2. **`SLOT_BINDING_ERROR` f7–70 (mọi session) — parked-at-start, EXPECTED**
   (`toi6/sheet_0001.jpg`): frames đầu không có bbox nào → slots
   vision-occupied nhưng tracker chưa khởi-tạo → cờ "w/o tracking 60f" là
   hệ-quả khởi-động, KHÔNG phải lỗi binding. Loại khỏi nghi-vấn lỗi.

3. **`ROI_MISMATCH` lid f2 (toi6/thai3/hiep1)**: xe/vật ở mép ROI — nhất-quán
   với scope-note V2 (anchor ngoài polygon theo thiết-kế scope). Không phải
   misalign; giữ như cờ scope, không `config_era_suspected`.

4. **`TRACK_LOST_EARLY` (110–177/session)**: chưa xác-nhận — cần xem thêm
   sheet vùng mid-window; hiện chỉ có cờ, chưa phán.

5. **`DATA_INTEGRITY` thai4 f2442–43**: capture-gap 1 frame (1.011×ngưỡng) —
   ghi nhận, ảnh-hưởng nhỏ.

6. Vật-thể lạ: điện-thoại để bàn mép-dưới-trái ROI cam1 (toi6 f512+) — nguồn
   motion nhiễu tiềm-tàng trong ROI.

## Pending V4
- Sheets cho `verify_cur_*` outputs sau khi V1 hoàn-tất (phán-quyết
  trên replay hiện-tại, không phải record cũ).
- Xác-nhận thêm TRACK_LOST_EARLY + GID_NEW_LINEAGE_LOSS windows khi cần.
