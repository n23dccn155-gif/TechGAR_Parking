/* frontend-dataflow.js — Trang 18: Luồng dữ liệu frontend.
 * Nguồn số liệu đã xác minh: .analysis/algo-web-v2-redesign/notes/frontend-dataflow.md
 * Mô tả code frontend ở chế độ đọc — trang này không sao chép logic.
 */
(function () {
  "use strict";
  TG.definePage({
    id: "frontend-dataflow",
    group: "gate-frontend",
    title: "Luồng dữ liệu frontend — poll, guard, commit",
    navLabel: "Frontend dataflow",
    order: 18,
    prev: "gate-session",
    next: "routing-astar",

    /* ① Chức năng & vị trí */
    fn: {
      text: "Frontend là consumer cuối của pipeline. Nó poll [[Runtime snapshot]] cứ 200 mili giây và poll session cứ 500 mili giây. Hai luồng đó đổ vào hai store riêng: bản đồ ô đỗ và trạng thái phiên của tài xế."
    },

    /* ② Vì sao cần */
    why: {
      paras: [
        "Backend đã có guard độ tươi riêng, nhưng frontend không được phép tin thông điệp 'mọi thứ ổn' từ server. Một màn hình dẫn đường vẽ trên dữ liệu cũ năm giây có thể chỉ xe vào ô vừa có người đỗ. Frontend vì thế tự tái kiểm chứng toàn bộ hợp đồng live trước khi tô một ô nào.",
        "Hai luồng dữ liệu cũng có nhịp và nguồn khác nhau. Snapshot bản đồ đến từ cổng 8001 còn session đến từ cổng 8000. Ghép chúng sai thứ tự, ví dụ cho GET cũ ghi đè POST mới, sẽ làm UI nhảy trạng thái loạn xạ. Lớp commit phía client vì thế được xây như một state machine nhỏ."
      ]
    },

    /* ③ Cách hoạt động */
    how: [
      {
        id: "3.1",
        name: "Hai nguồn dữ liệu, một store bản đồ",
        paras: [
          "parkingStore giữ cờ trackingSource là 'sample' hoặc 'opencv'. Mở trang với sessionId sẽ ép sang 'opencv'; việc chuyển nguồn reset toàn bộ ô về unknown và confidence 0 để dữ liệu cũ không lẫn vào chế độ mới.",
          "Ở sample mode, store nhận từng event qua applyEvent: event phải đúng camera sở hữu ô, đúng owner hiện tại và revision lớn hơn revision đã lưu. Vi phạm được đếm vào rejectedEvents hoặc staleEvents thay vì ghi đè.",
          "Ở live mode, App poll GET /api/runtime/snapshot mỗi 200 mili giây. runtimeApi giữ một promise in-flight duy nhất cho cả hai consumer là bản đồ và gate overlay. Một response chậm vì thế không bao giờ được áp dụng hai lần hay sai thứ tự."
        ],
        values: [
          { k: "chu kỳ poll snapshot", v: "200 ms (setInterval)", kind: "runtime", src: "frontend/src/app/App.tsx:354-360" },
          { k: "timeout fetch", v: "2 s (AbortSignal.timeout)", kind: "runtime", src: "frontend/src/api/runtimeApi.ts:13" },
          { k: "backoff sau lỗi", v: "2000 ms reject-ngay", kind: "runtime", src: "frontend/src/api/runtimeApi.ts:4-29" },
          { k: "đổi nguồn →", v: "mọi ô về unknown + confidence 0", kind: "runtime", src: "frontend/src/stores/parkingStore.ts:56-70" }
        ]
      },
      {
        id: "3.2",
        name: "liveRuntimeError — frontend tự kiểm chứng hợp đồng",
        paras: [
          "Trước khi tô màu bất kỳ ô nào, snapshot phải qua liveRuntimeError. Điều kiện y hệt guard phía backend. [[schema version]] bằng 2, source_mode là 'live'. published_at không được lệch đồng hồ client quá một giây về tương lai hay năm giây về quá khứ. Mọi camera phải online với age_ms từ 0 đến 5000.",
          "Ngoài ra client còn giữ một cursor riêng gồm runtime_id và frame_index. Snapshot có frame_index lùi hơn frame đã hiển thị bị ném lỗi 'Runtime trả về frame cũ hơn'. Frame không tiến quá năm giây cũng là lỗi 'Camera không có frame mới'.",
          "Khi guard thất bại, UI không giữ màu cũ: mọi ô được render lại ở trạng thái unknown với camera offline. Đây là lựa chọn có chủ đích — thừa nhận 'không biết' an toàn hơn là hiển thị ô trống từ một frame đã chết."
        ],
        values: [
          { k: "published_at chấp nhận", v: "−1000 ms → +5000 ms", kind: "runtime", src: "frontend/src/domain/runtime.ts:126-129" },
          { k: "camera age_ms", v: "0 – 5000 ms, bắt buộc online", kind: "runtime", src: "frontend/src/domain/runtime.ts:130-139" },
          { k: "frame lùi", v: "throw 'frame cũ hơn frame đã hiển thị'", kind: "runtime", src: "frontend/src/app/App.tsx:277-279" },
          { k: "không tiến >5 s", v: "runtimeState = 'error' + ô unknown", kind: "runtime", src: "frontend/src/app/App.tsx:283-285,313-346" }
        ]
      },
      {
        id: "3.3",
        name: "runtimeAdapter — nới lỏng schema về domain UI",
        paras: [
          "Adapter đổi tên miền runtime sang tên miền UI: cam1 thành 'cam-left', cam2 thành 'cam-right'. Ô có trong geometry mà không có trong snapshot thì nhận status 'unknown' và confidence 0 thay vì biến mất khỏi bản đồ.",
          "revision của mỗi ô được gán bằng frame_index của snapshot. Đây là con số đơn điệu mà cơ chế reject-stale của store bám vào. Event cũ hơn frame hiện tại bị bỏ ngay cả khi nội dung trông hợp lệ.",
          "Xe đi qua alias cũng được chuẩn hóa: canonicalRuntimeId theo dây chuyền retired_global_ids với visited-set chống vòng lặp. Comment trong code nói thẳng: 'proximity is never identity' — hai gid gần nhau không bao giờ được coi là một."
        ],
        values: [
          { k: "join ô", v: "slot_layout/parking_slots theo slot_id", kind: "runtime", src: "frontend/src/adapters/runtimeAdapter.ts:27-49" },
          { k: "ô thiếu trong snapshot", v: "status unknown, confidence 0", kind: "runtime", src: "frontend/src/adapters/runtimeAdapter.ts:32-40" },
          { k: "alias chain", v: "canonicalRuntimeId + visited-set", kind: "runtime", src: "frontend/src/domain/runtime.ts:191-202" }
        ]
      },
      {
        id: "3.4",
        name: "worldToSvg — hiệu chuẩn mềm tại chỗ",
        paras: [
          "Bản đồ SVG của frontend không biết gì về centimet. Để vẽ cổng và vị trí xe, nó tự fit một phép affine riêng. Tâm từng polygon trong slot_layout (tọa độ world) được ghép với tâm ô tương ứng trong PARKING_GEOMETRY (tọa độ SVG).",
          "Phép fit là least squares giải bằng khử Gauss trên hệ ba tham số mỗi trục, cần tối thiểu ba cặp neo và được cache theo nội dung layout. Không fit được thì fallback chỉ là clamp điểm vào khung — một suy giảm an toàn nhưng tuyệt đối không nên xảy ra khi calibration có mặt.",
          "Cổng entry/exit được nạp lại mỗi giây qua fetchGateRoi: GET /api/runtime/gates rồi chiếu p1, p2 bằng chính phép affine đó và updateGateNodesInGraph. Code chặn rõ một bẫy: gate geometry không bao giờ được chiếu từ frame cũ hoặc replay, kể cả khi request chính đang lỗi."
        ],
        values: [
          { k: "số neo tối thiểu", v: "3 cặp world↔SVG", kind: "runtime", src: "frontend/src/calibration/worldToSvg.ts:63" },
          { k: "cache", v: "theo JSON.stringify(layout)", kind: "runtime", src: "frontend/src/calibration/worldToSvg.ts:42-51" },
          { k: "chu kỳ nạp gate", v: "1000 ms", kind: "runtime", src: "frontend/src/app/App.tsx:404" },
          { k: "fallback không-fit", v: "clamp vào khung SVG", kind: "runtime", src: "frontend/src/calibration/worldToSvg.ts:86-89" }
        ]
      },
      {
        id: "3.5",
        name: "useVehicleSession — state machine commit phía client",
        paras: [
          "Hook poll GET /api/session/<id> mỗi 500 mili giây với timeout hai giây. Mọi response đều phải qua hàm commit: sai session id, lifecycle cũ, session đã xóa, runtimeId đổi hoặc revision lùi đều bị loại trước khi chạm vào state.",
          "Hai guard đáng chú ý nhất nằm ở chỗ thứ tự response. Một GET bắt đầu trước nhưng về sau POST bị gắn cờ stale_revision — response cũ hơn không bao giờ thắng action đang bay. Revision bằng nhau mà nội dung khác bị coi là 'conflicting revision' và cũng bị loại.",
          "Mỗi POST mang expected_revision của bản session hiện có và một action_id mới sinh bằng crypto.randomUUID, với fallback getRandomValues cho trường hợp mở qua HTTP LAN không phải secure context. Bộ đôi này khớp đúng cơ chế [[idempotency]] của backend ở trang trước.",
          "Lỗi transport sau một POST không bị đoán: UI xóa khóa action và reconcile bằng một GET thay vì tự dựng trạng thái optimistic. Session không còn thì đánh dấu deleted qua tombstone deletedRef và poll dừng tự nhiên."
        ],
        values: [
          { k: "chu kỳ poll session", v: "500 ms, timeout 2 s", kind: "runtime", src: "frontend/src/hooks/useVehicleSession.ts:27,111-114" },
          { k: "action_id", v: "crypto.randomUUID + fallback getRandomValues", kind: "runtime", src: "frontend/src/hooks/useVehicleSession.ts:31-35" },
          { k: "reservations poll", v: "500 ms, lỗi thì giữ overlay cũ", kind: "runtime", src: "frontend/src/app/App.tsx:176-191" },
          { k: "auto-claim", v: "một lần khi vào trang cá nhân", kind: "runtime", src: "frontend/src/app/App.tsx:219-236" }
        ]
      },
      {
        id: "3.6",
        name: "resolveSessionParking — một decision tree",
        paras: [
          "Trạng thái UI của chuyến đỗ được suy ra bằng một hàm thuần nhận session, vehicles, slots và [[parking episode]]s. Thứ tự quyết định: EXIT_NAVIGATION trước, rồi PARKED, rồi ô mà gid của mình đang đỗ.",
          "Điểm khác biệt lớn so với controller: một gid đỗ ở hai ô là identity_invariant_error, không phải nhiễu cần lọc. Khi ô đích có xe khác, decision chỉ chuyển 'target_occupied_by_other' khi xe kia đã được xác nhận bằng episode hoặc dwell — còn chỉ mới thấy bbox thì vẫn 'identity_pending'.",
          "Kết quả của hàm này điều khiển sheet dẫn đường. guiding khi ô trống, parking_confirmation_pending khi đỗ chưa chốt. parking_processing_delayed khi pipeline xác nhận chậm quá năm giây hoặc suy giảm."
        ],
        values: [
          { k: "decision kinds", v: "10 nhánh typed union", kind: "runtime", src: "frontend/src/domain/sessionParking.ts:5-15" },
          { k: "invariant", v: "gid ở >1 ô → identity_invariant_error", kind: "runtime", src: "frontend/src/domain/sessionParking.ts:48-54" },
          { k: "pending chậm", v: "age_ms > 5000 hoặc degraded", kind: "runtime", src: "frontend/src/domain/sessionParking.ts:63-74" }
        ]
      }
    ],

    /* ④ Số liệu & công thức */
    formulas: [
      {
        name: "Affine world→SVG",
        expr: "svg.x = a·wx + b·wy + c ; svg.y = d·wx + e·wy + f",
        subst: "least squares trên ≥3 cặp tâm ô world↔tâm ô SVG",
        result: "6 hệ số, cache theo layout",
        note: "fit lại khi slot_layout thay đổi; là phép affine chứ không phải homography đầy đủ",
        src: "frontend/src/calibration/worldToSvg.ts:53-95"
      },
      {
        name: "Cửa sổ tươi của snapshot",
        expr: "−1000 ≤ now − published_at ≤ 5000 (ms)",
        subst: "và age_ms mỗi camera ∈ [0, 5000]",
        result: "vi phạm → toàn bộ ô render unknown",
        note: "song song với _fresh_live của gate_session_controller",
        src: "frontend/src/domain/runtime.ts:126-139"
      }
    ],
    params: [
      { name: "snapshot poll", value: "200 ms", kind: "runtime", role: "nhịp đọc runtime của bản đồ", src: "frontend/src/app/App.tsx:354" },
      { name: "session poll", value: "500 ms", kind: "runtime", role: "nhịp đồng bộ session cá nhân", src: "frontend/src/hooks/useVehicleSession.ts:27" },
      { name: "reservations poll", value: "500 ms", kind: "runtime", role: "nhịp làm mới overlay ô có chủ", src: "frontend/src/app/App.tsx:191" },
      { name: "gate refresh", value: "1000 ms", kind: "runtime", role: "nhịp nạp lại gate config cho lane graph", src: "frontend/src/app/App.tsx:404" },
      { name: "fetch timeout", value: "2000 ms", kind: "runtime", role: "AbortSignal.timeout cho runtime + session fetch", src: "frontend/src/api/runtimeApi.ts:13" },
      { name: "runtime backoff", value: "2000 ms", kind: "runtime", role: "thời gian reject-ngay sau một lỗi runtime", src: "frontend/src/api/runtimeApi.ts:4" },
      { name: "stale frame", value: "5000 ms", kind: "runtime", role: "ngưỡng báo camera chết khi frame không tiến", src: "frontend/src/app/App.tsx:283" }
    ],

    /* ⑤ Hình thật */
    figures: [
      {
        src: "assets/real/frontend-dataflow-map.jpg",
        alt: "Screenshot frontend thật ở navigation mode với route A* tới ô C10",
        caption: "Giao diện driver thật (artifact 1440x900-c10-navigation). Bảng trạng thái đếm từ snapshot. Marker LỐI VÀO và LỐI RA là gate chiếu affine world sang SVG. Pin C10 là targetSpotId và đường xanh là route trên lane graph.",
        origin: "frontend_artifacts/f0/cam0"
      }
    ],
    noFigureReason: null,
    interactive: null,

    /* ⑥ Giới hạn & lỗi thật */
    limits: [
      {
        text: "Tầng guard phía client chỉ chặn dữ liệu cũ, không chặn dữ liệu sai. Nếu backend publish một ô occupied nhầm thì frontend tô đỏ trung thực — không có cơ chế cross-check hình ảnh ở tầng này.",
        evidence: { session: "frontend", status: "CONFIRMED" }
      },
      {
        text: "Affine fit giả định bản đồ world và SVG liên hệ tuyến tính, nên không mô tả được cong phối cảnh. Calibration world đã chuẩn hóa mặt phẳng đất nên giả định này hợp lý. Nhưng một gate nằm xa cụm ô neo sẽ nội suy kém chính xác (suy luận).",
        evidence: { session: "worldToSvg", status: "UNSURE" }
      },
      {
        text: "Poll năm giây một lần là giới hạn mềm: một lỗi mạng tức thời vẫn bị nuốt trong khi UI tiếp tục hiển thị frame cũ. Người dùng chỉ thấy trạng thái error khi cursor không tiến quá năm giây.",
        evidence: { session: "frontend", status: "CONFIRMED" }
      },
      {
        text: "Vehicles filter theo canonical id nên xe của session khác không render trên trang cá nhân. Đây là thiết kế, nhưng có nghĩa tài xế không nhìn thấy xe lạ đi vào ô mình đang nhắm tới ngoài màu trạng thái ô."
      }
    ],

    /* ⑦ Nguồn */
    sources: [
      { ref: "frontend/src/api/runtimeApi.ts:3-36", kind: "runtime", note: "RUNTIME_BASE, dedupe promise, backoff 2s" },
      { ref: "frontend/src/api/backendApi.ts:30-80", kind: "runtime", note: "get/post helpers + typed SessionNotFound + routes" },
      { ref: "frontend/src/domain/runtime.ts:116-141", kind: "runtime", note: "liveRuntimeError: v2, live, ±1/5s, cam age" },
      { ref: "frontend/src/domain/runtime.ts:190-202", kind: "runtime", note: "canonicalRuntimeId: alias chain, visited-set" },
      { ref: "frontend/src/domain/sessionParking.ts:27-112", kind: "runtime", note: "resolveSessionParking: 10-kind decision tree" },
      { ref: "frontend/src/adapters/runtimeAdapter.ts:6-49", kind: "runtime", note: "cam→domain id + join slot + unknown fallback" },
      { ref: "frontend/src/stores/parkingStore.ts:54-129", kind: "runtime", note: "applySnapshot/applyEvent + ownership + stale guard" },
      { ref: "frontend/src/hooks/useVehicleSession.ts:27-35,52-93", kind: "runtime", note: "poll 500ms + action id + commit guards" },
      { ref: "frontend/src/hooks/useVehicleSession.ts:144-190", kind: "runtime", note: "runAction: expected_revision + reconcile sau lỗi" },
      { ref: "frontend/src/app/App.tsx:155-197", kind: "runtime", note: "episode refresh + reservations + opencv source" },
      { ref: "frontend/src/app/App.tsx:238-411", kind: "runtime", note: "poll 200ms, cursor frame, fallback unknown, gates 1s" },
      { ref: "frontend/src/calibration/worldToSvg.ts:42-113", kind: "runtime", note: "affine fit/cache/fallback + svg→world nghịch đảo" }
    ],
    pseudocode: "MOI 200ms:\n  snap <- GET /api/runtime/snapshot (dedupe 1 request, timeout 2s)\n  IF liveRuntimeError(snap) OR frame lui -> toan bo spot -> unknown\n  ELSE applySnapshot(spots=join(slot_layout), cameras, published_at)\n\nMOI 500ms:\n  session <- GET /api/session/<id> ; reservations <- GET .../reservations\n  commit(next): reject neu GET-trong-POST, revision lui, runtimeId doi,\n    revision bang ma khac noi dung (conflict)\n\nMOI 1000ms: gates <- GET /api/runtime/gates\n  project = affine_fit(slot_layout polygons <-> geometry centers)\n  updateGateNodesInGraph(LANE_GRAPH, project(p1), project(p2))\n\nACTION: POST + expected_revision + action_id\n  loi transport -> khong doan -> reconcile bang GET"
  });
})();
