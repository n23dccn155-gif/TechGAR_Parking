import csv, importlib.util, json
from pathlib import Path
import pytest

ROOT=Path(__file__).resolve().parents[4]
spec=importlib.util.spec_from_file_location('score_remap_test',ROOT/'.orca/core2/score_remap.py')
mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod)


def test_remap_original_p37_matches_perfect_labeled_fixture(tmp_path):
    cfg=tmp_path/'techgar_config';cfg.mkdir()
    (cfg/'calibration.json').write_text(json.dumps({'camera_transforms':{'cam1':[[1,0,0],[0,1,0],[0,0,1]]}}))
    gt=tmp_path/'gt_frames.csv';fields=['frame','A_u','A_v','A_cams','B_u','B_v','B_cams']
    with gt.open('w',newline='') as f:
        w=csv.DictWriter(f,fieldnames=fields);w.writeheader()
        for frame in range(60):w.writerow({'frame':frame,'A_u':100+frame*3,'A_v':300,'A_cams':'cam1',
                                          'B_u':400+frame*3,'B_v':300,'B_cams':'cam1'})
    p37spec=importlib.util.spec_from_file_location('p37_fixture',mod.P37)
    p37=importlib.util.module_from_spec(p37spec);p37spec.loader.exec_module(p37)
    pred=tmp_path/'predictions.jsonl'
    with pred.open('w') as f:
        for frame in range(6,40):
            obs=[]
            for gid,u in ((1,100+frame*3),(2,400+(frame+10)*3)):
                x,y=p37.sim_to_tech(*p37.unproject(u,300))
                obs.append({'camera_id':'cam1','canonical_gid':gid,'local_track_id':gid,
                            'bbox':[x-.5,y-.5,1,1],'prediction_source':'measurement'})
            f.write(json.dumps({'frame_idx':frame+1,'source_frame_idx':frame,'observations':obs})+'\n')
    meta=tmp_path/'manifest.json';meta.write_text(json.dumps({'gt_scoring_requires_remap':True,
        'source_frame_offsets':{'A':0,'B':10},'vehicles':['A','B'],'truth_rule':'only listed vehicles'}))
    with pytest.raises(ValueError,match='GT remap required'):
        mod.score(tmp_path,pred,meta)
    result=mod.score(tmp_path,pred,meta,apply_remap=True)
    assert (result['IDSW_meas'],result['FRAG'],result['MIX'])==(0,0,0)
    assert result['recall']==1 and result['IDF1']==1
    from techgar.core2.dump import BlobDumpWriter
    dump=tmp_path/'dump.jsonl.gz'
    with BlobDumpWriter(dump,video='fixture',stride=1,cameras={0:'cam1'},core_version='test',
                        provenance='gt_oracle_oov_pair',engine_inputs=json.loads(meta.read_text())):
        pass
    same=mod.score(tmp_path,pred,dump,apply_remap=True)
    assert (same['IDSW_meas'],same['FRAG'],same['MIX'],same['IDF1'])==(0,0,0,1)


def test_bad_or_contradictory_offsets_are_rejected(tmp_path):
    path=tmp_path/'m.json'
    path.write_text(json.dumps({'gt_scoring_requires_remap':False,'source_frame_offsets':{'A':5}}))
    with pytest.raises(ValueError,match='contradict'):
        mod.read_metadata(path)
    path.write_text(json.dumps({'gt_scoring_requires_remap':True,'source_frame_offsets':{'A':True}}))
    with pytest.raises(ValueError,match='integer'):
        mod.read_metadata(path)
