/* gid-conflict.js — Trang 13: GID conflict & canonicalization.
 * Nguồn: .analysis/algo-web-v2-redesign/notes/gid-conflict.md
 */
(function () {
  "use strict";
  TG.definePage({
    id: "gid-conflict",
    group: "multi-cam",
    title: "GID conflict & canonicalization",
    navLabel: "GID conflict",
    order: 13,
    prev: "handoff-dormant",
    next: "parking-detector",

    /* ① Chức năng & vị trí */
    fn: {
      text: "Một [[GID]] chỉ được đại diện cho một xe vật lý. Lớp conflict bảo đảm ràng buộc đó. Nó chặn một GID ngồi trên hai track trong cùng camera hoặc trên hai xe lệch xa nhau giữa hai camera. Khi hai GID hóa ra là một xe, nó hợp nhất chúng qua bảng alias."
    },

    /* ② Vì sao cần */
    why: {
      paras: [
        "Các pass gán chạy nhiều lần mỗi frame và mỗi pass chỉ nhìn một phần bằng chứng. Một fragment được handoff nhận nhầm, một member cũ chưa kịp hết hạn, hay một duplicate blob đều có thể khiến một GID xuất hiện trên hai xe khác nhau. Nếu không có lớp dọn xung đột, sai lầm tồn tại vô hạn.",
        "Hướng ngược lại cũng xảy ra: một xe bị tách thành hai GID sau khoảng mất dấu. Khi bằng chứng sau đó chứng minh hai GID là một, merge gộp chúng lại. Nhờ bảng alias, mọi binding cũ đọc ra cùng một canonical id mà không cần viết lại lịch sử."
      ]
    },

    /* ③ Cách hoạt động */
    how: [
      {
        id: "3.1",
        name: "Canonical id và bảng alias",
        paras: [
          "Mọi đọc-ghi GID đều đi qua `_canonical_id`, một union-find có nén đường đi trên bảng `_global_aliases`. Khi merge được chấp nhận, id lớn hơn trỏ về id nhỏ hơn và mọi binding cũ tự động đọc ra canonical.",
          "Hàm `_bind` canonicalize trước khi ghi, gỡ member khỏi nhóm gid cũ và đẩy fragment tương ứng sang vệt trajectory của canonical id. Nhờ đó một local key không bao giờ nằm trong hai nhóm member."
        ],
        values: [
          { k: "canonical rule", v: "id nhỏ hơn sống", kind: "class-default", src: "backend/main_detect/src/techgar/cross_camera_manager.py:1328-1330" }
        ]
      },
      {
        id: "3.2",
        name: "Merge hai GID có kiểm soát",
        paras: [
          "`_merge_global_ids` từ chối ngay nếu cặp id nằm trong sổ `_independent_global_pairs` — những xe đã được quan sát đồng thời nên không thể là một. Merge cũng bị chặn khi một phía đang bị occlusion hold.",
          "Tiếp theo là collision-risk guard: hai GID đều đã established từ lâu thì không được gộp chỉ vì một frame khớp tốt. Khi merge được chấp nhận, alias ghi lại, vệt trajectory gộp, gallery từng camera hợp nhất, reservation ô đỗ chuyển chủ và mọi binding rebind về canonical."
        ],
        values: [
          { k: "veto merge", v: "independent pair / occluded / collision risk", kind: "runtime", src: "backend/main_detect/src/techgar/cross_camera_manager.py:1285-1326" }
        ]
      },
      {
        id: "3.3",
        name: "Xung đột cùng camera: một GID một xe",
        paras: [
          "Resolver gom các member confirmed theo cặp camera và canonical gid. Nhóm nào có hơn một member mà không phải toàn là motion echo của nhau thì giữ lại một member duy nhất.",
          "Member được giữ là member khớp gallery camera đó tốt nhất, rồi tới kích thước, frame được bind và số lần nhìn thấy. Member thua bị gỡ binding và nằm không GID cho phần còn lại của frame.",
          "Đây là cơ chế dọn sau cùng. Các pass phía trước đã cố không tạo xung đột; resolver này dọn những ca lọt qua. Ví dụ điển hình là track cũ tỉnh lại sau khi fragment mới đã nhận GID."
        ],
        values: [
          { k: "thứ tự rank giữ member", v: "appearance → size → binding_frame → visible_count → lid", kind: "runtime", src: "backend/main_detect/src/techgar/cross_camera_manager.py:3244-3271" }
        ]
      },
      {
        id: "3.4",
        name: "Xung đột chéo camera: divergent live members",
        paras: [
          "Hai member của cùng GID ở hai camera khác nhau mà neo thế giới cách nhau quá hai lần cross_camera_duplicate_distance thì không thể là cùng xe. Resolver yêu cầu bằng chứng hai frame liên tiếp trước khi detach.",
          "Khoảng cách trên ba lần ngưỡng là bất khả thi vật lý nên detach ngay.",
          "Cả hai member phải confirmed và có detection tươi, nên member coasting cũ không tự kích hoạt luật này.",
          "Member thua cũng bị đẩy về không GID trong frame đó và có thể được nhận lại thành xe khác ở frame sau."
        ],
        values: [
          { k: "divergence bound", v: "2 × 4.634 = 9.268 (cal-20260927); live 9.06", kind: "derived", src: "backend/main_detect/src/techgar/cross_camera_manager.py:3348" },
          { k: "extreme bound (instant)", v: "3 × 4.634 ≈ 13.9 (cal-20260927); live ≈13.58", kind: "derived", src: "backend/main_detect/src/techgar/cross_camera_manager.py:3349" }
        ]
      },
      {
        id: "3.5",
        name: "Sổ ambiguity và defer cách ly",
        paras: [
          "Khi LAPJV chọn một cặp nhưng phương án thua sát điểm hơn margin, fragment không được gán.",
          "Fragment đó đi vào sổ ambiguity kèm danh sách GID tranh chấp.",
          "Trong khi claim còn sống, mọi identity ngoài danh sách tranh chấp bị từ chối trên fragment đó. Ngoại lệ duy nhất là appearance camera đích dưới 0.20 — bằng chứng đủ mạnh để gạt tranh chấp cũ.",
          "Defer là quyết định có giới hạn: claim hết hạn sau ba frame và fragment được đánh giá lại trên dữ liệu mới."
        ],
        values: [
          { k: "ambiguity override", v: "appearance ≤ 0.20 trên cam đích", kind: "runtime", src: "backend/main_detect/src/techgar/cross_camera_manager.py:3658-3663" },
          { k: "ambiguity TTL", v: "3 frame", kind: "runtime", src: "backend/main_detect/src/techgar/cross_camera_manager.py:6481" }
        ]
      },
      {
        id: "3.6",
        name: "Thứ tự chạy trong update_all_tracks",
        paras: [
          "Sau khi các pass gán chạy xong, hai resolver dọn theo thứ tự cố định. Trước hết là merge duplicate đang sống và merge unique cross-camera. Kế đó resolver cùng camera, cuối cùng resolver chéo camera.",
          "Vì resolver chạy cuối cùng trong frame, mọi detach đều để member thua không GID cho đến frame tiếp theo — không có gán lại lén lút trong cùng frame."
        ],
        values: [
          { k: "call sites", v: "update_all_tracks, 4 bước liên tiếp", kind: "runtime", src: "backend/main_detect/src/techgar/cross_camera_manager.py:8528-8537" }
        ]
      }
    ],

    /* ④ Số liệu & công thức */
    formulas: [
      {
        name: "Margin check",
        expr: "accept ⟺ min(alt_row ∪ alt_col) − selected ≥ margin",
        subst: "margin = 0.08 (handoff) · 0.12 (dormant/trajectory)",
        result: "sát nút → defer",
        note: "phương án thua đủ gần nghĩa là ma trận không phân biệt được — giữ fragment không gán",
        src: "backend/main_detect/src/techgar/cross_camera_manager.py:3137-3156"
      },
      {
        name: "Cross-camera divergence",
        expr: "detach khi ‖w_left − w_right‖ > 2 × dup_distance, hoặc > 3 × dup_distance thì ngay",
        subst: "‖·‖ = 19.216 vs bound 9.268 (extreme 13.9)",
        result: "instant detach thai3 f2869",
        note: "giá trị thật trong event cross_camera_global_conflict_detached; bound theo cal-20260927 — live cal-20261006: 9.06 / ≈13.58",
        src: "backend/main_detect/src/techgar/cross_camera_manager.py:3348-3439"
      }
    ],
    params: [
      { name: "cross_camera_duplicate_distance", value: "4.634 (cal-20260927); live ≈4.53 (cal-20261006)", kind: "derived", role: "thước đo cho mọi ngưỡng same-car giữa hai cam — bound 2×/3× live ≈9.06/13.58", src: "backend/main_detect/two_camera.py:2189-2202" },
      { name: "handoff margin", value: "0.08", kind: "runtime", role: "biên LAPJV tối thiểu cho handoff pass", src: "backend/main_detect/src/techgar/cross_camera_manager.py:3694" },
      { name: "dormant/trajectory margin", value: "0.12", kind: "class-default", role: "biên LAPJV cho hai pass nhận dạng lại", src: "backend/main_detect/src/techgar/cross_camera_manager.py:452" },
      { name: "ambiguity TTL", value: "3 frame", kind: "runtime", role: "thời hạn một fragment bị cách ly vì tranh chấp", src: "backend/main_detect/src/techgar/cross_camera_manager.py:6481" },
      { name: "evidence divergence", value: "2 frame liên tiếp", kind: "runtime", role: "điều kiện detach non-extreme", src: "backend/main_detect/src/techgar/cross_camera_manager.py:3376-3382" }
    ],

    /* ⑤ Hình thật */
    figures: [
      {
        src: "assets/real/gid-conflict-detached-thai3-f2869-cam1.jpg",
        alt: "Member cam1 lid64 của gid8 bị detach vì neo lệch 19.2 đơn vị thế giới",
        caption: "Cam1 f2869 của session_hiep_thai3: lid64 từng mang GID8 nhưng neo của nó cách member cam2 tới 19.216 đơn vị thế giới. Vượt ngưỡng extreme 13.9 (cal-20260927; live ≈13.58) nên binding bị gỡ ngay trong frame.",
        origin: "session_hiep_thai3/f2869/cam1"
      },
      {
        src: "assets/real/gid-conflict-detached-thai3-f2869-cam2.jpg",
        alt: "Member cam2 lid88 giữ lại GID8 sau khi resolver chạy",
        caption: "Cam2 f2869 cùng frame: lid88 giữ lại GID8 vì rank tốt hơn trên gallery camera đó. Hai quan sát cùng GID cách nhau gần hai chục đơn vị thế giới là hai vật thể khác nhau, không phải một xe.",
        origin: "session_hiep_thai3/f2869/cam2"
      }
    ],
    noFigureReason: null,
    interactive: null,

    /* ⑥ Giới hạn & lỗi thật */
    limits: [
      {
        text: "Resolver chỉ dọn sau khi xung đột đã xảy ra: một frame vẫn có thể render một GID trên hai xe trước khi detach kịp chạy. Divergence guard trước bind ở dormant pass là lớp phòng ngừa bổ sung cho lỗi đó.",
        evidence: { session: "verify_cur_session_hiep_thai3", frame: 2869, status: "CONFIRMED" }
      },
      {
        text: "Hai GID established lâu có thể không bao giờ merge được. Trên thai1, gid2 và gid3 bị từ chối merge liên tục hơn năm mươi frame dù quan sát gần nhau. Nếu đó thực ra là một xe, lỗi nằm yên vô hạn.",
        evidence: { session: "verify_cur_session_hiep_thai1", frame: 1059, status: "UNSURE" }
      },
      {
        text: "Detach không xoá vết tích lũy: gallery và reservation của member bị detach vẫn thuộc identity giữ lại. Nếu resolver giữ sai xe, gallery bị nhiễm mà không có cơ chế tự rửa trong frame hiện tại.",
        evidence: { session: "verify_cur_session_hiep_thai3", frame: 2869, status: "UNSURE" }
      }
    ],

    /* ⑦ Nguồn */
    sources: [
      { ref: "backend/main_detect/src/techgar/cross_camera_manager.py:474-507", kind: "class-default", note: "_canonical_id union-find + _bind" },
      { ref: "backend/main_detect/src/techgar/cross_camera_manager.py:1271-1390", kind: "runtime", note: "_merge_global_ids: guards + alias + gộp gallery" },
      { ref: "backend/main_detect/src/techgar/cross_camera_manager.py:3137-3156", kind: "class-default", note: "_assignment_has_margin" },
      { ref: "backend/main_detect/src/techgar/cross_camera_manager.py:3158-3193", kind: "class-default", note: "_cross_merge_would_conflict" },
      { ref: "backend/main_detect/src/techgar/cross_camera_manager.py:3195-3294", kind: "runtime", note: "same-camera resolver + owner_rank" },
      { ref: "backend/main_detect/src/techgar/cross_camera_manager.py:3296-3444", kind: "runtime", note: "cross-camera resolver: 2×/3× bound + evidence" },
      { ref: "backend/main_detect/src/techgar/cross_camera_manager.py:8528-8537", kind: "runtime", note: "thứ tự gọi trong update_all_tracks" },
      { ref: "backend/main_detect/experiment_test/output/verify_cur_session_hiep_thai3/predictions.jsonl:2869", kind: "runtime", note: "conflict_detached gid8 wd 19.216 instant" },
      { ref: "backend/main_detect/experiment_test/output/verify_cur_session_hiep_thai1/predictions.jsonl:1134", kind: "runtime", note: "global_id_merged gid3→gid2 dormant_duplicate_reconciled" },
      { ref: "backend/main_detect/experiment_test/output/verify_cur_session_hiep_thai1/predictions.jsonl:1059", kind: "runtime", note: "merge_rejected_established_ids lặp >50 frame" }
    ],
    pseudocode: "canonical(g): duoi alias chain + path compress\n\nresolve_same_cam:\n  group members theo (cam, canonical gid)\n  neu >1 va khong phai echo -> giu member rank tot nhat\n  detach phan con lai -> gid=None trong frame nay\n\nresolve_cross_cam:\n  cap member khac cam cung gid, ca hai fresh+confirmed\n  dist > 3*dup -> detach ngay\n  dist > 2*dup -> can 2 frame lien tiep -> detach yeu hon\n\nmerge(a,b): guard -> alias[b]=min(a,b) -> gop gallery/trail -> rebind"
  });
})();
