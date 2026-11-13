import gzip,json,subprocess,sys
from pathlib import Path

ROOT=Path(__file__).resolve().parents[4]
SCRIPT=ROOT/'.orca/core2/m6l_p28_compact.py'

def test_runtime_source_frame_to_gt_and_old_default(tmp_path):
    source=tmp_path/'source.jsonl'
    source.write_text(json.dumps({'source_frame_idx':1,'observations':[{'observation_kind':'detection','canonical_gid':7}],
                                  'slots':[{'slot_id':'S1','canonical_vehicle_gid':7}]})+'\n')
    old=tmp_path/'old.jsonl';correct=tmp_path/'correct.jsonl'
    for dst,extra in [(old,[]),(correct,['--gt-frame-offset','-1'])]:
        subprocess.run([sys.executable,str(SCRIPT),str(source),str(dst),*extra],check=True,capture_output=True,text=True)
    before=json.loads(old.read_text());after=json.loads(correct.read_text())
    assert before['frame_idx']==2
    assert after['frame_idx']==1  # P28 subtracts 1: source 1 corresponds to GT frame 0.
    assert after['slots']==before['slots'] and after['observations']==before['observations']

def test_gzip_predictions_stream_to_compact(tmp_path):
    source=tmp_path/'source.jsonl.gz';dest=tmp_path/'compact.jsonl'
    with gzip.open(source,'wt',encoding='utf8') as f:f.write(json.dumps({'source_frame_idx':1})+'\n')
    subprocess.run([sys.executable,str(SCRIPT),str(source),str(dest),'--gt-frame-offset','-1'],check=True,capture_output=True,text=True)
    assert json.loads(dest.read_text())['frame_idx']==1
