# Kế hoạch sửa triệt để luồng xác nhận đỗ xe và lấy xe

Ngày lập: 2026-08-26  
Phạm vi: frontend khách hàng, API phiên xe ở cổng `8000`, và contract runtime ở cổng `8001`  
Trạng thái tài liệu: kế hoạch triển khai; chưa sửa code chức năng trong tài liệu này

## 1. Mục tiêu cuối cùng

Sau khi hoàn thành, hệ thống phải đáp ứng đồng thời các yêu cầu sau:

1. Ô đỗ chuyển đỏ do vision nhưng chưa có `vehicle_id` phải được hiểu là “đang chờ xác minh danh tính”, không được kết luận là xe khác.
2. Nếu xe có `globalVehicleId` của phiên đang hướng dẫn đỗ đúng ô đã chọn, frontend phải tự kết thúc chỉ dẫn và báo đỗ thành công; người dùng không cần bấm “quay về bản đồ” để ép cập nhật.
3. Nếu cùng xe đó đỗ vào một ô khác ô được hướng dẫn, kết quả vẫn hợp lệ. Backend phải ghi nhận ô thực tế, frontend hiển thị ô thực tế, kết thúc chỉ dẫn và báo thành công.
4. Chỉ khi runtime xác nhận ô mục tiêu thuộc một `globalVehicleId` khác thì frontend mới được báo “đã có xe khác” và đề nghị đổi ô.
5. Thông báo hoàn tất chỉ xuất hiện đúng một lần cho mỗi lần đỗ thực sự.
6. Sau khi người dùng bấm lấy xe/chỉ lối ra, phiên không được quay ngược từ `EXIT_NAVIGATION` về `PARKED` chỉ vì xe vẫn còn đứng trong ô ở vài snapshot tiếp theo.
7. Phản hồi GET phiên cũ đến trễ không được ghi đè kết quả POST mới hơn.
8. Các sửa đổi phải giữ nguyên nguyên tắc: khách hàng chỉ nhìn thấy xe có `globalVehicleId` của phiên; màn hình `/monitor` mới được xem toàn bộ xe.

## 2. Những phần source đã đối chiếu

Các agent phải đọc lại các file này trước khi sửa vì đây là các điểm đang quyết định hành vi:

- `frontend/src/app/App.tsx`
  - polling runtime, vehicle và session;
  - cảnh báo ô mục tiêu;
  - đồng bộ `PARKED` vào store điều hướng;
  - modal hoàn tất;
  - hành động chọn ô, quay về bản đồ và bắt đầu lấy xe.
- `frontend/src/domain/parking.ts`
  - `classifySpotOccupancy` hiện phân loại `empty`, `own`, `other`, `unknown`.
- `frontend/src/domain/session.ts`
  - kiểu dữ liệu của phiên, hiện chưa có số revision để chống response cũ.
- `frontend/src/adapters/runtimeAdapter.ts`
  - giữ lại `vehicle_id`, `decision_source`, `tracking_state`, `stopped_for_ms` từ runtime.
- `frontend/src/api/backendApi.ts` và `frontend/src/api/runtimeApi.ts`
  - GET/POST phiên và lấy runtime snapshot.
- `frontend/src/stores/driverFlowStore.ts` và `frontend/src/stores/parkingStore.ts`
  - trạng thái điều hướng cục bộ và trạng thái ô.
- `frontend/src/components/InvalidSpotWarningSheet.tsx`
  - modal đang dùng cho cảnh báo đổi ô.
- `backend/gate_session_controller.py`
  - nối runtime `global_id`/`parked_slot_id` vào vòng đời phiên.
- `backend/session_manager.py`
  - máy trạng thái bền vững của phiên.
- `backend/main_detect/src/techgar/runtime_contract.py`
  - contract chuẩn của `vehicles[]`, `parking_slots[]`, `frame_index` và `runtime_id`.
- `frontend/src/tests/session-navigation.test.tsx`
- `backend/tests/test_gate_session_coordinator.py`
- `backend/tests/test_vehicle_sessions.py`

File `frontend/src/app/App_Hiep4.tsx` là bản cũ/di sản, không phải entrypoint cần sửa. Không đồng bộ sửa đổi sang file này nếu chưa có yêu cầu riêng.

## 3. Kết luận điều tra hiện trạng

### 3.1. Lỗi 1 — ô đỏ chưa có ID bị biến thành cảnh báo sai

Luồng hiện tại:

1. Runtime trả `status="occupied"` ngay khi vision thấy vật thể trong ô.
2. Trong khoảng liên kết identity, `vehicle_id` có thể vẫn là `null`.
3. `classifySpotOccupancy` trả `unknown`, đây là kết quả đúng ở tầng domain.
4. `App.tsx` chỉ chờ `OWNERSHIP_GRACE_MS = 2000` rồi chuyển `unknown` thành cảnh báo.
5. Backend cũng dùng `parked_confirm_seconds = 2.0`, ngoài ra session còn được poll mỗi 500 ms và runtime slot được cập nhật theo nhịp riêng.

Vì frontend hết thời gian chờ gần như đúng lúc backend mới bắt đầu đủ bằng chứng, một race condition xuất hiện: cảnh báo được mở trước khi `vehicle_id` hoặc trạng thái `PARKED` kịp tới frontend.

Sai lầm cốt lõi không phải thiếu thêm vài giây timeout. Sai lầm là dùng “hết timeout nhưng vẫn chưa có ID” như bằng chứng “xe khác”. Hai kết luận này không tương đương.

### 3.2. Lỗi 2 — phải bấm về bản đồ mới thấy đỗ thành công

Frontend chỉ mở thông báo thành công khi API phiên đã trả `state === "PARKED"`. Trong thời gian runtime đã thấy ô đỏ nhưng chưa gắn ID hoặc backend chưa đủ bằng chứng hai giây, màn hình cảnh báo che luồng điều hướng.

Nút “Tiếp tục xem bản đồ” hiện gọi `selectSpot(sessionId, null)`, nghĩa là không chỉ đóng modal mà còn đổi phiên về `SELECTING_SPOT`. Thao tác này vô tình thay đổi workflow, trong khi việc backend ghi nhận đỗ có thể xảy ra ngay sau đó. Người dùng vì thế có cảm giác nút bản đồ làm hệ thống nhận ra xe, nhưng thực tế đó là kết quả đến trễ từ luồng polling/backend.

Cách sửa phải để luồng tự hội tụ khi identity được xác minh; không được dựa vào thao tác điều hướng màn hình để làm mới trạng thái.

### 3.3. Lỗi 3 — đỗ khác ô hướng dẫn lúc được lúc không

Backend đã có ý định đúng: `GateSessionCoordinator` nhận `vehicles[].parked_slot_id` của cùng Global ID, sau khi đủ bằng chứng sẽ gọi `set_parked_by_global_id` với ô thực tế. Test hiện tại cũng chứng minh trường hợp chọn D08 nhưng xe Global ID 42 đỗ D04 có thể trở thành `PARKED/D04`.

Khoảng trống hiện tại nằm ở chuỗi trung gian:

- frontend chỉ kiểm tra xung đột quanh ô mục tiêu;
- frontend chưa có một quyết định rõ ràng “cùng Global ID đang được xác nhận đỗ ở ô khác”;
- thông báo thành công chỉ dựa vào session cuối cùng, không biểu diễn trạng thái đang xác nhận;
- test hiện tại nhảy thẳng từ session điều hướng sang session `PARKED`, chưa mô phỏng các snapshot lệch nhịp trước đó.

Do đó, khi ID/slot reservation tới chậm hoặc polling trả theo thứ tự khác nhau, hành vi nhìn như ngẫu nhiên dù backend cuối cùng có thể ghi đúng ô.

### 3.4. Lỗi 4 — modal hoàn tất hiện lại khi bắt đầu lấy xe

`showParkedSuccess` hiện được bật mỗi khi effect thấy `sessionState === "PARKED"`. Nó không có khóa sự kiện “lần đỗ này đã hiển thị”, không kiểm tra cạnh chuyển trạng thái, và không chống React effect chạy lại sau khi dữ liệu thay đổi.

Ngoài ra, các GET session chạy định kỳ không có revision hoặc cơ chế bỏ response cũ. Một GET trả `PARKED` có thể bắt đầu trước POST lấy xe rồi hoàn thành sau POST, ghi đè state mới trên frontend.

Vì vậy modal có thể được kích hoạt lần nữa bởi một state cũ, dù người dùng không hề đỗ thêm lần nào.

### 3.5. Lỗi 5 — bấm lấy xe nhưng backend báo đỗ lại

Đây là lỗi backend trực tiếp:

1. Người dùng gọi `/api/session/exit`; session chuyển sang `EXIT_NAVIGATION`.
2. Xe vẫn đứng trong ô, nên snapshot kế tiếp vẫn có cùng `parked_slot_id`.
3. `GateSessionCoordinator` hiện kiểm tra “state khác PARKED hoặc ô khác” rồi gọi lại `set_parked_by_global_id`.
4. Session bị đưa ngược về `PARKED`.
5. Khi xe dịch chuyển đủ để runtime bỏ `parked_slot_id`, nhánh này mới ngừng chạy; vì vậy người dùng thấy phải nhích xe thì lấy xe mới hoạt động.

Máy trạng thái đúng phải đơn điệu cho lượt rời bãi: sau khi đã nhận intent lấy xe, bằng chứng “vẫn đang ở ô cũ” chỉ là trạng thái chờ xuất phát, không phải một sự kiện đỗ mới.

### 3.6. Khoảng trống của test hiện tại

Baseline đã chạy ngày 2026-08-26:

- frontend `session-navigation.test.tsx`: 6/6 test qua;
- backend `test_gate_session_coordinator.py` và `test_vehicle_sessions.py`: 17/17 test qua.

Các test đều xanh vì chúng chủ yếu kiểm tra snapshot cuối hoặc một trạng thái độc lập. Chúng chưa kiểm tra chuỗi bất lợi sau:

- `occupied + vehicle_id=null` kéo dài hơn hai giây rồi mới có ID của chính xe;
- cùng xe xuất hiện ở ô khác trước khi session chuyển `PARKED`;
- GET `PARKED` cũ hoàn thành sau POST `EXIT_NAVIGATION`;
- nhiều snapshot cùng ô cũ tới sau khi đã bắt đầu lấy xe;
- modal đã được tiêu thụ nhưng component/effect được chạy lại.

## 4. Nguồn sự thật và các invariant bắt buộc

Mọi agent phải giữ các invariant sau. Không chấp nhận bản sửa chỉ đổi câu chữ hoặc tăng timeout.

### 4.1. Identity

- `session.globalVehicleId` là danh tính xe của người dùng.
- Không dùng local `track_id`, `sessionId` hoặc màu ô để thay thế Global ID.
- `slot.vehicle_id === session.globalVehicleId` là bằng chứng ô thuộc xe người dùng.
- `slot.vehicle_id !== null` và khác Global ID mới là bằng chứng có xe khác; vẫn phải thỏa điều kiện ổn định nêu ở phần 5.
- `slot.occupied === true` nhưng `slot.vehicle_id === null` chỉ là occupancy chưa xác định chủ.
- Nếu một snapshot gán cùng Global ID cho nhiều ô đỗ, không tự chọn một ô. Ghi lỗi invariant và chờ snapshot hợp lệ/backend xử lý.

### 4.2. Workflow

- Backend session là nguồn sự thật cho trạng thái workflow: chọn ô, đang dẫn đường, đã đỗ, đang ra cổng.
- Runtime là nguồn bằng chứng cho vị trí, chủ ô và trạng thái tracking.
- Màu đỏ của vision là nguồn sự thật về occupancy hiển thị, không phải nguồn sự thật về ownership.
- Thành công chỉ được phát khi session chuyển sang `PARKED` với `parkedSpotId` cụ thể.
- Ô thành công là `parkedSpotId` thực tế, không mặc định là `targetSpotId`.
- `EXIT_NAVIGATION` không được quay lại `PARKED` do cùng bằng chứng đỗ cũ.
- Chỉ việc qua cổng EXIT đúng hướng mới kết thúc/xóa phiên theo contract hiện tại.

### 4.3. UI event

- Một lần đỗ có một khóa sự kiện hoàn tất ổn định.
- Cùng khóa đó chỉ được nói voice và mở modal một lần.
- Polling, rerender, remount trong cùng tab hoặc bắt đầu lấy xe không được tạo lại sự kiện.
- Một lần đỗ thật sự mới sau này phải có khóa mới và vẫn được thông báo.

## 5. Máy trạng thái đích

Không cần thêm nhiều state backend. Giữ các state công khai hiện tại và bổ sung một lớp quyết định UI thuần.

### 5.1. State backend được phép

Luồng vào:

1. `WAITING_FOR_SCAN`
2. `SELECTING_SPOT`
3. `NAVIGATING_TO_SPOT`
4. `PARKED`

Xe có thể chuyển sang `PARKED` từ `SELECTING_SPOT` hoặc `NAVIGATING_TO_SPOT` nếu cùng Global ID đỗ ở bất kỳ ô hợp lệ nào. Nếu sản phẩm vẫn cho phép xe đỗ trước khi scan xong, giữ khả năng `WAITING_FOR_SCAN -> PARKED`; nếu không, phải quyết định sản phẩm và thêm test riêng, không âm thầm thay đổi.

Luồng ra:

1. `PARKED`
2. `EXIT_NAVIGATION`
3. phiên bị xóa/đóng khi Global ID qua cổng EXIT đúng hướng.

Trong phạm vi lỗi này, `EXIT_NAVIGATION -> PARKED` là chuyển trạng thái bị cấm. Nếu sau này cần “hủy lấy xe”, phải thêm một action/API rõ ràng; không suy ra hủy từ việc xe vẫn đứng trong ô.

### 5.2. State quyết định UI nội bộ

Tạo union type thuần, ví dụ trong `frontend/src/domain/sessionParking.ts`:

```ts
type SessionParkingDecision =
  | { kind: "guiding"; targetSpotId: SpotId }
  | { kind: "identity_pending"; spotId: SpotId }
  | { kind: "parking_confirmation_pending"; actualSpotId: SpotId }
  | { kind: "parked"; actualSpotId: SpotId; completionKey: string }
  | { kind: "target_occupied_by_other"; spotId: SpotId; otherVehicleId: number }
  | { kind: "runtime_unavailable"; targetSpotId: SpotId | null }
  | { kind: "exit_navigation"; originSpotId: SpotId }
  | { kind: "identity_invariant_error"; reason: string };
```

Tên có thể điều chỉnh theo convention, nhưng các nhánh ngữ nghĩa không được nhập chung lại thành `occupied`.

### 5.3. Thuật toán resolve quyết định UI

Viết thành hàm thuần để test không cần render toàn bộ `App`.

Thứ tự ưu tiên:

1. Nếu session là `EXIT_NAVIGATION`, trả `exit_navigation`; không chạy logic hoàn tất đỗ và không tạo cảnh báo inbound.
2. Nếu session là `PARKED` và có `parkedSpotId`, trả `parked` theo ô session.
3. Tìm tất cả bằng chứng ô thuộc `session.globalVehicleId`:
   - `vehicles[].global_id` trùng và có `parked_slot_id`;
   - hoặc slot có `vehicle_id` trùng, `tracking_state === "parked"` và đủ thời gian dừng.
4. Nếu có đúng một ô của chính xe, trả `parking_confirmation_pending` với ô thực tế, kể cả ô đó khác target. Dừng/hide tuyến inbound và hiển thị trạng thái nhẹ “Đang xác nhận đỗ tại ô …”; chưa phát modal thành công cho đến khi session là `PARKED`.
5. Nếu có nhiều hơn một ô của chính xe, trả `identity_invariant_error`, ghi đầy đủ frame/GID/các ô và không tự xác nhận.
6. Nếu target còn trống, trả `guiding`.
7. Nếu target đỏ nhưng `vehicle_id === null`, trả `identity_pending`. Không mở modal đổi ô và không gọi `selectSpot(null)`.
8. Nếu target có `vehicle_id` khác nhưng tracking chưa ở `parked` hoặc thời gian dừng chưa đạt ngưỡng xác nhận backend, vẫn trả `identity_pending`.
9. Chỉ trả `target_occupied_by_other` khi đồng thời có ID khác, `tracking_state === "parked"`, và `stopped_for_ms` đạt ngưỡng backend. Khi đó mới pause tuyến và cho chọn ô khác.
10. Nếu runtime/camera thiếu dữ liệu, trả `runtime_unavailable`; dùng thông báo mất dữ liệu riêng, không nói có xe khác.

Không giữ `OWNERSHIP_GRACE_MS` như một đồng hồ biến unknown thành “other”. Có thể giữ một timeout chỉ để nâng mức hiển thị từ nhãn nhẹ sang cảnh báo kỹ thuật “chưa xác minh được”, nhưng timeout đó tuyệt đối không được thay đổi ownership.

## 6. Thay đổi contract backend

### 6.1. Thêm revision cho session

Sửa `backend/session_manager.py`:

- session mới có `revision` bắt đầu từ `1` và `updatedAt`;
- session cũ được normalize với `revision = 0`, `updatedAt` lấy từ mốc gần nhất có sẵn;
- `_mutate_session` so sánh trước/sau, chỉ tăng revision khi dữ liệu thực sự thay đổi;
- mọi GET và POST trả revision;
- action idempotent không tăng revision nếu không làm thay đổi dữ liệu.

Sửa `frontend/src/domain/session.ts` để nhận hai field này. Trong giai đoạn đọc file dữ liệu cũ, frontend phải chấp nhận revision thiếu như `0`, nhưng sau khi migration hoàn tất thì test contract phải yêu cầu revision.

Mục đích của revision:

- GET bắt đầu trước POST nhưng trả về sau không thể kéo frontend về state cũ;
- agent có thể log và tái dựng chính xác thứ tự chuyển trạng thái;
- modal hoàn tất có thể gắn với một sự kiện state cụ thể.

### 6.2. Chặn rollback khi đang lấy xe

Sửa cả hai tầng để invariant không bị bypass:

- Trong `GateSessionCoordinator`, nếu session đang `EXIT_NAVIGATION`, bỏ qua mọi `parked_slot_id` còn trùng/đến từ snapshot sau action lấy xe; không tạo `_parked_candidates` mới và không gọi `set_parked_by_global_id`.
- Trong `session_manager.set_parked`, từ chối hoặc trả idempotent khi state hiện tại là `EXIT_NAVIGATION`. Chọn một hành vi duy nhất và test rõ; khuyến nghị từ chối bằng `InvalidSessionState` cho caller ngoài coordinator, còn coordinator phải guard để không spam exception/log.
- `set_exit_navigation` phải idempotent: gọi lại ở `EXIT_NAVIGATION` không đổi `exitStartedAt` và không tăng revision.
- Khi chuyển từ `PARKED` sang `EXIT_NAVIGATION`, giữ `parkedSpotId` làm điểm xuất phát tuyến ra.

Không sửa bằng cách đợi xe nhúc nhích rồi mới cho POST thành công. Intent lấy xe phải được backend chấp nhận ngay; chuyển động chỉ cập nhật tuyến/vị trí sau đó.

### 6.3. Chuẩn hóa sự kiện đỗ

`parkedAt` phải đại diện cho lần đỗ hiện tại:

- lần đầu chuyển vào `PARKED`: gán thời gian mới;
- snapshot lặp lại cùng state/cùng ô: giữ nguyên;
- nếu sau này sản phẩm cho một parking episode mới: tạo `parkedAt` mới;
- không dùng `parkedAt = oldValue || now` cho mọi episode mãi mãi.

Khóa hoàn tất đề xuất:

```text
sessionId + parkedAt + parkedSpotId
```

Nếu team muốn contract rõ hơn, có thể thêm `parkingEventId`; không thêm cả `parkingEventId` lẫn một hệ event bus mới trong cùng patch nếu `parkedAt` đã đảm bảo duy nhất.

## 7. Thay đổi frontend

### 7.1. Tách logic resolve khỏi `App.tsx`

Tạo `frontend/src/domain/sessionParking.ts` và test thuần tương ứng. Chuyển vào đây:

- tìm ô của chính Global ID;
- phân biệt identity pending và xe khác đã xác nhận;
- chọn ô thực tế khi đỗ khác target;
- tạo completion key;
- phát hiện invariant nhiều ô cùng GID.

Không chuyển geometry, routing hoặc recommendation sang module này.

### 7.2. Đồng bộ session có thứ tự

Tạo hook nhỏ `frontend/src/hooks/useVehicleSession.ts` hoặc một controller tương đương. Hook này sở hữu:

- auto claim;
- polling GET session;
- POST chọn ô;
- POST bắt đầu lấy xe;
- một hàm duy nhất `commitSession(next)` so revision;
- cờ `requestInFlight` hoặc AbortController để GET polling không chồng nhau;
- lỗi action hiện tại để UI hiển thị và cho retry.

Quy tắc commit:

1. Session khác `sessionId` hoặc `runtimeId` phải bị bỏ và log lỗi contract.
2. Revision thấp hơn state hiện tại phải bị bỏ.
3. Cùng revision nhưng payload workflow khác nhau là lỗi invariant; không ghi đè im lặng.
4. Kết quả POST và GET đều đi qua cùng hàm commit.

Không để nhiều chỗ trong `App.tsx` gọi `setSessionInfo` trực tiếp như hiện tại.

### 7.3. Sửa cảnh báo ô mục tiêu

Thay effect dựa trên `OWNERSHIP_GRACE_MS` bằng effect dựa trên `SessionParkingDecision`:

- `identity_pending`: giữ chỉ dẫn hoặc chuyển sang trạng thái chờ xác minh; không mở `InvalidSpotWarningSheet`;
- `parking_confirmation_pending`: hide tuyến inbound, dừng voice chỉ đường, hiển thị “Đang xác nhận đỗ tại ô {actualSpotId}”;
- `target_occupied_by_other`: mới mở sheet đổi ô;
- `parked`: clear warning, kết thúc navigation và dùng actual spot;
- `exit_navigation`: clear mọi warning inbound.

Đổi model warning để chứa nguyên nhân, ví dụ `kind: "confirmed_other" | "runtime_unavailable"`. Không dùng cùng một status `unknown` cho cả mất camera và chưa biết chủ xe.

Nút “Tiếp tục xem bản đồ” trong cảnh báo xe khác phải ghi rõ nó sẽ dừng chỉ dẫn hiện tại nếu vẫn gọi `selectSpot(null)`. Việc chỉ đóng một thông báo kỹ thuật không được tự động xóa target backend.

### 7.4. Đỗ vào ô khác target

Khi resolver thấy đúng Global ID ở ô khác:

1. Không mở cảnh báo target bị chiếm.
2. Dừng/hide tuyến inbound để tránh tiếp tục dẫn người dùng về target cũ.
3. Hiển thị actual slot đang được backend xác nhận.
4. Không tự gọi API đổi target sang actual slot; backend phải ghi nhận `parkedSpotId` từ runtime identity, vì đổi target ở thời điểm ô đã đỏ sẽ bị API availability từ chối và làm sai ngữ nghĩa.
5. Khi session trả `PARKED`, hiển thị thành công với `parkedSpotId` actual và chuyển flow sang browse/parked presentation.

### 7.5. Modal hoàn tất đúng một lần

Thay effect “hễ state là PARKED thì show” bằng edge/event handling:

- chỉ tạo event khi nhận một completion key hợp lệ chưa được tiêu thụ;
- đánh dấu key đã tiêu thụ ngay khi bắt đầu hiển thị để React StrictMode/effect lặp không phát lần hai;
- lưu key trong `sessionStorage` theo session để chống remount/reload trong cùng tab;
- voice và modal dùng chung completion key;
- polling cùng `PARKED`/cùng key không làm gì;
- đổi target, mở bản đồ hoặc cập nhật vị trí không làm event sống lại;
- một `parkedAt` mới tạo một event mới.

Khi người dùng bấm lấy xe:

1. đóng modal ngay;
2. đánh dấu completion key hiện tại đã tiêu thụ;
3. dừng voice hoàn tất;
4. disable nút để chống double submit;
5. gọi POST exit;
6. chỉ commit response qua revision guard;
7. nếu API lỗi, giữ trạng thái đỗ, hiện lỗi retry, nhưng không phát lại modal cũ.

### 7.6. Giữ phân quyền hiển thị

Mọi phép tìm xe ở trang khách phải filter `runtime.vehicles` theo đúng `session.globalVehicleId` trước khi đưa vào UI. Không dùng việc quét tất cả xe để render marker khách hàng. Resolver được phép xem `vehicle_id` của ô mục tiêu để kết luận xung đột, nhưng không trả danh sách/marker xe khác cho `ParkingMap`.

## 8. Chia việc cho các agent

### Agent A — Backend session/state machine

Phạm vi file sở hữu:

- `backend/session_manager.py`
- `backend/gate_session_controller.py`
- `backend/tests/test_vehicle_sessions.py`
- `backend/tests/test_gate_session_coordinator.py`

Đầu ra bắt buộc:

- revision/updatedAt;
- state exit đơn điệu;
- parked event idempotent;
- test tất cả transition backend ở phần 9.

Agent A không sửa `App.tsx`.

### Agent B — Frontend domain và session synchronization

Phạm vi file sở hữu:

- `frontend/src/domain/session.ts`
- `frontend/src/domain/sessionParking.ts` mới;
- `frontend/src/hooks/useVehicleSession.ts` mới;
- `frontend/src/api/backendApi.ts` nếu cần cập nhật type/error;
- unit test mới cho resolver/hook.

Đầu ra bắt buộc:

- pure resolver;
- revision guard;
- polling không chồng;
- API action qua một commit path.

Agent B bắt đầu sau khi Agent A chốt JSON contract. Nếu cần làm song song, dùng fixture contract đã thống nhất trong tài liệu này, không tự đặt tên field khác.

### Agent C — Frontend UI integration

Phạm vi file sở hữu:

- `frontend/src/app/App.tsx`
- `frontend/src/components/InvalidSpotWarningSheet.tsx`
- component trạng thái “đang xác nhận” nếu cần;
- `frontend/src/tests/session-navigation.test.tsx`.

Đầu ra bắt buộc:

- bỏ logic timeout suy diễn xe khác;
- đỗ đúng/khác ô đều tự hội tụ;
- modal/voice exactly-once;
- start-exit không phát lại success;
- UI lỗi/retry có trạng thái rõ.

Agent B và Agent C không cùng sửa `App.tsx` song song. Agent B hoàn tất hook/domain trước, Agent C mới tích hợp.

### Agent D — Integration và nghiệm thu

Phạm vi:

- fixture chuỗi snapshot/session;
- Playwright hoặc integration test có fake API;
- chạy full suite;
- chạy lại replay/live UAT;
- cập nhật tài liệu validation, không thay đổi thuật toán ngoài bug đã tái hiện.

Agent D chỉ bắt đầu sau khi A, B, C merge sạch và test mục tiêu xanh.

## 9. Test bắt buộc trước khi sửa code sản phẩm

Các agent phải thêm test đỏ trước, rồi mới sửa implementation.

### 9.1. Backend tests

1. **Exit không rollback khi xe còn trong ô**
   - Given session `PARKED/D06`.
   - When gọi `set_exit_navigation` rồi gửi nhiều snapshot `parked_slot_id=D06` vượt quá hai giây.
   - Then state vẫn là `EXIT_NAVIGATION`, `exitStartedAt` không đổi và revision không bị tăng bởi snapshot lặp.

2. **Start exit idempotent**
   - Gọi action hai lần.
   - Kết quả cùng `exitStartedAt`, cùng revision ở lần hai.

3. **Đỗ khác target**
   - Given Global ID 42 đang dẫn tới D06.
   - Runtime xác nhận chính GID 42 đỗ D05 đủ thời gian.
   - Session thành `PARKED`, `targetSpotId=null`, `parkedSpotId=D05`.

4. **Ô đỏ chưa ID không được park session**
   - Parking slot occupied nhưng `vehicle_id=null`, vehicle chưa có `parked_slot_id`.
   - Session vẫn `NAVIGATING_TO_SPOT`.

5. **ID xe khác không được park nhầm session**
   - D06 có `vehicle_id=99`, session GID 42.
   - Session 42 không chuyển `PARKED`.

6. **Revision tăng đơn điệu**
   - create, claim, select, park, exit có revision tăng đúng một cho mỗi mutation thật.
   - action idempotent không tăng.

7. **Không caller nào set parked khi đang exit**
   - Gọi trực tiếp `set_parked` ở `EXIT_NAVIGATION` phải theo policy đã chốt và không đổi state.

### 9.2. Pure frontend resolver tests

1. Target D06 empty → `guiding`.
2. D06 red, `vehicleId=null` trong 2 giây, 5 giây và lâu hơn → luôn `identity_pending`, không tự biến thành `other`.
3. D06 có `vehicleId` bằng Global ID nhưng đang tích lũy dwell → `parking_confirmation_pending`.
4. D06 được xác nhận là cùng Global ID → không có warning xe khác.
5. D06 có ID khác nhưng chưa parked/đủ dwell → `identity_pending`.
6. D06 có ID khác, parked và đủ dwell → `target_occupied_by_other`.
7. Target D06 nhưng cùng GID đỗ D05 → `parking_confirmation_pending/D05`.
8. Session `PARKED/D05` → `parked/D05`, không dùng D06.
9. Session `EXIT_NAVIGATION` trong khi runtime vẫn báo D05 parked → `exit_navigation`.
10. Cùng GID bị gắn vào hai ô → `identity_invariant_error`.

### 9.3. Frontend integration tests

1. **Đỗ đúng D06 không cần bấm bản đồ**
   - Chuỗi runtime: empty → occupied/no ID → own ID/parked.
   - Chuỗi session: NAVIGATING revision N → PARKED/D06 revision N+1.
   - Không xuất hiện alert “xe khác”; success tự xuất hiện một lần.

2. **Đỗ khác D05 vẫn hợp lệ**
   - Target D06, own GID xuất hiện ở D05.
   - Tuyến inbound biến mất ở giai đoạn xác nhận.
   - Success ghi D05 và flow thoát navigation.

3. **Response GET cũ không thắng POST exit**
   - Bắt đầu GET trả PARKED revision 7 nhưng trì hoãn response.
   - POST exit trả EXIT revision 8.
   - Sau đó hoàn thành GET cũ.
   - UI vẫn EXIT, success không hiện lại.

4. **Snapshot ô cũ sau start exit**
   - Sau click lấy xe, runtime tiếp tục trả parked D06 trong nhiều poll.
   - Route ra cổng và trạng thái exit vẫn giữ; không có modal hoàn tất.

5. **Modal exactly-once**
   - Poll PARKED cùng key nhiều lần, rerender, đổi vị trí, remount trong cùng tab.
   - Modal và voice chỉ chạy một lần.

6. **POST exit lỗi**
   - Modal cũ đóng, UI báo không bắt đầu được chỉ lối ra và cho retry.
   - Không giả state EXIT và không phát lại success.

7. **Confirmed other**
   - Chỉ khi ID khác đã parked/đủ dwell mới hiện sheet và alternatives.
   - Bấm đổi ô chỉ đổi local target sau khi API chấp nhận.

### 9.4. Chuỗi integration/E2E chuẩn

Tạo fixture deterministic có các bước sau, không dùng timeout ngẫu nhiên:

1. Session GID 1, revision 3, target D06, state `NAVIGATING_TO_SPOT`.
2. Frame 100: D06 empty.
3. Frame 101: D06 occupied, `vehicle_id=null`, `tracking_state=moving`.
4. Frame 102: vẫn occupied/no ID.
5. Frame 103: D06 `vehicle_id=1`, `tracking_state=parked`, dwell đạt ngưỡng.
6. Session revision 4: `PARKED/D06`, có `parkedAt` mới.
7. Người dùng bấm lấy xe.
8. POST trả revision 5: `EXIT_NAVIGATION`.
9. Một GET cũ revision 4 và hai runtime frame vẫn D06 parked tới sau POST.
10. Session phải giữ revision 5 và modal không được xuất hiện lại.

Tạo chuỗi thứ hai giống trên nhưng frame 103 xác nhận GID 1 ở D05 trong khi target là D06. Kết quả success phải là D05.

## 10. Logging và bằng chứng cần thu

Trong development/test, ghi một log quyết định có cấu trúc khi decision thay đổi:

```text
runtimeId, frameIndex, sessionId, sessionRevision, globalVehicleId,
sessionState, targetSpotId, actualSpotId, slotVehicleId,
trackingState, stoppedForMs, decisionKind, reason
```

Backend ghi transition:

```text
sessionId, globalVehicleId, runtimeId, oldState, newState,
oldRevision, newRevision, parkedSpotId, reason
```

Không ghi log mỗi poll nếu quyết định không thay đổi. Mục tiêu là có thể dựng lại race mà không làm log bị ngập.

Khi nghiệm thu replay/live, lưu các bằng chứng sau trong một thư mục validation mới, không sửa/xóa replay gốc:

- chuỗi runtime snapshot liên quan;
- chuỗi response session theo revision;
- console decision log;
- ảnh/video ngắn chứng minh UI;
- kết quả test và lệnh đã chạy;
- runtime ID và thời gian thử.

File `backend/data/navigation_sessions.json` hiện có bản ghi lịch sử GID 1 ở `PARKED/D06`, nhưng đây chỉ là trạng thái cuối; nó không đủ để chứng minh thứ tự UI đã trải qua. Không dùng riêng file này để kết luận bug đã hết.

## 11. Thứ tự triển khai và cổng kiểm tra

### Giai đoạn 1 — Khóa contract và tạo test đỏ

- Chốt `revision`, `updatedAt`, completion key và policy `EXIT_NAVIGATION` đơn điệu.
- Viết backend/frontend test race trước.
- Cổng qua: test mới phải fail vì đúng nguyên nhân hiện tại, không fail vì fixture sai.

### Giai đoạn 2 — Sửa backend

- Thêm revision.
- Chặn exit rollback.
- Chuẩn hóa parked event idempotent.
- Cổng qua: toàn bộ test backend mục tiêu xanh; test Global ID/runtime isolation cũ vẫn xanh.

### Giai đoạn 3 — Sửa domain/hook frontend

- Thêm pure resolver.
- Thêm ordered session commit và non-overlapping polling.
- Cổng qua: unit test resolver và race response xanh, chưa cần thay UI hoàn chỉnh.

### Giai đoạn 4 — Tích hợp UI

- Thay warning effect.
- Thêm trạng thái đang xác nhận.
- Đỗ khác ô dùng actual slot.
- Dedupe modal/voice.
- Sửa action lấy xe/error/retry.
- Cổng qua: toàn bộ `session-navigation` test xanh.

### Giai đoạn 5 — Full validation

Chạy từ `frontend`:

```powershell
node_modules\.bin\vitest.cmd run src\tests\session-navigation.test.tsx --reporter=verbose
pnpm typecheck
pnpm test
pnpm build
```

Chạy từ `backend`:

```powershell
python -m pytest -q tests\test_gate_session_coordinator.py tests\test_vehicle_sessions.py -p no:cacheprovider
```

Sau targeted suite, chạy full backend suite phù hợp với checkout. Nếu Windows báo permission ở pytest temp/cache, chuyển `--basetemp` vào thư mục ghi được; không bỏ test hoặc kết luận code sai chỉ từ lỗi permission.

Cuối cùng chạy fixture E2E, replay đã ghi và một lượt camera thật. Phải báo tách biệt:

- unit/integration test;
- replay;
- live camera/UAT.

Không được gọi công việc hoàn tất nếu mới chỉ có unit test.

## 12. Tiêu chí nghiệm thu định lượng

1. Trong chuỗi own-car identity pending, số lần hiện cảnh báo “xe khác”: `0`.
2. Sau khi runtime nhận đủ bằng chứng identity, UI đổi sang “đang xác nhận” trong tối đa một nhịp runtime poll hiện tại.
3. Sau khi backend session phát `PARKED`, success xuất hiện trong tối đa một nhịp session poll, không cần click bản đồ.
4. Đỗ đúng target và đỗ khác target đều có `parkedSpotId` đúng actual slot.
5. Mỗi completion key: modal count `1`, voice count `1`.
6. Sau POST exit revision mới, mọi response revision thấp hơn bị bỏ.
7. Trong ít nhất ba snapshot vẫn báo xe ở ô cũ sau start exit, state vẫn `EXIT_NAVIGATION`.
8. Customer map chỉ render marker của một Global ID thuộc session.
9. Targeted test, full frontend test/typecheck/build và backend test đều xanh.
10. Replay và live UAT có log runtime/session revision chứng minh đúng thứ tự.

## 13. Những cách sửa không được chấp nhận

- Tăng `OWNERSHIP_GRACE_MS` từ 2 giây lên 5 hoặc 10 giây rồi coi là xong.
- Coi mọi ô đỏ là xe khác.
- Coi mọi ô đỏ là xe của người dùng.
- Gán `parkedSpotId = targetSpotId` ở frontend.
- Tự gọi đổi target sang ô thực tế sau khi xe đã đỗ.
- Chỉ ẩn modal bằng timeout mà không dedupe event.
- Chỉ sửa frontend trong khi backend vẫn cho `EXIT_NAVIGATION -> PARKED`.
- Chỉ sửa backend trong khi GET cũ vẫn có thể ghi đè POST mới ở frontend.
- Dùng local track ID thay Global ID.
- Render các xe khác lên customer map để tiện debug.
- Bỏ ngưỡng xác nhận parked của backend để làm UI có vẻ nhanh hơn.
- Xóa hoặc chỉnh replay gốc để test qua.

## 14. Definition of Done cho người nhận plan

Công việc chỉ được đóng khi có đủ:

- code backend và frontend theo invariant;
- test đỏ trước/sau được ghi nhận;
- test target và full suite xanh;
- fixture deterministic cho đúng D06 và khác ô D05;
- bằng chứng một lượt replay;
- bằng chứng một lượt live/UAT;
- log cho thấy không có state rollback và không có success event trùng;
- tài liệu validation ghi rõ commit, runtime ID, lệnh, kết quả và giới hạn còn lại.

Nếu replay cho thấy slot vẫn mất/sai `vehicle_id`, đó là lỗi identity/tracker riêng và phải mở work item theo frame/GID/slot. Frontend trong plan này vẫn phải xử lý trạng thái chưa xác định một cách an toàn, nhưng không được che hoặc tự sửa giả identity của vision.
