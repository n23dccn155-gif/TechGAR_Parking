# Build A — pack `local` (pipeline cục bộ một camera)

**Trạng thái:** xong phần A — sẵn sàng để C tích hợp & browser-QA. Không tự approve blocker.

## Deliverables (chỉ file thuộc A)

| File | Nội dung |
|------|----------|
| `algo-web/packs/pipeline-local.js` | 5 node `roi, motion, kalman, assignment, coasting` — 712 dòng, sha256 `6dee1455c790151b` (freeze) |
| `algo-web/README-local-v2.md` | hướng dẫn, map node→evidence, cách chạy verifier |
| `.analysis/algos-v2/test-local-pack.mjs` | owner verifier |
| `.analysis/algos-v2/build-a.md` | báo cáo này |

Không sửa `index.html`, `app.js`, `shared/engine.js`, CSS, SPEC, pack khác, source sản phẩm. `capture` là node của C — pack A bắt đầu từ `roi`.

## Coverage node/scenario

| Node | normal | edge (chủ đề khó) | visual riêng |
|------|--------|--------------------|--------------|
| `roi` | xe trong ROI nhận / ngoài reject | mép ROI: context-rescue vs band-only chết | polygon + anchor + thanh support |
| `motion` | xe động → 1 detection | bóng đổ + speckle → 0 detection | lưới pixel mask biến đổi 5 bước |
| `kalman` | predict/correct luân phiên → CONFIRMED | gate từ chối → KHÔNG correct | quỹ đạo + strip thứ tự predict→detect→assign→correct |
| `assignment` | 2 track × 2 det, lapjv chọn đúng | merged-blob: cột=10, margin defer | mini-map + ma trận cost nóng |
| `coasting` | mất 2 frame → reacquire trong cửa sổ | quá 0.40s stale → quá TTL expired | quỹ đạo đứt + thanh age→limit→TTL |

Mỗi node: 4-5 frame/scenario (tổng 41 frame), pseudocode 6-7 dòng,
`activeLines` 0-based, `answers` 4 câu VN, `refs` trích verbatim có
`excerptStart`.

## Evidence bundles (đã kiểm excerpt ≡ file thật)

- **ROI**: `two_camera.py:2415-2417` (polygon→roi_mask); `motion_tracker.py:812-816` (band chỉ-đo); `:876-880` (strict support).
- **Motion**: `:768-771` (MOG2 + thresh>200); `:790-793` (mask = bg ∧ dilate(motion)); `:1015-1019` (motion-fill per box).
- **Kalman**: `:440-443` (KF(4,2)); `:247` (predict); `:2118` (correct); `:2249-2251` (assign→apply — chứng minh correct chỉ sau match).
- **Assignment**: `:1615` (cost=10 init); `:1761-1766` (4 hạng .45/.25/.20/.10); `:1908` (lapjv, extend_cost, limit .90); `:1946-1951` (defer khi margin thiếu).
- **Coasting**: `:263-269` (decay e^-age/0.25 + stale 0.40s); `:2258-2262` (unmatched loop); `:2279-2280` (frozen vs coasting); `:2189-2195` (TTL theo giây, không frame-count).

## Verification

```
node .analysis/algos-v2/test-local-pack.mjs  →  586 PASS / 0 FAIL
node --check algo-web/packs/pipeline-local.js  →  SYNTAX-OK
```

### Vòng sửa LEAD-screenshot-review (rev mới nhất, hash `d17f5512f5e3b9a3`)

1. **Fix label chồng ở `assignment/edge`** — thêm helper `callout()` (nhãn
   offset + đường leader từ tâm đối tượng tới nhãn) ~`pipeline-local.js:79-86`.
   Mỗi track/detection có offset `lbl` riêng trong scenario data; renderer
   ~`:470-488` vẽ leader-line + dot + nhãn ở offset. Normal: T1 `[-48,-46]`,
   T2 `[48,-46]`, d0/d1 `[±34,52]`; edge merged: T1 `[-58,-44]`, T2 `[58,-44]`,
   d0 `[0,58]` → nhãn không bao giờ chồng kể cả khi blob merged nằm giữa tâm.
2. **Copy tiếng Việt dễ-hiểu** — viết lại summary/answers/41-frame
   explanation của cả 5 node: bỏ chuỗi technical-English/nối-gạch dày đặc
   (vd `coasting age-bar interpolation` → "dự đoán mất dần đà",
   `motion-fill` → "pixel động trong khung"). Thuật ngữ production giữ ở
   refs/state (`roi_context_rescued`, `stale_prediction`, `prediction_source`).
3. **Glossary giải thích một lần, đúng thứ tự runtime** — `track` định nghĩa
   ở kalman `does` ("lịch sử vị trí của một xe qua các frame"), `blob` +
   `detection` + `cổng` định nghĩa ở motion `does`; roi/assignment/coasting
   dùng luôn, không lặp định nghĩa.
4. **Giữ nguyên source facts** — refs/excerpt/line không đổi; ngưỡng
   production (.90, 0.40s, .45/.25/.20/.10, min_visible_count=3) chỉ xuất
   hiện trong answers/refs/state, không nằm trong title frame.

Không sửa: `SPEC.md`, file của C/B, pack khác, source sản phẩm.

### Vòng sửa cuối (LEAD visual minor, hash `6dee1455c790151b` — freeze)

- **`coasting` age-bar**: nhãn `age Xs` trước nằm cùng hàng `age limit`/`TTL`
  phía trên bar → chồng khi age nhỏ. Giờ `age` dùng `callout()` offset
  xuống dưới bar với leader từ đầu fill (`bx+ageV`) — đọc được ở mọi age
  (`:632`). Không đổi copy/logic/state khác.
- Verify: `test-local-pack.mjs` **586/0** + syntax OK + ảnh browser thật
  `qa-shots/a-coasting-normal-f3.png` (bước 3/4 age 0.2s — 3 nhãn tách rõ,
  0 console error).

Phạm vi assert: registry shape (đúng 5 id, group=local) · metadata/answers/refs
đầy đủ · **mọi excerpt đối chiếu byte-level với source tại excerptStart** ·
pseudocode 5-10 · mỗi scenario ≥3 frame + build()×2 deterministic · frame
fields + activeLines⊆pseudocode + JSON-safe · **draw() trên 41 frame ×
progress {0,.5,1}: 0 throw, ≥1 lệnh vẽ, 0 mutation, mỗi scenario ≥1 frame
nội suy theo view.progress**.

## Contract issues ghi cho C/LEAD

1. Engine phải truyền `view = {width,height,progress,time,previous}` đủ 5
   khóa — pack dùng `previous` (frame trước) và `progress`/`time`.
2. Shell render `title/explanation/state` + tô `pseudocode[activeLines]`
   (0-based) — pack không tự in phần đó lên canvas.
3. `capture` + `shared/pipeline-engine.js` + `pipeline-app.js` + `index.html`
   V2 chưa tồn tại tại thời điểm build — pack test bằng ctx-stub;
   **browser-level QA thật chờ C**.
4. Frame `scene` có `type` pack-private (roi/motion/kalman/assign/coast) —
   dispatch nội bộ trong `draw` của từng node, không yêu cầu engine biết.

## Giới hạn đã ghi nhận

- Verifier ở mức contract/logic (ctx-stub): không đo đẹp, không chụp pixel —
  không khai là "browser tested".
- Mọi số liệu scene là minh họa được gắn nhãn trong explanation/state; ngưỡng
  production (0.40s stale, 0.25s decay, limit 0.90, ≥160px/8%, TTL theo giây,
  confirm = min_visible_count + displacement) chỉ trích trong answers/refs.
- Không khẳng định production "dùng Hungarian" — refs ghi đúng `lap.lapjv`
  (Jonker–Volgenant), "Hungarian" chỉ là tên nhóm bài toán.
