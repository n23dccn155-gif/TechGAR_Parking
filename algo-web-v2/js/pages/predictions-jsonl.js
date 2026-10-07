/* predictions-jsonl.js — Trang 21: Nhật ký predictions.jsonl cho đánh giá offline.
 * Nguồn số liệu đã xác minh: .analysis/algo-web-v2-redesign/notes/predictions-jsonl.md
 * File thật đã đọc: backend/main_detect/experiment_test/output/reidfix_r0_session_thai7/predictions.jsonl (2872 dòng)
 */
(function () {
  "use strict";
  TG.definePage({
    id: "predictions-jsonl",
    group: "data",
    title: "predictions.jsonl — nhật ký mỗi frame cho đánh giá offline",
    navLabel: "predictions.jsonl",
    order: 21,
    prev: "voice-guidance",
    next: "replay-ground-truth",

    /* ① Chức năng & vị trí */
    fn: {
      text: "Khi một phiên được replay hoặc ghi lại vào session_dir, pipeline ghi thêm một file JSON Lines gọi là predictions.jsonl. Mỗi dòng là trạng thái phẳng của một frame: mọi quan sát, mọi ô đỗ và mọi sự kiện mới phát sinh trong frame đó."
    },

    /* ② Vì sao cần */
    why: {
      paras: [
        "Snapshot API trả lời câu hỏi 'bây giờ trông thế nào' nhưng không trả lời được 'tại frame này hệ thống đã quyết định gì và vì sao'. Đánh giá thuật toán cần thứ hai.",
        "Vì vậy experiment mode xuất một nhật ký từng frame, tách biệt hoàn toàn khỏi đường live. Module writer nói thẳng trong docstring rằng live JSON và OpenCV UI không dùng nó.",
        "Định dạng JSON Lines cho phép đọc streaming từng frame một mà không nạp cả file vào bộ nhớ. Một phiên hai nghìn tám trăm frame thì file có đúng hai nghìn tám trăm dòng."
      ]
    },

    /* ③ Cách hoạt động */
    how: [
      {
        id: "3.1",
        name: "Một dòng một frame — record tự chứa",
        paras: [
          "Mỗi frame đi qua PredictionV3Builder.build_frame và thành một object JSON duy nhất. Ngoài chỉ số frame và timestamp, nó chứa toàn bộ observations, slots, gid_aliases và các biên bản event của frame đó.",
          "Timestamp đi kèm đủ ba dạng: capture_unix_ns cho sắp xếp, wall_time_iso cho con người đọc và camera_timestamps_ns từng camera cùng camera_skew_ms. Skew là chênh tuyệt đối đồng hồ hai camera tính bằng mili giây.",
          "Sau khi builder xong, điểm ghi còn bơm thêm ba trường: parking_episodes toàn phần, pending_parking_confirmations và trạng thái parking_pipeline theo camera. File vì thế phản ánh đủ trạng thái mà replay cần."
        ],
        values: [
          { k: "schema_version", v: "3", kind: "runtime", src: "backend/main_detect/src/techgar/prediction_writer.py:16" },
          { k: "trường top-level", v: "18 (frame thật thai7)", kind: "runtime", src: "backend/main_detect/two_camera.py:3038-3061" },
          { k: "camera_skew_ms", v: "|t_cam1 − t_cam2| / 1e6, làm tròn 3 lẻ", kind: "runtime", src: "backend/main_detect/src/techgar/prediction_writer.py:479" },
          { k: "ghi file", v: "queue counted_recording_action, ngoài vòng nóng", kind: "runtime", src: "backend/main_detect/two_camera.py:3076-3080" }
        ]
      },
      {
        id: "3.2",
        name: "observations và slots — trạng thái phẳng theo frame",
        paras: [
          "Mỗi observation là một local track trên một camera, định danh bằng observation_uid dạng frame, camera, local id. Nó mang bbox, anchor pixel, anchor thế giới qua homography, trạng thái track và trạng thái identity.",
          "Trường canonical_gid luôn đi qua hàm canonicalize của manager nên gid đã retire được quy về canonical. raw_gid giữ nguyên giá trị gốc để đối chiếu. Track chưa gán gid thì identity_state là 'unassigned'.",
          "Mỗi slot là một ô đỗ trên một camera với occupied, vision_occupied, tracking_occupied, decision_source và bộ field recovery. Trong session thai7, mỗi frame ghi đúng sáu mươi slot và tối đa mười hai observation.",
          "slot_ownership của observation trỏ ngược lại ô mà gid đó đang sở hữu, nên người đọc nối được 'xe gid 5' với 'ô C10' mà không cần join tay."
        ],
        values: [
          { k: "observation_uid", v: "frame-%09d:cam:lid", kind: "runtime", src: "backend/main_detect/src/techgar/prediction_writer.py:276-278" },
          { k: "số field/observation", v: "29 (đếm trên file thật)", kind: "runtime", src: "backend/main_detect/src/techgar/prediction_writer.py:275-355" },
          { k: "slot mỗi frame", v: "60 (thai7), join từ binder.to_json", kind: "runtime", src: "backend/main_detect/src/techgar/prediction_writer.py:197-198" },
          { k: "canonical_gid", v: "qua manager.canonical_global_id", kind: "runtime", src: "backend/main_detect/src/techgar/prediction_writer.py:87-97" }
        ]
      },
      {
        id: "3.3",
        name: "Rolling delta — mỗi event đúng một lần",
        paras: [
          "recent_events của manager và binder.events là deque có giới hạn. Nếu writer chỉ đọc chúng mỗi frame thì một event có thể bị ghi trùng nhiều frame, hoặc mất hẳn khi deque tràn.",
          "_RollingEventDelta giải bài toán đó bằng so khớp chồng lắp suffix-prefix trên cặp id-object và fingerprint sha1. Đuôi của lần đọc trước khớp đầu lần đọc này thì chỉ phần mới được trả ra.",
          "Cách này đúng cả khi deque đẩy phần tử cũ ra lẫn khi hai event liền nhau giống hệt nội dung. Vì fingerprint đi kèm id-object, hai event cùng chữ vẫn là hai event khác nhau.",
          "Event được chuẩn hóa thành event_uid tăng dần có zero-pad, source chỉ rõ global_manager hay motion_tracker hay slot_binder, còn mọi field lạ được gom vào details."
        ],
        values: [
          { k: "event_uid", v: "{category}-{serial:09d}", kind: "runtime", src: "backend/main_detect/src/techgar/prediction_writer.py:99-102" },
          { k: "fingerprint", v: "sha1(JSON sort-keys của event)", kind: "runtime", src: "backend/main_detect/src/techgar/prediction_writer.py:39-46" },
          { k: "identity event_type thật", v: "44 loại (thai7)", kind: "runtime", src: "backend/main_detect/experiment_test/output/reidfix_r0_session_thai7/predictions.jsonl" },
          { k: "parking event_type thật", v: "19 loại (thai7)", kind: "runtime", src: "backend/main_detect/experiment_test/output/reidfix_r0_session_thai7/predictions.jsonl" }
        ]
      },
      {
        id: "3.4",
        name: "Nó là baseline của replay, không phải ground truth",
        paras: [
          "predictions.jsonl ghi quyết định CỦA hệ thống chứ không ghi sự thật của thế giới. Nếu tracker gán sai gid, file ghi đúng gid sai đó — đó chính là điểm để so với ground truth.",
          "Bộ ground truth đi cùng session nằm ở ba file CSV riêng gồm ground_truth_slots, ground_truth_events và ground_truth_identity. Hai luồng dữ liệu này là hai phía của phép so sánh.",
          "Vì vậy đọc file này để hiểu hệ thống 'nghĩ gì' tại từng frame, rồi đối chiếu ground truth để biết nó nghĩ đúng hay sai. Trang kế tiếp đi sâu vào phía ground truth."
        ],
        values: [
          { k: "file GT đi kèm", v: "3 CSV: slots / events / identity", kind: "runtime", src: "backend/main_detect/two_camera.py:2125-2140" },
          { k: "vai trò", v: "đầu vào đánh giá offline, không phải API live", kind: "runtime", src: "backend/main_detect/src/techgar/prediction_writer.py:3-4" }
        ]
      }
    ],

    /* ④ Tham số & công thức */
    formulas: [
      {
        name: "Delta của rolling history",
        expr: "delta_t = current[max_overlap:] với suffix(prev) = prefix(current)",
        subst: "overlap so trên cặp (id(event), sha1(event))",
        result: "mỗi event được xuất đúng một lần kể cả khi deque trôi",
        note: "giữ được event giống-hệt-byte vì fingerprint đi kèm id-object",
        src: "backend/main_detect/src/techgar/prediction_writer.py:63-76"
      },
      {
        name: "Skew hai camera",
        expr: "skew_ms = |t_cam1 − t_cam2| / 1 000 000",
        subst: "|12083828 − 12083859| ms = 31.0 (thai7, frame 1)",
        result: "31.0",
        note: "đồng hồ monotonic của hai capture thread, làm tròn 3 số lẻ",
        src: "backend/main_detect/two_camera.py:3025-3027"
      }
    ],
    params: [
      { name: "PREDICTION_SCHEMA_VERSION", value: "3", kind: "runtime", role: "phiên bản schema của mọi dòng; file cũ v1/v2 được migrate offline", src: "backend/main_detect/src/techgar/prediction_writer.py:16" },
      { name: "frames trong session thai7", value: "2872", kind: "runtime", role: "một dòng một frame — file 2872 dòng tương ứng 2872 frame", src: "backend/main_detect/experiment_test/output/reidfix_r0_session_thai7/predictions.jsonl" },
      { name: "event nhiều nhất (thai7)", value: "association_rejected_stale_track ×2068", kind: "runtime", role: "loại event identity chiếm đa số trong phiên này", src: "backend/main_detect/experiment_test/output/reidfix_r0_session_thai7/predictions.jsonl" },
      { name: "slots mỗi frame", value: "60", kind: "runtime", role: "30 ô cam1 + 30 ô cam2, join từ binder.to_json", src: "backend/main_detect/src/techgar/prediction_writer.py:197-198" }
    ],

    /* ⑤ Hình thật */
    figures: [],
    noFigureReason: "Trang về định dạng dữ liệu: nội dung trực quan nhất là chính các dòng JSON đã trích dẫn ở mục ③ và bảng tham số ④, không có khung hình camera nào minh họa riêng cho format.",

    /* ⑥ Giới hạn & lỗi thật */
    limits: [
      { text: "predictions.jsonl chỉ tồn tại khi chạy có session_dir. Runtime server phục vụ live không ghi file này, nên phiên live muốn có phải replay lại.", evidence: { status: "CONFIRMED" } },
      { text: "File ghi quyết định của hệ thống kể cả khi quyết định sai. Nó là baseline để đánh giá, không phải sự thật mặt đất.", evidence: { status: "CONFIRMED" } },
      { text: "Rolling delta dựa vào id-object nên chỉ đúng trong cùng một tiến trình. Hai phiên ghi riêng không thể nối event_uid của nhau.", evidence: { status: "CONFIRMED" } },
      { text: "Fingerprint sha1 nhìn vào nội dung JSON của event. Hai event khác nhau nhưng serialize giống hệt trên cùng object-id giả thiết chưa được kiểm chứng là không xảy ra.", evidence: { status: "UNSURE" } }
    ],

    /* ⑦ Nguồn */
    sources: [
      { ref: "backend/main_detect/src/techgar/prediction_writer.py:1-6", kind: "runtime", note: "module docstring: experiment-only, live không dùng" },
      { ref: "backend/main_detect/src/techgar/prediction_writer.py:16", kind: "runtime", note: "PREDICTION_SCHEMA_VERSION = 3" },
      { ref: "backend/main_detect/src/techgar/prediction_writer.py:49-76", kind: "runtime", note: "_RollingEventDelta: overlap suffix/prefix + fingerprint" },
      { ref: "backend/main_detect/src/techgar/prediction_writer.py:104-149", kind: "runtime", note: "_normalise_event: event_uid/source/canonical_gid/details" },
      { ref: "backend/main_detect/src/techgar/prediction_writer.py:190-356", kind: "runtime", note: "_slots + _observations: schema phẳng mỗi frame" },
      { ref: "backend/main_detect/src/techgar/prediction_writer.py:423-501", kind: "runtime", note: "build_frame: 15 trường core + skew + policy" },
      { ref: "backend/main_detect/two_camera.py:2107-2119", kind: "runtime", note: "mở file khi có session_dir" },
      { ref: "backend/main_detect/two_camera.py:3038-3064", kind: "runtime", note: "build_frame + 3 trường bơm thêm + json.dumps" },
      { ref: "backend/main_detect/two_camera.py:2125-2140", kind: "runtime", note: "3 file ground_truth CSV đi kèm" },
      { ref: "backend/main_detect/experiment_test/output/reidfix_r0_session_thai7/predictions.jsonl", kind: "runtime", note: "file thật: 2872 dòng, 44 + 19 event_type" }
    ]
  });
})();
