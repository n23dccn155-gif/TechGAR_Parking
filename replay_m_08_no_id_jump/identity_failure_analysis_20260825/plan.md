# Phân tích và kế hoạch sửa lỗi Global Vehicle ID — replay M08

## 1. Mục tiêu và dữ liệu kiểm tra

Mục tiêu là loại bỏ ba nhóm lỗi trong trường hợp nhiều xe đi gần nhau: một xe lấy Global ID của xe khác, hai xe đổi ID sau khi chạm/chạy song song/nối đuôi, và xe xuất hiện lại với ID mới sau một khoảng mất detection.

Dữ liệu được dùng làm bằng chứng:

- Session raw, không được thay đổi: `backend/main_detect/experiment_test/output/droidcam_shared_m_08`
- Replay baseline: `backend/main_detect/experiment_test/output/replay_m_08_no_id_jump`
- Runtime ID baseline: `2f806f8b9d0c40958640a5d1eadb6c46`
- Số frame: `1340`
- Xe A: xe cảnh sát trắng/xanh/cam, GID chuẩn `1`
- Xe B: xe màu đen, GID chuẩn `2`
- Xe C: xe màu đồng/nâu, GID chuẩn `3`

Hai session trên phải được giữ nguyên. Replay sau sửa phải ghi sang `replay_m_08_identity_fix_v1` và runtime output tương ứng, tuyệt đối không ghi đè baseline.

## 2. Danh sách lỗi đã xác nhận theo frame

### 2.1. Xe A bị gán GID của xe B

- Frame `650–661`, tổng 12 frame, khoảng 3 giây.
- CAM1 Local ID `37` là xe A nhưng bị bind thành GID `2`.
- Cùng thời điểm, CAM2 Local ID `40` vẫn là xe B và vẫn mang GID `2`.
- CAM2 Local ID `41` vẫn là xe A và mang đúng GID `1`.
- Frame 650 phát sinh `handoff_matched` với chỉ `evidence_frames=1`, score `0.684`, appearance distance `0.433`, tracklet support `1`.
- Sau binding sai, candidate GID `1` bị từ chối từ frame 651–661 bởi `same_camera_live_owner_conflict` vì target đã bị GID `2` chiếm trước.

### 2.2. Xe B lấy GID của xe A

- Frame `691–694` và `697–698`, tổng 6 frame sai.
- CAM1 Local ID `39` là xe B nhưng bị bind thành GID `1`.
- GID `1` vẫn đồng thời xuất hiện đúng trên xe A ở CAM2.
- Candidate đúng GID `2` có world residual `4.91 cm` nhưng bị loại do appearance distance `0.474` vượt hard threshold `0.45`.
- Candidate sai GID `1` có appearance distance `0.417` và được bind ngay với `evidence_frames=1`.
- Chuỗi của xe B: đúng GID `2` đến frame 694; không có active ID ở 695–696; sai GID `1` ở 697–698; không có active ID ở 699; trở lại GID `2` tại frame 700.

### 2.3. Các khoảng mất active identity

Xe A, GID chuẩn `1`, mất active identity ngoài trạng thái đỗ:

- `458–649`
- `719–731`
- `735–737`
- `747–749`
- `762–765`
- `771–773`
- `805–807`
- `921–923`
- `1308–1340`
- Tổng: `257 frame`, khoảng `78.657 giây`.

Xe B, GID chuẩn `2`, mất active identity:

- `567–580`
- `584–604`
- `630–633`
- `639–648`
- `666–667`
- `669–670`
- `683–686`
- `695–699`
- `724`
- `731–737`
- `745`
- `755–757`
- `768–774`
- `777–779`
- `788–790`
- `792–794`
- `810–975`
- `982–1088`
- `1104–1138`
- `1141–1145`
- `1153–1158`
- Tổng: `409 frame`, khoảng `124.235 giây`.

Xe C:

- GID `3` xuất hiện đúng ở frame `896–897`.
- Không còn active identity ở `898–1097`, tổng `200 frame`, khoảng `60.024 giây`.

Các khoảng sau là reservation đỗ xe đúng của xe A, không phải lỗi và không được sửa bằng cách thay đổi slot binder:

- D04: `830–875`
- C04: `924–1212`
- D04: `1220–1306`

## 3. Nguyên nhân gốc

### Cross-camera manager

1. Candidate được tăng evidence trước khi LAPJV quyết định cặp cuối cùng. Một cặp không thực sự được chọn vẫn có thể tích lũy bằng chứng.
2. Candidate đúng ở frame 691 bị hard-filter khỏi cost matrix. Vì vậy assignment margin không nhìn thấy đối thủ đúng và candidate sai được coi là duy nhất.
3. Overlap handoff mức trung bình có thể commit ngay sau một frame.
4. Cơ chế tự merge hai GID trong overlap chỉ dựa vào mutual uniqueness trong một vài frame; nếu hai xe đã có GID ổn định đi sát nhau, cơ chế này vẫn có thể nhập nhầm hai identity.

### Local motion tracker

1. Cửa sổ reacquire cũ chỉ `0.75 giây`, ngắn hơn thời gian contour bị gộp hoặc mất khi hai xe chạm nhau.
2. Track confirmed chuyển sang LOST ngay khi miss một detection; chỉ fresh track được đưa vào association bên ngoài.
3. Khi contour tách lại, LAPJV có thể chọn một trong hai phép gán gần ngang điểm và làm hai Local ID đổi lineage.
4. Merged contour phải là measurement không đáng tin: không được dùng nó để cập nhật bbox, Kalman measurement, appearance hay gallery.

## 4. Logic sửa đã chọn

### 4.1. Cross-camera handoff

- Giữ hard appearance gate `<= 0.45`.
- Cho candidate target-camera có appearance `> 0.45` và `<= 0.60` vào cost matrix dưới dạng soft candidate khi world residual nằm trong `cross_camera_duplicate_distance` của calibration; candidate này tham gia tính ambiguity nhưng không được bind ngay.
- Giới hạn adaptive appearance của overlap ở `0.60`.
- Chỉ tăng evidence cho cặp được LAPJV chọn sau khi đã đạt assignment margin `0.08`.
- Nếu source hoặc target thay đổi, xóa streak cũ; evidence của cặp trước không được chuyển sang cặp mới.
- Overlap candidate mạnh cần 2 frame liên tiếp: appearance `<= 0.30`, tracklet support `>= 2`, residual trong `strong_spatial_distance`, margin `>= 0.08`.
- Mọi overlap candidate khác cần 3 frame liên tiếp.
- Trong thời gian chưa đủ evidence hoặc chưa đủ margin, target chưa bind phải được giữ ID-less và không được cấp GID mới.
- Auto merge trong overlap chỉ được dùng để sửa race khi ít nhất một GID mới không quá 3 frame. Hai GID đã ổn định đều lớn hơn 3 frame tuyệt đối không được tự merge chỉ vì ở gần nhau.

### 4.2. Local MOT

- Cửa sổ reacquire thông thường: `1.5 giây`.
- Track vừa gặp `merged_detection_frozen` hoặc `oversized_detection_frozen`: giữ điều kiện reacquire trong `3.0 giây`.
- Merged contour tiếp tục bị loại khỏi measurement và không tạo Local ID mới.
- Sau merged/lost, phép gán phải hơn lựa chọn thứ hai ít nhất `0.08`. Nếu không đủ margin, giữ track ở trạng thái coast và giữ detection ở trạng thái ambiguous; không tạo fragment mới từ detection đó.
- Coasting track không phải fresh observation, không được làm nguồn handoff, cập nhật appearance/gallery, tạo GID hay claim slot.
- Local fragment hết cửa sổ mới được coi là stale. Nếu detection quay lại trong cửa sổ và assignment đủ margin, phải dùng lại Local ID cũ; Global ID mapping vì vậy cũng được giữ nguyên.

### 4.3. Phạm vi không thay đổi

- Không sửa slot binder, parking detector, calibration hay ROI để che lỗi identity.
- Không merge GID `1` và GID `2`.
- Không đổi HTTP endpoint hoặc frontend state contract.
- Không coi một validator pass là bằng chứng identity pass khi ground truth CSV còn rỗng.

## 5. Regression test bắt buộc

Các test phải khóa được các invariant sau:

1. Candidate overlap appearance trung bình không bind ở frame đầu hoặc frame thứ hai; chỉ bind sau 3 frame liên tiếp cùng cặp.
2. Candidate đúng có appearance `0.474` và residual gần `4.91 cm` vẫn nằm trong ma trận; nó phải chặn candidate sai hard-match nếu margin nhỏ hơn `0.08`.
3. Evidence chỉ thuộc cặp sau LAPJV và reset khi source/target đổi.
4. Hai xe tách ra sau merged contour trong vòng 3 giây giữ đúng Local ID dù detection được trả về theo thứ tự ngược.
5. Phép gán sau split không đủ margin phải coast, không swap và không tạo Local ID mới.
6. Hai GID đã ổn định không được auto merge trong overlap.
7. Toàn bộ test cross-camera và motion tracker cũ vẫn pass sau khi cập nhật các kỳ vọng handoff sang contract 2–3 frame.

Lệnh test:

```powershell
python -B -m pytest backend/main_detect/tests/test_cross_camera_manager.py backend/main_detect/tests/test_motion_tracker_multiscale.py -q --basetemp "$env:TEMP\techgar_pytest_m08_fix"
```

## 6. Full replay và tiêu chí nghiệm thu

Chạy replay sang session mới:

```powershell
python -B backend/main_detect/run_two_camera_session.py --replay-session backend/main_detect/experiment_test/output/droidcam_shared_m_08 --slots-cam1 backend/main_detect/config/parking_slots_cam1.json --slots-cam2 backend/main_detect/config/parking_slots_cam2.json --calibration backend/main_detect/config/two_camera.shared_m_01.json --mask-cam1 backend/main_detect/config/roi_mask_cam1.json --mask-cam2 backend/main_detect/config/roi_mask_cam2.json --tracking-roi-cam1 backend/main_detect/config/roi_mask_cam1.json --tracking-roi-cam2 backend/main_detect/config/roi_mask_cam2.json --output-dir backend/main_detect/runtime_local/replay_m_08_identity_fix_v1 --session-dir backend/main_detect/experiment_test/output/replay_m_08_identity_fix_v1 --no-session-video --no-display
```

Replay chỉ được chấp nhận khi:

- Đủ `1340` frame và `validate_session.py` pass.
- Xe A không mang GID `2`; xe B không mang GID `1` ở bất kỳ frame nào.
- Không có `handoff_matched*` với `evidence_frames=1` trong calibrated overlap.
- Không phát sinh GID lớn hơn `3`.
- Không có cùng một GID gắn lên hai xe vật lý khác nhau.
- Detection quay lại sau coasting phải phục hồi cùng GID, không tạo GID mới.
- Reservation đúng của GID `1` tại D04/C04/D04 vẫn giữ nguyên.
- Mỗi lỗi ở mục 2 được ghi kết quả `fixed` hoặc `failed` cùng frame bằng chứng.

## 7. Kết quả thực thi

### 7.1. Thay đổi đã triển khai

- `CrossCameraManager` giữ soft candidate `0.45–0.60` trong cost matrix ở vùng overlap, nhưng chỉ bind sau assignment margin và temporal evidence.
- Evidence chỉ tăng cho cặp được LAPJV chọn; streak bị reset khi source hoặc target đổi.
- Strong overlap handoff cần 2 frame; các overlap handoff còn lại cần 3 frame.
- Hai GID đã ổn định hơn 3 frame không còn được auto merge vì proximity trong overlap.
- `MotionVehicleTracker` dùng reacquire `1.5 giây`; track vừa qua merged contour được bảo vệ `3.0 giây`.
- Assignment sau split thiếu margin `0.08` sẽ coast thay vì swap Local ID hoặc tạo fragment mới.

### 7.2. Unit và integration test

- Regression trọng tâm cross-camera/MOT: `109 passed`.
- Toàn bộ `backend/main_detect/tests`: `284 passed`.
- Cảnh báo duy nhất là pytest không ghi được `.pytest_cache` trong workspace (`WinError 5`); test vẫn chạy xong và không có failure.

### 7.3. Full replay sau sửa

- Session: `backend/main_detect/experiment_test/output/replay_m_08_identity_fix_v1`
- Runtime output: `backend/main_detect/runtime_local/replay_m_08_identity_fix_v1`
- Runtime ID: `958f7f94b68b4c969420c778fc1cf222`
- Trạng thái: `completed_replay`
- Đủ `1340/1340` metadata, predictions, timestamps và performance row.
- `validate_session.py`: `PASS`.
- Chỉ có GID `1`, `2`, `3`; `next_global_id=4`, nghĩa là không sinh GID `4+`.
- `retired_global_ids={}` và không có event `global_id_merged`.

Các handoff được commit trong replay mới:

- Frame 652: GID `1`, CAM2/L37 sang CAM1/L36, appearance `0.240`, support `2`, evidence `2`.
- Frame 693: GID `2`, CAM2/L38 sang CAM1/L37, appearance `0.398`, support `1`, evidence `3`.
- Frame 775: GID `1`, evidence `3`.
- Frame 810: GID `1`, evidence `3`.
- Frame 892: GID `1`, evidence `3`.
- Không còn handoff nào commit với `evidence_frames=1`.

### 7.4. Kết quả từng lỗi baseline

Lỗi frame `650–661`: **fixed**.

- Frame 650–651, CAM1/L36 được giữ unassigned trong thời gian probation, không lấy GID `2`.
- Frame 652–661, CAM1/L36 nhận đúng GID `1` của xe A.
- Trong cùng thời gian, xe B trên CAM2/L38 tiếp tục giữ GID `2`.

Lỗi frame `691–698`: **fixed**.

- Frame 691–692, CAM1/L37 được giữ unassigned thay vì nhận GID sai.
- Frame 693–694 và 697–698, CAM1/L37 nhận đúng GID `2` của xe B.
- Xe A trên CAM2/L37 vẫn giữ GID `1`.

Kiểm tra toàn bộ crop segment có GID của replay mới:

- Tất cả segment GID `1` thuộc xe cảnh sát A.
- Tất cả segment GID `2` thuộc xe đen B.
- Tất cả segment GID `3` thuộc xe nâu C.
- Không còn đoạn A mang GID `2`, B mang GID `1`, hoặc một xe xuất hiện lại bằng GID mới.

Slot ownership không bị regression: các frame slot có canonical owner GID `1` giống hệt baseline, gồm các đoạn bắt đầu tại D04 frame 830, C04 frame 924 và D04 frame 1220; các khoảng trống ngắn do vision/smoothing cũng giống baseline.

### 7.5. Trạng thái mất detection còn lại

Logical identity continuity đã được sửa: khi xe được detect lại, A luôn trở về GID `1`, B trở về GID `2`, C trở về GID `3`; registry dùng `dormant/handoff/expired` và không cấp GID mới.

Tuy nhiên `predictions.jsonl` vẫn có các khoảng không có **fresh active observation** vì motion detector không tạo bbox khi xe đứng yên, bị che hoặc foreground bị phân mảnh. Đây không còn là ID switch/new-ID nhưng vẫn làm nhãn bbox tạm biến mất trên debug view. Các khoảng của replay mới theo tiêu chí “không có fresh GID và không có slot owner”:

- GID `1`: 299 frame trong cửa sổ theo dõi.
- GID `2`: 445 frame trong cửa sổ theo dõi.
- GID `3`: frame `898–1097`, tổng 200 frame.

Không được giải quyết các khoảng dài này bằng cách vẽ một bbox cũ vô thời hạn hoặc cấp GID mới. Nếu yêu cầu sản phẩm là nhãn phải luôn hiện ngay cả khi không có motion detection, bước tiếp theo phải bổ sung một nguồn object-presence/segmentation hoặc trạng thái UI `dormant` tại vị trí cuối cùng, tách biệt rõ với fresh observation.

Một ghost motion bbox của chính xe A còn xuất hiện tại CAM2/L104 frame `1214–1219`: bbox nằm ở vùng motion-tail phía sau xe, mang đúng GID `1` và không chiếm ID của xe khác. Đây là lỗi chất lượng bbox/detection còn lại, không phải lỗi đổi Global ID; không được dùng bbox này để cập nhật appearance gallery hoặc slot claim.
