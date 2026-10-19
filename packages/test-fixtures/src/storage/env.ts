/**
 * A deterministic environment for storage tests: a fixed clock, a fixed zone and numbered ids.
 * Ids are synthetic UUID v4s, numbered from `firstId`, so tests never depend on randomness.
 */
import type { Instant, MigrationEnv } from '@diet/core';
import { fixtureId } from './snapshotV1';

export function fixtureEnv(
  now: Instant = '2000-03-01T00:00:00.000Z',
  timeZone = 'Pacific/Auckland',
  firstId = 50_000,
): MigrationEnv {
  let next = firstId;
  return {
    now,
    timeZone,
    randomId: () => fixtureId(next++),
  };
}

/** A synthetic backup phrase with spaces (so the assigned-secret scan rule does not fire). */
export const SYNTHETIC_PHRASE = 'synthetic example phrase for tests';
