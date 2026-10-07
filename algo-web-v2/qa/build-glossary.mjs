#!/usr/bin/env node
/* build-glossary.mjs — Task 11: merge terms mọi trang, dedupe alias, sort A–Z.
 * Đọc js/glossary-data.js hiện tại + ADDS bên dưới, regenerate file sorted.
 * Chạy: node qa/build-glossary.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const FILE = join(ROOT, "js", "glossary-data.js");

/* Terms bắt buộc theo brief Task 11 mà hiện chưa có (thêm 2026-10-06). */
const ADDS = [
  {
    term: "bbox_center",
    vi: "neo tâm khung bao",
    def: "Một trong hai chế độ của shared_map_anchor: chiếu tâm hình chữ nhật bbox lên bản đồ chung thay vì điểm đáy-giữa.",
    role: "Quyết định vị trí thế giới mà một quan sát chiếu tới — dùng tâm khung khi mặt đất của xe không đo được tin cậy.",
    example: "Config hiện tại dùng bbox_center nên điểm neo là (cx, cy) thay vì (cx, y+h).",
    page: "homography",
    aliases: ["bbox center", "center anchor"]
  },
  {
    term: "dormant ReID",
    vi: "nhận dạng lại identity ngủ",
    def: "Pass quét các fragment chưa gán so với mọi identity ở trạng thái dormant, handoff, parked hay recovery_pending để trả lại GID cũ.",
    role: "Cứu lại danh tính của xe mất dấu vì đứng yên hoặc ra vào vùng mù, tránh mở lineage mới cho cùng một xe.",
    example: "lid10 cam1 f465 được trả về GID2 sau 39.8 giây dormant với appearance 0.167.",
    page: "handoff-dormant",
    aliases: ["dormant re-identification", "dormant match"]
  },
  {
    term: "reprojection error",
    vi: "sai số chiếu ngược",
    def: "Khoảng cách giữa điểm thật đánh dấu trên ảnh và điểm do ma trận homography chiếu ngược về cùng vị trí đó.",
    role: "Thước đo chất lượng của một fit calibration — fit gate reject khi sai số vượt trần cấu hình.",
    example: "Fit cam1 của cal-20260927 đạt max error 0.169 cm, dưới ngưỡng 2.0 cm của fit gate.",
    page: "homography",
    aliases: ["projection error", "fit error"]
  },
  {
    term: "lid",
    vi: "định danh cục bộ của track",
    def: "Số nguyên định danh một track trong phạm vi một camera — mất ý nghĩa khi qua camera khác và được thay bằng GID khi gán.",
    role: "Là khóa tra cứu trong mọi bảng per-camera: gallery, Kalman state và binding ô đỗ đều đánh chỉ số theo lid.",
    example: "lid35@cam2 và lid40@cam1 là hai lid khác nhau nhưng cùng thuộc GID1.",
    page: "track-lifecycle",
    aliases: ["local track id", "local_id"]
  },
  {
    term: "lineage_score",
    vi: "điểm tin cậy của lineage",
    def: "Điểm trong [0,1] đo mức độ đã-thiết-lập của một track, bằng trung bình bốn điểm con: độ dài lịch sử chia mười, số quan sát chia mười, số quan sát fragment chia năm và tuổi track chia mười lăm frame.",
    role: "Nới hoặc siết margin sau gán: margin yêu cầu là 0.08 × (2 − lineage_score), nên track mới phải thắng cách biệt lớn hơn track kỳ cựu.",
    example: "Track mới hai frame tuổi có lineage_score thấp nên cần margin gần 0.16; track lâu đời chỉ cần gần 0.08.",
    page: "kalman-lapjv",
    aliases: ["lineage score", "điểm lineage"]
  },
  {
    term: "heuristic",
    vi: "hàm ước lượng còn lại",
    def: "Ước lượng chi phí từ một nút tới đích trong A*; ở đây là khoảng Euclid tới nút đích nhân hệ số heuristicScale suy từ tỷ số cost/độ dài trên mọi cạnh.",
    role: "Dẫn hướng open-set mở nút gần đích trước, giúp A* không phải quét toàn đồ thị làn.",
    example: "Nút cách đích 200 đơn vị map được ước lượng 200 × heuristicScale, cộng vào chi phí đã đi để xếp thứ tự duyệt.",
    page: "routing-astar",
    aliases: ["hàm heuristic", "h(n)"]
  },
  {
    term: "admissible",
    vi: "không phóng đại (của heuristic)",
    def: "Tính chất của heuristic khi nó không bao giờ ước lượng vượt chi phí thật còn lại; A* với heuristic admissible bảo đảm trả về đường ngắn nhất.",
    role: "Hệ số heuristicScale lấy min của tỷ số distance khai báo trên độ dài Euclid trên mọi cạnh nên ước lượng luôn nằm dưới chi phí thật.",
    example: "Vì mọi cạnh đều đắt ít nhất bằng độ dài chim bay nhân hệ số min, heuristic Euclid không thể phóng đại.",
    page: "routing-astar",
    aliases: ["admissible heuristic"]
  },
  {
    term: "harm",
    vi: "mức độ hại của lỗi",
    def: "Đánh giá hệ quả thật của một finding lên phần sau pipeline — ô đỗ, session, tuyến đường — tách biệt với việc lỗi có tồn tại hay không.",
    role: "Một lỗi có thể CONFIRMED tồn tại nhưng harm vẫn UNSURE nếu trạng thái downstream không đổi; UNVERIFIED khi chưa có ground truth để đo.",
    example: "E-C-002 là mất lineage CONFIRMED nhưng harm UNSURE vì occupancy của ô không thay đổi.",
    page: "failure-gallery",
    aliases: ["mức độ hại", "identity_impact"]
  },
  {
    term: "episode cursor",
    vi: "con trỏ episode đã áp",
    def: "Bản ghi per-slot `_episode_cursors` lưu episode mới nhất đã áp dụng (frame, trạng thái, revision) để controller biết episode nào đã xử lý.",
    role: "Làm apply parking_episodes lũy đẳng: snapshot lặp lại cùng episode không đổi trạng thái session lần nữa, chỉ episode vượt cursor mới được áp.",
    example: "Episode parked C08 applied_frame 5901 chỉ đổi session một lần; snapshot frame sau mang cùng episode bị cursor chặn lại.",
    page: "gate-session",
    aliases: ["_episode_cursors", "cursor episode"]
  },
  {
    term: "clean observations",
    vi: "chuỗi quan sát sạch",
    def: "Mẫu đo của track ở những frame không bị merged freeze hay occlusion — tracker giữ tối đa tám mẫu gần nhất gồm thời điểm và kích thước sạch.",
    role: "Occlusion guard lấy kích thước và thời điểm tham chiếu từ chuỗi này; kích thước sạch cũng là mẫu số cho cửa sổ gán của Kalman.",
    example: "Xe đo ổn định 100 px² trong clean observations thì blob 300 px² bị nghi là merged contour.",
    page: "kalman-lapjv",
    aliases: ["clean size", "kích thước sạch"]
  },
  {
    term: "CLAHE",
    vi: "cân bằng histogram thích nghi có giới hạn",
    def: "Contrast Limited Adaptive Histogram Equalization của OpenCV — cân bằng tương phản theo từng ô lưới với clipLimit chặn đỉnh histogram, tạo bằng cv2.createCLAHE(clipLimit, tileGridSize).",
    role: "Một trong hai trục của ensemble hai lăm biến thể trong parking detector: năm giá trị CLAHE nhân năm gamma vote trống/đầy cho mỗi ô.",
    example: "Mỗi biến thể tiền xử lý chạy createCLAHE(clipLimit, (grid, grid)) rồi mới đo tỷ lệ cạnh trong ô.",
    page: "parking-slots",
    aliases: ["clahe", "adaptive histogram"]
  },
  {
    term: "TemporalSmoother",
    vi: "bộ làm mượt trạng thái theo frame",
    def: "Lớp đếm của parking detector: trạng thái confirmed của ô chỉ đổi khi cùng một kết quả vote được lặp đủ required_frames liên tiếp; smoothing_frames bằng không tương đương tắt.",
    role: "Chống trạng thái ô đỗ nhấp nháy theo nhiễu từng frame; tại runtime smoothing_frames bằng một nên lớp này gần như vô hình — việc latch thật do dwell machine và stable evidence đảm nhiệm.",
    example: "Với required bằng năm, ô phải vote 'có xe' năm frame liền mới lật sang occupied.",
    page: "parking-slots",
    aliases: ["temporal smoother", "smoothing_frames"]
  }
];

const src = readFileSync(FILE, "utf8");
const m = src.match(/TG\.defineTerms\(\[([\s\S]*)\]\);/);
if (!m) throw new Error("không tìm thấy TG.defineTerms([...])");
const terms = eval("[" + m[1] + "]");

/* merge ADDS: term đã có thì bỏ qua (giữ bản cũ), chưa có thì thêm */
const byTerm = new Map(terms.map((t) => [t.term.toLowerCase(), t]));
for (const add of ADDS) if (!byTerm.has(add.term.toLowerCase())) terms.push(add);

/* dedupe: alias trùng chính term (kể cả khác case), alias trùng term khác,
   alias trùng nhau giữa các term (term nào đứng trước trong sort giữ). */
terms.sort((a, b) => a.term.localeCompare(b.term, "en", { sensitivity: "base" }));
const termKeys = new Set(terms.map((t) => t.term.toLowerCase()));
const aliasSeen = new Set();
for (const t of terms) {
  const tk = t.term.toLowerCase();
  t.aliases = (t.aliases || []).filter((a) => {
    const k = a.toLowerCase();
    if (k === tk || (termKeys.has(k) && k !== tk) || aliasSeen.has(k)) return false;
    aliasSeen.add(k);
    return true;
  });
}

const q = (s) => JSON.stringify(s);
const objs = terms
  .map(
    (t) =>
      `    {\n      term: ${q(t.term)},\n      vi: ${q(t.vi)},\n      def: ${q(t.def)},\n      role: ${q(t.role)},\n      example: ${q(t.example)},\n      page: ${q(t.page)},\n      aliases: [${(t.aliases || []).map(q).join(", ")}]\n    }`
  )
  .join(",\n");

const out = `/* glossary-data.js — đăng ký thuật ngữ qua TG.defineTerms.
 * Task 11: merge mọi trang + dedupe alias + sort A–Z (regen: node qa/build-glossary.mjs).
 * Mỗi entry: {term, vi, def, role, example, page, aliases[]}.
 */
(function () {
  "use strict";
  var TG = (window.TG = window.TG || {});

  TG.defineTerms([
${objs}
  ]);
})();
`;
writeFileSync(FILE, out);
console.log(`glossary: ${terms.length} terms, sorted A-Z`);
