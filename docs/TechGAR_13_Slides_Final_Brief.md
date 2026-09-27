# TECHGAR — Brief hoàn chỉnh 13 slide bảo vệ NCKH

> **Mục tiêu:** Tổng hợp toàn bộ nội dung đã chốt để dựng lại bộ slide TechGAR phục vụ thuyết trình trước hội đồng bằng tiếng Việt.  
> **Nguyên tắc:** Không trình bày theo kiểu liệt kê công nghệ. Mỗi slide phải trả lời **một câu hỏi nghiên cứu / một vấn đề thực tế**, sau đó mới đưa ra cách giải quyết và bằng chứng.

---

# 0. Mạch trình bày tổng thể

**Bối cảnh thực tế → Vấn đề / khoảng trống → Tại sao 1 camera chưa đủ → Phương pháp đề xuất → Từng vấn đề phát sinh và cách xử lý → Thực nghiệm / đối chứng → Failure case → Đóng góp → Hạn chế → Hướng phát triển**

13 slide:

1. Dẫn nhập — Bài toán thực tế  
2. Từ 1 camera → Multi-camera  
3. Toàn bộ bài toán / pipeline  
4. Hai camera xử lý song song  
5. Camera góc chéo / Homography  
6. Local Tracking  
7. Cross-Camera + video + map  
8. Topology + Cost Matrix + Angle  
9. Adaptive Equalizer + nguồn tham số  
10. Vote Threshold 5/9  
11. Xe vào / rời ô đỗ + khôi phục ID sau khi rời ô  
12. Thực nghiệm + đối chứng + failure  
13. Đóng góp + hạn chế + hướng phát triển  

---

# 1. Quy tắc thiết kế chung

Không dùng cùng một frame chia đôi cho tất cả slide. Giữ **cùng hệ thiết kế**, nhưng thay đổi bố cục theo loại nội dung.

Nên dùng 5 nhóm layout:

1. **Hero Problem** — ảnh lớn + vấn đề chính.  
2. **Comparison 50/50** — khi thật sự cần so sánh.  
3. **Full-width Process / Pipeline** — cho quy trình.  
4. **Large Visual + Formula/Data Panel** — hình lớn + công thức / số liệu.  
5. **Results Dashboard** — số liệu lớn, ít chữ.  

Giữ nhất quán: 16:9, màu xanh TechGAR, font, header, số slide, 1 màu accent, không paragraph dài, số liệu chính phải lớn, ưu tiên ảnh/video thực nghiệm.

---

# SLIDE 1 — DẪN NHẬP: BÀI TOÁN THỰC TẾ

## Mục tiêu
Cho hội đồng hiểu **tại sao bài toán này đáng làm** trước khi nói đến thuật toán.

## Tiêu đề
**Định vị phương tiện và quản lý ô đỗ trong tầng hầm**

## Frame
**Hero Problem Layout**

```text
┌─────────────────────────────────────────────────────┐
│ ĐỊNH VỊ PHƯƠNG TIỆN & QUẢN LÝ Ô ĐỖ TẦNG HẦM      │
├────────────────────────┬────────────────────────────┤
│ VẤN ĐỀ THỰC TẾ         │ ẢNH THỰC ĐỊA TẦNG HẦM    │
│ • GNSS không ổn định   │ [ảnh bãi xe thật]         │
│ • Điểm mù / cột        │ đánh dấu cột, camera      │
│ • Xe che khuất nhau    │ vùng quan sát             │
│ • Camera góc chéo      │                            │
│ • Không gắn cảm biến   │                            │
│   lên từng xe          │                            │
├────────────────────────┴────────────────────────────┤
│ XE NÀO?  —  Ở ĐÂU?  —  ĐANG Ở Ô NÀO?             │
└─────────────────────────────────────────────────────┘
```

## Nội dung hiển thị
- GPS/GNSS không ổn định hoặc không khả dụng trong tầng hầm.
- Cột bê tông tạo điểm mù và che khuất.
- Xe có thể chồng lấn trong góc nhìn camera.
- Camera lắp góc chéo nên tọa độ pixel không phải tọa độ thực.
- Không thể yêu cầu mọi phương tiện gắn beacon/UWB/LiDAR.

### Câu hỏi nghiên cứu
**XE NÀO? — Ở ĐÂU? — ĐANG Ở Ô NÀO?**

## Visual
Ảnh tầng hầm thật, vẽ vùng camera, highlight cột / điểm mù / vùng overlap.

## Lời thuyết trình
> “Nhóm bắt đầu từ một vấn đề rất thực tế: trong tầng hầm, định vị bằng GNSS không còn đáng tin cậy, trong khi camera lại gặp điểm mù, che khuất và góc nhìn xiên. Vì vậy câu hỏi nghiên cứu của nhóm là làm thế nào xác định đồng thời **xe nào**, **đang ở đâu**, và **đang thuộc ô đỗ nào** mà không cần gắn thêm thiết bị lên từng phương tiện.”

## Lưu ý khoa học
- Không dùng câu “GPS = 0 dBm”.
- Không nói GPS “mất hoàn toàn” nếu chưa có số đo thực tế.
- Nên dùng: **“GNSS không ổn định hoặc không khả dụng trong môi trường tầng hầm.”**

---

# SLIDE 2 — TỪ 1 CAMERA → MULTI-CAMERA

## Mục tiêu
Cho hội đồng thấy **quá trình ra quyết định thiết kế**.

## Tiêu đề
**Tại sao một camera chưa đủ?**

## Frame
**Comparison 50/50**

```text
┌────────────────────────┬───────────────────────────┐
│       1 CAMERA         │       MULTI-CAMERA       │
│ [ảnh xe sau cột]       │ [Cam 1]      [Cam 2]    │
│ ✕ Điểm mù              │ ✓ Bổ sung vùng quan sát │
│ ✕ Xe che lẫn nhau      │ ✓ Nhiều góc nhìn        │
│ ✕ Mất Local ID         │ ✓ Hỗ trợ giữ danh tính  │
│ ✕ Không phủ toàn bãi   │ ✓ Mở rộng theo topology │
└────────────────────────┴───────────────────────────┘
```

## Nội dung
### 1 Camera
- Điểm mù sau cột bê tông.
- Dynamic occlusion.
- Biến dạng phối cảnh.
- Có thể mất dấu và tạo Local ID mới.
- Không thể phủ toàn bộ bãi xe.

### Multi-camera
- Bổ sung vùng quan sát.
- Quan sát đồng thời từ nhiều góc.
- Tạo vùng overlap để kiểm chứng cùng một xe.
- Hỗ trợ duy trì danh tính toàn bãi.
- Có khả năng mở rộng theo topology.

### Dòng chốt
**Quyết định thiết kế: sử dụng hệ nhiều camera cố định — demo nghiên cứu sử dụng 2 camera.**

## Visual
Dùng cùng một tình huống: Cam 1 bị cột che, Cam 2 vẫn thấy xe.

## Lời thuyết trình
> “Nếu chỉ dùng một camera, hệ thống sẽ gặp điểm mù, che khuất và mất dấu khi xe rời vùng quan sát. Vì vậy nhóm chuyển sang nhiều camera liên kết. Trong demo hiện tại, nhóm dùng 2 camera để kiểm chứng kiến trúc.”

## Lưu ý
Hiện chưa có baseline định lượng đầy đủ kiểu **1 camera = X%, 2 camera = Y%**. Không tự thêm số nếu chưa chạy thí nghiệm riêng.

---

# SLIDE 3 — TOÀN BỘ BÀI TOÁN

## Mục tiêu
Giúp hội đồng hình dung toàn bộ hệ thống trước khi đi vào chi tiết.

## Tiêu đề
**Từ video camera đến quyết định ô đỗ**

## Frame
**Full-width Process / Pipeline**

```text
VIDEO
  ↓
PHÁT HIỆN XE
  ↓
LOCAL TRACKING
  ↓
TỌA ĐỘ MẶT SÀN
  ↓
CROSS-CAMERA MATCHING
  ↓
CANONICAL GLOBAL ID
  ↓
NHẬN DIỆN Ô ĐỖ
  ↓
VEHICLE ↔ SLOT
```

## Vấn đề và cách xử lý
| Bước | Vấn đề | Cách xử lý |
|---|---|---|
| Detection | ánh sáng / bóng | MOG2 + FrameDiff |
| Local Tracking | che khuất / xe dừng | Kalman + SSD Reacquire |
| Ground Mapping | camera góc chéo | Homography |
| Cross-Camera | 2 Local ID cho 1 xe | Canonical GID |
| Matching | ghép nhầm | Topology + Cost Matrix |
| Slot State | ánh sáng biến thiên | Adaptive Equalizer |
| Vehicle-Slot | xe đi ngang / căn chỉnh | Arrival + Departure logic |

## Lời thuyết trình
> “Toàn bộ hệ thống không được xây từ một thuật toán duy nhất. Mỗi tầng xử lý một lỗi vật lý khác nhau: từ ánh sáng, che khuất, góc nhìn xiên, đến việc một xe xuất hiện dưới hai Local ID ở hai camera khác nhau.”

---

# SLIDE 4 — HAI CAMERA XỬ LÝ SONG SONG

## Mục tiêu
Nhấn mạnh hai camera có thể **cùng quan sát một xe trong vùng overlap**.

## Tiêu đề
**Hai camera quan sát cùng một không gian tại cùng thời điểm**

## Frame
**Dual-view 50/50**

```text
CAMERA 1                       CAMERA 2
┌────────────────┐           ┌────────────────┐
│  frame thực tế │           │  frame thực tế │
│      G#1       │           │      G#1       │
└────────────────┘           └────────────────┘

        cùng thời điểm t
        timestamp skew
```

## Số liệu
- Skew p50: **18 ms**
- Skew p95: **47 ms**
- Max: **110 ms**

## Dòng chốt
**Cross-camera không phải một cuộc “chạy tiếp sức” tuần tự; vùng overlap cho phép hai camera cùng quan sát và kiểm chứng một xe.**

## Lời thuyết trình
> “Hai camera trong hệ thống chạy song song. Khi xe đi qua overlap, cả hai camera có thể cùng thấy chiếc xe ở gần cùng một thời điểm. Đây là cơ sở để hợp nhất hai Local ID thành một Global ID duy nhất.”

---

# SLIDE 5 — CAMERA GÓC CHÉO / HOMOGRAPHY

## Mục tiêu
Giải thích vì sao pixel image không thể dùng trực tiếp làm tọa độ thực.

## Tiêu đề
**Từ ảnh camera góc chéo đến tọa độ thực trên mặt sàn**

## Frame
**Before → Transform → After**

```text
ẢNH CAMERA XIÊN
      ↓
GROUND-PLANE HOMOGRAPHY
      ↓
SHARED MAP NHÌN TỪ TRÊN
```

## Công thức
\[
s[X,Y,1]^T = H[u,v,1]^T
\]

## Số liệu
- **945 cặp điểm kiểm tra**
- p50 = **1,13 cm**
- p95 = **4,39 cm**

## Nội dung
- Xe là vật thể 3D.
- Không cố ghép mái xe.
- Dùng điểm neo trên **mặt sàn Z = 0**.
- Mục tiêu: đưa vị trí tiếp xúc mặt sàn về cùng hệ tọa độ.

## Lời thuyết trình
> “Do camera được gắn chéo, vị trí pixel của xe không thể xem là khoảng cách thực. Nhóm dùng ground-plane homography và chỉ neo vào mặt sàn Z = 0. Mục tiêu không phải ghép toàn bộ hình khối 3D của xe, mà là tạo một hệ tọa độ mặt sàn thống nhất cho các camera.”

## Lưu ý
Không nói “Homography triệt tiêu hoàn toàn parallax 3D”. Nên nói:
**“Homography giúp ánh xạ nhất quán các điểm nằm trên mặt phẳng tham chiếu, từ đó hạn chế ảnh hưởng của parallax đối với bài toán định vị mặt sàn.”**


---

# SLIDE 6 — LOCAL TRACKING

## Mục tiêu
Giải thích rằng trước Cross-Camera, từng camera phải giữ được một Local ID đủ ổn định.

## Tiêu đề
**Duy trì Local ID trong từng camera**

## Frame
**3 tình huống thực tế theo hàng ngang**

```text
[ XE DI CHUYỂN ]   [ XE BỊ CHE ]   [ XE DỪNG ]
      ↓                 ↓               ↓
MOG2+FrameDiff      Kalman          SSD Reacquire
```

## Nội dung
### Xe đang di chuyển
- MOG2
- Dual FrameDiff
- Median brightness compensation

### Xe bị che
- Kalman Prediction
- LAPJV association

### Xe dừng lâu
- SSD Template Reacquire

## Số liệu có thể dùng
- SSD Reacquire: **1.714 lần khôi phục**
- **25 trường hợp bị từ chối**

## Lời thuyết trình
> “Trong từng camera, mục tiêu đầu tiên là giữ được Local ID ổn định. Khi xe di chuyển, nhóm kết hợp MOG2 và FrameDiff. Khi xe bị che, Kalman hỗ trợ dự báo quỹ đạo. Khi xe dừng lâu và detector tạm mất đối tượng, SSD Template Reacquire được dùng để nối lại Local ID.”

## Visual
Ưu tiên frame thật, binary mask, bounding box và trajectory.

---

# SLIDE 7 — CROSS-CAMERA + VIDEO + MAP

## Mục tiêu
Trực quan hóa **một xe xuất hiện ở 2 camera nhưng chỉ có 1 Canonical Global ID**.

## Tiêu đề
**Một xe — hai quan sát — một Canonical Global ID**

## Frame
**65% video + 35% map**

```text
┌──────────────────────────────┬──────────────┐
│ VIDEO CAM 1 + CAM 2          │ SHARED MAP   │
│                              │              │
│ L1#7           L2#12         │   ● G#1      │
│   🚗             🚗          │    ↓         │
│                              │ trajectory   │
└──────────────────────────────┴──────────────┘

L1#7 + L2#12  →  Canonical G#1
```

## Nội dung
- Camera 1: `L1#7`
- Camera 2: `L2#12`
- Shared map: cùng vị trí vật lý
- Hợp nhất thành `G#1`

## Video
- Dùng clip overlap khoảng **4–5 giây**.
- Nếu có `demo_overlap_split.mp4`, dùng đúng clip đó.

## Lời thuyết trình
> “Một xe có thể có hai Local ID khác nhau vì hai camera sử dụng namespace độc lập. Khi hai track cùng xuất hiện trong overlap và cùng phù hợp về vị trí, topology và đặc trưng, hệ thống quy chúng về một Canonical Global ID duy nhất.”

## Dòng chốt
**Canonical GID được duy trì xuyên suốt trạng thái Moving ↔ Parked ↔ Moving.**

---

# SLIDE 8 — TOPOLOGY + COST MATRIX + ANGLE

## Mục tiêu
Trả lời hai câu:
1. **Khi nào Cost Matrix được áp dụng?**
2. **Dựa vào đâu để kết luận hai track là cùng một xe?**

## Tiêu đề
**Khi nào hai track được xem là cùng một xe?**

## Frame
**Diagram lớn + formula panel**

### Bước 1 — Topology Gate
```text
Xe vào đúng hành lang Topology?
            ↓ YES
Có candidate từ camera còn lại?
            ↓ YES
         COST MATRIX
```

### Bước 2 — Cost Matrix
\[
C =
0.55D_{ground}
+0.30D_{color}
+0.10D_{scale}
+0.05D_{heading}
\]

## Trực quan thuộc tính xe
Vẽ một chiếc xe ở giữa, xung quanh:
- **Vị trí — 55%**
- **Màu sắc — 30%**
- **Kích thước — 10%**
- **Hướng — 5%**

## Giải thích trọng số

### Vị trí 55%
- Quan trọng nhất vì quỹ đạo phải liên tục vật lý.
- Nếu giảm quá thấp → dễ nhầm candidate gần nhau.
- Nếu tăng quá cao → hai xe chạy sát nhau có nguy cơ swap.

### Màu 30%
- Dùng để phân biệt candidate.
- Nếu phụ thuộc quá nhiều → hai xe cùng màu dễ bị gộp.

### Scale 10%
- Hỗ trợ phân biệt footprint / kích thước tương đối.

### Heading 5%
- Là đặc trưng phụ.
- Đồng thời có thể dùng hard gate để loại chuyển động lệch hướng quá lớn.

## Angle / Heading
\[
\cos\theta=
\frac{v_1\cdot v_2}
{\|v_1\|\|v_2\|}
\]

Minh họa:

```text
→ →   góc nhỏ        ACCEPT
→ ↗   lệch vừa       xem xét
→ ←   ngược chiều    REJECT
```

Ngưỡng hiện tại:
\[
\cos\theta < 0.25 \Rightarrow reject
\]

## Lời thuyết trình
> “Cost Matrix không chạy trên toàn bộ xe trong bãi. Topology Gate lọc ứng viên trước. Chỉ khi xe đi vào đúng hành lang và có candidate hợp lệ ở camera còn lại, hệ thống mới tính chi phí dựa trên vị trí, màu, kích thước và hướng.”

## Lưu ý
Cần ghi rõ các trọng số `0.55 / 0.30 / 0.10 / 0.05` là:
- tuning thực nghiệm,
- heuristic,
- hay kế thừa từ tài liệu.

Không để hội đồng hiểu các số này “tự nhiên đúng”.

---

# SLIDE 9 — ADAPTIVE EQUALIZER & NGUỒN THAM SỐ

## Mục tiêu
Giải thích **tại sao 1 threshold cố định không đủ**, và tại sao nhóm chọn nhiều cấu hình Gamma + CLAHE.

## Tiêu đề
**Tại sao một bộ tham số cố định không đủ?**

## Frame
**3 điều kiện ánh sáng + bảng tham số**

```text
TỐI              BÌNH THƯỜNG            LÓA ĐÈN
[ảnh]                [ảnh]                [ảnh]

       Một threshold cố định không phù hợp
                       ↓
          Nhiều cấu hình Gamma + CLAHE
```

## Điều kiện thực tế
- vùng tối,
- ánh sáng bình thường,
- lóa đèn pha,
- bóng cột,
- sàn ẩm / phản xạ.

## Bảng tham số minh họa
| Điều kiện | Gamma | CLAHE Clip | Mục tiêu |
|---|---:|---:|---|
| Tối | 0,65 | 1,5 | nâng vùng tối |
| Bình thường | ~1,0 | cấu hình nền | giữ tương phản |
| Lóa mạnh | 1,4 | 4,0 | hạn chế vùng sáng bão hòa |

## Lời thuyết trình
> “Môi trường tầng hầm có độ sáng biến thiên lớn. Một threshold cố định sẽ hoạt động tốt ở điều kiện này nhưng thất bại ở điều kiện khác. Vì vậy nhóm sử dụng nhiều cấu hình Gamma và CLAHE, sau đó kết hợp quyết định thay vì phụ thuộc vào một bộ tham số duy nhất.”

## Nguồn tham số
Phải ghi rõ một trong các dạng:
- **Empirical tuning on indoor validation set**
- **Literature-based initialization → experimentally tuned**
- hoặc nguồn thực tế tương ứng.

## Cảnh báo cần sửa trước bảo vệ
Deck hiện ghi:

`2 × 2 × 1 × 5 = 25`

Nhưng:
\[
2\times2\times1\times5 = 20
\]

Cần kiểm tra lại code/grid-search thực tế. Có thể cấu hình thật là `5×5=25` hoặc một tổ hợp khác.

---

# SLIDE 10 — VOTE THRESHOLD 5/9

## Mục tiêu
Giải thích trực quan **vì sao hệ thống cần biểu quyết nhiều cấu hình**, và **vì sao đang dùng ngưỡng 5/9**.

## Tiêu đề
**Từ 9 cấu hình xử lý đến một quyết định ổn định**

## Frame
**Visual voting grid**

### Trường hợp có xe
```text
1 1 0
1 1 1     →  6/9  →  OCCUPIED
0 1 0
```

### Trường hợp nhiễu
```text
1 0 0
1 0 0     →  3/9  →  REJECT
0 0 1
```

## Công thức
\[
Occupied \iff \sum_{i=1}^{9} V_i \ge 5
\]

## Giải thích
- 5/9 là **majority vote**.
- Mục tiêu: tránh một vài cấu hình nhạy sáng tự quyết định toàn hệ thống.
- Nhiễu lóa có thể kích hoạt một số biến thể nhưng không đủ đa số.

## Thí nghiệm nên bổ sung
Nên chạy **threshold sweep**:

| Vote Threshold | FP | FN | Precision | Recall | F1 |
|---:|---:|---:|---:|---:|---:|
| 3/9 | ... | ... | ... | ... | ... |
| 4/9 | ... | ... | ... | ... | ... |
| **5/9** | ... | ... | ... | ... | ... |
| 6/9 | ... | ... | ... | ... | ... |
| 7/9 | ... | ... | ... | ... | ... |

## Lời thuyết trình
> “Hệ thống không quyết định trạng thái ô dựa trên một phiên bản ảnh duy nhất. Mỗi cấu hình cho một vote. Khi đạt đa số từ 5 trên 9, hệ thống mới xác nhận occupied.”

## Lưu ý
Nếu chưa chạy threshold sweep, **không nói 5/9 là tối ưu**. Chỉ nên nói:
> “5/9 được chọn theo nguyên tắc majority vote và hiện được sử dụng trong cấu hình thử nghiệm.”

---

# SLIDE 11 — XE VÀO / RỜI Ô ĐỖ + KHÔI PHỤC ID

## Mục tiêu
Cho thấy:
1. Xe **đi ngang qua ô** không đồng nghĩa đã đỗ.
2. Xe **rời ô** không đồng nghĩa trở thành phương tiện mới.
3. Canonical GID phải được duy trì qua vòng đời **Moving → Parked → Moving**.

## Tiêu đề
**Từ xe đi ngang đến trạng thái đỗ — và khôi phục ID khi rời ô**

## Frame
**Timeline / State Lifecycle**

```text
XE ĐI NGANG
    ↓
ARRIVAL CANDIDATE
    ↓
PARKED CONFIRMED
    ↓
G#1 ở trạng thái PARKED
    ↓
DEPARTURE DETECTED
    ↓
DEPARTURE TOKEN 5s
    ↓
Xe chỉ lùi lại căn chỉnh?
 ├─ YES → giữ nguyên G#1
 └─ NO
       ↓
   RE-ACQUIRE TRACK
       ↓
   Khớp với G#1 cũ
       ↓
   G#1 MOVING
       ↓
   RELEASE P056
```

## Arrival
- Polygon overlap giữa Vehicle Footprint và Slot Polygon.
- Yêu cầu **≥ 3 mẫu liên tiếp**.
- Vision confirmation: **≥ 2 lần trong 3 s**.
- Khi đủ điều kiện: `G#1 → P056 → PARKED`

## Departure
- Khi xe bắt đầu rời ô: `departure_pending`
- **Departure Token = 5 s**
- Nếu xe chỉ nhích ra để căn chỉnh → tái hấp thu ID cũ.
- Khi xác nhận rời thật → giải phóng ô.

## Khôi phục Canonical Global ID sau khi rời ô
Tên nên dùng:
**Departure Re-ID / ID Recovery after Departure**

Ý nghĩa:
- Khi xe đã đỗ lâu, motion detection có thể không còn track active.
- Khi xe chạy lại, track mới phải được nối về **Canonical GID cũ**.
- Không tạo `G#2` cho cùng một xe vật lý.

## Cơ chế logic gợi ý
1. Ưu tiên candidate xuất hiện gần **slot vừa lưu GID**.
2. Kiểm tra khoảng cách ground-plane.
3. Kiểm tra hướng rời ô.
4. Kiểm tra footprint / màu nếu cần.
5. Nếu khớp → nối lại `G#1`.
6. Sau đó mới tiếp tục Cross-Camera bình thường.

## Dòng chốt
**Rời ô không đồng nghĩa với tạo một phương tiện mới.**

## Lời thuyết trình
> “Khi xe đỗ, Local Track có thể trở nên dormant. Lúc xe chạy lại, hệ thống phải khôi phục Canonical GID cũ dựa trên trạng thái ô, vị trí mặt sàn và quỹ đạo rời ô. Mục tiêu là chiếc xe trước và sau khi đỗ vẫn là cùng một G#1.”

## Lưu ý
Nếu Departure Re-ID **chưa được code hoặc chưa được kiểm chứng**, phải trình bày đúng là:
- **cơ chế thiết kế cần bổ sung / kiểm chứng**,  
không nói như kết quả thực nghiệm đã hoàn tất.

---

# SLIDE 12 — THỰC NGHIỆM + ĐỐI CHỨNG + FAILURE

## Mục tiêu
Trả lời trực tiếp:
**“Hệ thống thực tế hoạt động đến đâu?”**

## Tiêu đề
**Kết quả thực nghiệm trên dữ liệu tầng hầm**

## Frame
**Results Dashboard**

```text
┌────────────────┬────────────────┬─────────────────┐
│    1,13 cm     │     25 FPS     │      19/20      │
│ geometry p50   │      CPU       │ event success   │
└────────────────┴────────────────┴─────────────────┘
```

## Dataset
- **3.827 frames**
- **153,08 s**
- **25 FPS**
- CPU phổ thông
- End-to-End latency: **169 ms**

## Geometry
- 945 cặp điểm
- p50 = **1,13 cm**
- p95 = **4,39 cm**

## Event Window Evaluation
- Window A: overlap ±2 s
- Window B: vùng cửa ô ±3 s
- Tổng: **19/20 session thành công**

## Failure Case
- 1 session thất bại do **lóa đèn pha cự ly gần trong overlap**.

## Lời thuyết trình
> “Nhóm không chỉ tính trung bình trên toàn bộ video vì phần lớn thời gian bãi xe là cảnh tĩnh. Thay vào đó, nhóm tập trung vào các Event Window có rủi ro cao nhất: vùng chuyển camera và vùng cửa ô đỗ. Trong 20 session hiện có, 19 session hoàn thành thành công.”

## Lưu ý khoa học
### Không biến 19/20 thành tuyên bố quá rộng
Nên nói:
> “Trong 20 session thử nghiệm, 19 session thành công.”

Không nên nói:
> “Hệ thống có độ tin cậy 95% trong mọi điều kiện.”

### Precision / Recall ở Ablation
Nếu chưa giải thích được:
- ground truth nào,
- TP/FP/FN định nghĩa ra sao,
- số mẫu,
- nhãn theo frame hay theo event,

thì **không nên dùng các số Precision/Recall này trong slide chính**.

### Kiểm tra `3.383 frames = 48,4%`
Nếu mẫu số là 3.827 frames:
\[
3383/3827 \approx 88,4\%
\]
Vì vậy **48,4% cần kiểm tra lại mẫu số**.

### Kiểm tra câu về Topology và FPS
Nếu bỏ Topology Gate làm FPS từ ~25 xuống ~15 thì đó là **tải tính toán tăng**, không phải “giảm tải”.

---

# SLIDE 13 — ĐÓNG GÓP + HẠN CHẾ + HƯỚNG PHÁT TRIỂN

## Mục tiêu
Kết thúc bằng: nhóm đóng góp gì, còn giới hạn gì, bước tiếp theo là gì.

## Tiêu đề
**Đóng góp nghiên cứu và hướng phát triển**

## Frame
**3 Contribution Cards + Limitation/Roadmap**

### Card 1 — Định vị mặt sàn
**Ground-plane Homography**
- Shared coordinate system
- p50 = **1,13 cm**

### Card 2 — Danh tính liên camera
**Canonical Global ID**
- Local IDs → Global ID
- Topology + Cost Matrix
- Handoff / overlap

### Card 3 — Quản lý ô đỗ
**Adaptive Slot Management**
- Adaptive Equalizer
- Majority Vote
- Arrival / Departure
- Vehicle ↔ Slot Binding

## Hạn chế
- Dataset hiện chủ yếu là **tầng hầm trong nhà**.
- Chưa chứng minh khả năng tổng quát cho ngoài trời.
- Gamma / CLAHE / voting cần calibration lại khi miền dữ liệu thay đổi.
- Baseline 1-camera vs 2-camera còn nên bổ sung.
- Nếu chưa có ground truth đầy đủ, chưa nên dùng MOTA / Precision / Recall như metric chính.
- Departure Re-ID cần được kiểm chứng riêng nếu chưa có thử nghiệm.

## Hướng phát triển
- N-camera.
- Nhiều tầng / nhiều khu vực.
- Dataset lớn hơn, nhiều loại xe hơn.
- Kiểm thử nhiều điều kiện ánh sáng.
- Tự động tuning tham số.
- Ground-truth annotation để tính metric chuẩn.
- Evaluation 1-camera vs multi-camera.
- Outdoor adaptation.

## Dòng kết
**Một xe thật → Một Canonical Global ID → Một tọa độ mặt sàn → Một trạng thái ô đỗ**

## Lời thuyết trình
> “Tóm lại, nghiên cứu tập trung vào ba đóng góp: đưa nhiều camera về một hệ tọa độ mặt sàn chung, duy trì một danh tính duy nhất cho phương tiện khi di chuyển giữa các camera, và liên kết danh tính đó với trạng thái ô đỗ. Kết quả hiện tại là bước kiểm chứng trong môi trường tầng hầm trong nhà, và hướng tiếp theo là mở rộng N-camera, dataset lớn hơn và đánh giá bằng ground truth đầy đủ.”


---

# 14. Những số liệu phải ghi rõ nguồn / loại tham số

Trong phần bảo vệ, nên phân biệt rõ 3 nhóm.

## A. Số liệu đo trực tiếp
- Homography p50 = **1,13 cm**
- Homography p95 = **4,39 cm**
- **945 cặp điểm**
- Skew p50 = **18 ms**
- Skew p95 = **47 ms**
- Max = **110 ms**
- **3.827 frames**
- **153,08 s**
- **25 FPS**
- **169 ms E2E**
- **19/20 session**

## B. Ngưỡng / tham số thiết kế
- Cost weights: `0.55 / 0.30 / 0.10 / 0.05`
- `cos(theta) < 0.25`
- Gamma / CLAHE
- Vote `5/9`
- Departure Token `5 s`
- Arrival `3 mẫu liên tiếp`

Với nhóm B phải nói rõ:
- tuning thực nghiệm,
- heuristic,
- hay kế thừa từ tài liệu.

## C. Con số cần kiểm tra lại
- `2×2×1×5 = 25` → **sai phép nhân, thực tế bằng 20**
- `3383/3827 = 48,4%` → **không khớp nếu dùng 3827 làm mẫu số**
- Precision/Recall trong Ablation → **cần ground truth rõ ràng**
- Câu “bỏ Topology nhưng giảm tải” → **cần sửa logic nếu FPS giảm**

---

# 15. Cách kể chuyện xuyên suốt khi thuyết trình

Không kể theo kiểu:

> Homography → MOG2 → Kalman → Cost Matrix → Equalizer...

Nên kể:

1. **Tầng hầm có vấn đề gì?**
2. **1 camera thử rồi gặp giới hạn gì?**
3. **Vì sao phải dùng nhiều camera?**
4. **Hai camera cùng nhìn một xe như thế nào?**
5. **Góc camera chéo xử lý ra sao?**
6. **Trong từng camera giữ Local ID thế nào?**
7. **Hai Local ID hợp nhất thành Global ID ra sao?**
8. **Khi nào mới chạy Cost Matrix?**
9. **Dựa vào đặc tính nào để matching?**
10. **Tại sao một threshold ánh sáng không đủ?**
11. **Tại sao vote 5/9?**
12. **Xe vào/rời ô và khôi phục ID thế nào?**
13. **Thực nghiệm chứng minh đến đâu và còn hạn chế gì?**

---

# 16. Workflow tạo slide nhanh bằng `ppt-mcp`

## Pass 1 — Theme
- 16:9
- Giữ màu xanh TechGAR
- Font thống nhất
- Header / số slide
- Tạo 5 layout family

## Pass 2 — Skeleton
Tạo đủ 13 slide:
- title,
- placeholder,
- chưa nhồi nội dung.

## Pass 3 — Visual
- ảnh thật,
- video overlap,
- shared map,
- diagram Cost Matrix,
- angle,
- voting grid,
- timeline vào/rời ô.

## Pass 4 — Text & Polish
- thêm text ngắn,
- kiểm tra overflow,
- giảm paragraph,
- kiểm tra font,
- kiểm tra số liệu.

## Prompt gợi ý cho `ppt-mcp`

```text
Open my existing TechGAR PowerPoint and rebuild it into a 13-slide
Vietnamese scientific research defense deck.

Keep the existing TechGAR blue visual identity, but DO NOT use the
same two-column layout on every slide.

Use a 16:9 layout and five reusable layout families:
1. Hero problem
2. Side-by-side comparison
3. Full-width process/pipeline
4. Large visual + compact formula/data panel
5. Results dashboard

Design principles:
- Scientific, clean, professional.
- One research question/message per slide.
- Minimal text; no long paragraphs.
- Prefer real experimental images over decorative stock images.
- Keep all important numbers large and visually prominent.
- Use the same typography, header and slide numbering across the deck.
- Do not invent experimental data.
- Preserve Vietnamese accents correctly.
- Add a short “Kết luận chính” takeaway at the bottom only where useful.

Slides:
1. Dẫn nhập – bài toán thực tế
2. 1 camera → multi-camera
3. Toàn bộ bài toán
4. Hai camera song song
5. Góc camera chéo / Homography
6. Local tracking
7. Cross-camera + short video + shared map
8. Topology + Cost Matrix + Angle
9. Adaptive Equalizer + parameter source
10. Vote threshold 5/9
11. Xe vào / rời ô đỗ + Departure Re-ID
12. Experimental results + comparison + failure case
13. Contributions + limitations + future work

Do not redesign everything at once.
First create the 13-slide skeleton and show slide previews.
Then build slides 1–4, review them, and continue in batches.
```

---

# 17. Checklist cuối trước khi bảo vệ

- [ ] Không còn “GPS = 0 dBm”.
- [ ] Không nói “triệt tiêu hoàn toàn parallax 3D”.
- [ ] Kiểm tra `3383 frames / mẫu số`.
- [ ] Kiểm tra lại công thức `2×2×1×5`.
- [ ] Làm rõ nguồn các trọng số Cost Matrix.
- [ ] Làm rõ nguồn các giá trị Gamma/CLAHE.
- [ ] Nếu nói 5/9 là tốt nhất → phải có threshold sweep.
- [ ] Nếu dùng Precision/Recall → phải có ground truth rõ ràng.
- [ ] Nếu so 1 camera vs 2 camera → phải có baseline thật.
- [ ] Cross-Camera phải trình bày theo **overlap song song**, không phải sơ đồ Cam1 → mất → Cam2.
- [ ] Slide 7 nên có video thật.
- [ ] Slide 8 phải có hình minh họa thuộc tính xe, không chỉ text.
- [ ] Slide 9 phải có ảnh tối / thường / lóa.
- [ ] Slide 11 phải có lifecycle Moving → Parked → Moving.
- [ ] Nếu Departure Re-ID chưa code → nói đúng là cơ chế thiết kế / hướng bổ sung.
- [ ] Slide 12 phải có failure case.
- [ ] Slide 13 phải có limitation, không chỉ thành tựu.
- [ ] Không dùng mọi slide cùng một frame chia đôi.

---

# 18. Câu chốt cuối bài

> **“TechGAR không chỉ phát hiện một chiếc xe trong từng khung hình; mục tiêu của hệ thống là duy trì danh tính của chiếc xe đó xuyên suốt không gian nhiều camera, đưa nó về tọa độ mặt sàn chung và liên kết nó với đúng trạng thái ô đỗ.”**
