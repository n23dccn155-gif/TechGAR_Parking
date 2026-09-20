"""GID continuity: same-frame allocation must dedupe one car's fragments.

toi1 f32: gid1 on cam1#31 AND gid2 on cam1#38 were minted in the SAME
frame -- one physical car's split fragments each passed the allocation
gate.  The dormant near-miss check only looks at old identities, so two
brand-new fragments allocate side by side.

Once a fragment receives a fresh Global ID, other unbound same-camera
fragments within the duplicate distance with compatible appearance must
defer instead of minting a twin ID in the same pass.
"""
from dataclasses import dataclass

import numpy as np

from techgar.cross_camera_manager import CrossCameraManager
from techgar.tracklet_descriptor import AppearanceTracklet


@dataclass
class DummyTrack:
    cx: int
    cy: int
    w: int = 42
    h: int = 24
    history: list = None
    status: str = "confirmed"
    appearance: object = None
    fragment_visible_count: int = None

    def __post_init__(self):
        if self.history is None:
            self.history = [(self.cx, self.cy)]
        if self.appearance is None:
            self.appearance = np.ones((16, 16), dtype=np.float32)

    @property
    def x(self):
        return self.cx - self.w // 2

    @property
    def y(self):
        return self.cy - self.h


def make_manager():
    return CrossCameraManager(
        camera_sizes={"cam1": (640, 480), "cam2": (640, 480)},
        camera_crops={"cam1": (0, 0, 640, 480), "cam2": (0, 0, 640, 480)},
        camera_transforms={
            "cam1": np.eye(3),
            "cam2": np.array(
                [[1.0, 0.0, 500.0], [0.0, 1.0, 0.0], [0.0, 0.0, 1.0]]
            ),
        },
        edge_adjacency={("cam1", "right"): "cam2", ("cam2", "left"): "cam1"},
        overlap_regions={
            ("cam1", "cam2"): np.array(
                [[500, 0], [640, 0], [640, 480], [500, 480]],
                dtype=np.float32,
            )
        },
        match_distance=15.0,
        lookahead_frames=16,
        prediction_radius=90,
        appearance_threshold=0.45,
        min_direction_cosine=0.25,
    )


def one_hot_histogram(bin_index: int) -> np.ndarray:
    histogram = np.zeros((16, 16), dtype=np.float32)
    histogram.flat[bin_index] = 1.0
    return histogram


def attach_tracklet(track, *histograms):
    descriptor = AppearanceTracklet(max_samples=8, sample_interval=1)
    for frame_idx, histogram in enumerate(histograms, start=1):
        descriptor.update(histogram, frame_idx)
    track.appearance_tracklet = descriptor
    return track


def _fragment(local_x, histogram, history=None):
    return attach_tracklet(
        DummyTrack(
            local_x,
            260,
            history=(
                history
                if history is not None
                else [(local_x - 8, 260), (local_x - 4, 260), (local_x, 260)]
            ),
            appearance=histogram,
            fragment_visible_count=6,
        ),
        histogram,
        histogram,
    )


def test_split_fragments_share_one_global_id():
    # Two same-camera fragments 8 px apart with identical appearance: one
    # physical car.  Their velocity estimates disagree (a reversed
    # motion-echo tail), so the existing motion-duplicate path cannot
    # catch them -- the allocator itself must dedupe.
    manager = make_manager()
    histogram = one_hot_histogram(0)
    for frame_idx in (1, 2, 3, 4, 5):
        ids = manager.update_all_tracks(
            {
                "cam1": {
                    31: _fragment(300, histogram),
                    38: _fragment(
                        308,
                        histogram,
                        history=[(316, 260), (312, 260), (308, 260)],
                    ),
                }
            },
            frame_idx,
            {"cam1": frame_idx * 0.1},
        )

    bound = set(ids["cam1"].values())
    # One physical car: at most one Global ID may exist for the pair, and
    # the deferred fragment must never mint a same-frame twin.  Assert on
    # the allocator itself -- a retroactive merge would hide the defect.
    assert len(bound) <= 1
    assert manager._next_global_id == 2
    assert any(
        event["type"] == "new_global_id_deferred_same_frame_duplicate"
        for event in manager.to_json({})["recent_events"]
    )


def test_distant_same_frame_fragments_still_allocate():
    # Two fragments far apart in the same frame are two different cars;
    # the dedup must not starve genuine allocations.
    manager = make_manager()
    histogram = one_hot_histogram(0)
    other = one_hot_histogram(9)
    ids = None
    for frame_idx in (1, 2, 3, 4, 5):
        ids = manager.update_all_tracks(
            {
                "cam1": {
                    31: _fragment(300, histogram),
                    38: _fragment(500, other),
                }
            },
            frame_idx,
            {"cam1": frame_idx * 0.1},
        )

    assert len(set(ids["cam1"].values())) == 2
