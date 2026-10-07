/* parking-detector.js — Trang 14: nhận diện ô đỗ trống/đầy bằng thị giác.
 * Nguồn: .analysis/algo-web-v2-redesign/notes/parking-detector.md
 */
(function () {
  "use strict";
  TG.definePage({
    id: "parking-detector",
    group: "binding",
    title: "Parking detector — ô đỗ trống hay đầy",
    navLabel: "Parking detector",
    order: 14,
    prev: "gid-conflict",
    next: "slot-binder",

    /* ① Chức năng & vị trí */
    fn: {
      text: "Detector trả lời một câu duy nhất cho mỗi ô đỗ: ô này đang bị vật thể che hay đang trống. Nó đọc thuần pixel trong polygon ô đỗ và không cần [[track]] nào cả. Kết quả `occupied` cùng bằng chứng đi kèm được đẩy sang slot-binder ở trang sau để gán với xe cụ thể."
    },

    /* ② Vì sao cần */
    why: {
      paras: [
        "Tracker của hệ thống là motion-based: nó chỉ thấy xe đang chuyển động. Một xe đỗ yên nhiều phút không sinh ra track nào, nên chỉ nhìn tracker thì ô đỗ dường như trống. Kênh thị giác riêng này lấp lỗ hổng đó bằng cách đo trực tiếp mật độ texture trong ô.",
        "Một ngưỡng pixel đơn lẻ không đủ tin cậy: vạch kẻ ô, bóng cây và xe màu sáng đều làm sai lệch. Detector vì thế kết hợp ba lớp bảo vệ. Đó là bỏ phiếu đa biến thể, lọc vạch biên, và đợi trạng thái bền theo thời gian."
      ]
    },

    /* ③ Cách hoạt động */
    how: [
      {
        id: "3.1",
        name: "Ensemble 25 biến thể bỏ phiếu",
        paras: [
          "Mỗi frame chuyển sang không gian LAB và lấy kênh sáng L. Hệ thống dựng 25 biến thể ảnh từ năm mức CLAHE nhân năm mức gamma quanh điểm gốc `base_clahe=2.0`, `base_gamma=2.8`.",
          "Mỗi biến thể đi qua cùng một chuỗi: blur nhẹ, adaptive threshold nhị phân hóa, median lọc nhiễu, rồi dilate nối vùng. Trong mỗi ô đỗ, tỉ lệ pixel sáng sau lọc dưới ngưỡng 0.12 được tính một phiếu trống.",
          "Ô nào nhận từ 12 phiếu trống trở lên coi như trống tức thời. Bỏ phiếu đa biến thể khiến quyết định không lệ thuộc vào một mức sáng duy nhất."
        ],
        values: [
          { k: "số biến thể", v: "25 = 5 clahe × 5 gamma", kind: "runtime", src: "backend/main_detect/src/techgar/parking_detector.py:454-456" },
          { k: "ngưỡng phiếu trống", v: "filtered_ratio < 0.12", kind: "runtime", src: "backend/main_detect/src/techgar/parking_detector.py:527" },
          { k: "đa số cần", v: "12/25 phiếu", kind: "derived", src: "backend/main_detect/src/techgar/parking_detector.py:533" }
        ]
      },
      {
        id: "3.2",
        name: "Ba lớp mask trong một ô đỗ",
        paras: [
          "Mỗi ô có ba vùng lồng nhau tính sẵn một lần. `local_mask` là toàn bộ polygon. `analysis_mask` co lại bằng erosion để bỏ 12 phần trăm viền ngoài, nơi vạch kẻ ô hay chạm.",
          "`core_mask` là polygon thu nhỏ còn 80 phần trăm quanh centroid, nơi thân xe nằm chắc nhất. `analysis_boundary` là vành một pixel của analysis_mask, dùng để nhận biết component nào chạm biên.",
          "Vì ba mask tính trước từ polygon gốc, đổi kích thước ảnh chỉ cần scale tọa độ một lần khi khởi động."
        ],
        values: [
          { k: "border_ignore_ratio", v: "0.12 × cạnh ngắn ROI", kind: "class-default", src: "backend/main_detect/src/techgar/parking_detector.py:263-274" },
          { k: "core_scale runtime", v: "0.80 (mặc định class 0.55)", kind: "runtime", src: "backend/main_detect/two_camera.py:2278" }
        ]
      },
      {
        id: "3.3",
        name: "Selective line filter — gỡ vạch, giữ xe",
        paras: [
          "Sau threshold, nhiều component trắng là vạch kẻ ô chứ không phải xe. Filter chạy connected components trong analysis_mask và chấm từng miếng theo hình dáng.",
          "Một component bị coi là vạch khi nó chạm biên analysis, kéo dài quá 45 phần trăm chiều ô, và mỏng hơn 18 phần trăm kích thước ô. Component đủ dày hoặc phủ đủ core vẫn được bảo vệ vì đó là dáng xe.",
          "Ở chế độ selective, vạch không bị xoá trọn component. Thuật toán fit một đường thẳng Huber qua component và chỉ xoá dải pixel mỏng bám sát đường đó.",
          "Vùng xe dày cạnh vạch được distance transform đánh dấu bảo vệ trước. Nhờ đó một pixel cầu nối giữa vạch và xe không làm mất cả chiếc xe."
        ],
        values: [
          { k: "line_min_span_ratio", v: "0.45", kind: "class-default", src: "backend/main_detect/src/techgar/parking_detector.py:127" },
          { k: "line_max_thickness_ratio", v: "0.18", kind: "class-default", src: "backend/main_detect/src/techgar/parking_detector.py:128" },
          { k: "selective_line_filter", v: "true khi không legacy", kind: "runtime", src: "backend/main_detect/two_camera.py:2280" }
        ]
      },
      {
        id: "3.4",
        name: "Core rescue — cứu ô có xe mà vote bỏ sót",
        paras: [
          "Xe màu sáng hoặc ít texture đôi khi bị adaptive threshold nuốt gần hết. Khi ấy đa số biến thể phiếu trống dù ô thực sự có xe.",
          "Pass 1 kiểm chứng lại bằng hai dấu hiệu core. `central_blob` đòi vùng core sáng trên 18 phần trăm và component lớn nhất phủ trên 8 phần trăm core. `textured_dense_blob` chấp nhận ô nhiễu tạp hơn khi raw ratio trên 0.30 và có từ hai component core trở lên.",
          "Một trong hai dấu hiệu đủ để lật kết luận thành có xe. Trong dữ liệu replay hiện có, cứu này chưa từng phải lật một vote đa số thật."
        ],
        values: [
          { k: "core_ratio_threshold", v: "0.18", kind: "class-default", src: "backend/main_detect/src/techgar/parking_detector.py:130" },
          { k: "core_component_threshold", v: "0.08", kind: "class-default", src: "backend/main_detect/src/techgar/parking_detector.py:131" },
          { k: "textured dense", v: "raw ≥ 0.30 & ≥2 components", kind: "derived", src: "backend/main_detect/src/techgar/parking_detector.py:423-427" }
        ]
      },
      {
        id: "3.5",
        name: "Stable evidence — đổi trạng thái theo dwell",
        paras: [
          "Kết quả instant không đổi trạng thái ngay. `accept_evidence` chỉ commit một bộ evidence một lần theo timestamp nguồn, nên kết quả worker trễ tới sau bị gác bỏ.",
          "Ô đang có xe muốn chuyển trống phải thấy exit_empty_votes đạt đa số ở ngưỡng khắt khe hơn 0.08, đồng thời không có core rescue. Ô trống muốn chuyển có xe chỉ cần instant_occupied.",
          "Mỗi hướng chuyển cần số lần xác nhận và thời gian dwell riêng. Có xe cần hai mẫu trong ít nhất 0.5 giây; trống cần ba mẫu trong ít nhất một giây.",
          "Khoảng cách giữa hai evidence quá 1.5 giây reset bộ đếm. Trước khi đủ evidence khởi tạo, ô được giữ ở trạng thái có xe giả định."
        ],
        values: [
          { k: "occupied_seconds", v: "0.5 s, ≥2 mẫu", kind: "runtime", src: "backend/main_detect/two_camera.py:1788" },
          { k: "empty_seconds", v: "1.0 s, ≥3 mẫu", kind: "runtime", src: "backend/main_detect/two_camera.py:1789" },
          { k: "exit_ratio", v: "0.08 < enter 0.12", kind: "runtime", src: "backend/main_detect/two_camera.py:1787" }
        ]
      },
      {
        id: "3.6",
        name: "Worker bất đồng bộ & kiểm soát độ tươi",
        paras: [
          "Phân tích 25 biến thể là phần việc nặng nên live chạy trong thread pool hai worker, mỗi camera một future. Replay đồng bộ chạy thẳng trong vòng lặp theo nhịp parking_fps.",
          "Kết quả hoàn thành quá một giây tuổi bị drop với lý do result_too_old. Evidence không theo thứ tự thời gian cũng bị từ chối để state không bị viết ngược.",
          "Thứ tự áp dụng cố ý: parking evidence vào trước identity allocation. Một ô vừa xác nhận trống có thể mở token recovery, nên xử lý trễ sẽ để track mới chiếm GID sai."
        ],
        values: [
          { k: "result age limit", v: "1.0 s", kind: "runtime", src: "backend/main_detect/two_camera.py:1791-1795" },
          { k: "apply trước identity", v: "two_camera.py comment", kind: "runtime", src: "backend/main_detect/two_camera.py:2519-2522" }
        ]
      }
    ],

    /* ④ Số liệu & công thức */
    formulas: [
      {
        name: "Phiếu trống của một biến thể",
        expr: "empty_vote ⟺ countNonZero(filtered) / analysis_area < ratio_thr",
        subst: "ô B02 hiep3: filtered = 0.022 < 0.12 → phiếu trống",
        result: "25/25 phiếu → ô trống",
        note: "raw_ratio của cùng ô đó là 0.122 vì còn vạch; filter đã loại đúng",
        src: "backend/main_detect/src/techgar/parking_detector.py:526-530"
      },
      {
        name: "Quyết định instant",
        expr: "is_free ⟺ empty_votes ≥ 12, rồi core rescue có thể lật lại",
        subst: "ô B05 hiep3: votes 0/25, filtered 0.417 → instant_occupied",
        result: "occupied = true",
        note: "ô A01 cùng frame có 25/25 phiếu trống và filtered_ratio 0.000",
        src: "backend/main_detect/src/techgar/parking_detector.py:536-549"
      },
      {
        name: "Hysteresis enter/exit",
        expr: "vào: instant_occupied ≥2 mẫu trong ≥0.5 s · ra: exit_votes ≥12 ở 0.08, ≥3 mẫu trong ≥1.0 s",
        subst: "vùng giữa 0.08–0.12 là đệm — ô E03 hiep3 có 17/25 exit votes nhưng 25/25 enter votes",
        result: "giữ trạng thái cũ khi chỉ thấy một phía ngưỡng",
        note: "hai ngưỡng khác nhau ngăn trạng thái nhấp nháy quanh một mức duy nhất",
        src: "backend/main_detect/src/techgar/parking_detector.py:626-640"
      }
    ],
    params: [
      { name: "ratio_thr (enter)", value: "0.12", kind: "runtime", role: "ngưỡng phiếu trống mỗi biến thể; class default 0.20 bị runtime ghi đè", src: "backend/main_detect/two_camera.py:1786,2330" },
      { name: "exit_ratio_thr", value: "0.08", kind: "runtime", role: "ngưỡng khắt khe hơn để xác nhận ô thật sự trống", src: "backend/main_detect/two_camera.py:1787" },
      { name: "occupied_seconds", value: "0.5 s / 2 mẫu", kind: "runtime", role: "dwell tối thiểu trước khi nhận có xe", src: "backend/main_detect/src/techgar/parking_detector.py:637-639" },
      { name: "empty_seconds", value: "1.0 s / 3 mẫu", kind: "runtime", role: "dwell tối thiểu trước khi nhận trống", src: "backend/main_detect/src/techgar/parking_detector.py:637-639" },
      { name: "evidence gap reset", value: "1.5 s", kind: "class-default", role: "khoảng lặng làm mất pending đếm dở", src: "backend/main_detect/src/techgar/parking_detector.py:624-625" },
      { name: "use_edge_recheck", value: "false tại runtime", kind: "runtime", role: "pass 2 Canny edge tồn tại nhưng tắt trong two_camera", src: "backend/main_detect/two_camera.py:2275" }
    ],

    /* ⑤ Hình thật */
    figures: [
      {
        src: "assets/real/parking-detector-votes-hiep3-f466.jpg",
        alt: "Ba ô đỗ cam2 hiep3 f466: một ô có xe và hai ô trống với số phiếu khác nhau",
        caption: "Cam2 session_hiep3 f466: ô B05 chứa xe đen nên 0/25 phiếu trống và filtered_ratio 0.417. Ô A01 trống sạch 25/25. Ô B02 trống dù raw_ratio 0.122 đã quá ngưỡng 0.12 — line filter loại vạch kẻ nên filtered_ratio chỉ còn 0.022.",
        origin: "session_hiep3/f466/cam2"
      },
      {
        src: "assets/real/parking-detector-bw-hiep3-f466.jpg",
        alt: "Overlay runtime của detector trên cam2: ô xanh trống, ô đỏ có xe",
        caption: "Cùng frame ở debug stream: mỗi polygon ô đỗ tô xanh khi trống và đỏ khi có xe sau stable evidence. Overlay báo 14/30 ô trống — đây chính là output mà slot-binder và prediction writer tiêu thụ.",
        origin: "session_hiep3/f466/cam2"
      }
    ],
    noFigureReason: null,
    interactive: null,

    /* ⑥ Giới hạn & lỗi thật */
    limits: [
      {
        text: "Bằng chứng là pixel nên nhạy ánh sáng và bóng. Ô B02 cho thấy raw_ratio vượt ngưỡng chỉ vì vạch kẻ. Nếu line filter bỏ sót một vạch dày bất thường, ô trống vẫn có thể báo có xe trong một mẫu.",
        evidence: { session: "verify_cur_session_hiep3", frame: 466, status: "CONFIRMED" }
      },
      {
        text: "Core rescue là lớp bảo hiểm chưa từng lật vote thật: quét 17 session replay không có trường hợp nào rescue ghi đè đa số trống. Hiệu quả cứu xe sáng màu trong thực tế vì thế chưa được chứng minh bằng dữ liệu.",
        evidence: { session: "verify_cur_session_*", frame: null, status: "UNSURE" }
      },
      {
        text: "Trước khi đủ evidence khởi tạo, ô được giữ ở trạng thái có xe giả định. Khởi động hệ thống vì thế báo bãi đầy cho đến khi worker đầu tiên xác nhận trống — hành vi chủ đích để không hứa chỗ chưa rõ.",
        evidence: { session: "verify_cur_session_hiep3", frame: 1, status: "CONFIRMED" }
      },
      {
        text: "Detector chỉ nói ô có vật thể che, không biết đó là xe nào hay có phải xe không. Xe đạp, thùng hàng hay bóng dày đều có thể đếm là có xe — bước gán danh tính là việc của slot-binder ở trang sau.",
        evidence: { session: "verify_cur_session_hiep3", frame: 466, status: "CONFIRMED" }
      }
    ],

    /* ⑦ Nguồn */
    sources: [
      { ref: "backend/main_detect/src/techgar/parking_detector.py:97-141", kind: "class-default", note: "constructor + toàn bộ ngưỡng mặc định" },
      { ref: "backend/main_detect/src/techgar/parking_detector.py:228-319", kind: "class-default", note: "precompute 3 mask ROI + boundary + core" },
      { ref: "backend/main_detect/src/techgar/parking_detector.py:321-416", kind: "runtime", note: "selective line filter fitLine + distanceTransform" },
      { ref: "backend/main_detect/src/techgar/parking_detector.py:439-600", kind: "runtime", note: "detect(): 25 variants vote + pass 1 rescue + pass 2 edge" },
      { ref: "backend/main_detect/src/techgar/parking_detector.py:602-645", kind: "runtime", note: "accept_evidence: monotonic + dwell hysteresis + ready" },
      { ref: "backend/main_detect/two_camera.py:2271-2290", kind: "runtime", note: "wiring runtime: edge_recheck off, core_scale 0.80, stable_evidence" },
      { ref: "backend/main_detect/two_camera.py:2519-2614", kind: "runtime", note: "apply trước identity + result age guard + worker pool" },
      { ref: "backend/main_detect/experiment_test/output/verify_cur_session_hiep3/predictions.jsonl:467", kind: "runtime", note: "parking_evidence B05/A01/B02: votes, filtered_ratio, raw_ratio" }
    ],
    pseudocode: "detect(frame):\n  L = LAB(frame).L\n  moi (clahe, gamma) trong 25 bien the:\n    T = adaptive_threshold(gamma(clahe(L)))\n    moi o: filtered = loc_vach(T[o])\n    ratio < 0.12 -> empty_vote++ ; < 0.08 -> exit_vote++\n  is_free = votes >= 12 ; rescue -> occupied\n\naccept_evidence(results, ts):\n  neu ts <= ts_cu -> bo (khong monotonic)\n  moi o: dem mau dong y + do dwell\n  du count(2|3) va thoi gian(0.5|1.0s) -> doi occupied"
  });
})();
