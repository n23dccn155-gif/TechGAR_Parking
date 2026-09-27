# -*- coding: utf-8 -*-
"""Render per-slide PNG previews from the authored SVGs via headless Chrome."""
import glob
import os
import subprocess

SVG_DIR = r"D:\TechGar2\slides_nckh\build\techgar_nckh\svg_output"
OUT_DIR = r"D:\TechGar2\slides_nckh\build\previews"
CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"

os.makedirs(OUT_DIR, exist_ok=True)
for f in sorted(glob.glob(os.path.join(SVG_DIR, "*.svg"))):
    n = os.path.splitext(os.path.basename(f))[0]
    out = os.path.join(OUT_DIR, n + ".png")
    url = "file:///" + f.replace(os.sep, "/")
    subprocess.run(
        [CHROME, "--headless=new", "--disable-gpu", "--hide-scrollbars",
         "--screenshot=" + out, "--window-size=1280,720", url],
        capture_output=True,
    )
    ok = os.path.exists(out)
    print(n, "->", ok, os.path.getsize(out) if ok else 0)
