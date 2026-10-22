/**
 * The planner's floor check when some food energy is not known (HS-10, HS-25, NU-06, C108; item 18
 * design 3.8). An app-made day whose energy is incomplete and whose known part is below the
 * owner's effective floor is refused: the app cannot check that it reaches the floor, so it never
 * writes it. The owner may still plan their own meal, with a note. A known part at or above the
 * floor is allowed, since a lower bound that meets the floor can only be higher. Item 21's
 * "it would come to under 5,000 kJ" is never said of an incomplete day, because it would be untrue.
 */
import { floorCheck, type PlanWriteKind } from '../targets/energy';

export type FloorCheckWithUnknowns =
  | { readonly ok: true; readonly note: null; readonly floorKj: number }
  /** owner-meal only. */
  | {
      readonly ok: true;
      readonly note: 'below-floor' | 'energy-not-known';
      readonly floorKj: number;
    }
  | {
      readonly ok: false;
      readonly reason: 'below-floor' | 'energy-not-known';
      readonly floorKj: number;
    };

export function floorCheckWithUnknowns(
  knownFoodKj: number,
  foodEnergyIncomplete: boolean,
  storedFloorKj: number,
  kind: PlanWriteKind,
): FloorCheckWithUnknowns {
  const base = floorCheck(knownFoodKj, storedFloorKj, kind);
  const { floorKj } = base;
  if (base.ok && !base.belowFloor) return { ok: true, note: null, floorKj };
  if (!foodEnergyIncomplete) {
    return base.ok
      ? { ok: true, note: 'below-floor', floorKj }
      : { ok: false, reason: 'below-floor', floorKj };
  }
  // Incomplete and below the floor: only the owner's own meal is written (base.ok is that case).
  return base.ok
    ? { ok: true, note: 'energy-not-known', floorKj }
    : { ok: false, reason: 'energy-not-known', floorKj };
}
