"""tools/annotate.py — vẽ chú thích lên frame thật, ghi JPEG + manifest.

Dùng:
  python tools/annotate.py tools/figures/<fig>.json

Spec JSON:
  {
    "id": "homography-cam1-f120",     # bắt buộc — tên file <id>.jpg
    "session": "session_hiep_sang8",  # tên thư mục dưới experiment_test/output/
                                     #   hoặc path trực tiếp
    "cam": 1, "frame": 120,
    "source": "raw",                  # raw|debug → <source>_cam<N>.mp4
    "image_path": "…",                # TUỲ CHỌN: ảnh có sẵn (bỏ qua video)
    "draw": [
      {"type":"circle","xy":[x,y],"r":10,"color":"#0b57d0","label":"P1"},
      {"type":"arrow","from":[x,y],"to":[x,y],"color":"#…","label":"…"},
      {"type":"box","xyxy":[x1,y1,x2,y2],"color":"#…","label":"…"},
      {"type":"polygon","pts":[[x,y],…],"color":"#…","label":"…"}
    ],
    "max_kb": 200                     # trần dung lượng JPEG
  }

Output: assets/real/<id>.jpg + cập nhật assets/real/manifest.json
  entry: {file, origin:"<session>/f<frame>/cam<cam>", source, sha256,
          session, cam, frame}
"""
import hashlib
import io
import json
import math
import sys
import tempfile
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent          # algo-web-v2
ASSETS_REAL = ROOT / "assets" / "real"
MANIFEST = ASSETS_REAL / "manifest.json"

import extract_frames  # noqa: E402  — cùng thư mục tools/

# font nhãn: PIL không đọc woff2 → Segoe UI (đủ glyph tiếng Việt)
FONT_CANDIDATES = [
    Path(r"C:\Windows\Fonts\segoeui.ttf"),
    Path(r"C:\Windows\Fonts\arial.ttf"),
    Path("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"),
]


def _font(size=18):
    for p in FONT_CANDIDATES:
        if p.exists():
            return ImageFont.truetype(str(p), size)
    return ImageFont.load_default()


def _hex(s):
    s = (s or "#0b57d0").lstrip("#")
    if len(s) == 3:
        s = "".join(c * 2 for c in s)
    return tuple(int(s[i:i + 2], 16) for i in (0, 2, 4))


def _label(draw, xy, text, font, color, at=None):
    """Nhãn nền tối + chữ màu shape, đặt cạnh (x,y); `at` = góc trên-trái cố định."""
    if not text:
        return
    x, y = xy
    pad = 4
    bb = draw.textbbox((0, 0), text, font=font)
    w, h = bb[2] - bb[0], bb[3] - bb[1]
    if at is not None:
        lx, ly = at
    else:
        ly = y - h - 2 * pad - 6
        if ly < 2:
            ly = y + 6
        lx = x
    lx = min(max(2, lx), draw.im.size[0] - w - 2 * pad - 2)
    ly = min(max(2, ly), draw.im.size[1] - h - 2 * pad - 2)
    draw.rectangle([lx, ly, lx + w + 2 * pad, ly + h + 2 * pad],
                   fill=(12, 18, 26), outline=color)
    draw.text((lx + pad - bb[0], ly + pad - bb[1]), text, font=font, fill=(255, 255, 255))


def _arrow(draw, p1, p2, color, width=3):
    draw.line([tuple(p1), tuple(p2)], fill=color, width=width)
    ang = math.atan2(p2[1] - p1[1], p2[0] - p1[0])
    ah = 12
    for da in (math.radians(150), math.radians(-150)):
        q = (p2[0] + ah * math.cos(ang + da), p2[1] + ah * math.sin(ang + da))
        draw.line([tuple(p2), q], fill=color, width=width)


def _draw_item(draw, item, font):
    t = item.get("type")
    color = _hex(item.get("color"))
    label = item.get("label")
    at = item.get("label_at")
    if t == "circle":
        x, y = item["xy"]
        r = item.get("r", 10)
        draw.ellipse([x - r, y - r, x + r, y + r], outline=color, width=3)
        draw.ellipse([x - 3, y - 3, x + 3, y + 3], fill=color)
        _label(draw, (x + r + 4, y - r), label, font, color, at=at)
    elif t == "arrow":
        _arrow(draw, item["from"], item["to"], color)
        _label(draw, (item["to"][0] + 6, item["to"][1]), label, font, color, at=at)
    elif t == "box":
        x1, y1, x2, y2 = item["xyxy"]
        draw.rectangle([x1, y1, x2, y2], outline=color, width=3)
        _label(draw, (x1, y1), label, font, color, at=at)
    elif t == "polygon":
        pts = [tuple(p) for p in item["pts"]]
        draw.polygon(pts, outline=color)
        for i in range(len(pts)):
            draw.line([pts[i], pts[(i + 1) % len(pts)]], fill=color, width=3)
        _label(draw, (pts[0][0], pts[0][1]), label, font, color, at=at)
    else:
        raise SystemExit(f"draw.type không hỗ trợ: {t}")


def _source_image(spec, tmpdir):
    """Trả (PIL.Image RGB, bytes nguồn). image_path thắng video."""
    if spec.get("image_path"):
        p = Path(spec["image_path"])
        if not p.exists():
            raise SystemExit(f"image_path không tồn tại: {p}")
        data = p.read_bytes()
        return Image.open(io.BytesIO(data)).convert("RGB"), data
    sd = extract_frames.resolve_session(spec["session"])
    tmp = Path(tmpdir) / "frame.png"
    extract_frames.extract(sd, int(spec["cam"]), int(spec["frame"]),
                           spec.get("source", "raw"), tmp)
    data = tmp.read_bytes()
    return Image.open(io.BytesIO(data)).convert("RGB"), data


def _save_jpeg(img, out_path, max_kb):
    """Giảm quality dần tới khi <= max_kb; trả (bytes, quality)."""
    last = None
    for q in (92, 85, 78, 70, 62, 54, 46, 38, 30):
        buf = io.BytesIO()
        img.save(buf, "JPEG", quality=q, optimize=True)
        last = buf.getvalue()
        if len(last) <= max_kb * 1024:
            break
    out_path.write_bytes(last)
    return len(last), q


def _update_manifest(entry):
    data = []
    if MANIFEST.exists():
        data = json.loads(MANIFEST.read_text(encoding="utf-8"))
    data = [e for e in data if e.get("file") != entry["file"]]
    data.append(entry)
    data.sort(key=lambda e: e["file"])
    MANIFEST.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n",
                        encoding="utf-8")


def annotate(spec_path):
    """Chạy một spec → ghi JPEG + manifest. Trả entry manifest."""
    spec = json.loads(Path(spec_path).read_text(encoding="utf-8"))
    fid = spec["id"]
    cam = int(spec.get("cam", 0))
    frame = int(spec.get("frame", 0))
    source = spec.get("source", "raw")
    session = spec.get("session", "")
    ASSETS_REAL.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="tg-annot-") as td:
        img, src_bytes = _source_image(spec, td)
    draw = ImageDraw.Draw(img)
    font = _font(max(16, img.width // 60))
    for item in spec.get("draw", []):
        _draw_item(draw, item, font)
    out = ASSETS_REAL / f"{fid}.jpg"
    nbytes, q = _save_jpeg(img, out, int(spec.get("max_kb", 200)))
    if nbytes > int(spec.get("max_kb", 200)) * 1024:
        print(f"WARN: {fid}.jpg {nbytes/1024:.0f}KB vẫn > max_kb "
              f"{spec['max_kb']} sau quality tối thiểu", file=sys.stderr)
    entry = {
        "file": out.name,
        "origin": f"{session}/f{frame}/cam{cam}",
        "source": source,
        "sha256": hashlib.sha256(src_bytes).hexdigest(),
        "session": session,
        "cam": cam,
        "frame": frame,
    }
    _update_manifest(entry)
    print(f"{out.name}  {nbytes/1024:.1f}KB q{q}  {entry['origin']}")
    return entry


def main(argv=None):
    argv = argv if argv is not None else sys.argv[1:]
    if not argv:
        print("dùng: python tools/annotate.py tools/figures/<fig>.json […]")
        return 2
    for sp in argv:
        annotate(sp)
    return 0


if __name__ == "__main__":
    sys.exit(main())
