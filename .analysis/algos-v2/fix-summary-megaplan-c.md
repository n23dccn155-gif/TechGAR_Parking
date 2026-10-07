# fix-summary-megaplan-c.md — Sửa theo LEAD review (C dossier)

**Status: DONE** — toàn bộ blocker LEAD nêu đã xử lý trong `builder-c.md`
(+1 chỉnh `pipeline-order.md` trước đó).

## 1. T2 Polygon — storyboard OFF/ON đồng nhất + sửa ví dụ bất khả thi
- **Trước**: OFF dùng "tâm ngoài + 45% overlap", ON dùng "center_inside +
  42%" — hai cảnh khác số.
- **Giữa**: cùng 2 xe/2 polygon. Xe Y "tâm ngoài + overlap 0.65 → BẬT
  match ≥0.60" — **bất khả thi hình học**: bbox chữ nhật (đối xứng tâm)
  + polygon lồi ⇒ tâm ngoài kéo theo đường tách ⇒ ov < 0.5 < 0.60
  [suy luận hình học]. Nhánh `≥0.60` với đầu vào lồi+chữ nhật là guard
  dự phòng, không thể fire khi `center_inside=false`.
- **Sau (khả thi, đã verify cv2)**: 3 xe/2 ô riêng A05/A07, số thật:
  Xe X `[40,50,370,180]` tâm-trong ov=0.31 → BẬT reject cả 2 nhánh;
  Xe Z `[60,220,200,160]` tâm-trong ov=0.74 → qualify, score≈0.68;
  Xe Y `[750,150,250,240]` tâm-ngoài ov=0.44 → reject (<0.60).
  Rule đúng `slot_vehicle_binder.py`:729-731.
- **Anchor đã phân biệt**: `_overlap_geometry` test `center_inside` bằng
  **tâm bbox** (:727); `_bottom_center` (:573-574) chỉ là neo recovery/
  token (`prepare_predeparture_tokens` :495→:506). Bản trước nói chung
  "neo bottom_center" — đã sửa.
- **"Hình thang không lồi"** — bỏ: hình thang vẫn lồi. Giới hạn đúng:
  `intersectConvexConvex` giả định lồi; ô **lõm** sẽ bị đánh giá overlap
  thấp — config chưa verify [chưa verify], không khẳng định luôn-lồi.

## 2. T3-1 Gate — không hứa quá mức
- **Lag**: recovered-crossing chỉ cứu trong cửa sổ **≤1.0s source-time**
  (`gate_session_controller.py`:302-306) — là đồng hồ quan sát xe, không
  phải độ trễ HTTP; crossing cũ hơn hoặc thiếu 2 mẫu đo cùng-cam/cùng-track
  → mất. Đã sửa QA không còn "cứu đúng ca lag 2s".
- **Jitter**: nếu 2 vị trí liên tiếp thực cắt đoạn vạch đúng hướng →
  session VẪN tạo; guard chỉ lọc điều kiện kích hoạt, không lọc được
  jitter xuyên-vạch-thật. Đã nêu giới hạn.

## 3. T3-3 Snapshot — nhân quả + contract đầy đủ
- Storyboard: frontend .200 **không thể** thấy S1 tạo .250 — sửa timeline:
  publish .180 → frontend .200 thấy vị trí (chưa session) → gate .250 tạo
  S1 → frontend session-poll 500ms thấy S1 sau.
- `frame_index=120` ghi rõ *minh họa deterministic* (payload không có
  "revision").
- Contract trỏ `techgar/runtime_contract.py` `build_runtime_snapshot` :37,
  `RUNTIME_SCHEMA_VERSION=2` :12, `TERMINAL_IDENTITY_STATES` :13 +
  filter :76-77, `parked_slot_id` từ episode :70,:105, `recent_observed_path`
  :109+; producer `two_camera.py`:2844-2869.

## 4. T3-2 Session — CLOSED phân biệt đúng
- "CLOSED" **tồn tại** nhưng chỉ ở read-side filter
  (`session_manager.py`:190,:277,:531,:542,:556); **không assignment nào
  ghi** `state="CLOSED"` — toàn bộ ghi state :358-463 chỉ xuất 6 giá trị
  runtime. Exit = `delete_session_by_global_id` xoá record. Claim quirk
  (không check `qrExpiresAt`) giữ nguyên.
- Deep table sửa "states runtime ghi được" + cite cả filter lines.

## 5. T3-4 Routing — hành vi đúng code
- Reroute: `freshRoute` tính + áp **mỗi tick cả hai nhánh**
  (`App.tsx`:753-774) — ngưỡng 80 chỉ gate cảnh báo/speak, không gate
  reroute. Bỏ chữ "chỉ reroute lặng lẽ" gây hiểu nhầm.
- Heuristic: `costPerMapUnit = min(edge.distance/euclid)` **không clip**
  (`routeEngine.ts`:38-46) — không khẳng định scale≤1; admissibility theo
  cấu trúc min (h≤cost) là [suy luận] từ công thức; graph rỗng → scale=0.
- Ref chuẩn hóa tên file (App.tsx/voiceGuidance.ts/routeEngine.ts).

## 6. Khác (đã làm các vòng trước, nhắc lại)
- T1-1: bỏ "đa số tuyệt đối" → `required_votes=25//2=12` là ngưỡng code.
- T1-2: giữ rõ `vision_primary` ≠ docstring legacy; `pipeline-order.md`
  N12 đồng bộ cùng phát biểu.
- J1: physical-crossing trước GID-publish; session luôn gắn GID (gate
  skip record thiếu `global_id`, `gate_session_controller.py`:461-462).

## Verify thêm trong vòng này
- `build_runtime_snapshot` ở `src/techgar/runtime_contract.py` (không
  phải inline two_camera).
- Không code nào set `state="CLOSED"` (grep toàn repo backend).
- `freshRoute` áp cả nhánh đúng-đường (`App.tsx`:771-774).
