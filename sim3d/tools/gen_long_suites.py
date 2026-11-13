"""Sinh 10 kịch bản DÀI (sáng/tối × 5/10/20/30/60 phút) cho đo độ ổn định — P19a.

Mục đích: kiểm engine có ổn định suốt video dài không. Nhịp xe vào thay đổi theo độ dài,
nên khi so sánh kết quả cần tính đến khác biệt mức tải.

Mức tải (xem `ARRIVE_GAP_S_BY_MINUTES` và hằng số bên dưới):

- **40 xe đỗ sẵn** (nền), **không tự rời** — chỉ rời khi có lệnh ``leave`` (mỗi 30 s một xe);
- xe vào đều: **6 s/xe** cho bản 5/10 phút, **8 s/xe** cho bản 20/30/60 phút (biên an toàn theo
  định luật Little — lead duyệt P19f-b);
- đỗ ngẫu nhiên 60–240 s rồi tự ra (luồng chính); xe nào **không kịp** ra trước khi hết video thì
  **không đặt** ``park_s`` ⇒ đỗ tới hết (hợp lệ);
- **không có** lớp "xe bổ sung" (bản P19a có, nhưng nó làm tràn 100 ô ở video dài).

Đỉnh ô đo được (engine thật): 5 phút **63**, 10 phút **76–77**; 20/30/60 phút với nhịp 8 s dự kiến
**≤ 90** sau khi giãn nhịp (chờ đo khi engine P20a xong).

Môi trường:
- **Sáng** ``L_sang_*``: 8h00 nắng 0,8 → mây nhẹ ở giữa video → nắng lại; preset E2.
- **Tối**   ``L_toi_*`` : 19h00 trời quang đêm, đèn bãi bật; preset E6.
- Không nhiễu camera (chỉ đo ảnh hưởng thời gian + ánh sáng).

Ghi ``sim3d/data/templates_long/<id>.sim3d.json``, newline LF. Không sửa ``gen_load_suites.py``.

Chạy từ gốc repo::

    python sim3d/tools/gen_long_suites.py
"""

from __future__ import annotations

import json
import sys
from dataclasses import dataclass, field, replace
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parent))
from gen_load_suites import kf  # noqa: E402
from gen_templates import (  # noqa: E402
    CAR_COLORS,
    CAR_MODELS,
    CAR_SCALE,
    DEFAULT_SPEED_KMH,
    FPS,
    LOT_NAME,
    NARROW_SLOT_WIDTH_M,
    NOISE_KINDS,
    SCHEMA,
    Mulberry32,
    load_lot,
    reachable_slots,
)

TEMPLATES_LONG_DIR = Path(__file__).resolve().parents[1] / "data" / "templates_long"

# ---- Các thông số tải chung; nhịp vào riêng theo độ dài (xem docstring) ----
N_INITIAL_PARKED = 40
PARK_S = (60, 240)
BASE_LEAVE_GAP_S = 30.0

# P19f-b (lead duyệt): nhịp xe vào **tách theo độ dài**.
#
# 5/10 phút giữ **6 s** (đo được `rejected = 0`: đỉnh 63 / 76 ô).
# 20/30/60 phút dùng **8 s** để có biên an toàn theo định luật Little:
#   tải = 60/gap xe/phút; thời gian chiếm ô ≈ vào 30 + đỗ 150 + ra 105 ≈ 285 s
#   6 s ⇒ 10 xe/phút ⇒ L ≈ 47 ⇒ + 40 nền = 87–98/100  (sát trần, dễ bị từ chối sự kiện)
#   8 s ⇒ 7,5 xe/phút ⇒ L ≈ 36 ⇒ + 40 nền = 76–90/100  (đúng mục tiêu ≤ 90 của lead)
ARRIVE_GAP_S_BY_MINUTES: dict[int, float] = {5: 6.0, 10: 6.0, 20: 8.0, 30: 10.0, 60: 10.0}

# P21 (lead duyệt): `L_toi_60` giữ nhịp 10 s như bảng trên, nhưng dùng **seed 7904** = đúng lịch của
# `L_sang_60`, chỉ đổi env sang ban đêm (E6). Lý do đo được: với seed 8004, L_toi_60 hỏng vì
# **deadlock vùng** (`need_zone`) — xe nền kẹt `leaving_slot` từ f23 500 (940 s) và không bao giờ
# thoát; đây là lỗi theo seed nên KHÔNG sửa được bằng cách bỏ/dịch giờ xe hay giảm tải
# (giảm còn 12 s lại nặng hơn: kẹt 59 550 vs 8 498 frame). Với seed 7904 thì PASS.
SEED_OVERRIDE: dict[str, int] = {"L_toi_60": 7904}

# ---- P19f (ANS_39 mục 3, chỉ đạo director): video ĐÚNG tên, KHÔNG đuôi ----
#
# Đo từ `KICH_BAN_TAI.md` (559 lượt): từ lúc **xuất hiện** tới **đỗ xong** trung vị 104 s,
# p99 **304 s** (đó là bộ A/B/C **rất dày** — 85 xe cách 3,5 s; bộ dài ở đây thưa hơn nhiều).
# Từ **rời ô** tới **ra khỏi bãi** p99 **160 s**.
#
# Ràng buộc: khi hết video mọi xe phải `exited` **hoặc `parked`** (đỗ tới hết là hợp lệ — director
# chấp nhận). Chỉ xe còn `driving_*`/`leaving_slot`/`entering` mới là lỗi.
#
# Video 5 phút (300 s) **không thể** dùng hằng số 320 s cho mọi độ dài (sẽ ra `arrive_end` âm),
# nên dùng guard **co giãn**: đủ lớn cho bộ dày nhưng không vượt quá nửa video. Đo lại bằng engine.
ARRIVE_CUT_S = 320
DEPART_CUT_S = 200
# Thời gian tối đa từ lúc **rời ô** tới lúc **ra khỏi bãi** (p99 đo được 160 s; +60 s dự phòng vì
# nhiều xe ra cùng lúc phải xếp hàng).
LEAVE_BUDGET_S = 220
# Ước lượng thận trọng từ lúc tạo đến khi đỗ xong. park_s bắt đầu SAU khi đỗ;
# đây là dự phòng, không phải giới hạn runtime và phải kiểm bằng mô phỏng.
PARK_ARRIVAL_BUFFER_S = 200


def _guard(duration_s: float, hard_cap: float) -> float:
    """Thời gian chừa ở cuối: tối đa `hard_cap`, nhưng ≤ 45 % video (để còn cửa sổ hoạt động)."""
    return min(hard_cap, max(45.0, duration_s * 0.45))

DURATIONS_MIN = (5, 10, 20, 30, 60)
SEED_BASE = 7900


@dataclass(frozen=True)
class LongSpec:
    """Một kịch bản dài: id, số phút, bảng môi trường, seed."""

    id: str
    minutes: int
    env: list[dict[str, Any]]
    preset: str
    name_prefix: str
    seed: int = field(default=0)


def _morning_env(activity_s: int) -> list[dict[str, Any]]:
    """8h → 9h nắng 0,8, mây nhẹ ở giữa video rồi nắng lại.

    Mốc giờ chạy đúng trên **cửa sổ hoạt động** (`activity_s`); phần đuôi video giữ nguyên trạng
    thái cuối (không có keyframe sau ⇒ engine giữ mốc cuối, đúng ý "9h nắng").
    """
    mid = activity_s / 2
    span = max(60.0, activity_s / 6)
    hours_per_second = 1.0 / 3600.0  # 8h → 9h trong đúng cửa sổ hoạt động
    return [
        kf(0.0, 8.0, "sun", 0.8),
        kf(max(1.0, mid - span / 2), 8.0 + (mid - span / 2) * hours_per_second, "cloud", 0.55),
        kf(mid + span / 2, 8.0 + (mid + span / 2) * hours_per_second, "sun", 0.8),
    ]


def _evening_env(activity_s: int) -> list[dict[str, Any]]:
    """19h → 20h trời quang, đêm, đèn bãi (weather `sun` = trời quang nhưng hour = 19–20)."""
    hours_per_second = 1.0 / 3600.0
    return [
        kf(0.0, 19.0, "sun", 0.8),
        kf(activity_s, 19.0 + activity_s * hours_per_second, "sun", 0.8),
    ]


def build_specs() -> list[LongSpec]:
    specs: list[LongSpec] = []
    for index, minutes in enumerate(DURATIONS_MIN):
        specs.append(
            LongSpec(
                id=f"L_sang_{minutes:02d}",
                minutes=minutes,
                env=_morning_env(minutes * 60),
                preset="E2",
                name_prefix="Sáng",
                seed=SEED_BASE + index,
            )
        )
    for index, minutes in enumerate(DURATIONS_MIN):
        specs.append(
            LongSpec(
                id=f"L_toi_{minutes:02d}",
                minutes=minutes,
                env=_evening_env(minutes * 60),
                preset="E6",
                name_prefix="Tối",
                seed=SEED_BASE + 100 + index,
            )
        )
    return specs


def build(spec: LongSpec, lot: dict[str, Any], gap_override: float | None = None) -> dict[str, Any]:
    # Video ĐÚNG tên (không đuôi) — P19f.
    duration_s = spec.minutes * 60
    # Chừa đủ thời gian cho xe đi hết vòng đời (co giãn theo độ dài — xem _guard).
    arrive_end = duration_s - _guard(duration_s, ARRIVE_CUT_S)
    leave_end = duration_s - _guard(duration_s, DEPART_CUT_S)
    if spec.minutes >= 20:
        arrive_end = min(arrive_end, duration_s - 120)
        leave_end = min(leave_end, duration_s - 200)
    seed = SEED_OVERRIDE.get(spec.id, spec.seed)
    rng = Mulberry32(seed)
    slots = reachable_slots(lot)
    order = rng.shuffle(list(slots))

    # Xe đỗ sẵn ban đầu (nền). KHÔNG đặt park_s -> đỗ tới khi có lệnh rời.
    placement: list[dict[str, Any]] = []
    for index, slot in enumerate(order[:N_INITIAL_PARKED]):
        narrow = float(slot.get("width_m", 9.0)) < NARROW_SLOT_WIDTH_M
        placement.append(
            {
                "slot": slot["id"],
                "car_id": f"V{index + 1:03d}",
                "model": "hatch" if narrow else rng.choice(CAR_MODELS),
                "color": rng.choice(CAR_COLORS),
            }
        )

    events: list[dict[str, Any]] = []
    frame_of = lambda t: round(t * FPS)  # noqa: E731

    # Xe nền rời dần (dừng sớm để kịp ra bãi).
    #
    # P19f: **bỏ phần "xe nền bổ sung"** của P19a. Lý do đo được: xe bổ sung đỗ tới hết video nên
    # mỗi 30 s lại cộng 1 xe **vĩnh viễn**; ở video 60 phút nó cộng 112 xe ⇒ bãi tràn 100 ô và
    # `add_car` bị từ chối (đo ở P19e: L_sang_20 ×20 phút đã bị từ chối 49 sự kiện).
    # Nền nay chỉ gồm `N_INITIAL_PARKED` xe đỗ sẵn, rời dần theo lệnh ⇒ số ô luôn ổn định.
    t = BASE_LEAVE_GAP_S
    while t <= leave_end:
        events.append({"frame": frame_of(t), "type": "leave", "params": {"car_id": ""}})
        t += BASE_LEAVE_GAP_S

    # Luồng chính: xe vào đều (6 s cho 5/10 phút, 8 s cho 20/30/60 — xem ARRIVE_GAP_S_BY_MINUTES),
    # đỗ 60–240 s rồi ra.
    #
    # P19f: xe nào **không kịp** đỗ hết `park_s` + ra khỏi bãi trước khi hết video thì **không đặt
    # `park_s`** — nó đỗ tới hết video. Đây đúng là trường hợp director chấp nhận ("xe đỗ sẵn/đỗ đến
    # cuối video không lệnh ra = chấp nhận"), và tránh sinh ra xe `driving_to_exit` lúc hết video.
    arrive_gap = (
        gap_override if gap_override is not None else ARRIVE_GAP_S_BY_MINUTES[spec.minutes]
    )
    t = 5.0
    while t <= arrive_end:
        lo, hi = PARK_S
        plenty = t + hi + LEAVE_BUDGET_S <= duration_s
        params: dict[str, Any] = {
            "slot": "random_free",
            "speed_kmh": 9 + rng.randint(4),
            "model": rng.choice(CAR_MODELS),
            "color": rng.choice(CAR_COLORS),
        }
        if plenty:
            park_s = round(lo + rng.random() * (hi - lo))
            if spec.minutes < 20 or t + PARK_ARRIVAL_BUFFER_S + park_s <= duration_s - 200:
                params["park_s"] = park_s
        events.append({"frame": frame_of(t), "type": "add_car", "params": params})
        t += arrive_gap

    # `leave` cần car_id của xe ĐANG ĐỖ. Gán vòng theo thứ tự tất định.
    #
    # P19f: chỉ dùng **mỗi xe nền đúng một lần** (không xoay vòng) — nếu xoay vòng thì lệnh thứ N
    # trỏ lại xe đã rời từ lâu và thành sự kiện vô nghĩa. Số lệnh rời cũng phải ≤ số xe nền, nếu
    # không phần dư không có ai để rời.
    leavers = [car["car_id"] for car in placement]
    leave_events = [event for event in events if event["type"] == "leave"]
    if len(leave_events) > len(leavers):
        for event in leave_events[len(leavers):]:
            events.remove(event)
        leave_events = leave_events[: len(leavers)]
    for index, event in enumerate(leave_events):
        event["params"]["car_id"] = leavers[index]

    # P21: loại xung đột tại cổng V003/V053 trong riêng bản sáng 20 phút.
    if spec.id == "L_sang_20":
        leave_v003 = next(event for event in leave_events if event["params"]["car_id"] == "V003")
        assert leave_v003["frame"] == frame_of(90)
        events.remove(leave_v003)
        arrive_v053 = next(event for event in events if event["type"] == "add_car" and event["frame"] == frame_of(101))
        events.remove(arrive_v053)
        # Lượt đo sau khi bỏ V053: V133 parking_in xuyên V123 tại frame 25484.
        arrive_v133 = next(event for event in events if event["type"] == "add_car" and event["frame"] == frame_of(749))
        events.remove(arrive_v133)
    if spec.id == "L_toi_05":
        # P21: bỏ xe nền chiếm ô cạnh lối vào gây xuyên lặp lại cho xe mới.
        placement = [car for car in placement if car["car_id"] != "V040"]
    if spec.id == "L_sang_10":
        # P21: V067 vào ô xuyên V034 đang đỗ từ frame 6823.
        assert not any(event["type"] == "leave" and event["params"]["car_id"] == "V034" for event in events)
        placement = [car for car in placement if car["car_id"] != "V034"]
    if spec.id == "L_sang_60":
        # P21: V059 vào ô xuyên xe nền V027 tại frame 5711.
        placement = [car for car in placement if car["car_id"] != "V027"]
        events = [event for event in events if not (
            event["type"] == "leave" and event["params"]["car_id"] == "V027"
        )]
        # Sau sửa trên: V174 bị V190 chặn trong đợt kẹt toàn cục tại frame 42907.
        arrive_v190 = next(event for event in events if event["type"] == "add_car" and event["frame"] == frame_of(1495))
        events.remove(arrive_v190)
        # V190 kế tiếp vẫn gặp xe ra V174; bỏ thêm lượt vào tạo V174 ban đầu.
        arrive_v174 = next(event for event in events if event["type"] == "add_car" and event["frame"] == frame_of(1335))
        events.remove(arrive_v174)
    if spec.id == "L_sang_60":
        # P21 (coders-1): sau 3 xe trên, còn 1 cặp xuyên V332/V338 sâu 8,618 cm tại f77924 (3117 s).
        # V332 (vào 2945 s, park_s 174) đang đỗ, V338 (vào 2995 s) húc vào khi vào ô.
        # Giữ nguyên số xe: dịch giờ vào của V338 +55 s (KHÔNG phải bội số của nhịp 10 s
        # nên chỉ đổi đúng 1 lượt, không trôi các lượt sau như +60 s).
        arrive_v338 = next(event for event in events if event["type"] == "add_car" and event["frame"] == frame_of(2995))
        arrive_v338["frame"] = frame_of(3050)
    if spec.id == "L_toi_20":
        # P21: V150 chưa đỗ xong ở frame cuối; bỏ lượt vào cuối cùng.
        arrive_v150 = next(event for event in events if event["type"] == "add_car" and event["frame"] == frame_of(877))
        events.remove(arrive_v150)
    if spec.id == "L_toi_20":
        # P21: xe cuối V150 còn `parking_in` lúc hết video. Hàng đợi đuôi 20 phút ổn định ở
        # ~242–248 s (V146…V150 đều chờ đúng ngần ấy rồi mới vào cổng), mà từ lúc vào cổng tới
        # đỗ xong cần thêm ~60–90 s. V150 vào 877 s chỉ còn 323 s ⇒ thiếu ~10 s.
        # Bỏ 3 lượt vào muộn nhất (861/869/877 s) để xe cuối còn ~347 s.
        late = {event["frame"] for event in [e for e in events if e["type"] == "add_car"][-3:]}
        events = [
            event
            for event in events
            if not (event["type"] == "add_car" and event["frame"] in late)
        ]
    if spec.id == "L_toi_60":
        # P21 (lead duyệt, "hướng c"): L_toi_60 dùng **đúng lịch của L_sang_60** (seed 7904), chỉ đổi
        # env sang ban đêm. Vì vậy phải áp **cùng** các sửa lịch mà L_sang_60 đã được duyệt — nếu
        # không, file sinh ra sẽ khác bản đã PASS (`D6E3B232`) và có thể tái xuất lỗi cũ.
        # Lý do nền: với seed 8004, L_toi_60 hỏng vì **deadlock vùng** (`need_zone`) — lỗi theo seed,
        # không sửa được bằng cách bỏ/dịch giờ xe hay giảm tải.
        placement = [car for car in placement if car["car_id"] != "V027"]
        events = [event for event in events if not (
            event["type"] == "leave" and event["params"]["car_id"] == "V027"
        )]
        arrive_v190 = next(event for event in events if event["type"] == "add_car" and event["frame"] == frame_of(1495))
        events.remove(arrive_v190)
        arrive_v174 = next(event for event in events if event["type"] == "add_car" and event["frame"] == frame_of(1335))
        events.remove(arrive_v174)
        arrive_v338 = next(event for event in events if event["type"] == "add_car" and event["frame"] == frame_of(2995))
        arrive_v338["frame"] = frame_of(3050)
    if spec.id == "L_sang_30":
        # P21: V178/V179 xuyên 99,96 cm từ f39 114 (1564,6 s) rồi cả bãi kẹt tới hết video.
        # Xe đỗ sẵn là V001–V040, nên lượt `add_car` thứ k sinh ra V(40+k): V178 = lượt 138.
        # Bỏ V178 (vào 1375 s, đỗ ô S024) vì chính nó nằm trên quỹ đạo vào ô S041 của xe sau.
        arrivals = [event for event in events if event["type"] == "add_car"]
        for index in (137,):  # 0-based ⇒ V178 (vào 1375 s)
            events.remove(arrivals[index])
    if spec.id == "L_toi_30":
        # P21: V161 kẹt `leaving_slot` ở ô S007 vì V181 đứng chắn, V168 xếp sau ⇒ kẹt toàn cục
        # 5 508 frame (220 s). V181 = lượt `add_car` thứ 142 (0-based 140), vào 1405 s.
        arrivals = [event for event in events if event["type"] == "add_car"]
        events.remove(arrivals[140])

    events.sort(key=lambda e: (e["frame"], 0 if e["type"] == "leave" else 1))

    noise: dict[str, Any] = {kind: {"on": False, "level": 0.5} for kind in NOISE_KINDS}
    noise["seed"] = seed

    return {
        "schema": SCHEMA,
        "name": f"{spec.name_prefix} {spec.minutes} phút (ổn định)",
        "description": (
            f"Kịch bản dài {spec.minutes} phút{' (buổi tối)' if spec.id == 'L_toi_60' else ''} "
            f"(ĐÚNG {duration_s:.0f} s, không đuôi) để đo độ ổn "
            f"định: {len(placement)} xe đỗ sẵn, xe vào mỗi {arrive_gap:g} s (đỗ 60–240 s rồi ra), "
            f"mỗi {BASE_LEAVE_GAP_S:g} s một xe đỗ sẵn rời. Ngừng nhận xe mới ở "
            f"{arrive_end:.0f} s và ngừng lệnh rời ở {leave_end:.0f} s để xe cuối kịp đỗ/ra trước "
            f"khi hết video. Xe không kịp ra thì đỗ tới hết. Không nhiễu camera."
        ),
        "lot": LOT_NAME,
        "seed": seed,
        "car_scale": CAR_SCALE,
        "default_speed_kmh": DEFAULT_SPEED_KMH,
        "camera_mode": "2cam",
        "initial": {"n_parked": len(placement), "placement": placement},
        "env": {"preset": spec.preset, "keyframes": spec.env},
        "noise": noise,
        "events": events,
        "duration_frames": duration_s * FPS,
    }


def main() -> None:
    import argparse

    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--out", type=Path, default=TEMPLATES_LONG_DIR)
    parser.add_argument("--only", nargs="*", default=None, help="chỉ các id này")
    # P21: thử BIẾN THỂ SEED cho riêng một kịch bản (vd L_toi_60 seed +1) mà không đụng
    # bản chuẩn trong templates_long — ghi ra --out khác.
    parser.add_argument("--seed-offset", type=int, default=0, help="cộng thêm vào seed của mọi kịch bản được sinh")
    # P21: ép nhịp vào (giây) cho riêng lượt sinh này (bỏ qua bảng mặc định) — dùng để thử biến thể
    # khi một kịch bản cần nhịp khác; bản chuẩn vẫn lấy từ `ARRIVE_GAP_S_BY_MINUTES`.
    parser.add_argument("--gap", type=float, default=None, help="ép nhịp xe vào (giây), bỏ qua bảng mặc định")
    args = parser.parse_args()
    args.out.mkdir(parents=True, exist_ok=True)
    lot = load_lot()
    for spec in build_specs():
        if args.only is not None and spec.id not in args.only:
            continue
        if args.seed_offset:
            spec = replace(spec, seed=spec.seed + args.seed_offset)
        data = build(spec, lot, args.gap)
        path = args.out / f"{spec.id}.sim3d.json"
        # newline="\n" -> LF, đúng yêu cầu
        with path.open("w", encoding="utf-8", newline="\n") as handle:
            handle.write(json.dumps(data, ensure_ascii=False, indent=1) + "\n")
        print(
            f"ghi {path.name}: {spec.minutes:>2} phút, "
            f"{len(data['events'])} sự kiện, {len(data['initial']['placement'])} xe đỗ sẵn"
        )


if __name__ == "__main__":
    main()
