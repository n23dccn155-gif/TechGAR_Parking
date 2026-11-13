/**
 * Tóm tắt cảnh báo của một lần chạy, tính **theo luồng** (P17n).
 *
 * Trước đây xuất và UI đều giữ toàn bộ `SimState` rồi duyệt lại (O(n²) khi live, 90.000 state khi
 * xuất 60 phút ⇒ tràn RAM). Lớp này nhận từng state đúng một lần và chỉ giữ cảnh báo
 * (`ghost_pass`, `park_clip`, `park_clip_escalated`), nên bộ nhớ ∝ số cảnh báo chứ không ∝ số frame.
 */

import type { SimState, Warning } from '../contracts/sim';

/** Cảnh báo `park_clip` / `park_clip_escalated` của cả lần chạy (chỉ cảnh báo, không giữ state). */
export class ParkClipLog {
  readonly parkClip: Warning[] = [];
  readonly escalated: Warning[] = [];

  push(state: SimState): void {
    for (const warning of state.warnings) {
      if (warning.kind === 'park_clip') {
        this.parkClip.push(warning);
      } else if (warning.kind === 'park_clip_escalated') {
        this.escalated.push(warning);
      }
    }
  }
}
