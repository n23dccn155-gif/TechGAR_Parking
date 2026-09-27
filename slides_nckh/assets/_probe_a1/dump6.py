import cv2, os
SA = r"D:\TechGar2\backend\main_detect\docs\slides_tracking\slides_assets"
OUT = r"D:\TechGar2\slides_nckh\assets\_probe_a1\wide"
os.makedirs(OUT, exist_ok=True)
cap = cv2.VideoCapture(os.path.join(SA, "session_cam1_live.mp4"))
# make a contact sheet: 6 thumbs per sheet, frames 900-1600 step 15
frames = list(range(900, 1604, 15))
thumbs = []
for f in frames:
    cap.set(cv2.CAP_PROP_POS_FRAMES, f)
    ok, img = cap.read()
    if ok:
        t = cv2.resize(img, (320, 180))
        cv2.putText(t, str(f), (8, 30), cv2.FONT_HERSHEY_SIMPLEX, 1.0, (0,0,255), 2)
        thumbs.append(t)
cap.release()
import numpy as np
for i in range(0, len(thumbs), 12):
    batch = thumbs[i:i+12]
    while len(batch) < 12:
        batch.append(np.zeros((180,320,3), np.uint8))
    rows = [np.hstack(batch[j:j+4]) for j in range(0,12,4)]
    sheet = np.vstack(rows)
    cv2.imwrite(os.path.join(OUT, f"sheet_{i:02d}.jpg"), sheet, [cv2.IMWRITE_JPEG_QUALITY, 88])
print("sheets:", (len(thumbs)+11)//12)
