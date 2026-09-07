"""Loopback-only fixture server for Playwright; never uses the production store."""
import argparse
from datetime import datetime, timezone
import json
from pathlib import Path
import sys
import threading
from http.server import ThreadingHTTPServer
from urllib.parse import urlparse

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import session_manager as sm
import gate_session_controller as gate


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--store', required=True, type=Path)
    args = parser.parse_args()
    if args.store.exists(): parser.error('A fresh isolated store is required')
    sm.SESSIONS_FILE = args.store
    sm.create_session(global_vehicle_id=42, runtime_id='browser-test', session_id='browser-session')
    sm.claim_session('browser-session')
    config = dict(coordinate_space='world', entry_gate=dict(p1=dict(x=0,y=10),p2=dict(x=10,y=10),direction='positive'),
                  exit_gate=dict(p1=dict(x=0,y=0),p2=dict(x=10,y=0),direction='positive'))
    coordinator = gate.GateSessionCoordinator(config)
    lock = threading.Lock()
    data = dict(schema_version=2, runtime_id='browser-test', frame_index=0, source_mode='live',
                coordinate_space=dict(unit='cm',bounds=None),camera_skew_ms=0,
                cameras={c:dict(camera_id=c,width=1280,height=720,online=True,age_ms=0,captured_at_monotonic_ns=1)
                         for c in ('cam1','cam2')},slot_layout=[],vehicles=[],pending_handoffs=[],recent_events=[],
                retired_global_ids={},parking_episodes=[],parking_slots=[
                    dict(slot_id=s,camera_id='cam1',status='empty',occupied=False,vehicle_id=None,
                         tracking_state='moving',stopped_for_ms=0,decision_source='none') for s in ('A01','A02')])

    def publish():
        data['frame_index'] += 1
        data['timestamp'] = data['published_at'] = datetime.now(timezone.utc).isoformat()
        coordinator.process_snapshot(data)

    class Handler(gate.SessionAPIRequestHandler):
        def do_GET(self):
            path = urlparse(self.path).path
            if path == '/api/runtime/gates': self._json({},404); return
            if path == '/api/runtime/snapshot':
                with lock:
                    publish()
                    self._json(data)
                return
            super().do_GET()

        def do_POST(self):
            if urlparse(self.path).path != '/__test/advance': return super().do_POST()
            value = json.loads(self.rfile.read(int(self.headers['Content-Length'])))
            with lock:
                slot = next(s for s in data['parking_slots'] if s['slot_id'] == value['slot_id'])
                state = value['state']
                slot.update(occupied=state != 'released', status='empty' if state == 'released' else 'occupied',
                            vehicle_id=42 if state == 'parked' else None,
                            tracking_state='parked' if state == 'parked' else 'moving')
                if state != 'red_unknown':
                    eid = value['episode_id']
                    data['parking_episodes'] = [e for e in data['parking_episodes'] if e['parking_episode_id'] != eid]
                    frame = data['frame_index'] + 1
                    data['parking_episodes'].append(dict(parking_episode_id=eid,global_id=42,slot_id=value['slot_id'],
                        state=state,evidence_frame_idx=frame,applied_frame_idx=frame,
                        evidence_timestamp_s=float(frame),applied_timestamp_s=float(frame),reason='browser_fixture'))
                publish()
                self._json(sm.get_session('browser-session'))

    server = ThreadingHTTPServer(('127.0.0.1',0), Handler)
    print(f'READY:{server.server_port}', flush=True)
    server.serve_forever()


if __name__ == '__main__': main()
