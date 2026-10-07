/* handoff-dormant.js — Trang 12: Handoff & dormant re-identification.
 * Nguồn số liệu đã xác minh: .analysis/algo-web-v2-redesign/notes/handoff-dormant.md
 * E-C-002 verify lại trực tiếp từ predictions.jsonl (không chép tóm tắt).
 */
(function () {
  "use strict";
  TG.definePage({
    id: "handoff-dormant",
    group: "multi-cam",
    title: "Handoff & dormant re-identification",
    navLabel: "Handoff & dormant",
    order: 12,
    prev: "trajectory-reid",
    next: "gid-conflict",

    /* ① Chức năng & vị trí */
    fn: {
      text: "Khi một xe sắp rời khung hình, hệ thống mở một [[HandoffEntry]] mang vị trí, vận tốc và gallery màu sang camera kề. Khi một track chết mà chưa tới được cam khác, [[GID]] của nó chuyển sang trạng thái [[dormant]] và chờ một fragment tương lai chứng minh lại."
    },

    /* ② Vì sao cần */
    why: {
      paras: [
        "Hai camera nhìn hai vùng khác nhau của cùng một bãi xe. Giữa chúng có vùng mù hoặc mép khung hình, nơi mọi local track đều chết. Không có cơ chế chuyển giao, mỗi lần qua ranh giới là một identity mới và toàn bộ lịch sử đỗ xe bị đứt.",
        "Mất dấu không chỉ xảy ra tại biên. Xe đỗ yên nhiều phút làm blob chuyển động biến mất, nên track chết ngay giữa khung hình. Dormant re-identification là cơ chế duy nhất nhận lại chiếc xe đó khi nó chuyển động trở lại."
      ]
    },

    /* ③ Cách hoạt động */
    how: [
      {
        id: "3.1",
        name: "Mở handoff khi xe tiến tới biên",
        paras: [
          "Mỗi frame, hệ thống tìm cạnh mà vận tốc hiện tại sẽ chạm sớm nhất trong 16 frame tới. Nếu cạnh đó kề một camera khác theo bảng [[edge adjacency]], một HandoffEntry được mở ngay trước khi xe biến mất.",
          "Entry mang theo vị trí thế giới cuối, vận tốc thế giới, kích thước khung và gallery màu của camera nguồn. Nếu identity đã từng xuất hiện trên camera đích, gallery riêng của camera đó cũng được đính kèm.",
          "Entry sống tối đa 45 frame và được làm mới mỗi frame còn thấy track nguồn. Entry bị huỷ sớm nếu identity đã có reservation ô đỗ hoặc đã có member confirmed trên camera đích."
        ],
        values: [
          { k: "lookahead_frames", v: "16", kind: "class-default", src: "backend/main_detect/src/techgar/cross_camera_manager.py:155" },
          { k: "handoff_ttl", v: "45 frame", kind: "class-default", src: "backend/main_detect/src/techgar/cross_camera_manager.py:147" }
        ]
      },
      {
        id: "3.2",
        name: "Chấm candidate ở camera đích",
        paras: [
          "Với mỗi fragment chưa gán trên camera đích, hệ thống ngoại suy vị trí cũ theo vận tốc và thời gian trôi. Candidate phải nằm trong hành lang entry của cạnh tương ứng và cách điểm dự đoán không quá prediction radius.",
          "Với handoff qua vùng overlap hiệu chuẩn, candidate chỉ cần nằm trong polygon overlap và gần một trong hai đầu đoạn dự đoán. Cách này chịu được vận tốc cuối bị nhiễu khi blob bị cắt mép.",
          "Appearance so với gallery camera đích nếu có, giới hạn min của 0.45 và ngưỡng cấu hình. Một candidate overlap chỉ hơi xấu về màu vẫn giữ trong ma trận làm bằng chứng tranh chấp nhưng không được bind.",
          "Chi phí cuối là tổng trọng số của bốn thành phần. Vượt 0.92 thì loại, còn lại đưa vào LAPJV."
        ],
        values: [
          { k: "edge_margin", v: "40", kind: "class-default", src: "backend/main_detect/src/techgar/cross_camera_manager.py:146" },
          { k: "prediction_radius (non-overlap)", v: "90", kind: "class-default", src: "backend/main_detect/src/techgar/cross_camera_manager.py:156" },
          { k: "hard appearance limit (target gallery)", v: "min(0.45, app_thresh)", kind: "runtime", src: "backend/main_detect/src/techgar/cross_camera_manager.py:3006-3010" },
          { k: "size gate", v: "0.90", kind: "class-default", src: "backend/main_detect/src/techgar/cross_camera_manager.py:3067" }
        ]
      },
      {
        id: "3.3",
        name: "LAPJV, biên tranh chấp và probation",
        paras: [
          "Toàn bộ cặp hợp lệ đi vào ma trận chi phí cho [[LAPJV]] với trần 0.92. Một cặp được chọn nhưng không thắng cách biệt 0.08 so với đối thủ kế tiếp sẽ bị defer thay vì gán.",
          "Kể cả cặp thắng cũng phải qua probation: handoff overlap cần hai đến ba frame bằng chứng liên tiếp. Candidate yêu cầu temporal evidence cần hai frame, còn lại một frame. Chưa đủ thì fragment bị giữ không gán GID.",
          "Fragment đã từng defer vì tranh chấp bị cách ly cho tới khi claim hết hạn. Nếu fragment đã có GID tạm, merge chỉ được phép khi qua kiểm tra bound-handoff riêng."
        ],
        values: [
          { k: "LAPJV cost_limit", v: "0.92", kind: "runtime", src: "backend/main_detect/src/techgar/cross_camera_manager.py:3685" },
          { k: "assignment margin", v: "0.08", kind: "runtime", src: "backend/main_detect/src/techgar/cross_camera_manager.py:3693-3694" },
          { k: "evidence frames yêu cầu", v: "overlap 2–3 · temporal 2 · else 1", kind: "runtime", src: "backend/main_detect/src/techgar/cross_camera_manager.py:3734-3743" }
        ]
      },
      {
        id: "3.4",
        name: "Track chết và identity dormant",
        paras: [
          "Khi local track hết hạn, manager gỡ ánh xạ local nhưng giữ lại identity. Gallery của fragment được hợp nhất vào gallery toàn cục và gallery riêng của camera đó.",
          "Track chết trong vùng exit thì identity chuyển sang exited và mọi handoff đang mở bị huỷ. Ngược lại nó chuyển sang handoff nếu có entry đang mở, hoặc dormant.",
          "Identity dormant giữ vị trí cuối, vận tốc cuối, gallery và cờ vanished_near_roi_edge. Cờ này đánh dấu track chết vì chạy vào mép ROI hay vùng chết, nới giới hạn same-camera lên gấp đôi."
        ],
        values: [
          { k: "identity_retention", v: "60 s hoặc 180 frame", kind: "class-default", src: "backend/main_detect/src/techgar/cross_camera_manager.py:158-159" },
          { k: "moving same-camera limit", v: "12.0 s, ×2 nếu vanished tại mép ROI", kind: "class-default", src: "backend/main_detect/src/techgar/cross_camera_manager.py:182,5602-5608" }
        ]
      },
      {
        id: "3.5",
        name: "Dormant re-id: chuỗi cổng phục hồi",
        paras: [
          "Pass dormant duyệt mọi fragment chưa gán với mọi identity ở trạng thái dormant, handoff, parked hay recovery_pending. Cặp chỉ được xét nếu cùng camera hoặc hai camera kề nhau.",
          "Cổng đầu là thời gian: identity đang giữ reservation ô đỗ luôn được coi là còn hiệu lực; ngược lại quá cửa sổ retention thì hết hạn. Hồi sinh cùng camera còn chịu thêm cửa sổ stale ngắn hơn, vì không có vùng mù nào giải thích cho khoảng mất dấu dài.",
          "Cổng khoảng cách dùng vị trí cuối cho cùng camera và min giữa dự đoán lẫn vị trí cuối cho khác camera. Giới hạn được nới theo quãng đường xe có thể đi được với vận tốc đã đo, nhưng không vượt cap hai đến ba lần dormant match distance.",
          "Appearance bắt buộc có support và phải dưới ngưỡng chặt hơn ngưỡng thường. Thiếu gallery camera đích sau gap dài bị reject riêng. Lý do: histogram camera nguồn không còn đáng tin khi xe khác có thể đã đỗ vào đúng chỗ cũ.",
          "Fragment phải đủ ba quan sát confirmed trước khi được nhận identity cũ. LAPJV với trần 0.95 và biên 0.12 chốt gán cuối cùng; tranh chấp đăng ký vào sổ ambiguity và cả hai phía bị defer.",
          "Trước khi bind, member sống của identity ở camera khác sẽ được kiểm tra neo. Member neo cách candidate quá xa thì gán bị hoãn, tránh một GID ngồi trên hai xe khác nhau dù chỉ một frame."
        ],
        values: [
          { k: "same-camera appearance limit", v: "min(0.30, dormant_app)", kind: "runtime", src: "backend/main_detect/src/techgar/cross_camera_manager.py:6106-6109" },
          { k: "fragment maturity", v: "≥3 quan sát confirmed", kind: "class-default", src: "backend/main_detect/src/techgar/cross_camera_manager.py:2490-2515" },
          { k: "dormant LAPJV cost_limit / margin", v: "0.95 / 0.12", kind: "runtime", src: "backend/main_detect/src/techgar/cross_camera_manager.py:6466-6475" }
        ]
      },
      {
        id: "3.6",
        name: "Defer là trạng thái, không phải từ chối",
        paras: [
          "Khi một cổng mềm suýt đạt, fragment bị giữ ở trạng thái chưa gán thay vì nhận GID mới. Comment trong code ghi rõ: cấp GID mới trong tình huống này là không đảo ngược được và có thể làm nhiễu ô đỗ.",
          "Các nhánh defer gồm appearance near-miss cùng camera, kích thước chưa ổn định, fragment chưa đủ ba quan sát, identity ambiguity đang sống, và member sống bị lệch neo. Mỗi nhánh ghi event riêng để chẩn đoán."
        ],
        values: []
      }
    ],

    /* ④ Số liệu & công thức */
    formulas: [
      {
        name: "Handoff cost",
        expr: "cost = 0.55·residual/r + 0.30·app + 0.10·size + 0.05·dir_cost",
        subst: "0.55×(4.04/25.0) + 0.30×0.167 + 0.10×size + 0.05×dir",
        result: "≈ 0.16 (+ hạng nhỏ)",
        note: "r = handoff_prediction_radius resolved 25.0 (cal-20260927; live cal-20261006 ≈24.90); số đo residual/app lấy từ ca hiep3 f465 (minh họa), dir lấy 0.20 khi fragment chưa có vận tốc",
        src: "backend/main_detect/src/techgar/cross_camera_manager.py:3087"
      },
      {
        name: "Entry corridor (không mask)",
        expr: "limit = edge_margin + prediction_radius + speed·min(4, lookahead)·0.25",
        subst: "40 + 25.0 + speed×4×0.25",
        result: "= 65 + speed",
        note: "candidate sâu trong khung hơn giới hạn này bị loại outside_entry_corridor; radius runtime 25.0 (cal-20260927; live ≈24.90), 90 chỉ là class-default",
        src: "backend/main_detect/src/techgar/cross_camera_manager.py:2974-2978"
      },
      {
        name: "Reachable distance",
        expr: "limit = margin + 1.5·speed·elapsed",
        subst: "margin + 1.5 × 0 × 50.95",
        result: "= margin",
        note: "xe đỗ yên speed≈0 nên giới hạn co về margin — cứu được chỗ cũ, không cứu được chỗ khác",
        src: "backend/main_detect/src/techgar/cross_camera_manager.py:5610-5628"
      }
    ],
    params: [
      { name: "handoff_ttl", value: "45 frame", kind: "class-default", role: "thời gian sống của một handoff entry", src: "backend/main_detect/src/techgar/cross_camera_manager.py:147" },
      { name: "lookahead_frames", value: "16", kind: "class-default", role: "xe cách biên bao nhiêu frame thì mở handoff", src: "backend/main_detect/src/techgar/cross_camera_manager.py:155" },
      { name: "identity_retention_seconds", value: "60.0 s", kind: "class-default", role: "dormant identity tồn tại tối đa bao lâu (×4 nếu established)", src: "backend/main_detect/src/techgar/cross_camera_manager.py:159" },
      { name: "identity_retention_moving_seconds", value: "12.0 s", kind: "class-default", role: "cửa sổ stale cho hồi sinh cùng camera", src: "backend/main_detect/src/techgar/cross_camera_manager.py:182" },
      { name: "dormant_match_distance", value: "16.218 (cal-20260927); live ≈15.85 (cal-20261006)", kind: "derived", role: "bán kính cơ sở cho cổng khoảng cách dormant", src: "backend/main_detect/two_camera.py:2182" },
      { name: "dormant_appearance_threshold", value: "0.60", kind: "runtime", role: "trần trên cho mọi ngưỡng appearance dormant", src: "backend/main_detect/two_camera.py:1965-1970" },
      { name: "reid_reachable_speed_scale", value: "1.5", kind: "class-default", role: "hệ số quãng đường xe có thể đi được trong gap", src: "backend/main_detect/src/techgar/cross_camera_manager.py:186" }
    ],

    /* ⑤ Hình thật */
    figures: [
      {
        src: "assets/real/handoff-dormant-gap-sang8-f450.jpg",
        alt: "Xe của GID1 vẫn đỗ yên ở cam2 f450 nhưng không còn track nào",
        caption: "Cam2 f450 của session_hiep_sang8: chiếc xe của GID1 (lid35) vẫn đỗ tại chỗ sau khi track chết ở f296. Motion detector không sinh blob cho xe đứng yên, nên GID1 ngủ dormant trong khi xe vật lý không đi đâu.",
        origin: "session_hiep_sang8/f450/cam2"
      },
      {
        src: "assets/real/handoff-dormant-recovered-hiep3-f465.jpg",
        alt: "Fragment lid10 trên cam1 được phục hồi về GID2 sau 39.8 giây dormant",
        caption: "Cam1 f465 của session_hiep3: lid10 được dormant re-id nhận lại vào GID2 sau 39.8 giây. Appearance 0.167 so với gallery riêng của cam1, khoảng cách vị trí 4.04 trong giới hạn 16.22 của run cal-20260927 (live cal-20261006 ≈15.85).",
        origin: "session_hiep3/f465/cam1"
      }
    ],
    noFigureReason: null,
    interactive: null,

    /* ⑥ Giới hạn & lỗi thật */
    limits: [
      {
        text: "E-C-002 CONFIRMED, chỉ cho phát biểu hẹp: cùng một xe vật lý nhận GID mới. Trên verify_cur_session_hiep_sang8, lid35 của GID1 chết f296 với anchor cuối (397.5,118). Lid40 xuất hiện f595 cách 9.5 px, nhưng GID1 đã quá cửa sổ same_camera_stale ở 50.078 s. Trajectory score chỉ 0.6683 vì direction 0.00146 và time_topology 0.0, nên f600 cấp GID3. Mã E-* là finding của chiến dịch verify-replay; danh mục đầy đủ ở trang failure-gallery.",
        evidence: { session: "verify_cur_session_hiep_sang8", frame: 600, status: "CONFIRMED" }
      },
      {
        text: "Hệ quả của E-C-002 lên ô đỗ và phiên sạc chưa được chứng minh: slot occupancy không đổi trong ca này, nên phần harm giữ nhãn UNSURE. Xe đỗ yên không sinh blob là khuyết tật thiết kế của pipeline motion, dormant pass chỉ cứu được khi còn trong cửa sổ.",
        evidence: { session: "verify_cur_session_hiep_sang8", frame: 450, status: "UNSURE" }
      },
      {
        text: "E-C-005 bị bác ở mức claim: một trong ba instance bị chứng minh là hai xe khác nhau bằng ảnh thai7 f761, hai instance còn lại UNSURE. Cờ scanner so khoảng cách pixel là artifact, không phải defect của engine.",
        evidence: { session: "verify_cur_session_hiep_thai7", frame: 761, status: "REJECTED" }
      },
      {
        text: "E-A-020 UNSURE: hiep2 f115-153 cho thấy handoff một phần, lid9/14/18 về gid1 và lid15/20 về gid2 trong khi lid11/12/13/19 không có gid. Churn xác nhận nhưng harm chưa chứng minh được.",
        evidence: { session: "verify_cur_session_hiep2", frame: 138, status: "UNSURE" }
      },
      {
        text: "U2 UNSURE: sang7 khoảng f330 nghi GID đặt lên sai xe khi qua camera, cần kiểm tra frame-level trước khi kết luận.",
        evidence: { session: "session_hiep_sang7", frame: 330, status: "UNSURE" }
      },
      {
        text: "Cổng retention 60 giây không cứu được xe đỗ yên lâu hơn mà không có reservation ô đỗ. Sau khi hết hạn, mọi fragment xuất hiện lại đều nhận GID mới dù đứng đúng chỗ cũ."
      }
    ],

    /* ⑦ Nguồn */
    sources: [
      { ref: "backend/main_detect/src/techgar/cross_camera_manager.py:40-94", kind: "class-default", note: "HandoffEntry + GlobalIdentityState fields" },
      { ref: "backend/main_detect/src/techgar/cross_camera_manager.py:147-186", kind: "class-default", note: "ctor: ttl 45f, lookahead 16, retention 60s/180f, moving 12s" },
      { ref: "backend/main_detect/src/techgar/cross_camera_manager.py:2545-2616", kind: "class-default", note: "_outward_edge: cạnh sớm nhất trong lookahead" },
      { ref: "backend/main_detect/src/techgar/cross_camera_manager.py:2642-2812", kind: "runtime", note: "_upsert_handoff: mở/refresh/huỷ + handoff_opened" },
      { ref: "backend/main_detect/src/techgar/cross_camera_manager.py:2814-2899", kind: "class-default", note: "_predicted_world + _entry_depth + _direction_cosine" },
      { ref: "backend/main_detect/src/techgar/cross_camera_manager.py:2901-3088", kind: "runtime", note: "_candidate_cost: chuỗi gate + công thức cost" },
      { ref: "backend/main_detect/src/techgar/cross_camera_manager.py:3512-3840", kind: "runtime", note: "_match_pending_handoffs: TTL, LAPJV 0.92, margin 0.08, evidence frames, bind" },
      { ref: "backend/main_detect/src/techgar/cross_camera_manager.py:8552-8633", kind: "runtime", note: "notify_track_expired: local→dormant/handoff/exited + merge gallery" },
      { ref: "backend/main_detect/src/techgar/cross_camera_manager.py:5469-5608", kind: "class-default", note: "retention re-anchor + same_camera_stale" },
      { ref: "backend/main_detect/src/techgar/cross_camera_manager.py:5610-5706", kind: "class-default", note: "reachable distance + dormant candidate distance limit" },
      { ref: "backend/main_detect/src/techgar/cross_camera_manager.py:5828-6444", kind: "runtime", note: "_match_dormant_identities: toàn bộ chuỗi cổng" },
      { ref: "backend/main_detect/src/techgar/cross_camera_manager.py:6466-6760", kind: "runtime", note: "dormant LAPJV 0.95, ambiguity 0.12, divergence guard, recovered event" },
      { ref: "backend/main_detect/experiment_test/output/verify_cur_session_hiep_sang8/predictions.jsonl:296-600", kind: "runtime", note: "E-C-002: expired f296, stale 50.078s f595, gid3 f600 score 0.6683" },
      { ref: "backend/main_detect/experiment_test/output/verify_cur_session_hiep3/predictions.jsonl:465", kind: "runtime", note: "dormant_global_id_recovered gid2, elapsed 39.812, app 0.167" }
    ],
    pseudocode: "MOI FRAME (track con song):\n  edge <- canh som nhat trong 16 frame toi\n  neu edge ke cam khac -> mo/lam moi HandoffEntry\n\nMATCH HANDOFF:\n  cho moi entry con TTL 45f, moi fragment chua gan o cam dich:\n    pred <- last_world + v * elapsed\n    gate: entry corridor, residual <= radius, app, size, dir\n    cost = 0.55*res/r + 0.30*app + 0.10*size + 0.05*dir\n  LAPJV(cost<=0.92, margin 0.08) -> probation 1-3 frame -> bind\n\nTRACK CHET:\n  identity -> dormant (giu last_world, v, gallery)\n\nMATCH DORMANT:\n  moi fragment chua gan x moi identity dormant/parked:\n    gate: recent -> distance -> gallery -> app -> size -> mature\n    LAPJV(cost<=0.95, margin 0.12) -> divergence guard -> bind"
  });
})();
