# 01_bai_toan_thuc_te

Nhóm bắt đầu từ một vấn đề rất thực tế: trong tầng hầm, định vị bằng GNSS không còn đáng tin cậy, trong khi camera lại gặp điểm mù, che khuất và góc nhìn xiên. Vì vậy câu hỏi nghiên cứu của nhóm là làm thế nào xác định đồng thời **xe nào**, **đang ở đâu**, và **đang thuộc ô đỗ nào** mà không cần gắn thêm thiết bị lên từng phương tiện. Dữ liệu kiểm chứng của nhóm được thu trên một mô hình bãi đỗ thu nhỏ mô phỏng đúng bối cảnh này.

# 02_mot_camera_chua_du

Nếu chỉ dùng một camera, hệ thống sẽ gặp điểm mù, che khuất và mất dấu khi xe rời vùng quan sát. Vì vậy nhóm chuyển sang nhiều camera liên kết. Trong demo hiện tại, nhóm dùng 2 camera để kiểm chứng kiến trúc trên mô hình bãi đỗ.

# 03_pipeline_tong_the

Toàn bộ hệ thống không được xây từ một thuật toán duy nhất. Mỗi tầng xử lý một lỗi vật lý khác nhau: từ ánh sáng, che khuất, góc nhìn xiên, đến việc một xe xuất hiện dưới hai Local ID ở hai camera khác nhau.

# 04_hai_camera_song_song

Hai camera trong hệ thống chạy song song. Khi xe đi qua overlap, cả hai camera có thể cùng thấy chiếc xe ở gần cùng một thời điểm. Đây là cơ sở để hợp nhất hai Local ID thành một Global ID duy nhất.

# 05_homography_mat_san

Do camera được gắn chéo, vị trí pixel của xe không thể xem là khoảng cách thực. Nhóm dùng ground-plane homography và chỉ neo vào mặt sàn Z = 0. Mục tiêu không phải ghép toàn bộ hình khối 3D của xe, mà là tạo một hệ tọa độ mặt sàn thống nhất cho các camera.

# 06_local_tracking

Trong từng camera, mục tiêu đầu tiên là giữ được Local ID ổn định. Khi xe di chuyển, nhóm kết hợp MOG2 và FrameDiff. Khi xe bị che, Kalman hỗ trợ dự báo quỹ đạo. Khi xe dừng lâu và detector tạm mất đối tượng, SSD Template Reacquire được dùng để nối lại Local ID.

# 07_cross_camera_gid

Một xe có thể có hai Local ID khác nhau vì hai camera sử dụng namespace độc lập. Khi hai track cùng xuất hiện trong overlap và cùng phù hợp về vị trí, topology và đặc trưng, hệ thống quy chúng về một Canonical Global ID duy nhất.

# 08_topology_cost_matrix

Cost Matrix không chạy trên toàn bộ xe trong bãi. Topology Gate lọc ứng viên trước. Chỉ khi xe đi vào đúng hành lang và có candidate hợp lệ ở camera còn lại, hệ thống mới tính chi phí dựa trên vị trí, màu, kích thước và hướng.

# 09_adaptive_equalizer

Môi trường tầng hầm có độ sáng biến thiên lớn. Một threshold cố định sẽ hoạt động tốt ở điều kiện này nhưng thất bại ở điều kiện khác. Vì vậy nhóm dùng một ensemble 25 biến thể Gamma–CLAHE xoay quanh một cấu hình nền — gamma khoảng 2.5 đến 2.8, CLAHE khoảng 2.0, với biên điều chỉnh cộng trừ 0.2 và 0.5 trên lưới 8 nhân 8 — rồi kết hợp quyết định thay vì phụ thuộc vào một bộ tham số duy nhất.

# 10_vote_threshold

Hệ thống không quyết định trạng thái ô dựa trên một phiên bản ảnh duy nhất. Mỗi trong 25 biến thể Gamma–CLAHE cho một vote. Ô được xác nhận trống khi đạt đa số — ít nhất 12 trên 25 biến thể vote trống; ngược lại là occupied, kèm làm mượt theo 5 frame để tránh nhấp nháy.

# 11_lifecycle_parked_reid

Xe được xác nhận đỗ khi có ít nhất 3 mẫu liên tiếp và 2 lần xác nhận vision trong cửa sổ khoảng 1,5 giây — đủ để phân biệt xe đỗ thật với xe chỉ đi ngang. Khi xe rời ô, Departure Token 5 giây giữ lại danh tính, và có thể gia hạn tiệm cận tới 15 giây nếu quá trình rời còn tiến triển. Khi xe đỗ, Local Track có thể trở nên dormant; lúc xe chạy lại, hệ thống khôi phục Canonical GID cũ dựa trên trạng thái ô, vị trí mặt sàn và quỹ đạo rời ô. Cơ chế này đã được triển khai và kiểm thử đơn vị, và hiện đang được kiểm chứng trên replay. Mục tiêu là chiếc xe trước và sau khi đỗ vẫn là cùng một G#1.

# 12_ket_qua_thuc_nghiem

Nhóm không chỉ tính trung bình trên toàn bộ video vì phần lớn thời gian bãi xe là cảnh tĩnh. Thay vào đó, nhóm tập trung vào các Event Window có rủi ro cao nhất: vùng chuyển camera và vùng cửa ô đỗ. Trong 20 session thử nghiệm, 19 session hoàn thành thành công. Session còn lại thất bại ở cơ chế khôi phục ID sau khi rời ô — một giới hạn nhóm ghi nhận và cần kiểm chứng thêm.

# 13_dong_gop_huong_phat_trien

Tóm lại, nghiên cứu tập trung vào ba đóng góp: đưa nhiều camera về một hệ tọa độ mặt sàn chung, duy trì một danh tính duy nhất cho phương tiện khi di chuyển giữa các camera, và liên kết danh tính đó với trạng thái ô đỗ. Kết quả hiện tại là bước kiểm chứng trên mô hình bãi đỗ thu nhỏ trong nhà, và hướng tiếp theo là mở rộng N-camera, dataset lớn hơn và đánh giá bằng ground truth đầy đủ.
