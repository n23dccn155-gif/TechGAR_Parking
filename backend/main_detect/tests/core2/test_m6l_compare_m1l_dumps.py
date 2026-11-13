import gzip,importlib.util,json
from pathlib import Path

ROOT=Path(__file__).resolve().parents[4]
spec=importlib.util.spec_from_file_location('m6l_compare_m1l',ROOT/'.orca/core2/m6l_compare_m1l_dumps.py')
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)

def write(path,desc,xy=(1.,2.),t=1.):
    with gzip.open(path,'wt',encoding='utf8') as f:
        f.write(json.dumps({'type':'header','video':'fixture'})+'\n')
        f.write(json.dumps({'source_frame_idx':1,'frame_idx':1,'t':t,'blobs_by_cam':{'0':[{'xy':xy,'bbox':[1,2,3,4],'frame':1,'t':t,'desc':desc}]}})+'\n')

def test_comparison_reports_descriptor_and_measurement_differences(tmp_path):
    a=tmp_path/'a.gz';b=tmp_path/'b.gz';write(a,None);write(b,[1.,0.])
    result=module.compare(a,b)
    assert not result['strict_equal'] and result['measurement_equal']
    assert result['descriptor_different_frames']==1
    write(b,[1.,0.],xy=(2.,2.))
    assert not module.compare(a,b)['measurement_equal']

def test_compare_aligns_by_source_frame_after_a_drop(tmp_path):
    a=tmp_path/'a.gz';b=tmp_path/'b.gz'
    def make(path,frames):
        with gzip.open(path,'wt',encoding='utf8') as f:
            f.write(json.dumps({'type':'header'})+'\n')
            for n in frames:f.write(json.dumps({'source_frame_idx':n,'frame_idx':n,'t':n,'blobs_by_cam':{}})+'\n')
    make(a,[1,3]);make(b,[1,2,3])
    result=module.compare(a,b)
    assert result['matched_source_frames']==2 and result['missing_runtime_frames']==1
    assert result['measurement_equal_frames']==2 and not result['measurement_equal']
