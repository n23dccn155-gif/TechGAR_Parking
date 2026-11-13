import importlib.util,json,sys
from pathlib import Path
from types import SimpleNamespace
import pytest

ROOT=Path(__file__).resolve().parents[4]
spec=importlib.util.spec_from_file_location('accept_final_test',ROOT/'.orca/core2/accept_final.py')
mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod)


def test_dry_run_is_read_only_and_never_launches(monkeypatch,tmp_path,capsys):
    monkeypatch.setattr(mod,'OUTPUT',tmp_path/'not-created')
    fixed={str(mod.ENGINE.relative_to(ROOT)):'a'*64,str(mod.DUMP.relative_to(ROOT)):'b'*64,
           str(mod.EXTRA.relative_to(ROOT)):'c'*64}
    monkeypatch.setattr(mod,'hashes',lambda:fixed)
    monkeypatch.setattr(mod,'flags',lambda p:{'S1':'NOT_DECLARED'})
    monkeypatch.setattr(mod,'disk_free',lambda:{'C:':7*1024**3,'D:':8*1024**3})
    monkeypatch.setattr(mod,'event_log',lambda baseline:[])
    monkeypatch.setattr(mod.subprocess,'Popen',lambda *a,**k:pytest.fail('dry run launched a process'))
    monkeypatch.setattr(sys,'argv',['accept_final.py','--dry-run'])
    assert mod.main()==2
    result=capsys.readouterr().out
    assert 'Old TEST oracle matrix disabled' in result
    assert 'G1-G6 is not yet implemented' in result and 'no steps launched' in result
    assert not (tmp_path/'not-created').exists()


def test_resume_requires_hashes_of_inputs_and_all_artifacts(tmp_path):
    artifact=tmp_path/'score.json';artifact.write_text('{}')
    inputs={'engine':'a'}
    row={'status':'PASS','inputs':inputs,'artifacts':{str(artifact):mod.digest(artifact)}}
    assert mod.valid_completed(row,inputs)
    assert not mod.valid_completed(row,{'engine':'b'})
    assert not mod.valid_completed(row,inputs,{'test_gt':'changed'})
    artifact.write_text('{"modified":true}')
    assert not mod.valid_completed(row,inputs)
    artifact.unlink()
    assert not mod.valid_completed(row,inputs)


def test_guard_enforces_strict_resource_limits_and_existing_lock(monkeypatch,tmp_path):
    monkeypatch.setattr(mod,'LOCK',tmp_path/'lock')
    monkeypatch.setattr(mod,'available_ram',lambda:mod.MIN_RAM)
    monkeypatch.setattr(mod,'output_drive',lambda p:'C:')
    monkeypatch.setattr(mod,'event_log',lambda baseline:[])
    monkeypatch.setattr(mod,'disk_free',lambda:{'C:':mod.MIN_DISK,'D:':mod.MIN_DISK_D+1})
    with pytest.raises(RuntimeError,match='guard'):mod.guard()
    monkeypatch.setattr(mod,'available_ram',lambda:mod.MIN_RAM+1)
    mod.guard()  # C may equal 6 GiB; D must exceed 8 GiB
    monkeypatch.setattr(mod,'disk_free',lambda:{'C:':mod.MIN_DISK-1,'D:':mod.MIN_DISK_D+1})
    with pytest.raises(RuntimeError,match='guard'):mod.guard()
    monkeypatch.setattr(mod,'disk_free',lambda:{'C:':mod.MIN_DISK,'D:':mod.MIN_DISK_D})
    with pytest.raises(RuntimeError,match='guard'):mod.guard()
    monkeypatch.setattr(mod,'disk_free',lambda:{'C:':mod.MIN_DISK,'D:':mod.MIN_DISK_D+1})
    mod.LOCK.write_text('other owner')
    with pytest.raises(RuntimeError,match='RUNTIME.lock'):mod.guard()


def test_test_env_only_available_in_final_matrix():
    assert mod.ENV not in mod.child_environment('ordinary',{mod.ENV:'1','X':'x'})
    assert mod.ENV not in mod.child_environment('synthetic_train',{mod.ENV:'1','X':'x'})
    with pytest.raises(RuntimeError,match='blocked'):mod.child_environment('matrix',{})
    with pytest.raises(RuntimeError,match='blocked'):mod.child_environment('matrix',{mod.ENV:'true'})
    assert mod.child_environment('matrix',{mod.ENV:'1'})[mod.ENV]=='1'


@pytest.mark.parametrize('worker',['matrix','regress','synthetic'])
@pytest.mark.parametrize('allowed',[None,'1'])
def test_old_oracle_workers_disabled_even_with_test_authorization(monkeypatch,tmp_path,worker,allowed):
    if allowed is None:monkeypatch.delenv(mod.ENV,raising=False)
    else:monkeypatch.setenv(mod.ENV,allowed)
    monkeypatch.setattr(sys,'argv',['accept_final.py','--_worker',worker,'--_out',str(tmp_path)])
    with pytest.raises(RuntimeError,match='old oracle matrix disabled pending replacement G1-G6'):
        mod.main()
    assert list(tmp_path.iterdir())==[]


def test_queue_sampling_is_reproducible_and_stratified():
    episodes=[{'start_frame':i*200,'end_frame':i*200+n-1} for i,n in enumerate([75,85,95]*20)]
    selected=mod.stratified_queue(episodes,79001)
    assert len(selected)==30 and selected==mod.stratified_queue(episodes,79001)
    lengths=[e['end_frame']-e['start_frame']+1 for e in selected]
    assert (lengths.count(75),lengths.count(85),lengths.count(95))==(10,10,10)
    with pytest.raises(ValueError,match='duration'):
        mod.stratified_queue([{'start_frame':0,'end_frame':1}],79001)


def test_barrier_synthetic_gate_is_mix_only():
    assert mod.cell_passes('barrier_queue',{'IDSW_meas':30,'FRAG':20,'MIX':0})
    assert not mod.cell_passes('barrier_queue',{'IDSW_meas':0,'FRAG':0,'MIX':1})
    assert not mod.cell_passes('perfect',{'IDSW_meas':1,'FRAG':0,'MIX':0})
    assert not mod.cell_passes('queue_drop',{'IDSW_meas':5,'FRAG':0,'MIX':0})


def test_barrier_audit_includes_stationary_A_and_requires_evidence():
    ep={'dropped_vehicle':'A','entering_vehicle':'B','start_frame':50,'recovery_frame':52}
    good=mod.barrier_gid_summary([(49,{'A':1}),(52,{'A':1,'B':2})],ep)
    assert good['evidence_complete'] and good['mix']==0
    wrong=mod.barrier_gid_summary([(49,{'A':1}),(52,{'A':3,'B':1})],ep)
    assert wrong['evidence_complete'] and wrong['mix']==1
    missing=mod.barrier_gid_summary([(49,{'A':1}),(52,{'A':1})],ep)
    assert not missing['evidence_complete']


def test_disabled_acceptance_stops_before_result_directory_is_created(monkeypatch,tmp_path):
    fixed={str(mod.ENGINE.relative_to(ROOT)):'a'*64,str(mod.DUMP.relative_to(ROOT)):'b'*64,
           str(mod.EXTRA.relative_to(ROOT)):'c'*64}
    monkeypatch.setattr(mod,'OUTPUT',tmp_path/'missing');monkeypatch.setattr(mod,'hashes',lambda:fixed)
    monkeypatch.setattr(mod,'flags',lambda p:{})
    monkeypatch.setattr(mod,'disk_free',lambda:{'C:':7*1024**3,'D:':7*1024**3})
    monkeypatch.setattr(mod,'event_log',lambda baseline:[])
    monkeypatch.setattr(mod,'guard',lambda:(_ for _ in ()).throw(RuntimeError('disk guard')))
    monkeypatch.setattr(sys,'argv',['accept_final.py','--engine-sha256','a'*64])
    assert mod.main()==2
    assert not (tmp_path/'missing').exists()


def test_disabled_acceptance_does_not_run_with_or_without_hash(monkeypatch,tmp_path):
    fixed={str(mod.ENGINE.relative_to(ROOT)):'a'*64,str(mod.DUMP.relative_to(ROOT)):'b'*64,
           str(mod.EXTRA.relative_to(ROOT)):'c'*64}
    monkeypatch.setattr(mod,'OUTPUT',tmp_path/'missing');monkeypatch.setattr(mod,'hashes',lambda:fixed)
    monkeypatch.setattr(mod,'flags',lambda p:{})
    monkeypatch.setattr(sys,'argv',['accept_final.py'])
    assert mod.main()==2
    monkeypatch.setattr(sys,'argv',['accept_final.py','--engine-sha256','b'*64])
    assert mod.main()==2
    assert not (tmp_path/'missing').exists()


def test_worker_rejects_test_matrix_without_explicit_env(monkeypatch,tmp_path):
    monkeypatch.delenv(mod.ENV,raising=False)
    monkeypatch.setattr(sys,'argv',['accept_final.py','--_worker','matrix','--_out',str(tmp_path)])
    with pytest.raises(RuntimeError,match='old oracle matrix disabled pending replacement G1-G6'):mod.main()
    assert list(tmp_path.iterdir())==[]


def test_train_synthetic_worker_rejects_test_environment(monkeypatch,tmp_path):
    monkeypatch.setenv(mod.ENV,'1')
    monkeypatch.setattr(sys,'argv',['accept_final.py','--_worker','synthetic','--_out',str(tmp_path)])
    with pytest.raises(RuntimeError,match='old oracle matrix disabled pending replacement G1-G6'):mod.main()
    assert list(tmp_path.iterdir())==[]


def test_interruption_cleanup_only_owns_named_temporary_files(monkeypatch,tmp_path):
    monkeypatch.setattr(mod,'OUTPUT',tmp_path)
    folder=tmp_path/'hash';folder.mkdir();key='04_79001_sang_5p_queue_drop'
    temporary=folder/(key+'.pred.tmp.jsonl');temporary.write_text('partial')
    unrelated=folder/'user.txt';unrelated.write_text('keep')
    mod.cleanup_interrupted({'id':key,'output':folder/(key+'.json')})
    assert not temporary.exists() and unrelated.read_text()=='keep'
    with pytest.raises(ValueError):
        mod.cleanup_interrupted({'id':key,'output':tmp_path.parent/'outside.json'})


def test_offline_engine_replay_offsets_and_gzip(tmp_path):
    import gzip
    from techgar.core2.dump import BlobDumpWriter
    from techgar.core2.types import Blob
    run=tmp_path/'train_fixture';run.mkdir();cfg=run/'techgar_config';cfg.mkdir()
    (cfg/'calibration.json').write_text(json.dumps({'camera_transforms':{'cam1':[[1,0,0],[0,1,0],[0,0,1]]}}))
    (cfg/'gate_zones.json').write_text(json.dumps({'entry_gate':{'p1':{'x':46,'y':-4},'p2':{'x':46,'y':-15}}}))
    dump=tmp_path/'source.gz';out=tmp_path/'prediction.gz'
    with BlobDumpWriter(dump,video=run.name,stride=1,cameras={0:'cam1'},core_version='test') as writer:
        writer.write_step(.04,1,1,{0:[Blob(0,1,.04,(100,100,10,10),(10.,20.),100,False,1.,None)]})
        writer.write_step(.08,2,2,{0:[]})
    result=mod.replay_to_gzip(run,dump,out,{},-1)
    with gzip.open(out,'rt') as f: rows=[json.loads(x) for x in f]
    assert result=={'frames':2,'first_gt_frame':0,'last_gt_frame':1}
    assert rows[0]['observations'][0]['prediction_source']=='measurement'
    assert rows[1]['observations'][0]['prediction_source']=='held'


def test_queue_sampling_restores_unselected_episodes(tmp_path,monkeypatch):
    import shutil
    from techgar.core2 import oracle_dump
    from techgar.core2.dump import BlobDumpWriter,read_dump
    from techgar.core2.types import Blob
    run=tmp_path/'train';run.mkdir();base=tmp_path/'base.gz';full=tmp_path/'full.gz';sample=tmp_path/'sample.gz'
    episodes=[{'start_frame':i*90,'end_frame':i*90+74} for i in range(31)]
    def make(path,drop):
        with BlobDumpWriter(path,video=run.name,stride=1,cameras={0:'cam1'},core_version='test',provenance='gt_oracle_queue_drop') as w:
            for frame in range(31*90):
                blob=Blob(0,frame,(frame+1)/25,(100,100,10,10),(10.,20.),100,False,1.,None)
                missing=drop and any(e['start_frame']<=frame<=e['end_frame'] for e in episodes)
                w.write_step((frame+1)/25,frame+1,frame,{0:[] if missing else [blob]})
    make(base,False);make(full,True)
    monkeypatch.setattr(oracle_dump,'generate',lambda run,dest,case,seed:shutil.copyfile(base,dest))
    selected=mod.sample_queue(run,full,{'episodes':episodes},sample,79001)
    assert len(selected)==30
    _,it=read_dump(sample)
    try:
        for row in it:
            expected=any(e['start_frame']<=row['source_frame_idx']<=e['end_frame'] for e in selected)
            assert (not row['blobs_by_cam'][0])==expected
    finally:it.close()


def test_oov_pair_discovery_gt_only_and_test_guard(tmp_path,monkeypatch):
    import csv
    from techgar.core2 import oracle_dump
    run=tmp_path/'train';run.mkdir();monkeypatch.setattr(oracle_dump,'sim_to_world',lambda u,v:(u,v))
    with (run/'gt_frames.csv').open('w',newline='') as f:
        fields=['frame','A_u','A_v','A_cams','B_u','B_v','B_cams'];w=csv.DictWriter(f,fieldnames=fields);w.writeheader()
        for frame in range(200):
            w.writerow({'frame':frame,'A_u':-70,'A_v':-40,'A_cams':'' if 60<=frame<150 else 'cam1',
                        'B_u':-70,'B_v':-40,'B_cams':'' if 100<=frame<180 else 'cam1'})
    assert mod.select_oov_pair(run)==('A','B',60,100,150,180)
    monkeypatch.delenv(mod.ENV,raising=False)
    with pytest.raises(RuntimeError,match='TEST'):
        mod.select_oov_pair(tmp_path/'20261106-130217_sang_5p')


def test_synthetic_barrier_routes_through_remap_and_separate_gate(tmp_path,monkeypatch):
    from techgar.core2 import oracle_cases_extra
    called={}
    def generate(run,dest,case,seed,**kwargs):
        called['variant']=kwargs['barrier_variant'];dest.write_bytes(b'test')
        return {'gt_scoring_requires_remap':True,'episodes':[{'dropped_vehicle':'A','entering_vehicle':'B',
                    'start_frame':50,'recovery_frame':52}]}
    monkeypatch.setattr(oracle_cases_extra,'generate',generate)
    monkeypatch.setattr(mod,'TEST_RUNS',{'train':'train_fixture'})
    def replay(run,dump,gz,params,offset):gz.write_bytes(b'test');return {'frames':2,'first_gt_frame':0,'last_gt_frame':1}
    monkeypatch.setattr(mod,'replay_to_gzip',replay)
    monkeypatch.setattr(mod,'gunzip',lambda gz,plain:plain.write_text('{}'))
    def virtual(run,pred,dump):called['remap']=True;return {'IDSW_meas':9,'FRAG':9,'MIX':0}
    monkeypatch.setattr(mod,'score_virtual',virtual)
    monkeypatch.setattr(mod,'audit_barrier',lambda *a:{'evidence_complete':True,'mix':0})
    args=SimpleNamespace(_worker='matrix',_out=tmp_path,_run='train',_case='barrier_queue',_seed=79001)
    assert mod.worker(args,{})==0
    result=json.loads((tmp_path/'04_79001_train_barrier_queue.json').read_text())
    assert called=={'variant':'shifted','remap':True}
    assert result['gate']=='PASS' and result['category']=='ca tong hop'
    assert not list(tmp_path.glob('*.tmp*'))


@pytest.mark.parametrize('case,variant',[('oov_pair_real','real'),('oov_pair_close','close')])
def test_oov_train_routes_through_remap_as_synthetic(tmp_path,monkeypatch,case,variant):
    from techgar.core2 import oracle_cases_extra
    seen={}
    def generate(run,dest,kind,seed,**kwargs):
        seen['variant']=kwargs['oov_variant'];seen['run']=run.name;dest.write_bytes(b'test')
        return {'gt_scoring_requires_remap':variant=='close','episodes':[{'vehicles':['A','B']}]}
    monkeypatch.setattr(oracle_cases_extra,'generate',generate)
    monkeypatch.setattr(mod,'TRAIN_OOV_RUNS',{'train':'train_fixture'})
    def replay(run,dump,gz,params,offset):gz.write_bytes(b'test');return {'frames':2,'first_gt_frame':0,'last_gt_frame':1}
    monkeypatch.setattr(mod,'replay_to_gzip',replay)
    monkeypatch.setattr(mod,'gunzip',lambda gz,plain:plain.write_text('{}'))
    def virtual(run,pred,dump):seen['remap']=True;return {'IDSW_meas':0,'FRAG':0,'MIX':0}
    monkeypatch.setattr(mod,'score_virtual',virtual)
    args=SimpleNamespace(_worker='synthetic',_out=tmp_path,_run='train',_case=case,_seed=79001)
    assert mod.worker(args,{})==0
    result=json.loads((tmp_path/f'04_79001_train_{case}.json').read_text())
    assert seen=={'variant':variant,'run':'train_fixture','remap':True}
    assert result['gate']=='PASS' and result['category']=='ca tong hop'


def test_guard_rejects_non_c_output_and_new_event(monkeypatch,tmp_path):
    monkeypatch.setattr(mod,'LOCK',tmp_path/'lock')
    monkeypatch.setattr(mod,'available_ram',lambda:mod.MIN_RAM+1)
    monkeypatch.setattr(mod,'disk_free',lambda:{'C:':mod.MIN_DISK,'D:':mod.MIN_DISK_D+1})
    monkeypatch.setattr(mod,'output_drive',lambda path:'E:')
    with pytest.raises(RuntimeError,match='must be on C: or D:'):mod.guard()
    monkeypatch.setattr(mod,'output_drive',lambda path:'C:')
    monkeypatch.setattr(mod,'event_log',lambda baseline:[{'Id':51,'ProviderName':'disk'}])
    with pytest.raises(mod.DiskEventError,match='51'):mod.guard()
    monkeypatch.setattr(mod,'event_log',lambda baseline:(_ for _ in ()).throw(mod.EventLogError('denied')))
    with pytest.raises(mod.EventLogError,match='denied'):mod.guard()


def test_event_query_uses_exclusive_local_baseline_and_fails_closed(monkeypatch):
    calls=[]
    def run(cmd,**kwargs):
        calls.append((cmd,kwargs))
        return SimpleNamespace(returncode=0,stdout='[{"Id":51}]',stderr='')
    monkeypatch.setattr(mod.subprocess,'run',run)
    assert mod.event_log('2026-11-12 13:44:00')==[{'Id':51}]
    cmd,kwargs=calls[0]
    assert kwargs['env']['TECHGAR_EVENT_BASELINE']=='2026-11-12 13:44:00'
    assert '$_.TimeCreated -gt $start' in cmd[-1]
    assert 'Id -eq 51' in cmd[-1] and '50,140' in cmd[-1]
    monkeypatch.setattr(mod.subprocess,'run',lambda *a,**k:SimpleNamespace(returncode=1,stdout='',stderr='access denied'))
    with pytest.raises(mod.EventLogError,match='access denied'):mod.event_log(mod.DEFAULT_BASELINE)


def test_disabled_acceptance_does_not_launch_oracle_even_when_authorized(monkeypatch,tmp_path):
    monkeypatch.setenv(mod.ENV,'1')
    monkeypatch.setattr(mod,'OUTPUT',tmp_path/'not-created')
    monkeypatch.setattr(mod.subprocess,'Popen',lambda *a,**k:pytest.fail('disabled acceptance launched a process'))
    monkeypatch.setattr(sys,'argv',['accept_final.py','--engine-sha256','a'*64])
    assert mod.main()==2
    assert not (tmp_path/'not-created').exists()

