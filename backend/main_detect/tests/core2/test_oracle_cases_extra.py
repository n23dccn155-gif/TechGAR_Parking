import csv
import hashlib
import json
import math
from pathlib import Path
from types import SimpleNamespace

import pytest
from techgar.core2 import oracle_cases_extra as extra
from techgar.core2.dump import BlobDumpWriter, read_dump
from techgar.core2.engine_l import EngineLEngine
from techgar.core2.types import Blob

ROOT=Path(__file__).resolve().parents[4]
TRAIN=ROOT/'sim3d/data/runs/20261106-131804_sang_20p'


def make_convoy(tmp_path,monkeypatch,count=220):
    run=tmp_path/'synthetic_train';run.mkdir()
    cars=['V001','V002','V003','V004']
    fields=['frame']+[c+s for c in cars for s in ('_u','_v','_cams')]
    monkeypatch.setattr(extra,'sim_to_world',lambda u,v:(float(u),float(v)))
    dump=tmp_path/'source.gz'
    with (run/'gt_frames.csv').open('w',newline='',encoding='utf8') as f, \
         BlobDumpWriter(dump,video=run.name,stride=1,cameras={0:'cam1',1:'cam2'},
                        core_version='test',provenance='gt_oracle_jitter09') as writer:
        rows=csv.DictWriter(f,fieldnames=fields); rows.writeheader()
        for frame in range(count):
            row={'frame':frame}; blobs=[]
            for i,c in enumerate(cars):
                x=100+20*i+.085*frame; y=100
                row.update({c+'_u':x,c+'_v':y,c+'_cams':'cam1'})
                blobs.append(Blob(0,frame,(frame+1)/25,(180+30*i,100,10,10),(x,y),100,False,1.,None))
            rows.writerow(row);writer.write_step((frame+1)/25,frame+1,frame,{0:blobs,1:[]})
    return run,dump,cars


def steps(path):
    h,it=read_dump(path)
    try: return h,list(it)
    finally: it.close()


def test_queue_seed_labels_recovery_and_engine_gid(tmp_path,monkeypatch):
    run,source,cars=make_convoy(tmp_path,monkeypatch)
    a=tmp_path/'a.gz';b=tmp_path/'b.gz'
    result=extra._queue_case(run,source,a,79001,220)
    result2=extra._queue_case(run,source,b,79001,220)
    assert hashlib.sha256(a.read_bytes()).digest()==hashlib.sha256(b.read_bytes()).digest()
    assert result['episodes']==result2['episodes'] and result['case']=='queue_drop_s79001'
    header,stream=steps(a); _,original=steps(source)
    assert header['provenance']=='gt_oracle_queue_drop'
    episode=result['episodes'][0];start=episode['start_frame'];end=episode['end_frame'];recovery=episode['recovery_frame']
    assert 75<=end-start+1<=100 and recovery==end+1
    affected=set(episode['vehicles']); assert affected
    for frame in range(start,end+1):
        expected=[b for car,b in zip(cars,original[frame]['blobs_by_cam'][0]) if car not in affected]
        assert stream[frame]['blobs_by_cam'][0]==expected
    assert stream[recovery]['blobs_by_cam']==original[recovery]['blobs_by_cam']
    assert all(v==end-start+1 for v in episode['frames_per_vehicle'].values())
    engine=EngineLEngine();seen={}
    for row in stream:
        frame=row['source_frame_idx'];out=engine.step(row['t'],row['frame_idx'],row['blobs_by_cam'])
        if frame in (max(0,start-1),recovery):
            mapping={}
            for i,car in enumerate(cars):
                x=100+20*i+.085*frame
                matched=[o for o in out if o.source=='measured' and math.dist(o.xy,(x,100))<10]
                assert len(matched)==1
                mapping[car]=matched[0].gid
            seen[frame]=mapping
    assert seen[max(0,start-1)]==seen[recovery]
    assert len(set(seen[recovery].values()))==len(cars)


def test_queue_censored_end_is_not_success(tmp_path,monkeypatch):
    run,source,_=make_convoy(tmp_path,monkeypatch,count=75)
    dst=tmp_path/'short.gz'
    with pytest.raises(ValueError,match='KHONG_DU_MAU'):
        extra._queue_case(run,source,dst,79001,75)
    manifest=json.loads(Path(str(dst)+'.episodes.json').read_text(encoding='utf8'))
    assert manifest['episodes']==[] and manifest['censored']
    assert manifest['censored'][0]['reason']=='input_end'
    _,actual=steps(dst);_,base=steps(source)
    assert [s['blobs_by_cam'] for s in actual]==[s['blobs_by_cam'] for s in base]


def test_short_and_misaligned_dump_fail(tmp_path,monkeypatch):
    run,source,_=make_convoy(tmp_path,monkeypatch,count=4)
    p=run/'gt_frames.csv';rows=list(csv.DictReader(p.open(newline='')))
    rows.append({**rows[-1],'frame':'4'})
    with p.open('w',newline='') as f:
        w=csv.DictWriter(f,fieldnames=rows[0].keys());w.writeheader();w.writerows(rows)
    with pytest.raises(ValueError,match='length differ'):
        list(extra._labelled(run,source,5))
    rows[2]['frame']='42'
    with p.open('w',newline='') as f:
        w=csv.DictWriter(f,fieldnames=rows[0].keys());w.writeheader();w.writerows(rows)
    with pytest.raises(ValueError,match='source_frame_idx'):
        list(extra._labelled(run,source,4))


def test_edge_train_seed_and_gt_label_continuity(tmp_path):
    a=tmp_path/'edge1.gz';b=tmp_path/'edge2.gz'
    x=extra.generate(TRAIN,a,'edgeghost30',seed=79001,max_frames=200)
    y=extra.generate(TRAIN,b,'edgeghost30',seed=79001,max_frames=200)
    assert hashlib.sha256(a.read_bytes()).digest()==hashlib.sha256(b.read_bytes()).digest()
    assert x['case']=='edgeghost30_s79001' and x['episodes']==y['episodes']
    assert all(r['end_frame']-r['start_frame']==29 and len(r['vehicles'])==1 for r in x['episodes'])
    assert x['edge_ghosts']==30*len(x['episodes'])
    header, output = steps(a)
    assert header['provenance']=='gt_oracle_edgeghost30'
    source=tmp_path/'base.gz'
    extra.base_generate(TRAIN,source,'jitter09',79001,200)
    base=list(extra._labelled(TRAIN,source,200))
    for episode in x['episodes']:
        cam=int(episode['camera'][-1])-1;car=episode['vehicles'][0];outside=0
        for frame in range(episode['start_frame'],episode['end_frame']+1):
            original=base[frame]['step']['blobs_by_cam'][cam]
            actual=output[frame]['blobs_by_cam'][cam]
            assert actual[:-1]==original
            ghost=actual[-1];ref=base[frame]['blobs'][cam][car]
            assert 5<=math.dist(ghost.xy,ref.xy)<=6
            outside+=ghost.bbox[0]+ghost.bbox[2]/2>800
        assert outside==episode['outside_x_gt_800']


def test_edge_outside_frame_counter(tmp_path,monkeypatch):
    run,source,_=make_convoy(tmp_path,monkeypatch,count=35)
    class FixedRandom:
        def __init__(self,seed): pass
        def shuffle(self,items): items.sort()
        def uniform(self,a,b): return 805.0
    monkeypatch.setattr(extra,'random',SimpleNamespace(Random=FixedRandom))
    monkeypatch.setattr(extra,'_calibration',lambda run:({'cam1':None,'cam2':None},None,None))
    def ghost(ref,transform,cam,px):
        return Blob(cam,ref.frame,ref.t,(px-42.5,0,85,35),(ref.xy[0]+5.5,ref.xy[1]),2975,True,.5,None)
    monkeypatch.setattr(extra,'_edge_ghost',ghost)
    result=extra._edge_case(run,source,tmp_path/'edge.gz',79001,35)
    assert result['edge_ghosts']==30 and result['outside_x_gt_800']==30
    assert result['episodes'][0]['outside_x_gt_800']==30


@pytest.mark.parametrize('folder', ['20261106-174535_sang_60','20261106-201218_toi_30'])
@pytest.mark.parametrize('variant',['real','close'])
def test_oov_pair_gt_and_virtual_timeline(tmp_path,folder,variant):
    run=ROOT/'sim3d/data/runs'/folder;dst=tmp_path/f'{folder}_{variant}.gz'
    result=extra.generate(run,dst,'oov_pair',seed=79001,oov_variant=variant)
    h,rows=steps(dst); info=h['engine_inputs']; ep=result['episodes'][0]
    assert h['provenance']=='gt_oracle_oov_pair'
    hidden=info['first_hidden_frames']; visible=info['first_reappear_frames']
    first,second=info['vehicles']; gap=hidden[second]-hidden[first]
    assert gap<25 if variant=='close' else gap>=25
    assert info['gt_scoring_requires_remap']==(variant=='close')
    assert max(hidden.values()) < min(visible.values())
    assert ep['end_frame']-ep['start_frame']+1==len(rows)
    indexed={r['source_frame_idx']:r for r in rows}
    for frame in range(max(hidden.values()),min(visible.values())):
        assert not any(indexed[frame]['blobs_by_cam'].values())
    assert any(indexed[hidden[first]-1]['blobs_by_cam'].values())
    assert any(indexed[visible[second]]['blobs_by_cam'].values())


def test_unknown_case_and_oov_short_fail(tmp_path):
    with pytest.raises(ValueError,match='unknown'):
        extra.generate_extra(TRAIN,tmp_path/'x.gz','invalid')
    run=ROOT/'sim3d/data/runs/20261106-174535_sang_60'
    with pytest.raises(ValueError,match='KHONG_DU_MAU'):
        extra.generate(run,tmp_path/'short.gz','oov_pair',max_frames=30)


def make_barrier(tmp_path,monkeypatch,arrival=50,a_last=119):
    run=tmp_path/f'synthetic_barrier_{arrival}';run.mkdir()
    cfg=run/'techgar_config';cfg.mkdir()
    (cfg/'gate_zones.json').write_text(json.dumps({'entry_gate':{'p1':{'x':46,'y':95},'p2':{'x':46,'y':105}}}))
    monkeypatch.setattr(extra,'sim_to_world',lambda u,v:(float(u),float(v)))
    path=tmp_path/f'barrier_source_{arrival}.gz';fields=['frame']+[c+s for c in ('A','B') for s in ('_u','_v','_cams')]
    with (run/'gt_frames.csv').open('w',newline='') as f, \
         BlobDumpWriter(path,video=run.name,stride=1,cameras={0:'cam1',1:'cam2'},
                        core_version='test',provenance='gt_oracle_jitter09') as writer:
        w=csv.DictWriter(f,fieldnames=fields);w.writeheader()
        for frame in range(120):
            row={'frame':frame};blobs=[]
            if frame<=a_last:
                row.update({'A_u':60,'A_v':100,'A_cams':'cam1'})
                blobs.append(Blob(0,frame,(frame+1)/25,(200,100,10,10),(60.,100.),100,False,1.,None))
            if frame>=arrival:
                x=70-.12*(frame-arrival)
                row.update({'B_u':x,'B_v':100,'B_cams':'cam1'})
                blobs.append(Blob(0,frame,(frame+1)/25,(250,100,10,10),(x,100.),100,False,1.,None))
            w.writerow(row);writer.write_step((frame+1)/25,frame+1,frame,{0:blobs,1:[]})
    return run,path


def test_barrier_real_queue_no_identity_mix(tmp_path,monkeypatch):
    run,source=make_barrier(tmp_path,monkeypatch);dst=tmp_path/'barrier.gz'
    result=extra._barrier_case(run,source,dst,79001,120)
    again=tmp_path/'barrier_repeat.gz'
    repeat=extra._barrier_case(run,source,again,79001,120)
    assert result['episodes']==repeat['episodes']
    assert hashlib.sha256(dst.read_bytes()).digest()==hashlib.sha256(again.read_bytes()).digest()
    ep=result['episodes'][0]
    assert result['case']=='barrier_queue_s79001' and ep['variant']=='real'
    assert ep['start_frame']==50 and 1<=ep['dropped_frames']<=3 and ep['distance_cm']<=12
    assert ep['vehicles']==['A','B'] and ep['removed_blobs_by_camera']['cam1']==ep['dropped_frames']
    header,stream=steps(dst);assert header['provenance']=='gt_oracle_barrier_queue'
    engine=EngineLEngine(entry_gate=((46.,95.),(46.,105.))); ids={'A':set(),'B':set()}
    for row in stream[:ep['recovery_frame']+9]:
        frame=row['source_frame_idx'];outputs=engine.step(row['t'],row['frame_idx'],row['blobs_by_cam'])
        for name,xy in [('A',(60.,100.)),('B',(70-.12*(frame-50),100.))]:
            if name=='B' and frame<53:continue
            matches=[o.gid for o in outputs if o.source=='measured' and math.dist(o.xy,xy)<4]
            if matches: ids[name].update(matches)
    assert len(ids['A'])==len(ids['B'])==1 and ids['A'].isdisjoint(ids['B'])
    shifted=extra._barrier_case(run,source,tmp_path/'forced_shift.gz',79001,120,force_shifted=True)
    assert shifted['episodes'][0]['variant']=='time_shifted'
    assert shifted['episodes'][0]['source_frame_offsets']['B']>0


def test_barrier_shifted_gt_and_empty_fail(tmp_path,monkeypatch):
    run,source=make_barrier(tmp_path,monkeypatch,arrival=80,a_last=69);dst=tmp_path/'shift.gz'
    result=extra._barrier_case(run,source,dst,79001,120);ep=result['episodes'][0]
    assert ep['variant']=='time_shifted' and ep['gt_scoring_requires_remap']
    assert 1<=ep['source_frame_offsets']['B']<=50 and ep['distance_cm']<=12
    assert steps(dst)[0]['engine_inputs']['source_frame_offsets']['B']==ep['source_frame_offsets']['B']
    run2,source2=make_barrier(tmp_path,monkeypatch,arrival=999)
    with pytest.raises(ValueError,match='KHONG_DU_MAU'):
        extra._barrier_case(run2,source2,tmp_path/'none.gz',79001,120)


def test_gt_only_scan_matches_queue_generator_fixture(tmp_path,monkeypatch):
    import importlib.util
    run,source,_=make_convoy(tmp_path,monkeypatch)
    root=tmp_path/'scanroot';target=root/'sim3d/data/runs'/run.name;target.parent.mkdir(parents=True)
    run.rename(target);cfg=target/'techgar_config';cfg.mkdir()
    (cfg/'gate_zones.json').write_text(json.dumps({'entry_gate':{'p1':{'x':100,'y':95},'p2':{'x':100,'y':105}}}))
    spec=importlib.util.spec_from_file_location('scan_gt_fixture',ROOT/'.orca/core2/oracle_extra_scan_gt.py')
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
    monkeypatch.setattr(module,'ROOT',root);out=root/'out';out.mkdir();monkeypatch.setattr(module,'OUT',out)
    monkeypatch.setattr(module,'sim_to_world',lambda u,v:(float(u),float(v)))
    module.scan('fixture',target.name)
    scanned=json.loads((out/'queue_drop_fixture.episodes.json').read_text())
    generated=extra._queue_case(target,source,tmp_path/'check.gz',79001,220)
    assert scanned['episodes']==generated['episodes']
    assert scanned['censored']==generated['censored']


@pytest.mark.parametrize('arrival,a_last',[(50,119),(80,69)])
def test_gt_only_scan_matches_barrier_generator(tmp_path,monkeypatch,arrival,a_last):
    import importlib.util
    run,source=make_barrier(tmp_path,monkeypatch,arrival=arrival,a_last=a_last)
    root=tmp_path/'scanroot';target=root/'sim3d/data/runs'/run.name;target.parent.mkdir(parents=True)
    run.rename(target)
    spec=importlib.util.spec_from_file_location('scan_barrier_fixture',ROOT/'.orca/core2/oracle_extra_scan_gt.py')
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
    monkeypatch.setattr(module,'ROOT',root);out=root/'out';out.mkdir();monkeypatch.setattr(module,'OUT',out)
    monkeypatch.setattr(module,'sim_to_world',lambda u,v:(float(u),float(v)))
    module.scan('fixture',target.name)
    scanned=json.loads((out/'barrier_queue_fixture.episodes.json').read_text())
    result=extra._barrier_case(target,source,tmp_path/'barrier_check.gz',79001,120)
    ep=result['episodes'][0]
    candidate=scanned['episodes'][0] if scanned['episodes'] else scanned['first_shifted_candidate']
    assert (candidate['frame'],candidate['A'],candidate['B'])==(ep['start_frame'],*ep['vehicles'])
    assert candidate.get('shift_frames',0)==ep['source_frame_offsets']['B']
