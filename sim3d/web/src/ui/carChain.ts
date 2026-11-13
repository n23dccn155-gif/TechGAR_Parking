/**
 * P19c (ANS_38 mục C) — **vì sao xe đang chờ**, suy ra gọn cho UI.
 *
 * Không đọc `setWaitSink` (hook chỉ để chẩn đoán trong test): chỉ dùng các trường engine đã ghi vào
 * `CarState` mỗi frame — `state`, `still_frames`, `blocked_by`, `back_demand`, `leader_id`.
 *
 * Hàm thuần, không phụ thuộc React.
 */

import type { CarState } from '../contracts/sim';

/** Ngưỡng coi là "đang đứng chờ" (cùng ngưỡng cảnh báo kẹt G1: 10 s @ 25 fps). */
export const WAIT_FRAMES = 250;

export interface WaitReason {
  /** Nhãn ngắn hiện trong danh sách xe. */
  readonly label: string;
  /** Câu giải thích đầy đủ (tooltip). */
  readonly detail: string;
  /** `true` khi đã vượt ngưỡng kẹt 10 s — UI tô đỏ. */
  readonly isStall: boolean;
}

/** Trạng thái đứng yên là **đúng ý đồ**, không phải chờ. */
const IDLE_STATES: ReadonlySet<string> = new Set(['parked', 'queued', 'exited']);

/**
 * Lý do chờ của một xe, hoặc `null` nếu xe không chờ gì (đang chạy / đỗ yên hợp lệ).
 *
 * Thứ tự xét phản ánh đúng thứ tự engine quyết định dừng:
 * 1. `parked` + đã tới giờ rời ô ⇒ chờ **khe** để lùi ra (luật 1);
 * 2. xe đang vào ô / lùi ra mà chưa có vùng ⇒ chờ **cấp vùng**;
 * 3. `blocked_by` ⇒ bị **thân xe** phía sau chặn (cần lùi nhường);
 * 4. `back_demand` ⇒ được yêu cầu lùi nhưng **chưa lùi được**;
 * 5. `leader_id` ⇒ chờ **xe trước** trên cùng chuỗi làn;
 * 6. còn lại: đứng yên quá ngưỡng ⇒ "chờ chưa rõ".
 */
export function waitReasonOf(
  car: CarState,
  frame: number,
): WaitReason | null {
  if (IDLE_STATES.has(car.state)) {
    // `parked` mà đã quá giờ rời ô thì đang chờ khe lùi ra — đây là chờ THẬT.
    if (car.state === 'parked' && car.park_until_frame !== undefined && frame >= car.park_until_frame) {
      const waited = Math.max(0, frame - car.park_until_frame);
      return {
        label: 'chờ khe ra',
        detail:
          `Đã tới giờ rời ô nhưng chưa có khoảng trống trên làn để lùi ra ` +
          `(chờ ${(waited / 25).toFixed(1)} s).`,
        isStall: waited > WAIT_FRAMES,
      };
    }
    return null;
  }

  const still = car.still_frames ?? 0;
  const isStall = still > WAIT_FRAMES;
  const seconds = (still / 25).toFixed(1);

  if ((car.state === 'leaving_slot' || car.state === 'parking_in') && still > 0) {
    return {
      label: 'chờ cấp vùng',
      detail: `${car.state === 'leaving_slot' ? 'Lùi ra' : 'Vào ô'} đang chờ được cấp vùng quét (${seconds} s).`,
      isStall,
    };
  }

  if (car.blocked_by !== undefined) {
    return {
      label: `bị ${car.blocked_by} chặn`,
      detail: `Thân xe ${car.blocked_by} đang nằm sau nên xe này không lùi được (${seconds} s).`,
      isStall,
    };
  }

  if (car.back_demand === true) {
    return {
      label: 'cần lùi, chưa được',
      detail: `Được yêu cầu lùi để nhường nhưng phía sau còn xe, nên cả hai cùng phải chờ (${seconds} s).`,
      isStall,
    };
  }

  if (car.leader_id !== undefined && still > 0) {
    return {
      label: `chờ ${car.leader_id}`,
      detail: `Chờ xe ${car.leader_id} đi trước trên cùng chuỗi làn (${seconds} s).`,
      isStall,
    };
  }

  if (still > 0) {
    return { label: 'đứng yên', detail: `Đứng yên ${seconds} s.`, isStall };
  }
  return null;
}

/** Chuỗi leader → follower quanh một xe, suy từ `leader_id`/`follower_id`. */
export interface ChainInfo {
  /** Xe ngay trước (nếu có). */
  readonly leader: string | null;
  /** Xe ngay sau (nếu có). */
  readonly follower: string | null;
}

export function chainOf(car: CarState): ChainInfo {
  return { leader: car.leader_id ?? null, follower: car.follower_id ?? null };
}
