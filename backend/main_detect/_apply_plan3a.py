# -*- coding: utf-8 -*-
"""PLAN_full.md section 3 (part A): parking episodes in binder + snapshot v2."""
import io
import sys

BINDER = r"D:\TechGar2\backend\main_detect\src\techgar\slot_vehicle_binder.py"
CONTRACT = r"D:\TechGar2\backend\main_detect\src\techgar\runtime_contract.py"
TWOCAM = r"D:\TechGar2\backend\main_detect\two_camera.py"


def patch(path, pairs):
    with io.open(path, "r", encoding="utf-8") as fh:
        text = fh.read()
    for old, new in pairs:
        if old not in text:
            print("MISS in %s: %r" % (path, old[:100]))
            sys.exit(1)
        if text.count(old) != 1:
            print("AMBIGUOUS in %s (%d): %r" % (path, text.count(old), old[:100]))
            sys.exit(1)
        text = text.replace(old, new)
    with io.open(path, "w", encoding="utf-8", newline="\n") as fh:
        fh.write(text)
    print("patched", path)


binder_pairs = [
    # init: episode stores
    (
        """        self._arrival_claims: Dict[Tuple[str, int], ArrivalClaim] = {}
        self._events: Deque[dict] = deque(maxlen=500)
""",
        """        self._arrival_claims: Dict[Tuple[str, int], ArrivalClaim] = {}
        # One episode per physical parking occurrence. Sessions consume these
        # by parking_episode_id instead of re-deriving parked state from
        # polling counters (PLAN 3.1).
        self._parking_episodes: Deque[dict] = deque(maxlen=64)
        self._episode_by_slot: Dict[str, dict] = {}
        self._events: Deque[dict] = deque(maxlen=500)
""",
    ),
    # helpers + public accessor
    (
        """    def _best_arrival_slot(self, bbox: BBox) -> Optional[Tuple[str, float]]:
""",
        """    def parking_episodes(self) -> List[dict]:
        \"\"\"Parking episode records for runtime snapshot consumers.

        Each episode describes one physical parking occurrence: the slot,
        the canonical owner GID, the lifecycle state, and both clocks - the
        evidence clock (when the camera saw it) and the application clock
        (when the binder decided).
        \"\"\"
        return [dict(episode) for episode in self._parking_episodes]

    def _open_parking_episode(
        self,
        global_id: int,
        slot_id: str,
        frame_idx: int,
        reason: str,
    ) -> dict:
        binding = self._bindings.get(slot_id)
        current = self._episode_by_slot.get(slot_id)
        if (
            current is not None
            and current["global_id"] == int(global_id)
            and current["state"] in {"pending", "parked"}
        ):
            # Rebinding the same owner (jitter, strong-overlap refresh) must
            # not create a second episode: sessions key their one-time
            # completion notification on the episode id.
            return current
        episode = {
            "parking_episode_id": (
                f"{slot_id}:G{int(global_id)}:F{int(frame_idx)}"
            ),
            "global_id": int(global_id),
            "slot_id": str(slot_id),
            "state": "parked",
            "evidence_frame_idx": (
                binding.vision_evidence_frame_idx
                if binding is not None
                else None
            ),
            "evidence_timestamp_s": (
                binding.vision_evidence_timestamp_s
                if binding is not None
                else None
            ),
            "applied_frame_idx": int(self._last_frame_idx),
            "applied_timestamp_s": float(self._last_timestamp_s),
            "reason": str(reason),
        }
        self._episode_by_slot[slot_id] = episode
        self._parking_episodes.append(episode)
        self._event(
            "parking_episode_opened",
            global_id=int(global_id),
            slot_id=str(slot_id),
            parking_episode_id=episode["parking_episode_id"],
            applied_frame_idx=int(self._last_frame_idx),
        )
        return episode

    def _transition_parking_episode(
        self,
        slot_id: str,
        new_state: str,
        reason: str,
        global_id: Optional[int] = None,
    ) -> None:
        episode = self._episode_by_slot.get(slot_id)
        if episode is None or episode["state"] == new_state:
            return
        if global_id is not None and episode["global_id"] != int(global_id):
            return
        episode["state"] = new_state
        episode["reason"] = str(reason)
        episode["applied_frame_idx"] = int(self._last_frame_idx)
        episode["applied_timestamp_s"] = float(self._last_timestamp_s)
        self._event(
            "parking_episode_state_changed",
            global_id=episode["global_id"],
            slot_id=str(slot_id),
            parking_episode_id=episode["parking_episode_id"],
            state=new_state,
            reason=str(reason),
        )

    def _best_arrival_slot(self, bbox: BBox) -> Optional[Tuple[str, float]]:
""",
    ),
    # bind -> open episode
    (
        """        binding.tracking_state = "parked"
        self._vehicle_to_slot[global_id] = slot_id
        state = self._vehicle_states[global_id]
        state.movement_state = "parked"
""",
        """        binding.tracking_state = "parked"
        self._vehicle_to_slot[global_id] = slot_id
        self._open_parking_episode(
            global_id, slot_id, frame_idx, "binder_binding_confirmed"
        )
        state = self._vehicle_states[global_id]
        state.movement_state = "parked"
""",
    ),
    # release -> departing
    (
        """    def _release_vehicle(self, global_id: int, frame_idx: int, reason: str = "left_roi") -> None:
        slot_id = self._vehicle_to_slot.pop(global_id, None)
        if slot_id is None:
            return
        binding = self._bindings.get(slot_id)
""",
        """    def _release_vehicle(self, global_id: int, frame_idx: int, reason: str = "left_roi") -> None:
        slot_id = self._vehicle_to_slot.pop(global_id, None)
        if slot_id is None:
            return
        self._transition_parking_episode(
            slot_id, "departing", f"released:{reason}", global_id=global_id
        )
        binding = self._bindings.get(slot_id)
""",
    ),
    # vision-empty detach -> departing
    (
        """        global_id = int(token.global_id)
        if self._vehicle_to_slot.get(global_id) == binding.slot_id:
            self._vehicle_to_slot.pop(global_id, None)
        binding.vehicle_id = None
        binding.tracking_occupied = False
        binding.tracking_state = "recovery_pending"
""",
        """        global_id = int(token.global_id)
        if self._vehicle_to_slot.get(global_id) == binding.slot_id:
            self._vehicle_to_slot.pop(global_id, None)
        self._transition_parking_episode(
            binding.slot_id,
            "departing",
            "vision_confirmed_empty",
            global_id=global_id,
        )
        binding.vehicle_id = None
        binding.tracking_occupied = False
        binding.tracking_state = "recovery_pending"
""",
    ),
    # false-empty rearm -> owner still parked
    (
        """            self._event(
                "departure_token_rearmed_after_vision_rebound",
""",
        """            self._transition_parking_episode(
                token.slot_id,
                "parked",
                "false_empty_restored",
                global_id=token.global_id,
            )
            self._event(
                "departure_token_rearmed_after_vision_rebound",
""",
    ),
    # false-empty cancel -> owner restored
    (
        """        self._departure_tokens.pop(token.slot_id, None)
        self._event(
            "departure_token_cancelled",
            global_id=token.global_id,
            slot_id=token.slot_id,
            reason="false_empty",
        )
""",
        """        self._departure_tokens.pop(token.slot_id, None)
        self._transition_parking_episode(
            token.slot_id,
            "parked",
            "false_empty_restored",
            global_id=token.global_id,
        )
        self._event(
            "departure_token_cancelled",
            global_id=token.global_id,
            slot_id=token.slot_id,
            reason="false_empty",
        )
""",
    ),
    # token consumed by departing vehicle -> released
    (
        """    ) -> int:
        self._departure_tokens.pop(token.slot_id, None)
        self._pending_release.pop(token.slot_id, None)
""",
        """    ) -> int:
        self._departure_tokens.pop(token.slot_id, None)
        self._pending_release.pop(token.slot_id, None)
        self._transition_parking_episode(
            token.slot_id,
            "released",
            "departure_confirmed",
            global_id=token.global_id,
        )
""",
    ),
    # token expired -> released
    (
        """            self._departure_tokens.pop(slot_id, None)
            self._event(
                "parked_id_recovery_expired",
""",
        """            self._departure_tokens.pop(slot_id, None)
            self._transition_parking_episode(
                slot_id,
                "released",
                "recovery_expired",
                global_id=token.global_id,
            )
            self._event(
                "parked_id_recovery_expired",
""",
    ),
    # GID remap keeps episodes canonical
    (
        """    def remap_vehicle_ids(self, canonicalize: Callable[[int], int]) -> None:
        \"\"\"Move parked bindings/states to canonical IDs after a global-ID merge.\"\"\"
        remapped_claims: Dict[Tuple[str, int], ArrivalClaim] = {}
""",
        """    def remap_vehicle_ids(self, canonicalize: Callable[[int], int]) -> None:
        \"\"\"Move parked bindings/states to canonical IDs after a global-ID merge.\"\"\"
        for episode in self._parking_episodes:
            episode["global_id"] = int(
                canonicalize(int(episode["global_id"]))
            )
        remapped_claims: Dict[Tuple[str, int], ArrivalClaim] = {}
""",
    ),
    # removed slot closes its episode
    (
        """            binding = self._bindings.pop(slot_id)
            self._pending_release.pop(slot_id, None)
""",
        """            binding = self._bindings.pop(slot_id)
            self._pending_release.pop(slot_id, None)
            self._transition_parking_episode(
                slot_id, "released", "parking_slot_removed"
            )
            self._episode_by_slot.pop(slot_id, None)
""",
    ),
]

contract_pairs = [
    (
        """RUNTIME_SCHEMA_VERSION = 1
""",
        """# v2 adds ``parking_episodes`` (PLAN 3.3): one authoritative record per
# physical parking occurrence, keyed by parking_episode_id. All v1 fields
# (slots/vehicles/aliases) are unchanged, so v1 consumers keep working in
# compatibility mode.
RUNTIME_SCHEMA_VERSION = 2
""",
    ),
    (
        """    camera_skew_ms: float,
    source_mode: str,
) -> dict[str, Any]:
""",
        """    camera_skew_ms: float,
    source_mode: str,
    parking_episodes: Any = None,
) -> dict[str, Any]:
""",
    ),
    (
        """        "pending_handoffs": registry.get("pending_handoffs", []),
""",
        """        "pending_handoffs": registry.get("pending_handoffs", []),
        # Schema v2: authoritative parking episodes from the binder.
        "parking_episodes": [
            dict(episode) for episode in (parking_episodes or [])
        ],
""",
    ),
]

twocam_pairs = [
    (
        """                            camera_skew_ms=abs(cam1_ns - cam2_ns) / 1_000_000.0,
                            source_mode="replay" if replay is not None else "live",
                        )
""",
        """                            camera_skew_ms=abs(cam1_ns - cam2_ns) / 1_000_000.0,
                            source_mode="replay" if replay is not None else "live",
                            parking_episodes=[
                                episode
                                for binder in binders.values()
                                for episode in binder.parking_episodes()
                            ],
                        )
""",
    ),
]

patch(BINDER, binder_pairs)
patch(CONTRACT, contract_pairs)
patch(TWOCAM, twocam_pairs)
print("ALL OK")
