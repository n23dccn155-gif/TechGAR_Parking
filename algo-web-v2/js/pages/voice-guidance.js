/* voice-guidance.js — Trang 20: Chỉ dẫn giọng nói + cảnh báo lạc tuyến.
 * Nguồn số liệu đã xác minh: .analysis/algo-web-v2-redesign/notes/voice-guidance.md
 * Mô tả code frontend ở chế độ đọc — trang này không sao chép logic.
 */
(function () {
  "use strict";
  TG.definePage({
    id: "voice-guidance",
    group: "gate-frontend",
    title: "Chỉ dẫn giọng nói và cảnh báo lạc tuyến",
    navLabel: "Voice guidance",
    order: 20,
    prev: "routing-astar",
    next: "predictions-jsonl",

    /* ① Chức năng & vị trí */
    fn: {
      text: "Tuyến đường chỉ là đường kẻ trên màn hình; trang này là lớp biến nó thành hành vi. Nó quyết định câu chỉ dẫn nào được nói ra, khi nào được phép cắt câu đang đọc và khi nào phải hét lên vì xe đã [[off-route]]."
    },

    /* ② Vì sao cần */
    why: {
      paras: [
        "Tài xế đang lái xe không thể nhìn bản đồ liên tục. Nếu chỉ dẫn là văn bản thuần thị giác thì lớp này có thể bỏ qua, nhưng cảnh báo sai đường thì không được phép chậm.",
        "Đồng thời đọc liên tục cũng vô nghĩa: mỗi nhịp cập nhật vị trí đều có thể sinh một câu mới. Không có bộ chặn tần suất thì tài xế nghe một dòng chữ rời rạc thay vì chỉ dẫn.",
        "Vì vậy lớp này tách hai bài toán. Một là chọn nội dung câu từ hình học của tuyến. Hai là quyết định phát hay im qua một bộ quy tắc thời gian đơn giản."
      ]
    },

    /* ③ Cách hoạt động */
    how: [
      {
        id: "3.1",
        name: "getNavigationInstruction — chọn câu từ hình học tuyến",
        paras: [
          "Kiểm tra đến đích trước. Xe vào bán kính ba mươi lăm đơn vị bản đồ quanh điểm cuối tuyến thì phát câu đến đích. Câu đó có biến thể riêng cho cổng ra và cho ô đỗ.",
          "Chưa đến thì tìm điểm tuyến gần xe nhất. Nếu xe đứng giữa tuyến, so sánh vector đoạn vừa đi với vector đoạn kế: góc lệch nhỏ hơn khoảng hai mươi độ thì đọc 'đi thẳng'.",
          "Góc lớn hơn thì dùng tích có hướng quyết định trái hay phải. Trong hệ SVG với trục Y đi xuống, tích có hướng dương nghĩa là rẽ phải theo thực tế lái xe.",
          "Xe còn ở đầu tuyến thì quét bộ ba điểm đầu để tìm khúc cua sắp tới. Khúc cua xa hơn một trăm năm mươi đơn vị được coi là chưa cần báo và câu mặc định là đi thẳng."
        ],
        values: [
          { k: "bán kính đến đích", v: "< 35 đơn vị bản đồ", kind: "runtime", src: "frontend/src/routing/voiceGuidance.ts:126-138" },
          { k: "ngưỡng 'đi thẳng'", v: "cos > 0.93 (~<20°)", kind: "runtime", src: "frontend/src/routing/voiceGuidance.ts:170-182" },
          { k: "quyết định trái/phải", v: "dấu tích có hướng, Y-xuống", kind: "runtime", src: "frontend/src/routing/voiceGuidance.ts:177-189" },
          { k: "lookahead khúc cua", v: "≤ 150 đơn vị bản đồ", kind: "runtime", src: "frontend/src/routing/voiceGuidance.ts:213-218" }
        ]
      },
      {
        id: "3.2",
        name: "checkIsOffRoute — đo lạc tuyến bằng hình học",
        paras: [
          "Khoảng cách từ xe tới tuyến là khoảng cách vuông góc nhỏ nhất tới mọi đoạn của tuyến. Vượt ngưỡng thì App coi xe đã rời đường chỉ dẫn.",
          "Ngưỡng mặc định của hàm là bảy mươi lăm đơn vị bản đồ, nhưng App truyền tám mươi tại call site. Tài liệu kiến trúc ghi bảy mươi lăm — con số thực thi là tám mươi.",
          "Lạc tuyến kích hoạt ba thứ cùng lúc: banner cảnh báo đỏ, câu nói urgent và việc tính lại tuyến từ vị trí hiện tại. Khi route có ít hơn hai điểm, hàm luôn trả không-lạc-tuyến."
        ],
        values: [
          { k: "ngưỡng thực thi", v: "80 (App override)", kind: "runtime", src: "frontend/src/app/App.tsx:746-750" },
          { k: "ngưỡng default", v: "75 (chữ ký hàm)", kind: "runtime", src: "frontend/src/routing/voiceGuidance.ts:98" },
          { k: "độ đo", v: "min khoảng cách vuông góc tới đoạn", kind: "runtime", src: "frontend/src/routing/voiceGuidance.ts:91-107" }
        ]
      },
      {
        id: "3.3",
        name: "VoiceManager — bộ chặn tần suất của loa",
        paras: [
          "speak nhận text, cooldown và cờ urgent. Cùng một câu trong thời gian cooldown thì im lặng; câu khác muốn cắt câu đang đọc phải urgent hoặc đợi câu cũ được hai giây tuổi.",
          "Khi được phát, speechSynthesis bị cancel rồi nói câu mới bằng giọng vi-VN, tốc độ 0.95. Cờ isSpeaking chỉ hạ khi utterance kết thúc hoặc lỗi, nên không có tình trạng hai câu chồng nhau.",
          "Bốn ngữ cảnh gọi speak trong App. Chỉ dẫn rẽ là không urgent và phát mỗi nhịp vị trí. Cảnh báo lạc tuyến, thông báo đổi ô và xác nhận đã đỗ đều urgent. Mute và mọi chuyển cảnh lớn đều gọi stop để xóa hàng đợi."
        ],
        values: [
          { k: "cooldown câu thường", v: "6000 ms", kind: "runtime", src: "frontend/src/app/App.tsx:783" },
          { k: "cooldown cảnh báo lạc tuyến", v: "7000 ms", kind: "runtime", src: "frontend/src/app/App.tsx:762" },
          { k: "tuổi tối thiểu để bị cắt", v: "2000 ms (non-urgent)", kind: "runtime", src: "frontend/src/routing/voiceGuidance.ts:48-50" },
          { k: "giọng", v: "vi-VN, rate 0.95, pitch 1.0", kind: "runtime", src: "frontend/src/routing/voiceGuidance.ts:57-60" }
        ]
      }
    ],

    /* ④ Tham số & công thức */
    formulas: [
      {
        name: "Góc lệch tại khúc cua",
        expr: "cosθ = (u·v) / (|u||v|); thẳng khi cosθ > 0.93",
        subst: "u = đoạn vừa đi, v = đoạn kế tiếp",
        result: "θ ≲ 20° → 'đi thẳng'; lớn hơn → xét trái/phải",
        note: "0.93 tương đương góc lệch khoảng 20 độ (minh họa)",
        src: "frontend/src/routing/voiceGuidance.ts:169-182"
      },
      {
        name: "Hướng rẽ từ tích có hướng",
        expr: "cross = ux·vy − uy·vx",
        subst: "cross > 0 (SVG, Y xuống) → rẽ phải",
        result: "câu 'rẽ phải/trái' + hậu tố theo isExit",
        note: "dấu đảo ngược so với hệ toán học Y-lên vì tọa độ ảnh",
        src: "frontend/src/routing/voiceGuidance.ts:175-189"
      }
    ],
    params: [
      { name: "arrival radius", value: "35", kind: "runtime", role: "xe vào bán kính này quanh điểm cuối route thì phát câu đến đích", src: "frontend/src/routing/voiceGuidance.ts:126-131" },
      { name: "cos threshold", value: "0.93", kind: "runtime", role: "trên ngưỡng này coi hai đoạn liền nhau là đi thẳng", src: "frontend/src/routing/voiceGuidance.ts:180" },
      { name: "turn lookahead", value: "150", kind: "runtime", role: "khúc cua xa hơn mức này chưa cần báo — vẫn đọc đi thẳng", src: "frontend/src/routing/voiceGuidance.ts:215" },
      { name: "speak cooldown default", value: "6000 ms", kind: "runtime", role: "cùng câu trong khoảng này không phát lại", src: "frontend/src/routing/voiceGuidance.ts:31" },
      { name: "interrupt age", value: "2000 ms", kind: "runtime", role: "câu non-urgent chỉ cắt được câu đã đọc ít nhất hai giây", src: "frontend/src/routing/voiceGuidance.ts:48-50" }
    ],

    /* ⑤ Hình thật */
    figures: [
      {
        src: "assets/real/voice-guidance-map.jpg",
        alt: "Màn hình dẫn đường thật: thanh chỉ dẫn phía trên, vòng tròn bán kính đến đích ở cuối tuyến và góc cua nơi tuyến rẽ",
        caption: "Ba điểm mà logic giọng nói bám vào: thanh chỉ dẫn hiển thị câu, bán kính 35 quanh điểm cuối kích câu đến đích, góc cua quyết định câu rẽ.",
        origin: "frontend_artifacts/f0/cam0"
      }
    ],

    /* ⑥ Giới hạn & lỗi thật */
    limits: [
      { text: "Câu chỉ dẫn bám điểm tuyến gần nhất chứ không biết hướng xe thật. Xe lùi ngược chiều tuyến vẫn có thể nghe 'đi thẳng' nếu hình học khớp.", evidence: { status: "CONFIRMED" } },
      { text: "Ngưỡng lạc tuyến trong tài liệu kiến trúc là bảy mươi lăm còn call site thực thi là tám mươi. Hai con số lệch nhau tồn tại đồng thời trong repo.", evidence: { status: "CONFIRMED" } },
      { text: "Nếu trình duyệt thiếu speechSynthesis, cờ isSpeaking vẫn được bật mà không có câu nào phát. Câu non-urgent kế tiếp trong hai giây bị nuốt âm thầm.", evidence: { status: "CONFIRMED" } },
      { text: "Giọng vi-VN phụ thuộc bộ giọng cài sẵn của hệ điều hành. Trên thiết bị thiếu giọng Việt, trình duyệt rơi về giọng mặc định mà code không kiểm tra.", evidence: { status: "UNSURE" } }
    ],

    /* ⑦ Nguồn */
    sources: [
      { ref: "frontend/src/routing/voiceGuidance.ts:3-70", kind: "runtime", note: "VoiceManager: 4 luật chặn + utterance vi-VN" },
      { ref: "frontend/src/routing/voiceGuidance.ts:74-107", kind: "runtime", note: "distanceToSegment + checkIsOffRoute" },
      { ref: "frontend/src/routing/voiceGuidance.ts:114-231", kind: "runtime", note: "getNavigationInstruction: đích, góc cua, lookahead" },
      { ref: "frontend/src/app/App.tsx:746-785", kind: "runtime", note: "nhịp vị trí xe: off-route + instruction + speak" },
      { ref: "frontend/src/app/App.tsx:455-670", kind: "runtime", note: "các câu urgent: đổi ô, ô bị chiếm, đã đỗ" },
      { ref: "frontend/src/app/App.tsx:1042-1191", kind: "runtime", note: "mute toggle + điều kiện render navInstruction" }
    ]
  });
})();
