import { describe, expect, it } from 'vitest';
import lotJson from '../../../data/lot/lot_pucpr.json';
import fixturesJson from './fixtures/parking-cases.json';
import type { LotMap } from '../contracts/lot';
import type { CarState, SimState } from '../contracts/sim';
import { findCollisionPairs } from './collision';
import { advanceSimState } from './engine';
import { planParkingManeuver } from './maneuverPlanner';
import { buildExitRoute, roadNetworkOf } from './network';

const lot = lotJson as unknown as LotMap;
const cases = fixturesJson as unknown as Record<string, { carId: string; cars: CarState[] }>;
const exitIds: Record<string, string> = { A3: 'V026', B1: 'V016', A2: 'V003' };

describe('quỹ đạo rẽ rộng quanh xe đỗ', () => {
  for (const name of ['A3', 'B1', 'A2']) {
    for (const mode of ['entry', 'exit'] as const) {
      it(`${name}: ${mode} đi hết thao tác, xuyên không quá 2 cm`, { timeout: 30000 }, () => {
        const fixture = cases[name];
        const id = mode === 'entry' ? fixture.carId : exitIds[name];
        const selected = fixture.cars.find((car) => car.id === id)!;
        const slot = lot.slots.find((value) => value.id === selected.slot)!;
        const original = mode === 'exit' ? buildExitRoute(lot, roadNetworkOf(lot), slot, 3) : selected.route;
        expect(original).toBeTruthy();
        const subject: CarState = { ...selected, state: mode === 'entry' ? 'driving_to_slot' : 'leaving_slot', route: original!, route_s: mode === 'entry' ? selected.route_s : 0, v: mode === 'entry' ? selected.v : 0 };
        const cars = fixture.cars.filter((car) => car.state === 'parked' && car.id !== id);
        const route = planParkingManeuver(subject, slot, [...cars, subject], mode);
        expect(route).not.toBeNull();
        if (route === null) return;
        let state: SimState = { frame: 0, cars: [...cars, { ...subject, route, route_s: 0 }], reservations: [], warnings: [], rngState: {} as SimState['rngState'] };
        let depth = 0;
        let finished = false;
        for (let frame = 0; frame < 1500; frame += 1) {
          state = advanceSimState(lot, state, { frame: state.frame, events: [] }, 0.04);
          for (const pair of findCollisionPairs(state.cars, 0)) {
            if (pair.a.id === id || pair.b.id === id) depth = Math.max(depth, pair.depth_m);
          }
          const current = state.cars.find((car) => car.id === id)!;
          if (mode === 'entry' ? current.state === 'parked' : current.state === 'driving_to_exit' && (current.route_s ?? 0) > (route.maneuver_end_s ?? 0) + 2) {
            finished = true;
            break;
          }
        }
        expect(depth).toBeLessThanOrEqual(0.02);
        expect(finished).toBe(true);
      });
    }
  }
});
