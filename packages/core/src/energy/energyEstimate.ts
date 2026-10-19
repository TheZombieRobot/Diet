import { KJ_PER_KCAL } from '../nutrition/nutrients';
import { assertInRange } from '../util/round';

/**
 * Activity factors (DATA_MODEL.md). The default is 'active-job': a physically demanding job with
 * a high daily step count is real activity, not sedentary (HEALTH_SAFETY.md section 4).
 */
export const ACTIVITY_FACTORS = {
  sedentary: 1.2,
  moderate: 1.55,
  'active-job': 1.725,
  'very-active': 1.9,
} as const;

export type ActivityLevel = keyof typeof ACTIVITY_FACTORS;

export const DEFAULT_ACTIVITY_LEVEL: ActivityLevel = 'active-job';

/**
 * Sex used for the energy estimate. Mifflin-St Jeor has a male and a female constant;
 * 'unspecified' uses the midpoint of the two.
 */
export type EstimateSex = 'male' | 'female' | 'unspecified';

const SEX_CONSTANT_KCAL: Record<EstimateSex, number> = {
  male: 5,
  female: -161,
  unspecified: -78,
};

export interface EnergyInputs {
  weightKg: number;
  heightCm: number;
  /** The equation was developed for adults; the app does not estimate energy under 18. */
  ageYears: number;
  sex: EstimateSex;
  activity: ActivityLevel;
}

/**
 * Resting energy by the Mifflin-St Jeor equation, in kcal/day:
 * 10 × kg + 6.25 × cm − 5 × age + (5 male, −161 female).
 */
export function restingEnergyKcal({ weightKg, heightCm, ageYears, sex }: EnergyInputs): number {
  assertInRange('weightKg', weightKg, 30, 350);
  assertInRange('heightCm', heightCm, 120, 230);
  assertInRange('ageYears', ageYears, 18, 110);
  return 10 * weightKg + 6.25 * heightCm - 5 * ageYears + SEX_CONSTANT_KCAL[sex];
}

export interface EnergyEstimate {
  kcal: number;
  kj: number;
  /** Always shown with the estimate: it is a rough guide, not a measurement. */
  label: 'rough guide';
}

/** Estimated daily energy = resting energy × activity factor, rounded to whole units. */
export function estimatedDailyEnergy(inputs: EnergyInputs): EnergyEstimate {
  const kcal = restingEnergyKcal(inputs) * ACTIVITY_FACTORS[inputs.activity];
  return { kcal: Math.round(kcal), kj: Math.round(kcal * KJ_PER_KCAL), label: 'rough guide' };
}
