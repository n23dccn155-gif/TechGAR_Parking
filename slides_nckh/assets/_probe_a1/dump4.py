import cv2, os
BASE = r"D:\TechGar2\backend\main_detect\experiment_test\output\droidcam_shared_hiep2"
OUT = r"D:\TechGar2\slides_nckh\assets\_probe_a1"
for vid, tag in [("debug_cam1.mp4","h2d1"),("debug_cam2.mp4","h2d2"),("raw_cam1.mp4","h2r1"),("raw_cam2.mp4","h2r2")]:
    cap = cv2.VideoCapture(os.path.join(BASE, vid))
    n = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    print(vid, n)
    for f in range(1190, 1211, 2):
        cap.set(cv2.CAP_PROP_POS_FRAMES, f)
        ok, img = cap.read()
        if ok:
            cv2.imwrite(os.path.join(OUT, f"{tag}_f{f:04d}.jpg"), img, [cv2.IMWRITE_JPEG_QUALITY, 90])
    cap.release()
print("done")
