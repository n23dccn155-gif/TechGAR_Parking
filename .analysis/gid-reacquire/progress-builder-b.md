# progress-builder-b — F0-b

## Kế hoạch
1. Trích `identity_events` + `world_trajectory_rejections` cho 8 candidates.
2. Trạng thái gid bị reject tại thời điểm event (cam nào, sống/dormant).
3. World-space anchors (calibration two_camera.shared_cm_01.json).
4. Render ≥6 mốc trong gap bằng make_sheets.py → `evidence/<session>_f<frame>/`.
5. Verdict SAME_CAR/DIFFERENT_CAR/UNSURE → F0-b-cases.md + .json.
6. Quét rộng 18 session (mọi reason, wd≤5, +dormant_reid_rejected/handoff_rejected).

## Session→output map
- sang8 → verify_cur_session_hiep_sang8
- thai3 → verify_cur_session_hiep_thai3
- thai4 → verify_cur_session_hiep_thai4
- thai6 → verify_cur_session_thai6
- thai7 → verify_cur_session_thai7

## Checkpoints
- [x] Đọc brief + SPEC + MEGAPLAN
- [ ] Extract 8 events
- [ ] Rejected-gid states
- [ ] World-space
- [ ] Render evidence ≥6 mốc/case
- [ ] Verdicts + JSON/MD
- [ ] Quét rộng 18 session


## F0-b COMPLETE

- 8/8 original candidates classified with >=7 image checkpoints each + world-space anchors.
- Broad scan: 18 sessions, world_distance<=5.0 -> 10 candidates total (2 new: thai6 f5367, thai8 f1945). Both rendered + eyeballed.
- dormant_reid_rejected / handoff_rejected: checked all 18 sessions -> 0 matches (no world_distance on those event types).
- Verdicts: SAME_CAR 7 | DIFFERENT_CAR 3 | UNSURE 0.
- Deliverables: F0-b-cases.md, F0-b-cases.json (10 entries, all components), evidence/<case>/ x10 dirs.
- F0 exit criterion met (6/8 originals SAME_CAR). Awaiting lead decision for F1.


## F1-b Phan 1 COMPLETE

- F1-b-distributions.md: bang phan phoi 9 components + cdist_px + new_lid_pregid_motion theo verdict.
- Separator tot nhat: cdist_px (SAME 10.2-54.0 vs DIFF 53.7-212.2); bien ~54px chua cap thai6_f4936(S)/thai8_f1945(D) -> de xuat accept<=45, defer 45-70, arrival-veto pregid_motion>60px tach dung 10/10.
- Tieu chi bo sung: slot occupied/vision_occupied = 0 suot gap moi case -> KHONG kha thi; other-fragment tren anchor cu khong tach (ca 2 nhom deu co, tat ca gid=None).
- Phan 2 backtest: CHO F1-design.md (builder-a). READY-BACKTEST.


## Backtest-pool prep (sau plan update: F3 replay HUY)

- Vai tro F2/F3-tinh cua builder-b: review diff + chay lai dieu kien thiet ke OFFLINE tren F0-b-cases.json/pool. Khong chuan bi replay.
- _backtest_pool_b.json (2.6MB): toan bo events 18+ session tach 2 nhom — negative (global_id_created, dormant_reid_rejected[+_stale/_ambiguity], dormant_reid_deferred_fragment_immature, handoff_rejected, new_global_id_deferred_*, merge/dup rejected...) = 10757; positive controls (global_id_recovered, dormant_global_id_recovered, world_trajectory_*_matched, dormant_turnaround_recovered, handoff_matched, *_duplicate_matched/merged) = 535.
- Luu y pool: dormant_reid_rejected mang pixel-distance (last_position_distance/distance_limit), dormant_reid_rejected_stale mang elapsed+reason, KHONG co world_distance -> scan wd<=5 truoc chi phu trajectory rejections. Pool giu full cho moi dieu kien design.
- F1-design.md chua xuat hien (builder-a dang CP3). Tiep tuc cho -> Phan 2 chay ngay khi co.


## F1-b Phan 2 COMPLETE — F1-b-backtest.md

- Metric check: design px = bottom-center anchor (x+w/2,y+h) — DUNG; cdist_px cua Phan 1 sai convention (artifact bien 54.0/53.7 bien mat: that su SAME<=93 vs DIFF>=120). Euclid anchor_world verify khop 7/10.
- Backtest 10 case: SAVED 5 (sang8 bat buoc OK, thai4, thai6_f1128, f1205*, f4936* — *caveat anchor_world null), DEFER 2 (thai3_f1774 live-member gid2 margin; thai6_f5367 3 alias margin), FALSE-ACCEPT 0 (3 DIFF deu rot G2 distance).
- Quet rong Euclid<=5 tren 133 gid_created + dormant/handoff: +9 event moi. Dead-gid chains -> +4 SAME_CAR rescue (thai4 x3, thai6_f5143) + 1 DEFER (thai6_f5912). dormant_reid<=5wu = 0.
- Rui-ro duy nhat: thai3_f1528 live-member gid2 (xe dang lai) trong D_STAT cua frag do yen -> ACCEPT neu G4 fallback; an-toan chi khi gallery-missing=reject (design SS9). De xuất veto member window-drift>TAIL_STAT.
- Caveats ghi ro: anchor_world null 3 case, Δapp margin khong log, size/velocity thieu du lieu.


## F2-b REVIEW COMPLETE — F2-b-review.md — VERDICT: REVIEW PASS

- Flag-off: PASS bit-identical (double-gated call site, moi dormant hook flag-gated, chi 2 del-lines refactor deferred_keys tuong-duong-rong khi off). pytest stationary: 20/20 PASS chay lai thuc te.
- Scope: PASS — chi ccm+two_camera moi; 5 file pre-existing nguyen-ven vs baseline-dirty.patch (0 missing/extra lines). Khong cham ROI/calibration/slots/tracker.
- D1-D5: dung report, khong deviation ngam.
- Offline re-run rev2: window-drift veto (member obs +-10f) dong rui-ro — thai3_f1528 drift 3.18>2.0 DOUBLE-vetoed; thai3_f1774 gid2 drift 12.84>2.0 -> DEFER nang thanh SAVED.
- Tally rev2 tren 10 case: SAVED 6 (sang8 bat buoc OK) / DEFER 1 (thai6_f5367 margin) / FALSE-ACCEPT 0. Pool: live-member cases het veto, +4 dead-gid rescue.
- Issues: 3 case anchor-null quyet-dinh boi identity_anchor_missing (log identity_last_world flag-on); MEMBER_DRIFT_STAT 2.0 calibrate livecam.
