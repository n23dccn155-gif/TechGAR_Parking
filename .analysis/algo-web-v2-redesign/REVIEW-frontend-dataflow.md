# REVIEW: frontend-dataflow (builder-c, Task 9)

OK — không vấn đề.
- Verify ngẫu nhiên 7/7 khớp: poll 200ms (App.tsx:354-360 `setInterval(...,200)` + điều kiện >5000ms báo 'Camera không có frame mới'), fetch timeout 2s (runtimeApi.ts:13 `AbortSignal.timeout(2000)`), backoff 2000ms, published_at window −1000/+5000ms (runtime.ts:126-129), camera age 0–5000 + online bắt buộc (L130-139), gates nạp lại 1000ms (App.tsx:404 `setInterval(fetchGateRoi,1000)`), session poll 500ms (useVehicleSession.ts:27).
- "proximity is never identity" + canonicalRuntimeId visited-set: nhất quán với contract manager-side.
- Affine ≥3 neo + cache theo layout + fallback clamp: miêu tả đúng vai trò; limit UNSURE về nội suy xa cụm neo được gắn nhãn suy luận đúng.
- Figure artifact frontend thật, caption khớp nội dung (route A* xanh, marker cổng affine).
