/* track-lifecycle.js — Trang 8: đời một track — tentative, confirmed, lost, expire.
 * Nguồn số liệu đã xác minh: .analysis/algo-web-v2-redesign/notes/track-lifecycle.md
 */
(function () {
  "use strict";
  TG.definePage({
    id: "track-lifecycle",
    group: "single-cam",
    title: "Track lifecycle",
    navLabel: "Lifecycle",
    order: 8,
    prev: "kalman-lapjv",
    next: "occlusion-watershed",

    /* ① Chức năng & vị trí */
    fn: {
      text: "Một [[track]] đi qua ba trạng thái: tentative khi mới sinh, confirmed khi đủ bằng chứng là xe thật, lost khi mất đo nhưng còn trong cửa sổ chờ. Trang này kể điều kiện chuyển trạng thái, cách coasting giữ mạng sống, và khi nào một fragment chết hẳn."
    },

    /* ② Vì sao cần */
    why: {
      paras: [
        "Một detection tốt một frame không chứng minh là xe — vệt nước hay speckle cũng sống được vài frame. Cổng tentative tồn tại để đối tượng phải được nhìn lại và dịch chuyển trước khi ra output.",
        "Ngược lại, mất đo một frame không chứng minh xe đã đi — nó có thể chỉ bị che. Cửa sổ lost giữ [[track]] sống bằng dự đoán trong lúc chờ, để một chiếc qua mái che không phải xin ID mới mỗi lần."
      ]
    },

    /* ③ Cách hoạt động */
    how: [
      {
        id: "3.1",
        name: "Sinh: fragment-scoped ID",
        paras: [
          "Detection không match ai được nhận một local ID tăng đơn điệu mới. Comment code giải thích: reuse ID cũ bằng appearance từng làm fragment evidence reset mỗi frame — local ID chỉ mô tả một mảnh quỹ đạo liên tục.",
          "Việc nhận lại danh tính toàn cục không nằm ở đây: đó là CrossCameraManager với cửa sổ ReID bảy trăm hai mươi frame. Track mới khai báo ngày sinh riêng — first_observation đóng băng, vì history có giới hạn không được phép kéo lùi điểm xuất phát.",
          "Trạng thái sinh ra là tentative, trừ khi cấu hình chỉ cần một quan sát để confirm."
        ],
        values: [
          { k: "local ID", v: "đơn điệu tăng, fragment-scoped", kind: "runtime", src: "backend/main_detect/src/techgar/motion_tracker.py:2012-2019" },
          { k: "ReID cửa sổ", v: "reid_ttl 720 frame (cross-camera)", kind: "class-default", src: "backend/main_detect/src/techgar/motion_tracker.py:48" },
          { k: "origin đóng băng", v: "first_observation_point/bbox/frame", kind: "runtime", src: "backend/main_detect/src/techgar/motion_tracker.py:2041-2044" }
        ]
      },
      {
        id: "3.2",
        name: "Confirm: hai bằng chứng cùng lúc",
        paras: [
          "Confirmed cần đủ số lần được nhìn VÀ đủ dịch chuyển từ điểm xuất phát. Thường là ba quan sát và mười hai pixel. Trong vùng priority chỉ cần hai quan sát trong vùng đó và ba pixel.",
          "Cặp điều kiện này chia hai loại nhiễu: blob đứng yên sống lâu không đủ displacement; blob nhấp nháy một frame không đủ lượt nhìn. Status được tính lại mỗi lần match nên track vẫn tentative nếu đang được gán nhưng chưa đủ bằng chứng."
        ],
        values: [
          { k: "visible count", v: "min_visible_count 3 (priority 2 + 2 obs ưu tiên)", kind: "class-default", src: "backend/main_detect/src/techgar/motion_tracker.py:2071-2082" },
          { k: "displacement", v: "≥12 px từ origin (priority 3 px)", kind: "class-default", src: "backend/main_detect/src/techgar/motion_tracker.py:2083-2094" },
          { k: "origin", v: "first_observation_point khi multiscale, else history[0]", kind: "runtime", src: "backend/main_detect/src/techgar/motion_tracker.py:2089-2093" }
        ]
      },
      {
        id: "3.3",
        name: "Matched và mất đo: hai chế độ sống",
        paras: [
          "Khi match, [[Kalman filter]] correct, counter tăng, invisible về không. Appearance trộn [[EMA]] bảy mươi lăm phần trăm cũ hai mươi lăm phần trăm mới — chỉ khi histogram được tin, nên blob xấu không làm bẩn mẫu xe.",
          "Mất đo thì coast: invisible tăng, dự đoán Kalman chạy tiếp cho tới hạn 0.40 giây rồi ghim anchor. association_state phân biệt coasting tự do với frozen_ambiguous khi đang trong interval merged/occlusion.",
          "Track mất đo gần một điểm bị [[ROI]] reject được gắn cờ roi_edge_starved. Cờ này báo lên GID manager rằng xe chết vì vào vùng chết của detector, không phải vì nó biến mất thật."
        ],
        values: [
          { k: "appearance EMA", v: "0.75 cũ + 0.25 mới, chỉ khi appearance_trusted", kind: "runtime", src: "backend/main_detect/src/techgar/motion_tracker.py:2151-2156" },
          { k: "merged/ambiguous", v: "không correct, kind occluded_prediction", kind: "runtime", src: "backend/main_detect/src/techgar/motion_tracker.py:2102-2115" },
          { k: "roi_edge_starved", v: "sticky tới khi match lại", kind: "runtime", src: "backend/main_detect/src/techgar/motion_tracker.py:2282-2301" },
          { k: "measurement log", v: "ring 8 đo gần nhất (time, point, box)", kind: "runtime", src: "backend/main_detect/src/techgar/motion_tracker.py:2146-2150" }
        ]
      },
      {
        id: "3.4",
        name: "Chết: expire và suspend",
        paras: [
          "Track chết khi invisible vượt TTL — chín mươi frame, hoặc 4.5 giây khi có timestamp. Comment giải thích: chín mươi frame ở 7 FPS là mười ba giây, dài hơn nhiều so với cửa sổ re-associate thực một phẩy năm đến ba giây.",
          "Expire khác nhau theo tuổi. CONFIRMED đi vào _exited_tracks để cross-camera còn đường nhận lại. TENTATIVE chưa từng đủ bằng chứng thì biến mất âm thầm, blob nhiễu không lọt ra output.",
          "Còn một cái chết có chủ đích nữa. Xe đã bind vào ô đỗ được suspend_track kéo khỏi association, vì motion tracker không cần theo dõi một chiếc không nhúc nhích.",
          "Cuối cùng, output public chỉ gồm CONFIRMED và LOST — tentative không bao giờ lộ ra ngoài tracker."
        ],
        values: [
          { k: "TTL", v: "90 frame hoặc 4.5 s (1.5×merged reacquire)", kind: "class-default", src: "backend/main_detect/src/techgar/motion_tracker.py:143-152" },
          { k: "expire", v: "CONFIRMED→_exited_tracks; TENTATIVE im lặng", kind: "runtime", src: "backend/main_detect/src/techgar/motion_tracker.py:2310-2317" },
          { k: "suspend", v: "parked_local_track_suspended", kind: "runtime", src: "backend/main_detect/src/techgar/motion_tracker.py:2175-2187" },
          { k: "output", v: "chỉ CONFIRMED ∪ LOST", kind: "runtime", src: "backend/main_detect/src/techgar/motion_tracker.py:2369" }
        ]
      }
    ],

    /* ④ Số liệu & công thức */
    formulas: [
      {
        name: "Điều kiện confirmed",
        expr: "visible ≥ 3 ∧ ‖now − first_observation‖ ≥ 12 px",
        subst: "visible=3, chạy được 14 px từ điểm sinh",
        result: "TENTATIVE → CONFIRMED",
        note: "priority: 2 obs (cả hai trong vùng) + 3 px; status tính lại mỗi match",
        src: "backend/main_detect/src/techgar/motion_tracker.py:2071-2094"
      },
      {
        name: "TTL kép theo frame và giây",
        expr: "expire ⇔ invis > 90 f ∨ (t_now − t_last_seen) > 4.5 s",
        subst: "7 FPS: 90 f ≈ 12.9 s — TTL giây chết trước",
        result: "thời gian thật thắng khi có timestamp",
        note: "TTL giây default = 1.5 × merged_reacquire_max_seconds 3.0",
        src: "backend/main_detect/src/techgar/motion_tracker.py:2189-2202"
      }
    ],
    params: [
      { name: "min_visible_count", value: "3", kind: "class-default", role: "số quan sát cần để confirm; priority 2", src: "backend/main_detect/src/techgar/motion_tracker.py:36" },
      { name: "min_confirm_displacement", value: "12 px (priority 3)", kind: "class-default", role: "quãng đường tối thiểu từ origin để chứng minh là xe", src: "backend/main_detect/src/techgar/motion_tracker.py:43" },
      { name: "lost_track_ttl", value: "90 frame", kind: "class-default", role: "trần invisible tính theo frame khi không có timestamp", src: "backend/main_detect/src/techgar/motion_tracker.py:37" },
      { name: "lost_track_ttl_seconds", value: "4.5 s", kind: "class-default", role: "TTL theo thời gian thật = 1.5 × merged_reacquire", src: "backend/main_detect/src/techgar/motion_tracker.py:70-71" },
      { name: "reid_ttl", value: "720 frame", kind: "class-default", role: "cửa sổ nhận lại danh tính của CrossCameraManager", src: "backend/main_detect/src/techgar/motion_tracker.py:48" },
      { name: "history_len", value: "10", kind: "class-default", role: "độ dài vệt quỹ đạo hiển thị/tính velocity fallback", src: "backend/main_detect/src/techgar/motion_tracker.py:38" },
      { name: "tracklet samples", value: "12 mẫu / 3 frame", kind: "class-default", role: "gallery appearance của từng local fragment", src: "backend/main_detect/src/techgar/motion_tracker.py:49-50" }
    ],

    /* ⑤ Hình thật */
    figures: [
      {
        src: "assets/real/lifecycle-confirmed.jpg",
        alt: "Frame cam1 thai1 với xe đen được khoanh xanh lá ghi lid18 confirmed sống 96 frame",
        caption: "thai1 cam1 f1500 (frame gốc + chú thích): lid18 ở trạng thái confirmed và matched. Chính track này sinh ở f1404 và từng coast frozen_ambiguous ở f1407 — xem hình trang kalman-lapjv cho cùng một đời.",
        origin: "session_hiep_thai1/f1500/cam1"
      }
    ],
    noFigureReason: null,

    /* ⑥ Giới hạn & lỗi thật */
    limits: [
      {
        text: "Confirm cần displacement từ origin — xe đỗ yên ngay từ đầu không bao giờ confirm được, vì nó đúng là không dịch chuyển. Slot occupancy đi đường khác (parking detector), không qua đời track."
      },
      {
        text: "Local ID là fragment-scoped bằng thiết kế: cùng một xe có thể xài vài lid qua các lần mất dấu. Danh tính ổn định là việc của GID manager, không phải của số lid."
      },
      {
        text: "TENTATIVE chết âm thầm — không vào _exited_tracks, không event. Khi audit, một fragment chưa confirm biến mất khó lần vết hơn là track confirmed bị expire.",
        evidence: null
      },
      {
        text: "Track phantom coasting/new với GID null sau motion burst đã được ghi nhận (E-C-006, UNSURE): cổng tentative chặn noise ra output nhưng không chặn noise nhận coasting ngân sách. Mã E-* là finding của chiến dịch verify-replay; danh mục đầy đủ ở trang failure-gallery.",
        evidence: { session: "nhiều session", status: "UNSURE" }
      }
    ],

    /* ⑦ Nguồn */
    sources: [
      { ref: "backend/main_detect/src/techgar/vehicle_tracker.py:20-62", kind: "runtime", note: "TrackStatus enum + fields TrackedVehicle" },
      { ref: "backend/main_detect/src/techgar/motion_tracker.py:2009-2069", kind: "runtime", note: "_create_or_reid: ID đơn điệu, comment fragment-scoped" },
      { ref: "backend/main_detect/src/techgar/motion_tracker.py:2071-2094", kind: "runtime", note: "_is_confirmable: count + displacement từ origin" },
      { ref: "backend/main_detect/src/techgar/motion_tracker.py:2096-2173", kind: "runtime", note: "_apply_detection: correct, EMA appearance, merged freeze" },
      { ref: "backend/main_detect/src/techgar/motion_tracker.py:2257-2309", kind: "runtime", note: "unmatched: coasting states, roi_edge_starved, LOST, expire check" },
      { ref: "backend/main_detect/src/techgar/motion_tracker.py:2189-2202", kind: "runtime", note: "_lost_beyond_ttl_seconds + comment 90f vs giây" },
      { ref: "backend/main_detect/src/techgar/motion_tracker.py:2175-2187", kind: "runtime", note: "suspend_track: parked fragment ra khỏi association" },
      { ref: "backend/main_detect/src/techgar/motion_tracker.py:2369", kind: "runtime", note: "output chỉ CONFIRMED ∪ LOST" }
    ],
    pseudocode: "sinh: detection khong match -> lid moi (tang don dieu)\n  status=TENTATIVE, origin dong bang\n\nmoi match:\n  merged/ambiguous -> coast (occluded_prediction)\n  binh thuong -> kalman.correct, invis=0, EMA appearance\n  status = CONFIRMED neu visible>=3 & disp>=12 (tinh lai)\n\nmoi frame khong match:\n  invis++, kalman.predict (hoac stale anchor)\n  CONFIRMED -> LOST\n  invis>90f hoac lost>4.5s -> expire\n  CONFIRMED -> _exited_tracks; TENTATIVE -> bien mat im lang\n\noutput: chi CONFIRMED + LOST"
  });
})();
