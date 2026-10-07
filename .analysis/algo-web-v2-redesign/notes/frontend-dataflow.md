# notes/frontend-dataflow.md — Step A bảng nguồn (backfill builder-c, 2026-10-06)

Files đọc: `frontend/src/app/App.tsx`, `api/runtimeApi.ts`, `domain/runtime.ts`,
`adapters/runtimeAdapter.ts`, `calibration/worldToSvg.ts`, `stores/parkingStore.ts`,
`hooks/useVehicleSession.ts`, `domain/sessionParking.ts`. Chi tiết trong page ⑦.

## giá trị → file:dòng → kind
| giá trị | nguồn | kind |
|---|---|---|
| poll snapshot 200 ms (setInterval) | App.tsx:354-360 | runtime |
| timeout fetch 2 s (AbortSignal.timeout) | runtimeApi.ts:13 | runtime |
| backoff sau lỗi 2000 ms reject-ngay | runtimeApi.ts:4-29 | runtime |
| đổi nguồn → mọi ô về unknown + confidence 0 | parkingStore.ts:56-70 | runtime |
| published_at chấp nhận −1000 → +5000 ms | domain/runtime.ts:126-129 | runtime |
| camera age_ms 0–5000, bắt buộc online | domain/runtime.ts:130-139 | runtime |
| frame lùi → throw 'frame cũ hơn frame đã hiển thị' | App.tsx:277-279 | runtime |
| không tiến >5 s → runtimeState error + ô unknown | App.tsx:283-285,313-346 | runtime |
| join ô theo slot_layout/parking_slots slot_id | runtimeAdapter.ts:27-49 | runtime |
| ô thiếu trong snapshot → unknown, confidence 0 | runtimeAdapter.ts:32-40 | runtime |
| alias chain canonicalRuntimeId + visited-set | domain/runtime.ts:191-202 | runtime |
| fit world→SVG cần ≥3 cặp neo | worldToSvg.ts:63 | runtime |
| cache theo JSON.stringify(layout) | worldToSvg.ts:42-51 | runtime |
| chu kỳ nạp gate 1000 ms | App.tsx:404 | runtime |
| fallback không-fit: clamp vào khung SVG | worldToSvg.ts:86-89 | runtime |
| poll session 500 ms, timeout 2 s | useVehicleSession.ts:27,111-114 | runtime |
| action_id crypto.randomUUID + fallback | useVehicleSession.ts:31-35 | runtime |
| reservations poll 500 ms, lỗi giữ overlay cũ | App.tsx:176-191 | runtime |
| auto-claim một lần khi vào trang cá nhân | App.tsx:219-236 | runtime |
| 10 nhánh decision typed union | sessionParking.ts:5-15 | runtime |
| invariant: gid ở >1 ô → identity_invariant_error | sessionParking.ts:48-54 | runtime |
| pending chậm: age_ms >5000 hoặc degraded | sessionParking.ts:63-74 | runtime |
