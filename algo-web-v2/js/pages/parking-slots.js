/* parking-slots.js — Trang 2: polygon ô đỗ & occupancy pixel-based.
 * Nguồn số liệu đã xác minh: .analysis/algo-web-v2-redesign/notes/parking-slots.md
 */
(function () {
  "use strict";
  TG.definePage({
    id: "parking-slots",
    group: "setup",
    title: "Parking slots & occupancy",
    navLabel: "Parking slots",
    order: 2,
    prev: "roi-mask",
    next: "homography",

    /* ① Chức năng & vị trí */
    fn: {
      text: "Mỗi ô đỗ là một polygon bốn đỉnh do người vận hành vẽ trên frame — ba mươi ô cho mỗi camera, sáu mươi ô tổng. ParkingDetector dùng các polygon này để trả lời một câu hỏi duy nhất mỗi nhịp: ô này đang trống hay có xe. Việc gán chiếc xe nào vào ô là trách nhiệm của một cơ chế khác ở nhóm trang binding."
    },

    /* ② Vì sao cần */
    why: {
      paras: [
        "Motion tracker chỉ biết có gì đó đang chuyển động; nó không biết vật đó nằm ở ô nào, và xe đỗ yên hoàn toàn tàng hình với nó. Hệ thống bán chỗ đỗ chứ không bán detection, nên cần một kênh occupancy độc lập.",
        "Occupancy ở đây đo trực tiếp trên pixel: vùng trong ô có đủ điểm sáng bất thường hay không. Vì không phụ thuộc [[track]], một chiếc xe đứng im hàng giờ vẫn được đếm đúng. Đây cũng là lý do nó là nguồn sự thật chính cho trạng thái ô."
      ]
    },

    /* ③ Cách hoạt động */
    how: [
      {
        id: "3.1",
        name: "Vẽ ô bằng ParkingSpacePicker",
        paras: [
          "Tool tools/ParkingSpacePicker_ve_js.py mở một frame; mỗi click trái thêm một đỉnh, đủ bốn đỉnh bấm 'a' để chốt thành ô. Click phải vào trong một ô sẽ xoá ô đó.",
          "Bốn điểm được chuẩn hoá bằng order_points: sắp xếp theo góc quanh centroid rồi xoay sao cho đỉnh trên-trái đứng đầu — file luôn có thứ tự đỉnh nhất quán.",
          "ID ô tự tăng theo hàng chữ cái: F01, F02… Người vẽ đổi hàng bằng phím 'o'. File ghi nguyên tử qua một bản .tmp rồi replace, nên không bao giờ có file viết dở."
        ],
        values: [
          { k: "điểm mỗi ô", v: "4 — click trái; 'a' accept", kind: "class-default", src: "backend/main_detect/tools/ParkingSpacePicker_ve_js.py:115-124" },
          { k: "chuẩn hoá đỉnh", v: "sort góc quanh centroid, top-left đầu", kind: "class-default", src: "backend/main_detect/tools/ParkingSpacePicker_ve_js.py:25-32" },
          { k: "schema + ghi", v: "{imageWidth, imageHeight, slots[]} qua .tmp", kind: "class-default", src: "backend/main_detect/tools/ParkingSpacePicker_ve_js.py:88-107" },
          { k: "số ô hiện dùng", v: "30 ô/cam — cam1 D/E/F, cam2 A/B/C", kind: "config", src: "backend/main_detect/config/parking_slots_cam1.json" }
        ]
      },
      {
        id: "3.2",
        name: "Từ polygon thành ba lớp mask mỗi ô",
        paras: [
          "Khi khởi động, detector scale polygon theo kích thước frame rồi precompute cho mỗi ô ba vùng lồng nhau, không tính lại mỗi frame.",
          "Lớp ngoài là local_mask — toàn bộ polygon. Lớp giữa là analysis_mask: local_mask bị erode theo border_ignore_ratio của cạnh ngắn để loại vạch kẻ ô khỏi bằng chứng.",
          "Lớp trong là core_mask: polygon thu nhỏ theo core_scale quanh centroid, giao với analysis_mask — vùng chắc chắn nằm giữa xe nếu xe đỗ đúng ô."
        ],
        values: [
          { k: "scale polygon", v: "theo imageWidth/Height của file", kind: "runtime", src: "backend/main_detect/src/techgar/parking_detector.py:228-244" },
          { k: "analysis inset", v: "min(cạnh) × 0.12, kernel ellipse", kind: "runtime", src: "backend/main_detect/src/techgar/parking_detector.py:263-274" },
          { k: "core_scale runtime", v: "0.80 (class default 0.55)", kind: "runtime", src: "backend/main_detect/two_camera.py:2278" }
        ]
      },
      {
        id: "3.3",
        name: "Một frame thành hai mươi sáu ảnh threshold",
        paras: [
          "Detector làm việc trên kênh sáng L của không gian LAB. Pipeline gốc: CLAHE clip 2.0 lưới 8×8, gamma LUT 2.8, Gaussian 3×3, rồi adaptiveThreshold Gaussian nghịch đảo khối 25 hằng số 16.",
          "Sau đó median blur 5 và dilate 3×3 cho ảnh nhị phân đầu tiên. Xe sáng trên nền tối bật thành pixel trắng — pixel trắng là bằng chứng occupancy.",
          "Một ảnh threshold là quá mong manh, nên detector chạy thêm ensemble 5×5. Năm biến thiên CLAHE nhân năm biến thiên gamma quanh giá trị gốc cho hai mươi lăm ảnh cùng pipeline."
        ],
        values: [
          { k: "CLAHE / gamma gốc", v: "clip 2.0 grid 8×8 / LUT 2.8", kind: "class-default", src: "backend/main_detect/src/techgar/parking_detector.py:100-102" },
          { k: "adaptiveThreshold", v: "GAUSSIAN_C, INV, block 25, C 16", kind: "runtime", src: "backend/main_detect/src/techgar/parking_detector.py:472-479" },
          { k: "ensemble", v: "5 Δclahe × 5 Δgamma = 25 variants", kind: "runtime", src: "backend/main_detect/src/techgar/parking_detector.py:454-456" }
        ]
      },
      {
        id: "3.4",
        name: "Bỏ phiếu trống, core rescue và line filter",
        paras: [
          "Mỗi variant cho mỗi ô một tỉ lệ: pixel trắng đã lọc trên diện tích analysis_mask. Tỉ lệ dưới ngưỡng enter là một phiếu trống; dưới ngưỡng exit là một phiếu ra.",
          "Ô được gọi trống khi đủ mười hai trên hai mươi lăm phiếu — đa số ensemble phải đồng ý. Quyết định này bị lật lại nếu core rescue thấy lõi ô vẫn chứa đủ bằng chứng xe.",
          "Vạch sơn ô là nguồn pixel trắng giả kinh điển, nên selective_line_filter loại chúng theo từng variant thay vì một mask chung. Nhờ đó một cây cầu pixel ở ảnh gốc không được veto toàn bộ hai mươi lăm phiếu."
        ],
        values: [
          { k: "phiếu trống cần", v: "required_votes = 25//2 = 12", kind: "derived", src: "backend/main_detect/src/techgar/parking_detector.py:533" },
          { k: "ngưỡng enter/exit", v: "0.12 / 0.08", kind: "runtime", src: "backend/main_detect/two_camera.py:1786-1787" },
          { k: "core rescue", v: "core ≥0.18 & comp ≥0.08, hoặc raw ≥0.30 & core ≥0.02", kind: "runtime", src: "backend/main_detect/src/techgar/parking_detector.py:418-427" },
          { k: "edge recheck", v: "TẮT ở runtime two_camera", kind: "runtime", src: "backend/main_detect/two_camera.py:2275" }
        ]
      },
      {
        id: "3.5",
        name: "Dwell machine và nhịp hai hertz",
        paras: [
          "Occupancy không chạy trên luồng chính: một thread pool hai worker nhận job mỗi nửa giây theo parking_fps 2.0, kết quả quá một giây tuổi bị bỏ.",
          "Kết quả worker chỉ được commit một lần qua accept_evidence. Muốn lật sang occupied cần hai lần đọc liên tiếp đồng ý và tối thiểu 0.5 giây; muốn lật về empty cần ba lần đọc và 1.0 giây.",
          "Một chi tiết đáng nhớ: ô chưa có đủ bằng chứng lần đầu được mặc định occupied. Chỗ trống chưa xác minh không được coi là chỗ trống khả dụng.",
          "TemporalSmoother chạy kèm nhưng ở runtime gần như tắt: required_frames bằng một nên mọi mẫu xác nhận ngay. Cổng quyết định thật là dwell machine stable_evidence phía trên."
        ],
        values: [
          { k: "nhịp job", v: "parking_fps 2.0, pool 2 worker", kind: "runtime", src: "backend/main_detect/two_camera.py:2287-2290" },
          { k: "tuổi kết quả tối đa", v: "1.0 s (--parking-max-result-age-seconds)", kind: "runtime", src: "backend/main_detect/two_camera.py:1790-1795" },
          { k: "dwell enter/exit", v: "≥2 đọc & ≥0.5 s / ≥3 đọc & ≥1.0 s", kind: "runtime", src: "backend/main_detect/src/techgar/parking_detector.py:636-640" },
          { k: "ô chưa init", v: "occupied=True placeholder", kind: "runtime", src: "backend/main_detect/src/techgar/parking_detector.py:641-643" }
        ]
      }
    ],

    /* ④ Số liệu & công thức */
    formulas: [
      {
        name: "Phiếu trống tối thiểu",
        expr: "required_votes = 25 variants // 2",
        subst: "25 // 2",
        result: "= 12 phiếu",
        note: "ô chỉ trống khi đa số ensemble đồng ý; core rescue có thể lật lại",
        src: "backend/main_detect/src/techgar/parking_detector.py:533"
      },
      {
        name: "Inset vạch biên",
        expr: "inset = min(w, h) × border_ignore_ratio",
        subst: "cạnh ngắn 70 px × 0.12",
        result: "≈ 8 px erode",
        note: "vạch kẻ ô bị đẩy ra ngoài analysis_mask (minh họa kích thước ô)",
        src: "backend/main_detect/src/techgar/parking_detector.py:263-270"
      },
      {
        name: "Core rescue",
        expr: "(core ≥ 0.18 ∧ comp ≥ 0.08) ∨ (raw ≥ 0.30 ∧ core ≥ 0.02 ∧ comp_count ≥ 2)",
        subst: "raw 0.35, core 0.05, comp_count 3",
        result: "→ occupied dù ensemble bỏ phiếu trống",
        note: "đường cứu thứ hai (textured_dense_blob) còn đòi ít nhất hai component lõi; dành cho xe tối màu chỉ hiện rõ ở lõi ô",
        src: "backend/main_detect/src/techgar/parking_detector.py:418-427"
      }
    ],
    params: [
      { name: "số ô đỗ", value: "30/cam — cam1 D/E/F, cam2 A/B/C", kind: "config", role: "polygon 4 đỉnh mỗi ô trong config", src: "backend/main_detect/config/parking_slots_cam1.json" },
      { name: "border_ignore_ratio", value: "0.12", kind: "class-default", role: "phần cạnh ngắn bị erode để loại vạch kẻ", src: "backend/main_detect/src/techgar/parking_detector.py:107" },
      { name: "core_scale (runtime)", value: "0.80", kind: "runtime", role: "tỉ lệ thu polygon quanh centroid cho core_mask; class default 0.55", src: "backend/main_detect/two_camera.py:2278" },
      { name: "ratio_thr (runtime)", value: "0.12", kind: "runtime", role: "ngưỡng enter — tỉ lệ pixel bằng chứng để tính occupied; class default 0.20", src: "backend/main_detect/two_camera.py:1786" },
      { name: "exit_ratio_thr", value: "0.08", kind: "runtime", role: "ngưỡng phiếu ra — thấp hơn enter để chống flap", src: "backend/main_detect/two_camera.py:1787" },
      { name: "occupied_seconds / empty_seconds", value: "0.5 s / 1.0 s", kind: "runtime", role: "dwell tối thiểu trước khi lật trạng thái ô", src: "backend/main_detect/two_camera.py:1788-1789" },
      { name: "smoothing_frames (runtime)", value: "1", kind: "runtime", role: "TemporalSmoother gần như tắt ở two_camera; class default 5", src: "backend/main_detect/two_camera.py:1796-1801" },
      { name: "parking_fps / max_result_age", value: "2.0 Hz / 1.0 s", kind: "runtime", role: "nhịp worker async và tuổi kết quả được chấp nhận", src: "backend/main_detect/two_camera.py:1784-1795" }
    ],

    /* ⑤ Hình thật */
    figures: [
      {
        src: "assets/real/slots-cam1.jpg",
        alt: "Ba mươi polygon ô đỗ hàng D/E/F vẽ trên frame cam1",
        caption: "Toàn bộ ba mươi ô của cam1 (config/parking_slots_cam1.json): hàng F dưới cùng, E giữa, D trên — polygon bám sát vạch sơn thật.",
        origin: "shared_map_01/cal-20260927/f0/cam1"
      },
      {
        src: "assets/real/slots-cam2.jpg",
        alt: "Ba mươi polygon ô đỗ hàng A/B/C vẽ trên frame cam2 nhìn từ phía đối diện",
        caption: "Ba mươi ô của cam2 (A dưới, B giữa, C trên): camera đối diện nên thứ tự hàng đảo ngược so với cam1 — cùng một bãi, hai phía nhìn.",
        origin: "shared_map_01/cal-20260927/f0/cam2"
      }
    ],
    noFigureReason: null,

    /* ⑥ Giới hạn & lỗi thật */
    limits: [
      {
        text: "Occupancy đúng không đồng nghĩa xe được track. Mọi session đều có cờ vision-occupied-without-tracking trong khoảng f1-61. Xe đỗ sẵn từ trước không tạo chuyển động nên tracker không bao giờ thấy — giới hạn thiết kế motion-based.",
        evidence: { session: "all", status: "CONFIRMED" }
      },
      {
        text: "Trạng thái ô được latch bởi dwell machine nên sống sót qua nhiễu cụm. Toi6 có hai đợt mass respawn mươi lăm track trở lên (E-B-001/002) nhưng occupancy cuối không đổi — ví dụ chống flap hoạt động đúng. Mã E-* là finding của chiến dịch verify-replay; danh mục đầy đủ ở trang failure-gallery.",
        evidence: { session: "toi6", status: "CONFIRMED" }
      },
      {
        text: "Chuỗi async 2 Hz cộng dwell kéo theo độ trễ tích luỹ. Trạng thái ô luôn trễ vài trăm mili giây đến hơn một giây so với thực tế — chấp nhận được cho occupancy, không hợp cho quyết định tức thời."
      },
      {
        text: "Occupancy thuần pixel trên kênh sáng: xe rất tối màu trên nền tối sinh ít pixel trắng và phải trông cậy ensemble cùng core rescue. Ngược lại bóng nắng hoặc phản chiếu mạnh có thể thổi tỉ lệ bằng chứng (suy luận từ thiết kế)."
      },
      {
        text: "File config luôn ghi status empty khi save — trạng thái runtime không persist. Mỗi session bắt đầu với mọi ô ở placeholder occupied. Dwell machine cần đủ bằng chứng mới chuyển trạng thái."
      }
    ],

    /* ⑦ Nguồn */
    sources: [
      { ref: "backend/main_detect/tools/ParkingSpacePicker_ve_js.py:25-32", kind: "class-default", note: "order_points chuẩn hoá thứ tự đỉnh" },
      { ref: "backend/main_detect/tools/ParkingSpacePicker_ve_js.py:61-124", kind: "class-default", note: "id theo hàng + click trái/phải" },
      { ref: "backend/main_detect/tools/ParkingSpacePicker_ve_js.py:88-107", kind: "class-default", note: "schema file + atomic save .tmp" },
      { ref: "backend/main_detect/config/parking_slots_cam1.json", kind: "config", note: "30 ô D/E/F 1280×720" },
      { ref: "backend/main_detect/config/parking_slots_cam2.json", kind: "config", note: "30 ô A/B/C 1280×720" },
      { ref: "backend/main_detect/src/techgar/parking_detector.py:97-136", kind: "class-default", note: "ctor: ratio 0.20, edge 0.25, smoothing 5, border 0.12, core 0.55" },
      { ref: "backend/main_detect/src/techgar/parking_detector.py:228-319", kind: "runtime", note: "_compute_rois: 3 lớp mask mỗi ô" },
      { ref: "backend/main_detect/src/techgar/parking_detector.py:418-427", kind: "runtime", note: "core rescue hai nhánh" },
      { ref: "backend/main_detect/src/techgar/parking_detector.py:439-530", kind: "runtime", note: "pipeline L-channel + 25-variant ensemble + phiếu" },
      { ref: "backend/main_detect/src/techgar/parking_detector.py:532-598", kind: "runtime", note: "required_votes 12, edge recheck, build results + evidence" },
      { ref: "backend/main_detect/src/techgar/parking_detector.py:602-645", kind: "runtime", note: "accept_evidence dwell machine + placeholder occupied" },
      { ref: "backend/main_detect/two_camera.py:1784-1801", kind: "runtime", note: "CLI parking: fps 2.0, enter 0.12, exit 0.08, dwell, smoothing 1" },
      { ref: "backend/main_detect/two_camera.py:2271-2330", kind: "runtime", note: "ctor runtime: no edge recheck, core_scale 0.80, stable_evidence, line filter" },
      { ref: "backend/main_detect/two_camera.py:2287-2290", kind: "runtime", note: "ThreadPoolExecutor 2 worker cho parking" },
      { ref: "backend/main_detect/two_camera.py:2630-2655", kind: "runtime", note: "nhịp job ≥1/fps + PendingParkingJob submit" }
    ],
    pseudocode: "OFFLINE (ParkingSpacePicker, moi cam):\n  click 4 diem -> 'a' -> order_points -> id ROW+NN\n  save: {imageWidth, imageHeight, slots[]} qua file .tmp\n\nSTARTUP:\n  scale polygon theo frame\n  moi o: local_mask -> analysis_mask (erode 0.12*canh ngan)\n         -> core_mask (thu 0.80 quanh centroid)\n\nMOI NHIP (worker async, ~2 Hz):\n  L = LAB.L; base = CLAHE(2.0)+gamma(2.8)+adaptiveThreshold(25,16)\n  25 variants (5 dclahe x 5 dgamma) -> ratio tung o\n  o trong neu >=12/25 phieu trong; core rescue co the lat lai\n\nCOMMIT (accept_evidence, chi 1 lan/job):\n  enter: >=2 doc lien tiep & >=0.5s -> occupied\n  exit:  >=3 doc lien tiep & >=1.0s -> empty\n  chua init -> occupied (placeholder an toan)"
  });
})();
