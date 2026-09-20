import cv2, os
SA = r"D:\TechGar2\backend\main_detect\docs\slides_tracking\slides_assets"
OUT = r"D:\TechGar2\slides_nckh\assets\_probe_a1"

def dump(video, frames, tag):
    cap = cv2.VideoCapture(os.path.join(SA, video))
    n = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    print(video, "total", n)
    for f in frames:
        cap.set(cv2.CAP_PROP_POS_FRAMES, f)
        ok, img = cap.read()
        if ok:
            cv2.imwrite(os.path.join(OUT, f"{tag}_f{f:04d}.jpg"), img, [cv2.IMWRITE_JPEG_QUALITY, 92])
        else:
            print("FAIL", video, f)
    cap.release()

# scan 280-330 every 5 for cam1 (occlusion hunt) + cam2 same indices
fr = list(range(280, 331, 5))
dump("session_cam1_live.mp4", fr, "c1")
dump("session_cam2_live.mp4", fr, "c2")
