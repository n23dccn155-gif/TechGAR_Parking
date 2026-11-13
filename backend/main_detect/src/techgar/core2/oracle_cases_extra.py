"""Labeled GT-only oracle cases; episode manifests accompany each dump."""
from __future__ import annotations
from collections import deque
import csv
from dataclasses import replace
import itertools
import json
import math
from pathlib import Path
import random

from .dump import BlobDumpWriter, read_dump
from .oracle_dump import CASES as BASE_CASES, _calibration, _edge_ghost, _make_blob, generate as base_generate, sim_to_world

EXTRA_CASES = {'edgeghost30': (0.9, 0.0, False, 0.0),
               'queue_drop': (0.9, 0.0, False, 0.0),
               'oov_pair': (0.9, 0.0, False, 0.0),
               'barrier_queue': (0.9, 0.0, False, 0.0)}
ALL_CASES = {**BASE_CASES, **EXTRA_CASES}
FPS = 25
OOV_PAIRS = {'20261106-174535_sang_60': ('V098','V101',22073,22150,22152,22234),
             '20261106-201218_toi_30': ('V144','V140',32001,32087,32105,32196)}


def _labelled(run_dir, source, max_frames):
    """Attach GT IDs using the documented jitter09 producer order, fail closed."""
    header, steps = read_dump(source)
    if header.get('provenance') != 'gt_oracle_jitter09' or run_dir.name not in str(header.get('video','')):
        raise ValueError('expected matching gt_oracle_jitter09 base dump')
    try:
        with (run_dir/'gt_frames.csv').open(encoding='utf-8-sig',newline='') as f:
            rows=csv.DictReader(f)
            cars=[c[:-5] for c in rows.fieldnames if c.endswith('_cams')]
            gt_iter=iter(rows)
            if max_frames is not None:
                gt_iter=itertools.islice(gt_iter,max_frames)
            last=None; count=0
            for row,step in itertools.zip_longest(gt_iter,steps):
                if row is None or step is None:
                    raise ValueError('GT and dump length differ')
                frame=int(row['frame'])
                if frame != step['source_frame_idx'] or (last is not None and frame != last+1):
                    raise ValueError('source_frame_idx != consecutive GT frame')
                last=frame
                count+=1
                ids={0:[],1:[]}; xy={}
                for car in cars:
                    cams=(row.get(car+'_cams') or '').strip()
                    u=row.get(car+'_u'); v=row.get(car+'_v')
                    if not cams or not u or not v: continue
                    xy[car]=sim_to_world(float(u),float(v))
                    for cam in cams.split('+'):
                        if cam not in ('cam1','cam2'): raise ValueError(f'unknown camera {cam}')
                        ids[int(cam[-1])-1].append(car)
                labeled={}
                for cam in (0,1):
                    blobs=step['blobs_by_cam'].get(cam,[])
                    if len(ids[cam]) != len(blobs):
                        raise ValueError(f'oracle label/blob count mismatch frame={frame} cam={cam}')
                    labeled[cam]=dict(zip(ids[cam],blobs))
                yield {'step':step,'xy':xy,'blobs':labeled}
            if max_frames is not None and count < max_frames:
                raise ValueError('GT and dump length differ: input shorter than requested frames')
    finally:
        steps.close()


def _manifest(destination, case, seed, episodes, censored, **extra):
    suffix=f"_{extra['variant']}" if case=='oov_pair' and 'variant' in extra else ''
    case_id=f'{case}{suffix}_s{seed}'
    obj={'case':case_id,'case_type':case,'seed':seed,'status':'OK' if episodes else 'KHONG_DU_MAU',
         'episodes':episodes,'censored':censored,**extra}
    Path(str(destination)+'.episodes.json').write_text(json.dumps(obj,ensure_ascii=False,indent=2),encoding='utf8')
    for item in episodes+censored:
        print(json.dumps({'case':case_id,**item},ensure_ascii=False),flush=True)
    if not episodes:
        raise ValueError(f'{case_id}: KHONG_DU_MAU (0 valid episodes); see episode manifest')
    return obj


def _writer(destination,run_dir,case,seed,**extra):
    suffix=f"_{extra['variant']}" if case=='oov_pair' and 'variant' in extra else ''
    return BlobDumpWriter(destination,video=run_dir.name,stride=1,cameras={0:'cam1',1:'cam2'},
                          core_version='engine_l-oracle-v1',provenance=f'gt_oracle_{case}',
                          engine_inputs={'seed':seed,'case_id':f'{case}{suffix}_s{seed}',**extra})


def _edge_case(run_dir,source,destination,seed,max_frames):
    transforms,_,_=_calibration(run_dir); rng=random.Random(seed)
    rows=iter(_labelled(run_dir,source,max_frames)); window=deque(itertools.islice(rows,30))
    episodes=[]; censored=[]; total=outside=0; until=-1
    with _writer(destination,run_dir,'edgeghost30',seed,edge_distance_cm=[5,6],
                 edge_distance_reference='noisy_blob',episode_frames=30) as dst:
        while window:
            current=window[0]; frame=current['step']['source_frame_idx']
            if frame>=until and frame%100==0 and len(window)==30:
                cams=[0,1]; rng.shuffle(cams); found=None
                for cam in cams:
                    px=rng.uniform(780,810) if cam==0 else rng.uniform(1,29)
                    for car in current['blobs'][cam]:
                        ghosts=[]
                        for rec in window:
                            ref=rec['blobs'][cam].get(car)
                            ghost=_edge_ghost(ref,transforms[f'cam{cam+1}'],cam,px) if ref else None
                            if ghost is None: break
                            ghosts.append(ghost)
                        if len(ghosts)==30:
                            found=(cam,car,ghosts,px); break
                    if found: break
                if found:
                    cam,car,ghosts,px=found
                    for rec,ghost in zip(window,ghosts): rec['step']['blobs_by_cam'][cam].append(ghost)
                    count_out=sum(g.bbox[0]+g.bbox[2]/2>800 for g in ghosts)
                    outside+=count_out; total+=30; until=frame+30
                    episodes.append({'video':run_dir.name,'start_frame':frame,'end_frame':frame+29,
                                     'vehicles':[car],'camera':f'cam{cam+1}','censored':False,
                                     'ghosts':30,'outside_x_gt_800':count_out})
            rec=window.popleft(); step=rec['step']
            dst.write_step(step['t'],step['frame_idx'],step['source_frame_idx'],step['blobs_by_cam'])
            try: window.append(next(rows))
            except StopIteration: pass
    summary=_manifest(destination,'edgeghost30',seed,episodes,censored,edge_ghosts=total,
                      edge_episodes=len(episodes),outside_x_gt_800=outside)
    return summary


def _convoy(records,cars,min_displacement=2.0):
    """Same lane and heading throughout; consecutive GT positions, no stale velocity."""
    if len(records)<2: return False
    start,end=records[0]['xy'],records[-1]['xy']
    if any(c not in start or c not in end for c in cars): return False
    vectors=[(end[c][0]-start[c][0],end[c][1]-start[c][1]) for c in cars]
    lengths=[math.hypot(*v) for v in vectors]
    if min(lengths)<min_displacement: return False  # enough motion to define heading
    axis=(vectors[0][0]/lengths[0],vectors[0][1]/lengths[0])
    if any((v[0]*axis[0]+v[1]*axis[1])/d < .8 for v,d in zip(vectors,lengths)): return False
    for prev,rec in zip(records,records[1:]):
        if rec['step']['source_frame_idx'] != prev['step']['source_frame_idx']+1: return False
        if any(c not in rec['xy'] for c in cars): return False
        for c in cars:
            dx=rec['xy'][c][0]-prev['xy'][c][0]; dy=rec['xy'][c][1]-prev['xy'][c][1]
            if dx*axis[0]+dy*axis[1] < -0.1: return False  # tolerate GT rounding
        pts=[rec['xy'][c] for c in cars]
        ordered=sorted(pts,key=lambda p:p[0]*axis[0]+p[1]*axis[1])
        lateral=[-x*axis[1]+y*axis[0] for x,y in pts]
        if max(lateral)-min(lateral)>8.0 or any(math.dist(a,b)>=25 for a,b in zip(ordered,ordered[1:])):
            return False
    return True


def _queue_case(run_dir,source,destination,seed,max_frames):
    rng=random.Random(seed); rows=iter(_labelled(run_dir,source,max_frames))
    window=deque(itertools.islice(rows,101)); episodes=[]; censored=[]; dropped=0; until=-1; previous=None
    with _writer(destination,run_dir,'queue_drop',seed,queue_max_dist_cm=25.0,
                 drop_duration_frames=[75,100],label_source='gt_oracle_jitter09_order') as dst:
        while window:
            rec=window[0]; frame=rec['step']['source_frame_idx']
            if frame>=until and frame%50==0 and len(window)>=2 and previous is not None:
                common=sorted(set(rec['xy']) & set(window[1]['xy']))
                candidates=[]
                dt=window[1]['step']['t']-rec['step']['t']
                if dt<=0 or window[1]['step']['source_frame_idx'] != frame+1:
                    raise ValueError('velocity needs positive timestamp and consecutive frames')
                for c in common:
                    d=math.dist(rec['xy'][c],window[1]['xy'][c])/dt
                    if d>2.0: candidates.append(c)
                triples=[p for p in itertools.combinations(candidates,3)
                         if all(math.dist(rec['xy'][a],rec['xy'][b])<50 for a,b in itertools.combinations(p,2))]
                rng.shuffle(triples); duration=rng.randint(75,100)
                for cars in triples:
                    prefix=list(window)[:min(duration+1,len(window))]
                    if not _convoy(prefix,cars): continue
                    chosen=rng.sample(list(cars),rng.choice([1,2]))
                    if any(not any(c in previous['blobs'][cam] for cam in (0,1)) for c in chosen): continue
                    if len(window)<duration+1:
                        censored.append({'video':run_dir.name,'start_frame':frame,'end_frame':window[-1]['step']['source_frame_idx'],
                                         'vehicles':chosen,'censored':True,'reason':'input_end','planned_frames':duration,
                                         'frames_per_vehicle':{c:0 for c in chosen},
                                         'removed_blobs_by_camera':{c:{'cam1':0,'cam2':0} for c in chosen}})
                        until=frame+duration+100; break
                    relevant=list(window)[:duration+1]
                    if not _convoy(relevant,cars): continue
                    if any(not any(c in r['blobs'][cam] for cam in (0,1)) for r in relevant for c in chosen): continue
                    camera_counts={c:{'cam1':0,'cam2':0} for c in chosen}
                    for r in relevant[:duration]:
                        for cam in (0,1):
                            bucket=r['step']['blobs_by_cam'][cam]
                            affected=[r['blobs'][cam][c] for c in chosen if c in r['blobs'][cam]]
                            for c in chosen:
                                if c in r['blobs'][cam]: camera_counts[c][f'cam{cam+1}']+=1
                            affected_ids={id(x) for x in affected}
                            r['step']['blobs_by_cam'][cam]=[x for x in bucket if id(x) not in affected_ids]
                            dropped+=len(affected)
                    episodes.append({'video':run_dir.name,'start_frame':frame,'end_frame':frame+duration-1,
                                     'recovery_frame':frame+duration,'vehicles':chosen,'convoy':list(cars),
                                     'censored':False,'frames_per_vehicle':{c:duration for c in chosen},
                                     'removed_blobs_by_camera':camera_counts})
                    until=frame+duration+100; break
            previous=window.popleft(); step=previous['step']
            dst.write_step(step['t'],step['frame_idx'],step['source_frame_idx'],step['blobs_by_cam'])
            try: window.append(next(rows))
            except StopIteration: pass
    return _manifest(destination,'queue_drop',seed,episodes,censored,queue_episodes=len(episodes),
                     censored_episodes=len(censored),dropped_blobs=dropped)


def _barrier_case(run_dir,source,destination,seed,max_frames,*,force_shifted=False):
    """Prefer real arrivals; otherwise time-shift a real GT arrival by <=50f."""
    gate=json.loads((run_dir/'techgar_config/gate_zones.json').read_text(encoding='utf8'))['entry_gate']
    p1,p2=gate['p1'],gate['p2']; gx=(p1['x']+p2['x'])/2
    ylo,yhi=sorted((p1['y'],p2['y']))
    def in_entry(xy):
        # Assumption: entrance lane extends 30 cm either side of count line.
        return abs(xy[0]-gx)<=30 and ylo-6<=xy[1]<=yhi+6
    def candidate(window,history,shift):
        cur=window[0]; future=window[shift]; prev=history[-1] if shift==0 else window[shift-1]
        nxt=window[shift+1]
        for a,pa in cur['xy'].items():
            if not in_entry(pa) or any(a not in h['xy'] or math.dist(pa,h['xy'][a])>.5 for h in history): continue
            for b,pb in future['xy'].items():
                if b==a or b in prev['xy'] or b not in nxt['xy'] or math.dist(pa,pb)>12: continue
                v=(nxt['xy'][b][0]-pb[0],nxt['xy'][b][1]-pb[1])
                if (pa[0]-pb[0])*v[0]+(pa[1]-pb[1])*v[1]<=0: continue
                # Retain one measurement before and after a max three-frame gap.
                if any(a not in r['xy'] or math.dist(pa,r['xy'][a])>.5 for r in list(window)[:4]): continue
                return a,b,math.dist(pa,pb)
        return None
    rng=random.Random(seed); source_rows=iter(_labelled(run_dir,source,max_frames))
    window=deque(itertools.islice(source_rows,52)); history=deque(maxlen=5); fallback=natural=None
    while window:
        if len(history)==5 and len(window)>=5:
            found=candidate(window,history,0)
            if found:
                if natural is None: natural=(window[0]['step']['source_frame_idx'],0,*found)
                if not force_shifted: break
            if fallback is None:
                for shift in range(1,min(50,len(window)-2)+1):
                    found=candidate(window,history,shift)
                    if found:
                        fallback=(window[0]['step']['source_frame_idx'],shift,*found); break
        history.append(window.popleft())
        try: window.append(next(source_rows))
        except StopIteration: pass
    # Exhaust to ensure a real case later takes precedence over a synthetic one.
    # If natural was found early, close the reading generator explicitly.
    source_rows.close()
    plan=fallback if force_shifted else (natural or fallback)
    if plan is None:
        return _manifest(destination,'barrier_queue',seed,[],[],reason='no qualifying real or shifted GT case')
    frame,shift,a,b,distance=plan; duration=rng.randint(1,3)
    metadata={'variant':'real' if shift==0 else 'time_shifted',
              'source_frame_offsets':{a:0,b:shift},'gt_scoring_requires_remap':shift!=0,
              'truth_rule':'GT(frame + source_frame_offsets.get(vehicle,0))',
              'entry_line_radius_cm':30.0}
    rows=iter(_labelled(run_dir,source,max_frames)); window=deque(itertools.islice(rows,shift+1))
    written=0; removed={f'cam{cam+1}':0 for cam in (0,1)}
    with _writer(destination,run_dir,'barrier_queue',seed,**metadata) as dst:
        while len(window)>shift:
            rec=window[0]; step=rec['step']; f=step['source_frame_idx']
            buckets={cam:list(step['blobs_by_cam'][cam]) for cam in (0,1)}
            if shift:
                future=window[shift]
                for cam in (0,1):
                    old=rec['blobs'][cam].get(b)
                    if old is not None: buckets[cam]=[x for x in buckets[cam] if x is not old]
                    new=future['blobs'][cam].get(b)
                    if new is not None:
                        buckets[cam].append(replace(new,frame=f,t=step['t']))
            if frame<=f<frame+duration:
                for cam in (0,1):
                    target=rec['blobs'][cam].get(a)
                    if target is not None:
                        buckets[cam]=[x for x in buckets[cam] if x is not target];removed[f'cam{cam+1}']+=1
            dst.write_step(step['t'],step['frame_idx'],f,buckets);written+=1
            window.popleft()
            try: window.append(next(rows))
            except StopIteration: pass
    rows.close()
    episode={'video':run_dir.name,'start_frame':frame,'end_frame':frame+duration-1,
             'recovery_frame':frame+duration,'vehicles':[a,b],'dropped_vehicle':a,
             'entering_vehicle':b,'distance_cm':round(distance,4),'dropped_frames':duration,
             'removed_blobs_by_camera':removed,'censored':False,**metadata}
    return _manifest(destination,'barrier_queue',seed,[episode],[],frames=written,**metadata)


def _oov_case(run_dir,destination,seed,max_frames,variant):
    if run_dir.name not in OOV_PAIRS:
        raise ValueError('oov_pair requires TRAIN sang_60 or toi_30 GT run')
    if variant not in ('real','close'):
        raise ValueError('oov_variant must be real or close')
    first,second,in1,in2,out1,out2=OOV_PAIRS[run_dir.name]
    # Synthetic variant advances only the second GT trajectory. The metadata
    # is the scoring truth: GT(frame + offsets[vehicle]); other cars omitted.
    advance=0 if variant=='real' else in2-in1-20
    offsets={first:0,second:advance}
    start=in1-50; end=max(out1,out2-advance)+50
    if max_frames is not None: end=min(end,start+max_frames-1)
    needed_end=max(end+advance,out1,out2)
    frames={}
    with (run_dir/'gt_frames.csv').open(encoding='utf-8-sig',newline='') as f:
        for row in csv.DictReader(f):
            n=int(row['frame'])
            if n>needed_end: break
            if n>=start: frames[n]=row
    if any(n not in frames for n in range(start,needed_end+1)):
        raise ValueError('missing or nonconsecutive source GT frame')
    for car,enter,leave in ((first,in1,out1),(second,in2,out2)):
        if (not frames[enter-1].get(car+'_cams') or frames[enter].get(car+'_cams') or
            frames[leave-1].get(car+'_cams') or not frames[leave].get(car+'_cams')):
            raise ValueError(f'OOV GT transition mismatch for {car}')
    # A positive episode requires both returns and at least one common blind frame.
    second_enter=in2-advance; second_return=out2-advance
    if second_enter-in1>=25 and variant=='close': raise ValueError('close variant not <1 second')
    if end<max(out1,second_return) or max(in1,second_enter)>=min(out1,second_return):
        _manifest(destination,'oov_pair',seed,[],[{'video':run_dir.name,'start_frame':start,
                  'end_frame':end,'vehicles':[first,second],'censored':True,'reason':'missing overlap or recovery'}],variant=variant)
    transforms,inverses,roi=_calibration(run_dir); rng=random.Random(seed)
    metadata={'variant':variant,'vehicles':[first,second],'source_frame_offsets':offsets,
              'truth_rule':'GT(frame + source_frame_offsets[vehicle]); only listed vehicles',
              'gt_scoring_requires_remap':variant=='close','first_hidden_frames':{first:in1,second:second_enter},
              'first_reappear_frames':{first:out1,second:second_return}}
    with _writer(destination,run_dir,'oov_pair',seed,**metadata) as dst:
        for frame in range(start,end+1):
            bycam={0:[],1:[]}
            for car in (first,second):
                row=frames[frame+offsets[car]]; cams=(row.get(car+'_cams') or '').strip()
                u=row.get(car+'_u'); v=row.get(car+'_v')
                if not cams or not u or not v: continue
                xy=sim_to_world(float(u),float(v))
                for name in cams.split('+'):
                    cam=int(name[-1])-1
                    noisy=(xy[0]+rng.gauss(0,.9),xy[1]+rng.gauss(0,.9))
                    bycam[cam].append(_make_blob(cam,frame,noisy,inverses[name],roi[name]))
            dst.write_step((frame+1)/FPS,frame+1,frame,bycam)
    episode={'video':run_dir.name,'start_frame':start,'end_frame':end,'vehicles':[first,second],
             'censored':False,'first_hidden_frames':metadata['first_hidden_frames'],
             'first_reappear_frames':metadata['first_reappear_frames'],'variant':variant}
    return _manifest(destination,'oov_pair',seed,[episode],[],**metadata)


def generate_extra(run_dir: Path,destination: Path,case: str,seed: int=79001,
                   max_frames: int|None=None,*,oov_variant: str='real',barrier_variant: str='auto') -> dict:
    run_dir=Path(run_dir); destination=Path(destination)
    if case not in EXTRA_CASES:
        raise ValueError(f'unknown extra case {case!r}')
    destination.parent.mkdir(parents=True,exist_ok=True)
    if case=='oov_pair':
        return _oov_case(run_dir,destination,seed,max_frames,oov_variant)
    if barrier_variant not in ('auto','shifted'):
        raise ValueError('barrier_variant must be auto or shifted')
    temporary=destination.with_name(destination.name+'.base.tmp')
    try:
        generation=base_generate(run_dir,temporary,'jitter09',seed,max_frames)
        handler={'edgeghost30':_edge_case,'queue_drop':_queue_case,'barrier_queue':_barrier_case}[case]
        result=(handler(run_dir,temporary,destination,seed,max_frames,force_shifted=barrier_variant=='shifted')
                if case=='barrier_queue' else handler(run_dir,temporary,destination,seed,max_frames))
        result.setdefault('frames',generation['frames']); result['base_generation']=generation
        Path(str(destination)+'.episodes.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf8')
        return result
    finally:
        temporary.unlink(missing_ok=True)


def generate(run_dir: Path,destination: Path,case: str,seed: int=79001,
             max_frames: int|None=None,*,oov_variant: str='real',barrier_variant: str='auto') -> dict:
    if case in EXTRA_CASES:
        return generate_extra(run_dir,destination,case,seed,max_frames,oov_variant=oov_variant,barrier_variant=barrier_variant)
    return base_generate(run_dir,destination,case,seed,max_frames)
