import random
from dataclasses import replace

import numpy as np

from techgar.core2.dump import BlobDumpWriter, AsyncBlobDumpWriter, read_dump
from techgar.core2.types import Blob
from techgar.slot_vehicle_binder import SlotBinding, SlotVehicleBinder


def test_fast_binder_candidates_equal_default_on_random_and_edge_boxes():
    binder=SlotVehicleBinder()
    for i in range(40):
        x=(i%8)*30; y=(i//8)*30
        binder._bindings[str(i)]=SlotBinding(slot_id=str(i),center=(x+10,y+10),
            polygon=np.array([[x,y],[x+20,y],[x+20,y+20],[x,y+20]],np.int32))
    rng=random.Random(37)
    for _ in range(50):
        tracks={i:{'bbox':(rng.uniform(-20,260),rng.uniform(-20,180),rng.uniform(2,40),rng.uniform(2,40))} for i in range(12)}
        tracks[20]={'bbox':(20.0,0.0,10.0,20.0)}
        binder.fast_batch_match=False; expected=binder._batch_match(tracks)
        binder.fast_batch_match=True; actual=binder._batch_match(tracks)
        assert actual==expected


def test_async_dump_preserves_order_and_none_descriptors(tmp_path):
    path=tmp_path/'dump.jsonl.gz'
    writer=AsyncBlobDumpWriter(BlobDumpWriter(path,video='val',stride=1,cameras={0:'cam1'},core_version='test'),capacity=1)
    blob=Blob(0,0,0.0,(1,2,3,4),(5.,6.),12,False,1.,None)
    for i in range(30): writer.write_step(i+1,i+1,i+1,{0:[replace(blob,frame=i+1,t=float(i+1))]})
    writer.close()
    header,steps=read_dump(path); rows=list(steps)
    assert [r['frame_idx'] for r in rows]==list(range(1,31))
    assert all(r['blobs_by_cam'][0][0].desc is None for r in rows)


def test_cached_geometry_matches_original_and_invalidates_on_polygon_edit():
    binder = SlotVehicleBinder()
    for i in range(20):
        x, y = (i % 5) * 30, (i // 5) * 30
        binder._bindings[str(i)] = SlotBinding(slot_id=str(i), center=(x+10,y+10),
            polygon=np.array([[x,y],[x+20,y],[x+20,y+20],[x,y+20]],np.int32))
    rng = random.Random(99)
    boxes = [(rng.uniform(-30,180),rng.uniform(-30,150),rng.uniform(1,60),rng.uniform(1,60)) for _ in range(100)]
    boxes += [(20.,0.,10.,20.), (0.,0.,20.,20.)]
    for bbox in boxes:
        binder.perf_geometry_cache=False; expected=binder._best_arrival_slot(bbox)
        binder.perf_geometry_cache=True; assert_match=binder._best_arrival_slot(bbox)
        assert assert_match == expected
    binding=binder._bindings['0']
    old=binder._cached_slot_geometry(binding)
    binding.polygon += 40
    assert binder._cached_slot_geometry(binding) != old


def test_fast_json_snapshot_is_independent():
    from two_camera import _copy_json_snapshot
    original={'observations':[{'bbox':[1,2,3,4]}], 'slots':{'a':{'occupied':True}}}
    snapshot=_copy_json_snapshot(original)
    original['observations'][0]['bbox'][0]=99
    original['slots']['a']['occupied']=False
    assert snapshot == {'observations':[{'bbox':[1,2,3,4]}], 'slots':{'a':{'occupied':True}}}


def test_cached_event_delta_matches_mutation_and_rolling_overlap():
    from techgar.prediction_writer import _RollingEventDelta
    plain = _RollingEventDelta()
    fast = _RollingEventDelta(cache_fingerprints=True)
    a={'type':'park','details':{'value':1}}
    b={'type':'park','details':{'value':1}}
    for events in ([a], [a,b], [a,b], [b]):
        assert fast.take(events) == plain.take(events)
    b['details']['value']=2
    assert fast.take([b]) == plain.take([b]) == [b]
