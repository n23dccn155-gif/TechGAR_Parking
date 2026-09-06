# TechGar2 - Tổng quan hệ thống

**Ngày cập nhật:** 2026-09-05  
**Phiên bản:** TechGAR với Camera AI + Global ID + Navigation  
**Branch:** Hiep3_9

---

## 1. Kiến trúc tổng thể

```
┌─────────────────────────────────────────────────────────────────────┐
│                         FRONTEND (React)                            │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐    │
│  │   Monitor    │  │   Customer    │  │   ParkingMap       │    │
│  │   (Admin)   │  │   (User)     │  │   + VehicleMarker   │    │
│  └──────┬───────┘  └──────┬───────┘  └──────────┬───────────┘    │
│         │                 │                      │                 │
│         └────────────┬────┴──────────────────────┘                 │
│                      │                                              │
│              ┌───────▼───────┐                                    │
│              │  Runtime API  │ ←──────── Port 8001 (MJPEG + JSON) │
│              └───────┬───────┘                                    │
└──────────────────────┼────────────────────────────────────────────┘
                       │
┌──────────────────────▼────────────────────────────────────────────┐
│                         BACKEND (Python)                           │
│                                                                      │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │  DroidCam 1 │  │  DroidCam 2 │  │   Two-Camera Runtime    │  │
│  │  (HTTP)     │  │  (HTTP)     │  │   ┌─────────────────┐  │  │
│  └──────┬──────┘  └──────┬──────┘  │  │ MotionTracker   │  │  │
│         │                 │          │  │ CrossCameraMan  │  │  │
│         └────────┬────────┘          │  │ SlotVehicleBin │  │  │
│                  │                    │  │ ParkingDetector│  │  │
│                  │                    │  └─────────────────┘  │  │
│                  │                    └───────────┬─────────────┘  │
│                  │                                │                │
│         ┌────────▼────────┐              ┌──────▼──────┐        │
│         │ LatestFrameCapture│              │ Slot Layout │        │
│         │ (Sync 2 cams)    │              │ (60 slots)  │        │
│         └──────────────────┘              └─────────────┘        │
│                                                                      │
│  ┌─────────────────────┐    ┌────────────────────────────────────┐ │
│  │ Gate Session API    │    │     Runtime Contract               │ │
│  │ (Port 8000)        │    │     (vehicles[], slots[], ...)     │ │
│  └─────────────────────┘    └────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────┘
```

---

## 2. Luồng dữ liệu

### 2.1. Camera → Tracking → Slot Binding

```
Camera Frame
    │
    ▼
┌─────────────────┐
│ Motion Detection │ ← Background subtraction (cv2.absdiff)
│ (motion_tracker) │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Local Track ID   │ ← HSV Histogram Re-ID per camera
│ (cam1, cam2)    │
└────────┬────────┘
         │
         ▼
┌─────────────────────────┐
│ CrossCameraManager      │ ← Global ID assignment + Re-ID
│ (global_id namespace)   │
└────────┬────────────────┘
         │
         ▼
┌─────────────────────────┐
│ SlotVehicleBinder       │ ← Bind vehicle → parking slot
│ (sticky ID, anti-theft)│
└────────┬────────────────┘
         │
         ▼
┌─────────────────────────┐
│ Runtime Snapshot API     │ ← /api/runtime/snapshot
│ (Port 8001)            │
└─────────────────────────┘
```

### 2.2. Session Flow (Customer)

```
1. Scan QR at Entry Gate
   │
   ▼
2. Backend: Create Session
   - sessionId
   - globalVehicleId (from runtime)
   - state: SELECTING_SPOT
   │
   ▼
3. Frontend: Select Parking Slot (D01-D60)
   │
   ▼
4. Backend: NAVIGATING_TO_SPOT
   - Route calculation (Dijkstra)
   - Voice guidance
   │
   ▼
5. Vehicle parks in slot
   │
   ▼
6. Backend: PARKED
   - parkedSlotId = actual slot
   │
   ▼
7. User: Press "Lấy xe ra"
   │
   ▼
8. Backend: EXIT_NAVIGATION
   - Route to Exit Gate
   │
   ▼
9. Vehicle exits
   │
   ▼
10. Backend: Delete Session
```

---

## 3. Backend Structure (`backend/`)

### 3.1. Directory Layout

```
backend/
├── main_detect/                    # AI Detection Core (PRIMARY)
│   ├── src/techgar/               # TechGAR Algorithm Package
│   │   ├── cross_camera_manager.py    # Global ID + Re-ID
│   │   ├── motion_tracker.py         # Motion detection + Kalman
│   │   ├── slot_vehicle_binder.py    # Slot binding + sticky ID
│   │   ├── parking_detector.py       # Vision-based slot state
│   │   ├── tracklet_descriptor.py    # HSV/LAB appearance
│   │   ├── trajectory_memory.py       # World trajectory
│   │   ├── deep_reid_model.py        # Deep Re-ID (optional)
│   │   └── latest_frame_capture.py   # MJPEG stream sync
│   │
│   ├── config/                    # Configuration Files (NEW)
│   │   ├── parking_slots_cam1.json   # 30 slots for camera 1
│   │   ├── parking_slots_cam2.json   # 30 slots for camera 2
│   │   ├── roi_mask_cam1.json       # Tracking ROI mask
│   │   ├── roi_mask_cam2.json       # Tracking ROI mask
│   │   ├── gate_zones.json          # Entry/Exit gate zones
│   │   ├── two_camera.shared_cm_01.json  # Calibration (5 configs)
│   │   ├── two_camera.shared_cm_02.json
│   │   ├── two_camera.shared_cm_03.json
│   │   ├── two_camera.shared_cm_04.json
│   │   ├── two_camera.shared_cm_05.json
│   │   └── shared_map_01/           # Shared map calibration data
│   │       ├── calibration_points.csv
│   │       ├── capture_cam1.png
│   │       ├── capture_cam2.png
│   │       ├── marked_cam1.png
│   │       └── shared_map_active_roi.png
│   │
│   ├── experiment_test/            # Test & Diagnostic
│   │   ├── raw_cam1.mp4            # Test videos
│   │   ├── raw_cam2.mp4
│   │   ├── diagnose_identity_churn.py  # Diagnostic tool
│   │   ├── validate_session.py
│   │   └── evaluate.py
│   │
│   ├── two_camera.py              # Main 2-camera pipeline
│   ├── runtime_server.py          # HTTP API Server (Port 8001)
│   └── .venv/                     # Python Virtual Environment
│
├── gate_session_controller.py      # Gate API (Port 8000) - LEGACY
├── session_manager.py              # Session management - LEGACY
├── sample_tracking_simulator.py   # Demo simulator - LEGACY
└── opencv_test_js_2.py           # YOLO detector - LEGACY
```

### 3.2. Core Algorithm Files (`src/techgar/`)

| File | Mô tả | Key Classes/Functions |
|------|--------|---------------------|
| `cross_camera_manager.py` | Global ID management, Re-ID, handoff | `CrossCameraManager`, `_candidate_cost()`, `_match_pending_handoffs()` |
| `motion_tracker.py` | Motion detection, Kalman filter, split detection | `MotionVehicleTracker`, `_assign()`, `split_assignment_margin` |
| `slot_vehicle_binder.py` | Slot binding, sticky ID, anti-cướp | `SlotVehicleBinder`, `_bind_vehicle()`, `_release_vehicle()` |
| `parking_detector.py` | Vision-based slot state (empty/occupied) | `ParkingDetector`, CLAHE, edge detection |
| `tracklet_descriptor.py` | HSV/LAB histogram appearance | `compare_tracklets()`, `aggregate_appearance()` |
| `trajectory_memory.py` | World coordinate memory | `WorldTrajectoryMemory` |

---

## 4. Frontend Structure (`frontend/`)

### 4.1. Directory Layout

```
frontend/
├── src/
│   ├── app/
│   │   ├── App.tsx                 # Main controller
│   │   ├── App_Hiep4.tsx          # Legacy
│   │   └── worldToSvg.ts          # Coordinate transform
│   │
│   ├── domain/
│   │   ├── session.ts             # Session types
│   │   ├── parking.ts             # Spot classification
│   │   ├── sessionParking.ts      # NEW: Parking resolution
│   │   └── laneGraph.ts           # Routing graph
│   │
│   ├── adapters/
│   │   └── runtimeAdapter.ts      # Runtime API client
│   │
│   ├── api/
│   │   ├── backendApi.ts         # Session API (Port 8000)
│   │   └── runtimeApi.ts          # Runtime API (Port 8001)
│   │
│   ├── stores/
│   │   ├── driverFlowStore.ts    # Navigation state
│   │   └── parkingStore.ts       # Spot state
│   │
│   ├── components/
│   │   ├── ParkingMap.tsx        # SVG map
│   │   ├── VehicleMarker.tsx     # Vehicle icon
│   │   ├── InvalidSpotWarningSheet.tsx  # Alert modal
│   │   └── EntryQRKiosk.tsx      # QR display
│   │
│   └── hooks/
│       └── useVehicleSession.ts   # NEW: Session sync hook
│
└── public/
    └── vehicle_positions.json     # From OpenCV (legacy)
```

---

## 5. Configuration Files (Đã thay đổi gần đây)

### 5.1. Parking Slots

**`config/parking_slots_cam1.json`** - 30 slots cho camera 1
**`config/parking_slots_cam2.json`** - 30 slots cho camera 2

Format:
```json
{
  "slots": [
    {
      "id": "A01",
      "camera": "cam1",
      "polygon": [[x1,y1], [x2,y2], [x3,y3], [x4,y4]],
      "center": {"x": 100, "y": 200}
    },
    ...
  ]
}
```

### 5.2. ROI Masks

**`config/roi_mask_cam1.json`** và **`config/roi_mask_cam2.json`**

```json
{
  "type": "polygon",
  "points": [[x1,y1], [x2,y2], ...],
  "handoff_edge": "right"
}
```

### 5.3. Calibration Files

**`config/two_camera.shared_cm_01.json`** (và 02-05)

```json
{
  "cameras": {
    "cam1": {
      "homography": [[h11,h12,h13], ...],
      "crop": [x, y, w, h]
    },
    "cam2": { ... }
  },
  "overlap_region": [[x1,y1], ...],
  "matching_defaults": { ... }
}
```

### 5.4. Gate Zones

**`config/gate_zones.json`**

```json
{
  "entry_gate": {
    "p1": {"x": 100, "y": 500},
    "p2": {"x": 200, "y": 500},
    "direction": "positive"
  },
  "exit_gate": { ... }
}
```

### 5.5. Shared Map Calibration

**`config/shared_map_01/`**
- `calibration_points.csv` - Ground control points
- `capture_cam1.png` - Raw capture from cam1
- `capture_cam2.png` - Raw capture from cam2
- `marked_cam1.png` - Debug overlay
- `shared_map_active_roi.png` - Combined view

---

## 6. Runtime API (Port 8001)

### 6.1. Endpoints

| Endpoint | Method | Mô tả |
|----------|--------|--------|
| `/api/runtime/status` | GET | Server status |
| `/api/runtime/snapshot` | GET | Full runtime state |
| `/api/runtime/events` | GET | Event log |
| `/api/runtime/gates` | GET | Gate states |
| `/api/runtime/cameras/cam1.mjpg` | GET | MJPEG stream cam1 |
| `/api/runtime/cameras/cam2.mjpg` | GET | MJPEG stream cam2 |

### 6.2. Snapshot Schema (v3)

```json
{
  "runtime_id": "uuid",
  "frame_index": 1234,
  "slot_layout": {
    "cam1": { "slots": [...] },
    "cam2": { "slots": [...] }
  },
  "vehicles": [
    {
      "global_id": 1,
      "camera_id": "cam1",
      "local_track_id": 5,
      "position": {"x": 100, "y": 200},
      "bbox": {"x": 50, "y": 100, "w": 80, "h": 60},
      "parked_slot_id": "A01",
      "tracking_state": "parked",
      "stopped_for_ms": 5000
    }
  ],
  "parking_slots": [
    {
      "id": "A01",
      "camera_id": "cam1",
      "status": "occupied",
      "vehicle_id": 1,
      "vision_occupied": true,
      "tracking_occupied": true
    }
  ]
}
```

---

## 7. Session Flow (Backend API)

### 7.1. State Machine

```
WAITING_FOR_SCAN
    │
    ▼ [QR scan]
SELECTING_SPOT
    │
    ▼ [select spot]
NAVIGATING_TO_SPOT
    │
    ▼ [park in any slot]
PARKED
    │
    ▼ [press "Lấy xe ra"]
EXIT_NAVIGATION
    │
    ▼ [exit gate]
(Session deleted)
```

### 7.2. Session Data

```json
{
  "sessionId": "abc123",
  "globalVehicleId": 42,
  "state": "NAVIGATING_TO_SPOT",
  "targetSpotId": "D06",
  "parkedSpotId": null,
  "revision": 5,
  "createdAt": "2026-09-05T10:00:00Z"
}
```

---

## 8. Key Algorithm Parameters

### 8.1. GID Management

| Parameter | Value | Description |
|-----------|-------|-------------|
| `identity_retention_seconds` | 60s | How long to keep GID after last seen |
| `handoff_ttl` | 45 frames | Handoff prediction window |
| `prediction_radius` | 24.93 cm | Handoff spatial tolerance |
| `appearance_threshold` | 0.45 | HSV distance threshold |
| `merge_probation_frames` | 5 | New GID must survive before merge |

### 8.2. Slot Binding

| Parameter | Value | Description |
|-----------|-------|-------------|
| `stationary_threshold_ms` | 1000ms | Min dwell time to confirm parked |
| `stopped_for_ms` | 8+ samples | Stationary detection |
| `vision_primary` | true | Vision owns slot color |
| Sticky ID | enabled | Vision-occupied slots keep ID |

### 8.3. Motion Detection

| Parameter | Value | Description |
|-----------|-------|-------------|
| `motion_threshold` | 20 | Background diff threshold |
| `motion_min_area` | 650 px | Min blob size |
| `split_assignment_margin` | 1.5x | Split detection sensitivity |
| `lineage_score` | 0-1 | Track reliability |

---

## 9. Known Issues & Status

### ✅ Đã hoạt động
- 2-camera sync với DroidCam HTTP
- Global ID tracking + cross-camera handoff
- Slot binding với sticky ID
- Runtime API với MJPEG streams
- Session management (basic)

### ⚠️ Cần fix
1. **GID mất khi 2 xe đỗ gần nhau** - Re-ID nhầm
2. **GID mất khi xe đang tìm ô** - identity retention quá ngắn
3. **Low-light histogram** - CLAHE chưa đủ cho ánh sáng yếu

---

## 10. Commands

### 10.1. Setup
```powershell
cd D:\TechGar2\backend\main_detect
python -m venv .venv
.venv\Scripts\python.exe -m pip install -r requirements.txt
```

### 10.2. Live Run
```powershell
cd D:\TechGar2\backend\main_detect
.venv\Scripts\python.exe runtime_server.py `
  --cam1-url "http://192.168.100.53:4747/video/force/1280x720" `
  --cam2-url "http://192.168.100.198:4747/video/force/1280x720" `
  --slots-cam1 "config/parking_slots_cam1.json" `
  --slots-cam2 "config/parking_slots_cam2.json" `
  --calibration "config/two_camera.shared_cm_01.json" `
  --mask-cam1 "config/roi_mask_cam1.json" `
  --mask-cam2 "config/roi_mask_cam2.json" `
  --session-dir "experiment_test/output/droidcam_live" `
  --output-dir "experiment_test/output/runtime_live" `
  --api-port 8001
```

### 10.3. Diagnostic
```powershell
.venv\Scripts\python.exe experiment_test/diagnose_identity_churn.py experiment_test/output/session_full
```

---

## 11. File Change History (Gần đây)

### Files thêm mới
- `config/shared_map_01/` - Shared map calibration
- `config/roi_mask_cam1.json` - ROI masks
- `config/roi_mask_cam2.json`
- `config/gate_zones.json`
- `src/domain/sessionParking.ts` - NEW: Parking resolver
- `src/hooks/useVehicleSession.ts` - NEW: Session sync

### Files sửa gần đây
- `src/techgar/cross_camera_manager.py` - Collision risk guard, provisional identity
- `src/techgar/slot_vehicle_binder.py` - Sticky ID, anti-cướp
- `src/techgar/motion_tracker.py` - Split detection, lineage scoring
- `frontend/src/app/App.tsx` - GID tracking, parking resolution
