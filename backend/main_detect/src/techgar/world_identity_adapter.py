"""CrossCameraManager-facing bridge for the measurement-only world kernel.

This adapter deliberately keeps predictions/held positions out of the local
track bindings. A missing vehicle may appear in the registry as ``held``, but
cannot become a synthetic camera measurement or a binder track.
"""

from __future__ import annotations

import math
from typing import Any, Mapping

import numpy as np

from .world_identity_kernel import GroundGeometry, Measurement, WorldIdentityKernel


class WorldIdentityAdapter:
    """Small compatibility surface used by two_camera, binder and writer."""

    stationary_resume_frozen = False

    def __init__(
        self,
        geometry: GroundGeometry,
        camera_transforms: Mapping[str, np.ndarray],
        *,
        bootstrap_first_frame: bool = True,
        dump_path: str | None = None,
    ) -> None:
        self.kernel = WorldIdentityKernel(
            geometry, bootstrap_first_frame=bootstrap_first_frame
        )
        self.camera_transforms = {
            str(camera): np.asarray(matrix, dtype=np.float64)
            for camera, matrix in camera_transforms.items()
        }
        for camera, matrix in self.camera_transforms.items():
            if matrix.shape != (3, 3):
                raise ValueError(f"World transform for {camera} must be 3x3")
        self.world_unit = "cm"
        # P37/T6c DEBUG: optional per-frame dump of exactly what the kernel is
        # given and what it returns. Off by default; must not change behaviour.
        self._dump_path = dump_path
        self._dump_handle = None
        if dump_path:
            self._dump_handle = open(dump_path, "w", encoding="utf-8")
        self._local_to_global: dict[tuple[str, int], int] = {}
        self._observed: dict[tuple[str, int], dict[str, Any]] = {}
        self._parked_reservations: dict[int, dict] = {}
        self._global_created_frames: dict[int, int] = {}
        self._last_seen_frames: dict[int, int] = {}
        self._recent_events: list[dict] = []
        self._held: list[dict] = []
        self._last_clock_s: float | None = None
        self._frame_idx = 0

    @staticmethod
    def canonical_global_id(gid: int) -> int:
        return int(gid)

    def get_global_id(self, camera_id: str, local_id: int) -> int | None:
        return self._local_to_global.get((str(camera_id), int(local_id)))

    def _world_point(self, camera_id: str, bbox: tuple[float, ...]) -> tuple[float, float]:
        """Use the same bbox-centre measurement point as the proven T4 replay."""
        x, y, w, h = bbox
        vector = self.camera_transforms[camera_id] @ np.asarray(
            (x + w / 2.0, y + h / 2.0, 1.0), dtype=np.float64
        )
        if not np.isfinite(vector).all() or abs(vector[2]) < 1e-12:
            raise ValueError(f"Nonfinite world projection for {camera_id}: {bbox!r}")
        return (float(vector[0] / vector[2]), float(vector[1] / vector[2]))

    def update_all_tracks(
        self,
        tracks: Mapping[str, Mapping[int, Any]],
        frame_idx: int,
        *,
        camera_timestamps_s: Mapping[str, float],
        protected_local_keys=None,
        protected_global_ids=None,
    ) -> dict[str, dict[int, int]]:
        del protected_local_keys, protected_global_ids  # kernel owns association
        self._frame_idx = int(frame_idx)
        measurements: list[Measurement] = []
        # P37/T6c: song song voi `measurements`, giu metadata de dump
        dump_rows: list[dict] = []
        for camera_id, camera_tracks in sorted(tracks.items()):
            for local_id, track in sorted(camera_tracks.items()):
                # observable_tracks may contain intentionally retained LOST
                # fragments; these are NOT detections for L1/L5.
                if getattr(track, "prediction_source", None) != "measurement":
                    continue
                bbox = tuple(float(value) for value in track.bbox)
                world = self._world_point(str(camera_id), bbox)
                # P37/T4e-a: evidence already present on the tracker's local
                # track. Advisory only -- the kernel must not change behaviour.
                roi_clipped = bool(getattr(track, "roi_clipped", False))
                roi_support_ratio = float(
                    getattr(track, "roi_support_ratio", 1.0) or 1.0
                )
                local_age_frames = int(getattr(track, "age", 0) or 0)
                # 25 encoded fps; recorded so an offline consumer never has to
                # guess the frame rate a local age was measured at.
                local_age_s = local_age_frames / 25.0
                measurements.append(Measurement(
                    camera_id=str(camera_id),
                    world_xy_cm=world,
                    bbox=bbox,
                    local_track_id=int(local_id),
                    roi_clipped=roi_clipped,
                    roi_support_ratio=roi_support_ratio,
                    local_age_frames=local_age_frames,
                    local_age_s=local_age_s,
                ))
                if self._dump_handle is not None:
                    dump_rows.append(
                        {
                            "camera_id": str(camera_id),
                            "local_track_id": int(local_id),
                            "bbox": list(bbox),
                            "world_cm": [round(world[0], 3), round(world[1], 3)],
                            "track_state": str(getattr(track, "track_state", None)
                                               or getattr(track, "status", None)),
                            "prediction_source": str(
                                getattr(track, "prediction_source", None)
                            ),
                            "association_state": str(
                                getattr(track, "association_state", None)
                            ),
                            "roi_clipped": roi_clipped,
                            "roi_support_ratio": round(roi_support_ratio, 4),
                            "local_age_frames": local_age_frames,
                            "local_age_s": round(local_age_s, 3),
                        }
                    )

        if not camera_timestamps_s:
            raise ValueError("World identity requires camera source timestamps")
        timestamp_s = max(float(t) for t in camera_timestamps_s.values())
        # Some live sources repeat a capture timestamp. Keep physical elapsed
        # time intact where possible while satisfying the kernel's strict clock.
        if self._last_clock_s is not None and timestamp_s <= self._last_clock_s:
            timestamp_s = math.nextafter(self._last_clock_s, math.inf)
        result = self.kernel.step(
            measurements,
            timestamp_s,
            occupied_slots=tuple(
                item["slot_id"] for item in self._parked_reservations.values()
                if item.get("slot_id") is not None
            ),
            emit_held=True,
        )
        self._last_clock_s = timestamp_s
        self._local_to_global.clear()
        self._observed.clear()
        assignments: dict[str, dict[int, int]] = {str(cam): {} for cam in tracks}
        for assigned in result.measurements:
            if assigned.gid is None:
                continue
            observation = assigned.measurement
            key = (str(observation.camera_id), int(observation.local_track_id))
            gid = int(assigned.gid)
            assignments[key[0]][key[1]] = gid
            self._local_to_global[key] = gid
            x, y, w, h = observation.bbox
            self._observed[key] = {
                "camera_id": key[0],
                "local_track_id": key[1],
                "local_position": {"x": round(x + w / 2.0, 2), "y": round(y + h / 2.0, 2)},
                "association_source": "measurement",
                "prediction_age_s": 0.0,
                "shared_map_anchor": {
                    "x": round(x + w / 2.0, 2),
                    "y": round(y + h / 2.0, 2),
                    "reference": "bbox_center",
                },
                "global_position": {
                    "x": round(observation.world_xy_cm[0], 2),
                    "y": round(observation.world_xy_cm[1], 2),
                },
            }
            self._last_seen_frames[gid] = self._frame_idx
        self._held = [
            {
                "canonical_gid": int(vehicle.gid),
                "global_id": int(vehicle.gid),
                "world_position": {
                    "x": round(vehicle.xy_cm[0], 2),
                    "y": round(vehicle.xy_cm[1], 2),
                    "unit": "cm",
                },
                "prediction_source": "held",
            }
            for vehicle in result.held
        ]
        for gid in result.newly_created_gids:
            self._global_created_frames[int(gid)] = self._frame_idx
            self._recent_events.append({
                "type": "global_id_created", "global_id": int(gid),
                "frame": self._frame_idx, "source": "world_kernel",
            })
        self._recent_events = self._recent_events[-100:]
        if self._dump_handle is not None:
            self._dump_frame(dump_rows, timestamp_s, result)
        return assignments

    def _dump_frame(self, dump_rows, timestamp_s, result) -> None:
        """P37/T6c: ghi DUNG cai adapter dua vao kernel + GID kernel tra ra.

        Moi dong = 1 frame. ``input`` giu nguyen thu tu da nap; ``assigned`` la
        cap (cam, local_track_id) -> gid kernel tra ve (None = khong gan).
        """
        import json

        assigned_by_key = {}
        for assigned in result.measurements:
            observation = assigned.measurement
            assigned_by_key[
                (str(observation.camera_id), int(observation.local_track_id))
            ] = assigned.gid
        for row in dump_rows:
            key = (row["camera_id"], row["local_track_id"])
            row["kernel_gid"] = (
                int(assigned_by_key[key])
                if assigned_by_key.get(key) is not None
                else None
            )
        payload = {
            "frame_idx": int(self._frame_idx),
            "timestamp_s": float(timestamp_s),
            "n_measurements": len(dump_rows),
            "n_assigned": sum(1 for row in dump_rows if row["kernel_gid"] is not None),
            "measurements": dump_rows,
        }
        self._dump_handle.write(json.dumps(payload, ensure_ascii=False) + "\n")
        self._dump_handle.flush()

    def close_dump(self) -> None:
        """P37/T6c: dong file dump neu dang mo."""
        if self._dump_handle is not None:
            self._dump_handle.close()
            self._dump_handle = None

    @property
    def held_vehicles(self) -> list[dict]:
        return [dict(row) for row in self._held]

    def attach_prediction_state(self, payload: dict[str, Any]) -> None:
        """Keep measured observations and export silent positions as held rows."""
        payload["observations"] = [
            row for row in payload.get("observations", [])
            if row.get("prediction_source") == "measurement"
        ]
        payload["held_vehicles"] = self.held_vehicles

    def sync_parked_reservations(self, reservations, frame_idx: int) -> dict[int, dict]:
        """Return the accepted ownership records required by SlotVehicleBinder."""
        del frame_idx
        known = {int(t.gid) for t in self.kernel.tracks if t.gid is not None and not t.retired}
        accepted: dict[int, dict] = {}
        for reservation in reservations:
            raw_gid = reservation.get("global_id")
            if raw_gid is None:
                continue
            gid = int(raw_gid)
            if gid in known:
                accepted[gid] = dict(reservation)
        self._parked_reservations = accepted
        return accepted

    def detach_parked_local_tracks(self, frame_idx: int) -> list:
        del frame_idx
        return []  # never suspend measured tracks on behalf of the world kernel

    def restore_local_binding(self, cam_id, local_id, gid, frame_idx) -> None:
        del cam_id, local_id, gid, frame_idx

    @staticmethod
    def _frozen_member_kept(track) -> bool:
        return False

    def notify_track_lost(self, cam_id, local_id, track, frame_idx, **kwargs) -> None:
        del track, frame_idx, kwargs
        self._local_to_global.pop((str(cam_id), int(local_id)), None)

    def notify_track_expired(self, cam_id, local_id, *args, **kwargs) -> None:
        del args, kwargs
        self._local_to_global.pop((str(cam_id), int(local_id)), None)

    def bind_external_id(self, cam_id, local_id, gid, *args, **kwargs) -> int:
        del args, kwargs
        # Compatibility for external callers. World mode does not run the
        # legacy recovery path; only kernel.step can confirm a measurement.
        return int(gid)

    def sync_occluded_identities(self, *args, **kwargs) -> None:
        pass

    def register_independent_tracks(self, *args, **kwargs) -> None:
        pass

    def observe_trajectories(self, *args, **kwargs) -> None:
        pass

    def register_stationary_reservations(self, *args, **kwargs) -> None:
        pass

    def motion_trail_polylines(self, *args, **kwargs) -> list:
        return []

    def draw_motion_trails(self, *args, **kwargs) -> None:
        pass

    @staticmethod
    def _json_safe(value: Any) -> Any:
        """Convert binder-held NumPy appearance arrays before status writes."""
        if isinstance(value, np.ndarray):
            return value.tolist()
        if isinstance(value, np.generic):
            return value.item()
        if isinstance(value, Mapping):
            return {str(key): WorldIdentityAdapter._json_safe(item) for key, item in value.items()}
        if isinstance(value, (tuple, list)):
            return [WorldIdentityAdapter._json_safe(item) for item in value]
        return value

    def to_json(self, all_tracks: Mapping[str, Mapping[int, Any]]) -> dict:
        del all_tracks  # only actual kernel measurements are public observations
        active: dict[str, dict] = {}
        for (camera_id, local_id), observation in sorted(self._observed.items()):
            gid = self._local_to_global[(camera_id, local_id)]
            item = active.setdefault(str(gid), {"global_id": gid, "observations": []})
            item["observations"].append(dict(observation))
        map_vehicles = {}
        for key, item in active.items():
            observations = item["observations"]
            map_vehicles[key] = {
                "track_id": int(key),
                "position": {
                    "x": round(sum(row["global_position"]["x"] for row in observations) / len(observations), 2),
                    "y": round(sum(row["global_position"]["y"] for row in observations) / len(observations), 2),
                    "reference": "cm",
                },
                "camera_ids": [row["camera_id"] for row in observations],
                "observation_count": len(observations),
            }
        held_by_gid = {int(row["global_id"]): row for row in self._held}
        lifecycle = {}
        for track in self.kernel.tracks:
            if track.gid is None:
                continue
            gid = int(track.gid)
            if track.retired:
                state = "retired"
            elif str(gid) in active:
                state = "active"
            elif gid in held_by_gid:
                state = "held"
            else:
                state = "dormant"
            pos = held_by_gid.get(gid, {}).get("world_position") or {
                "x": round(track.xy[0], 2), "y": round(track.xy[1], 2),
            }
            camera = next(iter(sorted(track.cameras)), None)
            lifecycle[str(gid)] = {
                "global_id": gid,
                "state": state,
                "last_camera": camera,
                "last_local_track_id": track.last_ids.get(camera) if camera else None,
                "last_world": {"x": pos["x"], "y": pos["y"]},
                "velocity_world": {"x": round(track.velocity[0], 3), "y": round(track.velocity[1], 3)},
                "last_seen_frame": self._last_seen_frames.get(gid),
                "created_at_frame": self._global_created_frames.get(gid),
                "last_seen_time": track.last_seen_s,
                "recent_observed_path": [{"x": round(track.xy[0], 2), "y": round(track.xy[1], 2), "time_s": track.last_seen_s}],
            }
        return {
            "world_unit": "cm",
            "next_global_id": self.kernel._gid + 1,
            "trail_render_only": True,
            "association_trajectory_policy": "world_kernel_measurements_only",
            "retired_global_ids": {},
            "active_global_vehicles": active,
            "map_vehicles": map_vehicles,
            "identity_lifecycle": lifecycle,
            "parked_identity_reservations": {
                str(gid): self._json_safe(reservation)
                for gid, reservation in sorted(self._parked_reservations.items())
            },
            "held_vehicles": self.held_vehicles,
            "pending_handoffs": [],
            "recent_events": list(self._recent_events),
        }
