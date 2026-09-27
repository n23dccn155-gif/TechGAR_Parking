"""Report identity-churn metrics for one recorded experiment session.

The identity pipeline has many safety heuristics, so a regression rarely shows
up as a crash: it shows up as more Global IDs than there were vehicles, more
local fragments than there were tracks, or one Global ID living on two
vehicles at once.  This script turns a recorded session into those numbers so
a tracker/threshold change can be compared against a known baseline instead of
being judged from a debug video.

Usage:
    python diagnose_identity_churn.py <session_dir> [--body-length-cm 7.0]
    python diagnose_identity_churn.py <session_a> <session_b>   # compare
"""

from __future__ import annotations

import argparse
import collections
import csv
import json
import math
from pathlib import Path
from typing import Dict, List, Optional


# Event types that change which physical vehicle owns which Global ID.  Every
# other event type is diagnostic noise for this report.
LIFECYCLE_EVENTS = (
    "global_id_created",
    "global_id_merged",
    "global_id_recovered",
    "dormant_global_id_recovered",
    "dormant_turnaround_recovered",
    "global_identity_expired",
    "same_camera_global_conflict_detached",
    "merge_blocked_collision_risk",
    "cross_camera_merge_rejected_established_ids",
    "handoff_opened",
    "handoff_matched",
    "handoff_matched_target_gallery",
    "handoff_rejected",
    "handoff_expired",
    "merged_detection_frozen",
    "oversized_detection_frozen",
    "split_assignment_deferred",
    "association_rejected_stale_track",
)


def percentile(values: List[float], fraction: float) -> float:
    if not values:
        return float("nan")
    ordered = sorted(values)
    index = min(len(ordered) - 1, max(0, int(round(fraction * (len(ordered) - 1)))))
    return float(ordered[index])


def load_frames(session_dir: Path) -> List[dict]:
    path = session_dir / "predictions.jsonl"
    if not path.is_file():
        raise SystemExit(f"khong tim thay {path}")
    frames = []
    with path.open("r", encoding="utf-8") as handle:
        for line in handle:
            line = line.strip()
            if line:
                frames.append(json.loads(line))
    if not frames:
        raise SystemExit(f"{path} rong")
    return frames


def load_processing_ms(session_dir: Path) -> List[float]:
    path = session_dir / "performance.csv"
    if not path.is_file():
        return []
    values = []
    with path.open("r", newline="", encoding="utf-8-sig") as handle:
        for row in csv.DictReader(handle):
            try:
                values.append(float(row["total_processing_ms"]))
            except (KeyError, TypeError, ValueError):
                continue
    return values


def observable(record: dict):
    """Observations the global manager actually saw this frame.

    ``two_camera.py`` feeds ``tracker.observable_tracks`` to the manager, i.e.
    only fragments matched in the current frame.  Coasting/LOST rows in the
    recording are tracker bookkeeping and must not be counted as detections.
    """
    for item in record.get("observations") or []:
        if int(item.get("invisible_count") or 0) == 0:
            yield item


def analyse(session_dir: Path, body_length_cm: float) -> dict:
    frames = load_frames(session_dir)
    processing_ms = load_processing_ms(session_dir)

    gid_first_frame: Dict[int, int] = {}
    fragments = set()
    association_states = collections.Counter()
    event_counts = collections.Counter()
    active_gid_histogram = collections.Counter()
    split_identity_rows: List[tuple] = []
    dormant_distance: List[float] = []
    dormant_elapsed: List[float] = []
    dormant_appearance: List[float] = []
    dormant_limit: List[float] = []
    fragments_per_gid: Dict[int, set] = collections.defaultdict(set)

    for record in frames:
        frame_idx = int(record["frame_idx"])
        live = list(observable(record))
        for item in record.get("observations") or []:
            association_states[str(item.get("association_state"))] += 1
            fragments.add((str(item.get("camera_id")), int(item.get("local_track_id"))))

        by_gid: Dict[int, list] = collections.defaultdict(list)
        for item in live:
            gid = item.get("canonical_gid")
            if gid is None:
                continue
            gid = int(gid)
            gid_first_frame.setdefault(gid, frame_idx)
            by_gid[gid].append(item)
            fragments_per_gid[gid].add(
                (str(item.get("camera_id")), int(item.get("local_track_id")))
            )
        active_gid_histogram[len(by_gid)] += 1

        # One Global ID on two tracks further apart than a vehicle body is a
        # proven identity error: no single car can be in both places.
        for gid, items in by_gid.items():
            for left in range(len(items)):
                for right in range(left + 1, len(items)):
                    first, second = items[left], items[right]
                    a, b = first.get("anchor_world"), second.get("anchor_world")
                    if not a or not b:
                        continue
                    distance = math.hypot(a["x"] - b["x"], a["y"] - b["y"])
                    if distance > body_length_cm:
                        split_identity_rows.append((
                            frame_idx, gid,
                            f"{first.get('camera_id')}#{first.get('local_track_id')}",
                            f"{second.get('camera_id')}#{second.get('local_track_id')}",
                            round(distance, 2),
                        ))

        for event in record.get("identity_events") or []:
            kind = str(event.get("event_type"))
            event_counts[kind] += 1
            if kind != "dormant_global_id_recovered":
                continue
            details = event.get("details") or {}
            for source, sink in (
                ("predicted_distance", dormant_distance),
                ("elapsed", dormant_elapsed),
                ("appearance_distance", dormant_appearance),
                ("distance_limit", dormant_limit),
            ):
                value = details.get(source)
                if value is not None:
                    sink.append(float(value))

    duration_s = (
        (frames[-1]["capture_unix_ns"] - frames[0]["capture_unix_ns"]) / 1e9
        if len(frames) > 1
        else 0.0
    )
    return {
        "session": session_dir.name,
        "frames": len(frames),
        "duration_s": duration_s,
        "fps": (len(frames) / duration_s) if duration_s > 0 else float("nan"),
        "processing_ms_p50": percentile(processing_ms, 0.50),
        "processing_ms_p90": percentile(processing_ms, 0.90),
        "global_ids": len(gid_first_frame),
        "gid_order": sorted(gid_first_frame, key=lambda gid: gid_first_frame[gid]),
        "fragments": len(fragments),
        "fragments_per_gid": {
            gid: len(keys) for gid, keys in sorted(fragments_per_gid.items())
        },
        "association_states": dict(association_states),
        "active_gid_histogram": dict(sorted(active_gid_histogram.items())),
        "split_identity_rows": split_identity_rows,
        "dormant_distance": dormant_distance,
        "dormant_elapsed": dormant_elapsed,
        "dormant_appearance": dormant_appearance,
        "dormant_limit": dormant_limit,
        "event_counts": event_counts,
    }


def report(result: dict, body_length_cm: float) -> None:
    frames = result["frames"]
    print(f"=== {result['session']} ===")
    print(
        f"  frames {frames}  duration {result['duration_s']:.1f}s"
        f"  fps {result['fps']:.2f}"
        f"  processing_ms p50={result['processing_ms_p50']:.1f}"
        f" p90={result['processing_ms_p90']:.1f}"
    )
    print(f"  Global ID da tao: {result['global_ids']}  -> {result['gid_order']}")
    print(f"  local fragment da tao: {result['fragments']}")
    print(f"  fragment / Global ID: {result['fragments_per_gid']}")

    histogram = result["active_gid_histogram"]
    print("  so Global ID hoat dong dong thoi moi frame:")
    for count, occurrences in histogram.items():
        print(
            f"     {count} gid: {occurrences:5d} frame"
            f"  ({100.0 * occurrences / frames:5.1f}%)"
        )

    states = result["association_states"]
    total_states = sum(states.values()) or 1
    print("  association_state (tren tat ca observation ghi lai):")
    for name, count in sorted(states.items(), key=lambda item: -item[1]):
        print(f"     {name:20s} {count:7d}  ({100.0 * count / total_states:5.1f}%)")

    rows = result["split_identity_rows"]
    print(
        f"  LOI IDENTITY: 1 GID tren 2 track cach > {body_length_cm:.1f}cm:"
        f" {len(rows)} frame-instance"
    )
    for row in rows[:12]:
        print("     f%-6d gid=%-4s %-12s <-> %-12s %scm" % row)
    if len(rows) > 12:
        print(f"     ... con {len(rows) - 12} dong nua")

    distance = result["dormant_distance"]
    if distance:
        elapsed = result["dormant_elapsed"]
        appearance = result["dormant_appearance"]
        print(f"  dormant_global_id_recovered: {len(distance)} lan")
        print(
            "     khoang cach cm  p50=%.2f p90=%.2f max=%.2f  | vuot 2 than xe (%.1fcm): %d"
            % (
                percentile(distance, 0.50), percentile(distance, 0.90), max(distance),
                2 * body_length_cm,
                sum(1 for value in distance if value > 2 * body_length_cm),
            )
        )
        print(
            "     elapsed s       p50=%.2f p90=%.2f max=%.2f  | vuot 10s: %d"
            % (
                percentile(elapsed, 0.50), percentile(elapsed, 0.90), max(elapsed),
                sum(1 for value in elapsed if value > 10.0),
            )
            if elapsed else "     elapsed s       (khong co du lieu)"
        )
        if appearance:
            print(
                "     appearance      p50=%.3f p90=%.3f max=%.3f"
                % (
                    percentile(appearance, 0.50),
                    percentile(appearance, 0.90),
                    max(appearance),
                )
            )
        limits = result["dormant_limit"]
        if limits:
            # The tightest limit any recovery ran under is the un-expanded
            # radius; anything above it was opened by the measured speed.
            base = min(limits)
            print(
                "     gioi han cm     base=%.2f p50=%.2f max=%.2f"
                "  | no theo toc do: %d/%d"
                % (
                    base,
                    percentile(limits, 0.50),
                    max(limits),
                    sum(1 for value in limits if value > base + 1e-6),
                    len(limits),
                )
            )

    print("  event vong doi identity:")
    for kind in LIFECYCLE_EVENTS:
        count = result["event_counts"].get(kind, 0)
        if count:
            print(f"     {kind:46s} {count:6d}")
    print()


def compare(baseline: dict, candidate: dict, body_length_cm: float) -> None:
    print("=== so sanh baseline -> candidate ===")

    def line(label: str, before, after, lower_is_better: bool = True) -> None:
        try:
            delta = after - before
            arrow = "OK " if (delta <= 0) == lower_is_better else "XAU"
            print(f"  {arrow} {label:42s} {before:>10} -> {after:>10}  ({delta:+})")
        except TypeError:
            print(f"      {label:42s} {before} -> {after}")

    line("so Global ID", baseline["global_ids"], candidate["global_ids"])
    line("so local fragment", baseline["fragments"], candidate["fragments"])
    line(
        f"frame-instance 1 GID tren 2 track (> {body_length_cm:.1f}cm)",
        len(baseline["split_identity_rows"]),
        len(candidate["split_identity_rows"]),
    )
    for label, key in (
        ("frame co >=2 GID hoat dong", 2),
    ):
        before = sum(v for k, v in baseline["active_gid_histogram"].items() if k >= key)
        after = sum(v for k, v in candidate["active_gid_histogram"].items() if k >= key)
        line(label, before, after, lower_is_better=False)
    print(
        "      fps                                        "
        f"{baseline['fps']:10.2f} -> {candidate['fps']:10.2f}"
    )
    print()


def main(argv: Optional[List[str]] = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("sessions", nargs="+", type=Path)
    parser.add_argument(
        "--body-length-cm",
        type=float,
        default=7.0,
        help="chieu dai than xe trong don vi world cua calibration (mac dinh 7cm cho bai mo hinh)",
    )
    args = parser.parse_args(argv)

    results = [analyse(path, args.body_length_cm) for path in args.sessions]
    for result in results:
        report(result, args.body_length_cm)
    if len(results) >= 2:
        compare(results[0], results[-1], args.body_length_cm)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
