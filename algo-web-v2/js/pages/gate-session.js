/* gate-session.js — Trang 17: Gate crossing & session controller.
 * Nguồn số liệu đã xác minh: .analysis/algo-web-v2-redesign/notes/gate-session.md
 */
(function () {
  "use strict";
  TG.definePage({
    id: "gate-session",
    group: "gate-frontend",
    title: "Gate crossing & phiên đỗ xe",
    navLabel: "Gate & session",
    order: 17,
    prev: "snapshot-api",
    next: "frontend-dataflow",

    /* ① Chức năng & vị trí */
    fn: {
      text: "gate_session_controller là tiến trình thứ hai của backend. Nó poll [[Runtime snapshot]] bốn lần mỗi giây và phát hiện xe đi qua hai đường cổng trên bản đồ thế giới. Các sự kiện đó trở thành phiên đỗ xe có QR, phục vụ qua REST API ở cổng 8000."
    },

    /* ② Vì sao cần */
    why: {
      paras: [
        "Pipeline tracking chỉ trả lời 'xe mang [[GID]] nào đang ở đâu'. Tài xế cần một thứ bền hơn: một phiên sống suốt hành trình vào bãi. Phiên đó gắn mã QR để chọn ô và nhận chỉ đường.",
        "Gắn phiên vào gate crossing, chứ không vào việc phát hiện xe, giúp hệ thống bỏ qua mọi xe đỗ sẵn khi khởi động. Chỉ chiếc nào thực sự cắt qua đường cổng vào mới mở phiên. Chỉ chiếc nào cắt đường cổng ra mới đóng phiên."
      ]
    },

    /* ③ Cách hoạt động */
    how: [
      {
        id: "3.1",
        name: "Vòng poll và bốn lớp guard đầu vào",
        paras: [
          "Vòng lặp chính gọi GET /api/runtime/snapshot mỗi 0.25 giây với timeout ba giây. Nguồn lỗi chỉ bị log rồi chờ thêm tối thiểu một giây — controller không chết theo runtime.",
          "Trước khi xử lý, process_snapshot kiểm tra bốn thứ. [[schema version]] phải là 2, snapshot phải 'live' và tươi, phải có runtime_id. Unit của gate config cũng phải khớp unit snapshot — sai unit là lỗi ValueError nổ ra ngoài vòng xử lý.",
          "Độ tươi được định nghĩa chặt. source_mode là 'live', mọi camera online với age_ms từ 0 đến 5000. Với published_at, controller đo age bằng now trừ published_at và chỉ nhận age từ âm một đến dương năm giây. Age dương là timestamp đã cũ — được phép trễ tới năm giây; age âm là timestamp chạy trước — chỉ được vượt tương lai một giây. Snapshot replay hoặc đọc từ file không qua được cổng này.",
          "runtime_id đổi nghĩa là backend vừa khởi động lại: coordinator xóa sạch vị trí trước, candidate đỗ/rời, [[episode cursor]] và tập conflict. Frame lùi so với frame đã xử lý bị bỏ, còn cùng frame thì chỉ áp dụng episode revision mới rồi dừng."
        ],
        values: [
          { k: "chu kỳ poll", v: "0.25 s (--poll-interval)", kind: "runtime", src: "backend/gate_session_controller.py:865" },
          { k: "HTTP timeout", v: "3.0 s", kind: "class-default", src: "backend/gate_session_controller.py:708" },
          { k: "camera age_ms hợp lệ", v: "0 – 5000 ms", kind: "class-default", src: "backend/gate_session_controller.py:113-119" },
          { k: "lệch giờ published_at", v: "−1.0 → +5.0 s", kind: "class-default", src: "backend/gate_session_controller.py:121-123" },
          { k: "unit sai", v: "raise ValueError", kind: "class-default", src: "backend/gate_session_controller.py:407-410" }
        ]
      },
      {
        id: "3.2",
        name: "Cổng là một đoạn thẳng, không phải một vùng",
        paras: [
          "gate_zones.json định nghĩa entry_gate và exit_gate, mỗi cái là hai điểm p1–p2 trong không gian world cùng một direction 'positive' hoặc 'negative'. Bản đang dùng đo cổng vào từ (39.67, 8.90) tới (38.87, −6.00) và cổng ra từ (50.83, 63.37) tới (49.39, 51.43), đơn vị centimet.",
          "Một crossing xảy ra khi đoạn từ vị trí trước tới vị trí mới cắt đoạn gate. check_line_intersection kiểm tra điều này bằng tích chéo hai chiều. Sau đó get_crossing_direction tính dấu tích chéo giữa vector xe đi và vector gate. Trường direction trong config quyết định dấu nào hợp lệ.",
          "Hệ quả thực dụng: xe đi dọc theo đường cổng không bao giờ bị đếm. Xe qua cổng theo chiều ngược, như vào bãi bằng cổng ra, cũng bị direction chặn. Đây là điểm duy nhất dùng [[Homography]] ngược chiều — gate sống trên bản đồ world còn vị trí xe đã là centimet nên không cần chiếu lại."
        ],
        values: [
          { k: "entry_gate hiện tại", v: "(39.67,8.90)→(38.87,−6.00) dir=positive", kind: "config", src: "backend/main_detect/config/gate_zones.json:6-18" },
          { k: "exit_gate hiện tại", v: "(50.83,63.37)→(49.39,51.43) dir=negative", kind: "config", src: "backend/main_detect/config/gate_zones.json:19-31" },
          { k: "cắt đoạn", v: "check_line_intersection (tích chéo ≤ 0 cả hai phía)", kind: "class-default", src: "backend/gate_session_controller.py:229-239" },
          { k: "dấu hướng", v: "cross(v_xe, v_gate) so với direction", kind: "class-default", src: "backend/gate_session_controller.py:242-256" }
        ]
      },
      {
        id: "3.3",
        name: "Entry crossing: trực tiếp hoặc truy hồi từ path",
        paras: [
          "Đường chính là direct crossing, đòi hỏi quan sát 'liên tục'. Xe phải observed và đã có vị trí trước đó. Hai lần nhìn thấy cách nhau không quá một giây theo đồng hồ controller. Timestamp nguồn (last_seen_time) cũng phải tăng đều trong ngưỡng một giây.",
          "Đường thứ hai cứu xe vào quá nhanh. Motion track cần vài frame để được promote thành [[GID]], nên một chiếc chạy nhanh có thể đã cắt cổng trước khi có global id. _recent_measured_entry_crossing rà tối đa mười hai điểm recent_observed_path. Nó tìm hai mẫu liên tiếp cùng camera, cùng local track, cách nhau không quá một giây.",
          "Khi một trong hai điều kiện chạm và session chưa tồn tại, create_session cấp sessionId ngẫu nhiên token_urlsafe(12) và ghi vào file JSON. Mỗi cặp (global id, runtime) chỉ có một session mở. Vào lại cổng lần hai trả về đúng session cũ.",
          "Exit đối xứng nhưng đơn giản hơn. Chỉ cần crossing hợp lệ với quan sát liên tục và session đang có. delete_session xóa luôn phiên khỏi store cùng toàn bộ trạng thái candidate của xe đó."
        ],
        values: [
          { k: "continuity gate", v: "Δt quan sát ≤ 1.0 s + Δt nguồn ≤ 1.0 s", kind: "class-default", src: "backend/gate_session_controller.py:483-493" },
          { k: "recovered path", v: "≤ 12 mẫu, 2 mẫu liên tiếp cùng cam + cùng lid", kind: "class-default", src: "backend/gate_session_controller.py:275-309" },
          { k: "max_gap trong path", v: "1.0 s", kind: "class-default", src: "backend/gate_session_controller.py:264" },
          { k: "tạo phiên", v: "create_session → [ENTRY] log", kind: "class-default", src: "backend/gate_session_controller.py:514-521" },
          { k: "xóa phiên", v: "delete_session → [EXIT] log", kind: "class-default", src: "backend/gate_session_controller.py:523-534" }
        ]
      },
      {
        id: "3.4",
        name: "State machine của session và QR 120 giây",
        paras: [
          "Session sinh ra ở WAITING_FOR_SCAN với qrExpiresAt bằng thời điểm tạo cộng 120 giây. Quét mã thì claim chuyển sang SELECTING_SPOT. Chọn ô chuyển sang NAVIGATING_TO_SPOT, hoặc RELOCATING nếu xe đã có ô thật. Backend xác nhận đỗ đưa về PARKED. Xe lăn bánh hay chủ động exit đưa sang EXIT_NAVIGATION, và cắt cổng ra thì bị xóa.",
          "Danh sách /api/sessions/waiting chỉ trả session chưa claim và chưa quá hạn QR — hết 120 giây thì mã biến khỏi kiosk. Nhưng claim không kiểm tra hạn, nên session đã hết giờ vẫn claim được nếu ai đó biết id.",
          "select_spot có validator riêng: ô phải đang trống trong snapshot mới nhất (tối đa năm giây tuổi), không được session khác giữ chỗ, và session phải thuộc runtime hiện tại. Vi phạm trả mã lỗi riêng SPOT_NOT_AVAILABLE, SPOT_RESERVED, RUNTIME_UNAVAILABLE hoặc RUNTIME_MISMATCH.",
          "Session nào đang NAVIGATING_TO_SPOT hoặc RELOCATING với targetSpotId sẽ giữ chỗ: /api/sessions/reservations liệt kê chúng để frontend tô màu ô đã có chủ."
        ],
        values: [
          { k: "QR_DISPLAY_SECONDS", v: "120.0 s", kind: "class-default", src: "backend/session_manager.py:29" },
          { k: "sessionId", v: "secrets.token_urlsafe(12)", kind: "class-default", src: "backend/session_manager.py:283" },
          { k: "store", v: "backend/data/navigation_sessions.json", kind: "class-default", src: "backend/session_manager.py:23-26" },
          { k: "tuổi availability tối đa", v: "5.0 s", kind: "class-default", src: "backend/gate_session_controller.py:157" },
          { k: "states giữ chỗ", v: "NAVIGATING_TO_SPOT · RELOCATING", kind: "class-default", src: "backend/session_manager.py:33" }
        ]
      },
      {
        id: "3.5",
        name: "Parking episodes: nguồn sự thật của việc đỗ/rời ô",
        paras: [
          "Với schema v2, trạng thái PARKED không đến từ cảm giác 'xe đứng yên' của controller mà từ [[parking episode]] do backend phát hành. Mỗi episode mang global_id, slot_id, state parked/departing/released, evidence và applied frame kèm revision.",
          "_apply_parking_episodes chỉ chọn episode mới nhất mỗi xe. Thứ tự so sánh là applied_frame, rồi timestamp, rồi revision, cuối cùng rank state. Episode có evidence vượt applied frame, hoặc applied vượt frame hiện tại, bị loại ngay.",
          "Hai lớp chống xung đột: nếu một gid đỗ vào hai ô, hoặc hai gid cùng đỗ một ô, episode bị skip kèm diagnostic identity_or_slot_owner_conflict. Cursor per-session giữ [[idempotency]] — episode cũ hơn cursor hoặc không mới hơn trong cùng frame (trừ khi revision tăng) bị từ chối với diagnostic tương ứng.",
          "Episode parked đưa session về PARKED qua set_parked_by_global_id; departing hoặc released gọi apply_departure_episode, chỉ có tác dụng khi episode id khớp với episode đang gắn session. Lỗi session không làm chết coordinator mà chỉ ghi diagnostic và in [SESSION WAIT]."
        ],
        values: [
          { k: "thứ tự chọn episode", v: "applied_frame → ts → revision → rank", kind: "class-default", src: "backend/gate_session_controller.py:649-663" },
          { k: "rank state", v: "parked=1 · departing=2 · released=3", kind: "class-default", src: "backend/gate_session_controller.py:629" },
          { k: "conflict diagnostics", v: "identity_or_slot_owner_conflict", kind: "runtime", src: "backend/gate_session_controller.py:664-668" },
          { k: "cursor diagnostics", v: "older_than_cursor · not_newer_within_frame", kind: "runtime", src: "backend/gate_session_controller.py:684-690" }
        ]
      },
      {
        id: "3.6",
        name: "REST API và idempotency của mọi mutation",
        paras: [
          "API session chạy thread riêng ở cổng 8000: GET danh sách session, session theo id, waiting và reservations; POST ba action claim, select và exit. Log truy cập cố tình không in các route này để tránh spam khi frontend poll.",
          "Mọi mutation đi qua _mutate_session với hai cơ chế chống double-submit. expected_revision lệch so với revision hiện tại thì trả 409 REVISION_CONFLICT kèm bản session mới. Còn action_id được ghi vào actionReceipts — cùng id cùng payload thì trả kết quả cũ, cùng id khác payload thì 409.",
          "Frontend vì thế có thể retry thoải mái khi mạng chập chờn: một POST lặp lại nguyên trạng chứ không tạo hiệu ứng kép. Đây là cùng một triết lý với cursor episode phía backend — mọi điểm ghi đều được thiết kế để chạy lại an toàn."
        ],
        values: [
          { k: "cổng API", v: "8000 (--port)", kind: "runtime", src: "backend/gate_session_controller.py:864" },
          { k: "actionReceipts giữ", v: "32 action gần nhất", kind: "class-default", src: "backend/session_manager.py:333-334" },
          { k: "lỗi typed", v: "SESSION_NOT_FOUND · REVISION_CONFLICT · INVALID_SESSION_STATE · SPOT_*", kind: "runtime", src: "backend/gate_session_controller.py:828-837" }
        ]
      }
    ],

    /* ④ Số liệu & công thức */
    formulas: [
      {
        name: "Hướng crossing hợp lệ",
        expr: "cross = v_xe.x·v_gate.y − v_xe.y·v_gate.x",
        subst: "gate dir=positive → cần cross > 0",
        result: "|cross| < 1e-9 coi như song song, bỏ qua",
        note: "dấu phụ thuộc thứ tự p1→p2 được vẽ trên shared map",
        src: "backend/gate_session_controller.py:242-256"
      },
      {
        name: "Departure kế thừa (non-v2)",
        expr: "movement ≥ 0.25 đơn vị world, 2 quan sát liên tục",
        subst: "2 frame liền × ≥ 0.25 cm",
        result: "→ EXIT_NAVIGATION",
        note: "chỉ dùng khi snapshot không phải schema 2; v2 thay bằng episode",
        src: "backend/gate_session_controller.py:599-621"
      },
      {
        name: "Hạn QR hiển thị",
        expr: "qrExpiresAt = createdAt + QR_DISPLAY_SECONDS",
        subst: "created + 120.0 s",
        result: "mã hết hạn sau 2 phút trên danh sách waiting",
        note: "chỉ lọc listing, không vô hiệu hóa session",
        src: "backend/session_manager.py:302-304"
      }
    ],
    params: [
      { name: "poll_interval", value: "0.25 s", kind: "runtime", role: "chu kỳ đọc snapshot của controller", src: "backend/gate_session_controller.py:865" },
      { name: "api port (session)", value: "8000", kind: "runtime", role: "cổng REST API phiên (khác 8001 của runtime)", src: "backend/gate_session_controller.py:864" },
      { name: "parked_confirm_seconds", value: "2.0 s", kind: "runtime", role: "thời gian xác nhận đỗ trên đường legacy", src: "backend/gate_session_controller.py:866" },
      { name: "QR_DISPLAY_SECONDS", value: "120.0 s", kind: "class-default", role: "thời gian mã QR nằm trong danh sách waiting", src: "backend/session_manager.py:29" },
      { name: "observation gap", value: "1.0 s", kind: "class-default", role: "ngưỡng liên tục cho crossing và recovered path", src: "backend/gate_session_controller.py:491" },
      { name: "departure movement", value: "0.25 world unit", kind: "class-default", role: "dịch chuyển tối thiểu đếm một vote rời ô (legacy)", src: "backend/gate_session_controller.py:612" },
      { name: "camera age_ms", value: "≤ 5000 ms", kind: "class-default", role: "độ tươi bắt buộc của snapshot live", src: "backend/gate_session_controller.py:118" }
    ],

    /* ⑤ Hình thật */
    figures: [
      {
        src: "assets/real/gate-session-cam2-gates.jpg",
        alt: "Frame cam2 với đường cổng vào xanh lá và cổng ra hồng chiếu từ tọa độ world",
        caption: "Hai đoạn gate từ gate_zones.json chiếu ngược lên frame cam2 qua nghịch đảo camera_transforms: xanh lá là entry (p1→p2, dir=positive), hồng là exit (dir=negative). Cam1 nhìn thấy cả hai đoạn nằm ngoài khung hình nên không vẽ được.",
        origin: "shared_map_01/f0/cam2"
      }
    ],
    noFigureReason: null,
    interactive: null,

    /* ⑥ Giới hạn & lỗi thật */
    limits: [
      {
        text: "Hết hạn QR chỉ làm mã biến khỏi danh sách waiting — session vẫn sống và claim vẫn được chấp nhận vì claim_session không kiểm tra expiry. Mã QR 'hết hạn' vì thế không phải một cơ chế bảo mật.",
        evidence: { session: "session_manager", status: "CONFIRMED" }
      },
      {
        text: "Exit crossing chỉ xóa session khi xe còn observed và quan sát liên tục. Xe mất dấu trước cổng ra (bóng, che khuất, track chết sớm) sẽ để lại session mở không bao giờ đóng — không có cơ chế dọn session cũ.",
        evidence: { session: "gate_session_controller", status: "CONFIRMED" }
      },
      {
        text: "Unit gate khác unit runtime gây ValueError bung ra khỏi process_snapshot. Vòng lặp ngoài chỉ bắt lỗi HTTP/session. Một config sai unit vì thế sẽ crash controller thay vì bị bỏ qua (hành vi quan sát từ code).",
        evidence: { session: "gate_session_controller", status: "UNSURE" }
      },
      {
        text: "Khi snapshot lùi về không-v2 (allow_legacy), quyết định đỗ hay rời ô quay về heuristic parked_slot_id cộng chuyển động 0.25 đơn vị. Hai cơ chế song song có ngữ nghĩa khác nhau, và chỉ episode được coi là authoritative."
      }
    ],

    /* ⑦ Nguồn */
    sources: [
      { ref: "backend/gate_session_controller.py:103-125", kind: "class-default", note: "_fresh_live: live mode + camera age ≤5s + published_at −1.0/+5.0s" },
      { ref: "backend/gate_session_controller.py:229-256", kind: "class-default", note: "check_line_intersection + get_crossing_direction + direction sign" },
      { ref: "backend/gate_session_controller.py:259-309", kind: "class-default", note: "recovered entry crossing từ recent_observed_path ≤12 mẫu" },
      { ref: "backend/gate_session_controller.py:401-454", kind: "runtime", note: "guards: v2/fresh/runtime_id, unit check, reset khi runtime đổi, frame rewind" },
      { ref: "backend/gate_session_controller.py:455-534", kind: "runtime", note: "vòng xe: continuity, entry→create_session, exit→delete_session" },
      { ref: "backend/gate_session_controller.py:628-703", kind: "runtime", note: "_apply_parking_episodes: lọc, chọn mới nhất, conflict, cursor idempotent" },
      { ref: "backend/gate_session_controller.py:706-709", kind: "runtime", note: "_runtime_snapshot HTTP timeout 3s" },
      { ref: "backend/gate_session_controller.py:738-837", kind: "runtime", note: "HTTP handler: routes + typed errors + log filter" },
      { ref: "backend/gate_session_controller.py:855-908", kind: "runtime", note: "CLI defaults + main loop poll" },
      { ref: "backend/session_manager.py:23-33", kind: "class-default", note: "SESSIONS_FILE path + QR_DISPLAY_SECONDS + reservation states" },
      { ref: "backend/session_manager.py:200-253", kind: "class-default", note: "waiting list theo qrExpiresAt + reservations" },
      { ref: "backend/session_manager.py:255-352", kind: "class-default", note: "create_session + _mutate_session revision/actionReceipts" },
      { ref: "backend/session_manager.py:355-470", kind: "class-default", note: "claim/select_spot/set_parked/departure/exit transitions" },
      { ref: "backend/main_detect/config/gate_zones.json:1-31", kind: "config", note: "gate config thật đang dùng: world/cm, entry +, exit −" }
    ],
    pseudocode: "LOOP moi 0.25s:\n  snap <- GET /api/runtime/snapshot (timeout 3s)\n  GUARD: schema==2, live, runtime_id, unit khop, frame khong lui\n  IF runtime_id doi -> xoa sach state; same_frame -> chi apply episodes\n  apply retired_global_ids + global_id_merged -> remap hoac conflict\n\n  FOR ep IN parking_episodes (v2):\n    chon moi nhat per gid; bo conflict/cu -> diagnostics\n    parked -> set_parked; departing|released -> apply_departure\n\n  FOR xe IN vehicles (gid hop le, co position):\n    IF qua entry_gate (continuous HOAC recovered_path): create_session\n    IF qua exit_gate: delete_session + xoa state xe\n\nAPI :8000 — claim/select/exit qua _mutate_session\n  expected_revision sai -> 409 REVISION_CONFLICT\n  action_id cu + payload cu -> tra ket qua cu (idempotent)"
  });
})();
