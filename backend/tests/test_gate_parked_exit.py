"""Test tái hiện lỗi #7 (P16i): xe đỗ lâu, ``last_seen_time`` đứng yên ⇒ mất ``[EXIT]``.

Bối cảnh (``REPORT_P16g.md`` mục 3): ``identity.last_seen_time`` **không được refresh**
khi xe đứng yên trong bãi (tracker chuyển động bỏ xe đỗ). Controller cũ bỏ **mọi**
snapshot có ``last_seen_time`` không tăng (``gate_session_controller.py:480-482``) và coi
bước nhảy thời gian sau khi đỗ là "không liên tục" (``:483-486``), nên khi xe rời ô và
cắt vạch ra thì không có ``[EXIT]`` — đúng ca ``session_hiep_sang8`` GID 2.

Test chạy bằng snapshot giả, không replay: xe vào (có phiên), đỗ N giây với
``last_seen_time`` không đổi, rồi đi ra cắt vạch. Kỳ vọng: phiên bị xoá (``[EXIT]``).
"""

from __future__ import annotations

import pytest

import gate_session_controller
import session_manager

GATES = {
    "coordinate_space": "world",
    "entry_gate": {
        "p1": {"x": 0, "y": 10},
        "p2": {"x": 10, "y": 10},
        "direction": "positive",
    },
    "exit_gate": {
        "p1": {"x": 0, "y": 0},
        "p2": {"x": 10, "y": 0},
        "direction": "positive",
    },
}


class FakeClock:
    def __init__(self) -> None:
        self.value = 0.0

    def __call__(self) -> float:
        return self.value

    def advance(self, seconds: float) -> None:
        self.value += seconds


def snapshot(*vehicles):
    return {
        "schema_version": 1,
        "coordinate_space": {"unit": "cm", "bounds": None},
        "vehicles": list(vehicles),
        "recent_events": [],
        "parking_slots": [],
    }


def vehicle(global_id: int, x: float, y: float, *, last_seen_time: float) -> dict:
    return {
        "global_id": global_id,
        "position": {"x": x, "y": y, "reference": "cm"},
        "parked_slot_id": None,
        "observed": True,
        "state": "active",
        "camera_ids": ["cam1"],
        #: Thời điểm quan sát gần nhất do runtime báo; bị đóng băng khi xe đỗ
        #: (``runtime_contract.py:107`` ← ``identity.last_seen_time``).
        "last_seen_time": last_seen_time,
    }


def coordinator(monkeypatch, tmp_path, *, clock, accept_stale_source=True):
    monkeypatch.setattr(
        session_manager,
        "SESSIONS_FILE",
        tmp_path / "navigation_sessions.json",
    )
    return gate_session_controller.GateSessionCoordinator(
        GATES,
        parked_confirm_seconds=2.0,
        clock=clock,
        allow_legacy=True,
        accept_stale_source=accept_stale_source,
    )


def _enter(parked_seconds: int = 20):
    """Chuỗi snapshot: vào cổng → đỗ ``parked_seconds`` khung với thời gian đứng yên →
    rời ô → cắt vạch ra. Trả list snapshot và bước nhảy ``last_seen_time`` lúc rời."""
    frames = [
        snapshot(vehicle(42, 5, 12, last_seen_time=0.1)),
        # Cắt vạch vào (y 12 → 8) ⇒ tạo phiên.
        snapshot(vehicle(42, 5, 8, last_seen_time=0.2)),
    ]
    # Đỗ: cùng một vị trí, ``last_seen_time`` đứng yên ở 1.0 (47 s so với lúc rời).
    for _ in range(parked_seconds):
        frames.append(snapshot(vehicle(42, 5, 5, last_seen_time=1.0)))
    # Rời ô, vẫn giữ ``last_seen_time`` cũ trong lúc bắt đầu lăn bánh…
    frames.append(snapshot(vehicle(42, 5, 4, last_seen_time=1.0)))
    frames.append(snapshot(vehicle(42, 5, 2.5, last_seen_time=1.0)))
    frames.append(snapshot(vehicle(42, 5, 1.5, last_seen_time=1.0)))
    # …rồi mới "nhích": nhảy 47 s ngay ở frame cắt vạch ra (y 1.5 → −0.5).
    frames.append(snapshot(vehicle(42, 5, -0.5, last_seen_time=48.0)))
    frames.append(snapshot(vehicle(42, 5, -1.5, last_seen_time=48.1)))
    return frames


def test_xe_do_lau_roi_o_van_co_exit(monkeypatch, tmp_path):
    clock = FakeClock()
    gate = coordinator(monkeypatch, tmp_path, clock=clock)

    frames = _enter()
    for frame in frames:
        gate.process_snapshot(frame)
        clock.advance(0.1)

    # Trước khi sửa: mất [EXIT] vì 47 s đứng yên của last_seen_time.
    assert session_manager.find_session_by_global_id(42) is None


def test_co_phien_ngay_sau_khi_vao_va_khong_co_exit_som(monkeypatch, tmp_path):
    """Chốt rằng lượt ra ở test trên là lỗi thật, không phải do thiếu phiên hay đếm sớm."""
    clock = FakeClock()
    gate = coordinator(monkeypatch, tmp_path, clock=clock)
    frames = _enter()

    gate.process_snapshot(frames[0])
    gate.process_snapshot(frames[1])
    clock.advance(0.1)
    assert session_manager.find_session_by_global_id(42) is not None

    # Trong lúc đỗ + lăn bánh chậm, chưa được xoá phiên (chưa qua vạch ra y=0).
    for frame in frames[2:-2]:
        gate.process_snapshot(frame)
        clock.advance(0.1)
    assert session_manager.find_session_by_global_id(42) is not None


def test_co_legacy_tat_hanh_vi_moi(monkeypatch, tmp_path):
    """``accept_stale_source=False`` = hành vi cũ (bỏ snapshot có last_seen_time đứng yên)."""
    clock = FakeClock()
    gate = coordinator(
        monkeypatch, tmp_path, clock=clock, accept_stale_source=False
    )
    for frame in _enter():
        gate.process_snapshot(frame)
        clock.advance(0.1)
    assert session_manager.find_session_by_global_id(42) is not None


@pytest.mark.parametrize("parked_seconds", [3, 20, 200])
def test_do_bao_lau_cung_phai_co_exit(monkeypatch, tmp_path, parked_seconds):
    """Độ dài lúc đỗ không được quyết định việc có đếm lượt ra."""
    clock = FakeClock()
    gate = coordinator(monkeypatch, tmp_path, clock=clock)
    for frame in _enter(parked_seconds=parked_seconds):
        gate.process_snapshot(frame)
        clock.advance(0.1)
    assert session_manager.find_session_by_global_id(42) is None
