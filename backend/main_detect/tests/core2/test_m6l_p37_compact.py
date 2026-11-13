import gzip,importlib.util,json
from pathlib import Path
import numpy as np

ROOT=Path(__file__).resolve().parents[4]
def load(name,path):
    spec=importlib.util.spec_from_file_location(name,path);module=importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module);return module
compact=load('m6l_p37_compact',ROOT/'.orca/core2/m6l_p37_compact.py')
p37=load('p37_compact_test',ROOT/'.orca/sim3d/p37_score.py')

def test_compact_preserves_p37_boxes_and_frame(tmp_path):
    row={'frame_idx':1,'source_frame_idx':0,'slots':[{'huge':'ignored'}],
         'observations':[{'canonical_gid':1,'prediction_source':'measurement','bbox':[1,2,3,4],
                          'camera_id':'cam1','track_state':'tracked','local_track_id':8,'extra':'ignored'},
                         {'canonical_gid':None,'prediction_source':'measurement','bbox':[3,4,5,6],'camera_id':'cam1'}]}
    source=tmp_path/'source.gz';dest=tmp_path/'compact.jsonl'
    with gzip.open(source,'wt',encoding='utf8') as f:f.write(json.dumps(row)+'\n')
    assert compact.compact(source,dest)==1
    result=json.loads(dest.read_text());transforms={'cam1':np.eye(3,dtype='float32')}
    assert p37.source_frame(row,1)==p37.source_frame(result,1)
    assert p37.boxes_of(row,transforms,True)==p37.boxes_of(result,transforms,True)

def test_runtime_source_frame_offset_is_explicit(tmp_path):
    source=tmp_path/'source.gz';dest=tmp_path/'compact.jsonl'
    with gzip.open(source,'wt',encoding='utf8') as f:f.write(json.dumps({'frame_idx':1,'source_frame_idx':1,'observations':[]})+'\n')
    compact.compact(source,dest,-1)
    assert p37.source_frame(json.loads(dest.read_text()),1)==0
