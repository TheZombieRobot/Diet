import { type LocalDate, parseLocalDate } from '../util/time';

/** Earliest birth year the profile accepts. */
export const EARLIEST_BIRTH_YEAR = 1900;

function yearsSinceBirthYear(birthYear: number, today: LocalDate): number {
  const year = new Date(parseLocalDate(today)).getUTCFullYear();
  if (!Number.isInteger(birthYear) || birthYear < EARLIEST_BIRTH_YEAR || birthYear > year) {
    throw new RangeError(
      `birthYear must be a whole year from ${EARLIEST_BIRTH_YEAR} to ${year}, got ${birthYear}`,
    );
  }
  return year - birthYear;
}

/**
 * The youngest the owner can be on `today`. The profile stores the birth year only
 * (DATA_MODEL.md), so before this year's birthday they are a year younger than the year
 * difference: today's year − birth year − 1, and never below 0. Use this for the under-18 rule
 * (HEALTH_SAFETY.md section 1), so someone who may still be 17 is treated as under 18.
 */
export function minimumAgeFromBirthYear(birthYear: number, today: LocalDate): number {
  return Math.max(0, yearsSinceBirthYear(birthYear, today) - 1);
}

/** The oldest the owner can be on `today`: today's year − birth year (birthday already passed). */
export function maximumAgeFromBirthYear(birthYear: number, today: LocalDate): number {
  return yearsSinceBirthYear(birthYear, today);
}
