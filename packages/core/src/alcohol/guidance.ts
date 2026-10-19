/**
 * The New Zealand alcohol guidance figures (HEALTH_SAFETY.md section 5; alcohol.org.nz, bpac) and
 * which set applies (C25, C46; D31). The figures reach the screen only through
 * alcohol.guidance.line, which always ends "No alcohol use is risk-free." (NN-09, C66). Built at
 * item 16 under item 28's names; item 28 adds its comparisons to this file.
 */
import { guidanceSetFor } from '../storage/profileMapping';
import type { AlcoholGuidanceSet, ProfileSex } from '../storage/records';

export interface GuidanceFigures {
  readonly set: AlcoholGuidanceSet;
  readonly perDay: number;
  readonly perWeek: number;
  readonly alcoholFreeDaysPerWeek: number;
}

/** HEALTH_SAFETY.md section 5. Not a validator constant. */
export const NZ_GUIDANCE: Readonly<Record<AlcoholGuidanceSet, GuidanceFigures>> = Object.freeze({
  'nz-women': Object.freeze({
    set: 'nz-women',
    perDay: 2,
    perWeek: 10,
    alcoholFreeDaysPerWeek: 2,
  }),
  'nz-men': Object.freeze({ set: 'nz-men', perDay: 3, perWeek: 15, alcoholFreeDaysPerWeek: 2 }),
});

/** Why the set applies: the profile's sex, no sex entered (women's), or the women's set chosen. */
export type GuidanceBasis = 'profile' | 'no-sex' | 'chosen';

/** The stricter of the setting and the profile's sex; a missing sex counts as women's. */
export function guidanceFor(
  sex: ProfileSex | null,
  setting: AlcoholGuidanceSet | null,
): GuidanceFigures & { readonly basis: GuidanceBasis } {
  const basis: GuidanceBasis =
    sex === null ? 'no-sex' : sex === 'male' && setting === 'nz-women' ? 'chosen' : 'profile';
  return { ...NZ_GUIDANCE[guidanceSetFor(sex, setting)], basis };
}
