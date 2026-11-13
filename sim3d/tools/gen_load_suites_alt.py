"""Sinh lịch C3 dự phòng vào thư mục riêng, không thay mẫu chính.

Lệnh rời của V023 chuyển từ 70 s sang 60 s để tránh đợi V047 đang vào ô.
Lịch này đã được lead duyệt đưa vào bộ chính ở P21; bản xuất này chỉ để đối chiếu.
"""

from __future__ import annotations

import json
from pathlib import Path

from gen_load_suites import FPS, SUITES, build, load_lot


def main() -> None:
    spec = next(item for item in SUITES if item.id == "C3_tai_dem_mua")
    data = build(spec, load_lot())
    event = next(item for item in data["events"]
                 if item["type"] == "leave" and item["params"]["car_id"] == "V023")
    # Lịch dự phòng đã được lead duyệt áp dụng vào bộ chính ở P21.
    assert event["frame"] in (60 * FPS, 70 * FPS)
    event["frame"] = 60 * FPS
    data["events"].sort(key=lambda item: (item["frame"], 0 if item["type"] == "leave" else 1))
    data["description"] += " Dự phòng: V023 rời từ giây 60 thay vì giây 70."
    out = Path(__file__).resolve().parents[2] / ".orca" / "sim3d" / "c3-alt" / "templates"
    out.mkdir(parents=True, exist_ok=True)
    path = out / f"{spec.id}.sim3d.json"
    path.write_text(json.dumps(data, ensure_ascii=False, indent=1) + "\n", encoding="utf-8", newline="\n")
    print(path)


if __name__ == "__main__":
    main()
