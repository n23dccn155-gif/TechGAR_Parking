"""
sample_tracking_simulator.py - Nguồn dữ liệu giả (Camera Simulator)

Mô phỏng Camera quay thực tế:
- Phát chuyển động xe liên tục, khách quan theo thời gian thực.
- TUYỆT ĐỐI KHÔNG dừng xe lại chờ tương tác từ giao diện Web.
- Xe đi từ Cổng vào -> Di chuyển trong bãi -> Đỗ vào ô -> Rời bãi ra Cổng ra.
"""

import json
import time
import math
import argparse
from datetime import datetime
from pathlib import Path
import sys

try:
    sys.stdout.reconfigure(encoding='utf-8')
except Exception:
    pass

BASE_DIR = Path(__file__).resolve().parent
OUTPUT_JSON = BASE_DIR.parent / "frontend" / "public" / "vehicle_positions_sample.json"
OUTPUT_STATUS_JSON = BASE_DIR.parent / "frontend" / "public" / "parking_status_sample.json"

# ── Cấu hình kịch bản di chuyển thực tế của các xe ──
SCENARIO = [
    {
        "track_id": 1,
        "spawn_time": 0,
        "gate_wait": 3.0,
        "travel_time": 30.0,
        "park_duration": 40.0,
        "exit_time": 25.0,
        "spot_destination": "D06",
        # Đi vào (entrance y=790) → đỗ D06
        "inbound": [(1100, 790), (1100, 775), (540, 775), (540, 274), (488, 274)],
        "outbound": [(488, 274), (540, 274), (540, 75), (1100, 75), (1100, 90)]
    },
    {
        "track_id": 2,
        "spawn_time": 18,
        "gate_wait": 3.0,
        "travel_time": 30.0,
        "park_duration": 35.0,
        "exit_time": 25.0,
        "spot_destination": "B04",
        # Đi vào (entrance y=790) → đỗ B04
        "inbound": [(1100, 790), (1100, 775), (840, 775), (840, 438), (788, 438)],
        "outbound": [(788, 438), (840, 438), (840, 75), (1100, 75), (1100, 90)]
    },
    {
        "track_id": 3,
        "spawn_time": 36,
        "gate_wait": 3.0,
        "travel_time": 30.0,
        "park_duration": 30.0,
        "exit_time": 25.0,
        "spot_destination": "E02",
        # Đi vào (entrance y=790) → đỗ E02
        "inbound": [(1100, 790), (1100, 775), (250, 775), (250, 602), (292, 602)],
        "outbound": [(292, 602), (250, 602), (250, 75), (1100, 75), (1100, 90)]
    }
]


def get_path_position(waypoints, progress: float):
    progress = max(0.0, min(1.0, progress))
    if progress == 0.0: return waypoints[0]
    if progress == 1.0: return waypoints[-1]
    
    lens = []
    total_len = 0.0
    for i in range(len(waypoints) - 1):
        l = math.hypot(waypoints[i+1][0] - waypoints[i][0], waypoints[i+1][1] - waypoints[i][1])
        lens.append(l)
        total_len += l
        
    target_dist = progress * total_len
    accum = 0.0
    for i, l in enumerate(lens):
        if accum + l >= target_dist:
            seg_p = (target_dist - accum) / l if l > 0 else 0
            x = waypoints[i][0] + (waypoints[i+1][0] - waypoints[i][0]) * seg_p
            y = waypoints[i][1] + (waypoints[i+1][1] - waypoints[i][1]) * seg_p
            return (round(x, 1), round(y, 1))
        accum += l
    return waypoints[-1]


def save_json_atomic(data: dict, path: Path):
    path.parent.mkdir(parents=True, exist_ok=True)
    for _ in range(5):
        try:
            with path.open("w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
            return
        except Exception:
            time.sleep(0.05)


def main():
    print("=" * 60)
    print(" [CAMERA GIẢ] SAMPLE TRACKING SIMULATOR (CONTINUOUS MODE)")
    print("=" * 60)
    print(f"Ghi du lieu vao: {OUTPUT_JSON.name}")
    print("Simulator phat chuyen dong thoi gian thuc doc lap. Khong cho Web.")
    
    sim_start_time = time.time()
    vehicle_states = {}
    for cfg in SCENARIO:
        vehicle_states[cfg["track_id"]] = {
            "config": cfg,
            "trail": [],
            "last_pos": None,
        }
    
    try:
        while True:
            now = time.time()
            elapsed = now - sim_start_time
            active_vehicles = {}
            all_done = True
            
            for t_id, state in vehicle_states.items():
                cfg = state["config"]
                t_rel = elapsed - cfg["spawn_time"]
                
                if t_rel < 0:
                    all_done = False
                    continue
                
                t_gate = cfg["gate_wait"]
                t_inbound = t_gate + cfg["travel_time"]
                t_park = t_inbound + cfg["park_duration"]
                t_outbound = t_park + cfg["exit_time"]
                
                pos = None
                status = "moving"
                phase = "SPAWNING"
                
                if t_rel < t_gate:
                    pos = cfg["inbound"][0]
                    status = "waiting"
                    phase = "WAITING_GATE"
                    all_done = False
                elif t_rel < t_inbound:
                    progress = (t_rel - t_gate) / cfg["travel_time"]
                    pos = get_path_position(cfg["inbound"], progress)
                    status = "moving"
                    phase = "INBOUND"
                    all_done = False
                elif t_rel < t_park:
                    pos = cfg["inbound"][-1]
                    status = "parked"
                    phase = "PARKED"
                    all_done = False
                elif t_rel < t_outbound:
                    progress = (t_rel - t_park) / cfg["exit_time"]
                    pos = get_path_position(cfg["outbound"], progress)
                    status = "exiting"
                    phase = "OUTBOUND"
                    all_done = False
                else:
                    phase = "EXITED"
                    continue
                
                # ── Ghi trail ──
                if pos is not None:
                    if status != "parked":
                        last_p = state["last_pos"]
                        if last_p is None or math.hypot(pos[0]-last_p[0], pos[1]-last_p[1]) > 10:
                            state["trail"].append({"x": pos[0], "y": pos[1]})
                            state["last_pos"] = pos
                            if len(state["trail"]) > 20: state["trail"].pop(0)
                    else:
                        state["trail"] = []
                        state["last_pos"] = pos

                    active_vehicles[str(t_id)] = {
                        "track_id": t_id,
                        "status": status,
                        "phase": phase,
                        "position": {"x": pos[0], "y": pos[1]},
                        "trail": state["trail"],
                        "vehicle_class": "car",
                        "confidence": 0.99,
                        "parked_spot_id": cfg.get("spot_destination") if status == "parked" else None,
                    }
                
            json_data = {
                "timestamp": datetime.now().astimezone().isoformat(timespec="milliseconds"),
                "source": "sample_simulator",
                "frame_size": {"width": 1200, "height": 900},
                "active_count": len(active_vehicles),
                "active_vehicles": active_vehicles,
            }
            save_json_atomic(json_data, OUTPUT_JSON)
            
            # Ghi đồng bộ trạng thái đỗ xe để đè lên MockParkingDataSource
            all_spots = {}
            for zone in ["A", "B", "C", "D", "E", "F"]:
                for i in range(1, 9):
                    all_spots[f"{zone}{i:02d}"] = {"status": "empty", "confidence": 0.99}
            
            for v in active_vehicles.values():
                if v.get("status") == "parked" and v.get("parked_spot_id"):
                    all_spots[v["parked_spot_id"]]["status"] = "occupied"
                    
            status_data = {
                "timestamp": json_data["timestamp"],
                "source": "sample_simulator",
                "slots": all_spots
            }
            save_json_atomic(status_data, OUTPUT_STATUS_JSON)
            
            if all_done:
                print("Tat ca xe da roi bai. Lap lai kich ban sau 4 giay...")
                time.sleep(4.0)
                sim_start_time = time.time()
                for s in vehicle_states.values():
                    s["trail"] = []
                    s["last_pos"] = None
            
            time.sleep(0.1)  # 10 FPS
            
    except KeyboardInterrupt:
        print("Stopped Simulator.")

if __name__ == "__main__":
    main()
