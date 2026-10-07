/* glossary-data.js — đăng ký thuật ngữ qua TG.defineTerms.
 * Task 11: merge mọi trang + dedupe alias + sort A–Z (regen: node qa/build-glossary.mjs).
 * Mỗi entry: {term, vi, def, role, example, page, aliases[]}.
 */
(function () {
  "use strict";
  var TG = (window.TG = window.TG || {});

  TG.defineTerms([
    {
      term: "A*",
      vi: "thuật toán tìm đường A-sao",
      def: "Tìm đường ngắn nhất trên đồ thị có trọng số bằng cách mở rộng nút có chi phí thật cộng ước lượng còn lại nhỏ nhất; ước lượng không phóng đại thì kết quả tối ưu.",
      role: "Sinh tuyến dẫn đường từ cổng vào tới cửa ô đỗ trên lane-graph của frontend.",
      example: "Tuyến tới C10 đi dọc làn phải một chiều rồi rẽ theo cạnh ngang vào nút spot-entry.",
      page: "routing-astar",
      aliases: ["a-star", "a star"]
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
      term: "appearance gallery",
      vi: "bộ sưu tập mẫu ngoại hình",
      def: "Tập hợp có giới hạn các descriptor của một track hoặc một identity, mỗi phần tử là một histogram đã chuẩn hóa.",
      role: "Cho phép so khớp ổn định: một quan sát xấu không phá hỏng nhận dạng vì mọi mẫu đều tham gia so sánh.",
      example: "Identity gallery giữ tối đa 24 mẫu, giãn đều để giữ cả đầu và cuối hành trình.",
      page: "tracklet-descriptor",
      aliases: ["gallery", "appearance samples"]
    },
    {
      term: "AppearanceTracklet",
      vi: "gallery ngoại hình của local track",
      def: "Cấu trúc dữ liệu của tracker một camera giữ tối đa 12 descriptor, mỗi mẫu cách nhau ít nhất 3 frame.",
      role: "Nguồn mẫu cho mọi match appearance; khi track hết hạn, gallery này được nhập vào identity dormant.",
      example: "Track lid35 tích lũy 12 mẫu trước khi hết hạn và chuyển gallery sang GID.",
      page: "tracklet-descriptor",
      aliases: []
    },
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
      term: "Bhattacharyya distance",
      vi: "khoảng cách Bhattacharyya",
      def: "Độ đo độ chồng lấn giữa hai histogram: 0 nghĩa là phân bố giống hệt nhau, tăng dần khi hai phân bố tách xa.",
      role: "Hàm khoảng cách dùng cho mọi phép so sánh appearance, từ mẫu đơn tới ghép gallery.",
      example: "Hai gallery của GID 2 qua handoff có distance 0.272, đủ tốt để match.",
      page: "tracklet-descriptor",
      aliases: ["bhattacharyya", "histogram distance"]
    },
    {
      term: "bounding box",
      vi: "khung bao hình chữ nhật",
      def: "Hình chữ nhật [x,y,w,h] bao sát một đối tượng được phát hiện trong frame.",
      role: "Đại diện vị trí+kích thước xe cho tracking, gán GID và kiểm tra vào ô đỗ.",
      example: "lid317 có bbox [760,136,56,81] nghĩa là tâm tại (788,176).",
      page: "motion-detection",
      aliases: ["bbox", "box"]
    },
    {
      term: "cast shadow",
      vi: "bóng đổ vật lý",
      def: "Vùng mặt đường bị che sáng bởi vật thể; xấp xỉ nhân mọi kênh màu của nền với một hệ số tối đi (attenuation) mà giữ nguyên màu sắc và texture.",
      role: "Dạng foreground giả kinh điển — motion pipeline phải phân biệt nó với thân xe tối để không xoá nhầm xe hoặc giữ nhầm bóng.",
      example: "Blob tối có attenuation 0.45 và chromaticity gần như nền bị reject là bóng đổ.",
      page: "brightness",
      aliases: ["bong do", "shadow blob"]
    },
    {
      term: "CLAHE",
      vi: "cân bằng histogram thích nghi có giới hạn",
      def: "Contrast Limited Adaptive Histogram Equalization của OpenCV — cân bằng tương phản theo từng ô lưới với clipLimit chặn đỉnh histogram, tạo bằng cv2.createCLAHE(clipLimit, tileGridSize).",
      role: "Một trong hai trục của ensemble hai lăm biến thể trong parking detector: năm giá trị CLAHE nhân năm gamma vote trống/đầy cho mỗi ô.",
      example: "Mỗi biến thể tiền xử lý chạy createCLAHE(clipLimit, (grid, grid)) rồi mới đo tỷ lệ cạnh trong ô.",
      page: "parking-slots",
      aliases: ["adaptive histogram"]
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
      term: "context band",
      vi: "vùng đệm ngữ cảnh",
      def: "Dải đất quanh mép ROI strict được tạo bằng cách dilate đa giác thêm roi_context_padding_px; pixel trong band được đo nhưng không đủ điều kiện sinh detection mới.",
      role: "Cho phép một xe chạm biên ROI được đo nguyên chiếc thay vì bị cắt cụt, trong khi vẫn giữ nguyên vùng được phép tạo identity.",
      example: "Band 48 px quanh ROI cam1 cứu bbox của xe đỗ sát mép khỏi bị cắt một nửa.",
      page: "roi-mask",
      aliases: ["roi context", "vung dem", "context_mask"]
    },
    {
      term: "core rescue",
      vi: "cứu lõi ô đỗ",
      def: "Pass kiểm chứng lật vote trống thành có xe khi vùng core có blob sáng đủ lớn hoặc texture dày — bảo hiểm cho xe sáng màu bị threshold nuốt.",
      role: "Chặn false-empty trên xe khó threshold; trong replay hiện có chưa từng phải lật một vote đa số.",
      example: "central_blob: core_ratio ≥ 0.18 và component lớn nhất ≥ 0.08 diện tích core.",
      page: "parking-detector",
      aliases: ["central_blob", "textured_dense_blob"]
    },
    {
      term: "correspondence point",
      vi: "điểm tương ứng",
      def: "Cùng một điểm vật lý được đánh dấu ở cả hai camera; cặp pixel-cam1/pixel-cam2 của nó là dữ liệu nạp cho phép fit.",
      role: "Tám cặp A–D và V1–V4 là đầu vào duy nhất để tính homography giữa hai view.",
      example: "Điểm A góc thước đo được click tại (412,388) trên cam1 và (905,301) trên cam2.",
      page: "homography",
      aliases: ["correspondence", "cap diem tuong ung"]
    },
    {
      term: "dormant",
      vi: "trạng thái ngủ của identity",
      def: "Trạng thái của một GID khi local track cuối cùng của nó chết: identity vẫn được giữ với vị trí, vận tốc và gallery cuối trong cửa sổ retention.",
      role: "Cho phép một fragment xuất hiện lại chứng minh và nhận lại GID cũ thay vì mở lineage mới.",
      example: "Xe đỗ yên làm blob chuyển động biến mất; GID của nó chuyển dormant cho tới khi xe lại chuyển động.",
      page: "handoff-dormant",
      aliases: ["dormant identity", "identity dormant"]
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
      term: "edge adjacency",
      vi: "bảng kề cạnh camera",
      def: "Ánh xạ (camera, cạnh khung hình) sang camera kề mà xe đi ra cạnh đó sẽ tới, hoặc cờ overlap cho vùng hai cam cùng nhìn.",
      role: "Quyết định handoff nào được mở và fragment ở camera nào được phép nhận identity.",
      example: "Xe ra cạnh phải cam1 mở handoff tới cam2 nếu bảng adjacency khai báo cạnh đó kề cam2.",
      page: "handoff-dormant",
      aliases: ["adjacency", "OPPOSITE_EDGE"]
    },
    {
      term: "EMA",
      vi: "trung bình động hàm mũ",
      def: "Bộ lọc làm mượt chuỗi đo: giá trị mới bằng α nhân giá trị cũ cộng (1−α) nhân quan sát mới, nên thay đổi đột ngột bị hấp thụ từ từ.",
      role: "Ước lượng vận tốc thế giới của identity bằng 0.65 phần cũ và 0.35 phần đo tức thời.",
      example: "Xe đỗ yên nhưng EMA còn 26 cm/s sau một frame đo vận tốc 0.",
      page: "homography",
      aliases: ["exponential moving average", "ema velocity"]
    },
    {
      term: "ensemble voting",
      vi: "bỏ phiếu đa biến thể",
      def: "25 biến thể tiền xử lý (5 CLAHE × 5 gamma) mỗi cái đếm tỉ lệ pixel sáng trong ô đỗ; ô có từ 12 phiếu trống trở lên được coi là trống tức thời.",
      role: "Quyết định không lệ thuộc một mức sáng duy nhất, giảm sai khi ánh sáng đổi hoặc xe màu khó tách nền.",
      example: "Ô B05 hiep3 f466: 0/25 phiếu trống nên occupied; ô A01: 25/25 nên trống.",
      page: "parking-detector",
      aliases: ["empty_votes", "25 variants"]
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
      term: "fit gate",
      vi: "cổng chấm chất lượng fit",
      def: "Bộ ngưỡng loại calibration tệ sau khi fit: giới hạn sai số pixel đối xứng và sai số cross-camera tính bằng centimet.",
      role: "Chặn một file calibration sai lệch trước khi nó được promote sang reviewed_fit và đi vào runtime.",
      example: "Calibration với max_error_cm 3.1 sẽ bị reject vì vượt trần 2.0 cm.",
      page: "homography",
      aliases: ["fit-gate", "fitgate"]
    },
    {
      term: "foreground mask",
      vi: "mặt nạ foreground",
      def: "Ảnh nhị phân đánh dấu pixel thuộc đối tượng chuyển động, sinh ra bởi bộ tách nền của motion detection.",
      role: "Giới hạn histogram chỉ tính trên pixel của xe, loại nền đường khỏi mô tả ngoại hình.",
      example: "Crop có dưới 15 phần trăm pixel foreground bị coi là mẫu nền và bị loại.",
      page: "motion-detection",
      aliases: ["fg mask", "motion mask"]
    },
    {
      term: "GID",
      vi: "định danh toàn cục",
      def: "ID xuyên-camera gán cho một xe thật; nhiều track cục bộ (mỗi cam một lid) có thể cùng map về một GID.",
      role: "Cho phép xe đi từ cam1 sang cam2 mà vẫn là 'cùng một xe' trong log và bản đồ.",
      example: "lid10@cam1 và lid40@cam2 cùng mang GID:5 là cùng một chiếc SUV đen.",
      page: "handoff-dormant",
      aliases: ["global id", "global identity"]
    },
    {
      term: "HandoffEntry",
      vi: "phiếu chuyển giao chờ",
      def: "Bản ghi mở khi một xe sắp rời khung hình, mang vị trí thế giới cuối, vận tốc, kích thước và gallery màu sang camera kề.",
      role: "Là đầu mối để fragment mới xuất hiện ở camera đích được nhận lại đúng GID thay vì cấp mới.",
      example: "Entry sống tối đa 45 frame; hết hạn hoặc có member confirmed ở cam đích thì huỷ.",
      page: "handoff-dormant",
      aliases: ["handoff", "pending handoff"]
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
      term: "heuristic",
      vi: "hàm ước lượng còn lại",
      def: "Ước lượng chi phí từ một nút tới đích trong A*; ở đây là khoảng Euclid tới nút đích nhân hệ số heuristicScale suy từ tỷ số cost/độ dài trên mọi cạnh.",
      role: "Dẫn hướng open-set mở nút gần đích trước, giúp A* không phải quét toàn đồ thị làn.",
      example: "Nút cách đích 200 đơn vị map được ước lượng 200 × heuristicScale, cộng vào chi phí đã đi để xếp thứ tự duyệt.",
      page: "routing-astar",
      aliases: ["hàm heuristic", "h(n)"]
    },
    {
      term: "Homography",
      vi: "phép chiếu đồng phẳng",
      def: "Ma trận 3×3 ánh xạ điểm trên mặt phẳng ảnh camera sang mặt phẳng bản đồ chung (top-down), giữ nguyên đường thẳng.",
      role: "Chuyển tọa độ pixel của xe sang tọa độ thế giới (cm) để hai camera nói cùng một hệ quy chiếu.",
      example: "Điểm (788,176)px trên cam2 tương ứng (562,…)cm trên bản đồ chung.",
      page: "homography",
      aliases: ["homography matrix", "shared map"]
    },
    {
      term: "HSV histogram",
      vi: "histogram màu HSV",
      def: "Bảng đếm phân bố màu của vùng ảnh theo kênh hue và saturation, gộp thêm chromaticity LAB và luminance trong descriptor của TechGAR.",
      role: "Mô tả màu xe theo cách ít phụ thuộc góc nhìn hơn ảnh thô, đủ để so hai camera đối diện.",
      example: "Descriptor 416 chiều gồm 256 bin hue-saturation, 144 bin LAB và 16 bin luminance.",
      page: "tracklet-descriptor",
      aliases: ["histogram", "color histogram"]
    },
    {
      term: "idempotency",
      vi: "tính lũy đẳng",
      def: "Tính chất một thao tác chạy lại nhiều lần cho cùng một kết quả như chạy một lần — không sinh hiệu ứng kép.",
      role: "Cho phép controller và frontend retry an toàn: episode cursor bỏ episode cũ, actionReceipts trả kết quả cũ cho POST lặp.",
      example: "POST /api/session/select với cùng action_id hai lần chỉ đổi session một lần.",
      page: "gate-session",
      aliases: ["idempotent", "lũy đẳng"]
    },
    {
      term: "Kalman filter",
      vi: "bộ lọc dự đoán vị trí",
      def: "Bộ lọc ước lượng trạng thái: dự đoán vị trí kế tiếp của đối tượng từ trạng thái trước, rồi hiệu chỉnh bằng quan sát mới.",
      role: "Dự đoán vị trí xe ở frame kế để gán detection sang track đúng, và giữ track sống khi mất quan sát ngắn hạn.",
      example: "Xe bị che khuất 2 frame vẫn giữ vị trí dự đoán để khớp lại ở frame thứ 3.",
      page: "kalman-lapjv",
      aliases: ["kalman"]
    },
    {
      term: "LAPJV",
      vi: "thuật toán gán tối ưu toàn cục",
      def: "Thuật toán giải bài toán gán tuyến tính tổng quát: chọn ghép cặp có tổng chi phí nhỏ nhất giữa hai tập đối tượng.",
      role: "Trong pass trajectory, ma trận chi phí 1 trừ score được gán một-lần để một GID không bị hai fragment cùng tiêu thụ.",
      example: "Hai fragment cùng muốn GID 1 sẽ chỉ một được nhận; tranh chấp sát điểm bị defer.",
      page: "kalman-lapjv",
      aliases: ["lap", "hungarian", "linear assignment"]
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
      term: "median slot length",
      vi: "chiều dài ô đỗ trung vị",
      def: "Trung vị của cạnh dài khung chữ nhật nhỏ nhất bao quanh mọi polygon ô đỗ trong file calibration, tính theo đơn vị thế giới.",
      role: "Thước đo duy nhất có sẵn để suy ra các ngưỡng khoảng cách nhận dạng theo bội số.",
      example: "60 ô của cal-20260927 cho median 9.267515 cm → handoff 1.75 lần ≈ 16.22 cm.",
      page: "homography",
      aliases: ["median_slot_length", "slot length"]
    },
    {
      term: "merge_appearance_samples",
      vi: "hàm hợp nhất gallery",
      def: "Hàm gộp hai gallery thành một giới hạn 24 mẫu: loại mẫu gần-trùng rồi giãn đều theo vị trí nếu vẫn thừa.",
      role: "Tạo gallery toàn cục của GID từ các fragment nối tiếp nhau trên mọi camera.",
      example: "Hai gallery 12 mẫu của lid35 và lid40 hợp thành tối đa 24 mẫu của GID 1.",
      page: "tracklet-descriptor",
      aliases: []
    },
    {
      term: "MOG2",
      vi: "bộ trừ nền MOG2",
      def: "BackgroundSubtractorMOG2 của OpenCV — mô hình nền thích nghi gán mỗi pixel là foreground (255), nghi-shadow (127), hoặc background (0).",
      role: "Tạo foreground mask đầu tiên cho detection; nhãn 127 của nó là đầu vào cho bài kiểm cast-shadow riêng của hệ thống.",
      example: "history=700 nghĩa là background thích nghi với hằng số thời gian khoảng 700 frame.",
      page: "brightness",
      aliases: ["background subtractor", "bg_sub"]
    },
    {
      term: "off-route",
      vi: "lệch khỏi tuyến chỉ dẫn",
      def: "Trạng thái xe có khoảng cách vuông góc tới đoạn gần nhất của tuyến vượt ngưỡng cho phép.",
      role: "Kích hoạt cảnh báo đi sai đường và tính lại tuyến từ vị trí hiện tại của xe.",
      example: "Xe cách tuyến tám mươi đơn vị bản đồ bị coi là sai đường và route được tính lại.",
      page: "routing-astar",
      aliases: ["lạc tuyến", "đi sai tuyến"]
    },
    {
      term: "parked reservation",
      vi: "giữ chỗ identity đỗ",
      def: "Bản ghi khẳng định một identity đang đỗ tại một ô cụ thể; identity có reservation luôn được coi còn hiệu lực và không bị cửa sổ stale từ chối.",
      role: "Bảo vệ xe đỗ lâu khỏi bị coi là hết hạn, và chặn fragment mọc ở chỗ khác nhận nhầm identity đó.",
      example: "GID có reservation mà fragment bắt đầu xa gốc ô đỗ bị reject parked_reservation_origin_miss.",
      page: "handoff-dormant",
      aliases: ["reservation", "parked_identity_reservations"]
    },
    {
      term: "parking episode",
      vi: "sự kiện đỗ xe có phiên bản",
      def: "Bản ghi backend phát hành cho một lần xe vào hoặc rời ô đỗ: mang global_id, slot_id, trạng thái parked/departing/released, frame áp dụng và revision.",
      role: "Nguồn sự thật duy nhất để controller chuyển session sang PARKED hay rời ô trong schema v2 — thay cho heuristic đếm giây đứng yên.",
      example: "Episode state=parked, slot C08, applied_frame 5901 → session của gid đó về PARKED tại C08.",
      page: "gate-session",
      aliases: ["episode", "parking_episodes"]
    },
    {
      term: "prediction radius",
      vi: "bán kính hành lang dự đoán",
      def: "Ngưỡng khoảng cách chuẩn hóa corridor score; fragment bắt đầu xa hơn bán kính này khỏi đoạn dự đoán bị reject teleport.",
      role: "Đặt thước đo vật lý cho thành phần quan trọng nhất của trajectory score.",
      example: "Trong pass world-trajectory, prediction radius bằng dormant match distance đã resolve, 16.218 đơn vị thế giới.",
      page: "trajectory-reid",
      aliases: ["corridor radius"]
    },
    {
      term: "rectangle_line_v1",
      vi: "thuật toán hiệu chuẩn hình chữ nhật + vạch",
      def: "Biến thể calibration của TechGAR: fit homography từ đúng 8 cặp gồm 4 góc hình chữ nhật đo thước và 4 điểm trên một vạch kẻ.",
      role: "Thuật toán build-time tạo ra ma trận cam→world trong file calibration hiện tại.",
      example: "cal-20260927 ghi calibration_algorithm = rectangle_line_v1 với point_count = 8.",
      page: "homography",
      aliases: ["rectangle-line", "rectangle line"]
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
      term: "retention window",
      vi: "cửa sổ lưu giữ identity",
      def: "Khoảng thời gian tối đa một identity dormant được giữ lại để chờ phục hồi, mặc định 60 giây hoặc 180 frame, nhân bốn cho identity established.",
      role: "Giới hạn thời gian một GID còn có thể được nhận lại; hết cửa sổ thì mọi fragment đều nhận GID mới.",
      example: "Hồi sinh cùng camera còn chịu cửa sổ chặt hơn 12 giây vì không có vùng mù giải thích cho gap dài.",
      page: "handoff-dormant",
      aliases: ["identity retention"]
    },
    {
      term: "ROI",
      vi: "vùng quan tâm",
      def: "Vùng đa giác trong frame được phép phân tích; pixel ngoài ROI bị mask bỏ qua hoàn toàn.",
      role: "Loại bỏ chuyển động ngoài bãi (cây, đường đi bộ) trước khi detect xe.",
      example: "Mask ROI che vùng trời và lề đường để motion detection không báo ảo.",
      page: "roi-mask",
      aliases: ["region of interest", "roi mask"]
    },
    {
      term: "Runtime snapshot",
      vi: "bản chụp trạng thái runtime",
      def: "Một JSON duy nhất chứa toàn bộ trạng thái pipeline tại một frame: xe, ô đỗ, episode, camera và sự kiện gần nhất.",
      role: "Điểm giao tiếp duy nhất giữa backend tracking và các consumer phía sau (gate controller, frontend).",
      example: "GET /api/runtime/snapshot trả vehicles + parking_slots + parking_episodes của frame mới nhất.",
      page: "snapshot-api",
      aliases: ["snapshot", "runtime state"]
    },
    {
      term: "schema version",
      vi: "phiên bản hợp đồng dữ liệu",
      def: "Số nguyên gắn vào payload để consumer biết đang đọc định dạng nào; đổi cấu trúc là phải tăng số.",
      role: "Giữ consumer cũ chạy tiếp được khi backend thêm trường mới — schema 2 thêm parking_episodes mà không phá v1.",
      example: "RUNTIME_SCHEMA_VERSION = 2 trong runtime_contract.py.",
      page: "snapshot-api",
      aliases: ["RUNTIME_SCHEMA_VERSION"]
    },
    {
      term: "shared_map_anchor",
      vi: "điểm neo chiếu bản đồ",
      def: "Cờ chọn điểm của bounding box được chiếu lên bản đồ chung: đáy-giữa (bottom_center) hoặc tâm khung (bbox_center).",
      role: "Quyết định quan sát hai camera chiếu về cùng một vị trí vật lý của xe hay về hai đầu đối diện.",
      example: "Với bbox_center, khung cao 80 px được chiếu tại cy trừ 40 px thay vì chính cy.",
      page: "homography",
      aliases: ["anchor", "bbox anchor"]
    },
    {
      term: "stable evidence",
      vi: "bằng chứng bền theo dwell",
      def: "Tầng xác nhận sau vote: đổi sang có xe cần hai mẫu trong 0.5 giây, đổi sang trống cần ba mẫu trong một giây ở ngưỡng khắt khe 0.08.",
      role: "Chống nhấp nháy trạng thái quanh ngưỡng; dwell tính theo timestamp nguồn nên kết quả worker trễ không viết ngược state.",
      example: "Ô E03 hiep3: 17/25 exit votes nhưng 25/25 enter votes — nằm vùng đệm nên giữ trạng thái cũ.",
      page: "parking-detector",
      aliases: ["accept_evidence", "occupied_seconds", "empty_seconds"]
    },
    {
      term: "TemporalSmoother",
      vi: "bộ làm mượt trạng thái theo frame",
      def: "Lớp đếm của parking detector: trạng thái confirmed của ô chỉ đổi khi cùng một kết quả vote được lặp đủ required_frames liên tiếp; smoothing_frames bằng không tương đương tắt.",
      role: "Chống trạng thái ô đỗ nhấp nháy theo nhiễu từng frame; tại runtime smoothing_frames bằng một nên lớp này gần như vô hình — việc latch thật do dwell machine và stable evidence đảm nhiệm.",
      example: "Với required bằng năm, ô phải vote 'có xe' năm frame liền mới lật sang occupied.",
      page: "parking-slots",
      aliases: ["temporal smoother", "smoothing_frames"]
    },
    {
      term: "track",
      vi: "vết đối tượng theo thời gian",
      def: "Chuỗi quan sát cùng một đối tượng qua nhiều frame trên một camera, mang một local id (lid).",
      role: "Đơn vị cơ bản mọi cơ chế sau đều thao tác: gán detection, nuôi Kalman, handoff.",
      example: "Track lid35 sống từ f173 đến f266 trên cam2.",
      page: "track-lifecycle",
      aliases: ["local id", "local track"]
    },
    {
      term: "Tracklet descriptor",
      vi: "đặc trưng ngoại hình của track",
      def: "Bộ mô tả màu sắc của một track cục bộ, gồm nhiều histogram lấy mẫu theo thời gian thay vì một crop duy nhất.",
      role: "Là bằng chứng nhận dạng để so một fragment mới với các identity đã lưu khi quyết định gán hay cấp GID.",
      example: "lid38 trên cam2 và lid26 trên cam1 được nhận là GID 2 nhờ gallery distance 0.272.",
      page: "tracklet-descriptor",
      aliases: ["appearance descriptor", "tracklet"]
    },
    {
      term: "trajectory score",
      vi: "điểm khớp quỹ đạo",
      def: "Điểm tổng hợp trong [0,1] chấm mức độ khớp giữa một fragment mới và quỹ đạo thế giới đã lưu của một identity.",
      role: "Quyết định một quan sát mới được gán vào GID cũ hay bị từ chối dẫn tới cấp GID mới.",
      example: "Ca sang8 f600 chấm 0.6683, dưới ngưỡng 0.78 nên fragment bị cấp gid3.",
      page: "trajectory-reid",
      aliases: ["trajectory_score", "reid score"]
    },
    {
      term: "TrajectorySample",
      vi: "mẫu quỹ đạo",
      def: "Một điểm trong vệt thế giới: số frame, timestamp giây, camera, local id, tọa độ thế giới và kích thước khung.",
      role: "Đơn vị dữ liệu mà trajectory memory lưu trữ và dùng để ước lượng vận tốc cùng hành lang dự đoán.",
      example: "Một fragment cần ít nhất ba TrajectorySample mới đủ điều kiện được chấm điểm.",
      page: "trajectory-reid",
      aliases: ["trajectory sample"]
    },
    {
      term: "WorldTrajectoryMemory",
      vi: "bộ nhớ quỹ đạo thế giới",
      def: "Kho lưu vệt vị trí thế giới có giới hạn hai giây cho mọi identity đã chứng minh và mọi fragment chưa gán, nằm ngoài phần render debug.",
      role: "Cung cấp dữ liệu để chấm trajectory score trong pass nhận dạng cuối trước khi cấp GID mới.",
      example: "Vệt của GID 1 kết thúc ở f295; fragment lid40 tại f595 được so với vệt đó để chấm điểm.",
      page: "trajectory-reid",
      aliases: ["trajectory memory", "world trajectory"]
    }
  ]);
})();
