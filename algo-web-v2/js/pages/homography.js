/* homography.js — Trang 3 (R0 mẫu): Homography & shared map.
 * Nguồn số liệu đã xác minh: .analysis/algo-web-v2-redesign/notes/homography.md
 */
(function () {
  "use strict";
  /* artifact bất biến của bản cal-20260927 — số trên trang pin về đây,
   * không trỏ file config live (có thể đổi khi hiệu chuẩn lại). */
  var DRAFT = "backend/main_detect/config/shared_map_01/attempts/cal-20260927-160513-decd3099/calibration_draft.json";
  TG.definePage({
    id: "homography",
    group: "setup",
    title: "Homography & shared map",
    navLabel: "Homography",
    order: 3,
    prev: "parking-slots",
    next: "brightness",

    /* ① Chức năng & vị trí */
    fn: {
      text: "[[Homography]] chuyển tọa độ pixel của mỗi camera sang một bản đồ mặt đất chung đo bằng centimet. Nhờ đó hai camera nói cùng một hệ quy chiếu. Đây là bước hiệu chuẩn chạy một lần trước runtime, và mọi cơ chế hai camera phía sau đều dựa trên nó."
    },

    /* ② Vì sao cần */
    why: {
      paras: [
        "Không có bản đồ chung, vị trí của xe trên cam1 và cam2 chỉ là hai bộ tọa độ pixel không liên quan. Khi một chiếc xe đi qua vùng chồng lấn giữa hai camera, hệ thống không so được khoảng cách vật lý giữa hai quan sát. Nó buộc phải cấp một [[GID]] mới.",
        "[[trajectory score]] cũng cần vị trí theo centimet và vận tốc theo centimet/giây. Những đại lượng đó chỉ tồn tại sau khi pixel được chiếu xuống mặt phẳng đo được. Một calibration lệch vài centimet đã đủ làm các ngưỡng khoảng cách ở nhóm trang hai camera mất ý nghĩa."
      ]
    },

    /* ③ Cách hoạt động */
    how: [
      {
        id: "3.1",
        name: "Tám cặp điểm tương ứng, không phải bốn",
        paras: [
          "Quy trình hiệu chuẩn gồm bốn bước: chụp một frame từ mỗi camera, đánh dấu điểm trên ảnh, điền tọa độ thực đo vào CSV, rồi chạy build.",
          "Thuật toán đang dùng là [[rectangle_line_v1]], yêu cầu đúng tám cặp [[correspondence point]]. Bốn góc A, B, C, D thuộc một hình chữ nhật đo bằng thước trên mặt bãi; bốn điểm V1–V4 nằm dọc một vạch kẻ đường.",
          "Trong bản cal-20260927 (snapshot khi viết trang), A–D là tấm đo 20 × 30 cm trên mặt bãi mô hình: A(0,0), B(20,0), C(20,30), D(0,30) theo CSV. Đây là dữ liệu thế giới duy nhất đưa vào phép fit — mọi tọa độ centimet khác đều suy ra từ tám cặp pixel này.",
          "Một homography chỉ cần tối thiểu bốn điểm để giải, nhưng bốn góc A–D chỉ kiểm soát vùng lân cận hình chữ nhật. Bốn điểm V1–V4 phải nằm trên cùng một đường thẳng và trải đủ rộng theo trục dài bãi xe. Kiểm tra này ép phép fit bám đúng xa hơn vùng góc.",
          "Hiệu quả của lớp điểm vạch đo được ngay trong file. Phép fit chỉ-với-bốn-góc có sai số đối xứng p95 bằng 19.394 px. Phép fit tám điểm giảm còn 2.658 px — các điểm V cải thiện sai số phía camera đối diện khoảng bảy lần.",
          "Lưu ý về cách diễn giải chất lượng: V1–V4 là điểm đưa vào fit, không phải điểm kiểm chứng tách biệt. File calibration ghi thẳng điều này qua trường evidence_kind và independent_validation = false."
        ],
        values: [
          { k: "số cặp điểm bắt buộc", v: "8 (A,B,C,D,V1–V4)", kind: "class-default", src: "backend/main_detect/tools/rectangle_line_calibration.py:43" },
          { k: "sai lệch đường V1–V4 tối đa", v: "8 px @1280", kind: "class-default", src: "backend/main_detect/tools/rectangle_line_calibration.py:77" },
          { k: "khoảng cách tối thiểu giữa 2 điểm", v: "4 px @1280", kind: "class-default", src: "backend/main_detect/tools/rectangle_line_calibration.py:68" },
          { k: "span V1–V4 tối thiểu", v: "max(80 px, 0.75 × AB)", kind: "class-default", src: "backend/main_detect/tools/rectangle_line_calibration.py:72" },
          { k: "p95 đối xứng trước/sau thêm V", v: "19.394 → 2.658 px", kind: "config", src: DRAFT + ":1972" }
        ]
      },
      {
        id: "3.2",
        name: "Đường fit: ghép hai camera rồi gắn thước centimet",
        paras: [
          "Build chia phép chiếu thành hai lớp. Lớp đầu tính homography tương đối cam2 sang cam1 trong không gian chuẩn hóa về 1280 pixel, dùng cả tám cặp bằng least squares thuần. Ở chế độ rectangle-line, RANSAC bị tắt vì không điểm nào được phép loại lặng.",
          "Lớp thứ hai lấy tọa độ centimet thực đo của A–D để tính homography metric. Kết quả: cam1 dùng ma trận metric trực tiếp, cam2 dùng metric nhân relative. Cả hai camera cùng chiếu xuống hệ tọa độ A(0,0), B(AB,0), C(AB,AD), D(0,AD)."
        ],
        values: [
          { k: "chế độ fit cho 8 cặp", v: "use_all_pairs, min_inliers=8, ratio=1.0", kind: "runtime", src: "backend/main_detect/tools/rectangle_line_calibration.py:88" },
          { k: "ma trận cam2", v: "metric @ relative", kind: "runtime", src: "backend/main_detect/tools/calibrate_shared_map.py:472" }
        ]
      },
      {
        id: "3.3",
        name: "Fit gate — ba ngưỡng loại calibration tệ",
        paras: [
          "Sau khi fit, hàm [[fit gate]] chấm lại toàn bộ tám điểm; vì RANSAC không loại điểm nào, mọi cặp đều bị đếm sai số. Calibration bị từ chối khi sai số đối xứng vượt một trong hai ngưỡng pixel, hoặc sai số cross-camera vượt ngưỡng centimet.",
          "Bản cal-20260927 qua gate với biên rộng: p95 đối xứng 2.658 px trên trần 8.5 px, lớn nhất 3.035 px trên trần 12 px. Sai số cross-camera lớn nhất 0.398 cm trên trần 2.0 cm. Nếu hiệu chuẩn lại, các con số này thuộc về bản mới — xem trường calibration_id trong config.",
          "Gate chỉ quyết định fit_ready; file chỉ được promote sang reviewed_fit sau khi một người mở preview và chấp nhận bằng mắt — bước approve này ghi visual_review.accepted vào file."
        ],
        values: [
          { k: "max_error_cm", v: "2.0 cm", kind: "class-default", src: "backend/main_detect/tools/rectangle_line_calibration.py:112" },
          { k: "max p95_symmetric_px", v: "8.5 px", kind: "class-default", src: "backend/main_detect/tools/rectangle_line_calibration.py:112" },
          { k: "max_symmetric_px", v: "12.0 px", kind: "class-default", src: "backend/main_detect/tools/rectangle_line_calibration.py:112" }
        ]
      },
      {
        id: "3.4",
        name: "shared_map_anchor — điểm nào của xe được chiếu",
        paras: [
          "Tracker một camera theo dõi điểm đáy-giữa của [[bounding box]] vì điểm đó ổn định cho gán [[Kalman filter]] cục bộ. Nhưng với hai camera đối diện, điểm đó rơi về hai đầu đối diện của cùng một chiếc xe. Docstring trong code nêu đây là lý do calibration cho phép chọn lại điểm chiếu.",
          "Khi [[shared_map_anchor]] là bbox_center, điểm đưa lên bản đồ là tâm đứng của khung (cy trừ đi một nửa chiều cao). Cả hai bản cal-20260927 và cal-20261006 đều chọn bbox_center qua mục tracking_defaults; mặc định của class vẫn là bottom_center.",
          "Cờ anchor này cũng quyết định khung tham chiếu khi so IoU giữa fragment và identity. Đổi anchor là đổi cả cách hệ thống hiểu hai khung có trùng nhau không."
        ],
        values: [
          { k: "shared_map_anchor (class default)", v: "bottom_center", kind: "class-default", src: "backend/main_detect/src/techgar/cross_camera_manager.py:168" },
          { k: "shared_map_anchor (runtime)", v: "bbox_center", kind: "config", src: "backend/main_detect/config/two_camera.shared_cm_01.json:1461" }
        ]
      },
      {
        id: "3.5",
        name: "Ngưỡng suy ra từ chiều dài ô đỗ",
        paras: [
          "Các ngưỡng khoảng cách identity chỉ có nghĩa khi so với kích thước xe thật. File calibration luôn chứa polygon ô đỗ theo đơn vị thế giới, nên code lấy chiều dài ô làm thước đo sẵn có. Nó fit minAreaRect lên từng polygon, lấy cạnh dài, rồi median trên toàn bộ ô.",
          "Với cal-20260927, 60 ô cho [[median slot length]] bằng 9.267515 cm. Con số này là đơn vị cm của mô hình bãi thu nhỏ, không phải mét xe thật. Bốn ngưỡng nhận dạng được suy ra bằng cách nhân nó với bội số cố định.",
          "Luật hợp nhất: giá trị CLI luôn thắng; nếu không có thì ngưỡng hiệu dụng là min(giá trị config, giá trị suy ra). Comment trong code giải thích: calibration đóng vai trò trần để file cũ không kéo ngưỡng nhận dạng xa quá kích thước ô đo được."
        ],
        values: [
          { k: "median_slot_length", v: "9.267515 cm (60 ô)", kind: "derived", src: "backend/main_detect/two_camera.py:394" },
          { k: "bội số handoff/prediction/dormant/duplicate", v: "1.75 / 2.75 / 1.75 / 0.50", kind: "class-default", src: "backend/main_detect/two_camera.py:387" },
          { k: "luật hợp nhất", v: "CLI > min(config, derived)", kind: "runtime", src: "backend/main_detect/two_camera.py:447" }
        ]
      },
      {
        id: "3.6",
        name: "EMA vận tốc trên bản đồ thế giới",
        paras: [
          "Vị trí thế giới sau chiếu được đạo hàm thành vận tốc bằng [[EMA]]. Mỗi trục cập nhật riêng: vận tốc mới bằng 0.65 lần vận tốc cũ cộng 0.35 lần vận tốc đo tức thời.",
          "Quan sát đầu tiên của một identity không có vận tốc cũ nên hệ thống dùng thẳng vận tốc đo tức thời. Vận tốc EMA nuôi phần direction và speed trong điểm khớp quỹ đạo. Xe đỗ yên kéo EMA về gần không — một mảnh của lỗi mất lineage GID ở trang handoff."
        ],
        values: [
          { k: "hệ số EMA cũ/mới", v: "0.65 / 0.35", kind: "class-default", src: "backend/main_detect/src/techgar/cross_camera_manager.py:676" }
        ]
      }
    ],

    /* ④ Số liệu & công thức */
    formulas: [
      {
        name: "Ngưỡng suy ra từ ô đỗ",
        expr: "thr = median_slot_length × bội số",
        subst: "9.2675 × 1.75",
        result: "≈ 16.22 cm (cal-20260927)",
        note: "handoff_match_distance và dormant_match_distance cùng bội số 1.75; live cal-20261006: 9.0557×1.75 ≈ 15.85",
        src: "backend/main_detect/two_camera.py:388"
      },
      {
        name: "Prediction radius",
        expr: "thr = median_slot_length × 2.75",
        subst: "9.2675 × 2.75",
        result: "≈ 25.49 cm (cal-20260927)",
        note: "vùng dự đoán khi handoff mất dấu ngắn; live cal-20261006: 9.0557×2.75 ≈ 24.90",
        src: "backend/main_detect/two_camera.py:389"
      },
      {
        name: "Duplicate distance",
        expr: "thr = median_slot_length × 0.50",
        subst: "9.2675 × 0.50",
        result: "≈ 4.63 cm (cal-20260927)",
        note: "khoảng cách coi hai identity là một xe; live cal-20261006: 9.0557×0.50 ≈ 4.53",
        src: "backend/main_detect/two_camera.py:391"
      },
      {
        name: "Hợp nhất config với suy ra",
        expr: "resolved = min(config, derived)",
        subst: "min(35.0, 16.218)",
        result: "= 16.218 cm (cal-20260927)",
        note: "snapshot cal-20260927: dormant siết từ 35.0 còn 16.218, handoff/prediction giữ 15.0/25.0, duplicate siết còn 4.634. Live cal-20261006 (median 9.0557): dormant ≈15.85, prediction ≈24.90 (derived giờ thấp hơn config 25.0), duplicate ≈4.53; handoff_match vẫn 15.0 (cap)",
        src: "backend/main_detect/two_camera.py:447"
      },
      {
        name: "EMA vận tốc",
        expr: "v = 0.65·v_old + 0.35·v_measured",
        subst: "0.65 × 40 + 0.35 × 0",
        result: "= 26 cm/s",
        note: "ví dụ xe đang 40 cm/s rồi một frame đo đứng yên — EMA rơi từ từ chứ không về 0 ngay (minh họa)",
        src: "backend/main_detect/src/techgar/cross_camera_manager.py:676"
      }
    ],
    params: [
      { name: "calibration_algorithm", value: "rectangle_line_v1", kind: "config", role: "thuật toán fit đang dùng của file calibration", src: "backend/main_detect/config/two_camera.shared_cm_01.json:5" },
      { name: "fit p95_symmetric_px", value: "2.658", kind: "config", role: "sai số đối xứng p95 thực đo của cal-20260927 (trần 8.5)", src: DRAFT + ":1730" },
      { name: "fit max_error_cm", value: "0.398", kind: "config", role: "sai số cross-camera lớn nhất của cal-20260927 (trần 2.0)", src: DRAFT + ":1729" },
      { name: "shared_map_anchor", value: "bbox_center", kind: "config", role: "điểm bbox được chiếu lên bản đồ; mặc định class là bottom_center", src: "backend/main_detect/config/two_camera.shared_cm_01.json:1461" },
      { name: "handoff_match_distance (resolved)", value: "15.0 cm", kind: "derived", role: "min(config 15.0, derived); derived 16.218 (cal-20260927) / ≈15.85 (cal-20261006) — cap 15.0 luôn thắng", src: "backend/main_detect/two_camera.py:2168" },
      { name: "dormant_match_distance (resolved)", value: "16.218 cm (cal-20260927); live ≈15.85 (cal-20261006)", kind: "derived", role: "min(config 35.0, derived 1.75×median_slot)", src: "backend/main_detect/two_camera.py:2182" },
      { name: "EMA hệ số", value: "0.65 / 0.35", kind: "class-default", role: "cũ / mới trong ước lượng vận tốc thế giới", src: "backend/main_detect/src/techgar/cross_camera_manager.py:676" }
    ],

    /* ⑤ Hình thật */
    figures: [
      { src: "assets/real/homography-cam1-points.jpg", alt: "Frame cam1 với 8 điểm hiệu chuẩn được đánh dấu", caption: "Frame cam1 trong phiên hiệu chuẩn cal-20260927: bốn góc A–D của tấm đo 20×30 cm (nhãn vàng) và bốn điểm V1–V4 dọc vạch kẻ (nhãn xanh).", origin: "shared_map_01/cal-20260927/f0/cam1" },
      { src: "assets/real/homography-cam2-points.jpg", alt: "Frame cam2 với cùng 8 điểm nhìn từ phía đối diện", caption: "Cùng tám điểm nhìn từ cam2 — hai camera đối diện nên mỗi điểm vật lý xuất hiện ở một vị trí pixel khác trên mỗi view.", origin: "shared_map_01/cal-20260927/f0/cam2" }
    ],
    noFigureReason: null,
    interactive: "homography",

    /* ⑥ Giới hạn & lỗi thật */
    limits: [
      {
        text: "Calibration đóng băng theo thời điểm chụp. Dời camera, đổi lens hay rung mount làm sai lệch mọi phép chiếu phía sau mà không có cảnh báo; workflow bắt buộc chụp lại (capture, mark, build)."
      },
      {
        text: "Sai số báo cáo là sai số trên tập fit, không phải kiểm chứng độc lập. File ghi evidence_kind = training_fit_not_independent_validation và independent_validation = false, nên 0.398 cm chỉ nói rằng fit khớp dữ liệu nạp vào.",
        evidence: { session: "cal-20260927", status: "CONFIRMED" }
      },
      {
        text: "Không tìm thấy đường re-validation nào ở runtime: fit_gate chỉ chạy khi build/approve (suy luận từ hai điểm dùng transforms đã đọc). Lệch phát sinh sau đó sẽ âm thầm làm xấu các ngưỡng centimet phía sau."
      },
      {
        text: "Homography giả định điểm nằm trên mặt phẳng đất; điểm cao hơn mặt phẳng (nóc xe) chiếu sai vị trí (suy luận). Đây là một lý do anchor chỉ được chọn giữa đáy và tâm khung."
      }
    ],

    /* ⑦ Nguồn */
    sources: [
      { ref: "backend/main_detect/tools/rectangle_line_calibration.py:20-44", kind: "class-default", note: "LABELS 8 điểm, schema bắt buộc" },
      { ref: "backend/main_detect/tools/rectangle_line_calibration.py:56-108", kind: "class-default", note: "kiểm tra hình học A–D/V1–V4 + fit all-8 + evidence_kind" },
      { ref: "backend/main_detect/tools/rectangle_line_calibration.py:112-148", kind: "class-default", note: "fit_gate 2.0cm/8.5px/12px + approve fit_ready→reviewed_fit" },
      { ref: "backend/main_detect/tools/calibrate_shared_map.py:396-473", kind: "runtime", note: "fit relative cam2→cam1 + gắn metric A–D" },
      { ref: "backend/main_detect/tools/calibrate_shared_map.py:1795-1805", kind: "config", note: "CLI override cho ngưỡng gate" },
      { ref: "backend/main_detect/config/two_camera.shared_cm_01.json:4-5", kind: "config", note: "status + algorithm của config live; calibration_id đổi khi hiệu chuẩn lại (trang này minh họa cal-20260927)" },
      { ref: "backend/main_detect/config/two_camera.shared_cm_01.json:1460-1468", kind: "config", note: "tracking_defaults anchor + matching_defaults (cả hai bản cal đều bbox_center)" },
      { ref: DRAFT + ":1725-1731", kind: "config", note: "rectangle_line_fit của cal-20260927: p95 2.658 / max 3.035 px / max 0.398 cm" },
      { ref: DRAFT + ":1955-1976", kind: "config", note: "evidence_kind, before_p95 19.394, independent_validation của cal-20260927" },
      { ref: "backend/main_detect/two_camera.py:381-412", kind: "class-default", note: "SLOT_MATCHING_MULTIPLES + median_slot_length" },
      { ref: "backend/main_detect/two_camera.py:415-447", kind: "runtime", note: "derive_matching_defaults + resolve_matching_distance" },
      { ref: "backend/main_detect/two_camera.py:2159-2195", kind: "runtime", note: "đọc tracking_defaults + resolve 4 ngưỡng + fallback" },
      { ref: "backend/main_detect/src/techgar/cross_camera_manager.py:660-678", kind: "class-default", note: "EMA vận tốc 0.65/0.35" },
      { ref: "backend/main_detect/src/techgar/cross_camera_manager.py:1455-1472", kind: "runtime", note: "_bbox_anchor: bottom_center vs bbox_center + lý do" },
      { ref: "backend/main_detect/src/techgar/cross_camera_manager.py:5216-5220", kind: "runtime", note: "anchor quyết định bbox tham chiếu khi so IoU" },
      { ref: "backend/main_detect/src/techgar/cross_camera_manager.py:8707-8714", kind: "runtime", note: "anchor đi vào telemetry observation" },
      { ref: "backend/main_detect/src/techgar/prediction_writer.py:259", kind: "runtime", note: "anchor đi vào world_observation trong predictions" }
    ],
    pseudocode: "BUILD (offline, 1 lần):\n  pairs <- 8 cap {A,B,C,D,V1..V4} tu CSV + paired_ground_points\n  kiem tra hinh hoc: A-D loi, V1-V4 thang hang <=8px, span du rong\n  relative <- least_squares(cam2 -> cam1, 8 cap)  # khong RANSAC\n  metric   <- findHomography(A..D pixel -> toa do cm)\n  H_cam1 = metric ; H_cam2 = metric @ relative\n  fit_gate: p95_px<=8.5, max_px<=12, max_cm<=2.0 -> fit_ready\n  nguoi xem preview -> approve -> reviewed_fit\n\nRUNTIME (moi frame, moi track):\n  anchor = (cx, cy)          # bottom_center\n  anchor = (cx, cy - h/2)    # neu shared_map_anchor = bbox_center\n  world  = H_cam x anchor    # cm\n  v <- 0.65*v + 0.35*(world - world_truoc)/dt"
  });
})();
