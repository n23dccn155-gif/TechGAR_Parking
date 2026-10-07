# QA Ref-Format Audit — B pages (read-only support, 2026-10-04 ~22:0x)

**Yêu cầu**: smoke-final.log `refs 271 checked / 29 skipped`, `gate 0/2`, toàn-bộ skip nằm ở 9 pages B
(dormant, gid-conflict, handoff, homography, reid, session, snapshot, trajectory + gate).
Đây là audit format refs của chính B — KHÔNG sửa code/web/QA/helper.

## 1. Root cause — đã xác nhận (không phải file thiếu; INVALID=0)

`qa/smoke.mjs:117` ép `+x.line` **ngay lúc collect**, trước khi dedupe:

```js
(c.sourceRefs||[]).forEach(x => stru.push({f:String(x.file), l:+x.line}));
(c.realParams||[]).forEach(p => (p.refs||[]).forEach(x => stru.push({f:String(x.file), l:+x.line})));
```

- `line` là **range string** (`"18-78"`) hoặc **multi-loc** (`"29,81-88,206-215"`, `"865,899-906"`) → `+line = NaN`.
- `line: ""` (file-only refs) → `+"" = 0`.
- `checkRef` (:87-94): `n<=0` → **'skipped'** (không phải 'missing' → không lọt vào INVALID).
- Dedupe key `:124` = `file+':'+l` → mọi range-line của **cùng file** sụp về **một key `file:NaN`**
  → mỗi file chỉ đếm **1 skip** dù có nhiều range refs.

**⇒ skip-count của mỗi trang = số file có ≥1 `line` non-numeric (NaN hoặc 0).**
Đối chiếu log — khớp chính xác 29/29, không có skip ngoài B:

| route | skip | files NaN/0 | ok |
|---|---|---|---|
| reid | 4 | tracklet_descriptor · motion_tracker · cross_camera_manager · two_camera | 11 |
| handoff | 2 | ccm · tc | 13 |
| homography | 4 | rectangle_line_calibration · tc · ccm · shared_cm_01.json | 12 |
| trajectory | 3 | trajectory_memory · ccm · tc | 6 |
| dormant | 3 | ccm · svb · tc | 10 |
| gid-conflict | 2 | ccm · tc | 10 |
| gate | 2 | gsc (NaN) + gate_zones.json (`line:""`→0) | **0** |
| session | 2 | sm (NaN) + sm `line:""` (atomicity → 0 — key `file:0` khác `file:NaN`) | 7 |
| snapshot | 7 | tc · runtime_server · gsc · runtimeApi.ts · backendApi.ts · App.tsx · runtime_contract | 10 |

**`gate ok=0`**: mọi structured line đều range/empty (không có numeric nào) **+** inline notes dùng
alias `gate:`/`cfg:` — không nằm trong `ALIAS` map (smoke dùng `gsc` cho gate_session_controller)
→ text-scan không bắt được gì → 0 checked. Canvas-drawn refs không vào `innerText` nên cũng
vô hình với text-scan (Deep accordion đóng → `.tg-reflist` DOM cũng không được scan — innerText
không đi qua `display:none`).

## 2. Parser chấp nhận gì (smoke.mjs đang chạy — C có thể đã edit; mtime 21:47)

### Structured refs (sourceRefs + realParams[].refs / legacy .ref)
- `file`: path repo-relative có `/` → resolve qua `path.join(REPO, f)` (:70) — **khuyến nghị dùng**;
  hoặc basename trần → tra `IDX` (index `backend/`, `frontend/src/`, `frontend/public/`, ext
  `py|ts|tsx|json|js`; SKIP_DIR bỏ node_modules/.venv/dist/.git/experiment_test/output/docs/assets —
  **`.pytest_tmp_lead` KHÔNG bị skip** → `gate_zones.json` ×3 → basename 'AMBIG' → text-ref sẽ skip;
  full-path vẫn resolve được).
- `line`: **chỉ numeric** (`1259`, `"1259"`). Range/multi-loc/empty → skip như trên.

### Text-scan refs (innerText trang — chỉ DOM hiển-thị; canvas + accordion đóng không tính)
- `RE_ALIAS :101`: `\b(svb|tc|pd|mt|ccm|gsc|sm|rt|rc|app)\s*[:：]\s*(\d{1,5})` — **chỉ số đơn**;
  `ccm:3278-3299` chỉ verify line **3278** (đuôi range rơi im-lặng).
- `RE_PATH :103`: `backend|frontend|config` prefix → `:LINE` (số đơn).
- `RE_BASE :105`: `[\w]+\.(py|ts|tsx|json)` basename → `:LINE`.
- Alias B dùng nhưng parser **không nhận**: `gate:` (→`gsc`), `cfg:` (→config path), `tm:`/`td:`/`rs:`
  (trajectory_memory/tracklet_descriptor/runtime_server — không có alias).

## 3. Canonical file:line mapping cho C verifier

Quy-ước đề-xuất (để cover KHÔNG skip): `line` = **dòng đầu numeric**; giữ range/điểm-phụ trong
`symbol`/`note`. Multi-loc → tách ref hoặc verify từng số. Dưới đây map đầy-đủ các ref đang skip
(`<file> : "hiện-tại" → canonical start[:end]`):

### cross_camera_manager.py — `backend/main_detect/src/techgar/cross_camera_manager.py`
```
reid      18-78 td;388-397 → :388,:397 | 547-587 → :547 | handoff 226-229→:226 | 2572-2636→:2572
          2744-2774→:2744 | 2776-2829→:2776 | 2895-2907→:2895 | 2935-2990→:2935 | 3376-3440→:3376
          3615-3667→:3615 | 3658-3667→:3658 | dormant 163-165→:163 | 2419-2445→:2419
          4636-4691→:4636 | 4680-4684→:4680 | homography 1370-1407→:1370 | 2458-2468→:2458
          trajectory 379-384→:379 | 381-382→:381 | 1442-1510→:1442 | 6093-6117→:6093 | 6115-6117→:6115
          gid-conflict 163-165→:163 | 3125-3224→:3125 | 3226-3374→:3226 | 3306-3312→:3306
          3314-3347→:3314 | 3376-3440→:3376 | 4707-4711→:4707
```

### two_camera.py — `backend/main_detect/two_camera.py`
```
homography 284-341→:284 | 387-392→:387 | 387-447→:387 | 395-412→:395 | 415-423→:415 | 2163-2190→:2163
reid 1965-1966→:1965 | handoff 1944-1948→:1944 | 2163-2169→:2163 | 2170-2176→:2170 | 2184-2190→:2184
trajectory 1969-1971→:1969 | dormant 1883-1887→:1883 | 1883-1897→:1883 | 1890-1897→:1890
          1980-1995→:1980 | 2177-2183→:2177 | gid-conflict 2184-2190→:2184
snapshot 1802,2817,2844-2869→ multi :1802+:2817+:2844
```

### slot_vehicle_binder.py — `backend/main_detect/src/techgar/slot_vehicle_binder.py`
```
dormant 230-235→:230 | 2653-2668→:2653 | 2980-2992→:2980
```

### tracklet_descriptor.py — `backend/main_detect/src/techgar/tracklet_descriptor.py`
```
reid 18-78→:18 | 81-91→:81 | 85-91→:85
```

### motion_tracker.py — `backend/main_detect/src/techgar/motion_tracker.py`
```
reid 427-429→:427 (→tracker callsite tc:2387 numeric OK)
```

### trajectory_memory.py — `backend/main_detect/src/techgar/trajectory_memory.py`
```
trajectory 56-68→:56 | 387-393→:387 | 395-402→:395 | 412-421→:412 | 428-516→:428 | 503-509→:503
```

### gate_session_controller.py — `backend/gate_session_controller.py` (alias `gsc`, KHÔNG `gate`)
```
gate 229-256→:229 | 254-255→:254 | 259-309→:259 | 275-307→:275 | 483-493→:483 | 483-534→:483
gate 865,899-906 → multi :865+:899 | snapshot 55,865,899-906 → :55+:865+:899 | 865,904-906 → :865+:904
```

### session_manager.py — `backend/session_manager.py` (alias `sm`)
```
session 29,81-88,206-215 → multi :29+:81+:206 | 33,220-252 → :33+:220 | 190,277,531,542,556 → 5 locs
        29,81-88,213-214 → :29+:81+:213 | 355-368→:355 | 358-463→:358 | 392-446→:392
        line:"" (atomicity _STORE_LOCK) → cần 1 line số thật hoặc chấp nhận skip-file-only
```

### JSON / TS / khác
```
rectangle_line_calibration.py  41-108→:41 | 41-112→:41   (backend/main_detect/tools/)
two_camera.shared_cm_01.json   "7,134+,1461-1468" → :7+:1461  (backend/main_detect/config/ — '134+' là
                               shorthand "từ 134"; canonical: tách :7 (unit cm) + :1461 (anchor))
gate_zones.json                line:"" → chỉ file; nếu cần line: dùng :1 hoặc trường gate.direction cụ-thể
runtime_server.py              106-113,285-289→:106+:285 | 285-289→:285   (backend/main_detect/)
runtime_contract.py            12-13,37,70,76-77,95-110→:12+:37+:70+:76+:95 | 12-13→:12
runtimeApi.ts                  11,43,58 → :11+:43+:58    (frontend/src/api/)
backendApi.ts                  46-79→:46                  (frontend/src/api/)
App.tsx                        354-360,191,393-404,283,355 → :191+:283+:354+:355+:393  (frontend/src/app/)
```

## 4. Khuyến-nghị cho C verifier (không yêu-cầu sửa B files)

1. **Coerce an-toàn**: thay `+x.line` bằng parse int đầu — `parseInt(String(x.line).match(/\d+/)||'')`
  → cover toàn-bộ 29 skips tại **start-line** (giữ range trong note để verify tay khi cần).
   Multi-loc `"a,b-c,d"` → split `,` → verify từng số.
2. **`line:""` file-only refs** (gate_zones.json, session atomicity): hoặc map canonical line
   (`gate_zones.json` → trường `gate.direction`; sm `_STORE_LOCK` → ctor region) hoặc whitelist
   file-existence-only check riêng — không nên đếm như skip mù.
3. **Alias text-scan**: nếu muốn cover refs trong EXPL/pcode DOM của B → thêm `gate→gsc` mapping
   hoặc B viết `gate_session_controller.py:LINE`/RE_BASE-form. (Canvas refs vẫn vô hình — chấp
   nhận; structured refs mới là nguồn verify chính.)
4. **AMBIG awareness**: `gate_zones.json` trùng basename ×3 do `.pytest_tmp_lead` không nằm trong
   SKIP_DIR → ưu tiên refs full-path; basename trần có thể skip 'ambig'.

## 5. Notes

- Mọi `file` path B dùng đều **tồn-tại** (INVALID=0 — không có ref hỏng); vấn-đề thuần `line` format.
- B đã dùng full repo-relative paths ở mọi structured ref — parser-side resolve 'path' ổn.
- Numeric refs của B (single-line `line:"3622"`, `line:"6131"`, `line:427`…) đã checked OK — cùng
  convention, chỉ range/multi-loc/empty gây skip.
- B KHÔNG sửa files đợt này (readonly task); nếu LEAD muốn chuẩn-hoá owner-side, convention đề-xuất:
  `line: <start>` + `symbol:"…:end"` hoặc `note:"lines A-B"`.

## 6. Appendix — owner citation fixes (2026-10-04, LEAD-directed)

Chỉ metadata/refs trong `js/content/` của B. Range/multiloc **giữ nguyên** (C parse cả endpoints/mọi loc).

| file sửa | ref | trước | sau | bằng-chứng |
|---|---|---|---|---|
| `content/gate.js:26` | `backend/main_detect/config/gate_zones.json` | `line:""` | `line:"16,28"` | `:16 "direction":"positive"` · `:28 "direction":"negative"` (file mtime 2026-09-22 16:55, tồn-tại) |
| `content/session.js:34` | `backend/session_manager.py` | `line:""` | `line:"31,151,316"` | `:31 _STORE_LOCK = threading.RLock()` · `:151 setdefault("revision",0)` · `:316 def _mutate_session` (mtime 2026-09-27 15:17) |
| `content/snapshot.js:28,34,35` | `frontend/src/App.tsx` | sai path | `frontend/src/app/App.tsx` | `frontend/src/App.tsx` **không tồn-tại** (ls: No such file); `frontend/src/app/App.tsx` tồn-tại 57,388B (mtime 2026-09-27 15:17). Trước đây resolve nhờ basename-fallback — giờ 'path' trực-tiếp. |

Verify trực-tiếp (không suy-luận từ INVALID=0): `ls`/`sed -n` trên cả 3 file — dòng cite khớp claim
(`gate.direction` dương/âm; `_STORE_LOCK`+`revision`+`_mutate_session`; App.tsx poll/stale code ở
:191/:283/:354/:355). `runtimeApi.ts` + `backendApi.ts` tại `frontend/src/api/` — đúng path, không đổi.
`line:"16,28"`/`"31,151,316"` theo convention multi-loc — C parse từng loc.
