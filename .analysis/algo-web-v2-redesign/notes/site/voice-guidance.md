# voice-guidance — notes (frontend read-only)

## Nguồn đã đọc
- `frontend/src/routing/voiceGuidance.ts` (231 dòng) — VoiceManager + distanceToSegment + checkIsOffRoute + getNavigationInstruction
- `frontend/src/app/App.tsx` — mọi call site speak()/stop()/setMuted + render navInstruction

## VoiceManager (voiceGuidance.ts:3-70)
- Singleton `voiceManager`, state: lastSpokenText, lastSpokenTime, isMuted, isSpeaking
- `speak(text, cooldownMs=6000, isUrgent=false)` — 4 luật chặn:
  1. muted → return (L33)
  2. cùng text và chưa hết cooldown → return (L36-39)
  3. đang nói và câu mới GIỐNG → return (L42-44)
  4. đang nói, câu khác, không urgent, câu cũ chưa đọc được 2 s → return (L48-50)
- Ngược lại: `speechSynthesis.cancel()` + SpeechSynthesisUtterance vi-VN, rate 0.95, pitch 1.0; onend/onerror → isSpeaking=false (L52-66)
- `setMuted(true)` → cancel ngay (L9-14); `stop()` reset text+speaking (L16-28)
- Lưu ý: không có speechSynthesis (browser cũ) thì isSpeaking vẫn bật true — các câu non-urgent kế <2 s bị skip vô hình (edge case nhỏ)

## checkIsOffRoute (L91-107)
- min distanceToSegment(xe, từng đoạn route) > threshold → off-route
- default thresholdPx = 75; App.tsx:749 truyền **80**
- routePoints < 2 → false (không thể lạc tuyến khi không có tuyến)

## getNavigationInstruction (L114-231)
- Input: vị trí xe, route points, isExit, targetSpotId → string | null
- Bước 1 — đến đích: dist(xe, routePoint cuối) < **35** → câu đến đích theo mode (exit / có spotId / generic) (L126-138)
- Bước 2 — giữa route: tìm closestIndex; nếu 0 < idx < len-1:
  - curVec = prev→current, nextVec = current→next
  - cosAngle = dot/(|cur||next|); **cosAngle > 0.93 (~<20°)** → "Phía trước đi thẳng." (L170-182)
  - cross = curDx*nextDy − curDy*nextDx; **cross > 0 → rẽ phải** (SVG Y xuống), cross ≤ 0 → rẽ trái; câu khác nhau theo isExit (L177-189)
- Bước 3 — đầu route (chưa có prev): quét bộ 3 điểm đầu tìm khúc cua thật (cosA < 0.93); nếu cua xa hơn **150** đơn vị bản đồ → "đi thẳng", ngược lại đọc hướng cua (L194-227)
- Fallback cuối: "Tiếp tục di chuyển theo đường chỉ dẫn." (L230)

## App wiring (App.tsx)
- Mỗi nhịp vị trí xe (effect2): đúng tuyến → route co ngắn theo xe + instruction=speak(instruction, 6000, false) (L769-784)
- Off-route: `speak("Cảnh báo: Bạn đang đi sai tuyến đường chỉ dẫn!", 7000, true)` — urgent nên được quyền cắt câu đang nói (L762)
- Các câu sự kiện urgent khác: auto-reroute (L455), ô bị chiếm (L588), "Đã đỗ xe thành công" (L670)
- voiceManager.stop() khi: đổi mode, dismiss route, unmount… (L629,708,865,875)
- Mute toggle gọi setMuted (L1042-1060)
- navInstruction render: chỉ khi sessionId && !isOffRoute && navInstruction && !isRouteDismissed (L1176-1191)

## Số liệu cho trang
- cooldown: 6000 ms instruction + sự kiện; 7000 ms off-route
- min speech age trước khi bị câu non-urgent cắt: 2000 ms
- arrival radius: 35; turn cos ngưỡng 0.93; lookahead cua 150
- voice: vi-VN, rate 0.95, pitch 1.0
- off-route: 80 (call site) / 75 (default)
