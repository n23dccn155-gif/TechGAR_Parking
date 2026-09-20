# TechGAR 13-slide — Layout Rotation (academic-structure)
> Mục tiêu: chứng minh 5 layout family được **luân phiên**, không dùng 1 frame cho mọi slide (brief §1 + checklist §17).
> 5 family: **A** = Hero Problem · **B** = Comparison 50/50 · **C** = Full-width Pipeline · **D** = Large Visual + Formula/Data Panel · **E** = Results Dashboard.

## Chuỗi rotation
```
S1 A → S2 B → S3 C → S4 B → S5 D → S6 C → S7 D → S8 B → S9 D → S10 E → S11 C → S12 E → S13 B
```
- **Không có 2 slide liền kề cùng family** (kiểm tra cặp: A-B, B-C, C-B, B-D, D-C, C-D, D-B, B-D, D-E, E-C, C-E, E-B — tất cả khác nhau).
- **Phân bố:** A=1 · B=4 (S2,S4,S8,S13) · C=3 (S3,S6,S11) · D=3 (S5,S7,S9) · E=2 (S10,S12). Cả 5 family đều xuất hiện.

## Bảng chi tiết
| Slide | Title (rút gọn) | Family | Lý do chọn (khớp brief) | Asset chiếm diện tích chính |
|---|---|---|---|---|
| 1 | Định vị phương tiện & quản lý ô đỗ | **A** Hero Problem | Brief chỉ định "Hero Problem Layout" — ảnh lớn + vấn đề + câu hỏi lớn mở đầu | `slide1_overview_annotated.jpg` (ảnh hero ~60%) + panel vấn đề |
| 2 | Tại sao 1 camera chưa đủ | **B** Comparison 50/50 | Brief "Comparison 50/50" — so 1-cam ✕ vs multi-cam ✓ để ra quyết định thiết kế | `frame_0336_..._split_debug.jpg` + `slide2_cam1_blind/cam2_sees` (2 cột 50/50) |
| 3 | Từ video → quyết định ô đỗ | **C** Full-width Pipeline | Brief "Full-width Process/Pipeline" — 8 tầng dọc toàn bộ hệ thống | Diagram pipeline full-width + `lane_graph_spots.png`, `roi_active_map.png` |
| 4 | Hai camera cùng lúc | **B** Comparison 50/50 _(dual-view)_ | Brief "Dual-view 50/50" — 2 feed cùng timestamp t chứng minh quan sát song song | `frame_0283_..._split_debug.jpg` (2 panel cam1/cam2 ~50/50) + số skew |
| 5 | Góc chéo → Homography | **D** Large Visual + Formula/Data | Brief "Before→Transform→After" — ảnh xiên + công thức H + metrics | `calib_cam1/2_marked.png` (before) + `shared_map_full_view.png` (after) + panel công thức |
| 6 | Duy trì Local ID | **C** Full-width Pipeline _(dải ngang 3 trạng thái)_ | Brief "3 tình huống theo hàng ngang" — đọc trái→phải như tiến trình moving→che→dừng→reacquire | `slide6_moving/occluded/stopped.jpg` (3 panel full-width) + clips `demo_tracking_*` |
| 7 | 1 xe — 2 quan sát — 1 GID | **D** Large Visual + Formula/Data | Brief "65% video + 35% map" — video overlap lớn + map panel | `demo_overlap_split.mp4` (~65%) + `roi_active_map.png` (~35%) |
| 8 | Khi nào 2 track = 1 xe | **B** Comparison 50/50 _(topology | cost+angle)_ | Brief "Diagram lớn + formula panel" — tách trái Topology Gate / phải Cost Matrix+Angle | `lane_graph.png` + `slide8_car_crop.png` + panel công thức (2 vùng 50/50) |
| 9 | 1 bộ tham số cố định | **D** Large Visual + Formula/Data | Brief "3 điều kiện ánh sáng + bảng tham số" — 3 ảnh lớn + bảng điều kiện→hiệu ứng & ensemble 25 biến thể γ×CLAHE | `slide9_dark/normal/glare.jpg` (3 ảnh ~60%) + bảng điều kiện→hiệu ứng / tham số nền (~40%) |
| 10 | Vote ≥12/25 | **E** Results Dashboard | Brief "Visual voting grid" — vote tiles lớn (15/25 → FREE vs 10/25 → OCCUPIED) + công thức ΣV_empty≥12/25, ít chữ | Voting grid 5×5 = 25 biến thể (diagram lớn) + tile số 15/25·10/25 + `slide10_slot_closeup.jpg` |
| 11 | Xe vào/rời ô + Re-ID | **C** Full-width Pipeline _(lifecycle timeline)_ | Brief "Timeline/State Lifecycle" — chuỗi trạng thái Moving→Parked→Moving→Re-ID | Timeline lifecycle full-width + `frame_0278/0543/0705_*` + `clip_s11_park_cycle.mp4` |
| 12 | Kết quả thực nghiệm | **E** Results Dashboard | Brief "Results Dashboard" — 3 metric tiles lớn + dataset + failure | Tiles 1,13cm·25FPS·19/20 + `slide12_failure_gid4_f1182.jpg` + `slide12_glare_context_f0005.jpg` |
| 13 | Đóng góp + hướng phát triển | **B** Comparison 50/50 _(contributions | limitations)_ | Brief "3 Contribution Cards + Limitation/Roadmap" — trái 3 card / phải hạn chế+lộ trình | `web_dashboard_desktop.png`+`web_navigation_c06.png`+`web_mobile_nav.png`+`roi_full_view.png` (panel card) |

## Biến thể trong cùng family (tránh cảm giác lặp)
- **B (Comparison 50/50):** S2 = đối chiếu ưu/nhược để ra quyết định · S4 = dual-view đồng bộ 2 feed · S8 = split cơ chế (gate | cost) · S13 = split đóng góp | hạn chế. → Cùng khung 50/50 nhưng vai trò khác nhau.
- **C (Full-width Pipeline):** S3 = dọc 8 tầng · S6 = dải ngang 3 trạng thái · S11 = timeline vòng đời. → Cùng tư duy "quy trình" nhưng hướng/đối tượng khác nhau.
- **D (Large Visual + Data):** S5 = before/after + công thức · S7 = video + map · S9 = 3 ảnh + bảng. → Cùng "hình lớn + panel dữ liệu" nhưng media khác nhau.
- **E (Results Dashboard):** S10 = vote tiles + công thức · S12 = metric tiles + failure. → Cùng "số lớn ít chữ" nhưng một cái là cơ chế vote, một cái là kết quả.

## Kết luận
Không slide nào dùng chung một frame chia-đôi giống hệt nhau; mỗi family có biến thể riêng và được luân phiên xen kẽ, thỏa yêu cầu "giữ cùng hệ thiết kế nhưng thay đổi bố cục theo loại nội dung".
