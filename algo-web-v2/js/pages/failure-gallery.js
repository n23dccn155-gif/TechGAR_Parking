/* failure-gallery.js — Trang 23: Bảo tàng lỗi đã xác nhận từ chiến dịch verify-replay.
 * Nguồn bằng chứng: .analysis/verify-replay/ERRORS-SUMMARY.md (canonical V6)
 * Mỗi khối: hiện tượng / bằng chứng session+frame+cam / cơ chế nghi (ghi "suy luận" khi chưa chứng minh bằng code)
 */
(function () {
  "use strict";
  TG.definePage({
    id: "failure-gallery",
    group: "data",
    title: "Bảo tàng lỗi — các failure mode đã xác nhận trên dữ liệu thật",
    navLabel: "Failure gallery",
    order: 23,
    prev: "replay-ground-truth",
    next: null,

    /* ① Chức năng & vị trí */
    fn: {
      text: "Trang cuối của site là bảng danh mục các failure mode mà chiến dịch verify-replay đã chứng minh bằng frame thật. Mỗi mục ghi hiện tượng, bằng chứng theo session và cơ chế nghi ngờ — kèm nhãn độ tin cậy."
    },

    /* ② Vì sao cần */
    why: {
      paras: [
        "Một pipeline chỉ đáng tin khi người đọc biết nó hỏng ở đâu. Các trang trước mô tả cơ chế khi hoạt động đúng; trang này gom phần ngược lại thành một danh mục duy nhất.",
        "Mỗi lỗi được neo vào bằng chứng cụ thể gồm tên session, số frame và camera. Không có mục nào chỉ là lời kể — mục nào cũng trỏ được về frame hoặc event thật trong replay.",
        "Nhãn độ tin cậy tách ba mức rõ ràng. CONFIRMED là hiện tượng có trong dữ liệu, UNSURE là cơ chế chưa chứng minh, EXPECTED là hành vi đúng thiết kế dù trông giống lỗi."
      ]
    },

    /* ③ Cách hoạt động */
    how: [
      {
        id: "3.1",
        name: "F1 · DUPLICATE_TRACK — hai local track trên cùng một xe — CONFIRMED",
        paras: [
          "Hiện tượng: một chiếc xe thật bị hai local track cùng bám, hai khung chồng nhau với IoU cao. Tracker nhận cả hai làm đối tượng riêng.",
          "Bằng chứng: test1 cam2 f100 có lid111 nhân lid120 với IoU 0.57. Đếm trong các cửa sổ event được cờ: thai4 cam1 bốn cụm f317 đến f5761 IoU 0.24 đến 0.87. Thai3 chín cụm cam1 và mười cặp cam2 IoU tới 0.99; thai6 có cặp bbox trùng hệt.",
          "Cơ chế nghi (suy luận): bài toán merge-split — một detection bị tách thành hai track hoặc track mới sinh trên xe đã có track. Hệ quả tới ô đỗ bằng 0: toàn bộ cặp đều gid NULL nên slot integrity vẫn pass."
        ],
        figure: {
          src: "assets/real/failure-dup-track.jpg",
          alt: "Hai frame thai3 cam1: xe xanh đang chạy bị hai local track cùng bám — lid9 và lid10 chồng lên nhau",
          caption: "DUPLICATE_TRACK trên frame thật (thai3 ~f1350): một chiếc xe nhưng hai nhãn lid9 và lid10 cùng tồn tại, kéo dài qua nhiều frame.",
          origin: "verify_replay/f1350/cam1"
        },
        values: [
          { k: "số cụm lớn (quét toàn session)", v: "41 cặp thai3 + 59 cặp thai4", kind: "runtime", src: ".analysis/verify-replay/ERRORS-SUMMARY.md" },
          { k: "slot conflict", v: "0 (cặp đều gidNULL)", kind: "runtime", src: ".analysis/verify-replay/ERRORS-SUMMARY.md" }
        ]
      },
      {
        id: "3.2",
        name: "F2 · Phantom coasting burst — box ma trên nền trống — CONFIRMED",
        paras: [
          "Hiện tượng: cụm track mới ở trạng thái coasting hoặc new xuất hiện trên vùng sàn trống, không có xe nào bên dưới. Chúng sống ngắn rồi tự chết sau vài chục đến hai trăm frame.",
          "Bằng chứng: tám instance trên sáu session — thai5 ba đợt f392 đến f1790, sang8 f882 đến f925, thai8 và toi5 và bt ngay đầu video. toi4 cam2 f51 một lúc hai mươi tư box.",
          "Cơ chế nghi (suy luận): bộ morphology sau motion burst hoặc startup sinh detection ảo. Vòng đời track cho phép chúng sống đủ lâu để hiện lên trước khi hết hạn."
        ],
        figure: {
          src: "assets/real/failure-coasting-burst.jpg",
          alt: "Frame toi4 cam2 f51: hàng chục khung coasting gidNULL rải trên nền sàn trống không có xe",
          caption: "Phantom coasting burst (toi4 cam2 f51): các box vàng 'coasting' xuất hiện đồng loạt trên sàn trống, tự chết sau vài chục frame.",
          origin: "verify_replay/f51/cam2"
        },
        values: [
          { k: "pattern", v: "8 instance / 6 session, fvc≤10, inv≤40", kind: "runtime", src: ".analysis/verify-replay/ERRORS-SUMMARY.md" },
          { k: "tự chết sau", v: "44 – 238 frame", kind: "runtime", src: ".analysis/verify-replay/ERRORS-SUMMARY.md" }
        ]
      },
      {
        id: "3.3",
        name: "F3 · FALSE_DETECTION — vật thật không phải xe — CONFIRMED",
        paras: [
          "Hiện tượng: detector gắn track lên vật thể thật nhưng không phải xe — cột gỗ, tay người vận hành, chữ watermark trên tường.",
          "Bằng chứng: session bt có ba lid cột gỗ sống tới hết video trên cả hai cam. thai7 cam2 f2851 là tay operator. thai6 cam2 có lid14 sống tám mươi tám frame trên chữ droidcam.app với roi_support chỉ 0.08 đến 0.15.",
          "Cơ chế nghi (suy luận): pipeline motion-based không có bộ phân loại đối tượng — mọi vùng chuyển động đủ lớn đều là ứng viên xe. Harm dừng ở tầng detection vì các track này không được cấp gid."
        ],
        values: [
          { k: "harm", v: "chỉ detection-level, gid NULL", kind: "runtime", src: ".analysis/verify-replay/ERRORS-SUMMARY.md" }
        ]
      },
      {
        id: "3.4",
        name: "F4 · ID fragmentation — xe đổi local id hàng loạt — CONFIRMED",
        paras: [
          "Hiện tượng: một xe bị tracker mất dấu rồi tái sinh id mới liên tiếp, sinh burst tentative và lost trong vài chục frame.",
          "Bằng chứng: toi6 f97 đến f130 có năm mươi ba tentative cộng chín lost trong một đợt; f596 đến f612 burst thứ hai cùng signature. sang8 cam2 f129 đến f889 xe mép ROI bị re-id ít nhất mười lần.",
          "Cơ chế nghi (suy luận): liên quan local-lifecycle ở biên ROI. May cho output là occupancy latch khoảng ba mươi frame nên trạng thái ô đỗ cuối cùng không hỏng."
        ],
        values: [
          { k: "burst toi6", v: "53 tentative + 9 lost (f97–130)", kind: "runtime", src: ".analysis/verify-replay/ERRORS-SUMMARY.md" },
          { k: "re-id sang8", v: "≥10 lần, f129–889 cam2", kind: "runtime", src: ".analysis/verify-replay/ERRORS-SUMMARY.md" }
        ]
      },
      {
        id: "3.5",
        name: "F5 · E-C-002 — mất GID lineage qua handoff-dormant — CONFIRMED / harm UNSURE",
        paras: [
          "Hiện tượng: một xe đã có gid ổn định bị cấp gid mới ngay vị trí cũ — hai gid tồn tại kế nhau trên cùng một xe vật lý.",
          "Bằng chứng: sang8 có gid1 từ cam2 (xe đen đang đỗ) rồi gid3 xuất hiện lệch chỉ chín pixel. Kiểm tra mật độ khoảng trống chứng minh không có xe thứ hai — đây là mất lineage thật, không phải hai xe sát nhau.",
          "Cơ chế (CONFIRMED, truy vết tới code): dormant pass từ chối lid40 vì quá cửa sổ same_camera_stale ở 50.078 giây. World-ReID sau đó chấm trajectory score 0.6683 dưới ngưỡng 0.78 nên new-lineage fallback mint gid3. Harm đánh giá UNSURE vì trạng thái ô đỗ không đổi."
        ],
        values: [
          { k: "cặp gid", v: "gid1 → gid3, lệch ±9 px, cùng xe", kind: "runtime", src: ".analysis/verify-replay/ERRORS-SUMMARY.md" },
          { k: "harm", v: "UNSURE (slot occupancy không đổi)", kind: "runtime", src: ".analysis/verify-replay/ERRORS-SUMMARY.md" }
        ]
      },
      {
        id: "3.6",
        name: "F6 · Capture gap — mất frame trong video gốc — CONFIRMED (dữ liệu)",
        paras: [
          "Hiện tượng: một số frame bị mất trong file ghi gốc — timeline nhảy khúc giữa hai frame liên tiếp.",
          "Bằng chứng: toi5 f95 đến f96, thai7 f2194 đến f2195, thai4 f2442 đến f2443 và lớn nhất là thai1 f973 đến f974 mất khoảng 6.7 giây.",
          "Cơ chế: lỗi ở tầng ghi hình ban đầu chứ không phải replay. Pipeline replay vẫn kiểm soát được vì frame_timestamps.csv định nghĩa nhịp — nhưng quan sát thật của xe trong khoảng gap là không thể phục hồi."
        ],
        values: [
          { k: "gap lớn nhất", v: "thai1 f973–974 ≈ 6.7 s", kind: "runtime", src: ".analysis/verify-replay/ERRORS-SUMMARY.md" }
        ]
      },
      {
        id: "3.7",
        name: "F7 · Xe đỗ sẵn từ trước session — không có track — EXPECTED",
        paras: [
          "Hiện tượng: xe đỗ yên từ trước khi quay không hề có track và không được gán gid, dù ô đó đang occupied.",
          "Bằng chứng: cờ SLOT_BINDING_ERROR xuất hiện ở f1 đến f61 của mọi session — vision vẫn báo ô occupied đúng trong khi phía tracking không có xe nào để gán.",
          "Cơ chế: đây là giới hạn thiết kế của pipeline motion-based. Không chuyển động thì không có detection để mở track — vision occupancy và tracking identity là hai kênh tách biệt đúng chủ đích. Đây là EXPECTED, không phải defect."
        ],
        values: [
          { k: "dấu hiệu", v: "SLOT_BINDING_ERROR f1–61 mọi session", kind: "runtime", src: ".analysis/verify-replay/ERRORS-SUMMARY.md" }
        ]
      }
    ],

    /* ④ Tham số & công thức */
    formulas: [
      {
        name: "Điều kiện kết luận CONFIRMED",
        expr: "hiện tượng nhìn thấy trên frame + có finding code E-*",
        subst: "ví dụ E-B-009: 10 cặp IoU 0.53–0.96 thai3 cam2",
        result: "CONFIRMED — hiện tượng có thật, hệ quả có thể UNSURE",
        note: "nhãn dán cho hiện tượng; harm và cơ chế đánh giá riêng",
        src: ".analysis/verify-replay/ERRORS-SUMMARY.md"
      }
    ],
    params: [
      { name: "nhóm CONFIRMED", value: "6 nhóm", kind: "runtime", role: "dup-track, ghost burst, false-det, fragment, gid-lineage, capture gap", src: ".analysis/verify-replay/ERRORS-SUMMARY.md" },
      { name: "S1 được chứng minh", value: "0", kind: "runtime", role: "không case slot-claim sai hay mất xe vĩnh viễn trong phần đã xem", src: ".analysis/verify-replay/ERRORS-SUMMARY.md" },
      { name: "finding còn UNSURE", value: "6 nhóm mở", kind: "runtime", role: "floor-vs-car, coasting boundary, new-ID pattern, anchor ngoài ROI, GID nhầm xe, hiep2 partial", src: ".analysis/verify-replay/ERRORS-SUMMARY.md" },
      { name: "type-FP khi audit chéo", value: "~1/6", kind: "runtime", role: "cờ scanner so pixel bị bác bằng ảnh ~1 trên 6 (B-side)", src: ".analysis/verify-replay/ERRORS-SUMMARY.md" }
    ],

    /* ⑤ Hình thật */
    figures: [],
    noFigureReason: "Hai ảnh bằng chứng được đặt ngay trong khối F1 (duplicate track) và F2 (coasting burst) ở mục ③ — gallery này không có hình tổng quan riêng vì mỗi lỗi đi kèm frame chứng minh của chính nó.",

    /* ⑥ Giới hạn & lỗi thật */
    limits: [
      { text: "Danh mục này là lỗi đã thấy trong phần replay đã rà soát, không phải danh sách đầy đủ. Tám mươi phần trăm frame chưa qua mắt người có thể còn dạng lỗi khác.", evidence: { status: "CONFIRMED" } },
      { text: "Harm của phần lớn lỗi là UNVERIFIED vì ground truth chưa được điền. Không kết luận được tỷ lệ đổi ID hay độ chính xác toàn hệ thống.", evidence: { status: "CONFIRMED" } },
      { text: "Các cơ chế ghi 'suy luận' là giả thuyết từ chữ ký event, chưa truy vết ngược vào code. Riêng F5 đã có truy vết tới dòng gây ra.", evidence: { status: "CONFIRMED" } },
      { text: "Sáu nhóm finding vẫn mở cần thêm bằng chứng. Gồm floor-vs-car ~26 lids, coasting biên ROI, pattern new-ID, anchor ngoài ROI, GID nghi nhầm xe sang7 và handoff hiep2.", evidence: { status: "UNSURE" } }
    ],

    /* ⑦ Nguồn */
    sources: [
      { ref: ".analysis/verify-replay/ERRORS-SUMMARY.md", kind: "runtime", note: "canonical: 6 nhóm CONFIRMED + UNSURE + EXPECTED" },
      { ref: ".analysis/verify-replay/ERRORS-A.md", kind: "runtime", note: "finding A-side: E-A-* test1/hiep2/thai5/thai6/toi4/sang9" },
      { ref: ".analysis/verify-replay/ERRORS-B.md", kind: "runtime", note: "finding B-side: E-B-* thai3/thai4/toi6" },
      { ref: ".analysis/verify-replay/ERRORS-C.md", kind: "runtime", note: "finding C-side: E-C-* sang8/bt/thai7/thai8/toi5" },
      { ref: ".analysis/verify-replay/sheets/session_hiep_thai3_events/sheet_0021.jpg", kind: "runtime", note: "frame dup-track lid9+lid10" },
      { ref: ".analysis/verify-replay/sheets/session_hiep_toi4/sheet_0003.jpg", kind: "runtime", note: "frame coasting burst f51" },
      { ref: ".analysis/gid-reacquire/F0-a-codepath.md", kind: "runtime", note: "truy vết E-C-002 tới code: same_camera_stale 50.078s → score 0.6683<0.78 → new-lineage mint gid3" }
    ]
  });
})();
