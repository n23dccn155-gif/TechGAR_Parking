# Các Thuật Toán Tiêu Biểu Trong Project TechGAR Parking

Dự án TechGAR không phụ thuộc vào một "siêu thuật toán" AI nặng nề duy nhất. Thay vào đó, hệ thống sử dụng một chuỗi các thuật toán tối ưu, logic toán học, xử lý ảnh và đồ thị để tạo ra một hệ thống đỗ xe thông minh, mô phỏng camera liên hoàn và điều hướng theo thời gian thực. Dưới đây là các thuật toán cốt lõi.

---

## 1. Thuật toán Theo dõi đối tượng liên camera (Cross-Camera Target Tracking & Handoff)

* **Thành phần cốt lõi:** Kalman Filter, Thuật toán ghép cặp đồ thị hai phía LAPJV (Linear Assignment Problem Jonker-Volgenant).
* **Vị trí file:**
  - `backend/main_detect/src/techgar/cross_camera_manager.py`
  - `backend/main_detect/src/techgar/motion_tracker.py`
* **Cách áp dụng:** Dùng Kalman Filter để ước lượng vận tốc và dự đoán xe sắp ra khỏi mép camera (time-to-edge). Khi camera tiếp theo phát hiện xe mới, dùng LAPJV để ghép nối hồ sơ (dựa trên tọa độ, vận tốc, màu HSV) nhằm duy trì cùng một Global ID xuyên suốt.

**Mã giả (Pseudo-code):**

```python
function Handoff(camera_nguon, camera_dich, track_id):
    thoi_gian_toi_bien = khoang_cach_den_bien / van_toc_xe
    if thoi_gian_toi_bien <= SO_KHUNG_HINH_DU_DOAN:
        Mo_Ho_So_Ban_Giao(track_id, vi_tri_du_doan, van_toc, HSV)
      
function Nhap_Camera_Dich(danh_sach_xe_moi):
    for xe in danh_sach_xe_moi:
        for ho_so in Danh_Sach_Ban_Giao:
            chi_phi = Tinh_Sai_So(xe.toa_do, ho_so.vi_tri_du_doan) 
                    + Tinh_Lech_Goc(xe.van_toc, ho_so.van_toc) 
                    + Tinh_Lech_Mau(xe.HSV, ho_so.HSV)
  
    # Dùng thuật toán LAPJV để ghép nối 1-1 với tổng chi phí thấp nhất
    best_match = LAPJV_Optimize(Danh_Sach_Ban_Giao, danh_sach_xe_moi, ma_tran_chi_phi)
  
    if best_match.chi_phi < NGUONG_CHO_PHEP:
        Giu_Nguyen_Global_ID(best_match)
```

## 2. Thuật toán Xử lý ảnh nhận dạng ô đỗ (Parking Vision - Multi-config Voting)

* **Thành phần cốt lõi:** Phân tích ảnh truyền thống (Adaptive Thresholding, CLAHE, Canny Edge), Bỏ phiếu đa cấu hình (Multi-config Voting 12/25).
* **Vị trí file:**
  - `backend/main_detect/src/techgar/parking_detector.py`
* **Cách áp dụng:** Chạy 25 biến thể ảnh (tăng/giảm độ sáng, độ tương phản). Đếm tỷ lệ mật độ pixel của xe (foreground ratio) trong đa giác ô đỗ. Nếu có 12/25 cấu hình bỏ phiếu "có xe" và trạng thái ổn định (temporal smoothing), kết luận ô đã bị chiếm.

**Mã giả (Pseudo-code):**

```python
function Nhan_Dien_O_Do(frame, polygon_o_do):
    so_phieu_co_xe = 0
    configs = Sinh_25_Cau_Hinh_Anh(Gamma, CLAHE)
  
    for config in configs:
        anh_xu_ly = Ap_Dung_Bo_Loc(frame, config)
        anh_nhi_phan = Adaptive_Threshold(anh_xu_ly)
      
        # Đếm pixel trong vùng
        mat_do = Dem_Pixel_Trang(anh_nhi_phan, polygon_o_do) / Dien_Tich(polygon_o_do)
        if mat_do > NGUONG_VAT_THE:
            so_phieu_co_xe += 1
          
    # Cơ chế bỏ phiếu quá bán (12/25 phiếu)
    if so_phieu_co_xe >= 12:
        return Temporal_Smoothing("CO_XE")
    else:
        return Temporal_Smoothing("TRONG")
```

## 3. Thuật toán Ghép nối Xe và Ô đỗ (Slot-Vehicle Binding & Stop Detection)

* **Thành phần cốt lõi:** Hình học Convex (Giao cắt đa giác), Phân tích phương sai tĩnh (r95 Variance, d_net Drift).
* **Vị trí file:**
  - `backend/main_detect/src/techgar/slot_vehicle_binder.py`
* **Cách áp dụng:** Đo tỷ lệ diện tích giao nhau giữa ô đỗ và hình chữ nhật bao quanh xe (IoA > 60%). Sau đó phân tích tọa độ của xe trong 1 khoảng thời gian, nếu phương sai tọa độ (r95) rất nhỏ (tức là xe không nhúc nhích), kết luận xe đã thực sự đỗ (Parked).

**Mã giả (Pseudo-code):**

```python
function Kiem_Tra_Xe_Vao_O(bbox_xe, polygon_o_do):
    dien_tich_giao = cv2.intersectConvexConvex(bbox_xe, polygon_o_do)
    ty_le_chong_lan = dien_tich_giao / Dien_Tich(bbox_xe)
  
    if ty_le_chong_lan > NGUONG_CHONG_LAN:
        Them_Vao_Lich_Su_Chuyen_Dong(Toa_Do_Tam(bbox_xe))
      
function Kiem_Tra_Dung_Do(lich_su_toa_do_cua_xe):
    if So_Khung_Hinh(lich_su_toa_do_cua_xe) < NGUONG_THOI_GIAN_LUU_TRU:
        return "MOVING" # Vẫn đang di chuyển
      
    do_troi = Khoang_Cach(Lich_Su.Toa_Do_Dau, Lich_Su.Toa_Do_Cuoi)
    phuong_sai_95 = Tinh_Phuong_Sai_r95(lich_su_toa_do_cua_xe)
  
    if do_troi < NGUONG_DAO_DONG_CHO_PHEP and phuong_sai_95 < NGUONG_R95:
        return "PARKED" # Xe đã dừng hẳn
```

## 4. Thuật toán Phân tích Hướng & Chỉ đường (Vector Direction Analysis & Cross Product)

* **Thành phần cốt lõi:** Tích vô hướng (Dot Product) và Tích có hướng (Cross Product 2D) của vector.
* **Vị trí file:**
  - `backend/main_detect/src/techgar/direction_detector.py`
  - `frontend/src/routing/voiceGuidance.ts`
* **Cách áp dụng:** Xác định phương hướng xe rẽ tại ngã tư. Dùng Tích vô hướng để tìm góc quay, dùng Tích có hướng để xác định xe rẽ bên trái hay bên phải, qua đó kích hoạt giọng nói điều hướng trên frontend.

**Mã giả (Pseudo-code):**

```python
function Phan_Tich_Huong(quy_dao_truoc_vach, quy_dao_sau_vach):
    Vector_A = Tinh_Vector(quy_dao_truoc_vach)
    Vector_B = Tinh_Vector(quy_dao_sau_vach)
  
    goc_re = Dot_Product(Vector_A, Vector_B)
    huong_re = Cross_Product_2D(Vector_A, Vector_B) # Công thức: (A.x * B.y) - (A.y * B.x)
  
    if goc_re < GOC_20_DO:
        return "DI_THANG"
    else if huong_re > 0:
        return "RE_TRAI"
    else if huong_re < 0:
        return "RE_PHAI"
```

## 5. Thuật toán Tìm đường đi ngắn nhất (Shortest Path Routing)

* **Thành phần cốt lõi:** Thuật toán Dijkstra (hoặc A*) trên Đồ thị tuyến đường (Lane Graph).
* **Vị trí file:**
  - `frontend/src/routing/routeEngine.ts`
* **Cách áp dụng:** Biến bãi đỗ xe thành mạng lưới đỉnh (Node) và cạnh (Edge). Khi người dùng vào Kiosk, thuật toán sẽ vẽ quỹ đạo ngắn nhất từ cổng vào đến ô đỗ mà không được đè lên bồn hoa hay đi ngược chiều.

**Mã giả (Pseudo-code):**

```python
function Dijkstra_Tim_Duong(do_thi, diem_xuat_phat, diem_o_do):
    Khoang_Cach = Khoi_Tao_Mang(Vo_Cuc)
    Khoang_Cach[diem_xuat_phat] = 0
    Hang_Doi = [diem_xuat_phat]
  
    while Hang_Doi khong rong:
        nut_hien_tai = Hang_Doi.Lay_Nho_Nhat()
      
        if nut_hien_tai == diem_o_do:
            break
          
        for canh_ke in do_thi.Lay_Canh_Ke(nut_hien_tai):
            chi_phi_moi = Khoang_Cach[nut_hien_tai] + canh_ke.Do_Dai
          
            if chi_phi_moi < Khoang_Cach[canh_ke.nut_dich]:
                Khoang_Cach[canh_ke.nut_dich] = chi_phi_moi
                Luu_Truy_Vet(canh_ke.nut_dich, nut_hien_tai)
                Hang_Doi.Them(canh_ke.nut_dich)
              
    return Truy_Vet_Duong_Di(diem_xuat_phat, diem_o_do)
```

## 6. Thuật toán Trừ nền (Background Subtraction MOG2) & Phân tích chuyển động

* **Thành phần cốt lõi:** Gaussian Mixture Models (MOG2), Frame Difference & Median Blur, Morphology.
* **Vị trí file:**
  - `backend/main_detect/src/techgar/motion_tracker.py`
* **Cách áp dụng:** MOG2 học một hình ảnh nền tĩnh của bãi đỗ xe. Khi có xe vào, các điểm ảnh mới khác biệt với nền sẽ được trích xuất. Kết hợp phép "bù sáng" (Median Blur), các nhiễu như bóng cây, thay đổi ánh sáng sẽ bị triệt tiêu, trả về đúng khối (Bounding Box) của xe đang chạy.

**Mã giả (Pseudo-code):**

```python
function Phat_Hien_Chuyen_Dong(frame_hien_tai, model_MOG2, frame_truoc_do):
    # 1. Trừ nền bằng MOG2
    mask_nen = model_MOG2.apply(frame_hien_tai)
  
    # 2. Trừ ảnh hai khung hình liên tiếp để bù sáng
    mask_thay_doi = Tru_Anh_Va_Bu_Sang(frame_hien_tai, frame_truoc_do, Median_Blur)
  
    # 3. Giao thoa 2 kết quả
    mask_chuyen_dong_thuc = AND(mask_nen, mask_thay_doi)
  
    # 4. Làm mịn viền, gom khối ảnh
    mask_sach = Morphology_Closing_Dilation(mask_chuyen_dong_thuc)
    bounding_boxes = Tim_Contour_Va_Bbox(mask_sach)
  
    return bounding_boxes # Danh sách các vật thể đang di chuyển
```
