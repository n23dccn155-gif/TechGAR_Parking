# MEGAPLAN — Replay toàn bộ video với config HIỆN TẠI, kiểm lỗi từng frame, CHỈ BÁO CÁO (không sửa)

Team: `lead` (Codex, w1:p6) CHỈ quản lý/phân công/tổng hợp. `builder-a`, `builder-b`, `builder-c` (Devin) thực hiện.
Thư mục làm việc báo cáo: `D:\TechGar2\.analysis\verify-replay\`.
Code/ dữ liệu: `D:\TechGar2\backend\main_detect\` (venv: `.\.venv\Scripts\python.exe`, Python 3.11).
Video: `backend\main_detect\experiment_test\output\<session>\raw_cam1.mp4` + `raw_cam2.mp4` (1280x720, 25 fps).

## 0. Quy tắc cứng
1. **KHÔNG sửa bất kỳ file code hay config nào** (`src\`, `two_camera.py`, `runtime_server.py`, `config\*`, `tests\*` có sẵn). Mục tiêu là PHÁT HIỆN và MÔ TẢ lỗi. Không đề xuất sửa trong báo cáo lỗi, chỉ ghi nghi vấn nguyên nhân (§5.6). User sẽ xem rồi quyết định.
2. **Chỉ được tạo file MỚI**: báo cáo trong `.analysis\verify-replay\`, công cụ mới trong `backend\main_detect\experiment_test\verify\` (tạo thư mục này), kết quả replay trong thư mục output MỚI. TUYỆT ĐỐI không ghi đè/xóa bất kỳ thư mục nào đang có trong `experiment_test\output\` (kể cả `session_*`, `reidfix_*`, `runtime_*`). Dùng tiền tố `verify_cur_` cho mọi output mới.
3. **Config dùng bản HIỆN TẠI, không đổi** (theo yêu cầu user): ROI mask `config\roi_mask_cam1.json`, `config\roi_mask_cam2.json`; calibration `config\two_camera.shared_cm_01.json`; slots `config\parking_slots_cam1.json`, `config\parking_slots_cam2.json`; gate `config\gate_zones.json`.
4. **Đóng băng code** trong suốt chiến dịch: không ai (kể cả nhóm merge/split) sửa `src\` khi đang replay. Trước khi replay, builder-b ghi `git rev-parse HEAD`, `git status --porcelain` (chỉ phần `backend`), và hash `sha256` của 5 file config trên vào `V0-environment.md` để tái lập.
5. Lead KHÔNG tự chạy replay, không tự xem frame, không tự phân tích code. Lead chỉ giao việc, kiểm tra output (đọc báo cáo ngắn của builder), yêu cầu làm lại phần thiếu, rồi tổng hợp. Hạn mức Codex của lead thấp: đọc báo cáo tóm tắt, không đọc file `predictions.jsonl` hay ảnh.
6. Không quét `.venv`, `node_modules`, không `find`/`grep` đệ quy trong `experiment_test\output` (12 GB). Đọc đúng session cần.
7. Prompt lead gửi builder phải NGẮN, chỉ trỏ tới mục trong file này.
8. Builder gần đầy context (>75%) ghi tiến độ vào `progress-<tên>.md` rồi báo lead; lead báo user.

## 1. Cảnh báo kỹ thuật đã biết (builder phải đưa vào báo cáo, KHÔNG được bỏ qua)
- `docs\lenh-chay-theo-session.md` ghi rõ: mỗi video quay ở góc cam khác nhau, **chạy video cũ với ROI/slots/calibration hiện tại có thể gây lệch map / reject detection sai**. User đã quyết định dùng config hiện tại. Vì vậy mọi lỗi phải được phân loại thêm cờ `config_era_suspected` khi nguyên nhân khả dĩ là lệch config chứ không phải lỗi thuật toán. Cách xác định: bước V2 (kiểm căn chỉnh) bên dưới.
- Phần lớn `ground_truth_identity.csv` chỉ có dòng tiêu đề (chưa có nhãn thật); `session_thai8` có 25 dòng `ground_truth_events.csv`. ⇒ KHÔNG có ground truth đầy đủ. "Đúng/sai" phải do đối chiếu hình ảnh thực (frame gốc) với kết quả dự đoán (overlay) và các kiểm tra nhất quán tự động. Mọi lỗi ghi rõ độ tin cậy.
- `session_hiep_thai2` chỉ có 1 frame trong video ⇒ ghi nhận hỏng, không replay (báo cáo như một lỗi dữ liệu).
- Quy mô thật: 18 session dùng được, tổng ≈ 41.600 cặp frame (≈ 83.000 frame hai cam), tốc độ xử lý ghi nhận ≈ 6.5 fps ⇒ riêng replay cần khoảng 1.5–2 giờ tính tuần tự. Con người/LLM KHÔNG thể xem trực tiếp từng frame trong 83.000 frame. Do đó dùng hai lớp (xem §3): (A) kiểm tra TỰ ĐỘNG trên 100% frame, (B) kiểm tra HÌNH ẢNH trên mọi cửa sổ bị cờ + lấy mẫu dày đều. Báo cáo phải ghi rõ độ phủ thực tế (bao nhiêu % frame được mắt xem, bao nhiêu % chỉ qua kiểm tra tự động). Không được tuyên bố "đã xem từng frame" nếu không đúng.

## 2. Danh sách session và phân công (cân bằng ≈ 13.9k cặp frame mỗi người)
| Builder | Session (số cặp frame) | Tổng |
|---|---|---|
| builder-a | thai1 (6050), thai6 (5937), sang9 (727), hiep2 (642), toi4 (620), test1 (298) | 14.274 |
| builder-b | thai3 (5965), thai4 (5764), hiep1 (1049), toi6 (865) | 13.643 |
| builder-c | thai5 (3977), thai7 (2872), thai8 (1952), runtime_session_bt (1529), sang8 (929), hiep3 (826), sang7 (817), toi5 (806) | 13.708 |
(Tên đầy đủ: `session_hiep_thai1`, `session_thai6`, `session_hiep_sang9`, `session_hiep2`, `session_hiep_toi4`, `session_test1`, `session_hiep_thai3`, `session_hiep_thai4`, `session_hiep1`, `session_hiep_toi6`, `session_hiep_thai5`, `session_thai7`, `session_thai8`, `runtime_session_bt`, `session_hiep_sang8`, `session_hiep3`, `session_hiep_sang7`, `session_hiep_toi5`.) Builder xác nhận lại danh sách bằng `ls` đúng thư mục (không đệ quy).

## 3. Quy trình (Phase V0 → V6)

### V0 — Môi trường (builder-b, ~10 phút) → `V0-environment.md`
Ghi git HEAD/status, hash config, phiên bản Python/cv2/numpy, `runtime_server.py --help` và `two_camera.py --help` (các cờ liên quan replay, `--no-display`, `--no-session-video`, `--opencv-threads`, `--api-port`, `--replay-session`), dung lượng đĩa trống, số CPU. Chọn LỆNH REPLAY chuẩn:
- Ưu tiên lệnh "runtime" user yêu cầu: mẫu trong `docs\lenh-chay-theo-session.md` §6 nhưng THAY toàn bộ đường dẫn config bằng config hiện tại (mục §0.3), `--cam1-video/--cam2-video` trỏ `raw_cam1/2.mp4`, `--output-dir experiment_test\output\verify_cur_runtime_<S>`, `--session-dir experiment_test\output\verify_cur_<S>`, `--no-display`, `--api-port` KHÁC NHAU cho mỗi tiến trình chạy song song.
- Nếu `runtime_server.py` bị giới hạn theo thời gian thực (≈ 25 fps video, quá chậm) hoặc không phát hành đủ predictions, dùng `two_camera.py --replay-session <session>` như `run_r5.sh`/`replay_acceptance.py` với config hiện tại, nhưng chỉ sau khi chứng minh đầu ra tương đương (cùng schema `predictions.jsonl`). Ghi rõ lựa chọn và lý do.
- Replay phải ghi `predictions.jsonl` đủ mọi frame, KHÔNG xóa log/event. Lưu stdout/stderr vào `verify_cur_<S>.log` (trong output mới).

### V1 — Replay hàng loạt (builder-b chạy, các builder khác KHÔNG chạy replay riêng để tránh tranh CPU)
- Viết `experiment_test\verify\run_verify_replays.py` (hoặc `.sh`) chạy tất cả session, tối đa 3 tiến trình đồng thời (`--opencv-threads 1`), in START/FINISH, ghi bảng kết quả `V1-replay-results.md`: mỗi session: lệnh đầy đủ, exit code, thời gian, số frame video vs số dòng predictions vs `record_counts` trong `session_info.json`, cảnh báo/log lỗi/traceback trong log, dung lượng.
- Mọi session replay lỗi hay thiếu frame ⇒ ghi lỗi `REPLAY_FAILURE` (đây cũng là lỗi cần báo cáo), không bỏ qua, không tự sửa.
- Thứ tự: chạy session ngắn trước (cho phép builder khác bắt đầu V3/V4 sớm), session dài sau.

### V2 — Kiểm căn chỉnh config với cảnh (từng builder, session của mình; có thể làm song song khi chờ V1)
Với mỗi session, dựng 1 ảnh từ frame đầu và frame giữa của mỗi cam có vẽ ROI mask hiện tại + ô đỗ hiện tại (công cụ: `render_gid_frames.py` hoặc script riêng trong `experiment_test\verify\`), nhìn bằng mắt: ROI/slots có khớp cảnh (lề đường, ô đỗ thật) không? Kết luận từng session/cam: `ALIGNED` / `PARTIAL` / `MISALIGNED` + ảnh bằng chứng. Ghi `V2-alignment-<tên>.md`. Mọi lỗi phát hiện ở session `MISALIGNED/PARTIAL` được gắn `config_era_suspected`.

### V3 — Kiểm tra tự động 100% frame (builder-a viết công cụ, mỗi builder chạy cho session của mình) → `experiment_test\verify\scan_frames.py` + `V3-scan-<tên>.md`
Đọc `predictions.jsonl` từng frame (+ `frame_timestamps.csv`), áp ROI mask hiện tại, in danh sách "frame bị cờ" theo loại:
1. Dữ liệu/Replay: frame bị thiếu/trùng, `frame_idx` nhảy, timestamp lùi/khoảng trống lớn, `camera_skew_ms` lớn, số dòng ≠ số frame video.
2. Local track: ID xuất hiện/biến mất đột ngột gần nhau (nghi ID switch/fragment), nhảy vị trí lớn giữa 2 frame, nhảy kích thước bbox, 2 track chồng nhau mạnh (nghi echo/duplicate), track ngoài ROI, track đứng yên bất thường, track sống quá ngắn (nhiễu), tracks cùng frame IoU cao.
3. Global ID: một GID trên hai vị trí xa nhau cùng lúc/cùng cam, một local ID đổi GID liên tục (flap), GID mới sinh ra ngay cạnh vị trí GID cũ vừa biến mất (nghi mất lineage), GID "ma" (không còn track nhưng vẫn hiện).
4. Cross-camera: handoff mở nhưng không khớp/khớp sai thời gian bất hợp lý, GID xuất hiện ở cam 2 không có tiền thân.
5. Ô đỗ/binder: slot đổi trạng thái liên tục (flicker), xe đứng yên trong polygon nhưng slot báo free, slot occupied mà không có xe trong thời gian dài, sự kiện parking/departure mâu thuẫn với track.
6. Occlusion/merge-split: các event `occlusion_group_opened/recovered/expired`, `split_assignment_deferred`, `association_recovery_pending`, `new_local_id_deferred_unresolved_merge` được liệt kê thành cửa sổ để xem bằng mắt.
7. Lỗi/exception/cảnh báo trong log replay.
Mỗi cờ ghi: session, cam, frame_idx đầu-cuối, loại, giá trị đo, ngưỡng. Công cụ chạy trên 100% frame; báo cáo nêu tổng số cờ theo loại và tỷ lệ frame bị cờ. Ngưỡng ghi rõ trong code (hằng số đặt tên) để người khác tái lập.

### V4 — Kiểm tra bằng HÌNH ẢNH (mỗi builder, session của mình)
Công cụ (builder-c viết, dùng chung): `experiment_test\verify\make_sheets.py` ghép lưới ảnh (ví dụ 3x3 hoặc 2x3, mỗi ô là frame GỐC kèm overlay: bbox track + local ID + GID + trạng thái + ROI + slots + nhãn `frame_idx`/thời gian) từ `raw_cam*.mp4` + `predictions.jsonl`; ghi JPEG nhỏ vào `.analysis\verify-replay\sheets\<session>\`. Xem ảnh bằng công cụ đọc ảnh.
Phạm vi xem bằng mắt cho mỗi session:
- **Mọi cửa sổ bị cờ ở V3** (±15 frame quanh cờ, gom cờ gần nhau thành 1 cửa sổ). Nếu quá nhiều cờ, ưu tiên theo mức nghiêm trọng (§5.5) và ghi số cửa sổ bị bỏ qua + lý do.
- **Lấy mẫu đều**: ≥ 1 frame mỗi 2 giây video trên mỗi cam (≈ 12 frame/phút/cam), ghép sheet. Đây là cách duy nhất khả thi để "đọc frame" toàn session; ghi rõ khoảng cách mẫu thực tế.
- **Mọi lần xe vào/ra khung, đỗ, rời ô, hai xe gần nhau/che nhau, chuyển cam**: xem dày hơn (mỗi 5 frame) quanh sự kiện.
Với mỗi sheet, đối chiếu từng ô: (1) mắt thấy mấy xe thật; (2) dự đoán có bao nhiêu track/GID và đặt có đúng xe không; (3) ID có giữ nhất quán với sheet trước không; (4) bbox có bám xe không; (5) ô đỗ báo đúng trạng thái không. Ghi lỗi đúng định dạng §5.

### V5 — Kiểm chéo (mỗi builder kiểm 20% finding của người khác, chọn ngẫu nhiên có seed)
Xem lại ảnh bằng chứng và kết luận `CONFIRMED` / `REJECTED` / `UNSURE`. Ghi `V5-crosscheck-<tên>.md` kèm tỷ lệ false positive ước tính theo loại lỗi.

### V6 — Lead tổng hợp (không tự sửa)
Lead đọc báo cáo của builder (ngắn gọn), tạo:
- `ERRORS-SUMMARY.md`: bảng lỗi theo loại × mức nghiêm trọng × session; tách riêng `config_era_suspected`; nhóm các lỗi cùng nghi nguyên nhân (cluster); top lỗi nghiêm trọng nhất với đường dẫn ảnh bằng chứng; tỷ lệ false positive từ V5; độ phủ kiểm tra thực tế; các session replay lỗi; các giới hạn/không chắc chắn.
- `QUESTIONS-FOR-USER.md`: những điểm cần user quyết định (ví dụ có đồng ý chạy lại các session MISALIGNED với calibration/mask đúng era để phân biệt lỗi thuật toán với lỗi config).
- `STATUS.md`.
KHÔNG đề xuất mã sửa, KHÔNG sửa code. Dừng và báo user.

## 4. Phân công theo phase và song song hóa
| Thời điểm | builder-a | builder-b | builder-c |
|---|---|---|---|
| Khi bắt đầu | viết `scan_frames.py` (V3) | V0 rồi V1 (replay, ưu tiên session ngắn) | viết `make_sheets.py` (V4) và hỗ trợ V2 cho session của mình |
| Khi có kết quả replay của session | V2 → V3 → V4 → V5 | V2 → V3 → V4 → V5 | V2 → V3 → V4 → V5 |
Lead giao theo mức độ sẵn sàng; builder nào xong sớm chủ động xin session của người trễ (qua lead).
Lưu ý: nhóm merge/split P0 đang chạy cùng team. Lead tự quyết định thứ tự, khuyến nghị: để P0 (chỉ đọc/ghi file mới) kết thúc trước khi V1 chiếm CPU, nhưng việc viết công cụ V3/V4 có thể chạy ngay. Kết quả replay này đồng thời là BASELINE "trước khi sửa" cho nhóm merge/split.

## 5. Định dạng báo cáo lỗi (mỗi builder: `ERRORS-<tên>.md`, sinh thêm `ERRORS-<tên>.json` có cùng cấu trúc)
Mỗi lỗi một mục, đánh số `E-<builder>-NNN`:
1. **Vị trí**: session, cam, frame_idx đầu–cuối, thời gian (giây).
2. **Loại lỗi** (một trong): `REPLAY_FAILURE`, `DATA_INTEGRITY`, `MISSED_DETECTION`, `FALSE_DETECTION`, `BBOX_QUALITY`, `ID_SWITCH_LOCAL`, `ID_FRAGMENT/NEW_ID`, `TRACK_LOST_EARLY`, `GHOST_TRACK`, `DUPLICATE_TRACK`, `MERGE_SPLIT_ERROR`, `GID_SWITCH`, `GID_NEW_LINEAGE_LOSS`, `GID_CONFLICT`, `HANDOFF_ERROR`, `SLOT_STATE_ERROR`, `SLOT_BINDING_ERROR`, `EVENT_INCONSISTENT`, `ROI_MISMATCH`, `OTHER`.
3. **Mô tả**: mắt thấy gì (frame gốc) và hệ thống dự đoán gì (local ID, GID, trạng thái, slot), nêu cụ thể khác nhau ở đâu.
4. **Bằng chứng**: đường dẫn sheet + vị trí ô + frame_idx; giá trị đo từ V3 nếu có; trích dòng event/predictions liên quan (ngắn).
5. **Mức nghiêm trọng**: `S1` làm hỏng kết quả cuối (mất xe, nhầm xe, slot sai kéo dài), `S2` sai tạm thời tự hồi phục, `S3` thẩm mỹ/nhiễu nhẹ.
6. **Nghi vấn nguyên nhân (không phải sửa)**: một trong `detection/morphology`, `tracking/assignment`, `occlusion-guard`, `local-lifecycle`, `reid/appearance`, `global-id`, `cross-camera-handoff`, `slot-detector/binder`, `config-mask/calibration`, `data/replay`, `unknown`, kèm lý do ngắn; có đánh dấu `config_era_suspected` nếu V2 báo lệch.
7. **Độ tin cậy**: `HIGH` (thấy rõ trên nhiều frame) / `MEDIUM` / `LOW` (chỉ nghi, một frame, hình mờ).
8. **Tái lập**: lệnh/đoạn script mở đúng cửa sổ frame (ví dụ `make_sheets.py --session ... --cam ... --start ... --end ...`).
Cuối file: tóm tắt đếm theo loại/mức, độ phủ (frame được xem bằng mắt / tổng, khoảng cách lấy mẫu, số cửa sổ cờ không xem được + lý do), danh sách điểm không chắc.

## 6. Tiêu chí hoàn thành chiến dịch
- [ ] 18 session đều được replay bằng config hiện tại (hoặc ghi rõ lý do hỏng), có bảng `V1-replay-results.md`.
- [ ] V2 kết luận căn chỉnh cho mọi session/cam.
- [ ] V3 chạy trên 100% frame của mọi session replay thành công, có số liệu.
- [ ] V4 phủ mọi cửa sổ cờ (hoặc ghi rõ phần bỏ) + lấy mẫu đều đã nêu; độ phủ thực tế được báo trung thực.
- [ ] V5 hoàn tất, có tỷ lệ false positive.
- [ ] Lead có `ERRORS-SUMMARY.md`, `QUESTIONS-FOR-USER.md`. Không có bất kỳ thay đổi nào trong `src\`, `config\`, `tests\` có sẵn (lead kiểm tra bằng `git status`/`git diff --stat` của `backend` và báo kết quả).
