# STATUS — Verify replay bằng config hiện tại

Ngày: 2026-10-05. V0/V3/V4 đã giao song song; chưa chạy V6.

- P0 merge/split đã hoàn tất, HOLD trước P1; không còn tranh CPU với replay. Đóng băng src/two_camera/runtime/config/tests hiện có trong chiến dịch.
- A: công cụ V3, rồi V2–V5 trên6session§2. B: V0→V1 độc quyền replay, rồi V2–V5 trên4session§2. C: công cụ V4 và V2, rồi V3–V5 trên8session§2.
- B chốt môi trường/lệnh runtime/pilot trước batch; tối đa3process, OpenCVthreads1, sessionngắn trước. Không tự fallback nếu chưa chứng minh equivalent.
- Hash đầy đủ6config§0.3 (văn bản nói5 nhưng liệt kê6). Xác minh nhãn GTidentity/events riêng, không giả định đầy đủ GT từ sự tồn tại CSV.
- Chỉ tạo file mới ở .analysis/verify-replay, experiment_test/verify và outputverify_cur_; không sửa code/config/tests hoặc ghi đè dữ liệu cũ.
- Kiểm tự động trên mọi frame, báo riêng frame thiếu/không có prediction. Kiểm ảnh ở cửa sổ bị cờ và mẫu đều ≥1frame/2giây/cam; không tuyên bố mắt xem từng frame. Cờ tự động chưa phải lỗi xác nhận.
- LEAD chỉ quản lý, review báo cáo ngắn; không replay, không xem ảnh/frame, không đọc predictions.jsonl hoặc phân tích source. Không tự sửa hay đề xuất patch.
- Sau V5 đủ evidence/coverage, LEAD viết ERRORS-SUMMARY.md + QUESTIONS-FOR-USER.md, cập nhật STATUS.md, dừng và báo V6.

## Tiến độ: runtime pilot và handoff

Pilot runtime test1 đạt298/298,exit0,schema3. LEAD cho V1 runtime batch, không fallback theo source tĩnh. Registry v1-replay-results.json ghi3session official hoàn tất/test1,toi4,hiep2. A kiểm test1 và sửa format/phạmvi findings; C hỗ trợ windows/index contract. Hai pilot trước không thuộc cohort18; pilot two_camera bịgiánđoạn236/298 giữ nguyên và ghi riêng. Fingerprint LEAD:145code/config/testfiles +3entrypoints để kiểmfreeze cuối; không đọc nội dung source.

## Cập nhật 22:32 — 2026-10-05
Registry có 9/18 session official PASS đủ prediction rows theo báo cáo V1. B đã xác minh cohort 41.625 cặp frame: gồm runtime_session_bt, loại session_hiep_thai2 hỏng; per-cam metadata được ghi riêng. Replay tiếp tục nền, tối đa 3 process. A làm các session đã hoàn tất; C đang xem ảnh toi5/sang7; B được giao kiểm toi6 song song batch. V4/V5 chưa hoàn tất, findings test1 còn phải bổ sung dẫn chứng và kiểm chéo; chưa duyệt V6. Độ phủ mắt phải báo bằng frame thực sự đã xem, không bằng số sheet tạo ra.
## Cập nhật 22:59 — 2026-10-05
13/18 session replay official hoàn tất theo registry, gồm runtime_session_bt và thai8/thai7. V3/V4 đang làm nối tiếp từng session. Hash giữa chiến dịch:148/148 file code/config/test/entrypoint không đổi. A đã compact context và tiếp tục; C được yêu cầu sửa coverage render-vs-eyeball, hiện4session đầu báo992unique cam-frame thực xem; B2session ngắn báo316+250unique cam-frame. Các số đang chờ review/crosscheck cuối. V4 event-dense/field§5 còn đang bổ sung, chưa duyệt V5/V6. Chỉ báo cáo lỗi/ nghi vấn, không sửa code/config hoặc đề xuất patch.
## Cập nhật 23:31 — 2026-10-05
14/18 official PASS,17.909/41.625 cặp frame hoàn tất. B xác minh3job đang tiến triển; ETA23:12 còn2–2,2giờ, khôngstuck. Thai5 đã giao C. LEAD trả lại báo cáo coverage thiếu eventdense: A hỗ trợ runtime_bt,B hỗ trợthai7,C hoànthiệnthai8 rồithai5; reporthelp mới đểCunionunique,mọi FULL phải đủmẫu dựkiến. Hai pilot test1 đã đủ298 cuối;236 trước chỉsnapshot, KHÔNG replayfailureconfirmed; pilotexitcodes chưa lưu. V5partial A→B vàB→C đãnộp, cònC→A vàresample cuối đủsession. Đóngbăng148files checkgiữa khôngđổi; chưa duyệtV6.
## Cập nhật 23:56 — 2026-10-05
16/18 official PASS,29.610/41.625 cặp frame. Thai4 đangQA B; thai6 mớiPASS giao A V3/V4. Thai3+thai1 vẫnV1 nền. Bhelpthai7 đãxem120/120sheet1078cells; Ahelpruntime_bt472cells; Cmergeunionvàhoànthiện8sessioncủamình. CrossreviewC auditbácA002ghost,trạcktrênxe; A001fixtureportionconfirm,A003duplicateconfirm,A030031mixedUNSURE. OwnerA đãđínhchính MDJSON. PhầnV5mẫungẫu nhiên phầnlớnUNSURE nênkhôngước tínhFPdefect từcácmẫu này; finalresamplechờfullpool.
## Cập nhật 00:34 — 2026-10-06
17/18 session official PASS; chỉ thai1 còn replay. C đã QA8session, báo7182 unique cam-frame và294/294 cửa sổ sự kiện đủ mẫu gap<=5; các cửa sổ lấy từ event runtime, không có GT đầy đủ. LEAD còn yêu cầu chuẩn trạng thái/độ tin cậy/instances mỗi session và V3-C đủ8. B xem đủ thai4 237/237 sheets=2132 unique cam-frame; đang QA thai3, rồi V5 final C. A thai6 checkpoint: uniform10/10, events58/83,1612 unique cam-frame; còn25event sheets. V5 cần resample fullpool cuối; các audit thêm tách khỏi FP ngẫu nhiên. Source/config frozen, P0 merge/split HOLD trước P1. Chưa duyệt V6.
## Cập nhật 00:40 — 2026-10-06
V1 đủ18/18 official completed_replay, exit0, record_consistent=true, pred_lines=raw; tổng41.625 cặp frame (83.250 frame hai cam theo metadata). Không failure official. B lập canonical V1 và re-hash6config. A chốtthai6 rồi V2V3/uniform+findings thai1; C hỗtrợ eventdense thai1 trong reporthelp riêng đểAunioncoverage. C8 QA7182cells/294windows đủ; còn chuẩn §5, B V5 finalC. B QAthai3 vàA V5 finalB cònpending. LEAD chờ fullreports+crossreview cuối trướcV6, không đọc source/predictions/images.

## Cập nhật ~01:10 — 2026-10-06 (Devin=A tạm điều phối, INBOX-A.md)
A nộp `V4-help-A-thai1-part.md`: thai1 event-dense sheets0036–0096 đủ61/61=549 unique(cam,f) (cam1 f1096–2860, cam2 f1091–2860), §5 NO_ERROR; obs-1 box tentative trên debris nền gỗ s55 (lid24/lid22 gidNULL, transient). Thai1 union chờ C sheets0001–0035+0097–0157. A đang chốt18 findings UNSURE/MIXED theo data-only evidence trước. V5 finalB chờ B freeze4. Frozen: source/config/tests/replay outputs.

## Cập nhật — DEVIN(manager) tiếp-quản sau LEAD hết quota; poll INBOX-B.md
- **B freeze 4/4 sessions**: toi6, hiep1, thai4 (237/237 sheets, 2132 cells),
  thai3 (**212/212 sheets eyeballed = 1904 unique (cam,frame) cells = 952×2cam,
  0 skip**; uniform 2s + 14 merged windows dense-5). Report `V4-thai3-B.md`.
- Findings thai3: **E-B-008/E-B-009 DUPLICATE_TRACK CONFIRMED** (41 cặp
  IoU>.4, toàn same-gid; cụm cam1+cam2 f2296-2336 = cùng xe đen chéo);
  **0 slot↔gid conflict đồng-thời toàn session**. O-B-022 coasting-bursts
  cam1 f2707-2742(22)/f4878-4907(18) · O-B-023 ghost-band mép-trái cam2 ·
  O-B-024 `E:` episode-labels render-only · O-B-025 slot PASS.
- **E-B-007 hạ UNSURE-type** theo audit A (anchor lid19/23 khác → chỉ
  pattern new-ID confirmed). IDs: errors E-B-001..009, obs O-B-001..025,
  ERRORS-B.json/.md UTF-8 đồng-bộ (O-B-006..016 thai7 đã bổ-sung JSON).
- V5 final C CHỐT: 0/2 resolved → FP không ước-tính (E-C-003 UNSURE,
  E-C-005 NOT-CONFIRMED 1/3 disproven + 2/3 UNSURE). Audit C005/006/007 xong.
- V1 canonical 18/18 PASS đủ trường + ngoại-lệ BT official/side-state.
- **Còn lại**: A cross-check full-pool (§4) → rồi ERRORS-SUMMARY + V6 gate.
  Không replay thêm; source/config/tests frozen.

## Cập nhật ~01:30 — A (Devin) nốt V5 finalB + findings closure
- **V5 finalB xong**: full pool E-B-001..009, seed20261005 → sample E-B-005+E-B-009 (ceil20%). E-B-005 reuse audit; E-B-009 verify doc lap: 10/10 pairs IoU 0.53-0.96, image sheet_0119 dung left-edge band tren xe that. Verdict: 2/2 phenomenon CONFIRMED, 0/2 harm proven, 0 type-FP. Cross-total A->B: 1/6 REJECTED-type (E-B-003 ghost); con lai harm UNSURE. Correction: cap dup gidNULL-dominant khong phai same-gid.
- **A findings closure**: 26 findings -> 10 EXPECTED, 7 MIXED (co floor-confirmed portions), 3 CONFIRMED, 3 NO-ERROR, 2 REJECTED, 1 UNSURE (E-A-020). MD/JSON dong bo.
- Pending: C nop V4-help-C-thai1.md -> A merge union coverage; sau do ERRORS-SUMMARY + V6 gate.

## Cập nhật ~01:45 — DEVIN(manager) tiếp quản điều phối; C chốt thai1 + V5-C resample
- **Thai1 union coverage CHỐT**: C xem `sheet_0001–0035` + `sheet_0097–0162` (101 sheets; tail 0158–0162 = extra coverage f5723–5812, ghi riêng) ∪ A `sheet_0036–0096` (61 sheets, 549 cells) = **162/162 sheets, 1450 unique cells (725/cam)**. Recompute strict pad±15 gap≤5: **116/116 event windows FULL cả 2 cam — 0 PART / 0 SKIP** (entry 5 · parking 28 · handoff 32 · occlusion 22 · exit 29). Report `V4-help-C-thai1.md` + `V4-help-A-thai1-part.md`.
- **V5-C final resample xong** (sau A freeze, seed 20261005, pool A = 13): sample {E-A-020 UNSURE, E-A-036 MIXED, E-A-042 REJECTED} → **3/3 A-status upheld**, 0/3 type-FP. E-A-036: lid317 chồm C08 empty (raw_ratio 0.007) floor-confirmed, phần in-lane UNSURE đúng. E-A-042: box "làn trống" thực là lid17 gid1 matched trên xe teal thật → reject đúng. Chi tiết `V5-C.md`.
- **V5 3 chiều đủ**: A→B (1/6 REJECTED-type), B→C (0/2 resolved, FP không ước-tính), C→A (0/3 type-FP, mẫu nhỏ không rơi CONFIRMED).
- **C hết việc QA chạy được** — INBOX-C.md ghi đủ. Còn campaign-level: ERRORS-SUMMARY + QUESTIONS-FOR-USER → V6 gate (LEAD-role, chờ user/manager lệnh). Freeze: set-level PASS phía B; per-file baseline 148-file không truy-cập (ghi hạn chế).

## Cập nhật ~01:45 — thai1 union CLOSED, A 6/6 sessions freeze-ready
- C nop `V4-help-C-thai1.md` → merge: **thai1 event-dense union 162/162 sheets, 1450 cells (725/cam), 116/116 windows FULL (0 PART/SKIP)**; +uniform 242, dedup 40 → **thai1 eyeball 1652/12100 = 13.7%** ghi `ERRORS-A.md`.
- C-flag thai1 cam2 f2920–3123 checked: lid30 anchor trong slot C10 → parked-track expected.
- **A-side khép**: 6 sessions done (test1/toi4/hiep2/sang9/thai6/thai1), findings 26 closed (10 EXPECTED, 7 MIXED, 3 CONFIRMED, 3 NO-ERROR, 2 REJECTED, 1 UNSURE), V5 finalB done. → C có thể resample V5 per plan (sau A6 freeze).
- Còn lại cho LEAD/manager: ERRORS-SUMMARY + QUESTIONS-FOR-USER + V6 gate. Frozen: source/config/tests/replay outputs.
## Cập nhật V6 — 2026-10-06 ~02:xx (DEVIN manager tiếp quản)
- LEAD Codex hết quota → HANDOVER.md đã ghi; DEVIN điều phối phần cuối.
- V4/V5 hoàn tất: union thai1 162/162 sheets (116/116 windows FULL); V5 cả 3 chiều xong (A→B 2/2 CONFIRMED; B→C 0/2 resolved; C→A 3/3 upheld).
- Freeze cuối: set-level PASS (B) — 0 file code/config/test bị sửa; 6 config SHA khớp; HEAD không đổi.
- V6 DONE: `ERRORS-SUMMARY.md` + `QUESTIONS-FOR-USER.md` đã viết. Chiến dịch verify-replay KẾT THÚC — chờ user review.
