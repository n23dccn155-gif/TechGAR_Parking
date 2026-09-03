"""Identity distance thresholds derived from the calibrated slot geometry.

The regression these guard: a calibration file carried a hand-tuned
``dormant_match_distance`` of 35 cm on a lot whose parking slots are under
8 cm long, so a Global ID could be re-claimed five car bodies away from where
it was last seen.
"""

import json
from pathlib import Path

import pytest

from two_camera import (
    SLOT_MATCHING_MULTIPLES,
    derive_matching_defaults,
    median_slot_length,
    resolve_matching_distance,
)


def slot(x: float, y: float, length: float, width: float) -> dict:
    return {
        "polygon": [
            [x, y],
            [x + length, y],
            [x + length, y + width],
            [x, y + width],
        ]
    }


def test_median_slot_length_uses_the_long_edge_of_every_group():
    payload = {
        "parking_slots_world": {
            "cam1": [slot(0, 0, 8.0, 4.5), slot(0, 10, 4.5, 10.0)],
            "cam2": [slot(20, 0, 6.0, 4.0)],
        }
    }

    # Long edges are 8.0, 10.0 and 6.0 regardless of vertex order.
    assert median_slot_length(payload) == pytest.approx(8.0, abs=1e-3)


def test_median_slot_length_accepts_a_flat_slot_list():
    payload = {"parking_slots_world": [slot(0, 0, 9.0, 5.0)]}
    assert median_slot_length(payload) == pytest.approx(9.0, abs=1e-3)


@pytest.mark.parametrize(
    "payload",
    [
        {},
        {"parking_slots_world": {}},
        {"parking_slots_world": {"cam1": []}},
        # A degenerate two-point polygon cannot describe a slot.
        {"parking_slots_world": {"cam1": [{"polygon": [[0, 0], [1, 1]]}]}},
    ],
)
def test_median_slot_length_is_none_without_usable_geometry(payload):
    assert median_slot_length(payload) is None
    assert derive_matching_defaults(payload) == {}


def test_derived_defaults_are_multiples_of_the_measured_slot():
    payload = {"parking_slots_world": {"cam1": [slot(0, 0, 8.0, 4.5)]}}
    derived = derive_matching_defaults(payload)

    assert set(derived) == set(SLOT_MATCHING_MULTIPLES)
    for name, multiple in SLOT_MATCHING_MULTIPLES.items():
        assert derived[name] == pytest.approx(8.0 * multiple, abs=1e-3)
    # A duplicate radius under half a car body is what keeps two vehicles in
    # neighbouring slots from being merged into one identity.
    assert derived["cross_camera_duplicate_distance"] < derived["handoff_match_distance"]


def test_calibration_may_tighten_a_threshold_but_not_stretch_it():
    derived = 13.834

    # The stale 35 cm value from the shipped calibration file is clamped down.
    assert resolve_matching_distance(
        "dormant_match_distance", None, 35.0, derived, 160.0
    ) == pytest.approx(derived)
    # A file that is already stricter than the geometry is respected.
    assert resolve_matching_distance(
        "dormant_match_distance", None, 8.0, derived, 160.0
    ) == pytest.approx(8.0)


def test_command_line_override_always_wins():
    assert resolve_matching_distance(
        "dormant_match_distance", 40.0, 35.0, 13.834, 160.0
    ) == pytest.approx(40.0)
    # Including when it is stricter than everything else.
    assert resolve_matching_distance(
        "dormant_match_distance", 2.0, 35.0, 13.834, 160.0
    ) == pytest.approx(2.0)


def test_fallback_only_applies_without_calibration_or_geometry():
    assert resolve_matching_distance(
        "dormant_match_distance", None, None, None, 160.0
    ) == pytest.approx(160.0)
    assert resolve_matching_distance(
        "dormant_match_distance", None, None, 13.834, 160.0
    ) == pytest.approx(13.834)
    assert resolve_matching_distance(
        "dormant_match_distance", None, 35.0, None, 160.0
    ) == pytest.approx(35.0)


def test_shipped_calibration_thresholds_collapse_to_the_measured_lot():
    path = (
        Path(__file__).resolve().parents[1]
        / "config"
        / "two_camera.shared_m_01.json"
    )
    if not path.exists():
        pytest.skip("calibration file not present in this checkout")
    payload = json.loads(path.read_text(encoding="utf-8"))

    slot_length = median_slot_length(payload)
    assert slot_length is not None and 5.0 < slot_length < 12.0

    configured = payload.get("matching_defaults") or {}
    derived = derive_matching_defaults(payload)
    resolved = {
        name: resolve_matching_distance(
            name, None, configured.get(name), derived.get(name), 160.0
        )
        for name in SLOT_MATCHING_MULTIPLES
    }

    # The two pathological values in the shipped file are cut hard; the two
    # sane ones stay within a slot length of what was hand-tuned.
    assert resolved["dormant_match_distance"] < 0.5 * configured["dormant_match_distance"]
    assert (
        resolved["cross_camera_duplicate_distance"]
        < 0.5 * configured["cross_camera_duplicate_distance"]
    )
    assert abs(
        resolved["handoff_match_distance"] - configured["handoff_match_distance"]
    ) < slot_length
