import cv2, os
SA = r"D:\TechGar2\backend\main_detect\docs\slides_tracking\slides_assets"
OUT = r"D:\TechGar2\slides_nckh\assets\_probe_a1"
for vid, tag, rng in [("session_cam1_live.mp4","c1",range(380,481,4)),
                      ("session_cam2_live.mp4","c2",range(336,481,6))]:
    cap = cv2.VideoCapture(os.path.join(SA, vid))
    for f in rng:
        cap.set(cv2.CAP_PROP_POS_FRAMES, f)
        ok, img = cap.read()
        if ok:
            cv2.imwrite(os.path.join(OUT, f"{tag}_f{f:04d}.jpg"), img, [cv2.IMWRITE_JPEG_QUALITY, 90])
    cap.release()
print("done")
