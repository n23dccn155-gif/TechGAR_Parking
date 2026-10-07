/* contour-filtering.js — Trang 6: từ contour foreground đến detection.
 * Nguồn số liệu đã xác minh: .analysis/algo-web-v2-redesign/notes/contour-filtering.md
 */
(function () {
  "use strict";
  TG.definePage({
    id: "contour-filtering",
    group: "single-cam",
    title: "Contour filtering",
    navLabel: "Contours",
    order: 6,
    prev: "motion-detection",
    next: "kalman-lapjv",

    /* ① Chức năng & vị trí */
    fn: {
      text: "Một contour trong [[foreground mask]] chưa phải là xe. Trước khi thành detection nó đi qua một chuỗi cổng có thứ tự: hình dạng, diện tích, bằng chứng motion, rồi dedup bóng đuôi. Trang này kể các cổng đó; cổng [[ROI]], [[cast shadow]] và occlusion có trang riêng."
    },

    /* ② Vì sao cần */
    why: {
      paras: [
        "Frame difference nhớ cả silhouette cũ lẫn mới của một xe nhanh — một xe có thể tạo hai blob. Morphology có thể gộp nửa làn thành blob khổng lồ, và tay người hay túi đồ cũng là foreground hợp lệ.",
        "Thứ tự cổng là tối ưu chi phí: gate rẻ chạy trước, gate đắt như đo polygon chỉ chạy trên ứng viên đã sạch. Nhiều reject ghi telemetry kèm lý do nên sai sót lần ra được tới đúng cổng."
      ]
    },

    /* ③ Cách hoạt động */
    how: [
      {
        id: "3.1",
        name: "Chuỗi cổng tuần tự",
        paras: [
          "Mỗi contour đi qua khoảng mười nhánh continue. Hai cụm cổng thuộc trang khác: strict [[ROI]] support và anchor ở roi-mask; nhóm blob occlusion ở occlusion-watershed.",
          "Sau đó là lượt hình dạng: blob khổng lồ, bbox oversized, tỉ lệ khung sai, anchor đúng chỗ, đủ diện tích, đủ motion. Cuối cùng mới tới bài kiểm [[cast shadow]] ở trang brightness.",
          "Qua hết mới được đo [[HSV histogram]] và đóng gói thành detection dict với observation_kind bằng detection. Contour bị oversized hay shadow reject còn bị xoá khỏi mask để không ám phần sau."
        ],
        values: [
          { k: "vòng lọc", v: "for contour trong _detect", kind: "runtime", src: "backend/main_detect/src/techgar/motion_tracker.py:836" },
          { k: "reject ROI", v: "insufficient_strict_roi_support / anchor_outside_roi", kind: "runtime", src: "backend/main_detect/src/techgar/motion_tracker.py:905-1010" },
          { k: "reject size", v: "oversized_bbox + xoá contour khỏi mask", kind: "runtime", src: "backend/main_detect/src/techgar/motion_tracker.py:964-972" }
        ]
      },
      {
        id: "3.2",
        name: "Cổng hình dạng: giant, oversized, aspect",
        paras: [
          "Blob không phải occlusion mà lớn hơn 22 phần trăm ảnh bị loại thẳng. Vùng motion lớn cỡ đó là sự cố ánh sáng hoặc lỗi mask, không thể là một xe.",
          "[[Bounding box]] quá rộng, quá cao, hoặc quá diện tích so với tỉ lệ tối đa của khung hình bị reject kèm telemetry oversized_bbox ghi rõ ba ngưỡng tối đa.",
          "Aspect ngoài dải 0.25 đến 5.0 cũng bị loại âm thầm — vệt dài mỏng như vệt nước hay bóng rạch không có hình một chiếc xe."
        ],
        values: [
          { k: "giant cap", v: "contourArea > 0.22·W·H → bỏ", kind: "runtime", src: "backend/main_detect/src/techgar/motion_tracker.py:955-956" },
          { k: "oversized", v: "w>0.30·W | h>0.42·H | box>0.12·ảnh", kind: "class-default", src: "backend/main_detect/src/techgar/motion_tracker.py:87-89" },
          { k: "aspect", v: "w/h ∈ [0.25, 5.0]", kind: "runtime", src: "backend/main_detect/src/techgar/motion_tracker.py:973-975" }
        ]
      },
      {
        id: "3.3",
        name: "Cổng bằng chứng motion trong bbox",
        paras: [
          "Đủ lớn chưa đủ — blob phải chứa pixel motion thật. Code đếm temporal_motion bên trong bbox: cần tối thiểu số pixel và tối thiểu tỉ lệ lấp của khung.",
          "Runtime siết hơn class default: 100 motion pixel và 5 phần trăm lấp thay vì 160 và 8 phần trăm. Trong vùng priority thì nới hẳn còn 50 pixel và 3 phần trăm.",
          "motion_fill_ratio đi vào detection dict — phía sau biết blob nào là silhouette đặc và blob nào chỉ quấn quanh một vệt mờ."
        ],
        values: [
          { k: "min area", v: "650 px (350 trong vùng priority)", kind: "runtime", src: "backend/main_detect/two_camera.py:1807" },
          { k: "motion gate", v: "≥100 px và ≥5% fill (50/3% priority)", kind: "runtime", src: "backend/main_detect/src/techgar/motion_tracker.py:1015-1019" },
          { k: "class defaults", v: "pixels 160, ratio 0.08", kind: "class-default", src: "backend/main_detect/src/techgar/motion_tracker.py:46-47" }
        ]
      },
      {
        id: "3.4",
        name: "Dedup echo: silhouette cũ và mới của một xe",
        paras: [
          "Xe nhanh để lại hai blob gần nhau: thân ở vị trí mới và bóng đuôi ở vị trí cũ. _same_motion_echo nhận diện cặp đó bằng kích thước tương đương, màu gần như giống, và anchor gần nhau hoặc box gần chạm.",
          "Dedup chỉ xoá khi cả ba dấu hiệu cùng khớp: echo test, IoU từ 0.25, và [[Bhattacharyya distance]] của histogram không quá 0.12. Hai blob có owner sạch khác nhau thì giữ cả hai — hai xe thật được phép chạm nhau.",
          "Sau khi gán xong còn một lớp nữa. Detection không-match nằm đúng chỗ [[track]] vừa ở bốn frame trước sẽ bị loại khỏi tạo track mới. Bóng đuôi không được mọc thành danh tính riêng."
        ],
        values: [
          { k: "echo test", v: "size≥0.45 & Bhat≤0.22 & gần & gap≤14", kind: "runtime", src: "backend/main_detect/src/techgar/motion_tracker.py:1088-1110" },
          { k: "drop khi", v: "echo + IoU≥0.25 + Bhat≤0.12", kind: "runtime", src: "backend/main_detect/src/techgar/motion_tracker.py:1121-1133" },
          { k: "giữ hai xe chạm", v: "owners ≥3 clean obs, disjoint", kind: "runtime", src: "backend/main_detect/src/techgar/motion_tracker.py:1136-1145" },
          { k: "sau assign", v: "echo quanh history[-4] → không tạo track", kind: "runtime", src: "backend/main_detect/src/techgar/motion_tracker.py:2318-2334" }
        ]
      }
    ],

    /* ④ Số liệu & công thức */
    formulas: [
      {
        name: "Cổng kích thước",
        expr: "reject nếu contourArea > 0.22·S ảnh, hoặc w > 0.30·W, hoặc h > 0.42·H, hoặc w·h > 0.12·S",
        subst: "W=1280, H=720 → w≤384, h≤302, box≤110 592",
        result: "blob 223×247 (55 043 px) vẫn qua — chỉ chặn cực đoan",
        note: "đây là cổng chống blob bất khả thi, không phải bộ lọc đối tượng",
        src: "backend/main_detect/src/techgar/motion_tracker.py:955-972"
      },
      {
        name: "Echo của xe nhanh",
        expr: "size_ratio ≥ 0.45 ∧ Bhat(h₁,h₂) ≤ 0.22 ∧ dist ≤ max(24, 1.1·min-dims) ∧ gap ≤ 14",
        subst: "cộng thêm IoU ≥ 0.25 và Bhat ≤ 0.12 ở bước drop",
        result: "silhouette cũ bị xoá, silhouette mới ở lại",
        note: "docstring: frame-diff chứa cả vị trí cũ lẫn mới của một xe nhanh",
        src: "backend/main_detect/src/techgar/motion_tracker.py:1088-1134"
      }
    ],
    params: [
      { name: "max_bbox ratios", value: "0.30 / 0.42 / 0.12", kind: "class-default", role: "trần rộng/cao/diện-tích của bbox so với khung hình; bị clamp trong [0.05,1]/[0.01,1]", src: "backend/main_detect/src/techgar/motion_tracker.py:87-93" },
      { name: "giant area cap", value: "0.22 · image_area", kind: "runtime", role: "contour non-occlusion lớn hơn mức này bị loại thẳng", src: "backend/main_detect/src/techgar/motion_tracker.py:955" },
      { name: "aspect range", value: "[0.25, 5.0]", kind: "runtime", role: "w/h ngoài dải này không có hình xe", src: "backend/main_detect/src/techgar/motion_tracker.py:973-975" },
      { name: "--motion-min-area", value: "650", kind: "runtime", role: "contourArea tối thiểu của detection thường; priority 350", src: "backend/main_detect/two_camera.py:1807" },
      { name: "--motion-min-pixels / ratio", value: "100 / 0.05", kind: "runtime", role: "bằng chứng motion bên trong bbox; class 160/0.08, priority 50/0.03", src: "backend/main_detect/two_camera.py:1814-1815" },
      { name: "echo thresholds", value: "0.45 / 0.22 / 14px → drop 0.25 / 0.12", kind: "runtime", role: "nhận diện cặp silhouette cũ-mới rồi xoá bản yếu", src: "backend/main_detect/src/techgar/motion_tracker.py:1088-1134" }
    ],

    /* ⑤ Hình thật */
    figures: [
      {
        src: "assets/real/contour-giant-blob.jpg",
        alt: "Frame cam2 session bt với blob tối lớn 223×247 px ở mép trái được khoanh đỏ",
        caption: "bt cam2 f1422 (frame gốc + chú thích): vùng vật+bóng 223×247 px ở mép trái vẫn dưới mọi trần oversized nên thành detection. Đúng lỗi E-C-007: vật không-phải-xe sống sót qua chuỗi cổng.",
        origin: "runtime_session_bt/f1422/cam2"
      }
    ],
    noFigureReason: null,

    /* ⑥ Giới hạn & lỗi thật */
    limits: [
      {
        text: "Chuỗi cổng lọc hình dạng và bằng chứng motion — không lọc đối tượng. Túi đồ, cột gỗ, tay người đủ điều kiện vẫn thành detection (E-C-007, CONFIRMED ở session bt). Mã E-* là finding của chiến dịch verify-replay; danh mục đầy đủ ở trang failure-gallery.",
        evidence: { session: "bt", status: "CONFIRMED" }
      },
      {
        text: "Hai xe chạm nhau bảo tồn được nhờ clean-owner check, nhưng chỉ khi cả hai [[track]] đã có ít nhất ba quan sát sạch. Xe mới xuất hiện chưa có owner thì vẫn có thể bị echo-dedup nuốt.",
        evidence: null
      },
      {
        text: "Các ngưỡng oversized và aspect là trần cực đoan, không phải mô hình xe. Blob 223×247 px đi qua nhẹ nhàng — cổng này tồn tại để chặn sự cố mask, không phải để chặn vật lạ vừa cỡ.",
        evidence: null
      },
      {
        text: "Aspect gate loại âm thầm không telemetry — vệt bị loại vì tỉ lệ khung không để lại vết trong _last_detection_rejections, khó lần vết khi debug.",
        evidence: null
      }
    ],

    /* ⑦ Nguồn */
    sources: [
      { ref: "backend/main_detect/src/techgar/motion_tracker.py:836-849", kind: "runtime", note: "vòng lọc + prefilter 350/22/18" },
      { ref: "backend/main_detect/src/techgar/motion_tracker.py:955-975", kind: "runtime", note: "giant 0.22, oversized + telemetry, aspect [0.25,5.0]" },
      { ref: "backend/main_detect/src/techgar/motion_tracker.py:1011-1019", kind: "runtime", note: "min_area 650/350 + motion pixels/ratio trong bbox" },
      { ref: "backend/main_detect/src/techgar/motion_tracker.py:1064-1085", kind: "runtime", note: "detection dict fields: motion_fill_ratio, hist, spatial_appearance" },
      { ref: "backend/main_detect/src/techgar/motion_tracker.py:1088-1145", kind: "runtime", note: "_same_motion_echo + _suppress_duplicate_detections + _different_clean_owners" },
      { ref: "backend/main_detect/src/techgar/motion_tracker.py:1147-1160", kind: "runtime", note: "_is_echo_of_matched_track: bóng đuôi quanh history[-4]" },
      { ref: "backend/main_detect/src/techgar/motion_tracker.py:2318-2334", kind: "runtime", note: "lọc echo trước khi tạo track mới" },
      { ref: "backend/main_detect/two_camera.py:1807-1815", kind: "runtime", note: "runtime thresholds: area 650, pixels 100, ratio 0.05" }
    ],
    pseudocode: "MOI CONTOUR (sau khi co mask):\n  area < 350 hoac w<22 hoac h<18 -> bo\n  [gate ROI strict/context/anchor - trang roi-mask]\n  [nhanh occlusion group - trang occlusion]\n  contourArea > 0.22*anh -> bo\n  w>0.30W | h>0.42H | box>0.12*anh -> reject oversized_bbox, xoa contour\n  w/h ngoai [0.25,5] -> bo\n  area < 650 -> bo            # 350 neu priority\n  motion_px<100 | fill<5% -> bo   # 50/3% neu priority\n  [gate cast_shadow - trang brightness]\n  -> detection dict (hist, motion_fill_ratio, ...)\n\nDEDUP (sap xep theo area giam):\n  neu echo & IoU>=0.25 & Bhat<=0.12 & khac-owner -> drop\nSAU ASSIGN:\n  detection khong match nhung la echo cua track vua match\n  -> khong tao track moi"
  });
})();
