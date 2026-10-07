/* snapshot-api.js — Trang 16: Runtime snapshot API (cổng 8001).
 * Nguồn số liệu đã xác minh: .analysis/algo-web-v2-redesign/notes/snapshot-api.md
 */
(function () {
  "use strict";
  TG.definePage({
    id: "snapshot-api",
    group: "gate-frontend",
    title: "Runtime snapshot API — cổng ra của backend",
    navLabel: "Snapshot API",
    order: 16,
    prev: "slot-binder",
    next: "gate-session",

    /* ① Chức năng & vị trí */
    fn: {
      text: "[[Runtime snapshot]] là bản chụp JSON của toàn bộ trạng thái pipeline tại một frame, được server HTTP trên cổng 8001 phục vụ cho gate controller và frontend. Đây là ranh giới duy nhất giữa thế giới Python của tracking và thế giới web của phiên đỗ xe."
    },

    /* ② Vì sao cần */
    why: {
      paras: [
        "Tracking chạy trong một tiến trình Python, còn quản lý phiên và bản đồ web chạy ở những tiến trình khác, có thể trên máy khác. Không có một hợp đồng dữ liệu ổn định, mỗi thay đổi nhỏ trong registry nội bộ sẽ phá vỡ mọi consumer phía sau.",
        "Snapshot giải bài toán đó bằng cách chuẩn hóa một lần: đầu vào của consumer không còn là cấu trúc tracker mà là một JSON có [[schema version]] riêng. Consumer đọc được bao nhiêu thì dùng bấy nhiêu, và backend tự do đổi nội bộ miễn là giữ nguyên trường đã cam kết."
      ]
    },

    /* ③ Cách hoạt động */
    how: [
      {
        id: "3.1",
        name: "Chu kỳ publish: một lần serialize cho mọi reader",
        paras: [
          "Cuối mỗi vòng lặp tracking, two_camera gọi build_runtime_snapshot rồi đẩy kết quả vào RuntimeState.publish_snapshot. Hàm này deep-copy snapshot, serialize sang bytes UTF-8 một lần duy nhất, rồi giữ cả hai bản trong một condition variable.",
          "Reader HTTP chỉ cần sao chép tham chiếu bytes đã mã hóa sẵn. Không reader nào trả lại chi phí serialize, và vì producer mã hóa ngoài lock nên ghi mới không chạy đồng thời với đọc."
        ],
        values: [
          { k: "điểm publish trong vòng lặp", v: "build_runtime_snapshot + publish_snapshot", kind: "runtime", src: "backend/main_detect/two_camera.py:2849-2878" },
          { k: "serialize trước lock", v: "deepcopy + json.dumps ngoài condition", kind: "runtime", src: "backend/main_detect/runtime_server.py:106-114" }
        ]
      },
      {
        id: "3.2",
        name: "Hợp đồng: schema_version 2 và những trường cam kết",
        paras: [
          "runtime_contract.build_runtime_snapshot chỉ chuẩn hóa, không thay đổi quyết định tracking. Payload gồm vehicles, parking_slots, slot_layout, parking_episodes, cameras, coordinate_space, pending_handoffs, retired_global_ids và recent_events.",
          "Identity đã qua trạng thái kết thúc (exited hoặc expired) bị lọc khỏi vehicles — consumer không bao giờ nhìn thấy chúng nữa. Trường observed chỉ true khi identity còn thành viên đang hoạt động; parked_slot_id gắn từ episode đang ở trạng thái parked.",
          "Dung lượng bị siết có chủ đích: recent_observed_path giữ tối đa mười hai điểm đo gần nhất của manager, và recent_events giữ tối đa một trăm sự kiện cuối. Một camera được báo online khi dấu thời gian của nó không quá năm giây so với đồng hồ snapshot."
        ],
        values: [
          { k: "schema version", v: "2", kind: "class-default", src: "backend/main_detect/src/techgar/runtime_contract.py:12" },
          { k: "trạng thái kết thúc bị lọc", v: "exited, expired", kind: "class-default", src: "backend/main_detect/src/techgar/runtime_contract.py:13" },
          { k: "recent_observed_path", v: "≤ 12 điểm", kind: "class-default", src: "backend/main_detect/src/techgar/runtime_contract.py:115" },
          { k: "recent_events", v: "≤ 100 sự kiện", kind: "class-default", src: "backend/main_detect/src/techgar/runtime_contract.py:167" },
          { k: "camera online nếu skew", v: "≤ 5 giây", kind: "class-default", src: "backend/main_detect/src/techgar/runtime_contract.py:128-129" }
        ]
      },
      {
        id: "3.3",
        name: "Các route HTTP và hành vi khi chưa sẵn sàng",
        paras: [
          "GET /api/runtime/status trả running, frame_index, timestamp và danh sách camera đang có frame. GET /api/runtime/snapshot trả toàn bộ payload; GET /api/runtime/map chỉ trả coordinate_space và slot_layout cho consumer chỉ cần bản đồ.",
          "GET /api/runtime/events trả đúng mảng recent_events. Hai route camera phục vụ ảnh: .jpg trả frame JPEG mới nhất, .mjpg mở stream multipart với boundary 'frame' và ghi mỗi frame khi encoder xong.",
          "Khi chưa có snapshot nào được publish, các route dữ liệu trả 503 kèm thông báo Runtime snapshot is not ready. CORS mở hoàn toàn và mọi đáp ứng đều gắn Cache-Control no-store."
        ],
        values: [
          { k: "route dữ liệu", v: "status · snapshot · map · events · gates", kind: "runtime", src: "backend/main_detect/runtime_server.py:274-325" },
          { k: "route ảnh", v: "cameras/camN.jpg · cameras/camN.mjpg", kind: "runtime", src: "backend/main_detect/runtime_server.py:326-331" },
          { k: "chưa sẵn sàng", v: "503 + error JSON", kind: "runtime", src: "backend/main_detect/runtime_server.py:289" },
          { k: "CORS + cache", v: "Allow-Origin: * · no-store", kind: "runtime", src: "backend/main_detect/runtime_server.py:250-251" }
        ]
      },
      {
        id: "3.4",
        name: "Stream ảnh: mailbox chỉ-mới-nhất, không hàng đợi",
        paras: [
          "Tracking chỉ tốn công render debug khi có người xem. needs_frame trả true khi camera đó có request trong vòng năm giây gần nhất và đã tới nhịp stream. Không ai mở .mjpg thì pipeline bỏ qua hoàn toàn bước render overlay.",
          "Khi publisher đẩy frame, nó đè lên ô pending duy nhất của camera đó và frame cũ hơn bị hủy ngay. Một thread encoder riêng lấy frame có index nhỏ nhất, chạy cv2.imencode rồi lưu bytes JPEG vào mailbox.",
          "Thiết kế này chống hiệu ứng trễ chồng chất: một browser chậm không thể tạo hàng đợi khiến frame phát ra ngày càng cũ. Cái giá là reader chậm sẽ bị nhảy frame, nhưng luôn nhìn thấy trạng thái mới nhất."
        ],
        values: [
          { k: "nhịp stream mặc định", v: "8.0 fps (--stream-fps)", kind: "runtime", src: "backend/main_detect/runtime_server.py:403" },
          { k: "JPEG quality", v: "80, clamp 30–95", kind: "runtime", src: "backend/main_detect/runtime_server.py:97" },
          { k: "cửa sổ subscriber", v: "5.0 giây kể từ request cuối", kind: "runtime", src: "backend/main_detect/runtime_server.py:178-180" },
          { k: "mailbox", v: "1 frame pending mỗi cam (latest-only)", kind: "runtime", src: "backend/main_detect/runtime_server.py:134-138" },
          { k: "timeout chờ frame", v: "2.0 giây", kind: "class-default", src: "backend/main_detect/runtime_server.py:205" }
        ]
      },
      {
        id: "3.5",
        name: "POST /gates: validate đơn vị rồi ghi nguyên tử",
        paras: [
          "GET /api/runtime/gates đọc file gate_zones.json và trả bản normalize: bắt buộc coordinate_space là world, entry_gate và exit_gate có hai điểm khác nhau và direction positive hoặc negative.",
          "POST cùng route kiểm tra snapshot đã sẵn sàng, rồi bắt unit của payload khớp đúng unit runtime đang chạy. Một gate vẽ trên hệ tọa độ khác sẽ bị từ chối. File được ghi qua đường .tmp rồi replace, nên reader không bao giờ đọc nửa file."
        ],
        values: [
          { k: "coordinate_space bắt buộc", v: "world", kind: "runtime", src: "backend/main_detect/runtime_server.py:55-56" },
          { k: "ghi nguyên tử", v: "viết .tmp rồi replace", kind: "runtime", src: "backend/main_detect/runtime_server.py:75-80" },
          { k: "unit phải khớp runtime", v: "mismatch → ValueError", kind: "runtime", src: "backend/main_detect/runtime_server.py:60-61" }
        ]
      }
    ],

    /* ④ Số liệu & công thức */
    formulas: [
      {
        name: "Nhịp publish ảnh",
        expr: "interval = 1 / stream_fps",
        subst: "1 / 8.0",
        result: "= 0.125 s (125 ms)",
        note: "frame đến dày hơn nhịp này bị bỏ qua trong publish_frame",
        src: "backend/main_detect/runtime_server.py:96"
      },
      {
        name: "Độ trễ camera báo online",
        expr: "age_ms = (clock_ns − captured_ns) / 10⁶",
        subst: "age ≤ 5 × 10⁹ ns",
        result: "= 5 s",
        note: "camera quá 5 giây không có timestamp mới bị báo offline trong payload",
        src: "backend/main_detect/src/techgar/runtime_contract.py:127-129"
      }
    ],
    params: [
      { name: "api_port", value: "8001", kind: "runtime", role: "cổng HTTP mặc định của runtime server", src: "backend/main_detect/runtime_server.py:402" },
      { name: "schema_version", value: "2", kind: "class-default", role: "phiên bản hợp đồng snapshot (v2 thêm parking_episodes)", src: "backend/main_detect/src/techgar/runtime_contract.py:12" },
      { name: "stream_fps", value: "8.0", kind: "runtime", role: "nhịp tối đa đẩy frame ảnh vào mailbox", src: "backend/main_detect/runtime_server.py:403" },
      { name: "jpeg_quality", value: "80 (clamp 30–95)", kind: "runtime", role: "chất lượng JPEG cho .jpg và .mjpg", src: "backend/main_detect/runtime_server.py:97" },
      { name: "recent_events cap", value: "100", kind: "class-default", role: "số sự kiện gần nhất giữ trong snapshot", src: "backend/main_detect/src/techgar/runtime_contract.py:167" },
      { name: "online skew", value: "5 giây", kind: "class-default", role: "ngưỡng dấu thời gian để báo camera online", src: "backend/main_detect/src/techgar/runtime_contract.py:129" }
    ],

    /* ⑤ Hình thật */
    figures: [
      {
        src: "assets/real/snapshot-api-debug-cam1-f600.jpg",
        alt: "Frame debug cam1 với HUD frame counter, ô đỗ xanh/đỏ và xe đang tracked",
        caption: "Frame debug cam1 (session_hiep_sang8, f600) — đúng loại ảnh mà route cameras/cam1.mjpg phục vụ: HUD đếm frame và 15/30 ô trống, outline xanh là ô free, đỏ là occupied.",
        origin: "session_hiep_sang8/f600/cam1"
      }
    ],
    noFigureReason: null,
    interactive: null,

    /* ⑥ Giới hạn & lỗi thật */
    limits: [
      {
        text: "Không có lớp xác thực nào trước các route: CORS mở hoàn toàn và không kiểm tra credential. Server giả định mạng LAN tin cậy (suy luận từ header, không có code auth)."
      },
      {
        text: "Snapshot chỉ mới bằng chu kỳ publish cuối cùng. Consumer đọc giữa hai lần publish luôn nhận trạng thái cũ một nhịp — bản chất của mô hình pull, không phải bug.",
        evidence: { session: "runtime_server", status: "CONFIRMED" }
      },
      {
        text: "Identity đã exited/expired biến mất khỏi vehicles mà không có trường báo trước. Consumer muốn biết xe đã thoát phải theo dõi recent_events hoặc tự so hai lần đọc.",
        evidence: { session: "runtime_contract", status: "CONFIRMED" }
      },
      {
        text: "Reader chậm trên .mjpg bị nhảy frame do mailbox chỉ-mới-nhất. Đây là quyết định có chủ đích để không tích lũy frame cũ, không phải mất dữ liệu bất thường.",
        evidence: { session: "runtime_server", status: "CONFIRMED" }
      }
    ],

    /* ⑦ Nguồn */
    sources: [
      { ref: "backend/main_detect/runtime_server.py:84-104", kind: "runtime", note: "RuntimeState: condition, encoder thread, defaults" },
      { ref: "backend/main_detect/runtime_server.py:106-139", kind: "runtime", note: "publish_snapshot serialize-trước-lock + publish_frame latest-only" },
      { ref: "backend/main_detect/runtime_server.py:141-180", kind: "runtime", note: "encoder thread + needs_frame cửa sổ 5s" },
      { ref: "backend/main_detect/runtime_server.py:272-333", kind: "runtime", note: "toàn bộ route GET" },
      { ref: "backend/main_detect/runtime_server.py:335-353", kind: "runtime", note: "POST /gates validate + save" },
      { ref: "backend/main_detect/runtime_server.py:355-395", kind: "runtime", note: "_serve_jpeg + _serve_mjpeg multipart" },
      { ref: "backend/main_detect/runtime_server.py:398-405", kind: "runtime", note: "CLI defaults: host/port/stream-fps/jpeg-quality" },
      { ref: "backend/main_detect/src/techgar/runtime_contract.py:8-13", kind: "class-default", note: "schema v2 + terminal states" },
      { ref: "backend/main_detect/src/techgar/runtime_contract.py:56-118", kind: "runtime", note: "slots + vehicles: observed, parked_slot_id, path ≤12" },
      { ref: "backend/main_detect/src/techgar/runtime_contract.py:120-167", kind: "runtime", note: "cameras online 5s + coordinate_space + events ≤100" },
      { ref: "backend/main_detect/two_camera.py:2849-2878", kind: "runtime", note: "điểm gọi build+publish trong vòng lặp tracking" },
      { ref: "backend/main_detect/two_camera.py:2883-2887", kind: "runtime", note: "stream_needed qua needs_frame mỗi cam" }
    ],
    pseudocode: "LOOP tracking (moi chu ky):\n  snapshot <- build_runtime_snapshot(registry, slots, calibration...)\n  publish_snapshot(snapshot)   # deepcopy + dumps ngoai lock\n  FOR cam IN {cam1, cam2}:\n    IF needs_frame(cam):       # co subscriber trong 5s\n      publish_frame(cam, rendered)\n\nHTTP GET /snapshot -> tra bytes da encode san (hoac 503)\nGET /cameras/camN.mjpg -> lap: cho frame moi -> ghi multipart\nPOST /gates -> validate unit == runtime unit -> ghi .tmp -> replace"
  });
})();
