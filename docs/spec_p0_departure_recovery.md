# SPEC P0 — Parking Departure Recovery: G#2 -> G#4 (hiep2 / D01)

> Branch: an5_9 | HEAD: 3c74cbd4 | Date: 2026-09-06
> Session: droidcam_shared_hiep2 (2340 frames, 12:29:53-12:34:35, 06/09/2026)
> Defect: xe den tai D01 da lock G#2 (frame 356, 21 obs / 12 vision confirms / overlap 0.8083),
> luc roi o bi cap sai G#4 tai frame 1181. Frontend va parking detection khong phai nguyen nhan chinh.

---

## 1. Tom tat loi (TL;DR)

```
Do dung D01/G#2
  -> thu bang chung xe bat dau roi (token predeparture cam2/#9, frame 1165-1181)
  -> van cho vision on dinh xac nhan empty (instant_occupied=false, 25 phieu empty, ratio ~0.031 nhung stable van occupied)
  -> token bi reset/huy theo guard ngan (predeparture_guard_seconds=0.75s)
  -> mat bao ve local track
  -> manager cap G#4 (frame 1181)
  -> vision xac nhan empty muon (frame 1192/1197, event frame 1186/1192)
  -> recovery bo qua track da co G#4 (two_camera.py skip tracks co GID)
  -> token G#2 het han, ho so G#2 expired (frame 1222-1223)
```

Day la loi **parking departure recovery** (khac loi 2 xe nhap bbox o live15). Occlusion guard o live15 khong bao phu ca nay.

## 2. Nguyen nhan goc re (status-report.md muc 3, 6 diem)

| # | Vi tri | Van de | Chi tiet |
|---|--------|--------|----------|
| 1 | `slot_vehicle_binder.py: _cleanup_tokens()` | 2 thoi han khac nhau bi hieu nhu 1 | Cancel token predeparture theo `predeparture_guard_seconds=0.75` truoc ca check het han 5s. Tang `identity-retention-seconds` 60->120 khong cham toi nhanh nay. |
| 2 | `slot_vehicle_binder.py` + vision worker | Guard 0.75s khong tuong thich voi empty-wait toi thieu 1s + vision chay nen (worker delay) | Binder doi them empty samples rieng. Loi phoi hop state machine, khong phai tham so hoi nho. |
| 3 | `slot_vehicle_binder.py: _restore_false_empty_token()` via `update_vision()` | Occupied lien tuc khi xe dang lui bi coi la rebound | Khi token ton tai + vision occupied, ham rearm bang old vision timestamp -> timestamp lui ve mau nguon truoc, log rearm/cancel/reopen. Can phan biet "occupied lien tuc khi dang roi" vs "thuc su empty roi co xe khac vao". |
| 4 | `cross_camera_manager.py` | Quyen chan cap ID moi gan voi token mong manh | Sau khi token bi huy, cam2/#9 mat bao ve -> manager cap G#4. Reservation G#2 chi chan lay ID cua xe parked, khong ngan track roi chinh o do nhan ID khac. |
| 5 | `two_camera.py` (parking recovery loop truoc manager) | Khong hoa giai muon khi da cap GID sai | Danh sach thu parking recovery bo qua track da co Global ID -> khi token G#2 confirm muon, xe dang mang G#4 khong bao gio duoc xet lai. Khong duoc gop 4->2 vo dieu kien; phai chung minh dung xe roi D01. |
| 6 | `cross_camera_manager.py` TTL | Ho so G#2 co the het TTL ngay sau khi token het han | Recovery-age anchor sau parked can review; khong dem thoi gian parked nhu thoi gian mat tin hieu. |

## 3. Tam anh huong

- P0: roi D01 mat G#2, nhan G#4 — da xac nhan trong hiep2; chua sua.
- P0: token predeparture reset/huy khi con dang cho vision.
- P0: track roi o mat bao ve roi duoc cap GID moi.
- P1: khong hoa giai recovery muon voi GID da cap.
- Cac ton tai khac: 2 nhan co the bien mat khi nhap blob, chong nhap nhay chua co accuracy ground truth, hieu nang detector 8.274 cap frame/s, lint frontend.

## 4. Yeu cau sua (Acceptance Criteria)

### 4.1. Chuc nang chinh
- AC1: Xe den roi D01 giu **canonical G#2** xuyen suot, khong nhan G#4 moi.
- AC2: Xe khac vao D01 sau do van duoc cap GID moi dung dan; khong gop vo dieu kien.
- AC3: D01 chuyen sang empty dung sau khi xe roi; khong tao session moi cho cung xe.
- AC4: Replay tu **truoc khi xe vao D01** (khong phai tu frame 1170) cho ket qua AC1-3.

### 4.2. Tinh on dinh / khong hoi quy
- AC5: Occlusion guard (live15 window 3500-3900) giu nguyen hanh vi: guard ON reject shared bbox, khong lam mat ca 2 nhan vo co.
- AC6: Test suite hien co pass: tracking 344, backend session 26, frontend 58 + typecheck.
- AC7: Khong lam gian doan hien thi frontend / session lifecycle ngoai pham vi sua.
- AC8: Hieu nang khong giam dang ke so voi 8.274 cap frame/s hiep2.

### 4.3. Kha nang kiem chung
- AC9: Log them `evidence_frame_idx` va `applied_frame_idx` de phan biet vision evidence vs token clock.
- AC10: Co regression case tai hien: parked -> predeparture -> instant empty nhung stable occupied -> worker cham -> token reset -> new ID.

## 5. Thiet ke sua (da doi chieu code thuc te — cap nhat sau dieu tra Pi)

> Duong dan thuc te: `backend/main_detect/src/techgar/slot_vehicle_binder.py` (2960 dong),
> `backend/main_detect/src/techgar/cross_camera_manager.py` (~6100 dong),
> `backend/main_detect/two_camera.py`. Constants: `predeparture_guard_seconds=0.75` (binder:209),
> `false_empty_grace_seconds=1.25` (binder:208), `recovery_retention_seconds=5.0` (binder:206),
> `identity_retention_seconds=60.0` (ccm:164), `identity_retention_moving_seconds=12.0` (ccm:190),
> vision empty confirm = 3 samples/1.0s @2Hz (parking_detector.py:637-640), result staleness <=1.0s.

### 5.1. slot_vehicle_binder.py (root cause 1-3)
- **B1 — Guard sizing**: tai cho dung `SlotVehicleBinder` o `two_camera.py:1662-1680`, truyen
  `predeparture_guard_seconds = parking_empty_seconds + parking_max_result_age_seconds + 1/parking_fps`
  (= 1.0+1.0+0.5 = **2.5s** voi defaults). Dong thoi tang class default (binder:209) 0.75 -> 2.5.
- **B2 — Mien tru trong `_cleanup_tokens` (1241-1254)**: khong huy token theo guard khi
  (a) con candidate tuoi (`now_s - ev.last_seen_s <= false_empty_grace_seconds`), hoac
  (b) candidate co `qualified_predeparture` / `world_trajectory_qualified` (xe dang thuc su roi o —
  bang chung outward da duoc chung minh tai binder:2539-2553 va 2353-2367). Token chi chet qua 5s retention.
- **B3 — Phan biet rebound**: `update_vision:1827-1832` chi goi `_restore_false_empty_token` khi
  `token.empty_observations > 0 or not token.predeparture`. Occupated lien tuc (empty_observations==0,
  predeparture) = xe dang lui, KHONG phai flicker: giu nguyen binding sticky, khong rearm/huy.
  Them early-return trong `_restore_false_empty_token` cho truong hop nay (khong emit `false_empty`).
- **B4 — Refresh guard clock**: `prepare_predeparture_tokens:483-492` — khi token da ton tai va
  fragment van dang duoc protect, cap nhat `created_at_s = timestamp_s` (extend protection theo
  su hien dien vat ly lien tuc, khong phu thuoc vision tick trong 0.75s).
- **Log**: events token tu `update_vision` ghi `applied_frame_idx` va `evidence_frame_idx` (tach
  vision evidence timestamp khoi token clock).

### 5.2. cross_camera_manager.py (root cause 4,6)
- **M1 — Chan cap GID moi cho track dang roi o reserved**: them helper
  `_leaves_reserved_slot(cam_id, local_track_id, track, frame_idx)` (dat sau line 1595, canh
  `parking_recovery_trajectory_evidence`): dung `trajectory.provisional_samples`, `parked_origin`,
  `_world_velocity`, `_parked_reservations`; tra ve `{reserved_global_id, slot_id}` khi fragment
  xuat phat gan slot origin va dang di ra xa. Goi trong allocation loop giua 5915-5916: defer bang
  `_record_new_identity_deferred(... "leaving_reserved_slot")`, dict `_departure_deferred_since`
  gioi han (het han khi reservation bien mat / fragment vao lai slot / vuot TTL ~ moving retention).
- **M2 — Re-anchor TTL**: `sync_parked_reservations:863-867` khi reservation bi drop va identity
  dang `parked/recovery_pending` -> `dormant`, dat lai `last_seen_frame=int(frame_idx)` va
  `last_seen_time=max(camera timestamps)` de thoi gian parked KHONG bi dem la mat tin hieu.
  Sua loi G#2 expired frame 1223 (1 frame sau token expiry).
- **P2 (ho tro two_camera)**: `parking_recovery_trajectory_evidence` (1397) them optional
  `candidate_global_id: Optional[int]` — khi track da bound, doc trail tu
  `trajectory.global_samples(candidate_global_id)` thay vi `provisional_samples`.

### 5.3. two_camera.py (root cause 5)
- **P1 — Reconcile pool**: `recover_departing_vehicle_ids` (753) — giu line 780 cho normal path;
  them pool rieng cho track DA CO GID chi khi co token `confirmed_empty` cho slot do va
  vi tri track pass spatial gates (887-930). Payload dung `build_recovery_track_payload` (563).
- **P3 — Verification gates (fail-closed, phai pass TAT CA)**: token proof (confirmed_empty +
  canonical parked owner); timing (GID hien tai duoc cap TRUOC khi token confirmed); slot origin
  (khong `teleport`, `origin_distance_cm <= dormant_match_distance`); trajectory
  (`score >= 0.78`, `observations >= 3`, `stable`, khong hard_reject, khong
  `ambiguous_other_parked_gid`/`owned_by_other_parked_gid`); appearance (`distance <= 0.62`,
  support > 0); camera (`topology_score > 0`). Fail -> diagnostic
  `slot_recovery_late_reconciliation_pending` + cho (token khong bi consume, evidence tich luy tiep).
- **P4 — Canonicalize qua transactions hien co**: (1) `bind_external_id(source="parking_departure_token", ...)`
  nhu call site 1038-1048; (2) `_merge_global_ids(canonical=token_gid, duplicate=current_gid,
  reason="late_departure_token_reconciliation")` (ccm:1036) — ton trong reject
  (`independently_observed_vehicles`, `identity_temporarily_occluded`, `merge_blocked_collision_risk`);
  invariant "GID nho/cu hon ton tai" giu G#2, retire G#4. Thanh cong moi consume token.
  TUYET DOI khong merge vo dieu kien.
- **P5 — Downstream tu honor**: `update_all_tracks` (bound keys giu active), `cancel_observed_recovery_tokens`,
  `remap_vehicle_ids`, `sync_parking_identity_reservations` — khong can sua.

### 5.4. Rang buoc chung
- KHONG dung on dinh o do (0.12/0.08, 2/0.5s, 3/1s, vision_primary).
- KHONG cham occlusion guard: `_resolve_same_camera_global_conflicts` (2580-2680),
  `_occluded_global_ids` proximity guard (5773-5787), `same_camera_global_conflict_detached`.
- Fail-closed: bang chung khong du -> cho + ghi ly do, khong bao gio merge vo dieu kien.
- DeepReID optional; histogram khong phai CNN feature.
- Khong sua lint frontend (P2, tach biet).

## 6. Ke hoach kiem thu

1. `pytest tests/` (tracking 344 + backend session 26 + frontend 58).
2. Chay lai cong cu chan doan identity churn tren `experiment_test/` (neu co).
3. Replay hiep2 tu truoc khi vao D01, kiem AC1-4.
4. Kiem tra thu cong occlusion guard live15.

### Ket qua kiem thu (2026-09-06, sau khi implement xong)

| Kiem thu | Ket qua |
|---|---|
| `pytest backend/main_detect/tests/` | **347 passed** (344 cu + 3 regression moi) |
| `python -m py_compile` ca 4 file da sua | OK |
| `diagnose_identity_churn.py` tren hiep2 | Chay OK, 0 frame-instance trung ID dong thoi. **Luu y:** cong cu nay khong bat duoc ID-switch theo thoi gian (da canh bao trong status-report muc 6); can replay thuc te de xac nhan AC1. |
| 3 regression test moi | `test_late_reconciliation_restores_owner_and_retires_wrong_gid`, `test_late_reconciliation_waits_when_evidence_fails`, `test_late_reconciliation_never_touches_unconfirmed_or_younger_ids` — ca 3 pass |

**Chua chay:** replay hiep2 thuc te (can video stream + model weights); occlusion guard live15 (can session data). Hai muc nay can lam thu cong khi co du lieu.

## 7. Thu tu trien khai (cho Pi)

1. Doc code 3 file chinh + status-report muc 3/4/7 de doi chieu.
2. Sua `slot_vehicle_binder.py` truoc (root cause 1-3).
3. Sua `cross_camera_manager.py` (root cause 4,6).
4. Sua `two_camera.py` (root cause 5).
5. Chay test + bao cao diff.

---

## Phu luc: Nguon tham chieu

- `docs/status-report.md` muc 3 (timeline frame 167-1223, 6 nguyen nhan, causal chain) + muc 4/5/6/7.
- `docs/plan-gid-swap-fix.md` (neu ton tai).
- `docs/fix-live15-stability-2026-09-06.md` (live15 ablation).
- Du lieu phien: `backend/main_detect/experiment_test/output/droidcam_shared_hiep2`.
