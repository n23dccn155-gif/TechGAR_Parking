"""tools/test_annotate.py — kiểm chứng annotate.py trên ảnh tổng hợp.

Tạo ảnh 640×360 + spec (1 circle + 1 arrow + 1 box + 1 polygon + label Việt
'ặữ'), chạy annotate(), assert:
  - file JPEG tồn tại trong assets/real/
  - dung lượng <= max_kb
  - kích thước ảnh đúng 640×360
  - assets/real/manifest.json có entry đúng {file, origin, source, sha256}

Chạy:  python tools/test_annotate.py   (từ gốc repo algo-web-v2)
"""
import hashlib
import json
import shutil
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(Path(__file__).resolve().parent))

try:
    from PIL import Image  # noqa: E402
except ImportError:
    Image = None

import annotate  # noqa: E402  — module đang test


@unittest.skipIf(Image is None, "PIL không có sẵn")
class TestAnnotate(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp(prefix="tg-annot-"))
        # ảnh tổng hợp 640x360 nền xám + vài khối màu để JPEG có nội dung
        img = Image.new("RGB", (640, 360), (52, 58, 64))
        for i in range(6):
            for j in range(3):
                img.paste((30 + i * 30 % 200, 90 + j * 50 % 150, 120),
                          (i * 106, j * 120, i * 106 + 100, j * 120 + 110))
        self.src_img = self.tmp / "synth.png"
        img.save(self.src_img)
        self.spec_path = self.tmp / "fig-test.json"
        spec = {
            "id": "test-synth-fig",
            "session": "test_synth",
            "cam": 1,
            "frame": 0,
            "source": "raw",
            "image_path": str(self.src_img),
            "draw": [
                {"type": "circle", "xy": [100, 80], "r": 14,
                 "color": "#0b57d0", "label": "P1"},
                {"type": "arrow", "from": [50, 40], "to": [180, 160],
                 "color": "#0b57d0", "label": "hướng đi"},
                {"type": "box", "xyxy": [300, 100, 420, 200],
                 "color": "#13795b", "label": "xe đỗ"},
                {"type": "polygon",
                 "pts": [[450, 260], [560, 240], [600, 320], [470, 330]],
                 "color": "#b3261e", "label": "vùng ặữ ự"},
            ],
            "max_kb": 200,
            # chuyển hướng output sang tmp để test không đụng assets thật?
            # KHÔNG — test phải dùng đúng assets/real + manifest thật
            # (annotate.py dọn entry test sau khi xong).
        }
        self.spec_path.write_text(json.dumps(spec), encoding="utf-8")

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)
        # dọn artifact test khỏi assets/real + manifest
        out = ROOT / "assets" / "real" / "test-synth-fig.jpg"
        if out.exists():
            out.unlink()
        man = ROOT / "assets" / "real" / "manifest.json"
        if man.exists():
            data = json.loads(man.read_text(encoding="utf-8"))
            data = [e for e in data if e.get("file") != "test-synth-fig.jpg"]
            man.write_text(json.dumps(data, indent=2, ensure_ascii=False),
                           encoding="utf-8")

    def test_annotate_produces_manifested_jpeg(self):
        entry = annotate.annotate(str(self.spec_path))
        out = ROOT / "assets" / "real" / "test-synth-fig.jpg"
        self.assertTrue(out.exists(), "annotate không ghi file JPEG")
        size_kb = out.stat().st_size / 1024
        self.assertLessEqual(size_kb, 200, f"ảnh {size_kb:.1f}KB > max_kb")
        with Image.open(out) as im:
            self.assertEqual(im.size, (640, 360), "kích thước sai")
            self.assertEqual(im.format, "JPEG")

        man = ROOT / "assets" / "real" / "manifest.json"
        self.assertTrue(man.exists(), "manifest.json không được tạo")
        data = json.loads(man.read_text(encoding="utf-8"))
        hit = [e for e in data if e.get("file") == "test-synth-fig.jpg"]
        self.assertEqual(len(hit), 1, "manifest thiếu entry")
        e = hit[0]
        self.assertEqual(e["origin"], "test_synth/f0/cam1")
        self.assertEqual(e["source"], "raw")
        want_sha = hashlib.sha256(self.src_img.read_bytes()).hexdigest()
        self.assertEqual(e["sha256"], want_sha,
                         "manifest sha256 không khớp source frame")
        # annotate() trả về entry khớp manifest
        self.assertEqual(entry["file"], "test-synth-fig.jpg")
        self.assertEqual(entry["origin"], "test_synth/f0/cam1")


if __name__ == "__main__":
    unittest.main(verbosity=2)
