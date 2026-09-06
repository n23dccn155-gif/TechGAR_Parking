"""Conservative, camera-local protection of independently observed vehicles.

No colour comparison can prove a *merged* blob belongs to one member. Geometry
opens the group first; appearance is used only to validate separated regions.
Predicted/partitioned pixels never refresh the last real observation time.
"""
from dataclasses import dataclass, field
from itertools import combinations

import cv2
import numpy as np


@dataclass
class OcclusionGroup:
    members: tuple
    references: dict
    created_at: float
    active: bool = False
    recovering: int = 0
    last_frame: int = -1
    expires_at: float = float('inf')


class OcclusionGuard:
    def __init__(self, timeout=3.0):
        self.timeout = float(timeout)
        self.groups = {}
        self.independent_pairs = set()
        self.frozen = set()
        self.now = 0.0
        self.frame_idx = 0
        self.events = []

    @staticmethod
    def reference(track):
        samples = getattr(track, 'clean_observations', [])
        if samples:
            widths = [sample[2][2] for sample in samples]
            heights = [sample[2][3] for sample in samples]
            return float(np.median(widths)), float(np.median(heights))
        return float(track.w), float(track.h)

    def center(self, track, predictions, reference):
        px, py = predictions.get(track.track_id, (track.cx, track.cy))
        samples = getattr(track, 'measurement_observations', None) or getattr(track, 'clean_observations', [])
        if len(samples) >= 2 and self.now > samples[-1][0]:
            velocities = [(np.asarray(b[1], float)-a[1])/(b[0]-a[0])
                          for a,b in zip(samples,samples[1:]) if b[0]-a[0] > 1e-6]
            if velocities:
                velocity = np.median(velocities, axis=0)
                px, py = np.asarray(samples[-1][1]) + velocity * min(self.timeout, self.now-samples[-1][0])
        return np.array([px, py - reference[1] / 2.0])

    def prepare(self, tracks, predictions, now, frame_idx):
        self.now, self.frame_idx = float(now), int(frame_idx)
        self.frozen = set()
        self.events = []
        for key, group in list(self.groups.items()):
            if any(tid not in tracks for tid in key) or self.now > group.expires_at:
                self.events.append({'type': 'occlusion_group_expired', 'local_track_ids': list(key)})
                for tid in key:
                    if tid in tracks:
                        tracks[tid].occlusion_group = None
                del self.groups[key]
        eligible = []
        for tid, track in tracks.items():
            samples = getattr(track, 'clean_observations', [])
            last_observed = getattr(track, 'last_seen_timestamp_s', samples[-1][0] if samples else 0.)
            if len(samples) < 3 or self.now - float(last_observed or 0.) > self.timeout:
                continue
            eligible.append(tid)
        for left, right in combinations(eligible, 2):
            key = tuple(sorted((left, right)))
            if key in self.groups:
                continue
            a, b = tracks[left], tracks[right]
            ar, br = self.reference(a), self.reference(b)
            delta = np.abs(self.center(a, predictions, ar) - self.center(b, predictions, br))
            # Independent clean boxes, close enough that the next contour may
            # join. Heavy overlap has no proof of two independent vehicles.
            last_a, last_b = a.clean_observations[-1][2], b.clean_observations[-1][2]
            ax, ay, aw, ah = last_a; bx, by, bw, bh = last_b
            inter = max(0, min(ax+aw, bx+bw)-max(ax,bx)) * max(0, min(ay+ah,by+bh)-max(ay,by))
            if inter / max(1, min(aw*ah,bw*bh)) > .20:
                continue
            gap = np.maximum(delta - (np.array(ar) + np.array(br)) / 2, 0)
            if np.linalg.norm(gap) > .4 * max(np.hypot(*ar), np.hypot(*br)):
                continue
            self.groups[key] = OcclusionGroup(key, {left: ar, right: br}, self.now)
            self.independent_pairs.add(key)
        # Watch groups disappear when vehicles are no longer nearby. Active
        # groups retain the fixed expiry established by their last clean sample.
        for key, group in list(self.groups.items()):
            if not group.active:
                a, b = key
                distance = np.linalg.norm(self.center(tracks[a], predictions, group.references[a]) -
                                          self.center(tracks[b], predictions, group.references[b]))
                if distance > 3 * max(np.hypot(*group.references[a]), np.hypot(*group.references[b])):
                    del self.groups[key]

    def covering_group(self, box, tracks, predictions):
        x, y, w, h = box
        covering = []
        for group in list(self.groups.values()):
            contained = []
            for tid in group.members:
                cx, cy = self.center(tracks[tid], predictions, group.references[tid])
                pad = .15 * min(group.references[tid])
                contained.append(x-pad <= cx <= x+w+pad and y-pad <= cy <= y+h+pad)
            median_area = np.median([np.prod(r) for r in group.references.values()])
            if all(contained) and w*h >= 1.6 * median_area:
                covering.append(group)
        if not covering:
            return None
        members = tuple(sorted({tid for group in covering for tid in group.members}))
        if members not in self.groups:
            references = {tid: ref for group in covering for tid, ref in group.references.items()}
            self.groups[members] = OcclusionGroup(members, references, self.now, active=True,
                expires_at=min(tracks[tid].clean_observations[-1][0] for tid in members)+self.timeout)
        return self.groups[members]

    def activate(self, group, tracks):
        if not group.active:
            group.active = True
            group.recovering = 0
            # An ambiguous blob cannot keep the group alive forever.
            last_clean = min(float(getattr(tracks[tid], 'last_seen_timestamp_s', None)
                                   or tracks[tid].clean_observations[-1][0]) for tid in group.members)
            group.expires_at = last_clean + self.timeout
            self.events.append({'type': 'occlusion_group_opened', 'local_track_ids': list(group.members)})
        for tid in group.members:
            self.frozen.add(tid)
            tracks[tid].occlusion_group = group.members
            tracks[tid].observation_kind = 'occluded_prediction'
            tracks[tid].last_ambiguous_timestamp_s = self.now
            tracks[tid].last_ambiguous_frame = self.frame_idx

    def annotate(self, detections, tracks, predictions):
        for detection in detections:
            if detection.get('observation_kind') == 'watershed_provisional':
                continue
            group = self.covering_group(detection['box'], tracks, predictions)
            if group is not None:
                self.activate(group, tracks)
                detection.update(ambiguous_merged=True, occlusion_members=group.members,
                                 observation_kind='merged')

    def partition(self, frame, mask, box, tracks, predictions, group):
        """Return provisional real-pixel regions, never fabricated rectangles."""
        self.activate(group, tracks)
        if len(group.members) != 2:
            return []
        x, y, w, h = box
        crop_mask = mask[y:y+h, x:x+w]
        distance = cv2.distanceTransform(crop_mask, cv2.DIST_L2, 5)
        ys, xs = np.nonzero(distance > 0)
        if len(xs) < 40:
            return []
        points = np.column_stack((xs, ys))
        seeds = []
        for tid in group.members:
            center = self.center(tracks[tid], predictions, group.references[tid]) - [x, y]
            distances = np.linalg.norm(points - center, axis=1)
            index = int(np.argmin(distances))
            if distances[index] > .25 * np.hypot(*group.references[tid]):
                return []
            seeds.append(tuple(points[index]))
        if np.linalg.norm(np.subtract(*seeds)) < .2 * min(min(r) for r in group.references.values()):
            return []
        markers = np.zeros((h, w), np.int32)
        markers[crop_mask == 0] = 1
        for label, (sx, sy) in enumerate(seeds, 2):
            cv2.circle(markers, (int(sx), int(sy)), 2, label, -1)
        markers = cv2.watershed(frame[y:y+h, x:x+w].copy(), markers)
        regions = []
        for label, tid in enumerate(group.members, 2):
            selection = np.uint8((markers == label) & (crop_mask > 0)) * 255
            points = cv2.findNonZero(selection)
            if points is None or len(points) < 20:
                return []
            rx, ry, rw, rh = cv2.boundingRect(points)
            ratio = rw*rh / max(1, np.prod(group.references[tid]))
            if not .35 <= ratio <= 1.8:
                return []
            regions.append((tid, (x+rx, y+ry, rw, rh), selection))
        self.events.append({'type': 'watershed_partition_provisional', 'local_track_ids': list(group.members)})
        return regions

    def gate_assignments(self, assignments, costs, track_ids, tracks, detections, margin):
        """Validate a *whole* two-car assignment, then require three frames."""
        accepted = list(assignments)
        deferred_tracks, deferred_detections = set(), set()
        pairs = {item[0]: item[1] for item in assignments}
        for group in self.groups.values():
            if not group.active:
                continue
            ids = group.members
            valid = len(ids) == 2 and all(tid in pairs for tid in ids)
            if valid:
                a, b = (track_ids.index(tid) for tid in ids)
                x, y = (pairs[tid] for tid in ids)
                direct = costs[a,x] + costs[b,y]
                swapped = costs[a,y] + costs[b,x]
                valid = bool(swapped - direct >= 2 * margin and direct < 1.2)
            if group.last_frame != self.frame_idx:
                group.recovering = group.recovering + 1 if valid else 0
                group.last_frame = self.frame_idx
            # Three consistent partitions may restore geometry, but colour
            # and parking evidence resume only after a natural clean split.
            if valid and group.recovering >= 3:
                group.active = False
                group.expires_at = float('inf')
                for tid in ids:
                    tracks[tid].occlusion_group = None
                    if detections[pairs[tid]].get('observation_kind') == 'watershed_provisional':
                        detections[pairs[tid]]['observation_kind'] = 'watershed_validated'
                        detections[pairs[tid]]['appearance_trusted'] = False
                self.events.append({'type': 'occlusion_group_recovered', 'local_track_ids': list(ids)})
                continue
            deferred_tracks.update(ids)
            self.frozen.update(ids)
            for tid in ids:
                if tid in pairs:
                    deferred_detections.add(pairs[tid])
            # Suppress every member-like candidate, including an alternative
            # LAPJV did not select, so it cannot create a new local fragment.
            rows = [track_ids.index(tid) for tid in ids]
            deferred_detections.update(np.flatnonzero(np.any(costs[rows] < 1.0, axis=0)).tolist())
        accepted = [item for item in accepted if item[0] not in deferred_tracks]
        return accepted, deferred_tracks, deferred_detections
