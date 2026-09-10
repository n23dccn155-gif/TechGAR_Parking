"""Build the stable runtime payload consumed by the web applications."""

from __future__ import annotations

from typing import Any, Mapping


# v2 adds ``parking_episodes`` (PLAN 3.3): one authoritative record per
# physical parking occurrence, keyed by parking_episode_id. All v1 fields
# (slots/vehicles/aliases) are unchanged, so v1 consumers keep working in
# compatibility mode.
RUNTIME_SCHEMA_VERSION = 2
TERMINAL_IDENTITY_STATES = {"exited", "expired"}


def _slot_layout(calibration: Mapping[str, Any]) -> list[dict[str, Any]]:
    layout: list[dict[str, Any]] = []
    by_camera = calibration.get("parking_slots_world", {})
    if not isinstance(by_camera, Mapping):
        return layout
    for camera_id, slots in by_camera.items():
        if not isinstance(slots, list):
            continue
        for slot in slots:
            if not isinstance(slot, Mapping) or not slot.get("id"):
                continue
            layout.append(
                {
                    "slot_id": str(slot["id"]),
                    "camera_id": str(camera_id),
                    "polygon": slot.get("polygon", []),
                }
            )
    return layout


def build_runtime_snapshot(
    *,
    runtime_id: str,
    timestamp: str,
    published_at: str,
    frame_index: int,
    registry: Mapping[str, Any],
    parking_by_camera: Mapping[str, Mapping[str, Any]],
    camera_sizes: Mapping[str, tuple[int, int]],
    camera_timestamps_ns: Mapping[str, int],
    calibration: Mapping[str, Any],
    camera_skew_ms: float,
    source_mode: str,
    parking_episodes: Any = None,
    pending_parking_confirmations: Any = None,
    parking_pipeline: Any = None,
    applied_monotonic_ns: int | None = None,
) -> dict[str, Any]:
    """Normalize TechGAR internals without changing tracking decisions."""
    slots: list[dict[str, Any]] = []
    for camera_id, states in parking_by_camera.items():
        for slot_id, state in states.items():
            slots.append(
                {
                    "slot_id": str(slot_id),
                    "camera_id": str(camera_id),
                    **dict(state),
                }
            )

    map_vehicles = registry.get("map_vehicles", {})
    lifecycle = registry.get("identity_lifecycle", {})
    episodes = [dict(e) for e in (parking_episodes or [])]
    parked_owners = {int(e["global_id"]): e["slot_id"] for e in episodes if e.get("state") == "parked"}
    vehicles: list[dict[str, Any]] = []
    for global_id, identity in lifecycle.items():
        if not isinstance(identity, Mapping):
            continue
        state = str(identity.get("state", "dormant"))
        if state in TERMINAL_IDENTITY_STATES:
            continue
        # JSON writers normally serialize registry keys as strings, while
        # direct Python callers/tests may retain integer keys.  Accept both so
        # a live observed vehicle is never downgraded to ``observed=false``
        # merely because the contract was built before JSON encoding.
        active = map_vehicles.get(str(global_id))
        if not isinstance(active, Mapping):
            try:
                active = map_vehicles.get(int(global_id), {})
            except (TypeError, ValueError):
                active = {}
        position = active.get("position") or identity.get("last_world")
        if not isinstance(position, Mapping):
            continue
        camera_ids = active.get("camera_ids")
        if not isinstance(camera_ids, list) or not camera_ids:
            last_camera = identity.get("last_camera")
            camera_ids = [last_camera] if last_camera else []
        vehicles.append(
            {
                "global_id": int(identity.get("global_id", global_id)),
                "state": state,
                "observed": bool(active),
                "camera_ids": camera_ids,
                "position": {
                    "x": float(position.get("x", 0.0)),
                    "y": float(position.get("y", 0.0)),
                    "reference": registry.get("world_unit", "source_video_pixel"),
                },
                "parked_slot_id": parked_owners.get(int(identity.get("global_id", global_id))),
                "last_seen_frame": identity.get("last_seen_frame"),
                "last_seen_time": identity.get("last_seen_time"),
            }
        )

    clock_ns = applied_monotonic_ns if applied_monotonic_ns is not None else max(camera_timestamps_ns.values(), default=0)
    cameras = {
        camera_id: {
            "camera_id": camera_id,
            "width": int(size[0]),
            "height": int(size[1]),
            "captured_at_monotonic_ns": int(camera_timestamps_ns.get(camera_id, 0)),
            "age_ms": max(0.0, (clock_ns - camera_timestamps_ns.get(camera_id, 0)) / 1_000_000.0),
            "online": camera_timestamps_ns.get(camera_id, 0) > 0 and
                0 <= clock_ns - camera_timestamps_ns.get(camera_id, 0) <= 5_000_000_000,
        }
        for camera_id, size in camera_sizes.items()
    }
    world = calibration.get("world", {})
    return {
        "schema_version": RUNTIME_SCHEMA_VERSION,
        "runtime_id": str(runtime_id),
        "timestamp": timestamp,
        "published_at": published_at,
        "frame_index": int(frame_index),
        "source_mode": source_mode,
        "coordinate_space": {
            "unit": registry.get("world_unit", world.get("unit", "source_video_pixel")),
            "bounds": world.get("bounds") or world.get("full_view_bounds"),
            "calibration_id": calibration.get("calibration_id"),
            "calibration_status": calibration.get("calibration_status", "legacy_unverified"),
        },
        "camera_skew_ms": round(float(camera_skew_ms), 3),
        "cameras": cameras,
        "parking_slots": slots,
        "slot_layout": _slot_layout(calibration),
        "vehicles": sorted(vehicles, key=lambda item: item["global_id"]),
        "pending_handoffs": registry.get("pending_handoffs", []),
        # Schema v2: authoritative parking episodes from the binder.
        "parking_episodes": episodes,
        # Provisional evidence is diagnostic only. Consumers must wait for a
        # parking episode before declaring success.
        "pending_parking_confirmations": [
            dict(item) for item in (pending_parking_confirmations or [])
        ],
        "parking_pipeline": {
            str(camera_id): dict(status)
            for camera_id, status in (parking_pipeline or {}).items()
        },
        # Durable alias state lets consumers recover even if they missed the
        # short rolling event list containing ``global_id_merged``.
        "retired_global_ids": registry.get("retired_global_ids", {}),
        "recent_events": registry.get("recent_events", [])[-100:],
    }
