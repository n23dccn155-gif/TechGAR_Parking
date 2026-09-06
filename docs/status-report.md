# TechGar2 — Trạng thái triển khai và lỗi còn tồn tại

Cập nhật: **06/09/2026**, sau khi kiểm tra phiên **droidcam_shared_hiep2**.
Branch hiện tại: `an5_9`; HEAD lúc kiểm tra: `3c74cbd4 — fix: stabilize live parking tracking and runtime integration`.

## 1. Kết luận chính

**Chưa hoàn tất sửa lỗi danh tính xe.** Phiên hiep2 xác nhận lỗi backend: xe đen đã được lưu **G#2 tại D01**, nhưng lúc rời ô được cấp **G#4 ở frame 1181**. Đây không phải chỉ là frontend hiển thị sai và cũng không phải xe chưa từng được gán vào ô.

Phần nhận diện ô đỗ đã có cải thiện về ổn định; phần chống bbox nhập hai xe đã chặn được một ca cụ thể trong live15. Những kết quả đó không chứng minh luồng rời ô và nhận lại ID đã hoàn thiện.

Lượt cập nhật này chỉ đọc code, dữ liệu và cập nhật tài liệu/ảnh minh chứng; **không sửa thuật toán**, không ghi đè phiên gốc, không điền ground truth.

## 2. Những phần đã triển khai

### 2.1. Ổn định nhận diện ô đỗ

- Sửa lọc viền: không xóa toàn bộ vùng pixel liên thông của xe chỉ vì có một đường mảnh nối vào viền.
- Lọc riêng từng biến thể của 25 tổ hợp gamma–CLAHE.
- Ngưỡng vào occupied mặc định 0,12; trở lại empty 0,08.
- Xác nhận occupied cần ít nhất 2 mẫu và 0,5 giây; empty cần ít nhất 3 mẫu và 1 giây theo timestamp nguồn.
- Loại bằng chứng trùng/cũ, không đếm thời gian bị thiếu mẫu như bằng chứng liên tục.
- Debug dùng lại kết quả đã tính; thêm tỷ lệ pixel, số phiếu, trạng thái tức thời/đã ổn định, frame bằng chứng vào predictions.
- Giữ chính sách `vision_primary`; không đổi về công thức OR của bản cũ.

**Đã đo trên live15**, 37 mẫu mỗi camera, frame nguồn 2820–3015:

| Ô | Số lần đổi trạng thái tham chiếu | Bản sửa |
|---|---:|---:|
| cam1/F08 | 6 | 0 |
| cam1/E10 | 6 | 0 |
| cam2/A09 | 18 | 0 |

Đây là số đo nhấp nháy, **không phải độ chính xác**. Bản mới tốn CPU hơn: detect p50 khoảng 316–337 ms/camera so với 137–139 ms của cấu hình tham chiếu trên lần đo đó. Không đảm bảo mọi ô đều đúng chỉ vì trạng thái ổn định.

### 2.2. Tracking khi hai xe gần nhau

- Lưu kích thước, ngoại hình và quỹ đạo sạch trước lúc bbox bị phình.
- Nhóm bảo vệ các track có bằng chứng từng là hai xe riêng biệt.
- Không cập nhật màu/Kalman từ blob nhập mơ hồ; hạn chế sinh ID mới từ blob đó.
- Thử watershed bằng điểm gieo dự đoán và pixel thật; không đủ tin cậy thì từ chối.
- Kiểm tra cả cặp đối chiếu, cần ba frame nhất quán trước khi khôi phục hình học.
- Thêm đặc trưng màu hai vùng; vùng thiếu dữ liệu được coi là chưa biết.
- Cấm gộp cặp ID đã có bằng chứng độc lập, kể cả khi bbox về sau chạm nhau.

**Đã kiểm chứng trên live15**, cửa sổ 3500–3900:

- Bản v6 giữ xe đen G#1, xe xanh G#2 tại frame 3722 và 3733.
- Tắt occlusion guard: frame 3760 xuất hiện G#2 gắn bbox [1016,496,126,135] bao cả hai xe.
- Bật guard: từ chối bbox chung, nhưng có lúc ẩn cả nhãn.
- Không ghi sự kiện gán trùng dẫn tới `same_camera_global_conflict_detached` trong cửa sổ v6.
- Tắt đặc trưng màu chia vùng không làm thay đổi kết quả chính của đoạn này: **chưa chứng minh lợi ích thêm**.
- Chưa có watershed partition thành công trong cảnh thật được kiểm tra; không được nói watershed đã giải quyết triệt để lỗi.

### 2.3. Quản lý Global ID và bảo vệ chủ ô

- Giao dịch gộp ID trả kết quả chấp nhận/từ chối rõ ràng; nhánh sau phải tôn trọng kết quả.
- Reservation hợp lệ từ binder bảo vệ chủ ô, hủy handoff và suspend local track cũ.
- Tách giữ hồ sơ ID khỏi quyền nhận lại ID: đang che khuất không đồng nghĩa hết hạn.
- Kiểm tra chủ ID bằng toàn bộ quan sát trong frame, không chỉ danh sách đã bị lọc.
- Không dùng đường tắt đối chiếu một histogram của mô phỏng crop cho camera vật lý đã calibration.
- Các nhánh overlap/claim/world-trajectory phải tôn trọng ID đang bị bảo vệ.
- DeepReID là dependency tùy chọn; không mô tả histogram là đặc trưng CNN đã huấn luyện.

**Có code bảo vệ và test không đồng nghĩa toàn luồng đúng.** Hiep2 cho thấy reservation khi đỗ hoạt động, nhưng bảo vệ đối tượng đang rời ô vẫn có khoảng hở.

### 2.4. Các sửa tích hợp từ đợt audit trước

Đã triển khai sửa hợp đồng runtime/freshness, session revision/alias, tích hợp đồng bộ session frontend và ghi phiên. Các bài test đạt ở lần kiểm tra trước được ghi bên dưới; không lấy kết quả test đó để khẳng định đã kiểm thử live đầy đủ mọi tương tác frontend.

## 3. Lỗi mới xác nhận: xe đen G#2 → G#4 trong hiep2

### Nguồn kiểm tra

`backend/main_detect/experiment_test/output/droidcam_shared_hiep2`

Đã đọc metadata, predictions, parking/identity events, recovery diagnostics; xem trực tiếp các frame raw/debug của cả hai camera tại các mốc 356, 1170, 1181, 1200, 1250.

- Phiên live từ 12:29:53 đến 12:34:35 ngày 06/09/2026.
- 2340 frame, tốc độ xử lý toàn phiên 8,274 cặp frame/giây theo metadata.
- Validator **PASS**: metadata, predictions, timestamps, performance, hai raw và hai debug đều 2340 frame.
- Metadata xác nhận stable evidence, guard, watershed, spatial appearance đều bật; ratio 0,12, empty confirmation 1 giây; recovery retention 5 giây.
- Metadata ghi commit `d91e4906`, trong khi code hiện tại đã commit `3c74cbd4`. Commit metadata không bao gồm hash toàn bộ code chưa commit lúc chạy; không thể chỉ dựa vào commit đó để phủ nhận các tính năng mới đã bật.
- Ground truth identity mới có header, chưa có nhãn thực nghiệm đầy đủ.

### Timeline có bằng chứng

**Frame dưới đây là frame dòng predictions chứa sự kiện (thời điểm áp dụng/ghi nhận).** Event bên trong có thể mang frame nguồn cũ hơn do vision chạy nền; ghi riêng khi quan trọng.

| Frame ghi nhận | Bằng chứng | Ý nghĩa |
|---:|---|---|
| 167 | `global_id_created`, G#2, cam2/local #4 | Xe được tạo danh tính 2 |
| 356 | `vehicle_stopped_in_slot`, `slot_arrival_claim_confirmed`, event frame 349 | Binder chốt G#2 vào D01: 21 quan sát, 12 vision confirmations, overlap 0,8083 |
| 356 | `global_id_parked_reserved`; suspend cam1/#2 và cam2/#4 | Manager thật sự khóa chủ ô, không chỉ đổi màu ô |
| 968–990 | Token G#2 mở, rearm rồi hủy nhiều lần | Đã có vòng lặp token trước đoạn rời ô chính; chưa kết luận mọi blob ở đoạn này là xe đen |
| 1165 | Mở token D01/G#2 cho cam1/#6 | Bắt đầu thu bằng chứng rời ô; chưa đủ hướng đi ra |
| 1166–1169 | cam2/#9 chờ world trajectory | Ban đầu quỹ đạo ngắn/chưa đủ hướng, có lý do `stable_not_leaving_slot`; không nên bỏ các gate này tùy tiện |
| 1170 | Rearm rồi hủy `predeparture_guard_expired`, mở lại cho cam2/#9 | Mất/khởi động lại bằng chứng, bán kính quay về 5,305 px |
| 1172–1175 | cam2/#9 có 3–6 mẫu, `departure_not_yet_confirmed` | Đã vượt các bước trước đó trong nhánh recovery, đang chờ xác nhận rời ô |
| 1176 | Hủy token và mở lại lần nữa | Bằng chứng bị khởi động lại trong khi xe tiếp tục đi |
| **1181** | Token bị hủy; `global_id_created` G#4 cho cam2/#9 | **Điểm phát sinh danh tính mới cho xe đen** |
| 1181 | D01 vẫn occupied, chủ G#2, reservation parked; token không còn | Cùng xe: ô giữ ID cũ trong khi track nhận ID mới |
| 1186 | cam2/#10 nhận lại G#4 qua dormant Re-ID | Hệ thống tiếp tục củng cố danh tính sai 4 |
| 1192 | Vision D01 chuyển empty; tạo token mới cho G#2, event frame 1186 | Xác nhận ô trống đến sau khi G#4 đã được tạo; token mới có 0 đối tượng chờ |
| 1197 | Token G#2 confirmed, event frame 1192 | Đủ hai xác nhận empty ở binder, nhưng không nối lại với xe đang mang G#4 |
| 1200 | Xe đen ở cam1/local #9 mang G#4 | Video và predictions thống nhất: đây là lỗi backend |
| 1222 | `parked_id_recovery_expired`, G#2 | Token G#2 hết hạn, reservation biến mất |
| 1223 | `global_identity_expired`, G#2 | Hồ sơ cũ chuyển expired sau đó |

Ở frame 1181, vision tức thời đã báo empty (`instant_occupied=false`, 25 phiếu empty, filtered ratio khoảng 0,031), nhưng trạng thái ổn định vẫn occupied, đang chờ xác nhận. **Không nên bỏ ổn định ô đỗ để chữa lỗi này; cần sửa phối hợp thời gian và bảo vệ ID.**

### Nguyên nhân đã đối chiếu với code

1. **Hai thời hạn khác nhau bị hiểu như một.** `_cleanup_tokens()` trong `slot_vehicle_binder.py` hủy token predeparture chưa xác nhận theo `predeparture_guard_seconds=0.75`, trước cả kiểm tra expiry 5 giây. Tăng `identity-retention-seconds` 60→120 không xử lý đường hủy này.

2. **Guard 0,75 giây không tương thích với việc chờ empty tối thiểu 1 giây và vision chạy nền.** Binder còn đòi các mẫu empty của riêng nó. Đây là lỗi phối hợp state machine, không chỉ là một tham số “hơi nhỏ”.

3. **Vision vẫn occupied bị xem như một lần rebound ngay cả khi token chỉ đang predeparture.** `update_vision()` gọi `_restore_false_empty_token()` khi có token và vision occupied. Hàm này rearm bằng timestamp vision cũ. Log cho thấy rearm/hủy/mở lại, và có bước timestamp token lùi về mẫu nguồn trước. Cần phân biệt “occupied liên tục trong khi xe đang rời” với “đã empty rồi thực sự occupied trở lại”.

4. **Quyền chặn cấp ID mới gắn với token dễ mất.** Sau hủy token, cam2/#9 không còn được bảo vệ, manager cấp G#4. Reservation G#2 chỉ ngăn lấy ID của xe đã đỗ; nó chưa đủ ngăn một track rời chính ô đó nhận ID khác.

5. **Không có đường hòa giải an toàn sau cấp nhầm ID mới.** Trong `two_camera.py`, danh sách thử parking recovery bỏ qua track đã có Global ID. Vì vậy khi token G#2 được xác nhận muộn, xe đã mang G#4 không còn được xét. Không được chữa bằng cách gộp 4→2 vô điều kiện: vẫn phải chứng minh đúng xe rời D01.

6. **Sau khi token hết hạn, hồ sơ G#2 có thể hết TTL ngay theo lần quan sát chuyển động cũ.** Log xác nhận expired ngay frame kế tiếp. Cần rà soát mốc tính tuổi phục hồi sau parked; chưa replay sửa nên không khẳng định chỉ thay một dòng là đủ.

**Chuỗi lỗi:**

```text
Đỗ đúng D01/G#2
→ thu được bằng chứng xe bắt đầu rời
→ vẫn chờ vision ổn định xác nhận empty
→ token bị reset/hủy theo guard ngắn
→ mất bảo vệ local track
→ cấp G#4
→ vision xác nhận empty muộn
→ recovery bỏ qua track đã có G#4
→ token G#2 hết hạn, hồ sơ G#2 expired
```

Đây là lỗi **parking departure recovery**, khác với lỗi hai xe đang di chuyển nhập bbox đã thử trong live15. Kết quả chống nhập bbox không bao phủ ca này.

## 4. Những lỗi/chưa hoàn thiện hiện tại

| Mức | Vấn đề | Trạng thái |
|---|---|---|
| P0 | Rời D01 mất G#2, nhận G#4 | **Đã xác nhận trong hiep2; chưa sửa trong lượt này** |
| P0 | Token predeparture reset/hủy khi còn đang chờ vision | Đã có log và nhánh code tương ứng |
| P0 | Track rời ô mất bảo vệ rồi được cấp GID mới | Đã xảy ra frame 1181 |
| P1 | Không hòa giải recovery muộn với GID đã cấp | Code loại track có ID khỏi recovery |
| P1 | Cả hai nhãn có thể biến mất khi xe nhập blob | Còn trong live15; chưa chứng minh coverage/recovery đầy đủ |
| P1 | Kết quả chống nhấp nháy chưa có accuracy theo ground truth | Chỉ có số lần đổi trạng thái, không được công bố % chính xác |
| P1 | Hiệu năng detector mới và độ trễ kết quả nền | Hiep2 chạy 8,274 cặp frame/s; chưa tách nguyên nhân CPU/nguồn/ghi video |
| P2 | Frontend lint prefer-const tại useVehicleSession.ts:89 | Lần kiểm tra trước còn lỗi; chưa chạy lại trong lượt đọc hiep2 |

## 5. Việc cần làm tiếp — đề xuất, chưa implement

1. Giữ bằng chứng và quyền bảo vệ track rời ô độc lập với vòng đời một token ngắn. Track đã chứng minh xuất phát từ ô có chủ không được cấp GID mới chỉ vì vision đang chờ ổn định.
2. Chỉ reset/cancel khi có bằng chứng bác bỏ thật sự: xe trở lại ô, đối tượng không liên quan hoặc mất bằng chứng quá hạn hợp lý. Không coi mọi mẫu occupied trong giai đoạn predeparture là rebound.
3. Tách timestamp bằng chứng vision khỏi đồng hồ quản lý token; không cho dữ liệu nền cũ làm lùi mốc sống của token. Ghi `evidence_frame_idx` và `applied_frame_idx` rõ ràng.
4. Thời gian bảo vệ phải tính cả nhịp vision, cửa sổ ổn định và độ trễ worker, nhưng vẫn hữu hạn. Không đơn giản tăng mọi timeout.
5. Khi departure hợp lệ đã được xác nhận muộn, cân nhắc hòa giải với GID mới bằng nguồn gốc ô, quỹ đạo, ngoại hình, cam và bằng chứng độc lập. Nếu chắc cùng xe mới canonicalize; nếu chưa chắc, chờ và ghi lý do, không ép gộp.
6. Bảo toàn hồ sơ/appearance chủ ô sau khi rời theo mốc phục hồi phù hợp, không tính toàn bộ thời gian đỗ thành thời gian mất dấu.
7. Thêm regression tái hiện đúng chuỗi: parked → predeparture → vision tức thời empty nhưng stable occupied → worker trả chậm → token reset → new ID.
8. Replay từ trước khi xe vào D01 (không chỉ bắt đầu frame 1170), output mới. Phải tái tạo được reservation G#2 trước khi thử departure. Nghiệm thu: xe đen ra ô vẫn canonical G#2; xe khác không bị gộp; D01 trống đúng; không sinh session mới cho cùng xe.

## 6. Kiểm thử và giới hạn tuyên bố

Các kết quả kiểm thử code gần nhất từ lượt sửa trước:

- Tracking: 344 đạt.
- Backend session: 26 đạt.
- Frontend: 58 đạt; typecheck đạt; lint còn lỗi đã ghi.
- Validator live15 v6 và hai ablation: 401 frame đồng bộ.
- **Lượt này:** validator hiep2 2340 frame đồng bộ, xem raw/debug và phân tích predictions; không chạy lại toàn bộ unit test, không replay hiep2 sau sửa vì chưa sửa code.

“0 identity errors” từ một công cụ chỉ kiểm tra trùng ID đồng thời không chứng minh không có ID switch theo thời gian. Ca G#2→G#4 này có thể lọt qua phép kiểm tra đó. Ground truth còn trống nên chưa có IDF1, recovery accuracy hay slot-owner accuracy đáng tin.

CLAHE, gamma và adaptive threshold đã tồn tại. Không dùng lại kết luận cũ “chưa có adaptive threshold”, không tự tăng trọng số màu hoặc timeout để coi là chữa toàn bộ lỗi.

## 7. Tài liệu và bằng chứng

- [Báo cáo sửa live15 và ablation](fix-live15-stability-2026-09-06.md)
- [Ảnh đối chiếu raw/debug hiep2](hiep2-frame-review.jpg)
- Session gốc: `backend/main_detect/experiment_test/output/droidcam_shared_hiep2`
- Code cần rà soát tiếp: `slot_vehicle_binder.py` — `_cleanup_tokens()`, `_restore_false_empty_token()`, `update_vision()`; `two_camera.py` — vòng parking recovery trước manager; `cross_camera_manager.py` — cấp ID mới, reservation và cleanup.

**Trạng thái bàn giao: đã có cải thiện được đo ở một số cảnh, nhưng lỗi giữ danh tính xuyên suốt lúc rời ô chưa đạt. Không đóng lỗi này.**
