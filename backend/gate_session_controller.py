"""
gate_session_controller.py - Kẻ Gác Cổng (Gate Session Watcher) & API Server

Nhiệm vụ:
1. Đứng nhìn (watch) file Tracking Feed (ví dụ: vehicle_positions_sample.json).
2. Khi thấy track_id mới xuất hiện gần cổng -> Tạo Session (WAITING_FOR_SCAN, chưa có target).
3. Tích hợp HTTP API Server trên cổng 8000 để Frontend gửi Yêu cầu:
   - POST /api/session/claim    : User quét QR (WAITING_FOR_SCAN -> SELECTING_SPOT)
   - POST /api/session/select   : User chọn ô đỗ (SELECTING_SPOT -> NAVIGATING_TO_SPOT)
   - POST /api/session/exit     : User bấm lấy xe ra (PARKED -> EXIT_NAVIGATION)
   - GET  /api/sessions         : Đọc tất cả session
4. [Sample mode] Tự động cập nhật parking_status_sample.json khi xe đỗ / rời ô.
"""

import json
import time
import argparse
import threading
import subprocess
from http.server import HTTPServer, BaseHTTPRequestHandler
from pathlib import Path
import sys

try:
    sys.stdout.reconfigure(encoding='utf-8')
except Exception:
    pass

BASE_DIR = Path(__file__).resolve().parent
sys.path.append(str(BASE_DIR))
try:
    from session_manager import (
        create_session, claim_session, select_spot, load_sessions, save_sessions,
        set_parked, set_exit_navigation, close_session, now_iso
    )
except ImportError as e:
    print(f"Khong tim thay session_manager.py! Loi: {e}")
    sys.exit(1)

# ── Quản lý Tiến trình AI Detection (main_detect) ──
detection_process = None
active_video_url = str(BASE_DIR / "main_detect" / "data" / "carPark.mp4")

def start_detection_process(video_source: str):
    global detection_process, active_video_url
    stop_detection_process()
    active_video_url = video_source
    main_script = BASE_DIR / "main_detect" / "main.py"
    output_dir = BASE_DIR.parent / "frontend" / "public"
    
    cmd = [
        sys.executable,
        str(main_script),
        "--video", video_source,
        "--output-dir", str(output_dir),
        "--loop",
        "--no-display"
    ]
    print(f"[AI ENGINE] Kich hoat main_detect voi nguon: {video_source}")
    try:
        detection_process = subprocess.Popen(cmd)
    except Exception as e:
        print(f"[AI ENGINE ERROR] Khong the khoi chay main_detect: {e}")

def stop_detection_process():
    global detection_process
    if detection_process and detection_process.poll() is None:
        print("[AI ENGINE] Dung luong main_detect hien tai...")
        try:
            detection_process.terminate()
            detection_process.wait(timeout=2)
        except Exception:
            detection_process.kill()
    detection_process = None

# ── Đường dẫn file ──
PARKING_STATUS_SAMPLE = BASE_DIR.parent / "frontend" / "public" / "parking_status_sample.json"
SESSIONS_FILE = BASE_DIR.parent / "frontend" / "public" / "navigation_sessions.json"
GATE_ROI_PATH = BASE_DIR.parent / "frontend" / "public" / "gate_roi.json"


def load_gate_roi() -> dict:
    if GATE_ROI_PATH.exists():
        try:
            with open(GATE_ROI_PATH, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass
    return {
        "entry_gate": {"p1": {"x": 880, "y": 820}, "p2": {"x": 1120, "y": 820}},
        "exit_gate": {"p1": {"x": 80, "y": 820}, "p2": {"x": 320, "y": 820}}
    }


def check_line_intersection(p1: dict, p2: dict, p3: dict, p4: dict) -> bool:
    """
    Kiểm tra xem đoạn thẳng p1-p2 (vệt xe chạy) có giao cắt với vạch rào chắn p3-p4 hay không.
    p1..p4 là dict {"x": int, "y": int}
    """
    def ccw(A, B, C):
        return (C["y"] - A["y"]) * (B["x"] - A["x"]) > (B["y"] - A["y"]) * (C["x"] - A["x"])

    return (ccw(p1, p3, p4) != ccw(p2, p3, p4)) and (ccw(p1, p2, p3) != ccw(p1, p2, p4))


def get_crossing_direction(p_old: dict, p_new: dict, p3: dict, p4: dict) -> float:
    """
    Tính tích hướng Vector Cross Product để phân biệt hướng xe cắt vạch.
    """
    vx = p_new["x"] - p_old["x"]
    vy = p_new["y"] - p_old["y"]
    gx = p4["x"] - p3["x"]
    gy = p4["y"] - p3["y"]
    return (vx * gy) - (vy * gx)



def load_json_safe(path: Path) -> dict:
    if not path.exists():
        return {}
    try:
        with path.open("r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {}


def save_json_atomic(data: dict, path: Path):
    path.parent.mkdir(parents=True, exist_ok=True)
    try:
        with path.open("w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
    except Exception:
        pass


def update_sample_parking_status(spot_id: str, status: str):
    """
    Cập nhật parking_status_sample.json khi simulator xe đỗ/rời ô.
    Giúp đồng bộ occupancy trong sample mode.
    """
    data = load_json_safe(PARKING_STATUS_SAMPLE)
    if "slots" not in data:
        data["slots"] = {}
    data["slots"][spot_id] = {
        "status": status,
        "confidence": 0.99,
    }
    data["timestamp"] = now_iso()
    save_json_atomic(data, PARKING_STATUS_SAMPLE)


# ──────────────────────────────────────────────
#  HTTP API SERVER (Cổng 8000)
# ──────────────────────────────────────────────
class SessionAPIRequestHandler(BaseHTTPRequestHandler):
    def _send_cors_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS, PUT")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def do_OPTIONS(self):
        self.send_response(200)
        self._send_cors_headers()
        self.end_headers()

    def do_GET(self):
        if self.path.startswith("/api/sessions") or self.path.startswith("/navigation_sessions"):
            sessions = load_sessions()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self._send_cors_headers()
            self.end_headers()
            self.wfile.write(json.dumps(sessions, ensure_ascii=False, indent=2).encode("utf-8"))
        elif self.path == "/api/detection/status":
            is_running = detection_process is not None and detection_process.poll() is None
            self._respond_json({
                "running": is_running,
                "videoUrl": active_video_url,
            })
        else:
            self.send_response(404)
            self.end_headers()

    def do_POST(self):
        content_length = int(self.headers.get('Content-Length', 0))
        body_bytes = self.rfile.read(content_length) if content_length > 0 else b'{}'
        try:
            payload = json.loads(body_bytes.decode('utf-8'))
        except Exception:
            payload = {}

        sid = payload.get("sessionId")
        spot_id = payload.get("spotId")

        print(f"[API HTTP] {self.path} - Payload: {payload}")

        if self.path == "/api/detection/start":
            video_url = payload.get("videoUrl") or str(BASE_DIR / "main_detect" / "data" / "carPark.mp4")
            start_detection_process(video_url)
            self._respond_json({
                "ok": True,
                "status": "running",
                "videoUrl": video_url
            })

        elif self.path == "/api/detection/stop":
            stop_detection_process()
            self._respond_json({
                "ok": True,
                "status": "stopped"
            })

        elif self.path == "/api/session/claim":
            if sid:
                claim_session(sid)
                self._respond_json({"ok": True, "sessionId": sid, "state": "SELECTING_SPOT"})
            else:
                self._respond_json({"error": "Missing sessionId"}, status=400)

        elif self.path == "/api/session/select":
            if sid:
                select_spot(sid, spot_id)
                new_state = "NAVIGATING_TO_SPOT" if spot_id else "SELECTING_SPOT"
                self._respond_json({"ok": True, "sessionId": sid, "spotId": spot_id, "state": new_state})
            else:
                self._respond_json({"error": "Missing sessionId"}, status=400)

        elif self.path == "/api/session/exit":
            if sid:
                sessions = load_sessions()
                session = sessions.get(sid, {})
                parked_spot = session.get("parkedSpotId")
                set_exit_navigation(sid)
                if parked_spot:
                    update_sample_parking_status(parked_spot, "empty")
                self._respond_json({"ok": True, "sessionId": sid, "state": "EXIT_NAVIGATION"})
            else:
                self._respond_json({"error": "Missing sessionId"}, status=400)

        else:
            self._respond_json({"error": "Route not found"}, status=404)

    def do_PUT(self):
        # Hỗ trợ ghi đè file navigation_sessions trực tiếp nếu frontend PUT
        content_length = int(self.headers.get('Content-Length', 0))
        body_bytes = self.rfile.read(content_length) if content_length > 0 else b'{}'
        try:
            data = json.loads(body_bytes.decode('utf-8'))
            save_sessions(data)
            self._respond_json({"ok": True})
        except Exception as e:
            self._respond_json({"error": str(e)}, status=500)

    def _respond_json(self, data: dict, status: int = 200):
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self._send_cors_headers()
        self.end_headers()
        self.wfile.write(json.dumps(data, ensure_ascii=False).encode("utf-8"))

    def log_message(self, format, *args):
        # Ẩn bớt log http request định kỳ để terminal đỡ rác
        if "GET /api/sessions" in format % args:
            return
        super().log_message(format, *args)


def start_api_server(port: int = 8000):
    server = HTTPServer(("0.0.0.0", port), SessionAPIRequestHandler)
    print(f"[API SERVER] Listening on http://0.0.0.0:{port}")
    server.serve_forever()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", default="vehicle_positions_sample.json",
                        help="File tracking feed de watch")
    parser.add_argument("--port", type=int, default=8000, help="Port cho HTTP API Server")
    args = parser.parse_args()

    # Khởi chạy HTTP API Server ở background thread
    api_thread = threading.Thread(target=start_api_server, args=(args.port,), daemon=True)
    api_thread.start()
    
    feed_path = BASE_DIR.parent / "frontend" / "public" / args.source
    print("=" * 60)
    print(" [GATE CONTROLLER] GATE SESSION CONTROLLER & API DANG CHAY")
    print(f" Theo doi file: {args.source}")
    print(f" HTTP API Endpoint: http://localhost:{args.port}/api/session")
    print("=" * 60)
    
    # State tracking: track_id -> session_id
    active_tracks = {}
    prev_positions = {}
    
    try:
        while True:
            if not feed_path.exists():
                time.sleep(0.5)
                continue
                
            try:
                with open(feed_path, "r", encoding="utf-8") as f:
                    data = json.load(f)
            except Exception:
                time.sleep(0.1)
                continue
                
            vehicles = data.get("active_vehicles", {})
            current_track_ids = set(int(k) for k in vehicles.keys())
            gate_roi = load_gate_roi()
            entry_p1 = gate_roi["entry_gate"]["p1"]
            entry_p2 = gate_roi["entry_gate"]["p2"]
            exit_p1 = gate_roi["exit_gate"]["p1"]
            exit_p2 = gate_roi["exit_gate"]["p2"]

            # ── 1. Kiểm tra Vạch Cắt Cổng (Line Crossing Detection) ──
            for t_id_str, v_data in vehicles.items():
                t_id = int(t_id_str)
                pos = v_data.get("position", {"x": 0, "y": 0})
                old_pos = prev_positions.get(t_id, pos)
                prev_positions[t_id] = pos

                # Kiểm tra cắt VẠCH CỔNG VÀO (Nhập bãi)
                crossed_entry = check_line_intersection(old_pos, pos, entry_p1, entry_p2)
                if crossed_entry and t_id not in active_tracks:
                    cross_val = get_crossing_direction(old_pos, pos, entry_p1, entry_p2)
                    session_id = create_session(track_id=t_id)
                    print(f"[TRIPWIRE ENTRY] Xe #{t_id} VƯỢT VẠCH CỔNG VÀO (Hướng Vector Cross={cross_val:.1f})! "
                          f"Tạo Session: {session_id} (WAITING_FOR_SCAN)")
                    active_tracks[t_id] = session_id
                
                # Fallback: Xe mới xuất hiện ở vùng cổng vào (y > 700) nếu chưa cắt vạch
                elif t_id not in active_tracks and pos["y"] > 700:
                    session_id = create_session(track_id=t_id)
                    print(f"[GATE FALLBACK] Phát hiện xe #{t_id} tại vùng Cổng Vào! "
                          f"Tạo Session: {session_id}")
                    active_tracks[t_id] = session_id

                # Kiểm tra cắt VẠCH CỔNG RA (Xuất bãi)
                crossed_exit = check_line_intersection(old_pos, pos, exit_p1, exit_p2)
                if crossed_exit and t_id in active_tracks:
                    cross_val = get_crossing_direction(old_pos, pos, exit_p1, exit_p2)
                    session_id = active_tracks[t_id]
                    print(f"[TRIPWIRE EXIT] Xe #{t_id} VƯỢT VẠCH CỔNG RA (Hướng Vector Cross={cross_val:.1f})! Đóng Session {session_id}")
                    close_session(session_id)
                    del active_tracks[t_id]

            # ── [SAMPLE MODE] Xử lý cập nhật trạng thái từ simulated status ──
            for t_id_str, v_data in vehicles.items():
                t_id = int(t_id_str)
                if t_id not in active_tracks:
                    continue
                
                session_id = active_tracks[t_id]
                sessions = load_sessions()
                session = sessions.get(session_id, {})
                s_state = session.get("state")
                
                # Sample source báo xe "parked" -> lấy ĐÚNG ô thực tế từ camera/simulator (Không ghi đè nếu đang EXIT_NAVIGATION)
                if v_data.get("status") == "parked" and s_state not in ("PARKED", "EXIT_NAVIGATION", "CLOSED"):
                    real_parked_spot = v_data.get("parked_spot_id")
                    if real_parked_spot:
                        print(f"[PARK] Xe #{t_id} da do THUC TE tai o {real_parked_spot} -> PARKED")
                        set_parked(session_id, real_parked_spot)
                        update_sample_parking_status(real_parked_spot, "occupied")
                
                # Sample source báo xe "exiting" -> giải phóng ô đỗ thực tế
                elif v_data.get("status") == "exiting" and s_state in ("PARKED", "EXIT_NAVIGATION"):
                    real_parked_spot = session.get("parkedSpotId") or v_data.get("parked_spot_id")
                    print(f"[EXIT] Xe #{t_id} bat dau roi o do {real_parked_spot} -> EXIT_NAVIGATION")
                    set_exit_navigation(session_id, t_id)
                    if real_parked_spot:
                        update_sample_parking_status(real_parked_spot, "empty")

            # ── [AI / DETECT MODE] Tự động đọc vehicle_id từ parking_status.json để gán parkedSpotId ──
            status_file_name = "parking_status.json" if args.source == "vehicle_positions.json" else "parking_status_sample.json"
            status_path = BASE_DIR.parent / "frontend" / "public" / status_file_name
            status_data = load_json_safe(status_path)
            slots_data = status_data.get("slots", {})

            if isinstance(slots_data, dict):
                for spot_id, s_info in slots_data.items():
                    if isinstance(s_info, dict):
                        v_id = s_info.get("vehicle_id")
                        if v_id is not None:
                            try:
                                v_id_int = int(v_id)
                                if v_id_int in active_tracks:
                                    s_id = active_tracks[v_id_int]
                                    sessions = load_sessions()
                                    s_obj = sessions.get(s_id, {})
                                    if s_obj.get("state") not in ("PARKED", "CLOSED") and s_obj.get("parkedSpotId") != spot_id:
                                        print(f"[AI BINDER] Xe #{v_id_int} duoc phat hien tai o THUC TE {spot_id} -> set PARKED")
                                        set_parked(s_id, spot_id)
                            except (ValueError, TypeError):
                                pass
                    
            # ── Xử lý xe đã đi khỏi bãi (mất track) ──
            lost_tracks = list(set(active_tracks.keys()) - current_track_ids)
            for t_id in lost_tracks:
                session_id = active_tracks[t_id]
                print(f"[CLOSE] Xe #{t_id} da roi khoi bai -> Dong Session {session_id}")
                close_session(session_id)
                del active_tracks[t_id]
                
            time.sleep(0.3)
            
    except KeyboardInterrupt:
        print("Stopped Gate Controller.")

if __name__ == "__main__":
    main()
