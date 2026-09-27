"""Check runtime/parking consistency without pretending to measure physical ID accuracy.

Read-only by default. --report must name a NEW JSON file. Run validate_session.py
as well: this audit does not decode videos or replace record-count validation.
"""
from __future__ import annotations

import argparse
from collections import Counter, defaultdict
import csv
import json
from pathlib import Path
import statistics


def frame_ranges(values):
    ranges = []
    for value in sorted(set(values)):
        if ranges and value == ranges[-1][1] + 1:
            ranges[-1][1] = value
        else:
            ranges.append([value, value])
    return ranges


def audit_session(session: Path):
    issues = defaultdict(list)
    episode_timeline = []
    previous_episodes = {}
    event_counts = Counter()
    seen_events = set()
    recovery_events = []
    observed_ids = Counter()
    assigned_frames = 0
    records = 0
    last_frame = -1
    episode_schema_frames = 0
    with (session / 'predictions.jsonl').open(encoding='utf8') as stream:
        for line in stream:
            row = json.loads(line)
            frame = int(row['frame_idx'])
            records += 1
            if frame <= last_frame:
                issues['non_progressing_frame'].append(frame)
            last_frame = frame
            episodes = row.get('parking_episodes', [])
            episode_schema_frames += int('parking_episodes' in row)
            parked = set()
            gid_slots = defaultdict(set)
            slot_gids = defaultdict(set)
            for episode in episodes:
                gid, slot = episode['global_id'], episode['slot_id']
                eid = episode['parking_episode_id']
                signature = (gid, slot, episode['state'], episode['applied_frame_idx'])
                if previous_episodes.get(eid) != signature:
                    episode_timeline.append(dict(record_frame=frame, **episode))
                    previous_episodes[eid] = signature
                evidence, applied = episode.get('evidence_frame_idx'), episode.get('applied_frame_idx')
                if not (isinstance(evidence, int) and isinstance(applied, int) and 0 <= evidence <= applied <= frame):
                    issues['invalid_episode_evidence_clock'].append(frame)
                if episode['state'] == 'parked':
                    parked.add((gid, slot))
                    gid_slots[gid].add(slot)
                    slot_gids[slot].add(gid)
            if any(len(slots) > 1 for slots in gid_slots.values()):
                issues['episode_global_id_owns_multiple_slots'].append(frame)
            if any(len(gids) > 1 for gids in slot_gids.values()):
                issues['episode_slot_has_multiple_owners'].append(frame)
            for slot in row.get('slots', []):
                gid = slot.get('canonical_vehicle_gid')
                if gid is not None and slot.get('tracking_state') == 'parked' and 'parking_episodes' in row:
                    if (gid, slot['slot_id']) not in parked:
                        issues['parked_binding_missing_active_episode'].append(frame)
            present = set()
            for obs in row.get('observations', []):
                gid = obs.get('canonical_gid')
                if gid is not None and obs.get('observation_kind') == 'detection':
                    present.add(gid)
            assigned_frames += bool(present)
            observed_ids.update(present)
            for event in row.get('identity_events', []) + row.get('parking_events', []):
                key = event.get('event_uid') or json.dumps(event, sort_keys=True)
                if key in seen_events:
                    continue
                seen_events.add(key)
                name = event.get('event_type', 'unknown')
                event_counts[name] += 1
                if name in {'parked_id_recovered', 'global_id_created', 'global_id_merged',
                            'slot_arrival_claim_confirmed', 'parked_id_recovery_expired'}:
                    recovery_events.append(event)
    metadata_path = session / 'session_info.json'
    metadata = json.loads(metadata_path.read_text(encoding='utf8')) if metadata_path.exists() else {}
    timings = []
    perf = session / 'performance.csv'
    if perf.exists():
        with perf.open(encoding='utf8', newline='') as stream:
            timings = [float(row['total_processing_ms']) for row in csv.DictReader(stream)]
    timings.sort()
    return dict(
        session=str(session), records=records, last_frame=last_frame,
        status=metadata.get('status', 'missing_metadata_incomplete'),
        structural_pass=not issues and episode_schema_frames == records and records > 0,
        scope='Structural consistency only; NOT IDF1, ID-switch count, physical recovery accuracy or live latency.',
        episode_schema_frames=episode_schema_frames,
        issues={name:dict(frame_count=len(set(frames)), ranges=frame_ranges(frames)) for name, frames in issues.items()},
        frames_with_any_assigned_detection=assigned_frames,
        assigned_detection_frames_by_gid=dict(observed_ids),
        processing_ms=dict(p50=statistics.median(timings), p95=timings[min(len(timings)-1, int(.95*(len(timings)-1)))]) if timings else None,
        elapsed_seconds=metadata.get('processing_elapsed_seconds'),
        event_counts=dict(event_counts), episode_timeline=episode_timeline, key_events=recovery_events,
    )


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--session', type=Path, required=True)
    parser.add_argument('--report', type=Path)
    args = parser.parse_args()
    if args.report and args.report.exists():
        parser.error('Report exists; choose a new file to preserve prior evidence')
    result = audit_session(args.session)
    payload = json.dumps(result, ensure_ascii=False, indent=2)
    if args.report:
        with args.report.open('x', encoding='utf8') as stream:
            stream.write(payload)
        print(json.dumps({key: value for key, value in result.items() if key not in {'key_events','episode_timeline'}}, ensure_ascii=False, indent=2))
    else:
        print(payload)
    return 0 if result['structural_pass'] else 1


if __name__ == '__main__':
    raise SystemExit(main())
