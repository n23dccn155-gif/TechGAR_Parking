# cross-reader-a — A đọc chéo B6 + C3 (readonly, không sửa file owner khác)

**Phạm vi:** B · reid, handoff, homography, trajectory, dormant, gid-conflict — C · ensemble, binder, polygon.
**Phương pháp:** default-layer text dump (`.tg-v3` innerText) + ảnh top/mid/final × 1280×720 & 1440×900 (`qa/shots/cross-reader-a/`, harness `_cross_a.mjs`, 0 console errors toàn bộ 9 route).
**Tiêu chí:** người mới hiểu LÀM GÌ / vị trí pipeline / vì sao / thiếu thì sao; caption↔canvas sync; claim không tuyệt-đối quá mức; facts có file:dòng; minh họa gắn nhãn.

## B · `reid` — "Nhận ra xe bằng mẫu màu" (Chặng 10/12)
- **Làm gì:** bộ nhớ mẫu màu giúp nhận xe cũ khi tái xuất hiện ở camera khác.
- **Vai trò:** bước con trong chặng bàn giao; before=khôi-phục-rời-ô → after=cập-nhật-ô; links handoff + gid-conflict (same-stage, đúng — không hứa call-order).
- **Thiếu:** mảnh cam-2 có thể được cấp mã mới → một xe hai hồ sơ.
- **Mạnh:** hedge tốt "màu là một chứng cứ, không phải kết luận"; gauge ngưỡng 0,45 vs giới hạn 0,82 minh họa rõ; steps mẫu→bộ nhớ→so cặp→ứng viên→kiểm phần còn lại logic chặt.
- **Facts:** `tracklet_descriptor.py:18-78` hsv 416-D weights; `:81-91` quality gate — Deep đủ.
- **Flag:** không có. ("mã G5/G9" là ID minh họa — chấp nhận được.)

## B · `handoff` — "Bàn giao xe qua hai camera" (Chặng 10/12)
- **Làm gì:** đặt điểm hẹn trên bản đồ chung để đón đúng xe qua cầu nối hai camera.
- **Thiếu:** mỗi lần qua cầu có thể tách mã → hồ sơ vỡ mảnh.
- **Mạnh:** 6 bước arc hoàn chỉnh — điểm hẹn → cổng cứng loại-trước-khi-chấm → 4 dấu hiệu cùng chấm → thắng cách biệt → giống liên tiếp; HUD final số thật (0,324 vs 0,591 · chênh 0,27 · giống 2/2) đọc được không cần code; TTL 45 khung.
- **Facts:** `cross_camera_manager.py:2572-2636` `_upsert_handoff` TTL 45f; `:2744-2774` predict-edge.
- **Flag:** không có.

## B · `homography` — "Homography / bản đồ chung" (cài đặt một lần)
- **Làm gì:** quy hai camera về cùng bản đồ centimet để khoảng cách xuyên cam đo được thật.
- **Vị trí đặc biệt:** "Một lần khi cài đặt — chạy ngoài luồng, không theo khung hình" · kết quả dùng ở chặng 8–10 · links nơi-dùng — **position setup/off-pipeline đúng mapping C**.
- **Thiếu:** khoảng cách hai cam chỉ còn chênh điểm ảnh → phép kiểm bàn giao đoán sai.
- **Mạnh:** 8 điểm chấm (4 góc đo thật + 4 điểm vạch); cổng chất lượng từ-chối-ngay-lúc-nạp; HUD "(35,2·11,8) vs (34,9·11,5) cm, lệch 0,4cm vs vòng 15cm" — trực quan "hai cam nói một thước".
- **Facts:** `rectangle_line_calibration.py:41-112` gates 2.0cm/8.5px/12px; `two_camera.py:284-341` load_calibration.
- **Flag:** nhỏ — title giữ jargon "Homography" (term chính — chấp nhận được, tooltip có sẵn).

## B · `trajectory` — "Bộ nhớ quỹ đạo" (Chặng 8–9/12)
- **Làm gì:** phân biệt hai xe cùng màu nhờ con đường vừa đi — chứng cứ độc lập màu sắc.
- **Thiếu:** chỉ còn vị trí để đoán → mảnh gần xe nào gán xe đó, dễ tráo danh tính.
- **Mạnh:** "chỉ điểm đo thật, không lấy điểm đoán" — chống bằng-chứng-giả; 6 dấu hiệu cùng chấm; cổng điểm loại trước khi ghép; đường-phẳng ≠ xe-rời-ô; hòa điểm → chờ thay vì chọn vội.
- **Facts:** `trajectory_memory.py:56-68` — **B tự sửa 2 claim dossier sai** (history 2.0 không 3.0; cap 240 không 16) — rigor tốt.
- **Flag:** không có.

## B · `dormant` — "Danh tính ngủ" (Chặng 7/12)
- **Làm gì:** xe đỗ kín mất dấu → danh tính "đi ngủ" kèm bộ nhớ để nhận lại đúng xe khi lùi ra.
- **Thiếu:** mỗi lần đỗ tách hai hồ sơ — sổ bãi đếm một xe thành hai khách.
- **Mạnh:** **hai đồng hồ phân biệt rõ** — vé rời ô 5 giây vs danh tính ngủ ~1 phút; "vùng nở chỉ đánh thức bộ dò, chưa phải cổng chọn" — phân tách đúng semantics; khớp ngủ cũng chỉ là đề xuất mạnh (màu+vị trí vẫn kiểm); giữ gấp 4× nếu xe qua 2 cam.
- **Facts:** `cross_camera_manager.py:2419-2445` `_dormant_reid_ready` confirmed + fragment ≥3 khung.
- **Flag:** không có.

## B · `gid-conflict` — "Gỡ xung đột mã xe" (Chặng 10/12)
- **Làm gì:** một mã bị gán nhầm cho hai vết cùng lúc → quyết vết nào giữ.
- **Thiếu:** một mã ôm hai vết → sổ bãi gộp hai xe một lượt đỗ.
- **Mạnh:** thước ba vùng trên canvas (gần=nhiễu · giữa=đếm bằng chứng 2 khung liên tiếp · xa=tách ngay); step 5 honest scope "Gộp hai mã KHÁC nhau là chuyện khác, dùng quy tắc riêng"; vết thua "sống riêng" không xóa.
- **Facts:** `cross_camera_manager.py:3226-3374` `_resolve_cross_camera_global_conflicts` bounds 2×/3× dup :3278-3279, evidence :3306, rank :3314.
- **Flag:** không có.

## C · `ensemble` — "Bỏ phiếu trạng thái ô đỗ" (nhánh song song)
- **Làm gì:** hỏi 25 cách xử lý ảnh trên một ô; đủ phiếu đồng ý mới đổi trạng thái.
- **Vị trí:** "nhánh song song — không nằm trong vòng lặp theo dõi" đúng mapping C; links→motion luồng song song.
- **Thiếu:** trạng thái ô nhảy lung tung theo ánh sáng/bóng.
- **Mạnh:** **rigor rất tốt** — "ngưỡng 12 phiếu là quy ước cố định trong mã nguồn, không phải đa số tuyệt đối"; "hai lớp kiểm phụ đang TẮT trong bản chạy thật" (runtime≠docs nói thẳng); báo trống nhầm nguy hơn → chiều ra chờ lâu hơn (2 lần/0,5s vào vs 3 lần/1s ra); rescue lõi đảo kết quả giải thích rõ.
- **Facts:** `parking_detector.py:7` 25 biến thể 5×5; chạy 2 lần/giây luồng riêng.
- **Quan sát (không phải bug):** giữ KỊCH BẢN selector 3 cảnh (xe trắng hòa / chỉ lộ lõi / rời ô) — cần thiết để show rescue logic; khác với arc đơn của các trang A nhưng nhất quán với thiết kế đa-tình-huống của C.
- **Flag:** không có.

## C · `binder` — "Gắn xe vào ô đỗ" (Chặng 11/12)
- **Làm gì:** tách hai câu hỏi — "có xe không" do ảnh trả lời, "xe nào" do vết trả lời → đổi mã không làm ô nhảy.
- **Thiếu:** trạng thái ô nhảy mỗi lần xe đổi mã hay vết trượt khỏi ô.
- **Mạnh:** OFF/ON đúng bản chất (trái ô bám mã → nhảy mở-đợt-mới; phải ô bám ảnh → chỉ đổi nhãn); điểm neo ở chân xe + vùng chờ mở dần; nhận lại nhãn cũ không mở đợt mới; rules có ngưỡng thật (tâm+35% hoặc trùng 60% bất kể tâm) khớp polygon.
- **Facts:** `slot_vehicle_binder.py:712` `_overlap_geometry` qualify gate.
- **Flag:** không có.

## C · `polygon` — "Đo xem xe có trong ô" (Chặng 10–11/12)
- **Làm gì:** đo phần trùng thật xe↔ô thay vì chỉ xét tâm — vệt dài lướt mép không thành xe đậu.
- **Thiếu:** vệt dài qua mép ô bị gắn nhầm là xe đậu.
- **Mạnh:** 3 xe 2 ô minh họa tách bạch (X tâm-trong-31%-rớt vs Z 74%-qua vs Y tâm-ngoài-44%-rớt); cổng kép 35%/60% khớp binder; nhánh 60% ghi honest "suy ra từ hình học — có vẻ lớp phòng ngừa"; **limit tự khai**: "ô vẽ tay bị lõm → phép đo giả định đa giác lồi [chưa verify config]"; khoảng cách có dấu neo cho bước sau.
- **Facts:** `slot_vehicle_binder.py:712` `_overlap_geometry`.
- **Flag:** không có (nhãn C đang fix hiển thị đúng ở ảnh postfix).

## TỔNG KẾT
- **9/9 route đọc được cho người mới** — LÀM GÌ/vai trò/thiếu-thì-sao đều rõ ở lớp mặc định; caption↔canvas↔HUD sync; không claim tuyệt đối trái nguồn; minh họa gắn nhãn "minh họa".
- **0 blocker cần owner sửa.** Chất lượng B6+C3 ngang mẫu ROI: hedges đúng phạm vi, runtime-vs-default nói thẳng, Deep đủ file:dòng.
- **Ghi nhận cho LEAD (không yêu cầu sửa):**
  1. Vocab detection-blob: A dùng "vệt"/"mảng" (glossary blob), B dùng "mảnh" — cả hai đều glossed; nếu R5 unify glossary có thể chuẩn hóa 1 từ.
  2. `ensemble` giữ scenario-selector — design hợp lý cho 3 tình huống rescue; khác arc-đơn nhưng không vi phạm.
  3. ID minh họa "G5/G9" xuất hiện nhất quán qua reid/handoff/dormant/gid-conflict — narrative liền mạch giữa các trang B (tốt).
- **Ảnh:** `algo-web-v2/qa/shots/cross-reader-a/` — 9 route × 3 shot × 2 viewport = 54; dump text `_cross_dump_a/*.json`.

---

# WAVE-2 — B3 async-branch routes (đọc trên bản mới, probe `_cross_a2.mjs`, 0 errors)

Ảnh: `qa/shots/cross-reader-a/gate|session|snapshot-{top,mid-sN,final-sN,pcode-sN,src-open}[-1440].png` (5 loại × 2 viewport × 3 route = 30). Session: B đang fix trái/phải theo LEAD — **fix đã live ở bản probe** (trái "GIẢ ĐỊNH SAI" đúng nhãn), nếu B còn chỉnh thì flag chuyển pending-recheck.

## B · `gate` — "Xe qua vạch cổng" (nhánh bất đồng bộ)
- **Làm gì:** đoạn đường 2 vị trí liên tiếp cắt vạch theo đúng chiều cờ → mở/đóng phiên.
- **Vai trò:** before=snapshot (nguồn nuôi — đúng async, không giả call-order) → here=cổng-vào/ra → after=phiên-QR cùng nhánh.
- **Thiếu:** không phân biệt vào/ra — xe ra cũng được phát phiên, sổ nhân đôi.
- **Mạnh:** arc 4 bước đủ — đúng chiều mở / ngược từ-chối / đường cứu (≥2 đo liền cùng cam+vết ≤1s) / rung-động-không-cắt an toàn cả 2 bên; "vị trí đoán không được cứu vì có thể trôi" — semantic chính xác.
- **Fact-check độc lập (A verify source):** gsc:229-256 intersection+direction ✓ · `_recent_measured_entry_crossing` gsc:259-309 — `max_gap_seconds=1.0` (gsc:264), `raw_path[-12:]` (gsc:279) ✓ · `--poll-interval=0.25` gsc:865 → ~4Hz ✓ (lưu ý `time.sleep(max(poll,1.0))` gsc:904 chỉ ở error-path, không phải nhịp thường) · `global_id is None → skip` gsc:461 ✓.
- **Flag:** không có.

## B · `session` — "Phiên QR sống qua hạn mã" (nhánh bất đồng bộ)
- **Làm gì:** phiên giữ trạng-thái xe vào→ra; hạn QR 120s chỉ ẩn khỏi kiosk, phiên vẫn sống.
- **Thiếu:** không phiên → kiosk không mã, xe không được nhớ, không dẫn đường.
- **Mạnh:** trung-tâm-ý đúng bản-chất-source — "mã ẩn ≠ phiên chết" (hai đồng hồ riêng); FSM strip 6 trạng thái; kết thúc chỉ một cách (vạch ra → xóa bản ghi, không trạng thái "đã đóng"); `departing` kéo "đã đỗ" về chọn ô (dời ô hợp-lệ).
- **Fact-check độc lập:** `QR_DISPLAY_SECONDS=120.0` sm:29 ✓ "visibility-only" đúng · kiosk lọc `WAITING ∧ chưa-claim ∧ current<expiry` sm:206-215 ✓ · **claim không check hạn** — sm:355-366 chỉ check state, B tự-khai "quirk" trong src4 ✓ (A verify độc lập: đúng — quét muộn vẫn được, đó là semantic thật) · xóa `delete_session_by_global_id` sm:585 ← gsc:526 trên vạch ra ✓.
- **Flag:** không có (fix trái/phải đã live — xem ảnh `session-mid-s2.png`).

## B · `snapshot` — "Bản tin mới nhất thắng" (Chặng 12/12)
- **Làm gì:** điểm phát giữ duy nhất bản mới nhất — bên đọc chậm bị bỏ qua bản cũ, đó là chủ đích.
- **Vai trò:** before=cập-nhật-ô → here=đồng-bộ → after=nuôi các nhánh async (cổng·phiên·điều-hướng) — đúng mapping C.
- **Thiếu:** không bản tin chung — mỗi bên tự hỏi, nghẽn vòng lặp, lệch dữ liệu.
- **Mạnh:** "ghi đè là thiết kế, không phải lỗi" — framing đúng; left-panel GIẢ ĐỊNH SAI "hàng chờ" minh họa tại-sao-latest-wins; màn hình 2 nhịp (vị trí nhanh / phiên chậm) — lệch nhịp bình thường; stale >5s báo cũ không "giả sống"; box liệt kê nội-dung bản tin (xe ID+vị trí cm+cam, ô trống/có+sự-kiện, vệt gần nhất phục-vụ-cứu-cắt).
- **Fact-check độc lập:** `json_fps=5.0` tc:1802 + throttle `1/json_fps` tc:2817 → ~5Hz ✓ · mailbox freeze+bytes no-queue `runtime_server.py:106-113,285-289` ✓ · stale gate `_fresh_live` gsc:103-123 (cam age_ms ≤5000 ∧ ts ≤5.0s) + `max_age_seconds=5.0` gsc:157-164 ✓.
- **Flag:** không có.

## Fact-check tổng (A đọc source độc-lập, B đối chiếu ≥3 fact/route)
| Claim | Source | Kết |
|---|---|---|
| QR 120s chỉ là mốc hiển thị | `sm:29` `QR_DISPLAY_SECONDS=120.0`; kiosk lọc `sm:206-215` | ✓ visibility-only, không TTL |
| Claim không check hạn mã | `sm:355-366` chỉ check state==WAITING | ✓ quirk thật, B khai đúng |
| Session xóa trên vạch ra | `sm:585` + callsite `gsc:526` | ✓ |
| Snapshot ~5Hz | `tc:1802` default + `tc:2817` throttle | ✓ |
| Latest-wins mailbox | `runtime_server.py:106-113` freeze bytes | ✓ |
| Stale >5s báo cũ | `gsc:103-123`, `gsc:157-164` | ✓ |
| Đường cứu ≤1s, ≥2 mẫu cùng cam | `gsc:259-309` (`max_gap=1.0`, `raw_path[-12:]`) | ✓ |
| Gate poll ~4Hz | `gsc:865` `--poll-interval 0.25` | ✓ (sleep `max(poll,1)` chỉ error-path gsc:904) |

## Hashes các file đã review (bản probe — post-fix hiện tại)
| file | md5 (12) | mtime |
|---|---|---|
| content/gate.js | 29093ece68f2 | 02:31:25 |
| pages/gate.js | f8b007b805b2 | 02:36:56 |
| content/session.js | f4629eaadb53 | 02:36:56 |
| pages/session.js | 2ca863bd1db7 | 02:45:01 |
| content/snapshot.js | 93429b89e8ea | 02:39:47 |
| pages/snapshot.js | 5ce846cc71c2 | 02:43:53 |
| content/reid.js | 6efc3b590da7 | 02:08:55 |
| pages/reid.js | cd2ccd90c475 | 01:58:32 |
| content/handoff.js | 04e5f342985e | 02:09:02 |
| pages/handoff.js | 74480cfd70bd | 01:58:31 |
| content/homography.js | d425c6c61b29 | 01:59:21 |
| pages/homography.js | f35add387121 | 01:59:01 |
| content/trajectory.js | 420412ea1ca7 | 02:23:27 |
| pages/trajectory.js | 7824e0f1d142 | 02:24:57 |
| content/dormant.js | 06fc749198c8 | 02:23:59 |
| pages/dormant.js | ed1d2f58f364 | 02:24:58 |
| content/gid-conflict.js | df6d768cdc94 | 02:29:20 |
| pages/gid-conflict.js | 6e450280faf5 | 02:28:26 |
| content/ensemble.js | 52680d150b50 | 02:05:48 |
| pages/ensemble.js | cd59e81e46a7 | 02:05:48 |
| content/binder.js | 8b63f1198ce2 | 02:17:24 |
| pages/binder.js | 3b3f5c57c38e | 02:17:37 |
| content/polygon.js | 006907b19e44 | 02:28:14 |
| pages/polygon.js | 996154e2b434 | 02:30:17 |

## Pending (không duyệt ảnh cũ, không kết thúc)
- **R5 shared (C):** Map / Journey / Glossary — đọc chéo khi C ra hiệu ready. `journey.js` đang được chỉnh (VI-hóa node/HUD/caption đang sống) → ghi **pending**, không đọc ảnh cũ.
- **Recheck session:** nếu B freeze tiếp sau bản `f4629eaadb53/2ca863bd1db7` thì đọc lại trên hash mới.
- **Kết luận wave-2:** 3/3 route đọc được người mới; async-branch semantics đúng; B tự-khai quirk claim — rigor tốt; 0 blocker.
