/**
 * P19c (ANS_38 mục C) — lý do chờ / chuỗi leader-follower suy từ `CarState`.
 */
import { describe, expect, it } from 'vitest';
import type { CarState } from '../contracts/sim';
import { chainOf, waitReasonOf, WAIT_FRAMES } from './carChain';

function car(overrides: Partial<CarState> = {}): CarState {
  return {
    id: 'V001',
    model: 'sedan',
    color: 'white',
    length: 4.6,
    width: 1.8,
    scale: 1.1,
    pose: { x: 0, y: 0, th: 0 },
    v: 0,
    state: 'driving_to_slot',
    slot: 'S001',
    ...overrides,
  };
}

describe('waitReasonOf — lý do chờ cho UI', () => {
  it('xe đang chạy thì không có lý do chờ', () => {
    expect(waitReasonOf(car({ v: 2 }), 1000)).toBeNull();
  });

  it('parked chưa tới giờ rời là đứng yên hợp lệ, không phải chờ', () => {
    expect(waitReasonOf(car({ state: 'parked', v: 0, still_frames: 900 }), 1000)).toBeNull();
  });

  it('parked đã quá giờ rời ⇒ chờ khe ra, và báo kẹt khi quá ngưỡng', () => {
    const parked = car({ state: 'parked', v: 0, park_until_frame: 500 });
    const fresh = waitReasonOf(parked, 600);
    expect(fresh?.label).toBe('chờ khe ra');
    expect(fresh?.isStall).toBe(false);
    const stalled = waitReasonOf(parked, 500 + WAIT_FRAMES + 50);
    expect(stalled?.isStall).toBe(true);
  });

  it('leaving_slot đứng yên ⇒ chờ cấp vùng', () => {
    const reason = waitReasonOf(car({ state: 'leaving_slot', v: 0, still_frames: 40 }), 1000);
    expect(reason?.label).toBe('chờ cấp vùng');
    expect(reason?.isStall).toBe(false);
  });

  it('chờ cấp vùng quá 10 s thì đánh dấu kẹt', () => {
    const reason = waitReasonOf(
      car({ state: 'leaving_slot', v: 0, still_frames: WAIT_FRAMES + 1 }),
      1000,
    );
    expect(reason?.isStall).toBe(true);
  });

  it('blocked_by được ưu tiên hơn leader', () => {
    const reason = waitReasonOf(
      car({ state: 'driving_to_exit', v: 0, still_frames: 60, blocked_by: 'V009', leader_id: 'V008' }),
      1000,
    );
    expect(reason?.label).toBe('bị V009 chặn');
  });

  it('back_demand ⇒ cần lùi nhưng chưa lùi được', () => {
    const reason = waitReasonOf(
      car({ state: 'driving_to_exit', v: 0, still_frames: 60, back_demand: true }),
      1000,
    );
    expect(reason?.label).toBe('cần lùi, chưa được');
  });

  it('leader_id ⇒ chờ xe đi trước', () => {
    const reason = waitReasonOf(
      car({ state: 'driving_to_slot', v: 0, still_frames: 60, leader_id: 'V004' }),
      1000,
    );
    expect(reason?.label).toBe('chờ V004');
    expect(reason?.detail).toContain('V004');
  });

  it('xe đứng yên không rõ lý do vẫn có nhãn', () => {
    const reason = waitReasonOf(car({ state: 'entering', v: 0, still_frames: 300 }), 1000);
    expect(reason?.label).toBe('đứng yên');
    expect(reason?.isStall).toBe(true);
  });
});

describe('chainOf — chuỗi leader/follower', () => {
  it('trả null khi engine không ghi', () => {
    expect(chainOf(car())).toEqual({ leader: null, follower: null });
  });

  it('trả đúng id khi có', () => {
    expect(chainOf(car({ leader_id: 'V002', follower_id: 'V003' }))).toEqual({
      leader: 'V002',
      follower: 'V003',
    });
  });
});
