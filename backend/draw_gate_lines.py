"""
draw_gate_lines.py - Công cụ vẽ kéo thả Vạch Cổng Vào & Cổng Ra bằng Chuột (100% Mouse GUI)

Hướng dẫn sử dụng:
1. Bạn KHÔNG CẦN đụng vào bàn phím!
2. Click chọn nút [🟦 CỔNG VÀO] hoặc [🟧 CỔNG RA] trực tiếp trên hình.
3. Kéo rê chuột (Click & Drag) để vẽ vạch rào chắn.
4. Click nút [💾 LƯU FILE] trên hình để lưu kết quả vào frontend/public/gate_roi.json.
"""

import cv2
import json
import argparse
import sys
from pathlib import Path

try:
    sys.stdout.reconfigure(encoding='utf-8')
except Exception:
    pass

BASE_DIR = Path(__file__).resolve().parent
DEFAULT_OUT = BASE_DIR.parent / "frontend" / "public" / "gate_roi.json"
DEFAULT_VIDEO = BASE_DIR / "carPark.mp4"

# Global state
drawing = False
current_step = "entry"  # "entry" hoặc "exit"
p_start = None
p_end = None
should_close = False

entry_line = None  # {"p1": {"x": int, "y": int}, "p2": {"x": int, "y": int}}
exit_line = None   # {"p1": {"x": int, "y": int}, "p2": {"x": int, "y": int}}

# Tọa độ các nút bấm trên màn hình OpenCV
BTN_ENTRY = (20, 70, 150, 102)   # (x1, y1, x2, y2)
BTN_EXIT  = (160, 70, 290, 102)
BTN_SAVE  = (300, 70, 430, 102)
BTN_RESET = (440, 70, 560, 102)


def is_inside_btn(x, y, btn):
    x1, y1, x2, y2 = btn
    return x1 <= x <= x2 and y1 <= y <= y2


def mouse_callback(event, x, y, flags, param):
    global drawing, p_start, p_end, current_step, entry_line, exit_line, should_close

    if event == cv2.EVENT_LBUTTONDOWN:
        # Kiểm tra xem có click vào nút bấm trên màn hình không
        if is_inside_btn(x, y, BTN_ENTRY):
            current_step = "entry"
            print("👉 Đã bấm nút: Chuyển sang vẽ CỔNG VÀO")
            return
        elif is_inside_btn(x, y, BTN_EXIT):
            current_step = "exit"
            print("👉 Đã bấm nút: Chuyển sang vẽ CỔNG RA")
            return
        elif is_inside_btn(x, y, BTN_SAVE):
            out_path = param.get("out_path")
            if out_path:
                save_gate_roi(out_path)
            should_close = True
            return
        elif is_inside_btn(x, y, BTN_RESET):
            entry_line = None
            exit_line = None
            print("🔄 Đã bấm nút: Reset vẽ lại từ đầu!")
            return

        # Nếu không click vào nút -> Bắt đầu vẽ vạch
        drawing = True
        p_start = (x, y)
        p_end = (x, y)

    elif event == cv2.EVENT_MOUSEMOVE:
        if drawing:
            p_end = (x, y)

    elif event == cv2.EVENT_LBUTTONUP:
        if drawing:
            drawing = False
            p_end = (x, y)
            line_data = {
                "p1": {"x": int(p_start[0]), "y": int(p_start[1])},
                "p2": {"x": int(p_end[0]), "y": int(p_end[1])}
            }
            if current_step == "entry":
                entry_line = line_data
                print(f"✅ Đã vẽ CỔNG VÀO: {p_start} -> {p_end}")
            elif current_step == "exit":
                exit_line = line_data
                print(f"✅ Đã vẽ CỔNG RA: {p_start} -> {p_end}")

    elif event == cv2.EVENT_RBUTTONDOWN:
        current_step = "exit" if current_step == "entry" else "entry"
        mode_name = "CỔNG VÀO (Blue)" if current_step == "entry" else "CỔNG RA (Yellow)"
        print(f"🔄 Đổi chế độ: {mode_name}")


def save_gate_roi(out_path: Path):
    data = {
        "entry_gate": entry_line or {"name": "Cổng Vào", "p1": {"x": 880, "y": 820}, "p2": {"x": 1120, "y": 820}},
        "exit_gate": exit_line or {"name": "Cổng Ra", "p1": {"x": 80, "y": 820}, "p2": {"x": 320, "y": 820}}
    }
    data["entry_gate"]["name"] = "Cổng Vào"
    data["exit_gate"]["name"] = "Cổng Ra"

    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    print(f"🎉 ĐÃ LƯU THÀNH CÔNG VẠCH CỔNG VÀO/RA VÀO: {out_path.resolve()}")


def main():
    global current_step, entry_line, exit_line, p_start, p_end, should_close

    parser = argparse.ArgumentParser(description="Công cụ vẽ kéo thả Vạch Cổng Vào / Cổng Ra")
    parser.add_argument("--source", type=str, default=None, help="Video / Ảnh / ID Camera")
    parser.add_argument("--out", type=str, default=str(DEFAULT_OUT), help="File JSON đầu ra")
    args = parser.parse_args()

    source_path = args.source

    if not source_path:
        print("=" * 60)
        print(" CHỌN NGUỒN ĐẦU VÀO VẼ VẠCH CỔNG:")
        print("  1 - Video (Default: carPark.mp4)")
        print("  2 - Ảnh tĩnh (Default: parkingimg.jpg)")
        print("  3 - Camera trực tiếp (Webcam / IP Cam / RTSP)")
        print("=" * 60)
        choice = input("Nhập lựa chọn (1/2/3, Enter=1): ").strip()

        if choice == '2':
            img_path = input("Nhập đường dẫn ảnh (Enter = backend/parkingimg.jpg): ").strip()
            source_path = img_path if img_path else str(BASE_DIR / "parkingimg.jpg")
        elif choice == '3':
            print("  3.1 - Webcam máy tính (Nhập ID, Enter = 0)")
            print("  3.2 - Camera IP / DroidCam / RTSP Stream")
            sub_choice = input("Nhập (1/2, Enter=1): ").strip()
            if sub_choice == '2':
                source_path = input("Dán link RTSP / IP Camera: ").strip()
            else:
                cam_id = input("Nhập ID Camera (Enter = 0): ").strip()
                source_path = cam_id if cam_id else "0"
        else:
            vid_path = input("Nhập đường dẫn video (Enter = backend/carPark.mp4): ").strip()
            source_path = vid_path if vid_path else str(DEFAULT_VIDEO)

    # Load khung hình mẫu từ Video, Ảnh hoặc Camera
    if source_path.endswith((".jpg", ".png", ".jpeg", ".bmp", ".webp")):
        frame = cv2.imread(source_path)
    else:
        source_target = int(source_path) if source_path.isdigit() else source_path
        cap = cv2.VideoCapture(source_target)
        if not cap.isOpened():
            print(f"❌ Không mở được nguồn video/camera: {source_path}")
            return
        ret, frame = cap.read()
        cap.release()

    if frame is None:
        print(f"❌ Không đọc được khung hình từ nguồn: {source_path}")
        return

    # Chuẩn hóa kích thước 1200x900 theo map SVG
    frame = cv2.resize(frame, (1200, 900))
    out_path = Path(args.out)

    window_name = "Ve Vach Cong Vao & Cong Ra (TechGAR)"
    cv2.namedWindow(window_name, cv2.WINDOW_AUTOSIZE)
    cv2.setMouseCallback(window_name, mouse_callback, param={"out_path": out_path})

    while True:
        display = frame.copy()

        # Overlay Hộp Bảng điều khiển màu tối ở trên cùng
        cv2.rectangle(display, (10, 10), (580, 115), (15, 23, 42), -1)
        cv2.rectangle(display, (10, 10), (580, 115), (71, 85, 105), 1)

        mode_text = f"Trang thai: Dang ve {'CONG VAO (BLUE)' if current_step == 'entry' else 'CONG RA (YELLOW)'}"
        cv2.putText(display, mode_text, (20, 35), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 255), 2)
        cv2.putText(display, "Ban co the Click chuot truc tiep vao cac NUt BAM ben duoi:", 
                    (20, 55), cv2.FONT_HERSHEY_SIMPLEX, 0.42, (148, 163, 184), 1)

        # ── VẼ CÁC NÚT BẤM BẰNG CHUỘT ──
        # Nút 1: CỔNG VÀO
        is_sel = (current_step == "entry")
        cv2.rectangle(display, (BTN_ENTRY[0], BTN_ENTRY[1]), (BTN_ENTRY[2], BTN_ENTRY[3]),
                      (255, 191, 0) if is_sel else (51, 65, 85), -1)
        cv2.rectangle(display, (BTN_ENTRY[0], BTN_ENTRY[1]), (BTN_ENTRY[2], BTN_ENTRY[3]), (255, 255, 255), 1)
        cv2.putText(display, "CONG VAO", (BTN_ENTRY[0] + 18, BTN_ENTRY[1] + 22),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.45, (255, 255, 255) if is_sel else (203, 213, 225), 2)

        # Nút 2: CỔNG RA
        is_sel_exit = (current_step == "exit")
        cv2.rectangle(display, (BTN_EXIT[0], BTN_EXIT[1]), (BTN_EXIT[2], BTN_EXIT[3]),
                      (0, 215, 255) if is_sel_exit else (51, 65, 85), -1)
        cv2.rectangle(display, (BTN_EXIT[0], BTN_EXIT[1]), (BTN_EXIT[2], BTN_EXIT[3]), (255, 255, 255), 1)
        cv2.putText(display, "CONG RA", (BTN_EXIT[0] + 24, BTN_EXIT[1] + 22),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.45, (0, 0, 0) if is_sel_exit else (203, 213, 225), 2)

        # Nút 3: LƯU FILE
        cv2.rectangle(display, (BTN_SAVE[0], BTN_SAVE[1]), (BTN_SAVE[2], BTN_SAVE[3]), (22, 163, 74), -1)
        cv2.rectangle(display, (BTN_SAVE[0], BTN_SAVE[1]), (BTN_SAVE[2], BTN_SAVE[3]), (255, 255, 255), 1)
        cv2.putText(display, "LUU FILE", (BTN_SAVE[0] + 24, BTN_SAVE[1] + 22),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.45, (255, 255, 255), 2)

        # Nút 4: RESET
        cv2.rectangle(display, (BTN_RESET[0], BTN_RESET[1]), (BTN_RESET[2], BTN_RESET[3]), (220, 38, 38), -1)
        cv2.rectangle(display, (BTN_RESET[0], BTN_RESET[1]), (BTN_RESET[2], BTN_RESET[3]), (255, 255, 255), 1)
        cv2.putText(display, "RESET", (BTN_RESET[0] + 24, BTN_RESET[1] + 22),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.45, (255, 255, 255), 2)

        # Vẽ vạch Cổng Vào
        if entry_line:
            p1 = (entry_line["p1"]["x"], entry_line["p1"]["y"])
            p2 = (entry_line["p2"]["x"], entry_line["p2"]["y"])
            cv2.line(display, p1, p2, (255, 191, 0), 4) # Blue/Cyan
            cv2.putText(display, "CONG VAO", (p1[0], p1[1] - 10), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 191, 0), 2)

        # Vẽ vạch Cổng Ra
        if exit_line:
            p1 = (exit_line["p1"]["x"], exit_line["p1"]["y"])
            p2 = (exit_line["p2"]["x"], exit_line["p2"]["y"])
            cv2.line(display, p1, p2, (0, 215, 255), 4) # Yellow/Gold
            cv2.putText(display, "CONG RA", (p1[0], p1[1] - 10), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 215, 255), 2)

        # Vẽ vạch đang kéo thả hiện tại
        if drawing and p_start and p_end:
            color = (255, 191, 0) if current_step == "entry" else (0, 215, 255)
            cv2.line(display, p_start, p_end, color, 2)

        cv2.imshow(window_name, display)

        if should_close:
            print("🛑 Đã lưu thành công! Đang tự động đóng cửa sổ...")
            cv2.waitKey(500)
            break

        key = cv2.waitKey(30) & 0xFF
        if key in (ord('1'), 49):
            current_step = "entry"
        elif key in (ord('2'), 50):
            current_step = "exit"
        elif key in (ord('s'), ord('S')):
            save_gate_roi(out_path)
            should_close = True
        elif key in (ord('r'), ord('R')):
            entry_line = None
            exit_line = None
        elif key in (ord('q'), ord('Q'), 27):
            break

    cv2.destroyAllWindows()


if __name__ == "__main__":
    main()
