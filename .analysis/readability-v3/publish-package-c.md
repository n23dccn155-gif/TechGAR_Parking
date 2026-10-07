# Publish package — learn_techGar (C) — FINAL

**Trạng thái: STAGING COMMIT XONG — HOLD PUSH, chờ B chốt SHA review độc lập.**

- Remote: `https://github.com/anqp5002/learn_techGar.git`
- B audit: `ls-remote` exit 0, **0 refs → repo rỗng** → push thường đủ, không cần force/preserve-history.
- Package + repo: `D:\TechGar2\.publish\learn_techGar\` — git repo **riêng**, init `-b main` ngay trong package (F2), không remote nào được add, **không đụng `.git`/remote/index/history của `D:\TechGar2`** (parent git status không đổi — các `M` hiện có là working-state sẵn của repo nguồn).
- **Commit: `5ee4f2949b7699722064aa5747b59a88ce9d03b5`** — "Initial import: TechGAR learning web (algo-web-v2) + referenced source snapshots" — 1227 files, tree sạch.

## 1. Manifest cuối

| Phần | Files | Dung lượng |
|---|---|---|
| `algo-web-v2/` (web đầy đủ + QA + shots 687 ảnh) | 780 | 84 MB |
| `backend/` (16 file nguồn được ref) | 16 | 1.1 MB |
| `frontend/src/` (6 file nguồn được ref) | 6 | 100 KB |
| `.analysis/` (91 .md + dossier JSON + `shots-b/` 313 file được docs link) | 423 | ~34 MB |
| root `README.md` + `.gitignore` (package-only) | 2 | — |
| **TỔNG (git ls-files)** | **1227** | **~119 MB** |

- `.analysis/` gồm: `MEGAPLAN.md`, `PLAN-readability-v3.md`, `REPORT.md`, `builder-a/b/c.md`; `algos/` 18 md; `algos-v2/` 38 md + `content-a/b` dossier JSON; `readability-v3/` 29 md + `shots-b/` (cả `final/` và các dir route được `batch-b`/checkpoints link — F1: không để link chết khi file gốc có).
- Loại trừ: `_*.mjs/.js/.txt/.json` debug-dump, `.bak`, `_cross_dump_a`, `algos-v2/qa-shots`, `.analysis/algo-web-v2` (rỗng), mọi cache/video/frame/model/dataset/node_modules/.venv/credential.
- File lớn nhất 428 KB — xa dưới limit 100 MB.

## 2. Bằng chứng freeze

- `diff -r -q algo-web-v2 → package` = **0 khác biệt**.
- **59/59 product files SHA256 khớp freeze** (index+css+8 core/app/manifest+23 content+23 pages+3 pipeline).
- **22/22 source files SHA256 khớp gốc** (16 backend + 6 frontend).
- `qa/smoke-final.log` 46-run baseline giữ nguyên (file-only package-check từng ghi đè — đã restore byte-identical, kết quả package-check ghi ở §5).
- `.analysis` copy nguyên trạng; package thêm đúng `README.md` + `.gitignore` ở root.

## 3. Source refs

- 38/38 ref-target resolve (full-path/basename/alias), miss=0 — layout sibling `algo-web-v2 + backend + frontend` giữ nguyên.
- Package runtime check thật (§5) đếm **refs checked=447 · fileOnly=0 · skipped=0 · INVALID=0** trên 23 routes mở từ package.
- 22 file nguồn là snapshot đọc-tài-liệu — không phải runtime repo, không chạy độc lập (README ghi rõ).
- Doc-links: 0 link markdown `](…)` nào trong product docs — toàn mention basename repo-context; mọi basename được nhắc đều tồn tại trong package (miss=0 sau khi thêm `.analysis/` + `shots-b/`).

## 4. Secrets / large-file

- Scan `password|secret|api_key|token|bearer|rtsp://|ssh://|PRIVATE KEY|AKIA|ghp_`: `token`=thuật ngữ domain · `secrets`=stdlib import → **0 credential thật**.
- IP camera LAN `192.168.100.53/198` trong `calibrate_map.py` + `two_camera.shared_cm_01.json`: **không phải credential** — giữ literal để bảo toàn `file:dòng` (line fidelity); LEAD đã chấp nhận phạm vi snapshot này. Ghi nhận là hạn chế đã-review, không suy ra user duyệt riêng.

## 5. Focused package checks (chạy trên chính package)

- `node qa/smoke.mjs --file-only` từ `…/learn_techGar/algo-web-v2` @03:02:56Z:
  **routes=23 · issues=0 · refs 447/0/0/0 · v3routes=23/23 · map 17/6 · journey px/hits ok, click thật kalman→#/algo/kalman · glossary 56→6 refsBad=0 · kb/present/fs/reducedMotion ok · playPixel 23/23 · consoleErrors=[] · failedReqs=[]**.
- QA baseline 46-run (file+http) vẫn là `qa/smoke-final.log` frozen — không redo trên package (B actual-click file:// đã accepted; HTTP href+route-render).
- Doc-link audit: 208 "miss" ban đầu phân loại = 0 link thật (mention basename); sau thêm `.analysis` + `shots-b` → mọi target tồn tại.

## 6. Push plan (sau review — không overwrite)

```
cd .publish/learn_techGar        # đã init -b main + commit 5ee4f29
git remote add origin https://github.com/anqp5002/learn_techGar.git
git push -u origin main          # push thường, remote 0 refs
```

- Remote rỗng → không cần force/preserve-history. Visibility remote chưa xác minh — không khẳng định.
- Deploy GitHub Pages: ngoài phạm vi tác vụ này.

## 7. Hạn chế

- `backend/` + `frontend/` = tập-con được ref; file không-ref không có — cố ý.
- Mention dạng `canonical-audit-a/b/c.md` là viết tắt văn — cả 3 file có mặt.
- `.analysis` docs tham chiếu file repo-runtime không có trong package (vd `CLAUDE.md`, runbook backend) — ngoài scope deliverable, giống trạng thái repo gốc.
- **HOLD: không push/force/delete; không tự approve. B chốt SHA `5ee4f29` độc lập.**
