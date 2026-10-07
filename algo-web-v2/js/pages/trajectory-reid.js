/* trajectory-reid.js — Trang 11: Trajectory memory & reid scoring.
 * Nguồn số liệu đã xác minh: .analysis/algo-web-v2-redesign/notes/trajectory-reid.md
 */
(function () {
  "use strict";
  TG.definePage({
    id: "trajectory-reid",
    group: "multi-cam",
    title: "Trajectory memory & reid scoring",
    navLabel: "Trajectory reid",
    order: 11,
    prev: "tracklet-descriptor",
    next: "handoff-dormant",

    /* ① Chức năng & vị trí */
    fn: {
      text: "[[WorldTrajectoryMemory]] lưu vệt vị trí thế giới của mọi identity và mọi fragment chưa gán, rồi chấm [[trajectory score]] giữa fragment mới và quỹ đạo đã lưu. Đây là pass nhận dạng cuối cùng trước khi hệ thống cấp một [[GID]] mới."
    },

    /* ② Vì sao cần */
    why: {
      paras: [
        "Appearance chỉ nói hai xe trông giống nhau; nó không biết chiếc xe kia vật lý có thể tới đó không. Một chiếc biến mất ở cam1 không thể xuất hiện tức thì cách trăm mét trên cam2. Vị trí và vận tốc thế giới bổ sung ràng buộc vật lý màu sắc không có.",
        "Không có bộ nhớ quỹ đạo, mọi fragment sau khoảng mất dấu đều phải cấp GID mới. Mỗi lần cấp nhầm là một xe thật bị tách thành hai identity, và lỗi đó lan sang ô đỗ và phiên sạc."
      ]
    },

    /* ③ Cách hoạt động */
    how: [
      {
        id: "3.1",
        name: "Hai kho quỹ đạo tách biệt",
        paras: [
          "Bộ nhớ giữ hai tập riêng: vệt đã chứng minh của từng [[GID]], và vệt provisional của từng fragment chưa gán định danh.",
          "Một fragment chỉ được nhập vào kho global sau khi một cơ chế khác đã chứng minh GID của nó. Comment trong code nêu rõ chỉ gần quỹ đạo thôi không bao giờ được phép tiêu thụ một identity.",
          "Mỗi mẫu là một [[TrajectorySample]] gồm frame, timestamp, camera, local id, tọa độ thế giới và kích thước khung. Vệt bị cắt theo cửa sổ hai giây và trần 240 mẫu.",
          "Fragment biến mất khỏi live vẫn giữ vệt provisional nếu mẫu mới nhất còn trong cửa sổ. Cơ chế này giúp fragment sống sót qua khoảng hỏng ngắn của detector."
        ],
        values: [
          { k: "history_seconds", v: "2.0 s", kind: "runtime", src: "backend/main_detect/two_camera.py:1974" },
          { k: "max_samples mỗi vệt", v: "240", kind: "class-default", src: "backend/main_detect/src/techgar/trajectory_memory.py:62" },
          { k: "min_observations để stable", v: "3", kind: "class-default", src: "backend/main_detect/src/techgar/trajectory_memory.py:59" }
        ]
      },
      {
        id: "3.2",
        name: "Ước lượng chuyển động từ đuôi vệt",
        paras: [
          "Chỉ phần đuôi liền kề cùng camera và cùng local id được dùng để ước lượng. Vận tốc là median theo từng trục của tối đa năm bước gần nhất trên sáu quan sát cuối.",
          "Độ cong là median của góc quay giữa các vector hướng liên tiếp, chỉ tính khi có ít nhất ba hướng. Độ cong này sau đó phạt điểm direction của fragment ngoắt gắt."
        ],
        values: [
          { k: "số bước vận tốc trong median", v: "≤5 trên tail[-6:]", kind: "class-default", src: "backend/main_detect/src/techgar/trajectory_memory.py:253-269" },
          { k: "điều kiện tính curvature", v: "tail ≥ 6 và ≥ 3 hướng", kind: "class-default", src: "backend/main_detect/src/techgar/trajectory_memory.py:272-283" }
        ]
      },
      {
        id: "3.3",
        name: "Hành lang dự đoán và khoảng trống thời gian",
        paras: [
          "Hệ thống ngoại suy vị trí nguồn bằng vận tốc nhân với khoảng trống thời gian giữa hai quan sát. Khoảng cách corridor là khoảng cách từ điểm đầu của fragment tới đoạn thẳng nối vị trí cuối và vị trí dự đoán đó.",
          "Nếu hai vệt chồng nhau về thời gian, khoảng trống bằng 0 và điểm đầu fragment được lấy tại mẫu gần nhất với thời điểm cuối của nguồn. [[prediction radius]] dùng cho chuẩn hóa chính là dormant match distance đã resolve."
        ],
        values: [
          { k: "prediction_radius dùng", v: "dormant_match_distance = 16.218 (cal-20260927; live ≈15.85)", kind: "derived", src: "backend/main_detect/src/techgar/cross_camera_manager.py:7013" },
          { k: "recent_window_s", v: "handoff_ttl 45 frame / fps thực", kind: "runtime", src: "backend/main_detect/src/techgar/cross_camera_manager.py:5274-5288" }
        ]
      },
      {
        id: "3.4",
        name: "Sáu thành phần của trajectory score",
        paras: [
          "Điểm tổng trong khoảng 0 đến 1 là tổng có trọng số của sáu thành phần. Corridor nặng nhất 0.35, appearance 0.25, direction 0.15, speed 0.10, min của time và topology 0.10, size 0.05.",
          "Direction chỉ tính khi cả hai bên có tốc độ đáng kể, còn không thì mặc định 0.5 trung lập. Speed dùng log tỉ lệ nên chênh lệch bốn lần kéo điểm về 0.",
          "Ba lý do từ chối cứng ngắt mọi điểm: vượt prediction radius gọi là teleport, topology camera bằng 0, và fragment ổn định đi ngược hướng dưới cosine tối thiểu."
        ],
        values: [
          { k: "trọng số 6 thành phần", v: "0.35 / 0.25 / 0.15 / 0.10 / 0.10 / 0.05", kind: "class-default", src: "backend/main_detect/src/techgar/trajectory_memory.py:395-402" },
          { k: "match_threshold", v: "0.78", kind: "class-default", src: "backend/main_detect/src/techgar/cross_camera_manager.py:451" },
          { k: "ambiguity_margin", v: "0.12", kind: "class-default", src: "backend/main_detect/src/techgar/cross_camera_manager.py:452" },
          { k: "min_direction_cosine", v: "0.25", kind: "runtime", src: "backend/main_detect/two_camera.py:1951" }
        ]
      },
      {
        id: "3.5",
        name: "Chuỗi cổng của pass world-trajectory",
        paras: [
          "Trước khi chấm điểm, pass lọc candidate và identity qua nhiều cổng. Fragment cần detection tươi, ít nhất hai mẫu appearance và ba mẫu quỹ đạo provisional. Identity đã exited hay đang bị occlusion hold bị loại.",
          "Từng cặp sau đó qua chuỗi veto gồm trail nguồn ngắn, topology camera, lệch gốc ô đỗ đã giữ, chủ sống cùng camera. Tiếp theo là thiếu gallery camera đích, appearance vượt 0.45, và kích thước lệch quá 0.90.",
          "Cặp sống sót được chấm rồi đưa vào ma trận chi phí 1 trừ score cho [[LAPJV]], với trần chi phí 0.22 tương đương ngưỡng 0.78. Hai fragment tranh một identity trong biên 0.12 thì cả hai bị giữ lại thay vì gán sai."
        ],
        values: [
          { k: "điều kiện candidate tối thiểu", v: "≥2 mẫu appearance, ≥3 mẫu quỹ đạo", kind: "runtime", src: "backend/main_detect/src/techgar/cross_camera_manager.py:6799-6812" },
          { k: "LAPJV cost limit", v: "0.22 tương đương score 0.78", kind: "runtime", src: "backend/main_detect/src/techgar/cross_camera_manager.py:7151-7153" }
        ]
      },
      {
        id: "3.6",
        name: "Fragment plausible nhưng dưới ngưỡng",
        paras: [
          "Một fragment điểm dưới 0.78 nhưng đủ điều kiện plausible sẽ bị giữ chờ thay vì cấp GID mới: cùng camera nguồn, appearance tối đa 0.30, size tối đa 0.65. Kèm corridor trong 60 phần trăm dormant distance và time_topology đạt 0.75.",
          "Comment trong code giải thích: cấp GID mới trong trạng thái này là không đảo ngược được và có thể làm nhiễm ô đỗ sau này, còn chờ thì không. Defer có giới hạn và sẽ hết hạn nếu không chứng minh được."
        ],
        values: [
          { k: "điều kiện defer plausible", v: "app≤0.30, size≤0.65, corridor≤0.6·16.218, tt≥0.75 (bound theo cal-20260927; live ≈0.6·15.85)", kind: "runtime", src: "backend/main_detect/src/techgar/cross_camera_manager.py:7073-7081" }
        ]
      },
      {
        id: "3.7",
        name: "Match departure — xe rời ô đỗ",
        paras: [
          "Xe đỗ xong rồi rời ô đi ngược lại vận tốc lúc vào, nên match thường sẽ veto ngay. Nhánh departure thay bằng chứng minh khác: fragment phải bắt đầu gần gốc ô đỗ và khoảng cách tới gốc phải tăng dần.",
          "Fragment ổn định mà không rời xa gốc bị reject stable_not_leaving_slot. Nhánh này vẫn cộng điểm bằng cùng sáu trọng số như match thường."
        ],
        values: [
          { k: "veto departure khi stable", v: "radial_gain ≤ 0 hoặc cos < 0", kind: "class-default", src: "backend/main_detect/src/techgar/trajectory_memory.py:501-508" }
        ]
      }
    ],

    /* ④ Số liệu & công thức */
    formulas: [
      {
        name: "Corridor score",
        expr: "s_corridor = 1 − corridor / prediction_radius",
        subst: "1 − 0.8997 / 16.218",
        result: "≈ 0.9445",
        note: "giá trị thật của ca sang8 f600 khi so với gid1; radius 16.218 là snapshot cal-20260927 — live cal-20261006 ≈15.85",
        src: "backend/main_detect/src/techgar/trajectory_memory.py:362"
      },
      {
        name: "Time topology",
        expr: "s_tt = min(1 − gap / recent_window, topology)",
        subst: "gap ≈ 50.95 s ≈ 1530 frame vs window 45 frame",
        result: "= 0.0",
        note: "gap đỗ yên của sang8 vượt xa cửa sổ nên thành phần này sập",
        src: "backend/main_detect/src/techgar/trajectory_memory.py:363"
      },
      {
        name: "Speed score",
        expr: "s_speed = 1 − |ln(v_new / v_old)| / ln 4",
        subst: "v_new = v_old → ln 1 = 0",
        result: "= 1.0",
        note: "chênh lệch tốc độ bốn lần làm điểm về 0 (minh họa)",
        src: "backend/main_detect/src/techgar/trajectory_memory.py:382-384"
      },
      {
        name: "Trajectory score",
        expr: "score = 0.35·cor + 0.25·app + 0.15·dir + 0.10·spd + 0.10·tt + 0.05·size",
        subst: "0.35×0.9445 + 0.25×0.8331 + 0.15×0.0015 + 0.10×0.9708 + 0.10×0 + 0.05×0.6437",
        result: "= 0.6683 < 0.78",
        note: "thay số thật ca sang8 f600: direction≈0 và time_topology=0 kéo xe đỗ yên xuống dưới ngưỡng",
        src: "backend/main_detect/src/techgar/trajectory_memory.py:395-402"
      }
    ],
    params: [
      { name: "match_threshold", value: "0.78", kind: "class-default", role: "ngưỡng chấp nhận của trajectory score", src: "backend/main_detect/src/techgar/cross_camera_manager.py:451" },
      { name: "ambiguity_margin", value: "0.12", kind: "class-default", role: "biên điểm để coi hai fragment tranh chấp cùng identity", src: "backend/main_detect/src/techgar/cross_camera_manager.py:452" },
      { name: "history_seconds", value: "2.0 s", kind: "runtime", role: "cửa sổ rolling của vệt thế giới", src: "backend/main_detect/two_camera.py:1974" },
      { name: "min_observations", value: "3", kind: "class-default", role: "số quan sát tối thiểu để fragment được coi ổn định", src: "backend/main_detect/src/techgar/trajectory_memory.py:59" },
      { name: "max_samples", value: "240", kind: "class-default", role: "trần mẫu mỗi vệt", src: "backend/main_detect/src/techgar/trajectory_memory.py:62" },
      { name: "min_direction_cosine", value: "0.25", kind: "runtime", role: "veto fragment ổn định đi ngược hướng", src: "backend/main_detect/two_camera.py:1951" },
      { name: "prediction_radius", value: "16.218 (cal-20260927); live ≈15.85 (cal-20261006)", kind: "derived", role: "bán kính hành lang dự đoán, bằng dormant_match_distance đã resolve", src: "backend/main_detect/src/techgar/cross_camera_manager.py:7013" }
    ],

    /* ⑤ Hình thật */
    figures: [
      {
        src: "assets/real/trajectory-reid-matched-hiep3-f467.jpg",
        alt: "Fragment lid13 trên cam2 được match vào GID 2 với score 0.842",
        caption: "Cam2 f467 của session_hiep3: fragment lid13 được nhận lại vào GID 2 qua world_trajectory_reid_matched với score 0.842, world_distance 0.62 và appearance_distance 0.135.",
        origin: "session_hiep3/f467/cam2"
      },
      {
        src: "assets/real/trajectory-reid-fail-sang8-f600.jpg",
        alt: "Fragment lid40 nhận GID 3 mới dù trùng chỗ GID 1 cũ",
        caption: "Cam2 f600 của session_hiep_sang8: box đỏ là lid40 vừa được cấp GID 3, box xanh là vị trí cuối của lid35 thuộc GID 1 tại f295. Cùng một xe đỗ yên nhưng score chỉ 0.6683 vì direction≈0.0015 và time_topology = 0.",
        origin: "session_hiep_sang8/f600/cam2"
      }
    ],
    noFigureReason: null,
    interactive: null,

    /* ⑥ Giới hạn & lỗi thật */
    limits: [
      {
        text: "Xe đỗ yên nhiều phút làm sập hai thành phần cùng lúc. Vận tốc gần 0 khiến direction cosine thành nhiễu, và khoảng trống thời gian dài khiến time_topology về 0. Ca sang8 f600 mất lineage vì 0.6683 < 0.78 dù corridor 0.94 và appearance 0.83.",
        evidence: { session: "verify_cur_session_hiep_sang8", frame: 600, status: "CONFIRMED" }
      },
      {
        text: "Fragment quá non trẻ bị loại trước khi chấm: cần ít nhất ba mẫu quỹ đạo và hai mẫu appearance. Mất dấu sớm sau khi xuất hiện có thể không đủ evidence để chứng minh lại identity cũ."
      },
      {
        text: "Cửa sổ vệt chỉ hai giây nên trail của identity lâu không quan sát sẽ bị prune khỏi tính toán. Khi đó match dựa nhiều hơn vào gallery và các cổng khác (suy luận từ cơ chế prune theo timestamp)."
      },
      {
        text: "Mọi nhận định về cùng xe vật lý ngoài ca sang8 đều chưa có ground truth đầy đủ. Các ca trong rủi-ro stationary re-acquire khác vẫn mang nhãn UNSURE cho tới khi verify độc lập."
      }
    ],

    /* ⑦ Nguồn */
    sources: [
      { ref: "backend/main_detect/src/techgar/trajectory_memory.py:48-97", kind: "class-default", note: "ctor WorldTrajectoryMemory + hai kho + append/prune" },
      { ref: "backend/main_detect/src/techgar/trajectory_memory.py:99-136", kind: "class-default", note: "append_provisional / promote vào global" },
      { ref: "backend/main_detect/src/techgar/trajectory_memory.py:178-238", kind: "class-default", note: "remove_missing_provisionals + _camera_tail" },
      { ref: "backend/main_detect/src/techgar/trajectory_memory.py:240-304", kind: "class-default", note: "_estimate median velocity + curvature + point-segment" },
      { ref: "backend/main_detect/src/techgar/trajectory_memory.py:306-422", kind: "class-default", note: "match(): corridor/time/direction/speed + hard rejects + trọng số" },
      { ref: "backend/main_detect/src/techgar/trajectory_memory.py:424-537", kind: "class-default", note: "match_departure: radial-outward cho xe rời ô" },
      { ref: "backend/main_detect/src/techgar/cross_camera_manager.py:448-453", kind: "class-default", note: "khởi tạo với match_threshold 0.78, margin 0.12" },
      { ref: "backend/main_detect/src/techgar/cross_camera_manager.py:5274-5288", kind: "runtime", note: "_reid_window = handoff_ttl / effective fps" },
      { ref: "backend/main_detect/src/techgar/cross_camera_manager.py:6784-7227", kind: "runtime", note: "_match_world_trajectory_identities: candidate/identity filters, chuỗi veto, defer plausible, LAPJV, ambiguity" },
      { ref: "backend/main_detect/two_camera.py:1951,1968-1978,2182", kind: "runtime", note: "CLI: min_direction_cosine 0.25, dormant-match resolved 16.218 (cal-20260927; live ≈15.85), history 2.0" },
      { ref: "backend/main_detect/experiment_test/output/verify_cur_session_hiep_sang8/predictions.jsonl:600", kind: "runtime", note: "global_id_created gid3 + world_trajectory_rejections score 0.6683" },
      { ref: "backend/main_detect/experiment_test/output/session_hiep3/predictions.jsonl:467", kind: "runtime", note: "world_trajectory_reid_matched gid2 score 0.842" }
    ],
    pseudocode: "MOI FRAME:\n  provisional[key].append(sample)  # frame, t, cam, lid, world, bbox\n  prune theo timestamp - 2.0s ; cap 240 mau\n\nMATCH(gid, fragment):\n  src <- estimate(global[gid] cung last_camera)\n  cand <- estimate(provisional[fragment])\n  gap  <- cand.first - src.last (0 neu overlap)\n  pred <- src.pos + src.v * gap\n  cor  <- dist(cand.origin, doan[src.pos, pred])\n  hard: cor > radius -> teleport ; topology<=0 ; stable & cos<min_dir\n  score <- 0.35*(1-cor/r) + 0.25*app + 0.15*dir + 0.10*spd\n           + 0.10*min(time,topology) + 0.05*size\n  LAPJV tren ma tran 1-score, cost<=0.22, margin ambiguity 0.12"
  });
})();
