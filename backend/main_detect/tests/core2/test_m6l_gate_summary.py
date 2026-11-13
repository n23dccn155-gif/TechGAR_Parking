import gzip,importlib.util,json
from pathlib import Path

ROOT=Path(__file__).resolve().parents[4]
spec=importlib.util.spec_from_file_location('m6l_gate_summary',ROOT/'.orca/core2/m6l_gate_summary.py')
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)

def test_summary_requires_full_source_parity_and_stable_hashes(tmp_path):
    session=tmp_path/'session';session.mkdir()
    (tmp_path/'runtime.log').write_text('--render-replay-process\n[P35_REPLAY_DROP_FINAL] processed=3 source=3 dropped=0\n[ASYNC_VIDEO] counts={\'raw_cam1\': 2, \'raw_cam2\': 2, \'debug_cam1\': 2, \'debug_cam2\': 2} overwritten=0\n')
    (tmp_path/'hashes.json').write_text(json.dumps({'before':{'a':'hash'},'after':{'a':'hash'}}))
    parity=tmp_path/'parity.json';parity.write_text(json.dumps({'equal':True,'matched_frames':3}),encoding='utf-8-sig')
    with gzip.open(session/'predictions.jsonl.gz','wt') as handle:
        for i in range(3):handle.write(json.dumps({'capture_unix_ns':i*40_000_000})+'\n')
    (session/'performance.csv').write_text('total_processing_ms\n30\n40\n50\n')
    result=module.summarize(tmp_path,parity,expected_source=3)
    assert result['fps']==25 and result['pass']
    parity.write_text(json.dumps({'equal':True,'matched_frames':2}))
    assert not module.summarize(tmp_path,parity,expected_source=3)['pass']
    (tmp_path/'runtime.log').write_text('[P35_REPLAY_DROP_FINAL] processed=3 source=4 dropped=1\n')
    assert not module.summarize(tmp_path,parity,expected_source=3)['pass']
