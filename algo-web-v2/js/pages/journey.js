/* journey.js — trang chung: một xe đi qua toàn pipeline, mỗi chặng link tới trang cơ chế.
 * Mỗi how-step có field `page` — render.js vẽ link "chi tiết: <trang>".
 */
(function () {
  "use strict";
  TG.definePage({
    id: "journey",
    group: "common",
    title: "Hành trình một chiếc xe",
    navLabel: "Hành trình",
    order: 24,
    prev: null,
    next: null,

    /* ① Chức năng & vị trí */
    fn: {
      text: "Trang này kể lại pipeline theo thứ tự một xe thật trải qua. Xe lọt vào khung camera, được [[track]] theo dõi, sang camera kề giữ nguyên [[GID]], đỗ vào ô, nhận phiên QR, dẫn đường rồi rời bãi. Mỗi chặng dẫn tới trang cơ chế tương ứng."
    },

    /* ② Vì sao cần */
    why: {
      paras: [
        "Các trang cơ chế trình bày theo chiều dọc kỹ thuật: mỗi trang đào sâu một khối. Cách đó làm khó thấy khối này bắt đầu khi nào và nhận dữ liệu từ đâu. Hành trình một xe là câu chuyện ngược lại — theo thời gian, một đối tượng, qua mọi khối.",
        "Đọc hành trình trước giúp đặt đúng vị trí từng cơ chế; đọc trang cơ chế sau cho số liệu và ngoại lệ thật."
      ]
    },

    /* ③ Cách hoạt động — 8 chặng */
    how: [
      {
        id: "3.1",
        name: "Chặng 1 — xe lọt vào khung camera",
        paras: [
          "Xe qua cổng và đi vào vùng nhìn của cam1. Pixel của nó phải nằm trong [[ROI]] mới được phân tích; vùng ngoài bị mask từ đầu nên chuyển động ngoài bãi không tạo detection."
        ],
        page: "roi-mask"
      },
      {
        id: "3.2",
        name: "Chặng 2 — từ blob thành track",
        paras: [
          "[[MOG2]] đánh dấu pixel xe là foreground; contour filter giữ blob có diện tích và hình dáng đáng tin. [[Kalman filter]] dự đoán vị trí kế tiếp và [[LAPJV]] gán detection sang đúng track — xe nhận một [[lid]] và track chuyển confirmed sau vài frame."
        ],
        page: "track-lifecycle"
      },
      {
        id: "3.3",
        name: "Chặng 3 — sang tọa độ thế giới",
        paras: [
          "Mỗi quan sát được [[Homography]] chiếu từ pixel lên bản đồ centimet dùng chung. Nếu xe đi sát một xe khác, occlusion guard giữ hai [[track]] tách biệt thay vì để chúng dính thành một blob."
        ],
        page: "homography"
      },
      {
        id: "3.4",
        name: "Chặng 4 — qua ranh giới hai camera",
        paras: [
          "Tiến tới mép khung cam1, hệ thống mở [[HandoffEntry]] mang vị trí và gallery màu sang cam2. Khi xe xuất hiện bên kia, fragment được chấm theo hành lang dự đoán và appearance rồi nhận lại đúng [[GID]] cũ thay vì cấp mới."
        ],
        page: "handoff-dormant"
      },
      {
        id: "3.5",
        name: "Chặng 5 — đỗ vào ô",
        paras: [
          "Xe dừng trong ô đỗ: parking detector xác nhận ô có vật thể che, slot binder kiểm chứng dwell rồi mở [[parking episode]] gán GID vào ô. Từ đây ô báo đỏ và phiên đỗ được theo dõi độc lập với track."
        ],
        page: "slot-binder"
      },
      {
        id: "3.6",
        name: "Chặng 6 — phiên và mã QR",
        paras: [
          "Khi xe cắt vạch cổng vào, gate controller tạo session và phát QR trên kiosk trong 120 giây. Người dùng quét mã để nhận trang cá nhân; controller còn ghim session vào đúng ô mà [[Runtime snapshot]] báo xe đã đỗ."
        ],
        page: "gate-session"
      },
      {
        id: "3.7",
        name: "Chặng 7 — dẫn đường trên bản đồ",
        paras: [
          "Frontend poll session controller, vẽ ô mục tiêu lên bản đồ SVG và tính tuyến bằng [[A*]] trên lane graph. Câu chỉ dẫn tiếng Việt đọc trước khúc rẽ; lệch tuyến quá tám mươi đơn vị bản đồ thì cảnh báo [[off-route]] và tính lại đường."
        ],
        page: "routing-astar"
      },
      {
        id: "3.8",
        name: "Chặng 8 — rời ô và ra cổng",
        paras: [
          "Xe lùi khỏi ô: vision báo trống mở departure token năm giây giữ GID, nên xe quay lại ngay vẫn là chủ cũ. Cắt vạch exit đóng phiên sạc; mọi sự kiện của hành trình nằm trong predictions.jsonl để replay kiểm chứng offline."
        ],
        page: "predictions-jsonl"
      }
    ],

    /* ④ Số liệu & công thức */
    formulas: [
      {
        name: "Ngân sách thời gian của một vòng đời",
        expr: "handoff 45 frame · stale cùng cam 12 s · dormant retention 60 s · departure token 5 s · QR 120 s",
        note: "các cửa sổ thời gian quyết định xe còn được nhận lại hay bị coi là xe mới",
        src: "backend/main_detect/src/techgar/cross_camera_manager.py:147-186"
      }
    ],
    params: [
      { name: "handoff_ttl", value: "45 frame", kind: "class-default", role: "entry handoff sống bao lâu chờ fragment ở cam kề", src: "backend/main_detect/src/techgar/cross_camera_manager.py:147" },
      { name: "same-camera stale", value: "12.0 s", kind: "class-default", role: "cửa sổ ngắn cho hồi sinh cùng camera trong hành trình", src: "backend/main_detect/src/techgar/cross_camera_manager.py:182" },
      { name: "identity_retention", value: "60 s", kind: "class-default", role: "dormant identity sống tối đa chờ xe chuyển động lại", src: "backend/main_detect/src/techgar/cross_camera_manager.py:159" },
      { name: "departure token", value: "5.0 s", kind: "runtime", role: "giữ GID cho xe vừa rời ô để nhận lại", src: "backend/main_detect/two_camera.py:1883" },
      { name: "QR display", value: "120.0 s", kind: "class-default", role: "mã QR phiên hiện trên kiosk bao lâu", src: "backend/session_manager.py:29" },
      { name: "off-route warn", value: "80 đơn vị map", kind: "runtime", role: "lệch tuyến quá mức này thì cảnh báo + tính lại", src: "frontend/src/app/App.tsx:746-750" }
    ],

    /* ⑤ Hình thật */
    figures: [
      {
        src: "assets/real/motion-moving-car.jpg",
        alt: "Xe đang chuyển động trong cam1 được gán track với bbox",
        caption: "Chặng đầu của hành trình: xe trong ROI của cam1 được motion pipeline tách thành blob rồi gán track.",
        origin: "session_hiep_thai1/f1500/cam1"
      },
      {
        src: "assets/real/slot-binder-parked-hiep3-f155.jpg",
        alt: "Xe đen GID1 dừng gọn trong ô D01 được bind",
        caption: "Chặng đỗ: xe của GID1 nằm trong ô D01 với overlap 0.733, binder mở parking episode ngay sau frame này.",
        origin: "session_hiep3/f155/cam1"
      },
      {
        src: "assets/real/voice-guidance-map.jpg",
        alt: "Bản đồ frontend với tuyến xanh dẫn tới ô đỗ",
        caption: "Chặng frontend: tuyến A* vẽ xanh trên bản đồ, câu chỉ dẫn và cảnh báo lạc tuyến phục vụ tài xế.",
        origin: "frontend_artifacts/f0/cam0"
      }
    ],
    noFigureReason: null,
    interactive: null,

    /* ⑥ Giới hạn & lỗi thật */
    limits: [
      {
        text: "Hành trình lý tưởng này giả định xe đi qua mọi chặng. Xe đỗ sẵn trước khi hệ thống chạy không có track, nên nhảy thẳng tới trạng thái occupied của detector mà không có GID hay phiên QR.",
        evidence: { session: "verify_cur_session_hiep3", frame: 466, status: "CONFIRMED" }
      },
      {
        text: "Mỗi chặng đều có thể hỏng riêng: mất dấu ở vùng mù giữa hai cam, nhầm xe ở cổng dormant, hay timeout token năm giây. Các ca thật được tập hợp ở trang failure gallery.",
        evidence: { status: "CONFIRMED" }
      },
      {
        text: "Thứ tự chặng kể theo một xe là cách trình bày; pipeline thật xử lý mọi xe song song mỗi frame, không phải một xe lần lượt qua từng khối."
      }
    ],

    /* ⑦ Nguồn */
    sources: [
      { ref: "backend/main_detect/two_camera.py", kind: "runtime", note: "vòng lặp chính điều phối mọi chặng" },
      { ref: "backend/main_detect/src/techgar/cross_camera_manager.py:147-186", kind: "class-default", note: "các cửa sổ thời gian trong hành trình" },
      { ref: "backend/main_detect/src/techgar/slot_vehicle_binder.py:215-218", kind: "class-default", note: "ngưỡng bind vào ô" },
      { ref: "backend/gate_session_controller.py:455-534", kind: "runtime", note: "entry và exit crossing" },
      { ref: "frontend/src/routing/routeEngine.ts:31-119", kind: "runtime", note: "A* trên lane graph" },
      { ref: "algo-web-v2/js/manifest.js", kind: "illustrative", note: "thứ tự 23 trang cơ chế (minh họa)" }
    ],
    pseudocode: "xe vao -> blob trong ROI -> track confirmed (lid)\nco the -> homography -> toa do the gioi\nra mep cam1 -> handoff -> fragment cam2 nhan lai GID\ndung trong o -> parking detector + binder -> episode parked\ncat vach cong -> session + QR 120s\nfrontend: poll -> route A* -> voice\ntroi o -> departure token 5s giu GID\ncat vach exit -> dong phien; log trong predictions.jsonl"
  });
})();
