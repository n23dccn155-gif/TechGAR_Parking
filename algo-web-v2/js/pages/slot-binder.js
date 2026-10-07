/* slot-binder.js — Trang 15: gán xe vào ô đỗ, giữ và trả GID qua vòng đỗ xe.
 * Nguồn: .analysis/algo-web-v2-redesign/notes/slot-binder.md
 */
(function () {
  "use strict";
  TG.definePage({
    id: "slot-binder",
    group: "binding",
    title: "Slot binder — gán xe vào ô đỗ",
    navLabel: "Slot binder",
    order: 15,
    prev: "parking-detector",
    next: "snapshot-api",

    /* ① Chức năng & vị trí */
    fn: {
      text: "Binder nối hai thế giới: detector nói ô nào bị che, tracker nói xe nào đang ở đâu. Nó quyết định [[GID]] nào sở hữu ô nào, mở và đóng phiên đỗ xe, và giữ lại danh tính cho xe vừa rời ô qua departure token."
    },

    /* ② Vì sao cần */
    why: {
      paras: [
        "Cả hai kênh bằng chứng đều có lỗ hổng. Tracker mất dấu xe đứng yên, còn detector không biết đó là xe nào. Binder chịu trách nhiệm duy nhất cho câu hỏi ô đỗ thuộc về xe nào và khi nào thì thôi.",
        "Nếu gán nhầm, một GID có thể ngồi trên ô của xe khác và toàn bộ phiên đỗ đi sai. Nếu trả nhầm, xe ra khỏi ô một frame rồi quay lại sẽ bị coi là khách mới. Binder vì thế xây quanh ba ý tưởng. Chỉ bind khi đủ bằng chứng dừng. Giữ chỗ qua token khi xe rời. Từ chối commit khi tranh chấp chưa rõ."
      ]
    },

    /* ③ Cách hoạt động */
    how: [
      {
        id: "3.1",
        name: "Hai kênh bằng chứng, một chính sách",
        paras: [
          "Chính sách runtime là `vision_primary`: bằng chứng pixel của detector quyết định ô có trống không, còn tracker quyết định xe nào đang trong ô.",
          "Mỗi kênh chạy nhịp riêng. Binder lưu riêng mốc frame của evidence và mốc frame áp dụng, nên một kết quả vision trễ không ghi đè bằng chứng chuyển động mới hơn.",
          "Evidence chưa `ready` bị bỏ qua: ô mà detector chưa xác nhận lần đầu sẽ không được binder coi là chỗ trống khả dụng."
        ],
        values: [
          { k: "policy", v: "vision_primary", kind: "runtime", src: "backend/main_detect/two_camera.py:2336" },
          { k: "tách provenance", v: "evidence_frame_idx vs applied frame", kind: "runtime", src: "backend/main_detect/src/techgar/slot_vehicle_binder.py:2441-2499" }
        ]
      },
      {
        id: "3.2",
        name: "Bind: xe phải chứng minh đã đỗ",
        paras: [
          "Track chạm ô trở thành `stop_candidate`. Điều kiện nền là ô đó đang `vision_occupied` — xe đi ngang một ô trống không bao giờ được bind vào ô đó.",
          "Muốn commit, track phải chứng minh dừng thật. Điều đó nghĩa là ít nhất tám mẫu quan sát tươi liên tiếp kéo dài gần trọn một giây. Tám mươi phần trăm mẫu phải nằm trong cùng ô. Tâm chỉ được dao động trong vòng tròn nhỏ so với đường chéo bbox.",
          "Xe chồm lên ô với overlap trên 0.60 đi đường tắt: strong overlap dwell commit sớm mà không cần chờ đủ cửa sổ dừng.",
          "Ô đã có chủ và vision vẫn báo có xe thì xe mới bị từ chối. Lý do sticky_id_conflict là cơ chế chống cướp ô khi hai track đè nhau."
        ],
        values: [
          { k: "min_vehicle_overlap", v: "0.35", kind: "class-default", src: "backend/main_detect/src/techgar/slot_vehicle_binder.py:217" },
          { k: "strong_vehicle_overlap", v: "0.60", kind: "class-default", src: "backend/main_detect/src/techgar/slot_vehicle_binder.py:218" },
          { k: "stop_seconds + grace", v: "1.0 s + 0.15 s", kind: "class-default", src: "backend/main_detect/src/techgar/slot_vehicle_binder.py:215,223" }
        ]
      },
      {
        id: "3.3",
        name: "Arrival claim — đỗ xong khi track đã mất",
        paras: [
          "Xe đỗ xong thường bị tracker bỏ dấu ngay lúc dừng hẳn. Arrival claim ghi lại ý định vào ô của track trước khi nó biến mất, rồi chờ vision xác nhận.",
          "Claim chỉ commit khi: track đã mất quá 0.35 giây, ít nhất ba quan sát thật, max overlap đạt 0.35, và vision báo ô có xe liên tiếp hai mẫu. Hai claim cạnh nhau phải hơn nhau 0.15 điểm mới có người thắng.",
          "Claim còn phải chứng minh quỹ đạo vào ô thật. Nó cần một trong ba dấu hiệu: vào từ ngoài polygon, overlap tăng thêm 0.10, hoặc tiến về tâm năm phần trăm đường chéo.",
          "Một quan sát tươi nằm ngoài ô sau khi track mất vô hiệu claim ngay — bằng chứng chuyển động mới luôn thắng bằng chứng vision cũ."
        ],
        values: [
          { k: "vision confirmations", v: "≥2 mẫu occupied liên tiếp", kind: "runtime", src: "backend/main_detect/two_camera.py:1915" },
          { k: "lost commit delay", v: "0.35 s", kind: "runtime", src: "backend/main_detect/two_camera.py:1918" },
          { k: "lookback tối thiểu", v: "3.0 s (auto)", kind: "derived", src: "backend/main_detect/two_camera.py:1719-1728" }
        ]
      },
      {
        id: "3.4",
        name: "Departure token — giữ chỗ năm giây",
        paras: [
          "Khi vision chuyển một ô đã bind sang trống, binder không xoá chủ cũ. Nó tạo departure token giữ GID đó trong năm giây, kèm polygon ô, bbox cuối và appearance cuối.",
          "Bán kính tìm lại mở dần từ 5 phần trăm lên tới 85 phần trăm đường chéo ô trong một giây. Xe đồ chơi chạy nhanh ra mép ROI vẫn nằm trong vùng tìm.",
          "Token chỉ sẵn sàng bị consume sau khi vision xác nhận trống hai lần liên tiếp. Trước đó candidate được bảo vệ khỏi cấp GID mới nhưng chưa được nhận GID cũ.",
          "Token còn có chế độ predeparture: motion bắt đầu trong ô đỗ mở token sớm 2.5 giây trước khi vision kịp báo trống, để xe nhanh không mất GID."
        ],
        values: [
          { k: "recovery_retention", v: "5.0 s", kind: "runtime", src: "backend/main_detect/two_camera.py:1883-1887" },
          { k: "expand radius", v: "0.05 → 0.85 × diag trong 1.0 s", kind: "runtime", src: "backend/main_detect/two_camera.py:1888-1898" },
          { k: "predeparture guard", v: "2.5 s = 1.0 + 1.0 + 0.5", kind: "derived", src: "backend/main_detect/two_camera.py:2351-2355" },
          { k: "confirmed_empty", v: "≥2 empty observations", kind: "runtime", src: "backend/main_detect/src/techgar/slot_vehicle_binder.py:1484" }
        ]
      },
      {
        id: "3.5",
        name: "Recovery gating — năm cửa trước khi trả GID",
        paras: [
          "Fragment chưa bind nằm trong bán kính token được bảo vệ: nó không được cấp GID mới trong khi binder thu thập bằng chứng.",
          "Consume đòi ít nhất ba frame quan sát — đủ để một blob bóng hai frame không bao giờ chiếm được GID của xe đang đỗ.",
          "Fragment phải qua cửa vị trí gốc, tỉ lệ kích thước hợp lý, appearance trung vị dưới 0.62, và bằng chứng đi ra khỏi ô.",
          "Bằng chứng ra ngoài có ba cách chứng minh: world trajectory đủ mạnh, thoát polygon với radial gain, hoặc chuyển động legacy theo dot product.",
          "Cuối cùng LAPJV chọn cặp tốt nhất theo chi phí tổng. Phương án thua sát hơn 0.15 khiến cả cặp bị đánh ambiguous và token không bị consume."
        ],
        values: [
          { k: "evidence frames", v: "≥3 (runtime fix)", kind: "runtime", src: "backend/main_detect/two_camera.py:2344" },
          { k: "appearance limit", v: "0.62 (relaxed 0.70)", kind: "runtime", src: "backend/main_detect/two_camera.py:1900-1904" },
          { k: "ambiguity margin", v: "0.15", kind: "class-default", src: "backend/main_detect/src/techgar/slot_vehicle_binder.py:233" }
        ]
      },
      {
        id: "3.6",
        name: "Release và khôi phục flicker",
        paras: [
          "Xe đã bind mà rời ô quá 0.5 giây thì binding bị release và phiên đỗ kết thúc.",
          "Ngược lại, vision báo trống rồi lại báo có xe trước khi token bị consume là flicker detector. Binder khôi phục chủ ô bất kể tuổi token."
        ],
        values: [
          { k: "exit_seconds", v: "0.5 s ngoài ô → release", kind: "class-default", src: "backend/main_detect/src/techgar/slot_vehicle_binder.py:216" },
          { k: "false-empty restore", v: "_restore_false_empty_token", kind: "runtime", src: "backend/main_detect/src/techgar/slot_vehicle_binder.py:1566" }
        ]
      }
    ],

    /* ④ Số liệu & công thức */
    formulas: [
      {
        name: "Điều kiện dừng trong ô",
        expr: "stopped ⟺ ≥8 mẫu fresh liên tiếp · span ≥ 0.9 s · same_slot ≥ 80% · r95 ≤ max(3px, 0.06·diag) · drift ≤ max(5px, 0.10·diag)",
        subst: "hiep3 f155: gid1 overlap 0.733 trong D01, dwell đủ → bind",
        result: "vehicle_stopped_in_slot + episode D01:G1:F162",
        note: "claim commit sau khi track đã lost — 19 quan sát và 6 vision confirmations",
        src: "backend/main_detect/src/techgar/slot_vehicle_binder.py:1316-1355"
      },
      {
        name: "Bán kính token mở dần",
        expr: "r(t) = diag_slot × (0.05 + min(1, age/1.0 s) × 0.80)",
        subst: "ô D01 diag ≈ 97 px: lúc t=1.0 s, r ≈ 82 px",
        result: "vùng tìm lại phủ mép ô và làn kế",
        note: "runtime dùng max_expand_ratio 0.85 thay class default 0.45 — xe đồ chơi nhỏ chạy nhanh",
        src: "backend/main_detect/src/techgar/slot_vehicle_binder.py:603-609"
      },
      {
        name: "Chi phí gán recovery",
        expr: "cost = 0.45·spatial + 0.35·(appearance/limit) + 0.15·size + 0.05·direction",
        subst: "hiep3 f440: lid8 app 0.113 ≤ 0.62 · size 1.32 · outward 48.8 px · 14 obs",
        result: "parked_id_recovered — lid8 nhận lại GID1",
        note: "LAPJV cost_limit 0.999; gap dưới 0.15 thì kết quả ambiguous và token không bị consume",
        src: "backend/main_detect/src/techgar/slot_vehicle_binder.py:3467-3567"
      }
    ],
    params: [
      { name: "min_vehicle_overlap", value: "0.35", kind: "class-default", role: "overlap tối thiểu để track được coi là vào ô", src: "backend/main_detect/src/techgar/slot_vehicle_binder.py:217" },
      { name: "stop_seconds", value: "1.0 s", kind: "class-default", role: "cửa sổ dwell trước khi bind", src: "backend/main_detect/src/techgar/slot_vehicle_binder.py:215" },
      { name: "recovery_retention_seconds", value: "5.0 s", kind: "runtime", role: "thời gian token giữ GID sau khi ô báo trống", src: "backend/main_detect/two_camera.py:1883" },
      { name: "recovery_appearance_threshold", value: "0.62", kind: "runtime", role: "ngưỡng histogram trả GID; relaxed 0.70 khi overlap cao", src: "backend/main_detect/two_camera.py:1900" },
      { name: "recovery_evidence_frames", value: "3", kind: "runtime", role: "số quan sát bắt buộc trước consume — chặn fragment bóng", src: "backend/main_detect/two_camera.py:2342-2344" },
      { name: "exit_seconds", value: "0.5 s", kind: "class-default", role: "thời gian ra khỏi ô trước khi release binding", src: "backend/main_detect/src/techgar/slot_vehicle_binder.py:216" }
    ],

    /* ⑤ Hình thật */
    figures: [
      {
        src: "assets/real/slot-binder-parked-hiep3-f155.jpg",
        alt: "Xe đen GID1 dừng trong ô D01 cam1 tại frame 155",
        caption: "Cam1 session_hiep3 f155: xe đen của GID1 nằm gọn trong ô D01 với overlap 0.733. Bảy frame sau, binder commit binding mở parking episode D01:G1:F162 — ô đỏ, track xanh.",
        origin: "session_hiep3/f155/cam1"
      },
      {
        src: "assets/real/slot-binder-recovery-hiep3-f440.jpg",
        alt: "Xe đen rời ô D01 được token trả lại GID1 còn fragment bóng lid9 không nhận GID",
        caption: "Cam1 f440 cùng chỗ: xe đen lid8 vừa lùi ra khỏi D01. Token của GID1 còn sống nên binder trả lại GID1 sau 14 frame bằng chứng. Fragment lid9 ngay miệng ô là bóng nhiễu — được bảo vệ nhưng không bao giờ nhận GID.",
        origin: "session_hiep3/f440/cam1"
      }
    ],
    noFigureReason: null,
    interactive: null,

    /* ⑥ Giới hạn & lỗi thật */
    limits: [
      {
        text: "Xe đỗ sẵn từ trước khi hệ thống chạy không có track, nên không được bind: ô báo occupied qua vision nhưng vehicle_id rỗng và không có phiên đỗ. Đây là giới hạn có chủ đích của kiến trúc motion-based, không phải bug.",
        evidence: { session: "verify_cur_session_hiep3", frame: 466, status: "CONFIRMED" }
      },
      {
        text: "Token chỉ sống năm giây. Xe rời ô chậm hoặc bị khuất lâu hơn thì token chết và GID mất. Ca f272 hiep3 cho thấy token predeparture bị huỷ sau guard mà không có consume nào.",
        evidence: { session: "verify_cur_session_hiep3", frame: 272, status: "CONFIRMED" }
      },
      {
        text: "Fragment bóng cạnh ô được bảo vệ khỏi cấp GID mới nhưng vẫn chiếm chỗ trong sổ candidate. Ca lid9 hiep3 chứng minh rào chắn đúng, song một fragment xấu dai dẳng vẫn có thể trì hoãn consume của xe thật.",
        evidence: { session: "verify_cur_session_hiep3", frame: 440, status: "CONFIRMED" }
      },
      {
        text: "Arrival claim phụ thuộc vision xác nhận occupied hai lần liên tiếp. Khi detector chậm hoặc nhấp nháy, xe đã đỗ thật có thể chờ claim hoặc bị huỷ. Số phiên đỗ nhận ra trong replay vì thế chỉ là cận dưới.",
        evidence: { session: "verify_cur_session_hiep3", frame: 162, status: "UNSURE" }
      }
    ],

    /* ⑦ Nguồn */
    sources: [
      { ref: "backend/main_detect/src/techgar/slot_vehicle_binder.py:2047-2296", kind: "runtime", note: "update_tracks: candidate → stopped → bind" },
      { ref: "backend/main_detect/src/techgar/slot_vehicle_binder.py:1167-1283", kind: "runtime", note: "arrival claim commit + competitor margin + disproof" },
      { ref: "backend/main_detect/src/techgar/slot_vehicle_binder.py:1449-1531", kind: "runtime", note: "departure token tạo/gia hạn/confirmed_empty" },
      { ref: "backend/main_detect/src/techgar/slot_vehicle_binder.py:2763-3569", kind: "runtime", note: "batch_recover_ids: gates + cost + LAPJV + ambiguity" },
      { ref: "backend/main_detect/src/techgar/slot_vehicle_binder.py:2431-2610", kind: "runtime", note: "update_vision: provenance tách clock + token hook" },
      { ref: "backend/main_detect/two_camera.py:2334-2367", kind: "runtime", note: "wiring vision_primary + recovery 3 frames + guard 2.5 s" },
      { ref: "backend/main_detect/experiment_test/output/verify_cur_session_hiep3/predictions.jsonl:162", kind: "runtime", note: "vehicle_stopped_in_slot + arrival claim confirmed D01" },
      { ref: "backend/main_detect/experiment_test/output/verify_cur_session_hiep3/predictions.jsonl:440", kind: "runtime", note: "parked_id_recovered lid8→gid1, app 0.1129, 14 obs" },
      { ref: "backend/main_detect/experiment_test/output/verify_cur_session_hiep3/predictions.jsonl:425", kind: "runtime", note: "lid9 shadow fragment miệng ô — không gid suốt" }
    ],
    pseudocode: "update_tracks:\n  fresh track cham o co vision_occupied -> stop_candidate\n  du 8 mau fresh + dwell 1.15s + r95 nho -> bind -> mo episode\n  o co chu + vision occupied -> sticky_id_conflict\n\nvision o -> empty: tao departure token 5s (giu gid)\n\nbatch_recover_ids:\n  fragment trong ban kinh mo dan -> protected\n  >=3 obs + origin trong o + size + app<=0.62 + ra ngoai -> eligible\n  LAPJV + margin 0.15 -> consume token -> tra gid cu"
  });
})();
