# F0-c — Test tái hiện stationary re-acquire (builder-c)

File mới: `backend/main_detect/tests/test_stationary_reacquire.py`
Log pytest: `.analysis/gid-reacquire/F0-c-pytest.log`

## Kết quả

```
3 failed, 2 passed in 0.19s
FAILED test_stationary_car_reacquired_after_track_death_reuses_gid
FAILED test_stationary_reacquire_while_gid_live_on_other_camera_reuses_gid
FAILED test_two_equally_strong_candidates_must_defer_or_mint
PASSED test_distant_car_does_not_steal_stationary_gid
PASSED test_same_camera_live_owner_blocks_stationary_reacquire
```

**2/2 kịch bản chính FAIL đúng `expected: reuse gid1`.** Test âm (i) cũng FAIL — đó là signature defect thứ 2 (unguarded ambiguous reacquire), xem §3.

## Cách dựng

Bắt chước `test_gid_reserved_competition.py`: `CrossCameraManager` thật với
`camera_transforms` (cam2 = +500px x), `edge_adjacency`, `overlap_regions`,
`DummyTrack` (confirmed, `appearance`, `history`, `appearance_tracklet` qua
`AppearanceTracklet`). Feed qua `update_all_tracks` + `observe_trajectories`,
giết track bằng `notify_track_lost`/`notify_track_expired` (giữ gallery +
world anchor như API thật). Không camera/file video.

Hai cơ chế được dùng đúng chỗ:
- `bind_external_id('cam1',10,1)` = completed handoff → gid1 có member cam1.
- `appearance_tracklet` trên track cuối + truyền vào `notify_track_expired`
  → dormant identity giữ gallery cam2 (giống `_expire_local_binding`).

## Kịch bản & bằng chứng

### Test 1 — `test_stationary_car_reacquired_after_track_death_reuses_gid` (FAIL)

Replay faithful sang8 f600: cam2 lid35 đỗ yên → gid1 (handoff cam2→cam1 mở
đúng như real f224). Track chết. ~13.7s sau (real: f266→f600 = 13.4s)
detection bắn lại tại world ~562px — cách anchor gid1 ~2px, appearance
identical.

```
E AssertionError: expected: reuse gid1 -- stationary car re-acquired ~2
  world-px from its dead track's anchor with matching appearance;
  got global_id=2;
  rejections=['dormant:dormant_reid_rejected(gid=1,reason=same_camera_stale)']
```

Event log đối chứng (fixture):

```json
{"type":"dormant_reid_rejected","frame":400,"global_id":1,
 "source_camera":"cam2","target_camera":"cam2","target_local_id":40,
 "reason":"same_camera_stale","elapsed":13.68}
{"type":"global_id_created","frame":400,"global_id":2,...}
{"type":"handoff_expired","frame":400,"global_id":1,...}
```

So với event thật sang8 (~f600): real cũng có `dormant_reid_rejected` gid1
`same_camera_stale` + `global_id_created` gid3 + `handoff_opened`. **Cùng
chuỗi event.** Khác biệt nhỏ: real còn ghi thêm
`world_trajectory_rejections[reason=trajectory_score, direction≈0.001,
time_topology=0]` ở world pass; fixture chỉ quan sát được veto dormant
(world_trajectory_rejections rỗng — world pass không ghi candidate này).
Cơ chế hội tụ giống nhau: xe đỗ yên quá 12s moving-retention
(`_same_camera_recovery_is_stale`, L4659-4691) + trajectory score không bao
giờ đạt 0.78 khi direction/time_topology=0 → mint gid mới.

### Test 2 — `test_stationary_reacquire_while_gid_live_on_other_camera_reuses_gid` (FAIL)

Kịch bản §3 brief: gid1 giữ binding cam1 lid10 (completed handoff, feed sau
khi lid35 chết → `last_camera=cam1`, `state=active`, last_world=560,120).
Fragment cam2 mọc lại tại world 605 — cách 45px, ngoài cửa sổ dedup 9px,
ngoài tầm handoff (TTL 45f hết).

```
E AssertionError: expected: reuse gid1 -- gid still registered via cam1
  for the same parked car; ... got global_id=2; rejections=[]
```

**Nhận định:** veto IM LẶNG — không `dormant_reid_rejected` (state active →
ngoài dormant pool), `world_trajectory_rejections` rỗng. Đây là diagnostic
gap: nhánh live-owner từ chối không để lại event nào (trong khi dormant
pass có `_record_dormant_rejection`). Cùng một đầu ra bug (gid2 minted).

### Test âm (i) — `test_two_equally_strong_candidates_must_defer_or_mint` (FAIL — defect thứ 2)

gid1 đỗ cam2@(60,120), gid2 đỗ cam2@(140,120), appearance giống hệt;
fragment mọc tại (100,120) — cách đều 40px. Trong vòng 12s retention:

- f300: `dormant_reid_ambiguous` → defer đúng 1 frame;
- f301: `dormant_global_id_recovered` → **steal gid1** (`[re-id] global #1: cam2->cam2`).

Defer 1 frame rồi vẫn steal = margin guard chưa có. Đây là hành vi hiện tại
không đạt yêu cầu guard — test giữ assert desired-behavior để FAIL làm
bằng chứng; phải PASS sau khi fix margin/defer (F1).

### Test âm (ii) — `test_distant_car_does_not_steal_stationary_gid` (PASS)

Xe khác ở world 900px, appearance khác → không bị gán gid1 (assigned=gid2
mới/None — đúng).

### Test âm (iii) — `test_same_camera_live_owner_blocks_stationary_reacquire` (PASS)

gid1 còn live member cam2 lid35; fragment thứ hai cùng cam, cách 340px,
appearance giống → không steal (`same_camera_live_owner` veto hoạt động).

## Kết luận

- Bug sang8 tái hiện đúng qua API thật: cùng chuỗi event
  (`dormant_reid_rejected`/`same_camera_stale` → `global_id_created`),
  cùng outcome (duplicate gid cho cùng xe vật lý).
- Test 2 chứng minh defect không chỉ ở dormant-stale: nhánh live-owner
  cũng mint gid cho xe đỗ yên, và veto không ghi log (gap chẩn đoán).
- Test (i) phơi thêm signature: ambiguous dormant tie chỉ defer 1 frame
  rồi steal — F1 cần margin guard giữ defer, không chỉ trì hoãn.
- 2 negative (ii),(iii) PASS ngay cả trước fix → guard hiện có đúng chỗ.
