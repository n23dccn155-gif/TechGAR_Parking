"""Merge/split identity-recovery scenarios S1-S9 (MEGAPLAN §3, builder-c).

Mỗi kịch bản có một test khóa hành vi HIỆN TẠI (PASS — baseline) và, khi hành vi
mong muốn khác, một test xfail(strict=False) mô tả mục tiêu thiết kế mới.
Xfail phải fail vì HÀNH VI recovery thiếu, không phải vì API/cờ chưa tồn tại.

Tracker seeded theo cách của test_stability_occlusion.py::seeded_tracker
(hai track sạch ID 1/2 tại box (40,40,30,60) và (82,40,30,60), 3 clean obs).
"""
from types import SimpleNamespace

import numpy as np
import pytest

from test_stability_occlusion import seeded_tracker
from techgar.occlusion_guard import OcclusionGroup
from techgar.tracklet_descriptor import hsv_histogram


MARGIN = 0.08  # split_assignment_margin mặc định


def seeded_group():
    """Tracker + group (1,2) đã prepare ở frame 4, chưa activate."""
    tracker, frame = seeded_tracker()
    g = tracker.occlusion_guard
    g.prepare(tracker._tracks, tracker._predict_tracks(), 1.3, 4)
    group = next(iter(g.groups.values()))
    assert group.members == (1, 2)
    return tracker, frame, g, group


def dets(n, kind='watershed_provisional'):
    return [dict(observation_kind=kind) for _ in range(n)]


def gate_n(g, pairs, costs, track_ids, tracks, detections, frames):
    out = None
    for f in frames:
        g.frame_idx = f
        out = g.gate_assignments(list(pairs), np.asarray(costs, dtype=float),
                                 track_ids, tracks, detections, MARGIN)
    return out  # (accepted, deferred_tracks, deferred_detections)


# ── S1 — tách sạch direct ────────────────────────────────────────────────

def test_s1_current_direct_split_commits_atomically_on_third_frame():
    tracker, _, g, group = seeded_group()
    g.activate(group, tracker._tracks)
    pairs = [(1, 0, (55, 100)), (2, 1, (97, 100))]
    costs = [[.1, .8], [.8, .1]]
    ds = dets(2)
    accepted, _, _ = gate_n(g, pairs, costs, [1, 2], tracker._tracks, ds, (4, 5))
    assert accepted == []                       # hai frame đầu vẫn defer
    accepted, _, _ = gate_n(g, pairs, costs, [1, 2], tracker._tracks, ds, (6,))
    assert accepted == pairs                    # frame thứ 3 commit nguyên khối
    assert not group.active and group.recovering >= 3
    assert all(d['observation_kind'] == 'watershed_validated' for d in ds)
    assert any(e['type'] == 'occlusion_group_recovered' for e in g.events)


@pytest.mark.xfail(strict=False, reason=(
    "spec §13 + MEGAPLAN §1.3: evidence cực mạnh cho phép streak ngắn hơn 3; "
    "hiện tại gate cứng recovering>=3"))
def test_s1_desired_overwhelming_direct_evidence_commits_before_frame_3():
    tracker, _, g, group = seeded_group()
    g.activate(group, tracker._tracks)
    pairs = [(1, 0, (55, 100)), (2, 1, (97, 100))]
    costs = [[.02, .95], [.95, .02]]            # direct .04 vs swapped 1.9
    ds = dets(2)
    accepted, _, _ = gate_n(g, pairs, costs, [1, 2], tracker._tracks, ds, (4, 5))
    assert len(accepted) == 2                   # mong muốn: commit sớm


# ── S2 — tách đảo (swapped) chứng cứ mạnh ────────────────────────────────

def test_s2_current_swapped_assignment_commits_after_three_frames():
    tracker, _, g, group = seeded_group()
    g.activate(group, tracker._tracks)
    pairs = [(1, 1, (97, 100)), (2, 0, (55, 100))]     # LAPJV chọn swapped
    costs = [[.8, .1], [.1, .8]]                        # chosen .2 < alt 1.6
    ds = dets(2)
    accepted, _, _ = gate_n(g, pairs, costs, [1, 2], tracker._tracks, ds, (4, 5, 6))
    assert accepted == pairs                    # swap đảo được chấp nhận


@pytest.mark.xfail(strict=False, reason=(
    "spec §13: streak phải theo hypothesis NHẤT QUÁN qua các frame; hiện tại "
    "recovering chỉ đếm frame valid — winner đổi hướng mỗi frame vẫn commit"))
def test_s2_desired_alternating_winner_never_commits():
    tracker, _, g, group = seeded_group()
    g.activate(group, tracker._tracks)
    direct = ([(1, 0, (55, 100)), (2, 1, (97, 100))], [[.1, .85], [.85, .1]])
    swapped = ([(1, 1, (97, 100)), (2, 0, (55, 100))], [[.85, .1], [.1, .85]])
    ds = dets(2)
    for i, f in enumerate((4, 5, 6)):
        pairs, costs = (direct, swapped, direct)[i]
        g.frame_idx = f
        accepted, _, _ = g.gate_assignments(list(pairs), np.asarray(costs),
                                          [1, 2], tracker._tracks, ds, MARGIN)
    assert accepted == []                       # mong muốn: hypothesis lắc → WAIT
    assert group.active


# ── S3 — chỉ A rõ, B vắng nhiều frame ────────────────────────────────────

def test_s3_current_missing_member_defers_whole_group_and_suppresses_blob():
    tracker, _, g, group = seeded_group()
    g.activate(group, tracker._tracks)
    pairs = [(1, 0, (55, 100))]                 # chỉ member 1 có pair LAPJV
    costs = [[.05, .98], [.55, .99]]
    ds = dets(1)
    for f in (4, 5, 6):
        g.frame_idx = f
        accepted, deferred_t, deferred_d = g.gate_assignments(
            list(pairs), np.asarray(costs), [1, 2], tracker._tracks, ds, MARGIN)
        assert accepted == []                   # member 1 rõ vẫn bị defer
        assert deferred_t == {1, 2}
        assert 0 in deferred_d                  # blob A bị chặn mint ID mới
    assert group.recovering == 0


@pytest.mark.xfail(strict=False, reason=(
    "spec §14 + MEGAPLAN §1.2.3: partial commit — A→ID7 matched_after_split, "
    "ID12→split_occluded giữ prediction riêng; hiện tại defer cả group"))
def test_s3_desired_clear_member_commits_partial_other_keeps_prediction():
    tracker, _, g, group = seeded_group()
    g.activate(group, tracker._tracks)
    pairs = [(1, 0, (55, 100))]
    costs = [[.05, .98], [.55, .99]]
    ds = dets(1)
    for f in (4, 5, 6):
        g.frame_idx = f
        accepted, _, _ = g.gate_assignments(list(pairs), np.asarray(costs),
                                          [1, 2], tracker._tracks, ds, MARGIN)
    assert (1, 0, (55, 100)) in accepted        # mong muốn: member 1 commit
    assert tracker._tracks[2].association_state == 'split_occluded'


# ── S4 — B xuất hiện muộn (integration qua process_frame) ────────────────

def _mask_feed(tracker, monkeypatch):
    feed = {'mask': np.zeros((160, 220), np.uint8)}
    tracker.bg_sub = SimpleNamespace(apply=lambda _f: feed['mask'].copy())
    monkeypatch.setattr(tracker, '_temporal_motion_mask',
                        lambda *a, **k: feed['mask'].copy())
    return feed


def _blob(feed, box):
    feed['mask'][:] = 0
    x, y, w, h = box
    feed['mask'][y:y + h, x:x + w] = 255


def _merged_then_a_only(tracker, feed):
    """Merged blob → group active; sau đó chỉ còn blob A đến khi group hết hạn."""
    _blob(feed, (40, 40, 72, 60))
    for i, t in enumerate((1.3, 1.35, 1.4), 4):
        tracker.process_frame(None if False else _frame(feed), timestamp_s=t)
    _blob(feed, (40, 40, 30, 60))               # chỉ A
    t = 1.5
    while tracker.occlusion_guard.groups:       # chờ group expire (~4.2)
        t += .1
        tracker.process_frame(_frame(feed), timestamp_s=t)
    for _ in range(3):                          # A-only sau expiry → ID7 match
        t += .1
        tracker.process_frame(_frame(feed), timestamp_s=t)
    return t


def _frame(feed):
    frame = np.zeros((160, 220, 3), np.uint8)
    frame[40:100, 40:70] = (255, 180, 70)
    frame[40:100, 82:112] = (25, 25, 25)
    return frame


def test_s4_current_late_reappearing_b_mints_new_local_id(monkeypatch):
    tracker, _ = seeded_tracker()
    feed = _mask_feed(tracker, monkeypatch)
    t = _merged_then_a_only(tracker, feed)
    _blob(feed, (82, 40, 30, 60))               # B quay lại một mình, rất muộn
    tracker.process_frame(_frame(feed), timestamp_s=t + .1)
    assert 3 in tracker._tracks                 # ID13 sinh — lineage ID12 mất
    assert tracker._tracks[2].association_state != 'matched'


@pytest.mark.xfail(strict=False, reason=(
    "spec §9.1/§18: trong cửa sổ recovery blob phù hợp member chưa-resolve phải "
    "được thử rebind ID12 trước, không mint ID mới"))
def test_s4_desired_late_blob_rebinds_unresolved_member_not_new_id(monkeypatch):
    tracker, _ = seeded_tracker()
    feed = _mask_feed(tracker, monkeypatch)
    t = _merged_then_a_only(tracker, feed)
    _blob(feed, (82, 40, 30, 60))
    tracker.process_frame(_frame(feed), timestamp_s=t + .1)
    assert 3 not in tracker._tracks
    assert tracker._tracks[2].association_state == 'matched'


# ── S5 — B là mảnh nhiễu/vật thứ ba ──────────────────────────────────────

def test_s5_current_noise_fragment_can_be_committed_as_member():
    tracker, _, g, group = seeded_group()
    g.activate(group, tracker._tracks)
    pairs = [(1, 0, (55, 100)), (2, 1, (97, 100))]
    costs = [[.1, .9], [.9, .75]]               # det1 noise: cost .75 < limit .90 → LAPJV vẫn chọn
    ds = dets(2)
    accepted, _, _ = gate_n(g, pairs, costs, [1, 2], tracker._tracks, ds, (4, 5, 6))
    assert (2, 1, (97, 100)) in accepted        # noise được commit làm ID12


@pytest.mark.xfail(strict=False, reason=(
    "MEGAPLAN §1.2.3 + spec §15: hypothesis 'detection non-member' — mảnh nhiễu "
    "không được cướp ID12 cũng không chặn group; ID12 phải thành split_occluded"))
def test_s5_desired_noise_rejected_member_stays_unresolved():
    tracker, _, g, group = seeded_group()
    g.activate(group, tracker._tracks)
    pairs = [(1, 0, (55, 100)), (2, 1, (97, 100))]
    costs = [[.1, .9], [.9, .75]]
    ds = dets(2)
    for f in (4, 5, 6):
        g.frame_idx = f
        accepted, _, _ = g.gate_assignments(list(pairs), np.asarray(costs),
                                          [1, 2], tracker._tracks, ds, MARGIN)
    assert (1, 0, (55, 100)) in accepted        # A commit partial
    assert all(tid != 2 for tid, _, _ in accepted)   # noise không lấy ID12


# ── S6 — hết hạn trước khi tách ──────────────────────────────────────────

def test_s6_current_group_expires_before_split_members_go_free():
    tracker, _, g, group = seeded_group()
    g.activate(group, tracker._tracks)
    assert group.expires_at == pytest.approx(1.2 + 3.0)
    g.prepare(tracker._tracks, tracker._predict_tracks(), 4.3, 99)
    assert not g.groups
    assert any(e['type'] == 'occlusion_group_expired' for e in g.events)
    # Chỉ tầng group-gate: sau expiry gate không defer nữa. Per-track defer
    # (split_margin_track_ids / association_recovery_pending) và birth veto
    # vẫn tồn tại độc lập — test này KHÔNG chứng minh assign tự do toàn pipeline.
    pairs = [(1, 1, (97, 100)), (2, 0, (55, 100))]
    accepted, _, _ = g.gate_assignments(
        pairs, np.asarray([[.8, .1], [.1, .8]]), [1, 2], tracker._tracks,
        dets(2), MARGIN)
    assert accepted == pairs


@pytest.mark.xfail(strict=False, reason=(
    "spec §17 + MEGAPLAN §1.2.8: merge timeout kết thúc group, nhưng identity "
    "recovery phải có cửa sổ riêng bắt đầu SAU KHI tách — split muộn vẫn phải "
    "qua evidence-gathering thay vì assign tự do frame đầu"))
def test_s6_desired_post_expiry_split_still_enters_recovery_window():
    tracker, _, g, group = seeded_group()
    g.activate(group, tracker._tracks)
    g.prepare(tracker._tracks, tracker._predict_tracks(), 4.3, 99)
    pairs = [(1, 0, (55, 100)), (2, 1, (97, 100))]
    accepted, deferred_t, _ = g.gate_assignments(
        pairs, np.asarray([[.1, .8], [.8, .1]]), [1, 2], tracker._tracks,
        dets(2), MARGIN)
    assert accepted == []                       # mong muốn: vẫn defer/gom evidence
    assert deferred_t == {1, 2}


# ── S7 — hai xe đổi hướng/vượt nhau (ordering KHÔNG phải ràng buộc cứng) ──

def test_s7_current_ordering_is_not_a_constraint_cost_decides():
    tracker, _, g, group = seeded_group()
    g.activate(group, tracker._tracks)
    # ID7 trái / ID12 phải trước merge; sau vượt nhau A phải B trái → swapped.
    pairs = [(1, 1, (97, 100)), (2, 0, (55, 100))]
    costs = [[.85, .1], [.1, .85]]
    ds = dets(2)
    accepted, _, _ = gate_n(g, pairs, costs, [1, 2], tracker._tracks, ds, (4, 5, 6))
    assert accepted == pairs                    # ordering lật vẫn commit theo cost


@pytest.mark.xfail(strict=False, reason=(
    "spec §10 + MEGAPLAN §1.2.6: pre-merge ordering là evidence cho hypothesis "
    "— ordering nhất quán với direct phải phá hoà-cost chứ không chỉ WAIT"))
def test_s7_desired_ordering_evidence_breaks_near_tie_toward_direct():
    tracker, _, g, group = seeded_group()
    g.activate(group, tracker._tracks)
    pairs = [(1, 0, (55, 100)), (2, 1, (97, 100))]     # ordering khớp direct
    costs = [[.22, .85], [.20, .87]]                    # gần hoà: hiện tại WAIT mãi
    ds = dets(2)
    accepted, _, _ = gate_n(g, pairs, costs, [1, 2], tracker._tracks, ds, (4, 5, 6))
    assert len(accepted) == 2                   # ordering evidence → commit direct


# ── S8 — group 3 member (giữ hành vi cũ, MEGAPLAN §1.2.4) ────────────────

def _seeded_tracker3():
    tracker, frame = seeded_tracker()
    box = (124, 40, 30, 60)
    frame[40:100, 124:154] = (160, 200, 40)
    det = dict(box=box, point=tracker._bottom_center(box), area=1800,
               bbox_area=1800, hist=hsv_histogram(frame, box),
               appearance_trusted=True)
    tracker._frame_idx = 1
    tracker._current_timestamp_s = 1.
    tracker._create_or_reid(det)
    for i, t in ((2, 1.1), (3, 1.2)):
        tracker._frame_idx = i
        tracker._current_timestamp_s = t
        tracker._predict_tracks()
        tracker._apply_detection(tracker._tracks[3], det)
    return tracker, frame


def test_s8_current_three_member_group_never_partitions_and_expires():
    tracker, frame = _seeded_tracker3()
    g = tracker.occlusion_guard
    g.prepare(tracker._tracks, tracker._predict_tracks(), 1.3, 4)
    blob = (40, 40, 114, 60)                    # phủ cả 3 predicted center
    merged = g.covering_group(blob, tracker._tracks, tracker._predict_tracks())
    assert merged is not None and merged.members == (1, 2, 3)
    mask = np.zeros(frame.shape[:2], np.uint8)
    mask[40:100, 40:154] = 255
    assert g.partition(frame, mask, blob, tracker._tracks,
                       tracker._predict_tracks(), merged) == []
    pairs = [(1, 0, (55, 100)), (2, 1, (97, 100)), (3, 2, (139, 100))]
    costs = [[.1, .8, .8], [.8, .1, .8], [.8, .8, .1]]
    ds = dets(3)
    for f in (4, 5, 6):
        g.frame_idx = f
        accepted, deferred_t, _ = g.gate_assignments(
            list(pairs), np.asarray(costs), [1, 2, 3], tracker._tracks, ds, MARGIN)
        assert accepted == []                   # atomic gate: 3-member → defer hết
        assert deferred_t == {1, 2, 3}
    g.prepare(tracker._tracks, tracker._predict_tracks(), 4.3, 99)
    assert (1, 2, 3) not in g.groups             # supergroup trôi đến expiry
    assert any(e['type'] == 'occlusion_group_expired' and
               e['local_track_ids'] == [1, 2, 3] for e in g.events)
    # Pair-group nền (1,2)/(2,3) chưa từng active nên expires_at=inf — tồn tại
    # bất-hạn sau khi supergroup đã hết hạn (quirk hiện tại, không xử lý ở P0).
    assert all(not grp.active for grp in g.groups.values())


# ── S9 — A nhập nhằng (cost(7,A)≈cost(12,A) → WAIT, không ID theft) ──────

def test_s9_current_ambiguous_detection_waits_and_is_suppressed_from_birth():
    tracker, _, g, group = seeded_group()
    g.activate(group, tracker._tracks)
    pairs = [(1, 0, (55, 100)), (2, 1, (97, 100))]
    costs = [[.20, .85], [.23, .90]]            # A ngang nhau giữa 7 và 12
    ds = dets(2)
    for f in (4, 5, 6):
        g.frame_idx = f
        accepted, deferred_t, deferred_d = g.gate_assignments(
            list(pairs), np.asarray(costs), [1, 2], tracker._tracks, ds, MARGIN)
        assert accepted == []                   # WAIT — không commit sai
        assert deferred_t == {1, 2}
        assert deferred_d == {0, 1}             # cả 2 blob member-like bị chặn sinh ID


@pytest.mark.xfail(strict=False, reason=(
    "spec §21: gate phải emit telemetry 'split_hypothesis' (scores per hypothesis, "
    "selected, decision) — hiện chỉ trả accepted/deferred, không log hypothesis"))
def test_s9_desired_ambiguous_frame_emits_hypothesis_telemetry():
    tracker, _, g, group = seeded_group()
    g.activate(group, tracker._tracks)
    pairs = [(1, 0, (55, 100)), (2, 1, (97, 100))]
    costs = [[.20, .85], [.23, .90]]
    g.frame_idx = 4
    g.gate_assignments(list(pairs), np.asarray(costs), [1, 2], tracker._tracks,
                       dets(2), MARGIN)
    assert any(e.get('type') == 'split_hypothesis' for e in g.events)
