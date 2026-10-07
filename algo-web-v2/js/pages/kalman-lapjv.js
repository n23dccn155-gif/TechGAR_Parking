/* kalman-lapjv.js — Trang 7: gán detection vào track bằng Kalman + LAPJV.
 * Nguồn số liệu đã xác minh: .analysis/algo-web-v2-redesign/notes/kalman-lapjv.md
 */
(function () {
  "use strict";
  TG.definePage({
    id: "kalman-lapjv",
    group: "single-cam",
    title: "Kalman + LAPJV assignment",
    navLabel: "Assignment",
    order: 7,
    prev: "contour-filtering",
    next: "track-lifecycle",

    /* ① Chức năng & vị trí */
    fn: {
      text: "Mỗi frame, các [[track]] hiện có được [[Kalman filter]] đẩy tới vị trí dự đoán. Một ma trận chi phí track×detection được xây qua nhiều cổng rồi LAPJV chọn ghép đôi một-một tối ưu toàn cục. Detection không được gán mới có quyền mọc thành track."
    },

    /* ② Vì sao cần */
    why: {
      paras: [
        "Xe bị che vài frame hoặc detector mất một nhịp thì [[track]] phải sống tiếp. [[Kalman filter]] ngoại suy theo vận tốc thay vì để danh tính chết ngay khi không có đo.",
        "Nhưng ngoại suy cũ là con dao hai lưỡi: điểm dự đoán trôi có thể claim blob của xe hàng xóm. Vì vậy cửa sổ nhận detection không phải hằng số toàn cảnh — nó là ngân sách đi được của chính chiếc xe đó.",
        "LAPJV tối ưu toàn cục nhưng mù trước kịch bản hai lineage khả thi ngang nhau. Những chỗ đó code xử lý bằng margin và đóng băng merged detection thay vì nhận lựa chọn tuỳ ý của solver."
      ]
    },

    /* ③ Cách hoạt động */
    how: [
      {
        id: "3.1",
        name: "Kalman constant-velocity",
        paras: [
          "Mỗi [[track]] giữ một bộ lọc bốn trạng thái — x, y và hai vận tốc — đo hai tọa độ. Nhiễu quá trình trên vận tốc gấp sáu lần trên vị trí: xe được phép đổi tốc nhanh hơn là nhảy chỗ.",
          "Không có đo thì predict tịnh tiến theo vận tốc đã lọc. Nhưng ngoại suy có hạn: quá 0.40 giây không đo, code ngừng phóng theo velocity cũ và ghim dự đoán về điểm đo cuối cùng.",
          "Đó là trạng thái stale anchor. Xe đứng yên được chờ lại đúng chỗ nó mất dấu. Cửa sổ riêng tính từ kích thước sạch của xe. Kích thước sạch là số đo ở các quan sát sạch — những lần đo thật không bị đóng băng merged hay occlusion."
        ],
        values: [
          { k: "cấu hình Kalman", v: "KF(4,2): [x,y,vx,vy], đo [x,y]", kind: "runtime", src: "backend/main_detect/src/techgar/motion_tracker.py:440-448" },
          { k: "noise", v: "process diag[2,2,12,12], measure 8·I, cov 100·I", kind: "class-default", src: "backend/main_detect/src/techgar/motion_tracker.py:444-446" },
          { k: "hạn ngoại suy", v: "max_prediction_age 0.40 s → ghim last measured", kind: "class-default", src: "backend/main_detect/src/techgar/motion_tracker.py:77" },
          { k: "velocity fallback", v: "Kalman statePost, thiếu thì trail trung bình 4 bước", kind: "runtime", src: "backend/main_detect/src/techgar/motion_tracker.py:1232-1244" }
        ]
      },
      {
        id: "3.2",
        name: "Cổng cặp đôi: ai được phép claim ai",
        paras: [
          "Track mất quá reacquire window — 1.5 giây thường, 3.0 giây sau merged interval — bị loại khỏi vòng gán và ghi event association_rejected_stale_track.",
          "Cửa sổ khoảng cách không phải hằng số: ngân sách bằng vận tốc nhân số frame mất nhân hệ số hai, cộng một lần extent. Extent là cạnh dài nhất của khung xe đó. Track chưa đủ ba quan sát thì fail-open về trần toàn cảnh.",
          "Appearance trộn [[HSV histogram]] và tracklet, lấy đầu tốt hơn; track đang mất thì ngưỡng siết còn 0.30, stale anchor siết hơn nữa 0.22. Tỉ lệ diện tích đo trên dự đoán phải nằm trong 0.35 đến 2.80."
        ],
        values: [
          { k: "reacquire window", v: "1.5 s (3.0 s sau merged freeze)", kind: "class-default", src: "backend/main_detect/src/techgar/motion_tracker.py:68-69" },
          { k: "gate budget", v: "speed·(invis+1)·2.0 + 1.0·extent, floor max(24, extent)", kind: "class-default", src: "backend/main_detect/src/techgar/motion_tracker.py:1220-1230" },
          { k: "trần toàn cảnh", v: "180 · min(1.25, 1 + min(invis,15)/60)", kind: "runtime", src: "backend/main_detect/src/techgar/motion_tracker.py:1691-1694" },
          { k: "appearance", v: "≤0.30 khi invisible (≤0.22 stale anchor)", kind: "class-default", src: "backend/main_detect/src/techgar/motion_tracker.py:1732-1737" },
          { k: "area ratio", v: "∈ [0.35, 2.80] so với clean size", kind: "class-default", src: "backend/main_detect/src/techgar/motion_tracker.py:1749-1755" }
        ]
      },
      {
        id: "3.3",
        name: "Ma trận cost và LAPJV",
        paras: [
          "Mỗi cặp qua cổng nhận một chi phí trong [0,1]. Nó gồm 45 phần trăm vị trí chuẩn hoá, 25 phần trăm một trừ IoU, 20 phần trăm appearance, và 10 phần trăm sai số kích thước log.",
          "Ô không khả thi mang giá 10.0 — vượt mọi cost_limit hợp lệ nên solver không bao giờ chọn. lapjv chạy với cost_limit 0.90: ghép đôi đắt hơn mức đó bị từ chối thay vì gán bừa.",
          "Trước khi solve, code chạy _mark_competing_assignments vì optimizer một-một không tự phân biệt được hai lineage khả thi ngang nhau — cặp tranh chấp được đánh dấu riêng."
        ],
        values: [
          { k: "trọng số cost", v: "0.45 pos + 0.25 IoU + 0.20 app + 0.10 size", kind: "runtime", src: "backend/main_detect/src/techgar/motion_tracker.py:1761-1766" },
          { k: "solver", v: "lapjv(costs, extend_cost=True, cost_limit=0.90)", kind: "runtime", src: "backend/main_detect/src/techgar/motion_tracker.py:1908" },
          { k: "invalid cell", v: "10.0 — lớn hơn mọi cost hợp lệ", kind: "runtime", src: "backend/main_detect/src/techgar/motion_tracker.py:1615" },
          { k: "size error", v: "|ln(area_ratio)| / |ln 2.80|, kẹp [0,1]", kind: "runtime", src: "backend/main_detect/src/techgar/motion_tracker.py:1756-1760" }
        ]
      },
      {
        id: "3.4",
        name: "Merged detection đóng băng + margin sau gán",
        paras: [
          "Một contour ôm cả track dự đoán lẫn xe hàng xóm thì không được làm đo: cả cột cost về 10.0, hai [[track]] coast qua merged interval. Đo elongation theo hướng chạy để bỏ qua trường hợp chính motion trail của một xe.",
          "Sau LAPJV, track vừa invisible hoặc vừa qua merged phải thắng margin. Chi phí được chọn phải tốt hơn mọi phương án cạnh tranh ít nhất 0.08 × (2 − lineage_score).",
          "Thiếu margin là lúc ID swap xảy ra — code chọn giữ cả hai lineage coasting và đánh dấu split_recovering, thay vì nhận một tie tuỳ ý. Sau competition còn cần chuỗi ba frame sạch trước khi nối lại lineage, trừ khi bằng chứng rõ ràng đủ mạnh để đóng ngay trong một frame."
        ],
        values: [
          { k: "điều kiện merged", v: "bbox ≥ 1.60·median ref area + track dự đoán nằm trong box±12", kind: "class-default", src: "backend/main_detect/src/techgar/motion_tracker.py:1830-1854" },
          { k: "miễn motion-trail", v: "_elongation_explained_by_motion → kept_as_motion_trail", kind: "runtime", src: "backend/main_detect/src/techgar/motion_tracker.py:1879-1889" },
          { k: "margin", v: "0.08 × (2 − lineage_score) so với mọi alternative", kind: "class-default", src: "backend/main_detect/src/techgar/motion_tracker.py:1921-1927" },
          { k: "defer events", v: "split_assignment_deferred / association_recovery_pending", kind: "runtime", src: "backend/main_detect/src/techgar/motion_tracker.py:1955-1985" },
          { k: "clear run", v: "ambiguous_recovery_frames = 3", kind: "class-default", src: "backend/main_detect/src/techgar/motion_tracker.py:81" },
          { k: "clear_evidence fast-path", v: "margin + cost≤0.12, app≤0.08, size≤0.20, pos≤0.20 → đóng ngay", kind: "runtime", src: "backend/main_detect/src/techgar/motion_tracker.py:1939-1945" }
        ]
      }
    ],

    /* ④ Số liệu & công thức */
    formulas: [
      {
        name: "Chi phí ghép đôi",
        expr: "cost = 0.45·(d/d_max) + 0.25·(1 − IoU) + 0.20·d_app + 0.10·size_err",
        subst: "d=30px/180, IoU=0.5, app=0.15, size_err=0.2",
        result: "0.075 + 0.125 + 0.03 + 0.02 = 0.25 → nhận (limit 0.90)",
        note: "bốn thành phần đều nằm [0,1]; _pair_metrics ghi lại từng phần để audit",
        src: "backend/main_detect/src/techgar/motion_tracker.py:1761-1781"
      },
      {
        name: "Ngân sách cửa sổ gán",
        expr: "gate = min(ceiling, max(floor, speed·(invis+1)·2.0 + extent))",
        subst: "speed 8 px/f, invis 2, extent 100 → 8·3·2 + 100 = 148",
        result: "gate = min(180·1.04, 148) ≈ 148 px",
        note: "xe càng nhanh hoặc mất càng lâu, cửa sổ càng rộng — track uninformed lấy trần",
        src: "backend/main_detect/src/techgar/motion_tracker.py:1214-1230"
      }
    ],
    params: [
      { name: "processNoise / measurementNoise", value: "diag[2,2,12,12] / 8·I", kind: "class-default", role: "độ tin cậy mô hình vận tốc so với đo lường pixel", src: "backend/main_detect/src/techgar/motion_tracker.py:444-445" },
      { name: "max_prediction_age_seconds", value: "0.40", kind: "class-default", role: "quá hạn này velocity cũ không được ngoại suy tiếp", src: "backend/main_detect/src/techgar/motion_tracker.py:77" },
      { name: "reacquire_max_seconds / merged", value: "1.5 / 3.0 s", kind: "class-default", role: "cửa sổ nhận lại track mất; merged interval được kéo dài", src: "backend/main_detect/src/techgar/motion_tracker.py:68-69" },
      { name: "velocity_gate_scale / size_ratio", value: "2.0 / 1.0", kind: "class-default", role: "hệ số nới ngân sách đi được của track", src: "backend/main_detect/src/techgar/motion_tracker.py:74-75" },
      { name: "assignment_cost_limit", value: "0.90", kind: "class-default", role: "cost_limit cho lapjv; ô 10.0 luôn bất khả thi", src: "backend/main_detect/src/techgar/motion_tracker.py:72" },
      { name: "split_assignment_margin", value: "0.08", kind: "class-default", role: "margin tối thiểu sau merged/lost để không nhận tie", src: "backend/main_detect/src/techgar/motion_tracker.py:82" },
      { name: "lost_appearance_threshold", value: "0.30", kind: "class-default", role: "ngưỡng histogram/tracklet khi track invisible", src: "backend/main_detect/src/techgar/motion_tracker.py:83" },
      { name: "reacquire area ratio", value: "[0.35, 2.80]", kind: "class-default", role: "bbox đo so với clean size của track", src: "backend/main_detect/src/techgar/motion_tracker.py:84-85" },
      { name: "ambiguous_recovery_frames", value: "3", kind: "class-default", role: "chuỗi frame sạch cần trước khi nối lại lineage", src: "backend/main_detect/src/techgar/motion_tracker.py:81" }
    ],

    /* ⑤ Hình thật */
    figures: [
      {
        src: "assets/real/kalman-coast.jpg",
        alt: "Frame cam1 thai1 với ba box dự đoán Kalman quanh xe đen và mũi tên vận tốc",
        caption: "thai1 cam1 f1407 (frame gốc + chú thích): ba track frozen_ambiguous coast theo Kalman. lid18 phóng theo vận tốc khoảng 14 px mỗi frame (mũi tên); boxes lấy từ predictions.jsonl.",
        origin: "session_hiep_thai1/f1407/cam1"
      }
    ],
    noFigureReason: null,
    interactive: "assignment",

    /* ⑥ Giới hạn & lỗi thật */
    limits: [
      {
        text: "Mô hình constant-velocity không biết xe quay đầu hay phanh. Ngoại suy chỉ tin được trong 0.40 giây; quá đó code tự ghim về điểm đo cuối thay vì để dự đoán trôi vô hạn."
      },
      {
        text: "Stale anchor cứu xe đứng yên nhưng cũng là chỗ false-merge dễ xảy ra: một fragment mọc lại gần chỗ xe cũ mất dấu có thể bị nhận nhầm. Đây chính là bug stationary re-acquire đã phân tích riêng (F0/F1).",
        evidence: { session: "sang8", status: "CONFIRMED" }
      },
      {
        text: "Margin và merged-freeze hy sinh một vài frame track để đổi lấy không swap ID. Khi hai xe tách dần, lineage có thể đợi tới ba frame sạch mới nối lại — người xem thấy track khựng là cố ý."
      },
      {
        text: "Nghi ngờ coasting/frozen kéo dài khoảng 140 frame quanh vật nửa-ngoài-ROI đã được ghi nhận (E-B-003/E-B-006) nhưng chưa kết luận — mốc này vượt mọi reacquire window bình thường. Mã E-* là finding của chiến dịch verify-replay; danh mục đầy đủ ở trang failure-gallery.",
        evidence: { session: "nhiều session", status: "UNSURE" }
      }
    ],

    /* ⑦ Nguồn */
    sources: [
      { ref: "backend/main_detect/src/techgar/motion_tracker.py:440-448", kind: "runtime", note: "_new_kalman: KF(4,2) constant-velocity, noise matrices" },
      { ref: "backend/main_detect/src/techgar/motion_tracker.py:1193-1244", kind: "runtime", note: "_association_gate + velocity từ Kalman/trail" },
      { ref: "backend/main_detect/src/techgar/motion_tracker.py:1246-1290", kind: "runtime", note: "_elongation_explained_by_motion: motion trail vs hai xe" },
      { ref: "backend/main_detect/src/techgar/motion_tracker.py:1615-1781", kind: "runtime", note: "chuỗi gate pair + cost 4 thành phần + _pair_metrics" },
      { ref: "backend/main_detect/src/techgar/motion_tracker.py:1783-1906", kind: "runtime", note: "merged-detection freeze + motion-trail exemption" },
      { ref: "backend/main_detect/src/techgar/motion_tracker.py:1908", kind: "runtime", note: "lapjv(extend_cost=True, cost_limit=0.90)" },
      { ref: "backend/main_detect/src/techgar/motion_tracker.py:1914-1985", kind: "runtime", note: "margin lineage + split_deferred + recovery_pending" },
      { ref: "backend/main_detect/src/techgar/motion_tracker.py:1166-1191", kind: "runtime", note: "_assignment_has_margin: so với cả hàng lẫn cột" },
      { ref: "backend/main_detect/src/techgar/motion_tracker.py:1654-1701", kind: "runtime", note: "stale anchor: ghim last measured + gate riêng 0.30·hypot" }
    ],
    pseudocode: "predict: moi track -> kalman.predict()\n  qua 0.40s khong do -> ghim last_measured (stale anchor)\n\ncosts = 10.0\nMOI (track, detection):\n  lost_seconds > 1.5s (3.0 merged) -> bo\n  d > gate(v*(invis+1)*2 + extent) -> bo\n  app > 0.30 khi invisible -> bo\n  area_ratio ngoai [0.35,2.80] -> bo\n  cost = .45pos + .25(1-IoU) + .20app + .10size\n\nmerged: contour om >=1 track + bbox>=1.6x -> cot=10, coast\nlapjv(costs, cost_limit=0.90)\npost: track vua mat/merged can margin 0.08*(2-lineage)\n  thieu -> split_assignment_deferred, ca hai coast"
  });
})();
