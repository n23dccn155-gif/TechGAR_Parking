# CLAUDE.md - TechGAR Smart Parking & Navigation System

Welcome to the **TechGAR** project guide for Claude Code! This document outlines key commands, project architecture, algorithms, and guidelines.

---

## 📌 Project Overview
**TechGAR** is a Smart Parking Management & In-Parking Navigation System featuring real-time AI vehicle tracking (YOLOv8 + CNN), Dijkstra shortest-path navigation, dynamic QR Code Kiosk sessions, Vietnamese voice guidance, and off-route warnings.

* **Tech Stack**:
  * **Frontend**: React (TypeScript), Vite, Zustand, Web Speech API, HTML5 Canvas.
  * **Backend & AI**: Python 3.9+, OpenCV, Ultralytics YOLOv8, TensorFlow/Keras (CNN), FastAPI / HTTP Server.

---

## 🚀 Common Commands & Scripts

### 1. Frontend Commands
Navigate to the `frontend/` directory first (`cd frontend`):
* `npm run dev`: Start Vite development server (default port: `4173` / `5173`).
* `npm run build`: Build production bundle (`tsc && vite build`).
* `npm run lint`: Run ESLint check.

### 2. Backend Commands
Backend Python lives in the venv inside `backend/main_detect` (`.\.venv\Scripts\python.exe`).
Full session-by-session command reference: `backend/main_detect/docs/lenh-chay-theo-session.md`.

#### 🔵 Runtime Mode (two-camera AI tracking → session API)
```powershell
# Terminal 1: two-camera runtime server (port 8001 snapshot API)
cd D:\TechGar2\backend\main_detect
.\.venv\Scripts\python.exe .\runtime_server.py `
  --cam1-url "http://192.168.100.53:4747/video/force/1280x720" `
  --cam2-url "http://192.168.100.198:4747/video/force/1280x720" `
  --slots-cam1 "config\parking_slots_cam1.json" `
  --slots-cam2 "config\parking_slots_cam2.json" `
  --calibration "config\two_camera.shared_cm_01.json" `
  --mask-cam1 "config\roi_mask_cam1.json" `
  --mask-cam2 "config\roi_mask_cam2.json" `
  --api-port 8001 --no-display

# Terminal 2: gate session controller (port 8000 REST API)
cd D:\TechGar2
.\backend\main_detect\.venv\Scripts\python.exe .\backend\gate_session_controller.py `
  --runtime-url "http://127.0.0.1:8001/api/runtime/snapshot" `
  --gate-config "backend\main_detect\config\gate_zones.json" `
  --port 8000
```
To replay a recorded session instead of live cams, swap `--cam*-url` for
`--cam*-video "experiment_test\output\<SESSION>\raw_camN.mp4"` and point every
`config\` path at `config\sessions\<SESSION>\` (see the runbook).

#### 🟢 File Mode (no cameras — deterministic JSON feed)
```powershell
python backend/gate_session_controller.py --source vehicle_positions_sample.json
```
(`--source` names a JSON file in `frontend/public/`.)

#### 🟡 Calibration / ROI Tools (`backend/main_detect/`)
```powershell
.\.venv\Scripts\python.exe .\mask_roi.py --help                 # draw ROI masks per camera
.\.venv\Scripts\python.exe .\tools\ParkingSpacePicker_ve_js.py  # draw parking-slot polygons
.\.venv\Scripts\python.exe .\tools\draw_gate_zones.py --help    # draw ENTRY/EXIT gate lines
.\.venv\Scripts\python.exe .\calibrate_map.py --help            # shared-map calibration
```

---

## 🏗 Key Algorithms & Architecture

1. **Routing & Navigation (`frontend/src/routing/routeEngine.ts`)**:
   * **Dijkstra Algorithm**: Computes shortest path on `laneGraph.ts` (lane coordinates graph).
   * **Inbound Routing**: Guides from entry gate $\rightarrow$ target parking slot.
   * **Exit Routing**: Guides from current parked slot $\rightarrow$ exit gate.
   * **Off-Route Detection**: Triggers warning audio/alert if car deviates $>75\text{px}$ from planned route.

2. **AI Vehicle Detection & Tracking (`backend/` & `backend/main_detect/`)**:
   * **YOLOv8 (`yolov8n.pt`)**: Real-time multi-object vehicle detection and bounding box tracking.
   * **CNN Parking Occupancy (`cnn_parking.h5`)**: Crop-based CNN classifier predicting `Occupied` vs `Empty` for defined ROI parking slots.
   * **Global ID Swapping & Motion Tracking**: Handles dual-camera vehicle handoff and tracking persistence across cameras.

3. **Real-time Data Flow**:
   * `runtime_server.py` (Port 8001 snapshot API) $\longrightarrow$ `gate_session_controller.py` (Port 8000 REST/WebSocket API) $\longrightarrow$ Frontend Canvas Rendering. Legacy `--source` file mode reads `vehicle_positions_sample.json` from `frontend/public/` instead.

---

## 🎨 Code Style & Rules

* **TypeScript/React**:
  * Use functional components with TypeScript interfaces for props/states.
  * Use Zustand (`parkingStore.ts`) for global parking & vehicle state management.
  * Keep canvas rendering pure and performant (requestAnimationFrame loops).
* **Python**:
  * Follow PEP 8 guidelines. Use typing hints where applicable (`Tuple`, `List`, `Dict`, `Optional`).
  * Ensure file handles and OpenCV video feeds are safely released upon exit (`cv2.destroyAllWindows()`).
* **Git Commit Guidelines**:
  * Write clear commit messages in Vietnamese or English (e.g., `feat: thêm giọng nói cảnh báo đi sai đường`, `fix: lỗi swap ID camera 2`).

---

## 🧪 Testing Checklist
When verifying features:
1. **Entry QR Kiosk**: Appears at entry gate when car arrives on `/?session=ALL`.
2. **Personalized View**: Single vehicle view when accessing `/?session=<ID>`.
3. **Voice Guidance**: Triggers Web Speech API Vietnamese spoken instructions.
4. **Off-Route Alert**: Triggers audio & red flash when vehicle strays off route.
5. **Parked State Transition**: Changes slot to Red (`Occupied`) & session status to `PARKED`.

---

## 🖥 Environment Notes
* `python` → Python 3.11 (all backend deps: cv2, ultralytics, ...). Keep backend commands on `python`.
* `python3` → Python 3.13 (added for slide-generation skills; backend deps are NOT installed here).
* Slide/PPTX skills installed globally at `%APPDATA%\devin\skills\`: **ppt-master** (native .pptx generation, can learn a .pptx template) and **presentation-skill** (deck-as-code `outline.json` → .pptx with QA gates, lab/scientific presets). Invoke via `/ppt-master`, `/presentation-skill`, or ask the agent to build slides.
* Machine has NO Microsoft PowerPoint / LibreOffice — `.pptx` files must be viewed on another machine or via an online viewer unless an office suite is installed.
