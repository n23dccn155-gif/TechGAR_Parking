# notes/voice-guidance.md — Step A bảng nguồn (backfill builder-c, 2026-10-06)

Files đọc: `frontend/src/routing/voiceGuidance.ts`, `app/App.tsx`.
Chi tiết trong `js/pages/voice-guidance.js` ⑦.

## giá trị → file:dòng → kind
| giá trị | nguồn | kind |
|---|---|---|
| bán kính đến đích <35 đơn vị bản đồ | voiceGuidance.ts:126-138 | runtime |
| ngưỡng 'đi thẳng' cos > 0.93 (~<20°) | voiceGuidance.ts:170-182 | runtime |
| trái/phải = dấu tích có hướng, trục Y-xuống | voiceGuidance.ts:177-189 | runtime |
| lookahead khúc cua ≤150 đơn vị bản đồ | voiceGuidance.ts:213-218 | runtime |
| off-route thực thi 80 (App override default 75) | App.tsx:746-750 + voiceGuidance.ts:98 | runtime |
| độ đo off-route: min khoảng cách vuông góc tới đoạn | voiceGuidance.ts:91-107 | runtime |
| cooldown câu thường 6000 ms | App.tsx:783 | runtime |
| cooldown cảnh báo lạc tuyến 7000 ms | App.tsx:762 | runtime |
| tuổi tối thiểu để câu non-urgent bị cắt 2000 ms | voiceGuidance.ts:48-50 | runtime |
| giọng vi-VN, rate 0.95, pitch 1.0 (Web Speech API) | voiceGuidance.ts:57-60 | runtime |
| speak cooldown default trong hàm 6000 ms | voiceGuidance.ts:31 | runtime |
| speak queue: urgent cắt non-urgent đủ tuổi | voiceGuidance.ts:74-107 | runtime |
