import cv2, os
SA = r"D:\TechGar2\backend\main_detect\docs\slides_tracking\slides_assets"
OUT = r"D:\TechGar2\slides_nckh\assets\_probe_a1"
cap = cv2.VideoCapture(os.path.join(SA, "session_cam1_live.mp4"))
for f in range(332, 431, 4):
    cap.set(cv2.CAP_PROP_POS_FRAMES, f)
    ok, img = cap.read()
    if ok:
        cv2.imwrite(os.path.join(OUT, f"c1_f{f:04d}.jpg"), img, [cv2.IMWRITE_JPEG_QUALITY, 90])
cap.release()
print("done")
