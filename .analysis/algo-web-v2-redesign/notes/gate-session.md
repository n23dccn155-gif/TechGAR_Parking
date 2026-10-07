# notes/gate-session.md — Step A bảng nguồn (backfill builder-c, 2026-10-06)

Files đọc: `backend/gate_session_controller.py`, `backend/session_manager.py`,
`config/gate_zones.json`. Chi tiết trong `js/pages/gate-session.js` ⑦.

## giá trị → file:dòng → kind
| giá trị | nguồn | kind |
|---|---|---|
| cổng API 8000 (`--port`), poll runtime 8001 | gate_session_controller.py:864-865 | runtime |
| chu kỳ poll snapshot 0.25 s | gate_session_controller.py:865 | runtime |
| HTTP timeout 3.0 s | gate_session_controller.py:708 | class-default |
| camera age_ms hợp lệ 0–5000 ms | gate_session_controller.py:113-119 | class-default |
| lệch giờ published_at −1.0 → +5.0 s | gate_session_controller.py:121-123 | class-default |
| unit sai → raise ValueError | gate_session_controller.py:407-410 | class-default |
| entry_gate (39.67,8.90)→(38.87,−6.00) dir=positive | config/gate_zones.json:6-18 | config |
| exit_gate (50.83,63.37)→(49.39,51.43) dir=negative | config/gate_zones.json:19-31 | config |
| cắt đoạn: check_line_intersection, tích chéo ≤0 cả hai phía | gate_session_controller.py:229-239 | class-default |
| dấu hướng: cross(v_xe, v_gate) so với direction | gate_session_controller.py:242-256 | class-default |
| continuity gate: Δt quan sát ≤1.0 s + Δt nguồn ≤1.0 s | gate_session_controller.py:483-493 | class-default |
| recovered path ≤12 mẫu, 2 mẫu liên tiếp cùng cam+lid | gate_session_controller.py:275-309 | class-default |
| max_gap trong path 1.0 s | gate_session_controller.py:264 | class-default |
| tạo phiên create_session → [ENTRY]; xóa → [EXIT] | gate_session_controller.py:514-534 | class-default |
| QR_DISPLAY_SECONDS 120.0 s | session_manager.py:29 | class-default |
| sessionId = secrets.token_urlsafe(12) | session_manager.py:283 | class-default |
| store backend/data/navigation_sessions.json | session_manager.py:23-26 | class-default |
| tuổi availability tối đa 5.0 s | gate_session_controller.py:157 | class-default |
| states giữ chỗ: NAVIGATING_TO_SPOT · RELOCATING | session_manager.py:33 | class-default |
| thứ tự chọn episode: applied_frame → ts → revision → rank | gate_session_controller.py:649-663 | class-default |
| rank state: parked=1 · departing=2 · released=3 | gate_session_controller.py:629 | class-default |
| conflict diag identity_or_slot_owner_conflict; cursor diag older_than_cursor/not_newer_within_frame | gate_session_controller.py:664-690 | runtime |
| actionReceipts giữ 32 action gần nhất | session_manager.py:333-334 | class-default |
