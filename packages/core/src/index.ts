/**
 * @diet/core: typed schemas and every health-sensitive formula used by the phone app and the
 * extension. Each formula is a pure function with unit tests; user-facing health text lives in
 * `src/copy/health.ts` so it can be scanned and reviewed in one place.
 */
export const PACKAGE_NAME = '@diet/core' as const;

export * from './alcohol/standardDrinks';
export * from './copy/template';
export * from './energy/age';
export * from './energy/baseTargets';
export * from './energy/energyEstimate';
export * from './energy/protein';
export * from './fasting/eatingWindow';
export * from './fasting/schedule';
export * from './fasting/windowText';
export * from './garden/cropForm';
export * from './nutrition/confidence';
export * from './nutrition/netCarbs';
export * from './nutrition/nutrients';
export * from './nutrition/portion';
export * from './onboarding/profileForm';
export * from './onboarding/steps';
export * from './readiness/gates';
export * from './storage';
export * from './util/parse';
export * from './util/round';
export * from './util/time';
export * from './weight/bmi';
export * from './weight/trend';
