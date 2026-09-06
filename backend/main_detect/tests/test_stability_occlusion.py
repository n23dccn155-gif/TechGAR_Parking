"""Regression cases missing from the original box-only tests (live15)."""
import json
from types import SimpleNamespace

import cv2
import numpy as np

from techgar.parking_detector import ParkingDetector, SlotResult
from techgar.motion_tracker import MotionVehicleTracker
from techgar.tracklet_descriptor import hsv_histogram, spatial_histograms, spatial_distance
from techgar.occlusion_guard import OcclusionGuard


def parking(tmp_path):
    path = tmp_path / 'slots.json'
    path.write_text(json.dumps({'imageWidth': 100, 'imageHeight': 100,
        'slots': [{'id': 'A', 'polygon': [[10,10],[90,10],[90,90],[10,90]]}]}))
    return ParkingDetector(str(path), stable_evidence=True, ratio_thr=.12,
                           core_scale=.8, use_edge_recheck=False)


def sample(occupied):
    return SlotResult('A', occupied, np.zeros((4,2), np.int32), (50,50), evidence={
        'instant_occupied': occupied, 'exit_empty_votes': 0 if occupied else 25,
        'required_votes': 12, 'rescue': False})


def test_source_time_hysteresis_late_samples_and_one_empty_flash(tmp_path):
    detector = parking(tmp_path)
    a = [sample(True)]; detector.accept_evidence(a, 1., 1)
    assert a[0].occupied and not a[0].evidence['ready']
    assert not detector.accept_evidence([sample(True)], 1., 1)
    a = [sample(True)]; detector.accept_evidence(a, 1.5, 2)
    assert a[0].occupied
    a = [sample(False)]; detector.accept_evidence(a, 2., 3)
    assert a[0].occupied
    a = [sample(True)]; detector.accept_evidence(a, 2.5, 4)
    assert a[0].occupied
    for t in (3.,3.5,4.):
        a = [sample(False)]; detector.accept_evidence(a,t,int(t*10))
    assert not a[0].occupied
    assert not detector.accept_evidence([sample(True)], 2., 3)


def test_missing_samples_reset_pending_but_do_not_release_occupied(tmp_path):
    d = parking(tmp_path)
    for t in (1.,1.5): d.accept_evidence([sample(True)],t,int(t*10))
    d.accept_evidence([sample(False)],2.,20)
    a = [sample(False)]; d.accept_evidence(a,10.,100)
    assert a[0].occupied


def test_hysteresis_middle_band_retains_previous_state(tmp_path):
    d = parking(tmp_path)
    for t in (1.,1.5): d.accept_evidence([sample(True)],t,int(t*10))
    for t in (2.,2.5,3.,3.5):
        a = sample(False); a.evidence['exit_empty_votes'] = 8
        d.accept_evidence([a], t, int(t*10))
        assert a.occupied


def test_bridge_to_vehicle_cannot_delete_entire_component(tmp_path):
    d = parking(tmp_path); d._compute_rois((100,100,3)); roi = d._rois[0]
    values=[]
    for connected in (False,True,False,True):
        mask=np.zeros((100,100),np.uint8)
        cv2.rectangle(mask,(38,37),(61,65),255,-1)
        cv2.line(mask,(50,10),(50,35 if not connected else 39),255,1)
        x,y,r,b=roi.bbox
        e=d._filter_roi_threshold(mask[y:b,x:r],roi)
        values.append(e.filtered_ratio)
        assert e.filtered_ratio > .12
    assert max(values)-min(values)<.03


def test_debug_uses_accepted_state_without_rerunning_detector(tmp_path,monkeypatch):
    d=parking(tmp_path); frame=np.full((100,100,3),128,np.uint8)
    r=d.detect(frame,False); d.accept_evidence(r,1.,1)
    monkeypatch.setattr(d,'detect',lambda *a,**k: (_ for _ in ()).throw(AssertionError('recomputed')))
    d.build_debug_images(); d.build_debug_images(frame)
    assert d._accepted_timestamp==1.


def seeded_tracker():
    tracker=MotionVehicleTracker(min_visible_count=1,min_confirm_displacement=0,
        min_area=100,min_width=10,min_height=10,max_bbox_width_ratio=1,
        max_bbox_height_ratio=1,max_bbox_area_ratio=1)
    frame=np.zeros((160,220,3),np.uint8)
    frame[40:100,40:70]=(255,180,70)
    frame[40:100,82:112]=(25,25,25)
    detections=[]
    for box in ((40,40,30,60),(82,40,30,60)):
        detections.append(dict(box=box,point=tracker._bottom_center(box),area=1800,
            bbox_area=1800,hist=hsv_histogram(frame,box),appearance_trusted=True))
    for i,t in enumerate((1.,1.1,1.2),1):
        tracker._frame_idx=i;tracker._current_timestamp_s=t
        if i==1:
            for det in detections:tracker._create_or_reid(det)
        else:
            tracker._predict_tracks()
            for track,det in zip(tracker._tracks.values(),detections):tracker._apply_detection(track,det)
    return tracker,frame


def test_real_detection_preflight_freezes_both_before_size_or_histogram_gates(monkeypatch):
    tracker,frame=seeded_tracker()
    mask=np.zeros(frame.shape[:2],np.uint8); mask[40:100,40:112]=255
    tracker.bg_sub=SimpleNamespace(apply=lambda _frame:mask.copy())
    monkeypatch.setattr(tracker,'_temporal_motion_mask',lambda *a,**k:mask.copy())
    before={tid:(t.last_seen_timestamp_s,t.appearance.copy(),t.bbox) for tid,t in tracker._tracks.items()}
    tracker.process_frame(frame,timestamp_s=1.3)
    assert len(tracker._tracks)==2
    assert tracker.occlusion_guard.groups
    for tid,track in tracker._tracks.items():
        assert track.association_state=='frozen_ambiguous'
        assert track.last_seen_timestamp_s==before[tid][0]
        assert track.bbox==before[tid][2]
        np.testing.assert_array_equal(track.appearance,before[tid][1])


def test_split_assignment_is_atomic_and_requires_three_fresh_frames():
    tracker,frame=seeded_tracker(); g=tracker.occlusion_guard
    predictions=tracker._predict_tracks();g.prepare(tracker._tracks,predictions,1.3,4)
    group=next(iter(g.groups.values()));g.activate(group,tracker._tracks)
    pairs=[(1,0,(55,100)),(2,1,(97,100))]
    costs=np.array([[.1,.8],[.8,.1]])
    for f in (4,5,6):
        g.frame_idx=f
        accepted,_,_=g.gate_assignments(pairs,costs,[1,2],tracker._tracks,[{},{}],.08)
        assert len(accepted)==(2 if f==6 else 0)


def test_group_expiry_is_not_extended_by_ambiguous_pixels():
    tracker,_=seeded_tracker();g=tracker.occlusion_guard;p=tracker._predict_tracks()
    g.prepare(tracker._tracks,p,1.3,4);group=next(iter(g.groups.values()))
    g.activate(group,tracker._tracks);expires=group.expires_at
    g.now=2.;g.activate(group,tracker._tracks)
    assert group.expires_at==expires
    g.prepare(tracker._tracks,p,4.3,99)
    assert not g.groups


def test_spatial_descriptor_keeps_416d_abi_and_empty_zones_are_unknown():
    frame=np.zeros((80,40,3),np.uint8);frame[:40]=(0,0,255);frame[40:]=(255,0,0)
    mask=np.full(frame.shape[:2],255,np.uint8)
    zones=spatial_histograms(frame,(0,0,40,80),mask)
    reversed_zones=spatial_histograms(frame[::-1].copy(),(0,0,40,80),mask)
    assert all(z.shape==(416,) for z in zones)
    assert spatial_distance(zones,zones)==0
    assert spatial_distance(zones,reversed_zones)>.1
    assert spatial_distance(zones,spatial_histograms(frame,(0,0,40,80),np.zeros_like(mask))) is None


def test_low_quality_appearance_does_not_relabel_a_track():
    tracker,_=seeded_tracker();track=tracker._tracks[1];before=track.appearance.copy()
    tracker._apply_detection(track,dict(box=track.bbox,point=(track.cx,track.cy),
                                      area=track.area,hist=None,appearance_trusted=False))
    np.testing.assert_array_equal(track.appearance,before)


def test_independent_global_ids_cannot_merge_even_through_aliases():
    from test_cross_camera_manager import make_manager
    m=make_manager();m._bind('cam1',1,10);m._bind('cam1',2,11)
    m.register_independent_tracks('cam1',[(1,2)])
    result=m._merge_global_ids(10,11,20,'test',verified_transfer=True)
    assert not result.accepted and not m._global_aliases
    m._global_aliases[10]=8
    assert not m._merge_global_ids(8,11,21,'test',verified_transfer=True).accepted
    assert m.get_global_id('cam1',2)==11


def test_validated_partition_can_update_position_but_not_appearance_or_parking():
    from two_camera import collect_binder_global_tracks
    tracker,_=seeded_tracker();t=tracker._tracks[1];before=t.appearance.copy()
    tracker._current_timestamp_s=1.3
    tracker._apply_detection(t,dict(box=t.bbox,point=(t.cx+3,t.cy),area=t.area,
        hist=np.zeros_like(t.appearance),appearance_trusted=False,observation_kind='watershed_validated'))
    np.testing.assert_array_equal(t.appearance,before)
    assert t.measurement_observations[-1][0]==1.3
    m=SimpleNamespace(get_global_id=lambda cam,local:local,canonical_global_id=lambda gid:gid)
    assert 1 not in collect_binder_global_tracks('cam1',tracker,m)


def test_ordinary_size_gate_uses_clean_history_not_contaminated_last_box():
    tracker,_=seeded_tracker();t=tracker._tracks[1]
    t.bbox=(30,30,120,120)
    assert tracker._clean_size(t)==(30.,60.)


def test_uncertain_geometry_cannot_allocate_a_global_id():
    from techgar.cross_camera_manager import CrossCameraManager
    t=SimpleNamespace(status='confirmed',association_state='matched',observation_kind='watershed_validated')
    assert not CrossCameraManager._is_allocatable(t)


def test_expired_group_cannot_mint_new_id_for_its_still_joined_blob():
    tracker,_=seeded_tracker()
    tracker.occlusion_guard.independent_pairs.add((1,2))
    tracker._current_timestamp_s=4.3
    assert tracker._unresolved_merged_birth({'box':(40,40,72,60)})
    assert not tracker._unresolved_merged_birth({'box':(40,40,30,60)})
    tracker._current_timestamp_s=7.
    assert not tracker._unresolved_merged_birth({'box':(40,40,72,60)})


def test_occluded_identity_deferral_telemetry_does_not_shadow_event_id_argument():
    from test_cross_camera_manager import make_manager
    m=make_manager()
    m._record_new_identity_deferred('cam1',4,20,'near_occluded_identity',occluded_global_id=2)


def test_occlusion_blocks_recovery_without_expiring_identity_memory():
    from test_cross_camera_manager import make_manager, DummyTrack
    m=make_manager(); t=DummyTrack(100,100)
    state=m._observe_identity(2,'cam1',1,t,10,1.)
    state.state='dormant'
    m.sync_occluded_identities([2])
    m.cleanup(11,1.2)
    assert state.state=='dormant'
    assert m._identity_is_recent(state,11,1.2)
    m._match_dormant_identities({'cam1':{3:DummyTrack(100,100)}},11,{'cam1':1.2})
    assert m.get_global_id('cam1',3) is None


def test_filtered_assignment_candidates_cannot_hide_an_existing_camera_owner():
    from test_cross_camera_manager import make_manager, DummyTrack
    m=make_manager(); m._bind('cam1',1,2)
    m._ownership_tracks={'cam1':{1:DummyTrack(550,200)}}
    assert m._has_confirmed_camera_member(2,'cam1',{'cam1':{9:DummyTrack(550,250)}},exclude_local_id=9)


def test_repeated_partition_activation_does_not_reset_three_frame_validation():
    tracker,_=seeded_tracker();g=tracker.occlusion_guard
    g.prepare(tracker._tracks,tracker._predict_tracks(),1.3,4)
    group=next(iter(g.groups.values()))
    pairs=[(1,0,(55,100)),(2,1,(97,100))]
    costs=np.array([[.1,.8],[.8,.1]])
    for frame in (4,5,6):
        g.frame_idx=frame;g.activate(group,tracker._tracks)
        detections=[{'observation_kind':'watershed_provisional'} for _ in range(2)]
        accepted,_,_=g.gate_assignments(pairs,costs,[1,2],tracker._tracks,detections,.08)
        assert len(accepted)==(2 if frame==6 else 0)
    assert all(d['observation_kind']=='watershed_validated' for d in detections)


def test_physical_cameras_do_not_use_single_histogram_crop_shortcut():
    from test_cross_camera_manager import make_manager, DummyTrack
    m=make_manager();m.camera_transforms={'cam1':np.eye(3),'cam2':np.eye(3)}
    m._bind('cam1',1,2)
    assert m._match_simultaneous_overlap('cam2',9,DummyTrack(20,200),
        {'cam1':{1:DummyTrack(550,200)},'cam2':{9:DummyTrack(20,200)}}) is None
    assert m.get_global_id('cam2',9) is None


def test_independent_local_pair_cannot_rebind_as_an_echo(monkeypatch):
    from test_cross_camera_manager import make_manager, DummyTrack
    m=make_manager();m._bind('cam1',1,2)
    m.register_independent_tracks('cam1',[(1,9)])
    monkeypatch.setattr(m,'_same_camera_motion_duplicate',lambda *args:True)
    monkeypatch.setattr(m,'_same_camera_duplicate_ready',lambda *args:True)
    monkeypatch.setattr(m,'_same_camera_partial_echo',lambda *args:False)
    tracks={'cam1':{1:DummyTrack(100,100),9:DummyTrack(110,100)}}
    assert m._match_same_camera_duplicate('cam1',9,tracks['cam1'][9],tracks,20) is None
    assert m.get_global_id('cam1',9) is None
