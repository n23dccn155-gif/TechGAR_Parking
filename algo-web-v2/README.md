# TechGAR Pipeline — minh họa giáo dục

Site tĩnh giải thích thuật toán TechGAR bám mã nguồn thật. Không build step, không CDN, không external request — mọi font/ảnh là file local.

## Mở site

```powershell
# Cách 1 — mở thẳng file (hash routing hoạt động với file://)
start algo-web-v2/index.html

# Cách 2 — http server (bất kỳ server tĩnh nào)
cd algo-web-v2 && python -m http.server 8080
# rồi mở http://localhost:8080/
```

Routes: `#/` (trang đầu manifest), `#/p/<id>` (trang cơ chế), `#/glossary`, `#/values`, `#/journey`, `#/search?q=...`.

## Cấu trúc

```
index.html            nạp css + js theo thứ tự cố định (không ES module)
css/                  tokens · base · components — border-radius 0, không italic
js/core/tg.js         namespace TG + schema validatePage + rng seed
js/core/terms.js      glossary resolve + tooltip (ưu tiên hiện phía trên)
js/core/render.js     renderer 7 section từ page def
js/core/router.js     hash router + nav + toc
js/core/search.js     index per-section, NFD bỏ dấu
js/core/interactive/  roi · homography · occlusion · assignment (mount/destroy)
js/manifest.js        GROUPS + thứ tự trang
js/pages/*.js         mỗi trang tự TG.definePage({...}) — 7 section bắt buộc
js/glossary-data.js   SINH TỰ ĐỘNG bởi qa/build-glossary.mjs — không sửa tay
js/quickvalues-data.js SINH TỰ ĐỘNG bởi qa/build-values.mjs — không sửa tay
assets/fonts/         Inter + JetBrains Mono woff2 subset (latin/vietnamese/ext)
assets/real/          ảnh chú thích từ session thật + manifest.json
tools/                extract_frames.py · annotate.py · figures/*.json (spec)
qa/                   lint.mjs · e2e.mjs · schema.test.mjs · build-*.mjs
```

## Thêm / sửa một trang

1. Đọc `notes/` tương ứng trong `.analysis/algo-web-v2-redesign/` (nếu có) hoặc tự lập bảng nguồn: mọi con số phải có `file:dòng` hoặc nhãn `(minh họa)`.
2. Tạo `js/pages/<id>.js` gọi `TG.definePage` đủ 7 section — xem `homography.js` làm mẫu.
3. Thêm `<script src="js/pages/<id>.js">` vào `index.html` + entry vào `manifest.js` (group/pages/order).
4. `node qa/lint.mjs --pages=<id>` và `node qa/e2e.mjs --pages=<id>` phải 0 ERROR 0 WARN trước khi xong.
5. Thuật ngữ: dùng marker `[[Term]]` trong prose; bổ sung entry vào `qa/build-glossary.mjs` ADDS rồi `node qa/build-glossary.mjs`. Số tra nhanh: thêm vào `params[]` rồi `node qa/build-values.mjs`.

## Trích ảnh thật

```powershell
# trích frame từ session replay (venv backend có cv2+PIL)
backend/main_detect/.venv/Scripts/python.exe tools/extract_frames.py --session <name> --frame <n> --cam <1|2>
# tạo spec tools/figures/<id>.json {session,cam,frame,draw:[...],max_kb} rồi:
backend/main_detect/.venv/Scripts/python.exe tools/annotate.py tools/figures/<id>.json
# → assets/real/<id>.jpg + tự cập nhật assets/real/manifest.json
```

## QA

```powershell
node qa/lint.mjs              # toàn site: schema + readability + nguồn + UI rules
node qa/e2e.mjs               # Playwright: file+http × 1440×900 + 390×844
node qa/e2e.mjs --pages=a,b   # subset
node qa/schema.test.mjs       # unit test validatePage
node qa/build-glossary.mjs    # regen js/glossary-data.js
node qa/build-values.mjs      # regen js/quickvalues-data.js
```

Kỳ vọng PASS: lint 0 ERROR 0 WARN; e2e 0 issue (0 console.error/pageerror/requestfailed/external).
