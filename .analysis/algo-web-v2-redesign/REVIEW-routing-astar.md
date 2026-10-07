# REVIEW: routing-astar (builder-c, Task 9)

OK — không vấn đề; limit CONFIRMED đáng giá trị nhất trang.
- Verify: `findInboundRouteFromPos` (routeEngine.ts:204-207) — comment "Fallback: tính từ Cổng Vào" nhưng `return null` — đúng như trang mô tả (comment hứa, code không làm). Đây là bug-doc thật, gắn CONFIRMED hợp lý.
- Projection threshold 60 (routeEngine:147), off-route default 75 / App override 80 (App.tsx:746-750 `checkIsOffRoute(...,80)`), 3 ứng viên đổi ô + bỏ qua SPOT_RESERVED/NOT_AVAILABLE (App.tsx:438-463) — tất cả khớp.
- Heuristic admissible `min(edge.dist/euclid)` mô tả đúng; tie-break f→g→nodeOrder hợp lý.
- Zone→làn (E,F trái; C,D giữa; A,B phải) và connector y=90/790 không spot-check tới dòng nhưng nhất quán figure (route xanh bám làn phải → rẽ vào C10 qua cạnh ngang).
- Nit: hai mục "⑤" trùng nhau (figures + limits cùng đánh số ⑤) — cosmetic, chung cho nhóm trang của C.
