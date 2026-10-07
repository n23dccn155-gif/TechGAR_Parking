---
agent: devin-local
session: forested-parsnip
created: 2026-10-04T09:41:59Z
---
# MEGAPLAN — TechGar Pipeline Explorer (algo-web-v2)

Làm mới hoàn toàn một web tĩnh (HTML/CSS/JS thuần) trực quan hóa luồng thực thi của TechGar và giải thích ~24 thuật toán theo 3 tầng ưu tiên (làm gì / vai trò / nằm đâu / tại sao dùng), do lead Codex điều phối 3 builder Devin, đặt tại D:\TechGar2\algo-web-v2\.

## 0. Bối cảnh & quyết định đã chốt với người dùng

| Hạng mục | Quyết định |
|---|---|
| Thư mục output | `D:\TechGar2\algo-web-v2\` (làm mới). `algo-web\` bản cũ **giữ nguyên, không sửa/xóa**, chỉ được đọc để tham khảo/tái dùng ý tưởng. |
| Công nghệ | HTML + CSS + JS thuần, **không build tool, không npm, không CDN** (chạy offline). Canvas 2D / SVG tự vẽ. Mở `index.html` hoặc `python -m http.server` là chạy. |
| Đối tượng | Người dùng tự học + trình bày/bảo vệ. Lớp nông = giải thích dễ hiểu bằng hình; lớp sâu (nút "Đào sâu") = tham số thật, công thức, file:dòng. |
| Dữ liệu minh họa | **Cảnh giả lập deterministic + tham số/hằng số thật lấy từ code** (vd Kalman Q=diag(2,2,12,12), R=8·I, P0=100·I tại `motion_tracker.py:440-448`). Không nhúng video/dữ liệu replay thật. |
| Phạm vi thuật toán | 3 tầng ưu tiên (xem §3). |
| Trang chủ | **Bản đồ pipeline** theo thứ tự thực thi + chế độ **"Hành trình 1 chiếc xe"** (xe đi qua pipeline, node sáng dần). |
| Cách giao | Ngắt ngay cả team, bỏ Phase 1 v2 dở dang (thư mục `.analysis\algos-v2\` hiện trống), chạy lại theo megaplan này. |
| Ngôn ngữ | Tiếng Việt, dễ hiểu. Thuật ngữ gốc (Kalman, Hungarian, ReID, homography…) giữ nguyên kèm giải nghĩa. |

**Vì sao làm lại:** bản trước bị bác vì (1) sai trọng tâm — liệt kê I/O + cấu trúc dữ liệu thay vì giải thích; (2) thiếu trực quan luồng thực thi. Megaplan này sửa cả hai.

### Ràng buộc cứng (áp dụng cho mọi agent)
1. **Chỉ đọc** `backend/`, `frontend/`, `docs/`; **không sửa** mã nguồn dự án. Chỉ ghi vào `.analysis\` và `algo-web-v2\`.
2. Không cài dependency, không chạy camera/runtime server/hardware. Chạy script đọc/kiểm chứng nhỏ thì được, ghi rõ.
3. Mọi tham số/ngưỡng/tên hàm trên web phải **đối chiếu code thật** và có `file:dòng`. Phân biệt rõ: *chắc chắn từ code* / *suy luận* / *chưa xác minh*.
4. Tài liệu cũ `backend/main_detect/docs/phan_tich_chuyen_sau_thuat_toan_techgar.md` (2357 dòng, có kịch bản xuyên suốt "G#2") và `kich_ban_thuyet_trinh_*.md` là **nguyên liệu tham khảo**, nhưng nó mô tả pipeline `main.py` cũ (4 vùng cắt từ 1 video). **Nguồn sự thật = `two_camera.py:run()` + `src/techgar/*`** (2 camera thật). Chỗ nào doc cũ lệch code → theo code, ghi chú lệch.
5. `frontend/AGENTS.md` (React/Tailwind/Zustand…) chỉ áp dụng cho thư mục `frontend/`, **không** áp dụng cho `algo-web-v2/`.
6. Lead chỉ quản lý (giao việc, review, duyệt). Lead **không** tự đọc code/tự viết nội dung/tự viết web. Ngoại lệ duy nhất lead được tự viết: `MEGAPLAN`-derived `SPEC.md`, checklist review, và file tổng hợp tiến độ.
7. Builder bị block (xin quyền) → ghi nhận và báo lại, không tự approve thay người khác.
8. Mọi lệnh `herdr` phải prefix env (`HERDR_ENV`, `HERDR_SOCKET_PATH`, `HERDR_WORKSPACE_ID`, `HERDR_TAB_ID`, `HERDR_PANE_ID`) như đã biết.

---

## 1. Luồng thực thi thật của TechGar (xương sống của trang chủ)

Trích từ `backend/main_detect/two_camera.py:run()` (dòng ~2004–3200) — **builder phải xác minh lại từng bước trước khi dùng**:

| # | Node pipeline | Việc xảy ra (mỗi vòng lặp frame) | Mã chính (xác minh) |
|---|---|---|---|
| N0 | Thu frame 2 camera | Lấy frame mới nhất + timestamp mỗi cam (cam1/cam2 live hoặc replay) | `latest_frame_capture.py`; `two_camera.py` |
| N1 | ROI mask | Chỉ giữ vùng quan sát; vùng ưu tiên (priority regions) cho recovery | `mask_roi.py`, `motion_tracker._priority_mask` (:590) |
| N2 | Nhận diện trạng thái ô đỗ (vision) | Ensemble 25 biến thể vote trống/đầy → `binder.update_vision` (chạy async job) | `parking_detector.py`; `two_camera.py:2516-2650` |
| N3 | Dự đoán vị trí (Kalman predict) | Mỗi track dự đoán chỗ xe sẽ ở frame này | `motion_tracker._predict_tracks` (:239) → `process_frame` :2228 |
| N4 | Occlusion guard prepare | Bảo vệ nhóm xe bị dính blob | `occlusion_guard.py`; `process_frame` :2229 |
| N5 | Motion detection | Frame-diff đa mốc thời gian + bù sáng + ngưỡng + chặn bóng/echo/twin → blob → bbox | `_detect` (:759), `_temporal_motion_mask` (:522), `_motion_between` (:451) |
| N6 | Gán detection↔track | Hungarian/LAPJV + cổng ràng buộc (gate, margin) | `_assign` (:1597), `_association_gate` (:1193) |
| N7 | Cập nhật / coasting / hết hạn / sinh track mới | Matched → Kalman correct; unmatched → coasting (prediction age); quá TTL → expire; detection mới → `_create_or_reid` | `process_frame` :2250-2340; `_apply_detection` :2096; `_create_or_reid` :2009 |
| N8 | Thông báo mất/hết hạn track | `manager.notify_track_lost/expired`, `binder.notify_track_*` | `two_camera.py:2690-2712` |
| N9 | Bằng chứng danh tính liên-cam | occluded identities, independent pairs, `observe_trajectories` (quỹ đạo shared-map) | `cross_camera_manager.observe_trajectories` (:1429); `trajectory_memory.py` |
| N10 | Phục hồi xe rời ô | `prepare_predeparture_tokens`, `recover_departing_vehicle_ids` (dormant / departure token) | `slot_vehicle_binder.py` (:479, :2763); `two_camera.py:2759-2790` |
| N11 | Global ID + Handoff 2 cam | `manager.update_all_tracks`: ReID appearance + homography + chi phí ứng viên + predictive handoff + xử xung đột GID | `cross_camera_manager.py` (`_upsert_handoff`, `_candidate_cost`, `_match_pending_handoffs`…) |
| N12 | Slot binder fusion | `remap_vehicle_ids` → `update_tracks` → `finalize_arrivals`: xe đứng yên đủ lâu trong polygon → PARKED; track chỉ được đổi trống→có xe, không bao giờ ngược lại | `slot_vehicle_binder.update_tracks` (:2047) |
| N13 | Đồng bộ reservation + xuất snapshot | `manager.to_json`, `runtime_publisher.publish_snapshot` (cổng 8001) | `runtime_contract.py`; `two_camera.py:2808-2870` |
| N14 | Gate session controller | Line-crossing ENTRY/EXIT đúng chiều, state machine session, QR TTL 120s (cổng 8000) | `gate_session_controller.py` (:229-310, `GateSessionCoordinator` :312) |
| N15 | Frontend điều hướng | Poll snapshot, chọn ô, A* trên lane graph, off-route >75px, giọng nói | `frontend/src/routing/routeEngine.ts`, `laneGraph.ts` |

> Lead giao builder-c xác minh thứ tự N0–N15 là bước đầu tiên của Phase 1 — mọi trang khác bám theo thứ tự đã xác minh này.

### Hành trình 1 chiếc xe (kịch bản xuyên suốt, dùng cho chế độ "Hành trình")
Xe vào cổng (N14 sinh session/QR) → vào cam1 (N1 ROI → N5 motion → N7 track mới, N3/N6 Kalman+Hungarian theo dõi) → sắp rời cam1, sang cam2 (N11 predictive handoff giữ nguyên Global ID nhờ ReID + homography + hướng đi) → vào ô đỗ, dừng (N12 binder: overlap + đứng yên → PARKED, N2 vision xác nhận) → mất detection chuyển động vì đứng yên (N7 coasting/suspend, N10 dormant giữ danh tính) → xe rời ô (N10 departure token khôi phục đúng GID) → ra cổng EXIT (N14). Mỗi bước: node tương ứng sáng lên + chú thích 1 câu + nút "Mở chi tiết".

---

## 2. Cấu trúc web

```
algo-web-v2/
  index.html              # shell + router (hash-based: #/, #/algo/<id>, #/journey, #/glossary)
  css/tokens.css          # màu, font, spacing (design tokens)
  css/app.css
  js/core/router.js       # hash router + registerPage contract
  js/core/player.js       # engine animation: play/pause/step/speed/scrub/reset, deterministic RNG (seeded)
  js/core/draw.js         # helper canvas: lưới, mũi tên, bbox, nhãn, DPR-aware, resize
  js/core/pseudocode.js   # panel pseudocode tô sáng theo bước
  js/core/ui.js           # thẻ 4 khối, accordion "Đào sâu", Q&A, breadcrumb prev/next
  js/pipeline/map.js      # trang chủ: flow diagram N0–N15 + chế độ Hành trình
  js/pipeline/journey.js
  js/pages/<algo-id>.js   # mỗi thuật toán 1 file, tự đăng ký qua TG.registerPage
  js/content/<algo-id>.js # nội dung chữ + tham số thật (tách khỏi mã animation)
  js/manifest.js          # danh sách trang/tầng/thứ tự (CHỈ builder-c sửa; lead merge)
  README.md               # cách mở, cấu trúc, cách thêm trang mới
  QA.md                   # kết quả kiểm thử
```

**Hợp đồng trang (để 3 builder làm song song không đụng nhau):**
```js
TG.registerPage({
  id: 'kalman',                // trùng manifest
  title: 'Kalman — dự đoán vị trí xe',
  tier: 1, node: 'N3',
  mount(rootEl, ctx) { /* vẽ UI + animation; trả về {destroy()} */ }
});
```
- `ctx` cung cấp: `player`, `draw`, `pseudocode`, `ui`, `content`, `router`.
- Mỗi builder **chỉ ghi** vào file của mình (`pages/`, `content/` của thuật toán được giao). Không sửa `core/`, `manifest.js`, `css/` — cần đổi thì báo lead để giao builder-c.
- Không dùng `import` bên ngoài, không `fetch` file cục bộ (để mở bằng `file://` vẫn chạy): load bằng thẻ `<script>` thường, không ES module nếu dùng `file://`.

### Khuôn mẫu BẮT BUỘC cho mỗi trang thuật toán
1. **Bài toán đời thật** (1–2 câu): ví dụ "xe bị che khuất 1 giây thì hệ thống biết nó đi đâu?".
2. **Animation Trước/Sau**: cùng cảnh chạy khi *tắt* và *bật* thuật toán → thấy rõ vì sao cần nó.
3. **4 khối giải thích** (không được thiếu):
   - **Làm gì** — theo nghĩa đời thực
   - **Vai trò trong pipeline** — nằm ở node nào, ngay trước/sau là gì, **mất nó thì hỏng gì**
   - **Nằm ở đâu** — file/class/hàm + `file:dòng`
   - **Tại sao dùng nó** — giải quyết vấn đề gì; vì sao chọn nó thay vì phương án khác (vd Kalman vs Particle Filter cũ, Hungarian vs greedy)
4. **Đào sâu** (accordion): tham số/ngưỡng thật, công thức, edge case, giới hạn.
5. **Hỏi đáp phản biện** (2–3 câu "hội đồng có thể hỏi" + trả lời ngắn).
6. **Điều hướng**: node trước / node sau trong pipeline.

**Cấm:** trang chỉ là bảng input/output/cấu trúc dữ liệu; đoạn văn dài >5 dòng không kèm hình; hằng số bịa không có `file:dòng`.

### Yêu cầu engine animation (builder-c)
- Điều khiển: ▶ / ⏸ / Bước tới / Bước lùi / Reset / thanh tua / tốc độ 0.25×–4×.
- Deterministic (RNG seed cố định) → mỗi lần chạy giống nhau, thuyết trình lặp lại được.
- Chú thích (caption) theo từng bước; pseudocode tô sáng đồng bộ bước.
- Canvas hỗ trợ devicePixelRatio, resize, `prefers-reduced-motion` (hiển thị tĩnh theo bước).
- Phím tắt: ← → chuyển bước, Space play/pause; **Chế độ trình chiếu** (toàn màn hình, ← → đi qua các node pipeline).
- Bảng màu nhất quán với dự án: trống = xanh, có xe = đỏ, đang chuyển/đặt chỗ = vàng/hổ phách, cam1 = xanh dương, cam2 = cam, mỗi Global ID một màu cố định.

---

## 3. Danh mục thuật toán & phân công (3 tầng)

Phân công theo mạch kiến thức để mỗi builder nắm sâu một cụm và ít đụng nhau.

### builder-a — "Phát hiện & theo dõi trong 1 camera" (N1, N3–N7)
| Tầng | Thuật toán | Animation |
|---|---|---|
| **T1** | **ROI masking + priority regions** | Video giả: xe/nhiễu trong-ngoài ROI; kéo mask xem blob nào bị loại |
| **T1** | **Motion detection** (frame-diff đa mốc + bù sáng + ngưỡng + blob→bbox) | 3 khung song song: frame hiện tại / frame tham chiếu / mask; xe di chuyển → blob hình thành |
| **T1** | **Kalman filter (CV 4 trạng thái)** | Điểm đo nhiễu vs ước lượng mượt; vẽ vector vận tốc, elip hiệp phương sai co/giãn; chỉnh Q/R xem tác động |
| **T1** | **Dự đoán & coasting khi mất dấu** (prediction age, stale prediction, TTL) | Xe chui sau vật cản: hộp "ma" dự đoán đi tiếp, độ tin cậy giảm dần, tới TTL thì bỏ |
| **T1** | **Hungarian/LAPJV + gating** | Ma trận chi phí động; đường nối detection↔track; so sánh greedy sai vs Hungarian đúng |
| T2 | Bù sáng (brightness compensation) | Đổi sáng toàn cảnh → mask không nổ |
| T2 | Chặn bóng đổ (cast shadow) | Xe + bóng: bóng bị loại khỏi bbox |
| T2 | Chặn echo/twin/duplicate (ROI-edge twin) | 1 xe 2 blob → còn 1 |
| T2 | Vòng đời track (tentative→confirmed→lost→TTL→suspend) | Máy trạng thái chạy theo cảnh |
| T2 | Occlusion guard (nhóm xe bị dính blob) | 2 xe chạm blob → mở nhóm, tách ra vẫn đúng ID |

### builder-b — "Danh tính xuyên camera" (N8–N11)
| Tầng | Thuật toán | Animation |
|---|---|---|
| **T1** | **ReID ngoại hình (HSV+LAB histogram, gallery tracklet)** | Cắt crop xe → histogram → so khoảng cách giữa các xe/gallery |
| **T1** | **Predictive Handoff + Global ID 2 camera** (chi phí ứng viên: ngoại hình + kích thước xoay-bất-biến + cosine hướng + độ sâu vào + quỹ đạo) | 2 khung cam cạnh nhau; xe ra mép cam1, "ứng viên" xuất hiện cam2, các thành phần chi phí cộng dồn, GID giữ nguyên |
| T2 | Homography / shared-map | Chấm điểm cam1 & cam2 chiếu lên bản đồ chung, kéo calibration xem lệch |
| T2 | Trajectory memory (vận tốc, độ cong) | Quỹ đạo dự báo chồng khớp/lệch ứng viên |
| T2 | Dormant identity + departure token | Xe đỗ "ngủ" → rời ô → token khôi phục đúng GID |
| T3 | Xử xung đột GID / merge-collision / probation | Thẻ giải thích + sơ đồ tình huống (không cần animation phức tạp) |

### builder-c — "Ô đỗ, cổng, giao tiếp, frontend" (N0, N2, N12–N15) **+ shell/engine**
| Tầng | Thuật toán | Animation |
|---|---|---|
| **T1** | **Nhận diện ô đỗ — ParkingDetector ensemble** (25 biến thể vote, Center Cluster Rescue, Edge Recheck, temporal smoothing) | Lưới 5×5 biến thể vote; cứu xe trắng bị miss; làm mượt theo thời gian |
| **T1** | **Slot binder fusion** (one-way override, overlap, đứng yên đủ lâu → PARKED, arrival claim) | Xe lăn vào ô: overlap tăng, đồng hồ đứng yên, chốt PARKED; track không bao giờ biến ô có xe thành trống |
| T2 | Hình học polygon (point-in-polygon, signed distance, bbox∩polygon) | Kéo bbox qua polygon xem overlap |
| T3 | Gate line-crossing + hướng | Xe cắt vạch ENTRY/EXIT đúng/sai chiều |
| T3 | Session state machine + QR TTL 120s | Sơ đồ trạng thái chạy theo hành trình |
| T3 | Snapshot contract (cổng 8001→8000→frontend) | Sơ đồ luồng dữ liệu |
| T3 | A* routing + off-route >75px (frontend) | Lưới lane, open/closed set, đường tìm được |
| — | **Shell, router, engine, trang chủ Pipeline Map, chế độ Hành trình, Glossary, manifest** | Xem §2 |

> Nếu builder-c quá tải: lead được phép giao riêng T3 cho builder nào rảnh trước. Lead quyết định, ghi vào `PROGRESS.md`.

**Tổng:** 8 trang T1 (animation riêng sâu), 9 trang T2 (1 cảnh đơn giản), 6 thẻ T3 + trang chủ + hành trình + glossary.

---

## 4. Các Phase

### Phase 0 — Ngắt & reset (thực hiện ngay sau khi người dùng duyệt plan)
1. Sao chép plan này thành `D:\TechGar2\.analysis\MEGAPLAN.md`.
2. Ngắt cả team: `herdr agent send-keys <name> esc` cho `lead`, `builder-a`, `builder-b`, `builder-c`; chờ cả 4 `idle`/`done`. Không đóng pane, không restart codex (lead đang bypass mode).
3. Không xóa gì. `.analysis\algos-v2\` (trống) dùng tiếp. File cũ trong `.analysis\algos\` và `algo-web\` giữ nguyên làm tham khảo.
4. Gửi prompt cho lead: đọc `MEGAPLAN.md` đầy đủ, xác nhận hiểu trong ≤5 dòng, rồi dispatch Phase 1. Xác nhận lead nhận lệnh và có builder chuyển `working`.

### Phase 1 — Dossier giải thích v2 (3 builder song song)
Output: `.analysis\algos-v2\<builder>.md`, mỗi thuật toán một **thẻ** theo mẫu cố định:
```
## [Tầng] Tên thuật toán — Node N?
- Bài toán đời thật:
- Làm gì (đời thực):
- Vai trò trong pipeline: (đứng sau ?, trước ?, mất nó thì ?)
- Nằm ở đâu: file:dòng, class/hàm
- Tại sao dùng nó: (vấn đề + phương án thay thế bị loại)
- Các bước chính (3–7 bước, ngắn — để làm animation + pseudocode)
- Tham số/hằng số THẬT: tên = giá trị — file:dòng
- Ý tưởng animation: (cảnh giả lập, 3–6 khung hình then chốt)
- Hỏi đáp phản biện: (2–3 câu)
- Mức chắc chắn: code / suy luận / chưa xác minh
```
Quy tắc: tối đa ~1 trang/thuật toán, **không** liệt kê I/O dạng bảng làm nội dung chính. builder-c cũng xác minh bảng thứ tự N0–N15 (§1) và nộp `pipeline-order.md`.
Tiêu chí thoát Phase 1: đủ thẻ T1+T2+T3 của từng builder, mọi `file:dòng` kiểm tra mở được.

### Phase 2 — Lead review & lọc (lead KHÔNG tự phân tích code)
Lead dùng checklist, giao lại builder nếu thiếu:
- [ ] Mọi thẻ có đủ 4 khối (làm gì / vai trò / ở đâu / tại sao)
- [ ] Không còn nội dung kiểu spec I/O
- [ ] Tham số có `file:dòng`; lấy mẫu kiểm tra chéo ≥3 tham số/builder bằng cách giao builder khác đối chiếu code (cross-review)
- [ ] Thứ tự N0–N15 khớp `two_camera.py`; doc cũ lệch code đã ghi chú
- [ ] Không trùng/mâu thuẫn giữa builder (vd ngưỡng, tên node)
- [ ] Mỗi trang T1/T2 có storyboard animation ≥3 khung then chốt
Sản phẩm của lead: `algo-web-v2\SPEC.md` gồm: danh sách trang cuối cùng + tầng, storyboard animation T1, data/content contract, style guide, phân công file, thứ tự build, tiêu chí nghiệm thu từng trang.

### Phase 3 — Build web
- **W1 (builder-c trước, các builder khác viết nội dung song song):** shell, router, `core/*`, manifest, trang chủ Pipeline Map (N0–N15 clickable), Hành trình (khung), CSS tokens. Xuất `core` ổn định trước khi builder-a/b hoàn thiện trang (builder-a/b có thể code trang trước trên API đã chốt trong SPEC §contract và tích hợp khi core sẵn sàng).
- **W2 (song song):** mỗi builder làm trang của mình: T1 trước (đủ animation + 4 khối + đào sâu + Q&A), rồi T2, rồi T3. Mỗi trang xong → tự kiểm thử mở trực tiếp + nộp lead review từng trang (lead gửi lại lỗi cụ thể, không duyệt chung chung).
- **W3 (builder-c tích hợp):** hoàn thiện Hành trình nối đủ node với trang chi tiết, Glossary, chế độ trình chiếu, README.
- **W4 (QA – xem §5).**

### Phase 4 — Nghiệm thu
Lead tổng hợp `algo-web-v2\QA.md` + trả lời tóm tắt ≤8 dòng + cách mở web. Người dùng xem và phản hồi.

---

## 5. Kiểm thử & tiêu chí nghiệm thu

**Công cụ có sẵn:** Playwright 1.50 + Chromium đã cài (`frontend\node_modules\.bin\playwright`, `%LOCALAPPDATA%\ms-playwright`). Builder-c viết script `algo-web-v2\qa\smoke.mjs` (không thêm dependency vào `algo-web-v2`; dùng playwright của `frontend\`).

**Tự động (builder-c, lead yêu cầu chạy & nộp log):**
1. Mở `index.html` qua `file://` và qua `python -m http.server` → trang chủ render, **console 0 lỗi, 0 warning** nghiêm trọng.
2. Duyệt mọi route trong manifest → render không lỗi; mỗi trang có đủ 4 khối + accordion + Q&A + điều hướng prev/next.
3. Mỗi trang animation: bấm Play → canvas thay đổi (so sánh pixel khác nhau giữa 2 mốc), Step/Reset hoạt động, kết quả deterministic (cùng seed → cùng ảnh ở bước N).
4. Mọi `file:dòng` trong content: script kiểm tra file tồn tại và dòng ≤ độ dài file.
5. Không có request mạng ngoài (không CDN).
6. Chụp screenshot desktop (1440×900) + laptop nhỏ (1280×720) cho trang chủ + mỗi trang T1 vào `algo-web-v2\qa\shots\`.

**Thủ công (người dùng, checklist trong `QA.md`):**
- [ ] Nhìn trang chủ hiểu được thứ tự chạy của hệ thống
- [ ] Chế độ Hành trình chạy mượt, node sáng đúng thứ tự
- [ ] Mỗi trang T1 trả lời rõ: làm gì / vai trò / nằm đâu / tại sao dùng — bằng hình là chính
- [ ] Đủ các thuật toán bạn nêu: ROI, handoff 2 cam, Kalman, dự đoán xe, xác định ô đỗ, ReID
- [ ] Chế độ trình chiếu dùng được khi thuyết trình

**Tiêu chí "xong":** tất cả mục tự động pass, 8 trang T1 + 9 trang T2 + 6 thẻ T3 + trang chủ + hành trình + glossary tồn tại, người dùng duyệt.

---

## 6. Rủi ro & cách xử lý

| Rủi ro | Xử lý |
|---|---|
| Builder lại viết kiểu catalog I/O | Khuôn mẫu cứng §2 + checklist Phase 2; lead trả lại thẻ không đạt |
| Tham số bịa / doc cũ lệch code | Quy tắc "nguồn sự thật = code", cross-review chéo, script kiểm tra `file:dòng` |
| `cross_camera_manager.py` 7.7K dòng quá lớn → builder-b quá tải/hiểu sai | Dossier theo thẻ ngắn; chỉ đi sâu các hàm đã liệt kê (`_candidate_cost`, `_upsert_handoff`, `_match_pending_handoffs`, `observe_trajectories`…); xung đột GID để T3 |
| Ba builder đụng file | Quy tắc sở hữu file §2; chỉ builder-c sửa `core/`, `manifest.js`, `css/` |
| Builder-c là nút thắt (shell + nhiều trang) | W1 làm shell trước; T3 có thể điều sang builder rảnh |
| Context đầy (builder đã dùng ~190k/262k token) | Lead nhắc builder ghi trạng thái ra file `.analysis\algos-v2\<ten>.md` thường xuyên; nếu cần, restart builder mới với `devin` và đọc file này |
| Mở `file://` bị chặn module/fetch | Dùng `<script>` thường, không ES module/fetch file cục bộ; kiểm thử cả `http.server` |
| Hiệu năng canvas | Dùng `requestAnimationFrame`, cảnh nhỏ, tránh vẽ lại toàn bộ khi không cần |
| Lead Codex vô tình tự làm việc của builder | Prompt nhấn mạnh vai trò; kiểm tra transcript của lead định kỳ |

---

## 7. Việc cần làm ngay sau khi người dùng duyệt plan (trình tự thao tác của tôi)
1. Ghi plan thành `D:\TechGar2\.analysis\MEGAPLAN.md`.
2. `esc` cả 4 agent, xác nhận idle/done.
3. Gửi prompt cho lead (ngắn, trỏ tới `MEGAPLAN.md`): vai trò chỉ quản lý, đọc megaplan, xác nhận hiểu, bắt đầu Phase 1, nhắc prefix env herdr, nhắc builder block thì báo lại.
4. Giám sát: xác nhận lead dispatch và cả 3 builder chuyển `working` (xử lý các hộp thoại approval nếu có); báo người dùng trạng thái.
5. Không dừng cho tới khi chắc chắn team nhận lệnh và bắt đầu làm việc trơn tru.
