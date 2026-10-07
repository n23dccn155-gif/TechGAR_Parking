# notes/snapshot-api.md — Step A bảng nguồn (đọc 2026-10-06)

Files đọc: `backend/main_detect/runtime_server.py` (427 dòng),
`src/techgar/runtime_contract.py` (168), `two_camera.py` (publish call),
`src/techgar/prediction_writer.py` (schema v3 — cho trang predictions).

## giá trị → file:dòng → kind
| giá trị | nguồn | kind |
|---|---|---|
| port mặc định 8001 (`--api-port`) | runtime_server.py:402 | runtime |
| `--api-host` default 0.0.0.0 | runtime_server.py:401 | runtime |
| `--stream-fps` default 8.0 | runtime_server.py:403 | runtime |
| `--jpeg-quality` default 80, clamp [30,95] | runtime_server.py:404 + :97 | runtime |
| RUNTIME_SCHEMA_VERSION = 2 | runtime_contract.py:12 | class-default |
| TERMINAL_IDENTITY_STATES {exited,expired} | runtime_contract.py:13 | class-default |
| routes: /status /snapshot /map /events /gates GET+POST /cameras/camN.jpg /cameras/camN.mjpg | runtime_server.py:274-333 | runtime |
| 503 "Runtime snapshot is not ready" | runtime_server.py:289 | runtime |
| CORS `*` + `Cache-Control: no-store` | runtime_server.py:250-251 | runtime |
| publish_snapshot: deepcopy + encode ngoài lock | runtime_server.py:106-114 | runtime |
| mailbox latest-only (frame mới đè frame cũ, không queue) | runtime_server.py:134-138 | runtime |
| JPEG encode chạy thread `runtime-jpeg-encoder` riêng | runtime_server.py:99-104,141-171 | runtime |
| needs_frame: chỉ stream khi có request trong 5.0s gần nhất | runtime_server.py:173-180 | runtime |
| wait_for_frame timeout default 2.0s | runtime_server.py:205 | runtime |
| snapshot build mỗi chu kỳ loop trong two_camera.run | two_camera.py:2849-2878 | runtime |
| source_mode: live nếu không replay | two_camera.py:2864 | runtime |
| vehicles: bỏ state exited/expired; observed = có active member | runtime_contract.py:76-98 | runtime |
| parked_slot_id từ episode state=parked | runtime_contract.py:70,105 | runtime |
| recent_observed_path cắt còn 12 điểm cuối | runtime_contract.py:114-117 | runtime |
| camera online: timestamp ≤ 5e9 ns (5s) so với clock | runtime_contract.py:128-129 | class-default |
| recent_events cắt 100 cuối | runtime_contract.py:167 | class-default |
| camera_skew_ms = |cam1_ns − cam2_ns|/1e6 | two_camera.py:2863 | runtime |
| slot_layout từ calibration parking_slots_world | runtime_contract.py:16-34 | runtime |
| MJPEG multipart boundary "frame" | runtime_server.py:372-389 | runtime |
| /map trả chỉ coordinate_space + slot_layout | runtime_server.py:296-302 | runtime |
| /events trả recent_events | runtime_server.py:310-313 | runtime |
| /gates GET normalize + POST save qua .tmp replace (atomic) | runtime_server.py:314-324,335-353,72-81 | runtime |
| gate config bắt coordinate_space=world + unit khớp runtime | runtime_server.py:52-61 | runtime |

## ghi chú
- Không thấy auth/rate-limit trên handler — LAN trusted (suy luận từ CORS `*` + không check credential).
- `frame()`/`wait_for_frame()` tự đánh dấu `_frame_requested_at` → needs_frame bật stream chỉ khi ai đó còn xem.
- predictions.jsonl dùng SCHEMA_VERSION=3 khác snapshot SCHEMA_VERSION=2 — 2 contract riêng, không nhầm lẫn.
- publish_snapshot serialize một lần cho mọi reader (snapshot_json bytes dùng lại) — reader không chịu chi phí json.dumps.
