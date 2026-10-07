# TechGar2 — Bản đồ pipeline tương tác (V2)

Trạng thái: LEAD đã duyệt Phase 1–3 V2 sau review dossier, review chéo, kiểm tra ảnh và chạy lại verifier của builder. Bản này thay thế hướng catalog trước đây. LEAD chỉ tổng hợp output của builder và yêu cầu giao diện; mọi phân tích source và code web do builder thực hiện.
Nguồn: .analysis/algos-v2/builder-a.md, builder-b.md, builder-c.md và cross-review.md. Các phát biểu runtime lấy từ những dossier này; builder phải kiểm chứng source khi triển khai.

## 1. Kết quả người học cần hiểu

Người xem theo được một chiếc xe: camera nhìn thấy gì, pixel được biến thành blob và track ra sao, identity nối giữa hai camera thế nào, xe dừng được gắn với ô thế nào, kết quả được API chuyển sang session và điều hướng ra sao.
Màn đầu là BẢN ĐỒ PIPELINE TƯƠNG TÁC, có node, cạnh có hướng, nhánh song song và feedback. Click node mở animation chi tiết. Không dùng catalog 117 bài, bảng input/output hay complexity làm trọng tâm.
Mỗi node trả lời ngắn bằng tiếng Việt: LÀM GÌ; VAI TRÒ (trước/sau, mất nó thì sao); NẰM Ở ĐÂU (module/class + file:dòng); TẠI SAO (dẫn chứng hoặc đánh dấu suy luận).

## 2. Bản đồ runtime đã được builder kiểm chứng

Theo C §1, cross-review §1; local tracking theo A §1; identity/binder theo B §1:
- Capture hai camera + sync -> binder.begin_frame -> áp parking evidence đã xong -> sync parked reservations trước tracking.
- Mỗi camera: Kalman predict -> occlusion guard -> detect -> assignment -> matched correct/update; unmatched coast/freeze/expire; detection lẻ sinh local track.
- Bên trong detect: MOG2 foreground -> temporal motion gate -> ROI context + strict/per-blob checks -> morphology/contour/blob hợp lệ. ROI cấu hình có trước nhưng phép mask runtime nằm sau motion gate. Không vẽ ROI trước motion như call order.
- Notify lost/expired, cập nhật occlusion/trajectories -> chuẩn bị token rời ô + recovery -> manager.update_all_tracks (handoff/ReID/Global ID) -> canonical remap -> binder.update_tracks/finalize_arrivals -> sync reservations sau -> snapshot publish.
- Nhánh parking vision riêng nhận frame gốc: live chạy worker khoảng 2 Hz, trả evidence áp ở loop sau; replay mặc định inline. Evidence cần hợp lệ/đơn điệu; không vẽ occupancy như chỉ là output của motion.
- Snapshot latest-only khoảng 5 Hz -> API runtime. Gate controller poll 0.25 s; frontend poll runtime 200 ms và session 500 ms: consumer độc lập, không nằm trong vòng xử lý frame.
- Entry crossing tạo session/QR trước khi xe đỗ. PARKED đến từ parking episode. Gate và frontend đều đọc snapshot; frontend còn gọi session API.
- Feedback nét đứt: binder reservations/recovery -> tracker/manager ở vòng tiếp theo. Phân biệt cạnh thứ tự gọi, cạnh dữ liệu, cạnh async và feedback bằng chú giải đơn giản.

Hai góc nhìn dùng chung node:
1. **Thứ tự chạy**: đúng nhánh/call order ở trên, nhóm tracking, parking worker, consumer async.
2. **Hành trình một xe**: cam1 -> GID -> cổng vào/QR -> chọn ô/A* -> qua cam2 giữ GID -> dừng -> episode parked -> session PARKED -> rời ô/cổng ra. Đây là timeline nghiệp vụ, không thay cho call order runtime.

## 3. Danh sách node chính thức và quyền sở hữu

| ID | Nhãn tiếng Việt | Owner | Minh họa tối thiểu |
|---|---|---|---|
| capture | Camera & đồng bộ frame | C | Hai camera, timestamp/skew, mailbox mới nhất |
| kalman | Kalman: dự đoán và sửa vị trí | A | Đo nhiễu, điểm dự đoán, điểm sau correction, quỹ đạo |
| motion | Pixel chuyển động -> blob xe | A | Frame, foreground/diff, threshold, morphology, contour |
| roi | ROI: vùng được quan sát | A | Xe/nhiễu ngoài polygon bị bỏ, xe sát mép/context band |
| assignment | Ghép detection vào track | A | Track/detection, ma trận cost, cặp 1-1, cặp bị gate |
| coasting | Khi xe tạm mất dấu | A | Che khuất, đường dự đoán nét đứt, age/decay/stale/reacquire |
| handoff | Nối identity giữa hai camera | B | Cam1/cam2, corridor, local ID khác nhưng cùng GID; ReID nhánh cứu |
| slot-vision | Nhìn ô trống hay có xe | B | ROI ô, pixel evidence, phiếu trống, rescue/smoothing |
| binder | Gắn đúng xe với đúng ô | B | Track + evidence hội tụ, dwell/claim -> owner/episode, departure token |
| snapshot | Snapshot & API | C | Xe/ô/episode -> mailbox -> hai consumer, evidence cũ bị bỏ |
| gate-session | Cổng vào/ra, session & QR | C | Đoạn xe cắt vạch, QR hiện 120 s, claim/select/PARKED/exit |
| navigation | Frontend & A* dẫn đường | C | Mạng làn, mở rộng A*, đường đến ô, xe đi theo đường |

Bảy thuật toán chính ROI/motion/Kalman/assignment/coasting/handoff/binder phải nổi bật. Slot-vision giải thích occupancy khi xe đứng yên. A*/QR là phần phụ, không lấn át CV.
Calibration/world projection được minh họa bên trong handoff (hai góc nhìn -> bản đồ chung), không mở rộng thành catalog phụ.

## 4. Giao diện và tương tác bắt buộc

- Mở index.html thấy bản đồ đẹp, rõ hướng mũi tên và nhóm xử lý; vùng hình chiếm phần lớn màn hình.
- Global timeline có Play/Pause, bước trước/sau, Reset, tốc độ 0.5x/1x/2x/4x, scrubber và tên bước hiện tại. Một chiếc xe và GID được giữ liên tục qua các scene; node đang tham gia sáng, cạnh có packet/pulse.
- Click/tap node mở chi tiết qua hash, có nút trở lại bản đồ và trước/sau trong pipeline; browser back/forward hoạt động.
- Mỗi chi tiết có canvas animation thực sự theo thời gian, điều khiển riêng, step-through xác định/repeatable. Không chỉ thay bảng chữ giữa các frame.
- Tối thiểu hai scenario cho mỗi node: bình thường + tình huống khó/nhánh thay thế phù hợp dossier. Các thuật toán chính có hình đặc trưng khác nhau: mask pixel, quỹ đạo, ma trận, hai camera, slot.
- Trạng thái đang thay đổi hiển thị cạnh hình: track/GID, age, cost matrix/matching, dwell/vote, episode/session. Chỉ hiển thị trạng thái cần hiểu bước đó.
- Mỗi bước có một câu giải thích tiếng Việt; 4 câu hỏi có câu trả lời ngắn, dễ đọc, dưới hình hoặc panel. Pseudocode 5-10 bước đơn giản có highlight theo bước, mặc định gọn/có thể thu.
- Dẫn chứng file:dòng luôn tìm được. Bấm mở panel chứng cứ line-numbered local (bundled đoạn source do builder trích và xác minh); có link file gốc tương đối từ project root. Không phụ thuộc fetch để xem chứng cứ ở file://.
- Ghi chú nhỏ: mô phỏng giáo dục/dữ liệu minh họa; ngưỡng production chỉ khi verified. Không gọi site giáo dục là pipeline production đang live.
- Responsive desktop + mobile 390px; canvas rõ nhãn, không cắt label, không tràn ngang cả trang, có keyboard focus/nút accessible. Chú giải màu đi kèm chữ/ký hiệu.

## 5. Hợp đồng nội bộ cho 3 builder (không phải spec input/output thuật toán)

Vanilla classic script local, không build tool/CDN/fetch. index nạp shared/pipeline-engine.js, packs/pipeline-local.js, packs/pipeline-identity.js, packs/pipeline-system.js rồi pipeline-app.js. Các file cũ không cần xóa; không còn được nạp làm màn catalog chính.
C tạo shell/engine, A và B chỉ tạo pack của mình; không đè file nhau.

Registry thống nhất: window.TechGarPipelinePacks là object; mỗi pack gán key local / identity / system = mảng node.
Node gồm:
- id, title, group, summary (câu đời thường).
- answers: does, role, where, why (string ngắn tiếng Việt).
- refs: mảng {path: đường dẫn tương đối project, line: số nguyên 1-based, symbol: tên, excerpt: đoạn source ngắn đã đối chiếu, excerptStart: dòng đầu}. Không bịa dòng/source.
- scenarios: mảng {id,label,build: hàm trả frames[]}; tối thiểu hai.
- pseudocode: mảng câu ngắn.
- draw(ctx, frame, view): render canvas 2D; view = {width,height,progress,time,previous}; progress 0..1 là nội suy trong bước, time là millisecond kể từ đầu bước (pulse theo giây cần time/1000), previous frame hoặc null. Mỗi scenario có tối thiểu 3 bước có ý nghĩa. ctx được engine reset/scale trước.
Frame có title, explanation, activeLines (chỉ số 0-based pseudocode), state (trạng thái cần nhìn), durationMs, scene (data nội bộ owner tự đặt). build phải deterministic, không mutate lịch sử frame.
Không dùng schema I/O trong phần dạy học. Contract này chỉ để tích hợp không xung đột.

C triển khai engine validate API, controls, responsive sizing, animation elapsed time + speed, pause/step/reset/hash/cleanup khi đổi node. C có quyền điều chỉnh adapter engine để pack tương thích nhưng cần báo A/B; không tự sửa logic pack owner.
C tạo global map/timeline/scenario ở shell theo dossier cross-reviewed và dùng node registry để click/link/state. Chưa load pack thì UI không báo hoàn tất; QA sau khi đủ 12 node.
A/B viết own verification theo storyboard/invariant có ý nghĩa và ghi kết quả report, không cần hàng ngàn assertion catalog cũ. C viết browser QA, có thể dùng Playwright đã có ở frontend/node_modules; không thêm dependency/install vào algo-web.

## 6. Các điểm đúng source phải giữ khi minh họa

- Kalman predict TRƯỚC detect; correct chỉ sau assignment matched. min_visible_count/displacement cần đủ trước confirmed; không confirm sau 2 ảnh khi runtime chưa đủ.
- Assignment source là lap.lapjv (Jonker-Volgenant), dùng giải bài toán ghép tối ưu 1-1; có thể ghi “bài toán Hungarian/LAP”, không khẳng định production cài literal Hungarian.
- MOG2 127 không phải xe chắc chắn; temporal gate/ROI/blob checks mới tạo detection. ROI tracking khác ROI ô đỗ.
- Coasting có decay/stale/TTL; không đoán mãi, không tạo detection thật khi chỉ prediction.
- ReID thực tế là gallery histogram HSV/LAB/L, không deep embedding; GID mới chỉ cấp confirmed sau các đường match. Distance shared-map không phải px; số tuyệt đối phải ghi minh họa.
- Occupancy đếm phiếu TRỐNG: required_votes=25//2=12, empty_votes>=12 mới is_free (trước rescue/edge/smoothing). Không có counter occupied_votes. Motion-only mất xe đứng yên; binder giữ owner/episode.
- Vision-primary binder production: có arrival claim và strong-overlap, không lấy đường legacy làm runtime chính. Parking evidence/pending claim không đồng nghĩa session PARKED; episode mới có thẩm quyền.
- QR 120s là thời gian hiển thị/waiting; source claim không kiểm expiry, không tự xóa session vì TTL. Đóng session bằng exit crossing; mất camera không tự đóng.
- Off-route engine default75px, App caller80px: nếu show thực tế App ghi80 và dẫn chứng.
- Replay offline trong site là mô phỏng; gate/frontend production đòi snapshot schema2/source_mode live. Đừng gọi consumer production chấp nhận replay mặc định.
- Các suy luận “vì sao chọn” không có comment source phải đánh dấu suy luận, không viết như lịch sử quyết định thiết kế.

## 7. Phân công triển khai và review

A: packs/pipeline-local.js (5 node), README-local-v2.md + report .analysis/algos-v2/build-a.md và verifier owner.
B: packs/pipeline-identity.js (3 node), README-identity-v2.md + report .analysis/algos-v2/build-b.md và verifier owner.
C: index.html, CSS/shell, shared/pipeline-engine.js, pipeline-app.js, packs/pipeline-system.js (4 node), README.md, QA-V2.md, qa-v2/ và browser verifier. Không sửa SPEC.
Root chỉ review outputs/screenshots và giao sửa; không đọc/sửa source web. Khi code đủ: A review B fidelity/animation, B review A, C kiểm end-to-end. Mọi thay đổi sau QA phải kiểm lại phần bị ảnh hưởng.

## 8. Điều kiện nghiệm thu

- Direct file:// và HTTP đều mở được; đúng 12 node/chủ đề, toàn bộ node/scenario render; zero uncaught/console errors/missing runtime assets.
- Global runtime map có nhánh parking riêng, async consumers, feedback; hành trình bắt đầu trước parked, QR/select trước parked; scene/step/highlight đồng bộ.
- Từng node có controls hoạt động, hình thay đổi theo bước/play, trạng thái/pseudocode cập nhật, 4 câu giải thích, refs có thật.
- Browser QA kiểm hết scenario và từng bước; Play/Pause, speed, prev/next/reset/scrub, hash/back, source drawer, mobile. Báo số case thật, console/request failures, file+HTTP; screenshots map và tất cả kiểu visual chính.
- Peer review báo còn lỗi/fix, không tự approve action bị block. Production code/config không thay đổi.
- README cách mở index.html và python -m http.server 8080 --directory D:\TechGar2 -> http://localhost:8080/algo-web/index.html. Không còn tuyên bố QA catalog cũ là QA của V2.

## 9. Nghiệm thu V2 — 2026-10-04

LEAD chạy lại browser verifier của C tại algo-web: node qa-v2/verify.js (kết quả generatedAt 2026-10-04T10:39:04.559Z). File và HTTP đều load 12/12 node; 24 scenario được kiểm tra; tổng 246 lượt kiểm tra frame, không blank/sync failure, 58/58 trích đoạn source khớp, console/page/request errors 0/0/0. Play/Pause, step, reset, scrub, speed, đổi scenario, hash/back, transport chỉ đúng view và mobile 390px đều đạt theo QA-V2 và verify-results.json.

LEAD đã chạy lại verifier owner A 586/586, owner B 513/513 và checker độc lập B→C 453/453. Đã review ảnh bản đồ/runtime/journey/mobile và các kiểu animation chính; các finding về nhãn, dữ liệu scene, source và controls đã sửa. Ba pack giữ hash: local 6dee1455c790151b; identity 8117e9984048deb5; system c3fd2348aeca4674. Hash 7 file runtime khớp packMeta trong kết quả QA.

Đối chiếu: .analysis/algos-v2/build-a.md, build-b.md, build-c.md, peer-a-by-b.md, peer-b-by-a.md + fix-summary-b.md, peer-shell-by-a.md, peer-system-by-b.md; algo-web/QA-V2.md và qa-v2/verify-results.json.

Phạm vi xác nhận: mô phỏng giáo dục trên Chromium, source-fidelity do builder review và verifier; không phải kiểm thử stack camera production. Canvas QA kiểm nonblank/signature/sync/controls và LEAD review ảnh đại diện, không phải pixel oracle ngữ nghĩa cho mọi frame. Cách mở và lệnh HTTP theo README.md. Không còn blocker ảnh hưởng bàn giao.

