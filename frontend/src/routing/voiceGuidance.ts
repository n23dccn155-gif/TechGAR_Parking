// voiceGuidance.ts - Bộ Hướng dẫn Giọng nói Web Speech API & Cảnh báo Đi Sai Đường

export interface VoiceOptions {
  muted?: boolean;
}

class VoiceManager {
  private lastSpokenText: string = "";
  private lastSpokenTime: number = 0;
  private isMuted: boolean = false;

  public setMuted(muted: boolean) {
    this.isMuted = muted;
    if (muted && typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
  }

  public getMuted(): boolean {
    return this.isMuted;
  }

  public stop() {
    this.lastSpokenText = "";
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      try {
        window.speechSynthesis.cancel();
      } catch {
        /* ignore */
      }
    }
  }

  public speak(text: string, cooldownMs: number = 6000) {
    if (this.isMuted) return;
    const now = Date.now();
    // Tránh lặp lại câu chính xác khi chưa hết thời gian chờ cooldown (đặc biệt ngắt vấp tiếng Cảnh Cảnh...)
    if (text === this.lastSpokenText && now - this.lastSpokenTime < cooldownMs) {
      return;
    }

    this.lastSpokenText = text;
    this.lastSpokenTime = now;

    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      try {
        window.speechSynthesis.cancel(); // Ngắt câu cũ trước khi phát câu mới khác
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = "vi-VN";
        utterance.rate = 1.0;
        utterance.pitch = 1.0;
        window.speechSynthesis.speak(utterance);
      } catch {
        /* ignore */
      }
    }
  }
}

export const voiceManager = new VoiceManager();

/**
 * Tính khoảng cách vuông góc từ điểm (px, py) tới đoạn thẳng (x1,y1)-(x2,y2)
 */
export function distanceToSegment(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number
): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  if (dx === 0 && dy === 0) return Math.hypot(px - x1, py - y1);
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy)));
  const projX = x1 + t * dx;
  const projY = y1 + t * dy;
  return Math.hypot(px - projX, py - projY);
}

/**
 * Kiểm tra xem xe có đi sai tuyến đường không (khoảng cách vượt quá ngưỡng thresholdPx)
 */
export function checkIsOffRoute(
  vehiclePos: { x: number; y: number },
  routePoints: Array<{ x: number; y: number }>,
  thresholdPx: number = 75
): boolean {
  if (!vehiclePos || routePoints.length < 2) return false;
  let minDistance = Number.POSITIVE_INFINITY;
  for (let i = 0; i < routePoints.length - 1; i++) {
    const p1 = routePoints[i];
    const p2 = routePoints[i + 1];
    if (p1 && p2) {
      const d = distanceToSegment(vehiclePos.x, vehiclePos.y, p1.x, p1.y, p2.x, p2.y);
      if (d < minDistance) minDistance = d;
    }
  }
  return minDistance > thresholdPx;
}

/**
 * Tính toán câu lệnh rẽ trái / rẽ phải / đi thẳng dựa trên điểm tiếp theo của lộ trình.
 * Dùng tích có hướng (cross product) giữa hướng xe đang đi và đoạn đường tiếp theo
 * để xác định trái/phải chính xác trong hệ tọa độ SVG (Y tăng xuống dưới).
 */
export function getNavigationInstruction(
  vehiclePos: { x: number; y: number },
  routePoints: Array<{ x: number; y: number }>,
  isExit: boolean = false,
  targetSpotId: string | null = null
): string | null {
  if (!vehiclePos || routePoints.length < 2) return null;

  // 1. Kiểm tra xe đã đến đích chưa (gần điểm cuối < 35px)
  const destPoint = routePoints[routePoints.length - 1];
  if (destPoint) {
    const distToDest = Math.hypot(vehiclePos.x - destPoint.x, vehiclePos.y - destPoint.y);
    if (distToDest < 35) {
      if (isExit) {
        return "Bạn đã đến lối ra. Chúc bạn thượng lộ bình an!";
      } else if (targetSpotId) {
        return `Bạn đã đến vị trí ô đỗ ${targetSpotId}. Vui lòng lùi xe vào đỗ.`;
      } else {
        return "Bạn đã đến điểm đích.";
      }
    }
  }

  // 2. Tìm điểm nút gần xe nhất (= điểm xe đang ở)
  let closestIndex = 0;
  let minDist = Number.POSITIVE_INFINITY;
  for (let i = 0; i < routePoints.length; i++) {
    const pt = routePoints[i];
    if (pt) {
      const d = Math.hypot(vehiclePos.x - pt.x, vehiclePos.y - pt.y);
      if (d < minDist) {
        minDist = d;
        closestIndex = i;
      }
    }
  }

  // 3. Cần ít nhất 3 điểm: prev → current → next để tính góc lệch trái/phải
  if (closestIndex >= 1 && closestIndex < routePoints.length - 1) {
    const pPrev    = routePoints[closestIndex - 1]!;
    const pCurrent = routePoints[closestIndex]!;
    const pNext    = routePoints[closestIndex + 1]!;

    // Vector hướng xe đang đi (từ prev → current)
    const curDx = pCurrent.x - pPrev.x;
    const curDy = pCurrent.y - pPrev.y;

    // Vector hướng đường tiếp theo (từ current → next)
    const nextDx = pNext.x - pCurrent.x;
    const nextDy = pNext.y - pCurrent.y;

    // Tích vô hướng (dot product) để đo độ thẳng
    const dot = curDx * nextDx + curDy * nextDy;
    const lenCur  = Math.hypot(curDx, curDy);
    const lenNext = Math.hypot(nextDx, nextDy);
    const cosAngle = lenCur > 0 && lenNext > 0 ? dot / (lenCur * lenNext) : 1;

    // Tích có hướng 2D (cross product): dương = rẽ phải (SVG Y↓), âm = rẽ trái
    // cross = curDx * nextDy - curDy * nextDx
    const cross = curDx * nextDy - curDy * nextDx;

    // Nếu cos ≈ 1 (góc < ~20°) → đi thẳng
    if (cosAngle > 0.93) {
      return "Phía trước đi thẳng.";
    }

    if (cross > 0) {
      // Trong SVG (Y tăng xuống): cross > 0 → rẽ phải theo chiều thực tế
      return isExit ? "Phía trước rẽ phải ra cổng." : "Phía trước rẽ phải vào làn đỗ.";
    } else {
      return isExit ? "Phía trước rẽ trái ra cổng." : "Phía trước rẽ trái vào làn đỗ.";
    }
  }

  // 4. Fallback khi ở đầu đường (chưa có prev):
  //    Đọc 2 đoạn đầu của route để phát hiện hướng rẽ đầu tiên
  if (closestIndex < routePoints.length - 1) {
    // Tìm đoạn thứ nhất không song song với đoạn gốc (phần thẳng đầu tiên)
    for (let i = 0; i < routePoints.length - 2; i++) {
      const pA = routePoints[i]!;
      const pB = routePoints[i + 1]!;
      const pC = routePoints[i + 2]!;

      const abDx = pB.x - pA.x;
      const abDy = pB.y - pA.y;
      const bcDx = pC.x - pB.x;
      const bcDy = pC.y - pB.y;

      const dot = abDx * bcDx + abDy * bcDy;
      const lenAB = Math.hypot(abDx, abDy);
      const lenBC = Math.hypot(bcDx, bcDy);
      const cosA = lenAB > 0 && lenBC > 0 ? dot / (lenAB * lenBC) : 1;

      // Nếu đây là khúc cua thực sự (góc > ~20°)
      if (cosA < 0.93) {
        const cross = abDx * bcDy - abDy * bcDx;
        if (cross > 0) {
          return isExit ? "Phía trước rẽ phải ra cổng." : "Phía trước rẽ phải vào làn đỗ.";
        } else {
          return isExit ? "Phía trước rẽ trái ra cổng." : "Phía trước rẽ trái vào làn đỗ.";
        }
      }
    }
    return "Phía trước đi thẳng.";
  }

  return "Tiếp tục di chuyển theo đường chỉ dẫn.";
}
