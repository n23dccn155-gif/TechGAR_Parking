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

### 2. Backend & Simulator Commands
From the project root directory (`D:\NCKH\TechGAR`):

#### 🟢 Sample Data Mode (Quick Demo / No GPU)
Run in 2-3 separate terminal tabs:
```powershell
# Terminal 1: Run Simulator for smooth car movements
python backend/sample_tracking_simulator.py

# Terminal 2: Run Gate Session Controller & REST API
python backend/gate_session_controller.py --source vehicle_positions_sample.json
```

#### 🔵 Real OpenCV AI Tracking Mode (YOLOv8 + CNN)
```powershell
# Terminal 1: Run OpenCV YOLOv8 + CNN tracking from video feed
python backend/opencv_test_js_2.py

# Terminal 2: Run Gate Session Controller with OpenCV source
python backend/gate_session_controller.py --source vehicle_positions.json
```

#### 🟡 ROI Calibration Tool
```powershell
python backend/ParkingSpacePicker_ve_js.py
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
   * AI/Simulator $\longrightarrow$ `vehicle_positions.json` / `vehicle_positions_sample.json` $\longrightarrow$ `gate_session_controller.py` (Port 8000 REST/WebSocket API) $\longrightarrow$ Frontend Canvas Rendering.

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
