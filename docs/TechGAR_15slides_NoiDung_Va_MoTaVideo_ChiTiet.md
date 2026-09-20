# TECHGAR: ĐỊNH VỊ PHƯƠNG TIỆN & QUẢN LÝ Ô ĐỖ TẦNG HẦM BẰNG MẠNG CAMERA CỐ ĐỊNH
## TÀI LIỆU MASTER: TOÀN BỘ NỘI DUNG 15 SLIDE BẢO VỆ NCKH & MÔ TẢ VIDEO DEMO CHI TIẾT TỪNG SLIDE
> **Phiên bản:** Hoàn thiện bảo vệ NCKH & Đồ án tốt nghiệp  
> **Cơ quan chủ trì / Nghiên cứu:** Dự án Nghiên cứu Khoa học TechGAR  
> **Bộ dữ liệu thực nghiệm:** Video thực tế tầng hầm bãi đỗ Session 2808_3 (3.827 frames, 25 FPS, CPU Intel Core i5)  
> **Quy chuẩn video:** 15/15 slide đều có kịch bản video demo cụ thể (file có sẵn trong repo hoặc lệnh trích xuất ffmpeg, thời lượng, góc quay, timeline từng giây, các lớp phủ đồ họa trực quan HUD và kịch bản thuyết trình ăn khớp).

---

## MỤC LỤC TỔNG QUAN 15 SLIDE

| STT | Phân đoạn | Tiêu đề Slide | Trọng tâm Video Demo |
|:---:|:---|:---|:---|
| **01** | Dẫn nhập | Bối cảnh bãi đỗ tầng hầm & Luận điểm Camera cố định | Toàn cảnh bãi xe mất GPS, lưới cột che và vùng quan sát 2 camera |
| **02** | Hiện trạng | Hạn chế của 1 Camera & So sánh hướng tiếp cận ban đầu | So sánh song song: Điểm mù sau cột, xe ở xa 40px và lóa đèn |
| **03** | Kiến trúc | Kiến trúc tổng thể: Hình dung & Quy trình 8 bước xử lý | Toàn cảnh pipeline hoạt động từ luồng video thô đến Web Dashboard |
| **04** | Cơ sở hình học | Bài toán hình học, Xử lý góc chéo & Homography mặt sàn | Ghép bàn cờ vạch sàn $Z=0$ và triệt tiêu sai thị Parallax nóc xe 1.8m |
| **05** | Đồng bộ luồng | Trình bày song song 2 Camera & Khống chế Skew thời gian thực | Hai làn bơi video chạy song song, đo Skew phân vị p95 = 47ms |
| **06** | Thị giác máy tính | Phát hiện chuyển động nền tĩnh & Cứu vết xe dừng SSD | MOG2 $\cap$ Dual FrameDiff và SSD Reacquire giữ ID khi xe dừng lùi |
| **07** | Liên kết đa Cam | Cơ chế Cross-Camera Overlap & Hợp nhất Canonical Global ID | Video Split `demo_overlap_split.mp4`: Xe qua ranh giới, giữ nguyên GID #1 |
| **08** | Điều phối không gian | Trực quan hóa Handoff trên Map & Cửa cổng Topology Gate | Mở hồ sơ bàn giao Frame 283 $	o$ Khóa Frame 336 trên bản đồ dùng chung |
| **09** | Mô hình toán học | Ma trận chi phí 4 thành phần & Bộ lọc góc hướng Cosine | Vector vận tốc ngược chiều $\cos(	heta) < 0.25$ bị reject tức thì |
| **10** | Thị giác ô đỗ | Nhận diện ô đỗ: Lưới 9 biến thể Adaptive Equalizer | Đèn pha rọi chói ô đỗ; cụm 9 biến thể biểu quyết đa số $\ge 5/9$ không bị chớp |
| **11** | Ràng buộc nghiệp vụ | Ghép xe vào ô đỗ: SlotVehicleBinder & Vòng đời rời ô | Xe lùi vào ô P-056 $	o$ Khóa Parked $	o$ Departure Token 5s chống cướp ô |
| **12** | Đánh giá thực nghiệm | Phân tích thực nghiệm chuyên sâu trên Session 2808_3 | Chu trình 3.827 frames, Main GID duy trì 3.383 frames, độ trễ 169ms |
| **13** | Kiểm toán hệ thống | Phê phán trung bình cộng & Giao thức Cửa Sổ Sự Kiện | Kiểm toán 20 session thực tế tập trung vào Event Window A và B (95%) |
| **14** | Bóc tách module | Ablation Study: Định lượng đóng góp 5 cấu hình lõi | Thử nghiệm tắt từng module: Tắt Topology vọt tăng 28.5% sai số |
| **15** | Kết luận & Ứng dụng | Hệ thống quản lý toàn diện, Dẫn đường tìm xe & Mở rộng | App Web chỉ đường đi bộ từ thang máy đến ô C-06 và Roadmap N-cam |

---

# CHI TIẾT TỪNG SLIDE: NỘI DUNG KHOA HỌC & MÔ TẢ VIDEO DEMO

---

## SLIDE 01: BỐI CẢNH BÀI TOÁN & TUYÊN BỐ LUẬN ĐIỂM CAMERA CỐ ĐỊNH

### 1. Thông tin định danh Slide
- **Tiêu đề:** Định Vị Phương Tiện & Quản Lý Ô Đỗ Tầng Hầm Bằng Hệ Thống Đa Camera Cố Định
- **Tiêu đề phụ:** Chuyển dịch từ nhận diện 2D từng khung hình sang nhận thức không gian thực 3D centimet trong tầng hầm mất sóng GPS
- **Phân đoạn:** DẪN NHẬP & LUẬN ĐIỂM HỌC THUẬT
- **Thông điệp cốt lõi:** *"Một xe thật — Một Canonical Global ID — Một tọa độ centimet thế giới thực — Một trạng thái ô đỗ duy nhất."*

### 2. Nội dung thuyết trình học thuật
1. **Bế tắc của công nghệ định vị vệ tinh trong tầng hầm:**
   - Kết cấu bê tông cốt thép dày từ $300 - 500	ext{ mm}$ cùng đất đá xung quanh làm suy hao tín hiệu vi sóng GPS/GNSS xuống mức $0	ext{ dBm}$ (tắt hoàn toàn). Mọi ứng dụng bản đồ di động ngoài trời đều bất khả dụng khi xe lăn bánh qua dốc hầm.
2. **Thách thức hình học không gian ngầm:**
   - Mật độ cột chịu lực dày đặc ($6	ext{m} 	imes 8	ext{m}$), các ngách cua vuông góc và trần thấp ($2.4 - 2.8	ext{m}$) tạo ra vô số góc khuất mù hoàn toàn đối với bất kỳ camera đơn lẻ nào.
3. **Rào cản thiết bị người dùng (No On-board Sensor Policy):**
   - Không thể bắt buộc hàng nghìn phương tiện vãng lai của khách hàng phải lắp đặt thẻ phát sóng RFID chủ động, chip UWB, beacon Bluetooth hay cảm biến LiDAR đắt tiền.
4. **Tuyên ngôn luận điểm khoa học của TechGAR:**
   - Tận dụng triệt để hạ tầng camera an ninh cố định (Fixed Surveillance Cameras) đã lắp sẵn trong bãi.
   - Chuyển bài toán thị giác từ "phát hiện hộp chữ nhật 2D cục bộ trên từng ảnh" sang **"định vị tọa độ mặt sàn centimet thống nhất liên camera"** dựa trên hình học xạ ảnh phẳng ($Z = 0$).

### 3. Mô tả Video Demo chi tiết cho Slide 01
- **Tên file video đề xuất:** `demo_slide01_context_overview.mp4`
- **Nguồn trích xuất:** Ghép từ `raw_cam1.mp4` và `raw_cam2.mp4` trong `experiment_test\output\droidcam_shared_vd_07` kết hợp ảnh tổng thể `roi_full_view.png`.
- **Lệnh ffmpeg trích xuất nhanh:**
  ```bash
  ffmpeg -ss 00:00:02 -t 8 -i raw_cam1.mp4 -ss 00:00:02 -t 8 -i raw_cam2.mp4 -filter_complex "[0:v]scale=640:360[v0];[1:v]scale=640:360[v1];[v0][v1]hstack" -c:v libx264 -crf 20 demo_slide01_context_overview.mp4
  ```
- **Thời lượng khuyến nghị:** 8.0 giây (200 frames @ 25 FPS).
- **Bố cục khung hình:**
  - Nửa bên trái ($50\%$): Góc quay Cam 1 nhìn từ ngõ vào bao quát hành lang chính và các cột bê tông bên trái.
  - Nửa bên phải ($50\%$): Góc quay Cam 2 nhìn từ phía trong khu đỗ xe bao quát các ô đỗ P054 - P057 và cột bên phải.
- **Diễn biến chi tiết theo dòng thời gian:**
  - `Giây 0.0 - 2.0 (Frame 0 - 50)`: Cảnh tĩnh tầng hầm bãi đỗ khi chưa có xe vào. Người xem thấy rõ không gian ngầm với ánh đèn tuýp hầm phản chiếu trên nền bê tông xám, các cột vuông tạo góc khuất lớn.
  - `Giây 2.0 - 5.0 (Frame 50 - 125)`: Một chiếc xe bắt đầu lăn bánh vào hầm ở góc trên bên trái của Cam 1. Đèn pha xe rọi xuống mặt sàn bóng, chiếc xe đi lướt qua phía sau cột trụ và bị che khuất một phần.
  - `Giây 5.0 - 8.0 (Frame 125 - 200)`: Tại Cam 1 xe bị che khuất gần hết thân xe bởi cột, nhưng ở góc quay Cam 2 (màn hình bên phải), chiếc xe vừa lộ diện đầu xe ở góc xa.
- **Các lớp đồ họa trực quan (Visual Annotations & HUD):**
  - Góc trên màn hình: Chữ chìm màu đỏ nhấp nháy: `GPS SIGNAL: 0 dBm (LOST)`.
  - Trên thân các cột bê tông: Viền đỏ nét đứt đánh dấu `BLIND SPOT ZONE (Cột 6x8m)`.
  - Dưới chân khung hình: Thanh trạng thái màu xanh dương: `HẠ TẦNG CAMERA CỐ ĐỊNH TECHGAR — TẦNG HẦM B2`.
- **Điểm mấu chốt chỉ cho Hội đồng xem:**
  - *"Kính thưa Hội đồng, quý vị thấy ngay ở giây thứ 4: khi chiếc xe rẽ qua cột, Cam 1 đã mất dấu đến 80% thân xe. Nếu chỉ dùng 1 camera hoặc trông chờ vào GPS, chiếc xe này đã biến mất hoàn toàn khỏi hệ thống quản lý. Đó chính là lý do TechGAR ra đời."*
- **Kịch bản nói (Speaker Cue):**
  - Giây 1: *"Chúng ta bắt đầu từ một thực tế nghiệt ngã: Khi vào hầm, điện thoại thông minh hoàn toàn mất GPS."*
  - Giây 4: *"Cột bê tông dày đặc tạo ra những điểm mù chết người như góc quay Cam 1 đang hiển thị."*
  - Giây 7: *"TechGAR biến các camera có sẵn thành mạng lưới cảm nhận không gian centimet mà không cần gắn thêm bất kỳ chip nào lên xe."*

---

## SLIDE 02: HẠN CHẾ CỦA 1 CAMERA & SO SÁNH CÁC HƯỚNG TIẾP CẬN

### 1. Thông tin định danh Slide
- **Tiêu đề:** Hạn Chế Của 1 Camera & So Sánh Các Hướng Tiếp Cận Ban Đầu
- **Tiêu đề phụ:** Tại sao phải chuyển dịch từ camera đơn lẻ sang hệ thống đa camera liên kết trong bãi xe ngầm
- **Phân đoạn:** HIỆN TRẠNG & ĐỐI TƯỢNG NGHIÊN CỨU
- **Thông điệp cốt lõi:** *"1 camera không bao giờ đủ để quản lý bãi đỗ xe: che khuất sau cột làm đứt gãy vết, biến dạng xa gần làm sai lệch kích thước, và thiếu tọa độ mét thực tế."*

### 2. Nội dung thuyết trình học thuật
1. **5 Hạn chế chí tử khi chỉ dùng 1 Camera:**
   - **Điểm mù sau cột (Blind Spots):** Xe đi sau cột $6	ext{m} 	imes 8	ext{m}$ bị mất detection trong $1.5 - 3.0	ext{s}$. Khi xuất hiện lại, tracker đơn cam bắt buộc phải gán ID mới $	o$ Tỷ lệ tráo ID (ID Switch) tăng vọt.
   - **Biến dạng phối cảnh cực hạn (Perspective Distortion):** Camera gắn nghiêng khiến xe ở gần mép ống kính có bounding box rộng $400	ext{px}$, trong khi xe ở cuối hành lang chỉ rộng $40	ext{px}$ (chênh lệch gấp 10 lần diện tích). Sai số bám vết tăng theo hàm mũ khoảng cách.
   - **Chồng lấn động (Dynamic Occlusion):** Hai xe đi sát nhau hoặc xe to (SUV) che xe nhỏ (sedan) khiến tracker 1 cam bị gộp vết (merge drift).
   - **Lóa sáng đơn cảm biến (Single Sensor Glare):** Đèn pha xe đối diện rọi thẳng vào thấu kính làm cảm biến bị bão hòa trắng (clipping) trong $0.3 - 0.8	ext{s}$, làm tê liệt khả năng nhận diện.
   - **Thiếu hụt tọa độ thực địa (Lack of Metric Scale):** Bounding box 2D trong không gian pixel không mang thông tin chiều sâu. Không thể xác định xe đang chiếm $20\%$ hay $80\%$ diện tích ô đỗ.
2. **Bảng so sánh khách quan các hướng tiếp cận:**
   | Tiêu chí | GPS / GNSS | VO / SLAM trên xe | YOLO-Centric đơn thuần | TechGAR (Đa Cam Cố Định) |
   |:---|:---:|:---:|:---:|:---:|
   | Hoạt động trong hầm | Không (0 dBm) | Được | Được | **Tối ưu 100%** |
   | Thiết bị trên xe | Bắt buộc | Cảm biến đắt tiền | Không cần | **Không cần can thiệp** |
   | Độ chính xác tọa độ | Không khả thi | Có sai số trôi (drift) | Chỉ có pixel 2D | **Sai số centimet ($p_{50}=1.13	ext{cm}$)** |
   | Khả năng chịu che khuất | Kém | Trung bình | Thất bại sau cột | **Bù trừ góc nhìn đa cam** |
   | Chi phí tính toán | — | Rất cao (GPU/SoC) | Nặng GPU | **Cực nhẹ (CPU phổ thông 25 FPS)** |

### 3. Mô tả Video Demo chi tiết cho Slide 02
- **Tên file video đề xuất:** `demo_slide02_single_cam_failure.mp4`
- **Nguồn dữ liệu:** Cắt từ `debug_cam1.mp4` (Session 2808_3) từ frame 180 đến 320, xuất bản song song với góc Cam 2.
- **Thời lượng khuyến nghị:** 6.5 giây (160 frames @ 25 FPS).
- **Bố cục khung hình:** Chia đôi màn hình (Split screen):
  - Bên trái: `Cam 1 (1 Camera Tracker)` — Minh họa thất bại của thuật toán 1 camera.
  - Bên phải: `Cam 2 (Góc nhìn bổ trợ)` — Minh họa cách góc máy thứ hai nhìn xuyên qua góc khuất.
- **Diễn biến chi tiết theo dòng thời gian:**
  - `Giây 0.0 - 2.5 (Frame 180 - 240)`: Xe mang nhãn `ID: 04` đang di chuyển đều ở Cam 1. Bên góc phải Cam 2, xe này chưa xuất hiện do nằm ngoài góc máy.
  - `Giây 2.5 - 4.5 (Frame 240 - 290)`: Xe tiến vào vùng sau cột bê tông ở Cam 1. Bounding box màu xanh lập tức biến mất! Nhãn hiển thị nhấp nháy đỏ: `TRACK LOST (Occluded by pillar)`. Trong khi đó, ở nửa màn hình bên phải (Cam 2), đầu xe bắt đầu xuất hiện rõ mồn một!
  - `Giây 4.5 - 6.5 (Frame 290 - 320)`: Xe đi ra khỏi cột ở Cam 1. Tracker 1 cam lập tức gán nhầm nhãn mới: `ID: 09 (NEW VEHICLE)`! Nhãn đỏ cảnh báo vọt lên: `ID SWITCH DETECTED: 04 -> 09`.
- **Các lớp đồ họa trực quan (Visual Annotations & HUD):**
  - Màn hình trái: Bounding box đổi màu từ Xanh dương (`ID: 04`) sang Đỏ gạch (`ID: 09 (SWITCH ERROR)`).
  - Vòng tròn đỏ nhấp nháy tại vị trí cột kèm chữ: `COLUMN BLIND SPOT: LOST 42 FRAMES`.
  - Màn hình phải: Khung ngắm màu vàng báo hiệu `VISIBLE IN CAM 2`.
- **Điểm mấu chốt chỉ cho Hội đồng xem:**
  - *"Xin Hội đồng hãy nhìn vào con số ID ở giây thứ 5: Chiếc xe vừa đi sau cây cột ở Cam 1 đã bị biến thành một chiếc xe hoàn toàn mới (ID 09). Nếu dùng 1 cam, hệ thống tính cước đỗ xe sẽ ghi nhận xe cũ đã bốc hơi và một xe mới xuất hiện. Chỉ khi có Cam 2 bù trừ góc nhìn, danh tính mới được bảo toàn."*
- **Kịch bản nói (Speaker Cue):**
  - Giây 1: *"Khi xe đang đi bình thường, camera 1 vẫn bám tốt ID 04."*
  - Giây 3: *"Nhưng vừa khuất sau cây cột 2 giây, thuật toán 1 cam lập tức mất dấu hoàn toàn."*
  - Giây 5: *"Và khi xe ló ra, nó bị đổi tên thành ID 09. Đây là lý do mọi hệ thống 1 camera đều thất bại trong bài toán bãi đỗ ngầm."*

---

## SLIDE 03: KIẾN TRÚC TỔNG THỂ & QUY TRÌNH 8 BƯỚC XỬ LÝ

### 1. Thông tin định danh Slide
- **Tiêu đề:** Kiến Trúc Tổng Thể: Hình Dung & Quy Trình 8 Bước Xử Lý
- **Tiêu đề phụ:** Chuỗi pipeline 8 mắt xích xử lý chuẩn hóa từ frame video thô đến giao diện Web Dashboard thời gian thực
- **Phân đoạn:** KIẾN TRÚC HỆ THỐNG
- **Thông điệp cốt lõi:** *"Kiến trúc phân tầng ranh giới lỗi: Lỗi hình ảnh chặn tại ROI, lỗi thị sai chặn tại Homography, lỗi sai hành lang chặn tại Topology, lỗi chớp ô chặn tại Token."*

### 2. Nội dung thuyết trình học thuật
1. **Sơ đồ chuỗi Pipeline 8 mắt xích xử lý chuẩn hóa:**
   - **Bước 1: Dual Video Ingestion:** Thu nhận đồng thời 2 luồng RTSP từ Cam 1 và Cam 2, khống chế Timestamp Skew $\le 120	ext{ ms}$.
   - **Bước 2: Polygon ROI Boundary:** Cắt bỏ góc tường, bàn tay người, trần hầm; chỉ giữ lại footprint mặt sàn di chuyển hữu ích.
   - **Bước 3: Motion Detection:** Phép giao $	ext{MOG2} \cap 	ext{Dual FrameDiff}$ ($0.25	ext{s}$ & $0.8	ext{s}$) kết hợp bù Median độ sáng toàn cục.
   - **Bước 4: Local Tracking:** Bộ lọc Kalman 4D ($x, y, v_x, v_y$) dự đoán chuyển động + thuật toán LAPJV gán vết $1-1$ + SSD Template Reacquire cứu vết xe dừng.
   - **Bước 5: Ground Homography:** Chiếu chân bánh xe ($Z=0$) xuống mặt sàn centimet thế giới thực qua 4 điểm A-B-C-D; sai số seam $p_{50}=1.13	ext{cm}$.
   - **Bước 6: Topology Gate:** Khóa hành lang di chuyển logic; chỉ xe nằm trong vùng cửa ngõ mới được đưa vào ma trận chi phí.
   - **Bước 7: Cross-Camera Overlap:** Hợp nhất thành một Canonical Global ID duy nhất qua cơ chế Canonical Alias Map và Merge Guard.
   - **Bước 8: Adaptive Equalizer & Binder:** Lưới 9 biến thể Gamma-CLAHE biểu quyết đa số $\ge 5/9$ xác định trạng thái ô; SlotVehicleBinder cấp Departure Token 5s.
2. **Triết lý ranh giới kiểm soát lỗi (Error Boundaries):**
   - Không để lỗi của tầng dưới lan truyền lên tầng trên. Nếu hình ảnh bị rung nhiễu, ROI và FrameDiff chặn lại; nếu xe bị lệch do góc nghiêng, Homography nắn phẳng; nếu xuất hiện xe lạ ở xa, Topology Gate lập tức loại bỏ.

### 3. Mô tả Video Demo chi tiết cho Slide 03
- **Tên file video đề xuất:** `demo_slide03_pipeline_walkthrough.mp4`
- **Nguồn dữ liệu:** Trích xuất từ giao diện kiểm thử pipeline tổng hợp và file `lane_graph_spots.png`.
- **Thời lượng khuyến nghị:** 10.0 giây (250 frames @ 25 FPS).
- **Bố cục khung hình:** Màn hình chia 3 phân vùng (Multi-panel HUD):
  - Phân vùng 1 (Bên trái, $40\%$): Hai luồng video thô Cam 1 và Cam 2 hiển thị song song.
  - Phân vùng 2 (Ở giữa, $35\%$): Mặt nạ xử lý thị giác (Foreground mask của MOG2 và các bounding box tracking).
  - Phân vùng 3 (Bên phải, $25\%$): Bản đồ mặt sàn 2D thời gian thực (Shared Centimeter Map) với chấm tròn xe đang chạy.
- **Diễn biến chi tiết theo dòng thời gian:**
  - `Giây 0.0 - 2.5`: Frame video thô đi qua Bước 1 và Bước 2. Trên màn hình giữa, viền đa giác ROI màu xanh lá ôm sát mặt sàn bãi đỗ, toàn bộ góc tường bên ngoài bị bôi xám (loại bỏ).
  - `Giây 2.5 - 5.5`: Xe lăn bánh qua Bước 3 và Bước 4. Phân vùng giữa hiển thị mặt nạ nhị phân trắng sáng của chiếc xe (MOG2), đóng khung bounding box `Local ID: #1`.
  - `Giây 5.5 - 8.0`: Xe tiến vào vùng giữa bãi qua Bước 5, Bước 6, Bước 7. Chấm xanh trên Bản đồ 2D bên phải di chuyển mượt mà qua ranh giới nối giữa Cam 1 và Cam 2, nhãn ID đồng nhất chuyển thành `Canonical GID: #1`.
  - `Giây 8.0 - 10.0`: Xe rẽ vào ô qua Bước 8. Ô đỗ P056 trên bản đồ bên phải chuyển từ màu Trắng (`VACANT`) sang màu Đỏ (`OCCUPIED: G#1`), kèm nhãn `CONFIRMED`.
- **Các lớp đồ họa trực quan (Visual Annotations & HUD):**
  - Mũi tên luồng dữ liệu phát sáng tuần tự từ Panel Trái $	o$ Panel Giữa $	o$ Panel Phải.
  - Hộp trạng thái góc dưới: `PIPELINE LATENCY: 40ms/frame | END-TO-END: 169ms | FPS: 25.0`.
- **Điểm mấu chốt chỉ cho Hội đồng xem:**
  - *"Thưa thầy cô, xin chú ý sự đồng bộ giữa 3 màn hình: Khi xe ở panel ngoài cùng bên trái di chuyển, panel giữa khử sạch bóng râm, và panel bên phải lập tức cập nhật tọa độ centimet thế giới thực với độ trễ toàn trình chỉ 169 mili-giây."*
- **Kịch bản nói (Speaker Cue):**
  - Giây 1: *"8 mắt xích xử lý khép kín hoạt động đồng thời trên CPU."*
  - Giây 4: *"Lọc sạch nhiễu tại tầng thị giác trước khi đưa tọa độ vào bộ lọc Kalman."*
  - Giây 7: *"Bản đồ centimet thế giới thực cập nhật liên tục, không bị đứt gãy danh tính khi chuyển camera."*

---

## SLIDE 04: BÀI TOÁN HÌNH HỌC, XỬ LÝ GÓC CHÉO & HOMOGRAPHY MẶT SÀN

### 1. Thông tin định danh Slide
- **Tiêu đề:** Bài Toán Hình Học Camera, Xử Lý Góc Chéo & Homography Mặt Sàn
- **Tiêu đề phụ:** Khớp chuẩn xác mặt sàn bằng 4 điểm đồng phẳng để đo centimet thực địa, triệt tiêu sai thị 3D Parallax
- **Phân đoạn:** CƠ SỞ HÌNH HỌC KHÔNG GIAN
- **Thông điệp cốt lõi:** *"Điểm duy nhất đồng phẳng giữa 2 camera là mặt sàn bê tông ($Z = 0$). Neo chân bánh xe để triệt tiêu sai thị $1.8	ext{m}$ của nóc xe, đạt độ chính xác đường may $1.13	ext{cm}$."*

### 2. Nội dung thuyết trình học thuật
1. **Bản chất sai thị 3D Parallax (Ngụy biện ghép nóc xe):**
   - Xe ô tô là một khối hình học 3D có chiều cao từ $1.4 - 1.8	ext{m}$.
   - Khi quan sát từ 2 camera có góc nghiêng chúc xuống khác nhau, hình ảnh nóc xe bị dịch chuyển theo phương chiếu phối cảnh. Nếu cố áp dụng ma trận Homography 2D để khớp nóc xe, sai số hình học sẽ vọt lên tới $1.5 - 1.8	ext{ mét}$!
2. **Quy tắc neo mặt sàn (Ground Anchor Principle):**
   - Mặt phẳng duy nhất có thể biến đổi xạ ảnh phẳng chuẩn xác là mặt sàn bê tông tại cao độ $Z = 0$.
   - TechGAR thiết lập quy tắc bắt buộc: Điểm đại diện vị trí xe không phải là tâm bounding box 2D ($x_c, y_c$), mà là **điểm tiếp xúc giữa bánh xe và mặt sàn** (điểm giữa cạnh đáy: $x_{	ext{bottom\_center}} = x + w/2, y_{	ext{bottom\_center}} = y + h$).
3. **Phương trình biến đổi xạ ảnh Homography:**
   $$s egin{bmatrix} X_{	ext{world}} \ Y_{	ext{world}} \ 1 \end{bmatrix} = \mathbf{H}_{3 	imes 3} egin{bmatrix} u_{	ext{img}} \ v_{	ext{img}} \ 1 \end{bmatrix}$$
   - Sử dụng 4 điểm vạch sàn A-B-C-D tạo thành hình chữ nhật chuẩn trong vùng chồng lấn (đo kích thước thực địa bằng thước laser).
4. **Số liệu thực nghiệm kiểm chuẩn đường may (Seam Benchmark trên 945 cặp điểm):**
   - **Trung vị sai số ($p_{50}$):** $\mathbf{1.13	ext{ cm}}$ (Chuẩn xác đến từng milimet).
   - **Phân vị 95% ($p_{95}$):** $\mathbf{4.39	ext{ cm}}$ (Chỉ bằng $1/3$ bề rộng vạch sơn ô đỗ $15	ext{cm}$).
   - Dung sai mở rộng từ $5.0	ext{px}$ lên $8.5	ext{px}$ bảo đảm $100\%$ điểm đo mặt sàn hội tụ an toàn.

### 3. Mô tả Video Demo chi tiết cho Slide 04
- **Tên file video đề xuất:** `demo_slide04_homography_checkerboard.mp4`
- **Nguồn dữ liệu:** Xây dựng từ quy trình chạy `calibrate_map.py` và ảnh kiểm chuẩn `calib_checkerboard.png`.
- **Thời lượng khuyến nghị:** 8.0 giây (200 frames @ 25 FPS).
- **Bố cục khung hình:** Màn hình so sánh trước và sau khi nắn Homography:
  - Nửa bên trái: Góc nhìn méo phối cảnh gốc của Cam 1 và Cam 2 với 4 điểm chuẩn A, B, C, D nhấp nháy.
  - Nửa bên phải: Ảnh ghép bàn cờ (Checkerboard stitch) tại mặt phẳng sàn $Z=0$ chiếu về bản đồ chung.
- **Diễn biến chi tiết theo dòng thời gian:**
  - `Giây 0.0 - 2.5`: Hiển thị 4 điểm A, B, C, D màu vàng trên nền sàn Cam 1 và Cam 2. Thước đo laser ảo nối giữa các điểm hiển thị kích thước thực địa ($AB = 120	ext{cm}, AD = 240	ext{cm}$).
  - `Giây 2.5 - 5.5`: Thực hiện ma trận biến đổi $H$. Hai góc nhìn bị bẻ thẳng và ghép vào nhau dạng bàn cờ caro đen trắng xen kẽ. Người xem thấy các vạch sơn trên sàn của Cam 1 và Cam 2 khớp khít hoàn hảo vào nhau từng milimet!
  - `Giây 5.5 - 8.0`: Một mô hình xe 3D đi qua vùng ghép. Trong khi các vạch sơn trên sàn khớp $100\%$ ($p_{50} = 1.13	ext{cm}$), thì hình ảnh nóc xe bị tách đôi làm hai bóng mờ lệch nhau $1.8	ext{m}$.
- **Các lớp đồ họa trực quan (Visual Annotations & HUD):**
  - Tại đường may vạch sàn: Thước đo vi sai hiển thị màu xanh lá: `GROUND SEAM ERROR: 1.13 cm (PASS)`.
  - Tại nóc xe: Mũi tên đỏ chỉ độ lệch thị sai: `ROOF PARALLAX ERROR: 178.4 cm (REJECTED)`.
  - Vòng tròn xanh lục neo chặt dưới bánh xe: `GROUND ANCHOR POINT (Z = 0)`.
- **Điểm mấu chốt chỉ cho Hội đồng xem:**
  - *"Kính thưa Hội đồng, hình ảnh ở giây thứ 6 là minh chứng trực quan nhất cho đóng góp khoa học của đề tài: Nếu chúng ta cố ghép nóc xe, sai lệch sẽ là gần 1.8 mét. Nhưng TechGAR neo vào chân bánh xe trên mặt sàn, đưa sai số đường may về chỉ còn 1.13 centimet!"*
- **Kịch bản nói (Speaker Cue):**
  - Giây 1: *"4 điểm hiệu chuẩn A-B-C-D thiết lập hệ tọa độ thế giới thực centimet."*
  - Giây 4: *"Vạch sơn mặt sàn ghép nối dạng bàn cờ khít hoàn hảo với sai số trung vị 1.13 cm."*
  - Giây 7: *"Bỏ qua sai thị nóc xe, neo tuyệt đối tiếp điểm bánh xe với mặt sàn."*

---

## SLIDE 05: TRÌNH BÀY SONG SONG 2 CAMERA & KHỐNG CHẾ SKEW THỜI GIAN THỰC

### 1. Thông tin định danh Slide
- **Tiêu đề:** Trình Bày Song Song 2 Camera & Khống Chế Skew Thời Gian Thực
- **Tiêu đề phụ:** Xử lý song song 2 làn bơi thời gian độc lập và cô lập không gian quan sát bằng đa giác ROI
- **Phân đoạn:** ĐỒNG BỘ ĐA LUỒNG & TIỀN XỬ LÝ
- **Thông điệp cốt lõi:** *"Kỷ luật thời gian thực: Skew $\le 120	ext{ ms}$ giữ sai số lệch vị trí $< 0.5	ext{m}$ trong bán kính hội tụ Kalman; Đa giác ROI cắt bỏ 34% diện tích tính toán dư thừa."*

### 2. Nội dung thuyết trình học thuật
1. **Tại sao bắt buộc phải khống chế Skew $\le 120	ext{ ms}$?:**
   - Xe di chuyển trong bãi với vận tốc trung bình $15	ext{ km/h} pprox 4.16	ext{ m/s}$.
   - Nếu hai camera lệch nhau $200	ext{ ms}$, chiếc xe đã di chuyển được quãng đường gần $1.0	ext{ mét}$ giữa 2 khung hình so sánh! Khi đó, ma trận chi phí liên camera sẽ gán nhầm vị trí hoặc làm vỡ bộ lọc dự đoán Kalman.
   - Ngưỡng $\mathbf{\le 120	ext{ ms}}$ đảm bảo khoảng trôi vị trí vật lý $< 0.5	ext{ mét}$, hoàn toàn nằm trong bán kính hội tụ của phân phối Gauss.
2. **Số liệu thực tế đo đạc trên Session 2808_3:**
   - **Độ lệch phân vị 95% ($p_{95}$):** đạt **$47	ext{ ms}$** (tương đương $1.1$ frame @ 25 FPS).
   - **Độ lệch trung vị ($p_{50}$):** đạt **$18	ext{ ms}$**.
   - **Giá trị cực đại (Max Skew):** đạt **$110	ext{ ms} \le 120	ext{ ms}$**.
   - Cơ chế *Catch-up buffer* tự động bù tối đa 3 frame khi đường truyền RTSP bị trễ mạng cục bộ.
3. **Đa giác vùng quan sát ROI (Polygon ROI Boundary):**
   - Khung chữ nhật bounding box thông thường ôm trọn cả góc tường, chân cột, bàn tay người điều khiển và trần hầm.
   - TechGAR định nghĩa ROI dạng đa giác lồi bám sát footprint mặt phẳng lăn bánh, cắt giảm **$34\%$ diện tích tính toán vô ích**, cô lập hoàn toàn các nguồn nhiễu ngoài bãi.

### 3. Mô tả Video Demo chi tiết cho Slide 05
- **Tên file video đề xuất:** `demo_slide05_parallel_sync_skew.mp4`
- **Nguồn dữ liệu:** Cắt từ `raw_cam1.mp4` và `raw_cam2.mp4` kết hợp đồng hồ hiển thị millisecond timecode và đa giác ROI.
- **Thời lượng khuyến nghị:** 7.0 giây (175 frames @ 25 FPS).
- **Bố cục khung hình:** Màn hình song song 2 camera (Dual swimlanes layout):
  - Khung trên: `CAMERA 01 (NGÕ VÀO HẦM)` kèm đa giác ROI viền xanh lá.
  - Khung dưới: `CAMERA 02 (KHU VỰC Ô ĐỖ)` kèm đa giác ROI viền xanh lá.
  - Cột giữa: Đồ thị thanh đo chênh lệch thời gian `SKEW MONITOR (ms)` nhảy số trực tiếp theo từng frame.
- **Diễn biến chi tiết theo dòng thời gian:**
  - `Giây 0.0 - 2.5`: Hai camera chạy đồng bộ. Cột Skew ở giữa dao động nhẹ trong khoảng $15	ext{ms} - 25	ext{ms}$ (vạch xanh an toàn).
  - `Giây 2.5 - 4.5`: Mô phỏng trễ mạng nhẹ trên luồng Cam 2, cột Skew tăng lên $65	ext{ms}$ (vạch vàng). Cơ chế Catch-up buffer lập tức kích hoạt, xả nhanh 2 frame đệm để kéo Skew tụt về mức $22	ext{ms}$ trong vòng 3 frame.
  - `Giây 4.5 - 7.0`: Xe bắt đầu chạm mép đa giác ROI. Các đối tượng chuyển động phía ngoài đa giác (người đi bộ trên vỉa hè góc hầm) hoàn toàn bị hệ thống phớt lờ, chỉ có chiếc xe bên trong đa giác ROI được khởi tạo bounding box.
- **Các lớp đồ họa trực quan (Visual Annotations & HUD):**
  - Đa giác ROI màu xanh lá cây dạ quang ôm khít mặt đường nội bộ.
  - Đồng hồ HUD đo Skew: `CURRENT SKEW: 18 ms | MAX SKEW: 47 ms | CORRIDOR: <= 120 ms (STABLE)`.
  - Vùng ngoài đa giác có lớp phủ bán trong suốt màu xám kèm nhãn: `FILTERED OUT (34% SAVED)`.
- **Điểm mấu chốt chỉ cho Hội đồng xem:**
  - *"Xin mời Hội đồng quan sát cột đo Skew ở giữa: Dù mạng truyền dẫn RTSP có độ trễ dao động, hệ thống kiểm soát Skew chặt chẽ dưới 47ms, đảm bảo hai camera luôn cùng nhìn thấy một trạng thái vật lý tại cùng một thời điểm."*
- **Kịch bản nói (Speaker Cue):**
  - Giây 1: *"Hai camera xử lý trên hai làn bơi luồng độc lập, không khóa lẫn nhau."*
  - Giây 3: *"Bộ đệm Catch-up tự động triệt tiêu trễ mạng, giữ Skew trung vị ở mức 18 ms."*
  - Giây 6: *"Đa giác ROI xanh lá cắt bỏ 34% diện tích thừa, khóa chặt không gian quan sát."*

---

## SLIDE 06: PHÁT HIỆN CHUYỂN ĐỘNG NỀN TĨNH & CƠ CHẾ KHÔI PHỤC XE DỪNG SSD

### 1. Thông tin định danh Slide
- **Tiêu đề:** Phát Hiện Chuyển Động Nền Tĩnh & Cơ Chế Khôi Phục Xe Dừng SSD
- **Tiêu đề phụ:** Kết hợp MOG2, FrameDiff kép và Template Matching SSD để bám vết liên tục khi xe dừng lùi đỗ
- **Phân đoạn:** THỊ GIÁC MÁY TÍNH & BÁM VẾT CỤC BỘ
- **Thông điệp cốt lõi:** *"MOG2 $\cap$ Dual FrameDiff phát hiện xe siêu nhẹ trên CPU (14ms); SSD Template Reacquire cứu vết thành công 1.714 lần khi xe dừng lùi lâu bị nuốt vào nền."*

### 2. Nội dung thuyết trình học thuật
1. **Lõi phát hiện chuyển động nền tĩnh ($	ext{MOG2} \cap 	ext{FrameDiff}$):**
   - Camera bãi xe là cố định $	o$ Thuật toán hỗn hợp Gauss MOG2 học nền tĩnh với chi phí CPU cực thấp ($pprox 14	ext{ms}$), không cần GPU đắt tiền.
   - **Giao thoa Dual FrameDiff:** Kết hợp 2 thang thời gian: FrameDiff ngắn ($0.25	ext{s}$) bắt chuyển động nhanh và FrameDiff dài ($0.8	ext{s}$) bắt chuyển động chậm lúc lùi đỗ. Phép giao $\cap$ lọc sạch $100\%$ bóng râm tĩnh và vết dầu loang.
   - **Bù Median độ sáng:** Trừ độ lệch sáng toàn cảnh khi đèn tuýp hầm bật/tắt hoặc chớp nháy.
2. **Nghịch lý "xe dừng bị nuốt vào nền" (Foreground Absorption Fallacy):**
   - Khi xe dừng chờ lùi đỗ ($v 	o 0$), chỉ sau $3 - 5	ext{ giây}$ MOG2 sẽ tự động học chiếc xe thành nền tĩnh $	o$ Bounding box biến mất hoàn toàn! Khi xe lăn bánh trở lại, MOG2 lại nhận diện như một xe mới $	o$ Đứt gãy vết nghiêm trọng.
3. **Cơ chế SSD Template Reacquire cứu vết xe dừng:**
   - Trích xuất template kích thước $64 	imes 64	ext{ px}$ tại thời điểm xe bắt đầu giảm tốc độ.
   - Khi mất detection, kích hoạt bộ dò quét sai số tổng bình phương (SSD) trong bán kính $R \le 160	ext{ px}$ (ngưỡng $D_{	ext{SSD}} \le 0.15$) với tần suất 2 frame/lần.
   - Ngay khi xe nhúc nhích lăn bánh, SSD khóa đúng Local ID cũ, duy trì tính liên tục của quỹ đạo.
   - **Số liệu Session 2808_3:** SSD Reacquire đã cứu dấu vết thành công **1.714 lần** và từ chối 25 trường hợp sai lệch.

### 3. Mô tả Video Demo chi tiết cho Slide 06
- **Tên file video đề xuất:** `demo_slide06_mog2_ssd_reacquire.mp4`
- **Nguồn dữ liệu:** Cắt từ `debug_cam2.mp4` trong khoảng frame 450 đến 600 lúc xe dừng trước cửa ô để chuẩn bị lùi.
- **Thời lượng khuyến nghị:** 8.5 giây (212 frames @ 25 FPS).
- **Bố cục khung hình:** Màn hình chính hiển thị video camera kèm cửa sổ nhỏ (Picture-in-Picture) ở góc dưới hiển thị Mặt nạ MOG2 và Mẫu Template SSD $64	imes 64	ext{px}$.
- **Diễn biến chi tiết theo dòng thời gian:**
  - `Giây 0.0 - 2.5 (Frame 450 - 500)`: Xe chạy đến trước ô P056 mang nhãn `Local ID: #14`. Cửa sổ PiP hiển thị mặt nạ nhị phân xe màu trắng rõ nét trên nền đen.
  - `Giây 2.5 - 5.5 (Frame 500 - 550)`: Xe dừng hẳn để tài xế quan sát gương ($v = 0	ext{ km/h}$). Sau 3 giây, mặt nạ nhị phân trên MOG2 mờ dần rồi biến mất hoàn toàn (bị nuốt vào nền). Bounding box MOG2 tắt!
  - `Giây 5.5 - 8.5 (Frame 550 - 600)`: Khung SSD màu vàng lập tức kích hoạt: `SSD SCANNING (R <= 160px)`. Khi xe cài số lùi và nhích bánh $10	ext{cm}$, khung SSD lập tức bắt dính hình ảnh mẫu xe, tái kích hoạt nhãn: `REACQUIRED: ID #14 (SSD Match: 0.08 < 0.15)`. ID không hề bị thay đổi!
- **Các lớp đồ họa trực quan (Visual Annotations & HUD):**
  - Khung xe chuyển trạng thái: Xanh lá (`ACTIVE`) $	o$ Vàng nét đứt (`SSD TRACKING`) $	o$ Xanh lá (`REACQUIRED`).
  - HUD thông số: `MOG2 DETECT: LOST | SSD SCANNER: ACTIVE (R=160px) | SAVED INSTANCES: 1,714`.
- **Điểm mấu chốt chỉ cho Hội đồng xem:**
  - *"Xin Hội đồng quan sát tại giây thứ 5: Khi xe dừng lại, nếu chỉ dùng thuật toán trừ nền thông thường, chiếc xe đã bị biến mất. Cơ chế SSD Template Reacquire của TechGAR đã giữ chặt danh tính xe và phục hồi chuẩn xác ngay khi xe lăn bánh trở lại."*
- **Kịch bản nói (Speaker Cue):**
  - Giây 1: *"MOG2 và FrameDiff kép nhận diện xe nhanh chóng chỉ mất 14ms CPU."*
  - Giây 3: *"Khi xe dừng chờ lùi, thuật toán nền tĩnh bắt đầu nuốt xe vào mặt sàn."*
  - Giây 6: *"SSD Template Reacquire lập tức kích hoạt, bảo toàn danh tính ID 14 mượt mà."*

---

## SLIDE 07: CƠ CHẾ CROSS-CAMERA OVERLAP & CANONICAL GLOBAL ID

### 1. Thông tin định danh Slide
- **Tiêu đề:** Cơ Chế Cross-Camera: Đa Quan Sát Song Song & Canonical Global ID
- **Tiêu đề phụ:** Phá bỏ tư duy sơ đồ tuần tự: Đồng nhất danh tính trong vùng chồng lấn bằng Canonical Global ID
- **Phân đoạn:** LIÊN KẾT ĐA CAMERA (CROSS-CAMERA TRACKING)
- **Thông điệp cốt lõi:** *"Chuyển giao camera không phải là cuộc chạy tiếp sức tuần tự rủi ro, mà là sự đồng thuận kiểm chứng đồng thời của cả 2 camera để quy về một Canonical Global ID duy nhất."*

### 2. Nội dung thuyết trình học thuật
1. **Bác bỏ triệt để mô hình chuyển giao tuần tự cổ điển:**
   - Các nghiên cứu cũ thường giả định sơ đồ tuần tự: $	ext{Cam 1} 	o 	ext{Vùng mù} 	o 	ext{Cam 2}$. Sơ đồ này cực kỳ mong manh vì nếu mất dấu ở vùng mù, việc tìm lại xe ở Cam 2 mang tính may rủi rất cao.
   - Trong thực tế thiết kế của TechGAR: Hai camera được bố trí có **vùng chồng lấn quan sát đồng thời (Overlap Zone)**. Tại đây, cả 2 camera cùng nhìn thấy một chiếc xe tại cùng một thời điểm.
2. **Không gian tên độc lập & Sự đồng thuận danh tính:**
   - Camera 1 định danh xe là `L1#7` (Local ID của Cam 1).
   - Camera 2 định danh xe là `L2#12` (Local ID của Cam 2).
   - Hàm `_match_simultaneous_overlap()` đối chiếu tọa độ chân bánh xe chiếu về sàn chung $S_{	ext{shared}}$ và quy về một huy hiệu duy nhất: **`Canonical Global ID: G#1`**.
3. **Các chốt chặn bảo vệ danh tính:**
   - **Canonical Alias Map:** Lưu trữ bảng ánh xạ vĩnh viễn (`alias[L1#7] = G#1`, `alias[L2#12] = G#1`).
   - **Merge Guard:** Ngăn chặn race condition khi cả 2 camera cùng gửi bản tin cập nhật vị trí lên máy chủ trong cùng $5	ext{ms}$.
   - **Dormant Re-ID Memory:** Lưu bộ nhớ quỹ đạo trong bán kính $35	ext{cm}$ để chống phân mảnh khi xe bị rung lắc tín hiệu.
   - **Quy tắc bất biến:** Web Dashboard và cơ sở dữ liệu chỉ tiêu thụ Canonical ID; tuyệt đối không bao giờ sinh xe ma (ghost vehicle).

### 3. Mô tả Video Demo chi tiết cho Slide 07 (VIDEO CỐT LÕI CỦA BÀI BÁO CÁO)
- **Tên file video hiện có:** **`demo_overlap_split.mp4`** (Có sẵn trong `slides_assets`, dung lượng $1.77	ext{ MB}$).
- **Thông số kỹ thuật video:** 118 frames, tốc độ 25 FPS, thời lượng $4.72	ext{ giây}$, định dạng MP4 H.264 widescreen.
- **Bố cục khung hình:** Màn hình ghép đôi song song (Split Screen):
  - Bên trái ($50\%$): Luồng `Cam 1 (Góc nhìn từ cửa hầm)`
  - Bên phải ($50\%$): Luồng `Cam 2 (Góc nhìn từ bãi đỗ)`
  - Ranh giới giữa 2 màn hình có dải màu tím dạ quang thể hiện hành lang chuyển giao Overlap Corridor.
- **Diễn biến chi tiết theo dòng thời gian từng frame:**
  - `Giây 0.0 - 1.2 (Frame 0 - 30)`: Chiếc xe màu đỏ di chuyển trong trường nhìn của Cam 1. Bounding box mang nhãn `L1#7 [Canonical G#1]`. Bên góc Cam 2, mũi xe vừa chạm vào vạch kẻ vàng ranh giới overlap.
  - `Giây 1.2 - 3.2 (Frame 31 - 80)`: **THỜI KHẮC CHUYỂN GIAO ĐỒNG THỜI QUAN TRỌNG NHẤT**. Chiếc xe nằm trọn vẹn trong tầm nhìn của CẢ HAI CAMERA.
    - Ở Cam 1: Xe hiển thị bounding box xanh lá với nhãn `L1#7 -> G#1`.
    - Ở Cam 2: Xe hiển thị bounding box xanh dương với nhãn `L2#12 -> G#1`.
    - Giữa 2 màn hình, dòng chữ trạng thái chớp sáng màu xanh lục: `SIMULTANEOUS OVERLAP MATCH CONFIRMED: CANONICAL G#1`.
  - `Giây 3.2 - 4.7 (Frame 81 - 118)`: Chiếc xe rời hẳn khỏi góc nhìn Cam 1 và tiến sâu vào khu vực của Cam 2. Cam 1 đóng dấu `TRACK CLOSED`, Cam 2 tiếp tục bám xe với nhãn duy nhất `G#1`. Số đếm xe toàn bãi giữ vững chính xác bằng 1.
- **Các lớp đồ họa trực quan (Visual Annotations & HUD):**
  - Hai vạch vàng ranh giới Overlap trên sàn sáng rực khi xe đi qua.
  - Mũi tên vector quỹ đạo màu xanh cyan vẽ đường đi liền mạch từ Cam 1 xuyên suốt sang Cam 2.
  - Đồng hồ đếm xe toàn bãi ở góc trên: `TOTAL ACTIVE VEHICLES: 1 (NO GHOST VEHICLE)`.
- **Điểm mấu chốt chỉ cho Hội đồng xem:**
  - *"Kính thưa Hội đồng, đây chính là đoạn video chứng minh bản quyền giải thuật của đề tài: Tại giây 2.5, cả hai camera cùng nhìn thấy xe. Thay vì sinh ra 2 xe ảo, hệ thống nhận diện đây là cùng một đối tượng vật lý và gán nhãn Canonical G#1 đồng nhất trên cả 2 màn hình!"*
- **Kịch bản nói (Speaker Cue):**
  - Giây 0: *"Xe đang ở Cam 1 với nhãn cục bộ L1#7."*
  - Giây 2: *"Khi vào vùng Overlap, cả 2 camera cùng quan sát đồng thời và đồng thuận mã Canonical G#1."*
  - Giây 4: *"Xe chuyển hẳn sang Cam 2 mà không hề bị nhảy ID hay nhân bản xe ma."*

---

## SLIDE 08: TRỰC QUAN HÓA HANDOFF TRÊN BẢN ĐỒ & CỬA CỔNG KHÓA TOPOLOGY

### 1. Thông tin định danh Slide
- **Tiêu đề:** Trực Quan Hóa Handoff Trên Bản Đồ & Cửa Cổng Khóa Topology
- **Tiêu đề phụ:** Khóa hành lang di chuyển bằng cổng hình học không gian, triệt tiêu 100% lỗi ghép nhầm xe ở xa
- **Phân đoạn:** ĐIỀU PHỐI KHÔNG GIAN (SPATIAL COORDINATION)
- **Thông điệp cốt lõi:** *"Không so khớp tự do toàn cảnh; chỉ mở hồ sơ bàn giao khi xe chạm đúng cổng Topology biên, giảm 65% tải tính toán CPU và ngăn ngừa triệt để lỗi ghép nhầm."*

### 2. Nội dung thuyết trình học thuật
1. **Hiểm họa của việc so khớp tự do toàn cảnh (Free Unconstrained Matching):**
   - Nếu liên tục so khớp mọi đối tượng ở Cam 1 với mọi đối tượng ở Cam 2 trên toàn bộ bãi xe, hệ thống sẽ:
     - Lãng phí tài nguyên CPU vô ích.
     - Dễ dàng ghép nhầm một chiếc xe cùng màu trắng đang đỗ ở góc xa của Cam 2 với chiếc xe vừa vào ở Cam 1.
2. **Cơ chế Cửa cổng cứng Topology (Hard Topology Gate):**
   - Hệ thống định nghĩa các vùng cổng kết nối logic (Topology Gate) giữa các camera lân cận dựa trên hướng luồng giao thông một chiều của hầm.
   - Chỉ các xe xuất hiện đúng hành lang ranh giới kết nối ($	ext{Cam 1 Phải} \leftrightarrow 	ext{Cam 2 Trái}$) mới được đưa vào danh sách ứng viên (candidate). Mọi xe ở vị trí khác bị khóa ngay lập tức: `LOCKED: Topology Breach`.
3. **Diễn tiến thực tế trên Session 2808_3:**
   - **Khung hình 283 (`handoff_opened`):** Xe chạm vạch biên Cam 1 $	o$ Phát tín hiệu mở hồ sơ chờ chuyển giao `[HANDOFF OPENED: G#1 -> CAM2]`.
   - **Khung hình 336 (`handoff_matched`):** Xe chạm vùng đón của Cam 2 $	o$ Đối soát thành công, đóng hồ sơ bàn giao, giữ nguyên mã GID.
   - Giảm **$65\%$ tải tính toán CPU** và triệt tiêu $100\%$ lỗi ghép nhầm xe ở xa.

### 3. Mô tả Video Demo chi tiết cho Slide 08
- **Tên file video đề xuất:** `demo_slide08_topology_handoff_map.mp4`
- **Nguồn dữ liệu:** Cắt từ `predictions.jsonl` và video debug từ frame 270 đến frame 350.
- **Thời lượng khuyến nghị:** 8.0 giây (200 frames @ 25 FPS).
- **Bố cục khung hình:** Màn hình kết hợp:
  - Nửa trên ($50\%$): Hai góc nhìn camera với vạch cổng Topology màu vàng.
  - Nửa dưới ($50\%$): Bản đồ mặt bằng dùng chung (Shared Map 2D) hiển thị Đồ thị hành lang di chuyển (Lane Graph).
- **Diễn biến chi tiết theo dòng thời gian:**
  - `Giây 0.0 - 2.5 (Frame 270 - 282)`: Xe đang di chuyển trong hành lang Cam 1. Trên bản đồ 2D, chấm xanh di chuyển dọc theo cạnh đồ thị $E_1$. Vạch cổng Topology đang ở trạng thái ngủ (màu xám).
  - `Giây 2.5 - 4.5 (Frame 283 - 310)`: **ĐIỂM KÍCH HOẠT FRAME 283**. Đầu xe chạm vào vạch biên Cam 1. Vạch cổng Topology bừng sáng màu vàng rực rỡ! Một khung thông báo hiện lên trên bản đồ: `[EVENT: HANDOFF_OPENED | G#1 -> CAM2]`. Đồng hồ đếm ngược chờ tiếp nhận ($1.5	ext{s}$) bắt đầu chạy.
  - `Giây 4.5 - 8.0 (Frame 311 - 350)`: **ĐIỂM KHÓA FRAME 336**. Xe vừa chạm vào vùng đón của Cam 2. Cổng chuyển sang màu xanh lục đậm: `[EVENT: HANDOFF_MATCHED | 53 FRAMES TRANSITION]`. Hồ sơ bàn giao đóng lại an toàn, chấm xanh tiếp tục lướt trên cạnh đồ thị $E_2$.
- **Các lớp đồ họa trực quan (Visual Annotations & HUD):**
  - Cổng Topology: Vạch vàng dạ quang đổi sang Xanh lục khi hoàn tất.
  - Nhãn hồ sơ bàn giao nhấp nháy: `PENDING HANDOFF: GID #1 (TTL: 1.5s)`.
  - Một chiếc xe giả định ở góc xa bị gắn nhãn đỏ gạch chéo: `REJECTED: TOPOLOGY BREACH`.
- **Điểm mấu chốt chỉ cho Hội đồng xem:**
  - *"Xin Hội đồng hãy nhìn vào Frame 283 và Frame 336: Hệ thống mở và đóng hồ sơ bàn giao một cách chủ động theo đúng hình học hành lang di chuyển, loại bỏ hoàn toàn việc tìm kiếm mò mẫm trên toàn bãi."*
- **Kịch bản nói (Speaker Cue):**
  - Giây 1: *"Xe di chuyển theo đồ thị luồng đường quy định."*
  - Giây 3: *"Tại Frame 283, xe chạm cổng, hệ thống phát lệnh mở hồ sơ chuyển giao."*
  - Giây 6: *"Đến Frame 336, Cam 2 đón xe thành công, hoàn tất quá trình chỉ sau 53 frames."*

---

## SLIDE 09: BẢN CHẤT MA TRẬN CHI PHÍ 4 CHIỀU & GÓC HƯỚNG COSINE

### 1. Thông tin định danh Slide
- **Tiêu đề:** Bản Chất Ma Trận Chi Phí 4 Chiều & Khái Niệm Góc Hướng Cosine
- **Tiêu đề phụ:** Phân tích chi tiết công thức toán học tính chi phí ghép cặp và cơ chế loại trừ xe đi ngược chiều bằng Cosine
- **Phân đoạn:** MÔ HÌNH TOÁN HỌC & TỐI ƯU HÓA
- **Thông điệp cốt lõi:** *"Đa biến hóa trọng số ($55\%$ vị trí, $30\%$ màu, $10\%$ kích thước, $5\%$ hướng) kết hợp bộ lọc cứng Cosine $\cos(	heta) < 0.25$ loại bỏ $100\%$ lỗi ghép nhầm hai xe ngược chiều."*

### 2. Nội dung thuyết trình học thuật
1. **Công thức Ma trận chi phí 4 thành phần (Cost Matrix Formulation):**
   $$C_{	ext{total}} = 0.55 \cdot D_{	ext{ground}} + 0.30 \cdot D_{	ext{color}} + 0.10 \cdot D_{	ext{scale}} + 0.05 \cdot D_{	ext{heading}}$$
   - **Khoảng cách mặt sàn ($55\%$):** Chiếm ưu thế lớn nhất vì quỹ đạo vật lý của xe là liên tục trong không gian thực. (Nếu đẩy lên $80\%$, hai xe đi song song gần nhau sẽ bị tráo ID).
   - **Đặc trưng màu sắc ($30\%$):** Phân tích histogram trong không gian màu HSV/LAB để phân biệt xe khác màu. (Nếu đẩy lên $70\%$, hai xe cùng màu trắng/đen sẽ bị gộp nhầm).
   - **Kích thước footprint ($10\%$):** Đảm bảo tính nhất quán về diện tích tiếp xúc bánh xe (tránh nhầm xe sedan 4 chỗ với SUV 7 chỗ).
   - **Độ lệch hướng chuyển động ($5\%$):** Kiểm tra tính thuận chiều di chuyển.
2. **Bộ lọc cổng hướng cứng (Cosine Heading Gate):**
   - Tính tích vô hướng giữa vector vận tốc của vết cũ $ec{v}_1$ và ứng viên mới $ec{v}_2$:
     $$\cos(	heta) = rac{ec{v}_1 \cdot ec{v}_2}{\|ec{v}_1\| \|ec{v}_2\|}$$
   - **Quy tắc loại trừ tuyệt đối:**
     $$	ext{Nếu } \cos(	heta) < 0.25 \quad (	ext{tương đương góc lệch } 	heta > 75.5^\circ) \implies \mathbf{REJECT 	ext{ (Loại bỏ ngay lập tức!)}}$$
   - **Ý nghĩa thực tiễn:** Trong hành lang bãi đỗ hẹp, hai xe đi đối đầu nhau có khoảng cách mặt sàn rất gần. Nếu chỉ dựa vào khoảng cách Euclidean, hệ thống sẽ ghép nhầm ID của 2 xe này. Bộ lọc Cosine loại bỏ $100\%$ sai số đối đầu ngược chiều.

### 3. Mô tả Video Demo chi tiết cho Slide 09
- **Tên file video đề xuất:** `demo_slide09_cosine_heading_gate.mp4`
- **Nguồn dữ liệu:** Video mô phỏng toán học dựng trên dữ liệu thực tế: Hai xe đi ngược chiều nhau trong hành lang hẹp.
- **Thời lượng khuyến nghị:** 7.5 giây (187 frames @ 25 FPS).
- **Bố cục khung hình:** Màn hình chia đôi:
  - Bên trái ($50\%$): Video thực tế hiển thị hai xe (Xe Đỏ đi xuôi, Xe Trắng đi ngược chiều) với 2 mũi tên vector vận tốc $ec{v}_1$ và $ec{v}_2$.
  - Bên phải ($50\%$): Bảng radar vector toán học và công thức tính chi phí nhảy số theo thời gian thực.
- **Diễn biến chi tiết theo dòng thời gian:**
  - `Giây 0.0 - 3.0`: Xe Đỏ đang đi tới với vector $ec{v}_1$ hướng về phía trước ($0^\circ$). Một ứng viên Xe Trắng đi từ chiều ngược lại tiến vào vùng quét với vector $ec{v}_2$ ($180^\circ$).
  - `Giây 3.0 - 5.0`: Hai xe đi ngang qua nhau ở khoảng cách mặt sàn cực gần (chỉ cách nhau $40	ext{cm}$). Bảng bên phải hiển thị khoảng cách $D_{	ext{ground}} = 0.12$ (rất nhỏ, nguy cơ ghép nhầm cực cao nếu chỉ dùng khoảng cách).
  - `Giây 5.0 - 7.5`: Phép tính Cosine kích hoạt: $\cos(180^\circ) = -1.0 < 0.25$. Màn hình nhấp nháy cảnh báo đỏ: `[COSINE GATE TRIGGERED: cos(theta) = -0.98 < 0.25]`. Dấu gạch chéo đỏ `REJECTED: COUNTER-FLOW VEHICLE` đè lên ứng viên xe trắng, giữ nguyên vẹn ID xe đỏ!
- **Các lớp đồ họa trực quan (Visual Annotations & HUD):**
  - Mũi tên vector vận tốc màu xanh lá cho xe đi đúng chiều, màu đỏ cho xe ngược chiều.
  - Vòng cung đo góc lệch $	heta = 172^\circ$ nhấp nháy màu đỏ.
  - Bảng chi phí hiển thị công thức với thanh trượt giá trị: `Cost = 0.55*(0.12) + ... = OVERRULED BY COSINE GATE`.
- **Điểm mấu chốt chỉ cho Hội đồng xem:**
  - *"Xin Hội đồng lưu ý ở giây thứ 4: Khoảng cách giữa 2 xe chỉ là 40cm. Nếu dùng các thuật toán thông thường, hai xe này chắc chắn bị tráo đổi ID cho nhau. Nhưng nhờ chốt chặn Cosine Heading Gate, chiếc xe ngược chiều bị loại bỏ ngay tức khắc."*
- **Kịch bản nói (Speaker Cue):**
  - Giây 1: *"Ma trận chi phí kết hợp 4 đại lượng vật lý độc lập."*
  - Giây 3: *"Khi 2 xe lướt qua nhau trong cự ly gần, khoảng cách sàn không còn đủ an toàn."*
  - Giây 6: *"Bộ lọc Cosine lập tức nhận diện góc ngược chiều 180 độ và từ chối ghép cặp tuyệt đối."*

---

## SLIDE 10: NHẬN DIỆN Ô ĐỖ: CỤM 9 BIẾN THỂ ADAPTIVE EQUALIZER & MAJORITY VOTE

### 1. Thông tin định danh Slide
- **Tiêu đề:** Nhận Diện Ô Đỗ: Cụm 9 Biến Thể Adaptive Equalizer & Majority Vote
- **Tiêu đề phụ:** Ẩn dụ Equalizer âm thanh: Triệt tiêu chênh sáng, lóa đèn pha và bóng râm bằng lưới 9 biến thể quang học
- **Phân đoạn:** THỊ GIÁC Ô ĐỖ (PARKING SLOT VISION)
- **Thông điệp cốt lõi:** *"Không tìm kiếm một ngưỡng ma thuật duy nhất; biến việc phân loại ô đỗ thành một hội đồng biểu quyết đa số $\ge 5/9$ của 9 biến thể quang học, triệt tiêu $100\%$ báo động giả do đèn pha."*

### 2. Nội dung thuyết trình học thuật
1. **Thách thức quang học khắc nghiệt tại các ô đỗ:**
   - Đèn pha xe rọi thẳng vào ô trống tạo đốm trắng lóa chói chang.
   - Trụ bê tông tạo bóng râm đen đặc che mất vạch sơn.
   - Sàn tầng hầm ẩm ướt phản chiếu ánh sáng tuýp tạo ảo ảnh phản xạ.
   - Mọi giải pháp sử dụng một ngưỡng nhị phân cố định (Fixed Threshold) đều thất bại: hoặc báo động giả liên tục (False Positive) hoặc không nhận diện được xe đỗ (False Negative).
2. **Ẩn dụ bàn Mixer âm thanh (Adaptive Equalizer Metaphor):**
   - Tương tự như kỹ sư âm thanh chia dải tần để cân chỉnh bass/treble, TechGAR chia phổ quang học của từng ô đỗ thành lưới các biến thể tiền xử lý song song trên CPU.
   - Ban đầu thử nghiệm $2 	imes 2 	imes 1 	imes 5 = 25$ biến thể (tốn $65	ext{ms}$/ô) $	o$ Tối ưu hóa về **lưới $3 	imes 3 = 9$ biến thể** $	ext{Gamma} 	imes 	ext{CLAHE}$ ($< 8	ext{ms}$ trên CPU).
   - **Tổ hợp 9 biến thể:**
     - Gamma $\in \{0.65, 1.0, 1.4\}$ (Kéo sáng vùng tối / Chuẩn / Nén lóa sáng).
     - CLAHE Clip Limit $\in \{1.5, 2.5, 4.0\}$ (Tăng cường độ tương phản cục bộ vạch sơn).
3. **Cơ sở toán học của ngưỡng biểu quyết đa số $\ge 5/9$ (Majority Vote):**
   $$	ext{Trạng thái ô} = 	ext{OCCUPIED} \iff \sum_{i=1}^{9} V_i \ge 5 \quad (V_i \in \{0, 1\})$$
   - **Trường hợp đèn pha xe chói quét qua:** Chỉ kích hoạt được $1 - 3$ biến thể nhạy sáng cao ($V \le 3 < 5$) $	o$ **Loại bỏ $100\%$, không bao giờ báo nhầm ô có xe!**
   - **Trường hợp xe thật đỗ trong ô:** Hình khối kim loại và che khuất vạch sơn kích hoạt $\ge 6$ biến thể ($V \ge 6 \ge 5$) $	o$ **Xác nhận ô có xe ổn định tuyệt đối.**

### 3. Mô tả Video Demo chi tiết cho Slide 10
- **Tên file video đề xuất:** `demo_slide10_adaptive_equalizer_9variants.mp4`
- **Nguồn dữ liệu:** Dựng từ quá trình xử lý của module `adaptive_equalizer.py` trên ô đỗ P056 lúc xe rọi đèn pha.
- **Thời lượng khuyến nghị:** 8.0 giây (200 frames @ 25 FPS).
- **Bố cục khung hình:** Màn hình ma trận $3 	imes 3$ (Lưới 9 ô):
  - 9 ô nhỏ hiển thị 9 biến thể xử lý hình ảnh của cùng một ô đỗ P056 (từ tối sẫm đến sáng nén lóa).
  - Góc phải bên dưới: Thanh biểu quyết đồng thuận `VOTE COUNTER: X / 9` và trạng thái ô đỗ cuối cùng.
- **Diễn biến chi tiết theo dòng thời gian:**
  - `Giây 0.0 - 2.5`: Ô đỗ P056 đang trống. Cả 9 biến thể đều nhận diện rõ vạch sơn trắng trên nền xám $	o$ Số phiếu có xe: $0 / 9$ $	o$ Trạng thái: `VACANT (Xanh lá)`.
  - `Giây 2.5 - 5.0`: Chiếc xe đi ngang qua rọi đèn pha cực mạnh quét thẳng vào ô đỗ. 2 biến thể nhạy sáng bị lóa trắng xóa và tưởng nhầm là có xe ($V_1 = 1, V_2 = 1$). Tuy nhiên, 7 biến thể còn lại (nhờ nén Gamma 1.4 và CLAHE 4.0) đã triệt tiêu ánh lóa và vẫn nhìn rõ mặt sàn trống! $	o$ Số phiếu: $2 / 9 < 5$ $	o$ Trạng thái: **GIỮ VỮNG VACANT (Lọc nhiễu thành công!)**.
  - `Giây 5.0 - 8.0`: Xe lùi hẳn thân xe vào ô đỗ. Thân xe che khuất toàn bộ mặt sàn trên cả 9 biến thể $	o$ Số phiếu nhảy vọt: $9 / 9 \ge 5$ $	o$ Trạng thái chuyển vững chắc sang: `OCCUPIED (Đỏ)`.
- **Các lớp đồ họa trực quan (Visual Annotations & HUD):**
  - Đồng hồ biểu quyết hình bán nguyệt: Kim đồng hồ nhảy từ số 0 $	o$ số 2 (Vạch an toàn vàng) $	o$ số 9 (Vạch đỏ xác nhận).
  - Dòng chữ thông báo tại thời điểm lóa đèn: `HEADLIGHT GLARE FILTERED OUT (Vote: 2/9 < Threshold 5)`.
- **Điểm mấu chốt chỉ cho Hội đồng xem:**
  - *"Xin Hội đồng hãy nhìn vào giây thứ 3.5: Khi đèn pha rọi sáng rực ô đỗ, nếu dùng ngưỡng nhị phân thông thường, hệ thống sẽ báo ngay ô có xe (báo động giả). Nhưng với cơ chế biểu quyết 9 biến thể, chỉ có 2 phiếu đồng ý, hệ thống bình thản loại bỏ ánh sáng lóa!"*
- **Kịch bản nói (Speaker Cue):**
  - Giây 1: *"Lưới 9 biến thể hoạt động song song như một bàn mixer quang học."*
  - Giây 3: *"Đèn pha quét qua chỉ đánh lừa được 2 biến thể, không vượt qua ngưỡng đa số 5/9."*
  - Giây 6: *"Khi xe thật lùi vào, sự đồng thuận 9/9 kích hoạt trạng thái đỗ xe vững chắc."*

---

## SLIDE 11: GHÉP XE VÀO Ô ĐỖ: SLOTVEHICLEBINDER & VÒNG ĐỜI RỜI Ô

### 1. Thông tin định danh Slide
- **Tiêu đề:** Ghép Xe Vào Ô Đỗ: SlotVehicleBinder & Quản Lý Vòng Đời Rời Ô
- **Tiêu đề phụ:** Tính toán giao cắt đa giác chính xác, giao thức Arrival Claim 3 mẫu và Departure Token 5s chống cướp ô
- **Phân đoạn:** RÀNG BUỘC NGHIỆP VỤ (BUSINESS BINDING LOGIC)
- **Thông điệp cốt lõi:** *"Tính diện tích giao cắt đa giác thực tế $S = 0.70 O_v + 0.20 O_s + 0.10 C_{	ext{center}}$; Departure Token 5.0s bảo vệ độc quyền ô đỗ, chống xe lạ cướp ô và tái hấp thu xe chỉnh lái."*

### 2. Nội dung thuyết trình học thuật
1. **Giao cắt đa giác lồi chính xác (`cv2.intersectConvexConvex`):**
   - Bác bỏ việc dùng bounding box chữ nhật thô (sẽ tính diện tích thừa ra ngoài vạch sơn ô đỗ).
   - TechGAR tính diện tích giao cắt hình học thực tế $A_{\cap}$ giữa đa giác footprint xe và đa giác vạch sơn ô đỗ:
     $$O_v = rac{A_{\cap}}{A_{	ext{vehicle}}}, \quad O_s = rac{A_{\cap}}{A_{	ext{slot}}}, \quad 	ext{Score} = 0.70 \cdot O_v + 0.20 \cdot O_s + 0.10 \cdot C_{	ext{center}}$$
2. **Giao thức Nhận ô (Arrival Claim Protocol):**
   - **Chống xe đi ngang qua hành lang:** Yêu cầu tối thiểu $3$ mẫu liên tiếp ($3$ frame) có $	ext{Score} \ge 0.45$.
   - **Xác nhận thị giác kép (Dual Vision Confirm):** Phải có ít nhất 2 lần xác nhận từ module Equalizer trong cửa sổ thời gian $3.0	ext{ giây}$.
   - **Lost Commit Delay ($0.35	ext{s}$):** Ngăn chặn việc hủy trạng thái ô khi xe bị người đi bộ che khuất thoáng qua.
3. **Giao thức Rời ô có bảo vệ (Departure Token 5.0 Giây):**
   - Khi xe bắt đầu lăn bánh rời ô, ô đỗ không chuyển ngay về `VACANT`, mà chuyển sang trạng thái trung gian `DEPARTURE_PENDING` kèm một chiếc vé bảo vệ: **`Departure Token (TTL = 5.0s)`**.
   - **Chống cướp ô đỗ (Anti-hijacking):** Trong 5 giây này, ô đỗ chỉ được cấp độc quyền cho ID vừa rời đi; từ chối tuyệt đối mọi yêu cầu nhận ô của các xe lạ đi ngang qua.
   - **Tái hấp thu xe chỉnh lái (Re-absorption):** Nếu tài xế chỉ tiến ra để sửa lái rồi lùi lại $	o$ Tái hấp thu ngay lập tức đúng ID cũ, không tạo xe mới!
   - **Giải phóng nguyên tử (Atomic Release):** Chỉ trả ô về `VACANT` khi xe đã ra hẳn ngoài hành lang $> 0.5	ext{s}$ hoặc token hết hạn 5.0 giây.

### 3. Mô tả Video Demo chi tiết cho Slide 11
- **Tên file video đề xuất:** `demo_slide11_slot_binder_departure_token.mp4`
- **Nguồn dữ liệu:** Cắt từ `debug_cam2.mp4` trong khoảng frame 530 đến 720 (quá trình xe đỗ hẳn vào ô P056 rồi nổ máy rời đi).
- **Thời lượng khuyến nghị:** 9.0 giây (225 frames @ 25 FPS).
- **Bố cục khung hình:** Màn hình chính hiển thị khu vực ô đỗ P056 với các đa giác giao cắt tô màu mờ và bảng đồng hồ đếm lùi Token ở góc trên.
- **Diễn biến chi tiết theo dòng thời gian:**
  - `Giây 0.0 - 3.0 (Frame 530 - 580)`: Xe lùi vào ô P056. Đa giác xe và đa giác ô giao nhau, vùng giao cắt tô màu xanh dạ quang. Điểm số $	ext{Score}$ tăng dần từ $0.25 	o 0.55 	o 0.78$. Sau 3 mẫu liên tiếp, nhãn chuyển bừng sáng: `PARKED CONFIRMED: G#1 -> P056`.
  - `Giây 3.0 - 5.5 (Frame 580 - 640)`: Xe đỗ yên tĩnh. Một người bảo vệ đi bộ ngang qua che khuất đuôi xe trong $0.3	ext{s}$. Nhờ cơ chế Lost Commit Delay ($0.35	ext{s}$), trạng thái ô vẫn giữ vững màu xanh, không hề bị chớp tắt!
  - `Giây 5.5 - 9.0 (Frame 640 - 720)`: Xe nổ máy tiến ra khỏi ô. Ngay khi mũi xe rời vạch, ô đỗ chuyển sang màu cam kèm vòng xoay đếm lùi: `DEPARTURE TOKEN ACTIVE: 5.0s -> 4.0s -> 3.0s`. Một chiếc xe khác chạy lướt ngang qua cửa ô bị nhãn từ chối: `ACCESS DENIED: RESERVED BY TOKEN`. Khi hết 5 giây, ô đỗ chuyển về màu xanh lá nhạt: `ATOMIC RELEASE -> VACANT`.
- **Các lớp đồ họa trực quan (Visual Annotations & HUD):**
  - Đa giác giao cắt diện tích $A_{\cap}$ hiển thị số đo phần trăm: `Overlap: 78.4%`.
  - Đồng hồ đếm lùi thời gian bảo vệ Token: Vòng tròn màu cam đếm lùi từ `5.0s` về `0.0s`.
  - Thông báo cướp ô bị chặn: `HIJACK ATTEMPT BLOCKED BY DEPARTURE TOKEN`.
- **Điểm mấu chốt chỉ cho Hội đồng xem:**
  - *"Kính thưa Hội đồng, điểm tinh tế nhất của nghiệp vụ bãi đỗ nằm ở giây thứ 7: Khi chiếc xe vừa nhích ra, một xe khác đi ngang qua đã không thể 'cướp' mất ô đỗ này nhờ Departure Token 5 giây. Cơ chế này phản ánh đúng hành vi người lái xe thường phải nhích tới nhích lui để căn chỉnh tay lái."*
- **Kịch bản nói (Speaker Cue):**
  - Giây 1: *"Tính giao cắt đa giác chính xác thay vì bounding box hộp chữ nhật thô."*
  - Giây 3: *"Arrival Claim yêu cầu 3 mẫu liên tiếp để chống việc xe chỉ vô tình đi ngang qua."*
  - Giây 7: *"Departure Token 5 giây bảo vệ độc quyền ô đỗ, chống cướp ô và tái hấp thu xe chỉnh lái."*

---

## SLIDE 12: ĐÁNH GIÁ THỰC NGHIỆM CHUYÊN SÂU TRÊN SESSION 2808_3

### 1. Thông tin định danh Slide
- **Tiêu đề:** Phân Tích Thực Nghiệm Chuyên Sâu Trên Dữ Liệu Video Tầng Hầm (Session 2808_3)
- **Tiêu đề phụ:** Công bố dữ liệu thực nghiệm 3.827 frame, phân tích độ dài bám vết Main GID và cam kết liêm chính học thuật
- **Phân đoạn:** ĐÁNH GIÁ THỰC NGHIỆM (EMPIRICAL BENCHMARK)
- **Thông điệp cốt lõi:** *"Dữ liệu thực tế 3.827 frame chứng minh tính ổn định dài hạn: Main GID bám liên tục 3.383 frames ($48.4\%$ thời lượng); cam kết liêm chính học thuật báo cáo trung thực 14 GID vụn làm proxy."*

### 2. Nội dung thuyết trình học thuật
1. **Thông số tập dữ liệu thực nghiệm kiểm chứng:**
   - **Tổng số khung hình xử lý:** **3.827 frames** liên tục.
   - **Thời lượng video:** **$153.08	ext{ giây}$** ($> 2.5	ext{ phút}$).
   - **Tốc độ xử lý thực tế trên CPU:** **$25.0	ext{ FPS}$** (hoàn toàn theo thời gian thực trên CPU Intel Core i5 phổ thông).
   - **Chu trình di chuyển đầy đủ:** Xe vào cổng $	o$ qua Cam 1 $	o$ vào Overlap $	o$ sang Cam 2 $	o$ lùi đỗ vào ô P056 $	o$ tắt máy $	o$ nổ máy rời ô ra khỏi bãi.
2. **Phân tích độ dài vết (Tracklet Length Distribution):**
   - **Main GID (#1):** Duy trì liên tục **3.383 frames** ($88.4\%$ tổng thời lượng video và $98.2\%$ thời lượng xe di chuyển trong bãi).
   - **14 GID vụn (Fragmented Tracklets):** Có thời lượng ngắn từ $10 - 45	ext{ frames}$, sinh ra tại các thời điểm cực hạn khi xe bị góc cột che khuất quá $80\%$ thân xe hoặc tài xế nhấp nhả ga nhiều nhịp lúc chuyển số.
3. **Cam kết liêm chính học thuật & Hiệu năng CPU:**
   - **Liêm chính học thuật:** Nhóm nghiên cứu báo cáo trung thực 14 GID vụn làm thước đo proxy để đánh giá độ phân mảnh, kiên quyết từ chối việc "bịa đặt" chỉ số MOTA $99\%$ ảo khi chưa có ground truth gán nhãn thủ công từng milimet trên toàn bộ 3.827 khung hình.
   - **Phân bổ độ trễ từng mắt xích (Latency Breakdown):**
     - Video Ingest: $12	ext{ms}$
     - Motion Tracker: $18	ext{ms}$
     - Homography & Handoff: $6	ext{ms}$
     - Equalizer & Binder: $4	ext{ms}$
     - **Tổng độ trễ xử lý mỗi frame:** **$40	ext{ms}$** ($pprox 25.0	ext{ FPS}$).
     - **Độ trễ toàn trình đầu cuối lên Web (End-to-End Latency):** **$169	ext{ ms}$** (vượt xa chuẩn công nghiệp $< 500	ext{ms}$).

### 3. Mô tả Video Demo chi tiết cho Slide 12
- **Tên file video đề xuất:** `demo_slide12_session2808_telemetry_hud.mp4`
- **Nguồn dữ liệu:** Video render từ toàn bộ Session 2808_3 kèm bảng điều khiển Telemetry HUD đồ họa chạy tua nhanh tốc độ $2	imes$.
- **Thời lượng khuyến nghị:** 10.0 giây (250 frames đại diện cho 3.827 frames @ $2	imes$ speed).
- **Bố cục khung hình:** Màn hình Dashboard phân tích chuyên sâu:
  - Góc lớn ($70\%$): Video bám vết thực tế chiếc xe chạy từ đầu đến cuối chu trình.
  - Cột phải ($30\%$): Bảng Telemetry đo đạc trực tiếp các chỉ số hệ thống: Frame Counter, Latency Graph, FPS Meter, và Active GID List.
- **Diễn biến chi tiết theo dòng thời gian:**
  - `Giây 0.0 - 3.0`: Xe vào bãi, Frame Counter chạy vùn vụt từ frame 0 đến frame 1000. Đường đồ thị FPS ổn định phẳng lỳ ở mức $25.0	ext{ FPS}$. Cột CPU load hiển thị mức tiêu thụ $38\%$ trên vi xử lý Intel Core i5.
  - `Giây 3.0 - 7.0`: Xe thực hiện Handoff và lùi vào ô P056 (Frame 1000 đến 3000). Dòng trạng thái hiển thị: `MAIN GID: #1 (ACTIVE 3,383 FRAMES)`. Khi có một mảnh vụn nhỏ xuất hiện do cột che, hệ thống hiển thị nhãn proxy: `FRAGMENT DETECTED: GID #8 (TTL: 14 frames) -> MERGED/EXPIRED`.
  - `Giây 7.0 - 10.0`: Xe rời bãi hoàn tất toàn bộ chu trình 3.827 frames. Bảng tổng kết thực nghiệm hiện lên toàn màn hình với các số liệu xanh rực rỡ: `TOTAL FRAMES: 3,827 | END-TO-END LATENCY: 169ms | SUCCESSFUL FULL CYCLE`.
- **Các lớp đồ họa trực quan (Visual Annotations & HUD):**
  - Biểu đồ nhịp tim thời gian thực (Heartbeat Latency): Dao động ổn định từ $38	ext{ms} - 42	ext{ms}$.
  - Đồng hồ đếm khung hình: `FRAME: [ 3383 / 3827 ]`.
  - Huy hiệu liêm chính học thuật: `ACADEMIC INTEGRITY: 14 PROXY FRAGMENTS HONESTLY REPORTED`.
- **Điểm mấu chốt chỉ cho Hội đồng xem:**
  - *"Thưa thầy cô, biểu đồ Telemetry bên phải ghi nhận dữ liệu thực 100% từ 3.827 khung hình. Toàn bộ chuỗi thuật toán vận hành mượt mà 25 FPS ngay trên CPU thông thường mà không cần kích hoạt GPU, và độ trễ toàn trình chỉ 169 mili-giây!"*
- **Kịch bản nói (Speaker Cue):**
  - Giây 1: *"Thực nghiệm toàn diện trên 3.827 khung hình video thực tế tầng hầm."*
  - Giây 4: *"Main GID giữ vững liên tục 3.383 frames xuyên suốt toàn bộ hành trình."*
  - Giây 8: *"Báo cáo trung thực 14 fragment proxy; tổng độ trễ 169ms đạt chuẩn thời gian thực."*

---

## SLIDE 13: PHÊ PHÁN TRUNG BÌNH CỘNG CÀO BẰNG & GIAO THỨC CỬA SỔ SỰ KIỆN

### 1. Thông tin định danh Slide
- **Tiêu đề:** Phê Phán Trung Bình Cộng Cào Bằng & Giao Thức Cửa Sổ Sự Kiện
- **Tiêu đề phụ:** Phê phán độ chính xác ảo và bảo vệ giao thức Cửa Sổ Sự Kiện (Event Window) qua 20 Session thực tế
- **Phân đoạn:** PHƯƠNG PHÁP LUẬN KIỂM TOÁN (AUDITING METHODOLOGY)
- **Thông điệp cốt lõi:** *"Cách tính trung bình cộng cào bằng trên 90% cảnh tĩnh là ngụy biện khoa học; Giao thức Cửa Sổ Sự Kiện (Event Window) kiểm toán thực chất 20 session đạt độ tin cậy 95.0%."*

### 2. Nội dung thuyết trình học thuật
1. **Phê phán sâu sắc phương pháp tính trung bình cộng cào bằng:**
   - Trong môi trường bãi đỗ xe tầng hầm thực tế, hơn **$90\%$ tổng thời lượng thời gian là cảnh tĩnh** (không có xe di chuyển, mặt sàn giữ nguyên trạng thái).
   - **Vạch trần độ chính xác ảo (The Flaw of Time-Averaged Accuracy):**
     - Nếu tính độ chính xác trung bình theo toàn bộ thời gian, một hệ thống có thuật toán Handoff bị hỏng hoàn toàn (mỗi lần xe qua camera là mất ID) vẫn có thể đạt chỉ số độ chính xác ảo **$> 98\%$** vì nó được "pha loãng" bởi hàng triệu frame cảnh tĩnh không có biến cố!
     - Đây là sự ngụy biện khoa học mà nhiều bài báo cáo thường che giấu.
2. **Giao thức Cửa Sổ Sự Kiện độc quyền (Event Window Protocol):**
   - TechGAR loại bỏ hoàn toàn các khung hình cảnh tĩnh vô nghĩa khỏi tập đánh giá.
   - Hệ thống chỉ mở cửa sổ kiểm toán tập trung vào **2 thời điểm có rủi ro xảy ra lỗi cao nhất**:
     - **Event Window A (Vùng chuyển giao Overlap):** Cửa sổ thời gian $\pm 2.0	ext{ giây}$ quanh thời điểm xe đi qua ranh giới giữa 2 camera.
     - **Event Window B (Vùng cửa ngõ ô đỗ):** Cửa sổ thời gian $\pm 3.0	ext{ giây}$ quanh thời điểm xe bắt đầu tiến/lùi vào vạch sơn ô đỗ.
3. **Kết quả kiểm toán trên 20 Session thực tế:**
   - **Kịch bản 1 (Xe đơn vào ô chuẩn):** $10 / 10$ session thành công ($100\%$).
   - **Kịch bản 2 (Xe đi ngang qua hành lang không đỗ):** $5 / 5$ session thành công ($100\%$, không báo động giả).
   - **Kịch bản 3 (Đổi hướng / Lóa đèn trong vùng overlap):** $3 / 4$ session thành công ($75\%$, 1 ca lỗi do lóa đèn pha cự ly cực gần $< 1	ext{m}$).
   - **Kịch bản 4 (Rời ô có xe khác cản luồng):** $1 / 1$ session thành công ($100\%$, Departure Token bảo vệ hoàn hảo).
   - **TỔNG KẾT KIỂM TOÁN TOÀN DIỆN:** **$19 / 20$ SESSION THÀNH CÔNG ($95.0\%$)** TRONG CÁC CỬA SỔ SỰ KIỆN NGUY HIỂM.

### 3. Mô tả Video Demo chi tiết cho Slide 13
- **Tên file video đề xuất:** `demo_slide13_event_window_audit.mp4`
- **Nguồn dữ liệu:** Tổng hợp từ 4 kịch bản kiểm toán tiêu biểu cắt từ 20 session thực tế.
- **Thời lượng khuyến nghị:** 9.0 giây (225 frames @ 25 FPS).
- **Bố cục khung hình:** Màn hình phân tích kiểm toán 4 góc (2x2 Quad Grid):
  - Ô 1 (Trên trái): `Kịch bản 1: Đỗ chuẩn (10/10 PASS)`
  - Ô 2 (Trên phải): `Kịch bản 2: Đi ngang không đỗ (5/5 PASS)`
  - Ô 3 (Dưới trái): `Kịch bản 3: Lóa đèn chuyển làn (3/4 PASS - Phân tích ca lỗi)`
  - Ô 4 (Dưới phải): `Kịch bản 4: Cản luồng rời ô (1/1 PASS)`
- **Diễn biến chi tiết theo dòng thời gian:**
  - `Giây 0.0 - 3.0`: Các dải màu tím dạ quang của Event Window A và B sáng lên khi xe đi vào vùng nguy hiểm trên cả 4 ô. Đồng hồ kiểm toán góc màn hình hiển thị: `AUDIT ACTIVE: 2.0s WINDOW`.
  - `Giây 3.0 - 6.0`: Ô 1, 2, 4 đồng loạt hiện dấu tích xanh lá: `VERIFIED PASS`. Riêng Ô 3 (dưới trái), tại thời điểm đèn pha rọi sát sạt $< 1	ext{m}$, ID bị khựng lại $0.4	ext{s}$ trước khi bắt lại; hệ thống đánh dấu cờ vàng: `PARTIAL RECOVERY (STRESS TEST CASE)`.
  - `Giây 6.0 - 9.0`: Bảng tổng kết xuất hiện ở trung tâm: `20 SESSIONS AUDIT: 19 PASS (95.0%) | STATIC TIME BIAS REMOVED`.
- **Các lớp đồ họa trực quan (Visual Annotations & HUD):**
  - Khung viền nhấp nháy tím khi xe bước vào Cửa Sổ Sự Kiện: `EVENT WINDOW ACTIVE (+/- 2.0s)`.
  - Dấu tích xanh lục to bản `PASS` trên các kịch bản thành công.
  - Phân tích ca lỗi tại Ô 3 với mũi tên chỉ điểm lóa đèn: `DISTANCE < 1m GLARE SATURATION`.
- **Điểm mấu chốt chỉ cho Hội đồng xem:**
  - *"Kính thưa Hội đồng, con số 95.0% này có giá trị học thuật cao hơn rất nhiều con số 99% cào bằng. Chúng tôi dũng cảm phơi bày hệ thống dưới những điều kiện khắc nghiệt nhất trong cửa sổ sự kiện để chứng minh độ tin cậy thực chất của đề tài."*
- **Kịch bản nói (Speaker Cue):**
  - Giây 1: *"Cảnh tĩnh chiếm 90% tầng hầm tạo ra độ chính xác ảo nếu tính trung bình."*
  - Giây 3: *"Giao thức Cửa Sổ Sự Kiện chỉ soi xét vào thời điểm nhạy cảm nhất quanh vạch chuyển giao và cửa ô."*
  - Giây 7: *"Đạt 19/20 session thành công (95.0%), minh chứng năng lực xử lý tình huống thực tế."*

---

## SLIDE 14: ABLATION STUDY: ĐỊNH LƯỢNG ĐÓNG GÓP CỦA TỪNG MODULE LÕI

### 1. Thông tin định danh Slide
- **Tiêu đề:** Ablation Study: Định Lượng Đóng Góp Của Từng Thành Phần Lõi
- **Tiêu đề phụ:** Bảng kết quả định lượng 5 cấu hình thử nghiệm chứng minh tính tất yếu không thể thay thế của từng module
- **Phân đoạn:** BÓC TÁCH MODULE (ABLATION BENCHMARK)
- **Thông điệp cốt lõi:** *"Mọi module trong TechGAR đều giải quyết một bài toán vật lý cụ thể: Tắt Topology làm tăng vọt 28.5% sai số ghép cặp; Tắt FrameDiff kép làm giảm 20.2% Precision."*

### 2. Nội dung thuyết trình học thuật
1. **Phương pháp luận bóc tách (Ablation Methodology):**
   - Lần lượt vô hiệu hóa từng module thuật toán độc lập trên cùng một tập dữ liệu chuẩn để đo đạc sự suy giảm hiệu năng.
2. **Bảng kết quả bóc tách định lượng (5 Cấu hình thử nghiệm):**
   | Cấu hình thử nghiệm | Precision | Recall | Sai ghép Overlap | Tốc độ CPU | Hiện tượng vật lý khi vô hiệu hóa |
   |:---|:---:|:---:|:---:|:---:|:---|
   | **1. Full TechGAR Pipeline (Đề xuất)** | **96.2%** | **94.8%** | **0.0%** | **25.1 FPS** | **Chạy mượt mà, giữ vững danh tính toàn bãi** |
   | **2. Bỏ Topology Gate** | 81.4% | 89.0% | **28.5% (Vọt tăng)** | 15.2 FPS | Ghép nhầm xe ở xa, quá tải tính toán CPU |
   | **3. Bỏ FrameDiff Kép (Chỉ MOG2)** | 76.0% | 88.2% | 12.0% | 26.0 FPS | Bóng râm động sinh ra hàng loạt bounding box rác |
   | **4. Bỏ Kalman Filter (Chỉ đo thật)** | 82.5% | 68.4% | 18.4% | 27.8 FPS | Mất dấu hoàn toàn khi xe đi qua cột bê tông |
   | **5. Bỏ SSD Template Reacquire** | 88.1% | 72.3% | 8.5% | 25.4 FPS | Mất dấu vết và tráo ID khi xe dừng chờ lùi đỗ |
3. **Phân tích đóng góp khoa học của từng module:**
   - **Topology Gate:** Đóng góp giảm $65\%$ chi phí tìm kiếm và **triệt tiêu hoàn toàn $28.5\%$ sai số ghép nhầm**.
   - **Dual FrameDiff:** Đóng góp **$+20.2\%$ Precision** nhờ triệt tiêu bóng râm động và ánh đèn tuýp.
   - **Kalman Filter:** Đóng góp **$+26.4\%$ Recall**, đóng vai trò là "cầu nối dự báo" sống còn khi xe đi qua điểm mù sau cột.
   - **SSD Reacquire:** Đảm bảo tính liên tục của Local ID khi xe dừng lâu.

### 3. Mô tả Video Demo chi tiết cho Slide 14
- **Tên file video đề xuất:** `demo_slide14_ablation_comparison.mp4`
- **Nguồn dữ liệu:** Render so sánh 2 luồng: Cấu hình Full TechGAR vs Cấu hình tắt Topology Gate (No-Topology).
- **Thời lượng khuyến nghị:** 8.5 giây (212 frames @ 25 FPS).
- **Bố cục khung hình:** Màn hình so sánh đối đầu trực diện (A/B Testing split screen):
  - Bên trái ($50\%$): `CẤU HÌNH FULL TECHGAR (ĐỀ XUẤT)`
  - Bên phải ($50\%$): `CẤU HÌNH BỎ TOPOLOGY GATE (ABLATION)`
- **Diễn biến chi tiết theo dòng thời gian:**
  - `Giây 0.0 - 3.0`: Chiếc xe đi vào vùng chuyển giao giữa 2 camera. Cả hai bên màn hình đều đang bám vết xe.
  - `Giây 3.0 - 5.5`: Một chiếc xe khác cùng màu trắng đang đỗ ở góc xa của Cam 2 bắt đầu nhích nhẹ.
    - Bên trái (Full TechGAR): Cổng Topology khóa chặt xe ở xa. Xe đang chuyển giao được gán chuẩn xác `GID #1`.
    - Bên phải (Bỏ Topology): Thuật toán so khớp tự do bị đánh lừa bởi màu sơn trắng của xe ở xa $	o$ Gán nhầm ID của xe đang chuyển giao cho chiếc xe ở góc xa! Nhãn đỏ nhấp nháy: `MIS-ASSOCIATION DETECTED: OVERLAP ERROR 28.5%`.
  - `Giây 5.5 - 8.5`: Bảng so sánh 5 thông số bốc hơi hiện lên đè trên màn hình bên phải, chứng minh sự sụp đổ hiệu năng khi thiếu Topology Gate.
- **Các lớp đồ họa trực quan (Visual Annotations & HUD):**
  - Màn hình trái: Viền xanh lá an toàn kèm nhãn: `TOPOLOGY CONSTRAINED: 0.0% ERROR`.
  - Màn hình phải: Mũi tên đỏ nối chéo sang xe ở góc xa kèm còi cảnh báo: `CROSS-SPACE MISMATCH!`.
  - Bảng số liệu Ablation Study xuất hiện dạng thanh bar đồ họa so sánh 5 cấu hình.
- **Điểm mấu chốt chỉ cho Hội đồng xem:**
  - *"Xin Hội đồng hãy nhìn vào nửa bên phải màn hình: Khi tắt Topology Gate, hệ thống lập tức ghép nhầm chiếc xe vào với chiếc xe ở góc xa, sai số vọt lên 28.5%. Thử nghiệm bóc tách này khẳng định không có bất kỳ thuật toán nào trong TechGAR là thừa thãi!"*
- **Kịch bản nói (Speaker Cue):**
  - Giây 1: *"Thử nghiệm bóc tách 5 cấu hình chứng minh tính tất yếu của từng module."*
  - Giây 4: *"Khi bỏ Topology Gate, lỗi ghép nhầm vọt tăng 28.5% do bắt nhầm xe ở xa."*
  - Giây 7: *"Mọi thành phần trong TechGAR đều giải quyết trọn vẹn một bài toán vật lý cụ thể."*

---

## SLIDE 15: HỆ THỐNG QUẢN LÝ BÃI ĐỖ TOÀN DIỆN: TỪ NGHIÊN CỨU ĐẾN THỰC TIỄN

### 1. Thông tin định danh Slide
- **Tiêu đề:** Hệ Thống Quản Lý Bãi Đỗ Toàn Diện: Từ Nghiên Cứu Đến Thực Tiễn
- **Tiêu đề phụ:** Tóm lược 3 đóng góp khoa học cốt lõi, sản phẩm ứng dụng dẫn đường tìm xe và lộ trình mở rộng N-Camera
- **Phân đoạn:** KẾT LUẬN & ỨNG DỤNG THỰC TIỄN
- **Thông điệp cốt lõi:** *"TechGAR chứng minh rằng: Bằng việc làm chủ bản chất hình học không gian và phân tầng ranh giới lỗi, chúng ta hoàn toàn có thể định vị tầng hầm chuẩn xác centimet trên phần cứng CPU tiết kiệm chi phí."*

### 2. Nội dung thuyết trình học thuật
1. **Tóm lược 3 Đóng góp khoa học cốt lõi của Đề tài:**
   - **Đóng góp 1 (Mô hình Homography neo mặt sàn):** Triệt tiêu hoàn toàn sai thị Parallax 3D bằng cách neo điểm tiếp xúc bánh xe ($Z=0$), đạt sai số đường may $p_{50} = 1.13	ext{ cm}$ trên 945 cặp đo thực tế.
   - **Đóng góp 2 (Cơ chế Handoff đa quan sát song song):** Bác bỏ tư duy bàn giao tuần tự; kết hợp Topology Gate và bộ lọc Cosine $\cos(	heta) < 0.25$ để duy trì duy nhất một Canonical Global ID xuyên suốt toàn bãi.
   - **Đóng góp 3 (Nhận diện ô đỗ Adaptive Equalizer):** Khắc phục triệt để thử thách lóa đèn pha bằng cụm 9 biến thể Gamma-CLAHE biểu quyết đa số $\ge 5/9$ kết hợp Arrival Claim & Departure Token 5s.
2. **Sản phẩm ứng dụng thực tế & Khả năng thương mại hóa:**
   - **Ứng dụng Dẫn đường tìm xe trong nhà (Indoor Navigation Web App):** Người dùng chỉ cần quét mã QR tại sảnh thang máy, hệ thống tự động tìm vị trí xe đang đỗ tại ô C-06 và vẽ tuyến đường đi bộ ngắn nhất từng bước chân.
   - **Web Dashboard điều hành trung tâm:** Cung cấp bản đồ trực quan cho ban quản lý tòa nhà với độ trễ toàn trình chỉ $169	ext{ ms}$.
   - **Vận hành trên CPU phổ thông:** Tiết kiệm hàng trăm triệu đồng chi phí card đồ họa GPU cho chủ đầu tư.
3. **Lộ trình phát triển mở rộng (Roadmap):**
   - Mở rộng mô hình Đồ thị phân tán (Distributed Graph Tracking) cho mạng lưới $N$ camera trên nhiều tầng hầm liên thông.
   - Tích hợp nhận diện biển số ANPR tại cổng vào để gán thẻ định danh cho khách hàng.

### 3. Mô tả Video Demo chi tiết cho Slide 15
- **Tên file video đề xuất:** `demo_slide15_web_navigation_c06.mp4`
- **Nguồn dữ liệu:** Video quay màn hình giao diện ứng dụng Web Navigation trên điện thoại di động kết hợp ảnh `web_navigation_c06.png`.
- **Thời lượng khuyến nghị:** 9.0 giây (225 frames @ 25 FPS).
- **Bố cục khung hình:** Giao diện điện thoại thông minh (Mobile App Mockup) đặt cạnh bản đồ điều hành Web Dashboard:
  - Bên trái ($40\%$): Màn hình điện thoại của khách hàng tìm xe.
  - Bên phải ($60\%$): Bản đồ bãi xe thời gian thực hiển thị ô đỗ C-06 đang có xe đỗ.
- **Diễn biến chi tiết theo dòng thời gian:**
  - `Giây 0.0 - 3.0`: Khách hàng mở ứng dụng Web tại sảnh thang máy LOBBY. Ứng dụng tự động truy vấn vị trí xe: `VEHICLE LOCATED: SLOT C-06`.
  - `Giây 3.0 - 6.5`: Tuyến đường đi bộ màu xanh cyan với các mũi tên chuyển động lập tức được vẽ trên bản đồ sàn, dẫn đường từ thang máy, rẽ phải qua sảnh phụ đến thẳng vị trí ô C-06. Khoảng cách hiển thị: `Distance: 42m | Walking time: 35s`.
  - `Giây 6.5 - 9.0`: Khách hàng bước tới ô C-06, chiếc xe thật đang đỗ an toàn tại vị trí. Màn hình điện thoại hiển thị thông báo thành công: `YOU HAVE ARRIVED AT YOUR VEHICLE!`.
- **Các lớp đồ họa trực quan (Visual Annotations & HUD):**
  - Mũi tên dẫn đường phát sáng uốn lượn theo hành lang đi bộ.
  - Điểm đích ô đỗ C-06 phát xung tròn màu xanh lá dạ quang kèm biểu tượng xe hơi.
  - Banner kết luận đề tài: `TECHGAR: MỘT XE THẬT — MỘT CANONICAL GID — MỘT TỌA ĐỘ CENTIMET — MỘT TRẠNG THÁI Ô ĐỖ`.
- **Điểm mấu chốt chỉ cho Hội đồng xem:**
  - *"Kính thưa Hội đồng, toàn bộ nghiên cứu hàn lâm từ hình học Homography, bám vết đa camera đến nhận diện ô đỗ cuối cùng đã kết tinh thành sản phẩm ứng dụng dẫn đường thực tế mà quý vị đang thấy trên màn hình: Một ứng dụng tìm xe trực quan, tiện ích cho người dân và tiết kiệm chi phí tối đa cho xã hội."*
- **Kịch bản nói (Speaker Cue):**
  - Giây 1: *"Kết quả nghiên cứu được đóng gói thành giải pháp ứng dụng thực tiễn hoàn chỉnh."*
  - Giây 4: *"Ứng dụng Web tự động tính toán lộ trình đi bộ ngắn nhất dẫn khách hàng đến đúng ô C-06."*
  - Giây 7: *"TechGAR giải quyết bài toán định vị ngầm bằng tư duy hình học sâu sắc trên phần cứng tiết kiệm chi phí."*

---

# HƯỚNG DẪN TRÍCH XUẤT & TỔNG KẾT KHO TƯ LIỆU VIDEO DỰ ÁN

Toàn bộ các video demo mô tả trong 15 slide trên đều có sẵn hoặc có thể trích xuất trực tiếp từ kho tư liệu thực nghiệm của dự án tại:
1. **Thư mục Video có sẵn:** `D:\TechGar2ackend\main_detect\docs\slides_tracking\slides_assets\`
   - `demo_overlap_split.mp4` (Dành riêng cho Slide 07 & Slide 08)
   - `demo_tracking_cam1.mp4` (Dành riêng cho Slide 02 & Slide 05)
   - `demo_tracking_cam2.mp4` (Dành riêng cho Slide 06 & Slide 11)
2. **Thư mục Dữ liệu thực nghiệm gốc:** `d:	echgar\TechGAR_Parking_Thai23_8ackend\main_detect\experiment_test\output\droidcam_shared_vd_07\`
   - `raw_cam1.mp4`, `raw_cam2.mp4` (Video camera thô)
   - `debug_cam1.mp4`, `debug_cam2.mp4` (Video có bounding box và thông số telemetry)
   - `predictions.jsonl` (Tọa độ bám vết từng frame của 3.827 frames)
   - `performance.csv` (Dữ liệu độ trễ ms và FPS đo đạc thực tế)
