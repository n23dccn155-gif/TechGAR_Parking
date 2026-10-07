/* manifest.js — nhóm + thứ tự canonical của các trang cơ chế.
 * Nav trái và prev/next bám theo đây; trang đã đăng ký (definePage) nhưng
 * không nằm trong groups[].pages sẽ không hiện nav (vd. _fixture).
 */
(function () {
  "use strict";
  var TG = (window.TG = window.TG || {});

  TG.manifest = {
    groups: [
      {
        id: "setup", label: "Hiệu chuẩn & cấu hình",
        pages: ["roi-mask", "parking-slots", "homography"]
      },
      {
        id: "single-cam", label: "Theo vết một camera",
        pages: ["brightness", "motion-detection", "contour-filtering",
          "kalman-lapjv", "track-lifecycle", "occlusion-watershed"]
      },
      {
        id: "multi-cam", label: "Hai camera & GID",
        pages: ["tracklet-descriptor", "trajectory-reid",
          "handoff-dormant", "gid-conflict"]
      },
      {
        id: "binding", label: "Gán xe vào ô đỗ",
        pages: ["parking-detector", "slot-binder"]
      },
      {
        id: "gate-frontend", label: "Cổng, phiên & frontend",
        pages: ["snapshot-api", "gate-session", "frontend-dataflow",
          "routing-astar", "voice-guidance"]
      },
      {
        id: "data", label: "Dữ liệu & kiểm chứng",
        pages: ["predictions-jsonl", "replay-ground-truth", "failure-gallery"]
      }
    ],
    /* thứ tự tuyến tính 23 trang — prev/next và search index dùng chung */
    order: [
      "roi-mask", "parking-slots", "homography",
      "brightness", "motion-detection", "contour-filtering",
      "kalman-lapjv", "track-lifecycle", "occlusion-watershed",
      "tracklet-descriptor", "trajectory-reid",
      "handoff-dormant", "gid-conflict",
      "parking-detector", "slot-binder",
      "snapshot-api", "gate-session", "frontend-dataflow",
      "routing-astar", "voice-guidance",
      "predictions-jsonl", "replay-ground-truth", "failure-gallery"
    ]
  };
})();
