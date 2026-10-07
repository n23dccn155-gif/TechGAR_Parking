/* overview.js — trang chung: bản đồ pipeline + điều hướng tới 23 trang cơ chế.
 * Sơ đồ nhóm→trang (có link) được router chèn vào cuối mục ③ (pipeMap).
 */
(function () {
  "use strict";
  TG.definePage({
    id: "overview",
    group: "common",
    title: "Tổng quan pipeline TechGAR",
    navLabel: "Tổng quan",
    order: 0,
    prev: null,
    next: null,

    /* ① Chức năng & vị trí */
    fn: {
      text: "Trang này là bản đồ của toàn bộ site. Nó mô tả pipeline runtime từ khung hình camera tới bản đồ dẫn đường. Nó dẫn tới hai mươi ba trang cơ chế giải thích từng mắt xích bằng số liệu và dòng code thật."
    },

    /* ② Vì sao cần */
    why: {
      paras: [
        "Hệ thống có hơn mười khối xử lý nối tiếp nhau qua hai camera và hai dịch vụ HTTP. Nhìn từng file riêng sẽ không thấy dữ liệu chảy thế nào, còn nhìn toàn bộ sẽ quá tải. Trang này giữ sơ đồ mức pipeline: đủ để định hướng, không đủ để thay thế trang cơ chế.",
        "Mỗi chặng trong sơ đồ tương ứng một nhóm trang. Khi cần chi tiết một ngưỡng hay một công thức, đi theo link tới trang của chặng đó — mọi con số ở đó đều có nguồn file và dòng."
      ]
    },

    /* ③ Cách hoạt động — chuỗi runtime */
    how: [
      {
        id: "3.1",
        name: "Thu hình và hiệu chuẩn",
        paras: [
          "Hai camera IP phát MJPEG về backend. Trước khi pipeline chạy cần hiệu chuẩn ba thứ. [[ROI]] che vùng không quan tâm, polygon ô đỗ đánh dấu chỗ trên từng camera, và [[Homography]] chiếu pixel sang bản đồ thế giới dùng chung."
        ],
        page: "roi-mask"
      },
      {
        id: "3.2",
        name: "Theo vết trên một camera",
        paras: [
          "Mỗi camera chạy một pipeline riêng: [[MOG2]] tách nền, lọc contour theo diện tích và hình dáng, rồi gán detection vào [[track]] bằng [[Kalman filter]] và [[LAPJV]]. Track sống qua che khuất nhờ cơ chế occlusion guard tách nhóm."
        ],
        page: "motion-detection"
      },
      {
        id: "3.3",
        name: "Hai camera và một danh tính",
        paras: [
          "Khi xe tiến tới mép khung, manager mở [[HandoffEntry]] sang camera kề. Fragment mới được chấm bằng gallery màu, quỹ đạo thế giới và hành lang dự đoán trước khi nhận lại [[GID]] cũ. Track chết mà chưa sang cam thì identity chuyển [[dormant]] chờ phục hồi."
        ],
        page: "handoff-dormant"
      },
      {
        id: "3.4",
        name: "Ô đỗ và gán xe",
        paras: [
          "Song song với tracking, parking detector đọc pixel trong từng ô đỗ để quyết trống hay có xe — kênh này không cần track nên thấy cả xe đỗ yên. Slot binder nối hai kênh: bind xe vào ô khi đủ bằng chứng dừng, giữ chỗ qua departure token khi xe rời."
        ],
        page: "slot-binder"
      },
      {
        id: "3.5",
        name: "Xuất trạng thái ra API",
        paras: [
          "Mỗi vòng lặp, backend ghi một dòng predictions.jsonl và phát hành [[Runtime snapshot]] schema 2 lên cổng 8001. Gate session controller poll snapshot ở cổng 8000, phát hiện xe cắt vạch cổng để mở hoặc đóng phiên sạc kèm QR."
        ],
        page: "snapshot-api"
      },
      {
        id: "3.6",
        name: "Frontend dẫn đường",
        paras: [
          "Trang web poll session controller, chiếu tọa độ thế giới lên bản đồ SVG và tính tuyến bằng [[A*]] trên lane graph. Giọng nói tiếng Việt đọc chỉ dẫn rẽ, còn lệch tuyến quá ngưỡng thì cảnh báo và tính lại đường."
        ],
        page: "frontend-dataflow"
      }
    ],

    /* ④ Số liệu & công thức */
    formulas: [
      {
        name: "Chuỗi pipeline runtime",
        expr: "cam → two_camera → motion_tracker → occlusion_guard → tracklet_descriptor → cross_camera_manager → parking_detector + slot_vehicle_binder → prediction_writer → runtime_server :8001 → gate_session_controller :8000 → frontend",
        note: "thứ tự thật trong vòng lặp hai camera — mỗi khối có trang cơ chế riêng",
        src: "backend/main_detect/two_camera.py"
      }
    ],
    params: [
      { name: "số trang cơ chế", value: "23 trang / 6 nhóm", kind: "illustrative", role: "cấu trúc nội dung của site này (minh họa)", src: "algo-web-v2/js/manifest.js" },
      { name: "runtime API port", value: "8001", kind: "runtime", role: "cổng phục vụ snapshot + MJPEG", src: "backend/main_detect/runtime_server.py:402" },
      { name: "session API port", value: "8000", kind: "runtime", role: "cổng gate/session/QR mà frontend poll", src: "backend/gate_session_controller.py:864" },
      { name: "snapshot schema", value: "2", kind: "class-default", role: "phiên bản contract của runtime snapshot", src: "backend/main_detect/src/techgar/runtime_contract.py:12" },
      { name: "predictions schema", value: "3", kind: "class-default", role: "phiên bản contract của log offline", src: "backend/main_detect/src/techgar/prediction_writer.py:16" },
      { name: "số camera", value: "2 (cam1 + cam2)", kind: "config", role: "cấu hình hiện tại của bãi", src: "backend/main_detect/config/two_camera.shared_cm_01.json" }
    ],

    /* ⑤ Hình thật */
    figures: [
      {
        src: "assets/real/snapshot-api-debug-cam1-f600.jpg",
        alt: "Debug stream cam1 với overlay ô đỗ xanh đỏ và HUD đếm ô trống",
        caption: "Đầu ra mà pipeline tạo ra: overlay ô đỗ trên debug stream cam1. Mỗi polygon xanh hay đỏ là kết quả cuối của chuỗi detection, tracking, detector và binder bên dưới.",
        origin: "session_hiep_sang8/f600/cam1"
      },
      {
        src: "assets/real/homography-cam1-points.jpg",
        alt: "Tám điểm hiệu chuẩn A đến D và V1 đến V4 đánh dấu trên cam1",
        caption: "Đầu vào hiệu chuẩn: tám điểm đánh dấu tay trên cam1 tạo ma trận chiếu sang bản đồ chung. Không có bước này, hai camera không nói cùng hệ tọa độ.",
        origin: "shared_map_01/cal-20260927/f0/cam1"
      }
    ],
    noFigureReason: null,
    interactive: null,

    /* ⑥ Giới hạn & lỗi thật */
    limits: [
      {
        text: "Site là minh họa giáo dục, không phải tài liệu vận hành. Con số gắn nhãn runtime và config phản ánh mã nguồn tại thời điểm viết; sửa config hoặc code sẽ làm chúng lệch.",
        evidence: { status: "UNSURE" }
      },
      {
        text: "Sơ đồ pipeline lược bớt nhánh phụ: nhóm retry, sổ ambiguity và các pass phụ hồi chạy xen kẽ trong cross_camera_manager chứ không nằm trên một đường thẳng.",
        evidence: { status: "CONFIRMED", session: "verify_cur_session_hiep3", frame: 162 }
      },
      {
        text: "Trang chỉ mô tả pipeline của TechGAR tại bãi hai camera hiện tại. Cấu hình một camera hay bãi khác sẽ cho sơ đồ và số liệu khác."
      }
    ],

    /* ⑦ Nguồn */
    sources: [
      { ref: "backend/main_detect/two_camera.py:1-80", kind: "runtime", note: "điểm vào chính của pipeline hai camera" },
      { ref: "backend/main_detect/runtime_server.py:402-404", kind: "runtime", note: "cổng 8001, stream fps, jpeg quality" },
      { ref: "backend/gate_session_controller.py:864-865", kind: "runtime", note: "cổng 8000 + poll 0.25 s" },
      { ref: "backend/main_detect/src/techgar/runtime_contract.py:12", kind: "class-default", note: "RUNTIME_SCHEMA_VERSION = 2" },
      { ref: "backend/main_detect/src/techgar/prediction_writer.py:16", kind: "class-default", note: "PREDICTION_SCHEMA_VERSION = 3" },
      { ref: "frontend/src/app/App.tsx:354-360", kind: "runtime", note: "frontend poll snapshot 200 ms" },
      { ref: "algo-web-v2/js/manifest.js", kind: "illustrative", note: "sơ đồ nhóm trang của site (minh họa)" }
    ],
    pseudocode: "moi frame:\n  cam1, cam2 -> roi_mask -> MOG2 -> contour -> kalman+lapjv -> track\n  occlusion_guard tach nhom\n  tracklet_descriptor -> gallery mau\n  cross_camera_manager: handoff + dormant + conflict -> GID\n  parking_detector (25 bien the) + slot_vehicle_binder -> episode\n  prediction_writer -> jsonl ; runtime_server -> snapshot :8001\n  gate_session_controller poll :8001 -> session + QR :8000\n  frontend poll :8000 -> map SVG + A* + voice"
  });
})();
