"""Adapter-facing view of the public Engine L snapshot and event API."""
from types import SimpleNamespace
from .engine_l import EngineLEngine
from .types import State


class EngineLFacade:
    def __init__(self, engine: EngineLEngine):
        self._engine = engine

    def _read_internal(self):
        try:
            vehicles = self._engine.snapshot()
            next_gid = self._engine.next_gid
            tracks = []
            for vehicle in vehicles:
                boxes = {cam: (box, vehicle['bbox_times'][cam])
                         for cam, box in vehicle['bbox_by_cam'].items()}
                tracks.append(SimpleNamespace(gid=vehicle['gid'], state=vehicle['state'],
                    bbox_by_cam=boxes, last_meas_xy=vehicle['last_meas_xy'],
                    v=vehicle['v'], last_meas_t=vehicle['last_meas_t']))
            return tracks, next_gid
        except (AttributeError, KeyError, TypeError) as exc:
            raise RuntimeError('Engine L snapshot interface changed; update engine_l_facade') from exc

    @property
    def tracks(self):
        return self._read_internal()[0]

    @property
    def _next_gid(self):
        return self._read_internal()[1]

    @property
    def next_gid(self):
        return self._read_internal()[1]

    def step(self, t, frame, blobs_by_cam):
        return self._engine.step(t, frame, blobs_by_cam)

    def stats(self):
        return self._engine.stats()

    def snapshot(self):
        return self._engine.snapshot()

    def live_gids(self):
        return self._engine.live_gids()

    def drain_events(self):
        return [dict(event) for event in self._engine.drain_events()]
