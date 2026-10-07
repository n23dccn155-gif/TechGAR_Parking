# Pack `local` — pipeline cục bộ một camera (builder A)

Năm node của nhánh per-camera trong SPEC V2 §5, đăng ký tại
`window.TechGarPipelinePacks.local`. Không fetch/CDN/npm — classic script,
mở `file://` an toàn. Mọi dữ liệu animation là **minh họa**; ngưỡng/comment
production được trích trong `refs` + `answers`, không trộn.

## Năm node (thứ tự runtime thật trong `process_frame`)

| # | Node | Làm gì | Visual riêng |
|---|------|--------|--------------|
| 1 | `roi` | Polygon ROI cứng + band mở hẹp — quyết định pixel nào được tính là xe | sơ đồ bãi + polygon + anchor + thanh support |
| 2 | `motion` | MOG2 ∧ diff-thời-gian → morphology → contour → detection | lưới mask pixel biến đổi theo bước |
| 3 | `kalman` | predict TRƯỚC detect, correct SAU khi assign matched | quỹ đạo đo/dự-đoán/sửa + strip thứ tự bước |
| 4 | `assignment` | gate riêng từng track → cost 4 hạng → `lapjv` 1-1 | bản đồ + ma trận cost nóng + ghép |
| 5 | `coasting` | mất dấu → predict có decay → stale → reacquire/expired | đường quỹ đạo + thanh age/TTL theo giây |

Scenario: mỗi node ≥2 (bình thường + khó). Chủ đề khó: ROI mép/band-only ·
bóng đổ+speckle · gate từ chối→không correct · merged-blob defer ·
stale_prediction+TTL-expire.

## Dùng thế nào (khi C tích hợp)

C sở hữu `shared/pipeline-engine.js` + `pipeline-app.js` + `index.html` V2 —
engine sẽ `<script src="packs/pipeline-local.js">` rồi đọc `TechGarPipelinePacks
.local`, render `title/explanation/state` + `pseudocode` (tô `activeLines`,
0-based) + gọi `draw(ctx, frame, view)` với
`view = {width,height,progress,time,previous}`. Pack này KHÔNG render chữ
giải thích trên canvas — text dùng tối thiểu cho nhãn/badge, nội dung do shell lo.

## Bằng chứng nguồn (trích verbatim, đã verify line-range ≡ file)

- ROI mask nạp: `two_camera.py:2415-2417`; runtime mask+band: `motion_tracker.py:812-816`; strict support `:876-880`.
- MOG2+threshold `:768-771`; motion-gate ∧ `:790-793`; motion-fill `:1015-1019`.
- `_new_kalman :440-443`; predict toàn-track `:247`; correct `:2118`; thứ tự assign→apply `:2249-2251`.
- Cost init `:1615`; cost 4 hạng `:1761-1766`; `lapjv :1908`; defer `:1946-1951`.
- Decay+stale `:263-269`; unmatched `:2258-2262`; frozen/coasting `:2279-2280`; TTL giây `:2189-2195`.

## Owner verifier

```
cd D:/TechGar2/.analysis/algos-v2
node test-local-pack.mjs        # 586 PASS / 0 FAIL  (pack sha256 6dee1455c790151b, freeze)
```

Assert: registry đúng 5 node; metadata + 4 answers VN; **mọi `refs.excerpt` ≡
vùng source thật tại `excerptStart`**; pseudocode 5-10 dòng; mỗi scenario
build() ≥3 frame deterministic (build×2 ≡); mọi frame đủ
`title/explanation/activeLines⊆pseudocode/state/durationMs/scene` + JSON-safe;
`draw()` chạy trên MỌI frame × progress {0,.5,1} với ctx-stub → ≥1 lệnh vẽ,
không throw, **không mutate frame**, và mỗi scenario có ≥1 frame nội suy theo
`view.progress` (animation thật, không đổi-frame-gán).

## Giới hạn

- Verifier dùng canvas stub — kiểm tra lệnh vẽ phát sinh + nội suy, KHÔNG đo
  đẹp/xấu hay đục độ; QA trình duyệt thật thuộc C.
- Node `capture` thuộc C (system pack) — pack này bắt đầu từ `roi`, giả định
  frame đã có trong view.
- Số liệu scene (pixel count, cost 0.21...) là minh họa được gắn nhãn; ngưỡng
  production (0.40s, 0.25s, cost_limit 0.90, ≥160px/8%, TTL theo giây) trích
  trong refs/answers.
