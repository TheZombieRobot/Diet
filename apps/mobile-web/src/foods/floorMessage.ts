/**
 * The planner's message for a day whose energy is not fully known and whose known part is below
 * the owner's floor (item 18 design 3.8; HS-10, C108). Item 22 shows it; the decision is core's
 * floorCheckWithUnknowns. Item 21's "it would come to under 5,000 kJ" is never used for such a
 * day, because it would be untrue.
 */
import { fillTemplate, type FloorCheckWithUnknowns, formatNumber } from '@diet/core';
import { foods } from '@diet/core/copy/health';
import { formatAboutKcal } from '../format';

/** The message for an 'energy-not-known' result, filled from the floor the check used; else null. */
export function energyNotKnownMessage(result: FloorCheckWithUnknowns): string | null {
  const values = {
    floorKj: formatNumber(result.floorKj),
    floorKcal: formatAboutKcal(result.floorKj),
  };
  if (!result.ok && result.reason === 'energy-not-known')
    return fillTemplate(foods.planner.energyNotKnown, values);
  if (result.ok && result.note === 'energy-not-known')
    return fillTemplate(foods.planner.energyNotKnownOwner, values);
  return null;
}
