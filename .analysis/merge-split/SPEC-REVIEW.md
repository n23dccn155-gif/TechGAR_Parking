# SPEC-REVIEW — Merge/Split Identity Recovery, P0

Ngày: 2026-10-05. **P0 hoàn tất; DỪNG trước P1.** Không triển khai recovery mới, không commit/push. Readability tạm dừng, giữ kết quả.

LEAD tổng hợp và review output của builder, không tự đọc source hoặc viết code. `SPEC-original.md` và quyết định §1.3 MEGAPLAN vẫn là đề xuất. Mọi hành vi mới phải nằm sau `enable_multi_hypothesis_recovery`, mặc định **TẮT**; cờ này chưa được thêm trong P0.

## 1. Bằng chứng và phạm vi

- [A: code-map](P0-a-code-map.md), đặc biệt §3–4, §7–8: kiểm chứng source, invariants và đọc chéo C.
- [B: dataset/baseline](P0-b-baseline.md), đặc biệt §1–2, §5: chạy công cụ mới `backend/main_detect/experiment_test/merge_split_report.py`; output `msr-out.txt`, `msr-raw.json`; đối chiếu `diagnose_identity_churn.py`.
- [C: S1–S9](P0-c-scenarios.md): file mới `backend/main_detect/tests/test_merge_split_scenarios.py`; baseline/full/scenario logs tại `P0-c-*-pytest.log`.
- `verified` phân biệt **source**, **test tổng hợp** và **đo log**. `inferred` là suy luận có giới hạn; `not verified` là chưa có bằng chứng thực nghiệm. Các số proxy không được xem là ground truth.

Ký hiệu nguồn, theo báo cáo A:

| Ký hiệu | File |
|---|---|
| og | `backend/main_detect/src/techgar/occlusion_guard.py` |
| mt | `backend/main_detect/src/techgar/motion_tracker.py` |
| ccm | `backend/main_detect/src/techgar/cross_camera_manager.py` |
| tc | `backend/main_detect/two_camera.py` |
| stability | `backend/main_detect/tests/test_stability_occlusion.py` |

## 2. Xác nhận §1.1 MEGAPLAN

| Claim | Kết luận P0 | Bằng chứng do builder cung cấp |
|---|---|---|
| Recovery atomic 2→2, streak 3 frame | **verified — source/test**; partial commit sẽ thay hành vi có chủ đích khi cờ bật | og:200–231; stability:121; C S1–S3 |
| Defer cả group giữ prediction, tăng tuổi prediction | **verified — source**; chưa đo tác động ID trên video có GT | og:135–138; mt:2257–2308 |
| Group hết hạn theo last-clean + timeout | **verified — source/test**; xóa group không đồng nghĩa mọi tầng recovery đã biến mất | og:119–130,59–65; mt:69,229; stability:133; A §8/C S6 |
| Watershed validated không tin appearance | **verified — source/test**, đã có; không cần phát minh lại | og:217–219; stability:172 |
| Birth veto đã có | **verified — source**, không được bỏ qua khi thiết kế partial/non-member | mt:364–389; C S3/S9 |
| Morphology có thể nối blob | Kernel/lần xử lý **verified — source**; nguyên nhân của merge trong từng video **not verified**, cần P4 | mt:559–573,817–826; P0 không chạy ablation |

## 3. Xác nhận/chỉnh từng mục §1.2

| Mục | Trạng thái và điều chỉnh cần giữ trong spec |
|---|---|
| 1 — Hai tầng defer | **verified**: group og:191–232 và per-track mt:1914–1989. Competition mt:1331–1458 cùng unmatched/birth filters mt:2322–2340 là các cơ chế bổ sung; không chỉ sửa group gate. `split_assignment_margin` chưa được CLI wire riêng; association margin có wiring tc:1871–1875,2394 (A §4). |
| 2 — Pair metrics còn thiếu evidence | **verified**: bốn thành phần cost và các metadata, mt:1769–1781; chỉ viable pairs có metrics. Non-viable cost matrix dùng sentinel 10.0, mt:1615. Không coi thiếu metric là cost=0; velocity/ordering/history không tự nhiên trở thành thành phần pair cost. |
| 3 — Member mất dấu khác non-member | Cần phân biệt trong thiết kế. **verified ở unit gate** qua S5; kết luận noise thực tế cướp ID toàn pipeline **not verified**. H6/H7 vẫn là đề xuất chưa benchmark. |
| 4 — Group ≥3 | **verified**: og:153–154 không partition; og:200 không full recover. Giữ đường cũ cho ≥3 trong phạm vi này. Watch groups tồn tại sau supergroup expiry được C S8/A §8 xác nhận; chưa chứng minh là memory leak hay lý do tự mở scope cleanup. |
| 5 — Ngưỡng chưa hiệu chỉnh | **verified về ngưỡng hiện có**: assignment limit 0.90, mt:72,158,1908; tổng group <1.2, og:206. Ngưỡng partial/penalties/window mới **not verified**. Không lấy số minh họa trong spec làm mặc định hay kết quả tuning. |
| 6 — Pre-merge evidence | **verified**: references chỉ kích thước, og:36–42,90. `center()` đã dùng measurement history để dự đoán live, og:44–53; phần thiếu là snapshot trước merge, không phải toàn bộ dữ liệu vận tốc. Cách dùng ordering là đề xuất; không biến thành ràng buộc cứng. |
| 7 — Consumer trạng thái mới | **verified nhưng §1.2.7 thiếu phạm vi rà soát**: hai tập state ccm:2257–2262,2275–2279; kind/freshness ccm:2250–2251; consumer tc:726,2696. Naming state và observation kind phải tách rõ. Chưa cho phép sửa thêm các consumer: ngoại lệ sửa CCM của MEGAPLAN vẫn chỉ là tập trạng thái, sau LEAD duyệt. |
| 8 — Timeout riêng | Clocks hiện có **verified**: 3.0s group, 90-frame TTL và TTL giây mặc định 4.5s, mt:37,98,149–153,2189–2201; sync tc:2719–2725 → ccm:1189–1190,1221–1226. Window mới sau split vẫn là đề xuất; giữ invariant ambiguous pixels không gia hạn, stability:133. Group expiry không xóa per-track defer/birth veto. |
| 9 — Dataset nhỏ/learned model | **Chỉnh cách đếm**: không dùng số dòng trong §1.2.9 để suy số merge thật. B đo 203 episode proxy sau dedup tên nguồn, trong đó 65 có opened/≥3; không tương đương 65 sự kiện vật lý độc lập. Có **0 nhãn GT sử dụng được** → chưa đủ P5, không khuyến nghị learned model. |
| 10 — Có GT để replay | **refuted đối với dataset đã kiểm**: CSV tồn tại nhưng chỉ header. 19 session có RAW/log để chuẩn bị replay; benchmark ID-switch/false-new-ID/lost/fragmentation theo GT hiện **BLOCKED**. Replay đầy đủ chưa chạy ở P0. |

## 4. Baseline đã review: chỉ số nào dùng được

B chạy công cụ trên 28 thư mục log; dedup theo `canonical_source` còn 20 nhóm nguồn và **203 episode proxy**. Đây là quy tắc ghép member-set/time trong tool, không phải xác minh độc lập từng merge vật lý.

| Loại episode | Tổng | Expired | Recovered | Không terminal ghi nhận |
|---|---:|---:|---:|---:|
| implicit-2, không opened | 138 | 137 | 1 | 0 |
| active-2, có opened | 58 | 10 | 1 | 47 |
| ≥3-member covering | 7 | 6 | 1* | 0 |

`*` Recovered thuộc subset hai member xen kẽ trong episode ≥3, không chứng minh guard recover group ≥3.

- `expired` còn được phát khi member mất khỏi watch group chưa từng merge (og:59–65,90; A §7). **Bác cách đọc tỷ lệ thô 73.8% expired là tỷ lệ thất bại identity.**
- Không opened không xác nhận chắc là watch-only: lịch sử có thể thiếu. Không terminal là **censored/unknown**, không chứng minh 47 group còn active hoặc xe bị che tới cuối session.
- `new_ids_45f_after`: B đo 43/58 active-2 và 7/7 ≥3 có ID mới first-seen trong 45 frame sau **frame cuối episode**, cùng camera. Không phải thống kê chỉ sau expiry, không match bbox/xe, không chứng minh ID bị mất hoặc quan hệ nhân quả.
- Churn đối chiếu thai6: 21 GID/709 local fragments là số của công cụ chẩn đoán, không được đổi tên thành ID switches theo GT.
- Duration suy từ `processing_fps` chỉ là ước lượng, không xác minh thời gian video/merged thật. GT metrics trong tool chưa được kiểm chứng trên nhãn có dữ liệu.
- Các câu còn gọi 65 là merge thật hoặc 47 unresolved tới cuối log trong §3 bản B không được dùng làm bằng chứng; kết luận review tuân định nghĩa proxy/censored đã sửa ở §2 và §5 B.

**Kết luận dữ liệu:** có tín hiệu đáng khảo sát và case để làm regression, chưa đủ chứng minh chẩn đoán trên xe thật hoặc cải thiện identity. Benchmark §6 phải có GT trước khi kết luận/bật mặc định.

## 5. Test và các phát hiện mới đã đọc chéo

Baseline loại file mới: **448 PASS**. Full suite: **457 PASS + 8 XFAIL, 0 FAIL/XPASS**. File mới: **9 PASS + 8 XFAIL**, bao phủ S1–S9. Các xfail dùng assertion hành vi, không fail vì gọi API/cờ chưa tồn tại. C giữ test cũ; log được lưu và LEAD đã review phần kết quả.

- **S2 verified:** streak group chưa gắn một hypothesis nhất quán; direct/swapped luân phiên vẫn có thể đủ ba frame valid (og:204–212; A §8). Đây là thiếu sót bổ sung so với §1.
- **S4 verified trong integration tổng hợp:** `process_frame` với mask monkeypatch tái hiện late member → ID mới. Không phải replay video thật hay GT benchmark.
- **S5:** nháp .95 không qua LAP limit .90; C đã đổi .75 và rerun. Kết quả **unit verified**, khả năng đi qua LAP **inferred**, chưa có chứng minh end-to-end cho noise identity theft.
- **S6:** sau group expiry, unit gate không defer nữa; per-track margin/recovery và birth veto vẫn tồn tại (mt:1685–1686,1939–1985,364–389). Claim assign tự do toàn pipeline đã được bác và C sửa.
- **S8:** ≥3 giữ baseline; inactive watch groups dùng expiry vô hạn nhưng còn đường xóa khi member mất/proximity thay đổi (og:22,60,94–100). Không tự dọn ở P0.
- **8 XFAIL là ứng viên thiết kế, không phải tám yêu cầu đã duyệt.** S1 full commit sớm hơn ba frame và cách dùng ordering phải được chốt ở DESIGN; S9 telemetry thuộc giai đoạn shadow. Khi cờ tắt, giữ baseline/invariants; mọi thay test có chủ đích phải nêu lý do.

Mâu thuẫn code-level S5/S6 và cách diễn giải số liệu đã được xử lý bằng đọc chéo A/C và sửa phạm vi của B. Những việc chưa đo vẫn được ghi chưa xác minh, không tự chuyển thành kết luận đúng.

## 6. Quyết định cần người dùng trước các bước tiếp theo

1. **GT:** chọn nguồn/gán nhãn cho benchmark §6; hiện chưa có dữ liệu để quyết định bật mặc định. Event/frame ưu tiên có trong B §4, ví dụ thai6 641–681 và hiep_thai3 171/1119.
2. **Scope consumer:** DESIGN cần rà soát hai state sets, freshness/kind và consumer tc; sửa ngoài ngoại lệ tập state CCM phải báo duyệt riêng, không tự mở rộng kiến trúc Global ID.
3. **Policy recovery:** chốt full-commit streak (giữ mặc định 3 hay cho early commit), consistency của hypothesis, partial/non-member và ordering evidence. P0 chưa hiệu chỉnh ngưỡng hoặc chọn policy mới.
4. **Shadow và baseline:** chốt cách opt-in telemetry/shadow khi recovery OFF, để default OFF không tự thay quyết định, state, gallery hoặc ngầm thêm hành vi; schema/overhead và log baseline phải được định nghĩa trong DESIGN.

**Cổng hiện tại:** P0 được bàn giao cùng các giới hạn trên; chưa viết DESIGN/chưa dispatch P1. A/B/C hoàn tất P0 và HOLD. LEAD quản lý trực tiếp mọi dispatch tiếp theo khi được cho phép; không trả việc điều phối cho người dùng.
