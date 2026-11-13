"""Opt-in, one-to-one public numbering for the Engine L adapter facade."""
from dataclasses import replace
import json
import logging
from pathlib import Path
from types import SimpleNamespace

from .types import State


class PublicIdEngine:
    """Translate at the facade boundary; the underlying engine keeps its IDs."""

    def __init__(self, engine, *, strict=False):
        self._engine = engine
        self.strict = strict
        self.int_to_pub = {}
        self.pub_to_int = {}
        self.next_entry = 1
        self.next_parked = 1001
        self._events = []

    def _allocate(self, gid, state):
        gid = int(gid)
        if gid in self.int_to_pub:
            return self.int_to_pub[gid]
        stopped = state is State.STOPPED or state == 'STOPPED'
        if stopped:
            public = self.next_parked
            self.next_parked += 1
        else:
            public = self.next_entry
            if public >= 1001:
                raise RuntimeError('public entry IDs exhausted: reserved parked range begins at 1001')
            self.next_entry += 1
        if public in self.pub_to_int:
            raise RuntimeError(f'duplicate public ID {public}')
        self.int_to_pub[gid] = public
        self.pub_to_int[public] = gid
        return public

    def _public(self, gid, state=None):
        if gid is None:
            return None
        if gid not in self.int_to_pub:
            if self.strict:
                raise RuntimeError(f'internal GID {gid} appeared before gid_created')
            logging.getLogger(__name__).warning('GID %s appeared before gid_created; using current state %s', gid, state)
            return self._allocate(gid, state)
        return self.int_to_pub[gid]

    @staticmethod
    def _gid_key(key):
        return key == 'gid' or key.startswith('gid_') or key.endswith('_gid')

    def _event(self, event, states):
        result = dict(event)
        for key, value in result.items():
            if self._gid_key(key) and value is not None:
                result[key] = self._public(value, states.get(value))
        return result

    def step(self, t, frame, blobs_by_cam):
        outputs = self._engine.step(t, frame, blobs_by_cam)
        events = self._engine.drain_events()
        for event in events:
            if event.get('type') == 'gid_created':
                self._allocate(event['gid'], event['state'])
        states = {tr.gid: tr.state for tr in self._engine.tracks if tr.gid is not None}
        self._events.extend(self._event(event, states) for event in events)
        return [replace(out, gid=self._public(out.gid, out.state),
                        bbox_by_cam=dict(out.bbox_by_cam)) for out in outputs]

    @property
    def tracks(self):
        return [SimpleNamespace(gid=self._public(tr.gid, tr.state), state=tr.state,
                    bbox_by_cam=dict(tr.bbox_by_cam), last_meas_xy=tr.last_meas_xy,
                    v=tr.v, last_meas_t=tr.last_meas_t)
                for tr in self._engine.tracks]

    def snapshot(self):
        return tuple({**item, 'gid': self._public(item['gid'], item['state']),
                      'bbox_by_cam': dict(item['bbox_by_cam']),
                      'bbox_times': dict(item['bbox_times'])}
                     for item in self._engine.snapshot())

    def live_gids(self):
        states = {track.gid: track.state for track in self._engine.tracks if track.gid is not None}
        return frozenset(self._public(gid, states.get(gid)) for gid in self._engine.live_gids())

    def drain_events(self):
        events, self._events = self._events, []
        return events

    def stats(self):
        return self._engine.stats()

    @property
    def next_gid(self):
        return self.next_entry

    @property
    def _next_gid(self):
        return self.next_gid

    def write_map(self, path):
        with Path(path).open('x', encoding='utf8') as stream:
            json.dump(self.int_to_pub, stream, sort_keys=True, indent=2)
            stream.write('\n')
