import gzip,json,sys
from pathlib import Path
import pytest
sys.path.insert(0,str(Path(__file__).resolve().parents[4]/'.orca/core2'))
import ledger_fixtures_director as tool

def test_extract_exact_window_and_deduplicate_events(tmp_path):
    run='test_run';events=tmp_path/'events.json';dump=tmp_path/'dump.gz';out=tmp_path/'out'
    events.write_text(json.dumps({'run':run,'events':[{'car':'V008','frame':150,'type':'IDSW'},
        {'car':'V008','frame':150,'type':'MIX'}]}))
    with gzip.open(dump,'wt',encoding='utf8') as f:
        f.write(json.dumps({'type':'header','video':run})+'\n')
        for frame in range(301):f.write(json.dumps({'source_frame_idx':frame+1})+'\n')
    result=tool.extract(events,dump,run,out)
    item=result['fixtures'][0]
    assert len(result['fixtures'])==1 and item['count']==201
    assert (item['first'],item['last'])==(50,250) and item['event_types']==['IDSW','MIX']
    with gzip.open(item['path'],'rt',encoding='utf8') as f:
        rows=[json.loads(line) for line in f]
    assert rows[0]['type']=='header' and rows[1]['source_frame_idx']==51 and rows[-1]['source_frame_idx']==251
    with pytest.raises(FileExistsError):tool.extract(events,dump,run,out)
