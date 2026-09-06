# 📚 Tài Liệu Thuật Toán TechGAR

> **TechGAR** là hệ thống Quản lý Bãi đỗ xe Thông minh & Định vị Trong Bãi, sử dụng các thuật toán AI và đồ thị để theo dõi xe, phát hiện chỗ đỗ, và hướng dẫn lộ trình.

---

## Mục Lục

1. [Dijkstra - Tìm Đường Đi Ngắn Nhất](#1-thuật-toán-dijkstra---tìm-đường-đi-ngắn-nhất)
2. [YOLO + BoT-SORT - Phát Hiện & Theo Dõi Xe](#2-yolo--bot-sort---phát-hiện-và-theo-dõi-xe)
3. [Ensemble Parking Detection - Phát Hiện Chỗ Đỗ Trống/Đầy](#3-ensemble-parking-detection---phát-hiện-chỗ-đỗ-trốngđầy)
4. [Slot-Vehicle Binding - Ghép Xe Với Chỗ Đỗ](#4-slot-vehicle-binding---ghép-xe-với-chỗ-đỗ)
5. [Deep Re-ID (CNN) - Nhận Dạng Xe Qua Hình Dáng](#5-deep-re-id-cnn---nhận-dạng-xe-qua-hình-dáng)
6. [Cross-Camera Manager - Quản Lý Nhiều Camera](#6-cross-camera-manager---quản-lý-nhiều-camera)
7. [Tổng Kết Luồng Dữ Liệu](#7-tổng-kết-luồng-dữ-liệu)

---

## 1. Thuật Toán Dijkstra - Tìm Đường Đi Ngắn Nhất

### 🎯 Mục Đích
Khi xe vào bãi đỗ, hệ thống cần tìm **đường đi ngắn nhất** từ cổng vào đến chỗ đỗ được chỉ định, hoặc từ chỗ đỗ đến cổng ra.

### 💡 Ý Nghĩa
- **Tối ưu thời gian**: Xe di chuyển theo lộ trình ngắn nhất
- **Hiệu quả**: Giảm tắc nghẽn trong bãi đỗ
- **Thông minh**: Có thể điều chỉnh lộ trình khi xe di chuyển

### 🔧 Cách Triển Khai

#### Bước 1: Xây Dựng Đồ Thị (Lane Graph)
```
Đồ thị gồm:
- NODES (Đỉnh): Các điểm trên đường (giao lộ, cổng, điểm vào ô đỗ)
- EDGES (Cạnh): Đoạn đường nối giữa các đỉnh
```

```
                    ┌─────────────────────────────┐
                    │         LANE GRAPH         │
                    │                           │
    [Cổng Vào]─────┼────[Junction]─────────────┼────[Cổng Ra]
                    │      │    │    │           │
              ──────┼──────┼────┼────┼─────────┼──────
                    │      │    │    │           │
              ──────┼──────┼────┼────┼─────────┼──────
                    │      │    │    │           │
                    │      ▼    ▼    ▼           │
                    │   [Spot Entry Nodes]        │
                    │   (Điểm vào từng ô đỗ)    │
                    └─────────────────────────────┘
```

#### Bước 2: Thuật Toán Dijkstra
```typescript
// Pseudo-code cho Dijkstra
function findRoute(graph, startNodeId, endNodeId):
    // Khởi tạo
    distances[node] = Infinity cho tất cả node
    distances[startNodeId] = 0
    previous[node] = null cho tất cả node
    unvisited = tất cả các node

    while unvisited không trống:
        // Chọn node có khoảng cách nhỏ nhất (chưa thăm)
        current = node có distances nhỏ nhất trong unvisited

        if current == endNodeId:
            break  // Đã tìm thấy đường đi

        unvisited.remove(current)

        // Cập nhật khoảng cách cho các node láng giềng
        for each neighbor của current:
            if neighbor trong unvisited:
                alt = distances[current] + edge.distance(current, neighbor)
                if alt < distances[neighbor]:
                    distances[neighbor] = alt
                    previous[neighbor] = current

    // Truy vết lại đường đi
    path = []
    current = endNodeId
    while current != null:
        path.insert(0, current)
        current = previous[current]

    return path
```

#### Bước 3: Tính Năng Đặc Biệt

```typescript
// 1. Tính đường động từ vị trí hiện tại của xe
function findRouteFromVehiclePosition(vehicleX, vehicleY, targetSpotId):
    // Tạo node tạm cho vị trí xe
    vehicleNode = { id: "vehicle-pos", x: vehicleX, y: vehicleY }

    // Thêm cạnh tạm từ xe đến 2 node gần nhất
    nearestNodes = find2NearestNodes(vehicleX, vehicleY)

    // Tính đường đi
    return findRoute(tempGraph, vehicleNode, targetNodeId)

// 2. Tính đường ra (2 chiều vì có thể đi ngược)
function findExitRoute(spotId):
    // Chuyển tất cả cạnh thành 2 chiều
    twoWayGraph = convertEdgesToTwoWay(graph)
    return findRoute(twoWayGraph, spotEntryNode, exitNode)
```

### 📊 Ví Dụ Minh Họa
```
Xe muốn đỗ ở ô A05:

1. Tìm node gần xe nhất → "right-150"
2. Tạo đồ thị tạm thời với vị trí xe
3. Chạy Dijkstra: Cổng vào → right-350 → right-300 → ... → right-150 → A05
4. Trả về lộ trình: [entrance, right-350, right-300, right-250, right-200, right-150, spot-A05]

Khoảng cách tổng: 850 pixels
```

---

## 2. YOLO + BoT-SORT - Phát Hiện và Theo Dõi Xe

### 🎯 Mục Đích
- **Phát hiện**: Tìm vị trí tất cả xe trong frame camera
- **Theo dõi**: Giữ nguyên ID cho cùng một xe qua các frame

### 💡 Ý Nghĩa
- **Theo dõi liên tục**: Không mất dấu xe khi di chuyển
- **Nhận diện đúng xe**: Biết xe nào đang ở đâu
- **Xử lý che khuất**: Vẫn theo dõi được khi xe bị che một phần

### 🔧 Cách Triển Khai

#### A. YOLO (You Only Look Once)
```
┌─────────────────────────────────────────────────────────────┐
│                    YOLO DETECTION                           │
│                                                             │
│   Input Frame          Model Output          Bounding Boxes  │
│   ┌─────────┐         ┌─────────┐          ┌───────────┐   │
│   │  Ảnh    │──────▶  │ YOLOv8  │──────▶   │ [x1,y1,x2,y2] │
│   │ Camera  │         │ Network │          │ Confidence│   │
│   └─────────┘         └─────────┘          │ Class ID  │   │
│                                              └───────────┘   │
│   Classes phát hiện:                                       │
│   - Car (ID: 2)                                            │
│   - Motorcycle (ID: 3)                                      │
│   - Bus (ID: 5)                                            │
│   - Truck (ID: 7)                                           │
└─────────────────────────────────────────────────────────────┘
```

#### B. BoT-SORT Tracker
```
┌─────────────────────────────────────────────────────────────┐
│                    BOT-SORT TRACKING                       │
│                                                             │
│  Frame N                           Frame N+1               │
│  ┌─────────┐                       ┌─────────┐             │
│  │ Xe #12  │─────── Chuyển động ──▶│ Xe #12  │             │
│  │ (200,150)│◀─────── Dự đoán ──────│ (205,155)│            │
│  └─────────┘                       └─────────┘             │
│       │                                    │                │
│       ▼                                    ▼                │
│  ┌──────────────────────────────────────────────┐           │
│  │              IoU MATCHING                    │           │
│  │                                               │           │
│  │   Predicted: (205,155)                       │           │
│  │   Detected:  (203,157) ──▶ IoU = 0.85      │           │
│  │   → Match! Giữ ID #12                        │           │
│  └──────────────────────────────────────────────┘           │
└─────────────────────────────────────────────────────────────┘
```

#### C. Mã Nguồn Chính
```python
class VehicleTracker:
    def process_frame(self, frame):
        # 1. Phát hiện xe bằng YOLO
        results = self.model.track(frame, tracker=self.tracker_config)

        # 2. Cập nhật track cho mỗi xe phát hiện được
        for box, track_id, conf, class_id in detections:
            self._update_track(track_id, box, conf, class_id, appearance)

        # 3. Đánh dấu xe không còn thấy
        expired = self._age_missing_tracks(visible_ids)

        return self._tracks, debug_mask, expired

    def _update_track(self, track_id, xyxy, conf, class_id, appearance):
        # Tính điểm tiếp xúc mặt đường (ground point)
        ground_point = self._bottom_center(x1, y1, x2, y2)

        # Cập nhật hoặc tạo mới track
        if track_id not in self._tracks:
            self._tracks[track_id] = TrackedVehicle(
                track_id=track_id,
                cx=ground_point[0], cy=ground_point[1],
                status=TrackStatus.CONFIRMED
            )
        else:
            # Cập nhật vị trí
            self._tracks[track_id].cx = ground_point[0]
            self._tracks[track_id].cy = ground_point[1]
            self._tracks[track_id].history.append(ground_point)
```

#### D. Trạng Thái Track
```
┌─────────────────────────────────────────────────────────┐
│              TRACK STATUS LIFECYCLE                     │
│                                                         │
│   ┌──────────┐    2+ frames    ┌───────────┐          │
│   │ TENTATIVE │ ──────────────▶ │ CONFIRMED │          │
│   │ (Thử)    │                 │ (Xác nhận)│          │
│   └──────────┘                 └───────────┘          │
│         │                            │                  │
│         │  Không thấy > TTL          │                  │
│         ▼                            ▼                  │
│   ┌──────────┐               ┌───────────┐            │
│   │ EXPIRED  │               │   LOST    │            │
│   └──────────┘               │ (Mất dấu) │            │
│                              └───────────┘            │
│                                                             │
│  TTL (Time To Live) = 90 frames (~3 giây)                  │
└─────────────────────────────────────────────────────────┘
```

---

## 3. Ensemble Parking Detection - Phát Hiện Chỗ Đỗ Trống/Đầy

### 🎯 Mục Đích
Tự động phát hiện ô đỗ nào có xe (đầy) và ô nào trống, sử dụng **hình ảnh từ camera**.

### 💡 Ý Nghĩa
- **Tự động hóa**: Không cần cảm biến vật lý tại mỗi ô
- **Chính xác**: Kết hợp nhiều phương pháp để giảm lỗi
- **Ổn định**: Temporal smoothing giảm flickering

### 🔧 Cách Triển Khai

#### A. Tổng Quan Ensemble
```
┌────────────────────────────────────────────────────────────────┐
│                    ENSEMBLE VOTING SYSTEM                       │
│                                                                 │
│   Frame                                                        │
│     │                                                         │
│     ▼                                                         │
│   ┌─────────────────────────────────────────────────────────┐  │
│   │              25 Combinations (5×5)                       │  │
│   │                                                         │  │
│   │   Gamma: [-0.2, -0.1, 0.0, +0.1, +0.2]                │  │
│   │       ×                                                   │  │
│   │   CLAHE: [-0.5, -0.2, 0.0, +0.2, +0.5]                │  │
│   │                                                         │  │
│   │   = 25 biến thể xử lý ảnh                              │  │
│   └─────────────────────────────────────────────────────────┘  │
│                          │                                    │
│                          ▼                                    │
│   ┌─────────────────────────────────────────────────────────┐  │
│   │                 VOTE COUNTING                           │  │
│   │                                                          │  │
│   │   Slot A01: 18/25 votes "EMPTY" → EMPTY                 │  │
│   │   Slot A02: 7/25 votes "EMPTY"  → OCCUPIED              │  │
│   │   Slot A03: 25/25 votes "EMPTY" → EMPTY                 │  │
│   └─────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────┘
```

#### B. Chi Tiết Xử Lý Mỗi Combination
```python
def detect_slot_occupancy(frame, slot_polygon):
    # 1. Chuyển đổi không gian màu
    lab = cv2.cvtColor(frame, cv2.COLOR_BGR2LAB)
    l_channel = lab[:, :, 0]  # Lấy kênh độ sáng

    # 2. Áp dụng CLAHE (cải thiện tương phản)
    clahe = cv2.createCLAHE(clipLimit=clahe_value, tileGridSize=(8, 8))
    enhanced = clahe.apply(l_channel)

    # 3. Áp dụng Gamma Correction
    gamma_corrected = LUT(enhanced, gamma_lut)

    # 4. Adaptive Threshold
    blurred = cv2.GaussianBlur(gamma_corrected, (3, 3), 1)
    threshold = cv2.adaptiveThreshold(
        blurred, 255,
        cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY_INV, 25, 16
    )

    # 5. Morphological operations
    threshold = cv2.dilate(cv2.medianBlur(threshold, 5), kernel)

    # 6. Đếm pixel trắng trong vùng ô đỗ
    slot_pixels = cv2.bitwise_and(threshold, threshold, mask=slot_mask)
    white_ratio = countNonZero(slot_pixels) / slot_area

    # 7. Quyết định
    return white_ratio < RATIO_THRESH  # True = EMPTY
```

#### C. Pass Cứu Trợ (Rescue Passes)

```
┌────────────────────────────────────────────────────────────────┐
│                     RESCUE PASSES                              │
│                                                                 │
│  PASS 1: Center Cluster Rescue                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                                                         │   │
│  │    Trước:                        Sau:                  │   │
│  │    ┌─────────┐                   ┌─────────┐           │   │
│  │    │ ░░░░░░ │                   │ ████████│           │   │
│  │    │ ░ xe ░ │ ──── Cứu ────▶   │ █ xe ██ │           │   │
│  │    │ ░░░░░░ │                   │ ████████│           │   │
│  │    └─────────┘                   └─────────┘           │   │
│  │                                                         │   │
│  │   Xe trắng bị miss ở giữa     → Được phát hiện        │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  PASS 2: Edge Recheck                                          │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                                                         │   │
│  │    Canny Edge Detection để phát hiện viền xe           │   │
│  │                                                         │   │
│  │    edge_ratio = edge_pixels / slot_area                │   │
│  │    if edge_ratio > 0.25 and was_empty:                 │   │
│  │        mark_as_occupied()  # Có xe!                    │   │
│  └─────────────────────────────────────────────────────────┘   │
└────────────────────────────────────────────────────────────────┘
```

#### D. Temporal Smoothing
```python
class TemporalSmoother:
    """
    Ngăn flickering bằng cách yêu cầu N frame liên tiếp
    xác nhận cùng trạng thái trước khi thay đổi.
    """
    def __init__(self, num_slots, required_frames=5):
        self.required = required_frames
        self.counters = [0] * num_slots
        self.pending = [None] * num_slots
        self.confirmed = [False] * num_slots

    def update(self, slot_idx, is_occupied):
        if self.pending[slot_idx] == is_occupied:
            self.counters[slot_idx] += 1
        else:
            self.pending[slot_idx] = is_occupied
            self.counters[slot_idx] = 1

        # Chỉ thay đổi khi đủ frame xác nhận
        if self.counters[slot_idx] >= self.required:
            self.confirmed[slot_idx] = is_occupied

        return self.confirmed[slot_idx]
```

---

## 4. Slot-Vehicle Binding - Ghép Xe Với Chỗ Đỗ

### 🎯 Mục Đích
Ghép **ID xe** (từ tracker) với **ô đỗ** (từ detector) để biết chính xác xe nào đang đỗ ở ô nào.

### 💡 Ý Nghĩa
- **Ràng buộc chính xác**: Biết "Xe #12 đang đỗ ở ô A01"
- **Chống nhiễu**: Sticky ID giữ nguyên khi tracker mất dấu
- **Phục hồi thông minh**: Giữ ID khi xe di chuyển ra khỏi ô

### 🔧 Cách Triển Khai

#### A. Ràng Buộc Hai Chiều
```
┌────────────────────────────────────────────────────────────────┐
│                  TWO-WAY BINDING                               │
│                                                                 │
│   Vision Detection          │       Motion Tracking             │
│   ┌──────────────┐         │       ┌──────────────┐           │
│   │ Slot A01     │         │       │ Vehicle #12  │           │
│   │ occupied=True│◀────────┼───────▶│ position     │           │
│   └──────────────┘         │       └──────────────┘           │
│          │                  │              │                   │
│          ▼                  │              ▼                   │
│   ┌──────────────┐         │       ┌──────────────┐           │
│   │ SlotBinding  │◀────────┼───────▶│ VehicleState │           │
│   │ vehicle_id=12│         │       │ slot_id="A01"│           │
│   └──────────────┘         │       └──────────────┘           │
│                                                                 │
│   Ràng buộc: Vehicle #12 ↔ Slot A01                            │
└────────────────────────────────────────────────────────────────┘
```

#### B. Arrival Detection (Khi Xe Vào Ô)
```python
def _record_arrival_claim(global_id, slot_id, bbox, overlap, timestamp):
    """
    Ghi nhận xe có khả năng đỗ vào ô đỗ
    """
    key = (slot_id, global_id)

    if not has_arrival_claim(key):
        # Tạo claim mới
        claim = ArrivalClaim(
            slot_id=slot_id,
            global_id=global_id,
            first_seen_s=timestamp,
            first_center=center,
            max_overlap=overlap,
            score=0.0
        )
    else:
        # Cập nhật claim hiện tại
        claim = get_claim(key)
        claim.observations += 1
        claim.max_overlap = max(claim.max_overlap, overlap)

    # Tính score dựa trên nhiều yếu tố
    claim.score = (
        0.55 * min(1.0, claim.max_overlap)              # Độ chồng lấn
        + 0.20 * min(1.0, claim.observations / 3)        # Số lần quan sát
        + 0.15 * min(1.0, inward_progress / 0.10)        # Tiến vào trong
        + 0.10 * min(1.0, overlap_progress / 0.15)       # Tăng overlap
    )

def _try_commit_arrival_claim(slot_id, timestamp):
    """
    Thử commit khi Vision xác nhận ô đỗ có xe
    """
    # Yêu cầu:
    # 1. Vision xác nhận occupied ≥ 2 lần
    # 2. Claim có ≥ 3 observations
    # 3. Overlap ≥ 35%
    # 4. Có chuyển động vào trong (inward trajectory)

    if vision_occupied_streak >= 2 and observations >= 3:
        bind_vehicle(global_id, slot_id)
```

#### C. Sticky ID & Recovery
```
┌────────────────────────────────────────────────────────────────┐
│                  STICKY ID MECHANISM                           │
│                                                                 │
│  Tình huống: Xe đỗ trong ô, tracker mất dấu (bóng râm, ...)   │
│                                                                 │
│  ┌──────────┐    Frame N+5    ┌──────────┐                    │
│  │ Vision:  │   ────────────▶ │ Vision:  │                    │
│  │ A01=Yes  │                 │ A01=Yes  │                    │
│  │ Tracker: │                 │ Tracker: │                    │
│  │ Lost #12 │                 │ Lost #12 │                    │
│  └──────────┘                 └──────────┘                    │
│       │                             │                          │
│       ▼                             ▼                          │
│  vehicle_id vẫn giữ         vehicle_id vẫn giữ                │
│  = #12 (sticky)              = #12 (sticky)                  │
│                                                                 │
│  → Sticky ID giữ nguyên cho đến khi Vision xác nhận trống     │
└────────────────────────────────────────────────────────────────┘
```

#### D. Departure Token (Khi Xe Ra)
```python
def on_vehicle_exit(binding, global_id, timestamp):
    """
    Khi xe rời ô đỗ, tạo Departure Token
    để bảo vệ ID trong thời gian phục hồi
    """
    token = DepartureToken(
        slot_id=binding.slot_id,
        global_id=global_id,
        created_at_s=timestamp,
        expires_at_s=timestamp + 5.0,  # 5 giây
        polygon=binding.polygon,
        candidates={}  # Các fragment có thể là xe này
    )

    # Bảo vệ ID khỏi bị gán cho xe khác
    protected_ids.add(global_id)

    # Khi Vision xác nhận trống, ID được giải phóng
    if vision_confirms_empty(token):
        release_id(global_id)
```

---

## 5. Deep Re-ID (CNN) - Nhận Dạng Xe Qua Hình Dáng

### 🎯 Mục Đích
Khi xe đi qua nhiều camera, dùng **hình dáng xe** để nhận ra đó là cùng một xe.

### 💡 Ý Nghĩa
- **Không phụ thuộc biển số**: Nhận dạng qua hình dáng
- **Cross-camera**: Theo dõi xe khi chuyển camera
- **Phục hồi ID**: Lấy lại ID khi bị mất

### 🔧 Cách Triển Khai

#### A. Kiến Trúc CNN
```
┌────────────────────────────────────────────────────────────────┐
│                    LIGHTWEIGHT RE-ID CNN                       │
│                                                                 │
│   Input: 64×64 RGB crop của xe                                 │
│                                                                 │
│   ┌─────────────────────────────────────────────────────────┐  │
│   │  Conv2d(3→32) → BN → ReLU → MaxPool(2)    → 32×32     │  │
│   │  Conv2d(32→64) → BN → ReLU → MaxPool(2)   → 16×16     │  │
│   │  Conv2d(64→128) → BN → ReLU               → 16×16      │  │
│   │  Conv2d(128→256) → BN → ReLU              → 16×16      │  │
│   │  AdaptiveAvgPool(1)                        → 256       │  │
│   │  Linear(256→128) → BN → ReLU               → 128       │  │
│   └─────────────────────────────────────────────────────────┘  │
│                              │                                 │
│                              ▼                                 │
│                     128-D Feature Vector                      │
│                     (L2 Normalized)                           │
└────────────────────────────────────────────────────────────────┘
```

#### B. Trích Xuất và So Sánh
```python
class DeepReIDExtractor:
    def extract(self, vehicle_crop):
        """
        Trích xuất 128-D feature vector từ ảnh xe
        """
        # Preprocess: Resize → RGB → Normalize → Tensor
        tensor = self._preprocess(vehicle_crop, size=(64, 64))

        # Forward pass
        with torch.no_grad():
            feature = self.model(tensor)

        # L2 normalize
        feature = F.normalize(feature, p=2, dim=1)

        return feature.numpy()

    @staticmethod
    def distance(feature_a, feature_b):
        """
        Tính khoảng cách cosine (1 - cosine_similarity)
        Giá trị càng nhỏ = hai xe càng giống nhau
        """
        cosine = (a · b) / (||a|| × ||b||)
        return 1.0 - cosine

# Ví dụ sử dụng:
feat1 = extractor.extract(vehicle_image_1)  # Camera 1
feat2 = extractor.extract(vehicle_image_2)  # Camera 2

dist = DeepReIDExtractor.distance(feat1, feat2)
# dist < 0.55 → Cùng một xe
# dist ≥ 0.55 → Xe khác nhau
```

---

## 6. Cross-Camera Manager - Quản Lý Nhiều Camera

### 🎯 Mục Đích
Khi bãi đỗ có **nhiều camera**, đảm bảo xe chỉ có **một ID duy nhất** và theo dõi được khi chuyển vùng.

### 💡 Ý Nghĩa
- **Tránh trùng lặp ID**: Xe không bị gán 2 ID khác nhau
- **Chuyển vùng mượt**: Theo dõi xe khi ra khỏi tầm một camera
- **Phối hợp**: Camera Biên đợi camera Trong xác nhận trước khi gán ID mới

### 🔧 Cách Triển Khai

#### A. Kiến Trúc Tổng Quan
```
┌─────────────────────────────────────────────────────────────────────┐
│                     CROSS-CAMERA ARCHITECTURE                       │
│                                                                     │
│    Camera Biên (Entry/Exit)          Camera Trong (Inside)         │
│    ┌─────────────────────┐          ┌─────────────────────┐        │
│    │                     │          │                     │        │
│    │   Phát hiện xe      │          │   Phát hiện xe      │        │
│    │   tại cổng          │          │   trong bãi         │        │
│    │                     │          │                     │        │
│    │   Gán Provisional ID │◀─────────│  Ghép với ID toàn  │        │
│    │   (chờ xác nhận)    │          │  cục (Global ID)    │        │
│    │                     │          │                     │        │
│    └──────────┬──────────┘          └──────────┬──────────┘        │
│               │                                  │                  │
│               └──────────────┬───────────────────┘                  │
│                              │                                      │
│                              ▼                                      │
│                   ┌─────────────────────┐                           │
│                   │                     │                           │
│                   │  CrossCameraManager │                           │
│                   │                     │                           │
│                   │  - Đồng bộ ID      │                           │
│                   │  - Chuyển giao xe   │                           │
│                   │  - Phân xử xung đột │                           │
│                   │                     │                           │
│                   └─────────────────────┘                           │
└─────────────────────────────────────────────────────────────────────┘
```

#### B. Provisional ID Reservation
```python
class CrossCameraManager:
    def request_provisional_id(self, camera_id, slot_id, appearance, bbox):
        """
        Camera biên xin cấp Provisional ID
        """
        # 1. Tìm Global ID gần nhất trong gallery
        nearest = self._find_similar_id_in_gallery(appearance)

        if nearest:
            # Đã có xe trong gallery → Cấp provisional cho xe đó
            provisional_id = nearest.global_id
        else:
            # Chưa có → Tạo provisional ID mới
            provisional_id = self._generate_provisional_id()

        # 2. Đánh dấu slot là "chờ xác nhận"
        self._pending_slots[slot_id] = {
            'provisional_id': provisional_id,
            'camera_id': camera_id,
            'appearance': appearance,
            'expires_at': time.time() + 2.0  # 2 giây
        }

        return provisional_id

    def confirm_provisional_id(self, slot_id, global_id):
        """
        Camera trong xác nhận → Provisional trở thành Global
        """
        pending = self._pending_slots.get(slot_id)
        if pending and pending['provisional_id'] == global_id:
            # Nâng cấp lên Global ID
            self._promote_to_global(global_id, pending['appearance'])
            del self._pending_slots[slot_id]
```

#### C. Handoff Protocol
```
┌────────────────────────────────────────────────────────────────┐
│                     HANDOFF PROTOCOL                           │
│                                                                 │
│  Camera Biên                  Camera Trong                     │
│      │                             │                            │
│      │  1. Phát hiện xe mới        │                            │
│      │─────────────────────────────▶│                            │
│      │                             │                            │
│      │  2. Request Provisional ID  │                            │
│      │─────────────────────────────▶│                            │
│      │                             │                            │
│      │  3. Provisional ID #99      │                            │
│      │◀─────────────────────────────│                            │
│      │                             │                            │
│      │  4. Xe đi vào trong bãi     │                            │
│      │         ...                 │                            │
│      │                             │                            │
│      │  5. Camera trong thấy xe    │                            │
│      │     với Provisional #99      │                            │
│      │─────────────────────────────▶│                            │
│      │                             │                            │
│      │  6. Confirm → Global #99    │                            │
│      │◀─────────────────────────────│                            │
│      │                             │                            │
└────────────────────────────────────────────────────────────────┘
```

---

## 7. Tổng Kết Luồng Dữ Liệu

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           DATA FLOW OVERVIEW                                 │
│                                                                             │
│                                                                             │
│   ┌─────────────┐                                                          │
│   │   CAMERA    │                                                          │
│   │   FRAMES    │                                                          │
│   └──────┬──────┘                                                          │
│          │                                                                 │
│          ├──────────────────────────┬───────────────────────────────────────┤
│          │                          │                                       │
│          ▼                          ▼                                       │
│   ┌─────────────┐           ┌─────────────┐                                 │
│   │    YOLO     │           │   Parking   │                                 │
│   │  Detector   │           │  Detector   │                                 │
│   │             │           │  (Ensemble) │                                 │
│   └──────┬──────┘           └──────┬──────┘                                 │
│          │                          │                                       │
│          ▼                          │                                       │
│   ┌─────────────┐                   │                                       │
│   │  BoT-SORT  │                   │                                       │
│   │  Tracker   │                   │                                       │
│   │             │                   │                                       │
│   └──────┬──────┘                   │                                       │
│          │                          │                                       │
│          ├──────────────────────────┴───────────────────────────────────────┤
│          │                                                                   │
│          ▼                                                                   │
│   ┌─────────────────────────────────────────┐                               │
│   │        SLOT-VEHICLE BINDER              │                               │
│   │                                          │                               │
│   │   • Arrival Detection                   │                               │
│   │   • Sticky ID                           │                               │
│   │   • Departure Token                     │                               │
│   │   • Recovery                            │                               │
│   └──────────────────┬──────────────────────┘                               │
│                      │                                                      │
│          ┌───────────┴───────────┐                                          │
│          │                       │                                          │
│          ▼                       ▼                                          │
│   ┌─────────────┐        ┌─────────────┐                                   │
│   │  REST API   │        │   WebSocket │                                   │
│   │  (Port 8000)│        │  (Real-time)│                                   │
│   └──────┬──────┘        └──────┬──────┘                                   │
│          │                      │                                           │
│          └──────────┬───────────┘                                           │
│                     │                                                       │
│                     ▼                                                       │
│            ┌─────────────┐                                                  │
│            │  FRONTEND   │                                                  │
│            │             │                                                  │
│            │  • Canvas   │                                                  │
│            │  • Routing  │                                                  │
│            │  • Voice    │                                                  │
│            └─────────────┘                                                  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Bảng Tổng Hợp Thuật Toán

| # | Thuật Toán | Input | Output | Đặc Điểm Nổi Bật |
|---|-----------|-------|--------|------------------|
| 1 | **Dijkstra** | Đồ thị làn đường, điểm đầu/cuối | Lộ trình ngắn nhất | Re-routing động |
| 2 | **YOLO + BoT-SORT** | Frame camera | Danh sách xe + ID | Theo dõi thời gian thực |
| 3 | **Ensemble Detection** | Frame camera | Trạng thái ô đỗ | 25 biến thể vote |
| 4 | **Slot-Vehicle Binding** | Xe + Ô đỗ | Ràng buộc xe-ô | Sticky ID, Recovery |
| 5 | **Deep Re-ID (CNN)** | Ảnh xe crop | Vector 128-D | Nhận dạng cross-camera |
| 6 | **Cross-Camera Manager** | Nhiều camera | ID toàn cục | Provisional ID, Handoff |

---

## Tài Liệu Tham Khảo

- **YOLO**: Ultralytics YOLOv8 - Real-time Object Detection
- **BoT-SORT**: https://github.com/Mahaaaaa-98/BoT-SORT
- **Dijkstra**: Cormen, Leiserson, Rivest, Stein - Introduction to Algorithms
- **CNN Re-ID**: OSNet - Omni-Scale Feature Learning for Person Re-Identification

---

*Document này được viết để giải thích các thuật toán trong TechGAR một cách trực quan và dễ hiểu. Nếu cần chi tiết thêm, vui lòng tham khảo mã nguồn.*
