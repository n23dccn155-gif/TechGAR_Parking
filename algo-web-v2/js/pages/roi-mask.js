/* roi-mask.js — Trang 1: ROI mask & context band.
 * Nguồn số liệu đã xác minh: .analysis/algo-web-v2-redesign/notes/roi-mask.md
 */
(function () {
  "use strict";
  TG.definePage({
    id: "roi-mask",
    group: "setup",
    title: "ROI mask & context band",
    navLabel: "ROI mask",
    order: 1,
    prev: null,
    next: "parking-slots",

    /* ① Chức năng & vị trí */
    fn: {
      text: "[[ROI]] mask là một đa giác bốn đỉnh do người vận hành vẽ trên frame để khai báo phần ảnh thuộc bãi xe. Lúc chạy, đa giác được rasterize thành ảnh nhị phân và mọi chuyển động ngoài vùng đó bị loại. Đây là cấu hình đầu pipeline detection, quyết định pixel nào được phép trở thành [[track]]."
    },

    /* ② Vì sao cần */
    why: {
      paras: [
        "Không có ROI, motion detection nhìn mọi pixel đổi trong frame: người đi bộ trên lề, bóng cây, vùng watermark của app stream. Mỗi cụm pixel như vậy có thể trở thành một track giả và kéo theo [[GID]] giả.",
        "Ranh giới bãi xe là kiến thức con người duy nhất đưa vào detection. Thuật toán không tự biết đâu là lề đường; nó chỉ biết pixel nào được phép nhìn và pixel nào bị mask bỏ qua hoàn toàn."
      ]
    },

    /* ③ Cách hoạt động */
    how: [
      {
        id: "3.1",
        name: "Vẽ đa giác bằng tay, một lần mỗi camera",
        paras: [
          "Tool offline mask_roi.py chụp một frame từ mỗi camera rồi chờ người vận hành click đúng bốn điểm. Phím 'r' xoá các điểm đã thêm, Enter chốt hình khi đủ bốn đỉnh.",
          "Khi đủ điểm, tool fill đa giác 30 phần trăm độ mờ lên frame để kiểm tra bằng mắt trước khi lưu.",
          "File ghi ra chỉ chứa hai field: polygon là bốn toạ độ {x, y}, và image_size là kích thước frame lúc vẽ."
        ],
        values: [
          { k: "số đỉnh đa giác", v: "target_points = 4", kind: "class-default", src: "backend/main_detect/mask_roi.py:8" },
          { k: "preview fill", v: "alpha 0.3 khi đủ 4 điểm", kind: "class-default", src: "backend/main_detect/mask_roi.py:45-46" },
          { k: "schema JSON ghi ra", v: "{polygon, image_size}", kind: "class-default", src: "backend/main_detect/mask_roi.py:93-101" }
        ]
      },
      {
        id: "3.2",
        name: "JSON thành mask nhị phân lúc khởi động",
        paras: [
          "Session đọc file qua --mask-cam{1,2}, mặc định trỏ tới config/roi_mask_cam*.json. Đa giác được fillPoly thành mask uint8 theo đúng kích thước frame hiện tại.",
          "Cờ --tracking-roi-cam{1,2} cho phép tracker dùng một polygon riêng nhỏ hơn vùng handoff. Không có cờ này thì tracking ROI chính là mask đã load.",
          "Nếu không có file mask nào, ROI rơi về union mask của các ô đỗ — vùng giữa các ô không được nhìn."
        ],
        values: [
          { k: "đường dẫn mặc định", v: "config/roi_mask_cam{1,2}.json", kind: "runtime", src: "backend/main_detect/two_camera.py:1762-1763" },
          { k: "rasterize", v: "fillPoly → uint8 mask theo shape frame", kind: "runtime", src: "backend/main_detect/two_camera.py:2207-2216" },
          { k: "tracking ROI riêng", v: "--tracking-roi-cam{1,2} override --mask-cam*", kind: "runtime", src: "backend/main_detect/two_camera.py:2412-2416" },
          { k: "fallback khi thiếu file", v: "union mask ô đỗ", kind: "runtime", src: "backend/main_detect/two_camera.py:2428" }
        ]
      },
      {
        id: "3.3",
        name: "Hai lớp biên: strict ROI và context band",
        paras: [
          "Tracker giữ hai phiên bản của cùng một đa giác: mask strict và [[context band]] — strict mask được dilate thêm roi_context_padding_px bằng kernel ellipse.",
          "Runtime padding là 48 px, nghĩa là band rộng khoảng 48 px quanh mép strict ROI. Foreground được cắt theo band, không theo strict mask.",
          "Comment trong code nêu rõ mục đích: xe chạm biên ROI được đo nguyên chiếc, nhưng band không mở rộng vùng được phép sinh identity mới."
        ],
        values: [
          { k: "kernel context band", v: "ellipse (2p+1)², 1 lần dilate", kind: "runtime", src: "backend/main_detect/src/techgar/motion_tracker.py:804-810" },
          { k: "padding runtime", v: "48 px (--motion-roi-context-px)", kind: "runtime", src: "backend/main_detect/two_camera.py:1817-1819" },
          { k: "padding class default", v: "0 — không có band", kind: "class-default", src: "backend/main_detect/src/techgar/motion_tracker.py:95" },
          { k: "foreground clip", v: "mask &= context_mask", kind: "runtime", src: "backend/main_detect/src/techgar/motion_tracker.py:816" }
        ]
      },
      {
        id: "3.4",
        name: "Gate support: phần pixel phải nằm trong strict ROI",
        paras: [
          "Mỗi contour được đo roi_support_ratio — tỉ lệ pixel nằm trong strict ROI. Dưới 98 phần trăm thì blob bị đánh dấu roi_clipped, tức bị biên cắt.",
          "Khi support trong strict ROI dưới required_support, một con đường cứu duy nhất tồn tại. Blob phải đồng thời: bị clip, còn ít nhất một pixel trong strict, anchor nằm trong band, và support trên band đạt ngưỡng.",
          "Blob sống hoàn toàn trong band vẫn chết — comment code khẳng định đó là vùng ngoài khu vực giám sát."
        ],
        values: [
          { k: "ngưỡng roi_clipped", v: "roi_support_ratio < 0.98", kind: "runtime", src: "backend/main_detect/src/techgar/motion_tracker.py:875" },
          { k: "required_support", v: "max(20, min(motion_min_pixels, 0.08 × component))", kind: "runtime", src: "backend/main_detect/src/techgar/motion_tracker.py:876-879" },
          { k: "rescue path", v: "clipped + support>0 + anchor trong band + context đủ", kind: "runtime", src: "backend/main_detect/src/techgar/motion_tracker.py:905-921" },
          { k: "reject reason", v: "insufficient_strict_roi_support", kind: "runtime", src: "backend/main_detect/src/techgar/motion_tracker.py:911-920" }
        ]
      },
      {
        id: "3.5",
        name: "Anchor gate và telemetry rejection",
        paras: [
          "Sau gate support, điểm đáy-giữa của [[bounding box]] phải nằm trong strict ROI. Đây là anchor đại diện vị trí mặt đất của xe.",
          "Một blob không bị clip nhưng anchor lọt mép vài px được dung thứ nếu anchor vẫn trong band — trạng thái roi_anchor_tolerated.",
          "Anchor nằm hẳn ngoài thì blob bị reject anchor_outside_roi và contour bị xoá khỏi mask. Cả hai loại reject đều ghi vào _last_detection_rejections cùng _roi_rejected_points để debug."
        ],
        values: [
          { k: "anchor bắt buộc", v: "bottom_center ∈ strict ROI", kind: "runtime", src: "backend/main_detect/src/techgar/motion_tracker.py:977-990" },
          { k: "dung thứ biên", v: "roi_anchor_tolerated nếu anchor ∈ band", kind: "runtime", src: "backend/main_detect/src/techgar/motion_tracker.py:996-1001" },
          { k: "reject reason", v: "anchor_outside_roi + xoá contour", kind: "runtime", src: "backend/main_detect/src/techgar/motion_tracker.py:1002-1010" }
        ]
      },
      {
        id: "3.6",
        name: "ROI không đóng băng trong session",
        paras: [
          "Interactive ROI editor cho phép save đa giác mới giữa chừng. Pipeline rebuild detector và cập nhật roi_mask của tracker.",
          "Có một ngoại lệ: nếu camera đang dùng --tracking-roi riêng, editor chỉ đổi ô đỗ chứ không đụng tracking ROI."
        ],
        values: [
          { k: "rebuild khi save", v: "detector mới + roi_mask cập nhật", kind: "runtime", src: "backend/main_detect/two_camera.py:3123-3147" }
        ]
      }
    ],

    /* ④ Số liệu & công thức */
    formulas: [
      {
        name: "Ngưỡng support strict",
        expr: "required = max(20, min(motion_min_pixels, 0.08 × component_pixels))",
        subst: "component 2000 px → max(20, min(100, 160))",
        result: "= 100 px",
        note: "blob 2000 px cần ít nhất 100 px nằm trong strict ROI; rescue path đo lại trên band với cùng ngưỡng",
        src: "backend/main_detect/src/techgar/motion_tracker.py:876-879"
      },
      {
        name: "Context band",
        expr: "band = dilate(strict_ROI, ellipse (2p + 1)²)",
        subst: "p = 48 → kernel 97 × 97",
        result: "≈ +48 px quanh mép",
        note: "band chỉ để hoàn thiện blob chạm biên, không mở rộng vùng sinh identity (comment motion_tracker.py:812-815)",
        src: "backend/main_detect/src/techgar/motion_tracker.py:804-810"
      }
    ],
    params: [
      { name: "target_points", value: "4", kind: "class-default", role: "số đỉnh đa giác ROI — chỉ tứ giác", src: "backend/main_detect/mask_roi.py:8" },
      { name: "roi_context_padding_px (runtime)", value: "48 px", kind: "runtime", role: "độ rộng context band quanh strict ROI", src: "backend/main_detect/two_camera.py:1819" },
      { name: "motion_min_pixels (runtime)", value: "100", kind: "runtime", role: "số pixel motion tối thiểu của một blob; class default là 160", src: "backend/main_detect/two_camera.py:1814" },
      { name: "ngưỡng roi_clipped", value: "0.98", kind: "runtime", role: "dưới tỉ lệ này blob được coi bị cắt ở biên ROI", src: "backend/main_detect/src/techgar/motion_tracker.py:875" },
      { name: "sàn required_support", value: "20 px", kind: "runtime", role: "mức tối thiểu tuyệt đối của ngưỡng support", src: "backend/main_detect/src/techgar/motion_tracker.py:877" },
      { name: "image_size trong file mask", value: "1280 × 720", kind: "config", role: "kích thước frame lúc vẽ polygon cam1/cam2", src: "backend/main_detect/config/roi_mask_cam1.json" }
    ],

    /* ⑤ Hình thật */
    figures: [
      {
        src: "assets/real/roi-cam1.jpg",
        alt: "Frame cam1 với đa giác ROI bốn điểm từ config đang dùng",
        caption: "Polygon cam1 thực tế (config/roi_mask_cam1.json, hiệu chuẩn 2026-10-06, frame gốc + chú thích): bốn đỉnh ôm sát mép tấm bãi, loại nền gỗ xung quanh và vật cản góc dưới-trái.",
        origin: "shared_map_01/cal-20261006-180750-46035b9a/f0/cam1"
      },
      {
        src: "assets/real/roi-cam2.jpg",
        alt: "Frame cam2 với đa giác ROI bốn điểm, mép trên cắt ngay dưới hàng ô trên cùng",
        caption: "Polygon cam2 (config/roi_mask_cam2.json, hiệu chuẩn 2026-10-06, frame gốc + chú thích) loại nền hai bên và dải mép trên. Vùng chữ droidcam.app nằm trong ROI nên không bị mask — ở thai6 một blob trên watermark đã sống 88 frame (E-A-039).",
        origin: "shared_map_01/cal-20261006-180750-46035b9a/f0/cam2"
      }
    ],
    noFigureReason: null,
    interactive: "roi",

    /* ⑥ Giới hạn & lỗi thật */
    limits: [
      {
        text: "Đa giác đúng bốn đỉnh và image_size không được kiểm lại khi load: runtime chỉ fillPoly theo shape frame hiện tại. Đổi độ phân giải camera làm polygon lệch âm thầm (suy luận từ đường load)."
      },
      {
        text: "Xe nằm nửa-trong-nửa-ngoài ROI gây nhiễu biên lặp lại: sang8 cam2 f129-889 ghi chuỗi re-id từ mười lần trở lên trên một xe mép ROI. Band 48 px cứu được hình dáng nhưng không xoá được nhiễu.",
        evidence: { session: "sang8", status: "CONFIRMED" }
      },
      {
        text: "Trạng thái nửa-ngoài có thể kéo dài hàng trăm frame. Coasting/frozen khoảng 140 frame trên xe chỉ phần trong ROI (E-B-003/E-B-006) vẫn UNSURE — hợp lệ hay thiếu TTL riêng chưa chốt. Mã E-* là finding của chiến dịch verify-replay; danh mục đầy đủ ở trang failure-gallery.",
        evidence: { session: "thai4", status: "UNSURE" }
      },
      {
        text: "Rescue path có kẽ hở nhỏ: thai6 cam2 lid14 sống 88 frame trên vùng watermark droidcam.app với roi_support_ratio chỉ 0.08-0.15. Lỗi cosmetic nhưng chứng tỏ blob mép có thể tồn tại lâu nếu qua được chuỗi điều kiện cứu.",
        evidence: { session: "thai6", status: "CONFIRMED" }
      },
      {
        text: "Blob sống hoàn toàn trong context band vẫn bị reject — đây là thiết kế có chủ đích, không phải lỗi. Band chỉ dành cho blob thật sự chạm strict ROI."
      }
    ],

    /* ⑦ Nguồn */
    sources: [
      { ref: "backend/main_detect/mask_roi.py:8-14", kind: "class-default", note: "MaskROIBuilder target_points=4, fixed_points" },
      { ref: "backend/main_detect/mask_roi.py:50-68", kind: "class-default", note: "vòng lặp click: Enter chốt khi đủ 4, 'r' reset" },
      { ref: "backend/main_detect/mask_roi.py:93-109", kind: "class-default", note: "schema JSON ghi ra: polygon + image_size" },
      { ref: "backend/main_detect/config/roi_mask_cam1.json", kind: "config", note: "polygon cam1 đang dùng: (116,687)(1273,677)(1242,139)(158,143)" },
      { ref: "backend/main_detect/config/roi_mask_cam2.json", kind: "config", note: "polygon cam2 đang dùng: (13,716)(1253,719)(1162,82)(68,103)" },
      { ref: "backend/main_detect/two_camera.py:1762-1782", kind: "runtime", note: "CLI --mask-cam*, --tracking-roi-cam*, --show-tracking-roi" },
      { ref: "backend/main_detect/two_camera.py:2205-2230", kind: "runtime", note: "load JSON → fillPoly uint8; legacy handoff_edge" },
      { ref: "backend/main_detect/two_camera.py:1817-1823", kind: "runtime", note: "--motion-roi-context-px default 48" },
      { ref: "backend/main_detect/two_camera.py:2385-2392", kind: "runtime", note: "CLI → ctor: motion_min_pixels, roi_context_padding_px" },
      { ref: "backend/main_detect/two_camera.py:2412-2428", kind: "runtime", note: "gán trackers[].roi_mask; fallback union ô đỗ" },
      { ref: "backend/main_detect/two_camera.py:3123-3147", kind: "runtime", note: "live editor save → rebuild detector + roi_mask" },
      { ref: "backend/main_detect/src/techgar/motion_tracker.py:790-816", kind: "runtime", note: "motion mask bắt buộc + context band + clip foreground" },
      { ref: "backend/main_detect/src/techgar/motion_tracker.py:850-921", kind: "runtime", note: "roi_support_ratio, clipped 0.98, required_support, rescue/reject" },
      { ref: "backend/main_detect/src/techgar/motion_tracker.py:976-1010", kind: "runtime", note: "anchor gate, roi_anchor_tolerated, anchor_outside_roi + xoá contour" },
      { ref: "backend/main_detect/src/techgar/parking_detector.py:174-184", kind: "runtime", note: "get_global_mask = union mask các ô đỗ" }
    ],
    pseudocode: "OFFLINE (mask_roi.py, moi camera):\n  frame <- 1 frame tu stream\n  nguoi van hanh click 4 diem; Enter chot; 'r' reset\n  ghi {polygon: [{x,y} x4], image_size: [w,h]}\n\nSTARTUP (moi session):\n  mask = zeros(h, w); fillPoly(mask, polygon, 255)\n  band = dilate(mask, ellipse(2*48 + 1))     # runtime padding 48px\n\nMOI FRAME (moi contour du lon):\n  support = so px contour trong strict ROI\n  neu support < max(20, min(100, 0.08*component)):\n    cuu neu clipped & support>0 & anchor trong band & band_support >= nguong\n    nguoc lai -> reject insufficient_strict_roi_support\n  anchor = bottom_center(bbox)\n  anchor phai trong strict ROI\n    (khong clipped + anchor trong band -> roi_anchor_tolerated)\n    ngoai band -> reject anchor_outside_roi, xoa contour"
  });
})();
