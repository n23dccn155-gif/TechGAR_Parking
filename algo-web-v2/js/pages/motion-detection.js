/* motion-detection.js — Trang 5: từ frame đến motion mask và contours.
 * Nguồn số liệu đã xác minh: .analysis/algo-web-v2-redesign/notes/motion-detection.md
 */
(function () {
  "use strict";
  TG.definePage({
    id: "motion-detection",
    group: "single-cam",
    title: "Motion detection",
    navLabel: "Motion",
    order: 5,
    prev: "brightness",
    next: "contour-filtering",

    /* ① Chức năng & vị trí */
    fn: {
      text: "Mỗi frame đi qua một cái phễu pixel: [[MOG2]] đưa ra [[foreground mask]], temporal frame-difference đưa ra vùng chuyển động, hai thứ giao nhau thành contour. Trang này kể nửa đầu đó; các cổng lọc per-contour nằm ở trang contour-filtering."
    },

    /* ② Vì sao cần */
    why: {
      paras: [
        "Xe đỗ cũng là foreground — [[MOG2]] một mình sẽ nhả cả bãi xe mỗi frame. Comment trong code nói thẳng: foreground đứng yên không được thành xe. Temporal motion là cổng bắt buộc để tách xe đang chạy khỏi cảnh tĩnh.",
        "Stream điện thoại thì nhiễu: nén video, jitter, speckle vài pixel khi exposure nhảy. Morphology có hai việc ngược nhau — xoá nhiễu nhỏ và nối blob vỡ — mà không được gộp hai xe chạy gần nhau thành một."
      ]
    },

    /* ③ Cách hoạt động */
    how: [
      {
        id: "3.1",
        name: "Temporal references: nhớ frame cũ theo thời gian",
        paras: [
          "Mỗi frame được giảm xuống grey blur 5×5 và cất vào _gray_history kèm timestamp. Code chọn tham chiếu bằng tuổi thực, không phải số frame — vì frame rate DroidCam trôi.",
          "Một tham chiếu chỉ hợp lệ khi tuổi của nó nằm trong khoảng 0.45 đến 2.25 lần mục tiêu. Mục tiêu ngắn là 0.25 giây; khi multiscale bật thêm mục tiêu dài 0.80 giây để bắt xe đi chậm.",
          "Không có timestamp thì rơi về frame-gap: 3 frame, và 9 frame khi multiscale. Timestamp lùi — seek hoặc reconnect — thì xoá sạch history thay vì so với một điểm không liên quan trong stream cũ.",
          "Chưa có tham chiếu nào thì mask trả về toàn số không. Vài frame đầu sau khởi động không thể có detection nào — đó là cold-start có chủ đích."
        ],
        values: [
          { k: "grey input", v: "cvtColor + GaussianBlur 5×5", kind: "runtime", src: "backend/main_detect/src/techgar/motion_tracker.py:533" },
          { k: "cửa sổ tuổi ref", v: "age ∈ [0.45×T, 2.25×T], chọn ref lệch ít nhất", kind: "runtime", src: "backend/main_detect/src/techgar/motion_tracker.py:503-506" },
          { k: "mục tiêu tuổi", v: "0.25 s (+0.80 s khi multiscale)", kind: "runtime", src: "backend/main_detect/src/techgar/motion_tracker.py:52-53" },
          { k: "fallback gap", v: "3 frame (+9 khi multiscale)", kind: "class-default", src: "backend/main_detect/src/techgar/motion_tracker.py:509-520" },
          { k: "timestamp lùi", v: "clear toàn bộ _gray_history", kind: "runtime", src: "backend/main_detect/src/techgar/motion_tracker.py:537-541" }
        ]
      },
      {
        id: "3.2",
        name: "Frame difference có bù sáng, rồi morphology",
        paras: [
          "Với mỗi tham chiếu, _motion_between trừ absdiff sau khi đã bù độ lệch sáng toàn khung ở trang brightness — rồi ngưỡng hoá ở motion_threshold. Các mask của nhiều tham chiếu được OR lại.",
          "Mask motion rồi đi qua open 3×3 để xoá chấm nhiễu, dilate 5×5 hai lần để phình blob, và close bằng join kernel để vá silhouette vỡ.",
          "Comment code cảnh báo rõ đánh đổi: closing kernel quá lớn từng gộp hai xe đồ chơi chạy gần nhau thành một contour. Giữ đủ để vá một xe, không đủ để bắc cầu làn giữa hai xe."
        ],
        values: [
          { k: "ngưỡng diff", v: "--motion-threshold 20 (runtime; class 25)", kind: "runtime", src: "backend/main_detect/two_camera.py:1813" },
          { k: "morphology", v: "open 3×3 → dilate 5×5 ×2 → close join 5×5 ×1", kind: "runtime", src: "backend/main_detect/src/techgar/motion_tracker.py:559-572" },
          { k: "join defaults", v: "kernel 5×5, 1 iteration", kind: "class-default", src: "backend/main_detect/src/techgar/motion_tracker.py:90-91" },
          { k: "cảnh báo gộp xe", v: "comment: kernel lớn gộp 2 xe gần nhau", kind: "runtime", src: "backend/main_detect/src/techgar/motion_tracker.py:561-563" }
        ]
      },
      {
        id: "3.3",
        name: "Giao foreground ∩ motion → contours",
        paras: [
          "Motion mask được dilate bằng kernel 17×17 thành vùng support. [[Foreground mask]] cuối cùng chỉ sống trong vùng đó — pixel khác màu vì nằm xa mọi chuyển động đều bị cắt.",
          "Mask hợp nhất đi qua [[ROI]] [[context band]] nếu có, rồi open 3×3 và close join lần nữa. Cuối cùng findContours với RETR_EXTERNAL lấy vỏ ngoài của từng blob.",
          "Một prefilter rẻ chạy ngay trong vòng contour: area dưới 350 pixel, rộng dưới 22, cao dưới 18 thì bỏ trước khi tốn công đo polygon. Comment giải thích: exposure nhảy tạo hàng trăm speckle 3×3."
        ],
        values: [
          { k: "support dilate", v: "dilate(temporal_motion, 17×17)", kind: "runtime", src: "backend/main_detect/src/techgar/motion_tracker.py:788" },
          { k: "ghép mask", v: "fg AND support (AND roi_context)", kind: "runtime", src: "backend/main_detect/src/techgar/motion_tracker.py:789-809" },
          { k: "contours", v: "RETR_EXTERNAL + CHAIN_APPROX_SIMPLE", kind: "runtime", src: "backend/main_detect/src/techgar/motion_tracker.py:826" },
          { k: "prefilter", v: "area <350 hoặc w<22 hoặc h<18 → bỏ", kind: "class-default", src: "backend/main_detect/src/techgar/motion_tracker.py:844-849" }
        ]
      },
      {
        id: "3.4",
        name: "Priority regions: vùng ưu tiên có chủ đích",
        paras: [
          "Slot binder biết chỗ một [[track]] vừa mất hoặc một xe sắp quay lại. Nó đẩy các polygon xuống tracker qua build_recovery_priority_regions để vùng đó dùng ngưỡng dễ hơn.",
          "Một blob được coi là priority khi anchor rơi trong polygon ưu tiên hoặc chồng lấp đạt mười phần trăm bbox. Trong vùng đó ngưỡng hạ còn 350 area, 50 motion pixel và 3 phần trăm tỉ lệ lấp.",
          "Đây là đường duy nhất pipeline được phép nới cổng detection — và chỉ nới ở đúng chỗ hệ thống đang chờ một xe cụ thể xuất hiện lại."
        ],
        values: [
          { k: "điều kiện priority", v: "anchor trong polygon hoặc overlap ≥10% bbox", kind: "runtime", src: "backend/main_detect/src/techgar/motion_tracker.py:615-631" },
          { k: "ngưỡng priority", v: "area 350 / motion px 50 / ratio 0.03", kind: "class-default", src: "backend/main_detect/src/techgar/motion_tracker.py:53-55" },
          { k: "nguồn polygon", v: "binder.recovery_priority_regions qua two_camera", kind: "runtime", src: "backend/main_detect/two_camera.py:2691" }
        ]
      }
    ],

    /* ④ Số liệu & công thức */
    formulas: [
      {
        name: "Foreground sau cổng motion",
        expr: "mask = open∘close( fg_MOG2 AND dilate(motion, 17×17) [AND roi_context] )",
        subst: "fg = (MOG2 > 200) | (127 được admit)",
        result: "chỉ pixel vừa là foreground vừa gần chuyển động sống sót",
        note: "dilate 17×17 nới support để xe vừa dừng vẫn còn foreground quanh thân — comment: xe đứng yên không được thành xe",
        src: "backend/main_detect/src/techgar/motion_tracker.py:786-819"
      },
      {
        name: "Chọn tham chiếu theo tuổi",
        expr: "ref hợp lệ ⇔ 0.45·T ≤ now − t_ref ≤ 2.25·T, argmin |age − T|",
        subst: "T = 0.25 s và 0.80 s khi multiscale",
        result: "frame rate trôi không làm sai cửa sổ so sánh",
        note: "stream reconnect cho ref quá cũ → bị bỏ, tránh flash toàn khung (comment L500-502)",
        src: "backend/main_detect/src/techgar/motion_tracker.py:486-506"
      }
    ],
    params: [
      { name: "--motion-threshold", value: "20 (class 25)", kind: "runtime", role: "ngưỡng absdiff trên pixel grey đã bù sáng", src: "backend/main_detect/two_camera.py:1813" },
      { name: "temporal windows", value: "0.25 s / 0.80 s", kind: "runtime", role: "tuổi tham chiếu ngắn và dài; runtime ghi cứng trong two_camera", src: "backend/main_detect/two_camera.py:3288-3289" },
      { name: "motion_frame_gap / long", value: "3 / 9 frame", kind: "class-default", role: "fallback khi không có timestamp", src: "backend/main_detect/src/techgar/motion_tracker.py:44" },
      { name: "enable_multiscale_motion", value: "False → runtime True", kind: "runtime", role: "bật thêm tham chiếu dài cho xe đi chậm", src: "backend/main_detect/two_camera.py:2393" },
      { name: "join kernel / iterations", value: "5×5 / 1", kind: "class-default", role: "độ lớn closing vá blob vỡ; tăng quá gộp hai xe", src: "backend/main_detect/src/techgar/motion_tracker.py:90-91" },
      { name: "floors tuyệt đối", value: "area 350 · w 22 · h 18", kind: "class-default", role: "prefilter rẻ trước mọi đo đạc polygon", src: "backend/main_detect/src/techgar/motion_tracker.py:844-849" },
      { name: "priority floors", value: "350 / 50 / 0.03", kind: "class-default", role: "ngưỡng nới trong vùng ưu tiên recovery", src: "backend/main_detect/src/techgar/motion_tracker.py:53-55" }
    ],

    /* ⑤ Hình thật */
    figures: [
      {
        src: "assets/real/motion-moving-car.jpg",
        alt: "Frame cam1 thai1 với xe đen đang chạy được khoanh và xe đỗ được khoanh khác màu",
        caption: "thai1 cam1 f1500 (frame gốc + chú thích): xe đen trong làn có temporal motion nên qua cổng. Hai xe đỗ hàng F là foreground nhưng motion bằng 0 nên không thành detection.",
        origin: "session_hiep_thai1/f1500/cam1"
      }
    ],
    noFigureReason: null,

    /* ⑥ Giới hạn & lỗi thật */
    limits: [
      {
        text: "Xe đứng yên vô hình với detector — đây là thiết kế, không phải lỗi. Xe đỗ sẵn từ trước session không có detection nào; trạng thái đỗ của chúng đi qua slot binder và occupancy, không qua motion."
      },
      {
        text: "Cold-start mù: chưa đủ history để có tham chiếu thì motion mask toàn số không. Vài frame đầu và sau mỗi lần timestamp lùi đều không thể phát hiện gì."
      },
      {
        text: "Join kernel là dây thăng bằng được ghi trong comment. Quá nhỏ thì một xe vỡ thành nhiều blob; quá lớn thì hai xe gần nhau dính thành một. Trang occlusion xử lý hậu quả sau đó."
      },
      {
        text: "Sau motion burst hoặc khởi động đã quan sát thấy track phantom kiểu coasting/new với GID null (E-C-006, UNSURE). Mask sạch không đảm bảo phía sau không sinh track rác. Mã E-* là finding của chiến dịch verify-replay; danh mục đầy đủ ở trang failure-gallery.",
        evidence: { session: "nhiều session", status: "UNSURE" }
      }
    ],

    /* ⑦ Nguồn */
    sources: [
      { ref: "backend/main_detect/src/techgar/motion_tracker.py:486-520", kind: "runtime", note: "chọn tham chiếu theo tuổi 0.45–2.25×T + fallback frame-gap" },
      { ref: "backend/main_detect/src/techgar/motion_tracker.py:522-574", kind: "runtime", note: "_temporal_motion_mask: blur, history, OR refs, morphology, comment join kernel" },
      { ref: "backend/main_detect/src/techgar/motion_tracker.py:537-541", kind: "runtime", note: "timestamp lùi → clear history" },
      { ref: "backend/main_detect/src/techgar/motion_tracker.py:766-826", kind: "runtime", note: "fg AND dilate(motion 17×17) AND roi_context → open → close → contours" },
      { ref: "backend/main_detect/src/techgar/motion_tracker.py:787", kind: "runtime", note: "comment: foreground đứng yên không được thành xe" },
      { ref: "backend/main_detect/src/techgar/motion_tracker.py:839-849", kind: "class-default", note: "prefilter 350/22/18 + comment speckle exposure" },
      { ref: "backend/main_detect/src/techgar/motion_tracker.py:590-631", kind: "runtime", note: "priority mask + điều kiện anchor/overlap 10%" },
      { ref: "backend/main_detect/src/techgar/motion_tracker.py:689-708", kind: "runtime", note: "build_recovery_priority_regions từ slot binder" },
      { ref: "backend/main_detect/two_camera.py:1807-1815", kind: "runtime", note: "--motion-min-area 650, --motion-threshold 20, --motion-min-pixels 100, --motion-min-ratio 0.05" },
      { ref: "backend/main_detect/two_camera.py:1844-1850", kind: "runtime", note: "--motion-join-kernel-size / --motion-join-iterations" },
      { ref: "backend/main_detect/two_camera.py:2393", kind: "runtime", note: "enable_multiscale_motion=True" },
      { ref: "backend/main_detect/two_camera.py:2691", kind: "runtime", note: "priority_regions=build_recovery_priority_regions" }
    ],
    pseudocode: "MOI FRAME:\n  gray = blur5x5(gray(frame))\n  history.append((timestamp, frame_idx, gray))\n  neu timestamp lui -> history.clear()\n  refs = khung_tuoi(0.25s [, 0.80s]) hoac frame_gap 3 [, 9]\n  neu refs rong -> mask = 0 (cold-start)\n\n  motion = OR( threshold(absdiff(gray, bu_sang(ref)), 20) )\n  motion = close(dilate(open(motion,3x3),5x5,x2), join 5x5)\n\n  fg = (MOG2 > 200) [| pixel 127]\n  mask = open∘close( fg AND dilate(motion,17x17) AND roi_context )\n  contours = findContours(mask, EXTERNAL)\n  bo qua: area<350 hoac w<22 hoac h<18\n  -> vao chuoi gate per-contour (trang contour-filtering)"
  });
})();
