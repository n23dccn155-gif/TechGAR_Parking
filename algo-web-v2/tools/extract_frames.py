"""tools/extract_frames.py — trích 1 frame từ video session ra file PNG tạm.

Dùng:
  python tools/extract_frames.py --session <dir|tên> --cam 1|2 \
      --frame N --source raw|debug --out <path.png>

--session nhận đường dẫn thư mục session HOẶC tên thư mục dưới
  backend/main_detect/experiment_test/output/ (ví dụ: session_hiep_sang8).
Video kỳ vọng: <session>/<source>_cam<N>.mp4.

Trả về mã 0 + in path ảnh; mã 2 nếu frame/video không tồn tại.
"""
import argparse
import sys
from pathlib import Path

import cv2

REPO = Path(__file__).resolve().parent.parent          # algo-web-v2
WORKSPACE = REPO.parent                                # D:\TechGar2
OUTPUT_ROOT = WORKSPACE / "backend" / "main_detect" / "experiment_test" / "output"


def resolve_session(session: str) -> Path:
    p = Path(session)
    if p.is_dir():
        return p.resolve()
    cand = OUTPUT_ROOT / session
    if cand.is_dir():
        return cand.resolve()
    raise SystemExit(f"session không tồn tại: {session} (thử path trực tiếp hoặc tên dưới {OUTPUT_ROOT})")


def video_path(session_dir: Path, cam: int, source: str) -> Path:
    vp = session_dir / f"{source}_cam{cam}.mp4"
    if not vp.exists():
        raise SystemExit(f"thiếu video: {vp}")
    return vp


def extract(session_dir: Path, cam: int, frame: int, source: str, out_path: Path) -> Path:
    """Mở video, nhảy tới frame, ghi PNG. Trả path ảnh; SystemExit nếu lỗi."""
    vp = video_path(session_dir, cam, source)
    cap = cv2.VideoCapture(str(vp))
    if not cap.isOpened():
        raise SystemExit(f"không mở được video: {vp}")
    try:
        total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        if frame < 0 or frame >= total:
            raise SystemExit(f"frame {frame} ngoài dải [0,{total - 1}] của {vp.name}")
        cap.set(cv2.CAP_PROP_POS_FRAMES, frame)
        ok, img = cap.read()
        if not ok or img is None:
            raise SystemExit(f"đọc frame {frame} thất bại trong {vp.name}")
        # CAP_PROP_POS_FRAMES có thể lệch vài frame trên một số codec —
        # xác nhận bằng vị trí đọc thực tế, nếu lệch thì đọc tuần tự bù.
        got = int(cap.get(cv2.CAP_PROP_POS_FRAMES)) - 1
        if got != frame:
            cap.set(cv2.CAP_PROP_POS_FRAMES, frame)
            ok, img = cap.read()
            if not ok:
                raise SystemExit(f"đọc lại frame {frame} thất bại trong {vp.name}")
    finally:
        cap.release()
    out_path.parent.mkdir(parents=True, exist_ok=True)
    cv2.imwrite(str(out_path), img)
    return out_path


def main(argv=None):
    ap = argparse.ArgumentParser(description="Trích frame từ video session")
    ap.add_argument("--session", required=True, help="thư mục session hoặc tên dưới output/")
    ap.add_argument("--cam", type=int, required=True, choices=(1, 2))
    ap.add_argument("--frame", type=int, required=True)
    ap.add_argument("--source", default="raw", choices=("raw", "debug"))
    ap.add_argument("--out", required=True, help="file PNG đích")
    a = ap.parse_args(argv)
    sd = resolve_session(a.session)
    out = extract(sd, a.cam, a.frame, a.source, Path(a.out))
    print(out)
    return 0


if __name__ == "__main__":
    sys.exit(main())
