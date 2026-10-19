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

const SEX_CONSTANT_KCAL: Readonly<Record<EstimateSex, number>> = {
  male: 5,
  female: -161,
  unspecified: -78,
};

/**
 * Own-property lookups, so a value from storage or a form that is not one of the listed keys
 * ('active_job', undefined, or an inherited name such as 'toString') is refused instead of
 * turning the estimate into NaN, which passes every energy-floor comparison.
 */
function sexConstantKcal(sex: EstimateSex): number {
  if (!Object.hasOwn(SEX_CONSTANT_KCAL, sex)) {
    throw new RangeError(`sex must be male, female or unspecified, got ${JSON.stringify(sex)}`);
  }
  return SEX_CONSTANT_KCAL[sex];
}

function activityFactor(activity: ActivityLevel): number {
  if (!Object.hasOwn(ACTIVITY_FACTORS, activity)) {
    const known = Object.keys(ACTIVITY_FACTORS).join(', ');
    throw new RangeError(`activity must be one of ${known}, got ${JSON.stringify(activity)}`);
  }
  return ACTIVITY_FACTORS[activity];
}

function assertFiniteKcal(name: string, kcal: number): number {
  if (!Number.isFinite(kcal)) throw new RangeError(`${name} is not a finite number`);
  return kcal;
}

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
  const kcal = 10 * weightKg + 6.25 * heightCm - 5 * ageYears + sexConstantKcal(sex);
  return assertFiniteKcal('resting energy', kcal);
}

export interface EnergyEstimate {
  kcal: number;
  kj: number;
  /** Always shown with the estimate: it is a rough guide, not a measurement. */
  label: 'rough guide';
}

/** Estimated daily energy = resting energy × activity factor, rounded to whole units. */
export function estimatedDailyEnergy(inputs: EnergyInputs): EnergyEstimate {
  const kcal = assertFiniteKcal(
    'daily energy',
    restingEnergyKcal(inputs) * activityFactor(inputs.activity),
  );
  return { kcal: Math.round(kcal), kj: Math.round(kcal * KJ_PER_KCAL), label: 'rough guide' };
}
