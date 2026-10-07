/* occlusion-watershed.js — Trang 9: OcclusionGuard + watershed split.
 * Nguồn số liệu đã xác minh: .analysis/algo-web-v2-redesign/notes/occlusion-watershed.md
 */
(function () {
  "use strict";
  TG.definePage({
    id: "occlusion-watershed",
    group: "single-cam",
    title: "Occlusion guard & watershed",
    navLabel: "Occlusion",
    order: 9,
    prev: "track-lifecycle",
    next: "tracklet-descriptor",
    interactive: "occlusion",

    /* ① Chức năng & vị trí */
    fn: {
      text: "Khi hai [[track]] đã quan sát sạch dây vào một blob duy nhất, OcclusionGuard đóng băng cả hai thay vì để một chiếc ăn luôn blob chung. Watershed sau đó thử tách blob thành hai vùng pixel thật theo vị trí dự đoán. Tách được thì nuôi lại đo, không thì hai xe cùng coast."
    },

    /* ② Vì sao cần */
    why: {
      paras: [
        "Docstring của module nói thẳng: không phép so màu nào chứng minh được một blob gộp thuộc về member nào. Gán blob chung cho một track thì xe kia mất ID — đó là nguồn swap chính.",
        "Nhưng để hai xe tối sát nhau tạo một blob là chuyện thường với morphology nối vùng. Giải pháp của code: giữ hai lineage riêng bằng hình học đã quan sát sạch, coast cả hai, và chỉ nối lại đo khi có bằng chứng tách thật."
      ]
    },

    /* ③ Cách hoạt động */
    how: [
      {
        id: "3.1",
        name: "Group dự báo: nhận ra cặp sắp dính trước khi nó dính",
        paras: [
          "Mỗi frame, guard xét cặp [[track]] đủ ba quan sát sạch và còn được nhìn trong ba giây. Hai cái đang chồng lớn hơn hai mươi phần trăm không thành group — vì đã không chứng minh được chúng là hai xe độc lập.",
          "Cặp đủ gần — khoảng trống giữa hai tâm dự đoán trừ nửa kích thước nhỏ hơn 0.4 lần đường chéo tham chiếu — được đăng ký thành inactive group. Group không được kích hoạt thì tự xoá khi hai tâm tách xa ba lần đường chéo."
        ],
        values: [
          { k: "điều kiện member", v: "≥3 clean_observations, còn nhìn ≤3 s", kind: "runtime", src: "backend/main_detect/src/techgar/occlusion_guard.py:66-72" },
          { k: "loại overlap", v: "inter > 0.20·min clean area → không group", kind: "runtime", src: "backend/main_detect/src/techgar/occlusion_guard.py:82-86" },
          { k: "đủ gần", v: "gap ≤ 0.4·max(hypot ref)", kind: "runtime", src: "backend/main_detect/src/techgar/occlusion_guard.py:87-90" },
          { k: "reference size", v: "median clean w/h (fallback track w/h)", kind: "runtime", src: "backend/main_detect/src/techgar/occlusion_guard.py:36-42" }
        ]
      },
      {
        id: "3.2",
        name: "Kích hoạt: một blob ôm trọn hai tâm",
        paras: [
          "Group bật active khi một detection box chứa trọn tâm dự đoán của mọi member, kèm pad 15 phần trăm. Diện tích box cũng phải ít nhất 1.6 lần diện tích tham chiếu trung vị.",
          "Check này chạy TRƯỚC các filter kích thước và appearance trong vòng contour. Comment nói rõ lý do: nếu không chúng sẽ xoá luôn bằng chứng duy nhất của hai xe bị che.",
          "Kích hoạt thì mọi member frozen: observation_kind thành occluded_prediction. Nhóm nhận hạn ba giây cộng vào lần đo sạch cuối của member cũ nhất — code lấy min trên các last_clean. Một blob mơ hồ không được phép giữ group sống vĩnh viễn."
        ],
        values: [
          { k: "điều kiện bao", v: "box chứa mọi center (pad 0.15·min ref) + area ≥1.6·median", kind: "runtime", src: "backend/main_detect/src/techgar/occlusion_guard.py:107-113" },
          { k: "vị trí check", v: "trước filter size/appearance (comment)", kind: "runtime", src: "backend/main_detect/src/techgar/motion_tracker.py:922-930" },
          { k: "expires", v: "last clean + 3.0 s (merged_reacquire)", kind: "runtime", src: "backend/main_detect/src/techgar/occlusion_guard.py:123-131" }
        ]
      },
      {
        id: "3.3",
        name: "Watershed: tách bằng pixel thật, không bịa hình",
        paras: [
          "Chỉ group hai member được chia. distanceTransform trên crop mask tìm pixel foreground. Seed của mỗi xe là pixel gần tâm dự đoán nhất — tâm trôi ra khỏi blob quá 0.25 đường chéo thì bỏ cuộc.",
          "Hai seed cách nhau dưới 0.2 lần kích thước nhỏ nhất cũng bỏ — chưa tách thật. cv2.watershed chạy trên chính frame crop, chia theo đường ranh giữa hai cực.",
          "Vùng kết quả phải đủ hai mươi điểm và bbox trong dải 0.35 đến 1.8 lần kích thước tham chiếu. Thành công thì mỗi xe nhận detection watershed_provisional với [[HSV histogram]] đo trên chính vùng đó."
        ],
        values: [
          { k: "seed", v: "pixel gần center dự đoán, ≤0.25·hypot(ref)", kind: "runtime", src: "backend/main_detect/src/techgar/occlusion_guard.py:161-169" },
          { k: "tách tối thiểu", v: "seed cách ≥0.2·min ref dims; ≥40 px fg", kind: "runtime", src: "backend/main_detect/src/techgar/occlusion_guard.py:158-171" },
          { k: "kiểm vùng", v: "≥20 điểm và bbox/ref ∈ [0.35, 1.8]", kind: "runtime", src: "backend/main_detect/src/techgar/occlusion_guard.py:180-187" },
          { k: "fallback", v: "không chia được → 1 detection ambiguous_merged", kind: "runtime", src: "backend/main_detect/src/techgar/motion_tracker.py:930-954" }
        ]
      },
      {
        id: "3.4",
        name: "Validate và nối lại: ba frame chứng minh",
        paras: [
          "Sau mỗi lần gán, một group active chỉ hợp lệ khi cả hai member được gán và phương án đúng thắng phương án đảo ít nhất hai lần margin. Không hợp lệ thì members giữ frozen và mọi detection dạng member bị chặn sinh fragment mới.",
          "Ba frame valid liên tiếp đóng group: occlusion_group_recovered. Vùng watershed thành watershed_validated nhưng appearance_trusted vẫn False. Hình học được phục hồi, còn bằng chứng màu chỉ quay lại sau một lần tách sạch tự nhiên.",
          "Ngay cả khi group hết hạn mà không tách được, blob chung vẫn bị cấm mint ID mới — veto sinh chứ không phải vé cho track cũ claim."
        ],
        values: [
          { k: "valid pair", v: "swapped − direct ≥ 2·margin ∧ direct < 1.2", kind: "runtime", src: "backend/main_detect/src/techgar/occlusion_guard.py:200-206" },
          { k: "recovery", v: "≥3 frame valid liên tiếp → recovered", kind: "runtime", src: "backend/main_detect/src/techgar/occlusion_guard.py:207-220" },
          { k: "appearance", v: "validated vẫn appearance_trusted=False", kind: "runtime", src: "backend/main_detect/src/techgar/occlusion_guard.py:217-219" },
          { k: "birth veto", v: "_unresolved_merged_birth chặn mint mới", kind: "runtime", src: "backend/main_detect/src/techgar/motion_tracker.py:364-380" }
        ]
      }
    ],

    /* ④ Số liệu & công thức */
    formulas: [
      {
        name: "Điều kiện kích hoạt group",
        expr: "∀ tid ∈ members: center(tid) ∈ box ± 0.15·min(ref) ∧ area(box) ≥ 1.6·median(ref_area)",
        subst: "hai xe 100×60 px → blob phải ≥ 9 600 px",
        result: "group active → cả hai coast occluded_prediction",
        note: "pad cho phép tâm nằm ngay mép box; blob bao một xe là đo bình thường",
        src: "backend/main_detect/src/techgar/occlusion_guard.py:102-121"
      },
      {
        name: "Chuỗi chặn của watershed",
        expr: "≥40 px fg ∧ seed ≤ 0.25·hypot(ref) ∧ seed cách ≥ 0.2·min(ref) ∧ vùng ≥ 20 đ ∧ bbox/ref ∈ [0.35,1.8]",
        subst: "một điều kiện sai → toàn phép chia fail",
        result: "về detection ambiguous_merged (hist=None)",
        note: "không tách được thì không ai được nhận — conservative by design",
        src: "backend/main_detect/src/techgar/occlusion_guard.py:150-189"
      }
    ],
    params: [
      { name: "timeout", value: "3.0 s", kind: "class-default", role: "guard timeout = merged_reacquire_max_seconds; cũng là trần tuổi clean obs", src: "backend/main_detect/src/techgar/occlusion_guard.py:26-27" },
      { name: "clean observations", value: "≥3 mẫu", kind: "runtime", role: "track phải có lịch sử sạch mới được làm member", src: "backend/main_detect/src/techgar/occlusion_guard.py:67-70" },
      { name: "coverage threshold", value: "1.6 × median ref area", kind: "runtime", role: "box phải to hơn đáng kể mới được coi là ôm hai xe", src: "backend/main_detect/src/techgar/occlusion_guard.py:111-113" },
      { name: "seed proximity", value: "0.25·hypot / 0.2·min", kind: "runtime", role: "tâm phải nằm sát blob và hai seed phải tách thật", src: "backend/main_detect/src/techgar/occlusion_guard.py:167-171" },
      { name: "region sanity", value: "≥20 pts, ratio [0.35, 1.8]", kind: "runtime", role: "vùng chia quá nhỏ hoặc méo so với xe bị bác", src: "backend/main_detect/src/techgar/occlusion_guard.py:180-187" },
      { name: "recovery frames", value: "3 valid liên tiếp", kind: "runtime", role: "số frame chứng minh trước khi đóng group", src: "backend/main_detect/src/techgar/occlusion_guard.py:212-220" },
      { name: "enable flags", value: "guard + watershed đều True", kind: "class-default", role: "tắt watershed vẫn giữ coast guard", src: "backend/main_detect/src/techgar/motion_tracker.py:92-93" }
    ],

    /* ⑤ Hình thật */
    figures: [
      {
        src: "assets/real/occlusion-cluster.jpg",
        alt: "Frame cam1 thai1 với cụm hai xe tối sát nhau được khoanh đỏ và một track coast khoanh xanh",
        caption: "thai1 cam1 f1407 (frame gốc + chú thích): hai xe tối sát nhau ở mép làn. Vùng blob không tách sạch được nên các [[track]] quanh đó giữ frozen_ambiguous và occluded_prediction thay vì stretch qua blob chung.",
        origin: "session_hiep_thai1/f1407/cam1"
      }
    ],
    noFigureReason: null,

    /* ⑥ Giới hạn & lỗi thật */
    limits: [
      {
        text: "Watershed chỉ chia group đúng hai member — ba xe dính một blob không có đường tách hình học. Và phép chia trả về đủ hoặc không trả gì: mọi điều kiện hỏng một là về merged detection."
      },
      {
        text: "Seed bám vào tâm dự đoán, nên phép chia chất lượng phụ thuộc [[Kalman filter]] đoán đúng hướng. Xe đổi hướng đột ngột trong lúc bị che sẽ đưa tâm trôi khỏi blob và khiến partition bỏ cuộc."
      },
      {
        text: "Recovery cần ba frame valid liên tiếp — trong đợt ambiguous kéo dài, các lineage sống nhờ coasting. Track coast lâu mà không tách tự nhiên được vẫn chết theo TTL bình thường."
      },
      {
        text: "Nghi ngờ coasting/frozen kéo dài khoảng 140 frame quanh vật nửa-ngoài-ROI đã ghi nhận (E-B-003/E-B-006) nhưng chưa kết luận. Thủ phạm có thể nằm ở guard hoặc ở frozen_ambiguous chung. Mã E-* là finding của chiến dịch verify-replay; danh mục đầy đủ ở trang failure-gallery.",
        evidence: { session: "nhiều session", status: "UNSURE" }
      }
    ],

    /* ⑦ Nguồn */
    sources: [
      { ref: "backend/main_detect/src/techgar/occlusion_guard.py:1-6", kind: "runtime", note: "docstring: geometry mở group, màu chỉ validate" },
      { ref: "backend/main_detect/src/techgar/occlusion_guard.py:36-53", kind: "runtime", note: "reference size từ clean_observations + center() với velocity estimate" },
      { ref: "backend/main_detect/src/techgar/occlusion_guard.py:55-100", kind: "runtime", note: "prepare: eligibility, overlap ≤0.20, gap ≤0.4·hypot" },
      { ref: "backend/main_detect/src/techgar/occlusion_guard.py:102-138", kind: "runtime", note: "covering_group + activate: pad 0.15, 1.6×median, expires last clean + timeout" },
      { ref: "backend/main_detect/src/techgar/occlusion_guard.py:140-189", kind: "runtime", note: "annotate merged + partition: distanceTransform, seed gating, watershed, region sanity" },
      { ref: "backend/main_detect/src/techgar/occlusion_guard.py:191-232", kind: "runtime", note: "gate_assignments: swapped−direct ≥2·margin, recovering ≥3, suppress member-like detections" },
      { ref: "backend/main_detect/src/techgar/motion_tracker.py:922-954", kind: "runtime", note: "covering check trước filters; watershed_provisional vs ambiguous_merged" },
      { ref: "backend/main_detect/src/techgar/motion_tracker.py:364-380", kind: "runtime", note: "_unresolved_merged_birth: birth veto sau group timeout" },
      { ref: "backend/main_detect/src/techgar/motion_tracker.py:1995", kind: "runtime", note: "call site gate_assignments sau LAPJV" }
    ],
    pseudocode: "prepare: cap track >=3 clean obs, gan nhau -> inactive group\n\n_detect: contour om moi center + area>=1.6x median -> group active\n  watershed: seed=px gan center, tach >=0.2*ref\n    ok -> 2 detection watershed_provisional (hist rieng)\n    fail -> 1 detection ambiguous_merged (hist=None)\n\nsau LAPJV: 2 member duoc gan & swapped-direct>=2*margin\n  valid -> recovering++ ; >=3 frame -> recovered\n  invalid -> ca hai frozen, chan moi detection member-like\n\nexpire: last clean + 3.0s -> group chet\n  blob chung van cam mint ID moi (birth veto)"
  });
})();
