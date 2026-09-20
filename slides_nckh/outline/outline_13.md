# TECHGAR — Outline hoàn chỉnh 13 slide NCKH (academic-structure)
> Nguồn tối cao: `docs\TechGAR_13_Slides_Final_Brief.md`. Asset: `research\asset_map.md` + `research\extraction_jobs.md`.
> Định vị học thuật: phương pháp → thiết kế → thực nghiệm → số liệu → phân tích. Không marketing.

## Quy ước chung
- **Tag nguồn số liệu (sau khi manager verify — `research\verified_numbers.md`):**
  - `[doc-claimed: session 2808_3]` = số đo trong docs cũ session 2808_3 — session không nằm trên ổ nhưng nhất quán nhiều docs (DOC-CLAIMED).
  - `[design-param]` = ngưỡng/tham số thiết kế đã VERIFIED-CODE trong repo (kèm file:line) — tuning thực nghiệm / heuristic.
  - `[measured]` = đo trực tiếp · `[verify]` = chưa đối chiếu được.
- **Sự thật bắt buộc:** toàn bộ footage là **mô hình bãi đỗ thu nhỏ / scale-model testbed** (xe đồ chơi, chai nước làm cột, 2 điện thoại DroidCam). Slide KHÔNG gọi là "bãi xe thật/thực địa". Slide 1 vẫn nêu bài toán tầng hầm thật làm động lực, nhưng mọi ảnh/data caption trung thực "scale-model".
- **Tiền tố đường dẫn:**
  - `SA` = `D:\TechGar2\backend\main_detect\docs\slides_tracking\slides_assets\`
  - `CFG` = `D:\TechGar2\backend\main_detect\config\shared_map_01\`
  - `OUT` = `D:\TechGar2\backend\main_detect\experiment_test\output\`
  - `ASSET` = `D:\TechGar2\slides_nckh\assets\` (đích xuất của extraction_jobs — file sẽ được sinh, dùng đúng tên target)
- **5 layout family (luân phiên):** `Hero Problem` · `Comparison 50/50` · `Full-width Pipeline` · `Large Visual + Formula/Data Panel` · `Results Dashboard`.
- **Chuỗi rotation:** `S1 A → S2 B → S3 C → S4 B → S5 D → S6 C → S7 D → S8 B → S9 D → S10 E → S11 C → S12 E → S13 B` (không 2 slide liền kề cùng family).

---

## SLIDE 1 — DẪN NHẬP: BÀI TOÁN THỰC TẾ
- **slide_number:** 1
- **title:** Định vị phương tiện và quản lý ô đỗ trong tầng hầm
- **research_question:** **XE NÀO? — Ở ĐÂU? — ĐANG Ở Ô NÀO?** — xác định đồng thời danh tính, vị trí mặt sàn và ô đỗ mà không gắn thiết bị lên từng xe.
- **layout_family:** Hero Problem
- **bullets:**
  - GNSS không ổn định hoặc không khả dụng trong tầng hầm.
  - Cột bê tông tạo điểm mù và che khuất.
  - Xe chồng lấn trong góc nhìn camera.
  - Camera góc chéo → tọa độ pixel ≠ tọa độ thực.
  - Không thể yêu cầu mọi xe gắn beacon / UWB / LiDAR.
- **key_numbers:** _(không có — slide đặt vấn đề)_
- **assets:**
  - `ASSET\slide1_overview_annotated.jpg` (E3a — hero đã annotate cột/điểm mù/FOV/overlap)
  - `SA\frame_0100_baseline_raw_cam1.jpg` (ảnh nền gốc của bản annotate)
  - `CFG\shared_map_01\capture_cam1.png` (alt overview sạch hơn, ít tay)
  - `ASSET\clip_s01_overview.mp4` (E8d — optional, cảnh bãi tĩnh → xe vào)
- **speaker_notes:** "Nhóm bắt đầu từ một vấn đề rất thực tế: trong tầng hầm, định vị bằng GNSS không còn đáng tin cậy, trong khi camera lại gặp điểm mù, che khuất và góc nhìn xiên. Vì vậy câu hỏi nghiên cứu của nhóm là làm thế nào xác định đồng thời **xe nào**, **đang ở đâu**, và **đang thuộc ô đỗ nào** mà không cần gắn thêm thiết bị lên từng phương tiện. Dữ liệu kiểm chứng của nhóm được thu trên một mô hình bãi đỗ thu nhỏ mô phỏng đúng bối cảnh này."
- **scientific_caveats:**
  - Không dùng "GPS = 0 dBm", không nói GPS "mất hoàn toàn" — chỉ nói "GNSS không ổn định hoặc không khả dụng trong môi trường tầng hầm".
  - Ảnh minh họa là **scale-model testbed**, caption trung thực; bài toán động lực là tầng hầm thật.

---

## SLIDE 2 — TỪ 1 CAMERA → MULTI-CAMERA
- **slide_number:** 2
- **title:** Tại sao một camera chưa đủ?
- **research_question:** Một camera cố định gặp giới hạn gì, và vì sao phải chuyển sang nhiều camera liên kết?
- **layout_family:** Comparison 50/50
- **bullets:**
  - _1 camera:_ điểm mù sau cột; che khuất động; biến dạng phối cảnh.
  - _1 camera:_ mất dấu → tạo Local ID mới; không phủ toàn bãi.
  - _Multi-camera:_ bổ sung vùng quan sát, nhiều góc nhìn đồng thời.
  - _Multi-camera:_ vùng overlap để kiểm chứng cùng một xe.
  - _Multi-camera:_ duy trì danh tính toàn bãi, mở rộng theo topology.
  - **Dòng chốt:** quyết định thiết kế — hệ nhiều camera cố định; demo nghiên cứu dùng 2 camera.
- **key_numbers:**
  - _(không đưa con số)_ — chưa có baseline định lượng 1-cam vs 2-cam.
- **assets:**
  - `SA\frame_0336_handoff_matched_split_debug.jpg` (2 cam cùng frame, xe trong overlap)
  - `SA\frame_0336_handoff_matched_raw_cam1.jpg` + `SA\frame_0336_handoff_matched_raw_cam2.jpg` (2 panel)
  - `ASSET\slide2_cam1_blind.jpg` + `ASSET\slide2_cam2_sees.jpg` (E6 — cặp cam1 mất xe / cam2 thấy)
- **speaker_notes:** "Nếu chỉ dùng một camera, hệ thống sẽ gặp điểm mù, che khuất và mất dấu khi xe rời vùng quan sát. Vì vậy nhóm chuyển sang nhiều camera liên kết. Trong demo hiện tại, nhóm dùng 2 camera để kiểm chứng kiến trúc trên mô hình bãi đỗ."
- **scientific_caveats:**
  - Chưa có baseline định lượng kiểu "1 camera = X%, 2 camera = Y%" — **không tự thêm số** nếu chưa chạy thí nghiệm riêng.
  - Ảnh là scale-model testbed.

---

## SLIDE 3 — TOÀN BỘ BÀI TOÁN / PIPELINE
- **slide_number:** 3
- **title:** Từ video camera đến quyết định ô đỗ
- **research_question:** Hệ thống biến video hai camera thành quyết định ô đỗ qua những tầng xử lý nào?
- **layout_family:** Full-width Pipeline
- **bullets:**
  - Pipeline: VIDEO → PHÁT HIỆN XE → LOCAL TRACKING → TỌA ĐỘ MẶT SÀN → CROSS-CAMERA MATCHING → CANONICAL GLOBAL ID → NHẬN DIỆN Ô ĐỖ → VEHICLE ↔ SLOT.
  - Detection ↔ ánh sáng/bóng → MOG2 + FrameDiff.
  - Local Tracking ↔ che khuất/xe dừng → Kalman + SSD Reacquire.
  - Ground Mapping ↔ camera góc chéo → Homography.
  - Cross-Camera ↔ 2 Local ID cho 1 xe → Canonical GID; Matching ↔ ghép nhầm → Topology + Cost Matrix.
  - Slot State ↔ ánh sáng biến thiên → Adaptive Equalizer; Vehicle-Slot ↔ xe đi ngang/căn chỉnh → Arrival + Departure logic.
- **key_numbers:** _(không có)_
- **assets:**
  - `SA\lane_graph_spots.png` (lane graph + spot nodes — minh họa map thật)
  - `SA\roi_active_map.png` (ROI cam1/cam2/overlap vận hành)
  - _(diagram pipeline vẽ mới — full-width)_
- **speaker_notes:** "Toàn bộ hệ thống không được xây từ một thuật toán duy nhất. Mỗi tầng xử lý một lỗi vật lý khác nhau: từ ánh sáng, che khuất, góc nhìn xiên, đến việc một xe xuất hiện dưới hai Local ID ở hai camera khác nhau."
- **scientific_caveats:**
  - Nhấn mạnh "mỗi tầng = một lỗi vật lý riêng", tránh liệt kê công nghệ không mạch.

---

## SLIDE 4 — HAI CAMERA XỬ LÝ SONG SONG
- **slide_number:** 4
- **title:** Hai camera quan sát cùng một không gian tại cùng thời điểm
- **research_question:** Hai camera có thể cùng quan sát một xe trong vùng overlap như thế nào?
- **layout_family:** Comparison 50/50 _(dual-view cùng timestamp)_
- **bullets:**
  - Cam 1 + Cam 2 cùng thấy xe tại ~cùng thời điểm t.
  - Vùng overlap cho phép kiểm chứng chéo cùng một xe.
  - Cross-camera là quan sát **song song**, không phải "chạy tiếp sức" tuần tự.
  - Đây là cơ sở hợp nhất 2 Local ID → 1 Global ID duy nhất.
- **key_numbers:**
  - Skew p50 = **18 ms** `[doc-claimed: session 2808_3]`
  - Skew p95 = **47 ms** `[doc-claimed: session 2808_3]`
  - Skew max = **110 ms** `[doc-claimed: session 2808_3]`
  - Ngưỡng cấu hình **120 ms** `[design-param]` (`--max-camera-skew-ms 120`, `two-camera-runbook.md:90` — VERIFIED-CODE)
- **assets:**
  - `SA\frame_0283_handoff_opened_split_debug.jpg` (2560×720, 2 cam cùng "Frame: 284", xe vừa vào overlap)
  - `ASSET\clip_s04_dualview.mp4` (E8g — optional, dual-view cùng t)
- **speaker_notes:** "Hai camera trong hệ thống chạy song song. Khi xe đi qua overlap, cả hai camera có thể cùng thấy chiếc xe ở gần cùng một thời điểm. Đây là cơ sở để hợp nhất hai Local ID thành một Global ID duy nhất."
- **scientific_caveats:**
  - Trình bày **overlap song song**, KHÔNG phải sơ đồ Cam1 → mất → Cam2 (checklist §17).
  - Skew 18/47/110 ms là `[doc-claimed: session 2808_3]`; ngưỡng 120 ms là cấu hình thật trong code (VERIFIED).

---

## SLIDE 5 — CAMERA GÓC CHÉO / HOMOGRAPHY
- **slide_number:** 5
- **title:** Từ ảnh camera góc chéo đến tọa độ thực trên mặt sàn
- **research_question:** Làm sao đưa vị trí pixel từ camera xiên về một hệ tọa độ mặt sàn thống nhất?
- **layout_family:** Large Visual + Formula/Data Panel _(Before → Transform → After)_
- **bullets:**
  - Xe là vật thể 3D — không cố ghép mái xe.
  - Neo vào các điểm trên **mặt sàn Z = 0**.
  - Mục tiêu: đưa điểm tiếp xúc mặt sàn về cùng hệ tọa độ.
  - Ảnh xiên → Ground-plane Homography → Shared map nhìn từ trên.
- **key_numbers:**
  - **945 cặp điểm kiểm tra** `[doc-claimed: seam benchmark, session 2808_3]`
  - p50 = **1,13 cm** `[doc-claimed: seam benchmark, session 2808_3]`
  - p95 = **4,39 cm** `[doc-claimed: seam benchmark, session 2808_3]`
- **formula:** `s[X,Y,1]ᵀ = H[u,v,1]ᵀ`
- **assets:**
  - `SA\calib_cam1_marked.png` (before — cam1 xiên + điểm A–D)
  - `SA\calib_cam2_marked.png` (before — cam2)
  - `CFG\shared_map_01\shared_map_full_view.png` (after — 2 cam warp về world frame) _alt_ `SA\roi_full_view.png`
- **speaker_notes:** "Do camera được gắn chéo, vị trí pixel của xe không thể xem là khoảng cách thực. Nhóm dùng ground-plane homography và chỉ neo vào mặt sàn Z = 0. Mục tiêu không phải ghép toàn bộ hình khối 3D của xe, mà là tạo một hệ tọa độ mặt sàn thống nhất cho các camera."
- **scientific_caveats:**
  - KHÔNG nói "Homography triệt tiêu hoàn toàn parallax 3D". Nói: "ánh xạ nhất quán các điểm trên mặt phẳng tham chiếu, hạn chế ảnh hưởng parallax đối với định vị mặt sàn".
  - Tránh `calib_checkerboard.png` / `calib_shared_roi.png` (watermark "CALIBRATION DRAFT – MODEL INADEQUATE").
  - 945 cặp là **seam benchmark cam1↔cam2** (session 2808_3); file validation trên ổ `cross_camera_validation_points.json` chỉ có **3 cặp V1–V3** (independent, excluded from fitting) — không trình bày 945 như "điểm validation độc lập".

---

## SLIDE 6 — LOCAL TRACKING
- **slide_number:** 6
- **title:** Duy trì Local ID trong từng camera
- **research_question:** Trước Cross-Camera, mỗi camera giữ một Local ID đủ ổn định bằng cách nào?
- **layout_family:** Full-width Pipeline _(dải ngang 3 trạng thái tracker: moving → bị che → dừng→reacquire)_
- **bullets:**
  - _Xe di chuyển:_ MOG2 + Dual FrameDiff + median brightness compensation.
  - _Xe bị che:_ Kalman Prediction + LAPJV association.
  - _Xe dừng lâu:_ SSD Template Reacquire để nối lại Local ID.
  - Mỗi tình huống vật lý có một cơ chế giữ ID riêng.
- **key_numbers:**
  - SSD Reacquire: **1.714 lần khôi phục** `[doc-claimed: session 2808_3]`
  - **25 trường hợp bị từ chối** `[doc-claimed: session 2808_3]`
- **assets:**
  - `ASSET\slide6_moving.jpg` (E5a — xe moving + bbox/label)
  - `ASSET\slide6_occluded.jpg` (E5b — xe khuất sau chai-cột)
  - `ASSET\slide6_stopped.jpg` (E5c — xe đỗ tĩnh tại ô)
  - `SA\frame_0278_gid_created_debug_cam2.jpg` (base moving)
  - `SA\demo_tracking_cam1.mp4` + `SA\demo_tracking_cam2.mp4` (clip sẵn 4.72 s)
- **speaker_notes:** "Trong từng camera, mục tiêu đầu tiên là giữ được Local ID ổn định. Khi xe di chuyển, nhóm kết hợp MOG2 và FrameDiff. Khi xe bị che, Kalman hỗ trợ dự báo quỹ đạo. Khi xe dừng lâu và detector tạm mất đối tượng, SSD Template Reacquire được dùng để nối lại Local ID."
- **scientific_caveats:**
  - 1.714 / 25 là `[doc-claimed: session 2808_3]` — session không nằm trên ổ.
  - Ưu tiên frame thật + binary mask + bounding box + trajectory; ảnh scale-model.

---

## SLIDE 7 — CROSS-CAMERA + VIDEO + MAP
- **slide_number:** 7
- **title:** Một xe — hai quan sát — một Canonical Global ID
- **research_question:** Một xe xuất hiện ở 2 camera được quy về một Canonical Global ID như thế nào?
- **layout_family:** Large Visual + Formula/Data Panel _(65% video overlap + 35% shared map)_
- **bullets:**
  - Camera 1 gán `L1#7`; Camera 2 gán `L2#12` (namespace độc lập).
  - Shared map: hai track cùng một vị trí vật lý.
  - Khi cùng trong overlap + khớp vị trí/topology/đặc trưng → hợp nhất `G#1`.
  - **Dòng chốt:** Canonical GID duy trì xuyên Moving ↔ Parked ↔ Moving.
- **key_numbers:**
  - Clip overlap minh họa ≈ **4,72 s** (118 frame @25 FPS) — độ dài clip, không phải metric.
- **assets:**
  - `SA\demo_overlap_split.mp4` **(bắt buộc — video thật 2 cam split)**
  - `SA\roi_active_map.png` **(bắt buộc — map panel: đen=cam1, đỏ=cam2, tím=overlap)**
  - `CFG\shared_map_01\shared_map_preview.png` (alt map)
- **speaker_notes:** "Một xe có thể có hai Local ID khác nhau vì hai camera sử dụng namespace độc lập. Khi hai track cùng xuất hiện trong overlap và cùng phù hợp về vị trí, topology và đặc trưng, hệ thống quy chúng về một Canonical Global ID duy nhất."
- **scientific_caveats:**
  - Video là output pipeline thật nhưng trên scale-model; clip là lựa chọn minh họa.
  - Checklist §17: slide 7 **phải có video thật** (`demo_overlap_split.mp4`).

---

## SLIDE 8 — TOPOLOGY + COST MATRIX + ANGLE
- **slide_number:** 8
- **title:** Khi nào hai track được xem là cùng một xe?
- **research_question:** Khi nào Cost Matrix được áp dụng, và dựa vào đâu để kết luận hai track là cùng một xe?
- **layout_family:** Comparison 50/50 _(trái: Topology Gate; phải: Cost Matrix + thuộc tính + Angle)_
- **bullets:**
  - _Bước 1 — Topology Gate:_ xe vào đúng hành lang topology + có candidate ở camera còn lại → mới tính cost.
  - _Bước 2 — Cost Matrix:_ `C = 0.55·D_ground + 0.30·D_color + 0.10·D_scale + 0.05·D_heading`.
  - Thuộc tính xe: Vị trí 55 · Màu 30 · Kích thước 10 · Hướng 5.
  - Hard gate hướng: `cos θ < 0.25 ⇒ reject` (loại chuyển động lệch hướng lớn).
  - Cost Matrix KHÔNG chạy trên toàn bộ xe trong bãi.
- **key_numbers:**
  - Cost weights **0.55 / 0.30 / 0.10 / 0.05** `[design-param]`
  - Ngưỡng góc **cos θ < 0.25** `[design-param]`
- **formula:**
  - `C = 0.55·D_ground + 0.30·D_color + 0.10·D_scale + 0.05·D_heading`
  - `cos θ = (v₁·v₂) / (|v₁||v₂|)` ; `cos θ < 0.25 ⇒ reject`
- **assets:**
  - `SA\lane_graph.png` hoặc `SA\lane_graph_spots.png` (topology)
  - `ASSET\slide8_car_crop.png` (E4a — minh họa thuộc tính xe, checklist bắt buộc)
- **speaker_notes:** "Cost Matrix không chạy trên toàn bộ xe trong bãi. Topology Gate lọc ứng viên trước. Chỉ khi xe đi vào đúng hành lang và có candidate hợp lệ ở camera còn lại, hệ thống mới tính chi phí dựa trên vị trí, màu, kích thước và hướng."
- **scientific_caveats:**
  - Phải ghi rõ `0.55/0.30/0.10/0.05` là **tuning thực nghiệm / heuristic** — không để hội đồng hiểu "tự nhiên đúng" (brief yêu cầu).
  - Slide 8 **phải có hình minh họa thuộc tính xe**, không chỉ text.

---

## SLIDE 9 — ADAPTIVE EQUALIZER & NGUỒN THAM SỐ
- **slide_number:** 9
- **title:** Tại sao một bộ tham số cố định không đủ?
- **research_question:** Vì sao một threshold cố định không đủ, và tại sao chọn nhiều cấu hình Gamma + CLAHE?
- **layout_family:** Large Visual + Formula/Data Panel _(3 ảnh điều kiện sáng + bảng tham số)_
- **bullets:**
  - Điều kiện thực tế: vùng tối · ánh sáng thường · lóa đèn pha · bóng cột · sàn ẩm/phản xạ.
  - Một threshold cố định tốt ở điều kiện này nhưng thất bại ở điều kiện khác.
  - Ensemble **25 biến thể γ×CLAHE** quanh cấu hình nền (γ≈2.5–2.8, CLAHE≈2.0; delta ±0.2 / ±0.5; grid 8×8) rồi kết hợp quyết định.
  - Bảng điều kiện→hiệu ứng: Tối→nâng vùng tối · Thường→giữ tương phản · Lóa→hạn chế vùng sáng bão hòa.
- **key_numbers:**
  - **25 biến thể = 5 mức Δγ × 5 mức ΔCLAHE** `[design-param]` (`parking_detector.py:454-456` — VERIFIED-CODE)
  - Cấu hình nền **γ≈2.5–2.8, CLAHE≈2.0**; delta **±0.2 / ±0.5**; grid **8×8** `[design-param]` (`parking_detector.py:100-104`, `:454-456`)
- **assets:**
  - `ASSET\slide9_dark_cam1_f0200.jpg` (E1a — TỐI, `toi1` raw_cam1 @f200)
  - `ASSET\slide9_normal_cam1_f1200.jpg` (E1b — BÌNH THƯỜNG, `hiep2` raw_cam1 @f1200)
  - `ASSET\slide9_glare_cam1_f0005.jpg` (E1c — LÓA ĐÈN, `toi1` raw_cam1 @f005) _(frame ref đã đổi f0190→f0005 theo asset thực tế trên ổ)_
- **speaker_notes:** "Môi trường tầng hầm có độ sáng biến thiên lớn. Một threshold cố định sẽ hoạt động tốt ở điều kiện này nhưng thất bại ở điều kiện khác. Vì vậy nhóm dùng một ensemble 25 biến thể Gamma–CLAHE xoay quanh một cấu hình nền — gamma khoảng 2.5 đến 2.8, CLAHE khoảng 2.0, với biên điều chỉnh cộng trừ 0.2 và 0.5 trên lưới 8 nhân 8 — rồi kết hợp quyết định thay vì phụ thuộc vào một bộ tham số duy nhất."
- **scientific_caveats:**
  - Nguồn tham số: **tuning thực nghiệm trên indoor validation set** (VERIFIED-CODE `parking_detector.py`).
  - **Đã sửa sự thật code:** 25 biến thể = 5 Δγ × 5 ΔCLAHE (`delta_gamma=[-0.2..0.2]`, `delta_clahe=[-0.5..0.5]`) quanh base γ≈2.8 (deploy 2.5), CLAHE≈2.0; grid 8×8 (`parking_detector.py:100-104`). Bảng gamma 0,65/1,4 trong brief **không có trong code** → chỉ trình bày điều kiện→hiệu ứng, không ghi số γ cụ thể.
  - Ảnh `toi1` là rig mat nhỏ hơn — chỉ minh họa điều kiện ánh sáng, không chứng minh tracking.

---

## SLIDE 10 — VOTE THRESHOLD ≥12/25
- **slide_number:** 10
- **title:** Từ 25 biến thể xử lý đến một quyết định ổn định
- **research_question:** Vì sao cần biểu quyết nhiều biến thể, và tại sao đang dùng ngưỡng ≥12/25?
- **layout_family:** Results Dashboard _(vote tiles lớn + công thức)_
- **bullets:**
  - Mỗi biến thể γ×CLAHE cho 1 vote; không dựa trên 1 ảnh duy nhất.
  - Ô **FREE khi ≥12/25 biến thể vote "trống"**; ngược lại OCCUPIED.
  - Temporal smoothing **5 frame** chống nhấp nháy trạng thái.
  - Ví dụ: **15/25** vote trống → **FREE** · **10/25** vote trống → **OCCUPIED**.
  - Nhiễu lóa có thể kích hoạt vài biến thể nhưng không đủ đa số.
- **key_numbers:**
  - Ngưỡng **≥12/25 vote trống ⇒ FREE** `[design-param]` (`required_votes = 25//2 = 12`, `parking_detector.py:533`)
  - Ví dụ **15/25 → FREE** · **10/25 → OCCUPIED** `[design-param]`
  - Temporal smoothing **5 frame** `[design-param]` (`smoothing_frames=5`, `:105`)
- **formula:** `Free ⇔ ΣV_empty ≥ 12/25`
- **assets:**
  - _(voting grid vẽ mới — lưới 5×5 = 25 biến thể: minh họa 15/25 vote trống → FREE vs 10/25 → OCCUPIED)_
  - `ASSET\slide10_slot_closeup.jpg` (E7 — optional, crop ô D02 đỏ) _alt_ `SA\frame_0543_parked_confirmed_debug_cam1.jpg` / `SA\roi_active_map.png`
- **speaker_notes:** "Hệ thống không quyết định trạng thái ô dựa trên một phiên bản ảnh duy nhất. Mỗi trong 25 biến thể Gamma–CLAHE cho một vote. Ô được xác nhận trống khi đạt đa số — ít nhất 12 trên 25 biến thể vote trống; ngược lại là occupied, kèm làm mượt theo 5 frame để tránh nhấp nháy."
- **scientific_caveats:**
  - Ngưỡng **12/25 là majority vote trên 25 biến thể** (VERIFIED-CODE `required_votes = 25//2 = 12`). Nếu chưa chạy **threshold sweep** → KHÔNG nói 12/25 là tối ưu; chỉ nói: "được chọn theo nguyên tắc majority vote, đang dùng trong cấu hình thử nghiệm".
  - Bảng sweep ngưỡng vote là **thí nghiệm nên bổ sung**, chưa có số liệu → không điền.

---

## SLIDE 11 — XE VÀO / RỜI Ô ĐỖ + KHÔI PHỤC ID
- **slide_number:** 11
- **title:** Từ xe đi ngang đến trạng thái đỗ — và khôi phục ID khi rời ô
- **research_question:** Xe vào/rời ô và khôi phục Canonical GID sau khi rời ô hoạt động ra sao?
- **layout_family:** Full-width Pipeline _(lifecycle timeline: Moving → Parked → Moving → Re-ID)_
- **bullets:**
  - Xe **đi ngang qua ô ≠ đã đỗ**; xe **rời ô ≠ phương tiện mới**.
  - _Arrival:_ polygon overlap Vehicle Footprint ↔ Slot; yêu cầu **≥ 3 mẫu liên tiếp**; vision confirm **≥ 2 lần trong ~1.5 s** → `G#1 → P056 → PARKED`.
  - _Departure:_ `departure_pending` + **Departure Token = 5 s** (gia hạn tiệm cận khi departure còn tiến triển, **≤ 15 s**).
  - Chỉ nhích ra căn chỉnh → tái hấp thu ID cũ; rời thật → giải phóng ô.
  - _Departure Re-ID:_ khi xe chạy lại, nối track mới về **Canonical GID cũ** — không tạo `G#2`.
- **key_numbers:**
  - Arrival **≥ 3 mẫu liên tiếp** `[design-param]` (`arrival_min_samples=3`, `slot_vehicle_binder.py:235`)
  - Vision confirm **≥ 2 lần / ~1.5 s** `[design-param]` (`arrival_vision_confirmations=2`, `arrival_lookback_seconds=1.5`, `:234-236`)
  - Departure Token **5 s** (gia hạn ≤ **15 s**) `[design-param]` (`recovery_retention_seconds=5.0`, `recovery_extension_seconds=15.0`, `:218-222`)
- **assets:**
  - `SA\frame_0278_gid_created_split_debug.jpg` (arrival/GID tạo)
  - `SA\frame_0543_parked_confirmed_debug_cam1.jpg` (parked — ô D02 đỏ, "14/24 free")
  - `SA\frame_0705_departure_token_debug_cam2.jpg` (departure + trajectory đuôi)
  - `ASSET\clip_s11_park_cycle.mp4` (E8c — arrival→parked→departure f500–760)
- **speaker_notes:** "Xe được xác nhận đỗ khi có ít nhất 3 mẫu liên tiếp và 2 lần xác nhận vision trong cửa sổ khoảng 1,5 giây — đủ để phân biệt xe đỗ thật với xe chỉ đi ngang. Khi xe rời ô, Departure Token 5 giây giữ lại danh tính, và có thể gia hạn tiệm cận tới 15 giây nếu quá trình rời còn tiến triển. Khi xe đỗ, Local Track có thể trở nên dormant; lúc xe chạy lại, hệ thống khôi phục Canonical GID cũ dựa trên trạng thái ô, vị trí mặt sàn và quỹ đạo rời ô. Cơ chế này đã được triển khai và kiểm thử đơn vị, và hiện đang được kiểm chứng trên replay. Mục tiêu là chiếc xe trước và sau khi đỗ vẫn là cùng một G#1."
- **scientific_caveats:**
  - **Departure Re-ID: đã triển khai + unit-tested, đang kiểm chứng trên replay** — KHÔNG claim hoàn tất, cũng không hạ xuống "chỉ thiết kế". Failure documented: `hiep2` G#2→G#4 @f1181 (slide 12).
  - Checklist §17: phải có lifecycle Moving → Parked → Moving.

---

## SLIDE 12 — THỰC NGHIỆM + ĐỐI CHỨNG + FAILURE
- **slide_number:** 12
- **title:** Kết quả thực nghiệm trên dữ liệu tầng hầm
- **research_question:** Hệ thống thực tế hoạt động đến đâu trên dữ liệu thử nghiệm?
- **layout_family:** Results Dashboard
- **bullets:**
  - _Dataset:_ **3.827 frames / 153,08 s / 25 FPS** `[doc-claimed: session 2808_3]` trên CPU phổ thông; mô hình bãi đỗ thu nhỏ.
  - _Latency:_ End-to-End **169 ms** `[doc-claimed: session 2808_3]`.
  - _Geometry:_ 945 cặp điểm · p50 = **1,13 cm** · p95 = **4,39 cm** `[doc-claimed: seam benchmark, session 2808_3]`.
  - _Độ bền ID:_ Main GID duy trì **3.383/3.827 ≈ 88,4%** thời lượng video `[doc-claimed: session 2808_3]`.
  - _Event Window:_ A = overlap ±2 s; B = vùng cửa ô ±3 s → **19/20 session thành công** `[doc-claimed: session 2808_3]`.
  - _Failure:_ session `hiep2` — xe G#2 đỗ D01, rời ô bị cấp **G#4 @f1181** (Departure Re-ID fail, documented); ảnh lóa đèn `toi1` f005 chỉ minh họa điều kiện.
- **key_numbers:**
  - **1,13 cm** p50 `[doc-claimed: session 2808_3]`
  - **25 FPS** `[doc-claimed: session 2808_3]`
  - **169 ms** E2E `[doc-claimed: session 2808_3]`
  - **19/20** session `[doc-claimed: session 2808_3]`
  - **3.827 f / 153,08 s** `[doc-claimed: session 2808_3]`
  - **Main GID 88,4%** (3.383/3.827) `[doc-claimed: session 2808_3]`
- **assets:**
  - `ASSET\slide12_failure_gid4_f1182.jpg` (E2a — **failure case chính**, nhãn G#4 trên xe đen rời D01)
  - `ASSET\slide12_glare_context_f0005.jpg` (E2d — minh họa điều kiện lóa đèn, caption trung thực) _(frame ref đã đổi f0190→f0005 theo asset thực tế trên ổ)_
  - `ASSET\slide12_failure_split60cm_f1792.jpg` (E2b — alt, split-identity 60–67 cm)
  - `ASSET\slide12_failure_ghostpair_f2181.jpg` (E2c — alt, ghost pair trên chân người)
  - `ASSET\clip_s12_failure_depart.mp4` (E8e — clip failure hiep2 f1140–1230)
- **speaker_notes:** "Nhóm không chỉ tính trung bình trên toàn bộ video vì phần lớn thời gian bãi xe là cảnh tĩnh. Thay vào đó, nhóm tập trung vào các Event Window có rủi ro cao nhất: vùng chuyển camera và vùng cửa ô đỗ. Trong 20 session thử nghiệm, 19 session hoàn thành thành công. Session còn lại thất bại ở cơ chế khôi phục ID sau khi rời ô — một giới hạn nhóm ghi nhận và cần kiểm chứng thêm."
- **scientific_caveats:**
  - Phát biểu đúng **"Trong 20 session thử nghiệm, 19 session thành công"** — KHÔNG suy rộng "95% mọi điều kiện".
  - **KHÔNG đưa Precision/Recall** vào slide chính (chưa có ground truth rõ: định nghĩa TP/FP/FN, số mẫu, nhãn theo frame/event).
  - `3383/3827`: doc `NoiDung:561` đúng = **88,4%** thời lượng (98,2% thời gian xe di chuyển); doc `Scientific_Spec:309` ghi nhầm 48,4% → **dùng 88,4%** (DISCREPANCY-RESOLVED). Topology-FPS: bỏ claim định lượng (không có số ablation trên ổ).
  - Failure case chính = `hiep2` G#2→G#4 @f1181 (**documented**, đúng cơ chế slide 11); narrative "lóa đèn <1m" không truy được session → chỉ minh họa.
  - Toàn bộ số slide này là `[doc-claimed: session 2808_3]` — session không nằm trên ổ; footage là scale-model.

---

## SLIDE 13 — ĐÓNG GÓP + HẠN CHẾ + HƯỚNG PHÁT TRIỂN
- **slide_number:** 13
- **title:** Đóng góp nghiên cứu và hướng phát triển
- **research_question:** Nhóm đóng góp gì, còn giới hạn gì, và bước tiếp theo là gì?
- **layout_family:** Comparison 50/50 _(trái: 3 contribution cards; phải: limitations + roadmap)_
- **bullets:**
  - _Card 1 — Ground-plane Homography:_ shared coordinate system · p50 = **1,13 cm** `[doc-claimed: session 2808_3]`.
  - _Card 2 — Canonical Global ID:_ Local IDs → Global ID · Topology + Cost Matrix · handoff/overlap.
  - _Card 3 — Adaptive Slot Management:_ Adaptive Equalizer · Majority Vote · Arrival/Departure · Vehicle ↔ Slot binding.
  - _Hạn chế:_ dataset scale-model/trong nhà; chưa kiểm chứng outdoor; tham số cần recalibration khi đổi miền dữ liệu; baseline 1-cam vs 2-cam chưa đủ; chưa có ground truth đầy đủ cho MOTA/P/R; Departure Re-ID cần kiểm chứng riêng.
  - _Hướng phát triển:_ N-camera · nhiều tầng/khu vực · dataset lớn hơn, nhiều loại xe · kiểm thử nhiều điều kiện sáng · tự động tuning · ground-truth annotation cho metric chuẩn · evaluation 1-cam vs multi-cam · outdoor adaptation.
  - **Dòng kết:** *Một xe thật → Một Canonical Global ID → Một tọa độ mặt sàn → Một trạng thái ô đỗ.*
- **key_numbers:**
  - p50 = **1,13 cm** `[doc-claimed: session 2808_3]` (trên Card 1)
- **assets:**
  - `SA\web_dashboard_desktop.png` (dashboard thật — slot xanh/đỏ, counter)
  - `SA\web_navigation_c06.png` (navigation tới C06)
  - `SA\web_mobile_nav.png` (mobile nav)
  - `SA\roi_full_view.png` (minh họa homography card)
- **speaker_notes:** "Tóm lại, nghiên cứu tập trung vào ba đóng góp: đưa nhiều camera về một hệ tọa độ mặt sàn chung, duy trì một danh tính duy nhất cho phương tiện khi di chuyển giữa các camera, và liên kết danh tính đó với trạng thái ô đỗ. Kết quả hiện tại là bước kiểm chứng trên mô hình bãi đỗ thu nhỏ trong nhà, và hướng tiếp theo là mở rộng N-camera, dataset lớn hơn và đánh giá bằng ground truth đầy đủ."
- **scientific_caveats:**
  - Phải có **limitation**, không chỉ thành tựu (checklist §17).
  - Departure Re-ID nêu rõ là **cần kiểm chứng riêng** nếu chưa có thử nghiệm.
  - Dataset là scale-model testbed trong nhà — không claim tổng quát ngoài trời.

---

## Phụ lục — Bảng tag nguồn nhanh (sau verify — `research\verified_numbers.md`)
| Số liệu | Giá trị | Tag | Sự thật code / doc |
|---|---|---|---|
| Homography p50 / p95 | 1,13 cm / 4,39 cm | `[doc-claimed: seam benchmark, session 2808_3]` | seam benchmark cam1↔cam2; file validation trên ổ chỉ 3 cặp V1–V3 |
| Cặp điểm kiểm tra | 945 | `[doc-claimed: seam benchmark, session 2808_3]` | cặp seam, KHÔNG phải `cross_camera_validation_points.json` (chỉ 3 cặp) |
| Skew p50 / p95 / max | 18 / 47 / 110 ms | `[doc-claimed: session 2808_3]` | đo session 2808_3 |
| Skew threshold | 120 ms | `[design-param]` | VERIFIED-CODE `--max-camera-skew-ms 120` (`two-camera-runbook.md:90`) |
| Dataset | 3.827 f / 153,08 s / 25 FPS | `[doc-claimed: session 2808_3]` | session không nằm trên ổ (repo cũ `TechGAR_Parking_Thai23_8`) |
| E2E latency | 169 ms | `[doc-claimed: session 2808_3]` | pipeline 40ms/frame → E2E web 169ms |
| Event success | 19/20 session | `[doc-claimed: session 2808_3]` | "95.0%"; session fail cụ thể không truy được file |
| SSD Reacquire | 1.714 lần / 25 từ chối | `[doc-claimed: session 2808_3]` | session 2808_3 |
| Main GID | 3.383/3.827 ≈ 88,4% | `[doc-claimed: session 2808_3]` | DISCREPANCY-RESOLVED (doc đúng 88,4%; bản nhầm 48,4%) |
| Cost weights | 0.55 / 0.30 / 0.10 / 0.05 | `[design-param]` | VERIFIED-CODE `cross_camera_manager.py:3095` — tuning thực nghiệm |
| Ngưỡng góc | cos θ < 0.25 | `[design-param]` | VERIFIED-CODE `min_direction_cosine=0.25` (`:165`) — heuristic |
| Equalizer ensemble | 25 biến thể (5 Δγ × 5 ΔCLAHE) | `[design-param]` | VERIFIED-CODE `parking_detector.py:454-456` |
| Cấu hình nền γ / CLAHE | γ≈2.5–2.8 / CLAHE≈2.0; Δ±0.2 / ±0.5; grid 8×8 | `[design-param]` | VERIFIED-CODE `parking_detector.py:100-104` |
| Vote threshold | ≥12/25 vote trống ⇒ FREE | `[design-param]` | VERIFIED-CODE `required_votes=25//2=12` (`:533`) |
| Temporal smoothing | 5 frame | `[design-param]` | VERIFIED-CODE `smoothing_frames=5` (`:105`) |
| Departure Token | 5 s (gia hạn ≤ 15 s) | `[design-param]` | VERIFIED-CODE `recovery_retention_seconds=5.0`, `recovery_extension_seconds=15.0` (`:218-222`) |
| Arrival | ≥ 3 mẫu liên tiếp | `[design-param]` | VERIFIED-CODE `arrival_min_samples=3` (`:235`) |
| Vision confirm | ≥ 2 lần / ~1.5 s | `[design-param]` | VERIFIED-CODE `arrival_vision_confirmations=2`, `arrival_lookback_seconds=1.5` (`:234-236`) |

> **Lưu ý tag:** sau khi manager đối chiếu code, các số đo session 2808_3 được hạ từ `[verify]` xuống `[doc-claimed: session 2808_3]` (session không nằm trên ổ nhưng nhất quán nhiều docs); mọi tham số thiết kế đã VERIFIED-CODE trong repo kèm `file:line`.
