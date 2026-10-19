/**
 * How stored profile values map to the core functions that use them (storage spec section 4.4;
 * C10, C24 point 4, C25, C46, HS-05; D31).
 */
import type { EstimateSex } from '../energy/energyEstimate';
import type { AlcoholGuidanceSet, ProfileSex } from './records';

/**
 * The energy estimate's sex. Until sex is entered (item 13 requires it before onboarding
 * completes), the midpoint constant ('unspecified') is used, which C24 point 4 and C25 allow, so a
 * day energy target exists for the single-meal check (C10).
 */
export function estimateSexOf(sex: ProfileSex | null): EstimateSex {
  return sex ?? 'unspecified';
}

/**
 * The alcohol guidance set that applies: the stricter of the setting and the set for the profile's
 * sex, where a missing sex counts as women's (C24 point 4, C46). The women's figures are the
 * stricter, so the men's set applies only when both the profile and the setting allow it.
 */
export function guidanceSetFor(
  sex: ProfileSex | null,
  setting: AlcoholGuidanceSet | null,
): AlcoholGuidanceSet {
  const fromProfile: AlcoholGuidanceSet = sex === 'male' ? 'nz-men' : 'nz-women';
  return fromProfile === 'nz-men' && (setting === null || setting === 'nz-men')
    ? 'nz-men'
    : 'nz-women';
}
