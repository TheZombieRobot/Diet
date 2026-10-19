/**
 * The saturated-fat budget and the fibre and water guides (HEALTH_SAFETY section 4; C70, C71;
 * HS-09; item 21 design section 3.6; T10, T12). Going over the budget only changes a bar's colour;
 * nothing here judges intake.
 */
import type { ProfileSex } from '../storage/records';
import { FAT_KJ_PER_G, FIBRE_GUIDE_NRV_G, WATER_GUIDE_NRV_ML } from './constants';
import type { DayEnergy } from './energy';
import { safeFibreOverrideG, safeSatFatPct, safeWaterOverrideMl } from './sanitize';

export type SatFatBudget =
  | {
      readonly kind: 'budget';
      readonly grams: number;
      readonly pct: number;
      /** The day's energy target it was worked out from. */
      readonly fromKj: number;
    }
  | { readonly kind: 'none' };

/**
 * The budget in whole grams, rounded down (T10): the day's planned energy (after the deficit and
 * the floor, never the estimate; C71) × the budget % ÷ 37 kJ per g. With no energy target there is
 * no budget.
 */
export function saturatedFatBudget(energy: DayEnergy, storedPct: number): SatFatBudget {
  if (energy.kind !== 'target') return { kind: 'none' };
  const pct = safeSatFatPct(storedPct);
  return {
    kind: 'budget',
    grams: Math.floor((energy.targetKj * pct) / 100 / FAT_KJ_PER_G),
    pct,
    fromKj: energy.targetKj,
  };
}

/** The NRV figure by sex; with no sex entered (only before setup completes) the higher one (T12). */
const bySex = (nrv: { readonly male: number; readonly female: number }, sex: ProfileSex | null) =>
  sex === 'female' ? nrv.female : nrv.male;

/** The fibre guide: the owner's own (10–70 g), or the NRV adequate intake, 30 g men and 25 g women (C70). */
export function fibreGuide(
  sex: ProfileSex | null,
  storedOverrideG: number | null,
): { readonly grams: number; readonly source: 'owner' | 'nrv' } {
  const own = safeFibreOverrideG(storedOverrideG);
  return own === null
    ? { grams: bySex(FIBRE_GUIDE_NRV_G, sex), source: 'nrv' }
    : { grams: own, source: 'owner' };
}

/** The water guide: the owner's own (1,000–6,000 mL), or 2,600 mL men and 2,100 mL women (C70). */
export function waterGuide(
  sex: ProfileSex | null,
  storedOverrideMl: number | null,
): { readonly ml: number; readonly source: 'owner' | 'nrv' } {
  const own = safeWaterOverrideMl(storedOverrideMl);
  return own === null
    ? { ml: bySex(WATER_GUIDE_NRV_ML, sex), source: 'nrv' }
    : { ml: own, source: 'owner' };
}
