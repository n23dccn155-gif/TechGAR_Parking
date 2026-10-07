/* routing-astar.js — Trang 19: Tìm đường A* trên lane-graph.
 * Nguồn số liệu đã xác minh: .analysis/algo-web-v2-redesign/notes/routing-astar.md
 * Mô tả code frontend ở chế độ đọc — trang này không sao chép logic.
 */
(function () {
  "use strict";
  TG.definePage({
    id: "routing-astar",
    group: "gate-frontend",
    title: "Định tuyến A* trên lane-graph",
    navLabel: "Routing A*",
    order: 19,
    prev: "frontend-dataflow",
    next: "voice-guidance",

    /* ① Chức năng & vị trí */
    fn: {
      text: "Khi session có ô đích, frontend tính tuyến đường ngắn nhất từ cổng vào tới cửa ô đỗ đó bằng [[A*]]. Thuật toán chạy trên một đồ thị làn đường xây sẵn từ geometry, không chạy trên pixel."
    },

    /* ② Vì sao cần */
    why: {
      paras: [
        "Tài xế không đọc được bản đồ ô đỗ trừu tượng. Họ cần một đường kẻ cụ thể nói 'đi theo hướng này'. Đường đó phải tôn trọng làn một chiều và không được cắt xuyên qua ô đỗ của người khác.",
        "Vị trí xe thay đổi liên tục nên tuyến cũng phải tính lại được từ vị trí hiện tại. Nếu chỉ tính một lần từ cổng, mọi pha rẽ sai của tài xế sẽ làm tuyến hiển thị vô nghĩa.",
        "Đồ thị làn tách mối quan tâm đúng chỗ. Geometry quyết định xe được phép đi đâu, còn A* chỉ quyết định đi đường nào là ngắn nhất trong phần được phép đó."
      ]
    },

    /* ③ Cách hoạt động */
    how: [
      {
        id: "3.1",
        name: "laneGraph — đồ thị làn đường dựng sẵn",
        paras: [
          "buildLaneGraph tạo nút junction trên ba làn dọc tại mọi tung độ đáng chú ý. Bộ tung độ gồm tâm mỗi hàng ô cộng với hai connector ngang ở đỉnh và đáy bãi.",
          "Làn phải là trục chính một chiều nối entrance lên exit theo thứ tự từ dưới lên. Làn trái và làn giữa chạy hai chiều theo chiều dọc. Cạnh ngang chỉ tồn tại ở hai connector để đường đi không đâm xuyên ô đỗ.",
          "Mỗi ô đỗ có một nút spot-entry nằm kề ô, nối vào đúng làn của zone đó một chiều. Ô zone E và F nối làn trái, C và D nối làn giữa, A và B nối làn phải. Sáu zone của bản đồ dùng chung chữ cái với prefix ô trong file slots camera: D, E, F do cam1 nhìn còn A, B, C do cam2 nhìn.",
          "Cổng cũng gắn vào đồ thị: updateGateNodesInGraph đặt nút entrance và exit tại trung điểm đoạn gate mà runtime API trả về. Sửa cổng trong config vì thế tự kéo theo nút đồ thị."
        ],
        values: [
          { k: "3 làn dọc", v: "right 1 chiều; left + center 2 chiều", kind: "runtime", src: "frontend/src/routing/laneGraph.ts:104-124" },
          { k: "cạnh ngang", v: "chỉ ở connector-top + connector-bottom", kind: "runtime", src: "frontend/src/routing/laneGraph.ts:128-131" },
          { k: "map zone → làn", v: "E,F trái; C,D giữa; A,B phải", kind: "runtime", src: "frontend/src/routing/laneGraph.ts:143-150" },
          { k: "entrance/exit node", v: "trung điểm p1p2 của gate", kind: "runtime", src: "frontend/src/routing/laneGraph.ts:172-182" }
        ]
      },
      {
        id: "3.2",
        name: "findRoute — A* với heuristic bảo đảm tối ưu",
        paras: [
          "findRoute giữ một open-set và hai bảng gồm distances là chi phí thật và estimates là chi phí cộng heuristic. Mỗi vòng lặp nhặt nút có estimate nhỏ nhất rồi nới lỏng các cạnh đi ra.",
          "Heuristic là khoảng Euclid tới đích nhân một hệ số scale. Hệ số đó là min của tỷ số giữa distance khai báo và độ dài Euclid trên mọi cạnh. Vì scale không vượt hệ số thật của cạnh nào, heuristic không bao giờ phóng đại chi phí còn lại. A* vì vậy giữ được tính tối ưu.",
          "Khi hai nút hòa estimate, code so tiếp chi phí thật rồi so thứ tự khai báo của nút. Tie-break bằng nodeOrder làm kết quả deterministic: cùng input luôn ra cùng tuyến.",
          "Đến đích thì dừng và lần ngược qua bảng previous để trả về nodeIds, edgeIds, points và distance tổng."
        ],
        values: [
          { k: "f(n) (minh họa)", v: "g(n) + h(n)", kind: "illustrative", src: "frontend/src/routing/routeEngine.ts:83-89" },
          { k: "h(n) (minh họa)", v: "euclid(n, đích) × min(cạnh.dist/euclid)", kind: "illustrative", src: "frontend/src/routing/routeEngine.ts:38-50" },
          { k: "tie-break", v: "f, rồi g, rồi thứ tự khai báo", kind: "runtime", src: "frontend/src/routing/routeEngine.ts:61-75" }
        ]
      },
      {
        id: "3.3",
        name: "routeFromPos — tính lại từ vị trí xe đang đứng",
        paras: [
          "Khi xe đã ở trong bãi, tuyến mới không thể bắt đầu từ cổng nữa. routeFromPos chiếu vị trí xe lên mọi cạnh lái được và lấy điểm chiếu gần nhất làm xuất phát.",
          "Cạnh có đầu là access-anchor hay spot-entry bị loại khỏi phép chiếu. Nếu điểm chiếu gần nhất xa hơn sáu mươi đơn vị bản đồ, hàm kết luận xe không nằm trên làn nào và trả null.",
          "Điểm chiếu thành một nút tạm vehicle-pos, nối bằng cạnh tạm một chiều theo đúng hướng hợp lệ của cạnh gốc. Làn một chiều chỉ được đi về phía đầu đích, nên re-route không bao giờ đề xuất đi ngược chiều.",
          "findExitRouteFromPos có fallback về ô đỗ cũ khi projection thất bại. findInboundRouteFromPos thì không: comment trong code hứa fallback từ cổng vào nhưng code thực tế trả null."
        ],
        values: [
          { k: "ngưỡng projection", v: "≤ 60 đơn vị bản đồ", kind: "runtime", src: "frontend/src/routing/routeEngine.ts:147" },
          { k: "loại cạnh khi chiếu", v: "đầu access-anchor / spot-entry", kind: "runtime", src: "frontend/src/routing/routeEngine.ts:136-138" },
          { k: "fallback exit", v: "findExitRoute(fallbackSpotId)", kind: "runtime", src: "frontend/src/routing/routeEngine.ts:183-187" },
          { k: "fallback inbound", v: "không có — code trả null", kind: "runtime", src: "frontend/src/routing/routeEngine.ts:204-207" }
        ]
      },
      {
        id: "3.4",
        name: "Lạc tuyến và tự đổi ô khi ô đích bị chiếm",
        paras: [
          "Mỗi nhịp cập nhật theo vị trí xe, App gọi checkIsOffRoute với ngưỡng tám mươi đơn vị bản đồ. Hàm đo khoảng cách vuông góc từ xe tới đoạn gần nhất của tuyến đang vẽ.",
          "Vượt ngưỡng thì UI báo đỏ, đọc cảnh báo bằng giọng nói và tính lại tuyến từ vị trí hiện tại. Tuyến mới thay thế tuyến cũ ngay trong cùng nhịp nếu tính được.",
          "Còn khi ô đích bị xe khác chiếm, App tự duyệt tối đa ba ô thay thế đã xếp hạng sẵn. Mỗi ứng viên được commit qua API selectSessionSpot; lỗi SPOT_RESERVED hay SPOT_NOT_AVAILABLE bị bỏ qua để thử ô kế. Hết phương án mới hiện cảnh báo."
        ],
        values: [
          { k: "ngưỡng off-route tại App", v: "80 đơn vị bản đồ", kind: "runtime", src: "frontend/src/app/App.tsx:746-750" },
          { k: "default của hàm", v: "75 — App override lên 80", kind: "runtime", src: "frontend/src/routing/voiceGuidance.ts:98" },
          { k: "ứng viên đổi ô", v: "tối đa 3, POST tuần tự", kind: "runtime", src: "frontend/src/app/App.tsx:438-449" },
          { k: "lỗi được bỏ qua", v: "SPOT_RESERVED, SPOT_NOT_AVAILABLE", kind: "runtime", src: "frontend/src/app/App.tsx:458-463" }
        ]
      }
    ],

    /* ④ Tham số & công thức */
    formulas: [
      {
        name: "Ước lượng A*",
        expr: "f(n) = g(n) + h(n)",
        subst: "g = chi phí thật đã đi; h = euclid × scale",
        result: "nút f nhỏ nhất được mở rộng trước",
        note: "g cộng dồn distance khai báo của cạnh; h ước lượng phần còn lại",
        src: "frontend/src/routing/routeEngine.ts:83-89"
      },
      {
        name: "Hệ số heuristic admissible",
        expr: "scale = min(edge.distance / euclid(edge))",
        subst: "min trên mọi cạnh hợp lệ của đồ thị",
        result: "h(n) ≤ chi phí thật còn lại → tuyến tối ưu",
        note: "distance khai báo của cạnh luôn ≥ euclid × scale nên heuristic không phóng đại",
        src: "frontend/src/routing/routeEngine.ts:38-46"
      },
      {
        name: "Khoảng cách vuông góc tới tuyến",
        expr: "d = min over segments distToSegment(xe, p_i, p_{i+1})",
        subst: "off-route khi d > 80",
        result: "cảnh báo + re-route từ vị trí hiện tại",
        note: "App truyền 80; default của hàm là 75",
        src: "frontend/src/routing/voiceGuidance.ts:91-107"
      }
    ],
    params: [
      { name: "ngưỡng projection routeFromPos", value: "60", kind: "runtime", role: "điểm chiếu xa hơn mức này thì xe không nằm trên làn nào, hàm trả null", src: "frontend/src/routing/routeEngine.ts:147" },
      { name: "ngưỡng off-route tại call site", value: "80", kind: "runtime", role: "App override default 75 của checkIsOffRoute", src: "frontend/src/app/App.tsx:749" },
      { name: "số ứng viên đổi ô", value: "3", kind: "runtime", role: "alternatives.best + tối đa hai phương án phụ, thử tuần tự", src: "frontend/src/app/App.tsx:438-441" },
      { name: "tâm ba làn dọc", value: "250 / 540 / 840", kind: "class-default", role: "left / center / right aisle centerX trong hệ bản đồ 1200×900", src: "frontend/src/geometry/parkingGeometry.ts:102-157" },
      { name: "centerline connector", value: "y = 90 / 790", kind: "class-default", role: "hai cạnh ngang duy nhất nối ba làn, ở đỉnh và đáy bãi", src: "frontend/src/geometry/parkingGeometry.ts:113-115" }
    ],

    /* ⑤ Hình thật */
    figures: [
      {
        src: "assets/real/routing-astar-map.jpg",
        alt: "Màn hình dẫn đường thật tới ô C10: tuyến A* xanh bám theo cạnh đồ thị, nút entrance và exit đặt tại trung điểm hai cổng",
        caption: "Tuyến thật do A* sinh ra trên UI. Đường xanh đi dọc làn phải một chiều rồi rẽ theo cạnh ngang vào nút spot-entry của C10.",
        origin: "frontend_artifacts/f0/cam0"
      }
    ],

    /* ⑥ Giới hạn & lỗi thật */
    limits: [
      { text: "Đồ thị làn là tĩnh. A* không biết xe khác đang đứng chắn làn hay công trình tạm thời; nó chỉ tối ưu trên cạnh được phép đi.", evidence: { status: "CONFIRMED" } },
      { text: "findInboundRouteFromPos không có fallback dù comment hứa ngược lại. Xe lệch khỏi mọi cạnh quá sáu mươi đơn vị sẽ mất tuyến vào hoàn toàn thay vì tính lại từ cổng.", evidence: { status: "CONFIRMED" } },
      { text: "Off-route là độ đo hình học thuần túy. Xe dừng đúng tuyến nhưng quay đầu ngược chiều vẫn được coi là đang đi đúng.", evidence: { status: "CONFIRMED" } },
      { text: "Auto-reroute chỉ chạy trong session mode của App. Kịch bản navigation không-session có đổi ô tự động hay không chưa được kiểm chứng trong mã nguồn đã đọc.", evidence: { status: "UNSURE" } }
    ],

    /* ⑦ Nguồn */
    sources: [
      { ref: "frontend/src/routing/laneGraph.ts:30-163", kind: "runtime", note: "buildLaneGraph — nút, cạnh, chiều, connector, spot-entry" },
      { ref: "frontend/src/routing/laneGraph.ts:165-183", kind: "runtime", note: "updateGateNodesInGraph — gate kéo nút đồ thị" },
      { ref: "frontend/src/routing/routeEngine.ts:31-119", kind: "runtime", note: "findRoute — A*, heuristic scale, tie-break" },
      { ref: "frontend/src/routing/routeEngine.ts:121-130", kind: "runtime", note: "findVehicleRoute / findExitRoute" },
      { ref: "frontend/src/routing/routeEngine.ts:132-208", kind: "runtime", note: "routeFromPos + 2 wrapper động" },
      { ref: "frontend/src/routing/routeEngine.ts:210-222", kind: "runtime", note: "routeUsesOnlyValidEdges — kiểm chiều cạnh" },
      { ref: "frontend/src/routing/voiceGuidance.ts:91-107", kind: "runtime", note: "checkIsOffRoute + distanceToSegment" },
      { ref: "frontend/src/app/App.tsx:438-475", kind: "runtime", note: "auto-reroute khi ô đích bị chiếm" },
      { ref: "frontend/src/app/App.tsx:717-768", kind: "runtime", note: "chọn hàm route theo mode + off-route handling" },
      { ref: "frontend/src/geometry/parkingGeometry.ts:82-241", kind: "class-default", note: "hằng số layout: làn, connector, cổng" }
    ]
  });
})();
