/**
 * The New Zealand alcohol guidance figures (HEALTH_SAFETY.md section 5; alcohol.org.nz, bpac) and
 * which set applies (C25, C46; D31). The figures reach the screen only through
 * alcohol.guidance.line, which always ends "No alcohol use is risk-free." (NN-09, C66). Built at
 * item 16 under item 28's names; item 28 adds its comparisons to this file.
 */
import { guidanceSetFor } from '../storage/profileMapping';
import type { ReadinessGates } from '../storage/readiness';
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

/** The guidance a screen shows: the figures of a set, or the pregnancy line with none. */
export type GuidanceShown =
  { readonly kind: 'guidance'; readonly set: AlcoholGuidanceSet } | { readonly kind: 'pregnancy' };

/**
 * Which guidance to show (full review F30). With readiness answer 2 "yes" or unanswered the
 * daily and weekly figures are not shown at all: NZ guidance in pregnancy and while breastfeeding
 * is not to drink, so the figures would read as an allowance (HEALTH_SAFETY section 5, NN-09).
 * Otherwise the set guidanceFor picks.
 */
export function guidanceShown(
  sex: ProfileSex | null,
  setting: AlcoholGuidanceSet | null,
  gates: Pick<ReadinessGates, 'reasons'>,
): GuidanceShown {
  if (gates.reasons.includes('pregnant-or-breastfeeding')) return { kind: 'pregnancy' };
  return { kind: 'guidance', set: guidanceFor(sex, setting).set };
}
