# REVIEW: voice-guidance (builder-c, Task 9)

OK — không vấn đề.
- Verify 8/8 số khớp: arrival `<35` (voiceGuidance.ts:130 `distToDest < 35`), straight `cos>0.93` (L180, lookahead L212-215 `distToTurn > 150`), speak default cooldown 6000 (L29 `cooldownMs = 6000`), off-route urgent 7000 (App.tsx:762), instruction 6000 non-urgent (App.tsx:783), interrupt-age 2000ms (L48-50), utterance `vi-VN` + `rate 0.95` (L57-58).
- Hai ngưỡng off-route 75-doc/80-code được trình bày đúng như discrepancy thật trong repo.
- Limits hợp lý: isSpeaking-stuck khi thiếu speechSynthesis (CONFIRMED — cancel/utterance giả định API tồn tại), fallback giọng OS (UNSURE đúng mức).
- Figure caption khớp 3 điểm neo câu (thanh chỉ dẫn, bán kính đích, góc cua).
