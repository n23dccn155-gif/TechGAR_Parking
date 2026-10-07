/* tracklet-descriptor.js — Trang 10: Tracklet descriptor (appearance).
 * Nguồn số liệu đã xác minh: .analysis/algo-web-v2-redesign/notes/tracklet-descriptor.md
 */
(function () {
  "use strict";
  TG.definePage({
    id: "tracklet-descriptor",
    group: "multi-cam",
    title: "Tracklet descriptor (appearance)",
    navLabel: "Tracklet descriptor",
    order: 10,
    prev: "occlusion-watershed",
    next: "trajectory-reid",

    /* ① Chức năng & vị trí */
    fn: {
      text: "[[Tracklet descriptor]] mô tả ngoại hình của một [[track]] bằng một [[appearance gallery]] gồm nhiều histogram màu lấy mẫu theo thời gian. Đây là nguồn bằng chứng duy nhất để hệ thống so sánh xe giữa hai camera nhìn từ hai phía đối diện."
    },

    /* ② Vì sao cần */
    why: {
      paras: [
        "Tọa độ pixel hay tọa độ thế giới không nói được hai quan sát có phải cùng một chiếc xe. Khi một fragment mới xuất hiện trên camera kia, hệ thống phải trả lời câu hỏi nhận dạng: xe này trông giống chiếc đã mất dấu không. Không có mô tả ngoại hình, mọi fragment đều trở thành một [[GID]] mới.",
        "So sánh chỉ bằng một crop cuối cùng cũng không đủ tin cậy. Crop cuối có thể bị che khuất, đổi sáng hoặc lệch kích thước, trong khi gallery gồm nhiều mẫu rải suốt hành trình chịu được một vài quan sát xấu. Đây là lý do descriptor được thiết kế là một tập mẫu chứ không phải một vector đơn."
      ]
    },

    /* ③ Cách hoạt động */
    how: [
      {
        id: "3.1",
        name: "Descriptor ba kênh màu, 416 chiều",
        paras: [
          "Mỗi mẫu ngoại hình là một [[HSV histogram]] kết hợp ba kênh: hue-saturation 16 nhân 16 bin, chromaticity LAB 12 nhân 12 bin, và luminance 16 bin.",
          "Ba phần được nhân trọng số 0.70, 1.20 và 0.60 trước khi nối thành vector 416 chiều rồi chuẩn hóa L2. Trọng số 1.20 đặt lên kênh LAB vì hue và saturation không phân biệt được xe đen, xám và trắng.",
          "Khi có [[foreground mask]] từ motion detection, histogram chỉ tính trên pixel thuộc đối tượng. Khung bao của motion detection thường chứa nhiều nền đường, nên nếu tính cả khung thì màu mặt đường sẽ lấn át màu xe."
        ],
        values: [
          { k: "kích thước descriptor", v: "256 + 144 + 16 = 416 chiều", kind: "class-default", src: "backend/main_detect/src/techgar/tracklet_descriptor.py:52-67" },
          { k: "trọng số HS / LAB chroma / L", v: "0.70 / 1.20 / 0.60", kind: "class-default", src: "backend/main_detect/src/techgar/tracklet_descriptor.py:61-67" }
        ]
      },
      {
        id: "3.2",
        name: "Cổng chất lượng mẫu trước khi vào gallery",
        paras: [
          "Không phải detection nào cũng được lấy mẫu. Hàm chất lượng tính một điểm từ 0 đến 1 rồi loại mẫu dưới 0.5 ngay trong tracker một camera.",
          "Điểm chất lượng gồm ba nhân tố. Diện tích crop phải đạt 200 pixel vuông, tỉ lệ foreground tối thiểu 0.15, và tỉ lệ khung hình phải nằm trong dải 0.3 đến 4.0.",
          "Hệ quả: một crop nhỏ hơn 200 pixel vuông hoặc có dưới 15 phần trăm foreground bị bỏ qua hoàn toàn. Xe bị che khuất lâu sẽ có gallery còi, và thiếu evidence này ngăn các bước match phía sau duyệt nhầm."
        ],
        values: [
          { k: "diện tích crop tối thiểu", v: "200 px²", kind: "class-default", src: "backend/main_detect/src/techgar/tracklet_descriptor.py:85" },
          { k: "foreground ratio tối thiểu", v: "0.15", kind: "class-default", src: "backend/main_detect/src/techgar/tracklet_descriptor.py:86" },
          { k: "ngưỡng loại mẫu", v: "quality < 0.5", kind: "class-default", src: "backend/main_detect/src/techgar/motion_tracker.py:427-430" },
          { k: "dải aspect hợp lệ", v: "0.3 đến 4.0", kind: "class-default", src: "backend/main_detect/src/techgar/tracklet_descriptor.py:131" }
        ]
      },
      {
        id: "3.3",
        name: "Gallery trên local track, giới hạn 12 mẫu",
        paras: [
          "Mỗi [[track]] sở hữu một [[AppearanceTracklet]] chứa tối đa 12 mẫu, và chỉ lấy mẫu mới khi đã qua ít nhất 3 frame kể từ mẫu trước.",
          "Khi gallery đầy, mẫu cũ nhất bị xóa để nhường chỗ cho mẫu mới. Cách này giữ gallery mô tả hành trình gần đây thay vì đóng băng ở những frame đầu tiên.",
          "Song song với gallery, tracker còn giữ một vector appearance đơn cập nhật theo kiểu [[EMA]] với hệ số 0.75 cũ và 0.25 mới. Vector này chỉ phục vụ so sánh cùng camera.",
          "Riêng cho same-camera, descriptor còn tách bbox thành hai zone nửa trên và nửa dưới để so sánh theo không gian. Cơ chế này không dùng cross-camera vì hai view đối diện nhìn xe theo chiều ngược nhau."
        ],
        values: [
          { k: "max_samples mỗi local track", v: "12", kind: "runtime", src: "backend/main_detect/two_camera.py:1970" },
          { k: "khoảng cách frame giữa hai mẫu", v: "3 frame", kind: "runtime", src: "backend/main_detect/two_camera.py:1971" },
          { k: "EMA appearance same-camera", v: "0.75 cũ / 0.25 mới", kind: "runtime", src: "backend/main_detect/src/techgar/motion_tracker.py:2156" },
          { k: "foreground tối thiểu mỗi zone", v: "max(20 px, 15% vùng)", kind: "class-default", src: "backend/main_detect/src/techgar/tracklet_descriptor.py:167" }
        ]
      },
      {
        id: "3.4",
        name: "Gallery identity toàn cục, giới hạn 24 mẫu",
        paras: [
          "Khi một fragment được gán vào [[GID]], gallery của nó được hợp nhất vào gallery identity bằng [[merge_appearance_samples]].",
          "Hợp nhất có hai luật. Mẫu mới quá giống mẫu đã có, distance không quá 0.015, thì thay thế thay vì nhân đôi. Khi vượt 24 mẫu, gallery giãn đều theo vị trí để giữ cả đầu lẫn cuối hành trình.",
          "Ngoài gallery chung, identity còn lưu gallery riêng cho từng camera. Một xe nhìn từ cam1 và cam2 trông khác nhau, nên match vào camera đích phải so với đúng gallery của camera đó."
        ],
        values: [
          { k: "gallery identity tối đa", v: "24 mẫu", kind: "runtime", src: "backend/main_detect/two_camera.py:1972" },
          { k: "ngưỡng coi là mẫu trùng", v: "distance ≤ 0.015", kind: "class-default", src: "backend/main_detect/src/techgar/tracklet_descriptor.py:292" },
          { k: "gallery riêng theo camera", v: "camera_appearance_samples", kind: "runtime", src: "backend/main_detect/src/techgar/cross_camera_manager.py:8607-8612" }
        ]
      },
      {
        id: "3.5",
        name: "So khớp hai gallery bằng bốn thành phần",
        paras: [
          "Khoảng cách giữa hai descriptor đơn lẻ là [[Bhattacharyya distance]]. Khoảng cách giữa hai gallery được tính trên ma trận mọi cặp mẫu của hai bên.",
          "Điểm cuối cùng là trung bình có trọng số của bốn đại lượng. Median nearest-neighbour trên gallery nhỏ hơn nặng 0.50, median đối xứng hai chiều nặng 0.20. Distance giữa hai descriptor trung vị nặng 0.20 và trung bình ba cặp tốt nhất nặng 0.10.",
          "Thiết kế lấy gallery nhỏ làm chuẩn vì tracklet đích thường còn ngắn khi handoff chạy. Các góc nhìn cũ trong gallery dài của nguồn vì vậy không phủ quyết được một entry tốt.",
          "Nếu một bên không có mẫu nào, hàm trả distance cố định 0.25 và support bằng 0. Support bằng 0 làm mọi cổng match phía sau từ chối, nên gallery rỗng không bao giờ bị duyệt ngầm."
        ],
        values: [
          { k: "trọng số nearest / coverage / aggregate / best3", v: "0.50 / 0.20 / 0.20 / 0.10", kind: "class-default", src: "backend/main_detect/src/techgar/tracklet_descriptor.py:339-344" },
          { k: "distance khi thiếu gallery", v: "0.25 và support = 0", kind: "class-default", src: "backend/main_detect/src/techgar/tracklet_descriptor.py:308-315" },
          { k: "support", v: "min(số mẫu hai bên)", kind: "class-default", src: "backend/main_detect/src/techgar/tracklet_descriptor.py:347" }
        ]
      },
      {
        id: "3.6",
        name: "Nơi appearance distance quyết định",
        paras: [
          "Trong pass world-trajectory, fragment bị từ chối theo camera đích khi support bằng 0 hoặc distance vượt min của 0.45 và ngưỡng dormant appearance.",
          "Distance còn đi vào [[trajectory score]] dưới dạng appearance score bằng 1 trừ distance, chiếm trọng số 0.25. Appearance vì vậy là một thành phần quan trọng nhưng không phải duy nhất.",
          "Các ngưỡng appearance đang chạy: 0.45 cho handoff, 0.82 cho trường hợp nới khi cặp xe duy nhất rất gần nhau, và 0.60 cho dormant re-identification."
        ],
        values: [
          { k: "gate appearance trong trajectory pass", v: "min(0.45, dormant_threshold)", kind: "runtime", src: "backend/main_detect/src/techgar/cross_camera_manager.py:6930" },
          { k: "trọng số appearance trong score", v: "0.25", kind: "class-default", src: "backend/main_detect/src/techgar/trajectory_memory.py:397" },
          { k: "handoff / relaxed / dormant", v: "0.45 / 0.82 / 0.60", kind: "runtime", src: "backend/main_detect/two_camera.py:1928-1969" }
        ]
      }
    ],

    /* ④ Số liệu & công thức */
    formulas: [
      {
        name: "Kích thước descriptor",
        expr: "d = 16×16 + 12×12 + 16",
        subst: "256 + 144 + 16",
        result: "= 416 chiều",
        note: "ba histogram nối nhau sau khi nhân trọng số",
        src: "backend/main_detect/src/techgar/tracklet_descriptor.py:52-67"
      },
      {
        name: "Điểm chất lượng mẫu",
        expr: "q = 0.5·size + 0.3·fg + 0.2·aspect",
        subst: "0.5 × 0.5 + 0.3 × 0.6 + 0.2 × 1.0",
        result: "= 0.63, qua cổng 0.5",
        note: "ví dụ crop 500 px², foreground 30 phần trăm, aspect 1.25 (minh họa)",
        src: "backend/main_detect/src/techgar/tracklet_descriptor.py:137"
      },
      {
        name: "Distance giữa hai gallery",
        expr: "d = 0.50·near + 0.20·cover + 0.20·agg + 0.10·best3",
        subst: "0.50 × 0.20 + 0.20 × 0.30 + 0.20 × 0.25 + 0.10 × 0.15",
        result: "= 0.225",
        note: "bốn thành phần đều là Bhattacharyya trên các cặp mẫu (minh họa)",
        src: "backend/main_detect/src/techgar/tracklet_descriptor.py:339-346"
      },
      {
        name: "Appearance score trong trajectory",
        expr: "s_app = 1 − appearance_distance",
        subst: "1 − 0.167",
        result: "≈ 0.833",
        note: "giá trị thật của ca sang8 f600, đọc từ components của event reject",
        src: "backend/main_detect/experiment_test/output/verify_cur_session_hiep_sang8/predictions.jsonl:600"
      }
    ],
    params: [
      { name: "tracklet_max_samples", value: "12", kind: "runtime", role: "số mẫu tối đa trong gallery của một local track", src: "backend/main_detect/two_camera.py:1970" },
      { name: "tracklet_sample_interval", value: "3 frame", kind: "runtime", role: "khoảng frame tối thiểu giữa hai lần lấy mẫu", src: "backend/main_detect/two_camera.py:1971" },
      { name: "global_gallery_max_samples", value: "24", kind: "runtime", role: "số mẫu tối đa trong gallery của một GID", src: "backend/main_detect/two_camera.py:1972" },
      { name: "dedupe distance", value: "0.015", kind: "class-default", role: "mẫu gần-trùng khi merge gallery thì bị thay thế", src: "backend/main_detect/src/techgar/tracklet_descriptor.py:292" },
      { name: "min_area / min_fg_ratio", value: "200 px² / 0.15", kind: "class-default", role: "cổng chất lượng mẫu trước khi vào gallery", src: "backend/main_detect/src/techgar/tracklet_descriptor.py:85-86" },
      { name: "missing_distance", value: "0.25", kind: "class-default", role: "distance trả về khi một bên không có mẫu, kèm support 0", src: "backend/main_detect/src/techgar/tracklet_descriptor.py:308" },
      { name: "trọng số gallery match", value: "0.50/0.20/0.20/0.10", kind: "class-default", role: "nearest / coverage / aggregate / best3", src: "backend/main_detect/src/techgar/tracklet_descriptor.py:339-344" },
      { name: "handoff_appearance_threshold", value: "0.45", kind: "runtime", role: "ngưỡng appearance chính của handoff", src: "backend/main_detect/two_camera.py:1928" },
      { name: "dormant_appearance_threshold", value: "0.60", kind: "runtime", role: "ngưỡng appearance cho dormant re-identification", src: "backend/main_detect/two_camera.py:1969" }
    ],

    /* ⑤ Hình thật */
    figures: [
      {
        src: "assets/real/tracklet-descriptor-cam2-f300.jpg",
        alt: "Xe teal trên cam2 trước handoff, khung lid38",
        caption: "Cam2 f300: chiếc xe teal đang mang lid38 và GID 2. Gallery của nó gồm các mẫu màu lấy theo thời gian trên camera này.",
        origin: "session_hiep_sang8/f300/cam2"
      },
      {
        src: "assets/real/tracklet-descriptor-cam1-f326.jpg",
        alt: "Cùng chiếc xe trên cam1 sau handoff, khung lid26",
        caption: "Cam1 f326: cùng chiếc xe vừa handoff sang với lid26, vẫn giữ GID 2. Event handoff_matched tại f326 ghi appearance_distance 0.272 giữa hai gallery.",
        origin: "session_hiep_sang8/f326/cam1"
      }
    ],
    noFigureReason: null,
    interactive: null,

    /* ⑥ Giới hạn & lỗi thật */
    limits: [
      {
        text: "Histogram màu không mã hóa hình dạng, nên hai xe cùng tông màu có thể cho distance thấp. Code bù bằng cách chỉ cho appearance trọng số 0.25 trong trajectory score (suy luận từ trọng số)."
      },
      {
        text: "So sánh hai zone trên-dưới chỉ hợp lệ trong cùng một camera. Comment trong code nêu thẳng spatial histograms chỉ dành cho same-camera vì hai view đối diện đảo thứ tự không gian của xe.",
        evidence: { session: "tracklet_descriptor.py docstring L153-156", status: "CONFIRMED" }
      },
      {
        text: "Gallery rỗng trả distance cố định 0.25 với support bằng 0, và mọi cổng match đều loại support bằng 0. Xe bị che khuất lâu hoặc toàn mẫu bị cổng chất lượng loại sẽ không bao giờ match được, kể cả đúng xe."
      },
      {
        text: "Appearance đồng ý một mình không đủ để giữ identity. Ở ca sang8 f600, fragment mới có appearance component 0.833 tương đương distance khoảng 0.167, đã qua cổng appearance nhưng vẫn bị từ chối vì tổng score 0.6683 dưới 0.78.",
        evidence: { session: "verify_cur_session_hiep_sang8", frame: 600, status: "CONFIRMED" }
      }
    ],

    /* ⑦ Nguồn */
    sources: [
      { ref: "backend/main_detect/src/techgar/tracklet_descriptor.py:18-68", kind: "class-default", note: "hsv_histogram: crop, mask foreground, 3 kênh có trọng số, L2 normalize" },
      { ref: "backend/main_detect/src/techgar/tracklet_descriptor.py:81-138", kind: "class-default", note: "compute_sample_quality: min_area 200, fg 0.15, aspect 0.3-4.0, trọng số 0.5/0.3/0.2" },
      { ref: "backend/main_detect/src/techgar/tracklet_descriptor.py:141-179", kind: "class-default", note: "histogram_distance Bhattacharyya + spatial 2-zone same-camera" },
      { ref: "backend/main_detect/src/techgar/tracklet_descriptor.py:182-217", kind: "class-default", note: "AppearanceTracklet max 12 mẫu, interval 3 frame, xóa mẫu cũ" },
      { ref: "backend/main_detect/src/techgar/tracklet_descriptor.py:266-274", kind: "class-default", note: "aggregate = median, fallback mean" },
      { ref: "backend/main_detect/src/techgar/tracklet_descriptor.py:277-305", kind: "class-default", note: "merge_appearance_samples: dedupe 0.015, cap 24, linspace subsample" },
      { ref: "backend/main_detect/src/techgar/tracklet_descriptor.py:308-351", kind: "class-default", note: "compare_tracklets: 4 thành phần, missing 0.25, support=min" },
      { ref: "backend/main_detect/src/techgar/motion_tracker.py:416-430", kind: "runtime", note: "quality < 0.5 → không lấy histogram" },
      { ref: "backend/main_detect/src/techgar/motion_tracker.py:2029-2033,2157-2165", kind: "runtime", note: "gắn AppearanceTracklet + EMA appearance 0.75/0.25 khi trusted" },
      { ref: "backend/main_detect/src/techgar/cross_camera_manager.py:8552-8613", kind: "runtime", note: "track hết hạn → gallery nhập dormant identity + per-camera gallery" },
      { ref: "backend/main_detect/src/techgar/cross_camera_manager.py:6917-6941", kind: "runtime", note: "gate support>0 và distance ≤ min(0.45, dormant_threshold)" },
      { ref: "backend/main_detect/src/techgar/cross_camera_manager.py:284-288", kind: "runtime", note: "dormant_appearance_threshold fallback min(0.75, app+0.15)" },
      { ref: "backend/main_detect/src/techgar/trajectory_memory.py:395-402", kind: "class-default", note: "trọng số 0.35/0.25/0.15/0.10/0.10/0.05 của trajectory score" },
      { ref: "backend/main_detect/two_camera.py:1926-1972", kind: "runtime", note: "CLI defaults: handoff app 0.45, relaxed 0.82, dormant app 0.60, tracklet 12/3, gallery 24" }
    ],
    pseudocode: "MOI DETECTION (motion_tracker):\n  q <- 0.5*size + 0.3*fg + 0.2*aspect ; neu q < 0.5 -> bo mau\n  hist <- hsv_histogram(frame, box, mask_fg)        # 416 chieu\n  tracklet.update(hist, frame)                      # moi 3 frame, toi da 12\n  appearance <- 0.75*appearance + 0.25*hist         # EMA same-camera\n\nKHI GAN GID / TRACK HET HAN (cross_camera_manager):\n  gid_gallery   <- merge(local_gallery, cap 24, dedupe 0.015)\n  cam_gallery   <- merge vao camera_appearance_samples[cam]\n\nSO KHOP (compare_tracklets):\n  pairwise[i,j] <- bhattacharyya(mau_i, mau_j)\n  distance <- 0.5*median_nn(gallery nho) + 0.2*median_nn(doi xung)\n             + 0.2*d(aggregate) + 0.1*mean(3 cap tot nhat)\n  neu gallery rong -> distance = 0.25, support = 0 (se bi gate loai)"
  });
})();
