"""M6 adapter for the director's Core2Engine, shared by runtime and replay."""
from __future__ import annotations

from types import SimpleNamespace
import math

import cv2
import numpy as np

from .detect import CameraDetector
from .engine import Core2Engine, EngineParams
from .types import State
from ..motion_tracker import TrackStatus
from ..prediction_writer import PredictionV3Builder

CAMERAS = {0: 'cam1', 1: 'cam2'}


def _json_safe(value):
    if isinstance(value, np.ndarray):
        return value.tolist()
    if isinstance(value, np.generic):
        return value.item()
    if isinstance(value, dict):
        return {str(key): _json_safe(item) for key, item in value.items()}
    if isinstance(value, (tuple, list)):
        return [_json_safe(item) for item in value]
    return value


def make_engine(calibration: dict, gates: dict) -> Core2Engine:
    """Use exactly the geometry and offsets of .orca/core2/dev_loop.py."""
    if calibration.get('world', {}).get('unit') != 'cm' or gates.get('unit') != 'cm':
        raise ValueError('core2 requires calibration and gates in cm')
    slots, seen = [], set()
    for camera in sorted(calibration['parking_slots_world']):
        for slot in calibration['parking_slots_world'][camera]:
            if slot['id'] not in seen:
                seen.add(slot['id'])
                slots.append(tuple(tuple(point) for point in slot['polygon']))

    def zone(gate, other, pad=3.0, depth=80.0):
        x = gate['p1']['x']
        ys = sorted((gate['p1']['y'], gate['p2']['y']))
        sign = 1.0 if x > other['p1']['x'] else -1.0
        x2 = x + sign * depth
        return ((x, ys[0]-pad), (x2, ys[0]-pad), (x2, ys[1]+pad), (x, ys[1]+pad))

    entry, exit = gates['entry_gate'], gates['exit_gate']
    return Core2Engine(EngineParams(
        slots=tuple(slots), entry_zones=(zone(entry, exit),), exit_zones=(zone(exit, entry),),
        xy_offset_by_cam=((0, .55, 2.54), (1, -.17, 2.33))))


class CameraView:
    """M1 detector and a read-only local-track-shaped view for existing UI."""
    def __init__(self, cam: int, transform, roi_mask=None):
        self.cam = cam
        self.detector = CameraDetector(cam, transform)
        self.detector.set_roi(roi_mask)
        self.frame_index = 0
        self.blobs = []
        self._tracks = {}
        self.occlusion_guard = SimpleNamespace(groups={}, independent_pairs=())
        self.association_events = []
        self.newly_lost_tracks = []

    @property
    def roi_mask(self):
        return self.detector.roi_mask

    @roi_mask.setter
    def roi_mask(self, mask):
        self.detector.set_roi(mask)

    def prepare_motion_frame(self, frame, timestamp_s, frame_idx):
        return self.detector.prepare(frame, timestamp_s, frame_idx)

    def process_frame(self, frame, timestamp_s=None, priority_regions=None,
                      prepared_motion=None, source_frame_idx=None):
        del priority_regions
        self.frame_index += 1
        source_frame = source_frame_idx if source_frame_idx is not None else self.frame_index
        self.blobs = self.detector.step(frame, source_frame, timestamp_s, prepared=prepared_motion)
        return {}, None, []

    @property
    def observable_tracks(self):
        return {}

    @property
    def confirmed_tracks(self):
        return {gid: tr for gid, tr in self._tracks.items() if tr.output_source != 'predicted'}

    @property
    def all_tracks(self):
        return dict(self._tracks)

    @property
    def active_tracks(self):
        return {key: track for key, track in self._tracks.items()
                if track.consecutive_invisible_count == 0}

    def local_track_telemetry(self, global_ids):
        rows = []
        for gid, tr in sorted(self._tracks.items()):
            if tr.consecutive_invisible_count:
                continue
            rows.append({'local_track_id': gid, 'global_id': global_ids.get(gid),
                         'bbox': list(tr.bbox), 'center': [tr.cx, tr.cy],
                         'state': 'confirmed', 'association_state': tr.state_name,
                         'prediction_source': 'measurement', 'observation_kind': 'detection',
                         'prediction_age_s': tr.bbox_age_s,
                         'first_observation_frame': tr.first_frame})
        return rows

    def draw_tracks(self, frame, tracks=None, show_non_active=False, id_overrides=None,
                    confirmed_color=(0, 255, 0), confirmed_label=None, point_color=(0, 0, 255)):
        del show_non_active
        out = frame.copy()
        for gid, track in (tracks if tracks is not None else self._tracks).items():
            x, y, w, h = track.bbox
            cv2.rectangle(out, (x, y), (x+w, y+h), confirmed_color, 2)
            shown = (id_overrides or {}).get(gid, gid)
            cv2.putText(out, f'G#{shown} {confirmed_label or "moving"}',
                        (x, max(16, y-6)), cv2.FONT_HERSHEY_SIMPLEX, .5, confirmed_color, 2)
            cv2.circle(out, (track.cx, track.cy), 3, point_color, -1)
        return out


class ReplayCameraView(CameraView):
    """Only the prediction-facing part is required when blobs are replayed."""
    def __init__(self, cam: int):
        self.cam = cam
        self._tracks = {}
        self.association_events = []


class Core2Adapter:
    stationary_resume_frozen = False

    def __init__(self, engine: Core2Engine, views=None):
        self.engine = engine
        self.views = views or {}
        self._outputs = []
        self._current_events = []
        self._first_frame = {}
        self._reservations = {}
        self._last_t = None
        self._pending = None
        self._frame = 0
        self._source_frame = 0
        self._builder = PredictionV3Builder()
        self._states = {}
        self._binder_notifications = []

    @staticmethod
    def canonical_global_id(gid):
        return int(gid)

    def set_inputs(self, blobs_by_cam, t, source_frame):
        if self._last_t is not None and t <= self._last_t:
            raise ValueError('core2 timestamps must increase')
        self._pending = (blobs_by_cam, float(t), int(source_frame))

    def update_all_tracks(self, tracks, frame_idx, **kwargs):
        del tracks, kwargs
        if self._pending is None:
            raise RuntimeError('missing core2 blob inputs')
        blobs, t, self._source_frame = self._pending
        self._pending = None
        self._outputs = self.engine.step(t, int(frame_idx), blobs)
        self._last_t, self._frame = t, int(frame_idx)
        self._current_events = [dict(event) for event in self.engine.drain_events()]
        states = {tr.gid: tr.state for tr in self.engine.tracks if tr.gid is not None}
        self._binder_notifications = [('lost', gid) for gid, state in states.items()
                                      if state is State.LOST and self._states.get(gid) is not State.LOST]
        self._binder_notifications += [('expired', gid) for gid in self._states if gid not in states]
        self._states = states
        ages = {tr.gid: tr.bbox_by_cam for tr in self.engine.tracks if tr.gid is not None}
        for output in self._outputs:
            self._first_frame.setdefault(output.gid, self._frame)
        live = self.engine.live_gids()
        self._first_frame = {gid: frame for gid, frame in self._first_frame.items() if gid in live}
        assignments = {name: {} for name in CAMERAS.values()}
        for cam, name in CAMERAS.items():
            if name not in self.views:
                continue
            tracks_by_gid = {}
            for output in self._outputs:
                if cam not in output.bbox_by_cam:
                    continue
                box = tuple(int(v) for v in output.bbox_by_cam[cam])
                sample = ages.get(output.gid, {}).get(cam)
                box_t = sample[1] if sample is not None else None
                age = max(0.0, t-box_t) if box_t is not None else None
                fresh = output.source == 'measured' and box_t == t
                x, y, w, h = box
                tracks_by_gid[output.gid] = SimpleNamespace(
                    track_id=output.gid, bbox=box, x=x, y=y, w=w, h=h,
                    cx=int(x+w/2), cy=int(y+h/2), status=TrackStatus.CONFIRMED,
                    consecutive_invisible_count=0 if fresh else 1,
                    observation_kind='detection' if fresh else 'held',
                    appearance=None, last_seen_frame=frame_idx if fresh else 0,
                    first_frame=self._first_frame[output.gid], state_name=output.state.name.lower(),
                    bbox_age_s=age, output_source=output.source)
                if fresh:
                    assignments[name][output.gid] = output.gid
            self.views[name]._tracks = tracks_by_gid
        return assignments

    def take_binder_notifications(self):
        notifications, self._binder_notifications = self._binder_notifications, []
        return notifications

    def get_global_id(self, camera_id, local_id):
        view = self.views.get(camera_id)
        return int(local_id) if view is not None and local_id in view._tracks else None

    @property
    def held_vehicles(self):
        rows = []
        ages = {tr.gid: tr.bbox_by_cam for tr in self.engine.tracks if tr.gid is not None}
        for output in self._outputs:
            if output.source == 'measured':
                continue
            bbox_age = {CAMERAS[cam]: max(0.0, self._last_t - sample[1])
                        for cam, sample in sorted(ages.get(output.gid, {}).items()) if cam in CAMERAS}
            rows.append({'global_id': output.gid, 'canonical_gid': output.gid,
                         'world_position': {'x': output.xy[0], 'y': output.xy[1], 'unit': 'cm'},
                         'prediction_source': output.source, 'bbox_age_s_by_cam': bbox_age})
        return rows

    def attach_prediction_state(self, payload):
        payload['observations'] = [row for row in payload.get('observations', [])
                                   if row.get('prediction_source') == 'measurement']
        for row in payload['observations']:
            for field in ('roi_clipped', 'roi_support_ratio', 'dark_foreground_rescued',
                          'mog_shadow_marker_ratio'):
                row.pop(field, None)  # Output carries no ROI evidence; do not invent it.
            row['bbox_age_s'] = 0.0
        payload['held_vehicles'] = self.held_vehicles
        payload['core2'] = self.engine.stats()

    def identity_prediction(self, frame_idx, *, camera_timestamps_ns=None):
        global_ids = {name: {gid: gid for gid, track in view._tracks.items()
                             if not track.consecutive_invisible_count}
                      for name, view in self.views.items()}
        payload = self._builder.build_frame(
            frame_idx=frame_idx, capture_unix_ns=0, wall_time_iso='',
            camera_timestamps_ns=camera_timestamps_ns or {}, camera_skew_ms=0,
            trackers=self.views, global_ids=global_ids, binders={}, manager=self,
            registry=self.to_json({}), parking_recovery=[], parked_identity_reservations={})
        self.attach_prediction_state(payload)
        payload['source_frame_idx'] = self._source_frame
        return payload

    def sync_parked_reservations(self, reservations, frame_idx):
        del frame_idx
        live = self.engine.live_gids()
        self._reservations = {int(r['global_id']): dict(r) for r in reservations
                              if r.get('global_id') is not None and int(r['global_id']) in live}
        return dict(self._reservations)

    def to_json(self, all_tracks):
        del all_tracks
        active, world, lifecycle = {}, {}, {}
        for output in self._outputs:
            obs = []
            for cam, name in CAMERAS.items():
                view = self.views.get(name)
                track = view._tracks.get(output.gid) if view else None
                if track is None or track.consecutive_invisible_count:
                    continue
                obs.append({'camera_id': name, 'local_track_id': output.gid,
                            'global_position': {'x': output.xy[0], 'y': output.xy[1]},
                            'shared_map_anchor': {'reference': 'core2_ground'}})
            if obs:
                active[str(output.gid)] = {'global_id': output.gid, 'observations': obs}
            world[str(output.gid)] = {'track_id': output.gid,
                                      'position': {'x': output.xy[0], 'y': output.xy[1], 'reference': 'cm'},
                                      'camera_ids': [o['camera_id'] for o in obs], 'observation_count': len(obs)}
        for track in self.engine.tracks:
            if track.gid is None or track.state is State.EXITED:
                continue
            lifecycle[str(track.gid)] = {
                'global_id': track.gid,
                'state': ('dormant' if track.state is State.LOST else
                          'held' if track.state is State.STOPPED else 'active'),
                'last_world': {'x': track.last_meas_xy[0], 'y': track.last_meas_xy[1]},
                'velocity_world': {'x': track.v[0], 'y': track.v[1]},
                'last_seen_time': track.last_meas_t,
                'created_at_frame': self._first_frame.get(track.gid),
            }
        return {'world_unit': 'cm', 'trail_render_only': True,
                'association_trajectory_policy': 'core2_measurements_only',
                'next_global_id': self.engine._next_gid,
                'retired_global_ids': {}, 'active_global_vehicles': active,
                'map_vehicles': world, 'identity_lifecycle': lifecycle,
                'parked_identity_reservations': {str(k): _json_safe(v) for k, v in self._reservations.items()},
                'held_vehicles': self.held_vehicles, 'pending_handoffs': [],
                'recent_events': [dict(event, global_id=event.get('gid'), frame=self._frame)
                                  for event in self._current_events]}

    def detach_parked_local_tracks(self, *args): return []
    def restore_local_binding(self, *args): return None
    def notify_track_lost(self, *args, **kwargs): return None
    def notify_track_expired(self, *args, **kwargs): return None
    def sync_occluded_identities(self, *args, **kwargs): return None
    def register_independent_tracks(self, *args, **kwargs): return None
    def observe_trajectories(self, *args, **kwargs): return None
    def register_stationary_reservations(self, *args, **kwargs): return None
    def motion_trail_polylines(self, *args, **kwargs): return []
    def draw_motion_trails(self, *args, **kwargs): return None
