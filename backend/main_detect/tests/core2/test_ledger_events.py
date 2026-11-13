import csv, json, sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[4]/'.orca/core2'))
import ledger_events
import ledger_run
import ledger_finish
import idf1_all_visible as visible
import pytest


def test_p37_switch_frag_and_blobless_lifecycle(tmp_path):
    cfg=tmp_path/'techgar_config';cfg.mkdir()
    (cfg/'calibration.json').write_text(json.dumps({'camera_transforms':{'cam1':[[1,0,0],[0,1,0],[0,0,1]]}}))
    (tmp_path/'gt_events.csv').write_text('car,initial_parked,parked_frame,depart_frame\nA,0,,\n')
    with (tmp_path/'gt_frames.csv').open('w',newline='') as f:
        writer=csv.DictWriter(f,fieldnames=['frame','A_u','A_v','A_cams']);writer.writeheader()
        for frame in range(70):writer.writerow({'frame':frame,'A_u':320+frame,'A_v':320,'A_cams':'cam1'})
    pred=tmp_path/'pred.jsonl'
    with pred.open('w') as f:
        for frame in range(70):
            x,y=visible.sim_to_world(320+frame,320)
            obs=[] if frame>=10 else [{'canonical_gid':1 if frame<7 else 2,'prediction_source':'measurement','camera_id':'cam1','bbox':[x-1,y-1,2,2]}]
            f.write(json.dumps({'frame_idx':frame+1,'source_frame_idx':frame,'observations':obs})+'\n')
    events=ledger_events.extract(tmp_path,pred)
    assert [(e['type'],e['frame']) for e in events if e['type'] in ('IDSW_meas','FRAG')]==[('IDSW_meas',7),('FRAG',7)]
    assert any(e['type']=='visible_without_gid_gt_2s' and e['start_frame']==10 for e in events)


def test_only_two_analysis_runs_accept_test_authorization(monkeypatch,tmp_path):
    run=tmp_path/'20261106-130217_sang_5p';dump=tmp_path/'sang_5p_m1lv2.jsonl.gz'
    monkeypatch.setattr(ledger_run,'LEDGER',tmp_path)
    monkeypatch.delenv('TECHGAR_ALLOW_TEST_RUNS',raising=False)
    with pytest.raises(RuntimeError,match='require'):ledger_run.check_scope(run,dump)
    monkeypatch.setenv('TECHGAR_ALLOW_TEST_RUNS','1')
    with pytest.raises(RuntimeError,match='marker missing'):ledger_run.check_scope(run,dump)
    (tmp_path/'sang_5p.dump.done').write_text('done')
    ledger_run.check_scope(run,dump)
    with pytest.raises(RuntimeError,match='sealed'):
        ledger_run.check_scope(tmp_path/'20261106-131033_sang_10p',tmp_path/'sang_10p.gz')
    with pytest.raises(RuntimeError,match='does not match'):
        ledger_run.check_scope(run,tmp_path/'toi_5p_m1lv2.jsonl.gz')


def test_overlap_episode_records_pair_even_without_identity_error(tmp_path):
    cfg=tmp_path/'techgar_config';cfg.mkdir()
    (cfg/'calibration.json').write_text(json.dumps({'camera_transforms':{'cam1':[[1,0,0],[0,1,0],[0,0,1]],'cam2':[[1,0,0],[0,1,0],[0,0,1]]}}))
    (tmp_path/'gt_events.csv').write_text('car,color\nA,gray\nB,gray\n')
    with (tmp_path/'gt_frames.csv').open('w',newline='') as f:
        w=csv.DictWriter(f,fieldnames=['frame','A_u','A_v','A_cams','B_u','B_v','B_cams']);w.writeheader()
        for frame in range(3):w.writerow({'frame':frame,'A_u':320,'A_v':320,'A_cams':'cam1+cam2','B_u':321,'B_v':320,'B_cams':'cam1+cam2'})
    pred=tmp_path/'pred.jsonl';pred.write_text(''.join(json.dumps({'frame_idx':i+1,'source_frame_idx':i,'observations':[]})+'\n' for i in range(3)))
    pairs=[];ledger_events.extract(tmp_path,pred,pair_report=pairs)
    assert len(pairs)==1 and pairs[0]['cars']==['A','B']
    assert (pairs[0]['start_frame'],pairs[0]['end_frame'])==(0,2)
    assert pairs[0]['colors']==['gray','gray']


def test_p28_input_labels_only_measurements_as_detections(tmp_path,monkeypatch):
    from types import SimpleNamespace
    source=tmp_path/'p.jsonl';source.write_text(json.dumps({'frame_idx':1,'observations':[
        {'prediction_source':'measurement'},{'prediction_source':'held'}]})+'\n')
    def score(run,path,**kwargs):
        row=json.loads(path.read_text())
        assert [x['observation_kind'] for x in row['observations']]==['detection','prediction']
        return {'ok':True}
    monkeypatch.setattr(ledger_finish.accept,'load_module',lambda *a:SimpleNamespace(run_case=score))
    result=ledger_finish.score_p28(tmp_path,source,tmp_path)
    assert result['ok'] and not (tmp_path/'p28_input.tmp.jsonl').exists()
