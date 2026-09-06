# Sửa ổn định ô đỗ và bảo vệ ID — kiểm chứng live15

Ngày kiểm tra: 06/09/2026. Code: `backend/main_detect`.

## 1. Kết luận đúng phạm vi đã đo

Đã triển khai sửa bộ lọc ô đỗ, xác nhận trạng thái theo thời gian nguồn, bảo vệ hai xe khi vùng chuyển động nhập nhau và chặn một số đường gán ID vượt qua kiểm tra an toàn.

**Chưa được kết luận đã giải quyết mọi trường hợp mất/đổi ID.** Đoạn hai xe nhập vùng chuyển động vẫn có lúc mất nhãn; hệ thống giữ hồ sơ danh tính, không ép gán một bbox chung cho một trong hai xe. Chưa chứng minh được nhận lại đúng cả hai xe sau mọi lần tách nhau bằng nhãn đối chiếu đầy đủ.

Nguồn: `backend/main_detect/experiment_test/output/droidcam_shared_live15`. Không chỉnh video, ROI hoặc ground truth của phiên gốc. Phiên thiếu `session_info.json`, vì vậy các lần chạy dưới đây dùng **cấu hình hiện tại**, không phải bản tái tạo chắc chắn cấu hình lúc quay. Mỗi replay cửa sổ có `source_window.json` ghi tham số và hash code khi bắt đầu.

## 2. Các thay đổi đã triển khai

### Ô đỗ: không xóa cả xe vì một vệt trắng nối vào viền

- `parking_detector.py`: chỉ loại phần đường mảnh phù hợp hình học; bảo vệ vùng pixel dày. Không xóa toàn bộ thành phần liên thông chỉ vì nó chạm viền.
- Lọc riêng từng biến thể trong 25 tổ hợp; không dùng mask loại bỏ của một biến thể áp cho toàn bộ 25 biến thể.
- `two_camera.py` dùng ngưỡng vào occupied **0,12**, ngưỡng trở lại empty **0,08**. Đây là giá trị khởi điểm cho mô hình hiện tại, không phải “ngưỡng tốt nhất”.
- Có xe: tối thiểu 2 bằng chứng và 0,5 giây. Trống: tối thiểu 3 bằng chứng và 1 giây. Phải thỏa cả số mẫu lẫn thời gian nguồn.
- Không đếm lại mẫu trùng/cũ; khi khoảng mẫu bị đứt, không cộng dồn thời gian chờ thành bằng chứng liên tục.
- Debug dùng lại đúng bằng chứng đã tính; không chạy detector thêm một lần để vẽ rồi vô tình thay đổi trạng thái.
- Xuất `parking_evidence`: tỷ lệ pixel trước/sau lọc, phần bị loại, số phiếu, trạng thái tức thời/đã xác nhận và frame nguồn.
- Giữ chính sách binder `vision_primary`. Không đổi toàn bộ hệ thống về công thức OR cũ.

Không thay ROI/homography hay ghi đè detector profile đang chỉnh. Profile lúc kiểm tra giữ core cam1=0,80, cam2=0,79.

### Tracking: giữ bằng chứng sạch trước khi hai xe nhập bbox

- `occlusion_guard.py`: ghi nhóm hai track đã có bằng chứng riêng biệt; giữ kích thước sạch và quỹ đạo trước lúc nhập vùng chuyển động.
- `motion_tracker.py`: dự đoán một lần mỗi frame; không lấy kích thước bbox vừa bị phình làm chuẩn để tiếp tục chấp nhận bbox lớn hơn.
- Bbox nhập không cập nhật màu, Kalman, thời điểm quan sát thật hoặc sinh local ID mới cho chính blob đó trong thời gian bảo vệ.
- Watershed thử chia theo điểm gieo lấy từ vị trí dự đoán và pixel foreground thật. Nếu điểm gieo/vùng chia không đủ tin cậy, từ chối thay vì dựng hai hình chữ nhật giả.
- Đối chiếu cả cặp xe theo tổng chi phí phương án đúng và phương án đổi chéo; cần ba frame nhất quán. Một phần chia đã được kiểm chứng chỉ cập nhật hình học, chưa được làm bằng chứng màu hoặc gán ô đỗ.
- Thêm đặc trưng màu hai vùng bbox; vùng thiếu dữ liệu được xem là chưa biết, không tự coi là giống nhau. Không thay định dạng histogram 416 chiều hiện hữu.
- Sau khi nhóm hết thời hạn, blob vẫn bao cả hai vị trí không được lập tức tạo local ID mới trong cửa sổ bảo vệ còn lại của track.

### Global ID: đóng các đường cấp ID bỏ qua bảo vệ

- Giữ hồ sơ ID khác với cho phép nhận lại ID: nhóm đang mơ hồ không được ordinary Re-ID/handoff sử dụng, nhưng không vì thế mà hồ sơ bị cleanup đánh dấu expired.
- Khi kiểm tra một camera đã có chủ ID chưa, dùng toàn bộ quan sát của frame, không chỉ danh sách đối tượng còn lại sau các bước lọc.
- Cặp local/GID đã được chứng minh độc lập không được gộp thành motion echo chỉ vì bbox về sau chạm nhau.
- Không dùng đường tắt `_match_simultaneous_overlap()` của bốn crop pixel cho camera vật lý có calibration. Camera vật lý đi qua nhánh đối chiếu có kiểm tra duy nhất hai chiều, kích thước/ngoại hình và thu thập bằng chứng.
- Các nhánh overlap, claim chờ và world-trajectory đều phải tôn trọng ID đang được bảo vệ do che khuất.
- Sửa bộ đếm ba frame của vùng chia: kích hoạt lại nhóm mỗi frame không được xóa tiến độ xác nhận hợp lệ.

## 3. Kết quả thực nghiệm đã chạy

### Ô đỗ: frame nguồn 2820–3015

Đường dẫn: `backend/main_detect/experiment_test/output/parking_stability_live15_v3_20260906`.

Mỗi camera lấy 37 mẫu cách nhau ít nhất 0,5 giây nguồn. So sánh bản lọc cũ với cấu hình ổn định mới trên cùng frame và profile hiện tại.

| Ô | Số lần đổi trạng thái bản tham chiếu | Bản mới |
|---|---:|---:|
| cam1 / F08 | 6 | 0 |
| cam1 / E10 | 6 | 0 |
| cam2 / A09 | 18 | 0 |

Các ô khác có thể có một lần đổi do khởi tạo/xác nhận ô trống. Những con số này **không phải accuracy**: trạng thái ổn định vẫn có thể sai. Cần nhãn occupied/empty để tính đúng/sai. So sánh này thay đồng thời bộ lọc, ngưỡng và xác nhận thời gian; chưa thể quy toàn bộ cải thiện cho riêng một thành phần.

Chi phí mỗi lần detect, đo trên máy hiện tại:

| Camera | Tham chiếu p50 / p95 | Bản mới p50 / p95 |
|---|---|---|
| cam1 | 139 / 162 ms | 337 / 374 ms |
| cam2 | 137 / 140 ms | 316 / 334 ms |

Bản mới tốn CPU hơn do lọc riêng 25 biến thể. Không gọi đây là bản tối ưu tốc độ; cần theo dõi độ cũ kết quả khi chạy đồng thời hai camera thật.

### Tracking: frame nguồn 3500–3900

Đường dẫn bản kiểm chứng: `backend/main_detect/experiment_test/output/fix_live15_window_v6_20260906`.

Đây là 401 cặp frame chạy qua pipeline thật. Tracker/manager khởi tạo lại ở đầu cửa sổ; **GID trong replay không phải số GID của phiên gốc**. Đổi frame: `frame nguồn = frame output + 3499`.

- Frame nguồn 3722: xe đen G#1, xe xanh G#2.
- Frame 3733: local track thay đổi nhưng xe đen vẫn G#1, xe xanh vẫn G#2.
- Không ghi sự kiện `same_camera_global_conflict_detached` trong cửa sổ bản v6; bản kiểm tra trung gian v5 có 2 sự kiện này.
- Frame 3760: không gán bbox nhập hai xe cho một GID. Hai nhãn bị ẩn khi thiếu quan sát đủ chắc chắn.
- Cuối cửa sổ: registry vẫn giữ hồ sơ 1 và 2 ở trạng thái dormant, không tự xóa vì đang bị che khuất; `next_global_id=3`, không có alias bị gộp trong lần chạy này.
- Có 2 lần mở nhóm che khuất, 1 lần xác nhận nhóm tách, 2 lần từ chối sinh local mới cho blob nhập chưa giải quyết. Đây là log chẩn đoán, không thay thế số ID switch có nhãn.
- Chưa có phân vùng watershed nào được ghi là thành công trong đoạn video này. Cơ chế đã có test, nhưng không được tuyên bố nó đã giải quyết cảnh thật này.

Đã xem ảnh đối chiếu `review_nearby_cam2.png` và video debug. Validator xác nhận metadata/predictions/timestamps/performance/raw/debug đều **401 frame**, đọc được và đồng bộ.

Replay toàn phiên 5730 frame ở `fix_live15_v1_20260906` cũng đạt kiểm tra đồng bộ, nhưng đó là **bản trung gian trước các sửa v6**, không dùng để nghiệm thu thuật toán cuối cùng.

### Ablation cùng cửa sổ 401 frame

Chỉ tắt thành phần ghi trong bảng, giữ các sửa Global ID và detector còn lại. Cả ba lần chạy đều có GID quan sát là 1 và 2, không ghi `same_camera_global_conflict_detached`; điều đó tự nó không chứng minh giữ đúng xe.

| Cấu hình | Quan sát tại frame nguồn 3760 | Nhóm mở / tách được xác nhận |
|---|---|---|
| Đầy đủ v6 | Không gán GID cho bbox chung hai xe | 2 / 1 |
| `--no-occlusion-guard` | **G#2 gắn bbox [1016,496,126,135] bao cả hai xe** | 0 / 0 |
| `--no-spatial-appearance` | Như bản đầy đủ: từ chối bbox chung | 2 / 1 |

Output: `fix_live15_no_guard_20260906` và `fix_live15_no_spatial_20260906`, cùng thư mục `experiment_test/output`. Hai phiên ablation không xuất video mới, nhưng giữ predictions/timestamps/performance và nguồn raw không đổi.

Kết luận có thể rút ra: bộ bảo vệ che khuất chặn được lỗi chấp nhận bbox chung ở cảnh được kiểm tra. **Chưa thấy lợi ích thêm của đặc trưng màu chia vùng trên cảnh này**. Không có bằng chứng để tuyên bố watershed giải quyết cảnh này hoặc mọi tình huống hai xe sát nhau.

### Kiểm thử phần mềm

- Tracking: **344 đạt**.
- Backend session: **26 đạt**.
- Frontend: **58 đạt**, typecheck đạt.
- `git diff --check`: không có lỗi whitespace (Git có cảnh báo LF/CRLF).
- Frontend lint **chưa đạt**: `frontend/src/hooks/useVehicleSession.ts:89`, biến `pending` có thể dùng `const`. Đây là phần đang thay đổi từ đợt trước, không chỉnh frontend trong đợt sửa detector/tracker này.

## 4. Cách chạy và đối chiếu

Lệnh live hiện tại vẫn dùng được; các tính năng mới mặc định bật trong `two_camera.py` và runtime dùng chung parser. Không cần tăng thời gian giữ ID để bật chúng.

Các tùy chọn thêm:

```text
--parking-enter-ratio 0.12
--parking-exit-ratio 0.08
--parking-occupied-seconds 0.5
--parking-empty-seconds 1.0
```

Chỉ khi làm thí nghiệm tắt thành phần:

```text
--legacy-parking-filter
--no-occlusion-guard
--no-watershed
--no-spatial-appearance
```

Tắt một thành phần của code mới là ablation, **không khôi phục nguyên bản commit cũ**. Không dùng các cờ này trong demo mặc định nếu chưa đối chiếu kết quả.

Từ `D:\TechGar2\backend\main_detect`, chạy lại cửa sổ với output chưa tồn tại:

```powershell
& ".\.venv\Scripts\python.exe" .\experiment_test\audit_replay_window.py --replay-session "experiment_test/output/droidcam_shared_live15" --slots-cam1 "config/parking_slots_cam1.json" --slots-cam2 "config/parking_slots_cam2.json" --calibration "config/two_camera.shared_cm_01.json" --mask-cam1 "config/roi_mask_cam1.json" --mask-cam2 "config/roi_mask_cam2.json" --output-dir "experiment_test/output/runtime_review_next" --session-dir "experiment_test/output/review_next" --no-display
```

## 5. Những việc chưa đủ bằng chứng để đóng lỗi

1. Replay **toàn phiên bằng code cuối**, không lấy kết quả v1 làm kết quả cuối.
2. Gán nhãn xe vật lý A/B ở các đoạn áp sát, tách ra, đổi camera và rời ô; tính ID switch, fragmentation, recovery accuracy và coverage. Chưa sửa/điền ground truth gốc.
3. Đặc biệt kiểm tra lúc xe đen tạm mất motion trước khi hai xe chạm: không được đánh đồng “không đổi ID” với “luôn theo dõi được xe”.
4. Kiểm tra live mới để đo độ trễ xác nhận ô và chi phí CPU; không ép thời gian xác nhận rút ngắn chỉ để cửa sổ demo trông nhanh hơn.
5. Xác minh trạng thái ô sau khi xe thật rời đi: chống nhấp nháy không được biến thành giữ ô đỏ mãi.

Không thay ROI/calibration, không đẩy Git, không xóa các phiên gốc. Các output mới nằm riêng trong `experiment_test/output`.
