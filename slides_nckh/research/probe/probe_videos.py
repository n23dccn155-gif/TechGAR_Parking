"""Probe video metadata (fps / frames / duration / resolution) for asset-scout."""
import cv2
import os
import json
import sys

ASSETS = r"D:\TechGar2\backend\main_detect\docs\slides_tracking\slides_assets"
OUT = r"D:\TechGar2\backend\main_detect\experiment_test\output"
QUAR = r"D:\TechGar2\_quarantine_20260919\backend\main_detect\experiment_test\output"

videos = [
    (ASSETS, "demo_overlap_split.mp4"),
    (ASSETS, "demo_tracking_cam1.mp4"),
    (ASSETS, "demo_tracking_cam2.mp4"),
    (ASSETS, "session_cam1_live.mp4"),
    (ASSETS, "session_cam2_live.mp4"),
    (OUT + r"\session_full", "raw_cam1.mp4"),
    (OUT + r"\session_full", "debug_cam1.mp4"),
    (OUT + r"\session_full", "raw_cam2.mp4"),
    (OUT + r"\session_full", "debug_cam2.mp4"),
    (OUT + r"\droidcam_shared_hiep2", "raw_cam1.mp4"),
    (OUT + r"\droidcam_shared_hiep2", "debug_cam1.mp4"),
    (OUT + r"\droidcam_shared_hiep2", "raw_cam2.mp4"),
    (OUT + r"\droidcam_shared_hiep2", "debug_cam2.mp4"),
    (OUT + r"\droidcam_shared_hiep7", "raw_cam1.mp4"),
    (OUT + r"\droidcam_shared_hiep7", "debug_cam1.mp4"),
    (OUT + r"\droidcam_shared_hiep8", "raw_cam1.mp4"),
    (OUT + r"\droidcam_shared_vd_16", "raw_cam1.mp4"),
    (OUT + r"\droidcam_shared_vd_16", "debug_cam1.mp4"),
    (OUT + r"\droidcam_shared_vd_16", "raw_cam2.mp4"),
    (OUT + r"\droidcam_shared_vd_16", "debug_cam2.mp4"),
    (OUT + r"\droidcam_shared_vd_18", "raw_cam1.mp4"),
    (OUT + r"\droidcam_shared_vd_18", "debug_cam1.mp4"),
    (OUT + r"\droidcam_shared_toi1", "raw_cam1.mp4"),
    (OUT + r"\droidcam_shared_toi1", "debug_cam1.mp4"),
    (OUT + r"\droidcam_shared_toi1", "raw_cam2.mp4"),
    (OUT + r"\droidcam_shared_toi1", "debug_cam2.mp4"),
    (OUT + r"\droidcam_shared_bt", "raw_cam1.mp4"),
    (OUT + r"\droidcam_shared_bt", "debug_cam1.mp4"),
    (OUT + r"\droidcam_shared_bt", "raw_cam2.mp4"),
    (OUT + r"\droidcam_shared_bt", "debug_cam2.mp4"),
    (OUT + r"\droidcam_live14", "raw_cam1.mp4"),
    (OUT + r"\droidcam_live14", "debug_cam1.mp4"),
    (OUT + r"\droidcam_shared_live15", "raw_cam1.mp4"),
    (OUT + r"\droidcam_shared_live15", "debug_cam1.mp4"),
    (OUT + r"\droidcam_shared_live15", "raw_cam2.mp4"),
    (OUT + r"\droidcam_shared_live15", "debug_cam2.mp4"),
    (QUAR + r"\droidcam_shared_thai_s1", "raw_cam1.mp4"),
    (QUAR + r"\droidcam_shared_thai_s2", "raw_cam1.mp4"),
    (QUAR + r"\droidcam_shared_thai_s3", "raw_cam1.mp4"),
    (QUAR + r"\droidcam_shared_sang", "raw_cam1.mp4"),
    (QUAR + r"\droidcam_shared_toi", "raw_cam1.mp4"),
    (QUAR + r"\droidcam_shared_toi2", "raw_cam1.mp4"),
]

results = []
for d, name in videos:
    p = os.path.join(d, name)
    if not os.path.exists(p):
        results.append({"path": p, "exists": False})
        continue
    cap = cv2.VideoCapture(p)
    if not cap.isOpened():
        results.append({"path": p, "exists": True, "open": False})
        continue
    fps = cap.get(cv2.CAP_PROP_FPS)
    n = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    cap.release()
    results.append({
        "path": p,
        "exists": True,
        "open": True,
        "fps": round(fps, 2),
        "frames": n,
        "duration_s": round(n / fps, 2) if fps else None,
        "res": f"{w}x{h}",
        "size_mb": round(os.path.getsize(p) / 1e6, 1),
    })

for r in results:
    print(json.dumps(r, ensure_ascii=False))
