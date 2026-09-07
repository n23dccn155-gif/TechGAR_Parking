# TechGar2 — Bảng lỗi và bằng chứng audit (07/09/2026)

Tài liệu này ghi lại cách rà soát theo batch và phạm vi của từng kết luận. Không dùng số lượng Global ID thấp hơn làm thước đo chất lượng; gộp nhầm hoặc mất xe cũng có thể làm số đó giảm.

| Mã | Triệu chứng/điểm rủi ro | Nguyên nhân đã xác định | Thay đổi đã áp dụng | Bất biến kiểm tra |
|---|---|---|---|---|
| P0-A | Bind ID khôi phục xong nhưng reservation bị mất khi bind lỗi | Reservation bị tiêu thụ trước thao tác bind | `bind_external_id()` chỉ xóa reservation sau bind thành công, lỗi thì giữ để retry | Test bind exception; reservation không mất |
| P0-B | Xe tracking-only đỗ nhưng session không thấy episode | Episode thiếu mốc bằng chứng khi worker vision không chạy | `_open_parking_episode()` dùng frame/time binder hiện tại làm evidence fallback | Test tracking-only episode; backend 49 test |
| P0-C | Xe đang quan sát có thể thành `observed=false` khi registry dùng key số nguyên | Contract chỉ tìm key chuỗi trước khi JSON serialize | `build_runtime_snapshot()` đọc chuỗi và số nguyên | Test int-key runtime contract |
| P1-A | Map và gate gọi runtime cạnh tranh, snapshot cũ có thể thắng | Hai effect tự fetch cùng nguồn | Chia sẻ in-flight request; contract freshness v2 dùng chung | 66 unit + 10 Playwright |
| P1-B | Replay/schema cũ hoặc camera mất vẫn dùng cho chỉ dẫn | Kiểm tra live rời rạc, chưa bắt đủ camera/age | `liveRuntimeError()` và `_fresh_live()` kiểm tra schema, nguồn, timestamp, camera | Runtime freshness tests, session tests |
| P1-C | GET cũ ghi đè POST session mới | Commit GET không biết action đang chờ | Hook bỏ qua GET khi action đang in-flight, giữ cursor/revision | Session/navigation Playwright |
| P1-D | Gate API treo làm effect kéo dài | Fetch không có timeout riêng | Kết hợp AbortSignal của caller với timeout 2 giây | Typecheck/build/browser pass |

## Invariant bắt buộc

1. Một Global ID canonical không sở hữu hai ô đang hoạt động.
2. Một ô không có hai chủ xe parked.
3. Reservation hợp lệ được bảo vệ ngay trong chu kỳ đồng bộ và chỉ mở bởi token rời ô hợp lệ.
4. Snapshot replay/cũ/mất camera không được tạo thao tác live.
5. Frame và episode tiến theo thời gian; bằng chứng không được có `evidence_frame_idx` sau `applied_frame_idx`.
6. Khi giao dịch bind thất bại, mapping, alias, reservation và event thành công không được cập nhật nửa chừng.

## Phạm vi kết luận

Structural audit đã đạt trên bốn replay mới. Đây chưa phải đánh giá độ chính xác vật lý: muốn kết luận IDF1, ID switch, fragmentation, slot-owner accuracy và recovery accuracy phải có ground truth xe A/B theo từng frame. Hiệu năng replay cũng không thay thế đo live camera/network.
