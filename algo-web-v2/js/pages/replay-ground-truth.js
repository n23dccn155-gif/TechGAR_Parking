/* replay-ground-truth.js — Trang 22: Replay kiểm chứng và vai trò của ground truth.
 * Nguồn số liệu đã xác minh: .analysis/algo-web-v2-redesign/notes/replay-ground-truth.md
 * Số liệu chiến dịch: .analysis/verify-replay/V1-replay-results.md + ERRORS-SUMMARY.md §0
 */
(function () {
  "use strict";
  TG.definePage({
    id: "replay-ground-truth",
    group: "data",
    title: "Replay và ground truth — kiểm chứng pipeline trên video đã ghi",
    navLabel: "Replay & ground truth",
    order: 22,
    prev: "predictions-jsonl",
    next: "failure-gallery",

    /* ① Chức năng & vị trí */
    fn: {
      text: "Replay là cách chạy lại pipeline trên video đã ghi sẵn thay vì camera sống. Nó cho ra [[Runtime snapshot]] và predictions.jsonl mới trên cùng dữ liệu đầu vào, để đối chiếu hành vi giữa các lần chạy và giữa các phiên bản thuật toán."
    },

    /* ② Vì sao cần */
    why: {
      paras: [
        "Thuật toán có chân nhiễu không kiểm chứng được trên camera sống: không ai quay lại đúng cảnh cũ để so hai phiên bản code. Video đã ghi đóng vai trò dữ liệu đông lạnh — cùng một đầu vào cho mọi lần đánh giá.",
        "Replay cũng là cách sản sinh predictions.jsonl cho session cũ khi format đổi. Chạy lại runtime_server với video gốc sinh ra bộ artifact mới mà không cần quay lại bãi xe.",
        "Nhưng replay chỉ chứng minh pipeline chạy đúng và lặp lại được. Câu hỏi 'đúng hay sai so với thực tế' cần một trục đối chiếu khác gọi là ground truth."
      ]
    },

    /* ③ Cách hoạt động */
    how: [
      {
        id: "3.1",
        name: "Video ghi sẵn đóng vai camera",
        paras: [
          "Cờ --cam1-video và --cam2-video trỏ tới hai file raw_camN.mp4 của session gốc. Pipeline xử lý các cặp frame đồng bộ từ hai file y như khi đọc từ camera trực tiếp.",
          "Nhịp thời gian không lấy từ đồng hồ máy chạy mà từ frame_timestamps.csv đã ghi. File này được kiểm tra đủ cột và frame phải liên tục từ một trước khi replay bắt đầu.",
          "Mỗi frame replay có replay_timing riêng và số frame của nó phải đúng kế tiếp. Một video nhiều frame hơn file timestamps là lỗi cứng chứ không phải cảnh báo."
        ],
        values: [
          { k: "nguồn frame", v: "raw_cam1.mp4 + raw_cam2.mp4 của session", kind: "runtime", src: "backend/main_detect/two_camera.py:1742" },
          { k: "kiểm timestamps", v: "đủ cột + frame liên tục từ 1", kind: "runtime", src: "backend/main_detect/two_camera.py:189-206" },
          { k: "lệch nhịp", v: "lỗi cứng, không phải cảnh báo", kind: "runtime", src: "backend/main_detect/two_camera.py:243,2461-2465" }
        ]
      },
      {
        id: "3.2",
        name: "Timestamp gốc được phát lại, không phải giờ chạy lại",
        paras: [
          "capture_unix_ns, wall_time_iso và camera_timestamps_ns trong predictions mới đều lấy lại giá trị đã ghi của frame gốc. Chỉ khi metadata thiếu mới fallback sang đồng hồ hiện tại.",
          "Điều đó làm hai phiên chạy cùng video cho ra dòng predictions đối chiếu được từng trường. Thời điểm chạy lại không nhiễu vào dữ liệu.",
          "Một session replay ghi đủ artifact: predictions.jsonl, frame_timestamps.csv, performance.csv và tùy chọn video. Cờ --no-session-video tắt phần video để chỉ giữ phân tích."
        ],
        values: [
          { k: "nguồn timestamp", v: "replay_timing của frame gốc", kind: "runtime", src: "backend/main_detect/two_camera.py:3021-3031" },
          { k: "analysis-only", v: "--no-session-video", kind: "runtime", src: "backend/main_detect/two_camera.py:3243" }
        ]
      },
      {
        id: "3.3",
        name: "Chiến dịch verify-replay — độ phủ thật",
        paras: [
          "Chiến dịch đã chạy lại mười tám session official, tổng bốn mươi mốt nghìn sáu trăm hai mươi lăm cặp frame hai camera. Tất cả hoàn tất với exit 0, record_consistent đúng và không một dòng cảnh báo hay lỗi trong log.",
          "Sáu file config được băm SHA-256 trước và sau đợt chạy để chứng minh pipeline không tự sửa cấu hình giữa chừng. Không file code nào bị đụng trong suốt chiến dịch.",
          "Trên đầu ra replay, auto-scan duyệt trăm phần trăm frame cả hai camera theo bảy nhóm cờ bất thường. Rà soát bằng mắt phủ khoảng mười sáu nghìn ba trăm cam-frame. Lớp này gồm mẫu đều một frame mỗi hai giây mỗi camera cộng toàn bộ cửa sổ sự kiện."
        ],
        values: [
          { k: "session replay", v: "18/18 completed_replay, exit 0", kind: "runtime", src: ".analysis/verify-replay/V1-replay-results.md" },
          { k: "tổng cặp frame", v: "41.625 (83.250 cam-frame)", kind: "runtime", src: ".analysis/verify-replay/v1-percam-frames.json" },
          { k: "config freeze", v: "6 file SHA-256 khớp trước/sau", kind: "runtime", src: ".analysis/verify-replay/V1-replay-results.md" },
          { k: "eyeball coverage", v: "~16.300 cam-frame ≈ 19.6%", kind: "runtime", src: ".analysis/verify-replay/ERRORS-SUMMARY.md" }
        ]
      },
      {
        id: "3.4",
        name: "Ground truth — trục đối chiếu đang mỏng",
        paras: [
          "Mỗi session đi kèm ba file ground truth CSV có schema sẵn: ô đỗ theo frame, sự kiện vật lý và identity. Đó là phía 'sự thật' mà predictions được đem ra so.",
          "Tuy nhiên đợt kiểm chứng ghi nhận các file này gần như chỉ có header. Khi GT chưa được điền nội dung, mọi kết luận dạng 'tỷ lệ đổi ID' hay 'độ chính xác toàn hệ thống' đều chưa thể phát biểu.",
          "Đây là lý do trang này và predictions.jsonl đi cạnh nhau: một bên là 'hệ thống nghĩ gì', một bên là 'thế giới thật thế nào'. Độ chính xác chỉ tồn tại khi hai bên được nối với nhau."
        ],
        values: [
          { k: "file GT", v: "ground_truth_{slots,events,identity}.csv", kind: "runtime", src: "backend/main_detect/two_camera.py:2125-2140" },
          { k: "trạng thái GT hiện tại", v: "gần như chỉ header → harm (mức độ hại lỗi) UNVERIFIED", kind: "runtime", src: ".analysis/verify-replay/ERRORS-SUMMARY.md" }
        ]
      }
    ],

    /* ④ Tham số & công thức */
    formulas: [
      {
        name: "Điều kiện replay nhất quán",
        expr: "pred_lines == src_frames == processed_frames",
        subst: "ví dụ session_test1: 298 == 298 == 298",
        result: "record_consistent = true",
        note: "mỗi session phải ghi đúng một dòng prediction cho mỗi frame nguồn",
        src: ".analysis/verify-replay/v1-replay-results.json"
      },
      {
        name: "Cặp frame đồng bộ",
        expr: "cam1_frames = cam2_frames mỗi session",
        subst: "session_thai7: 2872 = 2872",
        result: "không session nào lệch nhịp hai camera",
        note: "18 session đều có cam1 bằng cam2 trong v1-percam-frames",
        src: ".analysis/verify-replay/v1-percam-frames.json"
      }
    ],
    params: [
      { name: "session official", value: "18/18", kind: "runtime", role: "tất cả session chính thức replay thành công", src: ".analysis/verify-replay/V1-replay-results.md" },
      { name: "tổng cặp frame", value: "41.625", kind: "runtime", role: "41625 cặp đồng bộ cam1+cam2, tức 83250 cam-frame", src: ".analysis/verify-replay/v1-percam-frames.json" },
      { name: "session ngắn nhất", value: "session_test1: 298 frame", kind: "runtime", role: "elapsed ~216 s trong đợt verify", src: ".analysis/verify-replay/v1-replay-results.json" },
      { name: "session dài nhất", value: "session_hiep_thai1: 6050 frame", kind: "runtime", role: "cặp frame nhiều nhất cohort", src: ".analysis/verify-replay/v1-percam-frames.json" },
      { name: "warn/error log", value: "0 + 0", kind: "runtime", role: "không dòng warn hay error nào trong log replay cohort", src: ".analysis/verify-replay/v1-replay-results.json" }
    ],

    /* ⑤ Hình thật */
    figures: [
      {
        src: "assets/real/replay-ground-truth-sheet.jpg",
        alt: "Contact sheet chín frame replay của session thai8 trên cam2: ô đỗ viền màu, ROI vàng và xe được gán lại local id với global id",
        caption: "Một trang của đợt rà soát bằng mắt trên output replay verify_cur_session_thai8. Mỗi ô là một frame replay thật với ROI, slot outline và track box.",
        origin: "verify_replay/f0/cam2"
      }
    ],

    /* ⑥ Giới hạn & lỗi thật */
    limits: [
      { text: "Replay PASS chỉ nói pipeline chạy lặp lại được trên video đã ghi. Nó không đo độ chính xác vì phía ground truth chưa có nội dung để so.", evidence: { status: "CONFIRMED" } },
      { text: "GT CSV hiện gần như chỉ header nên identity_impact và [[harm]] của các lỗi phát hiện phần lớn ở trạng thái UNVERIFIED.", evidence: { status: "CONFIRMED" } },
      { text: "Eyeball coverage khoảng 19.6% cam-frame. Tám mươi phần trăm còn lại chỉ qua auto-scan nên lỗi chỉ-thấy-bằng-mắt vẫn có thể nằm ngoài mẫu đã xem.", evidence: { status: "CONFIRMED" } },
      { text: "Freeze được kiểm chứng ở set-level và sáu config qua SHA. Fingerprint từng file riêng của một trăm bốn mươi tám file chỉ tồn tại trong bộ nhớ phiên chạy nên không so lại được per-file.", evidence: { status: "UNSURE" } }
    ],

    /* ⑦ Nguồn */
    sources: [
      { ref: "backend/main_detect/two_camera.py:155-250", kind: "runtime", note: "nạp + kiểm tra frame_timestamps.csv của replay" },
      { ref: "backend/main_detect/two_camera.py:1742", kind: "runtime", note: "replay đồng bộ raw_cam1/2 bằng timestamps" },
      { ref: "backend/main_detect/two_camera.py:2461-2465", kind: "runtime", note: "frame_idx replay phải liên tục" },
      { ref: "backend/main_detect/two_camera.py:3021-3031", kind: "runtime", note: "timestamp gốc phát lại trong predictions" },
      { ref: "backend/main_detect/two_camera.py:2125-2140", kind: "runtime", note: "schema 3 file ground_truth CSV" },
      { ref: ".analysis/verify-replay/V1-replay-results.md", kind: "runtime", note: "18/18 completed_replay, canonical" },
      { ref: ".analysis/verify-replay/v1-replay-results.json", kind: "runtime", note: "exit/elapsed/record_consistent từng session" },
      { ref: ".analysis/verify-replay/v1-percam-frames.json", kind: "runtime", note: "số frame mỗi cam — tổng 41.625 cặp" },
      { ref: ".analysis/verify-replay/ERRORS-SUMMARY.md", kind: "runtime", note: "độ phủ scan/eyeball + trạng thái GT" }
    ]
  });
})();
