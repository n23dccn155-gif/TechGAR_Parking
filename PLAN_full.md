# Kế hoạch hoàn thiện TechGar2: đúng danh tính, đúng trạng thái đỗ và đồng bộ giao diện

## 1. Kết luận kiểm tra hiện tại

**Backend chưa sửa đúng hết. Lỗi không chỉ nằm ở frontend.** Hiện có ba nhóm vấn đề liên quan nhau:

1. Backend đôi lúc xác nhận đỗ từ bằng chứng đã cũ hoặc không phục hồi được ID khi rời ô.
2. Bộ quản lý phiên người dùng chưa nhận trạng thái đỗ một cách thống nhất, đồng thời hạn chế sai các thao tác lấy xe và đổi ô.
3. Frontend có thêm độ trễ, xử lý trạng thái chờ/lỗi chưa đầy đủ và một số thao tác chưa đồng bộ với backend.

Bản được kiểm tra: branch `an5_9`, commit `a75d1d71`. Kế hoạch này chưa thay đổi code.

### 1.1. Những gì đã xác minh

| Hạng mục | Kết quả |
|---|---|
| Kiểm thử tracking hiện có | **347 đạt** |
| Kiểm thử backend session | **26 đạt** |
| Kiểm thử frontend | **58 đạt** |
| Frontend typecheck và build | Đạt |
| Frontend lint | Còn lỗi `prefer-const` trong `useVehicleSession.ts` |
| Kiểm thử trình duyệt Playwright | Chưa thực thi được vì thiếu Chromium tương ứng |
| Kiểm tra dữ liệu hiep7 | Có lỗi backend thực tế, mặc dù các kiểm thử hiện tại đều đạt |

**Test đạt chưa chứng minh toàn bộ luồng chạy thật đúng.** Các ca còn thiếu chủ yếu liên quan đến kết quả xử lý đến trễ, quỹ đạo đã chuyển sang Global ID, thao tác đồng thời và frontend chạy cùng dịch vụ thật.

### 1.2. Bằng chứng quan trọng trong hiep7

- Khoảng frame 233–242, xe đen đã đi ra khỏi vùng D01 và tiếp tục di chuyển.
- Tại frame ghi nhận **243**, backend vẫn xác nhận `G#1` đỗ D01 từ kết quả vision có frame nguồn **238**, rồi giữ ID tại ô và ngừng local track.
- Xem frame raw 243 cho thấy xe đen đã ở ngoài D01. Đây là **xác nhận đỗ sai từ bằng chứng đến trễ**, không phải lỗi vẽ map.
- Đến frame 348, xe xanh thực sự ở D01, xe đen ở F05. Vì vậy không được coi mọi lần D01 đổi GID đều là cùng một xe bị đổi số.
- Phiên còn có **62 sự kiện chờ hòa giải ID muộn với lý do `trajectory_missing`**.
- Khoảng frame 1308–1309, token phục hồi GID đang giữ tại D01 hết hạn, sau đó xuất hiện GID mới.

Chưa có lịch sử request/session đầy đủ khớp hiep7 để kết luận **việc mở frontend trực tiếp gây lỗi backend**. Cần kiểm tra bằng cùng nguồn video, cấu hình và chế độ ghi hình; không suy luận nguyên nhân chỉ từ hai lần lái xe khác nhau.

### 1.3. Hiệu năng hiện tại

| Phép đo | Kết quả |
|---|---:|
| Hiep7 — tốc độ toàn phiên | Khoảng **7,08 cặp frame/giây** |
| Hiep7 — thời gian xử lý ghi trong CSV, p50/p95 | **94 / 157 ms** |
| Hiep7 — tuổi bằng chứng vision p95, cam1/cam2 | **1,47 / 1,28 giây** |
| Đo riêng detector hiện tại, cam1 p50/p95 | **421 / 438 ms** |
| Đo riêng detector hiện tại, cam2 p50/p95 | **350 / 371 ms** |
| Hai detector chạy bằng hai luồng trong phép đo này | Khoảng **736 / 803 ms** cho cả cặp |
| Frontend | Polling khoảng **500 ms**, chuyển động marker **350 ms** |

*p95 nghĩa là 95% mẫu không vượt quá mức đó.*

Hai phép đo lịch sử và detector riêng không cùng phạm vi: CSV chưa đo đầy đủ mọi giai đoạn, còn phép đo detector dùng frame cố định. Tuy vậy, kết quả cho thấy **vision đang chậm và map có thêm độ trễ riêng**. Chưa đủ dữ liệu để quy toàn bộ nguyên nhân cho mạng hoặc frontend.

---

## 2. P0 — Sửa tính đúng của tracking, đỗ xe và phục hồi ID

### 2.1. Không xác nhận đỗ bằng bằng chứng cũ đã bị chuyển động mới phủ nhận

Trọng tâm là luồng xử lý nền trong `two_camera.py` và cơ chế bằng chứng vào ô của `SlotVehicleBinder`.

**Vấn đề hiện tại:** kết quả vision của frame trước được áp dụng khi tracker đã quan sát xe ở vị trí mới. Một bằng chứng xe từng đi vào ô vẫn có thể còn hiệu lực dù cùng ID đã đi ra.

**Thay đổi:**

- Tách rõ:
  - `evidence_frame_idx`, `evidence_timestamp_s`: frame/thời gian chứa bằng chứng;
  - `applied_frame_idx`, `applied_timestamp_s`: lúc hệ thống áp dụng quyết định.
- Đồng hồ xử lý binder không được lùi về timestamp của kết quả vision nền.
- Mỗi chu kỳ chỉ cập nhật quyết định sở hữu ô sau khi đã có các quan sát tracking hiện tại.
- Một bằng chứng vào ô phải bị hủy khi có quan sát thật mới hơn chứng minh cùng GID đã đi ra hoặc đi vào ô khác; áp dụng cả khi claim trước đó đã được đánh dấu mất track.
- Kết quả vision cũ có thể bổ sung lịch sử, nhưng không được ghi đè bằng chứng chuyển động mới hơn.
- Trường hợp xe thật sự dừng rồi mất motion detection vẫn được giữ ID: **mất bbox không đồng nghĩa đã ra khỏi ô**.
- Không dùng tọa độ Kalman dự đoán làm bằng chứng xe đã đỗ.

**Nghiệm thu:** tái hiện hiep7 không còn chốt GID của xe đen vào D01 sau khi đã có detection mới chứng minh xe đi ra.

### 2.2. Hoàn thiện phục hồi ID muộn khi xe đã bị cấp GID mới

Bản mới đã có nhánh thử phục hồi muộn, nhưng còn ba lỗi trực tiếp:

1. Hàm đối chiếu quỹ đạo vẫn tìm trong lịch sử của track chưa có GID; khi track đã được cấp GID, lịch sử đã chuyển nơi lưu nên báo `trajectory_missing`.
2. Bên gọi kiểm tra `topology_score`, nhưng kết quả trả về hiện không cung cấp trường đó.
3. Có nhánh gán ID trước rồi mới thử gộp; nếu gộp bị từ chối, một phần trạng thái đã bị thay đổi.

**Thay đổi:**

- Cho hàm đối chiếu nhận rõ nguồn quỹ đạo:
  - lịch sử track chưa có GID;
  - hoặc lịch sử GID vừa được cấp cho track đang rời ô.
- Trả kết quả có cấu trúc thống nhất: điểm quỹ đạo, số quan sát thật, kiểm tra camera/vùng bàn giao, ngoại hình, xe cạnh tranh và lý do từ chối.
- Với phục hồi trong cùng camera, kiểm tra topology phải thể hiện “hợp lệ trong cùng camera”, không phụ thuộc một trường bị thiếu.
- Xác minh token thuộc đúng ô, đúng chủ GID, đúng lần rời ô và đúng track; không chỉ tin chuỗi tên nguồn gọi.
- Thực hiện phục hồi/gộp thành **một giao dịch**:
  1. Kiểm tra toàn bộ điều kiện, chưa đổi trạng thái.
  2. Nếu hợp lệ, cập nhật mapping, alias, reservation và token cùng nhau.
  3. Nếu từ chối, giữ nguyên tất cả; không ghi sự kiện thành công.
- Giữ ID nhỏ hơn chỉ sau khi chứng minh cùng một xe.
- Tách thời điểm quan sát thật cuối khỏi mốc giữ hồ sơ ID. Việc mở khóa reservation không được làm xe trông như vừa được camera nhìn thấy.

**Nghiệm thu:** xe rời ô nhận lại ID chủ ô; trường hợp chưa đủ bằng chứng phải chờ hoặc từ chối rõ ràng, không lấy ID của xe khác.

### 2.3. Duy trì bảo vệ khi hai xe đi sát nhau

Không bỏ cơ chế đóng băng bbox nhập đã có.

Bổ sung kiểm thử và kiểm tra mọi đường phục hồi/gộp:

- Bbox chứa hai xe không được cập nhật ngoại hình sạch của một xe.
- Hai ID đã có bằng chứng từng là hai xe độc lập không được gộp qua đường tắt phục hồi ô hoặc handoff.
- Sau khi tách, phải đối chiếu lại cả hai xe bằng quỹ đạo và ngoại hình.
- Khi chưa chắc chắn, nhãn tạm ẩn/chờ được phép; đổi nhầm danh tính không được phép.
- ID nhiễu không được chiếm reservation, tạo phiên người dùng hoặc trở thành chủ ô chỉ vì gần ROI.

Không đổi trọng số, tăng timeout toàn hệ thống hoặc thêm mô hình mới để thay cho các sửa lỗi trạng thái trên.

---

## 3. P0 — Thống nhất bằng chứng đỗ giữa runtime và backend session

### 3.1. Một nguồn xác nhận chủ ô

Hiện có nguy cơ mỗi nơi hiểu “xe đang đỗ” khác nhau:

- Slot có chủ nhưng bản ghi vehicle chưa có `parked_slot_id`.
- Reservation đang phục hồi vẫn bị diễn giải như xe đang đỗ.
- Bộ điều khiển phiên đếm thêm thời gian theo vòng polling thay vì thời gian bằng chứng camera.

**Thiết kế mới:** mỗi lần đỗ có một `parking_episode_id` — mã của **lần đỗ**, không phải một GID mới.

Bản ghi xác nhận gồm:

```text
parking_episode_id
global_id đã canonical hóa
slot_id
state: pending / parked / departing / released
evidence_frame_idx, evidence_timestamp_s
applied_frame_idx, applied_timestamp_s
reason
```

Quy tắc:

- Binder là nơi xác nhận chủ ô; runtime và session dùng cùng kết quả đó.
- Chỉ `state=parked` hợp lệ mới tạo sự kiện đỗ thành công.
- Reservation hoặc token phục hồi không tự được coi là một lần đỗ mới.
- Session tiếp nhận một lần đỗ theo `parking_episode_id`, không xác nhận lại bằng bộ đếm thời gian polling riêng.
- Ô đỏ nhưng chưa biết chủ phải được giữ là **“có xe/chưa xác định danh tính”**, không mặc định “xe khác”.
- Giữ chính sách `vision_primary`: không quay lại công thức OR của phiên bản cũ trong đợt sửa này.

### 3.2. Sửa xử lý snapshot và các thao tác đồng thời

- Chỉ xử lý snapshot tiến triển theo `(runtime_id, frame_index)`.
- Kiểm tra tuổi dữ liệu từng camera và bằng chứng đỗ, không chỉ timestamp xuất JSON.
- Snapshot replay không được tạo hoặc thay đổi phiên live.
- Không đếm frame lặp như bằng chứng mới.
- Sửa điều kiện xác nhận rời ô đang yêu cầu frame liên tiếp `n, n+1`: polling hợp lệ thường nhận `100, 107, 114`. Dùng quan sát mới theo timestamp và khoảng gián đoạn cho phép.
- Giao cổng chỉ dùng vị trí quan sát thật; không nối quỹ đạo qua khoảng mất dấu dài hoặc dùng vị trí lưu của xe đã mất.
- Không tự chuyển xe đang đỗ sang lấy xe chỉ vì một snapshot thiếu trường vị trí ô.
- Khi người dùng bấm lấy xe đồng thời với cập nhật đỗ, thao tác và cập nhật tự động phải kiểm tra revision trong cùng giao dịch.
- Xung đột trạng thái hoặc alias phải được ghi nhận và xử lý; không để exception làm dừng vòng điều khiển session.
- Không hợp nhất hai phiên người dùng chỉ vì hai GID được đề nghị gộp. Nếu có hai chủ phiên độc lập, đưa vào trạng thái xung đột để kiểm tra.

### 3.3. Hợp đồng API và vận hành

- Runtime snapshot chuyển sang **schema v2** cho bằng chứng đỗ mới; giữ các trường slots/vehicles đang dùng.
- Consumer v1 chỉ được xem ở chế độ tương thích/kiểm tra, không tự xác nhận phiên từ bằng chứng thiếu.
- API thay đổi trạng thái nhận `expected_revision` và `action_id` để chống phản hồi cũ, double-click và gửi lại request.
- `409`: trạng thái/ô đã thay đổi; trả trạng thái mới nhất.
- `503`: nguồn camera thiếu hoặc cũ; không coi “chưa biết” là “ô trống”.
- Bảng alias bền vững luôn đi cùng snapshot; không phụ thuộc frontend có nhận được một sự kiện gộp ngắn hạn hay không.
- Session khác `runtime_id` không tự gắn sang xe cùng số GID ở runtime mới.
- Cập nhật gate configuration phải có revision; áp dụng cấu hình mới và xóa lịch sử giao cổng cũ để tránh tạo giao cổng giả.
- Kiểm tra khởi động để frontend, session controller và monitor cùng kết nối một runtime. Không để nút khởi động realtime gọi nhầm pipeline mô phỏng cũ.

---

## 4. P1 — Sửa đầy đủ luồng sử dụng: vào bãi, đỗ, đổi ô và ra bãi

Theo lựa chọn đã thống nhất: **đổi ô vẫn giữ cùng phiên và cùng GID**.

### 4.1. Chuyển trạng thái theo ý định người dùng

Bổ sung trạng thái `RELOCATING` — đang đổi sang ô khác.

| Tình huống | Hành vi mới |
|---|---|
| Xe vừa vào, chưa chọn ô | Được chọn ô hoặc yêu cầu dẫn ra cổng |
| Đang dẫn tới ô | Được đổi đích, hủy dẫn đường hoặc dẫn ra cổng |
| Đỗ đúng ô được chọn | Backend xác nhận chủ ô → hoàn tất một lần |
| Chọn D06 nhưng đỗ D07 | Nếu cùng GID được xác nhận tại D07 → hoàn tất ở D07 |
| Đã đỗ, chọn ô khác | Chuyển `RELOCATING`, giữ cùng phiên/GID |
| Chọn ô khác nhưng chưa lái ra | Ô cũ vẫn có xe; không giải phóng ô bằng thao tác UI |
| Hủy đổi ô trước khi rời | Trở về `PARKED` tại ô cũ |
| Hủy đổi ô sau khi đã rời | Về chọn ô; không giả lập xe đã quay lại ô cũ |
| Bấm lấy xe khi xe đứng yên | Chuyển ngay `EXIT_NAVIGATION`, không cần lái xe nhúc nhích |
| Xe thật sự qua cổng ra | Kết thúc phiên từ bằng chứng giao cổng |

Tách ba dữ liệu: **ô đang thực sự đỗ**, **ô đích muốn đến**, **ý định dẫn đường**. Không dùng một biến ô đỗ cho cả ba vai trò.

Trong `EXIT_NAVIGATION`, bằng chứng đỗ cũ không được kéo trạng thái về `PARKED`. Nếu người dùng đổi ý, phải có thao tác hủy chỉ dẫn ra hoặc chọn ô mới.

### 4.2. Giao diện không tự đoán thay backend

Tiếp tục dùng hook đồng bộ session và hàm phân giải trạng thái đã tích hợp; không viết thêm một luồng polling/session song song.

Hiển thị rõ:

- Ô đỏ chưa có chủ: **“Đang xác nhận xe trong ô…”**.
- Có bằng chứng cùng GID ở ô khác: chờ xác nhận ô thực tế, không báo xe khác chiếm ô.
- Có chủ GID khác đã xác nhận: mới báo ô bị chiếm và cho chọn lại.
- Dữ liệu cũ/mất camera: tạm dừng gợi ý và báo mất dữ liệu; không tự kết luận ô trống.
- Xác nhận kéo dài quá 5 giây: hiện cảnh báo đang chờ, cho thử lại/kiểm tra kết nối; không tự báo thành công.

Thông báo hoàn tất:

- Khóa theo `session_id + parking_episode_id`.
- Mỗi lần đỗ chỉ xuất hiện một lần.
- Tự tắt sau 5 giây dù polling tiếp tục.
- Bấm lấy xe hoặc đổi ô thì tắt ngay.
- Refresh không làm sống lại thông báo đã được người dùng đóng.

Sửa đồng bộ các thao tác:

- Mọi nút hủy dẫn đường đều gọi cùng API, không chỉ xóa trạng thái local.
- Chỉ đổi giao diện sang trạng thái thành công sau khi POST được chấp nhận.
- Hiện lỗi API và nút thử lại; không chỉ ghi console.
- Chặn thao tác lặp khi request đang chờ.
- Claim session thất bại được thử lại.
- Refresh khôi phục đúng chỉ dẫn ra/đổi ô.
- Kết quả request thuộc session hoặc runtime cũ phải bị loại.

### 4.3. Dẫn đường và độ tiện dụng

- Luôn có thao tác “Chọn/đổi ô”, “Ra cổng”, “Hủy chỉ dẫn” phù hợp với phiên hiện tại.
- Bấm một ô trống mở thông tin và xác nhận, tránh đổi đích ngay do chạm nhầm.
- Tính đường ra từ vị trí xe quan sát được, không bắt buộc phải có ô đã đỗ.
- Nếu chưa biết vị trí đáng tin, báo chờ xác định vị trí; không dựng một vị trí giả.
- Giữ quy tắc đường một chiều của bản đồ; bỏ cách biến toàn bộ cạnh thành hai chiều khi dẫn ra.
- Nối vị trí xe vào làn hợp lệ, không vẽ đường thẳng xuyên dãy ô hoặc vật cản.

---

## 5. P1 — Giảm độ trễ mà không đổi tính đúng của thuật toán

### 5.1. Backend: xử lý vision và xuất dữ liệu

- Thử nghiệm chuyển hai detector sang **hai tiến trình riêng**, mỗi camera một detector, tránh phụ thuộc hai luồng Python đang không đem lại lợi ích rõ trong phép đo.
- Mỗi worker có hàng đợi tối đa một frame chờ; thay frame chưa xử lý bằng frame mới nhất. Không để backlog tăng dần.
- Kết quả luôn mang frame nguồn và revision cấu hình; loại kết quả sai revision.
- Benchmark số luồng OpenCV 1/2/4; chọn cấu hình có p95 thấp nhất và kết quả nhận diện tương đương trên tập replay cố định.
- Tối ưu phép xử lý pixel/lọc thành phần, tái sử dụng LUT, kernel và hình học ROI.
- Giữ 25 tổ hợp và cấu hình nhận diện hiện tại trong bước đầu; không giảm độ phân giải hoặc số phiếu âm thầm.
- Không vẽ debug và encode JPEG liên tục khi không có người xem và không ghi debug.
- Dùng cache ảnh/snapshot đã tạo; request HTTP chỉ đọc, không kích hoạt lại pipeline.
- Tách vị trí cập nhật thường xuyên khỏi dữ liệu session cần ghi bền vững. Không đọc/ghi/fsync toàn bộ kho session cho từng xe ở mọi lượt polling.
- Lưu bền vững ngay các chuyển trạng thái quan trọng; vị trí gần nhất được gộp ghi tối đa một lần mỗi giây.

### 5.2. Frontend: map theo kịp dữ liệu backend

- Dùng chung một nguồn snapshot cho ô và xe.
- Polling mục tiêu **200 ms**, tối đa một request đang chờ, timeout **2 giây**.
- Có bộ kiểm tra thời gian độc lập: sau **5 giây không có frame tiến triển**, báo dữ liệu cũ dù HTTP vẫn trả về.
- Driver map và monitor dùng chung quy tắc freshness, runtime và alias.
- Nội suy marker ngắn, tối đa khoảng **100–150 ms**, thay chuyển động kéo dài 350 ms.
- Không ngoại suy xe khi mất quan sát; hiển thị rõ vị trí cuối/chưa thấy xe.
- Không ghim marker vào tâm ô chỉ vì session còn `PARKED` khi runtime đã có bằng chứng rời ô đáng tin.
- Cache phép đổi tọa độ theo revision layout/calibration, không tính lại toàn bộ ở mỗi frame.
- Không tìm GID thay thế theo khoảng cách.

### 5.3. Đo đủ đường đi của dữ liệu

Bổ sung thời gian:

```text
Nhận frame
→ tracking
→ vision bắt đầu/kết thúc
→ xác nhận chủ ô
→ xuất snapshot
→ session áp dụng
→ frontend nhận
→ map/thông báo hiển thị
```

Ghi p50/p95, tuổi dữ liệu, frame bị bỏ trong hàng đợi, chi phí ghi phiên và chi phí khi có người xem.

**Mục tiêu nghiệm thu hiệu năng, chưa phải kết quả đã đạt:**

- Hai nguồn 720p: hướng tới ≥10 cặp frame/giây trên máy kiểm tra hiện tại.
- Bật frontend và một monitor không làm tốc độ backend giảm quá 10% so với cùng cấu hình không có người xem.
- Tuổi bằng chứng vision p95 ≤1 giây.
- Từ snapshot được xuất đến marker hiển thị: p95 ≤400 ms.
- Từ backend xác nhận chủ ô đến thông báo thành công: p95 ≤1 giây.
- Với ca đỗ rõ ràng, đủ quan sát: mục tiêu xác nhận toàn luồng trong khoảng 2,5 giây sau khi xe dừng.

Nếu không đạt, báo chính xác công đoạn chậm; không đánh đổi bằng gán ID thiếu bằng chứng hoặc xác nhận đỗ sớm sai.

---

## 6. Kiểm thử bắt buộc trước khi tuyên bố hoàn tất

### 6.1. Tracking và quyền sở hữu ô

- Vision trả chậm sau khi xe đã ra khỏi ROI: không khóa ID vào ô cũ.
- Xe dừng thật rồi mất motion: vẫn giữ đúng chủ ô.
- Xe chạy ngang, dừng ngắn, bò chậm: không chốt đỗ sai.
- Xe vào ô nhưng vision đến trễ: vẫn chốt được khi bằng chứng chưa bị phủ nhận.
- Phục hồi muộn dùng được lịch sử của track đã có GID mới.
- Từ chối phục hồi/gộp: mapping, alias, token và reservation không thay đổi.
- Token của D01 không lấy ID của xe thuộc ô khác.
- Hai xe gần nhau/nhập bbox/tách ra: không tráo ID.
- Một GID không giữ hai ô; một ô không giữ hai GID.

Các test này phải chạy qua hàm thật. Không mock toàn bộ kết quả quỹ đạo rồi coi đó là kiểm thử phục hồi hoàn chỉnh.

### 6.2. Session và frontend với API thật

- Vào bãi rồi yêu cầu ra ngay, chưa từng đỗ.
- Đỗ đúng ô; đỗ ô khác hướng dẫn.
- Đã đỗ rồi đổi ô trong cùng phiên.
- Hủy đổi ô trước và sau khi rời.
- Bấm lấy xe khi xe chưa chuyển động.
- POST lấy xe đồng thời với cập nhật đỗ.
- Polling tiếp tục nhưng thông báo vẫn tự tắt và không lặp.
- Refresh, double-click, timeout, API lỗi, session đã xóa.
- Alias đến muộn, runtime restart, snapshot lặp/ngược frame.
- Các frame polling nhảy số vẫn xác nhận được chuyển động hợp lệ.
- Controller không dừng khi gặp xung đột nghiệp vụ.
- Mất camera không tạo phiên, giải phóng ô hoặc kết thúc phiên giả.
- Đường ra không đi ngược đường một chiều hoặc xuyên ô đỗ.

Cài browser kiểm thử rồi chạy Playwright; không tính “thiếu browser” là đã kiểm thử giao diện.

### 6.3. Replay và thử nghiệm tích hợp

Replay vào thư mục mới, từ trước khi xe đi vào ô để xây đủ lịch sử:

- **hiep2:** ca xe đen đỗ rồi rời D01.
- **hiep7:** ca chốt D01 sai, các lần rời ô và nhánh phục hồi muộn.
- **live15:** đoạn hai xe sát nhau đã dùng kiểm tra occlusion guard.
- **hiep8:** giữ những trường hợp đã hoạt động đúng.

Với cùng nguồn và cấu hình, so sánh:

1. Pipeline backend không phục vụ giao diện.
2. Runtime server không có trình duyệt truy cập.
3. Runtime + session controller + driver map.
4. Thêm monitor và ghi phiên.

So sánh đúng chủ ô, danh tính xe và lần đỗ; cho phép frame áp dụng khác do lịch chạy, nhưng không cho phép thay đổi quyết định chỉ vì có thêm người đọc HTTP.

Sau replay, chạy ít nhất ba phiên live với hai xe, gồm tốc độ khác nhau, đỗ/rời liên tục, đổi ô và đi sát nhau.

Lưu thêm lịch sử action/session để đối chiếu được:

```text
Người dùng bấm gì
→ API nhận trạng thái nào
→ runtime có bằng chứng nào
→ session đổi ra sao
→ frontend đã nhận và hiển thị gì
```

Không ghi đè phiên cũ, không tự điền ground truth. Chỉ công bố ID switch, độ chính xác chủ ô và tỷ lệ phục hồi sau khi có nhãn xe vật lý A/B đối chiếu video.

---

## 7. Thứ tự triển khai và điều kiện bàn giao

| Gói | Công việc | Điều kiện qua bước |
|---|---|---|
| A | Khóa phiên/cấu hình tham chiếu; thêm test tái hiện lỗi hiep7 và phục hồi muộn | Test tái hiện đúng lỗi hiện tại |
| B | Sửa đồng hồ bằng chứng, arrival claim và giao dịch phục hồi ID | Không chốt ô từ bằng chứng bị phủ nhận; không đổi trạng thái khi giao dịch bị từ chối |
| C | Thống nhất parking episode, runtime v2 và session controller | Chủ ô/runtime/session cùng một quyết định; không lỗi khi thao tác đồng thời |
| D | Bổ sung ra cổng trước khi đỗ và đổi ô cùng phiên | Các luồng sử dụng mới chạy với API thật |
| E | Sửa thông báo, lỗi/chờ, định tuyến và độ trễ map | Playwright và các ca tương tác đạt |
| F | Tối ưu detector, ghi dữ liệu và phân phối snapshot | Đo trước/sau cùng cấu hình; không giảm tính đúng |
| G | Replay, thử live, cập nhật báo cáo | Có bằng chứng nghiệm thu và danh sách giới hạn còn lại |

Giữ nguyên ROI, homography, mask, detector profile và chính sách `vision_primary` trong các gói sửa tính nhất quán. Chỉ tối ưu tham số nhận diện khi có phép đo riêng chứng minh cần thay đổi.

Tài liệu bàn giao phải cập nhật theo commit mới, gồm kết quả test, bảng hiệu năng trước/sau, timeline các ca lỗi và lệnh khởi động thống nhất.

**Đợt sửa chỉ hoàn tất khi:** xe đỗ đúng được xác nhận đúng chủ và báo thành công; được ra bãi mà không bắt buộc đỗ; được đổi ô cùng phiên; rời ô nhận đúng ID; frontend không kéo ngược thao tác người dùng; và dữ liệu chậm/mơ hồ được báo là đang chờ thay vì đoán sai.
