/* brightness.js — Trang 4: bù đổi sáng & cast-shadow discrimination.
 * Nguồn số liệu đã xác minh: .analysis/algo-web-v2-redesign/notes/brightness.md
 */
(function () {
  "use strict";
  TG.definePage({
    id: "brightness",
    group: "single-cam",
    title: "Brightness & cast shadow",
    navLabel: "Brightness",
    order: 4,
    prev: "homography",
    next: "motion-detection",

    /* ① Chức năng & vị trí */
    fn: {
      text: "Đổi sáng là nguồn motion giả lớn nhất trong pipeline. Trang này kể ba lớp phòng thủ xếp chồng trong detection một camera. Chúng gồm bù độ lệch sáng toàn khung trước frame difference, nhãn shadow sẵn có của [[MOG2]], và bài kiểm per-blob phân biệt [[cast shadow]] với xe."
    },

    /* ② Vì sao cần */
    why: {
      paras: [
        "Camera điện thoại tự động đổi exposure khi cảnh thay đổi. Một lần tăng exposure làm mọi pixel sáng lên cùng lúc — không bù thì frame difference đọc đó là chuyển động toàn khung và sinh hàng trăm detection giả.",
        "Hướng ngược lại cũng nguy hiểm: khi exposure tăng, xe đồ chơi tối trên mặt đường xám hay bị [[MOG2]] đánh dấu là shadow. Comment trong code ghi rõ ngưỡng cũ đã xoá vĩnh viễn thân xe. Đó là lý do tồn tại lớp kiểm riêng."
      ]
    },

    /* ③ Cách hoạt động */
    how: [
      {
        id: "3.1",
        name: "Bù lệch sáng toàn khung trên lưới mẫu thưa",
        paras: [
          "Trước mỗi phép trừ frame, tracker ước lượng độ lệch sáng toàn cục: median của hiệu grey-level giữa frame hiện tại và frame tham chiếu.",
          "Median không tính trên toàn ảnh — chỉ trên một lưới mẫu thưa với bước min(h, w) chia 128. Comment code giải thích: median đầy đủ tốn khoảng 17 ms và chạy hai lần mỗi frame, chiếm một phần ba ngân sách frame.",
          "Lưới mẫu tái tạo median đó trong vòng dưới một grey level với khoảng 0.3 ms. Frame tham chiếu được cộng độ lệch trước khi absdiff, nên thay đổi exposure đều khắp ảnh triệt tiêu."
        ],
        values: [
          { k: "ước lượng shift", v: "median(sampled_cur − sampled_ref)", kind: "runtime", src: "backend/main_detect/src/techgar/motion_tracker.py:473-484" },
          { k: "mật độ lưới", v: "target 128 → step = min(h,w)//128", kind: "class-default", src: "backend/main_detect/src/techgar/motion_tracker.py:470" },
          { k: "bù trước diff", v: "reference += shift, rồi absdiff + threshold", kind: "runtime", src: "backend/main_detect/src/techgar/motion_tracker.py:450-461" }
        ]
      },
      {
        id: "3.2",
        name: "MOG2 detectShadows và pixel giá trị 127",
        paras: [
          "[[MOG2]] học background với history bảy trăm frame và detectShadows bật. Output của nó có ba loại pixel: 255 foreground chắc chắn, 127 nghi là shadow, 0 background.",
          "Pipeline giữ ngưỡng trên 200 cho foreground chắc chắn. Pixel 127 chỉ được nhập lại vào mask khi cờ reject_cast_shadows bật và đã có background học được — nếu không chúng bị loại như background.",
          "Đây là đánh đổi có chủ đích. Mở lại pixel nghi-shadow cứu được thân xe tối, nhưng cũng mở đường cho vùng tối không-phải-xe. Bài kiểm per-blob phía sau là lưới an toàn."
        ],
        values: [
          { k: "MOG2 config", v: "history=700, varThreshold=32, detectShadows=True", kind: "runtime", src: "backend/main_detect/src/techgar/motion_tracker.py:203" },
          { k: "foreground chắc", v: "raw_mask > 200", kind: "runtime", src: "backend/main_detect/src/techgar/motion_tracker.py:769-771" },
          { k: "admit 127", v: "reject_cast_shadows + background tồn tại", kind: "runtime", src: "backend/main_detect/src/techgar/motion_tracker.py:780-789" },
          { k: "runtime flags", v: "reject_cast_shadows=True, multiscale=True", kind: "runtime", src: "backend/main_detect/two_camera.py:2393-2394" }
        ]
      },
      {
        id: "3.3",
        name: "Bài kiểm vật lý: attenuation, chromaticity, residual",
        paras: [
          "Một [[cast shadow]] thật xấp xỉ nhân mọi kênh màu của mặt đường với một hệ số tối đi duy nhất — giữ nguyên chromaticity và texture. Vật thể thật thì che texture, đổi màu, hoặc tối hơn dải hệ số cho phép.",
          "Với mỗi blob đủ lớn, code đo ba đại lượng. Attenuation là median tỉ lệ luminance hiện tại trên background; chromaticity_distance đo lệch màu chuẩn hoá; scaled_residual đo phần sáng không giải thích được.",
          "Blob chỉ bị reject khi cả bốn điều kiện cùng thoả ngưỡng. Thiếu background hoặc blob quá nhỏ thì fail-open — không bao giờ reject."
        ],
        values: [
          { k: "dải attenuation shadow", v: "[0.32, 0.62]", kind: "class-default", src: "backend/main_detect/src/techgar/motion_tracker.py:63" },
          { k: "chroma / residual / explained", v: "≤0.10 / ≤0.08 / ≥0.75", kind: "class-default", src: "backend/main_detect/src/techgar/motion_tracker.py:64-66" },
          { k: "pixel tối thiểu", v: "≥120 px hợp lệ & ≥60% blob", kind: "runtime", src: "backend/main_detect/src/techgar/motion_tracker.py:656-667" },
          { k: "luminance weights", v: "BGR [0.114, 0.587, 0.299]", kind: "class-default", src: "backend/main_detect/src/techgar/motion_tracker.py:661" }
        ]
      },
      {
        id: "3.4",
        name: "Background snapshot và telemetry",
        paras: [
          "Bài kiểm cần ảnh background đã học của MOG2. Vì snapshot tốn 6 đến 12 ms, một bản được cache và dùng lại trong mười frame.",
          "Snapshot luôn được lấy trước khi apply frame tạo ra nó — bài kiểm không bao giờ so một chiếc xe với background đã chứa chính chiếc xe đó.",
          "Mỗi blob bị loại ghi vào _last_shadow_rejections và xuất hiện trong telemetry loại cast_shadow_rejected. Blob qua được nhưng chứa pixel 127 đáng kể được đánh cờ dark_foreground_rescued."
        ],
        values: [
          { k: "cache background", v: "refresh mỗi 10 frame, chụp trước apply", kind: "runtime", src: "backend/main_detect/src/techgar/motion_tracker.py:728-757" },
          { k: "reject telemetry", v: "cast_shadow_rejected + xoá contour", kind: "runtime", src: "backend/main_detect/src/techgar/motion_tracker.py:1053-1063" },
          { k: "dark_rescued", v: "≥20 marker px & tỉ lệ ≥0.08", kind: "runtime", src: "backend/main_detect/src/techgar/motion_tracker.py:1040-1045" }
        ]
      }
    ],

    /* ④ Số liệu & công thức */
    formulas: [
      {
        name: "Độ lệch sáng toàn khung",
        expr: "shift = median(cur[i] − ref[i]) trên lưới i ≡ step",
        subst: "1280×720 → step = 720//128 = 5",
        result: "≈ 37 nghìn mẫu, ~0.3 ms",
        note: "median đầy đủ ~17 ms ×2/frame — lưới mẫu rẻ hơn ~50 lần với sai số dưới 1 grey level (comment code)",
        src: "backend/main_detect/src/techgar/motion_tracker.py:463-484"
      },
      {
        name: "Ngưỡng shadow per-blob",
        expr: "0.32 ≤ atten ≤ 0.62 ∧ chroma ≤ 0.10 ∧ resid ≤ 0.08 ∧ explained ≥ 0.75",
        subst: "atten 0.45, chroma 0.05, resid 0.04, explained 0.9",
        result: "→ reject cast_shadow",
        note: "cả bốn điều kiện AND; fail-open khi thiếu background hoặc blob nhỏ",
        src: "backend/main_detect/src/techgar/motion_tracker.py:717-725"
      }
    ],
    params: [
      { name: "MOG2 history / varThreshold", value: "700 / 32", kind: "runtime", role: "độ dài học background và ngưỡng phân loại của subtractor", src: "backend/main_detect/src/techgar/motion_tracker.py:203" },
      { name: "shadow marker value", value: "127", kind: "runtime", role: "giá trị pixel MOG2 gán cho nghi-shadow; chỉ admit khi reject_cast_shadows", src: "backend/main_detect/src/techgar/motion_tracker.py:772-784" },
      { name: "shadow_attenuation_range", value: "(0.32, 0.62)", kind: "class-default", role: "dải hệ số tối được coi là bóng đổ", src: "backend/main_detect/src/techgar/motion_tracker.py:63" },
      { name: "shadow chroma / residual / explained", value: "0.10 / 0.08 / 0.75", kind: "class-default", role: "ba ngưỡng còn lại của bài kiểm per-blob", src: "backend/main_detect/src/techgar/motion_tracker.py:64-66" },
      { name: "shadow_min_pixels", value: "120", kind: "class-default", role: "số pixel hợp lệ tối thiểu để chạy kiểm tra; dưới mức này fail-open", src: "backend/main_detect/src/techgar/motion_tracker.py:67" },
      { name: "_background_refresh_interval", value: "10 frame", kind: "class-default", role: "tuổi cache của snapshot background dùng cho shadow test", src: "backend/main_detect/src/techgar/motion_tracker.py:734" }
    ],

    /* ⑤ Hình thật */
    figures: [
      {
        src: "assets/real/brightness-high-exposure.jpg",
        alt: "Frame cam2 session sang8 exposure rất cao, xe tối được đánh khung",
        caption: "sang8 cam2 f600 (frame gốc + chú thích): exposure cao rõ rệt. Đúng kịch bản code comment cảnh báo: xe tối trên mặt đường xám hay bị MOG2 gán nhãn 127 shadow.",
        origin: "session_hiep_sang8/f600/cam2"
      },
      {
        src: "assets/real/brightness-normal-exposure.jpg",
        alt: "Frame cam1 session thai1 exposure bình thường với xe đang chạy trong làn",
        caption: "thai1 cam1 f1500 (frame gốc + chú thích): cùng hệ thống nhưng exposure vừa. Độ sáng khác biệt lớn giữa các session là lý do bù shift toàn khung phải chạy mỗi phép trừ frame.",
        origin: "session_hiep_thai1/f1500/cam1"
      }
    ],
    noFigureReason: null,

    /* ⑥ Giới hạn & lỗi thật */
    limits: [
      {
        text: "Bù sáng là một scalar duy nhất cho toàn khung hình. Đổi sáng cục bộ như đèn hắt một góc không được mô hình. Vùng đó vẫn đọc là motion (suy luận từ thiết kế median toàn cục)."
      },
      {
        text: "Fail-open là lựa chọn có chủ đích. Background chưa học đủ hay blob dưới 120 pixel hợp lệ đều khiến bài kiểm bỏ qua. Blob bóng đi qua, đổi lại xe thật không bị xoá nhầm."
      },
      {
        text: "Mở lại pixel 127 là dao hai lưỡi được ghi trong comment: cứu được xe tối nhưng cũng cho vùng tối không-phải-xe quay vào foreground. Toàn bộ gánh nặng dồn lên bài kiểm per-blob phía sau."
      },
      {
        text: "Lớp phòng thủ này chỉ xử lý ánh sáng, không phải bộ lọc đối tượng. Cột gỗ và tay người trong session bt vẫn thành detection (E-C-007) — chúng đúng là foreground thật. Mã E-* là finding của chiến dịch verify-replay; danh mục đầy đủ ở trang failure-gallery.",
        evidence: { session: "bt", status: "CONFIRMED" }
      }
    ],

    /* ⑦ Nguồn */
    sources: [
      { ref: "backend/main_detect/src/techgar/motion_tracker.py:203", kind: "runtime", note: "MOG2 history=700, varThreshold=32, detectShadows=True" },
      { ref: "backend/main_detect/src/techgar/motion_tracker.py:450-461", kind: "runtime", note: "_motion_between: bù shift trước absdiff" },
      { ref: "backend/main_detect/src/techgar/motion_tracker.py:463-484", kind: "class-default", note: "_brightness_shift lưới mẫu 128 + comment perf 17ms→0.3ms" },
      { ref: "backend/main_detect/src/techgar/motion_tracker.py:527-531", kind: "class-default", note: "docstring: trừ shift để không coi phơi sáng là xe" },
      { ref: "backend/main_detect/src/techgar/motion_tracker.py:633-703", kind: "runtime", note: "_cast_shadow_metrics: attenuation/chroma/residual/explained" },
      { ref: "backend/main_detect/src/techgar/motion_tracker.py:705-726", kind: "runtime", note: "_is_cast_shadow: 4 điều kiện AND" },
      { ref: "backend/main_detect/src/techgar/motion_tracker.py:728-757", kind: "runtime", note: "background snapshot cache 10 frame, chụp trước apply" },
      { ref: "backend/main_detect/src/techgar/motion_tracker.py:769-789", kind: "runtime", note: ">200 definite fg + admit 127 có điều kiện + comment xe tối" },
      { ref: "backend/main_detect/src/techgar/motion_tracker.py:1040-1063", kind: "runtime", note: "dark_foreground_rescued + shadow rejection telemetry" },
      { ref: "backend/main_detect/src/techgar/motion_tracker.py:2243-2245", kind: "runtime", note: "loại cast_shadow_rejected trong debug telemetry" },
      { ref: "backend/main_detect/two_camera.py:2393-2394", kind: "runtime", note: "runtime bật reject_cast_shadows + multiscale motion" }
    ],
    pseudocode: "MOI FRAME:\n  shift = median(luoi_mau(cur) - luoi_mau(ref))   # ~0.3ms\n  ref_bu = clip(ref + shift, 0, 255)\n  motion = threshold(absdiff(cur, ref_bu), thr)\n\n  raw = MOG2.apply(frame)   # history=700, detectShadows\n  fg_chac = raw > 200\n  neu reject_cast_shadows & co background:\n    fg = fg_chac | (raw == 127)    # mo lai pixel nghi-shadow\n\nMOI BLOB (khi reject_cast_shadows):\n  atten = median(lum_cur / lum_bg)\n  neu 0.32<=atten<=0.62 & chroma<=0.10 & resid<=0.08 & explained>=0.75:\n    reject cast_shadow, xoa contour\n  thieu background/blob nho -> fail-open, giu blob"
  });
})();
